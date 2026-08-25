/**
 * lib/seer/core.ts — v7.471 · the Seer grounding core, extracted from
 * app/api/projects/[id]/seer/route.ts (v7.462-v7.464) so the Insights panel
 * generator (v7.471) reuses the EXACT same machinery instead of forking it
 * (Const II.7 — one basis, no drift; the v7.459 CSV-parser fork is the cautionary
 * tale). Nothing here is new logic: context assembly over the guarded chokepoints
 * (buildKwPool + category guard, III.1a), the all-panels DATA CENSUS (v7.463),
 * the read-only tool set, and the fail-closed number-grounding verifier (v7.463)
 * are byte-identical moves. Both routes import from here.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { projects, competitors as competitorsTable, projectKeywords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { loadLatestAnalysisWithSnapshot } from '@/lib/latestAnalysis';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { buildKwPool, type KwPoolItem } from '@/lib/utils/kwVolume';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';
import {
  buildProductRows, buildCategoryTree, buildContentFootprint, contentUrlList, probeFromAnalysis,
  type StoredCatScan, type NodeKw, type ProductRow,
} from '@/lib/productInsights';
import { buildCanonicalClusterTopics } from '@/lib/clusters/canonical';

export const SEER_MODEL = 'claude-sonnet-4-6';
export const SLICE_CAP = 28_000;         // max JSON chars a single tool result returns


export interface SeerContext {
  project: any;
  analysis: any | null;
  pool: KwPoolItem[];
  guardedCategories: any[];       // _categoryBreakdown.categories minus guarded brand categories
  droppedCategoryCount: number;
  sections: Record<string, { desc: string; data: any }>;
  // v7.464: raw inputs the Product Insights shared builders read (same wiring as
  // app/api/reports/pdf/route.ts), memoized per request via _products.
  snap: any | null;
  rawSnap: any | null;
  dbKeywords: any[];
  clientDomain: string;
  competitorDomains: string[];
  _products?: ProductRow[] | null;
}

export function normDomain(d: string): string {
  return String(d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

export async function buildContext(projectId: string): Promise<SeerContext | { error: string }> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return { error: 'Project not found' };

  const [comps, dbKeywords, analysis] = await Promise.all([
    db.query.competitors.findMany({ where: eq(competitorsTable.projectId, projectId) }),
    db.query.projectKeywords.findMany({ where: eq(projectKeywords.projectId, projectId) }),
    loadLatestAnalysisWithSnapshot(projectId),
  ]);

  const clientDomain = normDomain((project as any).websiteUrl ?? '');
  const competitorDomains = comps.map(c => normDomain(c.domain));
  const rawSnap = analysis?.semrushSnapshot ?? null;
  const snap = rawSnap ? hydrateSnapshotForPool(project, rawSnap) : null;

  // Canonical pool — the SAME chokepoint every panel reads (Const II.7):
  // scope gate, tombstones, competitor-brand guard, demand union all applied.
  const pool: KwPoolItem[] = snap
    ? buildKwPool({
        semrushSnapshot: snap,
        uploadedKeywords: dbKeywords,
        clientDomain,
        competitorDomains,
        brandTerms: Array.isArray((project as any).brandTerms) ? (project as any).brandTerms : [],
        includeDemand: true,
        scopeOverrides: ((project as any).scopeOverrides ?? {}) as Record<string, 'core' | 'adjacent'>,
      })
    : [];

  // Category tree with the III.1a competitor-brand guard applied (Seer is a
  // read site of _categoryBreakdown, so the guard is mandatory).
  const rawCats: any[] = Array.isArray(rawSnap?._categoryBreakdown?.categories)
    ? rawSnap._categoryBreakdown.categories : [];
  let guardedCategories: any[] = rawCats;
  let droppedCategoryCount = 0;
  if (snap && rawCats.length) {
    const guard = buildCategoryGuard(snap, clientDomain, competitorDomains);
    const dropped = guard.droppedCategoryNames(rawCats);
    guardedCategories = rawCats.filter((c: any) => !dropped.has(c?.name));
    droppedCategoryCount = rawCats.length - guardedCategories.length;
  }

  // Raw stored sections Seer may slice into. Each is data ALREADY stored for
  // this project — no live API calls, no derivation. The keyword pool and the
  // category tree are deliberately NOT here: they are served only through the
  // guarded tools above.
  const sections: Record<string, { desc: string; data: any }> = {};
  const add = (key: string, desc: string, data: any) => {
    if (data !== null && data !== undefined) sections[key] = { desc, data };
  };
  add('demand_universe', 'Deep-journey demand universe (missing upper-funnel demand): topics with real Semrush volume, seed phrases', rawSnap?._demandUniverse ?? null);
  add('serp_snapshot', 'Stored SERP scan data (AI Overviews, People-also-ask, local pack, per-keyword features)', analysis?.serpApiSnapshot ?? null);
  add('ai_visibility', 'AI answer-engine visibility (uploaded Profound export): per-platform runs, brand mentions, citations, sentiment', (project as any).profoundData ?? analysis?.profoundSnapshot ?? null);
  add('product_insights', 'Recorded AI answers per product category (DataForSEO LLM Mentions scans)', (project as any).productInsights ?? null);
  add('authority', 'Google rank authority snapshot (Semrush backlink scan)', (project as any).authoritySnapshot ?? null);
  add('content_plan', 'Content plan selections (topic keys the team selected)', (project as any).contentPlanSelections ?? null);
  add('scope', 'View-scope selections and workstreams', {
    scopeSelections: (project as any).scopeSelections ?? null,
    scopeWorkstreams: (project as any).scopeWorkstreams ?? null,
    scopeOverrides: (project as any).scopeOverrides ?? null,
  });
  add('analysis_rollups', 'Stored top-level analysis rollups (already-computed panel metrics)', analysis ? {
    marketCaptureRate: analysis.marketCaptureRate,
    totalCategoryVolume: analysis.totalCategoryVolume,
    clientOwnedVolume: analysis.clientOwnedVolume,
    keywordFootprint: analysis.keywordFootprint,
    aioAvailable: analysis.aioAvailable,
    aioAcquired: analysis.aioAcquired,
    topCompetitor: analysis.topCompetitor,
    completedAt: analysis.completedAt,
  } : null);
  // Narrative / personas / opportunities stored on the snapshot (synthesis output)
  add('synthesis_narrative', 'Stored synthesis output: personas, opportunities, narrative (LLM-generated at analysis time — cite as synthesis output, not measured data)', {
    personas: rawSnap?._personas ?? null,
    opportunities: rawSnap?._opportunities ?? null,
    narrative: rawSnap?._narrative ?? null,
  });
  // v7.464: stored sections Seer was missing (all panel-owned, read-only)
  add('page_map', 'Ranking-URL page map (URL Taxonomy panel): every known ranking URL with its keywords and per-page Semrush traffic', rawSnap?._pageMap ?? null);
  add('local_search', 'Local Search scan (the Local panel\'s stored blob): local-pack presence per category and location', rawSnap?._localScan ?? null);
  add('audience_segments', 'Audience segments (the Audience panel\'s stored segments)', rawSnap?._audienceSegments ?? null);

  return { project, analysis, pool, guardedCategories, droppedCategoryCount, sections,
    snap, rawSnap, dbKeywords, clientDomain, competitorDomains };
}

// ─── tool implementations ────────────────────────────────────────────────────

export function capJson(value: any): string {
  const s = JSON.stringify(value);
  if (s.length <= SLICE_CAP) return s;
  return JSON.stringify({
    _truncated: true,
    _note: `Result was ${s.length} chars; showing a truncated slice. Narrow the query (filters, category, limit/offset) to see the rest.`,
    slice: s.slice(0, SLICE_CAP),
  });
}

function catSummary(c: any) {
  return {
    name: c?.name ?? null,
    parent: c?.parent ?? null,
    type: c?.type ?? null,
    keywordCount: Array.isArray(c?.keywords) ? c.keywords.length : (c?.keywordCount ?? null),
    totalVolume: c?.totalVolume ?? c?.volume ?? null,
    intentGroups: Array.isArray(c?.intentGroups) ? c.intentGroups.map((g: any) => g?.name).filter(Boolean) : undefined,
  };
}

export function toolProjectOverview(ctx: SeerContext): any {
  const p: any = ctx.project;
  const posOf = (k: KwPoolItem) => (k.position != null && !k.featurePlacement ? k.position : null);
  const clientRows = ctx.pool.filter(k => !k.isGap);
  const page1 = clientRows.filter(k => { const pos = posOf(k); return pos != null && pos <= 10; });
  return {
    project: {
      clientName: p.clientName, domain: normDomain(p.websiteUrl ?? ''), industry: p.industry ?? null,
      brandTerms: p.brandTerms ?? [],
    },
    analysis: ctx.analysis ? {
      completedAt: ctx.analysis.completedAt, status: ctx.analysis.status,
    } : null,
    keywordPool: {
      totalRows: ctx.pool.length,
      clientFootprintRows: clientRows.length,
      competitorGapRows: ctx.pool.filter(k => k.isGap && !!k.competitor).length,
      demandOriginRows: ctx.pool.filter(k => k.origin === 'demand').length,
      brandedRows: ctx.pool.filter(k => k.isBranded).length,
      clientPage1Organic: page1.length,
      clientFeaturePlacements: clientRows.filter(k => !!k.featurePlacement).length,
      note: 'Pool is the canonical, guarded basis every panel reads: scope-gated, competitor-brand-guarded, deduped.',
    },
    categoryTree: {
      categories: ctx.guardedCategories.map(catSummary),
      competitorBrandCategoriesHidden: ctx.droppedCategoryCount,
    },
    dataSectionsAvailable: Object.fromEntries(
      Object.entries(ctx.sections).map(([k, v]) => [k, v.desc]),
    ),
    dataSectionsAbsent: 'Any section not listed above holds NO stored data for this project — treat as unmeasured, never as zero.',
  };
}

export function toolQueryKeywords(ctx: SeerContext, args: any): any {
  let rows = ctx.pool;
  if (!rows.length) return { rows: [], note: 'No keyword pool stored for this project (no completed analysis with a snapshot).' };
  const contains = typeof args?.contains === 'string' ? args.contains.toLowerCase() : null;
  if (contains) rows = rows.filter(k => k.keyword.toLowerCase().includes(contains));
  if (typeof args?.branded === 'boolean') rows = rows.filter(k => k.isBranded === args.branded);
  if (typeof args?.isGap === 'boolean') rows = rows.filter(k => k.isGap === args.isGap);
  if (typeof args?.competitor === 'string') { const c = args.competitor.toLowerCase(); rows = rows.filter(k => (k.competitor ?? '').toLowerCase().includes(c)); }
  if (args?.origin === 'footprint' || args?.origin === 'demand') rows = rows.filter(k => k.origin === args.origin);
  if (typeof args?.posMin === 'number') rows = rows.filter(k => k.position != null && k.position >= args.posMin);
  if (typeof args?.posMax === 'number') rows = rows.filter(k => k.position != null && k.position <= args.posMax);
  if (args?.organicOnly === true) rows = rows.filter(k => !k.featurePlacement);
  if (typeof args?.volMin === 'number') rows = rows.filter(k => k.searchVolume >= args.volMin);

  const agg = args?.aggregate;
  if (agg === 'count') return { count: rows.length };
  if (agg === 'sum_volume') return { count: rows.length, sumVolume: rows.reduce((s, k) => s + (k.searchVolume || 0), 0) };
  if (agg === 'by_position_band') {
    const bands: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21-30': 0, '31+': 0, feature_placement: 0, not_ranked: 0 };
    for (const k of rows) {
      if (k.featurePlacement) { bands.feature_placement++; continue; }
      const p = k.position;
      if (p == null) bands.not_ranked++;
      else if (p <= 3) bands['1-3']++;
      else if (p <= 10) bands['4-10']++;
      else if (p <= 20) bands['11-20']++;
      else if (p <= 30) bands['21-30']++;
      else bands['31+']++;
    }
    return { count: rows.length, byPositionBand: bands, note: 'feature_placement rows hold a SERP feature (e.g. People also ask), reported beside organic rank, never as one.' };
  }

  const sort = args?.sort === 'position'
    ? (a: KwPoolItem, b: KwPoolItem) => (a.position ?? 999) - (b.position ?? 999)
    : (a: KwPoolItem, b: KwPoolItem) => (b.searchVolume || 0) - (a.searchVolume || 0);
  rows = [...rows].sort(sort);
  const offset = Math.max(0, Number(args?.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(args?.limit) || 50));
  return {
    totalMatching: rows.length,
    offset,
    returned: Math.min(limit, Math.max(0, rows.length - offset)),
    rows: rows.slice(offset, offset + limit).map(k => ({
      keyword: k.keyword, volume: k.searchVolume, position: k.position,
      featurePlacement: k.featurePlacement ?? undefined,
      isGap: k.isGap, competitor: k.competitor ?? undefined,
      branded: k.isBranded || undefined, origin: k.origin, url: k.url ?? undefined,
    })),
  };
}

export function toolGetSection(ctx: SeerContext, args: any): any {
  const key = String(args?.section ?? '');
  const entry = ctx.sections[key];
  if (!entry) {
    return {
      error: `No stored data for section "${key}" on this project.`,
      availableSections: Object.keys(ctx.sections),
      note: 'Absent data is UNMEASURED, never zero (Const I.5). Say so in the answer.',
    };
  }
  let data: any = entry.data;
  if (typeof args?.path === 'string' && args.path.trim()) {
    for (const part of args.path.split('.')) {
      if (data == null) break;
      data = data[/^\d+$/.test(part) ? Number(part) : part];
    }
    if (data === undefined) return { error: `Path "${args.path}" does not exist in section "${key}".` };
  }
  if (Array.isArray(data)) {
    const offset = Math.max(0, Number(args?.offset) || 0);
    const limit = Math.min(100, Math.max(1, Number(args?.limit) || 50));
    return { section: key, totalItems: data.length, offset, items: data.slice(offset, offset + limit) };
  }
  if (data !== null && typeof data === 'object') {
    // Return keys + small values so the model can drill with `path` instead of dumping everything.
    const keys = Object.keys(data);
    const preview: Record<string, any> = {};
    for (const k of keys) {
      const v = (data as any)[k];
      if (v == null || typeof v === 'number' || typeof v === 'boolean') preview[k] = v;
      else if (typeof v === 'string') preview[k] = v.length > 400 ? v.slice(0, 400) + '…' : v;
      else if (Array.isArray(v)) preview[k] = `[array · ${v.length} items — drill with path]`;
      else preview[k] = '{object — drill with path}';
    }
    return { section: key, keys, preview };
  }
  return { section: key, value: data };
}

export function toolGetCategory(ctx: SeerContext, args: any): any {
  const name = String(args?.name ?? '').toLowerCase();
  const cat = ctx.guardedCategories.find((c: any) => String(c?.name ?? '').toLowerCase() === name)
    ?? ctx.guardedCategories.find((c: any) => String(c?.name ?? '').toLowerCase().includes(name));
  if (!cat) return { error: `No category matching "${args?.name}".`, categories: ctx.guardedCategories.map((c: any) => c?.name) };
  const kws: any[] = Array.isArray(cat.keywords) ? cat.keywords : [];
  const offset = Math.max(0, Number(args?.offset) || 0);
  const limit = Math.min(100, Math.max(1, Number(args?.limit) || 40));
  return {
    ...catSummary(cat),
    intentGroups: Array.isArray(cat.intentGroups) ? cat.intentGroups.map((g: any) => ({
      name: g?.name, funnelStage: g?.funnelStage,
      leaves: Array.isArray(g?.leaves) ? g.leaves.length : undefined,
    })) : undefined,
    keywordsTotal: kws.length,
    keywords: kws.slice(offset, offset + limit),
  };
}

// ─── v7.464: content coverage — the Product Insights SHARED basis ────────────
// Wayne (2026-08-15): "content coverage is in the product panel." The v7.463 Seer
// answered content questions honestly but incompletely because it could reach only
// RAW stored blobs, not the panel's DERIVED Content Footprint vs Journey table.
// These helpers rebuild that table from the SAME shared builders the panel and the
// PDF call (Const II.6a/II.6b/II.7) — identical wiring to app/api/reports/pdf/
// route.ts. Read-only: _clusterAssigns is read as stored; classifyIntents is never
// run here. Percentages are computed by THIS tool code — the model may not compute
// (v7.463 rule 1).

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);

export function ensureProductRows(ctx: SeerContext): ProductRow[] {
  if (ctx._products !== undefined) return ctx._products ?? [];
  ctx._products = null;
  try {
    const { project, analysis, snap, dbKeywords, clientDomain, competitorDomains } = ctx;
    if (!analysis || !snap) return [];
    // Stored intent-assignment map ONLY (read-only — the PDF may compute+persist
    // an absent map; Seer must not spend or write, so an empty map just means the
    // canonical build runs on signal-matched intents, same as the page's fallback).
    const claudeAssigns = ((snap as any)?._clusterAssigns ?? {}) as Record<string, any>;
    const journeyTopics = buildCanonicalClusterTopics(
      { ...(analysis as any), semrushSnapshot: snap },
      clientDomain, competitorDomains, dbKeywords, claudeAssigns,
    );
    if (!journeyTopics || journeyTopics.length === 0) return [];
    const scans = (((project as any).productInsights?.categories ?? []) as StoredCatScan[]);
    const built = buildProductRows({
      topics:           journeyTopics,
      uploadedKeywords: dbKeywords,
      serpPositions:    ((snap as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
      llmProbe:         probeFromAnalysis(analysis),   // v7.472: probe lives in profoundSnapshot
      storedScans:      scans,
      clientDomain,
      brandTerms:       (((project as any).brandTerms ?? []) as string[]),
      breakdown:        (snap as any)?._categoryBreakdown,
    });
    ctx._products = built.products;
  } catch { ctx._products = null; }
  return ctx._products ?? [];
}

// The PDF's per-product footprint block, verbatim wiring (Const II.6b).
export function footprintForLine(ctx: SeerContext, prod: ProductRow) {
  const { project, snap, dbKeywords, clientDomain } = ctx;
  const poolKeywords: Array<{ keyword: string; searchVolume: number; position: number | null; url?: string;
    origin?: 'footprint' | 'demand'; isGap?: boolean }> = [];
  const seenKw = new Set<string>();
  for (const t of prod.topics) for (const k of (t.keywords as any[])) {
    const kk = String(k?.keyword ?? '').toLowerCase().trim();
    if (!kk || seenKw.has(kk)) continue;
    seenKw.add(kk);
    poolKeywords.push({ keyword: kk, searchVolume: k.searchVolume || 0, position: k.position ?? null, url: k.url,
      origin: (k as any)?.origin === 'demand' ? 'demand' : 'footprint', isGap: !!(k as any)?.isGap });
  }
  const scans = (((project as any).productInsights?.categories ?? []) as StoredCatScan[]);
  const tree = buildCategoryTree(prod.name, {
    breakdown:        (snap as any)?._categoryBreakdown,
    poolKeywords,
    uploadedKeywords: dbKeywords,
    serpPositions:    ((snap as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
    storedScans:      scans,
    clientDomain,
    brandTerms:       (((project as any).brandTerms ?? []) as string[]),
  });
  const cfNode = tree ?? { name: prod.name, allKws: poolKeywords as NodeKw[], children: [] as any[] };
  const cf = buildContentFootprint({
    node: cfNode as any,
    uploadedKeywords: dbKeywords,
    serpPositions: ((snap as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
    clientDomain,
    topics: prod.topics as any,
  });
  return { cf, node: cfNode };
}

const COVERAGE_BASIS = 'Basis: rank evidence — a topic is covered when the brand holds a stored rank on >=1 of its keywords; pages that never rank are NOT counted, and a published-page inventory is not stored in OrbitIQ.';

export function toolContentCoverage(ctx: SeerContext, args: any): any {
  const products = ensureProductRows(ctx);
  if (!products.length) {
    return {
      dataAbsent: true,
      note: 'No canonical Theme-Cluster topics are stored for this project, so the Content Footprint vs Journey table cannot be built — UNMEASURED, never zero (Const I.5). ' + COVERAGE_BASIS,
    };
  }
  const lineArg = typeof args?.line === 'string' ? args.line.toLowerCase().trim() : null;
  if (!lineArg) {
    // Per-line summary — the panel's headline numbers; percentages computed HERE.
    const lines = products.map(prod => {
      try {
        const { cf } = footprintForLine(ctx, prod);
        const you = cf.brands.find(b => b.kind === 'client') ?? null;
        const top = cf.brands[0] ?? null;
        const jTotal = cf.journey?.total ?? null;
        const covered = you?.covered?.total ?? null;
        return {
          product: prod.name,
          journeyTopicsRequired: jTotal,
          you: {
            topicsCovered: covered,
            pctOfJourney: jTotal != null && covered != null ? pct(covered, jTotal) : null,
            pagesRanking: you?.total.urls ?? null,
            rankedKeywords: you?.total.rankedKw ?? null,
          },
          leader: top ? {
            domain: top.domain, isClient: top.kind === 'client',
            topicsCovered: top.covered?.total ?? null, pagesRanking: top.total.urls,
          } : null,
          gapSubCategories: cf.gapChildIdx.map(i => cf.children[i]?.name).filter(Boolean),
        };
      } catch (e: any) {
        return { product: prod.name, error: `coverage build failed: ${e?.message ?? 'unknown'}` };
      }
    });
    return { basis: 'Content Footprint vs Journey — the Product Insights panel\'s own shared builders (Const II.6a/II.7). ' + COVERAGE_BASIS, lines };
  }
  const prod = products.find(p => p.name.toLowerCase() === lineArg)
    ?? products.find(p => p.name.toLowerCase().includes(lineArg));
  if (!prod) return { error: `No product line matching "${args.line}".`, lines: products.map(p => p.name) };
  const { cf, node } = footprintForLine(ctx, prod);
  const out: any = {
    product: prod.name,
    basis: 'Same shared builder the Product Insights panel and PDF render (Const II.6a/II.7). covered = topics with rank evidence; urls = distinct ranking URLs; urlKw 0 with rankedKw > 0 means the source rows carried no URL column — never zero pages. ' + COVERAGE_BASIS,
    journey: cf.journey,
    children: cf.children.map(c => ({ name: c.name, kwCount: c.kwCount })),
    brands: cf.brands.slice(0, 12).map(b => ({
      domain: b.domain, kind: b.kind,
      covered: b.covered,
      pctOfJourney: cf.journey && b.covered ? pct(b.covered.total, cf.journey.total) : null,
      urls: b.total.urls, rankedKw: b.total.rankedKw, urlKw: b.total.urlKw,
      perChild: b.perChild.map(c => ({ urls: c.urls, rankedKw: c.rankedKw })),
    })),
    brandsTotal: cf.brands.length,
    gapSubCategories: cf.gapChildIdx.map(i => cf.children[i]?.name).filter(Boolean),
    rivalsUncounted: cf.unlistedRivals,
  };
  if (args?.listClientUrls === true) {
    try {
      out.clientUrls = contentUrlList({
        kws: (node as any).allKws as NodeKw[],
        domain: ctx.clientDomain, clientDomain: ctx.clientDomain, uploadedKeywords: ctx.dbKeywords,
      }).slice(0, 100);
    } catch { out.clientUrls = null; }
  }
  return out;
}

// ─── v7.463: all-panels data census ──────────────────────────────────────────
// Collected by the SERVER before the model's first turn: the project overview
// (pool aggregates + guarded category tree) plus a preview of every stored
// section. This is what makes "every data point is considered" structural
// rather than hopeful — the model cannot skip a panel it was already handed.

export function buildCensus(ctx: SeerContext): { census: any; payload: string } {
  const sectionPreviews: Record<string, any> = {};
  for (const key of Object.keys(ctx.sections)) {
    try { sectionPreviews[key] = toolGetSection(ctx, { section: key, limit: 5 }); }
    catch { sectionPreviews[key] = { error: 'preview failed' }; }
  }
  // v7.464: coverage headlines ride in the census so EVERY content question
  // starts from the Product Insights panel's own numbers (Wayne, 2026-08-15).
  let contentCoverage: any = null;
  try { contentCoverage = toolContentCoverage(ctx, {}); }
  catch { contentCoverage = { error: 'coverage build failed' }; }
  const census = {
    _note: 'DATA CENSUS: headline metrics + previews from EVERY panel/section stored for this project, auto-collected before your first turn. Drill into any of them with the tools.',
    overview: toolProjectOverview(ctx),
    contentCoverage,
    sectionPreviews,
  };
  return { census, payload: capJson(census) };
}

// ─── v7.463: fail-closed number-grounding verifier ───────────────────────────
// Every numeric token in the answer must appear verbatim (comma/percent
// normalized, digit-boundary matched) in a tool result returned THIS request,
// or in the user's own question/history. Single digits are structural (list
// indices, "page 1") and exempt; everything else is checked.

export function extractNumberTokens(text: string): string[] {
  const cleaned = text.replace(/\*\*/g, ' ');
  const matches = cleaned.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    const norm = m.replace(/,/g, '');
    if (norm.replace(/\./g, '').length < 2) continue;   // single digits are structural
    out.push(norm);
  }
  return Array.from(new Set(out));
}

