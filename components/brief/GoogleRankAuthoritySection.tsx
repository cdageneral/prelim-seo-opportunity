'use client';

/**
 * GoogleRankAuthoritySection (v7.367) — the Google Rank Authority panel.
 *
 * Shows the REAL Semrush backlink-authority profile of the client vs every
 * configured competitor (Const I.1 — every count on screen is a crawled
 * Semrush index row, date-stamped IV.5). Signals per domain:
 *   • Referring domains + follow/nofollow split      (backlinks_overview)
 *   • Authority Score — Semrush's MODELED composite, labeled per I.5a
 *   • Quality tiers AS≥10/30/50 — exact TS rollups of the ascore distribution
 *   • Top anchor texts + brand-anchor lower bound    (backlinks_anchors)
 *   • Referring-domain topical categories            (backlinks_categories_profile,
 *     Semrush's modeled classifier — labeled)
 *   • Brand phrase monthly volume                    (phrase_this — entity demand)
 *
 * Scan flow (Const I.6 + IV.2): Run scan → dry-run cost estimate with editable
 * anchors/categories row limits → user confirms the spend → streamed NDJSON
 * progress with determinate bar + ETA → snapshot persists on the project row.
 * In-place rescan CTA + last-scan timestamp (IV.4/IV.5). Theme-aware via
 * orbit-* tokens only (IV.6). Feeds the Authority Calculator panel (v7.368).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

interface CompetitorLite { id: string; domain: string; name: string | null; }

interface DomainSignals {
  domain:      string;
  role:        'client' | 'competitor';
  brandPhrase: string;
  overview:    { ascore: number; total: number; refDomains: number; follows: number; nofollows: number } | null;
  ascoreProfile:       Record<string, number> | null;
  qualityTiers:        { lt10: number; ge10: number; ge30: number; ge50: number } | null;
  anchors:             Array<{ anchor: string; domains: number; backlinks: number }> | null;
  refdomainCategories: Array<{ name: string; rating: number }> | null;
  brandVolume:         number | null;
  errors:              string[];
}
interface Snapshot {
  version: number; fetchedAt: string; database: string;
  config: { anchorsLimit: number; categoriesLimit: number };
  domains: DomainSignals[];
}
interface ScanPlan {
  domains: string[]; reportsPerDomain: number;
  anchorsLimit: number; categoriesLimit: number;
  estimatedUnitsPerDomain: number; estimatedUnitsTotal: number; note: string;
}
interface Progress { done: number; total: number; label: string; etaSec: number | null; }

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString();
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/** Deterministic brand tokens for the brand-anchor lower bound: the domain root
 *  plus each ≥3-char word of the brand phrase. The rule is shown on-panel. */
function brandTokens(domain: string, brandPhrase: string): string[] {
  const out: string[] = [];
  const push = (s: string) => { const t = s.toLowerCase().trim(); if (t.length >= 3 && out.indexOf(t) < 0) out.push(t); };
  push(domain.replace(/\.[a-z.]+$/i, ''));
  String(brandPhrase ?? '').split(/[^a-z0-9]+/i).forEach(push);
  return out;
}
function brandAnchorDomains(sig: DomainSignals): number | null {
  if (!sig.anchors) return null;
  const tokens = brandTokens(sig.domain, sig.brandPhrase);
  let sum = 0;
  sig.anchors.forEach(a => {
    const t = a.anchor.toLowerCase();
    if (tokens.some(tok => t.indexOf(tok) >= 0)) sum += a.domains;
  });
  return sum;
}

const MODELED_CHIP = (
  <span className="text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded border border-orbit-border text-orbit-tertiary align-middle">
    modeled
  </span>
);

