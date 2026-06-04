/**
 * GET /api/projects/[id]/semrush-estimate — pre-run Semrush cost estimate (v7.86)
 *
 * Returns the keyword-row counts and API-unit cost of a full uncapped
 * analysis pull (client footprint + up to 5 competitor footprints), so the
 * UI can show a confirmation with real numbers before any units are spent.
 * The estimate itself costs only a handful of rows.
 *
 * Returns: { client, competitors, totalRows, totalUnits }  (see SemrushPullEstimate)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { estimateSemrushPull } from '@/lib/apis/semrush';

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!process.env.SEMRUSH_API_KEY) {
    return NextResponse.json(
      { error: 'SEMRUSH_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with:  { competitors: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const domain = project.websiteUrl
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const manualCompetitorDomains: string[] = ((project as any).competitors ?? [])
    .map((c: { domain: string }) => c.domain)
    .filter(Boolean);

  try {
    // v7.98: pass the project's volume floors so the response reports them and
    // flags the estimate as a ceiling (per-domain counts are unfiltered totals).
    const estimate = await estimateSemrushPull(
      domain,
      manualCompetitorDomains,
      (project as any).kwVolThresholdClient ?? 0,
      (project as any).kwVolThresholdCompetitor ?? 0,
      (project as any).semrushDatabase ?? 'us',   // v7.99: per-project market
    );
    return NextResponse.json({ ...estimate, database: (project as any).semrushDatabase ?? 'us' });
  } catch (err) {
    return NextResponse.json(
      { error: `Semrush estimate failed: ${String((err as any)?.message ?? err)}` },
      { status: 502 }
    );
  }
}
