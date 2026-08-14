// ─────────────────────────────────────────────────────────────────────────────
// lib/hours/compute.ts — v7.447
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
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateGate, getGate, type GateContext } from './gates';
import type { HoursActivity } from './activities';

export interface HoursLine {
  key:      string;
  label:    string;
  hours:    number;
  group:    'base' | 'local';
  gateKey:  string;
  gateLabel: string;
  /** what the gate reads — carried through so the drill-down never restates it */
  reads:    string;
  credited: boolean;
  /** the gate key is not in the registry: never credited, and loudly reported */
  unregistered: boolean;
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
  lines:         HoursLine[];
}

export function computeHoursSaved(activities: HoursActivity[], ctx: GateContext): HoursResult {
  const lines: HoursLine[] = [];
  let hours = 0, ceilingHours = 0, creditedCount = 0, proxyHours = 0;
  const unregistered: string[] = [];

  for (const a of activities) {
    if (!a.active) continue;
    const gate = getGate(a.gateKey);
    const { credited, known } = evaluateGate(a.gateKey, ctx);
    ceilingHours += a.hours;
    if (!known) unregistered.push(a.key);
    if (credited) { hours += a.hours; creditedCount++; if (gate?.proxy) proxyHours += a.hours; }
    lines.push({
      key: a.key, label: a.label, hours: a.hours, group: a.group,
      gateKey: a.gateKey,
      gateLabel: gate?.label ?? 'Unregistered gate',
      reads: gate?.reads ?? `No gate named "${a.gateKey}" is registered, so this activity is never credited. Register it in lib/hours/gates.ts or pick a different gate in Admin.`,
      credited,
      unregistered: !known,
      proxy: !!gate?.proxy,
    });
  }

  return {
    hours, ceilingHours, creditedCount,
    totalCount: lines.length,
    proxyHours, unregistered, lines,
  };
}
