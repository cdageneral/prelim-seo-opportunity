/**
 * lib/local/seeds.ts — v7.183 (Local Search panel)
 *
 * DETERMINISTIC derivation of the "service seeds" scanned per location in the
 * map-pack grid. For a multi-location brand, local visibility = how each location
 * ranks in the Google 3-pack for the client's core services + brand, city by city.
 * The grid is seeds × locations; this module produces the seeds.
 *
 * Seeds come ONLY from the client's own data — the brand name + the client's
 * content categories (services), with the real Semrush volume of each service
 * read from the client's existing keyword pool. No AI, no fabrication: a seed's
 * volume is the max real volume among the client's ranked keywords that name it.
 * ES5-safe (no for…of over iterators; indexed loops / forEach).
 */

export interface ServiceSeed {
  term:   string;               // e.g. "liposuction", "sono bello"
  kind:   'brand' | 'service';
  volume: number;               // real Semrush volume of the base term (max over matching client kws)
}

export interface SeedPoolItem {
  keyword:      string;
  searchVolume?: number;
  competitor?:  string | null;
  isGap?:       boolean;
}

const SEED_NOISE: Record<string, boolean> = (function () {
  const m: Record<string, boolean> = {};
  ['cost', 'costs', 'price', 'prices', 'pricing', 'near', 'reviews', 'review',
   'before', 'after', 'photos', 'pictures', 'results', 'much', 'what', 'does',
   'work', 'really', 'best', 'free', 'open', 'hours', 'jobs', 'careers', 'job',
   'career', 'office', 'corporate', 'employment', 'treatment', 'procedure',
   'surgery', 'nightmare', 'general', 'other', 'services', 'service'].forEach(w => { m[w] = true; });
  return m;
})();

