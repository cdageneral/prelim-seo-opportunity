/**
 * lib/local/crawl.ts — v7.338 (Local Search panel)
 *
 * GENERIC directory CRAWLER for a client's own store-locator subdomain.
 *
 * Many multi-location brands publish a Yext-style directory that has NO single
 * page listing every office — the front door is a country/region index that
 * links to state pages, which link to city pages, which link to individual
 * store pages (e.g. TD Bank: locations.td.com/us -> /us/{state} -> /us/{state}/{city}
 * -> /us/{street-slug}). The v7.302 single-fetch reader (KML / sitemap / embedded
 * markers / `/location(s)/` hrefs) finds ZERO offices on such a directory because
 * the addresses live several clicks deep and the URL scheme is `/us/{slug}`, not
 * `/location(s)/`.
 *
 * This module walks that tree from the seed URL the user provides:
 *   1. Fetch a page. If it carries a single-business signal (a `geo.position`
 *      meta tag, or a schema.org address) it is a STORE LEAF -- hydrate its REAL
 *      address / phone / GPS from the page's own markup and record it.
 *   2. Otherwise it is a DIRECTORY page -- pull its same-subdomain links that stay
 *      under the seed's path and enqueue the unvisited ones.
 * BFS with bounded concurrency + a dedup set, staying on the seed's host and path
 * prefix so it never wanders onto the marketing site. Branches only: standalone
 * ATMs (a leaf named "...ATM" with no phone) are excluded.
 *
 * Real data only (Const I.1): every field of every office comes from that office
 * page's OWN markup -- meta geo.position (exact lat;lng), the Google-Maps
 * directions link text / og:title (street, city, state, zip) and the tel: link
 * (phone). Nothing is modeled. Completeness by default (Const I.6): the crawl is
 * not top-N capped; a wall-clock budget only exists so one streamed request stays
 * under Vercel's 300s ceiling, and when it is hit the result is flagged `partial`
 * so the caller can persist progress and continue on the next scan rather than
 * silently dropping offices.
 *
 * The pure parsers (parse / extract / resolve / isAtmOnly helpers) take strings
 * only -- no DOM, no network -- so they unit-test in isolation. Only
 * `crawlLocations` does I/O. ES5-safe: RegExp.exec while-loops, Array-based
 * frontier, plain-object visited maps (no for...of over Set/Map iterators).
 */

import { parseAddress, parseLocationPageJsonLd, type KmlLocation } from './sitemap';

// --- pure helpers (string in, data out -- unit-testable, no network/DOM) --------

/** Minimal HTML-entity decode for the handful that appear in addresses/titles. */
function decodeEntities(s: string): string {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ');
}

/** First attribute value for a <meta name|property="key"> tag (either attr order). */
function metaContent(html: string, key: string): string {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('<meta[^>]*\\b(?:name|property)=["\']' + esc + '["\'][^>]*\\bcontent=["\']([^"\']*)["\']', 'i'),
    new RegExp('<meta[^>]*\\bcontent=["\']([^"\']*)["\'][^>]*\\b(?:name|property)=["\']' + esc + '["\']', 'i'),
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(html);
    if (m) return decodeEntities(m[1].trim());
  }
  return '';
}

/** Strip tags + collapse whitespace from an HTML fragment. */
function stripTags(s: string): string {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** "geo.position" meta -> { lat, lng }. Format is "lat;lng" (semicolon). null when absent/invalid. */
export function parseGeoPosition(html: string): { lat: number; lng: number } | null {
  const v = metaContent(html, 'geo.position');
  if (!v) return null;
  const m = /(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)/.exec(v);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat: lat, lng: lng };
}

/** "United States-DC" / "US-DC" -> "DC". '' when not present. */
function stateFromGeoRegion(region: string): string {
  const m = /-\s*([A-Za-z]{2})\s*$/.exec(String(region || ''));
  return m ? m[1].toUpperCase() : '';
}

/** Inner text of the Google-Maps directions link on a store page (carries the full
 *  address incl. zip), trimmed of the trailing "Click to get directions..." cruft. */
function mapsLinkAddress(html: string): string {
  const re = /<a\b[^>]*href=["'][^"']*(?:maps\.google|google\.[a-z.]+\/maps)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i;
  const m = re.exec(html);
  if (!m) return '';
  let t = stripTags(m[1]);
  t = t.replace(/click to get directions.*$/i, '').replace(/link opens in new tab.*$/i, '').trim();
  return t;
}

/** A US phone from the first tel: link -> "(202) 481-7828". '' when absent. */
function telPhone(html: string): string {
  const m = /href=["']tel:\+?([0-9]{7,15})["']/i.exec(html);
  if (!m) return '';
  let d = m[1];
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  return d;
}

/** Location name from og:title (before " - ") or <title> or <h1>. */
function leafName(html: string): string {
  const og = metaContent(html, 'og:title');
  let raw = og;
  if (!raw) { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); if (m) raw = stripTags(m[1]); }
  if (!raw) { const h = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html); if (h) raw = stripTags(h[1]); }
  const dash = raw.indexOf(' - ');
  return (dash >= 0 ? raw.slice(0, dash) : raw).trim();
}

