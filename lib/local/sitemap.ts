/**
 * lib/local/sitemap.ts — v7.179 (Local Search panel)
 *
 * DETERMINISTIC discovery of a client's physical locations from its OWN website
 * — the authoritative, free, fully-defensible source (no SerpAPI credits, no
 * modeling). Many multi-location brands publish:
 *   • a sitemap index (sitemap.xml / sitemap_index.xml) → a `local-sitemap.xml`
 *     → a `locations.kml` carrying every store with name, address, phone, the
 *     location page URL, AND exact GPS coordinates; and/or
 *   • `/locations/{city}/` pages inside the page sitemap.
 *
 * This module is PURE string parsing (regex, no DOM, no network) so it is unit-
 * testable in isolation; the route does the fetching and passes XML strings in.
 * ES5-safe: no for…of over iterators (RegExp.exec while-loops), no block-scoped
 * function declarations.
 */

export interface KmlLocation {
  name:    string;          // placemark name (usually the city / market label)
  address: string;          // full address line
  city:    string;          // parsed from address
  state:   string;          // parsed from address
  zip:     string;          // parsed from address
  phone:   string;
  url:     string;          // the location page URL
  lat:     number | null;
  lng:     number | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Inner text of <tag>…</tag>, unwrapping an optional CDATA section. First match. */
function tagText(block: string, tag: string): string {
  const re = new RegExp('<' + tag + '\\b[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</' + tag + '>', 'i');
  const m = re.exec(block);
  return m ? m[1].trim() : '';
}

/** All <loc> values nested inside repeated <wrapTag>…</wrapTag> blocks. */
function locsIn(xml: string, wrapTag: string): string[] {
  const out: string[] = [];
  const re = new RegExp('<' + wrapTag + '\\b[^>]*>([\\s\\S]*?)</' + wrapTag + '>', 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const lm = /<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(m[1]);
    if (lm) out.push(lm[1].trim());
  }
  return out;
}

/** Parse "123 Main St, Suite 4, East Syracuse, New York, 13057, US" → city/state/zip. */
export function parseAddress(address: string): { city: string; state: string; zip: string } {
  const parts = String(address ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const p = parts.slice();
  if (p.length && /^(us|usa|u\.s\.a?\.?|united states)$/i.test(p[p.length - 1])) p.pop();
  let zip = '', state = '', city = '';
  if (p.length && /\d/.test(p[p.length - 1])) zip = p.pop() as string;
  if (p.length) state = p.pop() as string;
  if (p.length) city = p.pop() as string;
  return { city, state, zip };
}

// ─── public API ─────────────────────────────────────────────────────────────────

/** <loc> entries from a <sitemapindex> (child sitemaps). */
export function parseSitemapIndex(xml: string): string[] {
  return locsIn(xml, 'sitemap');
}

/** <loc> entries from a <urlset> (page URLs). */
export function parseUrlset(xml: string): string[] {
  return locsIn(xml, 'url');
}

/**
 * Pick the child sitemap most likely to hold locations (a "local"/"location"/
 * "store"/"kml" sitemap), else null. Case-insensitive on the URL.
 */
export function pickLocationSitemap(sitemapUrls: string[]): string | null {
  const pats = ['local', 'location', 'store', 'kml', 'geo'];
  for (let i = 0; i < sitemapUrls.length; i++) {
    const u = sitemapUrls[i].toLowerCase();
    for (let j = 0; j < pats.length; j++) { if (u.indexOf(pats[j]) >= 0) return sitemapUrls[i]; }
  }
  return null;
}

/** Every <Placemark> in a KML document → structured locations (with GPS). */
export function parseKmlPlacemarks(xml: string): KmlLocation[] {
  const out: KmlLocation[] = [];
  const re = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const name = tagText(b, 'name');
    const address = tagText(b, 'address');
    const phone = tagText(b, 'phoneNumber');
    const linkM = /<atom:link[^>]*href="([^"]+)"/i.exec(b);
    const url = linkM ? linkM[1].trim() : '';
    let lat: number | null = null, lng: number | null = null;
    // <coordinates>lng,lat[,alt]</coordinates> (KML order is lon,lat)
    const cM = /<coordinates>\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)/i.exec(b);
    if (cM) { lng = parseFloat(cM[1]); lat = parseFloat(cM[2]); }
    else {
      const la = tagText(b, 'latitude'), lo = tagText(b, 'longitude');
      if (la) lat = parseFloat(la);
      if (lo) lng = parseFloat(lo);
    }
    const ad = parseAddress(address);
    out.push({
      name, address, city: ad.city, state: ad.state, zip: ad.zip, phone, url,
      lat: (lat != null && isFinite(lat)) ? lat : null,
      lng: (lng != null && isFinite(lng)) ? lng : null,
    });
  }
  return out;
}

