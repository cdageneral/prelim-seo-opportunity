/**
 * Semrush API Client
 * Docs: https://developer.semrush.com/api/v3/
 *
 * Endpoints used:
 *  - Domain Overview (domain.rank)
 *  - Organic Research (domain.organic)
 *  - Keyword Gap Analysis (domainkvgap.organic)
 *  - Competitor Discovery (domain.competitors)
 *  - Backlink Overview (backlinks.overview)
 *  - Share of Voice (requires Semrush .Trends — falls back to position data)
 */

const SEMRUSH_BASE = 'https://api.semrush.com';;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SemrushDomainOverview {
  domain:          string;
  organicKeywords: number;
  organicTraffic:  number;
  organicCost:     number;    // Traffic cost ($)
  authorityScore:  number;    // 0–100
  backlinks:       number;
}

export interface SemrushKeyword {
  keyword:    string;
  position:   number;
  searchVolume: number;
  url:        string;
  cpc:        number;
  competition: number;
}

export interface SemrushCompetitor {
  domain:          string;
  commonKeywords:  number;
  organicKeywords: number;
  organicTraffic:  number;
  relevance:       number;
}

export interface SemrushKeywordGap {
  keyword:          string;
  searchVolume:     number;
  clientPosition:   number | null;   // null = not ranking
  competitor:       string;
  competitorPosition: number;
  cpc:              number;
}

export interface SemrushSnapshot {
  domain:       string;
  overview:     SemrushDomainOverview;
  topKeywords:  SemrushKeyword[];        // Top 50 organic keywords
  competitors:  SemrushCompetitor[];     // Top 10 competitors
  gapKeywords:  SemrushKeywordGap[];     // Keywords competitors rank for, client doesn't
  positionDist: Record<string, number>;  // { "1-3": 42, "4-10": 89, "11-20": 134, "21+": 301 }
  fetchedAt:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSemrushCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(';').map(v => v.trim().replace(/"/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

async function semrushGet(params: Record<string, string>): Promise<string> {
  const API_KEY = process.env.SEMRUSH_API_KEY;
  if (!API_KEY) throw new Error('SEMRUSH_API_KEY is not set — skipping Semrush');
  const qs = new URLSearchParams({ ...params, key: API_KEY });
  const url = `${SEMRUSH_BASE}/?${qs.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Semrush API error ${res.status}: ${await res.text()}`);
  }
  return res.text();
}

// ─── Domain Overview ──────────────────────────────────────────────────────────

export async function getDomainOverview(domain: string): Promise<SemrushDomainOverview> {
  const raw = await semrushGet({
    type:    'domain_ranks',
    domain,
    database: 'us',
    display_limit: '1',
    export_columns: 'Dn,Rk,Or,Ot,Oc,As,Bl',
    // Dn=Domain, Rk=Rank, Or=Organic Keywords, Ot=Organic Traffic,
    // Oc=Organic Cost, As=Authority Score, Bl=Backlinks
  });

  const rows = parseSemrushCSV(raw);
  const row  = rows[0] ?? {};

  return {
    domain,
    organicKeywords: parseInt(row['Organic Keywords'] ?? '0'),
    organicTraffic:  parseInt(row['Organic Traffic'] ?? '0'),
    organicCost:     parseFloat(row['Organic Cost'] ?? '0'),
    authorityScore:  parseInt(row['Authority Score'] ?? '0'),
    backlinks:       parseInt(row['Backlinks'] ?? '0'),
  };
}

// ─── Organic Keywords ────────────────────────────────────────────────────────

export async function getOrganicKeywords(domain: string): Promise<SemrushKeyword[]> {
  const raw = await semrushGet({
    type:    'domain_organic',
    domain,
    database: 'us',
    display_limit: '150',
    display_sort: 'tr_desc',
    export_columns: 'Ph,Po,Nq,Ur,Cp,Co',
  });

  return parseSemrushCSV(raw).map(row => ({
    keyword:      row['Keyword']   ?? '',
    position:     parseInt(row['Position'] ?? '0'),
    searchVolume: parseInt(row['Search Volume'] ?? '0'),
    url:          row['URL']       ?? '',
    cpc:          parseFloat(row['CPC'] ?? '0'),
    competition:  parseFloat(row['Competition'] ?? '0'),
  }));
}

// ─── Competitor Discovery ─────────────────────────────────────────────────────

export async function getCompetitors(domain: string): Promise<SemrushCompetitor[]> {
  const raw = await semrushGet({
    type:    'domain_organic_organic',
    domain,
    database: 'us',
    display_limit: '10',
    export_columns: 'Dn,Co,Or,Ot,Nr',
  });

  return parseSemrushCSV(raw).map(row => ({
    domain:          row['Domain'] ?? '',
    commonKeywords:  parseInt(row['Common Keywords'] ?? '0'),
    organicKeywords: parseInt(row['Organic Keywords'] ?? '0'),
    organicTraffic:  parseInt(row['Organic Traffic'] ?? '0'),
    relevance:       parseFloat(row['Relevance'] ?? '0'),
  }));
}

// ─── Keyword Gap ──────────────────────────────────────────────────────────────

export async function getKeywordGap(
  clientDomain: string,
  competitorDomain: string
): Promise<SemrushKeywordGap[]> {
  // Fetch up to 100 of the competitor's top organic keywords.
  // We fetch 100 so we have enough candidates after the vol ≥ 2400 filter.
  const raw = await semrushGet({
    type:           'domain_organic',
    domain:         competitorDomain,
    database:       'us',
    display_limit:  '100',
    display_sort:   'tr_desc',
    export_columns: 'Ph,Po,Nq,Cp',
  });

  return parseSemrushCSV(raw).map(row => ({
    keyword:            row['Keyword'] ?? '',
    searchVolume:       parseInt(row['Search Volume'] ?? '0'),
    clientPosition:     null,
    competitor:         competitorDomain,
    competitorPosition: parseInt(row['Position'] ?? '0'),
    cpc:                parseFloat(row['CPC'] ?? '0'),
  }));
}

// ─── Brand token helper (mirrors KeywordsPanel logic) ─────────────────────────
// Extracts the root brand name from a domain.
function extractBrandToken(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\.(com|net|org|io|co|ca|us|uk|au|gov|edu|biz|info)(\.[a-z]{2})?$/i, '')
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Returns true if the keyword contains any competitor brand token.
// Used to strip competitor-branded terms from the gap keyword list.
function isCompetitorBranded(keyword: string, competitorDomains: string[]): boolean {
  const kw = keyword.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  return competitorDomains
    .map(extractBrandToken)
    .filter(t => t.length >= 4)
    .some(token => kw.replace(/\s/g, '').includes(token) || kw.includes(token));
}

// ─── Position Distribution ────────────────────────────────────────────────────

function buildPositionDistribution(keywords: SemrushKeyword[]): Record<string, number> {
  const dist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const kw of keywords) {
    if (kw.position <= 3)       dist['1-3']++;
    else if (kw.position <= 10) dist['4-10']++;
    else if (kw.position <= 20) dist['11-20']++;
    else                        dist['21+']++;
  }
  return dist;
}

