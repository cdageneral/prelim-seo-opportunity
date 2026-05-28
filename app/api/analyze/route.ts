/**
 * POST /api/analyze
 *
 * Main analysis orchestration:
 *  1. Validate input
 *  2. Create analysis record (pending)
 *  3. Fire parallel API calls (Semrush + SerpAPI + Profound)
 *  4. Store raw snapshots in Neon
 *  5. Run Claude synthesis pipeline
 *  6. Store personas, opportunities, and narrative
 *  7. Mark analysis complete
 *
 * Returns: { analysisId, status, heroMetrics }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }    from '@clerk/nextjs/server';
import { z }       from 'zod';
import { db }      from '@/db';
import { analyses, personas, opportunities, projects } from '@/db/schema';
import { eq }      from 'drizzle-orm';
import { getSemrushSnapshot } from '@/lib/apis/semrush';
import { getSerpApiSnapshot } from '@/lib/apis/serp';
import { getProfoundSnapshot } from '@/lib/apis/profound';
import { runFullSynthesis } from '@/lib/claude/synthesize';

// ─── Input Validation ─────────────────────────────────────────────────────────

const AnalyzeSchema = z.object({
  projectId: z.string().uuid(),
});

// ─── Domain Normalization ─────────────────────────────────────────────────────

function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const { userId, orgId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = parsed.data;

  // Load project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Org-scoped access check
  if (orgId && project.clerkOrgId !== orgId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const domain   = normalizeDomain(project.websiteUrl);
  const industry = project.industry ?? 'General';

  // Create analysis record (pending)
  const [analysis] = await db.insert(analyses).values({
    projectId,
    status: 'running',
    triggeredAt: new Date(),
  }).returning();

  // Run analysis in background, respond immediately with analysisId
  // The client polls GET /api/analyze/[id]/status
  runAnalysis(analysis.id, domain, project.clientName, industry)
    .catch(async (err) => {
      console.error(`[OrbitIQ] Analysis ${analysis.id} failed:`, err);
      await db.update(analyses)
        .set({ status: 'failed', errorMessage: String(err), completedAt: new Date() })
        .where(eq(analyses.id, analysis.id));
    });

  return NextResponse.json({
    analysisId: analysis.id,
    status: 'running',
    message: 'Analysis started. Poll /api/analyze/status?id=' + analysis.id,
  });
}

// ─── Analysis Runner ──────────────────────────────────────────────────────────

async function runAnalysis(
  analysisId: string,
  domain: string,
  clientName: string,
  industry: string
) {
  console.log(`[OrbitIQ] Analysis ${analysisId}: fetching APIs for ${domain}`);

  // ── Step 1: Parallel API calls ─────────────────────────────────────────────
  const [semrush, profound] = await Promise.all([
    getSemrushSnapshot(domain),
    getProfoundSnapshot(domain),
  ]);

  // SerpAPI uses Semrush keywords — sequential dependency
  const topKeywords = semrush.topKeywords.slice(0, 50).map(k => k.keyword);
  const serp = await getSerpApiSnapshot(domain, topKeywords);

  // ── Step 2: Store raw snapshots ────────────────────────────────────────────
  await db.update(analyses)
    .set({
      semrushSnapshot:  semrush as any,
      serpApiSnapshot:  serp    as any,
      profoundSnapshot: profound as any,
    })
    .where(eq(analyses.id, analysisId));

  console.log(`[OrbitIQ] Analysis ${analysisId}: snapshots stored, starting synthesis`);

  // ── Step 3: Claude synthesis ───────────────────────────────────────────────
  const synthesis = await runFullSynthesis(
    domain, clientName, industry,
    semrush, serp, profound
  );

  // ── Step 4: Store personas ─────────────────────────────────────────────────
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

  // ── Step 5: Store opportunities ────────────────────────────────────────────
  if (synthesis.opportunities.length > 0) {
    await db.insert(opportunities).values(
      synthesis.opportunities.map((o: any) => ({
        analysisId,
        category:         o.category,
        title:            o.title,
        summary:          o.summary,
        impactScore:      o.impactScore,
        effortScore:      o.effortScore,
        estimatedVisits:  o.estimatedVisits,
        estimatedLeads:   o.estimatedLeads,
        evidence:         o.evidence,
        rank:             o.rank,
      }))
    );
  }

  // ── Step 6: Update analysis with hero metrics + narrative ─────────────────
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
      // Store narrative in JSON snapshot extension
      semrushSnapshot: {
        ...(semrush as any),
        _narrative: synthesis.narrative,
        _pptPrompt: synthesis.pptPrompt,
      } as any,
    })
    .where(eq(analyses.id, analysisId));

  console.log(`[OrbitIQ] Analysis ${analysisId}: complete`);
}

// ─── GET: Status Check ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, id),
    with: { project: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  return NextResponse.json({
    analysisId:     analysis.id,
    status:         analysis.status,
    triggeredAt:    analysis.triggeredAt,
    completedAt:    analysis.completedAt,
    errorMessage:   analysis.errorMessage,
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
