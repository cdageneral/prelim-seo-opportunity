/**
 * /api/admin/usage/attribute-llm-mentions — v7.561
 *
 * Moves historical DataForSEO LLM Mentions charges out of "Unattributed" and onto
 * the project whose stored Product Insights scan they paid for — ONLY where the
 * match is exact (lib/usage/llmMentionsAttribution.ts states the rule).
 *
 *   GET                 — dry run: what would move, per project, and what stays and why. Writes nothing.
 *   POST {apply:true}   — performs exactly the dry run's assignments. Each moved row is
 *                         stamped meta.attributedBy = 'v7.561' (+ attributedAt) so it is
 *                         visible and reversible.
 *   POST {undo:true}    — puts every v7.561-stamped row back to Unattributed.
 *
 * Admin-only (middleware gates /api/admin to owner/admin). Raw SQL per v7.399.
 * II.9: the project query reads only small scalars out of each stored scan
 * (jsonb_array_elements → scannedAt, durationMs, per-platform cost), never the rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureUsageTable } from '@/lib/usage/record';
import { attributeLlmMentions, type LedgerCharge, type StoredSlot } from '@/lib/usage/llmMentionsAttribution';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STAMP = 'v7.561';
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

function rowsOf(raw: any): any[] { return raw?.rows ?? raw ?? []; }

async function loadInputs(): Promise<{ charges: LedgerCharge[]; slots: StoredSlot[] }> {
  const ledger = rowsOf(await db.execute(sql`
    SELECT u.id::text                                   AS "id",
           (EXTRACT(EPOCH FROM u.created_at) * 1000)::float8 AS "ms",
           COALESCE((u.meta ->> 'costUSD')::numeric, 0)::float8 AS "cost"
    FROM api_usage u
    WHERE u.provider = 'dataforseo'
      AND u.unit = 'llm_mentions'
      AND u.kind = 'usage'
      AND u.project_id IS NULL
      AND COALESCE(u.product, 'orbit') = 'orbit'
  `));
  const scans = rowsOf(await db.execute(sql`
    SELECT p.id::text                       AS "projectId",
           p.client_name                    AS "projectName",
           c ->> 'category'                 AS "category",
           c ->> 'scannedAt'                AS "scannedAt",
           c ->> 'durationMs'               AS "durationMs",
           c ->  'platforms'                AS "platforms",
           c ->> 'costUSD'                  AS "costUSD"
    FROM projects p,
         jsonb_array_elements(COALESCE(p.product_insights -> 'categories', '[]'::jsonb)) c
    WHERE p.product_insights IS NOT NULL
  `));

  const charges: LedgerCharge[] = ledger.map(r => ({ id: String(r.id), createdAtMs: Number(r.ms), costUSD: Number(r.cost) || 0 }));
  const slots: StoredSlot[] = [];
  for (const s of scans) {
    const at = Date.parse(String(s.scannedAt ?? ''));
    if (!Number.isFinite(at)) continue;
    const dur = s.durationMs == null ? null : Number(s.durationMs);
    const base = { projectId: String(s.projectId), projectName: String(s.projectName ?? ''), category: String(s.category ?? ''), scannedAtMs: at, durationMs: Number.isFinite(dur as number) ? dur : null };
    const pfs = Array.isArray(s.platforms) ? s.platforms : null;
    if (pfs && pfs.length) {
      // v7.435+: one request per platform. A failed platform (totalCount null) made no charge.
      for (const pf of pfs) {
        if (pf?.totalCount === null && !(Number(pf?.costUSD) > 0)) continue;
        slots.push({ ...base, platform: String(pf?.platform ?? ''), costUSD: Number(pf?.costUSD) || 0 });
      }
    } else {
      // v7.426–v7.434: one request per scan; its cost is the entry cost.
      slots.push({ ...base, platform: 'single', costUSD: Number(s.costUSD) || 0 });
    }
  }
  return { charges, slots };
}

function summary(res: ReturnType<typeof attributeLlmMentions>, slotCount: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    rule: 'A charge moves only when its cost equals a stored scan request exactly, its time falls inside that scan\'s measured window, every stored request it could belong to is from ONE project, and that project has at least as many stored requests as charges in the group. Older scans overwritten by a re-scan are not stored, so their charges stay Unattributed.',
    storedRequests: slotCount,
    unattributedCharges: res.totals.rows,
    unattributedUSD: r2(res.totals.costUSD),
    wouldMoveCharges: res.totals.matchedRows,
    wouldMoveUSD: r2(res.totals.matchedUSD),
    byProject: res.byProject.map(p => ({ ...p, costUSD: r2(p.costUSD) })),
    staysUnattributed: Object.fromEntries(Object.entries(res.left).map(([k, v]) => [k, { rows: v.rows, costUSD: r2(v.costUSD) }])),
  };
}

export async function GET() {
  await ensureUsageTable();
  const { charges, slots } = await loadInputs();
  const res = attributeLlmMentions(charges, slots);
  const already = rowsOf(await db.execute(sql`
    SELECT COUNT(*)::int AS "n", COALESCE(SUM((meta ->> 'costUSD')::numeric), 0)::float8 AS "usd"
    FROM api_usage WHERE meta ->> 'attributedBy' = ${STAMP}
  `))[0] ?? { n: 0, usd: 0 };
  return NextResponse.json({ dryRun: true, alreadyMoved: { rows: Number(already.n) || 0, costUSD: Math.round((Number(already.usd) || 0) * 100) / 100 }, ...summary(res, slots.length) }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  await ensureUsageTable();
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body?.undo === true) {
    const out = rowsOf(await db.execute(sql`
      UPDATE api_usage
      SET project_id = NULL, meta = (meta - 'attributedBy' - 'attributedAt')
      WHERE meta ->> 'attributedBy' = ${STAMP}
      RETURNING id
    `));
    return NextResponse.json({ undone: out.length }, { headers: NO_STORE });
  }
  if (body?.apply !== true) {
    return NextResponse.json({ error: 'Send {"apply":true} to move the dry run\'s charges, or {"undo":true} to reverse them.' }, { status: 400 });
  }

  const { charges, slots } = await loadInputs();
  const res = attributeLlmMentions(charges, slots);
  const at = new Date().toISOString();
  const byPid = new Map<string, number[]>();
  res.assignments.forEach(a => {
    const list = byPid.get(a.projectId) ?? [];
    list.push(Number(a.ledgerId));
    byPid.set(a.projectId, list);
  });
  let moved = 0;
  for (const [pid, ids] of Array.from(byPid.entries())) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const out = rowsOf(await db.execute(sql`
        UPDATE api_usage
        SET project_id = ${pid}::uuid,
            meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('attributedBy', ${STAMP}::text, 'attributedAt', ${at}::text)
        WHERE id = ANY(${'{' + chunk.join(',') + '}'}::int[])
          AND project_id IS NULL
        RETURNING id
      `));
      moved += out.length;
    }
  }
  return NextResponse.json({ applied: true, moved, ...summary(res, slots.length) }, { headers: NO_STORE });
}
