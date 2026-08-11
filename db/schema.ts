import {
  pgTable, text, timestamp, uuid, integer, real, jsonb, pgEnum, boolean, serial,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const projectStatusEnum      = pgEnum('project_status',      ['active', 'archived', 'draft']);
export const analysisStatusEnum     = pgEnum('analysis_status',     ['pending', 'running', 'completed', 'failed']);
export const opportunityCategoryEnum = pgEnum('opportunity_category', ['SEO', 'GEO', 'Content', 'Technical', 'Competitive']);
export const reportTypeEnum         = pgEnum('report_type',         ['PDF', 'PPT_PROMPT']);

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id:          uuid('id').defaultRandom().primaryKey(),
  clerkOrgId:  text('clerk_org_id').notNull().default('default'),
  clerkUserId: text('clerk_user_id').notNull().default('default'),
  clientName:  text('client_name').notNull(),
  websiteUrl:  text('website_url').notNull(),
  industry:    text('industry'),
  notes:       text('notes'),
  status:      projectStatusEnum('status').default('active').notNull(),
  dataSource:               text('data_source').default('auto').notNull(),  // 'auto' | 'upload'
  kwVolThresholdClient:     integer('kw_vol_threshold_client').default(0).notNull(),
  kwVolThresholdCompetitor: integer('kw_vol_threshold_competitor').default(0).notNull(),
  // v7.99: market the analysis targets. Semrush regional database code ('us',
  // 'ca', 'uk', 'au', …) — also drives SerpAPI gl/google_domain via MARKETS map
  // in lib/utils/markets.ts. NOTE: run `npm run db:push` once after deploying.
  semrushDatabase:          text('semrush_database').default('us').notNull(),
  // v7.206: client brand vocabulary — the terms that count as BRANDED for this
  // client (Constitution III.1). Seeded by AI on analysis (domain + the
  // navigational terms the client ranks for, e.g. TD → "td","toronto-dominion",
  // "easyweb","ameritrade") and editable in the Competitors/upload manager. The
  // domain root is always an implicit member; this list adds the variants a
  // domain string can't yield. NOTE: run `npm run db:push` once after deploying.
  brandTerms:               jsonb('brand_terms').$type<string[]>(),
  brandTermsUpdatedAt:      timestamp('brand_terms_updated_at'),
  // v7.208: competitor/third-party brand BLOCKLIST (Art III.1). Any term here is
  // hard-excluded from keywords, clusters, journey and content plan everywhere —
  // whether the term came from Semrush or a CSV upload. Edited in the same
  // Competitors/upload manager. Auto-migrated at runtime (ADD COLUMN IF NOT EXISTS).
  excludedBrands:           jsonb('excluded_brands').$type<string[]>(),
  excludedBrandsUpdatedAt:  timestamp('excluded_brands_updated_at'),
  // v7.260: Content Plan hand-picked topic selection — the editorial subset of the
  // canonical content topics the user pushed into the Content Plan panel, stored as an
  // array of ContentTopic.id (Const II.7: a view over one source of truth, not a copy).
  // Lives on the project so it survives reloads, devices, and re-analysis. Auto-migrated
  // at runtime via the ADD COLUMN IF NOT EXISTS pattern — no manual db:push.
  contentPlanSelections:          jsonb('content_plan_selections').$type<string[]>(),
  contentPlanSelectionsUpdatedAt: timestamp('content_plan_selections_updated_at'),
  // v7.267: Scope "spec sheet" — the running cart of content topics the user pushed in via
  // "Add to Scope" on the Content Plan panel, stored as an array of ContentTopic.id
  // (Const II.7: a view over one source of truth, not a copy). The View Scope panel
  // re-derives each topic's full brief from the canonical pool and filters to these ids.
  // Lives on the project so it survives reloads, devices, and re-analysis. Auto-migrated
  // at runtime via the ADD COLUMN IF NOT EXISTS pattern — no manual db:push.
  scopeSelections:          jsonb('scope_selections').$type<string[]>(),
  scopeSelectionsUpdatedAt: timestamp('scope_selections_updated_at'),
  // v7.270: Scope aggregation shell — the other five workstreams (LLM prompts, themes,
  // authority, technical, citations) push their scoped item ids into one namespaced map,
  // each namespace an array of that workstream's own canonical ids (Const II.7: ids only,
  // re-derived from each source — never a copy). Content keeps its own column above + its
  // scope ⊆ plan two-way sync untouched; this is purely additive so existing behaviour is
  // unaffected. Empty until each source panel's "Add to Scope" ships. Auto-migrated at
  // runtime via ADD COLUMN IF NOT EXISTS — no manual db:push.
  scopeWorkstreams:          jsonb('scope_workstreams').$type<Record<string, string[]>>(),
  scopeWorkstreamsUpdatedAt: timestamp('scope_workstreams_updated_at'),
  // v7.326: competitor-gap SCOPE-gate overrides — umbrella name → 'core' | 'adjacent'
  // (promote an adjacent / competitor-only vertical into the gap landscape, or demote a
  // vertical the auto-rule mis-scored). Persisted per project so a promote/demote survives
  // reloads and takes effect WITHOUT re-analysis. Empty = pure auto classification. Auto-
  // migrated at runtime via ADD COLUMN IF NOT EXISTS — no manual db:push.
  scopeOverrides:            jsonb('scope_overrides').$type<Record<string, 'core' | 'adjacent'>>(),
  scopeOverridesUpdatedAt:   timestamp('scope_overrides_updated_at'),
  // v7.358: per-project manual priority moves — ContentTopic.id → 'P0'|'P1'|'P2'|'P3'. The
  // user moves a topic to a different priority bucket on the Content Map; this override is
  // applied at READ time (injected onto the snapshot as `_priorityOverrides`, applied in
  // scoreTopic's consumers) so it takes effect WITHOUT re-analysis and reconciles across
  // every panel that reads priority (Const II.7). Empty = pure auto scoring. Survives
  // reloads, devices, and re-analysis. Auto-migrated via ADD COLUMN IF NOT EXISTS.
  priorityOverrides:          jsonb('priority_overrides').$type<Record<string, 'P0' | 'P1' | 'P2' | 'P3'>>(),
  priorityOverridesUpdatedAt: timestamp('priority_overrides_updated_at'),
  // v7.318: Profound AI Visibility computed metrics — SERVER-SIDE persistence so the
  // uploaded-export analysis survives refreshes, new browsers/devices, and is visible to ANY
  // user opening the project URL (replaces the old browser-only IndexedDB store). Holds ONLY
  // the compact computed Metrics object the panel renders — aggregated from the user's REAL
  // Profound CSV rows (Const I.1); never the raw rows, never a modeled value. Auto-migrated at
  // runtime via ADD COLUMN IF NOT EXISTS (and ensured in the projects-list route per the
  // v7.268 lesson — the list query selects every schema column). No manual db:push.
  profoundData:              jsonb('profound_data'),
  profoundDataUpdatedAt:     timestamp('profound_data_updated_at'),
  // v7.342: the project's CANONICAL TAXONOMY ANCHOR (distinct canonical paths from the
  // last successful anchored-engine breakdown, capped). Lives on the PROJECT — like brand
  // terms — so it SURVIVES the full keyword reset Wayne's upload workflow runs (the reset
  // deletes every analyses row, which was silently destroying the prior-analysis anchor and
  // making every re-upload a from-scratch re-derivation with different category names —
  // Const III.1e). Written by the synthesize route after each successful breakdown; read as
  // the skeleton anchor on the next run. Auto-migrated at runtime via ADD COLUMN IF NOT
  // EXISTS (ensured in the projects-list route per the v7.268/v7.327 lesson). No db:push.
  taxonomyAnchor:            jsonb('taxonomy_anchor').$type<string[][]>(),
  taxonomyAnchorUpdatedAt:   timestamp('taxonomy_anchor_updated_at'),
  // v7.367: Google Rank Authority scan snapshot — REAL Semrush backlink-authority signals
  // (backlinks_overview / ascore profile / anchors / referring-domain categories / brand
  // phrase volume) for the client + each competitor, pulled on demand from the Authority
  // panel (Const I.1 — every count is a crawled Semrush row, dated; the Authority Score
  // inside is Semrush's modeled composite and is labeled as such at render, I.5a). Lives
  // on the PROJECT row — like brandTerms/taxonomyAnchor — so it survives the full keyword
  // reset (which deletes analyses rows). Feeds the Authority Calculator panel (v7.368).
  // Auto-migrated at runtime via ADD COLUMN IF NOT EXISTS (ensured in the projects-list +
  // [id] + authority-scan routes per the v7.268/v7.327 column lesson). No manual db:push.
  authoritySnapshot:          jsonb('authority_snapshot'),
  authoritySnapshotUpdatedAt: timestamp('authority_snapshot_updated_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
});

