/**
 * /api/projects/[id]/hidden-categories — v7.419
 *
 * The user's SOFT-HIDDEN Category Breakdown categories (Wayne, 2026-08-11: "delete" a
 * category without ever losing the stored keyword→category associations — category
 * structures must stay intact, and a hide must be restorable down the road).
 *
 * GET  → { hidden: Array<{ name, kwCount, hiddenAt }>, updatedAt: string | null }
 * PUT  → body { hidden }  (replaces the full list)
 *
 * Each entry stores the category's TOP-LEVEL name plus the keyword count AT HIDE TIME —
 * a real count recorded when the user clicked hide, labeled as such on the restore list
 * (never recomputed and presented as current fact, Const I.1). The hide is applied at
 * READ time as a filter inside buildKwPool (the III.1d single-chokepoint pattern), so
 * every panel and rollup drop the category at once while `_categoryBreakdown`,
 * keywordPaths and stored membership stay byte-for-byte untouched (Const II.8) —
 * restoring removes the entry and the category returns exactly as it was, no
 * re-analysis, no re-pull.
 *
 * Const II.7: stored on the project (names + hide-time metadata only — never a copy of
 * keyword data), so it survives reloads, devices, and re-analysis. Auto-migrates the
 * columns at runtime (ADD COLUMN IF NOT EXISTS) — no manual db:push.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }        from 'zod';
import { db }       from '@/db';
import { projects } from '@/db/schema';
import { eq, sql }  from 'drizzle-orm';

// Must always read/write fresh — a hide that persisted to the DB must not be re-hydrated
// from a stale GET on the next mount (same reasoning as the scope-overrides route).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hidden_categories JSONB`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hidden_categories_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
}

// Full-set replace. Names are top-level category names (canonical casing, opaque to the
// server); kwCount is the count recorded at hide time; hiddenAt an ISO timestamp. Bounded
// so a malformed body can't bloat the row.
const PutSchema = z.object({
  hidden: z.array(z.object({
    name:     z.string().min(1).max(300),
    // The stored taxonomy path key (' › ' joined) for path-tree nodes — hide matching is a
    // stored-path PREFIX match, so a collapsed display row (whose name differs from path[0])
    // still hides exactly its own subtree. Absent for flat brand/location/Other categories.
    key:      z.string().min(1).max(600).optional(),
    kwCount:  z.number().int().min(0),
    hiddenAt: z.string().max(40),
  }).strict()).max(2000),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    hidden:    (project as any).hiddenCategories ?? [],
    updatedAt: (project as any).hiddenCategoriesUpdatedAt ?? null,
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

  // Normalize: trim names, drop empties, first entry wins on a duplicate identity
  // (path key when present, else name). We store exactly the user's hide decisions —
  // nothing modeled (Const I.1).
  const seen = new Set<string>();
  const hidden: Array<{ name: string; key?: string; kwCount: number; hiddenAt: string }> = [];
  for (const entry of parsed.data.hidden) {
    const name    = entry.name.trim();
    const pathKey = entry.key?.trim() || undefined;
    const ident   = (pathKey ?? name).toLowerCase();
    if (!name || seen.has(ident)) continue;
    seen.add(ident);
    hidden.push(pathKey
      ? { name, key: pathKey, kwCount: entry.kwCount, hiddenAt: entry.hiddenAt }
      : { name, kwCount: entry.kwCount, hiddenAt: entry.hiddenAt });
  }

  await db.update(projects)
    .set({
      hiddenCategories:          hidden,
      hiddenCategoriesUpdatedAt: new Date(),
      updatedAt:                 new Date(),
    })
    .where(eq(projects.id, params.id));

  return NextResponse.json({ hidden, updatedAt: new Date().toISOString() }, { headers: NO_STORE });
}

