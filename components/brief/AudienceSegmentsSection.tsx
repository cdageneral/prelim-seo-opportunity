'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  buildSegmentRows, csvEscape, segmentToCsv, segmentToClipboardText, segmentCsvFilename,
  personaProfileFilename, SEGMENT_LABELS,
  type AudienceSegment, type AudienceTouchpoint,
} from '@/lib/audience/segmentRows';

// ── Types + v7.352 export helpers ─────────────────────────────────────────────
// v7.552: the segment type and the pure row/CSV/clipboard helpers moved to
// lib/audience/segmentRows.ts so the persona-profile API route can read the SAME
// rows on the server (Const II.7). Re-exported here so every existing import
// (and the retained suite) is unchanged.
export type { AudienceSegment, AudienceTouchpoint };
export { buildSegmentRows, csvEscape, segmentToCsv, segmentToClipboardText, segmentCsvFilename };

interface Props { analysis: any; projectId?: string; }

/** Hand a Blob to the browser as a file download. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSegmentCsv(segment: AudienceSegment, label: string): void {
  // ﻿ BOM so Excel opens the UTF-8 CSV with accents/dashes intact.
  downloadBlob(new Blob(['﻿' + segmentToCsv(segment, label)], { type: 'text/csv;charset=utf-8;' }), segmentCsvFilename(segment, label));
}

// ── v7.552: persona profile image (OpenAI image API) ──────────────────────────
// The left-hand control on every segment card. One click → POST the segment id
// to /api/projects/[id]/persona-profile → the server builds Wayne's prompt from
// the STORED segment rows, renders it with the OpenAI image API, and the JPG
// comes back as a download. While it runs the control is a live pill: a
// changing step label + elapsed seconds (IV.3) and, once at least one render
// has been measured, "of ~Ns" from the median of real previous runs (IV.2) —
// a measured figure, never a guess.

export type ProfileStep = 'idle' | 'preparing' | 'rendering' | 'downloading' | 'done' | 'error';

export interface ProfileHistory { runs: number; medianMs: number | null; lastMs: number | null }

/** "Rendering profile · 42s of ~95s" — the pill text for a given state. */
export function profileStatusText(step: ProfileStep, elapsedSec: number, history: ProfileHistory | null): string {
  const eta = history && history.medianMs ? ` of ~${Math.max(1, Math.round(history.medianMs / 1000))}s` : '';
  switch (step) {
    case 'preparing':   return `Preparing segment data · ${elapsedSec}s`;
    case 'rendering':   return `Rendering profile · ${elapsedSec}s${eta}`;
    case 'downloading': return `Downloading · ${elapsedSec}s`;
    case 'done':        return 'Profile downloaded';
    default:            return '';
  }
}

export function profileEtaTitle(history: ProfileHistory | null): string {
  if (!history || !history.medianMs) return 'No previous render measured yet — showing elapsed time';
  return `~${Math.round(history.medianMs / 1000)}s is the median of ${history.runs} measured previous render${history.runs === 1 ? '' : 's'}`;
}

