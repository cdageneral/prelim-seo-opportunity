// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/gates.ts — v7.447 · v7.526 Scout gates
//
// The FAIL-CLOSED registry of evidence gates behind "Hours Saved".
//
// Wayne supplied a scope of 24 delivery activities and the hours each takes a
// team to do by hand. Crediting all of them to every project would be a modeled
// number wearing a measured number's clothes (Const I.1): the app can see
// perfectly well that a project never had a backlink scan, and claiming
// "Backlink profile — 4 hrs" on it is a claim a client can disprove in one
// question. So each activity is credited only where this project actually
// carries the deliverable, and every gate below names the exact stored field it
// reads, so any figure on screen traces back to a row in the database.
//
// Rules this file exists to enforce:
//
//   1. Gates read SERVER-side stored data only. localStorage-backed signals were
//      deliberately rejected — a figure that changes when you open the dashboard
//      on a different laptop is not evidence. (Journey edge labels, curated
//      local service seeds and the locations-page URL are all browser-only,
//      which is why none of them appear here.)
//   2. FAIL CLOSED. An activity whose `gateKey` is not in this registry is never
//      credited and is reported as unregistered — the same discipline as the API
//      rate registry (v7.396). Silence must cost hours, not award them.
//   3. A gate answers exactly one question: "is the deliverable's own data
//      present?" It never estimates how much, and it never part-credits.
//
// Gates take a flat EVIDENCE RECORD of measured counts, never the snapshots
// themselves. That is deliberate: the counts are extracted in SQL (see
// lib/hours/evidence.ts), so answering for every project costs one small query
// instead of loading every keyword snapshot into one response — the failure
// v7.445 is the record of.
//
// Two gates are documented PROXIES, flagged as such on screen, because the app
// stores no artifact for the deliverable itself:
//   • lob_taxonomy — the LOB SEO Strategy Plan is built ON the multi-level
//     product-line taxonomy; the taxonomy is the evidence the work happened.
//   • roadmap      — the GEO Roadmap is the scoped workstream selection placed
//     into Y1/Y2/Y3; the selection is stored, the year placement is derived.
// Both are editable in Admin, so the judgement is visible, not buried in code.
//
// v7.526 — SCOUT GATES. A Scout run is not a project: its evidence is the run's
// own stored result (scout_runs.result, measured in SQL by
// lib/hours/scoutEvidence.ts), so its gates read a ScoutGateContext and carry
// `product: 'scout'`. A gate is evaluated ONLY against the product it was
// written for: a Scout gate on an Orbit activity (or the reverse) is a
// mis-application and fails closed, reported as `misapplied` so Admin can show
// it in red rather than silently withholding hours.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Measured evidence for ONE project. Every field is a real count or flag read
 * out of stored data — never an estimate, never a default that flatters.
 */
export interface GateContext {
  topKeywords:            number;  // semrushSnapshot.topKeywords length
  clientUploadRows:       number;  // project_keywords, non-blocked, client rows
  categories:             number;  // _categoryBreakdown.categories length
  keywordPaths:           number;  // _categoryBreakdown.keywordPaths key count
  categoriesWithParent:   number;  // categories carrying a parent (product-line structure)
  scopeSelections:        number;  // projects.scope_selections length
  scopeWorkstreamItems:   number;  // total ids across projects.scope_workstreams
  audienceSegments:       number;  // _audienceSegments length
  segmentsWithPrompts:    number;  // segments carrying preLLMPrompts or productPrompts
  probePrompts:           number;  // profoundSnapshot.results[] carrying a prompt
  productInsightQuestions:number;  // projects.product_insights rows carrying a question
  llmProbeScored:         boolean; // profoundSnapshot is llm_probe_v2 with an overallScore
  profoundDataKeys:       number;  // projects.profound_data key count
  aioCitationRows:        number;  // scanned SERP rows with hasAIO and aioSources
  profoundCiteTotal:      number;  // projects.profound_data.citeTotal
  contentPlanSelections:  number;  // projects.content_plan_selections length
  pageMapPages:           number;  // _pageMap.pages length
  positionDistTotal:      number;  // sum of semrushSnapshot.positionDist buckets
  demandTopics:           number;  // _demandUniverse.topics length
  serpScannedKeywords:    number;  // serpApiSnapshot.keywords length
  authorityWithOverview:  number;  // authority_snapshot.domains carrying an overview
  authorityWithAnchors:   number;  // authority_snapshot.domains carrying anchors
  assessmentReports:      number;  // reports rows, type PDF, file_url present
  hasNarrative:           boolean; // _narrative.strategicCall present
  marketCaptureRate:      number | null;
  opportunityRows:        number;  // opportunities rows for this project's analysis
  localKeywords:          number;  // _localScan.keywords length
  localClientLocations:   number;  // _localScan.locations where isClient
  localReviewsFetched:    number;  // _localScan locations carrying reviewsFetchedAt
  localRivalPackMembers:  number;  // _localScan pack members that are not the client
}

