// ─────────────────────────────────────────────────────────────────────────────
// lib/productInsights.ts — v7.430
//
// THE single shared basis for Product Insights (Const II.7): the panel
// (components/brief/ProductInsightsSection.tsx) and the Assessment PDF
// (lib/pdf/assessmentTemplate.ts via the PDF route) both call
// `buildProductRows` — the PDF READS the same computation the screen runs,
// never a re-derivation (Const II.6a/II.6b).
//
// v7.430 changes vs the v7.426 in-component logic (both Wayne-requested):
//  1. Probe scores aggregate to the UMBRELLA through the STORED taxonomy
//     (categories[].parent chains, II.8) — the probe stores the breakdown's
//     top categories, which are often sub-categories, so umbrella-name
//     matching showed "not probed" even when constituent categories were.
//  2. An umbrella whose stored category type is 'brand' is excluded from the
//     product list (it is the CLIENT's brand lane — no III.1 violation, but
//     it is not a product; read from stored type, never inferred from text).
// ─────────────────────────────────────────────────────────────────────────────

import type { Topic } from '@/lib/clusters/canonical';
import { normSovDomain } from '@/lib/sov/model';
import { extractBrand } from '@/lib/utils/kwVolume';

export interface StoredMentionSource { domain: string; url: string; title: string }
export interface StoredMentionRow {
  platform: string; modelName: string; question: string; answerExcerpt: string;
  sources: StoredMentionSource[];
  searchResultDomains: string[]; brandEntities: string[];
  aiSearchVolume: number | null; webSearchBased: boolean | null; lastResponseAt: string | null;
}
export interface StoredCatScan {
  category: string; query: string; scannedAt: string; totalCount: number;
  fetched: number; costUSD: number; provider: string; rows: StoredMentionRow[];
}

export interface LadderEntry { domain: string; kind: 'client' | 'tracked' | 'rival'; p1Vol: number; p1Kw: number; measuredKw: number }

export interface ProductRow {
  name:        string;
  topics:      Topic[];
  kwCount:     number;
  demand:      number;               // monthly volume (exact rollup of the product's canonical keywords)
  bands:       [number, number, number, number];   // vol at pos 1–3 / 4–10 / 11–20 / 21+ or unranked
  p1Share:     number;               // 0–1 measured: (bands0+bands1)/demand
  ladder:      LadderEntry[];
  clientRank:  number | null;
  probe:       { mentions: number; total: number; claude: string; gpt: string } | null;
  scan:        StoredCatScan | null;
  aiRate:      number | null;        // probe unbranded mention rate 0–1 (labeled basis)
  dfsShare:    number | null;        // share of recorded answers naming/citing the client 0–1
  citedTop:    Array<{ domain: string; count: number; isClient: boolean }>;
  arbTopics:   number;
  verdicts:    { arb: number; dual: number; aiOnly: number; none: number };
}

export interface ProductKpi { arb: number; dual: number; aiOnly: number; none: number; citesClient: number; citesTotal: number }

// ─── Deterministic verdict thresholds (stated on-panel and in the PDF) ──────
export const AI_WEAK_BELOW  = 0.3;
export const AI_STRONG_FROM = 0.5;

export type TopicVerdict = 'arb' | 'dual' | 'aiOnly' | 'none' | 'noAiData';

export function topicVerdict(bestPos: number | null, aiRate: number | null, dfsShare: number | null): TopicVerdict {
  const rates = [aiRate, dfsShare].filter((x): x is number => x !== null);
  if (rates.length === 0) return 'noAiData';
  const weak   = rates.every(r => r < AI_WEAK_BELOW);
  const strong = rates.some(r => r >= AI_STRONG_FROM);
  const onP1   = bestPos !== null && bestPos <= 10;
  if (onP1 && weak) return 'arb';
  if (onP1) return 'dual';
  if (strong) return 'aiOnly';
  return 'none';
}

const normName = (s: string) => s.toLowerCase().trim();

/**
 * Does this recorded row name OR cite the client? Direct field checks only.
 * v7.434: the text test now runs on a squashed haystack (see `squash`), so a brand
 * written "American Express" matches the domain-derived token "americanexpress".
 */