/** Shorten a provider error for the pill; the full text goes in the tooltip. */
export function shortError(msg: string, max = 72): string {
  const s = String(msg ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function PersonaProfileButton({ segment, label, projectId, analysisId }: {
  segment: AudienceSegment;
  label: string;
  projectId?: string;
  analysisId?: string;
}) {
  const [step, setStep] = useState<ProfileStep>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<ProfileHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  const busy = step === 'preparing' || step === 'rendering' || step === 'downloading';

  const run = async () => {
    if (busy) return;
    if (!projectId) { setStep('error'); setError('No project id — reload the page'); return; }
    setError(null);
    setStep('preparing');
    setElapsed(0);
    const t0 = Date.now();
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    try {
      // Measured history for the ETA, in parallel with the render itself.
      fetch(`/api/projects/${projectId}/persona-profile`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => { if (j && j.history) setHistory(j.history as ProfileHistory); })
        .catch(() => { /* ETA is optional — elapsed time still shows (IV.3) */ });
      setStep('rendering');
      const res = await fetch(`/api/projects/${projectId}/persona-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ segmentId: segment.id, ...(analysisId ? { analysisId } : {}) }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = typeof j.error === 'string' ? j.error : JSON.stringify(j.error); } catch { /* keep status */ }
        throw new Error(msg);
      }
      setStep('downloading');
      const blob = await res.blob();
      downloadBlob(blob, personaProfileFilename(segment, label));
      setStep('done');
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setStep('idle'), 2400);
    } catch (err) {
      setError((err as any)?.message ?? String(err));
      setStep('error');
    } finally {
      if (tick.current) { clearInterval(tick.current); tick.current = null; }
    }
  };

  const btnCls = 'w-7 h-7 rounded-md border border-orbit-border bg-orbit-surface text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/50 flex items-center justify-center transition-colors cursor-pointer';
  const pillCls = 'h-7 max-w-full rounded-md border border-orbit-border bg-orbit-surface px-2 flex items-center gap-1.5 text-[10.5px] font-medium whitespace-nowrap overflow-hidden';

  if (busy || step === 'done') {
    return (
      <div
        className={`${pillCls} text-orbit-secondary`}
        role="status"
        aria-live="polite"
        title={step === 'done' ? `Saved ${personaProfileFilename(segment, label)}` : profileEtaTitle(history)}
        data-profile-step={step}
      >
        <i className={`text-[12px] shrink-0 ${step === 'done' ? 'ti ti-check text-orbit-green' : 'ti ti-loader-2 animate-spin text-orbit-accent'}`} aria-hidden="true" />
        <span className="truncate">{profileStatusText(step, elapsed, history)}</span>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void run(); }}
        className={`${pillCls} text-orbit-amber hover:text-orbit-primary cursor-pointer`}
        title={`Profile failed — ${error ?? 'unknown error'}. Click to try again.`}
        aria-label={`Persona profile for ${segment.name} failed — click to try again`}
        data-profile-step="error"
      >
        <i className="ti ti-alert-triangle text-[12px] shrink-0" aria-hidden="true" />
        <span className="truncate">Profile failed — {shortError(error ?? 'unknown error')}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void run(); }}
      className={btnCls}
      title={`Download ${label} — ${segment.name} as a persona profile image (JPG). AI-generated by the OpenAI image API from this segment's data — illustrative, not a customer photo.`}
      aria-label={`Persona profile image for ${segment.name} (JPG download)`}
      data-profile-step="idle"
    >
      <i className="ti ti-id-badge-2 text-[13px]" aria-hidden="true" />
    </button>
  );
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ── Segment accent palette — A/B/C ────────────────────────────────────────────

const SEGMENT_ACCENTS = [
  {
    dot:    'bg-seg-a',
    tab:    'border-seg-a text-seg-a',
    tabOff: 'border-orbit-border text-orbit-secondary hover:border-seg-a/40 hover:text-seg-a',
    badge:  'bg-seg-a/10 text-seg-a border-seg-a/30',
    pill:   'bg-seg-a/8 border-seg-a/20 text-seg-a',
    heading:'text-seg-a',
    icon:   'text-seg-a',
    bar:    'bg-seg-a',
    rail:   'bg-orbit-cyan',
    cssColor: 'rgb(var(--seg-a))',
    section:'border-l-2 border-seg-a/30 pl-3',
  },
  {
    dot:    'bg-seg-b',
    tab:    'border-seg-b text-seg-b',
    tabOff: 'border-orbit-border text-orbit-secondary hover:border-seg-b/40 hover:text-seg-b',
    badge:  'bg-seg-b/10 text-seg-b border-seg-b/30',
    pill:   'bg-seg-b/8 border-seg-b/20 text-seg-b',
    heading:'text-seg-b',
    icon:   'text-seg-b',
    bar:    'bg-seg-b',
    rail:   'bg-orbit-accent',
    cssColor: 'rgb(var(--seg-b))',
    section:'border-l-2 border-seg-b/30 pl-3',
  },
  {
    dot:    'bg-seg-c',
    tab:    'border-seg-c text-seg-c',
    tabOff: 'border-orbit-border text-orbit-secondary hover:border-seg-c/40 hover:text-seg-c',
    badge:  'bg-seg-c/10 text-seg-c border-seg-c/30',
    pill:   'bg-seg-c/8 border-seg-c/20 text-seg-c',
    heading:'text-seg-c',
    icon:   'text-seg-c',
    bar:    'bg-seg-c',
    rail:   'bg-orbit-amber',
    cssColor: 'rgb(var(--seg-c))',
    section:'border-l-2 border-seg-c/30 pl-3',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number; }

// v7.216: the active→detail connector is ONE continuous outline — a rounded card
// whose bottom edge opens in the middle, rounded throat fillets, two walls, then the
// rounded detail card. Drawn as a single SVG path measured from the live card rects
// so it matches the approved mockup exactly (rounded outer corners, rounded mouth,
// hollow opening). Pure geometry — unit-tested in the harness. Replaces the v7.215
// border-stub approach (which left a hairline across the mouth and squared corners).
export function buildNeckPath(A: Rect, B: Rect, r: number, fr: number, mh: number): string {
  const cx = A.x + A.w / 2, mL = cx - mh, mR = cx + mh;
  const aL = A.x, aR = A.x + A.w, aT = A.y, aBot = A.y + A.h;
  const bL = B.x, bR = B.x + B.w, bT = B.y, bBot = B.y + B.h;
  return [
    `M ${aL + r} ${aT}`, `L ${aR - r} ${aT}`, `Q ${aR} ${aT} ${aR} ${aT + r}`,
    `L ${aR} ${aBot - r}`, `Q ${aR} ${aBot} ${aR - r} ${aBot}`,
    `L ${mR + fr} ${aBot}`, `Q ${mR} ${aBot} ${mR} ${aBot + fr}`,
    `L ${mR} ${bT - fr}`, `Q ${mR} ${bT} ${mR + fr} ${bT}`,
    `L ${bR - r} ${bT}`, `Q ${bR} ${bT} ${bR} ${bT + r}`,
    `L ${bR} ${bBot - r}`, `Q ${bR} ${bBot} ${bR - r} ${bBot}`,
    `L ${bL + r} ${bBot}`, `Q ${bL} ${bBot} ${bL} ${bBot - r}`,
    `L ${bL} ${bT + r}`, `Q ${bL} ${bT} ${bL + r} ${bT}`,
    `L ${mL - fr} ${bT}`, `Q ${mL} ${bT} ${mL} ${bT - fr}`,
    `L ${mL} ${aBot + fr}`, `Q ${mL} ${aBot} ${mL - fr} ${aBot}`,
    `L ${aL + r} ${aBot}`, `Q ${aL} ${aBot} ${aL} ${aBot - r}`,
    `L ${aL} ${aT + r}`, `Q ${aL} ${aT} ${aL + r} ${aT}`, 'Z',
  ].join(' ');
}

// Clamp the corner radius, mouth fillet, and mouth half-width to the measured throat
// and column so the curve never self-overlaps when space is tight.
export function neckParams(A: Rect, B: Rect): { r: number; fr: number; mh: number } {
  const throat = B.y - (A.y + A.h);
  const mh = Math.max(24, Math.min(A.w * 0.28, A.w / 2 - 16));
  const fr = Math.max(6, Math.min(14, throat / 2 - 1, mh - 4));
  return { r: 14, fr, mh };
}

function SectionLabel({ children, accent, bar = true }: {
  children: React.ReactNode;
  accent?: typeof SEGMENT_ACCENTS[0];
  bar?: boolean;
}) {
  return (
    <p className="flex items-center gap-2.5 text-orbit-primary text-[12.5px] font-bold uppercase tracking-[0.07em] mb-2.5">
      {bar && accent && (
        <span className={`inline-block w-[3px] h-3.5 rounded-sm shrink-0 ${accent.rail}`} aria-hidden="true" />
      )}
      {children}
    </p>
  );
}

function PromptChip({ text, accent }: { text: string; accent: typeof SEGMENT_ACCENTS[0] }) {
  return (
    <span className={`inline-flex items-start gap-1 text-[11px] px-2.5 py-1.5 rounded-md border font-mono leading-snug ${accent.pill}`}>
      <span className="opacity-50 shrink-0 mt-0.5">&ldquo;</span>
      <span>{text}</span>
      <span className="opacity-50 shrink-0 mt-0.5">&rdquo;</span>
    </span>
  );
}

// v7.352: per-card export actions — CSV download + copy to clipboard. Rendered as
// a SIBLING of the card <button> (inside a shared relative wrapper), never nested
// inside it: interactive elements inside a <button> are invalid HTML and break
// hydration. The copy button flips to a ✓ for 1.6s as its success feedback.
function SegmentExportActions({ segment, label, projectId, analysisId }: {
  segment: AudienceSegment;
  label: string;
  projectId?: string;
  analysisId?: string;
}) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(segmentToClipboardText(segment, label));
    setCopied(ok ? 'ok' : 'fail');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied('idle'), 1600);
  };

  const btnCls = 'w-7 h-7 rounded-md border border-orbit-border bg-orbit-surface text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/50 flex items-center justify-center transition-colors cursor-pointer';

  return (
    <>
    {/* v7.552: persona profile image — bottom-LEFT, mirroring the export pair on the
        right. Same sibling-of-the-card rule as v7.352. The strip is capped so a
        running/failed pill never runs under the right-hand icons. */}
    <div className="absolute bottom-3 left-3 z-20 flex items-center" style={{ maxWidth: 'calc(100% - 96px)' }}>
      <PersonaProfileButton segment={segment} label={label} projectId={projectId} analysisId={analysisId} />
    </div>
    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); downloadSegmentCsv(segment, label); }}
        className={btnCls}
        title={`Download ${label} — ${segment.name} as CSV (all segment details)`}
        aria-label={`Download ${segment.name} as CSV`}
      >
        <i className="ti ti-download text-[13px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void handleCopy(); }}
        className={btnCls}
        title={copied === 'ok' ? 'Copied!' : copied === 'fail' ? 'Copy failed — clipboard unavailable' : `Copy ${label} — ${segment.name} to clipboard (all segment details)`}
        aria-label={`Copy ${segment.name} to clipboard`}
      >
        <i
          className={`text-[13px] ${copied === 'ok' ? 'ti ti-check text-orbit-green' : copied === 'fail' ? 'ti ti-alert-triangle text-orbit-amber' : 'ti ti-copy'}`}
          aria-hidden="true"
        />
      </button>
    </div>
    </>
  );
}

