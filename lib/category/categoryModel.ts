/**
 * lib/category/categoryModel.ts — v7.227 (members enrichment v7.228)
 *
 * ONE assembled category model that every category read site shares (Const II.7).
 *
 * The canonical "one cluster = one intent = one page" unit is produced by
 * `buildCanonicalClusterTopics` in ThemeClustersPanel — the single source the Journey and
 * Content panels consume (v7.210). This module derives, from that same source:
 *   • the canonical CATEGORY LIST (guarded + near-dup merged),
 *   • the keyword → category MEMBERSHIP map (the STORED assignment, Const II.8), and
 *   • (v7.228) a STAGED MEMBERS projection — each keyword tagged with provenance, journey
 *     lane, funnel stage and mentionsProduct — the foundation the deep-journey / pre-product
 *     enrichment (Step 3) builds on.
 *
 * ThemeClustersPanel is unchanged — it remains the producer; this is a thin, read-only
 * projection of what it already computes (no parallel copy, Const II.7). Callers MUST
 * memoize (this re-runs the canonical cluster build).
 */

import {
  buildCanonicalClusterTopics,
  type Topic,
  type IntentType,
} from '@/components/brief/ThemeClustersPanel';

type JourneyStage = Topic['stage'];                 // 'awareness' | 'consideration' | 'decision' | 'retention'
export type CategoryType = Topic['parentType'];     // 'procedure' | 'brand' | 'location' | 'demand' | 'problem'
export type JourneyLane = 'product' | 'pre-product';

export interface ModelCategory {
  name: string;
  type: CategoryType;
}

/**
 * v7.228: one keyword's staged membership in its canonical category. The staging fields are
 * the foundation for Step 3 (deep-journey / pre-product enrichment) and for any future
 * per-stage rollup — they are derived ONCE here from the canonical topics so every consumer
 * reads the same staging (Const II.7).
 */
export interface ModelMember {
  keyword:         string;
  volume:          number;          // real Semrush volume off the canonical topic (Const I.1/I.2)
  categoryName:    string;          // canonical (seed/home) category
  provenance:      'footprint' | 'demand';   // demand = deep-journey "missing demand" (KwItem.origin)
  journey:         JourneyLane;     // product (solution-aware) | pre-product (problem-aware) — Const III.2a
  stage:           JourneyStage;    // awareness → consideration → decision → retention
  mentionsProduct: boolean;         // false for pre-product / trigger terms (Const III.2a)
}

export interface CategoryModel {
  categories:         ModelCategory[];
  categoryForKeyword: Map<string, string>;
  members:            ModelMember[];   // v7.228: staged membership (one per keyword, first-topic wins)
  topics:             Topic[];
}

export function buildCategoryModel(
  analysis: any,
  clientDomain: string,
  competitorDomains: string[] = [],
  uploadedKeywords: any[] = [],
  claudeAssigns: Record<string, IntentType> = {},
  clientVolMin = 0,
  competitorVolMin = 0,
): CategoryModel {
  const topics = buildCanonicalClusterTopics(
    analysis,
    clientDomain,
    competitorDomains,
    uploadedKeywords,
    claudeAssigns,
    clientVolMin,
    competitorVolMin,
  );

  // v7.228: pre-product lane classification — IDENTICAL to CanonicalJourneyView (JourneySection
  // lines 1986-1988), so the model's lanes match the Journey panel exactly (Const II.7). A topic
  // is pre-product when it is a 'problem' cluster OR a missing-demand cluster whose parent name is
  // a deep-journey problem seed (demandUniverse.problemSeeds).
  const problemSeeds: string[] = Array.isArray(analysis?.semrushSnapshot?._demandUniverse?.problemSeeds)
    ? analysis.semrushSnapshot._demandUniverse.problemSeeds
    : [];
  const problemSet = new Set(problemSeeds.map(s => String(s ?? '').toLowerCase().trim()));
  const isPreProduct = (t: Topic): boolean =>
    t.parentType === 'problem'
    || (t.parentType === 'demand' && problemSet.has((t.parentName || '').toLowerCase().trim()));

  const categories: ModelCategory[] = [];
  const seenCat = new Set<string>();
  const categoryForKeyword = new Map<string, string>();
  const members: ModelMember[] = [];

  for (const t of topics) {
    const name = t.parentName;
    if (name && !seenCat.has(name)) {
      seenCat.add(name);
      categories.push({ name, type: t.parentType });
    }
    const lane: JourneyLane = isPreProduct(t) ? 'pre-product' : 'product';
    for (const kw of t.keywords) {
      const k = (kw.keyword ?? '').toLowerCase().trim();
      // First topic wins a keyword (topics are in canonical order) — a keyword is never
      // double-assigned across categories, so downstream counts never double-count.
      if (!k || categoryForKeyword.has(k)) continue;
      categoryForKeyword.set(k, name);
      members.push({
        keyword:         kw.keyword,
        volume:          kw.searchVolume ?? 0,
        categoryName:    name,
        provenance:      kw.origin === 'demand' ? 'demand' : 'footprint',
        journey:         lane,
        stage:           t.stage,
        mentionsProduct: lane === 'product',
      });
    }
  }

  return { categories, categoryForKeyword, members, topics };
}
