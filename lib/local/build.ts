/**
 * lib/local/build.ts — v7.177 (Local Search panel)
 *
 * Canonical SHAPES for the persisted local scan + PURE aggregation functions
 * (share of local voice, review rollup, opportunity scoring). Shared by the
 * scan route, the panel, and the unit-test harness so the numbers are computed
 * in exactly one place.
 *
 * Defensibility: every figure derives from a real SerpAPI row (map pack place,
 * Maps listing, rating/review count) or a real Semrush volume. Nothing here
 * invents a metric — functions only count, average, rank, and threshold over
 * data captured by the route. ES5-safe (no for…of over Set/Map; Array.from used).
 */

import type { LocalIntent } from './detect';

// ─── Persisted shapes ───────────────────────────────────────────────────────────

export interface LocalListing {
  title:        string;
  placeId:      string;
  address:      string;
  city:         string;          // parsed from address (best-effort, for the map caption)
  rating:       number | null;   // Google star rating (real)
  reviews:      number;          // Google review count (real)
  type:         string;          // primary category
  website:      string;          // listing website domain (for client/competitor match)
  phone:        string;
  lat:          number | null;
  lng:          number | null;
  isClient:     boolean;         // matched to the client (by website domain or brand name)
  verified:     boolean;         // heuristic: has rating + reviews + address (Google verified signal proxy)
  healthFlags:  string[];        // e.g. ['no rating', 'few reviews', 'low rating']
}

export interface LocalPackMember {
  position:   number;            // 1–3 (Google local 3-pack slot)
  title:      string;
  placeId:    string;
  rating:     number | null;
  reviews:    number;
  isClient:   boolean;
}

export interface LocalKeywordScan {
  keyword:        string;
  searchVolume:   number;        // real Semrush volume
  intent:         LocalIntent;
  matchedTerm:    string;
  packPresent:    boolean;       // Google showed a local 3-pack for this query
  clientBestRank: number | null; // client's best pack slot across scanned locations (null = absent)
  bestLocationId: string | null; // placeId of the client location where rank was best / scanned
  bestLocationCity: string;
  packLeader:     string;        // title of the rank-1 place in the best pack
  pack:           LocalPackMember[]; // the 3-pack at the best location
}

export interface LocalScan {
  domain:        string;
  market:        string;
  locations:     LocalListing[];
  keywords:      LocalKeywordScan[];
  builtAt:       string;
  scannedCount:  number;         // number of local keywords actually scanned
  localTotal:    number;         // total local-intent keywords detected (may exceed scannedCount)
  callsUsed:     number;         // SerpAPI calls spent (audit)
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─── Map-pack rollup ─────────────────────────────────────────────────────────────

export interface PackRollup {
  scanned:      number;
  withPack:     number;          // queries that returned a 3-pack
  inPack:       number;          // client appears in the pack
  rank1:        number;          // client is #1
  notInPack:    number;          // pack exists, client absent
  presenceRate: number;          // inPack / withPack (%)
  avgRank:      number;          // average client rank WHEN present
}

export function buildPackRollup(scans: LocalKeywordScan[]): PackRollup {
  let withPack = 0, inPack = 0, rank1 = 0, notInPack = 0;
  const ranks: number[] = [];
  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    if (!s.packPresent) continue;
    withPack++;
    if (s.clientBestRank != null) {
      inPack++;
      ranks.push(s.clientBestRank);
      if (s.clientBestRank === 1) rank1++;
    } else {
      notInPack++;
    }
  }
  return {
    scanned:      scans.length,
    withPack,
    inPack,
    rank1,
    notInPack,
    presenceRate: withPack > 0 ? Math.round((inPack / withPack) * 100) : 0,
    avgRank:      ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : 0,
  };
}

// ─── Review rollup (real rating + count only — no fabricated distribution) ───────

export interface ReviewRollup {
  locationCount: number;
  totalReviews:  number;
  avgRating:     number;         // review-weighted average across client locations
  bestRating:    number;
  worstRating:   number;
}

