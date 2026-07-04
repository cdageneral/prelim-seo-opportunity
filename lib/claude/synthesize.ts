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
import { classifyUmbrellaScopes } from '@/lib/category/scopeModel';   // v7.326: scope gate (core vs adjacent vertical)
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
  taxonomySkeletonPrompt,   // v7.339: shared skeleton every discovery batch anchors to (Const III.1e)
  siblingAuditPrompt,       // v7.341: merges same-concept sibling sub-topics chunking missed
  type MergedKeyword,
} from './prompts';
import {
  unifyLabels,
  classifyMerge,
  pathJoin,
  MERGE_LOG_CAP,
  buildSiblingGroups,
  applySiblingMerges,
  type MergeLogEntry,
  type SiblingMerge,
} from '@/lib/category/canonicalize';   // v7.339: deterministic label unification + merge log; v7.341: sibling audit

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
  // v7.235: per-keyword classification metadata from the hierarchical pass — the LLM's
  // separated MODIFIER, search INTENT, a CONFIDENCE self-estimate (0–100; Const III.7 —
  // a model estimate, never a measured data metric), a one-line REASONING, and the derived
  // needsReview flag (confidence < 80 → "Needs Review", Const III.7). Labels/structure only;
  // every VOLUME sum is still computed in TypeScript (Const I.1). Absent on pre-v7.235 runs.
  keywordMeta?:            Record<string, { modifier?: string; intent?: string; confidence?: number; reasoning?: string; needsReview?: boolean }>;
  // v7.199: AI search-intent grouping (synonyms merged, topical names) + brand terms
  // to drop. Populated inline for smaller analyses; large ones use the on-demand
  // "Refine with AI" button. Optional — absent → panel uses the heuristic grouping.
  intentGroups?:           Array<{ category: string; name: string; stage: string; keywords: string[] }>;
  brandKeywords?:          string[];
  intentEngine?:           string;
  // v7.326: AUTO scope per UMBRELLA (path[0]) — 'core' = client competes in this vertical
  // (≥ CORE_MIN_CLIENT_KW client footprint keywords) | 'adjacent' = competitor-only vertical
  // the client is absent from. Stored so the scope gate reads it (Const II.8), never re-derives
  // it lexically at a read site. Brand/location/Other umbrellas are always 'core' (never gated —
  // the brand guard handles brand verticals). Absent on pre-v7.326 analyses → every umbrella is
  // treated as core (honest default, Const I.5). Keyed by exact umbrella name.
  umbrellaScope?:          Record<string, 'core' | 'adjacent'>;
  // v7.339 (Const III.1e): every taxonomy merge auto-applied during this build —
  // deterministic label unifications AND LLM re-parents — so the Keyword panel can
  // show exactly what moved where (Wayne: auto-apply, log visibly). Capped at
  // MERGE_LOG_CAP entries. Absent on pre-v7.339 analyses.
  mergeLog?:               Array<{ from: string; to: string; kind: 'label' | 'reparent' }>;
  // v7.339: the canonical umbrella → themes skeleton every discovery batch anchored
  // to (labels only — structure reference for later passes and debugging).
  taxonomySkeleton?:       Array<{ name: string; themes: string[] }>;
  // v7.339: engine tag for observability ('anchored-v1' = skeleton-anchored discovery).
  taxonomyEngine?:         string;
}

// v7.86: with uncapped Semrush pulls a footprint can be 30k+ keywords →
// 120+ discovery batches, which cannot finish inside one 300s Lambda. The
// discovery loop therefore reports progress after every concurrency wave via
// onProgress; an interrupted run resumes from the saved progress instead of
// re-running (and re-paying for) completed batches.
export interface CbDiscoveryProgress {
  // v7.231: hierarchical discovery checkpoints raw per-keyword path assignments.
  // v7.235: also carries the separated modifier + intent/confidence/reasoning metadata
  // so a resumed run keeps the classification fields (not just the path).
  proposed:   Array<{ index: number; path: string[]; type: 'procedure' | 'brand' | 'location'; modifier?: string; intent?: string; confidence?: number; reasoning?: string }>;
  doneStarts: number[];   // batch start offsets already discovered
  // v7.345: consolidation (Phase 2b) checkpoint. Chunked LLM canonicalization
  // used to restart from zero on every resume, so a large footprint's ~12–20
  // sequential chunks could never all finish inside one 300s Lambda — the run
  // timed out forever (live: repeated "Canonicalization chunk failed" then a
  // 300s kill, with discovery frozen at 100% so the page declared it "failed").
  // Persisting per-chunk progress lets each window advance a few chunks and the
  // next resume skip the finished ones (Const IV.2 — determinate, resumable).
  canon?: {
    total:       number;                    // total canon chunks (stable: derived from COMPLETE discovery)
    chunksDone:  number[];                  // canon chunk start-offsets finished (parsed OR permanently failed)
    mappings:    Array<[string, string[]]>; // detKey → canonical path accumulated so far
    established: string[];                  // carry-forward canonical nodes for cross-chunk label alignment
  };
}

