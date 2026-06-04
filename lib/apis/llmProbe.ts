/**
 * LLM Probe v2 — category-driven brand visibility + sentiment
 *
 * v7.80: Replaces the 3-generic-prompt probe with a probe driven by the
 * SAME product categories shown on the Keyword Landscape panel
 * (_categoryBreakdown, computed in Phase 2 synthesis).
 *
 * Prompt scheme (per platform):
 *   Per procedure category (all of them, "Other" excluded):
 *     • 2 unbranded prompts  — "best providers for {category}" style
 *     • 1 branded prompt     — "pros and cons of {client} for {category}"
 *   Brand-level (4):
 *     • overview, reputation, industry-top (unbranded), competitor comparison
 *
 * Platforms: Claude (claude-haiku-4-5) + ChatGPT (gpt-4o-mini). All calls
 * run in a bounded-concurrency pool. This is live data at analysis time —
 * NOT indexed or modeled.
 *
 * Scores:
 *   • unbranded visibility — % of prompts that never named the brand where
 *     the brand was still mentioned (the real GEO metric)
 *   • brand recognition    — % of branded prompts where the LLM demonstrated
 *     actual knowledge of the brand (Claude-assessed, excerpt-backed)
 *
 * Sentiment: one Claude (sonnet) classification pass over the responses that
 * actually mention the brand. Example quotes are VERBATIM — each candidate
 * quote is substring-verified against the raw response text before storage;
 * unverifiable quotes are replaced with the detected mention sentence.
 *
 * Data stored in: analyses.profoundSnapshot (JSONB) — source: 'llm_probe_v2'
 */

import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProbePlatform = 'claude' | 'chatgpt';

export type ProbeIntent =
  | 'unbranded_recommendation'   // best providers for {category}
  | 'unbranded_consideration'    // considering {category}, who to look into
  | 'branded_proscons'           // pros and cons of {client} for {category}
  | 'brand_overview'             // what is {client}
  | 'brand_reputation'           // is {client} reputable / reviews
  | 'industry_top'               // top providers in {industry} (unbranded)
  | 'brand_comparison';          // {client} vs competitors

export interface ProbeResultV2 {
  id:           string;                 // e.g. "claude:cat0:u1"
  platform:     ProbePlatform;
  category:     string | null;          // null = brand-level prompt
  intent:       ProbeIntent;
  branded:      boolean;                // prompt text contains the brand name
  prompt:       string;
  mentioned:    boolean;                // brand/domain found in response
  excerpt:      string | null;          // verbatim sentence containing mention
  responseText: string;                 // raw response (truncated for storage)
  sentiment:    'positive' | 'neutral' | 'negative' | null;  // mentions only
  recognized:   boolean | null;         // branded prompts only (Claude-assessed)
}

export interface CategoryVisibilityV2 {
  category:        string;
  monthlyDemand:   number;              // from _categoryBreakdown (real volumes)
  claudeMentions:  number;              // unbranded prompts only
  claudeTotal:     number;
  chatgptMentions: number;
  chatgptTotal:    number;
  mentionRate:     number;              // 0–1, unbranded prompts, both platforms
}

export interface SentimentExampleV2 {
  tone:     'positive' | 'negative';
  platform: ProbePlatform;
  prompt:   string;
  category: string | null;
  quote:    string;                     // verbatim, substring-verified
}

export interface LLMProbeSnapshotV2 {
  source:        'llm_probe_v2';
  probedAt:      string;
  platformsUsed: string[];              // display labels
  promptsPerPlatform: number;
  results:       ProbeResultV2[];
  categories:    CategoryVisibilityV2[];
  unbranded: { mentions: number; total: number; score: number };   // score 0–100
  branded:   { recognized: number; total: number; score: number; assessed: boolean };
  sentiment: {
    positive: number; neutral: number; negative: number; totalMentions: number;
    assessed: boolean;                  // false if classification pass failed
    examples: SentimentExampleV2[];
  };
  /** Legacy compat — equals unbranded.score so existing consumers keep working. */
  overallScore: number;
}

export interface ProbeCategoryInput {
  name:          string;
  monthlyDemand: number;
}

// ─── Prompt Generation ────────────────────────────────────────────────────────

interface PromptSpec {
  key:      string;                     // stable id fragment
  category: string | null;
  intent:   ProbeIntent;
  branded:  boolean;
  prompt:   string;
}

