/**
 * lib/scout/store.ts — Scout tables + data access (v7.513).
 *
 * Runtime CREATE TABLE IF NOT EXISTS, same as the auth tables (the build is
 * `next build` only — no drizzle push). Deliberately NOT columns on app_users or
 * projects: an unqualified select on appUsers reads every schema column, so a new
 * column there would 500 sign-in on any lambda that had not run the ALTER yet
 * (the v7.268 / v7.327 projects-list lesson). Separate tables cannot break an
 * existing query.
 *
 * Const II.9: `result` is the only blob column and it is read by exactly one
 * query (getRunResult), one row at a time. Every other query names its columns.
 */

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureAuthTables } from '@/lib/auth/store';
import { DEFAULT_DAILY_CAP } from './config';

let ensured = false;
export async function ensureScoutTables(): Promise<void> {
  if (ensured) return;
  await ensureAuthTables();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS user_product_access (
    user_id         uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    orbit           boolean NOT NULL DEFAULT true,
    scout           boolean NOT NULL DEFAULT false,
    scout_daily_cap integer,
    updated_at      timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS scout_runs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid,
    user_name    text,
    user_email   text,
    domain       text NOT NULL,
    market       text NOT NULL DEFAULT 'us',
    industry     text NOT NULL DEFAULT 'other',
    scope        text NOT NULL DEFAULT 'domain',
    products     jsonb NOT NULL DEFAULT '[]'::jsonb,
    competitors  jsonb NOT NULL DEFAULT '[]'::jsonb,
    status       text NOT NULL DEFAULT 'queued',
    step         integer NOT NULL DEFAULT 0,
    steps_total  integer NOT NULL DEFAULT 6,
    step_label   text,
    started_at   timestamp,
    finished_at  timestamp,
    error        text,
    headline     text,
    units        integer,
    result       jsonb,
    project_id   uuid,
    created_at   timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS scout_runs_user_created_idx ON scout_runs(user_id, created_at DESC)`);
  // v7.515 — soft delete: a deleted run leaves the list and its stored report is cleared, but the
  // row stays so the API Usage ledger still attributes that run's real spend to its domain.
  await db.execute(sql`ALTER TABLE scout_runs ADD COLUMN IF NOT EXISTS deleted_at timestamp`);
  ensured = true;
}

/** neon-http returns either `{ rows }` or a bare array depending on the bundle — read both. */
export function rowsOf(res: unknown): Array<Record<string, any>> {
  const r = (res as { rows?: unknown })?.rows ?? res;
  return Array.isArray(r) ? (r as Array<Record<string, any>>) : [];
}

// ─── Product access ──────────────────────────────────────────────────────────

export interface ProductAccess { orbit: boolean; scout: boolean; cap: number | null }

export async function getProductRow(userId: string): Promise<ProductAccess | null> {
  await ensureScoutTables();
  const r = rowsOf(await db.execute(sql`SELECT orbit, scout, scout_daily_cap FROM user_product_access WHERE user_id = ${userId} LIMIT 1`))[0];
  return r ? { orbit: r.orbit !== false, scout: r.scout === true, cap: r.scout_daily_cap == null ? DEFAULT_DAILY_CAP : Number(r.scout_daily_cap) } : null;
}

export async function listProductRows(): Promise<Record<string, ProductAccess>> {
  await ensureScoutTables();
  const out: Record<string, ProductAccess> = {};
  for (const r of rowsOf(await db.execute(sql`SELECT user_id, orbit, scout, scout_daily_cap FROM user_product_access`))) {
    out[String(r.user_id)] = { orbit: r.orbit !== false, scout: r.scout === true, cap: r.scout_daily_cap == null ? DEFAULT_DAILY_CAP : Number(r.scout_daily_cap) };
  }
  return out;
}

export async function upsertProductRow(userId: string, next: ProductAccess): Promise<void> {
  await ensureScoutTables();
  await db.execute(sql`INSERT INTO user_product_access (user_id, orbit, scout, scout_daily_cap, updated_at)
    VALUES (${userId}, ${next.orbit}, ${next.scout}, ${next.cap}, now())
    ON CONFLICT (user_id) DO UPDATE SET orbit = EXCLUDED.orbit, scout = EXCLUDED.scout, scout_daily_cap = EXCLUDED.scout_daily_cap, updated_at = now()`);
}

// ─── Runs ────────────────────────────────────────────────────────────────────

export interface RunRow {
  id: string; userId: string | null; userName: string | null; domain: string; market: string; industry: string;
  scope: string; products: string[]; competitors: Array<{ domain: string; manual: boolean }>;
  status: string; step: number; stepsTotal: number; stepLabel: string | null;
  startedAt: string | null; finishedAt: string | null; error: string | null; headline: string | null;
  units: number | null; projectId: string | null; createdAt: string;
}
const iso = (v: any): string | null => v ? new Date(v).toISOString() : null;
function toRun(r: Record<string, any>): RunRow {
  return {
    id: String(r.id), userId: r.user_id ? String(r.user_id) : null, userName: r.user_name ?? null,
    domain: r.domain, market: r.market, industry: r.industry, scope: r.scope,
    products: Array.isArray(r.products) ? r.products : [], competitors: Array.isArray(r.competitors) ? r.competitors : [],
    status: r.status, step: Number(r.step ?? 0), stepsTotal: Number(r.steps_total ?? 6), stepLabel: r.step_label ?? null,
    startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), error: r.error ?? null, headline: r.headline ?? null,
    units: r.units == null ? null : Number(r.units), projectId: r.project_id ? String(r.project_id) : null, createdAt: iso(r.created_at) as string,
  };
}

export interface RunInput {
  domain: string; market: string; industry: string; scope: string; products: string[]; competitors: Array<{ domain: string; manual: boolean }>;
}

/** v7.515 — `draft: true` saves the setup without running it (status 'draft', nothing spent, not counted against the cap). */
export async function createRun(input: RunInput & { userId: string | null; userName: string | null; userEmail: string | null; draft?: boolean }): Promise<string> {
  await ensureScoutTables();
  const status = input.draft ? 'draft' : 'queued';
  const r = rowsOf(await db.execute(sql`INSERT INTO scout_runs (user_id, user_name, user_email, domain, market, industry, scope, products, competitors, status)
    VALUES (${input.userId}, ${input.userName}, ${input.userEmail}, ${input.domain}, ${input.market}, ${input.industry}, ${input.scope},
            ${JSON.stringify(input.products)}::jsonb, ${JSON.stringify(input.competitors)}::jsonb, ${status})
    RETURNING id`))[0];
  return String(r.id);
}

/** v7.515 — edit a saved (draft) setup in place. Only drafts: a run that has executed keeps the inputs its report was built from. */
export async function updateDraft(id: string, input: RunInput): Promise<boolean> {
  await ensureScoutTables();
  const r = rowsOf(await db.execute(sql`UPDATE scout_runs SET domain = ${input.domain}, market = ${input.market}, industry = ${input.industry},
    scope = ${input.scope}, products = ${JSON.stringify(input.products)}::jsonb, competitors = ${JSON.stringify(input.competitors)}::jsonb
    WHERE id = ${id} AND status = 'draft' AND deleted_at IS NULL RETURNING id`));
  return r.length === 1;
}

/** v7.515 — soft delete. Refused while the run is executing (its request is still writing to the row). */
export async function deleteRun(id: string): Promise<boolean> {
  await ensureScoutTables();
  const r = rowsOf(await db.execute(sql`UPDATE scout_runs SET deleted_at = now(), result = NULL
    WHERE id = ${id} AND deleted_at IS NULL AND status NOT IN ('queued', 'running') RETURNING id`));
  return r.length === 1;
}

const LIST_SQL = sql`id, user_id, user_name, domain, market, industry, scope, products, competitors, status, step, steps_total,
  step_label, started_at, finished_at, error, headline, units, project_id, created_at`;

export async function getRun(id: string): Promise<RunRow | null> {
  await ensureScoutTables();
  const r = rowsOf(await db.execute(sql`SELECT ${LIST_SQL} FROM scout_runs WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`))[0];
  return r ? toRun(r) : null;
}

export async function listRuns(opts: { userId: string | null; all: boolean; limit?: number }): Promise<RunRow[]> {
  await ensureScoutTables();
  const lim = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const res = opts.all || !opts.userId
    ? await db.execute(sql`SELECT ${LIST_SQL} FROM scout_runs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ${lim}`)
    : await db.execute(sql`SELECT ${LIST_SQL} FROM scout_runs WHERE user_id = ${opts.userId} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ${lim}`);
  return rowsOf(res).map(toRun);
}

export async function getRunResult(id: string): Promise<any | null> {
  await ensureScoutTables();
  const r = rowsOf(await db.execute(sql`SELECT result FROM scout_runs WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`))[0];
  return r?.result ?? null;
}

export async function countRunsSince(userId: string, since: Date): Promise<number> {
  await ensureScoutTables();
  const r = rowsOf(await db.execute(sql`SELECT count(*)::int AS c FROM scout_runs WHERE user_id = ${userId} AND created_at >= ${since.toISOString()}::timestamptz AND status NOT IN ('failed', 'draft')`))[0];
  const n = Number(r?.c); return Number.isFinite(n) ? n : 0;
}

/** Atomically claim a queued (or saved draft) run so a double-click cannot execute (and bill) it twice. */
export async function claimRun(id: string): Promise<boolean> {
  await ensureScoutTables();
  const r = rowsOf(await db.execute(sql`UPDATE scout_runs SET status = 'running', started_at = now(), step = 0, step_label = 'Starting', created_at = now()
    WHERE id = ${id} AND status IN ('queued', 'draft') AND deleted_at IS NULL RETURNING id`));
  return r.length === 1;
}

export async function setProgress(id: string, step: number, label: string): Promise<void> {
  await db.execute(sql`UPDATE scout_runs SET step = ${step}, step_label = ${label} WHERE id = ${id}`);
}

export async function finishRun(id: string, f: { status: string; headline: string | null; units: number; result: unknown; error?: string | null }): Promise<void> {
  await db.execute(sql`UPDATE scout_runs SET status = ${f.status}, headline = ${f.headline}, units = ${f.units},
    result = ${JSON.stringify(f.result ?? null)}::jsonb, error = ${f.error ?? null}, finished_at = now(), step = steps_total, step_label = 'Done'
    WHERE id = ${id}`);
}

export async function failRun(id: string, message: string, units: number): Promise<void> {
  await db.execute(sql`UPDATE scout_runs SET status = 'failed', error = ${message.slice(0, 600)}, units = ${units}, finished_at = now() WHERE id = ${id}`);
}

export async function linkProject(id: string, projectId: string): Promise<void> {
  await db.execute(sql`UPDATE scout_runs SET project_id = ${projectId} WHERE id = ${id}`);
}

/** Median wall-clock seconds of finished runs — the ETA basis (measured history, never a guess). */
export async function medianRunSeconds(): Promise<{ seconds: number; runs: number } | null> {
  await ensureScoutTables();
  const rows = rowsOf(await db.execute(sql`SELECT extract(epoch FROM (finished_at - started_at))::int AS s FROM scout_runs
    WHERE status IN ('ready','no_opening') AND started_at IS NOT NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 25`));
  const xs = rows.map(r => Number(r.s)).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  return { seconds: xs[Math.floor(xs.length / 2)], runs: xs.length };
}
