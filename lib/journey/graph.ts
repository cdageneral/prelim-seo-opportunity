/**
 * Connected-journey graph builder (v7.175)
 *
 * Turns the Semrush DEMAND UNIVERSE into ONE connected journey graph instead of
 * two disconnected funnel lanes:
 *
 *   • Pre-product PROBLEM topics (life-event / problem-aware searches) — one node
 *     per problem theme, placed at its dominant funnel stage.
 *   • Product topics split into a CORE node (the named solution) plus SUPPORTING
 *     nodes (cost, recovery, safety, results, comparison) — the content a buyer
 *     researches before deciding.
 *   • Three behaviourally-meaningful, DATA-DERIVED edge kinds:
 *       - 'co'      problem↔problem  — Semrush surfaced both from the same seed
 *                                       (a topic literally carries both seeds) →
 *                                       real co-search adjacency, never invented.
 *       - 'bridge'  problem→core      — the problem and the product were co-surfaced
 *                                       (shared seed) OR share concern vocabulary →
 *                                       the moment a searcher discovers the solution.
 *       - 'support' core→supporting   — the decision-stage topics around a product.
 *   • Every node carries a CONTENT mapping: an existing ranking page (with URL) to
 *     optimise, or a net-new page to build. This is the same signal the Content
 *     panel consumes, so the journey and the content plan are one source of truth.
 *
 * Pure + framework-free so both JourneySection and ContentMapSection import it
 * (kills the historical duplicate-buildClusters drift) and so it unit-tests in
 * isolation. ES5-safe: no for…of over Set/Map (Array.from everywhere), no nested
 * function declarations in blocks.
 *
 * DEFENSIBILITY: topics + volumes come straight from Semrush. Edges trace to a
 * shared seed (data) or shared concern token (vocabulary overlap) — never to a
 * model's guess. Node labels may be AI-phrased (passed in via `themeLabels`) but
 * no number is ever invented here.
 */

export type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';
export type JourneyLane  = 'pre-product' | 'product';
export type NodeState    = 'existing' | 'missing' | 'competitor';
export type NodeKind     = 'problem' | 'core' | 'support';
export type EdgeKind     = 'co' | 'bridge' | 'support';
export type SupportType  = 'core' | 'cost' | 'recovery' | 'safety' | 'results' | 'comparison';

export interface DemandTopic {
  keyword:      string;
  searchVolume: number;
  seeds:        string[];
  reports?:     string[];
  laneHint?:    'product' | 'problem';
}
export interface DemandUniverse {
  topics:        DemandTopic[];
  productSeeds?: string[];
  problemSeeds?: string[];
  builtAt?:      string;
  topicCount?:   number;
  seedCount?:    number;
  database?:     string;
  status?:       string;
}

export interface GraphNode {
  id:          string;
  name:        string;          // theme label (AI-phrased when available)
  lane:        JourneyLane;
  kind:        NodeKind;
  supportType: SupportType;     // 'core' for problem + core nodes
  stage:       JourneyStage;
  col:         number;          // funnel column index (0..2 awareness→decision)
  seed:        string;          // theme seed (lowercased) — the join key for edges
  state:       NodeState;
  action:      'optimize' | 'build';   // content action
  url:         string | null;           // existing ranking page if one is known
  totalVol:    number;
  clientVol:   number;
  compVol:     number;
  kwCount:     number;
  sampleKws:   string[];
  keywords:    TopicKeyword[];          // v7.176: full member keyword list (for the keyword/content panels)
  competitor:  string | null;           // v7.176: competitor domain that ranks for this topic (gap rows)
  clientCovPct: number;                 // v7.176: % of topic demand the client already ranks for
}

export interface TopicKeyword {
  keyword:      string;
  searchVolume: number;
  state:        NodeState;              // existing (client ranks) | competitor | missing
  rank:         number | null;          // v7.188: client SERP position (1-100) when ranked, else null
}

