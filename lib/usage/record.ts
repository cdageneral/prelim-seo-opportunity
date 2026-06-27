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

// ─── Self-healing table creation (v7.305) ──────────────────────────────────────
//
// The `api_usage` ledger table is defined in db/schema.ts, but a new TABLE is
// only created by `drizzle-kit push` — which was never run against the
// production Neon DB (the build is just `next build`, and the one-time db:push
// note in the schema was never executed). The result: every insert below threw
// `relation "api_usage" does not exist`, the error was swallowed (accounting
// must never break a real call), and the ledger stayed permanently empty so the
// API Usage panel showed "No usage recorded yet" despite real Semrush/SerpAPI
// calls firing the recorder.
//
// Fix: ensure the table exists at runtime, mirroring the project's established
// "ADD COLUMN IF NOT EXISTS" auto-migration pattern (used for new project
// columns) — but for a whole table via CREATE TABLE IF NOT EXISTS. It is
// memoized so the DDL runs at most once per warm process; a transient failure
// resets the memo so the next call retries. Columns mirror db/schema.ts exactly.
// Idempotent and safe to call from the recorder AND the read routes, so the
// ledger self-creates on the first billable call OR the first panel open.
let _ensureUsageTablePromise: Promise<void> | null = null;

export function ensureUsageTable(): Promise<void> {
  if (_ensureUsageTablePromise) return _ensureUsageTablePromise;
  _ensureUsageTablePromise = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "api_usage" (
        "id"         serial PRIMARY KEY NOT NULL,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
        "provider"   text NOT NULL,
        "endpoint"   text NOT NULL,
        "unit"       text NOT NULL,
        "quantity"   integer DEFAULT 0 NOT NULL,
        "rows"       integer,
        "rate"       integer,
        "key_hash"   text,
        "kind"       text DEFAULT 'usage' NOT NULL,
        "meta"       jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    // Helpful indexes for the per-project and cross-project rollups. IF NOT
    // EXISTS keeps this idempotent; failure here is non-fatal (caught below).
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "api_usage_project_id_idx" ON "api_usage" ("project_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "api_usage_created_at_idx" ON "api_usage" ("created_at")`);
  })().catch((err) => {
    // Reset so a transient failure (e.g. brief DB hiccup) can retry next time,
    // rather than caching a rejected promise for the life of the process.
    _ensureUsageTablePromise = null;
    throw err;
  });
  return _ensureUsageTablePromise;
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
};
// Conservative fallback for any report type not in the table — recorded with a
// meta note so an assumed rate is never passed off as a verified one.
const SEMRUSH_DEFAULT_RATE = 10;

export type Provider = 'semrush' | 'serpapi' | 'profound' | 'anthropic' | 'openai';
export type Unit     = 'units' | 'searches' | 'calls' | 'tokens' | 'images';

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
    // v7.305: make sure the ledger table exists before the first write so a
    // never-migrated prod DB self-heals instead of silently dropping every row.
    await ensureUsageTable();
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
    // Accounting must never break the real call. Surface for debugging only.
    console.warn('[OrbitIQ usage] record failed:', (err as any)?.message ?? err);
  }
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
