'use client';

interface Props { analysis: any; }

export default function CompetitorGapSection({ analysis }: Props) {
  const semrush    = analysis.semrushSnapshot ?? {};
  const competitors = (semrush.competitors ?? []).slice(0, 5);
  const gapKeywords = (semrush.gapKeywords ?? []).slice(0, 8);
  const narrative   = analysis.semrushSnapshot?._narrative;
  const text        = narrative?.competitiveReality ?? '';

  const clientTraffic = analysis.clientOwnedVolume ?? 0;
  const fmt = (n: number) => n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  // Compute max for relative bar sizing
  const maxTraffic = Math.max(clientTraffic, ...competitors.map((c: any) => c.organicTraffic ?? 0));

  return (
    <div className="orbit-card p-6 flex flex-col gap-5">
      {/* Header */}
      <div>
        <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Competitor Gap</p>
        <h3 className="text-orbit-primary text-lg font-semibold mt-1">Share of Voice</h3>
      </div>

      {/* SOV Bars */}
      <div className="flex flex-col gap-2">
        {/* Client row first */}
        <SOVRow
          domain="You"
          traffic={clientTraffic}
          maxTraffic={maxTraffic}
          isClient
        />
        {competitors.map((comp: any, i: number) => (
          <SOVRow
            key={i}
            domain={comp.domain}
            traffic={comp.organicTraffic ?? 0}
            maxTraffic={maxTraffic}
          />
        ))}
      </div>

      {/* Gap Keywords */}
      {gapKeywords.length > 0 && (
        <div>
          <p className="text-orbit-secondary text-xs font-medium mb-2 uppercase tracking-widest">
            Keywords Competitor Owns — You Don&apos;t
          </p>
          <div className="flex flex-wrap gap-2">
            {gapKeywords.map((kw: any, i: number) => (
              <span key={i} className="text-xs bg-orbit-muted border border-orbit-border px-2 py-0.5 rounded-full text-orbit-secondary">
                {kw.keyword}
                {kw.searchVolume > 0 && (
                  <span className="text-orbit-tertiary ml-1">
                    {kw.searchVolume >= 1000 ? `${(kw.searchVolume / 1000).toFixed(0)}K` : kw.searchVolume}
                  </span>
                )}
              </span>
            ))}
          </div>
          <p className="text-orbit-tertiary text-[10px] mt-2">Source: Semrush Keyword Gap Analysis</p>
        </div>
      )}

      {/* Narrative */}
      {text && (
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-secondary text-sm leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

function SOVRow({
  domain, traffic, maxTraffic, isClient = false
}: { domain: string; traffic: number; maxTraffic: number; isClient?: boolean }) {
  const pct = maxTraffic > 0 ? (traffic / maxTraffic) * 100 : 0;
  const fmt = (n: number) => n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs truncate shrink-0">
        <span className={isClient ? 'text-orbit-accent font-semibold' : 'text-orbit-secondary'}>
          {domain}
        </span>
      </div>
      <div className="flex-1 h-1.5 bg-orbit-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            isClient ? 'bg-orbit-accent' : 'bg-orbit-muted-foreground bg-[#3A3860]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs w-14 text-right ${isClient ? 'text-orbit-accent font-medium' : 'text-orbit-tertiary'}`}>
        {fmt(traffic)}/mo
      </span>
    </div>
  );
}
