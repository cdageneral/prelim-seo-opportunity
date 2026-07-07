/**
 * /api/projects/[id]/priority-overrides — v7.358
 *
 * Per-project MANUAL priority moves: ContentTopic.id → 'P0' | 'P1' | 'P2' | 'P3'.
 *
 * GET  → { overrides: Record<string,'P0'|'P1'|'P2'|'P3'>, updatedAt: string | null }
 * PUT  → body { overrides }  (replaces the full map)
 *
 * The user moves a content topic to a different priority bucket on the Content Map. This
 * route stores that decision on top of the auto scorer (scoreTopic). The override is applied
 * at READ time — injected onto the snapshot as `_priorityOverrides` (page.tsx), then applied
 * inside buildContentPlanFromTopics / buildContentPlan — so a move takes effect WITHOUT
 * re-analysis and reconciles across every panel that reads priority (Const II.7). Removing a
 * key reverts that topic to its auto priority.
 *
 * Const II.8: stored on the project (not a copy of any topic data — just the per-topic bucket
 * decision), so it survives reloads, devices, and re-analysis. Mirrors the scope-overrides
 * route (v7.326). Auto-migrates the columns at runtime (ADD COLUMN IF NOT EXISTS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }        from 'zod';
import { db }       from '@/db';
import { projects } from '@/db/schema';
import { eq, sql }  from 'drizzle-orm';

// Always read/write fresh — a move that persisted must not be re-hydrated stale on the next
// mount (same reasoning as the scope-overrides + content-plan routes).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority_overrides JSONB`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority_overrides_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
}

// Full-set replace. Keys are ContentTopic.id strings (opaque to the server); values must be
// exactly one of the four priority tiers. Bounded so a malformed body can't bloat the row.
const PutSchema = z.object({
  overrides: z.record(z.string().max(300), z.enum(['P0', 'P1', 'P2', 'P3'])).optional(),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    overrides: (project as any).priorityOverrides ?? {},
    updatedAt: (project as any).priorityOverridesUpdatedAt ?? null,
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

  const current = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Normalize: trim ids, drop empties, last write wins on a duplicate. We store exactly the
  // user's move decisions — nothing modeled (Const I.1).
  const overrides: Record<string, 'P0' | 'P1' | 'P2' | 'P3'> = {};
  for (const [rawId, pri] of Object.entries(parsed.data.overrides ?? {})) {
    const id = rawId.trim();
    if (!id) continue;
    overrides[id] = pri;
  }

  await db.update(projects)
    .set({
      priorityOverrides:          overrides,
      priorityOverridesUpdatedAt: new Date(),
      updatedAt:                  new Date(),
    } as any)
    .where(eq(projects.id, params.id));

  return NextResponse.json({ overrides, updatedAt: new Date().toISOString() }, { headers: NO_STORE });
}
