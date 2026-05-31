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
  createdAt:    timestamp('created_at').defaultNow().notNull(),
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
