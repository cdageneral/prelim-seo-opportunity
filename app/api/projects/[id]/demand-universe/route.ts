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
import { db } from '@/db';
import { analyses, projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildDemandUniverse } from '@/lib/apis/demandExpansion';

export const maxDuration = 300;

const DEFAULT_LINES = 50;
const MAX_LINES     = 100;

// v7.175: REPEATABLE problem-seed derivation — no hardcoded vertical vocabulary.
// Problem seeds come from each client's OWN audience language (segment pre-LLM
// prompts + triggers). Each prompt is a real problem-aware search; we reduce it to
// a concise head term by stripping the question scaffolding ("how to", "why can't
// I", "what is", "best way to", …) and a few generic tails, then keep it short
// (Semrush returns a far richer demand universe from a 2–5 word head term than from
// a full sentence). Works for ANY industry because every client gets audience
// segments with pre-LLM prompts. The anchor list below is a quality SUPPLEMENT for
// verticals we know well — it never gates the generic path.
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

const PROBLEM_SEED_ANCHORS = [
  'love handles', 'muffin top', 'double chin', 'loose skin', 'saggy skin', 'excess skin',
  'stubborn belly fat', 'belly fat', 'stomach fat', 'lower belly fat', 'stubborn fat',
  'back fat', 'arm fat', 'bra fat', 'thigh fat', 'inner thigh', 'cellulite',
  'sagging breasts', 'small breasts', 'weight loss plateau', 'cant lose weight',
  'jowls', 'turkey neck',
];

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
  // Quality supplement: add any known anchor that literally appears in the language.
  const allText = prompts.join(' ').toLowerCase();
  for (const anchor of PROBLEM_SEED_ANCHORS) { if (allText.includes(anchor)) problemSet.add(anchor); }

  // Last-resort fallback so the pre-product lane always expands.
  if (problemSet.size === 0) {
    ['stubborn belly fat', 'loose skin', 'double chin', 'love handles', 'cellulite'].forEach(a => problemSet.add(a));
  }

  return { product, problem: Array.from(problemSet).slice(0, MAX_PROBLEM_SEEDS) };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;

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
  const seeds = [...product, ...problem];

  if (seeds.length === 0) {
    return NextResponse.json({ error: 'No procedure or problem seeds found on this analysis to expand.' }, { status: 400 });
  }

  console.log(`[OrbitIQ] Demand-universe build: ${seeds.length} seeds (${product.length} product + ${problem.length} problem), ${linesPerSeed} lines/seed, db=${database}`);

  // v7.156: stream progress as NDJSON so the panel shows a determinate bar + ETA
  // ("seed X of N") instead of an indefinite spinner. One event per finished seed;
  // a final {type:'done', demandUniverse} carries the result (also persisted).
  const productSet = new Set(product.map(s => s.toLowerCase()));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        send({ type: 'start', total: seeds.length, productCount: product.length, problemCount: problem.length });

        const universe = await buildDemandUniverse(seeds, linesPerSeed, database, (done, total, seed) => {
          send({ type: 'progress', done, total, seed });
        });

        if (universe.topicCount === 0) {
          send({ type: 'error', error: `Semrush returned no topics — likely out of API units or an invalid database. (${universe.status})` });
          controller.close();
          return;
        }

        const demandUniverse = {
          ...universe,
          productSeeds: product,
          problemSeeds: problem,
          topics: universe.topics.map(t => ({
            ...t,
            laneHint: t.seeds.some(s => productSet.has(s.toLowerCase())) ? 'product' : 'problem',
          })),
        };

        await db.update(analyses)
          .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _demandUniverse: demandUniverse } as any })
          .where(eq(analyses.id, analysis.id));

        console.log(`[OrbitIQ] Demand-universe stored: ${demandUniverse.topicCount} topics (${universe.status})`);
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
