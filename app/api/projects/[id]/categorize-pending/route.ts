/**
 * /api/projects/[id]/categorize-pending — v7.531
 *
 * Keywords with NO stored category (a competitor CSV uploaded after the last
 * categorization, a hand-added keyword) are held out of every panel by buildKwPool
 * (Const III.1e v0.31). This route files them into the project's EXISTING category
 * tree — never a new category — so they can enter the pool under the Step-2
 * selection like everything else (Wayne, 2026-10-07).
 *
 * GET  → { pending, pendingAnnualVolume, candidates, batchSize, hasTree }
 * POST → body { limit? }  files up to `limit` pending keywords (highest volume first)
 *        → { filed, other, unanswered, remaining, remainingAnnualVolume, ms }
 *
 * The client calls POST in a loop and shows live progress + ETA from the measured
 * time per call (Const IV.2). Every Claude call goes through instrumentAnthropic, so
 * the real token cost lands in the API Usage ledger (Const I.5b).
 *
 * Writes ONLY the new membership entries, merged in SQL with jsonb `||`, on the SAME
 * analysis row the project page displays (loadDisplayAnalysisWithSemrush, v7.503) —
 * the multi-MB snapshot is never read back and rewritten (Const II.9).
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { projects, competitors, projectKeywords } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { setUsageProject } from '@/lib/usage/context';
import { instrumentAnthropic } from '@/lib/usage/record';
import { buildKwPool, hasStoredCategoryTree, hasStoredMembership } from '@/lib/utils/kwVolume';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';
import { loadDisplayAnalysisWithSemrush } from '@/lib/analysis/loadDisplayAnalysis';
import {
  buildCandidates, buildCategorizePrompt, parseAssignments, membershipFor,
} from '@/lib/category/pendingCategorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const MODEL       = 'claude-haiku-4-5-20251001';
const BATCH       = 50;     // keywords per Claude call
const PARALLEL    = 6;      // calls in flight per POST
const DEFAULT_LIM = 600;    // keywords per POST (12 calls)
const MAX_LIM     = 1200;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return instrumentAnthropic(new Anthropic({ apiKey }));
}

/** Load everything the pending set depends on — named columns only (II.9). */
async function loadContext(projectId: string) {
  const [project] = await db
    .select({
      id:                projects.id,
      websiteUrl:        projects.websiteUrl,
      brandTerms:        projects.brandTerms,
      excludedBrands:    projects.excludedBrands,
      scopeOverrides:    projects.scopeOverrides,
      hiddenCategories:  projects.hiddenCategories,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: 'Project not found', status: 404 } as const;

  const comps = await db.select({ domain: competitors.domain }).from(competitors).where(eq(competitors.projectId, projectId));
  const competitorDomains = comps.map(c => c.domain).filter(Boolean);

  const loaded = await loadDisplayAnalysisWithSemrush(projectId);
  if (!loaded || loaded.semrushSnapshot == null) return { error: 'No analysis with keyword data yet — run an analysis first.', status: 400 } as const;

  const dbKws = await db.select({
    keyword: projectKeywords.keyword, searchVolume: projectKeywords.searchVolume,
    position: projectKeywords.position, type: projectKeywords.type, source: projectKeywords.source,
    domain: projectKeywords.domain, url: projectKeywords.url, positionType: projectKeywords.positionType,
  }).from(projectKeywords).where(eq(projectKeywords.projectId, projectId));

  const raw  = loaded.semrushSnapshot;
  const snap = hydrateSnapshotForPool(project, raw);
  const clientDomain = String(raw?.domain ?? project.websiteUrl ?? '');

  // Pending = keywords the pool would carry if membership were not required, that have none.
  const pool = buildKwPool({
    semrushSnapshot: snap, uploadedKeywords: dbKws as any[], clientDomain, competitorDomains,
    brandTerms: Array.isArray(project.brandTerms) ? project.brandTerms : [], includePending: true,
  });
  const pending = pool
    .filter(p => p.origin !== 'demand' && !hasStoredMembership(raw, p.keyword))
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));

  const guard = buildCategoryGuard(snap, clientDomain, competitorDomains);
  // Competitor/footprint keywords are filed into PRODUCT categories only: brand buckets are
  // never a target (a competitor's generic term is not the client's brand search).
  const candidates = buildCandidates(
    raw?._categoryBreakdown?.categories ?? [],
    (name: string, type?: string) => type === 'brand' || guard.isCompetitorBrandCategory(name, type),
  );

  return { analysisId: loaded.head.id, raw, clientDomain, pending, candidates, hasTree: hasStoredCategoryTree(raw) } as const;
}

