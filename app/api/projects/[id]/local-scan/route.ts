/**
 * POST /api/projects/[id]/local-scan — on-demand Local Search scan (v7.177)
 *
 * Builds the Local panel's real data in three steps, all from existing APIs:
 *   1. DISCOVER LISTINGS  — google_maps search for the client brand → the
 *      client's Google Business listings (rating, reviews, GPS, website). City
 *      / neighborhood names from these feed the geo-modifier detector so local
 *      keyword detection adapts to THIS client.
 *   2. DETECT LOCAL KW    — classifyLocalKeywords over the canonical kw pool
 *      (buildKwPool — same pool as every other panel). Take the top N by real
 *      Semrush volume (Wayne's "top local keywords by volume" choice).
 *   3. MAP-PACK SCAN      — for each local keyword, read the Google local 3-pack
 *      from each client location's GPS (engine=google + ll). Record the client's
 *      best pack rank + the pack members → share-of-voice + opportunities.
 *
 * Persists `semrushSnapshot._localScan` (additive JSONB), mirroring _pageMap /
 * _demandUniverse. Streamed NDJSON progress (start / progress / done / error)
 * with a determinate bar + ETA, per the global progress rule.
 *
 * COST (SerpAPI search credits): 1 discovery + (scannedKeywords × locationsUsed).
 * dryRun:true returns the plan + estimated credits without spending any.
 *
 * Body: { maxSeeds?: number (def 10, cap 10), maxLocations?: number (def 25, cap 200),
 *         services?: string[] (v7.284 curated service terms — brand added server-side), dryRun?: boolean }
 *        v7.183: scan = service seeds × locations grid ("{service} {city}" map-pack per location).
 */

import { NextRequest, NextResponse } from 'next/server';
import { setUsageProject } from '@/lib/usage/context';
import { db } from '@/db';
import { analyses, projects, projectKeywords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getMapsListings, getLocalPack, type MapsPlace } from '@/lib/apis/serp';
import { getMarket } from '@/lib/utils/markets';
import { buildKwPool, isBrandedKeyword, buildCompetitorBrandTokens, buildExcludedBrandTokens, textHasCompetitorBrand } from '@/lib/utils/kwVolume';
import {
  parseSitemapIndex, parseUrlset, parseKmlPlacemarks, parseLocationUrls,
  pickLocationSitemap, parseLocationPageJsonLd, parseEmbeddedLocationMarkers, type KmlLocation,
} from '@/lib/local/sitemap';
import type { LocalListing, LocalKeywordScan, LocalPackMember, LocalScan, ScanSeed } from '@/lib/local/build';
import { buildServiceSeeds, buildSeedsFromServiceTerms, gridKeyword, orderLocationsForScan, type LocationOrder } from '@/lib/local/seeds';
import { cityMarketRank, detectLocalIntent } from '@/lib/local/detect';

export const maxDuration = 300;

// v7.183 location-grid model: scan = service seeds × locations.
const DEFAULT_MAX_SEEDS = 10;     // v7.284: 8 → 10 (brand + up to 9 services)
const MAX_MAX_SEEDS     = 10;     // v7.284: hard cap of 10 primary services per Wayne
const DEFAULT_MAX_LOC   = 25;     // Wayne sets this per run; default covers the top metros
const MAX_MAX_LOC       = 200;    // enough for every location of a large brand
const CONCURRENCY       = 5;
const KW_CONCURRENCY    = 10;     // v7.299: keyword map-pack scan = 1 search each (no AI 2nd call) → safe at higher concurrency
const MAX_SCAN_KEYWORDS = 300;    // v7.299: runtime ceiling so one streamed request stays under the 300s Vercel cap (NOT a data cap)
const ENRICH_BUDGET_MS  = 120_000; // v7.303: wall-clock cap for fetching office detail pages (keeps the request under 300s)

