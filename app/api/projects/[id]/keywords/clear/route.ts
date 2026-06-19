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
import { and, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';

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

  // v7.243: per-box "Clear all" scope for the Keyword-panel workflow bar.
  //   scope:'client'     → only the CLIENT base rows (no competitor domain attached)
  //   scope:'competitor' → only COMPETITOR rows (any source, a domain attached)
  // Both genuinely DELETE the rows (no hiding). When scope is absent the legacy
  // source/domain behaviour is unchanged.
  const scope: 'client' | 'competitor' | null =
    body.scope === 'client' || body.scope === 'competitor' ? body.scope : null;
  const scopeCond =
    scope === 'client'     ? [isNull(projectKeywords.domain)]
    : scope === 'competitor' ? [isNotNull(projectKeywords.domain)]
    : [];
  // For a competitor-scope clear we delete across ALL sources (csv uploads come in as
  // 'csv' WITH a domain); the domain filter is what isolates competitor rows.
  const sourceCond = scope === 'competitor' ? [] : [inArray(projectKeywords.source, sources)];

  const deleted = await db
    .delete(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, params.id),
      ...sourceCond,
      ...(domain ? [eq(projectKeywords.domain, domain)] : []),
      ...scopeCond,
    ))
    .returning({ id: projectKeywords.id });

  return NextResponse.json({ deleted: deleted.length });
}
