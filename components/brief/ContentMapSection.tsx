'use client';

import { useMemo, useState, useEffect, useRef, Fragment } from 'react';
import { planFromSnapshot, buildContentPlanFromTopics, brandTermsOf } from '@/lib/journey/contentPlan';   // v7.337: briefTitleFromKeywords import dropped with dead buildArticleTopics; v7.356: brandTermsOf
import { ContentExplorer } from '@/components/brief/ContentPlanSection';
import { buildCanonicalClusterTopics } from '@/components/brief/ThemeClustersPanel';   // v7.210: one source of truth
import { buildKwPool } from '@/lib/utils/kwVolume';   // v7.336 (QC audit B1 mirror): canonical pool for buildClusters (Const II.7)
import { buildCategoryGuard } from '@/lib/category/categoryGuard';   // v7.336 (QC audit B1 mirror): guard on buildClusters category reads (Const III.1a)
// v7.353: audience-segment lens — the SAME topic→segment attribution the Journey panel
// uses, carried into this panel as a filter + row tags (Const II.7, one partition).
import { buildTopicSegmentMap, buildSegTags, filterPlanBySegment, SegmentFilterBar } from '@/components/brief/SegmentLens';

// ─── Types ────────────────────────────────────────────────────────────────────

type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';
type JourneyType  = 'pre-product' | 'product';
type GapType      = 'missing' | 'competitor-gap' | 'partial';

interface KwItem {
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  isGap:        boolean;
  competitor:   string | null;
  url:          string;   // v7.163: real Semrush ranking URL for this keyword ('' = none)
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
  // v7.163: existing-page mapping (real Semrush ranking URLs for this cluster's
  // client-ranked keywords). pageStatus 'optimize' = at least one ranking page
  // already exists; 'net-new' = no ranking page → content must be built.
  existingPages:    string[];
  rankedKwCount:    number;   // # of this cluster's keywords with a ranking page
  pageStatus:       'optimize' | 'net-new';
}

interface AudienceSegment {
  id:             string;
  name:           string;
  tagline:        string;
  volumePct:      number;
  whoTheyAre:     { demographics: string; trigger: string; influencerRole?: string };
  preLLMPrompts:  string[];
  productPrompts: string[];
  // v7.191: real generated fields surfaced into the article drawer (never fabricated here).
  personaImageUrl?:  string;   // circular AI portrait (Vercel Blob URL); initials fallback
  messagingAndTone?: string;   // → article Tonality
  creativeDirection?: string;  // → article Key points of view
  yoyGrowth?:        string;
}

// v7.191: an ARTICLE TOPIC = one parent theme × journey stage (the child row in the
// grouped table, and the unit a writer briefs against). Mirrors the Cluster panel's
// parent→child topic model so the two panels reconcile.
type TopicSource = 'competitor' | 'journey' | 'both' | 'none';
interface ArticleTopic {
  id:            string;
  clusterId:     string;
  clusterName:   string;
  clusterType:   string;
  journeyType:   JourneyType;
  stage:         JourneyStage;
  title:         string;                     // article topic name (deterministic label)
  keywords:      KwItem[];                    // real keywords (volume + position)
  monthlyVolume: number;
  annualVolume:  number;
  clientCovPct:  number;
  action:        'optimize' | 'net-new';
  source:        TopicSource;                // net-new provenance: competitor vs journey gap
  segment:       AudienceSegment | null;     // best-matching segment (by prompt↔keyword overlap)
  tonality:      string;                      // = segment.messagingAndTone (verbatim, real)
  pov:           string[];                    // = segment.creativeDirection split into points (real)
  angle:         string;                      // deterministic content angle
  format:        string;                      // deterministic content format
  topCompetitor: string | null;
}

interface ContentGap {
  id:              string;
  segmentId:       string;
  segmentName:     string;
  stage:           JourneyStage;
  journeyType:     JourneyType;
  clusterName:     string;
  clusterType:     string;
  monthlyVolume:   number;
  annualVolume:    number;
  clientCovPct:    number;
  gapType:         GapType;
  priorityScore:   number;
  topCompetitor:   string | null;
  keywords:        string[];
  contentAngle:    string;
  contentFormat:   string;
}

interface Props {
  projectId:   string;
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  analysis:    any;
  competitors: string[];
  // v7.220: page-supplied Claude intent map (single source of truth, Const II.7) — fed
  // into buildCanonicalClusterTopics so the content-map topic count reconciles to the
  // Cluster panel's. Must be the same map the Cluster panel uses, not the local one.
  claudeAssigns?: Record<string, IntentType>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNEY_STAGE_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
const STAGE_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};
const STAGE_COLORS: Record<JourneyStage, { border: string; text: string; bg: string }> = {
  awareness:     { border: 'var(--c-22d3ee)', text: 'var(--c-22d3ee)', bg: 'var(--ca-34-211-238-0_08)'  },
  consideration: { border: 'var(--c-a78bfa)', text: 'var(--c-a78bfa)', bg: 'var(--ca-167-139-250-0_08)' },
  decision:      { border: 'var(--c-34d399)', text: 'var(--c-34d399)', bg: 'var(--ca-52-211-153-0_08)'  },
  retention:     { border: 'var(--c-f59e0b)', text: 'var(--c-f59e0b)', bg: 'var(--ca-245-158-11-0_08)'  },
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

// ─── Branded detection (mirrors JourneySection / ThemeClustersPanel) ──────────

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
// KeywordsPanel / JourneySection). See that file for the full rationale.
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
  const roots = Array.from(new Set([...[clientDomain, ...competitorDomains].map(extractBrand), ...brandWordRoots])).filter((b: string) => b.length >= 2);
  if (!roots.length) return false;
  const longRoots  = roots.filter((b: string) => b.length >= 4);
  const shortRoots = roots.filter((b: string) => b.length >= 2 && b.length <= 3);

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

const TRANSACTIONAL_SIGNALS = ['near me','near ','schedule','book ','booking','appointment','consultation','how much does','how much is','how much','cost','price','pricing','financing','payment plan','afford','discount','coupon','deal','specials','locations','location','find a ','get a '];
const COMMERCIAL_SIGNALS    = ['review','reviews','best ','top ',' vs ','versus','compare','comparison','before after','before and after','results','worth it','pros and cons','alternative','rating','ratings','testimonial','testimonials','complaints','side effects','risks','dangers','safe ','safety'];
const INFORMATIONAL_SIGNALS = ['what is ','what are ','how does','how do','how to','why ','guide',' tips','recovery','benefits','difference between','types of','explained','overview','about ','definition','learn','understanding','causes','symptoms'];

function detectIntent(keyword: string): IntentType {
  const kw = keyword.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (kw.includes(s)) return 'transactional'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (kw.includes(s)) return 'commercial';    }
  for (const s of INFORMATIONAL_SIGNALS) { if (kw.includes(s)) return 'informational'; }
  return 'unmatched';
}

// v7.337 (QC audit dead-code sweep, Const II.8): matchKeywordToCategory was DELETED.
// v7.336 removed it from cluster membership (stored membership only); its one remaining
// caller, assignPageToCluster, was itself never called (verified zero call sites), so
// both are removed in this release.

