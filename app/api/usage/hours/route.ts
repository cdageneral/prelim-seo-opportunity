/**
 * GET /api/usage/hours — v7.447
 *
 * Hours Saved for EVERY project in one request: the delivery scope Wayne
 * defined, credited per project only where the project actually carries the
 * deliverable's data.
 *
 * Unlike the keyword count (which needs a real keyword pool built per project,
 * and therefore one snapshot per request), every gate here is a presence test,
 * and presence can be measured inside Postgres. lib/hours/evidence.ts returns
 * ~30 integers per project and never puts a snapshot on the wire, so this stays
 * one small, fast query however large the snapshots get — the v7.445 HTTP 507
 * cannot happen here by construction.
 *
 * Returns per project: hours, the ceiling, and the full credited/withheld line
 * list so the drill-down can say WHICH activities were withheld and which
 * missing dataset withheld them (Const I.5) — never a bare number.
 *
 * Database reads only: no metered API, nothing written to the usage ledger.
 */

import { NextResponse } from 'next/server';
import { loadEvidence } from '@/lib/hours/evidence';
import { loadActivities } from '@/lib/hours/store';
import { computeHoursSaved } from '@/lib/hours/compute';
import { scopeCeiling } from '@/lib/hours/activities';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

export async function GET() {
  try {
    const [{ activities, updatedAt, seeded }, evidence] = await Promise.all([
      loadActivities(),
      loadEvidence(),
    ]);

    const projects = evidence.map(e => {
      const r = computeHoursSaved(activities, e.ctx);
      return {
        projectId: e.projectId, projectName: e.projectName,
        hours: r.hours, ceilingHours: r.ceilingHours,
        creditedCount: r.creditedCount, totalCount: r.totalCount,
        proxyHours: r.proxyHours,
        lines: r.lines,
      };
    });

    const grandHours = projects.reduce((s, p) => s + p.hours, 0);
    const ceiling    = scopeCeiling(activities);
    // A registry hole is the same class of failure as an unpriced API source:
    // it silently subtracts hours. Surface it rather than absorb it.
    const unregistered = Array.from(new Set(
      projects.flatMap(p => p.lines.filter(l => l.unregistered).map(l => l.key)),
    ));

    return NextResponse.json({
      asOf: new Date().toISOString(),
      grandHours,
      projectCount: projects.length,
      scope: ceiling,                  // { base, local, total } — the full scope
      activitiesUpdatedAt: updatedAt,
      usingSeed: seeded,               // true = the stored list was empty/unreadable
      unregistered,
      projects,
    }, { headers: NO_STORE });
  } catch (e: any) {
    // Additive panel: never take the usage dashboard down with it.
    return NextResponse.json({ error: e?.message ?? 'Failed to compute hours' }, { status: 500, headers: NO_STORE });
  }
}
