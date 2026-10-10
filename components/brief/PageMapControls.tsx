'use client';
/**
 * components/brief/PageMapControls.tsx — v7.549
 *
 * The page-map surfaces inside Product Insights:
 *   PageMapCard   status of the AUTOMATIC page map (inventory, intent labels, node matches,
 *                 live step progress) + re-map controls. Nothing here has to be pressed for
 *                 the map to exist — it builds on load (lib/pages/usePageMap.ts).
 *   PageLine      the "your page" line of a node / topic row: the resolved page, HOW it was
 *                 decided (chip), the measured ranking evidence beside it, a "same page as …"
 *                 note when another row on screen resolves to the same URL, and Set page.
 *   PagePicker    Set page: the mapped page, the pages that rank for the row's keywords, the
 *                 whole inventory searchable by text, or any URL on the client host. Stored
 *                 on the project (/page-overrides) and labelled "set by you" everywhere.
 *
 * Every colour is a theme token (var(--c-*) / var(--ca-*)) — both themes (Const VII).
 */

import { useEffect, useMemo, useState } from 'react';
import { MAP_REVIEW_BELOW, PAGE_TYPE_LABEL, basisLabelAll, pageMatches, type PageBasisAll, type PageMapInventory } from '@/lib/pages/pageMap';
import type { PageCandidate } from '@/lib/pages/electPage';
import type { PageMapState } from '@/lib/pages/usePageMap';

const chip = (tone: 'green' | 'amber' | 'red' | 'acc' | 'mute' | 'cyan', text: string, title?: string) => {
  const c = {
    green: ['var(--ca-52-211-153-0_08)', 'var(--c-34d399)', 'var(--ca-52-211-153-0_3)'],
    amber: ['var(--ca-245-158-11-0_08)', 'var(--c-f59e0b)', 'var(--ca-245-158-11-0_3)'],
    red:   ['var(--ca-248-113-113-0_1)', 'var(--c-f87171)', 'var(--ca-248-113-113-0_2)'],
    acc:   ['var(--ca-108-99-255-0_12)', 'var(--c-9b96ff)', 'var(--ca-108-99-255-0_25)'],
    cyan:  ['transparent', 'var(--c-46cce0)', 'var(--c-2a2a40)'],
    mute:  ['transparent', 'var(--c-55557a)', 'var(--c-2a2a40)'],
  }[tone];
  return <span title={title} style={{ fontSize: '8.5px', fontWeight: 800, letterSpacing: '0.05em', padding: '1px 5px', borderRadius: '5px', background: c[0], color: c[1], border: `1px solid ${c[2]}`, whiteSpace: 'nowrap' }}>{text}</span>;
};

const fmtVol = (v: number): string => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v);
const pathOf = (u: string): string => u.replace(/^https?:\/\/[^/]*/, '') || '/';

export function basisTone(b: PageBasisAll, mapStatus?: string): 'green' | 'amber' | 'red' | 'acc' | 'mute' | 'cyan' {
  if (b === 'override') return 'cyan';
  if (b === 'map') return 'green';
  if (b === 'none') return mapStatus === 'none' ? 'red' : 'mute';
  return mapStatus === 'review' ? 'amber' : 'mute';
}

export const basisTitle = (b: PageBasisAll, mapStatus?: string, confidence?: number | null): string => {
  switch (b) {
    case 'override': return 'You set this page; it overrides the automatic page map on every panel and in the PDF.';
    case 'map':      return `Matched by the page map: the page on the site whose intent and theme fit this cluster (Claude-labelled, confidence ${confidence ?? '—'}). The ranking figures beside it are measured.`;
    case 'none':     return mapStatus === 'none' ? 'The page map found no page on the site about this theme at this level — a page to build. Ranking pages for these keywords are about other themes.' : 'No client page ranks for these keywords.';
    default:         return mapStatus === 'review' ? `The page map's match was below ${MAP_REVIEW_BELOW} confidence, so the page that ranks for these keywords is shown instead — review it or set the page.` : mapStatus === 'pending' ? 'The page map has not reached this node yet — the page that ranks for its keywords is shown meanwhile.' : 'The page that holds the most ranked volume on these keywords (no intent match available).';
  }
};

