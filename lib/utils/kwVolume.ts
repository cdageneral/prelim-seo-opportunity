/**
 * lib/utils/kwVolume.ts  — v7.76
 *
 * Single source of truth for keyword pool construction and volume metrics.
 *
 * ALL views that display keyword volume — Keyword Landscape summary card,
 * Executive Summary, and Theme Clusters — MUST use buildKwPool / computeVolumeMetrics
 * from this module. Never compute inline in a component.
 *
 * Filtering rules (canonical, mirrors KeywordsPanel buildRows exactly):
 *   topKeywords   — exclude blocked, dedupe, apply clientVolMin threshold
 *   gapKeywords   — exclude blocked, dedupe, skip branded, apply competitorVolMin threshold
 *   uploadedKws   — exclude blocked, dedupe, NO threshold
 */

import { buildScopeResolver, type UmbrellaScope } from '@/lib/category/scopeModel';   // v7.326: scope gate

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KwPoolItem {
  keyword:      string;
  searchVolume: number;    // monthly
  position:     number | null;
  isGap:        boolean;
  isBranded:    boolean;
  competitor:   string | null;
  // ── v7.162: provenance — where the keyword entered the pool from ────────────
  // 'footprint' = ranking data (client crawl + competitor gaps + uploads, §1–4).
  // 'demand'    = deep-journey demand universe (§5) — "missing demand": real
  //               Semrush volume for market demand the footprint never captured.
  // Rank data does NOT override demand and demand does NOT override rank — they are
  // different lenses. Overall MARKET DEMAND = footprint (rank) ∪ demand. A keyword
  // is deduped to ONE row (no double-counted volume); if it exists in both layers
  // the footprint row is kept and flagged `inDemand` (it is also demand-validated).
  origin:       'footprint' | 'demand';
  inDemand?:    boolean;     // appears in the deep-journey demand universe
  demandSeeds?: string[];    // seed phrase(s) that surfaced it in the demand universe
  // v7.251: real client ranking/landing URL for this keyword, when known — from the
  // Semrush footprint (topKeywords[].url) or the uploaded CSV ("URL" column). Real data
  // only (Const I.1); absent for demand/gap keywords and rows with no URL in the source.
  url?:         string;
}

export interface KwPoolOptions {
  semrushSnapshot:    any;
  uploadedKeywords?:  any[];   // DB rows — source='csv'|'manual'. source='blocked' = excluded.
  clientDomain:       string;
  competitorDomains?: string[];
  clientVolMin?:      number;
  competitorVolMin?:  number;
  // v7.206: client brand vocabulary (variants a domain string can't yield, e.g.
  // "toronto-dominion", "easyweb"). Used to label client-brand rows as branded and
  // to protect the client brand footprint from competitor-brand stripping.
  brandTerms?:        string[];
  // v7.162: opt-in. When true, §5 unions the deep-journey demand universe
  // (`semrushSnapshot._demandUniverse.topics`) into the pool as origin:'demand'.
  // Defaults FALSE so every existing caller is byte-for-byte unchanged.
  includeDemand?:     boolean;
  // v7.326: scope gate. `scopeOverrides` = per-project umbrella promote/demote
  // (umbrella name → 'core'|'adjacent'); override wins over the stored auto scope.
  // By default the pool DROPS every keyword in an ADJACENT (competitor-only) umbrella so
  // an out-of-scope vertical (e.g. "car insurance" for a lender) never inflates footprint
  // or volume and never reaches a panel. The staging panel passes includeAdjacent:true to
  // see them. Pre-v7.326 snapshots have no `umbrellaScope` → nothing is adjacent → unchanged.
  scopeOverrides?:    Record<string, UmbrellaScope>;
  includeAdjacent?:   boolean;
}

export interface VolumeMetrics {
  pool:         KwPoolItem[];
  totalMonthly: number;   // sum of monthly search volumes
  totalAnnual:  number;   // totalMonthly × 12
  page1Monthly: number;   // volume where client position ≤ 10
  page1Annual:  number;
  captureRate:  number;   // page1Monthly / totalMonthly  (0–1)
}

// ─── Brand helpers (identical to KeywordsPanel implementation) ────────────────

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function extractBrand(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\.(com|net|org|io|co|ca|us|uk|au|gov|edu|biz|info)(\.[a-z]{2})?$/i, '')
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * v7.201: STRICT competitor brand-token set, derived from a snapshot's AUTO-DISCOVERED
 * organic competitors (`snap.competitors[].domain`, e.g. "schwab.com") PLUS any
 * configured competitor domains and uploaded competitor-CSV domains.
 *
 * Why this exists: brand stripping previously only knew the competitors the USER typed
 * plus the AI-flagged terms. A brand the user never configured — but which Semrush
 * auto-discovered as a top organic competitor — was invisible, so client-ranked terms
 * like "schwab 529" and a procedure category literally named "529 Schwab" survived. The
 * auto-discovered list is REAL Semrush data already in the snapshot (no AI, no re-run).
 *
 * Tokens are FULL domain brand roots only (≥4 chars) — no fuzzy half-tokens / edit
 * distance — so generic theme words ("529", "plan", "college") are never matched and
 * the over-matching that the looser `isBrandedKeyword` path can cause is avoided. The
 * client's OWN brand token is removed from the set so the client footprint is never
 * stripped.
 */
