# v7.496 — Insights becomes a decision panel (2026-09-16)

Wayne, on the Sono Bello Insights panel: *"its saying how strong it is in search but yet when you
actually look at the rank data — they are virtually invisible … I'm not looking for more data
stats — I need real insights on what is happening to the brand, what are their high level problem
areas and key opportunities. What the competitors are doing successful. Are there any local markets
that have more demand than others … where the brand should invest, what impact would it have if it
did abc, what is holding them back from becoming a market leader and if they could achieve market
leader status what traffic or incremental gains could it have."*

## The defect

The stored thesis opened *"Sono Bello owns search rank in its core procedures"* over a weighted
average position of 32.0, 4.2% of ranked volume in the top 3 and a 6th-of-12 page-1 click
capture. Root cause: the v7.471 engine received raw panel previews (`clientFootprintRows: 8273`,
the content-coverage table) but never the Keyword panel's rank headline or any field comparison.
It had to dig with tools, ran out of turns, and wrote what it found first. The number gate
verified every digit — "owns" is not a digit — and the v7.471 "benchmark your adjectives" rule was
a request, not a check (the v7.463 lesson, recurring).

## What changed

- **`lib/insightsPanel/decision.ts` — precomputed decision inputs.** Pure TypeScript over the SAME
  shared bases every panel reads (Const II.6a / II.7): `computeSov` (lib/sov/model), the v7.492
  rival rank map + `accumulateLadder`, the Product Insights shared rows, the Local panel's
  classifier + share-of-local-voice builder, the stored SERP scan.
  - **Standing** — the brand vs the **field average** vs **best-in-class**, traditional search
    (page-1 click capture · modeled/labeled, page-1 volume held, top-3 volume held, weighted
    position · client-only) and AI visibility (Profound named %, citations, LLM-probe rate,
    cited-domain leaders), overall and **per product line**, each with rank-of-N and one standing
    word: leads / above / below / last / unmeasured. A brand with no rows on a measure is absent
    from it, never scored zero (I.5).
  - **Scenarios** — modeled incremental clicks/mo, floor → ceiling, for: match the best-ranked
    rival (market-leader parity), positions 4–10 → top 3, page 2 → page 1, take open demand a
    rival already holds; plus the AI Overview citation move with **measured volume only** (no click
    curve exists for AI answers and none is invented). Computed on the ONE approved CTR curve
    (Const I.5a / Art. IX — same constant Share of Voice uses; volumes and positions are stored
    rows, only the multiplier is modeled). Every surface labels it **modeled estimate**.
  - **Competitor plays** — per rival: page-1 / top-3 volume and rank on the landscape, lines won
    and lines absent, page-1 query mix (cost/pricing, local, reviews/results, comparison,
    informational, core), page types from **real uploaded URLs** (null when none — never guessed),
    keywords the brand outranks them on and vice versa, map-pack standing, AI presence.
  - **Local markets** — demand by city from geo-modifier keywords (real Semrush volume,
    client-relevance gated), the brand's hold and best position per city, the strongest rival per
    city, and map-pack standing from the stored Local scan (best rank, leaders, reviews); near-me
    demand summarised separately.
  - **Shifts** — AI Overviews / PAA on scanned SERPs, AI-answer presence. `history: null` with the
    note that OrbitIQ stores one snapshot per analysis — no trend is implied.
- **The engine reasons instead of digging.** The decision block rides beside the census as its
  own grounded payload (never truncated by the census cap), and the prompt is rewritten around the
  CEO questions. The blob is restructured: **situation · what is holding the brand back (with
  mechanism + evidence) · key opportunities (sized) · where to invest (order + modeled gain) ·
  path to market leader (what the leader holds, the gap, modeled gain at parity, what has to
  change) · competitor playbook (kept: doing well / vulnerable / key stat) · local markets · market
  shifts**. Rules added: STANDING IS THE BENCHMARK, MODELED IS LABELED, NO TRENDS, REASON DON'T
  RECITE. `max_tokens` 4000 → 8000. Stored blobs are stamped `schema: 'v7.496'`.
