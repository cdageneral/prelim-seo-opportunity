/**
 * lib/category/selectionCarry.ts — v7.570
 *
 * Carry the Keyword Selection boundary across a rebuilt category tree.
 *
 * Wayne 2026-10-20, after Refresh Analysis on Citi (travel cards): "i refreshed and rebuilt and i
 * lost my category boundaries". The selection store (projects.hidden_categories) names NODES by
 * path. A re-analysis re-derives the tree, so nodes are renamed or regrouped ("Management" →
 * "Card Management"); 56 of 79 stored hides then pointed at paths that no longer existed, and
 * every new node defaulted to selected. Measured on the live project, 2026-10-20.
 *
 * The rule here: the KEYWORD is the stable unit, not the node name. Each keyword's in/out status
 * is read from the previous tree with the SAME matchers buildKwPool uses (selectionScope, II.7).
 * Then every node of the new tree is decided from its own keywords:
 *   - no keyword of the node was in scope before          → out (hidden, top-most node only)
 *   - every known keyword was in scope                    → in
 *   - mixed                                               → descend; a leaf takes the majority
 *   - a node with no known keyword (all new) → out, because a selection existed; new keywords
 *     inside a node whose known keywords were all in follow that node (in). Re-ticking an
 *     out node is one click in Step 2.
 * Keywords held under a brand-typed node (v7.566) were not in scope, so they count as out.
 * A partly-selected node's own keywords follow v7.567: kept only with an own:'include' marker,
 * written when most of them were in scope before.
 *
 * Nothing is invented: the output is a deterministic function of the stored previous tree, the
 * stored previous selection and the stored new tree. The UI states the before/after counts.
 */

import { hiddenMatchers, pathIsHidden, ownIsOutOfScope, type HiddenEntry } from '@/lib/category/selectionScope';

export interface CarryTree {
  keywordPaths:       Record<string, string[]>;
  keywordCategories?: Record<string, string>;
  categories?:        Array<{ name?: string; type?: string }>;
}

export interface CarryResult {
  hidden:          HiddenEntry[];
  /** keywords in both trees, and how many of them were in scope before / are after */
  shared:          number;
  inBefore:        number;
  inAfter:         number;
  /** shared keywords whose status flipped (majority rule on a mixed leaf) */
  flipped:         number;
  /** new-tree keywords the previous tree never had (they follow their node) */
  newKeywords:     number;
  /** previous hides that no longer matched any node of the new tree */
  staleBefore:     number;
}

const SEP = ' › ';
const clean = (p: unknown): string[] => (Array.isArray(p) ? p.map(s => String(s ?? '').trim()).filter(Boolean) : []);

/** Which stored hide keys no longer exist as a node of this tree (the "lost boundary" signal). */
export function staleHideKeys(hidden: unknown, keywordPaths: Record<string, string[]>): string[] {
  const nodes = new Set<string>();
  for (const p of Object.values(keywordPaths ?? {})) {
    const c = clean(p);
    for (let i = 1; i <= c.length; i++) nodes.add(c.slice(0, i).join(SEP).toLowerCase());
  }
  const out: string[] = [];
  for (const h of (Array.isArray(hidden) ? hidden : [])) {
    if (!h || typeof h !== 'object' || (h as any).own) continue;
    const k = String((h as any).key ?? '').trim();
    if (k && !nodes.has(k.toLowerCase())) out.push(k);
  }
  return out;
}

/** In-scope status of every keyword under a tree + selection — the buildKwPool selection rule. */
export function keywordScope(tree: CarryTree, hidden: unknown): Map<string, boolean> {
  const m = hiddenMatchers(hidden);
  const brand = new Set<string>();
  for (const c of tree.categories ?? []) if (c?.type === 'brand' && c?.name) brand.add(String(c.name).toLowerCase().trim());
  const out = new Map<string, boolean>();
  for (const [kw, raw] of Object.entries(tree.keywordPaths ?? {})) {
    const path = clean(raw);
    const key = kw.toLowerCase().trim();
    if (!key) continue;
    if (path.length === 0) { out.set(key, false); continue; }
    if (path.some(p => brand.has(p.toLowerCase()))) { out.set(key, false); continue; }   // held (v7.566)
    if (pathIsHidden(path, m)) { out.set(key, false); continue; }
    if (ownIsOutOfScope(path.join(SEP).toLowerCase(), m)) { out.set(key, false); continue; }
    out.set(key, true);
  }
  return out;
}

