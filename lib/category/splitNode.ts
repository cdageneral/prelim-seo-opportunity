/**
 * lib/category/splitNode.ts — v7.573
 *
 * Split one over-broad category into sub-categories, each of which is a page (Const III.10).
 *
 * Wayne 2026-10-20, Citi (travel cards): "how can there be only 5 pages overall?" The rebuilt tree
 * held "Credit Cards › Card Types › Travel" as ONE leaf with 137 keywords (117 competitor) —
 * airline cards, hotel cards, no-foreign-fee cards and co-brand searches together — so the page
 * map could only ever give it one page. He chose to fix the cause: split the category.
 *
 * Rules (all enforced here, not left to the model):
 *   - only the node's OWN keywords move, and only DOWN into children of that node, or onto an
 *     EXISTING node elsewhere in the tree that already means the same thing (one concept = one
 *     node, III.1e — the model is handed every stored path and must reuse one when it fits);
 *   - every keyword is placed exactly once (I.3); anything the model leaves out stays on the
 *     parent ("General <node>"), never dropped;
 *   - a group of one keyword is not a page: it stays on the parent (III.11 stray-group collapse);
 *   - a sub-category name never carries another company's brand (III.1); such a group stays on
 *     the parent;
 *   - names are unified case/"&"/plural-insensitively against the node's existing children, so a
 *     re-split never mints "Airline Cards" beside "Airline Card".
 * The proposal is shown to the user before anything is written; the apply step re-validates it.
 */

export interface SplitKeyword { keyword: string; volume: number }
export interface SplitGroup {
  name: string;
  /** full stored path the keywords move to */
  path: string[];
  /** true when the group reuses a node that already exists in the tree */
  existing: boolean;
  keywords: string[];
  volume: number;
}
export interface SplitProposal {
  node: string[];
  groups: SplitGroup[];
  stay: string[];            // keywords that remain on the parent
  stayVolume: number;
  rejected: Array<{ name: string; reason: string; keywords: number }>;
}

const SEP = ' › ';
/** Words that never distinguish two sub-categories of one card/account node ("Airline Credit Cards" = "Airline Card"). */
const FILLER = new Set(['and', 'the', 'for', 'with', 'a', 'of', 'credit', 'card', 'account', 'option',
  // purely linguistic adjectives are never a page of their own (III.1c)
  'best', 'top', 'good', 'great', 'cheap']);
export const unifyLabel = (s: string): string => {
  const toks = String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  const core = toks.filter(w => !FILLER.has(w));
  return (core.length > 0 ? core : toks).sort().join(' ');
};

export function buildSplitPrompt(domain: string, node: string[], kws: SplitKeyword[], allPaths: string[], competitorBrands: string[]): string {
  const list = kws.map((k, i) => `${i + 1}. ${k.keyword} (${k.volume.toLocaleString()}/mo)`).join('\n');
  const tree = allPaths.slice(0, 400).map(p => `- ${p}`).join('\n');
  return `You are organising the content architecture of ${domain}. One category in its stored taxonomy is too broad: every keyword below sits in "${node.join(SEP)}", so it can only ever map to ONE page. Split it into sub-categories where EACH sub-category is a page Google would rank on its own (the Same Page Test: two keywords share a sub-category only if one page could fully answer both).

KEYWORDS IN "${node.join(SEP)}":
${list}

EVERY CATEGORY ALREADY IN THE TREE (reuse one when it is the right home — never invent a duplicate of something listed here):
${tree}

RULES
- Prefer 3-8 sub-categories. Each needs at least 2 keywords. Name each as a page topic a site would have (e.g. "Airline Credit Cards", "Hotel Credit Cards", "No Foreign Transaction Fee Cards") — short, plain, title case.
- "best", "top", "good", "cheap" and years never make a sub-category: "best travel credit cards" and "travel credit cards" are the same page as "${node[node.length - 1]}" itself, so they go in "general".
- No two sub-categories may be answerable by the same page. Airline cards, airline miles cards and frequent-flyer cards are ONE page; travel rewards and travel bonus cards are the general page. Merge such groups.
- A keyword that does not belong in "${node[node.length - 1]}" at all goes to an existing category above, or to "Other" if nothing fits.
- Name sub-categories by product type or user task, never by another company's brand${competitorBrands.length ? ` (${competitorBrands.slice(0, 30).join(', ')} are other companies)` : ''}. A keyword about one specific card of the client's own may share its product-type sub-category.
- If a keyword clearly belongs to a category already listed above (outside "${node.join(SEP)}"), give that full path in "existing" instead of creating a sub-category.
- Keywords that are genuinely general to "${node[node.length - 1]}" (one hub page answers them) go in "general".
- Use each keyword number exactly once.

Return ONLY JSON:
{"groups":[{"name":"<sub-category name>","existing":"<full existing path, or empty>","keywords":[<numbers>]}],"general":[<numbers>]}`;
}

/** The first balanced {...} in a reply (code fences, prose before/after, or a trailing note with braces are all tolerated). */
export function extractFirstJsonObject(text: string): any {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fence ? fence[1] : text;
  const start = src.indexOf('{');
  if (start < 0) return {};
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(src.slice(start, i + 1)); } catch { return {}; } } }
  }
  return {};
}

