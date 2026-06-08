/**
 * POST /api/projects/[id]/page-map — on-demand "Map existing pages" (v7.163)
 *
 * Pulls the client's real organic ranking URLs from Semrush
 * (`domain_organic`, the Ur column) and stores a keyword→page map on the latest
 * analysis as `semrushSnapshot._pageMap` (additive JSONB — no schema change).
 *
 * The Content Plan panel uses this to map each keyword cluster to the actual
 * page(s) on the client's site that already rank for it — so a cluster with at
 * least one ranking page is an "optimise existing" target, and a cluster with no
 * ranking page is a "build net-new" target. Every URL is a real Semrush
 * ranking URL; nothing is invented.
 *
 * Why this exists: when a client footprint was loaded via CSV upload, Semrush is
 * skipped during analysis so the stored keywords carry no URL. This pull fills
 * in the ranking URLs without re-running the whole analysis.
 *
 * COST: Semrush bills 10 API units per returned row (domain_organic). This pulls
 * the client's full ranking footprint, so cost scales with how many keywords the
 * site ranks for. Triggered explicitly by the user (button), never automatically.
 *
 * Returns (NDJSON stream): {type:'start',total} · {type:'progress',done,total}
 *                          · {type:'done', pageMap} | {type:'error', error}
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { analyses, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getOrganicKeywords, getDomainOverview } from '@/lib/apis/semrush';

export const maxDuration = 300;

function normalizeDomain(url: string): string {
  return String(url ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim();
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;

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

  // Only the keywords the client actually ranks for can have a ranking page, so
  // we trim the stored map to the client keyword set on the snapshot (this is the
  // same set the Content Plan clusters are built from — topKeywords). Keeps the
  // persisted object small and reconciles with the panel by construction.
  const clientKwSet = new Set<string>(
    ((snap?.topKeywords ?? []) as any[])
      .map((k: any) => String(k?.keyword ?? '').toLowerCase().trim())
      .filter(Boolean)
  );

  console.log(`[OrbitIQ] Page-map pull: domain=${clientDomain}, db=${database}, clientKwSet=${clientKwSet.size}`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        // Best-effort total for a determinate bar (organic keyword count).
        let total = 0;
        try {
          const ov = await getDomainOverview(clientDomain, database);
          total = ov?.organicKeywords ?? 0;
        } catch { /* total stays 0 → indeterminate bar */ }
        send({ type: 'start', total });

        const rows = await getOrganicKeywords(clientDomain, 0, 0, database, (fetched: number) => {
          send({ type: 'progress', done: fetched, total: Math.max(total, fetched) });
        });

        if (rows.length === 0) {
          send({ type: 'error', error: 'Semrush returned no ranking URLs for this domain — likely out of API units or the domain has no organic rankings in this database.' });
          controller.close();
          return;
        }

        // v7.165: store UNIQUE pages, each carrying its mapped keywords — instead
        // of repeating the URL string on every keyword. A keyword maps to exactly
        // one page (its best-position ranking page); the panel inverts pages →
        // keyword→url at load. Trim to the client keyword set, and keep the best
        // (lowest) position per keyword so a keyword isn't double-assigned across
        // pages. Far less data + no duplication.
        const bestByKw = new Map<string, { url: string; position: number; searchVolume: number }>();
        for (const r of rows) {
          const kw = String(r.keyword ?? '').toLowerCase().trim();
          if (!kw || !r.url) continue;
          if (clientKwSet.size > 0 && !clientKwSet.has(kw)) continue;
          const prev = bestByKw.get(kw);
          if (!prev || (r.position > 0 && r.position < prev.position)) {
            bestByKw.set(kw, { url: r.url, position: r.position ?? 0, searchVolume: r.searchVolume ?? 0 });
          }
        }

        // Group the resolved keywords under their unique page.
        const pageGroups = new Map<string, { url: string; keywords: string[]; bestPosition: number; volume: number }>();
        for (const [kw, v] of Array.from(bestByKw.entries())) {
          let pg = pageGroups.get(v.url);
          if (!pg) { pg = { url: v.url, keywords: [], bestPosition: v.position || 999, volume: 0 }; pageGroups.set(v.url, pg); }
          pg.keywords.push(kw);
          pg.volume += v.searchVolume;
          if (v.position > 0 && v.position < pg.bestPosition) pg.bestPosition = v.position;
        }
        const pages = Array.from(pageGroups.values()).sort((a, b) => b.volume - a.volume);
        const matched = bestByKw.size;
        const urlCount = pages.length;

        const pageMap = {
          pages,
          urlCount,
          rowCount: rows.length,
          matchedKeywords: matched,
          clientKeywordCount: clientKwSet.size,
          builtAt: new Date().toISOString(),
          database,
          domain: clientDomain,
        };

        await db.update(analyses)
          .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _pageMap: pageMap } as any })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Page-map stored: ${urlCount} unique pages across ${matched} client keywords (from ${rows.length} ranking rows)`);
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
