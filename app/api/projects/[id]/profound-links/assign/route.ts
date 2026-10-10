/**
 * /api/projects/[id]/profound-links/assign — v7.547 (Lane 2)
 *
 * Files the Profound prompts in the project's link store into its EXISTING stored
 * taxonomy with the Claude filer (lib/profound/promptFiler.ts), so Product Insights can
 * show per page the prompts that page SHOULD be answering — including the ones the
 * client was never cited in. Never a new node (Const III.1e); the assignment is STORED
 * on the link store with the model's own confidence and read back, never re-derived at
 * read time (III.1b / III.7).
 *
 * GET  → { total, assigned, review, noFit, unassigned, candidates, batchSize, hasTree }
 * POST body { limit?, mode? }  files up to `limit` prompts (most-answered first)
 *        mode 'pending' (default): prompts with no stored assignment
 *        mode 'refile': every prompt (a rule or taxonomy change) — stamps PROMPT_FILER_VERSION
 *      → { filed, noFit, review, unanswered, failedCalls, remaining, ms }
 *
 * The client loops POST and shows live progress + ETA from the measured time per call
 * (Const IV.2). Every Claude call goes through instrumentAnthropic so the real token cost
 * lands in the API Usage ledger (Const I.5b). The store is merged in SQL (jsonb_set on the
 * assignments key) — the prompt rows are never read back and rewritten.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { projects, competitors } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { setUsageProject } from '@/lib/usage/context';
import { instrumentAnthropic } from '@/lib/usage/record';
import { hasStoredCategoryTree } from '@/lib/utils/kwVolume';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';
import { loadDisplayAnalysisWithSemrush } from '@/lib/analysis/loadDisplayAnalysis';
import { buildCandidates, ownBrandList, type CandidateCategory } from '@/lib/category/pendingCategorization';
import { promptKey, type ProfoundLinkStore, type PromptAssignment } from '@/lib/profound/pageLinks';
import { buildPromptFilerPrompt, parsePromptAssignments, assignmentFor, PROMPT_FILER_MODEL, PROMPT_FILER_BATCH, PROMPT_FILER_VERSION } from '@/lib/profound/promptFiler';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const PARALLEL    = 5;
const DEFAULT_LIM = 400;
const MAX_LIM     = 1000;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return instrumentAnthropic(new Anthropic({ apiKey }));
}

async function ensureLinkColumns() {
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_page_links JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_page_links_updated_at TIMESTAMP`); } catch { /* exists */ }
}