// ─── Solution-awareness classification (v7.154) ─────────────────────────────────
// Mirrors JourneySection: the pre-product/product split is decided by SOLUTION
// AWARENESS, not search intent. A procedure/brand/location cluster is ALWAYS
// product; only keywords that name no solution (problem/symptom/desire) are
// pre-product, grouped into life-problem themes. Kept as a local copy so this
// panel stays self-contained, consistent with the Journey panel's definition.
// v7.187: cosmetic ANATOMY_WORDS removed (see JourneySection). Distinctive
// procedure words are now DERIVED from this project's own data (buildProcWordsByCat).
const PROC_NAME_NOISE = new Set<string>([
  'with','from','that','this','your','near','best','top',
  'cost','costs','price','prices','pricing','reviews','review',
  'services','service','treatment','treatments','procedure','procedures',
  'clinic','center','centre','before','after','results','recovery','specials','financing',
]);
const GENERIC_STOP = new Set<string>([
  'what','whats','when','where','which','will','would','could','should','about',
  'they','their','them','then','than','this','that','with','from','your','yours',
  'have','having','need','needs','want','wants','looking','search','searches',
  'help','tips','does','done','into','over','more','some','very','just','like',
  'cant','wont','know','make','made','being','been','much','many','good','best',
  'near','area','areas','using','used','also','around','versus',
]);
function tokensOf(text: string): string[] {
  return ((text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w: string) => w.length >= 4 && !GENERIC_STOP.has(w) && !PROC_NAME_NOISE.has(w));
}
function tokenMatches(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}
// Distinctive procedure word(s) per procedure category, data-derived (drops words
// shared by 2+ categories or used in the audience's own problem language).
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
// Mirrors JourneySection. Problem THEMES and the relevance gate derive from THIS
// project's audience language + category/brand tokens — no cosmetic vocabulary.
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
// token with the client's category names, brand, OR its audience's own language.
// Off-topic noise (no shared token) is dropped before clustering, so it can never
// surface as a content brief or roll into the executive summary. No AI, no modeling.
function buildRelevanceTokens(
  categories: Array<{ name: string; type: string }>,
  clientDomain: string,
  competitorDomains: string[],
  problemLangTokens: Set<string>,
): Set<string> {
  const tokens = new Set<string>();
  for (const c of categories) for (const w of tokensOf(c.name)) tokens.add(w);
  for (const t of brandTokensOf(clientDomain, competitorDomains)) { if (t.length >= 4) tokens.add(t); }
  for (const t of Array.from(problemLangTokens)) tokens.add(t);
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

// v7.163: distinct ranking pages for a set of keywords (client-ranked only —
// gap/competitor keywords carry no client URL). Drives the optimize vs net-new
// classification: a cluster with ≥1 ranking page is an "optimise existing"
// target; a cluster with none is "build net-new".
function pagesForKws(kws: KwItem[]): { pages: string[]; rankedCount: number } {
  const pages = new Set<string>();
  let rankedCount = 0;
  for (const k of kws) {
    if (k.url) { pages.add(k.url); rankedCount++; }
  }
  return { pages: Array.from(pages), rankedCount };
}

// v7.336 (QC audit B1 mirror): exported for parity with JourneySection.buildClusters and
// for the retained regression harness (Const V.6) — no runtime behavior change.
export function buildClusters(
  analysis: any,
  claudeAssignments: Record<string, IntentType>,
  clientDomain: string,
  competitorDomains: string[],
  uploadedKeywords: any[] = [],
  urlByKeyword: Record<string, string> = {},   // v7.163: keyword(lower) → real ranking URL
): ThemeCluster[] {
  const semSnap = analysis?.semrushSnapshot ?? {};
  const cb = semSnap._categoryBreakdown ?? null;
  // v7.336 (QC audit B1 mirror): shared competitor-brand category guard (Const III.1a) on
  // this `cb.categories` read — the same guard JourneySection.buildClusters gained in
  // v7.335. Previously unguarded, so a competitor brand category (e.g. "Wells Fargo
  // Brand Searches") could become a content cluster and briefs that every canonical
  // panel had already dropped. The client's OWN brand category is kept by the guard;
  // the `storedMap` read is guarded through the `catMap.has(...)` membership check in
  // the assignment loop below.
  const catGuard = buildCategoryGuard(semSnap, clientDomain, competitorDomains);
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? [])
      .filter((c: any) => !catGuard.isCompetitorBrandCategory(String(c?.name ?? ''), c?.type))
      .map((c: any) => ({
        name: c.name,
        type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure' as const,
      }));
  if (!categories.length) return [];

  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};

  // v7.163: prefer the per-keyword URL already on the pool row, fall back to the
  // merged urlByKeyword map (snapshot.topKeywords[].url + on-demand _pageMap).
  const urlFor = (kwLow: string, rowUrl?: string): string => (rowUrl || urlByKeyword[kwLow] || '');

  // v7.336 (QC audit B1 mirror): the keyword pool now comes from the canonical
  // buildKwPool — the single source of truth every panel shares (Const II.7) — instead
  // of a parallel inline build that honoured ONLY the blocked list. Mirrors
  // JourneySection.buildClusters (v7.335, QC audit B1). This picks up the exclusions
  // the inline pool skipped: competitor-brand keywords/categories (Const III.1a), the
  // user brand blocklist (`_excludedBrands`), and the v7.326 adjacent-umbrella scope
  // gate (Const III.1d) — so the content-map cluster grid agrees with the
  // Keyword/Cluster/Journey panels. Same sources as before (topKeywords + gapKeywords
  // + uploads, blocked rows excluded; no demand union, no volume floors — the shared
  // basis is unfloored, Const I.6); buildKwPool reads `_brandTerms` /
  // `_excludedBrands` / `_scopeOverrides` off the snapshot itself (injected once at
  // page load). Real ranking URLs ride the pool rows (kwVolume v7.251) with the same
  // urlByKeyword fallback as before (v7.163); gap rows carry no client URL.
  const pool: KwItem[] = buildKwPool({
    semrushSnapshot:   semSnap,
    uploadedKeywords,
    clientDomain,
    competitorDomains,
  }).map((p): KwItem => ({
    keyword:      p.keyword,
    searchVolume: p.searchVolume,
    position:     p.position,
    isGap:        p.isGap,
    competitor:   p.competitor,
    url:          p.isGap ? '' : urlFor(p.keyword.toLowerCase().trim(), p.url),
  }));

  // v7.154/v7.187: route keywords by solution awareness (mirrors JourneySection).
  const vocab = deriveProblemVocab(analysis);

  const catMap = new Map<string, KwItem[]>();
  categories.forEach((c: { name: string }) => catMap.set(c.name, []));
  const problemPool: KwItem[] = [];
  // v7.187: vocabulary the client actually owns (categories + brand + audience
  // language) — drives the relevance gate below.
  const relevanceTokens = buildRelevanceTokens(categories, clientDomain, competitorDomains, vocab.langTokens);
  for (const kw of pool) {
    const key = kw.keyword.toLowerCase();
    // v7.336 (QC audit B1 mirror, Const II.8): STORED membership only — the lexical
    // shared-word fallback (matchKeywordToCategory) no longer decides cluster
    // membership. Reconstructing membership by string matching at this read site
    // fabricated assignments the stored taxonomy never made (one shared long word
    // was enough to file a keyword under a category). A keyword with no stored
    // category now flows to the honest catch-all below — client-relevant keywords
    // join a pre-product problem theme, the rest are dropped — exactly like every
    // other unassigned keyword (Const I.5). The `catMap.has(...)` check doubles as
    // the category guard on the storedMap read (a keyword stored under a dropped
    // competitor-brand category is not re-filed; buildKwPool has already excluded
    // it from the pool). (v7.337: the lexical matcher and its last dead caller,
    // assignPageToCluster, were deleted outright — see the dead-code sweep notes.)
    let cand: string | null = null;
    const stored = storedMap[key];
    if (stored && catMap.has(stored)) cand = stored;
    // v7.248 (Wayne): mapping to ANY product/service category => product (parity with the
    // shared classifier). Drops the literal-substring sub-gate that leaked product keywords
    // filed under broad parents into the pre-product problem pool (Const III.2a).
    if (cand) { catMap.get(cand)!.push(kw); continue; }
    // v7.173: only keep pre-product keywords that are topically relevant to the
    // client. Off-topic noise (no anchor, no body area, no category/brand token)
    // is dropped from the demand universe so it can't pollute the catch-all
    // bucket, surface as a content brief, or roll into the exec summary.
    if (isClientRelevant(kw.keyword, relevanceTokens)) problemPool.push(kw);
  }

  const problemGroups = new Map<string, KwItem[]>();
  for (const kw of problemPool) {
    const theme = deterministicProblemTheme(kw.keyword, vocab);
    if (!problemGroups.has(theme)) problemGroups.set(theme, []);
    problemGroups.get(theme)!.push(kw);
  }

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
        intent, stage: INTENT_META[intent].stage, keywords: items,
        totalVolume: items.reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        clientVolume: items.filter((k: KwItem) => k.position !== null && k.position <= 10).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        competitorVolume: items.filter((k: KwItem) => k.isGap).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
      });
    });
    return subClusters;
  }

  const result: ThemeCluster[] = [];
  for (const cat of categories) {
    const kws = catMap.get(cat.name) ?? [];
    if (!kws.length) continue;
    const totalVolume = kws.reduce((s: number, k: KwItem) => s + k.searchVolume, 0);
    const subClusters = buildSub(kws, cat.type === 'brand');
    const { pages, rankedCount } = pagesForKws(kws);
    result.push({ id: cat.name, name: cat.name, type: cat.type, journeyType: classifyJourneyType(cat.type), keywords: kws, totalVolume, subClusters, existingPages: pages, rankedKwCount: rankedCount, pageStatus: pages.length > 0 ? 'optimize' : 'net-new' });
  }
  for (const [theme, kws] of Array.from(problemGroups.entries())) {
    if (!kws.length) continue;
    const totalVolume = kws.reduce((s: number, k: KwItem) => s + k.searchVolume, 0);
    const subClusters = buildSub(kws, false);
    const { pages, rankedCount } = pagesForKws(kws);
    result.push({ id: theme, name: theme, type: 'problem', journeyType: 'pre-product', keywords: kws, totalVolume, subClusters, existingPages: pages, rankedKwCount: rankedCount, pageStatus: pages.length > 0 ? 'optimize' : 'net-new' });
  }
  result.sort((a, b) => {
    const order: Record<string, number> = { problem: 0, procedure: 1, brand: 2, location: 3 };
    return (order[a.type] - order[b.type]) || (b.totalVolume - a.totalVolume);
  });
  return result;
}

