/**
 * Provider rate registry for the API-usage ledger (v7.363, rebuilt v7.396)
 * ───────────────────────────────────────────────────────────────────────────
 * Turns the REAL measured quantities in `api_usage` into USD.
 *
 * v7.396 makes this registry FAIL-CLOSED (Wayne, 2026-08-03: "any new source
 * that has a cost should automatically be added to the cost panel"). A literal
 * auto-add would have to invent a rate for an unknown provider, which Art. I.1
 * forbids. So instead: EVERY provider+unit that can appear in the ledger must
 * resolve to an EXPLICIT registry entry — one of exactly two kinds:
 *
 *   1. A PRICED entry  — a real rate, with its source and an as-of date.
 *   2. An UNPRICED entry — a dated, reasoned declaration that we deliberately
 *      do not price it yet.
 *
 * Anything that matches NEITHER resolves to `unregistered`: the panel renders a
 * loud "⚠️ UNPRICED — no rate on file" row, and `auditRegistry()` reports it so
 * the Article VIII release gate FAILS. A new metered provider therefore cannot
 * silently vanish from the cost panel, and can never be silently guessed.
 * That includes a new MODEL on an already-registered token provider — ship a
 * new Claude model with no rate line and the gate catches it.
 *
 * Constitution Art. I.5a — this is a *derived* metric, handled by the book:
 *   • The inputs (token counts, search counts, unit counts) are real source
 *     rows (I.1).
 *   • The multiplier is a NAMED, SOURCED rate with an as-of date (below).
 *   • The result is LABELED a computed estimate — never presented as the actual
 *     invoice. Provider dashboards remain the billing source of truth (I.1).
 *   • The rate card lives in ONE shared constant (no per-panel forks).
 *
 * TWO RATE BASES, and the difference is stated on-panel:
 *   • 'list-per-token' — true pay-per-use (Anthropic, OpenAI tokens). Marginal
 *     cost: one more call costs one more increment.
 *   • 'plan-quota'     — a PREPAID monthly allowance (SerpAPI searches, Semrush
 *     API units) divided by its included quota to get an effective unit rate
 *     (Wayne's chosen basis, 2026-08-03). This ALLOCATES a fixed subscription
 *     across measured usage; it is NOT a marginal cost. Unused quota is not
 *     allocated to anyone, so plan-quota costs sum to LESS than the invoice.
 *     The panel says this in words — see PLAN_QUOTA_CAVEAT.
 */

/** Date the rates below were verified against their sources. */
export const PRICING_ASOF = '2026-08-03';

/** Stated on-panel wherever a plan-quota rate contributes to a total (I.5a). */
export const PLAN_QUOTA_CAVEAT =
  'SerpAPI and Semrush are prepaid monthly allowances, not pay-per-use. Their cost is the plan price divided by its included quota — an allocation of a fixed subscription across measured usage, not a marginal cost. Unused quota is not allocated, so these figures sum to LESS than the invoice.';

/**
 * v7.397 — 'measured' is the strongest basis there is: the provider reports the
 * REAL cost of each call in its own response and the ledger stores that figure.
 * No rate is applied at all, so the dollars are a source row (Const I.1) rather
 * than a derived estimate (I.5a). DataForSEO is currently the only such source.
 */
export type RateBasis = 'list-per-token' | 'plan-quota' | 'measured';

/** Providers whose ledger rows carry a real, provider-reported cost on meta.costUSD. */
export interface MeasuredCostEntry {
  provider: string;
  unit:     string;
  label:    string;
  note:     string;   // how the figure is obtained — shown on-panel
  /** Published rate, kept ONLY as a cross-check against the measured total. */
  crossCheckPerUnit: number;
  crossCheckNote:    string;
  source:   string;
  asOf:     string;
}

export const MEASURED_COST_PROVIDERS: MeasuredCostEntry[] = [
  {
    provider: 'dataforseo',
    unit:     'searches',
    label:    'DataForSEO SERP',
    note:     'Cost is read from the `cost` field DataForSEO returns on every task and stored per call — the actual dollars charged, not a rate applied to a count.',
    crossCheckPerUnit: 0.002,
    crossCheckNote:    'Live-mode list price $0.002 per SERP (10 results); $0.0006 standard queue, $0.0012 priority. This is a CROSS-CHECK only — it is never charged and never added to a total; the measured per-task cost is what the ledger bills against.',
    source:   'https://dataforseo.com/apis/serp-api/pricing',
    asOf:     '2026-08-03',
  },
  {
    // v7.426 — DataForSEO AI Optimization · LLM Mentions (Search Mentions live).
    provider: 'dataforseo',
    unit:     'llm_mentions',
    label:    'DataForSEO LLM Mentions',
    note:     'Cost is read from the `cost` field DataForSEO returns on every LLM Mentions task and stored per call — the actual dollars charged, not a rate applied to a count.',
    crossCheckPerUnit: 0.1,
    crossCheckNote:    'List price $0.10 per live request + $0.001 per returned row (dataforseo.com/pricing/ai-optimization/llm-mentions, read 2026-08-12). CROSS-CHECK only — never charged and never added to a total; the measured per-task cost is what the ledger bills against.',
    source:   'https://dataforseo.com/pricing/ai-optimization/llm-mentions',
    asOf:     '2026-08-12',
  },
];

