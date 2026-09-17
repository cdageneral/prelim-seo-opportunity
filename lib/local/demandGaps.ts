/**
 * lib/local/demandGaps.ts — v7.505 (Local Search panel · demand vs coverage)
 *
 * Puts two things that were already measured side by side and says which markets are
 * worth acting on FIRST: how much monthly demand a market holds (v7.504) against what
 * the client actually holds there (map-pack presence from the scan, and the office's own
 * Google profile through the v7.502 integrity check).
 *
 * Every row is a classification over measured inputs — no scoring model, no weighting,
 * nothing invented (Const I.1 / I.5a). The gap kinds, in the order they are tested:
 *
 *   no-profile        — the office has no Google Business Profile on file after a lookup.
 *                       It cannot rank in a map pack at all, so demand here is unreachable
 *                       until the listing exists.
 *   absent-from-pack  — packs were found on this market's keywords and the client appears
 *                       in none of them.
 *   weak-reputation   — the client does appear, but the office sits under the rating or
 *                       review floor, which is the usual brake on pack rank.
 *   thin-listing      — appears, rating fine, but the listing is missing address or phone.
 *   covered           — nothing measured is wrong here.
 *   not-measured      — demand or coverage has not been measured for this market yet. An
 *                       honest gap, never scored as a zero (I.5).
 *
 * "Demand at stake" is the market's own measured monthly demand — it is not a forecast of
 * traffic or revenue, and the panel says so.
 *
 * Pure functions, ES5-safe, no network, no DB.
 */

import type { LocalListing, LocalKeywordScan } from './build';
import type { DemandLocationRow } from './localDemand';
import { normCity, officeKey } from './localDemand';

export const RATING_FLOOR = 4.0;    // the pack-rank gate the panel has used since v7.180
export const REVIEW_FLOOR = 25;     // "few reviews" threshold already used by the scan

export type GapKind = 'no-profile' | 'absent-from-pack' | 'weak-reputation' | 'thin-listing' | 'covered' | 'not-measured';

export interface DemandGapRow {
  key:            string;
  title:          string;
  city:           string;
  market:         string;          // the Google market this office resolved to
  demandMonthly:  number;          // measured monthly demand for this market
  demandMeasured: boolean;
  packsFound:     number;          // scanned keywords in this city that returned a pack
  packsHeld:      number;          // of those, how many the client appears in
  rating:         number | null;   // integrity-checked: a withheld rating reads as null
  reviews:        number;
  hasProfile:     boolean;         // a real Google profile was found for this office
  profileChecked: boolean;         // a lookup has been attempted
  listingComplete: boolean;        // address + phone on file
  gap:            GapKind;
  reason:         string;          // one sentence, stated from the measured inputs
}

function cityOf(l: { city?: string; title?: string }): string {
  return normCity(l.city || l.title || '');
}

/**
 * One row per office, ranked by the demand its market holds, with the gap that is
 * costing the most listed first. Offices whose market demand has not been measured are
 * kept and marked, never dropped and never given a number.
 */
