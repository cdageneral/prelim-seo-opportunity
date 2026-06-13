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
 * Body: { maxKeywords?: number (def 25, cap 60), maxLocations?: number (def 6, cap 12), dryRun?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { analyses, projects, projectKeywords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getMapsListings, getLocalPack, type MapsPlace } from '@/lib/apis/serp';
import { getMarket } from '@/lib/utils/markets';
import { buildKwPool } from '@/lib/utils/kwVolume';
import { classifyLocalKeywords, buildClientRelevance } from '@/lib/local/detect';
import type { LocalListing, LocalKeywordScan, LocalPackMember, LocalScan } from '@/lib/local/build';

export const maxDuration = 300;

const DEFAULT_MAX_KW   = 25;
const MAX_MAX_KW       = 60;
const DEFAULT_MAX_LOC  = 6;
const MAX_MAX_LOC      = 12;
const CONCURRENCY      = 4;

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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const maxKeywords  = Math.min(Math.max(parseInt(body?.maxKeywords, 10)  || DEFAULT_MAX_KW,  1), MAX_MAX_KW);
  const maxLocations = Math.min(Math.max(parseInt(body?.maxLocations, 10) || DEFAULT_MAX_LOC, 1), MAX_MAX_LOC);
  const dryRun = body?.dryRun === true;

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

  // client-relevance vocabulary (category names + brand) — keeps off-topic
  // footprint keywords out of the local universe (v7.178; mirrors v7.173 gate).
  const relevanceTokens = buildClientRelevance(
    (analysis.semrushSnapshot as any)?._categoryBreakdown?.categories ?? [],
    clientDomain, manualCompetitorDomains,
  );

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
        // ── 1. Discover client listings (1 call) ──────────────────────────────
        // NOTE: do NOT emit a progress event during a dryRun. The dryRun reply is
        // read by the client with `r.json()` (a single-object parse), so the stream
        // must contain exactly ONE JSON line. Emitting a progress line first made
        // the body two newline-delimited objects → "Unexpected non-whitespace
        // character after JSON at position N (line 2 column 1)" (v7.178 fix).
        if (!dryRun) send({ type: 'progress', done: 0, total: maxKeywords, phase: 'Discovering listings…' });
        const rawListings = await getMapsListings(brandQuery, market, undefined, 20);
        callsUsed++;
        const clientPlaces = rawListings.filter(isClientPlace);
        const listings: LocalListing[] = clientPlaces.map(p => {
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
        const clientPlaceIds: Record<string, boolean> = {};
        listings.forEach(l => { if (l.placeId) clientPlaceIds[l.placeId] = true; });

        // geo vocab from discovered listings → adapts the local detector.
        const geoVocab: string[] = [];
        listings.forEach(l => { if (l.city) geoVocab.push(l.city.toLowerCase()); });

        // ── 2. Detect local keywords (geo-aware) ──────────────────────────────
        const allLocal = classifyLocalKeywords(pool as any, { geoVocab, relevanceTokens });
        const scanList = allLocal.slice(0, maxKeywords);

        // Locations to scan from: client listings with coordinates (cap maxLocations).
        const geoLocs = listings.filter(l => l.lat != null && l.lng != null).slice(0, maxLocations);
        const locUnits = geoLocs.length > 0
          ? geoLocs.map(l => ({ ll: `@${l.lat},${l.lng},13z`, placeId: l.placeId, city: l.city || l.title }))
          : [{ ll: '', placeId: '', city: '' }]; // no coords → single national read

        const estCalls = 1 + scanList.length * locUnits.length;

        if (dryRun) {
          send({
            type: 'done',
            dryRun: true,
            plan: {
              localTotal:    allLocal.length,
              willScan:      scanList.length,
              locations:     listings.length,
              locationsUsed: locUnits.length,
              estCalls,
            },
          });
          controller.close();
          return;
        }

        send({ type: 'start', total: scanList.length });

        // ── 3. Map-pack scan per keyword across locations ─────────────────────
        const out: LocalKeywordScan[] = new Array(scanList.length);
        let next = 0, done = 0;
        const worker = async (): Promise<void> => {
          while (next < scanList.length) {
            const i = next++;
            const lk = scanList[i];
            let bestRank: number | null = null;
            let bestPack: LocalPackMember[] = [];
            let bestCity = '';
            let bestPlaceId: string | null = null;
            let anyPack = false;
            for (let u = 0; u < locUnits.length; u++) {
              const unit = locUnits[u];
              let res: { packPresent: boolean; places: MapsPlace[] };
              try { res = await getLocalPack(lk.keyword, market, unit.ll || undefined); }
              catch { res = { packPresent: false, places: [] }; }
              callsUsed++;
              if (res.packPresent) anyPack = true;
              const members: LocalPackMember[] = res.places.map(p => ({
                position: p.position,
                title:    p.title,
                placeId:  p.placeId,
                rating:   p.rating,
                reviews:  p.reviews,
                isClient: isClientPlace(p) || (!!p.placeId && clientPlaceIds[p.placeId] === true),
              }));
              const mine = members.find(m => m.isClient);
              if (mine && (bestRank == null || mine.position < bestRank)) {
                bestRank = mine.position;
                bestPack = members;
                bestCity = unit.city;
                bestPlaceId = unit.placeId || null;
              }
              // keep a pack to show even if client absent (first one seen)
              if (bestPack.length === 0 && members.length > 0) { bestPack = members; bestCity = unit.city; bestPlaceId = unit.placeId || null; }
            }
            const leader = bestPack.find(m => m.position === 1);
            out[i] = {
              keyword:          lk.keyword,
              searchVolume:     lk.searchVolume,
              intent:           lk.intent,
              matchedTerm:      lk.matchedTerm,
              packPresent:      anyPack,
              clientBestRank:   bestRank,
              bestLocationId:   bestPlaceId,
              bestLocationCity: bestCity,
              packLeader:       leader ? leader.title : '',
              pack:             bestPack,
            };
            done++;
            send({ type: 'progress', done, total: scanList.length, seed: lk.keyword });
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scanList.length || 1) }, () => worker()));

        const localScan: LocalScan = {
          domain:       clientDomain,
          market:       market.code,
          locations:    listings,
          keywords:     out.filter(Boolean),
          builtAt:      new Date().toISOString(),
          scannedCount: scanList.length,
          localTotal:   allLocal.length,
          callsUsed,
        };

        await db.update(analyses)
          .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _localScan: localScan } as any })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Local scan stored: ${listings.length} listings, ${scanList.length} kw, ${callsUsed} credits`);
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
