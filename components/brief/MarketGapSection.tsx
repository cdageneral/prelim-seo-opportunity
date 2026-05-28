'use client';

interface Props { analysis: any; }

export default function MarketGapSection({ analysis }: Props) {
  const captureRate  = analysis.marketCaptureRate ?? 0;
  const totalVol     = analysis.totalCategoryVolume ?? 0;
  const clientVol    = analysis.clientOwnedVolume ?? 0;
  const missedVol    = totalVol - clientVol;

  const narrative = analysis.semrushSnapshot?._narrative;
  const text      = narrative?.marketPositionNarrative ?? '';

  const fmt = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  return (
    <div className="orbit-card p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Market Gap</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">Category Capture Rate</h3>
        </div>
        {/* Hero % */}
        <div className="text-right">
          <span className="text-4xl font-black text-orbit-accent">
            {Math.round(captureRate * 100)}%
          </span>
          <p className="text-orbit-tertiary text-xs mt-0.5">of market captured</p>
        </div>
      </div>

      {/* Volume Bar */}
      <div>
        <div className="flex justify-between text-xs text-orbit-secondary mb-1.5">
          <span>Client: {fmt(clientVol)}/mo</span>
          <span>Total category: {fmt(totalVol)}/mo</span>
        </div>
        <div className="h-2.5 bg-orbit-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-orbit-accent rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, captureRate * 100)}%` }}
          />
        </div>
        <p className="text-orbit-secondary text-xs mt-1.5">
          <span className="text-red-400 font-medium">{fmt(missedVol)}/mo</span> in organic visits the category receives but this site doesn't capture
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Client Organic Traffic" value={fmt(clientVol) + '/mo'} source="Semrush Domain Overview" />
        <StatCard label="Category Total Traffic" value={fmt(totalVol) + '/mo'} source="Semrush Competitive Landscape" />
      </div>

      {/* Narrative */}
      {text && (
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-secondary text-sm leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="bg-orbit-surface rounded-lg p-3 border border-orbit-border">
      <p className="text-orbit-primary font-semibold text-base">{value}</p>
      <p className="text-orbit-secondary text-xs mt-0.5">{label}</p>
      <p className="text-orbit-tertiary text-[10px] mt-1">Source: {source}</p>
    </div>
  );
}
