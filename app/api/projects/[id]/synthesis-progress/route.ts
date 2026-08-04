/**
 * GET /api/projects/[id]/synthesis-progress?analysisId=…  — v7.343 · v7.351
 *
 * Tiny, cheap poll target for the analyzing screen (Const IV.2 — determinate
 * progress). Returns the REAL numbers from the server-side synthesis checkpoint:
 *
 *   { status, done, total, stage }
 *
 *   done / total — categorization batches + consolidation chunks + insight
 *                  milestones completed vs total (real counts, nothing modeled,
 *                  Const I.1)
 *   stage        — 'gathering' | 'categorizing' | 'consolidating' | 'insights'
 *                  | 'finalizing' | 'completed' | 'failed'
 *
 * ── v7.351: this route is now ACTUALLY cheap ──────────────────────────────────
 * The old handler called `db.query.analyses.findFirst`, which ships the ENTIRE
 * `semrush_snapshot` to the Lambda and JSON-parses it on EVERY 10-second poll.
 * On a large project that snapshot is several megabytes (1,400+ topKeywords +
 * gapKeywords + `_synthCheckpoint.cbProgress.proposed` [one object per keyword] +
 * `canon.mappings`), so the read ran for many seconds and the poll frequently
 * TIMED OUT. When the poll times out the client keeps its last value, so the
 * analyzing screen froze at its first reading ("batch 0 of 58") for the whole
 * ~10-minute run even though the engine was advancing — the "just spinning"
 * report (TD Bank, 2026-07-06). This query now extracts ONLY the small scalar
 * counts with Postgres jsonb operators, so the big arrays never leave the
 * database and the poll returns in milliseconds — the bar tracks real progress.
 * The done/total/stage math lives in lib/synthesis/progressMath.ts so it is
 * unit-tested without a DB (Const V.3/V.6).
 *
 * Read-only; never mutates. Any error → 200 with nulls (the screen falls back
 * to its elapsed-time display — honest fallback, Const I.5).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { computeSynthProgress, type SynthProgressRow } from '@/lib/synthesis/progressMath';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

// v7.403: the poll had no cache header at all. Progress that can be served from
// any cache is worse than no progress — it reads as a stall.
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

// SQL column list. Each expression pulls only a scalar out of the (possibly
// multi-MB) jsonb column — Postgres resolves the path server-side and ships
// nothing but the small result.
const cp  = sql`semrush_snapshot->'_synthCheckpoint'`;
const cbp = sql`semrush_snapshot->'_synthCheckpoint'->'cbProgress'`;
const SELECT_COLS = sql`
  id::text AS id,
  status AS status,
  (${cbp}->>'batchTotal')::int                                                AS batch_total,
  jsonb_array_length(COALESCE(${cbp}->'doneStarts','[]'::jsonb))              AS disc_done,
  (${cbp}->'canon'->>'total')::int                                           AS canon_total,
  jsonb_array_length(COALESCE(${cbp}->'canon'->'chunksDone','[]'::jsonb))     AS canon_done,
  jsonb_array_length(COALESCE(semrush_snapshot->'topKeywords','[]'::jsonb))   AS ranked_n,
  jsonb_array_length(COALESCE(semrush_snapshot->'gapKeywords','[]'::jsonb))   AS gap_n,
  (${cp}->'categoryBreakdown') IS NOT NULL                                    AS cb_done,
  (${cp}->'personas')          IS NOT NULL                                    AS personas_done,
  (${cp}->'llmProbe')          IS NOT NULL                                    AS probe_done,
  jsonb_array_length(COALESCE(${cp}->'opportunities','[]'::jsonb))            AS opps_done,
  (semrush_snapshot IS NOT NULL)                                             AS has_snap
`;

// ── v7.403: ONE query — the project's newest analysis ────────────────────────
// The old handler had TWO variants of the same SELECT: `WHERE id = $1` when the
// caller passed ?analysisId, and `WHERE project_id = $1 ORDER BY triggered_at
// DESC` otherwise. Measured live on 2026-08-04 against a project with exactly
// ONE analysis row — the same row for both — they disagreed:
//
//   ?analysisId=dd902630…  → { done: 0,   stage: 'categorizing'  }   ← WRONG
//   (no analysisId)        → { done: 424, stage: 'consolidating' }   ← correct
//
// The row genuinely held doneStarts=422 and canon 20/40 (read back through the
// project API), and the SELECT itself is correct — the exact drizzle template
// was run against a real Postgres with production-shaped data and returned
// 423/429. Only the by-id variant reads a stale, pre-checkpoint view of the row,
// and six distinct cache-busted URLs all returned it, so it is not an HTTP
// cache. WHY that read is stale is NOT explained at the application layer and is
// deliberately not guessed at here (Const I.1). What IS established is that the
// project-scoped read is live-correct, so it is now the only query.
//
// The caller's analysisId becomes an IDENTITY CHECK rather than a filter: the
// newest analysis of a project IS the run the panel just triggered, and if it
// somehow is not, `matchesRequested: false` says so instead of silently
// answering about a different run.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const analysisId = req.nextUrl.searchParams.get('analysisId');

    const res: any = await db.execute(
      sql`SELECT ${SELECT_COLS} FROM analyses WHERE project_id = ${params.id} ORDER BY triggered_at DESC LIMIT 1`,
    );

    const row: (SynthProgressRow & { id?: unknown }) | null = res?.rows?.[0] ?? res?.[0] ?? null;
    const rowId = row?.id != null ? String(row.id) : null;

    return NextResponse.json(
      {
        ...computeSynthProgress(row),
        analysisId:       rowId,
        // null = the caller did not name a run, so there is nothing to disagree with
        matchesRequested: analysisId ? (rowId === analysisId) : null,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    // Honest fallback — the screen shows elapsed time instead (Const I.5).
    return NextResponse.json(
      { status: null, done: null, total: null, stage: null, analysisId: null, matchesRequested: null },
      { headers: NO_STORE },
    );
  }
}
