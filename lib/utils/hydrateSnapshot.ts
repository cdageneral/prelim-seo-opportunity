/**
 * lib/utils/hydrateSnapshot.ts — v7.335 (QC audit B2; B3 groundwork for v7.336)
 *
 * SERVER-SIDE mirror of the client-side snapshot hydration in
 * app/projects/[id]/page.tsx (`analysisForPanels`): the page injects the project
 * row's client brand vocabulary (v7.206), competitor-brand blocklist (v7.208) and
 * scope-gate overrides (v7.326) onto the analysis snapshot as `_brandTerms` /
 * `_excludedBrands` / `_scopeOverrides`, so every buildKwPool caller reads ONE
 * source of truth without per-panel threading (Const II.7).
 *
 * Server routes that build the canonical pool (the PDF export route today; more
 * routes in v7.336 per QC audit B3) previously skipped this injection, so their
 * pools silently ignored brand terms, excluded brands, and scope overrides —
 * diverging from every on-screen panel. Mirrors the page's injection EXACTLY:
 * same Array/object guards, same empty fallbacks.
 */

export function hydrateSnapshotForPool(project: any, snap: any): any {
  // v7.206: client brand vocabulary — page.tsx `brandTerms` memo.
  const brandTerms: string[] =
    Array.isArray(project?.brandTerms) ? (project.brandTerms as string[]) : [];
  // v7.208: competitor-brand blocklist — page.tsx `excludedBrands` memo.
  const excludedBrands: string[] =
    Array.isArray(project?.excludedBrands) ? (project.excludedBrands as string[]) : [];
  // v7.326: per-project scope-gate overrides — page.tsx `scopeOverrides` memo.
  const scopeOverrides: Record<string, 'core' | 'adjacent'> =
    project?.scopeOverrides && typeof project.scopeOverrides === 'object'
      ? (project.scopeOverrides as Record<string, 'core' | 'adjacent'>)
      : {};
  // v7.419: per-project soft-hidden categories — page.tsx `hiddenCategories` memo.
  const hiddenCategories: Array<{ name: string; kwCount: number; hiddenAt: string }> =
    Array.isArray(project?.hiddenCategories)
      ? (project.hiddenCategories as Array<{ name: string; kwCount: number; hiddenAt: string }>)
      : [];
  return {
    ...(snap ?? {}),
    _brandTerms:       brandTerms,
    _excludedBrands:   excludedBrands,
    _scopeOverrides:   scopeOverrides,
    _hiddenCategories: hiddenCategories,
  };
}
