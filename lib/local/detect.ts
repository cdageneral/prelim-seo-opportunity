/**
 * lib/local/detect.ts — v7.177 (Local Search panel)
 *
 * DETERMINISTIC local-intent keyword detection. No AI, no modeling — every
 * classification is explained by a literal token/phrase match so it is fully
 * auditable and defensible (Wayne's no-fabricated-data rule).
 *
 * A keyword is "local" if it carries any of three intent signals:
 *   - 'near-me'        — explicit proximity phrasing ("dentist near me")
 *   - 'geo-modifier'   — names a place: a US state, a major city, OR a term
 *                        drawn from the client's own discovered locations
 *                        (city / neighborhood) so it adapts per client
 *                        ("invisalign mission valley", "san diego dentist")
 *   - 'implicit-local' — no place + no near-me, but unmistakably a
 *                        physical-visit / local-business search
 *                        ("emergency dentist", "atm", "store hours",
 *                        "directions to ...")
 *
 * ES5-safe: no for…of over Set/Map (Array.from everywhere), no block-scoped
 * function declarations. Pure module — unit-tested in isolation.
 */

export type LocalIntent = 'near-me' | 'geo-modifier' | 'implicit-local';

export interface LocalKeyword {
  keyword:      string;
  searchVolume: number;
  intent:       LocalIntent;
  matchedTerm:  string;   // the literal token/phrase that triggered classification (audit trail)
  position:     number | null;
  isGap:        boolean;
  competitor:   string | null;
}

// ─── Vocabulary (all lowercase) ────────────────────────────────────────────────

// Explicit proximity phrasing.
const NEAR_ME_PHRASES = [
  'near me', 'near by', 'nearby', 'near you', 'closest', 'close to me',
  'close by', 'around me', 'in my area', 'in my city', 'in my town',
  'open now', 'nearest',
];

// US states (full + 2-letter). 2-letter codes are matched as WHOLE words only
// (so "in" the preposition or "or" never false-trigger — see geoHasWholeWord).
const US_STATES_FULL = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
  'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
  'washington', 'west virginia', 'wisconsin', 'wyoming',
];
const US_STATE_ABBR = [
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id',
  'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms',
  'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok',
  'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
];

// Largest ~150 US cities + common multi-word metros. Multi-word entries are
// matched as substrings; single tokens as whole words.
const US_CITIES = [
  'new york', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
  'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville',
  'fort worth', 'columbus', 'charlotte', 'san francisco', 'indianapolis',
  'seattle', 'denver', 'washington dc', 'boston', 'el paso', 'nashville',
  'detroit', 'oklahoma city', 'portland', 'las vegas', 'memphis', 'louisville',
  'baltimore', 'milwaukee', 'albuquerque', 'tucson', 'fresno', 'mesa',
  'sacramento', 'atlanta', 'kansas city', 'colorado springs', 'omaha',
  'raleigh', 'miami', 'long beach', 'virginia beach', 'oakland', 'minneapolis',
  'tulsa', 'tampa', 'arlington', 'new orleans', 'wichita', 'cleveland',
  'bakersfield', 'aurora', 'anaheim', 'honolulu', 'santa ana', 'riverside',
  'corpus christi', 'lexington', 'henderson', 'stockton', 'saint paul',
  'st paul', 'cincinnati', 'st louis', 'saint louis', 'pittsburgh', 'greensboro',
  'lincoln', 'anchorage', 'plano', 'orlando', 'irvine', 'newark', 'durham',
  'chula vista', 'toledo', 'fort wayne', 'st petersburg', 'laredo', 'jersey city',
  'chandler', 'madison', 'lubbock', 'scottsdale', 'reno', 'buffalo', 'gilbert',
  'glendale', 'north las vegas', 'winston salem', 'chesapeake', 'norfolk',
  'fremont', 'garland', 'irving', 'hialeah', 'richmond', 'boise', 'spokane',
  'baton rouge', 'tacoma', 'san bernardino', 'modesto', 'fontana', 'des moines',
  'moreno valley', 'santa clarita', 'fayetteville', 'birmingham', 'oxnard',
  'rochester', 'port st lucie', 'grand rapids', 'huntsville', 'salt lake city',
  'frisco', 'yonkers', 'amarillo', 'glendale', 'huntington beach', 'mckinney',
  'montgomery', 'augusta', 'aurora', 'akron', 'little rock', 'tempe',
  'columbus', 'overland park', 'grand prairie', 'tallahassee', 'cape coral',
  'mobile', 'knoxville', 'shreveport', 'worcester', 'ontario', 'vancouver',
  'sioux falls', 'chattanooga', 'brownsville', 'fort lauderdale', 'providence',
  'newport news', 'rancho cucamonga', 'santa rosa', 'peoria', 'oceanside',
  'elk grove', 'salem', 'pembroke pines', 'eugene', 'garden grove', 'cary',
  'fort collins', 'corona', 'springfield', 'jackson', 'alexandria', 'clarksville',
  'mission valley', 'la jolla', 'north park', 'pacific beach', 'hillcrest',
];

