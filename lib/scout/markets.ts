/**
 * lib/scout/markets.ts — v7.545
 *
 * Scout's market list = every COUNTRY database the Semrush API accepts for its
 * `database` parameter (121, read from the Semrush API report schema on
 * 2026-10-08; the 17 `mobile-*` and 7 `*-ext` variants are not separate
 * countries and are left out). Wayne 2026-10-08: "the market drop down should
 * mirror the same countries available from SemRush".
 *
 * Deliberately SEPARATE from lib/utils/markets.ts: that list also drives
 * OrbitIQ projects, whose SERP scans need per-country SerpAPI/DataForSEO
 * parameters nobody has verified beyond US/CA/UK/AU. Scout only needs the
 * Semrush code — plus `geo`, the Google geo-target country id (2000 + the
 * ISO 3166-1 numeric code; e.g. 2840 US, 2826 UK, 2008 Albania) used to find
 * the market in DataForSEO's recorded-AI-answer location list. Matching there
 * also falls back to the country name, and a market found by neither is
 * reported as not covered — never guessed (Const I.5).
 *
 * Order: the four markets Scout shipped with first (Semrush's own dropdown
 * leads with US/CA/UK), then every other database A–Z.
 */

export interface ScoutMarket {
  code:  string;   // Semrush `database` code
  label: string;   // country name shown in the dropdown and the PDF
  geo:   number;   // Google geo-target country id (DataForSEO location_code)
}

export const SCOUT_TOP_MARKETS = ['us', 'ca', 'uk', 'au'] as const;

