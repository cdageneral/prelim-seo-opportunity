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

/** "123 Main St, Wichita Falls, TX 76308" → { city: 'Wichita Falls', state: 'TX' } */
export function cityStateFromAddress(address: string): { city: string; state: string } {
  const parts = String(address ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return { city: '', state: '' };
  const tail = parts[parts.length - 1];
  const m = /^([A-Za-z .]+?)\s*\d{5}(?:-\d{4})?$/.exec(tail);
  const state = (m ? m[1] : tail).trim();
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
 * office that does not match any City-type target is reported unresolved — never
 * silently attached to its state or country, which would report a whole state's demand
 * as one office's market.
 */
export function resolveOfficeLocations(
  offices: LocalListing[],
  dfsLocations: Array<{ locationCode: number; locationName: string; locationType: string; countryIso: string }>,
): { resolved: Record<string, { locationCode: number; locationName: string }>; unresolved: DemandUnresolved[] } {
  const byCityState: Record<string, { locationCode: number; locationName: string }> = {};
  const byCity: Record<string, Array<{ locationCode: number; locationName: string }>> = {};
  for (let i = 0; i < dfsLocations.length; i++) {
    const L = dfsLocations[i];
    if (String(L.locationType ?? '').toLowerCase() !== 'city') continue;
    const parts = String(L.locationName ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const city = normCity(parts[0]);
    const state = normCity(parts[1]);
    if (!city) continue;
    const entry = { locationCode: L.locationCode, locationName: L.locationName };
    const k = city + '|' + state;
    if (!byCityState[k]) byCityState[k] = entry;
    (byCity[city] = byCity[city] || []).push(entry);
  }
  const resolved: Record<string, { locationCode: number; locationName: string }> = {};
  const unresolved: DemandUnresolved[] = [];
  for (let i = 0; i < offices.length; i++) {
    const o = offices[i];
    const key = officeKey(o);
    const fromAddr = cityStateFromAddress(o.address ?? '');
    const city = normCity(o.city || fromAddr.city);
    const stateRaw = fromAddr.state;
    const state = normCity(STATE_BY_ABBR[stateRaw.toLowerCase()] || stateRaw);
    if (!city) { unresolved.push({ key, title: o.title, reason: 'no city on file — re-run the local scan' }); continue; }
    const exact = state ? byCityState[city + '|' + state] : undefined;
    if (exact) { resolved[key] = exact; continue; }
    const cands = byCity[city] ?? [];
    if (cands.length === 1) { resolved[key] = cands[0]; continue; }
    if (cands.length > 1) {
      unresolved.push({ key, title: o.title, reason: `"${o.city || fromAddr.city}" matches ${cands.length} markets — needs the state from a fresh scan` });
      continue;
    }
    unresolved.push({ key, title: o.title, reason: `no Google market named "${o.city || fromAddr.city}"` });
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