// ─── Content angle rules (deterministic, no AI) ───────────────────────────────

function deriveContentAngle(
  cluster: ThemeCluster,
  stage: JourneyStage,
  journeyType: JourneyType,
  segmentTrigger: string,
): string {
  if (journeyType === 'pre-product') {
    return `Educational guide targeting "${segmentTrigger}" — intercept before they know the product category exists`;
  }
  switch (stage) {
    case 'awareness':
      return `Category introduction: what is ${cluster.name} and who needs it — broad organic discovery`;
    case 'consideration':
      return `Comparison guide: ${cluster.name} vs alternatives — objection handling for ${segmentTrigger}`;
    case 'decision':
      return `High-intent landing page for ${cluster.name} — direct response for searchers ready to act`;
    case 'retention':
      return `Brand authority content: ${cluster.name} resources for existing and returning customers`;
    default:
      return `Content targeting ${cluster.name} at the ${stage} stage`;
  }
}

function deriveContentFormat(stage: JourneyStage, journeyType: JourneyType): string {
  if (journeyType === 'pre-product') return 'Long-form blog / educational article';
  switch (stage) {
    case 'awareness':     return 'Blog post / guide';
    case 'consideration': return 'Comparison page / review content';
    case 'decision':      return 'Service / landing page';
    case 'retention':     return 'Brand / resource page';
    default:              return 'Content page';
  }
}

// ─── Article topic model (v7.191) ─────────────────────────────────────────────
// Deterministic article title for a theme × stage. No AI, no fabricated facts —
// just a readable label the writer can rename.
function deriveArticleTitle(cluster: ThemeCluster, stage: JourneyStage, journeyType: JourneyType): string {
  const name = cluster.name;
  if (journeyType === 'pre-product') return `${name}: the complete guide`;
  switch (stage) {
    case 'awareness':     return `What is ${name}? A beginner's guide`;
    case 'consideration': return `Best ${name} compared`;
    case 'decision':      return `${name}: how to choose and get started`;
    case 'retention':     return `${name} tips, tools & resources`;
    default:              return name;
  }
}

// Tokenise for segment↔topic matching (≥4 chars, stop-words dropped).
function topicTokens(s: string): string[] {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((t: string) => t.length >= 4 && !/^(what|when|where|which|with|your|that|this|near|best|from|have|need|account|accounts)$/.test(t));
}

// Pick the audience segment whose real prompts most overlap this topic's keywords.
// Defensible: based on actual prompt text vs actual keywords. Falls back to the
// highest-volume segment (labelled "primary") only when there is zero overlap.
function matchSegmentToTopic(keywords: KwItem[], segments: AudienceSegment[]): AudienceSegment | null {
  if (segments.length === 0) return null;
  const kwToks = new Set<string>();
  for (const k of keywords) for (const t of topicTokens(k.keyword)) kwToks.add(t);
  let best: AudienceSegment | null = null, bestScore = 0;
  for (const seg of segments) {
    const promptToks = new Set<string>();
    for (const p of [...(seg.preLLMPrompts ?? []), ...(seg.productPrompts ?? []), seg.tagline ?? '', seg.whoTheyAre?.trigger ?? '']) {
      for (const t of topicTokens(p)) promptToks.add(t);
    }
    let score = 0;
    for (const t of Array.from(kwToks)) if (promptToks.has(t)) score++;
    if (score > bestScore) { bestScore = score; best = seg; }
  }
  if (best) return best;
  // No overlap → primary (largest) segment.
  return [...segments].sort((a, b) => (b.volumePct ?? 0) - (a.volumePct ?? 0))[0] ?? null;
}

// Split a real messaging/creative string into individual points of view. Pure
// formatting of existing text — nothing invented.
function splitIntoPoints(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?:•|–|—|;|\.(?:\s|$)|\n)+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 3)
    .slice(0, 5);
}

function sourceLabel(s: TopicSource): { text: string; bg: string; color: string; border: string } | null {
  switch (s) {
    case 'competitor': return { text: 'Competitor gap', bg: 'var(--ca-239-68-68-0_1)',  color: 'var(--c-f87171)', border: 'var(--ca-239-68-68-0_25)' };
    case 'journey':    return { text: 'Journey gap',    bg: 'var(--ca-34-211-238-0_1)',  color: 'var(--c-22d3ee)', border: 'var(--ca-34-211-238-0_3)' };
    case 'both':       return { text: 'Both',           bg: 'var(--ca-167-139-250-0_1)', color: 'var(--c-a78bfa)', border: 'var(--ca-167-139-250-0_25)' };
    case 'none':       return null;
  }
}

