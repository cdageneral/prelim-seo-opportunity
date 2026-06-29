/**
 * /api/projects/[id]/profound — server-side persistence for the Profound AI Visibility panel.
 *
 * GET    → { metrics: <Metrics|null>, updatedAt: string | null }
 * PUT     body { metrics: <Metrics> }   → stores the computed metrics, returns { metrics, updatedAt }
 * DELETE → clears the stored metrics,   returns { metrics: null, updatedAt: null }
 *
 * WHY (v7.318): the panel previously persisted its computed analysis ONLY to the browser's
 * IndexedDB, so the uploaded-export results dropped off on a refresh / new browser and were
 * invisible to any other user opening the same project URL — forcing a re-upload every session.
 * This route moves persistence to the shared project row (Neon Postgres), exactly like the
 * keyword / scope / brand-terms panels, so the data survives reloads, devices, and users.
 *
 * Const I.1: this stores ONLY the compact COMPUTED Metrics object the panel renders — itself an
 * aggregate of the user's REAL Profound CSV rows. The raw rows are never stored, and nothing here
 * is modeled or invented; it is byte-for-byte what the panel computed from the uploaded exports.
 *
 * Auto-migrates the columns at runtime (ADD COLUMN IF NOT EXISTS) — no manual db:push.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }        from 'zod';
import { db }       from '@/db';
import { projects } from '@/db/schema';
import { eq, sql }  from 'drizzle-orm';

// Always read fresh so a clear/replace that persisted to the DB isn't re-hydrated from a stale
// GET on the next mount (same reasoning as the scope/content-plan routes). Responses are no-store.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_data JSONB`);                  // v7.318
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_data_updated_at TIMESTAMP`);   // v7.318
  } catch { /* already exists */ }
}

// The body carries the panel's computed Metrics object. We persist it verbatim (it is the panel's
// own aggregate of the uploaded CSVs), so the shape is validated loosely: a non-null JSON object.
// `.passthrough()` keeps every computed field exactly as sent — we never reshape the analysis.
const PutSchema = z.object({
  metrics: z.object({}).passthrough(),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    metrics:   (project as any).profoundData ?? null,
    updatedAt: (project as any).profoundDataUpdatedAt ?? null,
  }, { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const [updated] = await db.update(projects)
    .set({ profoundData: parsed.data.metrics as any, profoundDataUpdatedAt: now, updatedAt: now } as any)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    metrics:   (updated as any).profoundData ?? null,
    updatedAt: (updated as any).profoundDataUpdatedAt ?? null,
  }, { headers: NO_STORE });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();

  const now = new Date();
  const [updated] = await db.update(projects)
    .set({ profoundData: null as any, profoundDataUpdatedAt: null as any, updatedAt: now } as any)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ metrics: null, updatedAt: null }, { headers: NO_STORE });
}
