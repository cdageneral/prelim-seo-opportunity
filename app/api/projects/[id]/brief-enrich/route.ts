/**
 * POST /api/projects/[id]/brief-enrich — Brief Agent SERP enrichment (v7.364)
 *
 * Supplies the three SERP-derived column groups the Content-Plan "Push to Brief
 * Agent" Excel export can't build in the browser (CORS + the SerpAPI key is
 * server-only): the Top-Ranked competitors, the Direct competitors, and the
 * People-Also-Ask sets. Everything else on the sheet (keywords + MSV, internal
 * links, audience, GEO prompts) the client already holds and fills itself.
 *
 * Per article the client sends its primary keyword (highest MSV, Const III.8)
 * and its secondary keyword strings. For each:
 *   • Top Ranked 1-3 = the top-3 organic results for the PRIMARY keyword that
 *     aren't the client — real SerpAPI rows (domain, url, title), plus the real
 *     first <h1> fetched from the page and whether that domain is cited in the
 *     keyword's AI Overview.
 *   • Direct 1-3 = the project's configured competitors (Competitors manager),
 *     shown with their own ranking (or AI-Overview-cited) page for that keyword;
 *     blank page when they neither rank nor are cited (honest gap, Const I.5).
 *   • PAA (primary / secondary) = the real People-Also-Ask questions SerpAPI
 *     returned for those keywords.
 *
 * Credit safety (mirrors serp-scan): a keyword already in the analysis's
 * serpApiSnapshot is reused for free and NEVER re-scanned. Uncached keywords are
 * scanned live — bounded to SCAN_CAP per call so one press can't run away — and
 * the fresh rows are merged back into the snapshot so the next brief reuses them.
 * The "10X content description" column is intentionally left to the CA (blank).
 *
 * Body:    { topics: Array<{ id: string; primaryKeyword: string; secondaryKeywords?: string[] }> }
 * Returns: { enrich: Array<{ id, topRanked[], direct[], paaPrimary[], paaSecondary[] }>, scannedNow, remaining }
 */

import { NextRequest, NextResponse } from 'next/server';
import { setUsageProject } from '@/lib/usage/context';
import { db } from '@/db';
import { analyses, projects } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { batchKeywordScan, buildSnapshotFromKeywordData } from '@/lib/apis/serp';
import type { KeywordSerpData } from '@/lib/apis/serp';
import { getMarket } from '@/lib/utils/markets';
import { fetchH1s } from '@/lib/apis/pageMeta';
import { resolveTopicEnrich, normalizeDomain, lc } from '@/lib/apis/briefEnrichCore';
import type { EnrichTopic } from '@/lib/apis/briefEnrichCore';

export const runtime     = 'nodejs';
export const dynamic      = 'force-dynamic';
export const revalidate   = 0;
export const maxDuration   = 300;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

// Credit-safety cap: at most this many UNCACHED keywords are live-scanned per
// call (1 keyword = 1 SerpAPI credit), matching the serp-scan route's ethos.
// The client sends topics in small chunks, so a chunk's uncached keywords are
// normally well under this; anything above it stays blank this call (honest gap).
const SCAN_CAP = 25;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  setUsageProject(projectId);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const reqTopics: Array<{ id: string; primaryKeyword: string; secondaryKeywords: string[] }> =
    (Array.isArray(body?.topics) ? body.topics : [])
      .map((t: any) => ({
        id:                String(t?.id ?? ''),
        primaryKeyword:    String(t?.primaryKeyword ?? '').trim(),
        secondaryKeywords: Array.isArray(t?.secondaryKeywords)
          ? (t.secondaryKeywords as any[]).map((k) => String(k ?? '').trim()).filter(Boolean)
          : [],
      }))
      .filter((t: { id: string }) => t.id);

  if (reqTopics.length === 0) {
    return NextResponse.json({ enrich: [], scannedNow: 0, remaining: 0 }, { headers: NO_STORE });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with:  { competitors: true },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: NO_STORE });

  const clientDomain = normalizeDomain((project as any).websiteUrl);
  const market       = getMarket((project as any).semrushDatabase);
  const directDomains: string[] = (((project as any).competitors ?? []) as Array<{ domain: string }>)
    .map((c) => normalizeDomain(c.domain))
    .filter(Boolean);

  const analysis = await db.query.analyses.findFirst({
    where:   and(eq(analyses.projectId, projectId), eq(analyses.status, 'completed')),
    orderBy: [desc(analyses.triggeredAt)],
  });
  // No analysis → nothing real to enrich with; return blank groups (honest gap).
  if (!analysis) {
    return NextResponse.json(
      { enrich: reqTopics.map((t) => ({ id: t.id, topRanked: [], direct: [], paaPrimary: [], paaSecondary: [] })), scannedNow: 0, remaining: 0 },
      { headers: NO_STORE },
    );
  }

  const serpSnap: any = (analysis as any).serpApiSnapshot ?? { keywords: [] };
  const existing: KeywordSerpData[] = Array.isArray(serpSnap.keywords) ? serpSnap.keywords : [];
  const byKeyword = new Map<string, KeywordSerpData>();
  for (const k of existing) byKeyword.set(lc(k.keyword), k);

  // Every keyword this batch needs (primary + secondaries), deduped.
  const needed = new Set<string>();
  for (const t of reqTopics) {
    if (t.primaryKeyword) needed.add(lc(t.primaryKeyword));
    for (const s of t.secondaryKeywords) needed.add(lc(s));
  }
  const uncached = Array.from(needed).filter((k) => k && !byKeyword.has(k));

  // Live-scan the uncached keywords (credit-safe: capped, primary-first so the
  // most important column is never the one dropped by the cap).
  let scannedNow = 0;
  const primarySet = new Set(reqTopics.map((t) => lc(t.primaryKeyword)).filter(Boolean));
  const toScan = uncached
    .sort((a, b) => (primarySet.has(b) ? 1 : 0) - (primarySet.has(a) ? 1 : 0))
    .slice(0, SCAN_CAP);
  if (toScan.length && process.env.SERP_API_KEY) {
    try {
      const fresh = await batchKeywordScan(toScan, clientDomain, toScan.length, market);
      if (fresh.length) {
        for (const k of fresh) byKeyword.set(lc(k.keyword), k);
        scannedNow = fresh.length;
        const freshLow = new Set(fresh.map((r) => lc(r.keyword)));
        const merged = [...existing.filter((k) => !freshLow.has(lc(k.keyword))), ...fresh];
        const newSnap = buildSnapshotFromKeywordData(clientDomain, merged);
        await db.update(analyses).set({ serpApiSnapshot: newSnap as any }).where(eq(analyses.id, (analysis as any).id));
      }
    } catch (err) {
      console.error('[OrbitIQ] brief-enrich scan failed:', String((err as any)?.message ?? err));
    }
  }

  const enrich: EnrichTopic[] = reqTopics.map((t) => resolveTopicEnrich(t, byKeyword, directDomains, clientDomain));

  const urls: string[] = [];
  for (const e of enrich) { for (const c of e.topRanked) if (c.url) urls.push(c.url); for (const c of e.direct) if (c.url) urls.push(c.url); }
  if (urls.length) {
    const h1s = await fetchH1s(urls);
    for (const e of enrich) {
      for (const c of e.topRanked) c.h1 = h1s.get(c.url) ?? '';
      for (const c of e.direct)    c.h1 = c.url ? (h1s.get(c.url) ?? '') : '';
    }
  }

  const remaining = Math.max(uncached.length - toScan.length, 0);
  return NextResponse.json({ enrich, scannedNow, remaining }, { headers: NO_STORE });
}
