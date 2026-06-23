/**
 * /api/projects/[id]
 * GET    — project + analyses + competitors
 * PATCH  — update name, url, industry, notes, dataSource
 * DELETE — hard delete project
 *
 * v7.32: PATCH now accepts dataSource; auto-migrates data_source column.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { MARKETS } from '@/lib/utils/markets';

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'auto'`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS kw_vol_threshold_client INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS kw_vol_threshold_competitor INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS semrush_database TEXT NOT NULL DEFAULT 'us'`);   // v7.99
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_terms JSONB`);                              // v7.206
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_terms_updated_at TIMESTAMP`);              // v7.206
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS excluded_brands JSONB`);                          // v7.208
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS excluded_brands_updated_at TIMESTAMP`);          // v7.208
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections JSONB`);                  // v7.260
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_updated_at TIMESTAMP`);  // v7.260
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections JSONB`);                        // v7.267 (v7.268: also ensured here for deep-links)
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections_updated_at TIMESTAMP`);        // v7.267
  } catch { /* already exists */ }
}

const marketCodes = MARKETS.map(m => m.code) as [string, ...string[]];   // v7.99

const UpdateSchema = z.object({
  clientName:               z.string().min(1).optional(),
  websiteUrl:               z.string().url().optional(),
  industry:                 z.string().optional(),
  notes:                    z.string().optional(),
  status:                   z.enum(['active', 'archived', 'draft']).optional(),
  dataSource:               z.enum(['auto', 'upload']).optional(),
  kwVolThresholdClient:     z.number().int().min(0).optional(),
  kwVolThresholdCompetitor: z.number().int().min(0).optional(),
  semrushDatabase:          z.enum(marketCodes).optional(),   // v7.99: per-project market
  // v7.206: client brand vocabulary. Terms are lowercased/trimmed/de-duped and
  // empties dropped server-side. Editing this stamps brand_terms_updated_at.
  brandTerms:               z.array(z.string().max(120)).max(1000).optional(),
  // v7.208: competitor/third-party brand blocklist. Normalised + stamped server-side.
  excludedBrands:           z.array(z.string().max(120)).max(1000).optional(),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: {
      analyses: {
        orderBy: (a, { desc }) => [desc(a.triggeredAt)],
        limit: 5,
        with: {
          opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] },
          personas:      true,
        },
      },
      competitors: { orderBy: (c, { asc }) => [asc(c.createdAt)] },
    },
  });

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // v7.206: normalise brand terms (lowercase, trim, de-dupe, drop empties) and
  // stamp the edit time so the UI can show a last-updated label (Art IV.5).
  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.brandTerms !== undefined) {
    patch.brandTerms = Array.from(new Set(
      parsed.data.brandTerms.map(t => t.toLowerCase().trim()).filter(Boolean),
    ));
    patch.brandTermsUpdatedAt = new Date();
  }
  // v7.208: same normalisation for the competitor-brand blocklist.
  if (parsed.data.excludedBrands !== undefined) {
    patch.excludedBrands = Array.from(new Set(
      parsed.data.excludedBrands.map(t => t.toLowerCase().trim()).filter(Boolean),
    ));
    patch.excludedBrandsUpdatedAt = new Date();
  }

  const [updated] = await db.update(projects)
    .set(patch)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.delete(projects).where(eq(projects.id, params.id));
  return NextResponse.json({ success: true });
}
