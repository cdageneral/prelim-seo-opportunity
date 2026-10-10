/**
 * /api/projects/[id]/page-overrides — v7.549
 *
 * Per-project "Set page" decisions: taxonomy path (' › ' joined — the Product Insights
 * node key / the cluster topic id without its 'tax:path:' prefix) → { url, setAt }.
 *
 * GET    → { overrides, updatedAt }
 * PUT    body { key, url }   sets ONE node's page (merged into the map; last write wins)
 * DELETE body { key }        reverts that node to the data rule
 *
 * Why a store at all: the page a node is "about" is decided by the ONE vote rule in
 * lib/pages/electPage.ts, which can only elect a page the client already ranks for on that
 * node's keywords. A hub page that ranks only for brand terms elsewhere (Citi's
 * /credit-cards/view-all-credit-cards, Wayne 2026-10-09) can never win that vote without
 * guessing — so the user states it, the decision is stored on the project (Const II.8) and
 * every surface labels it "set by you" (I.4). Applied at READ time via `_pageOverrides` on the
 * snapshot (page.tsx + hydrateSnapshotForPool), so it reconciles across the cluster
 * builder, Product Insights, the Profound join and the PDF with no re-analysis (II.7).
 *
 * Named columns only (II.9); auto-migrated ADD COLUMN IF NOT EXISTS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }        from 'zod';
import { db }       from '@/db';
import { projects } from '@/db/schema';
import { eq, sql }  from 'drizzle-orm';
import { validateOverrideUrl, type PageOverrides } from '@/lib/pages/electPage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS page_overrides JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS page_overrides_updated_at TIMESTAMP`); } catch { /* exists */ }
}

async function loadRow(id: string) {
  const [row] = await db.select({
    websiteUrl: projects.websiteUrl,
    overrides:  projects.pageOverrides,
    updatedAt:  projects.pageOverridesUpdatedAt,
  }).from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

const PutSchema = z.object({ key: z.string().min(1).max(600), url: z.string().min(1).max(2000) }).strict();
const DelSchema = z.object({ key: z.string().min(1).max(600) }).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const row = await loadRow(params.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ overrides: (row.overrides as PageOverrides | null) ?? {}, updatedAt: row.updatedAt ?? null }, { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const row = await loadRow(params.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const v = validateOverrideUrl(parsed.data.url, String(row.websiteUrl ?? ''));
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const overrides: PageOverrides = { ...((row.overrides as PageOverrides | null) ?? {}) };
  const now = new Date();
  overrides[parsed.data.key.trim()] = { url: v.url, setAt: now.toISOString() };
  await db.update(projects)
    .set({ pageOverrides: overrides, pageOverridesUpdatedAt: now, updatedAt: now } as any)
    .where(eq(projects.id, params.id));
  return NextResponse.json({ overrides, updatedAt: now.toISOString() }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = DelSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const row = await loadRow(params.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const overrides: PageOverrides = { ...((row.overrides as PageOverrides | null) ?? {}) };
  delete overrides[parsed.data.key.trim()];
  const now = new Date();
  await db.update(projects)
    .set({ pageOverrides: overrides, pageOverridesUpdatedAt: now, updatedAt: now } as any)
    .where(eq(projects.id, params.id));
  return NextResponse.json({ overrides, updatedAt: now.toISOString() }, { headers: NO_STORE });
}
