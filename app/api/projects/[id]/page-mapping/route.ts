/**
 * /api/projects/[id]/page-mapping — v7.549
 *
 * The AUTOMATIC page map (lib/pages/pageMap.ts): the client's real page inventory, each page's
 * intent type, and every taxonomy node matched to the page whose intent + theme fit it.
 * Nobody presses "map pages" (Wayne 2026-10-09): the project page calls POST whenever GET
 * reports pending work, step after step, until the phase is 'done'.
 *
 * GET  → { status, nodes, overrides, updatedAt }           status = pageMapStatus()
 *        ?inventory=1 adds the page inventory (the Set-page picker list)
 * POST body { token, force? }  runs ONE time-boxed step of whatever phase is pending:
 *        inventory  robots.txt → sitemap(s) (+ index children) + every ranking URL the pool
 *                   and the Semrush page map know → canonical pages (capped, disclosed)
 *        fetch      <title>/<h1> for pages not fetched yet (real page data; failures recorded)
 *        label      page types: rule-labelled where unambiguous, else Claude (own confidence)
 *        map        pending nodes → Claude picks the intent-matched page from candidates
 *        → { phase, done, total, remaining, status, ms }
 *        force: 'all' rebuilds the inventory and re-maps every node; 'map' re-maps every node.
 *
 * One runner at a time: the job lock (token + lockUntil) lives on the store; a second client
 * gets 409 { locked: true } and polls GET instead. Every Claude call goes through
 * instrumentAnthropic → API Usage ledger (I.5b). Named columns only (II.9); the store is its
 * own column (projects.page_mapping), auto-migrated.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { projects, competitors, projectKeywords } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { setUsageProject } from '@/lib/usage/context';
import { instrumentAnthropic } from '@/lib/usage/record';
import { buildKwPool } from '@/lib/utils/kwVolume';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { loadDisplayAnalysisWithSemrush } from '@/lib/analysis/loadDisplayAnalysis';
import { detectIntentSignal } from '@/lib/clusters/canonical';
import { parseSitemapIndex, parseUrlset } from '@/lib/local/sitemap';
import { electPage, type PageOverrides } from '@/lib/pages/electPage';
import {
  PAGE_MAP_VERSION, PAGE_MAP_MODEL, LABEL_BATCH, MAP_BATCH, SITEMAP_CHILD_CAP, SITEMAP_URL_CAP,
  type PageMapStore, type PageMapPhase, type NodeInfo, type PageRecord,
  emptyPageMap, hostOf, canonicalPageUrl, extractTitleH1, ruleType, taxonomyNodes, nodeSig,
  pagesToFetch, pagesToLabel, nodesToMap, pageMapStatus, assembleInventory, sitemapsFromRobots,
  candidatePagesFor, takenByDescendants, buildPageLabelPrompt, parsePageLabels, buildNodeMapPrompt, parseNodeMaps, mappingFor,
} from '@/lib/pages/pageMap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

const STEP_BUDGET_MS  = 200_000;   // one POST stays well inside the 300 s cap; the client loops
const LOCK_MS         = 240_000;
const FETCH_PARALLEL  = 8;
const FETCH_TIMEOUT   = 12_000;
const FETCH_MAX_BYTES = 300_000;
const CLAUDE_PARALLEL = 4;
const UA = 'Mozilla/5.0 (compatible; OrbitIQ-PageMap/1.0; +https://orbitiq.app) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return instrumentAnthropic(new Anthropic({ apiKey }));
}

async function ensureColumns() {
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS page_mapping JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS page_mapping_updated_at TIMESTAMP`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS page_overrides JSONB`); } catch { /* exists */ }
}

async function fetchText(url: string, accept: string): Promise<{ status: number; text: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: { 'user-agent': UA, accept }, redirect: 'follow' });
    const reader = r.body?.getReader();
    if (!reader) return { status: r.status, text: await r.text().catch(() => '') };
    const chunks: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value); n += value.length;
      if (n >= FETCH_MAX_BYTES) { try { await reader.cancel(); } catch { /* ignore */ } break; }
    }
    const buf = new Uint8Array(n); let o = 0;
    for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, n - o)), o); o += c.length; if (o >= n) break; }
    return { status: r.status, text: new TextDecoder('utf-8', { fatal: false }).decode(buf) };
  } catch { return { status: 0, text: '' }; }
}

