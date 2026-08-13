/**
 * /api/projects/[id]/product-insights — v7.426
 *
 * Recorded-AI-answer store for the Product Insights panel. POST scans ONE top-level
 * product category through DataForSEO's LLM Mentions index (real recorded ChatGPT +
 * Google-AI-Overview answers whose QUESTION contains the category's head keyword) and
 * persists the trimmed verbatim rows on the project; GET returns the stored scan.
 *
 * Scanning one category per request keeps each Lambda call far inside the platform
 * timeout and gives the panel a REAL per-category progress readout ("category X of N",
 * Const IV.2) — the client drives the loop.
 *
 * Data rules honoured here:
 *  - Every stored field is verbatim from the API payload, trimmed for storage only
 *    (Const I.1). `aiSearchVolume` is DataForSEO's ESTIMATED metric — stored as-is and
 *    labeled an estimate at every render site (I.5a); never presented as measured demand.
 *  - The API's own default page size (100 rows/category, `total_count` disclosed
 *    on-panel) is used — a deliberate, disclosed fetch bound (I.6 exception, recorded in
 *    the v7.426 release notes; "Fetch all" raises it to the API's 1000 max).
 *  - Cost is the measured per-task `cost` DataForSEO reports, recorded on the usage
 *    ledger under provider 'dataforseo' / unit 'llm_mentions' (I.5b, measured basis).
 *  - RMW merge per category — a scan of one category never clobbers another's rows
 *    (the v7.372 serialized read-modify-write lesson).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }        from 'zod';
import { db }       from '@/db';
import { projects } from '@/db/schema';
import { eq, sql }  from 'drizzle-orm';
import { dfsSearchLlmMentions, dataForSeoEnabled } from '@/lib/apis/dataforseo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;   // one category per call; DataForSEO live tasks run up to ~120s

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_insights JSONB`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_insights_updated_at TIMESTAMP`);
  } catch { /* already exists */ }
}

const PostSchema = z.object({
  // v7.432: the scan KEY — a top-level product name, or a full stored path
  // (' › ' joined, e.g. "Credit Cards › Card Types › Travel Cards") so any
  // sub-category can carry its OWN recorded-answer scan. Opaque to the server.
  category: z.string().min(1).max(600),
  keyword:  z.string().min(1).max(250),          // the category's head keyword — the query term
  limit:    z.number().int().min(1).max(1000).optional(),   // default 100 (the API's own page size)
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    data:      (project as any).productInsights ?? null,
    updatedAt: (project as any).productInsightsUpdatedAt ?? null,
    providerConfigured: dataForSeoEnabled(),
  }, { headers: NO_STORE });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  if (!dataForSeoEnabled()) {
    // Honest gap (I.5): the provider isn't configured — say so, never fabricate rows.
    return NextResponse.json({ error: 'DataForSEO is not configured (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD)' }, { status: 503 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { category, keyword, limit } = parsed.data;
  const result = await dfsSearchLlmMentions(keyword, { limit: limit ?? 100 });
  if (!result) {
    // The provider call failed — surfaced as a retryable error, never stored as
    // "no recorded answers" (the v0.24 transient-silent-empty lesson).
    return NextResponse.json({ error: 'DataForSEO LLM Mentions call failed — try again' }, { status: 502 });
  }

  const entry = {
    category,
    query:      keyword,
    scannedAt:  new Date().toISOString(),
    totalCount: result.totalCount,
    fetched:    result.rows.length,
    costUSD:    result.costUSD,        // measured task cost (also on the usage ledger)
    provider:   'dataforseo' as const, // provenance travels with the data (Const I.1 naming)
    rows:       result.rows,
  };

  // RMW merge: re-read inside the write path and replace ONLY this category's entry.
  const fresh = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  const cur: any = (fresh as any)?.productInsights ?? { categories: [] };
  const cats: any[] = Array.isArray(cur.categories) ? cur.categories.filter((c: any) => c?.category !== category) : [];
  cats.push(entry);
  const next = { version: 1 as const, provider: 'dataforseo' as const, categories: cats };

  await db.update(projects)
    .set({ productInsights: next, productInsightsUpdatedAt: new Date() } as any)
    .where(eq(projects.id, params.id));

  return NextResponse.json({ ok: true, entry }, { headers: NO_STORE });
}
