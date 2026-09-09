/**
 * /api/projects/[id]/insights-panel — v7.471 · the Insights panel (under
 * Executive Summary).
 *
 * GET  → { insights, updatedAt, quadrant, coverage, benchmarks }
 *        insights   = the STORED generated narrative blob (null until generated)
 *        quadrant   = source-vs-answer quadrant, computed live by the shared
 *                     deterministic builder over stored Profound data
 *        coverage   = demand-coverage table from the Product Insights shared
 *                     basis (Const II.6a — read, never re-derived)
 *        benchmarks = user-entered market benchmark rows (external scale data,
 *                     e.g. deposits) — displayed verbatim with their source,
 *                     never computed on (Const I.1: user-supplied, source-labeled)
 *        job        = v7.488 — the live state of the current/last generation run
 *        GET ?job=1 → { job, insights, updatedAt } only — the cheap poll the panel
 *                     uses when its stream is gone (no census rebuild, no blobs)
 * PUT  → { benchmarks } — store the market-benchmark rows
 * POST → generate/regenerate the narrative insights. NDJSON status stream
 *        (Const IV.2), Claude tool-use over lib/seer/core's guarded tools with
 *        the v7.463 fail-closed number verifier: every number in the generated
 *        JSON must appear verbatim in a tool result from THIS request, or the
 *        generation is refused — never stored (Const I.1, the v7.463 lesson:
 *        a prompt rule is a request; the machine check is the guarantee).
 *
 * v7.488 — the run no longer DEPENDS on its stream. v7.487 gave the server a
 * wall-clock budget, and the server then ran to completion — but the browser's
 * connection was cut at ~5 min by an intermediate layer, so the result landed in
 * the database and nobody saw it. Now every status frame, heartbeat and terminal
 * outcome is ALSO written to projects.insights_panel_job; the panel switches to
 * polling GET ?job=1 the moment its stream drops, and a reload mid-run resumes
 * from the stored state. A 15 s heartbeat keeps idle-timeout layers fed, a
 * running job is never started twice (POST attaches to it instead), and every
 * enqueue is guarded so a vanished client cannot abort the generation.
 *
 * Cached: the verified blob is stored on projects.insights_panel and re-served
 * until the user regenerates. Every Claude call is metered into the api_usage
 * ledger under this project (Const I.5b; model claude-sonnet-4-6 is registered).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { checkProjectAccess } from '@/lib/auth/access';
import { instrumentAnthropic } from '@/lib/usage/record';
import { setUsageProject } from '@/lib/usage/context';
import {
  buildContext, buildCensus, extractNumberTokens, findUngroundedAllowRounding,
  TOOLS, runTool, statusLabelFor, SEER_MODEL, normDomain, type SeerContext,
} from '@/lib/seer/core';
import { buildQuadrant, buildCoverageSummary } from '@/lib/insightsPanel/build';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 800;   // v7.487 (Fluid compute, Pro) — was 300

const JSON_NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;
const NDJSON_NO_STORE = { 'Cache-Control': 'no-store, no-transform', 'Content-Type': 'application/x-ndjson' } as const;

const MAX_TOOL_TURNS = 16;
const MAX_REPAIRS = 3;

// ── v7.487 — the wall-clock budget ───────────────────────────────────────────
// Why this exists: the platform kills the function at `maxDuration` WITHOUT any
// error frame. The NDJSON stream simply stops mid-flight, the browser reads a
// clean end-of-stream, and the panel silently reverts to "Not generated yet" —
// no error, nothing saved, nothing said (TD Bank, 2026-09-09 19:58 UTC, killed
// at 300s mid-tool-loop). The loop had no notion of elapsed time: 16 tool turns
// plus up to 3 repair rounds, each a full call against a context that grows
// every turn, will outrun any ceiling on a large enough project.
//
// So the route now owns a deadline SHORTER than the platform's and always lands
// a terminal frame (done or error) inside it. Raising the ceiling alone would
// not have fixed this — it would only have moved the silent kill later.
const BUDGET_MS  = maxDuration * 1000;
const SAFETY_MS  = 25_000;   // margin so our deadline always precedes the kill
const RESERVE_MS = 95_000;   // held back for: final no-tools write + verify + DB save
const REPAIR_MS  = 70_000;   // a repair round is only started with this much left
const MIN_CALL_MS = 30_000;  // never hand the SDK an absurdly short timeout

// ── v7.488 — job state + heartbeat ────────────────────────────────────────────
const HEARTBEAT_MS  = 15_000;  // a ping frame (and a job write) while the model thinks
const JOB_STALE_MS  = 90_000;  // a "running" job not touched for this long is presumed dead

type JobStatus = 'running' | 'done' | 'error';
interface Job {
  runId: string; status: JobStatus; label: string; step: number; steps: number;
  startedAt: string; updatedAt: string; elapsedMs: number; budgetMs: number;
  error?: string | null; refusal?: boolean;
}
function jobIsLive(j: any): j is Job {
  if (!j || j.status !== 'running' || typeof j.updatedAt !== 'string') return false;
  const t = Date.parse(j.updatedAt);
  return Number.isFinite(t) && (Date.now() - t) < JOB_STALE_MS;
}

async function ensureColumns() {
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS insights_panel JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS insights_panel_updated_at TIMESTAMP`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS market_benchmarks JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS insights_panel_job JSONB`); } catch { /* exists */ }   // v7.488
}

