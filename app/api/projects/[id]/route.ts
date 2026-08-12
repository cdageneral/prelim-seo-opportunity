/**
 * /api/projects/[id]
 * GET    — project + analyses + competitors
 * PATCH  — update name, url, industry, notes, dataSource
 * DELETE — hard delete project
 *
 * v7.32: PATCH now accepts dataSource; auto-migrates data_source column.
 *
 * ── v7.411: the GET no longer ships five analyses' JSONB in ONE response ─────
 * The handler loaded the project `with: { analyses: { limit: 5, with:
 * { opportunities, personas } } }` — a single Neon query carrying up to FIFTEEN
 * snapshot columns (semrush_snapshot + serpapi_snapshot + profound_snapshot × 5
 * rows). Neon's HTTP driver refuses any single response over 64 MiB, so on a
 * project whose analyses had grown past that the query died with
 *
 *   NeonDbError: Server error (HTTP status 507):
 *   {"message":"response is too large (max is 67108864 bytes)"}
 *
 * measured live in the production runtime log on 2026-08-05 (deployment
 * dpl_F2jXkyxbMYgrao3hUPoTJs8Rmave, GET /api/projects/b2a594a8-… → 500). The
 * project page's `fetchProject` does `if (!res.ok) router.push('/dashboard')`,
 * so the 500 surfaced as a CLIENT THAT WOULD NOT OPEN — clicking the tile
 * silently bounced back to the dashboard with no error anywhere on screen (NYP,
 * Wayne, 2026-08-05). Other projects were unaffected: the failure is a function
 * of accumulated data volume, not of the route being wrong.
 *
 * The page only ever reads TWO of those five rows — `analyses[0]` (the newest,
 * for resume/checkpoint logic) and `pickDisplayAnalysis(analyses)` (the newest
 * COMPLETED one, for everything rendered). The other three shipped megabytes
 * nobody read. So:
 *
 *   1. the five heads come back from a SELECT that names only scalar columns —
 *      the snapshot JSONB never leaves Postgres for them;
 *   2. each of the (at most two) rows the page actually reads is hydrated in its
 *      OWN query, so each gets its own 64 MiB budget instead of sharing one;
 *   3. if a single row still exceeds the limit, the response degrades honestly
 *      (Const I.5) — that analysis comes back without its snapshot plus
 *      `snapshotUnavailable`, carrying the REAL byte sizes measured by Postgres
 *      (`octet_length(...::text)`, never an estimate, Const I.1). The project
 *      still opens instead of bouncing.
 *
 * `?sizes=1` returns those measured byte sizes for the five most recent
 * analyses and nothing else — a read-only probe for exactly this class of
 * failure, so the next one is diagnosed with numbers rather than guesses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects, analyses, opportunities, personas } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { MARKETS } from '@/lib/utils/markets';
// v7.373: per-project access wall + audit. No-ops while AUTH_ENFORCED is off.
import { checkProjectAccess } from '@/lib/auth/access';
import { authEnforced, canWrite, seesAllProjects } from '@/lib/auth/config';
import { recordEvent } from '@/lib/auth/audit';
// v7.411: the page's "which analysis do I display" rule, shared so the server
// hydrates exactly the row the client will read (Const II.7).
import { pickDisplayAnalysis } from '@/lib/analysis/displayAnalysis';

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'auto'`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS kw_vol_threshold_client INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS kw_vol_threshold_competitor INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS semrush_database TEXT NOT NULL DEFAULT 'us'`);   // v7.99
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_terms JSONB`);                              // v7.206
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_terms_updated_at TIMESTAMP`);              // v7.206
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS excluded_brands JSONB`);                          // v7.208
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS excluded_brands_updated_at TIMESTAMP`);          // v7.208
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections JSONB`);                  // v7.260
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_updated_at TIMESTAMP`);  // v7.260
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections JSONB`);                        // v7.267 (v7.268: also ensured here for deep-links)
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections_updated_at TIMESTAMP`);        // v7.267
  } catch { /* already exists */ }
  // v7.342: project-level taxonomy anchor (survives the full keyword reset, Const III.1e)
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS taxonomy_anchor JSONB`);                        // v7.342
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS taxonomy_anchor_updated_at TIMESTAMP`);         // v7.342
  } catch { /* already exists */ }
  // v7.367: Google Rank Authority scan snapshot — project-level, survives keyword reset.
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS authority_snapshot JSONB`);                // v7.367
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS authority_snapshot_updated_at TIMESTAMP`); // v7.367
  } catch { /* already exists */ }
  // v7.426: Product Insights — DataForSEO LLM Mentions scan store (project-level)
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_insights JSONB`);                  // v7.426
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_insights_updated_at TIMESTAMP`);   // v7.426
  } catch { /* already exists */ }
  // v7.358: manual priority moves (ContentTopic.id → P0..P3). Ensured on the project-page load
  // path so the [id] GET's SELECT * never 500s before the priority-overrides route is hit.
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority_overrides JSONB`);                      // v7.358
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority_overrides_updated_at TIMESTAMP`);       // v7.358
  } catch { /* already exists */ }
  // v7.419: soft-hidden Category Breakdown categories + content-plan backup generation —
  // ensured on the project-page load path so the [id] GET's SELECT * never 500s before the
  // hidden-categories / content-plan routes are hit (the v7.327 lesson).
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hidden_categories JSONB`);                       // v7.419
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hidden_categories_updated_at TIMESTAMP`);        // v7.419
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_prev JSONB`);            // v7.419
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections_prev_at TIMESTAMP`);     // v7.419
  } catch { /* already exists */ }
}

