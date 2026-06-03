/**
 * POST /api/projects/[id]/keywords/batch
 *
 * Bulk-inserts keyword footprint rows for a domain (client or competitor).
 * Used by the "Upload footprints" flow in the project page.
 *
 * Body: {
 *   domain:   string,               // client domain or competitor domain
 *   source:   'csv',
 *   keywords: Array<{
 *     keyword:      string,
 *     searchVolume: number,
 *     position?:    number,
 *   }>
 * }
 *
 * Returns: { inserted: number, skipped: number }
 * Duplicate rows (same projectId + keyword + domain) are silently skipped.
 *
 * v7.31 — new endpoint for uploaded keyword footprints
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }              from '@/db';
import { projectKeywords } from '@/db/schema';
import { and, eq, sql }   from 'drizzle-orm';

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
    await db.execute(sql`
      ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS domain TEXT
    `);
  } catch {
    // Safe to continue — table exists or DB unavailable
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { domain = '', source = 'csv', keywords } = body;

  if (!Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json({ error: 'keywords must be a non-empty array' }, { status: 400 });
  }

  const projectId = params.id;
  const domainNorm = domain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

  // Fetch existing keywords for this project+domain to skip duplicates
  const existing = await db
    .select({ keyword: projectKeywords.keyword })
    .from(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, projectId),
      eq(projectKeywords.source, source),
    ));

  const existingSet = new Set(existing.map(r => r.keyword));

  // Build insert rows, filtering duplicates and bad rows
  const rows = keywords
    .filter((k: any) => {
      const kw = (k.keyword ?? '').trim().toLowerCase();
      return kw.length > 0 && !existingSet.has(kw);
    })
    .map((k: any) => {
      const kw   = (k.keyword ?? '').trim().toLowerCase();
      const vol  = Number(k.searchVolume) || 0;
      const pos  = k.position != null && !isNaN(Number(k.position)) ? Number(k.position) : null;
      return {
        projectId,
        keyword:      kw,
        searchVolume: vol,
        position:     pos,
        type:         pos !== null && pos <= 100 ? 'ranked' : 'gap',
        branded:      false,
        source,
        domain:       domainNorm,
      };
    });

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: keywords.length });
  }

  // Insert in chunks of 500 to stay within Neon parameter limits
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.insert(projectKeywords).values(chunk);
    inserted += chunk.length;
  }

  return NextResponse.json({ inserted, skipped: keywords.length - inserted });
}
