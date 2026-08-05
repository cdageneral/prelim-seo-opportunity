/**
 * POST /api/analyze  — Phase 1: data gathering (SYNCHRONOUS)
 * GET  /api/analyze  — poll analysis status (backup / debug)
 *
 * v7.31 additions:
 *   • mode='full' (default) — original behaviour: Semrush + SerpAPI + LLM probe
 *   • mode='gaps'           — gap scan: reuses existing footprint, fetches ONLY
 *                             net-new competitor keywords, runs SerpAPI on those
 *                             only, reuses last LLM probe data (no re-probe)
 *   • mode='data' (v7.112)  — data-only refresh: ZERO Semrush units. Reuses the
 *                             existing keyword footprint untouched, RE-scans the
 *                             previously scanned SERP keywords via SerpAPI
 *                             (refreshing AIO/PAA/video data incl. AIO citation
 *                             sources), reuses LLM probe data, then Phase 2
 *                             re-runs Claude on the refreshed data.
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
import { getSerpApiSnapshot, buildSnapshotFromKeywordData, batchKeywordScan }  from '@/lib/apis/serp';
import { getMarket } from '@/lib/utils/markets';
import { buildSnapshotFromUploads } from '@/lib/apis/uploadedFootprint';
import type { SemrushSnapshot, SemrushKeywordGap } from '@/lib/apis/semrush';
import { setUsageProject } from '@/lib/usage/context';

export const maxDuration = 300;

const AnalyzeSchema = z.object({
  projectId: z.string().uuid(),
  mode:      z.enum(['full', 'gaps', 'data']).optional().default('full'),
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
  setUsageProject(projectId);   // v7.225: attribute every API call in this run to the project

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
  // v7.99: per-project market — drives the Semrush database AND SerpAPI country
  // so keyword data and SERP scans always describe the same Google.
  const market   = getMarket((project as any).semrushDatabase);

  const manualCompetitorDomains: string[] = ((project as any).competitors ?? [])
    .map((c: { domain: string }) => c.domain)
    .filter(Boolean);

  const [analysis] = await db.insert(analyses).values({
    projectId,
    status:      'running',
    triggeredAt: new Date(),
  }).returning();

  // v7.86: non-fatal API problems (failed fetches, partial data from exhausted
  // API credits) are collected here and returned to the UI as visible alerts
  // instead of being silently swallowed.
  const warnings: string[] = [];

  console.log(`[OrbitIQ] Phase 1 starting — mode=${mode}, analysisId=${analysis.id}, domain=${domain}`);
  console.log(`[OrbitIQ] Env — SEMRUSH: ${!!process.env.SEMRUSH_API_KEY}, SERP: ${!!process.env.SERP_API_KEY}, OPENAI: ${!!process.env.OPENAI_API_KEY}`);

  try {

    // ══════════════════════════════════════════════════════════════════════════
    // DATA-ONLY REFRESH mode (v7.112) — ZERO Semrush units.
    // Reuses the existing keyword footprint + LLM probe untouched, and RE-scans
    // the previously scanned SERP keywords via SerpAPI so AIO/PAA/video data
    // (including AIO citation sources) is fresh. Phase 2 then re-runs Claude.
    // This is the only mode that re-scans already-scanned keywords — the
    // incremental /serp-scan endpoint deliberately never does.
    // ══════════════════════════════════════════════════════════════════════════

    if (mode === 'data') {
      // v7.114 FIX: don't trust a single "latest completed" row. A data-mode
      // run COPIES snapshots into a new completed analysis, so after the
      // v7.112 no-orderBy bug the latest completed row can hold the OLDEST
      // run's snapshots (no scanned keywords, stale footprint) while the real
      // assets live in older rows. Recover each asset independently across
      // recent completed analyses — the same pattern full mode has used for
      // serp carry-forward since v7.82:
      //  • serpApiSnapshot — most recent row that actually HAS scanned keywords
      //  • semrushSnapshot — row whose snapshot has the NEWEST fetchedAt
      //    (fetchedAt is stamped when Semrush data was genuinely pulled/merged;
      //    data-mode copies retain the old stamp, so this skips polluted rows)
      //  • profoundSnapshot — most recent row that has one
      const recentCompleted = await db.query.analyses.findMany({
        where: and(
          eq(analyses.projectId, projectId),
          eq(analyses.status, 'completed'),
        ),
        orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
        limit: 15,
      });

      const fetchedAtMs = (s: any) => {
        const t = Date.parse(s?.fetchedAt ?? '');
        return Number.isFinite(t) ? t : 0;
      };
      let baseSemrush: any = null;
      for (const a of recentCompleted) {
        const s: any = a.semrushSnapshot;
        if (s && (!baseSemrush || fetchedAtMs(s) > fetchedAtMs(baseSemrush))) baseSemrush = s;
      }
      const existingSerp: any = recentCompleted
        .map((a: any) => a.serpApiSnapshot as any)
        .filter((s: any) => (s?.keywords?.length ?? 0) > 0)
        .sort((a: any, b: any) => fetchedAtMs(b) - fetchedAtMs(a))[0] ?? null;
      const baseProbe: any = recentCompleted
        .find((a: any) => a.profoundSnapshot != null)?.profoundSnapshot ?? null;

      if (!baseSemrush) {
        await db.update(analyses).set({ status: 'failed' }).where(eq(analyses.id, analysis.id));
        return NextResponse.json(
          { error: 'Data-only refresh needs a completed analysis to reuse. Run a full analysis (or upload a footprint) first.' },
          { status: 400 }
        );
      }

      const prevScanned: string[] = ((existingSerp?.keywords ?? []) as any[])
        .map((k: any) => k?.keyword as string)
        .filter(Boolean);

      // Credit safety: SerpAPI charges 1 credit per keyword (plus 1 per async
      // AIO token follow-up). Cap a single data refresh at 50 re-scans —
      // highest-coverage first is preserved since we keep stored order.
      const RESCAN_CAP = 50;
      let rescanList = prevScanned.slice(0, RESCAN_CAP);

      // v7.114: if NO keyword has ever been scanned, fall back to a fresh scan
      // of the top client keywords by volume instead of doing nothing — that's
      // what a "data refresh" should mean on a never-scanned project.
      let usedFallback = false;
      if (rescanList.length === 0) {
        const topKws: string[] = ((baseSemrush.topKeywords ?? []) as any[])
          .slice()
          .sort((a: any, b: any) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
          .map((k: any) => k.keyword as string)
          .filter(Boolean)
          .slice(0, 10);
        if (topKws.length > 0) {
          rescanList = topKws;
          usedFallback = true;
          warnings.push(`No previously scanned SERP keywords found — scanned your top ${topKws.length} keywords by volume instead (${topKws.length} SerpAPI credits). Use "Scan SERP features" in the Keywords panel to extend coverage.`);
        }
      }

      let serp: any = existingSerp;
      if (rescanList.length > 0) {
        try {
          const freshKws = await batchKeywordScan(rescanList, domain, rescanList.length, market);
          const freshLow = new Set(freshKws.map(k => k.keyword.toLowerCase()));
          const carried  = ((existingSerp?.keywords ?? []) as any[])
            .filter((k: any) => k?.keyword && !freshLow.has(k.keyword.toLowerCase()));
          serp = buildSnapshotFromKeywordData(domain, [...freshKws, ...carried]);
          console.log(`[OrbitIQ] Data refresh: re-scanned ${freshKws.length} keywords, ${carried.length} carried forward`);

          // Diagnostic (v7.112): an AI Overview virtually always cites sources.
          // hasAIO with zero sources means SerpAPI's citation payload was
          // missing (token follow-up failed / expired) — surface it instead of
          // letting it silently read as "client not cited".
          const emptyAIOs = freshKws.filter(k => k.hasAIO && (k.aioSources?.length ?? 0) === 0).length;
          if (emptyAIOs > 0) {
            warnings.push(`${emptyAIOs} AI Overview${emptyAIOs !== 1 ? 's' : ''} returned no citation sources from SerpAPI (token follow-up may have failed). Citation metrics for ${emptyAIOs !== 1 ? 'these keywords' : 'this keyword'} are unverifiable this run — re-run the data refresh to retry.`);
          }
        } catch (err) {
          warnings.push(`SerpAPI re-scan failed (previous SERP data kept): ${String((err as any)?.message ?? err)}. Check your SerpAPI credit balance at serpapi.com.`);
        }
      } else {
        warnings.push('No keywords available to scan — the reused footprint has no keywords. Run a full analysis or upload a footprint first.');
      }

      await db.update(analyses)
        .set({
          semrushSnapshot:  baseSemrush as any,   // untouched — 0 Semrush units
          serpApiSnapshot:  serp        as any,
          profoundSnapshot: baseProbe   as any,   // reused
        })
        .where(eq(analyses.id, analysis.id));

      console.log(`[OrbitIQ] Data-only refresh Phase 1 complete for ${analysis.id} — ${rescanList.length} keywords ${usedFallback ? 'scanned (fallback)' : 're-scanned'}, 0 Semrush units`);
      return NextResponse.json({
        analysisId:  analysis.id,
        triggeredAt: analysis.triggeredAt,
        status:      'data_ready',
        dataMode:    true,
        rescanned:   rescanList.length,
        warnings,
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GAP SCAN mode — reuse existing footprint, fetch only net-new keywords
    // ══════════════════════════════════════════════════════════════════════════

    if (mode === 'gaps') {
      // v7.113 FIX: no orderBy meant gap scans could merge against the OLDEST
      // completed analysis (stale footprint, missing serp-scan coverage).
      // v7.114: per-asset recovery across recent completed analyses, same as
      // data mode — footprint by newest fetchedAt (skips rows that merely
      // copied an old snapshot), serp snapshot from the row that actually has
      // scanned keywords, probe from the most recent row that has one.
      const gapRecent = await db.query.analyses.findMany({
        where: and(
          eq(analyses.projectId, projectId),
          eq(analyses.status, 'completed'),
        ),
        orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
        limit: 15,
      });
      const gapFetchedAtMs = (s: any) => {
        const t = Date.parse(s?.fetchedAt ?? '');
        return Number.isFinite(t) ? t : 0;
      };
      let gapBaseSemrush: any = null;
      for (const a of gapRecent) {
        const s: any = a.semrushSnapshot;
        if (s && (!gapBaseSemrush || gapFetchedAtMs(s) > gapFetchedAtMs(gapBaseSemrush))) gapBaseSemrush = s;
      }
      const gapBaseSerp: any = gapRecent
        .map((a: any) => a.serpApiSnapshot as any)
        .filter((s: any) => (s?.keywords?.length ?? 0) > 0)
        .sort((a: any, b: any) => gapFetchedAtMs(b) - gapFetchedAtMs(a))[0] ?? null;
      const gapBaseProbe: any = gapRecent
        .find((a: any) => a.profoundSnapshot != null)?.profoundSnapshot ?? null;

      if (!gapBaseSemrush) {
        console.log(`[OrbitIQ] Gap scan: no completed analysis found — falling back to full mode`);
        // Fall through to full mode below
      } else {
        const existingSnapshot = gapBaseSemrush as SemrushSnapshot;
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
        // v7.98: project volume floors applied at the API level (rows below the
        // floor are never fetched or billed) + failures surfaced as warnings
        // instead of being silently swallowed (same fix as full mode, v7.96).
        const gapsClientFloor = (project as any).kwVolThresholdClient ?? 0;
        const gapsCompFloor   = (project as any).kwVolThresholdCompetitor ?? 0;
        const [freshClientKws, ...gapResults] = await Promise.all([
          getOrganicKeywords(domain, 0, gapsClientFloor, market.code).catch(err => {
            warnings.push(`Client ranking refresh failed — positions were NOT updated this run: ${String((err as any)?.message ?? err)}. Check your Semrush API unit balance and re-run.`);
            return [] as Awaited<ReturnType<typeof getOrganicKeywords>>;
          }),
          ...allCompetitorDomains.slice(0, 5).map(comp =>
            getKeywordGap(domain, comp, 0, gapsCompFloor, market.code).catch(err => {
              warnings.push(`Competitor gap pull for ${comp} failed: ${String((err as any)?.message ?? err)}. Gap data is missing this domain — check your Semrush API unit balance and re-run.`);
              return [] as SemrushKeywordGap[];
            })
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
            // v7.86: project-level threshold (was hardcoded 2,400)
            const gapMin = (project as any).kwVolThresholdCompetitor ?? 0;
            if (gapMin > 0 && kw.searchVolume < gapMin) continue;
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
        // v7.137: keep client volume-per-band in sync with the refreshed counts.
        const newPositionVol:  Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
        for (const kw of mergedTopKeywords) {
          const pos = (kw as any).position ?? 999;
          const vol = (kw as any).searchVolume ?? 0;
          if (pos <= 3)       { newPositionDist['1-3']++;   newPositionVol['1-3']   += vol; }
          else if (pos <= 10) { newPositionDist['4-10']++;  newPositionVol['4-10']  += vol; }
          else if (pos <= 20) { newPositionDist['11-20']++; newPositionVol['11-20'] += vol; }
          else                { newPositionDist['21+']++;   newPositionVol['21+']   += vol; }
        }

        // v7.137: competitorPositionDist/Vol are intentionally NOT recomputed here
        // — gap mode only pulls net-new gap keywords, not each competitor's full
        // footprint, so the accurate full-footprint dists from the last FULL run
        // are preserved untouched via the `...existingSnapshot` spread.
        const mergedSnapshot: SemrushSnapshot = {
          ...existingSnapshot,
          topKeywords: mergedTopKeywords,
          gapKeywords: [
            ...(existingSnapshot.gapKeywords ?? []),
            ...newGapKeywords,
          ].sort((a, b) => b.searchVolume - a.searchVolume),
          positionDist: newPositionDist,
          positionVol:  newPositionVol,
          fetchedAt: new Date().toISOString(),
        };

        // SerpAPI: scan new client keywords + new gap keywords (up to 5 each)
        // v7.82: results are MERGED into the previous snapshot instead of
        // replacing it — incremental serp-scan coverage survives a gap refresh.
        const serpSample = [
          ...newClientKeywords.slice(0, 3).map(k => k.keyword),
          ...newGapKeywords.slice(0, 3).map(k => k.keyword),
        ].slice(0, 5);
        let serp: any = gapBaseSerp;
        if (serpSample.length > 0) {
          try {
            const fresh   = await getSerpApiSnapshot(domain, serpSample, market);
            const freshLow = new Set(fresh.keywords.map(k => k.keyword.toLowerCase()));
            const carried  = ((serp?.keywords ?? []) as any[])
              .filter((k: any) => k?.keyword && !freshLow.has(k.keyword.toLowerCase()));
            serp = buildSnapshotFromKeywordData(domain, [...fresh.keywords, ...carried]);
            console.log(`[OrbitIQ] SerpAPI (gap): +${fresh.keywords.length} fresh, ${carried.length} carried forward`);
          } catch (err) {
            console.error(`[OrbitIQ] SerpAPI (gap) failed (keeping previous SERP data):`, err);
            warnings.push(`SerpAPI scan failed for the new keywords (previous SERP data kept): ${String((err as any)?.message ?? err)}. Check your SerpAPI credit balance at serpapi.com.`);
          }
        }

        const llmProbe = gapBaseProbe;

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
          warnings,
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
      console.log(`[OrbitIQ] Auto-discovering FULL keyword footprint via Semrush (uncapped, v7.86)`);
      semrush = await getSemrushSnapshot(
        domain,
        manualCompetitorDomains,
        (project as any).kwVolThresholdCompetitor ?? 0,   // v7.86: project setting, not hardcoded 2,400
        (project as any).kwVolThresholdClient ?? 0,       // v7.98: client floor applied at the API level
        market.code,                                       // v7.99: per-project market
      ).catch(err => {
        console.error(`[OrbitIQ] Semrush failed:`, err);
        warnings.push(`Semrush fetch failed — keyword data is missing for this run: ${String((err as any)?.message ?? err)}`);
        return {
          domain,
          overview:    { domain, organicKeywords: 0, organicTraffic: 0, organicCost: 0, authorityScore: 0, backlinks: 0 },
          topKeywords: [], competitors: [], gapKeywords: [], positionDist: {},
          fetchedAt:   new Date().toISOString(),
        } as SemrushSnapshot;
      });

      // v7.96: surface non-fatal warnings collected inside getSemrushSnapshot
      // (failed/empty competitor gap pulls, over-filtered gap, no competitors).
      if (semrush.warnings?.length) warnings.push(...semrush.warnings);

      // v7.86: Semrush returns PARTIAL rows when the API unit balance runs out
      // mid-pull — surface that instead of silently shipping incomplete data.
      // v7.98: only meaningful when NO client volume floor is set — with a floor,
      // fetched is legitimately smaller than the unfiltered overview count.
      const clientFloor = (project as any).kwVolThresholdClient ?? 0;
      const expected = semrush.overview.organicKeywords;
      const fetched  = semrush.topKeywords.length;
      if (clientFloor === 0 && expected > 0 && fetched < expected * 0.95) {
        warnings.push(
          `Semrush returned ${fetched.toLocaleString()} of ~${expected.toLocaleString()} client keyword rows — ` +
          `your Semrush API unit balance may have run out mid-pull. Data below is partial; ` +
          `check Subscription info → API units at semrush.com and re-run.`
        );
      }
    }

    // SerpAPI — runs on a sample of top keywords regardless of source
    const topKeywords = semrush.topKeywords.slice(0, 50).map(k => k.keyword);
    console.log(`[OrbitIQ] SerpAPI: SERP_API_KEY set=${!!process.env.SERP_API_KEY}, scanning ${Math.min(topKeywords.length, 5)} of ${topKeywords.length} keywords`);
    let serp: any = await getSerpApiSnapshot(domain, topKeywords, market).catch(err => {
      console.error(`[OrbitIQ] SerpAPI failed (skipping SERP data):`, err);
      warnings.push(`SerpAPI scan failed — SERP features (AIO/PAA/Video) are unavailable for this run: ${String((err as any)?.message ?? err)}. Check your SerpAPI credit balance at serpapi.com.`);
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

    // v7.82: carry forward previously scanned SERP keywords so incremental
    // serp-scan coverage (and its SerpAPI credits) survives a full refresh.
    // Fresh results win on overlap; carried keywords only fill the gaps.
    const prevSerp: any = recentAnalyses
      .find((a: any) => a.id !== analysis.id && (a.serpApiSnapshot as any)?.keywords?.length)
      ?.serpApiSnapshot ?? null;
    if (prevSerp) {
      const freshLow = new Set((serp.keywords ?? []).map((k: any) => k.keyword?.toLowerCase()));
      const carried  = (prevSerp.keywords as any[])
        .filter((k: any) => k?.keyword && !freshLow.has(k.keyword.toLowerCase()));
      if (carried.length > 0) {
        serp = buildSnapshotFromKeywordData(domain, [...(serp.keywords ?? []), ...carried]);
        console.log(`[OrbitIQ] SerpAPI: ${carried.length} previously scanned keywords carried forward (total ${serp.keywords.length})`);
      }
    }

    // v7.407: carry the local scan forward too. `serpApiSnapshot` has been carried
    // across a re-analysis since v7.82, but `_localScan` — which lives INSIDE the
    // semrush snapshot blob rather than in its own column — was not, so every new
    // analysis orphaned the local scan and the Local page silently dropped out of
    // the report (Wayne, 2026-08-05). Real scanned rows, carried verbatim: nothing
    // is recomputed or estimated. A fresh scan on the new run overwrites it.
    const prevLocal: any = recentAnalyses
      .find((a: any) => a.id !== analysis.id && (a.semrushSnapshot as any)?._localScan)
      ?.semrushSnapshot?._localScan ?? null;
    const semrushOut: any = prevLocal && !(semrush as any)?._localScan
      ? { ...(semrush as any), _localScan: prevLocal }
      : semrush;
    if (prevLocal && semrushOut !== semrush) {
      console.log(`[OrbitIQ] Local scan carried forward (${(prevLocal.locations ?? []).length} listings, ${(prevLocal.keywords ?? []).length} grid cells)`);
    }

    await db.update(analyses)
      .set({
        semrushSnapshot:  semrushOut as any,
        serpApiSnapshot:  serp     as any,
        profoundSnapshot: previousProbe as any,
      })
      .where(eq(analyses.id, analysis.id));

    console.log(`[OrbitIQ] Phase 1 complete for ${analysis.id} (uploadMode=${!!uploadedSnapshot}, warnings=${warnings.length})`);
    return NextResponse.json({
      analysisId:  analysis.id,
      triggeredAt: analysis.triggeredAt,
      status:      'data_ready',
      usedUploads: !!uploadedSnapshot,
      warnings,
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
