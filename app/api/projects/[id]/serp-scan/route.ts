/**
 * POST /api/projects/[id]/serp-scan — incremental SERP feature scanning (v7.81)
 *
 * Scans the next batch of UNSCANNED keywords (highest volume first) from the
 * canonical keyword pool (buildKwPool — same pool as the Keyword Landscape
 * panel) via SerpAPI, merges results into the latest analysis's
 * serpApiSnapshot, recomputes all summaries, and persists.
 *
 * Credit safety:
 *  - Already-scanned keywords are NEVER re-scanned (no double credit spend).
 *  - batchSize defaults to 25, hard-capped at 25 per call (v7.297 keeps each
 *    scan invocation under Vercels 300s cap; the loop runs more batches).
 *  - 1 keyword = 1 SerpAPI search credit.
 *
 * Body:    { batchSize?: number }
 * Returns: { scanned, results, totalScanned, poolTotal, remaining }
 */

import type { ScanFailureReport } from '@/lib/apis/dataforseo';   // v7.540
import { NextRequest, NextResponse } from 'next/server';
import { setUsageProject } from '@/lib/usage/context';
import { db } from '@/db';
import { analyses, projects, projectKeywords } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { batchKeywordScan, buildSnapshotFromKeywordData, activeProviderLabel, providerBalanceUrl, serpProvider } from '@/lib/apis/serp';
import { getMarket } from '@/lib/utils/markets';
import type { KeywordSerpData } from '@/lib/apis/serp';
import { buildKwPool } from '@/lib/utils/kwVolume';
// v7.336 (QC audit B3): server-side snapshot hydration — same helper the v7.335 PDF route uses.
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { loadLatestAnalysisWithSnapshot } from '@/lib/latestAnalysis';   // v7.445

export const maxDuration = 300;

// v7.297: batch hard-capped at 25 (was 75 default / 100 max). Combined with
// the bounded-concurrency scan in lib/apis/serp.ts, this keeps every scan
// invocation under Vercels 300s function cap, so the auto-batch loops
// progress advances instead of 504-ing. The client loop sends 75; it is
// capped here and simply runs more, shorter batches until done.
const DEFAULT_BATCH = 25;
const MAX_BATCH     = 25;

