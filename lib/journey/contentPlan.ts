/**
 * Content-plan logic (v7.176)
 *
 * Turns the connected-journey graph into the writer-facing CONTENT PLAN: each
 * journey topic becomes a content topic with a distance-to-conversion, a priority
 * tier (P0/P1/P2), a quick-win flag, a refresh flag, an audience-prompt coverage
 * count, and a ready-to-write brief (title, outline, PAA questions, target
 * keywords, internal links, SERP-feature targets).
 *
 * Pure + framework-free (imported by ContentMapSection AND ContentPlanSection),
 * ES5-safe (no for…of over Set/Map; no nested function declarations in blocks).
 *
 * DEFENSIBILITY — nothing is fabricated:
 *  • volume = the topic's keywords' verified Semrush volumes (from the graph).
 *  • distance-to-conversion = an ordinal from journey stage + lane (not a metric).
 *  • prompt coverage = a COUNT of audience-segment prompts that touch the topic
 *    (we never invent a "conversation volume").
 *  • priority buckets from distance + search demand + prompt coverage.
 *  • titles / outlines / FAQs are SUGGESTIONS templated from the topic's own
 *    keywords + stage — clearly editorial scaffolding, never presented as data.
 */

import type { JourneyGraph, GraphNode, GraphEdge, SupportType, NodeState } from './graph';
import { SUPPORT_LABEL, buildJourneyGraph } from './graph';
import { filterUniverseExcludedBrands } from '@/lib/utils/kwVolume';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';   // v7.357: P3 = Backlog (4th tier, Wayne 2026-07-07)

export interface InternalLink { name: string; dir: 'from' | 'to'; why: string; }
export interface Brief {
  title:   string;
  outline: string[];      // suggested H2s
  faq:     string[];      // People-Also-Ask style questions to answer
  keywords: { keyword: string; searchVolume: number; state: NodeState }[];
  links:   InternalLink[];
  serp:    string[];      // SERP-feature targets
}

export interface ContentTopic {
  id:           string;
  name:         string;
  lane:         GraphNode['lane'];
  kind:         GraphNode['kind'];
  supportType:  SupportType;
  stage:        GraphNode['stage'];
  state:        NodeState;
  action:       'optimize' | 'build';
  url:          string | null;
  totalVol:     number;
  clientVol:    number;
  clientCovPct: number;
  kwCount:      number;
  competitor:   string | null;
  // v7.249: client's best (lowest) real Semrush SERP position across this topic's
  // ranked keywords; null when the client ranks for none (net-new / competitor / missing).
  // Exact rollup of real source rows (Const I.1) — never modeled.
  bestPosition: number | null;
  // content-plan signals
  distance:     number;          // 1 (at decision) … 4 (just aware)
  distanceLabel: string;
  promptCount:  number;
  priority:     Priority;
  quickWin:     boolean;
  refresh:      boolean;
  brief:        Brief;
}

export interface ContentPlan {
  topics: ContentTopic[];
  scope: {
    total: number; totalVol: number;
    existing: number; existingVol: number;   // optimise
    build: number; buildVol: number;         // net-new
    quickWins: number; quickWinVol: number;
    p0: number; p0Vol: number;
    p1: number; p1Vol: number;
    p2: number; p2Vol: number;
    p3: number; p3Vol: number;   // v7.357: Backlog tier
  };
}

