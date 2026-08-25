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
import { qualifySeed } from '@/lib/category/seedQualify';   // v7.444

export interface StoredMentionSource { domain: string; url: string; title: string }
export interface StoredMentionRow {
  platform: string; modelName: string; question: string; answerExcerpt: string;
  sources: StoredMentionSource[];
  searchResultDomains: string[]; brandEntities: string[];
  aiSearchVolume: number | null; webSearchBased: boolean | null; lastResponseAt: string | null;
}
export interface StoredScanPlatform {
  platform:   string;
  /** Total matches in the index for this platform; null = that request failed. */
  totalCount: number | null;
  /** Rows actually fetched for this platform; null = request failed, 0 = genuinely none. */
  fetched:    number | null;
  costUSD:    number;
}

export interface StoredCatScan {
  category: string; query: string; scannedAt: string; totalCount: number;
  fetched: number; costUSD: number; provider: string; rows: StoredMentionRow[];
  /** v7.444: measured wall-clock ms for this node's scan. Absent on pre-v7.444 scans —
   *  those carry no timing, so they simply do not contribute to a time projection. */
  durationMs?: number;
  /** v7.435: per-platform provenance. Absent on scans stored before v7.435 — those
   *  were a single unfiltered request, so the mix is derived from the rows and the
   *  UI says the platform split is "as returned" rather than per-platform measured. */
  platforms?: StoredScanPlatform[];
}

export const PLATFORM_LABEL: Record<string, string> = { google: 'AI Overview', chat_gpt: 'ChatGPT' };

export interface PlatformMix {
  platform: string;
  label:    string;
  rows:     number;          // rows on file for this platform
  cited:    number;          // …that cite an owned URL
  named:    number;          // …that name the brand without linking
  total:    number | null;   // matches in the index (null = unknown / pre-v7.435)
  measured: boolean;         // did THIS platform get its own request?
  failed:   boolean;         // its request errored — unmeasured, not zero (I.5)
}

/**
 * v7.435 — the platform split, per node. Counts come from the stored rows; whether a
 * platform was actually REQUESTED comes from `scan.platforms`, so "0 ChatGPT rows"
 * can be told apart from "ChatGPT was never asked" (Const I.5 — absence is not zero).
 */
