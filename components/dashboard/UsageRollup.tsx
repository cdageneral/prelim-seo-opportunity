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
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface Line { provider: string; unit: string; usage: number; baseline: number; total: number; calls: number; }
interface ProjectRollup { projectId: string | null; projectName: string; lines: Line[]; lastActivity: string | null; }
interface RollupPayload { asOf: string; grandTotals: Line[]; projects: ProjectRollup[]; note?: string; }

const PROVIDER_LABEL: Record<string, string> = {
  semrush: 'Semrush', serpapi: 'SerpAPI', profound: 'Profound',
  anthropic: 'Anthropic (Claude)', openai: 'OpenAI',
};
const UNIT_LABEL: Record<string, string> = {
  units: 'API units', searches: 'searches', calls: 'calls', tokens: 'tokens', images: 'images',
};
const PROVIDER_ICON: Record<string, string> = {
  semrush: 'ti-chart-bar', serpapi: 'ti-brand-google', profound: 'ti-robot',
  anthropic: 'ti-sparkles', openai: 'ti-photo',
};

function fmt(n: number): string { return (n ?? 0).toLocaleString(); }
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function lineKey(l: Line) { return `${l.provider}|${l.unit}`; }

export default function UsageRollup() {
  const [data, setData]       = useState<RollupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/usage', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError((e as any)?.message ?? 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grand = data?.grandTotals ?? [];
  const projects = data?.projects ?? [];
  // Stable column order for the per-project table = the grand-total lines present.
  const columns = grand.map(lineKey);
  const hasAny = grand.length > 0;

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
                    {grand.map(l => (
                      <th key={lineKey(l)} className="py-2 px-3 font-medium text-right whitespace-nowrap">
                        {PROVIDER_LABEL[l.provider] ?? l.provider}
                        <span className="block text-[10px] text-orbit-tertiary font-normal">{UNIT_LABEL[l.unit] ?? l.unit}</span>
                      </th>
                    ))}
                    <th className="py-2 pl-3 font-medium text-right whitespace-nowrap">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(proj => {
                    const byKey = new Map(proj.lines.map(l => [lineKey(l), l]));
                    const nameCell = proj.projectId
                      ? <Link href={`/projects/${proj.projectId}`} className="text-orbit-primary hover:text-orbit-accent font-medium transition-colors">{proj.projectName}</Link>
                      : <span className="text-orbit-tertiary italic">{proj.projectName}</span>;
                    return (
                      <tr key={proj.projectId ?? 'unattributed'} className="border-b border-orbit-border/40">
                        <td className="py-2 pr-4">{nameCell}</td>
                        {columns.map(col => {
                          const l = byKey.get(col);
                          return (
                            <td key={col} className="py-2 px-3 text-right tabular-nums text-orbit-secondary">
                              {l ? fmt(l.total) : <span className="text-orbit-tertiary">—</span>}
                            </td>
                          );
                        })}
                        <td className="py-2 pl-3 text-right text-orbit-tertiary whitespace-nowrap">{fmtTime(proj.lastActivity)}</td>
                      </tr>
                    );
                  })}
                  {/* Grand total row */}
                  <tr className="border-t-2 border-orbit-border font-semibold">
                    <td className="py-2 pr-4 text-orbit-primary">All projects</td>
                    {grand.map(l => (
                      <td key={lineKey(l)} className="py-2 px-3 text-right tabular-nums text-orbit-primary">{fmt(l.total)}</td>
                    ))}
                    <td className="py-2 pl-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-orbit-tertiary text-[11px] mt-4 leading-relaxed">
            <strong className="text-orbit-secondary">How this is counted:</strong> Semrush units = rows returned × published
            per-line rate (domain/URL 10, competitor-discovery &amp; demand 40); SerpAPI = searches; Profound = calls;
            Anthropic/OpenAI = tokens (OpenAI portraits = images). Counting began when v7.225 deployed; set per-project
            baselines (inside a project’s API Usage panel) to reflect earlier spend.
          </p>
        </>
      )}
    </div>
  );
}
