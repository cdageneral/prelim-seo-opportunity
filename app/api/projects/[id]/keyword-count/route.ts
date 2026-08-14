/**
 * GET /api/projects/[id]/keyword-count — v7.446
 *
 * The Keyword Landscape panel's "All Keywords" count for ONE project, so the
 * cross-project API Usage table can show it beside that project's spend without
 * the user opening every project in turn (Wayne, 2026-08-14).
 *
 * It READS the panel's basis, it does not re-derive one (Const II.6a):
 *   • the same canonical pool — buildKwPool on the snapshot hydrated by the
 *     shared hydrateSnapshotForPool (brand vocabulary, blocklist, scope-gate
 *     overrides, hidden categories), exactly as the client page does;
 *   • the same FULL-footprint options the "All Keywords" card uses —
 *     clientVolMin 0, competitorVolMin 0, includeDemand true (the panel's
 *     `summaryRows`, NOT the volume-floored table below the cards);
 *   • the same membership predicate — lib/keywordLandscape.
 * SERP enrichment is deliberately not applied: it decorates rows, it never
 * changes which rows exist, so the count is identical without it.
 *
 * ONE PROJECT PER REQUEST, ON PURPOSE. A single `semrush_snapshot` runs to
 * millions of bytes on a large project (First Citizens: 7,040 keywords), and
 * v7.445 is the record of what happens when a route asks for several at once —
 * Neon refuses the query outright with HTTP 507 "response is too large". A
 * cross-project route would have to load EVERY snapshot in one response and
 * would fail on exactly the biggest accounts. So the caller fans out, gets each
 * count as it lands, and can show real progress instead of one long blank wait
 * (Const IV.4). Only the snapshot column is selected — never the whole analysis
 * row, which also carries the SERP and Profound payloads this has no use for.
 *
 * No metered API is touched: this is database reads only, so calling it costs
 * nothing and it is not written to the usage ledger.
 *
 * Returns { projectId, keywordCount, hasAnalysis, basis }.
 * `hasAnalysis: false` with `keywordCount: null` is the honest gap (Const I.5)
 * for a project that has never completed an analysis — never a zero, which
 * would read as "we looked and there are none".
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { analyses, projects, projectKeywords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildKwPool } from '@/lib/utils/kwVolume';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { allKeywordsCount } from '@/lib/keywordLandscape';
import { latestAnalysisIdWithSnapshot } from '@/lib/latestAnalysis';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

/** Same normalization the scan routes use for the client domain. */
function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with:  { competitors: true },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Resolve the id in SQL, then fetch ONE column of ONE row (v7.445 lesson).
  const analysisId = await latestAnalysisIdWithSnapshot(projectId);
  if (!analysisId) {
    return NextResponse.json({
      projectId, keywordCount: null, hasAnalysis: false,
      basis: 'No completed analysis carries a keyword snapshot for this project.',
    }, { headers: NO_STORE });
  }

  const snapRows = await db
    .select({ semrushSnapshot: analyses.semrushSnapshot })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .limit(1);
  const snapshot = snapRows[0]?.semrushSnapshot ?? null;
  if (!snapshot) {
    return NextResponse.json({
      projectId, keywordCount: null, hasAnalysis: false,
      basis: 'No completed analysis carries a keyword snapshot for this project.',
    }, { headers: NO_STORE });
  }

  const dbKws = await db.select().from(projectKeywords)
    .where(eq(projectKeywords.projectId, projectId));

  const brandTerms: string[] = Array.isArray((project as any).brandTerms)
    ? ((project as any).brandTerms as string[]) : [];
  const competitorDomains: string[] = (((project as any).competitors ?? []) as Array<{ domain: string }>)
    .map(c => c.domain).filter(Boolean);
  // The panel reads `analysis.semrushSnapshot.domain` first and falls back to the
  // project's website URL — mirror that order, or a snapshot-less domain silently
  // changes which keywords count as branded.
  const clientDomain = ((snapshot as any)?.domain as string) || normalizeDomain(project.websiteUrl);

  const pool = buildKwPool({
    semrushSnapshot:   hydrateSnapshotForPool(project, snapshot),
    uploadedKeywords:  dbKws,
    clientDomain,
    competitorDomains,
    clientVolMin:      0,      // full footprint — the "All Keywords" card basis
    competitorVolMin:  0,
    brandTerms,
    includeDemand:     true,
  });

  return NextResponse.json({
    projectId,
    keywordCount: allKeywordsCount(pool),
    hasAnalysis:  true,
    basis: 'Keyword Landscape "All Keywords" — client footprint + attributed competitor gap, full footprint (no volume floor).',
  }, { headers: NO_STORE });
}
