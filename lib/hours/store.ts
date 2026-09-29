// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/store.ts — v7.447 · v7.526 one-time Scout seed
//
// The live activity list: `hours_activities`, self-migrating (ADD TABLE IF NOT
// EXISTS) the same way the usage ledger does, because a manual `db:push` is a
// step Wayne would have to run and shouldn't have to.
//
// SEED ONCE, NEVER RE-SEED. The seed fires only when the table is empty. An
// UPSERT on every read would silently revert an edited hours figure on the next
// deploy — the whole point of moving the list into Admin is that his numbers
// outlive the code.
//
// v7.526 — ADDITIVE SEEDS. The production table was seeded in v7.447 and is not
// empty, so a new activity in ACTIVITY_SEED would never reach it. Each later
// batch of rows therefore ships under a SEED ID recorded in `hours_seeds`: the
// batch is inserted exactly once (ON CONFLICT DO NOTHING, so an edited row is
// never touched), the id is recorded, and the batch is never applied again —
// which is what lets Wayne delete a seeded row in Admin and have it stay gone.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ACTIVITY_SEED, SCOUT_ACTIVITY_SEED, SCOUT_SEED_ID, type HoursActivity, type HoursGroup } from './activities';

/** The stored `grp` column, narrowed to a known group; anything else reads as `base` (the v7.447 behaviour). */
function asGroup(v: unknown): HoursGroup { return v === 'local' ? 'local' : v === 'scout' ? 'scout' : 'base'; }

async function insertRows(rows: HoursActivity[]): Promise<void> {
  for (const a of rows) {
    try {
      await db.execute(sql`
        INSERT INTO hours_activities (key, label, hours, gate_key, grp, sort_order, active)
        VALUES (${a.key}, ${a.label}, ${a.hours}, ${a.gateKey}, ${a.group}, ${a.sortOrder}, ${a.active})
        ON CONFLICT (key) DO NOTHING
      `);
    } catch { /* one bad row must not stop the seed */ }
  }
}

/**
 * v7.526 — apply an additive seed batch exactly once. Returns true when the
 * batch was applied on THIS call (the caller re-reads the table).
 */
async function applySeedOnce(seedId: string, rows: HoursActivity[]): Promise<boolean> {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS hours_seeds (seed TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    const r: any = await db.execute(sql`SELECT 1 FROM hours_seeds WHERE seed = ${seedId} LIMIT 1`);
    const rows_ = r?.rows ?? r ?? [];
    if (rows_.length > 0) return false;
    await insertRows(rows);
    await db.execute(sql`INSERT INTO hours_seeds (seed) VALUES (${seedId}) ON CONFLICT (seed) DO NOTHING`);
    return true;
  } catch { return false; }
}

/** v7.526 — a table that already existed is marked as carrying every seed the code knows, so a fresh full seed is never re-applied additively. */
async function markSeedApplied(seedId: string): Promise<void> {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS hours_seeds (seed TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW())`);
    await db.execute(sql`INSERT INTO hours_seeds (seed) VALUES (${seedId}) ON CONFLICT (seed) DO NOTHING`);
  } catch { /* best effort */ }
}

export async function ensureHoursTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS hours_activities (
        key         TEXT      PRIMARY KEY,
        label       TEXT      NOT NULL,
        hours       INTEGER   NOT NULL DEFAULT 0,
        gate_key    TEXT      NOT NULL DEFAULT 'always',
        grp         TEXT      NOT NULL DEFAULT 'base',
        sort_order  INTEGER   NOT NULL DEFAULT 0,
        active      BOOLEAN   NOT NULL DEFAULT true,
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch { /* already exists, or DB unavailable — callers degrade to the seed */ }
}

async function readRows(): Promise<any[]> {
  const r: any = await db.execute(sql`
    SELECT key, label, hours, gate_key AS "gateKey", grp AS "group",
           sort_order AS "sortOrder", active, updated_at AS "updatedAt"
    FROM hours_activities ORDER BY sort_order ASC, key ASC
  `);
  return r?.rows ?? r ?? [];
}

/** The list as stored. Seeds from ACTIVITY_SEED only when the table is empty; applies additive seed batches once. */
export async function loadActivities(): Promise<{ activities: HoursActivity[]; updatedAt: string | null; seeded: boolean }> {
  await ensureHoursTable();
  let rows: any[] = [];
  try {
    rows = await readRows();
  } catch {
    // Unreadable table — fall back to the seed so the card still renders, and
    // say so via seeded:true rather than reporting zero hours everywhere.
    return { activities: ACTIVITY_SEED, updatedAt: null, seeded: true };
  }

  if (rows.length === 0) {
    await insertRows(ACTIVITY_SEED);             // the full seed already carries the Scout rows …
    await markSeedApplied(SCOUT_SEED_ID);        // … so the additive batch must never run on top of it
    return { activities: ACTIVITY_SEED, updatedAt: null, seeded: true };
  }

  // v7.526 — a populated table predates the Scout rows: add them exactly once.
  if (await applySeedOnce(SCOUT_SEED_ID, SCOUT_ACTIVITY_SEED)) {
    try { rows = await readRows(); } catch { /* keep the rows already read */ }
  }

  const activities: HoursActivity[] = rows.map(r => ({
    key:       String(r.key),
    label:     String(r.label),
    hours:     Number(r.hours) || 0,
    gateKey:   String(r.gateKey),
    group:     asGroup(r.group),
    sortOrder: Number(r.sortOrder) || 0,
    active:    r.active !== false,
  }));
  const stamps = rows.map(r => r.updatedAt).filter(Boolean).map((d: any) => new Date(d).getTime());
  const updatedAt = stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
  return { activities, updatedAt, seeded: false };
}

/** Full-set replace from Admin. Rows absent from the payload are removed. */
export async function saveActivities(list: HoursActivity[]): Promise<void> {
  await ensureHoursTable();
  const keys = list.map(a => a.key);
  for (const a of list) {
    await db.execute(sql`
      INSERT INTO hours_activities (key, label, hours, gate_key, grp, sort_order, active, updated_at)
      VALUES (${a.key}, ${a.label}, ${a.hours}, ${a.gateKey}, ${a.group}, ${a.sortOrder}, ${a.active}, NOW())
      ON CONFLICT (key) DO UPDATE SET
        label = EXCLUDED.label, hours = EXCLUDED.hours, gate_key = EXCLUDED.gate_key,
        grp = EXCLUDED.grp, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active,
        updated_at = NOW()
    `);
  }
  if (keys.length > 0) {
    await db.execute(sql`DELETE FROM hours_activities WHERE key <> ALL(${keys})`);
  }
}