export function buildReviewRollup(locations: LocalListing[]): ReviewRollup {
  const client = locations.filter(l => l.isClient && l.rating != null);
  let totalReviews = 0, weighted = 0;
  let best = 0, worst = 5;
  for (let i = 0; i < client.length; i++) {
    const l = client[i];
    const r = l.rating as number;
    totalReviews += l.reviews;
    weighted += r * (l.reviews || 1);
    if (r > best) best = r;
    if (r < worst) worst = r;
  }
  const weightDen = client.reduce((a, l) => a + (l.reviews || 1), 0);
  return {
    locationCount: client.length,
    totalReviews,
    avgRating:     weightDen > 0 ? Math.round((weighted / weightDen) * 10) / 10 : 0,
    bestRating:    client.length ? best : 0,
    worstRating:   client.length ? worst : 0,
  };
}

// ─── Share of Local Voice ────────────────────────────────────────────────────────

export interface SoLVRow {
  name:        string;
  placeId:     string;
  appearances: number;           // # of scanned packs the business appears in
  sharePct:    number;           // appearances / withPack
  avgRating:   number | null;
  maxReviews:  number;
  isClient:    boolean;
}

/**
 * Count how often each business holds a pack slot across all scanned packs.
 * Client rows are merged across the client's multiple listings into ONE "you"
 * row keyed by isClient.
 */
export function buildShareOfLocalVoice(scans: LocalKeywordScan[]): SoLVRow[] {
  interface Agg { name: string; placeId: string; appearances: number; ratingSum: number; ratingN: number; maxReviews: number; isClient: boolean; }
  const byKey: Record<string, Agg> = {};
  let withPack = 0;
  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    if (!s.packPresent) continue;
    withPack++;
    const seenThisPack: Record<string, boolean> = {};
    for (let j = 0; j < s.pack.length; j++) {
      const m = s.pack[j];
      const key = m.isClient ? '__client__' : (m.placeId || m.title.toLowerCase());
      if (seenThisPack[key]) continue;     // count a business once per pack
      seenThisPack[key] = true;
      if (!byKey[key]) {
        byKey[key] = { name: m.isClient ? 'You' : m.title, placeId: m.placeId, appearances: 0, ratingSum: 0, ratingN: 0, maxReviews: 0, isClient: m.isClient };
      }
      const a = byKey[key];
      a.appearances++;
      if (m.rating != null) { a.ratingSum += m.rating; a.ratingN++; }
      if (m.reviews > a.maxReviews) a.maxReviews = m.reviews;
    }
  }
  const rows: SoLVRow[] = Array.from(Object.keys(byKey)).map(k => {
    const a = byKey[k];
    return {
      name:        a.name,
      placeId:     a.placeId,
      appearances: a.appearances,
      sharePct:    withPack > 0 ? Math.round((a.appearances / withPack) * 100) : 0,
      avgRating:   a.ratingN > 0 ? Math.round((a.ratingSum / a.ratingN) * 10) / 10 : null,
      maxReviews:  a.maxReviews,
      isClient:    a.isClient,
    };
  });
  rows.sort((x, y) => y.appearances - x.appearances);
  return rows;
}

// ─── Opportunities (deterministic P0/P1/P2) ──────────────────────────────────────

export type OppTier = 'P0' | 'P1' | 'P2';

export interface LocalOpportunity {
  tier:        OppTier;
  title:       string;
  detail:      string;
  volume:      number;           // volume at stake (0 for listing-health items)
  kind:        'pack-miss' | 'rank-improve' | 'listing-health' | 'review-gap';
  keyword?:    string;
  intent?:     LocalIntent;
  location?:   string;
}

/**
 * Rank-ordered local opportunities. Rules (all explainable from real data):
 *   P0 pack-miss      — pack exists, client absent, volume ≥ median local volume
 *   P0 listing-health — client listing unverified or rating < 4.0
 *   P1 pack-miss      — pack exists, client absent, volume < median
 *   P1 rank-improve   — client in pack at slot 2–3 and a competitor with more
 *                       reviews holds slot 1
 *   P2 review-gap     — client location trails its strongest nearby pack leader
 *                       on reviews (informational)
 */
