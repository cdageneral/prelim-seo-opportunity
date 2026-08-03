/**
 * GET /api/serp-compare — SerpAPI vs DataForSEO, same keywords, same request (v7.397)
 *
 * WHY: v7.397 adds DataForSEO as a second SERP provider behind the same contract.
 * Nobody should switch providers on a vendor's pricing page — the question is
 * whether the DATA agrees. This route runs an identical keyword set through BOTH
 * providers back to back and reports where they agree and where they don't, with
 * the real cost and latency of each.
 *
 * Const I.1 — everything here is measured: ranks come from the two live
 * responses, DataForSEO's cost is the figure it reports per task, SerpAPI's is
 * its effective plan rate (labeled as such, since SerpAPI reports no per-call
 * cost). Nothing is modeled. Disagreements are reported, never smoothed.
 *
 * Read-only: runs scans and returns a report. Writes nothing except the usage
 * ledger rows the two providers' own clients record (real calls, really billed).
 *
 * Query params:
 *   keywords=a,b,c     required unless projectId given
 *   domain=example.com required — the client domain ranks are measured against
 *   projectId=<uuid>   optional — take the top keywords from that project instead
 *   market=us|ca|uk|au optional, default us
 *   limit=<n>          optional, default 10, hard max 25 (this spends real money)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getMarket } from '@/lib/utils/markets';
import { serpApiBatchKeywordScan, serpProvider, type KeywordSerpData } from '@/lib/apis/serp';
import { dfsBatchKeywordScan, dataForSeoEnabled } from '@/lib/apis/dataforseo';
import { setUsageProject } from '@/lib/usage/context';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** SerpAPI reports no per-call cost; this is its effective plan rate (v7.396 registry). */
const SERPAPI_EFFECTIVE_PER_SEARCH = 275 / 30000;
const HARD_MAX = 25;