function normalizeDomain(url: string): string {
  return String(url ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim();
}

// Brand core tokens (len ≥ 3, minus generic noise) for matching a listing/pack
// member to the client when no website domain is present.
const BRAND_NOISE = ['the', 'and', 'inc', 'llc', 'co', 'corp', 'company', 'group', 'center', 'centre', 'clinic'];
function brandTokens(name: string, domain: string): string[] {
  const out: string[] = [];
  const push = (s: string) => { const t = s.toLowerCase().trim(); if (t.length >= 3 && BRAND_NOISE.indexOf(t) < 0 && out.indexOf(t) < 0) out.push(t); };
  String(name ?? '').split(/[^a-z0-9]+/i).forEach(push);
  const root = domain.replace(/\.(com|net|org|io|co|biz|us)$/i, '');
  push(root);
  return out;
}

// Best-effort city from a US-style address: "123 Main St, San Diego, CA 92101".
function cityFromAddress(address: string): string {
  const parts = String(address ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // second-to-last part is usually the city (last is "STATE ZIP")
    return parts[parts.length - 2] || '';
  }
  return '';
}

// ─── sitemap / KML location discovery (v7.179) ──────────────────────────────────
// Reads the client's OWN site for an authoritative, free list of every location.

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      // v7.301 — browser-like UA + 15s; some sites (e.g. Drupal/CDN bot filters) drop an
      // unknown UA, which silently returned 0 locations. Still identifies OrbitIQ.
      signal: AbortSignal.timeout(15_000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; OrbitIQ-LocalScan/1.0; +https://orbitiq.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'accept': 'application/xml,text/xml,text/html,application/xhtml+xml,*/*',
      },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

const hasKmlExt = (u: string): boolean => /\.kml(\?|#|$)/i.test(u);

/**
 * Discover the client's physical locations from its website (free — no SerpAPI):
 *   sitemap index → local/page child sitemap → locations.kml (name+address+GPS)
 *   or, as a fallback, /locations/{city}/ page URLs. Returns [] if the site has
 *   no usable sitemap (caller then falls back to a Maps brand search).
 */
// v7.303 — fill in each office's REAL address / phone / GPS from its own page's schema.org
// JSON-LD (Const I.1 — sourced from the client's structured markup, never modeled). Bounded
// concurrency + a wall-clock budget so the request stays under Vercel's 300s cap; offices not
// reached in the budget keep their honest gap. Mutates the listings in place.
async function enrichOfficesFromPages(
  listings: LocalListing[],
  send: (o: unknown) => void,
): Promise<void> {
  const targets = listings.filter(l => l.pageUrl && (l.lat == null || !l.address || !l.phone));
  const total = targets.length;
  if (total === 0) return;
  const startedAt = Date.now();
  let next = 0, done = 0;
  const worker = async (): Promise<void> => {
    while (next < targets.length) {
      if (Date.now() - startedAt > ENRICH_BUDGET_MS) return;   // budget guard
      const l = targets[next++];
      const html = await fetchText(l.pageUrl as string);
      if (html) {
        const d = parseLocationPageJsonLd(html);
        if (d) {
          if (d.address) l.address = d.address;
          if (d.phone)   l.phone   = d.phone;
          if (d.lat != null) l.lat = d.lat;
          if (d.lng != null) l.lng = d.lng;
          if (d.city)    l.city    = d.city;
          const flags: string[] = [];
          if (l.lat == null || l.lng == null) flags.push('no map coordinates');
          if (!l.phone)   flags.push('no phone');
          if (!l.address) flags.push('no address');
          l.healthFlags = flags;
        }
      }
      done++;
      send({ type: 'progress', done, total, phase: `Reading office details ${done} of ${total}…` });
    }
  };
  await Promise.all(Array.from({ length: Math.min(KW_CONCURRENCY, targets.length) }, () => worker()));
}

// v7.302 — discover offices from a manually-provided URL: HTML locations page, sitemap, or KML.
async function discoverFromUrl(
  url: string,
  clientDomain: string,
): Promise<{ locations: KmlLocation[]; source: string }> {
  if (!url) return { locations: [], source: 'none' };
  const txt = await fetchText(url);
  if (!txt) return { locations: [], source: 'none' };
  // KML
  if (hasKmlExt(url) || /<kml[\s>]/i.test(txt)) {
    const pm = parseKmlPlacemarks(txt);
    if (pm.length) return { locations: pm, source: 'manual-kml' };
  }
  // Sitemap (urlset, or an index → fetch a few children)
  if (/<urlset[\s>]/i.test(txt) || /<sitemapindex[\s>]/i.test(txt)) {
    let urls = parseUrlset(txt);
    if (/<sitemapindex[\s>]/i.test(txt)) {
      const children = parseSitemapIndex(txt);
      for (let i = 0; i < children.length && i < 6; i++) {
        const cx = await fetchText(children[i]);
        if (cx) urls = urls.concat(parseUrlset(cx));
      }
    }
    const locs = parseLocationUrls(urls);
    if (locs.length) return { locations: locs, source: 'manual-sitemap' };
  }
  // HTML page → FIRST try the page's embedded map markers (GeoJSON / geofield) — full office
  // data (GPS + address + phone) in this single fetch, no per-page crawling.
  const markers = parseEmbeddedLocationMarkers(txt, clientDomain);
  if (markers.length) return { locations: markers, source: 'manual-page' };
  // Otherwise pull href links and parse the /location(s)/ office URLs (no DOM; regex).
  const hrefs: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(txt)) !== null) {
    const h = mm[1];
    if (h.toLowerCase().indexOf('/location') < 0) continue;
    hrefs.push(h.charAt(0) === '/' ? `https://${clientDomain}${h}` : h);
  }
  const locs = parseLocationUrls(hrefs);
  if (locs.length) return { locations: locs, source: 'manual-page' };
  return { locations: [], source: 'none' };
}