/** The store + its counts only — what GET needs. Never the analysis snapshot. */
async function loadStore(projectId: string) {
  await ensureLinkColumns();
  const [project] = await db.select({
    id: projects.id, websiteUrl: projects.websiteUrl, brandTerms: projects.brandTerms, clientName: projects.clientName,
    // the SAME scope inputs categorize-pending loads, so the category guard drops hidden /
    // excluded / de-selected categories here too (review 2026-10-09)
    excludedBrands: projects.excludedBrands, scopeOverrides: projects.scopeOverrides, hiddenCategories: projects.hiddenCategories,
    pageOverrides: projects.pageOverrides, pageMapping: projects.pageMapping,   // v7.549
    links: projects.profoundPageLinks,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { error: 'Project not found', status: 404 } as const;
  const store = (project.links as ProfoundLinkStore | null) ?? null;
  if (!store || !Array.isArray(store.prompts) || store.prompts.length === 0) {
    return { error: 'No Profound prompt data on this project yet — upload the Profound export in AI Answer Engines first.', status: 400 } as const;
  }
  const assignments = store.assignments ?? {};
  // pending = never filed, or filed under an older rule version (re-filed on the next run)
  const pending = store.prompts.filter(p => { const a = assignments[promptKey(p.prompt)]; return !a || (a as any).filerVersion !== PROMPT_FILER_VERSION; });
  let assigned = 0, review = 0, noFit = 0;
  for (const a of Object.values(assignments)) { if (a.status === 'assigned') assigned++; else if (a.status === 'review') review++; else noFit++; }
  return { project, store, pending, counts: { total: store.prompts.length, assigned, review, noFit, unassigned: pending.length } } as const;
}

async function loadContext(projectId: string) {
  const base = await loadStore(projectId);
  if ('error' in base) return { error: base.error, status: base.status } as const;
  const { project, store, pending, counts } = base;
  const comps = await db.select({ domain: competitors.domain }).from(competitors).where(eq(competitors.projectId, projectId));
  const competitorDomains = comps.map(c => c.domain).filter(Boolean);

  const loaded = await loadDisplayAnalysisWithSemrush(projectId);
  if (!loaded || loaded.semrushSnapshot == null) return { error: 'No analysis with a category tree yet — run an analysis first.', status: 400 } as const;
  const raw  = loaded.semrushSnapshot;
  const snap = hydrateSnapshotForPool(project, raw);
  const clientDomain = String(raw?.domain ?? project.websiteUrl ?? '');
  const brandTerms: string[] = Array.isArray(project.brandTerms) ? project.brandTerms : [];
  const guard = buildCategoryGuard(snap, clientDomain, competitorDomains);
  // Product nodes only — a brand bucket is never a page a market question is filed to.
  const candidates: CandidateCategory[] = buildCandidates(
    raw?._categoryBreakdown?.categories ?? [],
    (name: string, type?: string) => type === 'brand' || guard.isCompetitorBrandCategory(name, type),
  );
  return { store, clientDomain, clientName: String(project.clientName ?? ''), brandTerms, candidates, pending, counts, hasTree: hasStoredCategoryTree(raw) } as const;
}

/** Status only — reads the link store, never the multi-MB analysis snapshot (II.9); the tree
 *  and candidate checks run in POST, where the filing actually needs them. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const base = await loadStore(params.id);
  if ('error' in base) return NextResponse.json({ error: base.error }, { status: base.status });
  return NextResponse.json({ ...base.counts, batchSize: PROMPT_FILER_BATCH, model: PROMPT_FILER_MODEL });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  setUsageProject(projectId);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const limit = Math.max(PROMPT_FILER_BATCH, Math.min(MAX_LIM, Number(body?.limit) || DEFAULT_LIM));
  const mode: 'pending' | 'refile' = body?.mode === 'refile' ? 'refile' : 'pending';
  // refile walks the WHOLE store across calls: the client passes how many it has already sent
  const offset = mode === 'refile' ? Math.max(0, Math.floor(Number(body?.offset) || 0)) : 0;

  const t0 = Date.now();
  const ctx = await loadContext(projectId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!ctx.hasTree) return NextResponse.json({ error: 'This project has no category tree yet — run an analysis first.' }, { status: 400 });
  if (ctx.candidates.length === 0) return NextResponse.json({ error: 'No selected categories to file into — select at least one category in Keyword Selection.' }, { status: 400 });

  const source = mode === 'refile' ? ctx.store.prompts : ctx.pending;
  const slice  = source.slice(offset, offset + limit).map(p => p.prompt);
  const ownBrands = ownBrandList(ctx.clientDomain, ctx.brandTerms, ctx.clientName);
  const batches: string[][] = [];
  for (let i = 0; i < slice.length; i += PROMPT_FILER_BATCH) batches.push(slice.slice(i, i + PROMPT_FILER_BATCH));

  const out: Record<string, PromptAssignment & { filerVersion: number }> = {};
  let filed = 0, noFit = 0, review = 0, unanswered = 0, failedCalls = 0;
  const filedAt = new Date().toISOString();
  const client = getClient();
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const group = batches.slice(i, i + PARALLEL);
    const results = await Promise.all(group.map(async qs => {
      try {
        const res = await client.messages.create({
          model: PROMPT_FILER_MODEL, max_tokens: 2048,
          messages: [{ role: 'user', content: buildPromptFilerPrompt(ctx.clientDomain, qs, ctx.candidates, ownBrands) }],
        });
        const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
        return { qs, ...parsePromptAssignments(text, qs.length, ctx.candidates) };
      } catch (err) {
        console.error('[OrbitIQ] profound-links assign batch failed:', err);
        failedCalls++;
        return null;
      }
    }));
    for (const r of results) {
      if (!r) continue;
      unanswered += r.unanswered;
      for (let k = 0; k < r.qs.length; k++) {
        const pick = r.picks[k];
        if (pick === undefined) continue;
        const a = assignmentFor(pick, filedAt);
        out[promptKey(r.qs[k])] = { ...a, filerVersion: PROMPT_FILER_VERSION };
        if (a.status === 'none') noFit++; else if (a.status === 'review') review++; else filed++;
      }
    }
    if (Date.now() - t0 > 240_000) break;   // stay inside the 300 s cap; the client loops
  }

  if (Object.keys(out).length > 0) {
    await db.execute(sql`
      UPDATE projects
         SET profound_page_links = jsonb_set(
               jsonb_set(profound_page_links, '{assignments}',
                 COALESCE(profound_page_links -> 'assignments', '{}'::jsonb) || ${JSON.stringify(out)}::jsonb, true),
               '{assignedAt}', to_jsonb(${filedAt}::text), true),
             profound_page_links_updated_at = NOW()
       WHERE id = ${projectId}`);
  }

  const done = new Set(Object.keys(out));
  const remaining = mode === 'refile'
    ? Math.max(0, source.length - (offset + slice.length))
    : source.filter(p => !done.has(promptKey(p.prompt))).length;
  return NextResponse.json({ filed, noFit, review, unanswered, failedCalls, remaining, sent: slice.length, ms: Date.now() - t0 });
}
