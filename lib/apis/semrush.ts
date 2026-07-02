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

import { recordSemrush } from '@/lib/usage/record';

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
  // v7.286: REAL Semrush SERP-feature signal — does this keyword's Google SERP show a
  // Local Pack (map pack)? Pulled from the Analytics API SERP-features column (`Fl`,
  // Semrush KB 986/1340). `undefined` = the column wasn't returned (older pull / not
  // supported) → treat as UNKNOWN, never as "no" (Const I.5, honest gap).
  triggersLocalPack?: boolean;
}

// v7.286 — detect the "Local pack" SERP feature in a Semrush `Fl` column value.
// Verified-mechanism, value-robust: the legacy Analytics API returns SERP features as a
// delimited list; Local Pack is documented as numeric id 3 (legacy scheme), labelled
// "geo" in the Projects API, and named "Local pack" elsewhere — so we match ALL of
// {token "3", "geo", any token containing "local"} case-insensitively. The first live
// run logs a raw sample so the constant is confirmed against the account (self-verify).
// Sources: https://www.semrush.com/kb/986-api-serp-features , .../1340-serp-features-local-pack
export function serpFeaturesHasLocalPack(raw: string): boolean {
  const s = String(raw ?? '').toLowerCase();
  if (!s.trim()) return false;
  const tokens = s.split(/[,|;]+/).map(t => t.trim()).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '3' || t === 'geo') return true;          // legacy numeric id / Projects label
    if (t.indexOf('local') >= 0) return true;           // "local pack" / "local_pack" name
  }
  return false;
}

/** Find the SERP-features column value in a parsed Semrush CSV row (header name varies). */
function serpFeaturesValue(row: Record<string, string>): string | undefined {
  if (row['SERP Features'] != null) return row['SERP Features'];
  const key = Object.keys(row).find(k => /serp\s*features?/i.test(k));
  return key ? row[key] : undefined;
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
  positionDist: Record<string, number>;  // { "1-3": 42, "4-10": 89, "11-20": 134, "21+": 301 }  (keyword COUNTS)
  // v7.136: search-volume per rank band (sum of MONTHLY searchVolume), same four
  // keys as positionDist. Lets the UI show kw count + volume + volume-share per
  // band. Summed from topKeywords — already pulled, zero extra Semrush units.
  positionVol?: Record<string, number>;
  // v7.136: per-competitor FULL-footprint rank distribution, keyed by competitor
  // domain. Computed from the competitor organic rows ALREADY pulled for the gap
  // analysis (before gap filtering) — zero additional Semrush API cost. Same four
  // buckets as positionDist (counts) / positionVol (monthly volume), so the client
  // and each competitor are directly comparable. Absent on pre-v7.136 snapshots.
  competitorPositionDist?: Record<string, Record<string, number>>;  // counts
  competitorPositionVol?:  Record<string, Record<string, number>>;  // monthly volume
  // v7.322: per-competitor PAGE-1 ranks ON THE CLIENT FOOTPRINT, keyed by competitor
  // domain. Each entry is the competitor's real Semrush position (1–10) for a keyword
  // that is also in the client's ranked footprint (topKeywords). Computed from the
  // competitor organic rows ALREADY pulled for the gap analysis — zero additional
  // Semrush units. The Share-of-Voice panel reads these to score each competitor's
  // page-1 click CAPTURE on the SAME footprint + denominator as the client (Const
  // I.1 real positions; II.7 shared denominator). Unlike `gapKeywords` (which strips
  // keywords the client also ranks for, so a competitor's share would be undercounted),
  // this RETAINS the full overlap — it is the competitor's true page-1 share, not a
  // gap floor. Absent on pre-v7.322 snapshots (panel falls back to uploaded competitors).
  serpCompetitorPositions?: Record<string, Array<{ keyword: string; position: number }>>;
  fetchedAt:    string;
  warnings?:    string[];                // v7.96: non-fatal problems during the pull (e.g. failed gap fetches)
  // v7.286: REAL local-pack signal rolled up from the footprint's `Fl` SERP-features.
  // `localPackKeywords` = lowercased client keywords whose Google SERP shows a Local
  // Pack. `localPackDataAvailable` distinguishes "no local-pack keywords" (false flags
  // present) from "column not returned / pre-v7.286 pull" (undefined) — so read sites
  // can fall back honestly (Const I.5) instead of hiding everything.
  localPackKeywords?:      string[];
  localPackDataAvailable?: boolean;
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
  const body = await res.text();
  // v7.225: record real unit consumption — rows actually returned × the verified
  // per-line rate for this report type. Awaited but fault-tolerant (never throws).
  await recordSemrush(params.type, body, API_KEY);
  return body;
}

