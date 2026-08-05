/**
 * lib/authority/reconcile.ts — read-time reconciliation of the stored authority
 * snapshot against the project's CURRENT competitor list (v7.407).
 *
 * Why this exists (Wayne, 2026-08-05: "why is the old competitor list still
 * showing and not the new ones?"):
 *
 * `projects.authority_snapshot` is written once, by the authority scan, and it
 * freezes the competitor list as it stood at scan time
 * (app/api/projects/[id]/authority-scan/route.ts §targets). Adding a competitor
 * afterwards never adds a row; deleting one never removes it. Before this
 * module nothing anywhere compared the frozen `domains[]` against the live
 * `competitors` table, so a removed rival kept printing in the panel, in the
 * PDF and in the delivery package — and could still be the "top rival" driving
 * the gap tiles.
 *
 * The fix is a READ-TIME filter, not a re-scan: the snapshot rows are real
 * crawled Semrush index rows (Const I.1) and stay exactly as measured; we only
 * decide which of them are still in scope. Nothing is estimated, nothing is
 * back-filled, and no Semrush units are spent. A competitor added since the
 * last scan has no crawled row to show, so it is reported as `missing` and the
 * read site names it as an honest gap with a re-scan CTA (Const I.5) rather
 * than rendering a blank or zeroed line.
 *
 * ONE reconciler, four read sites (Const II.6/II.7 — no forked math):
 *   • components/brief/GoogleRankAuthoritySection.tsx  (the panel table)
 *   • components/brief/AuthorityCalculatorSection.tsx  (the calculator)
 *   • lib/pdf/assessmentTemplate.ts                    (the PDF section)
 *   • lib/export/deliveryPackage.ts                    (the delivery package)
 *
 * This module is pure: no next/db/server imports, so a client component can
 * import it directly. Domain normalization reuses the shared
 * briefEnrichCore.normalizeDomain (II.7) rather than forking a sixth copy.
 */

import { normalizeDomain } from '@/lib/apis/briefEnrichCore';

/** The structural slice of a snapshot row this module needs. */
export interface AuthorityDomainLike {
  domain: string;
  role:   'client' | 'competitor';
}

export interface AuthorityReconciliation<T extends AuthorityDomainLike> {
  /** The client row, or null when the snapshot holds none. */
  client:  T | null;
  /** Snapshot competitor rows that are STILL tracked, snapshot order preserved. */
  comps:   T[];
  /** Domains in the snapshot that are no longer tracked — filtered out of every view. */
  dropped: string[];
  /** Domains tracked NOW with no crawled row yet — added since the last scan. */
  missing: string[];
  /**
   * True when the caller supplied a live competitor list and it disagreed with
   * the snapshot in either direction. Read sites use this to decide whether to
   * show the staleness notice at all.
   */
  reconciled: boolean;
}

/** Normalized comparison key for a domain. Empty string when unusable. */
export function authorityDomainKey(v: string | null | undefined): string {
  // Lowercased BEFORE normalizing: normalizeDomain's own scheme test is
  // `startsWith('http')`, so an uppercase "HTTPS://…" would miss it and get a
  // second scheme glued on, yielding the host "https". Competitor domains are
  // user-typed, so that spelling reaches here in practice.
  const raw = String(v ?? '').trim().toLowerCase();
  if (!raw) return '';
  return normalizeDomain(raw).toLowerCase();
}

/**
 * Reconcile stored snapshot rows against the live competitor list.
 *
 * `currentCompetitorDomains === null` means "the caller does not know the live
 * list" — the snapshot passes through unfiltered and `reconciled` is false. That
 * is the honest behaviour for a caller with no list to compare against; it is
 * never used to silently skip the filter where a list IS available.
 */
export function reconcileAuthoritySnapshot<T extends AuthorityDomainLike>(
  domains: T[] | null | undefined,
  currentCompetitorDomains: Array<string | null | undefined> | null | undefined,
): AuthorityReconciliation<T> {
  const rows = (domains ?? []).filter(Boolean);
  const client = rows.find(x => x.role === 'client') ?? null;
  const snapComps = rows.filter(x => x.role !== 'client');

  if (currentCompetitorDomains == null) {
    return { client, comps: snapComps, dropped: [], missing: [], reconciled: false };
  }

  const live = new Set<string>();
  const liveDisplay = new Map<string, string>();
  for (const d of currentCompetitorDomains) {
    const k = authorityDomainKey(d);
    if (!k) continue;
    live.add(k);
    // Display the NORMALIZED domain, not the raw typed value: competitor domains
    // are entered by hand ("https://www.second-new.com/") and the missing list
    // sits directly under a table whose every other row is a bare domain.
    if (!liveDisplay.has(k)) liveDisplay.set(k, k);
  }

  const comps:   T[]     = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const row of snapComps) {
    const k = authorityDomainKey(row.domain);
    if (k && live.has(k)) { comps.push(row); seen.add(k); }
    else dropped.push(row.domain);
  }

  const missing: string[] = [];
  live.forEach(k => { if (!seen.has(k)) missing.push(liveDisplay.get(k) ?? k); });

  return { client, comps, dropped, missing, reconciled: true };
}
