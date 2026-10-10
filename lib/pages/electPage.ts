/**
 * lib/pages/electPage.ts — v7.549
 *
 * THE one rule that decides which existing client page a taxonomy node / cluster / topic
 * row is "your page" (Const II.7 — one rule, every surface; III.5 — a cluster is a page).
 *
 * Before v7.549 two rules coexisted: Product Insights rows showed the URL of the single
 * BEST-RANKED keyword, the cluster builder rooted on the URL with the MOST ranked volume,
 * and both let branded keywords vote. On Citi (Cards) that put "Credit Card Types" on the
 * Strata card page (one branded #1 out of 230 ranked keywords) and "Airline Cards" on the
 * same AAdvantage page as its own "American Airlines" child, with nothing on screen saying
 * so (Wayne 2026-10-09).
 *
 * The rule (pure, deterministic, order-stable):
 *   candidates = the client's REAL ranking rows with a URL (never gap / demand rows)
 *   tier 1  non-branded keywords ranking in the top PAGE_VOTE_MAX_POS   ← the market vote
 *   tier 2  non-branded keywords ranking deeper than that               ← "deep-only"
 *   tier 3  branded keywords only                                       ← "branded-only"
 *   (a branded term is the LAST thing allowed to decide a page — it names a product, not the
 *   theme — which is exactly how Strata ended up as "Credit Card Types" before v7.549)
 *   The first non-empty tier elects; within it: most ranked volume → most keywords → best
 *   position → shorter path → alphabetical. The tier is returned as `basis` so every
 *   surface can label a page that only brand terms or deep ranks put there (I.5).
 *
 * This is the EVIDENCE + FALLBACK half of the page rule. The decider is the intent-matched
 * page map (lib/pages/pageMap.ts resolveNodePage): user override → page map → this vote,
 * labelled as a fallback wherever it is what the row shows.
 */

import { normContentUrl, pathOfNormUrl } from '@/lib/utils/pageUrl';

export const PAGE_RULE_VERSION  = 549;
export const PAGE_VOTE_MAX_POS  = 20;

export type PageBasis = 'non-branded' | 'branded-only' | 'deep-only' | 'none';

export interface PageVoteKw {
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  url?:         string;
  isGap?:       boolean;
  origin?:      'footprint' | 'demand' | string;
  isBranded?:   boolean;
}

export interface PageCandidate {
  url:   string;   // the raw URL as the source row carried it (first seen)
  norm:  string;   // normContentUrl identity
  path:  string;   // pathOfNormUrl(norm)
  vol:   number;   // ranked volume on this URL (all tiers)
  kw:    number;   // ranked keywords on this URL (all tiers)
  best:  number;   // best position on this URL
  /** votes inside the top PAGE_VOTE_MAX_POS by non-branded keywords */
  nbVol: number; nbKw: number;
  /** non-branded votes deeper than PAGE_VOTE_MAX_POS */
  deepNbVol: number; deepNbKw: number;
  /** branded votes at any rank */
  bVol:  number; bKw:  number;
}

export interface PageElection {
  page:       PageCandidate | null;
  basis:      PageBasis;
  /** every client URL ranking for the keywords, most ranked volume first — the picker list */
  candidates: PageCandidate[];
  /** ranked volume across all candidates (the denominator of `share`) */
  rankedVol:  number;
  /** the winner's share of the ranked volume (0..1); 0 when nothing ranks */
  share:      number;
}

export interface PageOverride { url: string; setAt: string; note?: string }
export type PageOverrides = Record<string, PageOverride>;   // key = taxonomy path joined by ' › '

/** The override key for a stored taxonomy path (CatNode.key) or a topic id ('tax:path:…'). */
export const pageOverrideKey = (pathOrId: string | string[]): string =>
  Array.isArray(pathOrId) ? pathOrId.join(' › ') : String(pathOrId ?? '').replace(/^tax:path:/, '');

export const isClientRankedWithUrl = (k: PageVoteKw): boolean =>
  k.position !== null && k.position !== undefined && k.position >= 1 && !k.isGap && k.origin !== 'demand'
  && !!k.url && normContentUrl(k.url) !== '';

const cmp = (a: PageCandidate, b: PageCandidate, volOf: (c: PageCandidate) => number, kwOf: (c: PageCandidate) => number): number =>
  volOf(b) - volOf(a) || kwOf(b) - kwOf(a) || a.best - b.best || a.path.length - b.path.length || (a.norm < b.norm ? -1 : a.norm > b.norm ? 1 : 0);

export function electPage(kws: PageVoteKw[], opts: { maxPos?: number } = {}): PageElection {
  const maxPos = opts.maxPos ?? PAGE_VOTE_MAX_POS;
  const m = new Map<string, PageCandidate>();
  for (const k of kws) {
    if (!isClientRankedWithUrl(k)) continue;
    const norm = normContentUrl(k.url as string);
    const c = m.get(norm) ?? (m.set(norm, { url: k.url as string, norm, path: pathOfNormUrl(norm), vol: 0, kw: 0, best: Infinity, nbVol: 0, nbKw: 0, deepNbVol: 0, deepNbKw: 0, bVol: 0, bKw: 0 }).get(norm)!);
    const v = k.searchVolume || 0, p = k.position as number;
    c.vol += v; c.kw += 1; c.best = Math.min(c.best, p);
    if (k.isBranded) { c.bVol += v; c.bKw += 1; }
    else if (p <= maxPos) { c.nbVol += v; c.nbKw += 1; }
    else { c.deepNbVol += v; c.deepNbKw += 1; }
  }
  const candidates = Array.from(m.values()).sort((a, b) => cmp(a, b, c => c.vol, c => c.kw));
  const rankedVol = candidates.reduce((s, c) => s + c.vol, 0);
  const empty: PageElection = { page: null, basis: 'none', candidates, rankedVol, share: 0 };
  if (candidates.length === 0) return empty;

  const t1 = candidates.filter(c => c.nbKw > 0).sort((a, b) => cmp(a, b, c => c.nbVol, c => c.nbKw));
  if (t1.length) return { page: t1[0], basis: 'non-branded', candidates, rankedVol, share: rankedVol > 0 ? t1[0].vol / rankedVol : 0 };
  const t2 = candidates.filter(c => c.deepNbKw > 0).sort((a, b) => cmp(a, b, c => c.deepNbVol, c => c.deepNbKw));
  if (t2.length) return { page: t2[0], basis: 'deep-only', candidates, rankedVol, share: rankedVol > 0 ? t2[0].vol / rankedVol : 0 };
  const t3 = candidates.filter(c => c.bKw > 0).sort((a, b) => cmp(a, b, c => c.bVol, c => c.bKw));
  if (t3.length) return { page: t3[0], basis: 'branded-only', candidates, rankedVol, share: rankedVol > 0 ? t3[0].vol / rankedVol : 0 };
  return { page: candidates[0], basis: 'deep-only', candidates, rankedVol, share: rankedVol > 0 ? candidates[0].vol / rankedVol : 0 };
}

/** Validate a user-entered page URL against the client domain. Returns the cleaned URL or an error. */
export function validateOverrideUrl(input: string, clientDomain: string): { url: string } | { error: string } {
  let s = String(input ?? '').trim();
  if (!s) return { error: 'Enter a URL.' };
  const host = normContentUrl(clientDomain).split('/')[0];
  if (s.startsWith('/')) s = `https://${host}${s}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return { error: 'That is not a valid URL.' }; }
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host && h !== host && !h.endsWith('.' + host)) return { error: `The page must be on ${host}.` };
  u.hash = '';
  return { url: u.toString().replace(/\/$/, '') };
}
