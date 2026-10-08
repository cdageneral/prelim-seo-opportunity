/**
 * lib/category/brandCategoryType.ts — v7.535
 *
 * The categorization model types each category "brand" | "location" | "procedure". It
 * mis-types whole PRODUCT categories as "brand" — Sono Bello's "Body Contouring & Skin
 * Tightening" (4,947 keywords) and "Education & Resources" (1,820), BankRate's
 * "Mortgages", "Personal Loans", "Savings Accounts", Citi Bank's "Certificates of
 * Deposit". Every brand guard treats a brand-typed category as someone else's brand, so
 * those product keywords — the CLIENT's own included — were removed from every panel
 * (Wayne, 2026-10-08: the client's uploaded terms must always keep their place).
 *
 * A category stays "brand" only when its NAME is a brand bucket: it says "brand"
 * ("Brand Searches", "Co-Branded & Retail Cards", "Cosmetic Brands"), or it carries the
 * client's brand / a project brand term, or a competitor's full brand root. Anything else
 * typed "brand" is a product category and is re-typed "procedure". Labels only — no keyword
 * moves and no volume changes (Const I.1).
 */
import { brandRootOf } from '@/lib/utils/brandRoot';

export interface CategoryLike { name?: string; type?: string; [k: string]: any }

function norm(s: string): string { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

/** Brand tokens a category name may carry: client root, project brand terms, competitor roots. */
export function brandNameTokens(clientDomain: string, competitorDomains: string[] = [], brandTerms: string[] = []): string[] {
  const out = new Set<string>();
  for (const d of [clientDomain, ...competitorDomains]) { const r = brandRootOf(d ?? ''); if (r.length >= 4) out.add(r); }
  for (const t of brandTerms ?? []) { const n = norm(t); if (n.length >= 4) out.add(n); }
  return Array.from(out);
}

/** True when a category NAME reads as a brand bucket. */
export function isBrandBucketName(name: string, tokens: string[]): boolean {
  const n = String(name ?? '');
  if (/\bbrand/i.test(n)) return true;
  const nn = norm(n);
  if (!nn) return false;
  for (const t of tokens) if (nn.includes(t)) return true;
  return false;
}

/**
 * Re-type mis-typed brand categories. Returns the corrected list and the names changed.
 * Never mutates the input.
 */
export function normalizeBrandCategoryTypes<T extends CategoryLike>(
  categories: T[] | undefined | null,
  clientDomain: string,
  competitorDomains: string[] = [],
  brandTerms: string[] = [],
): { categories: T[]; retyped: string[] } {
  const tokens = brandNameTokens(clientDomain, competitorDomains, brandTerms);
  const retyped: string[] = [];
  const list = Array.isArray(categories) ? categories : [];
  const next = list.map(c => {
    if (c?.type !== 'brand' || !c?.name) return c;
    if (isBrandBucketName(String(c.name), tokens)) return c;
    retyped.push(String(c.name));
    return { ...c, type: 'procedure' };
  });
  return { categories: next as T[], retyped };
}
