/**
 * lib/category/scopeModel.ts — v7.326
 *
 * SINGLE SOURCE OF TRUTH for the competitor-gap SCOPE gate (Constitution III.1c — new).
 *
 * Problem this solves. A competitor CSV legitimately contributes non-branded gap keywords.
 * Some belong to verticals the client actually competes in ("reverse mortgage" under
 * Mortgages — a real opportunity). Others belong to a vertical the client does NOT operate
 * in ("car insurance" → its own Insurance umbrella with zero client presence). Counting the
 * second kind inflates the client's footprint and total market volume with demand they will
 * never pursue. The scope gate keeps the first kind and quarantines the second.
 *
 * The decision is made at the UMBRELLA (vertical) level, never per keyword — because
 * "reverse mortgage" (keep) and "car insurance" (drop) are BOTH non-branded competitor gaps;
 * what separates them is only the vertical they land in. So:
 *   • CORE      umbrella = the client has real presence in it (≥ CORE_MIN_CLIENT_KW client
 *               footprint keywords) OR a project override pins it core. Counts everywhere.
 *   • ADJACENT  umbrella = competitor-only vertical, client absent. Excluded from every
 *               panel + all volume/footprint totals; surfaced ONLY in the staging panel,
 *               where the user can PROMOTE it (override → core) if the client wants to expand.
 *
 * The AUTO classification (footprint-derived) is computed once in synthesize.ts and STORED on
 * `_categoryBreakdown.umbrellaScope` (Const II.8 — stored, never re-derived lexically at a read
 * site). The per-project OVERRIDE set (promote/demote) is applied at READ time here, so a
 * promote/demote takes effect WITHOUT re-analysis (no re-pull — Const I.1: promoted keywords
 * are already in the snapshot with real volumes).
 *
 * Pure + dependency-free → unit-checkable in the retained regression suite (Const V.6).
 */

export type UmbrellaScope = 'core' | 'adjacent';

/**
 * v7.326: an umbrella counts as CORE when the client's own footprint has at least this many
 * keywords in it. Below it (and with no override pinning it core) the umbrella is a
 * competitor-only vertical → adjacent. ONE tunable knob; brand/location/Other umbrellas are
 * never gated (see classifyUmbrellaScopes). Raise it to demand a stronger client presence
 * before a vertical is treated as core.
 */
export const CORE_MIN_CLIENT_KW = 2;

/** Umbrellas that are structurally never scope-gated (navigational / catch-all). */
export const OTHER_UMBRELLA = 'Other';

const norm = (s: unknown): string => String(s ?? '').toLowerCase().trim();

/**
 * Compute the AUTO scope for every umbrella from client-footprint keyword counts.
 * Called once in synthesize.ts after the taxonomy is built.
 *
 * @param clientKwByUmbrella  umbrella name → count of CLIENT footprint keywords in it
 * @param navUmbrellas        umbrella names that are brand/location/Other (never gated → core)
 * @param threshold           CORE_MIN_CLIENT_KW (injectable for tests)
 * Returns a map keyed by the EXACT umbrella name (canonical casing).
 */
export function classifyUmbrellaScopes(
  clientKwByUmbrella: Map<string, number>,
  navUmbrellas: Set<string>,
  threshold: number = CORE_MIN_CLIENT_KW,
): Record<string, UmbrellaScope> {
  const navNorm = new Set(Array.from(navUmbrellas, norm));
  const out: Record<string, UmbrellaScope> = {};
  for (const [name, count] of Array.from(clientKwByUmbrella.entries())) {
    if (!name) continue;
    if (norm(name) === norm(OTHER_UMBRELLA) || navNorm.has(norm(name))) {
      out[name] = 'core';                       // navigational / catch-all → always core
    } else {
      out[name] = count >= threshold ? 'core' : 'adjacent';
    }
  }
  return out;
}