// ─── status card ─────────────────────────────────────────────────────────────

export function PageMapCard({ pm, onRemap }: { pm: PageMapState; onRemap?: () => void }) {
  const st = pm.status;
  const [confirm, setConfirm] = useState<'map' | 'all' | null>(null);
  const head = (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
      <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-9b96ff)' }}>PAGE MAP · AUTOMATIC</div>
      {st && st.phase === 'done' && !pm.running && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setConfirm('map')} style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>re-match pages</button>
          <button onClick={() => setConfirm('all')} style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>rebuild inventory</button>
        </div>
      )}
    </div>
  );
  const wrap = (body: React.ReactNode) => (
    <div data-pi-page-map style={{ padding: '10px 12px', background: 'var(--c-0a0a14)', border: '1px solid var(--ca-108-99-255-0_25)', borderRadius: '8px', marginBottom: '10px' }}>{head}{body}</div>
  );
  if (!st) return wrap(<div style={{ fontSize: '10.5px', color: 'var(--c-8a8aa8)' }}>Reading the page map…</div>);
  const inv = st.inventory;
  const n = st.nodes;
  const phaseText: Record<string, string> = { inventory: 'reading the sitemap and ranking pages', fetch: 'reading page titles', label: 'labelling page types', map: 'matching clusters to pages', done: 'done' };
  const prog = pm.progress;
  return wrap(
    <>
      {(pm.running || st.running) && (
        <div style={{ fontSize: '10.5px', color: 'var(--c-e8e8ff)', marginBottom: '6px' }}>
          <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--c-9b96ff)', marginRight: '6px' }} />
          Mapping pages — {phaseText[prog?.phase ?? st.phase] ?? st.phase}{prog && prog.total > 0 ? ` · ${prog.done.toLocaleString()} of ${prog.total.toLocaleString()} this step` : ''}{prog && prog.remaining > 0 ? ` · ${prog.remaining.toLocaleString()} left` : ''}
          <span style={{ color: 'var(--c-8a8aa8)' }}> · runs by itself; the rows below update as it completes</span>
        </div>
      )}
      {pm.error && <div style={{ fontSize: '10.5px', color: 'var(--c-f87171)', marginBottom: '6px' }}>{pm.error}</div>}
      {!pm.error && st.lastError && !pm.running && <div style={{ fontSize: '10px', color: 'var(--c-f59e0b)', marginBottom: '6px' }}>Last run reported: {st.lastError}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '10.5px', color: 'var(--c-c8c8e8)' }}>
        <span>
          <b style={{ color: 'var(--c-e8e8ff)' }}>{inv ? inv.pages.toLocaleString() : 0}</b> pages in inventory
          {inv && <span style={{ color: 'var(--c-8a8aa8)' }}> · sitemap {inv.sitemapKept.toLocaleString()}{inv.sitemapTotal > inv.sitemapKept ? ` of ${inv.sitemapTotal.toLocaleString()}` : ''} · ranking {inv.rankingTotal.toLocaleString()}{inv.capped ? ' · capped' : ''}</span>}
        </span>
        {inv && <span><b style={{ color: 'var(--c-e8e8ff)' }}>{inv.labeled.toLocaleString()}</b> typed{inv.fetchFailed > 0 ? <span style={{ color: 'var(--c-8a8aa8)' }}> · {inv.fetchFailed.toLocaleString()} page{inv.fetchFailed === 1 ? '' : 's'} unreadable (typed by path)</span> : null}{st.pagesUnlabeled > 0 ? <span style={{ color: 'var(--c-f59e0b)' }}> · {st.pagesUnlabeled} untyped</span> : null}</span>}
        <span>
          <b style={{ color: 'var(--c-34d399)' }}>{n.mapped}</b> of {n.total} clusters matched
          {n.review > 0 && <span> · <b style={{ color: 'var(--c-f59e0b)' }}>{n.review}</b> review</span>}
          {n.none > 0 && <span> · <b style={{ color: 'var(--c-f87171)' }}>{n.none}</b> no page</span>}
          {n.pending > 0 && <span style={{ color: 'var(--c-8a8aa8)' }}> · {n.pending} pending</span>}
          {n.failed > 0 && <span style={{ color: 'var(--c-f59e0b)' }}> · {n.failed} failed</span>}
        </span>
      </div>
      {inv?.sitemapError && <div style={{ fontSize: '9.5px', color: 'var(--c-f59e0b)', marginTop: '4px' }}>Sitemap not readable ({inv.sitemapError}) — the inventory is the ranking pages only; hub pages that never rank for these keywords are not in it.</div>}
      {inv && Object.keys(inv.byType).length > 0 && (
        <div style={{ fontSize: '9.5px', color: 'var(--c-8a8aa8)', marginTop: '4px' }}>
          Page types: {Object.entries(inv.byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${PAGE_TYPE_LABEL[t as keyof typeof PAGE_TYPE_LABEL] ?? t}`).join(' · ')}
        </div>
      )}
      <div style={{ fontSize: '9px', color: 'var(--c-55557a)', marginTop: '5px', lineHeight: 1.35 }}>
        <b style={{ color: 'var(--c-8a8aa8)' }}>Basis.</b> Pages come from the site's own sitemap and from every URL the client ranks on; titles are read from the pages. Page types and cluster matches are labelled by Claude ({st.model}) with its own confidence — a match under {MAP_REVIEW_BELOW} is marked review and the ranking page is shown meanwhile. Labels are never shown as measured data; the ranking evidence beside each page (keywords, volume, best rank) is. A set page always wins.
      </div>
      {confirm && (
        <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '7px', background: 'var(--c-111120)', border: '1px solid var(--ca-245-158-11-0_3)', fontSize: '10.5px', color: 'var(--c-c8c8e8)' }}>
          {confirm === 'map' ? `Re-match every cluster to a page (${n.total} clusters, about ${Math.ceil(n.total / 8)} Claude calls). Pages you set are kept.` : `Rebuild the page inventory from the sitemap and re-read every page title, then re-type and re-match everything (${inv ? inv.pages.toLocaleString() : 0}+ page reads, about ${Math.ceil((inv?.pages ?? 0) / 40) + Math.ceil(n.total / 8)} Claude calls). Pages you set are kept.`}
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button onClick={() => { const f = confirm; setConfirm(null); void pm.run(f); onRemap?.(); }} style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', background: 'var(--ca-108-99-255-0_12)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_25)' }}>Run</button>
            <button onClick={() => setConfirm(null)} style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>Cancel</button>
          </div>
        </div>
      )}
    </>,
  );
}

// ─── the "your page" line ────────────────────────────────────────────────────

export interface PageLineProps {
  url:        string | null;
  basis:      PageBasisAll;
  mapStatus?: 'mapped' | 'review' | 'none' | 'pending';
  confidence?: number | null;
  evidence?:  { kw: number; vol: number; best: number | null };
  inheritedFrom?: string | null;
  sameAs?:    string[];              // other rows on screen resolved to the same URL
  bestPos?:   number | null;         // for the "ranking URL not in source rows" wording
  hrefFor:    (u: string | null | undefined) => string | null;
  linkStyle:  React.CSSProperties;
  onSetPage?: () => void;            // opens the picker (undefined = read-only surface)
  fontSize?:  string;
}

export function PageLine(p: PageLineProps) {
  const fs = p.fontSize ?? '9.5px';
  const label = basisLabelAll(p.basis, p.mapStatus);
  const tone = basisTone(p.basis, p.mapStatus);
  return (
    <div style={{ fontSize: fs, color: p.url ? 'var(--c-6a6a90)' : 'var(--c-55557a)', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', minWidth: 0 }}>
      {p.url
        ? <a href={p.hrefFor(p.url)!} target="_blank" rel="noopener noreferrer" style={{ ...p.linkStyle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }} onClick={e => e.stopPropagation()}>{pathOf(p.url)}</a>
        : <span>{p.basis === 'none' && p.mapStatus === 'none' ? 'no page about this theme' : p.bestPos != null ? 'ranking URL not in source rows' : 'no ranking page'}</span>}
      {label && chip(tone, label, basisTitle(p.basis, p.mapStatus, p.confidence))}
      {p.url && p.evidence && (p.evidence.kw > 0
        ? <span title="Measured: this row's keywords this page ranks for, their monthly volume, and the page's best position among them" style={{ color: 'var(--c-6a6a90)' }}>ranks {p.evidence.kw} kw · {fmtVol(p.evidence.vol)}/mo{p.evidence.best != null ? ` · best #${p.evidence.best}` : ''}</span>
        : <span title="Measured: none of this row's keywords rank on this page yet" style={{ color: 'var(--c-f59e0b)' }}>ranks 0 of these kw</span>)}
      {p.inheritedFrom && <span style={{ color: 'var(--c-f59e0b)' }} title="Nothing filed at this level ranks; this is the page of the sub-category named">via {p.inheritedFrom}</span>}
      {p.sameAs && p.sameAs.length > 0 && <span style={{ color: 'var(--c-f59e0b)' }} title="Another row in this view resolves to the same page — one page is carrying both">same page as {p.sameAs.slice(0, 2).join(', ')}{p.sameAs.length > 2 ? ` +${p.sameAs.length - 2}` : ''}</span>}
      {p.onSetPage && <button onClick={e => { e.stopPropagation(); p.onSetPage!(); }} title="Choose the page this row stands for (stored on the project, labelled 'set by you')" style={{ fontSize: '8.5px', fontWeight: 700, padding: '0 5px', borderRadius: '4px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)', lineHeight: '14px' }}>{p.basis === 'override' ? 'change' : 'set page'}</button>}
    </div>
  );
}

