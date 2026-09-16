/**
 * lib/insightsPanel/computed.ts — v7.497 · the decision block STORED WITH the
 * Insights narrative.
 *
 * Why: measured on Sono Bello (2026-09-16), GET /insights-panel rebuilt the Seer
 * context and lib/insightsPanel/decision on every panel open — a bare project
 * row loaded twice plus the 17 MB analysis — at 7.7–19 s per load. The block the
 * narrative was verified against is the block the panel should show (Const
 * II.6a: a surface READS the basis a result was computed on), so it is saved
 * beside the narrative at generation time as `insights.computed` and read back
 * by GET and by the Assessment PDF route. It records the analysis it was built
 * from so a surface can say when a newer scan exists (Const I.5 — never a silent
 * stale number).
 *
 * Lives outside the route file because an App Router route module may export
 * only its handlers (the v7.401 page-export trap).
 */

import type { SeerContext } from '@/lib/seer/core';
import { buildCoverageSummary } from '@/lib/insightsPanel/build';
import type { DecisionInputs } from '@/lib/insightsPanel/decision';

/** What GET reports about where `decision` came from. */
export interface DecisionBasis {
  source: 'stored' | 'live';
  builtAt: string | null;
  analysisId: string | null;
  analysisTriggeredAt: string | null;
  latestAnalysisId: string | null;
  stale: boolean;   // a newer analysis with a snapshot exists than the one the stored block read
}

/** The block saved with the blob at generation time (`insights.computed`). */
export interface ComputedBlock {
  schema: 'v7.497';
  builtAt: string | null;
  analysisId: string | null;
  analysisTriggeredAt: string | null;
  decision: DecisionInputs;
  coverage: ReturnType<typeof buildCoverageSummary> | null;
}

export function isoOrNull(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v) return v;
  return null;
}

/** The stored computed block, or null when the blob has none (or a malformed one). */
export function readComputed(blob: unknown): ComputedBlock | null {
  const c: any = (blob as any)?.computed;
  if (!c || typeof c !== 'object') return null;
  const d = c.decision;
  if (!d || typeof d !== 'object' || !d.standing || !d.scenarios || !Array.isArray(d.plays) || !d.playsBasis) return null;
  return {
    schema: 'v7.497', builtAt: typeof c.builtAt === 'string' ? c.builtAt : null,
    analysisId: typeof c.analysisId === 'string' ? c.analysisId : null,
    analysisTriggeredAt: typeof c.analysisTriggeredAt === 'string' ? c.analysisTriggeredAt : null,
    decision: d as DecisionInputs, coverage: c.coverage ?? null,
  };
}

/** Build the block from the SAME context the generation read (the decision the claim gate checked). */
export function makeComputed(ctx: SeerContext, decision: DecisionInputs): ComputedBlock {
  let coverage: ComputedBlock['coverage'] = null;
  try { coverage = buildCoverageSummary(ctx); } catch { coverage = null; }
  return {
    schema: 'v7.497', builtAt: new Date().toISOString(),
    analysisId: (ctx.analysis as any)?.id ?? null, analysisTriggeredAt: isoOrNull((ctx.analysis as any)?.triggeredAt),
    decision, coverage,
  };
}
