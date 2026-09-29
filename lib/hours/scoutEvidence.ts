// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/scoutEvidence.ts — v7.526
//
// Measures every Scout run's Hours Saved evidence in ONE query, and returns
// only integers, flags and dates — the exact discipline of lib/hours/evidence.ts.
//
// A run's `result` is a jsonb blob (themes, facts, the AI read, the opening
// detail). It is the ONLY blob column on scout_runs (Const II.9) and it never
// crosses the wire here: every count below is taken INSIDE Postgres with
// jsonb_typeof guards, so a null result, a 'thin' result that never carried
// `themes`, or a field of the wrong type reads as ZERO — never raises, never
// counts as presence. A gate that cannot be measured fails closed (Const I.5).
//
// WHICH RUNS. Drafts, queued and running runs have no result yet; a soft-deleted
// run (v7.515) has had its result cleared. None of those can be credited, so
// none are loaded. Failed runs ARE loaded: they finished with nothing, and the
// ledger row that recorded their spend deserves an honest zero beside it
// rather than a blank that reads as "not measured".
//
// DATING. A run's hours belong to the moment it FINISHED — `finished_at`, with
// `created_at` as the fallback for a row that somehow lacks one. Unlike a
// project (v7.484: first analysis, because a project is worked over months), a
// run is a single bounded event, so the window question has one obvious answer.
//
// This module reads scout_runs directly rather than importing lib/scout/*, so
// the Const II.6c edge stays one-directional: Scout modules never import the
// internal Hours module, and the Hours module carries nothing of Scout's own
// logic — only its table.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import type { ScoutGateContext } from './gates';

export interface ScoutRunEvidence {
  runId: string;
  domain: string;
  userName: string | null;
  scope: string;
  status: string;
  /** null only when the row carries neither finished_at nor created_at — never guessed. */
  finishedAt: string | null;
  /** v7.515 convert — the project this run became, if any. Informational; a run's hours stay on the run. */
  projectId: string | null;
  ctx: ScoutGateContext;
}

const n = (v: any): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Statuses that can be loaded at all — every other status has no stored result to measure. */
export const SCOUT_LOADED_STATUSES = ['ready', 'no_opening', 'thin', 'failed'] as const;

export async function loadScoutEvidence(): Promise<ScoutRunEvidence[]> {
  let rows: any[] = [];
  try {
    const r: any = await db.execute(sql`
      SELECT
        s.id, s.domain, s.user_name AS "userName", s.scope, s.status, s.project_id AS "projectId",
        COALESCE(s.finished_at, s.created_at) AS "finishedAt",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'facts')='array'
                      THEN (SELECT count(*) FROM jsonb_array_elements(s.result->'facts') f WHERE (f->>'found') = 'true') END, 0) AS "sitesProfiled",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'facts')='array'
                      THEN (SELECT count(*) FROM jsonb_array_elements(s.result->'facts') f WHERE jsonb_typeof(f->'authorityScore')='number') END, 0) AS "authorityRead",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'counts'->'universe')='number' THEN (s.result->'counts'->>'universe')::numeric END, 0) AS "universe",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'themes')='array' THEN jsonb_array_length(s.result->'themes') END, 0) AS "themes",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'field')='array'  THEN jsonb_array_length(s.result->'field')  END, 0) AS "fieldRows",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'ai'->'reads')='array'     THEN jsonb_array_length(s.result->'ai'->'reads')     END, 0) AS "aiReads",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'ai'->'quadrants')='array' THEN jsonb_array_length(s.result->'ai'->'quadrants') END, 0) AS "aiQuadrants",
        (jsonb_typeof(s.result->'opening')='object') AS "hasOpening",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'detail'->'leaderPages')='array'   THEN jsonb_array_length(s.result->'detail'->'leaderPages')   END, 0) AS "leaderPages",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'detail'->'pagesByDomain')='array' THEN jsonb_array_length(s.result->'detail'->'pagesByDomain') END, 0) AS "pagesByDomain",
        COALESCE(CASE WHEN jsonb_typeof(s.result->'detail'->'questions')='array'     THEN jsonb_array_length(s.result->'detail'->'questions')     END, 0) AS "questions"
      FROM scout_runs s
      WHERE s.deleted_at IS NULL
        AND s.status IN ('ready', 'no_opening', 'thin', 'failed')
      ORDER BY COALESCE(s.finished_at, s.created_at) DESC NULLS LAST, s.id ASC
    `);
    rows = r?.rows ?? r ?? [];
  } catch {
    // No scout_runs table yet (a database Scout has never touched), or a column
    // this query names was never added. An unmeasurable set is an EMPTY set —
    // the Orbit hours still render and no run is ever guessed at.
    return [];
  }

  return rows.map(r => ({
    runId: String(r.id),
    domain: String(r.domain ?? ''),
    userName: r.userName ? String(r.userName) : null,
    scope: String(r.scope ?? 'domain'),
    status: String(r.status ?? ''),
    finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
    projectId: r.projectId ? String(r.projectId) : null,
    ctx: {
      status:        String(r.status ?? ''),
      sitesProfiled: n(r.sitesProfiled),
      authorityRead: n(r.authorityRead),
      universe:      n(r.universe),
      themes:        n(r.themes),
      fieldRows:     n(r.fieldRows),
      aiReads:       n(r.aiReads),
      aiQuadrants:   n(r.aiQuadrants),
      hasOpening:    r.hasOpening === true,
      leaderPages:   n(r.leaderPages),
      pagesByDomain: n(r.pagesByDomain),
      questions:     n(r.questions),
    },
  }));
}
