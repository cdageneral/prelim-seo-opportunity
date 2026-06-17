/**
 * SerpAPI Client
 * Docs: https://serpapi.com/search-api
 *
 * Features used:
 *  - Live SERP snapshots for target keywords
 *  - AI Overview (AIO) detection + source URL extraction
 *  - People Also Ask (PAA) cluster capture
 *  - SERP feature inventory (featured snippet, local pack, shopping, etc.)
 *  - Share of Voice verification
 *
 * Credit strategy: Batch keywords; cache all results in Neon analyses.serpapi_snapshot
 */

import { getMarket, type Market } from '@/lib/utils/markets';
import { recordSerp } from '@/lib/usage/record';

const SERP_BASE = 'https://serpapi.com/search';;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SerpResult {
  position: number;
  title:    string;
  url:      string;
  domain:   string;
  snippet?: string;
}

export interface AIOSource {
  title: string;
  url:   string;
  domain: string;
}

// v7.117: PAA answer sources + video carousel entries are now STORED (the old
// parser dropped every non-client domain), enabling competitive landscape
// tables for PAA and Video — same as the AIO citation landscape.
export interface PAASource {
  question: string;
  title:    string;
  url:      string;
  domain:   string;
}

export interface VideoSource {
  title:    string;
  url:      string;
  domain:   string;   // hosting domain (usually youtube.com)
  channel?: string;   // channel / source name when SerpAPI provides it
}

export interface KeywordSerpData {
  keyword:          string;
  searchVolume?:    number;   // Passed in from Semrush data
  organicResults:   SerpResult[];
  hasAIO:           boolean;
  aioSources:       AIOSource[];     // Domains cited in the AI Overview
  aioText?:         string;          // v7.126: the AI Overview answer text (from SerpAPI text_blocks; absent on pre-v7.126 scans — never fabricated)
  featuredSnippet:  SerpResult | null;
  paaQuestions:     string[];        // People Also Ask questions
  paaClientCited:   boolean;         // Client domain appears in a PAA answer link
  paaSources?:      PAASource[];     // v7.117: every PAA answer source (absent on pre-v7.117 scans)
  serpFeatures:     string[];        // ['featured_snippet', 'knowledge_panel', 'local_pack', ...]
  videoClientCited: boolean;         // Client domain appears in the video carousel
  videoSources?:    VideoSource[];   // v7.117: every video carousel entry (absent on pre-v7.117 scans)
  clientRank:       number | null;   // Client's position on this SERP (null = not found)
  scannedAt?:       string;          // v7.122: ISO timestamp of THIS keyword's scan (absent on older scans) — powers per-card scan-age staleness
}

export interface SerpApiSnapshot {
  domain:       string;
  keywords:     KeywordSerpData[];
  aioSummary: {
    total:       number;   // Keywords queried
    withAIO:     number;   // SERPs that showed an AI Overview
    clientCited: number;   // Times client domain appears in AIO sources
    aioRate:     number;   // withAIO / total
    clientAIORate: number; // clientCited / withAIO
  };
  serpFeatureSummary: {
    scanned:         number;  // Total keywords scanned
    withPAA:         number;  // Keywords that triggered a PAA box (available)
    paaClientCited:  number;  // Keywords where client appeared in a PAA answer (acquired)
    withVideo:       number;  // Keywords that triggered a video carousel (available)
    videoClientCited: number; // Keywords where client appeared in the video carousel (acquired)
  };
  topAIOCompetitors: Array<{ domain: string; citedCount: number }>;
  fetchedAt: string;
}

// ─── Core SERP Fetch ──────────────────────────────────────────────────────────

// v7.99: market-aware. The market's gl/hl/google_domain (lib/utils/markets.ts)
// make SerpAPI scan the SAME country's Google as the Semrush keyword database,
// so AIO/PAA/Video data matches the market being analyzed.
async function fetchSerpData(keyword: string, market?: Market): Promise<any> {
  const API_KEY = process.env.SERP_API_KEY;
  if (!API_KEY) throw new Error('SERP_API_KEY is not set — skipping SerpAPI');
  const m = market ?? getMarket('us');
  const params = new URLSearchParams({
    api_key:       API_KEY,
    engine:        'google',
    q:             keyword,
    hl:            m.serpHl,
    gl:            m.serpGl,
    google_domain: m.googleDomain,
    num:           '10',
    output:        'json',
  });

  // 15-second hard timeout per keyword — prevents one slow SERP call from
  // blocking the entire pipeline and pushing total time over Vercel's 5-min limit.
  const res = await fetch(`${SERP_BASE}?${params.toString()}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`);
  }
  await recordSerp('google', API_KEY);   // v7.225: 1 billed search
  return res.json();
}

