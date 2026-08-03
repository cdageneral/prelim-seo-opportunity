/**
 * GET /api/usage/selftest — why is the ledger not recording? (v7.398)
 *
 * WHY: v7.397's provider comparison made 10 real SerpAPI + 10 real DataForSEO
 * calls. Both providers charge for them. NEITHER produced an `api_usage` row —
 * SerpAPI stayed at exactly 23,920 and no dataforseo line appeared — and no
 * warning surfaced in the Vercel logs, because `recordUsage` swallows every
 * failure by design (accounting must never break a real API call).
 *
 * That design is right, but it made the failure invisible. This route is the
 * opposite: it runs the SAME write path with NOTHING swallowed and reports the
 * real error verbatim. Read-mostly; the one row it writes carries
 * `kind = 'selftest'` so it can never contaminate the cost rollup, which filters
 * on `kind = 'usage'`.
 *
 * Const I.1 — every field below is measured or a caught error string. Nothing
 * here is inferred: if a step cannot be determined it says so.
 */

import { NextResponse } from 'next/server';
import { db, apiUsage } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureUsageTable, recordUsage, getLedgerFailures } from '@/lib/usage/record';
import { currentUsageProject } from '@/lib/usage/context';

export const dynamic = 'force-dynamic';

function errStr(e: unknown): string {
  const any = e as any;
  return [any?.name, any?.code, any?.message ?? String(e), any?.cause?.message]
    .filter(Boolean).join(' | ');
}

export async function GET() {
  const steps: Record<string, unknown> = {};

  // 1. Can we reach the database at all?
  try {
    const r: any = await db.execute(sql`select 1 as ok`);
    steps.dbReachable = true;
    steps.dbEcho = JSON.stringify(r?.rows ?? r).slice(0, 120);
  } catch (e) {
    steps.dbReachable = false;
    steps.dbError = errStr(e);
    return NextResponse.json({ ok: false, steps }, { status: 200 });
  }

  // 2. Does the table exist, and what does it hold right now?
  try {
    const r: any = await db.execute(sql`select to_regclass('public.api_usage') as reg`);
    const rows = r?.rows ?? r;
    steps.tableRegclass = rows?.[0]?.reg ?? null;
  } catch (e) { steps.tableRegclassError = errStr(e); }

  try {
    const r: any = await db.execute(sql`select count(*)::int as n from api_usage`);
    const rows = r?.rows ?? r;
    steps.rowCountBefore = Number(rows?.[0]?.n ?? -1);
  } catch (e) { steps.rowCountBeforeError = errStr(e); }

  try {
    const r: any = await db.execute(sql`select max(created_at) as latest from api_usage`);
    const rows = r?.rows ?? r;
    steps.latestRowAt = rows?.[0]?.latest ?? null;
  } catch (e) { steps.latestRowAtError = errStr(e); }

  // 3. Does the memoised DDL step throw?
  try { await ensureUsageTable(); steps.ensureUsageTable = 'ok'; }
  catch (e) { steps.ensureUsageTable = errStr(e); }

  // 4. THE REAL TEST — the exact insert recordUsage performs, NOT swallowed.
  steps.usageContextProjectId = currentUsageProject();
  try {
    await db.insert(apiUsage).values({
      projectId: null,
      provider:  'dataforseo',
      endpoint:  '__selftest__',
      unit:      'searches',
      quantity:  0,
      rows:      null,
      rate:      null,
      keyHash:   null,
      kind:      'selftest',              // never counted by the cost rollup
      meta:      { costUSD: 0, measured: true, note: 'v7.398 ledger self-test' },
    });
    steps.directInsert = 'ok';
  } catch (e) {
    steps.directInsert = errStr(e);
  }

  // 5. And the real recorder, which swallows — did its row actually land?
  const before = Number(steps.rowCountBefore ?? -1);
  await recordUsage({
    provider: 'dataforseo', endpoint: '__selftest_recordUsage__',
    unit: 'searches', quantity: 0, meta: { note: 'v7.398 self-test via recordUsage' },
  });
  steps.ledgerFailuresSeenByThisInstance = getLedgerFailures();

  try {
    const r: any = await db.execute(sql`select count(*)::int as n from api_usage`);
    const rows = r?.rows ?? r;
    const after = Number(rows?.[0]?.n ?? -1);
    steps.rowCountAfter = after;
    steps.rowsAdded = before >= 0 && after >= 0 ? after - before : null;
  } catch (e) { steps.rowCountAfterError = errStr(e); }

  // 6. What did the last hour actually record, by provider?
  try {
    const r: any = await db.execute(sql`
      select provider, kind, count(*)::int as n, max(created_at) as latest
      from api_usage
      where created_at > now() - interval '3 hours'
      group by provider, kind order by latest desc`);
    steps.lastThreeHours = r?.rows ?? r;
  } catch (e) { steps.lastThreeHoursError = errStr(e); }

  const wrote = typeof steps.rowsAdded === 'number' && (steps.rowsAdded as number) > 0;
  return NextResponse.json({
    ok: wrote && steps.directInsert === 'ok',
    verdict: wrote
      ? 'Ledger writes ARE landing from this route — the v7.397 gap is elsewhere (check whether the recording call site is reached).'
      : 'Ledger writes are NOT landing. The step that failed is named below, with the real error.',
    steps,
  });
}