// v7.260: single scope-rollup helper. The content-plan scope is purely a roll-up of
// its topic list, so both builders below AND the Content-Plan selection filter
// (filterPlanByIds) compute it through this ONE function — no forked rollups, exact
// TS sums of real source rows (Const I.1/I.3).
export function scopeOf(topics: ContentTopic[]): ContentPlan['scope'] {
  const sum = (arr: ContentTopic[]) => arr.reduce((s, t) => s + t.totalVol, 0);
  const existing = topics.filter((t) => t.state === 'existing');
  const build = topics.filter((t) => t.state !== 'existing');
  const qw = topics.filter((t) => t.quickWin);
  const p0 = topics.filter((t) => t.priority === 'P0');
  const p1 = topics.filter((t) => t.priority === 'P1');
  const p2 = topics.filter((t) => t.priority === 'P2');
  const p3 = topics.filter((t) => t.priority === 'P3');
  return {
    total: topics.length, totalVol: sum(topics),
    existing: existing.length, existingVol: sum(existing),
    build: build.length, buildVol: sum(build),
    quickWins: qw.length, quickWinVol: sum(qw),
    p0: p0.length, p0Vol: sum(p0),
    p1: p1.length, p1Vol: sum(p1),
    p2: p2.length, p2Vol: sum(p2),
    p3: p3.length, p3Vol: sum(p3),
  };
}

// v7.260: Content Plan = the user's hand-picked subset of the full content plan. Filter
// the canonical topics to the selected ids and recompute scope through scopeOf, so the
// destination panel's cards reconcile EXACTLY with the picked rows (Const II.7 view of
// one source of truth; I.3 no double-count). Source order is preserved.
export function filterPlanByIds(plan: ContentPlan, ids: Iterable<string>): ContentPlan {
  const set = ids instanceof Set ? ids : new Set(ids);
  const topics = plan.topics.filter((t) => set.has(t.id));
  return { topics, scope: scopeOf(topics) };
}

export const DISTANCE_LABEL: Record<number, string> = {
  1: 'At decision', 2: 'Evaluating', 3: 'Researching', 4: 'Just aware',
};

// ─── v7.356: funnel-stage-driven distance + priority (Wayne 2026-07-07) ─────────
// The product journey is no longer flattened to one distance. Each product topic
// already carries its constitutionally-fixed funnel-stage tag (III.11: intent group →
// Awareness/Consideration/Decision/Retention); we read that stored stage to place the
// topic on the distance-to-conversion axis AND to set priority, so lower-funnel (higher
// intent-to-convert) work rises to the top. Brand-related topics — the client's own
// brand and brand-modifier terms — are treated as high-intent, low-effort wins and
// prioritized on demand (Wayne's call 2026-07-07), never de-prioritized. Distance stays
// an ORDINAL derived from the stored stage (not a metric, per this file's header);
// volume stays the exact TS rollup (Const I.1) — nothing is modeled.
type FunnelStage = GraphNode['stage'];

