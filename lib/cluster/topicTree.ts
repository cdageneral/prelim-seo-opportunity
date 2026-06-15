// ─── Shared topical-tree categorization (v7.205) ─────────────────────────────
// Single source of truth (Art II.7) for the deterministic, data-derived topical
// nesting that the Keyword Landscape "Category Breakdown" tree pioneered. Both the
// Keyword panel and the Cluster (Theme clusters) panel build their nested trees
// from THESE primitives, so "Loans › Personal Loans › Bad Credit / Calculator /
// Rates …" depth is computed by exactly one algorithm.
//
// Nothing here is modeled or simulated (Art I.1): every node is a real grouping of
// real keyword rows by recurring distinctive modifiers found in the keywords
// themselves. Metric roll-ups (volume, counts, rank buckets) are the consumer's
// job and are pure arithmetic over each node's own + descendant rows.
//
// The grouping is metric-agnostic and generic over any row carrying a `keyword`
// string, so the Keyword panel (KeywordRow) and the Cluster panel (KwItem) share
// the same logic without sharing their metric shapes.

export type CatNodeType = 'procedure' | 'brand' | 'location';

export interface HasKeyword { keyword: string }

// Stopwords stripped before deriving distinctive modifiers. Identical to the set
// the Keyword panel used through v7.204 (moved here verbatim).
export const CAT_STOP = new Set<string>([
  'the','and','for','with','without','your','you','our','their','this','that','these','those',
  'what','whats','which','who','whom','how','why','when','where','are','was','were','being','been',
  'does','did','can','could','will','would','should','about','near','vs','versus','its','get','getting',
  'got','use','using','need','want','much','many','best','top','online','app','from','into','out',
]);

export function catStem(w: string): string { return w.endsWith('s') ? w.slice(0, -1) : w; }

// Distinctive content tokens of a keyword, excluding stopwords, numbers, and the
// tokens already present in the node's own name (`head`).
export function catModTokens(text: string, head: Set<string>): string[] {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !CAT_STOP.has(w) && !head.has(w) && !/^\d+$/.test(w));
}

// Tokens (and their singular/plural stems) carried by a category/node name — used
// so a child split never re-uses a word already in the parent's name.
export function catHeadTokens(name: string): Set<string> {
  const h = new Set<string>();
  for (const w of name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (w.length >= 3) { h.add(w); h.add(catStem(w)); h.add(catStem(w) + 's'); }
  }
  return h;
}

