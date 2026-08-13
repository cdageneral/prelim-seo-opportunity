// ─────────────────────────────────────────────────────────────────────────────
// lib/latestAnalysis.ts — v7.445
//
// ONE way to load "the newest analysis that carries a keyword snapshot"
// (Const II.7), and the reason it exists is a hard production failure.
//
// THE BUG: six routes did this —
//
//     const recent = await db.query.analyses.findMany({ ..., limit: 5 });
//     const analysis = recent.find(a => a.semrushSnapshot != null);
//
// which asks Postgres for FIVE COMPLETE analysis rows and throws four away. Each
// row carries the entire `semrushSnapshot` jsonb — every keyword, every stored
// SERP feature payload — so the response grows with the project. On First
// Citizens (7,040 scanned keywords with AIO/PAA/video payloads) five rows
// exceeded Neon's HTTP response cap and the driver refused the query outright:
//
//     NeonDbError: Server error (HTTP status 507):
//     response is too large (max is 67108864 bytes)
//
// The SERP scan then 500'd on every batch, and because each Resume re-ran the
// same oversized SELECT, resuming looped forever (Wayne, 2026-08-13). Nothing
// was wrong with the scan itself — it never got as far as scanning.
//
// THE FIX: never pull a row you are going to discard. Ask for the ID first —
// a few bytes, filtered and ordered in SQL — then fetch exactly one row.
// This keeps the response proportional to ONE snapshot instead of five, and it
// stops growing with the number of prior analyses.
// ─────────────────────────────────────────────────────────────────────────────

import { db }       from '@/db';
import { analyses } from '@/db/schema';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

/**
 * The id of the newest analysis for this project whose `semrushSnapshot` is
 * present. Filtering and ordering happen in SQL, so the response is one id.
 */
export async function latestAnalysisIdWithSnapshot(projectId: string): Promise<string | null> {
  const rows = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(and(eq(analyses.projectId, projectId), isNotNull(analyses.semrushSnapshot)))
    .orderBy(desc(analyses.triggeredAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The newest analysis row that carries a snapshot — exactly one row fetched,
 * never a batch that gets filtered client-side. Returns null when the project
 * has no analysis with keyword data (callers render the honest gap, I.5).
 */
export async function loadLatestAnalysisWithSnapshot(projectId: string): Promise<any | null> {
  const id = await latestAnalysisIdWithSnapshot(projectId);
  if (!id) return null;
  return (await db.query.analyses.findFirst({ where: eq(analyses.id, id) })) ?? null;
}