// A topic is brand-related when it lives under a brand category (parentType 'brand') OR
// its own text carries the client's brand token(s). Only tokens ≥4 chars drive the
// substring test — short 2–3 char brands (e.g. "td") are already captured by the brand
// category, and a short token could otherwise false-match ("td" inside "study").
export function topicIsBrandRelated(parentType: string, text: string, brandTerms: string[]): boolean {
  if (parentType === 'brand') return true;
  if (!brandTerms || !brandTerms.length) return false;
  const hay = (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!hay) return false;
  for (let i = 0; i < brandTerms.length; i++) {
    const t = String(brandTerms[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t.length >= 4 && hay.indexOf(t) >= 0) return true;
  }
  return false;
}

// v7.356: the client brand vocabulary used for the brand-related priority bump —
// domain root + the snapshot's stored `_brandTerms`. ONE definition so every panel
// (Content Map / Content Plan / Scope / Executive Summary) derives the IDENTICAL brand
// set and their priorities reconcile (Const II.7, no cross-panel drift). Client brand
// only — competitor brands are never bumped.
export function brandTermsOf(clientDomain: string, snapshot: any): string[] {
  const root = String(clientDomain || '')
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    .replace(/\.(com|net|org|io|co|ca|us|uk|au|gov|edu|biz|info)(\.[a-z]{2})?$/i, '')
    .split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const stored: string[] = Array.isArray(snapshot && snapshot._brandTerms) ? snapshot._brandTerms : [];
  const out: string[] = [];
  if (root) out.push(root);
  for (let i = 0; i < stored.length; i++) { const t = String(stored[i] || '').trim(); if (t) out.push(t); }
  return out;
}

export interface TopicScore { distance: number; priority: Priority; quickWin: boolean; }

// ONE scoring definition, shared by BOTH plan builders so the graph path and the
// canonical-topic path can never diverge (Const II.7).
//
// v7.357 — FOUR priority tiers (Wayne 2026-07-07). Priority = funnel proximity × demand,
// where "above median" (this project's own median topic volume) is the demand gate:
//  • P0 Do first : brand OR decision with real demand; consideration/retention above median.
//  • P1 Next     : brand/decision with zero demand; consideration/retention below median;
//                  product-awareness above median.
//  • P2 Later    : product-awareness below median; pre-product above median.
//  • P3 Backlog  : pre-product below median (farthest from conversion + thin demand).
// Distance (the 4-dot meter) stays a separate funnel-proximity ordinal: brand/decision = 1,
// consideration/retention = 2, product-awareness = 3, pre-product = 4 (researching = 3).
// quick-win = a competitor gap close to conversion (distance ≤ 2) that is above median.
// Everything is an ordinal from stored stage + the exact volume rollup (Const I.1) — nothing modeled.
export function scoreTopic(input: {
  lane: 'product' | 'pre-product';
  stage: FunnelStage;
  brandRelated: boolean;
  totalVol: number;
  state: NodeState;
  median: number;
}): TopicScore {
  const aboveMedian = input.totalVol > input.median && input.totalVol > 0;
  const hasDemand   = input.totalVol > 0;
  const lowerFunnel = input.brandRelated || input.stage === 'decision';   // brand + decision
  // distance meter (funnel proximity)
  let distance: number;
  if (input.lane === 'pre-product') distance = input.stage === 'awareness' ? 4 : 3;
  else if (lowerFunnel) distance = 1;
  else if (input.stage === 'consideration' || input.stage === 'retention') distance = 2;
  else distance = 3;                                                       // product awareness
  // priority tier (4)
  let priority: Priority;
  if (input.lane === 'pre-product') {
    priority = aboveMedian ? 'P2' : 'P3';
  } else if (lowerFunnel) {
    priority = hasDemand ? 'P0' : 'P1';
  } else if (input.stage === 'consideration' || input.stage === 'retention') {
    priority = aboveMedian ? 'P0' : 'P1';
  } else {                                                                 // product awareness
    priority = aboveMedian ? 'P1' : 'P2';
  }
  const quickWin = input.state === 'competitor' && distance <= 2 && aboveMedian;
  return { distance, priority, quickWin };
}

// ─── v7.357: search-demand buckets (High / Med / Low) — median split + top-decile ───
// Wayne's choice (2026-07-07): Low = at/below this project's median topic volume, Med =
// above median, High = top ~10% (90th-percentile outliers). Pure ordinals over the exact
// volume rollup (Const I.1) — nothing modeled. Used by the Content Map's demand view; the
// priority tiers above use the same median gate so the two lenses stay consistent.
export type DemandBucket = 'high' | 'med' | 'low';
export interface DemandStats { median: number; p90: number; }
export function demandStatsOf(vols: number[]): DemandStats {
  const s = vols.filter((v) => v > 0).slice().sort((a, b) => a - b);
  if (!s.length) return { median: 0, p90: 0 };
  const median = s[Math.floor(s.length / 2)];
  const p90    = s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
  return { median, p90 };
}
export function demandBucketOf(vol: number, stats: DemandStats): DemandBucket {
  if (vol >= stats.p90 && stats.p90 > 0) return 'high';
  if (vol > stats.median) return 'med';
  return 'low';
}
export const DEMAND_LABEL: Record<DemandBucket, string> = { high: 'High volume', med: 'Med volume', low: 'Low volume' };

// SERP-feature targets from the topic's keyword signals (transparent heuristics).
function serpTargets(kws: { keyword: string }[], stage: string): string[] {
  const set: Record<string, boolean> = {};
  for (let i = 0; i < kws.length; i++) {
    const k = kws[i].keyword.toLowerCase();
    if (/^(how|what|why|can|does|will|is|are|should)\b/.test(k) || k.indexOf('?') >= 0) set['PAA'] = true;
    if (k.indexOf('best') >= 0 || k.indexOf(' vs ') >= 0 || k.indexOf('how much') >= 0 || k.indexOf('cost') >= 0 || k.indexOf('how to') >= 0) set['Featured snippet'] = true;
    if (k.indexOf('before and after') >= 0 || k.indexOf('before after') >= 0 || k.indexOf('results') >= 0 || k.indexOf('photos') >= 0) set['Image pack'] = true;
    if (k.indexOf('how to') >= 0 || k.indexOf('recovery') >= 0 || k.indexOf('before and after') >= 0 || k.indexOf('exercises') >= 0) set['Video'] = true;
  }
  const out = Object.keys(set);
  return out.length ? out : (stage === 'decision' ? ['Featured snippet'] : ['PAA']);
}

function isQuestion(k: string): boolean {
  return /^(how|what|why|can|does|will|is|are|should|do|where|which)\b/.test(k.toLowerCase());
}

// Title suggestion templated from the topic + stage. Editorial scaffolding only.
// Const III.8 — when the node has real target keywords, the title is anchored on
// its highest-volume keyword (never a generic paraphrase). The templated forms
// below are the honest-gap fallback used only when the node carries no keywords.
function briefTitle(n: GraphNode): string {
  if (n.keywords && n.keywords.length) return briefTitleFromKeywords(n.seed || n.name, n.keywords);
  const base = n.name.replace(/\s+—\s+.*/, '');   // strip "— Cost & financing" suffix for the core noun
  const productNoun = titleCaseWord(n.seed);
  if (n.kind === 'problem') return `${cap(n.name)}: Causes and What Actually Works`;
  if (n.kind === 'core')    return `${cap(n.name)}: Procedure, Cost, Recovery & Results`;
  switch (n.supportType) {
    case 'cost':       return `How Much Does ${productNoun} Cost? Pricing & Financing`;
    case 'recovery':   return `${productNoun} Recovery: Timeline & What to Expect`;
    case 'safety':     return `Is ${productNoun} Safe? Risks, Side Effects & Candidacy`;
    case 'results':    return `${productNoun} Before & After: Real Results`;
    case 'comparison': return `${cap(n.name)}: Which Is Right for You?`;
    default:           return cap(n.name);
  }
}

function briefOutline(n: GraphNode): string[] {
  if (n.kind === 'problem') return ['Why this happens', 'What you can try yourself (honest take)', 'Options ranked by effectiveness', 'When to consider a professional solution'];
  if (n.kind === 'core')    return ['What it treats & how it works', 'Techniques / options compared', 'Cost & financing', 'Recovery & expected results', 'Am I a candidate?'];
  switch (n.supportType) {
    case 'cost':       return ['Average cost & what changes it', 'Financing & payment plans', 'Insurance & coverage', 'Is it worth the investment?'];
    case 'recovery':   return ['Day-by-day recovery timeline', 'Managing discomfort & swelling', 'Return to work & exercise', 'Warning signs to watch for'];
    case 'safety':     return ['Safety profile & track record', 'Possible risks & how they’re managed', 'Who is and isn’t a candidate', 'Choosing a qualified provider'];
    case 'results':    return ['What results to expect', 'Before & after timeline', 'Factors that affect outcomes', 'How to maintain results'];
    case 'comparison': return ['Key differences at a glance', 'Who each option is best for', 'Cost comparison', 'Can they be combined?'];
    default:           return ['Overview', 'Key details', 'What to do next'];
  }
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleCaseWord(s: string): string { return s.replace(/\b\w/g, (c: string) => c.toUpperCase()); }

// ─── v7.255 / Const III.8 — title carries the highest-volume target keyword ─────
// The suggested article title MUST contain the highest search-volume keyword among
// the piece's own matching target keywords (real Semrush volume, Const I.1/I.2) —
// never a generic paraphrase of the cluster name (the "Stock Investing" vs
// "how to invest in stocks 673K" case). Returns the top keyword in natural title
// case. Ties break to the more specific (longer) commercially-useful term (III.6);
// remaining ties break alphabetically for determinism. Falls back to the product
// noun only when the piece has zero keywords (honest gap, Const I.5).
const TITLE_MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'into',
  'nor', 'of', 'on', 'onto', 'or', 'per', 'the', 'to', 'via', 'vs', 'with',
]);
function toNaturalTitleCase(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lw = w.toLowerCase();
      // keep an already-styled token (e.g. "APR", "VA", "0%") as written
      if (/[A-Z0-9]/.test(w) && w !== lw && w.slice(1) !== w.slice(1).toLowerCase()) return w;
      if (i !== 0 && i !== words.length - 1 && TITLE_MINOR_WORDS.has(lw)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(' ');
}
function topVolumeKeyword<T extends { keyword: string; searchVolume: number }>(keywords: T[]): T | null {
  if (!keywords.length) return null;
  return keywords.slice().sort(
    (a, b) =>
      (b.searchVolume - a.searchVolume) ||      // 1) highest real volume
      (b.keyword.length - a.keyword.length) ||  // 2) tie → more specific term (III.6)
      a.keyword.localeCompare(b.keyword),       // 3) deterministic
  )[0];
}
export function briefTitleFromKeywords(
  product: string,
  keywords: Array<{ keyword: string; searchVolume: number }>,
): string {
  const top = topVolumeKeyword(keywords);
  return top ? toNaturalTitleCase(top.keyword) : cap(product);
}

// Internal links from the graph edges touching this node.
function linksFor(node: GraphNode, graph: JourneyGraph): InternalLink[] {
  const byId: Record<string, GraphNode> = {};
  for (let i = 0; i < graph.nodes.length; i++) byId[graph.nodes[i].id] = graph.nodes[i];
  const out: InternalLink[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < graph.edges.length; i++) {
    const e: GraphEdge = graph.edges[i];
    let otherId = ''; let dir: 'from' | 'to' = 'to';
    if (e.from === node.id) { otherId = e.to;   dir = 'to'; }
    else if (e.to === node.id) { otherId = e.from; dir = 'from'; }
    else continue;
    const other = byId[otherId]; if (!other) continue;
    const key = otherId + dir; if (seen[key]) continue; seen[key] = true;
    out.push({ name: other.name, dir, why: e.why });
  }
  return out.slice(0, 6);
}

function promptCoverage(node: GraphNode, prompts: string[]): number {
  if (!prompts.length) return 0;
  // distinctive tokens of the topic (seed + name), len>=4
  const toks: Record<string, boolean> = {};
  const src = (node.seed + ' ' + node.name).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
  for (let i = 0; i < src.length; i++) if (src[i].length >= 4) toks[src[i]] = true;
  const tokList = Object.keys(toks);
  let count = 0;
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i].toLowerCase();
    let hit = false;
    for (let j = 0; j < tokList.length; j++) { if (p.indexOf(tokList[j]) >= 0) { hit = true; break; } }
    if (hit) count++;
  }
  return count;
}

