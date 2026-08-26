/**
 * lib/category/selectionScope.ts — v7.476
 *
 * Shared model for the Keyword Selection wizard's Step-3 category scope.
 *
 * The scope store IS the v7.419 hidden-categories store (projects.hidden_categories,
 * hydrated onto the snapshot as `_hiddenCategories`, filtered at the buildKwPool
 * chokepoint). This module adds NO second store and NO second filter — it provides:
 *
 *   1. `hiddenMatchers` / `pathIsHidden` — the SAME match semantics buildKwPool
 *      applies (name entries match a path root or a flat stored category name;
 *      `key` entries are ' › '-joined path PREFIXES), as a pure reusable predicate
 *      so the wizard tree and the demand-universe seed gate agree with the pool
 *      byte-for-byte (Const II.7 — one implementation).
 *   2. `buildSelectionTree` — the wizard's category tree with EXACT TypeScript
 *      rollups over the canonical pool (Const I.1/I.3; volume counted once at each
 *      keyword's most-specific node, ancestors aggregate).
 *   3. `gateSeedsByScope` — the Step-4 boundary: a product-expansion seed whose
 *      category falls outside the Step-3 selection is dropped BEFORE any Semrush
 *      request is made (never creates topics outside the selected categories).
 *
 * ES5-safe: no Map/Set iterator spread (Const V.1a).
 */

import { buildCollapsedPathForest, type PathTreeNode } from '@/lib/category/pathTree';

export interface HiddenEntry { name: string; key?: string; kwCount?: number; hiddenAt?: string }

export interface HiddenMatchers {
  /** Lowercased ' › '-joined path prefixes (entries that carry a `key`). */
  hiddenKeys:  string[];
  /** Lowercased names (entries WITHOUT a `key`) — match a path ROOT or a flat stored category name. */
  hiddenNames: Set<string>;
}

/** Parse the stored hidden list into matchers — same parsing as buildKwPool's hidden filter. */
export function hiddenMatchers(hidden: unknown): HiddenMatchers {
  const raw: any[] = Array.isArray(hidden) ? hidden : [];
  const hiddenKeys: string[] = [];
  const hiddenNames = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const h = raw[i];
    if (typeof h === 'string') { const n = h.toLowerCase().trim(); if (n) hiddenNames.add(n); continue; }
    const k = String(h?.key ?? '').toLowerCase().trim();
    if (k) { hiddenKeys.push(k); continue; }
    const n = String(h?.name ?? '').toLowerCase().trim();
    if (n) hiddenNames.add(n);
  }
  return { hiddenKeys, hiddenNames };
}

/**
 * Is a stored taxonomy path hidden by the selection? Mirrors buildKwPool:
 * root-name match against name entries, or joined-path prefix match against key entries.
 */
export function pathIsHidden(path: string[], m: HiddenMatchers): boolean {
  if (!path || path.length === 0) return false;
  if (m.hiddenNames.has(String(path[0] ?? '').toLowerCase().trim())) return true;
  if (m.hiddenKeys.length > 0) {
    const parts: string[] = [];
    for (let i = 0; i < path.length; i++) parts.push(String(path[i] ?? '').trim());
    const joined = parts.join(' › ').toLowerCase();
    for (let i = 0; i < m.hiddenKeys.length; i++) {
      const hk = m.hiddenKeys[i];
      if (joined === hk || joined.indexOf(hk + ' › ') === 0) return true;
    }
  }
  return false;
}

/** Flat stored category name (no path) hidden? Mirrors buildKwPool's `kc` fallback. */
export function flatNameIsHidden(name: string, m: HiddenMatchers): boolean {
  const n = String(name ?? '').toLowerCase().trim();
  return !!n && m.hiddenNames.has(n);
}

// ─── Selection tree ───────────────────────────────────────────────────────────

export interface SelectionNode {
  /** Full ' › ' joined stored-path key (== hidden-categories `key` semantics). */
  key:      string;
  name:     string;
  depth:    number;
  /** Keywords whose most-specific home is this node (own, not rolled up). */
  ownCount: number;
  /** Exact rollup: own + all descendants (Const I.1 — TypeScript sum, never modeled). */
  kwCount:  number;
  /** Exact monthly-volume rollup, same discipline. */
  monthlyVol: number;
  /** In the CURRENT stored selection (before any unsaved wizard edits)? */
  inScope:  boolean;
  children: SelectionNode[];
}

export interface SelectionTree {
  nodes: SelectionNode[];
  totalKw: number;
  totalVol: number;
  inScopeKw: number;
  inScopeVol: number;
}

interface PoolRowLike { keyword: string; searchVolume?: number }

/**
 * Build the wizard's tree over the UNSELECTED pool (callers pass a pool built with
 * `_hiddenCategories: []` so out-of-scope nodes still render, greyed, with their
 * real counts). Membership is READ from stored keywordPaths / keywordCategories —
 * never re-derived lexically (Const II.8). `brandCategoryNames` (lowercased) are
 * excluded from the tree entirely: the client's brand lane is always in scope and
 * is guarded by III.1a, not by the selection.
 */
