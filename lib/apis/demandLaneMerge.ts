/**
 * Demand-universe lane merge (v7.241)
 *
 * A single-lane deep-journey pass (product OR pre-product, triggered by the two
 * Keyword-panel workflow buttons) must rebuild ONLY its lane and MERGE into the
 * existing universe so the other lane survives (Const II.3 — deep journey backfills
 * rather than overwrites). Pure + dependency-free (no Semrush / DB imports) so it
 * can be unit-checked in the retained regression suite (Const V.6).
 *
 * Invariants enforced here:
 *  - Each keyword is kept exactly once (Const I.3 — no double counting).
 *  - On a keyword collision the higher REAL Semrush volume wins (Const I.1 — volumes
 *    are never modeled; this only ever keeps a real source-row value).
 *  - A collision between a preserved (other-lane) topic and a newly-built topic is
 *    promoted to the rebuilt lane (matches the combined-build "product seed wins").
 */

export type LaneHint = 'product' | 'problem';

// Minimal shape this merge needs — kept structural so it doesn't import the Semrush
// DemandTopic type (which would pull the DB driver into the dependency graph).
export interface LaneTopic {
  keyword:      string;
  searchVolume: number;
  seeds:        string[];
  reports:      Array<'questions' | 'related'>;
  laneHint?:    string;
}

export interface MergedLaneTopic extends LaneTopic { laneHint: LaneHint; }

export function mergeDemandLanes(
  existingTopics: LaneTopic[],
  newTopics:      LaneTopic[],
  mode:           'product' | 'pre' | 'all',
  productSeedSet: Set<string>,
): MergedLaneTopic[] {
  const rebuiltLanes: LaneHint[] =
    mode === 'product' ? ['product'] : mode === 'pre' ? ['problem'] : ['product', 'problem'];
  const laneOf = (t: { laneHint?: string }): LaneHint => (t?.laneHint === 'product' ? 'product' : 'problem');
  const newLaneHint = (t: LaneTopic): LaneHint =>
    mode === 'product' ? 'product'
    : mode === 'pre'   ? 'problem'
    : (t.seeds.some(s => productSeedSet.has(s.toLowerCase())) ? 'product' : 'problem');

  const merged = new Map<string, MergedLaneTopic>();
  // Keep existing topics from lanes this pass does NOT rebuild.
  for (const t of existingTopics) {
    if (!rebuiltLanes.includes(laneOf(t))) {
      const key = String(t.keyword ?? '').toLowerCase().trim();
      if (key) merged.set(key, { ...t, laneHint: laneOf(t) });
    }
  }
  // Overlay this pass's topics (new wins on a keyword collision; max real volume).
  for (const t of newTopics) {
    const key = t.keyword.toLowerCase().trim();
    if (!key) continue;
    const prev = merged.get(key);
    const lane = newLaneHint(t);
    merged.set(key, prev
      ? { ...t,
          searchVolume: Math.max(prev.searchVolume ?? 0, t.searchVolume),
          seeds:   Array.from(new Set([...(prev.seeds ?? []),   ...t.seeds])),
          reports: Array.from(new Set([...(prev.reports ?? []), ...t.reports])) as Array<'questions' | 'related'>,
          laneHint: lane }
      : { ...t, laneHint: lane });
  }
  return Array.from(merged.values()).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
}
