/**
 * lib/category/pathTree.ts — v7.337 (QC audit B12)
 *
 * ONE shared path-tree builder (Const II.7 — single source of truth).
 *
 * Builds an N-level tree from each item's stored taxonomy PATH (umbrella → theme →
 * sub → …) and collapses redundant levels: a node with exactly ONE child and no
 * items of its own disappears (Wayne: collapse instead of a depth cap). No lexical
 * guessing — the structure is the stored assignment (Const II.8 / III.1b).
 *
 * Consumers (both previously carried their own copy of this exact logic):
 *   • components/brief/KeywordsPanel.tsx  `buildPathTree` — the Keyword panel's
 *     multi-level category tree (v7.231).
 *   • lib/local/serviceLines.ts `buildLocalServiceLines` — the Local Search panel's
 *     product-line roll-up (v7.298), which mirrored buildPathTree by re-implementation
 *     and could silently drift. Now both import THIS builder; outputs verified
 *     byte-equal old-vs-new for both consumers at real scale in the v7.337 harness.
 *
 * ES5-safe: indexed loops only, no Map/Set iterator spread (Const V.1a).
 */

export interface PathTreeNode<T> {
  /** Full ' › ' joined path from the root to this node (stable across collapse —
   *  a collapsed survivor keeps ITS OWN full-path key, exactly as the Keyword
   *  panel's node ids always did). */
  key:      string;
  /** The node's own path segment (display name). */
  name:     string;
  children: PathTreeNode<T>[];
  /** Items whose MOST-SPECIFIC home is this node. */
  own:      T[];
}

// Post-order single-child collapse: a node with exactly one child and no items of
// its own is a redundant level and is replaced by that child.
function collapseSingleChildNode<T>(node: PathTreeNode<T>): PathTreeNode<T> {
  for (let i = 0; i < node.children.length; i++) node.children[i] = collapseSingleChildNode(node.children[i]);
  let n = node;
  while (n.children.length === 1 && n.own.length === 0) n = n.children[0];
  return n;
}

/**
 * Build the collapsed forest. `pathOf` returns an item's stored path; an item with
 * no path (or an empty one) files under the 'Other' catch-all root — the consumers
 * decide how to treat it (the Keyword panel renders it, the Local panel skips it).
 * First-seen order is preserved for roots, children, and `own` items so consumers'
 * downstream sorts see identical input order to the pre-v7.337 inline builders.
 */
export function buildCollapsedPathForest<T>(
  rows: T[],
  pathOf: (row: T) => string[] | undefined,
): PathTreeNode<T>[] {
  const roots: PathTreeNode<T>[] = [];
  const byKey = new Map<string, PathTreeNode<T>>();
  const ensure = (path: string[]): PathTreeNode<T> => {
    let key = '';
    let children = roots;
    let node: PathTreeNode<T> | null = null;
    for (let d = 0; d < path.length; d++) {
      key = key ? key + ' › ' + path[d] : path[d];
      let n = byKey.get(key);
      if (!n) { n = { key, name: path[d], children: [], own: [] }; byKey.set(key, n); children.push(n); }
      node = n; children = n.children;
    }
    return node as PathTreeNode<T>;
  };
  for (let i = 0; i < rows.length; i++) {
    const p = pathOf(rows[i]);
    const leaf = ensure(p && p.length ? p : ['Other']);
    leaf.own.push(rows[i]);
  }
  const out: PathTreeNode<T>[] = [];
  for (let i = 0; i < roots.length; i++) out.push(collapseSingleChildNode(roots[i]));
  return out;
}
