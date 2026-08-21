/**
 * /api/projects/[id]/seer — v7.462 · OrbitIQ Seer  (thin route since v7.471)
 *
 * Natural-language Q&A over THIS project's stored data. The grounding core —
 * context assembly over the guarded chokepoints, the all-panels DATA CENSUS
 * (v7.463), the read-only tool set, and the fail-closed number verifier — now
 * lives in lib/seer/core.ts, shared with the Insights panel generator
 * (v7.471, Const II.7: one basis, no forks). Behaviour of this route is
 * unchanged from v7.464: same tools, same census, same fail-closed gate,
 * same NDJSON streaming contract.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { checkProjectAccess } from '@/lib/auth/access';
import { instrumentAnthropic } from '@/lib/usage/record';
import { setUsageProject } from '@/lib/usage/context';
import {
  buildContext, buildCensus, extractNumberTokens, findUngrounded, capJson,
  TOOLS, runTool, statusLabelFor, systemPrompt, SEER_MODEL,
} from '@/lib/seer/core';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform', 'Content-Type': 'application/x-ndjson' } as const;

const MAX_TOOL_TURNS = 8;
const MAX_HISTORY = 12;           // question/answer turns carried for follow-ups

const PostSchema = z.object({
  question: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).max(MAX_HISTORY).optional(),
  activePanel: z.string().max(80).optional(),   // label of the panel open when asked
}).strict();

// ─── route ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkProjectAccess(params.id);
  if (!gate.ok) {
    return new Response(JSON.stringify({ type: 'error', error: gate.reason ?? 'Access denied' }) + '\n', {
      status: gate.status, headers: NO_STORE,
    });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ type: 'error', error: 'Invalid JSON' }) + '\n', { status: 400, headers: NO_STORE });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ type: 'error', error: 'Invalid body' }) + '\n', { status: 400, headers: NO_STORE });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Honest gap (I.5): not configured — say so, never a silent failure.
    return new Response(JSON.stringify({ type: 'error', error: 'Seer is not configured (ANTHROPIC_API_KEY missing)' }) + '\n', { status: 503, headers: NO_STORE });
  }

  const { question, history = [], activePanel } = parsed.data;
  const projectId = params.id;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: any) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      try {
        emit({ type: 'status', label: 'Loading stored project data' });
        const ctx = await buildContext(projectId);
        if ('error' in ctx) { emit({ type: 'error', error: ctx.error }); controller.close(); return; }

        // Ledger attribution: every instrumented Claude call in this request
        // records under THIS project (fault-tolerant, never blocks the answer).
        setUsageProject(projectId);
        const client = instrumentAnthropic(new Anthropic({ apiKey }), 'seer');

        // v7.463: collect the all-panels census BEFORE the first model turn.
        emit({ type: 'status', label: 'Collecting data from every panel' });
        const { payload: censusPayload } = buildCensus(ctx);
        // Every tool payload of this request — the grounding haystack. The
        // user's own words (question + prior turns) are admissible too: a
        // number the user typed, or one already delivered in a prior verified
        // answer, is not a fabrication.
        const groundedPayloads: string[] = [censusPayload, question, ...history.map(h => h.content)];

        const messages: Anthropic.MessageParam[] = [
          ...history.map(h => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
          { role: 'user', content: question + '\n\n<data_census>\n' + censusPayload + '\n</data_census>' },
        ];

        emit({ type: 'status', label: 'Consulting the data' });
        let answerText = '';
        let repairs = 0;
        const MAX_REPAIRS = 2;
        for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
          const resp: Anthropic.Message = await client.messages.create({
            model: SEER_MODEL,
            max_tokens: 2000,
            system: systemPrompt(ctx, activePanel),
            tools: TOOLS,
            messages,
          });

          const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
          const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');

          if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
            const draft = textBlocks.map(b => b.text).join('\n').trim();
            // ── v7.463 grounding gate: every number must exist in a tool result ──
            const bad = findUngrounded(draft, groundedPayloads.join('\n'));
            if (bad.length === 0 || repairs >= MAX_REPAIRS) {
              answerText = draft;
              if (bad.length > 0) {
                // Two repairs failed — fail CLOSED: never deliver unverified numbers.
                emit({
                  type: 'answer',
                  answer: 'I drafted an answer but could not verify these numbers against the stored data: ' + bad.join(', ') + ' — so I am not showing it (grounding is enforced, not assumed). Try narrowing the question, or ask for the underlying rows directly.',
                  sources: [],
                  refusal: true,
                  verified: 0,
                });
                controller.close();
                return;
              }
              break;
            }
            repairs++;
            emit({ type: 'status', label: 'Grounding check failed — re-querying (' + repairs + '/' + MAX_REPAIRS + ')' });
            messages.push({ role: 'assistant', content: draft });
            messages.push({
              role: 'user',
              content: 'GROUNDING CHECK FAILED. These numbers in your draft do not appear in any tool result from this conversation: ' + bad.join(', ') + '. Re-query the tools to obtain real stored values, or rewrite the answer without those numbers. Never estimate and never compute your own aggregates.',
            });
            continue;
          }

          messages.push({ role: 'assistant', content: resp.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            emit({ type: 'status', label: statusLabelFor(tu.name, tu.input) });
            let out: any;
            try { out = runTool(ctx, tu.name, tu.input); }
            catch (e: any) { out = { error: `Tool failed: ${e?.message ?? 'unknown'}` }; }
            const payload = capJson(out);
            groundedPayloads.push(payload);
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: payload });
          }
          messages.push({ role: 'user', content: results });

          if (turn === MAX_TOOL_TURNS - 1) {
            // Out of turns — one final no-tools call so the user always gets a
            // grounded answer from what was gathered, never a dead end.
            emit({ type: 'status', label: 'Writing the answer' });
            const fin: Anthropic.Message = await client.messages.create({
              model: SEER_MODEL,
              max_tokens: 2000,
              system: systemPrompt(ctx, activePanel) + '\nYou have used all tool calls. Answer now from what you have gathered; if something is still unknown, say so honestly.',
              messages,
            });
            answerText = fin.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
          }
        }

        // Final gate for the out-of-turns path (the break path was already gated).
        const finalBad = findUngrounded(answerText, groundedPayloads.join('\n'));
        if (finalBad.length > 0) {
          emit({
            type: 'answer',
            answer: 'I drafted an answer but could not verify these numbers against the stored data: ' + finalBad.join(', ') + ' — so I am not showing it (grounding is enforced, not assumed). Try narrowing the question, or ask for the underlying rows directly.',
            sources: [],
            refusal: true,
            verified: 0,
          });
          controller.close();
          return;
        }

        // Parse the trailing SOURCES line into chips.
        let sources: string[] = [];
        const m = answerText.match(/\nSOURCES:\s*(.+)\s*$/i) ?? answerText.match(/^SOURCES:\s*(.+)\s*$/im);
        if (m) {
          sources = m[1].split('|').map(s => s.trim()).filter(Boolean);
          answerText = answerText.replace(m[0], '').trim();
        }
        const refusal = /^\s*\[NOT-IN-STORED-DATA\]/.test(answerText);
        if (refusal) answerText = answerText.replace(/^\s*\[NOT-IN-STORED-DATA\]\s*/, '').trim();

        emit({
          type: 'answer',
          answer: answerText || 'No answer was produced — try rephrasing the question.',
          sources,
          refusal,
          // real count of numeric tokens checked and found in tool results (IV/I.1: measured, not asserted)
          verified: extractNumberTokens(answerText).length,
        });
      } catch (e: any) {
        emit({ type: 'error', error: e?.message ?? 'Seer failed — try again' });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, { status: 200, headers: NO_STORE });
}