async function discoverLocationsFromSite(
  domain: string,
): Promise<{ locations: KmlLocation[]; source: string }> {
  const origins = [`https://www.${domain}`, `https://${domain}`];
  for (let o = 0; o < origins.length; o++) {
    const origin = origins[o];
    const idxXml = (await fetchText(`${origin}/sitemap.xml`)) || (await fetchText(`${origin}/sitemap_index.xml`));
    if (!idxXml) continue;

    const children = parseSitemapIndex(idxXml);
    // Build the inspection list: a clear local/store sitemap first, then any
    // child whose URL hints at locations or pages (location pages often live there).
    const toInspect: string[] = [];
    const local = pickLocationSitemap(children);
    if (local) toInspect.push(local);
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (/page|location|local|store|geo/i.test(c) && toInspect.indexOf(c) < 0) toInspect.push(c);
    }

    const pageUrls: string[] = [];
    for (let i = 0; i < toInspect.length && i < 4; i++) {
      const xml = await fetchText(toInspect[i]);
      if (!xml) continue;
      const locs = parseUrlset(xml);
      for (let j = 0; j < locs.length; j++) {
        if (hasKmlExt(locs[j])) {
          const kx = await fetchText(locs[j]);
          if (kx) { const pm = parseKmlPlacemarks(kx); if (pm.length) return { locations: pm, source: 'kml' }; }
        }
        pageUrls.push(locs[j]);
      }
    }

    // Direct conventional KML path.
    const directKml = await fetchText(`${origin}/locations.kml`);
    if (directKml) { const pm = parseKmlPlacemarks(directKml); if (pm.length) return { locations: pm, source: 'kml' }; }

    // Fallback: /locations/ page URLs (from child sitemaps, or the index itself
    // if it was actually a urlset rather than an index).
    const allPageUrls = pageUrls.concat(children.length === 0 ? parseUrlset(idxXml) : []);
    const fromPages = parseLocationUrls(allPageUrls);
    if (fromPages.length) return { locations: fromPages, source: 'sitemap-pages' };
  }
  return { locations: [], source: 'none' };
}