// ─── Domain Overview ──────────────────────────────────────────────────────────

// v7.99: all report functions accept a Semrush regional database code
// (default 'us') so a project can target any market (ca, uk, au, …).
export async function getDomainOverview(domain: string, database = 'us'): Promise<SemrushDomainOverview> {
  const raw = await semrushGet({
    type:    'domain_ranks',
    domain,
    database,
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

// v7.86: caps removed per Wayne — the FULL keyword footprint is pulled by
// default (limit <= 0 = unlimited), paginated in chunks of 10,000 rows.
// COST: Semrush bills 10 API units per returned row (verified at
// developer.semrush.com/api/get-started/api-units-balance). Callers must show
// the user a cost estimate before triggering — see /api/projects/[id]/semrush-estimate.
// If the unit balance runs out mid-pull, Semrush returns partial rows; the
// pagination loop stops at the short page and the analyze route surfaces a
// partial-data warning to the UI.
const SEMRUSH_PAGE = 10_000;

// v7.98: server-side volume floor. Semrush display_filter syntax verified live
// against api.semrush.com: '+|Nq|Gt|999' returned only rows with Search Volume
// ≥ 1,000 (Gt = strictly greater, volumes are integers, so Gt|min-1 ≡ ≥ min).
// Rows excluded by the filter are NEVER returned and NEVER billed (10 units/row).
function volumeFilter(volMin: number): Record<string, string> {
  return volMin > 0 ? { display_filter: `+|Nq|Gt|${volMin - 1}` } : {};
}

// v7.163: optional `onPage` callback fires after each 10k-row page with the
// running total fetched, so an on-demand caller (the Content-Plan page-map pull)
// can stream a determinate progress bar. Default undefined → existing callers
// (analyze pipeline) are byte-for-byte unchanged.
export async function getOrganicKeywords(
  domain: string, limit = 0, volMin = 0, database = 'us',
  onPage?: (fetched: number) => void,
): Promise<SemrushKeyword[]> {
  const all: SemrushKeyword[] = [];
  let offset = 0;
  let loggedSerpSample = false;       // v7.286: one-time raw SERP-features sample (self-verify)
  for (;;) {
    const want = limit > 0 ? Math.min(SEMRUSH_PAGE, limit - all.length) : SEMRUSH_PAGE;
    if (want <= 0) break;
    // v7.164: Semrush rejects display_offset=0 (ERROR 605 — must be a positive
    // integer < display_limit, or omitted). Only send it for pages after the first.
    // v7.286: `Fl` = SERP features per keyword (Semrush KB 986) → real Local Pack flag.
    const raw = await semrushGet({
      type:    'domain_organic',
      domain,
      database,
      display_limit:  String(want),
      ...(offset > 0 ? { display_offset: String(offset) } : {}),
      display_sort: 'tr_desc',
      export_columns: 'Ph,Po,Nq,Ur,Cp,Co,Fl',
      ...volumeFilter(volMin),
    });
    const parsed = parseSemrushCSV(raw);
    const rows = parsed.map(row => {
      const sf = serpFeaturesValue(row);                // undefined = column not returned
      return {
        keyword:      row['Keyword']   ?? '',
        position:     parseInt(row['Position'] ?? '0'),
        searchVolume: parseInt(row['Search Volume'] ?? '0'),
        url:          row['URL']       ?? '',
        cpc:          parseFloat(row['CPC'] ?? '0'),
        competition:  parseFloat(row['Competition'] ?? '0'),
        triggersLocalPack: sf === undefined ? undefined : serpFeaturesHasLocalPack(sf),
      } as SemrushKeyword;
    });
    // v7.286 self-verify: log a small raw sample once so the FIRST live run reveals the
    // actual `Fl` value format and confirms the Local-Pack constant against the account.
    if (!loggedSerpSample && parsed.length > 0) {
      const samples = parsed.map(serpFeaturesValue).filter(v => v != null && String(v).trim() !== '').slice(0, 8);
      const colPresent = serpFeaturesValue(parsed[0]) !== undefined;
      console.log(`[OrbitIQ] Semrush SERP-features(Fl) colPresent=${colPresent} sample=${JSON.stringify(samples)}`);
      loggedSerpSample = true;
    }
    all.push(...rows);
    offset += rows.length;
    onPage?.(all.length);
    if (rows.length < want) break;   // footprint exhausted (or API units ran out)
  }
  return all;
}

// ─── Ranking pages + per-page keywords (v7.166) ─────────────────────────────────
//
// The Content-Plan page-map builds on UNIQUE PAGES, not the full keyword
// footprint: `domain_organic_unique` returns each ranking URL with its keyword
// count + traffic (one cheap request, no deep pagination → no display_offset
// 605), then `url_organic` returns the real keywords each page ranks for so the
// page can be mapped to a keyword cluster. COST: 10 API units/row for both.

export interface SemrushPage {
  url:          string;
  keywordCount: number;   // real number of organic keywords the page ranks for
  traffic:      number;   // estimated monthly organic traffic
}

// Top ranking pages of a domain (unique URLs), sorted by traffic. Single request.
export async function getOrganicPages(domain: string, limit = 100, database = 'us'): Promise<SemrushPage[]> {
  const raw = await semrushGet({
    type:           'domain_organic_unique',
    domain,
    database,
    display_limit:  String(Math.max(1, limit)),
    display_sort:   'tr_desc',
    export_columns: 'Ur,Pc,Tr',
  });
  return parseSemrushCSV(raw)
    .map(row => ({
      url:          row['Url'] ?? row['URL'] ?? '',
      keywordCount: parseInt(row['Number of Keywords'] ?? '0'),
      traffic:      parseInt(row['Traffic'] ?? '0'),
    }))
    .filter(p => p.url);
}

// The organic keywords a single URL ranks for (top `limit` by traffic).
export async function getUrlKeywords(url: string, limit = 25, database = 'us'): Promise<SemrushKeyword[]> {
  const raw = await semrushGet({
    type:           'url_organic',
    url,
    database,
    display_limit:  String(Math.max(1, limit)),
    display_sort:   'tr_desc',
    export_columns: 'Ph,Po,Nq',
  });
  return parseSemrushCSV(raw)
    .map(row => ({
      keyword:      row['Keyword'] ?? '',
      position:     parseInt(row['Position'] ?? '0'),
      searchVolume: parseInt(row['Search Volume'] ?? '0'),
      url,
      cpc:          0,
      competition:  0,
    }))
    .filter(k => k.keyword);
}

// ─── Demand-side keyword research (v7.155) ──────────────────────────────────────
//
// These pull the DEMAND UNIVERSE around a seed phrase — what people actually
// search — independent of who ranks. Used by the on-demand "Build deep journey"
// expansion so the Audience Journey covers the full topic map with REAL monthly
// search volumes, not just the client/competitor ranking footprint.
// COST: Semrush bills ~40 API units per returned row for these reports.
// Columns: Ph=Phrase, Nq=Search Volume, Cp=CPC, Co=Competition, Kd=Difficulty.

export interface SemrushPhrase {
  keyword:      string;
  searchVolume: number;
  cpc:          number;
  competition:  number;
}

function parsePhraseRows(raw: string): SemrushPhrase[] {
  return parseSemrushCSV(raw).map(row => ({
    keyword:      row['Keyword']       ?? '',
    searchVolume: parseInt(row['Search Volume'] ?? '0'),
    cpc:          parseFloat(row['CPC'] ?? '0'),
    competition:  parseFloat(row['Competition'] ?? '0'),
  })).filter(r => r.keyword);
}

// Question-format keywords for a seed (who/what/why/how …) with real volumes.
export async function getPhraseQuestions(phrase: string, limit = 50, database = 'us'): Promise<SemrushPhrase[]> {
  const raw = await semrushGet({
    type:           'phrase_questions',
    phrase,
    database,
    display_limit:  String(limit),
    display_sort:   'nq_desc',
    export_columns: 'Ph,Nq,Cp,Co',
  });
  return parsePhraseRows(raw);
}

// Semantically related / topically adjacent keywords for a seed, with volumes.
export async function getPhraseRelated(phrase: string, limit = 50, database = 'us'): Promise<SemrushPhrase[]> {
  const raw = await semrushGet({
    type:           'phrase_related',
    phrase,
    database,
    display_limit:  String(limit),
    display_sort:   'nq_desc',
    export_columns: 'Ph,Nq,Cp,Co',
  });
  return parsePhraseRows(raw);
}

// ─── Competitor Discovery ─────────────────────────────────────────────────────

export async function getCompetitors(domain: string, database = 'us'): Promise<SemrushCompetitor[]> {
  const raw = await semrushGet({
    type:    'domain_organic_organic',
    domain,
    database,
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

// ─── Top SERP rivals (page-1 ranks on the client footprint) ───────────────────

// v7.323 — SINGLE SOURCE OF TRUTH for the snapshot's `serpCompetitorPositions`.
// Given the CLIENT footprint keywords and a set of competitor domains each carrying
// their full organic rows (with positions), keep, per domain, the competitor's page-1
// ranks (pos 1–10) for keywords that are ALSO in the client footprint. Retains
// client-overlap keywords (unlike `gapKeywords`, which strips them) so the
// Share-of-Voice panel scores each rival's TRUE page-1 capture on the same footprint
// + denominator as the client (Const I.1 real positions; II.7 shared denominator).
// Used by getSemrushSnapshot (auto path) AND enrichSerpCompetitors (upload path).
export function buildSerpCompetitorPositions(
  topKeywords: Array<{ keyword: string }>,
  perDomain:   Array<{ domain: string; rows: SemrushKeywordGap[] }>,
): Record<string, Array<{ keyword: string; position: number }>> {
  const clientFootprintKeys = new Set(topKeywords.map(k => (k.keyword ?? '').toLowerCase().trim()));
  const out: Record<string, Array<{ keyword: string; position: number }>> = {};
  for (const { domain, rows } of perDomain) {
    if (!rows || rows.length === 0) continue;
    const seenKw = new Set<string>();
    const hits: Array<{ keyword: string; position: number }> = [];
    for (const r of rows) {
      const p = r.competitorPosition;
      if (p == null || p < 1 || p > 10) continue;          // page-1 window — matches the SoV capture math
      const k = (r.keyword ?? '').toLowerCase().trim();
      if (!k || !clientFootprintKeys.has(k)) continue;      // overlap with the client footprint only
      if (seenKw.has(k)) continue;                          // one rank per keyword (domain_organic is 1 row/kw)
      seenKw.add(k);
      hits.push({ keyword: k, position: p });
    }
    if (hits.length > 0) out[domain] = hits;
  }
  return out;
}

// v7.323 — Competitor-ONLY enrichment for UPLOAD-footprint projects. Their snapshot is
// built by buildSnapshotFromUploads, which never pulls Semrush competitor footprints, so
// the SoV panel has no SERP rivals. This pulls the Semrush auto-discovered organic
// competitors (+ any manual ones) and their FULL footprints (the same domain_organic
// pulls getSemrushSnapshot makes), then intersects with the client's UPLOADED footprint
// (topKeywords) to produce `serpCompetitorPositions`. The client footprint is NOT
// re-pulled — only competitor footprints — so an upload project's own data is untouched.
// Uncapped competitor domains (v7.337 B14, Const I.6 — mirrors the auto path, which
// dropped its 5-domain cap in the same release). Usage is auto-recorded by
// semrushGet under the current usage-project context.
export async function enrichSerpCompetitors(
  clientDomain:      string,
  topKeywords:       Array<{ keyword: string }>,
  manualCompetitors: string[] = [],
  competitorVolMin = 0,
  database = 'us',
): Promise<{
  serpCompetitorPositions: Record<string, Array<{ keyword: string; position: number }>>;
  competitorsPulled:       string[];
  warnings:                string[];
}> {
  const warnings: string[] = [];
  const autoCompetitors = await getCompetitors(clientDomain, database).catch(() => [] as SemrushCompetitor[]);
  const autoSet    = new Set(autoCompetitors.map(c => c.domain));
  // v7.337 (B14): uncapped — every auto-discovered + manual competitor domain is pulled.
  const gapDomains = [
    ...autoCompetitors.map(c => c.domain),
    ...manualCompetitors.filter(d => !autoSet.has(d)),
  ].filter(Boolean);

  if (gapDomains.length === 0) {
    warnings.push(
      'No organic competitors found for this domain (Semrush auto-discovery returned none and ' +
      'no manual competitors are set), so there are no SERP rivals to add.'
    );
    return { serpCompetitorPositions: {}, competitorsPulled: [], warnings };
  }

  const perDomain = await Promise.all(gapDomains.map(async comp => {
    try {
      const rows = await getKeywordGap(clientDomain, comp, 0, competitorVolMin, database);
      return { domain: comp, rows };
    } catch (err) {
      warnings.push(`Competitor footprint pull for ${comp} failed: ${String((err as any)?.message ?? err)}.`);
      return { domain: comp, rows: [] as SemrushKeywordGap[] };
    }
  }));

  const serpCompetitorPositions = buildSerpCompetitorPositions(topKeywords, perDomain);
  const competitorsPulled = perDomain.filter(d => d.rows.length > 0).map(d => d.domain);
  if (Object.keys(serpCompetitorPositions).length === 0) {
    warnings.push(
      'Competitors were pulled, but none rank page 1 on your uploaded footprint, so there are no ' +
      'SERP-rival slices to add yet (honest gap — no modeled slice).'
    );
  }
  return { serpCompetitorPositions, competitorsPulled, warnings };
}

// v7.323 — Semrush unit estimate for enrichSerpCompetitors (competitor footprints only;
// the client footprint is NOT re-pulled). Mirrors estimateSemrushPull's per-domain count
// logic. The estimate is a CEILING when a competitor volume floor is set (filtered rows
// are fetched/billed at fewer than the unfiltered footprint count).
export async function estimateSerpCompetitorPull(
  domain: string,
  manualCompetitors: string[] = [],
  competitorVolMin = 0,
  database = 'us',
): Promise<{
  competitors: Array<{ domain: string; keywords: number }>;
  totalRows:   number;
  totalUnits:  number;
  isCeiling:   boolean;
}> {
  const autoCompetitors = await getCompetitors(domain, database).catch(() => [] as SemrushCompetitor[]);
  const autoSet    = new Set(autoCompetitors.map(c => c.domain));
  // v7.337 (B14): uncapped — the estimate mirrors enrichSerpCompetitors' uncapped plan.
  const gapDomains = [
    ...autoCompetitors.map(c => c.domain),
    ...manualCompetitors.filter(d => !autoSet.has(d)),
  ].filter(Boolean);

  const competitors: Array<{ domain: string; keywords: number }> = [];
  for (const d of gapDomains) {
    const known = autoCompetitors.find(c => c.domain === d)?.organicKeywords;
    if (known && known > 0) {
      competitors.push({ domain: d, keywords: known });
    } else {
      const ov = await getDomainOverview(d, database).catch(() => null);
      competitors.push({ domain: d, keywords: ov?.organicKeywords ?? 0 });
    }
  }
  const totalRows = competitors.reduce((s, c) => s + c.keywords, 0);
  return { competitors, totalRows, totalUnits: totalRows * 10, isCeiling: competitorVolMin > 0 };
}

// ─── Keyword Gap ──────────────────────────────────────────────────────────────

// v7.86: cap removed — pulls the competitor's FULL organic footprint
// (limit <= 0 = unlimited, paginated). Volume filtering now happens in
// getSemrushSnapshot using the PROJECT-level threshold, not a hardcoded 2,400.
export async function getKeywordGap(
  clientDomain: string,
  competitorDomain: string,
  limit = 0,
  volMin = 0,          // v7.98: server-side volume floor — filtered rows are never billed
  database = 'us',     // v7.99: per-project market
): Promise<SemrushKeywordGap[]> {
  const all: SemrushKeywordGap[] = [];
  let offset = 0;
  for (;;) {
    const want = limit > 0 ? Math.min(SEMRUSH_PAGE, limit - all.length) : SEMRUSH_PAGE;
    if (want <= 0) break;
    const raw = await semrushGet({
      type:           'domain_organic',
      domain:         competitorDomain,
      database,
      display_limit:  String(want),
      display_offset: String(offset),
      display_sort:   'tr_desc',
      export_columns: 'Ph,Po,Nq,Cp',
      ...volumeFilter(volMin),
    });
    const rows = parseSemrushCSV(raw).map(row => ({
      keyword:            row['Keyword'] ?? '',
      searchVolume:       parseInt(row['Search Volume'] ?? '0'),
      clientPosition:     null,
      competitor:         competitorDomain,
      competitorPosition: parseInt(row['Position'] ?? '0'),
      cpc:                parseFloat(row['CPC'] ?? '0'),
    }));
    all.push(...rows);
    offset += rows.length;
    if (rows.length < want) break;
  }
  return all;
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

// v7.136: same buckets, but SUM the monthly searchVolume per band instead of
// counting. Mirrors buildPositionDistribution exactly so counts and volume share
// one bucket definition.
export function buildVolumeDistribution(keywords: SemrushKeyword[]): Record<string, number> {
  const dist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const kw of keywords) {
    const v = kw.searchVolume ?? 0;
    if (kw.position <= 3)       dist['1-3']  += v;
    else if (kw.position <= 10) dist['4-10'] += v;
    else if (kw.position <= 20) dist['11-20'] += v;
    else                        dist['21+']  += v;
  }
  return dist;
}

// v7.136: competitor-side equivalents over the gap-pull rows (full footprint,
// keyed on competitorPosition). Rows with no/zero rank are skipped so we never
// invent a bucket.
export function buildCompetitorPositionDistribution(rows: SemrushKeywordGap[]): Record<string, number> {
  const dist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const r of rows) {
    const p = r.competitorPosition;
    if (!p || p <= 0)  continue;
    if (p <= 3)        dist['1-3']++;
    else if (p <= 10)  dist['4-10']++;
    else if (p <= 20)  dist['11-20']++;
    else               dist['21+']++;
  }
  return dist;
}

export function buildCompetitorVolumeDistribution(rows: SemrushKeywordGap[]): Record<string, number> {
  const dist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const r of rows) {
    const p = r.competitorPosition;
    if (!p || p <= 0)  continue;
    const v = r.searchVolume ?? 0;
    if (p <= 3)        dist['1-3']  += v;
    else if (p <= 10)  dist['4-10'] += v;
    else if (p <= 20)  dist['11-20'] += v;
    else               dist['21+']  += v;
  }
  return dist;
}

// ─── Full Snapshot (main entry point) ─────────────────────────────────────────

export async function getSemrushSnapshot(
  domain: string,
  manualCompetitors: string[] = [],   // domains from project.competitors
  gapVolMin = 0,                      // v7.86: project-level threshold (was hardcoded 2,400)
  clientVolMin = 0,                   // v7.98: client volume floor, applied at the API level
  database = 'us',                    // v7.99: per-project market (Semrush regional database)
): Promise<SemrushSnapshot> {
  // Parallel fetch of independent endpoints. v7.98: project volume thresholds
  // are applied INSIDE the Semrush query (display_filter) so excluded rows are
  // never fetched or billed — not just filtered after the fact.
  const [overview, topKeywords, autoCompetitors] = await Promise.all([
    getDomainOverview(domain, database),
    getOrganicKeywords(domain, 0, clientVolMin, database),
    getCompetitors(domain, database),
  ]);

  // Build the full competitor list: auto-discovered + manually tracked (deduplicated)
  const autoSet   = new Set(autoCompetitors.map(c => c.domain));
  const allCompetitorDomains: string[] = [
    ...autoCompetitors.map(c => c.domain),
    ...manualCompetitors.filter(d => !autoSet.has(d)),
  ];

  // Query gap keywords from competitors (full footprint each), merge + dedupe.
  // Criteria:
  //   - vol ≥ project gap threshold (gapVolMin; 0 = no floor)
  //   - not competitor-branded (but client-branded terms are allowed)
  const competitorDomainsForBrandFilter = allCompetitorDomains;

  // v7.96: gap-pull failures are no longer silently swallowed. Each competitor
  // pull records its outcome; failures and empty pulls become snapshot warnings
  // so the UI can tell the user WHY Competitor Gap is empty instead of showing 0.
  const warnings: string[] = [];
  // v7.337 (QC audit B14, Const I.6 — no limits by default; Wayne: REMOVE): the
  // 5-competitor-domain cap is gone. Gap keywords are pulled for EVERY configured +
  // auto-discovered competitor domain (auto-discovery itself returns at most 10 —
  // getCompetitors display_limit — and manual competitors are user-bounded). Per-domain
  // pulls were already uncapped. Affects NEW analyses only; stored snapshots are untouched.
  const gapDomains = allCompetitorDomains;

  const gapResults = await Promise.all(
    gapDomains.map(async comp => {
      try {
        const rows = await getKeywordGap(domain, comp, 0, gapVolMin, database);
        console.log(`[OrbitIQ] Gap pull ${comp}: ${rows.length} raw rows`);
        if (rows.length === 0) {
          warnings.push(
            `Competitor gap pull for ${comp} returned 0 rows — ` +
            `your Semrush API unit balance may be exhausted, or the domain has no US organic data. ` +
            `Check Subscription info → API units at semrush.com and re-run.`
          );
        }
        return rows;
      } catch (err) {
        console.error(`[OrbitIQ] Gap pull FAILED for ${comp}:`, err);
        warnings.push(
          `Competitor gap pull for ${comp} failed: ${String((err as any)?.message ?? err)}. ` +
          `Competitor Gap data is missing this domain — check your Semrush API unit balance and re-run.`
        );
        return [] as SemrushKeywordGap[];
      }
    })
  );

  // v7.136: per-competitor FULL-footprint rank distribution (counts + monthly
  // volume), computed from the organic rows just fetched above (before any gap
  // filtering). gapResults[i] corresponds to gapDomains[i]. Zero extra Semrush
  // units — pure reuse. Empty pulls are skipped so no fabricated all-zero band.
  const competitorPositionDist: Record<string, Record<string, number>> = {};
  const competitorPositionVol:  Record<string, Record<string, number>> = {};
  gapDomains.forEach((comp, i) => {
    const rows = gapResults[i] ?? [];
    if (rows.length === 0) return;
    competitorPositionDist[comp] = buildCompetitorPositionDistribution(rows);
    competitorPositionVol[comp]  = buildCompetitorVolumeDistribution(rows);
  });

  // v7.322 — Top SERP competitor PAGE-1 capture inputs (zero extra Semrush units).
  // gapResults[i] is competitor i's FULL organic footprint (with positions), pulled
  // above for the gap analysis BEFORE any gap filtering. Intersect it with the CLIENT
  // footprint keyword set (topKeywords) and keep only the competitor's page-1 ranks
  // (pos 1–10). The Share-of-Voice panel scores each competitor's page-1 click capture
  // from these on the SAME footprint + denominator as the client (Const I.1 — real
  // Semrush positions; II.7 — shared denominator). Crucially, this RETAINS keywords the
  // client also ranks for (which `gapKeywords` strips), so it is the competitor's true
  // page-1 share, not an opportunity-gap floor. Volumes are NOT stored here — the panel
  // applies the live footprint volume per keyword, so the denominator stays identical
  // to the client's and to the Total/Ranked/Pg-1 cards.
  // v7.323: extracted to buildSerpCompetitorPositions() (single source of truth) so
  // the upload-footprint enrichment path (enrichSerpCompetitors) computes it identically.
  const serpCompetitorPositions = buildSerpCompetitorPositions(
    topKeywords,
    gapDomains.map((comp, i) => ({ domain: comp, rows: gapResults[i] ?? [] })),
  );

  // Build a set of keywords the client already ranks for (from topKeywords).
  // These should never appear as gap keywords — competitor ranking for them too is not a gap.
  const clientRankedTexts = new Set(topKeywords.map(k => k.keyword.toLowerCase().trim()));

  // Build client brand token to filter out client-branded terms from gap keywords.
  const clientBrandToken = extractBrandToken(domain);   // e.g. "sonobello" / "td"
  const clientHalfLen    = Math.floor(clientBrandToken.length / 2);
  const clientSubTokens  = [
    clientBrandToken,
    ...(clientHalfLen >= 4 ? [clientBrandToken.slice(0, clientHalfLen)] : []),
    ...(clientBrandToken.length - clientHalfLen >= 4 ? [clientBrandToken.slice(clientHalfLen)] : []),
  ].filter(t => t.length >= 4);
  // v7.205: short client brand (2–3 chars, e.g. "td" from td.com) was previously
  // dropped by the ≥4 filter, so client-branded gap terms leaked through. Match it
  // on a WORD BOUNDARY (mirrors isBrandedKeyword's short-token rule) — never the
  // raw space-stripped substring, which would falsely strip "direct deposit".
  const clientShortToken = (clientBrandToken.length >= 2 && clientBrandToken.length <= 3)
    ? clientBrandToken : null;

  function isClientBranded(keyword: string): boolean {
    const kw = keyword.toLowerCase();
    if (clientShortToken) {
      const words = kw.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
      for (const w of words) {
        const i = w.indexOf(clientShortToken);
        if (i === 0) return true;
        if (i >= 2 && w.length - (i + clientShortToken.length) >= 2) return true;
      }
      const spaced = clientShortToken.split('').join('\\s+');
      if (new RegExp(`\\b${spaced}\\b`).test(kw)) return true;
    }
    const norm = kw.replace(/[^a-z0-9]/g, '');
    return clientSubTokens.some(t => norm.includes(t));
  }

  // Merge, filter, deduplicate
  const seen  = new Set<string>();
  const gapKeywords: SemrushKeywordGap[] = [];

  for (const batch of gapResults) {
    for (const kw of batch) {
      const key = kw.keyword.toLowerCase().trim();
      if (seen.has(key)) continue;                          // deduplicate across competitors
      if (gapVolMin > 0 && kw.searchVolume < gapVolMin) continue;   // v7.86: project-level threshold (no hardcoded floor)
      if (clientRankedTexts.has(key)) continue;             // client already ranks for this — not a gap
      if (isClientBranded(kw.keyword)) continue;            // client-branded term — not an opportunity gap
      if (isCompetitorBranded(kw.keyword, competitorDomainsForBrandFilter)) continue; // strip competitor brand terms
      seen.add(key);
      gapKeywords.push(kw);
    }
  }

  // Sort by search volume descending so highest-value gaps appear first
  gapKeywords.sort((a, b) => b.searchVolume - a.searchVolume);

  // v7.96: distinguish "no competitors", "pulls returned nothing", and
  // "pulls returned rows but every row was filtered out".
  const rawGapRows = gapResults.reduce((s, batch) => s + batch.length, 0);
  if (gapDomains.length === 0) {
    warnings.push(
      `No competitors found (auto-discovery returned none and no manual competitors are set) — ` +
      `Competitor Gap will be empty. Add competitors in Edit Project and re-run.`
    );
  } else if (rawGapRows > 0 && gapKeywords.length === 0) {
    warnings.push(
      `Competitor pulls returned ${rawGapRows.toLocaleString()} keyword rows, but every one was filtered out ` +
      `(client already ranks for it, branded term, or below the gap volume threshold of ${gapVolMin.toLocaleString()}). ` +
      `Lower the competitor volume threshold in Edit Project if this seems wrong.`
    );
  }

  // Merge auto + manual competitors for the competitors list stored in snapshot
  const competitors = [
    ...autoCompetitors,
    ...manualCompetitors
      .filter(d => !autoSet.has(d))
      .map(d => ({ domain: d, commonKeywords: 0, organicKeywords: 0, organicTraffic: 0, relevance: 1 })),
  ];

  const positionDist = buildPositionDistribution(topKeywords);
  const positionVol  = buildVolumeDistribution(topKeywords);   // v7.136

  // v7.286: roll up the real per-keyword Local Pack flag (from the footprint's `Fl`
  // column) into a deduped lowercased keyword list. `available` = the column was
  // returned for at least one row (so an empty list means "checked, none" — not "unknown").
  const localPackDataAvailable = topKeywords.some(k => k.triggersLocalPack !== undefined);
  const localPackSet = new Set<string>();
  topKeywords.forEach(k => { if (k.triggersLocalPack) localPackSet.add((k.keyword || '').toLowerCase()); });
  const localPackKeywords = Array.from(localPackSet);
  console.log(`[OrbitIQ] LocalPack rollup: dataAvailable=${localPackDataAvailable}, localPackKeywords=${localPackKeywords.length}/${topKeywords.length}`);

  return {
    domain,
    overview,
    topKeywords,
    competitors,
    gapKeywords,
    positionDist,
    positionVol,
    competitorPositionDist,
    competitorPositionVol,
    serpCompetitorPositions,
    fetchedAt: new Date().toISOString(),
    warnings,
    localPackKeywords,
    localPackDataAvailable,
  };
}

// ─── Pull cost estimate (v7.86) ──────────────────────────────────────────────
// Estimates the Semrush API unit cost of a full uncapped analysis BEFORE it
// runs, so the user can confirm. Mirrors getSemrushSnapshot's fetch plan:
// client full footprint + full footprint of EVERY competitor domain (auto-discovered
// merged with manual — uncapped since v7.337 B14, Const I.6; the estimate MUST mirror
// the real pull or the confirmed cost would be a lie, Const I.5). Semrush bills 10
// units per row for domain reports. The estimate itself costs a few rows.

export interface SemrushPullEstimate {
  client:      { domain: string; keywords: number };
  competitors: Array<{ domain: string; keywords: number }>;
  totalRows:   number;
  totalUnits:  number;   // totalRows × 10
  // v7.98: active project volume floors. The per-domain keyword counts above are
  // UNFILTERED footprint sizes (Semrush has no cheap filtered-count endpoint), so
  // when a floor is set the estimate is a CEILING — the actual pull fetches and
  // bills only rows at/above the floor, which can be far fewer.
  clientVolMin:     number;
  competitorVolMin: number;
  isCeiling:        boolean;   // true when any floor > 0
}

export async function estimateSemrushPull(
  domain: string,
  manualCompetitors: string[] = [],
  clientVolMin = 0,
  competitorVolMin = 0,
  database = 'us',     // v7.99: per-project market — counts are market-specific
): Promise<SemrushPullEstimate> {
  const [overview, autoCompetitors] = await Promise.all([
    getDomainOverview(domain, database),
    getCompetitors(domain, database).catch(() => [] as SemrushCompetitor[]),
  ]);

  const autoSet = new Set(autoCompetitors.map(c => c.domain));
  // v7.337 (B14): uncapped — mirrors the uncapped getSemrushSnapshot pull plan exactly.
  const gapDomains = [
    ...autoCompetitors.map(c => c.domain),
    ...manualCompetitors.filter(d => !autoSet.has(d)),
  ];

  // Keyword counts: reuse auto-discovery's organicKeywords where known,
  // otherwise fetch the domain overview (1 row each).
  const competitors: Array<{ domain: string; keywords: number }> = [];
  for (const d of gapDomains) {
    const known = autoCompetitors.find(c => c.domain === d)?.organicKeywords;
    if (known && known > 0) {
      competitors.push({ domain: d, keywords: known });
    } else {
      const ov = await getDomainOverview(d, database).catch(() => null);
      competitors.push({ domain: d, keywords: ov?.organicKeywords ?? 0 });
    }
  }

  const totalRows = overview.organicKeywords + competitors.reduce((s, c) => s + c.keywords, 0);
  return {
    client:      { domain, keywords: overview.organicKeywords },
    competitors,
    totalRows,
    totalUnits:  totalRows * 10,
    clientVolMin,
    competitorVolMin,
    isCeiling:   clientVolMin > 0 || competitorVolMin > 0,
  };
}
