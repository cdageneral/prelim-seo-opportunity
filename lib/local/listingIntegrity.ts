/**
 * lib/local/listingIntegrity.ts — v7.502 (Local Search panel)
 *
 * ONE read-time check that decides whether a stored office row's address and Google
 * rating can be shown as that office's own. Shared by the panel, the review rollup
 * (and therefore the Assessment PDF), and the reviews-fetch route (Const II.7).
 *
 * Why it exists: before v7.502 the page parser returned the FIRST JSON-LD node with an
 * address, which on SEO-plugin sites is the site-wide Organization (HQ). Sono Bello's
 * scan stamped 54 of 141 offices with the Kirkland HQ address and national phone, the
 * per-office Google lookup then searched "Sono Bello Kirkland" for all 54 and wrote the
 * same Google profile (4.9 / 153 reviews) onto every one, and each was marked Verified.
 *
 * Two facts make a row untrustworthy, both measured from the rows themselves (nothing
 * is modeled):
 *   1. SHARED PROFILE — one Google place id attached to more than one office. A Google
 *      Business Profile belongs to one physical location, so the rating is not any of
 *      theirs. Rating, reviews, place id and Verified are withheld on all of them.
 *   2. TEMPLATE ADDRESS — the same street address (and phone) on TEMPLATE_MIN or more
 *      offices that have different pages. That is a site-wide address, not an office's.
 *      Address, phone and the city parsed from it are withheld.
 * Two offices sharing an address below the template threshold are reported as a
 * possible duplicate, not altered.
 *
 * Stored rows are left as they are; a fresh local scan re-reads every office page with the
 * v7.502 parser and the per-office Google lookup then matches strictly (GPS / ZIP). Pure functions, ES5-safe, never mutates its input.
 */

import type { LocalListing } from './build';

export const TEMPLATE_MIN = 3;

export type IntegrityIssue = 'shared-profile' | 'template-address';

export interface CheckedListing extends LocalListing {
  integrity?: IntegrityIssue[];     // present only when something was withheld
  duplicateOf?: string;             // title of the other office at the identical address
}

export interface IntegrityReport {
  listings:            CheckedListing[];
  sharedProfileRows:   number;      // offices whose rating was withheld
  sharedProfileGroups: number;      // distinct Google profiles attached to >1 office
  templateAddressRows: number;      // offices whose address/phone was withheld
  duplicatePairs:      number;      // address pairs below the template threshold
}

export function normAddress(a: string): string {
  return String(a ?? '').toLowerCase()
    .replace(/\b(suite|ste|unit|#)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function officeKey(l: LocalListing): string {
  return (l.pageUrl || l.title || '').toLowerCase().trim();
}

export function checkListingIntegrity(locations: LocalListing[]): IntegrityReport {
  const src = Array.isArray(locations) ? locations : [];
  const byPlace: Record<string, Record<string, boolean>> = {};
  const byAddr: Record<string, Record<string, boolean>> = {};
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    if (!l || !l.isClient) continue;
    const k = officeKey(l);
    if (l.placeId && l.rating != null) { (byPlace[l.placeId] = byPlace[l.placeId] || {})[k] = true; }
    const na = normAddress(l.address);
    if (na) { (byAddr[na] = byAddr[na] || {})[k] = true; }
  }
  let sharedProfileRows = 0, templateAddressRows = 0;
  const groups: Record<string, boolean> = {};
  const pairs: Record<string, boolean> = {};
  const out: CheckedListing[] = [];
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    if (!l || !l.isClient) { out.push(l as CheckedListing); continue; }
    const row: CheckedListing = { ...l, healthFlags: (l.healthFlags ?? []).slice() };
    const issues: IntegrityIssue[] = [];
    if (l.placeId && l.rating != null && Object.keys(byPlace[l.placeId] || {}).length > 1) {
      issues.push('shared-profile');
      groups[l.placeId] = true;
      sharedProfileRows++;
      row.rating = null; row.reviews = 0; row.placeId = ''; row.verified = false;
      row.healthFlags = row.healthFlags.filter(f => f !== 'low rating' && f !== 'few reviews');
      row.healthFlags.push('Google profile matched to several offices — rating withheld');
    }
    const na = normAddress(l.address);
    const sharing = na ? Object.keys(byAddr[na] || {}).length : 0;
    if (sharing >= TEMPLATE_MIN) {
      issues.push('template-address');
      templateAddressRows++;
      row.address = ''; row.phone = ''; row.city = ''; row.verified = false;
      row.healthFlags.push('site-wide address, not this office — re-run the local scan');
    } else if (sharing === 2 && issues.length === 0) {
      // A pair whose rating is already withheld is a wrong profile match, not a duplicate page.
      for (let j = 0; j < src.length; j++) {
        const o = src[j];
        if (j !== i && o && o.isClient && normAddress(o.address) === na && officeKey(o) !== officeKey(l)) {
          row.duplicateOf = o.title;
          pairs[[officeKey(l), officeKey(o)].sort().join('|')] = true;
          break;
        }
      }
    }
    if (issues.length) row.integrity = issues;
    out.push(row);
  }
  return {
    listings: out,
    sharedProfileRows,
    sharedProfileGroups: Object.keys(groups).length,
    templateAddressRows,
    duplicatePairs: Object.keys(pairs).length,
  };
}

/** Great-circle distance in km (for matching a Google profile to an office's GPS). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Max distance between an office's own GPS and a Google profile for them to be the same place. */
export const PROFILE_MATCH_KM = 2;
