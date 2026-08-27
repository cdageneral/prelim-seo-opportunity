'use client';

/**
 * components/brief/KeywordSelectionSection.tsx — v7.476
 *
 * "Keyword Selection" — the 5-step wizard that BUILDS the project's keyword pool
 * (design spec GEO/orbitiq-mockup-scope-selection-2026-08-26.html, approved by
 * Wayne 2026-08-26). One step shows at a time; the stepper is the tab bar.
 *
 *   1 Upload client footprint   — CSV upload (THE shared parser, Const II.7)
 *   2 Add competitors           — opens the Competitors modal
 *   3 Select categories         — the scope tree. Writes the v7.419
 *     hidden-categories store (project row → hydrated `_hiddenCategories` →
 *     filtered ONCE at buildKwPool), so every panel, total, scan and the PDF
 *     re-scope instantly, non-destructively, restorably. No second store.
 *   4 Expand footprint (opt.)   — product-lane deep build. BOUNDARY: seeds are
 *     gated server-side to Step-3 selected categories; expansion files into the
 *     existing anchored tree only (v7.243 / Const III.1e — never a new topic).
 *   5 Pre-product journey (opt.)— problem-lane deep build. Same Step-3 boundary
 *     at read time; never names a client product (Const III.2a-i/ii).
 *
 * Statuses read REAL data only (Const I.1): pool counts via the shared
 * keywordLandscape membership basis, demand-universe lane counts, stored scope.
 * Both builds stream determinate progress (Const IV.2) and dry-run first
 * (v7.440 — nothing stored until reviewed).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildKwPool, isBrandedKeyword } from '@/lib/utils/kwVolume';
import { isClientFootprintRow, isCompetitorGapRow } from '@/lib/keywordLandscape';   // v7.446: ONE membership basis
import { parseKeywordCsvMeta } from '@/lib/keywords/csvParse';                        // v7.459: THE shared CSV parser
import { buildSelectionTree, type SelectionNode, type SelectionTree } from '@/lib/category/selectionScope';

interface Props {
  projectId: string;
  analysis: any;                       // hydrated: `_hiddenCategories` etc. present
  competitors?: string[];
  brandTerms?: string[];
  domain?: string;
  kwVersion?: number;
  defaultClientThreshold?: number;
  defaultCompetitorThreshold?: number;
  onOpenCompetitors?: () => void;
  onDeepJourneyBuilt?: () => void;     // page refetches analysis → backfill everywhere
  onScopeChanged?: () => void;         // page refetches project → new _hiddenCategories
  onKeywordsChanged?: () => void;
  onGoToKeywordList?: () => void;
}

type ReviewSeed = { seed: string; label: string; keywords: number; volume: number; sample: Array<{ keyword: string; searchVolume: number }> };

const fmtN = (v: number) => v.toLocaleString();
const fmtVol = (v: number) => v >= 1_000_000 ? (v / 1_000_000).toFixed(2) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'K' : String(v);

export default function KeywordSelectionSection({
  projectId, analysis, competitors = [], brandTerms = [], domain = '',
  kwVersion = 0, defaultClientThreshold = 0, defaultCompetitorThreshold = 0,
  onOpenCompetitors, onDeepJourneyBuilt, onScopeChanged, onKeywordsChanged, onGoToKeywordList,
}: Props) {
  const snap = analysis?.semrushSnapshot ?? {};
  const cb   = snap?._categoryBreakdown ?? {};
  const clientDomain = snap?.domain ?? domain ?? '';

  // ── Uploaded keyword rows (same source as every panel) ──────────────────────
  const [dbKeywords, setDbKeywords] = useState<any[]>([]);
  const [dbLoaded,   setDbLoaded]   = useState(false);
  const fetchDb = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/keywords`);
      const data = await res.json();
      setDbKeywords(data.keywords ?? []);
    } catch { /* silent */ } finally { setDbLoaded(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, kwVersion]);
  useEffect(() => { fetchDb(); }, [fetchDb]);

  // ── Canonical pool WITHOUT the selection filter (the tree must show out-of-scope
  // nodes greyed with their real counts). Everything else — brand guard, scope gate,
  // thresholds — applies exactly as everywhere (Const II.7). ────────────────────
  const poolUnselected = useMemo(() => buildKwPool({
    semrushSnapshot:   { ...snap, _hiddenCategories: [] },
    uploadedKeywords:  dbKeywords,
    clientDomain,
    competitorDomains: competitors,
    clientVolMin:      defaultClientThreshold,
    competitorVolMin:  defaultCompetitorThreshold,
    includeDemand:     true,
  }), [snap, dbKeywords, clientDomain, competitors, defaultClientThreshold, defaultCompetitorThreshold]);

  const clientCount = useMemo(() => poolUnselected.filter(r => isClientFootprintRow(r as any)).length, [poolUnselected]);
  const gapCount    = useMemo(() => poolUnselected.filter(r => isCompetitorGapRow(r as any)).length,   [poolUnselected]);

  const du = snap?._demandUniverse;
  const duTopics: any[] = Array.isArray(du?.topics) ? du.topics : [];
  const productTopics = duTopics.filter(t => t?.laneHint === 'product').length;
  const preTopics     = duTopics.length - productTopics;

  // ── Selection tree (stored membership only — Const II.8) ────────────────────
  const brandCatNames = useMemo(() => {
    const s = new Set<string>();
    for (const c of (cb?.categories ?? []) as any[]) {
      if (c?.type === 'brand' && c?.name) s.add(String(c.name).toLowerCase().trim());
    }
    return s;
  }, [cb]);

  const tree: SelectionTree = useMemo(() => buildSelectionTree(
    poolUnselected as any,
    (cb?.keywordPaths ?? {}) as Record<string, string[]>,
    (cb?.keywordCategories ?? {}) as Record<string, string>,
    [],                       // draft state is applied client-side below
    brandCatNames,
  ), [poolUnselected, cb, brandCatNames]);

  const nodeByKey = useMemo(() => {
    const m = new Map<string, SelectionNode>();
    const walk = (n: SelectionNode) => { m.set(n.key.toLowerCase(), n); n.children.forEach(walk); };
    tree.nodes.forEach(walk);
    return m;
  }, [tree]);

  // ── Draft scope state (idents = node keys; stored entries seed it) ──────────
  const storedHidden: any[] = Array.isArray(snap?._hiddenCategories) ? snap._hiddenCategories : [];
  const storedIdentsJson = JSON.stringify(
    storedHidden.map(h => String(h?.key ?? h?.name ?? '').toLowerCase().trim()).filter(Boolean),
  );
  const [hiddenDraft, setHiddenDraft] = useState<Set<string>>(() => new Set(JSON.parse(storedIdentsJson) as string[]));
  const [draftDirty,  setDraftDirty]  = useState(false);
  // v7.478: resync ONLY when the SERVER state actually changed. The old effect also ran
  // when draftDirty flipped false at save time — while the page refetch was still in
  // flight — so it reset the checkboxes to the PRE-save prop and the UI looked like the
  // save was ignored (Wayne, 2026-08-27: "when I uncheck a box and save the box stays
  // checked"). The applied-ref gate makes a stale prop a no-op.
  const appliedStoredRef = useRef(storedIdentsJson);
  useEffect(() => {
    if (storedIdentsJson === appliedStoredRef.current) return;   // prop unchanged (or stale vs our save) — never clobber
    appliedStoredRef.current = storedIdentsJson;
    if (!draftDirty) setHiddenDraft(new Set(JSON.parse(storedIdentsJson) as string[]));
  }, [storedIdentsJson, draftDirty]);

  const [scopeSaving,  setScopeSaving]  = useState(false);
  const [scopeError,   setScopeError]   = useState<string | null>(null);
  const [scopeSavedAt, setScopeSavedAt] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/hidden-categories`, { cache: 'no-store' });
        if (r.ok) { const d = await r.json(); if (d?.updatedAt) setScopeSavedAt(String(d.updatedAt)); }
      } catch { /* honest absence — label stays empty */ }
    })();
  }, [projectId]);

  const prefixes = (key: string): string[] => {
    const parts = key.split(' › ');
    const out: string[] = [];
    let acc = '';
    for (let i = 0; i < parts.length; i++) { acc = acc ? acc + ' › ' + parts[i] : parts[i]; out.push(acc.toLowerCase()); }
    return out;
  };
  const hiddenBy = (key: string): string | null => {
    const ps = prefixes(key);
    for (let i = 0; i < ps.length; i++) if (hiddenDraft.has(ps[i])) return ps[i];
    return null;
  };
  const isNodeHidden = (key: string) => hiddenBy(key) !== null;

  const toggleNode = (node: SelectionNode) => {
    const keyLow = node.key.toLowerCase();
    const cover  = hiddenBy(node.key);
    const next   = new Set(hiddenDraft);
    if (cover === null) {
      // hide this subtree; drop now-redundant descendant entries
      const del: string[] = [];
      next.forEach(id => { if (id === keyLow || id.indexOf(keyLow + ' › ') === 0) del.push(id); });
      for (let i = 0; i < del.length; i++) next.delete(del[i]);
      next.add(keyLow);
    } else if (cover === keyLow) {
      next.delete(keyLow);
    } else {
      // hidden via an ancestor: restore this node, keep its former siblings hidden
      next.delete(cover);
      let cur = nodeByKey.get(cover);
      const targetPs = prefixes(node.key);
      while (cur && cur.key.toLowerCase() !== keyLow) {
        const depthIdx = prefixes(cur.key).length;         // child prefix index
        const childOnPath = targetPs[depthIdx];
        for (const c of cur.children) {
          const cLow = c.key.toLowerCase();
          if (cLow !== childOnPath) next.add(cLow);
        }
        cur = cur.children.find(c => c.key.toLowerCase() === childOnPath);
      }
    }
    setHiddenDraft(next);
    setDraftDirty(true);
    setScopeError(null);
  };

  const setAll = (inScope: boolean) => {
    if (inScope) setHiddenDraft(new Set());
    else setHiddenDraft(new Set(tree.nodes.map(n => n.key.toLowerCase())));
    setDraftDirty(true);
  };

  // Exact in/out accounting over the draft (own rows counted once — Const I.3).
  const draftStats = useMemo(() => {
    let inKw = 0, inVol = 0, outKw = 0, outVol = 0, inRoots = 0;
    const walk = (n: SelectionNode, ancestorHidden: boolean) => {
      const hid = ancestorHidden || hiddenDraft.has(n.key.toLowerCase());
      let childVol = 0;
      for (const c of n.children) childVol += c.monthlyVol;
      const ownVol = n.monthlyVol - childVol;
      if (hid) { outKw += n.ownCount; outVol += ownVol; } else { inKw += n.ownCount; inVol += ownVol; }
      n.children.forEach(c => walk(c, hid));
    };
    tree.nodes.forEach(n => { if (!hiddenDraft.has(n.key.toLowerCase())) inRoots++; walk(n, false); });
    return { inKw, inVol, outKw, outVol, inRoots, totalRoots: tree.nodes.length };
  }, [tree, hiddenDraft]);

  async function saveScope() {
    if (scopeSaving) return;
    setScopeSaving(true);
    setScopeError(null);
    try {
      // v7.372 serialized read-modify-write: fresh server state first, preserve hiddenAt.
      const r = await fetch(`/api/projects/${projectId}/hidden-categories`, { cache: 'no-store' });
      const d = r.ok ? await r.json() : { hidden: [] };
      const cur: any[] = Array.isArray(d.hidden) ? d.hidden : [];
      const curByIdent = new Map<string, any>();
      for (const h of cur) curByIdent.set(String(h?.key ?? h?.name ?? '').toLowerCase().trim(), h);
      const now = new Date().toISOString();
      const hidden: any[] = [];
      hiddenDraft.forEach(ident => {
        const node = nodeByKey.get(ident);
        const prev = curByIdent.get(ident);
        const name = node ? node.name : (prev?.name ?? ident);
        const kwCount = node ? node.kwCount : (prev?.kwCount ?? 0);
        const hiddenAt = prev?.hiddenAt ?? now;
        const key = node ? node.key : (prev?.key ?? undefined);
        if (key && key.indexOf(' › ') >= 0) hidden.push({ name, key, kwCount, hiddenAt });
        else hidden.push({ name: key ?? name, kwCount, hiddenAt });   // root: name-only ⇒ matches path roots AND flat categories
      });
      const pr = await fetch(`/api/projects/${projectId}/hidden-categories`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }),
      });
      if (!pr.ok) throw new Error(`save failed (${pr.status})`);
      const pd = await pr.json();
      setScopeSavedAt(String(pd?.updatedAt ?? now));
      setDraftDirty(false);
      onScopeChanged?.();   // page refetch → every panel re-filters through buildKwPool
    } catch (e) {
      setScopeError(String((e as any)?.message ?? e));
    } finally {
      setScopeSaving(false);
    }
  }

  // ── Steps 4/5: deep-build runner (same /demand-universe contract as the panel) ──
  const [buildMode,     setBuildMode]     = useState<null | 'product' | 'pre'>(null);
  const [buildProgress, setBuildProgress] = useState<{ done: number; total: number; seed: string; startedAt: number } | null>(null);
  const [buildError,    setBuildError]    = useState<string | null>(null);
  const [buildGated,    setBuildGated]    = useState<number>(0);
  const [minVolume,     setMinVolume]     = useState(0);
  const [includeRelated, setIncludeRelated] = useState(false);
  const [review, setReview] = useState<null | { mode: 'product' | 'pre'; totals: { keywords: number; volume: number }; seeds: ReviewSeed[] }>(null);
  const [reviewRejected, setReviewRejected] = useState<Set<string>>(new Set());

  async function runDeepBuild(mode: 'product' | 'pre', opts: { dryRun?: boolean; excludeSeeds?: string[] } = {}) {
    if (buildMode) return;
    const dryRun = opts.dryRun === true;
    setBuildMode(mode); setBuildError(null); setBuildGated(0);
    if (dryRun) setReview(null);
    setBuildProgress({ done: 0, total: 0, seed: '', startedAt: Date.now() });
    try {
      const r = await fetch(`/api/projects/${projectId}/demand-universe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, linesPerSeed: 50, minVolume, dryRun, includeRelated, excludeSeeds: opts.excludeSeeds ?? [] }),
      });
      if (!r.ok || !r.body) {
        let msg = `Build failed (${r.status})`;
        try { const dd = await r.json(); msg = dd?.error ?? msg; } catch { /* keep default */ }
        setBuildError(msg);
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
          let ev: any;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'start') {
            setBuildProgress(p => ({ done: 0, total: ev.total ?? 0, seed: '', startedAt: p?.startedAt ?? Date.now() }));
            if (typeof ev.gatedOutOfScope === 'number') setBuildGated(ev.gatedOutOfScope);
          } else if (ev.type === 'progress') {
            setBuildProgress(p => ({ done: ev.done, total: ev.total, seed: ev.seed ?? '', startedAt: p?.startedAt ?? Date.now() }));
          } else if (ev.type === 'error') {
            setBuildError(ev.error ?? 'Build failed');
          } else if (ev.type === 'review') {
            setReview({ mode, totals: ev.totals ?? { keywords: 0, volume: 0 }, seeds: (ev.seeds ?? []) as ReviewSeed[] });
            setReviewRejected(new Set());
          } else if (ev.type === 'done') {
            setReview(null);
            onDeepJourneyBuilt?.();
          }
        }
      }
    } catch (e) {
      setBuildError(String((e as any)?.message ?? e));
    } finally {
      setBuildMode(null);
      setBuildProgress(null);
    }
  }

  // ── Step 1: CSV upload (shared parser; same batch endpoint + retry as the panel) ──
  const csvRef = useRef<HTMLInputElement>(null);
  const [csvProgress, setCsvProgress] = useState<{ current: number; total: number } | null>(null);
  const [csvStatus,   setCsvStatus]   = useState<null | { type: 'success' | 'error'; msg: string }>(null);
  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvStatus(null);
    const text = await file.text();
    const rows = parseKeywordCsvMeta(text).rows;
    const parsed = rows.map(r => ({
      keyword: r.keyword, searchVolume: r.searchVolume, position: r.position,
      type: (r.typeRaw !== null ? (r.typeRaw === 'ranked' ? 'ranked' : 'gap')
        : (r.position !== null && r.position <= 100 ? 'ranked' : 'gap')) as 'ranked' | 'gap',
      branded: isBrandedKeyword(r.keyword, clientDomain, competitors, brandTerms),
      serpFeatures: r.serpFeatures, url: r.url, positionType: r.positionType,
    }));
    if (parsed.length === 0) {
      setCsvStatus({ type: 'error', msg: 'No valid rows found. Expected columns: keyword, search_volume, type' });
      if (csvRef.current) csvRef.current.value = '';
      return;
    }
    const CHUNK = 250, MAX_ATTEMPTS = 3;
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
    let added = 0, failed = 0;
    setCsvProgress({ current: 0, total: parsed.length });
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      const payload = JSON.stringify({ domain: '', source: 'csv', keywords: chunk });
      let saved = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !saved; attempt++) {
        try {
          const res = await fetch(`/api/projects/${projectId}/keywords/batch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
          });
          if (res.ok) { const dd = await res.json(); added += (dd.inserted ?? 0) + (dd.updated ?? 0); saved = true; }
          else if (attempt < MAX_ATTEMPTS) await sleep(attempt * 800);
        } catch { if (attempt < MAX_ATTEMPTS) await sleep(attempt * 800); }
      }
      if (!saved) failed += chunk.length;
      setCsvProgress({ current: Math.min(i + CHUNK, parsed.length), total: parsed.length });
    }
    setCsvProgress(null);
    if (csvRef.current) csvRef.current.value = '';
    await fetchDb();
    onKeywordsChanged?.();
    setCsvStatus(failed > 0
      ? { type: 'error', msg: `Saved ${fmtN(added)} of ${fmtN(parsed.length)} rows — ${fmtN(failed)} failed; re-upload to retry.` }
      : { type: 'success', msg: `Saved ${fmtN(added)} of ${fmtN(parsed.length)} rows.` });
  }

  // ── Stepper model ───────────────────────────────────────────────────────────
  const baseDone  = clientCount > 0;
  const compDone  = gapCount > 0;
  const hasTree   = tree.nodes.length > 0;
  const [activeStep, setActiveStep] = useState<number>(0);   // 0 = auto
  // v7.478: Select categories is Step 2 (before competitors — their data is bounded by it)
  const shownStep = activeStep > 0 ? activeStep : (!baseDone ? 1 : 2);

  const elapsed = buildProgress ? (Date.now() - buildProgress.startedAt) / 1000 : 0;
  const eta = buildProgress && buildProgress.done > 0 && buildProgress.total > buildProgress.done
    ? Math.round((elapsed / buildProgress.done) * (buildProgress.total - buildProgress.done))
    : null;

  const steps = [
    { n: 1, title: 'Upload client footprint', sub: baseDone ? `${fmtN(clientCount)} client keywords` : 'required', done: baseDone },
    { n: 2, title: 'Select categories',       sub: hasTree ? `${draftStats.inRoots} of ${draftStats.totalRoots} in scope` : 'runs after categorization', done: hasTree && !draftDirty },
    { n: 3, title: 'Add competitors',         sub: compDone ? `${fmtN(gapCount)} gap keywords` : 'required', done: compDone },
    { n: 4, title: 'Expand footprint',        sub: productTopics > 0 ? `${fmtN(productTopics)} topics built` : 'optional · full-funnel', done: productTopics > 0 },
    { n: 5, title: 'Pre-product journey',     sub: preTopics > 0 ? `${fmtN(preTopics)} topics built` : 'optional · need-based', done: preTopics > 0 },
  ];

  // ── Shared bits ─────────────────────────────────────────────────────────────
  const btn = (accent: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, color: accent, background: 'transparent',
    border: `1px solid ${accent}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
  });
  const card: React.CSSProperties = { background: 'var(--c-0c0c16)', border: '1px solid var(--c-1e1e34)', borderRadius: 12, padding: '16px 18px' };

  const progressBar = buildProgress && (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--c-9090c0)', marginBottom: 5 }}>
        {buildProgress.total > 0
          ? <>Seed {fmtN(buildProgress.done)} of {fmtN(buildProgress.total)}{buildProgress.seed ? <> · <span style={{ color: 'var(--c-c8c8e8)' }}>{buildProgress.seed}</span></> : null}{eta !== null ? ` · ~${eta}s left` : ''}</>
          : <>Starting… {Math.round(elapsed)}s elapsed</>}
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--c-14142a)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: buildProgress.total > 0 ? `${Math.round((buildProgress.done / buildProgress.total) * 100)}%` : '8%', background: 'var(--c-6c63ff)', transition: 'width .3s' }} />
      </div>
    </div>
  );

  const reviewBlock = review && (
    <div style={{ ...card, marginTop: 12, borderColor: 'var(--c-6c63ff)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-e8e8ff)', marginBottom: 4 }}>
        Review before anything is added — {fmtN(review.totals.keywords)} keywords · {fmtVol(review.totals.volume)}/mo
      </div>
      <p style={{ fontSize: 11, color: 'var(--c-8080a8)', margin: '0 0 10px' }}>
        Nothing has been stored. Untick any seed that pulled off-topic keywords, then commit.
      </p>
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {review.seeds.map(s => {
          const rejected = reviewRejected.has(s.seed);
          return (
            <label key={s.seed} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: rejected ? 'var(--c-585878)' : 'var(--c-c8c8e8)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!rejected} style={{ accentColor: 'var(--c-6c63ff)', marginTop: 2 }}
                onChange={() => setReviewRejected(prev => { const n = new Set(prev); if (n.has(s.seed)) n.delete(s.seed); else n.add(s.seed); return n; })} />
              <span>
                <b>{s.label}</b> — {fmtN(s.keywords)} kw · {fmtVol(s.volume)}/mo
                <span style={{ display: 'block', color: 'var(--c-6868a8)' }}>{s.sample.slice(0, 4).map(x => x.keyword).join(' · ')}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={{ ...btn('var(--c-34d399)') }} disabled={!!buildMode}
          onClick={() => runDeepBuild(review.mode, { dryRun: false, excludeSeeds: Array.from(reviewRejected) })}>
          Commit {fmtN(review.seeds.length - reviewRejected.size)} seed{review.seeds.length - reviewRejected.size === 1 ? '' : 's'}
        </button>
        <button style={{ ...btn('var(--c-585878)') }} onClick={() => setReview(null)}>Cancel</button>
      </div>
    </div>
  );

  const boundaryNote = (text: React.ReactNode) => (
    <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.55, color: 'var(--c-9090c0)', background: 'var(--ca-108-99-255-0_6)', border: '1px dashed var(--c-6c63ff)', borderRadius: 9, padding: '9px 12px' }}>
      {text}
    </div>
  );

  // ── Tree row renderer ───────────────────────────────────────────────────────
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const renderNode = (n: SelectionNode, ancestorHidden: boolean): React.ReactNode => {
    const keyLow = n.key.toLowerCase();
    const selfEntry = hiddenDraft.has(keyLow);
    const hid = ancestorHidden || selfEntry;
    const collapsed = collapsedKeys.has(keyLow);
    const someHiddenBelow = !hid && n.children.some(c => isNodeHidden(c.key));
    return (
      <div key={n.key}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, opacity: hid ? 0.5 : 1 }}>
          <span onClick={() => n.children.length > 0 && setCollapsedKeys(prev => { const s = new Set(prev); if (s.has(keyLow)) s.delete(keyLow); else s.add(keyLow); return s; })}
            style={{ width: 16, textAlign: 'center', color: 'var(--c-585878)', cursor: n.children.length > 0 ? 'pointer' : 'default', fontWeight: 800, fontSize: 12, userSelect: 'none' }}>
            {n.children.length > 0 ? (collapsed ? '+' : '−') : ''}
          </span>
          <input type="checkbox" checked={!hid} ref={el => { if (el) el.indeterminate = someHiddenBelow; }}
            onChange={() => toggleNode(n)}
            style={{ width: 14, height: 14, accentColor: 'var(--c-6c63ff)', cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ fontSize: n.depth === 0 ? 12.5 : 12, fontWeight: n.depth === 0 ? 700 : 600, color: n.depth === 0 ? 'var(--c-e8e8ff)' : 'var(--c-c8c8e8)' }}>{n.name}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: 'var(--c-585878)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            <span><b style={{ color: 'var(--c-9090c0)', fontWeight: 700 }}>{fmtN(n.kwCount)}</b> kw</span>
            <span><b style={{ color: 'var(--c-9090c0)', fontWeight: 700 }}>{fmtVol(n.monthlyVol)}</b>/mo</span>
          </span>
        </div>
        {!collapsed && n.children.length > 0 && (
          <div style={{ marginLeft: 22, borderLeft: '1px solid var(--c-1e1e34)', paddingLeft: 2 }}>
            {n.children.map(c => renderNode(c, hid))}
          </div>
        )}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 overflow-y-auto animate-fade-in">
      <div style={{ padding: '18px 22px 90px' }}>
        <div style={{ marginBottom: 4 }}>
          <h2 className="text-orbit-primary font-semibold" style={{ fontSize: 16 }}>Keyword Selection</h2>
          <p style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--c-8080a8)', margin: '4px 0 0', maxWidth: 760 }}>
            The workflow that builds this project&rsquo;s keyword pool. Steps 1–3 are required; steps 4 and 5 are optional expansions —
            <b style={{ color: 'var(--c-c8c8e8)' }}> both are locked to the categories selected in Step 2</b>. The Keyword list and every panel, scan and report read only what&rsquo;s in scope.
          </p>
        </div>

        {/* Stepper — the tab bar; one step shows at a time */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 0, margin: '14px 0 18px', background: 'var(--c-0c0c16)', border: '1px solid var(--c-1e1e34)', borderRadius: 12, overflow: 'hidden' }}>
          {steps.map(s => {
            const active = shownStep === s.n;
            return (
              <button key={s.n} onClick={() => setActiveStep(s.n)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '10px 12px',
                  background: active ? 'var(--ca-108-99-255-0_6)' : 'transparent',
                  borderRight: s.n < 5 ? '1px solid var(--c-1e1e34)' : 'none', borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
                  cursor: 'pointer',
                }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, flexShrink: 0,
                  background: active ? 'var(--c-6c63ff)' : s.done ? 'var(--ca-52-211-153-0_12)' : 'var(--c-14142a)',
                  color: active ? 'var(--on-fill-accent)' : s.done ? 'var(--c-34d399)' : 'var(--c-585878)' }}>
                  {s.done && !active ? '✓' : s.n}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: active ? 'var(--c-e8e8ff)' : s.done ? 'var(--c-34d399)' : 'var(--c-9090c0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, color: 'var(--c-585878)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Step 1 ── */}
        {shownStep === 1 && (
          <div style={{ ...card, maxWidth: 620 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-e8e8ff)', marginBottom: 8 }}>Step 1 · Client footprint</div>
            <div style={{ fontSize: 12, color: 'var(--c-9090c0)', marginBottom: 10 }}>
              {dbLoaded
                ? baseDone
                  ? <><b style={{ color: 'var(--c-34d399)' }}>{fmtN(clientCount)}</b> client keywords on file.</>
                  : 'Upload the full Semrush export — scoping happens in Step 2, so upload everything.'
                : 'Loading keywords…'}
            </div>
            <label style={{ ...btn('var(--c-6c63ff)'), display: 'inline-block', opacity: csvProgress ? 0.5 : 1, pointerEvents: csvProgress ? 'none' : 'auto' }}>
              {baseDone ? 'Re-upload CSV' : 'Upload CSV'}
              <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvUpload} />
            </label>
            {csvProgress && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--c-9090c0)' }}>
                Saving {fmtN(csvProgress.current)} of {fmtN(csvProgress.total)} rows…
                <div style={{ height: 6, borderRadius: 4, background: 'var(--c-14142a)', overflow: 'hidden', marginTop: 5 }}>
                  <div style={{ height: '100%', width: `${Math.round((csvProgress.current / Math.max(1, csvProgress.total)) * 100)}%`, background: 'var(--c-6c63ff)', transition: 'width .3s' }} />
                </div>
              </div>
            )}
            {csvStatus && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: csvStatus.type === 'success' ? 'var(--c-34d399)' : 'var(--c-f87171)' }}>{csvStatus.msg}</div>
            )}
            <p style={{ fontSize: 10.5, color: 'var(--c-585878)', marginTop: 10 }}>
              Uploading re-runs auto-categorization into the same anchored tree, so Step-3 selections keep their names.
            </p>
          </div>
        )}

        {/* ── Step 3 · Competitors (v7.478: after category selection — bounded by it) ── */}
        {shownStep === 3 && (
          <div style={{ ...card, maxWidth: 620 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-e8e8ff)', marginBottom: 8 }}>Step 3 · Competitor footprints</div>
            <div style={{ fontSize: 12, color: 'var(--c-9090c0)', marginBottom: 10 }}>
              {compDone
                ? <><b style={{ color: 'var(--c-34d399)' }}>{fmtN(gapCount)}</b> competitor-gap keywords loaded{competitors.length > 0 ? <> across <b style={{ color: 'var(--c-c8c8e8)' }}>{competitors.length}</b> competitor{competitors.length === 1 ? '' : 's'}</> : null}.</>
                : competitors.length > 0
                  ? `${competitors.length} competitor${competitors.length === 1 ? '' : 's'} added — no keyword data yet.`
                  : 'Add competitor domains and upload their keyword CSVs.'}
            </div>
            <button style={btn('var(--c-f59e0b)')} onClick={() => onOpenCompetitors?.()}>
              {compDone ? 'Manage competitors' : competitors.length > 0 ? 'Upload competitor data' : 'Add competitors'}
            </button>
            <p style={{ fontSize: 10.5, color: 'var(--c-585878)', marginTop: 10 }}>
              Competitors categorize into the same anchored tree and inherit the Step-2 selection automatically — apples to apples. Their out-of-scope keywords are excluded from every comparison and total.
            </p>
          </div>
        )}

        {/* ── Step 2 · Select categories (v7.478) ── */}
        {shownStep === 2 && (
          !hasTree ? (
            <div style={{ ...card, maxWidth: 620, fontSize: 12, color: 'var(--c-9090c0)' }}>
              No stored category tree yet — run an analysis (or upload a footprint) first. Categorization builds the tree this step selects from.
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-9090c0)', background: 'var(--c-0c0c16)', border: '1px solid var(--c-1e1e34)', borderRadius: 999, padding: '5px 11px' }}>
                  <b style={{ color: 'var(--c-e8e8ff)' }}>{fmtN(draftStats.inKw)}</b> in scope · <b style={{ color: 'var(--c-e8e8ff)' }}>{fmtVol(draftStats.inVol)}</b>/mo
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-9090c0)', background: 'var(--c-0c0c16)', border: '1px solid var(--c-1e1e34)', borderRadius: 999, padding: '5px 11px' }}>
                  <b style={{ color: 'var(--c-f59e0b)' }}>{fmtN(draftStats.outKw)}</b> out of scope · <b style={{ color: 'var(--c-f59e0b)' }}>{fmtVol(draftStats.outVol)}</b>/mo
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--c-585878)', marginLeft: 'auto' }}>
                  Default: everything selected — narrowing is your explicit choice.
                  {scopeSavedAt ? ` Scope last saved ${new Date(scopeSavedAt).toLocaleString()}.` : ''}
                </span>
              </div>
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--c-1e1e34)', background: 'var(--c-0a0a14)' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--c-e8e8ff)' }}>Category tree — check any level; a checked parent covers all children</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button style={btn('var(--c-6c63ff)')} onClick={() => setAll(true)}>Select all</button>
                    <button style={btn('var(--c-585878)')} onClick={() => setAll(false)}>Clear all</button>
                  </span>
                </div>
                <div style={{ maxHeight: 520, overflowY: 'auto', padding: '8px 10px 12px' }}>
                  {tree.nodes.map(n => renderNode(n, false))}
                  {brandCatNames.size > 0 && (
                    <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--c-585878)', padding: '0 8px' }}>
                      Brand categories are always in scope and are not listed here (the brand guard owns them).
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button
                  onClick={saveScope}
                  disabled={scopeSaving || !draftDirty}
                  style={{ fontSize: 12.5, fontWeight: 800, color: draftDirty ? 'var(--on-fill-accent)' : 'var(--c-585878)', background: draftDirty ? 'var(--c-6c63ff)' : 'var(--c-14142a)', border: 'none', borderRadius: 9, padding: '10px 22px', cursor: scopeSaving || !draftDirty ? 'default' : 'pointer', opacity: scopeSaving ? 0.6 : 1 }}>
                  {scopeSaving ? 'Saving…' : draftDirty ? 'Confirm selection' : 'Selection saved'}
                </button>
                {scopeError && <span style={{ fontSize: 11.5, color: 'var(--c-f87171)' }}>{scopeError}</span>}
                {!scopeError && !draftDirty && (
                  <span style={{ fontSize: 11, color: 'var(--c-585878)' }}>Every panel, scan and the PDF read only the in-scope pool. Restoring a category is instant — nothing is deleted.</span>
                )}
              </div>
            </div>
          )
        )}

        {/* ── Step 4 ── */}
        {shownStep === 4 && (
          <div style={{ ...card, maxWidth: 760 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-e8e8ff)', marginBottom: 4 }}>
              Step 4 · Expand footprint <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--c-f59e0b)', border: '1px solid var(--c-f59e0b)', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>OPTIONAL</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--c-9090c0)', margin: '0 0 4px' }}>
              Expand across the full funnel journey — Awareness → Consideration → Decision → Retention demand the client doesn&rsquo;t rank for yet. Real Semrush volumes only.
            </p>
            <div style={{ fontSize: 11.5, color: 'var(--c-9090c0)' }}>
              {productTopics > 0 ? <>Built: <b style={{ color: 'var(--c-34d399)' }}>{fmtN(productTopics)}</b> volume-backed topics{du?.status ? ` · ${du.status}` : ''}.</> : 'Not built yet.'}
              {buildGated > 0 && <span style={{ color: 'var(--c-f59e0b)' }}> {buildGated} out-of-scope seed{buildGated === 1 ? '' : 's'} skipped.</span>}
            </div>
            {boundaryNote(<><b style={{ color: 'var(--c-c8c8e8)' }}>Boundary:</b> expansion files ONLY into the categories selected in Step 2 — it can never create a new topic or category. Out-of-scope seeds are skipped before any API spend, and every discovered keyword lands inside the existing anchored tree.</>)}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <button style={btn('var(--c-9b96ff)')} disabled={!!buildMode} onClick={() => runDeepBuild('product', { dryRun: true })}>
                {productTopics > 0 ? 'Re-run expansion' : 'Run expansion'}
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--c-8080a8)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeRelated} disabled={!!buildMode} onChange={e => setIncludeRelated(e.target.checked)} style={{ accentColor: 'var(--c-9b96ff)' }} />
                also pull loosely related terms
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--c-8080a8)' }}>
                min volume
                <input type="number" min={0} step={100} disabled={!!buildMode} value={minVolume > 0 ? minVolume : ''} placeholder="none"
                  onChange={e => setMinVolume(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ width: 74, fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--c-14142a)', border: '1px solid var(--c-1e1e34)', color: 'var(--c-c8c8e8)', outline: 'none' }} />
                /mo
              </label>
            </div>
            {buildMode === 'product' && progressBar}
            {buildError && buildMode !== 'pre' && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--c-f87171)' }}>{buildError}</div>}
            {review?.mode === 'product' && reviewBlock}
          </div>
        )}

        {/* ── Step 5 ── */}
        {shownStep === 5 && (
          <div style={{ ...card, maxWidth: 760 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-e8e8ff)', marginBottom: 4 }}>
              Step 5 · Pre-product journey <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--c-f59e0b)', border: '1px solid var(--c-f59e0b)', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>OPTIONAL</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--c-9090c0)', margin: '0 0 4px' }}>
              Awareness-only, need-based demand — the life events, pain points and goals that come before the user knows the product exists. Seeded from this client&rsquo;s own audience language.
            </p>
            <div style={{ fontSize: 11.5, color: 'var(--c-9090c0)' }}>
              {preTopics > 0 ? <>Built: <b style={{ color: 'var(--c-34d399)' }}>{fmtN(preTopics)}</b> problem / trigger topics.</> : 'Not built yet.'}
            </div>
            {boundaryNote(<><b style={{ color: 'var(--c-c8c8e8)' }}>Boundaries:</b> results follow the same Step-2 category selection — and this lane NEVER names the client&rsquo;s products or services. Any keyword mapping to a product category is kept out of the pre-product journey (need-state language only).</>)}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
              <button style={btn('var(--c-22d3ee)')} disabled={!!buildMode} onClick={() => runDeepBuild('pre', { dryRun: true })}>
                {preTopics > 0 ? 'Re-run build' : 'Run build'}
              </button>
            </div>
            {buildMode === 'pre' && progressBar}
            {buildError && buildMode !== 'product' && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--c-f87171)' }}>{buildError}</div>}
            {review?.mode === 'pre' && reviewBlock}
          </div>
        )}

        {/* Footer: jump to the list the wizard gates */}
        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--c-585878)' }}>
          Done here? <button onClick={() => onGoToKeywordList?.()} style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-6c63ff)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Open the Keyword list</button> — it shows only what&rsquo;s in scope.
        </div>
      </div>
    </div>
  );
}
