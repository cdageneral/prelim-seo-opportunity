// ─── v7.325: pure snapshot scope-clear transform ───────────────────────────────
// The Keyword Landscape cards are DOUBLE-SOURCED (Const II.7): their counts come
// from the saved analysis snapshot (semrushSnapshot.topKeywords / .gapKeywords)
// UNIONED with the uploaded project_keywords rows (buildKwPool §1–4). So deleting
// only the uploaded rows (the v7.324 bug) left the snapshot side populated — the
// Competitor Gap card stayed full while Local Intent (whose gap-local signal lives
// only on the uploaded rows) collapsed.
//
// To truly delete a scope, the snapshot must be cleared too. This is the PURE part
// of that operation (no DB) so it can be unit-tested against a real-shaped snapshot.
// It returns a shallow copy with the scope's fields emptied; the DB row delete +
// competitors delete live in the route. Real-data only (Const I.1): we never invent
// values, we only remove — emptied fields render as honest empty states (Const I.5).

export type ClearScope = 'client' | 'competitor';

export function clearScopeFromSnapshot<T extends Record<string, any> | null | undefined>(
  snap: T,
  scope: ClearScope,
): T {
  if (!snap || typeof snap !== 'object') return snap;
  const next: Record<string, any> = { ...(snap as Record<string, any>) };

  if (scope === 'competitor') {
    // Competitor footprint: the gap set + the competitor lists/positions that feed
    // Competitor Gap, Share of Voice rivals, and the Exec competitor views.
    next.gapKeywords             = [];
    next.competitors             = [];
    next.serpCompetitorPositions = [];
    next.competitorPositionVol   = null;
    next.competitorPositionDist  = null;
  } else {
    // Client footprint + everything derived from it (clusters/journeys/content/exec
    // are VIEWS over these — emptying them empties those views honestly, Const II.6).
    next.topKeywords                  = [];
    next.positionVol                  = null;
    next.positionDist                 = null;
    next.localPackKeywords            = [];
    next._demandUniverse              = null;
    next._categoryBreakdown           = null;
    next._audienceSegments            = null;
    next._audienceSegmentsImageStatus = null;
  }

  return next as T;
}
