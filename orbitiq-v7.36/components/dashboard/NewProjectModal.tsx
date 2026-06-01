'use client';

/**
 * NewProjectModal — v7.32
 *
 * Added forced data source selection:
 *  - No option pre-selected; "Create project" is disabled until user chooses
 *  - "Choose one to continue" badge → "Selected" after choice is made
 *  - Contextual confirmation note per choice
 *  - dataSource ('auto'|'upload') is saved to the project on create
 */

import { useState } from 'react';

const INDUSTRIES = [
  'SaaS / Software', 'E-commerce', 'Healthcare', 'Finance / Fintech',
  'Professional Services', 'Real Estate', 'Education', 'Marketing / Agency',
  'Manufacturing', 'Retail', 'Hospitality', 'Non-profit', 'Other',
];

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

export default function NewProjectModal({ onClose, onCreated }: Props) {
  const [form,       setForm]       = useState({ clientName: '', websiteUrl: '', industry: '', notes: '' });
  const [dataSource, setDataSource] = useState<'auto' | 'upload' | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  function handleUrlBlur() {
    if (form.websiteUrl && !form.websiteUrl.startsWith('http')) {
      setForm(f => ({ ...f, websiteUrl: `https://${f.websiteUrl}` }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dataSource) return;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/projects', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, dataSource }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.formErrors?.[0] ?? 'Failed to create project'); return; }
      onCreated();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !!dataSource && !loading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative orbit-card orbit-glow w-full max-w-md p-6 animate-fade-in">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-orbit-primary font-semibold text-lg">Add New Client</h2>
          <button onClick={onClose} className="text-orbit-secondary hover:text-orbit-primary transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Client Name *">
            <input
              type="text" required
              value={form.clientName}
              onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
              placeholder="Acme Corp"
              className="orbit-input"
            />
          </Field>

          <Field label="Website URL *">
            <input
              type="text" required
              value={form.websiteUrl}
              onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
              onBlur={handleUrlBlur}
              placeholder="acme.com"
              className="orbit-input"
            />
            <p className="text-orbit-tertiary text-[10px] mt-1">Enter the domain — https:// will be added automatically.</p>
          </Field>

          <Field label="Industry">
            <select
              value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              className="orbit-input"
            >
              <option value="">Select industry...</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>

          {/* ── Keyword data source — forced choice ── */}
          <div style={{ borderTop: '0.5px solid #1E1E35', paddingTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <p style={{ fontSize: '11px', color: '#8888B0', fontWeight: 500, margin: 0 }}>Keyword data source</p>
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

              {/* Auto-discover card */}
              <button
                type="button"
                onClick={() => setDataSource('auto')}
                style={{
                  flex: 1, textAlign: 'left', cursor: 'pointer',
                  background: dataSource === 'auto' ? '#1A1A3A' : '#111118',
                  border: `1.5px solid ${dataSource === 'auto' ? '#6C63FF' : '#1E1E2E'}`,
                  borderRadius: '8px', padding: '12px',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '7px' }}>
                  <i className="ti ti-antenna" style={{ fontSize: '16px', color: dataSource === 'auto' ? '#7B68EE' : '#404060' }} aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: '#2B0D0D', color: '#F87171', fontWeight: 500 }}>~2,400 units</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 3px' }}>Auto-discover</p>
                <p style={{ fontSize: '11px', color: '#707090', margin: 0, lineHeight: 1.4 }}>
                  Semrush crawls client + competitors automatically on first run.
                </p>
              </button>

              {/* Upload card */}
              <button
                type="button"
                onClick={() => setDataSource('upload')}
                style={{
                  flex: 1, textAlign: 'left', cursor: 'pointer',
                  background: dataSource === 'upload' ? '#0D1E2B' : '#111118',
                  border: `1.5px solid ${dataSource === 'upload' ? '#00C9B1' : '#1E1E2E'}`,
                  borderRadius: '8px', padding: '12px',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '7px' }}>
                  <i className="ti ti-upload" style={{ fontSize: '16px', color: dataSource === 'upload' ? '#00C9B1' : '#404060' }} aria-hidden="true" />
                  <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: '#0D2B1D', color: '#4ADE80', fontWeight: 500 }}>0 units</span>
                </div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 3px' }}>Upload files</p>
                <p style={{ fontSize: '11px', color: '#707090', margin: 0, lineHeight: 1.4 }}>
                  You&apos;ll upload keyword CSVs on the project page — no auto-crawl.
                </p>
              </button>

            </div>

            {/* Contextual confirmation note */}
            {dataSource === 'auto' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', background: '#141428', border: '0.5px solid #2A2A4A', borderRadius: '6px', padding: '9px 11px' }}>
                <i className="ti ti-info-circle" style={{ fontSize: '13px', color: '#6C63FF', flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
                <p style={{ fontSize: '11px', color: '#8080B0', margin: 0, lineHeight: 1.5 }}>
                  Semrush will run automatically when you first run analysis. Add competitors on the project page to include their footprints.
                </p>
              </div>
            )}
            {dataSource === 'upload' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', background: '#071A10', border: '0.5px solid #1A4030', borderRadius: '6px', padding: '9px 11px' }}>
                <i className="ti ti-circle-check" style={{ fontSize: '13px', color: '#4ADE80', flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
                <p style={{ fontSize: '11px', color: '#4A8060', margin: 0, lineHeight: 1.5 }}>
                  After creating, upload keyword CSVs for the client and each competitor on the project page — Semrush won&apos;t be called automatically.
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-orbit-border text-orbit-secondary hover:text-orbit-primary text-sm py-2.5 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 bg-orbit-accent hover:bg-orbit-accent-light text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-35"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .orbit-input {
          width: 100%;
          background: #111118;
          border: 1px solid #1E1E2E;
          border-radius: 8px;
          padding: 10px 12px;
          color: #F0F0FF;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .orbit-input:focus { border-color: #6C63FF; }
        .orbit-input::placeholder { color: #555570; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-orbit-secondary text-xs font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
