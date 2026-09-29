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
 * v7.526 — SCOUT RUNS are credited too (Wayne, 2026-09-29). The same optional
 * ?product=orbit|scout|all the spend routes take (v7.514) selects which rows
 * come back; the default is `orbit`, which is byte-for-byte the pre-v7.526
 * answer. A Scout row carries `product: 'scout'`, its run id as `projectId`
 * (the ledger's own convention — see app/api/usage/route.ts) and is dated by
 * the moment the run FINISHED. Runs are scored on the `scout` activity group
 * against the run's own stored result (lib/hours/scoutEvidence.ts); projects on
 * `base` + `local` against theirs. `projectCount` still counts projects only;
 * `runCount` counts runs; `grandHours` is the sum of whatever rows the product
 * filter admitted. `scope.total` remains the Orbit ceiling; `scope.scout` is a
 * run's ceiling, reported beside it and never added into it.
 *
 * Database reads only: no metered API, nothing written to the usage ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadEvidence } from '@/lib/hours/evidence';
import { loadScoutEvidence } from '@/lib/hours/scoutEvidence';
import { loadActivities } from '@/lib/hours/store';
import { computeHoursSaved, auditActivities } from '@/lib/hours/compute';
import { scopeCeiling } from '@/lib/hours/activities';
import { parseProductFilter } from '@/lib/usage/rollupView';

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
  // v7.526 — which product's rows. Absent → orbit, the historical answer.
  const product = parseProductFilter(req.nextUrl.searchParams.get('product') ?? 'orbit');
  const wantOrbit = product !== 'scout';
  const wantScout = product !== 'orbit';
  try {
    const [{ activities, updatedAt, seeded }, evidence, scoutEvidence] = await Promise.all([
      loadActivities(),
      wantOrbit ? loadEvidence() : Promise.resolve([]),
      wantScout ? loadScoutEvidence() : Promise.resolve([]),
    ]);

    const allProjects = evidence.map(e => {
      const r = computeHoursSaved(activities, e.ctx);
      return {
        product: 'orbit' as const,
        projectId: e.projectId, projectName: e.projectName,
        initiatedAt: e.initiatedAt,
        hours: r.hours, ceilingHours: r.ceilingHours,
        creditedCount: r.creditedCount, totalCount: r.totalCount,
        proxyHours: r.proxyHours,
        lines: r.lines,
        scout: null,
      };
    });

    // v7.526 — one row per Scout run, keyed the way the ledger keys it (projectId
    // = run id, product 'scout'), scored on the Scout activities only.
    const allRuns = scoutEvidence.map(e => {
      const r = computeHoursSaved(activities, e.ctx, 'scout');
      return {
        product: 'scout' as const,
        projectId: e.runId, projectName: e.domain,
        initiatedAt: e.finishedAt,      // a run is dated by when it FINISHED (see header)
        hours: r.hours, ceilingHours: r.ceilingHours,
        creditedCount: r.creditedCount, totalCount: r.totalCount,
        proxyHours: r.proxyHours,
        lines: r.lines,
        scout: { userName: e.userName, status: e.status, scope: e.scope, finishedAt: e.finishedAt, projectId: e.projectId },
      };
    });

    // v7.484 — select by INITIATION month. Half-open [from, to), matching the
    // spend routes exactly, so month windows partition rather than overlap.
    // v7.526 — a run's `initiatedAt` is its finish instant; same predicate.
    const inWindow = (iso: string | null): boolean => {
      if (!iso) return false;                    // undatable: never guessed into a window
      if (from && iso <  from) return false;
      if (to   && iso >= to)   return false;
      return true;
    };
    const projects = dated ? allProjects.filter(p => inWindow(p.initiatedAt)) : allProjects;
    const runs     = dated ? allRuns.filter(p => inWindow(p.initiatedAt)) : allRuns;
    // Said out loud rather than absorbed: these projects hold real hours that no
    // dated view can show, because nothing records when their work began (I.5).
    const undatedExcluded     = dated ? allProjects.filter(p => !p.initiatedAt).length : 0;
    const undatedRunsExcluded = dated ? allRuns.filter(p => !p.initiatedAt).length : 0;

    const projectHours = projects.reduce((s, p) => s + p.hours, 0);
    const runHours     = runs.reduce((s, p) => s + p.hours, 0);
    const grandHours   = projectHours + runHours;
    const ceiling      = scopeCeiling(activities);
    // A registry hole is the same class of failure as an unpriced API source:
    // it silently subtracts hours. Surface it rather than absorb it.
    // Registry holes are a SYSTEM fault, so they are detected on the RATE CARD
    // itself, not on the rows a window or product filter happened to admit —
    // narrowing either must never make a live alarm disappear (v7.484), and a
    // mis-set Scout row must show on the Orbit view too (v7.526).
    const { unregistered, misapplied } = auditActivities(activities);

    return NextResponse.json({
      asOf: new Date().toISOString(),
      product,
      range: { from, to },
      dated,
      undatedExcluded,
      undatedRunsExcluded,
      grandHours,
      projectHours,
      runHours,
      projectCount: projects.length,
      runCount: runs.length,
      scope: ceiling,                  // { base, local, scout, total } — total = the ORBIT scope (base + local)
      activitiesUpdatedAt: updatedAt,
      usingSeed: seeded,               // true = the stored list was empty/unreadable
      unregistered,
      misapplied,
      projects: [...projects, ...runs],
    }, { headers: NO_STORE });
  } catch (e: any) {
    // Additive panel: never take the usage dashboard down with it.
    return NextResponse.json({ error: e?.message ?? 'Failed to compute hours' }, { status: 500, headers: NO_STORE });
  }
}