export function buildCompetitorBrandTokens(
  snap: any,
  clientDomain: string,
  configCompetitorDomains: string[] = [],
  uploadedGapDomains: string[] = [],
): Set<string> {
  const autoCompDomains: string[] = Array.isArray(snap?.competitors)
    ? snap.competitors.map((c: any) => String(c?.domain ?? '')).filter(Boolean)
    : [];
  const all = Array.from(new Set(
    [...configCompetitorDomains, ...uploadedGapDomains, ...autoCompDomains].filter(Boolean),
  ));
  const tokens = new Set<string>(all.map(extractBrand).filter(b => b.length >= 4));
  // Never strip the client's own brand — drop its token(s) from the competitor set.
  for (const ct of [clientDomain].map(extractBrand).filter(b => b.length >= 4)) tokens.delete(ct);
  return tokens;
}

/** True if `text`, normalised to [a-z0-9], contains any competitor brand token (plain substring). */
export function textHasCompetitorBrand(text: string, tokens: Set<string>): boolean {
  const norm = (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return false;
  for (const tok of Array.from(tokens)) if (norm.includes(tok)) return true;
  return false;
}

// v7.208: USER-MAINTAINED competitor/third-party brand blocklist (Art III.1).
// v7.201 could only catch brands that were configured competitors, Semrush
// auto-discovered, or AI-flagged — a brand absent from all three (e.g. "Schwab"
// when it isn't a tracked competitor) slipped through, even from a CSV upload.
// This is the deterministic safety net: any term Wayne lists is hard-excluded
// everywhere. Terms are normalised (lowercase, strip non-alphanumerics, ≥3 chars)
// and matched with the same normalized-substring test as competitor brands. The
// list comes from the explicit arg, else `_excludedBrands` carried on the snapshot
// (injected once at page load from project.excludedBrands) — one source of truth.
export function buildExcludedBrandTokens(snap: any, explicit: string[] = []): Set<string> {
  const list: string[] = (Array.isArray(explicit) && explicit.length > 0)
    ? explicit
    : (Array.isArray(snap?._excludedBrands) ? snap._excludedBrands : []);
  const tokens = new Set<string>();
  for (const t of list) {
    const norm = String(t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm.length >= 3) tokens.add(norm);
  }
  return tokens;
}

// v7.208: apply the user blocklist to a DEMAND UNIVERSE so the Journey + Content-plan
// views (which read `snap._demandUniverse.topics`, NOT buildKwPool) also honour it.
// Returns a shallow copy with brand topics removed; the client's own brand demand is
// kept (guarded against clientDomain + `_brandTerms`). No-op when the list is empty.
export function filterUniverseExcludedBrands(universe: any, snap: any): any {
  if (!universe) return universe;
  const tokens = buildExcludedBrandTokens(snap);
  if (tokens.size === 0) return universe;
  const clientDomain = String(snap?.domain ?? '');
  const brandTerms: string[] = Array.isArray(snap?._brandTerms) ? snap._brandTerms : [];
  const keep = (kw: string): boolean =>
    !(textHasCompetitorBrand(kw, tokens) && !isBrandedKeyword(kw, clientDomain, [], brandTerms));
  const topics = Array.isArray(universe.topics)
    ? universe.topics.filter((t: any) => keep(String(t?.keyword ?? '')))
    : universe.topics;
  return { ...universe, topics };
}

/**
 * Returns true if the keyword is branded by any of the given domains.
 *
 * Two token classes, because short brands and long brands need different rules:
 *
 *  • LONG roots (≥4 chars, e.g. "sonobello") — UNCHANGED three-layer detection:
 *    exact substring on the space-stripped keyword, prefix truncation, fuzzy
 *    per-word edit distance.
 *
 *  • SHORT roots (2–3 chars, e.g. "td" from td.com) — v7.205. These were
 *    PREVIOUSLY DROPPED entirely by the old `length >= 4` filter, so a client
 *    like TD Bank had ZERO branded terms detected. Short tokens are now matched
 *    on a WORD BOUNDARY only — never the space-stripped substring, which would
 *    falsely join "direc[t d]eposit" / "accoun[t d]efinition". A keyword is
 *    short-branded when, for some short token:
 *      (a) a word in the keyword STARTS with the token   → "td", "td bank",
 *          "tdbank", "tdameritrade"; or
 *      (b) the token appears MID-WORD with both residual segments ≥2 chars
 *          → catches a genuine compound like "mytdfinancing" (my|financing)
 *            while rejecting coincidences like "ebitda" (ebi|a → "a" <2); or
 *      (c) the token spelled with the letters spaced out  → "t d bank".
 *    Verified on TD Bank's 2,274-keyword footprint: 204 branded, 0 false
 *    positives (every "direct deposit"/"definition"/"ebitda" correctly excluded).
 *    Identical to the isBranded() function in KeywordsPanel.tsx / ContentMapSection
 *    / JourneySection — edit all copies together.
 */
export function isBrandedKeyword(
  keyword:          string,
  clientDomain:     string,
  competitorDomains: string[] = [],
  brandTerms:       string[] = [],   // v7.206: explicit client brand vocabulary (variants a domain string can't yield)
): boolean {
  if (!keyword) return false;
  const kw     = keyword.toLowerCase().trim();
  const kwNorm = kw.replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;

  // v7.206: explicit brand vocabulary. Multi-word terms ("toronto dominion") are
  // matched as whole phrases on a word boundary; single-word terms ("easyweb",
  // "ameritrade", "td") fold into the same root machinery below (long → substring,
  // short → word boundary). Normalisation collapses any punctuation/hyphens to
  // single spaces so "toronto-dominion" and "toronto dominion" both match.
  const cleanTerms = brandTerms.map(t => (t ?? '').toLowerCase().trim()).filter(Boolean);
  const brandPhrases  = cleanTerms.filter(t => /[\s-]/.test(t));
  const brandWordRoots = cleanTerms.filter(t => !/[\s-]/.test(t)).map(t => t.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  if (brandPhrases.length > 0) {
    const norm = (s: string) => ' ' + s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') + ' ';
    const kwSpaced = norm(kw);
    for (const p of brandPhrases) {
      const np = norm(p);
      if (np !== '  ' && kwSpaced.includes(np)) return true;
    }
  }

  const roots = Array.from(new Set([
    ...[clientDomain, ...competitorDomains].map(extractBrand),
    ...brandWordRoots,
  ])).filter(b => b.length >= 2);
  if (roots.length === 0) return false;
  const longRoots  = roots.filter(b => b.length >= 4);
  const shortRoots = roots.filter(b => b.length >= 2 && b.length <= 3);

  // ── Short brand tokens (word-boundary only) ───────────────────────────────
  if (shortRoots.length > 0) {
    const words = kw.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
    for (const token of shortRoots) {
      for (const w of words) {
        const i = w.indexOf(token);
        if (i < 0) continue;
        if (i === 0)                                          return true;   // (a) word-initial
        if (i >= 2 && w.length - (i + token.length) >= 2)     return true;   // (b) genuine mid-word compound
      }
      // (c) letters spaced out, e.g. "t d"
      const spaced = token.split('').join('\\s+');
      if (new RegExp(`\\b${spaced}\\b`).test(kw))             return true;
    }
  }

  // ── Long brand tokens (≥4) — original three-layer behaviour, unchanged ────
  if (longRoots.length > 0) {
    const tokenSet = new Set<string>(longRoots);
    for (const brand of longRoots) {
      const half = Math.floor(brand.length / 2);
      if (half >= 4)                tokenSet.add(brand.slice(0, half));
      if (brand.length - half >= 4) tokenSet.add(brand.slice(half));
    }
    const allTokens: string[] = Array.from(tokenSet);

    // Pass 1: exact substring
    for (const token of allTokens) {
      if (kwNorm.includes(token))                                return true;
      if (token.includes(kwNorm) && kwNorm.length >= 4)         return true;
      if (token.length >= 5 && kwNorm.length >= 4 &&
          token.startsWith(kwNorm))                             return true;
    }

    // Pass 2: fuzzy per-word
    const kwWords = kw
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length >= 4);

    for (const word of kwWords) {
      for (const token of allTokens) {
        const minLen    = Math.min(word.length, token.length);
        const threshold = Math.max(1, Math.floor(minLen / 4));
        if (Math.abs(word.length - token.length) > threshold + 1) continue;
        if (editDistance(word, token) <= threshold) return true;
      }
    }
  }

  return false;
}

// ─── v7.337 (QC audit B9a): competitor-brand guards — ONE implementation ──────
// The full competitor-brand exclusion machinery buildKwPool applies (v7.195/196/199/
// 201/208) built in ONE place, so consumers that render demand topics OUTSIDE
// buildKwPool — JourneySection's demand-lens fallback — can apply the IDENTICAL
// drop test (Const II.7/III.1). Before v7.337 the demand lens honoured only the user
// blocklist (filterUniverseExcludedBrands), so an auto-discovered competitor-brand
// keyword could appear in demand-mode Journey while excluded everywhere else.
// The client's own brand (domain root + `_brandTerms` vocabulary) is never dropped.
interface CompetitorBrandGuards {
  effectiveBrandTerms:   string[];
  isExcludedBrand:       (kwRaw: string) => boolean;   // v7.208 user blocklist
  isCompetitorBranded:   (kwRaw: string) => boolean;   // v7.195 string-branded to a competitor
  isAutoCompetitorBrand: (kwRaw: string) => boolean;   // v7.201 auto-discovered brand tokens
  brandCatExcludedKw:    Set<string>;                  // v7.196/199 brand-category members + AI-flagged
  drop:                  (kwLow: string, kwRaw: string) => boolean;   // the §5 composition
}

function buildCompetitorBrandGuards(
  snap: any,
  clientDomain: string,
  compDomains: string[],                 // configured + uploaded-gap competitor domains (merged)
  brandTerms: string[] = [],
  uploadedGapDomains: string[] = [],
): CompetitorBrandGuards {
  // v7.206: brand vocabulary — explicit option first, else `_brandTerms` off the snapshot.
  const effectiveBrandTerms: string[] =
    (Array.isArray(brandTerms) && brandTerms.length > 0)
      ? brandTerms
      : (Array.isArray((snap as any)?._brandTerms) ? (snap as any)._brandTerms : []);

  // v7.439 (Wayne — "capital one" et al. reaching the pool): the client-brand test used
  // here PROTECTS a keyword from the competitor guard, so it must be STRICT. The general
  // isBrandedKeyword splits a run-together root into halves ("americanexpress" ->
  // "american" + "express") and then fuzzy-matches per word, so "bank of america login"
  // matched the client at edit distance 1 ("america" ~ "american") and was protected from
  // being dropped as a Bank of America term. The same half-token ran the other way too:
  // Bank of America's "america" half claimed "american express platinum" as a COMPETITOR
  // term. Protection now requires an exact match on the full client root or on the
  // explicit brand vocabulary — no half-tokens, no edit distance. The loose test is
  // unchanged everywhere else (the "branded" chip still uses it).
  const clientRoot = extractBrand(clientDomain);
  const strictTerms = effectiveBrandTerms.map(t => (t ?? '').toLowerCase().trim()).filter(Boolean);
  const isClientBrandedStrict = (kw: string): boolean => {
    const kwNorm = String(kw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!kwNorm) return false;
    if (clientRoot.length >= 4 && kwNorm.includes(clientRoot)) return true;
    for (const t of strictTerms) {
      const tn = t.replace(/[^a-z0-9]/g, '');
      if (tn.length >= 3 && kwNorm.includes(tn)) return true;
    }
    return false;
  };

  // v7.208: user-maintained blocklist (client's own brand never stripped).
  const excludedBrandTokens = buildExcludedBrandTokens(snap);
  const isExcludedBrand = (kw: string): boolean =>
    excludedBrandTokens.size > 0
    && textHasCompetitorBrand(kw, excludedBrandTokens)
    && !isClientBrandedStrict(kw);   // v7.439: strict protection (see isClientBrandedStrict)

  // v7.195: branded to a competitor (any compDomain) but NOT to the client.
  const isCompetitorBranded = (kw: string): boolean =>
    isBrandedKeyword(kw, '', compDomains) && !isClientBrandedStrict(kw);

  // v7.201: deterministic auto-discovered competitor-brand tokens.
  const compBrandTokens = buildCompetitorBrandTokens(snap, clientDomain, compDomains, uploadedGapDomains);
  const isAutoCompetitorBrand = (kw: string): boolean =>
    textHasCompetitorBrand(kw, compBrandTokens) && !isClientBrandedStrict(kw);   // v7.439: strict protection

  // v7.196: competitor BRAND-CATEGORY members + v7.199 AI-flagged brand terms.
  const cb = snap?._categoryBreakdown ?? null;
  const cbCats: Array<{ name: string; type?: string }> = cb?.categories ?? [];
  const kwCatMap: Record<string, string> = cb?.keywordCategories ?? {};
  const competitorBrandCats = new Set<string>(
    cbCats
      .filter(c => {
        if (!c?.name) return false;
        if (isBrandedKeyword(c.name, clientDomain, [], effectiveBrandTerms)) return false;   // client's own brand → keep
        const isBrandType        = c.type === 'brand';
        const namedLikeCompetitor = compDomains.length > 0 && isBrandedKeyword(c.name, '', compDomains);
        return isBrandType || namedLikeCompetitor;                      // competitor / third-party brand
      })
      .map(c => c.name),
  );
  const brandCatExcludedKw = new Set<string>();
  if (competitorBrandCats.size > 0) {
    for (const [kwLow, catName] of Object.entries(kwCatMap)) {
      if (competitorBrandCats.has(catName)) brandCatExcludedKw.add(kwLow);
    }
  }
  for (const k of (cb?.brandKeywords ?? []) as string[]) {
    const kl = String(k ?? '').toLowerCase().trim();
    if (kl) brandCatExcludedKw.add(kl);
  }

  // The unified §5 competitor-brand test (identical composition to pre-v7.337 buildKwPool).
  const drop = (kwLow: string, kwRaw: string): boolean =>
    brandCatExcludedKw.has(kwLow) || isCompetitorBranded(kwRaw) || isAutoCompetitorBrand(kwRaw) || isExcludedBrand(kwRaw);

  return { effectiveBrandTerms, isExcludedBrand, isCompetitorBranded, isAutoCompetitorBrand, brandCatExcludedKw, drop };
}

/**
 * v7.337 (QC audit B9a): the FULL competitor-brand drop test as a standalone predicate.
 * Returns true when `keyword` must be excluded as a competitor/third-party brand term:
 * brand-category membership (incl. AI-flagged terms), string competitor-brand match,
 * auto-discovered competitor-brand token, or the user blocklist — the exact §5
 * `dropCompetitorBrand` composition buildKwPool applies to the demand lens, from the
 * SAME internal builder (one implementation, Const II.7). Pass the configured
 * competitor domains; auto-discovered competitors come off the snapshot itself.
 * The client's own brand is never dropped.
 */
export function buildCompetitorBrandDropTest(
  snap: any,
  clientDomain: string,
  competitorDomains: string[] = [],
  brandTerms: string[] = [],
): (keyword: string) => boolean {
  const compDomains = Array.from(new Set((competitorDomains ?? []).filter(Boolean)));
  const g = buildCompetitorBrandGuards(snap, clientDomain, compDomains, brandTerms);
  return (keyword: string): boolean => {
    const kwRaw = String(keyword ?? '');
    const kwLow = kwRaw.toLowerCase().trim();
    if (!kwLow) return false;
    return g.drop(kwLow, kwRaw);
  };
}

// ─── Core pool builder ────────────────────────────────────────────────────────

/**
 * Builds the filtered keyword pool that is the single source of truth for
 * all volume metrics across the app.
 *
 * Rules match KeywordsPanel buildRows exactly:
 *  - topKeywords:    blocked → skip, dupes → skip, below clientVolMin → skip
 *  - gapKeywords:    blocked → skip, dupes → skip, branded → skip, below competitorVolMin → skip
 *  - uploadedKws:    blocked → skip, dupes → skip, NO threshold
 *                    (gap uploads also skip COMPETITOR-branded terms — v7.195)
 *  - demand:         blocked → skip, competitor-branded → skip (v7.195)
 * Competitor brands are auto-derived from competitor domains + uploaded gap CSV
 * domains; the client's OWN brand footprint is always kept.
 */
export function buildKwPool({
  semrushSnapshot:    snap,
  uploadedKeywords:   uploaded   = [],
  clientDomain,
  competitorDomains              = [],
  clientVolMin                   = 0,
  competitorVolMin               = 0,
  brandTerms                     = [],
  includeDemand                  = false,
  scopeOverrides                 = {},
  includeAdjacent                = false,
}: KwPoolOptions): KwPoolItem[] {
  const blockedSet = new Set<string>(
    uploaded
      .filter((k: any) => k.source === 'blocked')
      .map((k: any) => (k.keyword ?? '').toLowerCase()),
  );

  // ── v7.195: competitor-brand exclusion ──────────────────────────────────────
  // A keyword branded to a COMPETITOR (e.g. "american express login") must never
  // enter the keyword landscape or the clusters — a client can't realistically
  // win a rival's brand term, and it pollutes the demand/opportunity picture.
  // The client's OWN brand footprint is kept (only competitor brands are removed).
  // Competitor brands are auto-derived — no manual list — from:
  //   (a) the configured competitor domains, and
  //   (b) the `domain` column of every uploaded competitor (gap) CSV row,
  // so a competitor present only in an upload is still detected. This is applied
  // to BOTH the auto-detected Semrush gaps (§3) and the uploaded competitor CSV
  // gaps (§4), and to demand (§5) — but NOT to the client's own rows (§1, §2).
  const uploadedGapDomains: string[] = uploaded
    .filter((k: any) => (k.source ?? '') !== 'blocked' && k.type === 'gap' && k.domain)
    .map((k: any) => String(k.domain));
  const compDomains: string[] = Array.from(
    new Set([...competitorDomains, ...uploadedGapDomains].filter(Boolean)),
  );

  // v7.337 (QC audit B9a, Const II.7): the brand-exclusion machinery — v7.206 brand
  // vocabulary, v7.208 user blocklist, v7.195 competitor-branded, v7.201 auto-discovered
  // tokens, v7.196/199 brand-category members, and the unified §5 dropCompetitorBrand
  // composition — now comes from buildCompetitorBrandGuards, the ONE builder shared with
  // buildCompetitorBrandDropTest (JourneySection's demand-lens filter). Same inputs,
  // same order, same tests as pre-v7.337 (verified byte-equal old-vs-new in the v7.337
  // harness); see the builder above for the full per-rule documentation.
  const guards = buildCompetitorBrandGuards(snap, clientDomain, compDomains, brandTerms, uploadedGapDomains);
  const effectiveBrandTerms   = guards.effectiveBrandTerms;
  const isExcludedBrand       = guards.isExcludedBrand;
  const isAutoCompetitorBrand = guards.isAutoCompetitorBrand;
  const brandCatExcludedKw    = guards.brandCatExcludedKw;
  const dropCompetitorBrand   = guards.drop;

  const pool: KwPoolItem[] = [];
  const seen  = new Set<string>();

  // ── 1. Client ranked keywords ──────────────────────────────────────────────
  for (const k of (snap?.topKeywords ?? [])) {
    const kwLow = (k.keyword ?? '').toLowerCase().trim();
    if (!kwLow || blockedSet.has(kwLow) || seen.has(kwLow)) continue;
    if (brandCatExcludedKw.has(kwLow)) continue;   // v7.199: AI/category brand term — never include
    if (isAutoCompetitorBrand(k.keyword)) continue;   // v7.201: auto-discovered competitor brand (e.g. "schwab 529")
    if (isExcludedBrand(k.keyword)) continue;   // v7.208: user blocklist (even client-ranked competitor-brand terms)
    if (clientVolMin > 0 && (k.searchVolume ?? 0) < clientVolMin) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     k.position    ?? null,
      isGap:        false,
      isBranded:    isBrandedKeyword(k.keyword, clientDomain, competitorDomains, effectiveBrandTerms),
      competitor:   null,
      origin:       'footprint',
      url:          (typeof k.url === 'string' && k.url.trim()) ? k.url.trim() : undefined,   // v7.251: real ranking URL
    });
  }

  // v7.254: index the §1 footprint entries by keyword so an uploaded client row
  // for the SAME keyword can backfill a missing ranking URL (see §2) instead of
  // being dropped by the dedup. Built here (pool currently holds only §1 client rows).
  const clientByKw = new Map<string, KwPoolItem>();
  for (const p of pool) clientByKw.set(p.keyword.toLowerCase().trim(), p);

  // ── 2. Uploaded CLIENT keywords (non-gap CSV/manual rows) ──────────────────
  // v7.142: the client's OWN uploaded footprint is authoritative and is added
  // BEFORE the crawl gap set. Reason: an auto-crawl can list a keyword as a
  // competitor "gap" (the crawl only knew the client ranked for the vol≥floor
  // terms, so lower-volume client terms a competitor also ranks for slipped into
  // gapKeywords). If the client then uploads a CSV saying "we rank for X", X must
  // count as CLIENT, not gap. Processing client uploads here (before §3) makes the
  // client footprint win the dedup, so the uploaded CSV is no longer swallowed by
  // the gap set. (This is why ~600 of Wayne's 731-row client CSV were missing.)
  for (const k of uploaded) {
    if ((k.source ?? '') === 'blocked') continue;
    if (k.type === 'gap') continue;                 // gap uploads handled in §4
    const kwLow = (k.keyword ?? '').toLowerCase().trim();
    if (!kwLow) continue;
    if (seen.has(kwLow)) {
      // v7.254: the uploaded CSV is the authoritative source of the client's real
      // ranking URL (Const I.1). A §1 topKeywords row for the same keyword often
      // enters URL-less (Semrush rows omit the URL), so rather than drop the
      // duplicate uploaded row and lose its URL, backfill it onto the §1 entry.
      // Only fills when the existing entry has no URL; never invents or overwrites.
      if (typeof k.url === 'string' && k.url.trim()) {
        const existing = clientByKw.get(kwLow);
        if (existing && !existing.url) existing.url = k.url.trim();
      }
      continue;
    }
    if (brandCatExcludedKw.has(kwLow)) continue;    // v7.199: AI/category brand term — never include
    if (isAutoCompetitorBrand(k.keyword)) continue; // v7.201: auto-discovered competitor brand
    if (isExcludedBrand(k.keyword)) continue;       // v7.208: user blocklist (even on client uploads)
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.search_volume ?? k.searchVolume ?? 0,
      position:     k.position ?? null,
      isGap:        false,
      isBranded:    isBrandedKeyword(k.keyword, clientDomain, competitorDomains, effectiveBrandTerms),
      competitor:   null,
      origin:       'footprint',
      url:          (typeof k.url === 'string' && k.url.trim()) ? k.url.trim() : undefined,   // v7.251: real ranking URL from the uploaded CSV
    });
  }

  // ── 3. Crawl gap keywords — only those NOT already claimed as client ───────
  for (const k of (snap?.gapKeywords ?? [])) {
    const kwLow = (k.keyword ?? '').toLowerCase().trim();
    if (!kwLow || blockedSet.has(kwLow) || seen.has(kwLow)) continue;
    // Drop branded gaps. Uses the augmented competitor-domain set (config + uploaded
    // CSV domains) so a competitor's own brand term is caught even when that
    // competitor only appears in an uploaded file; plus the brand-category signal so
    // abbreviated/foreign competitor brand terms ("boa", "美国银行") are caught too.
    // Client-brand footprint is unaffected (these are competitor-ranked terms).
    if (brandCatExcludedKw.has(kwLow) || isBrandedKeyword(k.keyword, clientDomain, compDomains, effectiveBrandTerms) || isAutoCompetitorBrand(k.keyword) || isExcludedBrand(k.keyword)) continue;
    if (competitorVolMin > 0 && (k.searchVolume ?? 0) < competitorVolMin) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     null,
      isGap:        true,
      isBranded:    false,  // guaranteed by the check above
      competitor:   (k as any).competitor ?? null,
      origin:       'footprint',
    });
  }

  // ── 4. Uploaded GAP keywords (competitor CSV rows) — no threshold ──────────
  for (const k of uploaded) {
    if ((k.source ?? '') === 'blocked') continue;
    if (k.type !== 'gap') continue;                 // client uploads handled in §2
    const kwLow = (k.keyword ?? '').toLowerCase().trim();
    if (!kwLow || seen.has(kwLow)) continue;
    // v7.195/196: parse competitor brand terms out of the uploaded competitor CSV.
    // A gap row branded to a competitor (its own brand, e.g. "american express
    // login"), OR mapped to a competitor brand category (catches "boa"/"bofa"/foreign
    // script), is excluded so only NON-branded competitor terms enter the landscape
    // and clusters. The row's own `domain` is in compDomains, so the uploading
    // competitor's brand is caught even if it wasn't configured.
    if (brandCatExcludedKw.has(kwLow) || isBrandedKeyword(k.keyword, clientDomain, compDomains, effectiveBrandTerms) || isAutoCompetitorBrand(k.keyword) || isExcludedBrand(k.keyword)) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.search_volume ?? k.searchVolume ?? 0,
      // v7.100: gap rows (competitor uploads) store the COMPETITOR's rank in
      // position — kept in the DB for Share of Voice — so it must not leak into
      // the pool as a client ranking.
      position:     null,
      isGap:        true,
      isBranded:    false,   // guaranteed by the competitor-brand skip above
      competitor:   k.domain ?? null,
      origin:       'footprint',
    });
  }

  // ── 5. Deep-journey DEMAND universe (v7.162, opt-in) ───────────────────────
  // The footprint (§1–4) is the RANKING lens. The demand universe is the upstream
  // discovery lens — real Semrush volume (phrase_questions/phrase_related) for the
  // market demand that exists between a problem and a procedure, which the ranking
  // footprint never captures. Union them to see OVERALL MARKET DEMAND.
  //
  // Defensibility rules:
  //  - Opt-in only (`includeDemand`); off → §1–4 pool is byte-for-byte unchanged.
  //  - Dedupe by keyword. A demand keyword already in the footprint is NOT added
  //    again (no double-counted volume) — the footprint row is kept and flagged
  //    `inDemand` (rank does not "win", it is simply also demand-validated).
  //  - A demand keyword NOT in the footprint becomes a `origin:'demand'` row =
  //    "missing demand": it carries its real Semrush volume, no rank/competitor.
  if (includeDemand) {
    const byKw = new Map<string, KwPoolItem>(
      pool.map(p => [p.keyword.toLowerCase().trim(), p]),
    );
    const demandTopics: any[] = snap?._demandUniverse?.topics ?? [];
    for (const t of demandTopics) {
      const kwLow = (t.keyword ?? '').toLowerCase().trim();
      if (!kwLow || blockedSet.has(kwLow)) continue;
      // v7.195/196: a competitor brand term must not enter the clusters via the
      // demand lens either. Drop demand keywords branded to a competitor or mapped to
      // a competitor brand category (keep the client's brand + all non-branded demand).
      if (dropCompetitorBrand(kwLow, t.keyword)) continue;
      const seeds: string[] = Array.isArray(t.seeds) ? t.seeds : [];
      const existing = byKw.get(kwLow);
      if (existing) {
        // Same keyword already in the footprint → flag as demand-validated, merge
        // seeds, keep the (larger) market volume. No new row, no double count.
        existing.inDemand = true;
        existing.searchVolume = Math.max(existing.searchVolume, t.searchVolume ?? 0);
        existing.demandSeeds = Array.from(new Set([...(existing.demandSeeds ?? []), ...seeds]));
        continue;
      }
      const item: KwPoolItem = {
        keyword:      t.keyword,
        searchVolume: t.searchVolume ?? 0,
        position:     null,
        isGap:        false,   // NOT a competitor gap — it is "missing demand"
        isBranded:    isBrandedKeyword(t.keyword, clientDomain, competitorDomains, effectiveBrandTerms),
        competitor:   null,
        origin:       'demand',
        inDemand:     true,
        demandSeeds:  seeds,
      };
      pool.push(item);
      byKw.set(kwLow, item);
    }
  }

  // ── v7.326: SCOPE GATE (single chokepoint) ─────────────────────────────────
  // Drop every keyword whose umbrella is ADJACENT (a competitor-only vertical the client
  // doesn't compete in). Because every panel + scan route builds its pool here, this one
  // filter removes out-of-scope verticals from ALL of them at once — they never inflate
  // footprint/volume and never render (the brand-guard leak pattern is avoided by filtering
  // at the source, not per panel). The staging panel passes includeAdjacent to see them.
  // Honest fallback: pre-v7.326 snapshots carry no umbrellaScope → resolver marks nothing
  // adjacent → pool is byte-for-byte unchanged (Const I.5).
  let out = pool;
  if (!includeAdjacent) {
    const scope = buildScopeResolver(snap, scopeOverrides);
    if (scope.adjacentUmbrellas.length > 0) {
      out = out.filter(p => !scope.isAdjacentKeyword(p.keyword.toLowerCase().trim()));
    }
  }

  // ── v7.419: HIDDEN CATEGORIES (soft-hide chokepoint) ────────────────────────
  // Drop every keyword whose TOP-LEVEL category the user hid from the Category
  // Breakdown (Wayne 2026-08-11: "delete" a category with all data updating, but
  // WITHOUT losing any stored category association). Same single-chokepoint pattern
  // as the scope gate above: because every panel + scan route builds its pool here,
  // one filter removes the hidden category from ALL panels and ALL volume/footprint
  // totals at once — while `_categoryBreakdown`, keywordPaths and stored membership
  // stay byte-for-byte untouched (Const II.8), so restoring the entry brings the
  // category back exactly as it was. Membership is read from the STORED taxonomy
  // (path root, with the stored flat category name as fallback for brand/location/
  // Other rows) — never re-derived lexically. No hidden entries → byte-for-byte
  // unchanged (Const I.5).
  const hiddenRaw: any[] = Array.isArray((snap as any)?._hiddenCategories) ? (snap as any)._hiddenCategories : [];
  if (hiddenRaw.length > 0) {
    // Two match kinds: `key` entries are STORED-PATH prefixes (' › ' joined) — they hide
    // exactly the subtree the user clicked, even when the display row is a collapsed
    // survivor whose name differs from path[0]; name-only entries match the flat stored
    // membership name (brand/location/Other) or a path root of the same name.
    const hiddenKeys  = [] as string[];
    const hiddenNames = new Set<string>();
    for (const h of hiddenRaw) {
      if (typeof h === 'string') { const n = h.toLowerCase().trim(); if (n) hiddenNames.add(n); continue; }
      const k = String(h?.key ?? '').toLowerCase().trim();
      if (k) { hiddenKeys.push(k); continue; }
      const n = String(h?.name ?? '').toLowerCase().trim();
      if (n) hiddenNames.add(n);
    }
    if (hiddenKeys.length > 0 || hiddenNames.size > 0) {
      const kp: Record<string, any> = snap?._categoryBreakdown?.keywordPaths ?? {};
      const kc: Record<string, any> = snap?._categoryBreakdown?.keywordCategories ?? {};
      out = out.filter(p => {
        const kwLow = p.keyword.toLowerCase().trim();
        const path  = kp[kwLow];
        if (Array.isArray(path) && path.length > 0) {
          if (hiddenNames.has(String(path[0] ?? '').toLowerCase().trim())) return false;
          if (hiddenKeys.length > 0) {
            const joined = path.map((s: any) => String(s ?? '').trim()).join(' › ').toLowerCase();
            for (const hk of hiddenKeys) {
              if (joined === hk || joined.startsWith(hk + ' › ')) return false;
            }
          }
        }
        const cat = kc[kwLow];
        if (typeof cat === 'string' && hiddenNames.has(cat.toLowerCase().trim())) return false;
        return true;
      });
    }
  }

  return out;
}