function BulletList({ items, accent }: { items: string[]; accent: typeof SEGMENT_ACCENTS[0] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className={`shrink-0 mt-1 text-[8px] ${accent.icon}`}>▸</span>
          <span className="text-orbit-secondary text-xs leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Persona portrait (Option A — circular) ────────────────────────────────────
// v7.149: shows the AI-generated photoreal portrait when present, else a
// graceful initials fallback. Every real portrait carries an "AI" corner badge
// (and title) so it is never mistaken for a real customer photo.

function initialsFromName(name: string): string {
  const words = (name || '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !/^(the|a|an|of|and)$/i.test(w));
  const picks = words.slice(0, 2).map(w => w[0]?.toUpperCase() ?? '');
  return picks.join('') || (name?.[0]?.toUpperCase() ?? '?');
}

function PersonaAvatar({ segment, accent, size = 48 }: {
  segment: AudienceSegment;
  accent: typeof SEGMENT_ACCENTS[0];
  size?: number;
}) {
  const px = { width: size, height: size };

  return (
    <div className="relative shrink-0" style={px} title={segment.personaImageUrl ? 'AI-generated persona portrait — illustrative, not a real customer' : undefined}>
      {segment.personaImageUrl ? (
        <img
          src={segment.personaImageUrl}
          alt={`AI-generated portrait representing ${segment.name}`}
          className={`w-full h-full rounded-full object-cover border-2 ${accent.tab.split(' ')[0]}`}
          style={px}
          loading="lazy"
        />
      ) : (
        <div
          className={`w-full h-full rounded-full border-2 flex items-center justify-center font-semibold ${accent.badge}`}
          style={{ ...px, fontSize: Math.round(size * 0.34) }}
          aria-label={`${segment.name} (no portrait yet)`}
        >
          {initialsFromName(segment.name)}
        </div>
      )}
    </div>
  );
}

// ── Empty / coming-soon state ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-orbit-accent/10 border border-orbit-accent/20 flex items-center justify-center">
        <i className="ti ti-users text-2xl text-orbit-accent opacity-50" />
      </div>
      <div className="text-center max-w-xs">
        <p className="text-orbit-primary text-sm font-semibold">Audience Segments</p>
        <p className="text-orbit-secondary text-xs mt-1.5 leading-relaxed">
          Deep-dive segment profiles — journey, prompts, messaging, creative direction, and channel approach — will appear here once configured for this client.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 text-orbit-tertiary text-[11px] mt-2">
        {['Pre-product LLM prompt sets', 'Touchpoints by journey stage', 'Messaging & tone brief', 'Creative direction', 'Channel approach'].map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-orbit-accent/30 shrink-0" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Segment detail panel ──────────────────────────────────────────────────────

function SegmentDetail({ segment, accent, label, connected, cardRef }: {
  segment: AudienceSegment;
  accent: typeof SEGMENT_ACCENTS[0];
  label: string;
  connected: boolean;
  cardRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* ── Merged profile + triggers card ── v7.216: the active summary card's
           opened bottom fuses into this card via one continuous SVG outline (drawn by
           the parent). When connected, this card's own bg + border go transparent so
           the SVG provides the fill + outline; otherwise (mobile / SSR) it keeps its
           own rounded accent border. Header row carries the label + growth on the
           left and the share-of-volume on the far right; below, two columns: portrait
           + quote on the left, trigger + influencer on the right. ── */}
      <div
        ref={cardRef}
        className="orbit-card p-5 relative z-10 lg:mt-8"
        style={connected
          ? { background: 'transparent', border: '2px solid transparent' }
          : { border: `2px solid ${accent.cssColor}` }}
      >
        {/* full-width header — share-of-volume pinned far right */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold ${accent.badge}`}>
              {label}
            </span>
            {segment.yoyGrowth && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-orbit-green/30 bg-orbit-green/10 text-orbit-green font-semibold">
                {segment.yoyGrowth}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-orbit-tertiary text-[10px] uppercase tracking-widest">Share of volume</p>
            <p className={`text-xl font-bold leading-none mt-0.5 ${accent.heading}`}>{segment.volumePct}%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-7">

          {/* LEFT — portrait + name + quote */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <PersonaAvatar segment={segment} accent={accent} size={96} />
              <h2 className={`text-lg font-bold ${accent.heading}`}>{segment.name}</h2>
            </div>

            <p className="text-orbit-secondary text-sm italic leading-relaxed">
              &ldquo;{segment.tagline}&rdquo;
            </p>
          </div>

          {/* RIGHT — trigger + influencer, stacked */}
          <div className="flex flex-col gap-4 justify-center">
            <div className={accent.section}>
              <p className="text-orbit-tertiary text-[10px] font-medium mb-1 uppercase tracking-widest">Trigger</p>
              <p className="text-orbit-secondary text-xs leading-relaxed">{segment.whoTheyAre.trigger}</p>
            </div>
            {segment.whoTheyAre.influencerRole && (
              <div className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
                <p className="text-orbit-tertiary text-[10px] font-medium mb-1 uppercase tracking-widest">Influencer / Gatekeeper Role</p>
                <p className="text-orbit-secondary text-xs leading-relaxed">{segment.whoTheyAre.influencerRole}</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-5">

          {/* Touchpoints */}
          <div className="orbit-card p-5">
            <SectionLabel accent={accent}>Touchpoints by Journey Stage</SectionLabel>
            <div className="flex flex-col gap-3 mt-1">
              {segment.touchpoints.map((tp, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`shrink-0 w-5 h-5 rounded-full ${accent.badge} flex items-center justify-center text-[9px] font-bold border`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className={`text-[11px] font-semibold ${accent.heading}`}>{tp.stage}</p>
                    <p className="text-orbit-secondary text-xs mt-0.5 leading-relaxed">{tp.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-5">

          {/* Pre-product LLM prompts */}
          <div className="orbit-card p-5">
            <SectionLabel accent={accent}>Pre-Product LLM Prompts</SectionLabel>
            <p className="text-orbit-tertiary text-[10px] mb-3 italic">
              Before they think of the product — these are the life-problem prompts that signal intent weeks or months upstream.
            </p>
            <div className="flex flex-col gap-2">
              {segment.preLLMPrompts.map((q, i) => (
                <PromptChip key={i} text={q} accent={accent} />
              ))}
            </div>
          </div>

          {/* Product-stage prompts */}
          <div className="orbit-card p-5">
            <SectionLabel accent={accent}>Product-Stage Search Prompts</SectionLabel>
            <div className="flex flex-col gap-2">
              {segment.productPrompts.map((q, i) => (
                <PromptChip key={i} text={q} accent={accent} />
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Full-width strategy row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Messaging & Tone */}
        <div className="orbit-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className={`ti ti-message-2 text-sm ${accent.icon}`} />
            <SectionLabel bar={false}>Messaging &amp; Tone</SectionLabel>
          </div>
          <div className="text-orbit-secondary text-xs leading-relaxed whitespace-pre-line">
            {segment.messagingAndTone}
          </div>
        </div>

        {/* Creative Direction */}
        <div className="orbit-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className={`ti ti-palette text-sm ${accent.icon}`} />
            <SectionLabel bar={false}>Creative &amp; Imagery Direction</SectionLabel>
          </div>
          <div className="text-orbit-secondary text-xs leading-relaxed whitespace-pre-line">
            {segment.creativeDirection}
          </div>
        </div>

        {/* Channel Approach */}
        <div className="orbit-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className={`ti ti-broadcast text-sm ${accent.icon}`} />
            <SectionLabel bar={false}>Channel Approach</SectionLabel>
          </div>
          <div className="text-orbit-secondary text-xs leading-relaxed whitespace-pre-line">
            {segment.channelApproach}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AudienceSegmentsSection({ analysis, projectId }: Props) {
  // Rich segment data is stored in semrushSnapshot._audienceSegments (JSONB blob).
  // This avoids the old personas relational table whose rigid schema is incompatible
  // with the new AudienceSegment shape.
  const segments: AudienceSegment[] = analysis?.semrushSnapshot?._audienceSegments ?? [];
  const [active, setActive] = useState(0);

  const segmentLabels = SEGMENT_LABELS;
  // v7.552: the persona-profile route reads the segment from THIS analysis (the one
  // on screen), so the image, the CSV and the clipboard copy share one source.
  const resolvedProjectId: string | undefined = projectId ?? (analysis?.projectId ? String(analysis.projectId) : undefined);
  const analysisId: string | undefined = analysis?.id ? String(analysis.id) : undefined;

  // v7.150: portrait-generation diagnostic. Shown only when something is off
  // (a status exists and at least one segment has no portrait) so it stays out
  // of the way once images are working.
  const imageStatus: string | undefined = analysis?.semrushSnapshot?._audienceSegmentsImageStatus;
  const imagedCount = segments.filter(s => !!s.personaImageUrl).length;
  const showImageDiag = !!imageStatus && imagedCount < segments.length;

  // v7.216: neck connector. Drawn only when the active card sits in the last grid
  // row at lg (directly above the full-width detail). The outline is measured from
  // the live card rects so it tracks any column / content height / viewport.
  const rows = Math.ceil(Math.max(segments.length, 1) / 3);
  const showNeck = Math.floor(active / 3) === rows - 1;
  const activeAcc = SEGMENT_ACCENTS[active % SEGMENT_ACCENTS.length];

  const wrapRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useRef<HTMLButtonElement>(null);
  const detailCardRef = useRef<HTMLDivElement>(null);
  const [neck, setNeck] = useState<{ d: string; w: number; h: number } | null>(null);

  const measureNeck = useCallback(() => {
    const wrap = wrapRef.current, ac = activeCardRef.current, dc = detailCardRef.current;
    const isLg = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    if (!wrap || !ac || !dc || !isLg || !showNeck) { setNeck(null); return; }
    const w = wrap.getBoundingClientRect();
    const a = ac.getBoundingClientRect();
    const b = dc.getBoundingClientRect();
    const A: Rect = { x: a.left - w.left, y: a.top - w.top, w: a.width, h: a.height };
    const B: Rect = { x: b.left - w.left, y: b.top - w.top, w: b.width, h: b.height };
    if (B.y <= A.y + A.h) { setNeck(null); return; }   // not stacked above → no neck
    const { r, fr, mh } = neckParams(A, B);
    setNeck({ d: buildNeckPath(A, B, r, fr, mh), w: w.width, h: w.height });
  }, [showNeck, active]);

  useEffect(() => {
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measureNeck); };
    run();
    window.addEventListener('resize', run);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(run) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', run); if (ro) ro.disconnect(); };
  }, [measureNeck]);

  return (
    <div className="overflow-y-auto flex-1 p-3 flex flex-col gap-3 animate-fade-in">

      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-orbit-secondary text-[10px] font-medium uppercase tracking-widest">Foundation</p>
          <h3 className="text-orbit-primary text-base font-semibold mt-0.5">Audience Segments</h3>
          <p className="text-orbit-secondary text-[11px] mt-0.5">
            Segment deep-dives — journey, prompts, experience planning
          </p>
          {showImageDiag && (
            <p className="text-orbit-amber text-[10px] mt-1 flex items-center gap-1.5" title="Persona-portrait generation status from the last analysis run">
              <i className="ti ti-photo-exclamation text-[11px]" />
              <span>Persona images — {imageStatus}</span>
            </p>
          )}
        </div>
        {segments.length > 0 && (
          <div className="text-right">
            <p className="text-orbit-tertiary text-[10px]">Total segments</p>
            <p className="text-orbit-primary text-lg font-bold">{segments.length}</p>
          </div>
        )}
      </div>

      {segments.length === 0 ? (
        <EmptyState />
      ) : (
        <div ref={wrapRef} className="relative flex flex-col gap-3">

          {/* v7.216: one continuous outline fusing the active card into the detail —
              rounded corners, rounded mouth, hollow opening. Measured from the live
              rects; the connected cards go transparent so this provides fill+stroke. */}
          {neck && (
            <svg
              aria-hidden="true"
              className="absolute left-0 top-0 z-0 pointer-events-none"
              style={{ overflow: 'visible' }}
              width={neck.w}
              height={neck.h}
            >
              <path d={neck.d} fill="var(--card)" stroke={activeAcc.cssColor} strokeWidth={2} />
            </svg>
          )}

          {/* ── Clickable summary cards ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 relative z-10">
            {segments.map((seg, i) => {
              const acc   = SEGMENT_ACCENTS[i % SEGMENT_ACCENTS.length];
              const isAct = i === active;
              // v7.352: relative wrapper so the export icons sit as a SIBLING of the
              // card <button> (valid HTML — no interactive nesting). The button keeps
              // the card geometry the neck connector measures; pb-12 reserves the
              // bottom strip the icons occupy.
              return (
                <div key={seg.id} className="relative">
                <button
                  ref={isAct ? activeCardRef : undefined}
                  onClick={() => setActive(i)}
                  className={`orbit-card p-4 pb-12 w-full h-full text-left flex flex-col gap-3 transition-all cursor-pointer relative ${
                    isAct ? '' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={isAct
                    ? (neck ? { background: 'transparent', border: '2px solid transparent' } : { border: `2px solid ${acc.cssColor}` })
                    : {}}
                >
                  {/* Card header — v7.149: AI-generated persona portrait (Option A) left */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PersonaAvatar segment={seg} accent={acc} size={44} />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${acc.badge}`}>
                        {segmentLabels[i]}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xl font-bold leading-none ${acc.heading}`}>{seg.volumePct}%</p>
                      <p className="text-orbit-tertiary text-[9px] uppercase tracking-widest mt-0.5">of volume</p>
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <p className={`text-[13px] font-semibold ${isAct ? acc.heading : 'text-orbit-primary'}`}>
                      {seg.name}
                    </p>
                  </div>

                  {/* Who they are — moved up from the detail. Primary (reads white
                      on dark, dark on light — legible in both themes) when active;
                      muted + clamped when not. */}
                  <p className={`text-[11px] leading-relaxed ${isAct ? 'text-orbit-primary' : 'text-orbit-secondary line-clamp-3'}`}>
                    {seg.whoTheyAre.demographics}
                  </p>

                  {/* Click hint when inactive */}
                  {!isAct && (
                    <p className={`text-[10px] font-medium ${acc.heading} flex items-center gap-1`}>
                      <i className="ti ti-arrow-right text-[10px]" />
                      View deep-dive
                    </p>
                  )}
                  {isAct && (
                    <p className={`text-[10px] font-medium ${acc.heading} flex items-center gap-1`}>
                      <i className="ti ti-check text-[10px]" />
                      Active
                    </p>
                  )}
                </button>

                {/* v7.352: per-segment export — CSV download + copy to clipboard; v7.552: persona profile (left) */}
                <SegmentExportActions segment={seg} label={segmentLabels[i]} projectId={resolvedProjectId} analysisId={analysisId} />
                </div>
              );
            })}
          </div>

          {/* Active segment detail */}
          <SegmentDetail
            key={active}
            segment={segments[active]}
            accent={SEGMENT_ACCENTS[active % SEGMENT_ACCENTS.length]}
            label={segmentLabels[active]}
            connected={!!neck}
            cardRef={detailCardRef}
          />
        </div>
      )}
    </div>
  );
}
