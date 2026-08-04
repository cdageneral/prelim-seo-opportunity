/**
 * lib/keywords/footprintDomains.ts   (v7.402)
 *
 * ONE normalisation for uploaded-keyword-footprint domains.
 *
 * Why this file exists: the uploader (/api/projects/[id]/keywords/batch) decides
 * which bucket a CSV row lands in by normalising the posted domain inline. Any
 * OTHER code that wants to count or delete those rows has to normalise EXACTLY
 * the same way — one character of drift (e.g. also stripping a bare leading
 * "www.") and the delete filter silently matches nothing while reporting
 * success, which is the worst possible failure for a "clear my data" control.
 * So the writer and the reader/deleter now import the same function.
 *
 * Client rows are stored under the canonical BLANK domain tag (v7.143), with
 * legacy rows possibly carrying NULL or the literal client domain — that is the
 * client bucket, and it is three tags wide. Competitor rows carry their own
 * normalised domain.
 */

/** Normalise a domain the way the CSV uploader stores it. Must stay byte-identical
 *  to the expression the batch route used before v7.402:
 *    domain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
 *  (a bare "www.x.com" with no protocol is deliberately NOT stripped — that is
 *  how existing rows were written, and rewriting the rule would orphan them). */
export function normalizeFootprintDomain(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('/')[0];
}

/** True when an upload/clear for `domainNorm` targets the CLIENT bucket rather
 *  than a competitor: an empty domain, or the project's own domain. */
export function isClientFootprintDomain(domainNorm: string, clientDomainNorm: string): boolean {
  return domainNorm === '' || (clientDomainNorm !== '' && domainNorm === clientDomainNorm);
}
