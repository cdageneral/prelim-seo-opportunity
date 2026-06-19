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
}: KwPoolOptions): KwPoolItem[] {
  // v7.206: brand vocabulary. Prefer the explicit option; otherwise fall back to
  // `_brandTerms` carried on the snapshot (injected once at page load from
  // project.brandTerms). This makes EVERY buildKwPool caller — Keyword, Cluster,
  // Journey, Content Map — share one client brand vocabulary without threading the
  // list through every component signature (single source of truth, Art II.7).
  const effectiveBrandTerms: string[] =
    (Array.isArray(brandTerms) && brandTerms.length > 0)
      ? brandTerms
      : (Array.isArray((snap as any)?._brandTerms) ? (snap as any)._brandTerms : []);

  // v7.208: user-maintained competitor/third-party brand blocklist. Any keyword
  // carrying an excluded term is dropped everywhere (footprint §1–4 + demand §5),
  // whether it came from Semrush or a CSV upload — but the client's OWN brand is
  // never stripped (guarded against effectiveBrandTerms + clientDomain).
  const excludedBrandTokens = buildExcludedBrandTokens(snap);
  const isExcludedBrand = (kw: string): boolean =>
    excludedBrandTokens.size > 0
    && textHasCompetitorBrand(kw, excludedBrandTokens)
    && !isBrandedKeyword(kw, clientDomain, [], effectiveBrandTerms);

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
  // Branded to a competitor (any compDomain) but NOT to the client → exclude.
  const isCompetitorBranded = (kw: string): boolean =>
    isBrandedKeyword(kw, '', compDomains) && !isBrandedKeyword(kw, clientDomain, [], effectiveBrandTerms);

  // ── v7.201: DETERMINISTIC auto-discovered competitor-brand exclusion ─────────
  // Strip keywords carrying a brand the user never configured but Semrush surfaced as
  // a top organic competitor (snap.competitors[].domain — real data already in the
  // snapshot). Catches client-RANKED competitor-brand terms ("schwab 529") that §1/§2
  // previously kept because they only checked the AI brandKeywords list. Full-token,
  // strict match; the client's own brand is never stripped (token removed + guard).
  const compBrandTokens = buildCompetitorBrandTokens(snap, clientDomain, competitorDomains, uploadedGapDomains);
  const isAutoCompetitorBrand = (kw: string): boolean =>
    textHasCompetitorBrand(kw, compBrandTokens) && !isBrandedKeyword(kw, clientDomain, [], effectiveBrandTerms);

  // ── v7.196: competitor BRAND-CATEGORY exclusion ─────────────────────────────
  // Per-keyword string matching can't catch a competitor's brand searches when they
  // are written as abbreviations or in another language ("boa", "bofa", "bof",
  // "美国银行" for Bank of America). But the upstream categoriser already groups them
  // under a brand-type category named after that brand (e.g. "Bank of America"), with
  // a keyword→category map. So we exclude every keyword mapped to a brand category
  // that is NOT the client's own brand. This is the reliable signal — it removes the
  // whole competitor brand cluster regardless of how each member term is spelled.
  // The client's own brand category (its name contains the client's brand) is KEPT.
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
  // v7.199: AI-flagged brand terms (from the "Refine with AI" pass). These catch
  // brand names string/domain matching can't — abbreviations and brands not in the
  // competitor list ("schwab", "charles schwab 529", "vanguard"). Hard-excluded
  // everywhere (added to brandCatExcludedKw, which §1–§5 all honour below). The AI is
  // instructed to flag only NON-client brands, so the client footprint is untouched.
  for (const k of (cb?.brandKeywords ?? []) as string[]) {
    const kl = String(k ?? '').toLowerCase().trim();
    if (kl) brandCatExcludedKw.add(kl);
  }
  // Unified competitor-brand test used by the competitor-sourced sections (§3–§5):
  // a member of a competitor brand category, OR string-branded to a competitor.
  const dropCompetitorBrand = (kwLow: string, kwRaw: string): boolean =>
    brandCatExcludedKw.has(kwLow) || isCompetitorBranded(kwRaw) || isAutoCompetitorBrand(kwRaw) || isExcludedBrand(kwRaw);

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
    if (!kwLow || seen.has(kwLow)) continue;
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

  return pool;
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
