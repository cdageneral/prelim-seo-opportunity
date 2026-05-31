/**
 * /api/projects/[id]/keywords
 *
 * GET    — returns all projectKeywords rows for this project
 * POST   — add a custom/csv keyword, or block a semrush keyword
 *            body: { keyword, searchVolume?, position?, type?, branded?, source }
 *            source: 'custom' | 'csv' | 'blocked'
 *            Returns 409 if an identical (projectId + keyword + source-class) record already exists.
 * DELETE — body: { keyword, source }
 *            source 'custom'|'csv' → hard DELETE the row
 *            source 'blocked'      → hard DELETE the blocked row (un-hides the semrush keyword)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }               from '@/db';
import { projectKeywords }  from '@/db/schema';
import { and, eq, sql }     from 'drizzle-orm';

// ─── Auto-migration ───────────────────────────────────────────────────────────
// project_keywords was added in v7.19 and requires a manual db:push that
// non-technical users never run. This creates the table on first API call
// if it doesn't exist yet — completely idempotent, no-op when table exists.

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
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } catch {
    // Table already exists or DB not available — safe to continue
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();
  const rows = await db
    .select()
    .from(projectKeywords)
    .where(eq(projectKeywords.projectId, params.id));

  return NextResponse.json({ keywords: rows });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { keyword, searchVolume = 0, position = null, type = 'gap', branded = false, source } = body;

  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
  }
  if (!['custom', 'csv', 'blocked'].includes(source)) {
    return NextResponse.json({ error: 'source must be custom, csv, or blocked' }, { status: 400 });
  }

  const kwNorm = keyword.trim().toLowerCase();

  // Duplicate check: same project + same normalized keyword + same source category
  // For 'blocked', check for any existing 'blocked' row with that keyword.
  // For 'custom'/'csv', check for any existing non-blocked row with that keyword.
  const existing = await db
    .select()
    .from(projectKeywords)
    .where(
      and(
        eq(projectKeywords.projectId, params.id),
        eq(projectKeywords.keyword,   kwNorm),
        eq(projectKeywords.source,    source),
      ),
    );

  if (existing.length > 0) {
    return NextResponse.json({ error: 'Duplicate keyword', duplicate: true }, { status: 409 });
  }

  const [inserted] = await db
    .insert(projectKeywords)
    .values({
      projectId:    params.id,
      keyword:      kwNorm,
      searchVolume: Number(searchVolume) || 0,
      position:     position != null ? Number(position) : null,
      type:         type === 'ranked' ? 'ranked' : 'gap',
      branded:      Boolean(branded),
      source,
    })
    .returning();

  return NextResponse.json({ keyword: inserted }, { status: 201 });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { keyword, source } = body;

  if (!keyword || typeof keyword !== 'string') {
    return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
  }
  if (!source) {
    return NextResponse.json({ error: 'source is required' }, { status: 400 });
  }

  const kwNorm = keyword.trim().toLowerCase();

  await db
    .delete(projectKeywords)
    .where(
      and(
        eq(projectKeywords.projectId, params.id),
        eq(projectKeywords.keyword,   kwNorm),
        eq(projectKeywords.source,    source),
      ),
    );

  return NextResponse.json({ success: true });
}
