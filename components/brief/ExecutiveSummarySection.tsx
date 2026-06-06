'use client';

import { useState, useMemo, useEffect } from 'react';
import { buildKwPool, computeVolumeMetrics } from '@/lib/utils/kwVolume';
import { SovPanel, computeSov } from '@/components/brief/GoogleSerpSection';
import { buildClusters } from '@/components/brief/JourneySection';

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-orbit-border last:border-0">
      <span className="text-[10px] text-orbit-secondary">{label}</span>
      <span className="text-[11px] font-semibold" style={{ color: valueColor ?? '#F0F0FF' }}>{value}</span>
    </div>
  );
}

function SignalCard({ source, value, desc, accentColor }: {
  source: string; value: string; desc: string; accentColor: string;
}) {
  return (
    <div className="px-3 py-2.5 mb-1.5"
      style={{
        background: '#111118', borderLeft: `3px solid ${accentColor}`,
        borderTop: '1px solid #1E1E2E', borderRight: '1px solid #1E1E2E',
        borderBottom: '1px solid #1E1E2E', borderRadius: '0 6px 6px 0',
      }}>
      <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: accentColor }}>
        {source}
      </p>
      <p className="text-[17px] font-bold leading-tight" style={{ color: '#F0F0FF' }}>{value}</p>
      <p className="text-[9px] leading-snug mt-0.5" style={{ color: '#8888AA' }}>{desc}</p>
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
  const totalVol   = kwPool.reduce((s, item) => s + (item.isGap ? 0 : (item.searchVolume ?? 0)), 0);
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

  // ── SERP features ─────────────────────────────────────────────────────────
  const aioAvail = analysis.aioAvailable ?? 0;
  const aioAcq   = analysis.aioAcquired  ?? 0;
  const aioRate  = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;
  const featSum  = serpSnap.serpFeatureSummary ?? {};
  const paaAvail = featSum.withPAA         ?? 0;
  const paaAcq   = featSum.paaClientCited  ?? 0;
  const vidAvail = featSum.withVideo       ?? 0;
  const vidAcq   = featSum.videoClientCited ?? 0;
  const totalAvail = aioAvail + paaAvail + vidAvail;
  const totalAcq   = aioAcq  + paaAcq   + vidAcq;
  const combinedSerpRate = totalAvail > 0 ? Math.round((totalAcq / totalAvail) * 100) : 0;

  // ── Competitor market share ───────────────────────────────────────────────
  // v7.129 — Now sourced from computeSov() — the SAME computation the Share-of-
  // Voice donut (SovPanel, nav 06) renders, and the SovPanel shown right below
  // in this exec. Previously the hero built its own organic-traffic-only share
  // truncated to the top 4 competitors, so the "topComp holds X%" figure in the
  // narrative disagreed with the donut beside it. They now reconcile by
  // construction: identical ranked entries, identical denominator (= sum of all
  // entry voices), identical basis (traffic when Semrush traffic exists, else
  // page-1 keyword volume). Pass the SAME competitors (manualDomains) and label
  // used for this exec's SovPanel render so the two cards match exactly.
  const clientDomain = normDomain(propClientDomain ?? analysis.domain ?? '');
  const _sov         = useMemo(
    () => computeSov({ analysis, competitors: manualDomains, dbKeywords, clientLabel: projectName ?? propClientDomain }),
    [analysis, manualDomains, dbKeywords, projectName, propClientDomain],
  );
  const sovTotal     = _sov.total;
  const sovClient    = _sov.rawEntries.find(e => e.type === 'client');
  const sovComps     = _sov.rawEntries.filter(e => e.type !== 'client');  // already sorted by voice desc
  const _topEntry    = sovTotal > 0 && sovComps.length > 0 ? sovComps[0] : undefined;
  const topComp      = _topEntry ? { domain: normDomain(_topEntry.domain), traffic: _topEntry.traffic } : undefined;
  const topCompShare = topComp && sovTotal > 0 ? topComp.traffic / sovTotal : 0;
  const clientShare  = sovTotal > 0 && sovClient ? sovClient.traffic / sovTotal : captureRate;
  const gapVsTop     = topCompShare - clientShare;

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

  // ── Color helpers ─────────────────────────────────────────────────────────
  const captureColor = captureRate < 0.15 ? '#EF4444' : captureRate < 0.35 ? '#F59E0B' : '#22C55E';
  const llmColor     = overallLlmRate < 34 ? '#EF4444' : overallLlmRate < 67 ? '#F59E0B' : '#22C55E';
  const pg1Color     = page1Pct < 30 ? '#F59E0B' : '#22C55E';
  const aioColor     = aioRate < 20 ? '#EF4444' : aioRate < 50 ? '#F59E0B' : '#06B6D4';
  const avgPosColor  = weightedPos > 0 && weightedPos <= 5 ? '#22C55E'
    : weightedPos <= 20 ? '#F59E0B' : '#EF4444';

  const CATEGORY_COLOR: Record<string, string> = {
    SEO: 'rgba(108,99,255,.15)', GEO: 'rgba(6,182,212,.12)', Content: 'rgba(139,133,255,.12)',
    Technical: 'rgba(245,158,11,.12)', Competitive: 'rgba(239,68,68,.12)',
  };
  const CATEGORY_TEXT: Record<string, string> = {
    SEO: '#8B85FF', GEO: '#06B6D4', Content: '#8B85FF', Technical: '#F59E0B', Competitive: '#EF4444',
  };

  // ── AI visibility — single defendable figure (v7.130) ──────────────────────
  const aiVisPct: number | null =
    aioAvail > 0 ? aioRate
    : overallTotal > 0 ? overallLlmRate
    : null;
  const aiVisDenom =
    aioAvail > 0 ? `of ${aioAvail} AI Overviews citing you`
    : overallTotal > 0 ? `of ${overallTotal} AI probes citing you`
    : 'run an AIO scan to measure';
  const aiVisColor = aiVisPct === null ? '#555570' : aiVisPct < 20 ? '#EF4444' : aiVisPct < 50 ? '#F59E0B' : '#22C55E';

  const STATUS_STYLE: Record<'present' | 'thin' | 'absent', { bg: string; fg: string; label: string }> = {
    present: { bg: '#166534', fg: '#86EFAC', label: 'present' },
    thin:    { bg: '#854D0E', fg: '#FDE68A', label: 'thin' },
    absent:  { bg: '#2A2A3A', fg: '#8888AA', label: 'absent' },
  };

  // ── v7.131: GEO Visibility Score (equal-weighted; formula shown on screen) ──
  const scoreDims = [
    { label: 'Traditional', val: page1Pct, color: '#22C55E' },
    ...(aiVisPct !== null ? [{ label: 'AI visibility', val: aiVisPct, color: '#EF4444' }] : []),
    { label: 'Journey', val: Math.round((journeyStagesCovered / 4) * 100), color: '#06B6D4' },
  ];
  const geoScore = scoreDims.length ? Math.round(scoreDims.reduce((s, d) => s + d.val, 0) / scoreDims.length) : 0;
  const geoScoreColor = geoScore < 25 ? '#EF4444' : geoScore < 50 ? '#F59E0B' : '#22C55E';
  const aiMeasured = aiVisPct !== null;

  // ── v7.131: Read-confidence meter (which data signals are present) ──────────
  const signals = [
    { key: 'Keywords',          ok: totalKws > 0 },
    { key: 'Competitors',       ok: sovComps.length > 0 },
    { key: 'AI Overviews',      ok: aioAvail > 0 },
    { key: 'LLM probe',         ok: overallTotal > 0 },
    { key: 'Journey clusters',  ok: (clusterCount > 0 || categories.length > 0) },
  ];
  const signalsOk      = signals.filter(s => s.ok).length;
  const confidencePct  = Math.round((signalsOk / signals.length) * 100);
  const missingSignals = signals.filter(s => !s.ok).map(s => s.key);
  const confColor      = confidencePct >= 80 ? '#22C55E' : confidencePct >= 50 ? '#F59E0B' : '#EF4444';

  // ── v7.131: Quick-wins ladder + modeled value-at-stake (CTR-by-position) ────
  const CTR: Record<number, number> = { 1: .28, 2: .15, 3: .10, 4: .07, 5: .05, 6: .04, 7: .03, 8: .025, 9: .02, 10: .018 };
  const ctrAt = (p: number) => CTR[p] ?? (p <= 20 ? 0.01 : 0.005);
  const nearMiss    = posKws.filter(k => k.position >= 4 && k.position <= 10);
  const climber     = posKws.filter(k => k.position >= 11 && k.position <= 20);
  const nearMissVol = nearMiss.reduce((s, k) => s + k.searchVolume, 0);
  const climberVol  = climber.reduce((s, k) => s + k.searchVolume, 0);
  const quickClicks = Math.round(nearMiss.reduce((s, k) => s + Math.max(0, ctrAt(3) - ctrAt(k.position)) * k.searchVolume * 12, 0));
  const climbClicks = Math.round(climber.reduce((s, k) => s + Math.max(0, ctrAt(8) - ctrAt(k.position)) * k.searchVolume * 12, 0));
  const betClicks   = Math.round(ctrAt(8) * gapVolume * 12);
  const ladder = [
    { tier: 'Quick win', color: '#22C55E', move: 'Near-misses (pos 4–10) → push to top 3',     n: nearMiss.length, volMonthly: nearMissVol, clicks: quickClicks },
    { tier: 'Climber',   color: '#F59E0B', move: 'Page-2 (pos 11–20) → push to page 1',         n: climber.length,  volMonthly: climberVol,  clicks: climbClicks },
    { tier: 'Big bet',   color: '#EF4444', move: 'Net-new (gaps) → build content authority',    n: gapKwCount,      volMonthly: gapVolume,   clicks: betClicks },
  ];

  // ── v7.131: Head-to-head vs top rival (same SOV + gap pool, no new data) ────
  const rivalDomain   = topComp ? topComp.domain : '';
  const clientPage1Kw = page1Kws;
  const rivalPage1Kw  = rivalDomain
    ? dbKeywords.filter(k => normDomain((k as any).domain ?? '') === rivalDomain && k.position != null && Number(k.position) > 0 && Number(k.position) <= 10).length
    : 0;
  const rivalGapCount = rivalDomain ? gapItems.filter(i => normDomain(i.competitor ?? '') === rivalDomain).length : 0;

  // ── Defer render until DB keywords resolve (prevents stale capture-rate flash) ──
  // Mirrors the v7.67 ThemeClustersPanel fix: first paint used only the stored
  // snapshot fallbacks, then re-rendered with merged DB keywords — flashing two
  // different numbers. The fetch's .finally() always sets dbLoaded, so a failed
  // fetch still unblocks the UI.
  if (!dbLoaded) {
    return (
      <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-3 animate-fade-in">
        <div className="orbit-card p-4" style={{ borderColor: 'rgba(108,99,255,0.4)' }}>
          <p className="text-[9px] text-orbit-tertiary uppercase tracking-widest mb-1">Market capture rate</p>
          <p className="text-[11px] text-orbit-secondary">Loading keyword data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-3 animate-fade-in">

      {/* ═══ v7.131 — GEO VISIBILITY SCORE + READ CONFIDENCE (lead KPI) ═══ */}
      <div className="orbit-card p-4" style={{ borderColor: 'rgba(108,99,255,0.4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'center' }}>
          <div style={{ textAlign: 'center', paddingRight: 14, borderRight: '1px solid #1E1E2E' }}>
            <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8888AA' }}>GEO Visibility Score</p>
            <p style={{ margin: '4px 0 0', fontSize: 40, fontWeight: 800, lineHeight: 1, color: geoScoreColor }}>
              {geoScore}<span style={{ fontSize: 16, color: '#555570' }}>/100</span>
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 10, color: '#555570' }}>
              Equal-weighted ⅓ each · {scoreDims.map(d => `${d.label.toLowerCase()} ${d.val}`).join(' · ')}{aiMeasured ? '' : ' · AI not yet measured (excluded)'}
            </p>
            <div className="flex flex-col gap-1.5">
              {scoreDims.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <span style={{ width: 82, fontSize: 11, color: d.color }}>{d.label}</span>
                  <div style={{ flex: 1, background: '#1E1E2E', borderRadius: 3, height: 7 }}>
                    <div style={{ width: `${Math.min(100, d.val)}%`, background: d.color, height: 7, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#8888AA', width: 28, textAlign: 'right' }}>{d.val}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'center', paddingLeft: 14, borderLeft: '1px solid #1E1E2E', minWidth: 110 }}>
            <p style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: '#8888AA' }}>Read confidence</p>
            <p style={{ margin: '4px 0 2px', fontSize: 22, fontWeight: 700, color: confColor }}>{confidencePct}%</p>
            <p style={{ margin: 0, fontSize: 9, color: '#555570' }}>
              {signalsOk} of {signals.length} signals{missingSignals.length > 0 ? ` · missing: ${missingSignals.join(', ')}` : ' · all present'}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ THE LANDSCAPE — headline renders ONLY when narrative data exists ═══ */}
      {narrativeText ? (
        <div className="orbit-card p-4" style={{ borderColor: 'rgba(108,99,255,0.4)' }}>
          <p className="text-[9px] uppercase mb-1" style={{ color: '#6C63FF', letterSpacing: '.12em' }}>
            The landscape · your position in the new discovery ecosystem
          </p>
          <p className="font-semibold" style={{ fontSize: 18, color: '#F0F0FF', lineHeight: 1.35 }}>
            You win page-1 rankings for <span style={{ color: '#22C55E' }}>{page1Pct}%</span> of demand
            {aiVisPct !== null
              ? <> — but you&rsquo;re cited in just <span style={{ color: aiVisColor }}>{aiVisPct}%</span> of the AI answers your buyers now read first.</>
              : <>. AI-answer visibility is not yet measured — run an AIO scan to see it.</>}
          </p>
          <p className="text-orbit-secondary mt-2" style={{ fontSize: 11, lineHeight: 1.6 }}>
            {narrativeText}
          </p>
        </div>
      ) : null}

      {/* ═══ THE APPROACH — TWO WORLDS OF VISIBILITY ═══ */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2 text-orbit-tertiary">
          The approach · two worlds of visibility
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: 'trad', accent: '#22C55E', icon: 'Traditional',
              big: dbLoaded ? `${page1Pct}%` : '—', bigSuffix: '', bigColor: '#F0F0FF',
              sub: 'of demand ranked page 1' },
            { key: 'ai', accent: '#EF4444', icon: 'AI visibility',
              big: aiVisPct !== null ? `${aiVisPct}%` : '—', bigSuffix: '', bigColor: aiVisColor,
              sub: aiVisDenom },
            { key: 'gap', accent: '#F59E0B', icon: 'Coverage gap',
              big: gapVolume > 0 ? fmtAnnual(gapVolume) : '—', bigSuffix: '', bigColor: '#F59E0B',
              sub: `${gapKwCount} non-branded voids / yr` },
            { key: 'journey', accent: '#06B6D4', icon: 'Journey',
              big: `${journeyStagesCovered}`, bigSuffix: ' of 4', bigColor: '#F0F0FF',
              sub: 'stages with organic coverage' },
          ].map(b => (
            <div key={b.key} className="orbit-card p-3"
              style={{ borderLeft: `3px solid ${b.accent}`, borderRadius: '0 8px 8px 0' }}>
              <p className="text-[9px] uppercase tracking-wider font-bold" style={{ color: b.accent }}>{b.icon}</p>
              <p className="font-bold leading-none" style={{ fontSize: 24, color: b.bigColor, marginTop: 8 }}>
                {b.big}{b.bigSuffix ? <span style={{ fontSize: 13, color: '#8888AA' }}>{b.bigSuffix}</span> : null}
              </p>
              <p className="text-[9px] mt-1" style={{ color: '#8888AA' }}>{b.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ WHERE YOU DISAPPEAR ACROSS THE JOURNEY ═══ */}
      <div className="orbit-card p-4">
        <p className="text-orbit-secondary text-xs font-medium mb-3">Where you disappear across the journey</p>
        <div style={{ display: 'grid', gridTemplateColumns: '84px repeat(4,1fr)', gap: 6, alignItems: 'center' }}>
          <span />
          {journeyStages.map(s => (
            <span key={`h-${s.stage}`} className="text-[9px]" style={{ color: '#8888AA', textAlign: 'center' }}>{s.label}</span>
          ))}

          <span className="text-[9px]" style={{ color: '#22C55E' }}>Organic</span>
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

          <span className="text-[9px]" style={{ color: '#555570' }}>AI</span>
          {journeyStages.map(s => (
            <div key={`a-${s.stage}`}
              style={{ background: '#16161F', color: '#555570', height: 26, borderRadius: 4,
                border: '1px dashed #2A2A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
              coming
            </div>
          ))}
        </div>
        <p className="text-[9px] mt-2" style={{ color: '#555570' }}>
          AI-per-stage visibility, audience segments, and Sentinel live signals are in build — this row activates once LLM probes are mapped to journey stages.
        </p>
      </div>

      {/* ═══ SUPPORTING EVIDENCE: who's beating me (SOV) + head-to-head scorecard ═══ */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <SovPanel analysis={analysis} competitors={manualDomains} dbKeywords={dbKeywords} clientLabel={projectName ?? propClientDomain} />

        {topComp ? (
          <div className="orbit-card p-4">
            <p className="text-orbit-secondary text-xs font-medium mb-3">Head-to-head · vs {rivalDomain} (your top rival)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '7px 14px', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#555570' }} />
              <span style={{ fontSize: 10, color: '#6C63FF', textAlign: 'right' }}>You</span>
              <span style={{ fontSize: 10, color: '#F59E0B', textAlign: 'right' }}>{rivalDomain}</span>

              <span style={{ fontSize: 11, color: '#F0F0FF' }}>Share of voice</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6C63FF', textAlign: 'right' }}>{Math.round(clientShare * 100)}%</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', textAlign: 'right' }}>{Math.round(topCompShare * 100)}%</span>

              <span style={{ fontSize: 11, color: '#F0F0FF' }}>Page-1 keywords</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6C63FF', textAlign: 'right' }}>{clientPage1Kw.toLocaleString()}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', textAlign: 'right' }}>{rivalPage1Kw > 0 ? rivalPage1Kw.toLocaleString() : '—'}</span>

              <span style={{ fontSize: 11, color: '#F0F0FF' }}>Gap kws they own</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#555570', textAlign: 'right' }}>—</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', textAlign: 'right' }}>{rivalGapCount.toLocaleString()}</span>
            </div>
            {rivalPage1Kw === 0 ? (
              <p className="text-[9px] mt-2" style={{ color: '#555570' }}>
                Rival page-1 count needs a competitor keyword CSV with positions — upload to populate.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="orbit-card p-4 flex items-center justify-center">
            <p className="text-orbit-tertiary text-[10px]">Add a competitor to see the head-to-head scorecard.</p>
          </div>
        )}
      </div>

      {/* ═══ WHERE TO SPEND FIRST — QUICK-WINS LADDER (effort vs payoff) ═══ */}
      <div className="orbit-card p-4">
        <p className="text-orbit-secondary text-xs font-medium mb-3">Where to spend first · effort vs payoff</p>
        <div className="flex flex-col gap-2">
          {ladder.map(t => (
            <div key={t.tier} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.color }}>{t.tier}</span>
              <span style={{ fontSize: 11, color: '#F0F0FF' }}>{t.move}</span>
              <span style={{ fontSize: 11, color: '#8888AA', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {t.n.toLocaleString()} kws · {fmtAnnual(t.volMonthly)}/yr · <span style={{ color: '#6C63FF' }}>~{fmtCompact(t.clicks)} clicks</span>
              </span>
            </div>
          ))}
        </div>
        <p className="text-[9px] mt-2" style={{ color: '#555570' }}>
          Keyword counts and searches/yr are measured. Estimated clicks are <span style={{ color: '#8888AA' }}>modeled</span> from an industry-average organic CTR-by-position curve (pos 1≈28%, pos 3≈10%, pos 8≈2.5%); they show the upside of each move, not a guarantee.
        </p>
      </div>

      {/* ═══ THE CONTINUOUS CYCLE — SECURE THE COVERAGE GAPS ═══ */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2 text-orbit-tertiary"
          style={{ borderTop: '1px solid #1E1E2E', paddingTop: 10 }}>
          The continuous cycle · {hasFallbackActions ? 'recommended priorities to secure coverage' : 'AI-generated priorities to secure coverage'}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {actions.map((a, i) => {
            const catColor = CATEGORY_TEXT[a.category]  ?? '#8B85FF';
            const catBg    = CATEGORY_COLOR[a.category] ?? 'rgba(108,99,255,.12)';
            return (
              <div key={a.id ?? a.rank ?? i} className="orbit-card p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: '#6C63FF' }}>
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
        style={{ borderTop: '1px solid #1E1E2E', paddingTop: 10, flexWrap: 'wrap' }}>
        <span className="text-[9px]" style={{ color: '#555570' }}>
          Snapshot · one frame in a continuous cycle — Sentinel + IQ.Impact monitoring keep this current.
        </span>
        <span className="text-[9px]" style={{ color: '#8888AA' }}>
          Rolls up · Score {geoScore} · Ranks {dbLoaded ? `${page1Pct}%` : '—'} · SOV {sovTotal > 0 && sovClient ? `${Math.round(clientShare * 100)}%` : '—'} · Gaps {gapKwCount} · AIO {aioAvail > 0 ? `${aioRate}%` : '—'} · LLM {overallTotal > 0 ? `${overallLlmRate}%` : '—'} · Journeys {journeyStagesCovered}/4
        </span>
      </div>

    </div>
  );
}
