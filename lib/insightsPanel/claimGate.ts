/**
 * lib/insightsPanel/claimGate.ts — v7.496 · the STANDING-CLAIM gate.
 *
 * The v7.463 number gate proves every digit; adjectives are not digits. On
 * 2026-09-15 the stored Sono Bello thesis opened "owns search rank in its core
 * procedures" over a weighted average position of 32 and a 6th-of-12 page-1
 * capture — the v7.471 prompt rule ("benchmark your adjectives") was a request,
 * not a check. This is the check (the v7.463 lesson: prompt rules are
 * requests; machine checks are guarantees).
 *
 * Pure TypeScript, deterministic, fail-closed like the number gate: a sentence
 * that asserts the CLIENT's strength on the search or AI dimension is rejected
 * unless the client's computed standing on that dimension has at least one
 * measure at 'leads' or 'above'; a sentence asserting the client's weakness is
 * rejected when every measured standing on that dimension is 'leads'. The
 * rejection names the sentence and the standing, and the route sends it back
 * as a repair message. False positives cost one repair turn; a false negative
 * would cost a CEO the truth — the gate leans strict.
 *
 * Scope rules that keep it honest:
 *  - only sentences that mention the client (name, brand root, "the brand") AND
 *    a dimension word (search / AI) are examined;
 *  - the strength/weakness phrase must come AFTER the client mention and BEFORE
 *    any competitor domain mention, so "Sono Bello trails miaaesthetics.com,
 *    which leads page-1 capture" is not a client-strength claim;
 *  - a negation within three words before the phrase ("does not lead", "is not
 *    strong") exempts it;
 *  - content coverage is deliberately NOT a gated dimension — the client may
 *    genuinely lead it while trailing search, and the prompt scopes such praise.
 */

import type { DecisionInputs, StandingWord } from '@/lib/insightsPanel/decision';

export interface ClaimViolation { sentence: string; reason: string }

const STRENGTH = /\b(owns?|dominates?|dominant|dominance|leads?|leading|is (?:the|a) (?:market |category )?leader|strong(?:est)?|ranks? well|ranking well|wins?|winning|commands?|best[- ]in[- ]class|ahead of the field|outperforms?|outranks? the field)\b/i;
// a phrase whose OBJECT is not the client's standing ("strongest rival", "strong demand",
// "leads to") or that is aspirational/conditional ("to become the leader", "if it wins",
// "leader parity") is not a claim about today's standing.
const OBJECT_EXEMPT = /^\s*(rival|rivals|competitor|competitors|demand|market|category|field|volume|signal|signals|opponent|to\b|into\b|with\b|parity|status|position would|\d|the ai overview|the citation|an ai overview|a citation)/i;
const ASPIRATION = /\b(become|becoming|to be|would|could|should|can|reach|reaching|achieve|achieving|path to|toward|towards|if|were to|needs? to|need to|must|target|goal|status|parity|for .{0,30} to)\b/i;
const WEAKNESS = /\b(invisible|absent|nowhere|last|trails?|trailing|weakest|behind the field|loses?|losing|no presence|non[- ]existent)\b/i;
const SEARCH_DIM = /\b(rank|ranks|ranked|ranking|rankings|search|organic|serp|serps|google|page[- ]?1|page one|keyword|keywords|capture|share of voice|top[- ]?3|top three|position|positions)\b/i;
const AI_DIM = /\b(ai|ai answers?|ai visibility|ai overviews?|answer engines?|cited|citations?|citation share|mention|mentions|mentioned|chatgpt|claude|llm|llms|perplexity|gemini)\b/i;
const NEGATION = /\b(not|never|no|neither|nor|without|isn't|doesn't|does not|is not|hasn't|has not|fails? to|cannot|can't|far from|rather than)\b/i;

