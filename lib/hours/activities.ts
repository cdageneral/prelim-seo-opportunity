// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/activities.ts — v7.447
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
// ─────────────────────────────────────────────────────────────────────────────

export interface HoursActivity {
  key:       string;
  label:     string;
  hours:     number;
  gateKey:   string;
  group:     'base' | 'local';
  sortOrder: number;
  active:    boolean;
}

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
];

/** The full scope if every activity were credited — the ceiling, never a project's figure. */
export function scopeCeiling(list: HoursActivity[] = ACTIVITY_SEED) {
  const act = list.filter(a => a.active);
  const base  = act.filter(a => a.group === 'base').reduce((s, a) => s + a.hours, 0);
  const local = act.filter(a => a.group === 'local').reduce((s, a) => s + a.hours, 0);
  return { base, local, total: base + local };
}
