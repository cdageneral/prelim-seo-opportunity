/**
 * /api/projects/[id]/categorize-pending — v7.531 (v7.532: foreign-brand rules + refile)
 *
 * Keywords with NO stored category (a competitor CSV uploaded after the last
 * categorization, a hand-added keyword) are held out of every panel by buildKwPool
 * (Const III.1e v0.31). This route files them into the project's EXISTING category
 * tree — never a new category — so they can enter the pool under the Step-2
 * selection like everything else (Wayne, 2026-10-07).
 *
 * GET  → { pending, pendingAnnualVolume, refile, candidates, batchSize, hasTree }
 * POST → body { limit?, mode? }  files up to `limit` keywords (highest volume first)
 *        mode 'pending' (default): keywords with no stored category
 *        mode 'refile' (v7.532): competitor keywords filed under an OLDER rule set
 *        → { filed, other, unanswered, remaining, remainingAnnualVolume, ms }
 *
 * v7.532 (Wayne, 2026-10-07 — "go.amex/confirmcard", "www.starz.com/activate",
 * "one.walmart.com" were filed into Citi's Retail Partner Cards): a web-address keyword
 * that names neither the client nor a project brand term goes to "Other" with no AI
 * call (isForeignAddress); the prompt names the client's own + partner brands and sends
 * any other company's brand / login / bill-pay search to "Other". Every filed keyword is
 * stamped `_categoryBreakdown.filerVersion[kw] = FILER_VERSION`.
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
import { buildKwPool, hasStoredCategoryTree, hasStoredMembership, buildClientBrandStrictTest, isBrandedKeyword, competitorBrandCategoryNames } from '@/lib/utils/kwVolume';
import { isPublisherIndustry } from '@/lib/category/publisher';   // v7.537
import { brandLabelOf, BRAND_ALIASES, brandRootOf } from '@/lib/utils/brandRoot';   // v7.537
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';
import { loadDisplayAnalysisWithSemrush } from '@/lib/analysis/loadDisplayAnalysis';
import {
  buildCandidates, buildCategorizePrompt, parseAssignments, membershipFor,
  deterministicOther, ownBrandList, FILER_VERSION, PUBLISHER_FILER_VERSION, CLIENT_FILER_VERSION, OTHER_CATEGORY,
} from '@/lib/category/pendingCategorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const MODEL       = 'claude-sonnet-4-6';   // v7.536: Haiku forced fits ("bwi airport" → Using a Credit Card); Sonnet answers 0 when nothing fits
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
      pageOverrides:     projects.pageOverrides,   // v7.549: cluster roots honour a set page
      pageMapping:       projects.pageMapping,
      industry:          projects.industry,   // v7.537: publisher mode
      clientName:        projects.clientName, // v7.538: own-brand variants
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
    brandTerms: Array.isArray(project.brandTerms) ? project.brandTerms : [], includePending: true, includeHidden: true,
  });
  const pending = pool
    // v7.535: + client keywords the analysis filed into a non-client brand category
    .filter(p => p.origin !== 'demand' && (!hasStoredMembership(raw, p.keyword) || p.misfiledBrandCat === true))
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));

  // v7.532 refile set: COMPETITOR keywords (isGap) already filed, not yet stamped with the
  // current rule version. Never a client-brand keyword, and never one sitting in a brand
  // bucket (brand buckets are not filing targets, so re-filing would move it out).
  const brandTerms: string[] = Array.isArray(project.brandTerms) ? project.brandTerms : [];
  const isClientBrand = buildClientBrandStrictTest(clientDomain, brandTerms);
  const cbRaw = raw?._categoryBreakdown ?? {};
  const typeOf = new Map<string, string>();
  for (const c of (cbRaw.categories ?? [])) if (c?.name) typeOf.set(String(c.name).toLowerCase(), String(c.type ?? ''));
  const stamp: Record<string, number> = cbRaw.filerVersion ?? {};
  // v7.537: a publisher project files third-party brands by topic, under its own rule version.
  const publisher = isPublisherIndustry(project.industry);
  const ver = publisher ? PUBLISHER_FILER_VERSION : FILER_VERSION;
  const refile = pool
    .filter(p => {
      if (p.origin === 'demand') return false;
      const k = p.keyword.toLowerCase().trim();
      if (!hasStoredMembership(raw, k) || stamp[k] === ver) return false;
      // v7.537: publisher — client keywords the brand rule sent to "Other" are re-filed too.
      // v7.538: every project — client keywords an earlier rule sent to "Other" are re-filed once
      // with the client's own name and brand bucket in view.
      if (!p.isGap) return typeof stamp[k] === 'number' && String(cbRaw.keywordCategories?.[k] ?? '') === OTHER_CATEGORY
        && stamp[k] !== (publisher ? PUBLISHER_FILER_VERSION : CLIENT_FILER_VERSION);
      if (isClientBrand(k)) return false;
      const cur = String(cbRaw.keywordCategories?.[k] ?? '').toLowerCase();
      return typeOf.get(cur) !== 'brand';
    })
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));

  const guard = buildCategoryGuard(snap, clientDomain, competitorDomains);
  // v7.539: never a target the pool would treat as a competitor brand category (no re-file loop).
  const gapDomains = Array.from(new Set(dbKws.filter(k => k.type === 'gap' && k.source !== 'blocked' && k.domain).map(k => String(k.domain))));
  const compBrandCats = competitorBrandCategoryNames(snap, clientDomain, Array.from(new Set([...competitorDomains, ...gapDomains])),
    Array.isArray(project.brandTerms) ? project.brandTerms : [], gapDomains);
  // Competitor/footprint keywords are filed into PRODUCT categories only: brand buckets are
  // never a target (a competitor's generic term is not the client's brand search).
  const candidates = buildCandidates(
    raw?._categoryBreakdown?.categories ?? [],
    // v7.538: the client's OWN brand bucket ("Lloydsbank Brand Searches") is a filing target for
    // the client's brand searches; every other brand-typed category is not.
    (name: string, type?: string) => compBrandCats.has(name) || (type === 'brand'
      ? !isBrandedKeyword(name, clientDomain, [], brandTerms)
      : guard.isCompetitorBrandCategory(name, type)),
  );

  // Competitor brand names (label + known aliases) the filer must never file into a category.
  const allCompDomains = Array.from(new Set([...competitorDomains, ...dbKws.map(k => String(k.domain ?? '')).filter(Boolean)]));
  const competitorBrands = Array.from(new Set(allCompDomains.flatMap(d => [brandLabelOf(d), ...(BRAND_ALIASES[brandRootOf(d)] ?? [])]).filter(Boolean)));

  const clientVer = publisher ? PUBLISHER_FILER_VERSION : CLIENT_FILER_VERSION;
  const clientKw = new Set<string>([...pending, ...refile].filter(p => !p.isGap).map(p => p.keyword.toLowerCase().trim()));

  return { analysisId: loaded.head.id, raw, clientDomain, clientName: String(project.clientName ?? ''), brandTerms, pending, refile, candidates, publisher, ver, clientVer, clientKw, competitorBrands, hasTree: hasStoredCategoryTree(raw) } as const;
}

const annual = (rows: Array<{ searchVolume: number }>) => rows.reduce((n, r) => n + (r.searchVolume ?? 0), 0) * 12;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadContext(params.id);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json({
    hasTree:             ctx.hasTree,
    pending:             ctx.hasTree ? ctx.pending.length : 0,
    pendingAnnualVolume: ctx.hasTree ? annual(ctx.pending) : 0,
    refile:              ctx.hasTree ? ctx.refile.length : 0,
    publisher:           ctx.publisher,
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
  const mode: 'pending' | 'refile' = body?.mode === 'refile' ? 'refile' : 'pending';

  const t0 = Date.now();
  const ctx = await loadContext(projectId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!ctx.hasTree) return NextResponse.json({ error: 'This project has no category tree yet — run an analysis first.' }, { status: 400 });
  if (ctx.candidates.length === 0) {
    return NextResponse.json({ error: 'No selected categories to file into — select at least one category in Keyword Selection.' }, { status: 400 });
  }

  const source = mode === 'refile' ? ctx.refile : ctx.pending;
  const slice  = source.slice(0, limit).map(p => p.keyword);

  const paths: Record<string, string[]> = {};
  const cats:  Record<string, string>   = {};
  let filed = 0, other = 0, unanswered = 0, failedCalls = 0;

  // v7.532 deterministic rules first — a phone number or a foreign web address never reaches the model.
  const work: string[] = [];
  for (const kw of slice) {
    if (deterministicOther(kw, ctx.clientDomain, ctx.brandTerms)) {   // phone number or foreign web address
      const k = kw.toLowerCase().trim();
      paths[k] = [OTHER_CATEGORY]; cats[k] = OTHER_CATEGORY; other++;
    } else work.push(kw);
  }
  const ownBrands = ownBrandList(ctx.clientDomain, ctx.brandTerms, ctx.clientName);
  const batches: string[][] = [];
  for (let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH));

  const client = getClient();
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const group = batches.slice(i, i + PARALLEL);
    const results = await Promise.all(group.map(async kws => {
      try {
        const res = await client.messages.create({
          model: MODEL, max_tokens: 2048,
          messages: [{ role: 'user', content: buildCategorizePrompt(ctx.clientDomain, kws, ctx.candidates, ownBrands, { publisher: ctx.publisher, competitorBrands: ctx.competitorBrands }) }],
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
    const stamps: Record<string, number> = {};
    for (const k of Object.keys(cats)) stamps[k] = ctx.clientKw.has(k) ? ctx.clientVer : ctx.ver;
    await db.execute(sql`
      UPDATE analyses
         SET semrush_snapshot = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   semrush_snapshot,
                   '{_categoryBreakdown,keywordPaths}',
                   COALESCE(semrush_snapshot #> '{_categoryBreakdown,keywordPaths}', '{}'::jsonb) || ${JSON.stringify(paths)}::jsonb,
                   true),
                 '{_categoryBreakdown,keywordCategories}',
                 COALESCE(semrush_snapshot #> '{_categoryBreakdown,keywordCategories}', '{}'::jsonb) || ${JSON.stringify(cats)}::jsonb,
                 true),
               '{_categoryBreakdown,filerVersion}',
               COALESCE(semrush_snapshot #> '{_categoryBreakdown,filerVersion}', '{}'::jsonb) || ${JSON.stringify(stamps)}::jsonb,
               true)
       WHERE id = ${ctx.analysisId}`);
  }

  const done = new Set(Object.keys(cats));
  const remainingRows = source.filter(p => !done.has(p.keyword.toLowerCase().trim()));
  return NextResponse.json({
    filed, other, unanswered, failedCalls,
    remaining:             remainingRows.length,
    remainingAnnualVolume: annual(remainingRows),
    ms:                    Date.now() - t0,
  });
}
