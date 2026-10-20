/**
 * /api/projects/[id]/hidden-categories/carry — v7.570
 *
 * Re-express the stored Keyword Selection on the CURRENT category tree, keyword by keyword,
 * from the tree it was made on (lib/category/selectionCarry.ts). For a project whose
 * selection was made before a Refresh Analysis rebuilt the tree.
 *
 * GET  → preview: { available, staleNow, staleKeys, prev: {analysisId, completedAt},
 *                   result: { shared, inBefore, inAfter, flipped, newKeywords, hides } }
 * POST → applies it: the current store is backed up to hidden_categories_prev first, then
 *        replaced. { restore: true } puts the backup back (one-step undo).
 *
 * Only the two trees' category columns are read (JSONB paths, never the whole snapshot —
 * Const II.9): semrush_snapshot->'_categoryBreakdown' for the newest two completed analyses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { carrySelection, staleHideKeys, type CarryTree } from '@/lib/category/selectionCarry';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

function rowsOf(res: unknown): Array<Record<string, any>> {
  const r = (res as { rows?: unknown })?.rows ?? res;
  return Array.isArray(r) ? (r as Array<Record<string, any>>) : [];
}

async function ensureColumns() {
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hidden_categories_prev JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hidden_categories_prev_at TIMESTAMP`); } catch { /* exists */ }
}

const asObj = (v: unknown): any => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);

async function load(id: string) {
  const proj = rowsOf(await db.execute(sql`
    SELECT hidden_categories, hidden_categories_updated_at, hidden_categories_prev, hidden_categories_prev_at
    FROM projects WHERE id = ${id} LIMIT 1`))[0];
  if (!proj) return null;
  const trees = rowsOf(await db.execute(sql`
    SELECT id, completed_at,
      semrush_snapshot->'_categoryBreakdown'->'keywordPaths'      AS kp,
      semrush_snapshot->'_categoryBreakdown'->'keywordCategories' AS kc,
      semrush_snapshot->'_categoryBreakdown'->'categories'        AS cats
    FROM analyses
    WHERE project_id = ${id} AND status = 'completed'
      AND semrush_snapshot->'_categoryBreakdown'->'keywordPaths' IS NOT NULL
    ORDER BY triggered_at DESC LIMIT 2`));
  const tree = (r: any): CarryTree | null => r ? { keywordPaths: asObj(r.kp) ?? {}, keywordCategories: asObj(r.kc) ?? {}, categories: asObj(r.cats) ?? [] } : null;
  return {
    hidden: asObj(proj.hidden_categories) ?? [],
    hiddenAt: proj.hidden_categories_updated_at ?? null,
    prevStore: asObj(proj.hidden_categories_prev),
    prevStoreAt: proj.hidden_categories_prev_at ?? null,
    current: tree(trees[0]), currentMeta: trees[0] ? { analysisId: trees[0].id, completedAt: trees[0].completed_at } : null,
    previous: tree(trees[1]), previousMeta: trees[1] ? { analysisId: trees[1].id, completedAt: trees[1].completed_at } : null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const d = await load(params.id);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!d.current) return NextResponse.json({ available: false, reason: 'no completed analysis' }, { headers: NO_STORE });
  const stale = staleHideKeys(d.hidden, d.current.keywordPaths);
  const out: any = { available: false, staleNow: stale.length, staleKeys: stale.slice(0, 20), hides: d.hidden.filter((h: any) => !h?.own).length,
    current: d.currentMeta, prev: d.previousMeta, canUndo: Array.isArray(d.prevStore), undoAt: d.prevStoreAt };
  if (d.previous && stale.length > 0) {
    const r = carrySelection(d.previous, d.hidden, d.current);
    out.available = true;
    out.result = { shared: r.shared, inBefore: r.inBefore, inAfter: r.inAfter, flipped: r.flipped, newKeywords: r.newKeywords, hides: r.hidden.filter(h => !h.own).length, generalRows: r.hidden.filter(h => h.own).length };
  }
  return NextResponse.json(out, { headers: NO_STORE });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body = apply */ }
  const d = await load(params.id);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body?.restore === true) {
    if (!Array.isArray(d.prevStore)) return NextResponse.json({ error: 'No earlier selection to restore' }, { status: 409 });
    await db.execute(sql`UPDATE projects SET hidden_categories = ${JSON.stringify(d.prevStore)}::jsonb, hidden_categories_updated_at = NOW(),
      hidden_categories_prev = ${JSON.stringify(d.hidden)}::jsonb, hidden_categories_prev_at = NOW() WHERE id = ${params.id}`);
    return NextResponse.json({ ok: true, restored: d.prevStore.length }, { headers: NO_STORE });
  }

  if (!d.current || !d.previous) return NextResponse.json({ error: 'Needs two completed analyses (the tree the selection was made on, and the current one)' }, { status: 409 });
  const r = carrySelection(d.previous, d.hidden, d.current);
  if (r.hidden.length === 0) return NextResponse.json({ error: 'Nothing to carry — the stored selection deselects nothing' }, { status: 409 });
  await db.execute(sql`UPDATE projects SET hidden_categories_prev = hidden_categories, hidden_categories_prev_at = NOW(),
    hidden_categories = ${JSON.stringify(r.hidden)}::jsonb, hidden_categories_updated_at = NOW() WHERE id = ${params.id}`);
  return NextResponse.json({ ok: true, shared: r.shared, inBefore: r.inBefore, inAfter: r.inAfter, flipped: r.flipped, newKeywords: r.newKeywords, entries: r.hidden.length }, { headers: NO_STORE });
}
