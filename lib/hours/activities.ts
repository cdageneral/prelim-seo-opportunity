// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/activities.ts — v7.447 · v7.526 Scout scope
//
// Wayne's delivery scope: the manual effort each activity takes, and the stored
// evidence that proves this project actually carries it.
//
// This file holds the SEED only. The live list lives in the `hours_activities`
// table and is edited in Admin → Hours Saved, so an hours figure or a gate can
// change without a release (Wayne, 2026-08-14). The seed runs once, on the
// first read of an empty table, and never overwrites an edited row — otherwise
// every deploy would silently revert his numbers.
//
// `group: 'local'` activities are the ones that only apply where a project has
// real local data; they are gated individually rather than by a project-level
// flag, so a project that found locations but never fetched reviews is credited
// for the former and not the latter.
//
// v7.526 — `group: 'scout'` activities are credited to SCOUT RUNS, never to
// projects (Wayne, 2026-09-29: "for the hours saved we should add in the hours
// saved for the scout reports as well"). A Scout report is a bounded subset of
// the Orbit delivery — at most 600 prospect rows, 300 per competitor, four
// themes AI-read — so each Scout line carries its own, smaller figure rather
// than the Orbit figure; the eleven figures below are the ones Wayne approved
// (Orbit hours × the share of that activity a Scout run actually performs).
// Orbit activities that Scout never performs (prompt fan-out, audiences, LOB
// plan, roadmap, calendar, journeys, SERP features, anchors, every Local line)
// have no Scout row at all, so they can never be credited to a run.
// ─────────────────────────────────────────────────────────────────────────────

export type HoursGroup = 'base' | 'local' | 'scout';

export interface HoursActivity {
  key:       string;
  label:     string;
  hours:     number;
  gateKey:   string;
  group:     HoursGroup;
  sortOrder: number;
  active:    boolean;
}

/** v7.526 — which product a group's hours belong to. `base` + `local` are Orbit projects; `scout` is a Scout run. */
export function groupProduct(group: HoursGroup): 'orbit' | 'scout' { return group === 'scout' ? 'scout' : 'orbit'; }

