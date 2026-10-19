/**
 * lib/local/clientMatch.ts — v7.564
 *
 * ONE rule for "is this Google Maps listing the client?" when the listing carries
 * no website domain (map-pack rows never do — SerpAPI/DataForSEO return title,
 * place id, rating and reviews only).
 *
 * Why this exists (Wayne, 2026-10-16, Sonobello): the Insights panel reported Sono
 * Bello in 0 of 252 local map packs. The stored scan held "Sono Bello Atlanta",
 * "Sono Bello Oklahoma City" and 67 more pack slots — all flagged isClient:false.
 * The scan route matched brand tokens by plain substring: the project is named
 * "Sonobello" and the domain root is "sonobello", but the Google listing title is
 * "Sono Bello …" — the space defeats `indexOf`. Two place-id formats (ChIJ… on the
 * office listings vs the numeric CID on pack rows) also never meet, so the place-id
 * fallback could not rescue it. Verified on the stored scan built 2026-10-16
 * 12:52Z: 69 of 252 packs contain a "Sono Bello" listing, 25 of them at #1.
 *
 * The rule added here is deliberately narrow (Const I.4/I.5 — never invent a
 * client hit): the client's REGISTRABLE domain root (lib/utils/brandRoot, v7.533)
 * must appear inside the listing title with spaces and punctuation removed, and the
 * root must be at least MIN_ROOT letters so a short or generic root cannot match
 * unrelated businesses. Existing matches (website domain, brand tokens, place id)
 * are kept unchanged — this only adds hits, it never removes a stored one.
 *
 * `rematchLocalScan` applies the same rule at READ time to scans stored before
 * v7.564, so every surface (Local panel, Insights decision, PDF, Seer, delivery
 * package) sees the corrected pack without spending a re-scan. Pure; never mutates.
 */

import { brandRootOf } from '@/lib/utils/brandRoot';
import type { LocalScan, LocalPackMember, LocalKeywordScan } from './build';

/** Shortest domain root allowed to match a title by squashed containment. */
export const MIN_ROOT = 6;

function squash(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when the client's domain root appears in the listing title, spacing ignored. */
export function titleMatchesClientRoot(title: string | null | undefined, clientDomain: string | null | undefined): boolean {
  const root = brandRootOf(String(clientDomain ?? ''));
  if (root.length < MIN_ROOT) return false;
  return squash(String(title ?? '')).indexOf(root) >= 0;
}

/** Re-apply the client rule to a stored scan. Returns the same object when nothing changes. */
export function rematchLocalScan<T extends LocalScan | null | undefined>(scan: T, clientDomain: string | null | undefined): T {
  if (!scan || !Array.isArray((scan as LocalScan).keywords)) return scan;
  const s = scan as LocalScan;
  const dom = String(clientDomain || s.domain || '');
  if (brandRootOf(dom).length < MIN_ROOT) return scan;
  let changed = false;
  const keywords: LocalKeywordScan[] = s.keywords.map(c => {
    if (!c || !Array.isArray(c.pack) || c.pack.length === 0) return c;
    let cellChanged = false;
    const pack: LocalPackMember[] = c.pack.map(m => {
      if (!m || m.isClient || !titleMatchesClientRoot(m.title, dom)) return m;
      cellChanged = true;
      return { ...m, isClient: true };
    });
    if (!cellChanged) return c;
    changed = true;
    const mine = pack.filter(m => m.isClient).sort((a, b) => a.position - b.position)[0];
    return {
      ...c,
      pack,
      clientBestRank: c.clientBestRank != null && mine ? Math.min(c.clientBestRank, mine.position) : (mine ? mine.position : c.clientBestRank),
      bestLocationId: c.bestLocationId ?? (mine && mine.placeId ? mine.placeId : null),
    };
  });
  if (!changed) return scan;
  return { ...s, keywords } as T;
}
