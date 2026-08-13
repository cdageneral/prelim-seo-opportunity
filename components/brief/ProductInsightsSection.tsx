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
import InsightBanner from './InsightBanner';
import { exportProductInsightTopicsXLSX, type ProductInsightTopicRow } from '@/lib/export/productInsightsExport';   // v7.429
import type { Insight, InsightSeg } from '@/lib/insights';
// v7.430: the aggregation lives in the ONE shared basis module (Const II.7) so the
// Assessment PDF reads the same computation this panel renders (II.6a/II.6b).
import {
  buildProductRows, buildBrandTokens, buildCategoryToUmbrella, probeResultsForUmbrella,
  buildTopicRows, topicVerdict, rowNamesClient, AI_WEAK_BELOW, AI_STRONG_FROM,
  buildCategoryTree, flattenNodes, buildPromptBreakdown, buildPlatformMix,
  PLATFORM_LABEL,
  type TopicVerdict, type TopicRow, type StoredCatScan, type ProductRow, type CatNode,
} from '@/lib/productInsights';
// Re-exported so the v7.426/v7.429 consumers of this file (retained suite, any import
// of the shared row builder) keep working unchanged (V.6).
export { buildTopicRows, topicVerdict, AI_WEAK_BELOW, AI_STRONG_FROM } from '@/lib/productInsights';
export type { TopicVerdict, TopicRow } from '@/lib/productInsights';

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

// ─── Small helpers ───────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}
const seg = (t: string, em = false): InsightSeg => ({ t, em });