// Implicit-local signals — physical-visit / local-business searches with no
// place name and no "near me". Conservative on purpose.
const IMPLICIT_PHRASES = [
  'directions to', 'directions', 'hours', 'opening hours', 'open today',
  'phone number', 'location', 'locations', 'address', 'walk in', 'walk-in',
  'drive through', 'drive thru', 'curbside', 'same day', 'same-day',
  'emergency', '24 hour', '24-hour', '24/7', 'appointment', 'book online',
  'pick up', 'pickup', 'in store', 'in-store', 'branch', 'dealership',
  'showroom', 'storefront', 'atm', 'gas station', 'drop off', 'drop-off',
];
// Single-token local-business professions / venue types that imply a visit.
const IMPLICIT_BUSINESS_NOUNS = [
  'dentist', 'dentists', 'orthodontist', 'optometrist', 'chiropractor',
  'plumber', 'plumbers', 'electrician', 'electricians', 'locksmith', 'roofer',
  'roofers', 'hvac', 'mechanic', 'mechanics', 'contractor', 'contractors',
  'landscaper', 'handyman', 'painter', 'mover', 'movers', 'realtor', 'realtors',
  'restaurant', 'restaurants', 'cafe', 'coffee shop', 'bar', 'pub', 'diner',
  'pharmacy', 'pharmacies', 'urgent care', 'clinic', 'clinics', 'hospital',
  'veterinarian', 'vet', 'salon', 'salons', 'barber', 'barbershop', 'spa',
  'gym', 'gyms', 'daycare', 'preschool', 'attorney', 'lawyer', 'lawyers',
  'accountant', 'cpa', 'bank', 'banks', 'credit union', 'car wash', 'auto repair',
  'tire shop', 'car dealership', 'dealership', 'hotel', 'hotels', 'motel',
  'florist', 'bakery', 'butcher', 'nail salon', 'tattoo shop', 'storage units',
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Whole-word presence of `term` (single token) in the keyword's token list. */
function hasWholeWord(tokens: string[], term: string): boolean {
  return tokens.indexOf(term) >= 0;
}

/** Match any phrase in `list`: multi-word → substring on the normalized string;
 *  single-word → whole-word on the token list. */
function matchAny(kwLower: string, tokens: string[], list: string[]): string | null {
  for (let i = 0; i < list.length; i++) {
    const term = list[i];
    if (term.indexOf(' ') >= 0) {
      if (kwLower.indexOf(term) >= 0) return term;
    } else if (hasWholeWord(tokens, term)) {
      return term;
    }
  }
  return null;
}

// Lookup set for the postal-code abbreviation matcher.
const ABBR_SET: Record<string, boolean> = (function () {
  const m: Record<string, boolean> = {};
  for (let i = 0; i < US_STATE_ABBR.length; i++) m[US_STATE_ABBR[i]] = true;
  return m;
})();

/** Match a 2-letter state code ONLY in the postal "City, ST" form (after a comma),
 *  e.g. "camden, nj" or "scottsdale, az 85251". Returns the matched code or null. */
function postalAbbr(kwLower: string): string | null {
  const re = /,\s*([a-z]{2})(?![a-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(kwLower)) !== null) {
    if (ABBR_SET[m[1]] === true) return m[1];
  }
  return null;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface DetectOptions {
  /** Extra geo terms discovered from the client's Google Business listings
   *  (city + neighborhood names). Makes detection client-adaptive. Lowercased. */
  geoVocab?: string[];
  /** Client-relevance vocabulary (lowercase, len ≥ 4). When provided & non-empty,
   *  a keyword is only classified as local if it shares one of these tokens with
   *  the client's categories or brand — so off-topic footprint keywords (e.g. a
   *  sports/zoo/bank term that merely contains a city name) never enter the panel.
   *  Build it with `buildClientRelevance`. Mirrors the v7.173 relevance gate used
   *  by the Content & Journey panels. (v7.178) */
  relevanceTokens?: string[];
}

// Generic, non-distinctive category words to ignore when building relevance
// vocabulary (kept minimal — only words that carry no topical signal).
const CAT_NOISE: Record<string, boolean> = (function () {
  const m: Record<string, boolean> = {};
  ['near', 'other', 'general', 'misc', 'services', 'service', 'online', 'information',
   'guide', 'guides', 'review', 'reviews', 'best', 'cost', 'costs', 'price', 'prices',
   'cheap', 'free', 'open', 'hours'].forEach(w => { m[w] = true; });
  return m;
})();

/** domain → distinctive brand root ("sonobello.com" → "sonobello"). */
function brandRoot(domain: string): string {
  return String(domain ?? '')
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    .replace(/\/.*$/, '').toLowerCase().trim().split('.')[0] || '';
}

// Geographic stopwords (cities + states + abbreviations) — EXCLUDED from the
// relevance vocabulary. Geography is the local-intent SIGNAL, not the relevance
// signal: a client that ranks for "sono bello houston" must NOT whitelist
// "houston rockets". So city/state tokens are dropped when building the vocab;
// only the business vocabulary (cosmetic terms, brand, etc.) gates relevance.
const GEO_STOPWORDS: Record<string, boolean> = (function () {
  const m: Record<string, boolean> = {};
  const add = (s: string) => { s.split(/\s+/).forEach(w => { if (w) m[w] = true; }); };
  US_CITIES.forEach(add);
  US_STATES_FULL.forEach(add);
  US_STATE_ABBR.forEach(w => { m[w] = true; });
  return m;
})();

/**
 * Build the client-relevance vocabulary (lowercase, len ≥ 4) from:
 *   1. the client's content categories (`_categoryBreakdown.categories`),
 *   2. the client's & competitors' brand roots, and
 *   3. (v7.179) the client's OWN ranking keywords — the most authoritative signal
 *      of what the business is actually about.
 * GEO words (cities/states/abbr) and generic noise are EXCLUDED so a shared city
 * name can never whitelist an off-topic term. Pass the result as
 * `DetectOptions.relevanceTokens`. No AI, no modeling — every drop is explainable
 * by zero business-vocabulary overlap (extends the v7.173 Content/Journey gate).
 */
export function buildClientRelevance(
  categories: Array<{ name?: string }> | null | undefined,
  clientDomain: string,
  competitorDomains: string[] = [],
  clientKeywords: string[] = [],
): string[] {
  const set: Record<string, boolean> = {};
  const addPhrase = (s: string) => {
    String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .forEach(w => { if (w.length >= 4 && CAT_NOISE[w] !== true && GEO_STOPWORDS[w] !== true) set[w] = true; });
  };
  (categories ?? []).forEach(c => addPhrase((c && c.name) || ''));
  (clientKeywords ?? []).forEach(addPhrase);
  [clientDomain].concat(competitorDomains ?? []).map(brandRoot).filter(Boolean)
    .forEach(b => { if (b.length >= 4 && GEO_STOPWORDS[b] !== true) set[b] = true; });
  return Object.keys(set);
}

/**
 * Classify a single keyword. Returns the intent + the literal matched term, or
 * null if the keyword shows no local intent. Precedence: near-me → geo → implicit.
 */
export function detectLocalIntent(
  keyword: string,
  opts: DetectOptions = {},
): { intent: LocalIntent; matchedTerm: string } | null {
  const kwLower = String(keyword ?? '').toLowerCase().trim();
  if (!kwLower) return null;
  const tokens = tokenize(kwLower);

  // 1) near-me (highest precedence)
  const near = matchAny(kwLower, tokens, NEAR_ME_PHRASES);
  if (near) return { intent: 'near-me', matchedTerm: near };

  // 2) geo-modifier — client locations first (most specific), then cities, then states.
  const clientGeo = (opts.geoVocab ?? []).filter(Boolean).map(g => g.toLowerCase());
  const geoCities = matchAny(kwLower, tokens, clientGeo);
  if (geoCities) return { intent: 'geo-modifier', matchedTerm: geoCities };
  const city = matchAny(kwLower, tokens, US_CITIES);
  if (city) return { intent: 'geo-modifier', matchedTerm: city };
  const stateFull = matchAny(kwLower, tokens, US_STATES_FULL);
  if (stateFull) return { intent: 'geo-modifier', matchedTerm: stateFull };
  // 2-letter state abbreviations are matched ONLY in the postal "City, ST" form —
  // i.e. immediately after a comma ("camden, nj", "scottsdale, az 85251").
  // v7.177 matched any bare abbr token, which false-fired on common English words
  // and name fragments that collide with state codes — "world longest river IN the
  // world" (in=Indiana), "AL-nassr fc" (al=Alabama), "PA-c" (pa=Pennsylvania),
  // "OR" / "ME" / "HI" / "OK" etc. Requiring a leading comma removes those without
  // losing real geo: a genuine "City ST" with a known city already matches as a
  // city above, and a client's own area is covered by geoVocab. (v7.178 fix.)
  const abbr = postalAbbr(kwLower);
  if (abbr) return { intent: 'geo-modifier', matchedTerm: abbr };

  // 3) implicit-local — visit signals or local-business nouns.
  const implPhrase = matchAny(kwLower, tokens, IMPLICIT_PHRASES);
  if (implPhrase) return { intent: 'implicit-local', matchedTerm: implPhrase };
  const implNoun = matchAny(kwLower, tokens, IMPLICIT_BUSINESS_NOUNS);
  if (implNoun) return { intent: 'implicit-local', matchedTerm: implNoun };

  return null;
}

/**
 * Filter a keyword pool down to its local-intent subset, annotated with intent
 * + the matched term. Input items must carry { keyword, searchVolume, position,
 * isGap, competitor } (a superset of KwPoolItem). Sorted by volume desc.
 */
export function classifyLocalKeywords(
  pool: Array<{ keyword: string; searchVolume: number; position?: number | null; isGap?: boolean; competitor?: string | null }>,
  opts: DetectOptions = {},
): LocalKeyword[] {
  const out: LocalKeyword[] = [];
  const seen: Record<string, boolean> = {};
  const rel = opts.relevanceTokens ?? [];
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    const kw = String(item.keyword ?? '').toLowerCase().trim();
    if (!kw || seen[kw]) continue;
    // client-relevance gate (v7.178): when a relevance vocabulary is supplied,
    // a keyword must share one of its tokens with the client's categories/brand,
    // else it is off-topic for this client and excluded entirely.
    if (rel.length > 0) {
      let relevant = false;
      for (let j = 0; j < rel.length; j++) { if (kw.indexOf(rel[j]) >= 0) { relevant = true; break; } }
      if (!relevant) continue;
    }
    const hit = detectLocalIntent(kw, opts);
    if (!hit) continue;
    seen[kw] = true;
    out.push({
      keyword:      item.keyword,
      searchVolume: item.searchVolume ?? 0,
      intent:       hit.intent,
      matchedTerm:  hit.matchedTerm,
      position:     item.position ?? null,
      isGap:        !!item.isGap,
      competitor:   item.competitor ?? null,
    });
  }
  out.sort((a, b) => b.searchVolume - a.searchVolume);
  return out;
}

/** Quick counts by intent type for summary cards. */
export function localIntentCounts(locals: LocalKeyword[]): {
  total: number; nearMe: number; geo: number; implicit: number; totalVolume: number;
} {
  let nearMe = 0, geo = 0, implicit = 0, totalVolume = 0;
  for (let i = 0; i < locals.length; i++) {
    const l = locals[i];
    if (l.intent === 'near-me') nearMe++;
    else if (l.intent === 'geo-modifier') geo++;
    else implicit++;
    totalVolume += l.searchVolume || 0;
  }
  return { total: locals.length, nearMe, geo, implicit, totalVolume };
}
