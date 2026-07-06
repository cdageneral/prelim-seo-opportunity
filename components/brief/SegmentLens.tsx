'use client';

/**
 * SegmentLens (v7.353) — the audience-segment lens shared by the Content Map,
 * Content Plan and Scope panels.
 *
 * The Audience Journeys panel already attributes every canonical topic to ONE
 * audience segment (or the Shared bucket) through the exclusive audience-language
 * partition (v7.170/v7.247, `buildCanonTopicSegmentMap` in JourneySection). This
 * module carries that SAME association forward — the three downstream panels call
 * the same attribution function, so a topic sits in the same segment on every
 * panel (Const II.7: one partition, never re-derived differently per view).
 *
 * Wayne's call (2026-07-06): a topic whose language matches several segments (or
 * none) lands in the Shared bucket — and Shared topics appear under EVERY
 * segment's filtered view, tagged "Shared", so no segment view hides content
 * that's relevant to it. Segment views may therefore overlap; nothing is ever
 * summed ACROSS segment views (no double counting, Const I.3) — each filtered
 * view's cards are exact scopeOf rollups of the rows actually shown (Const I.1).
 *
 * Theme parity (Const IV.6): every color in this file is a --c- or --ca- token
 * that carries a light-mode remap — no hex literals.
 */

import { buildSegTokens, buildCanonTopicSegmentMap, SHARED_BUCKET } from '@/components/brief/JourneySection';
import { scopeOf, type ContentPlan } from '@/lib/journey/contentPlan';

// Structural slice of an audience segment as stored on the snapshot
// (`semrushSnapshot._audienceSegments`) — only what this lens reads.
export interface SegmentLite {
  id:               string;
  name:             string;
  volumePct?:       number;
  personaImageUrl?: string;
}

// Minimal structural shape of a canonical cluster topic this lens needs — matches
// ThemeClustersPanel `Topic` / JourneySection `CanonicalJourneyTopic`.
export interface SegTopicLike {
  id:         string;
  parentName: string;
  product:    string;
  keywords:   Array<{ keyword: string }>;
}

/** Segments come from the snapshot — same source the Journey panel reads. */
export function readSegments(analysis: any): any[] {
  return ((analysis?.semrushSnapshot as any)?._audienceSegments ?? []) as any[];
}

/**
 * topic.id → bucket (a segment.id or SHARED_BUCKET), via the ONE shared
 * attribution the Journey panel uses (Const II.7 — no per-panel fork).
 */
export function buildTopicSegmentMap(topics: SegTopicLike[], segments: any[]): Map<string, string> {
  if (!topics.length || !segments.length) return new Map<string, string>();
  return buildCanonTopicSegmentMap(topics, buildSegTokens(segments));
}

/**
 * Filter a content plan to one segment's view: its exclusively-attributed topics
 * PLUS the Shared-bucket topics (Wayne 2026-07-06 — shared shows under every
 * segment). Scope is recomputed through the shared scopeOf rollup, so the cards
 * reconcile exactly with the rows shown (Const I.1/II.7).
 */
export function filterPlanBySegment(plan: ContentPlan, topicBucket: Map<string, string>, segId: string): ContentPlan {
  const topics = plan.topics.filter((t) => {
    const b = topicBucket.get(t.id);
    return b === segId || b === SHARED_BUCKET;
  });
  return { topics, scope: scopeOf(topics) };
}

// ─── Row tags ─────────────────────────────────────────────────────────────────

// Same three accent triples the Journey segment boxes rotate through (JourneySection
// SEGMENT_ACCENTS) — solid --c-* text tokens + real --ca-* alpha tokens, all with
// light-mode remaps (Const IV.6).
const ACCENTS = [
  { text: 'var(--c-22d3ee)', bg: 'var(--ca-34-211-238-0_08)',  border: 'var(--ca-34-211-238-0_2)'  },
  { text: 'var(--c-a78bfa)', bg: 'var(--ca-167-139-250-0_08)', border: 'var(--ca-167-139-250-0_12)' },
  { text: 'var(--c-f59e0b)', bg: 'var(--ca-245-158-11-0_08)',  border: 'var(--ca-245-158-11-0_25)' },
];
const SHARED_ACCENT = { text: 'var(--c-8080a0)', bg: 'var(--ca-120-120-160-0_08)', border: 'var(--c-2a2a45)' };

export interface SegTag { name: string; text: string; bg: string; border: string; shared: boolean }