// Market benchmarks are EXTERNAL scale data the user enters with a named source
// (e.g. "Capital One · Deposits Q2 2026 · $484.3B · source: Q2 earnings release").
// They are stored and displayed verbatim; OrbitIQ never computes on them.
const BenchmarkRow = z.object({
  brand: z.string().min(1).max(120),
  metric: z.string().min(1).max(120),
  value: z.string().min(1).max(60),
  rank: z.number().int().min(1).max(999).nullable().optional(),
  source: z.string().min(1).max(300),
}).strict();
const PutSchema = z.object({ benchmarks: z.array(BenchmarkRow).max(40) }).strict();

// ─── the generated-blob shape (validated before storing) ─────────────────────

const PatternSchema = z.object({
  tag: z.enum(['PATTERN', 'GOOD_NEWS', 'RISK', 'OPPORTUNITY']),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1200),
}).strict();
const GeneratedSchema = z.object({
  thesis: z.object({
    headline: z.string().min(1).max(300),
    body: z.string().min(1).max(1500),
    openPosition: z.string().max(400).nullable(),
  }).strict(),
  patterns: z.array(PatternSchema).min(1).max(8),
  playbook: z.array(z.object({
    brand: z.string().min(1).max(120),
    doingWell: z.string().min(1).max(900),
    vulnerable: z.string().min(1).max(900),
    keyStat: z.string().min(1).max(120),
  }).strict()).max(15),
  strike: z.array(z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1200),
    impact: z.enum(['HIGH', 'MEDIUM']),
  }).strict()).max(8),
  sources: z.array(z.string().max(160)).max(20),
}).strict();

