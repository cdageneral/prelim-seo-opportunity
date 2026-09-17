/**
 * lib/local/localDemand.ts — v7.504 (Local Search panel · demand by location)
 *
 * PURE model for "how much local search demand sits in each office's market".
 * Two kinds of local-intent keyword, counted on two different bases — never mixed,
 * never modeled (Const I.1 / I.5a):
 *
 *   1. CITY-NAMED ("liposuction wichita falls") — the searcher wrote the market into
 *      the query, so the national figure already IS that market's demand. Attributed
 *      to the office(s) whose city the keyword names. Costs nothing: it is the
 *      Semrush volume already on file.
 *   2. PORTABLE ("lipo near me", "coolsculpting cost") — names no place, so a national
 *      figure says nothing about any one market. The only defensible number is Google's
 *      own volume for that keyword AS SEEN FROM the office's location, which is what the
 *      Google Ads Search Volume read supplies per location_code.
 *
 * Two markets inside one metro share searchers: offices resolving to the SAME
 * location_code are marked as sharing it, and the portfolio total counts each
 * location_code once, so nothing is double-counted.
 *
 * A keyword Google reports no figure for in a market comes back null and is counted as
 * "below reporting threshold", never as a zero (I.5 — a gap is not a measurement).
 *
 * Pure functions, ES5-safe, no network, no DB — unit-tested in isolation.
 */

import type { LocalListing } from './build';
import type { LocalKeyword } from './detect';

export interface DemandLocationRow {
  key:            string;    // office key (page URL, else title)
  title:          string;
  city:           string;
  state:          string;
  locationCode:   number | null;
  locationName:   string;    // the Google geo target this office resolved to
  sharesMarket:   string[];  // other office titles resolving to the same location_code
  cityNamedKw:    number;
  cityNamedVolume: number;   // Semrush volume of keywords naming this office's city
  portableKw:     number;    // keywords priced in this market
  portableVolume: number;    // Google Ads volume in this market (measured)
  belowThreshold: number;    // priced keywords Google reported no figure for
  totalVolume:    number;    // cityNamedVolume + portableVolume
  measuredAt:     string | null;
}

export interface DemandUnresolved { key: string; title: string; reason: string }

/**
 * v7.509 — a matched Google Ads geo target. `locationType` is Google's own type for the
 * place ("City", "Town", "Municipality", …), carried so the panel can name what it
 * matched rather than implying every market is a city.
 */
export interface ResolvedMarket { locationCode: number; locationName: string; locationType: string }

export interface LocalDemand {
  builtAt:        string;
  languageCode:   string;
  countryIso:     string;
  keywordCap:     number;         // per-request cap actually applied
  portableKeywords: string[];     // the exact keywords priced in every market
  rows:           DemandLocationRow[];
  unresolved:     DemandUnresolved[];
  callsUsed:      number;
  costUSD:        number;
  source:         string;         // provider label, for the on-panel basis line
}

/** Office key: the page URL if it has one, else the title. Matches listingIntegrity. */
export function officeKey(l: { pageUrl?: string; title?: string }): string {
  return String(l.pageUrl || l.title || '').toLowerCase().trim();
}

const CITY_NOISE = /\b(city|town|county|metro|area|greater)\b/g;

