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

export interface BuildSeedsOptions {
  categories?: Array<{ name?: string; type?: string }>;
  brand:       string;          // brand display (clientName) e.g. "Sono Bello"
  clientDomain?: string;
  pool?:       SeedPoolItem[];
  maxSeeds?:   number;          // cap (incl. brand). default 8
}

/**
 * Build the ordered seed list: the brand first, then the highest-volume service
 * categories (deduped, noise/brand stripped), capped to `maxSeeds`.
 */
export function buildServiceSeeds(opts: BuildSeedsOptions): ServiceSeed[] {
  const maxSeeds = Math.max(1, opts.maxSeeds ?? 8);
  const pool = opts.pool ?? [];
  const clientPool = pool.filter(k => !k.competitor && !k.isGap);

  const brandDisplay = clean(opts.brand);
  const root = brandRoot(opts.clientDomain || '');
  const brandTokens: Record<string, boolean> = {};
  brandDisplay.split(' ').forEach(w => { if (w.length >= 3) brandTokens[w] = true; });
  if (root.length >= 4) brandTokens[root] = true;

  const seeds: ServiceSeed[] = [];
  const seen: Record<string, boolean> = {};

  // 1) brand seed
  if (brandDisplay) {
    let bv = 0;
    Object.keys(brandTokens).forEach(t => { const v = volumeFor(t, clientPool); if (v > bv) bv = v; });
    seeds.push({ term: brandDisplay, kind: 'brand', volume: bv });
    seen[brandDisplay] = true;
  }

  // 2) service seeds from categories (skip brand-ish + noise-only names)
  const services: ServiceSeed[] = [];
  (opts.categories ?? []).forEach(c => {
    const name = clean((c && c.name) || '');
    if (!name || seen[name]) return;
    const words = name.split(' ').filter(w => w.length >= 4 && SEED_NOISE[w] !== true && brandTokens[w] !== true);
    if (words.length === 0) return;                       // pure noise/brand → skip
    // distinctive token = the longest non-noise word (for volume lookup)
    let tok = words[0];
    for (let i = 1; i < words.length; i++) if (words[i].length > tok.length) tok = words[i];
    seen[name] = true;
    services.push({ term: name, kind: 'service', volume: volumeFor(tok, clientPool) });
  });
  services.sort((a, b) => b.volume - a.volume);

  for (let i = 0; i < services.length && seeds.length < maxSeeds; i++) seeds.push(services[i]);
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
