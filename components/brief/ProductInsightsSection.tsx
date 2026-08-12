'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ProductInsightsSection — v7.426 (Wayne, 2026-08-12)
//
// One view per top-level product category: traditional search strength and AI
// answer visibility MEASURED SIDE BY SIDE, with the topic-level bridge between
// them ("this page already ranks — it's the surrounding AI prompts you're
// missing"). Designed from GEO/orbitiq-ux-mockup-product-insights-v3-2026-08-12.html.
//
// Data rules:
//  - This panel is a ROLLUP: it READS existing measured bases and never
//    re-derives a metric (Const II.6a). Search side = the same canonical topics
//    the Cluster/Journey/Content panels build (buildCanonicalClusterTopics —
//    stored taxonomy membership, Const II.7/II.8) with the same unfloored 0,0
//    thresholds. Brand ladder = the v7.419 method verbatim: measured page-1
//    volume per brand over the category's own keywords, uploaded competitor
//    rows + serpCompetitorPositions, no CTR model.
//  - AI side has two labeled bases, never blended: (1) the in-app LLM probe
//    (unbranded Claude+GPT prompts per category, analysis-time, Const I.1) and
//    (2) recorded AI answers pulled on demand from DataForSEO LLM Mentions
//    (ChatGPT + Google AI Overviews) — real recorded questions/answers/citations
//    stored server-side per category. `aiSearchVolume` on recorded rows is
//    DataForSEO's ESTIMATED metric and is labeled EST everywhere (I.5a).
//  - Verdicts are deterministic threshold rules over those measured numbers —
//    thresholds are stated on-panel (automatic detection, never a guess, I.5b
//    spirit). No LLM free-text runs in this panel.
//  - Scroll root: plain block `flex-1 min-h-0 overflow-y-auto` (Const IV.1).
//  - Every wait shows determinate progress (scan runs one category per request,
//    "category X of N", Const IV.2); scan CTA + last-scan timestamp live on the
//    panel header (IV.4/IV.5).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildCanonicalClusterTopics, type Topic } from '@/lib/clusters/canonical';
import type { IntentType } from '@/lib/clusters/canonical';
import { normSovDomain } from '@/lib/sov/model';
import { extractBrand } from '@/lib/utils/kwVolume';
import InsightBanner from './InsightBanner';
import { exportProductInsightTopicsXLSX, type ProductInsightTopicRow } from '@/lib/export/productInsightsExport';   // v7.429
import type { Insight, InsightSeg } from '@/lib/insights';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  projectId:     string;
  kwVersion?:    number;
  analysis:      any;
  competitors:   string[];
  domain:        string;               // client domain
  brandTerms?:   string[];
  claudeAssigns?: Record<string, IntentType>;
}

interface StoredMentionRow {
  platform: string; modelName: string; question: string; answerExcerpt: string;
  sources: Array<{ domain: string; url: string; title: string }>;
  searchResultDomains: string[]; brandEntities: string[];
  aiSearchVolume: number | null; webSearchBased: boolean | null; lastResponseAt: string | null;
}
interface StoredCatScan {
  category: string; query: string; scannedAt: string; totalCount: number;
  fetched: number; costUSD: number; provider: string; rows: StoredMentionRow[];
}

interface LadderEntry { domain: string; kind: 'client' | 'tracked' | 'rival'; p1Vol: number; p1Kw: number; measuredKw: number }

interface ProductRow {
  name:        string;
  topics:      Topic[];
  kwCount:     number;
  demand:      number;               // monthly volume (exact rollup of the product's canonical keywords)
  bands:       [number, number, number, number];   // vol at pos 1–3 / 4–10 / 11–20 / 21+ or unranked
  p1Share:     number;               // 0–1 measured: (bands0+bands1)/demand
  ladder:      LadderEntry[];
  clientRank:  number | null;        // 1-based position in the ladder, null = no page-1 hold
  probe:       { mentions: number; total: number; claude: string; gpt: string } | null;
  scan:        StoredCatScan | null;
  aiRate:      number | null;        // probe unbranded mention rate 0–1 (labeled basis)
  dfsShare:    number | null;        // share of recorded answers naming/citing the client 0–1
  citedTop:    Array<{ domain: string; count: number; isClient: boolean }>;
  arbTopics:   number;               // topics ranking p1 while AI side is weak
  verdicts:    { arb: number; dual: number; aiOnly: number; none: number };
}

// ─── Deterministic verdict thresholds (stated on-panel) ──────────────────────
export const AI_WEAK_BELOW  = 0.3;   // exported for the retained suite (V.6)   // category AI rate below this = weak
export const AI_STRONG_FROM = 0.5;   // exported for the retained suite (V.6)   // at/above = strong

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

// ─── Small helpers ───────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}
const seg = (t: string, em = false): InsightSeg => ({ t, em });

function normName(s: string): string { return s.toLowerCase().trim(); }

