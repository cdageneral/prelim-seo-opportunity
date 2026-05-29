'use client';

interface Props { analysis: any; }

const BUCKETS = [
  { key: '1-3',   label: 'Positions 1–3',  sublabel: 'Top 3',           colorClass: 'bg-orbit-accent',  hex: '#6C63FF' },
  { key: '4-10',  label: 'Positions 4–10', sublabel: 'Page 1 tail',     colorClass: 'bg-cyan-500',      hex: '#06B6D4' },
  { key: '11-20', label: 'Page 2',         sublabel: 'Positions 11–20', colorClass: 'bg-amber-500',     hex: '#F59E0B' },
  { key: '21+',   label: 'Page 3+',        sublabel: 'Beyond page 2',   colorClass: 'bg-red-500/70',    hex: '#EF4444' },
];

export default function FootprintSection({ analysis }: Props) {
  const semrush      = analysis.semrushSnapshot ?? {};
  const positionDist = semrush.positionDist ?? {};
  const totalKws     = Object.values(positionDist as Record<string, number>).reduce((a, b) => a + b, 0);

  const aioAvail = analysis.aioAvailable ?? 0;
  const aioAcq   = analysis.aioAcquired  ?? 0;
  const aioRate  = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  // Arc lengths (out of 100) for SVG stroke-dasharray
  const availArc = totalKws > 0 && aioAvail > 0 ? Math.round((aioAvail / totalKws) * 100) : 0;
  const wonArc   = aioAvail > 0 ? Math.round((aioAcq  / aioAvail) * 100) : 0;

  const narrative = analysis.semrushSnapshot?._narrative;
  const visGap    = narrative?.visibilityGap ?? '';

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

        <div className="grid grid-cols-4 gap-3">
          {BUCKETS.map(({ key, label, sublabel, hex }) => {
            const count = (positionDist[key] as number) ?? 0;
            const pct   = totalKws > 0 ? Math.round((count / totalKws) * 100) : 0;
            // Bar height as % of 100px max, minimum 4px if non-zero
            const barPx = count > 0 ? Math.max(4, Math.round((count / Math.max(totalKws, 1)) * 100)) : 0;

            return (
              <div key={key} className="bg-orbit-surface border border-orbit-border rounded-lg p-3 flex flex-col">
                <p className="text-orbit-secondary text-[11px] font-medium mb-2">{label}</p>

                {/* Bar track */}
                <div className="flex-1 flex items-end mb-3" style={{ minHeight: '100px' }}>
                  <div className="w-full bg-orbit-muted rounded-t" style={{ height: '100px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden', borderRadius: '4px 4px 0 0' }}>
                    <div
                      className="w-full transition-all duration-700 rounded-t"
                      style={{ height: `${barPx}px`, background: hex }}
                    />
                  </div>
                </div>

                <p className="text-orbit-primary text-2xl font-semibold leading-none mb-1">{count.toLocaleString()}</p>
                <p className="text-orbit-secondary text-[11px]">{pct}% &middot; {sublabel}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: AIO Coverage ── */}
      <div className="flex flex-col gap-3">
        <p className="text-orbit-secondary text-xs font-medium">AI Overview Coverage</p>

        <div className="flex items-center gap-3">

          {/* Donut */}
          <div className="relative shrink-0" style={{ width: '110px', height: '110px' }}>
            <svg viewBox="0 0 36 36" width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
              {/* Track */}
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2A2A3D" strokeWidth="3.2" />
              {/* Purple arc — share of all kws that trigger AIOs */}
              <circle
                cx="18" cy="18" r="15.9"
                fill="none"
                stroke="#6C63FF"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeDasharray={`${availArc} 100`}
              />
              {/* Green arc — share of AIOs the client has won */}
              <circle
                cx="18" cy="18" r="15.9"
                fill="none"
                stroke="#22C55E"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeDasharray={`${wonArc} 100`}
                opacity="0.85"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-orbit-accent font-bold text-xl leading-none">{aioRate}%</span>
              <span className="text-orbit-tertiary text-[9px] mt-0.5">coverage</span>
            </div>
          </div>

          {/* AIOs Available */}
          <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3 flex-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-orbit-accent inline-block" />
              <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">AIOs Available</span>
            </div>
            <p className="text-orbit-primary text-3xl font-semibold leading-none mb-1">{aioAvail}</p>
            <p className="text-orbit-secondary text-[11px]">{aioAvail} out of {totalKws} keywords trigger AI Overviews</p>
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

        {/* AIO gap alert */}
        {aioRate < 20 && aioAvail > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <p className="text-amber-400 text-xs">
              <strong>AIO exposure gap:</strong> {aioAvail - aioAcq} AI Overviews run on this site&apos;s target keywords without citing it. Each uncaptured AIO is a brand visibility moment lost to competitors.
            </p>
          </div>
        )}

        {/* Narrative */}
        {visGap && (
          <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
            <p className="text-orbit-secondary text-xs leading-relaxed">{visGap}</p>
          </div>
        )}
      </div>

    </div>
  );
}