function insightsSystemPrompt(ctx: SeerContext): string {
  const p: any = ctx.project;
  return [
    `You are OrbitIQ's insight engine. Produce the Insights panel content for ONE project: ${p.clientName} (${normDomain(p.websiteUrl ?? '')}${p.industry ? `, ${p.industry}` : ''}).`,
    '',
    'Your job: find the strongest OVERARCHING, cross-panel insights this project\'s stored data proves — how search rank, AI visibility, prompts, content, sentiment, and the competitive field relate. Find real correlations and patterns (e.g. a brand winning feature prompts but losing rate prompts; content mix out of line with the traffic it returns; search coverage that does not convert to AI visibility; a rival whose visibility rests on almost no citations). State what each competitor does well and where it is vulnerable. Then say where the openings are.',
    '',
    'NON-NEGOTIABLE RULES (machine-enforced):',
    '1. GROUNDED ONLY. Every number you write must appear VERBATIM in a tool result from this conversation. Copy numbers character-for-character — NEVER round (7.34 must not become 7.3), never abbreviate (1200 never 1.2K), never compute your own sums, ratios, or percentages. If you want a rounded or aggregate figure the tools did not return, quote the exact returned value instead. A server-side check rejects output containing any number the tools did not return, so one rounded digit discards the whole generation.',
    '2. NO ESTIMATES. Nothing modeled, projected, or assumed. If the data cannot support a claim, do not make the claim.',
    '3. ABSENCE IS NEVER ZERO. A section with no stored data is unmeasured — a pattern may note the gap, never treat it as 0.',
    '4. QUALITATIVE CLAIMS are benchmarked claims. Name the metric behind every "wins/loses/leads/trails" — and never describe the client as "strong", "ranking well", "citing well" or "leading" on a measure unless the tools show it AT OR ABOVE the field average or leader on that SAME measure. Below the field average = say so plainly ("trails the field", "below the category average"). A lead on one narrow metric (e.g. one product line\'s content coverage) never justifies a broad "ranks well" claim; scope the praise to exactly the metric that earned it. The thesis must agree directionally with the evidence cited beneath it.',
    '5. BRAND SAFETY: competitor brands appear only as competitors; the category tree you receive is already guarded.',
    '6. Fewer, stronger insights. 3-6 patterns that a CMO would act on beat 8 shallow ones. Plain, direct language; short sentences; no hedging.',
    '',
    'OUTPUT: after your tool calls, reply with EXACTLY ONE JSON object (no markdown fences, no prose outside it):',
    '{"thesis":{"headline":"...","body":"...","openPosition":"... or null"},',
    ' "patterns":[{"tag":"PATTERN|GOOD_NEWS|RISK|OPPORTUNITY","title":"...","body":"..."}],',
    ' "playbook":[{"brand":"...","doingWell":"...","vulnerable":"...","keyStat":"..."}],',
    ' "strike":[{"title":"...","body":"...","impact":"HIGH|MEDIUM"}],',
    ' "sources":["panel · what was read", ...]}',
    'thesis = the one overarching category story the data proves. patterns = the cross-panel findings with their evidence numbers inline. playbook = per competitor (only competitors with stored data). strike = ranked openings. sources = the panels/sections you drew from.',
    'WORKFLOW: the DATA CENSUS gives every panel\'s headline numbers. Drill with tools into keywords, categories, content coverage, and every stored section that bears on the story (ai_visibility, page_map, serp_snapshot, product_insights, sentiment). Consider ALL panels before writing.',
  ].join('\n');
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) return NextResponse.json({ error: gate.reason ?? 'Access denied' }, { status: gate.status, headers: JSON_NO_STORE });
  await ensureColumns();

  // v7.488 — the cheap poll. Explicit columns only (the v7.486 lesson): no census
  // rebuild, no quadrant, none of the big JSONB stores — the panel hits this
  // every few seconds while a run is in flight or after its stream dropped.
  if (_req.nextUrl.searchParams.get('job') === '1') {
    const [row] = await db.select({
      job: projects.insightsPanelJob, insights: projects.insightsPanel, updatedAt: projects.insightsPanelUpdatedAt,
    }).from(projects).where(eq(projects.id, params.id)).limit(1);
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: JSON_NO_STORE });
    const job: any = row.job ?? null;
    // A "running" job nobody has touched in JOB_STALE_MS is reported as such, in
    // words, rather than spinning forever (Const I.5 — an honest gap).
    if (job && job.status === 'running' && !jobIsLive(job)) {
      job.status = 'error';
      job.error = 'The server stopped reporting progress on this run, so it is presumed to have died. Nothing was saved from it. Try again.';
    }
    return NextResponse.json({ job, insights: row.insights ?? null, updatedAt: row.updatedAt ?? null }, { headers: JSON_NO_STORE });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, params.id) });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: JSON_NO_STORE });

  // Live computed views over stored data (Const II.6): quadrant + coverage.
  let quadrant = null; let coverage = null;
  try { quadrant = buildQuadrant((project as any).profoundData ?? null); } catch { quadrant = null; }
  try {
    const ctx = await buildContext(params.id);
    if (!('error' in ctx)) coverage = buildCoverageSummary(ctx);
  } catch { coverage = null; }

  return NextResponse.json({
    insights: (project as any).insightsPanel ?? null,
    updatedAt: (project as any).insightsPanelUpdatedAt ?? null,
    quadrant, coverage,
    benchmarks: (project as any).marketBenchmarks ?? null,
    job: (project as any).insightsPanelJob ?? null,   // v7.488 — a reload mid-run resumes from this
  }, { headers: JSON_NO_STORE });
}

