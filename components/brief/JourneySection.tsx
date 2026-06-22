'use client';

import { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  buildTopicJourneyGraph,
  STEP_ORDER,
  STEP_LABEL,
  SUPPORT_LABEL,
  type JourneyGraph as JGraph,
  type GraphNode as JGNode,
  type EdgeKind as JEdgeKind,
  type StepFacet,
} from '@/lib/journey/graph';
import { filterUniverseExcludedBrands } from '@/lib/utils/kwVolume';   // v7.208: competitor-brand blocklist on the demand lens

// SSR-safe layout effect (avoids the useLayoutEffect-on-server warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ─── Types ────────────────────────────────────────────────────────────────────

type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';
type JourneyType  = 'pre-product' | 'product';

interface KwItem {
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  isGap:        boolean;
  competitor:   string | null;
}

interface IntentCluster {
  intent:           IntentType;
  stage:            JourneyStage;
  keywords:         KwItem[];
  totalVolume:      number;
  clientVolume:     number;
  competitorVolume: number;
}

interface ThemeCluster {
  id:          string;
  name:        string;
  type:        'procedure' | 'brand' | 'location' | 'problem';   // v7.154: 'problem' = pre-product life-problem theme
  journeyType: JourneyType;
  keywords:    KwItem[];
  totalVolume: number;
  subClusters: IntentCluster[];
}

interface AudienceSegment {
  id:              string;
  name:            string;
  tagline:         string;
  volumePct:       number;
  personaImageUrl?: string;   // v7.149 portrait — carried into Journeys (v7.152)
  whoTheyAre:      { demographics: string; trigger: string; influencerRole?: string };
  preLLMPrompts:   string[];
  productPrompts:  string[];
}

interface Props {
  projectId:   string;
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  analysis:    any;
  competitors: string[];
  // v7.211: canonical cluster topics from the page (ThemeClustersPanel.buildCanonicalClusterTopics).
  // When present, the journey shows ONE NODE PER CLUSTER so "Topics in journey" reconciles
  // to the cluster count (Const II.7/III.4). Passed as a prop because JourneySection can't
  // import ThemeClustersPanel (that module imports this one — would be a cycle).
  canonicalTopics?: CanonicalJourneyTopic[];
  // v7.222: fired after a deep-journey build finishes + is persisted, so the page can
  // refetch the analysis snapshot (now carrying _demandUniverse) and refresh the
  // Keyword / Clusters / Content panels in one step — no manual reload (Const II.4 loop).
  onDeepJourneyBuilt?: () => void;
}

// Structural shape of a ThemeClustersPanel `Topic` — kept local so there's no import.
interface CanonicalJourneyTopic {
  id:          string;
  parentName:  string;
  parentType:  'procedure' | 'brand' | 'location' | 'demand' | 'problem';
  product:     string;
  pageUrl?:    string;
  stage:       JourneyStage;
  totalVolume: number;
  keywords: Array<{ keyword: string; searchVolume: number; position: number | null; isGap: boolean; origin?: 'footprint' | 'demand' }>;
}

// v7.211: how dense an edge mesh we'll compute before skipping cross-node edges. The
// within-theme edge builder is O(n²); at one-node-per-cluster scale (thousands) that
// would hang the panel, so above this many nodes we render nodes without the mesh
// (the funnel-column layout still reads left→right). Nodes themselves are uncapped.
const MAX_EDGE_MESH_NODES = 300;

// v7.211: adapt the canonical cluster topics into journey nodes — one node per cluster.
function nodesFromCanonical(topics: CanonicalJourneyTopic[]): JourneyNode[] {
  const out: JourneyNode[] = [];
  for (const t of topics) {
    const lane: JourneyType = t.parentType === 'problem' ? 'pre-product' : 'product';
    const fp = t.keywords.filter(k => k.origin !== 'demand');
    const clientRanked = fp.filter(k => !k.isGap && k.position !== null);
    const gaps = t.keywords.filter(k => k.isGap);
    const clientVol = clientRanked.reduce((s, k) => s + k.searchVolume, 0);
    const compVol = gaps.reduce((s, k) => s + k.searchVolume, 0);
    const state: NodeState = (clientRanked.length > 0 || !!t.pageUrl) ? 'existing' : (compVol > 0 ? 'competitor' : 'missing');
    const sorted = t.keywords.slice().sort((a, b) => b.searchVolume - a.searchVolume);
    const keywords: NodeKw[] = sorted.map(k => ({
      keyword: k.keyword, volume: k.searchVolume, rank: k.position,
      state: (k.isGap ? 'competitor' : (k.position !== null ? 'existing' : 'missing')) as NodeState,
    }));
    out.push({
      id: t.id, name: t.product, lane, stage: t.stage,
      col: JOURNEY_STAGE_ORDER.indexOf(t.stage), state,
      totalVol: t.totalVolume, clientVol, compVol, kwCount: t.keywords.length,
      sampleKws: sorted.slice(0, 8).map(k => k.keyword), keywords,
    });
  }
  return out;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNEY_STAGE_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
const JOURNEY_STAGE_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};
const STAGE_COLORS: Record<JourneyStage, { border: string; text: string; bg: string }> = {
  awareness:     { border: 'var(--c-22d3ee)', text: 'var(--c-22d3ee)', bg: 'var(--ca-34-211-238-0_06)'  },
  consideration: { border: 'var(--c-a78bfa)', text: 'var(--c-a78bfa)', bg: 'var(--ca-167-139-250-0_06)' },
  decision:      { border: 'var(--c-34d399)', text: 'var(--c-34d399)', bg: 'var(--ca-52-211-153-0_06)'  },
  retention:     { border: 'var(--c-f59e0b)', text: 'var(--c-f59e0b)', bg: 'var(--ca-245-158-11-0_06)'  },
};

const SEGMENT_ACCENTS = [
  { border: 'var(--c-22d3ee)', text: 'var(--c-22d3ee)', bg: 'var(--ca-34-211-238-0_08)'  },
  { border: 'var(--c-a78bfa)', text: 'var(--c-a78bfa)', bg: 'var(--ca-167-139-250-0_08)' },
  { border: 'var(--c-f59e0b)', text: 'var(--c-f59e0b)', bg: 'var(--ca-245-158-11-0_08)'  },
];

const INTENT_META: Record<IntentType, { stage: JourneyStage }> = {
  informational: { stage: 'awareness'     },
  commercial:    { stage: 'consideration' },
  transactional: { stage: 'decision'      },
  navigational:  { stage: 'retention'     },
  unmatched:     { stage: 'awareness'     },
};

// ─── Branded detection helpers ────────────────────────────────────────────────

function editDistance(a: string, b: string): number {
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

function extractBrand(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    .replace(/\.(com|net|org|io|co|ca|us|uk|au|gov|edu|biz|info)(\.[a-z]{2})?$/i, '')
    .split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
}

// v7.205: short brand tokens (2–3 chars, e.g. "td") matched on a word boundary;
// long tokens (≥4) keep the original substring/prefix/fuzzy behaviour. MUST stay
// byte-identical to isBrandedKeyword in lib/utils/kwVolume.ts (and the copies in
// KeywordsPanel / ContentMapSection). See that file for the full rationale.
function isBranded(keyword: string, clientDomain: string, competitorDomains: string[], brandTerms: string[] = []): boolean {
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

const TRANSACTIONAL_SIGNALS = [
  'near me','near ','schedule','book ','booking','appointment','consultation',
  'how much does','how much is','how much','cost','price','pricing',
  'financing','payment plan','afford','discount','coupon','deal','specials',
  'locations','location','find a ','get a ',
];
const COMMERCIAL_SIGNALS = [
  'review','reviews','best ','top ',' vs ','versus','compare','comparison',
  'before after','before and after','results','worth it','pros and cons',
  'alternative','rating','ratings','testimonial','testimonials','complaints',
  'side effects','risks','dangers','safe ','safety',
];
const INFORMATIONAL_SIGNALS = [
  'what is ','what are ','how does','how do','how to','why ','guide',
  ' tips','recovery','benefits','difference between','types of','explained',
  'overview','about ','definition','learn','understanding','causes','symptoms',
];

function detectIntent(keyword: string): IntentType {
  const kw = keyword.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (kw.includes(s)) return 'transactional'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (kw.includes(s)) return 'commercial';    }
  for (const s of INFORMATIONAL_SIGNALS) { if (kw.includes(s)) return 'informational'; }
  return 'unmatched';
}

function matchKeywordToCategory(
  keyword: string,
  categories: Array<{ name: string; type: string }>,
  clientDomain: string,
  competitorDomains: string[],
): string | null {
  const kwLow = keyword.toLowerCase();
  for (const cat of categories) {
    if (cat.type === 'brand' && isBranded(keyword, clientDomain, competitorDomains)) return cat.name;
    if (cat.type === 'location') {
      const locSigs = ['near me','near ',' in ','location','clinic','center'];
      if (isBranded(keyword, clientDomain, competitorDomains) && locSigs.some((s: string) => kwLow.includes(s))) return cat.name;
    }
  }
  for (const cat of categories) {
    if (cat.type !== 'procedure') continue;
    const catWords = cat.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w: string) => w.length >= 4 && !['with','from','that','this','body','area'].includes(w));
    for (const w of catWords) { if (kwLow.includes(w)) return cat.name; }
  }
  return null;
}

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
const PROC_NAME_NOISE = new Set<string>([
  'with','from','that','this','your','near','best','top',
  'cost','costs','price','prices','pricing','reviews','review',
  'services','service','treatment','treatments','procedure','procedures',
  'clinic','center','centre','before','after','results','recovery','specials','financing',
]);

// Generic stop list for tokenizing client/segment language (industry-neutral —
// no vertical vocabulary). Used by every derivation below.
const GENERIC_STOP = new Set<string>([
  'what','whats','when','where','which','will','would','could','should','about',
  'they','their','them','then','than','this','that','with','from','your','yours',
  'have','having','need','needs','want','wants','looking','search','searches',
  'help','tips','does','done','into','over','more','some','very','just','like',
  'cant','wont','know','make','made','being','been','much','many','good','best',
  'near','area','areas','using','used','also','around','versus',
]);

// Distinctive content tokens of any string (≥4 chars, not generic/commerce noise).
function tokensOf(text: string): string[] {
  return ((text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w: string) => w.length >= 4 && !GENERIC_STOP.has(w) && !PROC_NAME_NOISE.has(w));
}

