'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudienceTouchpoint {
  stage: string;       // "Stage 1 (LLM)"
  description: string;
}

export interface AudienceSegment {
  id: string;
  name: string;              // "The Crisis Converter"
  tagline: string;           // "I can't afford my mortgage renewal. I need options — fast."
  volumePct: number;         // 42
  yoyGrowth?: string;        // "+32% YoY"
  personaImageUrl?: string;  // v7.149: AI-generated photoreal portrait (Vercel Blob URL)

  whoTheyAre: {
    demographics: string;    // Age range, employment status, financial profile
    trigger: string;         // What drives them to search
    influencerRole?: string; // Spouse / adult child / advisor role
  };

  preLLMPrompts: string[];   // Life-problem prompts before they think of the product
  productPrompts: string[];  // Product/solution-stage searches

  touchpoints: AudienceTouchpoint[];

  messagingAndTone: string;
  creativeDirection: string;
  channelApproach: string;
}

interface Props { analysis: any; }

// ── v7.352: per-segment export (CSV download + copy to clipboard) ─────────────
// Every field the panel renders for a segment is flattened into ordered
// [field, value] rows — the single source both exports read, so the CSV and the
// clipboard text can never drift from each other or from the UI (Const II.7 in
// miniature). Pure functions, unit-tested in the harness.

export function buildSegmentRows(segment: AudienceSegment, label: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Segment', label],
    ['Name', segment.name ?? ''],
    ['Tagline', segment.tagline ?? ''],
    ['Share of Volume (%)', String(segment.volumePct ?? '')],
  ];
  if (segment.yoyGrowth) rows.push(['YoY Growth', segment.yoyGrowth]);
  rows.push(['Demographics', segment.whoTheyAre?.demographics ?? '']);
  rows.push(['Trigger', segment.whoTheyAre?.trigger ?? '']);
  if (segment.whoTheyAre?.influencerRole) rows.push(['Influencer / Gatekeeper Role', segment.whoTheyAre.influencerRole]);
  (segment.preLLMPrompts ?? []).forEach((p, i) => rows.push([`Pre-Product LLM Prompt ${i + 1}`, p]));
  (segment.productPrompts ?? []).forEach((p, i) => rows.push([`Product-Stage Search Prompt ${i + 1}`, p]));
  (segment.touchpoints ?? []).forEach((tp, i) => rows.push([`Touchpoint ${i + 1} — ${tp.stage}`, tp.description]));
  rows.push(['Messaging & Tone', segment.messagingAndTone ?? '']);
  rows.push(['Creative & Imagery Direction', segment.creativeDirection ?? '']);
  rows.push(['Channel Approach', segment.channelApproach ?? '']);
  return rows;
}

// RFC-4180 escaping: quote any field carrying a comma, quote, or newline; double
// embedded quotes. Values pass through otherwise untouched (Const I.1 — export
// exactly what the panel shows, no reformatting).
export function csvEscape(v: string): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function segmentToCsv(segment: AudienceSegment, label: string): string {
  const lines = ['Field,Value'];
  buildSegmentRows(segment, label).forEach(([f, v]) => lines.push(`${csvEscape(f)},${csvEscape(v)}`));
  return lines.join('\r\n');
}

export function segmentToClipboardText(segment: AudienceSegment, label: string): string {
  return buildSegmentRows(segment, label).map(([f, v]) => `${f}: ${v}`).join('\n');
}

export function segmentCsvFilename(segment: AudienceSegment, label: string): string {
  const slug = `${label} ${segment.name ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `audience-${slug || 'segment'}.csv`;
}

function downloadSegmentCsv(segment: AudienceSegment, label: string): void {
  // \uFEFF BOM so Excel opens the UTF-8 CSV with accents/dashes intact.
  const blob = new Blob(['\uFEFF' + segmentToCsv(segment, label)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = segmentCsvFilename(segment, label);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    dot:    'bg-cyan-400',
    tab:    'border-cyan-400 text-cyan-400',
    tabOff: 'border-orbit-border text-orbit-secondary hover:border-cyan-400/40 hover:text-cyan-400/70',
    badge:  'bg-cyan-400/10 text-cyan-400 border-cyan-400/30',
    pill:   'bg-cyan-400/8 border-cyan-400/20 text-cyan-300',
    heading:'text-cyan-400',
    icon:   'text-cyan-400',
    bar:    'bg-cyan-400',
    rail:   'bg-orbit-cyan',
    hex:    '#22d3ee',
    section:'border-l-2 border-cyan-400/30 pl-3',
  },
  {
    dot:    'bg-violet-400',
    tab:    'border-violet-400 text-violet-400',
    tabOff: 'border-orbit-border text-orbit-secondary hover:border-violet-400/40 hover:text-violet-400/70',
    badge:  'bg-violet-400/10 text-violet-400 border-violet-400/30',
    pill:   'bg-violet-400/8 border-violet-400/20 text-violet-300',
    heading:'text-violet-400',
    icon:   'text-violet-400',
    bar:    'bg-violet-400',
    rail:   'bg-orbit-accent',
    hex:    '#a78bfa',
    section:'border-l-2 border-violet-400/30 pl-3',
  },
  {
    dot:    'bg-amber-400',
    tab:    'border-amber-400 text-amber-400',
    tabOff: 'border-orbit-border text-orbit-secondary hover:border-amber-400/40 hover:text-amber-400/70',
    badge:  'bg-amber-400/10 text-amber-400 border-amber-400/30',
    pill:   'bg-amber-400/8 border-amber-400/20 text-amber-300',
    heading:'text-amber-400',
    icon:   'text-amber-400',
    bar:    'bg-amber-400',
    rail:   'bg-orbit-amber',
    hex:    '#fbbf24',
    section:'border-l-2 border-amber-400/30 pl-3',
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
function SegmentExportActions({ segment, label }: {
  segment: AudienceSegment;
  label: string;
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
          className={`text-[13px] ${copied === 'ok' ? 'ti ti-check text-green-400' : copied === 'fail' ? 'ti ti-alert-triangle text-amber-400' : 'ti ti-copy'}`}
          aria-hidden="true"
        />
      </button>
    </div>
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
          : { border: `2px solid ${accent.hex}` }}
      >
        {/* full-width header — share-of-volume pinned far right */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold ${accent.badge}`}>
              {label}
            </span>
            {segment.yoyGrowth && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 font-semibold">
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

export default function AudienceSegmentsSection({ analysis }: Props) {
  // Rich segment data is stored in semrushSnapshot._audienceSegments (JSONB blob).
  // This avoids the old personas relational table whose rigid schema is incompatible
  // with the new AudienceSegment shape.
  const segments: AudienceSegment[] = analysis?.semrushSnapshot?._audienceSegments ?? [];
  const [active, setActive] = useState(0);

  const segmentLabels = ['Segment A', 'Segment B', 'Segment C', 'Segment D'];

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
            <p className="text-amber-400/80 text-[10px] mt-1 flex items-center gap-1.5" title="Persona-portrait generation status from the last analysis run">
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
              <path d={neck.d} fill="var(--card)" stroke={activeAcc.hex} strokeWidth={2} />
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
                    ? (neck ? { background: 'transparent', border: '2px solid transparent' } : { border: `2px solid ${acc.hex}` })
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
                    <p className={`text-[10px] font-medium ${acc.heading} opacity-60 flex items-center gap-1`}>
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

                {/* v7.352: per-segment export — CSV download + copy to clipboard */}
                <SegmentExportActions segment={seg} label={segmentLabels[i]} />
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
