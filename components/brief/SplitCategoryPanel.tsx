'use client';
/**
 * components/brief/SplitCategoryPanel.tsx — v7.573
 *
 * Keyword Selection Step 2: split one broad category into page-level sub-categories
 * (/api/projects/[id]/categories/split). Propose → review every group (keywords, real volume,
 * "reuses existing category") → Apply. Nothing is written until Apply. Theme tokens only (IV.6).
 */
import { useEffect, useState } from 'react';

interface Group { name: string; path: string[]; existing: boolean; keywords: string[]; volume: number }
interface Proposal { node: string[]; groups: Group[]; stay: string[]; stayVolume: number; rejected: Array<{ name: string; reason: string; keywords: number }> }

const fmtVol = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v));
const SEP = ' › ';

export default function SplitCategoryPanel({ projectId, nodeKey, ownCount, onClose }: { projectId: string; nodeKey: string; ownCount: number; onClose: () => void }) {
  const [p, setP] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<null | { label: string; startedAt: number; expectS: number }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { if (!busy) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, [busy]);

  const call = async (body: object) => {
    const r = await fetch(`/api/projects/${projectId}/categories/split`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error ? String(d.error) : `Failed (${r.status})`);
    return d;
  };
  const propose = async () => {
    setErr(null);
    // expected time scales with the keyword count the model reads (one call, ≤200s budget)
    setBusy({ label: `Reading ${ownCount.toLocaleString()} keywords and proposing sub-categories`, startedAt: Date.now(), expectS: Math.min(180, 25 + Math.round(ownCount * 0.4)) });
    try { const d = await call({ step: 'propose', path: nodeKey.split(SEP) }); setP(d.proposal); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const apply = async () => {
    if (!p) return;
    setErr(null); setBusy({ label: 'Saving the new sub-categories', startedAt: Date.now(), expectS: 10 });
    try { await call({ step: 'apply', proposal: p }); window.location.reload(); } catch (e) { setErr((e as Error).message); setBusy(null); }
  };

  const el = busy ? Math.round((Date.now() - busy.startedAt) / 1000) : 0;
  const btn = (primary: boolean) => ({ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 7, cursor: busy ? 'wait' : 'pointer',
    background: primary ? 'var(--c-6c63ff)' : 'transparent', color: primary ? 'var(--on-fill-accent)' : 'var(--c-c8c8e8)', border: primary ? '1px solid var(--c-6c63ff)' : '1px solid var(--c-2a2a40)' }) as const;
  const moved = p ? p.groups.reduce((n, g) => n + g.keywords.length, 0) : 0;

  return (
    <div data-split-panel style={{ margin: '4px 8px 8px 46px', padding: '10px 12px', border: '1px solid var(--c-1e1e34)', borderLeft: '3px solid var(--c-6c63ff)', borderRadius: '0 9px 9px 0', background: 'var(--c-0c0c16)', fontSize: 11.5, color: 'var(--c-c8c8e8)' }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>Split &ldquo;{nodeKey.split(SEP).slice(-1)[0]}&rdquo; into page-level sub-categories</div>
      {!p && <div style={{ lineHeight: 1.5, color: 'var(--c-8a8aa8)' }}>Its {ownCount.toLocaleString()} keywords sit in one category, so they can only map to one page. The AI model proposes sub-categories (each one a page Google would rank on its own), reusing any category that already exists in the tree. You review the groups before anything changes. One AI call, logged in API Usage.</div>}
      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ width: 140, height: 6, borderRadius: 3, background: 'var(--c-1e1e34)', overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.min(95, (el / busy.expectS) * 100)}%`, background: 'var(--c-6c63ff)' }} />
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)' }}>{busy.label} · {el}s{el < busy.expectS ? ` · about ${busy.expectS - el}s left` : ' · finishing…'}</span>
        </div>
      )}
      {p && (
        <div style={{ marginTop: 4 }}>
          <div style={{ color: 'var(--c-8a8aa8)', marginBottom: 4 }}>{p.groups.length} sub-categories · {moved.toLocaleString()} keywords move · {p.stay.length.toLocaleString()} stay on &ldquo;General {p.node.slice(-1)[0]}&rdquo; ({fmtVol(p.stayVolume)}/mo)</div>
          {p.groups.map(g => {
            const k = g.path.join(SEP);
            return (
              <div key={k} data-split-group style={{ borderBottom: '1px dashed var(--c-1e1e34)', padding: '3px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <button onClick={() => setOpen(open === k ? null : k)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--c-e8e8ff)', fontWeight: 700, fontSize: 11.5, textAlign: 'left' }}>{open === k ? '▾' : '▸'} {g.name}</button>
                  {g.existing && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--c-34d399)' }} title={k}>REUSES EXISTING · {k}</span>}
                  <span style={{ marginLeft: 'auto', color: 'var(--c-8a8aa8)', fontVariantNumeric: 'tabular-nums' }}>{g.keywords.length} kw · {fmtVol(g.volume)}/mo</span>
                </div>
                {open === k && <div style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', padding: '2px 0 4px 14px', lineHeight: 1.5 }}>{g.keywords.join(' · ')}</div>}
              </div>
            );
          })}
          {p.rejected.length > 0 && <div style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', marginTop: 4 }}>Kept on the parent: {p.rejected.map(r => `${r.name} (${r.reason})`).join('; ')}.</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!p && <button data-split-propose disabled={!!busy} onClick={() => void propose()} style={btn(true)}>{busy ? 'Working…' : 'Propose sub-categories'}</button>}
        {p && <button data-split-apply disabled={!!busy} onClick={() => void apply()} style={btn(true)}>{busy ? 'Saving…' : (() => { const n = p.groups.filter(g => !g.existing).length; return `Apply · create ${n} sub-categor${n === 1 ? 'y' : 'ies'}`; })()}</button>}
        {p && <button disabled={!!busy} onClick={() => { setP(null); void propose(); }} style={btn(false)}>Propose again</button>}
        <button disabled={!!busy} onClick={onClose} style={btn(false)}>Cancel</button>
        {err && <span style={{ color: 'var(--c-f87171)' }}>{err}</span>}
      </div>
      {p && <div style={{ fontSize: 10, color: 'var(--c-8a8aa8)', marginTop: 6 }}>Groupings and names are the AI model&rsquo;s proposal; keyword volumes are the stored Semrush figures. After applying, each sub-category gets its own page match automatically, and any with no matching client page shows as a page to build. The change is logged in the Keyword panel&rsquo;s merge log and kept on the next Refresh Analysis.</div>}
    </div>
  );
}
