/**
 * GET /api/usage/cost — USD cost rollup over the API-usage ledger (v7.363)
 *
 * Reads the REAL, measured input/output token counts recorded per call in
 * `api_usage.meta` and multiplies them by PUBLISHED provider list rates
 * (lib/usage/pricing.ts) to produce a per-project and grand-total USD figure.
 *
 * Constitution Art. I.5a: the token counts are real source rows; the multiplier
 * is a named, sourced list rate; the dollar figure is a LABELED computed
 * estimate at list price, NOT the actual invoice (provider dashboards remain
 * the billing source of truth — I.1/I.5). Plan-dependent providers (Semrush
 * units, SerpAPI searches) and count-only rows (OpenAI images) come back
 * UNPRICED with a reason rather than a guessed number.
 *
 * Read-only. Fault-tolerant: an un-migrated table yields an empty rollup.
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { apiUsage, projects } from '@/db/schema';
import { sql, eq } from 'drizzle-orm';
import { ensureUsageTable } from '@/lib/usage/record';
import { priceLine, RATE_CARD, PRICING_ASOF } from '@/lib/usage/pricing';

export const dynamic = 'force-dynamic';

interface ModelCost {
  provider: string; endpoint: string; unit: string;
  inputTokens: number; outputTokens: number; quantity: number; calls: number;
  priced: boolean; costUSD: number; rateLabel: string | null; reason?: string;
}
interface UnpricedLine { provider: string; unit: string; quantity: number; calls: number; reason: string; }
interface ProjectCost {
  projectId: string | null; projectName: string;
  costUSD: number; models: ModelCost[]; unpriced: UnpricedLine[];
}

export async function GET() {
  try {
    await ensureUsageTable();

    // One row per (project, provider, model, unit): real measured token sums.
    const grouped = await db
      .select({
        projectId:    apiUsage.projectId,
        projectName:  projects.clientName,
        provider:     apiUsage.provider,
        endpoint:     apiUsage.endpoint,
        unit:         apiUsage.unit,
        inputTokens:  sql<number>`coalesce(sum((${apiUsage.meta} ->> 'inputTokens')::numeric), 0)`,
        outputTokens: sql<number>`coalesce(sum((${apiUsage.meta} ->> 'outputTokens')::numeric), 0)`,
        quantity:     sql<number>`coalesce(sum(${apiUsage.quantity}), 0)`,
        calls:        sql<number>`count(*)`,
      })
      .from(apiUsage)
      .leftJoin(projects, eq(projects.id, apiUsage.projectId))
      .where(eq(apiUsage.kind, 'usage'))   // baselines carry no token split — exclude from cost math
      .groupBy(apiUsage.projectId, projects.clientName, apiUsage.provider, apiUsage.endpoint, apiUsage.unit);

    const projMap = new Map<string, ProjectCost>();
    let grandTotalUSD = 0;

    for (const r of grouped) {
      const pid = r.projectId ?? '__unattributed__';
      let entry = projMap.get(pid);
      if (!entry) {
        entry = {
          projectId: r.projectId ?? null,
          projectName: r.projectId ? (r.projectName ?? 'Unknown project') : 'Unattributed',
          costUSD: 0, models: [], unpriced: [],
        };
        projMap.set(pid, entry);
      }

      const inputTokens  = Number(r.inputTokens)  || 0;
      const outputTokens = Number(r.outputTokens) || 0;
      const quantity     = Number(r.quantity)     || 0;
      const calls        = Number(r.calls)        || 0;

      const priced = priceLine({
        provider: r.provider, endpoint: r.endpoint, unit: r.unit,
        inputTokens, outputTokens, quantity,
      });

      if (priced.priced) {
        entry.models.push({
          provider: r.provider, endpoint: r.endpoint, unit: r.unit,
          inputTokens, outputTokens, quantity, calls,
          priced: true, costUSD: priced.costUSD, rateLabel: priced.rateLabel,
        });
        entry.costUSD += priced.costUSD;
        grandTotalUSD += priced.costUSD;
      } else {
        // Fold unpriced rows by provider+unit so the panel can show the honest gap.
        const key = `${r.provider}|${r.unit}`;
        let u = entry.unpriced.find(x => `${x.provider}|${x.unit}` === key);
        if (!u) {
          u = { provider: r.provider, unit: r.unit, quantity: 0, calls: 0, reason: priced.reason ?? 'unpriced' };
          entry.unpriced.push(u);
        }
        u.quantity += quantity;
        u.calls += calls;
      }
    }

    const projectsOut = Array.from(projMap.values())
      .map(p => ({ ...p, models: p.models.sort((a, b) => b.costUSD - a.costUSD) }))
      .sort((a, b) => {
        if (a.projectId === null) return 1;   // Unattributed last
        if (b.projectId === null) return -1;
        return b.costUSD - a.costUSD;          // biggest spend first
      });

    return NextResponse.json({
      asOf: new Date().toISOString(),
      pricingAsOf: PRICING_ASOF,
      basis: 'Computed at published list rates on recorded input/output tokens (Const I.5a). Not the actual invoice — caching, batch, and negotiated discounts are not reflected; provider dashboards remain the billing source of truth. Semrush units, SerpAPI searches, and image generations are plan-dependent or count-only and are left unpriced.',
      rateCard: RATE_CARD,
      grandTotalUSD,
      projects: projectsOut,
    });
  } catch (err) {
    console.warn('[OrbitIQ usage] cost rollup failed:', (err as any)?.message ?? err);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      pricingAsOf: PRICING_ASOF,
      basis: 'Usage ledger is empty or not yet migrated. Cost populates as API calls are recorded.',
      rateCard: RATE_CARD,
      grandTotalUSD: 0,
      projects: [],
    });
  }
}
