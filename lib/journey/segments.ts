/**
 * lib/journey/segments.ts — v7.376
 *
 * The audience-segment attribution block (v7.170 exclusive word-overlap partition),
 * MOVED VERBATIM out of components/brief/JourneySection.tsx so server code — the
 * assessment-report route — attributes topics to segments with the EXACT function
 * every panel uses (Const II.7). JourneySection re-exports these names, so
 * SegmentLens and all other consumers are untouched. NO LOGIC CHANGES.
 */

// Structural slice of the panel's AudienceSegment — only the fields the
// attribution reads (the stored _audienceSegments rows carry all of them).
export interface SegmentLike {
  id: string;
  name?: string;
  tagline?: string;
  volumePct?: number;
  whoTheyAre?: { demographics?: string; trigger?: string; influencerRole?: string };
  preLLMPrompts?: string[];
  productPrompts?: string[];
}
type AudienceSegment = SegmentLike;

export const SHARED_BUCKET = 'shared';
export const SEG_STOPWORDS = new Set([
  'with','from','that','this','have','your','what','when','will','they','their',
  'about','after','before','near','want','need','looking','search','searches',
  'more','some','very','into','over','than','then','them','also','just','like',
]);
export function segWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => w.length >= 4 && !SEG_STOPWORDS.has(w));
}
export function segmentLanguage(seg: AudienceSegment): string {
  return [
    seg.whoTheyAre?.trigger ?? '',
    seg.whoTheyAre?.demographics ?? '',
    seg.whoTheyAre?.influencerRole ?? '',
    seg.tagline ?? '',
    ...(seg.preLLMPrompts ?? []),
    ...(seg.productPrompts ?? []),
  ].join(' ');
}

// v7.247: build the per-segment token sets once (a segment's own audience language).
export function buildSegTokens(segments: AudienceSegment[]): Array<{ id: string; toks: Set<string> }> {
  return segments.map(seg => ({ id: seg.id, toks: new Set(segWords(segmentLanguage(seg))) }));
}

// v7.247: attribute an arbitrary string of audience language to ONE persona bucket
// (a segment.id) — or SHARED_BUCKET when nothing matches OR several tie. This is the
// SAME exclusive word-overlap mechanism the demand journey has used since v7.170:
// real overlap against each persona's actual language, never a modeled split. Factored
// out so the canonical Journey view can re-slice cluster topics per segment too.
export function bucketForText(text: string, segTok: Array<{ id: string; toks: Set<string> }>): string {
  const words = segWords(text);
  let bestScore = 0;
  let bestIds: string[] = [];
  for (const st of segTok) {
    let score = 0;
    for (const w of words) if (st.toks.has(w)) score++;
    if (score > bestScore) { bestScore = score; bestIds = [st.id]; }
    else if (score === bestScore && score > 0) bestIds.push(st.id);
  }
  return bestScore > 0 && bestIds.length === 1 ? bestIds[0] : SHARED_BUCKET;
}

// v7.353: the ONE canonical-topic → segment attribution, shared by every read site
// (Const II.7). This panel's per-segment slice AND the Content Map / Content Plan /
// Scope segment lens (SegmentLens.tsx) all call THIS function, so a topic lands in
// the same bucket on every panel. The signal is the topic's own real language — its
// category path name, its product label and its keyword text — scored against each
// segment's own audience language via the v7.170 exclusive partition. Never a
// modeled split; ties and no-matches go to SHARED_BUCKET.
export function buildCanonTopicSegmentMap(
  topics: Array<{ id: string; parentName: string; product: string; keywords: Array<{ keyword: string }> }>,
  segTok: Array<{ id: string; toks: Set<string> }>,
): Map<string, string> {
  const m = new Map<string, string>();
  if (!topics || !topics.length || segTok.length === 0) return m;
  for (const t of topics) {
    const text = [t.parentName, t.product, ...t.keywords.map(k => k.keyword)].join(' ');
    m.set(t.id, bucketForText(text, segTok));
  }
  return m;
}


// ── canonTopicState — MOVED VERBATIM from JourneySection (v7.376) ─────────────
// The panel's optimize-vs-build rule: a topic is 'existing' when the client has a
// ranked footprint keyword OR a mapped page; else 'competitor' when rivals hold
// gap volume; else 'missing'. Typed structurally so the panel's
// CanonicalJourneyTopic and the canonical Topic both fit.
export type CanonNodeState = 'existing' | 'missing' | 'competitor';
export function canonTopicState(t: {
  pageUrl?: string;
  keywords: Array<{ keyword: string; searchVolume: number; position: number | null; isGap: boolean; origin?: 'footprint' | 'demand' }>;
}): CanonNodeState {
  const fp = t.keywords.filter(k => k.origin !== 'demand');
  const clientRanked = fp.filter(k => !k.isGap && k.position !== null);
  const compVol = t.keywords.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0);
  return (clientRanked.length > 0 || !!t.pageUrl) ? 'existing' : (compVol > 0 ? 'competitor' : 'missing');
}

// ── v7.376: journey lane rule (same predicate the Journey panel applies) ───────
// A topic is PRE-PRODUCT when it is a 'problem' cluster OR a missing-demand
// cluster seeded by a deep-journey problem head term (Const III.2a / III.2a-ii).
// Verbatim match of the inline rule in JourneySection's CanonicalJourneyView /
// JourneyMindMap / journeyLaneSummary — factored here so the assessment report
// classifies lanes with the identical predicate.
export function isPreProductTopic(
  t: { parentType: string; parentName: string },
  problemSet: Set<string>,
): boolean {
  return t.parentType === 'problem' ||
    (t.parentType === 'demand' && problemSet.has((t.parentName || '').toLowerCase().trim()));
}
