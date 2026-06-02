/**
 * POST /api/projects/[id]/keywords/clear
 *
 * Bulk-clears keyword rows for a project in a single SQL statement.
 * Far more reliable than individual DELETEs for large keyword sets.
 *
 * Body: { sources?: string[] }  defaults to ['csv','custom','blocked']
 * Returns: { deleted: number }
 *
 * v7.55.7
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }              from '@/db';
import { projectKeywords } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

async function ensureTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_keywords (
        id            SERIAL    PRIMARY KEY,
        project_id    UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        keyword       TEXT      NOT NULL,
        search_volume INTEGER   NOT NULL DEFAULT 0,
        position      INTEGER,
        type          TEXT      NOT NULL DEFAULT 'gap',
        branded       BOOLEAN   NOT NULL DEFAULT false,
        source        TEXT      NOT NULL,
        domain        TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS domain TEXT`);
  } catch { /* table exists */ }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();

  let body: any = {};
  try { body = await req.json(); } catch { /* no body = use defaults */ }

  const sources: string[] = Array.isArray(body.sources)
    ? body.sources
    : ['csv', 'custom', 'blocked'];

  const deleted = await db
    .delete(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, params.id),
      inArray(projectKeywords.source, sources),
    ))
    .returning({ id: projectKeywords.id });

  return NextResponse.json({ deleted: deleted.length });
}
