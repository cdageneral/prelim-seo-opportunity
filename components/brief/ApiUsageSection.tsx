'use client';

/**
 * ApiUsageSection (v7.225) — per-project API credit ledger.
 *
 * Shows this project's REAL metered consumption (Constitution Art. I.1) for
 * every provider, split into measured live usage vs. an optional manual
 * baseline anchor, with an in-place refresh CTA (Art. IV.4) + last-activity
 * timestamp (Art. IV.5), an itemized recent-calls log (provenance), and a
 * methodology note. Theme-aware via orbit-* tokens (Art. IV.6) — no hardcoded
 * colors that vanish in either theme.
 */

import { useCallback, useEffect, useState } from 'react';

interface ProviderLine {
  provider: string; unit: string;
  usage: number; baseline: number; total: number;
  calls: number; rows: number; lastActivity: string | null;
}
interface RecentRow {
  provider: string; endpoint: string; unit: string;
  quantity: number; rows: number | null; rate: number | null;
  keyHash: string | null; kind: string; createdAt: string | null;
}
interface UsagePayload {
  projectId: string; asOf: string; lastActivity: string | null;
  providers: ProviderLine[]; recent: RecentRow[]; note?: string;
}

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
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ApiUsageSection({ projectId }: { projectId: string }) {
  const [data, setData]       = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);   // `${provider}|${unit}`
  const [draft, setDraft]     = useState('');
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/projects/${projectId}/usage`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError((e as any)?.message ?? 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function saveBaseline(provider: string, unit: string) {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, unit, quantity: Math.max(0, Math.round(Number(draft) || 0)) }),
      });
      setEditing(null); setDraft('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  const providers = data?.providers ?? [];
  const hasAny = providers.length > 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header + refresh CTA + last-activity timestamp */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-orbit-primary flex items-center gap-2">
            <i className="ti ti-receipt text-orbit-accent" aria-hidden="true" />
            API Usage &amp; Credits
          </h2>
          <p className="text-orbit-secondary text-xs mt-1">
            Real metered consumption for this project. Counts begin when this version is deployed;
            anchor a provider to your dashboard figure with a baseline. Provider dashboards remain the billing source of truth.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors disabled:opacity-50"
          >
            <i className={`ti ti-refresh ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <span className="text-[11px] text-orbit-tertiary">
            Last activity: {fmtTime(data?.lastActivity ?? null)}
          </span>
        </div>
      </div>

      {error && (
        <div className="orbit-card p-4 mb-4 border border-orbit-red/30">
          <p className="text-orbit-red text-sm">Couldn’t load usage: {error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="orbit-card h-28 animate-pulse" />)}
        </div>
      )}

      {!loading && !hasAny && !error && (
        <div className="orbit-card p-6 text-center">
          <i className="ti ti-receipt-off text-2xl text-orbit-tertiary" aria-hidden="true" />
          <p className="text-orbit-secondary text-sm mt-2 font-medium">No usage recorded yet</p>
          <p className="text-orbit-tertiary text-xs mt-1">
            {data?.note ?? 'Run an analysis or scan and credit usage will appear here, itemized by provider.'}
          </p>
        </div>
      )}

      {/* Provider cards */}
      {hasAny && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {providers.map(p => {
            const key = `${p.provider}|${p.unit}`;
            const isEditing = editing === key;
            return (
              <div key={key} className="orbit-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <i className={`ti ${PROVIDER_ICON[p.provider] ?? 'ti-api'} text-orbit-accent`} aria-hidden="true" />
                    <span className="text-orbit-primary text-sm font-semibold">
                      {PROVIDER_LABEL[p.provider] ?? p.provider}
                    </span>
                  </div>
                  <span className="text-[11px] text-orbit-tertiary uppercase tracking-wide">
                    {UNIT_LABEL[p.unit] ?? p.unit}
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-orbit-primary tabular-nums">{fmt(p.total)}</span>
                  <span className="text-xs text-orbit-secondary">{UNIT_LABEL[p.unit] ?? p.unit}</span>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-orbit-tertiary">Measured</div>
                    <div className="text-orbit-secondary font-medium tabular-nums">{fmt(p.usage)}</div>
                  </div>
                  <div>
                    <div className="text-orbit-tertiary">Baseline</div>
                    <div className="text-orbit-secondary font-medium tabular-nums">{fmt(p.baseline)}</div>
                  </div>
                  <div>
                    <div className="text-orbit-tertiary">{p.provider === 'semrush' ? 'Rows' : 'Calls'}</div>
                    <div className="text-orbit-secondary font-medium tabular-nums">
                      {fmt(p.provider === 'semrush' ? p.rows : p.calls)}
                    </div>
                  </div>
                </div>

                {/* Baseline editor (manual reconciliation anchor) */}
                <div className="mt-3 pt-3 border-t border-orbit-border">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder="Dashboard figure"
                        className="flex-1 bg-orbit-bg border border-orbit-border rounded-md px-2 py-1 text-xs text-orbit-primary focus:outline-none focus:border-orbit-accent/60"
                      />
                      <button
                        onClick={() => saveBaseline(p.provider, p.unit)}
                        disabled={saving}
                        className="text-xs font-medium px-2.5 py-1 rounded-md bg-orbit-accent hover:bg-orbit-accent-light text-white transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditing(null); setDraft(''); }}
                        className="text-xs text-orbit-tertiary hover:text-orbit-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditing(key); setDraft(p.baseline ? String(p.baseline) : ''); }}
                      className="text-[11px] text-orbit-accent hover:text-orbit-accent-light font-medium flex items-center gap-1"
                    >
                      <i className="ti ti-adjustments-alt" aria-hidden="true" />
                      {p.baseline ? 'Edit baseline' : 'Set baseline from dashboard'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent itemized calls — provenance for the totals */}
      {data?.recent && data.recent.length > 0 && (
        <div className="orbit-card p-4 mt-4">
          <h3 className="text-orbit-primary text-sm font-semibold mb-2 flex items-center gap-2">
            <i className="ti ti-list-details text-orbit-secondary" aria-hidden="true" />
            Recent calls
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-orbit-tertiary text-left border-b border-orbit-border">
                  <th className="py-1.5 pr-3 font-medium">When</th>
                  <th className="py-1.5 pr-3 font-medium">Provider</th>
                  <th className="py-1.5 pr-3 font-medium">Endpoint</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Qty</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Rows×Rate</th>
                  <th className="py-1.5 font-medium">Key</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r, i) => (
                  <tr key={i} className="border-b border-orbit-border/40">
                    <td className="py-1.5 pr-3 text-orbit-tertiary whitespace-nowrap">{fmtTime(r.createdAt)}</td>
                    <td className="py-1.5 pr-3 text-orbit-secondary">{PROVIDER_LABEL[r.provider] ?? r.provider}</td>
                    <td className="py-1.5 pr-3 text-orbit-secondary font-mono">
                      {r.endpoint}{r.kind === 'baseline' ? ' (baseline)' : ''}
                    </td>
                    <td className="py-1.5 pr-3 text-orbit-primary text-right tabular-nums">
                      {fmt(r.quantity)} <span className="text-orbit-tertiary">{UNIT_LABEL[r.unit] ?? r.unit}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-orbit-tertiary text-right tabular-nums">
                      {r.rows != null && r.rate != null ? `${fmt(r.rows)} × ${r.rate}` : '—'}
                    </td>
                    <td className="py-1.5 text-orbit-tertiary font-mono">{r.keyHash ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Methodology note (Art. I.1 transparency) */}
      {hasAny && (
        <p className="text-orbit-tertiary text-[11px] mt-4 leading-relaxed">
          <strong className="text-orbit-secondary">How this is counted:</strong> Semrush units = rows actually returned × the
          provider’s published per-line rate (domain/URL reports 10/line, competitor-discovery &amp; demand
          reports 40/line); SerpAPI = searches run; Profound = calls; Anthropic/OpenAI = tokens reported by the
          API (OpenAI portraits counted as images). Figures are a reconcilable mirror of provider billing — set a
          baseline to align the in-app total with your provider dashboard.
        </p>
      )}
    </div>
  );
}