function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  setUsageProject(projectId);   // v7.225: attribute API usage to this project

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const batchSize = Math.min(Math.max(parseInt(body?.batchSize, 10) || DEFAULT_BATCH, 1), MAX_BATCH);
  // v7.132: dryRun=true returns how many keywords remain unscanned WITHOUT
  // scanning anything — 0 SerpAPI credits, no persistence. Powers the
  // "Scan all N remaining · ~N credits" cost-confirm modal before the
  // background auto-batch loop starts.
  const dryRun = body?.dryRun === true;
  // v7.121: filter='aio' scans ONLY uploaded keywords whose Semrush
  // "SERP Features by Keyword" cell includes an AI Overview — used to make the
  // Citation Rate denominator cover the full footprint with verified data.
  // v7.122: filter='rescan' RE-scans an explicit list of already-scanned
  // keywords (body.keywords) — powers the in-card "Refresh required" buttons,
  // refreshing only the stale subset a card depends on. Only keywords that are
  // genuinely in the stored scan set are accepted (credit safety).
  const scanFilter: 'all' | 'aio' | 'rescan' =
    body?.filter === 'aio' ? 'aio' : body?.filter === 'rescan' ? 'rescan' : 'all';
  const rescanRequested: string[] = scanFilter === 'rescan' && Array.isArray(body?.keywords)
    ? (body.keywords as any[]).filter((k): k is string => typeof k === 'string' && k.trim().length > 0).slice(0, MAX_BATCH)
    : [];
  if (scanFilter === 'rescan' && rescanRequested.length === 0) {
    return NextResponse.json({ error: 'filter=rescan requires a non-empty keywords array.' }, { status: 400 });
  }

  if (!process.env.SERP_API_KEY) {
    return NextResponse.json(
      { error: 'SERP_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with:  { competitors: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Latest analysis that has a semrush snapshot (keyword pool source).
  // v7.445: fetched through the shared one-row loader. Pulling 5 FULL rows here
  // exceeded Neon's 64 MB response cap on a large project and 500'd every batch,
  // so Resume looped forever — see lib/latestAnalysis.ts.
  const analysis = await loadLatestAnalysisWithSnapshot(projectId);
  if (!analysis) {
    return NextResponse.json({ error: 'No analysis with keyword data found. Run an analysis first.' }, { status: 400 });
  }

  const domain = normalizeDomain(project.websiteUrl);
  const manualCompetitorDomains: string[] = ((project as any).competitors ?? [])
    .map((c: { domain: string }) => c.domain)
    .filter(Boolean);

  const dbKws = await db.select().from(projectKeywords)
    .where(eq(projectKeywords.projectId, projectId));

  // ── v7.336 (QC audit B3, Const II.7/III.1a/III.1d) ─────────────────────────
  // Hydrate the raw DB snapshot with the project row's client brand vocabulary,
  // competitor-brand blocklist and scope-gate overrides (_brandTerms /
  // _excludedBrands / _scopeOverrides) EXACTLY as the client page does
  // (app/projects/[id]/page.tsx `analysisForPanels`), via the shared
  // hydrateSnapshotForPool the v7.335 PDF route already uses. The raw snapshot
  // carries none of these fields, so this scan's pool previously included
  // user-blocklisted keywords and ignored promote/demote scope overrides —
  // spending SerpAPI credits on keywords no on-screen panel counts. buildKwPool
  // reads all three off the snapshot itself (kwVolume `effectiveBrandTerms` /
  // `buildExcludedBrandTokens`; scope via buildScopeResolver, which reads
  // `snap._scopeOverrides` — scopeModel.ts), so hydration alone carries them,
  // with no explicit option threading — the same semantics as every client panel.
  const hydratedSnap = hydrateSnapshotForPool(project, analysis.semrushSnapshot);

  // Canonical pool — identical options to KeywordsPanel so coverage counts match
  const pool = buildKwPool({
    semrushSnapshot:   hydratedSnap,
    uploadedKeywords:  dbKws,
    clientDomain:      domain,
    competitorDomains: manualCompetitorDomains,
    clientVolMin:      (project as any).kwVolThresholdClient ?? 0,
    competitorVolMin:  (project as any).kwVolThresholdCompetitor ?? 0,
  });

  const serpSnap: any = analysis.serpApiSnapshot ?? { keywords: [] };
  const existing: KeywordSerpData[] = serpSnap.keywords ?? [];
  const scannedSet = new Set(existing.map(k => k.keyword?.toLowerCase()));
  // v7.544: keywords the provider kept failing on after retries. They are still
  // unscanned (counted in "remaining") but go to the BACK of the queue, so one
  // keyword the provider cannot answer no longer blocks every batch behind it.
  const setAside: SetAsideEntry[] = Array.isArray(serpSnap.setAside) ? serpSnap.setAside : [];
  const setAsideLow = new Set(setAside.map(e => (e.keyword ?? '').toLowerCase()));

  // v7.121: AIO filter — candidate pool is the uploaded keywords carrying an
  // "AI Overview" flag in their Semrush SERP-features cell (deduped, blocked
  // rows excluded), matching countUploadFeatures in the SERP Features panel so
  // the button's remaining count and this pool always agree.
  let candidates: Array<{ keyword: string; searchVolume: number }>;
  if (scanFilter === 'aio') {
    const seen = new Set<string>();
    candidates = [];
    for (const r of dbKws as any[]) {
      const kw = (r.keyword ?? '').trim();
      const lo = kw.toLowerCase();
      if (!kw || seen.has(lo)) continue;
      seen.add(lo);
      if (r.source === 'blocked') continue;
      if (!((r.serpFeatures ?? '') as string).toLowerCase().includes('ai overview')) continue;
      candidates.push({ keyword: kw, searchVolume: r.searchVolume ?? 0 });
    }
  } else {
    candidates = pool;
  }

  // v7.122: rescan mode — target list is the requested keywords that genuinely
  // exist in the stored scan set; everything else (pool logic) is bypassed.
  let batchKeywords: string[];
  let unscannedCount = 0;
  if (scanFilter === 'rescan') {
    batchKeywords = rescanRequested.filter(k => scannedSet.has(k.toLowerCase())).slice(0, batchSize);
    if (batchKeywords.length === 0) {
      return NextResponse.json(
        { error: 'None of the requested keywords are in the stored scan set — nothing to re-scan.' },
        { status: 400 }
      );
    }
  } else {
    const unscanned = candidates
      .filter(p => !scannedSet.has(p.keyword.toLowerCase()))
      .sort((a, b) => b.searchVolume - a.searchVolume)
      // v7.544: set-aside keywords last — retried once everything else is scanned
      .sort((a, b) => Number(setAsideLow.has(a.keyword.toLowerCase())) - Number(setAsideLow.has(b.keyword.toLowerCase())));
    unscannedCount = unscanned.length;

    // v7.132: dryRun — report remaining without scanning (0 credits, no save).
    if (dryRun) {
      return NextResponse.json({
        dryRun:       true,
        scanned:      0,
        results:      [],
        totalScanned: existing.length,
        poolTotal:    candidates.length,
        remaining:    unscannedCount,
        filter:       scanFilter,
      });
    }

    if (unscanned.length === 0) {
      return NextResponse.json({
        scanned: 0, results: [],
        totalScanned: existing.length,
        poolTotal:    candidates.length,
        remaining:    0,
        filter:       scanFilter,
      });
    }
    batchKeywords = unscanned.slice(0, batchSize).map(p => p.keyword);
  }
  console.log(`[OrbitIQ] SERP scan (${scanFilter}): ${batchKeywords.length} keywords for ${domain}`);

  const scanReport: ScanFailureReport = { failures: [], skippedForTime: 0 };   // v7.540
  const results = await batchKeywordScan(batchKeywords, domain, batchSize, getMarket((project as any).semrushDatabase), scanReport);   // v7.99: market-aware scan

  // v7.86: every keyword in the batch failed → almost certainly an account-level
  // problem (out of search credits or rate-limited), not keyword-level.
  // v7.408: name the ACTIVE provider. This message used to hardcode SerpAPI and
  // send the operator to serpapi.com — under SERP_PROVIDER=dataforseo that is
  // the wrong vendor, the wrong dashboard, and a wasted debugging session.
  // v7.544: update the set-aside list — add keywords that failed after retries,
  // drop any that now succeeded. Written on its own key so an empty batch still
  // advances the queue on the next Resume.
  const nextSetAside = updateSetAside(setAside, scanReport, results.map(r => r.keyword));
  const setAsideChanged = JSON.stringify(nextSetAside) !== JSON.stringify(setAside);

  if (results.length === 0) {
    if (setAsideChanged) {
      await db.update(analyses)
        .set({ serpApiSnapshot: sql`jsonb_set(coalesce(${analyses.serpApiSnapshot}, '{"keywords":[]}'::jsonb), '{setAside}', ${JSON.stringify(nextSetAside)}::jsonb)` as any })
        .where(eq(analyses.id, analysis.id));
    }
    const label = activeProviderLabel();
    const where = (() => { try { return providerBalanceUrl(serpProvider()); } catch { return 'your SERP provider'; } })();
    return NextResponse.json(
      { error: describeEmptyBatch(label, where, scanReport, batchKeywords.length, nextSetAside.length, unscannedCount), failures: scanReport.failures, setAside: nextSetAside.length },
      { status: 502 }
    );
  }

  // Merge. Default/aio: no overlap by construction (only unscanned sent).
  // v7.122 rescan: FRESH WINS — re-scanned keywords replace their old entries.
  // Summaries are recomputed over the COMBINED set so the SERP Features panel
  // reflects total coverage, not just the latest batch.
  const freshLow = new Set(results.map(r => r.keyword.toLowerCase()));
  const mergedKeywords = [...existing.filter(k => !freshLow.has((k.keyword ?? '').toLowerCase())), ...results];
  const newSnap: any = buildSnapshotFromKeywordData(domain, mergedKeywords);
  if (nextSetAside.length) newSnap.setAside = nextSetAside;   // v7.544

  await db.update(analyses)
    .set({ serpApiSnapshot: newSnap as any })
    .where(eq(analyses.id, analysis.id));

  console.log(`[OrbitIQ] SERP scan complete (${scanFilter}): +${results.length} (total ${mergedKeywords.length})`);

  return NextResponse.json({
    scanned:      results.length,
    results,      // panel live-merges these into the table without a reload
    totalScanned: mergedKeywords.length,
    poolTotal:    candidates.length,
    remaining:    scanFilter === 'rescan' ? 0 : Math.max(unscannedCount - results.length, 0),
    filter:       scanFilter,
    setAside:     nextSetAside.length,   // v7.544
  });
}

/** v7.544: a keyword the provider still failed on after retries, with the provider's own reason. */
interface SetAsideEntry { keyword: string; kind: string; code: number | null; message: string; at: string; attempts: number }

function updateSetAside(prev: SetAsideEntry[], r: ScanFailureReport, succeeded: string[]): SetAsideEntry[] {
  const ok = new Set(succeeded.map(k => k.toLowerCase()));
  const byLow = new Map<string, SetAsideEntry>();
  for (const e of prev) if (e?.keyword && !ok.has(e.keyword.toLowerCase())) byLow.set(e.keyword.toLowerCase(), e);
  const now = new Date().toISOString();
  for (const f of r.failedKeywords ?? []) {
    const lo = f.keyword.toLowerCase();
    const old = byLow.get(lo);
    byLow.set(lo, { keyword: f.keyword, kind: f.kind, code: f.code, message: f.message, at: now, attempts: (old?.attempts ?? 0) + 1 });
  }
  return Array.from(byLow.values());
}

/**
 * v7.540: say WHY the batch came back empty, using what the provider actually
 * returned — never a guess. On 2026-10-08 the old fixed text ("likely out of
 * credits") sent Wayne to a DataForSEO balance of $1,537 while the real cause
 * was DataForSEO's own status 50000 Internal Server Error (Const I.1).
 */
function describeEmptyBatch(label: string, where: string, r: ScanFailureReport, total: number, setAsideTotal = 0, unscannedTotal = 0): string {
  const fs = [...r.failures].sort((a, b) => b.count - a.count);
  if (fs.length === 0) {
    // No reason captured (SerpAPI path, or provider not configured) — state only what is known.
    return `${label} returned no results for this batch. No error detail was captured; check ${where} and the server logs, then retry. Nothing was saved.`;
  }
  const parts = fs.slice(0, 3).map(f => {
    const code = f.code != null ? `${f.kind === 'http' ? 'HTTP ' : 'status '}${f.code}: ` : '';
    return `${code}${f.message.replace(/\.$/, '')} on ${f.count} of ${total} keywords`;
  });
  const top = fs[0];
  const serverSide = (top.kind === 'provider' && (top.code ?? 0) >= 50000) || (top.kind === 'http' && (top.code ?? 0) >= 500) || top.kind === 'timeout';
  const hint = serverSide
    ? `This is an error on ${label}'s side, not your balance — retried automatically and still failing. Wait a few minutes and Resume.`
    : `Check the account at ${where}.`;
  // v7.544: keywords never attempted because the batch ran out of time
  if (r.skippedForTime > 0) parts.push(`${r.skippedForTime} of ${total} not reached in time`);
  // v7.544: the failed keywords are set aside, so Resume moves on instead of repeating them
  const queue = setAsideTotal > 0 && setAsideTotal < unscannedTotal
    ? ` ${setAsideTotal.toLocaleString()} keyword${setAsideTotal === 1 ? '' : 's'} ${label} keeps failing on ${setAsideTotal === 1 ? 'is' : 'are'} now set aside — Resume moves on to the next keywords and retries the set-aside ones at the end.`
    : setAsideTotal > 0
      ? ` Only set-aside keywords are left (${setAsideTotal.toLocaleString()}) and ${label} is still failing on them.`
      : '';
  return `${label} returned no results for this batch — ${parts.join('; ')}.${queue} ${serverSide ? (setAsideTotal > 0 && setAsideTotal < unscannedTotal ? 'This is an error on ' + label + "'s side, not your balance." : hint) : hint} No keyword data was saved from this batch.`;
}
