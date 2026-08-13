// ─────────────────────────────────────────────────────────────────────────────
// lib/snapshotFootprint.ts — v7.443
//
// ONE definition of "does this stored snapshot carry a real ranking footprint?"
// (Const II.7 — single source of truth).
//
// The same mistake has now been made in three places: testing whether a snapshot
// OBJECT exists instead of whether it holds DATA. A scope clear
// (lib/clearScope.ts) empties `topKeywords` / `gapKeywords` and nulls
// `positionDist` while leaving the object in place, so every `if (snap)` test
// stayed true over an empty shell:
//
//   • the Refresh Analysis resume gate (app/projects/[id]/page.tsx) skipped
//     Phase 1 and re-ran synthesis on nothing — fixed v7.442;
//   • the data-only refresh (app/api/analyze/route.ts) picked an emptied
//     snapshot as its reuse base and COPIED the emptiness into a brand-new
//     analysis — fixed v7.443 (this file exists so there is no fourth);
//   • synthesis itself then had to fail closed on 0 keywords (v7.442).
//
// Everything that asks "can I build on this snapshot?" imports this — a fourth
// caller inherits the right answer instead of re-deriving a wrong one.
// ─────────────────────────────────────────────────────────────────────────────

/** Count the keywords a snapshot actually carries (client footprint + competitor gaps). */
export function snapshotFootprintCount(snap: any): number {
  if (!snap || typeof snap !== 'object') return 0;
  const top = Array.isArray(snap.topKeywords) ? snap.topKeywords.length : 0;
  const gap = Array.isArray(snap.gapKeywords) ? snap.gapKeywords.length : 0;
  return top + gap;
}

/**
 * True only when the snapshot holds at least one real keyword. An emptied
 * snapshot is a truthy object with nothing in it — never treat it as data.
 */
export function snapshotHasFootprint(snap: any): boolean {
  return snapshotFootprintCount(snap) > 0;
}
