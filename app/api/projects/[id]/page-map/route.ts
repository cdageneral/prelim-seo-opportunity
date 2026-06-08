/**
 * POST /api/projects/[id]/page-map — on-demand "Map ranking pages" (v7.166)
 *
 * Builds on UNIQUE PAGES, not the full keyword footprint:
 *   1. `domain_organic_unique` → the client's unique ranking URLs (each with its
 *      organic keyword count + traffic), sorted by traffic. One cheap request,
 *      no deep pagination (so no display_offset ERROR 605).
 *   2. `url_organic` per page → the real keywords each page ranks for, so the
 *      page can be mapped to a keyword cluster by what it actually ranks for.
 *
 * Persists `semrushSnapshot._pageMap.pages = [{ url, keywords[], keywordCount,
 * traffic, bestPosition }]` (additive JSONB). Each URL is stored once with its
 * keywords — no per-keyword duplication, and we never pull the whole 98k-keyword
 * footprint.
 *
 * COST: Semrush bills 10 API units/row for both reports. Pull ≈ maxPages (pages
 * report) + maxPages × kwPerPage (per-page keywords). Opt-in (button) only.
 *
 * Body:    { maxPages?: number (default 100, cap 300), kwPerPage?: number (default 25, cap 100) }
 * Returns (NDJSON): {type:'start',total} · {type:'progress',done,total,url}
 *                   · {type:'done', pageMap} | {type:'error', error}
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { analyses, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getOrganicPages, getUrlKeywords } from '@/lib/apis/semrush';

export const maxDuration = 300;

const DEFAULT_MAX_PAGES   = 100;
const MAX_MAX_PAGES       = 300;
const DEFAULT_KW_PER_PAGE = 25;
const MAX_KW_PER_PAGE     = 100;
const CONCURRENCY = 5;

function normalizeDomain(url: string): string {
  return String(url ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const maxPages  = Math.min(Math.max(parseInt(body?.maxPages, 10)  || DEFAULT_MAX_PAGES,   1), MAX_MAX_PAGES);
  const kwPerPage = Math.min(Math.max(parseInt(body?.kwPerPage, 10) || DEFAULT_KW_PER_PAGE, 1), MAX_KW_PER_PAGE);

  if (!process.env.SEMRUSH_API_KEY) {
    return NextResponse.json(
      { error: 'SEMRUSH_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const recent = await db.query.analyses.findMany({
    where:   eq(analyses.projectId, projectId),
    orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
    limit:   5,
  });
  const analysis = recent.find((a: any) => a.semrushSnapshot != null);
  if (!analysis) {
    return NextResponse.json({ error: 'No analysis with keyword data found. Run an analysis first.' }, { status: 400 });
  }

  const snap = analysis.semrushSnapshot as any;
  const clientDomain = normalizeDomain(snap?.domain ?? (project as any)?.clientDomain ?? (project as any)?.domain ?? '');
  if (!clientDomain) {
    return NextResponse.json({ error: 'No client domain found on this analysis.' }, { status: 400 });
  }
  const database = String((project as any).semrushDatabase ?? 'us');

  console.log(`[OrbitIQ] Page-map pull: domain=${clientDomain}, db=${database}, maxPages=${maxPages}, kwPerPage=${kwPerPage}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        // 1) Unique ranking pages (cheap, single request).
        const pages = await getOrganicPages(clientDomain, maxPages, database);
        if (pages.length === 0) {
          send({ type: 'error', error: 'Semrush returned no ranking pages for this domain — likely out of API units or the domain has no organic rankings in this database.' });
          controller.close();
          return;
        }
        send({ type: 'start', total: pages.length });

        // 2) Real keywords per page (bounded concurrency) with live progress.
        const out: Array<{ url: string; keywords: string[]; keywordCount: number; traffic: number; bestPosition: number }> = new Array(pages.length);
        let next = 0, done = 0;
        async function worker() {
          while (next < pages.length) {
            const i = next++;
            const p = pages[i];
            let kws: any[] = [];
            try { kws = await getUrlKeywords(p.url, kwPerPage, database); } catch { kws = []; }
            const keywords  = kws.map((k: any) => String(k.keyword ?? '').toLowerCase().trim()).filter(Boolean);
            const positions = kws.map((k: any) => k.position).filter((n: number) => n > 0);
            out[i] = {
              url:          p.url,
              keywords,
              keywordCount: p.keywordCount,
              traffic:      p.traffic,
              bestPosition: positions.length ? Math.min(...positions) : 0,
            };
            done++;
            send({ type: 'progress', done, total: pages.length, url: p.url });
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker));

        const pageEntries = out.filter(Boolean);
        const pageMap = {
          pages: pageEntries,
          urlCount: pageEntries.length,
          keywordsPerPage: kwPerPage,
          builtAt: new Date().toISOString(),
          database,
          domain: clientDomain,
        };

        await db.update(analyses)
          .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _pageMap: pageMap } as any })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Page-map stored: ${pageEntries.length} unique pages, ${kwPerPage} kw/page sampled`);
        send({ type: 'done', pageMap });
        controller.close();
      } catch (err) {
        console.error('[OrbitIQ] Page-map pull failed:', err);
        send({ type: 'error', error: `Page-map pull failed: ${String((err as any)?.message ?? err)}` });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'application/x-ndjson; charset=utf-8',
      'Cache-Control':     'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