// Two tokens "match" if they share a ≥4-char stem (prefix). Lets "invest" match
// "investing"/"investment" (recall) WITHOUT the cross-word substring false matches
// the old whole-string includes() caused (e.g. "arm" inside "pharmacy", "chin"
// inside "matching").
function tokenMatches(a: string, b: string): boolean {
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
function buildProcWordsByCat(
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
function brandTokensOf(clientDomain: string, competitorDomains: string[]): string[] {
  const baseBrands = [clientDomain, ...competitorDomains].map(extractBrand).filter((b: string) => b.length >= 4);
  const set = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
    const half = Math.floor(brand.length / 2);
    if (half >= 4) set.add(brand.slice(0, half));
    if (brand.length - half >= 4) set.add(brand.slice(half));
  }
  return Array.from(set);
}
function brandedStrict(keyword: string, clientDomain: string, competitorDomains: string[]): boolean {
  const kwNorm = keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;
  return brandTokensOf(clientDomain, competitorDomains).some((t: string) => kwNorm.includes(t));
}

// Does this keyword actually NAME the solution for its candidate category?
// brand   -> requires a real brand token (strict substring, no fuzzy match);
// location-> brand token OR an explicit place signal;
// procedure-> requires a distinctive procedure word from the category name.
function namesSolutionFor(
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
const PROBLEM_LEAD = [
  'how much does a','how much does','how much is a','how much is','how much',
  'how do i','how do you','how can i','how to get rid of','how to lose','how to fix','how to',
  'what is the best','whats the best','what to do about','what is a','what is','what are',
  'why cant i','why wont my','why do i','why is my','why is',
  'best way to','best ways to','ways to','is there a way to','can you','do i need',
  'help with','i have','i want to','i need to','tips for','tips to',
];
const PROBLEM_TAIL = [' fast',' quickly',' naturally',' at home',' on my own',' for good'];
const PROBLEM_STOP_HEAD = new Set(['the','a','an','my','your','to','of','for','is','are','do','does','will','can','i','it','that','this']);

function conciseSeed(prompt: string): string {
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

interface ProblemVocab { seeds: Array<{ head: string; toks: string[] }>; langTokens: Set<string> }

// Build the project's problem vocabulary from its audience segments.
function deriveProblemVocab(analysis: any): ProblemVocab {
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

function titleCaseTheme(s: string): string {
  return s.replace(/(^|\s)([a-z0-9])/g, (_m: string, sp: string, c: string) => sp + c.toUpperCase());
}

// Deterministic pre-product theme (fallback when AI naming is unavailable): the
// project's own problem head term whose words best overlap the keyword. Always
// THIS client's language; never a vertical vocabulary. Generic bucket if nothing
// overlaps.
function deterministicProblemTheme(keyword: string, vocab: ProblemVocab): string {
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
function buildRelevanceTokens(
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

function isClientRelevant(keyword: string, relevanceTokens: Set<string>): boolean {
  const rt = Array.from(relevanceTokens);
  for (const w of tokensOf(keyword)) for (const t of rt) { if (tokenMatches(w, t)) return true; }
  return false;
}

function classifyJourneyType(type: string): JourneyType {
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
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? []).map((c: any) => ({
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
    // Candidate solution category: trust the server map first, then the name heuristic
    // (identical order to buildClusters).
    let cand: string | null = null;
    const stored = storedMap[key];
    if (stored && catNames.has(stored)) cand = stored;
    else {
      const matched = matchKeywordToCategory(keyword, categories, clientDomain, competitorDomains);
      if (matched && catNames.has(matched)) cand = matched;
    }
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
export function buildClusters(
  analysis: any,
  claudeAssignments: Record<string, IntentType>,
  clientDomain: string,
  competitorDomains: string[],
  uploadedKeywords: any[] = [],
  problemAssignments: Record<string, string> = {},   // v7.154: kw -> pre-product theme name (AI-named; {} = deterministic)
): ThemeCluster[] {
  const semSnap = analysis?.semrushSnapshot ?? {};
  const cb = semSnap._categoryBreakdown ?? null;
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? []).map((c: any) => ({
      name: c.name,
      type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure' as const,
    }));
  if (!categories.length) return [];

  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};

  // Respect the blocked list — same keywords hidden in KeywordsPanel hide from clusters too
  const blockedSet = new Set(
    uploadedKeywords
      .filter((k: any) => k.source === 'blocked')
      .map((k: any) => (k.keyword ?? '').toLowerCase())
  );

  const pool: KwItem[] = [];
  for (const kw of (semSnap.topKeywords ?? [])) {
    const kwLow = (kw.keyword ?? '').toLowerCase();
    if (blockedSet.has(kwLow)) continue;
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: kw.position ?? null, isGap: false, competitor: null });
  }
  const seen = new Set(pool.map((k: KwItem) => k.keyword.toLowerCase()));
  for (const kw of (semSnap.gapKeywords ?? [])) {
    const kwLow = (kw.keyword ?? '').toLowerCase();
    if (blockedSet.has(kwLow) || seen.has(kwLow)) continue;
    seen.add(kwLow);
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: null, isGap: true, competitor: (kw as any).competitor ?? null });
  }
  // Uploaded/CSV keywords from DB — no cap, full set
  for (const kw of uploadedKeywords.filter((k: any) => k.source !== 'blocked')) {
    const kwLow = (kw.keyword ?? '').toLowerCase();
    if (!kwLow || seen.has(kwLow)) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      kw.keyword,
      searchVolume: kw.search_volume ?? kw.searchVolume ?? 0,
      position:     kw.position ?? null,
      isGap:        kw.type === 'gap',
      competitor:   null,
    });
  }

  // ── Assign keywords by SOLUTION AWARENESS (v7.154 / v7.187) ───────────────────
  // v7.187: problem vocabulary is derived from THIS project's audience language.
  const vocab = deriveProblemVocab(analysis);
  // Distinctive procedure word(s) per procedure category, used to decide whether
  // a keyword actually names the procedure (product) or only the problem. Now
  // data-derived (drops words shared across categories or used in problem language).
  const procWordsByCat = buildProcWordsByCat(categories, vocab.langTokens);

  const catMap = new Map<string, KwItem[]>();
  categories.forEach((c: { name: string; type: string }) => catMap.set(c.name, []));
  const problemPool: KwItem[] = [];   // keywords that name NO solution -> pre-product
  // v7.187: vocabulary the client actually owns (categories + brand + audience
  // language) — drives the relevance gate below.
  const relevanceTokens = buildRelevanceTokens(categories, clientDomain, competitorDomains, vocab.langTokens);

  for (const kw of pool) {
    const key = kw.keyword.toLowerCase();
    // Candidate solution category: trust the server map first, then the name heuristic.
    let cand: string | null = null;
    const stored = storedMap[key];
    if (stored && catMap.has(stored)) cand = stored;
    else {
      const matched = matchKeywordToCategory(kw.keyword, categories, clientDomain, competitorDomains);
      if (matched && catMap.has(matched)) cand = matched;
    }
    if (cand) {
      const catType = categories.find((c: { name: string }) => c.name === cand)!.type;
      const procWords = procWordsByCat.get(cand) ?? [];
      if (namesSolutionFor(kw.keyword, catType, procWords, clientDomain, competitorDomains)) { catMap.get(cand)!.push(kw); continue; }
    }
    // No named solution — including keywords the server filed under a procedure
    // that only describe the life-problem ("my breasts are small") — go pre-product,
    // BUT only if topically relevant to the client (v7.173). Off-topic noise (no
    // anchor, no body area, no category/brand token) is dropped from the demand
    // universe so it can't pollute the catch-all bucket or the exec-summary rollup.
    if (isClientRelevant(kw.keyword, relevanceTokens)) problemPool.push(kw);
  }

  // Group the pre-product keywords into life-problem themes. AI names them when
  // problemAssignments is supplied; otherwise a project-spec deterministic name.
  const problemGroups = new Map<string, KwItem[]>();
  for (const kw of problemPool) {
    const theme = problemAssignments[kw.keyword.toLowerCase()] ?? deterministicProblemTheme(kw.keyword, vocab);
    if (!problemGroups.has(theme)) problemGroups.set(theme, []);
    problemGroups.get(theme)!.push(kw);
  }

  // Shared intent -> stage sub-cluster builder (volume math unchanged from prior
  // versions; reused for both product categories and pre-product problem themes).
  function buildSub(kws: KwItem[], isBrandCat: boolean): IntentCluster[] {
    const intentBuckets = new Map<IntentType, KwItem[]>();
    (['informational','commercial','transactional','navigational','unmatched'] as IntentType[]).forEach((i: IntentType) => intentBuckets.set(i, []));
    for (const kw of kws) {
      if (isBrandCat && isBranded(kw.keyword, clientDomain, competitorDomains)) {
        intentBuckets.get('navigational')!.push(kw); continue;
      }
      const sig = detectIntent(kw.keyword);
      const intent: IntentType = sig !== 'unmatched' ? sig : (claudeAssignments[kw.keyword.toLowerCase()] ?? 'unmatched');
      intentBuckets.get(intent)!.push(kw);
    }
    const subClusters: IntentCluster[] = [];
    Array.from(intentBuckets.entries()).forEach(([intent, items]: [IntentType, KwItem[]]) => {
      if (!items.length) return;
      subClusters.push({
        intent,
        stage: INTENT_META[intent].stage,
        keywords: items,
        totalVolume: items.reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        clientVolume: items.filter((k: KwItem) => k.position !== null && k.position <= 10).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        competitorVolume: items.filter((k: KwItem) => k.isGap).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
      });
    });
    return subClusters;
  }

  const result: ThemeCluster[] = [];

  // Product clusters (procedure / brand / location) — always product journey.
  for (const cat of categories) {
    const kws = catMap.get(cat.name) ?? [];
    if (!kws.length) continue;
    const totalVolume = kws.reduce((s: number, k: KwItem) => s + k.searchVolume, 0);
    const subClusters = buildSub(kws, cat.type === 'brand');
    result.push({ id: cat.name, name: cat.name, type: cat.type, journeyType: classifyJourneyType(cat.type), keywords: kws, totalVolume, subClusters });
  }

  // Pre-product clusters (life-problem themes) — always pre-product journey.
  for (const [theme, kws] of Array.from(problemGroups.entries())) {
    if (!kws.length) continue;
    const totalVolume = kws.reduce((s: number, k: KwItem) => s + k.searchVolume, 0);
    const subClusters = buildSub(kws, false);
    result.push({ id: theme, name: theme, type: 'problem', journeyType: 'pre-product', keywords: kws, totalVolume, subClusters });
  }

  result.sort((a, b) => {
    const order: Record<string, number> = { problem: 0, procedure: 1, brand: 2, location: 3 };
    return (order[a.type] - order[b.type]) || (b.totalVolume - a.totalVolume);
  });
  return result;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function pctOf(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

function inferStageFromPrompt(text: string): JourneyStage {
  const t = text.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (t.includes(s)) return 'decision'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (t.includes(s)) return 'consideration'; }
  for (const s of INFORMATIONAL_SIGNALS) { if (t.includes(s)) return 'awareness'; }
  return 'awareness';
}

// ─── Mind-map node model (v7.152) ───────────────────────────────────────────────

type NodeState = 'existing' | 'missing' | 'competitor';

const STATE_COLOR: Record<NodeState, string> = {
  existing:   'var(--c-34d399)',
  missing:    'var(--c-f87171)',
  competitor: 'var(--c-a78bfa)',
};
const STATE_LABEL: Record<NodeState, string> = {
  existing:   'Existing content',
  missing:    'Missing',
  competitor: 'Competitor only',
};

// v7.188: per-keyword detail carried on each node so the detail panel can show
// volume + the client's live rank for every keyword in the cluster.
interface NodeKw {
  keyword: string;
  volume:  number;
  rank:    number | null;   // client SERP position when ranked, else null
  state:   NodeState;       // existing (client ranks) | competitor | missing
}

interface JourneyNode {
  id:        string;
  name:      string;
  lane:      JourneyType;
  stage:     JourneyStage;
  col:       number;
  state:     NodeState;
  totalVol:  number;
  clientVol: number;
  compVol:   number;
  kwCount:   number;
  sampleKws: string[];
  keywords:  NodeKw[];   // v7.188: full member keyword list (volume + rank), volume-sorted
}

function clusterDominantStage(c: ThemeCluster): JourneyStage {
  const volByStage: Record<JourneyStage, number> = { awareness: 0, consideration: 0, decision: 0, retention: 0 };
  for (const sc of c.subClusters) volByStage[sc.stage] += sc.totalVolume;
  let best: JourneyStage = 'awareness'; let bv = -1;
  for (const s of JOURNEY_STAGE_ORDER) { if (volByStage[s] > bv) { bv = volByStage[s]; best = s; } }
  return best;
}

function clusterToNode(c: ThemeCluster): JourneyNode {
  const clientVol = c.subClusters.reduce((s: number, sc: IntentCluster) => s + sc.clientVolume, 0);
  const compVol   = c.subClusters.reduce((s: number, sc: IntentCluster) => s + sc.competitorVolume, 0);
  const state: NodeState = clientVol > 0 ? 'existing' : (compVol > 0 ? 'competitor' : 'missing');
  const stage = clusterDominantStage(c);
  const sortedKws = c.keywords.slice().sort((a: KwItem, b: KwItem) => b.searchVolume - a.searchVolume);
  const sampleKws = sortedKws.slice(0, 6).map((k: KwItem) => k.keyword);
  // v7.188: carry the full keyword list with the client's rank (position) so the
  // detail panel shows volume + rank per keyword. position<=100 from the footprint;
  // a gap keyword (competitor-only) has no client rank.
  const keywords: NodeKw[] = sortedKws.map((k: KwItem) => ({
    keyword: k.keyword,
    volume:  k.searchVolume,
    rank:    (k.position != null && k.position > 0) ? k.position : null,
    state:   (k.position != null && k.position > 0) ? 'existing' : (k.isGap ? 'competitor' : 'missing'),
  }));
  return {
    id: c.id, name: c.name, lane: c.journeyType, stage,
    col: JOURNEY_STAGE_ORDER.indexOf(stage), state,
    totalVol: c.totalVolume, clientVol, compVol,
    kwCount: c.keywords.length, sampleKws, keywords,
  };
}

// Deterministic fallback when AI edge inference is unavailable: link every node
// to all nodes in the next OCCUPIED funnel column (awareness → … → retention).
// v7.189: RETIRED as the fallback — this all-to-all column mesh is exactly what
// made every footprint topic appear to route into a lone decision-stage theme
// ("everything → precious metals"). Kept only for reference; sharedThemeEdges is
// the fallback now.
function stageOrderEdges(nodes: JourneyNode[]): [string, string][] {
  const byCol: Record<number, JourneyNode[]> = {};
  nodes.forEach((n: JourneyNode) => { (byCol[n.col] = byCol[n.col] || []).push(n); });
  const cols = Object.keys(byCol).map(Number).sort((a: number, b: number) => a - b);
  const edges: [string, string][] = [];
  for (let i = 0; i < cols.length - 1; i++) {
    for (const a of byCol[cols[i]]) for (const b of byCol[cols[i + 1]]) edges.push([a.id, b.id]);
  }
  return edges;
}

// v7.189: footprint themes are independent subjects. Link two themes ONLY on REAL
// overlap — a shared member keyword, or ≥2 shared distinctive name tokens — so a
// theme that happens to sit alone in the decision column no longer collects a false
// arrow from every other topic. Most distinct themes end up with no edge, which is
// correct: in footprint mode each topic is its own node until the deep journey is
// built (which expands each into a full multi-step journey).
function sharedThemeEdges(nodes: JourneyNode[]): [string, string][] {
  const out: [string, string][] = [];
  const kwsets = nodes.map((n: JourneyNode) => new Set(n.keywords.map((k: NodeKw) => k.keyword.toLowerCase())));
  const toksets = nodes.map((n: JourneyNode) => new Set(tokensOf(n.name)));
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    let shareKw = false;
    const ka = Array.from(kwsets[a]);
    for (let i = 0; i < ka.length; i++) if (kwsets[b].has(ka[i])) { shareKw = true; break; }
    let shTok = 0;
    if (!shareKw) { const tb = Array.from(toksets[b]); for (let i = 0; i < tb.length; i++) if (toksets[a].has(tb[i])) shTok++; }
    if (shareKw || shTok >= 2) out.push([nodes[a].id, nodes[b].id]);
  }
  return out;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Demand universe (v7.155) ───────────────────────────────────────────────────
//
// When the on-demand "Build deep journey" expansion has run, the journey is built
// from the DEMAND UNIVERSE (Semrush phrase_questions + phrase_related, every topic
// carrying a real monthly search volume) instead of only the ranking footprint.
// Nodes are theme × funnel stage, so each theme shows its full discovery→decision
// depth. The client/competitor ranking footprint is overlaid as coverage state.

interface DemandTopic {
  keyword:      string;
  searchVolume: number;
  seeds:        string[];
  reports?:     string[];
  laneHint?:    'product' | 'problem';
}
interface DemandUniverse {
  topics:       DemandTopic[];
  productSeeds?: string[];
  problemSeeds?: string[];
  builtAt?:     string;
  topicCount?:  number;
  seedCount?:   number;
  database?:    string;
  status?:      string;
  engine?:      string;   // v7.187: build-engine tag for stale-universe invalidation
}

function titleCaseSeed(s: string): string {
  return s.replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// v7.157: the built demand universe is persisted server-side on the analysis
// snapshot, but the Journey panel is conditionally mounted (unmounts on tab
// change) and the parent's `analysis` prop isn't refetched in-session — so on
// remount the freshly-built universe was lost. Resolve from the server snapshot
// first (source of truth on a fresh page load), then fall back to a localStorage
// cache written at build time, mirroring the journey-edges / problem caches.
// v7.187: cache key carries the engine version so a universe built by the old
// (cosmetic-hardcoded) engine is never re-read from localStorage.
const DEMAND_ENGINE = 'demand-v2';
const demandCacheKey = (analysis: any): string => `orbitiq-demand-${DEMAND_ENGINE}-${analysis?.id ?? 'none'}`;

// v7.187: a universe is only valid if it was built by the current engine. Older
// persisted universes (no engine tag, or a different one) carried another vertical's
// seeds — we ignore them so the panel falls back to the footprint view and the user
// can rebuild a clean, project-spec deep journey.
function isCurrentEngine(u: any): boolean {
  return !!u && u.engine === DEMAND_ENGINE;
}

function readDemandCache(analysis: any): DemandUniverse | null {
  const fromSnap = (analysis?.semrushSnapshot as any)?._demandUniverse ?? null;
  if (isCurrentEngine(fromSnap)) return fromSnap;
  if (typeof window === 'undefined' || !analysis?.id) return null;
  try {
    const c = window.localStorage.getItem(demandCacheKey(analysis));
    const parsed = c ? (JSON.parse(c) as DemandUniverse) : null;
    return isCurrentEngine(parsed) ? parsed : null;
  } catch { return null; }
}

// Client/competitor ranking sets (lowercased keywords) for the coverage overlay.
function buildFootprintSets(analysis: any, uploaded: any[]): { client: Set<string>; competitor: Set<string> } {
  const snap = analysis?.semrushSnapshot ?? {};
  const client = new Set<string>();
  const competitor = new Set<string>();
  for (const k of (snap.topKeywords ?? [])) { const kw = (k.keyword ?? '').toLowerCase(); if (kw) client.add(kw); }
  for (const k of (snap.gapKeywords ?? [])) { const kw = (k.keyword ?? '').toLowerCase(); if (kw) competitor.add(kw); }
  for (const k of (uploaded ?? [])) {
    const kw = (k.keyword ?? '').toLowerCase(); if (!kw) continue;
    if (k.type === 'gap') competitor.add(kw);
    else if (k.source !== 'blocked') client.add(kw);
  }
  return { client, competitor };
}

// Within-theme stage progression: connect each theme's nodes across consecutive
// occupied stages. No cross-theme hub edges (that was the v7.152 funnel artifact).
function withinThemeEdges(nodes: JourneyNode[]): [string, string][] {
  const byTheme = new Map<string, JourneyNode[]>();
  for (const n of nodes) {
    if (!byTheme.has(n.name)) byTheme.set(n.name, []);
    byTheme.get(n.name)!.push(n);
  }
  const edges: [string, string][] = [];
  for (const arr of Array.from(byTheme.values())) {
    const sorted = arr.slice().sort((a: JourneyNode, b: JourneyNode) => a.col - b.col);
    for (let i = 0; i < sorted.length - 1; i++) edges.push([sorted[i].id, sorted[i + 1].id]);
  }
  return edges;
}

// v7.158: map each pre-product SEED to the audience segment(s) whose own language
// (trigger + pre-LLM prompts) contains it. Lets us attribute demand topics to
// segments WITHOUT a rebuild — the topic carries its seeds, the segments carry
// their language, and the link is "this segment talks about this problem". Product
// (procedure) seeds aren't segment-specific, so they don't appear here.
export function buildSeedSegmentMap(universe: DemandUniverse, segments: AudienceSegment[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const problemSeeds = (universe.problemSeeds ?? []).map((s: string) => s.toLowerCase());
  for (const seg of segments) {
    const text = [seg.whoTheyAre?.trigger ?? '', ...(seg.preLLMPrompts ?? [])].join(' ').toLowerCase();
    for (const seed of problemSeeds) {
      if (seed && text.includes(seed)) {
        if (!map.has(seed)) map.set(seed, new Set<string>());
        map.get(seed)!.add(seg.id);
      }
    }
  }
  return map;
}

// ─── v7.170: EXCLUSIVE topic→persona partition (so segments sum to the total) ──
// Wayne: each segment view must be a non-overlapping slice — the three personas
// plus a "Shared / all personas" bucket sum to the combined topic total. We assign
// every THEME (seed) to exactly ONE bucket: the single persona whose language best
// matches it, or 'shared' when no persona matches OR several tie (a topic everyone
// or no-one searches). Assigning by THEME (not per keyword) keeps each theme×stage
// node whole, so the node counts partition cleanly and add up. Attribution is a real
// word-overlap against each persona's actual language — never a modeled split.
export const SHARED_BUCKET = 'shared';
const SEG_STOPWORDS = new Set([
  'with','from','that','this','have','your','what','when','will','they','their',
  'about','after','before','near','want','need','looking','search','searches',
  'more','some','very','into','over','than','then','them','also','just','like',
]);
function segWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => w.length >= 4 && !SEG_STOPWORDS.has(w));
}
function segmentLanguage(seg: AudienceSegment): string {
  return [
    seg.whoTheyAre?.trigger ?? '',
    seg.whoTheyAre?.demographics ?? '',
    seg.whoTheyAre?.influencerRole ?? '',
    seg.tagline ?? '',
    ...(seg.preLLMPrompts ?? []),
    ...(seg.productPrompts ?? []),
  ].join(' ');
}

// v7.247: build the per-segment token sets once (a segment's own audience language).
export function buildSegTokens(segments: AudienceSegment[]): Array<{ id: string; toks: Set<string> }> {
  return segments.map(seg => ({ id: seg.id, toks: new Set(segWords(segmentLanguage(seg))) }));
}

// v7.247: attribute an arbitrary string of audience language to ONE persona bucket
// (a segment.id) — or SHARED_BUCKET when nothing matches OR several tie. This is the
// SAME exclusive word-overlap mechanism the demand journey has used since v7.170:
// real overlap against each persona's actual language, never a modeled split. Factored
// out so the canonical Journey view can re-slice cluster topics per segment too.
export function bucketForText(text: string, segTok: Array<{ id: string; toks: Set<string> }>): string {
  const words = segWords(text);
  let bestScore = 0;
  let bestIds: string[] = [];
  for (const st of segTok) {
    let score = 0;
    for (const w of words) if (st.toks.has(w)) score++;
    if (score > bestScore) { bestScore = score; bestIds = [st.id]; }
    else if (score === bestScore && score > 0) bestIds.push(st.id);
  }
  return bestScore > 0 && bestIds.length === 1 ? bestIds[0] : SHARED_BUCKET;
}

/** Map every demand seed (theme) → a single bucket id: a segment.id or SHARED_BUCKET. */
export function assignSeedSegments(universe: DemandUniverse, segments: AudienceSegment[]): Map<string, string> {
  const segTok = buildSegTokens(segments);

  const seeds = new Set<string>();
  for (const s of (universe.productSeeds ?? [])) seeds.add(s.toLowerCase());
  for (const s of (universe.problemSeeds ?? [])) seeds.add(s.toLowerCase());
  for (const t of (universe.topics ?? [])) for (const s of (t.seeds ?? [])) seeds.add(s.toLowerCase());

  const map = new Map<string, string>();
  for (const seed of Array.from(seeds)) {
    // Unique best match (score > 0) → that persona; none or a tie → Shared.
    map.set(seed, bucketForText(seed, segTok));
  }
  return map;
}

// Build journey nodes (theme × funnel stage) from the demand universe, overlaying
// the ranking footprint as coverage. Every node's volume = the sum of REAL Semrush
// search volumes of its topics.
//
// v7.170: when `activeBucketId` is set the journey is filtered to ONE persona
// bucket (a segment.id or SHARED_BUCKET) using the exclusive theme→bucket partition
// from assignSeedSegments. The filter applies to BOTH lanes by a topic's THEME seed,
// so every theme×stage node belongs to exactly one bucket — the per-persona node
// counts therefore PARTITION the combined total (3 personas + Shared = total).
// `activeBucketId === null` = the combined "All Segments" view (no filter).
export function buildDemandNodes(
  universe: DemandUniverse,
  clientRanked: Set<string>,
  competitorRanked: Set<string>,
  activeBucketId: string | null = null,
  seedBucket: Map<string, string> = new Map(),
  rankByKeyword: Record<string, number> = {},   // v7.188: kw(lower) → client position
): { preNodes: JourneyNode[]; prodNodes: JourneyNode[]; preEdges: [string, string][]; prodEdges: [string, string][] } {
  const productSet = new Set((universe.productSeeds ?? []).map((s: string) => s.toLowerCase()));

  interface Bucket { lane: JourneyType; theme: string; stage: JourneyStage; topics: DemandTopic[] }
  const buckets = new Map<string, Bucket>();

  for (const t of (universe.topics ?? [])) {
    const isProduct = t.laneHint === 'product' || t.seeds.some((s: string) => productSet.has(s.toLowerCase()));
    const lane: JourneyType = isProduct ? 'product' : 'pre-product';

    const themeSeed = t.seeds.find((s: string) => productSet.has(s.toLowerCase()) === isProduct) ?? t.seeds[0] ?? 'Other';

    // v7.170 exclusive partition: a topic belongs to exactly one bucket, decided by
    // its THEME seed (so a whole theme×stage node lands in one bucket). Filter both
    // lanes when a single bucket is active; combined view (null) shows everything.
    if (activeBucketId) {
      const bucket = seedBucket.get(themeSeed.toLowerCase()) ?? SHARED_BUCKET;
      if (bucket !== activeBucketId) continue;
    }

    const theme = titleCaseSeed(themeSeed);
    const sig = detectIntent(t.keyword);
    const stage = INTENT_META[sig === 'unmatched' ? 'informational' : sig].stage;
    const key = `${lane}::${theme}::${stage}`;
    if (!buckets.has(key)) buckets.set(key, { lane, theme, stage, topics: [] });
    buckets.get(key)!.topics.push(t);
  }

  const nodes: JourneyNode[] = [];
  for (const b of Array.from(buckets.values())) {
    const totalVol  = b.topics.reduce((s: number, t: DemandTopic) => s + t.searchVolume, 0);
    const clientVol = b.topics.filter((t: DemandTopic) => clientRanked.has(t.keyword.toLowerCase())).reduce((s: number, t: DemandTopic) => s + t.searchVolume, 0);
    const compVol   = b.topics.filter((t: DemandTopic) => !clientRanked.has(t.keyword.toLowerCase()) && competitorRanked.has(t.keyword.toLowerCase())).reduce((s: number, t: DemandTopic) => s + t.searchVolume, 0);
    const state: NodeState = clientVol > 0 ? 'existing' : (compVol > 0 ? 'competitor' : 'missing');
    const sortedTopics = b.topics.slice().sort((a: DemandTopic, x: DemandTopic) => x.searchVolume - a.searchVolume);
    const sampleKws = sortedTopics.slice(0, 8).map((t: DemandTopic) => t.keyword);
    // v7.188: full keyword list with the client's rank for the detail panel.
    const keywords: NodeKw[] = sortedTopics.map((t: DemandTopic) => {
      const kwLc = t.keyword.toLowerCase();
      const isClient = clientRanked.has(kwLc);
      const rank = (isClient && rankByKeyword[kwLc] != null) ? rankByKeyword[kwLc] : null;
      return {
        keyword: t.keyword,
        volume:  t.searchVolume,
        rank,
        state:   (isClient ? 'existing' : (competitorRanked.has(kwLc) ? 'competitor' : 'missing')) as NodeState,
      };
    });
    nodes.push({
      id: `${b.lane}::${b.theme}::${b.stage}`, name: b.theme, lane: b.lane, stage: b.stage,
      col: JOURNEY_STAGE_ORDER.indexOf(b.stage), state,
      totalVol, clientVol, compVol, kwCount: b.topics.length, sampleKws, keywords,
    });
  }

  const preNodes  = nodes.filter((n: JourneyNode) => n.lane === 'pre-product');
  const prodNodes = nodes.filter((n: JourneyNode) => n.lane === 'product');
  return { preNodes, prodNodes, preEdges: withinThemeEdges(preNodes), prodEdges: withinThemeEdges(prodNodes) };
}

// ─── MindMap (v7.152) ───────────────────────────────────────────────────────────

function MindMap({ nodes, edges, onSelect, onClear, selectedId }: {
  nodes:      JourneyNode[];
  edges:      [string, string][];
  onSelect:   (n: JourneyNode) => void;
  onClear:    () => void;
  selectedId: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);

  // v7.188: the WHOLE connected journey a node belongs to — follow edges in both
  // directions transitively. Selecting a node focuses this set (everything else dims).
  const connectedTo = (id: string): Set<string> => {
    const seen = new Set<string>([id]); const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const [f, t] of edges) {
        if (f === cur && !seen.has(t)) { seen.add(t); stack.push(t); }
        if (t === cur && !seen.has(f)) { seen.add(f); stack.push(f); }
      }
    }
    return seen;
  };
  const focus = selectedId ? connectedTo(selectedId) : null;

  const W = 700, NODE_W = 150, NODE_H = 46, PAD = 18, ROW_GAP = 16;

  const { pos, H } = useMemo(() => {
    const byCol: Record<number, JourneyNode[]> = {};
    nodes.forEach((n: JourneyNode) => { (byCol[n.col] = byCol[n.col] || []).push(n); });
    const counts = Object.values(byCol).map((a: JourneyNode[]) => a.length);
    const maxRows = counts.length ? Math.max(...counts) : 1;
    const H = PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;
    const colW = W / 4;
    const map: Record<string, { x: number; y: number; n: JourneyNode }> = {};
    Object.entries(byCol).forEach(([col, arr]: [string, JourneyNode[]]) => {
      const cx = colW * Number(col) + colW / 2;
      const blockH = arr.length * NODE_H + (arr.length - 1) * ROW_GAP;
      const startY = (H - blockH) / 2 + NODE_H / 2;
      arr.forEach((n: JourneyNode, i: number) => { map[n.id] = { x: cx, y: startY + i * (NODE_H + ROW_GAP), n }; });
    });
    return { pos: map, H };
  }, [nodes]);

  const header = (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--c-1a1a30)', marginBottom: 4 }}>
      {JOURNEY_STAGE_ORDER.map((s: JourneyStage, i: number) => (
        <div key={s} style={{
          flex: 1, padding: '7px 6px', textAlign: 'center', fontSize: 9.5, fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase', color: STAGE_COLORS[s].text,
          opacity: 0.7, borderRight: i < 3 ? '1px solid var(--c-1a1a30)' : 'none',
        }}>
          {JOURNEY_STAGE_LABELS[s]}
        </div>
      ))}
    </div>
  );

  if (!nodes.length) {
    return (
      <div>
        {header}
        <p style={{ fontSize: 11, color: 'var(--c-3a3a5a)', fontStyle: 'italic', padding: '18px 4px' }}>
          No topic clusters mapped to this journey yet.
        </p>
      </div>
    );
  }

  function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
    if (Math.abs(a.x - b.x) < 1) {
      const bow = 70;
      return `M${a.x} ${a.y} C ${a.x + bow} ${a.y} ${b.x + bow} ${b.y} ${b.x} ${b.y}`;
    }
    const mx = (a.x + b.x) / 2;
    return `M${a.x} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }

  const validEdges = edges.filter(([f, t]: [string, string]) => pos[f] && pos[t]);
  const ordered = nodes.slice().sort((a: JourneyNode, b: JourneyNode) => {
    const pri = (n: JourneyNode) => (n.id === hover ? 2 : n.id === selectedId ? 1 : 0);
    return pri(a) - pri(b);
  });

  return (
    <div>
      {header}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
        onClick={() => { if (focus) onClear(); }}
        aria-label="Mind map of topic clusters across the funnel, color-coded by content coverage">
        {validEdges.map(([f, t]: [string, string], i: number) => {
          const inFocus = focus ? (focus.has(f) && focus.has(t)) : null;
          const inc = focus ? !!inFocus : (hover === f || hover === t);
          const stroke = inc ? STATE_COLOR[pos[f].n.state] : 'var(--c-33335c)';
          const opacity = focus ? (inFocus ? 0.95 : 0.05) : (hover ? (inc ? 0.95 : 0.07) : 0.5);
          return (
            <path key={i} d={edgePath(pos[f], pos[t])} fill="none"
              stroke={stroke} strokeWidth={inc ? 2.2 : 1.3}
              opacity={opacity} />
          );
        })}
        {ordered.map((n: JourneyNode) => {
          const p = pos[n.id];
          const col = STATE_COLOR[n.state];
          const scale = n.id === hover ? 1.15 : 1;
          const sel = n.id === selectedId;
          const dim = focus ? !focus.has(n.id) : false;
          const label = n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name;
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y}) scale(${scale})`}
              style={{ cursor: 'pointer', opacity: dim ? 0.16 : 1, transition: 'opacity 0.12s' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover((h: string | null) => (h === n.id ? null : h))}
              onClick={(e) => { e.stopPropagation(); onSelect(n); }}>
              <g transform={`translate(${-NODE_W / 2} ${-NODE_H / 2})`}>
                <rect width={NODE_W} height={NODE_H} rx={9} style={{fill:'var(--c-0d0d22)'}} stroke={col} strokeWidth={sel ? 2.4 : 1.6} />
                <rect width={4} height={NODE_H} rx={2} fill={col} />
                <text x={13} y={19} style={{fill:'var(--c-d8d8f0)'}} fontSize={11} fontWeight={500} fontFamily="inherit">{label}</text>
                <text x={13} y={34} style={{fill:'var(--c-6a6a90)'}} fontSize={9.5} fontFamily="monospace">
                  {fmtVol(n.totalVol)}/mo · {n.kwCount} kw
                </text>
                <circle cx={NODE_W - 13} cy={14} r={4} fill={col} />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Prompt strip · legend · completeness · detail (v7.152) ─────────────────────

function PromptStrip({ prompts, accent }: { prompts: string[]; accent: string }) {
  const shown = prompts.slice(0, 10);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {shown.map((p: string, i: number) => (
        <span key={i} style={{
          fontSize: 10.5, padding: '4px 9px', borderRadius: 6,
          background: `${accent}0d`, border: `1px solid ${accent}30`,
          color: accent, fontFamily: 'monospace', lineHeight: 1.4,
        }}>
          &ldquo;{p}&rdquo;
        </span>
      ))}
    </div>
  );
}

