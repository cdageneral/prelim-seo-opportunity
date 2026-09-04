/**
 * lib/usage/rollupView.ts — v7.482
 *
 * The ONE shared basis behind the API Usage dashboard and its PDF export.
 *
 * Before this file the panel held the payload shapes, the provider labels and
 * every formatter privately, so the PDF would have had to restate them — and a
 * restated basis drifts (Const II.6a: a rollup READS a metric, it never
 * re-derives one; II.7: one source of truth). Both surfaces now import from
 * here, so a provider added to PROVIDER_LABEL, or a rounding rule changed in
 * fmtUSD, lands on the screen and in the report in the same edit.
 *
 * Everything here is a PURE VIEW over payloads the three /api/usage routes
 * already computed. Nothing in this module talks to the database, prices a
 * line, or credits an hour — it labels, formats and folds what the routes
 * measured (Const I.1).
 *
 * v7.483 adds the SCOPE layer: the date-range presets, the project filter, and
 * the folds that apply them. They live here for the same reason everything else
 * does — the panel and the report must scope identically or the report is a lie
 * about which rows it covers.
 *
 * NOTE ON LOCATION (Const II.6c): this module — and the PDF template beside it —
 * live under lib/usage/, deliberately NOT under lib/pdf/. lib/pdf/*, lib/export/*
 * and app/api/reports/* are the enumerated CLIENT-DELIVERABLE namespaces that the
 * retained suite forbids from importing lib/hours/ or naming "Hours Saved". This
 * report is an OPERATOR artifact and carries both, so it belongs on the internal
 * side of that line. Do not move it.
 */

// ── Payload shapes, exactly as the three routes return them ────────────────────
export interface Line { provider: string; unit: string; usage: number; baseline: number; total: number; calls: number; }
export interface ProjectRollup { projectId: string | null; projectName: string; lines: Line[]; lastActivity: string | null; }
export interface RollupPayload { asOf: string; grandTotals: Line[]; projects: ProjectRollup[]; note?: string; }

// Cost rollup (v7.363; registry rebuilt v7.396) — USD at registry rates (Const I.5a).
export interface UnpricedLine { provider: string; unit: string; quantity: number; calls: number; reason: string; unregistered: boolean; }
export interface ProjectCost { projectId: string | null; projectName: string; costUSD: number; payPerUseUSD: number; planQuotaUSD: number; measuredUSD: number; unpriced: UnpricedLine[]; }
export interface RateCardModel { label: string; inputPerM: number; outputPerM: number; }
export interface RateCardUnit { label: string; usdPerUnit: number; plan: string; basis: string; source: string; asOf: string; }
export interface RateCardUnpriced { label: string; reason: string; asOf: string; }
export interface RateCardMeasured { label: string; note: string; crossCheckPerUnit: number; crossCheckNote: string; source: string; asOf: string; }
export interface RateCard {
  asOf: string; models: RateCardModel[]; units: RateCardUnit[];
  unpriced: RateCardUnpriced[]; measured?: RateCardMeasured[]; planQuotaCaveat: string; sources: string[];
}
export interface UnregisteredLine { provider: string; unit: string; endpoint: string; reason: string; }
export interface LedgerFailures { count: number; lastError: string | null; }
export interface CostPayload {
  grandTotalUSD: number; grandPayPerUseUSD: number; grandPlanQuotaUSD: number; grandMeasuredUSD?: number;
  pricingAsOf: string; basis: string; planQuotaCaveat: string; rateCard: RateCard;
  registryOk: boolean; unregistered: UnregisteredLine[]; ledgerFailures?: LedgerFailures; projects: ProjectCost[];
}

/**
 * v7.447 — Hours Saved. Wayne's 24-activity delivery scope, credited per project
 * ONLY where the project carries the deliverable's own data (lib/hours/gates.ts).
 * INTERNAL (Const II.6c) — operator surfaces only.
 */
export interface HoursLine {
  key: string; label: string; hours: number; group: 'base' | 'local';
  gateKey: string; gateLabel: string; reads: string;
  credited: boolean; unregistered: boolean; proxy: boolean;
}
export interface HoursProject {
  projectId: string; projectName: string;
  /** v7.484 — the project's FIRST analysis: the month its delivery began. */
  initiatedAt?: string | null;
  hours: number; ceilingHours: number;
  creditedCount: number; totalCount: number; proxyHours: number;
  lines: HoursLine[];
}
export interface HoursPayload {
  asOf: string; grandHours: number; projectCount: number;
  /** v7.484 — the window applied, and how many projects it could not date. */
  range?: { from: string | null; to: string | null };
  dated?: boolean;
  undatedExcluded?: number;
  scope: { base: number; local: number; total: number };
  activitiesUpdatedAt: string | null; usingSeed: boolean;
  unregistered: string[]; projects: HoursProject[];
}

