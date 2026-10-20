'use client';
/**
 * components/brief/SelectionCarryBanner.tsx — v7.570
 *
 * Keyword Selection Step 2: when the saved selection was made on an earlier category tree
 * (a Refresh Analysis renamed its nodes, so some saved choices match nothing), offer to carry
 * it onto the current tree keyword by keyword (/hidden-categories/carry). Shows the measured
 * before/after in-scope counts first; one-step undo afterwards. Theme tokens only (IV.6).
 */
import { useEffect, useState } from 'react';

interface Preview {
  available: boolean; staleNow: number; hides: number; canUndo?: boolean; undoAt?: string | null;
  prev?: { completedAt: string } | null;
  result?: { shared: number; inBefore: number; inAfter: number; flipped: number; newKeywords: number; hides: number; generalRows: number; heldNowIn?: number;
    changes?: Array<{ keyword: string; before: boolean; after: boolean; held: boolean; from: string; to: string }> };
}

const n0 = (v: number) => Math.round(v).toLocaleString();

export default function SelectionCarryBanner({ projectId, refreshKey = 0 }: { projectId: string; refreshKey?: number }) {
  const [p, setP] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/projects/${projectId}/hidden-categories/carry`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(d => { if (live) setP(d); }).catch(() => {});
    return () => { live = false; };
  }, [projectId, refreshKey]);

  const act = async (body: object) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/hidden-categories/carry`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d?.error ? String(d.error) : `Failed (${r.status})`); setBusy(false); return; }
      window.location.reload();   // every panel re-reads the selection from the project
    } catch { setErr('Network error — nothing was changed'); setBusy(false); }
  };

  if (!p) return null;
  const box = { border: '1px solid var(--ca-245-158-11-0_3)', background: 'var(--ca-245-158-11-0_08)', borderRadius: 10, padding: '10px 13px', marginBottom: 10, fontSize: 11.5, color: 'var(--c-c8c8e8)' } as const;
  const btn = (primary: boolean) => ({ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 7, cursor: busy ? 'wait' : 'pointer',
    background: primary ? 'var(--c-6c63ff)' : 'transparent', color: primary ? 'var(--on-fill-accent)' : 'var(--c-c8c8e8)', border: primary ? '1px solid var(--c-6c63ff)' : '1px solid var(--c-2a2a40)' }) as const;

  if (p.available && p.result) {
    const r = p.result;
    return (
      <div data-carry-banner style={box}>
        <div style={{ fontWeight: 800, color: 'var(--c-f59e0b)', marginBottom: 4 }}>Your category selection was made on the previous category tree</div>
        <div style={{ lineHeight: 1.5 }}>
          The last refresh rebuilt the tree, so <b>{n0(p.staleNow)}</b> of your {n0(p.hides)} saved choices no longer match a category and the new categories default to selected.
          Carrying it forward keyword by keyword: of <b>{n0(r.shared)}</b> keywords in both trees, <b>{n0(r.inBefore)}</b> were in scope before and <b>{n0(r.inAfter)}</b> will be after{r.flipped > 0 ? ` (${n0(r.flipped)} change side, where a new category mixes old in and out keywords — it takes the majority)` : ''}.
          {r.heldNowIn ? ` ${n0(r.heldNowIn)} keywords that were waiting to be filed land in scope because their new category is in.` : ''}
          {r.newKeywords > 0 ? ` ${n0(r.newKeywords)} keywords the previous tree never had follow their category.` : ''} You can review and adjust the ticks below after carrying it forward.
        </div>
        {r.changes && r.changes.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button onClick={() => setShowChanges(v => !v)} style={{ fontSize: 10.5, fontWeight: 700, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--c-9b96ff)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {showChanges ? 'Hide' : 'See'} the {n0(r.changes.length)} keywords whose status changes {showChanges ? '▴' : '▾'}
            </button>
            {showChanges && (
              <div data-carry-changes style={{ marginTop: 4, maxHeight: 260, overflowY: 'auto', fontSize: 10.5 }}>
                {r.changes.map(c => (
                  <div key={c.keyword} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1fr) 70px minmax(140px,1.2fr)', gap: 8, padding: '2px 0', borderBottom: '1px dashed var(--c-1e1e34)' }}>
                    <span style={{ color: 'var(--c-e8e8ff)' }}>{c.keyword}</span>
                    <span style={{ color: c.after ? 'var(--c-34d399)' : 'var(--c-f87171)', fontWeight: 700 }}>{c.held ? 'held → ' : (c.before ? 'in → ' : 'out → ')}{c.after ? 'in' : 'out'}</span>
                    <span style={{ color: 'var(--c-8a8aa8)' }}>{c.to || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button data-carry-apply disabled={busy} onClick={() => void act({})} style={btn(true)}>{busy ? 'Applying…' : 'Carry my selection forward'}</button>
          {err && <span style={{ color: 'var(--c-f87171)' }}>{err}</span>}
        </div>
      </div>
    );
  }
  if (p.canUndo && p.undoAt && Date.now() - new Date(p.undoAt).getTime() < 7 * 86400000) {
    return (
      <div data-carry-undo style={{ ...box, border: '1px solid var(--c-1e1e34)', background: 'var(--c-0c0c16)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Selection carried onto the current category tree on {new Date(p.undoAt).toLocaleString()}.</span>
        <button disabled={busy} onClick={() => void act({ restore: true })} style={btn(false)}>Undo</button>
        {err && <span style={{ color: 'var(--c-f87171)' }}>{err}</span>}
      </div>
    );
  }
  return null;
}