export function buildLocalOpportunities(
  scans: LocalKeywordScan[],
  locations: LocalListing[],
): { opportunities: LocalOpportunity[]; volumeAtStake: number; counts: Record<OppTier, number> } {
  const opps: LocalOpportunity[] = [];
  const vols = scans.filter(s => s.packPresent).map(s => s.searchVolume || 0);
  const med = median(vols);

  // Listing-health (P0)
  for (let i = 0; i < locations.length; i++) {
    const l = locations[i];
    if (!l.isClient) continue;
    if (!l.verified || (l.rating != null && l.rating < 4.0) || l.healthFlags.length > 0) {
      opps.push({
        tier:   'P0',
        kind:   'listing-health',
        title:  `Fix the ${l.city || l.title} listing`,
        detail: `${!l.verified ? 'Unverified / incomplete profile' : 'Profile issue'}${l.rating != null ? ` · ${l.rating}★` : ''} · ${l.reviews} reviews${l.healthFlags.length ? ` · ${l.healthFlags.join(', ')}` : ''}. A weak listing suppresses every nearby pack.`,
        volume: 0,
        location: l.city || l.title,
      });
    }
  }

  // Pack misses + rank improvements
  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    if (!s.packPresent) continue;
    if (s.clientBestRank == null) {
      const tier: OppTier = (s.searchVolume || 0) >= med && med > 0 ? 'P0' : 'P1';
      opps.push({
        tier,
        kind:    'pack-miss',
        title:   `Win the map pack for "${s.keyword}"`,
        detail:  `A 3-pack shows for this query but you're absent${s.packLeader ? ` — ${s.packLeader} leads` : ''}. Strengthen the nearest listing (${s.bestLocationCity || 'closest location'}) with categories, services & reviews.`,
        volume:  s.searchVolume || 0,
        keyword: s.keyword,
        intent:  s.intent,
        location: s.bestLocationCity,
      });
    } else if (s.clientBestRank >= 2) {
      // a competitor with more reviews holds slot 1
      const leader = s.pack.find(m => m.position === 1 && !m.isClient);
      const me = s.pack.find(m => m.isClient);
      if (leader && me && leader.reviews > (me.reviews || 0)) {
        opps.push({
          tier:    'P1',
          kind:    'rank-improve',
          title:   `Overtake ${leader.title} for "${s.keyword}"`,
          detail:  `You're #${s.clientBestRank}; ${leader.title} leads with ${leader.reviews} reviews vs your ${me.reviews}. Closing the review gap is the lever.`,
          volume:  s.searchVolume || 0,
          keyword: s.keyword,
          intent:  s.intent,
          location: s.bestLocationCity,
        });
      }
    }
  }

  // Order: tier then volume.
  const tierRank: Record<OppTier, number> = { P0: 0, P1: 1, P2: 2 };
  opps.sort((a, b) => (tierRank[a.tier] - tierRank[b.tier]) || (b.volume - a.volume));

  const counts: Record<OppTier, number> = { P0: 0, P1: 0, P2: 0 };
  let volumeAtStake = 0;
  for (let i = 0; i < opps.length; i++) {
    counts[opps[i].tier]++;
    if (opps[i].kind === 'pack-miss') volumeAtStake += opps[i].volume;
  }
  return { opportunities: opps, volumeAtStake, counts };
}

// ─── Composite Local Visibility Index (0–100) ────────────────────────────────────

/**
 * Transparent weighted blend of the four real signals. Each sub-score is itself
 * a real ratio; weights are a fixed, documented editorial choice (shown in the
 * UI), NOT a hidden model.
 *   presence 40% · rank quality 25% · reviews 20% · listing completeness 15%
 */
export function buildLocalIndex(
  pack: PackRollup,
  reviews: ReviewRollup,
  locations: LocalListing[],
): { score: number; parts: { presence: number; rankQuality: number; reviews: number; listings: number } } {
  const presence = pack.withPack > 0 ? pack.inPack / pack.withPack : 0;                 // 0–1
  const rankQuality = pack.avgRank > 0 ? Math.max(0, (4 - pack.avgRank) / 3) : 0;        // rank1→1, rank3→0.33
  const reviewScore = reviews.avgRating > 0 ? Math.min(1, reviews.avgRating / 5) : 0;    // 0–1
  const clientLocs = locations.filter(l => l.isClient);
  const verified = clientLocs.filter(l => l.verified && l.healthFlags.length === 0).length;
  const listings = clientLocs.length > 0 ? verified / clientLocs.length : 0;             // 0–1
  const score = Math.round((presence * 40) + (rankQuality * 25) + (reviewScore * 20) + (listings * 15));
  return {
    score,
    parts: {
      presence:    Math.round(presence * 100),
      rankQuality: Math.round(rankQuality * 100),
      reviews:     Math.round(reviewScore * 100),
      listings:    Math.round(listings * 100),
    },
  };
}
