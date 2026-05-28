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

const SEMRUSH_BASE = 'https://api.semrush.com';
const API_KEY = process.env.SEMRUSH_API_KEY!;

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
  const qs = new URLSearchParams({ ...params, key: API_KEY });
  const url = `${SEMRUSH_BASE}/?${qs.toString()}`;
  const res = await fetch(url);
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
    export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
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

// ─── Organic Keywords (Top 50) ────────────────────────────────────────────────

export async function getOrganicKeywords(domain: string): Promise<SemrushKeyword[]> {
  const raw = await semrushGet({
    type:    'domain_organic',
    domain,
    database: 'us',
    display_limit: '50',
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
  // Fetch competitor's top organic keywords — these are the gap opportunities.
  // (phrase_kdi is keyword difficulty, not gap analysis. The correct approach
  //  is to pull the competitor's top-traffic keywords and let Claude cross-reference.)
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
    clientPosition:     null,   // Unknown without a second API call; Claude uses this as "gap"
    competitor:         competitorDomain,
    competitorPosition: parseInt(row['Position'] ?? '0'),
    cpc:                parseFloat(row['CPC'] ?? '0'),
  }));
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

export async function getSemrushSnapshot(domain: string): Promise<SemrushSnapshot> {
  // Parallel fetch of independent endpoints
  const [overview, topKeywords, competitors] = await Promise.all([
    getDomainOverview(domain),
    getOrganicKeywords(domain),
    getCompetitors(domain),
  ]);

  // Gap analysis against top competitor
  const topCompetitor = competitors[0]?.domain ?? '';
  const gapKeywords = topCompetitor
    ? await getKeywordGap(domain, topCompetitor)
    : [];

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