function buildPromptSpecs(
  clientName: string,
  industry:   string,
  categories: ProbeCategoryInput[],
): PromptSpec[] {
  const specs: PromptSpec[] = [];

  categories.forEach((cat, i) => {
    specs.push({
      key: `cat${i}:u1`, category: cat.name, intent: 'unbranded_recommendation', branded: false,
      prompt: `What are the best companies or providers for ${cat.name.toLowerCase()}?`,
    });
    specs.push({
      key: `cat${i}:u2`, category: cat.name, intent: 'unbranded_consideration', branded: false,
      prompt: `I'm considering ${cat.name.toLowerCase()}. Which companies or providers should I look into, and why?`,
    });
    specs.push({
      key: `cat${i}:b1`, category: cat.name, intent: 'branded_proscons', branded: true,
      prompt: `What are the pros and cons of ${clientName} for ${cat.name.toLowerCase()}?`,
    });
  });

  specs.push({
    key: 'brand:overview', category: null, intent: 'brand_overview', branded: true,
    prompt: `What is ${clientName}? Give me a brief overview.`,
  });
  specs.push({
    key: 'brand:reputation', category: null, intent: 'brand_reputation', branded: true,
    prompt: `Is ${clientName} reputable? What do reviews and customer feedback generally say about them?`,
  });
  specs.push({
    key: 'brand:industry', category: null, intent: 'industry_top', branded: false,
    prompt: `Who are the top providers in the ${industry} industry?`,
  });
  specs.push({
    key: 'brand:compare', category: null, intent: 'brand_comparison', branded: true,
    prompt: `How does ${clientName} compare to its main competitors?`,
  });

  return specs;
}

// ─── Mention Detection (unchanged from v1 — substring on name/domain root) ────

function detectMention(
  response:   string,
  clientName: string,
  domain:     string
): { mentioned: boolean; excerpt: string | null } {
  const nameLower   = clientName.toLowerCase();
  const domainToken = domain.toLowerCase().replace(/^www\./, '').split('.')[0];
  const lower       = response.toLowerCase();

  const mentioned = lower.includes(nameLower) || lower.includes(domainToken);
  if (!mentioned) return { mentioned: false, excerpt: null };

  const sentences = response.split(/(?<=[.!?])\s+/);
  const hit = sentences.find(s => {
    const sl = s.toLowerCase();
    return sl.includes(nameLower) || sl.includes(domainToken);
  });

  const raw = hit ?? response;
  return { mentioned: true, excerpt: raw.trim().substring(0, 300) };
}

// ─── Concurrency Pool ─────────────────────────────────────────────────────────

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── Platform Callers ─────────────────────────────────────────────────────────

const PROBE_MAX_TOKENS  = 500;
const RESPONSE_STORE_MAX = 1200;       // chars of raw response kept in snapshot
const POOL_LIMIT         = 8;          // concurrent calls per platform

async function askClaude(prompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: PROBE_MAX_TOKENS,
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 30_000 });
  return msg.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text as string)
    .join('');
}

