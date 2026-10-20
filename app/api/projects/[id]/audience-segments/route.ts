/**
 * /api/projects/[id]/audience-segments — v7.572
 *
 * Rebuild the audience segments from the keywords IN SCOPE (Wayne 2026-10-20, Citi (travel
 * cards): "the audiences and journeys are still the same"). Synthesis writes the segments from
 * the whole footprint — every client and competitor keyword, before any Keyword Selection
 * boundary applies — so a Refresh Analysis can never narrow them. This route runs the SAME
 * segment pass (generatePersonas, unchanged prompt) over the canonical pool (buildKwPool, the
 * pool every panel counts — II.7), then the same portrait pass.
 *
 * GET               → { stale, scopeAt, segmentsScopeAt, segments, inScope }
 * POST {step:'segments'} → regenerates the segments from the in-scope pool (one Sonnet call)
 * POST {step:'images'}   → portraits for segments that have none (separate call, its own budget)
 *
 * Writes only semrush_snapshot._audienceSegments / _audienceSegmentsScope with jsonb_set —
 * the rest of the snapshot is never rewritten. Ledgered like every Claude call (usage context).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, projectKeywords } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { loadLatestAnalysisWithSnapshot } from '@/lib/latestAnalysis';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { buildKwPool } from '@/lib/utils/kwVolume';
import { generatePersonas } from '@/lib/claude/synthesize';
import { generatePersonaImages } from '@/lib/apis/personaImage';
import { setUsageProject } from '@/lib/usage/context';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

const normalizeDomain = (u: string) => String(u ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();

async function loadAll(projectId: string) {
  // named columns only (II.9): the project row carries large stores (profound_data) this never reads
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { id: true, websiteUrl: true, industry: true, clientName: true, kwVolThresholdClient: true, kwVolThresholdCompetitor: true,
      brandTerms: true, excludedBrands: true, hiddenCategories: true, hiddenCategoriesUpdatedAt: true, scopeOverrides: true, pageOverrides: true, pageMapping: true },
    with: { competitors: true },
  }) as any;
  if (!project) return null;
  const analysis = await loadLatestAnalysisWithSnapshot(projectId);
  return { project, analysis };
}

function scopeStamp(project: any): string | null {
  const t = project?.hiddenCategoriesUpdatedAt;
  return t ? new Date(t).toISOString() : null;
}

function inScopePool(project: any, analysis: any, dbKws: any[]) {
  const domain = normalizeDomain(project.websiteUrl);
  const snap = hydrateSnapshotForPool(project, analysis.semrushSnapshot);
  const pool = buildKwPool({
    semrushSnapshot: snap, uploadedKeywords: dbKws, clientDomain: domain,
    competitorDomains: (project.competitors ?? []).map((c: any) => c.domain).filter(Boolean),
    clientVolMin: project.kwVolThresholdClient ?? 0, competitorVolMin: project.kwVolThresholdCompetitor ?? 0,
  });
  return { domain, snap, pool };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const d = await loadAll(params.id);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!d.analysis) return NextResponse.json({ stale: false, segments: [] }, { headers: NO_STORE });
  const snap: any = d.analysis.semrushSnapshot ?? {};
  const segs = Array.isArray(snap._audienceSegments) ? snap._audienceSegments : [];
  const meta = snap._audienceSegmentsScope ?? null;
  const scopeAt = scopeStamp(d.project);
  const hasSelection = Array.isArray((d.project as any).hiddenCategories) && (d.project as any).hiddenCategories.length > 0;
  // stale = a boundary exists and the segments were not built on it (or on an older one)
  const stale = segs.length > 0 && hasSelection && (!meta || meta.scopeAt !== scopeAt);
  return NextResponse.json({
    stale, scopeAt, segmentsScopeAt: meta?.scopeAt ?? null, segmentsBuiltAt: meta?.builtAt ?? null,
    builtOn: meta ? { keywords: meta.keywords, volume: meta.volume } : null,
    segments: segs.map((s: any) => ({ name: s.name, volumePct: s.volumePct, hasImage: !!s.personaImageUrl })),
  }, { headers: NO_STORE });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any = {};
  try { body = await req.json(); } catch { /* default */ }
  const step = body?.step === 'images' ? 'images' : 'segments';
  const d = await loadAll(params.id);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!d.analysis) return NextResponse.json({ error: 'Run an analysis first' }, { status: 409 });
  setUsageProject?.(params.id);
  const analysisId = d.analysis.id;
  const snap: any = d.analysis.semrushSnapshot ?? {};

  if (step === 'images') {
    const segs = Array.isArray(snap._audienceSegments) ? snap._audienceSegments : [];
    if (segs.length === 0) return NextResponse.json({ error: 'No segments to illustrate' }, { status: 409 });
    const res = await generatePersonaImages(segs, {
      industry: d.project.industry ?? 'General', clientName: d.project.clientName,
      idPrefix: `${normalizeDomain(d.project.websiteUrl).replace(/[^a-z0-9]+/gi, '-')}-${String(analysisId).slice(0, 8)}-scoped`,
    }).catch(e => ({ segments: segs, status: `failed: ${String((e as any)?.message ?? e)}` }));
    await db.execute(sql`UPDATE analyses SET semrush_snapshot = jsonb_set(jsonb_set(semrush_snapshot, '{_audienceSegments}', ${JSON.stringify(res.segments)}::jsonb, true),
      '{_audienceSegmentsImageStatus}', ${JSON.stringify(res.status)}::jsonb, true) WHERE id = ${analysisId}`);
    return NextResponse.json({ ok: true, status: res.status }, { headers: NO_STORE });
  }

  const dbKws = await db.select().from(projectKeywords).where(eq(projectKeywords.projectId, params.id));
  const { domain, snap: hyd, pool } = inScopePool(d.project, d.analysis, dbKws);
  if (pool.length === 0) return NextResponse.json({ error: 'No keywords in scope — select categories in Keyword Selection first' }, { status: 409 });
  const toRow = (r: any) => ({ keyword: r.keyword, searchVolume: Number(r.searchVolume ?? 0) });
  const top = pool.filter((r: any) => !r.isGap).map(toRow);
  const gap = pool.filter((r: any) => r.isGap).map(toRow);
  const inSet = new Set(pool.map((r: any) => String(r.keyword).toLowerCase()));
  const serp: any = d.analysis.serpApiSnapshot ?? { keywords: [] };
  const scopedSerp = { ...serp, keywords: (serp.keywords ?? []).filter((k: any) => inSet.has(String(k?.keyword ?? '').toLowerCase())).map((k: any) => ({ ...k, paaQuestions: Array.isArray(k?.paaQuestions) ? k.paaQuestions : [] })) };
  const scopedSemrush = { ...hyd, topKeywords: top, gapKeywords: gap };

  const segments = await generatePersonas(domain, d.project.industry ?? 'General', scopedSemrush as any, scopedSerp as any);
  if (!Array.isArray(segments) || segments.length === 0) return NextResponse.json({ error: 'The segment pass returned nothing usable — the previous segments were kept. Try again.' }, { status: 502 });
  const meta = { builtAt: new Date().toISOString(), scopeAt: scopeStamp(d.project), keywords: pool.length, client: top.length, gap: gap.length,
    volume: pool.reduce((s: number, r: any) => s + Number(r.searchVolume ?? 0), 0) };
  await db.execute(sql`UPDATE analyses SET semrush_snapshot = jsonb_set(jsonb_set(semrush_snapshot, '{_audienceSegments}', ${JSON.stringify(segments)}::jsonb, true),
    '{_audienceSegmentsScope}', ${JSON.stringify(meta)}::jsonb, true) WHERE id = ${analysisId}`);
  return NextResponse.json({ ok: true, segments: segments.map((s: any) => ({ name: s.name, volumePct: s.volumePct })), builtOn: meta }, { headers: NO_STORE });
}
