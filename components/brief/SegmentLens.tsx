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

// ─── v7.394: SegmentTable — the Content Map's Step 1 (Wayne 2026-08-01, "option a") ───────
//
// The chip bar above still serves Content Plan and Scope unchanged (Const II.7 — this is an
// ADDITIONAL form for the one panel that asked for it, not a fork of the attribution). What
// it fixes on the Content Map:
//
//  1. THE COUNTS LOOKED BROKEN. On TD Bank the chips read 238 + 202 + 248 = 688 against an
//     "All Segments" of 428. The reason — the same Shared topics are counted under every
//     segment — was a 10px footnote read AFTER the reader had already stopped trusting the
//     numbers. Each row now shows its OWN count beside its total, and the shared figure is
//     stated once, in words, as a finding: on TD Bank 130 topics (30% of the map) speak to
//     every segment. Every number is counted off the SAME bucket map the filter itself uses,
//     so what the table claims and what clicking the row yields cannot drift (Const I.1).
//  2. YOU COULD NOT TELL WHO THESE PEOPLE ARE. The analysis already holds a first-person
//     tagline and an audience share per segment; neither reached this panel. Both render here,
//     verbatim — and a segment with no `volumePct` shows an em dash, never a made-up bar.
//  3. "All" sat on the label row, visually separated from the three choices it belongs with.
//     It is now the first row of four.
//
// Layout is deliberately the same table shape Step 2 took in v7.393, so the two cards in the
// step row read as one designed thing rather than pills beside a grid.
const SEG_TABLE_COLS = '26px minmax(0,1fr) 88px 108px';   // 108 so the AUDIENCE SHARE header is not clipped