// ─── AI Overview Follow-up Fetch (v7.102) ────────────────────────────────────
// On many SERPs Google serves the AI Overview asynchronously, so the main
// Google Search API response contains only `ai_overview.page_token` (expires
// within ~1 minute). SerpAPI requires a second request to the dedicated
// `google_ai_overview` engine to retrieve the AIO content and its `references`
// (citation sources). Docs: https://serpapi.com/google-ai-overview-api
async function fetchAIOverviewByToken(pageToken: string): Promise<any | null> {
  const API_KEY = process.env.SERP_API_KEY;
  if (!API_KEY) return null;
  const params = new URLSearchParams({
    api_key:    API_KEY,
    engine:     'google_ai_overview',
    page_token: pageToken,
    output:     'json',
  });
  try {
    const res = await fetch(`${SERP_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`SerpAPI AIO follow-up error ${res.status}: ${await res.text()}`);
      return null;
    }
    await recordSerp('google_ai_overview', API_KEY);   // v7.225: separate billed search
    const json = await res.json();
    return json?.ai_overview ?? null;
  } catch (err) {
    console.error('SerpAPI AIO follow-up failed:', err);
    return null;
  }
}

// ─── Parse SERP Response ──────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// v7.126: flatten SerpAPI ai_overview.text_blocks into plain text.
// Block types observed in the wild (https://serpapi.com/google-ai-overview-api):
// paragraph (snippet), heading (snippet), list (list[].title/snippet, can nest),
// table / expandable (ignored beyond their snippets). Verbatim text only.
function extractAIOText(aio: any): string | undefined {
  if (!aio) return undefined;
  const out: string[] = [];
  const walk = (blocks: any[]) => {
    for (const b of blocks ?? []) {
      if (!b || typeof b !== 'object') continue;
      if (typeof b.snippet === 'string' && b.snippet.trim()) out.push(b.snippet.trim());
      if (Array.isArray(b.list)) {
        for (const item of b.list) {
          if (!item || typeof item !== 'object') continue;
          const title = typeof item.title === 'string' ? item.title.trim() : '';
          const snip  = typeof item.snippet === 'string' ? item.snippet.trim() : '';
          const line  = title && snip ? `${title}: ${snip}` : (title || snip);
          if (line) out.push(line);
          if (Array.isArray(item.list)) walk([{ list: item.list }]);
        }
      }
      if (Array.isArray(b.text_blocks)) walk(b.text_blocks);
    }
  };
  walk(aio.text_blocks ?? []);
  if (out.length === 0) return undefined;
  const text = out.join('\n');
  return text.length > 6000 ? text.slice(0, 6000) + '…' : text;
}

async function parseKeywordSerp(keyword: string, data: any, clientDomain: string): Promise<KeywordSerpData> {
  // Organic results
  const organicResults: SerpResult[] = (data.organic_results ?? []).map((r: any) => ({
    position: r.position ?? 0,
    title:    r.title ?? '',
    url:      r.link ?? '',
    domain:   extractDomain(r.link ?? ''),
    snippet:  r.snippet,
  }));

  // AI Overview detection
  let aio = data.ai_overview ?? data.answer_box_with_ai_overview;
  const hasAIO = !!aio;

  // v7.102: when Google serves the AIO asynchronously, the inline object holds
  // only a page_token — fetch the full AIO (incl. references) immediately,
  // since the token expires within ~1 minute.
  if (hasAIO && !aio?.references && aio?.page_token) {
    const full = await fetchAIOverviewByToken(aio.page_token);
    if (full) aio = full;
  }

  // v7.102 FIX: SerpAPI returns AIO citation sources under `references`
  // (each with title/link/source/index) — NOT `sources`. The old `aio.sources`
  // read always yielded an empty array, zeroing every AIO citation metric.
  // Docs: https://serpapi.com/google-ai-overview-api
  const aioSources: AIOSource[] = [];
  const rawRefs: any[] = aio?.references ?? aio?.sources ?? [];
  for (const src of rawRefs) {
    if (src.link) {
      aioSources.push({
        title:  src.title ?? '',
        url:    src.link,
        domain: extractDomain(src.link),
      });
    }
  }

  // v7.126: AI Overview answer TEXT. SerpAPI returns the rendered answer as
  // `text_blocks` (paragraph / heading / list items, possibly nested). We store
  // the verbatim text (joined with newlines, capped at 6000 chars) so the panel
  // can show the actual answer. Absent on pre-v7.126 scans — the UI says so
  // instead of inventing text.
  const aioText = extractAIOText(aio);

  // Featured snippet
  const fsRaw = data.answer_box;
  const featuredSnippet: SerpResult | null = fsRaw?.link ? {
    position: 0,
    title:    fsRaw.title ?? '',
    url:      fsRaw.link,
    domain:   extractDomain(fsRaw.link),
    snippet:  fsRaw.answer ?? fsRaw.snippet,
  } : null;

  // PAA questions + client citation check
  const clientNorm = clientDomain.replace(/^www\./, '');
  const rawPAA: any[] = data.related_questions ?? [];
  const paaQuestions: string[] = rawPAA.map((q: any) => q.question ?? '');
  // v7.117: store EVERY PAA answer source (question + link domain), not just
  // the client-cited boolean — feeds the PAA competitive landscape table.
  const paaSources: PAASource[] = [];
  for (const q of rawPAA) {
    const link: string = q.link ?? q.source?.link ?? '';
    if (link) {
      paaSources.push({
        question: q.question ?? '',
        title:    q.title ?? q.source?.title ?? '',
        url:      link,
        domain:   extractDomain(link),
      });
    }
  }
  // Client is cited in PAA if its domain appears in any PAA answer link
  const paaClientCited: boolean = rawPAA.some((q: any) => {
    const link: string = q.link ?? q.source?.link ?? '';
    return link && extractDomain(link).includes(clientNorm);
  });

  // SERP feature inventory
  const serpFeatures: string[] = [];
  if (data.answer_box)         serpFeatures.push('featured_snippet');
  if (aio || data.ai_overview) serpFeatures.push('ai_overview');
  if (data.knowledge_graph)    serpFeatures.push('knowledge_panel');
  if (data.local_results)      serpFeatures.push('local_pack');
  if (data.shopping_results)   serpFeatures.push('shopping');
  if (data.videos)             serpFeatures.push('video_carousel');
  if (data.images_results)     serpFeatures.push('image_pack');
  if (data.twitter_results)    serpFeatures.push('twitter_pack');

  // Video carousel client citation check — client domain appears in a video result
  const videoClientCited: boolean = (data.videos ?? []).some((v: any) => {
    const link: string = v.link ?? '';
    return link && extractDomain(link).includes(clientNorm);
  });

  // v7.117: store EVERY video carousel entry (hosting domain + channel name
  // when provided) — feeds the Video competitive landscape table. Most entries
  // host on youtube.com, so the channel name is the meaningful attribution.
  const videoSources: VideoSource[] = [];
  for (const v of (data.videos ?? [])) {
    if (!v?.link) continue;
    const rawChannel = typeof v.channel === 'string' ? v.channel : v.channel?.name;
    videoSources.push({
      title:   v.title ?? '',
      url:     v.link,
      domain:  extractDomain(v.link),
      channel: rawChannel || (typeof v.source === 'string' ? v.source : undefined),
    });
  }

  // Client rank
  const clientResult = organicResults.find(r =>
    r.domain.includes(clientNorm)
  );
  const clientRank = clientResult?.position ?? null;

  return {
    keyword,
    organicResults,
    hasAIO,
    aioSources,
    aioText,
    featuredSnippet,
    paaQuestions,
    paaClientCited,
    paaSources,
    serpFeatures,
    videoClientCited,
    videoSources,
    clientRank,
    scannedAt: new Date().toISOString(),   // v7.122: per-keyword scan timestamp
  };
}

// ─── Batch Keyword SERP Scan ─────────────────────────────────────────────────

/**
 * Query SerpAPI for a batch of keywords (from Semrush top keywords).
 * Caps at 50 queries to manage credit usage.
 */
export async function batchKeywordScan(
  keywords: string[],
  clientDomain: string,
  limit = 5,
  market?: Market,   // v7.99: per-project market
): Promise<KeywordSerpData[]> {
  const batch = keywords.slice(0, limit);
  const results: KeywordSerpData[] = [];

  // Sequential with small delay to respect rate limits (200/hr on Growth plan)
  for (const keyword of batch) {
    try {
      const raw = await fetchSerpData(keyword, market);
      results.push(await parseKeywordSerp(keyword, raw, clientDomain));
      // 200ms between calls to stay under burst limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`SerpAPI error for "${keyword}":`, err);
    }
  }

  return results;
}

// ─── SERP Feature Summary ─────────────────────────────────────────────────────

function buildSerpFeatureSummary(
  keywords: KeywordSerpData[]
): SerpApiSnapshot['serpFeatureSummary'] {
  return {
    scanned:          keywords.length,
    withPAA:          keywords.filter(k => k.paaQuestions.length > 0).length,
    paaClientCited:   keywords.filter(k => k.paaClientCited).length,
    withVideo:        keywords.filter(k => k.serpFeatures.includes('video_carousel')).length,
    videoClientCited: keywords.filter(k => k.videoClientCited).length,
  };
}

// ─── AIO Summary ──────────────────────────────────────────────────────────────

function buildAIOSummary(
  keywords: KeywordSerpData[],
  clientDomain: string
): SerpApiSnapshot['aioSummary'] {
  const total      = keywords.length;
  const withAIO    = keywords.filter(k => k.hasAIO).length;
  const clientNorm = clientDomain.replace(/^www\./, '');

  let clientCited = 0;
  for (const kw of keywords) {
    if (kw.aioSources.some(s => s.domain.includes(clientNorm))) clientCited++;
  }

  return {
    total,
    withAIO,
    clientCited,
    aioRate:       total > 0 ? withAIO / total : 0,
    clientAIORate: withAIO > 0 ? clientCited / withAIO : 0,
  };
}

function buildTopAIOCompetitors(
  keywords: KeywordSerpData[],
  clientDomain: string
): Array<{ domain: string; citedCount: number }> {
  const counts: Record<string, number> = {};
  const clientNorm = clientDomain.replace(/^www\./, '');

  for (const kw of keywords) {
    for (const src of kw.aioSources) {
      if (!src.domain.includes(clientNorm)) {
        counts[src.domain] = (counts[src.domain] ?? 0) + 1;
      }
    }
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, citedCount]) => ({ domain, citedCount }));
}

// ─── Full Snapshot ────────────────────────────────────────────────────────────

export async function getSerpApiSnapshot(
  domain: string,
  keywords: string[],
  market?: Market,   // v7.99: per-project market
): Promise<SerpApiSnapshot> {
  const keywordData = await batchKeywordScan(keywords, domain, 5, market);
  return buildSnapshotFromKeywordData(domain, keywordData);
}

// ─── Snapshot rebuild from keyword data (v7.81) ──────────────────────────────
// Used by the incremental serp-scan endpoint: merge previously scanned keywords
// with a new batch, then recompute every summary from the combined set so the
// SERP Features panel and keyword table always reflect total coverage.

export function buildSnapshotFromKeywordData(
  domain: string,
  keywordData: KeywordSerpData[]
): SerpApiSnapshot {
  return {
    domain,
    keywords: keywordData,
    aioSummary: buildAIOSummary(keywordData, domain),
    serpFeatureSummary: buildSerpFeatureSummary(keywordData),
    topAIOCompetitors: buildTopAIOCompetitors(keywordData, domain),
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Local / Maps (v7.177 — Local Search panel) ──────────────────────────────
//
// Two raw fetchers for the Local panel. Both use the SAME market gl/hl/domain so
// local results match the analyzed country. Everything returned is REAL SerpAPI
// data — place names, ratings, review counts, GPS — never modeled.

export interface MapsPlace {
  title:    string;
  placeId:  string;
  address:  string;
  rating:   number | null;
  reviews:  number;
  type:     string;
  website:  string;   // raw website URL as listed (may be empty)
  phone:    string;
  lat:      number | null;
  lng:      number | null;
  position: number;   // 1-based order in the result set
}

function parseMapsPlace(r: any, idx: number): MapsPlace {
  const gps = r?.gps_coordinates ?? {};
  const reviewsRaw = r?.reviews;
  return {
    title:    r?.title ?? '',
    placeId:  r?.place_id ?? r?.data_id ?? '',
    address:  r?.address ?? '',
    rating:   typeof r?.rating === 'number' ? r.rating : null,
    reviews:  typeof reviewsRaw === 'number' ? reviewsRaw : (parseInt(reviewsRaw, 10) || 0),
    type:     r?.type ?? (Array.isArray(r?.types) ? r.types[0] : '') ?? '',
    website:  r?.website ?? '',
    phone:    r?.phone ?? '',
    lat:      typeof gps?.latitude === 'number' ? gps.latitude : null,
    lng:      typeof gps?.longitude === 'number' ? gps.longitude : null,
    position: typeof r?.position === 'number' ? r.position : idx + 1,
  };
}

/**
 * Google Maps listings for a free-text query (engine=google_maps). Used to
 * DISCOVER the client's business listings (search the brand name) and to read
 * competitor listing detail (rating, reviews, website, GPS). Returns up to
 * `limit` places. Fault-tolerant: returns [] on any failure.
 */
export async function getMapsListings(
  query: string,
  market?: Market,
  ll?: string,
  limit = 20,
): Promise<MapsPlace[]> {
  const API_KEY = process.env.SERP_API_KEY;
  if (!API_KEY) return [];
  const m = market ?? getMarket('us');
  const params = new URLSearchParams({
    api_key: API_KEY,
    engine:  'google_maps',
    type:    'search',
    q:       query,
    hl:      m.serpHl,
    gl:      m.serpGl,
    output:  'json',
  });
  if (ll) params.set('ll', ll);   // '@lat,lng,zoom' — bias to a location
  try {
    const res = await fetch(`${SERP_BASE}?${params.toString()}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) { console.error(`SerpAPI maps error ${res.status}`); return []; }
    await recordSerp('google_maps', API_KEY);   // v7.225: 1 billed search
    const data = await res.json();
    // google_maps returns local_results[] for a search; place_results{} for an
    // exact single match. Normalize both into MapsPlace[].
    const arr: any[] = Array.isArray(data?.local_results) ? data.local_results : [];
    const places = arr.slice(0, limit).map((r, i) => parseMapsPlace(r, i));
    if (places.length === 0 && data?.place_results) {
      places.push(parseMapsPlace(data.place_results, 0));
    }
    return places;
  } catch (err) {
    console.error('SerpAPI maps fetch failed:', err);
    return [];
  }
}