export function buildSelectionTree(
  pool: PoolRowLike[],
  keywordPaths: Record<string, string[] | undefined> | Map<string, string[]>,
  keywordCategories: Record<string, string | undefined>,
  hidden: unknown,
  brandCategoryNames: Set<string> = new Set<string>(),
): SelectionTree {
  const m = hiddenMatchers(hidden);
  const pathOf = (kwLow: string): string[] | undefined => {
    const p = keywordPaths instanceof Map ? keywordPaths.get(kwLow) : keywordPaths[kwLow];
    if (Array.isArray(p) && p.length > 0) return p;
    const flat = keywordCategories[kwLow];
    if (typeof flat === 'string' && flat.trim()) return [flat.trim()];
    return undefined;   // → 'Other' root in the forest
  };

  const rows = pool.filter(r => {
    const p = pathOf(String(r.keyword ?? '').toLowerCase().trim());
    const root = p && p.length ? String(p[0] ?? '').toLowerCase().trim() : '';
    return !brandCategoryNames.has(root);
  });

  const forest = buildCollapsedPathForest<PoolRowLike>(
    rows,
    (r) => pathOf(String(r.keyword ?? '').toLowerCase().trim()),
  );

  let totalKw = 0, totalVol = 0, inScopeKw = 0, inScopeVol = 0;
  const toNode = (n: PathTreeNode<PoolRowLike>, depth: number, ancestorHidden: boolean): SelectionNode => {
    const selfHidden = ancestorHidden
      || m.hiddenNames.has(n.key.split(' › ')[0].toLowerCase().trim()) && depth === 0
      || m.hiddenNames.has(n.name.toLowerCase().trim()) && depth === 0
      || isKeyHidden(n.key, m);
    let ownVol = 0;
    for (let i = 0; i < n.own.length; i++) ownVol += n.own[i].searchVolume ?? 0;
    const children: SelectionNode[] = [];
    let kwCount = n.own.length, monthlyVol = ownVol;
    for (let i = 0; i < n.children.length; i++) {
      const c = toNode(n.children[i], depth + 1, selfHidden);
      children.push(c);
      kwCount += c.kwCount; monthlyVol += c.monthlyVol;
    }
    children.sort((a, b) => b.monthlyVol - a.monthlyVol);
    if (depth === 0) {
      totalKw += kwCount; totalVol += monthlyVol;
      if (!selfHidden) { /* root-level in-scope accumulation happens below per node */ }
    }
    return { key: n.key, name: n.name, depth, ownCount: n.own.length, kwCount, monthlyVol, inScope: !selfHidden, children };
  };
  const nodes = forest.map(n => toNode(n, 0, false));
  nodes.sort((a, b) => b.monthlyVol - a.monthlyVol);

  // Exact in-scope accounting: walk again counting each node's OWN rows once,
  // honoring per-node inScope (a hidden subtree under a visible root subtracts).
  const walk = (n: SelectionNode): void => {
    if (n.inScope) {
      // own rows of an in-scope node count in-scope
      inScopeKw  += n.ownCount;
      // ownVol not kept on the node — recompute from rollup minus children rollups
      let childVol = 0, childKw = 0;
      for (let i = 0; i < n.children.length; i++) { childVol += n.children[i].monthlyVol; childKw += n.children[i].kwCount; }
      inScopeVol += n.monthlyVol - childVol;
      void childKw;
    }
    for (let i = 0; i < n.children.length; i++) walk(n.children[i]);
  };
  for (let i = 0; i < nodes.length; i++) walk(nodes[i]);

  return { nodes, totalKw, totalVol, inScopeKw, inScopeVol };
}

function isKeyHidden(key: string, m: HiddenMatchers): boolean {
  const joined = key.toLowerCase();
  for (let i = 0; i < m.hiddenKeys.length; i++) {
    const hk = m.hiddenKeys[i];
    if (joined === hk || joined.indexOf(hk + ' › ') === 0) return true;
  }
  return false;
}

// ─── Step-4 seed gate ─────────────────────────────────────────────────────────

/**
 * The Step-4 boundary, enforced server-side BEFORE any Semrush spend: a product
 * seed whose category path falls outside the Step-3 selection is dropped. `seedMap`
 * is the demand route's qualified-seed → "Umbrella › Category" (or "Category") map.
 * Returns kept seeds plus what was gated (for the honest progress message).
 */
export function gateSeedsByScope(
  seeds: string[],
  seedMap: Record<string, string>,
  hidden: unknown,
): { kept: string[]; gated: Array<{ seed: string; label: string }> } {
  const m = hiddenMatchers(hidden);
  if (m.hiddenKeys.length === 0 && m.hiddenNames.size === 0) return { kept: seeds.slice(), gated: [] };
  const kept: string[] = [];
  const gated: Array<{ seed: string; label: string }> = [];
  for (let i = 0; i < seeds.length; i++) {
    const seed  = seeds[i];
    const label = seedMap[seed] ?? seed;
    const path  = label.split(' › ').map(s => s.trim()).filter(Boolean);
    if (pathIsHidden(path, m) || (path.length === 1 && flatNameIsHidden(path[0], m))) {
      gated.push({ seed, label });
    } else {
      kept.push(seed);
    }
  }
  return { kept, gated };
}
