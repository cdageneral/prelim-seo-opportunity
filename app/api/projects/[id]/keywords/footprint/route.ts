/**
 * /api/projects/[id]/keywords/footprint   (v7.402)
 *
 * GET  — REAL stored-row counts for the uploaded keyword footprint, per domain
 *        bucket. The pre-run Data Source panel used to know only what THIS
 *        browser session had uploaded, so a project whose CSVs were already in
 *        the database looked empty until you re-uploaded a file and got told
 *        "these N keywords are already loaded". Now the panel reads the truth.
 *
 *        Returns: {
 *          clientDomain: string,                       // normalised project domain
 *          client:  { csvRows, otherRows, lastUploadedAt },
 *          byDomain: { [domainNorm]: { csvRows, otherRows, lastUploadedAt } },
 *        }
 *
 * POST — CLEAR one domain's uploaded CSV footprint. Body: { domain: string }.
 *        Genuinely DELETEs the source='csv' rows in that domain's bucket (never
 *        hides — Const "delete, never hide"), so the same CSV can be re-imported
 *        from scratch after it changed. Re-uploading WITHOUT clearing is an
 *        upsert: it refreshes every keyword present in the new file but leaves
 *        rows the new file dropped, which is why a true clear is needed.
 *
 *        Scoped exactly like the uploader: the CLIENT bucket is three tags wide
 *        ('' canonical, NULL legacy, and the literal client domain), a
 *        competitor bucket is its own normalised domain. Manually added rows
 *        (source 'custom'/'blocked') are NOT touched — they were never part of
 *        an upload — and the count of what survives is returned so the caller
 *        can state exactly what happened.
 *
 *        Returns: { domain, isClient, deleted, remainingOtherRows }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }              from '@/db';
import { projectKeywords, projects } from '@/db/schema';
import { and, eq, or, isNull, sql } from 'drizzle-orm';
import { normalizeFootprintDomain, isClientFootprintDomain } from '@/lib/keywords/footprintDomains';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_keywords (
        id            SERIAL    PRIMARY KEY,
        project_id    UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        keyword       TEXT      NOT NULL,
        search_volume INTEGER   NOT NULL DEFAULT 0,
        position      INTEGER,
        type          TEXT      NOT NULL DEFAULT 'gap',
        branded       BOOLEAN   NOT NULL DEFAULT false,
        source        TEXT      NOT NULL,
        domain        TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS domain TEXT`);
  } catch { /* table exists */ }
}

async function clientDomainFor(projectId: string): Promise<string> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  return normalizeFootprintDomain((project as any)?.websiteUrl ?? '');
}

interface Bucket { csvRows: number; otherRows: number; lastUploadedAt: string | null }

function emptyBucket(): Bucket {
  return { csvRows: 0, otherRows: 0, lastUploadedAt: null };
}

function addRow(b: Bucket, source: string, n: number, lastAt: string | null): void {
  if (source === 'csv') {
    b.csvRows += n;
    if (lastAt && (!b.lastUploadedAt || lastAt > b.lastUploadedAt)) b.lastUploadedAt = lastAt;
  } else {
    b.otherRows += n;
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();

  const clientDomain = await clientDomainFor(params.id);

  // Real counts straight from the table — one grouped read, no sampling, no
  // estimate (Const I.1 / I.6).
  const res: any = await db.execute(sql`
    SELECT COALESCE(domain, '')      AS domain,
           source                    AS source,
           COUNT(*)::int             AS n,
           MAX(created_at)           AS last_at
    FROM project_keywords
    WHERE project_id = ${params.id}
    GROUP BY 1, 2
  `);
  const rows: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];

  const client: Bucket = emptyBucket();
  const byDomain: Record<string, Bucket> = {};

  for (const r of rows) {
    const domainNorm = normalizeFootprintDomain(r.domain ?? '');
    const source     = String(r.source ?? '');
    const n          = Number(r.n ?? 0);
    const lastAt     = r.last_at ? new Date(r.last_at).toISOString() : null;

    if (isClientFootprintDomain(domainNorm, clientDomain)) {
      addRow(client, source, n, lastAt);
    } else {
      byDomain[domainNorm] = byDomain[domainNorm] ?? emptyBucket();
      addRow(byDomain[domainNorm], source, n, lastAt);
    }
  }

  return NextResponse.json({ clientDomain, client, byDomain }, { headers: NO_STORE });
}

// ─── POST (clear one domain) ──────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }

  if (typeof body?.domain !== 'string') {
    return NextResponse.json(
      { error: 'domain is required' },
      { status: 400, headers: NO_STORE },
    );
  }

  const clientDomain = await clientDomainFor(params.id);
  const domainNorm   = normalizeFootprintDomain(body.domain);
  const isClient     = isClientFootprintDomain(domainNorm, clientDomain);

  // Same bucket definition the uploader writes with (v7.143): client rows live
  // under '' canonically, NULL on legacy rows, and sometimes the literal client
  // domain. A competitor bucket is exactly its own normalised domain.
  const domainCond = isClient
    ? or(
        eq(projectKeywords.domain, ''),
        isNull(projectKeywords.domain),
        ...(clientDomain ? [eq(projectKeywords.domain, clientDomain)] : []),
      )
    : eq(projectKeywords.domain, domainNorm);

  const deleted = await db
    .delete(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, params.id),
      eq(projectKeywords.source, 'csv'),
      domainCond,
    ))
    .returning({ id: projectKeywords.id });

  // What survived in this bucket — manually added / blocked rows are deliberately
  // preserved, and we report the number rather than let the UI assume zero.
  const survivors = await db
    .select({ id: projectKeywords.id })
    .from(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, params.id),
      domainCond,
    ));

  console.log(
    `[OrbitIQ] footprint clear project=${params.id} domain="${domainNorm}" isClient=${isClient} deletedCsvRows=${deleted.length} remainingOtherRows=${survivors.length}`,
  );

  return NextResponse.json(
    {
      domain:  isClient ? (clientDomain || domainNorm) : domainNorm,
      isClient,
      deleted: deleted.length,
      remainingOtherRows: survivors.length,
    },
    { headers: NO_STORE },
  );
}
