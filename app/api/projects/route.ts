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
