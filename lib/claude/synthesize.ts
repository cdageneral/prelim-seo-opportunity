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
  categoryAssignmentPrompt,
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
    max_tokens: 5000,            // rich 3-segment JSON; needs room (3 segs × ~1200 tokens each)
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 100_000 });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    return extractJSON<any[]>(text);
  } catch (err) {
    // Non-fatal: if audience segment generation fails, return empty array
    // rather than crashing the whole synthesis pipeline.
    console.error('[OrbitIQ] Audience segment JSON parse failed (non-fatal):', (err as any)?.message);
    return [];
  }
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
  const rankedMap = new Map<string, number>(); // lowercase keyword → position
  for (const kw of semrush.topKeywords) {
    rankedMap.set(kw.keyword.toLowerCase(), kw.position);
  }

  const merged: MergedKeyword[] = [];

  // Add ranked keywords first
  for (const kw of semrush.topKeywords) {
    merged.push({
      keyword:        kw.keyword,
      searchVolume:   kw.searchVolume ?? 0,
      clientPosition: kw.position ?? null,
    });
  }

  // Step 2: gap keywords (competitor ranks, client doesn't) — deduplicated
  for (const kw of semrush.gapKeywords) {
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

  // ── Pass A: define categories from the top 200 keywords (by volume) ────────
  // One Claude call can't reliably handle the full footprint, so the top 200
  // highest-volume keywords (already sorted desc by Semrush/upload builder)
  // are used to DEFINE the category list and seed assignments.
  const BREAKDOWN_LIMIT = 200;
  const capped = merged.length > BREAKDOWN_LIMIT
    ? merged.slice(0, BREAKDOWN_LIMIT)
    : merged;

  const prompt = categoryBreakdownPrompt(domain, industry, capped);

  const response = await getClient().messages.create({
    model:      MODELS.fast,
    max_tokens: 3000,
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 100_000 });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Claude returns categories with name, type, and keywordIndices
  const parsed = extractJSON<{ categories: Array<{ name: string; type?: string; keywordIndices: number[] }> }>(text);

  // Global assignment map: merged-array index → category name.
  // Seeded from Pass A, extended by Pass B batches below.
  const assignmentByIndex = new Map<number, string>();
  const catTypeByName     = new Map<string, 'procedure' | 'brand' | 'location'>();

  for (const cat of parsed.categories) {
    const catType = (cat.type === 'brand' || cat.type === 'location') ? cat.type : 'procedure';
    catTypeByName.set(cat.name, catType);
    for (const idx of cat.keywordIndices) {
      if (merged[idx]) assignmentByIndex.set(idx, cat.name);
    }
  }

  // ── Pass B (v7.74): assign ALL remaining keywords to the fixed category list ──
  // Previously keywords beyond the top 200 were never categorized, so the
  // Keyword Landscape category counts/demand only reflected an ~200-keyword
  // sample. Now the remainder is batched through Claude haiku in parallel
  // using the Pass A category list. Failed/unmatched keywords fall into "Other".
  const OTHER_NAME   = 'Other';
  const ASSIGN_BATCH = 250;
  const remaining    = merged.length > BREAKDOWN_LIMIT ? merged.slice(BREAKDOWN_LIMIT) : [];

  if (remaining.length > 0 && parsed.categories.length > 0) {
    const fixedCats = parsed.categories.map(c => ({
      name: c.name,
      type: catTypeByName.get(c.name) ?? 'procedure',
    }));
    const validNames = new Set(fixedCats.map(c => c.name));

    const batches: Array<{ start: number; kws: MergedKeyword[] }> = [];
    for (let i = 0; i < remaining.length; i += ASSIGN_BATCH) {
      batches.push({ start: BREAKDOWN_LIMIT + i, kws: remaining.slice(i, i + ASSIGN_BATCH) });
    }
    console.log(`[OrbitIQ] Category assignment: ${remaining.length} remaining keywords in ${batches.length} batch(es)`);

    // Run batches with bounded concurrency (5 at a time) to stay within
    // Anthropic rate limits on very large footprints.
    const CONCURRENCY = 5;
    const runBatch = async (batch: { start: number; kws: MergedKeyword[] }) => {
      try {
        const bPrompt   = categoryAssignmentPrompt(domain, industry, fixedCats, batch.kws);
        const bResponse = await getClient().messages.create({
          model:      MODELS.fast,
          max_tokens: 4000,
          messages:   [{ role: 'user', content: bPrompt }],
        }, { timeout: 100_000 });
        const bText   = bResponse.content[0].type === 'text' ? bResponse.content[0].text : '';
        const bParsed = extractJSON<{ assignments: Record<string, number[]> }>(bText);

        for (const [catName, indices] of Object.entries(bParsed.assignments ?? {})) {
          const resolved = validNames.has(catName) ? catName : OTHER_NAME;
          for (const localIdx of indices ?? []) {
            const globalIdx = batch.start + localIdx;
            if (merged[globalIdx] && !assignmentByIndex.has(globalIdx)) {
              assignmentByIndex.set(globalIdx, resolved);
            }
          }
        }
      } catch (err) {
        console.error('[OrbitIQ] Category assignment batch failed (keywords → Other):', (err as any)?.message);
      }
      // Any keyword in this batch still unassigned (failed batch or omitted
      // by Claude) falls into "Other" so totals always cover the full footprint.
      for (let i = 0; i < batch.kws.length; i++) {
        const globalIdx = batch.start + i;
        if (!assignmentByIndex.has(globalIdx)) assignmentByIndex.set(globalIdx, OTHER_NAME);
      }
    };

    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      await Promise.all(batches.slice(i, i + CONCURRENCY).map(runBatch));
    }
  }

  // Pass A leftovers (omitted indices within top 200) also fall into "Other"
  // so every merged keyword is categorized. Skipped if Pass A produced no
  // categories at all (degenerate case — keep result empty as before).
  if (parsed.categories.length > 0) {
    for (let i = 0; i < Math.min(merged.length, BREAKDOWN_LIMIT); i++) {
      if (!assignmentByIndex.has(i)) assignmentByIndex.set(i, OTHER_NAME);
    }
  }

  // ── Compute demand sums in TypeScript over the FULL footprint ──────────────
  // No Claude arithmetic — all sums below come from actual Semrush/upload volumes.
  const result: CategoryBreakdownResult = {
    categories: [],
    totalMonthlyDemand:    0,
    totalPage1Demand:      0,
    totalTop3Demand:       0,
    brandedPage1Demand:    0,
    nonBrandedPage1Demand: 0,
    totalKeywordsAnalyzed: merged.length,
    page1CaptureRate:      0,
    keywordCategories:     {},
  };

  // Aggregate per category
  const sums = new Map<string, { monthlyDemand: number; page1Demand: number; top3Demand: number }>();
  assignmentByIndex.forEach((catName, idx) => {
    const kw = merged[idx];
    if (!kw) return;
    const vol = kw.searchVolume ?? 0;
    if (!sums.has(catName)) sums.set(catName, { monthlyDemand: 0, page1Demand: 0, top3Demand: 0 });
    const s = sums.get(catName)!;
    s.monthlyDemand += vol;
    if (kw.clientPosition !== null && kw.clientPosition <= 10) s.page1Demand += vol;
    if (kw.clientPosition !== null && kw.clientPosition <= 3)  s.top3Demand  += vol;
    result.keywordCategories[kw.keyword.toLowerCase()] = catName;
  });

  // Emit categories in Pass A order, then "Other" last if present
  const orderedNames = [
    ...parsed.categories.map(c => c.name).filter(n => sums.has(n)),
    ...(sums.has(OTHER_NAME) && !catTypeByName.has(OTHER_NAME) ? [OTHER_NAME] : []),
  ];

  for (const name of orderedNames) {
    const s       = sums.get(name)!;
    const catType = catTypeByName.get(name) ?? 'procedure';

    result.categories.push({ name, type: catType, monthlyDemand: s.monthlyDemand, page1Demand: s.page1Demand, top3Demand: s.top3Demand });
    result.totalMonthlyDemand += s.monthlyDemand;
    result.totalPage1Demand   += s.page1Demand;
    result.totalTop3Demand    += s.top3Demand;

    if (catType === 'brand' || catType === 'location') {
      result.brandedPage1Demand    += s.page1Demand;
    } else {
      result.nonBrandedPage1Demand += s.page1Demand;
    }
  }

  result.page1CaptureRate = result.totalMonthlyDemand > 0
    ? result.totalPage1Demand / result.totalMonthlyDemand
    : 0;

  console.log(`[OrbitIQ] Category breakdown: ${result.categories.length} categories covering ${Object.keys(result.keywordCategories).length}/${merged.length} keywords`);

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

  // ── Hero metrics from FULL keyword footprint (not capped-200 category analysis) ──
  // This ensures totalCategoryVolume stored in DB matches what Keyword Landscape displays.
  const _topKws   = semrush.topKeywords ?? [];
  const _topSet   = new Set(_topKws.map(k => k.keyword.toLowerCase()));
  const _allKwsFull = [
    ..._topKws,
    ...(semrush.gapKeywords ?? []).filter(k => !_topSet.has(k.keyword.toLowerCase())),
  ];
  const _fullMonthlyVol = _allKwsFull.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
  const _fullPage1Vol   = _topKws
    .filter(k => k.position != null && k.position <= 10)
    .reduce((s, k) => s + (k.searchVolume ?? 0), 0);

  const totalCategoryVolume = _fullMonthlyVol > 0
    ? _fullMonthlyVol
    : semrush.competitors.reduce((sum, c) => sum + c.organicTraffic, semrush.overview.organicTraffic);

  const clientOwnedVolume = _fullPage1Vol > 0
    ? _fullPage1Vol
    : semrush.overview.organicTraffic;

  const marketCaptureRate = totalCategoryVolume > 0
    ? clientOwnedVolume / totalCategoryVolume
    : 0;

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