function splitSentences(text: string): string[] {
  // v7.500 — split on line breaks FIRST. narrativeText joins every blob field
  // with '\n'; the v7.496 splitter collapsed whitespace before splitting, so
  // unpunctuated list items (plays, moves, constraints) fused into one
  // "sentence" and a client mention in one item paired with a phrase in another.
  return text
    .split(/\n+/)
    .flatMap(line => line.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/))
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function clientPatterns(decision: DecisionInputs, clientName: string): RegExp[] {
  const pats: RegExp[] = [];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const name = String(clientName ?? '').trim();
  if (name.length >= 3) pats.push(new RegExp('\\b' + esc(name) + '\\b', 'i'));
  const root = String(decision.clientDomain ?? '').split('.')[0] ?? '';
  if (root.length >= 4) pats.push(new RegExp(esc(root), 'i'));
  if (decision.clientDomain) pats.push(new RegExp(esc(decision.clientDomain), 'i'));
  pats.push(/\b(the brand|the client|you|your)\b/i);
  return pats;
}

function competitorPatterns(decision: DecisionInputs): RegExp[] {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const doms = new Set<string>();
  for (const row of [...decision.standing.search, ...decision.standing.ai]) for (const b of row.brands) if (!b.isClient && b.domain) doms.add(b.domain);
  for (const p of decision.plays) doms.add(p.domain);
  return Array.from(doms).filter(d => d.length >= 4).map(d => new RegExp(esc(d).replace(/\\\./g, '\\.?'), 'i'));
}

function dimensionStanding(decision: DecisionInputs, dim: 'search' | 'ai'): StandingWord[] {
  const rows = dim === 'search' ? decision.standing.search : decision.standing.ai;
  return rows.map(r => r.standing).filter(s => s !== 'unmeasured');
}

function firstIndex(s: string, re: RegExp): number {
  const m = re.exec(s);
  return m ? m.index : -1;
}

function negatedBefore(s: string, idx: number): boolean {
  const before = s.slice(Math.max(0, idx - 40), idx);
  const words = before.trim().split(/\s+/).slice(-3).join(' ');
  return NEGATION.test(words);
}
function aspirationalBefore(s: string, idx: number): boolean {
  const before = s.slice(Math.max(0, idx - 60), idx);
  return ASPIRATION.test(before);
}
function objectExempt(s: string, endIdx: number): boolean {
  return OBJECT_EXEMPT.test(s.slice(endIdx, endIdx + 24));
}

/**
 * v7.500 — which dimension a phrase is ABOUT. The v7.496 gate tagged the whole
 * sentence: any search word anywhere made every strength phrase a search claim,
 * so "Aflac is best-in-class in AI-answer visibility — … below the field average
 * on every organic search metric" was rejected as a SEARCH claim although the
 * client leads both AI measures (2026-09-17, Aflac — three repair rounds, then
 * refused). The phrase is now scoped to its own clause (bounded by , ; : — – ( )
 * and but/while/whereas/yet/although); the dimensions named inside that clause
 * are the ones checked — BOTH when both are named (strict). A clause naming
 * neither falls back to the nearest dimension word in the sentence.
 */
const CLAUSE_BREAK = /[,;:()\u2014\u2013]|\s-\s|\b(?:but|while|whereas|yet|although|though|however)\b/gi;
function clauseAround(s: string, start: number, end: number): [number, number] {
  let lo = 0, hi = s.length;
  const g = new RegExp(CLAUSE_BREAK.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = g.exec(s)) !== null) {
    const a = m.index, b = m.index + m[0].length;
    if (b <= start) lo = Math.max(lo, b);
    else if (a >= end) { hi = Math.min(hi, a); break; }
  }
  return [lo, hi];
}
function allMatches(s: string, re: RegExp): Array<[number, number]> {
  const g = new RegExp(re.source, 'gi');
  const out: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(s)) !== null) { out.push([m.index, m.index + m[0].length]); if (m[0].length === 0) g.lastIndex++; }
  return out;
}
export function claimDimensions(s: string, start: number, end: number): Array<'search' | 'ai'> {
  const [lo, hi] = clauseAround(s, start, end);
  const inClause = (spans: Array<[number, number]>) => spans.some(([a, b]) => a < hi && b > lo);
  const searchSpans = allMatches(s, SEARCH_DIM);
  const aiSpans = allMatches(s, AI_DIM);
  const dims: Array<'search' | 'ai'> = [];
  if (inClause(searchSpans)) dims.push('search');
  if (inClause(aiSpans)) dims.push('ai');
  if (dims.length) return dims;
  const dist = (spans: Array<[number, number]>) => spans.reduce((best, [a, b]) => Math.min(best, b <= start ? start - b : a >= end ? a - end : 0), Infinity);
  const ds = dist(searchSpans), da = dist(aiSpans);
  if (ds === Infinity && da === Infinity) return [];
  if (ds === da) return ['search', 'ai'];
  return ds < da ? ['search'] : ['ai'];
}

