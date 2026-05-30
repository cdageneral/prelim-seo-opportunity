/**
 * POST /api/analyze  — Phase 1: data gathering (SYNCHRONOUS)
 * GET  /api/analyze  — poll analysis status (backup / debug)
 *
 * v7.2 architecture — no fire-and-forget:
 *   The POST handler awaits all data API calls before returning.
 *   This keeps the Vercel Lambda alive for the full duration (the HTTP
 *   connection is open, so Vercel does not terminate the function early).
 *
 *   Previously, fire-and-forget was used (return response, work continues).
 *   On Vercel App Router, the Lambda is terminated when the response is sent
 *   unless waitUntil() is used — so fire-and-forget was silently killing the
 *   background work every time. This caused the DB to stay in 'running' state
 *   and the 8-minute client timer to fire.
 *
 * Client flow:
 *   1. POST /api/analyze       → awaits (~25–80s) → returns { analysisId }
 *   2. POST /api/synthesize    → awaits (~30–100s) → returns { status: 'completed' }
 *   3. fetchProject()          → renders brief
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }       from 'zod';
import { db }      from '@/db';
import { analyses, projects } from '@/db/schema';
import { eq }      from 'drizzle-orm';
import { getSemrushSnapshot } from '@/lib/apis/semrush';
import { getSerpApiSnapshot } from '@/lib/apis/serp';
import { getLLMProbeSnapshot } from '@/lib/apis/llmProbe';

export const maxDuration = 300;

const AnalyzeSchema = z.object({ projectId: z.string().uuid() });

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

  const { projectId } = parsed.data;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { competitors: true },
  });

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Pre-flight: fail fast before burning any API credits
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  const domain   = normalizeDomain(project.websiteUrl);
  const industry = project.industry ?? 'General';

  const [analysis] = await db.insert(analyses).values({
    projectId,
    status:      'running',
    triggeredAt: new Date(),
  }).returning();

  console.log(`[OrbitIQ] Phase 1 starting for ${analysis.id} (${domain})`);
  console.log(`[OrbitIQ] Env — SEMRUSH: ${!!process.env.SEMRUSH_API_KEY}, SERP: ${!!process.env.SERP_API_KEY}, OPENAI: ${!!process.env.OPENAI_API_KEY}`);

  try {
    // ── Data APIs — fault-tolerant, each has AbortSignal timeout ─────────────
    // Step 1: Semrush only (needed for SerpAPI keyword list)
    const semrush = await getSemrushSnapshot(domain).catch(err => {
      console.error(`[OrbitIQ] Semrush failed:`, err);
      return {
        domain,
        overview: { domain, organicKeywords: 0, organicTraffic: 0, organicCost: 0, authorityScore: 0, backlinks: 0 },
        topKeywords: [], competitors: [], gapKeywords: [], positionDist: {},
        fetchedAt: new Date().toISOString(),
      } as any;
    });

    // Merge manually-added competitors
    if ((project as any).competitors?.length > 0) {
      const existing = new Set(semrush.competitors.map((c: { domain: string }) => c.domain));
      for (const mc of (project as any).competitors) {
        if (!existing.has(mc.domain)) {
          // push (not unshift) — manual competitors go to the end so
          // Semrush-discovered competitors (sorted by relevance/traffic) stay at [0]
          semrush.competitors.push({
            domain: mc.domain, commonKeywords: 0, organicKeywords: 0,
            organicTraffic: 0, relevance: 1,
          });
        }
      }
    }

    // Step 2: SerpAPI runs immediately after Semrush — LLM probe does NOT block this
    const topKeywords = semrush.topKeywords.slice(0, 50).map((k: { keyword: string }) => k.keyword);
    console.log(`[OrbitIQ] SerpAPI: SERP_API_KEY set=${!!process.env.SERP_API_KEY}, keywords to scan=${Math.min(topKeywords.length, 5)} of ${topKeywords.length} available`);
    const serp = await getSerpApiSnapshot(domain, topKeywords).catch(err => {
      console.error(`[OrbitIQ] SerpAPI failed (skipping SERP data):`, err);
      return {
        domain, keywords: [],
        aioSummary: { total: 0, withAIO: 0, clientCited: 0, aioRate: 0, clientAIORate: 0 },
        serpFeatureSummary: { scanned: 0, withPAA: 0, paaClientCited: 0, withVideo: 0, videoClientCited: 0 },
        topAIOCompetitors: [], fetchedAt: new Date().toISOString(),
      } as any;
    });

    // Diagnostic log — always fires so we can confirm SerpAPI results in Vercel logs
    console.log(
      `[OrbitIQ] SerpAPI scan: ${serp.keywords?.length ?? 0} keywords scanned,` +
      ` ${serp.aioSummary?.withAIO ?? 0} AIOs, PAA=${serp.serpFeatureSummary?.withPAA ?? 0},` +
      ` video=${serp.serpFeatureSummary?.withVideo ?? 0}`
    );

    // Step 3: LLM probe runs after SerpAPI — all 6 calls in parallel (3 Claude + 3 ChatGPT)
    const llmProbe = await getLLMProbeSnapshot(project.clientName, domain, industry).catch(err => {
      console.error(`[OrbitIQ] LLM probe failed:`, err);
      return {
        source: 'llm_probe', probedAt: new Date().toISOString(),
        prompts: [], platforms: [], overallScore: 0,
        overallMentions: 0, overallTotal: 0,
      } as any;
    });

    // Save snapshots — keep status 'running' so /api/synthesize knows to proceed
    await db.update(analyses)
      .set({
        semrushSnapshot:  semrush  as any,
        serpApiSnapshot:  serp     as any,
        profoundSnapshot: llmProbe as any,
      })
      .where(eq(analyses.id, analysis.id));

    console.log(`[OrbitIQ] Phase 1 complete for ${analysis.id}`);

    // Return analysisId so the client can immediately call /api/synthesize
    return NextResponse.json({
      analysisId:  analysis.id,
      triggeredAt: analysis.triggeredAt,
      status:      'data_ready',
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
