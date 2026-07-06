# v7.353 — Audience-segment lens on Content Map, Content Plan & Scope

**2026-07-06 · Segment association carried forward (Const II.7, I.1, I.3, I.5, IV.6, V.5, V.6)**

## What was asked
Wayne: the Audience Journeys panel already ties product categories/topics to
each audience segment — carry that association forward into the Content Map,
the Content Plan and the Scope sheet, so on each panel you can filter by
segment (e.g. pull all of segment A's content into the plan) and see which
segment each topic belongs to. Per-segment export is deliberately deferred to
a later release.

## What shipped

**One attribution, four panels (Const II.7).** The Journey panel's
topic→segment logic (the v7.170 exclusive audience-language partition) is now
an exported function — `buildCanonTopicSegmentMap` in JourneySection — and the
Journey panel itself, the Content Map, the Content Plan and the Scope sheet
all call that ONE function through the new shared `SegmentLens` module. A
topic lands in the same segment on every panel; nothing is re-derived
differently per view.

**Segment filter chips.** Each of the three panels gets an "Audience segment"
chip row (All Segments + one chip per segment, with the persona portrait and a
real row count). Picking a segment narrows the panel to that segment's view;
on the Scope sheet the multi-year roadmap narrows too. All summary cards
recompute through the shared `scopeOf` rollup, so every number is an exact sum
of the rows shown (Const I.1).

**Shared topics show under every segment (Wayne's call, 2026-07-06).** A topic
whose language matches several segments (or none) sits in the partition's
Shared bucket. Rather than hiding it from every individual segment view, it
appears under EACH segment, tagged "Shared" — so no segment view misses
content relevant to it. Views can overlap; nothing is ever summed across
segment views (no double counting, Const I.3), and every topic appears in at
least one view (Const I.5).

**Segment tags on every row.** Content Map, Content Plan and Scope rows carry
a small tag naming the topic's segment (or "Shared"), using the same three
accent tones the Journey segment boxes rotate through.

**Workflow glue.**
- Content Map: a new "Select all shown (N)" control in the selection bar — one
  click pushes everything the current filters show (e.g. all of segment A)
  into the Content Plan as a single idempotent save, instead of ticking rows
  one by one. "Unselect all shown" reverses it.
- Content Plan: with a segment chip active, "Add to Scope" scopes exactly the
  slice you're looking at.

**Honest gaps (Const I.5).** The chip row only renders when the analysis
carries audience segments AND canonical topics; the pre-canonical fallback
plan renders exactly as before.

## Verification (Const V)
Real-project `tsc --noEmit` on the full live clone with the project's own
tsconfig — clean, no target override (V.1a). Retained regression suite run A/B
against pristine v7.352 base: retained delta ZERO; 270 PASS including 19 new
v7.353 checks (attribution parity with the Journey partition, exclusive +
Shared view semantics, exact scopeOf rollups, jsdom interactive render of the
chip row / row tags / bulk select in BOTH themes, token both-theme definition
audit). The only FAILs are the 13 known pre-existing esbuild-alias harness
artifacts, identical on base (dated note in the suite).

## Files
- `components/brief/SegmentLens.tsx` — NEW: shared segment lens (attribution
  wrapper, plan filter, tags, chip bar).
- `components/brief/JourneySection.tsx` — export `buildCanonTopicSegmentMap`;
  the panel's own per-segment slice now calls it (no behavior change).
- `components/brief/ContentPlanSection.tsx` — segment chips + row tags +
  segment-aware Add to Scope; ContentExplorer learns `topicSeg` /
  `onBulkSelect`.
- `components/brief/ContentMapSection.tsx` — segment chips + row tags + bulk
  select-all-shown.
- `components/brief/ScopeSection.tsx` — segment chips + row tags; roadmap
  narrows with the filter.