// ─── Competitors ──────────────────────────────────────────────────────────────

export const competitors = pgTable('competitors', {
  id:        uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  domain:    text('domain').notNull(),
  name:      text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Analyses ─────────────────────────────────────────────────────────────────

export const analyses = pgTable('analyses', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  projectId:           uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status:              analysisStatusEnum('status').default('pending').notNull(),
  triggeredAt:         timestamp('triggered_at').defaultNow().notNull(),
  completedAt:         timestamp('completed_at'),
  errorMessage:        text('error_message'),
  semrushSnapshot:     jsonb('semrush_snapshot'),
  serpApiSnapshot:     jsonb('serpapi_snapshot'),
  profoundSnapshot:    jsonb('profound_snapshot'),
  marketCaptureRate:   real('market_capture_rate'),
  totalCategoryVolume: integer('total_category_volume'),
  clientOwnedVolume:   integer('client_owned_volume'),
  keywordFootprint:    integer('keyword_footprint'),
  aioAvailable:        integer('aio_available'),
  aioAcquired:         integer('aio_acquired'),
  topCompetitor:       text('top_competitor'),
});

// ─── Project Keywords ─────────────────────────────────────────────────────────
//
// Stores two kinds of records per project:
//   source = 'custom' | 'csv'  → user-added keywords (shown in keyword panel)
//   source = 'blocked'         → keywords from Semrush the user deleted (excluded from panel)
//
// NOTE: after deploying v7.19, run `npm run db:push` once to create this table.

export const projectKeywords = pgTable('project_keywords', {
  id:           serial('id').primaryKey(),
  projectId:    uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  keyword:      text('keyword').notNull(),
  searchVolume: integer('search_volume').notNull().default(0),
  position:     integer('position'),                   // null = not ranked / gap
  type:         text('type').notNull().default('gap'), // 'ranked' | 'gap'
  branded:      boolean('branded').notNull().default(false),
  source:       text('source').notNull(),              // 'custom' | 'csv' | 'blocked'
  domain:       text('domain'),                        // null = client keyword; set = competitor domain (uploaded footprints)
  url:          text('url'),                            // v7.251: real ranking/landing URL from the uploaded CSV (Semrush "URL" column); null = column absent
  serpFeatures: text('serp_features'),                 // v7.103: raw Semrush "SERP Features by Keyword" cell; null = column absent in upload
  createdAt:    timestamp('created_at').defaultNow().notNull(),
});

// ─── API Usage Ledger (v7.225) ─────────────────────────────────────────────────
//
// Per-call ledger of metered third-party API consumption, so each project's
// real credit spend (and a cross-project total) is visible in-app. One row per
// billable API call. Honors Constitution Art. I.1: every quantity is a REAL
// measured value — Semrush units = (rows actually returned × the provider's
// published per-line rate); SerpAPI = searches actually run; Anthropic/OpenAI =
// tokens/images actually consumed — never a modeled or projected number.
//
// `projectId` is nullable: a few calls run outside a project context (they roll
// up under "Unattributed"). `keyHash` is a non-reversible fingerprint of the API
// key used (last4 + sha256 prefix) so spend can be split when MULTIPLE keys per
// provider are in play, without ever storing the key itself.
//
// NOTE: created at deploy by `drizzle-kit push` (build step). Reads are written
// fault-tolerantly so a not-yet-migrated table degrades to an empty ledger.

export const apiUsage = pgTable('api_usage', {
  id:         serial('id').primaryKey(),
  projectId:  uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),  // null = unattributed
  provider:   text('provider').notNull(),   // 'semrush' | 'serpapi' | 'profound' | 'anthropic' | 'openai'
  endpoint:   text('endpoint').notNull(),    // report type / path / model (provenance of the cost)
  unit:       text('unit').notNull(),        // 'units' | 'searches' | 'calls' | 'tokens' | 'images'
  quantity:   integer('quantity').notNull().default(0),  // REAL credits consumed, in the provider's native unit
  rows:       integer('rows'),               // rows returned (Semrush) — provenance for units = rows × rate
  rate:       integer('rate'),               // per-line rate applied (Semrush) — provenance
  keyHash:    text('key_hash'),              // masked fingerprint of the key used (supports multiple keys/provider)
  kind:       text('kind').notNull().default('usage'),  // 'usage' | 'baseline' (manual reconciliation anchor)
  meta:       jsonb('meta'),                 // extra provenance: tokens in/out, model, status, note
  createdAt:  timestamp('created_at').defaultNow().notNull(),
});