/**
 * v7.526 — measured evidence for ONE Scout run. Every field is a real count or
 * flag read out of scout_runs (status) and scout_runs.result (counts measured in
 * SQL, jsonb never crossing the wire) — never an estimate.
 */
export interface ScoutGateContext {
  status:          string;   // scout_runs.status — 'ready' | 'no_opening' | 'thin' | 'failed' (drafts/queued/running/deleted are never loaded)
  sitesProfiled:   number;   // result.facts[] with found = true (prospect + competitors Semrush could see)
  authorityRead:   number;   // result.facts[] carrying a numeric authorityScore (backlinks_overview)
  universe:        number;   // result.counts.universe — non-branded searches that cleared the floor
  themes:          number;   // result.themes[] length
  fieldRows:       number;   // result.field[] length — page-one share per domain was computed
  aiReads:         number;   // result.ai.reads[] length — themes with recorded AI answers read
  aiQuadrants:     number;   // result.ai.quadrants[] length — search-vs-AI quadrant per theme
  hasOpening:      boolean;  // result.opening is an object (status 'ready')
  leaderPages:     number;   // result.detail.leaderPages[] length
  pagesByDomain:   number;   // result.detail.pagesByDomain[] length
  questions:       number;   // result.detail.questions[] length (Semrush phrase_questions)
}

export type GateProduct = 'orbit' | 'scout';

interface GateBase {
  key:   string;
  label: string;
  /** Exactly what is read, in plain words — rendered in Admin and in the drill-down. */
  reads: string;
  /** proxy = the app stores no artifact for this deliverable; this is the nearest real evidence. */
  proxy?: boolean;
}
export interface OrbitGate extends GateBase { product: 'orbit'; test: (c: GateContext) => boolean }
export interface ScoutGate extends GateBase { product: 'scout'; test: (c: ScoutGateContext) => boolean }
export type Gate = OrbitGate | ScoutGate;

/** v7.526 — a Scout run has a printable report exactly when its status is one of these (app/api/scout/runs/[id]/pdf). */
const SCOUT_PRINTABLE = new Set(['ready', 'no_opening']);
/** A run that finished on its own terms — set up, executed, and stored — as opposed to one that failed. */
const SCOUT_FINISHED  = new Set(['ready', 'no_opening', 'thin']);

