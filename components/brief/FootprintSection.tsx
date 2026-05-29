'use client';

interface Props { analysis: any; }

const BUCKETS = [
  { key: '1-3',   label: 'Positions 1–3',  sublabel: 'Top 3',           hex: '#6C63FF' },
  { key: '4-10',  label: 'Positions 4–10', sublabel: 'Page 1 tail',     hex: '#06B6D4' },
  { key: '11-20', label: 'Page 2',         sublabel: 'Positions 11–20', hex: '#F59E0B' },
  { key: '21+',   label: 'Page 3+',        sublabel: 'Beyond page 2',   hex: '#EF4444' },
];

export default function FootprintSection({ analysis }: Props) {
  const semrush      = analysis.semrushSnapshot ?? {};
  const positionDist = semrush.positionDist ?? {};
  const totalKws     = Object.values(positionDist as Record<string, number>).reduce((a, b) => a + b, 0);

  // AIO data
  const aioAvail = analysis.aioAvailable ?? 0;
  const aioAcq   = analysis.aioAcquired  ?? 0;
  const aioRate  = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  // SERP feature summary — prefer pre-aggregated, fall back to keywords[] for old analyses
  const serpSnap    = analysis.serpApiSnapshot ?? {};
  const featSummary = serpSnap.serpFeatureSummary;
  const scanned     = featSummary?.scanned
    ?? (serpSnap.keywords?.length ?? serpSnap.aioSummary?.total ?? 0);
  const paaCount    = featSummary?.withPAA
    ?? (serpSnap.keywords?.filter((k: any) => k.paaQuestions?.length > 0).length ?? 0);
  const videoCount  = featSummary?.withVideo
    ?? (serpSnap.keywords?.filter((k: any) => k.serpFeatures?.includes('video_carousel')).length ?? 0);

  // Donut arc lengths (out of 100)
  const availArc = scanned > 0 && aioAvail > 0 ? Math.round((aioAvail / scanned) * 100) : 0;
  const wonArc   = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  // Factual SERP feature insight — no AI inference
  let serpInsight = '';
  if (scanned === 0) {
    serpInsight = 'No SERP scan data available for this analysis.';
  } else if (aioAvail === 0 && paaCount === 0 && videoCount === 0) {
    serpInsight = `Of ${scanned} keywords scanned, none triggered an AI Overview, PAA box, or video carousel. Expand the keyword scan for a representative SERP feature picture.`;
  } else {
    const parts: string[] = [];
    if (aioAvail > 0) parts.push(`${aioAvail} trigger AI Overviews (client cited in ${aioAcq})`);
    if (paaCount > 0)  parts.push(`${paaCount} trigger PAA boxes`);
    if (videoCount > 0) parts.push(`${videoCount} trigger video carousels`);
    serpInsight = `Of ${scanned} keywords scanned: ${parts.join(', ')}. Based on a live SerpAPI scan.`;
  }

  // Bar chart max height px
  const MAX_BAR_PX = 100;

  return (
    <div className="orbit-card p-6 flex flex-col gap-6">

      {/* Header */}
      <div>
        <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Keyword Footprint</p>
        <h3 className="text-orbit-primary text-lg font-semibold mt-1">Ranking Distribution &amp; AIO Coverage</h3>
      </div>

      {/* ── Section 1: Ranking Distribution ── */}
      <div className="flex flex-col gap-3">
        <p className="text-orbit-secondary text-xs font-medium">Where Your Rankings Live</p>

        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          {/* Bar chart */}
          <div className="flex items-end gap-4 justify-around" style={{ height: `${MAX_BAR_PX + 48}px` }}>
            {BUCKETS.map(({ key, label, sublabel, hex }) => {
              const count  = (positionDist[key] as number) ?? 0;
              const pct    = totalKws > 0 ? Math.round((count / totalKws) * 100) : 0;
              const barPx  = count > 0 ? Math.max(4, Math.round((count / Math.max(totalKws, 1)) * MAX_BAR_PX)) : 0;

              return (
                <div key={key} className="flex flex-col items-center gap-2 flex-1">
                  {/* Count label above bar */}
                  <span className="text-orbit-primary text-sm font-semibold">{count.toLocaleString()}</span>
                  {/* Bar track */}
                  <div
                    className="w-full rounded-t flex items-end overflow-hidden"
                    style={{ height: `${MAX_BAR_PX}px`, background: '#2A2A3D' }}
                  >
                    <div
                      className="w-full rounded-t transition-all duration-700"
                      style={{ height: `${barPx}px`, background: hex }}
                    />
                  </div>
                  {/* X-axis label */}
                  <div className="text-center">
                    <p className="text-orbit-secondary text-[11px] leading-tight">{label}</p>
                    <p className="text-orbit-tertiary text-[10px]">{pct}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 2: SERP Features ── */}
      <div className="flex flex-col gap-3">
        <p className="text-orbit-secondary text-xs font-medium">SERP Features</p>

        {/* AIO row: donut + Available + Covered */}
        <div className="flex items-stretch gap-3">

          {/* Donut */}
          <div className="relative shrink-0" style={{ width: '110px', height: '110px' }}>
            <svg viewBox="0 0 36 36" width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2A2A3D" strokeWidth="3.2" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="#6C63FF" strokeWidth="3.2" strokeLinecap="round"
                strokeDasharray={`${availArc} 100`}
              />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke="#22C55E" strokeWidth="3.2" strokeLinecap="round"
                strokeDasharray={`${wonArc} 100`}
                opacity="0.85"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-orbit-accent font-bold text-xl leading-none">{aioRate}%</span>
              <span className="text-orbit-tertiary text-[9px] mt-0.5">AIO coverage</span>
            </div>
          </div>

          {/* AIOs Available */}
          <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-orbit-accent inline-block" />
              <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">AI Overviews</span>
            </div>
            <p className="text-orbit-primary text-3xl font-semibold leading-none mb-1">{aioAvail}</p>
            <p className="text-orbit-secondary text-[11px]">{aioAvail} of {scanned} keywords scanned trigger AI Overviews</p>
          </div>

          {/* AIOs Covered */}
          <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">AIOs Covered</span>
            </div>
            <p className="text-green-400 text-3xl font-semibold leading-none mb-1">{aioAcq}</p>
            <p className="text-orbit-secondary text-[11px]">AI Overviews citing this site</p>
            <p className="text-orbit-tertiary text-[9px] mt-1">Source: SerpAPI live SERP scan</p>
          </div>

        </div>

        {/* PAA + Video row */}
        <div className="grid grid-cols-2 gap-3">

          {/* PAA */}
          <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
              <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">People Also Ask</span>
            </div>
            <p className="text-orbit-primary text-3xl font-semibold leading-none mb-1">{paaCount}</p>
            <p className="text-orbit-secondary text-[11px]">{paaCount} of {scanned} keywords trigger PAA boxes</p>
            <p className="text-orbit-tertiary text-[9px] mt-1">Source: SerpAPI live SERP scan</p>
          </div>

          {/* Video */}
          <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">Video Carousel</span>
            </div>
            <p className="text-orbit-primary text-3xl font-semibold leading-none mb-1">{videoCount}</p>
            <p className="text-orbit-secondary text-[11px]">{videoCount} of {scanned} keywords trigger video results</p>
            <p className="text-orbit-tertiary text-[9px] mt-1">Source: SerpAPI live SERP scan</p>
          </div>

        </div>

        {/* AIO gap alert */}
        {aioRate < 20 && aioAvail > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <p className="text-amber-400 text-xs">
              <strong>AIO exposure gap:</strong> {aioAvail - aioAcq} AI Overviews run on this site&apos;s target keywords without citing it. Each uncaptured AIO is a brand visibility moment lost to competitors.
            </p>
          </div>
        )}

        {/* Factual SERP insight */}
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
          <p className="text-orbit-secondary text-xs leading-relaxed">{serpInsight}</p>
        </div>

      </div>

    </div>
  );
}