const marketCodes = MARKETS.map(m => m.code) as [string, ...string[]];   // v7.99

const UpdateSchema = z.object({
  clientName:               z.string().min(1).optional(),
  websiteUrl:               z.string().url().optional(),
  industry:                 z.string().optional(),
  notes:                    z.string().optional(),
  status:                   z.enum(['active', 'archived', 'draft']).optional(),
  dataSource:               z.enum(['auto', 'upload']).optional(),
  kwVolThresholdClient:     z.number().int().min(0).optional(),
  kwVolThresholdCompetitor: z.number().int().min(0).optional(),
  semrushDatabase:          z.enum(marketCodes).optional(),   // v7.99: per-project market
  // v7.206: client brand vocabulary. Terms are lowercased/trimmed/de-duped and
  // empties dropped server-side. Editing this stamps brand_terms_updated_at.
  brandTerms:               z.array(z.string().max(120)).max(1000).optional(),
  // v7.208: competitor/third-party brand blocklist. Normalised + stamped server-side.
  excludedBrands:           z.array(z.string().max(120)).max(1000).optional(),
}).strict();

// ─── v7.411: analysis loading, split so one response never carries them all ───

/** Neon's HTTP driver hard-refuses a single response above this many bytes. */
const NEON_HTTP_RESPONSE_LIMIT = 67_108_864;

/** How many analyses the project page has always received. Unchanged — this
 *  release changes WHAT each row carries, not how many rows come back. */
const ANALYSIS_HISTORY = 5;

/** Scalar analysis columns only, aliased to the camelCase shape the project page
 *  already consumes. The three snapshot columns are deliberately ABSENT: their
 *  omission here is the whole fix. The `has*Snapshot` booleans are computed in
 *  Postgres, so a caller can still tell a row HAS data without shipping it. */
const ANALYSIS_HEAD_COLS = sql`
  id::text                        AS "id",
  status::text                    AS "status",
  triggered_at                    AS "triggeredAt",
  completed_at                    AS "completedAt",
  error_message                   AS "errorMessage",
  market_capture_rate             AS "marketCaptureRate",
  total_category_volume           AS "totalCategoryVolume",
  client_owned_volume             AS "clientOwnedVolume",
  keyword_footprint               AS "keywordFootprint",
  aio_available                   AS "aioAvailable",
  aio_acquired                    AS "aioAcquired",
  top_competitor                  AS "topCompetitor",
  (semrush_snapshot  IS NOT NULL) AS "hasSemrushSnapshot",
  (serpapi_snapshot  IS NOT NULL) AS "hasSerpApiSnapshot",
  (profound_snapshot IS NOT NULL) AS "hasProfoundSnapshot"
`;

