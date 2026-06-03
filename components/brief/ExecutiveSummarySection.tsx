'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Opportunity {
  id?:      string;
  rank:     number;
  category: string;
  title:    string;
  summary:  string;
}

interface Props {
  analysis:       any;
  projectName?:   string;
  clientDomain?:  string;
  manualDomains?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function BarRow({
  label, pct, color, isClient = false,
}: { label: string; pct: number; color: string; isClient?: boolean }) {
  const w = Math.min(Math.max(pct * 100, 0.5), 100);
  return (
    <div className="flex items-center gap-2 mb-[5px]">
      <span
        className="text-[10px] w-20 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ color: isClient ? '#8B85FF' : '#8888AA', fontWeight: isClient ? 600 : 400 }}
      >
        {label}
      </span>
      <div className="flex-1 h-[6px] rounded-full" style={{ background: '#1E1E2E' }}>
        <div className="h-[6px] rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="text-[10px] w-8 text-right shrink-0" style={{ color: isClient ? '#8B85FF' : '#8888AA' }}>
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
    <div
      className="px-3 py-2.5 mb-1.5"
      style={{
        background:   '#111118',
        borderLeft:   `3px solid ${accentColor}`,
        borderTop:    '1px solid #1E1E2E',
        borderRight:  '1px solid #1E1E2E',
        borderBottom: '1px solid #1E1E2E',
        borderRadius: '0 6px 6px 0',
      }}
    >
      <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: accentColor }}>
        {source}
      </p>
      <p className="text-[17px] font-bold leading-tight" style={{ color: '#F0F0FF' }}>{value}</p>
      <p className="text-[9px] leading-snug mt-0.5" style={{ color: '#8888AA' }}>{desc}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExecutiveSummarySection({ analysis, clientDomain: propClientDomain, manualDomains = [] }: Props) {

  const semSnap: any   = analysis.semrushSnapshot  ?? {};
  const serpSnap: any  = analysis.serpApiSnapshot   ?? {};
  const cb: any        = semSnap._categoryBreakdown ?? {};
  const narrative: any = semSnap._narrative         ?? {};

  // Market capture
  const captureRate       = cb.page1CaptureRate   ?? analysis.marketCaptureRate   ?? 0;
  const totalMonthly      = cb.totalMonthlyDemand ?? analysis.totalCategoryVolume ?? 0;
  const page1Monthly      = cb.totalPage1Demand   ?? analysis.clientOwnedVolume   ?? 0;
  const uncapturedMonthly = Math.max(totalMonthly - page1Monthly, 0);
  const captureRatePct    = (captureRate * 100).toFixed(1);

  // Ranking distribution
  const posDist: Record<string, number> = semSnap.positionDist ?? {};
  const pos1to3   = (posDist['1-3']   as number) ?? 0;
  const pos4to10  = (posDist['4-10']  as number) ?? 0;
  const pos11to20 = (posDist['11-20'] as number) ?? 0;
  const pos21plus = (posDist['21+']   as number) ?? 0;
  const totalKws  = pos1to3 + pos4to10 + pos11to20 + pos21plus;
  const page1KwPct = totalKws > 0 ? (pos1to3 + pos4to10) / totalKws : 0;
  const avgPos     = totalKws > 0
    ? ((pos1to3 * 2) + (pos4to10 * 7) + (pos11to20 * 15) + (pos21plus * 25)) / totalKws
    : 0;

  // SERP features
  const aioAvail = analysis.aioAvailable ?? 0;
  const aioAcq   = analysis.aioAcquired  ?? 0;
  const aioRate  = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;
  const featSum  = serpSnap.serpFeatureSummary ?? {};
  const paaAvail = featSum.withPAA         ?? 0;
  const paaAcq   = featSum.paaClientCited  ?? 0;
  const paaRate  = paaAvail > 0 ? Math.round((paaAcq / paaAvail) * 100) : 0;
  const vidAvail = featSum.withVideo       ?? 0;
  const vidAcq   = featSum.videoClientCited ?? 0;
  const vidRate  = vidAvail > 0 ? Math.round((vidAcq / vidAvail) * 100) : 0;
  const totalAvail = aioAvail + paaAvail + vidAvail;
  const totalAcq   = aioAcq  + paaAcq   + vidAcq;
  const combinedSerpRate = totalAvail > 0 ? Math.round((totalAcq / totalAvail) * 100) : 0;

  // Competitor market share
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
  const totalPool   = allPlayers.reduce((s, p) => s + p.traffic, 0);
  const topComp     = allPlayers.find(p => !p.isClient);
  const topCompShare = totalPool > 0 && topComp ? topComp.traffic / totalPool : 0;
  const clientShare  = totalPool > 0 ? clientTraffic / totalPool : captureRate;
  const gapVsTop     = topCompShare - clientShare;

  // LLM visibility
  const llmSnap: any       = analysis.profoundSnapshot ?? {};
  const isLlmProbe         = llmSnap.source === 'llm_probe';
  const llmPlatforms: any[] = isLlmProbe ? (llmSnap.platforms ?? []) : [];
  const overallMentions    = isLlmProbe ? (llmSnap.overallMentions ?? 0) : 0;
  const overallTotal       = isLlmProbe ? (llmSnap.overallTotal    ?? 0) : 0;
  const overallLlmRate     = overallTotal > 0 ? Math.round((overallMentions / overallTotal) * 100) : 0;
  const bestExcerpt        = llmPlatforms
    .flatMap((p: any) => p.results ?? [])
    .find((r: any) => r.mentioned && r.excerpt)?.excerpt ?? '';

  // Content inventory
  const gapKeywords: any[]  = semSnap.gapKeywords ?? [];
  const gapKwCount          = gapKeywords.length;
  const categories: any[]   = cb.categories ?? [];
  const clusterCount        = categories.filter((c: any) => c.type === 'procedure').length;
  const contentGapsFromDb: string[] = analysis.contentGaps ?? [];
  const gapVolume           = gapKeywords.reduce((s: number, k: any) => s + (k.searchVolume ?? 0), 0);

  // Opportunities / priority actions
  const opps: Opportunity[] = (analysis.opportunities ?? [])
    .sort((a: Opportunity, b: Opportunity) => a.rank - b.rank)
    .slice(0, 3);

  const fallbackActions: Opportunity[] = [
    { rank: 1, category: 'Content',     title: 'Close the content gap',
      summary: `${gapKwCount} non-branded gap keywords identified where competitors rank but client does not. Focus on highest-volume procedure clusters.` },
    { rank: 2, category: 'SEO',         title: 'Target competitor-gap keywords',
      summary: `${gapKwCount} keywords where top competitors rank page 1 and client does not — high displacement potential worth ${fmtAnnual(gapVolume)} annual searches.` },
    { rank: 3, category: 'GEO',         title: 'Build AI search presence',
      summary: `Currently cited in ${overallMentions} of ${overallTotal || 6} AI probes across Claude and ChatGPT. Structured, authoritative content aligned to LLM prompt patterns will lift citation rates.` },
  ];
  const actions = opps.length > 0 ? opps : fallbackActions;
  const hasFallbackActions = opps.length === 0;

  // Narrative
  const rawNarrative =
    narrative.marketPositionNarrative ??
    narrative.strategicCall           ??
    narrative.competitorGapNarrative  ?? '';
  const narrativeText = rawNarrative ? firstSentences(rawNarrative, 4) : '';

  // Color helpers
  const captureColor = captureRate < 0.15 ? '#EF4444' : captureRate < 0.35 ? '#F59E0B' : '#22C55E';
  const llmColor     = overallLlmRate < 34 ? '#EF4444' : overallLlmRate < 67 ? '#F59E0B' : '#22C55E';
  const pg1Color     = page1KwPct < 0.3 ? '#F59E0B' : '#22C55E';
  const aioColor     = aioRate < 20 ? '#EF4444' : aioRate < 50 ? '#F59E0B' : '#06B6D4';
  const avgPosColor  = avgPos > 0 && avgPos <= 5 ? '#22C55E' : '#F59E0B';

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
      <div
        className="orbit-card p-4 flex items-center gap-4"
        style={{ borderColor: 'rgba(108,99,255,0.4)' }}
      >
        {/* Big capture rate */}
        <div className="shrink-0">
          <p className="text-[9px] text-orbit-tertiary uppercase tracking-widest mb-1">Market capture rate</p>
          <p className="font-black leading-none" style={{ fontSize: 48, color: '#6C63FF' }}>
            {captureRatePct}%
          </p>
          <p className="text-[10px] mt-1 text-orbit-tertiary">
            of {fmtAnnual(totalMonthly)} annual searches
          </p>
        </div>

        <div className="self-stretch w-px shrink-0 bg-orbit-border" />

        {/* Context blurb */}
        <div className="flex-1 min-w-0">
          <p className="text-orbit-primary text-sm font-semibold mb-1">
            {captureRate < 0.15
              ? 'Significant capture gap vs. market leaders'
              : captureRate < 0.35
              ? 'Moderate capture rate — room to grow'
              : 'Strong market position — defend and expand'}
          </p>
          <p className="text-orbit-secondary text-[10px] leading-relaxed">
            {topComp
              ? `${topComp.domain} holds ${(topCompShare * 100).toFixed(0)}% of total demand. ${fmtAnnual(uncapturedMonthly)} annual searches remain uncaptured across ${gapKwCount} non-branded keywords where competitors rank but this client does not.`
              : `${fmtAnnual(uncapturedMonthly)} annual searches remain uncaptured across ${gapKwCount} non-branded keywords.`}
            {combinedSerpRate < 30 ? ' AI search visibility is an emerging gap.' : ''}
          </p>
        </div>

        <div className="self-stretch w-px shrink-0 bg-orbit-border" />

        {/* 4 mini stat tiles */}
        <div className="grid grid-cols-2 gap-2 shrink-0" style={{ width: 210 }}>
          {[
            { label: 'Pg 1 coverage',
              value: `${Math.round(page1KwPct * 100)}%`,
              color: pg1Color },
            { label: 'LLM mentions',
              value: overallTotal > 0 ? `${overallLlmRate}%` : '—',
              color: llmColor },
            { label: 'Uncaptured',
              value: fmtAnnual(uncapturedMonthly),
              color: '#EF4444' },
            { label: 'Avg rank',
              value: avgPos > 0 ? avgPos.toFixed(1) : '—',
              color: avgPosColor },
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

          {/* Row 1 */}
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
                    <div
                      className="h-[6px] rounded-full"
                      style={{
                        width: `${Math.min((uncapturedMonthly / totalMonthly) * 100, 100)}%`,
                        background: 'rgba(239,68,68,0.4)',
                      }}
                    />
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

            {/* Google ranks + SERP features */}
            <div className="orbit-card p-4">
              <p className="text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest mb-0.5">Google platform</p>
              <h4 className="text-orbit-primary text-xs font-semibold mb-3">Rank distribution</h4>

              {totalKws > 0 ? (
                <>
                  <BarRow label="Pos 1–3"  pct={pos1to3  / totalKws} color="#22C55E" />
                  <BarRow label="Pos 4–10" pct={pos4to10  / totalKws} color="#06B6D4" />
                  <BarRow label="Page 2"   pct={pos11to20 / totalKws} color="#2A2A3D" />
                  <BarRow label="Page 3+"  pct={pos21plus / totalKws} color="#2A2A3D" />
                </>
              ) : (
                <p className="text-orbit-tertiary text-[10px] mb-3">No position data available</p>
              )}

              <div className="mt-3 pt-2 border-t border-orbit-border">
                <p className="text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest mb-2">SERP features acquired</p>
                {aioAvail > 0 && <BarRow label="AIO"   pct={aioRate / 100} color="#06B6D4" />}
                {paaAvail > 0 && <BarRow label="PAA"   pct={paaRate / 100} color="#2A2A3D" />}
                {vidAvail > 0 && <BarRow label="Video" pct={vidRate / 100} color="#2A2A3D" />}
                {aioAvail === 0 && paaAvail === 0 && vidAvail === 0 && (
                  <p className="text-orbit-tertiary text-[10px]">No SERP feature data</p>
                )}
              </div>
            </div>
          </div>

          {/* Row 2 */}
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
                      <div key={p.platform} className="flex items-center gap-2 mb-2 rounded-md px-2.5 py-1.5 bg-orbit-surface">
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
                  { label: 'Annual gap volume',
                    value: gapVolume > 0 ? fmtAnnual(gapVolume) : '—' },
                  { label: 'Total ranked kws',
                    value: totalKws > 0 ? String(totalKws) : String(semSnap.overview?.organicKeywords ?? '—') },
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
            <div
              className="px-4 py-3 text-[10px] leading-relaxed text-orbit-secondary"
              style={{
                background:   '#111118',
                borderLeft:   '3px solid #6C63FF',
                borderTop:    '1px solid #1E1E2E',
                borderRight:  '1px solid #1E1E2E',
                borderBottom: '1px solid #1E1E2E',
                borderRadius: '0 8px 8px 0',
              }}
            >
              {narrativeText}
            </div>
          ) : null}
        </div>

        {/* ── SIGNALS COLUMN ── */}
        <div className="flex flex-col">
          <p
            className="text-[9px] font-bold uppercase tracking-widest pb-2 mb-2 text-orbit-tertiary"
            style={{ borderBottom: '1px solid #1E1E2E' }}
          >
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
            value={`${Math.round(page1KwPct * 100)}%`}
            desc={`Page 1 coverage — avg position ${avgPos > 0 ? avgPos.toFixed(1) : '—'}`}
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
            value={page1KwPct > 0.3 ? '2 of 4' : '1 of 4'}
            desc="Journey stages with meaningful coverage"
            accentColor={page1KwPct > 0.3 ? '#F59E0B' : '#EF4444'}
          />
        </div>
      </div>

      {/* ═══ PRIORITY ACTIONS ═══ */}
      <div>
        <p
          className="text-[9px] font-bold uppercase tracking-widest mb-2 text-orbit-tertiary"
          style={{ borderTop: '1px solid #1E1E2E', paddingTop: 10 }}
        >
          {hasFallbackActions ? 'Recommended priorities' : 'AI-generated priorities'}
        </p>

        <div className="grid grid-cols-3 gap-3">
          {actions.map((a, i) => {
            const catColor = CATEGORY_TEXT[a.category]  ?? '#8B85FF';
            const catBg    = CATEGORY_COLOR[a.category] ?? 'rgba(108,99,255,.12)';
            return (
              <div key={a.id ?? a.rank ?? i} className="orbit-card p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: '#6C63FF' }}
                  >
                    {i + 1}
                  </div>
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: catBg, color: catColor }}
                  >
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
