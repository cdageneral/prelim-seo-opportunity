/**
 * OrbitIQ Claude Synthesis Pipeline
 *
 * Four-pass pipeline:
 *  Pass 1 — Personas       (haiku  — fast classification)
 *  Pass 2 — Opportunities  (haiku  — fast structured scoring)
 *  Pass 3 — Narrative      (sonnet — CMO-level storytelling)
 *  Pass 4 — PPT Prompt     (haiku  — fast structured generation)
 *
 * Passes 1 & 2 run in parallel.
 * Passes 3 & 4 run in parallel — PPT prompt uses null for narrative
 * (prompts.ts handles null gracefully with optional chaining).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SemrushSnapshot }  from '../apis/semrush';
import type { SerpApiSnapshot }  from '../apis/serp';

import {
  personaPrompt,
  opportunityPrompt,
  narrativePrompt,
  pptPromptGenerator,
  categoryBreakdownPrompt,
  type MergedKeyword,
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
    model:      MODELS.default,  // sonnet — deep segment profiles need richer reasoning than haiku
    max_tokens: 3500,
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 100_000 });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return extractJSON<any[]>(text);
}

// ─── Pass 2: Opportunity Scoring ──────────────────────────────────────────────

export async function generateOpportunities(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: any
): Promise<any[]> {
  const prompt = opportunityPrompt(domain, industry, semrush, serp, profound);

  const response = await getClient().messages.create({
    model:      MODELS.fast,   // haiku — fast structured JSON scoring; sonnet was causing timeouts
    max_tokens: 2000,
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 100_000 });

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
  profound: any,
  personas: any[],
  opportunities: any[],
  categoryBreakdown: CategoryBreakdownResult
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
    personas, opportunities,
    categoryBreakdown
  );

  const response = await getClient().messages.create({
    model:      MODELS.default,  // sonnet — fast enough, opus was causing Vercel timeouts
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 100_000 });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return extractJSON(text);
}

// ─── Pass 2.5: Category Breakdown ────────────────────────────────────────────
//
// Classifies the client's top organic keywords into service/product categories
// using Claude haiku, then computes page1/top3/monthly demand per category in
// TypeScript (no hallucinated numbers — all arithmetic is done here).

export interface CategoryBreakdownResult {
  categories: Array<{
    name:          string;
    type:          'procedure' | 'brand' | 'location';
    monthlyDemand: number;
    page1Demand:   number;
    top3Demand:    number;
  }>;
  totalMonthlyDemand:      number;
  totalPage1Demand:        number;
  totalTop3Demand:         number;
  brandedPage1Demand:      number;   // page1 from brand + location categories
  nonBrandedPage1Demand:   number;   // page1 from procedure categories only
  totalKeywordsAnalyzed:   number;
  page1CaptureRate:        number;
  // v7.34: keyword→category map for ThemeClustersPanel (lowercase keyword → category name)
  keywordCategories:       Record<string, string>;
}

export async function generateCategoryBreakdown(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot
): Promise<CategoryBreakdownResult> {
  // ── Build merged keyword pool ──────────────────────────────────────────────
  // Step 1: ranked keywords the client appears for (have real position data)
  // MVP cap: 20 ranked + 20 gap = 40 total keywords
  // Remove slice limits when moving to full production footprint
  const MVP_LIMIT = 20;

  const rankedMap = new Map<string, number>(); // lowercase keyword → position
  for (const kw of semrush.topKeywords.slice(0, MVP_LIMIT)) {
    rankedMap.set(kw.keyword.toLowerCase(), kw.position);
  }

  const merged: MergedKeyword[] = [];

  // Add ranked keywords first
  for (const kw of semrush.topKeywords.slice(0, MVP_LIMIT)) {
    merged.push({
      keyword:        kw.keyword,
      searchVolume:   kw.searchVolume ?? 0,
      clientPosition: kw.position ?? null,
    });
  }

  // Step 2: gap keywords (competitor ranks, client doesn't) — deduplicated
  for (const kw of semrush.gapKeywords.slice(0, MVP_LIMIT)) {
    if (!rankedMap.has(kw.keyword.toLowerCase())) {
      merged.push({
        keyword:        kw.keyword,
        searchVolume:   kw.searchVolume ?? 0,
        clientPosition: null,  // client does not rank for this
      });
    }
  }

  if (merged.length === 0) {
    return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: 0, page1CaptureRate: 0, keywordCategories: {} };
  }

  const prompt = categoryBreakdownPrompt(domain, industry, merged);

  const response = await getClient().messages.create({
    model:      MODELS.fast,
    max_tokens: 1500,
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 100_000 });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Claude returns categories with name, type, and keywordIndices
  const parsed = extractJSON<{ categories: Array<{ name: string; type?: string; keywordIndices: number[] }> }>(text);

  // ── Compute demand sums in TypeScript — no Claude arithmetic ──────────────
  const result: CategoryBreakdownResult = {
    categories: [],
    totalMonthlyDemand:    0,
    totalPage1Demand:      0,
    totalTop3Demand:       0,
    brandedPage1Demand:    0,
    nonBrandedPage1Demand: 0,
    totalKeywordsAnalyzed: merged.length,
    page1CaptureRate:      0,
    keywordCategories:     {},  // v7.34: populated below
  };

  for (const cat of parsed.categories) {
    const catType = (cat.type === 'brand' || cat.type === 'location') ? cat.type : 'procedure';
    let monthlyDemand = 0;
    let page1Demand   = 0;
    let top3Demand    = 0;

    for (const idx of cat.keywordIndices) {
      const kw = merged[idx];
      if (!kw) continue;
      const vol = kw.searchVolume ?? 0;
      monthlyDemand += vol;
      if (kw.clientPosition !== null && kw.clientPosition <= 10) page1Demand += vol;
      if (kw.clientPosition !== null && kw.clientPosition <= 3)  top3Demand  += vol;
      // v7.34: store keyword→category mapping for ThemeClustersPanel
      result.keywordCategories[kw.keyword.toLowerCase()] = cat.name;
    }

    result.categories.push({ name: cat.name, type: catType, monthlyDemand, page1Demand, top3Demand });
    result.totalMonthlyDemand += monthlyDemand;
    result.totalPage1Demand   += page1Demand;
    result.totalTop3Demand    += top3Demand;

    if (catType === 'brand' || catType === 'location') {
      result.brandedPage1Demand    += page1Demand;
    } else {
      result.nonBrandedPage1Demand += page1Demand;
    }
  }

  result.page1CaptureRate = result.totalMonthlyDemand > 0
    ? result.totalPage1Demand / result.totalMonthlyDemand
    : 0;

  return result;
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
  profound: any
): Promise<string> {
  const systemPrompt = pptPromptGenerator(
    clientName, domain, industry,
    narrative, opportunities,
    semrush, serp, profound
  );

  const response = await getClient().messages.create({
    model:      MODELS.fast,   // haiku — fast enough for structured prompt generation
    max_tokens: 2000,
    messages:   [{
      role: 'user',
      content: `${systemPrompt}\n\nGenerate the complete PPTX skill prompt now. Make it detailed and ready to paste directly into the Claude PPTX skill. Return only the prompt text, no preamble.`,
    }],
  }, { timeout: 100_000 });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// ─── Master Synthesis Entry Point ────────────────────────────────────────────

export interface SynthesisResult {
  personas:          any[];
  opportunities:     any[];
  narrative: {
    marketPositionNarrative: string;
    visibilityGap:           string;
    aiSearchMoment:          string;
    competitiveReality:      string;
    strategicCall:           string;
  };
  pptPrompt:         string;
  categoryBreakdown: CategoryBreakdownResult;
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
  profound: any
): Promise<SynthesisResult> {
  console.log(`[OrbitIQ] Starting synthesis for ${domain}`);

  // Passes 1, 2, 2.5 run in parallel
  const [personas, opportunities, categoryBreakdown] = await Promise.all([
    generatePersonas(domain, industry, semrush, serp),
    generateOpportunities(domain, industry, semrush, serp, profound),
    generateCategoryBreakdown(domain, industry, semrush).catch(err => {
      console.error('[OrbitIQ] Category breakdown failed (non-fatal):', err);
      return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: 0, page1CaptureRate: 0, keywordCategories: {} } as CategoryBreakdownResult;
    }),
  ]);
  console.log(`[OrbitIQ] Personas: ${personas.length}, Opportunities: ${opportunities.length}, Categories: ${categoryBreakdown.categories.length}`);

  // Passes 3 & 4 run in parallel — PPT prompt uses placeholder narrative snippets
  // until narrative is available; the deck is built from opportunities + raw data.
  const [narrative, pptPrompt] = await Promise.all([
    generateNarrative(
      domain, clientName, industry,
      semrush, serp, profound,
      personas, opportunities,
      categoryBreakdown
    ),
    generatePPTPrompt(
      clientName, domain, industry,
      null,          // narrative not yet available — prompts.ts handles null gracefully
      opportunities,
      semrush, serp, profound
    ),
  ]);
  console.log(`[OrbitIQ] Narrative + PPT prompt generated in parallel`);

  // Compute hero metrics — prefer new demand-based metrics where available
  const totalCategoryVolume = categoryBreakdown.totalMonthlyDemand > 0
    ? categoryBreakdown.totalMonthlyDemand
    : semrush.competitors.reduce((sum, c) => sum + c.organicTraffic, semrush.overview.organicTraffic);

  const clientOwnedVolume = categoryBreakdown.totalPage1Demand > 0
    ? categoryBreakdown.totalPage1Demand
    : semrush.overview.organicTraffic;

  const marketCaptureRate = categoryBreakdown.page1CaptureRate > 0
    ? categoryBreakdown.page1CaptureRate
    : (totalCategoryVolume > 0 ? semrush.overview.organicTraffic / totalCategoryVolume : 0);

  return {
    personas,
    opportunities,
    narrative,
    pptPrompt,
    categoryBreakdown,
    heroMetrics: {
      marketCaptureRate,
      totalCategoryVolume,
      clientOwnedVolume,
      keywordFootprint:    semrush.overview.organicKeywords,
      aioAvailable:        serp.aioSummary.withAIO,
      aioAcquired:         serp.aioSummary.clientCited,
      topCompetitor:       semrush.competitors[0]?.domain ?? '',
    },
  };
}
