var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// lib/claude/synthesize.ts
var import_sdk3 = __toESM(require("@anthropic-ai/sdk"));

// lib/usage/record.ts
var import_node_crypto = require("node:crypto");
var import_drizzle_orm2 = require("drizzle-orm");

// db/index.ts
var import_serverless = require("@neondatabase/serverless");
var import_neon_http = require("drizzle-orm/neon-http");

// db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  analyses: () => analyses,
  analysesRelations: () => analysesRelations,
  analysisStatusEnum: () => analysisStatusEnum,
  apiUsage: () => apiUsage,
  apiUsageRelations: () => apiUsageRelations,
  appUsers: () => appUsers,
  auditEvents: () => auditEvents,
  authSessions: () => authSessions,
  competitors: () => competitors,
  competitorsRelations: () => competitorsRelations,
  noticeDismissals: () => noticeDismissals,
  noticeSeverityEnum: () => noticeSeverityEnum,
  notices: () => notices,
  opportunities: () => opportunities,
  opportunitiesRelations: () => opportunitiesRelations,
  opportunityCategoryEnum: () => opportunityCategoryEnum,
  passwordResets: () => passwordResets,
  personas: () => personas,
  personasRelations: () => personasRelations,
  projectAccess: () => projectAccess,
  projectGroupAccess: () => projectGroupAccess,
  projectKeywords: () => projectKeywords,
  projectKeywordsRelations: () => projectKeywordsRelations,
  projectStatusEnum: () => projectStatusEnum,
  projects: () => projects,
  projectsRelations: () => projectsRelations,
  reportTypeEnum: () => reportTypeEnum,
  reports: () => reports,
  reportsRelations: () => reportsRelations,
  userGroupMembers: () => userGroupMembers,
  userGroups: () => userGroups,
  userRoleEnum: () => userRoleEnum,
  userStatusEnum: () => userStatusEnum
});
var import_pg_core = require("drizzle-orm/pg-core");
var import_drizzle_orm = require("drizzle-orm");
var projectStatusEnum = (0, import_pg_core.pgEnum)("project_status", ["active", "archived", "draft"]);
var analysisStatusEnum = (0, import_pg_core.pgEnum)("analysis_status", ["pending", "running", "completed", "failed"]);
var opportunityCategoryEnum = (0, import_pg_core.pgEnum)("opportunity_category", ["SEO", "GEO", "Content", "Technical", "Competitive"]);
var reportTypeEnum = (0, import_pg_core.pgEnum)("report_type", ["PDF", "PPT_PROMPT"]);
var projects = (0, import_pg_core.pgTable)("projects", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  clerkOrgId: (0, import_pg_core.text)("clerk_org_id").notNull().default("default"),
  clerkUserId: (0, import_pg_core.text)("clerk_user_id").notNull().default("default"),
  clientName: (0, import_pg_core.text)("client_name").notNull(),
  websiteUrl: (0, import_pg_core.text)("website_url").notNull(),
  industry: (0, import_pg_core.text)("industry"),
  notes: (0, import_pg_core.text)("notes"),
  status: projectStatusEnum("status").default("active").notNull(),
  dataSource: (0, import_pg_core.text)("data_source").default("auto").notNull(),
  // 'auto' | 'upload'
  kwVolThresholdClient: (0, import_pg_core.integer)("kw_vol_threshold_client").default(0).notNull(),
  kwVolThresholdCompetitor: (0, import_pg_core.integer)("kw_vol_threshold_competitor").default(0).notNull(),
  // v7.99: market the analysis targets. Semrush regional database code ('us',
  // 'ca', 'uk', 'au', …) — also drives SerpAPI gl/google_domain via MARKETS map
  // in lib/utils/markets.ts. NOTE: run `npm run db:push` once after deploying.
  semrushDatabase: (0, import_pg_core.text)("semrush_database").default("us").notNull(),
  // v7.206: client brand vocabulary — the terms that count as BRANDED for this
  // client (Constitution III.1). Seeded by AI on analysis (domain + the
  // navigational terms the client ranks for, e.g. TD → "td","toronto-dominion",
  // "easyweb","ameritrade") and editable in the Competitors/upload manager. The
  // domain root is always an implicit member; this list adds the variants a
  // domain string can't yield. NOTE: run `npm run db:push` once after deploying.
  brandTerms: (0, import_pg_core.jsonb)("brand_terms").$type(),
  brandTermsUpdatedAt: (0, import_pg_core.timestamp)("brand_terms_updated_at"),
  // v7.208: competitor/third-party brand BLOCKLIST (Art III.1). Any term here is
  // hard-excluded from keywords, clusters, journey and content plan everywhere —
  // whether the term came from Semrush or a CSV upload. Edited in the same
  // Competitors/upload manager. Auto-migrated at runtime (ADD COLUMN IF NOT EXISTS).
  excludedBrands: (0, import_pg_core.jsonb)("excluded_brands").$type(),
  excludedBrandsUpdatedAt: (0, import_pg_core.timestamp)("excluded_brands_updated_at"),
  // v7.260: Content Plan hand-picked topic selection — the editorial subset of the
  // canonical content topics the user pushed into the Content Plan panel, stored as an
  // array of ContentTopic.id (Const II.7: a view over one source of truth, not a copy).
  // Lives on the project so it survives reloads, devices, and re-analysis. Auto-migrated
  // at runtime via the ADD COLUMN IF NOT EXISTS pattern — no manual db:push.
  contentPlanSelections: (0, import_pg_core.jsonb)("content_plan_selections").$type(),
  contentPlanSelectionsUpdatedAt: (0, import_pg_core.timestamp)("content_plan_selections_updated_at"),
  // v7.419: the PREVIOUS content-plan selection, written by the PUT route before every
  // replace. The 2026-08-01 wipe incident (v7.362 orphan-heal PUT [] over real selections)
  // had no recovery path of any kind — the full-set-replace kept no history. One backup
  // generation is enough to undo the last write, whatever wrote it. Never read by any
  // panel as data; purely a recovery copy.
  contentPlanSelectionsPrev: (0, import_pg_core.jsonb)("content_plan_selections_prev").$type(),
  contentPlanSelectionsPrevAt: (0, import_pg_core.timestamp)("content_plan_selections_prev_at"),
  // v7.267: Scope "spec sheet" — the running cart of content topics the user pushed in via
  // "Add to Scope" on the Content Plan panel, stored as an array of ContentTopic.id
  // (Const II.7: a view over one source of truth, not a copy). The View Scope panel
  // re-derives each topic's full brief from the canonical pool and filters to these ids.
  // Lives on the project so it survives reloads, devices, and re-analysis. Auto-migrated
  // at runtime via the ADD COLUMN IF NOT EXISTS pattern — no manual db:push.
  scopeSelections: (0, import_pg_core.jsonb)("scope_selections").$type(),
  scopeSelectionsUpdatedAt: (0, import_pg_core.timestamp)("scope_selections_updated_at"),
  // v7.270: Scope aggregation shell — the other five workstreams (LLM prompts, themes,
  // authority, technical, citations) push their scoped item ids into one namespaced map,
  // each namespace an array of that workstream's own canonical ids (Const II.7: ids only,
  // re-derived from each source — never a copy). Content keeps its own column above + its
  // scope ⊆ plan two-way sync untouched; this is purely additive so existing behaviour is
  // unaffected. Empty until each source panel's "Add to Scope" ships. Auto-migrated at
  // runtime via ADD COLUMN IF NOT EXISTS — no manual db:push.
  scopeWorkstreams: (0, import_pg_core.jsonb)("scope_workstreams").$type(),
  scopeWorkstreamsUpdatedAt: (0, import_pg_core.timestamp)("scope_workstreams_updated_at"),
  // v7.326: competitor-gap SCOPE-gate overrides — umbrella name → 'core' | 'adjacent'
  // (promote an adjacent / competitor-only vertical into the gap landscape, or demote a
  // vertical the auto-rule mis-scored). Persisted per project so a promote/demote survives
  // reloads and takes effect WITHOUT re-analysis. Empty = pure auto classification. Auto-
  // migrated at runtime via ADD COLUMN IF NOT EXISTS — no manual db:push.
  scopeOverrides: (0, import_pg_core.jsonb)("scope_overrides").$type(),
  scopeOverridesUpdatedAt: (0, import_pg_core.timestamp)("scope_overrides_updated_at"),
  // v7.419: SOFT-HIDDEN Category Breakdown categories (Wayne, 2026-08-11 — "delete" a
  // category without losing any stored keyword→category association). Each entry records
  // the category's top-level name plus the kw count AT HIDE TIME (a real count, labeled
  // as of the hide — never recomputed as fact). Hiding is applied at READ time as a
  // filter in buildKwPool (the III.1d single-chokepoint pattern), so every panel and
  // every rollup drop the category at once while the stored taxonomy, keywordPaths and
  // membership stay byte-for-byte untouched — restoring an entry brings the category
  // back exactly as it was. Auto-migrated via ADD COLUMN IF NOT EXISTS.
  // `key` = the stored taxonomy path key (' › ' joined) for path-tree nodes, so a hide
  // matches by STORED path prefix even when the display row is a collapsed survivor whose
  // name differs from path[0]; absent for flat brand/location/Other categories (matched by
  // stored flat membership name).
  hiddenCategories: (0, import_pg_core.jsonb)("hidden_categories").$type(),
  hiddenCategoriesUpdatedAt: (0, import_pg_core.timestamp)("hidden_categories_updated_at"),
  // v7.358: per-project manual priority moves — ContentTopic.id → 'P0'|'P1'|'P2'|'P3'. The
  // user moves a topic to a different priority bucket on the Content Map; this override is
  // applied at READ time (injected onto the snapshot as `_priorityOverrides`, applied in
  // scoreTopic's consumers) so it takes effect WITHOUT re-analysis and reconciles across
  // every panel that reads priority (Const II.7). Empty = pure auto scoring. Survives
  // reloads, devices, and re-analysis. Auto-migrated via ADD COLUMN IF NOT EXISTS.
  priorityOverrides: (0, import_pg_core.jsonb)("priority_overrides").$type(),
  priorityOverridesUpdatedAt: (0, import_pg_core.timestamp)("priority_overrides_updated_at"),
  // v7.318: Profound AI Visibility computed metrics — SERVER-SIDE persistence so the
  // uploaded-export analysis survives refreshes, new browsers/devices, and is visible to ANY
  // user opening the project URL (replaces the old browser-only IndexedDB store). Holds ONLY
  // the compact computed Metrics object the panel renders — aggregated from the user's REAL
  // Profound CSV rows (Const I.1); never the raw rows, never a modeled value. Auto-migrated at
  // runtime via ADD COLUMN IF NOT EXISTS (and ensured in the projects-list route per the
  // v7.268 lesson — the list query selects every schema column). No manual db:push.
  profoundData: (0, import_pg_core.jsonb)("profound_data"),
  profoundDataUpdatedAt: (0, import_pg_core.timestamp)("profound_data_updated_at"),
  // v7.426: Product Insights — recorded AI answers pulled from DataForSEO LLM Mentions
  // (ChatGPT + Google AI Overviews), keyed by top-level product category. Server-side so
  // the scan survives refreshes/devices and is visible to any user opening the project
  // (same rationale as profound_data). Rows are verbatim trimmed API fields (Const I.1);
  // `aiSearchVolume` inside rows is DataForSEO's ESTIMATED metric and every consumer must
  // label it as such (I.5a). Auto-migrated via ADD COLUMN IF NOT EXISTS and ensured in the
  // projects-list + [id] routes (the v7.268/v7.327 column lesson).
  productInsights: (0, import_pg_core.jsonb)("product_insights"),
  productInsightsUpdatedAt: (0, import_pg_core.timestamp)("product_insights_updated_at"),
  // v7.471: Insights panel — the STORED, machine-verified generated narrative
  // (thesis / patterns / competitor playbook / where-to-strike). Written only by
  // /api/projects/[id]/insights-panel POST after the v7.463 fail-closed number
  // verifier passes; cached until the user regenerates (Const I.1 — nothing
  // unverified is ever stored). market_benchmarks holds USER-ENTERED external
  // scale rows (brand, metric, value, source) displayed verbatim with their
  // source, never computed on. All three ensured in the projects-list route
  // (the v7.268/v7.327 column lesson).
  insightsPanel: (0, import_pg_core.jsonb)("insights_panel"),
  insightsPanelUpdatedAt: (0, import_pg_core.timestamp)("insights_panel_updated_at"),
  marketBenchmarks: (0, import_pg_core.jsonb)("market_benchmarks"),
  // v7.488: the LIVE STATE of an insights generation run — status, current step
  // label, timestamps, and the terminal error if any. Written by the POST as it
  // goes, read by GET, so the panel no longer depends on one long-lived stream
  // staying open (v7.487's connection was cut at ~5 min while the server ran on
  // to completion and nobody saw the result). Small (< 1 KB); never a client
  // deliverable. Ensured in the projects-list + [id] + insights-panel routes.
  insightsPanelJob: (0, import_pg_core.jsonb)("insights_panel_job"),
  // v7.342: the project's CANONICAL TAXONOMY ANCHOR (distinct canonical paths from the
  // last successful anchored-engine breakdown, capped). Lives on the PROJECT — like brand
  // terms — so it SURVIVES the full keyword reset Wayne's upload workflow runs (the reset
  // deletes every analyses row, which was silently destroying the prior-analysis anchor and
  // making every re-upload a from-scratch re-derivation with different category names —
  // Const III.1e). Written by the synthesize route after each successful breakdown; read as
  // the skeleton anchor on the next run. Auto-migrated at runtime via ADD COLUMN IF NOT
  // EXISTS (ensured in the projects-list route per the v7.268/v7.327 lesson). No db:push.
  taxonomyAnchor: (0, import_pg_core.jsonb)("taxonomy_anchor").$type(),
  taxonomyAnchorUpdatedAt: (0, import_pg_core.timestamp)("taxonomy_anchor_updated_at"),
  // v7.367: Google Rank Authority scan snapshot — REAL Semrush backlink-authority signals
  // (backlinks_overview / ascore profile / anchors / referring-domain categories / brand
  // phrase volume) for the client + each competitor, pulled on demand from the Authority
  // panel (Const I.1 — every count is a crawled Semrush row, dated; the Authority Score
  // inside is Semrush's modeled composite and is labeled as such at render, I.5a). Lives
  // on the PROJECT row — like brandTerms/taxonomyAnchor — so it survives the full keyword
  // reset (which deletes analyses rows). Feeds the Authority Calculator panel (v7.368).
  // Auto-migrated at runtime via ADD COLUMN IF NOT EXISTS (ensured in the projects-list +
  // [id] + authority-scan routes per the v7.268/v7.327 column lesson). No manual db:push.
  authoritySnapshot: (0, import_pg_core.jsonb)("authority_snapshot"),
  authoritySnapshotUpdatedAt: (0, import_pg_core.timestamp)("authority_snapshot_updated_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
});
var competitors = (0, import_pg_core.pgTable)("competitors", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  projectId: (0, import_pg_core.uuid)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain: (0, import_pg_core.text)("domain").notNull(),
  name: (0, import_pg_core.text)("name"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var analyses = (0, import_pg_core.pgTable)("analyses", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  projectId: (0, import_pg_core.uuid)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: analysisStatusEnum("status").default("pending").notNull(),
  triggeredAt: (0, import_pg_core.timestamp)("triggered_at").defaultNow().notNull(),
  completedAt: (0, import_pg_core.timestamp)("completed_at"),
  errorMessage: (0, import_pg_core.text)("error_message"),
  semrushSnapshot: (0, import_pg_core.jsonb)("semrush_snapshot"),
  serpApiSnapshot: (0, import_pg_core.jsonb)("serpapi_snapshot"),
  profoundSnapshot: (0, import_pg_core.jsonb)("profound_snapshot"),
  marketCaptureRate: (0, import_pg_core.real)("market_capture_rate"),
  totalCategoryVolume: (0, import_pg_core.integer)("total_category_volume"),
  clientOwnedVolume: (0, import_pg_core.integer)("client_owned_volume"),
  keywordFootprint: (0, import_pg_core.integer)("keyword_footprint"),
  aioAvailable: (0, import_pg_core.integer)("aio_available"),
  aioAcquired: (0, import_pg_core.integer)("aio_acquired"),
  topCompetitor: (0, import_pg_core.text)("top_competitor")
});
var projectKeywords = (0, import_pg_core.pgTable)("project_keywords", {
  id: (0, import_pg_core.serial)("id").primaryKey(),
  projectId: (0, import_pg_core.uuid)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keyword: (0, import_pg_core.text)("keyword").notNull(),
  searchVolume: (0, import_pg_core.integer)("search_volume").notNull().default(0),
  position: (0, import_pg_core.integer)("position"),
  // null = not ranked / gap
  type: (0, import_pg_core.text)("type").notNull().default("gap"),
  // 'ranked' | 'gap'
  branded: (0, import_pg_core.boolean)("branded").notNull().default(false),
  source: (0, import_pg_core.text)("source").notNull(),
  // 'custom' | 'csv' | 'blocked'
  domain: (0, import_pg_core.text)("domain"),
  // null = client keyword; set = competitor domain (uploaded footprints)
  url: (0, import_pg_core.text)("url"),
  // v7.251: real ranking/landing URL from the uploaded CSV (Semrush "URL" column); null = column absent
  // v7.451: Semrush "Position Type" — 'Organic' or a SERP-feature name (People also ask,
  // Things to know, …). A feature placement exports with Position = 1, so without this the
  // pool counted boxes as #1 rankings (Const I.4). NULL = pre-v7.451 row, basis UNKNOWN —
  // never silently read as organic; see lib/keywords/positionBasis.ts.
  positionType: (0, import_pg_core.text)("position_type"),
  // v7.451: when this row's position was checked against Semrush's organic index.
  positionVerifiedAt: (0, import_pg_core.timestamp)("position_verified_at"),
  serpFeatures: (0, import_pg_core.text)("serp_features"),
  // v7.103: raw Semrush "SERP Features by Keyword" cell; null = column absent in upload
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var apiUsage = (0, import_pg_core.pgTable)("api_usage", {
  id: (0, import_pg_core.serial)("id").primaryKey(),
  projectId: (0, import_pg_core.uuid)("project_id").references(() => projects.id, { onDelete: "cascade" }),
  // null = unattributed
  provider: (0, import_pg_core.text)("provider").notNull(),
  // 'semrush' | 'serpapi' | 'profound' | 'anthropic' | 'openai'
  endpoint: (0, import_pg_core.text)("endpoint").notNull(),
  // report type / path / model (provenance of the cost)
  unit: (0, import_pg_core.text)("unit").notNull(),
  // 'units' | 'searches' | 'calls' | 'tokens' | 'images'
  quantity: (0, import_pg_core.integer)("quantity").notNull().default(0),
  // REAL credits consumed, in the provider's native unit
  rows: (0, import_pg_core.integer)("rows"),
  // rows returned (Semrush) — provenance for units = rows × rate
  rate: (0, import_pg_core.integer)("rate"),
  // per-line rate applied (Semrush) — provenance
  keyHash: (0, import_pg_core.text)("key_hash"),
  // masked fingerprint of the key used (supports multiple keys/provider)
  kind: (0, import_pg_core.text)("kind").notNull().default("usage"),
  // 'usage' | 'baseline' (manual reconciliation anchor)
  meta: (0, import_pg_core.jsonb)("meta"),
  // extra provenance: tokens in/out, model, status, note
  // v7.514: which PRODUCT spent it — 'orbit' (projects) or 'scout' (prospect snapshots).
  // NULL on every row written before v7.514, which read as 'orbit' (Scout did not exist).
  product: (0, import_pg_core.text)("product"),
  scoutRunId: (0, import_pg_core.uuid)("scout_run_id"),
  // the Scout run the call belonged to (product = 'scout'), else null
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var personas = (0, import_pg_core.pgTable)("personas", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  analysisId: (0, import_pg_core.uuid)("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
  segmentName: (0, import_pg_core.text)("segment_name").notNull(),
  description: (0, import_pg_core.text)("description").notNull(),
  intentStage: (0, import_pg_core.text)("intent_stage").notNull(),
  primaryQueries: (0, import_pg_core.jsonb)("primary_queries").$type().notNull(),
  painPoints: (0, import_pg_core.jsonb)("pain_points").$type().notNull(),
  aiDiscoveryBehavior: (0, import_pg_core.text)("ai_discovery_behavior"),
  contentGaps: (0, import_pg_core.jsonb)("content_gaps").$type(),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var opportunities = (0, import_pg_core.pgTable)("opportunities", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  analysisId: (0, import_pg_core.uuid)("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
  category: opportunityCategoryEnum("category").notNull(),
  title: (0, import_pg_core.text)("title").notNull(),
  summary: (0, import_pg_core.text)("summary").notNull(),
  impactScore: (0, import_pg_core.real)("impact_score").notNull(),
  effortScore: (0, import_pg_core.real)("effort_score").notNull(),
  estimatedVisits: (0, import_pg_core.integer)("estimated_visits"),
  estimatedLeads: (0, import_pg_core.integer)("estimated_leads"),
  evidence: (0, import_pg_core.jsonb)("evidence").notNull(),
  rank: (0, import_pg_core.integer)("rank").notNull(),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var reports = (0, import_pg_core.pgTable)("reports", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  analysisId: (0, import_pg_core.uuid)("analysis_id").notNull().references(() => analyses.id, { onDelete: "cascade" }),
  type: reportTypeEnum("type").notNull(),
  generatedAt: (0, import_pg_core.timestamp)("generated_at").defaultNow().notNull(),
  fileUrl: (0, import_pg_core.text)("file_url"),
  promptText: (0, import_pg_core.text)("prompt_text"),
  metadata: (0, import_pg_core.jsonb)("metadata")
});
var projectsRelations = (0, import_drizzle_orm.relations)(projects, ({ many }) => ({
  analyses: many(analyses),
  competitors: many(competitors),
  projectKeywords: many(projectKeywords),
  apiUsage: many(apiUsage)
}));
var apiUsageRelations = (0, import_drizzle_orm.relations)(apiUsage, ({ one }) => ({
  project: one(projects, { fields: [apiUsage.projectId], references: [projects.id] })
}));
var competitorsRelations = (0, import_drizzle_orm.relations)(competitors, ({ one }) => ({
  project: one(projects, { fields: [competitors.projectId], references: [projects.id] })
}));
var projectKeywordsRelations = (0, import_drizzle_orm.relations)(projectKeywords, ({ one }) => ({
  project: one(projects, { fields: [projectKeywords.projectId], references: [projects.id] })
}));
var analysesRelations = (0, import_drizzle_orm.relations)(analyses, ({ one, many }) => ({
  project: one(projects, { fields: [analyses.projectId], references: [projects.id] }),
  personas: many(personas),
  opportunities: many(opportunities),
  reports: many(reports)
}));
var personasRelations = (0, import_drizzle_orm.relations)(personas, ({ one }) => ({
  analysis: one(analyses, { fields: [personas.analysisId], references: [analyses.id] })
}));
var opportunitiesRelations = (0, import_drizzle_orm.relations)(opportunities, ({ one }) => ({
  analysis: one(analyses, { fields: [opportunities.analysisId], references: [analyses.id] })
}));
var reportsRelations = (0, import_drizzle_orm.relations)(reports, ({ one }) => ({
  analysis: one(analyses, { fields: [reports.analysisId], references: [analyses.id] })
}));
var userRoleEnum = (0, import_pg_core.pgEnum)("user_role", ["owner", "admin", "editor", "viewer"]);
var userStatusEnum = (0, import_pg_core.pgEnum)("user_status", ["active", "pending", "suspended"]);
var appUsers = (0, import_pg_core.pgTable)("app_users", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  email: (0, import_pg_core.text)("email").notNull().unique(),
  name: (0, import_pg_core.text)("name").notNull(),
  // null while a user is invited-but-has-not-set-a-password (status 'pending')
  passwordHash: (0, import_pg_core.text)("password_hash"),
  role: userRoleEnum("role").notNull().default("viewer"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
  lastLoginAt: (0, import_pg_core.timestamp)("last_login_at")
});
var projectAccess = (0, import_pg_core.pgTable)("project_access", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  userId: (0, import_pg_core.uuid)("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  projectId: (0, import_pg_core.uuid)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var userGroups = (0, import_pg_core.pgTable)("user_groups", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  name: (0, import_pg_core.text)("name").notNull().unique(),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var userGroupMembers = (0, import_pg_core.pgTable)("user_group_members", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  groupId: (0, import_pg_core.uuid)("group_id").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
  userId: (0, import_pg_core.uuid)("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var projectGroupAccess = (0, import_pg_core.pgTable)("project_group_access", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  groupId: (0, import_pg_core.uuid)("group_id").notNull().references(() => userGroups.id, { onDelete: "cascade" }),
  projectId: (0, import_pg_core.uuid)("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var passwordResets = (0, import_pg_core.pgTable)("password_resets", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  userId: (0, import_pg_core.uuid)("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  tokenHash: (0, import_pg_core.text)("token_hash").notNull(),
  expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
  usedAt: (0, import_pg_core.timestamp)("used_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
  // who issued it — denormalized so the trail survives the issuer being removed
  issuedBy: (0, import_pg_core.uuid)("issued_by"),
  issuedByEmail: (0, import_pg_core.text)("issued_by_email")
});
var authSessions = (0, import_pg_core.pgTable)("auth_sessions", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  userId: (0, import_pg_core.uuid)("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
  expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
  revokedAt: (0, import_pg_core.timestamp)("revoked_at"),
  ip: (0, import_pg_core.text)("ip"),
  userAgent: (0, import_pg_core.text)("user_agent")
});
var auditEvents = (0, import_pg_core.pgTable)("audit_events", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  actorUserId: (0, import_pg_core.uuid)("actor_user_id"),
  actorEmail: (0, import_pg_core.text)("actor_email"),
  actorName: (0, import_pg_core.text)("actor_name"),
  action: (0, import_pg_core.text)("action").notNull(),
  projectId: (0, import_pg_core.uuid)("project_id"),
  projectName: (0, import_pg_core.text)("project_name"),
  meta: (0, import_pg_core.jsonb)("meta").$type(),
  ip: (0, import_pg_core.text)("ip"),
  userAgent: (0, import_pg_core.text)("user_agent"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull()
});
var noticeSeverityEnum = (0, import_pg_core.pgEnum)("notice_severity", ["info", "warning", "success"]);
var notices = (0, import_pg_core.pgTable)("notices", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  title: (0, import_pg_core.text)("title").notNull(),
  body: (0, import_pg_core.text)("body").notNull(),
  severity: noticeSeverityEnum("severity").notNull().default("info"),
  active: (0, import_pg_core.boolean)("active").notNull().default(true),
  // Optional window. null start = live immediately; null end = never expires.
  startsAt: (0, import_pg_core.timestamp)("starts_at"),
  endsAt: (0, import_pg_core.timestamp)("ends_at"),
  createdBy: (0, import_pg_core.uuid)("created_by"),
  createdByName: (0, import_pg_core.text)("created_by_name"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow().notNull(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow().notNull()
});
var noticeDismissals = (0, import_pg_core.pgTable)("notice_dismissals", {
  id: (0, import_pg_core.uuid)("id").defaultRandom().primaryKey(),
  noticeId: (0, import_pg_core.uuid)("notice_id").notNull().references(() => notices.id, { onDelete: "cascade" }),
  userId: (0, import_pg_core.uuid)("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  dismissedAt: (0, import_pg_core.timestamp)("dismissed_at").defaultNow().notNull()
});

// db/index.ts
var _instance;
function getInstance() {
  if (_instance)
    return _instance;
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL environment variable is not set");
  _instance = (0, import_neon_http.drizzle)((0, import_serverless.neon)(url), { schema: schema_exports });
  return _instance;
}
var db = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(getInstance(), prop);
  }
});

// lib/usage/context.ts
var import_node_async_hooks = require("node:async_hooks");
var storage = new import_node_async_hooks.AsyncLocalStorage();
function currentUsageProduct() {
  return storage.getStore()?.ref.product ?? "orbit";
}
function currentUsageScoutRun() {
  return storage.getStore()?.ref.scoutRunId ?? null;
}
function currentUsageProject() {
  return storage.getStore()?.ref.projectId ?? null;
}

// lib/usage/record.ts
var _tableEnsured = null;
function ensureUsageTable() {
  if (_tableEnsured)
    return _tableEnsured;
  _tableEnsured = (async () => {
    await db.execute(import_drizzle_orm2.sql`
      CREATE TABLE IF NOT EXISTS api_usage (
        id          SERIAL PRIMARY KEY,
        project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL,
        endpoint    TEXT NOT NULL,
        unit        TEXT NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 0,
        rows        INTEGER,
        rate        INTEGER,
        key_hash    TEXT,
        kind        TEXT NOT NULL DEFAULT 'usage',
        meta        JSONB,
        created_at  TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await db.execute(import_drizzle_orm2.sql`CREATE INDEX IF NOT EXISTS api_usage_project_id_idx ON api_usage (project_id)`);
    await db.execute(import_drizzle_orm2.sql`CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage (created_at)`);
    await db.execute(import_drizzle_orm2.sql`ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS product TEXT`);
    await db.execute(import_drizzle_orm2.sql`ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS scout_run_id UUID`);
    await db.execute(import_drizzle_orm2.sql`CREATE INDEX IF NOT EXISTS api_usage_scout_run_id_idx ON api_usage (scout_run_id)`);
  })().catch((err) => {
    _tableEnsured = null;
    console.warn("[OrbitIQ usage] ensureUsageTable failed:", err?.message ?? err);
  });
  return _tableEnsured;
}
function keyFingerprint(key) {
  if (!key)
    return null;
  const hash = (0, import_node_crypto.createHash)("sha256").update(key).digest("hex").slice(0, 8);
  const last4 = key.slice(-4);
  return `${hash}:\u2022\u2022\u2022\u2022${last4}`;
}
async function recordUsage(input) {
  try {
    await ensureUsageTable();
    const quantity = Number.isFinite(input.quantity) ? Math.max(0, Math.round(input.quantity)) : 0;
    await db.insert(apiUsage).values({
      projectId: currentUsageProject(),
      provider: input.provider,
      endpoint: input.endpoint,
      unit: input.unit,
      quantity,
      rows: input.rows ?? null,
      rate: input.rate ?? null,
      keyHash: input.keyHash ?? null,
      kind: "usage",
      meta: input.meta ?? null,
      product: currentUsageProduct(),
      // v7.514 — 'orbit' | 'scout'
      scoutRunId: currentUsageScoutRun()
    });
  } catch (err) {
    _ledgerFailures++;
    const e = err;
    _lastLedgerError = [e?.name, e?.code, e?.message ?? String(err)].filter(Boolean).join(" | ");
    console.error(
      "[OrbitIQ usage] LEDGER WRITE FAILED:",
      _lastLedgerError,
      "| provider=",
      input.provider,
      "endpoint=",
      input.endpoint
    );
  }
}
var _ledgerFailures = 0;
var _lastLedgerError = null;
async function recordAnthropic(resp, endpoint, key) {
  const usage = resp?.usage ?? {};
  const inTok = Number(usage.input_tokens) || 0;
  const outTok = Number(usage.output_tokens) || 0;
  await recordUsage({
    provider: "anthropic",
    endpoint,
    // model name (e.g. claude-haiku-4-5)
    unit: "tokens",
    quantity: inTok + outTok,
    keyHash: keyFingerprint(key ?? process.env.ANTHROPIC_API_KEY),
    meta: { inputTokens: inTok, outputTokens: outTok }
  });
}
async function recordOpenAITokens(usage, endpoint, key) {
  const inTok = Number(usage?.prompt_tokens) || 0;
  const outTok = Number(usage?.completion_tokens) || 0;
  const total = Number(usage?.total_tokens) || inTok + outTok;
  await recordUsage({
    provider: "openai",
    endpoint,
    unit: "tokens",
    quantity: total,
    keyHash: keyFingerprint(key ?? process.env.OPENAI_API_KEY),
    meta: { inputTokens: inTok, outputTokens: outTok }
  });
}
function instrumentAnthropic(client, label) {
  const messages = client.messages;
  if (messages.__usageInstrumented)
    return client;
  const orig = messages.create.bind(messages);
  messages.create = async (body, options) => {
    const resp = await orig(body, options);
    try {
      if (resp && resp.usage)
        await recordAnthropic(resp, label ?? body?.model ?? "anthropic");
    } catch {
    }
    return resp;
  };
  messages.__usageInstrumented = true;
  return client;
}

// lib/claude/intentGroups.ts
var import_sdk = __toESM(require("@anthropic-ai/sdk"));
var STAGES = ["awareness", "consideration", "decision", "retention"];
var INTENT_ENGINE = "intent-ai-v1";
var MAX_KW_PER_CATEGORY = 200;
var KW_BUDGET_PER_CALL = 140;
var MAX_CATS_PER_CALL = 25;
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it in Vercel \u2192 Settings \u2192 Environment Variables.");
  }
  return instrumentAnthropic(new import_sdk.default({ apiKey }));
}
var MODEL = "claude-haiku-4-5-20251001";
function extractJSON(text2) {
  const fenced = text2.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text2).trim();
  const start = raw.search(/[[{]/);
  if (start < 0)
    throw new Error("No JSON found in model response");
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc)
        esc = false;
      else if (ch === "\\")
        esc = true;
      else if (ch === '"')
        inStr = false;
      continue;
    }
    if (ch === '"')
      inStr = true;
    else if (ch === open)
      depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const slice = end > start ? raw.slice(start, end + 1) : raw.slice(start);
  return JSON.parse(slice);
}
function normStage(s) {
  const v = String(s ?? "").toLowerCase().trim();
  return STAGES.includes(v) ? v : "awareness";
}
function buildPrompt(clientDomain, cats) {
  const blocks = cats.map((c, i) => {
    const kws = c.keywords.slice().sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)).slice(0, MAX_KW_PER_CATEGORY).map((k) => k.keyword);
    return `Category ${i + 1}: "${c.name}"
Keywords:
${kws.map((k) => `- ${k}`).join("\n")}`;
  }).join("\n\n");
  return [
    `You are an SEO content strategist grouping keywords by SEARCH INTENT.`,
    `The client website is "${clientDomain}".`,
    ``,
    `For EACH category below, group its keywords so that keywords sharing the SAME`,
    `underlying search intent \u2014 the same question/need that ONE single web page would`,
    `answer \u2014 are in the same group. MERGE SYNONYMS aggressively: e.g. "529 account",`,
    `"529 college plan" and "college savings 529" are the same intent (a 529 plan`,
    `overview) and belong in ONE group. "ira vs 401k", "401k vs ira" and "explain the`,
    `difference between a 401k and an ira" are ONE group.`,
    ``,
    `Give each group a short, specific, Title-Case NAME describing the intent/topic,`,
    `e.g. "What is a 529 Plan", "529 vs Coverdell ESA", "529 Withdrawal Rules",`,
    `"401k vs IRA", "401k Contribution Limits". NOT a bare keyword modifier.`,
    `Assign each group ONE funnel STAGE: awareness, consideration, decision, or retention.`,
    ``,
    `Separately, identify BRAND keywords: any keyword containing a company or product`,
    `BRAND that is NOT the client "${clientDomain}" \u2014 competitors, providers, or other`,
    `companies (e.g. "schwab 529", "charles schwab 529", "vanguard 529", "fidelity`,
    `401k"). List those under brandKeywords and DO NOT put them in any group.`,
    ``,
    `RULES: use ONLY keywords exactly as given (copy them verbatim, lowercase).`,
    `Every non-brand keyword should appear in exactly one group. Do not invent keywords.`,
    ``,
    blocks,
    ``,
    `Return STRICT JSON only, no prose, in this shape:`,
    `{"categories":[{"category":"<exact category name>","groups":[{"name":"...","stage":"awareness","keywords":["kw","kw"]}],"brandKeywords":["kw"]}]}`
  ].join("\n");
}
async function runBatch(clientDomain, cats) {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(clientDomain, cats) }]
  });
  const text2 = res.content.map((b) => b.type === "text" ? b.text : "").join("");
  const parsed = extractJSON(text2);
  const groups = [];
  const brand = [];
  const byName = /* @__PURE__ */ new Map();
  for (const c of cats)
    byName.set(c.name.toLowerCase(), c);
  for (const rc of parsed.categories ?? []) {
    const cat = byName.get(String(rc.category ?? "").toLowerCase());
    if (!cat)
      continue;
    const valid = new Set(cat.keywords.map((k) => k.keyword.toLowerCase().trim()));
    const usableBrand = (rc.brandKeywords ?? []).map((k) => String(k).toLowerCase().trim()).filter((k) => valid.has(k));
    for (const b of usableBrand)
      brand.push(b);
    const brandSet = new Set(usableBrand);
    for (const g of rc.groups ?? []) {
      const name = String(g?.name ?? "").trim();
      const kws = (g?.keywords ?? []).map((k) => String(k).toLowerCase().trim()).filter((k) => valid.has(k) && !brandSet.has(k));
      if (!name || kws.length === 0)
        continue;
      groups.push({ category: cat.name, name, stage: normStage(g?.stage), keywords: kws });
    }
  }
  return { groups, brand };
}
async function groupCategoriesByIntent(categories, clientDomain, onProgress, alreadyDone = []) {
  const skip = new Set(alreadyDone.map((s) => s.toLowerCase()));
  const todo = categories.filter((c) => c.type === "procedure" && c.keywords.length > 0 && !skip.has(c.name.toLowerCase()));
  const batches = [];
  let cur = [];
  let curKw = 0;
  for (const c of todo) {
    const n = Math.min(c.keywords.length, MAX_KW_PER_CATEGORY);
    if (cur.length > 0 && (curKw + n > KW_BUDGET_PER_CALL || cur.length >= MAX_CATS_PER_CALL)) {
      batches.push(cur);
      cur = [];
      curKw = 0;
    }
    cur.push(c);
    curKw += n;
  }
  if (cur.length > 0)
    batches.push(cur);
  const intentGroups = [];
  const brandKeywords = [];
  const categoriesDone = alreadyDone.slice();
  const total = todo.length;
  let done = 0;
  for (const batch of batches) {
    try {
      const { groups, brand } = await runBatch(clientDomain, batch);
      for (const g of groups)
        intentGroups.push(g);
      for (const b of brand)
        brandKeywords.push(b);
    } catch (err) {
      console.error("[OrbitIQ] intent-group batch failed:", err?.message ?? err);
    }
    for (const c of batch)
      categoriesDone.push(c.name);
    done += batch.length;
    if (onProgress)
      onProgress(done, total, batch[0]?.name ?? "");
  }
  return {
    intentGroups,
    brandKeywords: Array.from(new Set(brandKeywords)),
    intentEngine: INTENT_ENGINE,
    categoriesDone
  };
}

// lib/category/scopeModel.ts
var CORE_MIN_CLIENT_KW = 2;
var OTHER_UMBRELLA = "Other";
var norm = (s) => String(s ?? "").toLowerCase().trim();
function classifyUmbrellaScopes(clientKwByUmbrella, navUmbrellas, threshold = CORE_MIN_CLIENT_KW) {
  const navNorm = new Set(Array.from(navUmbrellas, norm));
  const out = {};
  for (const [name, count] of Array.from(clientKwByUmbrella.entries())) {
    if (!name)
      continue;
    if (norm(name) === norm(OTHER_UMBRELLA) || navNorm.has(norm(name))) {
      out[name] = "core";
    } else {
      out[name] = count >= threshold ? "core" : "adjacent";
    }
  }
  return out;
}

// lib/category/funnelMap.ts
var INTENT_FAMILIES = [
  "learn",
  "definition",
  "education",
  "how-it-works",
  "benefits",
  "faqs",
  "comparison",
  "selection",
  "reviews",
  "alternatives",
  "use-cases",
  "qualification",
  "application",
  "purchase",
  "requirements",
  "eligibility",
  "rates",
  "calculator",
  "management",
  "optimization",
  "support",
  "troubleshooting",
  "maintenance",
  "redemption",
  "merchant-acceptance"
];
var STAGE_BY_FAMILY = {
  // Awareness — the user is learning / problem-aware
  learn: "awareness",
  definition: "awareness",
  education: "awareness",
  "how-it-works": "awareness",
  benefits: "awareness",
  faqs: "awareness",
  // Consideration — the user is comparing / choosing
  comparison: "consideration",
  selection: "consideration",
  reviews: "consideration",
  alternatives: "consideration",
  "use-cases": "consideration",
  // Decision — the user is qualifying / applying / pricing
  qualification: "decision",
  application: "decision",
  purchase: "decision",
  requirements: "decision",
  eligibility: "decision",
  rates: "decision",
  calculator: "decision",
  // Retention — the user already has the product and is using / managing it
  management: "retention",
  optimization: "retention",
  support: "retention",
  troubleshooting: "retention",
  maintenance: "retention",
  redemption: "retention",
  "merchant-acceptance": "retention"
};
function normalizeIntentFamily(s) {
  const v = String(s ?? "").toLowerCase().trim().replace(/[_\s]+/g, "-");
  return INTENT_FAMILIES.includes(v) ? v : null;
}
function funnelStageForFamily(family) {
  const f = normalizeIntentFamily(family);
  return f ? STAGE_BY_FAMILY[f] : "awareness";
}

// lib/utils/brandRoot.ts
var SECOND_LEVEL = /* @__PURE__ */ new Set(["co", "com", "org", "net", "gov", "ac", "edu", "ltd", "plc", "me", "nhs", "police", "sch"]);
var TLDS = /* @__PURE__ */ new Set([
  "com",
  "net",
  "org",
  "io",
  "co",
  "ca",
  "us",
  "uk",
  "au",
  "gov",
  "edu",
  "biz",
  "info",
  "bank",
  "app",
  "ai",
  "mobi",
  "insurance",
  "finance",
  "financial",
  "credit",
  "loans",
  "money",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "ie",
  "nz",
  "in",
  "mx",
  "br",
  "jp",
  "cn",
  "hk",
  "sg",
  "za"
]);
function hostOf(domain) {
  return String(domain ?? "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\d*\./, "").replace(/\.$/, "");
}
function brandLabelOf(domain) {
  const labels = hostOf(domain).split(".").filter(Boolean);
  if (labels.length === 0)
    return "";
  if (labels.length === 1)
    return labels[0];
  let end = labels.length;
  if (TLDS.has(labels[end - 1]) || /^[a-z]{2,3}$/.test(labels[end - 1])) {
    end--;
    if (end >= 2 && /^[a-z]{2}$/.test(labels[end]) && SECOND_LEVEL.has(labels[end - 1]))
      end--;
  }
  return labels[Math.max(0, end - 1)] ?? "";
}

// lib/apis/llmProbe.ts
var import_sdk2 = __toESM(require("@anthropic-ai/sdk"));
var LEADING_PREPOSITIONS = /* @__PURE__ */ new Set(["by", "for", "with", "without", "under", "over", "in", "on", "to", "from", "near", "vs", "per"]);
function composePromptLabel(name, umbrella) {
  const leaf = String(name ?? "").trim();
  const root = String(umbrella ?? "").trim();
  if (!leaf || !root || root.toLowerCase() === leaf.toLowerCase())
    return leaf;
  const first = leaf.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (LEADING_PREPOSITIONS.has(first))
    return `${root} ${leaf}`;
  const stem = (w) => w.toLowerCase().replace(/s$/, "");
  const rootWords = root.split(/\s+/).map(stem).filter((w) => w.length > 3);
  const leafWords = new Set(leaf.split(/\s+/).map(stem));
  if (rootWords.some((w) => leafWords.has(w)))
    return leaf;
  return `${leaf} ${root}`;
}
function buildPromptSpecs(clientName, industry, categories) {
  const specs = [];
  categories.forEach((cat, i) => {
    const label = (cat.promptLabel ?? cat.name).toLowerCase();
    const subjects = (cat.terms ?? []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
    const subj = (n) => subjects.length > 0 ? subjects[n % subjects.length] : label;
    specs.push({
      key: `cat${i}:u1`,
      category: cat.name,
      intent: "unbranded_recommendation",
      branded: false,
      prompt: `What are the best companies or providers for ${subj(0)}?`
    });
    specs.push({
      key: `cat${i}:u2`,
      category: cat.name,
      intent: "unbranded_consideration",
      branded: false,
      prompt: `I'm considering ${subj(1)}. Which companies or providers should I look into, and why?`
    });
    specs.push({
      key: `cat${i}:u3`,
      category: cat.name,
      intent: "unbranded_toprated",
      branded: false,
      prompt: `Who are the top-rated providers for ${subj(2)} right now?`
    });
    specs.push({
      key: `cat${i}:u4`,
      category: cat.name,
      intent: "unbranded_shortlist",
      branded: false,
      prompt: `If I'm comparing options for ${subj(3)}, which companies should be on my shortlist?`
    });
    specs.push({
      key: `cat${i}:u5`,
      category: cat.name,
      intent: "unbranded_wordofmouth",
      branded: false,
      prompt: `What companies do people most often recommend for ${subj(4)}?`
    });
    if (cat.kind !== "sub") {
      specs.push({
        key: `cat${i}:b1`,
        category: cat.name,
        intent: "branded_proscons",
        branded: true,
        prompt: `What are the pros and cons of ${clientName} for ${label}?`
      });
    }
  });
  specs.push({
    key: "brand:overview",
    category: null,
    intent: "brand_overview",
    branded: true,
    prompt: `What is ${clientName}? Give me a brief overview.`
  });
  specs.push({
    key: "brand:reputation",
    category: null,
    intent: "brand_reputation",
    branded: true,
    prompt: `Is ${clientName} reputable? What do reviews and customer feedback generally say about them?`
  });
  specs.push({
    key: "brand:industry",
    category: null,
    intent: "industry_top",
    branded: false,
    prompt: `Who are the top providers in the ${industry} industry?`
  });
  specs.push({
    key: "brand:compare",
    category: null,
    intent: "brand_comparison",
    branded: true,
    prompt: `How does ${clientName} compare to its main competitors?`
  });
  return specs;
}
function detectMention(response, clientName, domain) {
  const nameLower = clientName.toLowerCase();
  const domainToken = brandLabelOf(domain);
  const lower = response.toLowerCase();
  const mentioned = lower.includes(nameLower) || lower.includes(domainToken);
  if (!mentioned)
    return { mentioned: false, excerpt: null };
  const sentences = response.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => {
    const sl = s.toLowerCase();
    return sl.includes(nameLower) || sl.includes(domainToken);
  });
  const raw = hit ?? response;
  return { mentioned: true, excerpt: raw.trim().substring(0, 300) };
}
async function runPool(items, limit, fn, deadlineMs) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      if (deadlineMs !== void 0 && Date.now() >= deadlineMs)
        break;
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results.filter((r) => r !== void 0);
}
var PROBE_MAX_TOKENS = 500;
var RESPONSE_STORE_MAX = 1200;
var POOL_LIMIT = 8;
async function askClaude(prompt) {
  const client = new import_sdk2.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: PROBE_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }]
  }, { timeout: 3e4 });
  await recordAnthropic(msg, "claude-haiku-4-5-20251001");
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}
async function askChatGPT(prompt) {
  const API_KEY = process.env.OPENAI_API_KEY;
  if (!API_KEY)
    throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(3e4),
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: PROBE_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.substring(0, 200)}`);
  }
  const data = await res.json();
  await recordOpenAITokens(data.usage, "gpt-4o-mini");
  return data.choices?.[0]?.message?.content ?? "";
}
async function probePlatform(platform, specs, clientName, domain, deadlineMs) {
  const ask = platform === "claude" ? askClaude : askChatGPT;
  return runPool(specs, POOL_LIMIT, async (spec) => {
    try {
      const text2 = await ask(spec.prompt);
      const { mentioned, excerpt } = detectMention(text2, clientName, domain);
      return {
        id: `${platform}:${spec.key}`,
        platform,
        category: spec.category,
        intent: spec.intent,
        branded: spec.branded,
        prompt: spec.prompt,
        mentioned,
        excerpt,
        responseText: text2.substring(0, RESPONSE_STORE_MAX),
        sentiment: null,
        recognized: null
      };
    } catch (err) {
      console.error(`[LLMProbe] ${platform} prompt failed (${spec.key}):`, err?.message);
      return {
        id: `${platform}:${spec.key}`,
        platform,
        category: spec.category,
        intent: spec.intent,
        branded: spec.branded,
        prompt: spec.prompt,
        mentioned: false,
        excerpt: null,
        responseText: "",
        sentiment: null,
        recognized: null
      };
    }
  }, deadlineMs);
}
function normalizeWs(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
function quoteIsVerbatim(quote, responseText) {
  if (!quote || quote.length < 10)
    return false;
  return normalizeWs(responseText).includes(normalizeWs(quote));
}
async function classifyResults(results, clientName) {
  const candidates = results.filter((r) => r.mentioned || r.branded);
  if (candidates.length === 0)
    return { assessed: true };
  const payload = candidates.map((r) => ({
    id: r.id,
    branded: r.branded,
    mentioned: r.mentioned,
    prompt: r.prompt,
    response: r.responseText
  }));
  const prompt = `You are auditing how AI assistants talk about the brand "${clientName}".

Below is a JSON array of probe results. Each has: id, branded (the prompt named the brand), mentioned (the brand appeared in the response), prompt, response.

For EACH item return an object with:
- "id": same id
- "sentiment": ONLY if mentioned is true \u2014 classify how the response portrays ${clientName}: "positive" (recommended, praised, listed as a top option), "neutral" (factual mention, mixed without leaning), or "negative" (criticized, warned about, complaints emphasized). Judge ONLY the portrayal of ${clientName}, not overall response tone.
- "recognized": ONLY if branded is true \u2014 true if the response demonstrates real knowledge of ${clientName} (describes what it actually is/does), false if it says it is unfamiliar, unsure, or clearly describes a different entity.
- "quote": ONLY if mentioned is true \u2014 copy the single most representative sentence about ${clientName} EXACTLY as it appears in the response, character for character. Do not paraphrase, do not fix typos, do not add words.

Return ONLY a JSON array. No prose, no markdown fences.

${JSON.stringify(payload)}`;
  try {
    const client = new import_sdk2.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16e3,
      messages: [{ role: "user", content: prompt }]
    }, { timeout: 1e5 });
    await recordAnthropic(msg, "claude-sonnet-4-6");
    const text2 = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const cleaned = text2.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match)
        throw new Error("classifier returned non-JSON");
      parsed = JSON.parse(match[0]);
    }
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const item of parsed) {
      const r = byId.get(item?.id ?? "");
      if (!r)
        continue;
      if (r.mentioned && (item.sentiment === "positive" || item.sentiment === "neutral" || item.sentiment === "negative")) {
        r.sentiment = item.sentiment;
      }
      if (r.branded && typeof item.recognized === "boolean") {
        r.recognized = item.recognized;
      }
      if (r.mentioned && item.quote && quoteIsVerbatim(item.quote, r.responseText)) {
        r.excerpt = item.quote.trim().substring(0, 300);
      }
    }
    return { assessed: true };
  } catch (err) {
    console.error("[LLMProbe] Sentiment/recognition classification failed (non-fatal):", err?.message);
    return { assessed: false };
  }
}
function buildCategoryVisibility(results, categories) {
  return categories.map((cat) => {
    const rows = results.filter((r) => r.category === cat.name && !r.branded);
    const claude = rows.filter((r) => r.platform === "claude");
    const chatgpt = rows.filter((r) => r.platform === "chatgpt");
    const mentions = rows.filter((r) => r.mentioned).length;
    return {
      category: cat.name,
      monthlyDemand: cat.monthlyDemand,
      claudeMentions: claude.filter((r) => r.mentioned).length,
      claudeTotal: claude.length,
      chatgptMentions: chatgpt.filter((r) => r.mentioned).length,
      chatgptTotal: chatgpt.length,
      mentionRate: rows.length > 0 ? mentions / rows.length : 0
    };
  });
}
function buildSentimentExamples(results) {
  const examples = [];
  const pick = (tone, max) => {
    results.filter((r) => r.sentiment === tone && r.excerpt).slice(0, max).forEach((r) => examples.push({
      tone,
      platform: r.platform,
      prompt: r.prompt,
      category: r.category,
      quote: r.excerpt
    }));
  };
  pick("positive", 2);
  pick("negative", 2);
  return examples;
}
async function getLLMProbeSnapshotV2(clientName, domain, industry, categories, deadlineMs) {
  const specs = buildPromptSpecs(clientName, industry, categories);
  console.log(
    `[LLMProbe v2] Probing "${clientName}" (${domain}) \u2014 ${categories.length} categories/nodes, ${specs.length} prompts/platform${deadlineMs ? `, deadline in ${Math.round((deadlineMs - Date.now()) / 1e3)}s` : ""}. OPENAI_API_KEY set: ${!!process.env.OPENAI_API_KEY}`
  );
  const [claudeResults, chatgptResults] = await Promise.all([
    probePlatform("claude", specs, clientName, domain, deadlineMs).catch((err) => {
      console.error("[LLMProbe v2] Claude platform failed:", err);
      return [];
    }),
    probePlatform("chatgpt", specs, clientName, domain, deadlineMs).catch((err) => {
      console.error("[LLMProbe v2] ChatGPT platform failed:", err);
      return [];
    })
  ]);
  const planned = specs.length * 2;
  const completed = claudeResults.length + chatgptResults.length;
  if (completed < planned) {
    console.warn(`[LLMProbe v2] Deadline partial: ${completed}/${planned} prompts completed \u2014 completed results are kept (real data); the rest are absent, not zero (Const I.5).`);
  }
  const results = [...claudeResults, ...chatgptResults];
  const { assessed } = await classifyResults(results, clientName);
  const unbrandedRows = results.filter((r) => !r.branded);
  const unbrandedMentions = unbrandedRows.filter((r) => r.mentioned).length;
  const unbrandedScore = unbrandedRows.length > 0 ? Math.round(unbrandedMentions / unbrandedRows.length * 100) : 0;
  const brandedRows = results.filter((r) => r.branded);
  const recognizedCount = assessed ? brandedRows.filter((r) => r.recognized === true).length : brandedRows.filter((r) => r.mentioned).length;
  const brandedScore = brandedRows.length > 0 ? Math.round(recognizedCount / brandedRows.length * 100) : 0;
  const mentionRows = results.filter((r) => r.mentioned);
  const sentiment = {
    positive: mentionRows.filter((r) => r.sentiment === "positive").length,
    neutral: mentionRows.filter((r) => r.sentiment === "neutral").length,
    negative: mentionRows.filter((r) => r.sentiment === "negative").length,
    totalMentions: mentionRows.length,
    assessed,
    examples: buildSentimentExamples(results)
  };
  const platformsUsed = [];
  if (claudeResults.length > 0)
    platformsUsed.push("Claude (Anthropic)");
  if (chatgptResults.length > 0)
    platformsUsed.push("ChatGPT (OpenAI)");
  console.log(
    `[LLMProbe v2] Done \u2014 unbranded ${unbrandedMentions}/${unbrandedRows.length} (${unbrandedScore}), recognition ${recognizedCount}/${brandedRows.length} (${brandedScore}), sentiment +${sentiment.positive}/~${sentiment.neutral}/-${sentiment.negative} (assessed=${assessed})`
  );
  return {
    source: "llm_probe_v2",
    probedAt: (/* @__PURE__ */ new Date()).toISOString(),
    platformsUsed,
    promptsPerPlatform: specs.length,
    coverage: { planned, completed },
    // v7.474: honest partial-coverage marker
    results,
    categories: buildCategoryVisibility(results, categories),
    unbranded: { mentions: unbrandedMentions, total: unbrandedRows.length, score: unbrandedScore },
    branded: { recognized: recognizedCount, total: brandedRows.length, score: brandedScore, assessed },
    sentiment,
    overallScore: unbrandedScore
  };
}

// lib/claude/prompts.ts
function llmProbeContext(profound) {
  if (profound?.source === "llm_probe_v2") {
    const cats = profound.categories ?? [];
    const invisible = cats.filter((c) => c.mentionRate === 0).map((c) => c.category);
    const visible = cats.filter((c) => c.mentionRate > 0).map((c) => `${c.category} (${Math.round(c.mentionRate * 100)}%)`);
    const s = profound.sentiment ?? {};
    const negExample = (s.examples ?? []).find((e) => e.tone === "negative");
    return `LLM VISIBILITY (live probe of Claude + ChatGPT, ${profound.promptsPerPlatform ?? "?"} prompts/platform):
- Unbranded visibility: ${profound.unbranded?.score ?? 0}/100 \u2014 mentioned in ${profound.unbranded?.mentions ?? 0} of ${profound.unbranded?.total ?? 0} prompts that never named the brand
- Brand recognition: ${profound.branded?.score ?? 0}/100 (${profound.branded?.recognized ?? 0}/${profound.branded?.total ?? 0} branded prompts answered accurately)
- Categories where brand is NEVER recommended by AI: ${invisible.length > 0 ? invisible.join(", ") : "none"}
- Categories with some AI visibility: ${visible.length > 0 ? visible.join(", ") : "none"}
- Sentiment of brand mentions: ${s.positive ?? 0} positive / ${s.neutral ?? 0} neutral / ${s.negative ?? 0} negative${s.assessed === false ? " (not assessed this run)" : ""}
${negExample ? `- Example negative AI excerpt (verbatim): "${negExample.quote}"` : ""}`;
  }
  if (profound?.source === "llm_probe") {
    return `LLM VISIBILITY (live probe of Claude + ChatGPT):
- Overall LLM visibility score: ${profound.overallScore ?? 0}/100 (${profound.overallMentions ?? 0}/${profound.overallTotal ?? 0} prompts mentioned brand)`;
  }
  return `LLM VISIBILITY: not yet assessed (no probe data for this analysis)`;
}
function taxonomySkeletonPrompt(domain, industry, sampleKeywords, priorTree) {
  const kwList = sampleKeywords.map((k) => `- ${k.keyword} (${(k.searchVolume ?? 0).toLocaleString()}/mo)`).join("\n");
  const priorBlock = priorTree && priorTree.length > 0 ? `
EXISTING TAXONOMY from this project's previous analysis \u2014 REUSE these exact labels and structure wherever they still fit; only add or retire nodes the keywords genuinely require (label stability matters more than novelty):
${priorTree.map((l) => `- ${l}`).join("\n")}
` : "";
  return `You are designing the canonical INTENT-FIRST SEO taxonomy skeleton for a ${industry} website (${domain}) \u2014 the tree every keyword will be filed into. It models a WEBSITE (a tree of pages), organized by USER TASK, not a keyword list (Const III.10).

REPRESENTATIVE KEYWORDS (volume-ranked sample of the full footprint):
${kwList}
${priorBlock}
RULES \u2014 follow exactly:
1. LEVEL 1 = PRODUCT FAMILY (WHAT the search is about): the broad product/service families (e.g. "Credit Cards", "Mortgages", "Checking Accounts"). Group by MEANING, never by shared words. DISTINCT PRODUCTS ARE DISTINCT UMBRELLAS: never bundle two separate products into one umbrella \u2014 "Checking Accounts" and "Savings Accounts" are SEPARATE umbrellas (different products, different pages), NOT a combined "Checking & Savings Accounts"; likewise keep e.g. Auto Loans vs Auto Insurance separate. Only keep a shared umbrella when the terms are genuinely ONE offering, not two products joined by "&".
2. LEVEL 2 = INTENT GROUP (WHY the search exists \u2014 the user's TASK / a cluster of pages), NEVER a product sub-noun. Name the tasks the keywords actually express, e.g. "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card", "Support". Different user tasks are different intent groups because Google ranks different pages for them (Const III.11). Product variants (rewards, secured, student) live BELOW an intent group like "Credit Card Types", not as level-2 nodes themselves.
3. ONE concept = ONE node. Never emit two nodes that mean the same thing or where one contains the other as a sibling. Fold subtypes into their intent group.
4. Keep it lean: only families / intent-groups this sample actually supports. No filler, no speculative nodes, no generic buckets like "Services" or "Resources".
5. Do NOT create nodes for brand or location searches (they are handled separately).
6. Intent-group labels read as a user task or page cluster (e.g. "Getting a Credit Card", "Choosing a Credit Card"), not a bare repeat of the product family.

Return JSON ONLY \u2014 no markdown, no prose (the "themes" array now holds INTENT GROUPS):
{
  "umbrellas": [
    { "name": "Credit Cards", "themes": ["Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card"] },
    { "name": "Mortgages", "themes": ["Getting a Mortgage", "Rates & Calculators", "Refinancing", "Education"] }
  ]
}`;
}
function hierarchicalDiscoveryPrompt(domain, industry, keywords, anchorTree) {
  const kwList = keywords.map((k, i) => {
    const posLabel = k.clientPosition !== null ? `client pos: ${k.clientPosition}` : "client: unranked";
    return `${i}. ${k.keyword} | ${posLabel} | ${k.searchVolume.toLocaleString()}/mo`;
  }).join("\n");
  const brandHint = domain.replace(/\.(com|net|org|io|co).*$/, "").replace(/[-_]/g, " ");
  const anchorBlock = anchorTree && anchorTree.trim().length > 0 ? `
CANONICAL TAXONOMY \u2014 the tree already established for this website. You MUST file every keyword INTO this tree, reusing these labels EXACTLY as spelled (umbrella and theme levels):
${anchorTree.trim()}

NEVER introduce a new umbrella or a new theme (the top two levels) \u2014 every keyword MUST be filed under one of the umbrella > theme pairs above whose search intent it matches (v7.531, Const III.1e v0.31: the established categories are the boundary). If a keyword's intent matches none of them, use the path ["Other"] \u2014 never a new top-level or theme node, and never a node that means the same as an existing one ("Wills" goes inside the existing "Estate Planning > Wills & Trusts").

CRITICAL \u2014 THE ANCHOR FIXES ONLY THE TOP TWO LEVELS. You MUST still go DEEPER: place every keyword in its MOST-SPECIFIC sub-topic BENEATH the anchored theme (rule 3 applies in full), creating sub-topic nodes as the keywords warrant. "mortgage calculator" \u2192 [..., "Mortgages & Refinancing", "Mortgage Calculators"]; "fha loan" \u2192 [..., "Mortgages & Refinancing", "FHA Loans"]; "refinance rates" \u2192 [..., "Mortgages & Refinancing", "Refinancing", "Refinance Rates"]. A path that STOPS at the theme is correct ONLY when the keyword IS the theme's own generic head term (e.g. "mortgage", "mortgages") \u2014 parking specific keywords at the theme level flattens the tree and is a failure (v7.341).
` : "";
  return `You are organizing a website's organic search keywords into a clean, multi-level SEO content taxonomy \u2014 a tree of pages.

WEBSITE: ${domain}
INDUSTRY: ${industry}
BRAND NAME HINT: "${brandHint}" (use to detect branded keywords)
${anchorBlock}
KEYWORDS (index. keyword | client ranking | monthly search volume):
${kwList}

For EACH keyword, return the full INTENT-FIRST topic PATH it belongs to, the INTENT FAMILY (the user's task), the MODIFIER pulled out of it, its search INTENT, a CONFIDENCE score, and a one-line REASONING. Each path node is a page.

THE PATH IS INTENT-FIRST \u2014 [PRODUCT FAMILY, INTENT GROUP, LEAF] (Const III.9\u2013III.11):
   \u2022 Level 1 = PRODUCT FAMILY (WHAT it's about): "Credit Cards", "Mortgages", \u2026
   \u2022 Level 2 = INTENT GROUP (WHY \u2014 the user's TASK / page cluster): "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card", "Support". This is decided by INTENT, never by a shared product word.
   \u2022 Level 3+ = LEAF (the specific same-page group): "Application", "Requirements", "Rewards", "APR", "Interest Calculator".

RULES \u2014 follow exactly:
1. INTENT decides architecture, never shared words. "apply for a credit card" and "credit card application" are the SAME page \u2192 same leaf under "Getting a Credit Card". "compare credit cards" is a DIFFERENT page \u2192 "Choosing a Credit Card". "what is apr" is a DIFFERENT page \u2192 "Education". They all share the word "credit card" but sit in different intent groups because Google ranks different pages for each task.
2. A QUALIFIER THAT CHANGES THE USER'S TASK IS A NODE, NOT A MODIFIER (Const III.1c, revised). THE TEST: does this term change the page Google would rank? If YES it is a node (an intent group or leaf), NOT a modifier.
   \u2022 KEEP as nodes (task-changing \u2014 each is its own page): apply / application, requirements, eligibility, pre-approval, compare, reviews, vs, alternatives, benefits, how it works, calculator, rates, redeem, cash advance, annual fee, and product-defining facets "no annual fee", "0 APR" / "intro APR", "balance transfer", "cash back", "rewards", "travel", "secured", "student", "business", "for bad credit", "30-year", "15-year", "VA".
   \u2022 Strip as modifiers ONLY purely linguistic adjectives that do NOT change the page: best, top, cheap, good, easy, near me, online, a year like "2025". Even these stay in "modifier" (never dropped from the record) and never become a node.
   CRITICAL \u2014 two-sided failure: over-stripping a task-changing qualifier flattens the tree (FAIL); minting a look-alike leaf for the SAME page over-splits it (FAIL, fixed by rule 2b). "apply for a credit card" \u2192 path ["Credit Cards","Getting a Credit Card","Application"], modifier "". "best travel credit cards" \u2192 path ["Credit Cards","Credit Card Types","Travel"], modifier "best". "credit card interest calculator" \u2192 path ["Credit Cards","Using a Credit Card","Interest Calculator"], modifier "". If there is no linguistic adjective, modifier is "".
2b. THE LEAF IS A SAME-MEANING GROUP \u2014 SAME NEED = SAME LEAF, DIFFERENT NEED = SIBLING LEAF. Keywords one page would satisfy identically share ONE leaf: "apr", "what is an apr", "meaning of apr", "how do aprs work" all express the SAME definitional need \u2192 one leaf ["Credit Cards","Education","APR"]. "apr rates" and "best apr rates" express a DIFFERENT (rate-shopping) need \u2192 a SIBLING leaf ["Credit Cards","Education","APR Rates"] (with "best" as a modifier inside it). A definitional/educational need and a commercial/comparison/rate need are DIFFERENT pages even when they share the head term \u2014 NEVER mix them in one leaf, and never scatter same-meaning phrasings ("what is X" / "X meaning" / "X definition" / bare "X") across different nodes.
3. Path shape: [product family, INTENT GROUP, leaf, \u2026]. Go only as deep as the keyword's specificity warrants (a head term like "credit card application" stops at ["Credit Cards","Getting a Credit Card","Application"]; a bare product head like "credit cards" sits at ["Credit Cards"]). Unlimited depth allowed; do NOT pad with filler levels. NEVER PARK a specific keyword at a broad node: if the keyword names a specific task/variant/definition/rate/calculator, it belongs in a leaf under its intent group \u2014 create that leaf. A keyword sits AT a node only when it IS that node's own generic head term.
4. Level 1 is the broad product/service family (e.g. "Mortgages", "Credit Cards", "Investing"). DISTINCT PRODUCTS ARE DISTINCT LEVEL-1 FAMILIES \u2014 never merge two separate products into one umbrella: "Checking Accounts" and "Savings Accounts" are SEPARATE families, NOT "Checking & Savings Accounts". Level 2 sibling INTENT GROUPS share the family (e.g. "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card" all under "Credit Cards"). A product variant is a LEAF under an intent group ("Rewards" under "Credit Card Types"), never a level-2 sibling of the intent groups.
5. MOST-SPECIFIC, COMMERCIALLY-USEFUL placement. If a keyword could fit more than one place, pick the most specific page-useful node. Parent/child is decided by MEANING, never overlap \u2014 a specific product is never nested under a different specific product. Routing: generic "construction loan" is NOT defaulted under Personal Loans; "home construction loan" \u2192 home/mortgage lending; "business construction loan" \u2192 business lending.
6. type: "procedure" (a real service/product topic), "brand" (the keyword names a company/retailer/store/issuer brand), or "location" (brand/service + a place). ANY third-party brand \u2014 including a co-branded product like "nordstrom card", "amazon store card", "costco visa" \u2014 MUST be type "brand", NEVER "procedure", with path ["<Brand> Brand Searches"]. The client's OWN brand also uses "<Client> Brand Searches". Never put a third-party brand inside a product/procedure umbrella, and never name a procedure path after a non-client brand.
7. intent: one of "informational", "commercial", "transactional", "navigational" \u2014 the searcher's intent.
7b. intentFamily: the user's dominant TASK \u2014 EXACTLY ONE of: learn, definition, education, how-it-works, benefits, faqs, comparison, selection, reviews, alternatives, use-cases, qualification, application, purchase, requirements, eligibility, rates, calculator, management, optimization, support, troubleshooting, maintenance, redemption, merchant-acceptance. This sets the funnel stage (assigned deterministically in code \u2014 do NOT return a stage). It must be consistent with the level-2 intent group (e.g. "Getting a Credit Card" \u2192 application/requirements/eligibility; "Education" \u2192 definition/how-it-works; "Using a Credit Card" \u2192 management/redemption/support). For a brand/location keyword use "learn".
8. confidence: an integer 0\u2013100 = how sure you are of THIS placement. Be honest; a vague or cross-cutting keyword scores low. Below 80 means "needs human review" (still give your best path).
9. reasoning: one short clause explaining the placement (\u2264 12 words).
10. Reuse identical label spellings across keywords so the same node merges. Every index appears exactly once.

Return JSON ONLY \u2014 no markdown, no prose:
{
  "assignments": [
    { "index": 0, "path": ["Credit Cards","Getting a Credit Card","Application"], "modifier": "", "type": "procedure", "intent": "transactional", "intentFamily": "application", "confidence": 95, "reasoning": "'apply' names the getting task" },
    { "index": 1, "path": ["Credit Cards","Credit Card Types","Travel"], "modifier": "best", "type": "procedure", "intent": "commercial", "intentFamily": "selection", "confidence": 92, "reasoning": "travel card type, 'best' is a modifier" },
    { "index": 2, "path": ["Credit Cards","Education","APR"], "modifier": "", "type": "procedure", "intent": "informational", "intentFamily": "definition", "confidence": 90, "reasoning": "definitional APR query" },
    { "index": 3, "path": ["${brandHint} Brand Searches"], "modifier": "", "type": "brand", "intent": "navigational", "intentFamily": "learn", "confidence": 98, "reasoning": "client brand term" }
  ]
}`;
}
function pathCanonicalizationPrompt(domain, industry, paths, establishedNodes) {
  const list = paths.map((p, i) => `${i}. ${p.join(" > ")}`).join("\n");
  const establishedBlock = establishedNodes && establishedNodes.length > 0 ? `
ESTABLISHED CANONICAL NODES (from already-processed slices of this same taxonomy \u2014 map equivalent concepts onto these EXACT labels and chains instead of inventing parallel ones):
${establishedNodes.map((n) => `- ${n}`).join("\n")}
` : "";
  return `You are consolidating a multi-level SEO taxonomy for a ${industry} website (${domain}). The paths below were produced by independent passes over different keyword slices, so the SAME concept may appear under different labels, at different depths, or in different places in the tree.
${establishedBlock}
PATHS (index. umbrella > theme > \u2026):
${list}

For each path, return its CANONICAL form so every concept ends up in EXACTLY ONE place in the tree.

RULES \u2014 follow exactly:
1. ONE CONCEPT, ONE NODE. Merge labels that mean the same thing to ONE spelling at each level ("30 Year Fixed" / "30-yr fixed" / "30 year fixed rate" \u2192 one). Keep the clearest, most natural label.
2. RE-PARENT SUBSUMED CONCEPTS. If one path's concept is the same as \u2014 or a strict subtype of \u2014 a concept that lives elsewhere in this list (or in the established nodes), move it INTO that node's chain. "Wills" alone \u2192 ["Estate Planning","Wills & Trusts"] when that node exists; "Living Trusts" \u2192 a child of ["Estate Planning","Wills & Trusts"], never a new umbrella. Two umbrellas must never remain where one contains the other or they mean the same thing.
3. AGGRESSIVELY merge near-duplicates that are the SAME concept differing only by: spacing/compounding ("Cash Back" = "Cashback"), plural/singular ("Card" = "Cards"), word order, OR a redundant trailing/leading category word ("Balance Transfer" = "Balance Transfer Credit Cards" = "Balance Transfer Cards" when the parent is already "Credit Cards"). Pick ONE clean label (drop the redundant parent word). These MUST collapse to one node \u2014 leaving them separate is the failure this pass exists to prevent.
4. Do NOT append the parent's name into a child label. A child of "Credit Cards" is "No Annual Fee", NOT "No Annual Fee Credit Cards".
5. Keep genuinely distinct nodes separate. Do NOT merge a specific topic into an unrelated sibling (e.g. "Secured" \u2260 "Unsecured"; "Cash Back" \u2260 "Cash Advances") \u2014 subsumption (rule 2) requires a real subtype relationship, not surface similarity.
6. Every input index must appear exactly once with a canonical path (return the same path if it needs no change).

Return JSON ONLY \u2014 no markdown, no prose:
{
  "canonical": [
    { "index": 0, "path": ["Mortgages","Mortgage Rates","30-yr fixed"] },
    { "index": 1, "path": ["Estate Planning","Wills & Trusts"] }
  ]
}`;
}
function siblingAuditPrompt(domain, industry, groups) {
  const list = groups.map((g, i) => `${i}. PARENT: ${g.parent}
   CHILDREN: ${g.children.join(" | ")}`).join("\n");
  return `You are auditing a ${industry} website's (${domain}) SEO taxonomy for duplicate SIBLING nodes. Each group below is one parent node and ALL of its direct children.

GROUPS (index. parent, then its children):
${list}

Find children within the SAME group that are the SAME concept or where one is a strict subtype of another \u2014 those must merge into ONE node.

RULES \u2014 follow exactly:
1. Merge two siblings when they mean the same thing for this site's users ("Loan Interest Rates" = "Mortgage Rates" under a mortgage parent; "Cash Back" = "Cashback") \u2014 keep the clearer, more conventional label as "to".
2. Merge a sibling INTO another when it is a strict subtype ("30 Year Fixed Rates" into "Mortgage Rates" only if "Mortgage Rates" has no better sub-structure \u2014 prefer keeping genuine subtypes as separate nodes; only merge REAL duplicates).
3. Do NOT merge genuinely distinct siblings ("Secured" \u2260 "Unsecured"; "Refinancing" \u2260 "First-Time Buyer"; "FHA Loans" \u2260 "VA Loans"). When in doubt, do not merge.
4. Only report groups that need changes. "from" and "to" must both be children of that group's parent, spelled exactly as listed, and different from each other.

Return JSON ONLY \u2014 no markdown, no prose:
{
  "merges": [
    { "group": 0, "from": "Loan Interest Rates", "to": "Mortgage Rates" }
  ]
}`;
}
function personaPrompt(domain, industry, semrush, serp) {
  const topKws = semrush.topKeywords.map((k) => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join("\n- ");
  const gapKws = semrush.gapKeywords.map((k) => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join("\n- ");
  const paa = serp.keywords.flatMap((k) => k.paaQuestions).slice(0, 25).join("\n- ");
  return `You are a senior audience strategist building deep-dive segment profiles from real organic search data.

WEBSITE: ${domain}
INDUSTRY: ${industry}

\u2500\u2500 REAL SEARCH DATA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

TOP ORGANIC KEYWORDS (client currently ranks for these):
- ${topKws}

GAP KEYWORDS (competitors rank, client does not):
- ${gapKws}

PEOPLE ALSO ASK QUESTIONS (live SERP data):
- ${paa}

\u2500\u2500 YOUR TASK \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

From this real search behavior, identify 2-3 distinct audience segments. Each segment represents a meaningfully different type of person with a different motivation, timeline, and decision journey.

For each segment, generate a full deep-dive profile. Return a JSON array of objects with EXACTLY this structure:

[
  {
    "id": "segment-a",
    "name": "The [Memorable Archetype Name]",
    "tagline": "A first-person quote that captures this segment's core mindset and urgency \u2014 1-2 sentences as if the person is speaking",
    "volumePct": 40,
    "whoTheyAre": {
      "demographics": "Age range, life stage, financial/professional situation, how they make decisions, typical purchase timeline",
      "trigger": "The specific life event or situation that triggers their search journey \u2014 be precise",
      "influencerRole": "Who else influences or gates their decision (partner, advisor, adult child, colleague) \u2014 omit if not applicable"
    },
    "preLLMPrompts": [
      "life-problem prompt they use BEFORE they think of the product (5-6 prompts that signal intent upstream)"
    ],
    "productPrompts": [
      "direct product or solution search they use once they know what they want (4-5 prompts)"
    ],
    "touchpoints": [
      { "stage": "Stage 1 \u2014 AI / LLM", "description": "How and why they start in an AI chat tool, what they ask, what content must be there to intercept them" },
      { "stage": "Stage 2 \u2014 Google Search", "description": "What they search on Google after LLM, which query types, what they need to find" },
      { "stage": "Stage 3 \u2014 Website", "description": "What they do on the client website \u2014 which pages, tools, CTAs matter most" },
      { "stage": "Stage 4 \u2014 Conversion", "description": "How they convert \u2014 call, form, chat, walk-in \u2014 and what triggers the final decision" }
    ],
    "messagingAndTone": "3-4 specific messaging directions for this segment: what to lead with, what tone to use, what to avoid, which objections to address first",
    "creativeDirection": "3-4 specific creative and imagery directions: what scenes/moments to show, what to avoid, any specific ad formats or content types that will resonate",
    "channelApproach": "3-4 specific channel recommendations: which paid/organic/social channels, why, and what content type works on each for this segment"
  }
]

RULES:
- volumePct values must sum to 100 across all segments
- All prompts must feel like real search queries or LLM inputs, not descriptions
- Messaging, creative, and channel sections must be specific and actionable \u2014 not generic
- Base everything on the actual keyword and PAA data provided \u2014 no generic industry assumptions
- CONCISENESS: demographics 2 sentences max \xB7 trigger 1 sentence \xB7 influencerRole 1 sentence \xB7 touchpoint descriptions 2 sentences max \xB7 messagingAndTone/creativeDirection/channelApproach 3-4 bullet-style points as a single string separated by newlines
- No markdown, no explanation \u2014 pure JSON array only`;
}
var NO_POSITION_DIST = "not available (this analysis carries no ranking footprint)";
function distJson(d) {
  return d && typeof d === "object" && Object.keys(d).length > 0 ? JSON.stringify(d) : NO_POSITION_DIST;
}
function distBand(d, band) {
  return d && typeof d === "object" ? d[band] ?? 0 : 0;
}
function opportunityPrompt(domain, industry, semrush, serp, profound) {
  const positionDist = distJson(semrush.positionDist);
  const topComp = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? "unknown competitor";
  const gapKeywords = semrush.gapKeywords.map((k) => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join(", ");
  const aioStats = serp.aioSummary;
  return `You are a senior SEO and GEO strategist building a CMO-level opportunity brief.

WEBSITE: ${domain}
INDUSTRY: ${industry}

\u2500\u2500 REAL DATA INPUTS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

SEMRUSH DATA (live):
- Total organic keywords: ${semrush.overview.organicKeywords.toLocaleString()}
- Organic traffic: ${semrush.overview.organicTraffic.toLocaleString()} visits/mo
- Position distribution: ${positionDist}
- Top competitor: ${topComp} (${semrush.competitors[0]?.commonKeywords ?? 0} shared keywords)
- Gap keywords (competitor ranks, client doesn't): ${gapKeywords}

SERPAPI DATA (live SERP snapshots):
- AI Overview coverage rate: ${Math.round(aioStats.aioRate * 100)}% of queried keywords show AIO
- Client AIO acquisition rate: ${Math.round(aioStats.clientAIORate * 100)}% of AIOs cite client
- Keywords queried: ${aioStats.total}

${llmProbeContext(profound)}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Identify the TOP 3 highest-impact organic growth opportunities specific to this website.

Each opportunity must:
1. Be grounded in the real data above (cite the specific metric)
2. Be actionable \u2014 a strategy a CMO could greenlight
3. Span SEO, GEO (LLM visibility), Content, or Competitive categories

For each opportunity return a JSON object:
{
  "category": "SEO | GEO | Content | Technical | Competitive",
  "title": "Short, punchy opportunity title (e.g. 'Claim the Unranked Decision Layer')",
  "summary": "2-3 sentences: what the gap is, why it matters, what to do",
  "impactScore": 8.5,   // 0-10 (based on volume + strategic importance)
  "effortScore": 4.0,   // 0-10 (lower = easier to execute)
  "estimatedVisits": 12000,  // estimated incremental visits/mo if captured
  "estimatedLeads": 240,     // estimated leads/mo (use industry conversion benchmarks)
  "evidence": [
    { "metric": "9%", "label": "Current market capture rate", "source": "Semrush Domain Overview" },
    { "metric": "47%", "label": "AIO coverage on target keywords", "source": "SerpAPI AIO scan" },
    { "metric": "2%", "label": "Client AIO acquisition rate", "source": "SerpAPI AIO scan" },
    { "metric": "31/100", "label": "LLM visibility score", "source": "Profound API" }
  ],
  "rank": 1  // 1 = highest priority
}

Return a JSON array of exactly 3 opportunity objects, ranked 1-3. No markdown, pure JSON only.`;
}
function narrativePrompt(domain, clientName, industry, semrush, serp, profound, personas2, opportunities2, categoryBreakdown) {
  const captureRate = categoryBreakdown.page1CaptureRate > 0 ? categoryBreakdown.page1CaptureRate : semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic));
  const totalCategory = categoryBreakdown.totalMonthlyDemand > 0 ? categoryBreakdown.totalMonthlyDemand : semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic);
  const topComp = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? "the market leader";
  const aioRate = Math.round(serp.aioSummary.aioRate * 100);
  const clientAIORate = Math.round(serp.aioSummary.clientAIORate * 100);
  return `You are a senior growth strategist writing an executive narrative for a CMO at ${clientName}.

This is NOT a data report. This is a strategic story that answers:
"Where is organic demand going in our market, and why aren't we capturing it?"

The tone is: direct, confident, data-backed, CMO-appropriate.
No bullet-point summaries. Write in sharp, declarative paragraphs.

STRICT DATA RULES \u2014 apply to every section without exception:
1. Only cite numbers that appear verbatim in the VERIFIED DATA section below. Do not calculate, derive, or estimate any other numbers.
2. Never mention "visits", "traffic", "sessions", "pageviews", or "monthly visitors" for any party \u2014 client or competitor. This data is not verified.
3. Use "search demand" or "searches" instead of "visits" when referring to volume.
4. The page 1 capture rate is ${Math.round(captureRate * 100)}% \u2014 use only this figure, never a different percentage.

\u2500\u2500 VERIFIED DATA (cite these exact numbers \u2014 do not invent or round differently) \u2500\u2500

Market position:
- Page 1 capture rate: ${Math.round(captureRate * 100)}% (keyword demand analysis \u2014 use THIS number, not any other)
- Total category search demand: ~${totalCategory.toLocaleString()} searches/mo (keyword-level analysis)
- Top competitor: ${topComp} (${semrush.competitors[0]?.commonKeywords ?? 0} keywords overlap with ${clientName})
- ${semrush.competitors.length} competitors identified in this category

Keyword footprint:
- Total organic keywords: ${semrush.overview.organicKeywords.toLocaleString()} (Semrush)
- Keywords ranking page 1 (positions 1\u201310): ${semrush.topKeywords.filter((k) => k.position <= 10).length}
- Keywords ranking page 2+ (positions 11+): ${semrush.topKeywords.filter((k) => k.position > 10).length}
- Position distribution: ${distJson(semrush.positionDist)} (Semrush)

AI search landscape:
- ${aioRate}% of tracked keywords trigger AI Overviews (SerpAPI live data)
- ${clientName} appears in ${clientAIORate}% of those AI Overviews

${llmProbeContext(profound)}

Top opportunities: ${opportunities2.map((o) => o.title).join(", ")}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Write the following narrative sections:

1. MARKET POSITION NARRATIVE (150 words)
   Open with the page 1 capture rate as the story hook. Make it visceral \u2014 the search demand exists, the question is who captures it.

2. THE VISIBILITY GAP (100 words)
   Translate the position distribution into business impact. What does it mean to have ${distBand(semrush.positionDist, "11-20")} keywords on page 2? Revenue language, not SEO metrics.

3. THE AI SEARCH MOMENT (2 sentences, 40 words max)
   Be blunt. State the AIO exposure rate and the client's citation rate, then name the business consequence in one sentence. No fluff.

4. COMPETITIVE REALITY (100 words)
   Frame it as: here's the keyword territory already contested, here's what's still unclaimed. Do NOT mention competitor traffic or visit counts \u2014 use keyword overlap and market capture rate only.

5. THE STRATEGIC CALL (80 words)
   One clear recommendation a CMO can take to the board. No waffling. What's the move?

Return the narrative as a JSON object:
{
  "marketPositionNarrative": "...",
  "visibilityGap": "...",
  "aiSearchMoment": "...",
  "competitiveReality": "...",
  "strategicCall": "..."
}

Pure JSON only. No markdown wrappers.`;
}
function pptPromptGenerator(clientName, domain, industry, narrative, opportunities2, semrush, serp, profound) {
  return `You are creating a structured prompt for the Claude PPTX skill to generate a CMO-level pitch deck.

Generate a detailed PPTX skill prompt for a ${industry} company called "${clientName}" (${domain}).

The prompt should instruct Claude to build a 10-slide deck with:

SLIDE 1 \u2014 Title slide
"${clientName}: Organic Growth Intelligence Brief"
Subtitle: "Where demand is going \u2014 and why we're not capturing it"

SLIDE 2 \u2014 The Market Opportunity
Hero stat: ${Math.round(semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic)) * 100)}% market capture rate
Visual: Large donut chart showing client share vs. total market
Source: Semrush competitive landscape data

SLIDE 3 \u2014 Where Rankings Live Today
Position distribution visualization
Stats: ${distJson(semrush.positionDist)}
Narrative: "${narrative?.visibilityGap?.substring(0, 150) ?? ""}"

SLIDE 4 \u2014 The AI Search Landscape
AI Overview rate: ${Math.round(serp.aioSummary.aioRate * 100)}%
Client AIO rate: ${Math.round(serp.aioSummary.clientAIORate * 100)}%
Visual: Bar comparison of client vs. top competitors in AI citations
Source: SerpAPI live SERP data

SLIDE 5 \u2014 LLM Brand Visibility
${llmProbeContext(profound)}
Source: Live AI Probe (Claude + ChatGPT)

SLIDE 6 \u2014 Opportunity #1
Title: ${opportunities2[0]?.title ?? "Top Opportunity"}
Impact: ${opportunities2[0]?.impactScore ?? 0}/10 | Effort: ${opportunities2[0]?.effortScore ?? 0}/10
Est. upside: +${(opportunities2[0]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities2[0]?.evidence ?? [])}

SLIDE 7 \u2014 Opportunity #2
Title: ${opportunities2[1]?.title ?? "Second Opportunity"}
Impact: ${opportunities2[1]?.impactScore ?? 0}/10 | Effort: ${opportunities2[1]?.effortScore ?? 0}/10
Est. upside: +${(opportunities2[1]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities2[1]?.evidence ?? [])}

SLIDE 8 \u2014 Opportunity #3
Title: ${opportunities2[2]?.title ?? "Third Opportunity"}
Impact: ${opportunities2[2]?.impactScore ?? 0}/10 | Effort: ${opportunities2[2]?.effortScore ?? 0}/10
Est. upside: +${(opportunities2[2]?.estimatedVisits ?? 0).toLocaleString()} visits/mo

SLIDE 9 \u2014 Competitive Landscape
Top competitors by organic presence
SOV comparison vs. ${semrush.competitors.slice(0, 3).map((c) => c.domain).join(", ")}

SLIDE 10 \u2014 The Strategic Call
"${narrative?.strategicCall ?? "Invest in the organic layer that compounds."}"
3 prioritized next steps

DESIGN REQUIREMENTS:
- Color scheme: Dark background (#0A0A0F), electric indigo accents (#6C63FF), white text
- Professional, minimal \u2014 no clip art, no stock icons
- Each slide: one hero number, one supporting visual, one source citation
- Font: Inter or similar clean sans-serif
- Slide dimensions: 16:9 widescreen

Return this as a ready-to-paste prompt for the Claude PPTX skill.`;
}

// lib/category/canonicalize.ts
var MERGE_LOG_CAP = 800;
var KEY_DROP = /* @__PURE__ */ new Set(["the", "and", "a", "an", "of", "for"]);
function singularizeToken(t) {
  if (t.length > 3 && t.charAt(t.length - 1) === "s") {
    const tail2 = t.slice(-2);
    if (tail2 !== "ss" && tail2 !== "us" && tail2 !== "is") {
      if (t.length > 4 && t.slice(-3) === "ies")
        return t.slice(0, -3) + "y";
      return t.slice(0, -1);
    }
  }
  return t;
}
function labelKey(label) {
  const cleaned = String(label ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned)
    return "";
  const rawTokens = cleaned.split(" ");
  const tokens = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (!t || KEY_DROP.has(t))
      continue;
    tokens.push(singularizeToken(t));
  }
  if (tokens.length === 0)
    return cleaned;
  tokens.sort();
  return tokens.join(" ");
}
var pathJoin = (p) => p.join(" \u203A ");
function unifyLabels(rawPaths, weightOfPath) {
  const votes = /* @__PURE__ */ new Map();
  const firstSeen = /* @__PURE__ */ new Map();
  for (let i = 0; i < rawPaths.length; i++) {
    const w = Math.max(1, weightOfPath(rawPaths[i]) || 0);
    for (let d = 0; d < rawPaths[i].length; d++) {
      const label = rawPaths[i][d];
      const key = labelKey(label);
      if (!key)
        continue;
      if (!firstSeen.has(key))
        firstSeen.set(key, label);
      let m = votes.get(key);
      if (!m) {
        m = /* @__PURE__ */ new Map();
        votes.set(key, m);
      }
      m.set(label, (m.get(label) ?? 0) + w);
    }
  }
  const displayOf = /* @__PURE__ */ new Map();
  votes.forEach((m, key) => {
    let best = firstSeen.get(key);
    let bestW = -1;
    m.forEach((w, label) => {
      if (w > bestW) {
        bestW = w;
        best = label;
      }
    });
    displayOf.set(key, best);
  });
  const canonical = [];
  const log = [];
  for (let i = 0; i < rawPaths.length; i++) {
    const out = [];
    for (let d = 0; d < rawPaths[i].length; d++) {
      const label = rawPaths[i][d];
      out.push(displayOf.get(labelKey(label)) ?? label);
    }
    canonical.push(out);
    const fromKey = pathJoin(rawPaths[i]);
    const toKey = pathJoin(out);
    if (fromKey !== toKey)
      log.push({ from: fromKey, to: toKey, kind: "label" });
  }
  return { canonical, log };
}
function classifyMerge(rawPath, canonPath) {
  if (rawPath.length !== canonPath.length)
    return "reparent";
  for (let d = 0; d < rawPath.length; d++) {
    if (labelKey(rawPath[d]) !== labelKey(canonPath[d]))
      return "reparent";
  }
  return "label";
}
function buildSiblingGroups(paths) {
  const byParent = /* @__PURE__ */ new Map();
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    for (let d = 1; d < p.length; d++) {
      const parentPath = p.slice(0, d);
      const key = parentPath.join(" \u203A ");
      let g = byParent.get(key);
      if (!g) {
        g = { parentPath, children: /* @__PURE__ */ new Set() };
        byParent.set(key, g);
      }
      g.children.add(p[d]);
    }
  }
  const out = [];
  byParent.forEach((g, key) => {
    if (g.children.size >= 2)
      out.push({ parent: key, parentPath: g.parentPath, children: Array.from(g.children) });
  });
  out.sort((a, b) => a.parentPath.length - b.parentPath.length || (a.parent < b.parent ? -1 : 1));
  return out;
}
function applySiblingMerges(paths, merges) {
  if (merges.length === 0)
    return { paths, log: [] };
  const out = [];
  const log = [];
  const logged = /* @__PURE__ */ new Set();
  for (let i = 0; i < paths.length; i++) {
    let p = paths[i];
    for (let m = 0; m < merges.length; m++) {
      const mg = merges[m];
      const d = mg.parentPath.length;
      if (p.length <= d || p[d] !== mg.from)
        continue;
      let match = true;
      for (let j = 0; j < d; j++)
        if (p[j] !== mg.parentPath[j]) {
          match = false;
          break;
        }
      if (!match)
        continue;
      const next = p.slice();
      next[d] = mg.to;
      const fromKey = pathJoin(p), toKey = pathJoin(next);
      if (!logged.has(fromKey + "\u2192" + toKey)) {
        logged.add(fromKey + "\u2192" + toKey);
        log.push({ from: fromKey, to: toKey, kind: "reparent" });
      }
      p = next;
    }
    out.push(p);
  }
  return { paths: out, log };
}

// lib/claude/synthesize.ts
function getClient2() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Go to Vercel \u2192 your project \u2192 Settings \u2192 Environment Variables and add it."
    );
  }
  return instrumentAnthropic(new import_sdk3.default({ apiKey }));
}
var MODELS = {
  fast: "claude-haiku-4-5-20251001",
  // Classification, persona draft
  default: "claude-sonnet-4-6",
  // Opportunity analysis, structured output
  deep: "claude-opus-4-6"
  // Reserved — not used (Vercel timeout risk)
};
function extractJSON2(text2) {
  const cleaned = text2.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const match = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (match)
      return JSON.parse(match[0]);
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
}
async function generatePersonas(domain, industry, semrush, serp) {
  const prompt = personaPrompt(domain, industry, semrush, serp);
  const response = await getClient2().messages.create({
    model: MODELS.default,
    // sonnet — deep segment profiles need richer reasoning than haiku
    max_tokens: 5e3,
    // rich 3-segment JSON; needs room (3 segs × ~1200 tokens each)
    messages: [{ role: "user", content: prompt }]
  }, { timeout: 1e5 });
  const text2 = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    return extractJSON2(text2);
  } catch (err) {
    console.error("[OrbitIQ] Audience segment JSON parse failed (non-fatal):", err?.message);
    return [];
  }
}
async function generateOpportunities(domain, industry, semrush, serp, profound) {
  const prompt = opportunityPrompt(domain, industry, semrush, serp, profound);
  const response = await getClient2().messages.create({
    model: MODELS.fast,
    // haiku — fast structured JSON scoring; sonnet was causing timeouts
    max_tokens: 2e3,
    messages: [{ role: "user", content: prompt }]
  }, { timeout: 1e5 });
  const text2 = response.content[0].type === "text" ? response.content[0].text : "";
  return extractJSON2(text2);
}
async function generateNarrative(domain, clientName, industry, semrush, serp, profound, personas2, opportunities2, categoryBreakdown) {
  const prompt = narrativePrompt(
    domain,
    clientName,
    industry,
    semrush,
    serp,
    profound,
    personas2,
    opportunities2,
    categoryBreakdown
  );
  const response = await getClient2().messages.create({
    model: MODELS.default,
    // sonnet — fast enough, opus was causing Vercel timeouts
    max_tokens: 2500,
    messages: [{ role: "user", content: prompt }]
  }, { timeout: 1e5 });
  const text2 = response.content[0].type === "text" ? response.content[0].text : "";
  return extractJSON2(text2);
}
async function generateCategoryBreakdown(domain, industry, semrush, progress, onProgress, priorPaths) {
  const rankedMap = /* @__PURE__ */ new Map();
  for (const kw of semrush.topKeywords) {
    rankedMap.set(kw.keyword.toLowerCase(), kw.position);
  }
  const merged = [];
  for (const kw of semrush.topKeywords) {
    merged.push({
      keyword: kw.keyword,
      searchVolume: kw.searchVolume ?? 0,
      clientPosition: kw.position ?? null
    });
  }
  for (const kw of semrush.gapKeywords) {
    if (!rankedMap.has(kw.keyword.toLowerCase())) {
      merged.push({
        keyword: kw.keyword,
        searchVolume: kw.searchVolume ?? 0,
        clientPosition: null
        // client does not rank for this
      });
    }
  }
  if (merged.length === 0) {
    return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: 0, page1CaptureRate: 0, keywordCategories: {} };
  }
  const OTHER_NAME = "Other";
  const DISCOVERY_BATCH = 25;
  const batches = [];
  for (let i = 0; i < merged.length; i += DISCOVERY_BATCH) {
    batches.push({ start: i, kws: merged.slice(i, i + DISCOVERY_BATCH) });
  }
  const CONCURRENCY = batches.length > 120 ? 12 : 6;
  console.log(`[OrbitIQ] Hierarchical discovery: ${merged.length} keywords in ${batches.length} batch(es), concurrency ${CONCURRENCY}`);
  const SKELETON_SAMPLE = 200;
  let skeleton = null;
  let anchorTreeText = "";
  try {
    const byVol = merged.slice().sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
    const head = byVol.slice(0, Math.min(120, byVol.length));
    const rest = byVol.slice(head.length);
    const step = Math.max(1, Math.floor(rest.length / Math.max(1, SKELETON_SAMPLE - head.length)));
    const sample = head.concat(rest.filter((_, i) => i % step === 0)).slice(0, SKELETON_SAMPLE).map((k) => ({ keyword: k.keyword, searchVolume: k.searchVolume ?? 0 }));
    let priorTree;
    if (priorPaths && priorPaths.length > 0) {
      const seen = /* @__PURE__ */ new Set();
      const lines = [];
      for (const p of priorPaths) {
        const line = p.slice(0, 2).join(" > ");
        if (line && !seen.has(line)) {
          seen.add(line);
          lines.push(line);
        }
        if (lines.length >= 150)
          break;
      }
      priorTree = lines;
    }
    const sResponse = await getClient2().messages.create({
      model: MODELS.fast,
      max_tokens: 4e3,
      messages: [{ role: "user", content: taxonomySkeletonPrompt(domain, industry, sample, priorTree) }]
    }, { timeout: 6e4 });
    const sText = sResponse.content[0].type === "text" ? sResponse.content[0].text : "";
    const sParsed = extractJSON2(sText);
    const umbrellas = (sParsed.umbrellas ?? []).map((u) => ({
      name: String(u?.name ?? "").trim(),
      themes: (Array.isArray(u?.themes) ? u.themes : []).map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 15)
    })).filter((u) => u.name.length > 0).slice(0, 30);
    if (umbrellas.length > 0) {
      skeleton = umbrellas;
      anchorTreeText = umbrellas.map((u) => u.themes.length > 0 ? `${u.name} \u203A ${u.themes.join(" | ")}` : u.name).join("\n");
      console.log(`[OrbitIQ] Taxonomy skeleton: ${umbrellas.length} umbrella(s)${priorTree ? ` (anchored to ${priorTree.length} prior nodes)` : ""}`);
    }
  } catch (err) {
    console.error("[OrbitIQ] Taxonomy skeleton failed (discovery runs unanchored):", err?.message);
  }
  const rawAssigns = (progress?.proposed ?? []).map((p) => ({ index: p.index, path: [...p.path], type: p.type, modifier: p.modifier, intent: p.intent, intentFamily: p.intentFamily, confidence: p.confidence, reasoning: p.reasoning }));
  const doneStarts = new Set(progress?.doneStarts ?? []);
  const cleanPath = (p) => Array.isArray(p) ? p.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  const parseAssignments = (text2) => {
    try {
      const parsed = extractJSON2(text2);
      if (Array.isArray(parsed?.assignments) && parsed.assignments.length > 0)
        return parsed.assignments;
    } catch {
    }
    const out = [];
    const re = /\{[^{}]*?"index"\s*:\s*\d+[^{}]*?"path"\s*:\s*\[[^\]]*\][^{}]*?\}/g;
    const matches = text2.match(re) ?? [];
    for (const m of matches) {
      try {
        out.push(JSON.parse(m));
      } catch {
      }
    }
    return out;
  };
  const runDiscovery = async (batch) => {
    try {
      const bPrompt = hierarchicalDiscoveryPrompt(domain, industry, batch.kws, anchorTreeText);
      const bResponse = await getClient2().messages.create({
        model: MODELS.fast,
        max_tokens: 12e3,
        // v7.235: 25 keywords × (path + modifier + intent + confidence + reasoning), no truncation
        messages: [{ role: "user", content: bPrompt }]
      }, { timeout: 6e4 });
      const bText = bResponse.content[0].type === "text" ? bResponse.content[0].text : "";
      for (const a of parseAssignments(bText)) {
        const li = a?.index;
        if (!Number.isInteger(li) || li < 0 || li >= batch.kws.length)
          continue;
        const path = cleanPath(a?.path);
        if (path.length === 0)
          continue;
        const type = a?.type === "brand" || a?.type === "location" ? a.type : "procedure";
        const conf = Number.isFinite(a?.confidence) ? Math.max(0, Math.min(100, Math.round(a.confidence))) : void 0;
        const modifier = typeof a?.modifier === "string" ? a.modifier.trim().slice(0, 60) : void 0;
        const intent = typeof a?.intent === "string" ? a.intent.trim().toLowerCase().slice(0, 20) : void 0;
        const intentFamily = typeof a?.intentFamily === "string" ? a.intentFamily.trim().toLowerCase().replace(/[_\s]+/g, "-").slice(0, 30) : void 0;
        const reasoning = typeof a?.reasoning === "string" ? a.reasoning.trim().slice(0, 200) : void 0;
        rawAssigns.push({ index: batch.start + li, path, type, modifier, intent, intentFamily, confidence: conf, reasoning });
      }
      doneStarts.add(batch.start);
    } catch (err) {
      console.error("[OrbitIQ] Hierarchical discovery batch failed (keywords \u2192 Other):", err?.message);
    }
  };
  const pendingBatches = batches.filter((b) => !doneStarts.has(b.start));
  if (pendingBatches.length < batches.length) {
    console.log(`[OrbitIQ] Discovery resume: ${batches.length - pendingBatches.length} done, ${pendingBatches.length} remaining`);
  }
  for (let i = 0; i < pendingBatches.length; i += CONCURRENCY) {
    await Promise.all(pendingBatches.slice(i, i + CONCURRENCY).map(runDiscovery));
    if (onProgress && i + CONCURRENCY < pendingBatches.length) {
      await onProgress({ proposed: rawAssigns, doneStarts: Array.from(doneStarts), batchTotal: batches.length });
    }
  }
  const retryBatches = batches.filter((b) => !doneStarts.has(b.start));
  if (retryBatches.length > 0) {
    console.log(`[OrbitIQ] Discovery retry: ${retryBatches.length} failed batch(es)`);
    for (let i = 0; i < retryBatches.length; i += CONCURRENCY) {
      await Promise.all(retryBatches.slice(i, i + CONCURRENCY).map(runDiscovery));
    }
    if (onProgress)
      await onProgress({ proposed: rawAssigns, doneStarts: Array.from(doneStarts), batchTotal: batches.length });
  }
  if (onProgress && pendingBatches.length > 0) {
    await onProgress({ proposed: rawAssigns, doneStarts: Array.from(doneStarts), batchTotal: batches.length, canon: progress?.canon });
  }
  const failedBatchStarts = /* @__PURE__ */ new Set();
  for (const b of batches)
    if (!doneStarts.has(b.start))
      failedBatchStarts.add(b.start);
  if (rawAssigns.length === 0) {
    return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: merged.length, page1CaptureRate: 0, keywordCategories: {}, keywordPaths: {} };
  }
  const pathKey = (p) => pathJoin(p);
  const distinctMap = /* @__PURE__ */ new Map();
  const weightByKey = /* @__PURE__ */ new Map();
  for (const r of rawAssigns) {
    const k = pathKey(r.path);
    if (!distinctMap.has(k))
      distinctMap.set(k, r.path);
    weightByKey.set(k, (weightByKey.get(k) ?? 0) + 1);
  }
  const rawDistinct = Array.from(distinctMap.values());
  const det = unifyLabels(rawDistinct, (p) => weightByKey.get(pathKey(p)) ?? 1);
  const mergeLog = det.log.slice();
  const detByRawKey = /* @__PURE__ */ new Map();
  for (let i = 0; i < rawDistinct.length; i++)
    detByRawKey.set(pathKey(rawDistinct[i]), det.canonical[i]);
  const postDetMap = /* @__PURE__ */ new Map();
  for (const p of det.canonical)
    if (!postDetMap.has(pathKey(p)))
      postDetMap.set(pathKey(p), p);
  const postDetPaths = Array.from(postDetMap.values());
  if (det.log.length > 0) {
    console.log(`[OrbitIQ] Deterministic canonicalization: ${rawDistinct.length} \u2192 ${postDetPaths.length} distinct paths (${det.log.length} label merges)`);
  }
  const CANON_CHUNK = 150;
  const llmByDetKey = /* @__PURE__ */ new Map();
  if (postDetPaths.length > 1) {
    const sorted = postDetPaths.slice().sort((a, b) => pathKey(a) < pathKey(b) ? -1 : 1);
    const canonTotal = Math.ceil(sorted.length / CANON_CHUNK);
    const canonState = progress?.canon;
    const chunksDone = new Set(canonState?.chunksDone ?? []);
    for (const [k, v] of canonState?.mappings ?? [])
      llmByDetKey.set(k, [...v]);
    const established = [...canonState?.established ?? []];
    const establishedSeen = new Set(established);
    const noteEstablished = (cp) => {
      const line = cp.slice(0, 2).join(" > ");
      if (line && !establishedSeen.has(line)) {
        establishedSeen.add(line);
        established.push(line);
      }
    };
    const parseCanon = (text2) => {
      try {
        const parsed = extractJSON2(text2);
        if (Array.isArray(parsed?.canonical) && parsed.canonical.length > 0)
          return parsed.canonical;
      } catch {
      }
      const out = [];
      const re = /\{[^{}]*?"index"\s*:\s*\d+[^{}]*?"path"\s*:\s*\[[^\]]*\][^{}]*?\}/g;
      for (const m of text2.match(re) ?? []) {
        try {
          out.push(JSON.parse(m));
        } catch {
        }
      }
      return out;
    };
    const persistCanon = async () => {
      if (!onProgress)
        return;
      await onProgress({
        proposed: rawAssigns,
        doneStarts: Array.from(doneStarts),
        batchTotal: batches.length,
        canon: {
          total: canonTotal,
          chunksDone: Array.from(chunksDone),
          mappings: Array.from(llmByDetKey.entries()),
          established
        }
      });
    };
    for (let c = 0; c < sorted.length; c += CANON_CHUNK) {
      if (chunksDone.has(c))
        continue;
      const chunk = sorted.slice(c, c + CANON_CHUNK);
      try {
        const cPrompt = pathCanonicalizationPrompt(domain, industry, chunk, established.slice(0, 250));
        const cResponse = await getClient2().messages.create({
          model: MODELS.fast,
          max_tokens: 12e3,
          messages: [{ role: "user", content: cPrompt }]
        }, { timeout: 6e4 });
        const cText = cResponse.content[0].type === "text" ? cResponse.content[0].text : "";
        for (const cc of parseCanon(cText)) {
          const idx = cc?.index;
          if (!Number.isInteger(idx) || idx < 0 || idx >= chunk.length)
            continue;
          const cp = cleanPath(cc?.path);
          if (cp.length) {
            llmByDetKey.set(pathKey(chunk[idx]), cp);
            noteEstablished(cp);
          }
        }
      } catch (err) {
        console.error("[OrbitIQ] Canonicalization chunk failed (deterministic paths kept, marked done):", err?.message);
        for (const p of chunk)
          noteEstablished(p);
      }
      chunksDone.add(c);
      await persistCanon();
    }
    console.log(`[OrbitIQ] Path canonicalization: ${postDetPaths.length} distinct paths in ${canonTotal} chunk(s), ${chunksDone.size} done`);
  }
  const canonByRawKey = /* @__PURE__ */ new Map();
  const loggedKeys = /* @__PURE__ */ new Set();
  for (const e of mergeLog)
    loggedKeys.add(e.from + "\u2192" + e.to);
  for (const [rawKey, rawPath] of Array.from(distinctMap.entries())) {
    const detPath = detByRawKey.get(rawKey) ?? rawPath;
    const finalPath = llmByDetKey.get(pathKey(detPath)) ?? detPath;
    canonByRawKey.set(rawKey, finalPath);
    const fromKey = pathKey(detPath), toKey = pathKey(finalPath);
    if (fromKey !== toKey && !loggedKeys.has(fromKey + "\u2192" + toKey)) {
      loggedKeys.add(fromKey + "\u2192" + toKey);
      mergeLog.push({ from: fromKey, to: toKey, kind: classifyMerge(detPath, finalPath) });
    }
  }
  try {
    const canonKeys = Array.from(canonByRawKey.keys());
    const distinctCanon = /* @__PURE__ */ new Map();
    for (const k of canonKeys) {
      const p = canonByRawKey.get(k);
      const pk = pathKey(p);
      if (!distinctCanon.has(pk))
        distinctCanon.set(pk, p);
    }
    const groups = buildSiblingGroups(Array.from(distinctCanon.values())).filter((g) => g.parentPath[0] !== OTHER_NAME);
    const GROUP_CHUNK = 200;
    const merges = [];
    for (let c = 0; c < groups.length; c += GROUP_CHUNK) {
      const gChunk = groups.slice(c, c + GROUP_CHUNK);
      const sPrompt = siblingAuditPrompt(domain, industry, gChunk.map((g) => ({ parent: g.parent, children: g.children })));
      const sResponse = await getClient2().messages.create({
        model: MODELS.fast,
        max_tokens: 4e3,
        messages: [{ role: "user", content: sPrompt }]
      }, { timeout: 6e4 });
      const sText = sResponse.content[0].type === "text" ? sResponse.content[0].text : "";
      const sParsed = extractJSON2(sText);
      for (const m of sParsed.merges ?? []) {
        const gi = m?.group;
        if (!Number.isInteger(gi) || gi < 0 || gi >= gChunk.length)
          continue;
        const g = gChunk[gi];
        const from = String(m?.from ?? "").trim();
        const to = String(m?.to ?? "").trim();
        if (!from || !to || from === to)
          continue;
        if (g.children.indexOf(from) < 0 || g.children.indexOf(to) < 0)
          continue;
        merges.push({ parentPath: g.parentPath, from, to });
      }
    }
    if (merges.length > 0) {
      for (const [rawKey, p] of Array.from(canonByRawKey.entries())) {
        const applied = applySiblingMerges([p], merges);
        canonByRawKey.set(rawKey, applied.paths[0]);
        for (const e of applied.log) {
          if (!loggedKeys.has(e.from + "\u2192" + e.to)) {
            loggedKeys.add(e.from + "\u2192" + e.to);
            mergeLog.push(e);
          }
        }
      }
      console.log(`[OrbitIQ] Sibling audit: ${merges.length} sibling merge(s) applied across ${groups.length} group(s)`);
    } else {
      console.log(`[OrbitIQ] Sibling audit: ${groups.length} group(s) reviewed, no duplicates found`);
    }
  } catch (err) {
    console.error("[OrbitIQ] Sibling audit failed (skipped):", err?.message);
  }
  const pathByIndex = /* @__PURE__ */ new Map();
  const typeByIndex = /* @__PURE__ */ new Map();
  const metaByIndex = /* @__PURE__ */ new Map();
  for (const r of rawAssigns) {
    if (!merged[r.index] || pathByIndex.has(r.index))
      continue;
    pathByIndex.set(r.index, canonByRawKey.get(pathKey(r.path)) ?? r.path);
    typeByIndex.set(r.index, r.type);
    metaByIndex.set(r.index, { modifier: r.modifier, intent: r.intent, intentFamily: r.intentFamily, confidence: r.confidence, reasoning: r.reasoning });
  }
  for (let i = 0; i < merged.length; i++) {
    if (!pathByIndex.has(i)) {
      pathByIndex.set(i, [OTHER_NAME]);
      typeByIndex.set(i, "procedure");
      metaByIndex.set(i, { confidence: 0, reasoning: "not placed by discovery \u2014 auto-filed to Other, needs review" });
    }
  }
  {
    const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.(com|net|org|io|co|us|ca)$/;
    let overridden = 0;
    for (let i = 0; i < merged.length; i++) {
      const kwLow = (merged[i]?.keyword ?? "").toLowerCase().trim();
      if (!DOMAIN_RE.test(kwLow))
        continue;
      const stem = kwLow.replace(/\.(com|net|org|io|co|us|ca)$/, "");
      const label = stem.charAt(0).toUpperCase() + stem.slice(1) + " Brand Searches";
      pathByIndex.set(i, [label]);
      typeByIndex.set(i, "brand");
      metaByIndex.set(i, { intent: "navigational", confidence: 100, reasoning: "bare domain name \u2014 deterministic brand rule (v7.342)" });
      overridden++;
    }
    if (overridden > 0)
      console.log(`[OrbitIQ] Domain-brand rule: ${overridden} bare-domain keyword(s) typed as brand searches`);
  }
  {
    const shallow = /* @__PURE__ */ new Map();
    for (const pa of Array.from(pathByIndex.values())) {
      if (!Array.isArray(pa) || pa.length === 0)
        continue;
      let lm = shallow.get(pa[0]);
      if (!lm) {
        lm = /* @__PURE__ */ new Map();
        shallow.set(pa[0], lm);
      }
      for (let d = 1; d < pa.length; d++) {
        const l = String(pa[d]);
        const cur = lm.get(l);
        if (cur == null || d < cur)
          lm.set(l, d);
      }
    }
    let collapsed = 0;
    for (const [idx, pa] of Array.from(pathByIndex.entries())) {
      if (!Array.isArray(pa) || pa.length === 0)
        continue;
      const lm = shallow.get(pa[0]);
      if (!lm)
        continue;
      let out = pa.slice();
      let changed = false;
      for (let d = out.length - 1; d >= 1; d--) {
        const l = String(out[d]);
        const min = lm.get(l);
        if (min != null && d > min) {
          out = [...out.slice(0, min), l, ...out.slice(d + 1)];
          changed = true;
        }
      }
      if (changed) {
        pathByIndex.set(idx, out);
        collapsed++;
      }
    }
    if (collapsed > 0)
      console.log(`[OrbitIQ] Same-label collapse (III.1e): hoisted ${collapsed} path(s) so no label repeats at two depths within an umbrella`);
  }
  const keywordPaths = {};
  const keywordMeta = {};
  const assignmentByIndex = /* @__PURE__ */ new Map();
  const catTypeByName = /* @__PURE__ */ new Map();
  const umbrellaByCat = /* @__PURE__ */ new Map();
  const clientKwByUmbrella = /* @__PURE__ */ new Map();
  const navUmbrellas = /* @__PURE__ */ new Set();
  for (let i = 0; i < merged.length; i++) {
    const kw = merged[i];
    if (!kw)
      continue;
    const P = pathByIndex.get(i);
    const type = typeByIndex.get(i);
    keywordPaths[kw.keyword.toLowerCase()] = P;
    const m = metaByIndex.get(i);
    if (m && (m.modifier || m.intent || m.intentFamily || m.confidence != null || m.reasoning)) {
      const entry = {};
      if (m.modifier)
        entry.modifier = m.modifier;
      if (m.intent)
        entry.intent = m.intent;
      if (m.intentFamily) {
        entry.intentFamily = m.intentFamily;
        entry.funnelStage = funnelStageForFamily(m.intentFamily);
      }
      if (m.confidence != null) {
        entry.confidence = m.confidence;
        entry.needsReview = m.confidence < 80;
      }
      if (m.reasoning)
        entry.reasoning = m.reasoning;
      keywordMeta[kw.keyword.toLowerCase()] = entry;
    }
    const umbrella = P[0];
    const cat = type === "procedure" && P.length >= 2 ? P[1] : P[0];
    assignmentByIndex.set(i, cat);
    if (!catTypeByName.has(cat))
      catTypeByName.set(cat, type);
    if (!umbrellaByCat.has(cat))
      umbrellaByCat.set(cat, umbrella);
    if (umbrella) {
      if (!clientKwByUmbrella.has(umbrella))
        clientKwByUmbrella.set(umbrella, 0);
      if (kw.clientPosition !== null)
        clientKwByUmbrella.set(umbrella, clientKwByUmbrella.get(umbrella) + 1);
      if (type === "brand" || type === "location")
        navUmbrellas.add(umbrella);
    }
  }
  const result = {
    categories: [],
    totalMonthlyDemand: 0,
    totalPage1Demand: 0,
    totalTop3Demand: 0,
    brandedPage1Demand: 0,
    nonBrandedPage1Demand: 0,
    totalKeywordsAnalyzed: merged.length,
    page1CaptureRate: 0,
    keywordCategories: {}
  };
  const sums = /* @__PURE__ */ new Map();
  assignmentByIndex.forEach((catName, idx) => {
    const kw = merged[idx];
    if (!kw)
      return;
    const vol = kw.searchVolume ?? 0;
    if (!sums.has(catName))
      sums.set(catName, { monthlyDemand: 0, page1Demand: 0, top3Demand: 0 });
    const s = sums.get(catName);
    s.monthlyDemand += vol;
    if (kw.clientPosition !== null && kw.clientPosition <= 10)
      s.page1Demand += vol;
    if (kw.clientPosition !== null && kw.clientPosition <= 3)
      s.top3Demand += vol;
    result.keywordCategories[kw.keyword.toLowerCase()] = catName;
  });
  const allNames = Array.from(sums.keys());
  const demandOf = (n) => sums.get(n).monthlyDemand;
  const isNav = (n) => {
    const t = catTypeByName.get(n);
    return t === "brand" || t === "location";
  };
  const orderedNames = [
    ...allNames.filter((n) => n !== OTHER_NAME && !isNav(n)).sort((a, b) => demandOf(b) - demandOf(a)),
    ...allNames.filter((n) => n !== OTHER_NAME && isNav(n)).sort((a, b) => demandOf(b) - demandOf(a)),
    ...allNames.filter((n) => n === OTHER_NAME)
  ];
  for (const name of orderedNames) {
    const s = sums.get(name);
    const catType = catTypeByName.get(name) ?? "procedure";
    result.categories.push({ name, type: catType, monthlyDemand: s.monthlyDemand, page1Demand: s.page1Demand, top3Demand: s.top3Demand });
    result.totalMonthlyDemand += s.monthlyDemand;
    result.totalPage1Demand += s.page1Demand;
    result.totalTop3Demand += s.top3Demand;
    if (catType === "brand" || catType === "location") {
      result.brandedPage1Demand += s.page1Demand;
    } else {
      result.nonBrandedPage1Demand += s.page1Demand;
    }
  }
  result.page1CaptureRate = result.totalMonthlyDemand > 0 ? result.totalPage1Demand / result.totalMonthlyDemand : 0;
  console.log(`[OrbitIQ] Category breakdown: ${result.categories.length} categories covering ${Object.keys(result.keywordCategories).length}/${merged.length} keywords`);
  result.keywordPaths = keywordPaths;
  result.keywordMeta = keywordMeta;
  if (mergeLog.length > 0)
    result.mergeLog = mergeLog.slice(0, MERGE_LOG_CAP);
  if (skeleton)
    result.taxonomySkeleton = skeleton;
  result.taxonomyEngine = "anchored-v1";
  if (failedBatchStarts.size > 0) {
    console.log(`[OrbitIQ] Discovery: ${failedBatchStarts.size} batch(es) failed after retry \u2014 their keywords are in Other, flagged needs-review`);
  }
  for (const c of result.categories) {
    if (c.type !== "procedure" || c.name === OTHER_NAME)
      continue;
    const umbrella = umbrellaByCat.get(c.name);
    c.parent = umbrella && umbrella.length > 0 ? umbrella : c.name;
  }
  {
    const umbrellas = new Set(result.categories.filter((c) => c.parent).map((c) => c.parent));
    console.log(`[OrbitIQ] Taxonomy: ${Object.keys(keywordPaths).length} keyword paths, ${umbrellas.size} umbrella(s)`);
  }
  result.umbrellaScope = classifyUmbrellaScopes(clientKwByUmbrella, navUmbrellas);
  {
    const adj = Object.entries(result.umbrellaScope).filter(([, s]) => s === "adjacent").map(([n]) => n);
    console.log(`[OrbitIQ] Scope: ${Object.keys(result.umbrellaScope).length} umbrella(s), ${adj.length} adjacent (competitor-only)${adj.length ? ` \u2014 ${adj.slice(0, 6).join(", ")}${adj.length > 6 ? "\u2026" : ""}` : ""}`);
  }
  try {
    const volByKw = /* @__PURE__ */ new Map();
    for (const kw of merged) {
      const k = kw.keyword.toLowerCase();
      if (!volByKw.has(k))
        volByKw.set(k, kw.searchVolume ?? 0);
    }
    const procNames = new Set(result.categories.filter((c) => c.type === "procedure").map((c) => c.name));
    const kwByCat = /* @__PURE__ */ new Map();
    for (const [kwLow, catName] of Object.entries(result.keywordCategories)) {
      if (!procNames.has(catName))
        continue;
      const arr = kwByCat.get(catName) ?? [];
      arr.push({ keyword: kwLow, searchVolume: volByKw.get(kwLow) ?? 0 });
      kwByCat.set(catName, arr);
    }
    const catInputs = Array.from(kwByCat.entries()).filter(([, kws]) => kws.length > 0).map(([name, keywords]) => ({ name, type: "procedure", keywords }));
    const procKwCount = catInputs.reduce((s, c) => s + c.keywords.length, 0);
    if (catInputs.length > 0 && catInputs.length <= 120 && procKwCount <= 2e3) {
      const ai = await groupCategoriesByIntent(catInputs, domain);
      result.intentGroups = ai.intentGroups;
      result.brandKeywords = ai.brandKeywords;
      result.intentEngine = ai.intentEngine;
      console.log(`[OrbitIQ] Intent grouping (inline): ${ai.intentGroups.length} groups, ${ai.brandKeywords.length} brand terms`);
    } else {
      console.log(`[OrbitIQ] Intent grouping skipped inline (${catInputs.length} procedure categories / ${procKwCount} kws) \u2014 use "Refine with AI".`);
    }
  } catch (err) {
    console.error("[OrbitIQ] Inline intent grouping failed (non-fatal):", err?.message ?? err);
  }
  return result;
}
async function generatePPTPrompt(clientName, domain, industry, narrative, opportunities2, semrush, serp, profound) {
  const systemPrompt = pptPromptGenerator(
    clientName,
    domain,
    industry,
    narrative,
    opportunities2,
    semrush,
    serp,
    profound
  );
  const response = await getClient2().messages.create({
    model: MODELS.fast,
    // haiku — fast enough for structured prompt generation
    max_tokens: 2e3,
    messages: [{
      role: "user",
      content: `${systemPrompt}

Generate the complete PPTX skill prompt now. Make it detailed and ready to paste directly into the Claude PPTX skill. Return only the prompt text, no preamble.`
    }]
  }, { timeout: 1e5 });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
async function runFullSynthesis(domain, clientName, industry, semrush, serp, profound, cached = {}, onCheckpoint, priorPaths) {
  console.log(`[OrbitIQ] Starting synthesis for ${domain}${Object.keys(cached).length > 0 ? ` (resuming \u2014 cached: ${Object.keys(cached).join(", ")})` : ""}`);
  const footprintKw = (semrush.topKeywords?.length ?? 0) + (semrush.gapKeywords?.length ?? 0);
  if (footprintKw === 0) {
    throw new Error(
      "EMPTY_FOOTPRINT: This analysis has no keyword footprint \u2014 its snapshot holds 0 client keywords and 0 competitor gap keywords, so there is nothing to analyse. This is what a cleared footprint looks like. Upload or re-pull the keyword data for this project, then run the analysis again (it will re-gather Phase 1 rather than resume this one)."
    );
  }
  const synthStartMs = Date.now();
  const cachedPersonas = (cached.personas?.length ?? 0) > 0 ? cached.personas : null;
  const cachedCb = (cached.categoryBreakdown?.categories?.length ?? 0) > 0 ? cached.categoryBreakdown : null;
  const cachedProbe = cached.llmProbe ?? null;
  const cachedOpps = (cached.opportunities?.length ?? 0) > 0 ? cached.opportunities : null;
  const [personas2, categoryBreakdown] = await Promise.all([
    cachedPersonas ? Promise.resolve(cachedPersonas) : generatePersonas(domain, industry, semrush, serp),
    cachedCb ? Promise.resolve(cachedCb) : generateCategoryBreakdown(
      domain,
      industry,
      semrush,
      cached.cbProgress ?? null,
      // v7.86: wave-level discovery progress is checkpointed so very large
      // (uncapped) footprints can resume mid-discovery after a 300s kill
      onCheckpoint ? async (p) => onCheckpoint({ cbProgress: p }) : void 0,
      priorPaths ?? null
      // v7.339: prior-taxonomy anchor (Const III.1e)
    ).catch((err) => {
      console.error("[OrbitIQ] Category breakdown failed (non-fatal):", err);
      return { categories: [], totalMonthlyDemand: 0, totalPage1Demand: 0, totalTop3Demand: 0, brandedPage1Demand: 0, nonBrandedPage1Demand: 0, totalKeywordsAnalyzed: 0, page1CaptureRate: 0, keywordCategories: {} };
    })
  ]);
  console.log(`[OrbitIQ] Personas: ${personas2.length}, Categories: ${categoryBreakdown.categories.length}`);
  if (!cachedPersonas || !cachedCb)
    await onCheckpoint?.({ personas: personas2, categoryBreakdown });
  let llmProbe = cachedProbe;
  if (!llmProbe) {
    const probeParentOf = /* @__PURE__ */ new Map();
    const probeDisp = /* @__PURE__ */ new Map();
    for (const c of categoryBreakdown.categories) {
      const n = c.name.toLowerCase().trim();
      probeDisp.set(n, c.name);
      const p = String(c.parent ?? "").trim();
      if (p && p.toLowerCase() !== n)
        probeParentOf.set(n, p.toLowerCase().trim());
    }
    const probeRootOf = (name) => {
      let cur = name.toLowerCase().trim();
      const seen = /* @__PURE__ */ new Set([cur]);
      while (probeParentOf.has(cur)) {
        const next = probeParentOf.get(cur);
        if (seen.has(next))
          break;
        seen.add(next);
        cur = next;
      }
      return probeDisp.get(cur) ?? name;
    };
    const kwVol = /* @__PURE__ */ new Map();
    for (const k of [...semrush.topKeywords ?? [], ...semrush.gapKeywords ?? []]) {
      const key = String(k?.keyword ?? "").toLowerCase().trim();
      if (!key)
        continue;
      const v = k?.searchVolume ?? 0;
      if (v > (kwVol.get(key) ?? 0))
        kwVol.set(key, v);
    }
    const kwPaths = categoryBreakdown.keywordPaths ?? {};
    const termsFor = (rootLow, subLow) => {
      const hits = [];
      for (const [kw, path] of Object.entries(kwPaths)) {
        if (!Array.isArray(path) || path.length === 0)
          continue;
        if (String(path[0] ?? "").toLowerCase().trim() !== rootLow)
          continue;
        if (subLow !== null && String(path[1] ?? "").toLowerCase().trim() !== subLow)
          continue;
        hits.push({ kw, vol: kwVol.get(kw) ?? 0 });
      }
      hits.sort((a, b) => b.vol - a.vol);
      return hits.slice(0, 5).map((h) => h.kw);
    };
    const procRows = categoryBreakdown.categories.filter((c) => c.type === "procedure" && c.name !== "Other");
    const rowByLow = new Map(procRows.map((c) => [c.name.toLowerCase().trim(), c]));
    const lineNames = [];
    const seenLines = /* @__PURE__ */ new Set();
    for (const c of procRows) {
      const root = probeRootOf(c.name);
      const low = root.toLowerCase().trim();
      if (!seenLines.has(low)) {
        seenLines.add(low);
        lineNames.push(root);
      }
    }
    const lineDemand = (name) => rowByLow.get(name.toLowerCase().trim())?.monthlyDemand ?? 0;
    const lines = lineNames.sort((a, b) => lineDemand(b) - lineDemand(a)).slice(0, 30);
    const lineSet = new Set(lines.map((l) => l.toLowerCase().trim()));
    const probeCategories = lines.map((l) => ({
      name: l,
      monthlyDemand: lineDemand(l),
      promptLabel: composePromptLabel(l, l),
      kind: "line",
      terms: termsFor(l.toLowerCase().trim(), null)
    }));
    const subs = procRows.filter((c) => {
      const low = c.name.toLowerCase().trim();
      const parentLow = String(c.parent ?? "").toLowerCase().trim();
      return parentLow && parentLow !== low && lineSet.has(parentLow);
    }).sort((a, b) => b.monthlyDemand - a.monthlyDemand);
    for (const c of subs) {
      const root = probeDisp.get(String(c.parent).toLowerCase().trim()) ?? String(c.parent);
      probeCategories.push({
        name: c.name,
        monthlyDemand: c.monthlyDemand,
        promptLabel: composePromptLabel(c.name, root),
        kind: "sub",
        terms: termsFor(root.toLowerCase().trim(), c.name.toLowerCase().trim())
      });
    }
    console.log(`[OrbitIQ] Probe plan: ${lines.length} lines + ${subs.length} direct sub-categories = ${probeCategories.length} nodes`);
    const PROBE_SAFETY_MS = 25e4;
    const remainingMs = PROBE_SAFETY_MS - (Date.now() - synthStartMs);
    if (remainingMs < 2e4) {
      console.warn(`[OrbitIQ] LLM probe skipped this window \u2014 only ${Math.round(remainingMs / 1e3)}s left; brief completes with prior/empty probe, backfills later (Const I.5)`);
      llmProbe = profound ?? null;
    } else {
      const poolDeadline = Date.now() + Math.max(2e4, remainingMs - 3e4);
      const budget = new Promise((res) => setTimeout(() => res({ __timeout: true }), remainingMs));
      const raced = await Promise.race([
        getLLMProbeSnapshotV2(clientName, domain, industry, probeCategories, poolDeadline).catch((err) => {
          console.error("[OrbitIQ] LLM probe v2 failed (using previous probe data):", err);
          return profound ?? null;
        }),
        budget
      ]);
      if (raced && raced.__timeout === true) {
        console.warn(`[OrbitIQ] LLM probe exceeded its ${Math.round(remainingMs / 1e3)}s budget \u2014 completing brief with prior/empty probe, backfills on a later run (Const I.5)`);
        llmProbe = profound ?? null;
      } else {
        llmProbe = raced;
      }
    }
    if (llmProbe)
      await onCheckpoint?.({ llmProbe });
  }
  const opportunities2 = cachedOpps ?? await generateOpportunities(domain, industry, semrush, serp, llmProbe).catch((err) => {
    console.error("[OrbitIQ] Opportunities failed (non-fatal):", err);
    return [];
  });
  console.log(`[OrbitIQ] Opportunities: ${opportunities2.length}`);
  if (!cachedOpps && opportunities2.length > 0)
    await onCheckpoint?.({ opportunities: opportunities2 });
  const [narrative, pptPrompt] = await Promise.all([
    generateNarrative(
      domain,
      clientName,
      industry,
      semrush,
      serp,
      llmProbe,
      personas2,
      opportunities2,
      categoryBreakdown
    ),
    generatePPTPrompt(
      clientName,
      domain,
      industry,
      null,
      // narrative not yet available — prompts.ts handles null gracefully
      opportunities2,
      semrush,
      serp,
      llmProbe
    )
  ]);
  console.log(`[OrbitIQ] Narrative + PPT prompt generated in parallel`);
  const _topKws = semrush.topKeywords ?? [];
  const _topSet = new Set(_topKws.map((k) => k.keyword.toLowerCase()));
  const _allKwsFull = [
    ..._topKws,
    ...(semrush.gapKeywords ?? []).filter((k) => !_topSet.has(k.keyword.toLowerCase()))
  ];
  const _fullMonthlyVol = _allKwsFull.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
  const _fullPage1Vol = _topKws.filter((k) => k.position != null && k.position <= 10).reduce((s, k) => s + (k.searchVolume ?? 0), 0);
  const totalCategoryVolume = _fullMonthlyVol > 0 ? _fullMonthlyVol : semrush.competitors.reduce((sum, c) => sum + c.organicTraffic, semrush.overview.organicTraffic);
  const clientOwnedVolume = _fullPage1Vol > 0 ? _fullPage1Vol : semrush.overview.organicTraffic;
  const marketCaptureRate = totalCategoryVolume > 0 ? clientOwnedVolume / totalCategoryVolume : 0;
  return {
    personas: personas2,
    opportunities: opportunities2,
    llmProbe,
    narrative,
    pptPrompt,
    categoryBreakdown,
    heroMetrics: {
      marketCaptureRate,
      totalCategoryVolume,
      clientOwnedVolume,
      keywordFootprint: semrush.overview.organicKeywords,
      aioAvailable: serp.aioSummary.withAIO,
      aioAcquired: serp.aioSummary.clientCited,
      topCompetitor: semrush.competitors[0]?.domain ?? ""
    }
  };
}

// .runs/oiq442.D1SLEP/e442b.ts
(async () => {
  const empty = {
    domain: "x.com",
    overview: { organicKeywords: 0, organicTraffic: 0 },
    competitors: [],
    gapKeywords: [],
    topKeywords: [],
    positionDist: null
  };
  let msg = "";
  try {
    await runFullSynthesis("x.com", "X", "banking", empty, { aioSummary: { aioRate: 0, clientAIORate: 0 } }, null);
  } catch (e) {
    msg = String(e?.message ?? e);
  }
  console.log(JSON.stringify({ msg }));
})();
