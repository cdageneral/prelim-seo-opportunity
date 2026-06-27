/**
 * POST /api/projects/[id]/keywords/reset
 *
 * FULL RESET — "start over" for a project. Genuinely DELETES the project's
 * keyword footprint; it does NOT hide/block anything (the old Clear All masked
 * Semrush keywords with 'blocked' rows, which left them in the DB and only
 * partially hid them). This wipes:
 *
 *   1. every project_keywords row (client + competitor uploads + any 'blocked'
 *      masking rows, all sources), and
 *   2. every analyses row for the project — which cascades to the analysis's
 *      personas, opportunities and reports (FK ON DELETE CASCADE). The Semrush
 *      footprint lives inside analyses.semrush_snapshot (a JSON blob), so the
 *      only way to truly remove it is to delete the analysis record.
 *
 * Deliberately PRESERVED (project configuration / spend record, not footprint):
 *   - the project row, its competitors list, brand terms and excluded-brand
 *     blocklist (so the user doesn't have to re-enter setup), and
 *   - the api_usage ledger (real credit-spend history — must survive a reset).
 *
 * After this the project is back to a blank, pre-analysis state, ready to
 * re-run analysis or upload fresh keywords.
 *
 * Returns: { deletedKeywords: number, deletedAnalyses: number }
 *
 * v7.233
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }                         from '@/db';
import { projectKeywords, analyses }  from '@/db/schema';
import { eq, sql }                    from 'drizzle-orm';

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
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();

  // 1. Delete every keyword row for the project (all sources — true wipe).
  const deletedKeywords = await db
    .delete(projectKeywords)
    .where(eq(projectKeywords.projectId, params.id))
    .returning({ id: projectKeywords.id });

  // 2. Delete every analysis for the project. FK ON DELETE CASCADE removes the
  //    dependent personas / opportunities / reports automatically.
  const deletedAnalyses = await db
    .delete(analyses)
    .where(eq(analyses.projectId, params.id))
    .returning({ id: analyses.id });

  return NextResponse.json({
    deletedKeywords: deletedKeywords.length,
    deletedAnalyses: deletedAnalyses.length,
  });
}
