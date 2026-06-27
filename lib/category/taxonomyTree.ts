/**
 * lib/category/taxonomyTree.ts — v7.239
 *
 * THE single shared builder for the multi-level taxonomy tree (Const II.7). Both the Keyword
 * panel and the Cluster panel build their category structure from THIS, over the SAME stored
 * `keywordPaths`, so the two panels can never diverge by construction. The algorithm is the
 * exact one the Keyword panel's Category Breakdown used (umbrella → theme → sub → …): group
 * each keyword by its stored path, collapse redundant single-child levels, roll up metrics
 * arithmetically (every keyword lands in exactly one node → a parent === the exact sum of its
 * descendants; nothing modeled — Const I.1/I.3).
 *
 * Generic over the row type T so each panel keeps its own row shape (KeywordRow / KwItem); the
 * builder only needs a keyword string, a monthly volume, and a client position per row.
 */

// Rank buckets: [top3, 4-10, 11-20, 21+, unranked]. Identical to the Keyword panel's bucketIndexOf.
export function bucketIndexOf(position: number | null): number {
  if (position === null) return 4;
  if (position <= 3)     return 0;
  if (position <= 10)    return 1;
  if (position <= 20)    return 2;
  return 3;
}

export interface TaxoTreeNode<T> {
  id:       string;        // stable: 'path:' + path.join(' › ')
  name:     string;        // this level's label
  path:     string[];      // full path to here (path[0] = umbrella)
  depth:    number;        // 0 = umbrella/top
  kw:       number[];      // count per rank bucket (length 5)
  vol:      number[];      // volume per rank bucket
  posSum:   number[];      // summed position per ranked bucket (for avg)
  totKw:    number;
  totVol:   number;
  own:      T[];           // rows whose MOST-SPECIFIC node is exactly this one (this node's page)
  children: TaxoTreeNode<T>[];
}

export interface RowAccessors<T> {
  keyOf: (r: T) => string;          // lowercased keyword key for the path lookup
  posOf: (r: T) => number | null;   // client position (null = unranked)
  volOf: (r: T) => number;          // monthly search volume
}

function emptyNode<T>(id: string, name: string, path: string[], depth: number): TaxoTreeNode<T> {
  return { id, name, path: [...path], depth, kw: [0,0,0,0,0], vol: [0,0,0,0,0], posSum: [0,0,0,0,0], totKw: 0, totVol: 0, own: [], children: [] };
}

function aggregateNode<T>(node: TaxoTreeNode<T>, acc: RowAccessors<T>): void {
  node.kw = [0,0,0,0,0]; node.vol = [0,0,0,0,0]; node.posSum = [0,0,0,0,0]; node.totKw = 0; node.totVol = 0;
  for (const r of node.own) {
    const pos = acc.posOf(r);
    const v   = acc.volOf(r);
    const b = bucketIndexOf(pos);
    node.kw[b]++; node.vol[b] += v;
    if (pos !== null && b < 4) node.posSum[b] += pos;
    node.totKw++; node.totVol += v;
  }
  for (const c of node.children) {
    aggregateNode(c, acc);
    for (let i = 0; i < 5; i++) { node.kw[i] += c.kw[i]; node.vol[i] += c.vol[i]; node.posSum[i] += c.posSum[i]; }
    node.totKw += c.totKw; node.totVol += c.totVol;
  }
}

function collapseSingleChild<T>(node: TaxoTreeNode<T>): TaxoTreeNode<T> {
  node.children = node.children.map(collapseSingleChild);
  // a node with exactly one child and no page-keywords of its own is a redundant level
  while (node.children.length === 1 && node.own.length === 0) node = node.children[0];
  return node;
}

function setDepth<T>(node: TaxoTreeNode<T>, d: number): void {
  node.depth = d;
  for (const c of node.children) setDepth(c, d + 1);
}

function sortTree<T>(nodes: TaxoTreeNode<T>[]): void {
  nodes.sort((a, b) => b.totVol - a.totVol);
  for (const n of nodes) sortTree(n.children);
}

/**
 * Build the umbrella → theme → sub tree from rows + the stored keyword→path map.
 * Rows whose keyword has no stored path fall under an "Other" root (honest gap, Const I.5).
 */
export function buildTaxonomyTree<T>(
  rows: T[],
  pathOf: Map<string, string[]>,
  acc: RowAccessors<T>,
): TaxoTreeNode<T>[] {
  const roots: TaxoTreeNode<T>[] = [];
  const byKey = new Map<string, TaxoTreeNode<T>>();
  const ensure = (path: string[]): TaxoTreeNode<T> => {
    let key = '';
    let parentChildren = roots;
    let node: TaxoTreeNode<T> | null = null;
    const acc2: string[] = [];
    for (let d = 0; d < path.length; d++) {
      acc2.push(path[d]);
      key = key ? key + ' › ' + path[d] : path[d];
      let n = byKey.get(key);
      if (!n) { n = emptyNode<T>('path:' + key, path[d], [...acc2], d); byKey.set(key, n); parentChildren.push(n); }
      node = n; parentChildren = n.children;
    }
    return node!;
  };
  for (const r of rows) {
    const p = pathOf.get(acc.keyOf(r));
    const leaf = ensure(p && p.length ? p : ['Other']);
    leaf.own.push(r);
  }
  const collapsed = roots.map(collapseSingleChild);
  for (const n of collapsed) aggregateNode(n, acc);
  collapsed.forEach(n => setDepth(n, 0));
  sortTree(collapsed);
  return collapsed;
}

/** DFS flatten to the nodes currently visible given the expanded set. */
export function flattenTaxoVisible<T>(nodes: TaxoTreeNode<T>[], expanded: Set<string>, acc: TaxoTreeNode<T>[]): void {
  for (const n of nodes) {
    acc.push(n);
    if (n.children.length > 0 && expanded.has(n.id)) flattenTaxoVisible(n.children, expanded, acc);
  }
}