/**
 * Fallback when no KML exists: derive location records from `/locations/{slug}/`
 * page URLs found in a page sitemap. No coordinates (those need a geocode/Maps
 * lookup), but the page list + city slug is still authoritative and free.
 */
// US state + DC postal abbreviations — used to split a trailing state code off a location
// slug (e.g. "plymouth-mn" → city "plymouth", state "MN").
const US_STATE_ABBR: Record<string, boolean> = (function () {
  const m: Record<string, boolean> = {};
  ['al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy','dc'].forEach(x => { m[x] = true; });
  return m;
})();

export function parseLocationUrls(
  urls: string[],
  // v7.301 — accept BOTH the singular `/location/` and plural `/locations/` conventions
  // (plus office/branch), since clients differ. WEG uses `/location/{city}-{st}` (singular);
  // the old `/locations/`-only hint matched none → 0 locations discovered. Order matters only
  // for which hint is reported; the two never overlap ("/location/" is not a substring of
  // "/locations/{slug}"). Service sub-pages ("/location/{city}/{service}") are skipped by the
  // single-segment rule.
  pathHints: string[] = ['/location/', '/locations/', '/office/', '/offices/', '/branch/', '/branches/'],
): KmlLocation[] {
  const out: KmlLocation[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const lu = u.toLowerCase();
    let tail = '';
    for (let h = 0; h < pathHints.length; h++) {
      const idx = lu.indexOf(pathHints[h]);
      if (idx < 0) continue;
      const t = lu.slice(idx + pathHints[h].length).replace(/\/+$/, '');
      if (!t || t.indexOf('/') >= 0) continue;      // only the first segment (a city/office slug)
      tail = t; break;
    }
    if (!tail || seen[tail]) continue;
    seen[tail] = true;
    // Split a trailing US state code off the slug: "plymouth-mn" → city "plymouth", state "MN".
    const parts = tail.split('-').filter(Boolean);
    let state = '';
    if (parts.length >= 2 && US_STATE_ABBR[parts[parts.length - 1]]) {
      state = (parts.pop() as string).toUpperCase();
    }
    const label = parts.join(' ').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    out.push({ name: state ? `${label}, ${state}` : label, address: '', city: label, state, zip: '', phone: '', url: u, lat: null, lng: null });
  }
  return out;
}

/** A single office's real detail, parsed from the page's schema.org JSON-LD (no guessing). */
export interface LocationDetail {
  address: string; city: string; state: string; zip: string; phone: string;
  lat: number | null; lng: number | null;
}

/**
 * v7.303 — parse a location page's schema.org JSON-LD (LocalBusiness / FinancialService /
 * Organization / Place) for its REAL address, phone and GPS. Returns the first business node
 * that carries a postal address. Pure string/JSON parsing — no DOM, no network, no modeling
 * (Const I.1: every field traces to the client's own structured markup). null when absent.
 */
export function parseLocationPageJsonLd(html: string): LocationDetail | null {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  for (let i = 0; i < blocks.length; i++) {
    let data: any;
    try { data = JSON.parse(blocks[i].trim()); } catch { continue; }
    const nodes: any[] = Array.isArray(data) ? data : (Array.isArray(data['@graph']) ? data['@graph'] : [data]);
    for (let j = 0; j < nodes.length; j++) {
      const n = nodes[j];
      if (!n || typeof n !== 'object' || !n.address) continue;
      const a = n.address || {};
      const street = Array.isArray(a.streetAddress) ? a.streetAddress.filter(Boolean).join(', ') : String(a.streetAddress || '');
      const city = String(a.addressLocality || '').trim();
      const state = String(a.addressRegion || '').trim();
      const zip = String(a.postalCode || '').trim();
      const cityState = [city, state].filter(Boolean).join(', ');
      const address = [street, cityState, zip].filter(Boolean).join(', ');
      const phone = String(n.telephone || '').trim();
      const g = n.geo || {};
      const latN = Number(g.latitude), lngN = Number(g.longitude);
      const lat = isFinite(latN) && g.latitude != null && g.latitude !== '' ? latN : null;
      const lng = isFinite(lngN) && g.longitude != null && g.longitude !== '' ? lngN : null;
      if (street || phone || lat != null) return { address, city, state, zip, phone, lat, lng };
    }
  }
  return null;
}

/** City + state vocabulary from discovered locations (lowercase) for the geo detector. */
export function geoVocabFromLocations(locs: KmlLocation[]): string[] {
  const set: Record<string, boolean> = {};
  for (let i = 0; i < locs.length; i++) {
    const c = (locs[i].city || '').toLowerCase().trim();
    const s = (locs[i].state || '').toLowerCase().trim();
    if (c) set[c] = true;
    if (s) set[s] = true;
  }
  return Object.keys(set);
}