export const ACTIVITY_SEED: HoursActivity[] = [
  { key: 'organic_baselining',   label: 'Organic baselining',                    hours: 20,  gateKey: 'organic_footprint',   group: 'base',  sortOrder: 10,  active: true },
  { key: 'keyword_research',     label: 'Keyword research & themeing',           hours: 100, gateKey: 'taxonomy',            group: 'base',  sortOrder: 20,  active: true },
  { key: 'prompt_research',      label: 'Prompt Research & Fan-Out',             hours: 45,  gateKey: 'prompt_set',          group: 'base',  sortOrder: 30,  active: true },
  { key: 'llm_visibility_base',  label: 'LLM Visibility Baseline',               hours: 20,  gateKey: 'llm_baseline',        group: 'base',  sortOrder: 40,  active: true },
  { key: 'citation_gap',         label: 'Citation Gap (AI)',                     hours: 48,  gateKey: 'citations',           group: 'base',  sortOrder: 50,  active: true },
  { key: 'audience_discovery',   label: 'Audience & Category Discovery',         hours: 28,  gateKey: 'audience_segments',   group: 'base',  sortOrder: 60,  active: true },
  { key: 'lob_seo_plan',         label: 'LOB SEO Strategy Plan',                 hours: 230, gateKey: 'lob_taxonomy',        group: 'base',  sortOrder: 70,  active: true },
  { key: 'geo_roadmap',          label: 'GEO Roadmap & Strategy',                hours: 108, gateKey: 'roadmap',             group: 'base',  sortOrder: 80,  active: true },
  { key: 'content_calendar',     label: 'Content Strategy Planning / Calendar',  hours: 18,  gateKey: 'content_plan',        group: 'base',  sortOrder: 90,  active: true },
  { key: 'content_gap',          label: 'Content gap',                           hours: 20,  gateKey: 'page_map',            group: 'base',  sortOrder: 100, active: true },
  { key: 'sov_rank_dist',        label: 'SOV & rank distribution',               hours: 8,   gateKey: 'rank_distribution',   group: 'base',  sortOrder: 110, active: true },
  { key: 'journey_building',     label: 'Journey building',                      hours: 40,  gateKey: 'demand_universe',     group: 'base',  sortOrder: 120, active: true },
  { key: 'serp_feature_analysis',label: 'SERP feature analysis',                 hours: 6,   gateKey: 'serp_features',       group: 'base',  sortOrder: 130, active: true },
  { key: 'backlink_profile',     label: 'Backlink profile',                      hours: 4,   gateKey: 'backlinks',           group: 'base',  sortOrder: 140, active: true },
  { key: 'anchor_text',          label: 'Anchor text analysis',                  hours: 4,   gateKey: 'anchors',             group: 'base',  sortOrder: 150, active: true },
  { key: 'seo_geo_assessment',   label: 'SEO & GEO assessment',                  hours: 60,  gateKey: 'assessment_report',   group: 'base',  sortOrder: 160, active: true },
  { key: 'executive_summary',    label: 'Executive summary',                     hours: 16,  gateKey: 'exec_narrative',      group: 'base',  sortOrder: 170, active: true },
  { key: 'opportunity_insights', label: 'Opportunity insights',                  hours: 6,   gateKey: 'opportunities',       group: 'base',  sortOrder: 180, active: true },
  { key: 'project_scoping',      label: 'Project scoping',                       hours: 6,   gateKey: 'always',              group: 'base',  sortOrder: 190, active: true },
  { key: 'local_pack_ranks',     label: 'Local map pack ranks',                  hours: 6,   gateKey: 'local_pack',          group: 'local', sortOrder: 200, active: true },
  { key: 'local_presence',       label: 'Location presence',                     hours: 6,   gateKey: 'local_locations',     group: 'local', sortOrder: 210, active: true },
  { key: 'local_reviews',        label: 'Local review ratings',                  hours: 8,   gateKey: 'local_reviews',       group: 'local', sortOrder: 220, active: true },
  { key: 'local_opportunities',  label: 'Local opportunities per location',      hours: 16,  gateKey: 'local_opportunities', group: 'local', sortOrder: 230, active: true },
  { key: 'local_competition',    label: 'Local competition',                     hours: 8,   gateKey: 'local_competition',   group: 'local', sortOrder: 240, active: true },
  // ── Scout (v7.526) — credited per Scout RUN on the run's own stored result, never to a project ──
  { key: 'scout_scoping',        label: 'Scout · Project scoping',               hours: 6,   gateKey: 'scout_run_finished',  group: 'scout', sortOrder: 300, active: true },
  { key: 'scout_baselining',     label: 'Scout · Organic baselining',            hours: 6,   gateKey: 'scout_sites_profiled', group: 'scout', sortOrder: 310, active: true },
  { key: 'scout_keyword_themes', label: 'Scout · Keyword research & themeing',   hours: 15,  gateKey: 'scout_themes',        group: 'scout', sortOrder: 320, active: true },
  { key: 'scout_sov',            label: 'Scout · SOV & rank distribution',       hours: 4,   gateKey: 'scout_field_share',   group: 'scout', sortOrder: 330, active: true },
  { key: 'scout_backlink',       label: 'Scout · Backlink profile',              hours: 1,   gateKey: 'scout_authority',     group: 'scout', sortOrder: 340, active: true },
  { key: 'scout_llm_baseline',   label: 'Scout · LLM Visibility Baseline',       hours: 5,   gateKey: 'scout_ai_reads',      group: 'scout', sortOrder: 350, active: true },
  { key: 'scout_citation_gap',   label: 'Scout · Citation Gap (AI)',             hours: 5,   gateKey: 'scout_ai_quadrants',  group: 'scout', sortOrder: 360, active: true },
  { key: 'scout_content_gap',    label: 'Scout · Content gap',                   hours: 6,   gateKey: 'scout_opening_detail', group: 'scout', sortOrder: 370, active: true },
  { key: 'scout_opportunity',    label: 'Scout · Opportunity insights',          hours: 6,   gateKey: 'scout_opening',       group: 'scout', sortOrder: 380, active: true },
  { key: 'scout_exec_summary',   label: 'Scout · Executive summary',             hours: 8,   gateKey: 'scout_report',        group: 'scout', sortOrder: 390, active: true },
  { key: 'scout_assessment',     label: 'Scout · SEO & GEO snapshot report',     hours: 15,  gateKey: 'scout_report',        group: 'scout', sortOrder: 400, active: true },
];

/**
 * v7.526 — the Scout rows on their own, for the ONE-TIME additive seed in
 * lib/hours/store.ts. A production table seeded in v7.447 already holds the 24
 * Orbit rows and is never re-seeded (an upsert-on-read would revert Wayne's
 * edits every deploy), so the Scout rows are added exactly once under this seed
 * id, with ON CONFLICT DO NOTHING, and never re-added after Wayne removes one.
 */
export const SCOUT_SEED_ID = 'scout_v7526';
export const SCOUT_ACTIVITY_SEED: HoursActivity[] = ACTIVITY_SEED.filter(a => a.group === 'scout');

/**
 * The full scope if every activity were credited — the ceiling, never a project's figure.
 * `total` is the ORBIT ceiling (base + local), unchanged since v7.447 so every "of N in
 * scope" sentence keeps its meaning; `scout` is a Scout RUN's ceiling and is reported
 * beside it, never added into it — a project and a run are different deliverables.
 */
export function scopeCeiling(list: HoursActivity[] = ACTIVITY_SEED) {
  const act = list.filter(a => a.active);
  const base  = act.filter(a => a.group === 'base').reduce((s, a) => s + a.hours, 0);
  const local = act.filter(a => a.group === 'local').reduce((s, a) => s + a.hours, 0);
  const scout = act.filter(a => a.group === 'scout').reduce((s, a) => s + a.hours, 0);
  return { base, local, scout, total: base + local };
}
