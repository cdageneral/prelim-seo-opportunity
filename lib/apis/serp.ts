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

export interface KeywordSerpData {
  keyword:         string;
  searchVolume?:   number;   // Passed in from Semrush data
  organicResults:  SerpResult[];
  hasAIO:          boolean;
  aioSources:      AIOSource[];     // Domains cited in the AI Overview
  featuredSnippet: SerpResult | null;
  paaQuestions:    string[];        // People Also Ask
  serpFeatures:    string[];        // ['featured_snippet', 'knowledge_panel', 'local_pack', ...]
  clientRank:      number | null;   // Client's position on this SERP (null = not found)
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
  topAIOCompetitors: Array<{ domain: string; citedCount: number }>;
  fetchedAt: string;
}

// ─── Core SERP Fetch ──────────────────────────────────────────────────────────

async function fetchSerpData(keyword: string): Promise<any> {
  const API_KEY = process.env.SERP_API_KEY;
  if (!API_KEY) throw new Error('SERP_API_KEY is not set — skipping SerpAPI');
  const params = new URLSearchParams({
    api_key:  API_KEY,
    engine:   'google',
    q:        keyword,
    hl:       'en',
    gl:       'us',
    num:      '10',
    output:   'json',
  });

  const res = await fetch(`${SERP_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ─── Parse SERP Response ──────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function parseKeywordSerp(keyword: string, data: any, clientDomain: string): KeywordSerpData {
  // Organic results
  const organicResults: SerpResult[] = (data.organic_results ?? []).map((r: any) => ({
    position: r.position ?? 0,
    title:    r.title ?? '',
    url:      r.link ?? '',
    domain:   extractDomain(r.link ?? ''),
    snippet:  r.snippet,
  }));

  // AI Overview detection
  const aio = data.ai_overview ?? data.answer_box_with_ai_overview;
  const hasAIO = !!aio;
  const aioSources: AIOSource[] = [];

  if (hasAIO && aio?.sources) {
    for (const src of aio.sources) {
      if (src.link) {
        aioSources.push({
          title:  src.title ?? '',
          url:    src.link,
          domain: extractDomain(src.link),
        });
      }
    }
  }

  // Featured snippet
  const fsRaw = data.answer_box;
  const featuredSnippet: SerpResult | null = fsRaw?.link ? {
    position: 0,
    title:    fsRaw.title ?? '',
    url:      fsRaw.link,
    domain:   extractDomain(fsRaw.link),
    snippet:  fsRaw.answer ?? fsRaw.snippet,
  } : null;

  // PAA questions
  const paaQuestions: string[] = (data.related_questions ?? []).map((q: any) => q.question ?? '');

  // SERP feature inventory
  const serpFeatures: string[] = [];
  if (data.answer_box)      serpFeatures.push('featured_snippet');
  if (aio || data.ai_overview) serpFeatures.push('ai_overview');
  if (data.knowledge_graph)    serpFeatures.push('knowledge_panel');
  if (data.local_results)      serpFeatures.push('local_pack');
  if (data.shopping_results)   serpFeatures.push('shopping');
  if (data.videos)             serpFeatures.push('video_carousel');
  if (data.images_results)     serpFeatures.push('image_pack');
  if (data.twitter_results)    serpFeatures.push('twitter_pack');

  // Client rank
  const clientResult = organicResults.find(r =>
    r.domain.includes(clientDomain.replace(/^www\./, ''))
  );
  const clientRank = clientResult?.position ?? null;

  return {
    keyword,
    organicResults,
    hasAIO,
    aioSources,
    featuredSnippet,
    paaQuestions,
    serpFeatures,
    clientRank,
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
  limit = 50
): Promise<KeywordSerpData[]> {
  const batch = keywords.slice(0, limit);
  const results: KeywordSerpData[] = [];

  // Sequential with small delay to respect rate limits (200/hr on Growth plan)
  for (const keyword of batch) {
    try {
      const raw = await fetchSerpData(keyword);
      results.push(parseKeywordSerp(keyword, raw, clientDomain));
      // 200ms between calls to stay under burst limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`SerpAPI error for "${keyword}":`, err);
    }
  }

  return results;
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
  keywords: string[]
): Promise<SerpApiSnapshot> {
  const keywordData = await batchKeywordScan(keywords, domain);

  return {
    domain,
    keywords: keywordData,
    aioSummary: buildAIOSummary(keywordData, domain),
    topAIOCompetitors: buildTopAIOCompetitors(keywordData, domain),
    fetchedAt: new Date().toISOString(),
  };
}