/**
 * Returns every sentence whose strength/weakness claim about the client
 * contradicts its computed standing on that dimension. Empty = pass.
 */
export function checkStandingClaims(text: string, decision: DecisionInputs, clientName: string): ClaimViolation[] {
  const out: ClaimViolation[] = [];
  const clientPats = clientPatterns(decision, clientName);
  const compPats = competitorPatterns(decision);
  const searchWords = dimensionStanding(decision, 'search');
  const aiWords = dimensionStanding(decision, 'ai');
  const searchHasStrength = searchWords.some(w => w === 'leads' || w === 'above');
  const aiHasStrength = aiWords.some(w => w === 'leads' || w === 'above');
  const searchAllLeads = searchWords.length > 0 && searchWords.every(w => w === 'leads');
  const aiAllLeads = aiWords.length > 0 && aiWords.every(w => w === 'leads');
  const aiClientZero = decision.standing.ai.some(r => r.client === 0);

  for (const sentence of splitSentences(text)) {
    const s = sentence;
    let clientIdx = -1;
    for (const p of clientPats) { const i = firstIndex(s, p); if (i >= 0 && (clientIdx < 0 || i < clientIdx)) clientIdx = i; }
    if (clientIdx < 0) continue;
    let compIdx = -1;
    for (const p of compPats) { const i = firstIndex(s, p); if (i >= 0 && (compIdx < 0 || i < compIdx)) compIdx = i; }
    const isSearch = SEARCH_DIM.test(s);
    const isAi = AI_DIM.test(s);
    if (!isSearch && !isAi) continue;

    const check = (re: RegExp, kind: 'strength' | 'weakness') => {
      const g = new RegExp(re.source, 'gi');
      let m: RegExpExecArray | null;
      while ((m = g.exec(s)) !== null) {
        const idx = m.index;
        if (idx <= clientIdx) continue;                          // phrase must follow the client mention
        if (compIdx >= 0 && compIdx > clientIdx && idx > compIdx) continue;   // …and precede any competitor mention
        if (negatedBefore(s, idx)) continue;
        if (objectExempt(s, idx + m[0].length)) continue;
        if (kind === 'strength' && aspirationalBefore(s, idx)) continue;
        const dims = claimDimensions(s, idx, idx + m[0].length);
        if (kind === 'strength') {
          if (dims.includes('search') && !searchHasStrength && searchWords.length) {
            out.push({ sentence: s, reason: `claims search strength ("${m[0]}") but the client's search standing is ${Array.from(new Set(searchWords)).join('/')} on every measured search metric` });
            return;
          }
          if (dims.includes('ai') && !aiHasStrength && aiWords.length) {
            out.push({ sentence: s, reason: `claims AI strength ("${m[0]}") but the client's AI standing is ${Array.from(new Set(aiWords)).join('/')} on every measured AI metric` });
            return;
          }
        } else {
          if (dims.includes('search') && searchAllLeads) {
            out.push({ sentence: s, reason: `claims search weakness ("${m[0]}") but the client leads every measured search metric` });
            return;
          }
          if (dims.includes('ai') && aiAllLeads && !aiClientZero) {
            out.push({ sentence: s, reason: `claims AI weakness ("${m[0]}") but the client leads every measured AI metric` });
            return;
          }
        }
      }
    };
    check(STRENGTH, 'strength');
    check(WEAKNESS, 'weakness');
  }
  return out;
}
