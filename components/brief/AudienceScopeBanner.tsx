'use client';
/**
 * components/brief/AudienceScopeBanner.tsx — v7.572
 *
 * Audience Journeys: says what the segments were built on, and rebuilds them from the
 * keywords in scope (/api/projects/[id]/audience-segments). Synthesis builds segments from the
 * whole footprint, so after a Keyword Selection boundary they describe audiences that may have
 * no topics in scope (Citi (travel cards) 2026-10-20: two of three segments at 0 articles).
 * Two steps with live status: segments (one model call), then portraits. Theme tokens only.
 */
import { useEffect, useState } from 'react';

interface Status {
  stale: boolean; scopeAt: string | null; segmentsBuiltAt: string | null;
  builtOn: { keywords: number; volume: number } | null;
  segments: Array<{ name: string; volumePct: number; hasImage: boolean }>;
}

export default function AudienceScopeBanner({ projectId, onRebuilt }: { projectId: string; onRebuilt?: () => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [phase, setPhase] = useState<null | { label: string; startedAt: number; expectS: number }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  const load = async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/audience-segments`, { cache: 'no-store' });
      setS(r.ok ? await r.json() : null);
    } catch { /* status unknown — show nothing rather than guess */ }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);
  useEffect(() => { if (!phase) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [phase]);

  const post = async (step: 'segments' | 'images') => {
    const r = await fetch(`/api/projects/${projectId}/audience-segments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error ? String(d.error) : `Failed (${r.status})`);
    return d;
  };
  const rebuild = async () => {
    setErr(null);
    try {
      // expected durations are this pass's own budgets (model call ≤100s; portraits ≤ the 300s window)
      setPhase({ label: 'Step 1 of 2 · building segments from the in-scope keywords', startedAt: Date.now(), expectS: 60 });
      await post('segments');
      setPhase({ label: 'Step 2 of 2 · generating segment portraits', startedAt: Date.now(), expectS: 90 });
      try { await post('images'); } catch (e) { setErr(`Segments rebuilt; portraits failed (${(e as Error).message}) — run Rebuild again to retry them.`); }
      setPhase(null);
      await load();
      onRebuilt?.();
    } catch (e) { setPhase(null); setErr((e as Error).message); }
  };

  if (!s || !Array.isArray(s.segments) || s.segments.length === 0) return null;   // unknown status → render nothing
  const btn = { fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 7, cursor: phase ? 'wait' : 'pointer', background: 'var(--c-6c63ff)', color: 'var(--on-fill-accent)', border: '1px solid var(--c-6c63ff)' } as const;
  const el = phase ? Math.round((Date.now() - phase.startedAt) / 1000) : 0;
  const progress = phase && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ width: 140, height: 6, borderRadius: 3, background: 'var(--c-1e1e34)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(95, (el / phase.expectS) * 100)}%`, background: 'var(--c-6c63ff)' }} />
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)' }}>{phase.label} · {el}s{el < phase.expectS ? ` · about ${phase.expectS - el}s left` : ' · finishing…'}</span>
    </div>
  );

  if (s.stale) {
    return (
      <div data-audience-stale style={{ border: '1px solid var(--ca-245-158-11-0_3)', background: 'var(--ca-245-158-11-0_08)', borderRadius: 10, padding: '10px 13px', marginBottom: 14, fontSize: 11.5, color: 'var(--c-c8c8e8)' }}>
        <div style={{ fontWeight: 800, color: 'var(--c-f59e0b)', marginBottom: 3 }}>These audience segments were not built on your current keyword scope</div>
        <div style={{ lineHeight: 1.5 }}>They were written from the whole keyword footprint{s.segmentsBuiltAt ? '' : ' at analysis time'}, before your Keyword Selection boundary, so a segment can show 0 topics here. Their share percentages are the model&rsquo;s estimate for that wider set. Rebuild them from the keywords in scope — finish <b>Categorize now</b> in Keyword Selection first if keywords are still waiting to be filed, so the rebuild sees all of them.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button data-audience-rebuild disabled={!!phase} onClick={() => void rebuild()} style={btn}>{phase ? 'Rebuilding…' : 'Rebuild segments for current scope'}</button>
          {err && <span style={{ color: 'var(--c-f87171)' }}>{err}</span>}
        </div>
        {progress}
      </div>
    );
  }
  return (
    <div data-audience-built style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {s.builtOn ? <span>Segments built on <b>{s.builtOn.keywords.toLocaleString()}</b> in-scope keywords{s.segmentsBuiltAt ? ` · ${new Date(s.segmentsBuiltAt).toLocaleString()}` : ''}.</span> : <span>Segments built from the whole footprint at analysis time.</span>}
      <button disabled={!!phase} onClick={() => void rebuild()} style={{ ...btn, background: 'transparent', color: 'var(--c-9b96ff)', border: '1px solid var(--c-2a2a40)', padding: '3px 9px' }}>{phase ? 'Rebuilding…' : 'Rebuild'}</button>
      {err && <span style={{ color: 'var(--c-f87171)' }}>{err}</span>}
      {progress}
    </div>
  );
}
