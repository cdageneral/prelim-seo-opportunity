'use client';

import { useState, useMemo, useEffect } from 'react';
import { getVolumeMetrics } from '@/lib/utils/kwVolume';

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

function normDomain(d: string): string {
  return d.toLowerCase().replace(/^www\./, '');
}

function firstSentences(text: string, n: number): string {
  const m = text.match(/[^.!?]*[.!?]+/g) ?? [];
  return m.slice(0, n).join(' ').trim() || text;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BarRow({ label, pct, color, isClient = false }: {
  label: string; pct: number; color: string; isClient?: boolean;
}) {
  const w = Math.min(Math.max(pct * 100, 0.5), 100);
  return (
    <div className="flex items-center gap-2 mb-[5px]">
      <span className="text-[10px] w-20 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ color: isClient ? '#8B85FF' : '#8888AA', fontWeight: isClient ? 600 : 400 }}>
        {label}
      </span>
      <div className="flex-1 h-[6px] rounded-full" style={{ background: '#1E1E2E' }}>
        <div className="h-[6px] rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="text-[10px] w-8 text-right shrink-0"
        style={{ color: isClient ? '#8B85FF' : '#8888AA' }}>
        {pct >= 0.001 ? `${(pct * 100).toFixed(0)}%` : '<1%'}
      </span>
    </div>
  );
}

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
  projectId,
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
  }, [projectId]);

  // ── Unified pool + volume metrics (getVolumeMetrics calls buildKwPool internally) ──
  // Wrapping in useMemo avoids re-running on every render; deps match what buildKwPool needs.
  const _volMetrics = useMemo(() => getVolumeMetrics({
    semrushSnapshot:   analysis?.semrushSnapshot,
    uploadedKeywords:  dbKeywords,
    clientDomain:      propClientDomain ?? (analysis?.semrushSnapshot?.domain ?? ''),
    competitorDomains: manualDomains,
    clientVolMin:      defaultClientThreshold,
    competitorVolMin:  defaultCompetitorThreshold,
  }), [analysis, dbKeywords, propClientDomain, manualDomains, defaultClientThreshold, defaultCompetitorThreshold]);

  // Ranked-only subset — mirrors GoogleSerpSection.topKws for position/volume metric cards
  const topKws: SemKw[] = useMemo(() =>
    _volMetrics.pool
      .filter((item) => !item.isGap)
      .map((item) => ({
        keyword:      item.keyword,
        position:     item.position,
        searchVolume: item.searchVolume,
        branded:      item.isBranded,
      })),
  [_volMetrics]);

  // ── Computed stats ────────────────────────────────────────────────────────
  const posKws     = topKws.filter((k): k is SemKw & { position: number } => k.position !== null);
  // totalKws = ALL keywords (ranked + gap) — matches Keyword Landscape panel exactly
  const totalKws   = _volMetrics.pool.length;
  const totalVol   = topKws.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
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
  // Volume-based Pg 1 coverage — matches GoogleSerpSection (page1Vol / totalVol, NOT count-based)
  const page1Pct       = totalVol > 0 ? Math.round((page1Vol / totalVol) * 100) : 0;

  // ── Market capture ────────────────────────────────────────────────────────
  const semSnap: any   = analysis.semrushSnapshot  ?? {};
  const serpSnap: any  = analysis.serpApiSnapshot   ?? {};
  const cb: any        = semSnap._categoryBreakdown ?? {};
  const narrative: any = semSnap._narrative         ?? {};

  // Capture metrics directly from _volMetrics — no stored analysis fallbacks
  const totalMonthly      = _volMetrics.totalMonthly;
  const page1Monthly      = _volMetrics.page1Monthly;
  const captureRate       = _volMetrics.captureRate;
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
  const clientTraffic = semSnap.overview?.organicTraffic ?? 0;
  const clientDomain  = normDomain(propClientDomain ?? analysis.domain ?? '');
  const rawComps: any[] = semSnap.competitors ?? [];
  const allPlayers = [
    { domain: clientDomain || 'Client', traffic: clientTraffic, isClient: true },
    ...rawComps
      .filter((c: any) => normDomain(c.domain ?? '') !== clientDomain)
      .sort((a: any, b: any) => (b.organicTraffic ?? 0) - (a.organicTraffic ?? 0))
      .slice(0, 4)
      .map((c: any) => ({ domain: normDomain(c.domain ?? ''), traffic: c.organicTraffic ?? 0, isClient: false })),
  ];
  const totalPool    = allPlayers.reduce((s, p) => s + p.traffic, 0);
  const topComp      = allPlayers.find(p => !p.isClient);
  const topCompShare = totalPool > 0 && topComp ? topComp.traffic / totalPool : 0;
  const clientShare  = totalPool > 0 ? clientTraffic / totalPool : captureRate;
  const gapVsTop     = topCompShare - clientShare;

  // ── LLM visibility ────────────────────────────────────────────────────────
  const llmSnap: any        = analysis.profoundSnapshot ?? {};
  const isLlmProbe          = llmSnap.source === 'llm_probe';
  const llmPlatforms: any[] = isLlmProbe ? (llmSnap.platforms ?? []) : [];
  const overallMentions     = isLlmProbe ? (llmSnap.overallMentions ?? 0) : 0;
  const overallTotal        = isLlmProbe ? (llmSnap.overallTotal    ?? 0) : 0;
  const overallLlmRate      = overallTotal > 0 ? Math.round((overallMentions / overallTotal) * 100) : 0;
  const bestExcerpt         = llmPlatforms
    .flatMap((p: any) => p.results ?? [])
    .find((r: any) => r.mentioned && r.excerpt)?.excerpt ?? '';

  // ── Content inventory ─────────────────────────────────────────────────────
  const gapKeywords: any[]  = semSnap.gapKeywords ?? [];
  const gapKwCount          = gapKeywords.length;
  const categories: any[]   = cb.categories ?? [];
  const clusterCount        = categories.filter((c: any) => c.type === 'procedure').length;
  const contentGapsFromDb   = (analysis.contentGaps ?? []) as string[];
  const gapVolume           = gapKeywords.reduce((s: number, k: any) => s + (k.searchVolume ?? 0), 0);

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

  return (
    <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-3 animate-fade-in">

      {/* ═══ HERO ═══ */}
      <div className="orbit-card p-4 flex items-center gap-4"
        style={{ borderColor: 'rgba(108,99,255,0.4)' }}>

        <div className="shrink-0">
          <p className="text-[9px] text-orbit-tertiary uppercase tracking-widest mb-1">Market capture rate</p>
          <p className="font-black leading-none" style={{ fontSize: 48, color: dbLoaded ? '#6C63FF' : '#333350' }}>
            {dbLoaded ? `${captureRatePct}%` : '—'}
          </p>
          <p className="text-[10px] mt-1 text-orbit-tertiary">
            {dbLoaded ? `of ${fmtAnnual(totalMonthly)} annual searches` : 'Loading…'}
          </p>
        </div>

        <div className="self-stretch w-px shrink-0 bg-orbit-border" />

        <div className="flex-1 min-w-0">
          <p className="text-orbit-primary text-sm font-semibold mb-1">
            {!dbLoaded ? 'Loading analysis data…' : captureRate < 0.15
              ? 'Significant capture gap vs. market leaders'
              : captureRate < 0.35
              ? 'Moderate capture rate — room to grow'
              : 'Strong market position — defend and expand'}
          </p>
          <p className="text-orbit-secondary text-[10px] leading-relaxed">
            {dbLoaded ? (topComp
              ? `${topComp.domain} holds ${(topCompShare * 100).toFixed(0)}% of total demand. ${fmtAnnual(uncapturedMonthly)} annual searches remain uncaptured across ${gapKwCount} non-branded keywords.`
              : `${fmtAnnual(uncapturedMonthly)} annual searches remain uncaptured across ${gapKwCount} non-branded keywords.`) : ''}
            {dbLoaded && combinedSerpRate < 30 ? ' AI search visibility is an emerging gap.' : ''}
          </p>
        </div>

        <div className="self-stretch w-px shrink-0 bg-orbit-border" />

        {/* 4 mini stat tiles — uses live DB-computed values */}
        <div className="grid grid-cols-2 gap-2 shrink-0" style={{ width: 210 }}>
          {[
            { label: 'Total keywords',
              value: dbLoaded ? totalKws.toLocaleString() : '—',
              color: '#F0F0FF' },
            { label: 'Pg 1 vol. share',
              value: dbLoaded ? `${page1Pct}%` : '—',
              color: pg1Color },
            { label: 'Wtd. avg position',
              value: dbLoaded && weightedPos > 0 ? weightedPos.toFixed(1) : '—',
              color: avgPosColor },
            { label: 'Top-3 vol share',
              value: dbLoaded && totalVol > 0 ? `${top3VolPct}%` : '—',
              color: top3VolPct < 10 ? '#EF4444' : top3VolPct < 25 ? '#F59E0B' : '#22C55E' },
          ].map(s => (
            <div key={s.label} className="rounded-md px-2.5 py-2 text-center bg-orbit-surface">
              <p className="text-[9px] uppercase tracking-wider mb-1 text-orbit-tertiary">{s.label}</p>
              <p className="text-lg font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ BODY: 2/3 grid + 1/3 signals ═══ */}
      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 200px' }}>

        <div className="flex flex-col gap-3">

          {/* Row 1: Competitors + Google Volume Opportunity */}
          <div className="grid grid-cols-2 gap-3">

            {/* Competitor market share */}
            <div className="orbit-card p-4">
              <p className="text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest mb-0.5">Competitor gap</p>
              <h4 className="text-orbit-primary text-xs font-semibold mb-3">Market share — all players</h4>

              {allPlayers.map(p => (
                <BarRow
                  key={p.domain}
                  label={p.domain}
                  pct={totalPool > 0 ? p.traffic / totalPool : (p.isClient ? captureRate : 0)}
                  color={p.isClient ? '#6C63FF' : '#2A2A3D'}
                  isClient={p.isClient}
                />
              ))}

              {uncapturedMonthly > 0 && totalMonthly > 0 && (
                <div className="flex items-center gap-2 mb-[5px]">
                  <span className="text-[10px] w-20 shrink-0" style={{ color: '#EF4444' }}>Uncaptured</span>
                  <div className="flex-1 h-[6px] rounded-full bg-orbit-muted">
                    <div className="h-[6px] rounded-full"
                      style={{ width: `${Math.min((uncapturedMonthly / totalMonthly) * 100, 100)}%`, background: 'rgba(239,68,68,0.4)' }} />
                  </div>
                  <span className="text-[10px] w-8 text-right shrink-0" style={{ color: '#EF4444' }}>
                    {((uncapturedMonthly / totalMonthly) * 100).toFixed(0)}%
                  </span>
                </div>
              )}

              <div className="mt-2 pt-2 border-t border-orbit-border">
                {topComp && (
                  <StatRow
                    label="Top competitor gap"
                    value={gapVsTop > 0 ? `+${(gapVsTop * 100).toFixed(0)}%` : '—'}
                    valueColor="#F59E0B"
                  />
                )}
                <StatRow label="Non-branded gap keywords" value={String(gapKwCount)} />
              </div>
            </div>

            {/* Volume Opportunity Analysis — exact replica of GoogleSerpSection */}
            <div className="orbit-card p-4 flex flex-col gap-3">
              <p className="text-orbit-secondary text-xs font-medium">Volume Opportunity Analysis</p>

              {dbLoaded && totalVol > 0 ? (
                <>
                  {/* Big metric */}
                  <div className="flex items-center gap-3 py-1">
                    <div>
                      <p style={{ color: '#EF4444', fontSize: '36px', fontWeight: 700, lineHeight: 1, margin: 0 }}>
                        {pctOutsideTop3}%
                      </p>
                      <p style={{ color: '#8888AA', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', marginTop: '4px' }}>
                        of volume outside top 3
                      </p>
                    </div>
                    <div style={{ width: '1px', height: '50px', background: '#1E1E2E', flexShrink: 0 }} />
                    <div>
                      <p style={{ color: '#F0F0FF', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                        {fmtAnnual(volOutsideTop3)}
                        <span style={{ color: '#444458', fontWeight: 400, fontSize: '11px' }}> / yr</span>
                      </p>
                      <p style={{ color: '#8888AA', fontSize: '10px', margin: '3px 0 0' }}>annual searches pos 4+</p>
                      <p style={{ color: '#555570', fontSize: '9px', margin: '2px 0 0' }}>
                        out of {fmtAnnual(totalVol)} total
                      </p>
                    </div>
                  </div>

                  {/* Volume breakdown bars — exact match to GoogleSerpSection */}
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Positions 1–3',  vol: top3Vol,             color: '#6C63FF' },
                      { label: 'Positions 4–10', vol: page1Vol - top3Vol,  color: '#06B6D4' },
                      { label: 'Page 2+ (11+)',  vol: totalVol - page1Vol, color: '#EF4444' },
                    ].map(row => {
                      const pct = totalVol > 0 ? (row.vol / totalVol) * 100 : 0;
                      return (
                        <div key={row.label}>
                          <div className="flex justify-between mb-1">
                            <span style={{ fontSize: '10px', color: '#8888AA' }}>{row.label}</span>
                            <span style={{ fontSize: '10px', fontWeight: 600, color: row.color }}>
                              {fmtAnnual(row.vol)}
                              <span style={{ color: '#444458', fontWeight: 400 }}> ({pct.toFixed(1)}%)</span>
                            </span>
                          </div>
                          <div style={{ background: '#1E1E2E', borderRadius: '3px', height: '5px' }}>
                            <div style={{
                              background: row.color, borderRadius: '3px', height: '5px',
                              width: `${Math.min(100, pct)}%`,
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Opportunity insight callout */}
                  <div style={{
                    background: '#0F0F1E', border: '1px solid #1E1E35',
                    borderLeft: '3px solid #6C63FF', borderRadius: '0 8px 8px 0', padding: '8px 10px',
                  }}>
                    <p style={{ fontSize: '10px', color: '#8888AA', lineHeight: 1.5, margin: 0 }}>
                      <span style={{ color: '#C0C0E8', fontWeight: 500 }}>Opportunity: </span>
                      Moving {Math.min(5, posDist['4-10'] ?? 0)} of your Pos 4–10 keywords
                      into top 3 could unlock{' '}
                      <span style={{ color: '#6C63FF', fontWeight: 600 }}>
                        ~{fmtAnnual(Math.round((page1Vol - top3Vol) * 0.3))}
                      </span>{' '}
                      additional annual searches.
                    </p>
                  </div>
                </>
              ) : !dbLoaded ? (
                <p className="text-orbit-tertiary text-[10px]">Loading keyword data…</p>
              ) : (
                <p className="text-orbit-tertiary text-[10px]">No keyword volume data available. Run analysis to see results.</p>
              )}
            </div>
          </div>

          {/* Row 2: LLM + Content inventory */}
          <div className="grid grid-cols-2 gap-3">

            {/* LLM visibility */}
            <div className="orbit-card p-4">
              <p className="text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest mb-0.5">LLM visibility</p>
              <h4 className="text-orbit-primary text-xs font-semibold mb-3">AI search presence</h4>

              {isLlmProbe && llmPlatforms.length > 0 ? (
                <>
                  {llmPlatforms.map((p: any) => {
                    const pct      = Math.round((p.mentionRate ?? 0) * 100);
                    const col      = pct < 34 ? '#EF4444' : pct < 67 ? '#F59E0B' : '#22C55E';
                    const bgBadge  = p.platform === 'claude' ? 'rgba(108,99,255,.15)' : 'rgba(34,197,94,.1)';
                    const txtBadge = p.platform === 'claude' ? '#8B85FF' : '#22C55E';
                    return (
                      <div key={p.platform}
                        className="flex items-center gap-2 mb-2 rounded-md px-2.5 py-1.5 bg-orbit-surface">
                        <span className="text-[9px] font-bold rounded px-1.5 py-1 shrink-0"
                          style={{ background: bgBadge, color: txtBadge }}>
                          {p.platform === 'claude' ? 'CL' : 'GP'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-orbit-primary mb-1">{p.label ?? p.platform}</p>
                          <div className="h-1 rounded-full overflow-hidden bg-orbit-muted">
                            <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: col }} />
                          </div>
                          <p className="text-[9px] mt-0.5 text-orbit-tertiary">
                            {p.mentionCount ?? 0}/{p.results?.length ?? 3} prompts cited
                          </p>
                        </div>
                        <span className="text-xs font-bold shrink-0" style={{ color: col }}>{pct}%</span>
                      </div>
                    );
                  })}
                  {bestExcerpt && (
                    <div className="mt-2 rounded-md px-2.5 py-2 text-[9px] leading-relaxed bg-orbit-surface text-orbit-tertiary">
                      &ldquo;{bestExcerpt.length > 140 ? bestExcerpt.slice(0, 137) + '…' : bestExcerpt}&rdquo;
                    </div>
                  )}
                </>
              ) : (
                <p className="text-orbit-tertiary text-[10px]">Run analysis to see LLM probe results.</p>
              )}
            </div>

            {/* Content + journey inventory */}
            <div className="orbit-card p-4">
              <p className="text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest mb-0.5">Content + journey coverage</p>
              <h4 className="text-orbit-primary text-xs font-semibold mb-3">Opportunity inventory</h4>

              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {[
                  { label: 'Content gaps',
                    value: contentGapsFromDb.length > 0 ? String(contentGapsFromDb.length) : gapKwCount > 0 ? `${gapKwCount}+` : '—' },
                  { label: 'Procedure clusters',
                    value: String(clusterCount > 0 ? clusterCount : categories.length) },
                  { label: 'Annual gap volume',  value: gapVolume > 0 ? fmtAnnual(gapVolume) : '—' },
                  { label: 'Total keywords',
                    value: dbLoaded ? totalKws.toLocaleString() : '—' },
                ].map(s => (
                  <div key={s.label} className="rounded-md px-2.5 py-1.5 bg-orbit-surface">
                    <p className="text-[9px] mb-0.5 text-orbit-tertiary">{s.label}</p>
                    <p className="text-sm font-bold text-orbit-primary">{s.value}</p>
                  </div>
                ))}
              </div>

              <StatRow label="Competitor gap keywords" value={String(gapKwCount)} />
              <StatRow
                label="SERP feature coverage"
                value={totalAvail > 0 ? `${combinedSerpRate}%` : '—'}
                valueColor={combinedSerpRate < 30 ? '#EF4444' : combinedSerpRate < 60 ? '#F59E0B' : '#22C55E'}
              />
              <StatRow
                label="LLM mention rate"
                value={overallTotal > 0 ? `${overallLlmRate}%` : '—'}
                valueColor={llmColor}
              />
            </div>
          </div>

          {/* Narrative */}
          {narrativeText ? (
            <div className="px-4 py-3 text-[10px] leading-relaxed text-orbit-secondary"
              style={{
                background: '#111118', borderLeft: '3px solid #6C63FF',
                borderTop: '1px solid #1E1E2E', borderRight: '1px solid #1E1E2E',
                borderBottom: '1px solid #1E1E2E', borderRadius: '0 8px 8px 0',
              }}>
              {narrativeText}
            </div>
          ) : null}
        </div>

        {/* ── SIGNALS COLUMN ── */}
        <div className="flex flex-col">
          <p className="text-[9px] font-bold uppercase tracking-widest pb-2 mb-2 text-orbit-tertiary"
            style={{ borderBottom: '1px solid #1E1E2E' }}>
            Panel signals
          </p>

          <SignalCard
            source="Market gap"
            value={`${captureRatePct}%`}
            desc={`Market capture — ${fmtAnnual(uncapturedMonthly)} searches/yr uncaptured`}
            accentColor={captureColor}
          />
          <SignalCard
            source="Competitor gap"
            value={topComp && gapVsTop > 0 ? `+${(gapVsTop * 100).toFixed(0)}%` : `${gapKwCount}`}
            desc={topComp ? `${topComp.domain} leads — ${gapKwCount} gap keywords` : `${gapKwCount} gap keywords identified`}
            accentColor="#F59E0B"
          />
          <SignalCard
            source="Google ranks"
            value={dbLoaded ? `${page1Pct}%` : '—'}
            desc={dbLoaded
              ? `Page 1 coverage — wtd. avg pos ${weightedPos > 0 ? weightedPos.toFixed(1) : '—'}`
              : 'Loading…'}
            accentColor={pg1Color}
          />
          <SignalCard
            source="SERP features"
            value={aioAvail > 0 ? `${aioRate}%` : '—'}
            desc={aioAvail > 0 ? `AIO acquired — ${100 - aioRate}% of slots uncaptured` : 'No AIO data available'}
            accentColor={aioColor}
          />
          <SignalCard
            source="LLM visibility"
            value={overallTotal > 0 ? `${overallLlmRate}%` : '—'}
            desc={overallTotal > 0 ? `Cited in ${overallMentions} of ${overallTotal} AI probes` : 'No LLM probe data'}
            accentColor={llmColor}
          />
          <SignalCard
            source="Theme clusters"
            value={String(clusterCount > 0 ? clusterCount : categories.length)}
            desc={`Procedure clusters — ${fmtAnnual(totalMonthly)} annual search volume`}
            accentColor="#8B85FF"
          />
          <SignalCard
            source="Content map"
            value={String(gapKwCount)}
            desc="Competitor gap keywords — highest ROI opportunity"
            accentColor="#F59E0B"
          />
          <SignalCard
            source="Journeys"
            value={page1Pct > 30 ? '2 of 4' : '1 of 4'}
            desc="Journey stages with meaningful coverage"
            accentColor={page1Pct > 30 ? '#F59E0B' : '#EF4444'}
          />
        </div>
      </div>

      {/* ═══ PRIORITY ACTIONS ═══ */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2 text-orbit-tertiary"
          style={{ borderTop: '1px solid #1E1E2E', paddingTop: 10 }}>
          {hasFallbackActions ? 'Recommended priorities' : 'AI-generated priorities'}
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

    </div>
  );
}