// v7.337 (QC audit dead-code sweep): buildArticleTopics and buildContentGaps were
// DELETED — never called (verified zero call sites; the panel renders the shared
// content plan via buildCanonicalClusterTopics → buildContentPlanFromTopics /
// planFromSnapshot instead, v7.176/v7.210). The ArticleTopic/ContentGap types and
// their label/render helpers remain for the (currently unrendered) drawer/table
// components below.

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function gapLabel(g: GapType): { text: string; bg: string; color: string; border: string } {
  switch (g) {
    case 'competitor-gap': return { text: 'COMPETITOR GAP', bg: 'var(--ca-239-68-68-0_1)',  color: 'var(--c-f87171)', border: 'var(--ca-239-68-68-0_25)' };
    case 'missing':        return { text: 'MISSING',        bg: 'var(--ca-249-115-22-0_1)', color: 'var(--c-fb923c)', border: 'var(--ca-249-115-22-0_25)' };
    case 'partial':        return { text: 'PARTIAL',        bg: 'var(--ca-245-158-11-0_1)', color: 'var(--c-fbbf24)', border: 'var(--ca-245-158-11-0_25)' };
  }
}

// ─── Page-map helpers (v7.163) ──────────────────────────────────────────────────
// The on-demand Semrush page-map is persisted on the analysis snapshot
// (_pageMap). Because the parent page's `analysis` prop is not refetched in
// session, an in-session pull is also cached in localStorage and hydrated
// snapshot-first (mirrors the demand-universe pattern in JourneySection).

interface PageMapPage {
  url: string;
  keywords: string[];      // v7.166: the real keywords this page ranks for (lowercased, top N by traffic)
  keywordCount?: number;   // real total # of organic keywords the page ranks for
  traffic?: number;        // estimated monthly organic traffic
  bestPosition?: number;
}
interface PageMap {
  pages?: PageMapPage[];   // v7.166: unique ranking pages, each carrying its real keywords
  // legacy (v7.163/164): keyword → page. Still read if an older pull is cached.
  byKeyword?: Record<string, { url: string; position: number; searchVolume: number }>;
  urlCount: number;
  keywordsPerPage?: number;
  builtAt: string;
}

// v7.337 (QC audit dead-code sweep): assignPageToCluster (v7.166) was DELETED — never
// called (verified zero call sites), and it was the last consumer of the lexical
// matchKeywordToCategory matcher removed above (Const II.8: stored membership only).

const pageMapCacheKey = (analysis: any): string => `orbitiq-pagemap-${analysis?.id ?? 'none'}`;

function readPageMapCache(analysis: any): PageMap | null {
  const fromSnap = (analysis?.semrushSnapshot as any)?._pageMap ?? null;
  if (fromSnap) return fromSnap;
  if (typeof window === 'undefined' || !analysis?.id) return null;
  try {
    const c = window.localStorage.getItem(pageMapCacheKey(analysis));
    return c ? (JSON.parse(c) as PageMap) : null;
  } catch { return null; }
}

// Pretty short label for a ranking URL — drops scheme/host, keeps the path.
function prettyUrl(u: string): string {
  if (!u) return '';
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    const path = (url.pathname + url.search).replace(/\/$/, '');
    return path && path !== '' ? path : '/';
  } catch {
    return u.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  }
}

function fmtEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `~${Math.round(seconds)}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `~${m}m ${s.toString().padStart(2, '0')}s left`;
}

function PageMapProgress({ progress }: { progress: { done: number; total: number; startedAt: number } | null }) {
  const total = progress?.total ?? 0;
  const done  = progress?.done ?? 0;
  const pct   = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const elapsed = progress ? (Date.now() - progress.startedAt) / 1000 : 0;
  const eta = (total > 0 && done > 0 && done < total) ? fmtEta((total - done) * (elapsed / done)) : '';
  const label = total === 0
    ? 'Starting — querying Semrush…'
    : `Pulling ranking pages · ${done.toLocaleString()} of ${total.toLocaleString()} keywords`;
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
          <div style={{ height: '100%', width: '35%', background: 'var(--c-22d3ee)', opacity: 0.6, animation: 'orbitiq-pm-indet 1.1s ease-in-out infinite' }} />
        )}
      </div>
      <style>{`@keyframes orbitiq-pm-indet{0%{margin-left:-35%}100%{margin-left:100%}}`}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// v7.193: prominent segmented control (high-contrast filled active state).
function Segmented<T extends string>({ options, value, onChange }: {
  options: Array<{ v: T; label: string; icon?: string; fill?: string; ink?: string }>;
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', borderRadius: 9, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const active = o.v === value;
        const fill = o.fill ?? 'var(--c-6c63ff)';
        const ink  = o.ink  ?? 'var(--c-dcdcf4)';
        return (
          <button key={o.v} onClick={() => onChange(o.v)} aria-pressed={active} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 15px', fontSize: 12,
            fontWeight: active ? 700 : 600, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: active ? fill : 'transparent', color: active ? ink : 'var(--c-9090b8)', transition: 'all 0.12s',
          }}>
            {o.icon && <i className={`ti ${o.icon}`} style={{ fontSize: 14 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, accent, split }: {
  label: string; value: string; sub?: string; accent?: string;
  split?: Array<{ label: string; value: number; color: string; bg: string }>;
}) {
  return (
    <div style={{ background: 'var(--c-0d0d1e)', border: '1px solid var(--c-1a1a30)', borderRadius: 10, padding: '16px 20px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--c-4a4a6a)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: accent ?? 'var(--c-dcdcf4)', margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--c-5a5a80)', marginTop: 4 }}>{sub}</p>}
      {split && split.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          {split.map((s, i) => (
            <div key={i} style={{ flex: 1, borderRadius: 5, padding: '5px 7px', background: s.bg, color: s.color }}>
              <span style={{ display: 'block', fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', opacity: 0.85, textTransform: 'uppercase' as const }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleBriefCard({ gap, segIdx }: { gap: ContentGap; segIdx: number }) {
  const stageColors  = STAGE_COLORS[gap.stage];
  const segAccent    = SEGMENT_ACCENTS[segIdx % SEGMENT_ACCENTS.length];
  const gapStyle     = gapLabel(gap.gapType);

  return (
    <div style={{ background: 'var(--c-0d0d1e)', border: '1px solid var(--c-1a1a30)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top row: stage + gap type + priority */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: stageColors.bg, color: stageColors.text, border: `1px solid ${stageColors.border}40`, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
          {gap.journeyType === 'pre-product' ? 'Pre-Product' : STAGE_LABELS[gap.stage]}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: gapStyle.bg, color: gapStyle.color, border: `1px solid ${gapStyle.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          {gapStyle.text}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--c-8080a0)' }}>
          Priority {gap.priorityScore}
        </span>
      </div>

      {/* Cluster / topic */}
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-d0d0f0)', margin: 0, lineHeight: 1.3 }}>{gap.clusterName}</p>
        <p style={{ fontSize: 11, color: 'var(--c-5a5a80)', marginTop: 4 }}>{gap.contentFormat}</p>
      </div>

      {/* Segment served */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--c-4a4a6a)' }}>Segment:</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: segAccent.bg, color: segAccent.text, border: `1px solid ${segAccent.border}30`, fontWeight: 600 }}>
          {gap.segmentName}
        </span>
      </div>

      {/* Content angle */}
      <div style={{ background: 'var(--c-080814)', border: '1px solid var(--c-151528)', borderRadius: 7, padding: '10px 12px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: 'var(--c-3a3a5a)', marginBottom: 5 }}>Content Angle</p>
        <p style={{ fontSize: 11, color: 'var(--c-8080b0)', lineHeight: 1.5, margin: 0 }}>{gap.contentAngle}</p>
      </div>

      {/* Keywords */}
      {gap.keywords.length > 0 && (
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: 'var(--c-3a3a5a)', marginBottom: 5 }}>Target Keywords</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {gap.keywords.map((kw: string, i: number) => (
              <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--c-0a0a18)', border: '1px solid var(--c-1a1a30)', color: 'var(--c-6060a0)', fontFamily: 'monospace' }}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, paddingTop: 8, borderTop: '1px solid var(--c-121224)' }}>
        <div>
          <p style={{ fontSize: 9, color: 'var(--c-3a3a5a)', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Monthly Vol</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-8080b0)' }}>{fmtVol(gap.monthlyVolume)}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, color: 'var(--c-3a3a5a)', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Annual Vol</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-8080b0)' }}>{fmtVol(gap.annualVolume)}</p>
        </div>
        {gap.topCompetitor && (
          <div>
            <p style={{ fontSize: 9, color: 'var(--c-3a3a5a)', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Top Competitor</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-f87171)' }}>{gap.topCompetitor.replace(/^www\./, '').split('.')[0]}</p>
          </div>
        )}
        <div>
          <p style={{ fontSize: 9, color: 'var(--c-3a3a5a)', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Client Coverage</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: gap.clientCovPct > 50 ? 'var(--c-34d399)' : 'var(--c-f87171)' }}>{gap.clientCovPct}%</p>
        </div>
      </div>
    </div>
  );
}

// ─── v7.191: circular persona portrait (mirrors AudienceSegmentsSection) ──────

function initialsFromName(name: string): string {
  const words = (name || '').replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/)
    .filter((w: string) => w && !/^(the|a|an|of|and)$/i.test(w));
  const picks = words.slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '');
  return picks.join('') || (name?.[0]?.toUpperCase() ?? '?');
}

