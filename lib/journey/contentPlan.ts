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

export type Priority = 'P0' | 'P1' | 'P2';

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
  };
}

export const DISTANCE_LABEL: Record<number, string> = {
  1: 'At decision', 2: 'Evaluating', 3: 'Researching', 4: 'Just aware',
};

// Distance to conversion: closest (1) = product decision/support; farthest (4) =
// pre-product awareness. Pure ordinal from lane + kind + stage.
function distanceOf(n: GraphNode): number {
  if (n.lane === 'product') {
    if (n.kind === 'support') return n.supportType === 'comparison' ? 2 : 1;
    return 2; // core
  }
  // pre-product
  return n.stage === 'awareness' ? 4 : 3;
}

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
function briefTitle(n: GraphNode): string {
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

export interface PlanOpts { audiencePrompts?: string[]; }

export function buildContentPlan(graph: JourneyGraph, opts: PlanOpts = {}): ContentPlan {
  const prompts = opts.audiencePrompts ?? [];
  const vols = graph.nodes.map((n) => n.totalVol).slice().sort((a, b) => a - b);
  const median = vols.length ? vols[Math.floor(vols.length / 2)] : 0;

  const topics: ContentTopic[] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const distance = distanceOf(n);
    const highDemand = n.totalVol >= median && n.totalVol > 0;
    const quickWin = n.state === 'competitor' && distance <= 2 && highDemand;
    let priority: Priority;
    if (distance <= 2 && (highDemand || quickWin)) priority = 'P0';
    else if (distance <= 2 || (distance === 3 && highDemand)) priority = 'P1';
    else priority = 'P2';
    const refresh = n.state === 'existing' && n.clientCovPct < 60;
    const promptCount = promptCoverage(n, prompts);

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
      distance, distanceLabel: DISTANCE_LABEL[distance], promptCount, priority, quickWin, refresh, brief,
    });
  }

  // scope rollup
  const sum = (arr: ContentTopic[]) => arr.reduce((s, t) => s + t.totalVol, 0);
  const existing = topics.filter((t) => t.state === 'existing');
  const build = topics.filter((t) => t.state !== 'existing');
  const qw = topics.filter((t) => t.quickWin);
  const p0 = topics.filter((t) => t.priority === 'P0');
  const p1 = topics.filter((t) => t.priority === 'P1');
  const p2 = topics.filter((t) => t.priority === 'P2');

  return {
    topics,
    scope: {
      total: topics.length, totalVol: sum(topics),
      existing: existing.length, existingVol: sum(existing),
      build: build.length, buildVol: sum(build),
      quickWins: qw.length, quickWinVol: sum(qw),
      p0: p0.length, p0Vol: sum(p0),
      p1: p1.length, p1Vol: sum(p1),
      p2: p2.length, p2Vol: sum(p2),
    },
  };
}

export const PRIORITY_LABEL: Record<Priority, string> = { P0: 'Do first', P1: 'Next', P2: 'Later' };
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

export function buildContentPlanFromTopics(topics: CanonicalTopicInput[]): ContentPlan {
  const vols = topics.map(t => t.totalVolume).slice().sort((a, b) => a - b);
  const median = vols.length ? vols[Math.floor(vols.length / 2)] : 0;

  const out: ContentTopic[] = [];
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    const lane: GraphNode['lane'] = t.parentType === 'problem' ? 'pre-product' : 'product';
    const kind: GraphNode['kind'] = t.parentType === 'problem' ? 'problem' : 'core';

    const footprint = t.keywords.filter(k => k.origin !== 'demand');
    const clientRanked = footprint.filter(k => !k.isGap && k.position !== null);
    const gaps = t.keywords.filter(k => k.isGap);
    const clientVol = clientRanked.reduce((s, k) => s + k.searchVolume, 0);
    const compVol = gaps.reduce((s, k) => s + k.searchVolume, 0);
    const hasClient = clientRanked.length > 0 || !!t.pageUrl;
    const state: NodeState = hasClient ? 'existing' : (compVol > 0 ? 'competitor' : 'missing');
    const action: 'optimize' | 'build' = state === 'existing' ? 'optimize' : 'build';
    const url = t.pageUrl ?? null;
    const clientCovPct = t.totalVolume > 0 ? Math.round((clientVol / t.totalVolume) * 100) : 0;
    const competitor = gaps.find(k => k.competitor)?.competitor ?? null;

    const distance = lane === 'product' ? 2 : (t.stage === 'awareness' ? 4 : 3);
    const highDemand = t.totalVolume >= median && t.totalVolume > 0;
    const quickWin = state === 'competitor' && distance <= 2 && highDemand;
    let priority: Priority;
    if (distance <= 2 && (highDemand || quickWin)) priority = 'P0';
    else if (distance <= 2 || (distance === 3 && highDemand)) priority = 'P1';
    else priority = 'P2';
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
      distance, distanceLabel: DISTANCE_LABEL[distance], promptCount: 0, priority, quickWin, refresh,
      brief: {
        title: cap(t.product),
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

  const sum = (arr: ContentTopic[]) => arr.reduce((s, t) => s + t.totalVol, 0);
  const existing = out.filter(t => t.state === 'existing');
  const build = out.filter(t => t.state !== 'existing');
  const qw = out.filter(t => t.quickWin);
  const p0 = out.filter(t => t.priority === 'P0');
  const p1 = out.filter(t => t.priority === 'P1');
  const p2 = out.filter(t => t.priority === 'P2');
  return {
    topics: out,
    scope: {
      total: out.length, totalVol: sum(out),
      existing: existing.length, existingVol: sum(existing),
      build: build.length, buildVol: sum(build),
      quickWins: qw.length, quickWinVol: sum(qw),
      p0: p0.length, p0Vol: sum(p0),
      p1: p1.length, p1Vol: sum(p1),
      p2: p2.length, p2Vol: sum(p2),
    },
  };
}

// ─── Single wiring point: analysis snapshot → content plan ──────────────────────
// Both the Content panel and the Content Plan sub-nav call this so they share the
// EXACT same topic→keyword pool, footprint overlay, and competitor mapping — which
// is what makes the volumes reconcile with the Keyword and Cluster panels.
export function planFromSnapshot(analysis: any, uploadedKeywords: any[] = []): ContentPlan | null {
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
    else if (k.source !== 'blocked') client.add(kw);
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

  const graph = buildJourneyGraph(universe, { clientRanked: client, competitorRanked: competitor, urlByKeyword, competitorByKeyword });
  return buildContentPlan(graph, { audiencePrompts });
}