async function askChatGPT(prompt: string): Promise<string> {
  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    signal:  AbortSignal.timeout(30_000),
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:      'gpt-4o-mini',
      max_tokens: PROBE_MAX_TOKENS,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.substring(0, 200)}`);
  }
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

async function probePlatform(
  platform:   ProbePlatform,
  specs:      PromptSpec[],
  clientName: string,
  domain:     string,
): Promise<ProbeResultV2[]> {
  const ask = platform === 'claude' ? askClaude : askChatGPT;

  return runPool(specs, POOL_LIMIT, async (spec): Promise<ProbeResultV2> => {
    try {
      const text = await ask(spec.prompt);
      const { mentioned, excerpt } = detectMention(text, clientName, domain);
      return {
        id: `${platform}:${spec.key}`,
        platform,
        category:     spec.category,
        intent:       spec.intent,
        branded:      spec.branded,
        prompt:       spec.prompt,
        mentioned,
        excerpt,
        responseText: text.substring(0, RESPONSE_STORE_MAX),
        sentiment:    null,
        recognized:   null,
      };
    } catch (err) {
      console.error(`[LLMProbe] ${platform} prompt failed (${spec.key}):`, (err as any)?.message);
      return {
        id: `${platform}:${spec.key}`,
        platform,
        category:     spec.category,
        intent:       spec.intent,
        branded:      spec.branded,
        prompt:       spec.prompt,
        mentioned:    false,
        excerpt:      null,
        responseText: '',
        sentiment:    null,
        recognized:   null,
      };
    }
  });
}

// ─── Sentiment + Recognition Classification (one sonnet pass) ────────────────
//
// Inputs: every result that mentioned the brand (sentiment) plus every branded
// result (recognition). Quotes returned by the classifier are verified as
// verbatim substrings of the raw response before being used; failures fall
// back to the substring-detected mention sentence.

interface ClassifierItem { id: string; sentiment?: string; recognized?: boolean; quote?: string }

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function quoteIsVerbatim(quote: string, responseText: string): boolean {
  if (!quote || quote.length < 10) return false;
  return normalizeWs(responseText).includes(normalizeWs(quote));
}

async function classifyResults(
  results:    ProbeResultV2[],
  clientName: string,
): Promise<{ assessed: boolean }> {
  const candidates = results.filter(r => r.mentioned || r.branded);
  if (candidates.length === 0) return { assessed: true };

  const payload = candidates.map(r => ({
    id:       r.id,
    branded:  r.branded,
    mentioned: r.mentioned,
    prompt:   r.prompt,
    response: r.responseText,
  }));

  const prompt = `You are auditing how AI assistants talk about the brand "${clientName}".

Below is a JSON array of probe results. Each has: id, branded (the prompt named the brand), mentioned (the brand appeared in the response), prompt, response.

For EACH item return an object with:
- "id": same id
- "sentiment": ONLY if mentioned is true — classify how the response portrays ${clientName}: "positive" (recommended, praised, listed as a top option), "neutral" (factual mention, mixed without leaning), or "negative" (criticized, warned about, complaints emphasized). Judge ONLY the portrayal of ${clientName}, not overall response tone.
- "recognized": ONLY if branded is true — true if the response demonstrates real knowledge of ${clientName} (describes what it actually is/does), false if it says it is unfamiliar, unsure, or clearly describes a different entity.
- "quote": ONLY if mentioned is true — copy the single most representative sentence about ${clientName} EXACTLY as it appears in the response, character for character. Do not paraphrase, do not fix typos, do not add words.

Return ONLY a JSON array. No prose, no markdown fences.