function PersonaAvatar({ segment, size = 44 }: { segment: AudienceSegment | null; size?: number }) {
  const ring = '2px solid var(--ca-34-211-238-0_3)';
  if (segment?.personaImageUrl) {
    return (
      <img src={segment.personaImageUrl} alt={`AI-generated portrait representing ${segment.name}`} loading="lazy"
        title="AI-generated persona portrait — illustrative, not a real customer"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' as const, border: ring, flexShrink: 0 }} />
    );
  }
  return (
    <div aria-label={segment ? `${segment.name} (no portrait yet)` : 'No segment'}
      style={{ width: size, height: size, borderRadius: '50%', border: ring, flexShrink: 0, background: 'var(--ca-34-211-238-0_08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.round(size * 0.34), color: 'var(--c-22d3ee)' }}>
      {initialsFromName(segment?.name ?? '?')}
    </div>
  );
}

// ─── v7.191: article brief drawer (opens on a topic click) ────────────────────

function ArticleDrawer({ topic, onClose }: { topic: ArticleTopic; onClose: () => void }) {
  const sc  = STAGE_COLORS[topic.stage];
  const src = sourceLabel(topic.source);
  const seg = topic.segment;
  const optimize = topic.action === 'optimize';
  return (
    <div style={{ background: 'var(--c-0d0d1e)', border: '1px solid var(--ca-34-211-238-0_25)', borderRadius: 12, overflow: 'hidden', margin: '4px 0 8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--c-1a1a30)', background: 'var(--ca-34-211-238-0_05)' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--c-4a4a6a)', margin: '0 0 6px' }}>Article topic</p>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--c-dcdcf4)', lineHeight: 1.3 }}>{topic.title}</h4>
          <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
              background: optimize ? 'var(--ca-52-211-153-0_1)' : 'var(--ca-249-115-22-0_1)', color: optimize ? 'var(--c-34d399)' : 'var(--c-fb923c)',
              border: `1px solid ${optimize ? 'var(--ca-52-211-153-0_3)' : 'var(--ca-249-115-22-0_3)'}` }}>{optimize ? 'Optimise' : 'Build net-new'}</span>
            {src && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: src.bg, color: src.color, border: `1px solid ${src.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{src.text}</span>}
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: sc.bg, color: sc.text, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
              {topic.journeyType === 'pre-product' ? 'Pre-Product' : STAGE_LABELS[topic.stage]}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--ca-34-211-238-0_1)', color: 'var(--c-22d3ee)', border: '1px solid var(--ca-34-211-238-0_3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{topic.clusterName}</span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--c-5a5a80)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}>
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Body: keywords | segment + tonality */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr' }}>
        <div style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--c-4a4a6a)', margin: '0 0 9px' }}>Primary keywords &amp; volume</p>
          {topic.keywords.slice(0, 6).map((k: KwItem, i: number) => {
            const rank = (k.position != null && k.position > 0)
              ? { t: `#${k.position}`, c: 'var(--c-34d399)', bg: 'var(--ca-52-211-153-0_1)' }
              : k.competitor ? { t: `comp ${k.competitor.replace(/^www\./, '').split('.')[0]}`, c: 'var(--c-a78bfa)', bg: 'var(--ca-167-139-250-0_1)' }
              : { t: 'not ranking', c: 'var(--c-f87171)', bg: 'var(--ca-239-68-68-0_1)' };
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 10px', background: 'var(--c-0a0a16)', border: '1px solid var(--c-151528)', borderRadius: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--c-c0c0e0)', fontFamily: 'monospace' }}>{k.keyword}</span>
                <span style={{ fontSize: 11, color: 'var(--c-8080a0)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>
                  {fmtVol(k.searchVolume)}/mo
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginLeft: 8, color: rank.c, background: rank.bg }}>{rank.t}</span>
                </span>
              </div>
            );
          })}
          {topic.keywords.length === 0 && <p style={{ fontSize: 11, color: 'var(--c-4a4a6a)', fontStyle: 'italic' }}>No keywords on this topic yet.</p>}
        </div>
        <div style={{ padding: '14px 18px', borderLeft: '1px solid var(--c-1a1a30)' }}>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--c-4a4a6a)', margin: '0 0 9px' }}>Audience segment</p>
          {seg ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PersonaAvatar segment={seg} size={44} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-22d3ee)', margin: 0 }}>{seg.name}</p>
                  {seg.tagline && <p style={{ fontSize: 10.5, color: 'var(--c-5a5a80)', margin: '2px 0 0', lineHeight: 1.4 }}>{seg.tagline}</p>}
                </div>
              </div>
              {seg.whoTheyAre?.demographics && <p style={{ fontSize: 11, color: 'var(--c-7070a0)', marginTop: 8, lineHeight: 1.5 }}>{seg.whoTheyAre.demographics}</p>}
            </>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--c-4a4a6a)', fontStyle: 'italic', margin: 0 }}>No audience segments configured for this client yet.</p>
          )}

          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--c-4a4a6a)', margin: '16px 0 7px' }}>Tonality</p>
          <p style={{ fontSize: 12, color: 'var(--c-c0c0e0)', lineHeight: 1.55, background: 'var(--c-080814)', border: '1px solid var(--c-151528)', borderRadius: 7, padding: '10px 12px', margin: 0 }}>
            {topic.tonality || <span style={{ color: 'var(--c-4a4a6a)', fontStyle: 'italic' }}>Tonality comes from this segment&rsquo;s messaging &amp; tone brief — generate audience segments to populate it.</span>}
          </p>
        </div>
      </div>

      {/* Key points of view (full width) */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid var(--c-1a1a30)' }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--c-4a4a6a)', margin: '0 0 9px' }}>
          Key points of view for this article
        </p>
        {topic.pov.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {topic.pov.map((p: string, i: number) => (
              <li key={i} style={{ position: 'relative', padding: '6px 0 6px 18px', fontSize: 12, color: 'var(--c-c0c0e0)', lineHeight: 1.5, borderBottom: i < topic.pov.length - 1 ? '1px solid var(--c-151528)' : 'none' }}>
                <span style={{ position: 'absolute', left: 0, top: 6, color: 'var(--c-22d3ee)', fontSize: 11 }}>▸</span>{p}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--c-7070a0)', lineHeight: 1.5, margin: 0 }}>
            <span style={{ color: 'var(--c-8080a0)' }}>Angle: </span>{topic.angle}
            <br /><span style={{ fontSize: 10.5, color: 'var(--c-4a4a6a)', fontStyle: 'italic' }}>Add this segment&rsquo;s creative direction (audience segments) for article-specific points of view.</span>
          </p>
        )}
      </div>

      {/* Footer stats */}
      <div style={{ display: 'flex', gap: 22, padding: '11px 18px', borderTop: '1px solid var(--c-1a1a30)', background: 'var(--c-0b0b15)' }}>
        <div><p style={{ fontSize: 9, color: 'var(--c-4a4a6a)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 3px' }}>Monthly Vol</p><p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-c0c0e0)', margin: 0 }}>{fmtVol(topic.monthlyVolume)}</p></div>
        <div><p style={{ fontSize: 9, color: 'var(--c-4a4a6a)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 3px' }}>Annual Vol</p><p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-c0c0e0)', margin: 0 }}>{fmtVol(topic.annualVolume)}</p></div>
        <div><p style={{ fontSize: 9, color: 'var(--c-4a4a6a)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 3px' }}>Coverage</p><p style={{ fontSize: 13, fontWeight: 700, color: topic.clientCovPct > 50 ? 'var(--c-34d399)' : 'var(--c-f87171)', margin: 0 }}>{topic.clientCovPct}%</p></div>
        <div><p style={{ fontSize: 9, color: 'var(--c-4a4a6a)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 3px' }}>Format</p><p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-c0c0e0)', margin: 0 }}>{topic.format}</p></div>
        {topic.topCompetitor && <div><p style={{ fontSize: 9, color: 'var(--c-4a4a6a)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 3px' }}>Top competitor</p><p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-f87171)', margin: 0 }}>{topic.topCompetitor.replace(/^www\./, '').split('.')[0]}</p></div>}
      </div>
    </div>
  );
}