function Legend() {
  const item = (c: string, l: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-8080a0)' }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: c }} />{l}
    </span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      {item(STATE_COLOR.existing, 'Existing content')}
      {item(STATE_COLOR.missing, 'Missing')}
      {item(STATE_COLOR.competitor, 'Competitor only')}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-4a4a6a)' }}>
        Hover to enlarge · click for detail · topic links are AI-inferred
      </span>
    </div>
  );
}

function CompletenessRow({ nodes }: { nodes: JourneyNode[] }) {
  const ex  = nodes.filter((n: JourneyNode) => n.state === 'existing').length;
  const mi  = nodes.filter((n: JourneyNode) => n.state === 'missing').length;
  const co  = nodes.filter((n: JourneyNode) => n.state === 'competitor').length;
  const tot = nodes.length;
  const pct = tot ? Math.round((ex / tot) * 100) : 0;
  const cell = (label: string, val: number | string, color: string) => (
    <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{val}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 12 }}>
      {cell('Topics in journey', tot, 'var(--c-c8c8e8)')}
      {cell('Existing', ex, STATE_COLOR.existing)}
      {cell('Missing', mi, STATE_COLOR.missing)}
      {cell('Competitor only', co, STATE_COLOR.competitor)}
      <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)' }}>Completeness</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-c8c8e8)', marginTop: 2 }}>{pct}%</div>
        <div style={{ height: 4, background: 'var(--c-1a1a30)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: STATE_COLOR.existing }} />
        </div>
      </div>
    </div>
  );
}

// v7.161: combined journey summary — one row of cards, each showing the overall
// total across both lanes plus a pre-product (cyan) / product (purple) split.
const PRE_COLOR = 'var(--c-22d3ee)';
const PROD_COLOR = 'var(--c-a78bfa)';

