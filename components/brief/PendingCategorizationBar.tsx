'use client';
/**
 * PendingCategorizationBar — v7.531
 *
 * Shows how many keywords are held out of every panel because they have no stored
 * category yet (Const III.1e v0.31), and files them into the EXISTING tree through
 * /api/projects/[id]/categorize-pending — never a new category. Progress is live and
 * determinate: keywords filed of the starting total + an ETA from the measured time
 * per call (Const IV.2). Nothing is guessed: unfiled keywords stay pending and are
 * counted; ones that match no selected category go to "Other".
 *
 * `autoRunKey`: when this value changes (e.g. a competitor CSV upload finished) and
 * keywords are pending, the run starts on its own — Wayne asked for categorization
 * straight after upload, not a manual refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  projectId: string;
  refreshKey?: number;          // re-read the pending count when keywords change
  autoRunKey?: number;          // change → start a run automatically if anything is pending
  compact?: boolean;            // one-line variant for the Keyword list strip
  onFiled?: () => void;         // page refetches the analysis so panels pick up the new membership
}

const fmtN = (v: number) => v.toLocaleString();
const fmtVol = (v: number) => v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(v);
const fmtDur = (ms: number) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`; };

export default function PendingCategorizationBar({ projectId, refreshKey = 0, autoRunKey, compact = false, onFiled }: Props) {
  const [info, setInfo]   = useState<{ pending: number; pendingAnnualVolume: number; candidates: number; hasTree: boolean } | null>(null);
  const [run, setRun]     = useState<{ start: number; done: number; other: number; msPerKw: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/categorize-pending`, { cache: 'no-store' });
      if (!r.ok) { setInfo(null); return null; }
      const d = await r.json();
      setInfo(d);
      return d as { pending: number; pendingAnnualVolume: number; candidates: number; hasTree: boolean };
    } catch { setInfo(null); return null; }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const start = useCallback(async () => {
    const first = await load();
    if (!first || !first.pending) return;
    setError(null); setSummary(null); stopRef.current = false;
    const total = first.pending;
    let done = 0, other = 0, msTotal = 0;
    setRun({ start: total, done: 0, other: 0, msPerKw: null });
    for (;;) {
      if (stopRef.current) break;
      let d: any;
      try {
        const r = await fetch(`/api/projects/${projectId}/categorize-pending`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        d = await r.json();
        if (!r.ok) { setError(d?.error ?? `Categorization failed (${r.status})`); break; }
      } catch (e: any) { setError(`Categorization failed: ${String(e?.message ?? e)}`); break; }
      const step = (d.filed ?? 0) + (d.other ?? 0);
      done += step; other += d.other ?? 0; msTotal += d.ms ?? 0;
      setRun({ start: total, done, other, msPerKw: done > 0 ? msTotal / done : null });
      if (d.remaining === 0) break;
      if (step === 0) {
        setError(`${fmtN(d.remaining)} keyword${d.remaining === 1 ? '' : 's'} could not be filed this pass${d.failedCalls ? ` (${d.failedCalls} call${d.failedCalls === 1 ? '' : 's'} failed)` : ''} — they stay held out. Try again.`);
        break;
      }
    }
    setRun(null);
    if (done > 0) {
      setSummary(`Filed ${fmtN(done - other)} keyword${done - other === 1 ? '' : 's'} into existing categories${other > 0 ? ` · ${fmtN(other)} matched no selected category and went to "Other"` : ''}.`);
      onFiled?.();
    }
    await load();
  }, [load, onFiled, projectId]);

  // Auto-run after an upload (autoRunKey change), never on first mount.
  const lastAuto = useRef(autoRunKey);
  useEffect(() => {
    if (autoRunKey === undefined || autoRunKey === lastAuto.current) return;
    lastAuto.current = autoRunKey;
    (async () => { const d = await load(); if (d && d.pending > 0 && !run) start(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunKey]);

  if (!info?.hasTree) return null;
  if (!run && info.pending === 0 && !summary && !error) return null;

  const box: React.CSSProperties = compact
    ? { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--c-c8c8e8)' }
    : { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', margin: '0 0 12px', borderRadius: 10,
        border: '1px solid var(--c-f59e0b)', background: 'var(--c-0c0c16)', fontSize: 12, color: 'var(--c-c8c8e8)' };
  const btn: React.CSSProperties = {
    fontSize: compact ? 11 : 12, fontWeight: 700, padding: compact ? '2px 8px' : '5px 12px', borderRadius: 7, cursor: 'pointer',
    border: '1px solid var(--c-f59e0b)', background: 'transparent', color: 'var(--c-f59e0b)', fontFamily: 'inherit',
  };

  if (run) {
    const left = run.start - run.done;
    const eta = run.msPerKw != null && left > 0 ? fmtDur(run.msPerKw * left) : null;
    const pct = run.start > 0 ? Math.min(100, Math.round((run.done / run.start) * 100)) : 0;
    return (
      <div style={box} data-testid="pending-cat-running">
        <i className="ti ti-loader-2" style={{ color: 'var(--c-f59e0b)' }} />
        <span>Categorizing into existing categories — <b>{fmtN(run.done)}</b> of <b>{fmtN(run.start)}</b> filed · {fmtN(left)} left{eta ? ` · about ${eta} remaining` : ' · measuring speed…'}</span>
        <span style={{ flex: '1 1 120px', minWidth: 120, height: 6, borderRadius: 3, background: 'var(--c-1e1e34)', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--c-f59e0b)' }} />
        </span>
        <button style={btn} onClick={() => { stopRef.current = true; }}>Stop</button>
      </div>
    );
  }

  return (
    <div style={box} data-testid="pending-cat">
      {info.pending > 0 && (
        <>
          <i className="ti ti-hourglass" style={{ color: 'var(--c-f59e0b)' }} />
          <span>
            <b style={{ color: 'var(--c-f59e0b)' }}>{fmtN(info.pending)}</b> keyword{info.pending === 1 ? '' : 's'} ({fmtVol(info.pendingAnnualVolume)} annual vol) awaiting categorization — held out of every count until filed into your existing categories.
          </span>
          <button style={btn} onClick={start}>Categorize now</button>
        </>
      )}
      {summary && <span style={{ color: 'var(--c-34d399)' }}>{summary}</span>}
      {error && <span style={{ color: 'var(--c-ef4444)' }}>{error}</span>}
    </div>
  );
}
