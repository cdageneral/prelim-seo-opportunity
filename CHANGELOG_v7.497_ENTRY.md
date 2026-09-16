# v7.497 — Insights decision block: bounded, and stored with the narrative (2026-09-16)

Follow-up to v7.496, measured on the live Sono Bello project the moment v7.496 was deployed
(Wayne: *"yes go ahead"* on the fix).

## What was measured (live, 2026-09-16)

- `GET /api/projects/{id}/insights-panel` took **19.2 s** on a cold open and **7.7 s** warm; the
  `?job=1` poll took 195 ms. The panel sat on "Loading stored insights…" for the whole of it.
- The response was **647 KB**, of which the v7.496 `decision` block was **847 KB serialised**
  (pre-compression): `plays` = **897 competitor rows** (every occupant of the SERP ladder, 722 KB)
  and each standing row carried a **620-brand** ranked list (`standing.search` 87 KB, `.ai` 28 KB).
- The route rebuilt all of it on every open: the bare project row loaded **twice**
  (`db.query.projects.findFirst` in the route and again inside `buildContext` — Const II.9a), the
  17 MB analysis loaded once, the pool rebuilt, the decision recomputed.
- The POST pushed the same 847 KB into the generation prompt beside the census. The census is
  capped at 28 K chars; the decision block was deliberately uncapped in v7.496 and its size was
  never tested at real scale (Phase 3 "real scale" — missed). At ~250 K tokens a Sono Bello
  regenerate would have overrun the model's context before writing a word.

## What changed

- **`lib/insightsPanel/decision.ts` — the serialised lists are bounded AFTER the field maths.**
  `BRANDS_SHOWN = 10`: each standing row lists its top 10 brands plus the client wherever it sits
  (`brandsShown` says how many); `of`, `fieldAvg`, `best` and `clientRank` are still computed over
  **all** measured brands first — the cut touches only the list that rides in the response.
  `PLAYS_SHOWN = 12`: `plays` is every **tracked** competitor plus the 12 other brands holding the
  most page-1 volume; the new `playsBasis {measured, withPage1, tracked, shown, rule}` states the
  cut in words so no surface — panel, PDF, prompt, claim gate — mistakes the list for the field.
  On the suite fixture (40 SERP occupants + 2 tracked, client ranked 33rd) the block is 16 KB;
  the live Sono Bello figure is recorded in the verification below.
- **`lib/insightsPanel/computed.ts` (new) — the block is stored with the narrative.** At save time
  both paths stamp `insights.computed = { schema:'v7.497', builtAt, analysisId,
  analysisTriggeredAt, decision, coverage }` — the exact block the number gate and the standing-
  claim gate verified the narrative against (`makeComputed` on the same context the generation
  read). `readComputed` reads it back defensively (a v7.496 blob, no blob, or a malformed block
  → none). Helpers live in `lib/` because an App Router route module may export only its handlers
  (the v7.401 trap). Blobs are stamped `schema: 'v7.497'`.
- **`app/api/projects/[id]/insights-panel/route.ts` — GET reads, it does not rebuild.**
  Named columns only (Const II.9a): the blob, its stamps, the benchmarks, the job row and
  `profoundData` (the quadrant's input) — never the bare project row. With a stored block: return
  it, and compare its `analysisId` to `latestAnalysisIdWithSnapshot()` (the ONE selection rule
  every route uses, v7.445) so `decisionBasis.stale` says when a newer scan exists. Without one
  (never generated, or generated before v7.497): the live rebuild as before, reported as
  `decisionBasis.source = 'live'`. The `?job=1` poll withholds the blob while a run is in flight
  (the panel reads only `job` then). The prompt tells the model the lists are bounded and where
  the full counts live (`playsBasis`, `brandsShown` of `of`).
- **`components/brief/InsightsSection.tsx`** — a provenance line under the standing tables:
  *stored* ("computed {when} from the scan of {date} and stored with these insights"), *stale*
  (amber: "A newer scan exists — regenerate insights to recompute on it"), or *live* ("computed
  now from the current scan; generating insights stores them"). When a run finishes — stream
  `done` or poll `done` — the panel adopts the block the new blob carries (decision, coverage,
  provenance) without a reload. The playbook shows the `playsBasis` rule as its basis line.
- **`app/api/reports/pdf/route.ts` (Const II.6a)** — the Assessment PDF reads the stored block
  when the blob carries one — the same block the panel shows and the narrative was checked
  against — and builds it live on the rows it already loaded only when there is none. The PDF
  template is unchanged: it renders whatever decision it is given.

## What did NOT change

Every standing figure, rank, field average, scenario, local-market row and shift is computed
exactly as in v7.496 — the v7.496 fixture (27 hand-computed expectations) passes unchanged. The
claim gate is unchanged in code; its competitor-name set now comes from the bounded lists, so a
sentence naming a brand outside the top lists is checked as before but without that name's
exemption (the model only sees the bounded lists, so it cannot quote such a brand from `decision`
in the first place). Snapshot history / trends remain a separate release (now v7.498).

## Verification

- Project `tsc --noEmit` on the full clone at live HEAD a96fd246: clean.
- Retained suite (from `orbitiq-v7.496.zip/_verify`, Const V.6) A/B: base **3144 PASS / 31 FAIL**
  → change **3184 PASS / 31 FAIL**; the FAIL set is byte-identical to base (the known baseline —
  Chromium-unavailable theme blocks and the recorded v7.487-era set). **40 new checks**, all
  passing: `v497-src` 13 (named columns, stored block read + compared, both save paths stamp it,
  helpers not exported from the route, cut-after-average ordering, PDF reads stored first, panel
  adopts on both done paths, prompt says the lists are bounded); `v497-bound` 15 (a fixture with
  40 occupants: `of` = 43 over all brands, list = 11 with the client kept at rank 33, best and
  field average computed over the full field, 14 plays = 12 rivals + 2 tracked never dropped,
  smallest occupant cut, block 16 KB, `makeComputed` → JSON → `readComputed` round-trips, a
  v7.496 blob reads as none); `v497-render` 6 × 2 themes (stored / stale / live provenance
  lines, playbook basis, and a finished job's block adopted — new play figures + new provenance
  — without a reload). One v7.496 check amended with a dated note (schema stamp v7.496 → v7.497).
- `next build`: see the version log for the exit status recorded at packaging.
- Live (after deploy): GET timing and `decision` byte size on Sono Bello are measured and recorded
  in the version log — the number this release exists to change.

## Constitution

No amendment. II.9 (named columns, one blob-bearing row) is now met by this GET; II.6a is met by
the PDF reading the stored block; I.5 by the provenance/stale line. The live rebuild path keeps
`buildContext`'s own bare project load — a pre-existing II.9a debt shared with Seer, noted for a
later sweep, not silently widened here.
