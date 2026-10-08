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
 * v7.522: the form clears to blank as soon as a run starts (Wayne, 2026-09-26); list is "Recent Scout Reports";
 * each row reads "Last run … by …" top-right, Download PDF / Convert to Orbit project are icon buttons, Edit & re-run
 * sits under them with Delete (trash + word) bottom-right; no insight line on the row; search + paging run on the
 * server so reports older than the newest 50 can be found (mockup v11, approved 2026-09-26).
 * v7.523: while a run executes, a progress card (mockup v12) shows % + a 6-segment bar, est. time left (median of
 * finished runs), elapsed, and six milestones — each one a REAL run step with its server start/end times and the
 * counts it actually produced (lib/scout/run.ts milestoneLog). When the run finishes the card collapses to a compact
 * result so the report is the focus; the run log can be reopened.
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
  markets: Array<{ code: string; label: string; top?: boolean; orbit?: boolean }>;   // v7.545: all Semrush country databases
}
interface Suggestion { domain: string; commonKeywords: number; organicKeywords: number; publisher: boolean }
interface Picked { domain: string; manual: boolean; note?: string; publisher?: boolean }
interface Run {
  id: string; userName: string | null; domain: string; market: string; industry: string; scope: string; products: string[];
  competitors: Array<{ domain: string; manual: boolean }>; status: string; step: number; stepsTotal: number;
  stepLabel: string | null; startedAt: string | null; finishedAt: string | null; error: string | null;
  headline: string | null; units: number | null; projectId: string | null; createdAt: string;
  milestones?: Array<{ n: number; startedAt: string; endedAt?: string; detail?: string }>;   // v7.523, live card only
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
// v7.522 — each status chip explains itself on hover (replaces the legend paragraph under the list)
const STATUS_TIP: Record<string, string> = {
  draft: "A setup that hasn't run yet — nothing was spent on it.",
  ready: 'The run finished and found an opening. The PDF is ready.',
  no_opening: 'No theme passed the evidence bar. The PDF still ships, leading with the field view.',
  thin: 'Too little data came back to report honestly, so no PDF was made.',
  failed: 'The run failed. Edit & re-run to try again.',
  running: 'Running now.', queued: 'Starting.', orbit: 'Converted to an Orbit project.',
};
/** v7.522 — the row's top-right line: when it last ran (or was saved / started). */
function whenLabel(r: { status: string; createdAt: string; startedAt: string | null; finishedAt: string | null }): string {
  if (r.status === 'draft') return `Saved ${fmtDate(r.createdAt)}`;
  if (r.status === 'queued' || r.status === 'running') return `Started ${fmtDate(r.startedAt ?? r.createdAt)}`;
  return `Last run ${fmtDate(r.finishedAt ?? r.startedAt ?? r.createdAt)}`;
}
const Ico = ({ d, size = 15, fill = false }: { d: string; size?: number; fill?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);
const I_PDF = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="m9.5 14.5 2.5 2.5 2.5-2.5"/>';
const I_ORBIT = '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)"/>';
const I_RERUN = '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>';
const I_PLAY = '<path d="M8 5v14l11-7z"/>';
const I_TRASH = '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>';
const I_SEARCH = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>';
const I_CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
const I_X = '<path d="M6 6l12 12M18 6L6 18"/>';

/** v7.523 — display names for the six REAL run steps (lib/scout/run.ts STEPS, same order) and the terminal line. */
const MILESTONES: Array<{ name: (ai: boolean, market?: string) => string; cmd: (r: { domain: string; competitors: unknown[] }) => string }> = [
  { name: () => 'Recon: domain footprint & authority signals', cmd: r => `recon --targets ${r.competitors.length + 1} --signals footprint,authority` },
  { name: () => 'Harvesting competitor page-one positions', cmd: r => `harvest serp --top 10 --competitors ${r.competitors.length}` },
  { name: () => "Cross-referencing the prospect's rankings", cmd: r => `xref rankings --prospect ${r.domain} --top 20` },
  { name: () => 'AI clustering of search demand into themes', cmd: () => 'cluster --model ai --themes auto' },
  // v7.545 — ChatGPT is read for US runs only; other markets read whatever AI answers are recorded there in English
  { name: (ai, market) => !ai ? 'Scoring openings across every theme' : !market || market === 'us' ? 'Scoring openings + probing ChatGPT & Google AI Overviews' : 'Scoring openings + probing AI answers recorded for this market', cmd: () => 'score openings && probe llm --engines chatgpt,google_aio' },
  { name: () => 'Mining buyer questions + final QA', cmd: () => 'assemble report --qa strict' },
];
const isLive = (st: string) => st === 'queued' || st === 'running';
/**
 * v7.523 — % complete. The bar sits on the REAL step the server reports and fills within that step on the
 * median pace of finished runs, capped at 92% of the step, so it can never run ahead of the server.
 */
function runPct(r: { status: string; step: number; stepsTotal: number; startedAt: string | null; milestones?: Run['milestones'] }, nowMs: number, skewMs: number, medianSec: number | null): number {
  const total = r.stepsTotal || 6;
  if (!isLive(r.status) && r.status !== 'draft') return 100;
  if (r.step <= 0) return 1;
  const cur = r.milestones?.find(m => m.n === r.step && !m.endedAt);
  const t0 = cur ? new Date(cur.startedAt).getTime() : r.startedAt ? new Date(r.startedAt).getTime() : nowMs;
  const inStep = Math.max(0, (nowMs - skewMs - t0) / 1000);
  const within = Math.min(0.92, inStep / Math.max(1, (medianSec ?? 30) / total));
  return Math.max(1, Math.min(99, Math.round(((r.step - 1 + within) / total) * 100)));
}
const secs = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000);
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
  const [total, setTotal] = useState(0);                  // v7.522 — all matching runs on the server, not just the page held here
  const [query, setQuery] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const queryRef = useRef('');
  const listSeq = useRef(0);                              // a slower, older search response never overwrites a newer one
  const runsRef = useRef<Run[]>([]);                      // the page already held, so Show older asks for the NEXT one
  useEffect(() => { runsRef.current = runs; }, [runs]);
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
  const [logOpen, setLogOpen] = useState(false);            // v7.523 — the finished card's run log (collapsed by default)
  const [justFinished, setJustFinished] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const awaitingClaim = useRef(false);   // a SAVED setup reads 'draft' until the execute request claims it

