/**
 * LLM Probe — live brand visibility check
 *
 * Sends 3 brand-relevant prompts to Claude (Anthropic) and ChatGPT (OpenAI)
 * at analysis time, checks whether the brand is mentioned in responses,
 * and returns structured results including verbatim excerpts.
 *
 * This is real, live data — NOT indexed or modeled. Results reflect what
 * each LLM actually says at the moment of analysis.
 *
 * Data stored in: analyses.profoundSnapshot (JSONB) — source: 'llm_probe'
 */

import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProbePromptResult {
  prompt:    string;
  mentioned: boolean;
  excerpt:   string | null;   // verbatim sentence(s) containing brand mention
}

export interface PlatformProbeData {
  platform:     'claude' | 'chatgpt';
  label:        string;             // display name
  results:      ProbePromptResult[];
  mentionCount: number;             // # of prompts that mentioned the brand
  mentionRate:  number;             // 0–1
}

export interface LLMProbeSnapshot {
  source:          'llm_probe';
  probedAt:        string;          // ISO timestamp
  prompts:         string[];        // the 3 prompts used
  platforms:       PlatformProbeData[];
  overallScore:    number;          // 0–100 (mentions / total prompts × 100)
  overallMentions: number;          // e.g. 3
  overallTotal:    number;          // e.g. 6 (2 platforms × 3 prompts)
}

// ─── Prompt Generation ────────────────────────────────────────────────────────

function generateProbePrompts(clientName: string, industry: string): string[] {
  return [
    `What is ${clientName}? Give me a brief overview.`,
    `I'm looking for ${industry} services. Which companies should I consider?`,
    `Who are the top providers in the ${industry} industry?`,
  ];
}

// ─── Mention Detection ────────────────────────────────────────────────────────

function detectMention(
  response: string,
  clientName: string,
  domain: string
): { mentioned: boolean; excerpt: string | null } {
  const nameLower   = clientName.toLowerCase();
  // extract root domain token e.g. "sonobello" from "sonobello.com"
  const domainToken = domain.toLowerCase().replace(/^www\./, '').split('.')[0];
  const lower       = response.toLowerCase();

  const mentioned = lower.includes(nameLower) || lower.includes(domainToken);
  if (!mentioned) return { mentioned: false, excerpt: null };

  // Pull the sentence(s) that contain the mention
  const sentences = response.split(/(?<=[.!?])\s+/);
  const hit = sentences.find(s => {
    const sl = s.toLowerCase();
    return sl.includes(nameLower) || sl.includes(domainToken);
  });

  const raw = hit ?? response;
  return {
    mentioned: true,
    excerpt: raw.trim().substring(0, 250),
  };
}

// ─── Claude Probe ─────────────────────────────────────────────────────────────

async function probeWithClaude(
  prompts:    string[],
  clientName: string,
  domain:     string
): Promise<PlatformProbeData> {
  const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: ProbePromptResult[] = [];

  for (const prompt of prompts) {
    try {
      const msg = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages:   [{ role: 'user', content: prompt }],
      });

      const text = msg.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text as string)
        .join('');

      const { mentioned, excerpt } = detectMention(text, clientName, domain);
      results.push({ prompt, mentioned, excerpt });
    } catch (err) {
      console.error('[LLMProbe] Claude prompt failed:', err);
      results.push({ prompt, mentioned: false, excerpt: null });
    }
  }

  const mentionCount = results.filter(r => r.mentioned).length;
  return {
    platform:     'claude',
    label:        'Claude (Anthropic)',
    results,
    mentionCount,
    mentionRate:  mentionCount / prompts.length,
  };
}

// ─── ChatGPT Probe ────────────────────────────────────────────────────────────

async function probeWithChatGPT(
  prompts:    string[],
  clientName: string,
  domain:     string
): Promise<PlatformProbeData> {
  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY) throw new Error('OPENAI_API_KEY not set');

  const results: ProbePromptResult[] = [];

  for (const prompt of prompts) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        signal:  AbortSignal.timeout(20_000),
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:      'gpt-4o-mini',
          max_tokens: 400,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI ${res.status}: ${errText.substring(0, 200)}`);
      }

      const data = await res.json() as { choices: { message: { content: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';

      const { mentioned, excerpt } = detectMention(text, clientName, domain);
      results.push({ prompt, mentioned, excerpt });
    } catch (err) {
      console.error('[LLMProbe] ChatGPT prompt failed:', err);
      results.push({ prompt, mentioned: false, excerpt: null });
    }
  }

  const mentionCount = results.filter(r => r.mentioned).length;
  return {
    platform:    'chatgpt',
    label:       'ChatGPT (OpenAI)',
    results,
    mentionCount,
    mentionRate: mentionCount / prompts.length,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function getLLMProbeSnapshot(
  clientName: string,
  domain:     string,
  industry:   string,
): Promise<LLMProbeSnapshot> {
  const prompts = generateProbePrompts(clientName, industry);

  console.log(`[LLMProbe] Probing Claude + ChatGPT for "${clientName}" (${domain})`);
  console.log(`[LLMProbe] OPENAI_API_KEY set: ${!!process.env.OPENAI_API_KEY}`);

  const [claudeData, chatgptData] = await Promise.all([
    probeWithClaude(prompts, clientName, domain).catch(err => {
      console.error('[LLMProbe] Claude platform failed:', err);
      return null;
    }),
    probeWithChatGPT(prompts, clientName, domain).catch(err => {
      console.error('[LLMProbe] ChatGPT platform failed:', err);
      return null;
    }),
  ]);

  const platforms = [claudeData, chatgptData].filter((p): p is PlatformProbeData => p !== null);

  const overallMentions = platforms.reduce((s, p) => s + p.mentionCount, 0);
  const overallTotal    = platforms.reduce((s, p) => s + p.results.length, 0);
  const overallScore    = overallTotal > 0
    ? Math.round((overallMentions / overallTotal) * 100)
    : 0;

  console.log(`[LLMProbe] Done — ${overallMentions}/${overallTotal} prompts mentioned brand. Score: ${overallScore}`);

  return {
    source:          'llm_probe',
    probedAt:        new Date().toISOString(),
    prompts,
    platforms,
    overallScore,
    overallMentions,
    overallTotal,
  };
}