export async function generateCategoryBreakdown(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  progress?: CbDiscoveryProgress | null,
  onProgress?: (p: CbDiscoveryProgress) => Promise<void>,
  // v7.339 (Const III.1e): distinct canonical paths from the project's PREVIOUS
  // analysis. When present, the skeleton pass anchors to them so category names
  // stay stable across re-analyses (adding a competitor CSV no longer renames
  // or re-splits the tree). Absent on a first analysis.
  priorPaths?: string[][] | null,
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
  // Every keyword participates — no sampling (Const I.6). Each batch returns, per keyword,
  // the FULL semantic PATH (umbrella → theme → sub → …). Structure + membership come out of
  // the same pass, so per-analysis cost is unchanged.
  // v7.232: per-keyword PATH output is ~3× more verbose than the old flat index lists, so a
  // 250-kw batch overran max_tokens and the JSON truncated → every batch failed to parse →
  // empty category breakdown (which blanked the Cluster panel + keyword categories). Smaller
  // batches keep each response comfortably inside the token budget; concurrency keeps it fast.
  const OTHER_NAME      = 'Other';
  // v7.235: each assignment now also carries modifier + intent + confidence + a short
  // reasoning clause, so each object is larger than the v7.232 path-only output. Drop the
  // batch to 25 and raise max_tokens so the JSON does not truncate (the salvage parser still
  // backstops a clipped tail). Tested at real batch size per the harness-real-scale rule.
  const DISCOVERY_BATCH = 25;

  const batches: Array<{ start: number; kws: MergedKeyword[] }> = [];
  for (let i = 0; i < merged.length; i += DISCOVERY_BATCH) {
    batches.push({ start: i, kws: merged.slice(i, i + DISCOVERY_BATCH) });
  }
  // v7.343: adaptive concurrency (Wayne-approved). Large uploads (8k kws ≈ 328
  // batches) needed 3-4 Vercel 300s windows at 6 workers; 12 roughly halves the
  // wall time. Same total calls — no extra spend; haiku rate limits absorb 12
  // and per-batch failures already retry (v7.339). Small pools keep 6.
  const CONCURRENCY = batches.length > 120 ? 12 : 6;
  console.log(`[OrbitIQ] Hierarchical discovery: ${merged.length} keywords in ${batches.length} batch(es), concurrency ${CONCURRENCY}`);

  // ── Phase 0 (v7.339): TAXONOMY SKELETON — one shared tree before batching ──
  // The duplicate-category failure (Wills / Wills & Trusts / Estate Planning as
  // three nodes) came from each 25-kw batch inventing umbrellas independently.
  // One upfront call over a volume-ranked sample (plus the PRIOR analysis's
  // taxonomy when re-analyzing) proposes the canonical umbrella → theme skeleton;
  // every discovery batch then assigns INTO it (Const III.1e). On failure →
  // skeleton = null and discovery runs unanchored exactly as before (honest
  // fallback, Const I.5) — consolidation still catches duplicates downstream.
  const SKELETON_SAMPLE = 200;
  let skeleton: Array<{ name: string; themes: string[] }> | null = null;
  let anchorTreeText = '';
  try {
    // Sample: top by volume + a stratified sweep of the tail so small themes
    // are represented (every Nth keyword of the remainder up to the cap).
    const byVol = merged.slice().sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
    const head  = byVol.slice(0, Math.min(120, byVol.length));
    const rest  = byVol.slice(head.length);
    const step  = Math.max(1, Math.floor(rest.length / Math.max(1, SKELETON_SAMPLE - head.length)));
    const sample = head.concat(rest.filter((_, i) => i % step === 0)).slice(0, SKELETON_SAMPLE)
      .map(k => ({ keyword: k.keyword, searchVolume: k.searchVolume ?? 0 }));

    // Prior-taxonomy anchor: distinct umbrella > theme lines from the previous
    // analysis (bounded), so re-analyses keep stable names (Const III.1e).
    let priorTree: string[] | undefined;
    if (priorPaths && priorPaths.length > 0) {
      const seen = new Set<string>();
      const lines: string[] = [];
      for (const p of priorPaths) {
        const line = p.slice(0, 2).join(' > ');
        if (line && !seen.has(line)) { seen.add(line); lines.push(line); }
        if (lines.length >= 150) break;
      }
      priorTree = lines;
    }

    const sResponse = await getClient().messages.create({
      model:      MODELS.fast,
      max_tokens: 4000,
      messages:   [{ role: 'user', content: taxonomySkeletonPrompt(domain, industry, sample, priorTree) }],
    }, { timeout: 60_000 });
    const sText   = sResponse.content[0].type === 'text' ? sResponse.content[0].text : '';
    const sParsed = extractJSON<{ umbrellas: Array<{ name: string; themes: string[] }> }>(sText);
    const umbrellas = (sParsed.umbrellas ?? [])
      .map(u => ({
        name:   String(u?.name ?? '').trim(),
        themes: (Array.isArray(u?.themes) ? u.themes : []).map(t => String(t ?? '').trim()).filter(Boolean).slice(0, 15),
      }))
      .filter(u => u.name.length > 0)
      .slice(0, 30);
    if (umbrellas.length > 0) {
      skeleton = umbrellas;
      anchorTreeText = umbrellas
        .map(u => u.themes.length > 0 ? `${u.name} › ${u.themes.join(' | ')}` : u.name)
        .join('\n');
      console.log(`[OrbitIQ] Taxonomy skeleton: ${umbrellas.length} umbrella(s)${priorTree ? ` (anchored to ${priorTree.length} prior nodes)` : ''}`);
    }
  } catch (err) {
    console.error('[OrbitIQ] Taxonomy skeleton failed (discovery runs unanchored):', (err as any)?.message);
  }

  type CatType = 'procedure' | 'brand' | 'location';
  // GLOBAL index into merged. v7.235: + separated modifier and intent/confidence/reasoning.
  interface RawAssign { index: number; path: string[]; type: CatType; modifier?: string; intent?: string; confidence?: number; reasoning?: string; }

  const rawAssigns: RawAssign[] = (progress?.proposed ?? []).map(p => ({ index: p.index, path: [...p.path], type: p.type, modifier: p.modifier, intent: p.intent, confidence: p.confidence, reasoning: p.reasoning }));
  const doneStarts = new Set<number>(progress?.doneStarts ?? []);

  const cleanPath = (p: any): string[] =>
    Array.isArray(p) ? p.map(s => String(s ?? '').trim()).filter(Boolean) : [];

  // v7.232: tolerant parse — if the whole-JSON parse fails (e.g. a truncated tail), salvage
  // every COMPLETE assignment object from the text so a partial response still contributes
  // its keywords instead of dropping the whole batch to "Other".
  type ParsedAssign = { index: number; path: string[]; type?: string; modifier?: string; intent?: string; confidence?: number; reasoning?: string };
  const parseAssignments = (text: string): ParsedAssign[] => {
    try {
      const parsed = extractJSON<{ assignments: ParsedAssign[] }>(text);
      if (Array.isArray(parsed?.assignments) && parsed.assignments.length > 0) return parsed.assignments;
    } catch { /* fall through to salvage */ }
    const out: ParsedAssign[] = [];
    const re = /\{[^{}]*?"index"\s*:\s*\d+[^{}]*?"path"\s*:\s*\[[^\]]*\][^{}]*?\}/g;
    const matches = text.match(re) ?? [];
    for (const m of matches) { try { out.push(JSON.parse(m)); } catch { /* skip */ } }
    return out;
  };

  const runDiscovery = async (batch: { start: number; kws: MergedKeyword[] }) => {
    try {
      const bPrompt   = hierarchicalDiscoveryPrompt(domain, industry, batch.kws, anchorTreeText);
      const bResponse = await getClient().messages.create({
        model:      MODELS.fast,
        max_tokens: 12000,  // v7.235: 25 keywords × (path + modifier + intent + confidence + reasoning), no truncation
        messages:   [{ role: 'user', content: bPrompt }],
      }, { timeout: 60_000 });
      const bText   = bResponse.content[0].type === 'text' ? bResponse.content[0].text : '';

      for (const a of parseAssignments(bText)) {
        const li = a?.index;
        if (!Number.isInteger(li) || li < 0 || li >= batch.kws.length) continue;
        const path = cleanPath(a?.path);
        if (path.length === 0) continue;
        const type: CatType = (a?.type === 'brand' || a?.type === 'location') ? a.type : 'procedure';
        // v7.235: capture the separated modifier + classification metadata. Sanitize:
        // confidence clamped to 0–100, strings trimmed/length-bounded. Labels only.
        const conf = Number.isFinite(a?.confidence as number)
          ? Math.max(0, Math.min(100, Math.round(a!.confidence as number)))
          : undefined;
        const modifier = typeof a?.modifier === 'string' ? a.modifier.trim().slice(0, 60) : undefined;
        const intent   = typeof a?.intent   === 'string' ? a.intent.trim().toLowerCase().slice(0, 20) : undefined;
        const reasoning = typeof a?.reasoning === 'string' ? a.reasoning.trim().slice(0, 200) : undefined;
        rawAssigns.push({ index: batch.start + li, path, type, modifier, intent, confidence: conf, reasoning });
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

  // v7.339: RETRY failed batches once before letting anything fall into "Other".
  // A transient timeout used to silently file 25 keywords under Other with no
  // trace — a big slice of the catch-all node. Whatever still fails after the
  // retry is flagged needsReview below (never silent, Const I.5).
  const retryBatches = batches.filter(b => !doneStarts.has(b.start));
  if (retryBatches.length > 0) {
    console.log(`[OrbitIQ] Discovery retry: ${retryBatches.length} failed batch(es)`);
    for (let i = 0; i < retryBatches.length; i += CONCURRENCY) {
      await Promise.all(retryBatches.slice(i, i + CONCURRENCY).map(runDiscovery));
    }
    if (onProgress) await onProgress({ proposed: rawAssigns, doneStarts: Array.from(doneStarts) });
  }
  // v7.345: the wave loop skipped its FINAL wave's checkpoint (the guard was
  // `i + CONCURRENCY < pendingBatches.length`), so the last ≤CONCURRENCY batches
  // replayed on every resume and consolidation never got a clean start. Persist
  // the COMPLETE discovery state once here so a resume enters Phase 2 with zero
  // discovery work. Only fires when discovery actually ran a batch this window
  // (a resume past discovery has 0 pending → canon state below is untouched).
  if (onProgress && pendingBatches.length > 0) {
    await onProgress({ proposed: rawAssigns, doneStarts: Array.from(doneStarts), canon: progress?.canon });
  }
  const failedBatchStarts = new Set<number>();
  for (const b of batches) if (!doneStarts.has(b.start)) failedBatchStarts.add(b.start);

  // Degenerate case: every discovery batch failed → keep the old empty-result contract.
  if (rawAssigns.length === 0) {
    return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: merged.length, page1CaptureRate: 0, keywordCategories: {}, keywordPaths: {} };
  }

  // ── Phase 2 (rewritten v7.339): CONSOLIDATION — deterministic + LLM re-parenting ──
  // 2a: TypeScript label unification (case / & vs and / plural / word order) merges
  //     trivial spelling variants for free — no model call, fully repeatable.
  // 2b: LLM canonicalization in CHUNKS (the old single call silently SKIPPED any
  //     taxonomy over 300 distinct paths — the worst offenders got no cleanup at
  //     all). Each chunk carries the canonical nodes established by earlier chunks
  //     so labels align across chunks; the rewritten prompt now RE-PARENTS subsumed
  //     concepts ("Wills" → Estate Planning › Wills & Trusts) instead of being
  //     forbidden from touching ancestors (Const III.1e).
  // Every auto-applied change lands in mergeLog (Wayne: auto-apply + visible log).
  const pathKey = (p: string[]) => pathJoin(p);
  const distinctMap  = new Map<string, string[]>();
  const weightByKey  = new Map<string, number>();   // keywords behind each raw path (label voting)
  for (const r of rawAssigns) {
    const k = pathKey(r.path);
    if (!distinctMap.has(k)) distinctMap.set(k, r.path);
    weightByKey.set(k, (weightByKey.get(k) ?? 0) + 1);
  }
  const rawDistinct = Array.from(distinctMap.values());

  // Phase 2a — deterministic label unification (lib/category/canonicalize.ts).
  const det = unifyLabels(rawDistinct, p => weightByKey.get(pathKey(p)) ?? 1);
  const mergeLog: MergeLogEntry[] = det.log.slice();
  const detByRawKey = new Map<string, string[]>();
  for (let i = 0; i < rawDistinct.length; i++) detByRawKey.set(pathKey(rawDistinct[i]), det.canonical[i]);
  const postDetMap = new Map<string, string[]>();
  for (const p of det.canonical) if (!postDetMap.has(pathKey(p))) postDetMap.set(pathKey(p), p);
  const postDetPaths = Array.from(postDetMap.values());
  if (det.log.length > 0) {
    console.log(`[OrbitIQ] Deterministic canonicalization: ${rawDistinct.length} → ${postDetPaths.length} distinct paths (${det.log.length} label merges)`);
  }

  // Phase 2b — chunked LLM canonicalization (never skipped; alphabetical sort
  // co-locates related paths in the same chunk; established nodes carry forward).
  // v7.345: chunk cut 250 → 150 and max_tokens 8000 → 12000. At 250 paths the
  // {index,path} array overran 8000 output tokens and the JSON truncated
  // mid-array (live: "Expected ',' or ']' … position ~25000"), so the WHOLE
  // chunk fell back to its deterministic paths. 150 paths fit comfortably inside
  // 12000 tokens, and a salvage parser (mirrors discovery, Const I.5) recovers
  // every complete object from any clipped tail instead of dropping the chunk.
  const CANON_CHUNK = 150;
  const llmByDetKey = new Map<string, string[]>();
  if (postDetPaths.length > 1) {
    const sorted = postDetPaths.slice().sort((a, b) => (pathKey(a) < pathKey(b) ? -1 : 1));
    const canonTotal = Math.ceil(sorted.length / CANON_CHUNK);

    // v7.345: RESUME consolidation. Chunk offsets are stable — `sorted` is a pure
    // function of the fully-checkpointed discovery — so a chunk start already in
    // chunksDone is skipped and its saved mapping reused. Each 300s window
    // advances a few chunks instead of restarting the whole phase (Const IV.2).
    const canonState = progress?.canon;
    const chunksDone = new Set<number>(canonState?.chunksDone ?? []);
    for (const [k, v] of canonState?.mappings ?? []) llmByDetKey.set(k, [...v]);

    const established: string[] = [...(canonState?.established ?? [])];
    const establishedSeen = new Set<string>(established);
    const noteEstablished = (cp: string[]) => {
      const line = cp.slice(0, 2).join(' > ');
      if (line && !establishedSeen.has(line)) { establishedSeen.add(line); established.push(line); }
    };

    // Tolerant parse — salvage every COMPLETE {index,path} object from a clipped
    // response so a truncated tail still contributes (never drop the chunk).
    const parseCanon = (text: string): Array<{ index: number; path: string[] }> => {
      try {
        const parsed = extractJSON<{ canonical: Array<{ index: number; path: string[] }> }>(text);
        if (Array.isArray(parsed?.canonical) && parsed.canonical.length > 0) return parsed.canonical;
      } catch { /* fall through to salvage */ }
      const out: Array<{ index: number; path: string[] }> = [];
      const re = /\{[^{}]*?"index"\s*:\s*\d+[^{}]*?"path"\s*:\s*\[[^\]]*\][^{}]*?\}/g;
      for (const m of text.match(re) ?? []) { try { out.push(JSON.parse(m)); } catch { /* skip */ } }
      return out;
    };

    // Persist canon progress via the discovery checkpoint channel (persistCheckpoint
    // merges cumulatively, so this rides alongside proposed/doneStarts without
    // clobbering completed passes). Called after every chunk → resumable + the
    // analyzing screen / auto-resume see forward progress during consolidation.
    const persistCanon = async () => {
      if (!onProgress) return;
      await onProgress({
        proposed:   rawAssigns,
        doneStarts: Array.from(doneStarts),
        canon: {
          total:       canonTotal,
          chunksDone:  Array.from(chunksDone),
          mappings:    Array.from(llmByDetKey.entries()),
          established,
        },
      });
    };

    for (let c = 0; c < sorted.length; c += CANON_CHUNK) {
      if (chunksDone.has(c)) continue;   // finished in an earlier window — skip (no re-spend)
      const chunk = sorted.slice(c, c + CANON_CHUNK);
      try {
        // v7.341: carry cap 250 established nodes so cross-chunk siblings align.
        const cPrompt   = pathCanonicalizationPrompt(domain, industry, chunk, established.slice(0, 250));
        const cResponse = await getClient().messages.create({
          model:      MODELS.fast,
          max_tokens: 12000,
          messages:   [{ role: 'user', content: cPrompt }],
        }, { timeout: 60_000 });
        const cText = cResponse.content[0].type === 'text' ? cResponse.content[0].text : '';
        for (const cc of parseCanon(cText)) {
          const idx = cc?.index;
          if (!Number.isInteger(idx) || idx < 0 || idx >= chunk.length) continue;
          const cp = cleanPath(cc?.path);
          if (cp.length) { llmByDetKey.set(pathKey(chunk[idx]), cp); noteEstablished(cp); }
        }
      } catch (err) {
        // v7.345: a chunk that STILL fails after salvage keeps its deterministic
        // paths AND is marked done below — otherwise every resume retried it
        // forever and the run could never finish (Const I.5: never silent, and
        // never an infinite loop). The deterministic paths are always kept.
        console.error('[OrbitIQ] Canonicalization chunk failed (deterministic paths kept, marked done):', (err as any)?.message);
        for (const p of chunk) noteEstablished(p);
      }
      chunksDone.add(c);
      await persistCanon();   // per-chunk checkpoint
    }
    console.log(`[OrbitIQ] Path canonicalization: ${postDetPaths.length} distinct paths in ${canonTotal} chunk(s), ${chunksDone.size} done`);
  }

  // Compose raw → deterministic → LLM-canonical, logging each LLM change.
  const canonByRawKey = new Map<string, string[]>();
  const loggedKeys = new Set<string>();
  for (const e of mergeLog) loggedKeys.add(e.from + '→' + e.to);
  for (const [rawKey, rawPath] of Array.from(distinctMap.entries())) {
    const detPath   = detByRawKey.get(rawKey) ?? rawPath;
    const finalPath = llmByDetKey.get(pathKey(detPath)) ?? detPath;
    canonByRawKey.set(rawKey, finalPath);
    const fromKey = pathKey(detPath), toKey = pathKey(finalPath);
    if (fromKey !== toKey && !loggedKeys.has(fromKey + '→' + toKey)) {
      loggedKeys.add(fromKey + '→' + toKey);
      mergeLog.push({ from: fromKey, to: toKey, kind: classifyMerge(detPath, finalPath) });
    }
  }

  // ── Phase 2c (v7.341): SIBLING AUDIT — merge same-concept sibling sub-topics ──
  // Chunking sees paths in slices, so two nodes meaning the same thing can survive
  // as SIBLINGS under one parent ("Loan Interest Rates" beside "Mortgage Rates" —
  // found in the first v7.339 rebuild). This pass reviews each parent WITH its
  // full child list — names only, one bounded call (chunked past 200 groups) —
  // and the merges are applied + logged here in TypeScript (Const III.1e).
  try {
    const canonKeys = Array.from(canonByRawKey.keys());
    const distinctCanon = new Map<string, string[]>();
    for (const k of canonKeys) {
      const p = canonByRawKey.get(k)!;
      const pk = pathKey(p);
      if (!distinctCanon.has(pk)) distinctCanon.set(pk, p);
    }
    const groups = buildSiblingGroups(Array.from(distinctCanon.values()))
      .filter(g => g.parentPath[0] !== OTHER_NAME);
    const GROUP_CHUNK = 200;
    const merges: SiblingMerge[] = [];
    for (let c = 0; c < groups.length; c += GROUP_CHUNK) {
      const gChunk = groups.slice(c, c + GROUP_CHUNK);
      const sPrompt   = siblingAuditPrompt(domain, industry, gChunk.map(g => ({ parent: g.parent, children: g.children })));
      const sResponse = await getClient().messages.create({
        model:      MODELS.fast,
        max_tokens: 4000,
        messages:   [{ role: 'user', content: sPrompt }],
      }, { timeout: 60_000 });
      const sText   = sResponse.content[0].type === 'text' ? sResponse.content[0].text : '';
      const sParsed = extractJSON<{ merges: Array<{ group: number; from: string; to: string }> }>(sText);
      for (const m of sParsed.merges ?? []) {
        const gi = m?.group;
        if (!Number.isInteger(gi) || gi < 0 || gi >= gChunk.length) continue;
        const g = gChunk[gi];
        const from = String(m?.from ?? '').trim();
        const to   = String(m?.to ?? '').trim();
        // Guard: both must be real children of that parent, and different nodes.
        if (!from || !to || from === to) continue;
        if (g.children.indexOf(from) < 0 || g.children.indexOf(to) < 0) continue;
        merges.push({ parentPath: g.parentPath, from, to });
      }
    }
    if (merges.length > 0) {
      for (const [rawKey, p] of Array.from(canonByRawKey.entries())) {
        const applied = applySiblingMerges([p], merges);
        canonByRawKey.set(rawKey, applied.paths[0]);
        for (const e of applied.log) {
          if (!loggedKeys.has(e.from + '→' + e.to)) { loggedKeys.add(e.from + '→' + e.to); mergeLog.push(e); }
        }
      }
      console.log(`[OrbitIQ] Sibling audit: ${merges.length} sibling merge(s) applied across ${groups.length} group(s)`);
    } else {
      console.log(`[OrbitIQ] Sibling audit: ${groups.length} group(s) reviewed, no duplicates found`);
    }
  } catch (err) {
    // Never fatal — the tree simply keeps the chunked result (Const I.5).
    console.error('[OrbitIQ] Sibling audit failed (skipped):', (err as any)?.message);
  }

  // ── Phase 3: per-keyword canonical PATH + derived flat category (back-compat) ──
  // keywordPaths is the new stored taxonomy. We ALSO derive the flat `keywordCategories`
  // (theme level) + `categories` + umbrella `parent`, so the 14 existing consumers
  // (ThemeClusters, Journey, Content, brand guard, etc.) keep working unchanged.
  const pathByIndex = new Map<number, string[]>();
  const typeByIndex = new Map<number, CatType>();
  // v7.235: classification metadata per index (first assignment wins, same as the path).
  const metaByIndex = new Map<number, { modifier?: string; intent?: string; confidence?: number; reasoning?: string }>();
  for (const r of rawAssigns) {
    if (!merged[r.index] || pathByIndex.has(r.index)) continue;
    pathByIndex.set(r.index, canonByRawKey.get(pathKey(r.path)) ?? r.path);
    typeByIndex.set(r.index, r.type);
    metaByIndex.set(r.index, { modifier: r.modifier, intent: r.intent, confidence: r.confidence, reasoning: r.reasoning });
  }
  for (let i = 0; i < merged.length; i++) {
    if (!pathByIndex.has(i)) {
      pathByIndex.set(i, [OTHER_NAME]); typeByIndex.set(i, 'procedure');
      // v7.339: an unplaced keyword (batch failed twice, or the model skipped the
      // index) is never silent — it lands in Other FLAGGED for review (Const I.5).
      metaByIndex.set(i, { confidence: 0, reasoning: 'not placed by discovery — auto-filed to Other, needs review' });
    }
  }

  // v7.342: DETERMINISTIC domain-name → brand override. A keyword that IS a bare
  // domain ("realtor.com", "zillow.com") is a navigational brand search by
  // definition — found live filed inside a product category ("realtor.com" at 12M
  // inside Mortgages, flagged 25% confidence). A TypeScript rule beats a model
  // judgment here: exact, repeatable, no cost (Const III.1a-adjacent; labels only).
  {
    const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.(com|net|org|io|co|us|ca)$/;
    let overridden = 0;
    for (let i = 0; i < merged.length; i++) {
      const kwLow = (merged[i]?.keyword ?? '').toLowerCase().trim();
      if (!DOMAIN_RE.test(kwLow)) continue;
      const stem  = kwLow.replace(/\.(com|net|org|io|co|us|ca)$/, '');
      const label = stem.charAt(0).toUpperCase() + stem.slice(1) + ' Brand Searches';
      pathByIndex.set(i, [label]);
      typeByIndex.set(i, 'brand');
      metaByIndex.set(i, { intent: 'navigational', confidence: 100, reasoning: 'bare domain name — deterministic brand rule (v7.342)' });
      overridden++;
    }
    if (overridden > 0) console.log(`[OrbitIQ] Domain-brand rule: ${overridden} bare-domain keyword(s) typed as brand searches`);
  }

  const keywordPaths: Record<string, string[]> = {};
  const keywordMeta: Record<string, { modifier?: string; intent?: string; confidence?: number; reasoning?: string; needsReview?: boolean }> = {};
  const assignmentByIndex = new Map<number, string>();              // → derived category (theme)
  const catTypeByName     = new Map<string, CatType>();
  const umbrellaByCat     = new Map<string, string>();             // category (theme) → umbrella (path[0])
  // v7.326: per-UMBRELLA client-footprint keyword count + the set of brand/location umbrellas,
  // used to classify each umbrella core (client competes) vs adjacent (competitor-only). EVERY
  // umbrella is seeded to 0 so a competitor-only vertical (zero client keywords) is still scored.
  const clientKwByUmbrella = new Map<string, number>();
  const navUmbrellas       = new Set<string>();
  for (let i = 0; i < merged.length; i++) {
    const kw = merged[i]; if (!kw) continue;
    const P    = pathByIndex.get(i)!;
    const type = typeByIndex.get(i)!;
    keywordPaths[kw.keyword.toLowerCase()] = P;
    // v7.235: store the separated modifier + classification metadata. needsReview derives
    // from the confidence self-estimate (< 80 → review; Const III.7). Only set keys that
    // exist so pre-classified keywords stay clean.
    const m = metaByIndex.get(i);
    if (m && (m.modifier || m.intent || m.confidence != null || m.reasoning)) {
      const entry: { modifier?: string; intent?: string; confidence?: number; reasoning?: string; needsReview?: boolean } = {};
      if (m.modifier)        entry.modifier   = m.modifier;
      if (m.intent)          entry.intent     = m.intent;
      if (m.confidence != null) { entry.confidence = m.confidence; entry.needsReview = m.confidence < 80; }
      if (m.reasoning)       entry.reasoning  = m.reasoning;
      keywordMeta[kw.keyword.toLowerCase()] = entry;
    }
    const umbrella = P[0];
    // Theme = the level other panels treat as the "category": for a procedure that's the
    // node under the umbrella (path[1]); brand/location stay at their top node (path[0]).
    const cat = (type === 'procedure' && P.length >= 2) ? P[1] : P[0];
    assignmentByIndex.set(i, cat);
    if (!catTypeByName.has(cat))   catTypeByName.set(cat, type);
    if (!umbrellaByCat.has(cat))   umbrellaByCat.set(cat, umbrella);
    // v7.326: tally client presence per umbrella for the scope gate. A keyword is "client
    // footprint" when the client ranks/owns it (clientPosition !== null); gap keywords
    // (competitor-only) are null and do NOT count toward an umbrella's client presence.
    if (umbrella) {
      if (!clientKwByUmbrella.has(umbrella)) clientKwByUmbrella.set(umbrella, 0);
      if (kw.clientPosition !== null) clientKwByUmbrella.set(umbrella, clientKwByUmbrella.get(umbrella)! + 1);
      if (type === 'brand' || type === 'location') navUmbrellas.add(umbrella);
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
  result.keywordMeta  = keywordMeta;   // v7.235: separated modifier + intent/confidence/reasoning/needsReview
  // v7.339 (Const III.1e): persist the merge log (bounded), the skeleton the batches
  // anchored to, and the engine tag. The Keyword panel renders the log so every
  // auto-applied merge is visible (Wayne: auto-apply, log it).
  if (mergeLog.length > 0) result.mergeLog = mergeLog.slice(0, MERGE_LOG_CAP);
  if (skeleton) result.taxonomySkeleton = skeleton;
  result.taxonomyEngine = 'anchored-v1';
  if (failedBatchStarts.size > 0) {
    console.log(`[OrbitIQ] Discovery: ${failedBatchStarts.size} batch(es) failed after retry — their keywords are in Other, flagged needs-review`);
  }
  for (const c of result.categories) {
    if (c.type !== 'procedure' || c.name === OTHER_NAME) continue;
    const umbrella = umbrellaByCat.get(c.name);
    c.parent = (umbrella && umbrella.length > 0) ? umbrella : c.name;
  }
  {
    const umbrellas = new Set(result.categories.filter(c => c.parent).map(c => c.parent));
    console.log(`[OrbitIQ] Taxonomy: ${Object.keys(keywordPaths).length} keyword paths, ${umbrellas.size} umbrella(s)`);
  }

  // ── v7.326: scope gate — classify each umbrella core vs adjacent ────────────
  // Footprint-derived AUTO classification (the per-project promote/demote override is applied
  // later at read time, so a promote takes effect without re-analysis). Brand/location/Other
  // umbrellas are never gated. Stored on the breakdown so the gate reads it (Const II.8).
  result.umbrellaScope = classifyUmbrellaScopes(clientKwByUmbrella, navUmbrellas);
  {
    const adj = Object.entries(result.umbrellaScope).filter(([, s]) => s === 'adjacent').map(([n]) => n);
    console.log(`[OrbitIQ] Scope: ${Object.keys(result.umbrellaScope).length} umbrella(s), ${adj.length} adjacent (competitor-only)${adj.length ? ` — ${adj.slice(0, 6).join(', ')}${adj.length > 6 ? '…' : ''}` : ''}`);
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
  // v7.339 (Const III.1e): distinct canonical paths from the project's previous
  // completed analysis — the skeleton anchors to them so category names stay
  // stable across re-analyses. Null/absent on a first analysis.
  priorPaths?: string[][] | null,
): Promise<SynthesisResult> {
  console.log(`[OrbitIQ] Starting synthesis for ${domain}${Object.keys(cached).length > 0 ? ` (resuming — cached: ${Object.keys(cached).join(', ')})` : ''}`);

  // v7.346 hotfix: wall-clock start so the LLM probe below can be time-boxed and never
  // let this function hit Vercel's 300s hard kill mid-probe (which checkpointed nothing
  // and looped forever — the "stuck at batch 0 of 58" incident).
  const synthStartMs = Date.now();

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
          priorPaths ?? null,   // v7.339: prior-taxonomy anchor (Const III.1e)
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
    // v7.274: cap probe input at the top 30 procedure categories by demand.
    // The probe sends 6 prompts/category (5 unbranded + 1 branded) × 2 platforms.
    // This cap is a deliberate, Wayne-requested runtime exception (Const I.6).
    const probeCategories = categoryBreakdown.categories
      .filter(c => c.type === 'procedure' && c.name !== 'Other')
      .sort((a, b) => b.monthlyDemand - a.monthlyDemand)
      .slice(0, 30)
      .map(c => ({ name: c.name, monthlyDemand: c.monthlyDemand }));

    // v7.346 hotfix: TIME-BOX the probe. On a large project the probe can exceed the
    // remaining Lambda budget; before this fix the 300s hard kill fired mid-probe,
    // nothing was checkpointed, and every resume restarted it — an infinite 504 loop
    // (the "stuck at batch 0 of 58" incident). Now the probe races a wall-clock deadline
    // that keeps a safety margin under maxDuration (300s). If it can't finish in time,
    // the brief completes with the previous probe (or an honest empty gap, Const I.5) and
    // a later run backfills — the function ALWAYS returns cleanly, so the run finishes and
    // the brief renders instead of looping forever.
    const PROBE_SAFETY_MS = 250_000;                       // return well under the 300s kill
    const remainingMs = PROBE_SAFETY_MS - (Date.now() - synthStartMs);
    if (remainingMs < 20_000) {
      console.warn(`[OrbitIQ] LLM probe skipped this window — only ${Math.round(remainingMs / 1000)}s left; brief completes with prior/empty probe, backfills later (Const I.5)`);
      llmProbe = profound ?? null;
    } else {
      const budget = new Promise<{ __timeout: true }>(res => setTimeout(() => res({ __timeout: true }), remainingMs));
      const raced: any = await Promise.race([
        getLLMProbeSnapshotV2(clientName, domain, industry, probeCategories)
          .catch(err => { console.error('[OrbitIQ] LLM probe v2 failed (using previous probe data):', err); return (profound ?? null) as any; }),
        budget,
      ]);
      if (raced && raced.__timeout === true) {
        console.warn(`[OrbitIQ] LLM probe exceeded its ${Math.round(remainingMs / 1000)}s budget — completing brief with prior/empty probe, backfills on a later run (Const I.5)`);
        llmProbe = profound ?? null;
      } else {
        llmProbe = raced;
      }
    }
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
