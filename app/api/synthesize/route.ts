/**
 * POST /api/synthesize — Phase 2: Claude synthesis (SYNCHRONOUS)
 *
 * v7.2: No fire-and-forget. The handler awaits all Claude calls before
 * returning. The HTTP connection stays open → Lambda stays alive.
 *
 * Called by the client immediately after POST /api/analyze succeeds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }      from '@/db';
import { analyses, personas, opportunities, projects } from '@/db/schema';
import { eq }      from 'drizzle-orm';
import { runFullSynthesis } from '@/lib/claude/synthesize';

export const maxDuration = 300;

function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const analysisId = (body as any)?.analysisId as string | undefined;
  if (!analysisId) {
    return NextResponse.json({ error: 'Missing analysisId' }, { status: 400 });
  }

  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, analysisId),
  });

  if (!analysis) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }
  if (!analysis.semrushSnapshot) {
    return NextResponse.json(
      { error: 'Phase 1 snapshots not found. Run analysis again.' },
      { status: 400 }
    );
  }
  // Idempotency guard
  if (analysis.status === 'completed') {
    return NextResponse.json({ analysisId, status: 'completed' });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, analysis.projectId),
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    await db.update(analyses)
      .set({ status: 'failed', errorMessage: 'ANTHROPIC_API_KEY is not set.', completedAt: new Date() })
      .where(eq(analyses.id, analysisId));
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  console.log(`[OrbitIQ] Phase 2 starting for ${analysisId}`);

  const domain     = normalizeDomain(project.websiteUrl);
  const clientName = project.clientName;
  const industry   = project.industry ?? 'General';
  const semrush    = analysis.semrushSnapshot as any;
  const serp       = analysis.serpApiSnapshot  as any;
  const profound   = analysis.profoundSnapshot as any;

  try {
    const synthesis = await runFullSynthesis(domain, clientName, industry, semrush, serp, profound)
      .catch(err => {
        const msg = String((err as any)?.message ?? err);
        if (msg.includes('API key') || msg.includes('authentication') || msg.includes('401')) {
          throw new Error(`Anthropic API key error: ${msg}. Check ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.`);
        }
        throw new Error(`Claude synthesis failed: ${msg}`);
      });

    if (synthesis.personas.length > 0) {
      await db.insert(personas).values(
        synthesis.personas.map((p: any) => ({
          analysisId,
          segmentName:         p.segmentName,
          description:         p.description,
          intentStage:         p.intentStage,
          primaryQueries:      p.primaryQueries,
          painPoints:          p.painPoints,
          aiDiscoveryBehavior: p.aiDiscoveryBehavior,
          contentGaps:         p.contentGaps,
        }))
      );
    }

    if (synthesis.opportunities.length > 0) {
      await db.insert(opportunities).values(
        synthesis.opportunities.map((o: any) => ({
          analysisId,
          category:        o.category,
          title:           o.title,
          summary:         o.summary,
          impactScore:     o.impactScore,
          effortScore:     o.effortScore,
          estimatedVisits: o.estimatedVisits,
          estimatedLeads:  o.estimatedLeads,
          evidence:        o.evidence,
          rank:            o.rank,
        }))
      );
    }

    const hm = synthesis.heroMetrics;
    await db.update(analyses)
      .set({
        status:              'completed',
        completedAt:         new Date(),
        marketCaptureRate:   hm.marketCaptureRate,
        totalCategoryVolume: hm.totalCategoryVolume,
        clientOwnedVolume:   hm.clientOwnedVolume,
        keywordFootprint:    hm.keywordFootprint,
        aioAvailable:        hm.aioAvailable,
        aioAcquired:         hm.aioAcquired,
        topCompetitor:       hm.topCompetitor,
        semrushSnapshot: {
          ...(semrush as any),
          _narrative:          synthesis.narrative,
          _pptPrompt:          synthesis.pptPrompt,
          _categoryBreakdown:  synthesis.categoryBreakdown,
        } as any,
      })
      .where(eq(analyses.id, analysisId));

    console.log(`[OrbitIQ] Phase 2 complete for ${analysisId}`);
    return NextResponse.json({ analysisId, status: 'completed' });

  } catch (err) {
    console.error(`[OrbitIQ] Phase 2 failed for ${analysisId}:`, err);
    await db.update(analyses)
      .set({ status: 'failed', errorMessage: String((err as any)?.message ?? err), completedAt: new Date() })
      .where(eq(analyses.id, analysisId));
    return NextResponse.json(
      { error: String((err as any)?.message ?? err) },
      { status: 500 }
    );
  }
}