export default function GoogleRankAuthoritySection({
  projectId, projectName, domain, competitors,
}: {
  projectId: string; projectName: string; domain: string; competitors: CompetitorLite[];
}) {
  const [snapshot, setSnapshot]   = useState<Snapshot | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [plan, setPlan]           = useState<ScanPlan | null>(null);
  const [planning, setPlanning]   = useState(false);
  const [anchorsLimit, setAnchorsLimit]       = useState(50);
  const [categoriesLimit, setCategoriesLimit] = useState(25);
  const [scanning, setScanning]   = useState(false);
  const [progress, setProgress]   = useState<Progress | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [openAnchors, setOpenAnchors] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/authority-scan`, { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) { setSnapshot(d.snapshot ?? null); setUpdatedAt(d.updatedAt ?? d.snapshot?.fetchedAt ?? null); }
    } catch { /* panel still renders the empty state */ }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  // ── Dry-run: estimate the spend, then ask for confirmation (Const I.6) ──
  const requestPlan = useCallback(async () => {
    setError(null); setPlanning(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/authority-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, anchorsLimit, categoriesLimit }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d?.error ?? `Could not estimate (${r.status})`); return; }
      setPlan(d.plan);
    } catch (e) { setError(String((e as any)?.message ?? e)); }
    finally { setPlanning(false); }
  }, [projectId, anchorsLimit, categoriesLimit]);

  // ── Confirmed scan: streamed NDJSON progress (Const IV.2) ──
  const runScan = useCallback(async () => {
    setPlan(null); setError(null); setScanning(true);
    setProgress({ done: 0, total: 0, label: 'Starting…', etaSec: null });
    try {
      const r = await fetch(`/api/projects/${projectId}/authority-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorsLimit, categoriesLimit }),
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => null);
        setError(d?.error ?? `Scan failed (${r.status})`);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: any; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'start') {
            setProgress({ done: 0, total: ev.total ?? 0, label: 'Pulling backlink profiles…', etaSec: null });
          } else if (ev.type === 'progress') {
            setProgress({ done: ev.done ?? 0, total: ev.total ?? 0, label: ev.label ?? '', etaSec: ev.etaSec ?? null });
          } else if (ev.type === 'error') {
            setError(ev.error ?? 'Scan failed');
          } else if (ev.type === 'done' && ev.snapshot) {
            setSnapshot(ev.snapshot);
            setUpdatedAt(ev.snapshot.fetchedAt ?? null);
          }
        }
      }
    } catch (e) { setError(String((e as any)?.message ?? e)); }
    finally { setScanning(false); setProgress(null); }
  }, [projectId, anchorsLimit, categoriesLimit]);

  const client = useMemo(() => snapshot?.domains.find(d => d.role === 'client') ?? null, [snapshot]);
  const rows   = useMemo(() => snapshot?.domains ?? [], [snapshot]);

  return (
    <div>
      {/* ── Header: title + rescan CTA + last-scan timestamp (IV.4/IV.5) ── */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-orbit-primary text-lg font-semibold flex items-center gap-2">
            <i className="ti ti-shield text-orbit-accent" aria-hidden="true" />
            Google Rank Authority
          </h2>
          <p className="text-orbit-secondary text-xs mt-1 max-w-2xl">
            Real backlink-authority signals for {projectName} vs {competitors.length} competitor{competitors.length === 1 ? '' : 's'} —
            referring domains, authority distribution, anchor profile, topical relevance, and brand demand.
            Every count is a crawled Semrush index row from the scan date below. Feeds the Authority Calculator.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button
            onClick={requestPlan}
            disabled={planning || scanning}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors disabled:opacity-50"
          >
            <i className={`ti ${planning ? 'ti-loader animate-spin' : 'ti-radar-2'}`} aria-hidden="true" />
            {snapshot ? 'Re-run authority scan' : 'Run authority scan'}
          </button>
          <span className="text-[11px] text-orbit-tertiary">Last scan: {fmtTime(updatedAt)}</span>
        </div>
      </div>

      {error && (
        <div className="orbit-card p-4 mb-4 border border-orbit-red/30">
          <p className="text-orbit-red text-sm">{error}</p>
        </div>
      )}

      {/* ── Dry-run confirmation (Const I.6 — the spend and row limits are the user's call) ── */}
      {plan && !scanning && (
        <div className="orbit-card p-4 mb-4 border border-orbit-accent/30">
          <p className="text-orbit-primary text-sm font-medium">
            Scan {plan.domains.length} domain{plan.domains.length === 1 ? '' : 's'} — estimated ≤ {fmt(plan.estimatedUnitsTotal)} Semrush units
          </p>
          <p className="text-orbit-tertiary text-xs mt-1">{plan.domains.join(' · ')}</p>
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <label className="text-xs text-orbit-secondary">
              Anchor rows per domain <span className="text-orbit-tertiary">(40 units each)</span>
              <input type="number" min={1} max={500} value={anchorsLimit}
                onChange={e => setAnchorsLimit(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 50)))}
                className="block mt-1 w-28 text-sm bg-orbit-bg border border-orbit-border rounded-lg px-2 py-1 text-orbit-primary" />
            </label>
            <label className="text-xs text-orbit-secondary">
              Category rows per domain
              <input type="number" min={1} max={100} value={categoriesLimit}
                onChange={e => setCategoriesLimit(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 25)))}
                className="block mt-1 w-28 text-sm bg-orbit-bg border border-orbit-border rounded-lg px-2 py-1 text-orbit-primary" />
            </label>
            <button onClick={runScan}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-orbit-accent text-white hover:opacity-90 transition-opacity">
              Confirm &amp; scan
            </button>
            <button onClick={() => setPlan(null)}
              className="text-xs font-medium px-3 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary">
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-orbit-tertiary mt-2">{plan.note}</p>
        </div>
      )}

      {/* ── Determinate progress + ETA (IV.2) ── */}
      {scanning && progress && (
        <div className="orbit-card p-4 mb-4">
          <div className="flex items-center justify-between text-xs text-orbit-secondary mb-2">
            <span>{progress.label || 'Scanning…'}</span>
            <span>
              {progress.done} of {progress.total}
              {progress.etaSec !== null && progress.total > 0 ? ` · ~${progress.etaSec}s left` : ''}
            </span>
          </div>
          <div className="h-2 rounded-full bg-orbit-border overflow-hidden">
            <div className="h-full bg-orbit-accent rounded-full transition-all duration-300"
              style={{ width: progress.total ? `${Math.round((progress.done / progress.total) * 100)}%` : '4%' }} />
          </div>
        </div>
      )}

      {loading && !snapshot && (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="orbit-card h-24 animate-pulse" />)}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !snapshot && !scanning && (
        <div className="orbit-card p-8 text-center">
          <i className="ti ti-shield-search text-3xl text-orbit-tertiary" aria-hidden="true" />
          <p className="text-orbit-secondary text-sm mt-2 font-medium">No authority scan yet</p>
          <p className="text-orbit-tertiary text-xs mt-1 max-w-md mx-auto">
            Run the scan to pull the real backlink-authority profile for {domain} and each competitor from
            Semrush — you&apos;ll see the estimated API cost and confirm before anything is spent.
          </p>
        </div>
      )}

      {/* ── Signals ── */}
      {snapshot && (
        <>
          {/* Comparison table */}
          <div className="orbit-card p-4 mb-4 overflow-x-auto">
            <h3 className="text-orbit-primary text-sm font-semibold mb-3">Domain authority signals</h3>
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-orbit-tertiary text-left border-b border-orbit-border">
                  <th className="py-1.5 pr-2 font-medium">Domain</th>
                  <th className="py-1.5 px-2 font-medium text-right">Authority Score {MODELED_CHIP}</th>
                  <th className="py-1.5 px-2 font-medium text-right">Ref. domains</th>
                  <th className="py-1.5 px-2 font-medium text-right">RDs AS≥10</th>
                  <th className="py-1.5 px-2 font-medium text-right">RDs AS≥30</th>
                  <th className="py-1.5 px-2 font-medium text-right">RDs AS≥50</th>
                  <th className="py-1.5 px-2 font-medium text-right">Follow share</th>
                  <th className="py-1.5 pl-2 font-medium text-right">Brand demand /mo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(sig => {
                  const ov = sig.overview; const qt = sig.qualityTiers;
                  const followShare = ov && (ov.follows + ov.nofollows) > 0 ? pct(ov.follows, ov.follows + ov.nofollows) : '—';
                  return (
                    <tr key={sig.domain}
                      className={`border-b border-orbit-border/60 ${sig.role === 'client' ? 'bg-orbit-accent/5' : ''}`}>
                      <td className="py-2 pr-2 text-orbit-primary font-medium">
                        {sig.domain}
                        {sig.role === 'client' && (
                          <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-orbit-accent">client</span>
                        )}
                        {sig.errors.length > 0 && (
                          <span className="ml-1.5 text-[10px] text-orbit-red" title={sig.errors.join('\n')}>
                            {sig.errors.length} pull{sig.errors.length === 1 ? '' : 's'} failed
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-orbit-secondary">{ov ? ov.ascore : '—'}</td>
                      <td className="py-2 px-2 text-right text-orbit-primary font-medium">{fmt(ov?.refDomains ?? null)}</td>
                      <td className="py-2 px-2 text-right text-orbit-secondary">{fmt(qt?.ge10 ?? null)}</td>
                      <td className="py-2 px-2 text-right text-orbit-secondary">{fmt(qt?.ge30 ?? null)}</td>
                      <td className="py-2 px-2 text-right text-orbit-secondary">{fmt(qt?.ge50 ?? null)}</td>
                      <td className="py-2 px-2 text-right text-orbit-secondary">{followShare}</td>
                      <td className="py-2 pl-2 text-right text-orbit-secondary">{fmt(sig.brandVolume)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {client?.overview && rows.length > 1 && (
              <p className="text-[11px] text-orbit-tertiary mt-2">
                Referring-domain gap vs {client.domain}:{' '}
                {rows.filter(r => r.role === 'competitor' && r.overview).map(r => {
                  const ratio = r.overview!.refDomains / Math.max(1, client.overview!.refDomains);
                  return `${r.domain} ${ratio >= 1 ? `${ratio.toFixed(2)}× ahead` : `${(1 / ratio).toFixed(2)}× behind`}`;
                }).join(' · ')}
              </p>
            )}
          </div>

          {/* Anchor + topical profiles per domain */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
            {rows.map(sig => {
              const brandRD = brandAnchorDomains(sig);
              const open = openAnchors === sig.domain;
              return (
                <div key={sig.domain} className="orbit-card p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-orbit-primary text-sm font-semibold">{sig.domain}</h4>
                    <span className="text-[10px] text-orbit-tertiary uppercase tracking-wide">{sig.role}</span>
                  </div>
                  <div className="mt-2 text-xs text-orbit-secondary space-y-1.5">
                    <p>
                      Brand-anchor referring domains:{' '}
                      <span className="text-orbit-primary font-medium">{brandRD === null ? '—' : fmt(brandRD)}</span>
                      <span className="text-orbit-tertiary"> — anchors containing a brand token, computed from the top {snapshot.config.anchorsLimit} anchor rows (lower bound)</span>
                    </p>
                    <p className="text-orbit-tertiary">
                      Top referring-domain topics{' '}
                      <span className="align-middle">{MODELED_CHIP}</span>{' '}
                      {sig.refdomainCategories?.length
                        ? sig.refdomainCategories.slice(0, 6).map(c => c.name.replace(/^\//, '')).join(' · ')
                        : '—'}
                    </p>
                  </div>
                  {sig.anchors && sig.anchors.length > 0 && (
                    <div className="mt-3">
                      <button onClick={() => setOpenAnchors(open ? null : sig.domain)}
                        className="text-[11px] font-medium text-orbit-accent hover:underline">
                        {open ? 'Hide' : 'Show'} top anchors ({sig.anchors.length})
                      </button>
                      {open && (
                        <table className="w-full text-[11px] mt-2">
                          <thead>
                            <tr className="text-orbit-tertiary text-left border-b border-orbit-border">
                              <th className="py-1 pr-2 font-medium">Anchor</th>
                              <th className="py-1 px-2 font-medium text-right">Ref. domains</th>
                              <th className="py-1 pl-2 font-medium text-right">Backlinks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sig.anchors.slice(0, 15).map((a, i) => (
                              <tr key={i} className="border-b border-orbit-border/40">
                                <td className="py-1 pr-2 text-orbit-secondary break-all">{a.anchor || '(empty)'}</td>
                                <td className="py-1 px-2 text-right text-orbit-primary">{fmt(a.domains)}</td>
                                <td className="py-1 pl-2 text-right text-orbit-tertiary">{fmt(a.backlinks)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Methodology / provenance (Const I.2, I.5a) */}
          <div className="orbit-card p-4">
            <p className="text-[11px] text-orbit-tertiary leading-relaxed">
              <span className="font-semibold text-orbit-secondary">Sources &amp; labels.</span>{' '}
              Referring domains, backlinks, follow/nofollow counts, anchor rows, and the authority-score distribution are
              crawled rows from Semrush&apos;s backlinks index (reports: backlinks_overview, backlinks_ascore_profile,
              backlinks_anchors, backlinks_categories_profile), pulled {fmtTime(snapshot.fetchedAt)}. Counts are facts about
              that index — a different crawler (e.g. Ahrefs) will differ. <span className="font-medium">Authority Score</span> is
              Semrush&apos;s modeled composite and the AS≥10/30/50 tier boundaries are conventions on that modeled scale — shown
              as shorthand, never as measured data. Referring-domain topics come from Semrush&apos;s category classifier (modeled).
              Brand demand is the real monthly volume for the domain&apos;s brand phrase (phrase_this, database &quot;{snapshot.database}&quot;).
              API spend for each scan is recorded in the API Usage panel.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