const ORBIT_GATES: OrbitGate[] = ([
  { key: 'always', label: 'Always credited',
    reads: 'No condition — credited for every project that exists.',
    test: () => true },

  { key: 'organic_footprint', label: 'Organic footprint present',
    reads: 'semrushSnapshot.topKeywords is non-empty, or the project has uploaded client keyword rows.',
    test: c => c.topKeywords > 0 || c.clientUploadRows > 0 },

  { key: 'taxonomy', label: 'Keyword taxonomy built',
    reads: 'semrushSnapshot._categoryBreakdown.categories is non-empty.',
    test: c => c.categories > 0 },

  { key: 'lob_taxonomy', label: 'Multi-level product-line taxonomy (proxy)', proxy: true,
    reads: 'PROXY — the app stores no LOB strategy document. Reads _categoryBreakdown.keywordPaths, or categories carrying a parent: a real product-line structure exists for the plan to be built on.',
    test: c => c.keywordPaths > 0 || c.categoriesWithParent > 0 },

  { key: 'roadmap', label: 'Scoped roadmap selections (proxy)', proxy: true,
    reads: 'PROXY — year placement is derived at render, never stored. Reads projects.scope_selections (or scope_workstreams) being non-empty: a roadmap has actually been scoped.',
    test: c => c.scopeSelections > 0 || c.scopeWorkstreamItems > 0 },

  { key: 'prompt_set', label: 'Prompt set / fan-out present',
    reads: 'A real prompt set exists: audience segments carrying preLLMPrompts or productPrompts, or LLM-probe result prompts, or recorded AI questions in projects.product_insights.',
    test: c => c.segmentsWithPrompts > 0 || c.probePrompts > 0 || c.productInsightQuestions > 0 },

  { key: 'llm_baseline', label: 'LLM visibility measured',
    reads: 'profoundSnapshot from the v2 LLM probe carrying an overallScore, or an uploaded Profound dataset on projects.profound_data.',
    test: c => c.llmProbeScored || c.profoundDataKeys > 0 },

  { key: 'citations', label: 'Citation data present',
    reads: 'AI-Overview citation sources on scanned SERP rows, or an answer-engine citation total on projects.profound_data.',
    test: c => c.aioCitationRows > 0 || c.profoundCiteTotal > 0 },

  { key: 'audience_segments', label: 'Audience segments built',
    reads: 'semrushSnapshot._audienceSegments is non-empty.',
    test: c => c.audienceSegments > 0 },

  { key: 'content_plan', label: 'Content plan selected',
    reads: 'projects.content_plan_selections is non-empty.',
    test: c => c.contentPlanSelections > 0 },

  { key: 'page_map', label: 'Page map / content gap built',
    reads: 'semrushSnapshot._pageMap carries pages.',
    test: c => c.pageMapPages > 0 },

  { key: 'rank_distribution', label: 'Rank distribution present',
    reads: 'semrushSnapshot.positionDist has at least one populated band (the SoV and rank-band basis).',
    test: c => c.positionDistTotal > 0 },

  { key: 'demand_universe', label: 'Journey demand universe built',
    reads: 'semrushSnapshot._demandUniverse carries topics.',
    test: c => c.demandTopics > 0 },

  { key: 'serp_features', label: 'SERP features scanned',
    reads: 'serpApiSnapshot.keywords is non-empty — a real SERP scan ran.',
    test: c => c.serpScannedKeywords > 0 },

  { key: 'backlinks', label: 'Backlink profile scanned',
    reads: 'projects.authority_snapshot carries a domain with a backlink overview.',
    test: c => c.authorityWithOverview > 0 },

  { key: 'anchors', label: 'Anchor text captured',
    reads: 'projects.authority_snapshot carries a domain with a non-empty anchors list.',
    test: c => c.authorityWithAnchors > 0 },

  { key: 'assessment_report', label: 'Assessment report generated',
    reads: 'A reports row of type PDF carrying a file_url exists for this project.',
    test: c => c.assessmentReports > 0 },

  { key: 'exec_narrative', label: 'Executive summary written',
    reads: 'semrushSnapshot._narrative carries the strategic call, or the analysis has a market capture rate.',
    test: c => c.hasNarrative || c.marketCaptureRate != null },

  { key: 'opportunities', label: 'Opportunity insights written',
    reads: 'opportunities rows exist for this project, written by synthesis.',
    test: c => c.opportunityRows > 0 },

  // ── Local ───────────────────────────────────────────────────────────────────
  { key: 'local_pack', label: 'Local pack ranks scanned',
    reads: 'semrushSnapshot._localScan.keywords is non-empty.',
    test: c => c.localKeywords > 0 },

  { key: 'local_locations', label: 'Client locations discovered',
    reads: 'semrushSnapshot._localScan.locations contains at least one client location.',
    test: c => c.localClientLocations > 0 },

  { key: 'local_reviews', label: 'Review ratings fetched',
    reads: 'a _localScan location carries reviewsFetchedAt. An absent timestamp means never looked up, which is not the same as no reviews.',
    test: c => c.localReviewsFetched > 0 },

  { key: 'local_opportunities', label: 'Per-location opportunities computable',
    reads: '_localScan carries BOTH scanned keywords and client locations — both are required to build per-location opportunities.',
    test: c => c.localKeywords > 0 && c.localClientLocations > 0 },

  { key: 'local_competition', label: 'Local competitors captured',
    reads: 'a _localScan keyword carries a pack member that is not the client — a real local rival was seen.',
    test: c => c.localRivalPackMembers > 0 },
] as Array<Omit<OrbitGate, 'product'>>).map(g => ({ ...g, product: 'orbit' as const }));

