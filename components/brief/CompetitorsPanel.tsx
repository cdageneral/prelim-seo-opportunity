'use client';

/**
 * CompetitorsPanel — v7.94
 *
 * v7.94 fix: this panel renders inside EditProjectModal's <form>. The
 * "Add Competitor" toggle and row-delete buttons had no type="button",
 * so the browser treated them as SUBMIT buttons for the modal's form —
 * clicking them saved the project and auto-closed the modal 800ms later
 * (the "screen disappears" bug). The add-competitor <form> was also
 * nested inside the modal's <form> (invalid HTML; submit bubbles to the
 * modal). Fixes: explicit type="button" everywhere, inner form → div,
 * Add wired via onClick, Enter key handled manually.
 *
 * Data source choice (auto-discover vs upload CSV) now lives entirely
 * inside the add-competitor form. Decision is made once at add time.
 *
 * Competitor rows are clean — favicon + name/domain + source badge + delete.
 * No per-row upload buttons or expandable zones.
 *
 * Add flow:
 *   1. Fill domain + name
 *   2. Choose: Auto-discover | Upload CSV
 *      — Upload: pick file → client-side parse → keywords held in state
 *   3. Click Add
 *      a. POST /api/projects/[id]/competitors
 *      b. If upload: POST /api/projects/[id]/keywords/batch
 *   4. Row appears with keyword count badge (upload) or "Auto-discover" label
 */

import { useState, useRef } from 'react';

interface Competitor {
  id:        string;
  domain:    string;
  name:      string | null;
  createdAt: string;
}

interface Props {
  projectId:   string;
  competitors: Competitor[];
  onChange:    () => void;
}