export interface PlanOpts { audiencePrompts?: string[]; brandTerms?: string[]; }

export function buildContentPlan(graph: JourneyGraph, opts: PlanOpts = {}): ContentPlan {
  const prompts = opts.audiencePrompts ?? [];
  const brandTerms = opts.brandTerms ?? [];
  const vols = graph.nodes.map((n) => n.totalVol).slice().sort((a, b) => a - b);
  const median = vols.length ? vols[Math.floor(vols.length / 2)] : 0;

  const topics: ContentTopic[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    // v7.356: graph nodes carry no parentType, so brand-category membership is detected
    // by the client brand token on the node's own label/seed (Const II.7 shared scorer).
    const brandRelated = topicIsBrandRelated('', n.name + ' ' + n.seed, brandTerms);
    const sc = scoreTopic({ lane: n.lane, stage: n.stage, brandRelated, totalVol: n.totalVol, state: n.state, median });
    const distance = sc.distance;
    const quickWin = sc.quickWin;
    const priority = sc.priority;
    const refresh = n.state === 'existing' && n.clientCovPct < 60;
    const promptCount = promptCoverage(n, prompts);
    // v7.249: best (lowest) real client SERP position across this node's ranked keywords
    // (TopicKeyword.rank, real Semrush per Const I.1), null when the client ranks for none.
    const rankedPositions = n.keywords
      .filter((k) => k.state === 'existing' && k.rank != null)
      .map((k) => k.rank as number);
    const bestPosition = rankedPositions.length ? Math.min(...rankedPositions) : null;

    const faqKws = n.keywords.filter((k) => isQuestion(k.keyword)).slice(0, 4).map((k) => cap(k.keyword) + '?');
    const brief: Brief = {
      title: briefTitle(n),
      outline: briefOutline(n),
      faq: faqKws.length ? faqKws : [cap(n.name) + ' — what should readers know first?'],
      keywords: n.keywords.slice(0, 12),
      links: linksFor(n, graph),
      serp: serpTargets(n.keywords, n.stage),
    };

    topics.push({
      id: n.id, name: n.name, lane: n.lane, kind: n.kind, supportType: n.supportType,
      stage: n.stage, state: n.state, action: n.action, url: n.url,
      totalVol: n.totalVol, clientVol: n.clientVol, clientCovPct: n.clientCovPct, kwCount: n.kwCount,
      competitor: n.competitor,
      bestPosition,
      distance, distanceLabel: DISTANCE_LABEL[distance], promptCount, priority, quickWin, refresh, brief,
    });
  }

  // scope rollup (v7.260: via the shared scopeOf helper — single rollup definition)
  return { topics, scope: scopeOf(topics) };
}