- **`lib/insightsPanel/claimGate.ts` — the standing-claim gate (machine-enforced).** A sentence
  that asserts the brand's **strength** on search or AI is rejected unless its computed standing
  there has a measure at leads/above; a **weakness** claim is rejected when every measure is
  leads. Client mention must precede the phrase, any competitor mention must follow it,
  negations and aspirational phrasing ("to become the leader", "if it wins") are exempt, and
  content coverage is deliberately not gated. Runs beside the number gate on BOTH answer paths
  through one `verifyDraft`; a violation is a repair message naming the sentence and the
  standing; after the repair budget the draft is discarded, never stored (fail-closed, v7.463).
  The Sono Bello sentence above is rejected by the gate's own retained check.
- **The panel** (`InsightsSection.tsx`) is rebuilt as a decision panel: the situation hero;
  standing tables for **traditional search and AI visibility side by side** with rank-of-N chips;
  the per-line table (demand, your page-1 volume bar, rank, field avg, best-in-class, AI answers
  naming you, AI Overviews citing you); holding-back cards with an evidence line; investment order
  beside the **scenario bars** (floor → ceiling, today vs leader for scale); path to market leader;
  opportunities; the playbook with each rival's **measured play** under its name; local markets as
  city bars with page-1 marker, map-pack state and strongest rival; market shifts with the
  no-time-series note. Standing and scenarios render deterministically **before** any narrative
  exists. Quadrant, coverage table and benchmarks are collapsed under **Supporting data**. A blob
  stored by the v7.471 engine still renders, labeled *previous engine*, with a regenerate prompt.
- **Assessment PDF (Const II.6b, same release).** Five designed pages — The situation (+ standing
  tables + per-line), What is holding the brand back (+ where to invest + scenarios table), Path to
  market leader (+ opportunities), The competitive playbook (unchanged design), Local markets &
  market shifts — plus Named vs cited as before. The route builds the decision inputs on the SAME
  Seer basis via the new `assembleContext` from rows it already loaded (no second analysis load,
  II.9). Legacy blobs render their v7.471 pages, labeled.
- **`lib/seer/core.ts`** — `buildContext` split into queries + `assembleContext` (byte-identical
  body); Seer behaviour unchanged.

## What did NOT change

- No Constitution amendment needed: the scenarios extend the I.5a labeled-model exception exactly
  as the Exec value-at-stake did; the curve stays in `lib/sov/model.ts`. Snapshot history for
  trends is a separate release (v7.497) and will carry its own dated amendment (a metric ledger,
  not a pool copy — II.7).
- II.9: no query was added or changed. The insights GET still loads one project row + the Seer
  context as in v7.471; the PDF route's queries are untouched.
- The Delivery package and PPT prompt still do not read the insights blob (the v7.471 Wayne call).

## Verification

Real `next build` exit 0; project `tsc` clean. Retained suite: base **3003 / 31** → change
**3144 / 31**, FAIL set byte-identical. **139 new checks**: 30 source-level (both gates on both
answer paths, decision payload as its own grounded block, prompt rules, shared-basis imports with
no re-declared CTR values, history null, PDF route on the same Seer basis, legacy render paths),
12 claim-gate cases on the real module (the Sono Bello sentence rejected; "trails X, which leads",
"leads content coverage", "to become the market leader", "strongest rival", negations and
conditionals allowed), 27 decision-builder checks on a hand-computed fixture (page-1/top-3 sums
per brand from uploaded rows + Semrush rivals + SERP occupants, exact CTR deltas, the 0-hold line
reading LAST not unmeasured, AI rows UNMEASURED with no data, query mix, page types only from real
URLs, local demand/pack/leader/reviews, near-me separated, AIO counts), 23 × 2 dual-theme jsdom
renders of the REAL panel (new blob, legacy blob, decision-only, nothing — no NaN/undefined), and
11 × 2 contrast checks computed from both `:root` scopes (one dated allowlist: the panel-wide
c-55557a column-head convention in dark). Two v7.471 checks amended with dated notes (badge text;
supporting data opened before reading the quadrant/coverage/benchmark rows).