// ─── PUT (market benchmarks) ─────────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) return NextResponse.json({ error: gate.reason ?? 'Access denied' }, { status: gate.status, headers: JSON_NO_STORE });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: JSON_NO_STORE }); }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body — each row needs brand, metric, value, source' }, { status: 400, headers: JSON_NO_STORE });
  await ensureColumns();
  const now = new Date();
  const [updated] = await db.update(projects)
    .set({ marketBenchmarks: parsed.data.benchmarks as any, updatedAt: now } as any)
    .where(eq(projects.id, params.id))
    .returning();
  if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: JSON_NO_STORE });
  return NextResponse.json({ benchmarks: (updated as any).marketBenchmarks ?? [] }, { headers: JSON_NO_STORE });
}

// ─── POST (generate) ─────────────────────────────────────────────────────────

function parseGenerated(draft: string): { blob: z.infer<typeof GeneratedSchema> } | { parseError: string } {
  let text = draft.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { parseError: 'No JSON object found in the reply.' };
  let obj: unknown;
  try { obj = JSON.parse(text.slice(start, end + 1)); } catch (e: any) { return { parseError: `JSON parse failed: ${e?.message ?? 'unknown'}` }; }
  const parsed = GeneratedSchema.safeParse(obj);
  if (!parsed.success) return { parseError: 'JSON shape invalid: ' + parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(' · ') };
  return { blob: parsed.data };
}

/**
 * v7.471: display formatter, applied AFTER verification. Stored floats carry
 * raw precision (e.g. 7.265774378585086); the model must quote them VERBATIM
 * to pass the gate, which reads terribly. This is a pure TS formatter — the
 * same role as the panels' p1()/n0() — rounding long decimals to one place
 * for display. It runs only on text whose numbers were already verified, so
 * nothing unverified is introduced (Const I.1: format-at-render, never model
 * math).
 */
function tidyNumbers(text: string): string {
  return text.replace(/\d+\.\d{3,}/g, m => {
    const n = Number(m);
    return Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : m;
  });
}
function tidyBlob<T extends z.infer<typeof GeneratedSchema>>(blob: T): T {
  return {
    ...blob,
    thesis: { headline: tidyNumbers(blob.thesis.headline), body: tidyNumbers(blob.thesis.body),
      openPosition: blob.thesis.openPosition ? tidyNumbers(blob.thesis.openPosition) : blob.thesis.openPosition },
    patterns: blob.patterns.map(pt => ({ ...pt, title: tidyNumbers(pt.title), body: tidyNumbers(pt.body) })),
    playbook: blob.playbook.map(r => ({ ...r, doingWell: tidyNumbers(r.doingWell), vulnerable: tidyNumbers(r.vulnerable), keyStat: tidyNumbers(r.keyStat) })),
    strike: blob.strike.map(sk => ({ ...sk, title: tidyNumbers(sk.title), body: tidyNumbers(sk.body) })),
  };
}