export function accentOf(segments: any[], segId: string): { text: string; bg: string; border: string } {
  const i = segments.findIndex((s: any) => s?.id === segId);
  return i >= 0 ? ACCENTS[i % ACCENTS.length] : SHARED_ACCENT;
}

/**
 * topic.id → display tag ({segment name, accent}) for the row chips. Shared-bucket
 * topics tag as "Shared" in muted tones.
 */
export function buildSegTags(topicBucket: Map<string, string>, segments: any[]): Map<string, SegTag> {
  const out = new Map<string, SegTag>();
  if (!segments.length) return out;
  topicBucket.forEach((bucket: string, id: string) => {
    if (bucket === SHARED_BUCKET) {
      out.set(id, { name: 'Shared', ...SHARED_ACCENT, shared: true });
    } else {
      const seg = segments.find((s: any) => s?.id === bucket);
      if (seg) out.set(id, { name: String(seg.name ?? 'Segment'), ...accentOf(segments, bucket), shared: false });
    }
  });
  return out;
}

/** Small inline tag rendered next to a topic row / drawer title. */
export function SegTagChip({ tag }: { tag: SegTag }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
      color: tag.text, background: tag.bg, border: `1px solid ${tag.border}`,
      borderRadius: 6, padding: '1.5px 6px', whiteSpace: 'nowrap',
    }}>
      <i className={`ti ${tag.shared ? 'ti-users' : 'ti-user'}`} style={{ fontSize: 9 }} />
      {tag.name}
    </span>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p: string) => p.charAt(0).toUpperCase()).join('') || '·';
}

/**
 * The segment filter chip row. `countOf(null)` = the unfiltered topic count;
 * `countOf(segId)` = that segment's view count (exclusive + shared). Counts are
 * real row counts of this panel's own plan — never a modeled split.
 */
export function SegmentFilterBar({ segments, active, onChange, countOf, note }: {
  segments: any[];
  active:   string | null;
  onChange: (id: string | null) => void;
  countOf:  (id: string | null) => number;
  note?:    string;
}) {
  if (!segments.length) return null;
  const chips: Array<{ id: string | null; label: string; img?: string }> = [
    { id: null, label: 'All Segments' },
    ...segments.map((s: any) => ({ id: String(s.id), label: String(s.name ?? 'Segment'), img: s.personaImageUrl as string | undefined })),
  ];
  return (
    <div style={{ margin: '2px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-4a4a6a)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="ti ti-users" /> Audience segment
        </span>
        {chips.map((c) => {
          const isActive = active === c.id;
          const ac = c.id === null ? { text: 'var(--c-a78bfa)', bg: 'var(--ca-167-139-250-0_08)', border: 'var(--ca-167-139-250-0_12)' } : accentOf(segments, c.id);
          const n = countOf(c.id);
          return (
            <button key={c.id ?? 'all'} type="button" onClick={() => onChange(c.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
              background: isActive ? ac.bg : 'var(--ca-120-120-160-0_08)',
              border: `1px solid ${isActive ? ac.text : 'var(--c-1a1a30)'}`,
              borderRadius: 999, padding: '4px 12px 4px 5px', fontSize: 11, fontWeight: 600,
              color: isActive ? ac.text : 'var(--c-8080a0)', transition: 'border-color 0.12s, color 0.12s',
            }}>
              {c.id === null ? (
                <span style={{ width: 22, height: 22, borderRadius: 7, border: `1px solid ${isActive ? ac.text : 'var(--c-2a2a45)'}`, color: isActive ? ac.text : 'var(--c-8080a0)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-layout-grid" style={{ fontSize: 12 }} />
                </span>
              ) : c.img ? (
                <img src={c.img} alt={`Portrait representing ${c.label}`} loading="lazy"
                  style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${ac.text}`, flexShrink: 0 }} />
              ) : (
                <span style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${ac.text}`, color: ac.text, background: ac.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                  {initialsOf(c.label)}
                </span>
              )}
              {c.label}
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 10.5, color: isActive ? ac.text : 'var(--c-6a6a90)' }}>{n}</span>
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 10, color: 'var(--c-4a4a6a)', margin: '6px 0 0', lineHeight: 1.5 }}>
        {note ?? 'Same segment attribution as the Audience Journeys panel — each topic follows its segment here. Topics whose language fits several segments are tagged Shared and appear under every segment.'}
      </p>
    </div>
  );
}
