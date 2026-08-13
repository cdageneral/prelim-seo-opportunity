/**
 * POST /api/projects/[id]/refine-clusters — on-demand "Refine with AI" (v7.199)
 *
 * Re-groups each PROCEDURE category's keywords by true SEARCH INTENT using Claude,
 * merging synonyms the in-panel heuristic can't ("529 account" ≈ "529 college plan"),
 * naming each group topically, and flagging BRAND terms to drop ("schwab 529"). The
 * result is stored additively on the latest analysis as
 * `semrushSnapshot._categoryBreakdown.{intentGroups, brandKeywords, intentEngine}`
 * (JSONB — no schema change). The Clusters panel + Keyword Landscape consume it live.
 *
 * AI only GROUPS / NAMES / FLAGS BRANDS — never invents a keyword or a number.
 *
 * Streams NDJSON progress (start / progress / done / error) so the panel shows a
 * determinate bar + ETA, mirroring the demand-universe build.
 *
 * Body:    { force?: boolean }   force=true re-runs even if already refined.
 * Returns: NDJSON stream; final {type:'done', intentGroups, brandKeywords}.
 */

import { NextRequest } from 'next/server';
import { db } from '@/db';
import { analyses, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { groupCategoriesByIntent, INTENT_ENGINE, CategoryInput } from '@/lib/claude/intentGroups';
import { setUsageProject } from '@/lib/usage/context';
import { loadLatestAnalysisWithSnapshot } from '@/lib/latestAnalysis';   // v7.445

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  setUsageProject(projectId);   // v7.225: attribute API usage to this project
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const force = !!body?.force;

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' }), { status: 500 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 });

  // v7.445: one row, not five (Neon 64 MB response cap — lib/db/latestAnalysis.ts)
  const analysis = await loadLatestAnalysisWithSnapshot(projectId);
  if (!analysis) {
    return new Response(JSON.stringify({ error: 'No analysis with keyword data found. Run an analysis first.' }), { status: 400 });
  }

  const snap: any = analysis.semrushSnapshot ?? {};
  const cb: any = snap._categoryBreakdown ?? null;
  if (!cb || !Array.isArray(cb.categories) || cb.categories.length === 0) {
    return new Response(JSON.stringify({ error: 'No category breakdown on this analysis to refine.' }), { status: 400 });
  }

  const clientDomain = String((project as any).domain ?? '');

  // Volume lookup for top-N selection: client ranked ∪ gaps ∪ uploads ∪ demand.
  const volOf = new Map<string, number>();
  const note = (kw: any, v: any) => { const k = String(kw ?? '').toLowerCase().trim(); if (k && !volOf.has(k)) volOf.set(k, Number(v) || 0); };
  for (const k of (snap.topKeywords ?? [])) note(k?.keyword, k?.searchVolume);
  for (const k of (snap.gapKeywords ?? [])) note(k?.keyword, k?.searchVolume);
  for (const t of (snap._demandUniverse?.topics ?? [])) note(t?.keyword, t?.searchVolume);

  // Build per-PROCEDURE-category keyword lists from the keyword→category map.
  const typeByCat = new Map<string, string>();
  for (const c of cb.categories) typeByCat.set(String(c.name), String(c.type ?? 'procedure'));
  const kwByCat = new Map<string, Array<{ keyword: string; searchVolume: number }>>();
  for (const [kwLow, catName] of Object.entries((cb.keywordCategories ?? {}) as Record<string, string>)) {
    if (typeByCat.get(catName) !== 'procedure') continue;
    const arr = kwByCat.get(catName) ?? [];
    arr.push({ keyword: kwLow, searchVolume: volOf.get(kwLow) ?? 0 });
    kwByCat.set(catName, arr);
  }

  const catInputs: CategoryInput[] = Array.from(kwByCat.entries())
    .filter(([, kws]) => kws.length > 0)
    .map(([name, keywords]) => ({ name, type: 'procedure', keywords }));

  // Resume: skip categories already refined unless force.
  const prior: any[] = Array.isArray(cb.intentGroups) ? cb.intentGroups : [];
  const priorBrand: string[] = Array.isArray(cb.brandKeywords) ? cb.brandKeywords : [];
  const alreadyDone = (!force && cb.intentEngine === INTENT_ENGINE)
    ? Array.from(new Set(prior.map((g: any) => String(g.category)))) : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      try {
        const todoTotal = catInputs.filter(c =>
          !(alreadyDone.map(s => s.toLowerCase()).includes(c.name.toLowerCase()))).length;
        send({ type: 'start', total: todoTotal, categories: catInputs.length });

        if (todoTotal === 0) {
          send({ type: 'done', intentGroups: prior, brandKeywords: priorBrand, skipped: true });
          controller.close();
          return;
        }

        const result = await groupCategoriesByIntent(
          catInputs, clientDomain,
          (done, total, label) => send({ type: 'progress', done, total, label }),
          alreadyDone,
        );

        // Merge with prior (force replaces; resume appends new categories).
        const mergedGroups = force ? result.intentGroups
          : [...prior, ...result.intentGroups.filter(g => !alreadyDone.map(s => s.toLowerCase()).includes(g.category.toLowerCase()))];
        const mergedBrand = Array.from(new Set([...(force ? [] : priorBrand), ...result.brandKeywords]));

        const nextCb = { ...cb, intentGroups: mergedGroups, brandKeywords: mergedBrand, intentEngine: INTENT_ENGINE };
        await db.update(analyses)
          .set({ semrushSnapshot: { ...snap, _categoryBreakdown: nextCb } as any })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Refine-clusters: ${mergedGroups.length} intent groups, ${mergedBrand.length} brand terms across ${catInputs.length} categories`);
        send({ type: 'done', intentGroups: mergedGroups, brandKeywords: mergedBrand });
        controller.close();
      } catch (err) {
        console.error('[OrbitIQ] refine-clusters failed:', err);
        send({ type: 'error', error: `AI refine failed: ${String((err as any)?.message ?? err)}` });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'application/x-ndjson; charset=utf-8',
      'Cache-Control':     'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
