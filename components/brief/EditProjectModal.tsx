'use client';

/**
 * EditProjectModal — v7.50
 *
 * Full project settings modal surfaced via "Edit Project" in the global nav.
 * Sections:
 *   1. Project Info   — client name, website URL, industry, notes
 *   2. Competitors    — full CompetitorsPanel (add / remove with CSV / auto-discover)
 *   3. Keyword Thresholds — client ranked + competitor gap minimum volume presets
 *
 * Saves info + thresholds via PATCH /api/projects/[id].
 * Competitors are managed live by CompetitorsPanel (its own API calls).
 */

import { useState } from 'react';
import CompetitorsPanel from '@/components/brief/CompetitorsPanel';
import { MARKETS } from '@/lib/utils/markets';

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

interface Competitor {
  id:        string;
  domain:    string;
  name:      string | null;
  createdAt: string;
}

interface Props {
  projectId:   string;
  clientName:  string;
  websiteUrl:  string;
  industry:    string | null;
  notes:       string | null;
  dataSource:  'auto' | 'upload';
  competitors: Competitor[];
  kwVolThresholdClient:     number;
  kwVolThresholdCompetitor: number;
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
  competitors,
  kwVolThresholdClient:     initClientThresh,
  kwVolThresholdCompetitor: initCompetitorThresh,
  semrushDatabase:          initMarket,
  onClose,
  onSaved,
}: Props) {
  const [clientName,  setClientName]  = useState(initName);
  const [websiteUrl,  setWebsiteUrl]  = useState(initUrl);
  const [industry,    setIndustry]    = useState(initIndustry ?? '');
  const [notes,       setNotes]       = useState(initNotes ?? '');
  const [clientThresh,     setClientThresh]     = useState<number>(initClientThresh     ?? 0);
  const [competitorThresh, setCompetitorThresh] = useState<number>(initCompetitorThresh ?? 0);
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
          kwVolThresholdClient:     clientThresh,
          kwVolThresholdCompetitor: competitorThresh,
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

  // ── Threshold preset button styles ────────────────────────────────────────
  function presetBtn(value: number, current: number, color: { bg: string; border: string; text: string }) {
    const active = current === value;
    return {
      padding:      '4px 11px',
      borderRadius: '20px',
      border:       `1px solid ${active ? color.border : '#3A3A5C'}`,
      background:   active ? color.bg : 'transparent',
      color:        active ? color.text : '#8888B0',
      fontSize:     '11px',
      cursor:       'pointer',
      transition:   'all 0.12s',
      fontWeight:   active ? 600 : 400,
    } as React.CSSProperties;
  }

  const clientColor   = { bg: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.6)', text: '#38BDF8' };
  const competitorColor = { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.6)', text: '#F59E0B' };

  // ── Section divider ───────────────────────────────────────────────────────
  function SectionLabel({ label }: { label: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', color: '#4A4A72', textTransform: 'uppercase' }}>{label}</span>
        <div style={{ flex: 1, height: '1px', background: '#1A1A30' }} />
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
          background: '#0C0C18',
          border: '1px solid #1E1E35',
          borderRadius: '14px',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* ── Modal header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 16px', borderBottom: '1px solid #1A1A2E', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-settings" style={{ fontSize: '14px', color: '#8B85FF' }} aria-hidden="true" />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#E8E8FF', margin: 0 }}>Edit Project</h2>
              <p style={{ fontSize: '11px', color: '#555575', margin: '2px 0 0' }}>Settings, competitors &amp; keyword filters</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505070', padding: '4px' }}
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
            <p style={{ fontSize: '10px', color: '#505070', marginTop: '4px', lineHeight: 1.5 }}>
              Which country&apos;s Google to analyze — sets the Semrush keyword database and the country for SERP feature scans. Changing this requires a full re-analysis; existing data stays from the previous market until then.
            </p>
          </div>

          {/* ── Section 2: Competitors ── */}
          <SectionLabel label="Competitors" />
          <div style={{ marginBottom: '22px' }}>
            <CompetitorsPanel
              projectId={projectId}
              competitors={competitors}
              onChange={onSaved}
            />
          </div>

          {/* ── Section 3: Keyword Volume Thresholds ── */}
          <SectionLabel label="Keyword Volume Thresholds" />

          <div style={{ background: '#0F0F1C', border: '0.5px solid #1E1E38', borderRadius: '10px', padding: '16px', marginBottom: '22px' }}>
            <p style={{ fontSize: '11px', color: '#7070A0', marginBottom: '16px', lineHeight: 1.5 }}>
              Keywords below these monthly search volume thresholds are hidden from all analysis panels, and on the next data pull they are excluded inside the Semrush query itself — never fetched, never billed (10 API units per row). Set to <strong style={{ color: '#9090C0' }}>All</strong> to fetch every keyword regardless of volume.
            </p>

            {/* Client ranked threshold */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#38BDF8', letterSpacing: '.04em' }}>Client ranked keywords</span>
                <span style={{ fontSize: '10px', color: '#505070' }}>min monthly volume</span>
                {clientThresh > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#38BDF8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', padding: '1px 8px', borderRadius: '10px' }}>
                    ≥ {clientThresh >= 1000 ? `${clientThresh / 1000}K` : clientThresh}/mo
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {VOL_PRESETS.map(p => (
                  <button key={p.value} type="button" onClick={() => setClientThresh(p.value)}
                    style={presetBtn(p.value, clientThresh, clientColor)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Competitor gap threshold */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#F59E0B', letterSpacing: '.04em' }}>Competitor gap keywords</span>
                <span style={{ fontSize: '10px', color: '#505070' }}>min monthly volume</span>
                {competitorThresh > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 8px', borderRadius: '10px' }}>
                    ≥ {competitorThresh >= 1000 ? `${competitorThresh / 1000}K` : competitorThresh}/mo
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {VOL_PRESETS.map(p => (
                  <button key={p.value} type="button" onClick={() => setCompetitorThresh(p.value)}
                    style={presetBtn(p.value, competitorThresh, competitorColor)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {error && (
            <p style={{ fontSize: '12px', color: '#F87171', marginBottom: '12px' }}>{error}</p>
          )}
          {success && (
            <p style={{ fontSize: '12px', color: '#4ADE80', marginBottom: '12px' }}>✓ Project saved successfully.</p>
          )}

          {/* ── Footer actions ── */}
          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px', borderRadius: '8px',
                background: 'transparent',
                border: '1px solid #2A2A48',
                color: '#8080A8', fontSize: '13px', cursor: 'pointer',
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
                background: saving ? '#3D3D8A' : '#6C63FF',
                border: 'none',
                color: '#FFF', fontSize: '13px', fontWeight: 600,
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
  background: '#111120',
  border: '1px solid #1E1E35',
  borderRadius: '8px',
  padding: '9px 12px',
  color: '#F0F0FF',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: '#7070A0', letterSpacing: '.05em', marginBottom: '6px', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
