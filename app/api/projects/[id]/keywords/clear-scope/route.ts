/**
 * POST /api/projects/[id]/keywords/clear-scope   (v7.325)
 *
 * TRUE scope delete for the Keyword Landscape summary-card trash. Unlike the older
 * /keywords/clear (which only deleted project_keywords rows), this clears the scope
 * from BOTH stores the cards read (Const II.7):
 *
 *   body { scope: 'client' | 'competitor' }
 *
 *   competitor →
 *     • project_keywords: delete competitor rows (type='gap' OR a domain attached)
 *     • competitors:      delete every tracked competitor for the project
 *     • snapshot:         clear gapKeywords / competitors / serpCompetitorPositions /
 *                         competitorPositionVol / competitorPositionDist on EVERY
 *                         analysis row (so the Competitor Gap card → 0, and SoV / Exec
 *                         drop the competitors).
 *
 *   client →
 *     • project_keywords: delete client rows (type != 'gap')
 *     • snapshot:         clear topKeywords / positionVol / positionDist /
 *                         localPackKeywords / _demandUniverse / _categoryBreakdown /
 *                         _audienceSegments on EVERY analysis row (clusters, journeys,
 *                         content plan and Exec are views over these, so they empty too).
 *
 * Genuine DELETE everywhere — never hides (matches the project's "delete, never hide"
 * rule). Real data only (Const I.1): we only remove fields, never fabricate.
 *
 * Why this exists: v7.324 wired the card trash to /keywords/clear, which left the
 * snapshot-side gap/footprint intact — the Competitor Gap card stayed populated while
 * the uploaded rows (the only carrier of the gap Local-Pack signal) were deleted,
 * collapsing Local Intent. This route is the fix.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }                                   from '@/db';
import { projectKeywords, competitors, analyses } from '@/db/schema';
import { and, eq, ne, or, isNotNull, sql }       from 'drizzle-orm';
import { clearScopeFromSnapshot, type ClearScope } from '@/lib/clearScope';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

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
  try { body = await req.json(); } catch { /* no body */ }

  const scope: ClearScope | null =
    body?.scope === 'client' || body?.scope === 'competitor' ? body.scope : null;
  if (!scope) {
    return NextResponse.json(
      { error: "scope must be 'client' or 'competitor'" },
      { status: 400, headers: NO_STORE },
    );
  }

  // 1. project_keywords — competitor = gap rows or rows tagged with a domain;
  //    client = every non-gap (client base) row.
  const kwWhere = scope === 'competitor'
    ? and(
        eq(projectKeywords.projectId, params.id),
        or(eq(projectKeywords.type, 'gap'), isNotNull(projectKeywords.domain)),
      )
    : and(
        eq(projectKeywords.projectId, params.id),
        ne(projectKeywords.type, 'gap'),
      );

  const deletedKw = await db.delete(projectKeywords)
    .where(kwWhere)
    .returning({ id: projectKeywords.id });

  // 2. competitors table (competitor scope only)
  let deletedCompetitors = 0;
  if (scope === 'competitor') {
    const dc = await db.delete(competitors)
      .where(eq(competitors.projectId, params.id))
      .returning({ id: competitors.id });
    deletedCompetitors = dc.length;
  }

  // 3. snapshot — clear the scope's fields on EVERY analysis row for the project so a
  //    stale analysis can't resurface the deleted data.
  const rows = await db.select().from(analyses).where(eq(analyses.projectId, params.id));
  let updatedAnalyses = 0;
  for (const a of rows) {
    const snap = (a as any).semrushSnapshot;
    if (!snap || typeof snap !== 'object') continue;
    const next = clearScopeFromSnapshot(snap, scope);
    await db.update(analyses)
      .set({ semrushSnapshot: next as any })
      .where(eq(analyses.id, (a as any).id));
    updatedAnalyses++;
  }

  return NextResponse.json(
    { scope, deletedKeywords: deletedKw.length, deletedCompetitors, updatedAnalyses },
    { headers: NO_STORE },
  );
}
