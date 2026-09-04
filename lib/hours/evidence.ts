// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/evidence.ts — v7.447
//
// Measures every project's Hours Saved evidence in ONE query, and returns only
// integers.
//
// WHY IT IS SQL AND NOT JAVASCRIPT. The obvious implementation loads each
// project's semrushSnapshot (plus the SERP and Profound snapshots) and counts
// array lengths in JS. On this data that is the exact shape v7.445 documents:
// a single snapshot runs to millions of bytes, and asking for all of them in
// one response is refused outright with `NeonDbError HTTP 507: response is too
// large`. Every count below is therefore computed INSIDE Postgres — the jsonb
// never crosses the wire, and the response is ~30 small integers per project no
// matter how large the underlying snapshots grow.
//
// Everything is guarded with jsonb_typeof before it is measured: a null, an
// object where an array was expected, or a pre-v-whatever snapshot that never
// carried the field must read as ZERO, never raise, and never be mistaken for
// presence. A gate that cannot be measured must fail closed (Const I.5).
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '@/db';
import { sql } from 'drizzle-orm';
import type { GateContext } from './gates';

export interface ProjectEvidence {
  projectId: string;
  projectName: string;
  /**
   * v7.484 — the month this project's delivery ACTUALLY BEGAN: the timestamp of
   * its FIRST analysis, not the projects-row creation date. A row can be created
   * and never worked; hours describe work. Null when no analysis has ever run,
   * which is an honest "we cannot date this" rather than a zero (Const I.5).
   *
   * Deliberately MIN, not MAX: re-analysing a project in September must not move
   * hours that were saved in June out of June.
   */
  initiatedAt: string | null;
  ctx: GateContext;
}

const n = (v: any): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * The query names optional project columns directly, so ONE column that a prod
 * database never migrated would 500 the whole dashboard. Every route that owns
 * these columns already adds them defensively; this mirrors that, idempotently.
 */
async function ensureColumns(): Promise<void> {
  const stmts = [
    sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_selections JSONB`,
    sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_workstreams JSONB`,
    sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS content_plan_selections JSONB`,
    sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_insights JSONB`,
    sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_data JSONB`,
    sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS authority_snapshot JSONB`,
  ];
  for (const st of stmts) { try { await db.execute(st); } catch { /* already there */ } }
}