// ─── Personas ─────────────────────────────────────────────────────────────────

export const personas = pgTable('personas', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  analysisId:          uuid('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  segmentName:         text('segment_name').notNull(),
  description:         text('description').notNull(),
  intentStage:         text('intent_stage').notNull(),
  primaryQueries:      jsonb('primary_queries').$type<string[]>().notNull(),
  painPoints:          jsonb('pain_points').$type<string[]>().notNull(),
  aiDiscoveryBehavior: text('ai_discovery_behavior'),
  contentGaps:         jsonb('content_gaps').$type<string[]>(),
  createdAt:           timestamp('created_at').defaultNow().notNull(),
});

// ─── Opportunities ────────────────────────────────────────────────────────────

export const opportunities = pgTable('opportunities', {
  id:              uuid('id').defaultRandom().primaryKey(),
  analysisId:      uuid('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  category:        opportunityCategoryEnum('category').notNull(),
  title:           text('title').notNull(),
  summary:         text('summary').notNull(),
  impactScore:     real('impact_score').notNull(),
  effortScore:     real('effort_score').notNull(),
  estimatedVisits: integer('estimated_visits'),
  estimatedLeads:  integer('estimated_leads'),
  evidence:        jsonb('evidence').notNull(),
  rank:            integer('rank').notNull(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reports = pgTable('reports', {
  id:          uuid('id').defaultRandom().primaryKey(),
  analysisId:  uuid('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  type:        reportTypeEnum('type').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
  fileUrl:     text('file_url'),
  promptText:  text('prompt_text'),
  metadata:    jsonb('metadata'),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const projectsRelations = relations(projects, ({ many }) => ({
  analyses:        many(analyses),
  competitors:     many(competitors),
  projectKeywords: many(projectKeywords),
  apiUsage:        many(apiUsage),
}));

export const apiUsageRelations = relations(apiUsage, ({ one }) => ({
  project: one(projects, { fields: [apiUsage.projectId], references: [projects.id] }),
}));

export const competitorsRelations = relations(competitors, ({ one }) => ({
  project: one(projects, { fields: [competitors.projectId], references: [projects.id] }),
}));

export const projectKeywordsRelations = relations(projectKeywords, ({ one }) => ({
  project: one(projects, { fields: [projectKeywords.projectId], references: [projects.id] }),
}));

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  project:       one(projects, { fields: [analyses.projectId], references: [projects.id] }),
  personas:      many(personas),
  opportunities: many(opportunities),
  reports:       many(reports),
}));

export const personasRelations = relations(personas, ({ one }) => ({
  analysis: one(analyses, { fields: [personas.analysisId], references: [analyses.id] }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one }) => ({
  analysis: one(analyses, { fields: [opportunities.analysisId], references: [analyses.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  analysis: one(analyses, { fields: [reports.analysisId], references: [analyses.id] }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export type Project           = typeof projects.$inferSelect;
export type NewProject        = typeof projects.$inferInsert;
export type Competitor        = typeof competitors.$inferSelect;
export type NewCompetitor     = typeof competitors.$inferInsert;
export type Analysis          = typeof analyses.$inferSelect;
export type NewAnalysis       = typeof analyses.$inferInsert;
export type Persona           = typeof personas.$inferSelect;
export type Opportunity       = typeof opportunities.$inferSelect;
export type Report            = typeof reports.$inferSelect;
export type ProjectKeyword    = typeof projectKeywords.$inferSelect;
export type NewProjectKeyword = typeof projectKeywords.$inferInsert;
export type ApiUsage          = typeof apiUsage.$inferSelect;
export type NewApiUsage       = typeof apiUsage.$inferInsert;

// ─── Auth & Access (v7.373) ─────────────────────────────────────────────────
// The app shipped with no authentication (middleware was a no-op; the projects
// table carried unused clerk_* columns). v7.373 adds a real login + admin layer:
// role tiers (owner/admin/editor/viewer) + per-project grants + an audit trail.
// Enforcement is gated behind the AUTH_ENFORCED env flag (see lib/auth/config.ts)
// so the app behaves exactly as before until the flag is turned on.
// These tables are created at runtime via ensureAuthTables() (CREATE TABLE IF
// NOT EXISTS) — the build is `next build` only, never drizzle-kit push, so the
// schema below documents shape while the runtime ensure creates the tables.

export const userRoleEnum   = pgEnum('user_role',   ['owner', 'admin', 'editor', 'viewer']);
export const userStatusEnum = pgEnum('user_status', ['active', 'pending', 'suspended']);

export const appUsers = pgTable('app_users', {
  id:           uuid('id').defaultRandom().primaryKey(),
  email:        text('email').notNull().unique(),
  name:         text('name').notNull(),
  // null while a user is invited-but-has-not-set-a-password (status 'pending')
  passwordHash: text('password_hash'),
  role:         userRoleEnum('role').notNull().default('viewer'),
  status:       userStatusEnum('status').notNull().default('active'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  lastLoginAt:  timestamp('last_login_at'),
});

// Per-project grant: which projects a user may open. Owner/Admin bypass this
// (they see all projects); Editor/Viewer see only granted rows.
export const projectAccess = pgTable('project_access', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// v7.418: user GROUPS — a named set of users that can be granted projects as a
// unit (Wayne, 2026-08-11: "add a group, assign members, then allow a project to
// be seen by a group, a user or multiple users and groups"). A group carries NO
// role of its own: membership only widens WHICH projects a user can see; what
// they can do there still comes from their individual role. Tables are created
// at runtime by ensureAuthTables() (CREATE TABLE IF NOT EXISTS), same as the
// other auth tables — no manual db:push.
export const userGroups = pgTable('user_groups', {
  id:        uuid('id').defaultRandom().primaryKey(),
  name:      text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userGroupMembers = pgTable('user_group_members', {
  id:        uuid('id').defaultRandom().primaryKey(),
  groupId:   uuid('group_id').notNull().references(() => userGroups.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull().references(() => appUsers.id,   { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectGroupAccess = pgTable('project_group_access', {
  id:        uuid('id').defaultRandom().primaryKey(),
  groupId:   uuid('group_id').notNull().references(() => userGroups.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const authSessions = pgTable('auth_sessions', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  ip:        text('ip'),
  userAgent: text('user_agent'),
});

// The activity log. Every row is a REAL event (Const I.1) — logins, project
// opens, creates, edits, user-management actions. actor_* are denormalized so
// the log stays stable if a user is later removed (no FK on actor_user_id).
export const auditEvents = pgTable('audit_events', {
  id:          uuid('id').defaultRandom().primaryKey(),
  actorUserId: uuid('actor_user_id'),
  actorEmail:  text('actor_email'),
  actorName:   text('actor_name'),
  action:      text('action').notNull(),
  projectId:   uuid('project_id'),
  projectName: text('project_name'),
  meta:        jsonb('meta').$type<Record<string, unknown>>(),
  ip:          text('ip'),
  userAgent:   text('user_agent'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});

export type AppUser       = typeof appUsers.$inferSelect;
export type NewAppUser    = typeof appUsers.$inferInsert;
export type ProjectAccess = typeof projectAccess.$inferSelect;
export type UserGroup          = typeof userGroups.$inferSelect;
export type UserGroupMember    = typeof userGroupMembers.$inferSelect;
export type ProjectGroupAccess = typeof projectGroupAccess.$inferSelect;
export type AuthSession   = typeof authSessions.$inferSelect;
export type AuditEvent    = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