const annual = (rows: Array<{ searchVolume: number }>) => rows.reduce((n, r) => n + (r.searchVolume ?? 0), 0) * 12;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadContext(params.id);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json({
    hasTree:             ctx.hasTree,
    pending:             ctx.hasTree ? ctx.pending.length : 0,
    pendingAnnualVolume: ctx.hasTree ? annual(ctx.pending) : 0,
    candidates:          ctx.candidates.length,
    batchSize:           BATCH,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  setUsageProject(projectId);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const limit = Math.max(BATCH, Math.min(MAX_LIM, Number(body?.limit) || DEFAULT_LIM));

  const t0 = Date.now();
  const ctx = await loadContext(projectId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!ctx.hasTree) return NextResponse.json({ error: 'This project has no category tree yet — run an analysis first.' }, { status: 400 });
  if (ctx.candidates.length === 0) {
    return NextResponse.json({ error: 'No selected categories to file into — select at least one category in Keyword Selection.' }, { status: 400 });
  }

  const work = ctx.pending.slice(0, limit).map(p => p.keyword);
  const batches: string[][] = [];
  for (let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH));

  const paths: Record<string, string[]> = {};
  const cats:  Record<string, string>   = {};
  let filed = 0, other = 0, unanswered = 0, failedCalls = 0;

  const client = getClient();
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const group = batches.slice(i, i + PARALLEL);
    const results = await Promise.all(group.map(async kws => {
      try {
        const res = await client.messages.create({
          model: MODEL, max_tokens: 2048,
          messages: [{ role: 'user', content: buildCategorizePrompt(ctx.clientDomain, kws, ctx.candidates) }],
        });
        const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
        return { kws, ...parseAssignments(text, kws.length, ctx.candidates) };
      } catch (err) {
        console.error('[OrbitIQ] categorize-pending batch failed:', err);
        failedCalls++;
        return null;
      }
    }));
    for (const r of results) {
      if (!r) continue;
      const m = membershipFor(r.kws, r.picks);
      Object.assign(paths, m.paths); Object.assign(cats, m.cats);
      filed += m.filed; other += m.other; unanswered += r.unanswered;
    }
    if (Date.now() - t0 > 240_000) break;   // stay inside the 300 s function cap; the client loops
  }

  if (Object.keys(cats).length > 0) {
    await db.execute(sql`
      UPDATE analyses
         SET semrush_snapshot = jsonb_set(
               jsonb_set(
                 semrush_snapshot,
                 '{_categoryBreakdown,keywordPaths}',
                 COALESCE(semrush_snapshot #> '{_categoryBreakdown,keywordPaths}', '{}'::jsonb) || ${JSON.stringify(paths)}::jsonb,
                 true),
               '{_categoryBreakdown,keywordCategories}',
               COALESCE(semrush_snapshot #> '{_categoryBreakdown,keywordCategories}', '{}'::jsonb) || ${JSON.stringify(cats)}::jsonb,
               true)
       WHERE id = ${ctx.analysisId}`);
  }

  const done = new Set(Object.keys(cats));
  const remainingRows = ctx.pending.filter(p => !done.has(p.keyword.toLowerCase().trim()));
  return NextResponse.json({
    filed, other, unanswered, failedCalls,
    remaining:             remainingRows.length,
    remainingAnnualVolume: annual(remainingRows),
    ms:                    Date.now() - t0,
  });
}
