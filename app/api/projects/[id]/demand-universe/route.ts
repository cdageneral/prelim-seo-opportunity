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

// Concise life-problem anchors. When one appears in a segment trigger or a
// pre-LLM prompt, the SHORT anchor (not the long sentence) is used as the seed —
// short head terms return a far richer demand universe from Semrush.
const PROBLEM_SEED_ANCHORS = [
  'love handles', 'muffin top', 'double chin', 'loose skin', 'saggy skin', 'excess skin',
  'stubborn belly fat', 'belly fat', 'stomach fat', 'lower belly fat', 'stubborn fat',
  'back fat', 'arm fat', 'bra fat', 'thigh fat', 'inner thigh', 'cellulite',
  'sagging breasts', 'small breasts', 'weight loss plateau', 'cant lose weight',
  'double chin', 'jowls', 'turkey neck',
];

function deriveSeeds(analysis: any): { product: string[]; problem: string[] } {
  const snap = analysis?.semrushSnapshot ?? {};
  const categories: any[] = snap?._categoryBreakdown?.categories ?? [];
  const segments: any[]   = snap?._audienceSegments ?? [];

  // Product seeds = procedure category names (they ARE the named solutions).
  const product = categories
    .filter((c: any) => c.type === 'procedure')
    .map((c: any) => String(c.name ?? '').trim())
    .filter(Boolean);

  // Problem seeds = concise anchors found in the audience's own language
  // (segment triggers + pre-LLM prompts). Grounded in the analysis, not invented.
  const problemText = segments.flatMap((s: any) => [
    String(s?.whoTheyAre?.trigger ?? ''),
    ...((s?.preLLMPrompts ?? []) as string[]),
  ]).join(' ').toLowerCase();

  const problemSet = new Set<string>();
  for (const anchor of PROBLEM_SEED_ANCHORS) {
    if (problemText.includes(anchor)) problemSet.add(anchor);
  }
  // Fallback: if the audience language yielded nothing, seed the broadest
  // body-concern anchors so the pre-product lane still expands.
  if (problemSet.size === 0) {
    ['stubborn belly fat', 'loose skin', 'double chin', 'love handles', 'cellulite'].forEach(a => problemSet.add(a));
  }

  return { product, problem: Array.from(problemSet) };
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
