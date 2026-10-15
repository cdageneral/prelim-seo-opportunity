// ─────────────────────────────────────────────────────────────────────────────
// lib/keywords/positionBasis.ts — v7.451
//
// THE single place that decides whether a stored keyword row is an ORGANIC
// RANKING (Const II.7). Wayne, 2026-08-14, on seeing "gross income · #1" while
// Google showed no Synchrony result on page 1:
//   "is this rank data coming from our keyword list and csv file upload?"
//
// It was. Semrush's Positions export carries a "Position Type" column whose
// value is `Organic` OR a SERP-feature name (People also ask, Things to know,
// Featured snippet, …) — and a FEATURE placement is exported with Position = 1.
// The CSV parser never read that column, so feature placements entered the
// canonical pool as organic #1s. Verified against Semrush on 2026-08-14:
// synchrony.com held NO organic position for "gross income" (its page holds a
// People-also-ask slot for a variant), and its true best for "high yield
// savings account" was #20, not the stored #1.
//
// That is a Const I.4 break — organic rank and SERP-feature presence are two
// different lenses and must never be blended into one number. This module keeps
// them apart, and every read site goes through it (buildKwPool is the chokepoint,
// mirroring the III.1d scope-gate precedent) so no panel can reintroduce the mix.
//
// Three states, deliberately distinguishable (Const I.5 — absence is not zero):
//   'organic'  — a real blue-link position. Counts as a ranking.
//   'feature'  — the client held a SERP feature here. Real, valuable, and NOT a
//                rank: it is reported as feature presence beside the organic
//                position (Wayne's choice, 2026-08-14: show the true organic
//                rank with a badge, never drop the feature signal).
//   'unknown'  — the row predates this release (no Position Type captured), so
//                whether its position is organic is NOT KNOWN. Legacy rows keep
//                rendering on their stored position — retro-scoring them would
//                invent data — but every surface says the basis is unverified
//                until the project is verified.
// ─────────────────────────────────────────────────────────────────────────────

export type PositionBasis = 'organic' | 'feature' | 'unknown';

/** Semrush writes exactly this for a blue-link result. Case/space tolerant. */
const ORGANIC_TOKENS = ['organic'];

/**
 * Feature names Semrush emits in Position Type. Not used as an allowlist — ANY
 * non-organic value is treated as a feature — but kept so a row can be labelled
 * with what it actually held.
 */
export const KNOWN_FEATURE_TYPES = [
  'People also ask', 'Things to know', 'Featured snippet', 'Knowledge panel',
  'Local pack', 'Image pack', 'Video', 'Video carousel', 'Reviews', 'Sitelinks',
  'AI overview', 'Instant answer', 'FAQ', 'Discussions and forums', 'Related searches',
];

/** Normalise a stored Position Type cell. Empty / absent => unknown, never organic. */
export function positionBasisOf(positionType: string | null | undefined): PositionBasis {
  const raw = String(positionType ?? '').trim();
  if (!raw) return 'unknown';
  const low = raw.toLowerCase();
  // A Semrush cell can list several types for one keyword ("Organic, People also ask").
  // Organic anywhere in the list means the row DOES hold a blue link.
  const parts = low.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.some(p => ORGANIC_TOKENS.includes(p))) return 'organic';
  return 'feature';
}

/** The feature label to show beside a row, or null when it held none / unknown. */
export function featureLabelOf(positionType: string | null | undefined): string | null {
  const raw = String(positionType ?? '').trim();
  if (!raw) return null;
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const feats = parts.filter(p => !ORGANIC_TOKENS.includes(p.toLowerCase()));
  return feats.length > 0 ? feats.join(', ') : null;
}