export function rowNamesClient(row: StoredMentionRow, clientNorm: string, brandToks: string[]): boolean {
  if ((row.sources ?? []).some(s => normSovDomain(s.domain) === clientNorm)) return true;
  if ((row.searchResultDomains ?? []).some(d => normSovDomain(d) === clientNorm)) return true;
  const hay = squash((row.brandEntities ?? []).join(' ') + ' ' + (row.answerExcerpt ?? ''));
  return brandToks.some(t => { const q = squash(t); return q.length >= 3 && hay.includes(q); });
}

export function buildBrandTokens(clientDomain: string, brandTerms: string[] = []): string[] {
  const toks = new Set<string>();
  const b = extractBrand(clientDomain); if (b) toks.add(b.toLowerCase());
  for (const t of brandTerms) if (t && t.trim()) toks.add(t.toLowerCase().trim());
  return Array.from(toks);
}

/**
 * v7.434 — the mention matcher UNDER-COUNTED (Wayne, live on Amex Travel Cards).
 * `extractBrand('americanexpress.com')` yields the run-together token
 * "americanexpress", so an answer writing the brand the way humans do —
 * "American Express" — never matched: 16 answers cited the site while 27 named
 * the brand, and only the citations were counted. The fix is to compare on a
 * PUNCTUATION- AND SPACE-STRIPPED haystack, so "American Express", "american-express"
 * and "AmericanExpress" all reduce to the same run of letters as the token.
 * Nothing is inferred: a token still has to literally occur in the text.
 */
export const squash = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Does the recorded answer's TEXT (or extracted brand entities) name the client? */
export function rowNamesBrand(row: StoredMentionRow, brandToks: string[]): boolean {
  const hay = squash((row.brandEntities ?? []).join(' ') + ' ' + (row.answerExcerpt ?? ''));
  return brandToks.some(t => { const q = squash(t); return q.length >= 3 && hay.includes(q); });
}

/** Does the answer CITE the client — an owned URL in sources or retrieved search results? */
export function rowCitesClient(row: StoredMentionRow, clientNorm: string): boolean {
  if ((row.sources ?? []).some(s => normSovDomain(s.domain) === clientNorm)) return true;
  return (row.searchResultDomains ?? []).some(d => normSovDomain(d) === clientNorm);
}

export type PromptBucket = 'cited' | 'named' | 'absent';

/** cited > named > absent — the three states a recorded answer can be in for this client. */
export function promptBucket(row: StoredMentionRow, clientNorm: string, brandToks: string[]): PromptBucket {
  if (rowCitesClient(row, clientNorm)) return 'cited';
  if (rowNamesBrand(row, brandToks)) return 'named';
  return 'absent';
}

export interface PromptRow {
  question:  string;
  platform:  string;
  bucket:    PromptBucket;
  /** Owned URL paths this answer cited (cited rows only). */
  ownedUrls: string[];
  /** Who else the answer cited, in order. */
  cites:     string[];
}

export interface PromptBreakdown {
  rows:   PromptRow[];
  counts: { cited: number; named: number; absent: number; total: number };
  /** Owned URL → the prompts whose answers cite it, most-cited first. */
  byUrl:  Array<{ url: string; prompts: string[] }>;
}

/**
 * Classify every recorded answer on a node and roll the citations up per owned URL.
 * Pure — reads only the stored rows (Const I.1); both the panel and any export read
 * THIS function so a prompt can never be bucketed two ways (II.7).
 */
export function buildPromptBreakdown(scan: StoredCatScan | null, clientDomain: string, brandTerms: string[] = []): PromptBreakdown | null {
  if (!scan || !Array.isArray(scan.rows) || scan.rows.length === 0) return null;
  const clientNorm = normSovDomain(clientDomain);
  const brandToks  = buildBrandTokens(clientDomain, brandTerms);
  const urlMap = new Map<string, string[]>();
  const rows: PromptRow[] = scan.rows.map(r => {
    const bucket = promptBucket(r, clientNorm, brandToks);
    const ownedUrls: string[] = [];
    for (const s of (r.sources ?? [])) {
      if (normSovDomain(s.domain) !== clientNorm) continue;
      const path = String(s.url ?? '').replace(/^https?:\/\/[^/]*/, '').split('#')[0] || '/';
      if (!ownedUrls.includes(path)) ownedUrls.push(path);
      const list = urlMap.get(path); if (list) { if (!list.includes(r.question)) list.push(r.question); } else urlMap.set(path, [r.question]);
    }
    return {
      question: r.question, platform: r.platform, bucket, ownedUrls,
      cites: Array.from(new Set((r.sources ?? []).map(s => normSovDomain(s.domain)).filter(Boolean))),
    };
  });
  const counts = { cited: 0, named: 0, absent: 0, total: rows.length };
  for (const r of rows) counts[r.bucket]++;
  const order: Record<PromptBucket, number> = { cited: 0, named: 1, absent: 2 };
  rows.sort((a, b) => order[a.bucket] - order[b.bucket] || a.question.localeCompare(b.question));
  const byUrl = Array.from(urlMap.entries())
    .map(([url, prompts]) => ({ url, prompts }))
    .sort((a, b) => b.prompts.length - a.prompts.length);
  return { rows, counts, byUrl };
}

