'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { buildKwPool, computeVolumeMetrics } from '@/lib/utils/kwVolume';
import { SovPanel, computeSov } from '@/components/brief/GoogleSerpSection';   // v7.385: ctrAt dropped with the quick-wins ladder
import { buildClusters, journeyLaneSummary } from '@/components/brief/JourneySection';
// v7.279: Coverage-gap card reads the SAME canonical content-map build the Content
// Map panel (05) renders — buildCanonicalClusterTopics → buildContentPlanFromTopics
// — so the exec card's net-new topic count + volume reconcile to that panel (II.6/II.7).
import { buildCanonicalClusterTopics, type IntentType } from '@/components/brief/ThemeClustersPanel';
import { buildContentPlanFromTopics, planFromSnapshot, brandTermsOf } from '@/lib/journey/contentPlan';   // v7.356: brandTermsOf
import { probeAnchorInsight, aiWhitespaceInsight, execKeyInsights, EXEC_INSIGHT_SECTIONS, type ExecKeyInsight } from '@/lib/insights';   // v7.366 (A6 · A8, adopted into the rail in v7.384) · v7.382 (Key Insights) · v7.383 (rail sections)
import { CTR_SOURCE_LABEL } from '@/lib/sov/model';   // v7.382: the ONE approved curve, named on screen (Const I.5a)
// v7.337 (QC audit B4-proper, Const II.6/II.7): live SERP-feature roll-up — the SAME
// shared builders the SERP Features panel (07) computes from, instead of the stored
// analysis.aioAvailable/aioAcquired + serpFeatureSummary columns (stale after scans).
import { computeSerpFeatureRollup, normDomain as serpNormDomain } from '@/lib/serp/featurePool';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SemKw {
  keyword:      string;
  position:     number | null;
  searchVolume: number;
  branded?:     boolean;
}

interface DbKeyword {
  id:           number;
  projectId:    string;
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  type:         string;
  branded:      boolean;
  source:       string;
}

interface Opportunity {
  id?:      string;
  rank:     number;
  category: string;
  title:    string;
  summary:  string;
}

interface Props {
  analysis:                any;
  projectId:               string;
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  projectName?:            string;
  clientDomain?:           string;
  manualDomains?:          string[];
  defaultClientThreshold?:     number;
  defaultCompetitorThreshold?: number;
  // v7.279: the page-lifted Claude intent map — threaded so the exec coverage-gap
  // card builds canonical content-map topics with the SAME map the Content Map
  // panel uses (the builder under-counts when fed {}; II.7).
  claudeAssigns?:          Record<string, IntentType>;
  // v7.382 (UX review rec F5): the KPI cards become click-through — each opens the deep
  // panel it rolls up from. Optional, so the component still renders standalone (report
  // route, harness) with the cards as plain, non-interactive cards.
  onNavigate?:             (section: string) => void;
}

// ─── Helpers (mirrors GoogleSerpSection exactly) ──────────────────────────────

function buildPositionDist(kws: SemKw[]): Record<string, number> {
  const dist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const kw of kws) {
    const pos = kw.position;
    if (pos === null) continue;
    if (pos <= 3)       dist['1-3']++;
    else if (pos <= 10) dist['4-10']++;
    else if (pos <= 20) dist['11-20']++;
    else                dist['21+']++;
  }
  return dist;
}

function fmtAnnual(monthly: number): string {
  const a = monthly * 12;
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000)     return `${(a / 1_000).toFixed(0)}K`;
  return String(Math.round(a));
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function normDomain(d: string): string {
  return d.toLowerCase().replace(/^www\./, '');
}


// ─── v7.312: AI Answer Engines (Profound panel, nav 09) — rollup reader ──────────
// The exec AI pillar/card READ the SAME computed metrics the AI Answer Engines panel
// (ProfoundVisibilitySection) persists to IndexedDB, so they reconcile to that panel
// (Const II.6/II.7 — a view over the deep panel, never a recompute). Honest gap (I.5)
// when the panel has no data → the exec falls back to the LLM probe.
interface ProfoundMetrics {
  client:            string;
  totalRuns:         number;
  clientHits:        number;
  engines:           Array<{ platform: string; runs: number; hits: number }>;
  topics:            Array<{ topic: string; runs: number; hits: number }>;
  coverage:          Array<{ brand: string; count: number; pct: number; isClient: boolean }>;
  gaps:              Array<{ prompt: string; topic: string; rivalMentions: number; leader: string; leaderCount: number }>;
  sentBrands:        Array<{ brand: string; pos: number; neg: number; isClient: boolean }>;
  clientThemes:      Array<{ theme: string; pos: number; neg: number }>;
  totalCites:        number;
  clientDomainCites: number;
  promptN:           number;
  // v7.381: Profound-matched (strict `type == 'Visibility'`) tallies, added by the panel in
  // v7.380. OPTIONAL — metrics saved by an earlier version carry none, and the exec then falls
  // back to the blended figure exactly as the panel does, so the two never disagree.
  visRuns?:          number;
  visHits?:          number;
  visPromptN?:       number;
  visEngines?:       Array<{ platform: string; runs: number; hits: number }>;
  updatedAt:         string;
}

function loadProfoundMetrics(projectId: string): Promise<ProfoundMetrics | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open('orbitiq-profound-geo', 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('metrics')) db.createObjectStore('metrics');
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction('metrics', 'readonly');
        const rq = tx.objectStore('metrics').get(projectId);
        rq.onsuccess = () => { db.close(); resolve((rq.result as ProfoundMetrics) || null); };
        rq.onerror   = () => { db.close(); resolve(null); };
      } catch { resolve(null); }
    };
    req.onerror = () => resolve(null);
  });
}

function netPctOf(pos: number, neg: number): number {
  const t = pos + neg; return t ? Math.round((100 * (pos - neg)) / t) : 0;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-orbit-border last:border-0">
      <span className="text-[10px] text-orbit-secondary">{label}</span>
      <span className="text-[11px] font-semibold" style={{ color: valueColor ?? 'var(--c-f0f0ff)' }}>{value}</span>
    </div>
  );
}

function SignalCard({ source, value, desc, accentColor }: {
  source: string; value: string; desc: string; accentColor: string;
}) {
  return (
    <div className="px-3 py-2.5 mb-1.5"
      style={{
        background: 'var(--c-111118)', borderLeft: `3px solid ${accentColor}`,
        borderTop: '1px solid var(--c-1e1e2e)', borderRight: '1px solid var(--c-1e1e2e)',
        borderBottom: '1px solid var(--c-1e1e2e)', borderRadius: '0 6px 6px 0',
      }}>
      <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: accentColor }}>
        {source}
      </p>
      <p className="text-[17px] font-bold leading-tight" style={{ color: 'var(--c-f0f0ff)' }}>{value}</p>
      <p className="text-[9px] leading-snug mt-0.5" style={{ color: 'var(--c-8888aa)' }}>{desc}</p>
    </div>
  );
}

// ─── v7.382: motion (UX review recs M1 · M3) ─────────────────────────────────
// The count-up runs ONCE, on panel entry — never again when the data refetches
// underneath it, so a figure a reader is looking at can't start re-rolling. Under
// prefers-reduced-motion, and in any environment without requestAnimationFrame
// (SSR, the report route, the jsdom harness), the value is shown settled on the
// first paint. Motion is presentation only: it never touches what the number is.

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(!!mq.matches);
    const onChange = () => setReduced(!!mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

function useCountUp(target: number | null, decimals = 0, animate = true): number | null {
  const [shown, setShown] = useState<number | null>(target);   // settled on first paint (SSR-safe)
  const ranRef = useRef(false);
  useEffect(() => {
    if (target === null || !isFinite(target)) { setShown(target); return; }
    if (ranRef.current || !animate || typeof requestAnimationFrame !== 'function') { setShown(target); return; }
    ranRef.current = true;
    const pow = Math.pow(10, decimals);
    const dur = 750;
    const t0  = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let raf = 0;
    let live = true;
    const step = (now: number) => {
      if (!live) return;
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(target * e * pow) / pow);
      if (p < 1) raf = requestAnimationFrame(step); else setShown(target);
    };
    raf = requestAnimationFrame(step);
    return () => { live = false; if (raf) cancelAnimationFrame(raf); };
  }, [target, decimals, animate]);
  return shown;
}

/** A number that counts up on entry and is always readable as its settled value. */
function CountValue({ value, decimals = 0, suffix = '', animate = true, dash = '—' }: {
  value: number | null; decimals?: number; suffix?: string; animate?: boolean; dash?: string;
}) {
  const shown = useCountUp(value, decimals, animate);
  if (value === null || shown === null) return <>{dash}</>;
  return <>{shown.toFixed(decimals)}{suffix}</>;
}