export interface LocalPackResult {
  packPresent: boolean;
  places:      MapsPlace[];   // the local 3-pack (≤3), in shown order
}

/**
 * The Google local 3-pack for a keyword AS SEEN from a location (engine=google
 * with `ll` GPS bias). Returns the real `local_results.places` Google renders
 * above the organic results. Fault-tolerant: returns {packPresent:false,[]} on
 * failure so one bad call never breaks a scan.
 */
export async function getLocalPack(
  keyword: string,
  market?: Market,
  ll?: string,
): Promise<LocalPackResult> {
  const API_KEY = process.env.SERP_API_KEY;
  if (!API_KEY) return { packPresent: false, places: [] };
  const m = market ?? getMarket('us');
  const params = new URLSearchParams({
    api_key:       API_KEY,
    engine:        'google',
    q:             keyword,
    hl:            m.serpHl,
    gl:            m.serpGl,
    google_domain: m.googleDomain,
    num:           '10',
    output:        'json',
  });
  if (ll) params.set('ll', ll);
  try {
    const res = await fetch(`${SERP_BASE}?${params.toString()}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) { console.error(`SerpAPI local-pack error ${res.status}`); return { packPresent: false, places: [] }; }
    await recordSerp('google_local_pack', API_KEY);   // v7.225: 1 billed search
    const data = await res.json();
    // On the google engine, local_results is an object { places: [...] }.
    const lr = data?.local_results;
    const rawPlaces: any[] = Array.isArray(lr?.places) ? lr.places
      : Array.isArray(lr) ? lr
      : [];
    const places = rawPlaces.slice(0, 3).map((r, i) => parseMapsPlace(r, i));
    return { packPresent: places.length > 0, places };
  } catch (err) {
    console.error('SerpAPI local-pack fetch failed:', err);
    return { packPresent: false, places: [] };
  }
}