${JSON.stringify(payload)}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }],
    }, { timeout: 100_000 });

    const text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text as string).join('');
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    let parsed: ClassifierItem[];
    try {
      parsed = JSON.parse(cleaned) as ClassifierItem[];
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('classifier returned non-JSON');
      parsed = JSON.parse(match[0]) as ClassifierItem[];
    }

    const byId = new Map(results.map(r => [r.id, r]));
    for (const item of parsed) {
      const r = byId.get(item?.id ?? '');
      if (!r) continue;
      if (r.mentioned && (item.sentiment === 'positive' || item.sentiment === 'neutral' || item.sentiment === 'negative')) {
        r.sentiment = item.sentiment;
      }
      if (r.branded && typeof item.recognized === 'boolean') {
        r.recognized = item.recognized;
      }
      // Verbatim guard: only accept the classifier's quote if it is a real
      // substring of the raw response; otherwise keep the detected sentence.
      if (r.mentioned && item.quote && quoteIsVerbatim(item.quote, r.responseText)) {
        r.excerpt = item.quote.trim().substring(0, 300);
      }
    }
    return { assessed: true };
  } catch (err) {
    console.error('[LLMProbe] Sentiment/recognition classification failed (non-fatal):', (err as any)?.message);
    return { assessed: false };
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function buildCategoryVisibility(
  results:    ProbeResultV2[],
  categories: ProbeCategoryInput[],
): CategoryVisibilityV2[] {
  return categories.map(cat => {
    // Unbranded prompts only — the honest "are they recommended" metric.
    const rows = results.filter(r => r.category === cat.name && !r.branded);
    const claude  = rows.filter(r => r.platform === 'claude');
    const chatgpt = rows.filter(r => r.platform === 'chatgpt');
    const mentions = rows.filter(r => r.mentioned).length;
    return {
      category:        cat.name,
      monthlyDemand:   cat.monthlyDemand,
      claudeMentions:  claude.filter(r => r.mentioned).length,
      claudeTotal:     claude.length,
      chatgptMentions: chatgpt.filter(r => r.mentioned).length,
      chatgptTotal:    chatgpt.length,
      mentionRate:     rows.length > 0 ? mentions / rows.length : 0,
    };
  });
}

function buildSentimentExamples(results: ProbeResultV2[]): SentimentExampleV2[] {
  const examples: SentimentExampleV2[] = [];
  const pick = (tone: 'positive' | 'negative', max: number) => {
    results
      .filter(r => r.sentiment === tone && r.excerpt)
      .slice(0, max)
      .forEach(r => examples.push({
        tone,
        platform: r.platform,
        prompt:   r.prompt,
        category: r.category,
        quote:    r.excerpt!,
      }));
  };
  pick('positive', 2);
  pick('negative', 2);
  return examples;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function getLLMProbeSnapshotV2(
  clientName: string,
  domain:     string,
  industry:   string,
  categories: ProbeCategoryInput[],
): Promise<LLMProbeSnapshotV2> {
  const specs = buildPromptSpecs(clientName, industry, categories);
  console.log(
    `[LLMProbe v2] Probing "${clientName}" (${domain}) — ${categories.length} categories, ` +
    `${specs.length} prompts/platform. OPENAI_API_KEY set: ${!!process.env.OPENAI_API_KEY}`
  );

  const [claudeResults, chatgptResults] = await Promise.all([
    probePlatform('claude', specs, clientName, domain).catch(err => {
      console.error('[LLMProbe v2] Claude platform failed:', err);
      return [] as ProbeResultV2[];
    }),
    probePlatform('chatgpt', specs, clientName, domain).catch(err => {
      console.error('[LLMProbe v2] ChatGPT platform failed:', err);
      return [] as ProbeResultV2[];
    }),
  ]);

  const results = [...claudeResults, ...chatgptResults];

  // Sentiment + recognition (mutates results in place)
  const { assessed } = await classifyResults(results, clientName);

  // Unbranded visibility — prompts that never named the brand
  const unbrandedRows = results.filter(r => !r.branded);
  const unbrandedMentions = unbrandedRows.filter(r => r.mentioned).length;
  const unbrandedScore = unbrandedRows.length > 0
    ? Math.round((unbrandedMentions / unbrandedRows.length) * 100)
    : 0;

  // Brand recognition — branded prompts where the LLM showed real knowledge.
  // If the classification pass failed, fall back to mention detection and flag
  // assessed=false so the UI can caveat it.
  const brandedRows = results.filter(r => r.branded);
  const recognizedCount = assessed
    ? brandedRows.filter(r => r.recognized === true).length
    : brandedRows.filter(r => r.mentioned).length;
  const brandedScore = brandedRows.length > 0
    ? Math.round((recognizedCount / brandedRows.length) * 100)
    : 0;

  // Sentiment counts over actual mentions
  const mentionRows = results.filter(r => r.mentioned);
  const sentiment = {
    positive: mentionRows.filter(r => r.sentiment === 'positive').length,
    neutral:  mentionRows.filter(r => r.sentiment === 'neutral').length,
    negative: mentionRows.filter(r => r.sentiment === 'negative').length,
    totalMentions: mentionRows.length,
    assessed,
    examples: buildSentimentExamples(results),
  };

  const platformsUsed: string[] = [];
  if (claudeResults.length  > 0) platformsUsed.push('Claude (Anthropic)');
  if (chatgptResults.length > 0) platformsUsed.push('ChatGPT (OpenAI)');

  console.log(
    `[LLMProbe v2] Done — unbranded ${unbrandedMentions}/${unbrandedRows.length} (${unbrandedScore}), ` +
    `recognition ${recognizedCount}/${brandedRows.length} (${brandedScore}), ` +
    `sentiment +${sentiment.positive}/~${sentiment.neutral}/-${sentiment.negative} (assessed=${assessed})`
  );

  return {
    source:        'llm_probe_v2',
    probedAt:      new Date().toISOString(),
    platformsUsed,
    promptsPerPlatform: specs.length,
    results,
    categories:    buildCategoryVisibility(results, categories),
    unbranded:     { mentions: unbrandedMentions, total: unbrandedRows.length, score: unbrandedScore },
    branded:       { recognized: recognizedCount, total: brandedRows.length, score: brandedScore, assessed },
    sentiment,
    overallScore:  unbrandedScore,
  };
}
