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
import { getLLMProbeSnapshotV2, type LLMProbeSnapshotV2 } from '../apis/llmProbe';

import {
  personaPrompt,
  opportunityPrompt,
  narrativePrompt,
  pptPromptGenerator,
  categoryBreakdownPrompt,
  categoryConsolidationPrompt,
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

  // ── Phase 1 (v7.80): category DISCOVERY across the ENTIRE keyword set ──────
  // Every keyword participates in defining what categories exist — no top-200
  // sampling. The full set is chunked into batches of 250; each batch runs the
  // discovery prompt independently (parallel, bounded concurrency), proposing
  // categories and assigning its own keywords to them.
  const OTHER_NAME      = 'Other';
  const DISCOVERY_BATCH = 250;
  const CONCURRENCY     = 5;

  const batches: Array<{ start: number; kws: MergedKeyword[] }> = [];
  for (let i = 0; i < merged.length; i += DISCOVERY_BATCH) {
    batches.push({ start: i, kws: merged.slice(i, i + DISCOVERY_BATCH) });
  }
  console.log(`[OrbitIQ] Category discovery: ${merged.length} keywords in ${batches.length} batch(es)`);

  interface ProposedCat {
    name:    string;
    type:    'procedure' | 'brand' | 'location';
    indices: number[];   // GLOBAL indices into merged
  }
  const proposed: ProposedCat[] = [];

  const runDiscovery = async (batch: { start: number; kws: MergedKeyword[] }) => {
    try {
      const bPrompt   = categoryBreakdownPrompt(domain, industry, batch.kws);
      const bResponse = await getClient().messages.create({
        model:      MODELS.fast,
        max_tokens: 3000,
        messages:   [{ role: 'user', content: bPrompt }],
      }, { timeout: 100_000 });
      const bText   = bResponse.content[0].type === 'text' ? bResponse.content[0].text : '';
      const bParsed = extractJSON<{ categories: Array<{ name: string; type?: string; keywordIndices: number[] }> }>(bText);

      for (const cat of bParsed.categories ?? []) {
        if (!cat?.name) continue;
        const catType = (cat.type === 'brand' || cat.type === 'location') ? cat.type : 'procedure';
        const indices = (cat.keywordIndices ?? [])
          .filter(i => Number.isInteger(i) && i >= 0 && i < batch.kws.length)
          .map(i => batch.start + i);
        if (indices.length > 0) proposed.push({ name: cat.name, type: catType, indices });
      }
    } catch (err) {
      // Non-fatal — this batch's keywords fall into "Other" below.
      console.error('[OrbitIQ] Category discovery batch failed (keywords → Other):', (err as any)?.message);
    }
  };

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    await Promise.all(batches.slice(i, i + CONCURRENCY).map(runDiscovery));
  }

  // Degenerate case: every discovery batch failed → keep the old empty-result
  // contract so callers treat it as "no category data" rather than all-Other.
  if (proposed.length === 0) {
    return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: merged.length, page1CaptureRate: 0, keywordCategories: {} };
  }

  // ── Phase 2 (v7.80): CONSOLIDATION — merge duplicate category names ────────
  // Independent batches name the same concept differently ("Liposuction" vs
  // "Lipo Procedures"). One haiku call merges aliases into a canonical list.
  // On failure, identity mapping is used (raw names kept — still full coverage).

  // Unique proposed names (case-insensitive) with majority type vote
  const nameVotes = new Map<string, { name: string; types: Record<string, number> }>();
  for (const p of proposed) {
    const low = p.name.toLowerCase().trim();
    if (!nameVotes.has(low)) nameVotes.set(low, { name: p.name, types: {} });
    const v = nameVotes.get(low)!;
    v.types[p.type] = (v.types[p.type] ?? 0) + p.indices.length;
  }
  const uniqueCats: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> = [];
  nameVotes.forEach(v => {
    const top = (Object.entries(v.types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'procedure') as 'procedure' | 'brand' | 'location';
    uniqueCats.push({ name: v.name, type: top });
  });

  // canonical lookup: proposed name (lowercase) → { name, type }
  const canonical = new Map<string, { name: string; type: 'procedure' | 'brand' | 'location' }>();

  if (batches.length > 1 && uniqueCats.length > 1) {
    try {
      const cPrompt   = categoryConsolidationPrompt(domain, industry, uniqueCats);
      const cResponse = await getClient().messages.create({
        model:      MODELS.fast,
        max_tokens: 3000,
        messages:   [{ role: 'user', content: cPrompt }],
      }, { timeout: 100_000 });
      const cText   = cResponse.content[0].type === 'text' ? cResponse.content[0].text : '';
      const cParsed = extractJSON<{ categories: Array<{ name: string; type?: string; merges: string[] }> }>(cText);

      for (const canon of cParsed.categories ?? []) {
        if (!canon?.name) continue;
        const canonType = (canon.type === 'brand' || canon.type === 'location') ? canon.type : 'procedure';
        for (const alias of canon.merges ?? []) {
          if (typeof alias === 'string') {
            canonical.set(alias.toLowerCase().trim(), { name: canon.name, type: canonType });
          }
        }
      }
      console.log(`[OrbitIQ] Category consolidation: ${uniqueCats.length} proposed → ${(cParsed.categories ?? []).length} canonical`);
    } catch (err) {
      console.error('[OrbitIQ] Category consolidation failed (using raw names):', (err as any)?.message);
    }
  }
  // Identity mapping for anything the consolidation call missed
  for (const u of uniqueCats) {
    const low = u.name.toLowerCase().trim();
    if (!canonical.has(low)) canonical.set(low, { name: u.name, type: u.type });
  }

  // ── Phase 3: build the complete keyword → canonical-category assignment ────
  const assignmentByIndex = new Map<number, string>();
  const catTypeByName     = new Map<string, 'procedure' | 'brand' | 'location'>();

  for (const p of proposed) {
    const canon = canonical.get(p.name.toLowerCase().trim()) ?? { name: p.name, type: p.type };
    if (!catTypeByName.has(canon.name)) catTypeByName.set(canon.name, canon.type);
    for (const g of p.indices) {
      if (merged[g] && !assignmentByIndex.has(g)) assignmentByIndex.set(g, canon.name);
    }
  }
  // Every keyword not assigned by discovery (failed batch / omitted index)
  // falls into "Other" so totals always cover the full footprint.
  for (let i = 0; i < merged.length; i++) {
    if (!assignmentByIndex.has(i)) assignmentByIndex.set(i, OTHER_NAME);
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

  // Emit procedure categories by demand desc, then brand/location by demand
  // desc, with "Other" always last.
  const allNames = Array.from(sums.keys());
  const demandOf = (n: string) => sums.get(n)!.monthlyDemand;
  const isNav    = (n: string) => { const t = catTypeByName.get(n); return t === 'brand' || t === 'location'; };
  const orderedNames = [
    ...allNames.filter(n => n !== OTHER_NAME && !isNav(n)).sort((a, b) => demandOf(b) - demandOf(a)),
    ...allNames.filter(n => n !== OTHER_NAME &&  isNav(n)).sort((a, b) => demandOf(b) - demandOf(a)),
    ...allNames.filter(n => n === OTHER_NAME),
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
  llmProbe:          LLMProbeSnapshotV2 | any;   // v7.80: probe now runs here (needs categories)
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

  // Passes 1 & 2.5 run in parallel. Opportunities (pass 2) moved AFTER the
  // LLM probe (v7.80) so it scores GEO opportunities against fresh probe data.
  const [personas, categoryBreakdown] = await Promise.all([
    generatePersonas(domain, industry, semrush, serp),
    generateCategoryBreakdown(domain, industry, semrush).catch(err => {
      console.error('[OrbitIQ] Category breakdown failed (non-fatal):', err);
      return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: 0, page1CaptureRate: 0, keywordCategories: {} } as CategoryBreakdownResult;
    }),
  ]);
  console.log(`[OrbitIQ] Personas: ${personas.length}, Categories: ${categoryBreakdown.categories.length}`);

  // Pass 2.6 (v7.80): LLM probe — needs procedure categories from pass 2.5.
  // "Other" is excluded (catch-all, not a real product category). On failure,
  // fall back to the previous analysis's probe data (passed in as `profound`)
  // so the panel degrades gracefully instead of going blank.
  const probeCategories = categoryBreakdown.categories
    .filter(c => c.type === 'procedure' && c.name !== 'Other')
    .map(c => ({ name: c.name, monthlyDemand: c.monthlyDemand }));

  const llmProbe = await getLLMProbeSnapshotV2(clientName, domain, industry, probeCategories)
    .catch(err => {
      console.error('[OrbitIQ] LLM probe v2 failed (using previous probe data):', err);
      return profound ?? null;
    });

  // Pass 2: opportunities — uses the fresh probe
  const opportunities = await generateOpportunities(domain, industry, semrush, serp, llmProbe)
    .catch(err => {
      console.error('[OrbitIQ] Opportunities failed (non-fatal):', err);
      return [] as any[];
    });
  console.log(`[OrbitIQ] Opportunities: ${opportunities.length}`);

  // Passes 3 & 4 run in parallel — PPT prompt uses placeholder narrative snippets
  // until narrative is available; the deck is built from opportunities + raw data.
  const [narrative, pptPrompt] = await Promise.all([
    generateNarrative(
      domain, clientName, industry,
      semrush, serp, llmProbe,
      personas, opportunities,
      categoryBreakdown
    ),
    generatePPTPrompt(
      clientName, domain, industry,
      null,          // narrative not yet available — prompts.ts handles null gracefully
      opportunities,
      semrush, serp, llmProbe
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
    llmProbe,
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