/**
 * Does this page describe a single physical office? True when it carries a
 * geo.position meta OR a schema.org postal address. Directory (index / state /
 * city) pages carry neither -- that is the classifier between "record this leaf"
 * and "crawl this directory's children".
 */
export function isOfficeLeaf(html: string): boolean {
  if (parseGeoPosition(html)) return true;
  return parseLocationPageJsonLd(html) != null;
}

/** A leaf that is a STANDALONE ATM (exclude -- branches only). Conservative: the
 *  name calls out an ATM and the page lists no branch phone (branches have a tel:). */
export function isAtmOnly(name: string, phone: string): boolean {
  const n = String(name || '');
  const namesAtm = /\batm\b/i.test(n);
  const namesBranch = /\bstore\b/i.test(n) || /&\s*atm/i.test(n) || /bank\s*&/i.test(n);
  return namesAtm && !namesBranch && !phone;
}

/**
 * Hydrate a store leaf's REAL office record from its own page markup. Returns null
 * when the page is not a leaf (no geo.position and no JSON-LD address). Prefers the
 * page's schema.org JSON-LD when present (v7.303 parser); otherwise reads the
 * meta/tel/maps markup that Yext directory pages expose (TD has no JSON-LD).
 */
export function parseLeafOffice(html: string, pageUrl: string): KmlLocation | null {
  const jsonld = parseLocationPageJsonLd(html);
  const geo = parseGeoPosition(html);
  if (!jsonld && !geo) return null;

  const name = leafName(html) || (jsonld ? jsonld.city : '') || 'Location';
  const phone = telPhone(html) || (jsonld ? jsonld.phone : '') || '';

  // Address: JSON-LD first (structured), else the maps-link text (has zip), else og:title tail.
  let address = jsonld ? jsonld.address : '';
  if (!address) {
    address = mapsLinkAddress(html);
    if (!address) {
      const og = metaContent(html, 'og:title');
      const dash = og.indexOf(' - ');
      if (dash >= 0) address = og.slice(dash + 3).trim();
    }
  }

  // City / state / zip: JSON-LD wins; else the page's authoritative geo meta, then a
  // direct 5-digit regex for zip and a comma-parse only as a last resort. (TD's maps-link
  // address is not fully comma-delimited — "1299 First Street SE Washington, DC 20003 US" —
  // so parseAddress alone mis-splits it; geo.region/geo.placename are the reliable source.)
  let city = jsonld ? jsonld.city : '';
  let state = jsonld ? jsonld.state : '';
  let zip = jsonld ? jsonld.zip : '';
  if (!state) state = stateFromGeoRegion(metaContent(html, 'geo.region'));
  if (!city) { const gp = metaContent(html, 'geo.placename'); if (gp) city = gp.split(',')[0].trim(); }
  if (!zip) { const zm = /\b(\d{5})(?:-\d{4})?\b/.exec(address); if (zm) zip = zm[1]; }
  if (!city || !state) {
    const parsed = parseAddress(address.replace(/\bUS(?:A)?\b\.?\s*$/i, '').trim());
    if (!city) city = parsed.city;
    if (!state) state = parsed.state;
  }

  const lat = jsonld && jsonld.lat != null ? jsonld.lat : (geo ? geo.lat : null);
  const lng = jsonld && jsonld.lng != null ? jsonld.lng : (geo ? geo.lng : null);

  return {
    name: name, address: address, city: city, state: state, zip: zip, phone: phone, url: pageUrl,
    lat: (lat != null && isFinite(lat)) ? lat : null,
    lng: (lng != null && isFinite(lng)) ? lng : null,
  };
}

/** Resolve a possibly-relative href against the page URL. null on failure/non-http. */
export function resolveHref(pageUrl: string, href: string): string | null {
  const h = String(href || '').trim();
  if (!h || h.charAt(0) === '#') return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(h)) return null;
  try {
    const u = new URL(h, pageUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch (e) { return null; }
}

/** Path prefix a crawl is confined to: the seed's first path segment (e.g. "/us"),
 *  or "/" when it has none. Keeps the crawl inside the locator directory. */
export function confinePrefix(seedUrl: string): string {
  try {
    const u = new URL(seedUrl);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs.length ? '/' + segs[0] : '/';
  } catch (e) { return '/'; }
}

/**
 * Same-subdomain candidate links from a directory page that stay under the seed's
 * path prefix -- the state / city / store pages to visit next. Resolves relative
 * hrefs, drops off-host (e.g. www.td.com) and off-prefix links, assets, and query
 * URLs, and dedupes. Order preserved (first-seen). Returns origin+pathname keys.
 */
export function extractLocationLinks(html: string, pageUrl: string, seedHost: string, prefix: string): string[] {
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  const re = /<a\b[^>]*\bhref=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const abs = resolveHref(pageUrl, m[1]);
    if (!abs) continue;
    let u: URL;
    try { u = new URL(abs); } catch (e) { continue; }
    if (u.host !== seedHost) continue;                                   // stay on the locator subdomain
    if (prefix !== '/' && u.pathname.indexOf(prefix) !== 0) continue;    // stay under /us (etc.)
    if (u.search) continue;                                              // skip search/filter URLs
    if (/\.(?:css|js|png|jpe?g|gif|svg|webp|ico|pdf|xml|kml|json|woff2?|ttf)$/i.test(u.pathname)) continue;
    const key = u.origin + u.pathname;
    if (seen[key]) continue;
    seen[key] = true;
    out.push(key);
  }
  return out;
}

