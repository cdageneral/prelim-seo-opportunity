'use client';

// ─────────────────────────────────────────────────────────────────────────────
// InsightBanner — v7.366: the shared renderer for the insight-sentence layer.
//
// Presentational only. Every sentence it shows was computed by a pure rule in
// lib/insights.ts from numbers the host panel already derived off real source
// rows (Const II.6); a null insight renders NOTHING (honest gap, Const I.5).
// Colors use only theme tokens that flip with [data-theme="light"] so both
// themes hold contrast automatically (Const IV.6 / V.5): --c-111118 (surface),
// --c-1e1e2e (border), --c-f0f0ff (text), --c-8888aa (muted), --c-22d3ee
// (signal accent), --c-f59e0b (watch accent). Styling follows the exec
// SignalCard convention (left accent bar on an inset card).
// ─────────────────────────────────────────────────────────────────────────────

import type { Insight } from '@/lib/insights';

const TONE_ACCENT: Record<Insight['tone'], string> = {
  signal: 'var(--c-22d3ee)',
  watch:  'var(--c-f59e0b)',
};

export default function InsightBanner({ insight, style }: {
  insight: Insight | null;
  style?: React.CSSProperties;
}) {
  if (!insight) return null;
  const accent = TONE_ACCENT[insight.tone];
  return (
    <div
      data-insight={insight.id}
      style={{
        background: 'var(--c-111118)',
        borderLeft: `3px solid ${accent}`,
        borderTop: '1px solid var(--c-1e1e2e)',
        borderRight: '1px solid var(--c-1e1e2e)',
        borderBottom: '1px solid var(--c-1e1e2e)',
        borderRadius: '0 8px 8px 0',
        padding: '10px 14px',
        ...style,
      }}
    >
      <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: accent, margin: 0 }}>
        {insight.kicker}
      </p>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--c-f0f0ff)', margin: '4px 0 0' }}>
        {insight.parts.map((s, i) =>
          s.em
            ? <strong key={i} style={{ color: accent, fontWeight: 700 }}>{s.t}</strong>
            : <span key={i}>{s.t}</span>
        )}
      </p>
      <p style={{ fontSize: 9, color: 'var(--c-8888aa)', margin: '5px 0 0', letterSpacing: '.02em' }}>
        {insight.evidence}
      </p>
    </div>
  );
}

// Stacks multiple insights with consistent spacing; renders nothing when all null.
export function InsightStack({ insights, style }: {
  insights: Array<Insight | null>;
  style?: React.CSSProperties;
}) {
  const live = insights.filter((x): x is Insight => x !== null);
  if (live.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {live.map((ins, i) => <InsightBanner key={`${ins.id}-${i}`} insight={ins} />)}
    </div>
  );
}
