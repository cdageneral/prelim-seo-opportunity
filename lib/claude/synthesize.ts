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
import { instrumentAnthropic } from '@/lib/usage/record';
import { groupCategoriesByIntent } from '@/lib/claude/intentGroups';
import type { SemrushSnapshot }  from '../apis/semrush';
import type { SerpApiSnapshot }  from '../apis/serp';
import { getLLMProbeSnapshotV2, type LLMProbeSnapshotV2 } from '../apis/llmProbe';

import {
  personaPrompt,
  opportunityPrompt,
  narrativePrompt,
  pptPromptGenerator,
  hierarchicalDiscoveryPrompt,
  pathCanonicalizationPrompt,
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
  return instrumentAnthropic(new Anthropic({ apiKey }));   // v7.225: auto-record token usage
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
    // v7.229: semantic product-line parent (real two-level taxonomy, Const III.1).
    // Absent on pre-v7.229 analyses → consumers fall back to a flat list (honest
    // gap, Const I.5) instead of the old lexical guess. Equal to `name` when the
    // category is itself a top-level line.
    parent?:       string;
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
  // v7.231: keyword → full semantic PATH (umbrella → theme → sub → …). The stored
  // multi-level taxonomy the Keyword panel renders (every node a page). Absent on
  // pre-v7.231 analyses → panels fall back to the flat/2-level view (honest gap I.5).
  keywordPaths?:           Record<string, string[]>;
  // v7.199: AI search-intent grouping (synonyms merged, topical names) + brand terms
  // to drop. Populated inline for smaller analyses; large ones use the on-demand
  // "Refine with AI" button. Optional — absent → panel uses the heuristic grouping.
  intentGroups?:           Array<{ category: string; name: string; stage: string; keywords: string[] }>;
  brandKeywords?:          string[];
  intentEngine?:           string;
}

// v7.86: with uncapped Semrush pulls a footprint can be 30k+ keywords →
// 120+ discovery batches, which cannot finish inside one 300s Lambda. The
// discovery loop therefore reports progress after every concurrency wave via
// onProgress; an interrupted run resumes from the saved progress instead of
// re-running (and re-paying for) completed batches.
export interface CbDiscoveryProgress {
  // v7.231: hierarchical discovery checkpoints raw per-keyword path assignments.
  proposed:   Array<{ index: number; path: string[]; type: 'procedure' | 'brand' | 'location' }>;
  doneStarts: number[];   // batch start offsets already discovered
}

