/**
 * lib/clusters/intentAssign.ts — v7.376
 *
 * The Layer-2 Claude intent-assignment pass, factored out of
 * app/api/projects/[id]/clusters/route.ts so BOTH that route and the
 * assessment-report route run the identical classification (Const II.7),
 * and so the resulting map can be PERSISTED server-side.
 *
 * Why persistence: the assignments previously lived only in the browser's
 * localStorage (cache key `orbitiq-cluster-assigns-<analysisId>`). Server-side
 * canonical builds (the PDF report) would otherwise run with an EMPTY map —
 * the exact v7.220 bug class where the Journey under-counted (617 vs 2,514)
 * because a canonical view was fed `{}`. The map is now stored additively at
 * `analyses.semrushSnapshot._clusterAssigns` (same JSONB pattern as
 * `_demandUniverse` / `_localScan`), and every reader — the page, the panels,
 * the report — prefers the stored map so they can never diverge.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { analyses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { detectIntentSignal, type IntentType } from '@/lib/clusters/canonical';

export type AssignMap = Record<string, IntentType>;

/** The exact pool the page submits for classification: every unique footprint +
 *  gap keyword that Layer-1 signal matching could NOT classify. (Mirrors the
 *  page-level effect added in v7.220 — same source rows, same skip rule.) */
export function buildIntentPool(snap: any): string[] {
  const pool: string[] = [];
  const seen = new Set<string>();
  for (const kw of [...(snap?.topKeywords ?? []), ...(snap?.gapKeywords ?? [])]) {
    const k = kw?.keyword?.toLowerCase();
    if (k && !seen.has(k) && !detectIntentSignal(kw.keyword)) { pool.push(kw.keyword); seen.add(k); }
  }
  return pool;
}

function extractJSON<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const match = cleaned.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('Non-JSON response');
  }
}

/** The Layer-2 Claude pass — moved VERBATIM from the clusters route (model,
 *  cap, prompt and validation unchanged). Caller supplies its own (usage-
 *  instrumented) Anthropic client so token attribution keeps working. */
export async function classifyIntents(
  client: Anthropic,
  keywords: string[],
  industry: string,
  domain: string,
): Promise<AssignMap> {
  if (!keywords?.length) return {};
  const capped = keywords.slice(0, 200);
  const kwList = capped.map((kw, i) => `${i}. ${kw}`).join('\n');

  const prompt = `You are classifying search keywords by search intent for a ${industry} website (${domain}).

For each keyword assign exactly one intent type:
- "informational"  — learning/research queries (what is, how does, guide, recovery time, risks, types of)
- "commercial"     — evaluation/comparison queries (reviews, best, cost, worth it, compare, before after, results)
- "transactional"  — action-ready queries (near me, schedule, book, appointment, price, financing, locations)
- "navigational"   — direct brand navigation queries (contains the brand name or specific product name with no research intent)

KEYWORDS:
${kwList}

Return JSON only — no markdown, no explanation:
{
  "assignments": {
    "keyword text exactly as given": "informational",
    "another keyword": "transactional"
  }
}`;

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages:   [{ role: 'user', content: prompt }],
  }, { timeout: 30_000 });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const parsed = extractJSON<{ assignments: Record<string, string> }>(text);

  const VALID_INTENTS = new Set<string>(['informational', 'commercial', 'transactional', 'navigational']);
  const assignments: AssignMap = {};
  for (const [kw, intent] of Object.entries(parsed.assignments ?? {})) {
    if (VALID_INTENTS.has(intent)) {
      assignments[kw.toLowerCase()] = intent as IntentType;
    }
  }
  return assignments;
}

/** Merge-persist an assignment map into the analysis snapshot at
 *  `_clusterAssigns` (additive JSONB — no schema change). Existing keys are
 *  kept unless the new map re-assigns them, so partial passes accumulate. */
export async function persistClusterAssigns(analysisId: string, assigns: AssignMap): Promise<void> {
  if (!analysisId || !assigns || Object.keys(assigns).length === 0) return;
  const row = await db.query.analyses.findFirst({ where: eq(analyses.id, analysisId) });
  if (!row) return;
  const snap = ((row as any).semrushSnapshot ?? {}) as any;
  const merged = { ...(snap._clusterAssigns ?? {}), ...assigns };
  await db.update(analyses)
    .set({ semrushSnapshot: { ...snap, _clusterAssigns: merged } as any })
    .where(eq(analyses.id, analysisId));
}
