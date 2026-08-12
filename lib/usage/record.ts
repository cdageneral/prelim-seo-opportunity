/**
 * API-usage recorder (v7.225)
 * ───────────────────────────────────────────────────────────────────────────
 * One place that writes a real, per-call row into the `api_usage` ledger for
 * every billable third-party request OrbitIQ makes. Attribution comes from the
 * request-scoped context (lib/usage/context.ts).
 *
 * Constitution Art. I.1 — REAL data only. Every `quantity` written here is a
 * measured value, not a model:
 *   • Semrush  → rows ACTUALLY returned × the provider's PUBLISHED per-line unit
 *                rate (verified against developer.semrush.com, see SEMRUSH_RATES).
 *   • SerpAPI  → number of searches ACTUALLY run (1 per successful search call).
 *   • Profound → number of calls ACTUALLY made.
 *   • Anthropic→ input+output tokens ACTUALLY reported by the API response.
 *   • OpenAI   → tokens reported by the API, or images actually generated.
 * The provider dashboards remain the source of truth for billing; this ledger is
 * an itemized, reconcilable mirror (anchor it with a per-project baseline row if
 * you want it to reflect lifetime spend — see the usage route).
 *
 * Fault-tolerant by construction: a failed insert (e.g. table not yet migrated)
 * is swallowed and logged — usage accounting must NEVER break a real API call.
 */

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, apiUsage } from '@/db';
import { currentUsageProject } from './context';

/**
 * Self-healing migration (v7.321) — create the `api_usage` ledger table if the
 * production DB never had it (it was never migrated, so every insert/read failed
 * with `relation "api_usage" does not exist`, leaving the API Usage panel empty
 * and flooding the logs). Mirrors the established runtime auto-migration pattern
 * used for projects columns (ALTER TABLE ... ADD COLUMN IF NOT EXISTS in
 * app/api/projects/route.ts). Idempotent (CREATE TABLE IF NOT EXISTS), memoized
 * so the DDL runs at most once per warm lambda, and never throws — accounting
 * must never break a real API call. Forward-only: calls made before the table
 * existed were not recorded and cannot be back-filled (set a baseline to anchor
 * lifetime spend — see the usage route POST).
 */
