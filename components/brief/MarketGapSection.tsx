'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryRow {
  name:          string;
  monthlyDemand: number;
  page1Demand:   number;
  top3Demand:    number;
}

interface CategoryBreakdown {
  categories:         CategoryRow[];
  totalMonthlyDemand: number;
  totalPage1Demand:   number;
  totalTop3Demand:    number;
  page1CaptureRate:   number;
}

interface Props { analysis: any; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketGapSection({ analysis }: Props) {
  const snapshot: any                  = analysis.semrushSnapshot ?? {};
  const cb: CategoryBreakdown | null   = snapshot._categoryBreakdown ?? null;

  // Prefer category-breakdown metrics; fall back to legacy hero fields
  const page1CaptureRate = cb ? cb.page1CaptureRate  : (analysis.marketCaptureRate ?? 0);
  const totalMonthly     = cb ? cb.totalMonthlyDemand : (analysis.totalCategoryVolume ?? 0);
  const page1Monthly     = cb ? cb.totalPage1Demand   : (analysis.clientOwnedVolume ?? 0);
  const top3Monthly      = cb ? cb.totalTop3Demand    : 0;
  const categories       = cb?.categories ?? [];

  const calloutText = snapshot._narrative?.marketPositionNarrative ?? '';
  const pctDisplay  = `${(page1CaptureRate * 100).toFixed(1)}%`;

  return (
    <div className="orbit-card p-6 flex flex-col gap-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-orbit-tertiary text-xs font-medium uppercase tracking-widest">
            Market Gap
          </p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">
            True market share
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

        {/* Hero % */}
        <div className="text-right flex-shrink-0">
          <span className="text-4xl font-bold text-orbit-accent leading-none">
            {pctDisplay}
          </span>
          <p className="text-orbit-tertiary text-xs mt-1">
            of category demand<br />reached on page 1
          </p>
        </div>
      </div>

      {/* ── Callout ───────────────────────────────────────────────────────── */}
      {calloutText ? (
        <div className="bg-orbit-surface border-l-[3px] border-orbit-accent rounded-r-lg px-4 py-3">
          <p className="text-orbit-secondary text-sm leading-relaxed">{calloutText}</p>
        </div>
      ) : null}

      {/* ── Category Table ────────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div>
          {/* Column headers */}
          <div
            className="grid pb-2 border-b border-orbit-border"
            style={{ gridTemplateColumns: '1fr 100px 90px 68px' }}
          >
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider">Category</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">Demand/mo</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">Page 1</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">Share</span>
          </div>

          {/* Data rows */}
          {categories.map((cat) => {
            const share  = cat.monthlyDemand > 0 ? (cat.page1Demand / cat.monthlyDemand) * 100 : 0;
            const barW   = Math.max(cat.page1Demand > 0 ? 0.8 : 0, share);
            const hasData = cat.page1Demand > 0;

            return (
              <div
                key={cat.name}
                className="grid py-2.5 border-b border-orbit-border items-center"
                style={{ gridTemplateColumns: '1fr 100px 90px 68px' }}
              >
                <div>
                  <span className="text-orbit-primary text-sm">{cat.name}</span>
                  <div className="mt-1.5 h-[3px] bg-orbit-muted rounded-sm overflow-hidden" style={{ width: '85%' }}>
                    <div
                      className="h-full bg-orbit-accent rounded-sm transition-all duration-700"
                      style={{ width: `${barW}%` }}
                    />
                  </div>
                </div>
                <span className="text-orbit-secondary text-xs text-right">
                  {fmtNum(cat.monthlyDemand)}
                </span>
                <span
                  className="text-xs text-right font-medium"
                  style={{ color: hasData ? '#8B85FF' : '#555570' }}
                >
                  {hasData ? fmtNum(cat.page1Demand) : '—'}
                </span>
                <span
                  className="text-sm font-semibold text-right"
                  style={{ color: hasData ? '#F0F0FF' : '#555570' }}
                >
                  {hasData ? `${share.toFixed(2)}%` : '—'}
                </span>
              </div>
            );
          })}

          {/* Overall rollup */}
          <div
            className="grid pt-2.5 items-center"
            style={{ gridTemplateColumns: '1fr 100px 90px 68px' }}
          >
            <span className="text-orbit-primary text-sm font-semibold">Overall rollup</span>
            <span className="text-orbit-primary text-sm font-semibold text-right">{fmtNum(totalMonthly)}</span>
            <span className="text-orbit-primary text-sm font-semibold text-right">{fmtNum(page1Monthly)}</span>
            <span className="text-sm font-bold text-right text-orbit-accent">{pctDisplay}</span>
          </div>
        </div>
      )}

      {/* ── Three Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard
          label="Annual Search Demand"
          value={fmtAnnual(totalMonthly)}
          sub="Total category"
          source="Semrush keyword research"
          valueColor="#F0F0FF"
        />
        <StatCard
          label="Annual Search Demand"
          value={fmtAnnual(page1Monthly)}
          sub="Captured on page 1"
          source="Semrush organic rankings"
          valueColor="#8B85FF"
        />
        <StatCard
          label="Page 1 Capture Rate"
          value={pctDisplay}
          sub="Page 1 of total available"
          source={top3Monthly > 0 && totalMonthly > 0
            ? `Top 3 positions: ${((top3Monthly / totalMonthly) * 100).toFixed(1)}%`
            : 'Semrush organic rankings'}
          valueColor="#6C63FF"
        />
      </div>

    </div>
  );
}

// ─── Stat Card sub-component ──────────────────────────────────────────────────

function StatCard({
  label, value, sub, source, valueColor,
}: {
  label: string; value: string; sub: string; source: string; valueColor: string;
}) {
  return (
    <div className="bg-orbit-surface rounded-lg p-3 border border-orbit-border">
      <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className="font-semibold text-lg leading-tight" style={{ color: valueColor }}>
        {value}
      </p>
      <p className="text-orbit-secondary text-xs mt-1">{sub}</p>
      <p className="text-orbit-tertiary text-[10px] mt-1">{source}</p>
    </div>
  );
}