// ── Scout (v7.526) ────────────────────────────────────────────────────────────
// Each gate answers one question about ONE run's stored result. The mapping
// from Orbit activity to Scout evidence follows the run pipeline
// (lib/scout/run.ts): step 1 profiles the sites, steps 2–3 pull the universe,
// step 4 groups themes, step 5 picks the opening and reads AI answers, step 6
// assembles the opening detail; the PDF is printable for 'ready' and
// 'no_opening'. A 'thin' run stops early and keeps only what it measured.
const SCOUT_GATES: ScoutGate[] = ([
  { key: 'scout_run_finished', label: 'Scout run finished',
    reads: "scout_runs.status is 'ready', 'no_opening' or 'thin' — the run was set up, executed and stored. A failed, draft, queued, running or deleted run is never credited.",
    test: c => SCOUT_FINISHED.has(c.status) },

  { key: 'scout_sites_profiled', label: 'Scout · sites profiled',
    reads: 'result.facts[] carries at least one domain Semrush could see (found = true): organic traffic and keyword counts were read for the field (step 1).',
    test: c => c.sitesProfiled > 0 },

  { key: 'scout_themes', label: 'Scout · themes built',
    reads: 'result.themes[] is non-empty — the non-branded universe was pulled and grouped into themes (steps 2–4).',
    test: c => c.themes > 0 },

  { key: 'scout_field_share', label: 'Scout · page-one share computed',
    reads: 'result.field[] is non-empty — page-one keywords and volume were measured for the prospect and every competitor.',
    test: c => c.fieldRows > 0 },

  { key: 'scout_authority', label: 'Scout · Authority Score read',
    reads: 'result.facts[] carries at least one numeric authorityScore from backlinks_overview. A null score (unread) never counts.',
    test: c => c.authorityRead > 0 },

  { key: 'scout_ai_reads', label: 'Scout · AI answers read',
    reads: 'result.ai.reads[] is non-empty — recorded AI answers were read for at least one theme (step 5). Absent when AI data is not configured or nothing matched.',
    test: c => c.aiReads > 0 },

  { key: 'scout_ai_quadrants', label: 'Scout · search-vs-AI quadrants',
    reads: 'result.ai.quadrants[] is non-empty — each AI-read theme was placed on the search × AI grid, the citation-gap basis.',
    test: c => c.aiQuadrants > 0 },

  { key: 'scout_opening', label: 'Scout · opening found',
    reads: "result.opening is stored — a theme cleared the picker's bar with a named constraint (status 'ready').",
    test: c => c.hasOpening },

  { key: 'scout_opening_detail', label: 'Scout · opening detail assembled',
    reads: "result.detail carries the leader's ranking pages or the pages-by-domain comparison for the opening theme (step 6) — the content-gap view.",
    test: c => c.leaderPages > 0 || c.pagesByDomain > 0 },

  { key: 'scout_report', label: 'Scout · report printable',
    reads: "scout_runs.status is 'ready' or 'no_opening' — the client PDF can be rendered from the stored result (a 'thin' run has no report).",
    test: c => SCOUT_PRINTABLE.has(c.status) },
] as Array<Omit<ScoutGate, 'product'>>).map(g => ({
  ...g, product: 'scout' as const,
  // EVERY Scout gate additionally requires the run to have finished on its own
  // terms. A failed run never writes a result, but a re-run that fails could
  // leave an earlier result beside status 'failed' — and a failed run is never
  // credited for anything, whatever the row still carries.
  test: (c: ScoutGateContext) => SCOUT_FINISHED.has(c.status) && g.test(c),
}));

export const GATES: Gate[] = [...ORBIT_GATES, ...SCOUT_GATES];

const BY_KEY = new Map(GATES.map(g => [g.key, g]));

export function getGate(key: string): Gate | undefined { return BY_KEY.get(key); }

export interface GateVerdict {
  credited: boolean;
  /** the key is in the registry */
  known: boolean;
  /** v7.526 — the key is registered but for the OTHER product: never credited, and reported */
  misapplied: boolean;
}

/**
 * Fail-closed evaluation: an unknown key is NEVER credited, and neither is a
 * gate applied to the wrong product's evidence. `product` names which evidence
 * `ctx` is — the caller knows, the gate checks.
 */
export function evaluateGate(key: string, ctx: GateContext, product?: 'orbit'): GateVerdict;
export function evaluateGate(key: string, ctx: ScoutGateContext, product: 'scout'): GateVerdict;
export function evaluateGate(key: string, ctx: GateContext | ScoutGateContext, product: GateProduct = 'orbit'): GateVerdict {
  const g = BY_KEY.get(key);
  if (!g) return { credited: false, known: false, misapplied: false };
  if (g.product !== product) return { credited: false, known: true, misapplied: true };
  try {
    const credited = g.product === 'scout' ? !!g.test(ctx as ScoutGateContext) : !!g.test(ctx as GateContext);
    return { credited, known: true, misapplied: false };
  } catch { return { credited: false, known: true, misapplied: false }; }
}

/** Admin picker list — key, label, what it reads, whether it is a proxy, and (v7.526) which product's evidence it reads. */
export function gateCatalog() {
  return GATES.map(g => ({ key: g.key, label: g.label, reads: g.reads, proxy: !!g.proxy, product: g.product }));
}