let _tableEnsured: Promise<void> | null = null;
export function ensureUsageTable(): Promise<void> {
  if (_tableEnsured) return _tableEnsured;
  _tableEnsured = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS api_usage (
        id          SERIAL PRIMARY KEY,
        project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL,
        endpoint    TEXT NOT NULL,
        unit        TEXT NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 0,
        rows        INTEGER,
        rate        INTEGER,
        key_hash    TEXT,
        kind        TEXT NOT NULL DEFAULT 'usage',
        meta        JSONB,
        created_at  TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS api_usage_project_id_idx ON api_usage (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage (created_at)`);
  })().catch((err) => {
    // Reset the memo so a later call can retry; never surface to the caller.
    _tableEnsured = null;
    console.warn('[OrbitIQ usage] ensureUsageTable failed:', (err as any)?.message ?? err);
  });
  return _tableEnsured;
}

// ─── Semrush per-line unit rates (verified at developer.semrush.com, 2026-06-17) ──
// Domain reports:  https://developer.semrush.com/api/seo/domain-reports/
// URL reports:     https://developer.semrush.com/api/seo/url-reports/
// Keyword reports: https://developer.semrush.com/api/v3/analytics/keyword-reports/
// Overview:        https://developer.semrush.com/api/seo/overview-reports/
// Rates are LIVE-data rates (OrbitIQ never requests historical display_date).
export const SEMRUSH_RATES: Record<string, number> = {
  domain_ranks:           10,  // Domain Overview
  domain_organic:         10,  // Organic keywords / gap pulls
  domain_organic_unique:  10,  // Ranking pages
  url_organic:            10,  // URL organic keywords
  domain_organic_organic: 40,  // Competitor discovery (NOT 10 — higher-cost report)
  phrase_questions:       40,  // Demand-side question keywords
  phrase_related:         40,  // Demand-side related keywords
  // v7.367 — backlinks reports (verified at developer.semrush.com/api/seo/backlinks/, 2026-07-14):
  backlinks_overview:        45,  // 45 per REQUEST — the report returns exactly 1 line, so rows×rate = 45 ✓
  backlinks_anchors:         40,  // 40 per line
  backlinks_ascore_profile:   1,  // 1 per line
  // backlinks_categories_profile is NOT priced on the current docs page — deliberately left
  // out of this table so it records at the assumed default WITH the rate_assumed_default
  // meta note (an assumed rate is never passed off as verified).
  phrase_this:            10,  // Keyword Overview (one database) — verified same date
};
// Conservative fallback for any report type not in the table — recorded with a
// meta note so an assumed rate is never passed off as a verified one.
const SEMRUSH_DEFAULT_RATE = 10;

export type Provider = 'semrush' | 'serpapi' | 'profound' | 'anthropic' | 'openai' | 'dataforseo';
export type Unit     = 'units' | 'searches' | 'calls' | 'tokens' | 'images' | 'llm_mentions';   // v7.426: llm_mentions = DataForSEO AI Optimization requests (measured cost)

interface RecordInput {
  provider:  Provider;
  endpoint:  string;
  unit:      Unit;
  quantity:  number;
  rows?:     number;
  rate?:     number;
  keyHash?:  string | null;
  meta?:     Record<string, unknown>;
}

/** Non-reversible-ish fingerprint of a key: 8-char sha256 prefix + last 4 chars. */
export function keyFingerprint(key: string | undefined | null): string | null {
  if (!key) return null;
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 8);
  const last4 = key.slice(-4);
  return `${hash}:••••${last4}`;
}

/** Core writer. Reads projectId from context, inserts one ledger row. Never throws. */
export async function recordUsage(input: RecordInput): Promise<void> {
  try {
    await ensureUsageTable();   // self-create the ledger table on first write if prod never migrated it
    const quantity = Number.isFinite(input.quantity) ? Math.max(0, Math.round(input.quantity)) : 0;
    await db.insert(apiUsage).values({
      projectId: currentUsageProject(),
      provider:  input.provider,
      endpoint:  input.endpoint,
      unit:      input.unit,
      quantity,
      rows:      input.rows ?? null,
      rate:      input.rate ?? null,
      keyHash:   input.keyHash ?? null,
      kind:      'usage',
      meta:      input.meta ?? null,
    });
  } catch (err) {
    // Accounting must never break the real call — but v7.398: it must not be
    // SILENT either. A swallowed ledger write is spend that vanishes from every
    // total with nothing on screen to say so, which is the same failure mode
    // Const I.5b exists to prevent one level up. Count it and log at error
    // level so it is visible in the runtime logs and on the panel.
    _ledgerFailures++;
    const e = err as any;
    _lastLedgerError = [e?.name, e?.code, e?.message ?? String(err)].filter(Boolean).join(' | ');
    console.error('[OrbitIQ usage] LEDGER WRITE FAILED:', _lastLedgerError,
      '| provider=', input.provider, 'endpoint=', input.endpoint);
  }
}

/**
 * v7.398 — per-instance count of ledger writes that failed. Per-INSTANCE is a
 * real limitation (a lambda that never recovers is invisible to a later one),
 * but the alternative to an imperfect signal here is no signal at all: the
 * write that failed is precisely the one that cannot record its own failure.
 * `/api/usage/selftest` is the definitive check; this is the ambient one.
 */
let _ledgerFailures = 0;
let _lastLedgerError: string | null = null;
export function getLedgerFailures(): { count: number; lastError: string | null } {
  return { count: _ledgerFailures, lastError: _lastLedgerError };
}

/** Count CSV data rows the way parseSemrushCSV does (header excluded, error bodies → 0). */
function csvRowCount(raw: string): number {
  if (!raw) return 0;
  const lines = raw.trim().split('\n');
  if (lines.length < 2) return 0;            // error string or header-only
  if (/^ERROR\s/i.test(lines[0])) return 0;  // Semrush error responses start with "ERROR ##"
  return lines.length - 1;
}

/**
 * Record a Semrush call. `raw` is the CSV response (rows are counted from it);
 * `type` is the Semrush report type param. units = rows × published rate.
 */
export async function recordSemrush(type: string, raw: string, key?: string | null): Promise<void> {
  const rows = csvRowCount(raw);
  const known = type in SEMRUSH_RATES;
  const rate = known ? SEMRUSH_RATES[type] : SEMRUSH_DEFAULT_RATE;
  await recordUsage({
    provider: 'semrush',
    endpoint: type,
    unit:     'units',
    quantity: rows * rate,
    rows,
    rate,
    keyHash:  keyFingerprint(key),
    meta:     known ? undefined : { note: 'rate_assumed_default', assumedRate: rate },
  });
}

/** Record a SerpAPI search (billed per search). */
export async function recordSerp(endpoint: string, key?: string | null, searches = 1): Promise<void> {
  await recordUsage({
    provider: 'serpapi',
    endpoint,
    unit:     'searches',
    quantity: searches,
    keyHash:  keyFingerprint(key),
  });
}

/** Record a Profound API call. */
export async function recordProfound(endpoint: string, key?: string | null, calls = 1): Promise<void> {
  await recordUsage({
    provider: 'profound',
    endpoint,
    unit:     'calls',
    quantity: calls,
    keyHash:  keyFingerprint(key),
  });
}

/** Record an Anthropic message call from its response usage block (input+output tokens). */
export async function recordAnthropic(resp: any, endpoint: string, key?: string | null): Promise<void> {
  const usage = resp?.usage ?? {};
  const inTok  = Number(usage.input_tokens)  || 0;
  const outTok = Number(usage.output_tokens) || 0;
  await recordUsage({
    provider: 'anthropic',
    endpoint,                       // model name (e.g. claude-haiku-4-5)
    unit:     'tokens',
    quantity: inTok + outTok,
    keyHash:  keyFingerprint(key ?? process.env.ANTHROPIC_API_KEY),
    meta:     { inputTokens: inTok, outputTokens: outTok },
  });
}

/** Record an OpenAI chat/completions call from its usage block (total tokens). */
export async function recordOpenAITokens(usage: any, endpoint: string, key?: string | null): Promise<void> {
  const inTok  = Number(usage?.prompt_tokens)     || 0;
  const outTok = Number(usage?.completion_tokens) || 0;
  const total  = Number(usage?.total_tokens) || inTok + outTok;
  await recordUsage({
    provider: 'openai',
    endpoint,
    unit:     'tokens',
    quantity: total,
    keyHash:  keyFingerprint(key ?? process.env.OPENAI_API_KEY),
    meta:     { inputTokens: inTok, outputTokens: outTok },
  });
}

/**
 * Wrap an Anthropic client so every `messages.create(...)` records token usage
 * automatically (non-streaming responses only). Lets a file instrument ALL its
 * Claude calls — present and future — by changing one line in its getClient().
 * Generic-typed so this module needn't import the Anthropic SDK.
 */
export function instrumentAnthropic<T extends { messages: { create: (...args: any[]) => any } }>(
  client: T,
  label?: string,
): T {
  const messages: any = client.messages;
  if (messages.__usageInstrumented) return client;   // idempotent
  const orig = messages.create.bind(messages);
  messages.create = async (body: any, options?: any) => {
    const resp = await orig(body, options);
    try {
      if (resp && resp.usage) await recordAnthropic(resp, label ?? body?.model ?? 'anthropic');
    } catch { /* never break the real call */ }
    return resp;
  };
  messages.__usageInstrumented = true;
  return client;
}

/** Record OpenAI image generations (billed per image). */
export async function recordOpenAIImages(count: number, endpoint: string, key?: string | null): Promise<void> {
  await recordUsage({
    provider: 'openai',
    endpoint,
    unit:     'images',
    quantity: count,
    keyHash:  keyFingerprint(key ?? process.env.OPENAI_API_KEY),
  });
}

/**
 * Record a DataForSEO SERP call (v7.397).
 *
 * ⭐ UNIQUE IN THIS LEDGER: DataForSEO reports the REAL cost of each request in
 * its own response body, so `costUSD` here is a MEASURED figure — a real source
 * row under Const I.1, not a rate × count estimate like every other provider.
 * It is stored on `meta.costUSD` with `measured: true`, and the cost rollup sums
 * that column directly instead of applying a rate card.
 *
 * `quantity` stays the request count so the usage view still reads in searches
 * alongside SerpAPI; the dollars come from meta.
 */
export async function recordDataForSeo(
  endpoint: string,
  costUSD: number,
  searches = 1,
  login?: string | null,
  unit: Unit = 'searches',   // v7.426: LLM Mentions calls record under 'llm_mentions' so the cost panel names the product correctly (Const I.1 provenance naming)
): Promise<void> {
  const measured = Number.isFinite(costUSD) && costUSD >= 0 ? costUSD : 0;
  await recordUsage({
    provider: 'dataforseo',
    endpoint,
    unit,
    quantity: searches,
    keyHash:  keyFingerprint(login ?? process.env.DATAFORSEO_LOGIN),
    meta:     { costUSD: measured, measured: true },
  });
}
