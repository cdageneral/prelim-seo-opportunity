// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/compute.ts — v7.447 · v7.526 Scout runs
//
// ONE place that turns (activity list × gate evidence) into a project's Hours
// Saved figure, so the summary card, the per-project column and the drill-down
// can never disagree (Const II.7). Callers READ this; nothing re-derives it.
//
// The result deliberately carries BOTH sides of the ledger. A number on its own
// invites the question "how did you get that?", and the honest answer has to
// include what was NOT counted and why (Const I.5) — a project reading 553 of a
// possible 831 should be able to say which 278 hours were withheld and which
// missing dataset withheld them.
//
// v7.526 — the same fold serves SCOUT RUNS. A run is scored against the `scout`
// activity group only, on its own ScoutGateContext; a project is scored against
// `base` + `local` only. Neither ever sees the other's activities, so a project
// can never be credited for a Scout report and a run can never be credited for
// a journey — the split is by construction, not by convention.
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateGate, getGate, type GateContext, type ScoutGateContext, type GateProduct } from './gates';
import { groupProduct, type HoursActivity, type HoursGroup } from './activities';

export interface HoursLine {
  key:      string;
  label:    string;
  hours:    number;
  group:    HoursGroup;
  gateKey:  string;
  gateLabel: string;
  /** what the gate reads — carried through so the drill-down never restates it */
  reads:    string;
  credited: boolean;
  /** the gate key is not in the registry: never credited, and loudly reported */
  unregistered: boolean;
  /** v7.526 — the gate reads the OTHER product's evidence: never credited, and loudly reported */
  misapplied: boolean;
  /** the gate is a documented stand-in, not the deliverable's own artifact */
  proxy:    boolean;
}

export interface HoursResult {
  /** hours actually credited to this project */
  hours:        number;
  /** hours in the full active scope — the ceiling, for "553 of 831" */
  ceilingHours: number;
  creditedCount: number;
  totalCount:    number;
  /** hours credited on a proxy gate — surfaced so the figure can be qualified */
  proxyHours:    number;
  /** activities whose gateKey is unknown — a registry hole, not a zero */
  unregistered:  string[];
  /** v7.526 — activities whose gate reads the other product's evidence — a configuration fault, not a zero */
  misapplied:    string[];
  lines:         HoursLine[];
}

export function computeHoursSaved(activities: HoursActivity[], ctx: GateContext, product?: 'orbit'): HoursResult;
export function computeHoursSaved(activities: HoursActivity[], ctx: ScoutGateContext, product: 'scout'): HoursResult;
export function computeHoursSaved(activities: HoursActivity[], ctx: GateContext | ScoutGateContext, product: GateProduct = 'orbit'): HoursResult {
  const lines: HoursLine[] = [];
  let hours = 0, ceilingHours = 0, creditedCount = 0, proxyHours = 0;
  const unregistered: string[] = [];
  const misapplied: string[] = [];

  for (const a of activities) {
    if (!a.active) continue;
    // v7.526 — only this product's activities. A Scout row never appears on a
    // project's ledger and an Orbit row never appears on a run's (see header).
    if (groupProduct(a.group) !== product) continue;
    const gate = getGate(a.gateKey);
    const v = product === 'scout'
      ? evaluateGate(a.gateKey, ctx as ScoutGateContext, 'scout')
      : evaluateGate(a.gateKey, ctx as GateContext);
    ceilingHours += a.hours;
    if (!v.known) unregistered.push(a.key);
    if (v.misapplied) misapplied.push(a.key);
    if (v.credited) { hours += a.hours; creditedCount++; if (gate?.proxy) proxyHours += a.hours; }
    lines.push({
      key: a.key, label: a.label, hours: a.hours, group: a.group,
      gateKey: a.gateKey,
      gateLabel: gate?.label ?? 'Unregistered gate',
      reads: !gate
        ? `No gate named "${a.gateKey}" is registered, so this activity is never credited. Register it in lib/hours/gates.ts or pick a different gate in Admin.`
        : v.misapplied
        ? `Gate "${gate.label}" reads ${gate.product === 'scout' ? 'a Scout run' : 'a project'}'s data, but this is ${product === 'scout' ? 'a Scout' : 'an Orbit'} activity, so it is never credited. Pick a ${product === 'scout' ? 'Scout' : 'project'} gate in Admin.`
        : gate.reads,
      credited: v.credited,
      unregistered: !v.known,
      misapplied: v.misapplied,
      proxy: !!gate?.proxy,
    });
  }

  return {
    hours, ceilingHours, creditedCount,
    totalCount: lines.length,
    proxyHours, unregistered, misapplied, lines,
  };
}

/**
 * v7.526 — the rate card's own health, independent of any project or run: which
 * ACTIVE activities name a gate that is not registered, and which name a gate
 * written for the other product. Both silently subtract hours, so both are
 * alarms on every view (the rate card is one list), and neither should depend
 * on there being a row to evaluate — a brand-new account with one mis-set
 * activity should see the alarm before its first project exists.
 */
export function auditActivities(activities: HoursActivity[]): { unregistered: string[]; misapplied: string[] } {
  const unregistered: string[] = [];
  const misapplied: string[] = [];
  for (const a of activities) {
    if (!a.active) continue;
    const g = getGate(a.gateKey);
    if (!g) unregistered.push(a.key);
    else if (g.product !== groupProduct(a.group)) misapplied.push(a.key);
  }
  return { unregistered, misapplied };
}
