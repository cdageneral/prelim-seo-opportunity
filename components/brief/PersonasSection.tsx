'use client';

interface Persona {
  id:                  string;
  segmentName:         string;
  description:         string;
  intentStage:         string;
  primaryQueries:      string[];
  painPoints:          string[];
  aiDiscoveryBehavior: string;
  contentGaps:         string[];
}

interface Props { analysis: any; }

const INTENT_COLORS: Record<string, string> = {
  Awareness:     'text-cyan-400    bg-cyan-400/10    border-cyan-400/30',
  Consideration: 'text-amber-400   bg-amber-400/10   border-amber-400/30',
  Decision:      'text-green-400   bg-green-400/10   border-green-400/30',
};

export default function PersonasSection({ analysis }: Props) {
  const personaList: Persona[] = analysis.personas ?? [];
  if (personaList.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Audience Intelligence</p>
        <h3 className="text-orbit-primary text-lg font-semibold mt-1">Buyer Personas</h3>
        <p className="text-orbit-secondary text-xs mt-1">Derived from real organic search behavior · Semrush + SerpAPI</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {personaList.map(p => <PersonaCard key={p.id} persona={p} />)}
      </div>
    </div>
  );
}

function PersonaCard({ persona }: { persona: Persona }) {
  const intentStyle = INTENT_COLORS[persona.intentStage] ?? INTENT_COLORS.Awareness;

  return (
    <div className="orbit-card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-orbit-primary font-semibold text-sm">{persona.segmentName}</p>
          <p className="text-orbit-secondary text-xs mt-1 leading-relaxed">{persona.description}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${intentStyle}`}>
          {persona.intentStage}
        </span>
      </div>

      {/* Primary Queries */}
      <div>
        <p className="text-orbit-tertiary text-[10px] font-medium mb-1.5 uppercase tracking-widest">How They Search</p>
        <div className="flex flex-wrap gap-1.5">
          {(persona.primaryQueries ?? []).map((q, i) => (
            <span key={i} className="text-[10px] bg-orbit-muted border border-orbit-border px-2 py-0.5 rounded text-orbit-secondary font-mono">
              "{q}"
            </span>
          ))}
        </div>
      </div>

      {/* Pain Points */}
      <div>
        <p className="text-orbit-tertiary text-[10px] font-medium mb-1.5 uppercase tracking-widest">Pain Points</p>
        <ul className="flex flex-col gap-1">
          {(persona.painPoints ?? []).map((p, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-orbit-accent mt-0.5 shrink-0 text-[10px]">▸</span>
              <span className="text-orbit-secondary text-xs">{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* AI Discovery */}
      {persona.aiDiscoveryBehavior && (
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
          <p className="text-orbit-tertiary text-[10px] font-medium mb-1 uppercase tracking-widest">AI Discovery Behavior</p>
          <p className="text-orbit-secondary text-xs italic">"{persona.aiDiscoveryBehavior}"</p>
        </div>
      )}

      {/* Content Gaps */}
      {(persona.contentGaps ?? []).length > 0 && (
        <div>
          <p className="text-orbit-tertiary text-[10px] font-medium mb-1.5 uppercase tracking-widest">Content Gaps</p>
          <div className="flex flex-wrap gap-1.5">
            {persona.contentGaps.map((gap, i) => (
              <span key={i} className="text-[10px] border border-red-500/30 text-red-400 bg-red-500/5 px-2 py-0.5 rounded">
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
