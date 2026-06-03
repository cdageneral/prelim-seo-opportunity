'use client';

/**
 * NewProjectModal — v7.50
 *
 * Added to the create flow:
 *  - Competitors section: add up to 5 competitors (domain + name) before creating.
 *    These are POSTed to /api/projects/[id]/competitors after project creation.
 *    CSV upload is available in Edit Project after creation.
 *  - Keyword volume thresholds: client ranked + competitor gap minimums (preset buttons).
 *    Saved with the project on create; editable later in Edit Project.
 */

import { useState } from 'react';

const INDUSTRIES = [
  'SaaS / Software', 'E-commerce', 'Healthcare', 'Finance / Fintech',
  'Professional Services', 'Real Estate', 'Education', 'Marketing / Agency',
  'Manufacturing', 'Retail', 'Hospitality', 'Non-profit', 'Other',
];

const VOL_PRESETS: { label: string; value: number }[] = [
  { label: 'All',   value: 0    },
  { label: '500+',  value: 500  },
  { label: '1K+',   value: 1000 },
  { label: '2.4K+', value: 2400 },
  { label: '5K+',   value: 5000 },
];

interface CompetitorEntry { domain: string; name: string; }

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

export default function NewProjectModal({ onClose, onCreated }: Props) {
  const [form,       setForm]       = useState({ clientName: '', websiteUrl: '', industry: '', notes: '' });
  const [dataSource, setDataSource] = useState<'auto' | 'upload' | null>(null);

  // Competitors
  const [competitors,    setCompetitors]    = useState<CompetitorEntry[]>([]);
  const [compDomain,     setCompDomain]     = useState('');
  const [compName,       setCompName]       = useState('');
  const [compError,      setCompError]      = useState('');

  // Thresholds
  const [clientThresh,     setClientThresh]     = useState<number>(0);
  const [competitorThresh, setCompetitorThresh] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function handleUrlBlur() {
    if (form.websiteUrl && !form.websiteUrl.startsWith('http')) {
      setForm(f => ({ ...f, websiteUrl: `https://${f.websiteUrl}` }));
    }
  }

  function addCompetitor() {
    const d = compDomain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    if (!d) { setCompError('Enter a domain.'); return; }
    if (competitors.some(c => c.domain === d)) { setCompError('Already added.'); return; }
    if (competitors.length >= 5) { setCompError('Maximum 5 competitors.'); return; }
    setCompetitors(prev => [...prev, { domain: d, name: compName.trim() }]);
    setCompDomain(''); setCompName(''); setCompError('');
  }

  function removeCompetitor(domain: string) {
    setCompetitors(prev => prev.filter(c => c.domain !== domain));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dataSource) return;
    setLoading(true);
    setError('');
    try {
      // 1. Create project
      const res  = await fetch('/api/projects', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          dataSource,
          kwVolThresholdClient:     clientThresh,
          kwVolThresholdCompetitor: competitorThresh,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.formErrors?.[0] ?? 'Failed to create project'); return; }

      // 2. Add competitors (best-effort, don't block on failure)
      if (competitors.length > 0) {
        await Promise.allSettled(
          competitors.map(c =>
            fetch(`/api/projects/${data.project.id}/competitors`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ domain: c.domain, name: c.name || undefined }),
            }),
          ),
        );
      }

      onCreated();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !!dataSource && !loading;

  // Threshold preset style
  function presetStyle(value: number, current: number, color: { bg: string; border: string; text: string }): React.CSSProperties {
    const active = current === value;
    return {
      padding: '4px 11px', borderRadius: '20px',
      border: `1px solid ${active ? color.border : '#2A2A48'}`,
      background: active ? color.bg : 'transparent',
      color: active ? color.text : '#707090',
      fontSize: '11px', cursor: 'pointer',
      transition: 'all 0.12s',
      fontWeight: active ? 600 : 400,
    };
  }

  const clientColor     = { bg: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.6)', text: '#38BDF8' };
  const competitorColor = { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.6)', text: '#F59E0B' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full animate-fade-in"
        style={{
          maxWidth: '560px', maxHeight: '92vh',
          background: '#0C0C18', border: '1px solid #1E1E35',
          borderRadius: '14px', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 16px', borderBottom: '1px solid #1A1A2E', flexShrink: 0 }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#E8E8FF', margin: 0 }}>Add New Client</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505070', padding: '4px' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── Project info ── */}
          <SectionLabel label="Project Info" />

          <Field label="Client Name *">
            <input type="text" required value={form.clientName}
              onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
              placeholder="Acme Corp" style={inputStyle} />
          </Field>

          <Field label="Website URL *">
            <input type="text" required value={form.websiteUrl}
              onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
              onBlur={handleUrlBlur}
              placeholder="acme.com" style={inputStyle} />
            <p style={{ fontSize: '10px', color: '#505070', marginTop: '4px' }}>https:// added automatically.</p>
          </Field>

          <Field label="Industry">
            <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} style={inputStyle}>
              <option value="">Select industry...</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>

          {/* ── Keyword data source ── */}
          <div style={{ borderTop: '0.5px solid #1E1E35', paddingTop: '14px' }}>
            <SectionLabel label="Keyword Data Source" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              {!dataSource && (
                <span style={{ fontSize: '10px', color: '#F87171', background: '#2B0D0D', padding: '2px 8px', borderRadius: '10px' }}>
                  Choose one to continue
                </span>
              )}
              {dataSource && (
                <span style={{ fontSize: '10px', color: '#4ADE80', background: '#0D2B1D', padding: '2px 8px', borderRadius: '10px' }}>
                  Selected
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {/* Auto-discover */}
              <button type="button" onClick={() => setDataSource('auto')}
                style={{ flex: 1, textAlign: 'left', cursor: 'pointer', background: dataSource === 'auto' ? '#1A1A3A' : '#111118', border: `1.5px solid ${dataSource === 'auto' ? '#6C63FF' : '#1E1E2E'}`, borderRadius: '8px', padding: '12px', transition: 'border-color .15s, background .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '7px' }}>
                  <i className="ti ti-antenna" style={{ fontSize: '16px', color: dataSource === 'auto' ? '#7B68EE' : '#404060' }} aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: '#2B0D0D', color: '#F87171', fontWeight: 500 }}>~2,400 units</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 3px' }}>Auto-discover</p>
                <p style={{ fontSize: '11px', color: '#707090', margin: 0, lineHeight: 1.4 }}>Semrush crawls client + competitors automatically.</p>
              </button>

              {/* Upload */}
              <button type="button" onClick={() => setDataSource('upload')}
                style={{ flex: 1, textAlign: 'left', cursor: 'pointer', background: dataSource === 'upload' ? '#0D1E2B' : '#111118', border: `1.5px solid ${dataSource === 'upload' ? '#00C9B1' : '#1E1E2E'}`, borderRadius: '8px', padding: '12px', transition: 'border-color .15s, background .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '7px' }}>
                  <i className="ti ti-upload" style={{ fontSize: '16px', color: dataSource === 'upload' ? '#00C9B1' : '#404060' }} aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: '#0D2B1D', color: '#4ADE80', fontWeight: 500 }}>0 units</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 3px' }}>Upload files</p>
                <p style={{ fontSize: '11px', color: '#707090', margin: 0, lineHeight: 1.4 }}>Upload keyword CSVs on the project page — no auto-crawl.</p>
              </button>
            </div>

            {dataSource === 'auto' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', background: '#141428', border: '0.5px solid #2A2A4A', borderRadius: '6px', padding: '9px 11px' }}>
                <i className="ti ti-info-circle" style={{ fontSize: '13px', color: '#6C63FF', flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
                <p style={{ fontSize: '11px', color: '#8080B0', margin: 0, lineHeight: 1.5 }}>
                  Semrush will run automatically on first analysis. Add competitors below to include their footprints.
                </p>
              </div>
            )}
          </div>

          {/* ── Competitors ── */}
          <div style={{ borderTop: '0.5px solid #1E1E35', paddingTop: '14px' }}>
            <SectionLabel label="Competitors (optional)" />
            <p style={{ fontSize: '11px', color: '#606080', marginBottom: '12px', lineHeight: 1.5 }}>
              Add up to 5 competitors. CSV keyword upload is available in Edit Project after creation.
            </p>

            {/* Add competitor inline */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <input
                value={compDomain}
                onChange={e => setCompDomain(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
                placeholder="competitor.com"
                style={{ ...inputStyle, flex: 2 }}
              />
              <input
                value={compName}
                onChange={e => setCompName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
                placeholder="Name (opt.)"
                style={{ ...inputStyle, flex: 1.5 }}
              />
              <button
                type="button"
                onClick={addCompetitor}
                disabled={competitors.length >= 5}
                style={{
                  padding: '9px 16px', borderRadius: '8px',
                  background: competitors.length >= 5 ? '#1A1A30' : 'rgba(108,99,255,0.15)',
                  border: `1px solid ${competitors.length >= 5 ? '#1E1E35' : 'rgba(108,99,255,0.45)'}`,
                  color: competitors.length >= 5 ? '#404060' : '#9B96FF',
                  fontSize: '12px', cursor: competitors.length >= 5 ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </div>
            {compError && <p style={{ fontSize: '11px', color: '#F87171', marginBottom: '6px' }}>{compError}</p>}

            {/* Competitor list */}
            {competitors.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {competitors.map(c => (
                  <div key={c.domain} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#141428', border: '0.5px solid #2A2A4A', borderRadius: '7px', padding: '8px 12px' }}>
                    <img src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=14`} alt="" style={{ width: '14px', height: '14px', borderRadius: '2px', opacity: 0.7 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span style={{ fontSize: '12px', color: '#C0C0E0', flex: 1 }}>{c.name || c.domain}</span>
                    {c.name && <span style={{ fontSize: '10px', color: '#555575' }}>{c.domain}</span>}
                    <button type="button" onClick={() => removeCompetitor(c.domain)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#404060', padding: '2px' }}>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Keyword volume thresholds ── */}
          <div style={{ borderTop: '0.5px solid #1E1E35', paddingTop: '14px' }}>
            <SectionLabel label="Keyword Volume Thresholds" />
            <div style={{ background: '#0F0F1C', border: '0.5px solid #1E1E38', borderRadius: '10px', padding: '14px' }}>
              <p style={{ fontSize: '11px', color: '#7070A0', marginBottom: '14px', lineHeight: 1.5 }}>
                Hide keywords below these monthly volume minimums. Can be changed anytime in Edit Project.
              </p>

              {/* Client */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#38BDF8', letterSpacing: '.04em' }}>Client ranked</span>
                  {clientThresh > 0 && (
                    <span style={{ fontSize: '10px', color: '#38BDF8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', padding: '1px 7px', borderRadius: '10px' }}>
                      ≥ {clientThresh >= 1000 ? `${clientThresh / 1000}K` : clientThresh}/mo
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {VOL_PRESETS.map(p => (
                    <button key={p.value} type="button" onClick={() => setClientThresh(p.value)}
                      style={presetStyle(p.value, clientThresh, clientColor)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Competitor */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#F59E0B', letterSpacing: '.04em' }}>Competitor gap</span>
                  {competitorThresh > 0 && (
                    <span style={{ fontSize: '10px', color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 7px', borderRadius: '10px' }}>
                      ≥ {competitorThresh >= 1000 ? `${competitorThresh / 1000}K` : competitorThresh}/mo
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {VOL_PRESETS.map(p => (
                    <button key={p.value} type="button" onClick={() => setCompetitorThresh(p.value)}
                      style={presetStyle(p.value, competitorThresh, competitorColor)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && <p style={{ fontSize: '12px', color: '#F87171' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px', paddingBottom: '4px' }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid #2A2A48', color: '#8080A8', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              style={{ flex: 2, padding: '10px', borderRadius: '8px', background: canSubmit ? '#6C63FF' : '#3D3D8A', border: 'none', color: '#FFF', fontSize: '13px', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: !dataSource ? 0.4 : 1 }}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#111118', border: '1px solid #1E1E2E',
  borderRadius: '8px', padding: '9px 12px', color: '#F0F0FF',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
};

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', color: '#4A4A72', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: '#1A1A30' }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: '#7070A0', letterSpacing: '.05em', marginBottom: '6px', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function presetStyle(value: number, current: number, color: { bg: string; border: string; text: string }): React.CSSProperties {
  const active = current === value;
  return {
    padding: '4px 11px', borderRadius: '20px',
    border: `1px solid ${active ? color.border : '#2A2A48'}`,
    background: active ? color.bg : 'transparent',
    color: active ? color.text : '#707090',
    fontSize: '11px', cursor: 'pointer',
    transition: 'all 0.12s',
    fontWeight: active ? 600 : 400,
  };
}
