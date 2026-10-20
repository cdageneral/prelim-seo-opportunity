/**
 * /api/projects/[id]/categories/split — v7.573
 *
 * Split one over-broad category into page-level sub-categories (lib/category/splitNode.ts).
 *
 * POST { step:'propose', path:string[] } → one Sonnet call over the category's OWN keywords;
 *        returns the proposal (nothing written). Ledgered like every Claude call.
 * POST { step:'apply', proposal }        → re-validates against the current tree and writes:
 *        keywordPaths (moved keywords only), filerVersion stamps (so nothing re-files them),
 *        a mergeLog entry per group (III.1e — every structural change is visible), and the new
 *        paths onto projects.taxonomy_anchor so the next Refresh Analysis keeps them.
 * Writes are jsonb_set patches on the display analysis — the rest of the snapshot is untouched.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { projects, competitors, projectKeywords } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { setUsageProject } from '@/lib/usage/context';
import { instrumentAnthropic } from '@/lib/usage/record';
import { loadDisplayAnalysisWithSemrush } from '@/lib/analysis/loadDisplayAnalysis';
import { brandLabelOf, BRAND_ALIASES, brandRootOf } from '@/lib/utils/brandRoot';
import { FILER_VERSION, CLIENT_FILER_VERSION } from '@/lib/category/pendingCategorization';
import { buildSplitPrompt, parseSplit, validateForApply, type SplitKeyword, type SplitProposal } from '@/lib/category/splitNode';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;
const MODEL = 'claude-sonnet-4-6';
const SEP = ' › ';
const MAX_KW = 400;

const clean = (p: unknown): string[] => (Array.isArray(p) ? p.map(s => String(s ?? '').trim()).filter(Boolean) : []);

async function loadCtx(projectId: string, node: string[]) {
  const [project] = await db.select({ id: projects.id, websiteUrl: projects.websiteUrl, brandTerms: projects.brandTerms, taxonomyAnchor: projects.taxonomyAnchor })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { error: 'Project not found', status: 404 } as const;
  const loaded = await loadDisplayAnalysisWithSemrush(projectId);
  const raw: any = loaded?.semrushSnapshot;
  const cb = raw?._categoryBreakdown;
  if (!loaded || !cb?.keywordPaths) return { error: 'No stored category tree yet — run an analysis first.', status: 400 } as const;
  const kp: Record<string, string[]> = cb.keywordPaths;
  const nodeKey = node.join(SEP).toLowerCase();
  const allPaths = new Set<string>(); const pathCase = new Map<string, string>();
  const childNames = new Set<string>();
  const own: string[] = []; const storedKey = new Map<string, string>();
  for (const [k, v] of Object.entries(kp)) {
    const p = clean(v); if (!p.length) continue;
    for (let i = 1; i <= p.length; i++) { const j = p.slice(0, i).join(SEP); allPaths.add(j.toLowerCase()); if (!pathCase.has(j.toLowerCase())) pathCase.set(j.toLowerCase(), j); }
    const j = p.join(SEP).toLowerCase();
    if (j.startsWith(nodeKey + SEP) && p.length > node.length) childNames.add(p[node.length]);
    if (j === nodeKey) { const kl = k.toLowerCase().trim(); own.push(kl); storedKey.set(kl, k); }
  }
  // real volumes: the larger of the stored rows for the keyword (client or competitor), never estimated
  const vol = new Map<string, number>();
  for (const t of (raw.topKeywords ?? [])) { const kl = String(t?.keyword ?? '').toLowerCase().trim(); vol.set(kl, Math.max(vol.get(kl) ?? 0, Number(t?.searchVolume ?? 0))); }
  const rows = await db.select({ keyword: projectKeywords.keyword, searchVolume: projectKeywords.searchVolume, domain: projectKeywords.domain })
    .from(projectKeywords).where(eq(projectKeywords.projectId, projectId));
  for (const r of rows) { const kl = String(r.keyword ?? '').toLowerCase().trim(); vol.set(kl, Math.max(vol.get(kl) ?? 0, Number(r.searchVolume ?? 0))); }
  const comps = await db.select({ domain: competitors.domain }).from(competitors).where(eq(competitors.projectId, projectId));
  const domains = Array.from(new Set([...comps.map(c => c.domain), ...rows.map(r => String(r.domain ?? ''))].filter(Boolean)));
  const clientRoot = brandRootOf(String(raw.domain ?? project.websiteUrl ?? ''));
  const competitorBrands = Array.from(new Set(domains.filter(d => brandRootOf(d) !== clientRoot)
    .flatMap(d => [brandLabelOf(d), ...(BRAND_ALIASES[brandRootOf(d)] ?? [])]).map(s => String(s ?? '').toLowerCase()).filter(s => s.length >= 3)));
  const clientKw = new Set<string>((raw.topKeywords ?? []).map((t: any) => String(t?.keyword ?? '').toLowerCase().trim()));
  return { project, analysisId: loaded!.head.id, raw, cb, kp, allPaths, pathCase, childNames: Array.from(childNames), own, storedKey, vol, competitorBrands, clientKw, domain: String(raw.domain ?? project.websiteUrl ?? '') } as const;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  setUsageProject(params.id);
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const step = body?.step === 'apply' ? 'apply' : 'propose';
  const node = clean(step === 'apply' ? body?.proposal?.node : body?.path);
  if (node.length === 0) return NextResponse.json({ error: 'Which category? (path missing)' }, { status: 400 });
  const ctx = await loadCtx(params.id, node);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const isForeignBrand = (name: string) => { const n = ' ' + name.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '; return ctx.competitorBrands.some(b => n.includes(' ' + b + ' ')); };

  if (step === 'propose') {
    if (ctx.own.length < 4) return NextResponse.json({ error: `"${node.join(SEP)}" holds only ${ctx.own.length} keywords of its own — too few to split.` }, { status: 409 });
    const kws: SplitKeyword[] = ctx.own.map(k => ({ keyword: k, volume: ctx.vol.get(k) ?? 0 })).sort((a, b) => b.volume - a.volume).slice(0, MAX_KW);
    // targets: product nodes only — never a brand-typed node (held, v7.566); "Other" for keywords that do not belong
    const brandNames = new Set<string>(((ctx.cb.categories ?? []) as any[]).filter(c => c?.type === 'brand' && c?.name).map(c => String(c.name).toLowerCase()));
    const paths = Array.from(ctx.pathCase.values())
      .filter(p => { const parts = p.split(SEP); return parts[0] !== 'Other' && !parts.some(x => brandNames.has(x.toLowerCase())); })
      .sort();
    paths.push('Other');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 500 });
    const client = instrumentAnthropic(new Anthropic({ apiKey }));
    const t0 = Date.now();
    let text = '';
    try {
      const res = await client.messages.create({ model: MODEL, max_tokens: 6000, messages: [{ role: 'user', content: buildSplitPrompt(ctx.domain, node, kws, paths, ctx.competitorBrands) }] }, { timeout: 200_000 });
      text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e) { return NextResponse.json({ error: `The split call failed: ${String((e as any)?.message ?? e)}` }, { status: 502 }); }
    const proposal = parseSplit(text, node, kws, paths, ctx.childNames, isForeignBrand);
    if (proposal.groups.length === 0) {
      console.error('[OrbitIQ] split: no usable groups', { rejected: proposal.rejected, stay: proposal.stay.length, head: text.slice(0, 600) });
      return NextResponse.json({ error: 'No usable sub-categories came back — nothing was changed. Try again.', diag: { rejected: proposal.rejected, stay: proposal.stay.length, replyStart: text.slice(0, 400) } }, { status: 502 });
    }
    return NextResponse.json({ proposal, keywords: kws.length, truncated: ctx.own.length > MAX_KW ? ctx.own.length - MAX_KW : 0, ms: Date.now() - t0, model: MODEL });
  }

  // apply
  const proposal = body.proposal as SplitProposal;
  const v = validateForApply(proposal, new Set(ctx.own), node, ctx.allPaths);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 409 });
  const keys = Object.keys(v.moves);
  if (keys.length === 0) return NextResponse.json({ error: 'Nothing left to move — these keywords were re-filed since the proposal.' }, { status: 409 });
  const pathPatch: Record<string, string[]> = {}; const catPatch: Record<string, string> = {}; const stamps: Record<string, number> = {};
  // category name for a keyword moved onto an existing node elsewhere = what that node's keywords carry
  const catAt = new Map<string, string>();
  for (const [k, p] of Object.entries(ctx.kp)) { const j = clean(p).join(SEP).toLowerCase(); const c = ctx.cb.keywordCategories?.[k]; if (c && !catAt.has(j)) catAt.set(j, c); }
  const nodeKey = node.join(SEP).toLowerCase();
  for (const kl of keys) {
    const sk = ctx.storedKey.get(kl) ?? kl;
    pathPatch[sk] = v.moves[kl];
    const target = v.moves[kl].join(SEP).toLowerCase();
    if (!target.startsWith(nodeKey + SEP)) { const c = catAt.get(target); if (c) catPatch[sk] = c; }
    stamps[sk] = ctx.clientKw.has(kl) ? CLIENT_FILER_VERSION : FILER_VERSION;
  }
  const at = new Date().toISOString();
  const log = proposal.groups.filter(g => g.keywords.some(k => v.moves[k.toLowerCase().trim()]))
    .map(g => ({ from: node.join(SEP), to: g.path.join(SEP), kind: 'split', keywords: g.keywords.filter(k => v.moves[k.toLowerCase().trim()]).length, at }));
  await db.execute(sql`
    UPDATE analyses SET semrush_snapshot =
      jsonb_set(jsonb_set(jsonb_set(jsonb_set(semrush_snapshot,
        '{_categoryBreakdown,keywordPaths}', COALESCE(semrush_snapshot #> '{_categoryBreakdown,keywordPaths}', '{}'::jsonb) || ${JSON.stringify(pathPatch)}::jsonb, true),
        '{_categoryBreakdown,keywordCategories}', COALESCE(semrush_snapshot #> '{_categoryBreakdown,keywordCategories}', '{}'::jsonb) || ${JSON.stringify(catPatch)}::jsonb, true),
        '{_categoryBreakdown,filerVersion}', COALESCE(semrush_snapshot #> '{_categoryBreakdown,filerVersion}', '{}'::jsonb) || ${JSON.stringify(stamps)}::jsonb, true),
        '{_categoryBreakdown,mergeLog}', COALESCE(semrush_snapshot #> '{_categoryBreakdown,mergeLog}', '[]'::jsonb) || ${JSON.stringify(log)}::jsonb, true)
    WHERE id = ${ctx.analysisId}`);
  // keep the new sub-categories on the next Refresh Analysis (III.1e anchor)
  try {
    const anchor: string[][] = Array.isArray(ctx.project.taxonomyAnchor) ? (ctx.project.taxonomyAnchor as string[][]) : [];
    const have = new Set(anchor.map(p => clean(p).join(SEP).toLowerCase()));
    const add = proposal.groups.map(g => g.path).filter(p => !have.has(p.join(SEP).toLowerCase()));
    if (add.length > 0) await db.update(projects).set({ taxonomyAnchor: [...add, ...anchor], taxonomyAnchorUpdatedAt: new Date() } as any).where(eq(projects.id, params.id));
  } catch (e) { console.error('[OrbitIQ] split: anchor update failed (non-fatal):', (e as any)?.message); }
  return NextResponse.json({ ok: true, moved: keys.length, groups: log.length });
}
