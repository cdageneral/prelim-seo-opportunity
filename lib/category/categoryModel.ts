/**
 * lib/category/categoryModel.ts — v7.227
 *
 * ONE assembled category model that every category read site shares (Const II.7).
 *
 * The canonical "one cluster = one intent = one page" unit is already produced by
 * `buildCanonicalClusterTopics` in ThemeClustersPanel — the single source the Journey
 * and Content panels consume (v7.210). This module derives the canonical CATEGORY LIST
 * and the keyword -> category MEMBERSHIP map from that same source, so the Keyword panel
 * renders the EXACT same category set as the Cluster / Journey / Content views instead of
 * re-deriving its own from the raw `_categoryBreakdown`.
 *
 * Why this is the right seam:
 *  - The category list is already GUARDED (competitor-brand categories dropped by the
 *    shared categoryGuard inside buildThemeClusters) and already NEAR-DUP MERGED (v7.194),
 *    so consumers inherit both without re-implementing them.
 *  - Membership comes straight off each canonical Topic's keyword members — the STORED
 *    assignment resolved once at the source, NOT re-derived by lexical matching at the read
 *    site (Const II.8).
 *  - ThemeClustersPanel is unchanged — it remains the producer; this is a thin, read-only
 *    projection of what it already computes (no parallel copy, Const II.7).
 *
 * Cost: re-runs the canonical cluster build, so callers MUST memoize. Parent-category
 * assignment does not depend on the Claude intent map (that only splits intent sub-topics),
 * so callers needing just the category list + membership may pass `{}` for `claudeAssigns`.
 */

import {
  buildCanonicalClusterTopics,
  type Topic,
  type IntentType,
} from '@/components/brief/ThemeClustersPanel';

export type CategoryType = 'procedure' | 'brand' | 'location' | 'demand' | 'problem';

export interface ModelCategory {
  name: string;
  type: CategoryType;
}

export interface CategoryModel {
  categories: ModelCategory[];
  categoryForKeyword: Map<string, string>;
  topics: Topic[];
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

  const categories: ModelCategory[] = [];
  const seenCat = new Set<string>();
  const categoryForKeyword = new Map<string, string>();

  for (const t of topics) {
    const name = t.parentName;
    if (name && !seenCat.has(name)) {
      seenCat.add(name);
      categories.push({ name, type: t.parentType });
    }
    for (const kw of t.keywords) {
      const k = (kw.keyword ?? '').toLowerCase().trim();
      if (k && !categoryForKeyword.has(k)) categoryForKeyword.set(k, name);
    }
  }

  return { categories, categoryForKeyword, topics };
}