export function buildDemandGaps(
  offices: LocalListing[],
  demandRows: DemandLocationRow[],
  scans: LocalKeywordScan[],
): DemandGapRow[] {
  const demandByKey: Record<string, DemandLocationRow> = {};
  for (let i = 0; i < demandRows.length; i++) demandByKey[demandRows[i].key] = demandRows[i];

  // map-pack coverage per city, from the scanned rows themselves
  const packByCity: Record<string, { found: number; held: number }> = {};
  for (let i = 0; i < scans.length; i++) {
    const s = scans[i];
    const c = normCity(String(s.city ?? s.bestLocationCity ?? ''));
    if (!c) continue;
    const e = packByCity[c] || (packByCity[c] = { found: 0, held: 0 });
    if (s.packPresent) {
      e.found++;
      if (s.clientBestRank != null) e.held++;
    }
  }

  const out: DemandGapRow[] = [];
  for (let i = 0; i < offices.length; i++) {
    const o = offices[i];
    if (!o || !o.isClient) continue;
    const key = officeKey(o);
    const d = demandByKey[key];
    const c = cityOf(o);
    const pack = packByCity[c] || { found: 0, held: 0 };
    const profileChecked = !!(o as any).reviewsFetchedAt;
    const hasProfile = o.rating != null;
    const listingComplete = !!o.address && !!o.phone;
    const demandMeasured = !!d && (!!d.measuredAt || d.cityNamedVolume > 0);
    const demandMonthly = d ? d.totalVolume : 0;

    let gap: GapKind = 'covered';
    let reason = '';
    if (!demandMeasured) {
      gap = 'not-measured';
      reason = d && d.locationCode == null
        ? 'This office has no Google market on file, so its demand has not been measured.'
        : 'Demand for this market has not been read yet.';
    } else if (profileChecked && !hasProfile) {
      gap = 'no-profile';
      reason = 'No Google Business Profile was returned for this office, so it cannot hold a map-pack slot at all.';
    } else if (pack.found > 0 && pack.held === 0) {
      gap = 'absent-from-pack';
      reason = `Packs appeared on ${pack.found} scanned keyword${pack.found !== 1 ? 's' : ''} in this market and this office appears in none of them.`;
    } else if (hasProfile && ((o.rating as number) < RATING_FLOOR || o.reviews < REVIEW_FLOOR)) {
      gap = 'weak-reputation';
      reason = (o.rating as number) < RATING_FLOOR
        ? `Rated ${(o.rating as number).toFixed(1)} on ${o.reviews} reviews — under the ${RATING_FLOOR.toFixed(1)} bar that usually gates pack rank.`
        : `Only ${o.reviews} review${o.reviews !== 1 ? 's' : ''} on file, under the ${REVIEW_FLOOR}-review floor competitors in this market clear.`;
    } else if (!listingComplete) {
      gap = 'thin-listing';
      reason = !o.address ? 'No address on file for this office.' : 'No phone number on file for this office.';
    } else {
      reason = pack.found > 0
        ? `Holds a pack slot on ${pack.held} of ${pack.found} scanned keywords, with a listing that clears the rating and review floors.`
        : 'Listing and reputation clear the floors; no pack was found on the scanned keywords in this market.';
    }

    out.push({
      key, title: o.title, city: o.city || '', market: d ? d.locationName : '',
      demandMonthly, demandMeasured,
      packsFound: pack.found, packsHeld: pack.held,
      rating: o.rating, reviews: o.reviews,
      hasProfile, profileChecked, listingComplete,
      gap, reason,
    });
  }

  // Measured rows first, then by demand — the biggest reachable gap at the top.
  out.sort((a, b) => {
    if (a.demandMeasured !== b.demandMeasured) return a.demandMeasured ? -1 : 1;
    return b.demandMonthly - a.demandMonthly;
  });
  return out;
}

export interface DemandGapTotals {
  markets: number;
  atStake: number;                      // demand in markets carrying any gap (each market once)
  byKind: Record<GapKind, { offices: number; demand: number }>;
}

/** Totals that count one Google market once, so two offices in a metro never double it. */
export function demandGapTotals(rows: DemandGapRow[]): DemandGapTotals {
  const byKind: Record<GapKind, { offices: number; demand: number }> = {
    'no-profile':       { offices: 0, demand: 0 },
    'absent-from-pack': { offices: 0, demand: 0 },
    'weak-reputation':  { offices: 0, demand: 0 },
    'thin-listing':     { offices: 0, demand: 0 },
    'covered':          { offices: 0, demand: 0 },
    'not-measured':     { offices: 0, demand: 0 },
  };
  const seenMarket: Record<string, boolean> = {};
  let atStake = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const k = byKind[r.gap];
    k.offices++;
    const marketKey = (r.market || r.city || r.key).toLowerCase();
    if (!seenMarket[marketKey]) {
      seenMarket[marketKey] = true;
      k.demand += r.demandMonthly;
      if (r.gap !== 'covered' && r.gap !== 'not-measured') atStake += r.demandMonthly;
    }
  }
  return { markets: Object.keys(seenMarket).length, atStake, byKind };
}

export const GAP_LABEL: Record<GapKind, string> = {
  'no-profile':       'No Google profile',
  'absent-from-pack': 'Absent from the pack',
  'weak-reputation':  'Under the review bar',
  'thin-listing':     'Incomplete listing',
  'covered':          'Nothing measured wrong',
  'not-measured':     'Not measured yet',
};