type SrcChoice = 'auto' | 'upload' | null;
interface ParsedKw { keyword: string; searchVolume: number; position?: number; }
interface AddedSource { type: 'auto' | 'upload'; count?: number; }

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCsvText(text: string): ParsedKw[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const firstLine = lines[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const headers   = firstLine.split(delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());

  return lines.slice(1).map(line => {
    const vals: Record<string, string> = {};
    line.split(delimiter).forEach((v, i) => { vals[headers[i] ?? i] = v.trim().replace(/"/g, ''); });
    const kw  = (vals['keyword'] || vals['ph'] || vals['phrase'] || '').toLowerCase().trim();
    const vol = parseInt(vals['search volume'] || vals['nq'] || vals['volume'] || vals['searches'] || '0') || 0;
    const posRaw = vals['position'] || vals['po'] || '';
    const pos    = posRaw ? parseInt(posRaw) : undefined;
    return { keyword: kw, searchVolume: vol, position: pos && !isNaN(pos) ? pos : undefined };
  }).filter(r => r.keyword && r.searchVolume > 0);
}

function normDomain(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CompetitorsPanel({ projectId, competitors, onChange }: Props) {
  const [domain,      setDomain]      = useState('');
  const [name,        setName]        = useState('');
  const [adding,      setAdding]      = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [formError,   setFormError]   = useState('');

  const [srcChoice,   setSrcChoice]   = useState<SrcChoice>(null);
  const [parsedKws,   setParsedKws]   = useState<ParsedKw[]>([]);
  const [fileReady,   setFileReady]   = useState(false);
  const [fileName,    setFileName]    = useState('');
  const [fileError,   setFileError]   = useState('');

  // Tracks source info for competitors added in this session
  const [addedSources, setAddedSources] = useState<Record<string, AddedSource>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setDomain(''); setName(''); setSrcChoice(null);
    setParsedKws([]); setFileReady(false); setFileName('');
    setFileError(''); setFormError('');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text     = await file.text();
      const keywords = parseCsvText(text);
      if (keywords.length === 0) {
        setFileError('No valid keywords found. Expected columns: keyword, search_volume');
        return;
      }
      setParsedKws(keywords);
      setFileReady(true);
      setFileName(`${file.name} · ${keywords.length.toLocaleString()} rows`);
      setFileError('');
    } catch {
      setFileError('Could not read file — try a different format');
    }
  }

  async function addCompetitor() {
    if (!domain.trim() || !srcChoice) return;
    if (srcChoice === 'upload' && !fileReady) return;
    setAdding(true); setFormError('');

    try {
      // 1. Create competitor record
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain: domain.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Failed to add'); return; }

      const nd = normDomain(domain.trim());

      // 2. If upload mode: batch-upload the parsed keywords
      let uploadedCount: number | undefined;
      if (srcChoice === 'upload' && parsedKws.length > 0) {
        const upRes = await fetch(`/api/projects/${projectId}/keywords/batch`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ domain: nd, source: 'csv', keywords: parsedKws }),
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          uploadedCount = upData.inserted as number;
        }
      }

      setAddedSources(prev => ({ ...prev, [nd]: { type: srcChoice, count: uploadedCount } }));
      resetForm();
      setShowForm(false);
      onChange();
    } catch {
      setFormError('Network error — please try again');
    } finally {
      setAdding(false);
    }
  }

  async function removeCompetitor(cid: string) {
    await fetch(`/api/projects/${projectId}/competitors/${cid}`, { method: 'DELETE' });
    onChange();
  }

  const canAdd = domain.trim().length > 0 && srcChoice !== null &&
    (srcChoice === 'auto' || fileReady);

  // Card style for source choice buttons
  const srcStyle = (choice: 'auto' | 'upload'): React.CSSProperties => ({
    flex: 1, textAlign: 'left', cursor: 'pointer',
    background: srcChoice === choice
      ? (choice === 'auto' ? '#14142A' : '#071E1C')
      : '#0C0C1E',
    border: `1.5px solid ${srcChoice === choice
      ? (choice === 'auto' ? '#6C63FF' : '#00C9B1')
      : '#1E1E35'}`,
    borderRadius: '8px', padding: '11px 12px',
    transition: 'border-color .15s, background .15s',
  });

  return (
    <div className="orbit-card p-5 flex flex-col gap-4">

      {/* Hidden file input */}
      <input
        type="file" accept=".csv,.txt" ref={fileInputRef}
        style={{ display: 'none' }} onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Competitors</p>
          <h3 className="text-orbit-primary text-base font-semibold mt-0.5">Tracked Competitors</h3>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(f => !f); if (showForm) resetForm(); }}
          className="flex items-center gap-1.5 text-xs text-orbit-accent hover:text-orbit-accent-light border border-orbit-accent/30 hover:border-orbit-accent/60 px-3 py-1.5 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Competitor
        </button>
      </div>

      {/* ── Add competitor form ──
          NOTE: deliberately a <div>, not a <form> — this panel renders inside
          EditProjectModal's <form>; a nested form is invalid HTML and its
          submit events bubble to the modal's save handler (closing the modal). */}
      {showForm && (
        <div
          className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-3 animate-fade-in">

          {/* Domain + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-orbit-secondary text-[10px] font-medium block mb-1">Domain *</label>
              <input
                type="text" value={domain} required
                onChange={e => setDomain(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (canAdd && !adding) addCompetitor(); } }}
                placeholder="competitor.com"
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-orbit-secondary text-[10px] font-medium block mb-1">Name (optional)</label>
              <input
                type="text" value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (canAdd && !adding) addCompetitor(); } }}
                placeholder="Competitor Co."
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent transition-colors"
              />
            </div>
          </div>

          {/* Source choice — required */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#8888B0', fontWeight: 500 }}>Keyword data source</span>
              {!srcChoice && (
                <span style={{ fontSize: '10px', color: '#F87171', background: '#2B0D0D', padding: '2px 7px', borderRadius: '10px' }}>Required</span>
              )}
              {srcChoice && (
                <span style={{ fontSize: '10px', color: '#4ADE80', background: '#0D2B1D', padding: '2px 7px', borderRadius: '10px' }}>Selected</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>

              {/* Auto-discover */}
              <button type="button" style={srcStyle('auto')} onClick={() => setSrcChoice('auto')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <i className="ti ti-antenna"
                    style={{ fontSize: '15px', color: srcChoice === 'auto' ? '#7B68EE' : '#505070' }}
                    aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: '#2B0D0D', color: '#F87171', fontWeight: 500 }}>~600 units</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 2px' }}>Auto-discover</p>
                <p style={{ fontSize: '11px', color: '#707090', margin: 0, lineHeight: 1.4 }}>Semrush crawls on analysis run.</p>
              </button>

              {/* Upload CSV */}
              <button type="button" style={srcStyle('upload')} onClick={() => setSrcChoice('upload')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <i className="ti ti-upload"
                    style={{ fontSize: '15px', color: srcChoice === 'upload' ? '#00C9B1' : '#505070' }}
                    aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: '#0D2B1D', color: '#4ADE80', fontWeight: 500 }}>0 units</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 2px' }}>Upload CSV</p>
                <p style={{ fontSize: '11px', color: '#707090', margin: 0, lineHeight: 1.4 }}>Upload their keyword export now.</p>
              </button>

            </div>
          </div>

          {/* CSV upload zone — visible when upload selected */}
          {srcChoice === 'upload' && (
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', cursor: 'pointer', textAlign: 'center',
                  background: fileReady ? '#071A10' : '#0C0C1E',
                  border: `1.5px ${fileReady ? 'solid #22C55E' : 'dashed #2D2D55'}`,
                  borderRadius: '7px', padding: '12px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  transition: 'border-color .15s',
                }}
              >
                {fileReady ? (
                  <>
                    <i className="ti ti-circle-check" style={{ fontSize: '18px', color: '#4ADE80' }} aria-hidden="true" />
                    <span style={{ fontSize: '11px', color: '#4ADE80' }}>{fileName}</span>
                  </>
                ) : (
                  <>
                    <i className="ti ti-file-text" style={{ fontSize: '18px', color: '#505070' }} aria-hidden="true" />
                    <span style={{ fontSize: '11px', color: '#505070' }}>Click to upload · CSV</span>
                    <span style={{ fontSize: '10px', color: '#404060' }}>
                      Columns: <code style={{ background: '#1A1A30', padding: '0 4px', borderRadius: '3px', color: '#8080C0' }}>keyword, search_volume</code> · optional: <code style={{ background: '#1A1A30', padding: '0 4px', borderRadius: '3px', color: '#8080C0' }}>position</code>
                    </span>
                  </>
                )}
              </button>
              {fileError && (
                <p style={{ fontSize: '11px', color: '#F87171', marginTop: '5px' }}>{fileError}</p>
              )}
            </div>
          )}

          {formError && <p className="text-red-400 text-xs">{formError}</p>}

          <div className="flex gap-2">
            <button type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="flex-1 text-xs text-orbit-secondary border border-orbit-border py-1.5 rounded-lg hover:text-orbit-primary transition-colors">
              Cancel
            </button>
            <button type="button" disabled={!canAdd || adding}
              onClick={addCompetitor}
              className="flex-1 text-xs bg-orbit-accent hover:bg-orbit-accent-light text-white py-1.5 rounded-lg transition-colors disabled:opacity-35">
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* ── Competitor rows — clean, no upload actions ── */}
      {competitors.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-orbit-tertiary text-xs">No competitors tracked yet.</p>
          <p className="text-orbit-tertiary text-[10px] mt-1">Add competitors to include them in gap analysis.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {competitors.map(comp => {
            const nd     = normDomain(comp.domain);
            const source = addedSources[nd];
            return (
              <div key={comp.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#141428', border: '0.5px solid #2A2A4A', borderRadius: '8px', padding: '10px 13px' }}>
                {/* Favicon */}
                <img
                  src={`https://www.google.com/s2/favicons?domain=${comp.domain}&sz=16`}
                  alt="" style={{ width: '16px', height: '16px', borderRadius: '3px', opacity: 0.7, flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                {/* Name + domain */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: '#C0C0E0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {comp.name ?? comp.domain}
                  </p>
                  {comp.name && (
                    <p style={{ fontSize: '10px', color: '#555575', margin: '2px 0 0' }}>{comp.domain}</p>
                  )}
                </div>
                {/* Source badge */}
                {source?.type === 'upload' && source.count != null && (
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#0D2B1D', color: '#4ADE80', whiteSpace: 'nowrap' }}>
                    {source.count.toLocaleString()} keywords
                  </span>
                )}
                {source?.type === 'auto' && (
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#1A1A30', color: '#8080B0', whiteSpace: 'nowrap' }}>
                    Auto-discover
                  </span>
                )}
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeCompetitor(comp.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#404060', padding: '4px' }}
                  title="Remove competitor"
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {competitors.length > 0 && (
        <p className="text-orbit-tertiary text-[10px]">
          These competitors are included in gap analysis when you run or refresh an analysis.
        </p>
      )}
    </div>
  );
}
