/**
 * lib/utils/pageUrl.ts — v7.541
 *
 * ONE page-identity + path-proposal helper set for the URL-rooted cluster model
 * (Const III.5, revised v0.39): every cluster is a page, every page is a unique URL.
 *
 * - `normContentUrl` MOVED VERBATIM from lib/productInsights.ts (v7.449) so the
 *   cluster builder and the Content Footprint card agree on what "one URL" means
 *   (Const II.7). productInsights re-exports it, so every existing importer is untouched.
 * - `slugifySegment` / `proposePagePath` build the PROPOSED path of a net-new page from
 *   the stored taxonomy labels (umbrella → theme → node). A proposed path is a
 *   recommendation, never data (Const I.1/I.5): every surface that shows it labels it
 *   "proposed", and it is only ever assigned by `uniquePath`, which guarantees no two
 *   clusters — existing or net-new — share a path.
 */

/** One URL identity: strip protocol/www/hash/trailing slash, lowercase. Query kept
 *  (Semrush landing URLs rarely carry one; when they do it distinguishes real pages). */
export const normContentUrl = (u: string): string => {
  let s = String(u ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('#')[0];
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s;
};

/** The path part of a normalized URL ("host/a/b?x" → "/a/b?x"; bare host → "/"). */
export const pathOfNormUrl = (norm: string): string => {
  const i = norm.indexOf('/');
  return i < 0 ? '/' : norm.slice(i) || '/';
};

/** Lowercase, ASCII-safe URL slug: letters/digits only, hyphen-separated, trimmed. */
export const slugifySegment = (s: string): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Proposed path for a net-new page from its taxonomy labels. Adjacent duplicate
 *  segments collapse (a theme-level head node named like its theme yields one segment). */
export const proposePagePath = (labels: string[]): string => {
  const segs: string[] = [];
  for (const l of labels) {
    const sg = slugifySegment(l);
    if (!sg) continue;
    if (segs.length && segs[segs.length - 1] === sg) continue;
    segs.push(sg);
  }
  return '/' + segs.join('/');
};

/** Reserve `path` in `taken`, suffixing -2, -3, … until it is unique. Returns the path
 *  actually reserved. `taken` is mutated so the caller's next call sees this reservation. */
export const uniquePath = (path: string, taken: Set<string>): string => {
  const base = path || '/page';
  let cand = base, n = 2;
  while (taken.has(cand)) { cand = `${base}-${n}`; n++; }
  taken.add(cand);
  return cand;
};
