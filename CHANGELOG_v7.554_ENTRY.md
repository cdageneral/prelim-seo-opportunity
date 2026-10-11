# v7.554 — Journey panel: segment "Journey & Content Gap" summary + all-journeys rollup (2026-10-11)

Wayne: *"in the journey panel - i want to add something like this when i click on a user's journey … i know exactly
what is needed for each journey segment. then at the all journey level we should have the summary information."*

- **Segment selected → Journey & Content Gap.** Persona card on the left (portrait, share of volume, tagline, who they
  are, wake-up call, influence & validation, path to purchase, messaging — the stored segment research, read as
  written) and on the right six tiles — LOBs · Categories · Topics · Existing pages · To build · In Content Plan — over
  one row per umbrella (volume, categories, topics, existing, build, in plan). Rows sum exactly to the tiles.
- **All Segments → rollup.** Total pages required in all product journeys (topics across N categories, existing vs to
  build), total annual and monthly search volume, and a card per segment plus "Overlapping segments"; the cards sum
  to the total.
- **One builder, three surfaces.** `lib/journey/segmentSummary.ts` feeds the panel, a new page in the Journey-map PDF
  (segment page or rollup page, after the cover) and a new **Journey & Content Gap** page in the Assessment PDF
  (II.6b — continuation pages when a project has more than 12 product lines; nothing capped).
- **Data basis.** Topics/categories/existing/build are the canonical topics the map already draws (same segment
  partition every panel uses — labeled a modeled attribution, I.5a). Volume = real keyword volumes, **each keyword
  counted once** (I.3). Annual = monthly × 12, labeled. "In plan" = THIS segment's topics in the Content Plan.
- **Fix riding along.** The Journey-map PDF cover's "In Content Plan" tile printed the whole plan's size above a table
  whose in-plan column counted only the drawn scope; it now sums its own rows (II.6a).
- Verified: project `tsc` clean; real `next build` clean; retained suite zero delta (49 pre-existing FAILs identical to
  pristine v7.553; the v7552-render "measured median ETA" check is a pre-existing ~50% timing flake on base AND head,
  measured 4×4); +150 new v7554 checks (real JourneySection render in both themes against a hand tally, both PDFs,
  dual-theme contrast on all three surfaces, source guards). Light + dark screenshots reviewed.
- Files: lib/journey/segmentSummary.ts (new), components/brief/JourneySegmentSummary.tsx (new),
  components/brief/JourneySection.tsx, lib/pdf/journeyMapTemplate.ts, app/api/reports/journey-map/route.ts,
  lib/pdf/assessmentTemplate.ts, package.json.
