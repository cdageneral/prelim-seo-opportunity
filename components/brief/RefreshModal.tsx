'use client';

/**
 * RefreshModal — v7.112
 *
 * Shown when the user clicks "Refresh Analysis" on a project that already
 * has results. Presents three modes:
 *   • Data-only refresh (v7.112, default) — ZERO Semrush units. Keeps the keyword
 *     footprint, re-scans previously scanned SERP keywords via SerpAPI (refreshing
 *     AIO citation sources), re-runs Claude. No cost-estimate modal — nothing to bill.
 *   • Gap & rank refresh — refreshes client rankings + fetches net-new competitor
 *     keywords. v7.97/v7.112: since v7.86 this re-pulls FULL client + competitor
 *     footprints, so Semrush cost ≈ a full re-analysis (savings are SerpAPI + LLM
 *     probe reuse) — the card now says this explicitly.
 *   • Full re-analysis  — recrawls everything (full footprint; unit cost estimated
 *     + confirmed before run, v7.86).
 */

import { useState } from 'react';

// Same presets as EditProjectModal / NewProjectModal — keep in sync.
const VOL_PRESETS: { label: string; value: number }[] = [
  { label: 'All',   value: 0    },
  { label: '500+',  value: 500  },
  { label: '1K+',   value: 1000 },
  { label: '2.4K+', value: 2400 },
  { label: '5K+',   value: 5000 },
];

interface Props {
  clientName:    string;
  lastAnalyzed:  string | null;   // ISO date string
  keywordsCount: number;
  onClose:       () => void;
  onRun:         (mode: 'full' | 'gaps' | 'data') => void;
  // v7.98: project volume floors, editable here before the run. Saving writes
  // to the project record (single source of truth shared with project
  // create/edit), then onRun proceeds — the cost estimate reads the new values.
  clientThreshold:     number;
  competitorThreshold: number;
  onSaveThresholds:    (client: number, competitor: number) => Promise<void>;
}

