/**
 * lib/synthesis/timeBudget.ts — v7.565
 *
 * One wall-clock budget for a single /api/synthesize window (Vercel kills the
 * function at maxDuration = 300s). Every time-boxed step reads its cut-off from
 * HERE, measured from the moment synthesis started, so the steps add up to a
 * window that actually fits.
 *
 * WHY. 2026-10-19, Citi (travel cards): every window died at 300s. Measured from
 * the live logs of one window (request nkx84…, analysis 10d593ef…):
 *     0s   synthesis starts (personas + categories cached)
 *     0s   LLM probe starts — pool deadline 220s
 *   250s   probe race fires: the pool stopped at 220s, but the Sonnet sentiment
 *          classifier (100s timeout) was still running → the WHOLE partial probe
 *          was discarded and nothing was checkpointed
 *   271s   narrative + PPT prompt done
 *   300s   killed — persona portraits + the final write never ran
 * The next window re-ran the full probe (re-spending ~216 prompts) and died the
 * same way. The progress counter never moved, so the panel called it a stall
 * after two windows and showed "Analysis failed".
 *
 * The fix is arithmetic: the probe (prompts + classifier) must END early enough
 * that the tail (opportunities, narrative, portraits, final write — ~20s + up to
 * ~60s for gpt-image-1) still fits.
 */

/** Pool stops STARTING new probe prompts after this (completed answers kept). */
export const PROBE_POOL_END_MS   = 100_000;
/** Sentiment/recognition classifier must finish by this point. */
export const PROBE_CLASSIFY_END_MS = 180_000;
/** Last-resort race backstop for the whole probe. */
export const PROBE_BACKSTOP_MS   = 190_000;
/** Below this many ms to the classifier cut-off, skip classification (assessed=false). */
export const CLASSIFY_MIN_MS     = 15_000;
/** Below this many ms to the pool cut-off, skip the probe this window. */
export const PROBE_MIN_MS        = 20_000;
/** Per-portrait request timeout (gpt-image-1). */
export const PORTRAIT_TIMEOUT_MS = 75_000;
/** If the route has already used this much of its window, portraits wait for a later run. */
export const PORTRAIT_START_CUTOFF_MS = 215_000;

/** ms left until an absolute cut-off measured from startMs. */
export function msLeft(startMs: number, cutoffMs: number, nowMs: number = Date.now()): number {
  return cutoffMs - (nowMs - startMs);
}

/** Timeout to give the classifier, or null = skip it (not enough time left). */
export function classifierTimeoutMs(deadlineAbsMs: number | undefined, nowMs: number = Date.now(), cap = 100_000): number | null {
  if (deadlineAbsMs === undefined) return cap;
  const left = deadlineAbsMs - nowMs;
  if (left < CLASSIFY_MIN_MS) return null;
  return Math.min(cap, left);
}
