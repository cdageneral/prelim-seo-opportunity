'use client';

interface Evidence {
  metric: string;
  label:  string;
  source: string;
  value?: string;
}

interface Opportunity {
  id:               string;
  category:         string;
  title:            string;
  summary:          string;
  impactScore:      number;
  effortScore:      number;
  estimatedVisits:  number;
  estimatedLeads:   number;
  evidence:         Evidence[];
  rank:             number;
}

interface Props { analysis: any; }

const CATEGORY_COLORS: Record<string, string> = {
  SEO:          'text-orbit-accent  bg-orbit-accent/10  border-orbit-accent/30',
  GEO:          'text-cyan-400      bg-cyan-400/10      border-cyan-400/30',
  Content:      'text-purple-400    bg-purple-400/10    border-purple-400/30',
  Technical:    'text-amber-400     bg-amber-400/10     border-amber-400/30',
  Competitive:  'text-red-400       bg-red-400/10       border-red-400/30',
};

const RANK_LABELS = ['', 'Top Priority', 'High Impact', 'Strategic Move'];

export default function OpportunitiesSection({ analysis }: Props) {
  const opps: Opportunity[] = (analysis.opportunities ?? [])
    .sort((a: Opportunity, b: Opportunity) => a.rank - b.rank)
    .slice(0, 3);

  const narrative  = analysis.semrushSnapshot?._narrative;
  const strategic  = narrative?.strategicCall ?? '';

  if (opps.length === 0) return null;

  const fmt = (n: number) => n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Opportunities</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">Top 3 Growth Opportunities</h3>
        </div>
        <p className="text-orbit-tertiary text-xs">Surfaced by Claude · Based on live API data</p>
      </div>

      {/* Opportunity Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {opps.map((opp) => (
          <OpportunityCard key={opp.id ?? opp.rank} opp={opp} />
        ))}
      </div>

      {/* Strategic Call */}
      {strategic && (
        <div className="orbit-card border-orbit-accent/30 bg-orbit-accent/5 p-5">
          <p className="text-orbit-accent text-xs font-medium uppercase tracking-widest mb-2">Strategic Call</p>
          <p className="text-orbit-primary text-sm leading-relaxed font-medium">{strategic}</p>
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const categoryStyle = CATEGORY_COLORS[opp.category] ?? CATEGORY_COLORS.SEO;
  const rankLabel     = RANK_LABELS[opp.rank] ?? `Priority ${opp.rank}`;
  const fmt = (n: number) => n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  // Impact bar
  const impactPct = (opp.impactScore / 10) * 100;
  const effortPct = (opp.effortScore / 10) * 100;

  return (
    <div className="orbit-card p-5 flex flex-col gap-4">
      {/* Rank badge + category */}
      <div className="flex items-center justify-between">
        <span className="text-orbit-tertiary text-xs font-medium">{rankLabel}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${categoryStyle}`}>
          {opp.category}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-orbit-primary font-semibold text-sm leading-snug">{opp.title}</h4>

      {/* Summary */}
      <p className="text-orbit-secondary text-xs leading-relaxed">{opp.summary}</p>

      {/* Scores */}
      <div className="flex flex-col gap-2">
        <ScoreBar label="Impact" pct={impactPct} score={opp.impactScore} color="bg-orbit-accent" />
        <ScoreBar label="Effort" pct={effortPct} score={opp.effortScore} color="bg-amber-500" invert />
      </div>

      {/* Upside estimates */}
      <div className="grid grid-cols-2 gap-2 py-2 border-t border-orbit-border">
        <div>
          <p className="text-green-400 font-bold text-sm">+{fmt(opp.estimatedVisits)}</p>
          <p className="text-orbit-tertiary text-[10px]">est. visits/mo</p>
        </div>
        <div>
          <p className="text-orbit-accent font-bold text-sm">+{fmt(opp.estimatedLeads)}</p>
          <p className="text-orbit-tertiary text-[10px]">est. leads/mo</p>
        </div>
      </div>

      {/* Evidence grid */}
      <div className="grid grid-cols-2 gap-2">
        {(opp.evidence ?? []).slice(0, 4).map((ev, i) => (
          <EvidenceCard key={i} ev={ev} />
        ))}
      </div>
    </div>
  );
}

function ScoreBar({
  label, pct, score, color, invert = false
}: { label: string; pct: number; score: number; color: string; invert?: boolean }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-orbit-tertiary text-[10px]">{label}</span>
        <span className="text-orbit-secondary text-[10px]">
          {score.toFixed(1)}/10 {invert ? '(lower = easier)' : ''}
        </span>
      </div>
      <div className="h-1 bg-orbit-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EvidenceCard({ ev }: { ev: Evidence }) {
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-2.5">
      <p className="text-orbit-primary font-bold text-sm">{ev.metric}</p>
      <p className="text-orbit-secondary text-[10px] mt-0.5">{ev.label}</p>
      <p className="text-orbit-tertiary text-[9px] mt-1">Source: {ev.source}</p>
    </div>
  );
}