/** A meter whose fill animates in from 0 and settles at its real width. */
function Meter({ pct, color, index = 0, height = 8 }: { pct: number; color: string; index?: number; height?: number }) {
  const w = `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <div style={{ background: 'var(--c-1e1e2e)', borderRadius: height / 2, height, overflow: 'hidden' }}>
      <div className="oiq-bar-fill"
        style={{ width: w, background: color, height, borderRadius: height / 2,
          ['--oiq-w' as any]: w, ['--oiq-i' as any]: index }} />
    </div>
  );
}

// ─── v7.382/v7.383: Key Insights rail (Wayne 2026-07-31) ─────────────────────
// v7.383: the box became a rounded, sticky rail on the RIGHT of the exec panel, grouped
// into three named sections — Missed opportunities · Competitors outperforming · Quick wins
// ready now — top 3 each. "Show all" reveals every remaining finding, including the context
// and risk lines that don't belong to a section, so the cut stays presentational (Const I.6).
const KEY_SEV_STYLE: Record<0 | 1 | 2, string> = {
  0: 'var(--c-ef4444)',
  1: 'var(--c-f59e0b)',
  2: 'var(--c-22c55e)',
};

function KeyInsightRow({ ins, index }: { ins: ExecKeyInsight; index: number }) {
  return (
    <div className="oiq-rise"
      style={{ background: 'var(--c-111118)', border: '1px solid var(--c-1e1e2e)',
        borderLeft: `3px solid ${KEY_SEV_STYLE[ins.sev]}`,
        borderRadius: '4px 10px 10px 4px', padding: '8px 10px', ['--oiq-i' as any]: index }}>
      <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
        color: KEY_SEV_STYLE[ins.sev], margin: '0 0 3px' }}>{ins.kicker}</p>
      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--c-c0c0e0)', margin: 0 }}>
        {ins.parts.map((sg, i) => sg.em
          ? <strong key={i} style={{ color: 'var(--c-f0f0ff)', fontWeight: 700 }}>{sg.t}</strong>
          : <span key={i}>{sg.t}</span>)}
      </p>
      <p style={{ fontSize: 8.5, color: 'var(--c-555570)', margin: '4px 0 0', lineHeight: 1.4 }}>
        {ins.panel && !ins.evidence.startsWith(ins.panel) ? `${ins.panel} · ` : ''}{ins.evidence}
      </p>
    </div>
  );
}

const RAIL_TOP_N = 3;   // Wayne: top 3 per section, the rest behind "Show all"

function KeyInsightsRail({ insights, expanded, onToggle }: {
  insights: ExecKeyInsight[]; expanded: boolean; onToggle: () => void;
}) {
  const sections = EXEC_INSIGHT_SECTIONS.map(sec => {
    const all = insights.filter(i => i.cat === sec.cat);   // already severity-ranked
    return { ...sec, all, shown: expanded ? all : all.slice(0, RAIL_TOP_N) };
  });
  const other  = insights.filter(i => i.cat === 'other');
  const hidden = sections.reduce((n, sec) => n + Math.max(0, sec.all.length - RAIL_TOP_N), 0) + other.length;
  let idx = -1;
  const next = () => { idx += 1; return idx; };

  return (
    <aside className="oiq-rise"
      style={{ background: 'var(--c-0f0f1c)', border: '1px solid var(--ca-108-99-255-0_4)',
        borderRadius: 16, padding: 14, position: 'sticky', top: 0, alignSelf: 'start',
        maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', ['--oiq-i' as any]: 5 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
        color: 'var(--c-6c63ff)', margin: 0 }}>Key Insights</p>
      <p style={{ fontSize: 9, color: 'var(--c-555570)', margin: '3px 0 12px' }}>
        {insights.length} finding{insights.length === 1 ? '' : 's'} from this scan · most urgent first
      </p>

      {sections.map(sec => (
        <div key={sec.cat} style={{ marginBottom: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6, gap: 6 }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              color: sec.accent, margin: 0 }}>{sec.label}</p>
            <span style={{ fontSize: 9, color: 'var(--c-555570)' }}>
              {sec.all.length > RAIL_TOP_N && !expanded ? `top ${RAIL_TOP_N} of ${sec.all.length}` : sec.all.length || ''}
            </span>
          </div>
          {sec.shown.length > 0 ? (
            <div className="flex flex-col" style={{ gap: 6 }}>
              {sec.shown.map(ins => <KeyInsightRow key={ins.id} ins={ins} index={next()} />)}
            </div>
          ) : (
            // Honest empty state (Const I.5, Wayne 2026-07-31): an empty section says WHY it is
            // empty — for the competitor lane that absence is itself the finding, not a blank.
            <p style={{ fontSize: 10.5, color: 'var(--c-8888aa)', lineHeight: 1.5, margin: 0,
              border: '1px dashed var(--c-2a2a3a)', borderRadius: 8, padding: '8px 10px' }}>
              {sec.cat === 'competitor'
                ? 'No tracked rival is measurably ahead of you here — the page-1 and AI-answer field is open rather than taken.'
                : sec.cat === 'quickwin'
                  ? 'Nothing sits one step from a win yet — the gains here need net-new work, not optimisation.'
                  : 'Nothing measured for this section on the current scan.'}
            </p>
          )}
        </div>
      ))}

      {expanded && other.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
            color: 'var(--c-8888aa)', margin: '0 0 6px' }}>Context &amp; risk</p>
          <div className="flex flex-col" style={{ gap: 6 }}>
            {other.map(ins => <KeyInsightRow key={ins.id} ins={ins} index={next()} />)}
          </div>
        </div>
      ) : null}

      {hidden > 0 || expanded ? (
        <button type="button" onClick={onToggle}
          style={{ fontSize: 10, width: '100%', color: 'var(--c-8b85ff)', background: 'var(--ca-108-99-255-0_12)',
            border: '1px solid var(--ca-108-99-255-0_4)', borderRadius: 8, padding: '6px 8px' }}>
          {expanded ? 'Show top 3 per section' : `Show all ${insights.length} insights`}
        </button>
      ) : null}
    </aside>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExecutiveSummarySection({
  analysis,
  projectId, kwVersion,
  projectName,
  clientDomain: propClientDomain,
  manualDomains = [],
  defaultClientThreshold     = 0,
  defaultCompetitorThreshold = 0,
  claudeAssigns = {},
  onNavigate,
}: Props) {

  // ── DB keyword fetch (mirrors GoogleSerpSection exactly) ──────────────────
  const [dbKeywords, setDbKeywords] = useState<DbKeyword[]>([]);
  const [dbLoaded,   setDbLoaded]   = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/keywords`)
      .then(r => r.json())
      .then(d => setDbKeywords(d.keywords ?? []))
      .catch(() => {})
      .finally(() => setDbLoaded(true));
  }, [projectId, kwVersion]);   // v7.107: kwVersion bump → refetch uploaded keywords

  // ── v7.312: AI Answer Engines (Profound) metrics — read from the panel's IndexedDB
  // store so the exec AI pillar/card reconcile to that panel (II.6/II.7). Client-side
  // read only; honest gap when the panel hasn't been populated for this project.
  const [pfMetrics, setPfMetrics] = useState<ProfoundMetrics | null>(null);
  useEffect(() => {
    let alive = true;
    loadProfoundMetrics(projectId).then(m => { if (alive) setPfMetrics(m); });
    return () => { alive = false; };
  }, [projectId]);
  const pfHasData = !!pfMetrics && pfMetrics.totalRuns > 0;

  // ── Canonical keyword pool via shared utility ───────────────────────────────
  // buildKwPool is the single source of truth (see lib/utils/kwVolume.ts header).
  // KeywordsPanel and the hero capture-rate metric both use this exact pool, so
  // every count and volume in this section now matches them by construction.
  // (Replaced the old inline merge, which skipped gap keywords, didn't dedupe
  // Semrush rows, and excluded uploaded gap-type rows — producing a different
  // keyword count and volume total than the Keyword Landscape panel.)
  const kwPool = useMemo(() => buildKwPool({
    semrushSnapshot:    analysis.semrushSnapshot ?? {},
    uploadedKeywords:   dbKeywords,
    clientDomain:       propClientDomain ?? analysis.semrushSnapshot?.domain ?? '',
    competitorDomains:  manualDomains,
    clientVolMin:       defaultClientThreshold,
    competitorVolMin:   defaultCompetitorThreshold,
    includeDemand:      true,   // v7.305: include "missing demand" so the footprint total + Volume Opportunity denominator reconcile with the Keyword Landscape + Google Rank panels
  }), [analysis, dbKeywords, propClientDomain, manualDomains, defaultClientThreshold, defaultCompetitorThreshold]);

  const topKws: SemKw[] = useMemo(() => kwPool.map(item => ({
    keyword:      item.keyword,
    position:     item.position != null && Number(item.position) > 0 && isFinite(Number(item.position))
                    ? Number(item.position)
                    : null,
    searchVolume: item.searchVolume,
    branded:      item.isBranded,
  })), [kwPool]);

  // ── Computed stats — derived from the canonical kwPool ────────────────────
  const posKws     = topKws.filter((k): k is SemKw & { position: number } => k.position !== null);
  const totalKws   = topKws.length;
  const page1Kws   = posKws.filter(k => k.position <= 10).length;
  // v7.127 BUGFIX — Volume Opportunity disagreed with the Google Rank panel
  // (exec showed 99% outside top 3 vs the rank panel's 83%). Root cause: this
  // total summed EVERY keyword in the pool, including GAP keywords (terms the
  // client does NOT rank for, sourced from competitor/gap uploads). Gap rows
  // carry position=null (see lib/utils/kwVolume.ts), so their volume landed in
  // the "Page 2+ (11+)" bucket (totalVol − page1Vol) and inflated the total —
  // turning ~211M of non-ranked gap volume into fake "Page 2+ rankings".
  // GoogleSerpSection (the source of truth) excludes gaps from its volume basis
  // via `pool.filter(item => !item.isGap)`; we now mirror that exactly so the
  // two panels reconcile. NOTE: totalKws above intentionally keeps the FULL
  // pool so the keyword-count card still matches the Keyword Landscape panel —
  // only the volume basis changes here. (top3Vol/page1Vol/posVol/weightedPos
  // already excluded gaps for free, since they filter on posKws where
  // position !== null.)
  // v7.320: also exclude origin:'demand' ("missing demand") volume from the Volume
  // Opportunity / share denominator, mirroring how GoogleSerpSection's topKws drops it and
  // how gaps are already excluded above (v7.127). Demand keywords carry position=null, so
  // leaving them in folded ~814M of UNRANKED volume into the "Page 2+ (11+)" bucket and
  // pushed "% outside top 3" to ~100%. `includeDemand` stays true so the keyword COUNT card
  // still matches the Keyword Landscape panel — only the ranked-volume basis changes here,
  // re-reconciling with the Google Rank panel's ranked totalVol (Const II.6/II.7).
  const totalVol   = kwPool.reduce((s, item) => s + ((item.isGap || item.origin === 'demand') ? 0 : (item.searchVolume ?? 0)), 0);
  const top3Vol    = posKws.filter(k => k.position <= 3).reduce((s, k) => s + k.searchVolume, 0);
  const page1Vol   = posKws.filter(k => k.position <= 10).reduce((s, k) => s + k.searchVolume, 0);
  const posVol     = posKws.reduce((s, k) => s + k.searchVolume, 0);
  const weightedPos = posVol > 0
    ? posKws.reduce((s, k) => s + k.position * k.searchVolume, 0) / posVol
    : 0;
  const posDist        = useMemo(() => buildPositionDist(topKws), [topKws]);
  const volOutsideTop3 = totalVol - top3Vol;
  const pctOutsideTop3 = totalVol > 0 ? Math.round((volOutsideTop3 / totalVol) * 100) : 0;
  const top3VolPct     = totalVol > 0 ? Math.round((top3Vol / totalVol) * 100) : 0;
  // Volume-based — matches GoogleSerpSection and volume opportunity bars
  const page1Pct       = totalVol > 0 ? Math.round((page1Vol / totalVol) * 100) : 0;
  // v7.282: page-1 split into ranks 1-3 (top3VolPct) and ranks 4-10 (volume-based, same
  // total basis), for the Google SERP Ranks card breakdown. Sums to page1Pct (rounding aside).
  const rank410Pct     = totalVol > 0 ? Math.round(((page1Vol - top3Vol) / totalVol) * 100) : 0;

  // ── Market capture ────────────────────────────────────────────────────────
  const semSnap: any   = analysis.semrushSnapshot  ?? {};
  const serpSnap: any  = analysis.serpApiSnapshot   ?? {};
  const cb: any        = semSnap._categoryBreakdown ?? {};

  // ── Market capture metrics — from the same canonical pool as the stats above ──
  const _volMetrics = computeVolumeMetrics(kwPool);

  const totalMonthly      = _volMetrics.totalMonthly > 0
    ? _volMetrics.totalMonthly
    : (cb.totalMonthlyDemand ?? analysis.totalCategoryVolume ?? 0);
  const page1Monthly      = _volMetrics.page1Monthly > 0
    ? _volMetrics.page1Monthly
    : (cb.totalPage1Demand ?? analysis.clientOwnedVolume ?? 0);
  const captureRate       = totalMonthly > 0
    ? page1Monthly / totalMonthly
    : (cb.page1CaptureRate ?? analysis.marketCaptureRate ?? 0);
  const uncapturedMonthly = Math.max(totalMonthly - page1Monthly, 0);
  const captureRatePct    = (captureRate * 100).toFixed(1);

  // ── SERP features ─ v7.337 (QC audit B4-proper, Const II.6/II.7) ──────────
  // Computed LIVE via the shared lib/serp/featurePool roll-up — the scanned SERP rows
  // persisted on analysis.serpApiSnapshot plus the uploaded Semrush "SERP Features by
  // Keyword" cells on the /keywords rows (dbKeywords, already fetched above) — the SAME
  // inputs + implementation the SERP Features panel (07) shows. Replaces the stored
  // analysis.aioAvailable/aioAcquired + serpSnap.serpFeatureSummary columns, which were
  // frozen at analysis time and went stale as scans ran; the "(at analysis)" qualifier
  // on the roll-up AIO token is dropped because the number is now current. (During an
  // active in-session scan the panel is momentarily fresher — it merges the in-flight
  // batch before it persists; outside that window the two read identical data.)
  const serpRollup = computeSerpFeatureRollup(
    (dbKeywords as any[]) ?? [],
    (serpSnap.keywords ?? []) as any[],
    serpNormDomain(serpSnap.domain ?? propClientDomain ?? analysis.domain ?? ''),
  );
  const aioAvail = serpRollup.aioAvail;
  const aioAcq   = serpRollup.aioAcq;
  const aioRate  = serpRollup.aioRate;
  const paaAvail = serpRollup.paaAvail;
  const paaAcq   = serpRollup.paaAcq;
  const vidAvail = serpRollup.videoAvail;
  const vidAcq   = serpRollup.videoAcq;
  const totalAvail = serpRollup.totalAvail;
  const totalAcq   = serpRollup.totalAcq;
  const combinedSerpRate = totalAvail > 0 ? Math.round((totalAcq / totalAvail) * 100) : 0;

  // ── Share of Voice (page-1 click capture) ─────────────────────────────────
  // v7.245 — Sourced from the SAME computeSov() the Google-Rank donut (SovPanel,
  // nav 06) renders and the SovPanel shown right below in this exec, so the hero
  // figure and the donut reconcile by construction (Const II.6/II.7). SoV is now
  // page-1 click CAPTURE (clicks the client wins ÷ all page-1 clicks available
  // across its footprint), not competitor-relative share — see SovComputed note.
  // The old competitor-share derivations (topComp / gapVsTop) were removed with
  // that redefinition; competitor presence for the readiness checklist is now read
  // directly from the configured/auto-discovered competitor lists, not from SoV.
  const clientDomain   = normDomain(propClientDomain ?? analysis.domain ?? '');
  const _sov           = useMemo(
    () => computeSov({ analysis, competitors: manualDomains, dbKeywords, clientLabel: projectName ?? propClientDomain }),
    [analysis, manualDomains, dbKeywords, projectName, propClientDomain],
  );
  const clientShare    = _sov.availableClicks > 0 ? _sov.sovPct : captureRate;
  const hasCompetitors = (manualDomains?.length ?? 0) > 0
    || ((analysis.semrushSnapshot?.competitors?.length ?? 0) > 0);

  // ── Journey stage coverage (nav 04) ───────────────────────────────────────
  // v7.128 — Replaces the old `page1Pct > 30 ? '2 of 4' : '1 of 4'` heuristic,
  // which was fabricated and had NO link to the Journeys panel. We now run the
  // SAME buildClusters() the panel renders and count how many of the 4 journey
  // stages (awareness / consideration / decision / retention) have client
  // page-1 volume (subCluster.clientVolume > 0). claudeAssignments is {} so the
  // intent mapping is the deterministic default (AI refinement of 'unmatched'
  // keywords is UI-cached state not available here, and only shifts unmatched
  // terms into the awareness stage).
  const journeyStages = useMemo(() => {
    const STAGE_ORDER = ['awareness', 'consideration', 'decision', 'retention'] as const;
    const STAGE_LABELS: Record<string, string> = { awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention' };
    const clusters = buildClusters(analysis, {}, clientDomain, manualDomains, dbKeywords);
    const agg: Record<string, { client: number; total: number }> = {};
    STAGE_ORDER.forEach(s => { agg[s] = { client: 0, total: 0 }; });
    clusters.forEach(c => c.subClusters.forEach(sc => {
      if (agg[sc.stage]) { agg[sc.stage].client += sc.clientVolume; agg[sc.stage].total += sc.totalVolume; }
    }));
    return STAGE_ORDER.map(s => {
      const { client, total } = agg[s];
      const share = total > 0 ? client / total : 0;
      const status: 'present' | 'thin' | 'absent' = client <= 0 ? 'absent' : share < 0.2 ? 'thin' : 'present';
      return { stage: s as string, label: STAGE_LABELS[s], client, total, share, status };
    });
  }, [analysis, clientDomain, manualDomains, dbKeywords]);
  const journeyStagesCovered = journeyStages.filter(s => s.status !== 'absent').length;

  // ── v7.280: per-lane journey coverage for the summary card — the PRODUCT funnel
  // (4 stages) and the PRE-PRODUCT lane shown as two rows. Built from the SAME
  // buildClusters() the Journey panel renders (II.6/II.7). Pre-product is
  // awareness-only (Const III.2a) so it has no 4-stage funnel — its coverage is
  // counted as problem THEMES with client organic coverage out of total
  // pre-product themes, and is empty until the deep journey is built (honest gap,
  // III.2a-ii) → shown as "—" rather than a fabricated stage count.

  // ── LLM visibility ────────────────────────────────────────────────────────
  // v7.80: supports both probe shapes. v2 (llm_probe_v2) reports the UNBRANDED
  // mention rate — prompts that never named the brand — per platform; v1 keeps
  // its original all-prompt mention rate.
  const llmSnap: any   = analysis.profoundSnapshot ?? {};
  const isLlmProbeV2   = llmSnap.source === 'llm_probe_v2';
  const isLlmProbeV1   = llmSnap.source === 'llm_probe';
  const isLlmProbe     = isLlmProbeV1 || isLlmProbeV2;

  let llmPlatforms: any[] = [];
  let overallMentions = 0;
  let overallTotal    = 0;
  let bestExcerpt     = '';

  if (isLlmProbeV2) {
    const v2Results: any[] = llmSnap.results ?? [];
    llmPlatforms = (['claude', 'chatgpt'] as const)
      .map(plat => {
        const rows = v2Results.filter((r: any) => r.platform === plat && !r.branded);
        const mentionCount = rows.filter((r: any) => r.mentioned).length;
        return {
          platform: plat,
          label:    plat === 'claude' ? 'Claude (Anthropic)' : 'ChatGPT (OpenAI)',
          results:  rows,
          mentionCount,
          mentionRate: rows.length > 0 ? mentionCount / rows.length : 0,
        };
      })
      .filter(p => p.results.length > 0);
    overallMentions = llmSnap.unbranded?.mentions ?? 0;
    overallTotal    = llmSnap.unbranded?.total    ?? 0;
    bestExcerpt     = (llmSnap.sentiment?.examples ?? [])
      .find((e: any) => e.tone === 'positive')?.quote
      ?? v2Results.find((r: any) => r.mentioned && r.excerpt)?.excerpt ?? '';
  } else if (isLlmProbeV1) {
    llmPlatforms    = llmSnap.platforms ?? [];
    overallMentions = llmSnap.overallMentions ?? 0;
    overallTotal    = llmSnap.overallTotal    ?? 0;
    bestExcerpt     = llmPlatforms
      .flatMap((p: any) => p.results ?? [])
      .find((r: any) => r.mentioned && r.excerpt)?.excerpt ?? '';
  }

  const overallLlmRate = overallTotal > 0 ? Math.round((overallMentions / overallTotal) * 100) : 0;

  // ── v7.279: combined brand-mention rate — mirrors the LLM Visibility panel's
  // "Brand mention share" exactly (LLMVisibilitySection ProbeViewV2): acquired ÷
  // available across ALL probe responses (unbranded + branded, both platforms).
  // This is the figure Wayne chose for the exec "AI visibility" card, so the card
  // and that panel reconcile (II.6/II.7). v1 probes have no branded/unbranded
  // split, so the all-prompt mention rate is the combined figure there.
  let llmMentionAcquired = 0;
  let llmMentionTotal    = 0;
  if (isLlmProbeV2) {
    const v2All: any[] = llmSnap.results ?? [];
    llmMentionTotal    = v2All.length;
    llmMentionAcquired = v2All.filter((r: any) => r.mentioned).length;
  } else if (isLlmProbeV1) {
    llmMentionTotal    = overallTotal;
    llmMentionAcquired = overallMentions;
  }
  const llmMentionPct: number | null = llmMentionTotal > 0
    ? Math.round((llmMentionAcquired / llmMentionTotal) * 100)
    : null;

  // v7.282: the two halves under the combined AI-visibility figure — the LLM Visibility
  // panel's own "Unbranded visibility" (unbranded.score) and "Brand recognition"
  // (branded.score), each a real mention/recognition rate off the probe (lib/apis/llmProbe.ts).
  // Available only for a v2 probe (v1/AIO have no branded/unbranded split → null, no breakdown).
  const nonBrandedPct: number | null = isLlmProbeV2 ? (llmSnap.unbranded?.score ?? 0) : null;
  const brandedPct:    number | null = isLlmProbeV2 ? (llmSnap.branded?.score ?? 0) : null;

  // v7.283: AI-per-stage visibility for the "Where you disappear" row, pulled from the
  // LLM Visibility panel's per-CATEGORY mention rates and mapped onto the 4 journey stages
  // (Wayne). The map is a real weighted roll-up: for each stage, average the probed
  // categories' mention rate weighted by that category's volume in the stage — using the
  // SAME buildClusters() the Journey/grid rows use for stage volumes (Const II.6/II.7).
  // Categories the probe didn't cover are skipped (honest gap), and a stage with no probed
  // volume stays null → rendered as "no data", never fabricated. v2 probe only.
  const aiStageRates = useMemo(() => {
    const STAGE_ORDER = ['awareness', 'consideration', 'decision', 'retention'] as const;
    const cats: any[] = llmSnap?.categories ?? [];
    if (!isLlmProbeV2 || cats.length === 0) return STAGE_ORDER.map(st => ({ stage: st as string, rate: null as number | null }));
    const rateByCat = new Map<string, number>();
    cats.forEach((c: any) => { if (c?.category) rateByCat.set(String(c.category).toLowerCase().trim(), c.mentionRate ?? 0); });
    const clusters = buildClusters(analysis, {}, clientDomain, manualDomains, dbKeywords);
    const num: Record<string, number> = {}; const den: Record<string, number> = {};
    STAGE_ORDER.forEach(st => { num[st] = 0; den[st] = 0; });
    clusters.forEach(c => {
      const r = rateByCat.get(String(c.name).toLowerCase().trim());
      if (r === undefined) return;                       // category not probed → skip (honest)
      c.subClusters.forEach(sc => {
        if (num[sc.stage] === undefined) return;
        num[sc.stage] += r * sc.totalVolume;
        den[sc.stage] += sc.totalVolume;
      });
    });
    return STAGE_ORDER.map(st => ({ stage: st as string, rate: den[st] > 0 ? Math.round((num[st] / den[st]) * 100) : null }));
  }, [isLlmProbeV2, llmSnap, analysis, clientDomain, manualDomains, dbKeywords]);

  // ── Content inventory ─────────────────────────────────────────────────────
  // v7.128 — Gap stats now derive from the canonical kwPool (buildKwPool), so
  // the gap COUNT and VOLUME match Keyword Landscape (02) and Content Map (05)
  // exactly. Previously this read raw `semSnap.gapKeywords`, which bypasses
  // buildKwPool's branded-exclusion, project competitor-volume threshold, and
  // dedupe — so the exec gap figures could exceed what those panels display.
  // KeywordsPanel's canonical "competitor gap keywords" count is
  // gapRows = pool items that are gaps AND have a competitor, filtered by the
  // project volume threshold (already applied inside buildKwPool via
  // competitorVolMin / volThreshold = defaultCompetitorThreshold) — i.e.
  // exactly kwPool.filter(isGap && competitor). Matches by construction.
  const gapItems            = kwPool.filter(i => i.isGap && !!i.competitor);
  const gapKwCount          = gapItems.length;
  const gapVolume           = gapItems.reduce((s, i) => s + (i.searchVolume ?? 0), 0);
  const categories: any[]   = cb.categories ?? [];
  const clusterCount        = categories.filter((c: any) => c.type === 'procedure').length;
  const contentGapsFromDb   = (analysis.contentGaps ?? []) as string[];

  // ── v7.279: Coverage-gap card — net-new topics + volume FROM the Content Map ─
  // Reproduces ContentMapSection's plan build verbatim: the SAME canonical topic
  // builder + plan builder, with the SAME inputs — raw snapshot domain (the
  // Content Map uses `analysis.semrushSnapshot.domain`, NOT the normalized
  // propClientDomain), the same competitor list, the same uploaded keywords
  // (both panels read /api/projects/{id}/keywords → d.keywords), and the
  // page-lifted claudeAssigns. `summary.build` / `buildVol` is exactly the panel's
  // "build net-new" set (footprint-derived, page-pull-independent), so the card
  // reconciles to Content Map (05) by construction (II.6/II.7). No modeling (I.1).
  const cmClientDomain = (analysis?.semrushSnapshot as any)?.domain ?? '';
  // v7.281: build the canonical content-map topics ONCE — the SAME call the Content Map
  // (05) and Journey panels make — then derive both the coverage-map plan and the journey
  // lane summary from it (Const II.7, no parallel builds).
  const canonicalTopics = useMemo(
    () => buildCanonicalClusterTopics(analysis, cmClientDomain, manualDomains, dbKeywords, claudeAssigns),
    [analysis, cmClientDomain, manualDomains, dbKeywords, claudeAssigns],
  );
  const contentPlan = useMemo(
    () => {
      // v7.356: same brand vocabulary as every other panel (Const II.7) so exec-summary
      // priorities reconcile with the Content Map/Plan.
      const brandTerms = brandTermsOf(cmClientDomain, analysis?.semrushSnapshot);
      const priorityOverrides = (analysis?.semrushSnapshot?._priorityOverrides as Record<string, 'P0' | 'P1' | 'P2' | 'P3'>) ?? {};   // v7.358
      return canonicalTopics.length > 0
        ? buildContentPlanFromTopics(canonicalTopics, { brandTerms, priorityOverrides })
        : planFromSnapshot(analysis, dbKeywords, { brandTerms, priorityOverrides });
    },
    [canonicalTopics, analysis, dbKeywords, cmClientDomain],
  );
  // v7.281: pull the product / pre-product split + coverage from the SAME source the
  // Journey panel renders — its canonical topics + journeyLaneSummary() (Const II.7) —
  // instead of forking a buildClusters classification (which wrongly reported a built-out
  // pre-product lane). Pre-product topics exist only once the deep journey is built
  // (problem/demand topics seeded by _demandUniverse.problemSeeds, Const III.2a-ii), so
  // preTotal is 0 here exactly when the panel shows "Pre-product journey 0".
  const problemSeeds = useMemo(
    () => ((analysis?.semrushSnapshot as any)?._demandUniverse?.problemSeeds ?? []) as string[],
    [analysis],
  );
  const journeyLanes = useMemo(
    () => journeyLaneSummary(canonicalTopics as any, problemSeeds),
    [canonicalTopics, problemSeeds],
  );
  const netNewTopics  = contentPlan?.scope.build ?? 0;        // net-new pages to BUILD
  const netNewVol     = contentPlan?.scope.buildVol ?? 0;     // their monthly search volume
  // v7.280: also surface the EXISTING pages to optimise (Wayne — show both halves
  // of the Content Map: optimise vs build). scope.existing/build are the Content
  // Map's own optimise/net-new split, so the card reconciles to that panel.
  const optimizeTopics = contentPlan?.scope.existing ?? 0;    // existing pages to OPTIMISE
  const coverageTopics = optimizeTopics + netNewTopics;       // total mapped pages

  // ── Opportunities ─────────────────────────────────────────────────────────
  const opps: Opportunity[] = (analysis.opportunities ?? [])
    .sort((a: Opportunity, b: Opportunity) => a.rank - b.rank)
    .slice(0, 3);

  const fallbackActions: Opportunity[] = [
    { rank: 1, category: 'Content', title: 'Close the content gap',
      summary: `${gapKwCount} non-branded gap keywords where competitors rank but client does not. Focus on highest-volume procedure clusters.` },
    { rank: 2, category: 'SEO',     title: 'Target competitor-gap keywords',
      summary: `${gapKwCount} keywords where top competitors rank page 1 and client does not — worth ${fmtAnnual(gapVolume)} annual searches.` },
    { rank: 3, category: 'GEO',     title: 'Build AI search presence',
      summary: `Cited in ${overallMentions} of ${overallTotal || 6} AI probes. Structured content aligned to LLM prompt patterns will lift citation rates on Claude and ChatGPT.` },
  ];
  const actions          = opps.length > 0 ? opps : fallbackActions;
  const hasFallbackActions = opps.length === 0;

  // ── Analysis-time stamp — still read by the priorities header below ─────────
  // v7.334: AI-generated priorities are written ONCE at analysis time while the cards on this
  // page recompute live, so anything synthesis-written is stamped with its analysis date and a
  // reader never takes those figures as current (QC audit A2). v7.386 removed the narrative
  // paragraph that shared this stamp; the priorities row still carries it.
  const analysisDateLabel = analysis?.completedAt
    ? new Date(analysis.completedAt).toLocaleDateString()
    : null;

  // ── Color helpers ─────────────────────────────────────────────────────────
  const captureColor = captureRate < 0.15 ? 'var(--c-ef4444)' : captureRate < 0.35 ? 'var(--c-f59e0b)' : 'var(--c-22c55e)';
  const llmColor     = overallLlmRate < 34 ? 'var(--c-ef4444)' : overallLlmRate < 67 ? 'var(--c-f59e0b)' : 'var(--c-22c55e)';
  const pg1Color     = page1Pct < 30 ? 'var(--c-f59e0b)' : 'var(--c-22c55e)';
  const aioColor     = aioRate < 20 ? 'var(--c-ef4444)' : aioRate < 50 ? 'var(--c-f59e0b)' : 'var(--c-06b6d4)';
  const avgPosColor  = weightedPos > 0 && weightedPos <= 5 ? 'var(--c-22c55e)'
    : weightedPos <= 20 ? 'var(--c-f59e0b)' : 'var(--c-ef4444)';

  const CATEGORY_COLOR: Record<string, string> = {
    SEO: 'var(--ca-108-99-255-0_15)', GEO: 'var(--ca-6-182-212-0_12)', Content: 'var(--ca-139-133-255-0_12)',
    Technical: 'var(--ca-245-158-11-0_12)', Competitive: 'var(--ca-239-68-68-0_12)',
  };
  const CATEGORY_TEXT: Record<string, string> = {
    SEO: 'var(--c-8b85ff)', GEO: 'var(--c-06b6d4)', Content: 'var(--c-8b85ff)', Technical: 'var(--c-f59e0b)', Competitive: 'var(--c-ef4444)',
  };

  // ── AI visibility — single defendable figure ───────────────────────────────
  // v7.279 (Wayne): the AI-visibility card + the Overall Visibility Score's AI
  // pillar now read the LLM Visibility panel's combined brand-mention rate
  // (`llmMentionPct`) as the primary figure, so card, panel, and score agree.
  // AI Overviews remain a fallback ONLY when no LLM probe was run (honest gap,
  // I.5) — never fabricated. Both the score pillar and the landscape line read
  // this single `aiVisPct`, so they stay consistent by construction.
  // v7.312: the AI Answer Engines panel (Profound) is now the PRIMARY source — the
  // client's mention rate across ALL tested AI answers (every engine). The LLM probe
  // is the fallback ONLY when that panel has no data (honest gap, I.5). One aiVisPct
  // drives the score pillar, the bar, the landscape line, and the card by construction.
  // v7.381: reconcile with the AI Answer Engines panel AND with Profound's own dashboard.
  // The panel's headline scores the STRICT prompt set (`type == 'Visibility'`) — Profound's own
  // denominator — while topic whitespace and prompt gaps keep the full footprint. The exec pillar
  // is a VIEW over that panel (Const II.6), so it must read the same strict tallies or the summary
  // and the panel below it will state two different visibility numbers for the same client.
  const pfStrict = pfHasData && typeof pfMetrics!.visRuns === 'number' && (pfMetrics!.visRuns as number) > 0;
  const pfScoreRuns = pfStrict ? (pfMetrics!.visRuns as number) : (pfHasData ? pfMetrics!.totalRuns : 0);
  const pfScoreHits = pfStrict ? (pfMetrics!.visHits as number) : (pfHasData ? pfMetrics!.clientHits : 0);
  const pfScoreEngines = (pfStrict && (pfMetrics!.visEngines || []).length)
    ? (pfMetrics!.visEngines as Array<{ platform: string; runs: number; hits: number }>)
    : (pfHasData ? pfMetrics!.engines : []);
  const pfVisExact: number | null = pfHasData && pfScoreRuns > 0 ? (100 * pfScoreHits / pfScoreRuns) : null;
  const aiEnginesZero = pfHasData ? pfScoreEngines.filter(e => e.hits === 0).length : 0;
  const aiEnginesTot  = pfHasData ? pfScoreEngines.length : 0;
  const aiTopicsZero  = pfHasData ? pfMetrics!.topics.filter(t => t.hits === 0).length : 0;
  const aiTopicsTot   = pfHasData ? pfMetrics!.topics.length : 0;
  const aiVisPct: number | null =
    pfVisExact !== null ? Math.round(pfVisExact * 10) / 10
    : llmMentionPct !== null ? llmMentionPct
    : aioAvail > 0 ? aioRate
    : null;
  const aiVisDenom =
    pfHasData ? `of ${pfScoreRuns.toLocaleString()} AI answers across ${aiEnginesTot} engines${pfStrict ? ' · Profound Visibility prompts' : ''}`
    : llmMentionPct !== null ? `of ${llmMentionTotal} AI responses citing you`
    : aioAvail > 0 ? `of ${aioAvail} AI Overviews citing you`
    : 'run an AI probe to measure';
  const aiVisColor = aiVisPct === null ? 'var(--c-555570)' : aiVisPct < 20 ? 'var(--c-ef4444)' : aiVisPct < 50 ? 'var(--c-f59e0b)' : 'var(--c-22c55e)';

  const STATUS_STYLE: Record<'present' | 'thin' | 'absent', { bg: string; fg: string; label: string }> = {
    present: { bg: 'var(--c-166534)', fg: 'var(--c-86efac)', label: 'present' },
    thin:    { bg: 'var(--c-854d0e)', fg: 'var(--c-fde68a)', label: 'thin' },
    absent:  { bg: 'var(--c-2a2a3a)', fg: 'var(--c-8888aa)', label: 'absent' },
  };

  // ── v7.131: Overall Visibility Score (equal-weighted; formula shown on screen) ──
  const scoreDims = [
    { label: 'Google SERP Ranks', val: page1Pct, color: 'var(--c-22c55e)' },
    ...(aiVisPct !== null ? [{ label: 'AI visibility', val: aiVisPct, color: 'var(--c-ef4444)' }] : []),
    { label: 'Journey', val: Math.round((journeyStagesCovered / 4) * 100), color: 'var(--c-06b6d4)' },
  ];
  const geoScore = scoreDims.length ? Math.round(scoreDims.reduce((s, d) => s + d.val, 0) / scoreDims.length) : 0;
  const geoScoreColor = geoScore < 25 ? 'var(--c-ef4444)' : geoScore < 50 ? 'var(--c-f59e0b)' : 'var(--c-22c55e)';
  const aiMeasured = aiVisPct !== null;

  // ── v7.131: Read-confidence meter (which data signals are present) ──────────
  const signals = [
    { key: 'Keywords',          ok: totalKws > 0 },
    { key: 'Competitors',       ok: hasCompetitors },
    { key: 'AI Overviews',      ok: aioAvail > 0 },
    { key: 'LLM probe',         ok: overallTotal > 0 },
    { key: 'Journey clusters',  ok: (clusterCount > 0 || categories.length > 0) },
  ];
  const signalsOk      = signals.filter(s => s.ok).length;
  const confidencePct  = Math.round((signalsOk / signals.length) * 100);
  const missingSignals = signals.filter(s => !s.ok).map(s => s.key);
  const confColor      = confidencePct >= 80 ? 'var(--c-22c55e)' : confidencePct >= 50 ? 'var(--c-f59e0b)' : 'var(--c-ef4444)';

  // ── Near-miss / climber pools — still read by the Key Insights rail (K8) ──────
  // v7.385: the modeled click estimates that used to sit beside these (quickClicks /
  // climbClicks / betClicks, off the shared ctrAt curve) went with the ladder block. The
  // COUNTS and the real search volume below are measured and stay (Const I.1).
  const nearMiss    = posKws.filter(k => k.position >= 4 && k.position <= 10);
  const climber     = posKws.filter(k => k.position >= 11 && k.position <= 20);
  const nearMissVol = nearMiss.reduce((s, k) => s + k.searchVolume, 0);
  const climberVol  = climber.reduce((s, k) => s + k.searchVolume, 0);

  // ── v7.134: LLM sentiment-when-mentioned for the LLM-visibility card ────────
  const _llmSent: any = llmSnap.sentiment ?? {};
  const llmSent = {
    pos:   _llmSent.positive ?? 0,
    neu:   _llmSent.neutral  ?? 0,
    neg:   _llmSent.negative ?? 0,
    total: _llmSent.totalMentions ?? ((_llmSent.positive ?? 0) + (_llmSent.neutral ?? 0) + (_llmSent.negative ?? 0)),
  };

  // ═══ v7.382 — layout rebuild to the approved mockup + Key Insights ═══════════
  // Nothing below RE-DERIVES a metric: every figure here is one already computed
  // above from the deep panels this summary rolls up (Const II.6/II.7). The only
  // new work is ordering, wording, and how wide a bar is drawn.

  const reducedMotion = usePrefersReducedMotion();
  const animate       = !reducedMotion;

  // Per-engine citation rates — the SAME strict series the AI pillar scores off
  // (pfScoreEngines), so the chart and the headline can never disagree. Engines
  // with no answers tested are dropped rather than drawn at 0% (Const I.5).
  const engineSeries = useMemo(() => pfScoreEngines
    .filter(e => e.runs > 0)
    .map(e => ({ platform: e.platform, runs: e.runs, hits: e.hits, pct: (100 * e.hits) / e.runs }))
    .sort((x, y) => y.pct - x.pct), [pfScoreEngines]);
  // Wayne 2026-07-31: bars are scaled to the TOP engine so single-digit rates stay
  // readable, and the caption says so. The label on every bar is the TRUE rate —
  // the scaling is a drawing decision, never a number decision (Const I.5a spirit).
  const engineMaxPct = engineSeries.length > 0 ? Math.max(...engineSeries.map(e => e.pct)) : 0;

  const aiSourceLabel = pfHasData
    ? `AI Answer Engines (09) · ${pfMetrics!.client} · Profound export, updated ${new Date(pfMetrics!.updatedAt).toLocaleDateString()}`
    : 'LLM probe · real classified probe responses · this scan';

  const clientSent   = pfHasData ? pfMetrics!.sentBrands.find(sb => sb.isClient) ?? null : null;
  const clientCov    = pfHasData ? pfMetrics!.coverage.find(cv => cv.isClient) ?? null : null;
  const winnableLead = pfHasData && pfMetrics!.gaps.length > 0 ? pfMetrics!.gaps[0].leader : null;
  const sovPctNum    = _sov.availableClicks > 0 ? Math.round(_sov.sovPct * 1000) / 10 : null;
  // v7.383: rivals for the "Competitors outperforming" section. Uploaded competitors AND the
  // auto-discovered SERP rivals — exactly the two sets the SoV donut slices — never a third
  // list assembled here (Const II.7). Same modeled CTR basis as the donut, labeled as such.
  const sovRivals = useMemo(
    () => [..._sov.compEntries, ..._sov.serpEntries]
      .map(e => ({ domain: e.domain, pct: Math.round(e.pct * 1000) / 10 }))
      .filter(e => e.pct > 0),
    [_sov],
  );
  const promptRivals = useMemo(
    () => (pfHasData ? pfMetrics!.coverage.filter(c => !c.isClient).map(c => ({ brand: c.brand, count: c.count })) : []),
    [pfHasData, pfMetrics],
  );

  const keyInsights: ExecKeyInsight[] = useMemo(() => execKeyInsights({
    aiVisPct, aiAnswers: pfHasData ? pfScoreRuns : llmMentionTotal,
    aiEnginesZero, aiEnginesTotal: aiEnginesTot,
    aiZeroEngineNames: pfHasData ? pfScoreEngines.filter(e => e.hits === 0).map(e => e.platform) : [],
    aiTopicsZero, aiTopicsTotal: aiTopicsTot,
    winnablePrompts: pfHasData ? pfMetrics!.gaps.length : 0,
    winnableLeader:  winnableLead,
    promptsSeen:     clientCov ? clientCov.count : null,
    promptsTotal:    pfHasData ? pfMetrics!.promptN : null,
    netSentiment:    clientSent ? netPctOf(clientSent.pos, clientSent.neg) : null,
    ownedCites:      pfHasData && pfMetrics!.totalCites > 0 ? pfMetrics!.clientDomainCites : null,
    totalCites:      pfHasData && pfMetrics!.totalCites > 0 ? pfMetrics!.totalCites : null,
    aiSourceLabel,
    page1Pct, top3Pct: top3VolPct,
    sovPct: sovPctNum, ctrSourceLabel: CTR_SOURCE_LABEL,
    nearMissCount: nearMiss.length, nearMissMonthly: nearMissVol, climberCount: climber.length,
    optimizeTopics, netNewTopics, netNewMonthly: netNewVol,
    gapKwCount, gapMonthly: gapVolume,
    absentStages: journeyStages.filter(st => st.status === 'absent').map(st => st.label),
    thinStages:   journeyStages.filter(st => st.status === 'thin').map(st => st.label),
    preProductBuilt: journeyLanes.preTotal > 0,
    aioAvail, aioAcq,
    confidencePct, missingSignals,
    // v7.383: real rival rows — the SAME entries the SoV donut draws and the SAME roster the
    // AI Answer Engines panel ranks, so the competitor section can never quote a figure that
    // isn't already on screen somewhere below (Const II.6).
    sovRivals:    sovRivals,
    promptRivals: promptRivals,
    // v7.384: the A6/A8 findings, computed from the SAME probe figures the AI pillar and the
    // LLM panel read (Const II.6) and handed to the rule set whole — the sentence is still
    // owned by the v7.366 rule, the rail only decides where it sits and how urgent it is.
    aiWhitespace: aiWhitespaceInsight({
      cats: (isLlmProbeV2 ? (llmSnap.categories ?? []) : []).map((c: any) => ({
        category:      String(c.category ?? ''),
        monthlyDemand: c.monthlyDemand ?? 0,
        mentions:      (c.claudeMentions ?? 0) + (c.chatgptMentions ?? 0),
        total:         (c.claudeTotal ?? 0) + (c.chatgptTotal ?? 0),
      })),
    }),
    probeAnchor: probeAnchorInsight({
      brandedScore:   brandedPct,
      unbrandedScore: nonBrandedPct,
      unbrandedTotal: isLlmProbeV2 ? (llmSnap.unbranded?.total ?? 0) : 0,
    }),
  }), [aiVisPct, pfHasData, pfScoreRuns, llmMentionTotal, aiEnginesZero, aiEnginesTot, pfScoreEngines, sovRivals, promptRivals,
       aiTopicsZero, aiTopicsTot, pfMetrics, winnableLead, clientCov, clientSent, aiSourceLabel,
       page1Pct, top3VolPct, sovPctNum, nearMiss.length, nearMissVol, climber.length,
       optimizeTopics, netNewTopics, netNewVol, gapKwCount, gapVolume, journeyStages, journeyLanes,
       aioAvail, aioAcq, confidencePct, missingSignals, isLlmProbeV2, llmSnap, brandedPct, nonBrandedPct]);

  const KEY_INSIGHTS_SHOWN = 8;   // Wayne: top 6–8 on screen, the rest one click away (never dropped)
  const [showAllInsights, setShowAllInsights] = useState(false);
  const visibleInsights = showAllInsights ? keyInsights : keyInsights.slice(0, KEY_INSIGHTS_SHOWN);

  // ── Defer render until DB keywords resolve (prevents stale capture-rate flash) ──
  // Mirrors the v7.67 ThemeClustersPanel fix: first paint used only the stored
  // snapshot fallbacks, then re-rendered with merged DB keywords — flashing two
  // different numbers. The fetch's .finally() always sets dbLoaded, so a failed
  // fetch still unblocks the UI.
  if (!dbLoaded) {
    return (
      <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-3 animate-fade-in">
        <div className="orbit-card p-4" style={{ borderColor: 'var(--ca-108-99-255-0_4)' }}>
          <p className="text-[9px] text-orbit-tertiary uppercase tracking-widest mb-1">Market capture rate</p>
          <p className="text-[11px] text-orbit-secondary">Loading keyword data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-3 animate-fade-in">

      {/* ═══ v7.383 (Wayne 2026-07-31) — TOP BLOCK + KEY INSIGHTS RAIL ═══════════
          The hero, the landscape headline and the KPI cards run in the left column; the
          Key Insights rail sits to their right and stays pinned while the reader scrolls
          the section. Everything BELOW this block returns to full width so the SoV donut,
          the per-engine chart and the priorities row keep the room they need to be read.
          On a narrow viewport the grid collapses to one column and the rail simply follows
          the cards. */}
      <div className="oiq-exec-top" style={{ display: 'grid', gap: 12, alignItems: 'start' }}>
        <div className="flex flex-col gap-3" style={{ minWidth: 0 }}>

      {/* ═══ v7.131 — OVERALL VISIBILITY SCORE + READ CONFIDENCE (lead KPI) ═══ */}
      {/* v7.279: renamed from "GEO Visibility Score" to "Overall Visibility Score" (Wayne). */}
      {/* v7.382: restyled to the approved mockup (UX review 2026-07-10, tab 3) — the score
          leads at display size, each pillar gets its own full-width meter under a label/value
          line, and read confidence sits in its own column. Same three pillars, same formula,
          same numbers as v7.131 — presentation only. */}
      <div className="orbit-card oiq-rise p-5" style={{ borderColor: 'var(--ca-108-99-255-0_4)', ['--oiq-i' as any]: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 22, alignItems: 'center' }}>
          <div style={{ paddingRight: 22, borderRight: '1px solid var(--c-1e1e2e)', minWidth: 168 }}>
            <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--c-8888aa)', fontWeight: 700 }}>Overall Visibility Score</p>
            <p style={{ margin: '8px 0 0', fontSize: 52, fontWeight: 800, lineHeight: 1, color: geoScoreColor, letterSpacing: '-.02em' }}>
              <CountValue value={geoScore} animate={animate} />
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--c-555570)' }}>/100</span>
            </p>
          </div>
          <div>
            <div className="flex flex-col gap-3">
              {scoreDims.map((d, i) => (
                <div key={d.label}>
                  <div className="flex items-baseline justify-between" style={{ marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: 'var(--c-c0c0e0)' }}>{d.label}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-f0f0ff)' }}>
                      <CountValue value={d.val} decimals={Number.isInteger(d.val) ? 0 : 1} animate={animate} />
                    </span>
                  </div>
                  <Meter pct={d.val} color={d.color} index={i} height={8} />
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--c-555570)' }}>
              Equal-weighted ⅓ each · {scoreDims.map(d => `${d.label.toLowerCase()} ${d.val}`).join(' · ')}{aiMeasured ? '' : ' · AI not yet measured (excluded)'}
            </p>
          </div>
          <div style={{ textAlign: 'center', paddingLeft: 22, borderLeft: '1px solid var(--c-1e1e2e)', minWidth: 138 }}>
            <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--c-8888aa)', fontWeight: 700 }}>Read confidence</p>
            <p style={{ margin: '8px 0 4px', fontSize: 34, fontWeight: 800, lineHeight: 1, color: confColor }}>
              <CountValue value={confidencePct} suffix="%" animate={animate} />
            </p>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--c-555570)', lineHeight: 1.4 }}>
              {signalsOk} of {signals.length} signals{missingSignals.length > 0 ? ` · missing: ${missingSignals.join(', ')}` : ' · all present'}
            </p>
          </div>
        </div>
      </div>

      {/* v7.386 (Wayne 2026-07-31): "The landscape" block removed. Its framing sentence — the
          contrast between page-1 rankings won and AI answers cited — is now computed live inside
          the Key Insights rail (K1, "Two worlds of visibility") off the same two figures. What did
          NOT come with it is the AI narrative paragraph: that prose is written ONCE at analysis
          time while every card here recomputes live, which is why it carried a freshness stamp and
          why QC audit A2 caught it stating "9% capture" beside a live 3% SoV card. Stale prose
          beside live numbers is the exact failure Const I.1/I.5 exists to prevent. */}

      {/* ═══ THE APPROACH — TWO WORLDS OF VISIBILITY ═══ */}
      {/* v7.382: rebuilt to the approved mockup — display-size figures, one supporting
          line each, staggered entry (M1), and each card opens the deep panel it rolls up
          from (F5). The 4th card is Winnable prompts when the AI Answer Engines panel has
          data (Wayne 2026-07-31) and falls back to the Journey card when it doesn't, so
          the row is never padded with an empty box and never loses the journey read. */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2 text-orbit-tertiary">
          The approach · two worlds of visibility
        </p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {([
            // v7.280: "Traditional" renamed to "Google SERP Ranks" (Wayne).
            { key: 'trad', accent: 'var(--c-22c55e)', icon: 'Google SERP Ranks', nav: 'serp', navLabel: 'Open Google Ranks',
              num: dbLoaded ? page1Pct : null, dec: 0, suffix: '%', bigColor: 'var(--c-f0f0ff)',
              sub: dbLoaded ? `of demand ranked page 1 · ${top3VolPct}% ranks 1–3` : 'reading keyword data…' },
            { key: 'ai', accent: 'var(--c-ef4444)', icon: 'AI visibility', nav: 'aiEngines', navLabel: 'Open AI Answer Engines',
              num: aiVisPct, dec: aiVisPct !== null && !Number.isInteger(aiVisPct) ? 1 : 0, suffix: '%', bigColor: aiVisColor,
              sub: aiVisDenom },
            // v7.280: Coverage shows BOTH halves of the Content Map (05) — optimise + build.
            { key: 'gap', accent: 'var(--c-f59e0b)', icon: 'Coverage map', nav: 'content', navLabel: 'Open Content Map',
              num: dbLoaded ? coverageTopics : null, dec: 0, suffix: '', bigColor: 'var(--c-f59e0b)',
              sub: dbLoaded
                ? `page${coverageTopics === 1 ? '' : 's'} · ${optimizeTopics} optimize · ${netNewTopics} net-new build`
                : 'mapping pages…' },
            ...(pfHasData
              ? [{ key: 'winnable', accent: 'var(--c-06b6d4)', icon: 'Winnable prompts', nav: 'aiEngines', navLabel: 'Open AI Answer Engines',
                  num: pfMetrics!.gaps.length, dec: 0, suffix: '', bigColor: 'var(--c-06b6d4)',
                  sub: pfMetrics!.gaps.length > 0
                    ? `rivals cited, you absent · led by ${pfMetrics!.gaps[0].leader}`
                    : 'none — you appear everywhere tested' }]
              // Honest fallback (Const I.5): with no AI Answer Engines data there are no
              // winnable prompts to count, so the card keeps showing the journey read.
              : [{ key: 'journey', accent: 'var(--c-06b6d4)', icon: 'Journey', nav: 'journeys', navLabel: 'Open Journeys',
                  num: dbLoaded ? journeyLanes.productCovered : null, dec: 0, suffix: '', bigColor: 'var(--c-06b6d4)',
                  sub: dbLoaded
                    ? `of ${journeyLanes.productTotal} product topics with coverage · pre-product ${journeyLanes.preTotal > 0 ? `${journeyLanes.preCovered} of ${journeyLanes.preTotal}` : 'not built yet'}`
                    : 'reading journey data…' }]),
          ] as Array<{ key: string; accent: string; icon: string; nav: string; navLabel: string; num: number | null; dec: number; suffix: string; bigColor: string; sub: string }>).map((b, i) => {
            const clickable = typeof onNavigate === 'function';
            return (
              <div key={b.key} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                title={clickable ? `${b.navLabel} →` : undefined}
                onClick={clickable ? () => onNavigate!(b.nav) : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate!(b.nav); } } : undefined}
                className="orbit-card oiq-rise p-3.5"
                style={{ borderLeft: `3px solid ${b.accent}`, borderRadius: '0 8px 8px 0',
                  cursor: clickable ? 'pointer' : 'default', ['--oiq-i' as any]: i + 1 }}>
                <p className="text-[10px] uppercase font-bold" style={{ color: b.accent, letterSpacing: '.08em' }}>{b.icon}</p>
                <p className="font-bold leading-none" style={{ fontSize: 30, color: b.bigColor, margin: '8px 0 0', letterSpacing: '-.02em' }}>
                  <CountValue value={b.num} decimals={b.dec} suffix={b.suffix} animate={animate} />
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--c-8888aa)', marginTop: 6, lineHeight: 1.45 }}>{b.sub}</p>
                {clickable ? (
                  <p style={{ fontSize: 9.5, color: 'var(--c-6c63ff)', marginTop: 7 }}>{b.navLabel} →</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

        {/* v7.383: these three read fine at the narrowed column width, and moving them up
            here balances the row against the rail — otherwise the rail towers over a short
            left column and leaves a band of dead space beside it. The wide blocks (SoV
            donut, per-engine chart, priorities) stay full width below. */}
      {/* v7.384 (Wayne 2026-07-31): the two standalone finding rows that sat here — A6
          "Known, never recommended" and A8 "AI whitespace" — were removed from the panel
          body. Both findings now live in the Key Insights rail under Missed opportunities,
          adopted verbatim from the same v7.366 rules, so nothing was lost, only re-homed. */}

      {/* ═══ v7.312: AI ANSWER ENGINES — CMO VIEW (rolls up from nav 09) ═══ */}
      {pfHasData ? (
        <div className="orbit-card p-4" style={{ borderColor: 'var(--ca-239-68-68-0_12)' }}>
          <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: 6 }}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-orbit-tertiary">AI answer engines · what a CMO should know</p>
            <span className="text-[9px]" style={{ color: 'var(--c-555570)' }}>
              from AI Answer Engines (09) · {pfMetrics!.client} · updated {new Date(pfMetrics!.updatedAt).toLocaleDateString()}
            </span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <SignalCard source="Invisible engines" value={`${aiEnginesZero} of ${aiEnginesTot}`}
              desc={pfScoreEngines.filter(e => e.hits === 0).map(e => e.platform).join(', ') || 'present on all engines'} accentColor="var(--c-ef4444)" />
            <SignalCard source="Topic whitespace" value={`${aiTopicsZero} of ${aiTopicsTot}`}
              desc="topics with 0% AI presence" accentColor="var(--c-f59e0b)" />
            <SignalCard source="Winnable prompts" value={`${pfMetrics!.gaps.length}`}
              desc={pfMetrics!.gaps.length > 0 ? `rivals cited, you absent · led by ${pfMetrics!.gaps[0].leader}` : 'none — you appear everywhere tested'} accentColor="var(--c-f59e0b)" />
            <SignalCard source="Prompt coverage"
              value={(() => { const c = pfMetrics!.coverage.find(x => x.isClient); return c ? `${c.count} of ${pfMetrics!.promptN}` : '—'; })()}
              desc="prompts where you appear" accentColor="var(--c-6c63ff)" />
          </div>
          {(() => {
            const cs = pfMetrics!.sentBrands.find(s => s.isClient);
            const worst = pfMetrics!.clientThemes.length > 0 ? pfMetrics!.clientThemes[pfMetrics!.clientThemes.length - 1] : null;
            const bits: string[] = [];
            if (cs) { const n = netPctOf(cs.pos, cs.neg); bits.push(`Net AI sentiment ${n > 0 ? '+' : ''}${n} (${cs.pos} positive / ${cs.neg} negative)`); }
            if (worst && netPctOf(worst.pos, worst.neg) < 0) bits.push(`weakest theme: ${worst.theme} (${netPctOf(worst.pos, worst.neg)})`);
            if (pfMetrics!.totalCites > 0) bits.push(`${pfMetrics!.clientDomainCites.toLocaleString()} of ${pfMetrics!.totalCites.toLocaleString()} AI citations point to your domain`);
            return bits.length > 0 ? (
              <p className="text-[10px] mt-2" style={{ color: 'var(--c-8888aa)', lineHeight: 1.6 }}>{bits.join(' · ')}</p>
            ) : (
              <p className="text-[9px] mt-2" style={{ color: 'var(--c-555570)' }}>Add the Sentiment, Platforms &amp; Prompt-Volume exports in the AI Answer Engines panel to surface sentiment, citations &amp; demand here.</p>
            );
          })()}
        </div>
      ) : null}

      {/* ═══ WHERE YOU DISAPPEAR ACROSS THE JOURNEY ═══ */}
      <div className="orbit-card p-4">
        <p className="text-orbit-secondary text-xs font-medium mb-3">Where you disappear across the journey</p>
        <div style={{ display: 'grid', gridTemplateColumns: '84px repeat(4,1fr)', gap: 6, alignItems: 'center' }}>
          <span />
          {journeyStages.map(s => (
            <span key={`h-${s.stage}`} className="text-[9px]" style={{ color: 'var(--c-8888aa)', textAlign: 'center' }}>{s.label}</span>
          ))}

          <span className="text-[9px]" style={{ color: 'var(--c-22c55e)' }}>Organic</span>
          {journeyStages.map(s => {
            const st = STATUS_STYLE[s.status];
            return (
              <div key={`o-${s.stage}`} title={s.total > 0 ? `${Math.round(s.share * 100)}% client share of stage volume` : 'no stage volume'}
                style={{ background: st.bg, color: st.fg, height: 26, borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500 }}>
                {st.label}
              </div>
            );
          })}

          <span className="text-[9px]" style={{ color: 'var(--c-06b6d4)' }}>AI</span>
          {journeyStages.map((s, i) => {
            const r = (aiStageRates[i]?.stage === s.stage ? aiStageRates[i]?.rate : aiStageRates.find(a => a.stage === s.stage)?.rate) ?? null;
            const col = r === null ? 'var(--c-555570)' : r < 15 ? 'var(--c-ef4444)' : r < 40 ? 'var(--c-f59e0b)' : 'var(--c-22c55e)';
            const bg  = r === null ? 'var(--c-16161f)' : 'var(--c-1e1e2e)';
            return (
              <div key={`a-${s.stage}`} title={r === null ? 'no probed category volume in this stage' : `${r}% of AI answers for ${s.label} topics cite you`}
                style={{ background: bg, color: col, height: 26, borderRadius: 4,
                  border: r === null ? '1px dashed var(--c-2a2a3a)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
                {r === null ? 'no data' : `${r}%`}
              </div>
            );
          })}
        </div>
        <p className="text-[9px] mt-2" style={{ color: 'var(--c-555570)' }}>
          AI per-stage = your brand&rsquo;s mention rate in AI answers for each stage&rsquo;s topics (LLM probe category visibility mapped to journey stages). Audience segments and Sentinel live signals are still in build.
        </p>
      </div>

        </div>

        <KeyInsightsRail insights={keyInsights} expanded={showAllInsights}
          onToggle={() => setShowAllInsights(v => !v)} />
      </div>

      {/* ═══ SUPPORTING EVIDENCE: Share of Voice on Google + LLM visibility ═══ */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <SovPanel analysis={analysis} competitors={manualDomains} dbKeywords={dbKeywords} clientLabel={projectName ?? propClientDomain} title="Share of Voice on Google" />

        {/* v7.382: when the AI Answer Engines panel (09) has data, the right-hand slot
            shows per-engine citation rates — the SAME strict series the AI pillar scores
            off, so the chart and the headline can never state two numbers (Const II.6).
            With no Profound data it falls back to the LLM-probe view below, unchanged. */}
        {pfHasData && engineSeries.length > 0 ? (
          <div className="orbit-card oiq-rise p-4" style={{ ['--oiq-i' as any]: 1 }}>
            <p className="text-orbit-secondary text-xs font-medium mb-1">
              AI visibility by engine · % of answers citing {pfMetrics!.client}
            </p>
            <p style={{ fontSize: 9, color: 'var(--c-4a4a70)', marginTop: 2, marginBottom: 12 }}>
              {pfStrict ? 'Profound Visibility prompt set' : 'all tested prompts'} · {pfScoreRuns.toLocaleString()} answers across {engineSeries.length} engine{engineSeries.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-col gap-2.5">
              {engineSeries.map((e, i) => {
                const col = e.hits === 0 ? 'var(--c-ef4444)' : 'var(--c-6c63ff)';
                return (
                  <div key={e.platform} title={`${e.hits.toLocaleString()} of ${e.runs.toLocaleString()} answers on ${e.platform} cite you`}>
                    <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--c-c0c0e0)' }}>{e.platform}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: e.hits === 0 ? 'var(--c-ef4444)' : 'var(--c-f0f0ff)' }}>
                        {e.pct === 0 ? '0%' : `${e.pct < 10 ? e.pct.toFixed(1) : Math.round(e.pct)}%`}
                      </span>
                    </div>
                    <Meter pct={engineMaxPct > 0 ? (100 * e.pct) / engineMaxPct : 0} color={col} index={i} height={7} />
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] mt-3" style={{ color: 'var(--c-555570)', lineHeight: 1.5 }}>
              Bars are scaled to the top engine ({engineMaxPct < 10 ? engineMaxPct.toFixed(1) : Math.round(engineMaxPct)}%) so single-digit rates stay readable — every label is the true rate.
            </p>
          </div>
        ) : (
        <div className="orbit-card p-4">
          <p className="text-orbit-secondary text-xs font-medium mb-1">LLM visibility · AI answer citations</p>
          {(isLlmProbeV1 || isLlmProbeV2) && llmPlatforms.length > 0 ? (
            <>
              {/* v7.283: two large numbers above the per-platform bars — the LLM panel's
                  own Non-branded visibility (unbranded.score) + Branded visibility
                  (branded.score). Real probe rates; shown for a v2 probe only. */}
              {(nonBrandedPct !== null && brandedPct !== null) ? (
                <div className="grid grid-cols-2 gap-2 mb-3 mt-1">
                  <div className="rounded-md px-2.5 py-2 bg-orbit-surface">
                    <p style={{ fontSize: 11, color: 'var(--c-8888aa)' }}>Non-branded visibility</p>
                    <p className="font-bold leading-none" style={{ fontSize: 26, color: aiVisColor, marginTop: 4 }}>{nonBrandedPct}%</p>
                  </div>
                  <div className="rounded-md px-2.5 py-2 bg-orbit-surface">
                    <p style={{ fontSize: 11, color: 'var(--c-8888aa)' }}>Branded visibility</p>
                    <p className="font-bold leading-none" style={{ fontSize: 26, color: 'var(--c-22c55e)', marginTop: 4 }}>{brandedPct}%</p>
                  </div>
                </div>
              ) : null}
              {llmPlatforms.map((p: any) => {
                const pct      = Math.round((p.mentionRate ?? 0) * 100);
                const col      = pct < 34 ? 'var(--c-ef4444)' : pct < 67 ? 'var(--c-f59e0b)' : 'var(--c-22c55e)';
                const bgBadge  = p.platform === 'claude' ? 'var(--ca-108-99-255-0_15)' : 'var(--ca-34-197-94-0_1)';
                const txtBadge = p.platform === 'claude' ? 'var(--c-8b85ff)' : 'var(--c-22c55e)';
                return (
                  <div key={p.platform} className="flex items-center gap-2 mt-2 rounded-md px-2.5 py-1.5 bg-orbit-surface">
                    <span className="text-[9px] font-bold rounded px-1.5 py-1 shrink-0" style={{ background: bgBadge, color: txtBadge }}>
                      {p.platform === 'claude' ? 'CL' : 'GP'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-orbit-primary mb-1">{p.label ?? p.platform}</p>
                      <div className="h-1 rounded-full overflow-hidden bg-orbit-muted">
                        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: col }} />
                      </div>
                      <p className="text-[9px] mt-0.5 text-orbit-tertiary">{p.mentionCount ?? 0}/{p.results?.length ?? 0} prompts cited</p>
                    </div>
                    <span className="text-xs font-bold shrink-0" style={{ color: col }}>{pct}%</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--c-1e1e2e)' }}>
                <span className="text-[10px] text-orbit-secondary">Overall citation rate</span>
                <span className="text-[11px] font-semibold" style={{ color: llmColor }}>{overallLlmRate}% · {overallMentions}/{overallTotal} prompts</span>
              </div>
              {llmSent.total > 0 ? (
                <div className="mt-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-[9px] text-orbit-tertiary">Sentiment when mentioned</span>
                    <span className="text-[9px] text-orbit-tertiary">{llmSent.total} mentions</span>
                  </div>
                  <div className="flex rounded-full overflow-hidden" style={{ height: 6, background: 'var(--c-1e1e2e)' }}>
                    <div style={{ width: `${(llmSent.pos / llmSent.total) * 100}%`, background: 'var(--c-22c55e)' }} />
                    <div style={{ width: `${(llmSent.neu / llmSent.total) * 100}%`, background: 'var(--c-8888aa)' }} />
                    <div style={{ width: `${(llmSent.neg / llmSent.total) * 100}%`, background: 'var(--c-ef4444)' }} />
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[9px]" style={{ color: 'var(--c-22c55e)' }}>{llmSent.pos} positive</span>
                    <span className="text-[9px]" style={{ color: 'var(--c-8888aa)' }}>{llmSent.neu} neutral</span>
                    <span className="text-[9px]" style={{ color: 'var(--c-ef4444)' }}>{llmSent.neg} negative</span>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-orbit-tertiary text-[10px] mt-2">Run the LLM probe to see AI answer citations.</p>
          )}
        </div>
        )}
      </div>

      {/* v7.385 (Wayne 2026-07-31): the "Where to spend first · effort vs payoff" ladder was
          removed. Its three measured readings already live in the Key Insights rail — near-misses
          and page-2 climbers under Quick wins (K8), net-new gap keywords under Competitors
          outperforming (K10) — each with the same real counts and real search volume. The only
          thing that left with the block is the MODELED click estimate per tier, which is a net
          gain in honesty rather than a loss of data (Const I.1/I.5a). */}

      {/* ═══ THE CONTINUOUS CYCLE — SECURE THE COVERAGE GAPS ═══ */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2 text-orbit-tertiary"
          style={{ borderTop: '1px solid var(--c-1e1e2e)', paddingTop: 10 }}>
          The continuous cycle · {hasFallbackActions ? 'recommended priorities to secure coverage' : 'AI-generated priorities to secure coverage'}{!hasFallbackActions && analysisDateLabel ? ` · written at analysis (${analysisDateLabel})` : ''}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {actions.map((a, i) => {
            const catColor = CATEGORY_TEXT[a.category]  ?? 'var(--c-8b85ff)';
            const catBg    = CATEGORY_COLOR[a.category] ?? 'var(--ca-108-99-255-0_12)';
            return (
              <div key={a.id ?? a.rank ?? i} className="orbit-card p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: 'var(--c-6c63ff)' }}>
                    {i + 1}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: catBg, color: catColor }}>
                    {a.category}
                  </span>
                </div>
                <p className="text-orbit-primary text-xs font-semibold leading-snug">{a.title}</p>
                <p className="text-orbit-secondary text-[10px] leading-relaxed flex-1">{a.summary}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SLIM ROLL-UP FOOTER ═══ */}
      <div className="flex items-center justify-between gap-3"
        style={{ borderTop: '1px solid var(--c-1e1e2e)', paddingTop: 10, flexWrap: 'wrap' }}>
        <span className="text-[9px]" style={{ color: 'var(--c-555570)' }}>
          Snapshot · one frame in a continuous cycle — Sentinel + IQ.Impact monitoring keep this current.
        </span>
        <span className="text-[9px]" style={{ color: 'var(--c-8888aa)' }}>
          Rolls up · Score {geoScore} · Ranks {dbLoaded ? `${page1Pct}%` : '—'} · AI {pfHasData ? `${aiVisPct}%` : '—'} · SOV {_sov.availableClicks > 0 ? `${Math.round(clientShare * 100)}%` : '—'} · Gaps {gapKwCount} · AIO {aioAvail > 0 ? `${aioRate}%` : '—'} · LLM {overallTotal > 0 ? `${overallLlmRate}%` : '—'} · Journeys {journeyStagesCovered}/4
        </span>
      </div>

    </div>
  );
}
