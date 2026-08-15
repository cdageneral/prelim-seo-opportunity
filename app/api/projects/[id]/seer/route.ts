/**
 * /api/projects/[id]/seer — v7.462 · OrbitIQ Seer
 *
 * Natural-language Q&A over THIS project's stored data, powered by the Claude
 * API (same key + instrumented client as the synthesis pipeline, so every call
 * is metered into the api_usage ledger with project attribution — Const I.5b).
 *
 * Grounding rules, enforced by construction:
 *  - Read-only. Seer holds NO write tools; it can only query data already
 *    stored for this project. It never re-derives a panel metric — its keyword
 *    tools are built on the SAME buildKwPool + category-guard chokepoints the
 *    panels read (Const II.6a / II.7 / III.1a), so Seer sees exactly what the
 *    panels show: scope-gated, tombstoned, competitor-brand-guarded.
 *  - No estimates. The system prompt forbids modeled/projected numbers and the
 *    route exposes no CTR curves or projection helpers; when asked for one,
 *    Seer states what stored data exists and declines to model (Const I.1).
 *  - Absence is never zero (Const I.5): tools distinguish "no rows stored"
 *    from a measured 0, and the prompt requires that distinction in answers.
 *  - Access-walled: checkProjectAccess gates every request (v7.418).
 *
 * Streaming: the response is NDJSON lines —
 *   {type:'status', label}   one per pipeline step / tool call (Const IV.2/IV.3:
 *                            the drawer shows a live changing step label + elapsed)
 *   {type:'answer', answer, sources[]}   the final grounded answer
 *   {type:'error', error}
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { projects, competitors as competitorsTable, projectKeywords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkProjectAccess } from '@/lib/auth/access';
import { instrumentAnthropic } from '@/lib/usage/record';
import { setUsageProject } from '@/lib/usage/context';
import { loadLatestAnalysisWithSnapshot } from '@/lib/latestAnalysis';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { buildKwPool, type KwPoolItem } from '@/lib/utils/kwVolume';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform', 'Content-Type': 'application/x-ndjson' } as const;

// Same model family the synthesis pipeline uses; registered in the fail-closed
// rate registry (lib/usage/pricing.ts) so ledger rows price without a gap.
const SEER_MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_TURNS = 8;
const MAX_HISTORY = 12;           // question/answer turns carried for follow-ups
const SLICE_CAP = 28_000;         // max JSON chars a single tool result returns

const PostSchema = z.object({
  question: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).max(MAX_HISTORY).optional(),
  activePanel: z.string().max(80).optional(),   // label of the panel open when asked
}).strict();

// ─── data context ─────────────────────────────────────────────────────────────

interface SeerContext {
  project: any;
  analysis: any | null;
  pool: KwPoolItem[];
  guardedCategories: any[];       // _categoryBreakdown.categories minus guarded brand categories
  droppedCategoryCount: number;
  sections: Record<string, { desc: string; data: any }>;
}

function normDomain(d: string): string {
  return String(d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

async function buildContext(projectId: string): Promise<SeerContext | { error: string }> {
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

  return { project, analysis, pool, guardedCategories, droppedCategoryCount, sections };
}

// ─── tool implementations ────────────────────────────────────────────────────

function capJson(value: any): string {
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

function toolProjectOverview(ctx: SeerContext): any {
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

function toolQueryKeywords(ctx: SeerContext, args: any): any {
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

function toolGetSection(ctx: SeerContext, args: any): any {
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

function toolGetCategory(ctx: SeerContext, args: any): any {
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

// ─── Anthropic tool schemas ──────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
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
];

function runTool(ctx: SeerContext, name: string, args: any): any {
  switch (name) {
    case 'project_overview': return toolProjectOverview(ctx);
    case 'query_keywords':   return toolQueryKeywords(ctx, args);
    case 'get_category':     return toolGetCategory(ctx, args);
    case 'get_section':      return toolGetSection(ctx, args);
    default: return { error: `Unknown tool ${name}` };
  }
}

function statusLabelFor(name: string, args: any): string {
  switch (name) {
    case 'project_overview': return 'Reading the project digest';
    case 'query_keywords':   return args?.aggregate ? 'Aggregating the keyword pool' : `Querying keywords${args?.contains ? ` · "${args.contains}"` : ''}`;
    case 'get_category':     return `Reading category · ${args?.name ?? ''}`;
    case 'get_section':      return `Reading stored data · ${args?.section ?? ''}`;
    default: return 'Consulting stored data';
  }
}

// ─── system prompt ───────────────────────────────────────────────────────────

function systemPrompt(ctx: SeerContext, activePanel?: string): string {
  const p: any = ctx.project;
  return [
    `You are OrbitIQ Seer, the in-project data analyst for the OrbitIQ SEO/GEO platform. You answer questions about ONE project: ${p.clientName} (${normDomain(p.websiteUrl ?? '')}${p.industry ? `, ${p.industry}` : ''}).`,
    activePanel ? `The user currently has the "${activePanel}" panel open.` : '',
    '',
    'NON-NEGOTIABLE RULES (the platform constitution — violating any of these is a critical failure):',
    '1. GROUNDED ONLY. Every number in your answer must come verbatim from a tool result in this conversation. Never compute a number the tools did not return, beyond exact arithmetic on returned values (sums, differences, ratios of returned numbers are fine — label them as computed from the stored rows).',
    '2. NO ESTIMATES, EVER. Never project, forecast, model, or estimate (no traffic projections, no revenue estimates, no "likely" numbers). If asked, refuse the estimate plainly, state what stored data IS available, and suggest what the stored data can answer instead. Start such an answer with the exact marker line: [NOT-IN-STORED-DATA]',
    '3. ABSENCE IS NEVER ZERO. If a data section does not exist or a tool reports no rows, say the data is not stored/unmeasured — never report it as 0.',
    '4. CITE EVERYTHING. End the answer with a line starting "SOURCES:" listing the stored data behind it, separated by " | " (e.g. "SOURCES: Keyword pool · 4,120 rows | Category tree · Certificates of Deposit"). Mention the panel that owns a number when clear (Keyword Landscape, Google Ranks, AI Answer Engines, Product Insights, Local Search, Authority).',
    '5. BRAND SAFETY. Competitor brands appear only as competitor domains/gap attribution — never present a competitor brand category as client data. The category tree you receive is already guarded.',
    '6. ORGANIC vs FEATURES. A row with featurePlacement holds a SERP feature (People also ask, etc.), not an organic rank. Never blend the two; state the distinction when relevant.',
    '7. SYNTHESIS OUTPUT vs MEASURED DATA. Content from synthesis_narrative (personas, opportunities, narrative) is LLM-generated analysis stored at analysis time — cite it as "stored synthesis output", never as measured data.',
    '',
    'STYLE: Be direct and concise. Short paragraphs. Use a markdown table when comparing rows. Bold the key numbers. Plain language — the reader is a marketing team, not an engineer.',
    'WORKFLOW: Call project_overview first to learn what exists. Then use the narrowest tool queries that answer the question. Prefer aggregates over dumping rows.',
  ].filter(Boolean).join('\n');
}

// ─── route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) {
    return new Response(JSON.stringify({ type: 'error', error: gate.reason ?? 'Access denied' }) + '\n', {
      status: gate.status, headers: NO_STORE,
    });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ type: 'error', error: 'Invalid JSON' }) + '\n', { status: 400, headers: NO_STORE });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ type: 'error', error: 'Invalid body' }) + '\n', { status: 400, headers: NO_STORE });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Honest gap (I.5): not configured — say so, never a silent failure.
    return new Response(JSON.stringify({ type: 'error', error: 'Seer is not configured (ANTHROPIC_API_KEY missing)' }) + '\n', { status: 503, headers: NO_STORE });
  }

  const { question, history = [], activePanel } = parsed.data;
  const projectId = params.id;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: any) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      try {
        emit({ type: 'status', label: 'Loading stored project data' });
        const ctx = await buildContext(projectId);
        if ('error' in ctx) { emit({ type: 'error', error: ctx.error }); controller.close(); return; }

        // Ledger attribution: every instrumented Claude call in this request
        // records under THIS project (fault-tolerant, never blocks the answer).
        setUsageProject(projectId);
        const client = instrumentAnthropic(new Anthropic({ apiKey }), 'seer');

        const messages: Anthropic.MessageParam[] = [
          ...history.map(h => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
          { role: 'user', content: question },
        ];

        emit({ type: 'status', label: 'Consulting the data' });
        let answerText = '';
        for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
          const resp: Anthropic.Message = await client.messages.create({
            model: SEER_MODEL,
            max_tokens: 2000,
            system: systemPrompt(ctx, activePanel),
            tools: TOOLS,
            messages,
          });

          const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
          const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');

          if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
            answerText = textBlocks.map(b => b.text).join('\n').trim();
            break;
          }

          messages.push({ role: 'assistant', content: resp.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            emit({ type: 'status', label: statusLabelFor(tu.name, tu.input) });
            let out: any;
            try { out = runTool(ctx, tu.name, tu.input); }
            catch (e: any) { out = { error: `Tool failed: ${e?.message ?? 'unknown'}` }; }
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: capJson(out) });
          }
          messages.push({ role: 'user', content: results });

          if (turn === MAX_TOOL_TURNS - 1) {
            // Out of turns — one final no-tools call so the user always gets a
            // grounded answer from what was gathered, never a dead end.
            emit({ type: 'status', label: 'Writing the answer' });
            const fin: Anthropic.Message = await client.messages.create({
              model: SEER_MODEL,
              max_tokens: 2000,
              system: systemPrompt(ctx, activePanel) + '\nYou have used all tool calls. Answer now from what you have gathered; if something is still unknown, say so honestly.',
              messages,
            });
            answerText = fin.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
          }
        }

        // Parse the trailing SOURCES line into chips.
        let sources: string[] = [];
        const m = answerText.match(/\nSOURCES:\s*(.+)\s*$/i) ?? answerText.match(/^SOURCES:\s*(.+)\s*$/im);
        if (m) {
          sources = m[1].split('|').map(s => s.trim()).filter(Boolean);
          answerText = answerText.replace(m[0], '').trim();
        }
        const refusal = /^\s*\[NOT-IN-STORED-DATA\]/.test(answerText);
        if (refusal) answerText = answerText.replace(/^\s*\[NOT-IN-STORED-DATA\]\s*/, '').trim();

        emit({ type: 'answer', answer: answerText || 'No answer was produced — try rephrasing the question.', sources, refusal });
      } catch (e: any) {
        emit({ type: 'error', error: e?.message ?? 'Seer failed — try again' });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, { status: 200, headers: NO_STORE });
}
