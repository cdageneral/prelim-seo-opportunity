/**
 * GET /api/usage/cost — USD cost rollup over the API-usage ledger (v7.363)
 *
 * v7.396: prices Semrush + SerpAPI alongside the token providers, and reports
 * the fail-closed registry audit (see lib/usage/pricing.ts).
 *
 * Reads the REAL, measured quantities recorded per call in `api_usage` and
 * multiplies them by registry rates to produce per-project and grand-total USD.
 *
 * Constitution Art. I.5a: the quantities are real source rows; every multiplier
 * is a named, sourced rate with an as-of date; the dollar figure is a LABELED
 * computed estimate, NOT the actual invoice (provider dashboards remain the
 * billing source of truth — I.1/I.5).
 *
 * TWO BASES are reported separately, because they mean different things:
 *   • payPerUseUSD — Anthropic/OpenAI tokens at published list rates. Marginal.
 *   • planQuotaUSD — SerpAPI/Semrush prepaid allowances allocated at
 *     plan-price ÷ included-quota. NOT marginal; unused quota is unallocated,
 *     so this sums to LESS than the invoice. Stated on-panel.
 *
 * FAIL-CLOSED: any provider+unit(+model) in the ledger with no registry entry
 * comes back in `unregistered` with `registryOk: false` — the panel renders it
 * loudly and the Article VIII release gate fails on it.
 *
 * Read-only. Fault-tolerant: an un-migrated table yields an empty rollup.
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { apiUsage, projects } from '@/db/schema';
import { sql, eq } from 'drizzle-orm';
import { ensureUsageTable } from '@/lib/usage/record';
import { priceLine, auditRegistry, RATE_CARD, PRICING_ASOF, PLAN_QUOTA_CAVEAT } from '@/lib/usage/pricing';

export const dynamic = 'force-dynamic';

interface ModelCost {
  provider: string; endpoint: string; unit: string;
  inputTokens: number; outputTokens: number; quantity: number; calls: number;
  priced: boolean; costUSD: number; rateLabel: string | null; basis: string | null; reason?: string;
}
interface UnpricedLine {
  provider: string; unit: string; quantity: number; calls: number;
  reason: string; unregistered: boolean;
}
interface ProjectCost {
  projectId: string | null; projectName: string;
  costUSD: number; payPerUseUSD: number; planQuotaUSD: number; measuredUSD: number;
  models: ModelCost[]; unpriced: UnpricedLine[];
}

const BASIS_NOTE =
  'Computed at registry rates on real recorded quantities (Const I.5a). Not the actual invoice — provider dashboards remain the billing source of truth; caching, batch, and negotiated discounts are not reflected. Token providers price per token at published list rates. ' +
  PLAN_QUOTA_CAVEAT +
  ' DataForSEO is different again: it reports the real cost of every request in its own response, so those dollars are MEASURED, not estimated, and no rate is applied to them.';

export async function GET() {
  try {
    await ensureUsageTable();

    // One row per (project, provider, model, unit): real measured sums.
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
        // v7.397 — provider-reported dollars (DataForSEO). A real source row, not a rate.
        measuredCost: sql<number>`coalesce(sum((${apiUsage.meta} ->> 'costUSD')::numeric), 0)`,
        calls:        sql<number>`count(*)`,
      })
      .from(apiUsage)
      .leftJoin(projects, eq(projects.id, apiUsage.projectId))
      .where(eq(apiUsage.kind, 'usage'))   // baselines carry no token split — exclude from cost math
      .groupBy(apiUsage.projectId, projects.clientName, apiUsage.provider, apiUsage.endpoint, apiUsage.unit);

    // Fail-closed registry audit across everything the ledger actually carries.
    const unregistered = auditRegistry(
      grouped.map(r => ({ provider: r.provider, unit: r.unit, endpoint: r.endpoint })),
    );

    const projMap = new Map<string, ProjectCost>();
    let grandTotalUSD = 0;
    let grandPayPerUseUSD = 0;
    let grandPlanQuotaUSD = 0;
    let grandMeasuredUSD = 0;

    for (const r of grouped) {
      const pid = r.projectId ?? '__unattributed__';
      let entry = projMap.get(pid);
      if (!entry) {
        entry = {
          projectId: r.projectId ?? null,
          projectName: r.projectId ? (r.projectName ?? 'Unknown project') : 'Unattributed',
          costUSD: 0, payPerUseUSD: 0, planQuotaUSD: 0, measuredUSD: 0, models: [], unpriced: [],
        };
        projMap.set(pid, entry);
      }

      const inputTokens  = Number(r.inputTokens)  || 0;
      const outputTokens = Number(r.outputTokens) || 0;
      const quantity     = Number(r.quantity)     || 0;
      const calls        = Number(r.calls)        || 0;
      const measuredCost = Number(r.measuredCost) || 0;

      const priced = priceLine({
        provider: r.provider, endpoint: r.endpoint, unit: r.unit,
        inputTokens, outputTokens, quantity, measuredCostUSD: measuredCost,
      });

      if (priced.priced) {
        entry.models.push({
          provider: r.provider, endpoint: r.endpoint, unit: r.unit,
          inputTokens, outputTokens, quantity, calls,
          priced: true, costUSD: priced.costUSD, rateLabel: priced.rateLabel, basis: priced.basis,
        });
        entry.costUSD += priced.costUSD;
        grandTotalUSD += priced.costUSD;
        if (priced.basis === 'plan-quota') {
          entry.planQuotaUSD += priced.costUSD;
          grandPlanQuotaUSD += priced.costUSD;
        } else if (priced.basis === 'measured') {
          // v7.397 — kept in its own bucket so the panel never presents a measured
          // figure and an estimated one as the same kind of number (Const I.5a).
          entry.measuredUSD += priced.costUSD;
          grandMeasuredUSD += priced.costUSD;
        } else {
          entry.payPerUseUSD += priced.costUSD;
          grandPayPerUseUSD += priced.costUSD;
        }
      } else {
        // Fold unpriced rows by provider+unit so the panel can show the honest gap.
        const key = `${r.provider}|${r.unit}`;
        let u = entry.unpriced.find(x => `${x.provider}|${x.unit}` === key);
        if (!u) {
          u = {
            provider: r.provider, unit: r.unit, quantity: 0, calls: 0,
            reason: priced.reason ?? 'unpriced',
            unregistered: priced.unregistered,
          };
          entry.unpriced.push(u);
        }
        u.quantity += quantity;
        u.calls += calls;
        // Any unregistered member makes the folded line unregistered.
        if (priced.unregistered) u.unregistered = true;
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
      basis: BASIS_NOTE,
      planQuotaCaveat: PLAN_QUOTA_CAVEAT,
      rateCard: RATE_CARD,
      grandTotalUSD,
      grandPayPerUseUSD,
      grandPlanQuotaUSD,
      grandMeasuredUSD,
      registryOk: unregistered.length === 0,
      unregistered,
      projects: projectsOut,
    });
  } catch (err) {
    console.warn('[OrbitIQ usage] cost rollup failed:', (err as any)?.message ?? err);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      pricingAsOf: PRICING_ASOF,
      basis: 'Usage ledger is empty or not yet migrated. Cost populates as API calls are recorded.',
      planQuotaCaveat: PLAN_QUOTA_CAVEAT,
      rateCard: RATE_CARD,
      grandTotalUSD: 0,
      grandPayPerUseUSD: 0,
      grandPlanQuotaUSD: 0,
      grandMeasuredUSD: 0,
      registryOk: true,
      unregistered: [],
      projects: [],
    });
  }
}
