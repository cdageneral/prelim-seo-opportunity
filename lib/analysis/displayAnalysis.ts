/**
 * lib/analysis/displayAnalysis.ts — the ONE rule for "which analysis row is this
 * project currently showing" (v7.407).
 *
 * Why this exists (Wayne, 2026-08-05: "I dont see any of the local insights
 * coming through the report"):
 *
 * Two places picked an analysis row by two different rules, and they diverged.
 *   • The project page — and therefore the PDF, which is handed the page's
 *     analysisId — took the newest COMPLETED row, falling back to the newest row
 *     of any status (app/projects/[id]/page.tsx, v7.322).
 *   • The local scan took the newest row that merely HAD a snapshot, whatever its
 *     status (app/api/projects/[id]/local-scan/route.ts).
 *
 * A new analysis inserts a `running` row and writes its snapshot in Phase 1,
 * BEFORE Phase 2 flips it to `completed`. A refresh, a timeout or an abandoned
 * Phase 2 leaves exactly that state permanently: a newer running row carrying a
 * snapshot, sitting above the completed row the page renders. In that state the
 * local scan wrote `_localScan` into the running row while the report read the
 * completed one — so the scan succeeded, the panel showed it (from its own
 * browser cache), and the report silently had no local data at all.
 *
 * Both sides now call this function, so the write target and the read target
 * cannot drift apart again (Const II.7 — one source of truth). The rule itself is
 * unchanged from the page's v7.322 behaviour; only its reach is widened.
 */

export interface AnalysisRowLike {
  status?: string | null;
}

/**
 * Pick the analysis a project is currently displaying.
 *
 * @param analysesNewestFirst rows ordered by triggeredAt DESC (the order both the
 *        project query and the scan routes already use).
 * @returns the newest COMPLETED row, or the newest row of any status when nothing
 *          has completed yet (true first run / in-progress), or null when there
 *          are no rows at all.
 */
export function pickDisplayAnalysis<T extends AnalysisRowLike>(
  analysesNewestFirst: T[] | null | undefined,
): T | null {
  const list = analysesNewestFirst ?? [];
  return list.find(a => a?.status === 'completed') ?? list[0] ?? null;
}
