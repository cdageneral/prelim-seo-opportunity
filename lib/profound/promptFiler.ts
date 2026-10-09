/**
 * lib/profound/promptFiler.ts — v7.547
 *
 * Files the AI-answer PROMPTS a Profound export tracks (buyer questions, e.g. "which bank
 * lets me open a checking account with no deposit?") into the project's EXISTING stored
 * taxonomy — never a new node (Const III.1e) — so Product Insights can show, per page,
 * the prompts that page should be answering even when the client was never cited.
 *
 * Mirrors lib/category/pendingCategorization.ts (same candidate list, same "0 = no fit"
 * contract, same JSON-only answer) with two differences a question needs:
 *   - the model also returns ITS OWN confidence (0–1) per pick. It is stored as a labelled
 *     LLM estimate and never shown as a data metric (Const III.7); under
 *     ASSIGN_REVIEW_BELOW the assignment lands in Needs Review, not in the counts.
 *   - brand rules are inverted: a prompt is a market question, so naming competitors
 *     ("is Chase or Citi better for travel?") is normal — file by the product the question
 *     is about. Only a question purely about another company's own account/app/login is 0.
 *
 * Pure + dependency-free so the retained suite checks the prompt text, the parser and the
 * status rule without an SDK or a DB.
 */

import type { CandidateCategory } from '@/lib/category/pendingCategorization';
import { ASSIGN_REVIEW_BELOW, type AssignStatus, type PromptAssignment } from '@/lib/profound/pageLinks';

export const PROMPT_FILER_VERSION = 547;
export const PROMPT_FILER_MODEL   = 'claude-sonnet-4-6';   // same model the keyword filer settled on (v7.536)
export const PROMPT_FILER_BATCH   = 40;

export function buildPromptFilerPrompt(domain: string, prompts: string[], candidates: CandidateCategory[], ownBrands: string[] = []): string {
  const cats = candidates.map(c => `${c.n}. ${c.path.join(' > ')}`).join('\n');
  const qs   = prompts.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const own  = ownBrands.length ? ownBrands.join(', ') : domain;
  return `You are filing the questions people ask AI assistants into an EXISTING website taxonomy for ${domain}.
Each question is a prompt an AI answer engine was asked. The taxonomy nodes are the pages ${domain} has or should build.

CATEGORIES (the only allowed answers):
${cats}

QUESTIONS:
${qs}

Rules:
- For each question choose the ONE category whose page would most directly answer it — the product or topic the
  question is about, not a word it shares.
- Questions that compare or name several companies (${own} or competitors) are normal market questions: file them by
  the product they are about.
- Answer 0 ONLY when no category's page could answer the question — a question purely about another company's own
  account, app, login or customer service, or a subject none of the categories covers. When unsure between two
  categories pick the more specific one; when unsure whether anything fits at all, answer 0.
- You may ONLY answer with a category number from the list. Never invent, rename or combine categories.
- With each pick give YOUR confidence from 0 to 1 that the page in that category directly answers the question.
- Answer every question exactly once.

Respond with STRICT JSON only, no prose:
{"a":[[questionNumber,categoryNumber,confidence],...]}`;
}

export interface FilerPick { candidate: CandidateCategory | null; confidence: number }

/** Parse the model's answer. Unanswered / off-list questions stay undefined (retried, never guessed). */
export function parsePromptAssignments(text: string, count: number, candidates: CandidateCategory[]): { picks: Array<FilerPick | undefined>; unanswered: number } {
  const picks: Array<FilerPick | undefined> = new Array(count).fill(undefined);
  const byN = new Map<number, CandidateCategory>();
  for (const c of candidates) byN.set(c.n, c);
  let pairs: any[] = [];
  const cleaned = String(text ?? '').replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  try { const j = JSON.parse(cleaned); pairs = Array.isArray(j?.a) ? j.a : []; }
  catch { const m = cleaned.match(/\{[\s\S]*\}/); if (m) { try { const j = JSON.parse(m[0]); pairs = Array.isArray(j?.a) ? j.a : []; } catch { pairs = []; } } }
  for (const p of pairs) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const qi = Number(p[0]) - 1, ci = Number(p[1]);
    let conf = Number(p[2]);
    if (!Number.isFinite(conf)) conf = 0;
    conf = Math.max(0, Math.min(1, conf));
    if (!Number.isInteger(qi) || qi < 0 || qi >= count) continue;
    if (picks[qi] !== undefined) continue;                  // first answer wins
    if (ci === 0) { picks[qi] = { candidate: null, confidence: conf }; continue; }
    const hit = byN.get(ci);
    if (hit) picks[qi] = { candidate: hit, confidence: conf };
  }
  let unanswered = 0;
  for (const x of picks) if (x === undefined) unanswered++;
  return { picks, unanswered };
}

export function statusFor(pick: FilerPick): AssignStatus {
  if (!pick.candidate) return 'none';
  return pick.confidence < ASSIGN_REVIEW_BELOW ? 'review' : 'assigned';
}

/** The stored assignment for one answered pick. */
export function assignmentFor(pick: FilerPick, filedAt: string, model: string = PROMPT_FILER_MODEL): PromptAssignment {
  return {
    path:       pick.candidate ? pick.candidate.path.slice() : [],
    node:       pick.candidate ? pick.candidate.name : '',
    confidence: Math.round(pick.confidence * 100) / 100,
    status:     statusFor(pick),
    filedAt,
    model,
  };
}
