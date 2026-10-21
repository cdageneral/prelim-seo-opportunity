'use client';
/**
 * components/brief/SplitCategoryPanel.tsx — v7.573
 *
 * Keyword Selection Step 2: split one broad category into page-level sub-categories
 * (/api/projects/[id]/categories/split). Propose → review every group (keywords, real volume,
 * "reuses existing category") → Apply. Nothing is written until Apply. Theme tokens only (IV.6).
 *
 * v7.581: opened on the top-level "Other" bucket it SORTS instead — each Add group becomes a new
 * top-level category (Const III.1e v0.43); Leave keeps keywords in Other (marked reviewed, so the
 * next run reads the next ones). Exclude is not offered there: it would mean "stay in Other" too.
 */
import { useEffect, useState } from 'react';
import { hiddenMatchers, pathIsHidden, ownIsOutOfScope } from '@/lib/category/selectionScope';   // v7.577: same rule as the pool

interface Group { name: string; path: string[]; existing: boolean; keywords: string[]; volume: number }
interface Proposal { node: string[]; groups: Group[]; stay: string[]; stayVolume: number; rejected: Array<{ name: string; reason: string; keywords: number }> }

const fmtVol = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v));
const SEP = ' › ';

export default function SplitCategoryPanel({ projectId, nodeKey, ownCount, onClose }: { projectId: string; nodeKey: string; ownCount: number; onClose: () => void }) {
  const sortingOther = nodeKey.trim().toLowerCase() === 'other';   // v7.581
  const [more, setMore] = useState<{ truncated: number; reviewedBefore: number } | null>(null);
  const [p, setP] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<null | { label: string; startedAt: number; expectS: number }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [volOf, setVolOf] = useState<Record<string, number>>({});
  // v7.578: what to do with each group — Add (create it / move there), Leave (keywords stay in this
  // category, no new page), Exclude (keywords leave scope → Other). Default: Add.
  type Decision = 'add' | 'leave' | 'exclude';
  const [decision, setDecision] = useState<Record<string, Decision>>({});
  const decOf = (k: string): Decision => decision[k] ?? 'add';
  const [, tick] = useState(0);
  // v7.577: the saved selection, so each row can say whether its keywords would still count
  const [hidden, setHidden] = useState<unknown[] | null>(null);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/hidden-categories`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(d => setHidden(Array.isArray(d?.hidden) ? d.hidden : [])).catch(() => setHidden(null));
  }, [projectId]);
  const outOfScope = (path: string[]): boolean | null => {
    if (!hidden) return null;
    const m = hiddenMatchers(hidden);
    return pathIsHidden(path, m) || ownIsOutOfScope(path.join(SEP).toLowerCase(), m);
  };
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
    setBusy({ label: `Reading ${ownCount.toLocaleString()} keywords and proposing ${sortingOther ? 'categories' : 'sub-categories'}`, startedAt: Date.now(), expectS: Math.min(180, 25 + Math.round(ownCount * 0.4)) });
    try { const d = await call({ step: 'propose', path: nodeKey.split(SEP) }); setP(d.proposal); setVolOf(d.volumes ?? {}); setMore({ truncated: Number(d.truncated ?? 0), reviewedBefore: Number(d.reviewedBefore ?? 0) }); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  /** The proposal as decided: only Add groups are created; Leave → General; Exclude → Other. */
  const finalProposal = (): Proposal | null => {
    if (!p) return null;
    const groups: Group[] = []; const stay = [...p.stay]; let stayVolume = p.stayVolume; const excluded: string[] = []; let exVol = 0;
    for (const g of p.groups) {
      const d = decOf(g.path.join(SEP));
      if (d === 'add') groups.push(g);
      else if (d === 'leave') { stay.push(...g.keywords); stayVolume += g.volume; }
      else { excluded.push(...g.keywords); exVol += g.volume; }
    }
    if (excluded.length > 0) {
      const oi = groups.findIndex(g => g.path.length === 1 && g.path[0] === 'Other');
      if (oi >= 0) groups[oi] = { ...groups[oi], keywords: [...groups[oi].keywords, ...excluded], volume: groups[oi].volume + exVol };
      else groups.push({ name: 'Other', path: ['Other'], existing: true, keywords: excluded, volume: exVol });
    }
    return { ...p, groups, stay, stayVolume };
  };
  const apply = async () => {
    const fp = finalProposal();
    if (!fp) return;
    if (fp.groups.length === 0) { setErr(`Nothing to apply — every group is set to Leave${sortingOther ? ', so these keywords stay in Other' : ''}. Click Cancel to close.`); return; }
    setErr(null); setBusy({ label: sortingOther ? 'Saving the new categories' : 'Saving the new sub-categories', startedAt: Date.now(), expectS: 10 });
    try { await call({ step: 'apply', proposal: fp }); window.location.reload(); } catch (e) { setErr((e as Error).message); setBusy(null); }
  };

  // review edits: fold one group into another, or back onto the parent — nothing is invented,
  // keywords and their stored volumes just move between the proposed groups
  const merge = (fromKey: string, toKey: string) => {
    if (!p) return;
    const from = p.groups.find(g => g.path.join(SEP) === fromKey);
    if (!from) return;
    const rest = p.groups.filter(g => g !== from);
    if (toKey === '__general') { setP({ ...p, groups: rest, stay: [...p.stay, ...from.keywords], stayVolume: p.stayVolume + from.volume }); return; }
    setP({ ...p, groups: rest.map(g => g.path.join(SEP) === toKey ? { ...g, keywords: [...g.keywords, ...from.keywords], volume: g.volume + from.volume } : g) });
  };
  // v7.577: keep a reused-category group as its OWN page under this category instead
  const makeOwn = (fromKey: string) => {
    if (!p) return;
    setP({ ...p, groups: p.groups.map(g => g.path.join(SEP) === fromKey ? { ...g, path: sortingOther ? [g.name] : [...p.node, g.name], existing: false } : g) });
  };
  // v7.577: drop one keyword — it goes to "Other" (out of every count unless Other is ticked)
  const dropKeyword = (fromKey: string, kw: string) => {
    if (!p) return;
    let groups = p.groups.map(g => g.path.join(SEP) === fromKey ? { ...g, keywords: g.keywords.filter(x => x !== kw), volume: g.volume - (g.keywords.includes(kw) ? (volOf[kw] ?? 0) : 0) } : g);
    const oi = groups.findIndex(g => g.path.length === 1 && g.path[0] === 'Other');
    if (oi >= 0) groups[oi] = { ...groups[oi], keywords: [...groups[oi].keywords, kw], volume: groups[oi].volume + (volOf[kw] ?? 0) };
    else groups = [...groups, { name: 'Other', path: ['Other'], existing: true, keywords: [kw], volume: volOf[kw] ?? 0 }];
    setP({ ...p, groups: groups.filter(g => g.keywords.length > 0) });
  };
  const el = busy ? Math.round((Date.now() - busy.startedAt) / 1000) : 0;
  const btn = (primary: boolean) => ({ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 7, cursor: busy ? 'wait' : 'pointer',
    background: primary ? 'var(--c-6c63ff)' : 'transparent', color: primary ? 'var(--on-fill-accent)' : 'var(--c-c8c8e8)', border: primary ? '1px solid var(--c-6c63ff)' : '1px solid var(--c-2a2a40)' }) as const;
  const fp = finalProposal();
  const created = fp ? fp.groups.filter(g => !g.existing).length : 0;
  const nLeave = p ? p.groups.filter(g => decOf(g.path.join(SEP)) === 'leave').reduce((n, g) => n + g.keywords.length, 0) : 0;
  const nExcl = p ? p.groups.filter(g => decOf(g.path.join(SEP)) === 'exclude').reduce((n, g) => n + g.keywords.length, 0) : 0;
  const moved = p ? p.groups.filter(g => decOf(g.path.join(SEP)) === 'add').reduce((n, g) => n + g.keywords.length, 0) : 0;
  // v7.581 wording: under Other a new group is a top-level category and "stay" means stay in Other
  const unit = sortingOther ? (created === 1 ? 'category' : 'categories') : (created === 1 ? 'page' : 'pages');
  const stayWhere = sortingOther ? 'in Other' : `on \u201cGeneral ${p ? p.node.slice(-1)[0] : ''}\u201d`;
  const choices: Decision[] = sortingOther ? ['add', 'leave'] : ['add', 'leave', 'exclude'];

  return (
    <div data-split-panel style={{ margin: '4px 8px 8px 46px', padding: '10px 12px', border: '1px solid var(--c-1e1e34)', borderLeft: '3px solid var(--c-6c63ff)', borderRadius: '0 9px 9px 0', background: 'var(--c-0c0c16)', fontSize: 11.5, color: 'var(--c-c8c8e8)' }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{sortingOther ? <>Sort &ldquo;Other&rdquo; into new categories</> : <>Split &ldquo;{nodeKey.split(SEP).slice(-1)[0]}&rdquo; into page-level sub-categories</>}</div>
      {!p && sortingOther && <div data-sort-other-intro style={{ lineHeight: 1.5, color: 'var(--c-8a8aa8)' }}>These keywords were filed to Other because no category fitted them, so they count nowhere. The AI model proposes new top-level categories for the ones that belong on the site (and reuses an existing category when one fits); the rest stay in Other. You review every group before anything changes, and only the groups you Add are created. One AI call, logged in API Usage.</div>}
      {!p && !sortingOther && <div style={{ lineHeight: 1.5, color: 'var(--c-8a8aa8)' }}>Its {ownCount.toLocaleString()} keywords sit in one category, so they can only map to one page. The AI model proposes sub-categories (each one a page Google would rank on its own), reusing any category that already exists in the tree. You review the groups before anything changes. One AI call, logged in API Usage.</div>}
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
          <div data-split-summary style={{ color: 'var(--c-8a8aa8)', marginBottom: 4 }}>{created} new {unit} · {moved.toLocaleString()} keywords move · {(p.stay.length + nLeave).toLocaleString()} stay {stayWhere}{nExcl > 0 ? ` · ${nExcl.toLocaleString()} excluded (moved to Other)` : ''}</div>
          {sortingOther && more && (more.truncated > 0 || more.reviewedBefore > 0) && (
            <div data-sort-other-more style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', marginBottom: 4 }}>
              {more.truncated > 0 ? `This run reads the ${p.groups.reduce((n, g) => n + g.keywords.length, 0) + p.stay.length} highest-volume keywords; ${more.truncated.toLocaleString()} more are still in Other — run Sort again after applying.` : ''}
              {more.reviewedBefore > 0 ? ` ${more.reviewedBefore.toLocaleString()} keyword${more.reviewedBefore === 1 ? ' was' : 's were'} reviewed by an earlier sort and left in Other.` : ''}
            </div>
          )}
          {sortingOther ? (
            <div style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', marginBottom: 6 }}>For each group: <b>Add</b> creates it as a new top-level category (or moves it to the category shown) &middot; <b>Leave</b> keeps its keywords in Other.</div>
          ) : (
          <div style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', marginBottom: 6 }}>For each group: <b>Add</b> creates it (or moves it to the category shown) · <b>Leave</b> makes no page — its keywords stay in {p.node.slice(-1)[0]} as they are now · <b>Exclude</b> takes its keywords out of scope.</div>
          )}
          {p.groups.map(g => {
            const k = g.path.join(SEP);
            return (
              <div key={k} data-split-group style={{ borderBottom: '1px dashed var(--c-1e1e34)', padding: '3px 0', opacity: decOf(k) === 'add' ? 1 : 0.55 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <button onClick={() => setOpen(open === k ? null : k)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--c-e8e8ff)', fontWeight: 700, fontSize: 11.5, textAlign: 'left' }}>{open === k ? '▾' : '▸'} {g.name}</button>
                  {g.existing && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--c-34d399)' }} title={k}>REUSES EXISTING · {k}</span>}
                  {!g.existing && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--c-9b96ff)' }}>{sortingOther ? 'NEW CATEGORY' : 'NEW PAGE'}</span>}
                  {outOfScope(g.path) === true && <span data-split-out style={{ fontSize: 9, fontWeight: 800, color: 'var(--c-f87171)' }} title="This category is unticked in Step 2">OUT OF YOUR SCOPE — these keywords stop counting</span>}
                  <span style={{ marginLeft: 'auto', color: 'var(--c-8a8aa8)', fontVariantNumeric: 'tabular-nums' }}>{g.keywords.length} kw · {fmtVol(g.volume)}/mo</span>
                  <span data-split-decision={k} style={{ display: 'inline-flex', border: '1px solid var(--c-2a2a40)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                    {choices.map(d => {
                      const on = decOf(k) === d;
                      const col = d === 'add' ? 'var(--c-34d399)' : d === 'leave' ? 'var(--c-9b96ff)' : 'var(--c-f87171)';
                      return (
                        <button key={d} data-split-choice={d} disabled={!!busy} onClick={() => setDecision(prev => ({ ...prev, [k]: d }))}
                          title={d === 'add' ? 'Create this group (or move it to the category shown)' : d === 'leave' ? (sortingOther ? 'Keywords stay in Other' : `No page — keywords stay in ${p.node.slice(-1)[0]}`) : 'Take these keywords out of scope (move to Other)'}
                          style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', border: 'none', cursor: 'pointer', background: on ? 'var(--c-14142a)' : 'transparent', color: on ? col : 'var(--c-8a8aa8)', boxShadow: on ? `inset 0 -2px 0 ${col}` : 'none' }}>
                          {d === 'add' ? 'Add' : d === 'leave' ? 'Leave' : 'Exclude'}
                        </button>
                      );
                    })}
                  </span>
                  <select data-split-merge={k} value="" disabled={!!busy} onChange={e => { const v = e.target.value; if (!v) return; if (v === '__own') makeOwn(k); else merge(k, v); }}
                    title="Keep as its own page, or fold it into another group"
                    style={{ fontSize: 10, background: 'var(--c-0a0a14)', color: 'var(--c-c8c8e8)', border: '1px solid var(--c-2a2a40)', borderRadius: 5, padding: '1px 3px', maxWidth: 150 }}>
                    <option value="">More…</option>
                    {g.existing && !(g.path.length === 1 && g.path[0] === 'Other') && <option value="__own">{sortingOther ? 'Make it its own new category' : `Make it its own new page under ${p.node.slice(-1)[0]}`}</option>}
                    {p.groups.filter(o => o !== g).map(o => <option key={o.path.join(SEP)} value={o.path.join(SEP)}>Merge into {o.name}</option>)}
                  </select>
                </div>
                {open === k && (
                  <div style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', padding: '2px 0 4px 14px', lineHeight: 1.7, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                    {g.keywords.map(kw => (
                      <span key={kw} data-split-kw style={{ whiteSpace: 'nowrap' }}>{kw}{!(g.path.length === 1 && g.path[0] === 'Other') && (
                        <button data-split-drop={kw} onClick={() => dropKeyword(k, kw)} title="Leave this keyword out (moves to Other)"
                          style={{ marginLeft: 3, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--c-f87171)', fontWeight: 800, fontSize: 10 }}>✕</button>
                      )}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {p.rejected.length > 0 && <div style={{ fontSize: 10.5, color: 'var(--c-8a8aa8)', marginTop: 4 }}>Kept on the parent: {p.rejected.map(r => `${r.name} (${r.reason})`).join('; ')}.</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!p && <button data-split-propose disabled={!!busy} onClick={() => void propose()} style={btn(true)}>{busy ? 'Working…' : sortingOther ? 'Propose categories' : 'Propose sub-categories'}</button>}
        {p && <button data-split-apply disabled={!!busy} onClick={() => void apply()} style={btn(true)}>{busy ? 'Saving…' : `Apply · create ${created} new ${unit}`}</button>}
        {p && <button disabled={!!busy} onClick={() => { setP(null); void propose(); }} style={btn(false)}>Propose again</button>}
        <button disabled={!!busy} onClick={onClose} style={btn(false)}>Cancel</button>
        {err && <span style={{ color: 'var(--c-f87171)' }}>{err}</span>}
      </div>
      {p && sortingOther && <div style={{ fontSize: 10, color: 'var(--c-8a8aa8)', marginTop: 6 }}>Groupings and names are the AI model&rsquo;s proposal; keyword volumes are the stored Semrush figures. A new category is in scope as soon as it is created (untick it in Step 2 to leave it out), gets its own page match automatically, and is kept on the next Refresh Analysis. Every change is logged in the Keyword panel&rsquo;s merge log.</div>}
      {p && !sortingOther && <div style={{ fontSize: 10, color: 'var(--c-8a8aa8)', marginTop: 6 }}>Groupings and names are the AI model&rsquo;s proposal; keyword volumes are the stored Semrush figures. After applying, each sub-category gets its own page match automatically, and any with no matching client page shows as a page to build. The change is logged in the Keyword panel&rsquo;s merge log and kept on the next Refresh Analysis.</div>}
    </div>
  );
}
