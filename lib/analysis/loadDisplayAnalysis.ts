/**
 * lib/analysis/loadDisplayAnalysis.ts — v7.503
 *
 * ONE way for a non-page route to load "the analysis this project is displaying"
 * without ever putting a blob-bearing row in a query that can outgrow Neon's
 * 64 MiB per-response cap (Const II.9).
 *
 * The shape every route used before this was:
 *     db.query.analyses.findMany({ limit: 5 })  → pickDisplayAnalysis(...)
 * which selects EVERY column of five rows, snapshots included. On a project whose
 * one analysis is 63 MB (Sono Bello, measured 2026-09-17) that request returns
 * HTTP 507 and the route 500s with an empty body — what the Local panel showed as
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 *
 * Here the pick is made on SCALAR heads (no snapshot column is selected at all),
 * and only the snapshot columns the caller names are read, each in its own query,
 * through the v7.501 pieced reader when its measured size needs it. Nothing is
 * sampled or trimmed: what comes back is what is stored (I.6).
 */

import { db } from '@/db';
import { analyses } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { pickDisplayAnalysis } from './displayAnalysis';
import { readSnapshotColumn, PIECE_BUDGET, type SnapshotColumn } from './snapshotPieces';

export const DISPLAY_ANALYSIS_HISTORY = 5;

export interface AnalysisScalarHead {
  id: string;
  status: string;
  triggeredAt: Date | string | null;
  completedAt: Date | string | null;
  hasSemrushSnapshot: boolean;
  hasSerpApiSnapshot: boolean;
  hasProfoundSnapshot: boolean;
  semrushBytes: number;
  serpApiBytes: number;
  profoundBytes: number;
}

function rowsOf(res: any): any[] {
  return Array.isArray(res) ? res : (res?.rows ?? []);
}

/**
 * The newest completed analysis (else the newest row), read WITHOUT any snapshot
 * column — plus each snapshot's measured byte size, so a caller can report an
 * honest figure instead of guessing.
 */
export async function loadDisplayAnalysisHead(projectId: string): Promise<AnalysisScalarHead | null> {
  const res = await db.execute(sql`
    SELECT id::text                          AS "id",
           status::text                      AS "status",
           triggered_at                      AS "triggeredAt",
           completed_at                      AS "completedAt",
           (semrush_snapshot  IS NOT NULL)   AS "hasSemrushSnapshot",
           (serpapi_snapshot  IS NOT NULL)   AS "hasSerpApiSnapshot",
           (profound_snapshot IS NOT NULL)   AS "hasProfoundSnapshot",
           COALESCE(octet_length(semrush_snapshot::text),  0) AS "semrushBytes",
           COALESCE(octet_length(serpapi_snapshot::text),  0) AS "serpApiBytes",
           COALESCE(octet_length(profound_snapshot::text), 0) AS "profoundBytes"
      FROM analyses
     WHERE project_id = ${projectId}
     ORDER BY triggered_at DESC
     LIMIT ${DISPLAY_ANALYSIS_HISTORY}
  `);
  const heads = rowsOf(res).map(r => ({
    ...r,
    hasSemrushSnapshot:  !!r.hasSemrushSnapshot,
    hasSerpApiSnapshot:  !!r.hasSerpApiSnapshot,
    hasProfoundSnapshot: !!r.hasProfoundSnapshot,
    semrushBytes:  Number(r.semrushBytes ?? 0),
    serpApiBytes:  Number(r.serpApiBytes ?? 0),
    profoundBytes: Number(r.profoundBytes ?? 0),
  })) as AnalysisScalarHead[];
  return pickDisplayAnalysis(heads);
}

const BYTES_FIELD: Record<SnapshotColumn, keyof AnalysisScalarHead> = {
  semrush_snapshot:  'semrushBytes',
  serpapi_snapshot:  'serpApiBytes',
  profound_snapshot: 'profoundBytes',
};

/**
 * Read the named snapshot columns of one analysis, one query per column (pieced
 * when a column is larger than one response can carry). Each returns null when
 * the column is empty.
 */
export async function readSnapshots(
  head: AnalysisScalarHead,
  columns: SnapshotColumn[],
): Promise<Record<SnapshotColumn, unknown>> {
  const out = { semrush_snapshot: null, serpapi_snapshot: null, profound_snapshot: null } as Record<SnapshotColumn, unknown>;
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    const bytes = Number(head[BYTES_FIELD[c]] ?? 0);
    out[c] = bytes > 0 ? await readSnapshotColumn(head.id, c, bytes, PIECE_BUDGET) : null;
  }
  return out;
}

/** Head + the semrush snapshot — the combination every local/keyword route needs. */
export async function loadDisplayAnalysisWithSemrush(projectId: string): Promise<
  { head: AnalysisScalarHead; semrushSnapshot: any } | null
> {
  const head = await loadDisplayAnalysisHead(projectId);
  if (!head) return null;
  const snaps = await readSnapshots(head, ['semrush_snapshot']);
  return { head, semrushSnapshot: snaps.semrush_snapshot ?? null };
}
