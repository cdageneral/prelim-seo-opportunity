/**
 * lib/category/categoryGuard.ts — v7.226
 *
 * SINGLE SOURCE OF TRUTH for the competitor-brand category guard (Constitution III.1a).
 *
 * Background: `_categoryBreakdown.categories` is built from competitor *gap* keywords too,
 * so the raw category list legitimately contains competitor / third-party brand categories
 * (e.g. "Wells Fargo Brand Searches", "529 Schwab"). Per Art. III.1a the GUARD — not the
 * synthesis output — is the enforcement layer: every panel that renders categories from the
 * canonical pool / `_categoryBreakdown` must drop non-client brand categories before render.
 *
 * Until v7.226 each read site re-implemented (or, in KeywordsPanel's case, OMITTED) this
 * guard. This module centralizes the exact logic that ThemeClustersPanel used as the
 * reference implementation (v7.196 / v7.201 / v7.208), so Keyword, Cluster, and any future
 * category read site share ONE guard. Behavior is byte-identical to the prior ThemeClusters
 * inline checks; the only net change is that KeywordsPanel now applies it too.
 *
 * The drop conditions (all three, exactly as ThemeClustersPanel applied them):
 *   1. type === 'brand'  AND the name is not the CLIENT's own brand        → competitor brand
 *   2. name carries an AUTO-DISCOVERED / configured competitor brand token AND not client
 *   3. name carries a USER-BLOCKLISTED brand token                         AND not client
 * The client's OWN brand category is always kept (its name contains the client brand).
 */

import {
  isBrandedKeyword,
  buildCompetitorBrandTokens,
  buildExcludedBrandTokens,
  textHasCompetitorBrand,
} from '@/lib/utils/kwVolume';

export interface CategoryGuard {
  /** True when a category (name, type) is a NON-client brand category that must NOT render. */
  isCompetitorBrandCategory: (name: string, type?: string) => boolean;
  /** Names (verbatim) from `_categoryBreakdown.categories` that this guard drops. */
  droppedCategoryNames: (categories: Array<{ name?: string; type?: string }>) => Set<string>;
}

/**
 * Build the competitor-brand category guard from a Semrush snapshot.
 *
 * @param snap              the semrushSnapshot (carries `competitors`, `_excludedBrands`, `_brandTerms`)
 * @param clientDomain      the targeted client's domain (its brand is protected)
 * @param competitorDomains configured competitor domains (augment auto-discovered set)
 */
export function buildCategoryGuard(
  snap: any,
  clientDomain: string,
  competitorDomains: string[] = [],
): CategoryGuard {
  // Token sets — identical construction to ThemeClustersPanel lines 215/218.
  const compBrandTokens = buildCompetitorBrandTokens(snap, clientDomain, competitorDomains);
  const excludedBrandTokens = buildExcludedBrandTokens(snap);

  // Mirrors ThemeClustersPanel's three `continue` guards at the render loop. The client's
  // own brand category is kept because `isBrandedKeyword(name, clientDomain, [])` is true
  // for it, negating every drop condition. Empty competitor-domain list passed to
  // isBrandedKeyword on purpose — only the CLIENT brand protects a category from the drop
  // (this matches the reference impl exactly).
  const isCompetitorBrandCategory = (name: string, type?: string): boolean => {
    if (!name) return false;
    const isClientBrand = isBrandedKeyword(name, clientDomain, []);
    if (type === 'brand' && !isClientBrand) return true;
    if (textHasCompetitorBrand(name, compBrandTokens) && !isClientBrand) return true;
    if (textHasCompetitorBrand(name, excludedBrandTokens) && !isClientBrand) return true;
    return false;
  };

  const droppedCategoryNames = (
    categories: Array<{ name?: string; type?: string }>,
  ): Set<string> => {
    const out = new Set<string>();
    for (const c of categories ?? []) {
      const nm = String(c?.name ?? '');
      if (nm && isCompetitorBrandCategory(nm, c?.type)) out.add(nm);
    }
    return out;
  };

  return { isCompetitorBrandCategory, droppedCategoryNames };
}