// ─── v7.191: parent→child grouped topic table (mirrors Cluster panel) ─────────

interface TopicGroup { clusterId: string; clusterName: string; clusterType: string; journeyType: JourneyType; topics: ArticleTopic[]; totalVolume: number; netNew: number; optimize: number; }

function groupTopics(topics: ArticleTopic[], order: 'net-new' | 'existing'): TopicGroup[] {
  const TYPE_ORDER: Record<string, number> = { problem: 0, procedure: 1, brand: 2, location: 3 };
  const byCluster = new Map<string, TopicGroup>();
  for (const t of topics) {
    let g = byCluster.get(t.clusterId);
    if (!g) { g = { clusterId: t.clusterId, clusterName: t.clusterName, clusterType: t.clusterType, journeyType: t.journeyType, topics: [], totalVolume: 0, netNew: 0, optimize: 0 }; byCluster.set(t.clusterId, g); }
    g.topics.push(t); g.totalVolume += t.monthlyVolume;
    if (t.action === 'net-new') g.netNew++; else g.optimize++;
  }
  const groups = Array.from(byCluster.values());
  for (const g of groups) g.topics.sort((a, b) => JOURNEY_STAGE_ORDER.indexOf(a.stage) - JOURNEY_STAGE_ORDER.indexOf(b.stage));
  groups.sort((a, b) => {
    // primary: net-new vs existing emphasis (toggle); then product type order; then volume.
    const aNN = a.netNew > 0, bNN = b.netNew > 0;
    if (aNN !== bNN) return (order === 'net-new') ? (aNN ? -1 : 1) : (aNN ? 1 : -1);
    const t = (TYPE_ORDER[a.clusterType] ?? 9) - (TYPE_ORDER[b.clusterType] ?? 9);
    return t !== 0 ? t : b.totalVolume - a.totalVolume;
  });
  return groups;
}