  /** v7.522 — first page for the current search, or the next page appended (Show older reports). */
  const loadRuns = useCallback(async (more = false) => {
    const seq = ++listSeq.current;
    const q = queryRef.current.trim();
    setListLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (more) params.set('offset', String(runsRef.current.length));
    const res = await fetch(`/api/scout/runs${params.toString() ? `?${params}` : ''}`, { cache: 'no-store' }).catch(() => null);
    if (seq !== listSeq.current) return;
    setListLoading(false);
    if (!res || !res.ok) return;
    const data = await res.json().catch(() => ({}));
    const page: Run[] = data.runs ?? [];
    setRuns(prev => more ? [...prev, ...page.filter(r => !prev.some(p => p.id === r.id))] : page);
    setTotal(Number(data.total ?? page.length));
  }, []);
  // search as you type, debounced so each keystroke is not a query
  useEffect(() => {
    queryRef.current = query;
    if (!access?.scout) return;
    const t = setTimeout(() => { loadRuns(); }, query.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, access?.scout, loadRuns]);
  const loadAccess = useCallback(async () => {
    const res = await fetch('/api/scout/access', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setDenied(data.error ?? 'Not signed in'); return; }
    setAccess(data);
    if (!data.scout) setDenied('Your account does not have Scout access. Ask an admin to turn it on.');
  }, []);

  useEffect(() => { loadAccess(); }, [loadAccess]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), busy ? 250 : 1000); return () => clearInterval(t); }, [busy]);   // v7.523 — smooth bar while a run is live
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
        // v7.523 — the card collapses to the result; a failed run keeps its log open so you can see where it stopped
        setLogOpen(data.run.status === 'failed');
        setJustFinished(data.run.id); setTimeout(() => setJustFinished(j => j === data.run.id ? null : j), 6000);
      }
    };
    setLogOpen(false);
    await tick();
    poll.current = setInterval(tick, 1500);
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
    setNotice(`Saved. It's in Recent Scout Reports as SAVED — edit it or run it from there, or keep changing it here.`);
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
    execute(id);
    clearForm();   // v7.522 — the form goes back to blank once the run is on its way; the run card and the list carry it
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
    setTimeout(() => { loadRuns(); }, 1200);   // v7.522 — the new run shows in the list straight away (the form has cleared)
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
    setEditing(null); setNotice(null); setError(null); setDomain(''); setScope('domain'); setProducts([]); setProductDraft(''); setPicked([]);
    setSuggestions(null); setSuggestedFor(''); setManual(''); setIndustry('other'); setMarket('us');
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
    clearForm(); setBusy(true);   // v7.522 — nothing to edit while it runs; the setup is on the row
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
  // v7.545 — Convert only where an Orbit project can run (pre-v7.545 access payloads carry no flag → us/ca/uk/au).
  const orbitMarket = (code: string) => { const m = access?.markets.find(x => x.code === code); return m ? (m.orbit ?? true) : false; };
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
            {/* v7.524: the same Admin + Dashboard buttons the project dashboard carries, so an
                admin on Scout is never stranded. Admin = owner/admin (the access route's isAdmin);
                Dashboard (/usage) = anyone with Orbit, matching the dashboard page. */}
            {access?.isAdmin && (
              <Link href="/admin" data-scout-nav="admin" className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors">
                <i className="ti ti-users-group" aria-hidden="true" />
                Admin
              </Link>
            )}
            {(access?.isAdmin || access?.orbit) && (
              <Link href="/usage" data-scout-nav="usage" className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors">
                <i className="ti ti-gauge" aria-hidden="true" />
                Dashboard
              </Link>
            )}
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
                    <select className={input} value={market} disabled={running} onChange={e => { setMarket(e.target.value); setSuggestions(null); }}>
                      <optgroup label="Most used">{access.markets.filter(m => m.top).map(m => <option key={m.code} value={m.code}>{m.label}</option>)}</optgroup>
                      <optgroup label="All Semrush markets">{access.markets.filter(m => !m.top).map(m => <option key={m.code} value={m.code}>{m.label}</option>)}</optgroup>
                    </select></div>
                </div>
                {market !== 'us' && (() => { const ml = access.markets.find(m => m.code === market)?.label ?? market; return (
                  <p data-scout-market-note className="text-xs text-orbit-tertiary mt-1.5">
                    Rankings and volumes come from Semrush&apos;s {ml} database. AI answers: ChatGPT is recorded for the US only, and Google AI Overviews are read only where English-language answers are recorded for {ml} — themes are matched in English and the PDF is written in English.{access.markets.find(m => m.code === market)?.orbit ? '' : ' Orbit projects don\u2019t support this market yet, so this run can\u2019t be converted.'}
                  </p>); })()}

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
                {ar && (() => {
                  const ms = ar.milestones ?? [];
                  const pct = runPct(ar, now, active?.skew ?? 0, active?.timing?.seconds ?? null);
                  const doneOk = ar.status === 'ready' || ar.status === 'no_opening';
                  const took = ar.startedAt && ar.finishedAt ? secs(ar.startedAt, ar.finishedAt) : null;
                  const bodyOpen = running || logOpen;
                  const term = running ? MILESTONES[Math.max(0, Math.min(5, ar.step - 1))].cmd(ar)
                    : ar.status === 'ready' ? 'run complete · PDF ready' : ar.status === 'no_opening' ? 'run complete · field-view PDF ready'
                    : ar.status === 'thin' ? 'run complete · too little data for a report' : 'run stopped · see the error above';
                  return (
                  <section className={`orbit-card overflow-hidden transition-shadow ${running ? 'border-orbit-accent/50 shadow-[0_0_0_3px_rgb(var(--orbit-accent)/0.08)]' : ''}`} aria-live="polite" data-scout-progress data-state={running ? 'running' : 'done'}>
                    <div className="px-6 pt-5 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.14em] ${running ? 'text-orbit-accent-light' : ar.status === 'failed' ? 'text-orbit-red' : doneOk ? 'text-orbit-green' : 'text-orbit-amber'}`}>
                            {running ? <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-orbit-green opacity-60 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-orbit-green" /></span>
                              : <Ico d={ar.status === 'failed' ? I_X : I_CHECK} size={12} />}
                            {running ? 'SCOUT RUN · LIVE' : ar.status === 'failed' ? 'SCOUT RUN · STOPPED' : `SCOUT COMPLETE${took !== null ? ` · ${fmtSecs(took)}` : ''}`}
                          </div>
                          <div className="text-[19px] font-extrabold text-orbit-primary truncate mt-1">{ar.domain}</div>
                          <div className="text-[11.5px] text-orbit-secondary mt-0.5 truncate">
                            {ar.scope === 'products' ? `${ar.products.length} product${ar.products.length === 1 ? '' : 's'}` : 'Full domain'} · vs {ar.competitors.map(c => c.domain).join(', ')}
                          </div>
                        </div>
                        {running ? (
                          <div className="shrink-0 text-right" data-scout-pct><span className="font-mono text-[30px] font-bold leading-none text-orbit-primary">{pct}<span className="text-[20px]">%</span></span>
                            <span className="block font-mono text-[10px] font-semibold tracking-[0.1em] text-orbit-secondary mt-1">COMPLETE</span></div>
                        ) : (
                          <div className="shrink-0 flex items-center gap-2">
                            <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${(STATUS[ar.status] ?? STATUS.queued).cls}`}>{(STATUS[ar.status] ?? STATUS.queued).label}</span>
                            <button type="button" onClick={() => setActive(null)} aria-label="Close" title="Close" className="text-orbit-tertiary hover:text-orbit-primary"><Ico d={I_X} size={14} /></button>
                          </div>
                        )}
                      </div>

                      {!running && (
                        <div className="mt-3" data-scout-result>
                          {ar.status === 'ready' && <p className="text-sm text-orbit-secondary">Opening found: <span className="text-orbit-primary font-semibold">{ar.headline}</span>. {ar.units !== null && `${ar.units.toLocaleString()} Semrush units used.`}</p>}
                          {ar.status === 'no_opening' && <p className="text-sm text-orbit-secondary">No theme cleared the evidence bar, so the PDF leads with the field view instead of naming an opening. {ar.units !== null && `${ar.units.toLocaleString()} Semrush units used.`}</p>}
                          {ar.status === 'thin' && <p className="text-sm text-orbit-secondary">Too little data came back to build a report honestly, so none was made. {ar.units !== null && `${ar.units.toLocaleString()} Semrush units used.`}</p>}
                          {ar.status === 'failed' && <p className="text-sm text-orbit-red">{ar.error ?? 'The run failed.'}</p>}
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {doneOk && <button type="button" onClick={() => download(ar)} disabled={downloading === ar.id} className="inline-flex items-center gap-1.5 rounded-lg bg-orbit-accent hover:bg-orbit-accent-light text-[color:var(--on-fill-accent)] text-sm font-bold px-4 py-2.5 disabled:opacity-50"><Ico d={I_PDF} />{downloading === ar.id ? 'Building PDF…' : 'Download PDF'}</button>}
                            {doneOk && !ar.projectId && access.orbit && access.canWrite && orbitMarket(ar.market) && <button type="button" onClick={() => convert(ar)} disabled={converting === ar.id} className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-orbit-accent-light text-orbit-accent-light hover:bg-orbit-accent/10 text-sm font-bold px-4 py-2 disabled:opacity-50"><Ico d={I_ORBIT} />{converting === ar.id ? 'Creating project…' : 'Convert to Orbit project'}</button>}
                            {ms.length > 0 && <button type="button" onClick={() => setLogOpen(o => !o)} className="ml-auto text-xs font-semibold text-orbit-secondary hover:text-orbit-accent" aria-expanded={logOpen} data-scout-log-toggle>{logOpen ? 'Hide run log ▴' : 'Show run log ▾'}</button>}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* v7.523 — collapsible body: open while running, folds away when the run finishes */}
                    <div className={`grid transition-[grid-template-rows] duration-500 ease-out ${bodyOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} data-scout-body data-open={bodyOpen ? '1' : '0'}>
                      <div className="min-h-0 overflow-hidden">
                        <div className="px-6">
                          <div className="relative h-3 rounded-full bg-orbit-accent/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orbit-accent to-orbit-cyan transition-[width] duration-500 scout-stripes" style={{ width: `${pct}%` }} />
                            <div className="absolute inset-0 grid grid-cols-6 pointer-events-none">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < 5 ? 'border-r-2 border-orbit-card' : ''} />)}</div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            <div className="rounded-lg border border-orbit-border bg-orbit-surface px-2.5 py-2" data-scout-eta><b className="block font-mono text-[15px] text-orbit-primary">{!running ? (took !== null ? fmtSecs(took) : '—') : eta === null ? '—' : eta < 1 ? 'almost…' : `~${fmtSecs(eta)}`}</b><span className="text-[10.5px] text-orbit-secondary">{!running ? 'total run time' : eta === null ? 'no timing history yet' : `est. time left · median of ${active!.timing!.runs}`}</span></div>
                            <div className="rounded-lg border border-orbit-border bg-orbit-surface px-2.5 py-2"><b className="block font-mono text-[15px] text-orbit-primary">{fmtSecs(running ? elapsed : took ?? 0)}</b><span className="text-[10.5px] text-orbit-secondary">elapsed</span></div>
                            <div className="rounded-lg border border-orbit-border bg-orbit-surface px-2.5 py-2"><b className="block font-mono text-[15px] text-orbit-primary">{running ? Math.max(1, ar.step) : ms.filter(m => m.endedAt).length} / {ar.stepsTotal}</b><span className="text-[10.5px] text-orbit-secondary">milestone</span></div>
                          </div>
                        </div>
                        <ul className="px-6 pt-2 pb-3" data-scout-milestones>
                          {MILESTONES.map((m, i) => {
                            const rec = ms.find(x => x.n === i + 1);
                            const st = rec?.endedAt ? 'done' : rec && running ? 'now' : rec && ar.status === 'failed' ? 'stop' : running ? 'todo' : 'skip';
                            const tm = st === 'done' ? `${secs(rec!.startedAt, rec!.endedAt!).toFixed(1)}s` : st === 'now' ? `${Math.max(0, (now - (active?.skew ?? 0) - new Date(rec!.startedAt).getTime()) / 1000).toFixed(1)}s` : '';
                            return (
                              <li key={i} className={`grid grid-cols-[26px_1fr_auto] gap-2.5 items-start py-2 ${i ? 'border-t border-dashed border-orbit-border' : ''}`} data-ms={st}>
                                <span data-ms-icon className={`mt-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[10.5px] font-bold ${
                                  st === 'done' ? 'bg-orbit-green/15 border border-orbit-green/50 text-orbit-green' : st === 'now' ? 'border-2 border-orbit-accent-light border-t-transparent animate-spin' : st === 'stop' ? 'bg-orbit-red/15 border border-orbit-red/50 text-orbit-red' : 'border-[1.5px] border-dashed border-orbit-secondary text-orbit-secondary'}`}>
                                  {st === 'done' ? <Ico d={I_CHECK} size={12} /> : st === 'stop' ? <Ico d={I_X} size={11} /> : st === 'now' ? null : i + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className={`text-[13px] ${st === 'todo' || st === 'skip' ? 'font-semibold text-orbit-secondary' : 'font-bold text-orbit-primary'}`} data-ms-name>{m.name(access.aiRead, ar?.market)}</div>
                                  <div className={`font-mono text-[11px] mt-0.5 ${st === 'stop' ? 'text-orbit-red' : 'text-orbit-secondary'}`} data-ms-detail>
                                    {st === 'done' ? (rec!.detail ?? 'done') : st === 'now' ? 'working…' : st === 'stop' ? 'stopped here' : st === 'skip' ? 'not needed' : 'queued'}
                                  </div>
                                </div>
                                <span className={`font-mono text-[11px] font-semibold pt-0.5 whitespace-nowrap ${st === 'done' ? 'text-orbit-green' : 'text-orbit-accent-light'}`} data-ms-time>{tm}</span>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="px-6 py-2.5 font-mono text-[11px] leading-relaxed bg-[color:var(--scout-term)] text-[color:var(--scout-term-text)] border-t border-orbit-accent/35" data-scout-term>
                          <span className="text-[color:var(--scout-term-ok)]">scout@orbitiq</span> <span className="text-[color:var(--scout-term-dim)]">~$</span> {term}{running && <span className="inline-block w-[7px] h-3 ml-1 align-[-2px] bg-[color:var(--scout-term-text)] animate-pulse" />}
                        </div>
                      </div>
                    </div>
                  </section>
                  );
                })()}

                <section className="orbit-card p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[15px] font-bold text-orbit-primary">Recent Scout Reports</h2>
                    <button type="button" onClick={() => loadRuns()} className="text-xs font-semibold text-orbit-accent hover:underline">Refresh</button>
                  </div>
                  <div className="relative" data-scout-search>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orbit-tertiary"><Ico d={I_SEARCH} size={14} /></span>
                    <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by domain or who ran it" aria-label="Search Scout reports"
                      className="w-full rounded-lg border border-orbit-border bg-orbit-surface pl-9 pr-3 py-2 text-[13px] text-orbit-primary placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent" />
                  </div>
                  <p className="text-[11.5px] text-orbit-secondary mt-1.5 mb-1 px-0.5" data-scout-count>
                    {listLoading && !runs.length ? 'Loading…'
                      : query.trim() ? <>{total.toLocaleString()} report{total === 1 ? '' : 's'} match &ldquo;{query.trim()}&rdquo;{runs.length < total ? <> · showing {runs.length}</> : null}</>
                      : total ? <>Showing the <b className="text-orbit-primary">{runs.length}</b> newest of <b className="text-orbit-primary">{total.toLocaleString()}</b> report{total === 1 ? '' : 's'}</> : null}
                  </p>
                  {!runs.length ? <p className="text-sm text-orbit-secondary py-2">{listLoading ? '' : query.trim() ? 'No reports match that search.' : 'No runs yet.'}</p> : (
                    <ul className="divide-y divide-orbit-border border-t border-orbit-border" data-scout-runs>
                      {runs.map(r => {
                        const st = r.projectId ? { label: 'IN ORBIT', cls: 'bg-orbit-cyan/10 text-orbit-cyan border-orbit-cyan/30' } : (STATUS[r.status] ?? STATUS.queued);
                        const tip = r.projectId ? STATUS_TIP.orbit : (STATUS_TIP[r.status] ?? '');
                        const hasPdf = r.status === 'ready' || r.status === 'no_opening';
                        const live = r.status === 'queued' || r.status === 'running' || (busy && active?.run.id === r.id);
                        const isDraft = r.status === 'draft';
                        const primary = 'inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-[12.5px] font-bold transition-colors disabled:opacity-50';
                        const quiet = 'inline-flex items-center gap-1.5 text-xs font-semibold text-orbit-secondary hover:text-orbit-accent disabled:opacity-50';
                        return (
                        <li key={r.id} className={`py-3.5 transition-colors duration-700 ${editing?.id === r.id || justFinished === r.id ? 'bg-orbit-accent/5 -mx-2 px-2 rounded-lg' : ''}`} data-scout-row data-just-finished={justFinished === r.id ? '1' : undefined}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[15px] text-orbit-primary truncate">{r.domain}</span>
                              <span title={tip} className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded border cursor-help ${st.cls}`}>{st.label}</span>
                            </div>
                            <div className="shrink-0 text-right text-[11.5px] leading-snug text-orbit-secondary whitespace-nowrap" data-scout-when>
                              {whenLabel(r)}{r.userName ? <><br />by <span className="font-semibold text-orbit-primary">{r.userName}</span></> : null}
                            </div>
                          </div>
                          <div className="text-[11.5px] text-orbit-secondary mt-1">
                            {r.scope === 'products' ? `${r.products.length} product${r.products.length === 1 ? '' : 's'}` : 'Full domain'} · {r.competitors.length} competitor{r.competitors.length === 1 ? '' : 's'}{r.market && r.market !== 'us' ? ` · ${access.markets.find(m => m.code === r.market)?.label ?? r.market}` : ''}{isDraft ? ' · not run yet' : ''}
                          </div>
                          {live && (() => {
                            const src = active?.run.id === r.id ? active.run : r;
                            const rp = runPct(src, now, active?.run.id === r.id ? active.skew : 0, access.timing?.seconds ?? null);
                            const el = src.startedAt ? Math.max(0, (now - (active?.run.id === r.id ? active.skew : 0) - new Date(src.startedAt).getTime()) / 1000) : 0;
                            const left = access.timing ? access.timing.seconds - el : null;
                            return (
                              <div className="mt-2" data-scout-rowprog>
                                <div className="h-[5px] rounded-full bg-orbit-accent/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-orbit-accent to-orbit-cyan transition-[width] duration-500" style={{ width: `${rp}%` }} /></div>
                                <div className="font-mono text-[11px] text-orbit-secondary mt-1">Milestone {Math.max(1, src.step)} of {src.stepsTotal}{left === null ? '' : left < 1 ? ' · almost done' : ` · ~${fmtSecs(left)} left`}</div>
                              </div>
                            );
                          })()}
                          {live ? null : (<>
                            {(hasPdf || isDraft || r.projectId) && (
                              <div className="flex flex-wrap items-center gap-2 mt-2.5" data-scout-primary>
                                {hasPdf && <button type="button" onClick={() => download(r)} disabled={downloading === r.id} className={`${primary} border-orbit-accent bg-orbit-accent text-[color:var(--on-fill-accent)] hover:bg-orbit-accent-light`}><Ico d={I_PDF} />{downloading === r.id ? 'Building PDF…' : 'Download PDF'}</button>}
                                {isDraft && <button type="button" onClick={() => runSaved(r)} disabled={busy || running || capLeft === 0} className={`${primary} border-orbit-accent bg-orbit-accent text-[color:var(--on-fill-accent)] hover:bg-orbit-accent-light`}><Ico d={I_PLAY} size={13} fill />Run</button>}
                                {r.projectId ? (access.orbit ? <Link href={`/projects/${r.projectId}`} className={`${primary} border-orbit-cyan text-orbit-cyan hover:bg-orbit-cyan/10`}><Ico d={I_ORBIT} />Open Orbit project →</Link> : null)
                                  : hasPdf && access.orbit && access.canWrite && orbitMarket(r.market) ? <button type="button" onClick={() => convert(r)} disabled={converting === r.id} className={`${primary} border-orbit-accent-light text-orbit-accent-light hover:bg-orbit-accent/10`}><Ico d={I_ORBIT} />{converting === r.id ? 'Creating project…' : 'Convert to Orbit project'}</button> : null}
                              </div>
                            )}
                            <div className="flex items-end justify-between gap-3 mt-1.5">
                              <button type="button" onClick={() => loadIntoForm(r)} disabled={busy || running} className={`${quiet} py-1`}><Ico d={I_RERUN} size={13} />{isDraft ? 'Edit' : 'Edit & re-run'}</button>
                              <button type="button" onClick={() => setConfirmDel(r.id)} aria-label={`Delete ${r.domain}`} data-scout-delete
                                className="flex flex-col items-center gap-0.5 rounded-md px-1.5 py-1 text-[10.5px] font-semibold text-orbit-red hover:bg-orbit-red/10"><Ico d={I_TRASH} size={17} />Delete</button>
                            </div>
                          </>)}
                          {confirmDel === r.id && (
                            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-orbit-red/40 bg-orbit-red/10 px-2.5 py-1.5 text-xs text-orbit-red">
                              <span>Delete this {isDraft ? 'saved setup' : 'run and its report'}? This can&apos;t be undone.</span>
                              <button type="button" onClick={() => remove(r)} disabled={deleting === r.id} className="font-bold hover:underline disabled:opacity-50">{deleting === r.id ? 'Deleting…' : 'Yes, delete'}</button>
                              <button type="button" onClick={() => setConfirmDel(null)} className="font-semibold text-orbit-secondary hover:underline">Cancel</button>
                            </div>
                          )}
                        </li>); })}
                    </ul>
                  )}
                  {runs.length > 0 && runs.length < total && (
                    <div className="text-center pt-3"><button type="button" onClick={() => loadRuns(true)} disabled={listLoading} className="text-xs font-semibold text-orbit-accent hover:underline disabled:opacity-50" data-scout-more>{listLoading ? 'Loading…' : 'Show older reports'}</button></div>
                  )}
                  <p className="text-xs text-orbit-tertiary mt-3">{access.isAdmin ? 'Admins see every run.' : 'You see your own runs.'} Hover a status for what it means.</p>
                </section>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