interface Node { name: string; path: string[]; children: Map<string, Node>; own: string[]; all: string[] }

export function carrySelection(prev: CarryTree, prevHidden: unknown, next: CarryTree, nowIso = new Date().toISOString()): CarryResult {
  const before = keywordScope(prev, prevHidden);
  const hasSelection = Array.isArray(prevHidden) && prevHidden.some((h: any) => h && !h.own);
  const empty: CarryResult = { hidden: [], shared: 0, inBefore: 0, inAfter: 0, flipped: 0, newKeywords: 0, staleBefore: staleHideKeys(prevHidden, next.keywordPaths).length };
  if (!hasSelection) return empty;   // nothing was deselected — nothing to carry

  const brand = new Set<string>();
  for (const c of next.categories ?? []) if (c?.type === 'brand' && c?.name) brand.add(String(c.name).toLowerCase().trim());

  // the new tree, keyed case-insensitively at each level
  const roots = new Map<string, Node>();
  for (const [kw, raw] of Object.entries(next.keywordPaths ?? {})) {
    const path = clean(raw);
    const key = kw.toLowerCase().trim();
    if (!key || path.length === 0) continue;
    let level = roots; let node: Node | null = null;
    for (let i = 0; i < path.length; i++) {
      const id = path[i].toLowerCase();
      let n = level.get(id);
      if (!n) { n = { name: path[i], path: path.slice(0, i + 1), children: new Map(), own: [], all: [] }; level.set(id, n); }
      n.all.push(key);
      node = n; level = n.children;
    }
    node!.own.push(key);
  }

  const hidden: HiddenEntry[] = [];
  const decidedIn = new Set<string>();
  const tally = (kws: string[]) => {
    let inN = 0, outN = 0, unknown = 0;
    for (const k of kws) { const s = before.get(k); if (s === true) inN++; else if (s === false) outN++; else unknown++; }
    return { inN, outN, unknown };
  };
  const hide = (n: Node) => {
    const e: HiddenEntry = { name: n.name, kwCount: n.all.length, hiddenAt: nowIso };
    if (n.path.length > 1) e.key = n.path.join(SEP);
    hidden.push(e);
  };
  const keepAll = (n: Node) => { for (const k of n.all) decidedIn.add(k); };

  const walk = (n: Node) => {
    // brand-typed nodes never render and their keywords are held for filing (v7.566) — not a choice
    if (n.path.some(p => brand.has(p.toLowerCase()))) return;
    const t = tally(n.all);
    if (t.inN === 0) { hide(n); return; }
    if (t.outN === 0) { keepAll(n); return; }   // every KNOWN keyword was in — new ones follow it
    if (n.children.size === 0) {
      if (t.inN >= t.outN) keepAll(n); else hide(n);   // a mixed leaf takes the majority
      return;
    }
    // partly selected: decide each child, then this node's own (General) keywords
    const hidesBefore = hidden.filter(h => !h.own).length;
    for (const c of Array.from(n.children.values())) walk(c);
    const descendantHidden = hidden.filter(h => !h.own).length > hidesBefore;
    if (n.own.length > 0) {
      const o = tally(n.own);
      const ownIn = o.inN > 0 && o.inN >= o.outN;
      if (descendantHidden && ownIn) {
        // partly selected: own keywords are out by default (v7.567) — keep them explicitly
        hidden.push({ name: n.name, key: n.path.join(SEP), kwCount: n.own.length, hiddenAt: nowIso, own: 'include' });
        for (const k of n.own) decidedIn.add(k);
      } else if (!descendantHidden && !ownIn) {
        // fully selected children, but its own keywords were out before — drop just those
        hidden.push({ name: n.name, key: n.path.join(SEP), kwCount: n.own.length, hiddenAt: nowIso, own: 'exclude' });
      }
    }
  };
  for (const r of Array.from(roots.values())) walk(r);

  let shared = 0, inBefore = 0, inAfter = 0, flipped = 0, newKeywords = 0;
  const afterScope = keywordScope(next, hidden);
  for (const [k, s] of Array.from(afterScope.entries())) {
    const b = before.get(k);
    if (b === undefined) { newKeywords++; continue; }
    shared++;
    if (b) inBefore++;
    if (s) inAfter++;
    if (b !== s) flipped++;
  }
  return { hidden, shared, inBefore, inAfter, flipped, newKeywords, staleBefore: empty.staleBefore };
}