export function findUngrounded(answer: string, groundedHaystack: string): string[] {
  const hay = groundedHaystack.replace(/,/g, '');
  const bad: string[] = [];
  for (const tok of extractNumberTokens(answer)) {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?<![\\d.])' + esc + '(?![\\d])');
    if (!re.test(hay)) bad.push(tok);
  }
  return bad;
}

// ─── Anthropic tool schemas ──────────────────────────────────────────────────

// v7.471: rounding-tolerant grounding for the Insights generator ONLY (Seer keeps
// the strict verbatim gate above). A number passes when it appears verbatim OR is
// a 0-3-decimal display ROUNDING of a number actually present in the tool results
// of this request. Still fail-closed against invention: a token with no matching
// stored value at any of those precisions is rejected. Rationale: stored floats
// carry raw precision (7.265774378585086) and a narrative that must quote them
// verbatim either reads badly or trips the gate on a harmless 7.3 — a rounding of
// a REAL value is a formatting choice, not a fabrication (Const I.1).
export function findUngroundedAllowRounding(answer: string, groundedHaystack: string): string[] {
  const strict = findUngrounded(answer, groundedHaystack);
  if (strict.length === 0) return strict;
  const hayNums = groundedHaystack.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? [];
  const ok = new Set<string>();
  for (const h of hayNums) {
    const n = Number(h);
    if (!Number.isFinite(n)) continue;
    for (let d = 0; d <= 3; d++) {
      const r = n.toFixed(d);
      ok.add(r);
      ok.add(r.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
    }
  }
  return strict.filter(tok => !ok.has(tok) && !ok.has(tok.replace(/\.0+$/, '')));
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'project_overview',
    description: 'ALWAYS call this first. Returns the project digest: client/domain/industry, analysis date, canonical keyword-pool counts, the guarded category tree, and exactly which stored data sections exist for this project.',
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'query_keywords',
    description: 'Query the canonical keyword pool (the guarded basis every panel reads). Filter, sort, page, or aggregate. Positions are organic unless featurePlacement is set (that row holds a SERP feature, not an organic rank).',
    input_schema: {
      type: 'object' as const,
      properties: {
        contains: { type: 'string', description: 'substring match on the keyword text' },
        branded: { type: 'boolean' }, isGap: { type: 'boolean' },
        competitor: { type: 'string', description: 'filter gap rows to one competitor domain (substring)' },
        origin: { type: 'string', enum: ['footprint', 'demand'] },
        posMin: { type: 'number' }, posMax: { type: 'number' },
        organicOnly: { type: 'boolean', description: 'true = exclude SERP-feature placements' },
        volMin: { type: 'number' },
        sort: { type: 'string', enum: ['volume', 'position'] },
        offset: { type: 'number' }, limit: { type: 'number', description: 'max 200, default 50' },
        aggregate: { type: 'string', enum: ['count', 'sum_volume', 'by_position_band'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_category',
    description: 'Details of one category node from the guarded category tree: rollup volume, intent groups with funnel stages, and its keyword list (paged).',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        offset: { type: 'number' }, limit: { type: 'number' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_section',
    description: 'Slice into any other stored data section (see project_overview for what exists). Use path (dot notation) + offset/limit to drill instead of dumping whole sections.',
    input_schema: {
      type: 'object' as const,
      properties: {
        section: { type: 'string' },
        path: { type: 'string' },
        offset: { type: 'number' }, limit: { type: 'number' },
      },
      required: ['section'],
      additionalProperties: false,
    },
  },
  {
    name: 'content_coverage',
    description: 'Content coverage per product line — the Product Insights panel\'s Content Footprint vs Journey basis (journey topics required vs topics covered per brand, distinct ranking URLs). No args = per-line summary. Pass line for the full per-brand per-sub-category table; add listClientUrls for the client\'s ranking URLs on that line. Basis is rank evidence — pages that never rank are not counted; a published-page inventory is NOT stored. Percentages in the output are tool-computed: quote them verbatim.',
    input_schema: {
      type: 'object' as const,
      properties: {
        line: { type: 'string', description: 'product line name (substring match) for the full table' },
        listClientUrls: { type: 'boolean', description: 'with line: include the client ranking-URL list (capped 100)' },
      },
      additionalProperties: false,
    },
  },
];

export function runTool(ctx: SeerContext, name: string, args: any): any {
  switch (name) {
    case 'project_overview': return toolProjectOverview(ctx);
    case 'query_keywords':   return toolQueryKeywords(ctx, args);
    case 'get_category':     return toolGetCategory(ctx, args);
    case 'get_section':      return toolGetSection(ctx, args);
    case 'content_coverage': return toolContentCoverage(ctx, args);   // v7.464
    default: return { error: `Unknown tool ${name}` };
  }
}

export function statusLabelFor(name: string, args: any): string {
  switch (name) {
    case 'project_overview': return 'Reading the project digest';
    case 'query_keywords':   return args?.aggregate ? 'Aggregating the keyword pool' : `Querying keywords${args?.contains ? ` · "${args.contains}"` : ''}`;
    case 'get_category':     return `Reading category · ${args?.name ?? ''}`;
    case 'get_section':      return `Reading stored data · ${args?.section ?? ''}`;
    case 'content_coverage': return args?.line ? `Reading content coverage · ${args.line}` : 'Reading content coverage by product line';
    default: return 'Consulting stored data';
  }
}

// ─── system prompt ───────────────────────────────────────────────────────────

export function systemPrompt(ctx: SeerContext, activePanel?: string): string {
  const p: any = ctx.project;
  return [
    `You are OrbitIQ Seer, the in-project data analyst for the OrbitIQ SEO/GEO platform. You answer questions about ONE project: ${p.clientName} (${normDomain(p.websiteUrl ?? '')}${p.industry ? `, ${p.industry}` : ''}).`,
    activePanel ? `The user currently has the "${activePanel}" panel open.` : '',
    '',
    'NON-NEGOTIABLE RULES (the platform constitution — violating any of these is a critical failure):',
    '1. GROUNDED ONLY — MACHINE ENFORCED. Every number in your answer must appear VERBATIM in a tool result from this conversation (or in the user\'s own question). Do NOT compute numbers yourself — no self-calculated sums, ratios, percentages, or roundings; if you need an aggregate, call query_keywords with an aggregate. Write numbers exactly as the tools returned them (never abbreviate 1200 as 1.2K). A server-side grounding check rejects any answer containing a number the tools did not return.',
    '2. NO ESTIMATES, EVER. Never project, forecast, model, or estimate (no traffic projections, no revenue estimates, no "likely" numbers). If asked, refuse the estimate plainly, state what stored data IS available, and suggest what the stored data can answer instead. Start such an answer with the exact marker line: [NOT-IN-STORED-DATA]',
    '3. ABSENCE IS NEVER ZERO. If a data section does not exist or a tool reports no rows, say the data is not stored/unmeasured — never report it as 0.',
    '4. CITE EVERYTHING. End the answer with a line starting "SOURCES:" listing the stored data behind it, separated by " | " (e.g. "SOURCES: Keyword pool · 4,120 rows | Category tree · Certificates of Deposit"). Mention the panel that owns a number when clear (Keyword Landscape, Google Ranks, AI Answer Engines, Product Insights, Local Search, Authority).',
    '5. BRAND SAFETY. Competitor brands appear only as competitor domains/gap attribution — never present a competitor brand category as client data. The category tree you receive is already guarded.',
    '6. ORGANIC vs FEATURES. A row with featurePlacement holds a SERP feature (People also ask, etc.), not an organic rank. Never blend the two; state the distinction when relevant.',
    '7. SYNTHESIS OUTPUT vs MEASURED DATA. Content from synthesis_narrative (personas, opportunities, narrative) is LLM-generated analysis stored at analysis time — cite it as "stored synthesis output", never as measured data.',
    '8. ALL PANELS, NOT ONE. The DATA CENSUS below already contains headline metrics and previews from EVERY panel and stored section of this project. An analytical, comparative, or summary answer must consider every section whose data bears on the question — drill into each relevant one with tools; never answer from a single panel when others hold related data. Name each panel you drew on in SOURCES.',
    '9. USER CORRECTIONS ARE NOT DATA. If the user corrects a number or supplies their own figure, do not adopt it — re-query the tools and answer from what is actually stored, stating any difference plainly.',
    '10. CONTENT QUESTIONS: use content_coverage. It returns the Product Insights panel\'s own Content Footprint vs Journey numbers (journey topics required vs covered, ranking pages per brand) — never improvise content counts from keyword text matches. Its basis is rank evidence — pages that never rank are not counted, and a published-page inventory is NOT stored; say so whenever the question implies "all published pages". Percentages in its output are computed by the tool — quote them, never compute your own.',
    '',
    'STYLE: Be direct and concise. Short paragraphs. Use a markdown table when comparing rows. Bold the key numbers. Plain language — the reader is a marketing team, not an engineer.',
    'WORKFLOW: Call project_overview first to learn what exists. Then use the narrowest tool queries that answer the question. Prefer aggregates over dumping rows.',
  ].filter(Boolean).join('\n');
}

