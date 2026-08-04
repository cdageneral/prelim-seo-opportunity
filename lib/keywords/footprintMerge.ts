/**
 * lib/keywords/footprintMerge.ts   (v7.405)
 *
 * ONE rule for collapsing duplicate keyword rows (same keyword, same domain)
 * into the single stored row — BEST POSITION WINS.
 *
 * Why this file exists: a Semrush-style export can list the same keyword many
 * times for one domain (one row per ranking URL / snapshot). Until v7.405 the
 * uploader collapsed those duplicates last-occurrence-wins, so the stored
 * position could be the domain's WORST ranking URL — silently understating that
 * brand's rank (and therefore its Share-of-Voice slice) depending on nothing
 * but row order in the file. The rule now:
 *
 *   position     — the BEST (lowest number) real position seen; null only if
 *                  no occurrence carried one.
 *   searchVolume — the MAX volume seen (same keyword, same market — differing
 *                  values mean one row was stale/zero; the larger is the real
 *                  Semrush figure, never a sum, so volume is never inflated).
 *   url          — the URL of the occurrence that supplied the winning
 *                  position (that page IS the ranking page); falls back to any
 *                  URL seen if the winner carried none. Never invented.
 *
 * SERP features are deliberately NOT handled here — their union rule
 * (mergeSerpFeatures, v7.288) lives in the batch route, pinned by the retained
 * suite, and the two rules compose: features union, rank/volume/url best-win.
 *
 * Pure function, no imports — directly testable by the retained suite.
 */

export interface FootprintRowFacts {
  position:     number | null;
  searchVolume: number;
  url:          string | null;
}

/** Collapse two occurrences of the SAME keyword for the SAME domain.
 *  Commutative in position/volume; url follows the winning position. */
export function mergeFootprintFacts(prior: FootprintRowFacts, next: FootprintRowFacts): FootprintRowFacts {
  const pPos = prior.position != null && prior.position >= 1 ? prior.position : null;
  const nPos = next.position  != null && next.position  >= 1 ? next.position  : null;

  let position: number | null;
  let url:      string | null;
  if (pPos == null && nPos == null) {
    position = null;
    url      = prior.url ?? next.url ?? null;
  } else if (nPos != null && (pPos == null || nPos < pPos)) {
    position = nPos;                                  // next wins
    url      = next.url ?? prior.url ?? null;
  } else {
    position = pPos;                                  // prior wins (or tie -> keep prior's page)
    url      = prior.url ?? next.url ?? null;
  }

  return {
    position,
    searchVolume: Math.max(prior.searchVolume || 0, next.searchVolume || 0),
    url,
  };
}
