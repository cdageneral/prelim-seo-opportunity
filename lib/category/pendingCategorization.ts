/**
 * lib/category/pendingCategorization.ts — v7.531
 *
 * Files keywords that carry NO stored category (typically a competitor CSV uploaded
 * after the last categorization) into the project's EXISTING category tree — never
 * a new category (Wayne, 2026-10-07: "there could not be any new categories created
 * which would mean all keywords would have to map and match the intent of the keyword
 * categories"; Const III.1e v0.31).
 *
 * Candidates are the stored categories the shared category guard keeps (so a
 * deselected Step-2 category, or a competitor brand bucket, is never a target). A
 * keyword whose intent matches none of them is filed under "Other" — the same
 * needs-review bucket full categorization uses (III.1e) — so the Step-2 selection
 * decides whether it shows, and selecting "Other" restores it.
 *
 * Pure + dependency-free (no SDK, no DB) so the retained suite can check the prompt,
 * the parser and the membership it writes.
 */

export const OTHER_CATEGORY = 'Other';

export interface CandidateCategory {
  /** 1-based number the model answers with. */
  n:    number;
  /** Leaf category name exactly as stored (`keywordCategories` value). */
  name: string;
  /** Full stored chain, umbrella first (`keywordPaths` value). */
  path: string[];
}

/**
 * Build the numbered candidate list from the stored tree.
 * @param categories   `_categoryBreakdown.categories` (name, type, parent)
 * @param isDropped    the shared category guard's test (competitor brand / out of selection)
 */
export function buildCandidates(
  categories: Array<{ name?: string; type?: string; parent?: string }>,
  isDropped: (name: string, type?: string) => boolean,
): CandidateCategory[] {
  const parentOf = new Map<string, string>();
  for (const c of categories ?? []) {
    const nm = String(c?.name ?? '').trim(); const par = String(c?.parent ?? '').trim();
    if (nm && par && par.toLowerCase() !== nm.toLowerCase()) parentOf.set(nm.toLowerCase(), par);
  }
  const chainOf = (name: string): string[] => {
    const chain = [name]; const seen = new Set([name.toLowerCase()]); let cur = name;
    for (;;) {
      const par = parentOf.get(cur.toLowerCase());
      if (!par || seen.has(par.toLowerCase())) break;
      chain.unshift(par); seen.add(par.toLowerCase()); cur = par;
    }
    return chain;
  };
  const out: CandidateCategory[] = [];
  const seenNames = new Set<string>();
  for (const c of categories ?? []) {
    const name = String(c?.name ?? '').trim();
    if (!name || seenNames.has(name.toLowerCase())) continue;
    if (name.toLowerCase() === OTHER_CATEGORY.toLowerCase()) continue;   // "0" is the Other answer
    if (isDropped(name, c?.type)) continue;
    seenNames.add(name.toLowerCase());
    out.push({ n: out.length + 1, name, path: chainOf(name) });
  }
  return out;
}

/** Prompt for ONE batch. Keywords are numbered 1..k; categories 1..n; 0 = no fit. */
export function buildCategorizePrompt(domain: string, keywords: string[], candidates: CandidateCategory[]): string {
  const cats = candidates.map(c => `${c.n}. ${c.path.join(' > ')}`).join('\n');
  const kws  = keywords.map((k, i) => `${i + 1}. ${k}`).join('\n');
  return `You are filing search keywords into an EXISTING website taxonomy for ${domain}.

CATEGORIES (the only allowed answers):
${cats}

KEYWORDS:
${kws}

Rules:
- For each keyword choose the ONE category whose search intent the keyword matches — what the searcher is trying to find or do, not a shared word.
- You may ONLY answer with a category number from the list above. Never invent, rename or combine categories.
- If no category matches the keyword's intent closely, answer 0.
- Answer every keyword exactly once.

Respond with STRICT JSON only, no prose:
{"a":[[keywordNumber,categoryNumber],...]}`;
}

/**
 * Parse the model's answer. Returns, for each keyword index (0-based), the chosen
 * candidate, or null for "no fit" (0). Keywords the answer omits, or answers with a
 * number that is not on the list, are reported as `unanswered` — they stay pending
 * and are retried; they are never guessed into a category (Const I.5).
 */
export function parseAssignments(
  text: string,
  keywordCount: number,
  candidates: CandidateCategory[],
): { picks: Array<CandidateCategory | null | undefined>; unanswered: number } {
  const picks: Array<CandidateCategory | null | undefined> = new Array(keywordCount).fill(undefined);
  const byN = new Map<number, CandidateCategory>();
  for (const c of candidates) byN.set(c.n, c);
  let pairs: any[] = [];
  const cleaned = String(text ?? '').replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  try {
    const j = JSON.parse(cleaned);
    pairs = Array.isArray(j?.a) ? j.a : [];
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { const j = JSON.parse(m[0]); pairs = Array.isArray(j?.a) ? j.a : []; } catch { pairs = []; } }
  }
  for (const p of pairs) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const ki = Number(p[0]) - 1, ci = Number(p[1]);
    if (!Number.isInteger(ki) || ki < 0 || ki >= keywordCount) continue;
    if (picks[ki] !== undefined) continue;                  // first answer wins
    if (ci === 0) { picks[ki] = null; continue; }
    const hit = byN.get(ci);
    if (hit) picks[ki] = hit;                               // off-list number → stays unanswered
  }
  let unanswered = 0;
  for (let i = 0; i < picks.length; i++) if (picks[i] === undefined) unanswered++;
  return { picks, unanswered };
}

/** Stored-membership entries for the answered keywords (lowercase keys, II.8 shape). */
export function membershipFor(
  keywords: string[],
  picks: Array<CandidateCategory | null | undefined>,
): { paths: Record<string, string[]>; cats: Record<string, string>; filed: number; other: number } {
  const paths: Record<string, string[]> = {};
  const cats:  Record<string, string>   = {};
  let filed = 0, other = 0;
  for (let i = 0; i < keywords.length; i++) {
    const p = picks[i];
    if (p === undefined) continue;                          // unanswered — stays pending
    const k = String(keywords[i] ?? '').toLowerCase().trim();
    if (!k) continue;
    if (p === null) { paths[k] = [OTHER_CATEGORY]; cats[k] = OTHER_CATEGORY; other++; }
    else            { paths[k] = p.path.slice();   cats[k] = p.name;          filed++; }
  }
  return { paths, cats, filed, other };
}