/** Does this recorded row name or cite the client? Direct field checks only. */
function rowNamesClient(row: StoredMentionRow, clientNorm: string, brandToks: string[]): boolean {
  if (row.sources.some(s => normSovDomain(s.domain) === clientNorm)) return true;
  if (row.searchResultDomains.some(d => normSovDomain(d) === clientNorm)) return true;
  const hay = (row.brandEntities.join(' ') + ' ' + row.answerExcerpt).toLowerCase();
  return brandToks.some(t => t.length >= 3 && hay.includes(t));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductInsightsSection({
  projectId, kwVersion = 0, analysis, competitors, domain, brandTerms = [], claudeAssigns = {},
}: Props) {
  const [uploadedKeywords, setUploadedKeywords] = useState<any[] | null>(null);
  const [stored, setStored]           = useState<{ categories: StoredCatScan[] } | null>(null);
  const [storedAt, setStoredAt]       = useState<string | null>(null);
  const [providerOk, setProviderOk]   = useState<boolean>(true);
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [showAllTopics, setShowAllTopics]   = useState(false);
  // v7.429 — KPI drill-down: which verdict's topics are listed flat, across every product.
  const [drill, setDrill]         = useState<TopicVerdict | null>(null);
  const [planBusy, setPlanBusy]   = useState(false);
  const [planNote, setPlanNote]   = useState<string | null>(null);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [confirmScan, setConfirmScan] = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [scanIdx, setScanIdx]         = useState(0);
  const [scanTotal, setScanTotal]     = useState(0);
  const [scanCat, setScanCat]         = useState('');
  const [scanErrors, setScanErrors]   = useState<string[]>([]);

  // ── data: uploaded keywords (same fetch every canonical consumer uses) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/keywords`);
        const d   = res.ok ? await res.json() : { keywords: [] };
        if (alive) setUploadedKeywords(d.keywords ?? []);
      } catch { if (alive) setUploadedKeywords([]); }
    })();
    return () => { alive = false; };
  }, [projectId, kwVersion]);

  // ── data: stored recorded-answer scans ──
  const refreshStored = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/product-insights`, { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      setStored(d.data ?? null);
      setStoredAt(d.updatedAt ?? null);
      setProviderOk(d.providerConfigured !== false);
    } catch { /* keep prior state — never fabricate (I.5) */ }
  }, [projectId]);
  useEffect(() => { void refreshStored(); }, [refreshStored]);

  const clientNorm = normSovDomain(domain);
  const brandToks  = useMemo(() => {
    const toks = new Set<string>();
    const b = extractBrand(domain); if (b) toks.add(b.toLowerCase());
    for (const t of brandTerms) if (t && t.trim()) toks.add(t.toLowerCase().trim());
    return Array.from(toks);
  }, [domain, brandTerms]);

  // ── canonical topics (the shared basis — Const II.7, unfloored 0,0) ──
  const topics: Topic[] = useMemo(() => {
    if (!analysis || uploadedKeywords === null) return [];
    try {
      return buildCanonicalClusterTopics(analysis, domain, competitors, uploadedKeywords ?? [], claudeAssigns, 0, 0);
    } catch { return []; }
  }, [analysis, domain, competitors, uploadedKeywords, claudeAssigns]);

  // ── per-keyword brand rank maps — v7.419 ladder method verbatim ──
  const brandRankData = useMemo(() => {
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
    const serpPositions: Record<string, Array<{ keyword: string; position: number }>> =
      (analysis?.semrushSnapshot as any)?.serpCompetitorPositions ?? {};
    for (const [rawDom, positions] of Object.entries(serpPositions)) {
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
    return { perKw, tracked };
  }, [uploadedKeywords, analysis, clientNorm]);

  // ── probe categories (analysis-time LLM probe, category level) ──
  const probeCats = useMemo(() => {
    const out = new Map<string, { mentions: number; total: number; claude: string; gpt: string }>();
    const cats: any[] = (analysis?.llmProbe as any)?.categories ?? [];
    for (const c of cats) {
      const name = normName(String(c?.category ?? ''));
      if (!name) continue;
      const mentions = (c?.claudeMentions ?? 0) + (c?.chatgptMentions ?? 0);
      const total    = (c?.claudeTotal ?? 0) + (c?.chatgptTotal ?? 0);
      out.set(name, {
        mentions, total,
        claude: `${c?.claudeMentions ?? 0}/${c?.claudeTotal ?? 0}`,
        gpt:    `${c?.chatgptMentions ?? 0}/${c?.chatgptTotal ?? 0}`,
      });
    }
    return out;
  }, [analysis]);

  const storedByCat = useMemo(() => {
    const m = new Map<string, StoredCatScan>();
    for (const c of (stored?.categories ?? [])) m.set(normName(c.category), c);
    return m;
  }, [stored]);

  // ── the product rows: one per umbrella (excluding brand/location/Other) ──
  const products: ProductRow[] = useMemo(() => {
    const byUmbrella = new Map<string, Topic[]>();
    for (const t of topics) {
      if (t.parentType === 'brand' || t.parentType === 'location') continue;   // products only; client-brand + geo live in their own panels
      const u = (t.umbrella || t.parentName || '').trim();
      if (!u || normName(u) === 'other') continue;
      const arr = byUmbrella.get(u); if (arr) arr.push(t); else byUmbrella.set(u, [t]);
    }
    const { perKw, tracked } = brandRankData;
    const rows: ProductRow[] = [];
    byUmbrella.forEach((uts, name) => {
      // one keyword = one row inside the canonical topics (I.3); aggregate directly
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
        const vol = k.searchVolume || 0;
        demand += vol;
        const p = k.position;
        if (p !== null && p >= 1 && p <= 3)       bands[0] += vol;
        else if (p !== null && p >= 4 && p <= 10) bands[1] += vol;
        else if (p !== null && p >= 11 && p <= 20) bands[2] += vol;
        else bands[3] += vol;
        if (p !== null && p >= 1 && p <= 10) { clientP1Vol += vol; clientP1Kw++; }
        const m = perKw.get(kwLow);
        if (m) m.forEach((bp, dom) => {
          let e = byDom.get(dom); if (!e) { e = { p1Vol: 0, p1Kw: 0, measuredKw: 0 }; byDom.set(dom, e); }
          e.measuredKw++;
          if (bp >= 1 && bp <= 10) { e.p1Vol += vol; e.p1Kw++; }
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

      const probe = probeCats.get(normName(name)) ?? null;
      const scan  = storedByCat.get(normName(name)) ?? null;
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

      rows.push({
        name, topics: uts, kwCount, demand, bands,
        p1Share: demand > 0 ? (bands[0] + bands[1]) / demand : 0,
        ladder, clientRank: clientIdx >= 0 ? clientIdx + 1 : null,
        probe, scan, aiRate, dfsShare, citedTop,
        arbTopics: verdicts.arb, verdicts,
      });
    });
    rows.sort((a, b) => b.demand - a.demand);
    return rows;
  }, [topics, brandRankData, probeCats, storedByCat, clientNorm, brandToks]);

  // ── KPI totals + headline insight ──
  const kpi = useMemo(() => {
    const t = { arb: 0, dual: 0, aiOnly: 0, none: 0, citesClient: 0, citesTotal: 0 };
    for (const p of products) {
      t.arb += p.verdicts.arb; t.dual += p.verdicts.dual;
      t.aiOnly += p.verdicts.aiOnly; t.none += p.verdicts.none;
      for (const c of p.citedTop) { t.citesTotal += c.count; if (c.isClient) t.citesClient += c.count; }
    }
    return t;
  }, [products]);

  const insight: Insight | null = useMemo(() => {
    // Largest-demand product where the client leads search (rank 1–2 in the ladder)
    // while the AI side is weak on every available basis — the panel's core inversion.
    const inv = products.find(p =>
      p.clientRank !== null && p.clientRank <= 2 &&
      ((p.aiRate !== null && p.aiRate < AI_WEAK_BELOW) || (p.dfsShare !== null && p.dfsShare < AI_WEAK_BELOW)) &&
      (p.aiRate !== null || p.dfsShare !== null));
    if (!inv) return null;
    const aiTxt = inv.aiRate !== null
      ? `mentioned in ${inv.probe!.mentions} of ${inv.probe!.total} unbranded AI probe answers`
      : `named or cited in ${Math.round((inv.dfsShare ?? 0) * 100)}% of recorded AI answers`;
    return {
      id: 'PI1', tone: 'watch',
      kicker: 'Finding · Search-to-AI inversion',
      parts: [
        seg(inv.name + ' ', true), seg('holds page-1 rank #' + inv.clientRank + ' in its brand field but is '),
        seg(aiTxt, true), seg(' — the ranking authority exists; the AI answer is what’s missing.'),
      ],
      evidence: `Basis: v7.419 page-1 volume ladder + ${inv.aiRate !== null ? 'LLM probe (analysis-time)' : 'DataForSEO recorded answers'} · thresholds on panel`,
    };
  }, [products]);

  // ── scan flow (one category per request — real progress, Const IV.2) ──
  const runScan = useCallback(async () => {
    setConfirmScan(false);
    setScanning(true);
    setScanErrors([]);
    setScanTotal(products.length);
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      setScanIdx(i + 1); setScanCat(p.name);
      try {
        const res = await fetch(`/api/projects/${projectId}/product-insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: p.name, keyword: p.name.toLowerCase() }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setScanErrors(prev => [...prev, `${p.name}: ${d?.error ?? `HTTP ${res.status}`}`]);
        }
      } catch (e: any) {
        setScanErrors(prev => [...prev, `${p.name}: ${e?.message ?? 'request failed'}`]);
      }
      await refreshStored();   // incremental — each finished category appears immediately
    }
    setScanning(false);
  }, [products, projectId, refreshStored]);

  // ── render ──
  if (!analysis) return null;
  const loading = uploadedKeywords === null;
  const open = openProduct ? products.find(p => p.name === openProduct) ?? null : null;

  const chip = (bg: string, fg: string, border: string, text: string, title?: string) => (
    <span title={title} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: bg, color: fg, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{text}</span>
  );
  // v7.429: the drill-down title uses the SAME wording as the tile it came from.
  const DRILL_LABEL: Record<TopicVerdict, string> = {
    arb: 'Google yes, AI no', dual: 'Dual presence', aiOnly: 'AI only',
    none: 'No presence', noAiData: 'No AI data yet',
  };
  const VERDICT_CHIP: Record<TopicVerdict, () => JSX.Element> = {
    arb:      () => chip('var(--ca-108-99-255-0_12)', 'var(--c-9b96ff)', 'var(--ca-108-99-255-0_25)', 'GOOGLE YES · AI NO'),
    dual:     () => chip('rgba(52,211,153,0.08)', 'var(--c-34d399)', 'rgba(52,211,153,0.3)', 'DUAL PRESENCE'),
    aiOnly:   () => chip('rgba(245,158,11,0.08)', 'var(--c-f59e0b)', 'rgba(245,158,11,0.3)', 'AI ONLY · NO RANK'),
    none:     () => chip('rgba(248,113,113,0.07)', 'var(--c-f87171)', 'rgba(248,113,113,0.3)', 'NO PRESENCE'),
    noAiData: () => chip('transparent', 'var(--c-55557a)', 'var(--c-2a2a40)', 'NO AI DATA YET'),
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" data-panel="product-insights">
      <div style={{ padding: '18px 22px 60px', maxWidth: '1240px' }}>

        {/* ── header: title + last-scan + CTA (IV.4 / IV.5) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--c-e8e8ff)' }}>Product Insights</h2>
          <span style={{ fontSize: '11px', color: 'var(--c-6a6a90)' }}>
            {storedAt ? `Recorded AI answers last scanned ${new Date(storedAt).toLocaleString()}` : 'Recorded AI answers: not scanned yet'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!scanning && (
              <button
                onClick={() => setConfirmScan(v => !v)}
                disabled={loading || products.length === 0 || !providerOk}
                title={providerOk ? 'Pull real recorded AI answers (ChatGPT + Google AI Overviews) for every product category' : 'DataForSEO is not configured'}
                style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer',
                  background: 'var(--ca-108-99-255-0_1)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_25)' }}
              >
                ↻ Scan recorded AI answers
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--c-8a8aa8)', marginBottom: '12px' }}>
          Every product category with search and AI visibility measured together — and per topic, whether your ranking authority is
          reflected in the AI answers around it. This panel reads the same canonical pool and stored taxonomy as every other panel.
        </p>

        {/* provider not configured (honest gap, I.5) */}
        {!providerOk && (
          <div style={{ padding: '9px 12px', marginBottom: '12px', borderRadius: '8px', fontSize: '12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--c-f59e0b)' }}>
            DataForSEO is not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD) — the recorded-answer scan is unavailable.
            Search metrics and the analysis-time LLM probe below are unaffected.
          </div>
        )}

        {/* scan confirm — cost disclosed BEFORE the run (I.5b) */}
        {confirmScan && !scanning && (
          <div style={{ padding: '11px 14px', marginBottom: '12px', borderRadius: '8px', fontSize: '12px', background: 'var(--c-111120)', border: '1px solid var(--ca-108-99-255-0_25)', color: 'var(--c-c8c8e8)' }}>
            <b style={{ color: 'var(--c-e8e8ff)' }}>Scan {products.length} categor{products.length === 1 ? 'y' : 'ies'} through DataForSEO LLM Mentions?</b>
            <div style={{ marginTop: '4px', color: 'var(--c-8a8aa8)' }}>
              One live request per category, up to 100 recorded answers each (the API's own page size; the full match count is shown after the scan).
              List price $0.10/request + $0.001/row — the <b>measured</b> per-task cost is what lands on the API Usage ledger (never a rate×count estimate).
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => void runScan()} style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '7px', cursor: 'pointer', background: 'var(--ca-108-99-255-0_12)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_45)' }}>Run scan</button>
              <button onClick={() => setConfirmScan(false)} style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '7px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* scan progress — determinate, category X of N (IV.2) */}
        {scanning && (
          <div style={{ padding: '11px 14px', marginBottom: '12px', borderRadius: '8px', fontSize: '12px', background: 'var(--c-111120)', border: '1px solid var(--ca-108-99-255-0_25)', color: 'var(--c-c8c8e8)' }}>
            <b style={{ color: 'var(--c-9b96ff)' }}>Scanning recorded AI answers — category {scanIdx} of {scanTotal}</b>
            <span style={{ color: 'var(--c-8a8aa8)' }}> · {scanCat}</span>
            <div style={{ height: '5px', borderRadius: '3px', background: 'var(--c-1e1e34)', marginTop: '7px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${scanTotal > 0 ? Math.round((scanIdx / scanTotal) * 100) : 0}%`, background: 'var(--c-6c63ff)', transition: 'width .3s' }} />
            </div>
          </div>
        )}
        {scanErrors.length > 0 && !scanning && (
          <div style={{ padding: '9px 12px', marginBottom: '12px', borderRadius: '8px', fontSize: '12px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--c-f87171)' }}>
            {scanErrors.length} categor{scanErrors.length === 1 ? 'y' : 'ies'} failed and can be re-run: {scanErrors.join(' · ')}
          </div>
        )}

        <InsightBanner insight={insight} style={{ marginBottom: '14px' }} />

        {/* ── KPI tiles — v7.429: the four verdict tiles OPEN the topics behind the number ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: drill ? '10px' : '18px' }}>
          {[
            { k: 'GOOGLE YES, AI NO', v: String(kpi.arb), s: 'you rank page 1 · AI never mentions you', c: 'var(--c-9b96ff)', d: 'arb' as TopicVerdict },
            { k: 'DUAL PRESENCE', v: String(kpi.dual), s: 'rank + AI answers — defend', c: 'var(--c-34d399)', d: 'dual' as TopicVerdict },
            { k: 'AI ONLY', v: String(kpi.aiOnly), s: 'in AI answers · no page-1 rank', c: 'var(--c-f59e0b)', d: 'aiOnly' as TopicVerdict },
            { k: 'NO PRESENCE', v: String(kpi.none), s: 'neither ranked nor in AI', c: 'var(--c-f87171)', d: 'none' as TopicVerdict },
            { k: 'OWNED CITATION SHARE', v: kpi.citesTotal > 0 ? `${((kpi.citesClient / kpi.citesTotal) * 100).toFixed(1)}%` : '—',
              s: kpi.citesTotal > 0 ? `of ${kpi.citesTotal} recorded citations` : 'scan recorded answers to measure', c: 'var(--c-46cce0)', d: null },
          ].map(t => {
            const active = t.d !== null && drill === t.d;
            return (
              <div
                key={t.k}
                role={t.d ? 'button' : undefined}
                tabIndex={t.d ? 0 : undefined}
                aria-pressed={t.d ? active : undefined}
                title={t.d ? 'Show the topics behind this number' : undefined}
                onClick={t.d ? () => { setDrill(active ? null : t.d); setPlanNote(null); } : undefined}
                onKeyDown={t.d ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrill(active ? null : t.d); setPlanNote(null); } } : undefined}
                style={{ background: 'var(--c-111120)', border: `1px solid ${active ? 'var(--ca-108-99-255-0_45)' : 'var(--c-1e1e34)'}`,
                  borderRadius: '10px', padding: '11px 13px', cursor: t.d ? 'pointer' : 'default' }}
              >
                <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)' }}>{t.k}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: t.c, fontVariantNumeric: 'tabular-nums' }}>{t.v}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--c-8a8aa8)' }}>{t.s}</div>
                {t.d && (
                  <div style={{ fontSize: '9.5px', fontWeight: 700, marginTop: '3px', color: active ? 'var(--c-9b96ff)' : 'var(--c-6a6a90)' }}>
                    {active ? 'Hide these topics ▲' : 'Show these topics ▼'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── v7.429 · KPI drill-down: every topic behind the number, across every product ── */}
        {drill && (() => {
          const label = DRILL_LABEL[drill];
          const rows = products.flatMap(p => buildTopicRows(p).filter(r => r.v === drill).map(r => ({ p, ...r })));
          rows.sort((a, b) => b.t.totalVolume - a.t.totalVolume);
          const xlsxRows: ProductInsightTopicRow[] = rows.map(({ p, t, best }) => ({
            verdict: label, product: p.name, topic: t.product || t.parentName,
            page: best.url ? (best.url.replace(/^https?:\/\/[^/]*/, '') || '/') : '',
            bestRank: best.pos, demand: t.totalVolume, stage: t.stage || '', keywords: t.keywords.length,
          }));
          return (
            <div style={{ border: '1px solid var(--ca-108-99-255-0_45)', borderRadius: '10px', background: 'var(--c-0a0a14)', padding: '13px 15px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '9px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--c-9b96ff)' }}>{label.toUpperCase()} — {rows.length} TOPIC{rows.length === 1 ? '' : 'S'}</span>
                <span style={{ fontSize: '10.5px', color: 'var(--c-8a8aa8)' }}>every product · sorted by demand · same rows the crosswalk shows</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {planNote && <span style={{ fontSize: '10.5px', color: 'var(--c-8a8aa8)' }}>{planNote}</span>}
                  <button
                    onClick={() => { void exportProductInsightTopicsXLSX(xlsxRows, { clientName: domain, verdictLabel: label }); }}
                    style={{ fontSize: '10.5px', fontWeight: 700, padding: '5px 10px', borderRadius: '7px', cursor: 'pointer',
                      background: 'transparent', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_45)' }}
                  >Export .xlsx</button>
                  <button
                    disabled={planBusy || rows.length === 0}
                    onClick={async () => {
                      setPlanBusy(true); setPlanNote(null);
                      try {
                        // READ-MODIFY-WRITE against the server set — never a blind PUT of a
                        // locally-derived selection (the v7.371/v7.419 clobber lesson).
                        const gr = await fetch(`/api/projects/${projectId}/content-plan`, { cache: 'no-store' });
                        if (!gr.ok) throw new Error('read failed');
                        const gd = await gr.json();
                        const set = new Set<string>(Array.isArray(gd.selections) ? gd.selections : []);
                        const before = set.size;
                        for (const r of rows) set.add(String(r.t.id));
                        if (set.size === before) { setPlanNote('already in the content plan'); return; }
                        const pr = await fetch(`/api/projects/${projectId}/content-plan`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: Array.from(set) }),
                        });
                        if (!pr.ok) throw new Error('save failed');
                        setPlanNote(`added ${set.size - before} to the content plan`);
                      } catch {
                        setPlanNote('could not update the content plan — nothing was changed');   // honest gap (I.5)
                      } finally { setPlanBusy(false); }
                    }}
                    style={{ fontSize: '10.5px', fontWeight: 700, padding: '5px 10px', borderRadius: '7px', cursor: planBusy ? 'default' : 'pointer',
                      background: 'var(--ca-108-99-255-0_1)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_25)', opacity: planBusy ? 0.6 : 1 }}
                  >{planBusy ? 'Adding…' : 'Add all to Content Plan'}</button>
                  <button onClick={() => { setDrill(null); setPlanNote(null); }}
                    style={{ fontSize: '10.5px', fontWeight: 700, padding: '5px 10px', borderRadius: '7px', cursor: 'pointer',
                      background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}
                  >Close</button>
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) minmax(190px,1.5fr) 70px 92px 92px', gap: '10px', padding: '0 10px 4px',
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-55557a)' }}>
                <span>PRODUCT</span><span>TOPIC · YOUR PAGE</span><span>BEST RANK</span><span>DEMAND/MO</span><span>STAGE</span>
              </div>
              {rows.length === 0 && <div style={{ fontSize: '11.5px', color: 'var(--c-8a8aa8)', padding: '8px 10px' }}>No topics carry this verdict.</div>}
              {rows.map(({ p, t, best }) => (
                <div key={`${p.name}::${t.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) minmax(190px,1.5fr) 70px 92px 92px', gap: '10px', alignItems: 'center',
                  background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '8px', padding: '7px 10px', marginBottom: '5px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-c8c8e8)' }}>{p.name}</div>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-e8e8ff)' }}>{t.product || t.parentName}</div>
                    <div style={{ fontSize: '9.5px', color: best.url ? 'var(--c-6a6a90)' : 'var(--c-f87171)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {best.url ? best.url.replace(/^https?:\/\/[^/]*/, '') || '/' : (best.pos !== null ? 'ranking URL not in source rows' : 'no ranking page')}
                      {' '}· {t.keywords.length} kw
                    </div>
                  </div>
                  <div>
                    {best.pos !== null
                      ? chip('transparent', best.pos <= 3 ? 'var(--c-34d399)' : best.pos <= 10 ? 'var(--c-46cce0)' : best.pos <= 20 ? 'var(--c-f59e0b)' : 'var(--c-f87171)', 'var(--c-2a2a40)', `#${best.pos}`)
                      : chip('transparent', 'var(--c-55557a)', 'var(--c-2a2a40)', '—')}
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-c8c8e8)', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(t.totalVolume)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--c-8a8aa8)' }}>{t.stage}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── category grid (v7.428: no header strip — every metric carries its own label) ── */}

        {loading && (
          <div style={{ padding: '18px 14px', fontSize: '12px', color: 'var(--c-8a8aa8)' }}>Loading canonical topics…</div>
        )}
        {!loading && products.length === 0 && (
          <div style={{ padding: '18px 14px', fontSize: '12px', color: 'var(--c-8a8aa8)' }}>
            No product categories yet — run an analysis so the stored taxonomy exists (this panel renders nothing sooner; honest gap).
          </div>
        )}

        {products.map(p => {
          const isOpen = openProduct === p.name;
          const winner = p.ladder[0] ?? null;
          const aiPct  = p.aiRate !== null ? p.aiRate : p.dfsShare;
          const sPct   = Math.round(p.p1Share * 100);
          const aPct   = aiPct !== null ? Math.round(aiPct * 100) : null;
          const gap    = aPct !== null ? sPct - aPct : null;
          return (
            <div key={p.name}>
              <div
                onClick={() => { setOpenProduct(isOpen ? null : p.name); setShowAllTopics(false); setShowAllPrompts(false); }}
                style={{ display: 'grid', gridTemplateColumns: '22px minmax(140px,1.2fr) 152px 180px 180px 214px 96px', gap: '10px', alignItems: 'center',
                  background: 'var(--c-111120)', border: `1px solid ${isOpen ? 'var(--ca-108-99-255-0_45)' : 'var(--c-1e1e34)'}`,
                  borderRadius: isOpen ? '10px 10px 0 0' : '10px', padding: '10px 14px', marginBottom: isOpen ? 0 : '7px', cursor: 'pointer' }}
              >
                <span style={{ color: isOpen ? 'var(--c-9b96ff)' : 'var(--c-55557a)', fontSize: '11px' }}>{isOpen ? '▼' : '▶'}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-e8e8ff)' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--c-6a6a90)' }}>{p.kwCount.toLocaleString()} kws · {p.topics.length} topics</div>
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--c-c8c8e8)', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(p.demand)}</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginTop: '2px' }}>Search demand · monthly</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, width: '38px', fontVariantNumeric: 'tabular-nums',
                      color: sPct >= 50 ? 'var(--c-34d399)' : sPct >= 25 ? 'var(--c-f59e0b)' : 'var(--c-f87171)' }}>{sPct}%</span>
                    <span style={{ flex: 1, height: '7px', borderRadius: '4px', background: 'var(--c-1e1e34)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${sPct}%`, background: 'var(--c-46cce0)' }} />
                    </span>
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginTop: '2px' }}>of search demand on page 1</div>
                  <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)' }}>
                    {winner ? (winner.kind === 'client'
                      ? `you lead · ${((winner.p1Vol / Math.max(p.demand, 1)) * 100).toFixed(1)}% page-1 share`
                      : `${winner.domain} leads${p.clientRank !== null ? ` · you #${p.clientRank} of ${p.ladder.length}` : ' · no page-1 hold'}`) : 'no page-1 holds measured'}
                  </div>
                </div>
                <div>
                  {p.probe ? (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {chip('transparent', (p.aiRate ?? 0) >= AI_STRONG_FROM ? 'var(--c-34d399)' : (p.aiRate ?? 0) < AI_WEAK_BELOW ? 'var(--c-f87171)' : 'var(--c-f59e0b)', 'var(--c-2a2a40)', `Claude ${p.probe.claude}`, 'Unbranded probe prompts the client was mentioned in (analysis-time)')}
                      {chip('transparent', (p.aiRate ?? 0) >= AI_STRONG_FROM ? 'var(--c-34d399)' : (p.aiRate ?? 0) < AI_WEAK_BELOW ? 'var(--c-f87171)' : 'var(--c-f59e0b)', 'var(--c-2a2a40)', `GPT ${p.probe.gpt}`)}
                    </div>
                  ) : (
                    <span style={{ fontSize: '10.5px', color: 'var(--c-55557a)' }}>not probed (top-30 cap)</span>
                  )}
                  <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginTop: '2px' }}>
                    {p.scan
                      ? `AI answers · named in ${Math.round((p.dfsShare ?? 0) * 100)}% of ${p.scan.rows.length}${p.scan.totalCount > p.scan.fetched ? ` of ${p.scan.totalCount.toLocaleString()}` : ''} answers`
                      : 'AI answers · not scanned yet'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginBottom: '3px' }}>Search &amp; AI visibility</div>
                  {[['Search', sPct, 'var(--c-46cce0)'] as const, ['AI', aPct, 'var(--c-8b85ff)'] as const].map(([lab, v, col]) => (
                    <div key={lab} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 32px', gap: '5px', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--c-6a6a90)' }}>{lab}</span>
                      <span style={{ height: '6px', borderRadius: '3px', background: 'var(--c-1e1e34)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${v ?? 0}%`, background: col }} />
                      </span>
                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--c-8a8aa8)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v !== null ? `${v}%` : '—'}</span>
                    </div>
                  ))}
                  {gap === null
                    ? chip('transparent', 'var(--c-55557a)', 'var(--c-2a2a40)', 'NO AI DATA YET')
                    : gap >= 20 ? chip('var(--ca-108-99-255-0_12)', 'var(--c-9b96ff)', 'var(--ca-108-99-255-0_25)', `AI LAGS SEARCH −${gap}`)
                    : gap <= -20 ? chip('rgba(245,158,11,0.08)', 'var(--c-f59e0b)', 'rgba(245,158,11,0.3)', `SEARCH LAGS AI ${gap}`)
                    : chip('rgba(52,211,153,0.08)', 'var(--c-34d399)', 'rgba(52,211,153,0.3)', 'BALANCED')}
                </div>
                <div style={{ textAlign: 'center' }} title="You rank on page 1 of Google for these topics, but AI answers about them never mention you. The cheapest wins on the board — the hard part (earning the ranking) is already done.">
                  <div style={{ fontSize: '15px', fontWeight: 800, color: p.arbTopics > 0 ? 'var(--c-9b96ff)' : 'var(--c-55557a)', fontVariantNumeric: 'tabular-nums' }}>{p.arbTopics}</div>
                  <div style={{ fontSize: '9px', color: 'var(--c-6a6a90)', lineHeight: 1.25 }}>Google yes, AI no</div>
                </div>
              </div>

              {/* ── crosswalk (expanded) ── */}
              {isOpen && (
                <div style={{ border: '1px solid var(--ca-108-99-255-0_45)', borderTop: 'none', borderRadius: '0 0 10px 10px', background: 'var(--c-0a0a14)', padding: '14px 16px', marginBottom: '7px' }}>

                  {/* brand ladder + cited-domain ladder side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '9px', padding: '11px 13px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)', marginBottom: '8px' }}>
                        PAGE-1 VOLUME SHARE — MEASURED (v7.419 ladder basis)
                      </div>
                      {p.ladder.length === 0 && <div style={{ fontSize: '11px', color: 'var(--c-55557a)' }}>No brand holds page-1 volume on this category's keywords.</div>}
                      {p.ladder.slice(0, 6).map((e, i) => {
                        const pctOfCat = p.demand > 0 ? (e.p1Vol / p.demand) * 100 : 0;
                        const maxVol = p.ladder[0]?.p1Vol || 1;
                        return (
                          <div key={e.domain} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', fontSize: '11.5px' }}>
                            <span style={{ width: '12px', color: 'var(--c-55557a)', fontSize: '10px' }}>{i + 1}</span>
                            <span style={{ flex: '0 0 150px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              color: e.kind === 'client' ? 'var(--c-9b96ff)' : 'var(--c-c8c8e8)' }}>
                              {e.kind === 'client' ? `${e.domain} (you)` : e.domain}
                            </span>
                            <span style={{ flex: 1, height: '7px', borderRadius: '4px', background: 'var(--c-1e1e34)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', height: '100%', width: `${(e.p1Vol / maxVol) * 100}%`,
                                background: e.kind === 'client' ? 'var(--c-6c63ff)' : e.kind === 'tracked' ? 'var(--c-46cce0)' : 'var(--c-f59e0b)' }} />
                            </span>
                            <span style={{ width: '46px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: e.kind === 'client' ? 'var(--c-9b96ff)' : 'var(--c-c8c8e8)' }}>{pctOfCat.toFixed(1)}%</span>
                            <span style={{ width: '86px', textAlign: 'right', fontSize: '9px', color: 'var(--c-55557a)' }}>rank data: {e.measuredKw}/{p.kwCount} kw</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '9px', padding: '11px 13px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)', marginBottom: '8px' }}>
                        WHO GETS CITED IN RECORDED AI ANSWERS {p.scan ? `— ${p.scan.rows.length} answers` : ''}
                      </div>
                      {!p.scan && <div style={{ fontSize: '11px', color: 'var(--c-55557a)' }}>Not scanned yet — run "Scan recorded AI answers" above.</div>}
                      {p.scan && p.citedTop.length === 0 && <div style={{ fontSize: '11px', color: 'var(--c-55557a)' }}>The recorded answers for this category carry no cited sources.</div>}
                      {p.citedTop.slice(0, 6).map((c, i) => {
                        const max = p.citedTop[0]?.count || 1;
                        return (
                          <div key={c.domain} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px', fontSize: '11.5px' }}>
                            <span style={{ width: '12px', color: 'var(--c-55557a)', fontSize: '10px' }}>{i + 1}</span>
                            <span style={{ flex: '0 0 150px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: c.isClient ? 'var(--c-9b96ff)' : 'var(--c-c8c8e8)' }}>
                              {c.isClient ? `${c.domain} (you)` : c.domain}
                            </span>
                            <span style={{ flex: 1, height: '7px', borderRadius: '4px', background: 'var(--c-1e1e34)', overflow: 'hidden' }}>
                              <span style={{ display: 'block', height: '100%', width: `${(c.count / max) * 100}%`, background: c.isClient ? 'var(--c-6c63ff)' : 'var(--c-f59e0b)' }} />
                            </span>
                            <span style={{ width: '56px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c-c8c8e8)' }}>{c.count}×</span>
                          </div>
                        );
                      })}
                      {p.scan && !p.citedTop.some(c => c.isClient) && p.citedTop.length > 0 && (
                        <div style={{ marginTop: '7px', fontSize: '10.5px', color: 'var(--c-f87171)' }}>
                          Your domain is cited 0 times across these recorded answers.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* topic crosswalk */}
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)', margin: '2px 0 6px' }}>
                    TOPIC CROSSWALK — YOUR RANK vs THIS CATEGORY'S AI VISIBILITY
                    <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--c-55557a)' }}>
                      {'  '}· verdicts combine each topic's measured best rank with the CATEGORY-level AI bases (thresholds: weak &lt; {AI_WEAK_BELOW * 100}%, strong ≥ {AI_STRONG_FROM * 100}%)
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.5fr) 64px 78px 90px 170px', gap: '10px', padding: '0 10px 4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-55557a)' }}>
                    <span>TOPIC · YOUR PAGE</span><span>BEST RANK</span><span>DEMAND/MO</span><span>STAGE</span><span>VERDICT</span>
                  </div>
                  {(() => {
                    const rowsAll = buildTopicRows(p);   // v7.429: the shared builder — same rows the KPI drill-down lists
                    const shown = showAllTopics ? rowsAll : rowsAll.slice(0, 12);
                    return (
                      <>
                        {shown.map(({ t, best, v }) => (
                          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1.5fr) 64px 78px 90px 170px', gap: '10px', alignItems: 'center',
                            background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '8px', padding: '8px 10px', marginBottom: '5px' }}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-e8e8ff)' }}>{t.product || t.parentName}</div>
                              <div style={{ fontSize: '9.5px', color: best.url ? 'var(--c-6a6a90)' : 'var(--c-f87171)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {best.url ? best.url.replace(/^https?:\/\/[^/]*/, '') || '/' : (best.pos !== null ? 'ranking URL not in source rows' : 'no ranking page')}
                                {' '}· {t.keywords.length} kw
                              </div>
                            </div>
                            <div>
                              {best.pos !== null
                                ? chip('transparent', best.pos <= 3 ? 'var(--c-34d399)' : best.pos <= 10 ? 'var(--c-46cce0)' : best.pos <= 20 ? 'var(--c-f59e0b)' : 'var(--c-f87171)', 'var(--c-2a2a40)', `#${best.pos}`)
                                : chip('transparent', 'var(--c-55557a)', 'var(--c-2a2a40)', '—')}
                            </div>
                            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-c8c8e8)', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(t.totalVolume)}</div>
                            <div style={{ fontSize: '10px', color: 'var(--c-8a8aa8)' }}>{t.stage}</div>
                            <div>{VERDICT_CHIP[v]()}</div>
                          </div>
                        ))}
                        {rowsAll.length > 12 && (
                          <button onClick={() => setShowAllTopics(s => !s)} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-9b96ff)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 10px 8px' }}>
                            {showAllTopics ? 'Show fewer topics' : `Show all ${rowsAll.length} topics`}
                          </button>
                        )}
                      </>
                    );
                  })()}

                  {/* prompt drawer: probe prompts + recorded questions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                    <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '9px', padding: '11px 13px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)', marginBottom: '7px' }}>
                        LLM PROBE PROMPTS — THIS CATEGORY (analysis-time, unbranded)
                      </div>
                      {(() => {
                        const res: any[] = ((analysis?.llmProbe as any)?.results ?? [])
                          .filter((r: any) => normName(String(r?.category ?? '')) === normName(p.name) && !r?.branded);
                        if (res.length === 0) return <div style={{ fontSize: '11px', color: 'var(--c-55557a)' }}>No probe prompts for this category (the probe covers the top 30 categories by demand).</div>;
                        return res.map((r: any) => (
                          <div key={r.id} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--c-14142a)', fontSize: '11.5px' }}>
                            <span style={{ flex: 1, color: 'var(--c-c8c8e8)' }}>{r.prompt}</span>
                            <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--c-55557a)' }}>{r.platform === 'claude' ? 'Claude' : 'GPT'}</span>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: r.mentioned ? 'var(--c-34d399)' : 'var(--c-f87171)' }}>{r.mentioned ? '✓ mentioned' : '✕ absent'}</span>
                          </div>
                        ));
                      })()}
                    </div>
                    <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '9px', padding: '11px 13px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)', marginBottom: '7px' }}>
                        RECORDED AI QUESTIONS — DataForSEO LLM Mentions
                        {p.scan && p.scan.totalCount > p.scan.fetched && (
                          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--c-f59e0b)' }}> · showing {p.scan.fetched} of {p.scan.totalCount.toLocaleString()} matches</span>
                        )}
                      </div>
                      {!p.scan && <div style={{ fontSize: '11px', color: 'var(--c-55557a)' }}>Not scanned yet.</div>}
                      {p.scan && (() => {
                        const rows = showAllPrompts ? p.scan.rows : p.scan.rows.slice(0, 10);
                        return (
                          <>
                            {rows.map((r, i) => {
                              const named = rowNamesClient(r, clientNorm, brandToks);
                              const cited = r.sources.slice(0, 3).map(s => s.domain).join(', ');
                              return (
                                <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid var(--c-14142a)', fontSize: '11.5px' }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                    <span style={{ flex: 1, color: 'var(--c-c8c8e8)' }}>{r.question}</span>
                                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--c-55557a)', whiteSpace: 'nowrap' }}>{r.platform === 'google' ? 'AI Overview' : 'ChatGPT'}</span>
                                    <span style={{ fontSize: '10px', fontWeight: 800, whiteSpace: 'nowrap', color: named ? 'var(--c-34d399)' : 'var(--c-f87171)' }}>{named ? '✓ you' : '✕ absent'}</span>
                                  </div>
                                  <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginTop: '1px' }}>
                                    {cited ? <>cites: {cited}</> : 'no cited sources recorded'}
                                    {r.aiSearchVolume !== null && (
                                      <span title="DataForSEO's ai_search_volume — an ESTIMATED metric from their PAA-based algorithm, not measured demand (labeled per Const I.5a)">
                                        {' '}· AI vol {fmtVol(r.aiSearchVolume)} <span style={{ fontWeight: 800, color: 'var(--c-f59e0b)' }}>EST</span>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {p.scan.rows.length > 10 && (
                              <button onClick={() => setShowAllPrompts(s => !s)} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-9b96ff)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0 0' }}>
                                {showAllPrompts ? 'Show fewer' : `Show all ${p.scan.rows.length} fetched questions`}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── methodology / basis footnote ── */}
        {!loading && products.length > 0 && (
          <div style={{ marginTop: '16px', padding: '11px 14px', borderRadius: '9px', background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', fontSize: '10.5px', color: 'var(--c-8a8aa8)', lineHeight: 1.6 }}>
            <b style={{ color: 'var(--c-c8c8e8)' }}>Where these numbers come from.</b>{' '}
            Search side: the canonical keyword pool + stored taxonomy (same basis as the Keyword/Cluster panels; membership read, never re-derived) — page-1 share is measured volume at positions 1–10; the brand ladder is the v7.419 measured page-1 volume method (uploaded competitor rows + Semrush SERP rivals, no CTR model).
            AI side, two labeled bases never blended: the analysis-time LLM probe (5 unbranded Claude + 5 unbranded GPT prompts per category, top-30 categories by demand) and recorded AI answers from DataForSEO LLM Mentions (real ChatGPT + Google-AI-Overview answers; US/English index).
            Verdicts are fixed threshold rules over those numbers (weak &lt; {AI_WEAK_BELOW * 100}%, strong ≥ {AI_STRONG_FROM * 100}%) — deterministic, no model in the loop.
            "AI vol" on recorded questions is DataForSEO's <b style={{ color: 'var(--c-f59e0b)' }}>estimated</b> ai_search_volume metric (labeled EST), never measured demand. Scan cost is the measured per-task cost DataForSEO reports, recorded on the API Usage ledger.
          </div>
        )}
      </div>
    </div>
  );
}
