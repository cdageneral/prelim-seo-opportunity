/**
 * POST /api/analyze  — Phase 1: data gathering (SYNCHRONOUS)
 * GET  /api/analyze  — poll analysis status (backup / debug)
 *
 * v7.31 additions:
 *   • mode='full' (default) — original behaviour: Semrush + SerpAPI + LLM probe
 *   • mode='gaps'           — gap scan: reuses existing footprint, fetches ONLY
 *                             net-new competitor keywords, runs SerpAPI on those
 *                             only, reuses last LLM probe data (no re-probe)
 *   • Upload detection      — if project has csv-sourced keywords in
 *                             project_keywords, Semrush is skipped entirely;
 *                             snapshot is built from uploads instead
 *
 * Architecture note (v7.2+): no fire-and-forget. Lambda stays alive because
 * the HTTP connection is open. Client awaits Phase 1, then awaits Phase 2.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }       from 'zod';
import { db }      from '@/db';
import { analyses, projects, projectKeywords } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSemrushSnapshot, getKeywordGap, getOrganicKeywords } from '@/lib/apis/semrush';
import { getSerpApiSnapshot }  from '@/lib/apis/serp';
import { buildSnapshotFromUploads } from '@/lib/apis/uploadedFootprint';
import type { SemrushSnapshot, SemrushKeywordGap } from '@/lib/apis/semrush';

export const maxDuration = 300;

const AnalyzeSchema = z.object({
  projectId: z.string().uuid(),
  mode:      z.enum(['full', 'gaps']).optional().default('full'),
});

function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

// ─── POST: Phase 1 — synchronous data gathering ───────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, mode } = parsed.data;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { competitors: true },
  });

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  const domain   = normalizeDomain(project.websiteUrl);
  const industry = project.industry ?? 'General';

  const manualCompetitorDomains: string[] = ((project as any).competitors ?? [])
    .map((c: { domain: string }) => c.domain)
    .filter(Boolean);

  const [analysis] = await db.insert(analyses).values({
    projectId,
    status:      'running',
    triggeredAt: new Date(),
  }).returning();

  console.log(`[OrbitIQ] Phase 1 starting — mode=${mode}, analysisId=${analysis.id}, domain=${domain}`);
  console.log(`[OrbitIQ] Env — SEMRUSH: ${!!process.env.SEMRUSH_API_KEY}, SERP: ${!!process.env.SERP_API_KEY}, OPENAI: ${!!process.env.OPENAI_API_KEY}`);

  try {

    // ══════════════════════════════════════════════════════════════════════════
    // GAP SCAN mode — reuse existing footprint, fetch only net-new keywords
    // ══════════════════════════════════════════════════════════════════════════

    if (mode === 'gaps') {
      const lastAnalysis = await db.query.analyses.findFirst({
        where: and(
          eq(analyses.projectId, projectId),
          eq(analyses.status, 'completed'),
        ),
      });

      if (!lastAnalysis?.semrushSnapshot) {
        console.log(`[OrbitIQ] Gap scan: no completed analysis found — falling back to full mode`);
        // Fall through to full mode below
      } else {
        const existingSnapshot = lastAnalysis.semrushSnapshot as SemrushSnapshot;
        const existingRanked   = new Set(
          (existingSnapshot.topKeywords ?? []).map((k: any) => (k.keyword as string).toLowerCase().trim())
        );
        const existingGaps     = new Set(
          (existingSnapshot.gapKeywords ?? []).map((k: any) => (k.keyword as string).toLowerCase().trim())
        );

        console.log(`[OrbitIQ] Gap scan: ${existingRanked.size} ranked + ${existingGaps.size} gap keywords already tracked`);

        const allCompetitorDomains = [
          ...(existingSnapshot.competitors ?? []).map((c: any) => c.domain as string),
          ...manualCompetitorDomains,
        ].filter((d, i, arr) => d && arr.indexOf(d) === i);

        // ── Fetch in parallel: client's current rankings + competitor gaps ──
        const [freshClientKws, ...gapResults] = await Promise.all([
          getOrganicKeywords(domain).catch(() => []),
          ...allCompetitorDomains.slice(0, 5).map(comp =>
            getKeywordGap(domain, comp).catch(() => [] as SemrushKeywordGap[])
          ),
        ]);

        // ── Net-new client ranked keywords ────────────────────────────────────
        const newClientKeywords = freshClientKws.filter(kw => {
          const key = kw.keyword.toLowerCase().trim();
          return !existingRanked.has(key) && !existingGaps.has(key);
        });

        // Also update positions for keywords that already exist (rankings shift)
        const existingTopUpdated = (existingSnapshot.topKeywords ?? []).map((kw: any) => {
          const fresh = freshClientKws.find(
            f => f.keyword.toLowerCase().trim() === kw.keyword.toLowerCase().trim()
          );
          return fresh ? { ...kw, position: fresh.position, searchVolume: fresh.searchVolume } : kw;
        });

        console.log(`[OrbitIQ] Gap scan: ${newClientKeywords.length} net-new client keywords, ${existingTopUpdated.length} existing positions refreshed`);

        // ── Net-new competitor gap keywords ───────────────────────────────────
        // Rebuild existingRanked set to include newly ranked client keywords
        const allRankedNow = new Set([
          ...Array.from(existingRanked),
          ...newClientKeywords.map(k => k.keyword.toLowerCase().trim()),
        ]);

        const seen = new Set<string>();
        const newGapKeywords: SemrushKeywordGap[] = [];
        for (const batch of gapResults) {
          for (const kw of batch) {
            const key = kw.keyword.toLowerCase().trim();
            if (seen.has(key) || allRankedNow.has(key) || existingGaps.has(key)) continue;
            if (kw.searchVolume < 2400) continue;
            seen.add(key);
            newGapKeywords.push(kw);
          }
        }

        console.log(`[OrbitIQ] Gap scan: ${newGapKeywords.length} net-new gap keywords found`);

        // ── Rebuild positionDist from merged topKeywords ──────────────────────
        const mergedTopKeywords = [
          ...existingTopUpdated,
          ...newClientKeywords,
        ].sort((a: any, b: any) => b.searchVolume - a.searchVolume);

        const newPositionDist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
        for (const kw of mergedTopKeywords) {
          const pos = (kw as any).position ?? 999;
          if (pos <= 3)       newPositionDist['1-3']++;
          else if (pos <= 10) newPositionDist['4-10']++;
          else if (pos <= 20) newPositionDist['11-20']++;
          else                newPositionDist['21+']++;
        }

        const mergedSnapshot: SemrushSnapshot = {
          ...existingSnapshot,
          topKeywords: mergedTopKeywords,
          gapKeywords: [
            ...(existingSnapshot.gapKeywords ?? []),
            ...newGapKeywords,
          ].sort((a, b) => b.searchVolume - a.searchVolume),
          positionDist: newPositionDist,
          fetchedAt: new Date().toISOString(),
        };

        // SerpAPI: scan new client keywords + new gap keywords (up to 5 each)
        const serpSample = [
          ...newClientKeywords.slice(0, 3).map(k => k.keyword),
          ...newGapKeywords.slice(0, 3).map(k => k.keyword),
        ].slice(0, 5);
        const serp = serpSample.length > 0
          ? await getSerpApiSnapshot(domain, serpSample).catch(err => {
              console.error(`[OrbitIQ] SerpAPI (gap) failed:`, err);
              return lastAnalysis.serpApiSnapshot as any;
            })
          : (lastAnalysis.serpApiSnapshot as any);

        const llmProbe = lastAnalysis.profoundSnapshot as any;

        await db.update(analyses)
          .set({
            semrushSnapshot:  mergedSnapshot as any,
            serpApiSnapshot:  serp           as any,
            profoundSnapshot: llmProbe       as any,
          })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Gap scan Phase 1 complete for ${analysis.id}`);
        return NextResponse.json({
          analysisId:         analysis.id,
          triggeredAt:        analysis.triggeredAt,
          status:             'data_ready',
          gapMode:            true,
          newClientKwsFound:  newClientKeywords.length,
          newGapsFound:       newGapKeywords.length,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FULL mode — check for uploaded footprint first, then Semrush
    // ══════════════════════════════════════════════════════════════════════════

    // Check for uploaded keywords (source='csv') — skips Semrush if found
    const uploadedSnapshot = await buildSnapshotFromUploads(
      projectId, domain, manualCompetitorDomains
    ).catch(() => null);

    let semrush: SemrushSnapshot;

    if (uploadedSnapshot) {
      console.log(`[OrbitIQ] Using uploaded footprint — ${uploadedSnapshot.topKeywords.length} client kws, ${uploadedSnapshot.gapKeywords.length} gap kws — Semrush skipped`);
      semrush = uploadedSnapshot;
    } else {
      console.log(`[OrbitIQ] Auto-discovering keyword footprint via Semrush`);
      semrush = await getSemrushSnapshot(domain, manualCompetitorDomains).catch(err => {
        console.error(`[OrbitIQ] Semrush failed:`, err);
        return {
          domain,
          overview:    { domain, organicKeywords: 0, organicTraffic: 0, organicCost: 0, authorityScore: 0, backlinks: 0 },
          topKeywords: [], competitors: [], gapKeywords: [], positionDist: {},
          fetchedAt:   new Date().toISOString(),
        } as SemrushSnapshot;
      });
    }

    // SerpAPI — runs on a sample of top keywords regardless of source
    const topKeywords = semrush.topKeywords.slice(0, 50).map(k => k.keyword);
    console.log(`[OrbitIQ] SerpAPI: SERP_API_KEY set=${!!process.env.SERP_API_KEY}, scanning ${Math.min(topKeywords.length, 5)} of ${topKeywords.length} keywords`);
    const serp = await getSerpApiSnapshot(domain, topKeywords).catch(err => {
      console.error(`[OrbitIQ] SerpAPI failed (skipping SERP data):`, err);
      return {
        domain, keywords: [],
        aioSummary:         { total: 0, withAIO: 0, clientCited: 0, aioRate: 0, clientAIORate: 0 },
        serpFeatureSummary: { scanned: 0, withPAA: 0, paaClientCited: 0, withVideo: 0, videoClientCited: 0 },
        topAIOCompetitors: [], fetchedAt: new Date().toISOString(),
      } as any;
    });

    console.log(
      `[OrbitIQ] SerpAPI scan: ${serp.keywords?.length ?? 0} keywords scanned,` +
      ` ${serp.aioSummary?.withAIO ?? 0} AIOs, PAA=${serp.serpFeatureSummary?.withPAA ?? 0},` +
      ` video=${serp.serpFeatureSummary?.withVideo ?? 0}`
    );

    // LLM Probe (v7.80): moved to Phase 2 (synthesize) — it needs the product
    // categories from _categoryBreakdown to generate category-driven prompts.
    // Carry forward the previous analysis's probe so the panel has data until
    // Phase 2 overwrites it with fresh results.
    const recentAnalyses = await db.query.analyses.findMany({
      where:   eq(analyses.projectId, projectId),
      orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
      limit:   3,
    }).catch(() => [] as any[]);
    const previousProbe = recentAnalyses
      .find((a: any) => a.id !== analysis.id && a.profoundSnapshot != null)
      ?.profoundSnapshot ?? null;

    await db.update(analyses)
      .set({
        semrushSnapshot:  semrush  as any,
        serpApiSnapshot:  serp     as any,
        profoundSnapshot: previousProbe as any,
      })
      .where(eq(analyses.id, analysis.id));

    console.log(`[OrbitIQ] Phase 1 complete for ${analysis.id} (uploadMode=${!!uploadedSnapshot})`);
    return NextResponse.json({
      analysisId:  analysis.id,
      triggeredAt: analysis.triggeredAt,
      status:      'data_ready',
      usedUploads: !!uploadedSnapshot,
    });

  } catch (err) {
    console.error(`[OrbitIQ] Phase 1 unexpected error for ${analysis.id}:`, err);
    await db.update(analyses)
      .set({ status: 'failed', errorMessage: String(err), completedAt: new Date() })
      .where(eq(analyses.id, analysis.id));
    return NextResponse.json(
      { error: `Data gathering failed: ${String(err)}` },
      { status: 500 }
    );
  }
}

// ─── GET: poll status (backup / debug) ───────────────────────────────────────

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