export function parseSplit(
  text: string,
  node: string[],
  kws: SplitKeyword[],
  allPaths: string[],
  existingChildren: string[],
  isForeignBrand: (name: string) => boolean,
): SplitProposal {
  const raw: any = extractFirstJsonObject(String(text ?? ''));
  const used = new Set<number>();
  const pathSet = new Map<string, string[]>();
  for (const p of allPaths) pathSet.set(p.toLowerCase(), p.split(SEP));
  const nodeKey = node.join(SEP).toLowerCase();
  const childByUnified = new Map<string, string>();
  for (const c of existingChildren) childByUnified.set(unifyLabel(c), c);

  // core label of a proposed name with the node's own words removed ("Travel Cards with Lounge
  // Access" under Travel → "access lounge") — used to catch a new group that IS an existing node
  const nodeToks = new Set(unifyLabel(node[node.length - 1]).split(' '));
  const core = (name: string) => unifyLabel(name).split(' ').filter(w => w && !nodeToks.has(w)).sort().join(' ');
  const existingByCore = new Map<string, string[]>();
  for (const [pk, pp] of Array.from(pathSet.entries())) {
    if (pk === nodeKey || nodeKey.startsWith(pk + SEP) || pk.startsWith(nodeKey + SEP)) continue;   // not self, ancestors or own children
    const c = core(pp[pp.length - 1]);
    if (c && !existingByCore.has(c)) existingByCore.set(c, pp);
  }
  const byPath = new Map<string, SplitGroup>();
  const rejected: SplitProposal['rejected'] = [];
  const take = (arr: any): number[] => {
    const out: number[] = [];
    for (const v of Array.isArray(arr) ? arr : []) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= kws.length && !used.has(n)) { used.add(n); out.push(n); }
    }
    return out;
  };
  for (const g of Array.isArray(raw.groups) ? raw.groups : []) {
    const nums = take(g?.keywords);
    if (nums.length === 0) continue;
    const ex = String(g?.existing ?? '').trim();
    let path: string[] | null = null; let existing = false;
    if (ex) {
      const hit = pathSet.get(ex.toLowerCase());
      // an existing node elsewhere (never the node itself or one of its ancestors)
      if (hit && hit.join(SEP).toLowerCase() !== nodeKey && !nodeKey.startsWith(hit.join(SEP).toLowerCase() + SEP)) { path = hit; existing = true; }
    }
    const name = String(g?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    // a "sub-category" that only restates the node ("Best Travel Credit Cards" under Travel) is the node itself
    if (!path && name && (unifyLabel(name) === unifyLabel(node[node.length - 1]) || core(name) === '')) { for (const n of nums) used.delete(n); continue; }
    if (!path) {
      if (!name) { for (const n of nums) used.delete(n); continue; }
      const same = existingByCore.get(core(name));
      if (same) { path = same; existing = true; }
    }
    if (!path) {
      if (isForeignBrand(name)) { rejected.push({ name, reason: "names another company's brand", keywords: nums.length }); for (const n of nums) used.delete(n); continue; }
      const child = childByUnified.get(unifyLabel(name)) ?? name;
      path = [...node, child];
      existing = existingChildren.includes(child);
    }
    const key = path.join(SEP).toLowerCase();
    const cur = byPath.get(key) ?? { name: path[path.length - 1], path, existing, keywords: [], volume: 0 };
    for (const n of nums) { cur.keywords.push(kws[n - 1].keyword); cur.volume += kws[n - 1].volume; }
    byPath.set(key, cur);
  }
  // single-keyword new groups are not pages → back to the parent
  const groups: SplitGroup[] = [];
  for (const g of Array.from(byPath.values())) {
    if (!g.existing && g.keywords.length < 2) { rejected.push({ name: g.name, reason: 'only one keyword — not a page of its own', keywords: g.keywords.length }); continue; }
    groups.push(g);
  }
  const placed = new Set<string>(groups.flatMap(g => g.keywords));
  const stay = kws.map(k => k.keyword).filter(k => !placed.has(k));
  const vol = new Map(kws.map(k => [k.keyword, k.volume] as const));
  groups.sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name));
  return { node, groups, stay, stayVolume: stay.reduce((s, k) => s + (vol.get(k) ?? 0), 0), rejected };
}

/** Re-validate a reviewed proposal against the CURRENT tree before writing (nothing stale applies). */
export function validateForApply(p: SplitProposal, ownNow: Set<string>, node: string[], allPaths: Set<string>): { ok: boolean; error?: string; moves: Record<string, string[]> } {
  const nodeKey = node.join(SEP).toLowerCase();
  if (p.node.join(SEP).toLowerCase() !== nodeKey) return { ok: false, error: 'The proposal is for a different category', moves: {} };
  const moves: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const g of p.groups) {
    const gk = g.path.join(SEP).toLowerCase();
    const isChild = gk.startsWith(nodeKey + SEP) && g.path.length === node.length + 1;
    if (!isChild && !allPaths.has(gk)) return { ok: false, error: `"${g.path.join(SEP)}" is neither a sub-category of this category nor an existing category`, moves: {} };
    for (const k of g.keywords) {
      const kl = k.toLowerCase().trim();
      if (seen.has(kl)) return { ok: false, error: `"${k}" is placed twice`, moves: {} };
      seen.add(kl);
      if (!ownNow.has(kl)) continue;   // moved or re-filed since the proposal — leave it where it is now
      moves[kl] = g.path.slice();
    }
  }
  return { ok: true, moves };
}