/**
 * v7.446 — per-project Keyword Landscape size.
 *   number → the project's "All Keywords" count
 *   null   → the project has no analysis with keyword data (honest gap, Const I.5)
 *   'error'→ the count request failed; never shown as 0
 */
export type KwCount = number | null | 'error';

// ── Labels ────────────────────────────────────────────────────────────────────
export const PROVIDER_LABEL: Record<string, string> = {
  semrush: 'Semrush', serpapi: 'SerpAPI', profound: 'Profound',
  anthropic: 'Anthropic (Claude)', openai: 'OpenAI', dataforseo: 'DataForSEO',
};
export const UNIT_LABEL: Record<string, string> = {
  units: 'API units', searches: 'searches', calls: 'calls', tokens: 'tokens', images: 'images',
};
export const PROVIDER_ICON: Record<string, string> = {
  semrush: 'ti-chart-bar', serpapi: 'ti-brand-google', profound: 'ti-robot',
  anthropic: 'ti-sparkles', openai: 'ti-photo', dataforseo: 'ti-database',
};

export function providerLabel(p: string): string { return PROVIDER_LABEL[p] ?? p; }
export function unitLabel(u: string): string { return UNIT_LABEL[u] ?? u; }

// ── Formatters ────────────────────────────────────────────────────────────────
export function fmt(n: number): string { return (n ?? 0).toLocaleString(); }

export function fmtUSD(n: number): string {
  const v = n ?? 0;
  // Show cents; for sub-cent amounts show enough precision to not read as $0.00.
  const frac = v > 0 && v < 0.01 ? 4 : 2;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac })}`;
}

/** Per-unit rates are fractions of a cent — show enough digits to be checkable. */
export function fmtRate(n: number): string {
  const v = n ?? 0;
  if (v === 0) return '$0';
  const digits = v < 0.01 ? 6 : 4;
  return `$${v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function lineKey(l: Line) { return `${l.provider}|${l.unit}`; }

// ── Folds the screen performs, so the report performs the identical one ───────

/** A 200 is not a contract — only a body carrying every field the render reads is. */
export function isHoursPayload(h: any): h is HoursPayload {
  return !!h && typeof h === 'object'
    && Array.isArray(h.projects)
    && Array.isArray(h.unregistered)
    && !!h.scope && typeof h.scope === 'object'
    && typeof h.scope.total === 'number'
    && typeof h.grandHours === 'number';
}

/**
 * The Keywords column total. Only counts that actually arrived are summed — an
 * unknown count is never folded in as zero (Const I.5), so `loaded` states how
 * many projects the subtotal covers and the caller labels it accordingly.
 */
export function sumKeywordCounts(counts: Record<string, KwCount>): { total: number; loaded: number } {
  const nums = Object.values(counts ?? {}).filter((v): v is number => typeof v === 'number');
  return { total: nums.reduce((s, n) => s + n, 0), loaded: nums.length };
}

/** Per-project USD, keyed to match the usage rollup's project ids. */
export function costByProject(cost: CostPayload | null): Map<string, number> {
  const m = new Map<string, number>();
  (cost?.projects ?? []).forEach(p => m.set(p.projectId ?? 'unattributed', p.costUSD));
  return m;
}

/** Per-project hours, keyed to the usage rollup's project ids. */
export function hoursByProject(hours: HoursPayload | null): Map<string, HoursProject> {
  const m = new Map<string, HoursProject>();
  (Array.isArray(hours?.projects) ? hours!.projects : []).forEach(p => m.set(p.projectId, p));
  return m;
}


// ── v7.483 — SCOPE: date range + project selection ────────────────────────────
//
// Two rules govern everything below.
//
// (1) A range is a HALF-OPEN INSTANT INTERVAL [from, to). `null` on either end
//     means unbounded. Half-open is not a detail: with an inclusive end, a row
//     written at 23:59:59.500 on the last day of a month lands in BOTH that
//     month and the next, and the two periods would not sum to the whole.
//
// (2) Spend and Hours are dated on DIFFERENT bases, and the difference is
//     stated wherever both appear.
//       • SPEND is dated by when each call was made.
//       • HOURS SAVED is dated by when each PROJECT was initiated — the month
//         its first analysis ran (Wayne, 2026-09-04, revising the v7.483
//         behaviour where hours ignored the range entirely). Each project has
//         exactly one initiation month, so windows still partition the total.
//         The hours themselves remain each project's CURRENT credited total, so
//         a project that gains a deliverable later raises the figure reported
//         for its original month. Said out loud, never implied.
//       • The KEYWORD LANDSCAPE stays un-dated: it grows and shrinks
//         continuously, so pinning today's count to a setup month would be the
//         least meaningful of the three (Wayne's call). It keeps its label.

export type RangeKey = 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'ytd' | 'custom';

export interface UsageRange {
  key: RangeKey;
  /** Inclusive lower bound, ISO instant. null = unbounded. */
  from: string | null;
  /** EXCLUSIVE upper bound, ISO instant. null = up to now. */
  to: string | null;
}

export const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: 'all',          label: 'All time' },
  { key: 'this_month',   label: 'This month' },
  { key: 'last_month',   label: 'Last month' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'ytd',          label: 'Year to date' },
  { key: 'custom',       label: 'Custom range' },
];

