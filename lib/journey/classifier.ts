/**
 * lib/journey/classifier.ts — v7.376
 *
 * The journey product/pre-product classifier closure, MOVED VERBATIM out of
 * components/brief/JourneySection.tsx (a 'use client' module) so server code —
 * the assessment-report route — can call the SAME classifier the panels use
 * (Const II.7: one math, no forks). JourneySection imports everything back from
 * here and re-exports its public names, so every existing consumer is untouched.
 * NO LOGIC CHANGES — this file is a pure move.
 */

import { buildCategoryGuard } from '@/lib/category/categoryGuard';   // v7.335 (QC audit B1)

export type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
export type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';
export type JourneyType  = 'pre-product' | 'product';

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_: unknown, j: number) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function extractBrand(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    .replace(/\.(com|net|org|io|co|ca|us|uk|au|gov|edu|biz|info)(\.[a-z]{2})?$/i, '')
    .split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
}

// v7.205: short brand tokens (2–3 chars, e.g. "td") matched on a word boundary;
// long tokens (≥4) keep the original substring/prefix/fuzzy behaviour. MUST stay
// byte-identical to isBrandedKeyword in lib/utils/kwVolume.ts (and the copies in
// KeywordsPanel / ContentMapSection). See that file for the full rationale.
export function isBranded(keyword: string, clientDomain: string, competitorDomains: string[], brandTerms: string[] = []): boolean {
  if (!keyword) return false;
  const kw = keyword.toLowerCase().trim();
  const kwNorm = kw.replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;
  const cleanTerms = brandTerms.map(t => (t ?? '').toLowerCase().trim()).filter(Boolean);
  const brandPhrases = cleanTerms.filter(t => /[\s-]/.test(t));
  const brandWordRoots = cleanTerms.filter(t => !/[\s-]/.test(t)).map(t => t.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  if (brandPhrases.length > 0) {
    const norm = (s: string) => ' ' + s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') + ' ';
    const kwSpaced = norm(kw);
    for (const p of brandPhrases) { const np = norm(p); if (np !== '  ' && kwSpaced.includes(np)) return true; }
  }
  const roots = Array.from(new Set([...[clientDomain, ...competitorDomains].map(extractBrand), ...brandWordRoots])).filter(b => b.length >= 2);
  if (!roots.length) return false;
  const longRoots  = roots.filter(b => b.length >= 4);
  const shortRoots = roots.filter(b => b.length >= 2 && b.length <= 3);

  if (shortRoots.length > 0) {
    const words = kw.split(/\s+/).map((w: string) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
    for (const token of shortRoots) {
      for (const w of words) {
        const i = w.indexOf(token);
        if (i < 0) continue;
        if (i === 0) return true;
        if (i >= 2 && w.length - (i + token.length) >= 2) return true;
      }
      const spaced = token.split('').join('\\s+');
      if (new RegExp(`\\b${spaced}\\b`).test(kw)) return true;
    }
  }

  if (longRoots.length > 0) {
    const tokenSet = new Set<string>(longRoots);
    for (const brand of longRoots) {
      const half = Math.floor(brand.length / 2);
      if (half >= 4) tokenSet.add(brand.slice(0, half));
      if (brand.length - half >= 4) tokenSet.add(brand.slice(half));
    }
    const allTokens = Array.from(tokenSet);
    for (const token of allTokens) {
      if (kwNorm.includes(token)) return true;
      if (token.includes(kwNorm) && kwNorm.length >= 4) return true;
      if (token.length >= 5 && kwNorm.length >= 4 && token.startsWith(kwNorm)) return true;
    }
    const kwWords = kw.split(/\s+/).map((w: string) => w.replace(/[^a-z0-9]/g, '')).filter((w: string) => w.length >= 4);
    for (const word of kwWords) {
      for (const token of allTokens) {
        const minLen = Math.min(word.length, token.length);
        const threshold = Math.max(1, Math.floor(minLen / 4));
        if (Math.abs(word.length - token.length) > threshold + 1) continue;
        if (editDistance(word, token) <= threshold) return true;
      }
    }
  }
  return false;
}

export const TRANSACTIONAL_SIGNALS = [
  'near me','near ','schedule','book ','booking','appointment','consultation',
  'how much does','how much is','how much','cost','price','pricing',
  'financing','payment plan','afford','discount','coupon','deal','specials',
  'locations','location','find a ','get a ',
];
export const COMMERCIAL_SIGNALS = [
  'review','reviews','best ','top ',' vs ','versus','compare','comparison',
  'before after','before and after','results','worth it','pros and cons',
  'alternative','rating','ratings','testimonial','testimonials','complaints',
  'side effects','risks','dangers','safe ','safety',
];
export const INFORMATIONAL_SIGNALS = [
  'what is ','what are ','how does','how do','how to','why ','guide',
  ' tips','recovery','benefits','difference between','types of','explained',
  'overview','about ','definition','learn','understanding','causes','symptoms',
];

export function detectIntent(keyword: string): IntentType {
  const kw = keyword.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (kw.includes(s)) return 'transactional'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (kw.includes(s)) return 'commercial';    }
  for (const s of INFORMATIONAL_SIGNALS) { if (kw.includes(s)) return 'informational'; }
  return 'unmatched';
}

// v7.337 (QC audit — ContentMap v7.336 mirror, Const II.8): matchKeywordToCategory was
// DELETED. It was the lexical shared-word fallback that reconstructed category membership
// by string matching when a keyword had no stored assignment — fabricating memberships the
// stored taxonomy never made (one shared long word was enough). buildClusters and
// buildJourneyClassifier below now use STORED membership only, exactly like
// ContentMapSection.buildClusters since v7.336; with its last call sites gone the
// function itself is dead code and is removed.

// ─── Solution-awareness classification (v7.154) ─────────────────────────────────
//
// The journey split is decided by SOLUTION AWARENESS, not search intent. If a
// keyword names a solution — a procedure, the brand, or a location — the searcher
// already knows the product exists, so it is PRODUCT journey (at whatever funnel
// stage). Only keywords that describe a life-problem/symptom/desire with NO named
// solution are PRE-PRODUCT. This replaces the old intent-dominance rule, which
// wrongly sent informational procedure queries ("what is a breast lift") to
// pre-product even though naming the procedure proves solution awareness.
//
// The hard rule (confirmed with Wayne): a procedure/brand/location cluster is
// ALWAYS product. Anatomy words alone ("breast", "belly", "fat") never signal
// solution awareness — they live in both procedure names and problem searches —
// so cluster membership keys off the distinctive PROCEDURE word ("lift",
// "liposuction", "removal"), never the body part.

// v7.187: the hardcoded cosmetic ANATOMY_WORDS list was REMOVED. It existed to
// strip body parts from procedure names, but it was a single-vertical vocabulary
// that also leaked into the relevance gate and theme namer below, mislabeling
// unrelated terms in non-cosmetic projects. The "distinctive procedure word" of a
// category is now DERIVED from this project's own data (buildProcWordsByCat).

// Commerce/format modifiers that sit inside category names but are not the
// solution itself (so they are stripped when deriving the distinctive word).
// Industry-neutral.
export const PROC_NAME_NOISE = new Set<string>([
  'with','from','that','this','your','near','best','top',
  'cost','costs','price','prices','pricing','reviews','review',
  'services','service','treatment','treatments','procedure','procedures',
  'clinic','center','centre','before','after','results','recovery','specials','financing',
]);

// Generic stop list for tokenizing client/segment language (industry-neutral —
// no vertical vocabulary). Used by every derivation below.
export const GENERIC_STOP = new Set<string>([
  'what','whats','when','where','which','will','would','could','should','about',
  'they','their','them','then','than','this','that','with','from','your','yours',
  'have','having','need','needs','want','wants','looking','search','searches',
  'help','tips','does','done','into','over','more','some','very','just','like',
  'cant','wont','know','make','made','being','been','much','many','good','best',
  'near','area','areas','using','used','also','around','versus',
]);

// Distinctive content tokens of any string (≥4 chars, not generic/commerce noise).
export function tokensOf(text: string): string[] {
  return ((text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w: string) => w.length >= 4 && !GENERIC_STOP.has(w) && !PROC_NAME_NOISE.has(w));
}

// Two tokens "match" if they share a ≥4-char stem (prefix). Lets "invest" match
// "investing"/"investment" (recall) WITHOUT the cross-word substring false matches
// the old whole-string includes() caused (e.g. "arm" inside "pharmacy", "chin"
// inside "matching").
export function tokenMatches(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// v7.187: distinctive procedure word(s) per procedure category, DERIVED from this
// project's data instead of a hardcoded anatomy list. A word qualifies as the
// distinctive solution signal only if it (a) is a real token of the category name,
// (b) is NOT shared by 2+ categories (a shared word can't distinguish them), and
// (c) does NOT appear in the audience's own problem language (so a noun the
// searcher uses to describe the PROBLEM — a body area, an account type, … — is not
// mistaken for naming the SOLUTION). Falls back to all category tokens if the
// filters leave nothing, so the product gate always has a signal.
export function buildProcWordsByCat(
  categories: Array<{ name: string; type: string }>,
  problemLangTokens: Set<string>,
): Map<string, string[]> {
  const freq = new Map<string, number>();
  const perCat = new Map<string, string[]>();
  for (const c of categories) {
    const words = Array.from(new Set(tokensOf(c.name)));
    perCat.set(c.name, words);
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const out = new Map<string, string[]>();
  for (const c of categories) {
    if (c.type !== 'procedure') continue;
    const all = perCat.get(c.name) ?? [];
    const distinctive = all.filter((w: string) => (freq.get(w) ?? 0) < 2 && !problemLangTokens.has(w));
    out.set(c.name, distinctive.length ? distinctive : all);
  }
  return out;
}

// Strict (substring-only) brand match for the solution gate. Reuses the brand
// token derivation from isBranded() but DROPS the fuzzy edit-distance path, which
// otherwise matches anatomy words to brands (e.g. "belly" ~ "bello" in "Sono
// Bello") and would leak problem searches into the product lane.
export function brandTokensOf(clientDomain: string, competitorDomains: string[]): string[] {
  const baseBrands = [clientDomain, ...competitorDomains].map(extractBrand).filter((b: string) => b.length >= 4);
  const set = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
    const half = Math.floor(brand.length / 2);
    if (half >= 4) set.add(brand.slice(0, half));
    if (brand.length - half >= 4) set.add(brand.slice(half));
  }
  return Array.from(set);
}
export function brandedStrict(keyword: string, clientDomain: string, competitorDomains: string[]): boolean {
  const kwNorm = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;
  return brandTokensOf(clientDomain, competitorDomains).some((t: string) => kwNorm.includes(t));
}

// Does this keyword actually NAME the solution for its candidate category?
// brand   -> requires a real brand token (strict substring, no fuzzy match);
// location-> brand token OR an explicit place signal;
// procedure-> requires a distinctive procedure word from the category name.
export function namesSolutionFor(
  keyword: string, catType: string, procWords: string[],
  clientDomain: string, competitorDomains: string[],
): boolean {
  const kwLow = keyword.toLowerCase();
  if (catType === 'brand') return brandedStrict(keyword, clientDomain, competitorDomains);
  if (catType === 'location') {
    const locSigs = ['near me','near ',' in ','location','clinic','center','centre'];
    return brandedStrict(keyword, clientDomain, competitorDomains) || locSigs.some((s: string) => kwLow.includes(s));
  }
  return procWords.some((w: string) => kwLow.includes(w));
}

// ─── v7.187: project-spec problem vocabulary (domain-agnostic) ──────────────────
// Pre-product problem THEMES and the relevance gate are now derived from THIS
// project's own audience language (segment pre-LLM prompts + triggers) plus the
// client's category/brand tokens. The old cosmetic PROBLEM_ANCHORS map ("chin →
// Chin / Neck", "arm → Arm Concerns", …) and the anatomy relevance path were
// REMOVED: their substring matching mislabeled unrelated terms in non-cosmetic
// projects (e.g. "arm" in adjustable-rate mortgage, "chin" inside "matching"). The
// AI naming route (journey-problem-clusters) still supplies human theme names when
// available; these deterministic names are only the fallback.

// Reduce a full pre-LLM prompt to a short problem head term (≤5 words) by stripping
// question scaffolding + generic tails — the SAME reduction the demand-universe
// route uses for its seeds, so the panel and the deep build agree.
export const PROBLEM_LEAD = [
  'how much does a','how much does','how much is a','how much is','how much',
  'how do i','how do you','how can i','how to get rid of','how to lose','how to fix','how to',
  'what is the best','whats the best','what to do about','what is a','what is','what are',
  'why cant i','why wont my','why do i','why is my','why is',
  'best way to','best ways to','ways to','is there a way to','can you','do i need',
  'help with','i have','i want to','i need to','tips for','tips to',
];
export const PROBLEM_TAIL = [' fast',' quickly',' naturally',' at home',' on my own',' for good'];
export const PROBLEM_STOP_HEAD = new Set(['the','a','an','my','your','to','of','for','is','are','do','does','will','can','i','it','that','this']);

export function conciseSeed(prompt: string): string {
  let s = (prompt ?? '').toLowerCase().replace(/["“”?.!]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const lead of PROBLEM_LEAD) { if (s.startsWith(lead + ' ')) { s = s.slice(lead.length).trim(); changed = true; break; } }
  }
  for (const tail of PROBLEM_TAIL) { if (s.endsWith(tail)) s = s.slice(0, s.length - tail.length).trim(); }
  const parts = s.split(' ');
  while (parts.length > 1 && PROBLEM_STOP_HEAD.has(parts[0])) parts.shift();
  return parts.slice(0, 5).join(' ').trim();
}

export interface ProblemVocab { seeds: Array<{ head: string; toks: string[] }>; langTokens: Set<string> }

// Build the project's problem vocabulary from its audience segments.
export function deriveProblemVocab(analysis: any): ProblemVocab {
  const segs: any[] = (analysis?.semrushSnapshot as any)?._audienceSegments ?? [];
  const prompts: string[] = [];
  for (const s of segs) {
    for (const p of (s?.preLLMPrompts ?? [])) prompts.push(String(p ?? ''));
    prompts.push(String(s?.whoTheyAre?.trigger ?? ''));
  }
  const langTokens = new Set<string>();
  for (const p of prompts) for (const t of tokensOf(p)) langTokens.add(t);

  const seedMap = new Map<string, string[]>();
  for (const p of prompts) {
    const head = conciseSeed(p);
    if (!head) continue;
    const toks = tokensOf(head);
    if (toks.length === 0) continue;
    if (!seedMap.has(head)) seedMap.set(head, toks);
  }
  return { seeds: Array.from(seedMap.entries()).map(([head, toks]) => ({ head, toks })), langTokens };
}

export function titleCaseTheme(s: string): string {
  return s.replace(/(^|\s)([a-z0-9])/g, (_m: string, sp: string, c: string) => sp + c.toUpperCase());
}

// Deterministic pre-product theme (fallback when AI naming is unavailable): the
// project's own problem head term whose words best overlap the keyword. Always
// THIS client's language; never a vertical vocabulary. Generic bucket if nothing
// overlaps.
export function deterministicProblemTheme(keyword: string, vocab: ProblemVocab): string {
  const kt = tokensOf(keyword);
  if (kt.length === 0) return 'General Problem Searches';
  let best: string | null = null; let bestScore = 0;
  for (const seed of vocab.seeds) {
    let score = 0;
    for (const w of kt) for (const sw of seed.toks) { if (tokenMatches(w, sw)) { score++; break; } }
    if (score > bestScore) { bestScore = score; best = seed.head; }
  }
  return bestScore > 0 && best ? titleCaseTheme(best) : 'General Problem Searches';
}

// ─── v7.187: client-relevance gate (deterministic, defensible, project-spec) ─────
// A keyword enters the pre-product "problem" pool only if it shares a distinctive
// token with something this client actually owns: its category names, its brand,
// OR its audience's own language (segment prompts + triggers). A keyword that names
// no solution AND shares no token (e.g. "what is a hurricane") is off-topic noise:
// dropped BEFORE clustering. Because this buildClusters is the SAME one the
// Executive Summary consumes, the drop also keeps the rollup clean. No AI, no
// modeling — every drop is explainable by zero token overlap with the client.
export function buildRelevanceTokens(
  categories: Array<{ name: string; type: string }>,
  clientDomain: string,
  competitorDomains: string[],
  problemLangTokens: Set<string>,
): Set<string> {
  const tokens = new Set<string>();
  for (const c of categories) for (const w of tokensOf(c.name)) tokens.add(w);
  for (const t of brandTokensOf(clientDomain, competitorDomains)) { if (t.length >= 4) tokens.add(t); }
  for (const t of Array.from(problemLangTokens)) tokens.add(t);   // the client's own audience language
  return tokens;
}

export function isClientRelevant(keyword: string, relevanceTokens: Set<string>): boolean {
  const rt = Array.from(relevanceTokens);
  for (const w of tokensOf(keyword)) for (const t of rt) { if (tokenMatches(w, t)) return true; }
  return false;
}

export function classifyJourneyType(type: string): JourneyType {
  return type === 'problem' ? 'pre-product' : 'product';
}

// ─── Journey classifier (v7.203) ────────────────────────────────────────────────
// Exported per-keyword classifier so the Theme Clusters panel can split keywords
// into product vs pre-product by SOLUTION AWARENESS using the SAME logic as
// buildClusters' assignment loop (lines below) — the single source of truth, so the
// two panels never disagree. Returns 'offtopic' for a keyword that names no solution
// AND is not client-relevant (the identical drop buildClusters applies). `themeOf`
// names the pre-product life-problem theme (AI assignment if supplied, else the
// deterministic project-spec name). Pure; no AI, no modeling.
export type JourneyClass = JourneyType | 'offtopic';
export function buildJourneyClassifier(
  analysis: any,
  clientDomain: string,
  competitorDomains: string[],
  problemAssignments: Record<string, string> = {},
): { classify: (keyword: string) => JourneyClass; themeOf: (keyword: string) => string } {
  const semSnap = analysis?.semrushSnapshot ?? {};
  const cb = semSnap._categoryBreakdown ?? null;
  // v7.335 (QC audit B1): same shared competitor-brand category guard as buildClusters
  // (Const III.1a) — this `cb.categories` read was unguarded too, so the classifier
  // filed competitor-brand keywords as PRODUCT for its consumers (Keyword + Cluster
  // panels). The client's OWN brand category is kept by the guard; the `storedMap`
  // read is guarded through the `catNames.has(...)` membership check in classify() below.
  const catGuard = buildCategoryGuard(semSnap, clientDomain, competitorDomains);
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? [])
      .filter((c: any) => !catGuard.isCompetitorBrandCategory(String(c?.name ?? ''), c?.type))
      .map((c: any) => ({
        name: c.name,
        type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure' as const,
      }));
  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};
  const vocab = deriveProblemVocab(analysis);
  const relevanceTokens = buildRelevanceTokens(categories, clientDomain, competitorDomains, vocab.langTokens);
  const catNames = new Set(categories.map((c) => c.name));

  function classify(keyword: string): JourneyClass {
    if (categories.length === 0) return 'offtopic';
    const key = keyword.toLowerCase();
    // v7.337 (ContentMap v7.336 mirror, Const II.8): STORED membership only — the lexical
    // shared-word fallback no longer decides membership here (see the deletion note above).
    // A keyword with no stored category flows to the same catch-all as everywhere else:
    // client-relevant → pre-product, otherwise off-topic.
    let cand: string | null = null;
    const stored = storedMap[key];
    if (stored && catNames.has(stored)) cand = stored;
    // v7.248 (Wayne): a keyword that maps to ANY product/service category — by stored
    // membership (Const II.8) or the same name match buildClusters uses — is PRODUCT,
    // full stop. The earlier literal-substring sub-gate (namesSolutionFor) leaked product
    // keywords filed under broadly-named parents (e.g. "Rewards", "Credit Reports & Scores",
    // "Payment & Access") into the pre-product lane; Const III.2a forbids ANY client product
    // or service there, so naming/mapping a product category is decisive.
    if (cand) return 'product';
    // Maps to NO product/service category → eligible for pre-product (a need state / life
    // event / pain point / goal), but only if topically relevant; else off-topic noise.
    return isClientRelevant(keyword, relevanceTokens) ? 'pre-product' : 'offtopic';
  }
  function themeOf(keyword: string): string {
    return problemAssignments[keyword.toLowerCase()] ?? deterministicProblemTheme(keyword, vocab);
  }
  return { classify, themeOf };
}

// ─── Build clusters ───────────────────────────────────────────────────────────

// v7.128 — exported so the Executive Summary can derive its "Journeys" signal
// (stages with client coverage) from the SAME cluster build this panel renders,
// instead of a page1Pct heuristic. Pure function; `claudeAssignments` only
// refines keywords whose intent is 'unmatched', so passing {} yields the
// deterministic default mapping the panel shows before any AI refinement.
