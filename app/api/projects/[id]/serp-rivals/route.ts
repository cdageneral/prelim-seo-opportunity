/**
 * /api/projects/[id]/serp-rivals  (v7.323)
 *
 * Opt-in "Top SERP rivals" enrichment for UPLOAD-footprint projects.
 *
 *   GET  → unit estimate for the competitor-only pull (no data fetched/billed beyond
 *          the cheap competitor-discovery + overview rows the estimate itself needs).
 *   POST → pull the Semrush auto-discovered competitor footprints, intersect with the
 *          project's existing (uploaded) snapshot.topKeywords, and MERGE the resulting
 *          `serpCompetitorPositions` into the latest completed analysis's semrushSnapshot.
 *          The client footprint is NOT re-pulled — only competitor footprints — so the
 *          uploaded data is untouched (Const I.1: real positions only; nothing modeled).
 *
 * Why this exists: buildSnapshotFromUploads never pulls Semrush competitor footprints, so
 * the v7.322 SoV SERP-rivals slices have no data on upload projects. This is the deliberate,
 * cost-shown action that supplies them. Auto (Semrush) projects already get the field for
 * free during analysis and don't need this.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }                        from '@/db';
import { analyses, projects }        from '@/db/schema';
import { and, desc, eq }             from 'drizzle-orm';
import { setUsageProject }           from '@/lib/usage/context';
import { getMarket }                 from '@/lib/utils/markets';
import { enrichSerpCompetitors, estimateSerpCompetitorPull } from '@/lib/apis/semrush';

export const runtime  = 'nodejs';            // AsyncLocalStorage usage attribution needs Node
export const dynamic  = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

// Mirror of analyze/route.ts normalizeDomain (kept local to avoid editing that route).
function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

async function loadCtx(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with:  { competitors: true },
  });
  if (!project) return null;
  const domain = normalizeDomain((project as any).websiteUrl);
  const market = getMarket((project as any).semrushDatabase);
  const manual: string[] = (((project as any).competitors ?? []) as Array<{ domain: string }>)
    .map(c => c.domain)
    .filter(Boolean);
  const analysis = await db.query.analyses.findFirst({
    where:   and(eq(analyses.projectId, projectId), eq(analyses.status, 'completed')),
    orderBy: [desc(analyses.triggeredAt)],
  });
  return { project, domain, market, manual, analysis };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  setUsageProject(params.id);
  const ctx = await loadCtx(params.id);
  if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: NO_STORE });
  try {
    const compFloor = (ctx.project as any).kwVolThresholdCompetitor ?? 0;
    const est = await estimateSerpCompetitorPull(ctx.domain, ctx.manual, compFloor, ctx.market.code);
    return NextResponse.json(est, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not estimate: ${String((err as any)?.message ?? err)}` },
      { status: 502, headers: NO_STORE },
    );
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  setUsageProject(params.id);
  const ctx = await loadCtx(params.id);
  if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: NO_STORE });

  const snap = (ctx.analysis?.semrushSnapshot ?? null) as any;
  if (!snap || !Array.isArray(snap.topKeywords) || snap.topKeywords.length === 0) {
    return NextResponse.json(
      { error: 'No completed analysis with a keyword footprint to enrich. Run an analysis (or upload a footprint) first.' },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const compFloor = (ctx.project as any).kwVolThresholdCompetitor ?? 0;
    const { serpCompetitorPositions, competitorsPulled, warnings } = await enrichSerpCompetitors(
      ctx.domain,
      snap.topKeywords as Array<{ keyword: string }>,
      ctx.manual,
      compFloor,
      ctx.market.code,
    );

    // Merge ONLY the new field into the stored snapshot — leave the uploaded footprint,
    // competitors, gaps, and every other field exactly as they were.
    const merged = { ...snap, serpCompetitorPositions };
    await db.update(analyses)
      .set({ semrushSnapshot: merged as any })
      .where(eq(analyses.id, ctx.analysis!.id));

    return NextResponse.json(
      {
        serpCompetitorPositions,
        competitorsPulled,
        rivalsFound: Object.keys(serpCompetitorPositions).length,
        warnings,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `SERP-rivals pull failed: ${String((err as any)?.message ?? err)}` },
      { status: 502, headers: NO_STORE },
    );
  }
}
