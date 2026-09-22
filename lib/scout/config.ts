/**
 * lib/scout/config.ts — Scout constants (v7.513).
 *
 * Scout is the quick prospect snapshot that lives OUTSIDE projects (Wayne,
 * 2026-09-21). Every threshold the opportunity picker uses lives here, in one
 * place, so the rules on the PDF's method line and the rules in the code cannot
 * drift apart. None of these numbers is a data value: they are selection rules,
 * and each one is printed on the report where it is applied.
 *
 * Row limits are a deliberate, Wayne-approved exception to Const I.6 (mockup
 * sign-off 2026-09-21: Scout is a teaser that must run in minutes on a bounded
 * Semrush budget). The limit is never silent — the report states the volume
 * floor the pull reached, and every figure is exact ABOVE that floor.
 */

export const SCOUT_VERSION = 'v7.515';

/**
 * Max competitors and products per run. v7.515 (Wayne, 2026-09-21): competitors 3 → 4.
 * Four is the most the client PDF can chart with EVERY site on EVERY chart and each section
 * still on one Letter page — so no chart ever has to leave a competitor off (Const I.6).
 */
export const MAX_COMPETITORS = 4;
export const MAX_PRODUCTS    = 3;
/** Semrush pulls in flight at once (prospect + competitors) — a bound, not a behaviour change at 4. */
export const PULL_CONCURRENCY = 5;
export const MAX_TERMS_PER_PRODUCT = 2;

/** Semrush row limits (10 units per returned row). */
export const ROWS_PER_COMPETITOR_DOMAIN  = 150;  // full-domain scope, per competitor
export const ROWS_PROSPECT_DOMAIN        = 300;  // full-domain scope, prospect
export const ROWS_PER_COMPETITOR_TERM    = 50;   // product scope, per competitor per term
export const ROWS_PROSPECT_TERM          = 100;  // product scope, prospect per term
export const QUESTION_ROWS               = 10;   // phrase_questions, 40 units per row
export const SUGGEST_ROWS                = 10;   // domain_organic_organic, 40 units per row

/** Opportunity picker rules. */
export const OPEN_BELOW_SHARE     = 0.05;  // prospect on page one for < 5% of a theme's keywords → "open"
export const HELD_FROM_SHARE      = 0.25;  // ≥ 25% → "held"; between → "contested"
export const DEMAND_FLOOR_MONTHLY = 10_000; // a theme below this never leads the report
export const AUTHORITY_TOLERANCE  = 5;     // prospect AS ≥ leader AS − 5 → authority is not the constraint
export const PAGES_GAP_MULTIPLE   = 2;     // leader ranks ≥ 2× the prospect's pages → content gap
export const NEAR_WIN_MIN         = 3;     // ≥ 3 keywords at 11–20 → "already close"
export const CHECKS_TO_QUALIFY    = 2;     // of the three checks
export const MIN_THEME_KEYWORDS   = 4;     // a theme needs at least this many keywords to be charted

/** AI read (DataForSEO recorded answers). Same thresholds the Product Insights panel uses. */
export const AI_THEMES_MAX     = 4;
export const AI_ROWS_PER_PLATFORM = 50;
export const AI_NAMED_FROM     = 0.3;   // lib/productInsights AI_WEAK_BELOW
export const AI_RIVAL_STRONG   = 0.5;   // lib/productInsights AI_STRONG_FROM

export const DEFAULT_DAILY_CAP = 5;

export interface Industry { key: string; label: string; regulated: boolean }
export const INDUSTRIES: Industry[] = [
  { key: 'banking',     label: 'Banking & credit unions',        regulated: true  },
  { key: 'cards',       label: 'Credit cards & payments',        regulated: true  },
  { key: 'lending',     label: 'Lending & mortgages',            regulated: true  },
  { key: 'insurance',   label: 'Insurance',                      regulated: true  },
  { key: 'wealth',      label: 'Wealth & investing',             regulated: true  },
  { key: 'healthcare',  label: 'Healthcare & pharma',            regulated: true  },
  { key: 'b2b',         label: 'B2B software & services',        regulated: false },
  { key: 'retail',      label: 'Retail & e-commerce',            regulated: false },
  { key: 'travel',      label: 'Travel & hospitality',           regulated: false },
  { key: 'education',   label: 'Education',                      regulated: false },
  { key: 'other',       label: 'Other',                          regulated: false },
];
export function getIndustry(key: string | null | undefined): Industry {
  return INDUSTRIES.find(i => i.key === key) ?? INDUSTRIES[INDUSTRIES.length - 1];
}

/**
 * Publishers / aggregators / platforms. Semrush's organic-competitor report ranks
 * by keyword overlap, so these surface constantly — and a salesperson picking one
 * as a "competitor" would produce a meaningless gap. The list only drives a
 * warning chip on the input screen; it never removes a suggestion.
 */
export const PUBLISHER_DOMAINS = new Set([
  'wikipedia.org', 'reddit.com', 'youtube.com', 'quora.com', 'facebook.com', 'linkedin.com', 'pinterest.com',
  'amazon.com', 'yelp.com', 'forbes.com', 'nerdwallet.com', 'bankrate.com', 'investopedia.com', 'cnbc.com',
  'usnews.com', 'businessinsider.com', 'nytimes.com', 'wsj.com', 'cnn.com', 'healthline.com', 'webmd.com',
  'mayoclinic.org', 'thebalancemoney.com', 'creditkarma.com', 'lendingtree.com', 'policygenius.com',
  'valuepenguin.com', 'marketwatch.com', 'consumerreports.org', 'trustpilot.com', 'g2.com', 'capterra.com',
  'medium.com', 'indeed.com', 'glassdoor.com', 'tripadvisor.com', 'x.com', 'twitter.com', 'instagram.com', 'tiktok.com',
]);

/** Publisher/aggregator check — drives the warning chip only, never removes a domain. */
export function isPublisherDomain(d: string): boolean {
  const root = d.split('.').slice(-2).join('.');
  return PUBLISHER_DOMAINS.has(d) || PUBLISHER_DOMAINS.has(root);
}

export function normDomain(input: string): string {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}
export function isValidDomain(d: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && d.length <= 200;
}

/** Ceiling on Semrush units a run can spend, from the same limits the pulls use. */
export function unitCeiling(scope: 'domain' | 'products', competitors: number, products: number): number {
  const overview = (competitors + 1) * 10;
  const questions = QUESTION_ROWS * 40;
  if (scope === 'domain') {
    return overview + questions + (competitors * ROWS_PER_COMPETITOR_DOMAIN + ROWS_PROSPECT_DOMAIN) * 10;
  }
  const slices = Math.max(1, products) * MAX_TERMS_PER_PRODUCT;
  return overview + questions + slices * (competitors * ROWS_PER_COMPETITOR_TERM + ROWS_PROSPECT_TERM) * 10;
}
