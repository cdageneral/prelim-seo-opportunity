/**
 * OrbitIQ Claude Synthesis Pipeline
 *
 * Four-pass pipeline:
 *  Pass 1 — Personas       (haiku  — fast classification)
 *  Pass 2 — Opportunities  (sonnet — analytical scoring)
 *  Pass 3 — Narrative      (sonnet — CMO-level storytelling)
 *  Pass 4 — PPT Prompt     (sonnet — structured prompt generation)
 *
 * Passes 1 & 2 run in parallel.
 * Passes 3 & 4 run in parallel — PPT prompt uses null for narrative
 * (prompts.ts handles null gracefully with optional chaining).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SemrushSnapshot }  from '../apis/semrush';
import type { SerpApiSnapshot }  from '../apis/serp';
import type { ProfoundSnapshot } from '../apis/profound';
import {
  personaPrompt,
  opportunityPrompt,
  narrativePrompt,
  pptPromptGenerator,
} from './prompts';

// Lazy client — reads key at call time, not at module load.
// This matches the pattern used by semrush.ts, serp.ts, and profound.ts,
// and prevents the module from crashing during Next.js build or cold-start
// if ANTHROPIC_API_KEY is not yet in the environment.
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Go to Vercel → your project → Settings → Environment Variables and add it.'
    );
  }
  return new Anthropic({ apiKey });
}

// ─── Model Selection ──────────────────────────────────────────────────────────

const MODELS = {
  fast:    'claude-haiku-4-5-20251001',   // Classification, persona draft
  default: 'claude-sonnet-4-6',            // Opportunity analysis, structured output
  deep:    'claude-opus-4-6',              // Reserved — not used (Vercel timeout risk)
} as const;

// ─── JSON Extraction Helper ───────────────────────────────────────────────────

function extractJSON<T>(text: string): T {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    // Attempt to extract JSON substring
    const match = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ─── Pass 1: Persona Generation ───────────────────────────────────────────────

export async function generatePersonas(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot
): Promise<any[]> {
  const prompt = personaPrompt(domain, industry, semrush, serp);

  const response = await getClient().messages.create({
    model:      MODELS.fast,
    max_tokens: 1500,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return extractJSON<any[]>(text);
}

// ─── Pass 2: Opportunity Scoring ──────────────────────────────────────────────

export async function generateOpportunities(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: ProfoundSnapshot
): Promise<any[]> {
  const prompt = opportunityPrompt(domain, industry, semrush, serp, profound);

  const response = await getClient().messages.create({
    model:      MODELS.default,
    max_tokens: 2000,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return extractJSON<any[]>(text);
}

// ─── Pass 3: Narrative Synthesis ─────────────────────────────────────────────

export async function generateNarrative(
  domain: string,
  clientName: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: ProfoundSnapshot,
  personas: any[],
  opportunities: any[]
): Promise<{
  marketPositionNarrative: string;
  visibilityGap: string;
  aiSearchMoment: string;
  competitiveReality: string;
  strategicCall: string;
}> {
  const prompt = narrativePrompt(
    domain, clientName, industry,
    semrush, serp, profound,
    personas, opportunities
  );

  const response = await getClient().messages.create({
    model:      MODELS.default,  // sonnet — fast enough, opus was causing Vercel timeouts
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return extractJSON(text);
}

// ─── Pass 4: PPT Prompt Generation ───────────────────────────────────────────

export async function generatePPTPrompt(
  clientName: string,
  domain: string,
  industry: string,
  narrative: any | null,
  opportunities: any[],
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: ProfoundSnapshot
): Promise<string> {
  const systemPrompt = pptPromptGenerator(
    clientName, domain, industry,
    narrative, opportunities,
    semrush, serp, profound
  );

  const response = await getClient().messages.create({
    model:      MODELS.default,
    max_tokens: 2000,
    messages:   [{
      role: 'user',
      content: `${systemPrompt}\n\nGenerate the complete PPTX skill prompt now. Make it detailed and ready to paste directly into the Claude PPTX skill. Return only the prompt text, no preamble.`,
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// ─── Master Synthesis Entry Point ────────────────────────────────────────────

export interface SynthesisResult {
  personas:     any[];
  opportunities: any[];
  narrative: {
    marketPositionNarrative: string;
    visibilityGap:           string;
    aiSearchMoment:          string;
    competitiveReality:      string;
    strategicCall:           string;
  };
  pptPrompt:    string;
  heroMetrics: {
    marketCaptureRate:   number;
    totalCategoryVolume: number;
    clientOwnedVolume:   number;
    keywordFootprint:    number;
    aioAvailable:        number;
    aioAcquired:         number;
    topCompetitor:       string;
  };
}

export async function runFullSynthesis(
  domain: string,
  clientName: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: ProfoundSnapshot
): Promise<SynthesisResult> {
  console.log(`[OrbitIQ] Starting synthesis for ${domain}`);

  // Passes 1 & 2 run in parallel
  const [personas, opportunities] = await Promise.all([
    generatePersonas(domain, industry, semrush, serp),
    generateOpportunities(domain, industry, semrush, serp, profound),
  ]);
  console.log(`[OrbitIQ] Personas: ${personas.length}, Opportunities: ${opportunities.length}`);

  // Passes 3 & 4 run in parallel — PPT prompt uses placeholder narrative snippets
  // until narrative is available; the deck is built from opportunities + raw data.
  const [narrative, pptPrompt] = await Promise.all([
    generateNarrative(
      domain, clientName, industry,
      semrush, serp, profound,
      personas, opportunities
    ),
    generatePPTPrompt(
      clientName, domain, industry,
      null,          // narrative not yet available — prompts.ts handles null gracefully
      opportunities,
      semrush, serp, profound
    ),
  ]);
  console.log(`[OrbitIQ] Narrative + PPT prompt generated in parallel`);

  // Compute hero metrics for fast UI rendering
  const totalCategoryVolume = semrush.competitors.reduce(
    (sum, c) => sum + c.organicTraffic, semrush.overview.organicTraffic
  );
  const marketCaptureRate = totalCategoryVolume > 0
    ? semrush.overview.organicTraffic / totalCategoryVolume
    : 0;

  return {
    personas,
    opportunities,
    narrative,
    pptPrompt,
    heroMetrics: {
      marketCaptureRate,
      totalCategoryVolume,
      clientOwnedVolume:   semrush.overview.organicTraffic,
      keywordFootprint:    semrush.overview.organicKeywords,
      aioAvailable:        serp.aioSummary.withAIO,
      aioAcquired:         serp.aioSummary.clientCited,
      topCompetitor:       semrush.competitors[0]?.domain ?? '',
    },
  };
}
