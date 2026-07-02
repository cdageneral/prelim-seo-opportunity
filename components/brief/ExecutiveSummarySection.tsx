'use client';

import { useState, useMemo, useEffect } from 'react';
import { buildKwPool, computeVolumeMetrics } from '@/lib/utils/kwVolume';
import { SovPanel, computeSov, ctrAt } from '@/components/brief/GoogleSerpSection';
import { buildClusters, journeyLaneSummary } from '@/components/brief/JourneySection';
// v7.279: Coverage-gap card reads the SAME canonical content-map build the Content
// Map panel (05) renders — buildCanonicalClusterTopics → buildContentPlanFromTopics
// — so the exec card's net-new topic count + volume reconcile to that panel (II.6/II.7).
import { buildCanonicalClusterTopics, type IntentType } from '@/components/brief/ThemeClustersPanel';
import { buildContentPlanFromTopics, planFromSnapshot } from '@/lib/journey/contentPlan';
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

function firstSentences(text: string, n: number): string {
  const m = text.match(/[^.!?]*[.!?]+/g) ?? [];
  return m.slice(0, n).join(' ').trim() || text;
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
  const narrative: any = semSnap._narrative         ?? {};

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
    () => canonicalTopics.length > 0 ? buildContentPlanFromTopics(canonicalTopics) : planFromSnapshot(analysis, dbKeywords),
    [canonicalTopics, analysis, dbKeywords],
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

  // ── Narrative ─────────────────────────────────────────────────────────────
  const rawNarrative =
    narrative.marketPositionNarrative ??
    narrative.strategicCall           ??
    narrative.competitorGapNarrative  ?? '';
  const narrativeText = rawNarrative ? firstSentences(rawNarrative, 4) : '';
  // v7.334: the AI narrative + AI-generated priorities are written ONCE at analysis time,
  // while the cards on this page recompute live (pool + later scans/uploads). Stamp the
  // synthesis-time content with its analysis date so a reader never takes those figures
  // as current (QC audit A2: narrative said "9% capture" beside a live 3% SoV card).
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
  const pfVisExact: number | null = pfHasData ? (100 * pfMetrics!.clientHits / pfMetrics!.totalRuns) : null;
  const aiEnginesZero = pfHasData ? pfMetrics!.engines.filter(e => e.hits === 0).length : 0;
  const aiEnginesTot  = pfHasData ? pfMetrics!.engines.length : 0;
  const aiTopicsZero  = pfHasData ? pfMetrics!.topics.filter(t => t.hits === 0).length : 0;
  const aiTopicsTot   = pfHasData ? pfMetrics!.topics.length : 0;
  const aiVisPct: number | null =
    pfVisExact !== null ? Math.round(pfVisExact * 10) / 10
    : llmMentionPct !== null ? llmMentionPct
    : aioAvail > 0 ? aioRate
    : null;
  const aiVisDenom =
    pfHasData ? `of ${pfMetrics!.totalRuns.toLocaleString()} AI answers across ${aiEnginesTot} engines`
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

  // ── v7.131: Quick-wins ladder + modeled value-at-stake (CTR-by-position) ────
  // v7.245: CTR curve unified — uses the shared ctrAt() (GrowthSRC 2025) imported
  // from GoogleSerpSection, the SAME curve the Share-of-Voice metric uses, so the
  // exec's value-at-stake and the SoV donut reconcile on one CTR source of truth.
  const nearMiss    = posKws.filter(k => k.position >= 4 && k.position <= 10);
  const climber     = posKws.filter(k => k.position >= 11 && k.position <= 20);
  const nearMissVol = nearMiss.reduce((s, k) => s + k.searchVolume, 0);
  const climberVol  = climber.reduce((s, k) => s + k.searchVolume, 0);
  const quickClicks = Math.round(nearMiss.reduce((s, k) => s + Math.max(0, ctrAt(3) - ctrAt(k.position)) * k.searchVolume * 12, 0));
  const climbClicks = Math.round(climber.reduce((s, k) => s + Math.max(0, ctrAt(8) - ctrAt(k.position)) * k.searchVolume * 12, 0));
  const betClicks   = Math.round(ctrAt(8) * gapVolume * 12);
  const ladder = [
    { tier: 'Quick win', color: 'var(--c-22c55e)', move: 'Near-misses (pos 4–10) → push to top 3',     n: nearMiss.length, volMonthly: nearMissVol, clicks: quickClicks },
    { tier: 'Climber',   color: 'var(--c-f59e0b)', move: 'Page-2 (pos 11–20) → push to page 1',         n: climber.length,  volMonthly: climberVol,  clicks: climbClicks },
    { tier: 'Big bet',   color: 'var(--c-ef4444)', move: 'Net-new (gaps) → build content authority',    n: gapKwCount,      volMonthly: gapVolume,   clicks: betClicks },
  ];

  // ── v7.134: LLM sentiment-when-mentioned for the LLM-visibility card ────────
  const _llmSent: any = llmSnap.sentiment ?? {};
  const llmSent = {
    pos:   _llmSent.positive ?? 0,
    neu:   _llmSent.neutral  ?? 0,
    neg:   _llmSent.negative ?? 0,
    total: _llmSent.totalMentions ?? ((_llmSent.positive ?? 0) + (_llmSent.neutral ?? 0) + (_llmSent.negative ?? 0)),
  };

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

      {/* ═══ v7.131 — OVERALL VISIBILITY SCORE + READ CONFIDENCE (lead KPI) ═══ */}
      {/* v7.279: renamed from "GEO Visibility Score" to "Overall Visibility Score" (Wayne). */}
      <div className="orbit-card p-4" style={{ borderColor: 'var(--ca-108-99-255-0_4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'center' }}>
          <div style={{ textAlign: 'center', paddingRight: 14, borderRight: '1px solid var(--c-1e1e2e)' }}>
            <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--c-8888aa)' }}>Overall Visibility Score</p>
            <p style={{ margin: '4px 0 0', fontSize: 40, fontWeight: 800, lineHeight: 1, color: geoScoreColor }}>
              {geoScore}<span style={{ fontSize: 16, color: 'var(--c-555570)' }}>/100</span>
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 10, color: 'var(--c-555570)' }}>
              Equal-weighted ⅓ each · {scoreDims.map(d => `${d.label.toLowerCase()} ${d.val}`).join(' · ')}{aiMeasured ? '' : ' · AI not yet measured (excluded)'}
            </p>
            <div className="flex flex-col gap-1.5">
              {scoreDims.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <span style={{ width: 118, fontSize: 11, color: d.color }}>{d.label}</span>
                  <div style={{ flex: 1, background: 'var(--c-1e1e2e)', borderRadius: 3, height: 7 }}>
                    <div style={{ width: `${Math.min(100, d.val)}%`, background: d.color, height: 7, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--c-8888aa)', width: 28, textAlign: 'right' }}>{d.val}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'center', paddingLeft: 14, borderLeft: '1px solid var(--c-1e1e2e)', minWidth: 110 }}>
            <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--c-8888aa)' }}>Read confidence</p>
            <p style={{ margin: '4px 0 2px', fontSize: 22, fontWeight: 700, color: confColor }}>{confidencePct}%</p>
            <p style={{ margin: 0, fontSize: 9, color: 'var(--c-555570)' }}>
              {signalsOk} of {signals.length} signals{missingSignals.length > 0 ? ` · missing: ${missingSignals.join(', ')}` : ' · all present'}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ THE LANDSCAPE — headline renders ONLY when narrative data exists ═══ */}
      {narrativeText ? (
        <div className="orbit-card p-4" style={{ borderColor: 'var(--ca-108-99-255-0_4)' }}>
          <p className="text-[9px] uppercase mb-1" style={{ color: 'var(--c-6c63ff)', letterSpacing: '.12em' }}>
            The landscape · your position in the new discovery ecosystem
          </p>
          <p className="font-semibold" style={{ fontSize: 18, color: 'var(--c-f0f0ff)', lineHeight: 1.35 }}>
            You win page-1 rankings for <span style={{ color: 'var(--c-22c55e)' }}>{page1Pct}%</span> of demand
            {aiVisPct !== null
              ? <> — but you&rsquo;re cited in just <span style={{ color: aiVisColor }}>{aiVisPct}%</span> of the AI answers your buyers now read first.</>
              : <>. AI-answer visibility is not yet measured — run an AIO scan to see it.</>}
          </p>
          <p className="text-orbit-secondary mt-2" style={{ fontSize: 11, lineHeight: 1.6 }}>
            {narrativeText}
          </p>
          {/* v7.334: honest freshness label (I.5) — narrative figures are analysis-time */}
          <p className="text-[9px] mt-2" style={{ color: 'var(--c-555570)' }}>
            AI narrative written at analysis{analysisDateLabel ? ` (${analysisDateLabel})` : ''} — the cards below recompute live and are the current numbers.
          </p>
        </div>
      ) : null}

      {/* ═══ THE APPROACH — TWO WORLDS OF VISIBILITY ═══ */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2 text-orbit-tertiary">
          The approach · two worlds of visibility
        </p>
        <div className="grid grid-cols-4 gap-2">
          {([
            // v7.280: "Traditional" renamed to "Google SERP Ranks" (Wayne).
            { key: 'trad', accent: 'var(--c-22c55e)', icon: 'Google SERP Ranks',
              big: dbLoaded ? `${page1Pct}%` : '—', bigSuffix: '', bigColor: 'var(--c-f0f0ff)',
              sub: 'of demand ranked page 1',
              breakdown: dbLoaded ? [
                { label: 'Ranks 1\u20133', val: `${top3VolPct}%` },
                { label: 'Ranks 4\u201310', val: `${rank410Pct}%` },
              ] : undefined },
            { key: 'ai', accent: 'var(--c-ef4444)', icon: 'AI visibility',
              big: aiVisPct !== null ? `${aiVisPct}%` : '—', bigSuffix: '', bigColor: aiVisColor,
              sub: aiVisDenom,
              // v7.312: when the AI Answer Engines panel has data, the breakdown shows the
              // two figures a CMO acts on — engines & topics with zero presence. Falls back
              // to the LLM probe's non-branded/branded split when only the probe is present.
              breakdown: pfHasData ? [
                { label: 'Engines at 0%', val: `${aiEnginesZero}/${aiEnginesTot}` },
                { label: 'Topics at 0%', val: `${aiTopicsZero}/${aiTopicsTot}` },
              ] : (nonBrandedPct !== null && brandedPct !== null) ? [
                { label: 'Non-branded', val: `${nonBrandedPct}%` },
                { label: 'Branded', val: `${brandedPct}%` },
              ] : undefined },
            // v7.280: Coverage now shows BOTH halves of the Content Map (05) — existing
            // pages to optimise + net-new pages to build (Wayne).
            { key: 'gap', accent: 'var(--c-f59e0b)', icon: 'Coverage map',
              big: dbLoaded ? `${coverageTopics}` : '—', bigSuffix: dbLoaded ? (coverageTopics === 1 ? ' page' : ' pages') : '', bigColor: 'var(--c-f59e0b)',
              sub: dbLoaded ? undefined : 'mapping pages…',
              breakdown: dbLoaded ? [
                { label: 'Existing (optimize)', val: `${optimizeTopics}` },
                { label: 'Net-new (build)', val: `${netNewTopics}` },
              ] : undefined },
            // v7.280: Journey split into two stacked rows — pre-product (top) + product.
            // v7.281: counts come straight from the Journey panel's lane split
            // (journeyLaneSummary) — pre-product shows "—/not built yet" until the deep
            // journey exists, exactly like the panel's "Pre-product journey 0".
            { key: 'journey', accent: 'var(--c-06b6d4)', icon: 'Journey',
              rows: [
                { label: 'Pre-product', big: journeyLanes.preTotal > 0 ? `${journeyLanes.preCovered}` : '—',
                  suffix: journeyLanes.preTotal > 0 ? ` of ${journeyLanes.preTotal}` : '',
                  sub: journeyLanes.preTotal > 0 ? 'topics with coverage' : 'not built yet' },
                { label: 'Product', big: dbLoaded ? `${journeyLanes.productCovered}` : '—',
                  suffix: dbLoaded ? ` of ${journeyLanes.productTotal}` : '',
                  sub: 'topics with coverage' },
              ] },
          ] as Array<{ key: string; accent: string; icon: string; big?: string; bigSuffix?: string; bigColor?: string; sub?: string; rows?: Array<{ label: string; big: string; suffix: string; sub: string }>; breakdown?: Array<{ label: string; val: string }> }>).map(b => (
            <div key={b.key} className="orbit-card p-3"
              style={{ borderLeft: `3px solid ${b.accent}`, borderRadius: '0 8px 8px 0' }}>
              <p className="text-[9px] uppercase tracking-wider font-bold" style={{ color: b.accent }}>{b.icon}</p>
              {b.rows ? (
                <div className="flex flex-col gap-2 mt-1.5">
                  {b.rows.map(r => (
                    <div key={r.label}>
                      <p className="uppercase tracking-wider font-semibold" style={{ fontSize: 10, color: 'var(--c-c0c0e0)' }}>{r.label}</p>
                      <p className="font-bold leading-none" style={{ fontSize: 19, color: 'var(--c-f0f0ff)', marginTop: 2 }}>
                        {r.big}{r.suffix ? <span style={{ fontSize: 12, color: 'var(--c-8888aa)' }}>{r.suffix}</span> : null}
                      </p>
                      <p className="mt-0.5" style={{ fontSize: 10, color: 'var(--c-8888aa)' }}>{r.sub}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className="font-bold leading-none" style={{ fontSize: 24, color: b.bigColor ?? 'var(--c-f0f0ff)', marginTop: 8 }}>
                    {b.big}{b.bigSuffix ? <span style={{ fontSize: 13, color: 'var(--c-8888aa)' }}>{b.bigSuffix}</span> : null}
                  </p>
                  {b.sub ? <p className="mt-1" style={{ fontSize: 11, color: 'var(--c-8888aa)' }}>{b.sub}</p> : null}
                  {b.breakdown ? (
                    <div className="flex flex-col gap-1 mt-2">
                      {b.breakdown.map(d => (
                        <div key={d.label} className="flex items-center justify-between" style={{ gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--c-c0c0e0)' }}>{d.label}</span>
                          <span className="font-bold" style={{ fontSize: 14, color: 'var(--c-e8e8ff)' }}>{d.val}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

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
              desc={pfMetrics!.engines.filter(e => e.hits === 0).map(e => e.platform).join(', ') || 'present on all engines'} accentColor="var(--c-ef4444)" />
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

      {/* ═══ SUPPORTING EVIDENCE: Share of Voice on Google + LLM visibility ═══ */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <SovPanel analysis={analysis} competitors={manualDomains} dbKeywords={dbKeywords} clientLabel={projectName ?? propClientDomain} title="Share of Voice on Google" />

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
      </div>

      {/* ═══ WHERE TO SPEND FIRST — QUICK-WINS LADDER (effort vs payoff) ═══ */}
      <div className="orbit-card p-4">
        <p className="text-orbit-secondary text-xs font-medium mb-3">Where to spend first · effort vs payoff</p>
        <div className="flex flex-col gap-2">
          {ladder.map(t => (
            <div key={t.tier} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.color }}>{t.tier}</span>
              <span style={{ fontSize: 11, color: 'var(--c-f0f0ff)' }}>{t.move}</span>
              <span style={{ fontSize: 11, color: 'var(--c-8888aa)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {t.n.toLocaleString()} kws · {fmtAnnual(t.volMonthly)}/yr · <span style={{ color: 'var(--c-6c63ff)' }}>~{fmtCompact(t.clicks)} clicks</span>
              </span>
            </div>
          ))}
        </div>
        <p className="text-[9px] mt-2" style={{ color: 'var(--c-555570)' }}>
          Keyword counts and searches/yr are measured. Estimated clicks are <span style={{ color: 'var(--c-8888aa)' }}>modeled</span> from the GrowthSRC 2025 organic CTR-by-position curve (pos 1≈19%, pos 3≈9.8%, pos 8≈2.7%); they show the upside of each move, not a guarantee.
        </p>
      </div>

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