function CombinedSummary({ preNodes, prodNodes }: { preNodes: JourneyNode[]; prodNodes: JourneyNode[] }) {
  const cnt = (nodes: JourneyNode[], st: NodeState) => nodes.filter((n: JourneyNode) => n.state === st).length;
  const preTot = preNodes.length, prodTot = prodNodes.length, tot = preTot + prodTot;
  const preEx = cnt(preNodes, 'existing'),   prodEx = cnt(prodNodes, 'existing');
  const preMi = cnt(preNodes, 'missing'),     prodMi = cnt(prodNodes, 'missing');
  const preCo = cnt(preNodes, 'competitor'),  prodCo = cnt(prodNodes, 'competitor');
  const pct     = tot ? Math.round(((preEx + prodEx) / tot) * 100) : 0;
  const prePct  = preTot ? Math.round((preEx / preTot) * 100) : 0;
  const prodPct = prodTot ? Math.round((prodEx / prodTot) * 100) : 0;

  const splitCard = (label: string, color: string, pre: number, prod: number) => {
    const denom = pre + prod;
    const preW = denom ? Math.round((pre / denom) * 100) : 0;
    return (
      <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, color: 'var(--c-6a6a90)' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color, margin: '2px 0 8px' }}>{denom}</div>
        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', background: 'var(--c-1a1a30)' }}>
          <div style={{ width: `${preW}%`, background: PRE_COLOR }} />
          <div style={{ width: `${100 - preW}%`, background: PROD_COLOR }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginTop: 5 }}>
          <span style={{ color: PRE_COLOR }}>Pre {pre}</span>
          <span style={{ color: PROD_COLOR }}>Prod {prod}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-6a6a90)' }}>Journey coverage — combined</span>
        <span style={{ fontSize: 10.5, color: 'var(--c-8080a0)' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: PRE_COLOR, marginRight: 4, verticalAlign: 'middle' }} />Pre-product</span>
        <span style={{ fontSize: 10.5, color: 'var(--c-8080a0)' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: PROD_COLOR, marginRight: 4, verticalAlign: 'middle' }} />Product</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {splitCard('Topics in journey', 'var(--c-c8c8e8)', preTot, prodTot)}
        {splitCard('Existing', STATE_COLOR.existing, preEx, prodEx)}
        {splitCard('Missing', STATE_COLOR.missing, preMi, prodMi)}
        {splitCard('Competitor only', STATE_COLOR.competitor, preCo, prodCo)}
        <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--c-6a6a90)' }}>Completeness</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-c8c8e8)', margin: '2px 0 8px' }}>{pct}%</div>
          <div style={{ height: 5, background: 'var(--c-1a1a30)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: STATE_COLOR.existing }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginTop: 5 }}>
            <span style={{ color: PRE_COLOR }}>Pre {prePct}%</span>
            <span style={{ color: PROD_COLOR }}>Prod {prodPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// v7.188: shared keyword table — every keyword in the cluster with its real Semrush
// volume and the client's live rank. rank set → "#N" (green); competitor-only → purple
// "competitor"; otherwise red "not ranking". Both detail panels render this.
interface KwRow { keyword: string; volume: number; rank: number | null; state: NodeState }
function KeywordTable({ rows }: { rows: KwRow[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return null;
  const CAP = 12;
  const shown = showAll ? rows : rows.slice(0, CAP);
  const th = { textAlign: 'left' as const, fontSize: 9.5, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: 'var(--c-6a6a90)', fontWeight: 600, padding: '7px 9px', borderBottom: '1px solid var(--c-1a1a30)' };
  const rankCell = (r: KwRow) => {
    const [label, c] = r.rank != null
      ? [`#${r.rank}`, STATE_COLOR.existing]
      : (r.state === 'competitor' ? ['competitor', STATE_COLOR.competitor] : ['not ranking', STATE_COLOR.missing]);
    return <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 9px', color: c, background: `${c}1a`, border: `1px solid ${c}55`, whiteSpace: 'nowrap' }}>{label}</span>;
  };
  return (
    <div style={{ marginTop: 6, border: '1px solid var(--c-1a1a30)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={th}>Keyword</th>
            <th style={{ ...th, textAlign: 'right', width: 78 }}>Volume</th>
            <th style={{ ...th, textAlign: 'right', width: 96 }}>Your rank</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r: KwRow, i: number) => (
            <tr key={i}>
              <td style={{ padding: '7px 9px', borderBottom: '1px solid var(--c-13132a)', color: 'var(--c-c8c8e8)', fontFamily: 'monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.keyword}>&ldquo;{r.keyword}&rdquo;</td>
              <td style={{ padding: '7px 9px', borderBottom: '1px solid var(--c-13132a)', color: 'var(--c-9a9ac0)', fontFamily: 'monospace', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtVol(r.volume)}/mo</td>
              <td style={{ padding: '7px 9px', borderBottom: '1px solid var(--c-13132a)', textAlign: 'right' }}>{rankCell(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > CAP && (
        <button onClick={() => setShowAll((v: boolean) => !v)} style={{ width: '100%', background: 'var(--c-0d0d1e)', border: 'none', borderTop: '1px solid var(--c-1a1a30)', color: 'var(--c-8080a0)', cursor: 'pointer', fontSize: 11, padding: '7px 0' }}>
          {showAll ? 'Show fewer' : `Show all ${rows.length} keywords`}
        </button>
      )}
    </div>
  );
}

// v7.188: focus banner — appears when a topic is selected so the focused-journey
// state (and how to leave it) is obvious. The map dims everything off the path.
function FocusBanner({ name, onExit }: { name: string; onExit: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '8px 12px', background: 'var(--ca-34-211-238-0_06)', border: '1px solid var(--ca-34-211-238-0_2)', borderRadius: 9, fontSize: 12, color: 'var(--c-8080a0)' }}>
      <i className="ti ti-focus-2" style={{ color: 'var(--c-22d3ee)' }} />
      <span>Focused journey: <span style={{ color: 'var(--c-22d3ee)', fontWeight: 600 }}>{name}</span> — everything off this path is dimmed.</span>
      <button onClick={onExit} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--c-1f1f3a)', color: 'var(--c-8080a0)', borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
        Show all
      </button>
    </div>
  );
}

function DetailPanel({ node, onClose }: { node: JourneyNode | null; onClose: () => void }) {
  if (!node) {
    return (
      <div style={{
        marginTop: 14, border: '1px solid var(--c-1a1a30)', borderRadius: 12, background: 'var(--c-0d0d1e)',
        padding: 16, fontSize: 12, color: 'var(--c-5a5a80)', textAlign: 'center',
      }}>
        Select a topic node to see its cluster detail.
      </div>
    );
  }
  const col = STATE_COLOR[node.state];
  const clientPct = node.totalVol ? Math.round((node.clientVol / node.totalVol) * 100) : 0;
  const rec = node.state === 'existing'
    ? 'You already have content here — keep it linked into the journey paths above.'
    : node.state === 'competitor'
      ? 'A competitor ranks here and you do not — build comparable depth to capture this step.'
      : 'No coverage from you or tracked competitors — a net-new content opportunity.';
  return (
    <div style={{ marginTop: 14, border: `1px solid ${col}44`, borderRadius: 12, background: 'var(--c-0d0d1e)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-dcdcf4)' }}>{node.name}</div>
          <div style={{ fontSize: 11, color: 'var(--c-6a6a90)', marginTop: 3, fontFamily: 'monospace' }}>
            {fmtVol(node.totalVol)} searches/mo · {node.kwCount} keywords · {JOURNEY_STAGE_LABELS[node.stage]} · {node.lane === 'pre-product' ? 'Pre-product' : 'Product'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 6, padding: '4px 9px', whiteSpace: 'nowrap' }}>
            {STATE_LABEL[node.state]}
          </span>
          <button onClick={onClose} aria-label="Close detail" style={{ background: 'transparent', border: 'none', color: 'var(--c-5a5a80)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
            <i className="ti ti-x" />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--c-1a1a30)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${clientPct}%`, background: col }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--c-8080a0)', minWidth: 96, textAlign: 'right' }}>{clientPct}% client coverage</span>
      </div>

      {node.keywords.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--c-4a4a6a)', marginTop: 14 }}>KEYWORDS IN THIS CLUSTER</div>
          <KeywordTable rows={node.keywords.map((k: NodeKw) => ({ keyword: k.keyword, volume: k.volume, rank: k.rank, state: k.state }))} />
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'var(--ca-120-120-160-0_05)', border: '1px solid var(--c-1f1f3a)', borderRadius: 8, padding: '9px 11px' }}>
        <i className="ti ti-bulb" style={{ color: col, fontSize: 15 }} />
        <span style={{ fontSize: 11.5, color: 'var(--c-9090b8)' }}>{rec}</span>
      </div>
    </div>
  );
}

// ─── Demand build progress (v7.156) ─────────────────────────────────────────────

function fmtEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.round(seconds)}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `~${m}m ${s.toString().padStart(2, '0')}s left`;
}

function DemandProgress({ progress }: { progress: { done: number; total: number; seed: string; startedAt: number } | null }) {
  const total = progress?.total ?? 0;
  const done  = progress?.done ?? 0;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = progress ? (Date.now() - progress.startedAt) / 1000 : 0;
  const eta = (total > 0 && done > 0 && done < total) ? fmtEta((total - done) * (elapsed / done)) : '';
  const label = total === 0
    ? 'Starting — gathering seeds…'
    : `Seed ${done} of ${total}${progress?.seed ? ` · ${progress.seed}` : ''}`;
  return (
    <div style={{ marginTop: 12, maxWidth: 460 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--c-9090b8)' }}>
          <i className="ti ti-loader-2" style={{ marginRight: 5, color: 'var(--c-22d3ee)' }} />{label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--c-6a6a90)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {total > 0 ? `${pct}%` : ''}{eta ? ` · ${eta}` : ''}
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--c-1a1a30)', borderRadius: 3, overflow: 'hidden' }}>
        {total > 0 ? (
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--c-22d3ee)', transition: 'width 0.3s ease' }} />
        ) : (
          <div style={{ height: '100%', width: '35%', background: 'var(--c-22d3ee)', opacity: 0.6, animation: 'orbitiq-indet 1.1s ease-in-out infinite' }} />
        )}
      </div>
      <style>{`@keyframes orbitiq-indet{0%{margin-left:-35%}100%{margin-left:100%}}`}</style>
    </div>
  );
}

// ─── Segment→persona connector (v7.159) ─────────────────────────────────────────
// Pure geometry: a faint line from the ACTIVE pill's middle to a curly brace that
// embraces the persona card's left edge. Coordinates are relative to the left-zone
// container, measured from the live DOM so the line always lands on the pill center.
interface ConnGeom { pillRightX: number; pillMidY: number; perLeft: number; perTop: number; perBottom: number; }
export function buildConnector(g: ConnGeom): { line: string; brace: string; tipX: number; perMid: number } {
  const perMid = (g.perTop + g.perBottom) / 2;
  const spineX = g.perLeft - 4;     // brace spine just left of the persona card
  const tipX   = g.perLeft - 15;    // brace tip — points left, toward the pill
  const top    = g.perTop + 4;
  const bot    = g.perBottom - 4;
  const brace = [
    `M ${spineX} ${top}`,
    `Q ${spineX - 6} ${top} ${spineX - 6} ${(top + perMid) / 2}`,
    `Q ${spineX - 6} ${perMid} ${tipX} ${perMid}`,
    `Q ${spineX - 6} ${perMid} ${spineX - 6} ${(perMid + bot) / 2}`,
    `Q ${spineX - 6} ${bot} ${spineX} ${bot}`,
  ].join(' ');
  const midX = (g.pillRightX + tipX) / 2;
  const line = `M ${g.pillRightX} ${g.pillMidY} C ${midX} ${g.pillMidY} ${midX} ${perMid} ${tipX} ${perMid}`;
  return { line, brace, tipX, perMid };
}

// ─── Connected journey map (v7.175) ─────────────────────────────────────────────
//
// One canvas instead of two disconnected lanes. Top band = pre-product problem
// topics; bottom band = product core + supporting topics. Three data-derived edge
// kinds are colour-coded: co-search (cyan, problem↔problem), bridge (dashed,
// problem→solution), support (purple, core→supporting). Every node shows its
// content action — optimise an existing page or build a net-new one.

const EDGE_COLOR: Record<JEdgeKind, string> = { co: 'var(--c-22d3ee)', bridge: 'var(--c-7dd3fc)', support: 'var(--c-a78bfa)', next: 'var(--c-22d3ee)', related: 'var(--c-a78bfa)' };
const EDGE_WHY_COLOR: Record<JEdgeKind, string> = { co: 'var(--c-22d3ee)', bridge: 'var(--c-7dd3fc)', support: 'var(--c-a78bfa)', next: 'var(--c-22d3ee)', related: 'var(--c-a78bfa)' };
const CM_STAGES: JourneyStage[] = ['awareness', 'consideration', 'decision'];

// ─── v7.189: Per-topic journey swimlanes ────────────────────────────────────────
// One ROW per topic; that topic's steps flow left→right in journey order
// (What it is → Why it matters → What affects it → How to do it → Compare → Act).
// 'next' edges chain a topic's own steps; 'related' edges arc faintly between rows
// only where two topics share real demand (co-searched keyword or shared tokens).
// Selecting a node focuses its whole connected journey and dims the rest.
const STEP_STAGE_TINT: Record<StepFacet, JourneyStage> = {
  understand: 'awareness', why: 'awareness', factors: 'consideration',
  howto: 'consideration', evaluate: 'consideration', act: 'decision',
};

export function TopicJourneyMap({ graph, onSelect, onClear, selectedId }: {
  graph:      JGraph;
  onSelect:   (n: JGNode) => void;
  onClear:    () => void;
  selectedId: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // v7.218: measure the rendered SVG width so the click-detail overlay can be
  // absolutely positioned under the clicked node (the SVG scales to 100% width,
  // so screen px = viewBox coord × wrapWidth/W). Harness-safe: no ResizeObserver.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const measure = () => { if (wrapRef.current) setWrapW(wrapRef.current.clientWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const LABEL_W = 168, NCOLS = STEP_ORDER.length, NODE_H = 50, ROW_GAP = 16, HEAD_H = 24, PAD = 12;
  const W = 900;
  const colW = (W - LABEL_W) / NCOLS;
  const NODE_W = colW - 14;

  const rows = useMemo(() => {
    const bySeed = new Map<string, JGNode[]>();
    for (const n of graph.nodes) {
      const s = n.topicSeed ?? n.seed;
      if (!bySeed.has(s)) bySeed.set(s, []);
      bySeed.get(s)!.push(n);
    }
    const arr = Array.from(bySeed.entries()).map(([seed, ns]: [string, JGNode[]]) => {
      const steps = ns.slice().sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
      const totalVol = steps.reduce((s: number, n: JGNode) => s + n.totalVol, 0);
      const clientVol = steps.reduce((s: number, n: JGNode) => s + n.clientVol, 0);
      const covPct = totalVol > 0 ? Math.round((clientVol / totalVol) * 100) : 0;
      return { seed, label: steps[0]?.topicLabel ?? steps[0]?.name ?? seed, steps, totalVol, covPct };
    });
    arr.sort((a, b) => b.totalVol - a.totalVol);
    return arr;
  }, [graph]);

  const pos = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    rows.forEach((row, r: number) => {
      const y = HEAD_H + PAD + r * (NODE_H + ROW_GAP) + NODE_H / 2;
      row.steps.forEach((n: JGNode) => {
        const so = Math.min(NCOLS - 1, Math.max(0, n.stepOrder ?? 0));
        m[n.id] = { x: LABEL_W + so * colW + colW / 2, y };
      });
    });
    return m;
  }, [rows, colW]);
  const H = HEAD_H + PAD * 2 + rows.length * (NODE_H + ROW_GAP);

  if (!graph.nodes.length) {
    return <p style={{ fontSize: 12, color: 'var(--c-3a3a5a)', fontStyle: 'italic', padding: '24px 4px' }}>No topics mapped to this journey yet — build the deep journey from the Keyword panel to populate it.</p>;
  }

  const byId = new Map(graph.nodes.map((n: JGNode) => [n.id, n] as [string, JGNode]));
  // Topic-scoped focus: the selected node's WHOLE topic journey (all its steps) plus
  // any directly-related topics (1 hop along edges). Not the full transitive closure
  // — otherwise one 'related' link would light up the entire map.
  const focusOf = (id: string): Set<string> => {
    const s = new Set<string>([id]);
    const node = byId.get(id);
    const seed = node?.topicSeed ?? node?.seed;
    if (seed) for (const n of graph.nodes) if ((n.topicSeed ?? n.seed) === seed) s.add(n.id);
    for (const e of graph.edges) { if (e.from === id) s.add(e.to); if (e.to === id) s.add(e.from); }
    return s;
  };
  const neighbors = (id: string): Set<string> => {
    const s = new Set<string>([id]);
    for (const e of graph.edges) { if (e.from === id) s.add(e.to); if (e.to === id) s.add(e.from); }
    return s;
  };
  const focus = selectedId ? focusOf(selectedId) : null;
  const nb = hover ? neighbors(hover) : null;
  const validEdges = graph.edges.filter((e) => pos[e.from] && pos[e.to]);

  const edgePath = (a: { x: number; y: number }, b: { x: number; y: number }): string => {
    if (Math.abs(a.y - b.y) < 1) return `M${a.x} ${a.y} L${b.x} ${b.y}`;   // same row: straight step link
    const my = (a.y + b.y) / 2;                                            // cross-row: vertical S-curve
    return `M${a.x} ${a.y} C ${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
  };

  const ordered = graph.nodes.slice().sort((a, b) => {
    const pri = (n: JGNode) => (n.id === hover ? 2 : n.id === selectedId ? 1 : 0);
    return pri(a) - pri(b);
  });

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }} role="img"
        onClick={() => { if (focus) onClear(); }}
        aria-label="Per-topic journeys: each row is one topic broken into the steps a searcher moves through, left to right, with related topics linked where they share real demand.">
        {/* stage tint bands behind the step columns */}
        {STEP_ORDER.map((f: StepFacet, i: number) => (
          <rect key={f} x={LABEL_W + i * colW} y={HEAD_H} width={colW} height={H - HEAD_H} fill={STAGE_COLORS[STEP_STAGE_TINT[f]].bg} opacity={0.6} />
        ))}
        {/* column dividers + step headers */}
        {STEP_ORDER.map((f: StepFacet, i: number) => (
          <g key={'h' + f}>
            {i > 0 && <line x1={LABEL_W + i * colW} y1={HEAD_H} x2={LABEL_W + i * colW} y2={H} style={{ stroke: 'var(--c-13132a)' }} strokeWidth={1} />}
            <text x={LABEL_W + i * colW + colW / 2} y={15} textAnchor="middle" fontSize={9.5} fontWeight={700} letterSpacing="0.03em" style={{ fill: STAGE_COLORS[STEP_STAGE_TINT[f]].text }} opacity={0.85}>{STEP_LABEL[f]}</text>
          </g>
        ))}
        <line x1={LABEL_W} y1={HEAD_H} x2={LABEL_W} y2={H} style={{ stroke: 'var(--c-1a1a30)' }} strokeWidth={1} />
        {/* edges */}
        {validEdges.map((e, i: number) => {
          const inFocus = focus ? (focus.has(e.from) && focus.has(e.to)) : null;
          const inc = focus ? !!inFocus : (hover === e.from || hover === e.to);
          const color = EDGE_COLOR[e.kind];
          const isRel = e.kind === 'related';
          const opacity = focus ? (inFocus ? 0.95 : 0.04) : (hover ? (inc ? 0.95 : 0.06) : (isRel ? 0.3 : 0.6));
          return (
            <path key={i} d={edgePath(pos[e.from], pos[e.to])} fill="none"
              stroke={inc ? color : (isRel ? 'var(--c-33335c)' : 'var(--c-2a4a5a)')}
              strokeWidth={inc ? 2.2 : 1.4}
              strokeDasharray={isRel ? '5 4' : undefined}
              opacity={opacity} />
          );
        })}
        {/* row labels */}
        {rows.map((row, r: number) => {
          const y = HEAD_H + PAD + r * (NODE_H + ROW_GAP) + NODE_H / 2;
          const dimRow = focus ? !row.steps.some((n: JGNode) => focus.has(n.id)) : false;
          const label = row.label.length > 24 ? row.label.slice(0, 23) + '…' : row.label;
          return (
            <g key={'l' + row.seed} opacity={dimRow ? 0.3 : 1}>
              <text x={8} y={y - 3} fontSize={11} fontWeight={700} style={{ fill: 'var(--c-d8d8f0)' }}><title>{row.label}</title>{label}</text>
              <text x={8} y={y + 12} fontSize={8.5} fontFamily="monospace" style={{ fill: 'var(--c-6a6a90)' }}>{fmtVol(row.totalVol)}/mo · {row.covPct}% covered</text>
            </g>
          );
        })}
        {/* nodes */}
        {ordered.map((n: JGNode) => {
          const p = pos[n.id]; if (!p) return null;
          const col = STATE_COLOR[n.state];
          const scale = n.id === hover ? 1.06 : 1;
          const sel = n.id === selectedId;
          const dim = focus ? !focus.has(n.id) : (nb ? !nb.has(n.id) : false);
          // v7.218: the box now carries the real TOPIC NAME (not the repeated step
          // facet — the column header already states the step). Read down a column to
          // scan one topic across every stage. Truncated to fit; full label on hover.
          const rawTitle = n.topicLabel ?? n.name;
          const title = rawTitle.length > 16 ? rawTitle.slice(0, 15) + '…' : rawTitle;
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y}) scale(${scale})`} style={{ cursor: 'pointer', opacity: dim ? 0.16 : 1, transition: 'opacity 0.12s' }}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h: string | null) => (h === n.id ? null : h))}
              onClick={(e) => { e.stopPropagation(); if (n.id === selectedId) onClear(); else onSelect(n); }}>
              <title>{n.id === selectedId ? 'Click to close · ' + rawTitle : rawTitle}</title>
              <g transform={`translate(${-NODE_W / 2} ${-NODE_H / 2})`}>
                <rect width={NODE_W} height={NODE_H} rx={8} style={{ fill: 'var(--c-0d0d22)' }} stroke={col} strokeWidth={sel ? 2.3 : 1.4} />
                <rect width={4} height={NODE_H} rx={2} fill={col} />
                <text x={11} y={18} style={{ fill: 'var(--c-d8d8f0)' }} fontSize={10} fontWeight={600} fontFamily="inherit">{title}</text>
                <text x={11} y={32} style={{ fill: 'var(--c-8080a0)' }} fontSize={8.5} fontFamily="monospace">{fmtVol(n.totalVol)}/mo · {n.kwCount} kw</text>
                <g transform={`translate(11 ${NODE_H - 14})`}>
                  <rect width={n.action === 'optimize' ? 50 : 54} height={11} rx={3} fill={`${col}22`} stroke={`${col}55`} strokeWidth={0.8} />
                  <text x={6} y={8.5} fill={col} fontSize={7.5} fontWeight={700} fontFamily="inherit">{n.action === 'optimize' ? 'Existing' : 'Build new'}</text>
                </g>
                <circle cx={NODE_W - 11} cy={NODE_H - 8} r={3.2} fill={col} />
              </g>
            </g>
          );
        })}
      </svg>
      {/* v7.218: click-detail OVERLAY anchored directly under the clicked box,
          instead of a panel at the bottom of the page that forced a scroll. */}
      {(() => {
        if (!selectedId) return null;
        const sel = byId.get(selectedId);
        const p = sel ? pos[sel.id] : null;
        const w = wrapW || (wrapRef.current?.clientWidth ?? 0);
        if (!sel || !p || w <= 0) return null;
        const scale = w / W;
        const cardW = Math.min(380, w - 8);
        const cx = p.x * scale;
        const cyBottom = (p.y + NODE_H / 2) * scale;
        let left = cx - cardW / 2;
        left = Math.max(0, Math.min(left, w - cardW));
        const caretLeft = Math.max(12, Math.min(cardW - 24, cx - left - 6));
        const oc = STATE_COLOR[sel.state];
        return (
          <div style={{ position: 'absolute', top: cyBottom + 8, left, width: cardW, zIndex: 30, maxHeight: 440, overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ position: 'absolute', top: -6, left: caretLeft, width: 12, height: 12, background: 'var(--c-0d0d1e)', borderLeft: `1px solid ${oc}66`, borderTop: `1px solid ${oc}66`, transform: 'rotate(45deg)', zIndex: 1 }} />
            <GraphDetail node={sel} graph={graph} onClose={onClear} anchored />
          </div>
        );
      })()}
    </div>
  );
}

function ConnectedMap({ graph, onSelect, onClear, selectedId }: {
  graph:      JGraph;
  onSelect:   (n: JGNode) => void;
  onClear:    () => void;
  selectedId: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 720, NODE_W = 158, NODE_H = 56, PAD = 16, ROW_GAP = 14, BAND_GAP = 56;

  const { pos, H, bandY } = useMemo(() => {
    // group by lane (band) and column
    const cellKey = (lane: string, col: number) => `${lane}::${col}`;
    const cells: Record<string, JGNode[]> = {};
    for (const n of graph.nodes) {
      const col = Math.min(2, Math.max(0, n.col));
      (cells[cellKey(n.lane, col)] = cells[cellKey(n.lane, col)] || []).push(n);
    }
    const rowsIn = (lane: string) => {
      let m = 0;
      for (let c = 0; c < 3; c++) m = Math.max(m, (cells[cellKey(lane, c)] || []).length);
      return m;
    };
    const preRows = rowsIn('pre-product');
    const prodRows = rowsIn('product');
    const blockH = (rows: number) => rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP;
    const preH = blockH(preRows), prodH = blockH(prodRows);
    const preTop = PAD;
    const prodTop = PAD + preH + BAND_GAP;
    const H = prodTop + prodH + PAD;
    const colW = W / 3;
    const map: Record<string, { x: number; y: number; n: JGNode }> = {};
    const place = (lane: string, top: number, bandH: number) => {
      for (let c = 0; c < 3; c++) {
        const arr = (cells[cellKey(lane, c)] || []).slice().sort((a, b) => b.totalVol - a.totalVol);
        const cx = colW * c + colW / 2;
        const bh = blockH(arr.length);
        const startY = top + (bandH - bh) / 2 + NODE_H / 2;
        arr.forEach((n: JGNode, i: number) => { map[n.id] = { x: cx, y: startY + i * (NODE_H + ROW_GAP), n }; });
      }
    };
    place('pre-product', preTop, preH);
    place('product', prodTop, prodH);
    return { pos: map, H, bandY: { preTop, prodTop, preH, prodH } };
  }, [graph]);

  const edgePath = (a: { x: number; y: number }, b: { x: number; y: number }): string => {
    if (Math.abs(a.x - b.x) < 1) { const bow = 64; return `M${a.x} ${a.y} C ${a.x + bow} ${a.y} ${b.x + bow} ${b.y} ${b.x} ${b.y}`; }
    const mx = (a.x + b.x) / 2;
    return `M${a.x} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  };

  if (!graph.nodes.length) {
    return <p style={{ fontSize: 12, color: 'var(--c-3a3a5a)', fontStyle: 'italic', padding: '24px 4px' }}>No topics mapped to this journey yet — build the deep journey from the Keyword panel to populate it.</p>;
  }

  const validEdges = graph.edges.filter((e) => pos[e.from] && pos[e.to]);
  const neighbors = (id: string) => {
    const s = new Set<string>([id]);
    for (const e of graph.edges) { if (e.from === id) s.add(e.to); if (e.to === id) s.add(e.from); }
    return s;
  };
  const nb = hover ? neighbors(hover) : null;
  // v7.188: the whole connected journey for the selected node (transitive over all
  // edge kinds). Selecting focuses this set; everything else dims persistently.
  const connectedTo = (id: string): Set<string> => {
    const seen = new Set<string>([id]); const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of graph.edges) {
        if (e.from === cur && !seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
        if (e.to === cur && !seen.has(e.from)) { seen.add(e.from); stack.push(e.from); }
      }
    }
    return seen;
  };
  const focus = selectedId ? connectedTo(selectedId) : null;
  const ordered = graph.nodes.slice().sort((a, b) => {
    const pri = (n: JGNode) => (n.id === hover ? 2 : n.id === selectedId ? 1 : 0);
    return pri(a) - pri(b);
  });

  const colW = W / 3;
  return (
    <div>
      {/* stage headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--c-1a1a30)' }}>
        {CM_STAGES.map((s: JourneyStage, i: number) => (
          <div key={s} style={{ flex: 1, padding: '7px 6px', textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: STAGE_COLORS[s].text, opacity: 0.7, borderRight: i < 2 ? '1px solid var(--c-1a1a30)' : 'none' }}>
            {JOURNEY_STAGE_LABELS[s]}
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
        onClick={() => { if (focus) onClear(); }}
        aria-label="Connected audience journey: problem topics link by co-search behaviour, bridge to the product that solves them, and fan into supporting decision topics. Colour shows content coverage.">
        {/* band backgrounds */}
        <rect x={0} y={bandY.preTop - PAD / 2} width={W} height={bandY.preH + PAD} fill="var(--ca-34-211-238-0_025)" rx={8} />
        <rect x={0} y={bandY.prodTop - PAD / 2} width={W} height={bandY.prodH + PAD} fill="var(--ca-167-139-250-0_03)" rx={8} />
        <text x={8} y={bandY.preTop + 4} style={{fill:'var(--c-22d3ee)'}} fontSize={8.5} fontWeight={700} opacity={0.5} letterSpacing="0.1em">PRE-PRODUCT · PROBLEM-AWARE</text>
        <text x={8} y={bandY.prodTop + 4} style={{fill:'var(--c-a78bfa)'}} fontSize={8.5} fontWeight={700} opacity={0.5} letterSpacing="0.1em">PRODUCT · SOLUTION-AWARE</text>
        {/* column dividers */}
        {[1, 2].map((c) => <line key={c} x1={colW * c} y1={0} x2={colW * c} y2={H} style={{stroke:'var(--c-13132a)'}} strokeWidth={1} />)}
        {/* edges */}
        {validEdges.map((e, i: number) => {
          const inFocus = focus ? (focus.has(e.from) && focus.has(e.to)) : null;
          const inc = focus ? !!inFocus : (hover === e.from || hover === e.to);
          const color = EDGE_COLOR[e.kind];
          const opacity = focus ? (inFocus ? 0.95 : 0.04) : (hover ? (inc ? 0.95 : 0.06) : (e.kind === 'bridge' ? 0.45 : 0.42));
          return (
            <path key={i} d={edgePath(pos[e.from], pos[e.to])} fill="none"
              stroke={inc ? color : (e.kind === 'bridge' ? 'var(--c-3a5566)' : 'var(--c-33335c)')}
              strokeWidth={inc ? 2.4 : 1.3}
              strokeDasharray={e.kind === 'bridge' ? '5 4' : undefined}
              opacity={opacity} />
          );
        })}
        {/* nodes */}
        {ordered.map((n: JGNode) => {
          const p = pos[n.id]; if (!p) return null;
          const col = STATE_COLOR[n.state];
          const scale = n.id === hover ? 1.07 : 1;
          const sel = n.id === selectedId;
          const dim = focus ? !focus.has(n.id) : (nb ? !nb.has(n.id) : false);
          const label = n.name.length > 24 ? n.name.slice(0, 23) + '…' : n.name;
          const badge = n.action === 'optimize' ? 'Existing' : 'Build new';
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y}) scale(${scale})`} style={{ cursor: 'pointer', opacity: dim ? 0.16 : 1, transition: 'opacity 0.12s' }}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h: string | null) => (h === n.id ? null : h))} onClick={(e) => { e.stopPropagation(); onSelect(n); }}>
              <g transform={`translate(${-NODE_W / 2} ${-NODE_H / 2})`}>
                <rect width={NODE_W} height={NODE_H} rx={9} style={{fill:'var(--c-0d0d22)'}} stroke={col} strokeWidth={n.kind === 'core' ? 2.3 : (sel ? 2.3 : 1.5)} />
                <rect width={4} height={NODE_H} rx={2} fill={col} />
                {n.kind === 'core' && <text x={NODE_W - 26} y={16} style={{fill:'var(--c-a78bfa)'}} fontSize={11} fontFamily="inherit">★</text>}
                <text x={12} y={17} style={{fill:'var(--c-d8d8f0)'}} fontSize={10.5} fontWeight={500} fontFamily="inherit">{label}</text>
                <text x={12} y={31} style={{fill:'var(--c-6a6a90)'}} fontSize={9} fontFamily="monospace">{fmtVol(n.totalVol)}/mo · {n.kwCount} kw</text>
                <g transform={`translate(12 ${NODE_H - 15})`}>
                  <rect width={n.action === 'optimize' ? 56 : 60} height={12} rx={3} fill={`${col}22`} stroke={`${col}55`} strokeWidth={0.8} />
                  <text x={6} y={9} fill={col} fontSize={8} fontWeight={700} fontFamily="inherit">{badge}</text>
                </g>
                <circle cx={NODE_W - 12} cy={NODE_H - 9} r={3.5} fill={col} />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ContentPlanSummary({ graph }: { graph: JGraph }) {
  const p = graph.plan;
  const cell = (label: string, val: number | string, color: string, sub?: string) => (
    <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, margin: '2px 0 0' }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--c-5a5a80)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-6a6a90)' }}>Content plan — every topic mapped</span>
        <span style={{ fontSize: 10.5, color: 'var(--c-5a7a80)' }}><i className="ti ti-arrow-right" style={{ margin: '0 4px' }} />feeds the Content panel</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {cell('Topics in journey', p.total, 'var(--c-c8c8e8)')}
        {cell('Existing — optimize', p.optimize, STATE_COLOR.existing)}
        {cell('Net-new — build', p.build, STATE_COLOR.missing, `${p.preBuild} pre · ${p.prodBuild} product`)}
        <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)' }}>Coverage</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-c8c8e8)', margin: '2px 0 6px' }}>{p.total ? Math.round((p.optimize / p.total) * 100) : 0}%</div>
          <div style={{ height: 5, background: 'var(--c-1a1a30)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${p.total ? Math.round((p.optimize / p.total) * 100) : 0}%`, background: STATE_COLOR.existing }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// v7.221: per-cluster state from a canonical topic (same rule as nodesFromCanonical):
// client ranks OR an existing page → "existing" (optimise); else competitor gap →
// "competitor"; else net-new "missing". Drives both the count and the row badges.
function canonTopicState(t: CanonicalJourneyTopic): NodeState {
  const fp = t.keywords.filter(k => k.origin !== 'demand');
  const clientRanked = fp.filter(k => !k.isGap && k.position !== null);
  const compVol = t.keywords.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0);
  return (clientRanked.length > 0 || !!t.pageUrl) ? 'existing' : (compVol > 0 ? 'competitor' : 'missing');
}

const CANON_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  procedure: { label: 'Product topic',  color: 'var(--c-9b96ff)' },
  brand:     { label: 'Brand',          color: 'var(--c-f59e0b)' },
  location:  { label: 'Location',       color: 'var(--c-38bdf8)' },
  demand:    { label: 'Missing demand', color: 'var(--c-22d3ee)' },
  problem:   { label: 'Pre-product',    color: 'var(--c-34d399)' },
};

// v7.221: the canonical journey view — drives "Topics in journey" from the SAME
// cluster topics the Cluster panel counts (Const II.7), so the journey reconciles to
// the cluster count instead of the demand-universe graph. The map is a collapsible
// parent-category list (the flat node map can't legibly show thousands of clusters),
// grouped into the two journey lanes. Every number is a real roll-up of the topics.
function CanonicalJourneyView({ topics, problemSeeds = [], segmentLabel = null }: { topics: CanonicalJourneyTopic[]; problemSeeds?: string[]; segmentLabel?: string | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // v7.247: Product / Pre-product / All journey scope (matches the Cluster panel).
  const [journeyScope, setJourneyScope] = useState<'all' | 'product' | 'pre'>('all');

  // v7.223: a topic is PRE-PRODUCT (problem-aware, awareness-only — Const III.2a) when it
  // is a 'problem' cluster OR a missing-demand cluster seeded by a problem head term from
  // the deep journey (demandUniverse.problemSeeds). Without this, problem-aware demand was
  // absorbed into the product lane, leaving the pre-product journey nearly empty.
  const problemSet = useMemo(() => new Set((problemSeeds ?? []).map(s => s.toLowerCase().trim())), [problemSeeds]);
  const isPreProduct = (t: CanonicalJourneyTopic): boolean =>
    t.parentType === 'problem' ||
    (t.parentType === 'demand' && problemSet.has((t.parentName || '').toLowerCase().trim()));

  const rows = useMemo(() => topics.map(t => {
    const lane: JourneyType = isPreProduct(t) ? 'pre-product' : 'product';
    const state = canonTopicState(t);
    return { t, lane, state, action: (state === 'existing' ? 'optimize' : 'build') as 'optimize' | 'build' };
  }), [topics, problemSet]);   // eslint-disable-line react-hooks/exhaustive-deps

  // v7.247: lane counts for the scope pills come from ALL rows (the segment-filtered
  // set); the cards + list then recompute over only the chosen scope's rows — exactly
  // how the Cluster panel re-slices when a journey scope is picked.
  const productN = rows.filter(r => r.lane === 'product').length;
  const preN     = rows.filter(r => r.lane === 'pre-product').length;
  const scopedRows = useMemo(() =>
    journeyScope === 'product' ? rows.filter(r => r.lane === 'product')
  : journeyScope === 'pre'     ? rows.filter(r => r.lane === 'pre-product')
  :                             rows,
  [rows, journeyScope]);

  const total     = scopedRows.length;
  const optimize  = scopedRows.filter(r => r.action === 'optimize').length;
  const build     = total - optimize;
  const preBuild  = scopedRows.filter(r => r.action === 'build' && r.lane === 'pre-product').length;
  const prodBuild = build - preBuild;
  const coverage  = total ? Math.round((optimize / total) * 100) : 0;

  const groupsByLane = useMemo(() => {
    const m = new Map<JourneyType, Map<string, typeof scopedRows>>();
    for (const r of scopedRows) {
      const lm = m.get(r.lane) ?? m.set(r.lane, new Map()).get(r.lane)!;
      const key = r.t.parentName || '(uncategorized)';
      (lm.get(key) ?? lm.set(key, []).get(key)!).push(r);
    }
    return m;
  }, [scopedRows]);

  const lanes: Array<{ lane: JourneyType; label: string; accent: string }> = [
    { lane: 'product',     label: 'Product · solution-aware',     accent: 'var(--c-a78bfa)' },
    { lane: 'pre-product', label: 'Pre-product · problem-aware',  accent: 'var(--c-22d3ee)' },
  ];

  const cell = (label: string, val: number | string, color: string, sub?: string) => (
    <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, margin: '2px 0 0' }}>{val.toLocaleString?.() ?? val}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--c-5a5a80)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      {/* content-plan summary — reconciles to the cluster count */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-6a6a90)' }}>Content plan — every topic mapped</span>
          <span style={{ fontSize: 10.5, color: 'var(--c-5a7a80)' }}><i className="ti ti-arrow-right" style={{ margin: '0 4px' }} />feeds the Content panel · in sync with the Cluster panel</span>
          {/* v7.247: when a persona is active, show whose slice these cards reflect. */}
          {segmentLabel && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-a78bfa)', background: 'var(--ca-167-139-250-0_1)', border: '1px solid var(--ca-167-139-250-0_2)', borderRadius: 20, padding: '2px 9px' }}>
              <i className="ti ti-user" style={{ marginRight: 5 }} />{segmentLabel}
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {cell('Topics in journey', total, 'var(--c-c8c8e8)')}
          {cell('Existing — optimize', optimize, STATE_COLOR.existing)}
          {cell('Net-new — build', build, STATE_COLOR.missing, `${preBuild} pre · ${prodBuild} product`)}
          <div style={{ background: 'var(--c-0d0d1e)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--c-6a6a90)' }}>Coverage</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-c8c8e8)', margin: '2px 0 6px' }}>{coverage}%</div>
            <div style={{ height: 5, background: 'var(--c-1a1a30)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${coverage}%`, background: STATE_COLOR.existing }} />
            </div>
          </div>
        </div>
      </div>

      {/* v7.247: Journey scope — All / Product / Pre-product, the SAME control the */}
      {/* Cluster panel uses. Choosing a scope re-slices the cards + the topic list  */}
      {/* (product = solution-aware full funnel; pre-product = problem/trigger,       */}
      {/* awareness only — Const III.2a, single source of truth across panels).        */}
      {(() => {
        const SCOPES: Array<{ key: 'all' | 'product' | 'pre'; label: string; count: number; hint: string; accent: string; dot?: boolean }> = [
          { key: 'all',     label: 'All journeys',        count: productN + preN, hint: 'Product + pre-product topics',                   accent: 'var(--c-c8c8e8)' },
          { key: 'product', label: 'Product journey',     count: productN,        hint: 'Solution-aware demand · full funnel',            accent: 'var(--c-9b96ff)', dot: true },
          { key: 'pre',     label: 'Pre-product journey', count: preN,            hint: 'Problem / trigger searches · awareness only',    accent: 'var(--c-34d399)', dot: true },
        ];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--c-585878)' }}>Journey</span>
            <div style={{ display: 'inline-flex', background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', borderRadius: 10, padding: 3, gap: 3 }}>
              {SCOPES.map(s => {
                const on = journeyScope === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setJourneyScope(s.key)}
                    title={s.hint}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      fontSize: 12, fontWeight: 600, lineHeight: 1,
                      padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                      border: 'none', outline: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
                      background: on ? 'var(--c-1e1e38)' : 'transparent',
                      boxShadow:  on ? `inset 0 0 0 1px ${s.accent}` : 'none',
                      color:      on ? s.accent : 'var(--c-9090b8)',
                    }}
                    onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-c8c8e8)'; }}
                    onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-9090b8)'; }}
                  >
                    {s.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.accent, flexShrink: 0 }} />}
                    {s.label}
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? s.accent : 'var(--c-585878)' }}>{s.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 10, color: 'var(--c-484868)' }}>
              {journeyScope === 'pre'     ? 'Problem / trigger searches · awareness only'
             : journeyScope === 'product' ? 'Solution-aware demand · full funnel'
             :                              'Showing both journeys'}
            </span>
          </div>
        );
      })()}

      {/* grouped, collapsible topic list — one journey per cluster, by category */}
      <div style={{ border: '1px solid var(--c-1a1a30)', borderRadius: 12, padding: '16px 18px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ca-167-139-250-0_1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-sitemap" style={{ color: 'var(--c-a78bfa)', fontSize: 14 }} />
          </div>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-c8c8e8)' }}>Topic Journeys — every cluster</span>
            <p style={{ fontSize: 11, color: 'var(--c-5a5a80)', marginTop: 1 }}>
              Every cluster is a journey topic, grouped by category across the two lanes. Expand a category to see its topics. Volumes are real Semrush roll-ups.
            </p>
          </div>
        </div>

        {lanes.map(L => {
          const lm = groupsByLane.get(L.lane);
          if (!lm || lm.size === 0) return null;
          const parents = Array.from(lm.entries()).sort((a, b) =>
            b[1].reduce((s, r) => s + r.t.totalVolume, 0) - a[1].reduce((s, r) => s + r.t.totalVolume, 0));
          const laneCount = Array.from(lm.values()).reduce((s, rs) => s + rs.length, 0);
          return (
            <div key={L.lane} style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 8px', borderBottom: `1px solid var(--c-1a1a30)` }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: L.accent }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: L.accent }}>{L.label}</span>
                <span style={{ fontSize: 10.5, color: 'var(--c-6a6a90)' }}>{laneCount.toLocaleString()} topics · {lm.size} categories</span>
              </div>
              {parents.map(([name, rs]) => {
                const key = L.lane + '::' + name;
                const open = expanded.has(key);
                const vol = rs.reduce((s, r) => s + r.t.totalVolume, 0);
                const badge = CANON_TYPE_BADGE[rs[0].t.parentType] ?? CANON_TYPE_BADGE.procedure;
                // v7.223: per-category existing-vs-net-new split (Option A) so coverage
                // reads without expanding. existing = client ranks / has a page; build = net-new.
                const catExisting = rs.filter(r => r.action === 'optimize').length;
                const catBuild    = rs.length - catExisting;
                return (
                  <div key={key} style={{ borderBottom: '1px solid var(--c-141428)' }}>
                    <button
                      onClick={() => toggle(key)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <i className={`ti ti-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 13, color: 'var(--c-6a6a90)', width: 14, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-d8d8f0)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 20, color: badge.color, border: `1px solid ${badge.color}`, opacity: 0.85, flexShrink: 0 }}>{badge.label}</span>
                      <span style={{ fontSize: 10.5, flexShrink: 0, minWidth: 132, textAlign: 'right' }}>
                        <span style={{ color: STATE_COLOR.existing }}>{catExisting.toLocaleString()} existing</span>
                        <span style={{ color: 'var(--c-5a5a80)' }}> · </span>
                        <span style={{ color: STATE_COLOR.missing }}>{catBuild.toLocaleString()} build</span>
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--c-6a6a90)', flexShrink: 0, minWidth: 64, textAlign: 'right' }}>{rs.length.toLocaleString()} topics</span>
                      <span style={{ fontSize: 10.5, color: 'var(--c-5a5a80)', flexShrink: 0, minWidth: 70, textAlign: 'right', fontFamily: 'monospace' }}>{fmtVol(vol)}/mo</span>
                    </button>
                    {open && (
                      <div style={{ paddingBottom: 6 }}>
                        {rs.slice().sort((a, b) => b.t.totalVolume - a.t.totalVolume).map(r => (
                          <div key={r.t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px 6px 26px' }}>
                            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: STAGE_COLORS[r.t.stage].text, minWidth: 86, flexShrink: 0 }}>{JOURNEY_STAGE_LABELS[r.t.stage]}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--c-c0c0dc)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t.product}</span>
                            <span style={{ fontSize: 10, color: 'var(--c-5a5a80)', flexShrink: 0, minWidth: 54, textAlign: 'right' }}>{r.t.keywords.length} kw</span>
                            <span style={{ fontSize: 10.5, color: 'var(--c-6a6a90)', flexShrink: 0, minWidth: 66, textAlign: 'right', fontFamily: 'monospace' }}>{fmtVol(r.t.totalVolume)}/mo</span>
                            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, flexShrink: 0, minWidth: 70, textAlign: 'center', color: r.action === 'optimize' ? STATE_COLOR.existing : STATE_COLOR.missing, background: r.action === 'optimize' ? 'var(--ca-52-211-153-0_1)' : 'var(--ca-248-113-113-0_1)', border: `1px solid ${r.action === 'optimize' ? STATE_COLOR.existing : STATE_COLOR.missing}` }}>{r.action === 'optimize' ? 'Existing' : 'Build new'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── v7.256: List ⇄ Mind-map view toggle ────────────────────────────────────────
export function JourneyViewToggle({ view, onChange }: { view: 'list' | 'mindmap'; onChange: (v: 'list' | 'mindmap') => void }) {
  const OPTS: Array<{ key: 'list' | 'mindmap'; label: string; icon: string; hint: string }> = [
    { key: 'list',    label: 'List view',     icon: 'ti-list-tree', hint: 'Collapsible content plan — every topic, grouped by category' },
    { key: 'mindmap', label: 'Mind-map view', icon: 'ti-mind-map',  hint: 'Behavioral journey graph — how users progress, stage to stage' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--c-585878)' }}>View</span>
      <div style={{ display: 'inline-flex', background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', borderRadius: 10, padding: 3, gap: 3 }}>
        {OPTS.map(o => {
          const on = view === o.key;
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              title={o.hint}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 12, fontWeight: 600, lineHeight: 1,
                padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                border: 'none', outline: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
                background: on ? 'var(--c-1e1e38)' : 'transparent',
                boxShadow:  on ? 'inset 0 0 0 1px var(--c-a78bfa)' : 'none',
                color:      on ? 'var(--c-a78bfa)' : 'var(--c-9090b8)',
              }}
              onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-c8c8e8)'; }}
              onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-9090b8)'; }}
            >
              <i className={`ti ${o.icon}`} style={{ fontSize: 14 }} />
              {o.label}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 10, color: 'var(--c-484868)' }}>
        {view === 'mindmap' ? 'What users learn first → compare → decide. Click a topic to trace its journey.' : 'Every cluster mapped, grouped by category.'}
      </span>
    </div>
  );
}

// ─── v7.256: Behavioral journey mind-map / knowledge graph ───────────────────────
// A scale-safe behavioral graph over the SAME canonical topics the list reads (Const
// II.7). The spine is the funnel itself (Awareness → Consideration → Decision →
// Retention) — "what users learn first → what they compare → what they decide". Within
// each stage, topics group by category (collapsible, so thousands of topics never render
// flat — the durable scale constraint). Connections are journey-stage progression
// (NEXT_STEP / PREVIOUS_STEP) and same-stage siblings (COMPARE); every node and edge is
// weighted by REAL Semrush volume — no modeled probability is shown (Const I.1).
type MindRow = { t: CanonicalJourneyTopic; lane: JourneyType; state: NodeState; action: 'optimize' | 'build' };

const MIND_REL = {
  next:    { label: 'Next step',     color: 'var(--c-34d399)', icon: 'ti-arrow-right' },
  compare: { label: 'Compare',       color: 'var(--c-f59e0b)', icon: 'ti-arrows-left-right' },
  prev:    { label: 'Leads here',    color: 'var(--c-22d3ee)', icon: 'ti-arrow-back-up' },
};

// v7.256: stage → reference "journey row" label, so the funnel reads like a user journey
// (Awareness = Category Discovery, etc.) while staying our canonical 4-stage model.
const MIND_STAGE_ROW: Record<JourneyStage, string> = {
  awareness: 'Category Discovery', consideration: 'Product Evaluation', decision: 'Usage & Decision', retention: 'Advanced / Retention',
};
// relationship edge types we actually compute (no invented likelihoods — Const I.1).
const MIND_EDGE = {
  next:    { label: 'Next step (most likely)', color: 'var(--c-34d399)', dashed: false },
  compare: { label: 'Compare / alternative',   color: 'var(--c-a78bfa)', dashed: false },
  broader: { label: 'Broader / intro',         color: 'var(--c-5a5a80)', dashed: true  },
};
function truncLabel(s: string, n = 24): string { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

export function JourneyMindMap({ topics, problemSeeds = [], segmentLabel = null, clientDomain = '' }: {
  topics: CanonicalJourneyTopic[]; problemSeeds?: string[]; segmentLabel?: string | null; clientDomain?: string;
}) {
  const [journeyScope, setJourneyScope] = useState<'all' | 'product' | 'pre'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);   // which category's journey is on the canvas

  const problemSet = useMemo(() => new Set((problemSeeds ?? []).map(s => s.toLowerCase().trim())), [problemSeeds]);
  const isPreProduct = (t: CanonicalJourneyTopic): boolean =>
    t.parentType === 'problem' ||
    (t.parentType === 'demand' && problemSet.has((t.parentName || '').toLowerCase().trim()));

  const rows: MindRow[] = useMemo(() => topics.map(t => {
    const lane: JourneyType = isPreProduct(t) ? 'pre-product' : 'product';
    const state = canonTopicState(t);
    return { t, lane, state, action: (state === 'existing' ? 'optimize' : 'build') as 'optimize' | 'build' };
  }), [topics, problemSet]);   // eslint-disable-line react-hooks/exhaustive-deps

  const productN = rows.filter(r => r.lane === 'product').length;
  const preN     = rows.filter(r => r.lane === 'pre-product').length;
  const scopedRows = useMemo(() =>
    journeyScope === 'product' ? rows.filter(r => r.lane === 'product')
  : journeyScope === 'pre'     ? rows.filter(r => r.lane === 'pre-product')
  :                             rows,
  [rows, journeyScope]);

  // lane → stage → category → rows[] (the behavioral tree).
  const byId = useMemo(() => new Map(rows.map(r => [r.t.id, r])), [rows]);
  const tree = useMemo(() => {
    const m = new Map<JourneyType, Map<JourneyStage, Map<string, MindRow[]>>>();
    for (const r of scopedRows) {
      const sm = m.get(r.lane) ?? m.set(r.lane, new Map()).get(r.lane)!;
      const cm = sm.get(r.t.stage) ?? sm.set(r.t.stage, new Map()).get(r.t.stage)!;
      const key = r.t.parentName || '(uncategorized)';
      (cm.get(key) ?? cm.set(key, []).get(key)!).push(r);
    }
    return m;
  }, [scopedRows]);

  // behavioral links for the selected topic — same lane + category, by stage adjacency.
  const selectedRow = selectedId ? byId.get(selectedId) ?? null : null;
  const links = useMemo(() => {
    if (!selectedRow) return null;
    const { lane, t } = selectedRow;
    const cat = t.parentName || '(uncategorized)';
    const stageIdx = JOURNEY_STAGE_ORDER.indexOf(t.stage);
    const sameCat = rows.filter(r => r.lane === lane && (r.t.parentName || '(uncategorized)') === cat && r.t.id !== t.id);
    const atStage = (idx: number) => idx >= 0 && idx < JOURNEY_STAGE_ORDER.length
      ? sameCat.filter(r => r.t.stage === JOURNEY_STAGE_ORDER[idx]).sort((a, b) => b.t.totalVolume - a.t.totalVolume)
      : [];
    return {
      cat,
      next:    atStage(stageIdx + 1),
      compare: sameCat.filter(r => r.t.stage === t.stage).sort((a, b) => b.t.totalVolume - a.t.totalVolume),
      prev:    atStage(stageIdx - 1),
    };
  }, [selectedRow, rows]);
  const relatedIds = useMemo(() => {
    const s = new Set<string>();
    if (links) { for (const g of [links.next, links.compare, links.prev]) for (const r of g) s.add(r.t.id); }
    return s;
  }, [links]);

  // categories within the current scope; each = one (lane, parentName) whose topics span stages.
  const categories = useMemo(() => {
    const m = new Map<string, { key: string; lane: JourneyType; name: string; rows: MindRow[]; vol: number }>();
    for (const r of scopedRows) {
      const name = r.t.parentName || '(uncategorized)';
      const key = r.lane + '|||' + name;
      const e = m.get(key) ?? m.set(key, { key, lane: r.lane, name, rows: [], vol: 0 }).get(key)!;
      e.rows.push(r); e.vol += r.t.totalVolume;
    }
    return Array.from(m.values()).sort((a, b) => b.vol - a.vol);
  }, [scopedRows]);

  const effectiveFocusKey = (focusKey && categories.some(c => c.key === focusKey)) ? focusKey : (categories[0]?.key ?? null);
  const focused = categories.find(c => c.key === effectiveFocusKey) ?? null;

  const focusedStages = useMemo(() => {
    if (!focused) return [] as Array<{ stage: JourneyStage; rows: MindRow[] }>;
    const bs = new Map<JourneyStage, MindRow[]>();
    for (const r of focused.rows) (bs.get(r.t.stage) ?? bs.set(r.t.stage, []).get(r.t.stage)!).push(r);
    return JOURNEY_STAGE_ORDER.filter(s => bs.has(s)).map(s => ({ stage: s, rows: bs.get(s)!.slice().sort((a, b) => b.t.totalVolume - a.t.totalVolume) }));
  }, [focused]);

  // deterministic top→bottom layout — a root "entry" node, then one row per funnel stage.
  // Positions are COMPUTED (no DOM measurement — what kept the earlier flat maps fragile),
  // and only the focused category's topics are drawn, so it never renders thousands of nodes.
  const layout = useMemo(() => {
    const NW = 158, NH = 46, COLW = 184, ROWGAP = 124, LM = 132, TOPPAD = 34;
    type LNode = { id: string; kind: 'root' | 'topic'; x: number; y: number; label: string; sub: string; stage: JourneyStage | null; row?: MindRow };
    type LEdge = { id: string; x1: number; y1: number; x2: number; y2: number; kind: keyof typeof MIND_EDGE; vol: number; from: string; to: string };
    if (!focused) return { nodes: [] as LNode[], edges: [] as LEdge[], width: 720, height: 200, NW, NH, maxVol: 1 };
    const maxCols = Math.max(1, ...focusedStages.map(s => s.rows.length));
    const width = Math.max(720, LM + maxCols * COLW + 40);
    const innerW = width - LM - 40;
    const rowY = (i: number) => TOPPAD + NH / 2 + i * ROWGAP;
    const colX = (j: number, n: number) => LM + innerW * (j + 0.5) / n;
    const maxVol = Math.max(1, ...focusedStages.flatMap(s => s.rows.map(r => r.t.totalVolume)));
    const nodes: LNode[] = [];
    const edges: LEdge[] = [];
    const rootId = 'root:' + focused.key;
    const rootX = LM + innerW / 2, rootY = rowY(0);
    nodes.push({ id: rootId, kind: 'root', x: rootX, y: rootY, label: focused.name, sub: `${fmtVol(focused.vol)}/mo`, stage: null });
    const posById = new Map<string, { x: number; y: number }>();
    focusedStages.forEach((srow, si) => {
      const y = rowY(si + 1);
      srow.rows.forEach((r, j) => {
        const x = colX(j, srow.rows.length);
        nodes.push({ id: r.t.id, kind: 'topic', x, y, label: r.t.product, sub: `${fmtVol(r.t.totalVolume)}/mo`, stage: r.t.stage, row: r });
        posById.set(r.t.id, { x, y });
      });
    });
    if (focusedStages[0]) for (const r of focusedStages[0].rows) {
      const p = posById.get(r.t.id)!;
      edges.push({ id: 'b:' + r.t.id, x1: rootX, y1: rootY + NH / 2, x2: p.x, y2: p.y - NH / 2, kind: 'broader', vol: 0, from: rootId, to: r.t.id });
    }
    for (let i = 0; i < focusedStages.length - 1; i++) {
      const up = focusedStages[i].rows, down = focusedStages[i + 1].rows;
      const full = up.length * down.length <= 24;
      for (const u of up) for (const d of (full ? down : down.slice(0, 2))) {
        const pu = posById.get(u.t.id)!, pd = posById.get(d.t.id)!;
        edges.push({ id: `n:${u.t.id}:${d.t.id}`, x1: pu.x, y1: pu.y + NH / 2, x2: pd.x, y2: pd.y - NH / 2, kind: 'next', vol: d.t.totalVolume, from: u.t.id, to: d.t.id });
      }
    }
    for (const srow of focusedStages) for (let j = 0; j < srow.rows.length - 1; j++) {
      const a = srow.rows[j], b = srow.rows[j + 1];
      const pa = posById.get(a.t.id)!, pb = posById.get(b.t.id)!;
      edges.push({ id: `c:${a.t.id}:${b.t.id}`, x1: pa.x + NW / 2, y1: pa.y, x2: pb.x - NW / 2, y2: pb.y, kind: 'compare', vol: 0, from: a.t.id, to: b.t.id });
    }
    const height = rowY(focusedStages.length) + NH;
    return { nodes, edges, width, height, NW, NH, maxVol };
  }, [focused, focusedStages]);

  const totalVol = scopedRows.reduce((s, r) => s + r.t.totalVolume, 0);

  return (
    <div>
      {/* scope control — identical behavior to the list view (single source, Const II.7) */}
      {(() => {
        const SCOPES: Array<{ key: 'all' | 'product' | 'pre'; label: string; count: number; accent: string; dot?: boolean }> = [
          { key: 'all',     label: 'All journeys',        count: productN + preN, accent: 'var(--c-c8c8e8)' },
          { key: 'product', label: 'Product journey',     count: productN,        accent: 'var(--c-9b96ff)', dot: true },
          { key: 'pre',     label: 'Pre-product journey', count: preN,            accent: 'var(--c-34d399)', dot: true },
        ];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--c-585878)' }}>Journey</span>
            <div style={{ display: 'inline-flex', background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', borderRadius: 10, padding: 3, gap: 3 }}>
              {SCOPES.map(s => {
                const on = journeyScope === s.key;
                return (
                  <button key={s.key} onClick={() => { setJourneyScope(s.key); setSelectedId(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, lineHeight: 1, padding: '7px 13px', borderRadius: 8, cursor: 'pointer', border: 'none', outline: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s', background: on ? 'var(--c-1e1e38)' : 'transparent', boxShadow: on ? `inset 0 0 0 1px ${s.accent}` : 'none', color: on ? s.accent : 'var(--c-9090b8)' }}
                    onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-c8c8e8)'; }}
                    onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-9090b8)'; }}>
                    {s.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.accent, flexShrink: 0 }} />}
                    {s.label}
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? s.accent : 'var(--c-585878)' }}>{s.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
            {segmentLabel && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-a78bfa)', background: 'var(--ca-167-139-250-0_1)', border: '1px solid var(--ca-167-139-250-0_2)', borderRadius: 20, padding: '2px 9px' }}>
                <i className="ti ti-user" style={{ marginRight: 5 }} />{segmentLabel}
              </span>
            )}
          </div>
        );
      })()}

      {/* explorer header — title + the volume-weighting note (no modeled %, Const I.1) */}
      <div style={{ marginTop: 14, padding: '11px 14px', border: '1px solid var(--c-1a1a30)', borderRadius: 10, background: 'var(--c-0d0d1e)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-c8c8e8)' }}>User Journey Map — Content Topic Explorer</div>
        <div style={{ fontSize: 10.5, color: 'var(--c-7a7a9a)', marginTop: 2 }}>
          Visualize how users explore topics and what they&rsquo;re most likely to do next.
          <span style={{ color: 'var(--c-585878)', marginLeft: 6 }}><i className="ti ti-database" style={{ marginRight: 4 }} />Connections weighted by real Semrush volume — {totalVol.toLocaleString()}/mo across {scopedRows.length.toLocaleString()} topics. No modeled probabilities.</span>
        </div>
      </div>

      {/* category picker — which category's journey is on the canvas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--c-585878)' }}>Journey for</span>
        <select value={effectiveFocusKey ?? ''} onChange={e => { setFocusKey(e.target.value); setSelectedId(null); }}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-d8d8f0)', background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', borderRadius: 8, padding: '7px 10px', maxWidth: 360, cursor: 'pointer' }}>
          {categories.map(c => (
            <option key={c.key} value={c.key}>{(c.lane === 'pre-product' ? '◆ ' : '● ')}{c.name} — {fmtVol(c.vol)}/mo · {c.rows.length} topics</option>
          ))}
        </select>
        {focused && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: 20, padding: '2px 9px', color: focused.lane === 'pre-product' ? 'var(--c-22d3ee)' : 'var(--c-a78bfa)', border: `1px solid ${focused.lane === 'pre-product' ? 'var(--ca-34-211-238-0_2)' : 'var(--ca-167-139-250-0_2)'}`, background: focused.lane === 'pre-product' ? 'var(--ca-34-211-238-0_1)' : 'var(--ca-167-139-250-0_1)' }}>
            {focused.lane === 'pre-product' ? 'Problem-aware' : 'Solution-aware'}
          </span>
        )}
        <span style={{ fontSize: 10.5, color: 'var(--c-585878)' }}>Each node is a content topic; lines show the most likely next step. Click a node for its journey.</span>
      </div>

      {/* legend (left) + node-link canvas (right) */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ flex: '0 0 170px', border: '1px solid var(--c-1a1a30)', borderRadius: 10, background: 'var(--c-0d0d1e)', padding: '12px 13px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-6a6a90)', marginBottom: 8 }}>Relationship types</div>
          {(Object.keys(MIND_EDGE) as Array<keyof typeof MIND_EDGE>).map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <svg width={26} height={8} aria-hidden="true"><line x1={0} y1={4} x2={26} y2={4} style={{ stroke: MIND_EDGE[k].color }} strokeWidth={k === 'next' ? 3 : 2} strokeDasharray={MIND_EDGE[k].dashed ? '4 3' : undefined} /></svg>
              <span style={{ fontSize: 10.5, color: 'var(--c-9090b8)' }}>{MIND_EDGE[k].label}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--c-1a1a30)', margin: '10px 0 0', paddingTop: 10 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-6a6a90)', marginBottom: 6 }}>Line weight</div>
            <p style={{ fontSize: 10, color: 'var(--c-7a7a9a)', margin: 0, lineHeight: 1.55 }}>Thicker line = higher <strong>real Semrush volume</strong> for the next topic. No modeled probabilities — only measured demand.</p>
          </div>
          <div style={{ borderTop: '1px solid var(--c-1a1a30)', margin: '10px 0 0', paddingTop: 10 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-6a6a90)', marginBottom: 6 }}>Node status</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: STATE_COLOR.existing }} /><span style={{ fontSize: 10.5, color: 'var(--c-9090b8)' }}>Existing — optimize</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: STATE_COLOR.missing }} /><span style={{ fontSize: 10.5, color: 'var(--c-9090b8)' }}>Net-new — build</span></div>
          </div>
        </div>

        <div style={{ flex: '1 1 460px', minWidth: 0, border: '1px solid var(--c-1a1a30)', borderRadius: 10, background: 'var(--c-0a0a1e)', overflow: 'auto', maxHeight: 640 }}>
          <svg width={layout.width} height={layout.height} style={{ display: 'block', minWidth: '100%' }} role="img" aria-label="User journey content topic graph">
            <defs>
              {(['next', 'compare'] as Array<keyof typeof MIND_EDGE>).map(k => (
                <marker key={k} id={`arw-${k}`} markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" style={{ fill: MIND_EDGE[k].color }} />
                </marker>
              ))}
            </defs>
            {/* funnel-row labels at the left gutter */}
            {focusedStages.map((s, i) => (
              <text key={s.stage} x={10} y={34 + layout.NH / 2 + (i + 1) * 124} style={{ fill: STAGE_COLORS[s.stage].text }} fontSize={9} fontWeight={700} letterSpacing="0.05em">
                {MIND_STAGE_ROW[s.stage].toUpperCase()}
              </text>
            ))}
            {/* edges (weighted by real volume) */}
            {layout.edges.map(e => {
              const meta = MIND_EDGE[e.kind];
              const incident = e.from === selectedId || e.to === selectedId;
              const opacity = selectedId ? (incident ? 0.95 : 0.1) : (e.kind === 'broader' ? 0.4 : 0.55);
              const w = e.kind === 'next' ? 1.4 + 3 * Math.min(1, e.vol / layout.maxVol) : e.kind === 'compare' ? 1.5 : 1.3;
              const d = e.kind === 'compare'
                ? `M${e.x1},${e.y1} C${(e.x1 + e.x2) / 2},${e.y1 - 22} ${(e.x1 + e.x2) / 2},${e.y2 - 22} ${e.x2},${e.y2}`
                : `M${e.x1},${e.y1} C${e.x1},${(e.y1 + e.y2) / 2} ${e.x2},${(e.y1 + e.y2) / 2} ${e.x2},${e.y2}`;
              return <path key={e.id} d={d} fill="none" style={{ stroke: meta.color }} strokeWidth={w} strokeDasharray={meta.dashed ? '5 4' : undefined} opacity={opacity} markerEnd={e.kind !== 'broader' ? `url(#arw-${e.kind})` : undefined} />;
            })}
            {/* edge volume labels for the selected node's next steps */}
            {selectedId && layout.edges.filter(e => e.kind === 'next' && (e.from === selectedId || e.to === selectedId)).map(e => (
              <text key={'lbl' + e.id} x={(e.x1 + e.x2) / 2 + 6} y={(e.y1 + e.y2) / 2} style={{ fill: 'var(--c-9090b8)' }} fontSize={9} fontWeight={600} fontFamily="monospace">{fmtVol(e.vol)}/mo</text>
            ))}
            {/* nodes */}
            {layout.nodes.map(n => {
              const sc = n.stage ? STAGE_COLORS[n.stage] : { border: 'var(--c-3a3a55)', text: 'var(--c-9090b8)', bg: 'var(--c-14142a)' };
              const sel = n.id === selectedId;
              const rel = relatedIds.has(n.id);
              const stroke = sel ? 'var(--c-34d399)' : rel ? 'var(--c-a78bfa)' : sc.border;
              const isTopic = n.kind === 'topic';
              return (
                <g key={n.id} style={{ cursor: isTopic ? 'pointer' : 'default' }} onClick={() => { if (isTopic) setSelectedId(sel ? null : n.id); }}>
                  <rect x={n.x - layout.NW / 2} y={n.y - layout.NH / 2} width={layout.NW} height={layout.NH} rx={n.kind === 'root' ? 22 : 12} style={{ fill: sc.bg }} stroke={stroke} strokeWidth={sel ? 2.4 : 1.3} />
                  {isTopic && <rect x={n.x - layout.NW / 2} y={n.y - layout.NH / 2} width={4} height={layout.NH} rx={2} style={{ fill: n.row!.action === 'optimize' ? STATE_COLOR.existing : STATE_COLOR.missing }} opacity={0.9} />}
                  <text x={n.x} y={n.y - 2} textAnchor="middle" style={{ fill: 'var(--c-e0e0f4)' }} fontSize={11} fontWeight={600}>{truncLabel(n.label, 22)}</text>
                  <text x={n.x} y={n.y + 12} textAnchor="middle" style={{ fill: sc.text }} fontSize={9} fontWeight={600}>{n.kind === 'root' ? 'ENTRY · ' + n.sub : n.sub}</text>
                  <title>{n.label}</title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* selected-topic behavioral detail — the "click a node and expand its journey" panel */}
      {selectedRow && links && (
        <div style={{ marginTop: 16, border: '1px solid var(--c-2a2a45)', borderRadius: 12, padding: '16px 18px', background: 'var(--c-0d0d1e)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: STAGE_COLORS[selectedRow.t.stage].text }}>
                {JOURNEY_STAGE_LABELS[selectedRow.t.stage]} · {links.cat}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-e8e8fc)', marginTop: 2 }}>{selectedRow.t.product}</div>
              <div style={{ fontSize: 11, color: 'var(--c-6a6a90)', marginTop: 2 }}>
                {fmtVol(selectedRow.t.totalVolume)}/mo · {selectedRow.t.keywords.length} keywords · {selectedRow.action === 'optimize' ? 'Existing — optimize' : 'Net-new — build'}
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} title="Close" style={{ background: 'none', border: '1px solid var(--c-2a2a45)', borderRadius: 7, color: 'var(--c-9090b8)', cursor: 'pointer', padding: '4px 8px', fontSize: 12, flexShrink: 0 }}>
              <i className="ti ti-x" />
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--c-8a8ab0)', margin: '6px 0 12px', fontStyle: 'italic' }}>
            If a user is reading &ldquo;{selectedRow.t.product},&rdquo; here&rsquo;s where they most likely go next — ranked by real search volume within {links.cat}.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {([['next', links.next], ['compare', links.compare], ['prev', links.prev]] as Array<[keyof typeof MIND_REL, MindRow[]]>).map(([rel, group]) => {
              const meta = MIND_REL[rel];
              return (
                <div key={rel} style={{ border: '1px solid var(--c-1a1a30)', borderRadius: 9, padding: '10px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                    <i className={`ti ${meta.icon}`} style={{ color: meta.color, fontSize: 13 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: meta.color }}>{meta.label}</span>
                    <span style={{ fontSize: 9.5, color: 'var(--c-585878)' }}>{group.length}</span>
                  </div>
                  {group.length === 0 ? (
                    <div style={{ fontSize: 10.5, color: 'var(--c-585878)', fontStyle: 'italic' }}>
                      {rel === 'next' ? 'End of this category’s funnel' : rel === 'prev' ? 'Entry point — nothing leads here' : 'No sibling topics at this stage'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {group.slice(0, 7).map(r => (
                        <button key={r.t.id} onClick={() => setSelectedId(r.t.id)} title={r.t.product}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', background: 'var(--c-14142a)', border: '1px solid var(--c-242440)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: r.action === 'optimize' ? STATE_COLOR.existing : STATE_COLOR.missing }} />
                          <span style={{ fontSize: 10.5, color: 'var(--c-c0c0dc)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t.product}</span>
                          <span style={{ fontSize: 9, color: 'var(--c-6a6a90)', flexShrink: 0, fontFamily: 'monospace' }}>{fmtVol(r.t.totalVolume)}/mo</span>
                        </button>
                      ))}
                      {group.length > 7 && <span style={{ fontSize: 9.5, color: 'var(--c-585878)', paddingLeft: 2 }}>+{group.length - 7} more</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scopedRows.length === 0 && (
        <div style={{ marginTop: 16, border: '1px dashed var(--c-2a2a45)', borderRadius: 12, padding: '28px 18px', textAlign: 'center', color: 'var(--c-6a6a90)', fontSize: 12 }}>
          No topics in this journey scope yet.
        </div>
      )}
    </div>
  );
}

function GraphDetail({ node, graph, onClose, anchored }: { node: JGNode | null; graph: JGraph; onClose: () => void; anchored?: boolean }) {
  if (!node) {
    return (
      <div style={{ marginTop: 14, border: '1px solid var(--c-1a1a30)', borderRadius: 12, background: 'var(--c-0d0d1e)', padding: 16, fontSize: 12, color: 'var(--c-5a5a80)', textAlign: 'center' }}>
        Select a topic to see its keywords, why it connects, and the content action.
      </div>
    );
  }
  const col = STATE_COLOR[node.state];
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as [string, JGNode]));
  const rels = graph.edges
    .filter((e) => e.from === node.id || e.to === node.id)
    .map((e) => { const otherId = e.from === node.id ? e.to : e.from; return { why: e.why, kind: e.kind, name: byId.get(otherId)?.name ?? otherId }; });
  const kindLabel = node.step
    ? `Step ${(node.stepOrder ?? 0) + 1} · ${STEP_LABEL[node.step]}`
    : (node.kind === 'problem' ? 'Pre-product · problem' : node.kind === 'core' ? 'Product · core' : `Product · ${SUPPORT_LABEL[node.supportType].toLowerCase()}`);
  const rec = node.action === 'optimize'
    ? 'You already rank here — keep this page linked into the paths above and refresh it.'
    : node.state === 'competitor'
      ? 'A competitor owns this step and you do not — build comparable depth to capture it.'
      : 'No coverage from you or tracked competitors — a net-new page to build.';
  // v7.188: best (lowest) client rank across the cluster's keywords, for the page CTA.
  const rankedPositions = node.keywords.map((k) => k.rank).filter((r): r is number => r != null);
  const bestRank = rankedPositions.length ? Math.min(...rankedPositions) : null;
  return (
    <div style={{ marginTop: anchored ? 0 : 14, border: `1px solid ${col}44`, borderRadius: 12, background: 'var(--c-0d0d1e)', padding: 16, boxShadow: anchored ? '0 12px 32px rgba(0,0,0,0.45)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-dcdcf4)' }}>{(!node.step && node.kind === 'core') ? '★ ' : ''}{node.name}</div>
          <div style={{ fontSize: 11, color: 'var(--c-6a6a90)', marginTop: 3, fontFamily: 'monospace' }}>
            {fmtVol(node.totalVol)} searches/mo · {node.kwCount} keywords · {kindLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 6, padding: '4px 9px', whiteSpace: 'nowrap' }}>
            {node.action === 'optimize' ? 'Existing page' : (node.state === 'competitor' ? 'Competitor only' : 'Build net-new')}
          </span>
          <button onClick={onClose} aria-label="Close detail" title="Close (Esc)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, flexShrink: 0, background: 'var(--ca-120-120-160-0_05)', border: '1px solid var(--c-1f1f3a)', borderRadius: 6, color: 'var(--c-8080a0)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}><i className="ti ti-x" /></button>
        </div>
      </div>

      <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--c-4a4a6a)', marginTop: 14 }}>WHY IT CONNECTS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
        {rels.length ? rels.map((r, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, color: 'var(--c-8080a0)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: 4, padding: '2px 6px', color: EDGE_WHY_COLOR[r.kind], background: `${EDGE_WHY_COLOR[r.kind]}1f` }}>{r.why}</span>
            <i className="ti ti-arrow-right" style={{ color: 'var(--c-4a4a6a)' }} />
            <span style={{ color: 'var(--c-c8c8e8)' }}>{r.name}</span>
          </div>
        )) : <span style={{ color: 'var(--c-4a4a6a)', fontSize: 11.5 }}>Standalone entry point.</span>}
      </div>

      <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--c-4a4a6a)', marginTop: 14 }}>YOUR COVERAGE OF THIS TOPIC&rsquo;S DEMAND</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--c-1a1a30)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${node.clientCovPct}%`, background: col }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--c-8080a0)', minWidth: 132, textAlign: 'right' }}>{node.clientCovPct}% of {fmtVol(node.totalVol)}/mo ranked</span>
      </div>

      {node.keywords.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--c-4a4a6a)', marginTop: 14 }}>KEYWORDS IN THIS CLUSTER</div>
          <KeywordTable rows={node.keywords.map((k) => ({ keyword: k.keyword, volume: k.searchVolume, rank: k.rank, state: k.state }))} />
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'var(--ca-120-120-160-0_05)', border: '1px solid var(--c-1f1f3a)', borderRadius: 8, padding: '9px 11px' }}>
        <i className="ti ti-bulb" style={{ color: col, fontSize: 15 }} />
        <span style={{ fontSize: 11.5, color: 'var(--c-9090b8)' }}>{rec}</span>
      </div>

      {node.url ? (
        <a href={node.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, fontWeight: 600, color: col, background: 'transparent', border: `1px solid ${col}55`, borderRadius: 8, padding: '7px 12px', textDecoration: 'none' }}>
          <i className="ti ti-external-link" /> Optimize existing page <span style={{ color: 'var(--c-6a6a90)', fontWeight: 400 }}>{node.url}</span>
          {bestRank != null && <span style={{ color: 'var(--c-6a6a90)', fontWeight: 400 }}>· best rank #{bestRank}</span>}
        </a>
      ) : (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, fontWeight: 600, color: col, background: 'transparent', border: `1px solid ${col}55`, borderRadius: 8, padding: '7px 12px' }}>
          <i className="ti ti-pencil-plus" /> Add to content plan (net-new build)
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JourneySection({ projectId, kwVersion, analysis, competitors, canonicalTopics, onDeepJourneyBuilt }: Props) {
  const [claudeAssignments, setClaudeAssignments] = useState<Record<string, IntentType>>({});
  const [uploadedKeywords,  setUploadedKeywords]  = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('combined');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);   // v7.160: pill hover glow
  // v7.256: canonical journey has two presentations — the list (current state) and a
  // behavioral mind-map / knowledge graph. Toggle lives at the top of the canonical view.
  const [journeyView, setJourneyView] = useState<'list' | 'mindmap'>('list');
  const [edges, setEdges] = useState<{ preProduct: [string, string][]; product: [string, string][] }>({ preProduct: [], product: [] });
  const [problemAssignments, setProblemAssignments] = useState<Record<string, string>>({});   // v7.154: kw -> AI-named pre-product theme
  const [selected, setSelected] = useState<JourneyNode | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState<JGNode | null>(null);   // v7.175 connected-map selection
  // v7.188: scroll the detail panel into view on select (it sits below the map, so a
  // click otherwise looked like nothing happened) + Esc clears the focused journey.
  const detailRef = useRef<HTMLDivElement | null>(null);
  // v7.218: only the footprint-mode DetailPanel sits at the bottom and needs the
  // scroll-into-view. The demand-mode TopicJourneyMap now shows its detail as an
  // overlay anchored under the clicked box, so no scroll (and no jump) is wanted.
  useEffect(() => {
    if (selected) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelected(null); setSelectedGraphNode(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // v7.155: demand universe (persisted on the snapshot once the on-demand build runs)
  const [demandUniverse, setDemandUniverse] = useState<DemandUniverse | null>(
    () => readDemandCache(analysis),   // v7.157: snapshot → localStorage fallback (survives tab remount)
  );
  const [building, setBuilding]     = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  // v7.156: live build progress for the determinate bar + ETA.
  const [progress, setProgress] = useState<{ done: number; total: number; seed: string; startedAt: number } | null>(null);
  // v7.159: measured connector geometry (active pill middle → persona bracket).
  const leftZoneRef   = useRef<HTMLDivElement | null>(null);
  const activePillRef = useRef<HTMLButtonElement | null>(null);
  const personaRef    = useRef<HTMLDivElement | null>(null);
  const [conn, setConn] = useState<{ line: string; brace: string; w: number; h: number } | null>(null);

  const clientDomain = (analysis?.semrushSnapshot as any)?.domain ?? '';
  const industry     = (analysis as any)?._industry ?? 'General';
  const segments: AudienceSegment[] = useMemo(
    () => (analysis?.semrushSnapshot as any)?._audienceSegments ?? [],
    [analysis],
  );

  useEffect(() => {
    if (!analysis?.id) return;
    const cacheKey = `orbitiq-clusters-${analysis.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { version?: number; assignments?: Record<string, IntentType> };
        if (parsed.version === 2 && parsed.assignments) setClaudeAssignments(parsed.assignments);
      }
    } catch {}
  }, [analysis?.id]);

  // Fetch uploaded/CSV keywords from DB — re-runs when projectId changes
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/keywords`)
      .then((r: Response) => r.ok ? r.json() : { keywords: [] })
      .then((d: any) => setUploadedKeywords(d.keywords ?? []))
      .catch(() => {});
  }, [projectId, kwVersion]);   // v7.107: kwVersion bump → refetch uploaded keywords

  // v7.154: deterministic pass (no AI names) — stable source for the pre-product
  // keyword set we send to the naming route. Independent of problemAssignments so
  // it can't loop with the fetch effect below.
  const problemKwList = useMemo(() => {
    const det = buildClusters(analysis, claudeAssignments, clientDomain, competitors ?? [], uploadedKeywords, {});
    return det.filter((c: ThemeCluster) => c.type === 'problem')
              .flatMap((c: ThemeCluster) => c.keywords.map((k: KwItem) => k.keyword));
  }, [analysis, claudeAssignments, clientDomain, competitors, uploadedKeywords]);

  const clusters = useMemo(
    () => buildClusters(analysis, claudeAssignments, clientDomain, competitors ?? [], uploadedKeywords, problemAssignments),
    [analysis, claudeAssignments, clientDomain, competitors, uploadedKeywords, problemAssignments],
  );

  const allNodes   = useMemo(() => clusters.map(clusterToNode), [clusters]);
  const fpPreNodes  = useMemo(() => allNodes.filter((n: JourneyNode) => n.lane === 'pre-product'), [allNodes]);
  const fpProdNodes = useMemo(() => allNodes.filter((n: JourneyNode) => n.lane === 'product'), [allNodes]);

  // v7.155/v7.157: keep demandUniverse in sync when the loaded analysis changes —
  // server snapshot first, then the localStorage cache (so an in-session rebuild
  // survives leaving and re-entering this panel; the panel unmounts on tab change).
  useEffect(() => {
    // v7.208: drop blocklisted competitor brands from the demand universe before it
    // feeds the journey nodes, so "Topics in journey" and every node honour the rule.
    setDemandUniverse(filterUniverseExcludedBrands(readDemandCache(analysis), (analysis?.semrushSnapshot as any) ?? {}));
    setBuildError(null);
  }, [analysis?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // v7.155: when the demand universe exists, build the journey from it (theme ×
  // funnel stage, every node volume-backed) overlaid with the ranking footprint.
  // v7.158: filtered per active segment via seed→segment provenance.
  const demandMode = !!(demandUniverse && (demandUniverse.topics?.length ?? 0) > 0);
  const footprint  = useMemo(() => buildFootprintSets(analysis, uploadedKeywords), [analysis, uploadedKeywords]);
  // v7.170: exclusive theme→persona partition (segment.id or SHARED_BUCKET).
  const seedBucket = useMemo(
    () => demandMode ? assignSeedSegments(demandUniverse as DemandUniverse, segments) : new Map<string, string>(),
    [demandMode, demandUniverse, segments],
  );
  // activeTab is 'combined' (→ null, no filter), a segment.id, or SHARED_BUCKET.
  const activeBucketId = activeTab === 'combined' ? null : activeTab;

  // v7.247: canonical clusters are the default render path (Const II.7). Restore the
  // per-segment slice that regressed when canonical mode became the default: attribute
  // every canonical topic to ONE persona bucket (segment.id or SHARED) by the SAME
  // exclusive audience-language overlap the demand journey uses (v7.170 partition, so
  // the per-segment slices sum to the combined total). Keyed by topic so a topic lands
  // in exactly one bucket; the bucket signal is the topic's own real language (its
  // category, its product label, and its keyword text) — never a modeled split.
  const canonicalMode = (canonicalTopics?.length ?? 0) > 0;
  const segTok = useMemo(() => buildSegTokens(segments), [segments]);
  const canonTopicBucket = useMemo(() => {
    const m = new Map<string, string>();
    if (!canonicalTopics || segTok.length === 0) return m;
    for (const t of canonicalTopics) {
      const text = [t.parentName, t.product, ...t.keywords.map(k => k.keyword)].join(' ');
      m.set(t.id, bucketForText(text, segTok));
    }
    return m;
  }, [canonicalTopics, segTok]);
  // The topics passed to the canonical view: all topics for "All Segments" (null), or
  // just the active persona's slice. When segments exist but the active bucket has no
  // topics, the view renders honest zeros (Const I.5) rather than disappearing.
  const filteredCanonicalTopics = useMemo(() => {
    if (!canonicalTopics) return null;
    if (!activeBucketId || segTok.length === 0) return canonicalTopics;
    return canonicalTopics.filter(t => canonTopicBucket.get(t.id) === activeBucketId);
  }, [canonicalTopics, activeBucketId, segTok, canonTopicBucket]);

  // v7.188: keyword → client SERP position (rank), so the detail panel can show the
  // live rank next to each keyword. Source = the snapshot's ranked rows (topKeywords
  // carry position) plus any uploaded/CSV rows that carry a position. Declared before
  // the demand/graph builders that consume it (no temporal-dead-zone).
  const rankByKeyword = useMemo(() => {
    const m: Record<string, number> = {};
    const snap = (analysis?.semrushSnapshot as any) ?? {};
    for (const k of (snap.topKeywords ?? [])) {
      const kw = (k.keyword ?? '').toLowerCase().trim();
      const pos = k.position;
      if (kw && pos != null && pos > 0 && (m[kw] == null || pos < m[kw])) m[kw] = pos;
    }
    for (const k of (uploadedKeywords ?? [])) {
      if (k.source === 'blocked' || k.type === 'gap') continue;
      const kw = (k.keyword ?? '').toLowerCase().trim();
      const pos = k.position;
      if (kw && pos != null && pos > 0 && (m[kw] == null || pos < m[kw])) m[kw] = pos;
    }
    return m;
  }, [analysis, uploadedKeywords]);

  const demand = useMemo(
    () => demandMode ? buildDemandNodes(demandUniverse as DemandUniverse, footprint.client, footprint.competitor, activeBucketId, seedBucket, rankByKeyword) : null,
    [demandMode, demandUniverse, footprint, activeBucketId, seedBucket, rankByKeyword],
  );

  // v7.211: when the page supplies the canonical cluster topics, the journey shows ONE
  // NODE PER CLUSTER (so "Topics in journey" === the cluster count). Falls back to the
  // demand/footprint node models when no canonical topics are passed.
  const canonicalNodes = useMemo(
    () => (canonicalTopics && canonicalTopics.length) ? nodesFromCanonical(canonicalTopics) : null,
    [canonicalTopics],
  );
  const canonPre  = useMemo(() => canonicalNodes ? canonicalNodes.filter((n) => n.lane === 'pre-product') : null, [canonicalNodes]);
  const canonProd = useMemo(() => canonicalNodes ? canonicalNodes.filter((n) => n.lane === 'product') : null, [canonicalNodes]);

  const preNodes  = canonPre  ?? (demand ? demand.preNodes  : fpPreNodes);
  const prodNodes = canonProd ?? (demand ? demand.prodNodes : fpProdNodes);

  // v7.175: keyword → real ranking page (snapshot rows + persisted _pageMap) so
  // every journey node can resolve an existing page to optimise vs a net-new build.
  const urlByKeyword = useMemo(() => {
    const m: Record<string, string> = {};
    const snap = (analysis?.semrushSnapshot as any) ?? {};
    for (const k of (snap.topKeywords ?? [])) {
      const kw = (k.keyword ?? '').toLowerCase().trim();
      if (kw && k.url) m[kw] = k.url;
    }
    for (const pg of (snap._pageMap?.pages ?? [])) {
      if (!pg?.url) continue;
      for (const kw of (pg.keywords ?? [])) { const k = String(kw).toLowerCase().trim(); if (k) m[k] = pg.url; }
    }
    return m;
  }, [analysis]);

  // v7.175: AI-phrased problem-theme labels (best-effort) — reuse the cached
  // journey-problem AI names; a demand problem seed inherits the theme name of any
  // footprint problem keyword that contains it. Falls back to the seed (title-cased)
  // inside buildJourneyGraph, so labels improve when AI names exist but never block.
  const themeLabels = useMemo(() => {
    const m: Record<string, string> = {};
    const seeds = (demandUniverse?.problemSeeds ?? []).map((s: string) => s.toLowerCase());
    for (const seed of seeds) {
      for (const kw of Object.keys(problemAssignments)) {
        if (kw.includes(seed)) { m[seed] = problemAssignments[kw]; break; }
      }
    }
    return m;
  }, [demandUniverse, problemAssignments]);

  // v7.189: the per-topic JOURNEY graph — each topic (seed) expands into ordered
  // step nodes (what it is → why → what affects it → how to → compare → act) chained
  // by 'next' edges, with cross-topic 'related' links only on real overlap. Replaces
  // the v7.175 problem→core→support model that collapsed each topic to a single node
  // and meshed topics into one hub. The Content panel still uses buildJourneyGraph
  // (via lib/journey/contentPlan) — that rollup is intentionally left unchanged.
  const graph = useMemo<JGraph | null>(
    () => demandMode ? buildTopicJourneyGraph(demandUniverse as any, {
      clientRanked: footprint.client, competitorRanked: footprint.competitor,
      urlByKeyword, rankByKeyword, activeBucketId, seedBucket, themeLabels,
    }) : null,
    [demandMode, demandUniverse, footprint, urlByKeyword, rankByKeyword, activeBucketId, seedBucket, themeLabels],
  );

  // v7.156: consume the route's NDJSON progress stream so the UI shows a
  // determinate bar + ETA ("seed X of N") instead of an indefinite spinner.
  async function buildDeepJourney() {
    setBuilding(true); setBuildError(null);
    setProgress({ done: 0, total: 0, seed: '', startedAt: Date.now() });
    try {
      const r = await fetch(`/api/projects/${projectId}/demand-universe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linesPerSeed: 50 }),
      });
      // Pre-stream validation failures come back as a normal JSON error.
      if (!r.ok || !r.body) {
        let msg = `Build failed (${r.status})`;
        try { const d = await r.json(); msg = d?.error ?? msg; } catch {}
        setBuildError(msg);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: any;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'start') {
            setProgress((p) => ({ done: 0, total: ev.total ?? 0, seed: '', startedAt: p?.startedAt ?? Date.now() }));
          } else if (ev.type === 'progress') {
            setProgress((p) => ({ done: ev.done, total: ev.total, seed: ev.seed ?? '', startedAt: p?.startedAt ?? Date.now() }));
          } else if (ev.type === 'error') {
            setBuildError(ev.error ?? 'Build failed');
          } else if (ev.type === 'done' && ev.demandUniverse) {
            setDemandUniverse(ev.demandUniverse);
            setSelected(null);
            // v7.157: cache so it survives leaving/re-entering this panel in-session
            // (the parent's analysis prop isn't refetched until a full reload).
            try { window.localStorage.setItem(demandCacheKey(analysis), JSON.stringify(ev.demandUniverse)); } catch {}
            // v7.222: the universe is now persisted on the analysis — tell the page to
            // refetch so the Keyword / Clusters / Content panels pick it up immediately
            // (they read _demandUniverse from the analysis snapshot, not this panel's state).
            onDeepJourneyBuilt?.();
          }
        }
      }
    } catch (e) {
      setBuildError(String((e as any)?.message ?? e));
    } finally {
      setBuilding(false);
      setProgress(null);
    }
  }

  // v7.152: AI-inferred topic relationships (cached client-side, like cluster intents).
  // Fault-tolerant: on failure or no key, the stage-order fallback below is used.
  useEffect(() => {
    if (!analysis?.id || allNodes.length === 0) return;
    const cacheKey = `orbitiq-journey-edges-${analysis.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { version?: number; edges?: { preProduct: [string, string][]; product: [string, string][] } };
        if (parsed.version === 1 && parsed.edges) { setEdges(parsed.edges); return; }
      }
    } catch {}
    const payload = {
      clusters: allNodes.map((n: JourneyNode) => ({ name: n.name, stage: n.stage, lane: n.lane })),
      industry, domain: clientDomain,
    };
    let cancelled = false;
    fetch(`/api/projects/${projectId}/journey-edges`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
      .then((r: Response) => r.ok ? r.json() : null)
      .then((d: any) => {
        if (cancelled || !d?.edges) return;
        setEdges(d.edges);
        try { localStorage.setItem(cacheKey, JSON.stringify({ version: 1, edges: d.edges })); } catch {}
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.id, projectId, industry, clientDomain, allNodes]);

  // v7.154: AI-named pre-product problem themes (cached client-side, fault-tolerant).
  // On no key / failure, problemAssignments stays {} and buildClusters uses the
  // deterministic anchor names — the pre-product lane always renders.
  useEffect(() => {
    if (!analysis?.id || problemKwList.length === 0) return;
    const sig = problemKwList.length + ':' + problemKwList.slice(0, 40).join('|');
    const cacheKey = `orbitiq-journey-problems-${analysis.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { version?: number; sig?: string; assignments?: Record<string, string> };
        // v7.187: bump to v2 — invalidates any theme names cached by the old engine.
        if (parsed.version === 2 && parsed.sig === sig && parsed.assignments) { setProblemAssignments(parsed.assignments); return; }
      }
    } catch {}
    let cancelled = false;
    fetch(`/api/projects/${projectId}/journey-problem-clusters`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: problemKwList, industry, domain: clientDomain }),
    })
      .then((r: Response) => r.ok ? r.json() : null)
      .then((d: any) => {
        if (cancelled || !d?.assignments || Object.keys(d.assignments).length === 0) return;
        setProblemAssignments(d.assignments);
        try { localStorage.setItem(cacheKey, JSON.stringify({ version: 2, sig, assignments: d.assignments })); } catch {}
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.id, projectId, industry, clientDomain, problemKwList]);

  // Demand mode: within-theme stage edges (no cross-theme hub). Footprint mode:
  // AI-inferred edges with the stage-order fallback (v7.152 behavior).
  // v7.211: one-node-per-cluster edges are guarded — the within-theme mesh is O(n²), so
  // above MAX_EDGE_MESH_NODES we render nodes with no mesh (the funnel columns still read
  // left→right) rather than hang the panel. Nodes themselves are never capped.
  const preEdges  = canonPre  ? (canonPre.length  <= MAX_EDGE_MESH_NODES ? withinThemeEdges(canonPre)  : []) : (demand ? demand.preEdges  : (edges.preProduct.length ? edges.preProduct : sharedThemeEdges(fpPreNodes)));
  const prodEdges = canonProd ? (canonProd.length <= MAX_EDGE_MESH_NODES ? withinThemeEdges(canonProd) : []) : (demand ? demand.prodEdges : (edges.product.length    ? edges.product    : sharedThemeEdges(fpProdNodes)));

  // v7.170: in demand mode the personas + a "Shared / all personas" bucket are an
  // exclusive partition of the journey topics, so they sum to the combined total.
  const tabs = useMemo(() => [
    { id: 'combined', label: 'All Segments' },
    ...segments.map((s: AudienceSegment) => ({ id: s.id, label: s.name })),
    ...((demandMode || canonicalMode) && segments.length > 0 ? [{ id: SHARED_BUCKET, label: 'Shared / all personas' }] : []),
  ], [segments, demandMode, canonicalMode]);

  const activeSegment = activeTab === 'combined' ? null : segments.find((s: AudienceSegment) => s.id === activeTab) ?? null;
  const segIdx = activeSegment ? segments.indexOf(activeSegment) : -1;
  const segAccent = segIdx >= 0 ? SEGMENT_ACCENTS[segIdx % SEGMENT_ACCENTS.length] : null;

  // v7.159: measure the active pill + persona card and draw the connector so the
  // line always lands on the MIDDLE of the active pill. Recompute on tab change,
  // segment data change, and container resize (responsive wrap).
  useIsoLayoutEffect(() => {
    if (!activeSegment) { setConn(null); return; }
    const measure = () => {
      const zone = leftZoneRef.current, pill = activePillRef.current, per = personaRef.current;
      if (!zone || !pill || !per) { setConn(null); return; }
      const c = zone.getBoundingClientRect();
      const p = pill.getBoundingClientRect();
      const r = per.getBoundingClientRect();
      const paths = buildConnector({
        pillRightX: p.right - c.left,
        pillMidY:   p.top + p.height / 2 - c.top,
        perLeft:    r.left - c.left,
        perTop:     r.top - c.top,
        perBottom:  r.bottom - c.top,
      });
      setConn({ line: paths.line, brace: paths.brace, w: c.width, h: c.height });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && leftZoneRef.current) ro.observe(leftZoneRef.current);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [activeTab, activeSegment, segIdx, demandMode, segments]);   // eslint-disable-line react-hooks/exhaustive-deps

  const preLLMPrompts = activeSegment
    ? (activeSegment.preLLMPrompts ?? [])
    : segments.flatMap((s: AudienceSegment) => s.preLLMPrompts ?? []);
  const productPrompts = activeSegment
    ? (activeSegment.productPrompts ?? [])
    : segments.flatMap((s: AudienceSegment) => s.productPrompts ?? []);

  const hasData = segments.length > 0 || clusters.length > 0 || demandMode || (canonicalTopics?.length ?? 0) > 0;   // v7.211: canonical clusters also populate the journey

  if (!hasData) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>🗺️</div>
        <p style={{ color: 'var(--c-4a4a6a)', fontSize: 13 }}>
          Run an analysis to populate the Journey panel. Audience segments and keyword clusters are required.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-4a4a6a)', marginBottom: 5 }}>
          Foundation · 04
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-dcdcf4)', margin: 0 }}>Audience Journeys</h2>
        <p style={{ fontSize: 12, color: 'var(--c-5a5a80)', marginTop: 5 }}>
          How each segment moves from life-problem search to product decision &mdash; a topic mind map color-coded by content coverage.
        </p>
      </div>

      {/* v7.159: segment pills stacked left + persona card (bracket-connected) · build control right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginBottom: 18, flexWrap: 'wrap' }}>

        {/* Left zone — pills + (when a segment is active) bracket connector + persona */}
        <div ref={leftZoneRef} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 0, flex: '1 1 560px', minWidth: 320 }}>

          {/* stacked pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', flex: '0 0 auto' }}>
            {tabs.map((tab: { id: string; label: string }, tabIdx: number) => {
              const isActive = activeTab === tab.id;
              const isHovered = hoveredTab === tab.id;
              const tSeg = tab.id !== 'combined' ? segments.find((s: AudienceSegment) => s.id === tab.id) : null;
              const tAccent = tSeg ? SEGMENT_ACCENTS[(tabIdx - 1) % SEGMENT_ACCENTS.length] : null;
              const ac = tAccent ? tAccent.text : 'var(--c-8080a0)';
              const lit = isActive || isHovered;   // v7.160: active OR hovered → accent + glow
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  ref={isActive ? activePillRef : undefined}
                  onMouseEnter={() => setHoveredTab(tab.id)}
                  onMouseLeave={() => setHoveredTab((h: string | null) => (h === tab.id ? null : h))}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: tSeg ? '4px 11px 4px 4px' : '7px 13px',
                    fontSize: 12, fontWeight: isActive ? 700 : 500,
                    color: lit ? ac : 'var(--c-6a6a90)',
                    background: isActive ? `${ac}14` : (isHovered ? `${ac}0d` : 'transparent'),
                    border: `1px solid ${lit ? ac + '55' : 'var(--c-1a1a30)'}`,
                    boxShadow: lit ? `0 0 0 1px ${ac}22, 0 0 14px ${ac}40` : 'none',
                    borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}>
                  {tSeg && (
                    tSeg.personaImageUrl ? (
                      <img src={tSeg.personaImageUrl} alt={`Portrait representing ${tSeg.name}`} loading="lazy"
                        style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${ac}` }} />
                    ) : (
                      <span style={{ width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${ac}`, color: ac, background: `${ac}10`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600 }}>
                        {initialsOf(tSeg.name)}
                      </span>
                    )
                  )}
                  {tab.label}
                  {tSeg && (
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: isActive ? `${ac}1f` : 'var(--ca-50-50-70-0_4)', color: isActive ? ac : 'var(--c-4a4a6a)', fontWeight: 600 }}>
                      {tSeg.volumePct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* bracket gutter + persona card (only when a single segment is active) */}
          {activeSegment && segAccent && (
            <>
              <div style={{ flex: '0 0 58px' }} aria-hidden="true" />
              <div ref={personaRef} style={{ alignSelf: 'center', flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${segAccent.border}44`, borderRadius: 12, background: segAccent.bg, padding: '14px 16px' }}>
                {activeSegment.personaImageUrl ? (
                  <img src={activeSegment.personaImageUrl} alt={`Portrait representing ${activeSegment.name}`} loading="lazy"
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${segAccent.border}`, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0, background: segAccent.bg, border: `2px solid ${segAccent.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: segAccent.text, fontSize: 18, fontWeight: 600 }}>
                    {initialsOf(activeSegment.name)}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-dcdcf4)', marginBottom: 3 }}>{activeSegment.name}</div>
                  <p style={{ fontSize: 11.5, color: 'var(--c-8a8ab0)', margin: '0 0 5px', lineHeight: 1.5 }}>{activeSegment.whoTheyAre.trigger}</p>
                  <p style={{ fontSize: 12, color: 'var(--c-9090b0)', fontStyle: 'italic', margin: 0 }}>&ldquo;{activeSegment.tagline}&rdquo;</p>
                </div>
              </div>

              {/* measured connector: faint line from the active pill's MIDDLE + curly brace embracing the persona */}
              {conn && (
                <svg width={conn.w} height={conn.h} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }} aria-hidden="true">
                  <path d={conn.line}  fill="none" stroke={segAccent.border} strokeWidth={1}   opacity={0.5} />
                  <path d={conn.brace} fill="none" stroke={segAccent.border} strokeWidth={1.4} opacity={0.65} strokeLinecap="round" />
                </svg>
              )}
            </>
          )}
        </div>

        {/* v7.242: build-status / "build deep journey" control fully removed from the */}
        {/* Journey panel (Wayne). The build lives only on the Keyword panel's workflow */}
        {/* bar; this panel is purely a display of the journey.                          */}
      </div>

      <Legend />

      {(canonicalTopics?.length ?? 0) > 0 ? (
        /* v7.221: canonical clusters are the single source of truth (Const II.7) — the
           journey count + the (collapsible, category-grouped) map come straight from the
           cluster topics, so "Topics in journey" reconciles to the Cluster panel count.
           The demand-universe graph below is only the legacy fallback when no canonical
           topics exist (the deep journey still backfills INTO the clusters this reads). */
        <>
          {/* v7.256: List ⇄ Mind-map toggle. List = current collapsible content plan;
              Mind-map = behavioral knowledge graph of the same canonical topics. */}
          <JourneyViewToggle view={journeyView} onChange={setJourneyView} />
          {journeyView === 'list' ? (
            <CanonicalJourneyView
              topics={(filteredCanonicalTopics ?? canonicalTopics) as CanonicalJourneyTopic[]}
              problemSeeds={(demandUniverse?.problemSeeds ?? (analysis?.semrushSnapshot as any)?._demandUniverse?.problemSeeds ?? []) as string[]}
              segmentLabel={activeSegment ? activeSegment.name : (activeBucketId === SHARED_BUCKET ? 'Shared / all personas' : null)}
            />
          ) : (
            <JourneyMindMap
              topics={(filteredCanonicalTopics ?? canonicalTopics) as CanonicalJourneyTopic[]}
              problemSeeds={(demandUniverse?.problemSeeds ?? (analysis?.semrushSnapshot as any)?._demandUniverse?.problemSeeds ?? []) as string[]}
              segmentLabel={activeSegment ? activeSegment.name : (activeBucketId === SHARED_BUCKET ? 'Shared / all personas' : null)}
              clientDomain={clientDomain}
            />
          )}
        </>
      ) : demand && graph ? (
        /* v7.175: ONE connected journey — problem topics link by co-search, bridge
           to the product that solves them, and fan into supporting decision topics. */
        <>
          <ContentPlanSummary graph={graph} />

          <div style={{ border: '1px solid var(--c-1a1a30)', borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ca-34-211-238-0_1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-sitemap" style={{ color: 'var(--c-22d3ee)', fontSize: 14 }} />
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-c8c8e8)' }}>Topic Journeys</span>
                  <p style={{ fontSize: 11, color: 'var(--c-5a5a80)', marginTop: 1 }}>
                    Each topic is its own journey &mdash; what it is &rarr; how to do it &rarr; how to choose &rarr; act. Every step&rsquo;s keywords + volumes are real Semrush demand.
                  </p>
                </div>
              </div>
              {/* relationship legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                {([['next', 'Journey step'], ['related', 'Related topic']] as [JEdgeKind, string][]).map(([k, l]: [JEdgeKind, string]) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--c-8080a0)' }}>
                    <svg width={26} height={8}><line x1={0} y1={4} x2={26} y2={4} stroke={EDGE_COLOR[k]} strokeWidth={2.4} strokeDasharray={k === 'related' ? '4 3' : undefined} /></svg>{l}
                  </span>
                ))}
              </div>
            </div>
            {preLLMPrompts.length > 0 && <PromptStrip prompts={preLLMPrompts} accent="var(--c-22d3ee)" />}
            {productPrompts.length > 0 && <PromptStrip prompts={productPrompts} accent="var(--c-a78bfa)" />}
            <TopicJourneyMap graph={graph} onSelect={setSelectedGraphNode} onClear={() => setSelectedGraphNode(null)} selectedId={selectedGraphNode?.id ?? null} />
          </div>
          {/* v7.218: the per-topic detail now renders as an overlay anchored under
              the clicked box inside TopicJourneyMap — no bottom panel / scroll here. */}
        </>
      ) : (
        /* Footprint mode (no demand universe yet) — the v7.161 two-lane view. */
        <>
          <CombinedSummary preNodes={preNodes} prodNodes={prodNodes} />

          <div style={{ background: 'var(--ca-34-211-238-0_02)', border: '1px solid var(--ca-34-211-238-0_15)', borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ca-34-211-238-0_1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-bulb" style={{ color: 'var(--c-22d3ee)', fontSize: 14 }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-22d3ee)' }}>Pre-Product Journey</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--ca-34-211-238-0_1)', color: 'var(--c-22d3ee)', border: '1px solid var(--ca-34-211-238-0_2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Problem-aware
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--c-4a7a80)', marginTop: 2 }}>
                  They have a life problem but don&apos;t know your product exists yet.
                </p>
              </div>
            </div>
            {preLLMPrompts.length > 0 && <PromptStrip prompts={preLLMPrompts} accent="var(--c-22d3ee)" />}
            <MindMap nodes={preNodes} edges={preEdges} onSelect={setSelected} onClear={() => setSelected(null)} selectedId={selected?.id ?? null} />
            <CompletenessRow nodes={preNodes} />
          </div>

          <div style={{ border: '1px solid var(--c-1a1a30)', borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ca-167-139-250-0_1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-route" style={{ color: 'var(--c-a78bfa)', fontSize: 14 }} />
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-a78bfa)' }}>Product Journey</span>
                <p style={{ fontSize: 11, color: 'var(--c-5a5a80)', marginTop: 1 }}>
                  Full funnel &mdash; searchers aware of the category and evaluating options.
                </p>
              </div>
            </div>
            {productPrompts.length > 0 && <PromptStrip prompts={productPrompts} accent="var(--c-a78bfa)" />}
            <MindMap nodes={prodNodes} edges={prodEdges} onSelect={setSelected} onClear={() => setSelected(null)} selectedId={selected?.id ?? null} />
            <CompletenessRow nodes={prodNodes} />
          </div>

          <div ref={detailRef}>
            {selected && <FocusBanner name={selected.name} onExit={() => setSelected(null)} />}
            <DetailPanel node={selected} onClose={() => setSelected(null)} />
          </div>
        </>
      )}
    </div>
  );
}