export interface TokenRate { inputPerM: number; outputPerM: number; } // USD per 1,000,000 tokens
export interface RateEntry { match: RegExp; label: string; rate: TokenRate; source: string; }

// ── Token rates (pay-per-use) ───────────────────────────────────────────────
// MATCH ON THE MODEL VERSION, NOT THE FAMILY (v7.396). The v7.363 patterns were
// family-wide (/^claude-opus/i), so the day a new Opus shipped it would have been
// priced silently at the OLD version's rate — a wrong number presented as fact
// (Const I.1), and the exact failure this registry exists to prevent. Pinning the
// version means a new model resolves `unregistered`: the panel raises the alarm
// and the Art. VIII gate fails until someone puts a real rate on file.
// Verified 2026-08-03 against every model string ever committed to this repo:
// claude-haiku-4-5-20251001, claude-sonnet-4-6, claude-opus-4-6, gpt-4o-mini.

// Anthropic — https://platform.claude.com/docs/en/about-claude/pricing
export const ANTHROPIC_TOKEN_RATES: RateEntry[] = [
  { match: /^claude-haiku-4-5/i,  label: 'Claude Haiku 4.5',  rate: { inputPerM: 1, outputPerM: 5  }, source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { match: /^claude-sonnet-4-6/i, label: 'Claude Sonnet 4.6', rate: { inputPerM: 3, outputPerM: 15 }, source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  { match: /^claude-opus-4-6/i,   label: 'Claude Opus 4.6',   rate: { inputPerM: 5, outputPerM: 25 }, source: 'https://platform.claude.com/docs/en/about-claude/pricing' },
];

// OpenAI — https://platform.openai.com/docs/pricing
export const OPENAI_TOKEN_RATES: RateEntry[] = [
  { match: /^gpt-4o-mini/i, label: 'GPT-4o mini', rate: { inputPerM: 0.15, outputPerM: 0.60 }, source: 'https://platform.openai.com/docs/pricing' },
];

/**
 * Every model string the app can actually call today. The retained suite asserts
 * each one resolves to a rate, so a release that introduces a new model without
 * pricing it fails the gate at BUILD time — not months later when the bill lands.
 * Keep in sync when a model changes anywhere in lib/ or app/.
 */
export const MODELS_IN_USE: string[] = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'gpt-4o-mini',
];

/** Which providers bill by token, and therefore resolve through the tables above. */
export const TOKEN_PROVIDERS: string[] = ['anthropic', 'openai'];

// ── Unit rates (prepaid plan quota, allocated) ──────────────────────────────
export interface UnitRateEntry {
  provider:   string;
  unit:       string;
  label:      string;   // human label for the rate line
  usdPerUnit: number;
  basis:      RateBasis;
  plan:       string;   // the arithmetic, stated so it can be checked
  source:     string;
  asOf:       string;
}

export const UNIT_RATES: UnitRateEntry[] = [
  {
    provider:   'serpapi',
    unit:       'searches',
    label:      'SerpAPI search',
    usdPerUnit: 275 / 30000,      // = $0.00916667 — kept as arithmetic so the plan string and the number can never drift
    basis:      'plan-quota',
    plan:       'Big Data plan — $275/mo ÷ 30,000 searches/mo (Wayne confirmed the plan tier, 2026-08-03)',
    source:     'https://serpapi.com/pricing',
    asOf:       '2026-08-03',
  },
  // Semrush: 2,000,000 units/mo package confirmed by Wayne (2026-08-03), but
  // Semrush publishes NO per-unit price — API unit packages are sales-quoted.
  // Until the subscription figure is on file it stays an explicit UNPRICED
  // declaration below rather than a guessed rate (I.1). Adding it is one entry:
  //   { provider: 'semrush', unit: 'units', label: 'Semrush API unit',
  //     usdPerUnit: <monthly $> / 2_000_000, basis: 'plan-quota',
  //     plan: '2,000,000 units/mo package — $<monthly> ÷ 2,000,000',
  //     source: "Wayne's Semrush subscription", asOf: '<date>' },
  // …and deleting the matching UNPRICED_DECLARATIONS row.
];

// ── Explicit, dated "we deliberately don't price this" declarations ─────────
export interface UnpricedEntry { provider: string; unit: string; reason: string; asOf: string; }

export const UNPRICED_DECLARATIONS: UnpricedEntry[] = [
  {
    provider: 'semrush', unit: 'units',
    reason:   'Semrush does not publish a per-unit price — API unit packages are quoted by sales. The 2,000,000-unit/mo package is confirmed; the subscription dollar figure is not yet on file, so the rate is left off rather than guessed.',
    asOf:     '2026-08-03',
  },
  {
    provider: 'openai', unit: 'images',
    reason:   'gpt-image-1 is billed per token by quality tier; the ledger records image COUNT only, which cannot be priced without the per-image tier.',
    asOf:     '2026-08-03',
  },
  {
    provider: 'profound', unit: 'calls',
    reason:   'No live Profound API calls are made by the app (the client module is unreferenced as of v7.395); any historical rows predate that and carry no plan rate.',
    asOf:     '2026-08-03',
  },
];

// ── Resolution ──────────────────────────────────────────────────────────────
export type RateResolution =
  | { status: 'rate';         usdPerUnit: number | null; label: string; source: string; basis: RateBasis }
  | { status: 'unpriced';     reason: string; asOf: string }
  | { status: 'unregistered'; reason: string };

function findTokenRate(provider: string, endpoint: string): RateEntry | null {
  const table =
    provider === 'anthropic' ? ANTHROPIC_TOKEN_RATES :
    provider === 'openai'    ? OPENAI_TOKEN_RATES :
    [];
  for (const e of table) {
    if (e.match.test(endpoint)) return e;
  }
  return null;
}

function findMeasured(provider: string, unit: string): MeasuredCostEntry | null {
  for (const e of MEASURED_COST_PROVIDERS) {
    if (e.provider === provider && e.unit === unit) return e;
  }
  return null;
}

function findUnitRate(provider: string, unit: string): UnitRateEntry | null {
  for (const e of UNIT_RATES) {
    if (e.provider === provider && e.unit === unit) return e;
  }
  return null;
}

function findUnpriced(provider: string, unit: string): UnpricedEntry | null {
  for (const e of UNPRICED_DECLARATIONS) {
    if (e.provider === provider && e.unit === unit) return e;
  }
  return null;
}

/**
 * Resolve one provider+unit(+model) against the registry. Never returns a
 * fallback rate — an unknown combination comes back `unregistered` on purpose.
 */
export function resolveRate(provider: string, unit: string, endpoint: string): RateResolution {
  if (unit === 'tokens') {
    if (TOKEN_PROVIDERS.indexOf(provider) === -1) {
      return { status: 'unregistered',
        reason: `Token-billed provider "${provider}" is not in the rate registry — add a rate line or an explicit unpriced declaration in lib/usage/pricing.ts` };
    }
    const entry = findTokenRate(provider, endpoint);
    if (!entry) {
      // A NEW MODEL on a known provider. Fail closed, loudly — this is exactly
      // the "new source with a cost" case the registry exists to catch.
      return { status: 'unregistered',
        reason: `No rate on file for model "${endpoint}" (${provider}) — add it to lib/usage/pricing.ts` };
    }
    return { status: 'rate', usdPerUnit: null, label: entry.label, source: entry.source, basis: 'list-per-token' };
  }

  // v7.397 — measured beats derived: if the provider reports its own cost, use it.
  const measured = findMeasured(provider, unit);
  if (measured) {
    return { status: 'rate', usdPerUnit: null, label: measured.label, source: measured.source, basis: 'measured' };
  }

  const unitRate = findUnitRate(provider, unit);
  if (unitRate) {
    return { status: 'rate', usdPerUnit: unitRate.usdPerUnit, label: unitRate.label, source: unitRate.source, basis: unitRate.basis };
  }

  const declared = findUnpriced(provider, unit);
  if (declared) {
    return { status: 'unpriced', reason: declared.reason, asOf: declared.asOf };
  }

  return { status: 'unregistered',
    reason: `"${provider}" (${unit}) is not in the rate registry — add a rate line or an explicit unpriced declaration in lib/usage/pricing.ts` };
}

/**
 * Release-gate helper (Art. VIII): given every provider+unit+model observed in
 * the ledger, return the ones with NO registry entry at all. A non-empty result
 * is a FAIL — a metered source is reaching the ledger with nothing on file.
 */
export function auditRegistry(
  observed: Array<{ provider: string; unit: string; endpoint: string }>,
): Array<{ provider: string; unit: string; endpoint: string; reason: string }> {
  const out: Array<{ provider: string; unit: string; endpoint: string; reason: string }> = [];
  const seen: Record<string, true> = {};
  observed.forEach(o => {
    const res = resolveRate(o.provider, o.unit, o.endpoint);
    if (res.status !== 'unregistered') return;
    const key = `${o.provider}|${o.unit}|${o.endpoint}`;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ provider: o.provider, unit: o.unit, endpoint: o.endpoint, reason: res.reason });
  });
  return out;
}

