/**
 * POST /api/analyze  — trigger analysis
 * GET  /api/analyze  — poll status
 */

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { z }       from 'zod';
import { db }      from '@/db';
import { analyses, personas, opportunities, projects } from '@/db/schema';
import { eq }      from 'drizzle-orm';
import { getSemrushSnapshot } from '@/lib/apis/semrush';
import { getSerpApiSnapshot } from '@/lib/apis/serp';
import { getProfoundSnapshot } from '@/lib/apis/profound';
import { runFullSynthesis } from '@/lib/claude/synthesize';

export const maxDuration = 300; // Vercel Pro: up to 300s for long-running analysis

const AnalyzeSchema = z.object({ projectId: z.string().uuid() });

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

  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = parsed.data;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { competitors: true },
  });

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const domain   = normalizeDomain(project.websiteUrl);
  const industry = project.industry ?? 'General';

  const [analysis] = await db.insert(analyses).values({
    projectId,
    status:     'running',
    triggeredAt: new Date(),
  }).returning();

  // waitUntil keeps the Vercel Lambda alive after the response is sent
  // so the long-running analysis (SerpAPI + Claude) can complete.
  waitUntil(
    runAnalysis(analysis.id, domain, project.clientName, industry, (project as any).competitors ?? [])
      .catch(async (err) => {
        console.error(`[OrbitIQ] Analysis ${analysis.id} failed:`, err);
        await db.update(analyses)
          .set({ status: 'failed', errorMessage: String(err), completedAt: new Date() })
          .where(eq(analyses.id, analysis.id));
      })
  );

  return NextResponse.json({ analysisId: analysis.id, status: 'running' });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, id),
  });

  if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    analysisId:   analysis.id,
    status:       analysis.status,
    triggeredAt:  analysis.triggeredAt,
    completedAt:  analysis.completedAt,
    errorMessage: analysis.errorMessage,
    heroMetrics: analysis.status === 'completed' ? {
      marketCaptureRate:   analysis.marketCaptureRate,
      totalCategoryVolume: analysis.totalCategoryVolume,
      clientOwnedVolume:   analysis.clientOwnedVolume,
      keywordFootprint:    analysis.keywordFootprint,
      aioAvailable:        analysis.aioAvailable,
      aioAcquired:         analysis.aioAcquired,
      topCompetitor:       analysis.topCompetitor,
    } : null,
  });
}

async function runAnalysis(
  analysisId: string,
  domain: string,
  clientName: string,
  industry: string,
  manualCompetitors: Array<{ domain: string }>
) {
  console.log(`[OrbitIQ] Analysis ${analysisId}: fetching APIs for ${domain}`);

  const [semrush, profound] = await Promise.all([
    getSemrushSnapshot(domain),
    getProfoundSnapshot(domain),
  ]);

  // Merge manual competitors into Semrush snapshot so gap analysis uses them
  if (manualCompetitors.length > 0) {
    const existing = new Set(semrush.competitors.map(c => c.domain));
    for (const mc of manualCompetitors) {
      if (!existing.has(mc.domain)) {
        semrush.competitors.unshift({
          domain:          mc.domain,
          commonKeywords:  0,
          organicKeywords: 0,
          organicTraffic:  0,
          relevance:       1,
        });
      }
    }
  }

  const topKeywords = semrush.topKeywords.slice(0, 50).map(k => k.keyword);
  const serp = await getSerpApiSnapshot(domain, topKeywords);

  await db.update(analyses)
    .set({
      semrushSnapshot:  semrush as any,
      serpApiSnapshot:  serp    as any,
      profoundSnapshot: profound as any,
    })
    .where(eq(analyses.id, analysisId));

  const synthesis = await runFullSynthesis(domain, clientName, industry, semrush, serp, profound);

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
        _narrative: synthesis.narrative,
        _pptPrompt: synthesis.pptPrompt,
      } as any,
    })
    .where(eq(analyses.id, analysisId));

  console.log(`[OrbitIQ] Analysis ${analysisId}: complete`);
}