// ─── Volume metrics ───────────────────────────────────────────────────────────

/** Sums a pool into volume metrics. */
export function computeVolumeMetrics(pool: KwPoolItem[]): Omit<VolumeMetrics, 'pool'> {
  const totalMonthly = pool.reduce((s, k) => s + k.searchVolume, 0);
  const page1Monthly = pool
    .filter(k => k.position !== null && k.position <= 10)
    .reduce((s, k) => s + k.searchVolume, 0);
  return {
    totalMonthly,
    totalAnnual:  totalMonthly * 12,
    page1Monthly,
    page1Annual:  page1Monthly * 12,
    captureRate:  totalMonthly > 0 ? page1Monthly / totalMonthly : 0,
  };
}

/** Convenience: build pool + compute metrics in one call. */
export function getVolumeMetrics(opts: KwPoolOptions): VolumeMetrics {
  const pool = buildKwPool(opts);
  return { pool, ...computeVolumeMetrics(pool) };
}

// ─── v7.286: Local Pack (map pack) rollup ──────────────────────────────────────
// Which CATEGORY names contain at least one keyword whose Google SERP shows a Local
// Pack. The per-keyword flag is REAL Semrush SERP-feature data (`Fl`, KB 986/1340),
// rolled up here through STORED membership (`_categoryBreakdown.keywordCategories`,
// Const II.8 — never re-derived). Both the Keyword panel (badge) and the Local panel
// (picker gate) read this one helper so they agree (Const II.7).

