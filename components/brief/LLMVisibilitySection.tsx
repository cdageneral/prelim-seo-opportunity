'use client';

import { Fragment, useState } from 'react';

// ─── Helper ───────────────────────────────────────────────────────────────────

function firstSentences(text: string, n: number): string {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  if (!matches) return text;
  return matches.slice(0, n).join(' ').trim();
}

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

// ─── Types (mirror llmProbe.ts v2) ────────────────────────────────────────────

interface ProbeResultV2 {
  id:           string;
  platform:     'claude' | 'chatgpt';
  category:     string | null;
  intent:       string;
  branded:      boolean;
  prompt:       string;
  mentioned:    boolean;
  excerpt:      string | null;
  responseText: string;
  sentiment:    'positive' | 'neutral' | 'negative' | null;
  recognized:   boolean | null;
}

interface CategoryVisibilityV2 {
  category:        string;
  monthlyDemand:   number;
  claudeMentions:  number;
  claudeTotal:     number;
  chatgptMentions: number;
  chatgptTotal:    number;
  mentionRate:     number;
}

interface SentimentExampleV2 {
  tone:     'positive' | 'negative';
  platform: 'claude' | 'chatgpt';
  prompt:   string;
  category: string | null;
  quote:    string;
}

interface LLMProbeSnapshotV2 {
  source:        'llm_probe_v2';
  probedAt:      string;
  platformsUsed: string[];
  promptsPerPlatform: number;
  results:       ProbeResultV2[];
  categories:    CategoryVisibilityV2[];
  unbranded: { mentions: number; total: number; score: number };
  branded:   { recognized: number; total: number; score: number; assessed: boolean };
  sentiment: {
    positive: number; neutral: number; negative: number; totalMentions: number;
    assessed: boolean;
    examples: SentimentExampleV2[];
  };
  overallScore: number;
}

// v1 types (legacy snapshots from analyses run before v7.80)
interface ProbePromptResultV1 { prompt: string; mentioned: boolean; excerpt: string | null }
interface PlatformProbeDataV1 {
  platform: 'claude' | 'chatgpt'; label: string;
  results: ProbePromptResultV1[]; mentionCount: number; mentionRate: number;
}
interface LLMProbeSnapshotV1 {
  source: 'llm_probe'; probedAt: string; prompts: string[];
  platforms: PlatformProbeDataV1[]; overallScore: number;
  overallMentions: number; overallTotal: number;
}

