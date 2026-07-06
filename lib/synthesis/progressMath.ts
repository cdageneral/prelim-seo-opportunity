/**
 * lib/synthesis/progressMath.ts — v7.351
 *
 * Pure transform behind GET /api/projects/[id]/synthesis-progress. Kept out of
 * the route so it can be unit-tested at real scale without a DB or Next runtime
 * (Const V.3/V.6 — the retained harness guards the ACTUAL shipped logic, not a
 * copy). Takes the small scalar row the route extracts server-side with jsonb
 * operators (never the multi-MB snapshot) and returns the analyzing-screen
 * payload. Nothing here is modeled — every count is a real checkpoint value
 * (Const I.1).
 */

export const DISCOVERY_BATCH = 25;   // mirrors lib/claude/synthesize.ts
export const INSIGHT_TOTAL   = 3;    // personas · llm probe · opportunities (post-breakdown tail)
// v7.351: consolidation runs in a variable number of chunks that isn't known
// until AFTER discovery finishes. If it were added to `total` only then, the
// denominator would jump (e.g. 61 → 65) and the percentage would visibly slide
// BACKWARD mid-run — worse than frozen (Const IV.3). So the consolidation phase
// occupies a FIXED-size reserve segment in the bar from the first poll, and the
// real canon chunk progress fills that reserve fractionally. This is a UI band
// size only (like the component's 5–85% mapping) — no data is modeled (Const I.1).
export const CANON_RESERVE   = 4;

/** Raw scalar row as returned by the progress SQL (booleans may arrive as
 *  JS booleans or Postgres 't'/'f' text depending on the driver path). */
export interface SynthProgressRow {
  status?:        string | null;
  has_snap?:      unknown;
  batch_total?:   unknown;
  disc_done?:     unknown;
  canon_total?:   unknown;
  canon_done?:    unknown;
  ranked_n?:      unknown;
  gap_n?:         unknown;
  cb_done?:       unknown;
  personas_done?: unknown;
  probe_done?:    unknown;
  opps_done?:     unknown;
}

export interface SynthProgress {
  status: string | null;
  done:   number | null;
  total:  number | null;
  stage:  string | null;
}

export const truthy = (v: unknown): boolean =>
  v === true || v === 't' || v === 'true' || v === 1;

export function computeSynthProgress(row: SynthProgressRow | null): SynthProgress {
  if (!row) return { status: null, done: null, total: null, stage: null };

  const status = String(row.status ?? '');
  if (status === 'completed') return { status: 'completed', done: null, total: null, stage: 'completed' };
  if (status === 'failed')    return { status: 'failed',    done: null, total: null, stage: 'failed' };
  if (!truthy(row.has_snap))  return { status: status || null, done: null, total: null, stage: 'gathering' };

  // Discovery batches. `batch_total` is the exact figure the engine stored
  // (v7.351); before the first checkpoint it's absent → derive from the pool
  // size (a slight overcount from ranked∩gap overlap only makes the bar read
  // conservatively — never claims done when it isn't, Const I.5).
  const rankedN    = Number(row.ranked_n ?? 0);
  const gapN       = Number(row.gap_n ?? 0);
  const batchTotal = Number(row.batch_total);
  const discTotal  = Number.isFinite(batchTotal) && batchTotal > 0
    ? batchTotal
    : Math.max(1, Math.ceil((rankedN + gapN) / DISCOVERY_BATCH));
  let discDone = Number(row.disc_done ?? 0);

  // Consolidation fills the FIXED reserve segment fractionally by real chunk
  // progress — so `total` never grows when the chunk count becomes known.
  const canonTotal = Number(row.canon_total ?? 0);
  const canonDoneRaw = Number(row.canon_done ?? 0);
  let   canonSeg = canonTotal > 0
    ? Math.round(Math.min(1, canonDoneRaw / canonTotal) * CANON_RESERVE)
    : 0;

  const cbDone       = truthy(row.cb_done);
  const personasDone = truthy(row.personas_done);
  const probeDone    = truthy(row.probe_done);
  const oppsDone     = Number(row.opps_done ?? 0) > 0;

  // Once the category breakdown is checkpointed, discovery + consolidation are
  // by definition complete — pin them to full so the bar is monotonic and never
  // dips (a later checkpoint may trim a transient array). Const I.1: real state.
  if (cbDone) { discDone = discTotal; canonSeg = CANON_RESERVE; }

  // v7.351: the post-breakdown tail (personas → probe → opportunities →
  // narrative/deck) used to leave the bar frozen at 100% of discovery for ~2
  // windows. Three real insight milestones keep it advancing so the screen
  // never looks frozen (Const IV.2 / IV.3).
  const insightDone = cbDone ? [personasDone, probeDone, oppsDone].filter(Boolean).length : 0;

  const done  = discDone + canonSeg + insightDone;
  const total = discTotal + CANON_RESERVE + INSIGHT_TOTAL;

  let stage = 'categorizing';
  if (canonTotal > 0 && !cbDone) stage = 'consolidating';
  if (cbDone) stage = oppsDone ? 'finalizing' : 'insights';

  return { status, done, total, stage };
}
