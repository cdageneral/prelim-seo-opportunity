'use client';

/**
 * RefreshModal — v7.31
 *
 * Shown when the user clicks "Refresh Analysis" on a project that already
 * has results. Presents two modes:
 *   • Full re-analysis  — recrawls everything (~2,400 Semrush units)
 *   • Find gaps only    — fetches only net-new competitor keywords (~300 units)
 */

import { useState } from 'react';

interface Props {
  clientName:    string;
  lastAnalyzed:  string | null;   // ISO date string
  keywordsCount: number;
  onClose:       () => void;
  onRun:         (mode: 'full' | 'gaps') => void;
}

export default function RefreshModal({ clientName, lastAnalyzed, keywordsCount, onClose, onRun }: Props) {
  const [mode, setMode] = useState<'full' | 'gaps'>('gaps');

  const scanDate = lastAnalyzed
    ? new Date(lastAnalyzed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg animate-fade-in" style={{ background: '#0E0E1C', border: '1px solid #2A2A4A', borderRadius: '12px', padding: '24px' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#1E1E3A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-world" style={{ fontSize: '16px', color: '#8080C0' }} aria-hidden="true" />
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#E0E0F0', margin: 0 }}>{clientName}</p>
              {scanDate && (
                <p style={{ fontSize: '11px', color: '#606080', margin: 0 }}>
                  Last analyzed {scanDate} · {keywordsCount} keywords tracked
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606080', padding: '4px' }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p style={{ fontSize: '12px', color: '#7070A0', marginBottom: '14px' }}>Choose how to refresh this project&apos;s data:</p>

        {/* Mode cards */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>

          {/* Full re-analysis */}
          <button
            onClick={() => setMode('full')}
            style={{
              flex: 1, textAlign: 'left', cursor: 'pointer',
              background: mode === 'full' ? '#1A1A38' : '#131325',
              border: `1.5px solid ${mode === 'full' ? '#6C63FF' : '#2A2A4A'}`,
              borderRadius: '10px', padding: '14px',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <i className="ti ti-refresh" style={{ fontSize: '18px', color: mode === 'full' ? '#7B68EE' : '#454565' }} aria-hidden="true" />
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', fontWeight: 500, background: '#2B0D0D', color: '#F87171' }}>~2,400 units</span>
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 4px' }}>Full re-analysis</p>
            <p style={{ fontSize: '11px', color: '#7070A0', margin: '0 0 8px', lineHeight: 1.5 }}>
              Recrawls all domains from scratch — replaces the entire footprint with fresh Semrush + SerpAPI data.
            </p>
            <p style={{ fontSize: '10px', color: '#454565', margin: 0 }}>Best for quarterly reviews</p>
          </button>

          {/* Find gaps only */}
          <button
            onClick={() => setMode('gaps')}
            style={{
              flex: 1, textAlign: 'left', cursor: 'pointer',
              background: mode === 'gaps' ? '#0D1E2B' : '#131325',
              border: `1.5px solid ${mode === 'gaps' ? '#00C9B1' : '#2A2A4A'}`,
              borderRadius: '10px', padding: '14px',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <i className="ti ti-zoom-scan" style={{ fontSize: '18px', color: mode === 'gaps' ? '#00C9B1' : '#454565' }} aria-hidden="true" />
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '20px', fontWeight: 500, background: '#0D2B1D', color: '#4ADE80' }}>~300 units</span>
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#E0E0F0', margin: '0 0 4px' }}>Find gaps only</p>
            <p style={{ fontSize: '11px', color: '#7070A0', margin: '0 0 8px', lineHeight: 1.5 }}>
              Checks competitors for keywords missing from your footprint. Reuses existing SERP &amp; LLM probe data.
            </p>
            <p style={{ fontSize: '10px', color: '#454565', margin: 0 }}>Best for monthly gap checks</p>
          </button>

        </div>

        {/* Breakdown panels */}
        {mode === 'gaps' && (
          <div style={{ background: '#131325', border: '0.5px solid #2A2A4A', borderRadius: '8px', padding: '12px', marginBottom: '18px' }}>
            <p style={{ fontSize: '11px', color: '#8080C0', fontWeight: 500, margin: '0 0 10px' }}>How gap scan works</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <Row icon="ti-check" iconBg="#0D2B1D" iconColor="#4ADE80" text={<><strong style={{ color: '#C0C0E0' }}>{keywordsCount} keywords already tracked</strong><span style={{ color: '#4ADE80' }}> → skipped, no API call</span></>} />
              <Row icon="ti-check" iconBg="#0D2B1D" iconColor="#4ADE80" text={<><strong style={{ color: '#C0C0E0' }}>Existing SERP &amp; LLM probe data</strong><span style={{ color: '#4ADE80' }}> → reused</span></>} />
              <Row icon="ti-search" iconBg="#1C1C38" iconColor="#8080C0" text={<><strong style={{ color: '#C0C0E0' }}>Competitor keywords not in footprint</strong><span style={{ color: '#8080C0' }}> → fetched</span></>} />
              <Row icon="ti-brain" iconBg="#1C1C38" iconColor="#8080C0" text={<><strong style={{ color: '#C0C0E0' }}>Claude analysis</strong><span style={{ color: '#8080C0' }}> → re-runs on full footprint + new gaps</span></>} />
            </div>
          </div>
        )}

        {mode === 'full' && (
          <div style={{ background: '#131325', border: '0.5px solid #2A2A4A', borderRadius: '8px', padding: '12px', marginBottom: '18px' }}>
            <p style={{ fontSize: '11px', color: '#8080C0', fontWeight: 500, margin: '0 0 10px' }}>What gets replaced</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <Row icon="ti-refresh" iconBg="#2B0D0D" iconColor="#F87171" text={<><strong style={{ color: '#C0C0E0' }}>All Semrush keyword data</strong><span style={{ color: '#F87171' }}> → replaced</span></>} />
              <Row icon="ti-refresh" iconBg="#2B0D0D" iconColor="#F87171" text={<><strong style={{ color: '#C0C0E0' }}>All SERP feature data</strong><span style={{ color: '#F87171' }}> → replaced</span></>} />
              <Row icon="ti-refresh" iconBg="#2B0D0D" iconColor="#F87171" text={<><strong style={{ color: '#C0C0E0' }}>LLM probe (Claude + ChatGPT)</strong><span style={{ color: '#F87171' }}> → replaced</span></>} />
              <Row icon="ti-refresh" iconBg="#2B0D0D" iconColor="#F87171" text={<><strong style={{ color: '#C0C0E0' }}>Claude narrative</strong><span style={{ color: '#F87171' }}> → fully regenerated</span></>} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{ background: '#131325', border: '0.5px solid #2A2A4A', borderRadius: '8px', padding: '9px 18px', color: '#7070A0', fontSize: '13px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onRun(mode)}
            style={{ background: '#6C63FF', border: 'none', borderRadius: '8px', padding: '9px 18px', color: 'white', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={mode === 'gaps' ? 'ti ti-zoom-scan' : 'ti ti-refresh'} style={{ fontSize: '14px' }} aria-hidden="true" />
            {mode === 'gaps' ? 'Run gap scan' : 'Run full re-analysis'}
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
      <span style={{ fontSize: '11px', color: '#7070A0' }}>{text}</span>
    </div>
  );
}
