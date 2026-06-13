'use client';

interface CategoryRow {
  name:          string;
  type:          'procedure' | 'brand' | 'location';
  monthlyDemand: number;
  page1Demand:   number;
  top3Demand:    number;
}

interface CategoryBreakdown {
  categories:            CategoryRow[];
  totalMonthlyDemand:    number;
  totalPage1Demand:      number;
  totalTop3Demand:       number;
  brandedPage1Demand:    number;
  nonBrandedPage1Demand: number;
  totalKeywordsAnalyzed: number;
  page1CaptureRate:      number;
}

interface Props { analysis: any; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the first n complete sentences from a block of text. */
function firstSentences(text: string, n: number): string {
  const matches = text.match(/[^.!?]*[.!?]+/g) ?? [];
  const result  = matches.slice(0, n).join(' ').trim();
  return result || text;
}

function fmtAnnual(monthly: number): string {
  const a = monthly * 12;
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  return a.toLocaleString();
}

function fmtAnnualNum(monthly: number): number { return monthly * 12; }

// ─── Component ────────────────────────────────────────────────────────────────

export default function MarketGapSection({ analysis }: Props) {
  const snapshot: any                = analysis.semrushSnapshot ?? {};
  const cb: CategoryBreakdown | null = snapshot._categoryBreakdown ?? null;

  const totalMonthly      = cb?.totalMonthlyDemand    ?? (analysis.totalCategoryVolume ?? 0);
  const page1Monthly      = cb?.totalPage1Demand      ?? (analysis.clientOwnedVolume   ?? 0);
  const top3Monthly       = cb?.totalTop3Demand       ?? 0;
  const brandedMonthly    = cb?.brandedPage1Demand    ?? 0;
  const nonBrandedMonthly = cb?.nonBrandedPage1Demand ?? page1Monthly;
  const kwCount           = cb?.totalKeywordsAnalyzed ?? 0;
  const captureRate       = cb?.page1CaptureRate      ?? (analysis.marketCaptureRate   ?? 0);

  const procedureCats = (cb?.categories ?? []).filter(c => c.type === 'procedure');
  const navCats       = (cb?.categories ?? []).filter(c => c.type === 'brand' || c.type === 'location');

  const calloutText = snapshot._narrative?.marketPositionNarrative ?? '';
  const pctDisplay  = `${(captureRate * 100).toFixed(1)}%`;

  // Ranks 4-10 demand = page1 minus top3
  const ranks4to10Monthly = page1Monthly - top3Monthly;

  const gapPct = totalMonthly > 0
    ? (100 - captureRate * 100).toFixed(1)
    : '0';

  return (
    <div className="orbit-card p-6 flex flex-col gap-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-orbit-tertiary text-xs font-medium uppercase tracking-widest">Market Gap</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">True market share</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
              style={{ background: 'var(--ca-66-133-244-0_12)', color: 'var(--c-6baaf8)', border: '1px solid var(--ca-66-133-244-0_2)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google Platform
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
              style={{ background: 'var(--ca-108-99-255-0_12)', color: 'var(--c-8b85ff)', border: '1px solid var(--ca-108-99-255-0_2)' }}>
              SERP Rankings
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-4xl font-bold text-orbit-accent leading-none">{pctDisplay}</span>
          <p className="text-orbit-tertiary text-xs mt-1">of category demand<br/>reached on page 1</p>
        </div>
      </div>

      {/* ── Callout ── */}
      <div className="bg-orbit-surface border-l-[3px] border-orbit-accent rounded-r-lg px-4 py-3">
        {calloutText ? (
          <p className="text-orbit-secondary text-sm leading-relaxed">{firstSentences(calloutText, 2)}</p>
        ) : (
          <p className="text-orbit-secondary text-sm leading-relaxed">
            <strong className="text-orbit-primary font-medium">Branded demand is fully owned.</strong>{' '}
            The {gapPct}% gap is unbranded procedure demand — {fmtAnnual(totalMonthly)} annual searches where this site does not appear.
          </p>
        )}
      </div>

      {/* ── Category Table ── */}
      {(procedureCats.length > 0 || navCats.length > 0) && (
        <div>
          <div className="grid pb-2 border-b border-orbit-border"
            style={{ gridTemplateColumns: '1fr 110px 90px 68px' }}>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider">Category</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">Annual demand</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">Page 1</span>
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-wider text-right">Share</span>
          </div>

          {/* Procedure section label */}
          {procedureCats.length > 0 && (
            <p className="text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest py-1.5 border-b border-orbit-border/50">
              Procedure lines
            </p>
          )}

          {procedureCats.map(cat => <CategoryTableRow key={cat.name} cat={cat} dimmed={false} />)}

          {/* Brand & navigation section */}
          {navCats.length > 0 && (
            <p className="text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest py-1.5 border-b border-orbit-border/50 mt-1">
              Brand &amp; navigation
            </p>
          )}
          {navCats.map(cat => <CategoryTableRow key={cat.name} cat={cat} dimmed={true} />)}

          {/* Overall rollup */}
          <div className="grid pt-2.5 items-center border-t border-orbit-muted mt-1"
            style={{ gridTemplateColumns: '1fr 110px 90px 68px' }}>
            <span className="text-orbit-primary text-sm font-semibold">Overall rollup</span>
            <span className="text-orbit-primary text-sm font-semibold text-right">{fmtAnnual(totalMonthly)}</span>
            <span className="text-orbit-primary text-sm font-semibold text-right">{fmtAnnual(page1Monthly)}</span>
            <span className="text-sm font-bold text-right text-orbit-accent">{pctDisplay}</span>
          </div>
        </div>
      )}

      {/* ── Three Stat Cards ── */}
      <div className="grid grid-cols-3 gap-2.5">

        {/* Card 1: Total Demand Available */}
        <div className="bg-orbit-surface rounded-lg p-3 border border-orbit-border">
          <p className="text-orbit-primary text-[13px] font-semibold mb-1.5">Total Demand Available</p>
          <p className="font-semibold text-lg leading-tight text-orbit-primary">{fmtAnnual(totalMonthly)}</p>
          <p className="text-orbit-secondary text-xs mt-1">Annual search demand</p>
          <p className="text-orbit-tertiary text-[10px] mt-1">
            {kwCount > 0 ? `${kwCount} keywords analyzed` : 'Source: Semrush keyword research'}
          </p>
        </div>

        {/* Card 2: Total Demand Captured */}
        <div className="bg-orbit-surface rounded-lg p-3 border border-orbit-border">
          <p className="text-orbit-primary text-[13px] font-semibold mb-1.5">Total Demand Captured</p>
          <p className="font-semibold text-lg leading-tight" style={{ color: 'var(--c-8b85ff)' }}>{fmtAnnual(page1Monthly)}</p>
          <p className="text-orbit-secondary text-xs mt-1">Captured on page 1</p>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--c-8b85ff)' }}>Brand: {fmtAnnual(brandedMonthly)}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-22c55e)' }}>Non-brand: {fmtAnnual(nonBrandedMonthly)}</p>
        </div>

        {/* Card 3: Page 1 Capture Rate */}
        <div className="bg-orbit-surface rounded-lg p-3 border border-orbit-border">
          <p className="text-orbit-primary text-[13px] font-semibold mb-1.5">Page 1 Capture Rate</p>
          <p className="font-semibold text-lg leading-tight text-orbit-accent">{pctDisplay}</p>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--c-22c55e)' }}>
            Ranks 1–3: {top3Monthly > 0 && totalMonthly > 0
              ? `${((top3Monthly / totalMonthly) * 100).toFixed(1)}%`
              : '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-f59e0b)' }}>
            Ranks 4–10: {ranks4to10Monthly > 0 && totalMonthly > 0
              ? `${((ranks4to10Monthly / totalMonthly) * 100).toFixed(1)}%`
              : '—'}
          </p>
        </div>

      </div>
    </div>
  );
}

