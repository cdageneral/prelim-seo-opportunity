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
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { apiUsage, projects } from '@/db/schema';
import { sql, eq } from 'drizzle-orm';
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

export async function GET() {
  try {
    await ensureUsageTable();   // self-create the ledger table on first open if prod never migrated it
    const grouped = await db
      .select({
        projectId:   apiUsage.projectId,
        projectName: projects.clientName,
        provider:    apiUsage.provider,
        unit:        apiUsage.unit,
        kind:        apiUsage.kind,
        quantity:    sql<number>`coalesce(sum(${apiUsage.quantity}), 0)`,
        calls:       sql<number>`count(*)`,
        last:        sql<string | null>`max(${apiUsage.createdAt})`,
      })
      .from(apiUsage)
      .leftJoin(projects, eq(projects.id, apiUsage.projectId))
      .groupBy(apiUsage.projectId, projects.clientName, apiUsage.provider, apiUsage.unit, apiUsage.kind);

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
      grandTotals: Array.from(grand.values()).sort((a, b) => a.provider.localeCompare(b.provider) || a.unit.localeCompare(b.unit)),
      projects: projectsOut,
    });
  } catch (err) {
    console.warn('[OrbitIQ usage] rollup failed:', (err as any)?.message ?? err);
    return NextResponse.json({
      asOf: new Date().toISOString(),
      grandTotals: [], projects: [],
      note: 'Usage ledger is empty or not yet migrated. It populates as API calls are made on this version.',
    });
  }
}