export const ALL_TIME: UsageRange = { key: 'all', from: null, to: null };

/** Local-midnight instant for a calendar day. Boundaries are the operator's own days. */
function dayStart(y: number, m: number, d: number): string { return new Date(y, m, d, 0, 0, 0, 0).toISOString(); }

/** Parse a YYYY-MM-DD field into local midnight; returns null for an unusable value. */
function parseDayStart(v: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ''));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d, 0, 0, 0, 0);
  // Reject a date the calendar rolled over (e.g. 2026-02-31) rather than silently shifting it.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt.toISOString();
}

/** The day AFTER the given date, at local midnight — the exclusive end of an inclusive day. */
function parseDayEndExclusive(v: string | null | undefined): string | null {
  const start = parseDayStart(v);
  if (!start) return null;
  const dt = new Date(start);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString();
}

/**
 * Resolve a preset against a reference instant. `now` is a parameter, never
 * read from the clock inside, so this is deterministic and testable.
 * Open-ended presets ("this month", "this quarter", "year to date") carry a
 * null upper bound rather than a future one — the period is still running.
 */
export function resolveRange(key: RangeKey, now: Date, customFrom?: string | null, customTo?: string | null): UsageRange {
  const y = now.getFullYear(), m = now.getMonth();
  switch (key) {
    case 'this_month':
      return { key, from: dayStart(y, m, 1), to: null };
    case 'last_month':
      return { key, from: dayStart(y, m - 1, 1), to: dayStart(y, m, 1) };
    case 'this_quarter':
      return { key, from: dayStart(y, Math.floor(m / 3) * 3, 1), to: null };
    case 'ytd':
      return { key, from: dayStart(y, 0, 1), to: null };
    case 'custom': {
      const fromRaw = String(customFrom ?? '').trim();
      const toRaw   = String(customTo   ?? '').trim();
      const from = parseDayStart(fromRaw);
      const to   = parseDayEndExclusive(toRaw);
      // A bound that was SUPPLIED but could not be parsed (2026-02-31, a typo,
      // a half-typed value) invalidates the whole range. Dropping just that end
      // and applying the other would silently produce a DIFFERENT window than the
      // one asked for — an open-ended "everything up to March" in place of a
      // five-day range — and it would look entirely plausible on screen.
      // An end genuinely left EMPTY is a deliberate open bound and is honoured.
      if ((fromRaw && !from) || (toRaw && !to)) return { ...ALL_TIME, key: 'custom' };
      // An inverted pair is not silently swapped either (Const I.5).
      if (from && to && from >= to) return { ...ALL_TIME, key: 'custom' };
      return { key, from, to };
    }
    case 'all':
    default:
      return ALL_TIME;
  }
}

/** True when the range actually constrains anything. */
export function rangeIsBounded(r: UsageRange | null | undefined): boolean {
  return !!r && (!!r.from || !!r.to);
}

const DAY_FMT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

/** Human label for the active range — the exclusive end is shown as its last INCLUDED day. */
export function rangeLabel(r: UsageRange | null | undefined): string {
  if (!rangeIsBounded(r)) return 'All time';
  const preset = RANGE_OPTIONS.find(o => o.key === r!.key);
  if (preset && r!.key !== 'custom') return preset.label;
  const from = r!.from ? new Date(r!.from).toLocaleDateString(undefined, DAY_FMT) : 'the beginning';
  if (!r!.to) return `${from} to now`;
  const lastIncluded = new Date(new Date(r!.to).getTime() - 1);
  return `${from} to ${lastIncluded.toLocaleDateString(undefined, DAY_FMT)}`;
}

