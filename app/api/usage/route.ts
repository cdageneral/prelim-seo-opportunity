/**
 * GET /api/usage — cross-project API credit rollup for the dashboard (v7.225)
 *
 * Returns every project's measured API consumption (live usage + manual
 * baseline) grouped by provider + native unit, plus grand totals per
 * provider/unit and a separate "Unattributed" bucket for calls made outside a
 * project context. Real data only (Art. I.1) — quantities are the same measured
 * values written per call by lib/usage/record.ts.
 *
 * Fault-tolerant: an un-migrated table yields an empty rollup, not a 500.
 *
 * v7.483 — accepts an optional half-open date window ?from=&to= (ISO instants,
 * [from, to) — see lib/usage/rollupView.ts for why half-open). When a window is
 * given, `kind = 'baseline'` rows are EXCLUDED: a baseline is a manual anchor for
 * spend that happened before the ledger existed, so its created_at records when
 * someone typed the number in, not when the money was spent. Counting it inside a
 * month it did not occur in would be a fabricated attribution (Const I.1). The
 * response says so via `baselinesExcluded` rather than dropping them silently.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { ensureUsageTable } from '@/lib/usage/record';

export const dynamic = 'force-dynamic';

interface Line { provider: string; unit: string; usage: number; baseline: number; total: number; calls: number; }
interface ProjectRollup {
  projectId: string | null;
  projectName: string;
  lines: Line[];
  lastActivity: string | null;
}

function foldLine(map: Map<string, Line>, provider: string, unit: string, kind: string, qty: number, calls: number) {
  const key = `${provider}|${unit}`;
  const line = map.get(key) ?? { provider, unit, usage: 0, baseline: 0, total: 0, calls: 0 };
  if (kind === 'baseline') line.baseline += qty;
  else { line.usage += qty; line.calls += calls; }
  line.total = line.usage + line.baseline;
  map.set(key, line);
}

/** A usable ISO instant, or null. An unparseable bound is ignored, never guessed. */
function bound(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export async function GET(req: NextRequest) {
  const from = bound(req.nextUrl.searchParams.get('from'));
  const to   = bound(req.nextUrl.searchParams.get('to'));
  const dated = !!from || !!to;
  try {
    await ensureUsageTable();   // self-create the ledger table on first open if prod never migrated it

    // v7.399 — RAW SQL, not a drizzle aggregate-alias select.
    // This route reported serpapi stuck at exactly 23,920 and NO dataforseo line
    // while the very same database held 7 fresh serpapi rows and 3 dataforseo
    // rows (proved by /api/usage/selftest reading the table directly). The writes
    // were never the problem — this READ was. It is the SAME failure v7.373 hit
    // and recorded: `db.select({ n: sql`count(*)` }).from(...)` over neon-http
    // returns wrong aggregates in some route bundles, and the fix there was the
    // fix here — go through db.execute. Every figure below is now the database's
    // own answer (Const I.1).
    const raw: any = await db.execute(sql`
      SELECT
        u.project_id                                   AS "projectId",
        p.client_name                                  AS "projectName",
        u.provider                                     AS "provider",
        u.unit                                         AS "unit",
        u.kind                                         AS "kind",
        COALESCE(SUM(u.quantity), 0)::bigint           AS "quantity",
        COUNT(*)::int                                  AS "calls",
        MAX(u.created_at)                              AS "last"
      FROM api_usage u
      LEFT JOIN projects p ON p.id = u.project_id
      WHERE u.kind <> 'selftest'
        ${dated ? sql`AND u.kind <> 'baseline'` : sql``}
        ${from  ? sql`AND u.created_at >= ${from}::timestamptz` : sql``}
        ${to    ? sql`AND u.created_at <  ${to}::timestamptz`   : sql``}
      GROUP BY u.project_id, p.client_name, u.provider, u.unit, u.kind
    `);
    const grouped: Array<{
      projectId: string | null; projectName: string | null; provider: string;
      unit: string; kind: string; quantity: any; calls: any; last: any;
    }> = raw?.rows ?? raw ?? [];

    const projMap = new Map<string, { rollup: ProjectRollup; lines: Map<string, Line> }>();
    const grand = new Map<string, Line>();

    for (const r of grouped) {
      const pid = r.projectId ?? '__unattributed__';
      let entry = projMap.get(pid);
      if (!entry) {
        entry = {
          rollup: {
            projectId: r.projectId ?? null,
            projectName: r.projectId ? (r.projectName ?? 'Unknown project') : 'Unattributed',
            lines: [], lastActivity: null,
          },
          lines: new Map<string, Line>(),
        };
        projMap.set(pid, entry);
      }
      const qty = Number(r.quantity) || 0;
      const calls = Number(r.calls) || 0;
      foldLine(entry.lines, r.provider, r.unit, r.kind, qty, calls);
      foldLine(grand, r.provider, r.unit, r.kind, qty, calls);
      if (r.kind !== 'baseline' && r.last) {
        const last = new Date(r.last).toISOString();
        if (!entry.rollup.lastActivity || last > entry.rollup.lastActivity) entry.rollup.lastActivity = last;
      }
    }

    const projectsOut: ProjectRollup[] = Array.from(projMap.values())
      .map(e => ({ ...e.rollup, lines: Array.from(e.lines.values()).sort((a, b) => a.provider.localeCompare(b.provider) || a.unit.localeCompare(b.unit)) }))
      // Real projects first (by spend), Unattributed last.
      .sort((a, b) => {
        if (a.projectId === null) return 1;
        if (b.projectId === null) return -1;
        const at = a.lines.reduce((s, l) => s + l.total, 0);
        const bt = b.lines.reduce((s, l) => s + l.total, 0);
        return bt - at;
      });

    return NextResponse.json({
      asOf: new Date().toISOString(),
      // v7.483 — the window this payload actually covers, echoed back so the panel
      // and the report label themselves from the SERVER's answer, not from what
      // the client believes it asked for.
      range: { from, to },
      baselinesExcluded: dated,
      grandTotals: Array.from(grand.values()).sort((a, b) => a.provider.localeCompare(b.provider) || a.unit.localeCompare(b.unit)),
      projects: projectsOut,
    });
  } catch (err) {
    console.warn('[OrbitIQ usage] rollup failed:', (err as any)?.message ?? err);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      range: { from, to },
      baselinesExcluded: dated,
      grandTotals: [], projects: [],
      note: 'Usage ledger is empty or not yet migrated. It populates as API calls are made on this version.',
    });
  }
}