/**
 * category name → its ROOT (umbrella) name, walked through the STORED
 * parent chain (`_categoryBreakdown.categories[].parent`, Const II.8/III.1b).
 * A category with no stored entry maps to itself. Cycle-guarded.
 */
export function buildCategoryToUmbrella(breakdown: any): Map<string, string> {
  const cats: any[] = Array.isArray(breakdown?.categories) ? breakdown.categories : [];
  const parentOf = new Map<string, string>();
  const canonical = new Map<string, string>();   // normName → display name
  for (const c of cats) {
    const name = String(c?.name ?? '').trim();
    if (!name) continue;
    canonical.set(normName(name), name);
    const parent = String(c?.parent ?? '').trim();
    if (parent && normName(parent) !== normName(name)) parentOf.set(normName(name), normName(parent));
  }
  const out = new Map<string, string>();
  canonical.forEach((disp, key) => {
    let cur = key;
    const seen = new Set<string>([cur]);
    while (parentOf.has(cur)) {
      const next = parentOf.get(cur)!;
      if (seen.has(next)) break;   // cycle guard — stop at the last sane node
      seen.add(next); cur = next;
    }
    out.set(key, canonical.get(cur) ?? disp);
  });
  return out;
}

/** Stored category names whose type is 'brand' (the client brand lane). */
export function brandTypedCategoryNames(breakdown: any): Set<string> {
  const out = new Set<string>();
  for (const c of (Array.isArray(breakdown?.categories) ? breakdown.categories : [])) {
    if (String(c?.type ?? '') === 'brand' && c?.name) out.add(normName(String(c.name)));
  }
  return out;
}

/**
 * v7.431: brand-typed names that are BRAND-ONLY — i.e. not also the parent of any
 * non-brand category. Real data (U.S. Bank) carries a FLAT brand-lane category
 * literally named "Credit Cards" alongside the product umbrella "Credit Cards"
 * that parents 12 procedure sub-categories; excluding by name alone erased the
 * whole product line from the panel and the PDF. A name that parents genuine
 * product children is a product umbrella sharing its name with the brand lane —
 * it stays. Pure brand lanes ("Brand Searches", "Amazon Brand Searches") have no
 * product children and are excluded. Stored data only, never lexical (II.8).
 */
export function brandOnlyUmbrellaNames(breakdown: any): Set<string> {
  const cats: any[] = Array.isArray(breakdown?.categories) ? breakdown.categories : [];
  const brand = brandTypedCategoryNames(breakdown);
  for (const c of cats) {
    const parent = normName(String(c?.parent ?? ''));
    const name = normName(String(c?.name ?? ''));
    if (parent && brand.has(parent) && String(c?.type ?? '') !== 'brand' && name !== parent) brand.delete(parent);
  }
  return brand;
}

/** Probe results whose category rolls up to `umbrella` (unbranded only when asked). */
export function probeResultsForUmbrella(
  llmProbe: any, umbrella: string, catToUmb: Map<string, string>, unbrandedOnly = true,
): any[] {
  const res: any[] = Array.isArray(llmProbe?.results) ? llmProbe.results : [];
  const uNorm = normName(umbrella);
  return res.filter((r: any) => {
    if (unbrandedOnly && r?.branded) return false;
    const cat = normName(String(r?.category ?? ''));
    if (!cat) return false;
    const root = catToUmb.get(cat);
    return (root ? normName(root) : cat) === uNorm;
  });
}

