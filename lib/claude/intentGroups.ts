/**
 * lib/claude/intentGroups.ts — v7.199
 *
 * AI SEARCH-INTENT grouping + brand cleanup for the cluster panel.
 *
 * Wayne's rule: a cluster = a SINGLE search intent (one answerable question) mapped
 * to ONE page, named topically ("What is a 529 Plan", "401k vs IRA"). The in-panel
 * heuristic (v7.197) groups by shared WORDS, so it can't merge synonyms
 * ("529 account" ≈ "529 college plan" ≈ "college savings 529") or recognise arbitrary
 * brand names ("schwab", "charles schwab 529"). This module asks Claude to do exactly
 * that, per category, and returns a small JSON contract the panel + keyword pool
 * consume:
 *
 *   intentGroups : Array<{ category, name, stage, keywords[] }>   (synonyms merged)
 *   brandKeywords: string[]                                       (brands to drop)
 *
 * DEFENSIBILITY: the AI only GROUPS and NAMES and FLAGS BRANDS — it never invents a
 * keyword or a volume. Validation drops anything the model returns that wasn't in the
 * input, and any input keyword the model didn't place is simply left out of
 * intentGroups (the panel falls back to the heuristic for it) — so no keyword is ever
 * lost and every group volume stays an exact roll-up of real members.
 */

import Anthropic from '@anthropic-ai/sdk';
import { instrumentAnthropic } from '@/lib/usage/record';

export type Stage = 'awareness' | 'consideration' | 'decision' | 'retention';
const STAGES: Stage[] = ['awareness', 'consideration', 'decision', 'retention'];

export interface IntentGroupOut { category: string; name: string; stage: Stage; keywords: string[] }
export interface IntentGroupsResult {
  intentGroups:  IntentGroupOut[];
  brandKeywords: string[];
  intentEngine:  string;          // version tag so stale results can be invalidated
  categoriesDone: string[];       // which categories were processed (resume support)
}

export interface CategoryInput {
  name: string;
  type: 'procedure' | 'brand' | 'location' | string;
  keywords: Array<{ keyword: string; searchVolume?: number }>;
}

export const INTENT_ENGINE = 'intent-ai-v1';

// Only PROCEDURE categories are intent-grouped (brand/location have no topical
// sub-intents worth merging). Tune-able cap keeps prompts and spend bounded.
const MAX_KW_PER_CATEGORY = 200;     // top-by-volume sent; rest fall back to heuristic
const KW_BUDGET_PER_CALL  = 140;     // batch categories until this many keywords
const MAX_CATS_PER_CALL   = 25;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.');
  }
  return instrumentAnthropic(new Anthropic({ apiKey }));   // v7.225: auto-record token usage
}

// haiku — fast/cheap structured JSON; a project can have hundreds of categories.
const MODEL = 'claude-haiku-4-5-20251001';

