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
 *  - batchSize defaults to 75, hard-capped at 100 per call.
 *  - 1 keyword = 1 SerpAPI search credit.
 *
 * Body:    { batchSize?: number }
 * Returns: { scanned, results, totalScanned, poolTotal, remaining }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { analyses, projects, projectKeywords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { batchKeywordScan, buildSnapshotFromKeywordData } from '@/lib/apis/serp';
import { getMarket } from '@/lib/utils/markets';
import type { KeywordSerpData } from '@/lib/apis/serp';
import { buildKwPool } from '@/lib/utils/kwVolume';

export const maxDuration = 300;

const DEFAULT_BATCH = 75;
const MAX_BATCH     = 100;

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

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const batchSize = Math.min(Math.max(parseInt(body?.batchSize, 10) || DEFAULT_BATCH, 1), MAX_BATCH);
  // v7.121: filter='aio' scans ONLY uploaded keywords whose Semrush
  // "SERP Features by Keyword" cell includes an AI Overview — used to make the
  // Citation Rate denominator cover the full footprint with verified data.
  const scanFilter: 'all' | 'aio' = body?.filter === 'aio' ? 'aio' : 'all';

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

  // Latest analysis that has a semrush snapshot (keyword pool source)
  const recent = await db.query.analyses.findMany({
    where:   eq(analyses.projectId, projectId),
    orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
    limit:   5,
  });
  const analysis = recent.find((a: any) => a.semrushSnapshot != null);
  if (!analysis) {
    return NextResponse.json({ error: 'No analysis with keyword data found. Run an analysis first.' }, { status: 400 });
  }

  const domain = normalizeDomain(project.websiteUrl);
  const manualCompetitorDomains: string[] = ((project as any).competitors ?? [])
    .map((c: { domain: string }) => c.domain)
    .filter(Boolean);

  const dbKws = await db.select().from(projectKeywords)
    .where(eq(projectKeywords.projectId, projectId));

  // Canonical pool — identical options to KeywordsPanel so coverage counts match
  const pool = buildKwPool({
    semrushSnapshot:   analysis.semrushSnapshot,
    uploadedKeywords:  dbKws,
    clientDomain:      domain,
    competitorDomains: manualCompetitorDomains,
    clientVolMin:      (project as any).kwVolThresholdClient ?? 0,
    competitorVolMin:  (project as any).kwVolThresholdCompetitor ?? 0,
  });

  const serpSnap: any = analysis.serpApiSnapshot ?? { keywords: [] };
  const existing: KeywordSerpData[] = serpSnap.keywords ?? [];
  const scannedSet = new Set(existing.map(k => k.keyword?.toLowerCase()));

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

  const unscanned = candidates
    .filter(p => !scannedSet.has(p.keyword.toLowerCase()))
    .sort((a, b) => b.searchVolume - a.searchVolume);

  if (unscanned.length === 0) {
    return NextResponse.json({
      scanned: 0, results: [],
      totalScanned: existing.length,
      poolTotal:    candidates.length,
      remaining:    0,
      filter:       scanFilter,
    });
  }

  const batchKeywords = unscanned.slice(0, batchSize).map(p => p.keyword);
  console.log(`[OrbitIQ] SERP scan (${scanFilter}): ${batchKeywords.length} keywords (${unscanned.length} unscanned of ${candidates.length} pool) for ${domain}`);

  const results = await batchKeywordScan(batchKeywords, domain, batchSize, getMarket((project as any).semrushDatabase));   // v7.99: market-aware scan

  // v7.86: every keyword in the batch failed → almost certainly an account-level
  // problem (out of SerpAPI search credits or rate-limited), not keyword-level.
  if (results.length === 0) {
    return NextResponse.json(
      { error: 'SerpAPI returned no results for this batch — your SerpAPI account is likely out of search credits or rate-limited. Check your balance at serpapi.com, then retry; nothing was saved or double-charged.' },
      { status: 502 }
    );
  }

  // Merge — no overlap by construction (only unscanned keywords were sent).
  // Summaries are recomputed over the COMBINED set so the SERP Features panel
  // reflects total coverage, not just the latest batch.
  const mergedKeywords = [...existing, ...results];
  const newSnap = buildSnapshotFromKeywordData(domain, mergedKeywords);

  await db.update(analyses)
    .set({ serpApiSnapshot: newSnap as any })
    .where(eq(analyses.id, analysis.id));

  console.log(`[OrbitIQ] SERP scan complete (${scanFilter}): +${results.length} (total ${mergedKeywords.length}/${candidates.length})`);

  return NextResponse.json({
    scanned:      results.length,
    results,      // panel live-merges these into the table without a reload
    totalScanned: mergedKeywords.length,
    poolTotal:    candidates.length,
    remaining:    Math.max(unscanned.length - results.length, 0),
    filter:       scanFilter,
  });
}