/** every narrative string of the blob, joined — the text the number gate checks. */
function narrativeText(blob: z.infer<typeof GeneratedSchema>): string {
  const parts: string[] = [blob.thesis.headline, blob.thesis.body, blob.thesis.openPosition ?? ''];
  for (const p of blob.patterns) parts.push(p.title, p.body);
  for (const p of blob.playbook) parts.push(p.brand, p.doingWell, p.vulnerable, p.keyStat);
  for (const s of blob.strike) parts.push(s.title, s.body);
  return parts.join('\n');
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) {
    return new Response(JSON.stringify({ type: 'error', error: gate.reason ?? 'Access denied' }) + '\n', { status: gate.status, headers: NDJSON_NO_STORE });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ type: 'error', error: 'Insights generation is not configured (ANTHROPIC_API_KEY missing)' }) + '\n', { status: 503, headers: NDJSON_NO_STORE });
  }
  const projectId = params.id;
  await ensureColumns();

  // v7.488 — one run at a time. A second click, a reload-and-click, or two tabs
  // must ATTACH to the run in flight (the client polls it), never start another
  // — two runs raced on TD Bank on 2026-09-09 and doubled the spend for nothing.
  const [cur] = await db.select({ job: projects.insightsPanelJob }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (cur && jobIsLive(cur.job)) {
    return new Response(JSON.stringify({ type: 'attached', job: cur.job }) + '\n', { status: 200, headers: NDJSON_NO_STORE });
  }

  // Absolute clock for this run (v7.487, hoisted in v7.488 so the budget counts
  // from the first byte of work, not from after the census is built).
  // `deadlineAt` is ours and is always earlier than the platform kill;
  // `toolCutoffAt` is when we stop gathering and start writing. Every SDK call
  // is also given a timeout of whatever is left, so one hung upstream call
  // cannot eat the budget.
  const t0           = Date.now();
  const deadlineAt   = t0 + BUDGET_MS - SAFETY_MS;
  const toolCutoffAt = deadlineAt - RESERVE_MS;
  const msLeft       = () => deadlineAt - Date.now();
  const callTimeout  = () => Math.max(MIN_CALL_MS, msLeft());
  const clock        = () => ({ elapsedMs: Date.now() - t0, budgetMs: BUDGET_MS });

  // v7.488 — the job row is the record of this run; the stream is a courtesy.
  let job: Job = {
    runId: randomUUID(), status: 'running', label: 'Starting', step: 1, steps: 5,
    startedAt: new Date(t0).toISOString(), updatedAt: new Date(t0).toISOString(), elapsedMs: 0, budgetMs: BUDGET_MS,
  };
  // Writes are serialised so a later state can never land before an earlier one,
  // and the chain is awaited before the response closes (Fluid compute may freeze
  // the instance once the response completes — a write still in flight then
  // would be lost, and the panel would poll a "running" job forever).
  let persistChain: Promise<void> = Promise.resolve();
  const persist = (patch: Partial<Job>): Promise<void> => {
    job = { ...job, ...patch, updatedAt: new Date().toISOString(), elapsedMs: Date.now() - t0 };
    const snapshot = job;
    persistChain = persistChain
      .then(() => db.update(projects).set({ insightsPanelJob: snapshot as any } as any).where(eq(projects.id, projectId)).then(() => undefined))
      .catch(() => undefined);
    return persistChain;
  };
  await persist({});   // claim the run before any work, so a racing click attaches

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      // v7.488 — every enqueue is guarded. If the client has gone (connection cut,
      // tab closed), enqueue throws; that must NOT abort the generation — the job
      // row carries on and the panel picks the result up by polling.
      let clientGone = false;
      const emit = (obj: any) => {
        if (!clientGone) {
          try { controller.enqueue(enc.encode(JSON.stringify(obj) + '\n')); }
          catch { clientGone = true; }
        }
        if (obj.type === 'status')     void persist({ status: 'running', label: String(obj.label ?? job.label), step: obj.step ?? job.step, steps: obj.steps ?? job.steps });
        else if (obj.type === 'ping')  void persist({});
        else if (obj.type === 'error') void persist({ status: 'error', error: String(obj.error ?? 'Generation failed'), refusal: !!obj.refusal });
        else if (obj.type === 'done')  void persist({ status: 'done', label: 'Done', step: 5, steps: 5, error: null });
      };
      // A heartbeat while the model thinks: idle-timeout layers see traffic, and
      // the job row's updatedAt keeps proving the run is alive (JOB_STALE_MS).
      const hb = setInterval(() => emit({ type: 'ping', ...clock() }), HEARTBEAT_MS);
      let finished = false;
      const finish = async () => {
        if (finished) return; finished = true;
        clearInterval(hb);
        await persistChain;                     // the terminal state lands BEFORE the response closes
        try { controller.close(); } catch { /* already closed */ }
      };
      try {
        emit({ type: 'status', label: 'Loading stored project data', step: 1, steps: 5, ...clock() });
        const ctx = await buildContext(projectId);
        if ('error' in ctx) { emit({ type: 'error', error: ctx.error }); await finish(); return; }

        setUsageProject(projectId);
        const client = instrumentAnthropic(new Anthropic({ apiKey }), 'insights');

        emit({ type: 'status', label: 'Collecting data from every panel', step: 2, steps: 5, ...clock() });
        const { payload: censusPayload } = buildCensus(ctx);
        const groundedPayloads: string[] = [censusPayload];

        const messages: Anthropic.MessageParam[] = [{
          role: 'user',
          content: 'Generate the Insights panel content for this project now.\n\n<data_census>\n' + censusPayload + '\n</data_census>',
        }];

        emit({ type: 'status', label: 'Reading the data across panels', step: 3, steps: 5, ...clock() });
        let repairs = 0;
        let stored: any = null;

        // v7.487 — ONE closure for "stop querying, write the answer from what we
        // already gathered". It was previously inline and reachable only from the
        // tool-turn cap (the v7.462 Seer pattern); the wall clock now reaches the
        // same path. Both routes verify the draft identically and both still fail
        // CLOSED (v7.463) — a time limit is never a reason to relax grounding.
        const finalAnswer = async (label: string): Promise<any | null> => {
          emit({ type: 'status', label, step: 4, steps: 5, ...clock() });
          const fin: Anthropic.Message = await client.messages.create({
            model: SEER_MODEL,
            max_tokens: 4000,
            system: insightsSystemPrompt(ctx) + '\nYou have used all tool calls. Reply NOW with the single JSON object, using only numbers that appeared in the tool results above.',
            messages,
          }, { timeout: callTimeout() });
          const draft = fin.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
          const parsed = parseGenerated(draft);
          const bad = 'blob' in parsed ? findUngroundedAllowRounding(narrativeText(parsed.blob), groundedPayloads.join('\n')) : [];
          if ('blob' in parsed && bad.length === 0) {
            return {
              ...tidyBlob(parsed.blob),
              generatedAt: new Date().toISOString(),
              model: SEER_MODEL,
              verified: extractNumberTokens(narrativeText(parsed.blob)).length,
              analysisCompletedAt: ctx.analysis?.completedAt ?? null,
            };
          }
          // Fail CLOSED — unverified output is never stored (v7.463).
          emit({ type: 'error', error: 'Generation could not be verified against the stored data and was discarded (grounding is enforced, not assumed). ' + ('parseError' in parsed ? parsed.parseError : ('Unverified numbers: ' + bad.join(', '))) + ' Try again — nothing unverified was saved.', refusal: true });
          return null;
        };

        for (let turn = 0; turn < MAX_TOOL_TURNS && !stored; turn++) {
          // Spend a tool turn only if there is still time to write and verify the
          // answer afterwards (v7.487). Crossing this line is normal operation on
          // a big project, not an error: we stop gathering and write what we have.
          if (Date.now() >= toolCutoffAt) {
            stored = await finalAnswer('Time budget reached — writing the verified insights from the data already read');
            if (!stored) { await finish(); return; }
            break;
          }
          const resp: Anthropic.Message = await client.messages.create({
            model: SEER_MODEL,
            max_tokens: 4000,
            system: insightsSystemPrompt(ctx),
            tools: TOOLS,
            messages,
          }, { timeout: callTimeout() });
          const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
          const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');

          if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
            const draft = textBlocks.map(b => b.text).join('\n').trim();
            emit({ type: 'status', label: 'Verifying every number against stored data', step: 4, steps: 5 });
            const parsed = parseGenerated(draft);
            const bad = 'blob' in parsed ? findUngroundedAllowRounding(narrativeText(parsed.blob), groundedPayloads.join('\n')) : [];
            const problem = 'parseError' in parsed ? parsed.parseError
              : bad.length > 0 ? ('These numbers do not appear in any tool result: ' + bad.join(', ')) : null;
            if (!problem && 'blob' in parsed) {
              stored = {
                ...tidyBlob(parsed.blob),
                generatedAt: new Date().toISOString(),
                model: SEER_MODEL,
                verified: extractNumberTokens(narrativeText(parsed.blob)).length,
                analysisCompletedAt: ctx.analysis?.completedAt ?? null,
              };
              break;
            }
            if (repairs >= MAX_REPAIRS) {
              // Fail CLOSED (v7.463): unverified insights are never stored or shown.
              emit({
                type: 'error',
                error: 'Generation could not be verified against the stored data and was discarded (grounding is enforced, not assumed). ' + (problem ?? '') + ' Try again — nothing unverified was saved.',
                refusal: true,
              });
              await finish();
              return;
            }
            if (msLeft() < REPAIR_MS) {
              // v7.487 — a repair round we cannot finish would be killed mid-stream
              // and say nothing. Refuse in words instead, still storing nothing.
              emit({
                type: 'error',
                error: 'The grounding check failed and there was not enough time left to re-query safely, so the generation was discarded — nothing unverified was saved. ' + (problem ?? '') + ' Try again.',
                refusal: true,
              });
              await finish();
              return;
            }
            repairs++;
            emit({ type: 'status', label: `Grounding check failed — re-querying (${repairs}/${MAX_REPAIRS})`, step: 4, steps: 5, ...clock() });
            messages.push({ role: 'assistant', content: draft });
            messages.push({
              role: 'user',
              content: 'CHECK FAILED: ' + (problem ?? '') + '\nRe-query the tools for real stored values, or rewrite without the unsupported numbers. Reply with the corrected single JSON object only.',
            });
            continue;
          }

          messages.push({ role: 'assistant', content: resp.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            emit({ type: 'status', label: statusLabelFor(tu.name, tu.input), step: 3, steps: 5, ...clock() });
            let out: any;
            try { out = runTool(ctx, tu.name, tu.input); }
            catch (e: any) { out = { error: `Tool failed: ${e?.message ?? 'unknown'}` }; }
            const payload = JSON.stringify(out).length > 28_000
              ? JSON.stringify({ _truncated: true, slice: JSON.stringify(out).slice(0, 28_000) })
              : JSON.stringify(out);
            groundedPayloads.push(payload);
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: payload });
          }
          messages.push({ role: 'user', content: results });

          if (turn === MAX_TOOL_TURNS - 1 && !stored) {
            // Out of tool turns — force a final NO-TOOLS answer from what was
            // gathered (the Seer pattern, v7.462), then verify it like any draft.
            stored = await finalAnswer('Writing the verified insights');
            if (!stored) { await finish(); return; }
          }
        }

        // v7.487 — never write a null panel. Every path that reaches here should
        // have produced a verified blob; if one ever does not, say so and leave
        // the stored panel untouched rather than silently blanking it (I.5).
        if (!stored) {
          emit({ type: 'error', error: 'Generation ended without a verified result, so nothing was saved. Try again.', refusal: true });
          await finish();
          return;
        }

        emit({ type: 'status', label: 'Saving the verified insights', step: 5, steps: 5, ...clock() });
        const now = new Date();
        await db.update(projects)
          .set({ insightsPanel: stored as any, insightsPanelUpdatedAt: now, updatedAt: now } as any)
          .where(eq(projects.id, projectId));
        emit({ type: 'done', insights: stored, updatedAt: now.toISOString() });
      } catch (e: any) {
        emit({ type: 'error', error: e?.message ?? 'Insights generation failed — try again' });
      } finally {
        await finish();
      }
    },
  });
  return new Response(stream, { status: 200, headers: NDJSON_NO_STORE });
}
