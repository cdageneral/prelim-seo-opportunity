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
 * v7.484 — Hours Saved is now DATE-ATTRIBUTABLE. Wayne, 2026-09-04: a project's
 * hours belong to the month its work began, so the same optional half-open
 * ?from=&to= window the spend routes take now selects projects by their
 * INITIATION date (the timestamp of their first analysis — lib/hours/evidence.ts).
 *
 * Two consequences are deliberate and are stated in the payload rather than
 * hidden:
 *   • Each project belongs to exactly ONE initiation month, so disjoint windows
 *     PARTITION the all-time total exactly — the same property the spend routes
 *     have. Nothing is double-counted and nothing is lost.
 *   • The hours themselves are each project's CURRENT credited total. A project
 *     that gains a new deliverable later increases the figure reported for its
 *     original month. That is a real property of a current-state measure and the
 *     panel says so; the alternative — re-dating hours to the latest analysis —
 *     would empty the month the work actually started (Const I.1/I.5).
 *
 * A project with no analysis has no initiation date and is EXCLUDED from any
 * dated view, counted in `undatedExcluded` rather than silently dropped.
 *
 * Database reads only: no metered API, nothing written to the usage ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadEvidence } from '@/lib/hours/evidence';
import { loadActivities } from '@/lib/hours/store';
import { computeHoursSaved } from '@/lib/hours/compute';
import { scopeCeiling } from '@/lib/hours/activities';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

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
    const [{ activities, updatedAt, seeded }, evidence] = await Promise.all([
      loadActivities(),
      loadEvidence(),
    ]);

    const all = evidence.map(e => {
      const r = computeHoursSaved(activities, e.ctx);
      return {
        projectId: e.projectId, projectName: e.projectName,
        initiatedAt: e.initiatedAt,
        hours: r.hours, ceilingHours: r.ceilingHours,
        creditedCount: r.creditedCount, totalCount: r.totalCount,
        proxyHours: r.proxyHours,
        lines: r.lines,
      };
    });

    // v7.484 — select by INITIATION month. Half-open [from, to), matching the
    // spend routes exactly, so month windows partition rather than overlap.
    const inWindow = (iso: string | null): boolean => {
      if (!iso) return false;                    // undatable: never guessed into a window
      if (from && iso <  from) return false;
      if (to   && iso >= to)   return false;
      return true;
    };
    const projects = dated ? all.filter(p => inWindow(p.initiatedAt)) : all;
    // Said out loud rather than absorbed: these projects hold real hours that no
    // dated view can show, because nothing records when their work began (I.5).
    const undatedExcluded = dated ? all.filter(p => !p.initiatedAt).length : 0;

    const grandHours = projects.reduce((s, p) => s + p.hours, 0);
    const ceiling    = scopeCeiling(activities);
    // A registry hole is the same class of failure as an unpriced API source:
    // it silently subtracts hours. Surface it rather than absorb it.
    // Registry holes are a SYSTEM fault, so they are detected across every
    // project — narrowing the window must never make a live alarm disappear.
    const unregistered = Array.from(new Set(
      all.flatMap(p => p.lines.filter(l => l.unregistered).map(l => l.key)),
    ));

    return NextResponse.json({
      asOf: new Date().toISOString(),
      range: { from, to },
      dated,
      undatedExcluded,
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