export interface BuildProductRowsOpts {
  topics:          Topic[];
  uploadedKeywords: any[];                 // project_keywords rows (source!=='blocked' honoured here)
  serpPositions:   Record<string, Array<{ keyword: string; position: number }>>;
  llmProbe:        any;                    // LLMProbeSnapshotV2 | null
  storedScans:     StoredCatScan[];        // projects.product_insights categories
  clientDomain:    string;
  brandTerms?:     string[];
  breakdown?:      any;                    // semrushSnapshot._categoryBreakdown (for umbrella map + brand types)
}

export function buildProductRows(opts: BuildProductRowsOpts): { products: ProductRow[]; kpi: ProductKpi } {
  const { topics, uploadedKeywords, serpPositions, llmProbe, storedScans, clientDomain, brandTerms = [], breakdown } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const brandToks  = buildBrandTokens(clientDomain, brandTerms);
  const catToUmb   = buildCategoryToUmbrella(breakdown);
  const brandCats  = brandOnlyUmbrellaNames(breakdown);   // v7.431: brand-ONLY lanes; a product umbrella sharing the brand lane's name stays

  // ── per-keyword brand rank maps — v7.419 ladder method verbatim ──
  const perKw   = new Map<string, Map<string, number>>();
  const tracked = new Set<string>();
  for (const r of (uploadedKeywords ?? [])) {
    if (r?.source === 'blocked') continue;
    const dom = normSovDomain(r?.domain ?? '');
    if (!dom || dom === clientNorm) continue;
    const p = r?.position;
    if (p == null || p < 1) continue;
    tracked.add(dom);
    const k = String(r?.keyword ?? '').toLowerCase().trim();
    if (!k) continue;
    let m = perKw.get(k); if (!m) { m = new Map(); perKw.set(k, m); }
    const prev = m.get(dom);
    if (prev === undefined || p < prev) m.set(dom, p);
  }
  for (const [rawDom, positions] of Object.entries(serpPositions ?? {})) {
    const dom = normSovDomain(rawDom);
    if (!dom || dom === clientNorm || tracked.has(dom)) continue;
    for (const pos of (positions ?? [])) {
      const p = pos?.position;
      if (p == null || p < 1) continue;
      const k = String(pos?.keyword ?? '').toLowerCase().trim();
      if (!k) continue;
      let m = perKw.get(k); if (!m) { m = new Map(); perKw.set(k, m); }
      const prev = m.get(dom);
      if (prev === undefined || p < prev) m.set(dom, p);
    }
  }

  // ── probe stats aggregated to the umbrella (v7.427 fix 1) ──
  const probeByUmb = new Map<string, { cm: number; ct: number; gm: number; gt: number }>();
  for (const c of ((llmProbe as any)?.categories ?? [])) {
    const cat = normName(String(c?.category ?? ''));
    if (!cat) continue;
    const umb = normName(catToUmb.get(cat) ?? String(c?.category ?? ''));
    let e = probeByUmb.get(umb); if (!e) { e = { cm: 0, ct: 0, gm: 0, gt: 0 }; probeByUmb.set(umb, e); }
    e.cm += c?.claudeMentions ?? 0; e.ct += c?.claudeTotal ?? 0;
    e.gm += c?.chatgptMentions ?? 0; e.gt += c?.chatgptTotal ?? 0;
  }

  const scanByCat = new Map<string, StoredCatScan>();
  for (const s of (storedScans ?? [])) if (s?.category) scanByCat.set(normName(s.category), s);

  // ── umbrella grouping (brand/location/Other + brand-typed umbrellas excluded) ──
  const byUmbrella = new Map<string, Topic[]>();
  for (const t of topics) {
    if (t.parentType === 'brand' || t.parentType === 'location') continue;
    const u = (t.umbrella || t.parentName || '').trim();
    if (!u || normName(u) === 'other') continue;
    if (brandCats.has(normName(u))) continue;   // v7.427 fix 2 — stored type 'brand'
    const arr = byUmbrella.get(u); if (arr) arr.push(t); else byUmbrella.set(u, [t]);
  }

  const products: ProductRow[] = [];
  byUmbrella.forEach((uts, name) => {
    const bands: [number, number, number, number] = [0, 0, 0, 0];
    let demand = 0, kwCount = 0;
    const seen = new Set<string>();
    const byDom = new Map<string, { p1Vol: number; p1Kw: number; measuredKw: number }>();
    let clientP1Vol = 0, clientP1Kw = 0;
    for (const t of uts) for (const k of t.keywords) {
      const kwLow = k.keyword.toLowerCase().trim();
      if (seen.has(kwLow)) continue;
      seen.add(kwLow);
      kwCount++;
      const v = k.searchVolume || 0;
      demand += v;
      const p = k.position;
      if (p !== null && p >= 1 && p <= 3)        bands[0] += v;
      else if (p !== null && p >= 4 && p <= 10)  bands[1] += v;
      else if (p !== null && p >= 11 && p <= 20) bands[2] += v;
      else bands[3] += v;
      if (p !== null && p >= 1 && p <= 10) { clientP1Vol += v; clientP1Kw++; }
      const m = perKw.get(kwLow);
      if (m) m.forEach((bp, dom) => {
        let e = byDom.get(dom); if (!e) { e = { p1Vol: 0, p1Kw: 0, measuredKw: 0 }; byDom.set(dom, e); }
        e.measuredKw++;
        if (bp >= 1 && bp <= 10) { e.p1Vol += v; e.p1Kw++; }
      });
    }
    const ladder: LadderEntry[] = [];
    if (clientP1Vol > 0) ladder.push({ domain: clientNorm || 'client', kind: 'client', p1Vol: clientP1Vol, p1Kw: clientP1Kw, measuredKw: kwCount });
    byDom.forEach((e, dom) => {
      if (e.p1Vol <= 0) return;   // no page-1 hold → no entry (honest gap, I.5)
      ladder.push({ domain: dom, kind: tracked.has(dom) ? 'tracked' : 'rival', p1Vol: e.p1Vol, p1Kw: e.p1Kw, measuredKw: e.measuredKw });
    });
    ladder.sort((a, b) => b.p1Vol - a.p1Vol);
    const clientIdx = ladder.findIndex(e => e.kind === 'client');

    const pe = probeByUmb.get(normName(name)) ?? null;
    const probe = pe && (pe.ct + pe.gt) > 0
      ? { mentions: pe.cm + pe.gm, total: pe.ct + pe.gt, claude: `${pe.cm}/${pe.ct}`, gpt: `${pe.gm}/${pe.gt}` }
      : null;
    const scan  = scanByCat.get(normName(name)) ?? null;
    const aiRate = probe && probe.total > 0 ? probe.mentions / probe.total : null;
    let dfsShare: number | null = null;
    let citedTop: ProductRow['citedTop'] = [];
    if (scan && scan.rows.length > 0) {
      const named = scan.rows.filter(r => rowNamesClient(r, clientNorm, brandToks)).length;
      dfsShare = named / scan.rows.length;
      const counts = new Map<string, number>();
      for (const r of scan.rows) for (const s of r.sources) {
        const d = normSovDomain(s.domain); if (!d) continue;
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      citedTop = Array.from(counts.entries())
        .map(([d, c]) => ({ domain: d, count: c, isClient: d === clientNorm }))
        .sort((a, b) => b.count - a.count);
    }

    const verdicts = { arb: 0, dual: 0, aiOnly: 0, none: 0 };
    for (const t of uts) {
      const best = t.keywords.reduce<number | null>((acc, k) =>
        k.position !== null && k.position >= 1 && (acc === null || k.position < acc) ? k.position : acc, null);
      const v = topicVerdict(best, aiRate, dfsShare);
      if (v !== 'noAiData') verdicts[v]++;
    }

    products.push({
      name, topics: uts, kwCount, demand, bands,
      p1Share: demand > 0 ? (bands[0] + bands[1]) / demand : 0,
      ladder, clientRank: clientIdx >= 0 ? clientIdx + 1 : null,
      probe, scan, aiRate, dfsShare, citedTop,
      arbTopics: verdicts.arb, verdicts,
    });
  });
  products.sort((a, b) => b.demand - a.demand);

  const kpi: ProductKpi = { arb: 0, dual: 0, aiOnly: 0, none: 0, citesClient: 0, citesTotal: 0 };
  for (const p of products) {
    kpi.arb += p.verdicts.arb; kpi.dual += p.verdicts.dual;
    kpi.aiOnly += p.verdicts.aiOnly; kpi.none += p.verdicts.none;
    for (const c of p.citedTop) { kpi.citesTotal += c.count; if (c.isClient) kpi.citesClient += c.count; }
  }
  return { products, kpi };
}

// ─── The one topic-row builder (v7.429) ──────────────────────────────────────
// The crosswalk and the KPI drill-down MUST show the same rows in the same order,
// so both read this function — a second inline derivation is how two views of one
// number drift apart (Const II.6a / II.7).

export interface TopicRow { t: Topic; best: { pos: number | null; url?: string }; v: TopicVerdict }

export function buildTopicRows(p: { topics: Topic[]; aiRate: number | null; dfsShare: number | null }): TopicRow[] {
  const rows: TopicRow[] = p.topics.map(t => {
    const best = t.keywords.reduce<{ pos: number | null; url?: string }>((acc, k: any) => {
      if (k.position !== null && k.position >= 1 && (acc.pos === null || k.position < acc.pos)) return { pos: k.position, url: k.url };
      return acc;
    }, { pos: null });
    return { t, best, v: topicVerdict(best.pos, p.aiRate, p.dfsShare) };
  });
  const order: Record<TopicVerdict, number> = { arb: 0, aiOnly: 1, none: 2, dual: 3, noAiData: 4 };
  rows.sort((a, b) => (order[a.v] - order[b.v]) || (b.t.totalVolume - a.t.totalVolume));
  return rows;
}


// ─── v7.432: unlimited-depth sub-category tree (Wayne 2026-08-12) ───────────
// "I see the data for the parent level of the category but how about at the sub
// category level, such as travel cards. I cant get any insights at that product
// level."
//
// The stored taxonomy is deeper than the product line (real Amex data:
// Credit Cards › Card Types › Travel Cards › Rewards). Every node here is built
// from the STORED path (`_categoryBreakdown.keywordPaths`, Const II.8/III.1b) —
// never re-derived from keyword text — and carries the SAME measured metric set
// the product row does, computed over that node's own keywords (its own +
// descendants', deduped so volume is never double-counted, I.3).
//
// AI is NOT inherited downward. A node shows an AI figure only when a
// recorded-answer scan exists for THAT node (scans are keyed by node path);
// otherwise `scan` is null and every render site must say so (I.5) rather than
// borrowing the parent's rate — a parent-level number displayed on a child is a
// different metric wearing the child's label.

export interface CatNode {
  /** ' › ' joined stored path — the stable id and the scan key. */
  key:        string;
  name:       string;
  depth:      number;
  path:       string[];
  children:   CatNode[];
  kwCount:    number;                                    // own + descendants (deduped)
  demand:     number;                                    // exact rollup (I.1)
  bands:      [number, number, number, number];
  p1Share:    number;
  ladder:     LadderEntry[];
  clientRank: number | null;
  scan:       StoredCatScan | null;                      // ONLY this node's own scan
  dfsShare:   number | null;
  citedTop:   Array<{ domain: string; count: number; isClient: boolean }>;
  /** Best measured client position across the node's keywords (null = unranked). */
  bestPos:    number | null;
  /** Client's best ranking URL among the node's keywords, when the source rows carry one. */
  bestUrl?:   string;
  // v7.433 (Wayne): the keywords BEHIND the number, so a level can be inspected without
  // leaving the panel. `kws` = the keywords filed at THIS node (its own, most-specific
  // placement, III.6) — descendants keep theirs, so nothing is double-listed (I.3).
  // `allKws` = own + descendants, the exact set every metric on this node was computed
  // from, so the row and its keyword list can never disagree. Both sorted by volume desc.
  kws:        NodeKw[];
  allKws:     NodeKw[];
}

export interface NodeKw { keyword: string; searchVolume: number; position: number | null; url?: string }

export interface BuildCategoryTreeOpts {
  breakdown:        any;              // semrushSnapshot._categoryBreakdown (keywordPaths + categories)
  poolKeywords:     Array<{ keyword: string; searchVolume: number; position: number | null; url?: string }>;
  uploadedKeywords: any[];
  serpPositions:    Record<string, Array<{ keyword: string; position: number }>>;
  storedScans:      StoredCatScan[];  // keyed by node key (' › ' path) OR legacy top-level name
  clientDomain:     string;
  brandTerms?:      string[];
}

/**
 * Build the full stored-path tree under `rootName` (a product line), with every
 * node carrying its own measured metrics. Returns null when the analysis has no
 * stored paths for that root (honest gap — the caller renders the flat topic
 * list it already has, never a fabricated tree).
 */
export function buildCategoryTree(rootName: string, opts: BuildCategoryTreeOpts): CatNode | null {
  const { breakdown, poolKeywords, uploadedKeywords, serpPositions, storedScans, clientDomain, brandTerms = [] } = opts;
  const rawPaths: Record<string, any> = breakdown?.keywordPaths ?? {};
  if (!rawPaths || Object.keys(rawPaths).length === 0) return null;

  const clientNorm = normSovDomain(clientDomain);
  const brandToks  = buildBrandTokens(clientDomain, brandTerms);
  const rootNorm   = normName(rootName);

  // keyword → its measured row (one row per keyword — the canonical pool already deduped)
  const kwRow = new Map<string, NodeKw>();
  for (const k of poolKeywords) {
    const key = String(k?.keyword ?? '').toLowerCase().trim();
    if (!key || kwRow.has(key)) continue;
    kwRow.set(key, { keyword: key, searchVolume: k.searchVolume || 0, position: k.position ?? null, url: (k as any).url });
  }

  // competitor rank map (same two sources as the ladder — v7.419 basis)
  const perKw   = new Map<string, Map<string, number>>();
  const tracked = new Set<string>();
  for (const r of (uploadedKeywords ?? [])) {
    if (r?.source === 'blocked') continue;
    const dom = normSovDomain(r?.domain ?? '');
    if (!dom || dom === clientNorm) continue;
    const p = r?.position;
    if (p == null || p < 1) continue;
    tracked.add(dom);
    const k = String(r?.keyword ?? '').toLowerCase().trim();
    if (!k) continue;
    let m = perKw.get(k); if (!m) { m = new Map(); perKw.set(k, m); }
    const prev = m.get(dom);
    if (prev === undefined || p < prev) m.set(dom, p);
  }
  for (const [rawDom, positions] of Object.entries(serpPositions ?? {})) {
    const dom = normSovDomain(rawDom);
    if (!dom || dom === clientNorm || tracked.has(dom)) continue;
    for (const pos of (positions ?? [])) {
      const p = pos?.position;
      if (p == null || p < 1) continue;
      const k = String(pos?.keyword ?? '').toLowerCase().trim();
      if (!k) continue;
      let m = perKw.get(k); if (!m) { m = new Map(); perKw.set(k, m); }
      const prev = m.get(dom);
      if (prev === undefined || p < prev) m.set(dom, p);
    }
  }

  const scanByKey = new Map<string, StoredCatScan>();
  for (const s of (storedScans ?? [])) if (s?.category) scanByKey.set(normName(s.category), s);

  // ── assemble the raw tree from stored paths ──
  interface Raw { name: string; path: string[]; kws: NodeKw[]; children: Map<string, Raw> }
  const root: Raw = { name: rootName, path: [rootName], kws: [], children: new Map() };
  for (const [kwRaw, pathRaw] of Object.entries(rawPaths)) {
    if (!Array.isArray(pathRaw) || pathRaw.length === 0) continue;
    const path = pathRaw.map((x: any) => String(x ?? '').trim()).filter(Boolean);
    if (path.length === 0 || normName(path[0]) !== rootNorm) continue;
    const row = kwRow.get(String(kwRaw).toLowerCase().trim());
    if (!row) continue;                       // not in the canonical pool (hidden/blocked/out of scope) — skip
    let cur = root;
    for (let i = 1; i < path.length; i++) {
      const seg = path[i];
      const kk = normName(seg);
      let next = cur.children.get(kk);
      if (!next) { next = { name: seg, path: path.slice(0, i + 1), kws: [], children: new Map() }; cur.children.set(kk, next); }
      cur = next;
    }
    cur.kws.push(row);                        // a keyword sits at its MOST SPECIFIC node (III.6)
  }

  // ── fold each raw node into a measured CatNode (post-order: children first) ──
  const fold = (raw: Raw, depth: number): CatNode => {
    const children = Array.from(raw.children.values()).map(c => fold(c, depth + 1));
    const seen = new Set<string>();
    const all: NodeKw[] = [];
    const collect = (r: Raw) => { for (const k of r.kws) { if (!seen.has(k.keyword)) { seen.add(k.keyword); all.push(k); } } r.children.forEach(collect); };
    collect(raw);

    const bands: [number, number, number, number] = [0, 0, 0, 0];
    let demand = 0, clientP1Vol = 0, clientP1Kw = 0;
    let bestPos: number | null = null; let bestUrl: string | undefined;
    const byDom = new Map<string, { p1Vol: number; p1Kw: number; measuredKw: number }>();
    for (const k of all) {
      const v = k.searchVolume || 0;
      demand += v;
      const p = k.position;
      if (p !== null && p >= 1 && p <= 3)        bands[0] += v;
      else if (p !== null && p >= 4 && p <= 10)  bands[1] += v;
      else if (p !== null && p >= 11 && p <= 20) bands[2] += v;
      else bands[3] += v;
      if (p !== null && p >= 1 && p <= 10) { clientP1Vol += v; clientP1Kw++; }
      if (p !== null && p >= 1 && (bestPos === null || p < bestPos)) { bestPos = p; bestUrl = k.url; }
      const m = perKw.get(k.keyword);
      if (m) m.forEach((bp, dom) => {
        let e = byDom.get(dom); if (!e) { e = { p1Vol: 0, p1Kw: 0, measuredKw: 0 }; byDom.set(dom, e); }
        e.measuredKw++;
        if (bp >= 1 && bp <= 10) { e.p1Vol += v; e.p1Kw++; }
      });
    }
    const ladder: LadderEntry[] = [];
    if (clientP1Vol > 0) ladder.push({ domain: clientNorm || 'client', kind: 'client', p1Vol: clientP1Vol, p1Kw: clientP1Kw, measuredKw: all.length });
    byDom.forEach((e, dom) => {
      if (e.p1Vol <= 0) return;               // no page-1 hold → no entry (I.5)
      ladder.push({ domain: dom, kind: tracked.has(dom) ? 'tracked' : 'rival', p1Vol: e.p1Vol, p1Kw: e.p1Kw, measuredKw: e.measuredKw });
    });
    ladder.sort((a, b) => b.p1Vol - a.p1Vol);
    const clientIdx = ladder.findIndex(e => e.kind === 'client');

    const key = raw.path.join(' › ');
    // Scans are keyed by the node key; the top-level node also honours the legacy
    // name-keyed scans written before v7.432 (no re-scan needed, I.5).
    const scan = scanByKey.get(normName(key)) ?? (depth === 0 ? (scanByKey.get(rootNorm) ?? null) : null);
    let dfsShare: number | null = null;
    let citedTop: CatNode['citedTop'] = [];
    if (scan && scan.rows.length > 0) {
      const named = scan.rows.filter(r => rowNamesClient(r, clientNorm, brandToks)).length;
      dfsShare = named / scan.rows.length;
      const counts = new Map<string, number>();
      for (const r of scan.rows) for (const sc of r.sources) {
        const dd = normSovDomain(sc.domain); if (!dd) continue;
        counts.set(dd, (counts.get(dd) ?? 0) + 1);
      }
      citedTop = Array.from(counts.entries())
        .map(([dd, c]) => ({ domain: dd, count: c, isClient: dd === clientNorm }))
        .sort((a, b) => b.count - a.count);
    }

    children.sort((a, b) => b.demand - a.demand);
    const byVol = (a: NodeKw, b: NodeKw) => b.searchVolume - a.searchVolume;
    return {
      key, name: raw.name, depth, path: raw.path, children,
      kwCount: all.length, demand, bands,
      p1Share: demand > 0 ? (bands[0] + bands[1]) / demand : 0,
      ladder, clientRank: clientIdx >= 0 ? clientIdx + 1 : null,
      scan, dfsShare, citedTop, bestPos, bestUrl,
      kws: raw.kws.slice().sort(byVol),
      allKws: all.slice().sort(byVol),
    };
  };

  const tree = fold(root, 0);
  return tree.kwCount > 0 ? tree : null;
}

/** Flatten a node's subtree (excluding itself) — used by exports and the PDF. */
export function flattenNodes(node: CatNode): CatNode[] {
  const out: CatNode[] = [];
  const walk = (n: CatNode) => { for (const c of n.children) { out.push(c); walk(c); } };
  walk(node);
  return out;
}