const PLATFORM_LABEL: Record<string, string> = {
  claude:  'Claude',
  chatgpt: 'ChatGPT',
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { analysis: any; }

export default function LLMVisibilitySection({ analysis }: Props) {
  const snapshot = analysis.profoundSnapshot as any;

  if (snapshot?.source === 'llm_probe_v2') {
    return <ProbeViewV2 snapshot={snapshot as LLMProbeSnapshotV2} />;
  }
  if (snapshot?.source === 'llm_probe') {
    return <ProbeViewV1 snapshot={snapshot as LLMProbeSnapshotV1} />;
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
      <p className="text-orbit-tertiary text-sm">
        No LLM probe data yet — run a full analysis to query Claude + ChatGPT live.
      </p>
      {aiText && (
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-accent text-xs font-medium mb-2 uppercase tracking-widest">The AI Search Moment</p>
          <p className="text-orbit-secondary text-sm leading-relaxed">{firstSentences(aiText, 2)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Probe View v2 ────────────────────────────────────────────────────────────

function ProbeViewV2({ snapshot }: { snapshot: LLMProbeSnapshotV2 }) {
  const { categories, unbranded, branded, sentiment, results, probedAt, promptsPerPlatform, platformsUsed } = snapshot;
  const [showDetail, setShowDetail] = useState(false);
  // v7.276: per-category prompt drawer — which category row is expanded inline.
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // The exact prompts sent, per category, deduped (each prompt goes to both
  // platforms). Each row carries whether the brand was mentioned on Claude /
  // ChatGPT for that prompt (real data; null = that platform had no result).
  // Used by the inline per-row "view prompts" drawer (v7.277 badges).
  const promptsByCat = (() => {
    const byCat = new Map<string, Map<string, DrawerRow>>();
    for (const r of results) {
      if (!r.category) continue;                 // brand-level prompts live in the full detail toggle
      if (!byCat.has(r.category)) byCat.set(r.category, new Map());
      const m = byCat.get(r.category)!;
      if (!m.has(r.prompt)) m.set(r.prompt, { branded: r.branded, prompt: r.prompt, claude: null, chatgpt: null });
      const row = m.get(r.prompt)!;
      if (r.platform === 'claude')  row.claude  = r.mentioned;
      if (r.platform === 'chatgpt') row.chatgpt = r.mentioned;
    }
    const out = new Map<string, DrawerRow[]>();
    byCat.forEach((m, cat) => out.set(cat, Array.from(m.values())));
    return out;
  })();

  // Brand Mention Share (v7.277) — acquired vs available across ALL probe
  // responses (unbranded + branded, both platforms). Wayne's chosen denominator.
  // Every figure is a direct count of real probe results (Const I.1).
  const claudeResults  = results.filter(r => r.platform === 'claude');
  const chatgptResults = results.filter(r => r.platform === 'chatgpt');
  const mentionTotal   = results.length;
  const mentionAcquired= results.filter(r => r.mentioned).length;
  const mentionPct     = mentionTotal > 0 ? Math.round((mentionAcquired / mentionTotal) * 100) : 0;
  const claudeMentAcq  = claudeResults.filter(r => r.mentioned).length;
  const chatgptMentAcq = chatgptResults.filter(r => r.mentioned).length;
  const mentionColor   = mentionPct >= 60 ? 'text-green-400' : mentionPct >= 30 ? 'text-amber-400' : 'text-red-400';

  const probeDate = new Date(probedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const unbrandedColor = unbranded.score >= 60 ? 'text-green-400'
    : unbranded.score >= 30 ? 'text-amber-400' : 'text-red-400';
  const brandedColor = branded.score >= 80 ? 'text-green-400'
    : branded.score >= 50 ? 'text-amber-400' : 'text-red-400';

  const totalPrompts = promptsPerPlatform * Math.max(platformsUsed.length, 1);
  const sortedCats   = [...(categories ?? [])].sort((a, b) => b.monthlyDemand - a.monthlyDemand);

  const sentTotal = sentiment.positive + sentiment.neutral + sentiment.negative;
  const pctPos = sentTotal > 0 ? Math.round((sentiment.positive / sentTotal) * 100) : 0;
  const pctNeg = sentTotal > 0 ? Math.round((sentiment.negative / sentTotal) * 100) : 0;
  const pctNeu = sentTotal > 0 ? Math.max(0, 100 - pctPos - pctNeg) : 0;

  const posExamples = sentiment.examples.filter(e => e.tone === 'positive');
  const negExamples = sentiment.examples.filter(e => e.tone === 'negative');

  return (
    <div className="orbit-card p-6 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">GEO / LLM Gap</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">AI Search Visibility</h3>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] bg-orbit-accent/10 border border-orbit-accent/30 text-orbit-accent px-2 py-0.5 rounded-full font-medium">
              Live AI Probe
            </span>
            <span className="text-orbit-tertiary text-[10px]">
              {totalPrompts} prompts · Claude + ChatGPT (gpt-4o-mini) · queried {probeDate}
            </span>
          </div>
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-tertiary text-xs">Unbranded visibility</p>
          <p className={`text-3xl font-black mt-1 ${unbrandedColor}`}>{unbranded.score}<span className="text-sm font-medium text-orbit-tertiary">/100</span></p>
          <p className="text-orbit-tertiary text-[10px] mt-1">
            Mentioned in {unbranded.mentions} of {unbranded.total} prompts that never named the brand
          </p>
        </div>
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-tertiary text-xs">Brand recognition</p>
          <p className={`text-3xl font-black mt-1 ${brandedColor}`}>{branded.score}<span className="text-sm font-medium text-orbit-tertiary">/100</span></p>
          <p className="text-orbit-tertiary text-[10px] mt-1">
            {branded.recognized} of {branded.total} branded prompts returned an accurate description
            {!branded.assessed && ' (mention-based fallback)'}
          </p>
        </div>
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-tertiary text-xs">Sentiment of mentions</p>
          {sentiment.assessed && sentTotal > 0 ? (
            <>
              <div className="mt-3 flex flex-col gap-2">
                <SentimentBar tone="positive" count={sentiment.positive} pct={pctPos} />
                <SentimentBar tone="neutral"  count={sentiment.neutral}  pct={pctNeu} />
                <SentimentBar tone="negative" count={sentiment.negative} pct={pctNeg} />
              </div>
              <p className="text-orbit-tertiary text-[10px] mt-2">
                {sentiment.totalMentions} mentions assessed
              </p>
            </>
          ) : (
            <p className="text-orbit-tertiary text-xs mt-2 italic">
              {sentiment.totalMentions === 0
                ? 'No brand mentions to assess.'
                : 'Sentiment classification unavailable for this run.'}
            </p>
          )}
        </div>
        {/* Brand Mention Share (v7.277) — acquired vs available across ALL responses */}
        <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <p className="text-orbit-tertiary text-xs">Brand mention share</p>
          <p className={`text-3xl font-black mt-1 ${mentionColor}`}>{mentionPct}<span className="text-sm font-medium text-orbit-tertiary">%</span></p>
          <p className="text-orbit-tertiary text-[10px] mt-1">
            Mentioned in {mentionAcquired} of {mentionTotal} responses (acquired / available, all prompts)
          </p>
          <p className="text-orbit-tertiary text-[10px] mt-0.5">
            Claude {claudeMentAcq}/{claudeResults.length} · ChatGPT {chatgptMentAcq}/{chatgptResults.length}
          </p>
        </div>
      </div>

      {/* Citation share — deferred (v7.277): the LLM probe does not capture citation
          links today; it would require citation-grounded (web-search) probing.
          Shown as brand-mention share only until that data exists (Const I.1). */}

      {/* Category visibility table */}
      {sortedCats.length > 0 && (
        <div>
          <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-2">
            Visibility by product category <span className="normal-case">(unbranded prompts — same categories as Keyword Landscape)</span>
          </p>
          <div className="bg-orbit-surface border border-orbit-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-orbit-tertiary text-[10px] border-b border-orbit-border">
                  <th className="text-left  font-medium px-4 py-2">Category</th>
                  <th className="text-right font-medium px-3 py-2">Monthly demand</th>
                  <th className="text-right font-medium px-3 py-2">Claude</th>
                  <th className="text-right font-medium px-3 py-2">ChatGPT</th>
                  <th className="text-left  font-medium px-4 py-2 w-[30%]">Mention rate</th>
                </tr>
              </thead>
              <tbody>
                {sortedCats.map(cat => {
                  const pct = Math.round(cat.mentionRate * 100);
                  const barColor = pct >= 67 ? 'bg-green-500' : pct >= 34 ? 'bg-amber-500' : 'bg-red-500/60';
                  const isOpen   = expandedCat === cat.category;
                  const catRows  = promptsByCat.get(cat.category) ?? [];
                  return (
                    <Fragment key={cat.category}>
                      <tr
                        className={`border-b border-orbit-border/50 last:border-0 cursor-pointer hover:bg-orbit-muted/30 transition-colors ${isOpen ? 'bg-orbit-muted/30' : ''}`}
                        onClick={() => setExpandedCat(c => c === cat.category ? null : cat.category)}
                        aria-expanded={isOpen}
                      >
                        <td className="px-4 py-2.5 text-orbit-primary">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`text-orbit-tertiary text-[9px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                            <span>{cat.category}</span>
                            {catRows.length > 0 && (
                              <span className="text-orbit-accent text-[10px] font-medium">
                                {isOpen ? 'hide prompts' : 'view prompts'}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-orbit-secondary">{fmtVol(cat.monthlyDemand)}</td>
                        <td className="px-3 py-2.5 text-right text-orbit-secondary">{cat.claudeMentions}/{cat.claudeTotal}</td>
                        <td className="px-3 py-2.5 text-right text-orbit-secondary">{cat.chatgptMentions}/{cat.chatgptTotal}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-orbit-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                            </div>
                            <span className="text-orbit-secondary text-[10px] w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-orbit-border/50 last:border-0 bg-orbit-muted/20">
                          <td colSpan={5} className="px-4 py-3">
                            <PromptDrawer rows={catRows} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sentiment examples — verbatim */}
      {(posExamples.length > 0 || negExamples.length > 0) && (
        <div>
          <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-2">
            What the AIs are saying <span className="normal-case">(verbatim excerpts)</span>
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {posExamples.map((ex, i) => <SentimentQuote key={`p${i}`} ex={ex} />)}
            {negExamples.map((ex, i) => <SentimentQuote key={`n${i}`} ex={ex} />)}
          </div>
        </div>
      )}

      {/* Methodology + toggles */}
      <div className="border-t border-orbit-border pt-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-orbit-tertiary text-[10px]">
          6 prompts per category (5 unbranded + 1 branded) + 4 brand-level, per platform.
          Responses are live at analysis time, not an index. Sentiment is Claude-assessed; excerpts are verbatim.
        </p>
        <button
          onClick={() => setShowDetail(v => !v)}
          className="text-orbit-secondary text-xs hover:text-orbit-primary transition-colors shrink-0"
        >
          {showDetail ? 'Hide prompts & responses ▲' : 'View all prompts & responses ▼'}
        </button>
      </div>

      {showDetail && <ProbeDetail results={results} />}

    </div>
  );
}

// ─── Prompt Drawer (inline per-category, v7.276; mention badges v7.277) ────────
// The exact prompts sent for ONE category — no responses — each tagged
// unbranded/branded, plus a per-platform badge when the brand was mentioned in
// that platform's response (real data). Rendered in an expandable row.

interface DrawerRow {
  branded:  boolean;
  prompt:   string;
  claude:   boolean | null;   // brand mentioned in Claude's response (null = no result)
  chatgpt:  boolean | null;   // brand mentioned in ChatGPT's response (null = no result)
}

function MentionBadge({ platform, mentioned }: { platform: 'Claude' | 'ChatGPT'; mentioned: boolean | null }) {
  // Only render when we SECURED a mention on that platform (Wayne's ask).
  if (mentioned !== true) return null;
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 bg-green-500/15 text-green-400 border border-green-500/30 font-medium">
      ✓ {platform} mention
    </span>
  );
}

function PromptDrawer({ rows }: { rows: DrawerRow[] }) {
  if (rows.length === 0) {
    return <p className="text-orbit-tertiary text-[11px] italic">No prompts recorded for this category.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-orbit-tertiary text-[10px] leading-relaxed">
        Exact prompts sent to each platform (Claude + ChatGPT) for this category. Unbranded prompts
        never name the brand — they are the visibility signal; the branded prompt is used only for sentiment.
        A green badge marks a prompt where the brand was actually mentioned, per platform.
      </p>
      <ol className="flex flex-col gap-2">
        {rows.map((r, ri) => (
          <li key={ri} className="flex items-start gap-2 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${
              r.branded
                ? 'bg-orbit-muted text-orbit-tertiary'
                : 'bg-orbit-accent/10 text-orbit-accent'
            }`}>{r.branded ? 'branded' : 'unbranded'}</span>
            <span className="text-orbit-secondary text-[11px] italic leading-relaxed">&ldquo;{r.prompt}&rdquo;</span>
            <span className="inline-flex items-center gap-1.5 mt-0.5">
              <MentionBadge platform="Claude"  mentioned={r.claude} />
              <MentionBadge platform="ChatGPT" mentioned={r.chatgpt} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Sentiment Bar Row (v7.278) ───────────────────────────────────────────────
// One labeled row per tone: icon (thumbs-up / neutral / thumbs-down) + horizontal
// bar + count·%. Colors chosen to read in BOTH light and dark mode (Const IV.6).

function SentimentBar({ tone, count, pct }: { tone: 'positive' | 'neutral' | 'negative'; count: number; pct: number }) {
  // Single shades chosen to clear ≥3:1 contrast on BOTH the light and dark
  // orbit-surface (Const IV.6 — theme parity); the app toggles theme via
  // [data-theme="light"], so OS-based `dark:` variants must not be used.
  const style =
    tone === 'positive' ? { bar: 'bg-green-500', text: 'text-green-600', label: 'Positive' }
    : tone === 'negative' ? { bar: 'bg-red-500',   text: 'text-red-600',   label: 'Negative' }
    : { bar: 'bg-slate-400', text: 'text-slate-500', label: 'Neutral' };
  return (
    <div className="flex items-center gap-2">
      <span className={`shrink-0 ${style.text}`} role="img" aria-label={style.label} title={style.label}>
        {tone === 'positive' ? <ThumbsUpIcon /> : tone === 'negative' ? <ThumbsDownIcon /> : <NeutralIcon />}
      </span>
      <div className="flex-1 h-2 rounded-full bg-orbit-muted overflow-hidden">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 w-16 text-right text-orbit-secondary text-[10px] tabular-nums">
        {count} · {pct}%
      </span>
    </div>
  );
}

function ThumbsUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function ThumbsDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function NeutralIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </svg>
  );
}

// ─── Sentiment Quote Card ─────────────────────────────────────────────────────

function SentimentQuote({ ex }: { ex: SentimentExampleV2 }) {
  const positive = ex.tone === 'positive';
  return (
    <div className={`bg-orbit-surface rounded-lg p-4 border-l-2 ${positive ? 'border-green-500' : 'border-red-500'}`}>
      <p className={`text-[10px] font-medium mb-1.5 ${positive ? 'text-green-400' : 'text-red-400'}`}>
        {positive ? 'Positive' : 'Negative'} · {PLATFORM_LABEL[ex.platform] ?? ex.platform}
        {ex.category ? ` · ${ex.category}` : ' · brand-level'}
      </p>
      <p className="text-orbit-secondary text-xs leading-relaxed italic">&ldquo;{ex.quote}&rdquo;</p>
      <p className="text-orbit-tertiary text-[10px] mt-1.5">Prompt: &ldquo;{ex.prompt}&rdquo;</p>
    </div>
  );
}

// ─── Full Prompt/Response Detail ──────────────────────────────────────────────

function ProbeDetail({ results }: { results: ProbeResultV2[] }) {
  // Group by prompt (each prompt was sent to both platforms)
  const byPrompt = new Map<string, ProbeResultV2[]>();
  for (const r of results) {
    if (!byPrompt.has(r.prompt)) byPrompt.set(r.prompt, []);
    byPrompt.get(r.prompt)!.push(r);
  }

  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-3 max-h-96 overflow-y-auto">
      {Array.from(byPrompt.entries()).map(([prompt, rows], i) => (
        <div key={i} className="border-b border-orbit-border/50 last:border-0 pb-3 last:pb-0">
          <p className="text-orbit-primary text-xs font-medium">
            {i + 1}. &ldquo;{prompt}&rdquo;
            {rows[0]?.category && <span className="text-orbit-tertiary font-normal"> · {rows[0].category}</span>}
            {rows[0]?.branded
              ? <span className="text-[9px] ml-2 bg-orbit-muted text-orbit-tertiary px-1.5 py-0.5 rounded-full">branded</span>
              : <span className="text-[9px] ml-2 bg-orbit-accent/10 text-orbit-accent px-1.5 py-0.5 rounded-full">unbranded</span>}
          </p>
          <div className="mt-1.5 flex flex-col gap-1">
            {rows.map(r => (
              <div key={r.id} className="flex items-start gap-2">
                <span className={`text-[10px] font-bold shrink-0 mt-0.5 ${r.mentioned ? 'text-green-400' : 'text-orbit-tertiary'}`}>
                  {r.mentioned ? '✓' : '–'}
                </span>
                <span className="text-orbit-tertiary text-[10px] shrink-0 w-14">{PLATFORM_LABEL[r.platform] ?? r.platform}</span>
                {r.mentioned && r.sentiment && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    r.sentiment === 'positive' ? 'bg-green-500/10 text-green-400'
                    : r.sentiment === 'negative' ? 'bg-red-500/10 text-red-400'
                    : 'bg-orbit-muted text-orbit-tertiary'
                  }`}>{r.sentiment}</span>
                )}
                <span className="text-orbit-secondary text-[10px] italic leading-relaxed">
                  {r.mentioned && r.excerpt ? `“${r.excerpt}”` : r.responseText ? 'Brand not mentioned.' : 'No response (call failed).'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Probe View v1 (legacy snapshots, pre-v7.80) ──────────────────────────────

function ProbeViewV1({ snapshot }: { snapshot: LLMProbeSnapshotV1 }) {
  const { platforms, overallScore, overallMentions, overallTotal, prompts, probedAt } = snapshot;

  const scoreColor = overallScore >= 60 ? 'text-green-400'
    : overallScore >= 30 ? 'text-amber-400' : 'text-red-400';

  const probeDate = new Date(probedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="orbit-card p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">GEO / LLM Gap</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">AI Search Visibility</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] bg-orbit-accent/10 border border-orbit-accent/30 text-orbit-accent px-2 py-0.5 rounded-full font-medium">
              Live AI Probe (v1)
            </span>
            <span className="text-orbit-tertiary text-[10px]">
              Claude + ChatGPT · Queried {probeDate} · re-run analysis for category-level probe
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-4xl font-black ${scoreColor}`}>{overallScore}</span>
          <p className="text-orbit-tertiary text-xs mt-0.5">
            {overallMentions}/{overallTotal} prompts mentioned brand
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {platforms.map(platform => (
          <div key={platform.platform} className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-orbit-primary text-sm font-medium">{platform.label}</span>
              <span className="text-sm font-bold text-orbit-secondary">
                {platform.mentionCount}/{platform.results.length} mentioned
              </span>
            </div>
            {(() => {
              const best = platform.results.find(r => r.mentioned && r.excerpt)?.excerpt ?? null;
              return best
                ? <p className="text-orbit-secondary text-xs leading-relaxed italic">&ldquo;{best}&rdquo;</p>
                : <p className="text-orbit-tertiary text-xs italic">Brand not mentioned in any response.</p>;
            })()}
          </div>
        ))}
        {platforms.length === 0 && (
          <p className="text-orbit-tertiary text-sm col-span-2">
            No probe results — check that OPENAI_API_KEY and ANTHROPIC_API_KEY are set in Vercel.
          </p>
        )}
      </div>

      <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
        <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-3">
          Prompts sent to each platform
        </p>
        <ol className="flex flex-col gap-2">
          {prompts.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-orbit-tertiary text-[10px] font-mono mt-0.5 shrink-0">{i + 1}.</span>
              <span className="text-orbit-secondary text-xs italic">&ldquo;{p}&rdquo;</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
