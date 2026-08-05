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

// ─────────────────────────────────────────────────────────────────────────────
// v7.415 — InsightPanel: the same sentences, one card.
//
// InsightStack renders N separate cards, each with a 3px full-height accent
// bar down its left edge; three of those stacked read as three loud stripes.
// InsightPanel keeps every sentence, every emphasis span and every evidence
// line EXACTLY as the rules produced them (no text is rewritten, dropped or
// summarized — Const I.5 honest gaps still hold, a null insight contributes
// nothing) and only changes the frame: one bordered card, hairline dividers
// between rows, and the tone carried by a small dot + the emphasized words
// instead of a slab of color.
//
// Tokens only, so both themes flip automatically (Const IV.6 / V.5):
// --c-111118 surface, --c-1e1e2e border/divider, --c-f0f0ff body,
// --c-8888aa muted (5.6:1 on the dark surface, #4C4D67 on the light one),
// --c-22d3ee / --c-f59e0b tone accents with their 0_12 alpha halos.
// ─────────────────────────────────────────────────────────────────────────────

const TONE_HALO: Record<Insight['tone'], string> = {
  signal: 'var(--ca-34-211-238-0_12)',
  watch:  'var(--ca-245-158-11-0_12)',
};

export function InsightPanel({ insights, title, style }: {
  insights: Array<Insight | null>;
  title?: string;
  style?: React.CSSProperties;
}) {
  const live = insights.filter((x): x is Insight => x !== null);
  if (live.length === 0) return null;
  return (
    <div
      data-insight-panel={live.length}
      style={{
        background: 'var(--c-111118)',
        border: '1px solid var(--c-1e1e2e)',
        borderRadius: 10,
        overflow: 'hidden',
        ...style,
      }}
    >
      {title && (
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
          padding: '9px 14px', borderBottom: '1px solid var(--c-1e1e2e)',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--c-8888aa)' }}>
            {title}
          </span>
          <span style={{ fontSize: 9, color: 'var(--c-8888aa)', letterSpacing: '.02em' }}>
            {live.length} finding{live.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {live.map((ins, i) => {
        const accent = TONE_ACCENT[ins.tone];
        // 'Diagnosis · Presence, not performance' → muted type, accented subject.
        const segs = ins.kicker.split('·').map(s => s.trim()).filter(Boolean);
        const type = segs.length > 1 ? segs[0] : null;
        const subject = segs.length > 1 ? segs.slice(1).join(' · ') : ins.kicker;
        return (
          <div
            key={`${ins.id}-${i}`}
            data-insight={ins.id}
            style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 11, alignItems: 'start',
              padding: '11px 14px',
              borderTop: i === 0 ? 'none' : '1px solid var(--c-1e1e2e)',
            }}
          >
            <span aria-hidden style={{
              width: 7, height: 7, borderRadius: '50%', background: accent,
              boxShadow: `0 0 0 3px ${TONE_HALO[ins.tone]}`, marginTop: 5, flexShrink: 0,
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', margin: 0, color: 'var(--c-8888aa)' }}>
                  {type ? <>{type} · <span style={{ color: accent }}>{subject}</span></> : <span style={{ color: accent }}>{subject}</span>}
                </p>
                <p style={{ fontSize: 9, color: 'var(--c-8888aa)', margin: 0, letterSpacing: '.02em' }}>
                  {ins.evidence}
                </p>
              </div>
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--c-f0f0ff)', margin: '4px 0 0' }}>
                {ins.parts.map((s, j) =>
                  s.em
                    ? <strong key={j} style={{ color: accent, fontWeight: 700 }}>{s.t}</strong>
                    : <span key={j}>{s.t}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
