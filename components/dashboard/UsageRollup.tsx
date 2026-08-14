'use client';

/**
 * UsageRollup (v7.225) — cross-project API credit dashboard.
 *
 * Shows REAL metered consumption (Constitution Art. I.1) across ALL projects:
 * grand totals per provider/unit, plus a per-project breakdown so spend is
 * visible at the individual-project level without opening each project. Real
 * projects rank by spend; calls with no project context roll up under
 * "Unattributed". In-place refresh CTA (Art. IV.4) + as-of timestamp (Art.
 * IV.5). Theme-aware via orbit-* tokens (Art. IV.6).
 *
 * v7.446 — a Keywords column sits beside the spend: each project's Keyword
 * Landscape "All Keywords" count, so the table answers "what did this project
 * cost, and how big is it?" in one place. The counts are fetched per project
 * (lib/keywordLandscape is the shared basis; see the route for why one project
 * per request) and land progressively with an outstanding-count in the header.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Line { provider: string; unit: string; usage: number; baseline: number; total: number; calls: number; }
interface ProjectRollup { projectId: string | null; projectName: string; lines: Line[]; lastActivity: string | null; }
interface RollupPayload { asOf: string; grandTotals: Line[]; projects: ProjectRollup[]; note?: string; }

// Cost rollup (v7.363; registry rebuilt v7.396) — USD at registry rates (Const I.5a).
interface UnpricedLine { provider: string; unit: string; quantity: number; calls: number; reason: string; unregistered: boolean; }
interface ProjectCost { projectId: string | null; projectName: string; costUSD: number; payPerUseUSD: number; planQuotaUSD: number; measuredUSD: number; unpriced: UnpricedLine[]; }
interface RateCardModel { label: string; inputPerM: number; outputPerM: number; }
interface RateCardUnit { label: string; usdPerUnit: number; plan: string; basis: string; source: string; asOf: string; }
interface RateCardUnpriced { label: string; reason: string; asOf: string; }
interface RateCardMeasured { label: string; note: string; crossCheckPerUnit: number; crossCheckNote: string; source: string; asOf: string; }
interface RateCard {
  asOf: string; models: RateCardModel[]; units: RateCardUnit[];
  unpriced: RateCardUnpriced[]; measured?: RateCardMeasured[]; planQuotaCaveat: string; sources: string[];
}
interface UnregisteredLine { provider: string; unit: string; endpoint: string; reason: string; }
interface LedgerFailures { count: number; lastError: string | null; }
interface CostPayload {
  grandTotalUSD: number; grandPayPerUseUSD: number; grandPlanQuotaUSD: number; grandMeasuredUSD?: number;
  pricingAsOf: string; basis: string; planQuotaCaveat: string; rateCard: RateCard;
  registryOk: boolean; unregistered: UnregisteredLine[]; ledgerFailures?: LedgerFailures; projects: ProjectCost[];
}

const PROVIDER_LABEL: Record<string, string> = {
  semrush: 'Semrush', serpapi: 'SerpAPI', profound: 'Profound',
  anthropic: 'Anthropic (Claude)', openai: 'OpenAI', dataforseo: 'DataForSEO',
};
const UNIT_LABEL: Record<string, string> = {
  units: 'API units', searches: 'searches', calls: 'calls', tokens: 'tokens', images: 'images',
};
const PROVIDER_ICON: Record<string, string> = {
  semrush: 'ti-chart-bar', serpapi: 'ti-brand-google', profound: 'ti-robot',
  anthropic: 'ti-sparkles', openai: 'ti-photo', dataforseo: 'ti-database',
};

function fmt(n: number): string { return (n ?? 0).toLocaleString(); }
function fmtUSD(n: number): string {
  const v = n ?? 0;
  // Show cents; for sub-cent amounts show enough precision to not read as $0.00.
  const frac = v > 0 && v < 0.01 ? 4 : 2;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac })}`;
}
/** Per-unit rates are fractions of a cent — show enough digits to be checkable. */
function fmtRate(n: number): string {
  const v = n ?? 0;
  if (v === 0) return '$0';
  const digits = v < 0.01 ? 6 : 4;
  return `$${v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function lineKey(l: Line) { return `${l.provider}|${l.unit}`; }

/**
 * v7.446 — per-project Keyword Landscape size.
 *   number → the project's "All Keywords" count
 *   null   → the project has no analysis with keyword data (honest gap, Const I.5)
 *   'error'→ the count request failed; never shown as 0
 */
type KwCount = number | null | 'error';

/**
 * v7.447 — Hours Saved. Wayne's 24-activity delivery scope, credited per project
 * ONLY where the project carries the deliverable's own data (lib/hours/gates.ts).
 * Every project's full credited/withheld line list comes back with the totals, so
 * the drill-down can say which activities were withheld and why — a bare number
 * invites "how did you get that?" and the honest answer names the gaps (I.5).
 */
interface HoursLine {
  key: string; label: string; hours: number; group: 'base' | 'local';
  gateKey: string; gateLabel: string; reads: string;
  credited: boolean; unregistered: boolean; proxy: boolean;
}
interface HoursProject {
  projectId: string; projectName: string;
  hours: number; ceilingHours: number;
  creditedCount: number; totalCount: number; proxyHours: number;
  lines: HoursLine[];
}
interface HoursPayload {
  asOf: string; grandHours: number; projectCount: number;
  scope: { base: number; local: number; total: number };
  activitiesUpdatedAt: string | null; usingSeed: boolean;
  unregistered: string[]; projects: HoursProject[];
}

/** A 200 is not a contract — only a body carrying every field the render reads is. */
function isHoursPayload(h: any): h is HoursPayload {
  return !!h && typeof h === 'object'
    && Array.isArray(h.projects)
    && Array.isArray(h.unregistered)
    && !!h.scope && typeof h.scope === 'object'
    && typeof h.scope.total === 'number'
    && typeof h.grandHours === 'number';
}

export default function UsageRollup() {
  const [data, setData]       = useState<RollupPayload | null>(null);
  const [cost, setCost]       = useState<CostPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  // v7.446: keyword counts arrive one project at a time (see the route header — a
  // cross-project query would have to load every keyword snapshot in one response
  // and would 507 on the biggest accounts). Each cell fills in as its own request
  // lands, and the header states how many are still outstanding rather than
  // blanking the column behind a spinner (Const IV.4).
  const [kwCounts, setKwCounts]   = useState<Record<string, KwCount>>({});
  const [kwPending, setKwPending] = useState(0);
  // v7.447: one request for every project — the gates are presence tests, so
  // they are measured in SQL and no snapshot ever crosses the wire.
  const [hours, setHours] = useState<HoursPayload | null>(null);
  const [hoursOpen, setHoursOpen] = useState<string | null>(null);   // projectId whose breakdown is expanded

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [res, costRes, hoursRes] = await Promise.all([
        fetch('/api/usage', { cache: 'no-store' }),
        fetch('/api/usage/cost', { cache: 'no-store' }),
        fetch('/api/usage/hours', { cache: 'no-store' }),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json);
      // Cost is additive provenance — never let its failure block the usage view.
      if (costRes.ok) { try { setCost(await costRes.json()); } catch { setCost(null); } }
      else setCost(null);
      // Hours is additive too — a failure here must never blank the spend view.
      // A 200 carrying the WRONG SHAPE is the dangerous case, not a 500: reading
      // `payload.scope.total` off it throws inside render and takes the entire
      // dashboard down with it. So the body is shape-checked before it is trusted,
      // and anything unrecognised degrades to "no hours column" (Const I.5).
      if (hoursRes.ok) {
        try {
          const h = await hoursRes.json();
          setHours(isHoursPayload(h) ? h : null);
        } catch { setHours(null); }
      } else setHours(null);
    } catch (e) {
      setError((e as any)?.message ?? 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── v7.446: fan out the per-project keyword counts ──────────────────────────
  // Bounded concurrency (4) keeps at most four keyword snapshots in flight at
  // once — the whole point of one-project-per-request is that these never stack
  // up into a single oversized response. Re-runs whenever the rollup reloads, so
  // Refresh refreshes this column too.
  useEffect(() => {
    const ids = (data?.projects ?? []).map(p => p.projectId).filter((id): id is string => !!id);
    if (ids.length === 0) { setKwCounts({}); setKwPending(0); return; }

    let cancelled = false;
    setKwCounts({});
    setKwPending(ids.length);

    const queue = [...ids];
    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (!id || cancelled) return;
        let value: KwCount = 'error';
        try {
          const res  = await fetch(`/api/projects/${id}/keyword-count`, { cache: 'no-store' });
          const json = await res.json();
          if (res.ok) value = json?.hasAnalysis ? (json.keywordCount ?? 0) : null;
        } catch { /* leaves 'error' — an unknown count is never rendered as zero */ }
        if (cancelled) return;
        setKwCounts(prev => ({ ...prev, [id]: value }));
        setKwPending(n => Math.max(0, n - 1));
      }
    };
    Promise.all([...Array(Math.min(4, ids.length))].map(worker));

    return () => { cancelled = true; };
  }, [data]);

  const grand = data?.grandTotals ?? [];
  const projects = data?.projects ?? [];
  // Stable column order for the per-project table = the grand-total lines present.
  const columns = grand.map(lineKey);
  const hasAny = grand.length > 0;
  // Per-project USD, keyed to match the usage rollup's project ids.
  const costByProject = new Map<string, number>();
  (cost?.projects ?? []).forEach(p => costByProject.set(p.projectId ?? 'unattributed', p.costUSD));
  // v7.446: the column total is the sum of the counts we actually have. While
  // requests are outstanding it is labelled a running subtotal, never presented
  // as the final cross-project figure.
  const kwLoaded = Object.values(kwCounts).filter((v): v is number => typeof v === 'number');
  const kwTotal  = kwLoaded.reduce((s, n) => s + n, 0);
  const kwDone   = kwPending === 0;
  // v7.447 per-project hours, keyed to the usage rollup's project ids.
  const hoursByProject = new Map<string, HoursProject>();
  (Array.isArray(hours?.projects) ? hours!.projects : []).forEach(p => hoursByProject.set(p.projectId, p));

  return (
    <div>
      {/* Header + refresh CTA + as-of timestamp */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-semibold text-orbit-primary flex items-center gap-2">
            <i className="ti ti-gauge text-orbit-accent" aria-hidden="true" />
            API Usage Dashboard
          </h2>
          <p className="text-orbit-secondary text-sm mt-1">
            Real metered credit consumption across every project. Provider dashboards remain the billing source of truth.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors disabled:opacity-50"
          >
            <i className={`ti ti-refresh ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <span className="text-[11px] text-orbit-tertiary">As of {fmtTime(data?.asOf ?? null)}</span>
        </div>
      </div>

      {error && (
        <div className="orbit-card p-4 mb-4 border border-orbit-red/30">
          <p className="text-orbit-red text-sm">Couldn’t load usage: {error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <div key={i} className="orbit-card h-24 animate-pulse" />)}
        </div>
      )}

      {!loading && !hasAny && !error && (
        <div className="orbit-card p-8 text-center">
          <i className="ti ti-gauge text-3xl text-orbit-tertiary" aria-hidden="true" />
          <p className="text-orbit-secondary text-sm mt-2 font-medium">No usage recorded yet</p>
          <p className="text-orbit-tertiary text-xs mt-1">
            {data?.note ?? 'Usage appears here as analyses and scans run on this version, itemized by provider and project.'}
          </p>
        </div>
      )}

      {/* Grand totals across all projects */}
      {hasAny && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {/* v7.447 — Hours Saved leads the cards: it is the only figure here that
                answers "what did this buy?" rather than "what did this consume". */}
            {hours && (
              <div className="orbit-card p-4 border border-orbit-accent/25">
                <div className="flex items-center gap-2 mb-1.5">
                  <i className="ti ti-clock-hour-4 text-orbit-accent" aria-hidden="true" />
                  <span className="text-orbit-secondary text-xs font-semibold">Hours Saved</span>
                </div>
                <div className="text-2xl font-bold text-orbit-primary tabular-nums leading-tight">{fmt(hours.grandHours)}</div>
                <div className="text-[11px] text-orbit-secondary mt-0.5">
                  hours · {hours.projectCount} {hours.projectCount === 1 ? 'project' : 'projects'}
                </div>
              </div>
            )}
            {grand.map(l => (
              <div key={lineKey(l)} className="orbit-card p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <i className={`ti ${PROVIDER_ICON[l.provider] ?? 'ti-api'} text-orbit-accent`} aria-hidden="true" />
                  <span className="text-orbit-secondary text-xs font-semibold">{PROVIDER_LABEL[l.provider] ?? l.provider}</span>
                </div>
                <div className="text-2xl font-bold text-orbit-primary tabular-nums leading-tight">{fmt(l.total)}</div>
                <div className="text-[11px] text-orbit-tertiary mt-0.5">{UNIT_LABEL[l.unit] ?? l.unit}</div>
              </div>
            ))}
          </div>

          {/* Ledger-write alarm (v7.398) — a swallowed write is spend that vanishes
              from every total with nothing on screen to say so. Say it. */}
          {cost && (cost.ledgerFailures?.count ?? 0) > 0 && (
            <div className="orbit-card p-4 mb-4 border border-orbit-red/40 bg-orbit-red/10">
              <h3 className="text-orbit-red text-sm font-semibold mb-2 flex items-center gap-2">
                <i className="ti ti-database-off" aria-hidden="true" />
                Ledger writes are failing — these totals are understated
              </h3>
              <p className="text-orbit-secondary text-xs leading-relaxed">
                <strong className="text-orbit-primary">{cost.ledgerFailures?.count}</strong> billable
                {' '}{(cost.ledgerFailures?.count ?? 0) === 1 ? 'call' : 'calls'} could not be written to
                the usage ledger on the server instance that answered this request, so their spend is
                <strong className="text-orbit-primary"> missing from every figure below</strong>. Real
                money was charged by the provider regardless.
                {cost.ledgerFailures?.lastError && (
                  <span className="block mt-1 text-orbit-tertiary">
                    Last error: <code className="text-orbit-secondary">{cost.ledgerFailures.lastError}</code>
                  </span>
                )}
                <span className="block mt-1 text-orbit-tertiary">
                  Counted per server instance, so this is a floor, not a total. Run{' '}
                  <code className="text-orbit-secondary">/api/usage/selftest</code> for the definitive check.
                </span>
              </p>
            </div>
          )}

          {/* Fail-closed registry alarm (v7.396) — a metered source with NO rate
              entry of either kind. Loud on purpose: this is also an Art. VIII FAIL. */}
          {cost && !cost.registryOk && (
            <div className="orbit-card p-4 mb-4 border border-orbit-amber/40 bg-orbit-amber/10">
              <h3 className="text-orbit-amber text-sm font-semibold mb-2 flex items-center gap-2">
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                Unpriced source — no rate on file
              </h3>
              <p className="text-orbit-secondary text-xs mb-2 leading-relaxed">
                {cost.unregistered.length === 1 ? 'A metered source is' : `${cost.unregistered.length} metered sources are`}{' '}
                recording usage with no entry in the rate registry, so {cost.unregistered.length === 1 ? 'its' : 'their'} spend is
                <strong className="text-orbit-primary"> missing from every total below</strong>. Add a rate — or an explicit
                unpriced declaration — in <code className="text-orbit-primary">lib/usage/pricing.ts</code>.
              </p>
              <ul className="text-xs text-orbit-secondary space-y-1">
                {cost.unregistered.map(u => (
                  <li key={`${u.provider}|${u.unit}|${u.endpoint}`} className="flex gap-2">
                    <span className="text-orbit-amber" aria-hidden="true">•</span>
                    <span>
                      <strong className="text-orbit-primary">{PROVIDER_LABEL[u.provider] ?? u.provider}</strong>
                      {' · '}{u.endpoint}{' · '}{UNIT_LABEL[u.unit] ?? u.unit}
                      <span className="block text-orbit-tertiary">{u.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* v7.447 — an activity with no registered gate silently SUBTRACTS hours,
              exactly like an unpriced API source silently subtracts dollars. Same
              fail-closed discipline, same loud alarm. */}
          {hours && (hours.unregistered?.length ?? 0) > 0 && (
            <div className="orbit-card p-4 mb-4 border border-orbit-red/40 bg-orbit-red/10">
              <h3 className="text-orbit-red text-sm font-semibold mb-2 flex items-center gap-2">
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                Activity with no evidence gate — its hours are never credited
              </h3>
              <p className="text-orbit-secondary text-xs leading-relaxed">
                <strong className="text-orbit-primary">{hours.unregistered.join(', ')}</strong>{' '}
                {hours.unregistered.length === 1 ? 'names a gate that is' : 'name gates that are'} not in the registry, so
                {hours.unregistered.length === 1 ? ' its' : ' their'} hours are
                <strong className="text-orbit-primary"> missing from every figure below</strong>. Pick a registered gate in
                Admin → Hours Saved, or add one in <code className="text-orbit-primary">lib/hours/gates.ts</code>.
              </p>
            </div>
          )}

          {/* Per-project breakdown */}
          <div className="orbit-card p-4">
            <h3 className="text-orbit-primary text-sm font-semibold mb-3 flex items-center gap-2">
              <i className="ti ti-table text-orbit-secondary" aria-hidden="true" />
              By project
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-orbit-tertiary text-left border-b border-orbit-border">
                    <th className="py-2 pr-4 font-medium">Project</th>
                    {/* v7.446: Keyword Landscape size, read off the panel's own basis. */}
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      Keywords
                      {/* The idle label matches its sibling sub-labels; the LIVE progress
                          steps up to text-orbit-secondary, because orbit-tertiary measures
                          2.50:1 on the dark card and progress has to be readable (Art. IV.4). */}
                      <span className={`block text-[10px] font-normal ${kwDone ? 'text-orbit-tertiary' : 'text-orbit-secondary'}`}>
                        {kwDone ? 'all keywords' : `counting · ${kwPending} left`}
                      </span>
                    </th>
                    {/* v7.447: hours credited on real evidence, expandable per project. */}
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      Hours Saved
                      <span className="block text-[10px] text-orbit-tertiary font-normal">of {fmt(hours?.scope?.total ?? 0)} in scope</span>
                    </th>
                    {grand.map(l => (
                      <th key={lineKey(l)} className="py-2 px-3 font-medium text-right whitespace-nowrap">
                        {PROVIDER_LABEL[l.provider] ?? l.provider}
                        <span className="block text-[10px] text-orbit-tertiary font-normal">{UNIT_LABEL[l.unit] ?? l.unit}</span>
                      </th>
                    ))}
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      Est. cost
                      <span className="block text-[10px] text-orbit-tertiary font-normal">USD · list price</span>
                    </th>
                    <th className="py-2 pl-3 font-medium text-right whitespace-nowrap">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(proj => {
                    const byKey = new Map(proj.lines.map(l => [lineKey(l), l]));
                    const nameCell = proj.projectId
                      ? <Link href={`/projects/${proj.projectId}`} className="text-orbit-primary hover:text-orbit-accent font-medium transition-colors">{proj.projectName}</Link>
                      : <span className="text-orbit-tertiary italic">{proj.projectName}</span>;
                    const hp = proj.projectId ? hoursByProject.get(proj.projectId) : undefined;
                    const open = !!proj.projectId && hoursOpen === proj.projectId;
                    return (
                      <Fragment key={proj.projectId ?? 'unattributed'}>
                      <tr className="border-b border-orbit-border/40">
                        <td className="py-2 pr-4">{nameCell}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-orbit-secondary">
                          {(() => {
                            if (!proj.projectId) return <span className="text-orbit-tertiary" title="Calls made outside a project have no keyword landscape">—</span>;
                            const v = kwCounts[proj.projectId];
                            if (v === undefined)   return <span className="text-orbit-tertiary" aria-label="counting">···</span>;
                            if (v === 'error')     return <span className="text-orbit-amber" title="Couldn't read this project's keyword count">?</span>;
                            if (v === null)        return <span className="text-orbit-tertiary" title="No analysis with keyword data yet">—</span>;
                            return fmt(v);
                          })()}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {!hp
                            ? <span className="text-orbit-tertiary" title={proj.projectId ? 'No analysis with data for this project yet' : 'Calls made outside a project have no delivery scope'}>—</span>
                            : (
                              <button
                                onClick={() => setHoursOpen(open ? null : proj.projectId!)}
                                className="inline-flex items-center gap-1 text-orbit-primary hover:text-orbit-accent transition-colors tabular-nums"
                                title={`${hp.creditedCount} of ${hp.totalCount} activities evidenced — click for the breakdown`}
                              >
                                {fmt(hp.hours)}
                                <i className={`ti ti-chevron-${open ? 'up' : 'down'} text-[10px]`} aria-hidden="true" />
                              </button>
                            )}
                        </td>
                        {columns.map(col => {
                          const l = byKey.get(col);
                          return (
                            <td key={col} className="py-2 px-3 text-right tabular-nums text-orbit-secondary">
                              {l ? fmt(l.total) : <span className="text-orbit-tertiary">—</span>}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 text-right tabular-nums text-orbit-primary font-medium">
                          {cost ? fmtUSD(costByProject.get(proj.projectId ?? 'unattributed') ?? 0) : <span className="text-orbit-tertiary">—</span>}
                        </td>
                        <td className="py-2 pl-3 text-right text-orbit-tertiary whitespace-nowrap">{fmtTime(proj.lastActivity)}</td>
                      </tr>
                      {/* v7.447 — the breakdown. Withheld activities are listed with the
                          dataset that would have earned them, so the number is auditable
                          rather than asserted (Const I.5). */}
                      {open && hp && (
                        <tr className="border-b border-orbit-border/40">
                          <td colSpan={columns.length + 4} className="py-3 px-3 bg-orbit-muted/20">
                            <div className="text-[11px] text-orbit-secondary mb-2">
                              <strong className="text-orbit-primary">{fmt(hp.hours)} hrs</strong> credited from{' '}
                              <strong className="text-orbit-primary">{hp.creditedCount}</strong> of {hp.totalCount} activities
                              ({fmt(hp.ceilingHours)} hrs in full scope)
                              {hp.proxyHours > 0 && (
                                <> · <span className="text-orbit-amber">{fmt(hp.proxyHours)} hrs</span> credited on a proxy signal</>
                              )}
                            </div>
                            <div className="grid md:grid-cols-2 gap-x-6 gap-y-1">
                              {hp.lines.map(l => (
                                <div key={l.key} className="flex items-baseline gap-2 text-[11px]" title={l.reads}>
                                  <i className={`ti ti-${l.credited ? 'check text-orbit-green' : 'minus text-orbit-tertiary'} text-[11px]`} aria-hidden="true" />
                                  <span className={l.credited ? 'text-orbit-primary' : 'text-orbit-tertiary'}>{l.label}</span>
                                  {l.proxy && l.credited && <span className="text-orbit-amber text-[10px]">proxy</span>}
                                  {l.unregistered && <span className="text-orbit-red text-[10px]">no gate</span>}
                                  <span className="flex-1 border-b border-dotted border-orbit-border/60" />
                                  <span className={`tabular-nums ${l.credited ? 'text-orbit-primary' : 'text-orbit-tertiary line-through'}`}>{fmt(l.hours)}</span>
                                </div>
                              ))}
                            </div>
                            <p className="text-[10px] text-orbit-tertiary mt-2">
                              A struck-through line means this project has no stored data for that activity, so its hours are not claimed.
                              Hover any line to see exactly which field is read.
                            </p>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                  {/* Grand total row */}
                  <tr className="border-t-2 border-orbit-border font-semibold">
                    <td className="py-2 pr-4 text-orbit-primary">All projects</td>
                    <td className="py-2 px-3 text-right tabular-nums text-orbit-primary">
                      {kwLoaded.length === 0
                        ? <span className="text-orbit-tertiary font-normal">—</span>
                        : <span title={kwDone ? undefined : `Subtotal of ${kwLoaded.length} project(s) counted so far`}>
                            {fmt(kwTotal)}{kwDone ? '' : '…'}
                          </span>}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-orbit-primary">
                      {hours ? fmt(hours.grandHours) : <span className="text-orbit-tertiary font-normal">—</span>}
                    </td>
                    {grand.map(l => (
                      <td key={lineKey(l)} className="py-2 px-3 text-right tabular-nums text-orbit-primary">{fmt(l.total)}</td>
                    ))}
                    <td className="py-2 px-3 text-right tabular-nums text-orbit-accent">{cost ? fmtUSD(cost.grandTotalUSD) : '—'}</td>
                    <td className="py-2 pl-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-orbit-tertiary text-[11px] mt-4 leading-relaxed">
            <strong className="text-orbit-secondary">Hours Saved</strong> is the manual effort this project would have taken
            a team to deliver by hand, at the rates set in Admin &rarr; Hours Saved
            {hours?.activitiesUpdatedAt ? ` (last edited ${fmtTime(hours.activitiesUpdatedAt)})` : ''}. The hours are a
            declared rate card, not a measurement — but <em>which</em> activities are counted is measured: each one is
            credited only where this project actually holds that deliverable&rsquo;s stored data, so a project with no
            backlink scan is never credited for a backlink profile. Click any figure for the credited-and-withheld
            breakdown. Full scope is {fmt(hours?.scope?.total ?? 0)} hrs ({fmt(hours?.scope?.base ?? 0)} core +{' '}
            {fmt(hours?.scope?.local ?? 0)} local); no project is expected to reach it.
            {hours?.usingSeed && <> <span className="text-orbit-amber">The stored activity list was empty, so the built-in defaults are in use.</span></>}
          </p>

          <p className="text-orbit-tertiary text-[11px] mt-2 leading-relaxed">
            <strong className="text-orbit-secondary">Keywords</strong> is each project's Keyword Landscape
            &ldquo;All Keywords&rdquo; figure — the client&rsquo;s full ranked footprint plus every competitor-gap
            keyword attributed to a competitor domain, with no volume floor, read off the same pool the panel
            itself counts. It is a database read, so refreshing it costs no API credit. A dash means that project
            has no analysis with keyword data yet.
          </p>

          <p className="text-orbit-tertiary text-[11px] mt-2 leading-relaxed">
            <strong className="text-orbit-secondary">How this is counted:</strong> Semrush units = rows returned × published
            per-line rate (domain/URL 10, competitor-discovery &amp; demand 40); SerpAPI = searches; Profound = calls;
            Anthropic/OpenAI = tokens (OpenAI portraits = images). Counting began when v7.225 deployed; set per-project
            baselines (inside a project’s API Usage panel) to reflect earlier spend.
          </p>

          {cost && (
            <>
              {/* The two bases mean different things — never merge them into one number silently. */}
              <p className="text-orbit-tertiary text-[11px] mt-2 leading-relaxed">
                <strong className="text-orbit-secondary">Est. cost splits two ways:</strong>{' '}
                <span className="text-orbit-primary tabular-nums">{fmtUSD(cost.grandPayPerUseUSD)}</span> pay-per-use
                (Anthropic &amp; OpenAI tokens, billed per token) +{' '}
                <span className="text-orbit-primary tabular-nums">{fmtUSD(cost.grandPlanQuotaUSD)}</span> allocated from
                prepaid plans ({(cost.rateCard?.units ?? []).map(u => u.label.replace(/ (search|API unit)$/, '')).join(' & ') || 'none configured'})
                {(cost.grandMeasuredUSD ?? 0) > 0 && (
                  <> + <span className="text-orbit-primary tabular-nums">{fmtUSD(cost.grandMeasuredUSD ?? 0)}</span>{' '}
                  <strong className="text-orbit-secondary">measured</strong> (DataForSEO reports the real cost of every
                  request, so those dollars are not an estimate at all)</>
                )} ={' '}
                <span className="text-orbit-accent tabular-nums">{fmtUSD(cost.grandTotalUSD)}</span>.
              </p>

              <p className="text-orbit-tertiary text-[11px] mt-2 leading-relaxed">
                <strong className="text-orbit-secondary">Rates</strong>
                {cost.rateCard?.asOf ? ` (as of ${cost.rateCard.asOf})` : ''} —{' '}
                <em>per token:</em>{' '}
                {(cost.rateCard?.models ?? []).map((m, i) => (
                  <span key={m.label}>
                    {i > 0 ? ' · ' : ''}{m.label} ${m.inputPerM}/${m.outputPerM} per M in/out
                  </span>
                ))}
                {(cost.rateCard?.units ?? []).length > 0 && (
                  <>
                    {'. '}<em>per unit:</em>{' '}
                    {(cost.rateCard?.units ?? []).map((u, i) => (
                      <span key={u.label}>
                        {i > 0 ? ' · ' : ''}{u.label} {fmtRate(u.usdPerUnit)} ({u.plan})
                      </span>
                    ))}
                  </>
                )}
                . It is a <em>computed estimate</em>, not the actual invoice — caching, batch, and negotiated discounts are
                not reflected. Provider dashboards remain the billing source of truth.{' '}
                {(cost.rateCard?.sources ?? []).map((s, i) => (
                  <a key={s} href={s} target="_blank" rel="noreferrer" className="text-orbit-accent hover:underline">
                    {i > 0 ? ' · ' : ''}source{i + 1}
                  </a>
                ))}
              </p>

              {cost.planQuotaCaveat && (
                <p className="text-orbit-tertiary text-[11px] mt-2 leading-relaxed">
                  <strong className="text-orbit-secondary">Why the prepaid figures are an allocation:</strong>{' '}
                  {cost.planQuotaCaveat}
                </p>
              )}

              {(cost.rateCard?.unpriced ?? []).length > 0 && (
                <p className="text-orbit-tertiary text-[11px] mt-2 leading-relaxed">
                  <strong className="text-orbit-secondary">Deliberately unpriced</strong> (honest gap, Const I.5 — a real
                  quantity is still shown for each):{' '}
                  {(cost.rateCard?.unpriced ?? []).map((u, i) => (
                    <span key={u.label}>
                      {i > 0 ? ' · ' : ''}<strong className="text-orbit-secondary">{u.label}</strong> — {u.reason} (as of {u.asOf})
                    </span>
                  ))}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