// ─── Category Table Row ───────────────────────────────────────────────────────

function CategoryTableRow({ cat, dimmed }: { cat: CategoryRow; dimmed: boolean }) {
  const share = cat.monthlyDemand > 0 ? (cat.page1Demand / cat.monthlyDemand) * 100 : 0;
  const barW  = Math.max(cat.page1Demand > 0 ? 0.8 : 0, share);
  const hasData = cat.page1Demand > 0;

  const fmtAnn = (n: number) => {
    const a = n * 12;
    if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
    return a.toLocaleString();
  };

  return (
    <div
      className="grid py-2.5 border-b border-orbit-border items-center"
      style={{ gridTemplateColumns: '1fr 110px 90px 68px', opacity: dimmed ? 0.45 : 1 }}
    >
      <div>
        <span className="text-sm" style={{ color: dimmed ? 'var(--c-666680)' : 'var(--c-f0f0ff)' }}>{cat.name}</span>
        <div className="mt-1.5 h-[3px] bg-orbit-muted rounded-sm overflow-hidden" style={{ width: '85%' }}>
          <div
            className="h-full rounded-sm transition-all duration-700"
            style={{ width: `${barW}%`, background: dimmed ? 'var(--c-555570)' : 'var(--c-6c63ff)' }}
          />
        </div>
      </div>
      <span className="text-orbit-secondary text-xs text-right">{fmtAnn(cat.monthlyDemand)}</span>
      <span className="text-xs text-right font-medium"
        style={{ color: hasData ? (dimmed ? 'var(--c-555570)' : 'var(--c-8b85ff)') : 'var(--c-555570)' }}>
        {hasData ? fmtAnn(cat.page1Demand) : '—'}
      </span>
      <span className="text-sm font-semibold text-right"
        style={{ color: hasData ? (dimmed ? 'var(--c-555570)' : 'var(--c-f0f0ff)') : 'var(--c-555570)' }}>
        {hasData ? `${share.toFixed(1)}%` : '—'}
      </span>
    </div>
  );
}