// --- crawler (the only part that does network I/O) ------------------------------

export interface CrawlProgress {
  found: number;     // offices recorded so far
  visited: number;   // pages fetched
  queued: number;    // pages still to fetch
  phase: string;
}

export interface CrawlResult {
  locations: KmlLocation[];
  source: string;          // 'crawl'
  partial: boolean;        // true if the wall-clock budget stopped it early
  pagesVisited: number;
}

const DEFAULT_CONCURRENCY = 12;
const DEFAULT_BUDGET_MS   = 240000;   // safety net so one streamed request stays < Vercel 300s (NOT a data cap)

/**
 * BFS-crawl the client's store-locator directory from `seedUrl`, returning every
 * branch office with real address/GPS/phone. `fetchText` is injected so the route
 * passes its browser-UA fetch (and the harness passes a fixture map). `onProgress`
 * is called after each page so the panel shows a live "found X / visited N" bar.
 */
export async function crawlLocations(
  seedUrl: string,
  fetchText: (url: string) => Promise<string | null>,
  onProgress?: (p: CrawlProgress) => void,
  opts?: { concurrency?: number; budgetMs?: number },
): Promise<CrawlResult> {
  const concurrency = (opts && opts.concurrency) || DEFAULT_CONCURRENCY;
  const budgetMs = (opts && opts.budgetMs) || DEFAULT_BUDGET_MS;
  let seedHost = '';
  try { seedHost = new URL(seedUrl).host; } catch (e) { return { locations: [], source: 'crawl', partial: false, pagesVisited: 0 }; }
  const prefix = confinePrefix(seedUrl);

  const startedAt = Date.now();
  const visited: Record<string, boolean> = {};
  const foundByKey: Record<string, boolean> = {};
  const locations: KmlLocation[] = [];
  const seedKey = (function () { try { const u = new URL(seedUrl); return u.origin + u.pathname; } catch (e) { return seedUrl; } })();
  let frontier: string[] = [seedKey];
  visited[seedKey] = true;
  let visitedCount = 0;
  let partial = false;

  const record = (loc: KmlLocation): void => {
    const key = String(loc.url || (loc.lat + ',' + loc.lng) || loc.name).toLowerCase();
    if (!key || foundByKey[key]) return;
    if (isAtmOnly(loc.name, loc.phone)) return;   // branches only
    foundByKey[key] = true;
    locations.push(loc);
  };

  // Process the frontier level-by-level with a bounded worker pool per level.
  while (frontier.length > 0) {
    if (Date.now() - startedAt > budgetMs) { partial = true; break; }
    const level = frontier;
    frontier = [];
    let next = 0;
    const nextLevelSet: Record<string, boolean> = {};

    const worker = async (): Promise<void> => {
      while (next < level.length) {
        if (Date.now() - startedAt > budgetMs) { partial = true; return; }
        const url = level[next++];
        const html = await fetchText(url);
        visitedCount++;
        if (html) {
          const leaf = parseLeafOffice(html, url);
          if (leaf) {
            record(leaf);
          } else {
            const links = extractLocationLinks(html, url, seedHost, prefix);
            for (let i = 0; i < links.length; i++) {
              const l = links[i];
              if (!visited[l] && !nextLevelSet[l]) nextLevelSet[l] = true;
            }
          }
        }
        if (onProgress) onProgress({ found: locations.length, visited: visitedCount, queued: frontier.length + Object.keys(nextLevelSet).length, phase: 'Crawling locations...' });
      }
    };

    const pool = Math.min(concurrency, level.length);
    const workers: Array<Promise<void>> = [];
    for (let i = 0; i < pool; i++) workers.push(worker());
    await Promise.all(workers);

    // Promote the discovered next level (mark visited so siblings dedupe across levels).
    const keys = Object.keys(nextLevelSet);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!visited[k]) { visited[k] = true; frontier.push(k); }
    }
    if (partial) break;
  }

  return { locations: locations, source: 'crawl', partial: partial, pagesVisited: visitedCount };
}
