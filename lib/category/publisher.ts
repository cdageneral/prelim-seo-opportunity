/**
 * lib/category/publisher.ts — v7.537
 *
 * A PUBLISHER / comparison site (BankRate, NerdWallet …) writes about other companies — "chase
 * bank", "american express", "pnc bank" are its content, not someone else's brand. The filer
 * normally sends any third-party brand to "Other"; for a publisher it files them by topic
 * (Wayne, 2026-10-08, "Publisher mode"). Set per project through Industry = PUBLISHER_INDUSTRY
 * (Edit Project), so no new column is needed.
 */
export const PUBLISHER_INDUSTRY = 'Publisher / Comparison site';

export function isPublisherIndustry(industry: string | null | undefined): boolean {
  return /publisher|comparison/i.test(String(industry ?? ''));
}
