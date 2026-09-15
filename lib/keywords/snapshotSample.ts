/**
 * lib/keywords/snapshotSample.ts — v7.491 (Const II.9, II.7)
 *
 * Pulling a handful of keyword STRINGS out of a stored snapshot used to mean
 * loading the snapshot. Three routes did exactly that, and two of them loaded
 * the project row in the same response to do it — the shape that broke the
 * Assessment PDF at v7.490 (Neon refuses any single response over 64 MiB).
 *
 * The sample is extracted in Postgres instead, so only the strings cross the
 * wire: `jsonb_array_elements … WITH ORDINALITY` over the snapshot's array,
 * LIMITed server-side. TD Bank's newest `semrush_snapshot` is 2,850,673 bytes
 * and the callers want 120–140 keywords out of it.
 *
 * The array guard is not decoration. Every caller previously tested
 * `Array.isArray(snap?.topKeywords)` and fell back to `[]`; `jsonb_array_elements`
 * THROWS on a non-array, so a snapshot missing the field (or holding an object)
 * would 500 where it used to return an honest empty (Const I.5). The
 * `jsonb_typeof(...) = 'array'` CASE preserves the old behaviour exactly.
 *
 * Shared rather than copied: v7.459's lesson is that two call sites reading one
 * format WILL drift (Const II.7).
 */

import { db } from '@/db';
import { sql } from 'drizzle-orm';

/** drizzle's neon-http driver returns `{ rows }`; some versions return the array
 *  directly. Both shapes are handled the same way elsewhere in this app. */
function rowsOf(res: any): any[] {
  return (res?.rows ?? res ?? []) as any[];
}

/**
 * The id of a project's most recent analysis — scalar column only, no snapshot.
 * Mirrors the old `with: { analyses: { orderBy: desc(triggeredAt), limit: 1 } }`
 * exactly, INCLUDING the absence of a status filter: callers that sampled the
 * newest row regardless of status keep doing so.
 */
export async function newestAnalysisId(projectId: string): Promise<string | null> {
  const res = await db.execute(sql`
    SELECT id
      FROM analyses
     WHERE project_id = ${projectId}::uuid
     ORDER BY triggered_at DESC
     LIMIT 1
  `);
  const id = rowsOf(res)[0]?.id;
  return id ? String(id) : null;
}

/**
 * The first `limit` keyword strings of one snapshot array field, in STORED
 * ORDER — the same rows `snap[field].slice(0, limit).map(k => k.keyword)` used
 * to produce. Empty (never an error) when the analysis, the snapshot or the
 * field is absent or is not an array.
 */
export async function snapshotKeywordSample(
  analysisId: string,
  field: 'topKeywords' | 'gapKeywords',
  limit: number,
): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT e.value ->> 'keyword' AS keyword
      FROM analyses a
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(a.semrush_snapshot -> ${field}::text) = 'array'
             THEN a.semrush_snapshot -> ${field}::text
             ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(value, ord)
     WHERE a.id = ${analysisId}::uuid
     ORDER BY e.ord
     LIMIT ${limit}
  `);
  return rowsOf(res).map(r => String(r?.keyword ?? '')).filter(Boolean);
}

/**
 * The `limit` highest-VOLUME keywords of `topKeywords`, which is a different
 * question from the one above and the one `/api/serp-compare` asks. Volume is
 * read as a number with a 0 fallback, matching the old
 * `(Number(k?.searchVolume) || 0)` comparator. Ties are not stably ordered
 * (Postgres makes no such guarantee where JS sort did) — acceptable because
 * every caller uses this as a SAMPLE, never as a ranking shown to anyone.
 */
export async function snapshotTopKeywordsByVolume(
  analysisId: string,
  limit: number,
): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT e.value ->> 'keyword' AS keyword
      FROM analyses a
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(a.semrush_snapshot -> 'topKeywords') = 'array'
             THEN a.semrush_snapshot -> 'topKeywords'
             ELSE '[]'::jsonb END
      ) AS e(value)
     WHERE a.id = ${analysisId}::uuid
     ORDER BY CASE
                WHEN e.value ->> 'searchVolume' ~ '^-?[0-9]+(\\.[0-9]+)?$'
                THEN (e.value ->> 'searchVolume')::numeric
                ELSE 0
              END DESC
     LIMIT ${limit}
  `);
  return rowsOf(res).map(r => String(r?.keyword ?? '')).filter(Boolean);
}
