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
 * v7.269 — TWO-WAY SYNC (Wayne's decision): scope is a curated SUBSET of the shared
 * content-plan selection (the set the Content Map / Content Plan / Journey views all read).
 * So on PUT, any id REMOVED from scope is also removed from `content_plan_selections` —
 * deselecting in the Scope panel unchecks it everywhere. (Adding to scope never changes the
 * plan: scoped ids are already in the plan.) The complementary rule — pruning scope when the
 * plan shrinks — lives in the content-plan PUT route, so scope ⊆ plan is enforced server-side
 * regardless of which view made the edit (one invariant, all clients inherit it).
 *
 * Auto-migrates the columns at runtime (ADD COLUMN IF NOT EXISTS) — no manual db:push.
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
  // v7.269: the two-way sync below also writes the content-plan columns, so ensure them here.
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections JSONB`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_updated_at TIMESTAMP`);
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

  // v7.269: load the current row so we can (a) confirm it exists and (b) compute which ids
  // were REMOVED from scope, which must cascade out of the content-plan selection too.
  const current = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const newScope = new Set(selections);
  const oldScope: string[] = (current as any).scopeSelections ?? [];
  const removed = oldScope.filter((id) => !newScope.has(id));   // dropped from scope this PUT

  const setObj: Record<string, unknown> = {
    scopeSelections:          selections,
    scopeSelectionsUpdatedAt: new Date(),
    updatedAt:                new Date(),
  };

  // Two-way sync: removing from scope also removes from the shared content-plan selection,
  // so the topic unchecks in the Content Map / Content Plan / Journey views (Wayne, v7.269).
  if (removed.length) {
    const rem = new Set(removed);
    const plan: string[] = (current as any).contentPlanSelections ?? [];
    const prunedPlan = plan.filter((id) => !rem.has(id));
    if (prunedPlan.length !== plan.length) {
      setObj.contentPlanSelections          = prunedPlan;
      setObj.contentPlanSelectionsUpdatedAt = new Date();
    }
  }

  const [updated] = await db.update(projects)
    .set(setObj as any)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    selections: (updated as any).scopeSelections ?? [],
    updatedAt:  (updated as any).scopeSelectionsUpdatedAt ?? null,
  }, { headers: NO_STORE });
}