function normName(s: string): string { return s.toLowerCase().trim(); }

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
  // v7.432: sub-category drill — expanded node keys + the node currently being scanned
  const [openNodes, setOpenNodes]     = useState<Set<string>>(new Set());
  const [nodeScanning, setNodeScanning] = useState<string | null>(null);
  const [nodeConfirm, setNodeConfirm] = useState<string | null>(null);
  const [openKwAll, setOpenKwAll]     = useState<Set<string>>(new Set());   // v7.433: per-node keyword list expanded
  const [promptView, setPromptView]   = useState<Record<string, 'cited' | 'named' | 'absent' | 'urls' | null>>({});   // v7.434

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
  const brandToks  = useMemo(() => buildBrandTokens(domain, brandTerms), [domain, brandTerms]);
  const catToUmb   = useMemo(
    () => buildCategoryToUmbrella((analysis?.semrushSnapshot as any)?._categoryBreakdown),
    [analysis],
  );

  // ── canonical topics (the shared basis — Const II.7, unfloored 0,0) ──
  const topics: Topic[] = useMemo(() => {
    if (!analysis || uploadedKeywords === null) return [];
    try {
      return buildCanonicalClusterTopics(analysis, domain, competitors, uploadedKeywords ?? [], claudeAssigns, 0, 0);
    } catch { return []; }
  }, [analysis, domain, competitors, uploadedKeywords, claudeAssigns]);

  // ── the shared basis (Const II.7): same call the Assessment PDF makes ──
  const built = useMemo(() => buildProductRows({
    topics,
    uploadedKeywords: uploadedKeywords ?? [],
    serpPositions: ((analysis?.semrushSnapshot as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
    llmProbe: (analysis as any)?.llmProbe ?? null,
    storedScans: (stored?.categories ?? []) as StoredCatScan[],
    clientDomain: domain,
    brandTerms,
    breakdown: (analysis?.semrushSnapshot as any)?._categoryBreakdown,
  }), [topics, uploadedKeywords, analysis, stored, domain, brandTerms]);
  const products = built.products;

  // v7.432: the stored-path tree for the OPEN product line (built on demand — the
  // whole taxonomy for every product at once is wasted work when one is expanded).
  const openTree = useMemo(() => {
    if (!openProduct || uploadedKeywords === null) return null;
    const p = built.products.find(x => x.name === openProduct);
    if (!p) return null;
    const poolKeywords: Array<{ keyword: string; searchVolume: number; position: number | null; url?: string;
      origin?: 'footprint' | 'demand'; isGap?: boolean }> = [];
    const seen = new Set<string>();
    for (const t of p.topics) for (const k of t.keywords as any[]) {
      const kk = String(k?.keyword ?? '').toLowerCase().trim();
      if (!kk || seen.has(kk)) continue;
      seen.add(kk);
      poolKeywords.push({ keyword: kk, searchVolume: k.searchVolume || 0, position: k.position ?? null, url: k.url,
        // v7.435: carried through untouched — same fields, same pool, as the Keyword list panel
        origin: (k as any)?.origin === 'demand' ? 'demand' : 'footprint', isGap: !!(k as any)?.isGap });
    }
    try {
      return buildCategoryTree(p.name, {
        breakdown: (analysis?.semrushSnapshot as any)?._categoryBreakdown,
        poolKeywords,
        uploadedKeywords: uploadedKeywords ?? [],
        serpPositions: ((analysis?.semrushSnapshot as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
        storedScans: (stored?.categories ?? []) as StoredCatScan[],
        clientDomain: domain,
        brandTerms,
      });
    } catch { return null; }
  }, [openProduct, built, analysis, uploadedKeywords, stored, domain, brandTerms]);

  // ── KPI totals + headline insight ──
  const kpi = built.kpi;

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
  // v7.432: scan ONE node (any depth). The scan is stored under the node's own
  // key, so a sub-category carries its own recorded answers — never the parent's.
  const runNodeScan = useCallback(async (node: CatNode) => {
    setNodeConfirm(null);
    setNodeScanning(node.key);
    try {
      const res = await fetch(`/api/projects/${projectId}/product-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: node.key, keyword: node.name.toLowerCase() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setScanErrors(prev => [...prev, `${node.name}: ${d?.error ?? `HTTP ${res.status}`}`]);
      }
    } catch (e: any) {
      setScanErrors(prev => [...prev, `${node.name}: ${e?.message ?? 'request failed'}`]);
    }
    await refreshStored();
    setNodeScanning(null);
  }, [projectId, refreshStored]);

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
              Two live requests per category — one for Google AI Overviews and one for ChatGPT — up to 100 recorded answers each (the API's own page size; the full match count is shown after the scan).
              Scanning per platform is deliberate: unfiltered, a high-volume category filled all 100 rows with AI Overviews and left ChatGPT unmeasured.
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

                  {/* ── v7.432: sub-category drill — every stored level, its own measured metrics ── */}
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)', margin: '2px 0 6px' }}>
                    SUB-CATEGORY DRILL — SEARCH MEASURED AT EVERY LEVEL
                    <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'var(--c-55557a)' }}>
                      {'  '}· expand ANY row for its keywords, positions and volumes · AI is measured per level, never inherited from the parent
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.6fr) 84px 128px 150px 132px 118px', gap: '10px', padding: '0 10px 4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-55557a)' }}>
                    <span>SUB-CATEGORY</span><span>DEMAND/MO</span><span>SEARCH · PAGE 1</span><span>WHO LEADS PAGE 1</span><span>AI ANSWERS</span><span>ACTION</span>
                  </div>
                  {!openTree && (
                    <div style={{ fontSize: '11.5px', color: 'var(--c-8a8aa8)', padding: '8px 10px' }}>
                      This analysis carries no stored category paths, so no sub-category level exists to measure (honest gap — nothing is inferred from keyword text).
                    </div>
                  )}
                  {openTree && openTree.children.length === 0 && (
                    <div style={{ fontSize: '11.5px', color: 'var(--c-8a8aa8)', padding: '8px 10px' }}>
                      This product line has no sub-categories in the stored taxonomy.
                    </div>
                  )}
                  {openTree && (() => {
                    const rowsOut: JSX.Element[] = [];
                    const render = (node: CatNode) => {
                      const isOpen = openNodes.has(node.key);
                      const leader = node.ladder[0] ?? null;
                      const sPct = Math.round(node.p1Share * 100);
                      const scanning = nodeScanning === node.key;
                      const confirming = nodeConfirm === node.key;
                      rowsOut.push(
                        <div key={node.key}>
                          <div
                            onClick={() => setOpenNodes(prev => { const n = new Set(prev); if (n.has(node.key)) n.delete(node.key); else n.add(node.key); return n; })}
                            style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1.6fr) 84px 128px 150px 132px 118px', gap: '10px', alignItems: 'center',
                              background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '8px',
                              padding: '8px 10px', marginBottom: '5px', marginLeft: `${(node.depth - 1) * 18}px`,
                              cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                              {/* v7.433: EVERY level opens — a leaf has no children but it does have
                                  keywords, and those are the point of the drill. */}
                              <span style={{ color: isOpen ? 'var(--c-9b96ff)' : 'var(--c-55557a)', fontSize: '10px', flexShrink: 0 }}>
                                {isOpen ? '▼' : '▶'}
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-e8e8ff)' }}>{node.name}</div>
                                <div style={{ fontSize: '9.5px', color: node.bestUrl ? 'var(--c-6a6a90)' : 'var(--c-55557a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {node.bestUrl ? node.bestUrl.replace(/^https?:\/\/[^/]*/, '') || '/' : (node.bestPos !== null ? 'ranking URL not in source rows' : 'no ranking page')}
                                  {' '}· {node.kwCount.toLocaleString()} kw{node.children.length > 0 ? ` · ${node.children.length} sub` : ''}
                                </div>
                              </div>
                            </div>
                            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--c-c8c8e8)', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(node.demand)}</div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: 800, width: '34px', fontVariantNumeric: 'tabular-nums',
                                  color: sPct >= 50 ? 'var(--c-34d399)' : sPct >= 25 ? 'var(--c-f59e0b)' : 'var(--c-f87171)' }}>{sPct}%</span>
                                <span style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--c-1e1e34)', overflow: 'hidden' }}>
                                  <span style={{ display: 'block', height: '100%', width: `${sPct}%`, background: 'var(--c-46cce0)' }} />
                                </span>
                              </div>
                              <div style={{ fontSize: '9px', color: 'var(--c-6a6a90)', marginTop: '1px' }}>
                                {node.bestPos !== null ? `best rank #${node.bestPos}` : 'not ranked'}
                              </div>
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--c-8a8aa8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {leader
                                ? (leader.kind === 'client'
                                    ? <span style={{ color: 'var(--c-9b96ff)', fontWeight: 700 }}>You · {((leader.p1Vol / Math.max(node.demand, 1)) * 100).toFixed(1)}%</span>
                                    : <>{leader.domain} · {((leader.p1Vol / Math.max(node.demand, 1)) * 100).toFixed(1)}%{node.clientRank !== null ? ` · you #${node.clientRank}` : ''}</>)
                                : 'no page-1 holds'}
                            </div>
                            <div style={{ fontSize: '10.5px' }}>
                              {node.scan
                                ? <span style={{ color: (node.dfsShare ?? 0) >= AI_STRONG_FROM ? 'var(--c-34d399)' : (node.dfsShare ?? 0) < AI_WEAK_BELOW ? 'var(--c-f87171)' : 'var(--c-f59e0b)', fontWeight: 700 }}>
                                    named in {Math.round((node.dfsShare ?? 0) * 100)}% of {node.scan.rows.length}
                                    <span style={{ display: 'block', fontWeight: 400, color: 'var(--c-6a6a90)', fontSize: '9px' }}>
                                      {buildPlatformMix(node.scan, domain, brandTerms).map(m => `${m.rows} ${m.label}`).join(' · ')}
                                    </span>
                                  </span>
                                : <span style={{ color: 'var(--c-55557a)' }}>AI not measured at this level</span>}
                            </div>
                            <div onClick={e => e.stopPropagation()}>
                              {scanning
                                ? <span style={{ fontSize: '10px', color: 'var(--c-9b96ff)', fontWeight: 700 }}>Scanning…</span>
                                : confirming
                                  ? (
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                      <button onClick={() => void runNodeScan(node)} title="Two live DataForSEO LLM Mentions requests for this sub-category — one for Google AI Overviews, one for ChatGPT, so neither platform is left unmeasured. Measured cost lands on the API Usage ledger."
                                        style={{ fontSize: '10px', fontWeight: 700, padding: '3px 7px', borderRadius: '6px', cursor: 'pointer', background: 'var(--ca-108-99-255-0_12)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_45)' }}>Run both platforms · ~$0.20</button>
                                      <button onClick={() => setNodeConfirm(null)} style={{ fontSize: '10px', padding: '3px 6px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>✕</button>
                                    </div>
                                  )
                                  : <button onClick={() => setNodeConfirm(node.key)} disabled={!providerOk}
                                      title={providerOk ? 'Measure recorded AI answers for THIS sub-category' : 'DataForSEO is not configured'}
                                      style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', cursor: providerOk ? 'pointer' : 'not-allowed',
                                        background: 'transparent', color: node.scan ? 'var(--c-8a8aa8)' : 'var(--c-9b96ff)', border: '1px solid var(--c-2a2a40)' }}>
                                      {node.scan ? '↻ Re-scan AI' : '＋ Scan AI'}
                                    </button>}
                            </div>
                          </div>
                          {/* v7.433: the keywords behind this level — position, volume, ranking page */}
                          {isOpen && (() => {
                            const own = node.kws.length > 0 ? node.kws : node.allKws;
                            const showAll = openKwAll.has(node.key);
                            const shown = showAll ? own : own.slice(0, 15);
                            const ranked = own.filter(k => k.position !== null && k.position <= 10).length;
                            return (
                              <div style={{ marginLeft: `${node.depth * 18}px`, marginBottom: '5px', padding: '9px 11px', background: 'var(--c-0a0a14)', border: '1px solid var(--c-14142a)', borderRadius: '8px' }}>
                                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-6a6a90)', marginBottom: '6px' }}>
                                  KEYWORDS AT THIS LEVEL — {own.length.toLocaleString()}{node.kws.length === 0 ? ' (rolled up from sub-levels)' : ''} · {ranked.toLocaleString()} ON PAGE 1
                                </div>
                                <div style={{ fontSize: '9px', color: 'var(--c-55557a)', marginBottom: '5px' }}>
                                  Keyword, position, volume and ranking page come from the same keyword pool the Keyword list panel renders — nothing is re-derived here.
                                </div>
                                {own.length === 0 && <div style={{ fontSize: '11px', color: 'var(--c-55557a)' }}>No keywords are filed at this level.</div>}
                                {own.length > 0 && (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,2fr) 58px 74px minmax(150px,1.4fr)', gap: '8px', padding: '0 2px 3px', fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--c-55557a)' }}>
                                    <span>KEYWORD</span><span>POSITION</span><span>VOLUME/MO</span><span>YOUR RANKING PAGE</span>
                                  </div>
                                )}
                                {shown.map(k => (
                                  <div key={k.keyword} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,2fr) 58px 74px minmax(150px,1.4fr)', gap: '8px', alignItems: 'center', padding: '3px 2px', borderBottom: '1px solid var(--c-111120)', fontSize: '11px' }}>
                                    <span style={{ color: 'var(--c-c8c8e8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {k.keyword}
                                      {/* v7.435: the same provenance chips the Keyword list panel shows, so an
                                          "unranked" row says WHY there is no position instead of implying a checked miss. */}
                                      {k.origin === 'demand' && (
                                        <span title="Surfaced by the deep-journey demand build — there is no client ranking row for this keyword, so no position exists to show"
                                          style={{ marginLeft: '6px', fontSize: '8.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '999px', background: 'var(--ca-34-211-238-0_1)', color: 'var(--c-46cce0)', border: '1px solid var(--ca-34-211-238-0_2)' }}>demand</span>
                                      )}
                                      {k.origin !== 'demand' && k.isGap && (
                                        <span title="A competitor holds this keyword and your ranking export does not"
                                          style={{ marginLeft: '6px', fontSize: '8.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '999px', background: 'var(--ca-245-158-11-0_10)', color: 'var(--c-f59e0b)', border: '1px solid var(--ca-245-158-11-0_25)' }}>gap</span>
                                      )}
                                    </span>
                                    <span style={{ fontWeight: 800, fontSize: '10.5px',
                                      color: k.position === null ? 'var(--c-55557a)' : k.position <= 3 ? 'var(--c-34d399)' : k.position <= 10 ? 'var(--c-46cce0)' : k.position <= 20 ? 'var(--c-f59e0b)' : 'var(--c-f87171)' }}>
                                      {k.position === null ? 'unranked' : `#${k.position}`}
                                    </span>
                                    <span style={{ fontWeight: 700, color: 'var(--c-c8c8e8)', fontVariantNumeric: 'tabular-nums' }}>{k.searchVolume.toLocaleString()}</span>
                                    <span style={{ fontSize: '9.5px', color: k.url ? 'var(--c-6a6a90)' : 'var(--c-55557a)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {k.url ? k.url.replace(/^https?:\/\/[^/]*/, '') || '/' : (k.position !== null ? 'URL not in source rows' : '—')}
                                    </span>
                                  </div>
                                ))}
                                {own.length > 15 && (
                                  <button onClick={e => { e.stopPropagation(); setOpenKwAll(prev => { const n = new Set(prev); if (n.has(node.key)) n.delete(node.key); else n.add(node.key); return n; }); }}
                                    style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--c-9b96ff)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '5px 0 0' }}>
                                    {showAll ? 'Show fewer keywords' : `Show all ${own.length.toLocaleString()} keywords`}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                          {isOpen && node.scan && (() => {
                            const pb = buildPromptBreakdown(node.scan, domain, brandTerms);
                            if (!pb) return null;
                            const view = promptView[node.key] ?? null;
                            const setView = (v: typeof view) => setPromptView(prev => ({ ...prev, [node.key]: prev[node.key] === v ? null : v }));
                            const tab = (v: Exclude<typeof view, null>, label: string, n: number, col: string) => (
                              <button onClick={e => { e.stopPropagation(); setView(v); }}
                                style={{ fontSize: '10.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
                                  background: view === v ? 'var(--ca-108-99-255-0_12)' : 'transparent', color: col,
                                  border: `1px solid ${view === v ? 'var(--ca-108-99-255-0_45)' : 'var(--c-2a2a40)'}` }}>
                                {label} {n}
                              </button>
                            );
                            const shown = view && view !== 'urls' ? pb.rows.filter(r => r.bucket === view) : [];
                            return (
                              <div style={{ marginLeft: `${node.depth * 18}px`, marginBottom: '5px', padding: '9px 11px', background: 'var(--c-0a0a14)', border: '1px solid var(--c-14142a)', borderRadius: '8px' }}>
                                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-6a6a90)', marginBottom: '4px' }}>
                                  RECORDED AI ANSWERS FOR “{node.name.toUpperCase()}” — {pb.counts.total}
                                </div>
                                {/* v7.435: the platform split, stated — an AI Overview figure is not a ChatGPT figure */}
                                {(() => {
                                  const mix = buildPlatformMix(node.scan, domain, brandTerms);
                                  const missing = ['google', 'chat_gpt'].filter(pf => !mix.some(m => m.platform === pf));
                                  return (
                                    <div style={{ fontSize: '10px', color: 'var(--c-8a8aa8)', marginBottom: '7px', lineHeight: 1.5 }}>
                                      {mix.map(m => (
                                        <span key={m.platform} style={{ marginRight: '10px' }}>
                                          <b style={{ color: 'var(--c-c8c8e8)' }}>{m.label}</b>: {m.rows} answer{m.rows === 1 ? '' : 's'}
                                          {m.total !== null && m.total > m.rows ? ` of ${m.total.toLocaleString()}` : ''} · cited {m.cited}
                                          {m.failed ? ' · request failed — unmeasured' : ''}
                                        </span>
                                      ))}
                                      {missing.length > 0 && (
                                        <span style={{ color: 'var(--c-f59e0b)' }}>
                                          {missing.map(pf => PLATFORM_LABEL[pf]).join(' + ')} not measured on this scan — re-scan to include {missing.length > 1 ? 'them' : 'it'}.
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                  {tab('cited', 'You are cited', pb.counts.cited, 'var(--c-34d399)')}
                                  {tab('named', 'Named, not cited', pb.counts.named, 'var(--c-f59e0b)')}
                                  {tab('absent', 'Absent', pb.counts.absent, 'var(--c-f87171)')}
                                  {pb.byUrl.length > 0 && tab('urls', 'By your page', pb.byUrl.length, 'var(--c-9b96ff)')}
                                </div>
                                {view === null && (
                                  <div style={{ fontSize: '10.5px', color: 'var(--c-8a8aa8)' }}>
                                    {pb.counts.cited} of {pb.counts.total} answers cite one of your pages; {pb.counts.named} name the brand without linking to you. Pick a bucket to read the prompts.
                                  </div>
                                )}
                                {view === 'urls' && pb.byUrl.map(u => (
                                  <div key={u.url} style={{ padding: '5px 0', borderBottom: '1px solid var(--c-111120)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-9b96ff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {u.url} <span style={{ color: 'var(--c-6a6a90)', fontWeight: 400 }}>· cited by {u.prompts.length} prompt{u.prompts.length === 1 ? '' : 's'}</span>
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--c-8a8aa8)', marginTop: '2px', lineHeight: 1.5 }}>{u.prompts.join(' · ')}</div>
                                  </div>
                                ))}
                                {view && view !== 'urls' && shown.length === 0 && (
                                  <div style={{ fontSize: '10.5px', color: 'var(--c-55557a)' }}>No recorded answers in this bucket.</div>
                                )}
                                {view && view !== 'urls' && shown.slice(0, 25).map((r, i) => (
                                  <div key={`${r.question}-${i}`} style={{ padding: '4px 0', borderBottom: '1px solid var(--c-111120)' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                      <span style={{ flex: 1, fontSize: '11.5px', color: 'var(--c-c8c8e8)' }}>{r.question}</span>
                                      <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--c-55557a)', whiteSpace: 'nowrap' }}>{r.platform === 'google' ? 'AI Overview' : 'ChatGPT'}</span>
                                    </div>
                                    <div style={{ fontSize: '9.5px', color: 'var(--c-6a6a90)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {r.bucket === 'cited' && r.ownedUrls.length > 0
                                        ? <span style={{ color: 'var(--c-34d399)' }}>cites your {r.ownedUrls.join(', ')}</span>
                                        : <>cites: {r.cites.length > 0 ? r.cites.slice(0, 4).join(', ') : 'no sources recorded'}</>}
                                    </div>
                                  </div>
                                ))}
                                {view && view !== 'urls' && shown.length > 25 && (
                                  <div style={{ fontSize: '10px', color: 'var(--c-6a6a90)', marginTop: '5px' }}>Showing 25 of {shown.length} — the full set is in the stored scan.</div>
                                )}
                              </div>
                            );
                          })()}
                          {isOpen && node.scan && node.citedTop.length > 0 && (
                            <div style={{ marginLeft: `${node.depth * 18}px`, marginBottom: '5px', padding: '8px 11px', background: 'var(--c-0a0a14)', border: '1px solid var(--c-14142a)', borderRadius: '8px' }}>
                              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-6a6a90)', marginBottom: '5px' }}>
                                WHO GETS CITED FOR “{node.name.toUpperCase()}” — {node.scan.rows.length} RECORDED ANSWERS
                              </div>
                              {node.citedTop.slice(0, 5).map((c, i) => (
                                <div key={c.domain} style={{ display: 'flex', gap: '7px', alignItems: 'center', fontSize: '11px', marginBottom: '3px' }}>
                                  <span style={{ width: '10px', color: 'var(--c-55557a)', fontSize: '9.5px' }}>{i + 1}</span>
                                  <span style={{ flex: '0 0 150px', fontWeight: 600, color: c.isClient ? 'var(--c-9b96ff)' : 'var(--c-c8c8e8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {c.isClient ? `${c.domain} (you)` : c.domain}
                                  </span>
                                  <span style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--c-1e1e34)', overflow: 'hidden' }}>
                                    <span style={{ display: 'block', height: '100%', width: `${(c.count / Math.max(1, node.citedTop[0].count)) * 100}%`, background: c.isClient ? 'var(--c-6c63ff)' : 'var(--c-f59e0b)' }} />
                                  </span>
                                  <span style={{ width: '42px', textAlign: 'right', fontWeight: 700, color: 'var(--c-c8c8e8)' }}>{c.count}×</span>
                                </div>
                              ))}
                              {!node.citedTop.some(c => c.isClient) && (
                                <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--c-f87171)' }}>You are cited 0 times in this sub-category&apos;s recorded answers.</div>
                              )}
                            </div>
                          )}
                        </div>,
                      );
                      if (isOpen) for (const c of node.children) render(c);
                    };
                    for (const c of openTree.children) render(c);
                    return <>{rowsOut}</>;
                  })()}

                  {/* prompt drawer: probe prompts + recorded questions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                    <div style={{ background: 'var(--c-111120)', border: '1px solid var(--c-1e1e34)', borderRadius: '9px', padding: '11px 13px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', color: 'var(--c-6a6a90)', marginBottom: '7px' }}>
                        LLM PROBE PROMPTS — THIS CATEGORY (analysis-time, unbranded)
                      </div>
                      {(() => {
                        // v7.430: prompts roll up to the umbrella through the STORED taxonomy (II.8)
                        const res: any[] = probeResultsForUmbrella((analysis as any)?.llmProbe, p.name, catToUmb);
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
