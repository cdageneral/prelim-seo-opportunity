'use client';
/**
 * components/brief/JourneySegmentSummary.tsx — v7.554
 *
 * Two summary blocks for the Audience Journeys panel (Wayne 2026-10-11):
 *   - SegmentJourneySummary — shown when ONE segment is selected: the persona card on
 *     the left (stored segment research, read as written) and the journey & content gap
 *     on the right (LOBs · categories · topics · existing · to build · in plan, then one
 *     row per umbrella).
 *   - AllJourneysRollup — shown on "All Segments": every page the journeys require, the
 *     real search volume behind them, and how the topics split across segments.
 *
 * Every number arrives pre-computed from lib/journey/segmentSummary.ts — the same
 * builder the Journey-map PDF cover reads (Const II.6a / II.7). This file only draws.
 * Theme tokens only (Const IV.6) — no hex, no raw palette classes.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { JourneySliceSummary, JourneyRollup, SummaryPersona } from '@/lib/journey/segmentSummary';
import { fmtSummaryVol } from '@/lib/journey/segmentSummary';

export type { SummaryPersona };

const n0 = (v: number) => Math.round(v).toLocaleString();

const T = {
  ink:    'var(--c-dcdcf4)',
  ink2:   'var(--c-c8c8e8)',
  body:   'var(--c-9090b8)',
  faint:  'var(--c-6a6a90)',
  line:   'var(--c-1a1a30)',
  line2:  'var(--c-2a2a45)',
  card:   'var(--c-0d0d1e)',
  tile:   'var(--c-14142a)',
  green:  'var(--c-34d399)',
  red:    'var(--c-f87171)',
  orange: 'var(--c-f97316)',
};

function Tile({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div data-tile={label} style={{ flex: '1 1 110px', minWidth: 100, background: T.tile, border: `1px solid ${T.line}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: color ?? T.ink }}>{n0(value)}</div>
      <div style={{ fontSize: 12, color: T.body, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function SectionLabel({ children, color }: { children: ReactNode; color: string }) {
  return <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color, marginBottom: 4 }}>{children}</div>;
}

function PersonaCard({ p, accent }: { p: SummaryPersona; accent: string }) {
  const pct = Math.max(0, Math.min(100, Number(p.volumePct) || 0));
  const R = 22, C = 2 * Math.PI * R;
  const initials = (p.name || '?').replace(/^the\s+/i, '').split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  const block = (title: string, text?: string) => text ? (
    <div style={{ marginTop: 11 }}>
      <SectionLabel color={accent}>{title}</SectionLabel>
      <p style={{ fontSize: 11.5, color: T.body, lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  ) : null;
  return (
    <div data-persona-card style={{ flex: '0 1 320px', minWidth: 260, border: `1px solid ${T.line}`, borderTop: `4px solid ${accent}`, borderRadius: 12, background: T.card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {p.personaImageUrl ? (
          <img src={p.personaImageUrl} alt={`Portrait representing ${p.name}`} loading="lazy"
            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${accent}`, flexShrink: 0 }} />
        ) : (
          <span style={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${accent}`, color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{initials}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>{p.label}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, lineHeight: 1.2, marginTop: 2 }}>{p.name}</div>
        </div>
        {pct > 0 && (
          <div title="Modeled share of the project's real search demand (Constitution I.5a)" style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
            <svg width={56} height={56} viewBox="0 0 56 56" aria-hidden>
              <circle cx={28} cy={28} r={R} fill="none" style={{ stroke: T.line2 }} strokeWidth={5} />
              <circle cx={28} cy={28} r={R} fill="none" style={{ stroke: accent }} strokeWidth={5} strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 28 28)" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, lineHeight: 1 }}>{Math.round(pct)}%</span>
              <span style={{ fontSize: 7.5, color: T.faint, marginTop: 1 }}>of volume</span>
            </div>
          </div>
        )}
      </div>
      {p.tagline && (
        <p style={{ fontSize: 12, fontStyle: 'italic', color: T.ink2, lineHeight: 1.45, margin: '11px 0 0', borderLeft: `3px solid ${accent}`, paddingLeft: 9 }}>&ldquo;{p.tagline}&rdquo;</p>
      )}
      {block('Who they are', p.demographics)}
      {block('The wake-up call', p.trigger)}
      {block('Influence & validation', p.influencerRole)}
      {(p.touchpoints?.length ?? 0) > 0 && (
        <div style={{ marginTop: 11 }}>
          <SectionLabel color={accent}>Path to purchase</SectionLabel>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.touchpoints!.map((tp, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: accent, color: 'var(--c-08080f)', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 11, color: T.body, lineHeight: 1.45 }}><b style={{ color: T.ink2 }}>{tp.stage}</b>{tp.description ? ` — ${tp.description}` : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {block('Messaging that wins', p.messagingAndTone)}
    </div>
  );
}

const TH: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: T.faint, padding: '8px 10px', borderBottom: `2px solid ${T.line2}`, whiteSpace: 'nowrap' };
const TD: CSSProperties = { fontSize: 13, color: T.ink2, padding: '9px 10px', borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' };

export function SegmentJourneySummary({ persona, summary, accent }: { persona: SummaryPersona; summary: JourneySliceSummary; accent: string }) {
  return (
    <section data-segment-summary style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: '16px 18px', marginBottom: 18 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800, color: T.ink }}>
        {persona.label}: <span style={{ color: T.orange }}>Journey &amp; Content Gap</span>
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <PersonaCard p={persona} accent={accent} />
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Tile value={summary.lobs} label="LOBs" />
            <Tile value={summary.categories} label="Categories" />
            <Tile value={summary.topics} label="Topics" />
            <Tile value={summary.existing} label="Existing pages" color={T.green} />
            <Tile value={summary.build} label="To build" color={T.red} />
            <Tile value={summary.inPlan} label="In Content Plan" />
          </div>
          {summary.umbrellas.length === 0 ? (
            <div style={{ marginTop: 14, border: `1px dashed ${T.line2}`, borderRadius: 10, padding: '20px 14px', textAlign: 'center', fontSize: 12, color: T.faint }}>
              No journey topics are attributed to this segment yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'left' }}>Umbrella</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Volume</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Categories</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Topics</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Existing</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Build</th>
                    <th style={{ ...TH, textAlign: 'right' }}>In plan</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.umbrellas.map(u => (
                    <tr key={u.name} data-umbrella-row={u.name}>
                      <td style={{ ...TD, fontWeight: 700, color: T.ink, whiteSpace: 'normal' }}>{u.name}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{fmtSummaryVol(u.volume)}/mo</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{n0(u.categories)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{n0(u.topics)}</td>
                      <td style={{ ...TD, textAlign: 'right', color: T.green, fontWeight: 700 }}>{n0(u.existing)}</td>
                      <td style={{ ...TD, textAlign: 'right', color: T.red, fontWeight: 700 }}>{n0(u.build)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{n0(u.inPlan)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 10.5, color: T.faint, margin: '10px 0 0', lineHeight: 1.5 }}>
            <b style={{ color: T.green }}>Existing</b> = the client already ranks or holds a page; <b style={{ color: T.red }}>Build</b> = net-new page.
            Volumes are real Semrush monthly searches, each keyword counted once. Topics are attributed to this segment by the same
            audience-language partition every panel uses (a modeled attribution). In plan = this segment&rsquo;s topics in the Content Plan.
          </p>
        </div>
      </div>
    </section>
  );
}

export function AllJourneysRollup({ rollup, existing, build, accents }: {
  rollup: JourneyRollup; existing: number; build: number; accents: string[];
}) {
  const hasSegs = rollup.segments.length > 0;
  const card = (key: string, title: string, value: number, color: string, sub = 'content articles') => (
    <div key={key} data-rollup-seg={key} style={{ flex: '1 1 150px', minWidth: 140, background: T.tile, borderTop: `4px solid ${color}`, borderRadius: '0 0 10px 10px', padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.15, marginTop: 6 }}>{n0(value)}</div>
      <div style={{ fontSize: 11.5, color: T.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={sub}>{sub}</div>
    </div>
  );
  return (
    <section data-rollup style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: '16px 18px', marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.orange }}>Total pages required in all product journeys</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch', marginTop: 8 }}>
        <div style={{ minWidth: 180 }}>
          <div data-rollup-total style={{ fontSize: 56, fontWeight: 900, color: T.ink, lineHeight: 1 }}>{n0(rollup.topics)}</div>
          <div style={{ fontSize: 13, color: T.body, marginTop: 6 }}>topics across {n0(rollup.categories)} categories</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>
            <span style={{ color: T.green, fontWeight: 700 }}>{n0(existing)} existing</span>
            <span style={{ color: T.faint }}> · </span>
            <span style={{ color: T.red, fontWeight: 700 }}>{n0(build)} to build</span>
          </div>
        </div>
        <div style={{ borderLeft: `3px solid ${T.orange}`, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.body }}>Total annual search volume</div>
            <div><span data-rollup-annual style={{ fontSize: 28, fontWeight: 800, color: T.ink }}>{fmtSummaryVol(rollup.annualVolume)}</span> <span style={{ fontSize: 12, color: T.body }}>searches / yr</span></div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.body }}>Total monthly volume</div>
            <div><span data-rollup-monthly style={{ fontSize: 22, fontWeight: 800, color: T.ink2 }}>{fmtSummaryVol(rollup.monthlyVolume)}</span> <span style={{ fontSize: 12, color: T.body }}>searches / mo</span></div>
          </div>
        </div>
      </div>
      {hasSegs && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          {rollup.segments.map((s, i) => card(s.id, s.label, s.topics, accents[i % accents.length], `content articles · ${s.name}`))}
          {card('shared', 'Overlapping segments', rollup.shared, T.orange, 'content articles · shared across segments')}
        </div>
      )}
      <p style={{ fontSize: 10.5, color: T.faint, margin: '10px 0 0', lineHeight: 1.5 }}>
        One topic = one page. Monthly volume is the real Semrush average monthly searches across every journey keyword, each keyword counted once;
        annual = monthly &times; 12.{hasSegs ? ' Segment counts use the panels’ audience-language partition (a modeled attribution); overlapping = topics shared by more than one segment or matching none specifically. Segments + overlapping sum to the total.' : ''}
      </p>
    </section>
  );
}
