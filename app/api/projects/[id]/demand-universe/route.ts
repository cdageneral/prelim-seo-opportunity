/**
 * POST /api/projects/[id]/demand-universe — on-demand "Build deep journey" (v7.155)
 *
 * Expands the DEMAND UNIVERSE for the project: seeds Semrush
 * `phrase_questions` + `phrase_related` from the client's procedures (product
 * side) AND the audience's life-problems (pre-product side), merges them into a
 * deduped, volume-backed topic list, and stores it on the latest analysis as
 * `semrushSnapshot._demandUniverse` (additive JSONB — no schema change).
 *
 * The Audience Journey then builds its topic map from this universe (every node
 * volume-defensible) and overlays the client/competitor ranking footprint as
 * coverage. AI never invents a topic or a number — they come from Semrush.
 *
 * COST: Semrush bills ~40 API units per returned row. Deep build = all seeds.
 * Triggered explicitly by the user (button), never automatically, so spend is
 * always opt-in.
 *
 * Body:    { linesPerSeed?: number }   (default 50, capped 1..100)
 * Returns: { demandUniverse }          (panel uses it live; also persisted)
 */

import { NextRequest, NextResponse } from 'next/server';
import { setUsageProject } from '@/lib/usage/context';
import { db } from '@/db';
import { analyses, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildDemandUniverse, mergeDemandLanes } from '@/lib/apis/demandExpansion';

export const maxDuration = 300;

const DEFAULT_LINES = 50;
const MAX_LINES     = 100;

// v7.175 / v7.187: REPEATABLE problem-seed derivation — NO hardcoded vertical
// vocabulary. Problem seeds come exclusively from each client's OWN audience
// language (segment pre-LLM prompts + triggers). Each prompt is a real
// problem-aware search; we reduce it to a concise head term by stripping the
// question scaffolding ("how to", "why can't I", "what is", "best way to", …) and
// a few generic tails, then keep it short (Semrush returns a far richer demand
// universe from a 2–5 word head term than from a full sentence). Works for ANY
// industry because every client gets audience segments with pre-LLM prompts.
// v7.187: the cosmetic PROBLEM_SEED_ANCHORS supplement and the cosmetic
// last-resort fallback were REMOVED — they injected another vertical's vocabulary
// (e.g. "double chin", "arm fat") into unrelated projects (finance, SaaS, …). The
// pre-product lane now expands from the client's own language or, if that is
// empty, from the product (procedure-category) seeds only — never a canned list.
// Longest variants FIRST — the strip loop breaks on first match then re-runs, so a
// short prefix ('how much') must not pre-empt a longer one ('how much does a').
const LEAD_SCAFFOLD = [
  'how much does a', 'how much does', 'how much is a', 'how much is', 'how much',
  'how do i', 'how do you', 'how can i', 'how to get rid of', 'how to lose', 'how to fix', 'how to',
  'what is the best', 'whats the best', 'what to do about', 'what is a', 'what is', 'what are',
  'why cant i', 'why can’t i', 'why wont my', 'why won’t my', 'why do i', 'why is my', 'why is',
  'best way to', 'best ways to', 'ways to', 'is there a way to', 'can you', 'do i need',
  'help with', 'i have', 'i want to', 'i need to', 'tips for', 'tips to',
];
const TAIL_NOISE = [
  ' without surgery', ' at home', ' fast', ' quickly', ' naturally', ' on my own',
  ' that won’t go away', ' that wont go away', ' what to do', ' what can i do', ' for good',
];
const STOP_HEAD = new Set(['the','a','an','my','your','to','of','for','is','are','do','does','will','can','i','it','that','this']);

