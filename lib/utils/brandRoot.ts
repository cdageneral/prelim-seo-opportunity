/**
 * lib/utils/brandRoot.ts — v7.533
 *
 * ONE definition of a domain's brand root, used by every brand guard, brand label and
 * brand-term builder (Const II.7).
 *
 * The brand is the REGISTRABLE label — the one directly left of the public suffix — never
 * the first label. Before v7.533 every copy took `split('.')[0]` after stripping the TLD,
 * so a competitor uploaded as "creditcards.chase.com" produced the brand "creditcards":
 * every keyword containing "credit cards" was then treated as a competitor brand term and
 * dropped from the pool (Wayne, 2026-10-08: "i uploaded [competitors] and the overall
 * keyword footprint actually dropped"). The same bug read "business.comcast.com" as
 * "business", "investor.vanguard.com" as "investor" and "shop.audionova.com" as "shop".
 * Now "creditcards.chase.com" → "chase",
 * "en.wikipedia.org" → "wikipedia", "www.citi.com" → "citi", "bank.co.uk" → "bank".
 */

/** Two-part public suffixes seen in our markets (us/uk) and common ccTLD patterns. */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'ltd', 'plc', 'me', 'nhs', 'police', 'sch']);

const TLDS = new Set([
  'com', 'net', 'org', 'io', 'co', 'ca', 'us', 'uk', 'au', 'gov', 'edu', 'biz', 'info',
  'bank', 'app', 'ai', 'mobi', 'insurance', 'finance', 'financial', 'credit', 'loans', 'money',
  'de', 'fr', 'es', 'it', 'nl', 'ie', 'nz', 'in', 'mx', 'br', 'jp', 'cn', 'hk', 'sg', 'za',
]);

/** Lowercase host with protocol, path, port, query and leading "www." removed. */
export function hostOf(domain: string): string {
  return String(domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\d*\./, '')
    .replace(/\.$/, '');
}

/**
 * Registrable brand label of a domain, lowercase, punctuation kept as-is
 * ("bank-of-x.com" → "bank-of-x"). Use `brandRootOf` for the normalized token.
 */
export function brandLabelOf(domain: string): string {
  const labels = hostOf(domain).split('.').filter(Boolean);
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  let end = labels.length;                          // labels[0..end) still candidate
  // A known TLD, any 2-letter ccTLD, or any other short (≤3-letter) final label — the last
  // also absorbs a typo'd suffix ("keybank.con" → "keybank", never "con").
  if (TLDS.has(labels[end - 1]) || /^[a-z]{2,3}$/.test(labels[end - 1])) {
    end--;
    // "co.uk", "com.au" style: a known second-level under a 2-letter ccTLD
    if (end >= 2 && /^[a-z]{2}$/.test(labels[end]) && SECOND_LEVEL.has(labels[end - 1])) end--;
  }
  return labels[Math.max(0, end - 1)] ?? '';
}

/** Normalized brand token ([a-z0-9] only) — the form every brand matcher compares. */
export function brandRootOf(domain: string): string {
  return brandLabelOf(domain).replace(/[^a-z0-9]/g, '');
}
