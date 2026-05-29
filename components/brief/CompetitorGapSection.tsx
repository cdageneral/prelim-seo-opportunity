'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerRow {
  domain:   string;
  traffic:  number;  // monthly
  isClient: boolean;
  source:   'client' | 'serp' | 'manual';
}

interface Props {
  analysis:       any;
  manualDomains?: string[];  // domains added via CompetitorsPanel
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the first n complete sentences from a block of text. */
function firstSentences(text: string, n: number): string {
  const matches = text.match(/[^.!?]*[.!?]+/g) ?? [];
  const result  = matches.slice(0, n).join(' ').trim();
  return result || text;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return n.toLocaleString();
  return n > 0 ? String(n) : '—';
}

function fmtAnnual(n: number): string {
  const a = n * 12;
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  return a.toLocaleString();
}

function normalizeDomain(d: string): string {
  return d.toLowerCase().replace(/^www\./, '');
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: PlayerRow['source'] }) {
  if (source === 'client') return null;
  if (source === 'serp') {
    return (
      <span
        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
        style={{
          background: 'rgba(6,182,212,0.12)',
          color:      '#22d3ee',
          border:     '1px solid rgba(6,182,212,0.25)',
        }}
      >
        SERP
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{
        background: 'rgba(245,158,11,0.12)',
        color:      '#fbbf24',
        border:     '1px solid rgba(245,158,11,0.25)',
      }}
    >
      Manual
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompetitorGapSection({ analysis, manualDomains = [] }: Props) {
  const snapshot    = analysis.semrushSnapshot ?? {};
  const cb          = snapshot._categoryBreakdown ?? null;
  const narrative   = snapshot._narrative;
  const calloutText = narrative?.competitiveReality ?? '';

  // Total market demand — prefer category breakdown, fall back to legacy
  const totalMonthly: number = cb?.totalMonthlyDemand
    ?? analysis.totalCategoryVolume
    ?? 0;

  // Client traffic — use organic traffic from overview (consistent with competitors)
  const clientTraffic: number = snapshot.overview?.organicTraffic
    ?? analysis.clientOwnedVolume
    ?? 0;
  const clientName: string = snapshot.domain ?? 'Client';

  // Build set of manually-added domains for badge lookup
  const manualSet = new Set(manualDomains.map(normalizeDomain));

  // Competitors sorted by organic traffic descending
  const rawCompetitors: any[] = snapshot.competitors ?? [];
  const competitors = [...rawCompetitors]
    .sort((a, b) => (b.organicTraffic ?? 0) - (a.organicTraffic ?? 0))
    .slice(0, 5);

  // Top competitor (first after sort)
  const topComp = competitors[0] ?? null;
  const topCompDomain: string  = topComp?.domain ?? analysis.topCompetitor ?? '—';
  const topCompTraffic: number = topComp?.organicTraffic ?? 0;
  const topCompPct = totalMonthly > 0 ? (topCompTraffic / totalMonthly) * 100 : 0;

  // Build player rows: client first, then competitors with source badge
  const players: PlayerRow[] = [
    { domain: clientName, traffic: clientTraffic, isClient: true, source: 'client' },
    ...competitors.map((c: any) => ({
      domain:   c.domain ?? '',
      traffic:  c.organicTraffic ?? 0,
      isClient: false,
      source:   manualSet.has(normalizeDomain(c.domain ?? ''))
        ? 'manual' as const
        : 'serp'   as const,
    })),
  ];

  // Uncaptured demand
  const combinedReach = players.reduce((s, p) => s + p.traffic, 0);
  const uncaptured    = Math.max(0, totalMonthly - combinedReach);
  const uncapturedPct = totalMonthly > 0 ? (uncaptured / totalMonthly) * 100 : 0;

  return (
    <div className="orbit-card p-6 flex flex-col gap-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-orbit-tertiary text-xs font-medium uppercase tracking-widest">
            Competitive Gap
          </p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">
            SERP landscape
          </h3>

          {/* Platform + Surface pills */}
          <div className="flex items-center gap-2 mt-2">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(66,133,244,0.12)', color: '#6BAAF8', border: '1px solid rgba(66,133,244,0.2)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google Platform
            </span>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(108,99,255,0.12)', color: '#8B85FF', border: '1px solid rgba(108,99,255,0.2)' }}
            >
              SERP Rankings
            </span>
          </div>
        </div>

        {/* Hero — uncaptured % */}
        <div className="text-right flex-shrink-0">
          <span className="text-4xl font-bold leading-none" style={{ color: '#EF4444' }}>
            {uncapturedPct.toFixed(1)}%
          </span>
          <p className="text-orbit-tertiary text-xs mt-1">
            of category demand<br />uncaptured by any player
          </p>
        </div>
      </div>

      {/* ── Callout ───────────────────────────────────────────────────────── */}
      {calloutText ? (
        <div className="bg-orbit-surface border-l-[3px] border-orbit-accent rounded-r-lg px-4 py-3">
          <p className="text-orbit-secondary text-sm leading-relaxed">{firstSentences(calloutText, 2)}</p>
        </div>
      ) : null}

      {/* ── Player Table ──────────────────────────────────────────────────── */}
      {totalMonthly > 0 && (
        <div>
          {/* Column headers — Annual Vol. replaces Traffic/mo; Rank column removed */}
          <div
            className="grid pb-2 border-b border-orbit-border"
            style={{ gridTemplateColumns: '1fr 110px 80px' }}
          >
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider">Player</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">Annual Vol.</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">% of Market</span>
          </div>

          {/* Player rows */}
          {players.map((p) => {
            const pct  = (p.traffic / totalMonthly) * 100;
            const barW = Math.max(p.traffic > 0 ? 0.4 : 0, pct);
            const isC  = p.isClient;
            return (
              <div
                key={p.domain}
                className="grid py-2.5 border-b border-orbit-border items-center"
                style={{ gridTemplateColumns: '1fr 110px 80px' }}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-sm"
                      style={{ color: isC ? '#F0F0FF' : '#8888AA', fontWeight: isC ? 600 : 400 }}
                    >
                      {p.domain}
                    </span>
                    {isC && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(108,99,255,0.15)', color: '#8B85FF' }}
                      >
                        Client
                      </span>
                    )}
                    <SourceBadge source={p.source} />
                  </div>
                  <div className="mt-1.5 h-[3px] bg-orbit-muted rounded-sm overflow-hidden" style={{ width: '85%' }}>
                    <div
                      className="h-full rounded-sm transition-all duration-700"
                      style={{ width: `${barW}%`, background: isC ? '#6C63FF' : '#3A3860' }}
                    />
                  </div>
                </div>
                <span
                  className="text-xs text-right"
                  style={{ color: isC ? '#8B85FF' : '#8888AA' }}
                >
                  {fmtAnnual(p.traffic)}
                </span>
                <span
                  className="text-xs text-right"
                  style={{ color: isC ? '#F0F0FF' : '#8888AA', fontWeight: isC ? 600 : 400 }}
                >
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}

          {/* Uncaptured demand row */}
          <div
            className="grid py-2.5 border-b border-orbit-border items-center"
            style={{ gridTemplateColumns: '1fr 110px 80px' }}
          >
            <div>
              <span className="text-sm font-semibold" style={{ color: '#EF4444' }}>
                Uncaptured demand
              </span>
              <div className="mt-1.5 h-[3px] bg-orbit-muted rounded-sm overflow-hidden" style={{ width: '85%' }}>
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${Math.max(0.4, uncapturedPct)}%`, background: '#EF4444' }}
                />
              </div>
            </div>
            <span className="text-xs text-right font-semibold" style={{ color: '#EF4444' }}>
              {fmtAnnual(uncaptured)}
            </span>
            <span className="text-xs text-right font-bold" style={{ color: '#EF4444' }}>
              {uncapturedPct.toFixed(1)}%
            </span>
          </div>

          {/* Total rollup */}
          <div
            className="grid pt-2.5 items-center"
            style={{ gridTemplateColumns: '1fr 110px 80px' }}
          >
            <span className="text-orbit-primary text-sm font-semibold">Total market demand</span>
            <span className="text-orbit-primary text-sm font-semibold text-right">{fmtAnnual(totalMonthly)}</span>
            <span className="text-sm font-bold text-right text-orbit-accent">100%</span>
          </div>
        </div>
      )}

      {/* ── Three Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard
          label="Total Demand Available"
          value={fmtAnnual(totalMonthly)}
          sub="Total category"
          source="Semrush keyword research"
          valueColor="#F0F0FF"
        />
        <StatCard
          label="Top Competitor"
          value={topCompDomain}
          sub={`${topCompPct.toFixed(1)}% of market demand`}
          source={`${fmtAnnual(topCompTraffic)} annual vol.`}
          valueColor="#F59E0B"
          smallValue
        />
        <StatCard
          label="Annual Uncaptured"
          value={fmtAnnual(uncaptured)}
          sub="No player reaches"
          source={`${uncapturedPct.toFixed(1)}% of total available`}
          valueColor="#EF4444"
        />
      </div>

    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, source, valueColor, smallValue = false,
}: {
  label: string; value: string; sub: string; source: string;
  valueColor: string; smallValue?: boolean;
}) {
  return (
    <div className="bg-orbit-surface rounded-lg p-3 border border-orbit-border">
      <p className="text-orbit-primary text-[13px] font-semibold mb-1.5">
        {label}
      </p>
      <p
        className={`font-semibold leading-tight truncate ${smallValue ? 'text-sm pt-0.5' : 'text-lg'}`}
        style={{ color: valueColor }}
      >
        {value}
      </p>
      <p className="text-orbit-secondary text-xs mt-1">{sub}</p>
      <p className="text-orbit-tertiary text-[10px] mt-1">{source}</p>
    </div>
  );
}
