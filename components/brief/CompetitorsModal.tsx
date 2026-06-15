'use client';

/**
 * CompetitorsModal — v7.106
 *
 * v7.106: every competitor row now shows its uploaded keyword count even when
 * zero ("0 kws uploaded — no CSV; auto-discover on next full analysis") so
 * the count is always visible at a glance per competitor.
 *
 * v7.105: uploading a CSV onto a competitor that already has uploaded
 * keywords now asks Replace (clear that competitor's rows first, then load
 * only the new file) or Merge (the v7.92 upsert: update matches, add new).
 * Prevents stale rows surviving a re-upload when the user expected the new
 * file to fully replace the old one.
 *
 * Single home for ALL competitor management, opened from the "Competitors"
 * button in the project's top global nav. Replaces:
 *   - CompetitorsPanel inside EditProjectModal (add/remove)
 *   - the "Competitor Gap" upload dropdown inside KeywordsPanel (CSV upload)
 *   - the Keyword Volume Thresholds section of EditProjectModal
 *
 * Per-competitor row: favicon · name/domain (inline-editable) · live uploaded
 * keyword stats from project_keywords (count + how many carry rank positions,
 * which page-1 Share of Voice needs) · Upload CSV · Clear keywords · Delete.
 *
 * Volume thresholds save instantly on click (same PATCH as Edit Project and
 * RefreshModal — the project record is the single source of truth, v7.98).
 *
 * v7.94 lesson applied: NO <form> anywhere in this modal and every <button>
 * has an explicit type="button" — buttons without a type default to submit
 * and will save/close any ancestor form.
 *
 * CSV parsing is the v7.92 header-aware parser (identical column detection
 * to the client CSV parser): keyword/keywords/ph/query · search volume/
 * search_volume/searchvolume/volume/monthly volume/nq · position/rank/
 * ranking position/pos/po. Quoted fields and BOM handled.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

interface Competitor {
  id:        string;
  domain:    string;
  name:      string | null;
  createdAt: string;
}

interface KwRow {
  id:           number;
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  source:       string;
  domain:       string | null;
}

interface Props {
  projectId:   string;
  competitors: Competitor[];
  kwVolThresholdClient:     number;
  kwVolThresholdCompetitor: number;
  brandTerms?:          string[];        // v7.206: client brand vocabulary
  brandTermsUpdatedAt?: string | null;   // v7.206: last edit time (Art IV.5)
  onClose:   () => void;
  onChanged: () => void;   // re-fetches the project upstream
}

const VOL_PRESETS: { label: string; value: number }[] = [
  { label: 'All',   value: 0    },
  { label: '500+',  value: 500  },
  { label: '1K+',   value: 1000 },
  { label: '2.4K+', value: 2400 },
  { label: '5K+',   value: 5000 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normDomain(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/^www\./, '').split('/')[0];
}

interface ParsedKw { keyword: string; searchVolume: number; position: number | null; serpFeatures: string | null; }

/** v7.92 header-aware competitor CSV parser (same column detection as client uploads). */
function parseCompetitorCsv(text: string): ParsedKw[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const headerCols = (lines[0] ?? '').toLowerCase().split(',').map(c => c.replace(/^"|"$/g, '').trim());
  const findIdx = (names: string[], fallback: number) => {
    const i = headerCols.findIndex(h => names.includes(h));
    return i >= 0 ? i : fallback;
  };
  const kwIdx  = findIdx(['keyword', 'keywords', 'ph', 'query'], 0);
  const volIdx = findIdx(['search volume', 'search_volume', 'searchvolume', 'volume', 'monthly volume', 'nq'], 1);
  const posIdxRaw = headerCols.findIndex(h => ['position', 'rank', 'ranking position', 'pos', 'po'].includes(h));
  // v7.103: Semrush "SERP Features by Keyword" column (optional)
  const featIdx = headerCols.findIndex(h => ['serp features by keyword', 'serp features', 'serp_features'].includes(h));

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = ''; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.replace(/\r$/, '').trim());
    return result;
  }

  return lines.slice(1)
    .filter(l => l.trim().length > 0)
    .map(line => {
      const cols   = splitLine(line);
      const posRaw = posIdxRaw >= 0 ? cols[posIdxRaw] : undefined;
      const pos    = posRaw != null && posRaw !== '' && !isNaN(Number(posRaw)) ? Number(posRaw) : null;
      return {
        keyword:      (cols[kwIdx] ?? '').replace(/^"|"$/g, '').trim().toLowerCase(),
        searchVolume: parseInt(cols[volIdx] ?? '0') || 0,
        position:     pos,
        serpFeatures: featIdx >= 0 ? ((cols[featIdx] ?? '').replace(/^"|"$/g, '').trim() || null) : null,
      };
    })
    .filter(r => r.keyword.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CompetitorsModal({
  projectId,
  competitors,
  kwVolThresholdClient:     initClientThresh,
  kwVolThresholdCompetitor: initCompetitorThresh,
  brandTerms:          initBrandTerms = [],
  brandTermsUpdatedAt: initBrandUpdatedAt = null,
  onClose,
  onChanged,
}: Props) {

  // ── v7.206: client brand vocabulary (the terms that count as BRANDED) ──
  const [terms,       setTerms]       = useState<string[]>(() =>
    Array.from(new Set((initBrandTerms ?? []).map(t => t.toLowerCase().trim()).filter(Boolean))));
  const [newTerm,     setNewTerm]     = useState('');
  const [brandState,  setBrandState]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [suggesting,  setSuggesting]  = useState(false);
  const [suggestErr,  setSuggestErr]  = useState('');
  const [brandUpdatedAt, setBrandUpdatedAt] = useState<string | null>(initBrandUpdatedAt);

  function addTermLocal(raw: string) {
    const t = raw.toLowerCase().trim();
    if (!t) return;
    setTerms(prev => Array.from(new Set([...prev, t])));
    setNewTerm('');
  }
  function removeTermLocal(t: string) {
    setTerms(prev => prev.filter(x => x !== t));
  }

  async function saveBrandTerms(next: string[]) {
    setBrandState('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ brandTerms: next }),
      });
      if (!res.ok) { setBrandState('error'); return; }
      const data = await res.json();
      setBrandUpdatedAt(data?.project?.brandTermsUpdatedAt ?? new Date().toISOString());
      setBrandState('saved');
      onChanged();   // refetch project → panels recompute branded counts
      setTimeout(() => setBrandState('idle'), 2000);
    } catch {
      setBrandState('error');
    }
  }

  async function suggestBrandTerms() {
    if (suggesting) return;
    setSuggesting(true); setSuggestErr('');
    try {
      const res  = await fetch(`/api/projects/${projectId}/brand-terms/suggest`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setSuggestErr(typeof data.error === 'string' ? data.error : 'Could not get suggestions.'); return; }
      const proposed: string[] = Array.isArray(data.brandTerms) ? data.brandTerms : [];
      if (proposed.length === 0) { setSuggestErr('No suggestions returned — add terms manually.'); return; }
      setTerms(prev => Array.from(new Set([...prev, ...proposed.map(t => t.toLowerCase().trim()).filter(Boolean)])));
    } catch {
      setSuggestErr('Could not reach the suggestion service.');
    } finally {
      setSuggesting(false);
    }
  }

  // ── Uploaded keyword stats (live from DB) ──
  const [kwRows,   setKwRows]   = useState<KwRow[] | null>(null);
  const [kwError,  setKwError]  = useState(false);

  async function fetchKeywords() {
    try {
      const res  = await fetch(`/api/projects/${projectId}/keywords`);
      const data = await res.json();
      setKwRows((data.keywords ?? []) as KwRow[]);
      setKwError(false);
    } catch {
      setKwRows([]);
      setKwError(true);
    }
  }
  useEffect(() => { fetchKeywords(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId]);

  /** Per-domain stats over UPLOADED rows (source csv/custom). */
  const domainStats = useMemo(() => {
    const map: Record<string, { count: number; withPos: number; volMonthly: number }> = {};
    (kwRows ?? []).forEach(r => {
      if (r.source !== 'csv' && r.source !== 'custom') return;
      const d = normDomain(r.domain ?? '');
      if (!d) return;
      const entry = map[d] ?? (map[d] = { count: 0, withPos: 0, volMonthly: 0 });
      entry.count      += 1;
      entry.withPos    += r.position != null ? 1 : 0;
      entry.volMonthly += r.searchVolume || 0;
    });
    return map;
  }, [kwRows]);

  // ── Add competitor ──
  const [showAdd,   setShowAdd]   = useState(false);
  const [addDomain, setAddDomain] = useState('');
  const [addName,   setAddName]   = useState('');
  const [adding,    setAdding]    = useState(false);
  const [addError,  setAddError]  = useState('');

  async function addCompetitor() {
    if (!addDomain.trim() || adding) return;
    setAdding(true); setAddError('');
    try {
      const res  = await fetch(`/api/projects/${projectId}/competitors`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain: addDomain.trim(), name: addName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(typeof data.error === 'string' ? data.error : 'Failed to add competitor.'); return; }
      setAddDomain(''); setAddName(''); setShowAdd(false);
      onChanged();
    } catch {
      setAddError('Network error — please try again.');
    } finally {
      setAdding(false);
    }
  }

  // ── Edit competitor (inline) ──
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editDomain, setEditDomain] = useState('');
  const [editName,   setEditName]   = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');

  function startEdit(c: Competitor) {
    setEditingId(c.id); setEditDomain(c.domain); setEditName(c.name ?? '');
    setEditError(''); setConfirmDeleteId(null); setConfirmClearId(null);
  }

  async function saveEdit() {
    if (!editingId || !editDomain.trim() || editSaving) return;
    setEditSaving(true); setEditError('');
    try {
      const res  = await fetch(`/api/projects/${projectId}/competitors/${editingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain: editDomain.trim(), name: editName.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(typeof data.error === 'string' ? data.error : 'Save failed.'); return; }
      setEditingId(null);
      onChanged();
      fetchKeywords();   // domain rename moves uploaded rows with it
    } catch {
      setEditError('Network error — please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete competitor (+ its uploaded keywords) ──
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

  async function deleteCompetitor(cid: string) {
    setDeletingId(cid);
    try {
      await fetch(`/api/projects/${projectId}/competitors/${cid}`, { method: 'DELETE' });
      onChanged();
      fetchKeywords();
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  // ── Clear a competitor's uploaded keywords ──
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null);
  const [clearingId,     setClearingId]     = useState<string | null>(null);

  async function clearKeywords(c: Competitor) {
    setClearingId(c.id);
    try {
      await fetch(`/api/projects/${projectId}/keywords/clear`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sources: ['csv', 'custom'], domain: normDomain(c.domain) }),
      });
      fetchKeywords();
    } finally {
      setClearingId(null);
      setConfirmClearId(null);
    }
  }

  // ── CSV upload (per row) ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<Competitor | null>(null);
  const [uploadingId,  setUploadingId]  = useState<string | null>(null);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [rowStatus,    setRowStatus]    = useState<Record<string, { type: 'success' | 'error'; msg: string }>>({});

  function pickFile(c: Competitor) {
    setUploadTarget(c);
    // Defer the click so state is set before the dialog opens
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  // v7.105: when the competitor already has uploaded keywords, the user must
  // choose Replace (clear existing rows first) or Merge (v7.92 upsert) before
  // the upload runs. Parsed rows wait here until they pick.
  const [pendingUpload, setPendingUpload] = useState<{ competitor: Competitor; parsed: ParsedKw[] } | null>(null);

  function setStatusFor(id: string, s: { type: 'success' | 'error'; msg: string } | null) {
    setRowStatus(prev => {
      const next = { ...prev };
      if (s) next[id] = s; else delete next[id];
      return next;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file   = e.target.files?.[0];
    const target = uploadTarget;
    e.target.value = '';
    if (!file || !target) return;

    let text = '';
    try { text = await file.text(); } catch {
      setStatusFor(target.id, { type: 'error', msg: 'Could not read file.' }); return;
    }
    const parsed = parseCompetitorCsv(text);
    if (!parsed.length) {
      setStatusFor(target.id, { type: 'error', msg: 'No valid rows. Expected columns: keyword, search_volume, position.' });
      return;
    }

    // v7.105: existing uploaded rows for this domain? Ask Replace vs Merge.
    const existing = domainStats[normDomain(target.domain)]?.count ?? 0;
    if (existing > 0) {
      setStatusFor(target.id, null);
      setConfirmClearId(null); setConfirmDeleteId(null);
      setPendingUpload({ competitor: target, parsed });
      return;
    }
    await runUpload(target, parsed, false);
  }

  /** Uploads parsed rows; when replace=true, clears the competitor's existing
   *  uploaded rows (source csv/custom, this domain only) first. */
  async function runUpload(target: Competitor, parsed: ParsedKw[], replace: boolean) {
    setPendingUpload(null);
    setUploadingId(target.id); setUploadPct(0); setStatusFor(target.id, null);
    const nd = normDomain(target.domain);

    if (replace) {
      try {
        const res = await fetch(`/api/projects/${projectId}/keywords/clear`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sources: ['csv', 'custom'], domain: nd }),
        });
        if (!res.ok) throw new Error('clear failed');
      } catch {
        // Abort — merging when the user asked for replace would be worse.
        setUploadingId(null); setUploadTarget(null);
        setStatusFor(target.id, { type: 'error', msg: 'Could not clear existing keywords — upload cancelled. Nothing was changed.' });
        setTimeout(() => setStatusFor(target.id, null), 8000);
        return;
      }
    }

    let added = 0; let skipped = 0;
    const CHUNK = 500;
    for (let i = 0; i < parsed.length; i += CHUNK) {
      try {
        const res = await fetch(`/api/projects/${projectId}/keywords/batch`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ domain: nd, source: 'csv', keywords: parsed.slice(i, i + CHUNK) }),
        });
        if (res.ok) { const d = await res.json(); added += (d.inserted ?? 0) + (d.updated ?? 0); skipped += d.skipped ?? 0; }
        else skipped += Math.min(CHUNK, parsed.length - i);
      } catch { skipped += Math.min(CHUNK, parsed.length - i); }
      setUploadPct(Math.round(Math.min(i + CHUNK, parsed.length) / parsed.length * 100));
    }
    setUploadingId(null); setUploadTarget(null);
    await fetchKeywords();
    const skipNote = skipped > 0 ? ` · ${skipped} skipped` : '';
    setStatusFor(target.id, added > 0
      ? { type: 'success', msg: `${added.toLocaleString()} keywords ${replace ? 'uploaded (replaced existing)' : 'uploaded/updated'}${skipNote}.` }
      : { type: 'error',   msg: 'No keyword rows were saved.' });
    setTimeout(() => setStatusFor(target.id, null), 6000);
  }

  // ── Volume thresholds — instant save on click ──
  const [clientThresh,     setClientThresh]     = useState<number>(initClientThresh     ?? 0);
  const [competitorThresh, setCompetitorThresh] = useState<number>(initCompetitorThresh ?? 0);
  const [threshState,      setThreshState]      = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function saveThresholds(client: number, competitor: number) {
    setClientThresh(client); setCompetitorThresh(competitor);
    setThreshState('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ kwVolThresholdClient: client, kwVolThresholdCompetitor: competitor }),
      });
      if (!res.ok) { setThreshState('error'); return; }
      setThreshState('saved');
      onChanged();
      setTimeout(() => setThreshState(s => (s === 'saved' ? 'idle' : s)), 2500);
    } catch {
      setThreshState('error');
    }
  }

  // ── Styles ──
  const presetBtn = (value: number, current: number, color: { bg: string; border: string; text: string }): React.CSSProperties => {
    const active = current === value;
    return {
      padding: '4px 11px', borderRadius: '20px',
      border: `1px solid ${active ? color.border : 'var(--c-3a3a5c)'}`,
      background: active ? color.bg : 'transparent',
      color: active ? color.text : 'var(--c-8888b0)',
      fontSize: '11px', cursor: 'pointer', transition: 'all 0.12s',
      fontWeight: active ? 600 : 400,
    };
  };
  const clientColor     = { bg: 'var(--ca-56-189-248-0_14)', border: 'var(--ca-56-189-248-0_6)', text: 'var(--c-38bdf8)' };
  const competitorColor = { bg: 'var(--ca-245-158-11-0_14)', border: 'var(--ca-245-158-11-0_6)', text: 'var(--c-f59e0b)' };

  const iconBtnStyle = (color: string, disabled?: boolean): React.CSSProperties => ({
    background: 'none', border: '1px solid var(--c-26264a)', borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer', color, padding: '5px 7px',
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    fontSize: '10px', opacity: disabled ? 0.4 : 1, whiteSpace: 'nowrap',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--c-111120)', border: '1px solid var(--c-1e1e35)',
    borderRadius: '8px', padding: '8px 11px', color: 'var(--c-f0f0ff)',
    fontSize: '12px', outline: 'none', boxSizing: 'border-box',
  };

  function SectionLabel({ label }: { label: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', color: 'var(--c-4a4a72)', textTransform: 'uppercase' }}>{label}</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--c-1a1a30)' }} />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Hidden shared file input for per-row uploads */}
      <input type="file" accept=".csv,.txt" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

      <div
        className="relative animate-fade-in"
        style={{
          width: '100%', maxWidth: '760px',
          background: 'var(--c-0c0c18)', border: '1px solid var(--c-1e1e35)', borderRadius: '14px',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px var(--ca-0-0-0-0_7)',
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 16px', borderBottom: '1px solid var(--c-1a1a2e)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--ca-245-158-11-0_10)', border: '1px solid var(--ca-245-158-11-0_25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-users" style={{ fontSize: '14px', color: 'var(--c-f59e0b)' }} aria-hidden="true" />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-e8e8ff)', margin: 0 }}>Competitors</h2>
              <p style={{ fontSize: '11px', color: 'var(--c-555575)', margin: '2px 0 0' }}>Tracked competitors, keyword CSVs &amp; volume thresholds</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-505070)', padding: '4px' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body (NOT a form — see v7.94 lesson) ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 22px' }}>

          {/* ── Section 1: Tracked competitors ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <SectionLabel label={`Tracked Competitors (${competitors.length})`} />
            <button type="button"
              onClick={() => { setShowAdd(v => !v); setAddError(''); }}
              style={{
                marginLeft: '12px', marginBottom: '14px', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                fontSize: '11px', color: 'var(--c-8b85ff)', background: showAdd ? 'var(--ca-108-99-255-0_08)' : 'none',
                border: '1px solid var(--ca-108-99-255-0_35)', borderRadius: '8px',
                padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Competitor
            </button>
          </div>

          {/* Add form */}
          {showAdd && (
            <div style={{ background: 'var(--c-10101e)', border: '1px solid var(--c-222240)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--c-7070a0)', marginBottom: '5px' }}>DOMAIN *</label>
                  <input value={addDomain} onChange={e => setAddDomain(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
                    placeholder="competitor.com" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--c-7070a0)', marginBottom: '5px' }}>NAME (OPTIONAL)</label>
                  <input value={addName} onChange={e => setAddName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
                    placeholder="Competitor Co." style={inputStyle} />
                </div>
              </div>
              {addError && <p style={{ fontSize: '11px', color: 'var(--c-f87171)', margin: '0 0 8px' }}>{addError}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { setShowAdd(false); setAddDomain(''); setAddName(''); setAddError(''); }}
                  style={{ flex: 1, fontSize: '11px', color: 'var(--c-8080a8)', background: 'transparent', border: '1px solid var(--c-2a2a48)', padding: '7px', borderRadius: '7px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="button" disabled={!addDomain.trim() || adding} onClick={addCompetitor}
                  style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: 'var(--c-ffffff)', background: 'var(--c-6c63ff)', border: 'none', padding: '7px', borderRadius: '7px', cursor: 'pointer', opacity: !addDomain.trim() || adding ? 0.4 : 1 }}>
                  {adding ? 'Adding…' : 'Add'}
                </button>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--c-505070)', margin: '10px 0 0', lineHeight: 1.5 }}>
                After adding, upload their keyword CSV from the row below (0 Semrush units) — or leave it and the next full analysis auto-discovers their footprint via Semrush (billed per keyword row).
              </p>
            </div>
          )}

          {/* Rows */}
          {competitors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '18px 0 22px' }}>
              <p style={{ fontSize: '12px', color: 'var(--c-555575)', margin: 0 }}>No competitors tracked yet.</p>
              <p style={{ fontSize: '10px', color: 'var(--c-404060)', margin: '4px 0 0' }}>Add competitors to include them in gap analysis and Share of Voice.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '6px' }}>
              {competitors.map(c => {
                const nd      = normDomain(c.domain);
                const stats   = domainStats[nd];
                const status  = rowStatus[c.id];
                const editing = editingId === c.id;
                const busy    = uploadingId === c.id || clearingId === c.id || deletingId === c.id;

                return (
                  <div key={c.id} style={{ background: 'var(--c-141428)', border: '0.5px solid var(--c-2a2a4a)', borderRadius: '9px', padding: '11px 13px' }}>
                    {editing ? (
                      /* ── Inline edit ── */
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                          <input value={editDomain} onChange={e => setEditDomain(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } }}
                            placeholder="competitor.com" style={inputStyle} />
                          <input value={editName} onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(); } }}
                            placeholder="Name (optional)" style={inputStyle} />
                        </div>
                        {editError && <p style={{ fontSize: '11px', color: 'var(--c-f87171)', margin: '0 0 8px' }}>{editError}</p>}
                        {normDomain(editDomain) !== nd && (
                          <p style={{ fontSize: '10px', color: 'var(--c-f59e0b)', margin: '0 0 8px' }}>
                            Domain change: any uploaded keywords move to the new domain automatically.
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" onClick={() => setEditingId(null)}
                            style={{ fontSize: '11px', color: 'var(--c-8080a8)', background: 'transparent', border: '1px solid var(--c-2a2a48)', padding: '5px 14px', borderRadius: '7px', cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button type="button" disabled={!editDomain.trim() || editSaving} onClick={saveEdit}
                            style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-ffffff)', background: 'var(--c-6c63ff)', border: 'none', padding: '5px 16px', borderRadius: '7px', cursor: 'pointer', opacity: !editDomain.trim() || editSaving ? 0.4 : 1 }}>
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Display row ── */
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=16`}
                          alt="" style={{ width: '16px', height: '16px', borderRadius: '3px', opacity: 0.7, flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--c-c0c0e0)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name ?? c.domain}
                          </p>
                          <p style={{ fontSize: '10px', color: 'var(--c-555575)', margin: '2px 0 0' }}>
                            {c.name ? `${c.domain} · ` : ''}
                            {kwRows === null ? (
                              <span>loading keywords…</span>
                            ) : stats && stats.count > 0 ? (
                              <span style={{ color: 'var(--c-4ade80)' }}>
                                {stats.count.toLocaleString()} kws uploaded · {stats.withPos.toLocaleString()} with position
                                {stats.withPos === 0 && <span style={{ color: 'var(--c-f59e0b)' }}> — re-upload with a Position column for page-1 SOV</span>}
                              </span>
                            ) : (
                              /* v7.106: always show the count, even at zero */
                              <span><span style={{ color: 'var(--c-8888b0)', fontWeight: 600 }}>0 kws uploaded</span> — no CSV; auto-discover on next full analysis</span>
                            )}
                            {kwError && <span style={{ color: 'var(--c-f87171)' }}> (keyword stats unavailable)</span>}
                          </p>
                        </div>

                        {/* Status toast */}
                        {status && (
                          <span style={{
                            fontSize: '10px', padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap',
                            background: status.type === 'success' ? 'var(--ca-52-211-153-0_08)' : 'var(--ca-239-68-68-0_08)',
                            color:      status.type === 'success' ? 'var(--c-34d399)' : 'var(--c-f87171)',
                            border:     `1px solid ${status.type === 'success' ? 'var(--ca-52-211-153-0_25)' : 'var(--ca-239-68-68-0_25)'}`,
                          }}>
                            {status.msg}
                          </span>
                        )}

                        {/* Upload progress */}
                        {uploadingId === c.id && (
                          <span style={{ fontSize: '10px', color: 'var(--c-f59e0b)', whiteSpace: 'nowrap' }}>Uploading… {uploadPct}%</span>
                        )}

                        {/* Inline confirms */}
                        {confirmClearId === c.id && !busy && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--c-f87171)', whiteSpace: 'nowrap' }}>
                            Clear {stats?.count.toLocaleString() ?? 0} keywords?
                            <button type="button" onClick={() => clearKeywords(c)} style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-f87171)', background: 'var(--ca-239-68-68-0_15)', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>Yes</button>
                            <button type="button" onClick={() => setConfirmClearId(null)} style={{ fontSize: '10px', color: 'var(--c-6060a0)', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
                          </span>
                        )}
                        {/* v7.105: Replace vs Merge choice for uploads onto existing data */}
                        {pendingUpload?.competitor.id === c.id && !busy && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--c-f59e0b)', whiteSpace: 'nowrap' }}>
                            {stats?.count.toLocaleString() ?? 0} kws exist · new file has {pendingUpload.parsed.length.toLocaleString()} —
                            <button type="button" title="Delete the existing keywords, then load only this file"
                              onClick={() => runUpload(pendingUpload.competitor, pendingUpload.parsed, true)}
                              style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-f59e0b)', background: 'var(--ca-245-158-11-0_15)', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>
                              Replace
                            </button>
                            <button type="button" title="Keep existing keywords; update matches and add new ones"
                              onClick={() => runUpload(pendingUpload.competitor, pendingUpload.parsed, false)}
                              style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-4ade80)', background: 'var(--ca-74-222-128-0_12)', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>
                              Merge
                            </button>
                            <button type="button" onClick={() => setPendingUpload(null)}
                              style={{ fontSize: '10px', color: 'var(--c-6060a0)', background: 'none', border: 'none', cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </span>
                        )}
                        {confirmDeleteId === c.id && !busy && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--c-f87171)', whiteSpace: 'nowrap' }}>
                            Delete competitor{stats && stats.count > 0 ? ` + ${stats.count.toLocaleString()} kws` : ''}?
                            <button type="button" onClick={() => deleteCompetitor(c.id)} style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-f87171)', background: 'var(--ca-239-68-68-0_15)', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}>Yes</button>
                            <button type="button" onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '10px', color: 'var(--c-6060a0)', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
                          </span>
                        )}

                        {/* Busy spinners for clear/delete */}
                        {(clearingId === c.id || deletingId === c.id) && (
                          <span style={{ fontSize: '10px', color: 'var(--c-f87171)', whiteSpace: 'nowrap' }}>
                            {clearingId === c.id ? 'Clearing…' : 'Deleting…'}
                          </span>
                        )}

                        {/* Actions */}
                        {!busy && confirmClearId !== c.id && confirmDeleteId !== c.id && pendingUpload?.competitor.id !== c.id && (
                          <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                            <button type="button" title="Upload this competitor's keyword CSV (columns: keyword, search_volume, position)"
                              onClick={() => pickFile(c)} style={iconBtnStyle('var(--c-f59e0b)')}>
                              <i className="ti ti-upload" style={{ fontSize: '12px' }} aria-hidden="true" />
                              CSV
                            </button>
                            <button type="button" title="Clear this competitor's uploaded keywords"
                              disabled={!stats || stats.count === 0}
                              onClick={() => { setConfirmClearId(c.id); setConfirmDeleteId(null); }}
                              style={iconBtnStyle('var(--c-8888b0)', !stats || stats.count === 0)}>
                              <i className="ti ti-eraser" style={{ fontSize: '12px' }} aria-hidden="true" />
                            </button>
                            <button type="button" title="Edit name / domain" onClick={() => startEdit(c)} style={iconBtnStyle('var(--c-8888b0)')}>
                              <i className="ti ti-pencil" style={{ fontSize: '12px' }} aria-hidden="true" />
                            </button>
                            <button type="button" title="Delete competitor (also removes its uploaded keywords)"
                              onClick={() => { setConfirmDeleteId(c.id); setConfirmClearId(null); }}
                              style={iconBtnStyle('var(--c-f87171)')}>
                              <i className="ti ti-trash" style={{ fontSize: '12px' }} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ fontSize: '10px', color: 'var(--c-505070)', margin: '6px 0 22px', lineHeight: 1.5 }}>
            Competitors are included in gap analysis and Share of Voice when you run or refresh an analysis. CSV format: <code style={{ background: 'var(--c-1a1a30)', padding: '0 4px', borderRadius: '3px', color: 'var(--c-8080c0)' }}>keyword, search_volume, position</code> — position (the competitor&apos;s rank) is needed for page-1 Share of Voice. When a competitor already has keywords, uploading a CSV asks whether to <strong style={{ color: 'var(--c-8080c0)' }}>Replace</strong> them (clear first, load only the new file) or <strong style={{ color: 'var(--c-8080c0)' }}>Merge</strong> (update matches, add new ones).
          </p>

          {/* ── Section 2: Volume thresholds ── */}
          <SectionLabel label="Keyword Volume Thresholds" />
          <div style={{ background: 'var(--c-0f0f1c)', border: '0.5px solid var(--c-1e1e38)', borderRadius: '10px', padding: '16px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '16px' }}>
              <p style={{ fontSize: '11px', color: 'var(--c-7070a0)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                Keywords below these monthly search volume thresholds are hidden from all analysis panels, and on the next data pull they are excluded inside the Semrush query itself — never fetched, never billed (10 API units per row). Set to <strong style={{ color: 'var(--c-9090c0)' }}>All</strong> to fetch every keyword. Changes save instantly.
              </p>
              {threshState !== 'idle' && (
                <span style={{
                  fontSize: '10px', whiteSpace: 'nowrap', padding: '3px 9px', borderRadius: '10px',
                  color:      threshState === 'error' ? 'var(--c-f87171)' : threshState === 'saved' ? 'var(--c-4ade80)' : 'var(--c-8888b0)',
                  background: threshState === 'error' ? 'var(--ca-239-68-68-0_08)' : threshState === 'saved' ? 'var(--ca-74-222-128-0_08)' : 'var(--ca-136-136-176-0_08)',
                  border: '1px solid var(--c-26264a)',
                }}>
                  {threshState === 'saving' ? 'Saving…' : threshState === 'saved' ? '✓ Saved' : 'Save failed — try again'}
                </span>
              )}
            </div>

            {/* Client ranked threshold */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-38bdf8)', letterSpacing: '.04em' }}>Client ranked keywords</span>
                <span style={{ fontSize: '10px', color: 'var(--c-505070)' }}>min monthly volume</span>
                {clientThresh > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--c-38bdf8)', background: 'var(--ca-56-189-248-0_1)', border: '1px solid var(--ca-56-189-248-0_3)', padding: '1px 8px', borderRadius: '10px' }}>
                    ≥ {clientThresh >= 1000 ? `${clientThresh / 1000}K` : clientThresh}/mo
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {VOL_PRESETS.map(p => (
                  <button key={p.value} type="button" onClick={() => saveThresholds(p.value, competitorThresh)}
                    style={presetBtn(p.value, clientThresh, clientColor)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Competitor gap threshold */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-f59e0b)', letterSpacing: '.04em' }}>Competitor gap keywords</span>
                <span style={{ fontSize: '10px', color: 'var(--c-505070)' }}>min monthly volume</span>
                {competitorThresh > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--c-f59e0b)', background: 'var(--ca-245-158-11-0_1)', border: '1px solid var(--ca-245-158-11-0_3)', padding: '1px 8px', borderRadius: '10px' }}>
                    ≥ {competitorThresh >= 1000 ? `${competitorThresh / 1000}K` : competitorThresh}/mo
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {VOL_PRESETS.map(p => (
                  <button key={p.value} type="button" onClick={() => saveThresholds(clientThresh, p.value)}
                    style={presetBtn(p.value, competitorThresh, competitorColor)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 3: Branded keyword terms (v7.206) ── */}
          <SectionLabel label="Branded Keyword Terms" />
          <div style={{ background: 'var(--c-0f0f1c)', border: '0.5px solid var(--c-1e1e38)', borderRadius: '10px', padding: '16px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px' }}>
              <p style={{ fontSize: '11px', color: 'var(--c-7070a0)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                The client&apos;s own brand names, sub-brands, products and common variants/abbreviations. A keyword that contains any of these is counted as <strong style={{ color: 'var(--c-c9aaff)' }}>branded</strong> across the Keyword, Cluster, Journey and Content panels. The domain root is always included automatically — add the variants a domain can&apos;t reveal (e.g. <code style={{ background: 'var(--c-1a1a30)', padding: '0 4px', borderRadius: '3px', color: 'var(--c-8080c0)' }}>toronto-dominion</code>, <code style={{ background: 'var(--c-1a1a30)', padding: '0 4px', borderRadius: '3px', color: 'var(--c-8080c0)' }}>easyweb</code>). Multi-word terms match as phrases.
              </p>
              {brandState !== 'idle' && (
                <span style={{
                  fontSize: '10px', whiteSpace: 'nowrap', padding: '3px 9px', borderRadius: '10px',
                  color:      brandState === 'error' ? 'var(--c-f87171)' : brandState === 'saved' ? 'var(--c-4ade80)' : 'var(--c-8888b0)',
                  background: brandState === 'error' ? 'var(--ca-239-68-68-0_08)' : brandState === 'saved' ? 'var(--ca-74-222-128-0_08)' : 'var(--ca-136-136-176-0_08)',
                  border: '1px solid var(--c-26264a)',
                }}>
                  {brandState === 'saving' ? 'Saving…' : brandState === 'saved' ? '✓ Saved' : 'Save failed — try again'}
                </span>
              )}
            </div>

            {/* Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: terms.length ? '14px' : '0' }}>
              {terms.map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--c-c9aaff)', background: 'var(--ca-136-136-176-0_08)', border: '1px solid var(--c-6b3fb5)', padding: '3px 6px 3px 10px', borderRadius: '999px' }}>
                  {t}
                  <button type="button" onClick={() => removeTermLocal(t)} title="Remove"
                    style={{ border: 'none', background: 'transparent', color: 'var(--c-8888b0)', cursor: 'pointer', fontSize: '13px', lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
              {terms.length === 0 && (
                <span style={{ fontSize: '10px', color: 'var(--c-505070)' }}>No brand terms yet — add them below or use Suggest with AI.</span>
              )}
            </div>

            {/* Add + actions */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={newTerm}
                onChange={e => setNewTerm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTermLocal(newTerm); } }}
                placeholder="add a brand term…"
                style={{ flex: '1 1 160px', minWidth: '120px', fontSize: '12px', color: 'var(--c-e8e8ff)', background: 'var(--c-0a0a14)', border: '1px solid var(--c-26264a)', borderRadius: '8px', padding: '7px 10px' }}
              />
              <button type="button" onClick={() => addTermLocal(newTerm)}
                style={{ padding: '7px 14px', borderRadius: '8px', background: 'var(--c-1a1a30)', border: '1px solid var(--c-26264a)', color: 'var(--c-c9aaff)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Add
              </button>
              <button type="button" onClick={suggestBrandTerms} disabled={suggesting}
                style={{ padding: '7px 14px', borderRadius: '8px', background: 'var(--ca-136-136-176-0_08)', border: '1px solid var(--c-6b3fb5)', color: 'var(--c-c9aaff)', fontSize: '12px', fontWeight: 600, cursor: suggesting ? 'default' : 'pointer', opacity: suggesting ? 0.6 : 1 }}>
                {suggesting ? 'Suggesting…' : '✦ Suggest with AI'}
              </button>
              <button type="button" onClick={() => saveBrandTerms(terms)}
                style={{ marginLeft: 'auto', padding: '7px 18px', borderRadius: '8px', background: 'var(--c-6c63ff)', border: 'none', color: 'var(--c-ffffff)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Save brand terms
              </button>
            </div>
            {suggestErr && (
              <p style={{ fontSize: '10px', color: 'var(--c-f87171)', margin: '8px 0 0' }}>{suggestErr}</p>
            )}
            <p style={{ fontSize: '10px', color: 'var(--c-505070)', margin: '10px 0 0' }}>
              {brandUpdatedAt
                ? `Last updated ${new Date(brandUpdatedAt).toLocaleString()}`
                : 'Not yet saved for this client.'}
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--c-1a1a2e)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 26px', borderRadius: '8px', background: 'var(--c-6c63ff)', border: 'none', color: 'var(--c-ffffff)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
