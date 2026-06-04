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
 * Returns: { inserted: number, updated: number, skipped: number }
 *
 * v7.31 — new endpoint for uploaded keyword footprints
 * v7.92 — UPSERT semantics: re-uploading a keyword that already exists for the
 *         same domain UPDATES its searchVolume/position/type instead of being
 *         skipped. Required so corrected CSVs can repair rows stored before
 *         header-aware parsing (rank positions had been saved as volumes).
 *         Duplicate check is now per-domain (was per-source only, which also
 *         blocked the same keyword from existing under two competitors).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }              from '@/db';
import { projectKeywords } from '@/db/schema';
import { and, eq, sql, or, isNull, inArray }   from 'drizzle-orm';

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

  // v7.92: duplicate check scoped to THIS domain (client rows have domain ''
  // or NULL from older versions — match both).
  const domainCond = domainNorm === ''
    ? or(eq(projectKeywords.domain, ''), isNull(projectKeywords.domain))
    : eq(projectKeywords.domain, domainNorm);

  const existing = await db
    .select({ keyword: projectKeywords.keyword })
    .from(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, projectId),
      eq(projectKeywords.source, source),
      domainCond,
    ));
  const existingSet = new Set(existing.map((r: any) => r.keyword));

  // Build valid rows (dedupe within the payload itself, keep last occurrence)
  const byKw = new Map<string, any>();
  for (const k of keywords) {
    const kw = (k?.keyword ?? '').trim().toLowerCase();
    if (kw.length === 0) continue;
    const vol = Number(k.searchVolume) || 0;
    const pos = k.position != null && !isNaN(Number(k.position)) ? Number(k.position) : null;
    byKw.set(kw, {
      projectId,
      keyword:      kw,
      searchVolume: vol,
      position:     pos,
      type:         pos !== null && pos <= 100 ? 'ranked' : 'gap',
      branded:      false,
      source,
      domain:       domainNorm,
    });
  }
  const rows     = Array.from(byKw.values());
  const toUpdate = rows.filter(r => existingSet.has(r.keyword));
  const toInsert = rows.filter(r => !existingSet.has(r.keyword));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, skipped: keywords.length });
  }

  const CHUNK = 500;

  // v7.92 UPSERT: delete the existing rows for re-uploaded keywords, then
  // insert everything fresh — repairs volume/position/type in place.
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const kwChunk = toUpdate.slice(i, i + CHUNK).map(r => r.keyword);
    await db.delete(projectKeywords).where(and(
      eq(projectKeywords.projectId, projectId),
      eq(projectKeywords.source, source),
      domainCond,
      inArray(projectKeywords.keyword, kwChunk),
    ));
  }
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(projectKeywords).values(rows.slice(i, i + CHUNK));
  }

  return NextResponse.json({
    inserted: toInsert.length,
    updated:  toUpdate.length,
    skipped:  keywords.length - rows.length,
  });
}
