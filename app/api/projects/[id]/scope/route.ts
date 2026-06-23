/**
 * /api/projects/[id]/scope — the user's running Scope "spec sheet" (the shopping cart).
 *
 * GET  → { selections: string[], updatedAt: string | null }
 * PUT  → body { selections: string[] }  (replaces the full set; ids = ContentTopic.id)
 *
 * Const II.7: this stores ONLY which canonical content topics the user added to scope (by
 * id) — never a copy of the topic/brief data. The View Scope panel re-derives every topic
 * from the canonical pool and filters to these ids. The scope persists on the project so it
 * survives reloads, devices, and re-analysis. Mirrors the content-plan route. v7.267.
 *
 * Auto-migrates the column at runtime (ADD COLUMN IF NOT EXISTS) — no manual db:push.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

// The scope must always read fresh — never a cached response — so a removal that persisted
// to the DB isn't re-hydrated from a stale GET on the next mount (same reasoning as the
// content-plan route, v7.262). Force the handler dynamic; responses are no-store.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections JSONB`);                  // v7.267
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections_updated_at TIMESTAMP`);  // v7.267
  } catch { /* already exists */ }
}

// Full-set replace. ids are opaque ContentTopic.id strings; no cap by default (Const I.6).
const PutSchema = z.object({
  selections: z.array(z.string().max(300)).max(50000),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    selections: (project as any).scopeSelections ?? [],
    updatedAt:  (project as any).scopeSelectionsUpdatedAt ?? null,
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

  // De-dupe and drop empties while preserving order. The ids are ContentTopic.id values
  // (opaque to the server) — we store exactly what was scoped, nothing modeled.
  const seen = new Set<string>();
  const selections: string[] = [];
  for (const raw of parsed.data.selections) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    selections.push(id);
  }

  const [updated] = await db.update(projects)
    .set({
      scopeSelections:          selections,
      scopeSelectionsUpdatedAt: new Date(),
      updatedAt:                new Date(),
    } as any)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    selections: (updated as any).scopeSelections ?? [],
    updatedAt:  (updated as any).scopeSelectionsUpdatedAt ?? null,
  }, { headers: NO_STORE });
}
