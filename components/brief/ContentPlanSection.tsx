'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  buildContentPlan, planFromSnapshot, buildContentPlanFromTopics, brandTermsOf, filterPlanByIds, DISTANCE_LABEL, PRIORITY_LABEL, SUPPORT_LABEL,
  demandStatsOf, demandBucketOf, DEMAND_LABEL,   // v7.357: search-demand buckets for the demand view
  type ContentPlan, type ContentTopic, type Priority, type DemandBucket,
} from '@/lib/journey/contentPlan';
import { buildCanonicalClusterTopics, type IntentType } from '@/components/brief/ThemeClustersPanel';   // v7.210: one source of truth
import SegmentDownloadButton from '@/components/brief/SegmentDownloadButton';   // v7.328: per-segment XLSX download
import { exportSegmentXLSX, type ExportTopicRow } from '@/lib/export/topicExport';   // v7.328
// v7.353: audience-segment lens — the SAME topic→segment attribution the Journey panel
// uses, carried into this panel as a filter + row tags (Const II.7, one partition).
import {
  readSegments, buildTopicSegmentMap, buildSegTags, filterPlanBySegment,
  SegmentFilterBar, SegTagChip, type SegTag,
} from '@/components/brief/SegmentLens';

// ─── palette (matches the app's orbit-* dark theme) ─────────────────────────────
const COL = {
  cyan: 'var(--c-22d3ee)', purple: 'var(--c-a78bfa)', green: 'var(--c-34d399)', red: 'var(--c-f87171)',
  amber: 'var(--c-f59e0b)', orange: 'var(--c-fb923c)', txt: 'var(--c-dcdcf4)', txt2: 'var(--c-c8c8e8)',
  mut: 'var(--c-8080a0)', mut2: 'var(--c-6a6a90)', dim: 'var(--c-4a4a6a)', line: 'var(--c-1a1a30)', panel: 'var(--c-0d0d1e)',
};
const stateColor: Record<string, string> = { existing: COL.green, build: COL.orange, competitor: COL.purple };
const priColor: Record<Priority, string> = { P0: 'var(--c-f87171)', P1: 'var(--c-fbbf24)', P2: 'var(--c-22d3ee)', P3: 'var(--c-9090b8)' };   // v7.357: P3 = Backlog (grey)
const distFill: Record<number, string> = { 1: COL.green, 2: 'var(--c-7dd3fc)', 3: COL.cyan, 4: COL.purple };
// v7.357: funnel-stage + demand grouping metadata for the Content Map's Step-2 lenses.
const STAGE_ORDER: string[] = ['decision', 'consideration', 'awareness', 'retention'];   // lower-funnel first
const STAGE_LABEL: Record<string, string> = { decision: 'Decision', consideration: 'Consideration', awareness: 'Awareness', retention: 'Retention' };
const stageColor: Record<string, string> = { decision: COL.green, consideration: 'var(--c-a78bfa)', awareness: COL.cyan, retention: COL.amber };
const demandColor: Record<string, string> = { high: COL.green, med: COL.amber, low: COL.mut };

// v7.357: shared step header for the Content Map's guided flow (Step 1 Audience lives in
// ContentMapSection; Steps 2/3 here). Theme-token styled, legible in light + dark (IV.6).
export function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div style={{ margin: '20px 0 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'var(--ca-34-211-238-0_1)', border: '1px solid var(--ca-34-211-238-0_3)', color: COL.cyan, fontSize: 11, fontWeight: 800 }}>{n}</span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: COL.cyan }}>Step {n}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: COL.txt }}>{title}</span>
      </div>
      {hint && <p style={{ fontSize: 11, color: COL.mut, margin: '5px 0 0 31px', lineHeight: 1.45 }}>{hint}</p>}
    </div>
  );
}
// v7.361: each guided step sits in its own card so the three blocks read as distinct
// sections instead of one flat wall (Wayne 2026-07-07). Raised panel + hairline + radius,
// theme-token styled (IV.6). The step header renders at the top of the card.
export function StepCard({ n, title, hint, children }: { n: number; title: string; hint?: string; children?: any }) {
  return (
    <div style={{ background: 'var(--c-0d0d1e)', border: '1px solid var(--c-1f1f3a)', borderRadius: 12, padding: '4px 18px 18px', marginBottom: 16 }}>
      <StepHeader n={n} title={title} hint={hint} />
      {children}
    </div>
  );
}
const laneLabel: Record<string, string> = { 'pre-product': 'Pre-product', product: 'Product' };
const kindLabel: Record<string, string> = { problem: 'Problem', core: 'Core', support: 'Support' };

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

// ─── v7.249: SERP page buckets (from the topic's real best Semrush position) ──────
type PosKey = 'p1' | 'p2' | 'p3' | 'p4' | 'unranked';
const PAGE_META: Record<PosKey, { label: string; color: string }> = {
  p1:       { label: 'Page 1', color: COL.green },
  p2:       { label: 'Page 2', color: 'var(--c-7dd3fc)' },
  p3:       { label: 'Page 3', color: COL.amber },
  p4:       { label: 'Page 4+', color: COL.red },
  unranked: { label: 'Unranked', color: COL.mut },
};
// Standard 10-results-per-page mapping over the real best position. null = client
// ranks for none of this topic's keywords yet (net-new / competitor / missing).
function posBucketOf(p: number | null): PosKey {
  if (p == null) return 'unranked';
  if (p <= 10) return 'p1';
  if (p <= 20) return 'p2';
  if (p <= 30) return 'p3';
  return 'p4';
}
function actionLabel(t: ContentTopic): string {
  if (t.state === 'existing') return t.refresh ? 'Optimise / refresh' : 'Optimise';
  return t.state === 'competitor' ? 'Build (comp.)' : 'Build new';
}

// ─── distance meter ─────────────────────────────────────────────────────────────
function DistMeter({ d }: { d: number }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[4, 3, 2, 1].map((i: number) => (
          <span key={i} style={{ height: 6, width: 16, borderRadius: 2, background: i >= d ? distFill[d] : COL.line }} />
        ))}
      </div>
      <div style={{ fontSize: 9, color: COL.mut2, marginTop: 3 }}>{DISTANCE_LABEL[d]}</div>
    </div>
  );
}

// ─── filter / summary card ───────────────────────────────────────────────────────
function FCard({ active, onClick, label, icon, val, sub, color, children, onDownload }: {
  active: boolean; onClick: () => void; label: string; icon?: string; val: string | number; sub: string; color: string; children?: any;
  onDownload?: () => void;   // v7.328: when set, renders a green Excel-download control top-right
}) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', background: COL.panel, border: `1px solid ${active ? color : COL.line}`, borderRadius: 11,
      padding: '14px 16px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.12s',
    }}>
      {active && <i className="ti ti-check" style={{ position: 'absolute', top: 11, right: 12, fontSize: 12, color }} />}
      {onDownload && <SegmentDownloadButton onDownload={onDownload} title="Download as Excel" style={{ position: 'absolute', top: 11, right: active ? 30 : 12 }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: COL.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <i className={`ti ${icon}`} style={{ color }} />}{label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, margin: '5px 0 2px', color }}>{val}</div>
      <div style={{ fontSize: 11, color: COL.mut2 }}>{sub}</div>
      {children}
    </button>
  );
}

// ─── v7.249: SERP-page filter chip ───────────────────────────────────────────────
function PChip({ active, onClick, label, count, sub, color, onDownload }: {
  active: boolean; onClick: () => void; label: string; count: number; color: string;
  sub?: string;              // v7.358: optional secondary metric after the count (e.g. "· 52K")
  onDownload?: () => void;   // v7.328: inline green Excel-download control after the count
}) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      background: active ? `${color}1f` : 'var(--ca-120-120-160-0_08)',
      border: `1px solid ${active ? color : COL.line}`, borderRadius: 999,
      padding: '5px 11px', fontSize: 11, fontWeight: 600,
      color: active ? color : COL.mut, transition: 'border-color 0.12s, color 0.12s',
    }}>
      {label}
      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10.5, color: active ? color : COL.mut2 }}>{count}{sub ? ` · ${sub}` : ''}</span>
      {onDownload && <SegmentDownloadButton onDownload={onDownload} title="Download as Excel" />}
    </button>
  );
}

