/**
 * API-usage attribution context (v7.225)
 * ───────────────────────────────────────────────────────────────────────────
 * A request-scoped AsyncLocalStorage that carries the current projectId so the
 * low-level API clients (Semrush / SerpAPI / Profound / Anthropic / OpenAI) can
 * attribute every billable call to a project WITHOUT threading a projectId
 * argument through dozens of function signatures.
 *
 * A route sets the context once near the top of its handler:
 *     setUsageProject(params.id);            // attribute everything below to this project
 * and any usage recorded for the rest of that async execution is tagged with it.
 * Calls made with no context set are recorded with projectId = null
 * ("Unattributed" in the rollup) — never lost.
 *
 * Uses AsyncLocalStorage.enterWith() so it's a single non-invasive line at the
 * top of a handler (no callback wrapping, no indentation/return changes). Runs
 * only in the Node.js runtime (all OrbitIQ API routes are nodejs runtime).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type UsageProduct = 'orbit' | 'scout';

interface UsageStore {
  projectId:  string | null;
  // v7.514 — which product the spend belongs to. Everything is Orbit unless a
  // Scout route says otherwise; the ledger row carries it so the API Usage
  // dashboard can show Orbit and Scout apart (Wayne, 2026-09-21).
  product:    UsageProduct;
  scoutRunId: string | null;
}

// A mutable holder lets late-resolved ids (e.g. analyze/synthesize read the
// projectId from the request body) update the same store the API clients read.
const storage = new AsyncLocalStorage<{ ref: UsageStore }>();

/**
 * Attribute all API usage in the current async execution to `projectId`.
 * Safe to call with null/undefined (leaves usage unattributed). Idempotent —
 * a later call updates the active store in place.
 */
export function setUsageProject(projectId: string | null | undefined): void {
  const pid = projectId ?? null;
  const existing = storage.getStore();
  if (existing) {
    existing.ref.projectId = pid;
    return;
  }
  // No active store yet — establish one for the rest of this execution.
  storage.enterWith({ ref: { projectId: pid, product: 'orbit', scoutRunId: null } });
}

/**
 * v7.514 — attribute everything below to SCOUT. `runId` is the scout_runs row when
 * a run is executing, or null for Scout spend that happens before a run exists
 * (competitor suggestions, the manual-competitor check). Idempotent like
 * setUsageProject; clears any project attribution because a Scout call is never
 * a project's spend.
 */
export function setUsageScout(runId: string | null | undefined): void {
  const existing = storage.getStore();
  if (existing) {
    existing.ref.projectId = null;
    existing.ref.product = 'scout';
    existing.ref.scoutRunId = runId ?? null;
    return;
  }
  storage.enterWith({ ref: { projectId: null, product: 'scout', scoutRunId: runId ?? null } });
}

/** The product currently in scope. Orbit when nothing was set. */
export function currentUsageProduct(): UsageProduct {
  return storage.getStore()?.ref.product ?? 'orbit';
}

/** The Scout run in scope, or null. */
export function currentUsageScoutRun(): string | null {
  return storage.getStore()?.ref.scoutRunId ?? null;
}

/** The projectId currently in scope, or null when unattributed. */
export function currentUsageProject(): string | null {
  return storage.getStore()?.ref.projectId ?? null;
}