/** True once the analysis actually carries the SERP-feature column (a re-run on/after v7.286). */
export function hasLocalPackData(snap: any): boolean {
  return !!snap && snap.localPackDataAvailable === true && Array.isArray(snap.localPackKeywords);
}

// v7.287: Local Pack detection from a single uploaded "SERP Features by Keyword" cell.
// Client-safe mirror of `serpFeaturesHasLocalPack` in lib/apis/semrush.ts so the Keyword
// panel can flag local-intent rows directly off the uploaded Semrush CSV cell
// (project_keywords.serp_features) — both client-footprint AND competitor-gap rows — without
// importing the server semrush module. REAL data only (Const I.1): the flag is Semrush's own
// `Fl` SERP-feature value. Value-robust: matches the legacy numeric id (3), the Projects label
// ("geo"), and any token containing "local" ("Local pack" / "local_pack"), case-insensitively.
// Sources: https://www.semrush.com/kb/986-api-serp-features , .../1340-serp-features-local-pack
export function serpCellHasLocalPack(raw: unknown): boolean {
  const s = String(raw ?? '').toLowerCase();
  if (!s.trim()) return false;
  const tokens = s.split(/[,|;]+/).map(t => t.trim()).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '3' || t === 'geo') return true;   // legacy numeric id / Projects label
    if (t.indexOf('local') >= 0) return true;    // "local pack" / "local_pack" name
  }
  return false;
}

