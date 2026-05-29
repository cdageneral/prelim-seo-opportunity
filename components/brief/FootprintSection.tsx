'use client';

interface Props { analysis: any; }

const BUCKETS = [
  { key: '1-3',   label: 'Pos 1–3',  hex: '#6C63FF' },
  { key: '4-10',  label: 'Pos 4–10', hex: '#06B6D4' },
  { key: '11-20', label: 'Page 2',   hex: '#F59E0B' },
  { key: '21+',   label: 'Page 3+',  hex: '#EF4444' },
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
          <p style={{ fontSize: '13px', color: '#8888AA', margin: '0 0 8px' }}>
            <span style={{ color: '#F0F0FF', fontWeight: 600 }}>{acquired}</span>
            {' '}{acquiredLabel}
            &nbsp;/&nbsp;
            <span style={{ color: '#F0F0FF', fontWeight: 600 }}>{available}</span>
            {' '}{availableLabel}
          </p>
          <div style={{ background: '#1E1E2E', borderRadius: '3px', height: '4px', width: '100%' }}>
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

  // ── Debug (remove after confirming SERP data flows correctly) ──
  const _serpDebug = [
    `snapshot=${analysis.serpApiSnapshot === null ? 'null' : analysis.serpApiSnapshot === undefined ? 'undefined' : 'present'}`,
    `keywords=${Array.isArray(serpSnap.keywords) ? serpSnap.keywords.length : 'n/a'}`,
    `featSummary=${featSummary
      ? `scanned=${featSummary.scanned} paaAcq=${featSummary.paaClientCited ?? 'n/a'} vidAcq=${featSummary.videoClientCited ?? 'n/a'}`
      : 'none'}`,
  ].join(' | ');

  // ── Y-axis grid lines ──
  const ySteps     = 4;
  const yGridLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = Math.round((maxCount / ySteps) * (ySteps - i));
    const y   = (i / ySteps) * CHART_H;
    return { val, y };
  });

  // ── Factual SERP insight ──
  let serpInsight = '';
  if (noSerpData) {
    serpInsight = 'SERP feature data unavailable — run a fresh analysis to populate AI Overview, PAA, and video carousel counts.';
  } else if (aioAvail === 0 && paaAvail === 0 && videoAvail === 0) {
    serpInsight = `Of ${sc} keywords scanned, none triggered an AI Overview, PAA box, or video carousel.`;
  } else {
    const parts: string[] = [];
    if (aioAvail > 0)   parts.push(`${aioAvail} trigger AI Overviews (client cited in ${aioAcq})`);
    if (paaAvail > 0)   parts.push(`${paaAvail} trigger PAA boxes (client cited in ${paaAcq})`);
    if (videoAvail > 0) parts.push(`${videoAvail} trigger video carousels (client cited in ${videoAcq})`);
    serpInsight = `Of ${sc} keywords scanned: ${parts.join(', ')}. Source: SerpAPI live scan.`;
  }

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
                  <line x1={28} y1={y} x2={CHART_W} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <text x={24} y={y + 4} textAnchor="end" fontSize="9" fill="#555570">{val}</text>
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
                      textAnchor="middle" fontSize="10" fontWeight="600" fill="#F0F0FF"
                    >
                      {count.toLocaleString()}
                    </text>
                    <text x={cx} y={CHART_H + 14} textAnchor="middle" fontSize="9" fill="#8888AA">{b.label}</text>
                    <text x={cx} y={CHART_H + 26} textAnchor="middle" fontSize="8" fill="#555570">{pct}%</text>
                  </g>
                );
              })}

              {/* X-axis baseline */}
              <line x1={28} y1={CHART_H} x2={CHART_W} y2={CHART_H} stroke="#1E1E2E" strokeWidth="1" />
            </svg>
          </div>
        </div>

        {/* ── RIGHT: SERP Features ── */}
        <div className="flex flex-col gap-3" style={{ flex: 1 }}>
          <p className="text-orbit-secondary text-xs font-medium">SERP Features</p>

          {/* Combined donut: total acquired / total available across all 3 features */}
          <div className="flex justify-center py-2">
            <div className="relative" style={{ width: '140px', height: '140px' }}>
              <svg viewBox="0 0 36 36" width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E1E2E" strokeWidth="2.8" />
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none" stroke="#6C63FF" strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeDasharray={`${combinedRate} 100`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span style={{ color: '#6C63FF', fontWeight: 700, fontSize: '28px', lineHeight: 1 }}>
                  {combinedRate}%
                </span>
                <span style={{ color: '#8888AA', fontSize: '11px', marginTop: '4px', textAlign: 'center', lineHeight: 1.3 }}>
                  SERP coverage
                </span>
              </div>
            </div>
          </div>

          {/* AIO: rate = aioAcq / aioAvail */}
          <SerpFeatureCard
            label="AI Overviews"
            color="#6C63FF"
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
            color="#06B6D4"
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
            color="#F59E0B"
            rate={videoRate}
            acquired={videoAcq}
            available={videoAvail}
            acquiredLabel="cited"
            availableLabel="available"
            noData={noSerpData}
          />
        </div>
      </div>

      {/* AIO gap alert */}
      {aioRate < 20 && aioAvail > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <p className="text-amber-400 text-xs">
            <strong>AIO exposure gap:</strong> {aioAvail - aioAcq} AI Overviews run on this site&apos;s
            target keywords without citing it. Each uncaptured AIO is a brand visibility moment lost to competitors.
          </p>
        </div>
      )}

      {/* Factual SERP insight */}
      <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
        <p className="text-orbit-secondary text-xs leading-relaxed">{serpInsight}</p>
        {/* DEBUG — remove once SERP data confirmed working */}
        <p className="text-orbit-tertiary text-[9px] mt-2 font-mono">{_serpDebug}</p>
      </div>

    </div>
  );
}
