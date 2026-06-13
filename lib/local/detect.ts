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

// ─── Public API ────────────────────────────────────────────────────────────────

export interface DetectOptions {
  /** Extra geo terms discovered from the client's Google Business listings
   *  (city + neighborhood names). Makes detection client-adaptive. Lowercased. */
  geoVocab?: string[];
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
  // 2-letter abbreviations only when the keyword has >1 token (avoid a bare "ca")
  if (tokens.length > 1) {
    const abbr = matchAny(kwLower, tokens, US_STATE_ABBR);
    if (abbr) return { intent: 'geo-modifier', matchedTerm: abbr };
  }

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
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    const kw = String(item.keyword ?? '').toLowerCase().trim();
    if (!kw || seen[kw]) continue;
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
