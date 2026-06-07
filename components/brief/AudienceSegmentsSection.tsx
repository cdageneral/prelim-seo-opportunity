'use client';

import { useState } from 'react';

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
    section:'border-l-2 border-amber-400/30 pl-3',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-orbit-tertiary text-[10px] font-semibold uppercase tracking-widest mb-2">
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

function SegmentDetail({ segment, accent, label }: {
  segment: AudienceSegment;
  accent: typeof SEGMENT_ACCENTS[0];
  label: string;
}) {
  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* ── Hero header ── */}
      <div className="orbit-card p-5">
        <div className="flex items-center gap-5">

          {/* v7.149: AI-generated persona portrait (Option A) — v7.151: enlarged, caption removed */}
          <PersonaAvatar segment={segment} accent={accent} size={104} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold ${accent.badge}`}>
                  {label}
                </span>
                {segment.yoyGrowth && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 font-semibold">
                    {segment.yoyGrowth}
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-orbit-tertiary text-[10px] uppercase tracking-widest">Share of volume</p>
                <p className={`text-xl font-bold ${accent.heading}`}>{segment.volumePct}%</p>
              </div>
            </div>

            <div className="mt-3">
              <h2 className={`text-lg font-bold ${accent.heading}`}>{segment.name}</h2>
              <p className="text-orbit-secondary text-sm mt-1 italic leading-relaxed">
                &ldquo;{segment.tagline}&rdquo;
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-5">

          {/* Who They Are */}
          <div className="orbit-card p-5 flex flex-col gap-4">
            <div>
              <SectionLabel>Who They Are</SectionLabel>
              <p className="text-orbit-primary text-xs leading-relaxed">{segment.whoTheyAre.demographics}</p>
            </div>
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

          {/* Touchpoints */}
          <div className="orbit-card p-5">
            <SectionLabel>Touchpoints by Journey Stage</SectionLabel>
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
            <SectionLabel>Pre-Product LLM Prompts</SectionLabel>
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
            <SectionLabel>Product-Stage Search Prompts</SectionLabel>
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
            <SectionLabel>Messaging &amp; Tone</SectionLabel>
          </div>
          <div className="text-orbit-secondary text-xs leading-relaxed whitespace-pre-line">
            {segment.messagingAndTone}
          </div>
        </div>

        {/* Creative Direction */}
        <div className="orbit-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className={`ti ti-palette text-sm ${accent.icon}`} />
            <SectionLabel>Creative &amp; Imagery Direction</SectionLabel>
          </div>
          <div className="text-orbit-secondary text-xs leading-relaxed whitespace-pre-line">
            {segment.creativeDirection}
          </div>
        </div>

        {/* Channel Approach */}
        <div className="orbit-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <i className={`ti ti-broadcast text-sm ${accent.icon}`} />
            <SectionLabel>Channel Approach</SectionLabel>
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
        <>
          {/* ── Clickable summary cards ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {segments.map((seg, i) => {
              const acc   = SEGMENT_ACCENTS[i % SEGMENT_ACCENTS.length];
              const isAct = i === active;
              return (
                <button
                  key={seg.id}
                  onClick={() => setActive(i)}
                  className={`orbit-card p-4 text-left flex flex-col gap-3 transition-all cursor-pointer ${
                    isAct
                      ? 'ring-1 ring-inset ' + acc.tab.split(' ')[0].replace('border-', 'ring-')
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={isAct ? { borderTopWidth: '2px', borderTopColor: 'currentColor' } : {}}
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

                  {/* Who they are — short summary */}
                  <p className="text-orbit-secondary text-[11px] leading-relaxed line-clamp-3">
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
              );
            })}
          </div>

          {/* Active segment detail */}
          <SegmentDetail
            key={active}
            segment={segments[active]}
            accent={SEGMENT_ACCENTS[active % SEGMENT_ACCENTS.length]}
            label={segmentLabels[active]}
          />
        </>
      )}
    </div>
  );
}
