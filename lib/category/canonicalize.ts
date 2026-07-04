/**
 * lib/category/canonicalize.ts — v7.339
 *
 * Deterministic taxonomy canonicalization (Const III.1e — one concept, one node).
 *
 * The hierarchical discovery runs in independent 25-keyword batches, so the same
 * concept can come back under trivially different labels ("Wills & Trusts" /
 * "Wills and Trust" / "Trusts & Wills"). Before any LLM cleanup runs, THIS module
 * collapses those variants deterministically in TypeScript — cheap, repeatable,
 * and unit-checkable (Const V.6). Labels only; no keyword moves between concepts
 * here and no volume is touched (Const I.1).
 *
 * What the deterministic pass merges (same concept, different spelling):
 *   • case, punctuation, extra spaces        "wills & trusts" = "Wills & Trusts"
 *   • "&" vs "and" (and a leading "the")     "Wills & Trusts" = "Wills and Trusts"
 *   • plural vs singular per word            "Will" = "Wills", "Trust" = "Trusts"
 *   • word order                             "Trusts & Wills" = "Wills & Trusts"
 * What it never merges: different token sets ("Wills" ≠ "Wills & Trusts",
 * "Secured" ≠ "Unsecured") — those are semantic calls that belong to the LLM
 * re-parenting pass (pathCanonicalizationPrompt), never to string rules.
 *
 * Also home to the MERGE LOG builder: every auto-applied taxonomy change is
 * recorded as {from, to, kind} so the Keyword panel can show exactly what moved
 * where (Wayne 2026-07-03: auto-apply merges, log them visibly).
 *
 * ES5-safe: indexed loops, Array.from over iterator spread (Const V.1a).
 */

export interface MergeLogEntry {
  from: string;                 // raw path, ' › ' joined
  to:   string;                 // canonical path, ' › ' joined
  kind: 'label' | 'reparent';   // label = respelled in place; reparent = moved in the tree
}

/** Max merge-log entries persisted on the breakdown (bounded snapshot growth). */
export const MERGE_LOG_CAP = 800;

// ── Label key: the deterministic "same concept" fingerprint ──────────────────

const KEY_DROP = new Set(['the', 'and', 'a', 'an', 'of', 'for']);

function singularizeToken(t: string): string {
  // Conservative: only strip a plain plural "s". Never touch short tokens or
  // words ending in ss/us/is ("class", "bonus", "analysis") — false merges are
  // worse than missed ones; the LLM pass catches the rest.
  if (t.length > 3 && t.charAt(t.length - 1) === 's') {
    const tail2 = t.slice(-2);
    if (tail2 !== 'ss' && tail2 !== 'us' && tail2 !== 'is') {
      // "ies" → "y" ("annuities" → "annuity") before the plain strip
      if (t.length > 4 && t.slice(-3) === 'ies') return t.slice(0, -3) + 'y';
      return t.slice(0, -1);
    }
  }
  return t;
}

/**
 * Deterministic fingerprint for one taxonomy label. Two labels with the same
 * key are the SAME concept spelled differently — nothing more.
 */
export function labelKey(label: string): string {
  const cleaned = String(label ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const rawTokens = cleaned.split(' ');
  const tokens: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const t = rawTokens[i];
    if (!t || KEY_DROP.has(t)) continue;
    tokens.push(singularizeToken(t));
  }
  if (tokens.length === 0) return cleaned;   // label was all drop-words — keep it distinct
  tokens.sort();
  return tokens.join(' ');
}

export const pathJoin = (p: string[]): string => p.join(' › ');

/**
 * Deterministic label unification across a set of raw paths.
 *
 * Pass 1: group every label (at any level) by its labelKey; the DISPLAY label for
 * a key is the variant used by the most keywords (ties → first seen). Pass 2:
 * rewrite every path with the unified display labels — paths that now spell out
 * identically have merged structurally, for free.
 *
 * @param rawPaths      distinct raw paths from discovery
 * @param weightOfPath  keyword count behind each raw path (display-label voting)
 * @returns             canonical path per input index + the merge log entries
 */