export default function RefreshModal({ clientName, lastAnalyzed, keywordsCount, onClose, onRun, clientThreshold, competitorThreshold, onSaveThresholds }: Props) {
  const [mode, setMode] = useState<'full' | 'gaps' | 'data'>('data');
  const [clientThresh,     setClientThresh]     = useState<number>(clientThreshold     ?? 0);
  const [competitorThresh, setCompetitorThresh] = useState<number>(competitorThreshold ?? 0);
  const [saving, setSaving] = useState(false);

  const thresholdsChanged = clientThresh !== (clientThreshold ?? 0) || competitorThresh !== (competitorThreshold ?? 0);

  async function handleRun() {
    if (thresholdsChanged) {
      setSaving(true);
      try { await onSaveThresholds(clientThresh, competitorThresh); }
      finally { setSaving(false); }
    }
    onRun(mode);
  }

  const presetBtn = (value: number, active: number, color: string): React.CSSProperties => ({
    fontSize: '10px', padding: '4px 10px', borderRadius: '14px', cursor: 'pointer',
    background: value === active ? `${color}1A` : 'var(--c-131325)',
    border: `1px solid ${value === active ? color : 'var(--c-2a2a4a)'}`,
    color: value === active ? color : 'var(--c-7070a0)',
    transition: 'all .15s',
  });

  const scanDate = lastAnalyzed
    ? new Date(lastAnalyzed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg animate-fade-in" style={{ background: 'var(--c-0e0e1c)', border: '1px solid var(--c-2a2a4a)', borderRadius: '12px', padding: '24px' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--c-1e1e3a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-world" style={{ fontSize: '16px', color: 'var(--c-8080c0)' }} aria-hidden="true" />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-e0e0f0)', margin: 0 }}>{clientName}</p>
              {scanDate && (
                <p style={{ fontSize: '11px', color: 'var(--c-606080)', margin: 0 }}>
                  Last analyzed {scanDate} · {keywordsCount} keywords tracked
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-606080)', padding: '4px' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--c-7070a0)', marginBottom: '14px' }}>Choose how to refresh this project&apos;s data:</p>

        {/* Mode cards */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>

          {/* Data-only refresh (v7.112) */}
          <button
            onClick={() => setMode('data')}
            style={{
              flex: 1, textAlign: 'left', cursor: 'pointer',
              background: mode === 'data' ? 'var(--c-101d38)' : 'var(--c-131325)',
              border: `1.5px solid ${mode === 'data' ? 'var(--c-38bdf8)' : 'var(--c-2a2a4a)'}`,
              borderRadius: '10px', padding: '14px',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <i className="ti ti-bolt" style={{ fontSize: '18px', color: mode === 'data' ? 'var(--c-38bdf8)' : 'var(--c-454565)' }} aria-hidden="true" />
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', fontWeight: 500, background: 'var(--c-0d2b1d)', color: 'var(--c-4ade80)' }}>0 Semrush units</span>
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-e0e0f0)', margin: '0 0 4px' }}>Data-only refresh</p>
            <p style={{ fontSize: '11px', color: 'var(--c-7070a0)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Keeps your keyword footprint. Re-scans your scanned SERP keywords (fresh AIO citations, PAA, video) and re-runs Claude.
            </p>
            <p style={{ fontSize: '10px', color: 'var(--c-454565)', margin: 0 }}>Best for refreshing what you have</p>
          </button>

          {/* Full re-analysis */}
          <button
            onClick={() => setMode('full')}
            style={{
              flex: 1, textAlign: 'left', cursor: 'pointer',
              background: mode === 'full' ? 'var(--c-1a1a38)' : 'var(--c-131325)',
              border: `1.5px solid ${mode === 'full' ? 'var(--c-6c63ff)' : 'var(--c-2a2a4a)'}`,
              borderRadius: '10px', padding: '14px',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <i className="ti ti-refresh" style={{ fontSize: '18px', color: mode === 'full' ? 'var(--c-7b68ee)' : 'var(--c-454565)' }} aria-hidden="true" />
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', fontWeight: 500, background: 'var(--c-2b0d0d)', color: 'var(--c-f87171)' }}>cost shown before run</span>
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-e0e0f0)', margin: '0 0 4px' }}>Full re-analysis</p>
            <p style={{ fontSize: '11px', color: 'var(--c-7070a0)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Recrawls all domains from scratch — replaces the entire footprint with fresh Semrush + SerpAPI data.
            </p>
            <p style={{ fontSize: '10px', color: 'var(--c-454565)', margin: 0 }}>Best for quarterly reviews</p>
          </button>

          {/* Find gaps only */}
          <button
            onClick={() => setMode('gaps')}
            style={{
              flex: 1, textAlign: 'left', cursor: 'pointer',
              background: mode === 'gaps' ? 'var(--c-0d1e2b)' : 'var(--c-131325)',
              border: `1.5px solid ${mode === 'gaps' ? 'var(--c-00c9b1)' : 'var(--c-2a2a4a)'}`,
              borderRadius: '10px', padding: '14px',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <i className="ti ti-zoom-scan" style={{ fontSize: '18px', color: mode === 'gaps' ? 'var(--c-00c9b1)' : 'var(--c-454565)' }} aria-hidden="true" />
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', fontWeight: 500, background: 'var(--c-0d2b1d)', color: 'var(--c-4ade80)' }}>cost shown before run</span>
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-e0e0f0)', margin: '0 0 4px' }}>Gap &amp; rank refresh</p>
            <p style={{ fontSize: '11px', color: 'var(--c-7070a0)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Re-pulls full footprints from Semrush to update rankings &amp; find new gaps — Semrush cost ≈ full re-analysis. Reuses SERP &amp; LLM data.
            </p>
            <p style={{ fontSize: '10px', color: 'var(--c-454565)', margin: 0 }}>Best for monthly refreshes</p>
          </button>

        </div>

        {/* ── Semrush volume floor (v7.98) — hidden in data mode (no Semrush pull, v7.112) ── */}
        {mode !== 'data' && (
        <div style={{ background: 'var(--c-0f0f1c)', border: '0.5px solid var(--c-1e1e38)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <p style={{ fontSize: '11px', color: 'var(--c-8080c0)', fontWeight: 500, margin: 0 }}>Keyword volume floor</p>
            <span style={{ fontSize: '10px', color: 'var(--c-505070)' }}>keywords below the floor are never fetched — and never billed</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-38bdf8)', letterSpacing: '.04em', width: '70px', flexShrink: 0 }}>Client</span>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {VOL_PRESETS.map(p => (
                <button key={p.value} type="button" onClick={() => setClientThresh(p.value)} style={presetBtn(p.value, clientThresh, 'var(--c-38bdf8)')}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--c-f59e0b)', letterSpacing: '.04em', width: '70px', flexShrink: 0 }}>Competitors</span>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {VOL_PRESETS.map(p => (
                <button key={p.value} type="button" onClick={() => setCompetitorThresh(p.value)} style={presetBtn(p.value, competitorThresh, 'var(--c-f59e0b)')}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: '10px', color: 'var(--c-505070)', margin: '8px 0 0', lineHeight: 1.5 }}>
            {thresholdsChanged
              ? 'Changed — will be saved to project settings when you run (also used by Edit Project and future runs).'
              : 'Saved in project settings — same values as Edit Project.'}
          </p>
        </div>
        )}

        {/* Breakdown panels */}
        {mode === 'data' && (
          <div style={{ background: 'var(--c-131325)', border: '0.5px solid var(--c-2a2a4a)', borderRadius: '8px', padding: '12px', marginBottom: '18px' }}>
            <p style={{ fontSize: '11px', color: 'var(--c-8080c0)', fontWeight: 500, margin: '0 0 10px' }}>How data-only refresh works</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <Row icon="ti-check" iconBg="var(--c-0d2b1d)" iconColor="var(--c-4ade80)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Keyword footprint (Semrush / uploads)</strong><span style={{ color: 'var(--c-4ade80)' }}> → reused untouched — 0 Semrush units billed</span></>} />
              <Row icon="ti-refresh" iconBg="var(--c-101d38)" iconColor="var(--c-38bdf8)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Scanned SERP keywords</strong><span style={{ color: 'var(--c-8080c0)' }}> → RE-scanned via SerpAPI (up to 50; 1 credit each) — fresh AIO citation sources, PAA &amp; video data</span></>} />
              <Row icon="ti-check" iconBg="var(--c-0d2b1d)" iconColor="var(--c-4ade80)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>LLM probe data</strong><span style={{ color: 'var(--c-4ade80)' }}> → reused</span></>} />
              <Row icon="ti-brain" iconBg="var(--c-1c1c38)" iconColor="var(--c-8080c0)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Claude analysis</strong><span style={{ color: 'var(--c-8080c0)' }}> → re-runs on the refreshed data</span></>} />
            </div>
            <p style={{ fontSize: '10px', color: 'var(--c-606080)', margin: '10px 0 0', lineHeight: 1.5 }}>
              Keyword rankings are NOT updated in this mode — positions stay as last pulled.
              Use Gap &amp; rank refresh (or Full re-analysis) when you need fresh Semrush rankings.
            </p>
          </div>
        )}

        {mode === 'gaps' && (
          <div style={{ background: 'var(--c-131325)', border: '0.5px solid var(--c-2a2a4a)', borderRadius: '8px', padding: '12px', marginBottom: '18px' }}>
            <p style={{ fontSize: '11px', color: 'var(--c-8080c0)', fontWeight: 500, margin: '0 0 10px' }}>How gap scan works</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <Row icon="ti-refresh" iconBg="var(--c-1c1c38)" iconColor="var(--c-8080c0)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Client&apos;s current rankings</strong><span style={{ color: 'var(--c-8080c0)' }}> → full footprint re-pulled; positions updated, new keywords added</span></>} />
              <Row icon="ti-search" iconBg="var(--c-1c1c38)" iconColor="var(--c-8080c0)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Competitor keywords not in footprint</strong><span style={{ color: 'var(--c-8080c0)' }}> → full footprints pulled, net-new merged</span></>} />
              <Row icon="ti-check" iconBg="var(--c-0d2b1d)" iconColor="var(--c-4ade80)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Existing SERP &amp; LLM probe data</strong><span style={{ color: 'var(--c-4ade80)' }}> → reused (this is where the savings are)</span></>} />
              <Row icon="ti-brain" iconBg="var(--c-1c1c38)" iconColor="var(--c-8080c0)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Claude analysis</strong><span style={{ color: 'var(--c-8080c0)' }}> → re-runs on full updated footprint</span></>} />
            </div>
            <p style={{ fontSize: '10px', color: 'var(--c-606080)', margin: '10px 0 0', lineHeight: 1.5 }}>
              Semrush bills 10 units per keyword row, so the Semrush cost is similar to a full re-analysis —
              the exact unit estimate is shown for confirmation before anything runs.
            </p>
          </div>
        )}

        {mode === 'full' && (
          <div style={{ background: 'var(--c-131325)', border: '0.5px solid var(--c-2a2a4a)', borderRadius: '8px', padding: '12px', marginBottom: '18px' }}>
            <p style={{ fontSize: '11px', color: 'var(--c-8080c0)', fontWeight: 500, margin: '0 0 10px' }}>What gets replaced</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <Row icon="ti-refresh" iconBg="var(--c-2b0d0d)" iconColor="var(--c-f87171)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>All Semrush keyword data</strong><span style={{ color: 'var(--c-f87171)' }}> → replaced</span></>} />
              <Row icon="ti-refresh" iconBg="var(--c-2b0d0d)" iconColor="var(--c-f87171)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>All SERP feature data</strong><span style={{ color: 'var(--c-f87171)' }}> → replaced</span></>} />
              <Row icon="ti-refresh" iconBg="var(--c-2b0d0d)" iconColor="var(--c-f87171)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>LLM probe (Claude + ChatGPT)</strong><span style={{ color: 'var(--c-f87171)' }}> → replaced</span></>} />
              <Row icon="ti-refresh" iconBg="var(--c-2b0d0d)" iconColor="var(--c-f87171)" text={<><strong style={{ color: 'var(--c-c0c0e0)' }}>Claude narrative</strong><span style={{ color: 'var(--c-f87171)' }}> → fully regenerated</span></>} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{ background: 'var(--c-131325)', border: '0.5px solid var(--c-2a2a4a)', borderRadius: '8px', padding: '9px 18px', color: 'var(--c-7070a0)', fontSize: '13px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={saving}
            style={{ background: 'var(--c-6c63ff)', border: 'none', borderRadius: '8px', padding: '9px 18px', color: 'white', fontSize: '13px', fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={mode === 'data' ? 'ti ti-bolt' : mode === 'gaps' ? 'ti ti-zoom-scan' : 'ti ti-refresh'} style={{ fontSize: '14px' }} aria-hidden="true" />
            {saving ? 'Saving thresholds…' : mode === 'data' ? 'Run data-only refresh (0 Semrush units)' : mode === 'gaps' ? 'Run gap & rank refresh' : 'Run full re-analysis'}
          </button>
        </div>

      </div>
    </div>
  );
}

function Row({ icon, iconBg, iconColor, text }: { icon: string; iconBg: string; iconColor: string; text: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: '10px', color: iconColor }} aria-hidden="true" />
      </div>
      <span style={{ fontSize: '11px', color: 'var(--c-7070a0)' }}>{text}</span>
    </div>
  );
}
