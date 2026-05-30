'use client';

// ─── Helper ───────────────────────────────────────────────────────────────────

function firstSentences(text: string, n: number): string {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  if (!matches) return text;
  return matches.slice(0, n).join(' ').trim();
}

// ─── Types (mirror llmProbe.ts) ───────────────────────────────────────────────

interface ProbePromptResult {
  prompt:    string;
  mentioned: boolean;
  excerpt:   string | null;
}

interface PlatformProbeData {
  platform:     'claude' | 'chatgpt';
  label:        string;
  results:      ProbePromptResult[];
  mentionCount: number;
  mentionRate:  number;
}

interface LLMProbeSnapshot {
  source:          'llm_probe';
  probedAt:        string;
  prompts:         string[];
  platforms:       PlatformProbeData[];
  overallScore:    number;
  overallMentions: number;
  overallTotal:    number;
}

// ─── Platform Icons ───────────────────────────────────────────────────────────

const PLATFORM_ICON: Record<string, string> = {
  claude:  '🧠',
  chatgpt: '🤖',
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { analysis: any; }

export default function LLMVisibilitySection({ analysis }: Props) {
  const snapshot = analysis.profoundSnapshot as LLMProbeSnapshot | null;

  // ── Probe data path ──────────────────────────────────────────────────────────
  if (snapshot?.source === 'llm_probe') {
    return <ProbeView snapshot={snapshot} />;
  }

  // ── Legacy / empty state ─────────────────────────────────────────────────────
  const narrative = analysis.semrushSnapshot?._narrative;
  const aiText    = narrative?.aiSearchMoment ?? '';
  const score     = snapshot?.overallScore ?? 0;

  return (
    <div className="orbit-card p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">GEO / LLM Gap</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">AI Search Visibility</h3>
        </div>
        <div className="text-right">
          <span className="text-4xl font-black text-red-400">{score}</span>
          <p className="text-orbit-tertiary text-xs mt-0.5">LLM visibility score</p>
        </div>
      </div>
      {aiText && (
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-accent text-xs font-medium mb-2 uppercase tracking-widest">The AI Search Moment</p>
          <p className="text-orbit-secondary text-sm leading-relaxed">{firstSentences(aiText, 2)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Probe View ───────────────────────────────────────────────────────────────

function ProbeView({ snapshot }: { snapshot: LLMProbeSnapshot }) {
  const { platforms, overallScore, overallMentions, overallTotal, prompts, probedAt } = snapshot;

  const scoreColor = overallScore >= 60 ? 'text-green-400'
    : overallScore >= 30 ? 'text-amber-400' : 'text-red-400';

  const probeDate = new Date(probedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="orbit-card p-6 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">GEO / LLM Gap</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">AI Search Visibility</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] bg-orbit-accent/10 border border-orbit-accent/30 text-orbit-accent px-2 py-0.5 rounded-full font-medium">
              Live AI Probe
            </span>
            <span className="text-orbit-tertiary text-[10px]">
              Claude + ChatGPT · Queried {probeDate}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-4xl font-black ${scoreColor}`}>{overallScore}</span>
          <p className="text-orbit-tertiary text-xs mt-0.5">
            {overallMentions}/{overallTotal} prompts mentioned brand
          </p>
          <p className="text-orbit-tertiary text-[10px]">Claude · ChatGPT (gpt-4o-mini)</p>
        </div>
      </div>

      {/* Platform results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {platforms.map(platform => (
          <PlatformCard key={platform.platform} platform={platform} />
        ))}
        {platforms.length === 0 && (
          <p className="text-orbit-tertiary text-sm col-span-2">
            No probe results — check that OPENAI_API_KEY and ANTHROPIC_API_KEY are set in Vercel.
          </p>
        )}
      </div>

      {/* Prompts used — transparency */}
      <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
        <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-3">
          Prompts sent to each platform
        </p>
        <ol className="flex flex-col gap-2">
          {prompts.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-orbit-tertiary text-[10px] font-mono mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span className="text-orbit-secondary text-xs italic">&ldquo;{p}&rdquo;</span>
            </li>
          ))}
        </ol>
        <p className="text-orbit-tertiary text-[10px] mt-3 border-t border-orbit-border pt-3">
          Results reflect what these LLMs said at analysis time. Responses vary between runs and are not a persistent index.
        </p>
      </div>

    </div>
  );
}

// ─── Platform Card ────────────────────────────────────────────────────────────

function PlatformCard({ platform }: { platform: PlatformProbeData }) {
  const icon        = PLATFORM_ICON[platform.platform] ?? '💡';
  const pct         = Math.round(platform.mentionRate * 100);
  const scoreColor  = pct >= 67 ? 'text-green-400' : pct >= 34 ? 'text-amber-400' : 'text-red-400';
  const bestExcerpt = platform.results.find(r => r.mentioned && r.excerpt)?.excerpt ?? null;

  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-3">

      {/* Platform header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-orbit-primary text-sm font-medium">{platform.label}</span>
        </div>
        <span className={`text-sm font-bold ${scoreColor}`}>
          {platform.mentionCount}/{platform.results.length} mentioned
        </span>
      </div>

      {/* Mention bar */}
      <div className="h-1.5 bg-orbit-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            pct >= 67 ? 'bg-green-500' : pct >= 34 ? 'bg-amber-500' : 'bg-red-500/60'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Per-prompt results */}
      <div className="flex flex-col gap-1.5">
        {platform.results.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`text-[10px] shrink-0 font-bold ${r.mentioned ? 'text-green-400' : 'text-orbit-tertiary'}`}>
              {r.mentioned ? '✓' : '–'}
            </span>
            <span className="text-orbit-tertiary text-[10px]">Prompt {i + 1}</span>
            {r.mentioned && (
              <span className="text-[10px] bg-green-500/10 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
                brand cited
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Best excerpt */}
      {bestExcerpt ? (
        <div className="bg-orbit-muted/50 rounded p-3 mt-1">
          <p className="text-orbit-tertiary text-[10px] font-medium mb-1 uppercase tracking-widest">
            What it said
          </p>
          <p className="text-orbit-secondary text-xs leading-relaxed italic">
            &ldquo;{bestExcerpt}&rdquo;
          </p>
        </div>
      ) : (
        <div className="bg-orbit-muted/30 rounded p-3 mt-1">
          <p className="text-orbit-tertiary text-xs italic">Brand not mentioned in any response.</p>
        </div>
      )}

    </div>
  );
}
