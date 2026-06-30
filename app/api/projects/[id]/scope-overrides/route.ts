/**
 * /api/projects/[id]/scope-overrides — v7.326
 *
 * The competitor-gap SCOPE-gate override set: umbrella name → 'core' | 'adjacent'.
 *
 * GET  → { overrides: Record<string,'core'|'adjacent'>, updatedAt: string | null }
 * PUT  → body { overrides }  (replaces the full map)
 *
 * Why this exists. synthesize.ts auto-classifies each umbrella core (client competes) vs
 * adjacent (competitor-only vertical) from footprint presence, stored on
 * `_categoryBreakdown.umbrellaScope`. This route stores the user's PROMOTE / DEMOTE decisions
 * on top of that auto layer — promote an adjacent vertical into the gap landscape (client is
 * expanding into it), or demote a vertical the auto-rule mis-scored. The override is applied
 * at READ time (lib/category/scopeModel.buildScopeResolver, via the snapshot's `_scopeOverrides`),
 * so a promote/demote takes effect WITHOUT re-analysis and with no Semrush re-pull — the
 * promoted keywords are already in the snapshot with their real volumes (Const I.1).
 *
 * Const II.8: stored on the project (not a copy of any keyword data — just the per-umbrella
 * scope decision), so it survives reloads, devices, and re-analysis. Auto-migrates the columns
 * at runtime (ADD COLUMN IF NOT EXISTS) — no manual db:push.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }        from 'zod';
import { db }       from '@/db';
import { projects } from '@/db/schema';
import { eq, sql }  from 'drizzle-orm';

// Must always read/write fresh — a promote that persisted to the DB must not be re-hydrated
// from a stale GET on the next mount (same reasoning as the scope + content-plan routes).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_overrides JSONB`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_overrides_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
}

// Full-set replace. Keys are umbrella names (canonical casing, opaque to the server); values
// must be exactly 'core' or 'adjacent'. Bounded so a malformed body can't bloat the row.
const PutSchema = z.object({
  overrides: z.record(z.string().max(200), z.enum(['core', 'adjacent'])).optional(),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    overrides: (project as any).scopeOverrides ?? {},
    updatedAt: (project as any).scopeOverridesUpdatedAt ?? null,
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

  // Normalize: trim umbrella names, drop empties, last write wins on a duplicate. We store
  // exactly the user's scope decisions — nothing modeled (Const I.1).
  const overrides: Record<string, 'core' | 'adjacent'> = {};
  for (const [rawName, sc] of Object.entries(parsed.data.overrides ?? {})) {
    const name = rawName.trim();
    if (!name) continue;
    overrides[name] = sc;
  }

  await db.update(projects)
    .set({
      scopeOverrides:          overrides,
      scopeOverridesUpdatedAt: new Date(),
      updatedAt:               new Date(),
    })
    .where(eq(projects.id, params.id));

  return NextResponse.json({ overrides, updatedAt: new Date().toISOString() }, { headers: NO_STORE });
}