/**
 * A resolver that answers "is this umbrella adjacent right now?" from the STORED auto scope
 * merged with the per-project OVERRIDE set (override always wins). Built once per read.
 *
 * @param umbrellaScope  STORED `_categoryBreakdown.umbrellaScope` (auto classification)
 * @param overrides      per-project overrides: umbrella name → 'core' | 'adjacent'
 */
export interface ScopeResolver {
  scopeOf:           (umbrella: string) => UmbrellaScope;   // unknown umbrella → 'core' (honest default)
  isAdjacent:        (umbrella: string) => boolean;
  /** lowercased keyword → its umbrella (path[0]) from the stored taxonomy. */
  umbrellaOfKeyword: (kwLower: string) => string | undefined;
  /** true when this keyword's umbrella resolves to adjacent. */
  isAdjacentKeyword: (kwLower: string) => boolean;
  /** every umbrella currently resolving to adjacent. */
  adjacentUmbrellas: string[];
}

export function buildScopeResolver(
  snap: any,
  overrides: Record<string, UmbrellaScope> = {},
): ScopeResolver {
  const cb = snap?._categoryBreakdown ?? null;

  // auto scope (stored) — keyed by normalized name for lookup
  const autoByNorm = new Map<string, UmbrellaScope>();
  const auto: Record<string, any> = cb?.umbrellaScope ?? {};
  for (const [name, sc] of Object.entries(auto)) {
    if (sc === 'core' || sc === 'adjacent') autoByNorm.set(norm(name), sc);
  }
  // overrides win. Base = the per-project overrides injected onto the snapshot at page load
  // (`_scopeOverrides`, mirroring `_brandTerms`) so EVERY buildKwPool caller honours a
  // promote/demote from one source without threading it through each component signature.
  // The explicit `overrides` argument (e.g. an optimistic UI state) takes precedence over it.
  const overByNorm = new Map<string, UmbrellaScope>();
  const snapOverrides: Record<string, any> = (snap?._scopeOverrides && typeof snap._scopeOverrides === 'object') ? snap._scopeOverrides : {};
  for (const [name, sc] of Object.entries(snapOverrides)) {
    if (sc === 'core' || sc === 'adjacent') overByNorm.set(norm(name), sc);
  }
  for (const [name, sc] of Object.entries(overrides ?? {})) {
    if (sc === 'core' || sc === 'adjacent') overByNorm.set(norm(name), sc);
  }

  const scopeOf = (umbrella: string): UmbrellaScope => {
    const k = norm(umbrella);
    if (overByNorm.has(k)) return overByNorm.get(k)!;
    return autoByNorm.get(k) ?? 'core';        // unknown / pre-v7.326 → core (honest gap, Const I.5)
  };
  const isAdjacent = (umbrella: string): boolean => scopeOf(umbrella) === 'adjacent';

  // keyword → umbrella from the stored multi-level taxonomy (path[0])
  const pathByKw: Record<string, any> = cb?.keywordPaths ?? {};
  const umbrellaOfKeyword = (kwLower: string): string | undefined => {
    const p = pathByKw[kwLower];
    return Array.isArray(p) && p.length > 0 ? String(p[0] ?? '').trim() : undefined;
  };
  const isAdjacentKeyword = (kwLower: string): boolean => {
    const u = umbrellaOfKeyword(kwLower);
    return u ? isAdjacent(u) : false;          // no umbrella → not adjacent (keep; honest default)
  };

  // the set of umbrellas currently adjacent = union of names seen in auto + overrides
  const names = new Set<string>();
  for (const name of Object.keys(auto)) names.add(name);
  for (const name of Object.keys(snapOverrides)) names.add(name);
  for (const name of Object.keys(overrides ?? {})) names.add(name);
  const adjacentUmbrellas = Array.from(names).filter(n => isAdjacent(n));

  return { scopeOf, isAdjacent, umbrellaOfKeyword, isAdjacentKeyword, adjacentUmbrellas };
}
