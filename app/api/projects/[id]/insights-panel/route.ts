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
 * PUT  → { benchmarks } — store the market-benchmark rows
 * POST → generate/regenerate the narrative insights. NDJSON status stream
 *        (Const IV.2), Claude tool-use over lib/seer/core's guarded tools with
 *        the v7.463 fail-closed number verifier: every number in the generated
 *        JSON must appear verbatim in a tool result from THIS request, or the
 *        generation is refused — never stored (Const I.1, the v7.463 lesson:
 *        a prompt rule is a request; the machine check is the guarantee).
 *
 * Cached: the verified blob is stored on projects.insights_panel and re-served
 * until the user regenerates. Every Claude call is metered into the api_usage
 * ledger under this project (Const I.5b; model claude-sonnet-4-6 is registered).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { checkProjectAccess } from '@/lib/auth/access';
import { instrumentAnthropic } from '@/lib/usage/record';
import { setUsageProject } from '@/lib/usage/context';
import {
  buildContext, buildCensus, extractNumberTokens, findUngrounded,
  TOOLS, runTool, statusLabelFor, SEER_MODEL, normDomain, type SeerContext,
} from '@/lib/seer/core';
import { buildQuadrant, buildCoverageSummary } from '@/lib/insightsPanel/build';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const JSON_NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;
const NDJSON_NO_STORE = { 'Cache-Control': 'no-store, no-transform', 'Content-Type': 'application/x-ndjson' } as const;

const MAX_TOOL_TURNS = 10;
const MAX_REPAIRS = 2;

async function ensureColumns() {
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS insights_panel JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS insights_panel_updated_at TIMESTAMP`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS market_benchmarks JSONB`); } catch { /* exists */ }
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
    doingWell: z.string().min(1).max(600),
    vulnerable: z.string().min(1).max(600),
    keyStat: z.string().min(1).max(120),
  }).strict()).max(15),
  strike: z.array(z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(600),
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
    '1. GROUNDED ONLY. Every number you write must appear VERBATIM in a tool result from this conversation. Never compute your own sums, ratios, or percentages — use tool aggregates. A server-side check rejects output containing any number the tools did not return, so an ungrounded number means the whole generation is discarded.',
    '2. NO ESTIMATES. Nothing modeled, projected, or assumed. If the data cannot support a claim, do not make the claim.',
    '3. ABSENCE IS NEVER ZERO. A section with no stored data is unmeasured — a pattern may note the gap, never treat it as 0.',
    '4. QUALITATIVE CLAIMS need grounding too: name the metric behind every "wins/loses/leads/trails".',
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

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: any) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      try {
        await ensureColumns();
        emit({ type: 'status', label: 'Loading stored project data', step: 1, steps: 5 });
        const ctx = await buildContext(projectId);
        if ('error' in ctx) { emit({ type: 'error', error: ctx.error }); controller.close(); return; }

        setUsageProject(projectId);
        const client = instrumentAnthropic(new Anthropic({ apiKey }), 'insights');

        emit({ type: 'status', label: 'Collecting data from every panel', step: 2, steps: 5 });
        const { payload: censusPayload } = buildCensus(ctx);
        const groundedPayloads: string[] = [censusPayload];

        const messages: Anthropic.MessageParam[] = [{
          role: 'user',
          content: 'Generate the Insights panel content for this project now.\n\n<data_census>\n' + censusPayload + '\n</data_census>',
        }];

        emit({ type: 'status', label: 'Reading the data across panels', step: 3, steps: 5 });
        let repairs = 0;
        let stored: any = null;
        for (let turn = 0; turn < MAX_TOOL_TURNS && !stored; turn++) {
          const resp: Anthropic.Message = await client.messages.create({
            model: SEER_MODEL,
            max_tokens: 4000,
            system: insightsSystemPrompt(ctx),
            tools: TOOLS,
            messages,
          });
          const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
          const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');

          if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
            const draft = textBlocks.map(b => b.text).join('\n').trim();
            emit({ type: 'status', label: 'Verifying every number against stored data', step: 4, steps: 5 });
            const parsed = parseGenerated(draft);
            const bad = 'blob' in parsed ? findUngrounded(narrativeText(parsed.blob), groundedPayloads.join('\n')) : [];
            const problem = 'parseError' in parsed ? parsed.parseError
              : bad.length > 0 ? ('These numbers do not appear in any tool result: ' + bad.join(', ')) : null;
            if (!problem && 'blob' in parsed) {
              stored = {
                ...parsed.blob,
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
              controller.close();
              return;
            }
            repairs++;
            emit({ type: 'status', label: `Grounding check failed — re-querying (${repairs}/${MAX_REPAIRS})`, step: 4, steps: 5 });
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
            emit({ type: 'status', label: statusLabelFor(tu.name, tu.input), step: 3, steps: 5 });
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
            emit({ type: 'error', error: 'Generation ran out of turns before producing a verified result — nothing was saved. Try again.' });
            controller.close();
            return;
          }
        }

        emit({ type: 'status', label: 'Saving the verified insights', step: 5, steps: 5 });
        const now = new Date();
        await db.update(projects)
          .set({ insightsPanel: stored as any, insightsPanelUpdatedAt: now, updatedAt: now } as any)
          .where(eq(projects.id, projectId));
        emit({ type: 'done', insights: stored, updatedAt: now.toISOString() });
      } catch (e: any) {
        emit({ type: 'error', error: e?.message ?? 'Insights generation failed — try again' });
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
  });
  return new Response(stream, { status: 200, headers: NDJSON_NO_STORE });
}