export interface GraphEdge {
  from: string;
  to:   string;
  kind: EdgeKind;
  why:  string;
}

export interface JourneyGraph {
  nodes:     GraphNode[];
  edges:     GraphEdge[];
  // content-plan rollup (each node = one content topic mapped to a page or a build)
  plan: {
    total:    number;
    optimize: number;   // existing pages to keep/optimise
    build:    number;   // net-new pages to build
    preBuild: number;
    prodBuild: number;
  };
}

// ─── Intent → stage (shared with the panels' detectIntent) ──────────────────────
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

export function stageOf(keyword: string): JourneyStage {
  const kw = keyword.toLowerCase();
  for (let i = 0; i < TRANSACTIONAL_SIGNALS.length; i++) if (kw.indexOf(TRANSACTIONAL_SIGNALS[i]) >= 0) return 'decision';
  for (let i = 0; i < COMMERCIAL_SIGNALS.length;    i++) if (kw.indexOf(COMMERCIAL_SIGNALS[i])    >= 0) return 'consideration';
  for (let i = 0; i < INFORMATIONAL_SIGNALS.length; i++) if (kw.indexOf(INFORMATIONAL_SIGNALS[i]) >= 0) return 'awareness';
  return 'awareness';
}

const STAGE_COL: Record<JourneyStage, number> = { awareness: 0, consideration: 1, decision: 2, retention: 2 };

// ─── Supporting-topic classification ────────────────────────────────────────────
// What KIND of decision-support content a product keyword represents. A keyword
// with no support signal is part of the product's CORE topic.
const SUPPORT_SIGNALS: Array<[SupportType, string[]]> = [
  ['comparison', [' vs ','versus','compare','comparison','alternative','difference between',' or ']],
  ['cost',       ['cost','price','pricing','how much','financing','afford','payment','cheap','expensive','insurance']],
  ['safety',     ['safe','safety','risk','danger','side effect','side effects','candidate','am i a candidate','complications']],
  ['results',    ['before and after','before after','results','reviews','review','worth it','testimonial','photos','rating']],
  ['recovery',   ['recovery','downtime','heal','healing','aftercare','what to expect','recover','scars','pain after']],
];

export function classifySupport(keyword: string): SupportType {
  const kw = keyword.toLowerCase();
  for (let i = 0; i < SUPPORT_SIGNALS.length; i++) {
    const sigs = SUPPORT_SIGNALS[i][1];
    for (let j = 0; j < sigs.length; j++) if (kw.indexOf(sigs[j]) >= 0) return SUPPORT_SIGNALS[i][0];
  }
  return 'core';
}

export const SUPPORT_LABEL: Record<SupportType, string> = {
  core: 'Core', cost: 'Cost & financing', recovery: 'Recovery', safety: 'Safety & candidacy',
  results: 'Results & reviews', comparison: 'Comparisons',
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// Distinctive concern tokens of a seed (≥4 chars, minus generic noise) — used for
// the vocabulary-overlap fallback when a problem and a product weren't co-surfaced.
const TOKEN_NOISE = new Set<string>([
  'with','from','that','this','your','near','best','what','when','will','have','they',
  'about','after','before','cost','price','near','help','need','want','does','surgery',
  'procedure','treatment','treatments','removal','surgeon','clinic','center','centre',
]);
function tokensOf(s: string): string[] {
  const out: string[] = [];
  const parts = s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (w.length >= 4 && !TOKEN_NOISE.has(w)) out.push(w);
  }
  return out;
}

export interface BuildOpts {
  clientRanked?:        Set<string>;
  competitorRanked?:    Set<string>;
  urlByKeyword?:        Record<string, string>;
  rankByKeyword?:       Record<string, number>;    // v7.188: kw(lower) → client SERP position
  competitorByKeyword?: Record<string, string>;   // v7.176: kw(lower) → competitor domain (from gap rows)
  activeBucketId?:      string | null;   // segment partition filter (null = combined)
  seedBucket?:          Map<string, string>;
  themeLabels?:         Record<string, string>;   // seed(lowercased) → AI-phrased label
}