export function buildPlatformMix(scan: StoredCatScan | null, clientDomain: string, brandTerms: string[] = []): PlatformMix[] {
  if (!scan) return [];
  const clientNorm = normSovDomain(clientDomain);
  const brandToks  = buildBrandTokens(clientDomain, brandTerms);
  const keys = new Set<string>([
    ...(scan.platforms ?? []).map(p => p.platform),
    ...scan.rows.map(r => r.platform).filter(Boolean),
  ]);
  return Array.from(keys).map(pf => {
    const rows = scan.rows.filter(r => r.platform === pf);
    const meta = (scan.platforms ?? []).find(p => p.platform === pf) ?? null;
    let cited = 0, named = 0;
    for (const r of rows) {
      const b = promptBucket(r, clientNorm, brandToks);
      if (b === 'cited') cited++; else if (b === 'named') named++;
    }
    return {
      platform: pf, label: PLATFORM_LABEL[pf] ?? pf, rows: rows.length, cited, named,
      total: meta ? meta.totalCount : null,
      measured: !!meta,
      failed: !!meta && meta.fetched === null,
    };
  }).sort((a, b) => b.rows - a.rows);
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

/**
 * v7.472: resolve the LLM probe snapshot from an analysis row. The probe is
 * STORED in analyses.profoundSnapshot (source 'llm_probe_v2' — see
 * lib/apis/llmProbe.ts); every Product Insights reader was asking for
 * analysis.llmProbe, a field the row never carries, so the prompt drawer showed
 * "No probe prompts for this category" for every category since v7.426 no matter
 * how fresh the scan. One resolver (Const II.7) so the panel, the Assessment PDF
 * and Seer can never drift on where the probe lives again.
 */
export function probeFromAnalysis(analysis: any): any {
  return (analysis as any)?.llmProbe ?? (analysis as any)?.profoundSnapshot ?? null;
}

/**
 * v7.474: unbranded probe results filed at any of the given node names (a node
 * and its descendants). Direct sub-categories carry their own prompts from this
 * release on; deeper nodes inherit nothing — an empty return is an honest
 * "not probed at this level" (Const I.5), never a rollup from the line.
 */
export function probeResultsForNode(llmProbe: any, nodeNames: string[]): any[] {
  const set = new Set(nodeNames.map(n => normName(String(n ?? ''))));
  const res: any[] = Array.isArray(llmProbe?.results) ? llmProbe.results : [];
  return res.filter((r: any) => !r?.branded && set.has(normName(String(r?.category ?? ''))));
}

/** v7.474: a CatNode's own name plus every descendant name (for probeResultsForNode). */
export function catNodeNames(node: { name: string; children: any[] }): string[] {
  const out: string[] = [];
  const walk = (n: { name: string; children: any[] }) => {
    out.push(n.name);
    for (const c of (n.children ?? [])) walk(c);
  };
  walk(node);
  return out;
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

export interface NodeKw {
  keyword: string; searchVolume: number; position: number | null; url?: string;
  // v7.435: provenance carried verbatim from the SAME canonical pool the Keyword list
  // panel renders (buildKwPool -> buildCanonicalClusterTopics). Nothing here is derived:
  // `origin:'demand'` = surfaced by the deep-journey demand build (no client ranking row
  // exists for it), `isGap` = a competitor-held keyword the client's export does not rank.
  // Without these, a null position reads as one undifferentiated "unranked" (Const I.5).
  origin?: 'footprint' | 'demand'; isGap?: boolean;
}

export interface BuildCategoryTreeOpts {
  breakdown:        any;              // semrushSnapshot._categoryBreakdown (keywordPaths + categories)
  poolKeywords:     Array<{ keyword: string; searchVolume: number; position: number | null; url?: string;
                            origin?: 'footprint' | 'demand'; isGap?: boolean }>;
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
    // v7.437: carry the pool row's provenance through. v7.435 rebuilt this object with four
    // fields and silently dropped `origin`/`isGap`, so every keyword rendered as a bare
    // "unranked" with no reason — the exact ambiguity v7.435 set out to remove.
    kwRow.set(key, { keyword: key, searchVolume: k.searchVolume || 0, position: k.position ?? null, url: (k as any).url,
                     origin: (k as any).origin === 'demand' ? 'demand' : 'footprint', isGap: !!(k as any).isGap });
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

// ─── v7.444: cascade scan planning ───────────────────────────────────────────
// Wayne: "at whatever level you select it should automatically include all the
// child levels below". Scanning a node now means scanning its whole subtree.
//
// Two rules make that safe rather than expensive noise:
//
//  1. THE QUERY IS QUALIFIED, NEVER THE BARE NODE NAME. A deep leaf is named for
//     its position in the tree, not for the world: "Requirements", "No Annual
//     Fee", "Card Types". Sent alone to the recorded-answer index those match
//     answers about anything — the exact contamination v7.440 fixed in Step 3
//     ("Card Types" returned deck-of-cards, "Education" returned mcgraw hill).
//     Every target is qualified through the SAME `qualifySeed` helper that fix
//     introduced (Const II.7), so "No Annual Fee" under "Business Credit Cards"
//     is queried as "business credit cards no annual fee".
//  2. ALREADY-SCANNED NODES ARE SKIPPED by default (Wayne, 2026-08-13), so a
//     cascade is incremental and a stopped run resumes where it left off without
//     re-spending on nodes already on file (Const I.5b — never re-buy stored data).
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanTarget {
  /** stored scan key — the node's ' › ' joined path. */
  key:     string;
  name:    string;
  depth:   number;
  /** the QUALIFIED query term actually sent to the index (never the bare name). */
  query:   string;
  /** does this node already carry a stored scan? */
  scanned: boolean;
}

/** The qualified query term for one node — exported so the UI can show it before spending. */
export function scanQueryFor(node: Pick<CatNode, 'name' | 'path'>): string {
  const umbrella = (node.path && node.path.length > 0) ? node.path[0] : '';
  return qualifySeed(node.name, umbrella) || String(node.name ?? '').toLowerCase().trim();
}

/**
 * Every node in this subtree — the node itself plus ALL descendants at every depth —
 * as scan targets, in breadth-first order so the shallowest (most valuable) nodes are
 * scanned first if the run is stopped early.
 */
export function buildScanPlan(
  root: CatNode,
  storedScans: StoredCatScan[] = [],
  opts: { skipScanned?: boolean } = {},
): ScanTarget[] {
  const done = new Set((storedScans ?? []).filter(s => s?.category).map(s => normName(s.category)));
  const all: CatNode[] = [root, ...flattenNodes(root)];
  all.sort((a, b) => a.depth - b.depth);
  const seen = new Set<string>();
  const out: ScanTarget[] = [];
  for (const n of all) {
    if (!n?.key || seen.has(n.key)) continue;
    seen.add(n.key);
    const scanned = done.has(normName(n.key));
    if (opts.skipScanned !== false && scanned) continue;
    out.push({ key: n.key, name: n.name, depth: n.depth, query: scanQueryFor(n), scanned });
  }
  return out;
}

/**
 * Projected cost of scanning N nodes, derived from THIS project's own measured scan
 * costs (Const I.1 — the average of real per-task costs DataForSEO reported and the
 * ledger stored). Returns null when the project has no measured history: a projection
 * with nothing to project FROM would be a modeled number presented as a quote (I.5a),
 * so the UI says the cost is measured per scan and reported afterwards instead.
 */
/**
 * Projected wall-clock time for N nodes, from THIS project's measured scan durations
 * (v7.444). Same discipline as projectedScanCost: null when nothing has been timed yet,
 * because a duration with no measurement behind it would be a made-up number (I.1/I.5a).
 * Nodes run sequentially, so the projection is simply avg x N.
 */
export function projectedScanTime(
  storedScans: StoredCatScan[],
  nodes: number,
): { seconds: number; avgSeconds: number; basedOn: number } | null {
  const timed = (storedScans ?? []).filter(s => typeof s?.durationMs === 'number' && (s.durationMs as number) > 0);
  if (timed.length === 0 || nodes <= 0) return null;
  const avgMs = timed.reduce((n, s) => n + (s.durationMs as number), 0) / timed.length;
  return { seconds: (avgMs / 1000) * nodes, avgSeconds: avgMs / 1000, basedOn: timed.length };
}

export function projectedScanCost(
  storedScans: StoredCatScan[],
  nodes: number,
): { usd: number; avgUsd: number; basedOn: number } | null {
  const priced = (storedScans ?? []).filter(s => typeof s?.costUSD === 'number' && s.costUSD > 0);
  if (priced.length === 0 || nodes <= 0) return null;
  const avg = priced.reduce((n, s) => n + s.costUSD, 0) / priced.length;
  return { usd: avg * nodes, avgUsd: avg, basedOn: priced.length };
}


// ─── v7.449: Content Footprint by Brand (Wayne, 2026-08-14) ──────────────────
// "I want to know how much content each brand has published in each product
// line … what the client has and what each competitor has for every product
// and child category."
//
// Basis (stated on every surface): a "page" is a DISTINCT URL that holds a
// stored ranking on at least one of the node's keywords — client URLs come from
// the canonical pool (Semrush `Ur` / page map, Const I.1), competitor URLs from
// uploaded footprint rows (`project_keywords.url`, v7.251). This measures
// RANKING content, never "everything published" — the label is "pages ranking",
// and it costs zero new API calls because every row is already on file.
//
// Honesty rules (Const I.5):
//  - A domain whose ranked rows carry NO url column shows "no URL data",
//    never 0 — absence is not zero. Coverage ("url data: N/M kw") is shown
//    per brand so a thin upload reads as a data gap, not a thin library.
//  - SERP rivals (`serpCompetitorPositions`) carry positions only — they are
//    NAMED as uncounted rather than silently omitted.
//  - This is a rollup over data already read by this panel (II.6a): both the
//    panel and the Assessment PDF call THIS builder (II.6b), never their own.

/** Display threshold from the approved 2026-08-14 mockup: a sub-category is
 *  flagged a GAP when the client verifiably holds 0 ranking URLs while some
 *  competitor holds at least this many. Stated in the on-panel legend. */
export const CONTENT_GAP_MIN = 10;

/** v7.459: coverage-basis GAP floor — a child is flagged when the client covers 0
 *  of its topics while a rival covers at least half of them (never fewer than this). */
export const COVER_GAP_MIN = 2;

export interface ContentCell {
  /** Distinct ranking URLs held by this domain on the node's keywords. */
  urls:     number;
  /** Distinct keywords of the node this domain holds a stored rank on. */
  rankedKw: number;
  /** …of which the source row carried a URL (coverage; 0 with rankedKw>0 = no URL data). */
  urlKw:    number;
}
export interface ContentBrandRow {
  domain: string; kind: 'client' | 'tracked'; total: ContentCell; perChild: ContentCell[];
  /** v7.459 (Wayne): topics COVERED — the same unit as the journey requirement, so
   *  columns sum exactly. A topic is covered when this brand holds a stored rank on
   *  >=1 of its keywords: rank evidence — a rank always has a landing page behind it,
   *  so a brand whose uploaded rows carry no URL column still measures (the URL is
   *  extra evidence shown in the drill when known, never the gate). null when the
   *  caller passed no topics (unknown, never 0 — I.5). */
  covered: { total: number; perChild: number[]; atLine: number } | null;
}

/** v7.458 (Wayne, 2026-08-14): the journey requirement for a line — how many
 *  pages the full journey needs, from the SAME canonical Theme-Cluster topics
 *  every panel renders (one topic = one intent cluster = one intended page,
 *  Const II.7/III.5 — the "42 topics" already shown in the line header, never a
 *  new derivation). Each topic is filed under the child sub-category holding
 *  the MAJORITY of its keywords; a topic whose keywords stop at the line level
 *  files at the line (counted in `total`, listed in `atLine`, in no child). */
export interface JourneyRequirement {
  total:    number;    // topics on this node = pages the full journey needs
  perChild: number[];  // topics filed per child (majority-keyword home)
  atLine:   number;    // topics filed at the line level (no child home)
}
/** The keyword shape journey filing needs from a canonical Topic. */
export interface JourneyTopicLike { keywords: Array<{ keyword: string }> }

export interface ContentFootprint {
  children:       Array<{ key: string; name: string; kwCount: number }>;
  brands:         ContentBrandRow[];        // sorted by total.urls desc; client always present
  /** Child indexes flagged GAP: client verifiably 0 URLs, best competitor >= CONTENT_GAP_MIN. */
  gapChildIdx:    number[];
  /** SERP rivals with rank data on this node but no URL-bearing source — uncounted, named (I.5). */
  unlistedRivals: string[];
  /** v7.458: journey requirement from canonical Theme-Cluster topics; null when
   *  the caller passed no topics (the requirement is then unknown, never 0 — I.5). */
  journey:        JourneyRequirement | null;
}

/** One URL identity: strip protocol/www/hash/trailing slash, lowercase. Query kept
 *  (Semrush landing URLs rarely carry one; when they do it distinguishes real pages). */
export const normContentUrl = (u: string): string => {
  let s = String(u ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('#')[0];
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s;
};

interface CfAcc { urls: Set<string>; rankedKw: Set<string>; urlKw: Set<string> }
const newAcc = (): CfAcc => ({ urls: new Set(), rankedKw: new Set(), urlKw: new Set() });
const accToCell = (a: CfAcc): ContentCell => ({ urls: a.urls.size, rankedKw: a.rankedKw.size, urlKw: a.urlKw.size });

export interface BuildContentFootprintOpts {
  /** The product-line node (or any CatNode). A no-taxonomy fallback may pass
   *  `{ name, allKws, children: [] }` built from the same canonical pool. */
  node:             Pick<CatNode, 'name' | 'allKws' | 'children'>;
  uploadedKeywords: any[];
  serpPositions:    Record<string, Array<{ keyword: string; position: number }>>;
  clientDomain:     string;
  /** v7.458: the line's canonical Theme-Cluster topics (the SAME `p.topics` the
   *  panel already renders). When present, the footprint carries the journey
   *  requirement; when absent, `journey` is null — unknown, never 0 (I.5). */
  topics?:          JourneyTopicLike[];
}

/** v7.458: file topics under children by majority keyword home — the ONE
 *  shared journey-requirement math (Const II.7). Exported so the header chip,
 *  the footprint card and the PDF all read this and never re-derive. */
/** v7.459: the per-topic filing — which child each topic belongs to (-1 = the line
 *  level). THE one filing math (Const II.7): buildJourneyRequirement counts it,
 *  brand coverage reads it, the drill lists it — never three derivations. */
export function fileTopics(
  topics: JourneyTopicLike[],
  children: Array<Pick<CatNode, 'allKws'>>,
): number[] {
  const kwToChild = new Map<string, number>();
  children.forEach((c, i) => { for (const k of c.allKws) kwToChild.set(k.keyword.toLowerCase().trim(), i); });
  return topics.map(t => {
    const votes = children.map(() => 0);
    let any = false;
    for (const k of (t.keywords ?? [])) {
      const ci = kwToChild.get(String(k?.keyword ?? '').toLowerCase().trim());
      if (ci !== undefined) { votes[ci]++; any = true; }
    }
    if (!any) return -1;
    let best = 0;
    for (let i = 1; i < votes.length; i++) if (votes[i] > votes[best]) best = i;   // tie → first child (deterministic)
    return best;
  });
}

export function buildJourneyRequirement(
  topics: JourneyTopicLike[],
  children: Array<Pick<CatNode, 'allKws'>>,
): JourneyRequirement {
  const filing = fileTopics(topics, children);
  const perChild = children.map(() => 0);
  let atLine = 0;
  for (const ci of filing) { if (ci < 0) atLine++; else perChild[ci]++; }
  return { total: topics.length, perChild, atLine };
}

/** v7.459: topics covered by a ranked-keyword set (rank evidence — a stored rank
 *  always has a page behind it, known URL or not). Same filing as the requirement,
 *  so brand columns and the journey row are in the SAME unit and sum exactly. */
export function coverageForRankedSet(
  topics: JourneyTopicLike[],
  filing: number[],
  childCount: number,
  rankedKws: ReadonlySet<string>,
): { total: number; perChild: number[]; atLine: number } {
  const perChild = Array.from({ length: childCount }, () => 0);
  let total = 0, atLine = 0;
  topics.forEach((t, i) => {
    const hit = (t.keywords ?? []).some(k => rankedKws.has(String(k?.keyword ?? '').toLowerCase().trim()));
    if (!hit) return;
    total++;
    if (filing[i] < 0) atLine++; else perChild[filing[i]]++;
  });
  return { total, perChild, atLine };
}

/** v7.459: the collapsed header chip's covered-topics count straight from a line's
 *  canonical topics — a topic is covered when the client ranks on >=1 of its
 *  keywords. Same test coverageForRankedSet applies inside the footprint, so the
 *  chip can never disagree with the card (II.6a). */
export function clientTopicsCovered(topics: Array<{ keywords: any[] }>): number {
  let n = 0;
  for (const t of topics) {
    if ((t.keywords as any[] ?? []).some(k => { const p = k?.position; return p != null && p >= 1; })) n++;
  }
  return n;
}

/** v7.458: the client's line-total pages cell straight from a line's canonical
 *  topics — byte-for-byte the same math as buildContentFootprint's client total
 *  (first-seen keyword wins the dedup, exactly like the panel's pool build), so
 *  the collapsed header chip can never disagree with the footprint card (II.6a). */
export function clientPagesForTopics(topics: Array<{ keywords: any[] }>): ContentCell {
  const seen = new Set<string>();
  const acc = newAcc();
  for (const t of topics) for (const k of (t.keywords as any[] ?? [])) {
    const kw = String(k?.keyword ?? '').toLowerCase().trim();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    const p = k?.position;
    if (p == null || p < 1) continue;
    acc.rankedKw.add(kw);
    if (k?.url) { acc.urlKw.add(kw); const u = normContentUrl(String(k.url)); if (u) acc.urls.add(u); }
  }
  return accToCell(acc);
}

export function buildContentFootprint(opts: BuildContentFootprintOpts): ContentFootprint {
  const { node, uploadedKeywords, serpPositions, clientDomain, topics } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const children = (node.children ?? []).map(c => ({ key: c.key, name: c.name, kwCount: c.kwCount }));

  // ── v7.458: journey requirement from the caller's canonical topics (II.7) ──
  // v7.459: the per-topic filing is computed ONCE and shared by the requirement
  // and every brand's coverage — one unit, columns sum exactly (Wayne).
  const filing: number[] | null = topics ? fileTopics(topics, node.children ?? []) : null;
  const journey: JourneyRequirement | null = (() => {
    if (!topics || !filing) return null;
    const perChild = (node.children ?? []).map(() => 0);
    let atLine = 0;
    for (const ci of filing) { if (ci < 0) atLine++; else perChild[ci]++; }
    return { total: topics.length, perChild, atLine };
  })();

  // keyword → child index (a keyword's most-specific home is one node, III.6/I.3,
  // so children's allKws are disjoint; keywords filed AT the line level map to -1)
  const kwToChild = new Map<string, number>();
  (node.children ?? []).forEach((c, i) => { for (const k of c.allKws) kwToChild.set(k.keyword.toLowerCase().trim(), i); });
  const nodeKws = new Set<string>();
  for (const k of node.allKws) nodeKws.add(k.keyword.toLowerCase().trim());

  // ── client cells, from the canonical pool rows (position + url per keyword) ──
  const cTotal = newAcc();
  const cChild = children.map(() => newAcc());
  for (const k of node.allKws) {
    const kw = k.keyword.toLowerCase().trim();
    const p = k.position;
    if (p == null || p < 1) continue;
    const ci = kwToChild.get(kw);
    const tgts = [cTotal, ...(ci !== undefined ? [cChild[ci]] : [])];
    for (const t of tgts) {
      t.rankedKw.add(kw);
      if (k.url) { t.urlKw.add(kw); const u = normContentUrl(k.url); if (u) t.urls.add(u); }
    }
  }

  // ── competitor cells, from uploaded footprint rows ──
  const comp = new Map<string, { total: CfAcc; child: CfAcc[] }>();
  for (const r of (uploadedKeywords ?? [])) {
    if (r?.source === 'blocked') continue;
    const dom = normSovDomain(r?.domain ?? '');
    if (!dom || dom === clientNorm) continue;
    const p = r?.position;
    if (p == null || p < 1) continue;
    const kw = String(r?.keyword ?? '').toLowerCase().trim();
    if (!kw || !nodeKws.has(kw)) continue;
    let e = comp.get(dom); if (!e) { e = { total: newAcc(), child: children.map(() => newAcc()) }; comp.set(dom, e); }
    const ci = kwToChild.get(kw);
    const tgts = [e.total, ...(ci !== undefined ? [e.child[ci]] : [])];
    for (const t of tgts) {
      t.rankedKw.add(kw);
      if (r?.url) { t.urlKw.add(kw); const u = normContentUrl(String(r.url)); if (u) t.urls.add(u); }
    }
  }

  // v7.459: per-brand coverage in the requirement's own unit (topics), from rank
  // evidence — a brand whose rows carry no URL column still measures here.
  const covFor = (rankedKws: ReadonlySet<string>) =>
    (topics && filing) ? coverageForRankedSet(topics, filing, children.length, rankedKws) : null;

  const brands: ContentBrandRow[] = [];
  if (clientNorm) brands.push({ domain: clientNorm, kind: 'client', total: accToCell(cTotal), perChild: cChild.map(accToCell), covered: covFor(cTotal.rankedKw) });
  comp.forEach((e, dom) => {
    if (e.total.rankedKw.size === 0) return;
    brands.push({ domain: dom, kind: 'tracked', total: accToCell(e.total), perChild: e.child.map(accToCell), covered: covFor(e.total.rankedKw) });
  });
  // v7.459: with a journey on file, rank the board by topics covered (the card's
  // unit); the URL count breaks ties. Without one, by distinct URLs as before.
  brands.sort((a, b) =>
    ((b.covered?.total ?? -1) - (a.covered?.total ?? -1)) ||
    (b.total.urls - a.total.urls) || (b.total.rankedKw - a.total.rankedKw) || a.domain.localeCompare(b.domain));

  // ── GAP flags ──
  // v7.459 (coverage basis): flagged when the client covers 0 of a child's topics
  // while some rival covers at least half of them (min COVER_GAP_MIN). Coverage is
  // rank-evidence-based, so "0" here is measured, never a URL-column hole.
  // Without a journey, the v7.449 URL rule stands unchanged.
  const client = brands.find(b => b.kind === 'client') ?? null;
  const gapChildIdx: number[] = [];
  children.forEach((_, i) => {
    if (!client) return;
    if (journey && client.covered) {
      if (client.covered.perChild[i] !== 0) return;
      const req = journey.perChild[i];
      const best = Math.max(0, ...brands.filter(b => b.kind !== 'client').map(b => b.covered?.perChild[i] ?? 0));
      if (req > 0 && best >= Math.max(COVER_GAP_MIN, Math.ceil(req / 2))) gapChildIdx.push(i);
      return;
    }
    const cc = client.perChild[i];
    const unknown = cc.rankedKw > 0 && cc.urlKw === 0;   // ranks but upload had no URL column — unknown, never a gap claim
    if (cc.urls !== 0 || unknown) return;
    const best = Math.max(0, ...brands.filter(b => b.kind !== 'client').map(b => b.perChild[i].urls));
    if (best >= CONTENT_GAP_MIN) gapChildIdx.push(i);
  });

  // ── rivals with rank data but no URL-bearing source (named, not counted — I.5) ──
  const unlistedRivals: string[] = [];
  for (const [rawDom, positions] of Object.entries(serpPositions ?? {})) {
    const dom = normSovDomain(rawDom);
    if (!dom || dom === clientNorm || comp.has(dom)) continue;
    if ((positions ?? []).some(pos => nodeKws.has(String(pos?.keyword ?? '').toLowerCase().trim()))) unlistedRivals.push(dom);
  }
  unlistedRivals.sort();

  return { children, brands, gapChildIdx, unlistedRivals, journey };
}

/** v7.459: the covered-topic list BEHIND a coverage cell — each topic with its
 *  rank evidence (ranked-kw count, best position, covering URL when the source
 *  row carried one; "url unknown" is stated, never fabricated — I.5). Same
 *  filing + coverage test as buildContentFootprint (II.7). */
export interface CoveredTopicRow { topic: string; kwCount: number; bestPos: number; url: string | null }
export function coveredTopicList(opts: {
  topics: Array<JourneyTopicLike & { product?: string; parentName?: string }>;
  children: Array<Pick<CatNode, 'allKws'>>;
  childIdx: number;                       // -1 = the whole line
  domain: string; clientDomain: string;
  node: Pick<CatNode, 'allKws'>;
  uploadedKeywords: any[];
}): CoveredTopicRow[] {
  const { topics, children, childIdx, domain, clientDomain, node, uploadedKeywords } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const domNorm = normSovDomain(domain);
  // this brand's rank evidence per keyword (best position wins; its URL rides along)
  const ev = new Map<string, { pos: number; url: string | null }>();
  const add = (kw: string, pos: number, url: string | null) => {
    const e = ev.get(kw);
    if (!e || pos < e.pos) ev.set(kw, { pos, url });
  };
  if (domNorm === clientNorm) {
    for (const k of node.allKws) { if (k.position != null && k.position >= 1) add(k.keyword.toLowerCase().trim(), k.position, k.url ?? null); }
  } else {
    for (const r of (uploadedKeywords ?? [])) {
      if (r?.source === 'blocked') continue;
      if (normSovDomain(r?.domain ?? '') !== domNorm) continue;
      const p = r?.position; if (p == null || p < 1) continue;
      const kw = String(r?.keyword ?? '').toLowerCase().trim();
      if (kw) add(kw, p, (typeof r?.url === 'string' && r.url.trim()) ? String(r.url) : null);
    }
  }
  const filing = fileTopics(topics, children);
  const rows: CoveredTopicRow[] = [];
  topics.forEach((t, i) => {
    if (childIdx >= 0 && filing[i] !== childIdx) return;
    if (childIdx === -2 && filing[i] !== -1) return;   // v7.460: -2 = the LINE-LEVEL bucket (topics with no child home)
    let kwCount = 0; let best: { pos: number; url: string | null } | null = null;
    for (const k of (t.keywords ?? [])) {
      const e = ev.get(String(k?.keyword ?? '').toLowerCase().trim());
      if (!e) continue;
      kwCount++;
      if (!best || e.pos < best.pos) best = e;
    }
    if (kwCount === 0 || !best) return;
    rows.push({ topic: (t as any).product ?? (t as any).parentName ?? 'topic', kwCount, bestPos: best.pos, url: best.url ? normContentUrl(best.url) : null });
  });
  return rows.sort((a, b) => (a.bestPos - b.bestPos) || (b.kwCount - a.kwCount) || a.topic.localeCompare(b.topic));
}

/** The URL list BEHIND a cell (Wayne's mockup: "click any cell → the URL list").
 *  Same sources as buildContentFootprint — one basis, two zoom levels (II.7). */
export function contentUrlList(opts: {
  kws: NodeKw[]; domain: string; clientDomain: string; uploadedKeywords: any[];
}): Array<{ url: string; kwCount: number; bestPos: number }> {
  const { kws, domain, clientDomain, uploadedKeywords } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const domNorm = normSovDomain(domain);
  const kwSet = new Set(kws.map(k => k.keyword.toLowerCase().trim()));
  const byUrl = new Map<string, { kws: Set<string>; bestPos: number }>();
  const add = (rawUrl: string, kw: string, pos: number) => {
    const u = normContentUrl(rawUrl); if (!u) return;
    let e = byUrl.get(u); if (!e) { e = { kws: new Set(), bestPos: pos }; byUrl.set(u, e); }
    e.kws.add(kw);
    if (pos < e.bestPos) e.bestPos = pos;
  };
  if (domNorm === clientNorm) {
    for (const k of kws) { if (k.position != null && k.position >= 1 && k.url) add(k.url, k.keyword.toLowerCase().trim(), k.position); }
  } else {
    for (const r of (uploadedKeywords ?? [])) {
      if (r?.source === 'blocked') continue;
      if (normSovDomain(r?.domain ?? '') !== domNorm) continue;
      const p = r?.position; if (p == null || p < 1 || !r?.url) continue;
      const kw = String(r?.keyword ?? '').toLowerCase().trim();
      if (!kw || !kwSet.has(kw)) continue;
      add(String(r.url), kw, p);
    }
  }
  return Array.from(byUrl.entries())
    .map(([url, e]) => ({ url, kwCount: e.kws.size, bestPos: e.bestPos }))
    .sort((a, b) => (b.kwCount - a.kwCount) || (a.bestPos - b.bestPos) || a.url.localeCompare(b.url));
}