// ─── Full Snapshot (main entry point) ─────────────────────────────────────────

export async function getSemrushSnapshot(
  domain: string,
  manualCompetitors: string[] = [],   // domains from project.competitors
): Promise<SemrushSnapshot> {
  // Parallel fetch of independent endpoints
  const [overview, topKeywords, autoCompetitors] = await Promise.all([
    getDomainOverview(domain),
    getOrganicKeywords(domain),
    getCompetitors(domain),
  ]);

  // Build the full competitor list: auto-discovered + manually tracked (deduplicated)
  const autoSet   = new Set(autoCompetitors.map(c => c.domain));
  const allCompetitorDomains: string[] = [
    ...autoCompetitors.map(c => c.domain),
    ...manualCompetitors.filter(d => !autoSet.has(d)),
  ];

  // Query gap keywords from EVERY competitor, then merge + deduplicate.
  // Criteria (per product spec):
  //   - vol ≥ 2,400/mo
  //   - not competitor-branded (but client-branded terms are allowed)
  const competitorDomainsForBrandFilter = allCompetitorDomains;

  const gapResults = await Promise.all(
    allCompetitorDomains.slice(0, 5).map(comp =>   // cap at 5 competitors to limit API calls
      getKeywordGap(domain, comp).catch(() => [] as SemrushKeywordGap[])
    )
  );

  // Build a set of keywords the client already ranks for (from topKeywords).
  // These should never appear as gap keywords — competitor ranking for them too is not a gap.
  const clientRankedTexts = new Set(topKeywords.map(k => k.keyword.toLowerCase().trim()));

  // Build client brand token to filter out client-branded terms from gap keywords.
  const clientBrandToken = extractBrandToken(domain);   // e.g. "sonobello"
  const clientHalfLen    = Math.floor(clientBrandToken.length / 2);
  const clientSubTokens  = [
    clientBrandToken,
    ...(clientHalfLen >= 4 ? [clientBrandToken.slice(0, clientHalfLen)] : []),
    ...(clientBrandToken.length - clientHalfLen >= 4 ? [clientBrandToken.slice(clientHalfLen)] : []),
  ].filter(t => t.length >= 4);

  function isClientBranded(keyword: string): boolean {
    const norm = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
    return clientSubTokens.some(t => norm.includes(t));
  }

  // Merge, filter, deduplicate
  const seen  = new Set<string>();
  const gapKeywords: SemrushKeywordGap[] = [];

  for (const batch of gapResults) {
    for (const kw of batch) {
      const key = kw.keyword.toLowerCase().trim();
      if (seen.has(key)) continue;                          // deduplicate across competitors
      if (kw.searchVolume < 2400) continue;                 // volume threshold
      if (clientRankedTexts.has(key)) continue;             // client already ranks for this — not a gap
      if (isClientBranded(kw.keyword)) continue;            // client-branded term — not an opportunity gap
      if (isCompetitorBranded(kw.keyword, competitorDomainsForBrandFilter)) continue; // strip competitor brand terms
      seen.add(key);
      gapKeywords.push(kw);
    }
  }

  // Sort by search volume descending so highest-value gaps appear first
  gapKeywords.sort((a, b) => b.searchVolume - a.searchVolume);

  // Merge auto + manual competitors for the competitors list stored in snapshot
  const competitors = [
    ...autoCompetitors,
    ...manualCompetitors
      .filter(d => !autoSet.has(d))
      .map(d => ({ domain: d, commonKeywords: 0, organicKeywords: 0, organicTraffic: 0, relevance: 1 })),
  ];

  const positionDist = buildPositionDistribution(topKeywords);

  return {
    domain,
    overview,
    topKeywords,
    competitors,
    gapKeywords,
    positionDist,
    fetchedAt: new Date().toISOString(),
  };
}