/** Everything a step needs — named columns only (II.9). */
async function loadContext(projectId: string) {
  await ensureColumns();
  const [project] = await db.select({
    id: projects.id, websiteUrl: projects.websiteUrl, brandTerms: projects.brandTerms, clientName: projects.clientName,
    excludedBrands: projects.excludedBrands, scopeOverrides: projects.scopeOverrides, hiddenCategories: projects.hiddenCategories,
    pageOverrides: projects.pageOverrides, pageMapping: projects.pageMapping, pageMappingUpdatedAt: projects.pageMappingUpdatedAt,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { error: 'Project not found', status: 404 } as const;

  const comps = await db.select({ domain: competitors.domain }).from(competitors).where(eq(competitors.projectId, projectId));
  const competitorDomains = comps.map(c => c.domain).filter(Boolean);
  const loaded = await loadDisplayAnalysisWithSemrush(projectId);
  if (!loaded || loaded.semrushSnapshot == null) return { error: 'No analysis yet — the page map builds once an analysis exists.', status: 400 } as const;
  const raw  = loaded.semrushSnapshot;
  const snap = hydrateSnapshotForPool(project, raw);
  const clientDomain = String(raw?.domain ?? project.websiteUrl ?? '');
  const dbKws = await db.select({
    keyword: projectKeywords.keyword, searchVolume: projectKeywords.searchVolume,
    position: projectKeywords.position, type: projectKeywords.type, source: projectKeywords.source,
    domain: projectKeywords.domain, url: projectKeywords.url, positionType: projectKeywords.positionType,
  }).from(projectKeywords).where(eq(projectKeywords.projectId, projectId));
  const pool = buildKwPool({
    semrushSnapshot: snap, uploadedKeywords: dbKws as any[], clientDomain, competitorDomains,
    brandTerms: Array.isArray(project.brandTerms) ? project.brandTerms : [],
  });
  const nodes = taxonomyNodes(raw?._categoryBreakdown?.keywordPaths ?? null, pool as any[], kw => detectIntentSignal(kw));
  const store: PageMapStore = (project.pageMapping as PageMapStore | null) ?? emptyPageMap();
  if (!store.nodes) store.nodes = {};
  return {
    project, raw, snap, clientDomain, pool, nodes, store,
    analysisId: String(loaded.head.id), overrides: (project.pageOverrides as PageOverrides | null) ?? null,
  } as const;
}

async function saveStore(projectId: string, store: PageMapStore) {
  await db.update(projects)
    .set({ pageMapping: store as any, pageMappingUpdatedAt: new Date() } as any)
    .where(eq(projects.id, projectId));
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await loadContext(params.id);
  if ('error' in ctx) {
    if (ctx.status === 404) return NextResponse.json({ error: ctx.error }, { status: 404 });
    // no analysis yet: an empty, honest status (never an error on the project page)
    return NextResponse.json({ status: pageMapStatus(null, []), nodes: {}, overrides: {}, updatedAt: null, note: ctx.error }, { headers: NO_STORE });
  }
  const wantInventory = req.nextUrl.searchParams.get('inventory') === '1';
  return NextResponse.json({
    status:    pageMapStatus(ctx.store, ctx.nodes, Date.now(), ctx.analysisId),
    nodes:     ctx.store.nodes,
    overrides: ctx.overrides ?? {},
    updatedAt: ctx.project.pageMappingUpdatedAt ?? null,
    ...(wantInventory ? { inventory: ctx.store.inventory ? { ...ctx.store.inventory, pages: ctx.store.inventory.pages } : null } : {}),
  }, { headers: NO_STORE });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  setUsageProject(projectId);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const token = String(body?.token ?? '').slice(0, 64) || 'anon';
  const force: 'all' | 'map' | null = body?.force === 'all' ? 'all' : body?.force === 'map' ? 'map' : null;

  const t0 = Date.now();
  const ctx = await loadContext(projectId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { store, nodes, clientDomain, analysisId } = ctx;

  // one runner at a time
  const now = Date.now();
  if (store.job && store.job.token !== token && new Date(store.job.lockUntil).getTime() > now) {
    return NextResponse.json({ locked: true, status: pageMapStatus(store, nodes, Date.now(), analysisId) }, { status: 409, headers: NO_STORE });
  }
  if (force === 'all') { store.inventory = null; store.nodes = {}; store.mapAttempts = {}; }
  else if (force === 'map') { store.nodes = {}; store.mapAttempts = {}; }
  // a new analysis = a new keyword set = rebuild the inventory's ranking side (sitemap pages are kept with their labels)
  const inventoryStale = !!store.inventory && store.inventory.analysisId !== analysisId;

  const phaseNow = (): PageMapPhase => pageMapStatus(store, nodes, Date.now(), analysisId).phase;
  const lock = (phase: PageMapPhase) => {
    const ts = new Date().toISOString();
    store.job = { token, lockUntil: new Date(Date.now() + LOCK_MS).toISOString(), phase, startedAt: store.job?.startedAt ?? ts, updatedAt: ts };
  };
  const budgetLeft = () => STEP_BUDGET_MS - (Date.now() - t0);
  const host = hostOf(clientDomain);
  let done = 0, total = 0, phase: PageMapPhase = phaseNow();

  try {
    // ── inventory ──
    if (!store.inventory || inventoryStale) {
      phase = 'inventory'; lock(phase); await saveStore(projectId, store);
      const origin = `https://${host}`;
      const sitemapUrls: string[] = [];
      const pageUrls: string[] = [];
      let sitemapError: string | undefined;
      const robots = await fetchText(`${origin}/robots.txt`, 'text/plain,*/*');
      const declared = robots.status >= 200 && robots.status < 300 ? sitemapsFromRobots(robots.text, origin) : [];
      const roots = declared.length ? declared : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap/sitemap.xml`];
      const queue = roots.slice(); const seen = new Set<string>(); let children = 0;
      while (queue.length && pageUrls.length < SITEMAP_URL_CAP && budgetLeft() > 60_000) {
        const u = queue.shift() as string;
        if (seen.has(u)) continue; seen.add(u);
        const r = await fetchText(u, 'application/xml,text/xml,*/*');
        if (r.status < 200 || r.status >= 300 || !r.text) { if (!sitemapError) sitemapError = `${u} → HTTP ${r.status || 'unreachable'}`; continue; }
        sitemapUrls.push(u);
        if (/<sitemapindex[\s>]/i.test(r.text)) {
          for (const c of parseSitemapIndex(r.text)) { if (children >= SITEMAP_CHILD_CAP) break; if (!seen.has(c)) { queue.push(c); children++; } }
        } else {
          for (const p of parseUrlset(r.text)) { if (pageUrls.length >= SITEMAP_URL_CAP) break; pageUrls.push(p); }
        }
      }
      if (sitemapUrls.length) sitemapError = undefined;
      // ranking URLs: every client URL in the pool + the Semrush page map (real rows only)
      const rankingUrls: string[] = [];
      for (const k of ctx.pool as any[]) if (k.position !== null && !k.isGap && k.origin !== 'demand' && typeof k.url === 'string' && k.url) rankingUrls.push(k.url);
      for (const pg of (ctx.raw?._pageMap?.pages ?? [])) if (pg && typeof pg.url === 'string') rankingUrls.push(pg.url);
      for (const k of (ctx.raw?.topKeywords ?? [])) if (k && typeof k.url === 'string' && k.url) rankingUrls.push(k.url);
      store.inventory = assembleInventory({
        analysisId, host, sitemapUrls, sitemapPageUrls: pageUrls, rankingUrls, sitemapError,
        prior: store.inventory?.pages ?? [],
      });
      await saveStore(projectId, store);
      phase = phaseNow(); total = store.inventory.pages.length; done = total;
    }

    // ── fetch titles / h1 ──
    if (phase === 'fetch' && budgetLeft() > 20_000) {
      lock(phase);
      const todo = pagesToFetch(store);
      total = todo.length;
      let i = 0;
      while (i < todo.length && budgetLeft() > 15_000) {
        const group = todo.slice(i, i + FETCH_PARALLEL); i += group.length;
        await Promise.all(group.map(async p => {
          const r = await fetchText(p.url, 'text/html,application/xhtml+xml,*/*');
          const { title, h1 } = extractTitleH1(r.text);
          p.fetchedAt = new Date().toISOString(); p.httpStatus = r.status;
          // v7.550: a blocked / errored page's "title" ("Access Denied") is not the page's title
          if (r.status >= 200 && r.status < 400) { if (title) p.title = title; if (h1) p.h1 = h1; }
          else { delete p.title; delete p.h1; }
          const rt = ruleType(p.path);
          if (rt) { p.type = rt; p.typeBasis = 'rule'; p.labeledAt = p.fetchedAt; }
          done++;
        }));
        if (done % 80 === 0) await saveStore(projectId, store);
      }
      await saveStore(projectId, store);
      phase = phaseNow();
    }

    // ── label page types ──
    if (phase === 'label' && budgetLeft() > 30_000) {
      lock(phase);
      const todo = pagesToLabel(store);
      total = todo.length;
      const client = getClient();
      const batches: PageRecord[][] = [];
      for (let i = 0; i < todo.length; i += LABEL_BATCH) batches.push(todo.slice(i, i + LABEL_BATCH));
      for (let i = 0; i < batches.length && budgetLeft() > 30_000; i += CLAUDE_PARALLEL) {
        const group = batches.slice(i, i + CLAUDE_PARALLEL);
        await Promise.all(group.map(async pages => {
          try {
            const res = await client.messages.create({ model: PAGE_MAP_MODEL, max_tokens: 4096, messages: [{ role: 'user', content: buildPageLabelPrompt(host, pages) }] });
            const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
            const labels = parsePageLabels(text, pages.length);
            const at = new Date().toISOString();
            labels.forEach((l, k) => { if (!l) return; const p = pages[k]; p.type = l.type; p.typeBasis = 'ai'; p.topic = l.topic; p.confidence = l.confidence; p.labeledAt = at; done++; });
          } catch (err) {
            for (const p of pages) p.labelAttempts = (p.labelAttempts ?? 0) + 1;
            console.error('[OrbitIQ] page-mapping label batch failed:', err);
            store.job = { ...(store.job as any), lastError: `label: ${String((err as any)?.message ?? err).slice(0, 200)}` };
          }
        }));
        await saveStore(projectId, store);
      }
      phase = phaseNow();
    }

    // ── map nodes ──
    if (phase === 'map' && budgetLeft() > 30_000) {
      lock(phase);
      const todo = nodesToMap(store, nodes);
      total = todo.length;
      const pages = store.inventory?.pages ?? [];
      const client = getClient();
      // v7.551: DEEPEST level first, one level at a time — a parent is matched only after its
      // sub-categories, so a page a sub-category already took is shown to the parent as taken.
      const depths = Array.from(new Set(todo.map(n => n.depth))).sort((a, b) => b - a);
      outer: for (const depth of depths) {
      const level = todo.filter(n => n.depth === depth);
      const items = level.map(n => ({ node: n, candidates: candidatePagesFor(n, pages, electPage(n.own.length ? n.own : n.all), undefined, takenByDescendants(n, store.nodes)) }));
      const batches: typeof items[] = [];
      for (let i = 0; i < items.length; i += MAP_BATCH) batches.push(items.slice(i, i + MAP_BATCH));
      for (let i = 0; i < batches.length; i += CLAUDE_PARALLEL) {
        if (budgetLeft() <= 30_000) break outer;
        const group = batches.slice(i, i + CLAUDE_PARALLEL);
        await Promise.all(group.map(async its => {
          try {
            const res = await client.messages.create({ model: PAGE_MAP_MODEL, max_tokens: 2048, messages: [{ role: 'user', content: buildNodeMapPrompt(host, its) }] });
            const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
            const picks = parseNodeMaps(text, its);
            const at = new Date().toISOString();
            picks.forEach((pk, k) => { if (!pk) return; const n = its[k].node; store.nodes[n.key] = mappingFor(pk, nodeSig(n), at); done++; });
          } catch (err) {
            store.mapAttempts = store.mapAttempts ?? {};
            for (const it of its) store.mapAttempts[it.node.key] = (store.mapAttempts[it.node.key] ?? 0) + 1;
            console.error('[OrbitIQ] page-mapping map batch failed:', err);
            store.job = { ...(store.job as any), lastError: `map: ${String((err as any)?.message ?? err).slice(0, 200)}` };
          }
        }));
        await saveStore(projectId, store);
      }
      }
      phase = phaseNow();
    }
  } finally {
    // release the lock when nothing is left (or hand the next step the same lock)
    if (phase === 'done') store.job = store.job?.lastError ? { ...(store.job as any), lockUntil: new Date(0).toISOString(), phase: 'done' } : null;
    else if (store.job) store.job = { ...store.job, lockUntil: new Date(Date.now() + 15_000).toISOString(), phase, updatedAt: new Date().toISOString() };
    await saveStore(projectId, store);
  }

  const status = pageMapStatus(store, nodes, Date.now(), analysisId);
  const remaining = status.phase === 'done' ? 0
    : status.phase === 'inventory' ? 1
    : status.phase === 'fetch' ? pagesToFetch(store).length
    : status.phase === 'label' ? pagesToLabel(store).length
    : status.nodes.pending;
  return NextResponse.json({ phase, done, total, remaining, status, version: PAGE_MAP_VERSION, ms: Date.now() - t0 }, { headers: NO_STORE });
}