export const PRIORITY_LABEL: Record<Priority, string> = { P0: 'Do first', P1: 'Next', P2: 'Later', P3: 'Backlog' };
export { SUPPORT_LABEL };

// ─── v7.210: ONE PAGE PER CLUSTER (Const III.5 reconciliation) ──────────────────
// Builds the content plan directly from the canonical cluster topics (the Cluster
// panel's flattened "one cluster = one intent = one page" units) instead of forking
// a separate demand-universe topic set. Result: content-plan total === cluster count,
// so 2514 clusters → 2514 pages (or fewer once AI-refine merges synonym intents).
// The input is structurally a ThemeClustersPanel `Topic` (kept as a local interface
// so this pure lib never imports the client component — no import cycle).
export interface CanonicalTopicInput {
  id:          string;
  parentName:  string;
  parentType:  'procedure' | 'brand' | 'location' | 'demand' | 'problem';
  product:     string;
  pageUrl?:    string;
  stage:       GraphNode['stage'];
  totalVolume: number;
  keywords: Array<{
    keyword:     string;
    searchVolume: number;
    position:    number | null;
    isGap:       boolean;
    competitor?: string | null;
    origin?:     'footprint' | 'demand';
  }>;
}

function topicOutline(lane: GraphNode['lane'], kind: GraphNode['kind']): string[] {
  if (kind === 'problem') return ['Why this happens', 'What you can try yourself (honest take)', 'Options ranked by effectiveness', 'When to consider a professional solution'];
  return ['What it is & who it’s for', 'Key options / details compared', 'Cost & considerations', 'How to decide your next step'];
}

