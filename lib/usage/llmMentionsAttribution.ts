/**
 * v7.561 — attribute historical DataForSEO LLM Mentions charges to their project.
 *
 * Why: from v7.426 to v7.560 the Product Insights scan route never told the usage
 * ledger which project it was working for, so every LLM Mentions charge landed with
 * project_id NULL ("Unattributed" on the API Usage dashboard). The route is fixed
 * going forward; this module decides which PAST rows can be moved, and only those.
 *
 * What we know per ledger row: created_at and the cost DataForSEO reported.
 * What each project still stores: its LATEST scan per category — scannedAt, the
 * measured wall clock (durationMs, since v7.444) and the cost of each platform
 * request (since v7.435). A re-scan overwrites the previous entry, so older scans
 * are gone and their charges cannot be traced.
 *
 * The rule (Const I.1 — nothing assigned by guesswork):
 *   1. A row is a CANDIDATE for a stored platform request ("slot") when its cost
 *      equals that slot's cost exactly and its timestamp falls inside that scan's
 *      window: [scannedAt − durationMs − 5 s, scannedAt + 2 s]. Scans stored before
 *      durationMs existed use the route's 120 s ceiling instead of durationMs.
 *   2. Rows and slots that share candidates form a group. A group is attributed
 *      only when every slot in it belongs to ONE project AND the group has no more
 *      rows than slots (each stored request accounts for at most one charge).
 *   3. Everything else stays Unattributed and is reported as such, with the reason.
 * Pure: no database, no clock. The admin route feeds it and applies the result.
 */

export interface LedgerCharge {
  id: string;
  createdAtMs: number;
  costUSD: number;
}

export interface StoredSlot {
  projectId: string;
  projectName: string;
  category: string;
  platform: string;
  scannedAtMs: number;
  durationMs: number | null;
  costUSD: number;
}

export const WINDOW_LEAD_MS = 5_000;      // slack before the measured start
export const WINDOW_TRAIL_MS = 2_000;     // ledger write vs. scannedAt stamp
export const NO_DURATION_MS = 120_000;    // route maxDuration — used only when durationMs was not stored
const COST_EPS = 1e-9;

export type LeftReason = 'no_match' | 'several_projects' | 'more_charges_than_scans';

export interface AttributionResult {
  assignments: Array<{ ledgerId: string; projectId: string; costUSD: number }>;
  byProject: Array<{ projectId: string; projectName: string; rows: number; costUSD: number }>;
  left: Record<LeftReason, { rows: number; costUSD: number }>;
  totals: { rows: number; costUSD: number; matchedRows: number; matchedUSD: number };
}

function windowOf(s: StoredSlot): [number, number] {
  const dur = Number.isFinite(s.durationMs as number) && (s.durationMs as number) >= 0
    ? (s.durationMs as number) : NO_DURATION_MS;
  return [s.scannedAtMs - dur - WINDOW_LEAD_MS, s.scannedAtMs + WINDOW_TRAIL_MS];
}

export function attributeLlmMentions(rows: LedgerCharge[], slots: StoredSlot[]): AttributionResult {
  const windows = slots.map(windowOf);
  // candidates: row index -> slot indexes
  const rowCands: number[][] = rows.map(r => {
    const out: number[] = [];
    for (let i = 0; i < slots.length; i++) {
      if (Math.abs(slots[i].costUSD - r.costUSD) > COST_EPS) continue;
      const [a, b] = windows[i];
      if (r.createdAtMs >= a && r.createdAtMs <= b) out.push(i);
    }
    return out;
  });

  // union-find over rows (0..R-1) and slots (R..R+S-1)
  const R = rows.length;
  const parent: number[] = [];
  for (let i = 0; i < R + slots.length; i++) parent.push(i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  rowCands.forEach((cs, ri) => cs.forEach(si => {
    const a = find(ri), b = find(R + si);
    if (a !== b) parent[a] = b;
  }));

  const groups = new Map<number, { rows: number[]; slots: number[] }>();
  rowCands.forEach((cs, ri) => {
    if (!cs.length) return;
    const g = find(ri);
    if (!groups.has(g)) groups.set(g, { rows: [], slots: [] });
    groups.get(g)!.rows.push(ri);
  });
  slots.forEach((_, si) => {
    const g = find(R + si);
    const grp = groups.get(g);
    if (grp) grp.slots.push(si);
  });

  const left: AttributionResult['left'] = {
    no_match: { rows: 0, costUSD: 0 },
    several_projects: { rows: 0, costUSD: 0 },
    more_charges_than_scans: { rows: 0, costUSD: 0 },
  };
  rowCands.forEach((cs, ri) => {
    if (!cs.length) { left.no_match.rows++; left.no_match.costUSD += rows[ri].costUSD; }
  });

  const assignments: AttributionResult['assignments'] = [];
  const proj = new Map<string, { projectId: string; projectName: string; rows: number; costUSD: number }>();
  groups.forEach(g => {
    const owners = Array.from(new Set(g.slots.map(si => slots[si].projectId)));
    let reason: LeftReason | null = null;
    if (owners.length !== 1) reason = 'several_projects';
    else if (g.rows.length > g.slots.length) reason = 'more_charges_than_scans';
    if (reason) {
      g.rows.forEach(ri => { left[reason!].rows++; left[reason!].costUSD += rows[ri].costUSD; });
      return;
    }
    const pid = owners[0];
    const name = slots[g.slots[0]].projectName;
    g.rows.forEach(ri => {
      assignments.push({ ledgerId: rows[ri].id, projectId: pid, costUSD: rows[ri].costUSD });
      const p = proj.get(pid) ?? { projectId: pid, projectName: name, rows: 0, costUSD: 0 };
      p.rows++; p.costUSD += rows[ri].costUSD;
      proj.set(pid, p);
    });
  });

  const totalUSD = rows.reduce((n, r) => n + r.costUSD, 0);
  const matchedUSD = assignments.reduce((n, a) => n + a.costUSD, 0);
  return {
    assignments,
    byProject: Array.from(proj.values()).sort((a, b) => b.costUSD - a.costUSD),
    left,
    totals: { rows: rows.length, costUSD: totalUSD, matchedRows: assignments.length, matchedUSD },
  };
}
