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

/** Does this recorded row name or cite the client? Direct field checks only. */
export function rowNamesClient(row: StoredMentionRow, clientNorm: string, brandToks: string[]): boolean {
  if (row.sources.some(s => normSovDomain(s.domain) === clientNorm)) return true;
  if (row.searchResultDomains.some(d => normSovDomain(d) === clientNorm)) return true;
  const hay = (row.brandEntities.join(' ') + ' ' + row.answerExcerpt).toLowerCase();
  return brandToks.some(t => t.length >= 3 && hay.includes(t));
}

export function buildBrandTokens(clientDomain: string, brandTerms: string[] = []): string[] {
  const toks = new Set<string>();
  const b = extractBrand(clientDomain); if (b) toks.add(b.toLowerCase());
  for (const t of brandTerms) if (t && t.trim()) toks.add(t.toLowerCase().trim());
  return Array.from(toks);
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
  const brandCats  = brandTypedCategoryNames(breakdown);

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