/** Flat, UI-friendly view of the rate card with its sources, for on-screen provenance (I.5a). */
export const RATE_CARD = {
  asOf: PRICING_ASOF,
  models: [
    { label: 'Claude Haiku 4.5',  inputPerM: 1,    outputPerM: 5  },
    { label: 'Claude Sonnet 4.6', inputPerM: 3,    outputPerM: 15 },
    { label: 'Claude Opus 4.6',   inputPerM: 5,    outputPerM: 25 },
    { label: 'GPT-4o mini',       inputPerM: 0.15, outputPerM: 0.60 },
  ],
  units: UNIT_RATES.map(u => ({
    label: u.label, usdPerUnit: u.usdPerUnit, plan: u.plan, basis: u.basis, source: u.source, asOf: u.asOf,
  })),
  unpriced: UNPRICED_DECLARATIONS.map(u => ({
    label: `${u.provider} (${u.unit})`, reason: u.reason, asOf: u.asOf,
  })),
  measured: MEASURED_COST_PROVIDERS.map(m => ({
    label: m.label, note: m.note, crossCheckPerUnit: m.crossCheckPerUnit,
    crossCheckNote: m.crossCheckNote, source: m.source, asOf: m.asOf,
  })),
  planQuotaCaveat: PLAN_QUOTA_CAVEAT,
  sources: [
    'https://platform.claude.com/docs/en/about-claude/pricing',
    'https://platform.openai.com/docs/pricing',
    'https://serpapi.com/pricing',
    'https://dataforseo.com/apis/serp-api/pricing',
  ],
} as const;