/** Query string for the two spend routes. Empty when unbounded. */
export function rangeQuery(r: UsageRange | null | undefined): string {
  const p = new URLSearchParams();
  if (r?.from) p.set('from', r.from);
  if (r?.to)   p.set('to', r.to);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Project selection ─────────────────────────────────────────────────────────
// `null` means EVERY project (the default). A Set means exactly those ids, where
// the unattributed bucket is addressed by the sentinel below — it has no id but
// it does carry real spend, so it must be selectable like anything else.
export const UNATTRIBUTED = '__unattributed__';

export function projectKey(projectId: string | null): string { return projectId ?? UNATTRIBUTED; }

export function selectionIsFiltered(sel: Set<string> | null, total: number): boolean {
  return !!sel && sel.size < total;
}

/**
 * Narrow a rollup to the selected projects, recomputing the grand totals as an
 * EXACT roll-up of the surviving per-project lines.
 *
 * This is a sum of stored per-project values, not a re-derivation of a metric
 * (Const II.6a): each project's line was measured by the route, and the total of
 * a subset is the sum of that subset. Deriving it any other way — a second query,
 * a proportional estimate — is what the article forbids.
 */
export function filterRollupByProjects(rollup: RollupPayload, sel: Set<string> | null): RollupPayload {
  if (!sel) return rollup;
  const projects = (rollup.projects ?? []).filter(p => sel.has(projectKey(p.projectId)));
  const grand = new Map<string, Line>();
  for (const p of projects) {
    for (const l of p.lines) {
      const k = lineKey(l);
      const g = grand.get(k) ?? { provider: l.provider, unit: l.unit, usage: 0, baseline: 0, total: 0, calls: 0 };
      g.usage += l.usage; g.baseline += l.baseline; g.total += l.total; g.calls += l.calls;
      grand.set(k, g);
    }
  }
  return {
    ...rollup,
    projects,
    grandTotals: Array.from(grand.values())
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.unit.localeCompare(b.unit)),
  };
}

/** The same narrowing for the cost payload, with every total re-summed from the survivors. */
export function filterCostByProjects(cost: CostPayload | null, sel: Set<string> | null): CostPayload | null {
  if (!cost || !sel) return cost;
  const projects = (cost.projects ?? []).filter(p => sel.has(projectKey(p.projectId)));
  const sum = (f: (p: ProjectCost) => number) => projects.reduce((s, p) => s + (f(p) || 0), 0);
  return {
    ...cost,
    projects,
    grandTotalUSD:     sum(p => p.costUSD),
    grandPayPerUseUSD: sum(p => p.payPerUseUSD),
    grandPlanQuotaUSD: sum(p => p.planQuotaUSD),
    grandMeasuredUSD:  sum(p => p.measuredUSD),
  };
}

/** The same narrowing for the hours payload. Hours are NOT date-scoped, but they ARE per project. */
export function filterHoursByProjects(hours: HoursPayload | null, sel: Set<string> | null): HoursPayload | null {
  if (!hours || !sel) return hours;
  const projects = (hours.projects ?? []).filter(p => sel.has(projectKey(p.projectId)));
  return {
    ...hours,
    projects,
    projectCount: projects.length,
    grandHours:   projects.reduce((s, p) => s + (p.hours || 0), 0),
  };
}

/**
 * One sentence naming exactly what the figures cover. Every surface that can be
 * scoped prints this — a report that silently shows a subset is worse than no
 * report, and the two non-dated columns are called out by name.
 */
export function scopeStatement(
  range: UsageRange | null | undefined,
  selected: number | null,
  total: number,
  hours?: { dated?: boolean; projectCount?: number; undatedExcluded?: number } | null,
): string {
  const parts: string[] = [];
  parts.push(rangeIsBounded(range) ? `Spend and usage cover ${rangeLabel(range).toLowerCase()}` : 'Spend and usage cover all recorded activity');
  parts.push(selected === null || selected >= total
    ? `across all ${total} ${total === 1 ? 'project' : 'projects'}`
    : `across ${selected} of ${total} projects`);
  let s = parts.join(' ') + '.';
  if (rangeIsBounded(range)) {
    // v7.484 — hours ARE dated now, but on a different basis from spend, and
    // saying which basis is the whole point of this sentence.
    const n = hours?.projectCount;
    s += ` Hours Saved is dated differently: it counts the ${typeof n === 'number' ? n + ' ' : ''}`
       + `${n === 1 ? 'project' : 'projects'} whose work BEGAN in this period, at each project's current credited total`
       + ' — so a project that gains a deliverable later raises the figure shown for the month it started.';
    if ((hours?.undatedExcluded ?? 0) > 0) {
      s += ` ${hours!.undatedExcluded} project${hours!.undatedExcluded === 1 ? ' has' : 's have'} never been analysed,`
         + ' so nothing records when their work began and they are excluded from any dated view.';
    }
    s += ' Keywords is a live figure and is NOT limited to this date range.'
       + ' Manual baselines are excluded from a dated view, because a baseline records spend from before the ledger began.';
  }
  return s;
}