type AnalysisHead = {
  id: string;
  status: string;
  hasSemrushSnapshot: boolean;
  [k: string]: unknown;
};

/** drizzle's neon-http driver returns `{ rows }`; some versions return the array
 *  directly. Both shapes are handled the same way elsewhere in this app. */
function rowsOf(res: any): any[] {
  return (res?.rows ?? res ?? []) as any[];
}

/** The five most recent analyses, scalar columns only. */
async function loadAnalysisHeads(projectId: string): Promise<AnalysisHead[]> {
  const res = await db.execute(sql`
    SELECT ${ANALYSIS_HEAD_COLS}
      FROM analyses
     WHERE project_id = ${projectId}
     ORDER BY triggered_at DESC
     LIMIT ${ANALYSIS_HISTORY}
  `);
  return rowsOf(res) as AnalysisHead[];
}

/** REAL byte cost of one analysis's JSONB, measured by Postgres — this is the
 *  serialized size the driver would have to ship, not an estimate (Const I.1).
 *  Only the small integers cross the wire. */
async function measureSnapshotBytes(analysisId: string) {
  const res = await db.execute(sql`
    SELECT COALESCE(octet_length(semrush_snapshot::text),  0) AS "semrushBytes",
           COALESCE(octet_length(serpapi_snapshot::text),  0) AS "serpApiBytes",
           COALESCE(octet_length(profound_snapshot::text), 0) AS "profoundBytes"
      FROM analyses
     WHERE id = ${analysisId}::uuid
  `);
  const r = rowsOf(res)[0] ?? {};
  const semrushBytes  = Number(r.semrushBytes  ?? 0);
  const serpApiBytes  = Number(r.serpApiBytes  ?? 0);
  const profoundBytes = Number(r.profoundBytes ?? 0);
  return {
    semrushBytes,
    serpApiBytes,
    profoundBytes,
    totalBytes: semrushBytes + serpApiBytes + profoundBytes,
    limitBytes: NEON_HTTP_RESPONSE_LIMIT,
  };
}

/** The opportunities + personas of one analysis, without touching its snapshots.
 *  Used only on the degraded path, where the full-row read did not survive. */
async function loadAnalysisChildren(analysisId: string) {
  try {
    const [opps, pers] = await Promise.all([
      db.query.opportunities.findMany({
        where:   eq(opportunities.analysisId, analysisId),
        orderBy: (o, { asc }) => [asc(o.rank)],
      }),
      db.query.personas.findMany({ where: eq(personas.analysisId, analysisId) }),
    ]);
    return { opportunities: opps, personas: pers };
  } catch {
    return { opportunities: [], personas: [] };   // honest empty, Const I.5
  }
}

/** Load ONE analysis in full — snapshots, opportunities and personas — in its
 *  own query, so it gets its own response budget rather than sharing one with
 *  four rows nobody reads. If even this single row exceeds the limit, return the
 *  head plus the measured sizes instead of throwing: the project opens and says
 *  what is wrong (Const I.5) rather than 500-ing into a silent redirect. */
