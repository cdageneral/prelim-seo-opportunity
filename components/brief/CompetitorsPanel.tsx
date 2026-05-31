'use client';

/**
 * CompetitorsPanel — v7.32
 *
 * Keyword upload additions:
 *  - Layout changed from pill chips to list rows to accommodate upload controls
 *  - After adding a competitor the upload zone opens automatically (forced choice)
 *  - User must either upload a CSV or click "Skip — use Semrush" to dismiss
 *  - Existing competitors have an "Upload keywords" toggle button
 *  - Uploads hit POST /api/projects/[id]/keywords/batch
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

// ── CSV parser (same logic as page.tsx) ──────────────────────────────────────

function parseCsvText(text: string): { keyword: string; searchVolume: number; position?: number }[] {
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

export default function CompetitorsPanel({ projectId, competitors, onChange }: Props) {
  const [domain,          setDomain]          = useState('');
  const [name,            setName]            = useState('');
  const [adding,          setAdding]          = useState(false);
  const [showForm,        setShowForm]        = useState(false);
  const [formError,       setFormError]       = useState('');

  // Upload state
  const [newlyAddedDomain, setNewlyAddedDomain] = useState<string | null>(null);
  const [expandedUpload,   setExpandedUpload]   = useState<string | null>(null); // domain
  const [uploadedCounts,   setUploadedCounts]   = useState<Record<string, number>>({});
  const [skippedDomains,   setSkippedDomains]   = useState<Set<string>>(new Set());
  const [uploadingDomain,  setUploadingDomain]  = useState<string | null>(null);
  const [uploadError,      setUploadError]      = useState<string | null>(null);
  const [uploadTarget,     setUploadTarget]     = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addCompetitor(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    setAdding(true);
    setFormError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain: domain.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Failed to add'); return; }
      const addedDomain = domain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      setDomain('');
      setName('');
      setShowForm(false);
      setNewlyAddedDomain(addedDomain);
      setExpandedUpload(addedDomain);
      onChange();
    } catch {
      setFormError('Network error');
    } finally {
      setAdding(false);
    }
  }

  async function removeCompetitor(cid: string) {
    await fetch(`/api/projects/${projectId}/competitors/${cid}`, { method: 'DELETE' });
    onChange();
  }

  function triggerUpload(domain: string) {
    setUploadTarget(domain);
    setUploadError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadTarget) return;
    const domain = uploadTarget;
    setUploadingDomain(domain);
    setUploadError(null);
    try {
      const text     = await file.text();
      const keywords = parseCsvText(text);
      if (keywords.length === 0) {
        setUploadError(`No valid keywords in ${file.name}. Expected columns: keyword, search_volume`);
        setUploadingDomain(null);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/keywords/batch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain, source: 'csv', keywords }),
      });
      if (!res.ok) { setUploadError('Upload failed — try again'); setUploadingDomain(null); return; }
      const { inserted } = await res.json();
      setUploadedCounts(prev => ({ ...prev, [domain]: inserted }));
      setNewlyAddedDomain(null);
      setExpandedUpload(null);
    } catch {
      setUploadError('Upload failed — check file and try again');
    } finally {
      setUploadingDomain(null);
    }
  }

  function skipUpload(domain: string) {
    setSkippedDomains(prev => new Set([...Array.from(prev), domain]));
    setNewlyAddedDomain(null);
    setExpandedUpload(null);
  }

  function toggleExpand(domain: string) {
    setExpandedUpload(prev => prev === domain ? null : domain);
    setUploadError(null);
  }

  return (
    <div className="orbit-card p-5 flex flex-col gap-4">

      {/* Hidden file input — shared across all competitors */}
      <input
        type="file"
        accept=".csv,.txt"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Competitors</p>
          <h3 className="text-orbit-primary text-base font-semibold mt-0.5">Tracked Competitors</h3>
        </div>
        <button
          onClick={() => { setShowForm(f => !f); setFormError(''); }}
          className="flex items-center gap-1.5 text-xs text-orbit-accent hover:text-orbit-accent-light border border-orbit-accent/30 hover:border-orbit-accent/60 px-3 py-1.5 rounded-lg transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Competitor
        </button>
      </div>

      {/* Add competitor form */}
      {showForm && (
        <form onSubmit={addCompetitor} className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-orbit-secondary text-[10px] font-medium block mb-1">Domain *</label>
              <input
                type="text" value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="competitor.com" required
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent transition-colors"
              />
            </div>
            <div>
              <label className="text-orbit-secondary text-[10px] font-medium block mb-1">Name (optional)</label>
              <input
                type="text" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Competitor Co."
                className="w-full bg-orbit-bg border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent transition-colors"
              />
            </div>
          </div>
          {formError && <p className="text-red-400 text-xs">{formError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setDomain(''); setName(''); }}
              className="flex-1 text-xs text-orbit-secondary border border-orbit-border py-1.5 rounded-lg hover:text-orbit-primary transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={adding}
              className="flex-1 text-xs bg-orbit-accent hover:bg-orbit-accent-light text-white py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {/* Competitors list */}
      {competitors.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-orbit-tertiary text-xs">No competitors tracked yet.</p>
          <p className="text-orbit-tertiary text-[10px] mt-1">Add competitors to include them in gap analysis.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {competitors.map(comp => {
            const normDomain    = comp.domain.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            const isNew         = normDomain === newlyAddedDomain;
            const isExpanded    = expandedUpload === normDomain;
            const uploadCount   = uploadedCounts[normDomain];
            const wasSkipped    = skippedDomains.has(normDomain);
            const isUploading   = uploadingDomain === normDomain;

            return (
              <div key={comp.id}
                style={{
                  background: '#141428',
                  border: `0.5px solid ${isNew ? '#3A3A6A' : '#2A2A4A'}`,
                  borderRadius: '8px', padding: '11px 13px',
                }}
              >
                {/* Competitor row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Favicon */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${comp.domain}&sz=16`}
                    alt="" style={{ width: '16px', height: '16px', borderRadius: '3px', opacity: 0.7, flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {/* Domain + name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: '#C0C0E0', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {comp.name ?? comp.domain}
                    </p>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {comp.name && (
                        <span style={{ fontSize: '10px', color: '#555575' }}>{comp.domain}</span>
                      )}
                      {uploadCount != null && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: '#0D2B1D', color: '#4ADE80' }}>
                          {uploadCount.toLocaleString()} keywords
                        </span>
                      )}
                      {wasSkipped && !uploadCount && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: '#1A1A30', color: '#8080B0' }}>
                          Semrush auto-discover
                        </span>
                      )}
                      {isNew && !uploadCount && !wasSkipped && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: '#2D2D6A', color: '#A090FF' }}>
                          Just added
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Upload button or status */}
                  {uploadCount != null ? (
                    <button
                      onClick={() => toggleExpand(normDomain)}
                      style={{ background: 'none', border: '0.5px solid #1A4030', borderRadius: '6px', padding: '4px 10px', color: '#4ADE80', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                    >
                      <i className="ti ti-circle-check" style={{ fontSize: '12px' }} aria-hidden="true" />
                      Re-upload
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleExpand(normDomain)}
                      style={{ background: 'none', border: `0.5px solid ${isExpanded ? '#3A3A6A' : '#2A2A4A'}`, borderRadius: '6px', padding: '4px 10px', color: isExpanded ? '#A090FF' : '#707090', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                    >
                      <i className="ti ti-upload" style={{ fontSize: '12px' }} aria-hidden="true" />
                      Upload keywords
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => removeCompetitor(comp.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#404060', padding: '4px', marginLeft: '2px' }}
                    title="Remove competitor"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Upload zone — auto-open for newly added, toggleable for existing */}
                {isExpanded && (
                  <div style={{ background: '#0E0E20', border: '0.5px solid #2A2A4A', borderRadius: '7px', padding: '12px', marginTop: '10px' }}>
                    {isNew && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#8080C0', fontWeight: 500 }}>
                          Keyword footprint for {normDomain}
                        </span>
                        <span style={{ fontSize: '10px', color: '#F87171', background: '#2B0D0D', padding: '2px 7px', borderRadius: '10px' }}>
                          Action required
                        </span>
                      </div>
                    )}

                    <p style={{ fontSize: '11px', color: '#606080', margin: '0 0 9px', lineHeight: 1.5 }}>
                      {isNew
                        ? 'Upload a keyword CSV, or skip to let Semrush auto-discover this competitor\'s footprint when you run analysis.'
                        : `Upload a keyword CSV for ${normDomain}. Columns: keyword, search_volume · optional: position`}
                    </p>

                    {/* Drop zone */}
                    <button
                      onClick={() => triggerUpload(normDomain)}
                      disabled={isUploading}
                      style={{
                        width: '100%', cursor: isUploading ? 'wait' : 'pointer',
                        background: '#141428', border: '1.5px dashed #2D2D55',
                        borderRadius: '7px', padding: '12px', textAlign: 'center',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {isUploading ? (
                        <span style={{ fontSize: '12px', color: '#707090' }}>Uploading…</span>
                      ) : (
                        <>
                          <i className="ti ti-file-text" style={{ fontSize: '16px', color: '#505070' }} aria-hidden="true" />
                          <span style={{ fontSize: '11px', color: '#505070' }}>Click to upload · CSV</span>
                        </>
                      )}
                    </button>

                    {uploadError && uploadTarget === normDomain && (
                      <p style={{ fontSize: '11px', color: '#F87171', marginTop: '6px' }}>{uploadError}</p>
                    )}

                    {/* Skip option — only shown for newly added (forced-choice context) */}
                    {isNew && (
                      <button
                        onClick={() => skipUpload(normDomain)}
                        style={{ width: '100%', marginTop: '8px', background: '#141428', border: '0.5px solid #2A2A4A', borderRadius: '7px', padding: '8px', color: '#707090', fontSize: '12px', cursor: 'pointer' }}
                      >
                        Skip — use Semrush auto-discover instead
                      </button>
                    )}
                    {/* Non-new: just a close link */}
                    {!isNew && (
                      <button
                        onClick={() => setExpandedUpload(null)}
                        style={{ display: 'block', marginTop: '8px', background: 'none', border: 'none', color: '#555575', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
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