// ─── Set page picker ─────────────────────────────────────────────────────────

export interface PagePickerProps {
  projectId:   string;
  nodeKey:     string;               // taxonomy path ' › ' (override key)
  nodeName:    string;
  current:     string | null;
  basis:       PageBasisAll;
  mapUrl?:     string | null;
  candidates:  PageCandidate[];      // ranking evidence pages for this row
  inventory:   PageMapInventory | null;   // null while loading
  hrefFor:     (u: string | null | undefined) => string | null;
  onClose:     () => void;
  onChanged:   () => void;           // after a successful save / reset
}

export function PagePicker(p: PagePickerProps) {
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setQ(''); setCustom(''); setErr(null); }, [p.nodeKey]);

  const save = async (url: string | null) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${p.projectId}/page-overrides`, {
        method: url ? 'PUT' : 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(url ? { key: p.nodeKey, url } : { key: p.nodeKey }),
      });
      if (!res.ok) { let m = `HTTP ${res.status}`; try { const j = await res.json(); if (j?.error) m = typeof j.error === 'string' ? j.error : JSON.stringify(j.error); } catch { /* keep */ } setErr(m); return; }
      p.onChanged(); p.onClose();
    } catch (e) { setErr(String((e as any)?.message ?? e)); }
    finally { setBusy(false); }
  };

  const invPages = p.inventory?.pages ?? [];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const nodeTerms = useMemo(() => p.nodeName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 2), [p.nodeName]);
  const listed = useMemo(() => {
    const rows = terms.length ? invPages.filter(pg => pageMatches(pg, terms)) : invPages.filter(pg => nodeTerms.some(t => pageMatches(pg, [t])));
    return rows.slice(0, 40);
  }, [invPages, terms, nodeTerms]);

  const row = (url: string, note: React.ReactNode, key: string) => (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', borderBottom: '1px solid var(--c-1e1e34)', fontSize: '10px' }}>
      <a href={p.hrefFor(url)!} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-c8c8e8)', textDecoration: 'underline', textUnderlineOffset: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 auto', minWidth: 0 }} onClick={e => e.stopPropagation()}>{pathOf(url)}</a>
      <span style={{ color: 'var(--c-8a8aa8)', whiteSpace: 'nowrap', flexShrink: 0 }}>{note}</span>
      <button disabled={busy} onClick={() => void save(url)} style={{ fontSize: '9px', fontWeight: 700, padding: '1px 7px', borderRadius: '5px', cursor: 'pointer', background: 'var(--ca-108-99-255-0_12)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_25)', flexShrink: 0 }}>Use</button>
    </div>
  );
  const seen = new Set<string>();
  const uniq = (u: string) => { const k = u.toLowerCase().replace(/\/$/, ''); if (seen.has(k)) return false; seen.add(k); return true; };

  return (
    <div data-pi-page-picker onClick={e => e.stopPropagation()} style={{ margin: '4px 0 8px', padding: '10px 12px', background: 'var(--c-0a0a14)', border: '1px solid var(--ca-108-99-255-0_45)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
        <div style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--c-9b96ff)' }}>SET PAGE · {p.nodeName}</div>
        <button onClick={p.onClose} style={{ fontSize: '9.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>Close</button>
      </div>
      <div style={{ fontSize: '9px', color: 'var(--c-8a8aa8)', marginBottom: '6px' }}>
        The page you choose stands for this cluster on every panel and in the PDF, labelled "set by you". {p.current ? <>Current: <span style={{ color: 'var(--c-c8c8e8)' }}>{pathOf(p.current)}</span> ({basisLabelAll(p.basis)}).</> : 'No page is resolved for it now.'}
      </div>
      {p.mapUrl && p.mapUrl !== p.current && <div style={{ marginBottom: '2px' }}>{row(p.mapUrl, 'page map match', 'map')}</div>}
      {p.candidates.length > 0 && (
        <>
          <div style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--c-55557a)', margin: '6px 0 2px' }}>PAGES THAT RANK FOR THIS ROW'S KEYWORDS (measured)</div>
          {p.candidates.slice(0, 8).filter(c => uniq(c.url)).map(c => row(c.url, `${c.kw} kw · ${fmtVol(c.vol)}/mo · best #${c.best}`, 'c:' + c.norm))}
        </>
      )}
      <div style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--c-55557a)', margin: '8px 0 3px' }}>PAGE INVENTORY {p.inventory ? `(${invPages.length.toLocaleString()} pages)` : '(loading…)'}</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="search path, title or topic…" style={{ width: '100%', boxSizing: 'border-box', fontSize: '10.5px', padding: '4px 8px', borderRadius: '6px', background: 'var(--c-111120)', color: 'var(--c-e8e8ff)', border: '1px solid var(--c-2a2a40)', marginBottom: '4px' }} />
      {listed.length === 0 && p.inventory && <div style={{ fontSize: '10px', color: 'var(--c-8a8aa8)', padding: '3px 0' }}>No inventory page matches{terms.length ? ' that search' : ` "${p.nodeName}"`}. Search another word or enter a URL below.</div>}
      {listed.filter(pg => uniq(pg.url)).map(pg => row(pg.url, <>{pg.type ? PAGE_TYPE_LABEL[pg.type] : 'untyped'}{pg.topic ? ` · ${pg.topic}` : pg.title ? ` · ${pg.title.slice(0, 50)}` : ''}</>, 'i:' + pg.url))}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
        <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="or enter a page URL / path on the client site" style={{ flex: 1, fontSize: '10.5px', padding: '4px 8px', borderRadius: '6px', background: 'var(--c-111120)', color: 'var(--c-e8e8ff)', border: '1px solid var(--c-2a2a40)' }} />
        <button disabled={busy || !custom.trim()} onClick={() => void save(custom)} style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', background: 'var(--ca-108-99-255-0_12)', color: 'var(--c-9b96ff)', border: '1px solid var(--ca-108-99-255-0_25)' }}>Save</button>
        {p.basis === 'override' && <button disabled={busy} onClick={() => void save(null)} style={{ fontSize: '9.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-8a8aa8)', border: '1px solid var(--c-2a2a40)' }}>Back to automatic</button>}
      </div>
      {err && <div style={{ fontSize: '10px', color: 'var(--c-f87171)', marginTop: '4px' }}>{err}</div>}
    </div>
  );
}
