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
}

export interface KwPoolOptions {
  semrushSnapshot:    any;
  uploadedKeywords?:  any[];   // DB rows — source='csv'|'manual'. source='blocked' = excluded.
  clientDomain:       string;
  competitorDomains?: string[];
  clientVolMin?:      number;
  competitorVolMin?:  number;
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
 * Returns true if the keyword is branded by any of the given domains.
 * Uses three-layer detection: exact substring, prefix truncation, fuzzy per-word.
 * Identical to the isBranded() function in KeywordsPanel.tsx.
 */
export function isBrandedKeyword(
  keyword:          string,
  clientDomain:     string,
  competitorDomains: string[] = [],
): boolean {
  if (!keyword) return false;
  const kw     = keyword.toLowerCase().trim();
  const kwNorm = kw.replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;

  const baseBrands = [clientDomain, ...competitorDomains]
    .map(extractBrand)
    .filter(b => b.length >= 4);
  if (baseBrands.length === 0) return false;

  const tokenSet = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
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
 */
export function buildKwPool({
  semrushSnapshot:    snap,
  uploadedKeywords:   uploaded   = [],
  clientDomain,
  competitorDomains              = [],
  clientVolMin                   = 0,
  competitorVolMin               = 0,
}: KwPoolOptions): KwPoolItem[] {
  const blockedSet = new Set<string>(
    uploaded
      .filter((k: any) => k.source === 'blocked')
      .map((k: any) => (k.keyword ?? '').toLowerCase()),
  );

  const pool: KwPoolItem[] = [];
  const seen  = new Set<string>();

  // ── 1. Client ranked keywords ──────────────────────────────────────────────
  for (const k of (snap?.topKeywords ?? [])) {
    const kwLow = (k.keyword ?? '').toLowerCase().trim();
    if (!kwLow || blockedSet.has(kwLow) || seen.has(kwLow)) continue;
    if (clientVolMin > 0 && (k.searchVolume ?? 0) < clientVolMin) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     k.position    ?? null,
      isGap:        false,
      isBranded:    isBrandedKeyword(k.keyword, clientDomain, competitorDomains),
      competitor:   null,
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
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.search_volume ?? k.searchVolume ?? 0,
      position:     k.position ?? null,
      isGap:        false,
      isBranded:    isBrandedKeyword(k.keyword, clientDomain, competitorDomains),
      competitor:   null,
    });
  }

  // ── 3. Crawl gap keywords — only those NOT already claimed as client ───────
  for (const k of (snap?.gapKeywords ?? [])) {
    const kwLow = (k.keyword ?? '').toLowerCase().trim();
    if (!kwLow || blockedSet.has(kwLow) || seen.has(kwLow)) continue;
    if (isBrandedKeyword(k.keyword, clientDomain, competitorDomains)) continue;
    if (competitorVolMin > 0 && (k.searchVolume ?? 0) < competitorVolMin) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     null,
      isGap:        true,
      isBranded:    false,  // guaranteed by the check above
      competitor:   (k as any).competitor ?? null,
    });
  }

  // ── 4. Uploaded GAP keywords (competitor CSV rows) — no threshold ──────────
  for (const k of uploaded) {
    if ((k.source ?? '') === 'blocked') continue;
    if (k.type !== 'gap') continue;                 // client uploads handled in §2
    const kwLow = (k.keyword ?? '').toLowerCase().trim();
    if (!kwLow || seen.has(kwLow)) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      k.keyword,
      searchVolume: k.search_volume ?? k.searchVolume ?? 0,
      // v7.100: gap rows (competitor uploads) store the COMPETITOR's rank in
      // position — kept in the DB for Share of Voice — so it must not leak into
      // the pool as a client ranking.
      position:     null,
      isGap:        true,
      isBranded:    isBrandedKeyword(k.keyword, clientDomain, competitorDomains),
      competitor:   k.domain ?? null,
    });
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
