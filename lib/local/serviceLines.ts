/**
 * lib/local/serviceLines.ts — v7.298 (Local Search panel) · v7.337 QC audit B12
 *
 * Derive the Local Search panel's candidate service categories so they MIRROR the
 * Keyword panel's 📍 Local pack categories EXACTLY (Const II.7 — one source of truth).
 *
 * The Keyword panel's Category Breakdown rolls procedure rows up via the STORED
 * multi-level taxonomy paths (`categoryModel.keywordPaths`) into top-level product
 * LINES and badges a line 📍 Local pack when ANY keyword under it triggers a Google
 * Local Pack. This module reproduces that SAME roll-up over the SAME shared
 * `categoryModel`, and returns the top-level PRODUCT lines that are local-pack: the
 * service LINES, not the granular leaf categories the panel used to dump.
 *
 * v7.337 (QC audit B12): the path-tree + single-child-collapse logic is no longer a
 * hand-maintained re-implementation of KeywordsPanel's buildPathTree — BOTH consumers
 * now import the ONE shared builder in lib/category/pathTree, so they can never drift
 * (Const II.7). Output verified byte-equal old-vs-new at real scale in the v7.337
 * harness.
 *
 * Why (v7.298): ≤ v7.297 the Local panel emitted local categories at the canonical LEAF
 * level (`categoryModel.members[].categoryName`), so big informational buckets ("401k",
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
import { buildCollapsedPathForest, type PathTreeNode } from '@/lib/category/pathTree';   // v7.337 (B12): shared with KeywordsPanel.buildPathTree

export interface LocalServiceLine {
  name:          string;
  monthlyDemand: number;   // exact monthly-volume roll-up of the line's own + descendant keywords
  // v7.299 — the line's local-pack keywords (the actual keywords under it that trigger a Google
  // Local Pack, client + gap). These are the real queries the Local panel scans for map-pack rank
  // (no synthetic "{service} {city}" — Const I.1, real Semrush keywords). Lowercased, deduped.
  localKeywords: string[];
}

// The per-keyword item the shared tree holds for this consumer.
interface LineItem { kw: string; vol: number; }

function subtreeVol(n: PathTreeNode<LineItem>): number {
  let v = 0;
  for (let i = 0; i < n.own.length; i++) v += n.own[i].vol;
  for (let i = 0; i < n.children.length; i++) v += subtreeVol(n.children[i]);
  return v;
}
function subtreeHasLocal(n: PathTreeNode<LineItem>, localPackKw: Set<string>): boolean {
  for (let i = 0; i < n.own.length; i++) if (localPackKw.has(n.own[i].kw)) return true;
  for (let i = 0; i < n.children.length; i++) if (subtreeHasLocal(n.children[i], localPackKw)) return true;
  return false;
}
// v7.299 — collect this subtree's keywords that trigger a local pack (deduped into `acc`).
function collectSubtreeLocal(n: PathTreeNode<LineItem>, localPackKw: Set<string>, acc: Set<string>): void {
  for (let i = 0; i < n.own.length; i++) if (localPackKw.has(n.own[i].kw)) acc.add(n.own[i].kw);
  for (let i = 0; i < n.children.length; i++) collectSubtreeLocal(n.children[i], localPackKw, acc);
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

  // Select the PROCEDURE members only (drop brand/location, guarded competitor brands, and
  // the "Other" catch-all) — exactly the procRows the Keyword panel trees — then build the
  // collapsed path tree with the shared builder (v7.337 B12: same code path as the panel).
  const items: LineItem[] = [];
  for (let i = 0; i < model.members.length; i++) {
    const m = model.members[i];
    const cat = dropCategoryNames.has(m.categoryName) ? 'Other' : m.categoryName;
    if (cat === 'Other') continue;                   // catch-all is never a service line
    if (typeByName[cat] !== 'procedure') continue;   // drop brand / location
    const kw = String(m.keyword || '').toLowerCase().trim();
    if (!kw) continue;
    items.push({ kw, vol: m.volume || 0 });
  }
  const forest = buildCollapsedPathForest<LineItem>(items, (it: LineItem) => model.keywordPaths.get(it.kw));

  const out: LocalServiceLine[] = [];
  for (let i = 0; i < forest.length; i++) {
    const n = forest[i];
    if (n.name === 'Other') continue;
    if (!subtreeHasLocal(n, localPackKw)) continue;
    const lkSet = new Set<string>();
    collectSubtreeLocal(n, localPackKw, lkSet);
    out.push({ name: n.name, monthlyDemand: subtreeVol(n), localKeywords: Array.from(lkSet) });
  }
  out.sort((a, b) => b.monthlyDemand - a.monthlyDemand);
  return out;
}