async function hydrateAnalysis(head: AnalysisHead): Promise<Record<string, unknown>> {
  try {
    const full = await db.query.analyses.findFirst({
      where: eq(analyses.id, head.id),
      with: {
        opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] },
        personas:      true,
      },
    });
    if (full) {
      return {
        ...full,
        hasSemrushSnapshot:  head.hasSemrushSnapshot,
        hasSerpApiSnapshot:  head.hasSerpApiSnapshot,
        hasProfoundSnapshot: head.hasProfoundSnapshot,
      };
    }
  } catch (err) {
    console.error(
      `[OrbitIQ v7.411] analysis ${head.id} could not be read in full — degrading to a snapshot-free row:`,
      err,
    );
  }

  const [children, bytes] = await Promise.all([
    loadAnalysisChildren(head.id),
    measureSnapshotBytes(head.id).catch(() => null),
  ]);
  return {
    ...head,
    semrushSnapshot:  null,
    serpApiSnapshot:  null,
    profoundSnapshot: null,
    ...children,
    snapshotUnavailable: {
      reason: 'This analysis is larger than the database can return in one response.',
      ...(bytes ?? { limitBytes: NEON_HTTP_RESPONSE_LIMIT }),
    },
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  // v7.373: block users without access to this project (open when flag off).
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });

  // v7.411: read-only size probe. Answers "how big did this project's analyses
  // get?" with measured bytes and never loads a snapshot to do it.
  if (req.nextUrl.searchParams.get('sizes')) {
    const heads = await loadAnalysisHeads(params.id);
    const sized = await Promise.all(
      heads.map(async h => ({
        id:          h.id,
        status:      h.status,
        triggeredAt: h.triggeredAt,
        ...(await measureSnapshotBytes(h.id)),
      })),
    );
    return NextResponse.json(
      { analyses: sized, limitBytes: NEON_HTTP_RESPONSE_LIMIT },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // The project row itself (+ competitors) — no analyses, so nothing here can
  // grow past the limit.
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: { competitors: { orderBy: (c, { asc }) => [asc(c.createdAt)] } },
  });

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Heads first (cheap), then hydrate only the rows the page reads: the newest
  // row (resume/checkpoint logic) and the displayed one (everything rendered).
  // They are usually the SAME row, in which case exactly one is hydrated.
  const heads   = await loadAnalysisHeads(params.id);
  const display = pickDisplayAnalysis(heads as any[]) as AnalysisHead | null;
  const hydrateIds = new Set<string>();
  if (heads[0]) hydrateIds.add(heads[0].id);
  if (display)  hydrateIds.add(display.id);

  const hydrated = new Map<string, Record<string, unknown>>();
  await Promise.all(
    Array.from(hydrateIds).map(async id => {
      const head = heads.find(h => h.id === id);
      if (head) hydrated.set(id, await hydrateAnalysis(head));
    }),
  );

  // Newest-first order is preserved exactly; rows the page never reads come back
  // with their snapshot fields null rather than absent, so the shape is stable.
  const analysisRows = heads.map(h => hydrated.get(h.id) ?? {
    ...h,
    semrushSnapshot:  null,
    serpApiSnapshot:  null,
    profoundSnapshot: null,
    opportunities:    [],
    personas:         [],
  });

  // v7.373: record that this user opened the project (real audit event, Const I.1).
  await recordEvent(req, { action: 'project.open', projectId: project.id, projectName: project.clientName });
  return NextResponse.json({ project: { ...project, analyses: analysisRows } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureColumns();
  // v7.373: require access + write permission (viewers are read-only).
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  if (authEnforced() && gate.user && !canWrite(gate.user.role)) {
    return NextResponse.json({ error: 'Viewers cannot edit projects' }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // v7.206: normalise brand terms (lowercase, trim, de-dupe, drop empties) and
  // stamp the edit time so the UI can show a last-updated label (Art IV.5).
  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.brandTerms !== undefined) {
    patch.brandTerms = Array.from(new Set(
      parsed.data.brandTerms.map(t => t.toLowerCase().trim()).filter(Boolean),
    ));
    patch.brandTermsUpdatedAt = new Date();
  }
  // v7.208: same normalisation for the competitor-brand blocklist.
  if (parsed.data.excludedBrands !== undefined) {
    patch.excludedBrands = Array.from(new Set(
      parsed.data.excludedBrands.map(t => t.toLowerCase().trim()).filter(Boolean),
    ));
    patch.excludedBrandsUpdatedAt = new Date();
  }

  const [updated] = await db.update(projects)
    .set(patch)
    .where(eq(projects.id, params.id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // v7.373: record the edit (real audit event, Const I.1).
  await recordEvent(req, { action: 'project.edit', projectId: updated.id, projectName: updated.clientName });
  return NextResponse.json({ project: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // v7.373: deleting a project requires access; when enforced, owner/admin only.
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  if (authEnforced() && gate.user && !seesAllProjects(gate.user.role)) {
    return NextResponse.json({ error: 'Only owners and admins can delete a project' }, { status: 403 });
  }
  const existing = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  await db.delete(projects).where(eq(projects.id, params.id));
  if (existing) {
    await recordEvent(req, { action: 'project.delete', projectId: params.id, projectName: existing.clientName });
  }
  return NextResponse.json({ success: true });
}