function conciseSeed(prompt: string): string {
  let s = (prompt ?? '').toLowerCase().replace(/["“”?.!]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const lead of LEAD_SCAFFOLD) {
      if (s.startsWith(lead + ' ')) { s = s.slice(lead.length).trim(); changed = true; break; }
    }
  }
  for (const tail of TAIL_NOISE) { if (s.endsWith(tail)) s = s.slice(0, s.length - tail.length).trim(); }
  const parts = s.split(' ');
  while (parts.length > 1 && STOP_HEAD.has(parts[0])) parts.shift();
  return parts.slice(0, 5).join(' ').trim();   // keep a head term (≤5 words)
}

// v7.187: engine tag stamped on every built universe so the client can detect and
// discard a universe built by the OLD (cosmetic-hardcoded) engine. Bumping this
// invalidates any stale demand universe persisted before the domain-agnostic fix.
const DEMAND_ENGINE = 'demand-v2';

const MAX_PROBLEM_SEEDS = 14;   // cap Semrush spend; richest head terms first

function deriveSeeds(analysis: any): { product: string[]; problem: string[] } {
  const snap = analysis?.semrushSnapshot ?? {};
  const categories: any[] = snap?._categoryBreakdown?.categories ?? [];
  const segments: any[]   = snap?._audienceSegments ?? [];

  // Product seeds = procedure category names (they ARE the named solutions).
  const product = categories
    .filter((c: any) => c.type === 'procedure')
    .map((c: any) => String(c.name ?? '').trim())
    .filter(Boolean);

  // Problem seeds — GENERIC, per-client: reduce each pre-LLM prompt to a head term.
  const prompts: string[] = segments.flatMap((s: any) => [
    ...((s?.preLLMPrompts ?? []) as string[]),
    String(s?.whoTheyAre?.trigger ?? ''),
  ]);
  const problemSet = new Set<string>();
  for (const p of prompts) {
    const seed = conciseSeed(p);
    if (seed && (seed.indexOf(' ') >= 0 || seed.length >= 5)) problemSet.add(seed);
  }
  // v7.187: NO canned cosmetic fallback. If the client's own language yields no
  // problem head terms, the pre-product lane simply expands from the product seeds
  // (procedure categories) — defensible because those are the client's real
  // solutions. We never inject another vertical's vocabulary here.

  return { product, problem: Array.from(problemSet).slice(0, MAX_PROBLEM_SEEDS) };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  setUsageProject(projectId);   // v7.225: attribute API usage to this project

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const linesPerSeed = Math.min(Math.max(parseInt(body?.linesPerSeed, 10) || DEFAULT_LINES, 1), MAX_LINES);

  if (!process.env.SEMRUSH_API_KEY) {
    return NextResponse.json(
      { error: 'SEMRUSH_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.' },
      { status: 500 }
    );
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const recent = await db.query.analyses.findMany({
    where:   eq(analyses.projectId, projectId),
    orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
    limit:   5,
  });
  const analysis = recent.find((a: any) => a.semrushSnapshot != null);
  if (!analysis) {
    return NextResponse.json({ error: 'No analysis with keyword data found. Run an analysis first.' }, { status: 400 });
  }

  const database = String((project as any).semrushDatabase ?? 'us');
  const { product, problem } = deriveSeeds(analysis);

  // v7.241: two independent passes (Wayne). The Keyword panel's "Expand product
  // data" button posts mode:'product' (product/procedure seeds only) and "Build
  // pre-product journey" posts mode:'pre' (problem/life-trigger seeds only). The
  // legacy combined build is mode:'all' (default) — unchanged. Each pass rebuilds
  // ONLY its lane and MERGES into the existing _demandUniverse, so running one
  // never wipes the other (Const II.3 backfill); volumes still come straight from
  // Semrush (Const I.1) and each keyword is kept once (Const I.3, no double count).
  const mode: 'product' | 'pre' | 'all' =
    body?.mode === 'product' ? 'product' : body?.mode === 'pre' ? 'pre' : 'all';
  const seeds = mode === 'product' ? product : mode === 'pre' ? problem : [...product, ...problem];
  const rebuiltLanes: Array<'product' | 'problem'> =
    mode === 'product' ? ['product'] : mode === 'pre' ? ['problem'] : ['product', 'problem'];

  if (seeds.length === 0) {
    const what = mode === 'pre'
      ? 'No problem / life-trigger seeds found on this analysis. Pre-product expansion needs audience segment language — run an analysis that builds audience segments first.'
      : mode === 'product'
        ? 'No procedure seeds (product categories) found on this analysis to expand.'
        : 'No procedure or problem seeds found on this analysis to expand.';
    return NextResponse.json({ error: what }, { status: 400 });
  }

  console.log(`[OrbitIQ] Demand-universe build (mode=${mode}): ${seeds.length} seeds (${product.length} product + ${problem.length} problem), ${linesPerSeed} lines/seed, db=${database}`);

  // v7.156: stream progress as NDJSON so the panel shows a determinate bar + ETA
  // ("seed X of N") instead of an indefinite spinner. One event per finished seed;
  // a final {type:'done', demandUniverse} carries the result (also persisted).
  const productSet = new Set(product.map(s => s.toLowerCase()));
  // v7.241: the lane this run does NOT rebuild is preserved verbatim from the
  // existing universe so a single-lane pass never destroys the other lane's topics.
  const existingUniverse = (analysis.semrushSnapshot as any)?._demandUniverse ?? null;
  const existingTopics: any[] = Array.isArray(existingUniverse?.topics) ? existingUniverse.topics : [];
  const laneOf = (t: any): 'product' | 'problem' => (t?.laneHint === 'product' ? 'product' : 'problem');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        send({ type: 'start', total: seeds.length, mode, productCount: product.length, problemCount: problem.length });

        const universe = await buildDemandUniverse(seeds, linesPerSeed, database, (done, total, seed) => {
          send({ type: 'progress', done, total, seed });
        });

        if (universe.topicCount === 0) {
          // Honest gap (Const I.5): this lane returned nothing — do NOT persist, so the
          // existing (other-lane) universe is left untouched rather than overwritten.
          send({ type: 'error', error: `Semrush returned no topics for the ${mode === 'pre' ? 'pre-product' : mode} pass — likely out of API units or an invalid database. (${universe.status})` });
          controller.close();
          return;
        }

        // Merge: keep existing topics from lanes NOT rebuilt, then overlay this run's
        // topics (new wins on a keyword collision, taking the max real volume). Pure
        // helper in demandExpansion.ts (unit-checked in the retained regression suite).
        const mergedTopics = mergeDemandLanes(existingTopics, universe.topics, mode, productSet);
        const productTopicCount = mergedTopics.filter(t => laneOf(t) === 'product').length;
        const problemTopicCount = mergedTopics.length - productTopicCount;

        const demandUniverse = {
          ...universe,
          engine: DEMAND_ENGINE,   // v7.187: stale-universe invalidation tag
          // Seed lists: update only the rebuilt lane(s); preserve the other lane's seeds.
          productSeeds: rebuiltLanes.includes('product') ? product : (existingUniverse?.productSeeds ?? []),
          problemSeeds: rebuiltLanes.includes('problem') ? problem : (existingUniverse?.problemSeeds ?? []),
          topics:      mergedTopics,
          topicCount:  mergedTopics.length,
          lastMode:    mode,                 // v7.241: which pass last ran
          productTopicCount, problemTopicCount,
          status: `${mergedTopics.length} topics (${productTopicCount} product · ${problemTopicCount} pre-product) · last pass: ${mode}`,
        };

        await db.update(analyses)
          .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _demandUniverse: demandUniverse } as any })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Demand-universe stored (mode=${mode}): ${demandUniverse.topicCount} topics (${demandUniverse.status})`);
        send({ type: 'done', demandUniverse });
        controller.close();
      } catch (err) {
        console.error('[OrbitIQ] Demand-universe build failed:', err);
        send({ type: 'error', error: `Demand expansion failed: ${String((err as any)?.message ?? err)}` });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':     'application/x-ndjson; charset=utf-8',
      'Cache-Control':    'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
