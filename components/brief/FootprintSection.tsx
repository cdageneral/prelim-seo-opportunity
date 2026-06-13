'use client';

interface Props { analysis: any; }

const BUCKETS = [
  { key: '1-3',   label: 'Pos 1–3',  hex: 'var(--c-6c63ff)' },
  { key: '4-10',  label: 'Pos 4–10', hex: 'var(--c-06b6d4)' },
  { key: '11-20', label: 'Page 2',   hex: 'var(--c-f59e0b)' },
  { key: '21+',   label: 'Page 3+',  hex: 'var(--c-ef4444)' },
];

const CHART_H  = 120;
const CHART_W  = 260;
const BAR_W    = 36;
const COL_STEP = CHART_W / BUCKETS.length;

// ── Sub-component: individual SERP feature card ────────────────────────────

interface FeatureCardProps {
  label:          string;
  color:          string;
  rate:           number;   // 0–100
  acquired:       number;
  available:      number;
  acquiredLabel:  string;
  availableLabel: string;
  noData:         boolean;
}

function SerpFeatureCard({
  label, color, rate, acquired, available,
  acquiredLabel, availableLabel, noData,
}: FeatureCardProps) {
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="rounded-full inline-block shrink-0"
          style={{ width: '10px', height: '10px', background: color }}
        />
        <span
          className="text-orbit-secondary font-semibold uppercase tracking-wider"
          style={{ fontSize: '12px' }}
        >
          {label}
        </span>
        <span
          className="ml-auto font-bold"
          style={{ color, fontSize: '18px' }}
        >
          {rate}%
        </span>
      </div>

      {noData ? (
        <p className="text-orbit-secondary" style={{ fontSize: '13px' }}>
          Re-run analysis to scan
        </p>
      ) : (
        <>
          <p style={{ fontSize: '13px', color: 'var(--c-8888aa)', margin: '0 0 8px' }}>
            <span style={{ color: 'var(--c-f0f0ff)', fontWeight: 600 }}>{acquired}</span>
            {' '}{acquiredLabel}
            &nbsp;/&nbsp;
            <span style={{ color: 'var(--c-f0f0ff)', fontWeight: 600 }}>{available}</span>
            {' '}{availableLabel}
          </p>
          <div style={{ background: 'var(--c-1e1e2e)', borderRadius: '3px', height: '4px', width: '100%' }}>
            <div
              style={{
                background:   color,
                borderRadius: '3px',
                height:       '4px',
                width:        `${Math.min(100, rate)}%`,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function FootprintSection({ analysis }: Props) {

  // ── Ranking distribution ──
  const semrush      = analysis.semrushSnapshot ?? {};
  const positionDist = semrush.positionDist ?? {};
  const totalKws     = Object.values(positionDist as Record<string, number>).reduce((a, b) => a + b, 0);
  const maxCount     = Math.max(...BUCKETS.map(b => (positionDist[b.key] as number) ?? 0), 1);

  // ── Volume outside top 3 (from topKeywords search volume) ──
  const topKeywords: any[] = semrush.topKeywords ?? [];
  const totalVolume     = topKeywords.reduce((sum: number, k: any) => sum + (k.searchVolume ?? 0), 0);
  const volumeInTop3    = topKeywords
    .filter((k: any) => k.position <= 3)
    .reduce((sum: number, k: any) => sum + (k.searchVolume ?? 0), 0);
  const volumeOutsideTop3 = totalVolume - volumeInTop3;
  const pctOutsideTop3    = totalVolume > 0
    ? Math.round((volumeOutsideTop3 / totalVolume) * 100)
    : 0;

  // ── AIO data (stored as dedicated DB columns) ──
  const aioAvail = analysis.aioAvailable ?? 0;
  const aioAcq   = analysis.aioAcquired  ?? 0;
  // Rate = acquired / available: how many available AIOs does the client appear in?
  const aioRate  = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  // ── SERP feature summary (stored in serpApiSnapshot JSONB) ──
  const serpSnap    = analysis.serpApiSnapshot ?? {};
  const featSummary = serpSnap.serpFeatureSummary;

  // Scanned count — prefer pre-aggregated summary, fall back for old analyses
  const scanned: number | null =
    featSummary?.scanned ??
    (Array.isArray(serpSnap.keywords) ? serpSnap.keywords.length : null) ??
    serpSnap.aioSummary?.total ??
    null;
  const sc = scanned ?? 0;

  // PAA available = keywords that triggered a PAA box
  // PAA acquired  = keywords where the client domain appeared in a PAA answer link (v7.15+)
  const paaAvail: number =
    featSummary?.withPAA ??
    (Array.isArray(serpSnap.keywords)
      ? serpSnap.keywords.filter((k: any) => k.paaQuestions?.length > 0).length
      : 0);
  const paaAcq: number =
    featSummary?.paaClientCited ??
    (Array.isArray(serpSnap.keywords)
      ? serpSnap.keywords.filter((k: any) => k.paaClientCited === true).length
      : 0);
  // Rate = acquired / available
  const paaRate = paaAvail > 0 ? Math.round((paaAcq / paaAvail) * 100) : 0;

  // Video available = keywords that triggered a video carousel
  // Video acquired  = keywords where the client domain appeared in the carousel (v7.15+)
  const videoAvail: number =
    featSummary?.withVideo ??
    (Array.isArray(serpSnap.keywords)
      ? serpSnap.keywords.filter((k: any) => k.serpFeatures?.includes('video_carousel')).length
      : 0);
  const videoAcq: number =
    featSummary?.videoClientCited ??
    (Array.isArray(serpSnap.keywords)
      ? serpSnap.keywords.filter((k: any) => k.videoClientCited === true).length
      : 0);
  // Rate = acquired / available
  const videoRate = videoAvail > 0 ? Math.round((videoAcq / videoAvail) * 100) : 0;

  const noSerpData = sc === 0;

  // ── Combined SERP coverage ──
  // (total acquired across all 3 features) / (total available across all 3 features)
  const totalAcquired  = aioAcq  + paaAcq  + videoAcq;
  const totalAvailable = aioAvail + paaAvail + videoAvail;
  const combinedRate   = totalAvailable > 0
    ? Math.min(100, Math.round((totalAcquired / totalAvailable) * 100))
    : 0;


  // ── Y-axis grid lines ──
  const ySteps     = 4;
  const yGridLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = Math.round((maxCount / ySteps) * (ySteps - i));
    const y   = (i / ySteps) * CHART_H;
    return { val, y };
  });

  return (
    <div className="orbit-card p-6 flex flex-col gap-6">

      {/* Header */}
      <div>
        <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Keyword Footprint</p>
        <h3 className="text-orbit-primary text-lg font-semibold mt-1">Ranking Distribution &amp; SERP Coverage</h3>
      </div>

      {/* Two-column layout: bar chart left | SERP features right */}
      <div className="flex gap-4 items-start">

        {/* ── LEFT: Ranking Distribution ── */}
        <div className="flex flex-col gap-3" style={{ flex: 1 }}>
          <p className="text-orbit-secondary text-xs font-medium">Where Your Rankings Live</p>
          <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H + 44}`}
              width="100%"
              aria-label="Bar chart of keyword ranking distribution"
              role="img"
            >
              {/* Y-axis grid + labels */}
              {yGridLines.map(({ val, y }) => (
                <g key={y}>
                  <line x1={28} y1={y} x2={CHART_W} y2={y} stroke="var(--ca-255-255-255-0_06)" strokeWidth="1" />
                  <text x={24} y={y + 4} textAnchor="end" fontSize="9" style={{fill:'var(--c-555570)'}}>{val}</text>
                </g>
              ))}

              {/* Bars */}
              {BUCKETS.map((b, i) => {
                const count = (positionDist[b.key] as number) ?? 0;
                const pct   = totalKws > 0 ? Math.round((count / totalKws) * 100) : 0;
                const barH  = count > 0 ? Math.max(4, (count / maxCount) * CHART_H) : 0;
                const cx    = 28 + COL_STEP * i + COL_STEP / 2;
                const barX  = cx - BAR_W / 2;
                const barY  = CHART_H - barH;

                return (
                  <g key={b.key}>
                    {count > 0 && (
                      <rect x={barX} y={barY} width={BAR_W} height={barH} fill={b.hex} rx="3" />
                    )}
                    <text
                      x={cx} y={count > 0 ? barY - 5 : CHART_H - 5}
                      textAnchor="middle" fontSize="10" fontWeight="600" style={{fill:'var(--c-f0f0ff)'}}
                    >
                      {count.toLocaleString()}
                    </text>
                    <text x={cx} y={CHART_H + 14} textAnchor="middle" fontSize="9" style={{fill:'var(--c-8888aa)'}}>{b.label}</text>
                    <text x={cx} y={CHART_H + 26} textAnchor="middle" fontSize="8" style={{fill:'var(--c-555570)'}}>{pct}%</text>
                  </g>
                );
              })}

              {/* X-axis baseline */}
              <line x1={28} y1={CHART_H} x2={CHART_W} y2={CHART_H} style={{stroke:'var(--c-1e1e2e)'}} strokeWidth="1" />
            </svg>
          </div>

          {/* Volume outside top 3 stat — annualized (monthly × 12) */}
          {totalVolume > 0 && (
            <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3 flex items-center gap-4">
              {/* Left: big % + label */}
              <div className="shrink-0" style={{ textAlign: 'left' }}>
                <p style={{ color: 'var(--c-ef4444)', fontSize: '32px', fontWeight: 700, lineHeight: 1, margin: 0 }}>
                  {pctOutsideTop3}%
                </p>
                <p style={{ color: 'var(--c-8888aa)', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '4px 0 0', lineHeight: 1.3 }}>
                  volume<br />outside top 3
                </p>
              </div>
              {/* Divider */}
              <div style={{ width: '1px', height: '48px', background: 'var(--c-1e1e2e)', flexShrink: 0 }} />
              {/* Right: annualized counts */}
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: 'var(--c-f0f0ff)', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                  {(volumeOutsideTop3 * 12).toLocaleString()}
                  {' '}<span style={{ color: 'var(--c-555570)', fontWeight: 400 }}>out of</span>{' '}
                  {(totalVolume * 12).toLocaleString()}
                </p>
                <p style={{ color: 'var(--c-8888aa)', fontSize: '12px', margin: '4px 0 0' }}>
                  annual searches outside top 3 ranks
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: SERP Features ── */}
        <div className="flex flex-col gap-3" style={{ flex: 1 }}>
          <p className="text-orbit-secondary text-xs font-medium">SERP Features</p>

          {/* Combined donut: total acquired / total available across all 3 features */}
          <div className="flex justify-center py-2">
            <div className="relative" style={{ width: '140px', height: '140px' }}>
              <svg viewBox="0 0 36 36" width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="15.9" fill="none" style={{stroke:'var(--c-1e1e2e)'}} strokeWidth="2.8" />
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none" style={{stroke:'var(--c-6c63ff)'}} strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeDasharray={`${combinedRate} 100`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span style={{ color: 'var(--c-6c63ff)', fontWeight: 700, fontSize: '28px', lineHeight: 1 }}>
                  {combinedRate}%
                </span>
                <span style={{ color: 'var(--c-8888aa)', fontSize: '11px', marginTop: '4px', textAlign: 'center', lineHeight: 1.3 }}>
                  SERP coverage
                </span>
              </div>
            </div>
          </div>

          {/* AIO: rate = aioAcq / aioAvail */}
          <SerpFeatureCard
            label="AI Overviews"
            color="var(--c-6c63ff)"
            rate={aioRate}
            acquired={aioAcq}
            available={aioAvail}
            acquiredLabel="cited"
            availableLabel="available"
            noData={noSerpData}
          />

          {/* PAA: rate = paaAcq / paaAvail */}
          <SerpFeatureCard
            label="People Also Ask"
            color="var(--c-06b6d4)"
            rate={paaRate}
            acquired={paaAcq}
            available={paaAvail}
            acquiredLabel="cited"
            availableLabel="available"
            noData={noSerpData}
          />

          {/* Video: rate = videoAcq / videoAvail */}
          <SerpFeatureCard
            label="Video Carousel"
            color="var(--c-f59e0b)"
            rate={videoRate}
            acquired={videoAcq}
            available={videoAvail}
            acquiredLabel="cited"
            availableLabel="available"
            noData={noSerpData}
          />
        </div>
      </div>

    </div>
  );
}
