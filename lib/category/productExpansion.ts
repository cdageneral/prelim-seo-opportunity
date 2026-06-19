/**
 * Product-expansion category assignment (v7.243)
 *
 * When "Expand product data" runs, the Semrush-returned keywords must stay INSIDE
 * the existing product categories from the base upload — the rule is "do NOT invent
 * new categories, only expand each existing category into upper/mid-funnel demand"
 * (Wayne's spec). Before this, the expanded keywords carried no stored membership, so
 * every read site dropped them into a single catch-all "Other" node.
 *
 * This module assigns each PRODUCT-lane demand topic to the existing category it was
 * seeded from (the seed phrase IS a base category name), under a deterministic
 * funnel-stage sub-node (Awareness / Education / Benefits / … / FAQs). The result is
 * written into the stored taxonomy (`_categoryBreakdown.keywordPaths` +
 * `keywordCategories`) so every panel reads membership from stored data (Const II.8) —
 * never re-derived lexically. No new TOP-LEVEL category is created; funnel stages are
 * sub-topics within the existing category, exactly as the spec's hierarchy requires.
 *
 * Pure + dependency-free so it is unit-checkable in the retained regression suite
 * (Const V.6). Volumes are untouched (they remain the real Semrush values, Const I.1);
 * the funnel stage is classification metadata, not a measured number.
 */

// Wayne's funnel sub-stages (upper → mid funnel). Order in this list is the display
// order; CLASSIFY order is handled in classifyFunnelStage (most-specific first).
export const FUNNEL_STAGES = [
  'Awareness', 'Education', 'Benefits', 'Comparisons', 'Features', 'Use Cases',
  'How It Works', 'Costs & Fees', 'Eligibility', 'Alternatives', 'Best Options',
  'Reviews', 'FAQs',
] as const;
export type FunnelStage = typeof FUNNEL_STAGES[number];

const FUNNEL_STAGE_SET = new Set<string>(FUNNEL_STAGES.map(s => s.toLowerCase()));

/** True when a stored path's deepest node is a funnel sub-stage we authored (used to
 *  safely remove ONLY expansion-added entries when a product clear runs). */
export function isFunnelStageLabel(label: string): boolean {
  return FUNNEL_STAGE_SET.has(String(label ?? '').toLowerCase().trim());
}

/**
 * Deterministic upper/mid-funnel stage for an expanded keyword. Maps the keyword's
 * intent signal to one of Wayne's stages. Checked most-specific first so e.g.
 * "best rewards card reviews" → Reviews, not Best Options.
 */
export function classifyFunnelStage(keyword: string): FunnelStage {
  const k = ` ${String(keyword ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const has = (...needles: string[]) => needles.some(n => k.includes(` ${n} `) || k.includes(`${n} `) || k.includes(` ${n}`));
  if (has('review', 'reviews', 'rating', 'ratings', 'complaints'))                       return 'Reviews';
  if (has('vs', 'versus', 'compare', 'comparison', 'compared to', 'difference between'))  return 'Comparisons';
  if (has('alternative', 'alternatives', 'instead of', 'similar to'))                     return 'Alternatives';
  if (has('best', 'top', 'top rated', 'leading'))                                         return 'Best Options';
  if (has('cost', 'costs', 'fee', 'fees', 'price', 'pricing', 'rate', 'rates', 'how much', 'cheap', 'cheapest', 'apr')) return 'Costs & Fees';
  if (has('requirement', 'requirements', 'eligibility', 'eligible', 'qualify', 'qualifications', 'who can', 'do i need', 'minimum')) return 'Eligibility';
  if (has('benefit', 'benefits', 'advantage', 'advantages', 'pros', 'pros and cons', 'worth it', 'worth')) return 'Benefits';
  if (has('feature', 'features'))                                                         return 'Features';
  if (has('use case', 'use cases', 'used for', 'how to use', 'uses for', 'when to use'))  return 'Use Cases';
  if (has('how does', 'how do', 'how it works', 'how to', 'how can', 'how are', 'how', 'works', 'work', 'process', 'setup', 'set up')) return 'How It Works';
  if (has('what is', 'what are', 'what does', 'meaning', 'definition', 'explained', 'guide', 'types of')) return 'Education';
  if (has('can i', 'should i', 'why', 'is it', 'are there', 'do you', 'faq', 'faqs', 'questions')) return 'FAQs';
  return 'Education';   // mid-funnel default
}

export interface ExpansionTopic { keyword: string; seeds: string[]; laneHint?: string; }
export interface AssignResult { paths: Record<string, string[]>; cats: Record<string, string>; assigned: number; }

/**
 * Build the stored-membership entries for product-lane expansion topics.
 * @param topics         merged demand topics (only laneHint==='product' are placed)
 * @param categoryNames  existing PROCEDURE category names (canonical casing) from the base upload
 * @param parentOf       lower(category) → umbrella/parent line (from stored taxonomy)
 * @param existingPaths  current `_categoryBreakdown.keywordPaths` (lower kw → path) — base wins, never overwritten
 * Returns ONLY the new entries to merge in.
 */
export function assignProductExpansionPaths(
  topics: ExpansionTopic[],
  categoryNames: string[],
  parentOf: Record<string, string>,
  existingPaths: Record<string, string[]> = {},
): AssignResult {
  // lower(category name) → canonical category name
  const catByLower = new Map<string, string>();
  for (const n of categoryNames) {
    const t = String(n ?? '').trim();
    if (t) catByLower.set(t.toLowerCase(), t);
  }
  const paths: Record<string, string[]> = {};
  const cats: Record<string, string> = {};
  let assigned = 0;

  for (const t of topics) {
    if (t.laneHint !== 'product') continue;
    const kwLower = String(t.keyword ?? '').toLowerCase().trim();
    if (!kwLower) continue;
    if (existingPaths[kwLower]) continue;                 // base/footprint membership wins (Const II.8)

    // Resolve the existing category this topic was seeded from.
    let cat = '';
    for (const s of (t.seeds ?? [])) {
      const hit = catByLower.get(String(s ?? '').toLowerCase().trim());
      if (hit) { cat = hit; break; }
    }
    if (!cat) continue;   // no real existing category → leave unplaced (honest gap, Const I.5)

    const umb = parentOf[cat.toLowerCase()];
    const stage = classifyFunnelStage(t.keyword);
    const path = (umb && umb.toLowerCase() !== cat.toLowerCase()) ? [umb, cat, stage] : [cat, stage];
    paths[kwLower] = path;
    cats[kwLower]  = cat;
    assigned++;
  }
  return { paths, cats, assigned };
}
