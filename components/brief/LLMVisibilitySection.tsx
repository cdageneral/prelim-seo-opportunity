'use client';

function firstSentences(text: string, n: number): string {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  if (!matches) return text;
  return matches.slice(0, n).join(' ').trim();
}

interface Props { analysis: any; }

const PLATFORM_ICONS: Record<string, string> = {
  chatgpt:      '🤖',
  perplexity:   '🔮',
  gemini:       '✨',
  claude:       '🧠',
  bing_copilot: '🔵',
};

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt:      'ChatGPT',
  perplexity:   'Perplexity',
  gemini:       'Gemini',
  claude:       'Claude',
  bing_copilot: 'Bing Copilot',
};

export default function LLMVisibilitySection({ analysis }: Props) {
  const profound       = analysis.profoundSnapshot ?? {};
  const overallScore   = profound.overallScore ?? 0;
  const platforms      = (profound.platformScores ?? []) as any[];
  const brandContext   = profound.brandContext ?? {};
  const competitors    = (profound.competitors ?? []).slice(0, 4) as any[];
  const topicAuthority = (profound.topicAuthority ?? []).slice(0, 6) as any[];
  const trend          = (profound.visibilityTrend ?? []) as any[];

  const narrative = analysis.semrushSnapshot?._narrative;
  const aiText    = narrative?.aiSearchMoment ?? '';

  // Score color
  const scoreColor = overallScore >= 60 ? 'text-green-400'
    : overallScore >= 35 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="orbit-card p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">GEO / LLM Gap</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">AI Search Visibility</h3>
        </div>
        <div className="text-right">
          <span className={`text-4xl font-black ${scoreColor}`}>{overallScore}</span>
          <p className="text-orbit-tertiary text-xs mt-0.5">LLM visibility score</p>
          <p className="text-orbit-tertiary text-[10px]">Source: Profound API</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Platform Scores */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          <p className="text-orbit-secondary text-xs font-medium">Citation Rate by Platform</p>
          {platforms.map((p: any) => (
            <PlatformRow key={p.platform} platform={p} />
          ))}
        </div>

        {/* Brand Context */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          <p className="text-orbit-secondary text-xs font-medium">How AI Describes This Brand</p>

          {brandContext.summary && (
            <div className="bg-orbit-surface border border-orbit-accent/20 rounded-lg p-4">
              <p className="text-orbit-secondary text-sm italic leading-relaxed">
                &ldquo;{brandContext.summary}&rdquo;
              </p>
              <p className="text-orbit-tertiary text-[10px] mt-2">Source: Profound brand context analysis</p>
            </div>
          )}

          {(brandContext.misalignments?.length ?? 0) > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 text-xs font-medium mb-1.5">Perception Gaps</p>
              {brandContext.misalignments.map((m: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5 mt-1">
                  <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                  <p className="text-orbit-secondary text-xs">{m}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Competitor LLM SOV */}
        <div className="lg:col-span-1 flex flex-col gap-3">
          <p className="text-orbit-secondary text-xs font-medium">LLM Share of Voice vs. Competitors</p>
          {competitors.map((comp: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-orbit-secondary text-xs w-28 truncate">{comp.domain}</span>
              <div className="flex-1 h-1.5 bg-orbit-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3A3860] rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, comp.score)}%` }}
                />
              </div>
              <span className="text-orbit-tertiary text-xs w-8 text-right">{comp.score}</span>
            </div>
          ))}

          {/* Topic Authority */}
          {topicAuthority.length > 0 && (
            <div className="mt-2">
              <p className="text-orbit-secondary text-xs font-medium mb-2">Topic Authority Gaps</p>
              <div className="flex flex-wrap gap-1.5">
                {topicAuthority.map((t: any, i: number) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      t.score >= 60
                        ? 'bg-orbit-accent/10 border-orbit-accent/30 text-orbit-accent'
                        : 'bg-orbit-muted border-orbit-border text-orbit-secondary'
                    }`}
                  >
                    {t.topic}
                    {t.competitor && (
                      <span className="text-orbit-tertiary ml-1">→ {t.competitor}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Search Moment Narrative */}
      {aiText && (
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-accent text-xs font-medium mb-2 uppercase tracking-widest">The AI Search Moment</p>
          <p className="text-orbit-secondary text-sm leading-relaxed">{firstSentences(aiText, 2)}</p>
        </div>
      )}
    </div>
  );
}

function PlatformRow({ platform }: { platform: any }) {
  const score       = platform.score ?? 0;
  const citationRate = Math.round((platform.citationRate ?? 0) * 100);
  const label        = PLATFORM_LABELS[platform.platform] ?? platform.platform;
  const icon         = PLATFORM_ICONS[platform.platform] ?? '💡';

  const scoreColor = score >= 60 ? 'text-green-400'
    : score >= 35 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-5 shrink-0">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-orbit-secondary text-xs">{label}</span>
          <span className={`${scoreColor} text-xs font-semibold`}>{score}/100</span>
        </div>
        <div className="h-1 bg-orbit-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-orbit-accent/60 rounded-full transition-all duration-700"
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-orbit-tertiary text-[10px] mt-0.5">{citationRate}% citation rate</p>
      </div>
    </div>
  );
}