export async function loadEvidence(): Promise<ProjectEvidence[]> {
  await ensureColumns();
  // `latest` picks ONE analysis per project — the newest carrying a keyword
  // snapshot — and the jsonb stays inside the database; only counts are projected.
  const res: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (a.project_id)
             a.project_id, a.id AS analysis_id,
             a.semrush_snapshot  AS s,
             a.serpapi_snapshot  AS sp,
             a.profound_snapshot AS pf,
             a.market_capture_rate AS mcr
      FROM analyses a
      WHERE a.semrush_snapshot IS NOT NULL
      ORDER BY a.project_id, a.triggered_at DESC
    )
    SELECT
      p.id   AS "projectId",
      p.client_name AS "projectName",

      -- v7.484: initiation = the FIRST analysis ever run for this project.
      (SELECT min(a2.triggered_at) FROM analyses a2 WHERE a2.project_id = p.id) AS "initiatedAt",

      COALESCE(CASE WHEN jsonb_typeof(l.s->'topKeywords')='array'
               THEN jsonb_array_length(l.s->'topKeywords') END, 0) AS "topKeywords",

      (SELECT count(*) FROM project_keywords pk
        WHERE pk.project_id = p.id AND pk.source <> 'blocked' AND pk.domain IS NULL) AS "clientUploadRows",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_categoryBreakdown,categories}')='array'
               THEN jsonb_array_length(l.s#>'{_categoryBreakdown,categories}') END, 0) AS "categories",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_categoryBreakdown,keywordPaths}')='object'
               THEN (SELECT count(*) FROM jsonb_object_keys(l.s#>'{_categoryBreakdown,keywordPaths}')) END, 0) AS "keywordPaths",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_categoryBreakdown,categories}')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(l.s#>'{_categoryBreakdown,categories}') c
                      WHERE c->>'parent' IS NOT NULL AND c->>'parent' <> '') END, 0) AS "categoriesWithParent",

      COALESCE(CASE WHEN jsonb_typeof(p.scope_selections)='array'
               THEN jsonb_array_length(p.scope_selections) END, 0) AS "scopeSelections",

      COALESCE(CASE WHEN jsonb_typeof(p.scope_workstreams)='object'
               THEN (SELECT COALESCE(sum(CASE WHEN jsonb_typeof(v)='array' THEN jsonb_array_length(v) ELSE 0 END), 0)
                       FROM jsonb_each(p.scope_workstreams) AS e(k, v)) END, 0) AS "scopeWorkstreamItems",

      COALESCE(CASE WHEN jsonb_typeof(l.s->'_audienceSegments')='array'
               THEN jsonb_array_length(l.s->'_audienceSegments') END, 0) AS "audienceSegments",

      COALESCE(CASE WHEN jsonb_typeof(l.s->'_audienceSegments')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(l.s->'_audienceSegments') g
                      WHERE (jsonb_typeof(g->'preLLMPrompts')='array' AND jsonb_array_length(g->'preLLMPrompts')>0)
                         OR (jsonb_typeof(g->'productPrompts')='array' AND jsonb_array_length(g->'productPrompts')>0)) END, 0) AS "segmentsWithPrompts",

      COALESCE(CASE WHEN jsonb_typeof(l.pf->'results')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(l.pf->'results') r
                      WHERE r->>'prompt' IS NOT NULL AND r->>'prompt' <> '') END, 0) AS "probePrompts",

      COALESCE(CASE WHEN jsonb_typeof(p.product_insights)='object'
               THEN (SELECT COALESCE(sum(
                       CASE WHEN jsonb_typeof(v->'rows')='array'
                         THEN (SELECT count(*) FROM jsonb_array_elements(v->'rows') rr WHERE rr->>'question' IS NOT NULL AND rr->>'question' <> '')
                         ELSE 0 END), 0)
                       FROM jsonb_each(p.product_insights) AS pe(k, v)) END, 0) AS "productInsightQuestions",

      (l.pf->>'source' = 'llm_probe_v2' AND l.pf->>'overallScore' IS NOT NULL) AS "llmProbeScored",

      COALESCE(CASE WHEN jsonb_typeof(p.profound_data)='object'
               THEN (SELECT count(*) FROM jsonb_object_keys(p.profound_data)) END, 0) AS "profoundDataKeys",

      COALESCE(CASE WHEN jsonb_typeof(l.sp->'keywords')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(l.sp->'keywords') k
                      WHERE (k->>'hasAIO')::boolean IS TRUE
                        AND jsonb_typeof(k->'aioSources')='array'
                        AND jsonb_array_length(k->'aioSources') > 0) END, 0) AS "aioCitationRows",

      COALESCE((p.profound_data->>'citeTotal')::numeric, 0) AS "profoundCiteTotal",

      COALESCE(CASE WHEN jsonb_typeof(p.content_plan_selections)='array'
               THEN jsonb_array_length(p.content_plan_selections) END, 0) AS "contentPlanSelections",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_pageMap,pages}')='array'
               THEN jsonb_array_length(l.s#>'{_pageMap,pages}') END, 0) AS "pageMapPages",

      COALESCE(CASE WHEN jsonb_typeof(l.s->'positionDist')='object'
               THEN (SELECT COALESCE(sum(CASE WHEN jsonb_typeof(v)='number' THEN v::text::numeric ELSE 0 END), 0)
                       FROM jsonb_each(l.s->'positionDist') AS d(k, v)) END, 0) AS "positionDistTotal",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_demandUniverse,topics}')='array'
               THEN jsonb_array_length(l.s#>'{_demandUniverse,topics}') END, 0) AS "demandTopics",

      COALESCE(CASE WHEN jsonb_typeof(l.sp->'keywords')='array'
               THEN jsonb_array_length(l.sp->'keywords') END, 0) AS "serpScannedKeywords",

      COALESCE(CASE WHEN jsonb_typeof(p.authority_snapshot->'domains')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(p.authority_snapshot->'domains') d
                      WHERE jsonb_typeof(d->'overview')='object') END, 0) AS "authorityWithOverview",

      COALESCE(CASE WHEN jsonb_typeof(p.authority_snapshot->'domains')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(p.authority_snapshot->'domains') d
                      WHERE jsonb_typeof(d->'anchors')='array' AND jsonb_array_length(d->'anchors')>0) END, 0) AS "authorityWithAnchors",

      (SELECT count(*) FROM reports rp
        WHERE rp.analysis_id = l.analysis_id AND rp.type = 'PDF' AND rp.file_url IS NOT NULL) AS "assessmentReports",

      (l.s#>>'{_narrative,strategicCall}' IS NOT NULL) AS "hasNarrative",
      l.mcr AS "marketCaptureRate",

      (SELECT count(*) FROM opportunities o WHERE o.analysis_id = l.analysis_id) AS "opportunityRows",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_localScan,keywords}')='array'
               THEN jsonb_array_length(l.s#>'{_localScan,keywords}') END, 0) AS "localKeywords",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_localScan,locations}')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(l.s#>'{_localScan,locations}') lo
                      WHERE (lo->>'isClient')::boolean IS TRUE) END, 0) AS "localClientLocations",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_localScan,locations}')='array'
               THEN (SELECT count(*) FROM jsonb_array_elements(l.s#>'{_localScan,locations}') lo
                      WHERE lo->>'reviewsFetchedAt' IS NOT NULL) END, 0) AS "localReviewsFetched",

      COALESCE(CASE WHEN jsonb_typeof(l.s#>'{_localScan,keywords}')='array'
               THEN (SELECT COALESCE(sum(
                       CASE WHEN jsonb_typeof(k->'pack')='array'
                         THEN (SELECT count(*) FROM jsonb_array_elements(k->'pack') m WHERE (m->>'isClient')::boolean IS DISTINCT FROM TRUE)
                         ELSE 0 END), 0)
                       FROM jsonb_array_elements(l.s#>'{_localScan,keywords}') k) END, 0) AS "localRivalPackMembers"

    FROM projects p
    LEFT JOIN latest l ON l.project_id = p.id
    ORDER BY p.client_name ASC
  `);

  const rows: any[] = res?.rows ?? res ?? [];
  return rows.map(r => ({
    projectId:   String(r.projectId),
    projectName: String(r.projectName ?? 'Unknown project'),
    initiatedAt: r.initiatedAt ? new Date(r.initiatedAt).toISOString() : null,
    ctx: {
      topKeywords:             n(r.topKeywords),
      clientUploadRows:        n(r.clientUploadRows),
      categories:              n(r.categories),
      keywordPaths:            n(r.keywordPaths),
      categoriesWithParent:    n(r.categoriesWithParent),
      scopeSelections:         n(r.scopeSelections),
      scopeWorkstreamItems:    n(r.scopeWorkstreamItems),
      audienceSegments:        n(r.audienceSegments),
      segmentsWithPrompts:     n(r.segmentsWithPrompts),
      probePrompts:            n(r.probePrompts),
      productInsightQuestions: n(r.productInsightQuestions),
      llmProbeScored:          r.llmProbeScored === true,
      profoundDataKeys:        n(r.profoundDataKeys),
      aioCitationRows:         n(r.aioCitationRows),
      profoundCiteTotal:       n(r.profoundCiteTotal),
      contentPlanSelections:   n(r.contentPlanSelections),
      pageMapPages:            n(r.pageMapPages),
      positionDistTotal:       n(r.positionDistTotal),
      demandTopics:            n(r.demandTopics),
      serpScannedKeywords:     n(r.serpScannedKeywords),
      authorityWithOverview:   n(r.authorityWithOverview),
      authorityWithAnchors:    n(r.authorityWithAnchors),
      assessmentReports:       n(r.assessmentReports),
      hasNarrative:            r.hasNarrative === true,
      marketCaptureRate:       r.marketCaptureRate == null ? null : n(r.marketCaptureRate),
      opportunityRows:         n(r.opportunityRows),
      localKeywords:           n(r.localKeywords),
      localClientLocations:    n(r.localClientLocations),
      localReviewsFetched:     n(r.localReviewsFetched),
      localRivalPackMembers:   n(r.localRivalPackMembers),
    } satisfies GateContext,
  }));
}