/**
 * The position a rank metric may use.
 *
 *  - 'organic'  -> the stored position.
 *  - 'feature'  -> null. The client holds a box, not a ranking; counting it as
 *                  one is what inflated every page-1 metric before v7.451.
 *  - 'unknown'  -> the stored position, because a legacy row's position is
 *                  usually a real rank and blanking it would delete true data
 *                  we cannot re-derive (I.5). Surfaces flag the project as
 *                  unverified instead.
 */
export function organicPositionOf(
  position: number | null | undefined,
  positionType: string | null | undefined,
): number | null {
  const p = position == null ? null : Number(position);
  if (p == null || !Number.isFinite(p) || p < 1) return null;
  return positionBasisOf(positionType) === 'feature' ? null : p;
}

/**
 * v7.557 — a stored row whose Position Type lists BOTH "Organic" AND a SERP feature,
 * written before v7.557 and never verified. Until v7.557 the uploader collapsed a
 * keyword's duplicate export rows BEST-position-wins across ALL of them (v7.405) and
 * unioned their types (v7.451) — so when Semrush listed an AI-overview / Local-pack slot
 * at #1 and the organic result at #8, the stored row became "#1 · Organic, AI overview",
 * an organic #1 that never existed (USAA export 2026-10-14: 83 keywords, 29 of them not
 * on page 1 organically). The basis of such a row's POSITION is therefore unproven.
 *
 * From v7.557 the uploader takes the rank from Organic rows only and stamps
 * `positionVerifiedAt` on every row whose basis it read from the file, so a mixed row
 * WITH a stamp is trustworthy and a mixed row WITHOUT one is legacy-suspect.
 */
export function isLegacyMixed(
  positionType: string | null | undefined,
  positionVerifiedAt: unknown,
): boolean {
  if (positionVerifiedAt) return false;
  return positionBasisOf(positionType) === 'organic' && featureLabelOf(positionType) !== null;
}

/** Does this row hold a SERP feature (whatever its organic position)? */
export function holdsFeature(positionType: string | null | undefined): boolean {
  return featureLabelOf(positionType) !== null;
}

export interface BasisCoverage {
  total:    number;   // rows considered
  organic:  number;   // Position Type captured and organic
  feature:  number;   // Position Type captured and a feature placement
  unknown:  number;   // basis not proven: pre-v7.451 rows (no type captured) + v7.557 legacy-mixed rows
  /** True when nothing in the set carries a captured Position Type. */
  allUnknown: boolean;
}

/**
 * How much of a row set has a KNOWN basis. Drives the honest "these positions
 * have not been verified" banner — a project is only clean once every client row
 * carries a captured type (uploaded with the column, or set by verification).
 */
export function basisCoverage(
  // v7.557: a row that CARRIES the `positionVerifiedAt` key (rows read from the DB do) is
  // judged for the legacy-mixed defect — see isLegacyMixed. Rows without the key (pure
  // fixtures, older callers) keep the v7.451 reading unchanged.
  rows: Array<{ positionType?: string | null; position?: number | null; positionVerifiedAt?: unknown }>,
  // v7.455: only positions inside the RISK WINDOW count. A SERP feature is exported at
  // position 1, so a row at #35 cannot be one — counting it as "unverified" made the
  // banner cry wolf after a successful run (348 flagged, every one of them deeper than
  // #20, on a project whose page-1 numbers were by then correct).
  window = 20,
): BasisCoverage {
  let organic = 0, feature = 0, unknown = 0;
  for (const r of rows) {
    if (r?.position == null) continue;
    if (window > 0 && Number(r.position) > window) continue;
    const legacy = Object.prototype.hasOwnProperty.call(r, 'positionVerifiedAt')
      && isLegacyMixed(r.positionType, r.positionVerifiedAt);
    const b = legacy ? 'unknown' : positionBasisOf(r.positionType);
    if (b === 'organic') organic++; else if (b === 'feature') feature++; else unknown++;
  }
  const total = organic + feature + unknown;
  return { total, organic, feature, unknown, allUnknown: total > 0 && organic === 0 && feature === 0 };
}
