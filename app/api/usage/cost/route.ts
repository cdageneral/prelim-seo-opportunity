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
 *
 * v7.483 — accepts the same optional half-open ?from=&to= window as /api/usage.
 * This route already reads only `kind = 'usage'`, so baselines never reached it
 * and the window needs no extra exclusion here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureUsageTable, getLedgerFailures } from '@/lib/usage/record';
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

/** A usable ISO instant, or null. An unparseable bound is ignored, never guessed. */
function bound(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export async function GET(req: NextRequest) {
  const from = bound(req.nextUrl.searchParams.get('from'));
  const to   = bound(req.nextUrl.searchParams.get('to'));
  try {
    await ensureUsageTable();

    // One row per (project, provider, model, unit): real measured sums.
    // v7.399 — RAW SQL for the same reason /api/usage was rewritten: a drizzle
    // aggregate-alias select over neon-http silently returned stale totals here,
    // so this panel showed $288.49 while the database already held newer rows.
    // See the v7.373 precedent (neon-http + drizzle aggregate alias → use execute).
    const raw: any = await db.execute(sql`
      SELECT
        u.project_id                                                          AS "projectId",
        p.client_name                                                         AS "projectName",
        u.provider                                                            AS "provider",
        u.endpoint                                                            AS "endpoint",
        u.unit                                                                AS "unit",
        COALESCE(SUM((u.meta ->> 'inputTokens')::numeric), 0)                 AS "inputTokens",
        COALESCE(SUM((u.meta ->> 'outputTokens')::numeric), 0)                AS "outputTokens",
        COALESCE(SUM(u.quantity), 0)::bigint                                  AS "quantity",
        COALESCE(SUM((u.meta ->> 'costUSD')::numeric), 0)                     AS "measuredCost",
        COUNT(*)::int                                                         AS "calls"
      FROM api_usage u
      LEFT JOIN projects p ON p.id = u.project_id
      WHERE u.kind = 'usage'
        ${from ? sql`AND u.created_at >= ${from}::timestamptz` : sql``}
        ${to   ? sql`AND u.created_at <  ${to}::timestamptz`   : sql``}
      GROUP BY u.project_id, p.client_name, u.provider, u.endpoint, u.unit
    `);
    const grouped: Array<{
      projectId: string | null; projectName: string | null; provider: string;
      endpoint: string; unit: string; inputTokens: any; outputTokens: any;
      quantity: any; measuredCost: any; calls: any;
    }> = raw?.rows ?? raw ?? [];

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
      range: { from, to },
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
      // v7.398 — ledger writes that failed on THIS instance. A swallowed write is
      // spend missing from every total, so it gets said out loud (Const I.5).
      ledgerFailures: getLedgerFailures(),
      projects: projectsOut,
    });
  } catch (err) {
    console.warn('[OrbitIQ usage] cost rollup failed:', (err as any)?.message ?? err);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      range: { from, to },
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
      ledgerFailures: getLedgerFailures(),
      projects: [],
    });
  }
}
