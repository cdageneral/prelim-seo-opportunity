/**
 * /api/projects/[id]/competitor-coverage   (v7.405)
 *
 * The COVERAGE PROBE for the v7.405 landscape Share-of-Voice. Under the shared
 * non-branded-landscape denominator, a brand's slice is only as complete as the
 * rank data we hold for it — a competitor whose CSV export was filtered or
 * truncated scores an artificial zero on every keyword its file omitted, which
 * would read as a weak brand instead of a thin upload (Const I.5). This route
 * measures that risk with real numbers:
 *
 * GET  — the stored probe result: { checkedAt, database, perDomain: { [domain]:
 *        { semrushKeywords, uploadedRows, checkedAt } } } (or nulls when never
 *        run). No Semrush units. no-store — the panel renders "last checked"
 *        from it (Const IV.5).
 *
 * POST — probe ONE competitor domain. Body: { domain: string }.
 *        Calls Semrush `domain_ranks` (getDomainOverview — ~10 API units, the
 *        cost the panel discloses BEFORE the run, Const I.5b) and compares its
 *        `organicKeywords` count against the uploaded row count for that
 *        domain's bucket. One domain per call so the panel can show real
 *        per-domain progress (Const IV.2); the modal loops the list.
 *        The result is persisted (merge, not replace) so the comparison and its
 *        timestamp survive reloads.
 *
 * Storage: projects.coverage_check (jsonb), ensured here with ADD COLUMN IF NOT
 * EXISTS and accessed ONLY via raw SQL in this file — deliberately NOT added to
 * the drizzle schema, so no other route's SELECT can break on a project row
 * that predates the column (the v7.268/v7.327 missing-column lesson, avoided
 * at the source).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }        from '@/db';
import { projects }  from '@/db/schema';
import { eq, sql }   from 'drizzle-orm';
import { getDomainOverview } from '@/lib/apis/semrush';
import { getMarket } from '@/lib/utils/markets';
import { normalizeFootprintDomain } from '@/lib/keywords/footprintDomains';
import { setUsageProject } from '@/lib/usage/context';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureColumn() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS coverage_check JSONB`);
  } catch { /* column exists or DB unavailable — reads below fail loudly instead */ }
}

interface CoverageEntry { semrushKeywords: number; uploadedRows: number; checkedAt: string }
interface CoverageBlob  { checkedAt: string | null; database: string; perDomain: Record<string, CoverageEntry> }

async function readBlob(projectId: string): Promise<CoverageBlob | null> {
  const res: any = await db.execute(sql`
    SELECT coverage_check FROM projects WHERE id = ${projectId} LIMIT 1
  `);
  const rows: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
  const raw = rows[0]?.coverage_check ?? null;
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureColumn();
  const blob = await readBlob(params.id);
  return NextResponse.json(
    blob ?? { checkedAt: null, database: 'us', perDomain: {} },
    { headers: NO_STORE },
  );
}

// ─── POST (probe one competitor domain) ───────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureColumn();
  setUsageProject(params.id);   // attribute the Semrush units to this project

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  if (typeof body?.domain !== 'string' || !body.domain.trim()) {
    return NextResponse.json({ error: 'domain is required' }, { status: 400, headers: NO_STORE });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: NO_STORE });

  const market     = getMarket((project as any).semrushDatabase);
  const domainNorm = normalizeFootprintDomain(body.domain);

  // Real uploaded-row count for this bucket (csv + custom — the rows SoV can score).
  const cntRes: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM project_keywords
    WHERE project_id = ${params.id}
      AND domain = ${domainNorm}
      AND source IN ('csv', 'custom')
  `);
  const cntRows: any[] = Array.isArray(cntRes?.rows) ? cntRes.rows : Array.isArray(cntRes) ? cntRes : [];
  const uploadedRows = Number(cntRows[0]?.n ?? 0);

  // Real Semrush footprint size — domain_ranks, ~10 API units (Const I.5b: this
  // exact cost is disclosed on the button that triggers the run).
  let semrushKeywords: number;
  try {
    const ov = await getDomainOverview(domainNorm, market.code);
    semrushKeywords = ov.organicKeywords;
  } catch (err) {
    return NextResponse.json(
      { error: `Semrush lookup failed for ${domainNorm}: ${String((err as any)?.message ?? err)}. Check the API unit balance and retry.` },
      { status: 502, headers: NO_STORE },
    );
  }

  const now   = new Date().toISOString();
  const prior = (await readBlob(params.id)) ?? { checkedAt: null, database: market.code, perDomain: {} };
  const blob: CoverageBlob = {
    checkedAt: now,
    database:  market.code,
    perDomain: {
      ...prior.perDomain,
      [domainNorm]: { semrushKeywords, uploadedRows, checkedAt: now },
    },
  };
  await db.execute(sql`
    UPDATE projects SET coverage_check = ${JSON.stringify(blob)}::jsonb WHERE id = ${params.id}
  `);

  console.log(
    `[OrbitIQ] coverage probe project=${params.id} domain="${domainNorm}" db=${market.code} semrushKeywords=${semrushKeywords} uploadedRows=${uploadedRows}`,
  );

  return NextResponse.json(
    { domain: domainNorm, semrushKeywords, uploadedRows, checkedAt: now, database: market.code },
    { headers: NO_STORE },
  );
}
