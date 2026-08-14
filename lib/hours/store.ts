// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/store.ts — v7.447
//
// The live activity list: `hours_activities`, self-migrating (ADD TABLE IF NOT
// EXISTS) the same way the usage ledger does, because a manual `db:push` is a
// step Wayne would have to run and shouldn't have to.
//
// SEED ONCE, NEVER RE-SEED. The seed fires only when the table is empty. An
// UPSERT on every read would silently revert an edited hours figure on the next
// deploy — the whole point of moving the list into Admin is that his numbers
// outlive the code.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ACTIVITY_SEED, type HoursActivity } from './activities';

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

/** The list as stored. Seeds from ACTIVITY_SEED only when the table is empty. */
export async function loadActivities(): Promise<{ activities: HoursActivity[]; updatedAt: string | null; seeded: boolean }> {
  await ensureHoursTable();
  let rows: any[] = [];
  try {
    const r: any = await db.execute(sql`
      SELECT key, label, hours, gate_key AS "gateKey", grp AS "group",
             sort_order AS "sortOrder", active, updated_at AS "updatedAt"
      FROM hours_activities ORDER BY sort_order ASC, key ASC
    `);
    rows = r?.rows ?? r ?? [];
  } catch {
    // Unreadable table — fall back to the seed so the card still renders, and
    // say so via seeded:true rather than reporting zero hours everywhere.
    return { activities: ACTIVITY_SEED, updatedAt: null, seeded: true };
  }

  if (rows.length === 0) {
    for (const a of ACTIVITY_SEED) {
      try {
        await db.execute(sql`
          INSERT INTO hours_activities (key, label, hours, gate_key, grp, sort_order, active)
          VALUES (${a.key}, ${a.label}, ${a.hours}, ${a.gateKey}, ${a.group}, ${a.sortOrder}, ${a.active})
          ON CONFLICT (key) DO NOTHING
        `);
      } catch { /* one bad row must not stop the seed */ }
    }
    return { activities: ACTIVITY_SEED, updatedAt: null, seeded: true };
  }

  const activities: HoursActivity[] = rows.map(r => ({
    key:       String(r.key),
    label:     String(r.label),
    hours:     Number(r.hours) || 0,
    gateKey:   String(r.gateKey),
    group:     r.group === 'local' ? 'local' : 'base',
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