export function buildContentPlanFromTopics(topics: CanonicalTopicInput[], opts: PlanOpts = {}): ContentPlan {
  const brandTerms = opts.brandTerms ?? [];
  const vols = topics.map(t => t.totalVolume).slice().sort((a, b) => a - b);
  const median = vols.length ? vols[Math.floor(vols.length / 2)] : 0;

  const out: ContentTopic[] = [];
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    const lane: GraphNode['lane'] = t.parentType === 'problem' ? 'pre-product' : 'product';
    const kind: GraphNode['kind'] = t.parentType === 'problem' ? 'problem' : 'core';

    const footprint = t.keywords.filter(k => k.origin !== 'demand');
    const clientRanked = footprint.filter(k => !k.isGap && k.position !== null);
    // v7.249: best (lowest) real SERP position the client holds in this topic — exact
    // from real Semrush positions (Const I.1), null when the client ranks for none.
    const bestPosition = clientRanked.length
      ? Math.min(...clientRanked.map(k => k.position as number))
      : null;
    const gaps = t.keywords.filter(k => k.isGap);
    const clientVol = clientRanked.reduce((s, k) => s + k.searchVolume, 0);
    const compVol = gaps.reduce((s, k) => s + k.searchVolume, 0);
    const hasClient = clientRanked.length > 0 || !!t.pageUrl;
    const state: NodeState = hasClient ? 'existing' : (compVol > 0 ? 'competitor' : 'missing');
    const action: 'optimize' | 'build' = state === 'existing' ? 'optimize' : 'build';
    const url = t.pageUrl ?? null;
    const clientCovPct = t.totalVolume > 0 ? Math.round((clientVol / t.totalVolume) * 100) : 0;
    const competitor = gaps.find(k => k.competitor)?.competitor ?? null;

    // v7.356: funnel-stage-driven distance + priority via the shared scorer (Const II.7).
    // Brand text = product label + its top real keywords (parentType 'brand' short-circuits).
    const brandRelated = topicIsBrandRelated(
      t.parentType,
      t.product + ' ' + t.keywords.slice(0, 8).map(k => k.keyword).join(' '),
      brandTerms,
    );
    const sc = scoreTopic({ lane, stage: t.stage, brandRelated, totalVol: t.totalVolume, state, median });
    const distance = sc.distance;
    const quickWin = sc.quickWin;
    const priority = sc.priority;
    const refresh = state === 'existing' && clientCovPct < 60;

    const briefKws = t.keywords.slice().sort((a, b) => b.searchVolume - a.searchVolume).slice(0, 12).map(k => ({
      keyword: k.keyword, searchVolume: k.searchVolume,
      state: (k.isGap ? 'competitor' : (k.position !== null ? 'existing' : 'missing')) as NodeState,
    }));
    const faqKws = t.keywords.filter(k => isQuestion(k.keyword)).slice(0, 4).map(k => cap(k.keyword) + '?');

    out.push({
      id: t.id, name: t.product, lane, kind, supportType: 'core',
      stage: t.stage, state, action, url,
      totalVol: t.totalVolume, clientVol, clientCovPct, kwCount: t.keywords.length, competitor,
      bestPosition,
      distance, distanceLabel: DISTANCE_LABEL[distance], promptCount: 0, priority, quickWin, refresh,
      brief: {
        // Const III.8 — anchor on the highest-volume real target keyword, not the
        // cluster-name paraphrase (briefKws is already sorted desc by real volume).
        title: briefTitleFromKeywords(t.product, t.keywords),
        outline: topicOutline(lane, kind),
        faq: faqKws.length ? faqKws : [cap(t.product) + ' — what should readers know first?'],
        keywords: briefKws,
        links: [],
        serp: serpTargets(t.keywords, t.stage),
      },
    });
  }

  // internal links = sibling topics under the same parent theme (up to 6)
  const byParent: Record<string, ContentTopic[]> = {};
  for (let i = 0; i < out.length; i++) { const p = topics[i].parentName; (byParent[p] = byParent[p] || []).push(out[i]); }
  for (let i = 0; i < out.length; i++) {
    const siblings = (byParent[topics[i].parentName] || []).filter(s => s.id !== out[i].id).slice(0, 6);
    out[i].brief.links = siblings.map(s => ({ name: s.name, dir: 'to' as const, why: 'Same theme — cross-link' }));
  }

  // v7.260: scope via the shared scopeOf helper — single rollup definition
  return { topics: out, scope: scopeOf(out) };
}