export const SCOUT_MARKETS: ScoutMarket[] = [
  { code: 'us', label: 'United States', geo: 2840 },
  { code: 'ca', label: 'Canada', geo: 2124 },
  { code: 'uk', label: 'United Kingdom', geo: 2826 },
  { code: 'au', label: 'Australia', geo: 2036 },
  { code: 'af', label: 'Afghanistan', geo: 2004 },
  { code: 'al', label: 'Albania', geo: 2008 },
  { code: 'dz', label: 'Algeria', geo: 2012 },
  { code: 'ao', label: 'Angola', geo: 2024 },
  { code: 'ar', label: 'Argentina', geo: 2032 },
  { code: 'am', label: 'Armenia', geo: 2051 },
  { code: 'at', label: 'Austria', geo: 2040 },
  { code: 'az', label: 'Azerbaijan', geo: 2031 },
  { code: 'bs', label: 'Bahamas', geo: 2044 },
  { code: 'bh', label: 'Bahrain', geo: 2048 },
  { code: 'bd', label: 'Bangladesh', geo: 2050 },
  { code: 'by', label: 'Belarus', geo: 2112 },
  { code: 'be', label: 'Belgium', geo: 2056 },
  { code: 'bz', label: 'Belize', geo: 2084 },
  { code: 'bo', label: 'Bolivia', geo: 2068 },
  { code: 'ba', label: 'Bosnia and Herzegovina', geo: 2070 },
  { code: 'bw', label: 'Botswana', geo: 2072 },
  { code: 'br', label: 'Brazil', geo: 2076 },
  { code: 'bn', label: 'Brunei', geo: 2096 },
  { code: 'bg', label: 'Bulgaria', geo: 2100 },
  { code: 'kh', label: 'Cambodia', geo: 2116 },
  { code: 'cm', label: 'Cameroon', geo: 2120 },
  { code: 'cv', label: 'Cape Verde', geo: 2132 },
  { code: 'cl', label: 'Chile', geo: 2152 },
  { code: 'co', label: 'Colombia', geo: 2170 },
  { code: 'cr', label: 'Costa Rica', geo: 2188 },
  { code: 'hr', label: 'Croatia', geo: 2191 },
  { code: 'cy', label: 'Cyprus', geo: 2196 },
  { code: 'cz', label: 'Czechia', geo: 2203 },
  { code: 'dk', label: 'Denmark', geo: 2208 },
  { code: 'do', label: 'Dominican Republic', geo: 2214 },
  { code: 'cd', label: 'DR Congo', geo: 2180 },
  { code: 'ec', label: 'Ecuador', geo: 2218 },
  { code: 'eg', label: 'Egypt', geo: 2818 },
  { code: 'sv', label: 'El Salvador', geo: 2222 },
  { code: 'ee', label: 'Estonia', geo: 2233 },
  { code: 'et', label: 'Ethiopia', geo: 2231 },
  { code: 'fi', label: 'Finland', geo: 2246 },
  { code: 'fr', label: 'France', geo: 2250 },
  { code: 'ge', label: 'Georgia', geo: 2268 },
  { code: 'de', label: 'Germany', geo: 2276 },
  { code: 'gh', label: 'Ghana', geo: 2288 },
  { code: 'gr', label: 'Greece', geo: 2300 },
  { code: 'gt', label: 'Guatemala', geo: 2320 },
  { code: 'gy', label: 'Guyana', geo: 2328 },
  { code: 'ht', label: 'Haiti', geo: 2332 },
  { code: 'hn', label: 'Honduras', geo: 2340 },
  { code: 'hk', label: 'Hong Kong', geo: 2344 },
  { code: 'hu', label: 'Hungary', geo: 2348 },
  { code: 'is', label: 'Iceland', geo: 2352 },
  { code: 'in', label: 'India', geo: 2356 },
  { code: 'id', label: 'Indonesia', geo: 2360 },
  { code: 'ie', label: 'Ireland', geo: 2372 },
  { code: 'il', label: 'Israel', geo: 2376 },
  { code: 'it', label: 'Italy', geo: 2380 },
  { code: 'jm', label: 'Jamaica', geo: 2388 },
  { code: 'jp', label: 'Japan', geo: 2392 },
  { code: 'jo', label: 'Jordan', geo: 2400 },
  { code: 'kz', label: 'Kazakhstan', geo: 2398 },
  { code: 'kw', label: 'Kuwait', geo: 2414 },
  { code: 'lv', label: 'Latvia', geo: 2428 },
  { code: 'lb', label: 'Lebanon', geo: 2422 },
  { code: 'ly', label: 'Libya', geo: 2434 },
  { code: 'lt', label: 'Lithuania', geo: 2440 },
  { code: 'lu', label: 'Luxembourg', geo: 2442 },
  { code: 'mg', label: 'Madagascar', geo: 2450 },
  { code: 'my', label: 'Malaysia', geo: 2458 },
  { code: 'mt', label: 'Malta', geo: 2470 },
  { code: 'mu', label: 'Mauritius', geo: 2480 },
  { code: 'mx', label: 'Mexico', geo: 2484 },
  { code: 'md', label: 'Moldova', geo: 2498 },
  { code: 'mn', label: 'Mongolia', geo: 2496 },
  { code: 'me', label: 'Montenegro', geo: 2499 },
  { code: 'ma', label: 'Morocco', geo: 2504 },
  { code: 'mz', label: 'Mozambique', geo: 2508 },
  { code: 'na', label: 'Namibia', geo: 2516 },
  { code: 'np', label: 'Nepal', geo: 2524 },
  { code: 'nl', label: 'Netherlands', geo: 2528 },
  { code: 'nz', label: 'New Zealand', geo: 2554 },
  { code: 'ni', label: 'Nicaragua', geo: 2558 },
  { code: 'ng', label: 'Nigeria', geo: 2566 },
  { code: 'no', label: 'Norway', geo: 2578 },
  { code: 'om', label: 'Oman', geo: 2512 },
  { code: 'pk', label: 'Pakistan', geo: 2586 },
  { code: 'pa', label: 'Panama', geo: 2591 },
  { code: 'py', label: 'Paraguay', geo: 2600 },
  { code: 'pe', label: 'Peru', geo: 2604 },
  { code: 'ph', label: 'Philippines', geo: 2608 },
  { code: 'pl', label: 'Poland', geo: 2616 },
  { code: 'pt', label: 'Portugal', geo: 2620 },
  { code: 'qa', label: 'Qatar', geo: 2634 },
  { code: 'ro', label: 'Romania', geo: 2642 },
  { code: 'ru', label: 'Russia', geo: 2643 },
  { code: 'sa', label: 'Saudi Arabia', geo: 2682 },
  { code: 'sn', label: 'Senegal', geo: 2686 },
  { code: 'rs', label: 'Serbia', geo: 2688 },
  { code: 'sg', label: 'Singapore', geo: 2702 },
  { code: 'sk', label: 'Slovakia', geo: 2703 },
  { code: 'si', label: 'Slovenia', geo: 2705 },
  { code: 'za', label: 'South Africa', geo: 2710 },
  { code: 'kr', label: 'South Korea', geo: 2410 },
  { code: 'es', label: 'Spain', geo: 2724 },
  { code: 'lk', label: 'Sri Lanka', geo: 2144 },
  { code: 'se', label: 'Sweden', geo: 2752 },
  { code: 'ch', label: 'Switzerland', geo: 2756 },
  { code: 'tw', label: 'Taiwan', geo: 2158 },
  { code: 'th', label: 'Thailand', geo: 2764 },
  { code: 'tt', label: 'Trinidad and Tobago', geo: 2780 },
  { code: 'tn', label: 'Tunisia', geo: 2788 },
  { code: 'tr', label: 'Turkey', geo: 2792 },
  { code: 'ua', label: 'Ukraine', geo: 2804 },
  { code: 'ae', label: 'United Arab Emirates', geo: 2784 },
  { code: 'uy', label: 'Uruguay', geo: 2858 },
  { code: 've', label: 'Venezuela', geo: 2862 },
  { code: 'vn', label: 'Vietnam', geo: 2704 },
  { code: 'zm', label: 'Zambia', geo: 2894 },
  { code: 'zw', label: 'Zimbabwe', geo: 2716 },
];

const BY_CODE = new Map<string, ScoutMarket>(SCOUT_MARKETS.map(m => [m.code, m]));

export function isScoutMarket(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code);
}

/** Look up a Scout market by Semrush code; unknown or missing codes fall back to US (stored pre-v7.545 runs are all us/ca/uk/au). */
export function getScoutMarket(code: string | null | undefined): ScoutMarket {
  return BY_CODE.get(code ?? 'us') ?? BY_CODE.get('us')!;
}