function extractJSON<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.search(/[[{]/);
  if (start < 0) throw new Error('No JSON found in model response');
  // balance from the first bracket to its match
  const open = raw[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  const slice = end > start ? raw.slice(start, end + 1) : raw.slice(start);
  return JSON.parse(slice) as T;
}

function normStage(s: any): Stage {
  const v = String(s ?? '').toLowerCase().trim();
  return (STAGES as string[]).includes(v) ? (v as Stage) : 'awareness';
}

function buildPrompt(clientDomain: string, cats: CategoryInput[]): string {
  const blocks = cats.map((c, i) => {
    const kws = c.keywords
      .slice()
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, MAX_KW_PER_CATEGORY)
      .map(k => k.keyword);
    return `Category ${i + 1}: "${c.name}"\nKeywords:\n${kws.map(k => `- ${k}`).join('\n')}`;
  }).join('\n\n');

  return [
    `You are an SEO content strategist grouping keywords by SEARCH INTENT.`,
    `The client website is "${clientDomain}".`,
    ``,
    `For EACH category below, group its keywords so that keywords sharing the SAME`,
    `underlying search intent — the same question/need that ONE single web page would`,
    `answer — are in the same group. MERGE SYNONYMS aggressively: e.g. "529 account",`,
    `"529 college plan" and "college savings 529" are the same intent (a 529 plan`,
    `overview) and belong in ONE group. "ira vs 401k", "401k vs ira" and "explain the`,
    `difference between a 401k and an ira" are ONE group.`,
    ``,
    `Give each group a short, specific, Title-Case NAME describing the intent/topic,`,
    `e.g. "What is a 529 Plan", "529 vs Coverdell ESA", "529 Withdrawal Rules",`,
    `"401k vs IRA", "401k Contribution Limits". NOT a bare keyword modifier.`,
    `Assign each group ONE funnel STAGE: awareness, consideration, decision, or retention.`,
    ``,
    `Separately, identify BRAND keywords: any keyword containing a company or product`,
    `BRAND that is NOT the client "${clientDomain}" — competitors, providers, or other`,
    `companies (e.g. "schwab 529", "charles schwab 529", "vanguard 529", "fidelity`,
    `401k"). List those under brandKeywords and DO NOT put them in any group.`,
    ``,
    `RULES: use ONLY keywords exactly as given (copy them verbatim, lowercase).`,
    `Every non-brand keyword should appear in exactly one group. Do not invent keywords.`,
    ``,
    blocks,
    ``,
    `Return STRICT JSON only, no prose, in this shape:`,
    `{"categories":[{"category":"<exact category name>","groups":[{"name":"...","stage":"awareness","keywords":["kw","kw"]}],"brandKeywords":["kw"]}]}`,
  ].join('\n');
}

interface RawCat { category?: string; groups?: Array<{ name?: string; stage?: string; keywords?: string[] }>; brandKeywords?: string[] }

// Process one batch (≤ a few categories) through the model and validate against input.
async function runBatch(
  clientDomain: string,
  cats: CategoryInput[],
): Promise<{ groups: IntentGroupOut[]; brand: string[] }> {
  const res = await getClient().messages.create({
    model:      MODEL,
    max_tokens: 4096,
    messages:   [{ role: 'user', content: buildPrompt(clientDomain, cats) }],
  });
  const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = extractJSON<{ categories?: RawCat[] }>(text);

  const groups: IntentGroupOut[] = [];
  const brand: string[] = [];
  const byName = new Map<string, CategoryInput>();
  for (const c of cats) byName.set(c.name.toLowerCase(), c);

  for (const rc of (parsed.categories ?? [])) {
    const cat = byName.get(String(rc.category ?? '').toLowerCase());
    if (!cat) continue;
    const valid = new Set(cat.keywords.map(k => k.keyword.toLowerCase().trim()));
    const usableBrand = (rc.brandKeywords ?? [])
      .map(k => String(k).toLowerCase().trim())
      .filter(k => valid.has(k));
    for (const b of usableBrand) brand.push(b);
    const brandSet = new Set(usableBrand);

    for (const g of (rc.groups ?? [])) {
      const name = String(g?.name ?? '').trim();
      const kws = (g?.keywords ?? [])
        .map(k => String(k).toLowerCase().trim())
        .filter(k => valid.has(k) && !brandSet.has(k));
      if (!name || kws.length === 0) continue;
      groups.push({ category: cat.name, name, stage: normStage(g?.stage), keywords: kws });
    }
  }
  return { groups, brand };
}

/**
 * Group the given categories by search intent. Procedure categories only. Batched to
 * bound prompt size + spend; reports progress per batch. `done` lists category names
 * already processed (skip them — supports resume across invocations).
 */
export async function groupCategoriesByIntent(
  categories: CategoryInput[],
  clientDomain: string,
  onProgress?: (done: number, total: number, label: string) => void,
  alreadyDone: string[] = [],
): Promise<IntentGroupsResult> {
  const skip = new Set(alreadyDone.map(s => s.toLowerCase()));
  const todo = categories.filter(c =>
    c.type === 'procedure' && c.keywords.length > 0 && !skip.has(c.name.toLowerCase()));

  // Build batches: accumulate categories until the keyword budget or count cap.
  const batches: CategoryInput[][] = [];
  let cur: CategoryInput[] = [];
  let curKw = 0;
  for (const c of todo) {
    const n = Math.min(c.keywords.length, MAX_KW_PER_CATEGORY);
    if (cur.length > 0 && (curKw + n > KW_BUDGET_PER_CALL || cur.length >= MAX_CATS_PER_CALL)) {
      batches.push(cur); cur = []; curKw = 0;
    }
    cur.push(c); curKw += n;
  }
  if (cur.length > 0) batches.push(cur);

  const intentGroups: IntentGroupOut[] = [];
  const brandKeywords: string[] = [];
  const categoriesDone: string[] = alreadyDone.slice();
  const total = todo.length;
  let done = 0;

  for (const batch of batches) {
    try {
      const { groups, brand } = await runBatch(clientDomain, batch);
      for (const g of groups) intentGroups.push(g);
      for (const b of brand) brandKeywords.push(b);
    } catch (err) {
      // Fault-tolerant (same principle as the other API calls): a failed batch just
      // means those categories fall back to the heuristic — never break the whole run.
      console.error('[OrbitIQ] intent-group batch failed:', (err as any)?.message ?? err);
    }
    for (const c of batch) categoriesDone.push(c.name);
    done += batch.length;
    if (onProgress) onProgress(done, total, batch[0]?.name ?? '');
  }

  return {
    intentGroups,
    brandKeywords: Array.from(new Set(brandKeywords)),
    intentEngine:  INTENT_ENGINE,
    categoriesDone,
  };
}