// ─── Single wiring point: analysis snapshot → content plan ──────────────────────
// Both the Content panel and the Content Plan sub-nav call this so they share the
// EXACT same topic→keyword pool, footprint overlay, and competitor mapping — which
// is what makes the volumes reconcile with the Keyword and Cluster panels.
export function planFromSnapshot(analysis: any, uploadedKeywords: any[] = [], opts: PlanOpts = {}): ContentPlan | null {
  const snap = (analysis && analysis.semrushSnapshot) ? analysis.semrushSnapshot : {};
  // v7.208: honour the user competitor-brand blocklist on the demand lens too, so
  // Content plan + Content map never surface a blocklisted brand (e.g. "Schwab").
  const universe = filterUniverseExcludedBrands(snap._demandUniverse, snap);
  if (!universe || !(universe.topics && universe.topics.length)) return null;

  const client = new Set<string>();
  const competitor = new Set<string>();
  const urlByKeyword: Record<string, string> = {};
  const competitorByKeyword: Record<string, string> = {};

  const topKw = snap.topKeywords || [];
  for (let i = 0; i < topKw.length; i++) {
    const kw = String(topKw[i].keyword || '').toLowerCase().trim();
    if (!kw) continue;
    client.add(kw);
    if (topKw[i].url) urlByKeyword[kw] = topKw[i].url;
  }
  const gapKw = snap.gapKeywords || [];
  for (let i = 0; i < gapKw.length; i++) {
    const kw = String(gapKw[i].keyword || '').toLowerCase().trim();
    if (!kw) continue;
    competitor.add(kw);
    if (gapKw[i].competitor) competitorByKeyword[kw] = String(gapKw[i].competitor);
  }
  const pages = (snap._pageMap && snap._pageMap.pages) ? snap._pageMap.pages : [];
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i]; if (!pg || !pg.url) continue;
    const kws = pg.keywords || [];
    for (let j = 0; j < kws.length; j++) { const k = String(kws[j]).toLowerCase().trim(); if (k) urlByKeyword[k] = pg.url; }
  }
  for (let i = 0; i < uploadedKeywords.length; i++) {
    const k = uploadedKeywords[i]; const kw = String(k.keyword || '').toLowerCase().trim();
    if (!kw) continue;
    if (k.type === 'gap') { competitor.add(kw); if (k.domain) competitorByKeyword[kw] = String(k.domain); }
    else if (k.source !== 'blocked') { client.add(kw); if (k.url && !urlByKeyword[kw]) urlByKeyword[kw] = String(k.url); }   // v7.251: uploaded CSV ranking URL
  }

  const segments = snap._audienceSegments || [];
  const audiencePrompts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const pre = s.preLLMPrompts || []; const prod = s.productPrompts || [];
    for (let j = 0; j < pre.length; j++)  audiencePrompts.push(String(pre[j]));
    for (let j = 0; j < prod.length; j++) audiencePrompts.push(String(prod[j]));
    if (s.whoTheyAre && s.whoTheyAre.trigger) audiencePrompts.push(String(s.whoTheyAre.trigger));
  }

  // v7.356: brand vocabulary for the brand-related priority bump — explicit option
  // first, else the snapshot's own client brand terms (`_brandTerms`).
  const brandTerms = (opts.brandTerms && opts.brandTerms.length)
    ? opts.brandTerms
    : (Array.isArray(snap._brandTerms) ? snap._brandTerms : []);

  const graph = buildJourneyGraph(universe, { clientRanked: client, competitorRanked: competitor, urlByKeyword, competitorByKeyword });
  return buildContentPlan(graph, { audiencePrompts, brandTerms });
}