// ─── topic row ───────────────────────────────────────────────────────────────────
const ROW_COLS = '1fr 122px 86px 104px 96px 74px';
const SELECT_COL = '30px';   // v7.260: leading checkbox column (Content Map only)

// v7.260: theme-safe selection checkbox. Cyan fill + near-black tick are the same tokens
// the primary CTA uses, so it reads in BOTH light and dark themes (Const IV.6). Clicking
// toggles selection only — it never opens the row drawer (stopPropagation).
function SelectBox({ checked, saving, onToggle }: { checked: boolean; saving: boolean; onToggle: () => void }) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? 'Remove from content plan' : 'Add to content plan'}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); if (!saving) onToggle(); }}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!saving) onToggle(); } }}
      style={{
        width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: saving ? 'default' : 'pointer', flexShrink: 0,
        background: checked ? COL.cyan : 'transparent',
        border: `1.5px solid ${checked ? COL.cyan : 'var(--c-4a4a6a)'}`,
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      {saving
        ? <i className="ti ti-loader-2" style={{ fontSize: 11, color: checked ? 'var(--c-08080f)' : COL.cyan }} />
        : (checked ? <i className="ti ti-check" style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-08080f)' }} /> : null)}
    </div>
  );
}

// v7.261: remove-from-plan control shown on Content Plan rows. Clicking deselects the
// topic (persists), so it leaves the plan and its Content Map checkbox frees up again.
function RemoveBtn({ saving, onRemove }: { saving: boolean; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove from content plan"
      title="Remove from plan"
      onClick={(e) => { e.stopPropagation(); if (!saving) onRemove(); }}
      style={{
        width: 18, height: 18, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: saving ? 'default' : 'pointer', flexShrink: 0, padding: 0, lineHeight: 1,
        background: 'transparent', border: '1.5px solid var(--c-4a4a6a)', color: COL.mut,
      }}
    >
      <i className={`ti ${saving ? 'ti-loader-2' : 'ti-x'}`} style={{ fontSize: 12 }} />
    </button>
  );
}

function Row({ t, onOpen, selectable, selected, saving, onToggle, removable, onRemove, seg, onMovePriority }: {
  t: ContentTopic; onOpen: (t: ContentTopic) => void;
  selectable?: boolean; selected?: boolean; saving?: boolean; onToggle?: (id: string) => void;
  removable?: boolean; onRemove?: (id: string) => void;
  seg?: SegTag;   // v7.353: audience-segment tag (same attribution as the Journey panel)
  onMovePriority?: (id: string, pri: Priority | null) => void;   // v7.359: inline priority move (Content Map)
}) {
  const col = stateColor[t.state];
  const pri = priColor[t.priority];
  const lead = selectable || removable;   // v7.261: leading control column (checkbox OR ×)
  return (
    <div onClick={() => onOpen(t)} style={{
      display: 'grid', gridTemplateColumns: (lead ? SELECT_COL + ' ' : '') + ROW_COLS, gap: 12, alignItems: 'center', padding: '12px 15px',
      background: COL.panel, border: `1px solid ${selectable && selected ? 'var(--ca-34-211-238-0_3)' : COL.line}`, borderRadius: 10, marginBottom: 7, cursor: 'pointer',
    }}>
      {selectable
        ? <SelectBox checked={!!selected} saving={!!saving} onToggle={() => onToggle && onToggle(t.id)} />
        : removable
          ? <RemoveBtn saving={!!saving} onRemove={() => onRemove && onRemove(t.id)} />
          : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COL.txt2, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {t.kind === 'core' && <span style={{ color: COL.purple }}>★</span>}{t.name}
          {/* v7.250: open the mapped existing page inline (does not open the detail drawer) */}
          {t.url && (
            <a href={t.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`Open ${t.url}`}
              style={{ display: 'inline-flex', alignItems: 'center', color: COL.cyan, textDecoration: 'none', flexShrink: 0 }}>
              <i className="ti ti-external-link" style={{ fontSize: 12 }} />
            </a>
          )}
          {t.quickWin && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-08081a)', background: COL.amber, borderRadius: 5, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="ti ti-bolt" /> Quick win</span>}
          {t.refresh && <span style={{ fontSize: 9, fontWeight: 700, color: COL.amber, background: 'var(--ca-245-158-11-0_12)', borderRadius: 5, padding: '2px 7px' }}>Refresh</span>}
        </div>
        <div style={{ fontSize: 10, color: COL.mut2, marginTop: 3, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {seg && <SegTagChip tag={seg} />}{/* v7.353: segment tag — same attribution as Journeys */}
          <span>{laneLabel[t.lane]} · {kindLabel[t.kind]}</span>
          <span><i className="ti ti-message-2" /> {t.promptCount}</span>
          <span>{t.kwCount} kw</span>
          {t.bestPosition != null && (
            <span style={{ fontWeight: 700, color: PAGE_META[posBucketOf(t.bestPosition)].color }}>
              <i className="ti ti-trophy" style={{ fontSize: 9 }} /> #{t.bestPosition} · {PAGE_META[posBucketOf(t.bestPosition)].label}
            </span>
          )}
        </div>
        </div>
        {/* v7.359: inline priority move — same action as the drawer, in the row's open space
            (Wayne 2026-07-07). Clicking the current manual tier resets it to auto. */}
        {onMovePriority && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: COL.dim, marginRight: 2 }}>Move</span>
            {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map((p) => {
              const active = t.priority === p;
              return (
                <button key={p} type="button"
                  title={active && t.manual ? `Reset ${p} to auto` : `Move to ${p} · ${PRIORITY_LABEL[p]}`}
                  onClick={(e) => { e.stopPropagation(); onMovePriority(t.id, (active && t.manual) ? null : p); }}
                  style={{ cursor: 'pointer', fontSize: 9, fontWeight: 800, borderRadius: 5, padding: '3px 7px', lineHeight: 1,
                    border: `1px solid ${active ? priColor[p] : COL.line}`, background: active ? `${priColor[p]}22` : 'transparent', color: active ? priColor[p] : COL.mut }}>
                  {p}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="ovHide"><DistMeter d={t.distance} /></div>
      <div className="ovHide"><span title={t.manual ? 'Manually set priority (v7.358)' : undefined} style={{ fontSize: 9.5, fontWeight: 700, color: pri, background: `${pri}1a`, border: `1px solid ${pri}55`, borderRadius: 5, padding: '3px 0', textAlign: 'center', display: 'block' }}>{t.priority}{t.manual ? ' ✎' : ''}</span></div>
      <div><span style={{ fontSize: 9.5, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 5, padding: '3px 0', textAlign: 'center', display: 'block' }}>{actionLabel(t)}</span></div>
      <div><div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, textAlign: 'right', color: col }}>{fmtVol(t.totalVol)}</div><div style={{ fontSize: 9, color: COL.mut2, textAlign: 'right', fontFamily: 'monospace' }}>/mo</div></div>
      <div className="ovHide" style={{ textAlign: 'right' }}>
        {t.competitor
          ? <span style={{ fontSize: 9, fontWeight: 700, color: COL.purple, background: 'var(--ca-167-139-250-0_12)', borderRadius: 5, padding: '2px 7px' }}>{t.competitor.replace(/^www\./, '').split('.')[0]}</span>
          : <span style={{ fontSize: 9, fontWeight: 700, color: COL.green, background: 'var(--ca-52-211-153-0_1)', borderRadius: 5, padding: '2px 7px' }}>open</span>}
      </div>
    </div>
  );
}

// ─── drawer (full brief) ─────────────────────────────────────────────────────────
function Drawer({ topic, onClose, onMovePriority }: { topic: ContentTopic | null; onClose: () => void; onMovePriority?: (id: string, pri: Priority | null) => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const open = !!topic;
  const t = topic;
  const col = t ? stateColor[t.state] : COL.cyan;
  const lbl = (s: string) => <div style={{ fontSize: 9.5, letterSpacing: '0.08em', color: COL.dim, textTransform: 'uppercase', marginTop: 18 }}>{s}</div>;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--ca-4-4-12-0_55)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.18s', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 560, maxWidth: '94vw', background: 'var(--c-0b0b1c)', borderLeft: `1px solid ${COL.line}`, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.2s ease', zIndex: 50, overflowY: 'auto' }}>
        {t && (
          <>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--c-13132a)', position: 'sticky', top: 0, background: 'var(--c-0b0b1c)', zIndex: 2 }}>
              <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: COL.mut, fontSize: 18, cursor: 'pointer' }}><i className="ti ti-x" /></button>
              <div style={{ fontSize: 17, fontWeight: 700, color: COL.txt }}>{t.kind === 'core' ? '★ ' : ''}{t.name}</div>
              <div style={{ fontSize: 11, color: COL.mut2, marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'monospace' }}>
                <span>{fmtVol(t.totalVol)}/mo</span><span><i className="ti ti-message-2" /> {t.promptCount} prompts</span><span>{t.distanceLabel}</span><span>{laneLabel[t.lane]} · {kindLabel[t.kind]}</span>
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: col, background: `${col}1a`, border: `1px solid ${col}55`, borderRadius: 5, padding: '3px 8px' }}>{actionLabel(t)}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: priColor[t.priority], background: `${priColor[t.priority]}1a`, border: `1px solid ${priColor[t.priority]}55`, borderRadius: 5, padding: '3px 8px' }}>{t.priority} · {PRIORITY_LABEL[t.priority]}</span>
                {t.quickWin && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-08081a)', background: COL.amber, borderRadius: 5, padding: '3px 8px' }}><i className="ti ti-bolt" /> Quick win</span>}
                {t.manual && <span style={{ fontSize: 9, fontWeight: 700, color: COL.mut, background: 'var(--ca-120-120-160-0_12)', border: `1px solid ${COL.mut}55`, borderRadius: 5, padding: '3px 8px' }}><i className="ti ti-hand-move" /> Manual</span>}
              </div>
              {/* v7.358: manual priority move — reassign this topic to a bucket, or reset to auto. */}
              {onMovePriority && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--c-13132a)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: COL.dim, marginBottom: 7 }}>Move to priority</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(['P0', 'P1', 'P2', 'P3'] as Priority[]).map((p) => {
                      const active = t.priority === p;
                      return (
                        <button key={p} type="button" onClick={() => onMovePriority(t.id, p)}
                          title={`${p} · ${PRIORITY_LABEL[p]}`}
                          style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '5px 10px',
                            border: `1px solid ${active ? priColor[p] : COL.line}`,
                            background: active ? `${priColor[p]}22` : 'transparent',
                            color: active ? priColor[p] : COL.mut }}>
                          {p} · {PRIORITY_LABEL[p]}
                        </button>
                      );
                    })}
                    {t.manual && (
                      <button type="button" onClick={() => onMovePriority(t.id, null)} title="Clear the manual move — revert to the auto priority"
                        style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '5px 10px', border: `1px solid ${COL.line}`, background: 'transparent', color: COL.cyan }}>
                        <i className="ti ti-rotate" /> Reset to auto
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 10, color: COL.dim, margin: '7px 0 0' }}>Sticky — survives re-analysis and applies across every panel.</p>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 20px 40px' }}>
              {/* v7.250: mapped existing-page URL (full, clickable) — shown for existing pages */}
              {t.url ? (
                <>
                  {lbl('Mapped page')}
                  <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 7, fontSize: 12.5, fontWeight: 600, color: COL.cyan, textDecoration: 'none', wordBreak: 'break-all', lineHeight: 1.45 }}>
                    <i className="ti ti-external-link" style={{ flexShrink: 0 }} /> {t.url}
                  </a>
                </>
              ) : t.state === 'existing' ? (
                <>
                  {lbl('Mapped page')}
                  <p style={{ fontSize: 12, color: COL.mut2, margin: '7px 0 0', lineHeight: 1.5 }}>
                    Existing page — no URL in the dataset yet{t.bestPosition != null ? ` (ranks #${t.bestPosition})` : ''}. Run the Page&nbsp;Map scan to link the live URL.
                  </p>
                </>
              ) : null}

              {lbl('Suggested article title')}
              <p style={{ fontSize: 14, fontWeight: 600, color: COL.txt, margin: '7px 0 0', lineHeight: 1.4 }}>{t.brief.title}</p>

              {lbl('Outline (H2s)')}
              <ol style={{ margin: '7px 0 0', paddingLeft: 18 }}>
                {t.brief.outline.map((h: string, i: number) => <li key={i} style={{ fontSize: 12.5, color: COL.txt2, margin: '5px 0', lineHeight: 1.4 }}>{h}</li>)}
              </ol>

              {lbl('Answer these (People Also Ask)')}
              {t.brief.faq.map((q: string, i: number) => <p key={i} style={{ fontSize: 12, color: COL.mut, margin: '6px 0 0', lineHeight: 1.5 }}>{q}</p>)}

              <div style={{ fontSize: 9.5, letterSpacing: '0.08em', color: COL.dim, textTransform: 'uppercase', marginTop: 18 }}>
                Target keywords <span style={{ textTransform: 'none', letterSpacing: 0, color: COL.mut2 }}>· reconciles with Keyword panel</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                {t.brief.keywords.map((k, i: number) => (
                  <span key={i} style={{ fontSize: 10.5, fontFamily: 'monospace', color: 'var(--c-9a9ac0)', background: 'var(--ca-120-120-160-0_08)', border: '1px solid var(--c-1f1f3a)', borderRadius: 5, padding: '3px 8px' }}>
                    {k.keyword}<span style={{ color: COL.mut2, marginLeft: 7 }}>{fmtVol(k.searchVolume)}</span>
                  </span>
                ))}
              </div>

              {t.brief.links.length > 0 && (
                <>
                  {lbl('Internal links')}
                  {t.brief.links.map((l, i: number) => {
                    const lc = l.dir === 'from' ? COL.cyan : COL.purple;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: COL.mut, marginTop: 7 }}>
                        <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', borderRadius: 4, padding: '2px 6px', color: lc, background: `${lc}1f` }}>link {l.dir}</span>
                        <i className={`ti ti-arrow-${l.dir === 'from' ? 'left' : 'right'}`} /> {l.name}
                        <span style={{ color: COL.dim, fontSize: 10 }}>· {l.why}</span>
                      </div>
                    );
                  })}
                </>
              )}

              {lbl(`SERP targets${t.refresh ? '  ·  refresh existing page' : ''}`)}
              <div style={{ marginTop: 6 }}>
                {t.brief.serp.map((s: string, i: number) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: COL.cyan, background: 'var(--ca-34-211-238-0_08)', border: '1px solid var(--ca-34-211-238-0_22)', borderRadius: 5, padding: '4px 9px', margin: '5px 5px 0 0' }}>
                    <i className="ti ti-target" /> {s}
                  </span>
                ))}
              </div>

              {lbl('Competitive insight')}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7, background: t.competitor ? 'var(--ca-248-113-113-0_05)' : 'var(--ca-52-211-153-0_05)', border: `1px solid ${t.competitor ? 'var(--ca-248-113-113-0_2)' : 'var(--ca-52-211-153-0_2)'}`, borderRadius: 8, padding: '10px 12px', fontSize: 11.5, color: t.competitor ? 'var(--c-cc8899)' : 'var(--c-77cc99)' }}>
                <i className={`ti ti-${t.competitor ? 'swords' : 'flag'}`} />
                <span>{t.competitor
                  ? <><b>{t.competitor.replace(/^www\./, '')}</b> ranks for this topic and you don&rsquo;t — beat their depth to capture it.</>
                  : 'Open field — no tracked competitor ranks here yet. First-mover advantage.'}</span>
              </div>

              {t.url ? (
                <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 12, fontWeight: 600, color: col, border: `1px solid ${col}55`, borderRadius: 8, padding: '8px 13px', textDecoration: 'none' }}>
                  <i className="ti ti-external-link" /> Optimise existing page
                </a>
              ) : t.state === 'existing' ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 12, fontWeight: 600, color: col, border: `1px solid ${col}55`, borderRadius: 8, padding: '8px 13px' }}>
                  <i className="ti ti-refresh" /> Optimise existing page
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 12, fontWeight: 600, color: col, border: `1px solid ${col}55`, borderRadius: 8, padding: '8px 13px' }}>
                  <i className="ti ti-pencil-plus" /> Net-new build
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── shared explorer (used by Content panel AND Content Plan) ────────────────────
export function ContentExplorer({ plan, mode, selectable, selectedIds, onToggleSelect, savingIds, removable, onRemove, onBulkRemove, clientName, topicSeg, onBulkSelect, onMovePriority }: {
  plan: ContentPlan; mode: 'content' | 'plan';
  clientName?: string;   // v7.328: filename stem for per-segment XLSX exports
  // v7.260: opt-in topic selection (used only by the Content Map instance). Checking a
  // row adds that topic to the Content Plan panel; selection persists to the project DB.
  selectable?: boolean; selectedIds?: Set<string>; onToggleSelect?: (id: string) => void; savingIds?: Set<string>;
  // v7.261: opt-in remove control (used only by the Content Plan destination). The × on a
  // row deselects that topic, removing it from the plan and freeing its Content Map checkbox.
  removable?: boolean; onRemove?: (id: string) => void;
  // v7.355: opt-in bulk clear (Content Plan only) — one button removes every SHOWN
  // topic from the plan in a single full-set PUT (Wayne 2026-07-06). Same persistence
  // path as the row ×, just applied to every row the current filters show at once.
  onBulkRemove?: (ids: string[]) => void;
  // v7.353: topic.id → audience-segment tag (same attribution the Journey panel stores) —
  // renders a small segment chip on every row so the association reads on each panel.
  topicSeg?: Map<string, SegTag>;
  // v7.353: bulk selection over the CURRENTLY SHOWN rows (Content Map only) — one
  // full-set PUT, so "select all of segment A" is one click, not a row-by-row tick.
  onBulkSelect?: (ids: string[], select: boolean) => void;
  // v7.358: manual priority move (Content Map only). Reassigns a topic to a bucket, or
  // resets it to auto with null. Persisted per project + reconciled across panels.
  onMovePriority?: (id: string, pri: Priority | null) => void;
}) {
  const [sel, setSel] = useState<ContentTopic | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);   // v7.355: two-click guard on Clear all
  const [cFilter, setCFilter] = useState<'all' | 'existing' | 'build' | 'quickwin'>('all');
  const [posFilter, setPosFilter] = useState<'all' | PosKey>('all');   // v7.249: SERP page filter
  const [pStatus, setPStatus] = useState<'all' | 'existing' | 'build'>('all');
  const [pPriority, setPPriority] = useState<'all' | Priority>('all');
  // v7.360: Content Map filter (Option C) — a dimension TAB strip, each tab showing one
  // contextual chip row. Each dimension keeps its own filter value; the list is a flat set
  // filtered by all active dimensions (AND). cFilter/posFilter/cPriority are reused as the
  // status/rank/priority dimensions; funnelPick/demandPick are new.
  const [cPriority, setCPriority] = useState<'all' | Priority>('all');
  const [dimTab, setDimTab]       = useState<'priority' | 'funnel' | 'demand' | 'rank' | 'status'>('priority');
  const [funnelPick, setFunnelPick] = useState<'all' | string>('all');
  const [demandPick, setDemandPick] = useState<'all' | DemandBucket>('all');

  const sc = plan.scope;
  const T = plan.topics;
  // v7.357: this project's demand distribution (median + top-decile), computed once over the
  // whole topic set so the High/Med/Low buckets are stable regardless of the active filter.
  const dStats = useMemo(() => demandStatsOf(T.map((t) => t.totalVol)), [T]);

  // v7.328: ContentTopic → export row (one row per topic). Real data only; blank when absent.
  const cn = clientName || 'client';
  const ctRow = (t: ContentTopic): ExportTopicRow => ({
    topic: t.name,
    keywords: t.brief.keywords.map((k) => k.keyword),
    totalVolume: t.totalVol,
    url: t.url,
    priority: t.priority,
    stage: t.stage,
    label: t.state === 'existing' ? 'Existing' : 'Net-new',
  });
  const dl = (arr: ContentTopic[], segment: string) => exportSegmentXLSX(arr.map(ctRow), { clientName: cn, segment });

  // v7.356: one priority order, shared by all row sorts. P0 → P1 → P2 → P3.
  const order: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

  // v7.360: the five Content-Map filter dimensions as predicates. The row list passes ALL
  // active dimensions (AND); a dimension's own chip counts are faceted over the OTHER active
  // dimensions so each chip shows what picking it would yield in the current context.
  const dimPreds = useMemo(() => ({
    status:   (t: ContentTopic) => cFilter === 'all' ? true : cFilter === 'quickwin' ? t.quickWin : cFilter === 'existing' ? t.state === 'existing' : t.state !== 'existing',
    priority: (t: ContentTopic) => cPriority === 'all' || t.priority === cPriority,
    rank:     (t: ContentTopic) => posFilter === 'all' ? true : posBucketOf(t.bestPosition) === posFilter,
    funnel:   (t: ContentTopic) => funnelPick === 'all' || t.stage === funnelPick,
    demand:   (t: ContentTopic) => demandPick === 'all' || demandBucketOf(t.totalVol, dStats) === demandPick,
  }), [cFilter, cPriority, posFilter, funnelPick, demandPick, dStats]);

  // Topics passing every OTHER dimension except `except` — the base set a dimension's chips
  // count over (faceted). Pass 'none' to apply all dimensions.
  const facet = (except: string) => T.filter((t: ContentTopic) =>
    (Object.keys(dimPreds) as Array<keyof typeof dimPreds>).every((k) => k === except || dimPreds[k](t)));

  const contentRows = useMemo(() => facet('none')
    .slice().sort((a, b) => (order[a.priority] - order[b.priority]) || (a.distance - b.distance) || (b.totalVol - a.totalVol)),
    [T, dimPreds, order]);   // eslint-disable-line react-hooks/exhaustive-deps

  const planRows = useMemo(() => T.filter((t: ContentTopic) => {
    const s = pStatus === 'all' || (pStatus === 'existing' ? t.state === 'existing' : t.state !== 'existing');
    const p = pPriority === 'all' || t.priority === pPriority;
    return s && p;
  }).slice().sort((a, b) => (order[a.priority] - order[b.priority]) || (a.distance - b.distance) || (b.totalVol - a.totalVol)), [T, pStatus, pPriority]);

  const rows = mode === 'content' ? contentRows : planRows;
  const shownRows = rows;   // v7.360: no grouping — the flat filtered list IS what's shown

  // v7.355: cancel a pending Clear-all confirm if the visible set changes underfoot.
  useEffect(() => { setConfirmClear(false); }, [mode, shownRows.length]);

  // v7.360: build the chip row for the active dimension tab — All + each value, count and
  // volume faceted over the other active filters, with an Excel download per chip.
  const activeDimChips = useMemo(() => {
    if (mode !== 'content') return null;
    const base = facet(dimTab);   // topics passing the OTHER dimensions
    const sum = (arr: ContentTopic[]) => arr.reduce((s, t) => s + t.totalVol, 0);
    const chip = (key: string, label: string, color: string, sub: ContentTopic[]) => ({ key, label, color, count: sub.length, vol: sum(sub), rows: sub });
    const cast = (f: (v: any) => void) => f as (v: string) => void;
    const spec = dimTab === 'priority' ? { current: cPriority as string, set: cast(setCPriority), label: 'Priority',
        items: (['P0', 'P1', 'P2', 'P3'] as Priority[]).map((p) => chip(p, `${p} · ${PRIORITY_LABEL[p]}`, priColor[p], base.filter((t) => t.priority === p))) }
      : dimTab === 'status' ? { current: cFilter as string, set: cast(setCFilter), label: 'Status',
        items: [chip('existing', 'Optimise', COL.green, base.filter((t) => t.state === 'existing')),
                chip('build', 'Build net-new', COL.orange, base.filter((t) => t.state !== 'existing')),
                chip('quickwin', 'Quick wins', COL.amber, base.filter((t) => t.quickWin))] }
      : dimTab === 'rank' ? { current: posFilter as string, set: cast(setPosFilter), label: 'Where you rank',
        items: (['p1', 'p2', 'p3', 'p4', 'unranked'] as PosKey[]).map((k) => chip(k, PAGE_META[k].label, PAGE_META[k].color, base.filter((t) => posBucketOf(t.bestPosition) === k))) }
      : dimTab === 'funnel' ? { current: funnelPick as string, set: cast(setFunnelPick), label: 'Funnel stage',
        items: STAGE_ORDER.map((st) => chip(st, STAGE_LABEL[st] ?? st, stageColor[st] ?? COL.mut, base.filter((t) => t.stage === st))) }
      : { current: demandPick as string, set: cast(setDemandPick), label: 'Search demand',
        items: (['high', 'med', 'low'] as DemandBucket[]).map((b) => chip(b, DEMAND_LABEL[b], demandColor[b] ?? COL.mut, base.filter((t) => demandBucketOf(t.totalVol, dStats) === b))) };
    return { ...spec, allRows: base, allVol: sum(base) };
  }, [mode, dimTab, cPriority, cFilter, posFilter, funnelPick, demandPick, dimPreds, dStats]);   // eslint-disable-line react-hooks/exhaustive-deps

  // v7.360: active (non-"all") dimension filters, for the summary/clear row.
  const activeFilters = mode === 'content' ? [
    cPriority !== 'all' ? { d: 'priority', label: `${cPriority} · ${PRIORITY_LABEL[cPriority as Priority]}`, clear: () => setCPriority('all') } : null,
    cFilter !== 'all' ? { d: 'status', label: cFilter === 'quickwin' ? 'Quick wins' : cFilter === 'existing' ? 'Optimise' : 'Build net-new', clear: () => setCFilter('all') } : null,
    posFilter !== 'all' ? { d: 'rank', label: PAGE_META[posFilter as PosKey].label, clear: () => setPosFilter('all') } : null,
    funnelPick !== 'all' ? { d: 'funnel', label: STAGE_LABEL[funnelPick] ?? funnelPick, clear: () => setFunnelPick('all') } : null,
    demandPick !== 'all' ? { d: 'demand', label: DEMAND_LABEL[demandPick as DemandBucket], clear: () => setDemandPick('all') } : null,
  ].filter(Boolean) as Array<{ d: string; label: string; clear: () => void }> : [];
  const clearAllDims = () => { setCPriority('all'); setCFilter('all'); setPosFilter('all'); setFunnelPick('all'); setDemandPick('all'); };

  const styleTag = <style>{`@media(max-width:860px){.ovHide{display:none!important}}`}</style>;

  return (
    <div>
      {styleTag}
      {mode === 'content' ? (
        <StepCard n={2} title="Filter &amp; focus" hint="Pick a dimension below, then a chip to filter. Combine dimensions — counts and volumes update to match.">
        {/* v7.360 (Option C): dimension tabs → one contextual chip row. v7.361: chips sit in a tab-panel inset. */}
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: `1px solid ${COL.line}`, margin: '12px 0 0' }}>
          {(([['priority', 'Priority', 'ti-flag'], ['funnel', 'Funnel stage', 'ti-filter-cog'], ['demand', 'Search demand', 'ti-chart-bar'], ['rank', 'Where you rank', 'ti-trophy'], ['status', 'Status', 'ti-stack-2']]) as Array<['priority' | 'funnel' | 'demand' | 'rank' | 'status', string, string]>).map(([d, label, icon]) => {
            const on = dimTab === d;
            const n = activeFilters.filter((f) => f.d === d).length;
            return (
              <button key={d} type="button" onClick={() => setDimTab(d)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: `2px solid ${on ? COL.cyan : 'transparent'}`, color: on ? COL.cyan : COL.mut, fontSize: 12, fontWeight: 700, padding: '8px 12px' }}>
                <i className={`ti ${icon}`} style={{ fontSize: 14 }} />{label}
                {n > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: COL.cyan }} />}
              </button>
            );
          })}
        </div>
        <div style={{ background: 'var(--c-090917)', border: `1px solid ${COL.line}`, borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px' }}>
          {activeDimChips && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <PChip active={activeDimChips.current === 'all'} onClick={() => activeDimChips.set('all')} label="All" count={activeDimChips.allRows.length} sub={fmtVol(activeDimChips.allVol)} color="var(--c-c8c8e8)" onDownload={() => dl(activeDimChips.allRows, `All ${activeDimChips.label}`)} />
              {activeDimChips.items.map((it) => (
                <PChip key={it.key} active={activeDimChips.current === it.key} onClick={() => activeDimChips.set(activeDimChips.current === it.key ? 'all' : it.key)} label={it.label} count={it.count} sub={fmtVol(it.vol)} color={it.color} onDownload={() => dl(it.rows, `${activeDimChips.label} ${it.label}`)} />
              ))}
            </div>
          )}
          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COL.line}` }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color: COL.dim }}>Filters</span>
              {activeFilters.map((f) => (
                <button key={f.d} type="button" onClick={f.clear} title="Remove this filter" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: COL.cyan, background: 'var(--ca-34-211-238-0_08)', border: `1px solid ${COL.cyan}55`, borderRadius: 999, padding: '3px 9px' }}>
                  {f.label}<i className="ti ti-x" style={{ fontSize: 12 }} />
                </button>
              ))}
              <button type="button" onClick={clearAllDims} style={{ fontSize: 11, color: COL.mut, background: 'none', border: 'none', cursor: 'pointer' }}>Clear all</button>
            </div>
          )}
        </div>
        </StepCard>
      ) : (
        <>
          {/* scope row: total / existing / net-new (all carry volume) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, margin: '16px 0 14px' }}>
            <FCard active={pStatus === 'all'} onClick={() => setPStatus('all')} label="Total articles" icon="ti-files" val={sc.total} sub={`${fmtVol(sc.totalVol)}/mo combined demand`} color="var(--c-c8c8e8)" onDownload={() => dl(T, 'Total articles')} />
            <FCard active={pStatus === 'existing'} onClick={() => setPStatus('existing')} label="Existing → optimise" icon="ti-refresh" val={sc.existing} sub={`${fmtVol(sc.existingVol)}/mo`} color={COL.green} onDownload={() => dl(T.filter((t) => t.state === 'existing'), 'Existing optimise')} />
            <FCard active={pStatus === 'build'} onClick={() => setPStatus('build')} label="Net-new → build" icon="ti-pencil-plus" val={sc.build} sub={`${fmtVol(sc.buildVol)}/mo`} color={COL.orange} onDownload={() => dl(T.filter((t) => t.state !== 'existing'), 'Net-new build')} />
          </div>
          {/* priority filter cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '0 0 16px' }}>
            <FCard active={pPriority === 'all'} onClick={() => setPPriority('all')} label="All priorities" icon="ti-list" val={sc.total} sub={`${fmtVol(sc.totalVol)}/mo`} color="var(--c-c8c8e8)" onDownload={() => dl(T, 'All priorities')} />
            <FCard active={pPriority === 'P0'} onClick={() => setPPriority('P0')} label="P0 · Do first" val={sc.p0} sub={`${fmtVol(sc.p0Vol)}/mo`} color={priColor.P0} onDownload={() => dl(T.filter((t) => t.priority === 'P0'), 'P0 Do first')} />
            <FCard active={pPriority === 'P1'} onClick={() => setPPriority('P1')} label="P1 · Next" val={sc.p1} sub={`${fmtVol(sc.p1Vol)}/mo`} color={priColor.P1} onDownload={() => dl(T.filter((t) => t.priority === 'P1'), 'P1 Next')} />
            <FCard active={pPriority === 'P2'} onClick={() => setPPriority('P2')} label="P2 · Later" val={sc.p2} sub={`${fmtVol(sc.p2Vol)}/mo`} color={priColor.P2} onDownload={() => dl(T.filter((t) => t.priority === 'P2'), 'P2 Later')} />
          </div>
        </>
      )}

      {/* v7.361: Step 3 — topic selection, in its own card (Content Map only). */}
      {selectable && (
        <StepCard n={3} title="Select your topics" hint="Check the topics to include in your scope &amp; content plan — or use “Select all shown” to add a whole filtered view at once.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0', padding: '9px 13px', borderRadius: 8, background: 'var(--ca-34-211-238-0_08)', border: '1px solid var(--ca-34-211-238-0_2)', flexWrap: 'wrap' }}>
          <i className="ti ti-checkbox" style={{ fontSize: 15, color: COL.cyan, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: COL.txt2, lineHeight: 1.45, flex: 1, minWidth: 220 }}>
            Check a box to select which topics to include in your <b style={{ color: COL.cyan }}>scope &amp; content plan</b>.
            {selectedIds && selectedIds.size > 0 && <span style={{ color: COL.mut }}>&nbsp; · &nbsp;{selectedIds.size} selected</span>}
          </span>
          {/* v7.353: bulk select over the rows the active filters currently show — so
              "all of segment A into the plan" is one click. Idempotent full-set save. */}
          {onBulkSelect && shownRows.length > 0 && (() => {
            const shownIds = shownRows.map((t: ContentTopic) => t.id);
            const allShownSelected = !!selectedIds && shownIds.every((id: string) => selectedIds.has(id));
            return (
              <button type="button"
                onClick={() => onBulkSelect(shownIds, !allShownSelected)}
                title={allShownSelected ? 'Remove every topic shown by the current filters from the plan' : 'Add every topic shown by the current filters to the plan'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0,
                  background: 'transparent', border: `1px solid ${COL.cyan}`, color: COL.cyan,
                  borderRadius: 7, padding: '5px 11px', fontSize: 11, fontWeight: 700 }}>
                <i className={`ti ${allShownSelected ? 'ti-square-off' : 'ti-checks'}`} style={{ fontSize: 13 }} />
                {allShownSelected ? `Unselect all shown (${shownIds.length})` : `Select all shown (${shownIds.length})`}
              </button>
            );
          })()}
        </div>
        </StepCard>
      )}

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: COL.mut }}>
          <b style={{ color: COL.txt2 }}>{shownRows.length}</b> topics · <b style={{ color: COL.txt2 }}>{fmtVol(shownRows.reduce((s, t) => s + t.totalVol, 0))}/mo</b>
        </span>
        {/* v7.355: Clear all — one click removes every SHOWN topic from the plan (bulk ×).
            Two-click guard so a stray click can't wipe the plan; the red trio is the same
            both-theme pair the drawer's competitor strip and the brief-error strip use
            (legible light + dark, Const IV.6). Content Plan only (removable + onBulkRemove). */}
        {removable && onBulkRemove && shownRows.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirmClear) { onBulkRemove(shownRows.map((t: ContentTopic) => t.id)); setConfirmClear(false); }
              else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3500); }
            }}
            title={confirmClear ? 'Click again to remove all shown topics from the plan' : 'Remove every topic shown here from the plan'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              background: confirmClear ? 'var(--ca-248-113-113-0_2)' : 'var(--ca-248-113-113-0_05)',
              border: '1px solid var(--ca-248-113-113-0_2)', color: COL.red,
              borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}
          >
            <i className={`ti ${confirmClear ? 'ti-alert-triangle' : 'ti-trash'}`} style={{ fontSize: 13 }} />
            {confirmClear ? `Confirm — clear all (${shownRows.length})` : `Clear all (${shownRows.length})`}
          </button>
        )}
        {mode === 'plan' && (pStatus !== 'all' || pPriority !== 'all') && (
          <button onClick={() => { setPStatus('all'); setPPriority('all'); }} style={{ fontSize: 11, color: COL.cyan, background: 'none', border: 'none', cursor: 'pointer' }}><i className="ti ti-x" /> Clear filters</button>
        )}
        <span style={{ fontSize: 11, color: COL.dim, marginLeft: 'auto' }}>{mode === 'plan' ? 'Cards filter · ' : 'Tabs filter · '}click a row for the {mode === 'plan' ? 'writer brief' : 'detail'}</span>
      </div>

      {/* column header */}
      <div style={{ display: 'grid', gridTemplateColumns: ((selectable || removable) ? SELECT_COL + ' ' : '') + ROW_COLS, gap: 12, padding: '0 15px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: COL.dim }}>
        {(selectable || removable) && <div aria-hidden="true" />}
        <div>{mode === 'plan' ? 'Article topic' : 'Topic'}</div>
        <div className="ovHide">Distance to conversion</div>
        <div className="ovHide">Priority</div>
        <div>Action</div>
        <div style={{ textAlign: 'right' }}>Volume</div>
        <div className="ovHide" style={{ textAlign: 'right' }}>Competitor</div>
      </div>

      {(() => {
        const renderRow = (t: ContentTopic) => (
          <Row key={t.id} t={t} onOpen={setSel}
            selectable={selectable}
            selected={selectable ? !!selectedIds?.has(t.id) : false}
            saving={(selectable || removable) ? !!savingIds?.has(t.id) : false}
            onToggle={onToggleSelect}
            removable={removable}
            onRemove={onRemove}
            seg={topicSeg?.get(t.id)}
            onMovePriority={onMovePriority} />
        );
        if (!rows.length) return <p style={{ color: COL.dim, fontSize: 12, padding: 16 }}>No topics match this filter.</p>;
        // v7.360: flat filtered list (Option C — dimension tabs replace grouping).
        return rows.map(renderRow);
      })()}

      <Drawer topic={sel} onClose={() => setSel(null)} onMovePriority={onMovePriority} />
    </div>
  );
}

// ─── Content Plan sub-nav section (default export) ───────────────────────────────
interface Props { projectId: string; kwVersion?: number; analysis: any; competitors: string[]; claudeAssigns?: Record<string, IntentType>; }   // v7.220: page-supplied intent map → reconciles topic count to the Cluster panel

export default function ContentPlanSection({ projectId, kwVersion, analysis, competitors = [], claudeAssigns = {} }: Props) {
  const [uploadedKeywords, setUploadedKeywords] = useState<any[]>([]);
  const [kwLoaded, setKwLoaded] = useState(false);
  // v7.260: the user's hand-picked selection (ContentTopic.id set). null = still loading
  // from the project DB; an empty set = nothing picked yet (blank plan).
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  // v7.261: ids whose remove-save is in flight (per-row spinner on the × control).
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // v7.267: the running Scope "spec sheet" (the cart). We hold the set of ContentTopic.id
  // already in scope so "Add to Scope" can union the plan in idempotently and show how
  // much is scoped. null = still loading from the project DB.
  const [scopeIds, setScopeIds] = useState<Set<string> | null>(null);
  const [addingScope, setAddingScope] = useState(false);
  const [justAdded, setJustAdded] = useState(false);       // transient "Added ✓" confirmation
  // v7.354: Push to Brief Agent is LIVE — builds a Word brief per article, zipped per
  // audience segment, and downloads the bundle. Real progress while it builds (IV.2).
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefProgress, setBriefProgress] = useState<{ done: number; total: number } | null>(null);
  const [briefDone, setBriefDone] = useState(false);       // transient "Downloaded ✓" confirmation
  const [briefErr, setBriefErr] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) { setKwLoaded(true); return; }
    let cancelled = false;
    setKwLoaded(false);
    fetch(`/api/projects/${projectId}/keywords`)
      .then((r: Response) => r.ok ? r.json() : { keywords: [] })
      .then((d: any) => { if (!cancelled) { setUploadedKeywords(d.keywords ?? []); setKwLoaded(true); } })
      .catch(() => { if (!cancelled) setKwLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId, kwVersion]);

  // v7.260: load the saved Content Plan selection from the project. Re-reads on mount —
  // e.g. after ticking topics on the Content Map tab and switching to this one.
  useEffect(() => {
    if (!projectId) { setSelectedIds(new Set()); return; }
    let cancelled = false;
    setSelectedIds(null);
    fetch(`/api/projects/${projectId}/content-plan`, { cache: 'no-store' })   // v7.262: always fresh
      .then((r: Response) => r.ok ? r.json() : { selections: [] })
      .then((d: any) => { if (!cancelled) setSelectedIds(new Set<string>(Array.isArray(d.selections) ? d.selections : [])); })
      .catch(() => { if (!cancelled) setSelectedIds(new Set<string>()); });
    return () => { cancelled = true; };
  }, [projectId, kwVersion]);

  // v7.267: load the saved Scope cart for this project (re-reads on mount, always fresh).
  useEffect(() => {
    if (!projectId) { setScopeIds(new Set()); return; }
    let cancelled = false;
    setScopeIds(null);
    fetch(`/api/projects/${projectId}/scope`, { cache: 'no-store' })
      .then((r: Response) => r.ok ? r.json() : { selections: [] })
      .then((d: any) => { if (!cancelled) setScopeIds(new Set<string>(Array.isArray(d.selections) ? d.selections : [])); })
      .catch(() => { if (!cancelled) setScopeIds(new Set<string>()); });
    return () => { cancelled = true; };
  }, [projectId, kwVersion]);

  // v7.210: ONE PAGE PER CLUSTER — build the plan from the canonical cluster topics
  // (the same source the Cluster panel counts), so content-plan total reconciles to
  // the cluster count (Const III.5). Falls back to the demand-universe plan only when
  // no clusters exist yet.
  const clientDomain = (analysis?.semrushSnapshot?.domain as string) ?? '';
  // v7.353: keep the canonical topics in hand (not just the plan built from them) — the
  // segment lens needs their real language (category path, product, keywords) to reuse
  // the Journey panel's topic→segment attribution (Const II.7).
  const canonTopics = useMemo(
    () => buildCanonicalClusterTopics(analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns),
    [analysis, clientDomain, competitors, uploadedKeywords, claudeAssigns],
  );
  const plan = useMemo(() => {
    // v7.356: same brand vocabulary as every other panel (Const II.7) so brand-related
    // topics carry the identical priority across Content Map / Plan / Scope / Exec.
    const brandTerms = brandTermsOf(clientDomain, analysis?.semrushSnapshot);
    // v7.358: same manual priority moves as every panel (from the shared snapshot injection).
    const priorityOverrides = (analysis?.semrushSnapshot?._priorityOverrides as Record<string, Priority>) ?? {};
    if (canonTopics.length > 0) return buildContentPlanFromTopics(canonTopics, { brandTerms, priorityOverrides });
    return planFromSnapshot(analysis, uploadedKeywords, { brandTerms, priorityOverrides });
  }, [canonTopics, analysis, uploadedKeywords, clientDomain]);

  // v7.353: audience-segment lens — same attribution as the Journey panel.
  const segments = useMemo(() => readSegments(analysis), [analysis]);
  const topicBucket = useMemo(() => buildTopicSegmentMap(canonTopics, segments), [canonTopics, segments]);
  const segTags = useMemo(() => buildSegTags(topicBucket, segments), [topicBucket, segments]);
  const [activeSeg, setActiveSeg] = useState<string | null>(null);

  // v7.260: the Content Plan shows ONLY the hand-picked topics — filtered from the same
  // canonical plan (Const II.7 view; scope recomputed via the shared scopeOf, so the
  // cards reconcile exactly with the picked rows). Blank until topics are picked.
  const selectedPlan = useMemo(
    () => (plan && selectedIds ? filterPlanByIds(plan, selectedIds) : null),
    [plan, selectedIds],
  );
  const selCount = selectedIds ? selectedIds.size : 0;

  // v7.353: the plan the panel RENDERS — the picked topics, narrowed to the active
  // segment's view when a segment chip is on (its exclusive topics + Shared; cards are
  // exact scopeOf rollups of the rows shown). Null segment = the whole picked plan.
  const viewPlan = useMemo(
    () => (selectedPlan && activeSeg && topicBucket.size ? filterPlanBySegment(selectedPlan, topicBucket, activeSeg) : selectedPlan),
    [selectedPlan, activeSeg, topicBucket],
  );

  // v7.261: remove a topic from the plan (deselect) + persist. Optimistic: the row leaves
  // the plan immediately; the same id un-checks on the Content Map (which re-reads the
  // saved selection on its next mount). Reverts on save failure.
  const removeSelection = (id: string) => {
    const cur = selectedIds ?? new Set<string>();
    if (!cur.has(id)) return;
    const next = new Set(cur); next.delete(id);
    setSelectedIds(next);   // optimistic
    // v7.269: scope ⊆ plan — the server prunes this id from scope when the plan shrinks; keep
    // the local "N in scope" badge accurate immediately rather than waiting for a remount.
    setScopeIds((s: Set<string> | null) => { if (!s || !s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });
    const arr = Array.from(next);
    setSavingIds((s: Set<string>) => { const n = new Set(s); n.add(id); return n; });
    fetch(`/api/projects/${projectId}/content-plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: arr }),
    })
      .then((r: Response) => { if (!r.ok) throw new Error('save failed'); })
      .catch(() => setSelectedIds((c: Set<string> | null) => { const n = new Set(c ?? []); n.add(id); return n; }))
      .finally(() => setSavingIds((s: Set<string>) => { const n = new Set(s); n.delete(id); return n; }));
  };

  // v7.355: Clear all — remove every SHOWN topic from the plan in ONE full-set PUT (the
  // bulk sibling of removeSelection). Optimistic with revert; prunes the same ids from the
  // Scope cart so "N in scope" stays honest (scope ⊆ plan, v7.269). Persists to the same
  // /content-plan endpoint, so the Content Map re-reads the shrunk selection on its next mount.
  const clearFromPlan = (ids: string[]) => {
    const cur = selectedIds ?? new Set<string>();
    const drop = ids.filter((id) => cur.has(id));
    if (drop.length === 0) return;
    const next = new Set(cur); drop.forEach((id) => next.delete(id));
    setSelectedIds(next);   // optimistic
    setScopeIds((sc: Set<string> | null) => { if (!sc) return sc; const n = new Set(sc); drop.forEach((id) => n.delete(id)); return n; });
    const arr = Array.from(next);
    setSavingIds((s: Set<string>) => { const n = new Set(s); drop.forEach((id) => n.add(id)); return n; });
    fetch(`/api/projects/${projectId}/content-plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: arr }),
    })
      .then((r: Response) => { if (!r.ok) throw new Error('save failed'); })
      .catch(() => setSelectedIds((c: Set<string> | null) => { const n = new Set(c ?? []); drop.forEach((id) => n.add(id)); return n; }))
      .finally(() => setSavingIds((s: Set<string>) => { const n = new Set(s); drop.forEach((id) => n.delete(id)); return n; }));
  };

  // v7.267: every topic id currently resolved into the plan (existing + net-new, all
  // priorities — independent of the active filter cards). These are the assets "Add to
  // Scope" pushes into the cart. v7.353: reads the segment-filtered VIEW — with a
  // segment chip on, "Add to Scope" scopes exactly the slice you're looking at.
  const planTopicIds = useMemo(
    () => (viewPlan ? viewPlan.topics.map((t: ContentTopic) => t.id) : []),
    [viewPlan],
  );
  const scopedCount = scopeIds ? scopeIds.size : 0;
  const allPlanInScope = !!scopeIds && planTopicIds.length > 0 && planTopicIds.every((id) => scopeIds.has(id));

  // v7.267: "Add to Scope" — union ALL current plan topics into the running scope cart and
  // persist (Const II.7: we store only ids; the View Scope panel re-derives the briefs).
  // Idempotent: re-adding an already-scoped plan is a no-op union. Optimistic with revert.
  const addPlanToScope = () => {
    if (addingScope || planTopicIds.length === 0) return;
    const prev = scopeIds ?? new Set<string>();
    const next = new Set<string>(prev);
    planTopicIds.forEach((id) => next.add(id));
    setScopeIds(next);          // optimistic
    setAddingScope(true);
    setJustAdded(false);
    fetch(`/api/projects/${projectId}/scope`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: Array.from(next) }),
    })
      .then((r: Response) => { if (!r.ok) throw new Error('save failed'); return r.json(); })
      .then((d: any) => {
        setScopeIds(new Set<string>(Array.isArray(d.selections) ? d.selections : Array.from(next)));
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2600);
      })
      .catch(() => setScopeIds(prev))   // revert on failure
      .finally(() => setAddingScope(false));
  };

  // v7.354: Push to Brief Agent — one Word doc per article, zipped per audience
  // segment, one bundle download. Exports the FULL picked plan (the bundle is already
  // organised by segment inside, so the active chip doesn't narrow it). Segment
  // membership = the same v7.353 lens attribution; Shared articles ride into every
  // segment's zip (Wayne 2026-07-06). The docx/jszip code is dynamic-imported so it
  // never weighs down the initial page bundle.
  const pushToBriefAgent = async () => {
    if (briefBusy || !selectedPlan || selectedPlan.topics.length === 0) return;
    setBriefErr(null);
    setBriefDone(false);
    setBriefBusy(true);
    setBriefProgress({ done: 0, total: selectedPlan.topics.length });
    try {
      const mod = await import('@/lib/export/briefExport');
      const canonById = new Map(canonTopics.map((t) => [t.id, t]));
      const res = await mod.buildBriefBundle({
        clientName: clientDomain || 'client',
        topics: selectedPlan.topics,
        canonById,
        topicBucket,
        segments: segments.map((s: any) => ({ id: String(s.id), name: String(s.name ?? 'Segment') })),
        onProgress: (done: number, total: number) => setBriefProgress({ done, total }),
      });
      mod.downloadBundle(res);
      setBriefDone(true);
      setTimeout(() => setBriefDone(false), 3200);
    } catch (e) {
      setBriefErr(String((e as any)?.message ?? e));
    } finally {
      setBriefBusy(false);
      setBriefProgress(null);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: COL.dim, marginBottom: 5 }}>Foundation · 05 · Content Plan</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: COL.txt, margin: 0 }}>Content Plan</h2>
        <p style={{ fontSize: 12, color: COL.mut, marginTop: 5, maxWidth: 760 }}>
          Your hand-picked plan. Tick topics on the <b style={{ color: COL.cyan }}>Content Map</b> to push them here &mdash; only the topics you select appear, as prioritised, writer-ready briefs. Click a row for the full brief.
          {selCount > 0 && <span style={{ color: COL.txt2 }}> &nbsp;·&nbsp; {selCount} topic{selCount !== 1 ? 's' : ''} in your plan.</span>}
        </p>

        {/* v7.267: primary CTAs — add the whole plan (existing + net-new) to the running
            Scope cart, and (later) hand off to the Brief Agent. Filled buttons with the
            text token --c-08080f, which FLIPS with the theme (near-black on dark, near-white
            on light); the indigo + purple fills are the only accents whose light-mode tones
            stay dark enough to clear 4.5:1 against that flipping text in BOTH themes — cyan/
            green/amber fills fail in light, so they are not used (Const IV.6 / V.5). Shown
            only when the plan has topics. */}
        {selCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button
              type="button"
              onClick={addPlanToScope}
              disabled={addingScope}
              title="Add every topic in this plan (existing + net-new) to your Scope spec sheet"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, cursor: addingScope ? 'default' : 'pointer',
                background: 'var(--c-6c63ff)', color: 'var(--c-08080f)', border: 'none', borderRadius: 9,
                padding: '9px 16px', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.01em',
                opacity: addingScope ? 0.75 : 1, transition: 'opacity 0.12s',
              }}
            >
              <i className={`ti ${addingScope ? 'ti-loader-2' : justAdded ? 'ti-check' : 'ti-circle-plus'}`} style={{ fontSize: 15 }} />
              {addingScope ? 'Adding…' : justAdded ? 'Added to scope' : 'Add to Scope'}
            </button>

            <button
              type="button"
              onClick={pushToBriefAgent}
              disabled={briefBusy}
              title="Download every article in this plan as a Word brief — bundled into one zip per audience segment"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, cursor: briefBusy ? 'default' : 'pointer',
                background: COL.purple, color: 'var(--c-08080f)', border: 'none', borderRadius: 9,
                padding: '9px 16px', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.01em',
                opacity: briefBusy ? 0.75 : 1, transition: 'opacity 0.12s',
              }}
            >
              <i className={`ti ${briefBusy ? 'ti-loader-2' : briefDone ? 'ti-check' : 'ti-robot'}`} style={{ fontSize: 15 }} />
              {briefBusy
                ? (briefProgress && briefProgress.total > 0 ? `Building briefs… ${briefProgress.done} of ${briefProgress.total}` : 'Building briefs…')
                : briefDone ? 'Briefs downloaded' : 'Push to Brief Agent'}
            </button>

            {/* live scope status — reads in both themes (muted text on the page surface) */}
            {scopedCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: COL.mut }}>
                <i className="ti ti-shopping-cart" style={{ fontSize: 13, color: allPlanInScope ? COL.green : COL.mut2 }} />
                {scopedCount} in scope{allPlanInScope ? ' · this plan is fully scoped' : ''}
              </span>
            )}
          </div>
        )}

        {/* v7.354: what the bundle contains — and an honest error strip if the build fails.
            Red trio tokens are the same both-theme pair the drawer's competitive strip uses. */}
        {briefDone && (
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--c-77cc99)', background: 'var(--ca-52-211-153-0_05)', border: '1px solid var(--ca-52-211-153-0_2)', borderRadius: 8, padding: '8px 12px' }}>
            <i className="ti ti-file-zip" />
            Bundle downloaded &mdash; one zip per audience segment, one Word brief per article inside.
          </div>
        )}
        {briefErr && (
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--c-f87171)', background: 'var(--ca-248-113-113-0_05)', border: '1px solid var(--ca-248-113-113-0_2)', borderRadius: 8, padding: '8px 12px' }}>
            <i className="ti ti-alert-triangle" />
            Brief build failed &mdash; {briefErr}
          </div>
        )}
      </div>
      {(!kwLoaded || selectedIds === null) ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <i className="ti ti-loader-2" style={{ color: COL.cyan, fontSize: 18 }} />
          <p style={{ color: COL.mut2, fontSize: 12, marginTop: 10 }}>Loading content plan&hellip;</p>
        </div>
      ) : !plan ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🗺️</div>
          <p style={{ color: COL.mut, fontSize: 13, lineHeight: 1.6 }}>
            The Content Plan is built from the deep journey. Open the <b style={{ color: COL.cyan }}>Keyword</b> panel and run <b style={{ color: COL.cyan }}>Expand product data</b> &amp; <b style={{ color: COL.cyan }}>Build pre-product journey</b> to populate it &mdash; then tick topics on the <b style={{ color: COL.cyan }}>Content Map</b> to add them here.
          </p>
        </div>
      ) : selCount === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🗂️</div>
          <p style={{ color: COL.txt2, fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Your content plan is empty</p>
          <p style={{ color: COL.mut, fontSize: 13, lineHeight: 1.6 }}>
            Go to the <b style={{ color: COL.cyan }}>Content Map</b> tab and tick the checkbox next to any topic to push it into your plan. Only the topics you pick appear here &mdash; as prioritised, writer-ready briefs.
          </p>
        </div>
      ) : (
        <>
          {/* v7.353: segment lens — filter the picked plan to one audience segment's view
              (same attribution as the Audience Journeys panel; Shared shows under every
              segment). Chip counts are real row counts of the picked plan. */}
          {segments.length > 0 && topicBucket.size > 0 && (
            <SegmentFilterBar
              segments={segments}
              active={activeSeg}
              onChange={setActiveSeg}
              countOf={(id: string | null) => {
                if (!selectedPlan) return 0;
                if (id === null) return selectedPlan.topics.length;
                return filterPlanBySegment(selectedPlan, topicBucket, id).topics.length;
              }}
            />
          )}
          <ContentExplorer plan={viewPlan!} mode="plan"
            removable
            clientName={clientDomain || 'client'}
            savingIds={savingIds}
            topicSeg={segTags}
            onRemove={removeSelection}
            onBulkRemove={clearFromPlan} />
        </>
      )}
    </div>
  );
}