function topOverlap(a: KeywordSerpData, b: KeywordSerpData, n: number): number {
  const da = a.organicResults.slice(0, n).map(r => r.domain);
  const db_ = new Set(b.organicResults.slice(0, n).map(r => r.domain));
  if (!da.length) return 0;
  let hit = 0;
  da.forEach(d => { if (db_.has(d)) hit++; });
  return hit / da.length;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const domainParam = (sp.get('domain') ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const projectId = sp.get('projectId');
  const marketCode = sp.get('market') ?? undefined;
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '10', 10) || 10, 1), HARD_MAX);

  if (!dataForSeoEnabled()) {
    return NextResponse.json({
      ok: false,
      error: 'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not set in this environment — nothing to compare against.',
    }, { status: 400 });
  }

  let keywords = (sp.get('keywords') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  let domain = domainParam;
  let market = getMarket(marketCode);

  // Pull real keywords off a project when one is named — the honest test set.
  if (projectId) {
    try {
      setUsageProject(projectId);
      const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      const proj: any = rows[0];
      if (!proj) return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
      if (!domain) domain = String(proj.websiteUrl ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!marketCode) market = getMarket(proj.semrushDatabase);
      if (!keywords.length) {
        const snap: any = proj.semrushSnapshot ?? {};
        const top: any[] = Array.isArray(snap?.topKeywords) ? snap.topKeywords : [];
        keywords = top
          .slice()
          .sort((a, b) => (Number(b?.searchVolume) || 0) - (Number(a?.searchVolume) || 0))
          .slice(0, limit)
          .map(k => String(k?.keyword ?? ''))
          .filter(Boolean);
      }
    } catch (err) {
      return NextResponse.json({ ok: false, error: `Could not read project: ${(err as any)?.message ?? err}` }, { status: 500 });
    }
  }

  keywords = keywords.slice(0, limit);
  if (!keywords.length) return NextResponse.json({ ok: false, error: 'No keywords to compare — pass keywords= or projectId=' }, { status: 400 });
  if (!domain)          return NextResponse.json({ ok: false, error: 'No client domain — pass domain= or a projectId that has one' }, { status: 400 });

  // ── Run both providers on the SAME set ────────────────────────────────────
  const tSerp0 = Date.now();
  const serpRows = await serpApiBatchKeywordScan(keywords, domain, keywords.length, market).catch(() => [] as KeywordSerpData[]);
  const serpMs = Date.now() - tSerp0;

  const tDfs0 = Date.now();
  const dfsRows = await dfsBatchKeywordScan(keywords, domain, keywords.length, market).catch(() => [] as KeywordSerpData[]);
  const dfsMs = Date.now() - tDfs0;

  const byKw = (rows: KeywordSerpData[]) => {
    const m = new Map<string, KeywordSerpData>();
    rows.forEach(r => m.set(r.keyword, r));
    return m;
  };
  const sMap = byKw(serpRows);
  const dMap = byKw(dfsRows);

  let rankExact = 0, rankWithin1 = 0, rankBothNull = 0, rankComparable = 0;
  let aioAgree = 0, paaAgree = 0, featureCompared = 0;
  let overlapSum = 0, overlapCount = 0;

  const perKeyword = keywords.map(kw => {
    const s = sMap.get(kw) ?? null;
    const d = dMap.get(kw) ?? null;
    const bothPresent = !!s && !!d;
    let overlapTop10: number | null = null;

    if (bothPresent) {
      const sr = s!.clientRank, dr = d!.clientRank;
      if (sr === null && dr === null) { rankBothNull++; rankComparable++; rankExact++; rankWithin1++; }
      else if (sr !== null && dr !== null) {
        rankComparable++;
        if (sr === dr) rankExact++;
        if (Math.abs(sr - dr) <= 1) rankWithin1++;
      }
      if (s!.hasAIO === d!.hasAIO) aioAgree++;
      if ((s!.paaQuestions.length > 0) === (d!.paaQuestions.length > 0)) paaAgree++;
      featureCompared++;
      overlapTop10 = topOverlap(s!, d!, 10);
      overlapSum += overlapTop10; overlapCount++;
    }

    return {
      keyword: kw,
      serpapi: s ? {
        clientRank: s.clientRank, organicCount: s.organicResults.length,
        hasAIO: s.hasAIO, aioSources: s.aioSources.length, paaCount: s.paaQuestions.length,
        topDomains: s.organicResults.slice(0, 5).map(r => r.domain),
      } : null,
      dataforseo: d ? {
        clientRank: d.clientRank, organicCount: d.organicResults.length,
        hasAIO: d.hasAIO, aioSources: d.aioSources.length, paaCount: d.paaQuestions.length,
        topDomains: d.organicResults.slice(0, 5).map(r => r.domain),
      } : null,
      rankDelta: bothPresent && s!.clientRank !== null && d!.clientRank !== null ? d!.clientRank - s!.clientRank : null,
      top10DomainOverlap: overlapTop10,
      note: bothPresent ? null : (!s && !d ? 'BOTH providers returned nothing' : !s ? 'SerpAPI returned nothing' : 'DataForSEO returned nothing'),
    };
  });

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const serpCost = serpRows.length * SERPAPI_EFFECTIVE_PER_SEARCH;
  // DataForSEO's real cost lands in the ledger per call; recompute the run total
  // from its published live rate here only as an at-a-glance figure, and say so.
  const dfsListCost = dfsRows.length * 0.002;

  return NextResponse.json({
    ok: true,
    asOf: new Date().toISOString(),
    activeProvider: serpProvider(),
    domain, market: market.code, keywordsRequested: keywords.length,
    coverage: {
      serpapiReturned: serpRows.length,
      dataforseoReturned: dfsRows.length,
      bothReturned: featureCompared,
    },
    agreement: {
      clientRankExactPct:      pct(rankExact, rankComparable),
      clientRankWithin1Pct:    pct(rankWithin1, rankComparable),
      comparableKeywords:      rankComparable,
      bothSawClientUnranked:   rankBothNull,
      aiOverviewAgreePct:      pct(aioAgree, featureCompared),
      paaPresenceAgreePct:     pct(paaAgree, featureCompared),
      meanTop10DomainOverlapPct: overlapCount ? Math.round((overlapSum / overlapCount) * 1000) / 10 : null,
    },
    latencyMs: { serpapi: serpMs, dataforseo: dfsMs },
    cost: {
      serpapiUSD: serpCost,
      serpapiBasis: 'Effective plan rate $275/mo ÷ 30,000 searches = $0.0091667/search. SerpAPI reports no per-call cost, so this is derived, not measured.',
      dataforseoListUSD: dfsListCost,
      dataforseoBasis: 'Live-mode list price $0.002/SERP shown here for scale. The AUTHORITATIVE DataForSEO figure is the per-task cost it reported, recorded on every ledger row and summed on the API Usage panel.',
      ratio: dfsListCost > 0 ? Math.round((serpCost / dfsListCost) * 10) / 10 : null,
    },
    perKeyword,
    caveat: 'Live SERPs differ between any two scrapes seconds apart — personalization, rotation, and AI Overview volatility are real. Read disagreement as a range, not as one provider being wrong, and re-run before concluding.',
  });
}
