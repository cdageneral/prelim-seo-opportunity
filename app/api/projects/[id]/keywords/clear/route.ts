/**
 * POST /api/projects/[id]/keywords/clear
 *
 * Bulk-clears keyword rows for a project in a single SQL statement.
 * Far more reliable than individual DELETEs for large keyword sets.
 *
 * Body: { sources?: string[], domain?: string }
 *   sources defaults to ['csv','custom','blocked']
 *   domain (v7.101) — when present, only rows tagged with that domain are
 *   deleted (used by the Competitors manager to clear a single competitor's
 *   uploaded CSV without touching client keywords or other competitors).
 * Returns: { deleted: number }
 *
 * v7.101
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

  // v7.101: optional per-domain clear (single competitor's uploaded rows)
  const domain: string | null =
    typeof body.domain === 'string' && body.domain.trim().length > 0
      ? body.domain.trim().toLowerCase()
      : null;

  const deleted = await db
    .delete(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, params.id),
      inArray(projectKeywords.source, sources),
      ...(domain ? [eq(projectKeywords.domain, domain)] : []),
    ))
    .returning({ id: projectKeywords.id });

  return NextResponse.json({ deleted: deleted.length });
}
