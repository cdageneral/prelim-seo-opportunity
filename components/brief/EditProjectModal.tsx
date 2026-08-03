'use client';

/**
 * EditProjectModal — v7.101
 *
 * Project settings modal surfaced via "Edit Project" in the global nav.
 * Sections:
 *   1. Project Info — client name, website URL, industry, notes
 *   2. Market       — per-project Semrush database / SERP country (v7.99)
 *
 * v7.101: Competitors and Keyword Volume Thresholds moved to the dedicated
 * CompetitorsModal (the "Competitors" button in the top global nav) — one
 * home for add/edit/delete competitors, CSV uploads, clears and thresholds.
 *
 * Saves info via PATCH /api/projects/[id].
 */

import { useState } from 'react';
import { MARKETS } from '@/lib/utils/markets';

const INDUSTRIES = [
  'SaaS / Software', 'E-commerce', 'Healthcare', 'Finance / Fintech',
  'Professional Services', 'Real Estate', 'Education', 'Marketing / Agency',
  'Manufacturing', 'Retail', 'Hospitality', 'Non-profit', 'Other',
];

interface Props {
  projectId:   string;
  clientName:  string;
  websiteUrl:  string;
  industry:    string | null;
  notes:       string | null;
  dataSource:  'auto' | 'upload';
  semrushDatabase?:         string;   // v7.99: per-project market
  onClose:   () => void;
  onSaved:   () => void;   // re-fetches project after save
}

export default function EditProjectModal({
  projectId,
  clientName:  initName,
  websiteUrl:  initUrl,
  industry:    initIndustry,
  notes:       initNotes,
  dataSource:  initDataSource,
  semrushDatabase:          initMarket,
  onClose,
  onSaved,
}: Props) {
  const [clientName,  setClientName]  = useState(initName);
  const [websiteUrl,  setWebsiteUrl]  = useState(initUrl);
  const [industry,    setIndustry]    = useState(initIndustry ?? '');
  const [notes,       setNotes]       = useState(initNotes ?? '');
  const [market,           setMarket]           = useState<string>(initMarket ?? 'us');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  function handleUrlBlur() {
    if (websiteUrl && !websiteUrl.startsWith('http')) {
      setWebsiteUrl(`https://${websiteUrl}`);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || !websiteUrl.trim()) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clientName:               clientName.trim(),
          websiteUrl:               websiteUrl.trim(),
          industry:                 industry || undefined,
          notes:                    notes    || undefined,
          semrushDatabase:          market,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d?.error?.formErrors?.[0] ?? 'Save failed. Please try again.');
        return;
      }
      setSuccess(true);
      onSaved();
      setTimeout(onClose, 800);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Section divider ───────────────────────────────────────────────────────
  function SectionLabel({ label }: { label: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', color: 'var(--c-4a4a72)', textTransform: 'uppercase' }}>{label}</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--c-1a1a30)' }} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative animate-fade-in"
        style={{
          width: '100%', maxWidth: '680px',
          background: 'var(--c-0c0c18)',
          border: '1px solid var(--c-1e1e35)',
          borderRadius: '14px',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px var(--ca-0-0-0-0_7)',
        }}
      >
        {/* ── Modal header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 16px', borderBottom: '1px solid var(--c-1a1a2e)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--ca-108-99-255-0_12)', border: '1px solid var(--ca-108-99-255-0_25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-settings" style={{ fontSize: '14px', color: 'var(--c-8b85ff)' }} aria-hidden="true" />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-e8e8ff)', margin: 0 }}>Edit Project</h2>
              <p style={{ fontSize: '11px', color: 'var(--c-555575)', margin: '2px 0 0' }}>Project info &amp; market</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-505070)', padding: '4px' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <form onSubmit={handleSave} style={{ overflowY: 'auto', flex: 1, padding: '20px 22px' }}>

          {/* ── Section 1: Project Info ── */}
          <SectionLabel label="Project Info" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <FieldWrap label="Client Name *">
              <input
                required
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Acme Corp"
                style={inputStyle}
              />
            </FieldWrap>
            <FieldWrap label="Website URL *">
              <input
                required
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder="https://acme.com"
                style={inputStyle}
              />
            </FieldWrap>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <FieldWrap label="Industry">
              <select value={industry} onChange={e => setIndustry(e.target.value)} style={inputStyle}>
                <option value="">Select industry...</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </FieldWrap>
            <FieldWrap label="Notes">
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes…"
                style={inputStyle}
              />
            </FieldWrap>
          </div>

          <div style={{ marginBottom: '22px' }}>
            <FieldWrap label="Market">
              <select value={market} onChange={e => setMarket(e.target.value)} style={inputStyle}>
                {MARKETS.map(m => <option key={m.code} value={m.code}>{m.flag} {m.label}</option>)}
              </select>
            </FieldWrap>
            <p style={{ fontSize: '10px', color: 'var(--c-505070)', marginTop: '4px', lineHeight: 1.5 }}>
              Which country&apos;s Google to analyze — sets the Semrush keyword database and the country for SERP feature scans. Changing this requires a full re-analysis; existing data stays from the previous market until then.
            </p>
          </div>

          {/* v7.101: pointer to the new Competitors manager */}
          <p style={{ fontSize: '10px', color: 'var(--c-505070)', margin: '0 0 22px', lineHeight: 1.5 }}>
            Looking for competitors or keyword volume thresholds? They moved to the <strong style={{ color: 'var(--c-f59e0b)' }}>Competitors</strong> button in the top bar.
          </p>

          {/* Feedback messages */}
          {error && (
            <p style={{ fontSize: '12px', color: 'var(--c-f87171)', marginBottom: '12px' }}>{error}</p>
          )}
          {success && (
            <p style={{ fontSize: '12px', color: 'var(--c-4ade80)', marginBottom: '12px' }}>✓ Project saved successfully.</p>
          )}

          {/* ── Footer actions ── */}
          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--c-2a2a48)',
                color: 'var(--c-8080a8)', fontSize: '13px', cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !clientName.trim() || !websiteUrl.trim()}
              style={{
                flex: 2, padding: '10px', borderRadius: '8px',
                background: saving ? 'var(--c-3d3d8a)' : 'var(--c-6c63ff)',
                border: 'none',
                color: 'var(--on-fill-accent)', fontSize: '13px', fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.12s',
                opacity: (!clientName.trim() || !websiteUrl.trim()) ? 0.4 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--c-111120)',
  border: '1px solid var(--c-1e1e35)',
  borderRadius: '8px',
  padding: '9px 12px',
  color: 'var(--c-f0f0ff)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--c-7070a0)', letterSpacing: '.05em', marginBottom: '6px', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
