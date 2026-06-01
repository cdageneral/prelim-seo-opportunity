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

async function ensureDataSourceColumn() {
  try {
    await db.execute(sql`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'auto'
    `);
  } catch { /* column already exists or DB unavailable */ }
}

const CreateProjectSchema = z.object({
  clientName:  z.string().min(1).max(200),
  websiteUrl:  z.string().url(),
  industry:    z.string().optional(),
  notes:       z.string().optional(),
  dataSource:  z.enum(['auto', 'upload']).optional().default('auto'),
});

export async function GET() {
  await ensureDataSourceColumn();
  const rows = await db.select().from(projects)
    .where(eq(projects.status, 'active'))
    .orderBy(desc(projects.createdAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  await ensureDataSourceColumn();
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { dataSource, ...rest } = parsed.data;

  const [project] = await db.insert(projects).values({
    ...rest,
    dataSource,
    clerkOrgId:  'default',
    clerkUserId: 'default',
  }).returning();

  return NextResponse.json({ project }, { status: 201 });
}