export async function generateCategoryBreakdown(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  progress?: CbDiscoveryProgress | null,
  onProgress?: (p: CbDiscoveryProgress) => Promise<void>,
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

  // ── Phase 1 (v7.231): HIERARCHICAL DISCOVERY across the ENTIRE keyword set ──
  // Every keyword participates — no sampling (Const I.6). The full set is chunked into
  // batches of 250; each batch returns, per keyword, the FULL semantic PATH (umbrella →
  // theme → sub → …) it belongs to. This replaces the old flat discovery: structure +
  // membership come out of the same pass, so per-analysis cost is unchanged.
  const OTHER_NAME      = 'Other';
  const DISCOVERY_BATCH = 250;
  const CONCURRENCY     = 5;

  const batches: Array<{ start: number; kws: MergedKeyword[] }> = [];
  for (let i = 0; i < merged.length; i += DISCOVERY_BATCH) {
    batches.push({ start: i, kws: merged.slice(i, i + DISCOVERY_BATCH) });
  }
  console.log(`[OrbitIQ] Hierarchical discovery: ${merged.length} keywords in ${batches.length} batch(es)`);

  type CatType = 'procedure' | 'brand' | 'location';
  interface RawAssign { index: number; path: string[]; type: CatType; }  // GLOBAL index into merged

  const rawAssigns: RawAssign[] = (progress?.proposed ?? []).map(p => ({ index: p.index, path: [...p.path], type: p.type }));
  const doneStarts = new Set<number>(progress?.doneStarts ?? []);

  const cleanPath = (p: any): string[] =>
    Array.isArray(p) ? p.map(s => String(s ?? '').trim()).filter(Boolean) : [];

  const runDiscovery = async (batch: { start: number; kws: MergedKeyword[] }) => {
    try {
      const bPrompt   = hierarchicalDiscoveryPrompt(domain, industry, batch.kws);
      const bResponse = await getClient().messages.create({
        model:      MODELS.fast,
        max_tokens: 4000,   // paths are more verbose than flat names
        messages:   [{ role: 'user', content: bPrompt }],
      }, { timeout: 60_000 });
      const bText   = bResponse.content[0].type === 'text' ? bResponse.content[0].text : '';
      const bParsed = extractJSON<{ assignments: Array<{ index: number; path: string[]; type?: string }> }>(bText);

      for (const a of bParsed.assignments ?? []) {
        const li = a?.index;
        if (!Number.isInteger(li) || li < 0 || li >= batch.kws.length) continue;
        const path = cleanPath(a?.path);
        if (path.length === 0) continue;
        const type: CatType = (a?.type === 'brand' || a?.type === 'location') ? a.type : 'procedure';
        rawAssigns.push({ index: batch.start + li, path, type });
      }
      doneStarts.add(batch.start);
    } catch (err) {
      // Non-fatal — this batch's keywords fall into "Other" below. NOT marked done.
      console.error('[OrbitIQ] Hierarchical discovery batch failed (keywords → Other):', (err as any)?.message);
    }
  };

  const pendingBatches = batches.filter(b => !doneStarts.has(b.start));
  if (pendingBatches.length < batches.length) {
    console.log(`[OrbitIQ] Discovery resume: ${batches.length - pendingBatches.length} done, ${pendingBatches.length} remaining`);
  }
  for (let i = 0; i < pendingBatches.length; i += CONCURRENCY) {
    await Promise.all(pendingBatches.slice(i, i + CONCURRENCY).map(runDiscovery));
    if (onProgress && i + CONCURRENCY < pendingBatches.length) {
      await onProgress({ proposed: rawAssigns, doneStarts: Array.from(doneStarts) });
    }
  }

  // Degenerate case: every discovery batch failed → keep the old empty-result contract.
  if (rawAssigns.length === 0) {
    return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: merged.length, page1CaptureRate: 0, keywordCategories: {}, keywordPaths: {} };
  }

  // ── Phase 2 (v7.231): PATH CANONICALIZATION — align labels across batches ──
  // Independent batches can label the same node differently ("30-yr fixed" vs "30 Year
  // Fixed"). One call over the DISTINCT paths (bounded — far fewer than keywords) returns
  // a canonical path for each, so equivalent nodes merge. On failure → identity (raw paths).
  const pathKey = (p: string[]) => p.join(' › ');
  const distinctMap = new Map<string, string[]>();
  for (const r of rawAssigns) if (!distinctMap.has(pathKey(r.path))) distinctMap.set(pathKey(r.path), r.path);
  const distinctPaths = Array.from(distinctMap.values());
  const canonByRawKey = new Map<string, string[]>();

  if (distinctPaths.length > 1 && distinctPaths.length <= 300) {
    try {
      const cPrompt   = pathCanonicalizationPrompt(domain, industry, distinctPaths);
      const cResponse = await getClient().messages.create({
        model:      MODELS.fast,
        max_tokens: 4000,
        messages:   [{ role: 'user', content: cPrompt }],
      }, { timeout: 60_000 });
      const cText   = cResponse.content[0].type === 'text' ? cResponse.content[0].text : '';
      const cParsed = extractJSON<{ canonical: Array<{ index: number; path: string[] }> }>(cText);
      for (const c of cParsed.canonical ?? []) {
        const idx = c?.index;
        if (!Number.isInteger(idx) || idx < 0 || idx >= distinctPaths.length) continue;
        const cp = cleanPath(c?.path);
        if (cp.length) canonByRawKey.set(pathKey(distinctPaths[idx]), cp);
      }
      console.log(`[OrbitIQ] Path canonicalization: ${distinctPaths.length} distinct paths processed`);
    } catch (err) {
      console.error('[OrbitIQ] Path canonicalization failed (using raw paths):', (err as any)?.message);
    }
  }
  for (const [k, p] of Array.from(distinctMap.entries())) if (!canonByRawKey.has(k)) canonByRawKey.set(k, p);

  // ── Phase 3: per-keyword canonical PATH + derived flat category (back-compat) ──
  // keywordPaths is the new stored taxonomy. We ALSO derive the flat `keywordCategories`
  // (theme level) + `categories` + umbrella `parent`, so the 14 existing consumers
  // (ThemeClusters, Journey, Content, brand guard, etc.) keep working unchanged.
  const pathByIndex = new Map<number, string[]>();
  const typeByIndex = new Map<number, CatType>();
  for (const r of rawAssigns) {
    if (!merged[r.index] || pathByIndex.has(r.index)) continue;
    pathByIndex.set(r.index, canonByRawKey.get(pathKey(r.path)) ?? r.path);
    typeByIndex.set(r.index, r.type);
  }
  for (let i = 0; i < merged.length; i++) {
    if (!pathByIndex.has(i)) { pathByIndex.set(i, [OTHER_NAME]); typeByIndex.set(i, 'procedure'); }
  }

  const keywordPaths: Record<string, string[]> = {};
  const assignmentByIndex = new Map<number, string>();              // → derived category (theme)
  const catTypeByName     = new Map<string, CatType>();
  const umbrellaByCat     = new Map<string, string>();             // category (theme) → umbrella (path[0])
  for (let i = 0; i < merged.length; i++) {
    const kw = merged[i]; if (!kw) continue;
    const P    = pathByIndex.get(i)!;
    const type = typeByIndex.get(i)!;
    keywordPaths[kw.keyword.toLowerCase()] = P;
    const umbrella = P[0];
    // Theme = the level other panels treat as the "category": for a procedure that's the
    // node under the umbrella (path[1]); brand/location stay at their top node (path[0]).
    const cat = (type === 'procedure' && P.length >= 2) ? P[1] : P[0];
    assignmentByIndex.set(i, cat);
    if (!catTypeByName.has(cat))   catTypeByName.set(cat, type);
    if (!umbrellaByCat.has(cat))   umbrellaByCat.set(cat, umbrella);
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

  // ── v7.231: store the multi-level taxonomy + derive umbrella parents ───────
  // `parent` (back-compat with v7.229) = the umbrella the theme sits under (path[0]),
  // read straight from the canonical paths — no extra LLM call. `keywordPaths` carries
  // the full tree the Keyword panel renders. Brand/location stay navigational (no parent).
  result.keywordPaths = keywordPaths;
  for (const c of result.categories) {
    if (c.type !== 'procedure' || c.name === OTHER_NAME) continue;
    const umbrella = umbrellaByCat.get(c.name);
    c.parent = (umbrella && umbrella.length > 0) ? umbrella : c.name;
  }
  {
    const umbrellas = new Set(result.categories.filter(c => c.parent).map(c => c.parent));
    console.log(`[OrbitIQ] Taxonomy: ${Object.keys(keywordPaths).length} keyword paths, ${umbrellas.size} umbrella(s)`);
  }

  // ── v7.199: AI search-intent grouping (the "automatic" half of Wayne's hybrid) ──
  // Best-effort + bounded so it can NEVER break an analysis. For large footprints we
  // skip here (the on-demand "Refine with AI" button handles those) to protect the
  // 300s Lambda budget. Failures are swallowed — clusters just fall back to heuristic.
  try {
    const volByKw = new Map<string, number>();
    for (const kw of merged) {
      const k = kw.keyword.toLowerCase();
      if (!volByKw.has(k)) volByKw.set(k, kw.searchVolume ?? 0);
    }
    const procNames = new Set(result.categories.filter(c => c.type === 'procedure').map(c => c.name));
    const kwByCat = new Map<string, Array<{ keyword: string; searchVolume: number }>>();
    for (const [kwLow, catName] of Object.entries(result.keywordCategories)) {
      if (!procNames.has(catName)) continue;
      const arr = kwByCat.get(catName) ?? [];
      arr.push({ keyword: kwLow, searchVolume: volByKw.get(kwLow) ?? 0 });
      kwByCat.set(catName, arr);
    }
    const catInputs = Array.from(kwByCat.entries())
      .filter(([, kws]) => kws.length > 0)
      .map(([name, keywords]) => ({ name, type: 'procedure' as const, keywords }));
    const procKwCount = catInputs.reduce((s, c) => s + c.keywords.length, 0);

    // Guard: only run inline when it comfortably fits the analysis time budget.
    if (catInputs.length > 0 && catInputs.length <= 120 && procKwCount <= 2000) {
      const ai = await groupCategoriesByIntent(catInputs, domain);
      result.intentGroups  = ai.intentGroups;
      result.brandKeywords = ai.brandKeywords;
      result.intentEngine  = ai.intentEngine;
      console.log(`[OrbitIQ] Intent grouping (inline): ${ai.intentGroups.length} groups, ${ai.brandKeywords.length} brand terms`);
    } else {
      console.log(`[OrbitIQ] Intent grouping skipped inline (${catInputs.length} procedure categories / ${procKwCount} kws) — use "Refine with AI".`);
    }
  } catch (err) {
    console.error('[OrbitIQ] Inline intent grouping failed (non-fatal):', (err as any)?.message ?? err);
  }

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

// v7.83: checkpoint shape persisted between passes so an interrupted synthesis
// (Vercel 300s kill, dropped connection) can RESUME without re-running — and
// re-paying for — passes that already finished.
export interface SynthesisCheckpoint {
  personas?:          any[];
  categoryBreakdown?: CategoryBreakdownResult;
  cbProgress?:        CbDiscoveryProgress;   // v7.86: partial discovery (wave-level resume)
  llmProbe?:          any;
  opportunities?:     any[];
}

export async function runFullSynthesis(
  domain: string,
  clientName: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: any,
  cached: SynthesisCheckpoint = {},
  onCheckpoint?: (partial: SynthesisCheckpoint) => Promise<void>,
): Promise<SynthesisResult> {
  console.log(`[OrbitIQ] Starting synthesis for ${domain}${Object.keys(cached).length > 0 ? ` (resuming — cached: ${Object.keys(cached).join(', ')})` : ''}`);

  // Only trust cached results that actually contain data — an empty array /
  // empty breakdown means the pass failed last time and should be retried.
  const cachedPersonas = (cached.personas?.length ?? 0) > 0 ? cached.personas! : null;
  const cachedCb       = (cached.categoryBreakdown?.categories?.length ?? 0) > 0 ? cached.categoryBreakdown! : null;
  const cachedProbe    = cached.llmProbe ?? null;
  const cachedOpps     = (cached.opportunities?.length ?? 0) > 0 ? cached.opportunities! : null;

  // Passes 1 & 2.5 run in parallel. Opportunities (pass 2) moved AFTER the
  // LLM probe (v7.80) so it scores GEO opportunities against fresh probe data.
  const [personas, categoryBreakdown] = await Promise.all([
    cachedPersonas
      ? Promise.resolve(cachedPersonas)
      : generatePersonas(domain, industry, semrush, serp),
    cachedCb
      ? Promise.resolve(cachedCb)
      : generateCategoryBreakdown(
          domain, industry, semrush,
          cached.cbProgress ?? null,
          // v7.86: wave-level discovery progress is checkpointed so very large
          // (uncapped) footprints can resume mid-discovery after a 300s kill
          onCheckpoint ? async (p) => onCheckpoint({ cbProgress: p }) : undefined,
        ).catch(err => {
          console.error('[OrbitIQ] Category breakdown failed (non-fatal):', err);
          return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: 0, page1CaptureRate: 0, keywordCategories: {} } as CategoryBreakdownResult;
        }),
  ]);
  console.log(`[OrbitIQ] Personas: ${personas.length}, Categories: ${categoryBreakdown.categories.length}`);
  if (!cachedPersonas || !cachedCb) await onCheckpoint?.({ personas, categoryBreakdown });

  // Pass 2.6 (v7.80): LLM probe — needs procedure categories from pass 2.5.
  // "Other" is excluded (catch-all, not a real product category). On failure,
  // fall back to the previous analysis's probe data (passed in as `profound`)
  // so the panel degrades gracefully instead of going blank.
  let llmProbe = cachedProbe;
  if (!llmProbe) {
    // v7.86: cap probe input at the top 12 procedure categories by demand —
    // uncapped footprints can produce 30+ categories, and probing all of them
    // (3 prompts × 2 platforms each) would not fit in the Lambda window.
    // The probe is a sampled visibility measure either way; results shown are
    // always actual probe responses for the categories listed.
    const probeCategories = categoryBreakdown.categories
      .filter(c => c.type === 'procedure' && c.name !== 'Other')
      .sort((a, b) => b.monthlyDemand - a.monthlyDemand)
      .slice(0, 12)
      .map(c => ({ name: c.name, monthlyDemand: c.monthlyDemand }));

    llmProbe = await getLLMProbeSnapshotV2(clientName, domain, industry, probeCategories)
      .catch(err => {
        console.error('[OrbitIQ] LLM probe v2 failed (using previous probe data):', err);
        return profound ?? null;
      });
    if (llmProbe) await onCheckpoint?.({ llmProbe });
  }

  // Pass 2: opportunities — uses the fresh probe
  const opportunities = cachedOpps ?? await generateOpportunities(domain, industry, semrush, serp, llmProbe)
    .catch(err => {
      console.error('[OrbitIQ] Opportunities failed (non-fatal):', err);
      return [] as any[];
    });
  console.log(`[OrbitIQ] Opportunities: ${opportunities.length}`);
  if (!cachedOpps && opportunities.length > 0) await onCheckpoint?.({ opportunities });

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