function TopicGroupTable({ topics, order, selectedId, onSelect }: {
  topics: ArticleTopic[]; order: 'net-new' | 'existing'; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const groups = groupTopics(topics, order);
  return (
    <div style={{ background: 'var(--c-0a0a18)', border: '1px solid var(--c-1a1a30)', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--c-1a1a30)' }}>
            {[['Theme · topic', 'left'], ['Stage', 'left'], ['Action', 'left'], ['Source', 'left'], ['Vol/mo', 'right'], ['Coverage', 'right']].map(([h, al]) => (
              <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--c-4a4a6a)', textAlign: al as 'left' | 'right', whiteSpace: 'nowrap' as const }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g: TopicGroup) => (
            <Fragment key={g.clusterId}>
              <tr>
                <td colSpan={6} style={{ padding: '11px 14px 7px', background: 'var(--c-0b0b15)', borderTop: '1px solid var(--c-1a1a30)', borderBottom: '1px solid var(--c-151528)' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-dcdcf4)' }}>{g.clusterName}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--c-5a5a80)', marginLeft: 9 }}>
                    {g.journeyType === 'pre-product' ? 'pre-product' : g.clusterType} · {g.topics.length} topic{g.topics.length !== 1 ? 's' : ''} · {fmtVol(g.totalVolume)}/mo
                  </span>
                  <span style={{ float: 'right' as const, display: 'inline-flex', gap: 6 }}>
                    {g.optimize > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--ca-52-211-153-0_1)', color: 'var(--c-34d399)', border: '1px solid var(--ca-52-211-153-0_3)' }}>{g.optimize} optimise</span>}
                    {g.netNew > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--ca-249-115-22-0_1)', color: 'var(--c-fb923c)', border: '1px solid var(--ca-249-115-22-0_3)' }}>{g.netNew} net-new</span>}
                  </span>
                </td>
              </tr>
              {g.topics.map((t: ArticleTopic) => {
                const sel = t.id === selectedId;
                const sc  = STAGE_COLORS[t.stage];
                const src = sourceLabel(t.source);
                const optimize = t.action === 'optimize';
                return (
                  <Fragment key={t.id}>
                    <tr onClick={() => onSelect(sel ? null : t.id)} style={{ cursor: 'pointer', background: sel ? 'var(--ca-34-211-238-0_05)' : 'transparent', borderLeft: sel ? '2px solid var(--c-22d3ee)' : '2px solid transparent', borderBottom: '1px solid var(--c-0d0d1a)' }}>
                      <td style={{ padding: '8px 14px 8px 22px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <i className={`ti ti-chevron-${sel ? 'down' : 'right'}`} style={{ fontSize: 12, color: sel ? 'var(--c-22d3ee)' : 'var(--c-4a4a6a)' }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-d0d0f0)' }}>{t.title}</span>
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' as const }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: sc.bg, color: sc.text, fontWeight: 600 }}>
                          {t.journeyType === 'pre-product' ? 'Pre-Product' : STAGE_LABELS[t.stage]}
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                          background: optimize ? 'var(--ca-52-211-153-0_1)' : 'var(--ca-249-115-22-0_1)', color: optimize ? 'var(--c-34d399)' : 'var(--c-fb923c)',
                          border: `1px solid ${optimize ? 'var(--ca-52-211-153-0_3)' : 'var(--ca-249-115-22-0_3)'}` }}>{optimize ? 'Optimise' : 'Net-new'}</span>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        {src ? <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: src.bg, color: src.color, border: `1px solid ${src.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em', whiteSpace: 'nowrap' as const }}>{src.text}</span>
                          : <span style={{ color: 'var(--c-3a3a5a)' }}>&mdash;</span>}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--c-8080a0)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' as const }}>{fmtVol(t.monthlyVolume)}</td>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: t.clientCovPct > 50 ? 'var(--c-34d399)' : 'var(--c-f87171)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' as const }}>{t.clientCovPct}%</td>
                    </tr>
                    {sel && (
                      <tr><td colSpan={6} style={{ padding: '0 14px 6px 22px', background: 'var(--ca-34-211-238-0_03)' }}>
                        <ArticleDrawer topic={t} onClose={() => onSelect(null)} />
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
          {groups.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--c-3a3a5a)', fontStyle: 'italic' }}>No topics yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContentMapSection({ projectId, kwVersion, analysis, competitors, claudeAssigns = {} }: Props) {
  const [claudeAssignments,  setClaudeAssignments]  = useState<Record<string, IntentType>>({});
  const [uploadedKeywords,   setUploadedKeywords]   = useState<any[]>([]);

  // v7.163: flash fix — gate the cards/views until the uploaded keywords have
  // loaded, so the snapshot-only intermediate count (e.g. 181) never paints
  // before the real count (e.g. 45) once the client footprint is folded in.
  const [kwLoaded, setKwLoaded] = useState(false);

  // v7.163: on-demand page-map (real Semrush ranking URLs). Hydrate snapshot-first
  // then localStorage (survives leaving/re-entering the panel in-session).
  const [pageMap,  setPageMap]  = useState<PageMap | null>(() => readPageMapCache(analysis));
  const [building, setBuilding] = useState(false);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; startedAt: number } | null>(null);

  // v7.260: Content Plan selection — the topics the user pushed into the Content Plan
  // panel (by ContentTopic.id). Persisted to the project DB so it survives reload/device/
  // re-analysis. selRef mirrors the live set so rapid sequential toggles chain correctly
  // (each PUT sends the full set; last-write-wins would otherwise drop a quick prior pick).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savingIds,   setSavingIds]   = useState<Set<string>>(new Set());
  const selRef = useRef<Set<string>>(new Set());
  useEffect(() => { selRef.current = selectedIds; }, [selectedIds]);

  // Load the saved selection from the project on mount / project change.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/content-plan`, { cache: 'no-store' })   // v7.262: always fresh
      .then((r: Response) => r.ok ? r.json() : { selections: [] })
      .then((d: any) => { if (!cancelled) setSelectedIds(new Set<string>(Array.isArray(d.selections) ? d.selections : [])); })
      .catch(() => { /* honest gap: leave selection empty on failure */ });
    return () => { cancelled = true; };
  }, [projectId, kwVersion]);

  // Toggle a topic in/out of the plan + persist (full-set PUT, idempotent replace).
  const toggleSelect = (id: string) => {
    const next = new Set(selRef.current);
    if (next.has(id)) next.delete(id); else next.add(id);
    selRef.current = next;
    setSelectedIds(next);   // optimistic
    const arr = Array.from(next);
    setSavingIds((s: Set<string>) => { const n = new Set(s); n.add(id); return n; });
    fetch(`/api/projects/${projectId}/content-plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: arr }),
    })
      .then((r: Response) => { if (!r.ok) throw new Error('save failed'); })
      .catch(() => {
        // Revert this id on failure so the UI never claims a save that didn't happen.
        const reverted = new Set(selRef.current);
        if (reverted.has(id)) reverted.delete(id); else reverted.add(id);
        selRef.current = reverted;
        setSelectedIds(reverted);
      })
      .finally(() => setSavingIds((s: Set<string>) => { const n = new Set(s); n.delete(id); return n; }));
  };

  const clientDomain = (analysis?.semrushSnapshot as any)?.domain ?? '';
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

  // v7.163: re-hydrate the page-map when the analysis changes (snapshot → cache).
  useEffect(() => { setPageMap(readPageMapCache(analysis)); }, [analysis?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch uploaded/CSV keywords from DB — re-runs when projectId changes
  useEffect(() => {
    if (!projectId) { setKwLoaded(true); return; }
    let cancelled = false;
    setKwLoaded(false);
    fetch(`/api/projects/${projectId}/keywords`)
      .then((r: Response) => r.ok ? r.json() : { keywords: [] })
      .then((d: any) => { if (!cancelled) { setUploadedKeywords(d.keywords ?? []); setKwLoaded(true); } })
      .catch(() => { if (!cancelled) setKwLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId, kwVersion]);   // v7.107: kwVersion bump → refetch uploaded keywords

  // v7.163: merged keyword → real ranking URL (snapshot rows first, on-demand
  // _pageMap/cache overrides with a fresher pull).
  const urlByKeyword = useMemo(() => {
    const m: Record<string, string> = {};
    const snap = (analysis?.semrushSnapshot as any) ?? {};
    for (const k of (snap.topKeywords ?? [])) {
      const kw = (k.keyword ?? '').toLowerCase().trim();
      if (kw && k.url) m[kw] = k.url;
    }
    // v7.165: invert the unique-pages store (url → its keywords) into keyword→url.
    for (const pg of (pageMap?.pages ?? [])) {
      if (!pg?.url) continue;
      for (const kw of (pg.keywords ?? [])) { const k = String(kw).toLowerCase().trim(); if (k) m[k] = pg.url; }
    }
    // Backward-compat: an older cached pull stored keyword→url directly.
    const legacy = pageMap?.byKeyword ?? {};
    for (const kw of Object.keys(legacy)) { if (legacy[kw]?.url) m[kw] = legacy[kw].url; }
    return m;
  }, [analysis, pageMap]);

  const clusters = useMemo(
    () => buildClusters(analysis, claudeAssignments, clientDomain, competitors ?? [], uploadedKeywords, urlByKeyword),
    [analysis, claudeAssignments, clientDomain, competitors, uploadedKeywords, urlByKeyword],
  );


  // v7.163: on-demand Semrush page-map pull (streamed NDJSON → determinate bar).
  async function buildPageMap() {
    setBuilding(true); setBuildErr(null);
    setProgress({ done: 0, total: 0, startedAt: Date.now() });
    try {
      const r = await fetch(`/api/projects/${projectId}/page-map`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!r.ok || !r.body) {
        let msg = `Pull failed (${r.status})`;
        try { const d = await r.json(); msg = d?.error ?? msg; } catch {}
        setBuildErr(msg); return;
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
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: any; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'start')          setProgress((p) => ({ done: 0, total: ev.total ?? 0, startedAt: p?.startedAt ?? Date.now() }));
          else if (ev.type === 'progress')  setProgress((p) => ({ done: ev.done ?? 0, total: ev.total ?? 0, startedAt: p?.startedAt ?? Date.now() }));
          else if (ev.type === 'error')     setBuildErr(ev.error ?? 'Pull failed');
          else if (ev.type === 'done' && ev.pageMap) {
            setPageMap(ev.pageMap);
            try { window.localStorage.setItem(pageMapCacheKey(analysis), JSON.stringify(ev.pageMap)); } catch {}
          }
        }
      }
    } catch (e) {
      setBuildErr(String((e as any)?.message ?? e));
    } finally {
      setBuilding(false);
      setProgress(null);
    }
  }

  // v7.176: the full content plan (topics → optimise/build, priority, briefs,
  // competitive insight) from the SAME shared builder the Content Plan sub-nav uses
  // — so the Content panel, Content Plan, Keyword and Cluster panels all reconcile.
  // v7.210: build the plan from the canonical cluster topics (one page per cluster,
  // Const III.5) so Content panel + Content Plan reconcile to the cluster count.
  // v7.353: keep the canonical topics in hand (not just the plan) — the segment lens
  // reuses the Journey panel's topic→segment attribution over their real language.
  const canonTopics = useMemo(
    () => buildCanonicalClusterTopics(analysis, clientDomain, competitors ?? [], uploadedKeywords, claudeAssigns),
    [analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns],
  );
  const plan = useMemo(() => {
    // v7.356: client brand vocabulary via the shared brandTermsOf helper so every panel
    // derives the identical set and priorities reconcile (Const II.7). Brand-related
    // topics get the low-effort priority bump (Wayne 2026-07-07).
    const brandTerms = brandTermsOf(clientDomain, analysis?.semrushSnapshot);
    if (canonTopics.length > 0) return buildContentPlanFromTopics(canonTopics, { brandTerms });
    return planFromSnapshot(analysis, uploadedKeywords, { brandTerms });
  }, [canonTopics, analysis, uploadedKeywords, clientDomain]);

  // v7.353: audience-segment lens — same attribution as the Journey panel (Const II.7).
  const topicBucket = useMemo(() => buildTopicSegmentMap(canonTopics, segments), [canonTopics, segments]);
  const segTags = useMemo(() => buildSegTags(topicBucket, segments), [topicBucket, segments]);
  const [activeSeg, setActiveSeg] = useState<string | null>(null);
  // The plan this panel renders: the active segment's view (its exclusive topics +
  // Shared, Wayne 2026-07-06) or the whole plan. Cards recompute via scopeOf — exact
  // rollups of the rows shown (Const I.1).
  const viewPlan = useMemo(
    () => (plan && activeSeg && topicBucket.size ? filterPlanBySegment(plan, topicBucket, activeSeg) : plan),
    [plan, activeSeg, topicBucket],
  );

  // v7.353: bulk select/unselect the CURRENTLY SHOWN topics (one full-set PUT — same
  // persistence contract as toggleSelect, so rapid follow-up toggles chain via selRef).
  const bulkSelect = (ids: string[], select: boolean) => {
    const prev = new Set(selRef.current);
    const next = new Set(selRef.current);
    ids.forEach((id: string) => { if (select) next.add(id); else next.delete(id); });
    selRef.current = next;
    setSelectedIds(next);   // optimistic
    setSavingIds((s: Set<string>) => { const n = new Set(s); ids.forEach((id: string) => n.add(id)); return n; });
    fetch(`/api/projects/${projectId}/content-plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: Array.from(next) }),
    })
      .then((r: Response) => { if (!r.ok) throw new Error('save failed'); })
      .catch(() => {
        // Revert the whole bulk change so the UI never claims a save that didn't happen.
        selRef.current = prev;
        setSelectedIds(prev);
      })
      .finally(() => setSavingIds((s: Set<string>) => { const n = new Set(s); ids.forEach((id: string) => n.delete(id)); return n; }));
  };

  const totalPagesPulled = pageMap?.pages?.length ?? 0;
  const hasUrlData  = totalPagesPulled > 0 || Object.keys(urlByKeyword).length > 0;
  const builtAtLabel = pageMap?.builtAt ? new Date(pageMap.builtAt).toLocaleDateString() : null;


  const hasData = clusters.length > 0;

  if (!hasData) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>📋</div>
        <p style={{ color: 'var(--c-4a4a6a)', fontSize: 13 }}>
          Run an analysis to populate the Content Plan. Keyword clusters are required.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, padding: '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-4a4a6a)', marginBottom: 5 }}>
            Foundation · 05
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-dcdcf4)', margin: 0 }}>Content Map</h2>
          <p style={{ fontSize: 12, color: 'var(--c-5a5a80)', marginTop: 5 }}>
            Each keyword cluster mapped to the page that already ranks for it &mdash; so you can see what to <span style={{ color: 'var(--c-34d399)' }}>optimise</span> versus what to <span style={{ color: 'var(--c-fb923c)' }}>build net&#8209;new</span>.
          </p>
        </div>

        {/* v7.163: on-demand ranking-page pull */}
        <div style={{ textAlign: 'right' as const, minWidth: 220 }}>
          <button
            onClick={buildPageMap}
            disabled={building}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', fontSize: 12, fontWeight: 700, borderRadius: 9,
              background: building ? 'var(--c-14142a)' : 'var(--c-22d3ee)', color: building ? 'var(--c-9090b8)' : 'var(--c-08080f)',
              border: `1px solid ${building ? 'var(--c-2a2a45)' : 'var(--c-22d3ee)'}`, cursor: building ? 'default' : 'pointer', whiteSpace: 'nowrap' as const,
            }}
          >
            <i className={`ti ${building ? 'ti-loader-2' : 'ti-map-pin-search'}`} style={{ fontSize: 14 }} />
            {building ? 'Pulling pages…' : hasUrlData ? 'Refresh ranking pages' : 'Map ranking pages'}
          </button>
          <p style={{ fontSize: 10, color: 'var(--c-4a4a6a)', marginTop: 6, lineHeight: 1.4 }}>
            {builtAtLabel ? `Pages mapped ${builtAtLabel} · ` : ''}Pulls your unique ranking pages + their keywords from Semrush
          </p>
          {buildErr && <p style={{ fontSize: 11, color: 'var(--c-f87171)', marginTop: 4 }}>{buildErr}</p>}
        </div>
      </div>

      {building && <div style={{ marginBottom: 18 }}><PageMapProgress progress={progress} /></div>}

      {/* v7.163: flash fix — hold the cards/views until the client footprint loads */}
      {!kwLoaded ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' as const }}>
          <i className="ti ti-loader-2" style={{ color: 'var(--c-22d3ee)', fontSize: 18 }} />
          <p style={{ color: 'var(--c-5a5a80)', fontSize: 12, marginTop: 10 }}>Loading content plan&hellip;</p>
        </div>
      ) : (
      <>
      {/* v7.176: the redesigned, journey-fed content experience leads the panel. */}
      {plan && (
        <div style={{ marginBottom: 26 }}>
          {/* v7.353: segment lens — same attribution as the Audience Journeys panel;
              Shared topics show under every segment. Chip counts are real row counts. */}
          {segments.length > 0 && topicBucket.size > 0 && (
            <SegmentFilterBar
              segments={segments}
              active={activeSeg}
              onChange={setActiveSeg}
              countOf={(id: string | null) => {
                if (!plan) return 0;
                if (id === null) return plan.topics.length;
                return filterPlanBySegment(plan, topicBucket, id).topics.length;
              }}
            />
          )}
          <ContentExplorer plan={viewPlan ?? plan} mode="content"
            selectable
            clientName={clientDomain || 'client'}
            selectedIds={selectedIds}
            savingIds={savingIds}
            topicSeg={segTags}
            onToggleSelect={toggleSelect}
            onBulkSelect={bulkSelect} />
        </div>
      )}
      </>
      )}
    </div>
  );
}
