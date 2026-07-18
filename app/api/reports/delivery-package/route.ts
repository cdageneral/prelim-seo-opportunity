/**
 * /api/reports/delivery-package — the "Send to Delivery" one-click baseline handoff.
 *
 * POST { analysisId } → builds ONE zip (JSON manifest + Excel + CSV mirrors + README)
 * that hands a delivery colleague the entire analysis as an integration baseline, then
 * stores it to blob and returns { fileUrl, filename, stats }.
 *
 * Const II.6/II.7: this route re-uses the EXACT same assembly the assessment-report PDF
 * route runs — the canonical pool (buildKwPool), capture (computeVolumeMetrics), modeled
 * Share of Voice (computeSov), canonical topics (buildCanonicalClusterTopics with the
 * stored/persisted Claude intent map), audience segments, authority + local aggregates —
 * so the package agrees with the panels and the report to the number. It adds only the
 * finalized Content-Plan / scope selections (projects.content_plan_selections /
 * scope_selections) as delivery flags, and the Content Plan view (buildContentPlanFromTopics)
 * for per-topic priority / quick-win / best-position positioning. The serializer
 * (lib/export/deliveryPackage) never re-derives anything — it only formats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }       from 'zod';
import { put }     from '@vercel/blob';
import { db }      from '@/db';
import { analyses, projects, projectKeywords, competitors } from '@/db/schema';
import { eq }      from 'drizzle-orm';

import { hydrateSnapshotForPool }             from '@/lib/utils/hydrateSnapshot';
import { buildKwPool, computeVolumeMetrics }  from '@/lib/utils/kwVolume';
import { computeSov }                          from '@/lib/sov/model';
import { buildCanonicalClusterTopics }         from '@/lib/clusters/canonical';
import { buildIntentPool, classifyIntents, persistClusterAssigns, type AssignMap } from '@/lib/clusters/intentAssign';
import { buildContentPlanFromTopics, brandTermsOf } from '@/lib/journey/contentPlan';
import { executionGapInsight, type Insight }   from '@/lib/insights';
import { assembleDeliveryZip }                 from '@/lib/export/deliveryPackage';
import { setUsageProject }                     from '@/lib/usage/context';
import { instrumentAnthropic }                 from '@/lib/usage/record';
import Anthropic                               from '@anthropic-ai/sdk';

const Schema = z.object({ analysisId: z.string().uuid() });
export const maxDuration = 60;

// Cosmetic label written into the manifest/README. Bump with each release (VII.1).
const APP_VERSION = '7.378.0';

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, parsed.data.analysisId),
    with: { project: true },
  });
  if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });

  const project = (analysis as any).project ?? {};

  // ── same canonical assembly as the PDF route (Const II.6/II.7) ──
  const [kwRows, compRows] = await Promise.all([
    db.select().from(projectKeywords).where(eq(projectKeywords.projectId, (analysis as any).projectId)),
    db.select().from(competitors).where(eq(competitors.projectId, (analysis as any).projectId)),
  ]);
  const snap              = hydrateSnapshotForPool(project, (analysis as any).semrushSnapshot ?? {});
  const clientDomain      = (snap?.domain ?? '') as string;
  const competitorDomains = compRows.map(c => c.domain).filter(Boolean);
  const pool = buildKwPool({
    semrushSnapshot:   snap,
    uploadedKeywords:  kwRows,
    clientDomain,
    competitorDomains,
    clientVolMin:      project.kwVolThresholdClient ?? 0,
    competitorVolMin:  project.kwVolThresholdCompetitor ?? 0,
    includeDemand:     true,
  });
  const metrics = computeVolumeMetrics(pool);
  const sov = computeSov({
    analysis:    { ...(analysis as any), semrushSnapshot: snap },
    competitors: competitorDomains,
    dbKeywords:  kwRows,
    clientLabel: project.clientName ?? '',
  });

  // Claude intent-assignment map: stored copy first; run + persist once if absent
  // (never build canonical topics on a silently-empty map — the v7.220 under-count class).
  setUsageProject((analysis as any).projectId);
  let claudeAssigns: AssignMap = ((snap as any)?._clusterAssigns ?? {}) as AssignMap;
  if (Object.keys(claudeAssigns).length === 0) {
    const intentPool = buildIntentPool(snap);
    if (intentPool.length > 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const client = instrumentAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
        claudeAssigns = await classifyIntents(client, intentPool, (project.industry ?? 'General'), clientDomain);
        await persistClusterAssigns(parsed.data.analysisId, claudeAssigns);
      } catch (err) {
        console.error('[delivery-package] intent-assignment pass failed — proceeds with signal-matched intents:', err);
      }
    }
  }

  let journeyTopics: ReturnType<typeof buildCanonicalClusterTopics> = [];
  try {
    journeyTopics = buildCanonicalClusterTopics(
      { ...(analysis as any), semrushSnapshot: snap },
      clientDomain, competitorDomains, kwRows, claudeAssigns,
    );
  } catch (err) {
    console.error('[delivery-package] canonical topic build FAILED:', err);
    return NextResponse.json({ error: 'Analysis not ready — canonical topics could not be built.' }, { status: 409 });
  }

  // Content Plan view (per-topic priority / quick-win / best-position) — same call the panel makes,
  // honouring stored manual priority moves (projects.priority_overrides — not in the pool hydrate).
  const brandTerms = brandTermsOf(clientDomain, snap);
  const priorityOverrides = ((project as any).priorityOverrides ?? {}) as Record<string, 'P0' | 'P1' | 'P2' | 'P3'>;
  const plan = buildContentPlanFromTopics(journeyTopics as any, { brandTerms, priorityOverrides });

  // finalized delivery selections (the prioritized subset flags)
  const contentPlanSelections = ((project as any).contentPlanSelections ?? []) as string[];
  const scopeSelections       = ((project as any).scopeSelections ?? []) as string[];

  // real insight sentences (mirror the panels — only wired from aggregates we hold here)
  const insights: Insight[] = [];
  const eg = executionGapInsight({
    totalTopics: plan.topics.length, p0Count: plan.scope.p0, p0MonthlyVol: plan.scope.p0Vol,
    quickWins: plan.scope.quickWins, planCount: contentPlanSelections.length,
  });
  if (eg) insights.push(eg);

  let bytes: Uint8Array; let filename: string; let manifest: any;
  try {
    ({ bytes, filename, manifest } = await assembleDeliveryZip({
      appVersion: APP_VERSION,
      client: { name: project.clientName ?? 'Client', websiteUrl: project.websiteUrl ?? '', industry: project.industry ?? null },
      journeyTopics: journeyTopics as any,
      plan,
      segments: (((snap as any)?._audienceSegments) ?? []) as any[],
      problemSeeds: (((snap as any)?._demandUniverse?.problemSeeds) ?? []) as string[],
      poolCount: pool.length,
      metrics,
      sov,
      profound: ((project as any).profoundData ?? null),
      authority: ((project as any).authoritySnapshot ?? null),
      localScan: (((snap as any)?._localScan) ?? null),
      umbrellaScope: (((snap as any)?._categoryBreakdown?.umbrellaScope) ?? null),
      positionDist: (((snap as any)?.positionDist) ?? null),
      contentPlanSelections,
      scopeSelections,
      insights,
    }));
  } catch (err) {
    console.error('[delivery-package] zip build failed:', err);
    return NextResponse.json({ error: 'Delivery package build failed' }, { status: 500 });
  }

  const outName = `orbitiq-delivery-${(project.clientName ?? 'client').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.zip`;
  const { url } = await put(outName, Buffer.from(bytes), { access: 'public', contentType: 'application/zip' });

  return NextResponse.json({
    fileUrl: url,
    filename,
    stats: {
      topics: manifest.summary.taxonomy.topics,
      keywords: manifest.summary.taxonomy.keywords,
      segments: manifest.summary.segments.count,
      selectedForDelivery: manifest.summary.contentPlan.selectedForDelivery,
    },
  });
}
