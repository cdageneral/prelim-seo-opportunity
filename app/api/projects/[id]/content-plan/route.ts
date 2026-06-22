/**
 * /api/projects/[id]/content-plan — the user's hand-picked Content Plan topic selection.
 *
 * GET  → { selections: string[], updatedAt: string | null }
 * PUT  → body { selections: string[] }  (replaces the full set; ids = ContentTopic.id)
 *
 * Const II.7: this stores ONLY which canonical content topics the user pushed into the
 * Content Plan panel (by id) — never a copy of the topic data. The Content Plan panel
 * re-derives every topic from the canonical pool and filters to these ids. The selection
 * persists on the project so it survives reloads, devices, and re-analysis. v7.260.
 *
 * Auto-migrates the column at runtime (ADD COLUMN IF NOT EXISTS) — no manual db:push.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections JSONB`);                  // v7.260
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_updated_at TIMESTAMP`);  // v7.260
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
    selections: (project as any).contentPlanSelections ?? [],
    updatedAt:  (project as any).contentPlanSelectionsUpdatedAt ?? null,
  });
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
  // (opaque to the server) — we store exactly what was picked, nothing modeled.
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
      contentPlanSelections:          selections,
      contentPlanSelectionsUpdatedAt: new Date(),
      updatedAt:                      new Date(),
    } as any)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    selections: (updated as any).contentPlanSelections ?? [],
    updatedAt:  (updated as any).contentPlanSelectionsUpdatedAt ?? null,
  });
}
