/**
 * lib/journey/segmentSummary.ts — v7.554
 *
 * The Journey panel's segment summary (Wayne 2026-10-11: "when i click on a user's
 * journey … I know exactly what is needed for each journey segment; then at the all
 * journey level we should have the summary information").
 *
 * ONE pure builder for both surfaces that print it — the panel (JourneySection) and
 * the Journey-map PDF cover (lib/pdf/journeyMapTemplate.ts) — so the screen and the
 * paper can never disagree (Const II.6a / II.7). Nothing here is modeled:
 *   - topics, categories, umbrellas  → counted off the canonical topics the panel draws
 *   - existing / build               → canonTopicState, the panel's own status rule
 *   - in plan                        → the shared Content Plan selection, intersected
 *                                      with THIS slice's topic ids (never the whole plan)
 *   - volume                         → real Semrush keyword volumes, deduped by keyword
 *                                      (max real volume kept — Const I.3, the same rule
 *                                      as the mind map's kwAgg)
 *   - annual volume                  → monthly × 12, arithmetic on the real monthly
 *                                      figure; labeled as such wherever it is printed
 *   - per-segment topic counts       → buildCanonTopicSegmentMap, the v7.170/v7.247
 *                                      exclusive word-overlap partition every panel and
 *                                      the Assessment PDF already use (labeled a modeled
 *                                      attribution per Const I.5a)
 *
 * No React, no DOM — importable by a route.
 */

import { canonTopicState, buildCanonTopicSegmentMap, SHARED_BUCKET } from './segments';

export interface SummaryTopicLike {
  id: string;
  parentName: string;
  parentType?: string;
  product?: string;
  umbrella?: string;
  pageUrl?: string;
  pageKind?: 'existing' | 'net-new';
  totalVolume: number;
  keywords: Array<{ keyword: string; searchVolume: number; position: number | null; isGap: boolean; origin?: 'footprint' | 'demand' }>;
}

export interface SummaryUmbrellaRow {
  name: string;
  volume: number;        // deduped real monthly volume
  categories: number;
  topics: number;
  existing: number;
  build: number;
  inPlan: number;
}

export interface JourneySliceSummary {
  lobs: number;          // umbrellas (product lines)
  categories: number;
  topics: number;
  existing: number;
  build: number;
  inPlan: number;
  volume: number;        // deduped real monthly volume
  umbrellas: SummaryUmbrellaRow[];
}

export interface JourneyRollupSegment {
  id: string;
  label: string;         // "Segment A"
  name: string;          // "The Yield-Chasing Saver"
  topics: number;
}

export interface JourneyRollup {
  topics: number;
  categories: number;
  monthlyVolume: number;
  annualVolume: number;  // monthlyVolume × 12
  segments: JourneyRollupSegment[];
  shared: number;        // topics attributed to more than one / no single segment
}

/** The persona fields the summary card + PDF print — stored segment research, read as written. */
export interface SummaryPersona {
  label: string;               // "Segment A"
  name: string;
  tagline?: string;
  volumePct?: number;          // modeled share of real demand (Const I.5a)
  personaImageUrl?: string;
  demographics?: string;
  trigger?: string;
  influencerRole?: string;
  touchpoints?: Array<{ stage: string; description: string }>;
  messagingAndTone?: string;
}

/** What the panel hands the Journey-map PDF: exactly the block it is showing. */
export interface JourneyPdfSummary {
  kind: 'segment' | 'rollup';
  persona?: SummaryPersona | null;   // kind 'segment'
  slice: JourneySliceSummary;        // the segment's slice, or every topic for 'rollup'
  rollup?: JourneyRollup | null;     // kind 'rollup'
}

/** The umbrella a topic belongs to — the SAME read the mind map makes (stored path[0], else its category). */
export function umbrellaOfTopic(t: SummaryTopicLike): string {
  return (t.umbrella && String(t.umbrella).trim()) || t.parentName || '(uncategorized)';
}

function categoryOf(t: SummaryTopicLike): string {
  return t.parentName || '(uncategorized)';
}

/** Deduped real volume over a set of topics: each keyword counted once at its max real volume. */
export function dedupedVolume(topics: SummaryTopicLike[]): number {
  const m = new Map<string, number>();
  for (const t of topics) {
    for (const k of t.keywords ?? []) {
      const key = String(k.keyword ?? '').toLowerCase().trim();
      if (!key) continue;
      const v = Number(k.searchVolume) || 0;
      if (v > (m.get(key) ?? -1)) m.set(key, v);
    }
  }
  let s = 0;
  m.forEach(v => { s += v; });
  return s;
}

function isExisting(t: SummaryTopicLike): boolean {
  return canonTopicState(t) === 'existing';
}

/** Summary of one slice of the journey (a segment's topics, or every topic). */
export function summarizeJourneySlice(topics: SummaryTopicLike[], planIds: ReadonlySet<string>): JourneySliceSummary {
  const byUmb = new Map<string, SummaryTopicLike[]>();
  for (const t of topics) {
    const u = umbrellaOfTopic(t);
    const arr = byUmb.get(u);
    if (arr) arr.push(t); else byUmb.set(u, [t]);
  }
  const umbrellas: SummaryUmbrellaRow[] = Array.from(byUmb.entries()).map(([name, ts]) => {
    const existing = ts.filter(isExisting).length;
    return {
      name,
      volume: dedupedVolume(ts),
      categories: new Set(ts.map(categoryOf)).size,
      topics: ts.length,
      existing,
      build: ts.length - existing,
      inPlan: ts.filter(t => planIds.has(t.id)).length,
    };
  }).sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name));

  const sum = (f: (r: SummaryUmbrellaRow) => number) => umbrellas.reduce((s, r) => s + f(r), 0);
  return {
    lobs: umbrellas.length,
    // a category is counted inside its umbrella (the table's rows sum to the tile)
    categories: sum(r => r.categories),
    topics: topics.length,
    existing: sum(r => r.existing),
    build: sum(r => r.build),
    inPlan: sum(r => r.inPlan),
    volume: dedupedVolume(topics),
    umbrellas,
  };
}

/**
 * The all-journeys rollup: total topics/categories/volume and how the topics split
 * across segments. Segment counts + shared always sum to `topics` (exclusive partition).
 */
export function summarizeJourneyRollup(
  topics: SummaryTopicLike[],
  segments: Array<{ id: string; name?: string }>,
  segTok: Array<{ id: string; toks: Set<string> }>,
  segmentLabelAt: (i: number) => string,
): JourneyRollup {
  const bucket = segTok.length ? buildCanonTopicSegmentMap(topics as any, segTok) : new Map<string, string>();
  const counts = new Map<string, number>();
  for (const t of topics) {
    const b = bucket.get(t.id) ?? SHARED_BUCKET;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const monthlyVolume = dedupedVolume(topics);
  const catKeys = new Set(topics.map(t => `${umbrellaOfTopic(t)}\u0000${categoryOf(t)}`));
  return {
    topics: topics.length,
    categories: catKeys.size,
    monthlyVolume,
    annualVolume: monthlyVolume * 12,
    segments: segments.map((s, i) => ({ id: s.id, label: segmentLabelAt(i), name: s.name ?? '', topics: counts.get(s.id) ?? 0 })),
    // with no segments there is no partition — every topic is unattributed, and the UI hides the split
    shared: segTok.length ? (counts.get(SHARED_BUCKET) ?? 0) : 0,
  };
}

/** "23.6M" / "480K" / "18K" / "950" — the panel's volume format, shared with the PDF. */
export function fmtSummaryVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}
