/**
 * lib/synthesis/resumeDecision.ts — v7.403
 *
 * The auto-resume loop's stop/continue rule, as a pure function so it can be
 * tested without a browser, a DB or a 300s Vercel window (Const V.3/V.6 — the
 * harness guards the SHIPPED logic, not a copy of it).
 *
 * WHY THIS EXISTS. Synthesis is checkpointed server-side and each 300s Vercel
 * kill is expected; the panel keeps re-POSTing /api/synthesize as long as the
 * run is advancing. v7.343 decided "advancing" from a progress poll, and folded
 * an UNREADABLE poll into the same number it used for "no progress" (`-1`). So
 * two unreadable polls looked identical to two stalled windows and aborted the
 * run.
 *
 * That fired for real on 2026-08-04: the poll returned 0 every window while the
 * engine was genuinely at 422/422 discovery batches and climbing through
 * consolidation. The run was fine; the panel said "Analysis failed" after three
 * windows and stopped resuming.
 *
 * The rule now separates the two, because they are different claims:
 *   • a READABLE reading that did not move  → evidence of a stall  (stop at 2)
 *   • an UNREADABLE reading                 → no evidence either way (stop at 5,
 *     because a permanently blind loop is not evidence of health either)
 */

/** Consecutive READABLE polls with no forward movement before we call it stalled. */
export const MAX_STALLS   = 2;
/** Consecutive UNREADABLE polls before we stop resuming blind. */
export const MAX_UNKNOWNS = 5;

export interface ResumeState {
  /** highest batch count read so far; -1 = nothing read yet */
  lastDone: number;
  stalls:   number;
  unknowns: number;
}

export type ResumeReason =
  | 'advancing'   // readable, moved forward
  | 'stalling'    // readable, did not move — but under the stall cap, so keep going
  | 'unknown'     // unreadable — no evidence either way
  | 'stalled'     // readable and unmoved MAX_STALLS times → stop
  | 'blind';      // unreadable MAX_UNKNOWNS times → stop

export interface ResumeVerdict {
  action: 'resume' | 'stop';
  reason: ResumeReason;
  state:  ResumeState;
}

export function initialResumeState(): ResumeState {
  return { lastDone: -1, stalls: 0, unknowns: 0 };
}

/**
 * @param prev    state carried from the previous window
 * @param reading the poll result, or null when it could not be read (endpoint
 *                error, network blip, or a payload about a DIFFERENT run)
 */
export function nextResumeState(prev: ResumeState, reading: { done: number } | null): ResumeVerdict {
  // Unreadable: carry lastDone and stalls untouched — we learned nothing about
  // this run, so neither confirming nor denying progress.
  if (reading == null || !Number.isFinite(reading.done)) {
    const unknowns = prev.unknowns + 1;
    const state: ResumeState = { ...prev, unknowns };
    return unknowns >= MAX_UNKNOWNS
      ? { action: 'stop',   reason: 'blind',   state }
      : { action: 'resume', reason: 'unknown', state };
  }

  // Readable and moved forward: reset BOTH counters — the run is healthy.
  if (reading.done > prev.lastDone) {
    return { action: 'resume', reason: 'advancing', state: { lastDone: reading.done, stalls: 0, unknowns: 0 } };
  }

  // Readable and did not move: this is the only thing that counts as a stall.
  const stalls = prev.stalls + 1;
  const state: ResumeState = { lastDone: prev.lastDone, stalls, unknowns: 0 };
  return stalls >= MAX_STALLS
    ? { action: 'stop',   reason: 'stalled',  state }
    : { action: 'resume', reason: 'stalling', state };
}
