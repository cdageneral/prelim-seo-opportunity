// ─────────────────────────────────────────────────────────────────────────────
// lib/keywordLandscape.ts — v7.446
//
// ONE definition of the population the Keyword Landscape panel's "All Keywords"
// card counts (Const II.7), so a rollup that shows the same number READS this
// basis instead of re-deriving its own (Const II.6a).
//
// Wayne's definition, unchanged since v7.140:
//
//     All Keywords = client footprint rows + competitor-gap rows
//
// with two details that are easy to get wrong when re-implemented:
//
//   1. A gap row only counts when it NAMES the competitor it came from. Gap rows
//      with a null `competitor` are excluded — the panel's kwSummary has always
//      filtered `r.type === 'gap' && !!r.competitor`, and a rollup that dropped
//      that `&& !!r.competitor` would read HIGHER than the panel on every
//      project carrying gap rows with no attributed domain.
//   2. The basis is the FULL footprint — buildKwPool with clientVolMin = 0 and
//      competitorVolMin = 0 and `includeDemand: true` — not the volume-floored
//      set the panel's table below the cards renders. The cards deliberately
//      read higher than the visible rows; a rollup must match the CARDS.
//
// The predicates below are shape-agnostic on purpose: KeywordsPanel holds
// enriched `KeywordRow`s (`type: 'ranked' | 'gap'`) while a server route holds
// raw `KwPoolItem`s (`isGap: boolean`). Both collapse to the same two fields, so
// both call the same functions and cannot drift.
// ─────────────────────────────────────────────────────────────────────────────

/** The only two fields the All-Keywords basis depends on. */
export interface LandscapeMember {
  /** true for a competitor-gap row, false for a client-footprint row. */
  isGap:      boolean;
  /** the competitor domain a gap row came from; null on client rows. */
  competitor: string | null;
}

/** A KeywordsPanel row (`type`) or a KwPoolItem (`isGap`) — either shape is accepted. */
export type LandscapeRowLike = { type?: string; isGap?: boolean; competitor?: string | null };

/** Normalizes either shape to the basis shape. */
export function toLandscapeMember(row: LandscapeRowLike): LandscapeMember {
  return {
    isGap:      row.isGap ?? row.type === 'gap',
    competitor: row.competitor ?? null,
  };
}

/** Client footprint — everything that is not a competitor-gap row. */
export function isClientFootprintRow(row: LandscapeRowLike): boolean {
  return !toLandscapeMember(row).isGap;
}

/** Competitor gap — a gap row that names the competitor it came from. */
export function isCompetitorGapRow(row: LandscapeRowLike): boolean {
  const m = toLandscapeMember(row);
  return m.isGap && !!m.competitor;
}

/** A row the "All Keywords" card counts: client footprint OR attributed competitor gap. */
export function isAllKeywordsRow(row: LandscapeRowLike): boolean {
  return isClientFootprintRow(row) || isCompetitorGapRow(row);
}

/**
 * The "All Keywords" count for a pool built on the full-footprint basis.
 * Identical to KeywordsPanel's `kwSummary.allCount` (branded + non-branded + gap).
 */
export function allKeywordsCount(rows: LandscapeRowLike[]): number {
  let n = 0;
  for (const r of rows) if (isAllKeywordsRow(r)) n++;
  return n;
}
