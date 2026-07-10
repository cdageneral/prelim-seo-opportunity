/**
 * Published-rate pricing for the API-usage ledger (v7.363)
 * ───────────────────────────────────────────────────────────────────────────
 * Turns the REAL measured token counts in `api_usage.meta` (input/output tokens
 * per model) into a USD figure using PUBLISHED provider list rates.
 *
 * Constitution Art. I.5a — this is a *derived* metric, handled by the book:
 *   • The inputs (input/output token counts) are real source rows (I.1).
 *   • The multiplier is a NAMED, SOURCED published list rate (below).
 *   • The result is LABELED a computed estimate at list price — never presented
 *     as the actual invoice. Provider dashboards remain the billing source of
 *     truth (I.1); caching / batch / negotiated discounts are not reflected.
 *   • The rate table lives in ONE shared constant (no per-panel forks).
 *
 * Anything whose dollar cost depends on the account's plan (Semrush API units,
 * SerpAPI searches) or whose ledger unit is only a count (OpenAI images) is
 * returned UNPRICED with a plain reason — an honest gap (I.5), never guessed.
 *
 * Rates verified 2026-07-10 against the providers' own pricing pages.
 */

/** Date the list rates below were verified against the source pages. */
export const PRICING_ASOF = '2026-07-10';

export interface TokenRate { inputPerM: number; outputPerM: number; } // USD per 1,000,000 tokens
export interface RateEntry { match: RegExp; label: string; rate: TokenRate; source: string; }

// Anthropic — https://platform.claude.com/docs/en/about-claude/pricing
export const ANTHROPIC_TOKEN_RATES: RateEntry[] = [
  { match: /^claude-haiku/i,  label: 'Claude Haiku 4.5',  rate: { inputPerM: 1, outputPerM: 5  }, source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { match: /^claude-sonnet/i, label: 'Claude Sonnet 4.6', rate: { inputPerM: 3, outputPerM: 15 }, source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { match: /^claude-opus/i,   label: 'Claude Opus 4.6',   rate: { inputPerM: 5, outputPerM: 25 }, source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
];

// OpenAI — https://platform.openai.com/docs/pricing
export const OPENAI_TOKEN_RATES: RateEntry[] = [
  { match: /^gpt-4o-mini/i, label: 'GPT-4o mini', rate: { inputPerM: 0.15, outputPerM: 0.60 }, source: 'https://platform.openai.com/docs/pricing' },
];

/** Flat, UI-friendly view of the rate card, with its sources, for on-screen provenance (I.5a). */
export const RATE_CARD = {
  asOf: PRICING_ASOF,
  models: [
    { label: 'Claude Haiku 4.5',  inputPerM: 1,    outputPerM: 5  },
    { label: 'Claude Sonnet 4.6', inputPerM: 3,    outputPerM: 15 },
    { label: 'Claude Opus 4.6',   inputPerM: 5,    outputPerM: 25 },
    { label: 'GPT-4o mini',       inputPerM: 0.15, outputPerM: 0.60 },
  ],
  sources: [
    'https://platform.claude.com/docs/en/about-claude/pricing',
    'https://platform.openai.com/docs/pricing',
  ],
} as const;

export interface PriceInput {
  provider: string;
  endpoint: string;      // model name for token rows (provenance)
  unit: string;          // 'tokens' | 'units' | 'searches' | 'calls' | 'images'
  inputTokens: number;   // real, measured (api_usage.meta.inputTokens sum)
  outputTokens: number;  // real, measured (api_usage.meta.outputTokens sum)
  quantity: number;      // native-unit total (for non-token units)
}

export interface PriceResult {
  priced: boolean;
  costUSD: number;
  rateLabel: string | null;
  source: string | null;
  reason?: string;       // why it's unpriced (honest gap, I.5)
}

function findRate(provider: string, endpoint: string): RateEntry | null {
  const table =
    provider === 'anthropic' ? ANTHROPIC_TOKEN_RATES :
    provider === 'openai'    ? OPENAI_TOKEN_RATES :
    [];
  for (const e of table) {
    if (e.match.test(endpoint)) return e;
  }
  return null;
}

/**
 * Price one aggregated ledger line. Token rows priced from the published list
 * rate for their model; everything else returned unpriced with a reason.
 */
export function priceLine(inp: PriceInput): PriceResult {
  if (inp.unit === 'tokens') {
    const entry = findRate(inp.provider, inp.endpoint);
    if (!entry) {
      return { priced: false, costUSD: 0, rateLabel: null, source: null,
        reason: `No published list rate on file for model "${inp.endpoint}"` };
    }
    const cost =
      (inp.inputTokens  / 1_000_000) * entry.rate.inputPerM +
      (inp.outputTokens / 1_000_000) * entry.rate.outputPerM;
    return { priced: true, costUSD: cost, rateLabel: entry.label, source: entry.source };
  }

  const reason =
    inp.provider === 'semrush'  ? 'Semrush API-unit cost depends on your subscription — not a universal list price' :
    inp.provider === 'serpapi'  ? 'SerpAPI searches are bundled per plan tier — no fixed per-search list price' :
    inp.unit     === 'images'   ? 'gpt-image-1 is billed per token by quality tier; the ledger records image count only' :
    inp.provider === 'profound' ? 'Profound is billed per your plan — no public per-call list price' :
    'No published per-unit list rate on file';
  return { priced: false, costUSD: 0, rateLabel: null, source: null, reason };
}
