'use client';

interface Props { analysis: any; }

export default function FootprintSection({ analysis }: Props) {
  const semrush  = analysis.semrushSnapshot ?? {};
  const positionDist = semrush.positionDist ?? {};
  const totalKws = Object.values(positionDist as Record<string, number>).reduce((a, b) => a + b, 0);
  const page1Kws = (positionDist['1-3'] ?? 0) + (positionDist['4-10'] ?? 0);
  const top3Kws  = positionDist['1-3'] ?? 0;
  const outsidePage1 = (positionDist['11-20'] ?? 0) + (positionDist['21+'] ?? 0);
  const outsideTop3  = (positionDist['4-10'] ?? 0) + outsidePage1;

  const aioAvail  = analysis.aioAvailable ?? 0;
  const aioAcq    = analysis.aioAcquired ?? 0;
  const aioRate   = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  const narrative = analysis.semrushSnapshot?._narrative;
  const visGap    = narrative?.visibilityGap ?? '';

  const BAR_COLORS: Record<string, string> = {
    '1-3':   'bg-orbit-accent',
    '4-10':  'bg-cyan-500',
    '11-20': 'bg-amber-500',
    '21+':   'bg-red-500/70',
  };

  const BAR_LABELS: Record<string, string> = {
    '1-3':   'Positions 1–3',
    '4-10':  'Positions 4–10',
    '11-20': 'Page 2',
    '21+':   'Page 3+',
  };

  return (
    <div className="orbit-card p-6 flex flex-col gap-5">
      {/* Header */}
      <div>
        <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Keyword Footprint</p>
        <h3 className="text-orbit-primary text-lg font-semibold mt-1">Ranking Distribution & AIO Coverage</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Position Distribution */}
        <div className="flex flex-col gap-4">
          <p className="text-orbit-secondary text-xs font-medium">Where Your Rankings Live</p>

          {/* Stacked visual bar */}
          <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
            {Object.entries(positionDist).map(([bucket, count]) => {
              const pct = totalKws > 0 ? ((count as number) / totalKws) * 100 : 0;
              return (
                <div
                  key={bucket}
                  className={`${BAR_COLORS[bucket] ?? 'bg-orbit-muted'} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                  title={`${bucket}: ${count}`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(positionDist).map(([bucket, count]) => (
              <div key={bucket} className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-sm ${BAR_COLORS[bucket] ?? 'bg-orbit-muted'}`} />
                <span className="text-orbit-secondary text-xs">{BAR_LABELS[bucket]}: </span>
                <span className="text-orbit-primary text-xs font-medium">{count as number}</span>
              </div>
            ))}
          </div>

          {/* Insight stats */}
          <div className="grid grid-cols-2 gap-3">
            <InsightStat
              label="Outside page 1"
              value={outsidePage1.toString()}
              subtext="keywords not visible in standard search"
              color="amber"
              source="Semrush Organic Research"
            />
            <InsightStat
              label="Outside top 3"
              value={outsideTop3.toString()}
              subtext="keywords missing high-CTR positions"
              color="amber"
              source="Semrush Organic Research"
            />
          </div>
        </div>

        {/* AIO Coverage */}
        <div className="flex flex-col gap-4">
          <p className="text-orbit-secondary text-xs font-medium">AI Overview Coverage</p>

          {/* AIO Donut-style display */}
          <div className="flex items-center gap-5">
            <div className="relative w-24 h-24 shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E1E2E" strokeWidth="3" />
                {/* AIO coverage rate */}
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none"
                  stroke="#6C63FF"
                  strokeWidth="3"
                  strokeDasharray={`${aioAvail > 0 ? (aioAvail / Math.max(aioAvail, 100)) * 100 : 0} 100`}
                  strokeLinecap="round"
                />
                {/* Client acquisition rate */}
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none"
                  stroke="#22C55E"
                  strokeWidth="3"
                  strokeDasharray={`${aioAcq > 0 ? (aioAcq / Math.max(aioAvail, 1)) * 100 : 0} 100`}
                  strokeLinecap="round"
                  opacity="0.7"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-orbit-accent font-bold text-lg">{aioRate}%</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <div>
                <span className="text-orbit-primary font-semibold">{aioAvail}</span>
                <span className="text-orbit-secondary text-xs ml-1">keywords trigger AI Overviews</span>
              </div>
              <div>
                <span className="text-green-400 font-semibold">{aioAcq}</span>
                <span className="text-orbit-secondary text-xs ml-1">AIOs cite this site</span>
              </div>
              <p className="text-orbit-tertiary text-[10px]">Source: SerpAPI live SERP scan</p>
            </div>
          </div>

          {/* AIO narrative */}
          {aioRate < 20 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-amber-400 text-xs">
                <strong>AIO exposure gap:</strong> {aioAvail - aioAcq} AI Overviews run on this site's target keywords without citing it. Each uncaptured AIO is a brand visibility moment lost to competitors.
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
    </div>
  );
}

function InsightStat({
  label, value, subtext, color, source
}: {
  label: string; value: string; subtext: string;
  color: 'green' | 'amber' | 'red'; source: string;
}) {
  const colorClass = { green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400' }[color];
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
      <p className={`${colorClass} font-bold text-xl`}>{value}</p>
      <p className="text-orbit-secondary text-xs font-medium mt-0.5">{label}</p>
      <p className="text-orbit-tertiary text-[10px] mt-0.5">{subtext}</p>
      <p className="text-orbit-tertiary text-[9px] mt-1">Source: {source}</p>
    </div>
  );
}
