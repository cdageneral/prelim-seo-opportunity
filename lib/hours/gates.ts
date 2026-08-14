// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/gates.ts — v7.447
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

export interface Gate {
  key:   string;
  label: string;
  /** Exactly what is read, in plain words — rendered in Admin and in the drill-down. */
  reads: string;
  test:  (c: GateContext) => boolean;
  /** proxy = the app stores no artifact for this deliverable; this is the nearest real evidence. */
  proxy?: boolean;
}

export const GATES: Gate[] = [
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
];

const BY_KEY = new Map(GATES.map(g => [g.key, g]));

export function getGate(key: string): Gate | undefined { return BY_KEY.get(key); }

/** Fail-closed evaluation: an unknown key is NEVER credited. */
export function evaluateGate(key: string, ctx: GateContext): { credited: boolean; known: boolean } {
  const g = BY_KEY.get(key);
  if (!g) return { credited: false, known: false };
  try { return { credited: !!g.test(ctx), known: true }; }
  catch { return { credited: false, known: true }; }
}

/** Admin picker list — key, label, what it reads, and whether it is a proxy. */
export function gateCatalog() {
  return GATES.map(g => ({ key: g.key, label: g.label, reads: g.reads, proxy: !!g.proxy }));
}
