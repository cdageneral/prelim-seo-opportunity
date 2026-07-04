/**
 * /api/projects
 * GET  — list all projects
 * POST — create a new project
 *
 * v7.32: accepts dataSource ('auto'|'upload') on create; auto-migrates
 *        the data_source column for databases created before v7.32.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
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
  // v7.268: `db.select().from(projects)` below selects EVERY column declared in the schema,
  // so any optional column that exists in the schema but not yet in the DB makes this list
  // query 500 — which blanks the whole project list. The build script is `next build` only
  // (no drizzle-kit push), so columns are created exclusively by these runtime ensure calls.
  // Therefore the projects-list endpoint must guarantee EVERY runtime-migrated optional
  // column exists here, not only inside each feature route (the dashboard loads before any
  // feature route runs). Each is ADD COLUMN IF NOT EXISTS — idempotent and safe.
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_terms JSONB`);                                       // v7.206
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_terms_updated_at TIMESTAMP`);                        // v7.206
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS excluded_brands JSONB`);                                   // v7.208
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS excluded_brands_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections JSONB`);                           // v7.260
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections JSONB`);                                  // v7.267
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
  // v7.270: the list route selects every schema column, so a column that exists in the
  // schema but not the DB crashes the dashboard (the v7.268 lesson). Ensure the new
  // namespaced-scope columns here too.
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_workstreams JSONB`);                                 // v7.270
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_workstreams_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
  // v7.318: Profound panel server-side persistence. The list query below selects every schema
  // column, so these MUST be ensured here too (v7.268 lesson) or the dashboard 500s.
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_data JSONB`);                     // v7.318
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_data_updated_at TIMESTAMP`);      // v7.318
  } catch { /* already exists */ }
  // v7.342: project-level taxonomy anchor — survives the full keyword reset (Const III.1e).
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS taxonomy_anchor JSONB`);                   // v7.342
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS taxonomy_anchor_updated_at TIMESTAMP`);    // v7.342
  } catch { /* already exists */ }
}

// v7.99: valid market codes come from the single source of truth in markets.ts
const marketCodes = MARKETS.map(m => m.code) as [string, ...string[]];

const CreateProjectSchema = z.object({
  clientName:               z.string().min(1).max(200),
  websiteUrl:               z.string().url(),
  industry:                 z.string().optional(),
  notes:                    z.string().optional(),
  dataSource:               z.enum(['auto', 'upload']).optional().default('auto'),
  kwVolThresholdClient:     z.number().int().min(0).optional().default(0),
  kwVolThresholdCompetitor: z.number().int().min(0).optional().default(0),
  semrushDatabase:          z.enum(marketCodes).optional().default('us'),   // v7.99: per-project market
});

export async function GET() {
  await ensureColumns();
  const rows = await db.select().from(projects)
    .where(eq(projects.status, 'active'))
    .orderBy(desc(projects.createdAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  await ensureColumns();
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { dataSource, kwVolThresholdClient, kwVolThresholdCompetitor, semrushDatabase, ...rest } = parsed.data;

  const [project] = await db.insert(projects).values({
    ...rest,
    dataSource,
    kwVolThresholdClient:     kwVolThresholdClient     ?? 0,
    kwVolThresholdCompetitor: kwVolThresholdCompetitor ?? 0,
    semrushDatabase:          semrushDatabase          ?? 'us',
    clerkOrgId:  'default',
    clerkUserId: 'default',
  }).returning();

  return NextResponse.json({ project }, { status: 201 });
}
