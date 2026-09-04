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
  hours: number; ceilingHours: number;
  creditedCount: number; totalCount: number; proxyHours: number;
  lines: HoursLine[];
}
export interface HoursPayload {
  asOf: string; grandHours: number; projectCount: number;
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