function SegAvatar({ img, label, accent, size = 26 }: { img?: string; label: string; accent: string; size?: number }) {
  const initials = label.replace(/^The\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
  if (img) {
    return <img src={img} alt={`Portrait representing ${label}`} loading="lazy"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${accent}`, flexShrink: 0 }} />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', border: `1px solid ${accent}`, color: accent,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, flexShrink: 0 }}>{initials}</span>
  );
}

export function SegmentTable({ segments, active, onChange, total, bucket }: {
  segments:  any[];
  active:    string | null;
  onChange:  (id: string | null) => void;
  total:     number;                      // topics on the map — the All row's count
  bucket:    Map<string, string>;         // topic.id → segment.id | SHARED_BUCKET (the ONE attribution)
}) {
  if (!segments.length || bucket.size === 0) return null;

  // Counted from the bucket, which is what filterPlanBySegment reads — so `own + shared` is
  // BY CONSTRUCTION the row count a click produces, not a parallel estimate of it.
  let shared = 0;
  const own = new Map<string, number>();
  bucket.forEach((b) => {
    if (b === SHARED_BUCKET) shared += 1;
    else own.set(b, (own.get(b) ?? 0) + 1);
  });
  const sharedPct = total > 0 ? Math.round((shared / total) * 100) : 0;

  const hd: any = { fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--c-4a4a6a)' };
  const cell = (on: boolean, dis: boolean) => ({
    display: 'grid', gridTemplateColumns: SEG_TABLE_COLS, gap: 11, alignItems: 'center', padding: '9px 12px',
    borderBottom: '1px solid var(--c-1a1a30)', cursor: dis ? 'default' : 'pointer', opacity: dis ? 0.45 : 1,
    background: on ? 'var(--ca-167-139-250-0_08)' : 'transparent',
    boxShadow: on ? 'inset 3px 0 0 var(--c-a78bfa)' : 'none',
  });

  const Row = ({ id, name, quote, accent, img, count, sub, pct, disabled }: {
    id: string | null; name: string; quote: string; accent: string; img?: string;
    count: number; sub: string; pct: number | null; disabled?: boolean;
  }) => {
    const on = active === id;
    return (
      <div role="button" aria-pressed={on} aria-disabled={!!disabled} tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) onChange(id); }}
        onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChange(id); } }}
        title={disabled ? `No topics are attributed to ${name}` : `Filter the map to ${name}`}
        style={cell(on, !!disabled)}>
        <SegAvatar img={img} label={name} accent={accent} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: on ? 'var(--c-a78bfa)' : 'var(--c-c8c8e8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{name}</div>
          {quote && <div className="segQuote" style={{ fontSize: 10.5, color: 'var(--c-6a6a90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginTop: 2 }}>{quote}</div>}
        </div>
        <div>
          <div style={{ textAlign: 'right' as const, fontFamily: 'monospace', fontSize: 12.5, color: 'var(--c-dcdcf4)' }}>{count}</div>
          <div style={{ textAlign: 'right' as const, fontSize: 9.5, color: 'var(--c-6a6a90)', marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ height: 6, borderRadius: 3, background: 'var(--c-1a1a30)', flex: 1, overflow: 'hidden', minWidth: 0 }}>
            {pct !== null && <span style={{ display: 'block', height: '100%', borderRadius: 3, width: `${Math.max(0, Math.min(100, pct))}%`, background: accent }} />}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--c-6a6a90)', width: 30, textAlign: 'right' as const, flexShrink: 0 }}>
            {pct === null ? '—' : `${Math.round(pct)}%`}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ margin: '12px 0 0' }}>
      {/* Between 1200 and 1440px the step row is still two-up but each card is narrow — the
          quote is the first thing to give up, never a number. Below 1200 the cards stack full
          width (v7.391) so it comes back. */}
      <style>{`@media(min-width:1201px) and (max-width:1440px){.segQuote{display:none!important}}`}</style>
      <div style={{ border: '1px solid var(--c-1a1a30)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: SEG_TABLE_COLS, gap: 11, padding: '8px 12px', background: 'var(--c-08081a)', borderBottom: '1px solid var(--c-1a1a30)', ...hd }}>
          <div aria-hidden="true" />
          <div style={{ minWidth: 0 }}>Segment</div>
          <div style={{ textAlign: 'right' as const }}>Topics</div>
          <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Audience share</div>
        </div>
        <Row id={null} name="All segments" quote="every topic on the map" accent="var(--c-a78bfa)"
          count={total} sub="all" pct={total > 0 ? 100 : null} />
        {segments.map((s: any) => {
          const id = String(s.id);
          const o = own.get(id) ?? 0;
          const ac = accentOf(segments, id).text;
          const vp = typeof s.volumePct === 'number' ? s.volumePct : null;
          return (
            <Row key={id} id={id} name={String(s.name ?? 'Segment')} quote={String(s.tagline ?? '')}
              accent={ac} img={s.personaImageUrl as string | undefined}
              count={o + shared} sub={`${o} its own`} pct={vp} disabled={o + shared === 0} />
          );
        })}
      </div>
      {shared > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--ca-167-139-250-0_08)',
          border: '1px solid var(--ca-167-139-250-0_12)', borderRadius: 9, padding: '9px 12px', marginTop: 11,
          fontSize: 11.5, color: 'var(--c-c8c8e8)', lineHeight: 1.55 }}>
          <i className="ti ti-info-circle" style={{ color: 'var(--c-a78bfa)', fontSize: 14, flexShrink: 0, marginTop: 1 }} />
          <span>
            The same <b style={{ fontFamily: 'monospace', color: 'var(--c-a78bfa)', fontWeight: 700 }}>{shared}</b> topics
            {sharedPct > 0 && ` (${sharedPct}% of the map)`} speak to <b style={{ color: 'var(--c-a78bfa)' }}>every</b> segment,
            so each row is <i>its own</i> count plus those {shared} — which is why the segments add to more than {total}.
            Same attribution as the Audience Journeys panel.
          </span>
        </div>
      )}
    </div>
  );
}
