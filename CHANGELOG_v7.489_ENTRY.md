# v7.489 — the Journey panel prints (2026-09-11)

> Wayne: *"lets add a pdf export of the journey panel so we can visually see the journey"*

## What shipped

A **PDF** button beside the umbrella picker on the Journey mind-map. It exports the
whole journey — **every umbrella in the current scope**, not just the one on screen —
as a landscape Letter report you can read, mark up or hand to a client.

Each umbrella gets:

- **An "At a glance" page** — umbrella → categories only, the whole product line on one
  sheet, every category still carrying its real volume and its real topic count.
- **Journey map pages** — the full umbrella → category → topic tree, exactly as the panel
  draws it: status-outlined topic boxes with EXISTING / BUILD badges, real Semrush volume,
  and each node's Content-Plan checkbox state.

A cover page opens the report with the totals (umbrellas, categories, topics, existing,
to build, in Content Plan), a legend, and a scope statement that says out loud what the
report does and does not cover.

## The rule this release is built on

**The report is the panel's picture, not a second drawing of the same data.** The mind-map's
geometry moved verbatim to `lib/journey/mapLayout.ts`; the panel and the export now call the
*same* `buildMindLayout`, and the route renders the objects the panel POSTs. It re-queries
nothing and re-derives nothing (Const II.6a — a rollup READS a metric, it never re-derives
one; the same discipline as the v7.378 delivery package and the v7.482 usage report).

Proven, not asserted: the rendered SVG geometry is **byte-for-byte identical** before and
after the move, and a retained check compares every box the screen drew against its
coordinate in the report.

## Printing a tree that is taller than a page

A single umbrella can run 6,500px deep. Three things make that print honestly:

1. **A page never slices a box.** Breaks are computed from the *merged* vertical spans of
   every box, so a category node — which sits centred across a topic gutter — can't be cut
   in half. (It was, until the straddle check caught it.)
2. **A branch is never orphaned.** A parent that sits above the fold is re-pinned at the top
   of its own column, dashed and marked CONTINUED, so every page names the branch it belongs
   to. Two off-page parents stack rather than overlap.
3. **Rows spread evenly.** Pages are balanced across the exact page count needed, so the last
   page is never left holding one lonely box.

## Scope, stated on the cover

The export follows the panel's journey scope (All / Product / Pre-product) and its segment
lens, and draws **every branch fully expanded** — collapsing is a reading convenience for a
scrolling canvas, and a report that silently dropped a collapsed branch would be worse than
no report. The scope statement says exactly this.

## Files

- `lib/journey/mapLayout.ts` (NEW) — the shared geometry, moved verbatim out of the panel.
- `lib/pdf/journeyMapTemplate.ts` (NEW) — `buildJourneyMapHTML`; its own warm-paper `:root`
  (an app token would resolve to nothing in Chromium and fill black — the v7.467 class of bug).
- `app/api/reports/journey-map/route.ts` (NEW) — zod-gated pure serializer → Chromium → PDF
  bytes streamed back inline (no public blob copy of a client's content strategy).
- `components/brief/JourneySection.tsx` — the button, the export handler, and the layout memo
  now calling the shared builder.

## Verification

Real `next build` ✓ (route registered dynamic) · project `tsc --noEmit` clean, no target
override · rendered geometry byte-identical to v7.488 at 91 topics · a real PDF generated
end to end through the production Chromium recipe (18 pages, 554 KB, two umbrellas, 118
topics) and read page by page · retained suite **2766 PASS / 31 pre-existing FAIL, zero
regression delta** vs pristine v7.488 · **42 new checks, 3 with explicit negative controls**
(a dropped box, a duplicated ghost, a box nudged off its window — each must fail, and does).

Downstream review (Const II.6a/II.6b): this release changes **no metric** — it adds a surface
that prints values the panel already computed — so the Assessment PDF's journey sections
(Part IV audience & journey, the content-footprint roll-up) were traced and are unaffected.
The new surface ships with its own report, which is the point of it.
