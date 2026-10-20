# v7.572 — Audience segments can be rebuilt from the keywords in scope (2026-10-20)

Wayne, after Refresh Analysis + Categorize now on Citi (travel cards): *"and the audiences and journeys are still the same"*.

- **Cause.** Synthesis writes the segments from the whole footprint (every client and competitor keyword) in parallel with categorization, before any Keyword Selection boundary applies. A refresh therefore can never narrow them. After the refresh the live project had The Loyal Cardholder 45% / The Credit Builder 30% / The Points Optimizer 25%, and two of the three had 0 topics in a travel-only scope.
- **Fix.** New `/api/projects/[id]/audience-segments`. It runs the SAME segment pass (`generatePersonas`, unchanged prompt) over the canonical in-scope pool (`buildKwPool`: client and competitor keywords, PAA from in-scope SERPs only), then the same portrait pass as a second call. It writes only `_audienceSegments` / `_audienceSegmentsScope` with `jsonb_set`. An empty model reply keeps the old segments. The project read names its columns (II.9).
- **UI.** Audience Journeys shows an amber notice when the segments were not built on the current selection, with **Rebuild segments for current scope** (two steps, live progress and time left, IV.2). Afterwards it shows "Segments built on N in-scope keywords · date" with a Rebuild link.
- **Verified.** `tsc` clean, `next build` clean, suite 3,615 PASS with the same FAIL set as v7.571. +10 v7572 checks. The v7554 Journey render harness caught a crash when the status call returns no segments list; fixed before release.
