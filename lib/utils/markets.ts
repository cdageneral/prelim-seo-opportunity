/**
 * lib/utils/markets.ts — v7.99
 *
 * Single source of truth for the per-project market (country) setting.
 * Each market maps the Semrush regional database code to the matching
 * SerpAPI parameters so keyword data and SERP-feature scans always come
 * from the SAME country's Google.
 *
 * Codes verified against the Semrush API database list (us/ca/uk/au are all
 * valid `database` values) and SerpAPI's supported gl / google_domain values.
 *
 * To add a market: add one entry here and it appears in the project
 * create/edit dropdowns automatically — no other code changes needed.
 */

export interface Market {
  code:         string;   // Semrush database code — stored in projects.semrush_database
  label:        string;   // shown in dropdowns
  flag:         string;   // emoji for compact UI labels
  serpGl:       string;   // SerpAPI gl (country of search)
  serpHl:       string;   // SerpAPI hl (interface language)
  googleDomain: string;   // SerpAPI google_domain
  // v7.397 — DataForSEO addresses a market by NAME + language code, not by
  // gl/google_domain. Kept on the SAME row so the file-header promise ("add one
  // entry here and it appears in the dropdowns automatically — no other code
  // changes needed") still holds now that there are two SERP providers.
  dfsLocationName: string;   // DataForSEO `location_name`
  dfsLanguageCode: string;   // DataForSEO `language_code`
}

export const MARKETS: Market[] = [
  { code: 'us', label: 'United States',  flag: '🇺🇸', serpGl: 'us', serpHl: 'en', googleDomain: 'google.com',    dfsLocationName: 'United States',  dfsLanguageCode: 'en' },
  { code: 'ca', label: 'Canada',         flag: '🇨🇦', serpGl: 'ca', serpHl: 'en', googleDomain: 'google.ca',     dfsLocationName: 'Canada',         dfsLanguageCode: 'en' },
  { code: 'uk', label: 'United Kingdom', flag: '🇬🇧', serpGl: 'uk', serpHl: 'en', googleDomain: 'google.co.uk',  dfsLocationName: 'United Kingdom', dfsLanguageCode: 'en' },
  { code: 'au', label: 'Australia',      flag: '🇦🇺', serpGl: 'au', serpHl: 'en', googleDomain: 'google.com.au', dfsLocationName: 'Australia',      dfsLanguageCode: 'en' },
];

/** Look up a market by Semrush database code; unknown codes fall back to US. */
export function getMarket(code: string | null | undefined): Market {
  return MARKETS.find(m => m.code === (code ?? 'us')) ?? MARKETS[0];
}