export function normCity(c: string): string {
  return String(c ?? '').toLowerCase().replace(CITY_NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Address → { city, state }. Handles both shapes the parsers produce:
 *   "123 Main St, Wichita Falls, TX 76308"                     (state and ZIP together)
 *   "21650 Oxnard Street Suite #1450, Woodland Hills, California, 91367"  (ZIP on its own)
 * v7.506: the second shape is what schema.org markup yields, and reading it as the first
 * put the STATE in the city field ("California"), which no Google market is named after.
 */
export function cityStateFromAddress(address: string): { city: string; state: string } {
  const parts = String(address ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return { city: '', state: '' };
  const last = parts[parts.length - 1];
  if (/^\d{5}(?:-\d{4})?$/.test(last)) {
    // …, City, State, ZIP
    return { city: parts[parts.length - 3] || '', state: parts[parts.length - 2] || '' };
  }
  const m = /^([A-Za-z .]+?)\s*\d{5}(?:-\d{4})?$/.exec(last);
  const state = (m ? m[1] : last).trim();
  const city = parts[parts.length - 2] || '';
  return { city, state };
}

/**
 * Split the project's local-intent keywords into the two bases above.
 * A keyword is CITY-NAMED when it contains one of the offices' city names; every other
 * local-intent keyword is portable and gets priced per market.
 */
export function splitLocalKeywords(
  locals: LocalKeyword[],
  offices: Array<{ city?: string; title?: string; address?: string; pageUrl?: string }>,
): { cityNamed: Array<{ keyword: string; volume: number; cities: string[] }>; portable: Array<{ keyword: string; volume: number }> } {
  const cities: string[] = [];
  const seenCity: Record<string, boolean> = {};
  for (let i = 0; i < offices.length; i++) {
    const o = offices[i];
    const c = normCity(o.city || cityStateFromAddress(o.address ?? '').city || o.title || '');
    if (c && c.length >= 3 && !seenCity[c]) { seenCity[c] = true; cities.push(c); }
  }
  // Longest first so "wichita falls" wins over "wichita".
  cities.sort((a, b) => b.length - a.length);
  const cityNamed: Array<{ keyword: string; volume: number; cities: string[] }> = [];
  const portable: Array<{ keyword: string; volume: number }> = [];
  for (let i = 0; i < locals.length; i++) {
    const kw = String(locals[i].keyword ?? '').toLowerCase().trim();
    if (!kw) continue;
    const padded = ' ' + kw.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    const hits: string[] = [];
    for (let j = 0; j < cities.length; j++) {
      if (padded.indexOf(' ' + cities[j] + ' ') >= 0) {
        // a longer city already matched inside this keyword ⇒ skip the shorter one
        let covered = false;
        for (let k = 0; k < hits.length; k++) { if (hits[k].indexOf(cities[j]) >= 0) { covered = true; break; } }
        if (!covered) hits.push(cities[j]);
      }
    }
    if (hits.length) cityNamed.push({ keyword: locals[i].keyword, volume: locals[i].searchVolume || 0, cities: hits });
    else portable.push({ keyword: locals[i].keyword, volume: locals[i].searchVolume || 0 });
  }
  portable.sort((a, b) => b.volume - a.volume);
  return { cityNamed, portable };
}

/**
 * Resolve each office to a Google Ads geo target. Matching is literal: the office's
 * city (and state, when the list carries it) against the geo target's own name. An
 * office that does not match any target is reported unresolved — never silently
 * attached to its state or country, which would report a whole state's demand as one
 * office's market.
 *
 * v7.509 — the list is no longer filtered to `location_type = "City"` before matching.
 * Google types a geo target by what the place IS, and a place people call a city is
 * often typed something else: Amherst, New York is a TOWN, so the six City-typed
 * "Amherst" targets are all in other states and an office with "Amherst, New York" on
 * file matched none of them. Matching still requires the target's FIRST name part to be
 * the office's city, which is what keeps a county or state row ("Erie County,New York")
 * from ever being taken as a city. A City-typed target still wins when one exists for
 * the same city and state; only when none does is another type taken, and the type is
 * carried on the result so the panel can name it.
 */
export function resolveOfficeLocations(
  offices: LocalListing[],
  dfsLocations: Array<{ locationCode: number; locationName: string; locationType: string; countryIso: string }>,
): { resolved: Record<string, ResolvedMarket>; unresolved: DemandUnresolved[] } {
  const byCityState: Record<string, ResolvedMarket> = {};        // City-typed only
  const byCityStateAny: Record<string, ResolvedMarket> = {};     // any type
  const byCity: Record<string, ResolvedMarket[]> = {};           // City-typed only
  const byCityAny: Record<string, ResolvedMarket[]> = {};        // any type
  for (let i = 0; i < dfsLocations.length; i++) {
    const L = dfsLocations[i];
    const type = String(L.locationType ?? '');
    const isCityType = type.toLowerCase() === 'city';
    const parts = String(L.locationName ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const city = normCity(parts[0]);
    if (!city) continue;
    const entry: ResolvedMarket = { locationCode: L.locationCode, locationName: L.locationName, locationType: type };
    // v7.508 — a Google geo target names the city, then EVERY level above it:
    // "Amherst,Erie County,New York,United States". Keying only on the part right after
    // the city matched the county, so an office with its state on file still read as
    // ambiguous ("Amherst matches 6 markets"). Every level above the city is keyed.
    for (let j = 1; j < parts.length; j++) {
      const level = normCity(parts[j]);
      if (!level) continue;
      const k = city + '|' + level;
      if (!byCityStateAny[k]) byCityStateAny[k] = entry;
      if (isCityType && !byCityState[k]) byCityState[k] = entry;
    }
    (byCityAny[city] = byCityAny[city] || []).push(entry);
    if (isCityType) (byCity[city] = byCity[city] || []).push(entry);
  }
  const resolved: Record<string, ResolvedMarket> = {};
  const unresolved: DemandUnresolved[] = [];
  for (let i = 0; i < offices.length; i++) {
    const o = offices[i];
    const key = officeKey(o);
    const fromAddr = cityStateFromAddress(o.address ?? '');
    const city = normCity(o.city || fromAddr.city);
    const stateRaw = fromAddr.state;
    const state = normCity(STATE_BY_ABBR[stateRaw.toLowerCase()] || stateRaw);   // an abbreviation maps to the full name the geo-target list uses; a full name passes through
    const shown = o.city || fromAddr.city;
    if (!city) { unresolved.push({ key, title: o.title, reason: 'no city on file — re-run the local scan' }); continue; }
    const exact = state ? (byCityState[city + '|' + state] ?? byCityStateAny[city + '|' + state]) : undefined;
    if (exact) { resolved[key] = exact; continue; }
    const cands = byCity[city] ?? [];
    const candsAny = byCityAny[city] ?? [];
    if (cands.length === 1) { resolved[key] = cands[0]; continue; }
    if (cands.length === 0 && candsAny.length === 1) { resolved[key] = candsAny[0]; continue; }
    // v7.509 — say what was actually read. "needs the state from a fresh scan" was wrong
    // whenever the state WAS on file and simply had no market of its own (I.5).
    if (candsAny.length > 1) {
      unresolved.push({
        key, title: o.title,
        reason: state
          ? `"${shown}, ${stateRaw}" is not one of the ${candsAny.length} Google markets named "${shown}" — nearest named: ${candsAny.slice(0, 3).map(c => c.locationName).join('; ')}`
          : `"${shown}" matches ${candsAny.length} markets and this office has no state on file — re-run the local scan`,
      });
      continue;
    }
    unresolved.push({
      key, title: o.title,
      reason: state ? `no Google market named "${shown}, ${stateRaw}"` : `no Google market named "${shown}"`,
    });
  }
  return { resolved, unresolved };
}

/** US state abbreviation → full name (the geo-target list spells states in full). */
export const STATE_BY_ABBR: Record<string, string> = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California', co: 'Colorado',
  ct: 'Connecticut', de: 'Delaware', dc: 'District of Columbia', fl: 'Florida', ga: 'Georgia',
  hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas',
  ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland', ma: 'Massachusetts',
  mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri', mt: 'Montana',
  ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico',
  ny: 'New York', nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma',
  or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota',
  tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia', wa: 'Washington',
  wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming',
};

/** City-named volume per office, from keywords that name that office's city. */
export function cityNamedByOffice(
  offices: LocalListing[],
  cityNamed: Array<{ keyword: string; volume: number; cities: string[] }>,
): Record<string, { kw: number; volume: number }> {
  const out: Record<string, { kw: number; volume: number }> = {};
  for (let i = 0; i < offices.length; i++) {
    const o = offices[i];
    const key = officeKey(o);
    const city = normCity(o.city || cityStateFromAddress(o.address ?? '').city || o.title || '');
    let kw = 0, volume = 0;
    if (city) {
      for (let j = 0; j < cityNamed.length; j++) {
        if (cityNamed[j].cities.indexOf(city) >= 0) { kw++; volume += cityNamed[j].volume || 0; }
      }
    }
    out[key] = { kw, volume };
  }
  return out;
}

/** City/state vocabulary from the office rows, for the local-intent detector. */
export function geoVocabFromOffices(offices: Array<{ city?: string; address?: string; title?: string }>): string[] {
  const set: Record<string, boolean> = {};
  for (let i = 0; i < offices.length; i++) {
    const o = offices[i];
    const fromAddr = cityStateFromAddress(o.address ?? '');
    const c = String(o.city || fromAddr.city || '').toLowerCase().trim();
    const st = String(fromAddr.state || '').toLowerCase().trim();
    if (c) set[c] = true;
    if (st) set[st] = true;
    if (st && STATE_BY_ABBR[st]) set[STATE_BY_ABBR[st].toLowerCase()] = true;
  }
  return Object.keys(set);
}

/** Portfolio totals that never count one market twice. */
export function demandPortfolioTotals(rows: DemandLocationRow[]): {
  markets: number; offices: number; portableVolume: number; cityNamedVolume: number; totalVolume: number; belowThreshold: number;
} {
  const seen: Record<string, boolean> = {};
  let portableVolume = 0, belowThreshold = 0;
  let cityNamedVolume = 0;
  const seenCityMarket: Record<string, boolean> = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = r.locationCode == null ? '' : String(r.locationCode);
    if (code && !seen[code]) {
      seen[code] = true;
      portableVolume += r.portableVolume || 0;
      belowThreshold += r.belowThreshold || 0;
    }
    const cityKey = normCity(r.city) || r.key;
    if (!seenCityMarket[cityKey]) { seenCityMarket[cityKey] = true; cityNamedVolume += r.cityNamedVolume || 0; }
  }
  return {
    markets: Object.keys(seen).length,
    offices: rows.length,
    portableVolume,
    cityNamedVolume,
    totalVolume: portableVolume + cityNamedVolume,
    belowThreshold,
  };
}

/** Offices sharing one Google market, so the panel can say so on the row. */
export function marketSharers(rows: Array<{ key: string; title: string; locationCode: number | null }>): Record<string, string[]> {
  const byCode: Record<string, string[]> = {};
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].locationCode == null ? '' : String(rows[i].locationCode);
    if (!c) continue;
    (byCode[c] = byCode[c] || []).push(rows[i].title);
  }
  const out: Record<string, string[]> = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c = r.locationCode == null ? '' : String(r.locationCode);
    const all = c ? (byCode[c] ?? []) : [];
    out[r.key] = all.filter(t => t !== r.title);
  }
  return out;
}
