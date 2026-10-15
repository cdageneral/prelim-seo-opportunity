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

// ─── v7.557 — the rank comes from ORGANIC rows only ────────────────────────────
//
// A Semrush Positions export lists a keyword once per placement: one row per
// ranking URL AND one row per SERP-feature slot the domain holds (AI overview,
// Local pack, People also ask …), each with its own Position. A feature slot is
// exported at #1. mergeFootprintFacts above keeps the best position across ALL
// rows, so "va loan rates" (USAA, 2026-10-14) — AI overview #1, Organic #6 —
// was stored as #1, and because the types were unioned to "Organic, AI overview"
// every panel read it as an ORGANIC #1. Verified against Semrush phrase_organic
// the same day: usaa.com is organic #6. Const I.4 — two lenses, one number.
//
// The fix keeps the lenses apart at the merge. Every occurrence carries a TIER:
//   'organic' — from a row whose Position Type is Organic (or a stored row whose
//               organic basis is established).
//   'unknown' — no Position Type (older export / hand-built file), or a stored
//               pre-v7.557 mixed row whose position may be a feature's.
//   'feature' — a SERP-feature slot. Its position is presence, never a rank.
// The stored position + URL come from the HIGHEST tier that has a position
// (organic > unknown > feature); within one tier the v7.405 best-position rule
// applies unchanged. Volume stays the max across every occurrence. The feature
// signal is not lost — the caller still unions Position Type and SERP features,
// so the row keeps its badge (Wayne's 2026-08-14 display choice).

export type RankTier = 'organic' | 'unknown' | 'feature';

export interface TieredFacts extends FootprintRowFacts {
  tier: RankTier;
}

const TIER_ORDER: Record<RankTier, number> = { organic: 0, unknown: 1, feature: 2 };

/** Collapse two occurrences of the SAME keyword, rank taken from the best tier. */
export function mergeTieredFacts(prior: TieredFacts, next: TieredFacts): TieredFacts {
  const has = (f: TieredFacts) => f.position != null && f.position >= 1;
  const searchVolume = Math.max(prior.searchVolume || 0, next.searchVolume || 0);
  // A tier only competes when it actually carries a position.
  if (has(prior) && has(next) && prior.tier !== next.tier) {
    const win = TIER_ORDER[prior.tier] < TIER_ORDER[next.tier] ? prior : next;
    return { position: win.position, url: win.url ?? null, searchVolume, tier: win.tier };
  }
  if (has(prior) !== has(next)) {
    const win = has(prior) ? prior : next;
    const other = win === prior ? next : prior;
    return { position: win.position, url: win.url ?? other.url ?? null, searchVolume, tier: win.tier };
  }
  // Same tier (or neither has a position): the v7.405 rule, unchanged.
  const m = mergeFootprintFacts(prior, next);
  const tier = TIER_ORDER[prior.tier] <= TIER_ORDER[next.tier] ? prior.tier : next.tier;
  return { ...m, tier };
}