const SHARED_BUCKET = 'shared';

/**
 * Build the connected journey graph from the demand universe.
 */
export function buildJourneyGraph(universe: DemandUniverse, opts: BuildOpts = {}): JourneyGraph {
  const clientRanked     = opts.clientRanked     ?? new Set<string>();
  const competitorRanked = opts.competitorRanked ?? new Set<string>();
  const urlByKeyword       = opts.urlByKeyword       ?? {};
  const rankByKeyword      = opts.rankByKeyword      ?? {};
  const competitorByKeyword = opts.competitorByKeyword ?? {};
  const activeBucketId     = opts.activeBucketId     ?? null;
  const seedBucket         = opts.seedBucket         ?? new Map<string, string>();
  const themeLabels        = opts.themeLabels        ?? {};

  const productSet = new Set((universe.productSeeds ?? []).map((s: string) => s.toLowerCase()));

  // ── 1. Bucket every topic into a (lane, theme, supportType) group ─────────────
  interface Grp { lane: JourneyLane; seed: string; supportType: SupportType; topics: DemandTopic[]; }
  const groups = new Map<string, Grp>();
  // Track which seeds co-occur on a single topic (for co / bridge edges) and the
  // segment-partition theme of each topic.
  const topics = universe.topics ?? [];

  for (let ti = 0; ti < topics.length; ti++) {
    const t = topics[ti];
    const seedsLc = (t.seeds ?? []).map((s: string) => s.toLowerCase());
    const isProduct = t.laneHint === 'product' || seedsLc.some((s: string) => productSet.has(s));
    const lane: JourneyLane = isProduct ? 'product' : 'pre-product';

    // Theme seed: prefer a seed on the topic's own lane.
    let themeSeed = '';
    for (let i = 0; i < seedsLc.length; i++) {
      const onProductSide = productSet.has(seedsLc[i]);
      if (onProductSide === isProduct) { themeSeed = seedsLc[i]; break; }
    }
    if (!themeSeed) themeSeed = seedsLc[0] ?? 'other';

    // Segment partition: skip topics outside the active bucket.
    if (activeBucketId) {
      const b = seedBucket.get(themeSeed) ?? SHARED_BUCKET;
      if (b !== activeBucketId) continue;
    }

    const supportType: SupportType = isProduct ? classifySupport(t.keyword) : 'core';
    const key = lane + '::' + themeSeed + '::' + supportType;
    let g = groups.get(key);
    if (!g) { g = { lane, seed: themeSeed, supportType, topics: [] }; groups.set(key, g); }
    g.topics.push(t);
  }

  // ── 2. Materialise nodes ──────────────────────────────────────────────────────
  const nodes: GraphNode[] = [];
  const grpArr = Array.from(groups.values());
  for (let gi = 0; gi < grpArr.length; gi++) {
    const g = grpArr[gi];
    let totalVol = 0, clientVol = 0, compVol = 0;
    let url: string | null = null;
    const memberKws: TopicKeyword[] = [];
    const compTally = new Map<string, number>();   // competitor domain → vol (pick the top)
    // dominant stage by volume
    const stageVol: Record<JourneyStage, number> = { awareness: 0, consideration: 0, decision: 0, retention: 0 };
    const sorted = g.topics.slice().sort((a, b) => b.searchVolume - a.searchVolume);
    for (let i = 0; i < g.topics.length; i++) {
      const t = g.topics[i];
      const kwLc = t.keyword.toLowerCase();
      totalVol += t.searchVolume;
      const isClient = clientRanked.has(kwLc);
      const isComp = !isClient && competitorRanked.has(kwLc);
      if (isClient) clientVol += t.searchVolume;
      else if (isComp) compVol += t.searchVolume;
      if (!url && urlByKeyword[kwLc]) url = urlByKeyword[kwLc];
      const comp = competitorByKeyword[kwLc];
      if (!isClient && comp) compTally.set(comp, (compTally.get(comp) ?? 0) + t.searchVolume);
      memberKws.push({ keyword: t.keyword, searchVolume: t.searchVolume, state: isClient ? 'existing' : (isComp || comp ? 'competitor' : 'missing'), rank: (isClient && rankByKeyword[kwLc] != null) ? rankByKeyword[kwLc] : null });
      const st = g.supportType === 'core' ? stageOf(t.keyword) : (g.supportType === 'comparison' ? 'consideration' : 'decision');
      stageVol[st] += t.searchVolume;
    }
    memberKws.sort((a, b) => b.searchVolume - a.searchVolume);
    let stage: JourneyStage = 'awareness'; let bv = -1;
    (['awareness','consideration','decision','retention'] as JourneyStage[]).forEach((s) => { if (stageVol[s] > bv) { bv = stageVol[s]; stage = s; } });
    // Supporting nodes always sit at decision (comparison at consideration).
    if (g.supportType !== 'core') stage = g.supportType === 'comparison' ? 'consideration' : 'decision';
    // Problem nodes never sit at decision — they are pre-purchase by definition.
    if (g.lane === 'pre-product' && stage === 'decision') stage = 'consideration';

    const state: NodeState = clientVol > 0 ? 'existing' : (compVol > 0 || compTally.size > 0 ? 'competitor' : 'missing');
    const kind: NodeKind = g.lane === 'pre-product' ? 'problem' : (g.supportType === 'core' ? 'core' : 'support');
    const label = themeLabels[g.seed] ?? titleCase(g.seed);
    const name = kind === 'support' ? (titleCase(g.seed) + ' — ' + SUPPORT_LABEL[g.supportType]) : label;
    // top competitor for the topic (only surfaced when the client doesn't rank it)
    let competitor: string | null = null;
    if (state !== 'existing') {
      let bestC = ''; let bestV = 0;
      const ents = Array.from(compTally.entries());
      for (let i = 0; i < ents.length; i++) if (ents[i][1] > bestV) { bestV = ents[i][1]; bestC = ents[i][0]; }
      competitor = bestC || null;
    }
    const clientCovPct = totalVol > 0 ? Math.round((clientVol / totalVol) * 100) : 0;

    nodes.push({
      id: g.lane + '::' + g.seed + '::' + g.supportType,
      name, lane: g.lane, kind, supportType: g.supportType,
      stage, col: STAGE_COL[stage], seed: g.seed, state,
      action: state === 'existing' ? 'optimize' : 'build',
      url,
      totalVol, clientVol, compVol,
      kwCount: g.topics.length,
      sampleKws: sorted.slice(0, 8).map((t) => t.keyword),
      keywords: memberKws,
      competitor,
      clientCovPct,
    });
  }

  // ── 3. Edges ──────────────────────────────────────────────────────────────────
  const edges: GraphEdge[] = [];
  const problemSeeds = new Set<string>();
  const coreBySeed = new Map<string, GraphNode>();
  const supportBySeed = new Map<string, GraphNode[]>();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.kind === 'problem') problemSeeds.add(n.seed);
    else if (n.kind === 'core') coreBySeed.set(n.seed, n);
    else { if (!supportBySeed.has(n.seed)) supportBySeed.set(n.seed, []); supportBySeed.get(n.seed)!.push(n); }
  }
  const problemNodeBySeed = new Map<string, GraphNode>();
  for (let i = 0; i < nodes.length; i++) if (nodes[i].kind === 'problem') problemNodeBySeed.set(nodes[i].seed, nodes[i]);

  // Co-occurrence: any topic carrying ≥2 problem seeds links those problem themes.
  // Bridge: any topic carrying a problem seed AND a product seed links them.
  const coSeen = new Set<string>();
  const bridgeSeen = new Set<string>();
  for (let ti = 0; ti < topics.length; ti++) {
    const seedsLc = (topics[ti].seeds ?? []).map((s: string) => s.toLowerCase());
    const probs: string[] = [];
    const prods: string[] = [];
    for (let i = 0; i < seedsLc.length; i++) {
      if (problemSeeds.has(seedsLc[i])) probs.push(seedsLc[i]);
      if (coreBySeed.has(seedsLc[i]))  prods.push(seedsLc[i]);
    }
    // problem↔problem co-search
    for (let a = 0; a < probs.length; a++) for (let b = a + 1; b < probs.length; b++) {
      const key = [probs[a], probs[b]].sort().join('|');
      if (coSeen.has(key)) continue; coSeen.add(key);
      const na = problemNodeBySeed.get(probs[a]); const nb = problemNodeBySeed.get(probs[b]);
      if (na && nb && na.id !== nb.id) edges.push({ from: na.id, to: nb.id, kind: 'co', why: 'co-searched' });
    }
    // problem→product bridge (co-surfaced)
    for (let a = 0; a < probs.length; a++) for (let b = 0; b < prods.length; b++) {
      const key = probs[a] + '>' + prods[b];
      if (bridgeSeen.has(key)) continue; bridgeSeen.add(key);
      const pn = problemNodeBySeed.get(probs[a]); const cn = coreBySeed.get(prods[b]);
      if (pn && cn) edges.push({ from: pn.id, to: cn.id, kind: 'bridge', why: 'discovers solution' });
    }
  }

  // Bridge fallback by concern-vocabulary overlap (only for problems that gained no
  // data-derived bridge — keeps an orphan problem connected to the nearest solution).
  const bridgedProblems = new Set<string>();
  for (let i = 0; i < edges.length; i++) if (edges[i].kind === 'bridge') bridgedProblems.add(edges[i].from);
  const coreArr = Array.from(coreBySeed.values());
  const probArr = Array.from(problemNodeBySeed.values());
  for (let p = 0; p < probArr.length; p++) {
    const pn = probArr[p];
    if (bridgedProblems.has(pn.id)) continue;
    const ptoks = new Set(tokensOf(pn.seed).concat(tokensOf(pn.name)));
    let best: GraphNode | null = null; let bestScore = 0;
    for (let c = 0; c < coreArr.length; c++) {
      const ctoks = tokensOf(coreArr[c].seed).concat(tokensOf(coreArr[c].name));
      let score = 0;
      for (let k = 0; k < ctoks.length; k++) if (ptoks.has(ctoks[k])) score++;
      if (score > bestScore) { bestScore = score; best = coreArr[c]; }
    }
    if (best && bestScore > 0) edges.push({ from: pn.id, to: best.id, kind: 'bridge', why: 'discovers solution' });
  }

  // Support: each core → its supporting topics (and comparison cores cross-link).
  const supSeeds = Array.from(supportBySeed.keys());
  for (let i = 0; i < supSeeds.length; i++) {
    const core = coreBySeed.get(supSeeds[i]);
    const sups = supportBySeed.get(supSeeds[i]) ?? [];
    if (!core) continue;
    for (let j = 0; j < sups.length; j++) edges.push({ from: core.id, to: sups[j].id, kind: 'support', why: 'needs to decide' });
  }

  // ── 4. Content-plan rollup ──────────────────────────────────────────────────
  let optimize = 0, build = 0, preBuild = 0, prodBuild = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].action === 'optimize') optimize++;
    else { build++; if (nodes[i].lane === 'pre-product') preBuild++; else prodBuild++; }
  }

  return {
    nodes, edges,
    plan: { total: nodes.length, optimize, build, preBuild, prodBuild },
  };
}
