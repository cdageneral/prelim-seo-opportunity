'use client';

import { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  buildJourneyGraph,
  SUPPORT_LABEL,
  type JourneyGraph as JGraph,
  type GraphNode as JGNode,
  type EdgeKind as JEdgeKind,
} from '@/lib/journey/graph';

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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNEY_STAGE_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
const JOURNEY_STAGE_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};
const STAGE_COLORS: Record<JourneyStage, { border: string; text: string; bg: string }> = {
  awareness:     { border: '#22d3ee', text: '#22d3ee', bg: 'rgba(34,211,238,0.06)'  },
  consideration: { border: '#a78bfa', text: '#a78bfa', bg: 'rgba(167,139,250,0.06)' },
  decision:      { border: '#34d399', text: '#34d399', bg: 'rgba(52,211,153,0.06)'  },
  retention:     { border: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.06)'  },
};

const SEGMENT_ACCENTS = [
  { border: '#22d3ee', text: '#22d3ee', bg: 'rgba(34,211,238,0.08)'  },
  { border: '#a78bfa', text: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  { border: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
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

function isBranded(keyword: string, clientDomain: string, competitorDomains: string[]): boolean {
  if (!keyword) return false;
  const kw = keyword.toLowerCase().trim();
  const kwNorm = kw.replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;
  const baseBrands = [clientDomain, ...competitorDomains].map(extractBrand).filter(b => b.length >= 4);
  if (!baseBrands.length) return false;
  const tokenSet = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
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

// Body-part words that appear in BOTH procedure names and problem searches.
const ANATOMY_WORDS = new Set<string>([
  'breast','breasts','boob','boobs','chest','nipple','nipples',
  'stomach','belly','tummy','abdomen','abdominal','waist','waistline','midsection','flank','flanks',
  'chin','neck','jaw','jawline','face','facial','cheek','cheeks','eye','eyes','eyelid','brow',
  'arm','arms','thigh','thighs','leg','legs','knee','calf','calves','ankle',
  'hip','hips','butt','buttock','buttocks','back','bra','love','handle','handles',
  'skin','fat','cellulite','body','double','area','areas','muffin','top','bulge','bulges',
]);

// Commerce/format modifiers that sit inside category names but are not the
// procedure itself (so they are stripped when deriving the distinctive word).
const PROC_NAME_NOISE = new Set<string>([
  'with','from','that','this','your','near','best','top',
  'cost','costs','price','prices','pricing','reviews','review',
  'services','service','treatment','treatments','procedure','procedures',
  'clinic','center','centre','before','after','results','recovery','specials','financing',
]);

// Distinctive procedure words from a category name (drop anatomy + noise).
function procedureWords(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w: string) => w.length >= 4 && !ANATOMY_WORDS.has(w) && !PROC_NAME_NOISE.has(w));
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

// Deterministic pre-product theme (fallback when the AI naming pass is
// unavailable). Anchors on the most salient body-part/problem token so themes
// are domain-agnostic; the AI route replaces these with cleaner names.
const PROBLEM_ANCHORS: Array<[string, string]> = [
  ['love handle', 'Love Handles'], ['muffin top', 'Muffin Top'], ['double chin', 'Double Chin'],
  ['loose skin', 'Loose / Sagging Skin'], ['saggy', 'Loose / Sagging Skin'], ['sagging', 'Loose / Sagging Skin'],
  ['belly', 'Belly / Midsection'], ['stomach', 'Belly / Midsection'], ['tummy', 'Belly / Midsection'], ['midsection', 'Belly / Midsection'],
  ['breast', 'Breast Concerns'], ['boob', 'Breast Concerns'], ['chest', 'Breast Concerns'],
  ['chin', 'Chin / Neck'], ['neck', 'Chin / Neck'], ['jowl', 'Chin / Neck'],
  ['thigh', 'Legs / Thighs'], ['leg', 'Legs / Thighs'], ['calf', 'Legs / Thighs'], ['knee', 'Legs / Thighs'],
  ['arm', 'Arm Concerns'],
  ['weight', 'Weight Loss'], ['obese', 'Weight Loss'], ['bmi', 'Weight Loss'],
  ['cellulite', 'Cellulite'], ['wrinkle', 'Aging / Wrinkles'], ['aging', 'Aging / Wrinkles'],
  ['fat', 'Stubborn Fat'], ['bulge', 'Stubborn Fat'],
];
function deterministicProblemTheme(keyword: string): string {
  const k = keyword.toLowerCase();
  for (const [needle, theme] of PROBLEM_ANCHORS) { if (k.includes(needle)) return theme; }
  return 'General Problem Searches';
}

// ─── v7.173: client-relevance gate (deterministic, defensible) ──────────────────
// Mirrors ContentMapSection. A keyword only enters the pre-product "problem" pool
// if it is topically relevant to THIS client's demand domain: it must EITHER hit
// a curated body-problem anchor, OR name a body area (whole-word anatomy term),
// OR share a distinctive token with the client's own category names or brand. A
// keyword that names no solution AND matches none of these (e.g. "what is a
// hurricane", "israel palestine conflict explained") is off-topic noise: it
// shares zero vocabulary with the client and is dropped from the demand universe
// BEFORE clustering. Because this buildClusters is the SAME one the Executive
// Summary consumes, the drop also keeps the rollup clean. No AI, no modeling —
// every drop is explainable by zero overlap with the client's anchors, anatomy,
// category names, or brand.
function buildRelevanceTokens(
  categories: Array<{ name: string; type: string }>,
  clientDomain: string,
  competitorDomains: string[],
): Set<string> {
  const tokens = new Set<string>();
  for (const c of categories) {
    const words = c.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w: string) => w.length >= 4 && !PROC_NAME_NOISE.has(w));
    for (const w of words) tokens.add(w);
  }
  for (const t of brandTokensOf(clientDomain, competitorDomains)) {
    if (t.length >= 4) tokens.add(t);
  }
  return tokens;
}

function isClientRelevant(keyword: string, relevanceTokens: Set<string>): boolean {
  const k = keyword.toLowerCase();
  // 1) curated body-problem anchor (belly, chin, weight, fat, cellulite, …)
  for (const [needle] of PROBLEM_ANCHORS) { if (k.includes(needle)) return true; }
  // 2) names a body area — whole-word anatomy term (avoids 'leg' inside 'legal')
  for (const raw of k.split(/\s+/)) {
    const w = raw.replace(/[^a-z0-9]/g, '');
    if (w && ANATOMY_WORDS.has(w)) return true;
  }
  // 3) shares a distinctive token with the client's categories or brand
  // Array.from: project tsconfig has no `target` -> ES5; iterating a Set directly
  // needs downlevelIteration. Array.from keeps the build green (v7.174).
  for (const t of Array.from(relevanceTokens)) { if (k.includes(t)) return true; }
  return false;
}

function classifyJourneyType(type: string): JourneyType {
  return type === 'problem' ? 'pre-product' : 'product';
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

  // ── Assign keywords by SOLUTION AWARENESS (v7.154) ────────────────────────────
  // Distinctive procedure word(s) per procedure category, used to decide whether
  // a keyword actually names the procedure (product) or only the problem.
  const procWordsByCat = new Map<string, string[]>();
  for (const c of categories) {
    if (c.type === 'procedure') procWordsByCat.set(c.name, procedureWords(c.name));
  }

  const catMap = new Map<string, KwItem[]>();
  categories.forEach((c: { name: string; type: string }) => catMap.set(c.name, []));
  const problemPool: KwItem[] = [];   // keywords that name NO solution -> pre-product
  // v7.173: vocabulary the client actually owns — drives the relevance gate below.
  const relevanceTokens = buildRelevanceTokens(categories, clientDomain, competitorDomains);

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
  // problemAssignments is supplied; otherwise a deterministic anchor is used.
  const problemGroups = new Map<string, KwItem[]>();
  for (const kw of problemPool) {
    const theme = problemAssignments[kw.keyword.toLowerCase()] ?? deterministicProblemTheme(kw.keyword);
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
  existing:   '#34d399',
  missing:    '#f87171',
  competitor: '#a78bfa',
};
const STATE_LABEL: Record<NodeState, string> = {
  existing:   'Existing content',
  missing:    'Missing',
  competitor: 'Competitor only',
};

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
  const sampleKws = c.keywords.slice()
    .sort((a: KwItem, b: KwItem) => b.searchVolume - a.searchVolume)
    .slice(0, 6)
    .map((k: KwItem) => k.keyword);
  return {
    id: c.id, name: c.name, lane: c.journeyType, stage,
    col: JOURNEY_STAGE_ORDER.indexOf(stage), state,
    totalVol: c.totalVolume, clientVol, compVol,
    kwCount: c.keywords.length, sampleKws,
  };
}

// Deterministic fallback when AI edge inference is unavailable: link every node
// to all nodes in the next OCCUPIED funnel column (awareness → … → retention).
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
const demandCacheKey = (analysis: any): string => `orbitiq-demand-${analysis?.id ?? 'none'}`;

function readDemandCache(analysis: any): DemandUniverse | null {
  const fromSnap = (analysis?.semrushSnapshot as any)?._demandUniverse ?? null;
  if (fromSnap) return fromSnap;
  if (typeof window === 'undefined' || !analysis?.id) return null;
  try {
    const c = window.localStorage.getItem(demandCacheKey(analysis));
    return c ? (JSON.parse(c) as DemandUniverse) : null;
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

/** Map every demand seed (theme) → a single bucket id: a segment.id or SHARED_BUCKET. */
export function assignSeedSegments(universe: DemandUniverse, segments: AudienceSegment[]): Map<string, string> {
  const segTok = segments.map(seg => ({ id: seg.id, toks: new Set(segWords(segmentLanguage(seg))) }));

  const seeds = new Set<string>();
  for (const s of (universe.productSeeds ?? [])) seeds.add(s.toLowerCase());
  for (const s of (universe.problemSeeds ?? [])) seeds.add(s.toLowerCase());
  for (const t of (universe.topics ?? [])) for (const s of (t.seeds ?? [])) seeds.add(s.toLowerCase());

  const map = new Map<string, string>();
  for (const seed of Array.from(seeds)) {
    const words = segWords(seed);
    let bestScore = 0;
    let bestIds: string[] = [];
    for (const st of segTok) {
      let score = 0;
      for (const w of words) if (st.toks.has(w)) score++;
      if (score > bestScore) { bestScore = score; bestIds = [st.id]; }
      else if (score === bestScore && score > 0) bestIds.push(st.id);
    }
    // Unique best match (score > 0) → that persona; none or a tie → Shared.
    map.set(seed, bestScore > 0 && bestIds.length === 1 ? bestIds[0] : SHARED_BUCKET);
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
    const sampleKws = b.topics.slice().sort((a: DemandTopic, x: DemandTopic) => x.searchVolume - a.searchVolume).slice(0, 8).map((t: DemandTopic) => t.keyword);
    nodes.push({
      id: `${b.lane}::${b.theme}::${b.stage}`, name: b.theme, lane: b.lane, stage: b.stage,
      col: JOURNEY_STAGE_ORDER.indexOf(b.stage), state,
      totalVol, clientVol, compVol, kwCount: b.topics.length, sampleKws,
    });
  }

  const preNodes  = nodes.filter((n: JourneyNode) => n.lane === 'pre-product');
  const prodNodes = nodes.filter((n: JourneyNode) => n.lane === 'product');
  return { preNodes, prodNodes, preEdges: withinThemeEdges(preNodes), prodEdges: withinThemeEdges(prodNodes) };
}

// ─── MindMap (v7.152) ───────────────────────────────────────────────────────────

function MindMap({ nodes, edges, onSelect, selectedId }: {
  nodes:      JourneyNode[];
  edges:      [string, string][];
  onSelect:   (n: JourneyNode) => void;
  selectedId: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);

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
    <div style={{ display: 'flex', borderBottom: '1px solid #1A1A30', marginBottom: 4 }}>
      {JOURNEY_STAGE_ORDER.map((s: JourneyStage, i: number) => (
        <div key={s} style={{
          flex: 1, padding: '7px 6px', textAlign: 'center', fontSize: 9.5, fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase', color: STAGE_COLORS[s].text,
          opacity: 0.7, borderRight: i < 3 ? '1px solid #1A1A30' : 'none',
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
        <p style={{ fontSize: 11, color: '#3A3A5A', fontStyle: 'italic', padding: '18px 4px' }}>
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
        aria-label="Mind map of topic clusters across the funnel, color-coded by content coverage">
        {validEdges.map(([f, t]: [string, string], i: number) => {
          const inc = hover === f || hover === t;
          const stroke = inc ? STATE_COLOR[pos[f].n.state] : '#33335c';
          return (
            <path key={i} d={edgePath(pos[f], pos[t])} fill="none"
              stroke={stroke} strokeWidth={inc ? 2.2 : 1.3}
              opacity={hover ? (inc ? 0.95 : 0.07) : 0.5} />
          );
        })}
        {ordered.map((n: JourneyNode) => {
          const p = pos[n.id];
          const col = STATE_COLOR[n.state];
          const scale = n.id === hover ? 1.15 : 1;
          const sel = n.id === selectedId;
          const label = n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name;
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y}) scale(${scale})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover((h: string | null) => (h === n.id ? null : h))}
              onClick={() => onSelect(n)}>
              <g transform={`translate(${-NODE_W / 2} ${-NODE_H / 2})`}>
                <rect width={NODE_W} height={NODE_H} rx={9} fill="#0D0D22" stroke={col} strokeWidth={sel ? 2.4 : 1.6} />
                <rect width={4} height={NODE_H} rx={2} fill={col} />
                <text x={13} y={19} fill="#D8D8F0" fontSize={11} fontWeight={500} fontFamily="inherit">{label}</text>
                <text x={13} y={34} fill="#6a6a90" fontSize={9.5} fontFamily="monospace">
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8080a0' }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: c }} />{l}
    </span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      {item(STATE_COLOR.existing, 'Existing content')}
      {item(STATE_COLOR.missing, 'Missing')}
      {item(STATE_COLOR.competitor, 'Competitor only')}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4A4A6A' }}>
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
    <div style={{ background: '#0D0D1E', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: '#6a6a90' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{val}</div>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 12 }}>
      {cell('Topics in journey', tot, '#C8C8E8')}
      {cell('Existing', ex, STATE_COLOR.existing)}
      {cell('Missing', mi, STATE_COLOR.missing)}
      {cell('Competitor only', co, STATE_COLOR.competitor)}
      <div style={{ background: '#0D0D1E', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 10.5, color: '#6a6a90' }}>Completeness</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#C8C8E8', marginTop: 2 }}>{pct}%</div>
        <div style={{ height: 4, background: '#1A1A30', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: STATE_COLOR.existing }} />
        </div>
      </div>
    </div>
  );
}

// v7.161: combined journey summary — one row of cards, each showing the overall
// total across both lanes plus a pre-product (cyan) / product (purple) split.
const PRE_COLOR = '#22d3ee';
const PROD_COLOR = '#a78bfa';

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
      <div style={{ background: '#0D0D1E', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, color: '#6a6a90' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color, margin: '2px 0 8px' }}>{denom}</div>
        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', background: '#1A1A30' }}>
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
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6a6a90' }}>Journey coverage — combined</span>
        <span style={{ fontSize: 10.5, color: '#8080a0' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: PRE_COLOR, marginRight: 4, verticalAlign: 'middle' }} />Pre-product</span>
        <span style={{ fontSize: 10.5, color: '#8080a0' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: PROD_COLOR, marginRight: 4, verticalAlign: 'middle' }} />Product</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {splitCard('Topics in journey', '#C8C8E8', preTot, prodTot)}
        {splitCard('Existing', STATE_COLOR.existing, preEx, prodEx)}
        {splitCard('Missing', STATE_COLOR.missing, preMi, prodMi)}
        {splitCard('Competitor only', STATE_COLOR.competitor, preCo, prodCo)}
        <div style={{ background: '#0D0D1E', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#6a6a90' }}>Completeness</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#C8C8E8', margin: '2px 0 8px' }}>{pct}%</div>
          <div style={{ height: 5, background: '#1A1A30', borderRadius: 3, overflow: 'hidden' }}>
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

function DetailPanel({ node, onClose }: { node: JourneyNode | null; onClose: () => void }) {
  if (!node) {
    return (
      <div style={{
        marginTop: 14, border: '1px solid #1A1A30', borderRadius: 12, background: '#0D0D1E',
        padding: 16, fontSize: 12, color: '#5A5A80', textAlign: 'center',
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
    <div style={{ marginTop: 14, border: `1px solid ${col}44`, borderRadius: 12, background: '#0D0D1E', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#DCDCF4' }}>{node.name}</div>
          <div style={{ fontSize: 11, color: '#6a6a90', marginTop: 3, fontFamily: 'monospace' }}>
            {fmtVol(node.totalVol)} searches/mo · {node.kwCount} keywords · {JOURNEY_STAGE_LABELS[node.stage]} · {node.lane === 'pre-product' ? 'Pre-product' : 'Product'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 6, padding: '4px 9px', whiteSpace: 'nowrap' }}>
            {STATE_LABEL[node.state]}
          </span>
          <button onClick={onClose} aria-label="Close detail" style={{ background: 'transparent', border: 'none', color: '#5A5A80', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
            <i className="ti ti-x" />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: '#1A1A30', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${clientPct}%`, background: col }} />
        </div>
        <span style={{ fontSize: 11, color: '#8080a0', minWidth: 96, textAlign: 'right' }}>{clientPct}% client coverage</span>
      </div>

      {node.sampleKws.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', color: '#4A4A6A', marginTop: 14 }}>REPRESENTATIVE KEYWORDS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {node.sampleKws.map((k: string, i: number) => (
              <span key={i} style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#9a9ac0', background: 'rgba(120,120,160,0.08)', border: '1px solid #1f1f3a', borderRadius: 5, padding: '3px 7px' }}>
                &ldquo;{k}&rdquo;
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'rgba(120,120,160,0.05)', border: '1px solid #1f1f3a', borderRadius: 8, padding: '9px 11px' }}>
        <i className="ti ti-bulb" style={{ color: col, fontSize: 15 }} />
        <span style={{ fontSize: 11.5, color: '#9090b8' }}>{rec}</span>
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
        <span style={{ fontSize: 11, color: '#9090b8' }}>
          <i className="ti ti-loader-2" style={{ marginRight: 5, color: '#22d3ee' }} />{label}
        </span>
        <span style={{ fontSize: 11, color: '#6A6A90', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {total > 0 ? `${pct}%` : ''}{eta ? ` · ${eta}` : ''}
        </span>
      </div>
      <div style={{ height: 6, background: '#1A1A30', borderRadius: 3, overflow: 'hidden' }}>
        {total > 0 ? (
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', transition: 'width 0.3s ease' }} />
        ) : (
          <div style={{ height: '100%', width: '35%', background: '#22d3ee', opacity: 0.6, animation: 'orbitiq-indet 1.1s ease-in-out infinite' }} />
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

const EDGE_COLOR: Record<JEdgeKind, string> = { co: '#22d3ee', bridge: '#7dd3fc', support: '#a78bfa' };
const EDGE_WHY_COLOR: Record<JEdgeKind, string> = { co: '#22d3ee', bridge: '#7dd3fc', support: '#a78bfa' };
const CM_STAGES: JourneyStage[] = ['awareness', 'consideration', 'decision'];

function ConnectedMap({ graph, onSelect, selectedId }: {
  graph:      JGraph;
  onSelect:   (n: JGNode) => void;
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
    return <p style={{ fontSize: 12, color: '#3A3A5A', fontStyle: 'italic', padding: '24px 4px' }}>No topics mapped to this journey yet — build the deep journey to populate it.</p>;
  }

  const validEdges = graph.edges.filter((e) => pos[e.from] && pos[e.to]);
  const neighbors = (id: string) => {
    const s = new Set<string>([id]);
    for (const e of graph.edges) { if (e.from === id) s.add(e.to); if (e.to === id) s.add(e.from); }
    return s;
  };
  const nb = hover ? neighbors(hover) : null;
  const ordered = graph.nodes.slice().sort((a, b) => {
    const pri = (n: JGNode) => (n.id === hover ? 2 : n.id === selectedId ? 1 : 0);
    return pri(a) - pri(b);
  });

  const colW = W / 3;
  return (
    <div>
      {/* stage headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1A1A30' }}>
        {CM_STAGES.map((s: JourneyStage, i: number) => (
          <div key={s} style={{ flex: 1, padding: '7px 6px', textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: STAGE_COLORS[s].text, opacity: 0.7, borderRight: i < 2 ? '1px solid #1A1A30' : 'none' }}>
            {JOURNEY_STAGE_LABELS[s]}
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
        aria-label="Connected audience journey: problem topics link by co-search behaviour, bridge to the product that solves them, and fan into supporting decision topics. Colour shows content coverage.">
        {/* band backgrounds */}
        <rect x={0} y={bandY.preTop - PAD / 2} width={W} height={bandY.preH + PAD} fill="rgba(34,211,238,0.025)" rx={8} />
        <rect x={0} y={bandY.prodTop - PAD / 2} width={W} height={bandY.prodH + PAD} fill="rgba(167,139,250,0.03)" rx={8} />
        <text x={8} y={bandY.preTop + 4} fill="#22d3ee" fontSize={8.5} fontWeight={700} opacity={0.5} letterSpacing="0.1em">PRE-PRODUCT · PROBLEM-AWARE</text>
        <text x={8} y={bandY.prodTop + 4} fill="#a78bfa" fontSize={8.5} fontWeight={700} opacity={0.5} letterSpacing="0.1em">PRODUCT · SOLUTION-AWARE</text>
        {/* column dividers */}
        {[1, 2].map((c) => <line key={c} x1={colW * c} y1={0} x2={colW * c} y2={H} stroke="#13132a" strokeWidth={1} />)}
        {/* edges */}
        {validEdges.map((e, i: number) => {
          const inc = hover === e.from || hover === e.to;
          const color = EDGE_COLOR[e.kind];
          return (
            <path key={i} d={edgePath(pos[e.from], pos[e.to])} fill="none"
              stroke={inc ? color : (e.kind === 'bridge' ? '#3a5566' : '#33335c')}
              strokeWidth={inc ? 2.4 : 1.3}
              strokeDasharray={e.kind === 'bridge' ? '5 4' : undefined}
              opacity={hover ? (inc ? 0.95 : 0.06) : (e.kind === 'bridge' ? 0.45 : 0.42)} />
          );
        })}
        {/* nodes */}
        {ordered.map((n: JGNode) => {
          const p = pos[n.id]; if (!p) return null;
          const col = STATE_COLOR[n.state];
          const scale = n.id === hover ? 1.07 : 1;
          const sel = n.id === selectedId;
          const dim = nb ? !nb.has(n.id) : false;
          const label = n.name.length > 24 ? n.name.slice(0, 23) + '…' : n.name;
          const badge = n.action === 'optimize' ? 'Existing' : 'Build new';
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y}) scale(${scale})`} style={{ cursor: 'pointer', opacity: dim ? 0.16 : 1, transition: 'opacity 0.12s' }}
              onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h: string | null) => (h === n.id ? null : h))} onClick={() => onSelect(n)}>
              <g transform={`translate(${-NODE_W / 2} ${-NODE_H / 2})`}>
                <rect width={NODE_W} height={NODE_H} rx={9} fill="#0D0D22" stroke={col} strokeWidth={n.kind === 'core' ? 2.3 : (sel ? 2.3 : 1.5)} />
                <rect width={4} height={NODE_H} rx={2} fill={col} />
                {n.kind === 'core' && <text x={NODE_W - 26} y={16} fill="#a78bfa" fontSize={11} fontFamily="inherit">★</text>}
                <text x={12} y={17} fill="#D8D8F0" fontSize={10.5} fontWeight={500} fontFamily="inherit">{label}</text>
                <text x={12} y={31} fill="#6a6a90" fontSize={9} fontFamily="monospace">{fmtVol(n.totalVol)}/mo · {n.kwCount} kw</text>
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
    <div style={{ background: '#0D0D1E', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, color: '#6a6a90' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, margin: '2px 0 0' }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: '#5A5A80', marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6a6a90' }}>Content plan — every topic mapped</span>
        <span style={{ fontSize: 10.5, color: '#5A7A80' }}><i className="ti ti-arrow-right" style={{ margin: '0 4px' }} />feeds the Content panel</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {cell('Topics in journey', p.total, '#C8C8E8')}
        {cell('Existing — optimize', p.optimize, STATE_COLOR.existing)}
        {cell('Net-new — build', p.build, STATE_COLOR.missing, `${p.preBuild} pre · ${p.prodBuild} product`)}
        <div style={{ background: '#0D0D1E', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 10.5, color: '#6a6a90' }}>Coverage</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#C8C8E8', margin: '2px 0 6px' }}>{p.total ? Math.round((p.optimize / p.total) * 100) : 0}%</div>
          <div style={{ height: 5, background: '#1A1A30', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${p.total ? Math.round((p.optimize / p.total) * 100) : 0}%`, background: STATE_COLOR.existing }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function GraphDetail({ node, graph, onClose }: { node: JGNode | null; graph: JGraph; onClose: () => void }) {
  if (!node) {
    return (
      <div style={{ marginTop: 14, border: '1px solid #1A1A30', borderRadius: 12, background: '#0D0D1E', padding: 16, fontSize: 12, color: '#5A5A80', textAlign: 'center' }}>
        Select a topic to see its keywords, why it connects, and the content action.
      </div>
    );
  }
  const col = STATE_COLOR[node.state];
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as [string, JGNode]));
  const rels = graph.edges
    .filter((e) => e.from === node.id || e.to === node.id)
    .map((e) => { const otherId = e.from === node.id ? e.to : e.from; return { why: e.why, kind: e.kind, name: byId.get(otherId)?.name ?? otherId }; });
  const kindLabel = node.kind === 'problem' ? 'Pre-product · problem' : node.kind === 'core' ? 'Product · core' : `Product · ${SUPPORT_LABEL[node.supportType].toLowerCase()}`;
  const rec = node.action === 'optimize'
    ? 'You already rank here — keep this page linked into the paths above and refresh it.'
    : node.state === 'competitor'
      ? 'A competitor owns this step and you do not — build comparable depth to capture it.'
      : 'No coverage from you or tracked competitors — a net-new page to build.';
  return (
    <div style={{ marginTop: 14, border: `1px solid ${col}44`, borderRadius: 12, background: '#0D0D1E', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#DCDCF4' }}>{node.kind === 'core' ? '★ ' : ''}{node.name}</div>
          <div style={{ fontSize: 11, color: '#6a6a90', marginTop: 3, fontFamily: 'monospace' }}>
            {fmtVol(node.totalVol)} searches/mo · {node.kwCount} keywords · {kindLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 6, padding: '4px 9px', whiteSpace: 'nowrap' }}>
            {node.action === 'optimize' ? 'Existing page' : (node.state === 'competitor' ? 'Competitor only' : 'Build net-new')}
          </span>
          <button onClick={onClose} aria-label="Close detail" style={{ background: 'transparent', border: 'none', color: '#5A5A80', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}><i className="ti ti-x" /></button>
        </div>
      </div>

      <div style={{ fontSize: 10, letterSpacing: '0.08em', color: '#4A4A6A', marginTop: 14 }}>WHY IT CONNECTS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
        {rels.length ? rels.map((r, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, color: '#8080a0' }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: 4, padding: '2px 6px', color: EDGE_WHY_COLOR[r.kind], background: `${EDGE_WHY_COLOR[r.kind]}1f` }}>{r.why}</span>
            <i className="ti ti-arrow-right" style={{ color: '#4A4A6A' }} />
            <span style={{ color: '#C8C8E8' }}>{r.name}</span>
          </div>
        )) : <span style={{ color: '#4A4A6A', fontSize: 11.5 }}>Standalone entry point.</span>}
      </div>

      {node.sampleKws.length > 0 && (
        <>
          <div style={{ fontSize: 10, letterSpacing: '0.08em', color: '#4A4A6A', marginTop: 14 }}>REPRESENTATIVE KEYWORDS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {node.sampleKws.map((k: string, i: number) => (
              <span key={i} style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#9a9ac0', background: 'rgba(120,120,160,0.08)', border: '1px solid #1f1f3a', borderRadius: 5, padding: '3px 7px' }}>&ldquo;{k}&rdquo;</span>
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: 'rgba(120,120,160,0.05)', border: '1px solid #1f1f3a', borderRadius: 8, padding: '9px 11px' }}>
        <i className="ti ti-bulb" style={{ color: col, fontSize: 15 }} />
        <span style={{ fontSize: 11.5, color: '#9090b8' }}>{rec}</span>
      </div>

      {node.url ? (
        <a href={node.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 12, fontWeight: 600, color: col, background: 'transparent', border: `1px solid ${col}55`, borderRadius: 8, padding: '7px 12px', textDecoration: 'none' }}>
          <i className="ti ti-external-link" /> Optimize existing page <span style={{ color: '#6a6a90', fontWeight: 400 }}>{node.url}</span>
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

export default function JourneySection({ projectId, kwVersion, analysis, competitors }: Props) {
  const [claudeAssignments, setClaudeAssignments] = useState<Record<string, IntentType>>({});
  const [uploadedKeywords,  setUploadedKeywords]  = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('combined');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);   // v7.160: pill hover glow
  const [edges, setEdges] = useState<{ preProduct: [string, string][]; product: [string, string][] }>({ preProduct: [], product: [] });
  const [problemAssignments, setProblemAssignments] = useState<Record<string, string>>({});   // v7.154: kw -> AI-named pre-product theme
  const [selected, setSelected] = useState<JourneyNode | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState<JGNode | null>(null);   // v7.175 connected-map selection
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
    setDemandUniverse(readDemandCache(analysis));
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
  const demand = useMemo(
    () => demandMode ? buildDemandNodes(demandUniverse as DemandUniverse, footprint.client, footprint.competitor, activeBucketId, seedBucket) : null,
    [demandMode, demandUniverse, footprint, activeBucketId, seedBucket],
  );

  const preNodes  = demand ? demand.preNodes  : fpPreNodes;
  const prodNodes = demand ? demand.prodNodes : fpProdNodes;

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

  // v7.175: the connected journey graph — problem topics + product core/supporting,
  // co-search / bridge / support edges, and a content action per node. One shared
  // builder (lib/journey/graph) feeds both this panel and the Content panel.
  const graph = useMemo<JGraph | null>(
    () => demandMode ? buildJourneyGraph(demandUniverse as any, {
      clientRanked: footprint.client, competitorRanked: footprint.competitor,
      urlByKeyword, activeBucketId, seedBucket, themeLabels,
    }) : null,
    [demandMode, demandUniverse, footprint, urlByKeyword, activeBucketId, seedBucket, themeLabels],
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
        if (parsed.version === 1 && parsed.sig === sig && parsed.assignments) { setProblemAssignments(parsed.assignments); return; }
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
        try { localStorage.setItem(cacheKey, JSON.stringify({ version: 1, sig, assignments: d.assignments })); } catch {}
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.id, projectId, industry, clientDomain, problemKwList]);

  // Demand mode: within-theme stage edges (no cross-theme hub). Footprint mode:
  // AI-inferred edges with the stage-order fallback (v7.152 behavior).
  const preEdges  = demand ? demand.preEdges  : (edges.preProduct.length ? edges.preProduct : stageOrderEdges(fpPreNodes));
  const prodEdges = demand ? demand.prodEdges : (edges.product.length    ? edges.product    : stageOrderEdges(fpProdNodes));

  // v7.170: in demand mode the personas + a "Shared / all personas" bucket are an
  // exclusive partition of the journey topics, so they sum to the combined total.
  const tabs = useMemo(() => [
    { id: 'combined', label: 'All Segments' },
    ...segments.map((s: AudienceSegment) => ({ id: s.id, label: s.name })),
    ...(demandMode && segments.length > 0 ? [{ id: SHARED_BUCKET, label: 'Shared / all personas' }] : []),
  ], [segments, demandMode]);

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

  const hasData = segments.length > 0 || clusters.length > 0 || demandMode;

  if (!hasData) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>🗺️</div>
        <p style={{ color: '#4A4A6A', fontSize: 13 }}>
          Run an analysis to populate the Journey panel. Audience segments and keyword clusters are required.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4A4A6A', marginBottom: 5 }}>
          Foundation · 04
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#DCDCF4', margin: 0 }}>Audience Journeys</h2>
        <p style={{ fontSize: 12, color: '#5A5A80', marginTop: 5 }}>
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
              const ac = tAccent ? tAccent.text : '#8080A0';
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
                    color: lit ? ac : '#6A6A90',
                    background: isActive ? `${ac}14` : (isHovered ? `${ac}0d` : 'transparent'),
                    border: `1px solid ${lit ? ac + '55' : '#1A1A30'}`,
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
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: isActive ? `${ac}1f` : 'rgba(50,50,70,0.4)', color: isActive ? ac : '#4A4A6A', fontWeight: 600 }}>
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#DCDCF4', marginBottom: 3 }}>{activeSegment.name}</div>
                  <p style={{ fontSize: 11.5, color: '#8A8AB0', margin: '0 0 5px', lineHeight: 1.5 }}>{activeSegment.whoTheyAre.trigger}</p>
                  <p style={{ fontSize: 12, color: '#9090B0', fontStyle: 'italic', margin: 0 }}>&ldquo;{activeSegment.tagline}&rdquo;</p>
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

        {/* Right — build control + status badge + provenance + progress + error */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 220, flex: '0 0 auto', maxWidth: 280 }}>
          <button onClick={buildDeepJourney} disabled={building}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', fontSize: 12, fontWeight: 600,
              color: building ? '#6A6A90' : '#0D0D22', background: building ? 'transparent' : '#22d3ee',
              border: `1px solid ${building ? '#1A1A30' : '#22d3ee'}`, borderRadius: 8, cursor: building ? 'default' : 'pointer',
            }}>
            <i className={`ti ${building ? 'ti-loader-2' : (demandMode ? 'ti-refresh' : 'ti-sparkles')}`} />
            {building ? 'Building deep journey…' : (demandMode ? 'Rebuild deep journey' : 'Build deep journey')}
          </button>

          {/* run-status badge: never run · building · last run [date] */}
          {building ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#22d3ee', background: 'rgba(34,211,238,0.12)', border: '1px solid #22d3ee55', borderRadius: 8, padding: '3px 9px' }}>
              <i className="ti ti-loader-2" /> Building…
            </span>
          ) : demandMode ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid #34d39955', borderRadius: 8, padding: '3px 9px' }}>
              <i className="ti ti-circle-check" /> {demandUniverse?.builtAt ? `Last run ${new Date(demandUniverse.builtAt).toLocaleDateString()}` : 'Built'}
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#8A8AA8', background: 'rgba(120,120,150,0.12)', border: '1px solid #2A2A40', borderRadius: 8, padding: '3px 9px' }}>
              <i className="ti ti-circle-dashed" /> Never run
            </span>
          )}

          {!building && (demandMode ? (
            <span style={{ fontSize: 11, color: '#6A6A90', textAlign: 'right' }}>
              <span style={{ color: '#34d399', fontWeight: 600 }}>Demand universe</span> · {(demandUniverse?.topicCount ?? demandUniverse?.topics?.length ?? 0).toLocaleString()} volume-backed topics
              {demandUniverse?.seedCount ? ` from ${demandUniverse.seedCount} seeds` : ''}
              {' '}(Semrush)
            </span>
          ) : (
            <span style={{ fontSize: 11, color: '#6A6A90', textAlign: 'right' }}>
              Showing your <span style={{ color: '#a78bfa' }}>ranking footprint</span> only &mdash; build the deep journey to map the full search-volume-backed demand.
            </span>
          ))}
          {building && <DemandProgress progress={progress} />}
          {buildError && (
            <p style={{ fontSize: 11, color: '#f87171', margin: 0, textAlign: 'right' }}>
              <i className="ti ti-alert-triangle" style={{ marginRight: 5 }} />{buildError}
            </p>
          )}
        </div>
      </div>

      <Legend />

      {demand && graph ? (
        /* v7.175: ONE connected journey — problem topics link by co-search, bridge
           to the product that solves them, and fan into supporting decision topics. */
        <>
          <ContentPlanSummary graph={graph} />

          <div style={{ border: '1px solid #1A1A30', borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-sitemap" style={{ color: '#22d3ee', fontSize: 14 }} />
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#C8C8E8' }}>Connected Journey</span>
                  <p style={{ fontSize: 11, color: '#5A5A80', marginTop: 1 }}>
                    Life problem &rarr; discovers the solution &rarr; decides. Every link is real search behavior.
                  </p>
                </div>
              </div>
              {/* relationship legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                {([['co', 'Co-searched'], ['bridge', 'Discovers solution'], ['support', 'Needs to decide']] as [JEdgeKind, string][]).map(([k, l]: [JEdgeKind, string]) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#8080a0' }}>
                    <svg width={26} height={8}><line x1={0} y1={4} x2={26} y2={4} stroke={EDGE_COLOR[k]} strokeWidth={2.4} strokeDasharray={k === 'bridge' ? '4 3' : undefined} /></svg>{l}
                  </span>
                ))}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#8080a0' }}>
                  <span style={{ color: '#a78bfa' }}>&#9733;</span> Core product
                </span>
              </div>
            </div>
            {preLLMPrompts.length > 0 && <PromptStrip prompts={preLLMPrompts} accent="#22d3ee" />}
            {productPrompts.length > 0 && <PromptStrip prompts={productPrompts} accent="#a78bfa" />}
            <ConnectedMap graph={graph} onSelect={setSelectedGraphNode} selectedId={selectedGraphNode?.id ?? null} />
          </div>

          <GraphDetail node={selectedGraphNode} graph={graph} onClose={() => setSelectedGraphNode(null)} />
        </>
      ) : (
        /* Footprint mode (no demand universe yet) — the v7.161 two-lane view. */
        <>
          <CombinedSummary preNodes={preNodes} prodNodes={prodNodes} />

          <div style={{ background: 'rgba(34,211,238,0.02)', border: '1px solid rgba(34,211,238,0.15)', borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-bulb" style={{ color: '#22d3ee', fontSize: 14 }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#22d3ee' }}>Pre-Product Journey</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,211,238,0.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Problem-aware
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#4A7A80', marginTop: 2 }}>
                  They have a life problem but don&apos;t know your product exists yet.
                </p>
              </div>
            </div>
            {preLLMPrompts.length > 0 && <PromptStrip prompts={preLLMPrompts} accent="#22d3ee" />}
            <MindMap nodes={preNodes} edges={preEdges} onSelect={setSelected} selectedId={selected?.id ?? null} />
            <CompletenessRow nodes={preNodes} />
          </div>

          <div style={{ border: '1px solid #1A1A30', borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(167,139,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-route" style={{ color: '#a78bfa', fontSize: 14 }} />
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>Product Journey</span>
                <p style={{ fontSize: 11, color: '#5A5A80', marginTop: 1 }}>
                  Full funnel &mdash; searchers aware of the category and evaluating options.
                </p>
              </div>
            </div>
            {productPrompts.length > 0 && <PromptStrip prompts={productPrompts} accent="#a78bfa" />}
            <MindMap nodes={prodNodes} edges={prodEdges} onSelect={setSelected} selectedId={selected?.id ?? null} />
            <CompletenessRow nodes={prodNodes} />
          </div>

          <DetailPanel node={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