function clean(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** brandRoot: "sonobello.com" → "sonobello". */
function brandRoot(domain: string): string {
  return String(domain ?? '').replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    .replace(/\/.*$/, '').toLowerCase().trim().split('.')[0] || '';
}

/** Max real volume among client-ranked pool keywords that contain `token`. */
function volumeFor(token: string, clientPool: SeedPoolItem[]): number {
  let v = 0;
  const t = token.toLowerCase();
  for (let i = 0; i < clientPool.length; i++) {
    const k = String(clientPool[i].keyword || '').toLowerCase();
    if (k.indexOf(t) >= 0) { const vol = clientPool[i].searchVolume || 0; if (vol > v) v = vol; }
  }
  return v;
}

/** A client content category as carried on `_categoryBreakdown.categories`. */
export interface SeedCategory {
  name?:          string;
  type?:          string;
  monthlyDemand?: number;       // v7.285: the category's REAL monthly demand (same field Market Gap shows)
}

export interface BuildSeedsOptions {
  categories?: SeedCategory[];
  brand:       string;          // brand display (clientName) e.g. "Sono Bello"
  clientDomain?: string;
  pool?:       SeedPoolItem[];
  maxSeeds?:   number;          // cap (incl. brand). default 10 (v7.284; was 8)
}

/** Default cap for the local services grid (brand + services). v7.284: 8 → 10. */
export const DEFAULT_SERVICE_CAP = 10;

/** Build the client brand-token map (≥3-char display words + the ≥4-char domain root). */
function buildBrandTokenMap(brand: string, clientDomain?: string): Record<string, boolean> {
  const brandDisplay = clean(brand);
  const root = brandRoot(clientDomain || '');
  const brandTokens: Record<string, boolean> = {};
  brandDisplay.split(' ').forEach(w => { if (w.length >= 3) brandTokens[w] = true; });
  if (root.length >= 4) brandTokens[root] = true;
  return brandTokens;
}

/**
 * Resolve ONE category/term to its cleaned service term + distinctive token, or
 * null if the name is pure noise/brand (no distinctive ≥4-char service word).
 * Term validity only — the VOLUME is assigned by the caller (real category demand
 * preferred, v7.285), so the catalog and the curated list stay one source of truth.
 */
function serviceTermOf(
  rawName: string,
  brandTokens: Record<string, boolean>,
): { term: string; tok: string } | null {
  const name = clean(rawName || '');
  if (!name) return null;
  const words = name.split(' ').filter(w => w.length >= 4 && SEED_NOISE[w] !== true && brandTokens[w] !== true);
  if (words.length === 0) return null;                  // pure noise/brand → skip
  // distinctive token = the longest non-noise word (used only as a volume FALLBACK)
  let tok = words[0];
  for (let i = 1; i < words.length; i++) if (words[i].length > tok.length) tok = words[i];
  return { term: name, tok };
}

/** Map clean(category name) → its real monthly demand (Const I.1; the Market-Gap field). */
function demandByTerm(categories: SeedCategory[]): Record<string, number> {
  const m: Record<string, number> = {};
  categories.forEach(c => {
    const t = clean((c && c.name) || '');
    if (t && c && typeof c.monthlyDemand === 'number' && isFinite(c.monthlyDemand)) {
      if (m[t] == null || c.monthlyDemand > m[t]) m[t] = c.monthlyDemand;
    }
  });
  return m;
}

export interface BuildCatalogOptions {
  categories?: SeedCategory[];
  brand:       string;
  clientDomain?: string;
  pool?:       SeedPoolItem[];
}

/**
 * The FULL (un-capped) ordered catalog of candidate service seeds — every client
 * service category that isn't pure noise/brand, deduped, sorted highest REAL
 * monthly demand → lowest (v7.285: was the client's ranked-keyword volume; now the
 * category's own `monthlyDemand`, the same number Market Gap shows, so the picker
 * reconciles with the rest of the app — Const II.7 / I.1). Falls back to the
 * ranked-pool volume of the distinctive token only when a category carries no
 * demand (older snapshots). The brand seed is NOT included (services only). The
 * caller applies the competitor-brand guard to `categories` first (Const III.1a).
 */
export function buildServiceCatalog(opts: BuildCatalogOptions): ServiceSeed[] {
  const pool = opts.pool ?? [];
  const clientPool = pool.filter(k => !k.competitor && !k.isGap);
  const brandTokens = buildBrandTokenMap(opts.brand, opts.clientDomain);
  const demand = demandByTerm(opts.categories ?? []);

  const services: ServiceSeed[] = [];
  const seen: Record<string, boolean> = {};
  (opts.categories ?? []).forEach(c => {
    const r = serviceTermOf((c && c.name) || '', brandTokens);
    if (!r || seen[r.term]) return;
    seen[r.term] = true;
    const volume = demand[r.term] != null ? demand[r.term] : volumeFor(r.tok, clientPool);
    services.push({ term: r.term, kind: 'service', volume });
  });
  services.sort((a, b) => b.volume - a.volume);
  return services;
}

/**
 * Build the ordered seed list: the brand first, then the highest-volume service
 * categories (deduped, noise/brand stripped), capped to `maxSeeds`.
 */
export function buildServiceSeeds(opts: BuildSeedsOptions): ServiceSeed[] {
  const maxSeeds = Math.max(1, opts.maxSeeds ?? DEFAULT_SERVICE_CAP);
  const pool = opts.pool ?? [];
  const clientPool = pool.filter(k => !k.competitor && !k.isGap);
  const brandTokens = buildBrandTokenMap(opts.brand, opts.clientDomain);
  const brandDisplay = clean(opts.brand);

  const seeds: ServiceSeed[] = [];

  // 1) brand seed
  if (brandDisplay) {
    let bv = 0;
    Object.keys(brandTokens).forEach(t => { const v = volumeFor(t, clientPool); if (v > bv) bv = v; });
    seeds.push({ term: brandDisplay, kind: 'brand', volume: bv });
  }

  // 2) service seeds from the catalog (skip the brand name if it appears there)
  const catalog = buildServiceCatalog(opts);
  for (let i = 0; i < catalog.length && seeds.length < maxSeeds; i++) {
    if (catalog[i].term === brandDisplay) continue;
    seeds.push(catalog[i]);
  }
  return seeds.slice(0, maxSeeds);
}

export interface BuildFromTermsOptions {
  serviceTerms: string[];       // curated, ordered service terms (services only — brand is added here)
  brand:       string;
  clientDomain?: string;
  pool?:       SeedPoolItem[];
  categories?: SeedCategory[];  // v7.285: source for each term's real monthly demand
  maxSeeds?:   number;          // cap incl. brand. default 10
}

/**
 * Build seeds from an EXPLICIT curated service-term list (Wayne's deleted/added
 * picks on the Local panel), brand pinned first. Each term's volume is its REAL
 * category monthly demand (v7.285) — looked up from `categories`, the same source
 * the catalog uses — so the displayed list and the scanned list reconcile (Const
 * II.7 / I.1), falling back to the ranked-pool volume only when a term carries no
 * demand. Order is preserved (the user's order), then capped to `maxSeeds`.
 * Pure-noise/brand terms are dropped. The caller guards the categories upstream.
 */
export function buildSeedsFromServiceTerms(opts: BuildFromTermsOptions): ServiceSeed[] {
  const maxSeeds = Math.max(1, opts.maxSeeds ?? DEFAULT_SERVICE_CAP);
  const pool = opts.pool ?? [];
  const clientPool = pool.filter(k => !k.competitor && !k.isGap);
  const brandTokens = buildBrandTokenMap(opts.brand, opts.clientDomain);
  const brandDisplay = clean(opts.brand);
  const demand = demandByTerm(opts.categories ?? []);

  const seeds: ServiceSeed[] = [];
  const seen: Record<string, boolean> = {};

  // brand pinned first
  if (brandDisplay) {
    let bv = 0;
    Object.keys(brandTokens).forEach(t => { const v = volumeFor(t, clientPool); if (v > bv) bv = v; });
    seeds.push({ term: brandDisplay, kind: 'brand', volume: bv });
    seen[brandDisplay] = true;
  }

  (opts.serviceTerms ?? []).forEach(raw => {
    if (seeds.length >= maxSeeds) return;
    const r = serviceTermOf(raw, brandTokens);
    if (!r || seen[r.term]) return;
    seen[r.term] = true;
    const volume = demand[r.term] != null ? demand[r.term] : volumeFor(r.tok, clientPool);
    seeds.push({ term: r.term, kind: 'service', volume });
  });
  return seeds.slice(0, maxSeeds);
}

/** The grid keyword for a seed at a city: "{seed} {city}" (e.g. "liposuction austin"). */
export function gridKeyword(seedTerm: string, city: string): string {
  const s = String(seedTerm || '').trim();
  const c = String(city || '').trim();
  return c ? `${s} ${c}`.toLowerCase() : s.toLowerCase();
}

export type LocationOrder = 'market' | 'demand' | 'az';

export interface OrderableLocation { city?: string; title?: string; }

/**
 * Order locations for scanning so a capped scan covers the most valuable cities
 * first. Defensible, data-only orderings:
 *   'market' — largest metros first (population proxy via `cityRank`, a static
 *              largest-cities index). Default.
 *   'demand' — highest real Semrush demand first (max pool volume of any keyword
 *              naming the city). Uses data already pulled — no fabrication.
 *   'az'     — alphabetical by city.
 * Returns a NEW array; ties keep original order (stable).
 */
export function orderLocationsForScan<T extends OrderableLocation>(
  locations: T[],
  mode: LocationOrder,
  opts: { pool?: SeedPoolItem[]; cityRank?: (c: string) => number } = {},
): T[] {
  const pool = opts.pool ?? [];
  const cityRank = opts.cityRank ?? (() => 100000);
  const demandFor = (city: string): number => {
    const c = String(city || '').toLowerCase().trim();
    if (!c) return 0;
    let v = 0;
    for (let i = 0; i < pool.length; i++) {
      const k = String(pool[i].keyword || '').toLowerCase();
      if (k.indexOf(c) >= 0) { const vol = pool[i].searchVolume || 0; if (vol > v) v = vol; }
    }
    return v;
  };
  const idx = locations.map((l, i) => ({ l, i }));
  idx.sort((a, b) => {
    const ca = (a.l.city || a.l.title || ''), cb = (b.l.city || b.l.title || '');
    if (mode === 'az') {
      const la = ca.toLowerCase(), lb = cb.toLowerCase();
      const r = la < lb ? -1 : la > lb ? 1 : 0;
      return r !== 0 ? r : a.i - b.i;
    }
    if (mode === 'demand') { const d = demandFor(cb) - demandFor(ca); return d !== 0 ? d : a.i - b.i; }
    const r = cityRank(ca) - cityRank(cb);      // 'market' (default)
    return r !== 0 ? r : a.i - b.i;
  });
  return idx.map(x => x.l);
}
