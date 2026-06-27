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

// v7.262: the selection must always read fresh — never a cached response. Otherwise a
// removal persists to the DB but a stale GET (browser/route cache) re-hydrates the old
// set on the next mount, so the topic looks selected again (Content Map checkbox still
// ticked, row reappears in the plan). Force the handler dynamic; responses are no-store.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections JSONB`);                  // v7.260
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_updated_at TIMESTAMP`);  // v7.260
  } catch { /* already exists */ }
  // v7.269: scope ⊆ plan is enforced here too (prune scope when the plan shrinks), so ensure
  // the scope columns exist before we may write them.
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections JSONB`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections_updated_at TIMESTAMP`);
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
  // (opaque to the server) — we store exactly what was picked, nothing modeled.
  const seen = new Set<string>();
  const selections: string[] = [];
  for (const raw of parsed.data.selections) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    selections.push(id);
  }

  // v7.269: load the current row to keep scope a SUBSET of the plan. When the plan shrinks
  // (a topic deselected in the Content Map / Content Plan / Journey views), any scoped id no
  // longer in the plan is pruned from scope too — so the View Scope panel never shows a topic
  // that's been dropped from the plan. (The reverse — scope removal cascading into the plan —
  // lives in the /scope PUT route; together they keep scope ⊆ plan from either direction.)
  const current = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const planSet = new Set(selections);
  const setObj: Record<string, unknown> = {
    contentPlanSelections:          selections,
    contentPlanSelectionsUpdatedAt: new Date(),
    updatedAt:                      new Date(),
  };

  const scope: string[] = (current as any).scopeSelections ?? [];
  const prunedScope = scope.filter((id) => planSet.has(id));
  if (prunedScope.length !== scope.length) {
    setObj.scopeSelections          = prunedScope;
    setObj.scopeSelectionsUpdatedAt = new Date();
  }

  const [updated] = await db.update(projects)
    .set(setObj as any)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    selections: (updated as any).contentPlanSelections ?? [],
    updatedAt:  (updated as any).contentPlanSelectionsUpdatedAt ?? null,
  }, { headers: NO_STORE });
}