// KML location → persisted LocalListing (rating/reviews backfilled later from the
// map-pack scan when the client appears in a pack — no extra SerpAPI calls).
function kmlToListing(l: KmlLocation, clientDomain: string): LocalListing {
  const healthFlags: string[] = [];
  if (l.lat == null || l.lng == null) healthFlags.push('no map coordinates');
  if (!l.phone) healthFlags.push('no phone');
  return {
    title:   l.name || l.city || 'Location',
    placeId: '',
    address: l.address,
    city:    l.city || l.name,
    rating:  null,
    reviews: 0,
    type:    '',
    website: clientDomain,
    phone:   l.phone,
    lat:     l.lat,
    lng:     l.lng,
    isClient: true,
    verified: false,            // upgraded to true once a real GBP rating is backfilled
    healthFlags,
    pageUrl: l.url || '',
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  setUsageProject(projectId);   // v7.225: attribute API usage to this project

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const maxSeeds     = Math.min(Math.max(parseInt(body?.maxSeeds, 10)     || DEFAULT_MAX_SEEDS, 1), MAX_MAX_SEEDS);
  const maxLocations = Math.min(Math.max(parseInt(body?.maxLocations, 10) || DEFAULT_MAX_LOC,   1), MAX_MAX_LOC);
  const locationOrder: LocationOrder = (['market', 'demand', 'az'].indexOf(body?.locationOrder) >= 0)
    ? body.locationOrder : 'market';
  const dryRun = body?.dryRun === true;
  // v7.284 — explicit curated service terms from the Local panel (services only;
  // brand is added server-side). When present, these EXACT terms are scanned in
  // this order (cap-respecting) instead of the auto top-N. Already brand-guarded
  // client-side; the fallback path below re-applies the guard (Const III.1a).
  const curatedServices: string[] = Array.isArray(body?.services)
    ? body.services.map((s: any) => String(s ?? '').trim()).filter(Boolean)
    : [];
  // v7.299 — KEYWORD MODE: the panel passes the real local-intent keywords (client + gap)
  // under the tracked service lines. When present we scan each keyword's map pack ONCE at the
  // project market locale (no synthetic "{service} {city}", no per-location grid).
  const bodyKeywords: string[] = Array.isArray(body?.keywords)
    ? body.keywords.map((k: any) => String(k ?? '').toLowerCase().trim()).filter(Boolean)
    : [];
  const keywordMode = bodyKeywords.length > 0;
  // v7.302 — optional manual Locations URL (Wayne). Accepts an HTML locations page, a sitemap
  // (urlset/index), or a KML; lets the user point us at the right page when auto-discovery's
  // path conventions don't match. Free fetch (no SerpAPI).
  const locationsUrl = String(body?.locationsUrl ?? '').trim();

  if (!process.env.SERP_API_KEY) {
    return NextResponse.json(
      { error: 'SERP_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with:  { competitors: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const recent = await db.query.analyses.findMany({
    where:   eq(analyses.projectId, projectId),
    orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
    limit:   5,
  });
  const analysis = recent.find((a: any) => a.semrushSnapshot != null);
  if (!analysis) {
    return NextResponse.json({ error: 'No analysis with keyword data found. Run an analysis first.' }, { status: 400 });
  }

  const clientDomain = normalizeDomain((project as any).websiteUrl ?? (analysis.semrushSnapshot as any)?.domain ?? '');
  const market = getMarket((project as any).semrushDatabase);
  const brandQuery = String((project as any).clientName ?? clientDomain).trim();
  const tokens = brandTokens(brandQuery, clientDomain);

  // Canonical keyword pool — same options as KeywordsPanel / serp-scan.
  const dbKws = await db.select().from(projectKeywords).where(eq(projectKeywords.projectId, projectId));
  const manualCompetitorDomains: string[] = ((project as any).competitors ?? [])
    .map((c: { domain: string }) => c.domain).filter(Boolean);
  const pool = buildKwPool({
    semrushSnapshot:   analysis.semrushSnapshot,
    uploadedKeywords:  dbKws,
    clientDomain,
    competitorDomains: manualCompetitorDomains,
    clientVolMin:      (project as any).kwVolThresholdClient ?? 0,
    competitorVolMin:  (project as any).kwVolThresholdCompetitor ?? 0,
  });

  const isClientPlace = (p: MapsPlace): boolean => {
    const w = normalizeDomain(p.website);
    if (w && clientDomain && w === clientDomain) return true;
    const t = (p.title ?? '').toLowerCase();
    for (let i = 0; i < tokens.length; i++) { if (t.indexOf(tokens[i]) >= 0) return true; }
    return false;
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      let callsUsed = 0;
      try {
        // ── 1. Discover client locations ──────────────────────────────────────
        // PRIMARY (v7.179): the client's OWN sitemap/KML — authoritative, free,
        // every location with GPS. FALLBACK: a SerpAPI Maps brand search (1 call)
        // when the site has no usable sitemap.
        // NOTE: do NOT emit a progress event during a dryRun — the dryRun reply is
        // read with `r.json()` (single-object parse), so the stream must be exactly
        // ONE JSON line (v7.178 fix).
        if (!dryRun) send({ type: 'progress', done: 0, total: 0, phase: 'Discovering locations from sitemap…' });

        let listings: LocalListing[] = [];
        let source = 'none';
        // v7.302 — a manually-provided Locations URL wins (free). Works for HTML pages, sitemaps, KML.
        if (locationsUrl) {
          const m = await discoverFromUrl(locationsUrl, clientDomain);
          if (m.locations.length > 0) {
            source = m.source;
            listings = m.locations.map(l => kmlToListing(l, clientDomain));
          }
        }
        // Auto sitemap discovery — skip in a keyword-mode dryRun (locations aren't part of the
        // keyword estimate), but always run for the real scan and for the legacy grid plan.
        if (listings.length === 0 && (!keywordMode || !dryRun)) {
          const discovered = await discoverLocationsFromSite(clientDomain);
          if (discovered.locations.length > 0) {
            source = discovered.source;                     // 'kml' | 'sitemap-pages'
            listings = discovered.locations.map(l => kmlToListing(l, clientDomain));
          } else if (!dryRun && !keywordMode) {
          // Fallback to Maps brand search (costs 1 SerpAPI call) — real-run only.
          const rawListings = await getMapsListings(brandQuery, market, undefined, 20);
          callsUsed++;
          source = 'maps';
          listings = rawListings.filter(isClientPlace).map(p => {
            const healthFlags: string[] = [];
            if (p.rating == null) healthFlags.push('no rating');
            else if (p.rating < 4.0) healthFlags.push('low rating');
            if (p.reviews < 25) healthFlags.push('few reviews');
            if (!p.address) healthFlags.push('no address');
            const verified = p.rating != null && p.reviews > 0 && !!p.address;
            return {
              title: p.title, placeId: p.placeId, address: p.address,
              city: cityFromAddress(p.address), rating: p.rating, reviews: p.reviews,
              type: p.type, website: p.website, phone: p.phone, lat: p.lat, lng: p.lng,
              isClient: true, verified, healthFlags,
            };
          });
          }
        }
        const clientPlaceIds: Record<string, boolean> = {};
        listings.forEach(l => { if (l.placeId) clientPlaceIds[l.placeId] = true; });

        // v7.303 — enrich offices with real address/phone/GPS from each page's JSON-LD (real run only).
        if (!dryRun && listings.length > 0) await enrichOfficesFromPages(listings, send);

        // ── v7.299 KEYWORD MODE: scan each real local-intent keyword's map pack ───────
        if (keywordMode) {
          const seen: Record<string, boolean> = {};
          const kws: string[] = [];
          for (let i = 0; i < bodyKeywords.length; i++) { const kw = bodyKeywords[i]; if (kw && !seen[kw]) { seen[kw] = true; kws.push(kw); } }
          const scanKws = kws.slice(0, MAX_SCAN_KEYWORDS);
          // real Semrush volume per keyword from the canonical pool (Const I.1)
          const volByKw: Record<string, number> = {};
          for (let i = 0; i < (pool as any[]).length; i++) {
            const it = (pool as any[])[i];
            const kw = String(it.keyword ?? '').toLowerCase().trim();
            const v = it.searchVolume || 0;
            if (kw && (volByKw[kw] == null || v > volByKw[kw])) volByKw[kw] = v;
          }

          if (dryRun) {
            send({
              type: 'done', dryRun: true,
              plan: { model: 'keyword', keywords: scanKws.length, totalKeywords: kws.length, estCalls: scanKws.length, source, locations: listings.length },
            });
            controller.close();
            return;
          }

          send({ type: 'start', total: scanKws.length });
          const out: LocalKeywordScan[] = new Array(scanKws.length);
          let next = 0, done = 0;
          const kwWorker = async (): Promise<void> => {
            while (next < scanKws.length) {
              const i = next++;
              const kw = scanKws[i];
              let res: { packPresent: boolean; places: MapsPlace[] };
              try { res = await getLocalPack(kw, market); }   // single market locale, no ll (v7.299)
              catch { res = { packPresent: false, places: [] }; }
              callsUsed++;
              const members: LocalPackMember[] = res.places.map(p => ({
                position: p.position, title: p.title, placeId: p.placeId,
                rating: p.rating, reviews: p.reviews,
                isClient: isClientPlace(p) || (!!p.placeId && clientPlaceIds[p.placeId] === true),
              }));
              const mine = members.find(m => m.isClient);
              const leader = members.find(m => m.position === 1);
              const det = detectLocalIntent(kw);
              out[i] = {
                keyword:          kw,
                searchVolume:     volByKw[kw] ?? 0,
                intent:           det ? det.intent : 'implicit-local',
                matchedTerm:      det ? det.matchedTerm : '',
                packPresent:      res.packPresent,
                clientBestRank:   mine ? mine.position : null,
                bestLocationId:   mine ? (mine.placeId || null) : null,
                bestLocationCity: '',
                packLeader:       leader ? leader.title : '',
                pack:             members,
              };
              done++;
              send({ type: 'progress', done, total: scanKws.length, seed: kw });
            }
          };
          await Promise.all(Array.from({ length: Math.min(KW_CONCURRENCY, scanKws.length || 1) }, () => kwWorker()));

          const localScan: LocalScan = {
            domain:       clientDomain,
            market:       market.code,
            locations:    listings,
            keywords:     out.filter(Boolean),
            builtAt:      new Date().toISOString(),
            scannedCount: scanKws.length,
            localTotal:   kws.length,
            callsUsed,
            source,
            model:        'keyword',
            locationsScanned: 0,
          };
          await db.update(analyses)
            .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _localScan: localScan } as any })
            .where(eq(analyses.id, analysis.id));
          console.log(`[OrbitIQ] Local keyword scan stored: ${scanKws.length} keywords, ${callsUsed} credits`);
          send({ type: 'done', localScan });
          controller.close();
          return;
        }

        // ── 2. Service seeds (the grid's columns) ──────────────────────────────
        // Brand + service categories, with real volumes from the client pool.
        // v7.284: prefer Wayne's curated service list (exact terms, his order);
        // otherwise fall back to the auto top-N. Either way the source categories
        // are run through the competitor-brand guard at this read site (III.1a).
        const snap = analysis.semrushSnapshot as any;
        const brandTermsList: string[] = Array.isArray(snap?._brandTerms) ? snap._brandTerms : [];
        const compTokens = buildCompetitorBrandTokens(snap, clientDomain, manualCompetitorDomains);
        const exclTokens = buildExcludedBrandTokens(snap);
        const isOwnBrand = (name: string) => isBrandedKeyword(name, clientDomain, [], brandTermsList);
        const guardedCategories = ((snap?._categoryBreakdown?.categories ?? []) as Array<{ name?: string; type?: string; monthlyDemand?: number }>)
          .filter(c => {
            const name = String(c?.name ?? '');
            if (!name) return false;
            if (c?.type === 'brand' && !isOwnBrand(name)) return false;
            if ((textHasCompetitorBrand(name, compTokens) || textHasCompetitorBrand(name, exclTokens)) && !isOwnBrand(name)) return false;
            return true;
          });
        const seeds: ScanSeed[] = curatedServices.length > 0
          ? buildSeedsFromServiceTerms({
              serviceTerms: curatedServices,
              brand:        brandQuery,
              clientDomain,
              pool:         pool as any,
              categories:   guardedCategories,
              maxSeeds,
            })
          : buildServiceSeeds({
              categories:   guardedCategories,
              brand:        brandQuery,
              clientDomain,
              pool:         pool as any,
              maxSeeds,
            });

        // Locations to scan: those with coordinates, ORDERED (largest market /
        // highest demand / A–Z) so a capped run covers the most valuable cities
        // first, then capped per run (Wayne sets the cap + order).
        const scannableLocs = orderLocationsForScan(
          listings.filter(l => l.lat != null && l.lng != null),
          locationOrder,
          { pool: pool as any, cityRank: cityMarketRank },
        );
        const geoLocs = scannableLocs.slice(0, maxLocations);

        const potentialCells = seeds.length * scannableLocs.length;   // full grid (all scannable locations)
        const cellsToScan    = seeds.length * geoLocs.length;
        const estCalls = (source === 'maps' ? 1 : 0) + cellsToScan;

        if (dryRun) {
          send({
            type: 'done',
            dryRun: true,
            plan: {
              model:              'grid',
              seeds:              seeds.length,
              seedList:           seeds.map(s => s.term),
              locations:          listings.length,
              locationsScannable: scannableLocs.length,
              locationsUsed:      geoLocs.length,
              cells:              cellsToScan,
              willScan:           cellsToScan,
              potentialCells,
              estCalls,
              source,
              order:              locationOrder,
              firstCities:        geoLocs.slice(0, 8).map(l => l.city || l.title),
            },
          });
          controller.close();
          return;
        }

        if (seeds.length === 0 || geoLocs.length === 0) {
          send({ type: 'error', error: seeds.length === 0
            ? 'No service seeds could be derived from the client. Check that the analysis has content categories or keywords.'
            : 'No client locations with map coordinates were found to scan. The sitemap/KML may be missing coordinates.' });
          controller.close();
          return;
        }

        // ── 3. Grid scan: every service × location ("{service} {city}") ────────
        const flatCells: Array<{ seed: ScanSeed; loc: LocalListing }> = [];
        for (let s = 0; s < seeds.length; s++) {
          for (let l = 0; l < geoLocs.length; l++) flatCells.push({ seed: seeds[s], loc: geoLocs[l] });
        }

        send({ type: 'start', total: flatCells.length });

        const out: LocalKeywordScan[] = new Array(flatCells.length);
        // Real GBP rating/reviews backfill from packs the client appears in — keyed
        // by city, no extra SerpAPI calls. Keep the highest review count seen.
        const gbpByCity: Record<string, { rating: number | null; reviews: number }> = {};
        let next = 0, done = 0;
        const worker = async (): Promise<void> => {
          while (next < flatCells.length) {
            const i = next++;
            const cell = flatCells[i];
            const city = cell.loc.city || cell.loc.title;
            const kw = gridKeyword(cell.seed.term, city);
            const ll = `@${cell.loc.lat},${cell.loc.lng},13z`;
            let res: { packPresent: boolean; places: MapsPlace[] };
            try { res = await getLocalPack(kw, market, ll); }
            catch { res = { packPresent: false, places: [] }; }
            callsUsed++;
            const members: LocalPackMember[] = res.places.map(p => ({
              position: p.position, title: p.title, placeId: p.placeId,
              rating: p.rating, reviews: p.reviews,
              isClient: isClientPlace(p) || (!!p.placeId && clientPlaceIds[p.placeId] === true),
            }));
            const mine = members.find(m => m.isClient);
            if (mine) {
              const key = city.toLowerCase();
              const prev = gbpByCity[key];
              if (!prev || mine.reviews > prev.reviews) gbpByCity[key] = { rating: mine.rating, reviews: mine.reviews };
            }
            const leader = members.find(m => m.position === 1);
            out[i] = {
              keyword:          kw,
              searchVolume:     cell.seed.volume,
              intent:           'geo-modifier',
              matchedTerm:      city,
              packPresent:      res.packPresent,
              clientBestRank:   mine ? mine.position : null,
              bestLocationId:   cell.loc.placeId || null,
              bestLocationCity: city,
              packLeader:       leader ? leader.title : '',
              pack:             members,
              seed:             cell.seed.term,
              seedKind:         cell.seed.kind,
              city,
            };
            done++;
            send({ type: 'progress', done, total: flatCells.length, seed: kw });
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, flatCells.length || 1) }, () => worker()));

        // Apply the real GBP rating/reviews backfill to the matching locations.
        listings.forEach(l => {
          const g = gbpByCity[(l.city || '').toLowerCase()];
          if (g && (l.rating == null || g.reviews > l.reviews)) {
            l.rating = g.rating;
            l.reviews = g.reviews;
            l.verified = g.rating != null && g.reviews > 0 && !!l.address;
            l.healthFlags = [];
            if (g.rating == null) l.healthFlags.push('no rating');
            else if (g.rating < 4.0) l.healthFlags.push('low rating');
            if (g.reviews < 25) l.healthFlags.push('few reviews');
          }
        });

        const localScan: LocalScan = {
          domain:       clientDomain,
          market:       market.code,
          locations:    listings,
          keywords:     out.filter(Boolean),
          builtAt:      new Date().toISOString(),
          scannedCount: flatCells.length,
          localTotal:   potentialCells,
          callsUsed,
          source,
          seeds,
          model:        'grid',
          locationsScanned: geoLocs.length,
        };

        await db.update(analyses)
          .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _localScan: localScan } as any })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Local grid scan stored: ${listings.length} listings, ${seeds.length} seeds × ${geoLocs.length} locations = ${flatCells.length} cells, ${callsUsed} credits`);
        send({ type: 'done', localScan });
        controller.close();
      } catch (err) {
        console.error('[OrbitIQ] Local scan failed:', err);
        send({ type: 'error', error: `Local scan failed: ${String((err as any)?.message ?? err)}` });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'application/x-ndjson; charset=utf-8',
      'Cache-Control':     'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