export function catTitle(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export interface SubSeed { key: string; label: string; tokens: string[]; gram: number; }

// Recurring distinctive modifiers among a node's keywords. Bigrams (order-
// independent) first, then unigrams; each must recur in ≥2 keywords.
export function deriveSubSeeds(kws: ReadonlyArray<HasKeyword>, head: Set<string>): SubSeed[] {
  const uni = new Map<string, number>();
  const bi  = new Map<string, number>();
  const biLabel = new Map<string, Map<string, number>>();
  for (const k of kws) {
    const toks = catModTokens(k.keyword, head);
    const seen = new Set<string>();
    for (const t of toks) if (!seen.has(t)) { uni.set(t, (uni.get(t) ?? 0) + 1); seen.add(t); }
    for (let i = 0; i < toks.length - 1; i++) {
      const a = toks[i], b = toks[i + 1];
      if (a === b) continue;
      const key  = [a, b].slice().sort().join(' ');
      const orig = a + ' ' + b;
      bi.set(key, (bi.get(key) ?? 0) + 1);
      let lm = biLabel.get(key); if (!lm) { lm = new Map(); biLabel.set(key, lm); }
      lm.set(orig, (lm.get(orig) ?? 0) + 1);
    }
  }
  const MIN = 2;
  const seeds: SubSeed[] = [];
  for (const [key, n] of Array.from(bi.entries())) {
    if (n < MIN) continue;
    const parts = key.split(' ');
    let label = key, lbest = -1;
    for (const [orig, c] of Array.from((biLabel.get(key) ?? new Map<string, number>()).entries())) if (c > lbest) { lbest = c; label = orig; }
    seeds.push({ key: 'b:' + key, label: catTitle(label), tokens: parts, gram: 2 });
  }
  for (const [u, n] of Array.from(uni.entries())) {
    if (n < MIN) continue;
    seeds.push({ key: 'u:' + u, label: catTitle(u), tokens: [u], gram: 1 });
  }
  return seeds.sort((a, b) => b.gram - a.gram);
}

// Best modifier seed for a keyword: multi-token seeds need ALL tokens present.
export function bestSubSeed(kw: HasKeyword, head: Set<string>, seeds: SubSeed[]): SubSeed | null {
  const toks = new Set<string>(catModTokens(kw.keyword, head));
  let best: SubSeed | null = null, bestScore = 0;
  for (const s of seeds) {
    let shared = 0;
    for (const t of s.tokens) if (toks.has(t)) shared++;
    if (shared === 0) continue;
    if (s.tokens.length > 1 && shared < s.tokens.length) continue;
    const score = shared * 10 + s.gram;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

export const CAT_MAX_DEPTH = 5;   // safety cap; real trees are 2–3 deep
export const CAT_SPLIT_MIN = 6;   // only split a node holding at least this many keywords

// ─── Generic structural tree ─────────────────────────────────────────────────
// Metric-agnostic: a node carries the rows it owns directly (leaf/remainder) and
// its children. Consumers compute their own roll-ups (volume, counts, rank buckets)
// by walking `own` + `children`. Used by the Cluster panel; the Keyword panel keeps
// its rank-bucket CatNode but builds it from these same primitives.

export interface TopicTreeNode<R extends HasKeyword> {
  id:       string;
  name:     string;
  type:     CatNodeType;
  depth:    number;
  derived:  boolean;            // true = a sub/family we derived; false = real LLM category
  own:      R[];
  children: TopicTreeNode<R>[];
}

// Recursively split a set of rows into data-derived sub-categories. Same splitting
// rules as the Keyword panel's buildSubTree (≥CAT_SPLIT_MIN to split; a child needs
// ≥2 rows; a single all-covering child is just the parent renamed → don't split).
export function buildTopicTree<R extends HasKeyword>(
  id: string, name: string, type: CatNodeType, rows: R[], head: Set<string>, depth: number, derived: boolean,
): TopicTreeNode<R> {
  const node: TopicTreeNode<R> = { id, name, type, depth, derived, own: [], children: [] };
  let seeds: SubSeed[] = [];
  if (type === 'procedure' && rows.length >= CAT_SPLIT_MIN && depth < CAT_MAX_DEPTH) {
    seeds = deriveSubSeeds(rows, head);
  }
  if (seeds.length === 0) { node.own = rows; return node; }

  const groups = new Map<string, R[]>();
  const remainder: R[] = [];
  for (const kw of rows) {
    const s = bestSubSeed(kw, head, seeds);
    if (!s) { remainder.push(kw); continue; }
    let g = groups.get(s.key); if (!g) { g = []; groups.set(s.key, g); }
    g.push(kw);
  }
  const seedByKey = new Map(seeds.map(s => [s.key, s] as const));
  const childKeys = Array.from(groups.keys()).filter(k => (groups.get(k) as R[]).length >= 2);
  for (const k of Array.from(groups.keys())) if ((groups.get(k) as R[]).length < 2) remainder.push(...(groups.get(k) as R[]));

  if (childKeys.length === 0 || (childKeys.length === 1 && remainder.length === 0)) {
    node.own = rows; return node;
  }

  for (const k of childKeys) {
    const seed = seedByKey.get(k) as SubSeed;
    const childHead = new Set(head);
    for (const t of seed.tokens) { childHead.add(t); childHead.add(catStem(t)); childHead.add(catStem(t) + 's'); }
    node.children.push(buildTopicTree(id + '/' + k, seed.label, type, groups.get(k) as R[], childHead, depth + 1, true));
  }
  if (remainder.length > 0) {
    node.children.push({ id: id + '/__rest__', name: `${name} — general`, type, depth: depth + 1, derived: true, own: remainder, children: [] });
  }
  return node;
}

function bumpDepth<R extends HasKeyword>(node: TopicTreeNode<R>, delta: number): void {
  node.depth += delta;
  for (const c of node.children) bumpDepth(c, delta);
}

// Group top-level nodes under a derived parent when ≥2 share the same trailing
// product noun. Members nest (depth +1); unique-noun nodes stay top-level. `volOf`
// is used only for ordering (consumer-provided real roll-up).
export function buildTopicFamilies<R extends HasKeyword>(
  leaves: TopicTreeNode<R>[], volOf: (n: TopicTreeNode<R>) => number,
): TopicTreeNode<R>[] {
  const trailing = (name: string): { stem: string; surface: string } | null => {
    const toks = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 3 && !CAT_STOP.has(w) && !/^\d+$/.test(w));
    if (!toks.length) return null;
    const last = toks[toks.length - 1];
    return { stem: catStem(last), surface: last };
  };
  const byStem = new Map<string, TopicTreeNode<R>[]>();
  const surfaceVote = new Map<string, Map<string, number>>();
  for (const lf of leaves) {
    const t = trailing(lf.name);
    if (!t) continue;
    let arr = byStem.get(t.stem); if (!arr) { arr = []; byStem.set(t.stem, arr); }
    arr.push(lf);
    let sv = surfaceVote.get(t.stem); if (!sv) { sv = new Map(); surfaceVote.set(t.stem, sv); }
    sv.set(t.surface, (sv.get(t.surface) ?? 0) + 1);
  }
  const out: TopicTreeNode<R>[] = [];
  const used = new Set<TopicTreeNode<R>>();
  for (const [stem, members] of Array.from(byStem.entries())) {
    if (members.length < 2) continue;
    const sv = surfaceVote.get(stem) ?? new Map<string, number>();
    let surface = stem, vbest = -1;
    for (const [s, c] of Array.from(sv.entries())) if (c > vbest) { vbest = c; surface = s; }
    const parent: TopicTreeNode<R> = { id: 'fam:' + stem, name: catTitle(surface), type: 'procedure', depth: 0, derived: true, own: [], children: [] };
    for (const m of members) { used.add(m); bumpDepth(m, 1); parent.children.push(m); }
    parent.children.sort((a, b) => volOf(b) - volOf(a));
    out.push(parent);
  }
  for (const lf of leaves) if (!used.has(lf)) out.push(lf);
  return out;
}

// DFS flatten to the rows currently visible given the expanded set.
export function flattenVisibleNodes<R extends HasKeyword>(
  nodes: TopicTreeNode<R>[], expanded: Set<string>, acc: TopicTreeNode<R>[],
): void {
  for (const n of nodes) {
    acc.push(n);
    if (n.children.length > 0 && expanded.has(n.id)) flattenVisibleNodes(n.children, expanded, acc);
  }
}

// Collect all leaf rows under a node (its own rows are leaves only when it has no
// children; otherwise descend). Useful for consumers computing roll-ups.
export function collectRows<R extends HasKeyword>(node: TopicTreeNode<R>): R[] {
  const out: R[] = [...node.own];
  for (const c of node.children) out.push(...collectRows(c));
  return out;
}