// v7.292: the REAL local-pack keyword set, mirroring the Keyword panel's badge logic
// (Const II.7 single source of truth). It folds BOTH local signals the panel uses:
//   (1) the footprint roll-up `snap.localPackKeywords` (the `Fl` SERP-feature roll-up), and
//   (2) every uploaded row whose own "SERP Features" cell carries a Local Pack (serpCellHasLocalPack).
// Source (2) is why the Keyword panel can badge a category 📍 Local pack even on an analysis
// that predates the `localPackKeywords` roll-up — so the Local Search panel must read the same
// pair to agree with it. All real Semrush data (Const I.1); keys lowercased.
export function buildLocalPackKeywordSet(snap: any, dbKeywords?: any[]): Set<string> {
  const set = new Set<string>();
  if (hasLocalPackData(snap)) {
    (snap.localPackKeywords as any[]).forEach(k => set.add(String(k).toLowerCase()));
  }
  if (Array.isArray(dbKeywords)) {
    for (const d of dbKeywords) {
      if (serpCellHasLocalPack(d?.serpFeatures)) {
        const kw = String(d?.keyword ?? '').toLowerCase();
        if (kw) set.add(kw);
      }
    }
  }
  return set;
}

// v7.292: is there ANY real local signal to filter on? True when the footprint roll-up exists
// OR any uploaded row carries a SERP-feature cell (whether or not that cell shows a Local Pack —
// a populated column means the data is present to judge from). When this is false there is no
// honest basis to claim a category is local, so the Local Search panel shows the brand only and
// surfaces the gap (Const I.5) rather than falling back to every category.
export function hasAnyLocalSignal(snap: any, dbKeywords?: any[]): boolean {
  if (hasLocalPackData(snap)) return true;
  if (Array.isArray(dbKeywords)) {
    for (const d of dbKeywords) {
      const s = d?.serpFeatures;
      if (typeof s === 'string' && s.trim().length > 0) return true;
    }
  }
  return false;
}

/**
 * Set of category NAMES (verbatim, as stored) that trigger a Local Pack — the same segmentation
 * the Keyword panel badges. A category is included when ANY keyword mapped to it (by STORED
 * membership `keywordCategories`, Const II.8 — never re-derived lexically) is in the real
 * local-pack keyword set (footprint roll-up + uploaded SERP-feature cells, v7.292). Pass
 * `dbKeywords` to fold in the uploaded-cell signal; omit it for the footprint-only set.
 * Empty when there is no local signal at all.
 */
export function buildLocalPackCategorySet(snap: any, dbKeywords?: any[]): Set<string> {
  const out = new Set<string>();
  const lp = buildLocalPackKeywordSet(snap, dbKeywords);
  if (lp.size === 0) return out;
  const kc = snap?._categoryBreakdown?.keywordCategories;
  if (kc && typeof kc === 'object') {
    Object.keys(kc).forEach(kw => {
      if (lp.has(String(kw).toLowerCase())) {
        const cat = String(kc[kw] ?? '');
        if (cat) out.add(cat);
      }
    });
  }
  return out;
}
