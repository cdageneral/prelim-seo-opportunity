'use client';

/**
 * /scout — the Scout screen (v7.513).
 *
 * A quick prospect snapshot that lives OUTSIDE projects (Wayne, 2026-09-21):
 * enter a domain, choose full domain or up to three products, confirm up to four
 * competitors (Semrush suggestions and/or typed by hand), run, download the PDF.
 * v7.515: any run can be loaded back into the form to add or remove competitors, then
 * saved as a setup (SAVED, nothing spent) or run again as a NEW report — the original
 * report is never overwritten. Runs can be deleted.
 * One scrolling root (Const IV.1). The run shows "step X of 6", what it is doing,
 * elapsed time and — once real runs exist — an ETA from their median (IV.2/IV.3).
 * Theme-mapped orbit-* tokens only, so light and dark both hold (IV.6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { unitCeiling, isPublisherDomain } from '@/lib/scout/config';

interface Access {
  user: { id: string; name: string; role: string } | null;
  orbit: boolean; scout: boolean; cap: number | null; usedToday: number; isAdmin: boolean; canWrite: boolean;
  timing: { seconds: number; runs: number } | null; aiRead: boolean;
  limits: { competitors: number; products: number };
  industries: Array<{ key: string; label: string }>;
  markets: Array<{ code: string; label: string }>;
}
interface Suggestion { domain: string; commonKeywords: number; organicKeywords: number; publisher: boolean }
interface Picked { domain: string; manual: boolean; note?: string; publisher?: boolean }
interface Run {
  id: string; userName: string | null; domain: string; market: string; industry: string; scope: string; products: string[];
  competitors: Array<{ domain: string; manual: boolean }>; status: string; step: number; stepsTotal: number;
  stepLabel: string | null; startedAt: string | null; finishedAt: string | null; error: string | null;
  headline: string | null; units: number | null; projectId: string | null; createdAt: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft:      { label: 'SAVED',            cls: 'bg-orbit-accent/10 text-orbit-accent border-orbit-accent/30' },
  ready:      { label: 'READY',            cls: 'bg-orbit-green/10 text-orbit-green border-orbit-green/30' },
  no_opening: { label: 'NO CLEAR OPENING', cls: 'bg-orbit-amber/10 text-orbit-amber border-orbit-amber/30' },
  thin:       { label: 'THIN DATA',        cls: 'bg-orbit-amber/10 text-orbit-amber border-orbit-amber/30' },
  failed:     { label: 'FAILED',           cls: 'bg-orbit-red/10 text-orbit-red border-orbit-red/30' },
  running:    { label: 'RUNNING',          cls: 'bg-orbit-accent/10 text-orbit-accent border-orbit-accent/30' },
  queued:     { label: 'QUEUED',           cls: 'bg-orbit-accent/10 text-orbit-accent border-orbit-accent/30' },
};
const fmtSecs = (s: number) => s < 60 ? `${Math.max(0, Math.round(s))}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const label = 'block font-mono text-[10px] uppercase tracking-wider text-orbit-tertiary mb-1.5';
const input = 'w-full rounded-lg border border-orbit-border bg-orbit-surface px-3 py-2.5 text-sm text-orbit-primary placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent';

export default function ScoutPage() {
  const [access, setAccess] = useState<Access | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [market, setMarket] = useState('us');
  const [industry, setIndustry] = useState('other');
  const [scope, setScope] = useState<'domain' | 'products'>('domain');
  const [products, setProducts] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestedFor, setSuggestedFor] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [manual, setManual] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<{ run: Run; timing: Access['timing']; skew: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  // v7.515 — the run whose setup is loaded in the form (a SAVED draft is edited in place; anything else is a template for a new run)
  const [editing, setEditing] = useState<{ id: string; status: string; domain: string; createdAt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const awaitingClaim = useRef(false);   // a SAVED setup reads 'draft' until the execute request claims it

  const loadRuns = useCallback(async () => {
    const res = await fetch('/api/scout/runs', { cache: 'no-store' });
    if (res.ok) setRuns((await res.json()).runs ?? []);
  }, []);
  const loadAccess = useCallback(async () => {
    const res = await fetch('/api/scout/access', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setDenied(data.error ?? 'Not signed in'); return; }
    setAccess(data);
    if (!data.scout) setDenied('Your account does not have Scout access. Ask an admin to turn it on.');
  }, []);

  useEffect(() => { loadAccess(); }, [loadAccess]);
  useEffect(() => { if (access?.scout) loadRuns(); }, [access?.scout, loadRuns]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const maxC = access?.limits.competitors ?? 4, maxP = access?.limits.products ?? 3;
  // v7.515 — the ceiling is priced for the actual count with the same function the run checks against.
  const ceiling = useMemo(() => access ? unitCeiling(scope, picked.length, Math.max(1, products.length)) : null, [access, picked.length, products.length, scope]);
  const capLeft = access && access.cap !== null ? Math.max(0, access.cap - access.usedToday) : null;

  async function suggest() {
    setError(null);
    const d = domain.trim(); if (!d) { setError('Enter the prospect domain first.'); return; }
    setSuggesting(true);
    const res = await fetch('/api/scout/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: d, market }) });
    const data = await res.json().catch(() => ({}));
    setSuggesting(false);
    if (!res.ok) { setError(data.error ?? 'Could not read competitors from Semrush.'); return; }
    setSuggestions(data.suggestions ?? []); setSuggestedFor(data.domain ?? d);
    // v7.515 — keep what is already selected (an edited run's competitors must survive a refresh); "Remove all" clears.
  }
  function toggle(s: Suggestion) {
    setPicked(prev => prev.some(p => p.domain === s.domain) ? prev.filter(p => p.domain !== s.domain)
      : prev.length >= maxC ? prev : [...prev, { domain: s.domain, manual: false, publisher: s.publisher }]);
  }
  async function addManual() {
    setError(null);
    const c = manual.trim(); if (!c) return;
    if (!domain.trim()) { setError('Enter the prospect domain first.'); return; }
    if (picked.length >= maxC) { setError(`Up to ${maxC} competitors per run. Remove one first.`); return; }
    setChecking(true);
    const res = await fetch('/api/scout/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: domain.trim(), market, check: c }) });
    const data = await res.json().catch(() => ({}));
    setChecking(false);
    if (!res.ok) { setError(data.error ?? 'Could not check that domain.'); return; }
    const k = data.competitor;
    if (picked.some(p => p.domain === k.domain)) { setManual(''); return; }
    setPicked(prev => [...prev, { domain: k.domain, manual: true, publisher: k.publisher,
      note: k.found ? `${Number(k.organicKeywords).toLocaleString()} organic keywords in Semrush` : 'Semrush has no organic data for this domain — it will add nothing to the report' }]);
    setManual('');
  }
  function addProduct() {
    const p = productDraft.trim(); if (!p) return;
    if (products.length >= maxP) { setError(`Up to ${maxP} products per run.`); return; }
    if (!products.some(x => x.toLowerCase() === p.toLowerCase())) setProducts([...products, p]);
    setProductDraft('');
  }

  async function watch(id: string) {
    if (poll.current) clearInterval(poll.current);
    const tick = async () => {
      const res = await fetch(`/api/scout/runs/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setActive({ run: data.run, timing: data.timing ?? null, skew: Date.now() - new Date(data.serverNow).getTime() });
      if (data.run.status !== 'draft') awaitingClaim.current = false;
      if (data.run.status !== 'queued' && data.run.status !== 'running' && !(data.run.status === 'draft' && awaitingClaim.current)) {
        if (poll.current) clearInterval(poll.current);
        poll.current = null; setBusy(false); loadRuns(); loadAccess();
      }
    };
    await tick();
    poll.current = setInterval(tick, 2500);
  }

  const setupBody = (draft: boolean) => JSON.stringify({ domain: domain.trim(), market, industry, scope, products, draft, competitors: picked.map(p => ({ domain: p.domain, manual: p.manual })) });
  function checkSetup(): boolean {
    if (!domain.trim()) { setError('Enter the prospect domain.'); return false; }
    if (!picked.length) { setError('Pick at least one competitor — suggest them from Semrush or add one by hand.'); return false; }
    if (scope === 'products' && !products.length) { setError('Add at least one product, or switch to Full domain.'); return false; }
    return true;
  }
  /** Save the setup without running it. A loaded SAVED setup is updated in place; anything else becomes a new SAVED row. */
  async function saveSetup(): Promise<string | null> {
    const inPlace = editing?.status === 'draft';
    const res = await fetch(inPlace ? `/api/scout/runs/${editing!.id}` : '/api/scout/runs', { method: inPlace ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: setupBody(true) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not save the setup.'); return null; }
    return String(data.id);
  }
  async function save() {
    setError(null); setNotice(null);
    if (!checkSetup()) return;
    setSaving(true);
    const id = await saveSetup();
    setSaving(false);
    if (!id) return;
    setEditing({ id, status: 'draft', domain: domain.trim(), createdAt: new Date().toISOString() });
    setNotice(`Saved. It's in Recent scouts as SAVED — edit it or run it from there, or keep changing it here.`);
    loadRuns();
  }
  async function start() {
    setError(null); setNotice(null);
    if (!checkSetup()) return;
    setBusy(true);
    let id: string | null;
    if (editing?.status === 'draft') id = await saveSetup();     // run the saved setup itself, with any edits made here
    else {
      const res = await fetch('/api/scout/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: setupBody(false) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not start the run.'); id = null; } else id = String(data.id);
    }
    if (!id) { setBusy(false); return; }
    setEditing(null);
    execute(id);
  }
  /** Fire the run (the request stays open for the whole run) and poll its row for progress. */
  function execute(id: string) {
    awaitingClaim.current = true;
    fetch(`/api/scout/runs/${id}/execute`, { method: 'POST' }).then(async r => {
      if (r.status === 429 || r.status === 403 || r.status === 404) {
        const d = await r.json().catch(() => ({}));
        awaitingClaim.current = false; if (poll.current) clearInterval(poll.current); poll.current = null;
        setBusy(false); setActive(null); setError(d.error ?? 'Could not start the run.'); loadRuns();
      }
    }).catch(() => { /* the poller reports the outcome */ });
    watch(id);
  }
  /** Load any run's setup into the form: add or remove competitors, then save or run again. */
  function loadIntoForm(r: Run) {
    setError(null); setNotice(null); setConfirmDel(null);
    setDomain(r.domain); setMarket(r.market || 'us'); setIndustry(r.industry || 'other');
    setScope(r.scope === 'products' ? 'products' : 'domain'); setProducts(r.products ?? []); setProductDraft('');
    setPicked(r.competitors.map(c => ({ domain: c.domain, manual: c.manual, publisher: isPublisherDomain(c.domain), note: c.manual ? 'added by hand' : undefined })));
    if (suggestedFor !== r.domain) { setSuggestions(null); setSuggestedFor(''); }
    setEditing({ id: r.id, status: r.status, domain: r.domain, createdAt: r.createdAt });
    document.querySelector('[data-scout-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function clearForm() {
    setEditing(null); setNotice(null); setError(null); setDomain(''); setScope('domain'); setProducts([]); setPicked([]);
    setSuggestions(null); setSuggestedFor(''); setManual('');
  }
  async function remove(r: Run) {
    setDeleting(r.id); setError(null);
    const res = await fetch(`/api/scout/runs/${r.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setDeleting(null); setConfirmDel(null);
    if (!res.ok) { setError(data.error ?? 'Could not delete the run.'); return; }
    if (editing?.id === r.id) setEditing(prev => prev && prev.status === 'draft' ? null : prev);
    if (active?.run.id === r.id) setActive(null);
    loadRuns();
  }
  function runSaved(r: Run) {
    loadIntoForm(r); setEditing(null); setBusy(true);
    execute(r.id);
  }

  async function download(r: Run) {
    setDownloading(r.id); setError(null);
    try {
      const res = await fetch(`/api/scout/runs/${r.id}/pdf`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'PDF failed'); }
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `iq-impact-snapshot-${r.domain}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { setError(e instanceof Error ? e.message : 'PDF failed'); }
    setDownloading(null);
  }
  async function convert(r: Run) {
    setConverting(r.id); setError(null);
    const res = await fetch(`/api/scout/runs/${r.id}/convert`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setConverting(null);
    if (!res.ok) { setError(data.error ?? 'Could not create the project.'); return; }
    window.location.href = `/projects/${data.projectId}`;
  }
  async function signOut() { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/sign-in'; }

  const ar = active?.run;
  const running = !!ar && (ar.status === 'queued' || ar.status === 'running' || (ar.status === 'draft' && busy));
  const elapsed = ar?.startedAt ? Math.max(0, (now - (active?.skew ?? 0) - new Date(ar.startedAt).getTime()) / 1000) : 0;
  const eta = active?.timing ? Math.max(0, active.timing.seconds - elapsed) : null;

  return (
    <div className="h-screen flex flex-col bg-orbit-bg">
      <nav className="shrink-0 border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <span className="text-xl font-bold gradient-text">OrbitIQ</span>
            <div className="flex rounded-lg border border-orbit-border bg-orbit-bg p-0.5 text-sm font-medium">
              {access?.orbit
                ? <Link href="/dashboard" className="px-3.5 py-1.5 rounded-md text-orbit-secondary hover:text-orbit-primary">Orbit · Projects</Link>
                : <span className="px-3.5 py-1.5 rounded-md text-orbit-tertiary cursor-not-allowed" title="Your account does not have Orbit access">Orbit · Projects</span>}
              <span className="px-3.5 py-1.5 rounded-md bg-orbit-accent text-[color:var(--on-fill-accent)]">Scout</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {access?.user && <button onClick={signOut} title={`${access.user.name} · sign out`} className="text-sm px-3 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary transition-colors">Sign out</button>}
          </div>
        </div>
      </nav>

      <main className="flex-1 min-h-0 overflow-y-auto" data-scout-scroll>
        <div className="max-w-6xl mx-auto px-6 py-8">
          {denied ? (
            <div className="orbit-card p-10 text-center">
              <p className="text-orbit-primary font-semibold mb-1">Scout isn't available on this account</p>
              <p className="text-sm text-orbit-secondary">{denied}</p>
              {access?.orbit && <Link href="/dashboard" className="inline-block mt-4 text-sm text-orbit-accent hover:underline">Back to projects</Link>}
            </div>
          ) : !access ? (
            <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-orbit-card animate-pulse" />)}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <section className="orbit-card p-6">
                <h1 className="text-xl font-bold text-orbit-primary">Scout a prospect</h1>
                <p className="text-sm text-orbit-secondary mt-1 mb-5">Enter a domain. Scout reads live search and AI-answer data, finds the single strongest opening, and builds a client-ready PDF.</p>
                {editing && (
                  <div className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-orbit-accent/40 bg-orbit-accent/10 px-3.5 py-2.5 text-xs text-orbit-secondary" data-scout-editing>
                    <span>{editing.status === 'draft'
                      ? <><b className="text-orbit-primary">Editing a saved setup</b> · {editing.domain}. Save keeps your changes on it; Run Scout runs it.</>
                      : <><b className="text-orbit-primary">Starting from the {fmtDate(editing.createdAt)} run</b> of {editing.domain}. That report stays as it is — saving or running here creates a new one.</>}</span>
                    <button type="button" onClick={clearForm} disabled={running} className="shrink-0 font-semibold text-orbit-accent hover:underline disabled:opacity-50">Start fresh</button>
                  </div>
                )}

                <label className={label}>Prospect domain</label>
                <input className={`${input} text-base py-3`} placeholder="prospect.com" value={domain} disabled={running}
                  onChange={e => { setDomain(e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') suggest(); }} />

                <label className={`${label} mt-5`}>What should Scout look at?</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([['domain', 'Full domain', 'Everything the site competes for. Scout picks the strongest opening across all themes.'],
                     ['products', 'Specific products', `Only the product lines you name, up to ${maxP}.`]] as const).map(([k, t, d]) => (
                    <button key={k} type="button" disabled={running} onClick={() => setScope(k)}
                      className={`text-left rounded-lg border px-3.5 py-3 transition-colors ${scope === k ? 'border-orbit-accent bg-orbit-accent/10' : 'border-orbit-border bg-orbit-surface hover:border-orbit-accent/40'}`}>
                      <span className="block text-sm font-semibold text-orbit-primary">{t}</span>
                      <span className="block text-xs text-orbit-secondary mt-0.5">{d}</span>
                    </button>
                  ))}
                </div>
                {scope === 'products' && (
                  <div className="mt-2.5">
                    <div className="flex flex-wrap gap-1.5 rounded-lg border border-orbit-border bg-orbit-surface p-2">
                      {products.map(p => (
                        <span key={p} className="inline-flex items-center gap-1.5 rounded-md bg-orbit-accent text-[color:var(--on-fill-accent)] text-xs font-semibold px-2 py-1">
                          {p}<button type="button" aria-label={`Remove ${p}`} onClick={() => setProducts(products.filter(x => x !== p))}>✕</button>
                        </span>
                      ))}
                      <input className="flex-1 min-w-[180px] bg-transparent text-sm text-orbit-primary placeholder:text-orbit-tertiary focus:outline-none px-1"
                        placeholder={products.length >= maxP ? `${maxP} products max` : 'Type a product and press Enter'} value={productDraft} disabled={products.length >= maxP || running}
                        onChange={e => setProductDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); } }} onBlur={addProduct} />
                    </div>
                    <p className="text-xs text-orbit-tertiary mt-1.5">Each product narrows the Semrush pull with its own filter terms, so cost and run time scale with the count.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div><label className={label}>Industry</label>
                    <select className={input} value={industry} disabled={running} onChange={e => setIndustry(e.target.value)}>{access.industries.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}</select></div>
                  <div><label className={label}>Market</label>
                    <select className={input} value={market} disabled={running} onChange={e => { setMarket(e.target.value); setSuggestions(null); }}>{access.markets.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}</select></div>
                </div>

                <div className="flex items-end justify-between mt-5 mb-1.5">
                  <label className={`${label} mb-0`}>Competitors <span className="normal-case tracking-normal text-orbit-tertiary">— up to {maxC}</span></label>
                  <button type="button" onClick={suggest} disabled={suggesting || running} className="text-xs font-semibold text-orbit-accent hover:underline disabled:opacity-50">
                    {suggesting ? 'Reading Semrush…' : suggestions ? 'Refresh suggestions' : 'Suggest from Semrush'}
                  </button>
                </div>
                {suggestions && (
                  suggestions.length ? (
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map(s => { const on = picked.some(p => p.domain === s.domain); return (
                        <button key={s.domain} type="button" disabled={running || (!on && picked.length >= maxC)} onClick={() => toggle(s)}
                          className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-40 ${on ? 'border-orbit-accent bg-orbit-accent/10 text-orbit-accent font-semibold' : 'border-orbit-border bg-orbit-surface text-orbit-secondary hover:border-orbit-accent/40'}`}>
                          {on ? '✓ ' : ''}{s.domain} <span className="text-orbit-tertiary font-normal text-[11px]">{s.commonKeywords.toLocaleString()} shared kw{s.publisher ? ' · publisher' : ''}</span>
                        </button>); })}
                    </div>
                  ) : <p className="text-xs text-orbit-secondary">Semrush returned no organic competitors for {suggestedFor}. Add them by hand below.</p>
                )}
                {/* v7.515 — every selected competitor, suggested or typed, in one list with its own remove control */}
                <div className="mt-3 rounded-lg border border-orbit-border bg-orbit-surface p-2.5" data-scout-selected>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-orbit-tertiary">Selected · {picked.length} of {maxC}</span>
                    {picked.length > 1 && <button type="button" disabled={running} onClick={() => setPicked([])} className="text-[11px] font-semibold text-orbit-accent hover:underline disabled:opacity-50">Remove all</button>}
                  </div>
                  {!picked.length ? <p className="text-xs text-orbit-secondary px-0.5">None yet — pick from the suggestions or add a domain below.</p> : (
                    <div className="flex flex-wrap gap-2">
                      {picked.map(p => (
                        <span key={p.domain} className={`inline-flex items-center gap-2 rounded-full border ${p.manual ? 'border-dashed' : ''} border-orbit-accent bg-orbit-accent/10 text-orbit-accent text-[13px] font-semibold px-3 py-1.5`}>
                          {p.domain}
                          <span className="text-orbit-tertiary font-normal text-[11px]">{p.manual ? `added by hand${p.note && p.note !== 'added by hand' ? ` · ${p.note}` : ''}` : 'suggested'}{p.publisher ? ' · publisher' : ''}</span>
                          <button type="button" disabled={running} aria-label={`Remove ${p.domain}`} title={`Remove ${p.domain}`} className="disabled:opacity-40" onClick={() => setPicked(prev => prev.filter(x => x.domain !== p.domain))}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-2.5">
                  <input className={input} placeholder="Add a competitor domain, e.g. competitor.com" value={manual} disabled={running}
                    onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }} />
                  <button type="button" onClick={addManual} disabled={checking || running || !manual.trim()} className="shrink-0 rounded-lg border border-orbit-accent text-orbit-accent text-sm font-semibold px-4 disabled:opacity-40">{checking ? 'Checking…' : 'Add'}</button>
                </div>
                {picked.some(p => p.publisher) && <p className="text-xs text-orbit-amber mt-1.5">One of your picks is a publisher or aggregator. It ranks for everything, so it can swamp the real competitors in the report.</p>}

                <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-orbit-border bg-orbit-surface px-4 py-3 mt-5 text-xs text-orbit-secondary">
                  <div><b className="block text-sm text-orbit-primary">{ceiling !== null ? `up to ${ceiling.toLocaleString()}` : '—'}</b>Semrush units (ceiling — billed per row returned)</div>
                  <div><b className="block text-sm text-orbit-primary">{access.timing ? `~${fmtSecs(access.timing.seconds)}` : 'no history yet'}</b>run time{access.timing ? ` · median of ${access.timing.runs} run${access.timing.runs === 1 ? '' : 's'}` : ''}</div>
                  <div><b className="block text-sm text-orbit-primary">{access.cap === null ? 'no cap' : `${access.usedToday} of ${access.cap}`}</b>your runs, last 24h</div>
                  {!access.aiRead && <div className="text-orbit-amber"><b className="block text-sm">AI page off</b>DataForSEO is not configured</div>}
                </div>
                {error && <p role="alert" className="mt-3 rounded-lg border border-orbit-red/40 bg-orbit-red/10 px-3.5 py-2.5 text-sm text-orbit-red">{error}</p>}
                {notice && !error && <p role="status" className="mt-3 rounded-lg border border-orbit-green/40 bg-orbit-green/10 px-3.5 py-2.5 text-sm text-orbit-green">{notice}</p>}
                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
                  <button type="button" onClick={save} disabled={saving || busy || running}
                    className="rounded-lg border border-orbit-accent text-orbit-accent text-sm font-bold py-3.5 transition-colors hover:bg-orbit-accent/10 disabled:opacity-50">
                    {saving ? 'Saving…' : editing?.status === 'draft' ? 'Save changes' : 'Save setup'}
                  </button>
                  <button type="button" onClick={start} disabled={busy || running || saving || capLeft === 0}
                    className="rounded-lg bg-orbit-accent hover:bg-orbit-accent-light text-[color:var(--on-fill-accent)] text-sm font-bold py-3.5 transition-colors disabled:opacity-50">
                    {running ? 'Running…' : capLeft === 0 ? 'Daily cap reached' : editing && editing.status !== 'draft' ? 'Run again as a new report' : 'Run Scout'}
                  </button>
                </div>
              </section>

              <div className="space-y-6">
                {ar && (
                  <section className="orbit-card p-6" aria-live="polite">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h2 className="text-[15px] font-bold text-orbit-primary truncate">{running ? 'Running' : 'Last run'} · {ar.domain}</h2>
                      <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${(STATUS[ar.status] ?? STATUS.queued).cls}`}>{(STATUS[ar.status] ?? STATUS.queued).label}</span>
                    </div>
                    {running && (<>
                      <div className="h-2 rounded-full bg-orbit-border overflow-hidden"><div className="h-full bg-orbit-accent transition-all duration-700" style={{ width: `${Math.round((Math.max(0, ar.step - 0.5) / ar.stepsTotal) * 100)}%` }} /></div>
                      <p className="text-sm text-orbit-primary mt-2.5 font-medium">Step {Math.max(1, ar.step)} of {ar.stepsTotal} · {ar.stepLabel ?? 'Starting'}</p>
                      <p className="text-xs text-orbit-secondary mt-0.5">{fmtSecs(elapsed)} elapsed{eta !== null ? ` · about ${fmtSecs(eta)} left (median of ${active!.timing!.runs} finished run${active!.timing!.runs === 1 ? '' : 's'})` : ' · no timing history yet, so no ETA'}</p>
                    </>)}
                    {!running && ar.status === 'ready' && <p className="text-sm text-orbit-secondary">Opening found: <span className="text-orbit-primary font-semibold">{ar.headline}</span>. {ar.units !== null && `${ar.units.toLocaleString()} Semrush units used.`}</p>}
                    {!running && ar.status === 'no_opening' && <p className="text-sm text-orbit-secondary">No theme cleared the evidence bar, so the PDF leads with the field view instead of naming an opening. {ar.units !== null && `${ar.units.toLocaleString()} Semrush units used.`}</p>}
                    {!running && ar.status === 'thin' && <p className="text-sm text-orbit-secondary">Too little data came back to build a report honestly, so none was made. {ar.units !== null && `${ar.units.toLocaleString()} Semrush units used.`}</p>}
                    {!running && ar.status === 'failed' && <p className="text-sm text-orbit-red">{ar.error ?? 'The run failed.'}</p>}
                    {!running && (ar.status === 'ready' || ar.status === 'no_opening') && (
                      <button type="button" onClick={() => download(ar)} disabled={downloading === ar.id} className="mt-3 rounded-lg bg-orbit-accent text-[color:var(--on-fill-accent)] text-sm font-bold px-4 py-2.5 disabled:opacity-50">{downloading === ar.id ? 'Building PDF…' : 'Download PDF'}</button>
                    )}
                  </section>
                )}

                <section className="orbit-card p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[15px] font-bold text-orbit-primary">Recent scouts</h2>
                    <button type="button" onClick={loadRuns} className="text-xs font-semibold text-orbit-accent hover:underline">Refresh</button>
                  </div>
                  {!runs.length ? <p className="text-sm text-orbit-secondary">No runs yet.</p> : (
                    <ul className="divide-y divide-orbit-border border-t border-orbit-border" data-scout-runs>
                      {runs.map(r => {
                        const st = r.projectId ? { label: 'IN ORBIT', cls: 'bg-orbit-accent/10 text-orbit-accent border-orbit-accent/30' } : (STATUS[r.status] ?? STATUS.queued);
                        const hasPdf = r.status === 'ready' || r.status === 'no_opening';
                        const live = r.status === 'queued' || r.status === 'running' || (busy && active?.run.id === r.id);
                        const isDraft = r.status === 'draft';
                        const act = 'text-xs font-semibold text-orbit-accent hover:underline disabled:opacity-50';
                        return (
                        <li key={r.id} className={`py-3 ${editing?.id === r.id ? 'bg-orbit-accent/5 -mx-2 px-2 rounded-lg' : ''}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-orbit-primary truncate">{r.domain}</span>
                                <span className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                              </div>
                              <div className="text-[11.5px] text-orbit-secondary mt-0.5">
                                {r.scope === 'products' ? `${r.products.length} product${r.products.length === 1 ? '' : 's'}` : 'Full domain'} · {r.competitors.length} competitor{r.competitors.length === 1 ? '' : 's'}{access.isAdmin && r.userName ? ` · ${r.userName}` : ''}
                              </div>
                              {r.headline && <div className="text-[11.5px] text-orbit-primary mt-0.5">{r.headline}</div>}
                            </div>
                            <span className="shrink-0 text-[11.5px] text-orbit-tertiary whitespace-nowrap">{isDraft ? 'saved ' : ''}{fmtDate(r.createdAt)}</span>
                          </div>
                          {confirmDel === r.id ? (
                            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-orbit-red/40 bg-orbit-red/10 px-2.5 py-1.5 text-xs text-orbit-red">
                              <span>Delete this {isDraft ? 'saved setup' : 'run and its report'}? This can&apos;t be undone.</span>
                              <button type="button" onClick={() => remove(r)} disabled={deleting === r.id} className="font-bold hover:underline disabled:opacity-50">{deleting === r.id ? 'Deleting…' : 'Yes, delete'}</button>
                              <button type="button" onClick={() => setConfirmDel(null)} className="font-semibold text-orbit-secondary hover:underline">Cancel</button>
                            </div>
                          ) : !live && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                              {hasPdf && <button type="button" onClick={() => download(r)} disabled={downloading === r.id} className={act}>{downloading === r.id ? 'Building…' : 'PDF ↓'}</button>}
                              {isDraft && <button type="button" onClick={() => runSaved(r)} disabled={busy || running || capLeft === 0} className={act}>Run</button>}
                              <button type="button" onClick={() => loadIntoForm(r)} disabled={busy || running} className={act}>{isDraft ? 'Edit' : 'Edit & re-run'}</button>
                              {r.projectId ? (access.orbit ? <Link href={`/projects/${r.projectId}`} className={act}>Open project →</Link> : null)
                                : hasPdf && access.orbit && access.canWrite ? <button type="button" onClick={() => convert(r)} disabled={converting === r.id} className={act}>{converting === r.id ? 'Creating…' : 'Convert to project →'}</button> : null}
                              <button type="button" onClick={() => setConfirmDel(r.id)} className="text-xs font-semibold text-orbit-red hover:underline ml-auto">Delete</button>
                            </div>
                          )}
                        </li>); })}
                    </ul>
                  )}
                  <p className="text-xs text-orbit-tertiary mt-3">{access.isAdmin ? 'Admins see every run.' : 'You see your own runs.'} SAVED is a setup that hasn't run yet — nothing was spent on it. Edit &amp; re-run loads a run's setup into the form; the original report is kept. NO CLEAR OPENING means no theme passed the evidence bar — the PDF still ships, leading with the field view. THIN DATA means too little came back to report honestly, so no PDF was made.</p>
                </section>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