export function unifyLabels(
  rawPaths: string[][],
  weightOfPath: (path: string[]) => number,
): { canonical: string[][]; log: MergeLogEntry[] } {
  // key → { display label → accumulated weight }, plus first-seen order
  const votes = new Map<string, Map<string, number>>();
  const firstSeen = new Map<string, string>();
  for (let i = 0; i < rawPaths.length; i++) {
    const w = Math.max(1, weightOfPath(rawPaths[i]) || 0);
    for (let d = 0; d < rawPaths[i].length; d++) {
      const label = rawPaths[i][d];
      const key = labelKey(label);
      if (!key) continue;
      if (!firstSeen.has(key)) firstSeen.set(key, label);
      let m = votes.get(key);
      if (!m) { m = new Map<string, number>(); votes.set(key, m); }
      m.set(label, (m.get(label) ?? 0) + w);
    }
  }
  const displayOf = new Map<string, string>();
  votes.forEach((m, key) => {
    let best = firstSeen.get(key) as string;
    let bestW = -1;
    m.forEach((w, label) => {
      if (w > bestW) { bestW = w; best = label; }
    });
    displayOf.set(key, best);
  });

  const canonical: string[][] = [];
  const log: MergeLogEntry[] = [];
  for (let i = 0; i < rawPaths.length; i++) {
    const out: string[] = [];
    for (let d = 0; d < rawPaths[i].length; d++) {
      const label = rawPaths[i][d];
      out.push(displayOf.get(labelKey(label)) ?? label);
    }
    canonical.push(out);
    const fromKey = pathJoin(rawPaths[i]);
    const toKey   = pathJoin(out);
    if (fromKey !== toKey) log.push({ from: fromKey, to: toKey, kind: 'label' });
  }
  return { canonical, log };
}

/**
 * Classify an LLM canonicalization change for the merge log: a path respelled in
 * place (same depth, each level the same concept) is a 'label' fix; anything that
 * changed depth or moved to a different parent chain is a 'reparent'.
 */
export function classifyMerge(rawPath: string[], canonPath: string[]): 'label' | 'reparent' {
  if (rawPath.length !== canonPath.length) return 'reparent';
  for (let d = 0; d < rawPath.length; d++) {
    if (labelKey(rawPath[d]) !== labelKey(canonPath[d])) return 'reparent';
  }
  return 'label';
}

// ── Pre-product stored membership (v7.339) ───────────────────────────────────
//
// Wayne's pipeline: pre-product keywords (problem statements / life triggers that
// never name the product) "get categorized and labeled as pre product journey".
// Before this, problem-lane demand topics carried NO stored path, so the Keyword
// panel dumped them into "Other". This files each one, deterministically, under
//   Pre-Product Journey › <Problem Seed>
// — stored membership (Const II.8), additive-only (a base-footprint path always
// wins), reversible (the lane clear strips exactly the paths this root marks).

export const PRE_PRODUCT_ROOT = 'Pre-Product Journey';

export interface PreProductTopic { keyword: string; seeds: string[]; laneHint?: string; }
export interface PreProductAssignResult {
  paths: Record<string, string[]>;
  cats:  Record<string, string>;
  assigned: number;
}

function titleCaseSeed(seed: string): string {
  const s = String(seed ?? '').trim();
  if (!s) return '';
  const parts = s.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    out.push(w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w);
  }
  return out.join(' ');
}

export function assignPreProductPaths(
  topics: PreProductTopic[],
  existingPaths: Record<string, string[]> = {},
): PreProductAssignResult {
  const paths: Record<string, string[]> = {};
  const cats:  Record<string, string>  = {};
  let assigned = 0;
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    if (t.laneHint === 'product') continue;
    const kwLower = String(t.keyword ?? '').toLowerCase().trim();
    if (!kwLower || existingPaths[kwLower]) continue;   // base membership wins (Const II.8)
    const seed = titleCaseSeed((t.seeds && t.seeds.length > 0) ? t.seeds[0] : '');
    paths[kwLower] = seed ? [PRE_PRODUCT_ROOT, seed] : [PRE_PRODUCT_ROOT];
    cats[kwLower]  = PRE_PRODUCT_ROOT;
    assigned++;
  }
  return { paths, cats, assigned };
}

/** True when a stored path was authored by the pre-product filing above. */
export function isPreProductPath(path: string[] | undefined): boolean {
  return Array.isArray(path) && path.length > 0 && path[0] === PRE_PRODUCT_ROOT;
}
