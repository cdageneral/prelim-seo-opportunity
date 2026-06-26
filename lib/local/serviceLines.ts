/**
 * lib/local/serviceLines.ts — v7.298 (Local Search panel)
 *
 * Derive the Local Search panel's candidate service categories so they MIRROR the
 * Keyword panel's 📍 Local pack categories EXACTLY (Const II.7 — one source of truth).
 *
 * The Keyword panel's Category Breakdown rolls procedure rows up via the STORED
 * multi-level taxonomy paths (`categoryModel.keywordPaths`) into top-level product
 * LINES and badges a line 📍 Local pack when ANY keyword under it triggers a Google
 * Local Pack. This module reproduces that SAME roll-up — the `buildPathTree` logic in
 * KeywordsPanel (path tree + single-child collapse) — over the SAME shared
 * `categoryModel`, and returns the top-level PRODUCT lines that are local-pack: the
 * service LINES, not the granular leaf categories the panel used to dump.
 *
 * Why: ≤ v7.297 the Local panel emitted local categories at the canonical LEAF level
 * (`categoryModel.members[].categoryName`), so big informational buckets ("401k",
 * "net investment income tax", "local advisors", …) leaked in as "services" and the
 * set never matched the Keyword panel's lines. The local KEYWORD set was correct; only
 * the emission LEVEL was wrong — this fixes the level by rolling up to the line.
 *
 * Reads STORED membership/paths only (Const II.8 / III.1b) — never re-derived lexically.
 * Real Semrush volume only (Const I.1/I.3): a line's demand is the exact arithmetic
 * roll-up of its own keywords' monthly volumes (no double count — first-topic-wins
 * membership). ES5-safe (indexed loops; no Map/Set iterator spread — Const V.1a).
 */
import type { CategoryModel } from '@/lib/category/categoryModel';

export interface LocalServiceLine {
  name:          string;
  monthlyDemand: number;   // exact monthly-volume roll-up of the line's own + descendant keywords
}

interface TreeNode {
  name:     string;
  children: TreeNode[];
  ownVol:   number;
  ownKws:   string[];      // lowercased keywords whose most-specific home is this node
}

function collapseSingleChild(node: TreeNode): TreeNode {
  for (let i = 0; i < node.children.length; i++) node.children[i] = collapseSingleChild(node.children[i]);
  // a node with exactly one child and no page-keywords of its own is a redundant level
  let n = node;
  while (n.children.length === 1 && n.ownKws.length === 0) n = n.children[0];
  return n;
}
function subtreeVol(n: TreeNode): number {
  let v = n.ownVol;
  for (let i = 0; i < n.children.length; i++) v += subtreeVol(n.children[i]);
  return v;
}
function subtreeHasLocal(n: TreeNode, localPackKw: Set<string>): boolean {
  for (let i = 0; i < n.ownKws.length; i++) if (localPackKw.has(n.ownKws[i])) return true;
  for (let i = 0; i < n.children.length; i++) if (subtreeHasLocal(n.children[i], localPackKw)) return true;
  return false;
}

/**
 * The local-pack PRODUCT service lines, highest real monthly demand first. Empty when the
 * analysis carries no stored taxonomy paths (honest gap, Const I.5) or no local signal.
 *
 * @param model        the shared canonical category model (same source the Keyword/Cluster/
 *                     Journey panels read — Const II.7).
 * @param localPackKw  lowercased keywords whose Google SERP shows a Local Pack (the same set
 *                     the Keyword panel badges from — footprint roll-up + uploaded SERP cells).
 * @param dropCategoryNames competitor-brand category names to suppress (Const III.1a) — pass the
 *                     guard's drop set so a competitor brand can never surface as a "service".
 */
export function buildLocalServiceLines(
  model:             CategoryModel,
  localPackKw:       Set<string>,
  dropCategoryNames: Set<string> = new Set<string>(),
): LocalServiceLine[] {
  if (!model || model.keywordPaths.size === 0 || localPackKw.size === 0) return [];

  // category NAME → coarse type (brand/location kept; demand/problem render as procedure) —
  // the SAME rule KwCategorySection uses to select the procedure rows it trees.
  const typeByName: Record<string, 'procedure' | 'brand' | 'location'> = {};
  for (let i = 0; i < model.categories.length; i++) {
    const c = model.categories[i];
    typeByName[c.name] = (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure';
  }

  // Build the path tree over PROCEDURE members only (drop brand/location, guarded competitor
  // brands, and the "Other" catch-all) — exactly the procRows the Keyword panel trees.
  const roots: TreeNode[] = [];
  const byKey = new Map<string, TreeNode>();
  const ensure = (path: string[]): TreeNode => {
    let key = '';
    let children = roots;
    let node: TreeNode | null = null;
    for (let d = 0; d < path.length; d++) {
      key = key ? key + ' › ' + path[d] : path[d];
      let n = byKey.get(key);
      if (!n) { n = { name: path[d], children: [], ownVol: 0, ownKws: [] }; byKey.set(key, n); children.push(n); }
      node = n; children = n.children;
    }
    return node as TreeNode;
  };

  for (let i = 0; i < model.members.length; i++) {
    const m = model.members[i];
    const cat = dropCategoryNames.has(m.categoryName) ? 'Other' : m.categoryName;
    if (cat === 'Other') continue;                   // catch-all is never a service line
    if (typeByName[cat] !== 'procedure') continue;   // drop brand / location
    const kw = String(m.keyword || '').toLowerCase().trim();
    if (!kw) continue;
    const path = model.keywordPaths.get(kw);
    const leaf = ensure(path && path.length ? path : ['Other']);
    leaf.ownVol += m.volume || 0;
    leaf.ownKws.push(kw);
  }

  const out: LocalServiceLine[] = [];
  for (let i = 0; i < roots.length; i++) {
    const n = collapseSingleChild(roots[i]);
    if (n.name === 'Other') continue;
    if (!subtreeHasLocal(n, localPackKw)) continue;
    out.push({ name: n.name, monthlyDemand: subtreeVol(n) });
  }
  out.sort((a, b) => b.monthlyDemand - a.monthlyDemand);
  return out;
}