export interface PriceInput {
  provider: string;
  endpoint: string;      // model name for token rows (provenance)
  unit: string;          // 'tokens' | 'units' | 'searches' | 'calls' | 'images'
  inputTokens: number;   // real, measured (api_usage.meta.inputTokens sum)
  outputTokens: number;  // real, measured (api_usage.meta.outputTokens sum)
  quantity: number;      // native-unit total (for non-token units)
  /** v7.397 — provider-reported dollars summed from meta.costUSD, for 'measured' rows. */
  measuredCostUSD?: number;
}

export interface PriceResult {
  priced:       boolean;
  costUSD:      number;
  rateLabel:    string | null;
  source:       string | null;
  basis:        RateBasis | null;
  unregistered: boolean;   // true => nothing on file at all (release-gate FAIL)
  reason?:      string;    // why it's unpriced (honest gap, I.5)
}

/**
 * Price one aggregated ledger line against the registry. Token rows price from
 * the published per-token list rate for their model; plan-quota rows price at
 * the effective unit rate; everything else comes back unpriced with a reason,
 * flagged `unregistered` when there is no entry of either kind.
 */
export function priceLine(inp: PriceInput): PriceResult {
  const res = resolveRate(inp.provider, inp.unit, inp.endpoint);

  if (res.status === 'unregistered') {
    return { priced: false, costUSD: 0, rateLabel: null, source: null, basis: null, unregistered: true, reason: res.reason };
  }
  if (res.status === 'unpriced') {
    return { priced: false, costUSD: 0, rateLabel: null, source: null, basis: null, unregistered: false, reason: res.reason };
  }

  if (inp.unit === 'tokens') {
    const entry = findTokenRate(inp.provider, inp.endpoint);
    if (!entry) {
      // Unreachable — resolveRate already fails closed above. Kept as a guard so
      // a future edit to resolveRate can never silently price at zero.
      return { priced: false, costUSD: 0, rateLabel: null, source: null, basis: null, unregistered: true,
        reason: `No rate on file for model "${inp.endpoint}" (${inp.provider})` };
    }
    const cost =
      (inp.inputTokens  / 1_000_000) * entry.rate.inputPerM +
      (inp.outputTokens / 1_000_000) * entry.rate.outputPerM;
    return { priced: true, costUSD: cost, rateLabel: entry.label, source: entry.source, basis: 'list-per-token', unregistered: false };
  }

  // v7.397 — a measured row is NOT multiplied by anything. The provider told us
  // what it charged; applying a rate on top would replace a fact with an estimate.
  if (res.basis === 'measured') {
    return {
      priced: true,
      costUSD: Number.isFinite(inp.measuredCostUSD) ? (inp.measuredCostUSD as number) : 0,
      rateLabel: res.label,
      source: res.source,
      basis: 'measured',
      unregistered: false,
    };
  }

  const perUnit = res.usdPerUnit ?? 0;
  return {
    priced: true,
    costUSD: inp.quantity * perUnit,
    rateLabel: res.label,
    source: res.source,
    basis: res.basis,
    unregistered: false,
  };
}
