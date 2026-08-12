## v7.427 — Warm Paper: the light theme rebuilt for the eyes, and made the default

**Wayne:** *"can we rework the light color scheme. For whatever reason it feels hard on my eyes
like i am struggling to see the contrast."*

**The diagnosis.** The v7.185 light mode paired pure-white cards with a near-white cool page
(#F2F3F8) and borders so faint (#E3E4EE) they read as nothing. That combination is glare without
structure: the eye gets full-brightness surfaces but no edges to lock onto. Three candidate
palettes were rendered side-by-side on the Product Insights panel (Soft Slate / Warm Paper /
Dim Mist — `GEO/orbitiq-light-theme-variants-2026-08-12.html`); Wayne chose **Warm Paper**.

**What changed — neutrals only.** Every neutral in the `[data-theme="light"]` token block moved
warm: the page is parchment (#F2F3F8 → #F0EDE5), cards are ivory (#FFFFFF → #FDFCF8 — **no pure
white surface remains anywhere**), the surface tone sits one honest step deeper than the card
(#F7F5EF, restoring the dark theme's surface/card hierarchy that light mode had flattened),
borders firmed to a visible warm gray (#E3E4EE → #D9D4C6, #BCBED0 → #C9C3B2), and all four ink
levels warmed (#17182B → #2B2A30, #4C4D67 → #5C594F, #6E6F88 → #767061, #313252 → #44413A) — each
chosen so its contrast on the new ivory card is parity-or-better with what the old ink read on
white (tertiary: 4.80:1 vs 4.89:1; primary 13.9:1). The Tailwind `--orbit-*` channel triplets
moved in lockstep so class-styled and token-styled surfaces cannot diverge.

**What deliberately did not change.** The accent trio (#4338CA / #3730A3 / #474195), every signal
ink (green/amber/red/cyan) and every alpha wash tied to them are byte-identical — the v7.400 gate
asserts the accent literally and the signal inks sit at exactly 4.50:1 worst-case, so "warming"
them would have meant weakening them. `--on-fill-accent` stays pinned #FFFFFF in both blocks
(v7.400 rule: a colour on a fill does not follow the page surface). **The dark theme is untouched
byte-for-byte.**

**Light is now the default.** The no-flash script in `app/layout.tsx` and `ThemeToggle` both
default to light; a stored `orbitiq-theme` choice still wins, so anyone who explicitly picked
dark keeps dark.

**The gate got stricter, not looser.** The dual-theme contrast gate now composites light-mode
pairs over the real ivory card (#FDFCF8) instead of an idealized #FFFFFF: 364 resolvable pairs
re-checked, the light theme still carries **zero** allowlisted debt, and 11 new retained checks
pin the Warm Paper values, the no-pure-white invariant, the dark-block freeze, and the light
default. Real-project tsc clean, real `next build` clean, retained suite zero regression delta
against the pristine v7.426 base, and both themes' computed values verified in real Chromium
(jsdom cannot resolve `var()`).

## v7.426 — Product Insights: search and AI visibility, finally in one place

**Wayne:** *"We need to know whats strong, whats weak, where the competition is winning and the
ultimate goal is to know what to action… We need to connect SEO and AI visibility together."*

**The new panel.** Keyword Landscape now has a third view — **Product Insights**, between Keyword
list and Theme clusters. Every top-level product category is always visible with its search
strength and AI answer visibility measured side by side: monthly demand, share of demand on page 1
(with the same measured brand ladder the Category Breakdown uses — no click model), the in-app AI
probe scores, and a **Connection** readout showing exactly where AI lags search or search lags AI.
Expanding a product opens the crosswalk: every topic with your best rank and ranking page next to
the category's AI visibility, classified by fixed rules into **Ranks · absent in AI** (your
cheapest AI wins — the authority already exists), **Dual presence**, **AI only**, or **No
presence**. The thresholds behind those verdicts are printed on the panel.

**Recorded AI answers — a second, verifiable AI lens.** A new "Scan recorded AI answers" action
pulls real recorded ChatGPT and Google AI Overview answers for each product category from
DataForSEO's LLM Mentions index: the actual questions, which brands the answers name, and which
sources they cite. The panel shows who owns the citations in your categories and your owned
citation share — direct counts from recorded answers, stored on the project so every device and
user sees the same scan, with the scan time stamped on the panel. Each category reports how many
recorded matches exist and how many were fetched, and a failed pull is reported and retryable —
never stored as "no answers".

* Cost honesty: the scan's cost is the measured per-task amount DataForSEO reports, recorded on
  the API Usage ledger under its own "LLM mention requests" unit with the list price kept only as
  a cross-check.
* DataForSEO's `ai_search_volume` on recorded questions is that vendor's **estimated** metric — it
  is labeled EST everywhere it appears and is never presented as measured demand.
* The probe basis (5 unbranded Claude + 5 unbranded GPT prompts per category) and the
  recorded-answer basis are shown separately, never blended into one number.
* The panel is a rollup: it reads the canonical pool, stored taxonomy, the stored probe and the
  v7.419 ladder method — nothing re-derived, no existing metric changed, and the Assessment PDF is
  untouched (reviewed per Const II.6a: no downstream surface reads these new metrics yet).

## v7.425 — deleting a keyword now actually removes it

**Wayne:** *"When I click the x to delete a keyword — nothing happens. This should delete the
entire keyword and all panels and data that had this keyword and volume would be updated. All
product category structures need to stay the same."*

**What was wrong.** A keyword can exist in two places at once: an uploaded row in the keywords
table *and* a row inside the stored analysis snapshot (your client footprint, or a competitor's
gap list). The × on a keyword chip hard-deleted the uploaded row — the request succeeded — but the
snapshot copy was untouched, so the keyword was re-supplied on the very next render and the delete
looked like it did nothing. Only keywords sourced directly from Semrush were being removed
correctly, because those alone were written as a "blocked" marker, which is the one removal the
snapshot honours.

**The fix.** Every keyword deletion now writes that marker, whatever the keyword's source, *and*
still hard-deletes the uploaded row when there is one. The marker is applied inside the single
shared pool builder every panel reads, so one write drops the keyword from the Keyword list,
Category Breakdown, clusters, journeys, content map and every volume, demand and rank-band total
at the same moment.

**Your category structures are untouched.** Nothing about the stored taxonomy changes — categories,
their parents, the keyword→category assignments and the full paths all stay exactly as they were.
The keyword simply stops entering the pool, and the numbers above it re-total themselves.

* A removal that fails is now **stated on screen** with the count, instead of failing silently —
  the same class of bug this release fixes.
* Bulk deletes report partial failure honestly ("N of M could not be removed — the rest were").

## v7.424 — the brand ladder opens with the category row

**Wayne:** *"I see the winner chip but I do not see the tracked brands percentage."* — The ladder
was working; it just lived behind a small chip inside a fully-clickable row, so expanding a
category showed the keyword chips and the ladder stayed shut.

* **Expanding a top-level category now opens its brand ladder too**, rendered directly under the
  row and above the keyword chips / sub-rows. One click gives you both the ranked brands and the
  keywords — nothing to hunt for.
* The winner chip remains an **independent toggle**: click it to open the ladder without expanding
  the row, or to close the ladder while the row stays expanded. Its ▸/▾ arrow reflects the real
  state either way, and collapsing the row closes the ladder with it.
* No data or math changed — same measured page-1 volume shares, same sources, same coverage line.

*Numbering note: this work was built as v7.420 against the v7.419 base while a parallel session
shipped v7.420–v7.423. It ships as v7.424 so no two releases share a number, and the v7.420–v7.423
changelog entries a mid-flight push had removed are restored below.*

## v7.423 — one brand name, one client bar

**Wayne, reading the printed report:** *"why is there two American Express listed?"* Two defects in
one figure, both **surfaced by** the v7.420 client fix rather than caused by it — the class of thing
Const II.6a (added yesterday) exists to catch.

### 1. The client bar was appended unconditionally

```
${topBars}${clientBar}
```

Before v7.420 the client resolved to the alias bucket `AmEx` at 0.55% — never inside the top 10 —
so appending a highlighted bar was the *only* way the client appeared in the chart. Once the client
resolved correctly to American Express at #1, the ranked list already contained it and the append
printed **`88.0% · 35,014` twice in one chart**. The client's own row is now highlighted in place,
and the append is kept for the case it was written for: a client that genuinely falls outside the
top 10.

### 2. The internal project label was printed on a client-facing report

`d.clientName` is the project record's name field, and this project is filed as **"Amex (Card
Shop)"**. It was rendering on the cover, in **every page footer**, the HTML document title and four
body sentences — including *"Amex (Card Shop) appears in 88.0% of them"* — while the bar beside it
read "American Express", because that one line already used the resolved brand. The two disagreed
on the same page.

v7.420 stopped the project name **driving** the numbers. Nothing had stopped it being
**displayed**. A project may be named anything; the report speaks the brand the export's own
`mentioned?` column identifies, and falls back to the project label only when no client resolves at
all, so a report is never left nameless (I.5).

### Verification

Real `tsc` clean; real `next build` compiled. Retained suite A/B against pristine v7.422: FAIL set
byte-identical (19 pre-existing). **5 new v7.423 checks**, all passing, driven through the real
`buildAssessmentHTML` with the project deliberately named "Amex (Card Shop)" — asserting the client
is drawn once when in the top 10, still drawn once when outside it, that the project label appears
zero times, and that a no-client analysis still falls back to a name.

Both failing first drafts of those checks were **my measurement, not the code**: counting the brand
name caught the cover and captions too, and a fixture whose engine and topic tallies equalled the
client total made the value label ambiguous across three charts. Fixtures must make the thing under
test uniquely identifiable.

## v7.422 — the PDF report was still on the old denominator

**Wayne:** *"does the pdf report reflect all of the recent changes?"* It did not. Good question,
and my miss: v7.420 changed how the panel derives visibility, and Const II.6 says every rollup
reading that metric changes in the SAME release. The Assessment PDF did not.

### What was wrong

`buildAssessmentHTML()` computed its own figure:

```
const pfVisPct = pf.clientHits / pf.totalRuns * 100
```

`totalRuns` is the whole file (42,111). The panel divides by `scoredRuns` (39,780). So the PDF
printed **83.1%** on the same analysis where the screen printed **88.0%** — the exact
vendor-vs-OrbitIQ divergence v7.420 was written to end, recreated one layer up in the artifact the
client actually receives.

The citation figure was worse than stale, it was **arithmetically impossible**: v7.421 moved owned
share onto the categorised denominator (13.3%), but the PDF still captioned it
"43,874 of 447,134" — 13.3% of 447,134 is 59,469. The percentage and its own caption disagreed.

### The rule, enforced

A rollup may **READ** a metric. It may never **RE-DERIVE** one. The template now reads the panel's
denominators (`scoredRuns`, `citeCategorised`) and falls back to the stored whole-file basis only
when they are absent — so an analysis saved before v7.420 still renders on the basis it was
actually computed with, rather than being retroactively re-scored. Ten sites corrected: the
executive tile, the AI-visibility page lede and tile, the Share-of-Voice figure title, the citation
supply-chain lede and figure title, and the scorecard rows. The uncategorised count is disclosed
wherever the citation denominator appears.

The direct-evaluation sentiment tile needed no change — it reads `isClient` off the stored brands,
so v7.421 fixed it here for free. Re-run the analysis and it appears in the PDF too.

### Verification

Real `tsc` clean; real `next build` compiled. Retained suite A/B: FAIL set byte-identical (19
pre-existing). **9 new v7.422 checks**, all passing, driven through the REAL `buildAssessmentHTML`
with Wayne's actual numbers — asserting the rendered HTML contains 88.0% and no longer contains
83.1%, that the citation caption divides, and that a pre-v7.420 analysis still renders on its own
basis. No panel or parser code was touched.

## v7.421 — the missing sentiment card, and two citation denominators told apart

**Wayne** re-uploaded all four Profound exports on v7.420 and asked *"is it right?"*. Every one of
the nine cards on screen was right — all reconciled exactly against the raw files. But one card was
**missing**, and it carried the most important finding in the export.

### 1. 24,207 scored direct-evaluation rows were being dropped

The Sentiment export phrases its subjects as full noun phrases —
`Evaluate the Financial services company American Express on rewards`. Keyed on that raw string,
`brandSig()` reduced it to `services american express`, which never equalled `american express`,
so `isClient` was false and the client card never rendered. The rest of the panel matches brands
with `brandIn()` (subset), which *would* have matched: two different brand-identity functions in
one file — the same class of defect as the v7.420 AmEx split, in a different corner.

What was hidden:

| Direct evaluation | Scored rows | Mean (0–1) |
|---|---|---|
| Bank of America | 4,512 | 0.881 |
| Discover | 4,005 | 0.854 |
| Chase | 4,573 | 0.815 |
| Capital One | 4,250 | 0.783 |
| **American Express** | **6,867** | **0.728** ← worst of five |

American Express leads every visibility metric in this export (88.02%, #1 of 8, 0 topics at 0%)
and rates **last** when an engine is asked to evaluate it directly. Absence of a card was reading
as absence of a finding.

Eval subjects now resolve onto the panel's own brand vocabulary — roster first, then every brand
named anywhere in the visibility export, longest token match wins. That last part matters: scoping
it to the roster alone left off-roster evaluated brands (Bank of America, Discover — real brands,
merely outside the top-7 SoV roster) still wearing the raw prompt wording, mixing two naming
conventions in one column. If two different wordings ever resolve to one brand, a notice says so
rather than silently reading only the larger.

### 2. A blank citation category was being relabelled as the real category "Other"

`(row[category] || 'Other')` folded the **116,547** sources Profound shipped with no category into
`Other`, a category it genuinely assigns to 50,786 others. Absence is not a value (Const I.5).
Blank now renders as its own `Uncategorised` row.

### 3. Owned citation share is now over categorised sources

Counting uncategorised rows in the denominator treats "unknown" as "not owned". Owned share moves
from **9.8%** (43,874 / 447,134) to **13.3%** (43,874 / 330,587). The card names the basis and the
excluded count on screen, so the moved number is never silent.

### 4. The two citation cards name their source

They read *different files* — 664,282 citation cells in the platforms export vs 447,134 rows in the
citations export. Side by side with unlabelled denominators they read as one contradictory
universe. Each card now names the file it came from.

### Verification

Real project `tsc` clean; real `next build` compiled successfully. Retained suite A/B against
pristine v7.420: FAIL set byte-identical (19 pre-existing). **16 new v7.421 checks**, all passing,
driven by fixtures at real scale carrying the real noun-phrase wording and the real 447,134-row
category mix. Dual-theme SSR render clean; no new colour tokens (`text-orbit-accent`,
`text-rose-500` already ship 7× and 11×).

Two of those checks failed first and caught real defects rather than confirming intent: the
roster-only resolver (fixed by widening the candidate pool) and a fixture that never named
Bank of America in the visibility export, so there was genuinely nothing to resolve it to.

## v7.420 — AI Visibility: the client comes from the data, and one Profound denominator

**Wayne:** *"when I import the visibility export out of profound and into Orbit I am getting
different visibility scores. Why?"* — Profound showed American Express at **88%**; OrbitIQ showed
**0.11%**. Then: *"the name of the project should have nothing to do with anything. I can call a
project burnt toast if I want to."*

Two independent defects, both reproduced exactly from the 42,111-row export.

### 1. The client was identified from the PROJECT NAME

The export carries two surface forms: `American Express` (35,014 answers) and an alias bucket
`AmEx` (171). `matchClient()` scored the project name against the roster, so a name carrying the
token "amex" bound the client to the alias bucket — and reported **0.11%** (1 of 873) while naming
American Express the *top rival* at 98%. Both wrong figures reproduce to the decimal.

`matchClient()` is **deleted**. The client is now derived from the export's own `mentioned?`
column, which is Yes exactly when the client appears. Scoring every brand's presence against it
identifies the client with no naming input: **American Express agrees on 42,111 of 42,111 rows
(100.0000%)**; the runner-up (Chase) reaches 48.83%. A brand must clear 95% agreement, so no wrong
brand can win. Profound does not alias `AmEx` to the client either — the 5 answers naming AmEx
without American Express are all `mentioned?=No` — so OrbitIQ no longer does.

If the column is absent, **no client is resolved** and the panel says so. A 0% that means "unknown"
reads as "absent", which is a false statement about the client (Const I.1/I.5b — automatic
DETECTION, never an automatic GUESS). The project name is never read.

### 2. The denominator did not match Profound's

Profound excludes answers where the engine named **no brand at all** — 2,331 of 42,111 (5.54%),
generic replies that recommend nobody. Including them was the entire remaining gap:

| | Profound | v7.419 | v7.420 |
|---|---|---|---|
| American Express | 88% | 83.15% | **88.019%** |
| Citi | 27% | 25.53% | **26.998%** |
| Chase | 43.3% | 41.03% | 43.431% |
| Capital One | 34.2% | 32.51% | 34.294% |
| Delta | 16.4% | 15.54% | 16.453% |

Every visibility percentage on the page — headline, per-engine, Share of Voice, topic whitespace —
now uses that one denominator, stated on screen. The panel no longer carries a second methodology.

**The v7.380 strict `type == 'Visibility'` basis is retired.** It reconciled on the 2026-07-27 US
Bank export but is not a durable rule: on this export it selects 873 of 42,111 answers (2%) and
reads 17.41%, with Delta at 0.23% against a dashboard 16.4%.

### Known residual

Chase, Capital One and Delta land 0.05–0.13pp above the dashboard. Every platform, date, type and
a dedupe pass were swept; no filter in this export reproduces all five bars at once (best fit 3/5),
and each brand solves to a slightly different denominator (39,778–39,909). Most likely the
dashboard's competitor list is computed on a marginally different window than its chart — the
export's final day is partial. **No correction factor was added to close it.**

### Verification

Real project `tsc` clean; real `next build` compiled successfully. Retained suite A/B against
pristine v7.419: FAIL set byte-identical (19 pre-existing, all local-ui/localpack). Five checks
amended with dated V.6 notes, none deleted; **13 new v7.420 checks**, all passing, driven by a
42,111-row fixture built in the shape that broke the old code — both surface forms present, 2,331
no-brand answers, and a deliberately meaningless project name ("burnt toast"). Dual-theme SSR
render clean. No new colour tokens: the changed lines reuse `text-orbit-secondary` and
`text-rose-500`, which already ship 21× and 11× in v7.419, so IV.6 has no new surface.
Real-Chromium contrast measurement did not run — the Playwright CDN is unreachable from this
sandbox.

## v7.419 — Category Breakdown: rank-band columns, winning brand per category, checkbox actions

**Wayne:** *"On the right hand columns lets remove the share, and avg position. Lets add a column
before the page 1 column that would be ranks 1-3 … then page 2 volume and then page 3+ volume. I
would also like to somehow add a way to see which brand is winning share within that category both
from tracked competitors and untracked competitors. Then we should have a check box in front of
each category … delete the category and all data updates accordingly (however it can NOT lose the
category association like it does right now) … or download them into an excel file or move them
into the content plan."* — All of it ships in this release.

### The columns

* **Share and Avg Pos are gone.** In their place the table reads left to right as a rank ladder:
  **Annual Demand · 1–3 · Page 1 · Page 2 · Page 3+ · Keywords**. Each band cell is the exact
  arithmetic rollup the stacked bar already renders (the same `vol[]` bands — one source, no forked
  math), annualized on the panel's existing convention. Page 1 stays the 1–3 + 4–10 sum it has
  always been. The Overall row sums the same bands, and a rank-bucket filter now *dims* the
  non-selected band columns instead of re-filtering numbers that are inherently band-scoped.

### Who is winning the category

* **Every top-level category row carries a winning-brand chip** — the brand holding the largest
  *measured* page-1 volume on that category's own keywords. Purple = you, cyan = a tracked
  competitor (their real positions from the CSVs you uploaded), amber = an untracked SERP rival
  (Semrush-discovered organic competitors — the same two sources the Share-of-Voice panel reads,
  so the stories reconcile). Click the chip for the **full brand ladder**: page-1 volume, share of
  category demand, and per-brand rank-data coverage, so a thin competitor upload reads as a data
  gap, not a weak brand. No CTR model anywhere in this table — measured volume only.

### Checkbox actions — and the delete that finally keeps structure intact

* **Each category row has a checkbox** (plus a select-all). Selecting categories opens an action
  bar with three bulk actions:
  * **Delete (hide)** — the category disappears from *every* panel and *every* total, and the
    numbers everywhere update accordingly. But unlike the old destructive delete, **nothing is
    removed from the stored taxonomy**: keyword–category associations stay exactly as written
    (Const II.8), because the hide is a read-time filter at the single `buildKwPool` chokepoint
    (the same pattern as the scope gate). A **"N hidden" chip** on the table header opens the
    restore list — one click brings a category back exactly as it was, with the keyword count
    recorded at hide time and the hide date. Hides are matched by the *stored path key*, so a
    collapsed display row still hides exactly its own subtree.
  * **Download Excel** — one .xlsx of the selected categories' real keyword rows: category,
    keyword, monthly + annual volume, client position, rank band, origin, branded flag, competitor.
  * **Move to Content Plan** — pushes the selected categories' canonical topics into the shared
    Content-Plan selection using the clobber-safe read-modify-write from v7.372, so selections made
    in other panels are never overwritten. The outcome line states exactly what happened: how many
    topics were added, how many were already there, and how many keywords have no canonical topic yet.
* The destructive trash icon now lives on **sub-level rows only** (fine-grained keyword removal is
  unchanged); category-level delete is the restorable checkbox flow above.

### The content-plan wipe (2026-08-01 incident) — closed

* The v7.362 orphan-heal could silently PUT an empty selection over a real one (TD Bank went
  33 → 0 with no user action). The heal is rebuilt with the three guards it lacked: it only acts
  once the topic set has **settled** (seen identical twice — "non-empty" is not "settled"); it has
  a **floor** — a prune that would remove more than 20% of the selection, or reach zero, is never
  persisted and is *surfaced* as an on-panel notice instead; and the write is a **read-modify-write**
  that removes only the orphaned ids from the fresh server set. On top of that, the content-plan
  PUT route now retains **one backup generation** (`content_plan_selections_prev`) before every
  replace, so the last write is always undoable.

### Verification

Real project `tsc` and the real `next build` both clean. Retained regression suite re-run A/B
against the pristine v7.418 base: zero delta (the same 19 pre-existing findings, byte-identical),
plus **52 new v7.419 checks** covering the pool chokepoint (path-key subtree hide, segment-boundary
safety, flat-name fallback, `_categoryBreakdown` never mutated), the routes/schema/ensureColumns,
the heal guards, and the panel UI. Real-Chromium dual-theme render of the reworked table: **68
checks, 0 failures** — every new element legible in both light and dark, band cells verified to
the exact fixture sums. Dated amendment to the v7.271 checks records the trash-icon scope change;
nothing was deleted to pass.

## v7.418 — user groups: grant projects to a team in one move

**Wayne:** *"In the orbit admin panel I need to be able to add a group and then assign members to
that group. Then when I create a new project I need to be able to allow that project to be seen by
a group, a user or multiple users and groups."* — Both halves ship in this release.

### Groups in the admin panel

* **New Groups tab** in Admin → Users & Access: create a group by name, then open its Manage drawer
  to rename it, toggle members on and off, toggle which projects the group can open, or delete it.
  Deleting a group never touches the members' accounts or any direct grants they hold — they only
  lose the access the group provided.
* **A group carries no role of its own.** Membership widens *which* projects a user can see; what
  they can do there still comes from their individual editor/viewer role. Owners and admins see
  every project regardless, so grants (direct or via group) only ever matter for editors and viewers.
* **The Users tab now shows group membership** — a user's row lists their direct project chips and,
  alongside them, a chip for each group they belong to, so access is legible in one place.
* **Every group change is a real audit event** (`group.create` / `group.update` / `group.delete`)
  and the Activity Log renders them by name.

### Access at project creation

* The **New Project modal grows a "Who can see this project" section** (admins only — it hides
  itself for anyone whose roster request is refused): toggle chips for each group and each
  grantable editor/viewer. Selections are applied server-side immediately after the project row is
  created, additively — nothing existing is ever removed by creating a project.
* **The creator keeps their own project.** When enforcement is on and an editor creates a project,
  they are auto-granted access to it — previously the project would have vanished from their own
  dashboard the moment it was created.
* Access for an existing project stays editable any time: per-user in the Users tab drawer
  (unchanged) and per-group in the new Groups tab drawer.

### How the access wall reads groups

* The project list and the per-project access check now honor **direct grants ∪ group grants** —
  a project granted to any group you belong to opens exactly as if it were granted to you.
* Admin per-user grant edits still diff against **direct grants only**, so saving a user's toggles
  can never silently strip access they hold through a group.
* Three new tables (`user_groups`, `user_group_members`, `project_group_access`) are created at
  runtime exactly like the other auth tables — idempotent `CREATE TABLE IF NOT EXISTS`, unique
  indexes against duplicate rows, `ON DELETE CASCADE` from users, groups and projects. No manual
  migration step; behaviour with the auth flag off is unchanged (open access).

### Verification

Real project `tsc --noEmit` clean and a real `next build` clean. Retained regression suite re-run
A/B against the pristine v7.417 base: **zero regression delta** (PASS and FAIL sets byte-identical;
the 19 failures are the documented pre-existing suite bit-rot), plus **38 new v7.418 checks** all
passing. Dual-theme render executed in real Chromium against the project's own compiled Tailwind:
26 contrast checks across the Groups tab, the user-row group chips and the modal access section,
0 failures — 4 sub-threshold dark pairings are byte-identical reuses of pairings that already ship
at the base commit (recorded in a keyed allowlist with HEAD proofs, per the v7.400/v7.417 pattern).

## v7.417 — the AI Answer panel reads Profound's new sentiment column

**Wayne:** *"I am uploading the sentiment csv file for the AI answer panel and it says it shows
nothing but the csv file has data - did something change in the profound export?"* — Yes. Profound
changed the export, and the panel was built on a column that no longer exists.

### What was actually wrong

Four of the five exports were fine and needed no change: Responses, Platforms, Prompt Volume and
Citations all resolve every column OrbitIQ asks for. The Sentiment export does not. The per-brand
`sentiment_claims` column — the ONLY input "Net sentiment by brand" and "Client sentiment by theme"
were ever built from — is absent from all five files. It carried the brand label and the theme label
per claim; both are simply not in the data any more, so those two charts cannot be rebuilt from this
export by any parse. The panel was behaving correctly; it just said so in a way that read like a bad
upload rather than a vendor change.

### What ships instead

`sentiment_v2_score`, the sparse 0–1 scalar Profound now ships, is parsed and rendered:

* **Two separate readings, never blended.** Direct-evaluation prompts ("Evaluate &lt;Brand&gt; on
  &lt;topic&gt;") and brand-agnostic open answers are different populations — 0.55 and 0.95
  respectively on the current export. Asking an engine to *evaluate* a brand invites criticism;
  listing it in a roundup does not. A single average would describe neither, so they get two cards
  and no code path merges them.
* **Client sentiment by topic, by engine and by run date**, with every bucket showing its own
  scored-row count. Nothing is truncated (I.6).
* **Absence is never zero.** A brand with evaluation rows but no scored rows renders "—", not 0.00 —
  Profound scores the client's rows and almost none of its competitors', and a 0.00 would assert
  damning sentiment the export never measured (I.1 / I.5). A blank cell parses to `null`, not 0;
  `Number('')` is 0 in JavaScript, which would have turned 3,013 blank rows into fabricated
  zero-sentiment rows.
* **The score is never renamed.** Profound does not define the scale in the file, so no surface
  calls it a percentage, a positive share or a claim count. It is shown as the 0–1 score it is (I.1).
* **The notice now explains itself** — it names the removed column, names the replacement, states
  the real coverage (268 of 3,281 rows, 8.2%) and says the metric is client-only, so a vendor change
  can no longer be mistaken for a bad file.

### Also fixed

* **Profound appends a one-cell "Filters — …" trailer** to four of its five exports. Older parses
  never noticed because each keys off a required column the trailer lacks, but a row counter counts
  anything — the coverage denominator read 3,282 against a file with 3,281 data rows. Now guarded by
  a structural `isDataRow` test that survives a reworded or localised trailer.
* **The PDF reads the same figure (Const II.6).** The assessment report's sentiment page printed
  "No sentiment claims in this dataset" while the panel showed a number. It now renders the client's
  score and its by-topic breakdown when claims are absent, and branches on `null` rather than
  printing a zero.
* **The `sentiment_claims` path is retained, not deleted.** An export that still carries claims — or
  an analysis already saved from one — parses and renders exactly as before. An export carrying both
  shows both.

### Verified

Real project `tsc` clean and a real `next build` clean (V.1a). Retained suite **1168 pass / 21
pre-existing / zero regression delta**, with **94 new checks** including a full-scale parse of the
real 3,281-row export and a dual-theme render in real Chromium. The v7.379 `sentiment_claims` check
was **amended with a dated note, never deleted** (V.6).

---

## v7.416 — Search demand: the whole prompt, paged, and copyable

The "Search demand — top prompts" card rendered each prompt through the shared `<Bar>` row,
whose label is a fixed 160px `truncate` cell. Prompts are whole sentences, so every row showed
about five words and an ellipsis — "How can I use savings acco…". The card named the top
questions buyers ask and then hid what they were.

Three changes, all in `components/brief/ProfoundVisibilitySection.tsx`:

- **The prompt gets its own line.** A dedicated row (`DemandPromptList`) puts the full prompt on
  a wrapping, full-width line with its share on the right, and moves the bar beneath it with the
  topic label. Nothing truncates. There is no nested scroller: paging bounds the card's height
  and the page provides the one vertical scroller (Const IV.1) — an inner `max-h` scroll context
  clipped rows mid-sentence, which is the defect this release exists to fix.
- **Paging.** The card opens at 12 rows exactly as before, then offers "Show N more" (12 at a
  time) and "Show less". A footer states "Showing X of Y", and says plainly when the stored set
  is a subset of the export. The metrics blob previously kept only the top 12 prompts, so a
  load-more control would have had nothing to load; it now stores up to `DEMAND_PROMPT_STORE_CAP`
  = 200, still a direct unrounded tally of the uploaded prompt-volume export (Const I.1).
  Analyses saved before this release carry 12 rows and say so honestly rather than pretending
  to hold more.
- **Copy to clipboard.** An icon button in the card's top-right corner (new optional `action`
  prop on `Panel`; panels that pass no action keep their exact previous markup) copies every
  loaded prompt as TSV — rank, prompt, share, topic — with the shares exactly as parsed, nothing
  re-rounded. Inline SVG, not a glyph font. `navigator.clipboard` with a `execCommand` fallback,
  and the button reports success or failure back to the reader.

Verified: project `tsc --noEmit` clean under the repo tsconfig; retained regression suite
1030 PASS with zero delta against the pristine v7.415 base (21 pre-existing failures unchanged),
plus 31 new v7.416 checks driving the real compiled component in jsdom — paging forward,
collapsing, exhausting the set, the clipboard payload, and dual-theme colour parity. Rendered
in light and dark.

## v7.415 — The local insights become one panel instead of three striped boxes (2026-08-05)

**Wayne, looking at the Local page:** *"can we clean up the insights into a single box and remove the harsh vertical color bars, but make it all look visually appealing"*

**What was actually wrong.** `InsightBanner` was built in v7.366 to follow the exec `SignalCard` convention: an inset card with a 3px accent bar down its full left edge. That reads fine for **one** sentence. `InsightStack` renders N of them, and the Local page fires three at once — so the page opened with three separate boxes, three separate borders and three full-height amber slabs stacked down the left margin. The color was doing no work there: every one of the three findings is `tone: 'watch'`, so the bars carried no information and only competed with the numbers inside the sentences, which are the part a client is supposed to read.

**The new frame — `InsightPanel`.** One bordered card with a titled header ("What the local scan says" · N findings) and hairline dividers between rows. Tone is now carried by a 7px dot with a soft halo at the start of each row and by the emphasized figures in the sentence itself, which were already accent-colored. The evidence line moved from its own line below the sentence up to the right end of the kicker row, so each finding costs three lines instead of four and the provenance still sits beside the claim it backs.

**No sentence changed.** This is a frame swap and nothing else: `InsightPanel` receives the same `Insight` objects from the same pure rules in `lib/insights.ts`, over the same scan rollups, and renders every sentence, every emphasis span, every evidence string and every `data-insight` id verbatim. A null insight still contributes nothing and an all-null list still renders literally nothing rather than an empty box (Const I.5). The kicker is the one thing displayed differently — `Diagnosis · Presence, not performance` now shows the type muted and the subject accented, instead of the whole string in accent — because reading three lines of solid uppercase amber was part of what made the old stack shout.

**Scoped to the Local page on purpose.** Seven other panels — Keywords, Journey, Theme Clusters, Content Plan, Google SERP, SERP Features, Profound — import `InsightBanner`/`InsightStack`, and most of them render a **single** insight, where the left-bar convention is not the problem Wayne described. Both legacy exports are untouched and the suite now asserts they still render exactly as before, so nothing outside the Local page moved. Both Local insight sites were converted: the three scan findings and the empty-state teaser.

**Verified.** Real project `tsc --noEmit` clean and a real `next build` clean (V.1a). The panel was server-rendered in **both themes** against the real token values parsed out of `globals.css`, and every color pair measured: dark body 16.66:1, muted 5.50:1, watch accent 8.75:1, signal accent 10.40:1; light body 17.47:1, muted 8.19:1, watch 5.57:1, signal 5.61:1 — and the divider deliberately gated to the 1.05–3.0 band so it stays a hairline rather than becoming the slab this release removes. Before/after was rendered in Chromium in both themes and looked at. Retained suite **1000 pass / 22 pre-existing / zero regression delta** against the pristine base — the identical failure set, verified by diff — with **45 new v7.415 checks**, including one that fails if `border-left` ever reappears in the panel and one per finding asserting its sentence survives the reframe byte-for-byte.

**Stated gap (I.5):** the suite carried forward is the v7.414 baseline, whose 22 pre-existing failures include the Local-panel esbuild-alias artifact and the two `v397src` checks that v7.408/v7.409 changed by design. They are left failing and annotated rather than edited, for the same reason v7.414 gave: amending another session's checks would assert an intent this session did not verify.

## v7.414 — The Local Search page gets a donut, a real star rating, and findings that read as findings (2026-08-05)

**Wayne:** *"Lets show the donut graphic for the local visibility index. Lets enhance the review or reputation card. Show the avg star rating rather than just saying 3. Show 3 stars out of 5 and call out the review rating not just reputation. Also on the qty of locations after the review buckets - label it that its 161 locations and 705 locations. Also bring in these insights into the report but visually display them better than just stacked boxes."*

**The star has never rendered — and that is why the card said "3".** Since v7.374 this report has printed `&#9733;` beside the local review rating at four separate sites. The PDF is rasterised by `@sparticuz/chromium` inside the Vercel lambda, whose bundled font set carries no U+2605 and has no fallback face, so the glyph resolved to **nothing at all** — not even a tofu box. Every one of those four sites has therefore been shipping a rating with an invisible star to clients for forty releases. The second half of the same bug was numeric: `avgRating` is rounded to one decimal by `buildReviewRollup`, and a weighted mean of exactly `3` stringifies as `"3"`, so the card read `3` where it meant `3.0 out of 5`. Wayne saw both halves at once and described them as one symptom. **Ratings now render as an inline SVG path** (`svgStar` / `STAR_PATH`) that depends on no font and draws identically in the lambda, a browser and print, and **every rating site goes through `toFixed(1)`**. A retained check now fails the build if the entity ever returns — comment-stripped first, because this release's own comment quotes the entity while explaining the ban (the v7.402 comment-scanning lesson).

- **The Local Visibility Index is a donut, and it now explains itself.** The score sits in an SVG arc, and beside it the **four weighted inputs that produce it** — pack presence 40%, rank quality 25%, review rating 20%, listing completeness 15% — each as its own 0–100 score. `buildLocalIndex` has computed those four parts since v7.177 and the report had never printed them, so the index arrived as a bare number a client could not interrogate. Nothing new is calculated: the parts are read from the same rollup the panel renders (Const II.6/II.7), and the page still says in words that the 40/25/20/15 weighting is an editorial choice, not a hidden model.
- **"The reputation gate" is now "Review rating — the reputation gate"**, with the value as `3.0 / 5`, a five-star row filled to the real fraction, and the weighted-review-count basis stated beside it.
- **The review buckets say what they are counting.** `161`, `705` and `179` are counts of **locations**, and now read `161 locations`. The three bands take an ordinal blue ramp (dark → light) so the ranking is visible without asserting a health judgement the scan does not measure.
- **The three local findings move from a stack of full-width callouts into one row of cards**, each with a tone rule, its kicker, the sentence from `lib/insights.ts` verbatim, and its evidence line — which the callout form had been discarding entirely. The row's column count follows the number of findings that actually fired, so a single finding never renders as a third of a row.
- **The rating card no longer implies the whole estate is rated.** v7.410 made `rating == null` mean either "never looked up" or "looked up, no profile exists", and `buildReviewRollup` counts only rated locations. The card now names the population it describes — "across all 1,045 locations" when they match, "across 300 of 1,045 locations" when they do not — and a scan with **no** ratings prints the gap in words instead of "0 of 1,045" above three empty bars (Const I.5).

**Verification.** Real project `tsc --noEmit` clean and a real `next build` clean (V.1a). Retained suite **954 pass / 21 pre-existing / zero regression delta** against the pristine base — the identical failure set, verified by diff — with **20 new v7.414 checks**. The page was rendered in Chromium at real scale (1,045 locations, 300 keywords, 179 packs) and **measured**: content bottom 878px against a footer at 997px, 119px of slack, no overflow. Six edge cases were rendered and asserted — two findings, one finding, partial rating coverage, zero ratings, and a single-location estate — all fit and all degrade honestly. Two new colours were measured for contrast and corrected before shipping: the star gold at 2.22:1 moved to `#b07d10` (3.53:1) and the ramp's lightest bucket bar at 1.77:1 against its own track moved to `#4a86cd` (3.30:1).

**Stated gap (I.5):** the retained suite carried forward here is the v7.405 baseline — the newest copy on disk — so it does **not** include the checks added by v7.406–v7.413, which a parallel session holds. Its 21 pre-existing failures include two `v397src` checks that v7.408 and v7.409 changed **by design** (provider misconfiguration now throws instead of falling back; `SERP_PROVIDER` now governs keyword scans only). Those are left failing and annotated rather than edited, because amending another session's checks would mean asserting an intent this session did not verify.

## v7.413 — The SERP panel stops naming the vendor in operational copy (2026-08-05)

**Wayne, looking at the "Scan all 10,158 remaining · ~10,158 credits" button:** *"does this serp fetch call use the new dataforseo api?"* — it does. Then: *"no need to name the api in the UI. just call it an api call - which allows us flexibility to change down the road if need be."*

**What was wrong.** `SERP_PROVIDER=dataforseo` has been live since v7.408, so that button scans through the provider dispatch and files every row as DataForSEO. But the panel's own copy still said **"1 SerpAPI credit each"** in the tooltip and **"Availability combines 5 SerpAPI-scanned keywords"** in the caption. The caption was true only by accident — those 5 rows predate the flip. Running the scan would have filed **10,158 DataForSEO rows under the words "SerpAPI-scanned"**, and quoted the cost in the wrong unit at roughly 4.6× the real rate. v7.408 fixed the badge, the XLSX column and the remediation messages; it missed this panel's body copy.

**The fix Wayne chose is better than the one I proposed.** I was going to plumb the active provider down to the panel so it could name the right vendor. Naming no vendor removes the whole class of bug instead: operational copy now says **"API calls"**, so switching providers can never leave a sentence asserting the wrong source, and there is no client-side provider state to keep in sync. The plumbing I had already written for it was reverted rather than shipped.

Changed: the scan tooltip, the scan button label, the AIO verify label, both stale-refresh labels, the availability caption ("live-scanned" rather than a vendor name), and both in-progress scan labels.

**What deliberately did NOT change: per-row provenance.** The badge on each scanned row and the provenance column in the XLSX export still report the provider that actually produced that row, read from the stored `scannedBy`. That is the audit trail, not operational copy — it is what lets a client-facing number say where it came from (Const I.1), and it stays correct across any future provider change precisely because it is recorded per row rather than assumed. The suite now asserts both halves: no vendor name in operational copy, AND the provenance badge still present and still reading the stored value.

**Verified:** real project `tsc --noEmit` clean and a real `next build` clean (V.1a); retained suite **1004 pass / 19 pre-existing / zero regression delta** with **7 new v7.413 checks**, 5 of which were confirmed to FAIL against the live v7.412 base.

## v7.412 — The review fetch drains; v7.410's merge silently discarded every lookup (2026-08-05)

**Wayne:** *"it keeps timing out and when i restart it seems like it is starting over and then timing out. This has happened 3 times in a row."*

**v7.410 fixed the timeout and introduced a worse bug.** Production logged the same line forty times:

    [OrbitIQ] Per-office review fetch: 150/1045 offices this pass, 150 credits, 895 still pending

The denominator never moved off 1,045. Every pass re-fetched the same first 150 offices and reported the same 895 remaining; the run stopped only because v7.410's `MAX_PASSES` safety cap caught it. Without that cap it would have looped indefinitely.

**Cause — the merge keyed on a field the worker mutates.** v7.410 wrote completed offices back with `new Map(doneRows.map(l => [l.placeId || l.title, l]))`. But the worker does `if (pick.placeId) l.placeId = pick.placeId`, stamping Google's real place id onto the row it just fetched. Offices discovered from the client's KML start with `placeId: ''`, so they key by **title**; after the lookup the same row keys by **`ChIJ…`**. The map was built from the new ids and probed with the old ones, so **zero of 150 rows matched** — not some, zero, which is exactly why the count stuck at 1045 rather than drifting down. Every completed lookup was discarded in memory before the database was ever touched. That is also why there were no errors and no failed-checkpoint lines to find: nothing threw. The write succeeded perfectly, writing nothing.

**Fix — merge by POSITION.** The pending slice is now chosen as indices into `prior.locations`, and `persist()` writes each result back to the index it came from. An array index cannot be altered by anything the worker does to the row. The worker still records Google's real place id — that id is real data worth keeping (Const I.1); only the merge key changed.

**Verified by reproduction, not by reasoning.** `_verify/merge412.mjs` models the real shape (1,045 client offices with empty `placeId`, plus non-client rows) and runs both implementations: the old merge **reproduces the production number exactly — still 1045 pending after three passes** — while the index merge drains 1045 → 895 → … → **0 in ceil(1045/150) = 7 passes**, strictly decreasing, with non-client rows untouched, no rows added or dropped, and the original order preserved. That harness is now a permanent suite test, so this exact regression cannot return silently.

**Verified:** real project `tsc --noEmit` clean and a real `next build` clean (V.1a); retained suite **997 pass / 19 pre-existing / zero regression delta** with **14 new v7.412 checks**. The four source-level checks were confirmed to FAIL against the live v7.411 base — they detect the bug rather than merely describing the fix.

**Still open, unchanged by this release:** `reviewCalls` counts every ATTEMPT, so the "150 credits" in that log line is not a trustworthy spend figure — during the looping runs it attributed ~6,000 searches whose real billing is unknown (SerpAPI serves repeat identical queries from its own cache). Check the SerpAPI dashboard for actual spend. Separately, this route still reads five analyses with all three snapshots in one query — the same shape that made the project GET return Neon's HTTP 507 in v7.411, and worth the same treatment before the snapshot grows further.

## v7.410 — The per-office review fetch is resumable; it could never finish before (2026-08-05)

**Wayne:** *"i have clicked fetch and it starts but doesnt complete"* — 1,045 offices pending.

**It was not slow. It was unfinishable.** The fetch ran all 1,045 Google Business Profile lookups in ONE request at concurrency 5, and wrote to the database exactly once, after the last one returned. At 1.5s per Maps call that is 314s against Vercel's hard 300s cap; a single call hitting the 15s timeout pushed it further. The function was killed mid-flight — and because the only write came at the end, **every completed lookup was discarded along with the ~$9.58 of SerpAPI credits already spent.** Retrying restarted from zero, needed the same 250–550s, and died in the same place. At this location count the button could never succeed, no matter how many times it was clicked.

**Three defects, all of which had to go:**

1. **All-or-nothing write.** Now there is ONE `persist()` helper used by both the mid-run checkpoint (every 25 offices) and the final write, so committed work survives a kill. It also preserves location ORDER — the old `nonClient.concat(updated)` silently reshuffled the table on every fetch.
2. **Unbounded work per request.** Each request now takes at most 150 offices AND stops at a 200s deadline, whichever comes first, then reports `remaining`. The panel continues automatically until pending hits zero (~7 passes for 1,045). The time budget matters more than the count: it adapts to whatever latency SerpAPI is actually returning instead of assuming a rate.
3. **"Pending" could never reach zero.** Pending was derived from `rating == null`, which also counts every office that HAS been looked up and genuinely has no Google Business Profile. Those offices would be re-fetched and re-billed on every single pass, forever — and with auto-continue, the client would have looped indefinitely. New `LocalListing.reviewsFetchedAt` records the ATTEMPT, stamped whether or not a profile was found, so the queue strictly drains.

**A location with no Google Business Profile is now a finding, not a gap** (Const I.5). It reads **No profile** with the lookup date, not "Pending" forever — an unclaimed or unlisted office cannot rank in the map pack, which is exactly the kind of thing the panel exists to surface. A blank rating is still never printed as a zero.

**Interrupted runs tell the truth.** If the stream ends without a completion event, the panel says progress up to the last checkpoint was saved and invites a resume, rather than implying the work was lost.

**Source stays SerpAPI.** Local remains pinned per v7.409 — DataForSEO Maps would be roughly 4.6× cheaper for this job, but its local output has still never been parity-tested, and these ratings go in front of clients.

**Verified:** real project `tsc --noEmit` clean and a real `next build` clean (V.1a); retained suite **983 pass / 19 pre-existing / zero regression delta** with **18 new v7.410 checks**. Two of those are a new **CSS token guard**: this release was written with a "No profile" pill styled using two invented custom properties (`--ca-136-136-170-0_13` / `_25`) that do not exist in `globals.css`. The browser would have dropped the background and border silently — the badge would have looked broken in light mode with `tsc` and the build both passing. The guard now asserts every token the Local panel references is defined, and defined in BOTH themes.

## v7.409 — SERP provider is chosen per CAPABILITY; Local search stays on SerpAPI (2026-08-05)

**Wayne, right after the v7.408 switch went live:** *"if Local panel still needs to use SERPAPI - then use that. We can use both APIs."*

**The problem this fixes.** `SERP_PROVIDER` governed **three** call paths at once — keyword scans (AIO/PAA), Google Maps listings, and the local 3-pack. Only the AIO/PAA path was ever parity-tested against DataForSEO (2026-08-05, `/api/serp-compare`, real client keywords). So the moment `SERP_PROVIDER=dataforseo` went live, the Local Search panel started serving from a provider nobody had compared — an unverified source behind a client-facing panel, which is the case Const I.1 exists to prevent. v7.408 documented this as a known gap; v7.409 closes it.

**Provider selection is now per capability.** `SERP_PROVIDER` selects the **keyword-scan** provider only. Maps listings and the local 3-pack read `localSerpProvider()`, pinned to SerpAPI via `LOCAL_SERP_PROVIDER` in `lib/apis/serp.ts`. Both providers now run side by side, each on the path it has been verified for.

**Why a constant and not another env var.** Two reasons, both I.1. A flag would let local be moved to an untested provider without anyone running the comparison first. And the Local panel's own copy still names SerpAPI in several places ("1 SerpAPI credit per keyword", "Real SerpAPI local results") — those sentences are **true** while local stays pinned, and would become false provenance claims the instant a flag moved it (the v0.24 naming rule). Moving local is therefore a deliberate release: extend `/api/serp-compare` to cover Maps + Local Pack, run it, then change the constant and make the panel's labels dynamic **in the same commit**.

**Verified:** real project `tsc --noEmit` clean and a real `next build` clean (V.1a); retained suite **965 pass / 19 pre-existing / zero regression delta** with **10 new v7.409 checks** (including that there is NO env override for local, and that neither local path still reads the global flag). The v7.397 check asserting all three entry points shared one resolver was **amended with a dated note, never deleted** (V.6) — it still asserts a total dispatch count of 3, so a dropped entry point is still caught, but now across two capability-scoped resolvers.

## v7.408 — DataForSEO becomes the active SERP provider; provider identity is now I.1 data (2026-08-05)

**Wayne:** *"is Orbit using serp api or dataforseo api for the aios and paas"* → *"yes flip the switch"* → (after the parity run came back dirty) *"Flip anyway — cost wins."*

**Numbered v7.408, not v7.406.** This work was prepared while a parallel session shipped v7.406 and v7.407. It was rebased onto `7d30e11` before packaging; `app/api/analyze/route.ts` was the one overlapping file and its edits were re-applied on top of the v7.407 version rather than overwritten from the older base — the same whole-file-revert trap the v7.406 commit message describes, avoided by re-deriving instead of copying.

**What was measured before flipping** (live prod, `/api/serp-compare`, real NYP keywords vs nyp.org, three runs 2026-08-05 00:03–00:06Z). Client rank agreed 100% on comparable keywords; PAA presence agreed 100% — but **that PAA number is not evidence of depth parity**: every keyword returned exactly 4 questions from both providers, so the cap makes presence-agreement trivially true. **AI Overview citation counts differed on 5 of 13 keywords, DataForSEO returning 7.3% fewer overall (123 → 114). `lupus` came back 16 vs 10 (−38%) and REPRODUCED 76 seconds later** — not scrape volatility. DataForSEO also returned nothing at all for one keyword in one run and returned it normally on re-run (a **transient silent empty**), and is **3.7× slower** (2.66 s/kw vs 0.72), extrapolating to ~200 s for a 75-keyword batch against Vercel's hard 300 s cap. It is 4.6–4.9× cheaper. Wayne accepted these deltas deliberately; they are recorded in Constitution v0.24 so the tradeoff stays defendable rather than forgotten.

**The rule this release adds.** A provider is a **data-provenance fact**, so Const I.1 now covers the NAME as well as the number. Prompted by finding ~30 user-facing strings hardcoding "SerpAPI" — including the client-facing XLSX provenance column, the panel's provenance badge, and remediation messages sending the operator to serpapi.com to debug a DataForSEO failure.

- **`serpProvider()` now THROWS on misconfiguration** instead of silently falling back to SerpAPI. The old fallback was invisible: you believed the switch was made, every panel still read "SerpAPI", and the SerpAPI bill kept running. A thrown scan is handled by callers as "SERP data unavailable, keep prior data" — a gap, not a fabrication (I.5). An unrecognised `SERP_PROVIDER` value also throws rather than silently meaning serpapi.
- **One place spells a provider for a user** (II.7): `providerLabel` / `providerBalanceUrl` / `providerUnitLabel` / `activeProviderLabel` in `lib/apis/serp.ts`.
- **Provenance travels PER ROW.** New `KeywordSerpData.scannedBy`, stamped by each provider's own scanner and carried through `FeaturePoolRow` to the badge and the XLSX column. A row scanned before v7.408 carries no `scannedBy` — SerpAPI was the only provider that had ever run at that point, so **absent ⇒ `serpapi` is a fact, not a guess**, and a provider switch never retroactively relabels history (I.1).
- **Remediation messages name the ACTIVE provider.** `serp-scan` and `analyze` no longer hardcode SerpAPI or serpapi.com.
- **README documents `SERP_PROVIDER`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`** — none of the three was documented before — and warns that the flag switches **three** call paths (keyword scans, Maps listings, Local Pack) while only the AIO/PAA path has been parity-tested.

**Known gap, stated (I.5):** Maps listings and Local Pack also switch with `SERP_PROVIDER` and are NOT parity-tested; `/api/serp-compare` does not cover them.

**No I.5b change needed** — v7.397 had already registered DataForSEO as a **measured** cost entry (the real per-task `cost` it reports), still the only measured source in the ledger.

**Verified against the rebased base `7d30e11`:** real project `tsc --noEmit` clean and a real `next build` clean (V.1a); retained suite **955 pass / 19 pre-existing / zero regression delta** with **19 new v7.408 checks** (pristine base runs 935/39 — the extra 20 are this release's own checks plus the amended one, failing as expected against code that isn't there yet); dual-theme jsdom render of the provenance tag (V.5). The one v7.397 check describing the old silent-fallback behavior was **amended with a dated note, never deleted** (V.6). Constitution amended to **v0.24** (DataForSEO admitted to I.1; provenance-naming rule + Art. VIII gate line added).

## v7.407 · The Authority table follows the competitor list again; local search stops falling out of the report (2026-08-05)

**Why (Wayne):** "why is the old competitor list still showing and not the new ones?" and "I dont see any of the local insights coming through the report." Neither was a rendering fault. Both were a read site pointing at the wrong data.

**The Authority table was reading a frozen list.** `projects.authority_snapshot` records the competitors as they stood when the authority scan last ran, and nothing anywhere compared it against the live competitor table. Adding a rival never added a row; deleting one never removed it, so a deleted domain kept printing in the panel, in the PDF and in the delivery package — and could still be the "top rival" driving the gap tiles. One report was printing two different rival sets, because Share of Voice was computed from the live list while Authority came off the frozen one.

- **Reconciled at read time, not by re-scanning.** The crawled index rows are real and are left exactly as measured; the only decision is which of them are still in scope. Rivals no longer tracked drop out of every view. Rivals added since the crawl have no crawled row to show, so they are named — "2 tracked competitors were added after the last authority crawl" — with a re-scan CTA, instead of appearing as blank or zeroed lines. No API units are spent.
- **One reconciler, four read sites** — the Authority panel, the Authority Calculator, the PDF and the delivery package all call `reconcileAuthoritySnapshot` (Const II.6/II.7). Domain matching normalizes scheme, `www.` and case first, because competitor domains are typed by hand.
- **The panel header stops contradicting its own table.** The subtitle counted the live competitor list while the rows below came off the snapshot, so it could read "vs 5 competitors" above four rows. It now counts what is actually in the table.
- **The Authority Calculator was benchmarking against removed rivals.** It declared a `competitors` prop and never used it. It uses it now.
- A caller that supplies no live list still gets the frozen snapshot unchanged, so nothing changes silently for a surface that has nothing to compare against.

**Local search never reached the report because two places disagreed about which analysis row counts.** The local scan wrote to the newest row that merely had a snapshot; the project page — and therefore the PDF, which is handed the page's analysis id — read the newest *completed* row. A new analysis writes its snapshot in Phase 1 and only becomes completed in Phase 2, so an interrupted or abandoned run leaves a newer running row sitting above the completed one permanently. In that state the scan succeeded, the panel kept showing it from its own browser cache, and the report had no local data at all.

- **One shared rule for "which analysis is this project showing."** `pickDisplayAnalysis` is now used by both the page and the local-scan route, so the write target and the read target cannot drift apart again. If the displayed analysis has no keyword data yet the scan refuses and says why, rather than quietly storing itself on a run the report does not open.
- **A new analysis carries the local scan forward.** The SERP snapshot has been carried across a re-analysis since v7.82, but `_localScan` lives inside the keyword-snapshot blob rather than in its own column and was not — so every re-run orphaned the local scan. Carried verbatim; a fresh scan on the new run still wins.
- **A missing local scan is now an honest gap, not a disappearance.** A project with a real local footprint and no scan used to drop the Local page and eight further local fragments with no trace, which reads as a bug rather than as missing data. It now prints a page that says so and lists what the section would contain (Const I.5). Projects with no local component are unaffected — the local-intent test is `buildLocalPackKeywordSet`, the same signal the Keyword panel badges and the Local panel gates on (Const II.7), so nothing is inferred.
- **The Local panel stops masking a server-side absence.** Its browser cache stays (it is what makes a finished scan appear instantly) but a scan that exists only in the browser now says so on screen, with a re-run CTA, instead of rendering as though all were well.

**Verification:** `tsc --noEmit` clean, `next build` clean, retained regression suite 953 PASS / 19 pre-existing FAIL — the same 19, with zero regressions introduced here. 31 new retained checks cover the reconciler, both PDF paths, the analysis-row rule and every wiring site. Both new report pages were rendered and measured for overflow. The amber token behind the two new notices is defined in both themes (Const IV.6).

## v7.406 · Recommended Program becomes a prioritized workstream ladder; uploaded scans stop losing the ranking URL (2026-08-05)

**Why (Wayne):** "we need to be more specific with the prioritization and tactics where we have the recommendation, the details of the recommendation, along with a gauge of the effort and impact overall," then the running order itself: positions 4–20 first, AI Overview and People-Also-Ask coverage second and scoped to those same pages, prompts mapped to those URLs alongside it, net-new builds after that, citations and authority underneath all of it — plus a Local workstream called out separately whenever the project actually has location data.

- **Part V is now a ladder, not a list of steps.** Every row carries the recommendation, the tactic, an effort read and an impact read, and the rows are numbered in the order they should be worked. Rows appear only when the project has the data behind them: the Local row needs real location rows, the AIO/PAA row needs a real SERP-feature scan, the prompt row needs mapped prompts, the build row needs an actual journey gap, and the citation row needs bridge sources. Nothing is printed as a zero.
- **The 4–20 set gets its own page.** Keyword count, distinct ranking URLs, canonical topics and total monthly demand, split across positions 4–5, 6–10 and 11–20, with an 80/20 cut naming how many URLs carry 80% of the demand and how many are deliberately left out of the first pass. The URLs left out are counted and shown rather than quietly dropped.
- **Counted off the shared pool, not a second math path.** `buildProgramData` reads the same `buildKwPool` output the capture metrics and the Journey view read, so the ladder reconciles with the rest of the report instead of telling a slightly different story (Const II.6/II.7). When a footprint has no 4–20 ranks at all the builder returns null and the report falls back to the previous step cards — an empty page of zeroes is never printed (Const I.5).
- **Effort is rated by the kind of work, then sized by volume.** An earlier pass rated it by unit count alone, which made "36 pages to build" look easier than "126 prompts to map." Rewriting 36 pages is not the lighter job and the gauge now says so.
- **Fixed — uploaded scans were throwing away the ranking URL.** `uploadedFootprint.ts` hardcoded an empty string where the CSV's own URL column should have gone, so every upload-sourced snapshot stored a blank URL. That blanked `Topic.pageUrl` and the "Existing URL" export column, and it is why the new 4–20 page had nothing to group by on upload-sourced projects. The column had been populated in the database since v7.251; only the mapper was dropping it. No re-scan is needed — `buildKwPool` §2 already backfills the uploaded URL onto footprint rows that arrived without one.
- **Fixed — the Semrush organic mapper read the wrong header.** It looked for `URL` where that endpoint returns `Url`, and the `?? ''` swallowed the miss silently. The adjacent unique-URL mapper had always read both spellings, which is what gave the typo away.
- **Restored — two Share of Voice sentences clobbered during the v7.405 deploy.** The Part V commits were prepared against a base that predated the v7.405 SoV release and reverted its rewording of the SoV lede and the glossary definition. Both lines are back, byte-identical to the v7.405 release. Nothing else from that release was touched; verified by diffing every file the two ranges have in common.
- **Retained suite: two Share of Voice checks rewritten, not deleted.** They pinned the pre-v7.405 model — denominator frozen to the client footprint, and a competitor with no client overlap treated as an honest gap. The v7.405 release deliberately changed both. The assertions now pin the new intent (the shared denominator is strictly larger; the no-overlap competitor earns a real, non-zero slice) and carry a dated note saying why. The honesty rails they sat next to are untouched and still pass: a competitor with no positions is still an honest gap, and the shares still sum to 100%.
- Footer attribution reads "Provided by iQuanti, Powered by iQ.Impact"; the cover still credits iQuanti alone (Constitution v0.22).

**Verification:** `tsc --noEmit` clean, `next build` clean, retained regression suite 922 PASS / 19 pre-existing FAIL — the same 19 that failed before this work started, with zero delta introduced by any change here.

## v7.405 · Share of Voice measured on the full non-branded keyword landscape; uploads keep the BEST rank; competitor coverage probe (2026-08-04)

**Why (Wayne):** "the SOV is calculated against the total keyword footprint of non-branded keywords. So its the same keyword data against all brands and where each brand lies against it … an even playing ground." Two data bugs surfaced on the way: duplicate CSV rows were collapsed last-occurrence-wins (row order, not rank, decided the stored position), and competitor-only keywords never entered the SoV denominator at all.

- **SoV denominator redefined (lib/sov/model.ts; Constitution amendment v0.23, supersedes v0.11).** The basis is now the full non-branded keyword landscape — client footprint ∪ competitor uploaded keywords ∪ demand universe, minus branded rows. Every brand (client, uploaded competitors, SERP rivals) is scored on the same keywords, volumes, and GrowthSRC 2025 curve. Competitor-only keywords now grow the denominator (adding a competitor CSV can honestly LOWER the client %); the client's own branded keywords no longer inflate it. The landscape stays a live recomputed view over the canonical pool (Const II.7 — Wayne rejected pinning a stored copy); the panel's new basis line ("landscape: N non-branded keywords · M brands on file · volumes from analysis <date>") makes any movement explainable on sight.
- **Best-position-wins upload dedupe (keywords/batch route + new lib/keywords/footprintMerge.ts).** Duplicate rows for the same keyword+domain now keep the best (lowest) position, the max volume, and the URL of the page holding the winning rank — within a file, across chunks, and across re-uploads. Previously last-occurrence-wins could store a brand's WORST ranking URL. Re-upload each competitor CSV once to rebuild stored ranks under the new rule.
- **Coverage guard (SovPanel + CompetitorsModal + new /api/projects/[id]/competitor-coverage).** Under a shared denominator, a filtered/truncated competitor export reads as a weak brand unless the gap is visible (Const I.5). The SoV legend now shows per-brand "rank data held: domain N/M kws"; the Competitors modal gains a "Check footprint coverage" probe (~10 Semrush units per domain, disclosed before the run, per-domain progress, last-checked stamp) comparing each competitor's real Semrush footprint size against uploaded rows.
- **Wording audit at every SoV read site** (panel subtitle/aria/footers, Exec K7/K17/K20/S4 insights, PDF template + assessment report, delivery package): "across the footprint" → "across the non-branded keyword landscape" — the v7.402 lesson (when semantics change, audit every user-facing sentence) applied up front.

Verified: real-project tsc clean + real `next build` compiled; retained suite 936 pass / 19 pre-existing env fails / zero regression delta (v7.246 stable-denominator + overlap-gap checks amended with dated notes, never deleted; 36 new v7.405 checks incl. commutative merge, landscape math, wording sweep, cost-disclosure greps); SovPanel SSR-rendered with the new basis + coverage lines; dual-theme contrast gate moved the three new muted-text elements to --c-8080a0 (4.72:1+ both themes; the old tokens measured 2.5–2.7:1 in dark).

## v7.404 · Every Semrush ranking URL had been silently blank — 2026-08-04

Building the new Recommended Program pages, the report needed one number nobody
had asked it for before: how many existing URLs sit in positions 4–20. The answer
came back zero, on a project with 1,429 tracked keywords.

`lib/apis/semrush.ts` asks Semrush for the ranking URL correctly —
`export_columns: 'Ph,Po,Nq,Ur,Cp,Co,Fl'`. But the mapper read **`row['URL']`**,
and Semrush's CSV header for `Ur` is **`Url`**. `parseSemrushCSV` preserves
Semrush's exact header casing, so the lookup was always `undefined` and the
`?? ''` fallback wrote an empty string on every row. No error, no warning — just a
column that had been blank since the day it was first requested.

It was a typo, not a decision: line ~284 of the same file (`domain_organic_unique`)
already read `row['Url'] ?? row['URL'] ?? ''`. Line 236 never got the same
treatment. They match now.

**The blast radius is wider than the report.** `Topic.pageUrl` derives from
`kws.find(k => k.position !== null && k.url)?.url`, so it has been `undefined`
project-wide — which means the **"Existing URL" column in the delivery-package
export has been shipping blank for every client**, and no per-URL rollup was
possible anywhere in the app.

**The fix does not backfill.** Rows already stored keep `url: ''`. Each project
has to be re-scanned before its URLs appear.

### Also in this release

**Real AI Overview and People Also Ask rows reach the assessment report.** Both are
already scanned per keyword (`lib/apis/serp.ts` — `hasAIO`, `aioSources`,
`paaQuestions`, `paaClientCited`, and since v7.117 the full `paaSources` set), and
both were stored on `analyses.serp_api_snapshot`, but nothing ever passed them to
this report. The PDF route now flattens them into `serpFeatures`: per-keyword
presence and citation, the client's ranking URL resolved from the SAME
`organicResults` the scan stored (registrable-domain match), and volume joined from
the shared `buildKwPool`. An absent snapshot yields `null`, so the section is
omitted entirely rather than rendering a placeholder (Const I.5).

`JourneyTopicLike` now carries `url` through to the report. It was present on
`KwItem` all along and dropped by that slice.

**Footer attribution** reads **"Provided by iQuanti, Powered by iQ.Impact"** (Wayne,
this session). Scope is the page footer ONLY — the cover PROVIDED BY block, the
governance "proprietary to iQuanti" line and the appendix endbrand "An iQuanti
product" stay iQuanti-only, so the statement of who is accountable for the numbers
is never split. This amends the v7.377 iQuanti-only rule, which stands everywhere
else.

### Verification

Real-project `tsc --noEmit` clean under the project tsconfig with no `target`
override (V.1a) **and a real `next build`**. Retained suite A/B against pristine
base via `git stash`: **902 pass / 19 pre-existing / zero regression delta**,
identical failure sets. **13 new v404 checks**, none deleted.

Two of those checks earned their keep immediately. The v374/v375 brand checks
substring-match `'iQuanti'` — the new footer contains that string, so they waved
the change straight through and could never have caught a footer regression. The
v404 checks pin the exact wording and assert the platform name appears exactly as
many times as there are footers, which is what actually enforces footer-only scope.

A third caught a defect in this release's own comments at live-verify: the removed
partner's name had been written into a template comment. Rendered output was clean,
so every rendered-HTML check passed; only a source-level grep found it. Fixed in a
follow-up commit — source greps catch comments, so that name stays out of this file
entirely, even in prose that says it is absent.

## v7.403 · "Analysis failed" on a run that was working fine — 2026-08-04

Wayne, mid-run: *"when i am trying to run the analysis i am getting this error"* —
**Analysis failed. Synthesis was interrupted (timeout).**

The run was not failing. At the moment that banner was on screen the engine had
finished **all 422 of 422 discovery batches** and was climbing through
consolidation — 11 chunks when the investigation started, 20 a few minutes later.
Nothing was lost and no API credits were re-spent. The panel simply stopped
asking it to continue.

**Why it gave up.** Each 300-second Vercel window ends in a timeout by design;
the panel keeps re-POSTing `/api/synthesize` for as long as the run is
advancing, and decides "advancing" from a progress poll. `pollProgress()`
returns `null` whenever the reading is *unavailable* — endpoint error, network
blip, a payload about a different run. The v7.343 loop folded that null into
`nowDone = -1`, which can never exceed `lastDone`, so **an unreadable poll was
counted as a stalled window** and two of them aborted the run. "I cannot see
progress" is not "there was no progress", but the code could not tell the
difference. Three windows in, a healthy run was declared failed.

The rule now lives in `lib/synthesis/resumeDecision.ts` as a pure function, so it
is tested directly instead of by grepping a 3,500-line component. Only a
*readable* reading that did not move counts as a stall (still 2, unchanged). An
unreadable one is counted separately and tolerated 5 times — a permanently blind
loop is not evidence of health either, so it still ends, just not after two
blinks. The exact incident sequence is a retained check.

**And the poll really was lying.** The progress route had two variants of one
SELECT: `WHERE id = $1` when the caller passed `?analysisId`, and `WHERE
project_id = $1 ORDER BY triggered_at DESC` otherwise. Measured live against a
project with exactly **one** analysis row — the same row for both:

```
?analysisId=dd902630…  →  { done: 0,   stage: 'categorizing'  }   ← wrong
(no analysisId)        →  { done: 424, stage: 'consolidating' }   ← correct
```

The row genuinely held `doneStarts: 422` and `canon 20/40`, read back through the
project API. The SELECT is not at fault: the exact drizzle template was run
against a real Postgres with production-shaped data and returned 423/429. Six
distinct cache-busted URLs all returned the stale figure, so it is not an HTTP
cache either. **Why that by-id read returns a pre-checkpoint view of the row is
not explained at the application layer, and this release does not pretend to have
fixed it** — it retires the query instead. The project-scoped read is measured
live-correct and is now the only one.

The caller's `analysisId` becomes an **identity check** rather than a filter: the
newest analysis of a project is the run the panel just triggered, and if it ever
is not, the response says `matchesRequested: false` and the panel treats the
reading as unknown rather than silently reporting another run's progress. The
poll also carries `no-store` now — it had no cache header at all, and a progress
reading served from any cache reads as a stall.

**Verification.** `tsc --noEmit` clean; real `next build` clean. The retained
suite runs the shipped resume rule through the incident sequence, and runs the
progress query against a real Postgres (pglite) with a 422/422 + 20/40 row,
asserting it reads **424, not 0**. 1036 pass / 16 pre-existing / zero delta, +26
new checks. The v7.343 check that pinned the old inline `stalls >= 2` counter was
amended in place with a dated note — the invariant it protects is unchanged and
is now asserted behaviourally.

## v7.402 · Clear data, per domain — and a re-upload message that was lying — 2026-08-04

Wayne cleared a project's data, went to upload the CSVs again, and the panel told
him *"these 5,589 keywords are already loaded for nyulangone.org — nothing
re-imported (no duplicates)."* Two separate problems were hiding behind that one
sentence.

**The message was not true.** The batch route has UPSERTED since v7.92: every
keyword already present gets deleted and re-inserted with the values from the
file being uploaded. So a changed export *did* overwrite volumes, positions and
SERP features — `inserted: 0` means "nothing was NEW", not "nothing happened".
What an upsert genuinely cannot do is remove rows the new export no longer
contains, which is the one case that needs a real clear. Telling Wayne nothing
was imported sent him hunting for a clear button the panel did not have. The
note now says what actually occurred: *"no new keywords for nyulangone.org —
5,589 existing rows were refreshed with this file's values. Rows this file no
longer contains are still stored; use Clear data on this row first for a clean
replace."* A successful import with new rows now reports its real counts too,
instead of silently saying nothing at all.

**The panel could not see the database.** It tracked only what the current
browser session had uploaded. Open a project whose CSVs were already stored and
every row read "Click to upload", the Run button stayed locked, and the only way
to discover the data was there was to upload a file and get told it was a
duplicate. A new `GET /api/projects/[id]/keywords/footprint` returns the real
per-domain row counts straight from `project_keywords` — one grouped read, no
estimate — so each row now shows "5,589 keyword rows stored", and stored rows
unlock Run without a pointless re-upload.

**Clear data, per row.** Each domain in the upload list gets its own control. It
appears only when that domain actually has rows to delete, and it is a two-step
inline confirm — click *Clear data*, then a red *Delete 5,589* / *Cancel* pair —
rather than a blocking browser dialog. `POST /api/projects/[id]/keywords/footprint`
genuinely DELETEs that domain's uploaded CSV rows (never hides them), reports the
real number deleted, and leaves manually added keywords alone, saying how many it
kept. The row then reverts to "Click to upload" so the changed export can go in
clean.

**One bucket rule, one function.** The client's footprint is stored under a blank
domain tag, with legacy rows carrying NULL or the literal client domain — three
tags wide — while each competitor has its own normalised domain. The uploader
decided that inline; a deleter that normalised even slightly differently would
have matched zero rows while cheerfully reporting success, which is the worst
possible failure for a control whose whole job is deleting data. Both sides now
import `normalizeFootprintDomain` / `isClientFootprintDomain` from
`lib/keywords/footprintDomains.ts`, and the retained suite asserts the shared
function is byte-identical to the expression the uploader used before this
release across a table of protocol, www, path and empty-input cases.

**Colour.** The informational/error split on the message strip no longer depends
on matching the substring "already loaded" in the sentence — rewording a notice
would have silently turned it error-red. It follows an explicit kind flag now.
The new controls are token-styled and were measured in a real browser in both
themes: 8.19:1 / 5.09:1 for the Clear label, 9.62:1 / 6.51:1 for the destructive
confirm, 8.19:1 / 4.82:1 for the stored-row count. The first drafts of the count
and "Clearing…" inks used `--c-707090` and measured 3.77:1 in dark; the render
gate caught them before the build.

**Verification.** Project `tsc --noEmit` clean, a real `next build` clean (the
new route registers as `ƒ /api/projects/[id]/keywords/footprint`), and the
retained regression suite run A/B against the pristine v7.401 base: the same 16
pre-existing failures, zero delta, plus 43 new checks. The two v7.344 checks that
asserted the old wording were updated in place with dated notes — the unlock
invariant they protect is unchanged — never deleted.

## v7.401 · Client Projects: a list view, and a way to find a client — 2026-08-04

Seven clients fit on the tile grid. Twenty will not, and by then finding one
means reading a wall of cards. Wayne asked for two things: a toggle between the
tile view and an alphabetical list, and a search bar.

**The toggle.** A two-segment control next to the search box switches the same
project list between tiles and rows. The choice is remembered per browser
(`orbitiq:dashboard:view`), so the dashboard opens the way it was left. The
first render is always tiles regardless of what is stored — the stored value is
applied in an effect — because a server render that disagrees with the client is
a hydration mismatch, and this is the cheap way to not have one. A blocked or
unavailable localStorage falls back to tiles instead of throwing.

**The list.** Alphabetical by client name, case-insensitive, via `localeCompare`
with base sensitivity, so "one main financial" files under O rather than being
banished below the capitals. The column headers — Client, Industry, Status,
Updated — are clickable: the same header flips direction, a new header starts
ascending. Rows tied on a non-name column fall back to the client name so the
order does not shuffle between renders. Sorting never mutates the array the API
returned, and **the tile view is never re-sorted** — it keeps the server's
most-recently-updated order exactly as before.

**The search.** One box, filtering live over client name, the full URL, the bare
domain, the industry chip and the status. Typing `usbank.com` finds US Bank
Deposits even though the stored URL is `https://www.usbank.com`; typing
`fintech` finds every Finance / Fintech client; case does not matter. A count
("3 of 7") appears while a query is active, an ✕ clears the box, Escape clears
it too, and a query that matches nothing gets a proper no-matches state instead
of a blank page. The Add Client tile hides while a search is running, because an
add affordance inside a filtered result set reads as a match.

**One menu, not two.** The ⋯ actions (Rename / Open / Delete) were living inside
`ProjectCard`. Rather than copy sixty lines of markup into the row, they moved
into a shared `ProjectMenu` that both views mount — so the two views cannot
drift apart on what a project can do.

**Two contrast fixes carried over from v7.400.** The status ink was
`text-green-400`, a raw Tailwind palette colour. Raw palette classes do not
follow `[data-theme]`: on the light surface that green measures ~1.8:1, which is
why "active" was barely there in Wayne's own screenshot. It is now
`text-orbit-green`, the theme-aware token — 5.56:1 in light, 7.89:1 in dark. The
same applied to the delete button (`bg-red-500` → `bg-orbit-red`) and to the
industry chip, whose `bg-orbit-muted` fill left its label at 4.11:1 in dark; at
`/50` it clears at 4.70:1.

**Where the logic lives.** Filtering, sorting and the stored-view helpers are in
`lib/dashboard/projectList.ts`, not in `page.tsx`. A route file may only export
its default component — a named export there fails the real `next build` — and
pure functions in a lib module can be exercised directly by the regression
suite. There is now a retained check asserting the page keeps exactly one
export, so nobody rediscovers that the hard way.

**Verification.** Real `next build` compiles clean (not just an isolated `tsc`).
The retained suite runs **967 pass / 16 pre-existing / zero delta**, with 48 new
checks: the sort and search invariants above, the structural rules, and a
real-Chromium dual-theme render of every new control. The render composites
semi-transparent bands the way the browser paints them rather than reading a
`/40` tint as an opaque fill, and it lifts class strings out of the source
rather than retyping them. Two pre-existing dark-theme pairings (the
`text-orbit-tertiary` placeholder and domain line, both already shipping in the
tile card) are allowlisted by `item|theme` key, counted out loud, and fail the
build if they ever start passing. The light theme carries zero allowlisted debt,
asserted separately.

Files: `app/dashboard/page.tsx`, `components/dashboard/ProjectCard.tsx`,
`components/dashboard/ProjectMenu.tsx` (new),
`components/dashboard/ProjectRow.tsx` (new),
`lib/dashboard/projectList.ts` (new), `package.json`.

## v7.400 · Light mode: the CTA buttons you could not read — 2026-08-03

Wayne sent a screenshot of the SERP Features panel in light mode. The "Scan all
7,496 remaining" button was there, dark navy, sitting exactly where it should —
and its label was invisible. Measured contrast: **1.24:1**. Anything under 4.5:1
fails WCAG AA; 1.24:1 is text the same brightness as the thing behind it.

It was not a typo in one button. It was structural, and it had been shipping
since v7.185.

**What was actually wrong.** The theme system maps every literal colour in the
components to a `--c-<hex>` token and gives it a light-mode value by inverting
its lightness. That rule is correct for a colour sitting on the page: white text
on a dark page has to become dark text on a white page or it disappears. It is
wrong for a colour sitting on a *fill*, because a fill does not follow the page
surface. `--c-ffffff` dutifully inverted to `#17182B`, so every button label
written as `var(--c-ffffff)` turned near-black — while the button underneath
stayed dark. Ten controls across five files: the SERP scans, Save on Edit
Project, Create on New Project, five buttons in the Competitors modal, and the
Google SERP action. Notably `RefreshModal.tsx` was fine the whole time, because
it writes a literal `white` and never went through the token map.

**The fix, in three parts.**

*Pinned on-fill colour.* A new `--on-fill-accent` is declared with the same
value in both theme blocks — deliberately, because a colour on a fill must not
follow the page surface. The ten sites now use it.

*A true indigo instead of a near-black.* The lightness inversion had turned the
brand accent into `#09009c`, which reads as black more than as OrbitIQ indigo.
Light mode now uses `#4338CA` for the fill and the ink alike, with the Tailwind
channel triplet moved in step so class-styled and token-styled buttons cannot
drift apart. White on it measures 7.9:1. The dark theme is untouched.

*Signal inks that can carry text.* The same inversion left green, amber, cyan
and orange too pale to read: status chips were landing between 2.1:1 and 4.2:1
against their own tint. Nineteen tokens were recomputed to the point where each
clears 4.5:1 against white **and** against a 15% wash of itself, which is the
harder of the two and the case the chips actually present. Six faint labels that
failed in *both* themes — an "ORBIT MAP" button at 1.67:1 among them — moved to
the standard secondary-text token.

**So it cannot happen again.** A dual-theme contrast gate now runs in the
retained suite. Every inline style that sets both a background and a colour is
resolved through the real token maps, once per theme, and checked against AA. A
pair that fails in either theme is an Article VIII FAIL. Pairs whose value is a
runtime expression are reported as skipped rather than guessed at — an
unverifiable pair is never counted as passing. Twenty-one known dark-theme
shortfalls that predate this release are recorded in a keyed allowlist with a
reason each; the light theme carries **zero** allowlisted debt, and a separate
assertion fails the build if a `|light` entry is ever added. Alongside it, the
CTAs are rendered in real Chromium in both themes and every ternary branch is
checked, because jsdom does not resolve `var()` in `getComputedStyle` and a
harness that cannot see the real value cannot prove anything about it.

`tsc` clean. Retained suite 878 pass / 16 pre-existing / zero delta, of which 38
checks are new here.

## v7.399 · The ledger was never broken — the read was — 2026-08-03

**The self-test shipped in v7.398 answered the question in one call, and the answer was the opposite of what it looked like.** The database held **38,128 rows**, including 7 fresh SerpAPI rows and 3 DataForSEO rows written minutes earlier. The direct insert returned `ok`. Zero ledger failures were recorded. Every write from v7.397's provider comparison had landed perfectly.

**What was wrong was the reading.** `/api/usage` reported SerpAPI stuck at exactly 23,920 and **no DataForSEO line at all** while querying that same database. Both usage read paths used a drizzle aggregate-alias select — `db.select({ quantity: sql\`coalesce(sum(...))\`, calls: sql\`count(*)\` }).from(...).groupBy(...)` — over neon-http, which returned stale, incomplete aggregates.

**This exact failure is already in this project's history.** v7.373 hit it in the auth layer: `db.select({ n: sql\`count(*)\` }).from(appUsers)` returned 0 while four rows sat in the table, which broke every team login. The fix then was to go through `db.execute` with raw SQL. That is the fix now. Both rollups query the database directly and let it do the aggregation it is authoritative for.

**The cost figures reported before this release were understated by an unknown amount** — every call recorded since whenever the drift began was in the table but absent from the totals. Nothing was lost; it was all there the whole time, just not being read.

Two smaller things went in with it: the usage rollup now excludes `kind = 'selftest'`, so the diagnostic can never inflate a real count; and the v7.398 failure counter, error-level log and red panel banner stay, because the reason this took three releases to find is that the original failure was **silent**.

**Suite gotcha, and it is the v7.385 lesson repeating:** the first version of the check that bans the drizzle aggregate pattern **failed on its own comment** — the comment documenting the banned pattern contains the banned pattern. The check now strips comments before asserting. Assert against code, never against the audit trail that describes it.

Files: `app/api/usage/route.ts`, `app/api/usage/cost/route.ts`, `package.json`/`package-lock.json` (7.399.0). Verified: project `tsc --noEmit` clean; retained suite **825 pass, 16 pre-existing failures identical to base, zero new**, +15 new v7.398/v7.399 checks.

## v7.398 · The ledger stops failing quietly — 2026-08-03

**v7.397's comparison made 20 real, billed API calls and not one reached the usage ledger.** SerpAPI stayed at exactly 23,920 and no DataForSEO line appeared. Nothing showed in the logs either, because `recordUsage` swallows every failure on purpose — accounting must never break a real API call.

**That design is right and the silence was wrong.** A swallowed ledger write is spend that vanishes from every total with nothing on screen to say so — the same failure mode Art. I.5b was written to prevent one level up. So the write now counts its failures, logs them at error level with the provider and endpoint attached, and the API Usage panel raises a red banner saying **these totals are understated and real money was charged anyway**. The count is per server instance and the panel says so — it is a floor, not a total, because the write that failed is precisely the one that cannot record its own failure.

**And there is now a way to get the actual error instead of guessing at it.** `GET /api/usage/selftest` runs the same write path with **nothing swallowed**: it checks the database is reachable, resolves `to_regclass('public.api_usage')`, counts rows before and after, runs the memoised DDL step, performs the exact insert `recordUsage` performs and returns the raw error verbatim if it throws, then reports what actually landed in the last three hours by provider. Its own test row carries `kind = 'selftest'`, which the cost rollup filters out, so it can never contaminate a real figure.

Files: `app/api/usage/selftest/route.ts` (new), `lib/usage/record.ts`, `app/api/usage/cost/route.ts`, `components/dashboard/UsageRollup.tsx`, `package.json`/`package-lock.json` (7.398.0). This release **diagnoses**; the fix follows once the self-test names the failing step.

## v7.397 · A second SERP provider, and the first cost OrbitIQ doesn't have to estimate — 2026-08-03

**Wayne got a DataForSEO key and asked what it would be worth.** The answer was mostly one number: SerpAPI is **76% of OrbitIQ's entire API bill** — $219.27 of $288.49 — and it carries a hard 30,000-searches/month ceiling that a single client can eat half of in one pass (US Bank: 13,788 searches). DataForSEO is pay-as-you-go at **$0.002 per SERP live** against SerpAPI's **$0.0091667** effective, with no ceiling at all. At the current ~15,300 searches/month that is roughly **$31/mo against $275**.

**This release adds the provider without switching to it.** `lib/apis/serp.ts` was already the single choke point every SERP call in the app goes through, so the dispatch lives there and nowhere else — three entry points (batch keyword scan, Maps listings, local pack), one flag, no caller changed and no panel forked. `SERP_PROVIDER` **defaults to `serpapi`**, so nothing about this deploy changes what the app does. Selecting DataForSEO without credentials falls back to SerpAPI rather than returning empty scans, because an empty scan renders as *"this client has no SERP presence"* — which would be a lie, not a gap.

**The genuinely new thing is how it gets costed.** DataForSEO reports the real dollar cost of every request in its own response body. So the ledger stores that figure per call, and the cost rollup sums it directly — **no rate is applied to it at all**. Every other source in OrbitIQ is priced by multiplying a real quantity by a published rate; this is the first one where the dollars are themselves a source row under Const I.1. It gets its own `measured` basis and its own bucket on the panel, so a measured figure and an estimated one are never presented as the same kind of number. The published $0.002 rate is still on file — labeled explicitly as a **cross-check that is never charged**.

**Nobody should switch providers off a vendor's pricing page, so there is a route that settles it with data.** `GET /api/serp-compare` runs an identical keyword set through **both** providers back to back and reports where they agree: exact client-rank agreement, agreement within one position, AI Overview presence agreement, PAA presence agreement, mean top-10 domain overlap, latency, and real cost each. It calls both implementations directly, bypassing the flag. It also says out loud that two live SERP scrapes seconds apart genuinely differ, so disagreement should be read as a range and re-run — not as one provider being wrong.

Files: `lib/apis/dataforseo.ts` (new), `app/api/serp-compare/route.ts` (new), `lib/apis/serp.ts`, `lib/usage/record.ts`, `lib/usage/pricing.ts`, `app/api/usage/cost/route.ts`, `components/dashboard/UsageRollup.tsx`, `lib/utils/markets.ts`, `package.json`/`package-lock.json` (7.397.0). Verified: project `tsc --noEmit` clean (V.1a); retained suite **824 pass, 17 pre-existing failures**, **+26 new v7.397 checks**, zero unexplained regressions. **One v7.396 check was AMENDED, not deleted** (V.6): its alarm fixture used `dataforseo` as the stand-in for an unknown provider, and this release makes DataForSEO a *registered* one with a display label — the invariant it protects is unchanged, only the stand-in moved. Still to do: Wayne adds `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` in Vercel, then the comparison runs on a real project before anything is switched.

## v7.396 · Semrush and SerpAPI get a price — and the rate card stops trusting itself — 2026-08-03

**Wayne asked two things: put Semrush and SerpAPI on the cost panel, and make it so any new source that costs money lands there automatically.** The first is a rate. The second is a design problem, because a literal auto-add has to invent a number for a provider it has never seen — and inventing numbers is the one thing this app does not do. So the second became the opposite: the rate card now **fails closed**.

**Every provider, unit and model that reaches the ledger must resolve to an explicit registry entry** — either a real rate carrying its source and an as-of date, or a dated declaration that it is deliberately unpriced. There is no third state and no default rate. Anything else comes back `unregistered`, raises a visible alarm on the panel naming exactly what is missing, and fails the Article VIII gate. Detection is automatic; the number never is.

**Writing the check for that found a live bug in the old rate card.** The v7.363 patterns matched by *family* — `/^claude-opus/i` — so the first day a new Opus shipped, its tokens would have been priced silently at the 4.6 rate and reported as fact. Matching is now pinned to the model *version*, and `MODELS_IN_USE` is asserted to resolve, so a release that adds a model without pricing it fails at build time instead of when the invoice arrives.

**SerpAPI is priced; Semrush is honestly not.** SerpAPI runs on the Big Data plan — $275/mo ÷ 30,000 searches = **$0.0091667 per search** — which puts TD Bank's 5,981 recorded searches at **$54.83**, a real number that was reading as a blank before today. Semrush's 2,000,000-unit monthly package is confirmed, but Semrush publishes no per-unit price anywhere; it is quoted by sales, and that figure is not yet on file. Rather than borrow a number off a blog, it ships as a dated unpriced declaration, named on the panel with its real unit count. Adding it later is one registry entry.

**Both of those are prepaid quotas, not pay-per-use, and the panel now says so.** The total splits in two — pay-per-use tokens versus plan allocations — because plan-fee ÷ included-quota is an *allocation* of a fixed subscription, not a marginal cost. Unused quota is allocated to no one, so those figures sum to **less than the invoice**. That sentence is on the panel, not just in this file.

Files: `lib/usage/pricing.ts`, `app/api/usage/cost/route.ts`, `components/dashboard/UsageRollup.tsx`, `package.json`/`package-lock.json` (7.396.0). Constitution amended to **v0.21 (Art. I.5b)**. Verified: real-project `tsc --noEmit` clean (V.1a); retained suite **799 pass, 16 pre-existing failures identical to pristine base — zero new failures**, +45 new v7.396 checks including a dual-theme jsdom render in both the clean and the alarm state, and a real-scale replay asserting the three existing token lines still price to $38.38 / $13.47 / $0.95 unchanged.

## v7.395 · Step 1 at laptop width — a name is never cut — 2026-08-01

**Caught on the v7.394 live check, and it was mine.** At a 1409px window the step row is still two-up, which leaves the Step 1 card about 460px wide — and the longest segment name rendered as **"The Financially Wak…"**. A count can shrink and a quote can go, but truncating a person's name in a panel whose entire job is telling you who these people are defeats the release that just shipped.

**Between 1201 and 1440px the card now gives up its audience-share column, and the name wraps instead of truncating.** Three things change in that band only: the quote hides (it was already doing so), the **Audience share column is dropped from the grid template** — removed, not merely hidden, so no empty track is left behind — and `white-space` on the name goes to `normal`, so a long name takes two lines rather than losing characters. Below 1200px the cards stack full width (v7.391) and the complete layout returns; above 1440px nothing changes.

The order of sacrifice is deliberate and now pinned by retained checks: **the quote goes first, then a whole column, and the name and both counts survive to the end.**

Files: `components/brief/SegmentLens.tsx`, `package.json`/`package-lock.json` (7.395.0). Verified: project `tsc --noEmit` clean; the card re-rendered at the exact failing case — a 1409px viewport with a 1150px panel — and every segment name asserted non-truncating via `scrollWidth <= clientWidth` (it was 1 of 3 clipped before, 0 of 3 after). Retained suite: **754 pass, 16 pre-existing failures identical to pristine base — zero new failures**, +4 new v7.395 checks. Suite gotcha worth recording: the first attempt at those checks put an apostrophe inside a `node -e '…'` block, which silently terminated the shell string and took six unrelated checks offline with it — the pass count dropping from 750 to 744 was the only symptom. **Watch the PASS count, not just the FAIL count.**

## v7.394 · Step 1 becomes a segment table — and the counts stop looking broken — 2026-08-01

**Wayne**, after reviewing three rendered options: *"lets do option a"*.

**The real problem with Step 1 was never styling — the numbers looked wrong.** On TD Bank the chips read **238 + 202 + 248 = 688** against an **All Segments of 428**. The reason is that the same Shared topics are counted under every segment, and that was explained in two lines of grey 10px text at the bottom of the card — read *after* the reader had already stopped trusting the panel. Measured off the live app, it reconciles exactly:

| segment | its own | + shared | = shown |
|---|---|---|---|
| The Financially Waking Millennial | 108 | 130 | **238** |
| The Everyday TD Loyalist | 72 | 130 | **202** |
| The Stressed Money Optimizer | 118 | 130 | **248** |

108 + 72 + 118 + 130 = **428** — every topic accounted for, none unassigned.

**So each row now shows its own count beside its total, and the overlap is stated as a finding rather than an apology:** *"The same 130 topics (30% of the map) speak to every segment, so each row is its own count plus those 130 — which is why the segments add to more than 428."* Every figure is counted off the **same bucket map `filterPlanBySegment` reads**, so what the table claims and what clicking the row yields cannot drift — a retained check asserts, per segment, that the printed number equals what the real filter function returns.

**You can now tell who these people are.** The analysis has always held a first-person tagline and an audience share per segment; neither reached this panel. Both render here verbatim — *"I already bank with TD — I just need to log in, find an ATM, and get my stuff done"* — with a share bar that puts 42 / 35 / 23 in order at a glance. **A segment with no `volumePct` renders an em dash and no bar**, never a modelled percentage (Const I.5a).

**"All Segments" is now the first of four rows** instead of a chip stranded on the label row, and the layout is the same table shape Step 2 took in v7.393, so the two cards in the step row read as one designed thing.

**Scoped to the Content Map, as chosen.** `SegmentFilterBar` is untouched and still serves Content Plan and Scope — this is an additional form for one panel, not a fork of the shared attribution (Const II.7). Retained checks pin both halves of that.

**A latent bug the new checks caught: `--c-090917` is defined in NEITHER theme.** `SegmentTable` used it for the table header, and the v7.353 both-themes token check failed it. It turns out `ContentPlanSection` has been using the same undefined token for its Step-2 inset since v7.361 — every `var(--c-090917)` was silently resolving to no background at all. All uses now point at `--c-08081a`, which is defined in both themes, so those insets finally render the background they were written to have. A new check asserts the dead token appears nowhere.

Files: `components/brief/SegmentLens.tsx`, `components/brief/ContentMapSection.tsx`, `components/brief/ContentPlanSection.tsx`, `package.json`/`package-lock.json` (7.394.0). Verified: project `tsc --noEmit` clean; jsdom render at **TD Bank's real distribution** (108 / 72 / 118 own + 130 shared = 428) so the arithmetic under test is the arithmetic that confused the reader, plus a no-shared shape, a no-`volumePct` shape and an empty-segment shape; both themes byte-identical. Retained suite: **750 pass, 16 pre-existing failures identical to pristine base — zero new failures**, +41 new v7.394 checks. Suite note (Const V.6): one v7.391 check was **amended with a dated note, not deleted** — it pinned `SegmentFilterBar` + `countOf` in the Content Map; it now pins `SegmentTable` + the shared bucket map, because the invariant it protects is that Step 1 renders a real control fed by the one attribution, not which widget draws it. **Two checks in this release were themselves wrong first and were corrected against the data, not the other way round:** a word-boundary regex that matched concatenated cells, and an assertion that a segment with no topics of its own should be inert — it should not, because it still shows the 130 shared.

## v7.393 · Step 2 rebuilt — labelled dimension selector, tier table, standing result line — 2026-08-01

**Wayne**, after reviewing three rendered options: *"option 3"*.

**The pill row is now a table, and the numbers have units.** `P0 · Do first 34 · 2.4M` never said 34 *what* or 2.4M *what* — the reader supplied "topics" and "searches per month" from memory. The five tiers now sit in a table under a header that names them: **Priority · Topics · Searches/mo · Share of demand**, one row each, with a bar showing that tier's share.

**The share column exists because equal-width pills hid the only reading that mattered.** On TD Bank, **P1 · Next holds 116.8M of the 120.6M total monthly searches — 97% of all demand — across 201 topics, while P0 · Do first holds 2.4M across 34.** Five identically-sized pills flattened that completely. The bar makes it the first thing you see. Share is computed against the **same faceted base the All row reports**, so the column reconciles with the 100% on screen — a retained check asserts the tier shares sum to it (Const I.1). An empty tier (`P3 · Backlog`) is now `aria-disabled` and out of the tab order, and its share reads as a dash rather than a misleading 0%.

**Tabs became a labelled segmented control.** An underlined tab strip answers "where am I"; this control answers "what am I slicing by", so it carries a **Filter by** label and reads as one control rather than page navigation. Same five dimensions, same order, same active-filter dot.

**A standing result line closes the card, and it is the actual fix.** It renders in *every* state — `Showing 428 topics · 120.6M/mo — no filters, the whole map` — and once anything is filtering it names every active filter **across dimensions**, each removable, plus a labelled clear. Previously, picking P0 and switching to Funnel stage left a 6px dot on a tab as the only trace of the P0 filter; the hint promised filters combine while the UI hid the combination.

**Two readings were removed rather than left to duplicate it.** The toolbar's `428 topics · 120.6M/mo` now sat ~40px below an identical line, so it is dropped **on the Content Map only** — Content Plan and Scope have no result line and keep theirs. The right-hand hint said *"Tabs filter · click a row for the detail"*, naming a control that no longer exists; on the Content Map it now reads *"Click a row for the detail"*. And `PChip`, the v7.360 filter pill, was **deleted** — the pill row was its only caller in the app (the v7.385 rule: no dead compute behind a deleted surface), with a dated note left in its place.

**What did not change:** the five dimensions, the tier definitions, the faceting (each dimension's counts are still computed over the *other* active filters), the per-tier Excel export, and the combine-across-dimensions logic. This release is presentation only — no topic is scored or counted differently.

Files: `components/brief/ContentPlanSection.tsx`, `package.json`/`package-lock.json` (7.393.0). Verified: project `tsc --noEmit` clean; jsdom render against a deliberately **lopsided** fixture (one tier holding ~96% of demand on a minority of topics — the real TD Bank shape, so the scale assertions are made against the case the old design failed); static render screenshotted in both themes **and at a 1150px panel width**, where the table holds one line per tier while the old pill row wrapped to three. Retained suite: **709 pass, 16 pre-existing failures identical to pristine base — zero new failures**, +31 new v7.393 checks. Suite note (Const V.6): one v7.391 check was **amended with a dated note, not deleted** — it asserted "all five dimension tabs render"; it now asserts all five *dimensions* render, since the invariant it protects is that none was dropped when the control changed form.

## v7.392 · Step 3 removed · select-all moved above the topic table — 2026-08-01

**Wayne:** *"lets actually remove step 3 so there is just the two steps on the top row. Then above the topics have a select all check box with the wording for selecting all the topics. Also show how many current topics are selected."*

**Step 3 is gone; the top row is Steps 1 and 2.** Selecting topics was never really a configuration step alongside *choose an audience* and *filter* — it is the thing you do to the table once those two are set. Sitting it in a third card put a permanent instruction banner between the filters and the rows it described. The row is now two cells, `minmax(0,1fr) minmax(0,1.5fr)`, Step 2 keeping the wider track.

**The select-all is a real checkbox, directly above the rows, in their own column.** It sits in the leading 18px column so it lines up vertically with every row checkbox beneath it — it reads as the header of that column, which is what it is. Wording states the action and the count together: **"Select all 6 topics for your scope & content plan"**, flipping to **"Unselect all 6 topics"** once everything is in. When filters are narrowing the table it says so explicitly — *"Select all 34 topics shown by these filters"* — so a bulk click can never quietly mean something other than what the label promised.

**Three states, and the middle one is the point.** `SelectBox` gained an explicit `mixed` state: some of the shown rows selected draws a **dash** and reports `aria-checked="mixed"`, never a tick. A half-selected list cannot render as a fully selected one. Row callers pass nothing and are byte-identical to before (Const II.7).

**The count on the right is two honest numbers, not one convenient one.** It reads **"2 of 6 topics selected"** — both halves counted over the topics in *this* view, the same set the rows and the toolbar rollup describe (Const I.1). If the content plan holds selections that live outside the current view — another audience segment, another filter — that is appended **separately** (*"· 9 in the full plan"*) rather than folded into the pair, and stays silent when the two agree.

**Nothing was deleted without checking what it carried.** Step 3 held exactly two things: the bulk select-all and the selected count. Both are asserted at their new home by retained checks, and `stepThree` was removed along with the card so there is no dead compute behind a deleted surface (the v7.385 rule). The bulk action still routes through the same `onBulkSelect` prop — one write path to the content plan, not a second one.

Files: `components/brief/ContentPlanSection.tsx`, `package.json`/`package-lock.json` (7.392.0). Verified: project `tsc --noEmit` clean; jsdom render across four selection states (none / partial / all / selection-outside-the-view) asserting the wording, the count, the mixed state and the bulk-call shape, plus DOM-order proof that the bar sits above the column header and outside the step row; static render screenshotted in both themes. Retained suite: **678 pass, 16 pre-existing failures identical to pristine base — zero new failures**, +27 new v7.392 checks. Suite note (Const V.6): **four v7.391 checks and one v7.353 check were AMENDED with dated notes, not deleted** — the v7.391 row checks now assert two cells and a 1 : 1.5 track pair, and the v7.353 bulk-select check was widened from "a button labelled Select all shown (3)" to any control (button or `role=checkbox`) that puts every shown topic in the plan in a single call, which is the invariant it always protected.

## v7.391 · Content Map — Steps 1 · 2 · 3 side by side instead of stacked — 2026-08-01

**Wayne:** *"lets change how we are doing step 1, 2, 3 — so rather than stacking them on top of each other, have 3 boxes inline on the same row. Step 1, 2 then 3."*

**The three guided steps now sit on one row.** Choosing an audience, filtering, and selecting topics were three full-width cards stacked one above the other, which pushed the topic table itself roughly 500px down the panel — the guided flow was costing more vertical space than the thing it was guiding. They are now three boxes on a single row, in reading order, all ending level.

**Step 2 gets the wider track (1 : 1.5 : 1), not an equal third.** Step 1 holds a chip list and Step 3 holds a single banner, but Step 2 carries five dimension tabs *plus* the filter chip row with counts and volumes on each. In equal thirds the tab row wrapped three deep and drove the height of the whole row; at 1.5× it keeps its tabs on one line. Tracks are `minmax(0, …)` so a long chip can never push a column past its share, and the cells stretch, so the three boxes end level whichever one is tallest.

**Below 1200px it folds back to a single stacked column.** On a laptop three equal boxes would each be about 430px wide and Step 2 would be unusable. The row is a `.cmStepRow` grid with a media rule that collapses it to one track — the previous stacked layout, unchanged, at the widths where stacking is the right answer.

**How the row is assembled.** Step 1 belongs to `ContentMapSection` (it owns the segment state) while Steps 2 and 3 live in `ContentExplorer`, so the two could not previously share a grid. `ContentExplorer` now takes an optional `stepOne` slot and owns the single grid; the map panel hands its Step 1 card across rather than rendering it above. The segment state, the real row counts and the guard that hides Step 1 when a project has no segments all moved verbatim — only placement changed. Content Plan and Scope pass no slot and use `mode="plan"`, so they get no step row at all and their own filter cards are untouched. `StepCard` gained an `inRow` flag that drops its bottom margin (the grid gap owns the spacing) and stretches it to the cell; every stacked caller passes nothing and renders byte-identically to before (Const II.7).

**One copy change.** Step 1's hint said *"Every step below respects this choice"* — nothing is below it now. It reads *"Every step here respects this choice."*

Files: `components/brief/ContentPlanSection.tsx`, `components/brief/ContentMapSection.tsx`, `package.json`/`package-lock.json` (7.391.0). Verified: project `tsc --noEmit` clean; jsdom render of the real `ContentExplorer` in **both themes**, asserting the three cards are children of one grid element, in order, with the 1 : 1.5 : 1 tracks, and that the row's text is **byte-identical** dark vs light (Const IV.6/V.5); static render screenshotted at full panel width in both themes. Retained suite A/B: **650 pass, 16 pre-existing failures identical on base and change — zero new failures**, including **22 new v7.391 checks**. Suite note (Const V.6): the v7.389 and v7.390 sessions did not save a `_verify/run.sh` forward, so this A/B ran the last saved suite (`_work-v7.388`, 628 checks) — carried forward now as `_work-v7.391/_verify/run.sh` with the v7.391 block appended.

## v7.390 · Duplicate provenance prefix fixed · AI lane fills to three · larger SoV chart on the exec — 2026-07-31

**Wayne:** *"make the graph and numbers larger in the summary card."* Plus two things caught on the live v7.389 render.

**1 · The AI actions printed their panel name twice.** `AI Answer Engines (09) · AI Answer Engines (09) · TD Bank · Profound export, updated 6/29/2026`. The AI source label already opens with its own panel name, and the row printed the prefix again on top of it. Exactly the defect the Key Insights rail was fixed for in v7.383 — the same guard now runs at both render sites, and a retained check pins both so the two cannot drift apart again.

**2 · A healthy client only got two AI moves.** TD Bank has no engine blackout, no topic whitespace and positive sentiment, so three of the five AI rules correctly declined and the lane rendered short. That was honest but incomplete: **prompt coverage** — surfacing on 28 of 200 tracked prompts — is the widest AI gap that client actually has, and nothing was saying so. `A6` now covers it, placed **last** in the lane order so it only appears once the sharper rules have nothing to report. Verified across four shapes: TD's real shape fills to three with A6 third; a client with a real blackout and real whitespace keeps A1/A2/A3 and A6 stays out; a client named on every tracked prompt gets no action at all rather than a zero; and a project with no Profound panel gets no AI moves invented.

**3 · The chart is bigger on the Executive Summary.** The donut goes 144px → 200px and the legend type up 2px. It scales by **viewBox**, not by re-laying-out the SVG — every coordinate stays in the 144-unit space, so the arc geometry and the centred `5% / PAGE-1 SOV / est.` labels cannot drift apart at the larger size. `LegendRow` took a `bump` prop that **defaults to 0**, so nav 06 and every other call site render byte-identically to before (Const II.7). Both are gated on the same `variant` v7.389 introduced.

**One thing worth your eye, not a v7.390 change.** The Content lane shows *101.5M searches/mo* behind the 36 net-new pages **and** *101.5M searches/mo* behind the 4,626 competitor-gap keywords — the same figure from two independent rollups. The rail has been saying the same thing since v7.382 (`1.2B searches/yr behind the net-new set`, and `1.2B searches/yr you are not in the running for`), so this predates the action lanes and both panels agree with each other. But 36 pages carrying identical demand to 4,626 keywords looks wrong, and the likely cause is `contentPlan.scope.buildVol` summing the gap pool rather than the build topics' own volume. Nothing was changed here — a figure that might be wrong does not get quietly adjusted. Flagging it for a decision.

Files: `components/brief/ExecutiveSummarySection.tsx`, `components/brief/GoogleSerpSection.tsx`, `lib/insights.ts`, `package.json`/`package-lock.json` (7.390.0). Verified: project `tsc --noEmit` clean; behavioural fixtures over four AI-data shapes; full retained suite — **703 pass / 13 pre-existing, zero new failures**, plus **16 new v7.390 checks**. Retained-suite note (Const V.6): one v7.389 check was **amended with a dated note, not deleted** — it pinned the un-deduped `{act.panel} · {act.evidence}` form; it now pins the deduped form, and both halves still have to reach the DOM, which is what it was protecting.

## v7.389 · Share-of-Voice card stripped to the chart · bottom row rebuilt as three action lanes · title resized — 2026-07-31

**Wayne:** *"lets remove all of this wording - again any insights need to be grouped with the others. in the bottom row lets have the top 3 things to do for Google SERP, top 3 for AI and top 3 in content."* Plus, mid-pass: *"lets make the words a little smaller and add more spacing above and below the words."*

**1 · The Share-of-Voice card is now the chart alone — on this panel only.** The card was carrying five blocks of prose under the donut: the *Land grab* finding banner, the amber "competitor on file but not scoreable" notice, the "Client wins ~596,686 of ~13,210,953 page-1 clicks/mo" sentence, the measured-inputs footer, and the SoV formula line. All of it is gone from the Executive Summary.

The thing worth recording is *how*. `SovPanel` is **one component rendered on both this panel and nav 06 (Google Ranks)**. Deleting those blocks outright would have stripped them from the deep panel too — where they are the whole point. So the card gained a `variant` prop: `variant="exec"` hides the prose, the default keeps every word. It is a presentation switch over the same `computeSov()` call, not a second implementation (Const II.7), and a retained check asserts nav 06 renders it *without* the variant so a future edit can't quietly flip it.

**2 · Every sentence that left the card landed in the rail.** Nothing was deleted, per the standing rule that findings move rather than disappear:

- The **Land grab / contested-market** read is *adopted* — the same `landGrabInsight` rule is called, and the rail row is asserted byte-identical to the rule's own sentence and evidence stamp. It files under Missed opportunities.
- **K7** (Share of Voice) gained the absolute pair the card stopped printing: *"That is ~596,686 of ~13,210,953 page-1 clicks a month."* With no click figures supplied it says nothing about them rather than printing a zero (Const I.5).
- **K20** is new: the competitor-on-file-but-not-scoreable gap, one row per competitor, filed as context.

**3 · One line could not go, and it is worth being explicit about why.** The donut renders a *modeled* figure, and Art. I.5a says a modeled number names its curve on the surface where it is shown. So the exec keeps a single 9px line — `modeled estimate · CTR curve: GrowthSRC 2025 · 200K-kw study` — collapsed down from a pill plus two footnote paragraphs. The measured inputs behind it (footprint counts, volumes, the formula) are one click away on nav 06, which still prints all of it. If that last line should go too, the honest options are to drop the SoV donut from this panel entirely or to amend Art. I.5a — not to render the number bare.

**4 · The bottom row is rebuilt as three lanes, computed live.** The old row rendered `analysis.opportunities` — synthesis prose **written once when the analysis ran**, sitting beside cards that recompute on every render. That is the same staleness class the narrative paragraph was removed for in v7.386 (QC audit A2), so it went the same way rather than being restyled. In its place, `execActionLanes()` derives up to three moves per lane from the same measured rollups the cards and the rail already read:

- **Google SERP** — near-misses at 4–10, page-2 climbers, AI Overviews you're absent from, the modeled page-1 click gap, page-1-to-top-3 conversion.
- **AI answers** — engine blackouts, winnable prompts, topic whitespace, citations on pages you don't own, negative sentiment.
- **Content** — net-new builds, existing pages to optimise, the competitor keyword gap, absent or thin journey stages.

Ordering inside a lane is **declared, not scored**. Each lane lists its candidates in distance-to-result order and shows the first three with real data behind them. There is no blended priority score, because the inputs are in different units — positions, prompts, pages — and a composite of those is a number nobody could defend (Const I.1). Every action prints its evidence and the deep panel holding the full list; a lane with nothing measured says so rather than inventing a move (Const I.5). Retained checks assert the near-miss, gap and blackout actions quote the *same* figures K8, K10 and K2 quote, so an action can never contradict the rail above it.

Removed with the old row, all now dead: `fallbackActions`, the `actions`/`hasFallbackActions` switch, the `analysisDateLabel` stamp only that header consumed, the `CATEGORY_COLOR`/`CATEGORY_TEXT` maps, and the local `Opportunity` type. The stored opportunities are untouched in the database.

**5 · The panel title.** 30px → 25px, margin `10px 0 2px` → `20px 0 16px`.

Retained-suite note (Const V.6): three checks were **amended with dated notes, not deleted**. Two pinned the title's exact size and margin; they now pin the weight plus a large-heading band and a minimum gap on each edge, so a later tweak can't quietly close the spacing back up. The third asserted the v7.334 honesty rule in its weaker form — *if* the panel prints synthesis prose, that prose carries its write date. With the last synthesis prose gone there is nothing left to stamp, so it is re-pinned in its **stronger** form: the panel must render no analysis-time prose at all. Synthesis text returning here undated would fail it exactly as the old pair would have.

Files: `components/brief/ExecutiveSummarySection.tsx`, `components/brief/GoogleSerpSection.tsx`, `lib/insights.ts`, `package.json`/`package-lock.json` (7.389.0). Verified: project `tsc --noEmit` clean; dual-theme jsdom render asserting the prose is off the card, the CTR curve is still named, all three lanes render, and the no-AI-data shape stays clean; behavioural fixtures over full-data and thin-data projects; full retained suite — **687 pass / 13 pre-existing, zero new failures**, plus **54 new v7.389 checks**.

## v7.388 · No vertical colour bars on the summary cards — 2026-07-31

**Wayne:** *"lets also remove all the vertical color bars on all of the summary cards."*

The four KPI cards drop their 3px accent stripe and the asymmetric `0 8px 8px 0` radius that squared off the barred edge, so each is now a plain rounded card matching everything else in the panel.

**The colour coding is not lost with the stripe.** Each card's label keeps its accent — green for Google SERP Ranks, red for AI visibility, amber for Coverage map, cyan for Winnable prompts — which is where a reader looks to identify a card anyway. A retained check asserts the label still carries `b.accent` and that the per-card accents are still defined, so a later cleanup can't quietly strip the colour identity along with the decoration.

**The Key Insights rows keep their bar, deliberately.** That stripe is not decoration: it is the only thing encoding severity at a glance — red critical, amber watch, green win — in a rail where the reader is scanning for what matters most. Removing it would cost information rather than clutter. It is a separate call to make if Wayne wants a flatter rail, and a retained check now pins the distinction so the two are not conflated in a future pass.

Files: `components/brief/ExecutiveSummarySection.tsx`, `package.json`/`package-lock.json` (7.388.0). Verified: project `tsc --noEmit` clean; full retained suite — **631 pass / 13 pre-existing, zero new failures**, plus **5 new v7.388 checks**.

## v7.387 · Rail ends level with the column · panel title · AI-engines card removed — 2026-07-31

Three changes from Wayne in one pass.

**1 · The rail ends level with the left column.** *"reduce the insight windows so it is even with the last row."* The obvious fix — `max-height: 100%` on the rail — does not work, and the reason is worth recording. As an in-flow grid item the rail *contributes to* the row height it would be clamping against, so the constraint resolves circularly to "as tall as I already am"; the first attempt shipped exactly that no-op. What breaks the circle is taking the rail **out of flow**: it now sits inside a `.oiq-rail-cell` that stretches to the row and is absolutely positioned with `inset: 0` inside it. The row is then sized by the left column alone and the rail fills precisely that box, keeping its own scroll for anything taller. Measured after the change: left column and rail end at the same pixel. The rail **stops being sticky** as a consequence — the right trade, since it is now exactly as tall as the block it belongs to and pinning would only let it outlive its own section. Below 1180px it returns to static positioning and natural height as before.

**2 · The panel names itself.** *Executive Summary* at 30px/800 weight above the hero, with top margin separating it from the global nav.

**3 · The "AI answer engines · what a CMO should know" card is removed.** It carried six readings. Four were already in the rail — winnable prompts (K4), prompt coverage (K5), net sentiment (K14), citation share (K15). The other two were the **zero cases**: *no invisible engines* and *no topic whitespace*. Those were only ever stated on this card, because K2 and K3 fired **only when the news was bad**. Deleting the card as-is would have silently removed a real reading from every client who is doing well — a rule that speaks only about problems tells half the truth. So K2 and K3 gained win branches: *"You are cited on all 6 engines tested at least once — thin in places, but no engine is a blackout"* and *"You appear somewhere in all 5 tested topics."* Both are gated on having engines/topics tested at all, so a project with no AI data claims no win from absent data (Const I.5). The `SignalCard` component went with the card; the deep panel at nav 09 is untouched.

Retained-suite note (Const V.6): three checks were **amended with dated notes, not deleted** — two asserting the rail was `position: sticky` (source and rendered) and one matching the narrow-viewport reset via the old `.oiq-exec-top > aside` selector. The replacements assert the *new* structural invariant rather than dropping coverage: the cell is the positioning context, the rail is out of flow, and the grid is not `align-items: start` — any one of those regressing would restore the circular constraint and the rail would hang below the column again.

Files: `components/brief/ExecutiveSummarySection.tsx`, `lib/insights.ts`, `app/globals.css`, `package.json`/`package-lock.json` (7.387.0). Verified: project `tsc --noEmit` clean; headless measurement confirming left column and rail share a bottom edge to the pixel; behavioural fixtures over three shapes — clean sweep, real blackouts/whitespace, and no AI data — asserting the win branches fire only where earned and the four carried-over readings all still reach the rail; full retained suite — **626 pass / 13 pre-existing, zero new failures**, plus **39 new v7.387 checks**.

## v7.386 · "The landscape" block removed; its contrast moves into the rail — 2026-07-31

**Wayne:** *"lets remove this row as well - again if the insights are there move them to the insight panel in the appropriate location."*

The block held two different things, and they deserved opposite fates.

**The framing sentence moved.** *"You win page-1 rankings for 37% of demand — but you're cited in just 1.8% of the AI answers your buyers now read first"* is the product's whole thesis in one line, and both halves were already computed live. It now renders inside the Key Insights rail as **K1 · Two worlds of visibility**, off the same two figures. The contrast is drawn **only when the two worlds actually diverge** — a project whose AI visibility runs ahead of its page-1 rank gets the plain AI-visibility reading instead of a manufactured contrast, and a project with no page-1 basis never has a contrast drawn against zero. K6 keeps stating the Google reading in its own right, so nothing is lost by the merge.

**The AI narrative paragraph did not move, deliberately.** That prose is written **once at analysis time** while every card on the page recomputes live — which is exactly why v7.334 had to stamp it with an analysis date, and why QC audit A2 caught it asserting "9% capture" beside a live 3% Share-of-Voice card. Carrying stale prose into a rail whose entire promise is that each line states its own source and freshness would import the one failure the rail is built to prevent. It is removed rather than re-homed (Const I.1 / I.5). The Executive Summary now contains **no analysis-time prose at all** — the `_narrative` snapshot read, the `firstSentences` helper and the derivation are all gone. The analysis-date **stamp** survives, because the AI-generated priorities row further down still needs it and still shows it.

Retained-suite note (Const V.6): the v7.382 check asserting `cited in 1.8% of the 2,400 AI answers` was **amended with a dated note, not deleted** — K1's rate and denominator are no longer adjacent now that the rank clause sits between them, so the check asserts both are present rather than matching one literal string.

Files: `components/brief/ExecutiveSummarySection.tsx`, `lib/insights.ts`, `package.json`/`package-lock.json` (7.386.0). Verified: project `tsc --noEmit` clean; behavioural fixtures over three shapes — diverged (TD Bank), AI-ahead-of-rank, and no-rank-basis — asserting the contrast fires only where it is true and keeps its denominator; full retained suite — **597 pass / 13 pre-existing, zero new failures**, plus **18 new v7.386 checks** covering both the removal (block, derivation, snapshot read, helper) and the survival of the analysis stamp on the priorities row.

## v7.385 · The quick-wins ladder comes out of the Executive Summary — 2026-07-31

**Wayne:** *"lets remove this row as well"* — the **"Where to spend first · effort vs payoff"** block.

Removed, along with its compute: the `ladder` array, the three modeled click estimates (`quickClicks` / `climbClicks` / `betClicks`) and the `ctrAt` import that fed them, so no dead calculation is left running behind a deleted view.

**Nothing measured was lost.** All three of the ladder's readings already reach the reader through the Key Insights rail, with the same real numbers: near-misses at positions 4–10 and page-2 climbers under **Quick wins ready now** (K8), and net-new gap keywords under **Competitors outperforming** (K10). The near-miss and climber pools are still computed here for exactly that purpose, and the regression suite asserts they still reach the rule set with their real counts and real search volume — a block can be deleted, but a measured reading may not vanish with it.

**What did leave is the modeled click estimate per tier** (~3.2M / ~702K / ~32.9M clicks). Those were the panel's only projection of value-at-stake, derived from the GrowthSRC CTR curve and labeled as modeled. Losing them is a net gain in honesty rather than a loss of data (Const I.1 / I.5a) — every remaining figure in the Executive Summary's action guidance is now measured. If a value-at-stake reading is wanted back it should return as a single labeled rail line rather than a table of three, and that is a deliberate decision to make rather than a side effect of this cleanup.

Files: `components/brief/ExecutiveSummarySection.tsx`, `package.json`/`package-lock.json` (7.385.0). Verified: project `tsc --noEmit` clean; full retained suite — **579 pass / 13 pre-existing, zero new failures**, plus **11 new v7.385 checks** covering both halves of the change: the block, its render loop, its data structure, the modeled figures and the CTR import are all gone, and the near-miss / climber / gap readings still reach the rail.

## v7.384 · The two standalone finding rows move into the Key Insights rail — 2026-07-31

**Wayne:** *"lets remove these two rows in the executive summary. Also any insights from these rows should move to the key insight section."* The rows were the v7.366 sentence layer sitting under the KPI cards — **A6 "Known, never recommended"** and **A8 "AI whitespace"**. Both are gone from the panel body; both findings now appear in the rail under **Missed opportunities**, ranked critical.

**Adopted, not rewritten.** The obvious way to do this — retype the two sentences as new rules — would leave two copies of the same wording free to drift apart, which is exactly the failure this codebase keeps re-learning. Instead `adoptInsight()` takes the `Insight` the v7.366 rule returns and re-files it: the sentence `parts` and the `evidence` stamp are carried **verbatim**, and only the section and the urgency rank are assigned at the rail. The regression suite asserts byte-identity between the rail's rendered sentence and the rule's own output, so a future edit to either rule updates the rail automatically and can never produce a second version. The probe finding still carries its original *"live LLM probe — real classified responses, never modeled"* stamp.

Both are ranked **critical**, which is defensible because the gates on those rules only open when the gap is already stark: A6 needs brand recognition at ≥70% *with* unbranded recommendation at ≤25%, and A8 needs an above-median-demand category running at ≤2% mention rate. On TD Bank they read *"1.3M monthly searches — you were mentioned in 0 of 10 AI answers"* and *"recognize your brand in 100% of branded prompts — and recommend you in 10% of 302 unbranded answers"*, and both surface in the visible top 3 of Missed opportunities. When either rule declines to fire, nothing is invented and no placeholder row appears (Const I.5) — `adoptInsight(null, …)` returns null by construction, which the suite also asserts.

The `InsightStack` import was removed with the block, so the panel carries no dead dependency on the standalone row layer. That layer is untouched and still in use on the nine other panels it was built for (v7.366) — this release only removes it from the Executive Summary.

Files: `components/brief/ExecutiveSummarySection.tsx`, `lib/insights.ts`, `package.json`/`package-lock.json` (7.384.0). Verified: project `tsc --noEmit` clean; dual-theme jsdom render confirming the rows are gone and the rail intact; behavioural fixtures asserting sentence and evidence byte-identity with the source rules, correct section and rank, the figures surviving the move, and the honest-gap path; full retained suite — **568 pass / 13 pre-existing, zero new failures**, plus **23 new v7.384 checks**.

## v7.383 · Key Insights becomes a right-hand rail, grouped into three sections — 2026-07-31

**Wayne:** *"lets have a box with rounded corners to the right side of the executive panel. Lable it key insights. Then have the top 3 missed opportunities, the top 3 competitor out performing and any other last category. Then have the option to show all in expanding it."*

**The rail.** The v7.382 box moves out from under the KPI cards and becomes a rounded 360px rail pinned to the right of the exec panel's top block. It stays in view while the reader scrolls the hero, the cards, the AI-answer-engines roll-up and the journey grid; everything below — the Share-of-Voice donut, the per-engine chart, the quick-wins ladder and the priorities — returns to full width, because those three need the horizontal room to stay readable. Below 1180px of panel width the grid collapses to one column and the rail unsticks and simply follows the cards.

Those three narrow-friendly blocks were **moved up into the left column** in the same change. Left where they were, the rail towered over a short left column and left a band of dead space beside it; moved up, the row balances and the sticky behaviour has something to travel against.

**Three named sections, top 3 each.** *Missed opportunities* · *Competitors outperforming* · *Quick wins ready now*, in that order, each independently ranked worst-first. Every rule in `lib/insights.ts` now declares which section it belongs to as a **typed** field, so a rule added later cannot silently fall out of the rail. The section list itself (`EXEC_INSIGHT_SECTIONS`) is exported from the rule file rather than hardcoded in the panel — one place decides what the sections are and what order they appear in.

The top-3 cut is presentational, exactly as the v7.382 cut was: **Show all** expands every section to its full length *and* reveals a **Context & risk** group holding the findings that belong to no section — the headline AI-visibility read, page-1 capture, Share of Voice, sentiment, citation share, read confidence. Nothing a rule computed is discarded to make the rail fit (Const I.6). The regression suite now proves this by RENDER: it clicks the expander in jsdom and asserts the expanded text is strictly longer than the collapsed text.

**Two new competitor rules, from real rival rows.** "Competitors outperforming" needed rival figures, not the client's own numbers reflected back. **K17** names the rival taking the largest share of page-1 clicks across the footprint and states it against the client's own share; **K18** names the rival appearing on the most tracked AI prompts and states the multiple. Both read rows that are already on screen elsewhere — K17 from the same `compEntries`/`serpEntries` the SoV donut slices, K18 from the same Profound roster the AI Answer Engines panel ranks (Const II.7). K17 rides the **same CTR curve as K7**, so it carries the same **Modeled** label and names the same source. **K19** was added to *Quick wins*: the mapped topics that already have a page behind them, which are optimisations rather than net-new builds.

**Honest when there is nothing to say (Wayne's call).** A rival that sits *behind* the client never renders as outperforming, and an absent Profound roster produces no prompt-share line. When the whole section comes up empty the rail says why — *"No tracked rival is measurably ahead of you here — the page-1 and AI-answer field is open rather than taken"* — because for TD Bank that absence is itself the finding: 93% of page-1 clicks across its footprint are captured by no tracked competitor at all. The section is never padded to fill three slots (Const I.5).

Retained-suite note (Const V.6): four v7.382 checks were **amended with dated notes, not deleted** — the box's title and subtitle changed for the rail, the array now arrives as the rail's `insights` prop, and the modeled Share-of-Voice line is now context so it is asserted on the *expanded* render (a stronger check, since it also proves the expander works). The v7.382 "exactly ONE line is modeled" invariant was **rewritten rather than relaxed**: it is now curve-parity — every modeled line must name the CTR curve, and no line may be modeled without it — which still catches a stray modeled figure while accommodating K17 legitimately riding the same curve.

Files: `components/brief/ExecutiveSummarySection.tsx`, `lib/insights.ts`, `app/globals.css`, `package.json`/`package-lock.json` (7.383.0). Verified: project `tsc --noEmit` clean; dual-theme jsdom render in both data states, collapsed *and* expanded, asserting identical light/dark text and no hardcoded hex; behavioural fixtures covering category assignment, per-section ranking, the rival-ahead / rival-behind / no-rival shapes, and that every finding lands in exactly one bucket; full retained suite A/B — **545 pass / 13 pre-existing, zero new failures**, plus **48 new v7.383 checks**.

## v7.382 · Executive Summary rebuilt to the approved layout + Key Insights — 2026-07-31

**Wayne:** *"let's update the executive panel to match this design layout. I would also like to include a box where it has 'Key Insights' and it would list all the key insights an executive or CMO would need to know."* The design he sent is tab 3 of the July-10 UX-review mockup (`GEO/orbitiq-ux-mockups-2026-07-10.html`, recs **M1 · M3 · F5**), built at the time against the v7.362 code and the TD Bank Jul-9 scan. This release ships that layout and the new box.

**The layout.** The hero leads with the score at display size, and each of the three pillars gets a label/value line above its own full-width meter instead of a cramped inline row; read confidence keeps its own column. The four KPI cards move to 30px figures with one supporting line each. The fourth card is now **Winnable prompts** — the count of prompts where a rival is cited and the client is not, with the leading rival named. It renders **only** when the AI Answer Engines panel (09) has data; with no Profound export the card falls back to the **Journey** read it replaced, so the row is never padded with an empty box and no reading is lost (Const I.5). The supporting-evidence row keeps the shared Share-of-Voice panel on the left — the same component Google Rank (06) renders, unchanged (Const II.7) — and gains **AI visibility by engine** on the right, built from the same strict `pfScoreEngines` series the AI pillar scores off, so the chart and the headline cannot state two numbers. With no Profound data that slot falls back to the existing LLM-probe view.

**Bar scaling, stated on screen.** Single-digit citation rates draw as hairlines at true scale, which is why the mockup exaggerated them ×10. A fixed multiplier breaks the moment an engine clears 10%, so the bars are instead **scaled to the top engine**, and the caption says so and states that every label is the true rate. Scaling is a drawing decision; the numbers are untouched. An engine with zero answers tested is dropped rather than drawn at 0% — but an engine tested and never citing the client stays, at 0%, in red: a blackout is a finding, not a blank.

**Key Insights.** A new box under the KPI cards, ranked worst-first: critical → watch → win. Sixteen rules live in `lib/insights.ts` beside the existing v7.366 sentence layer and follow the same contract — **pure functions over figures the Executive Summary has already read off the deep panels** (Const II.6). Nothing here fetches, re-derives, or re-counts anything: AI findings read the strict Profound tallies the pillar uses, rank findings read the canonical pool, journey findings read the same cluster rollups the Journeys panel renders. A rule with no real data behind it returns nothing rather than a placeholder sentence, so a project with only a keyword upload shows the one or two lines it can defend and no AI findings at all. Every line carries its source and freshness stamp. **Exactly one line is modeled** — Share of Voice — and it is labelled *Modeled* on screen and names the GrowthSRC 2025 curve in its evidence stamp (Const I.5a); the quick-win line deliberately states measured keyword counts and real search volume rather than the modeled click estimate. The top 8 show on entry with the full set one click away; the cut is presentational and nothing is dropped (Const I.6).

**Motion (M1 · M3).** Figures count up once on panel entry, cards and insight rows rise in staggered, and bars fill from zero. It runs **once** — a background refetch never re-rolls a number under a reader — and is disabled wholesale under `prefers-reduced-motion`. Both effects are CSS animations with `fill-mode: both` over a settled inline value, so a server render, the PDF/report route, the jsdom harness and a reduced-motion reader all get the final figure with no script running. The reduced-motion render is asserted byte-identical in text to the animated one.

**Click-through (F5).** Each KPI card opens the deep panel it rolls up from — Google Ranks, AI Answer Engines, Content Map, Journeys. The page passes an allow-listed `onNavigate`; the prop is optional, so the panel still renders standalone in the report route and the harness with the cards as plain cards.

**Not shipped:** the mockup's delta chips ("SoV ▲ +0.4pt") are marked SAMPLE in the mockup itself and need stored scan history (rec I5) before any of them can carry a real number — they are omitted rather than shown with invented deltas (Const I.1). The donut draw-in (M4) would mean editing the Share-of-Voice component that Google Rank (06) also renders; it was left alone to keep the two panels identical (Const II.7).

Files: `components/brief/ExecutiveSummarySection.tsx`, `lib/insights.ts`, `app/globals.css`, `app/projects/[id]/page.tsx`, `package.json`/`package-lock.json` (7.382.0). Verified: project `tsc --noEmit` clean under the real tsconfig; dual-theme jsdom render in **both** data states (with and without Profound) asserting identical text across light/dark, no hardcoded hex in the new markup, no NaN/undefined anywhere, and the scroll container intact; behavioural fixtures over the rule set covering ordering, determinism, and the honest-gap path; full retained suite A/B — **497 pass / 13 pre-existing, zero delta**, plus **70 new v7.382 checks**.

## v7.381 · exec-summary parity, wrong-box detection, labelled per-step clear — 2026-07-27

Three fixes, all traceable to something that happened on real data today.

**1 · The Executive Summary and the panel below it stated two different numbers.** v7.380 split the Profound denominators (strict `type == 'Visibility'` for the headline, full footprint for the opportunity lens) but only inside the AI Answer Engines panel. The exec AI pillar still computed `clientHits / totalRuns`, so the summary read **9.9%** while the panel read **12.60%** for the same client — the worst possible outcome for a document a client reads top-to-bottom. The exec pillar is a *view* over that panel (Const II.6), so it now reads the same strict tallies: headline %, the score-bar dimension, the landscape sentence and the engines-at-0 card all reconcile with the panel and with Profound's own dashboard. `ProfoundMetrics` gains `visRuns` / `visHits` / `visPromptN` / `visEngines` as **optional** fields; metrics saved before v7.380 carry none and the exec falls back to the blended figure exactly as the panel does, so the two can never disagree in either direction.

**2 · Right file, wrong box.** Wayne dropped `visibility.csv` into **Step 4 · Prompt Volume**. The v7.379 gate correctly refused it — but reported only *"missing required column: share"*, which is accurate and unhelpful when the real problem is that this is a different export entirely. The five Profound files look alike and four share most columns, so this is the commonest upload error. `identifySlot()` now checks whether the rejected header fully satisfies some **other** step's required schema and, when **exactly one** does, the diagnostic leads with **"Wrong box — this file belongs in a different step"**, names that step, and names the export this box wants. An ambiguous or unrecognised header is never guessed at — `looksLike` stays null and the original missing-column diagnostic stands (Const I.5: name the gap, never invent an answer).

**3 · The per-step clear control was invisible.** v7.379 added a per-box clear as a bare `×` glyph in the tile corner; Wayne asked for the feature again after it shipped, which is the only evidence that matters about discoverability. It is now a labelled **× Clear** pill with a rose outline, still only on loaded tiles, still recomputing from the remaining files rather than wiping everything.

Retained-suite note (Const V.6): the v7.379 check asserting `throw new ProfoundParseError(slot, missing, header)` was **amended with a dated note**, not deleted — v7.381 adds a 4th argument (`identifySlot(header, slot)`), so the assertion was relaxed to the call prefix while still asserting the throw.

Files: `components/brief/ProfoundVisibilitySection.tsx`, `components/brief/ExecutiveSummarySection.tsx`, `package.json`/`package-lock.json` (7.381.0). Verified: project tsc clean; 7 new assertions covering the exact real headers involved (visibility.csv → Step 4 identifies Responses; citations_data.csv → Step 1 identifies Citation Landscape; Prompts.csv → Step 5 identifies Prompt Volume; an unknown header is NOT guessed; both correct files still resolve); dual-theme SSR render; full retained suite A/B — **427 pass / 13 pre-existing, zero delta**, plus 13 new v7.381 checks.

## v7.380 · Visibility Score reconciles with Profound + coverage window — 2026-07-27

**Wayne:** the Profound dashboard showed **12.7%** visibility for US Bank while OrbitIQ showed **9.93%** on the *same* export. Neither was an arithmetic error — they scored **different prompt sets**, and the gap is fully explained by the `type` column:

| `type` | answers | client hits | visibility |
|---|---|---|---|
| `Visibility` (pure visibility prompts) | 3,564 | 449 | **12.60%** |
| `Sentiment, Visibility` (dual-purpose) | 8,442 | 743 | 8.80% |
| combined — what v7.379 scored | 12,006 | 1,192 | 9.93% |

Profound's Visibility Score counts only the pure `Visibility` rows; the dual-purpose sentiment prompts are real answers but sit outside its denominator, dragging the blend down 2.7pp. Reconciled exactly: over `type == 'Visibility'`, the trailing 6-day window 2026-07-21…26 gives 436/3,420 = **12.75% → 12.7%**, the dashboard figure to the decimal.

**Two denominators, each stated on screen, never mixed.** The headline Overall AI visibility card and the per-engine chart now use the **strict** set, so they reconcile with the client's own Profound screen (a deliverable that contradicts the client's dashboard is indefensible regardless of which denominator is more generous). Topic whitespace, prompt gaps, prompt coverage and Share of Voice deliberately keep the **full** 12,006-answer footprint — narrowing them to 165 prompts would discard two-thirds of the real answers the client could have won and collapse topic coverage from 71 topics to 20 (Const I.6: no unrequested caps). Every panel names its own denominator, and a new line above the cards states the coverage window and which set the headline uses. Metrics saved before v7.380 carry no strict tallies and fall back to the blended figure rather than silently mis-labelling it.

This also **flips the engine ranking**, which the blend was hiding: on the strict set Perplexity is the *worst* engine at 3.9%, not mid-pack at 6.8%; Copilot moves from worst to third. Strict per-engine: Google AI Mode 25.6%, Google AI Overviews 21.9%, Microsoft Copilot 8.9%, Google Gemini 8.8%, ChatGPT 6.6%, Perplexity 3.9%.

**Coverage window + prompt-inventory change.** The export spans 2026-07-20…26, and the prompt set *changed mid-window*: 852 answers/day were added on 07-24 (tagged "Checking account - new prompts" 534/day and "Savings account - new prompts" 318/day), taking the strict set from 144 to 996 answers/day. The new prompts score higher (~13-14% vs ~9-10%), so a pooled average across that boundary reads as a visibility **trend** when it is really a change of denominator — which is what Profound's green "+1.8%" is largely measuring. The panel now derives the window from the real `date` column, detects every day-over-day change in answer volume, and states it as an on-screen notice rather than averaging it away silently.

New in `Metrics`: `visRuns`, `visHits`, `visPromptN`, `visEngines`, `dateFrom`, `dateTo`, `dateDays`, `inventoryChanges`. `date` added to the v7.379 alias resolver as an optional column. The compute layer no longer calls the presentational `fmt()` helper.

Files: `components/brief/ProfoundVisibilitySection.tsx`, `package.json`/`package-lock.json` (7.380.0). Verified: project tsc clean; 12 new real-scale assertions against the actual 44MB `visibility.csv` (strict 449/3,564 = 12.60%, full unchanged at 1,192/12,006, window 07-20…26, +852/day change on 07-24 detected); dual-theme SSR render; full retained suite A/B — **414 pass / 13 pre-existing, zero delta**, plus 13 new v7.380 checks.

## v7.379 · Profound export schema drift — the panel can no longer report a silent zero — 2026-07-27

**Incident.** The AI Answer Engines panel reported US Bank Deposits at **0.00% overall AI visibility (0 of 12,006 answers), 0/366 prompt coverage and 71/71 topics at 0%** — a fully-formatted, entirely wrong result. Profound had changed its export schema: `normalized_mentions` was renamed to **`mentions`**, and `sentiment_claims` was **removed** (replaced by a sparse, brand-less `sentiment_v2_score`, 0.43% populated). Those two columns were the only sources of the tracked-brand roster, so the roster came back empty, `matchClient` fell through to the raw project name, and every client tally went to 0 by construction. The single-word columns (`type`, `platform`, `topic`, `prompt`, `citation_1..N`) survived because the old header lookup lowercased keys — which is why 12,006 answers, 71 topics, 366 prompts and 131,111 citations all parsed correctly and only the client numbers zeroed, making a broken parse look like a real finding.

**Real figures** for the same export after the fix: **9.93% overall visibility (1,192 of 12,006)**, **200/366 prompt coverage**, **5 of 71 topics at 0%**; best engine Google AI Mode 20.74%, worst Microsoft Copilot 5.95%.

**The actual defect was silence, not the rename.** `row[H['normalized_mentions']]` with an absent key yields `undefined` → `''` → zero, with no throw. Four layers now make that impossible:

- **Header normalisation** — `normKey()` strips BOM and collapses case *and all separators*, so `Normalized Mentions`, `normalized-mentions` and `normalized_mentions` resolve identically. Casing/separator drift can never break a column again without a code change.
- **Alias lists + a hard gate** — every logical field carries an alias list and a required flag; a missing REQUIRED column throws a named `ProfoundParseError` and the UI renders a diagnostic naming the file, the field, every alias tried and the header row actually found. Nothing is computed or saved from a partial parse (Const I.5). `sentiment_claims` is now optional, so its removal degrades to an honest on-screen notice instead of failing the upload.
- **Structural assertions** — aliasing only fixes renames. Answers parsed but zero brands found, or zero rows matching the Visibility run type, are structurally impossible for a real export and now fail loudly — catching value-shape drift that aliasing cannot. Profound's own `mentioned?` flag is tallied independently as a cross-check; a divergence over 2pp is surfaced rather than silently resolved. (On this export the two signals agree on all 1,192 of 1,192 rows.)
- **Client identification honesty** — `matchClient` now scores the share of the *candidate's* tokens covered rather than raw overlap. The old version took the first strict maximum, so "US Bank Deposits" scored "U.S. Bank" and "Bank of America" equally (the shared word "bank") and roster order decided the client — a silent wrong-client identification, more dangerous than the 0% this release fixes. Below a 0.5 threshold nothing is matched, and a failed match now renders as a rose "Client NOT found in data" badge instead of a green "auto-identified" badge echoing the project name back.

Also: `toks()` re-joins runs of single characters, so the initialism and its unpunctuated twin share one signature — the real export ships **both** "U.S. Bank" (1,169) and "US Bank" (1,223) as separate `mentions` strings, which previously matched only one surface form and split that brand's Share of Voice across two roster entries; the roster is now deduped by canonical signature. Per-box **clear** control on each of the 5 upload steps (Wayne) recomputes from the remaining files instead of the all-or-nothing global Clear data.

Files: `components/brief/ProfoundVisibilitySection.tsx`, `package.json`/`package-lock.json` (7.379.0). Verified: project tsc clean under the real tsconfig; 17/17 parser assertions at real scale against the actual 44MB `visibility.csv` (12,006 rows) plus the real `citations_data.csv` and `Prompts.csv`; dual-theme SSR render (no `dark:` variants, all palette colours 500/600); full retained suite A/B vs pristine v7.378 — **401 pass / 13 pre-existing, zero delta**, plus 18 new v7.379 checks.

## v7.378 · Send to Delivery — delivery baseline package — 2026-07-18

New header button **Send to Delivery** (in the project header, next to PDF / PPT Prompt) builds a one-click *delivery baseline* a colleague can integrate as the starting point for delivery work. It downloads a single zip:

- `delivery-manifest.json` — the machine-readable integration backbone: the full taxonomy nested **umbrella > theme > topic > keyword** with exact volume rollups; per-topic performance positioning (state, action, funnel stage, priority, quick-win, best real SERP position, client capture %); both journeys (product full-funnel + pre-product awareness); audience segments with attribution; competitor-gap scope (core vs adjacent); rank + modeled Share of Voice; AI / authority / local aggregates; and the panel insight findings.
- `orbitiq-delivery-<client>.xlsx` — human-readable mirror (Overview, Taxonomy, Keywords, Content Plan, Segments, Journey Stages, Insights).
- `csv/*.csv` — flat-file mirrors for pipelines.
- `README.md` — data dictionary.

The full footprint is included; every topic carries `inContentPlan` / `inDeliveryScope` flags marking the finalized delivery subset. The server route `/api/reports/delivery-package` reuses the assessment report's exact canonical assembly (Const II.6/II.7), so the package reconciles with the panels to the number; the serializer (`lib/export/deliveryPackage.ts`) never re-derives taxonomy, membership, volume, or attribution. Every value is a real rollup (Const I.1); Share of Voice is the only modeled metric and is labeled (Const I.5a); missing data is an honest gap (null). Data-vendor names are omitted. One-click download only — no email/push.

New: `lib/export/deliveryPackage.ts`, `app/api/reports/delivery-package/route.ts`; edited `app/projects/[id]/page.tsx`; version bump to 7.378.0. Verified: project tsc clean; serializer harness 27/27 at real scale; regression suite 347 pass / 13 pre-existing local FAILs, zero regression delta + 14 new v7.378 checks.

## v7.377 · assessment report — iQuanti-only attribution (McKinsey removed) — 2026-07-17

Client request (Wayne): remove the McKinsey partnership from the report. All four attribution sites in the assessment template now read iQuanti-only: page footers "OrbitIQ Assessment · Provided by iQuanti · {client}", cover PROVIDED BY "iQuanti", governance lede "proprietary to iQuanti", appendix endbrand "An iQuanti product". No other content changed.

Retained suite: the v374 brand check and v375 brandStill check were amended with dated notes (never deleted) to assert the NEW attribution AND that "McKinsey" is absent from every render mode; a new v377 block adds five source-level assertions on the template (no McKinsey anywhere; all four sites carry the exact iQuanti wording).

Files: lib/pdf/assessmentTemplate.ts, package.json/package-lock.json (7.377.0). Verified: project tsc clean; full retained suite A/B vs pristine v7.376 base — zero unexpected delta (only the 13 pre-existing local-ui/localpack baseline FAILs); local TD-fixture render eyeballed (cover + footer). Live-verified on TD Bank: 17-page report regenerated on production, 0 "McKinsey" occurrences, 16 "Provided by iQuanti" footers, cover/governance/endbrand updated, segments + journeys pages intact, no dates, no vendor names.

## v7.376 · assessment report — Audience Segments + Audience Journeys — 2026-07-16

Implements the approved v5 mockup: two new conditional pages, **PART IV · WHO IT AFFECTS** (the opportunity block shifts to PART V when they render).

**Audience Segments** — renders ONLY when the analysis snapshot holds `_audienceSegments`. Buyer cards from the stored segment research: share of volume (labeled modeled), tagline, demographics, trigger, real example prompts, and each segment's slice of the journey map (topics · optimize/build · biggest category). READ ties the top segment to the AI answer layer.

**Audience Journeys** — renders ONLY when the canonical topic build yields topics. Same canonical topics the panels count (one source of truth): topics-in-journey + groups, coverage (optimize vs net-new build), demand by funnel stage (real monthly volumes), the four-stage discovery path stored with the top segment's research, top journey groups, and the pre-product note when that lane hasn't been built.

**The engineering underneath (Const II.6/II.7 — one math, no forks):** the canonical cluster-topic chain (buildThemeClusters → buildPreProductClusters → buildTopicsFromTaxonomy/flattenTopics → buildCanonicalClusterTopics) moved VERBATIM from ThemeClustersPanel to **lib/clusters/canonical.ts**; the journey classifier closure moved from JourneySection to **lib/journey/classifier.ts**; the segment attribution (v7.170 exclusive word-overlap) + canonTopicState + the lane rule moved to **lib/journey/segments.ts**. Both panels import everything back and re-export their public names, so every existing consumer is untouched (retained check: the re-exports ARE the lib functions, by identity).

**Intent-assignment map persisted (v7.220 under-count guard):** the Layer-2 Claude pass moved to **lib/clusters/intentAssign.ts** (shared by the clusters route and the PDF route) and its result is now stored at `analyses.semrushSnapshot._clusterAssigns`. The clusters route persists what it computes and exposes a PUT write-through; the project page prefers the stored map, else writes its localStorage cache through once; the PDF route reads the stored map and computes+persists it when absent — the report can never build canonical topics on a silently-empty map.

Files: lib/clusters/canonical.ts + lib/clusters/intentAssign.ts + lib/journey/classifier.ts + lib/journey/segments.ts (new), lib/pdf/assessmentTemplate.ts, app/api/reports/pdf/route.ts, app/api/projects/[id]/clusters/route.ts, app/projects/[id]/page.tsx, components/brief/ThemeClustersPanel.tsx, components/brief/JourneySection.tsx, lib/category/categoryModel.ts, package.json/package-lock.json (7.376.0). Verified: project tsc clean; 13 new v376 retained checks; A/B zero delta vs pristine v7.375 base; local render with real-shaped TD fixtures eyeballed.

## v7.375 · assessment report v4 — no dates, Authority Signals + Local Search sections — 2026-07-16

Implements the approved v4 mockup (GEO/orbitiq-assessment-report-mockup-v4-2026-07-16.html) into the live report.

**Dates removed everywhere** (client request): the AssessmentData interface drops preparedDate/scanDate/aiDataDate; the route no longer computes them; cover, page-2 scorecard column, source lines, footers and end brand carry no dates. Retained check asserts no month-name date pattern anywhere in the output.

**New conditional section: Authority Signals** (PART II · THE DIAGNOSIS) — renders ONLY when projects.authority_snapshot holds a client row plus at least one competitor with real crawled overview counts (honest gap, I.5: omitted entirely otherwise). Client-vs-rivals table (Authority Score labeled *(modeled)* per I.5a; referring domains, AS≥50 tier, follow share, brand demand — facts from the crawled index), nearest-peer / top-tier-gap / brand-demand-gap ratio tiles, and the earned-media compounding tie-in.

**New conditional section: Local Search — The Map Pack** (PART II · THE DIAGNOSIS) — renders ONLY when the analysis snapshot's _localScan holds scanned keywords or listings. All rollups reuse lib/local/build.ts verbatim (II.7): buildPackRollup, buildReviewRollup, buildShareOfLocalVoice, buildLocalIndex (40/25/20/15 blend). Insight sentences are the panel's own shared rules L1/L2/L3 (localDiagnosisInsight, localUsurperInsight, reviewDeficitInsight) with the same top-miss selection rule. Review-count distribution (100+/25–99/1–24) tallied directly from listings. NOTE: the mockup's "top local categories" box was replaced by the shared Share-of-Local-Voice "Who holds the pack slots" — the category taxonomy model is client-side only (flagged before build, approved).

**Dynamic section numbering** — section numbers and page footers are assigned at assembly (__SEC__ placeholder), so conditional sections renumber cleanly in every data mode.

Governance table, cover INTELLIGENCE LAYERS, baseline scorecard, program page ("Running throughout") and appendix definitions gain their authority/local rows conditionally.

Files: lib/pdf/assessmentTemplate.ts (rewrite), app/api/reports/pdf/route.ts (passes authoritySnapshot + _localScan, date fields removed), package.json/package-lock.json (7.375.0). Verified live on TD Bank: 15 pages, Authority p.6 (td.com 41,037 RDs vs bankofamerica.com 86,728, 2.33× top-tier gap), Local p.7 (index 43, 24% presence 60/247, avg rank 1.5, 2.9★/64,377 reviews, Presto! ATM usurper finding), zero dates, partnership attribution on every page. Retained suite: 11 new v375 checks, A/B zero delta vs pristine v7.374 base.

## v7.374 · header PDF button → Client Assessment Report — 2026-07-16

The top-header PDF button now generates the multi-page **Search & AI Visibility Assessment** for the current project (design spec GEO/orbitiq-assessment-report-mockup-v3-2026-07-16.html, approved 2026-07-16) instead of the legacy brief.

**New: `lib/pdf/assessmentTemplate.ts`** — builds the report server-side from the SAME shared math the panels render (Const II.6/II.7): pool + capture via buildKwPool/computeVolumeMetrics, SoV via computeSov (named-curve label kept at every appearance, I.5a), the AI answer-layer sections (market position · engine-by-engine · prompt demand & winnable set · citation supply chain · sentiment) from the stored Profound panel metrics (projects.profound_data, v7.318), and insight sentences reused verbatim from lib/insights.ts. Sections whose data source is absent render an explicit honest-gap block — never a placeholder value (I.5). Report rules per Wayne: no data-vendor names in the client-facing output (generic intelligence-layer names); every page carries "Provided by the iQuanti & McKinsey Partnership".

**Changed:** `app/api/reports/pdf/route.ts` (assembles AssessmentData, renders Letter edge-to-edge; filename orbitiq-assessment-*), `app/projects/[id]/page.tsx` (button tooltip "Generate Assessment Report (PDF)").

**Post-deploy runtime fixes (same release):** the legacy puppeteer path failed on Vercel's AL2023/node22 runtime — (1) upgraded `@sparticuz/chromium` ^130→^149 + `puppeteer-core` ^23→^24 (libnss3 missing at launch), adapting the launch call to the v149 API (defaultViewport/headless statics dropped; setContent waitUntil 'load'); (2) added `outputFileTracingIncludes` for the PDF route in next.config.js — the v149 bin folder was no longer traced into the lambda ("input directory .../bin does not exist").

**Verified:** project tsc clean; retained suite A/B ZERO DELTA vs pristine v7.373 base (the 13 pre-existing local-ui/localpack fails documented 2026-07-06 remain, owned by their releases) + 10 new v374 retained checks PASS; both render modes (full + honest-gap) rendered to PDF and eyeballed page-by-page; LIVE end-to-end: TD Bank project → button → 200 + blob fileUrl → valid 13-page PDF from real stored data.

## v7.373 · post-release fixes — 2026-07-16 (login + admin panel go-live)

Follow-up patches to the v7.373 auth layer, all verified live in production. Three issues surfaced after the initial push and were resolved:

1. **Seven API route files had deployed empty.** `app/api/auth/{login,logout,bootstrap,me}/route.ts` and `app/api/admin/{users,users/[id],activity}/route.ts` were each 1 byte, so the Vercel build failed with a TypeScript "File is not a module" error and every build after the auth-core commit errored — leaving production silently on a stale partial build. Root cause was an earlier deploy step committing blank content. Fixed by re-verifying all v7.373 files against the live remote by length + rolling checksum and restoring the seven empty ones; the build then went green.

2. **`countUsers()` returned 0 despite existing rows.** The drizzle aggregate select `db.select({ n: sql`count(*)::int` }).from(appUsers)` yielded an undefined result key (→ 0) in some compiled route bundles, so `/api/auth/me` reported `needsBootstrap: true` even with users present. That made the sign-in page render the first-owner "create account" form for everyone, blocking all team logins. Root-caused with a temporary `/me` diagnostic that proved the split in a single request (raw `select count(*) from app_users` = 4 while the drizzle select = 0, same connection, `current_database() = neondb`). Fixed by rewriting `countUsers()` to a raw `db.execute` count parsed defensively across neon-http result shapes. A grep confirmed no other code used the aggregate-select pattern.

3. **Enforcement enabled.** `AUTH_ENFORCED=true` set in Vercel and redeployed. Verified live: an editor granted 2 projects sees exactly those 2, owners see all projects, and signed-out requests are walled (pages redirect to `/sign-in`, `/api/projects` returns 401).

Operational note (no code change): logging in as a second account in the same browser overwrites the owner session cookie on the shared domain, silently downgrading an already-open `/admin` tab so its actions fail — use separate browsers or an incognito window for role testing.

Files: `lib/auth/store.ts` (raw-SQL `countUsers`), plus restoration of `app/api/auth/{login,logout,bootstrap,me}/route.ts` and `app/api/admin/{users,users/[id],activity}/route.ts`.

## v7.373 — 2026-07-15 · User login + admin panel (roles + per-project grants + activity log)

The app's first authentication layer, in response to Wayne's request to gate OrbitIQ behind a login, manage users from an admin panel, and track who logs in and what projects they access or create. Before this release middleware.ts was an explicit no-op ("app is open access"). **Feature-flagged, staged rollout (Wayne's choice):** everything is gated behind the `AUTH_ENFORCED` env var — while it is unset the app behaves BYTE-FOR-BYTE as v7.372 (open access); set `AUTH_ENFORCED=true` (plus a random `AUTH_SECRET`) to enforce the login wall + per-project access. Ships: a real email+password sign-in (`/sign-in`) with a one-time first-owner bootstrap and no open sign-up; an owner/admin admin panel (`/admin`) with Users & Access (role + per-project grant toggles + suspend/remove, last-owner & self-delete guards), Add User, and an Activity Log of REAL audit events (Const I.1 — logins, project open/create/edit, user-management), filterable, with an honest empty state (I.5); role tiers (owner/admin see all; editor creates/edits inside granted projects; viewer read-only) + per-project grants enforced at the single project-route source. Four new tables created at runtime via `ensureAuthTables()` CREATE TABLE IF NOT EXISTS (build stays `next build` only): app_users, project_access, auth_sessions, audit_events. Sessions = jose-signed httpOnly JWT verified on the edge (no DB round-trip); passwords hashed with node:crypto scrypt; one new dep (jose ^5.10.0). Verified on a clone of the live repo: full-project tsc --noEmit CLEAN under the project tsconfig, no target override (V.1a); real `next build` CLEAN with the edge middleware bundling jose-only (no node:crypto in the edge path); dual-theme render (V.5) of /sign-in and /admin (users table, grant-toggle drawer, activity feed, add-user form) legible in BOTH light and dark, orbit-* tokens only (IV.6). Regression posture (V.6): purely additive and flag-gated — with AUTH_ENFORCED off, middleware early-returns and every access check returns open, so existing behavior is unchanged (the clean next build confirms the additive edits compile); NOTE — the carried-forward retained `_verify/run.sh` suite was NOT re-run in this cloud session (it lives in the device source folders, not the repo), so the existing-behavior guarantee rests on the flag-off no-op invariant + the clean build. Full detail in CHANGELOG_v7.373_ENTRY.md. (lib/auth/*.ts NEW · app/api/auth/*/route.ts NEW · app/api/admin/**/route.ts NEW · app/admin/page.tsx NEW · db/schema.ts · middleware.ts · app/(auth)/sign-in/[[...sign-in]]/page.tsx · app/dashboard/page.tsx · app/api/projects/route.ts · app/api/projects/[id]/route.ts · package.json · package-lock.json)

## v7.372 — 2026-07-15 · Fix: theme-panel add-to-cart could overwrite the whole Content Plan selection

Bug fix for v7.371. The theme-panel checkbox saved the ENTIRE content-plan selection as a full overwrite, using the copy the panel loaded when it opened. When that local copy drifted out of sync with the real selection — because another panel (Content Map / Journey / Content Plan) had added topics, or a rapid earlier click raced the full-replace endpoint — a single toggle here overwrote the real selection with the stale copy and silently dropped every topic it didn't know about; the same drift made an "uncheck" read the wrong state and re-add instead of remove. Root cause: full-set-replace PUT of an optimistic local set (Const I.1 violation — a real user selection could be lost). Fix: each toggle is now a serialized READ-MODIFY-WRITE — it re-reads the current selection from the server, applies ONLY its own add/remove delta for the clicked ids, writes that, and resyncs the local set from the server's returned selections; writes are chained so overlapping clicks can't race; the checkbox set also refreshes on window focus so it reflects selections made in other panels. The add-vs-remove decision still comes from what the user sees, so intent is preserved, but it is applied to the live server set — cross-panel selections are never clobbered and "uncheck" reliably removes. No route or schema change; ONE file. Verified on a clone of the live repo: full-project tsc --noEmit CLEAN (V.1a); SSR render of the checkbox unchanged in all three states (V.5); retained regression suite A/B — same 317 PASS both sides, 13 known pre-existing local-panel FAILs unchanged, plus a new v7.372 clobber-safety check (the write path re-reads and applies a delta rather than PUTing a whole local set) all PASS (V.6); live-verified on TD Bank that adding a theme topic leaves a pre-existing Content-Map selection intact and that unchecking removes cleanly. (components/brief/ThemeClustersPanel.tsx · package.json)

## v7.371 — 2026-07-15 · Theme cluster panel: "add to cart" into the Content Plan

Wayne asked for the same add-to-cart control the Journey list and Content Map already have to appear in the Theme cluster panel, so a theme (or its whole umbrella, or a single topic) can be pushed into the Content Plan straight from where he's reading the cluster tree — with every one of the existing behaviors. The THEME · PRODUCT table now carries the shared PlanCheckbox at all three levels: on each topic row (toggles that taxonomy topic id), on each theme header (toggles every child topic under it), and on each umbrella header (toggles every topic under the umbrella). It is the SAME mechanic and the SAME data as the Journey/Content-Map checkbox, not a parallel copy (Const II.7): the box reads and writes the one shared content-plan selection via GET/PUT `/api/projects/[id]/content-plan`, keyed by the taxonomy topic id (`Topic.id` = the `ContentTopic.id` the plan is keyed by), so checking a theme here and checking the same topic on the Journey row toggle the exact same entry — and it shows up in the Content Plan sub-nav immediately. Header boxes carry the none/some/all state with an indeterminate dash on a partially-added group (first click fills a partial group to all, next click clears it); the save is optimistic and reverts on failure so the UI never claims a save that didn't happen (honest gap, I.5); the box stops row-click propagation so adding to the plan never also expands/collapses the row. Theme-token colors only — the green-check/dash box is byte-identical to the shipped Journey checkbox and holds in both themes (IV.6/V.5). Verified on a clone of the live repo: full-project tsc --noEmit CLEAN under the project tsconfig, no target override (V.1a); SSR render of the checkbox in all three states with theme tokens only (V.5); retained regression suite A/B — 317 PASS both sides, the 13 known pre-existing local-panel esbuild-alias FAILs unchanged (zero delta), plus 11 new v7.371 invariant checks all PASS (V.6). (components/brief/ThemeClustersPanel.tsx · package.json)

## v7.370 — 2026-07-15 · Authority Calculator: campaigns-to-bridge math on real scan data

The second half of the authority arc: a new Authority Calculator panel (left-nav sub-item under Google Rank Authority, alongside Authority signals) that answers Wayne's core question — how many campaigns bridge the authority gap? The campaign yield is Wayne's stated rule, named on-screen and editable: 1 campaign = 1 guest-blog placement = 1 new referring domain, with a campaigns-per-month setting for the timeline and a quality basis picker (all referring domains, or only those at AS>=10/30/50). Domain bridge: one card per competitor computing deficit = competitor minus client on the chosen basis from the stored authority scan (real whole-domain Semrush counts), campaigns = ceil(deficit / RDs-per-campaign), months = ceil(campaigns / campaigns-per-month) — every campaign figure carries a modeled chip, a transparent-math help bubble, and an explicit floor caveat (assumes the competitor's profile stays static); a client already ahead reads "no bridge needed". Targeted pages bridge: paste any page URLs (yours + the competitor pages ranking for the same keyword), see the estimated Semrush cost (~146 units/page: overview 45/request + ascore profile <=101 lines), confirm, streamed progress with ETA — page pulls are stored per-URL on the snapshot (merged additively; a domain re-scan never wipes them, and vice versa), then page-vs-page bridges with the same math. Category bridge: an honest gap (Const I.5) explaining it needs the category->pages mapping layer (client pages from the canonical pool + benchmark pages from stored SERP scans) rather than a domain-level shortcut dressed up as category data. Empty state routes to the Google Rank Authority panel with an in-card primary CTA. Const I.5a throughout: real inputs dated on-screen, the assumption named as the user's own, the math transparent, never a rank guarantee. In-card CTAs + HelpTip bubbles per the v7.368/v7.369 UX lessons. Verified: full-project tsc CLEAN (V.1a); 17/17 jsdom harness — exact bridge math (45,691 campaigns / 11,423 months on the real TD-vs-BofA fixture; basis switch to AS>=30 recomputes 7,694; page bridge 962), ahead case, modeled labels, floor caveat, empty-state navigation, both themes (V.5); retained suite re-run: 307 PASS, zero unexpected delta (V.6). (components/brief/AuthorityCalculatorSection.tsx NEW · app/api/projects/[id]/authority-scan/route.ts · app/projects/[id]/page.tsx · package.json)

## v7.369 — 2026-07-15 · Authority panel: hover help on every column header

Wayne asked what the comparison-table columns actually mean and whether the top-50 anchor limit affects the domain scoring, and requested circled "?" icons with popup definitions on each header. Every column of the Domain authority signals table now carries a small ?-bubble (CSS hover reveal with a native title fallback, orbit-card surface so it holds both themes): Domain, Authority Score (a 0–100 modeled composite — an estimate, never measured data), Ref. domains (whole-domain unique linking sites — one domain, one vote), RDs AS≥10/30/50 (quality tiers computed from the FULL authority distribution — every referring domain, not a sample; the top-50 row limit applies only to the anchor-text detail view), Follow share (follow vs nofollow from whole-domain totals), and Brand demand /mo (real monthly searches for the brand phrase). The definitions are deliberately honest about measured vs modeled and whole-domain vs sampled, extending the panel's I.5a labeling into the column level. No data or route changes. Verified: full-project tsc CLEAN (V.1a); dual-theme jsdom render 12/12 — all 8 help icons render with their definitions and title fallbacks in light AND dark (V.5); orbit-* tokens only (IV.6). (components/brief/GoogleRankAuthoritySection.tsx · package.json)

## v7.368 — 2026-07-14 · Authority panel UX: visible Run-scan button + plain-language row-limit help

Wayne opened the new Google Rank Authority panel and could not find the scan trigger — the header "Run authority scan" button (hairline border, secondary text) blended into the dark background, and the toolbar "Refresh Analysis" button does something else entirely (it re-runs the keyword analysis). Fix: the empty state ("No authority scan yet") now carries a primary accent-filled "Run authority scan" button inside the card, so the action lives where the data lives (Const IV.4); the header button remains as the in-place rescan CTA once a snapshot exists. Also added a plain-language explanation to the dry-run confirmation card answering "what do these limits mean": Anchor rows = the top anchor texts (the clickable words other sites use when linking to each domain) ranked by how many different sites use them — powers the brand-vs-keyword anchor read, 40 units per row; Category rows = the topics Semrush files each linking site under (e.g. Finance, Real Estate) — measures how on-topic a link profile is. No data or route changes. Verified: full-project tsc CLEAN (V.1a); dual-theme jsdom render 4/4 — the CTA renders inside the empty-state card with the accent fill in light AND dark (V.5); orbit-* tokens + text-white-on-accent per app convention (IV.6). (components/brief/GoogleRankAuthoritySection.tsx · package.json)

## v7.367 — 2026-07-14 · Google Rank Authority panel: real backlink-authority signals

Wayne is building an authority-bridging workflow: measure the client-vs-competitor authority gap, then (v7.368, the Authority Calculator panel) estimate how many campaigns — one campaign = one guest-blog placement = one referring domain, Wayne's stated assumption — bridge it at the domain, category, or targeted-page level. The Google Rank Authority nav item rendered "Coming soon"; this release builds the measurement half. New POST /api/projects/[id]/authority-scan pulls, per domain (client + every configured competitor), the real Semrush backlink profile: backlinks_overview (Authority Score — modeled composite, labeled; total backlinks; referring domains; follow/nofollow), backlinks_ascore_profile (referring domains per AS value with exact TS quality-tier rollups AS>=10/30/50), backlinks_anchors (top N by referring domains), backlinks_categories_profile (topical categories — Semrush's modeled classifier, labeled), and phrase_this on the brand phrase (real entity demand). The scan is dry-run-first: the panel shows the estimated Semrush units with editable anchor/category row limits and the user confirms before anything is spent (Const I.6); the run streams determinate progress with an ETA (IV.2) and persists on the project row (projects.authority_snapshot — survives the full keyword reset, ensured in the list + [id] + scan routes per the v7.268/v7.327 column lesson). Verified rates added to the usage ledger (backlinks docs checked 2026-07-14: overview 45/request, anchors 40/line, ascore profile 1/line, phrase_this 10/line; the unpublished categories rate deliberately stays on the assumed-default path with its meta note). The panel shows a client-vs-competitor comparison table (AS labeled modeled, referring domains, quality tiers, follow share, brand demand), referring-domain gap ratios computed from the real rows, per-domain anchor cards with a deterministic brand-token lower bound (rule disclosed on-panel), topical categories, and a provenance footer; in-place rescan CTA + last-scan timestamp (IV.4/IV.5), orbit-* tokens only (IV.6). Every count is a crawled Semrush index row (I.1); failed pulls render as honest gaps (I.5). Note: this release renumbered mid-flight from v7.366 after a parallel session shipped the Insight-sentences v7.366 — the schema commit landed with v7.366-labeled comments and was relabeled in a follow-up commit; the feature is v7.367 throughout. Verified on a clone of the live repo: full-project tsc --noEmit CLEAN (V.1a); retained regression suite A/B zero unexpected delta (13 known pre-existing local-panel FAILs unchanged) + 15 new v7.367 checks all PASS (V.6); dual-theme jsdom render 16/16 (V.5). Full detail in CHANGELOG_v7.367_ENTRY.md. (app/api/projects/[id]/authority-scan/route.ts NEW · components/brief/GoogleRankAuthoritySection.tsx NEW · lib/apis/semrush.ts · lib/usage/record.ts · db/schema.ts · app/api/projects/route.ts · app/api/projects/[id]/route.ts · app/projects/[id]/page.tsx · package.json)

## v7.366 — 2026-07-14

**Insight sentence layer — every major panel now states its strongest finding (Phase 1 of the 2026-07-14 insight review).** Computed, client-facing sentences with evidence + freshness stamps, rendered as pure views over each panel's existing real-data rollups (Const II.6); a rule that doesn't fire renders nothing (honest gap, I.5). Fire thresholds are presentational only — no data is trimmed or hidden (I.6).

- NEW `lib/insights.ts` — pure, unit-tested insight rules: G1 demand inversion, G2 land grab, G6 build-vs-optimize mandate + pre-product silent zero, G8 funnel blind spot, G9 big-category underperformance, A2 AIO toll booth, A3 shadow competitor, A4 earned-media fast path, A6 known-but-never-recommended, A8 AI whitespace, L1-L4 local diagnosis/usurper/review-deficit/pre-scan teaser, E3 execution gap.
- NEW `components/brief/InsightBanner.tsx` — shared banner renderer; theme-token-only styling (IV.6/V.5).
- Wired: Theme Clusters (G1+G8), Journeys (G6 mandate beside Completeness + pre-product zero), Keyword panel (G9 over guarded categories), SovPanel -> Google Ranks + Exec (G2, GrowthSRC label per I.5a), SERP Features AIO tab (A2), AI Answer Engines (A3+A4), Exec (A6+A8), Local Search (L1-L3 + L4 empty-state teaser), Content Plan (E3, both empty and populated states).
- Verify: real-project tsc --noEmit clean on the live clone; retained suite 334 PASS with 42 new v366 checks (13 known pre-existing local*/esbuild FAILs unchanged, zero delta); banner rendered in BOTH themes with real token CSS.

## v7.364 — 2026-07-11 · Push to Brief Agent now exports Excel in the Briefing Agent template

Wayne asked to switch the Content Plan "Push to Brief Agent" export from a Word doc per article to an Excel workbook per article, formatted to match his "Briefing Agent Data Population" template so the output drops straight into the CA → Jasper workflow. Each article now downloads as an .xlsx with the same two tabs as the template — "Content Brief (Jasper Grid)" (17 columns) and "Required Orbit Outputs" (13 columns) — carrying the exact template headers, source labels and descriptions, with one data row per article. The Orbit-sourced columns are filled from real data; the CA-manual and Jasper-created columns (Project Context, Audience Overview, Visual Content Recommendation, Meta Elements) are left blank for the downstream workflow. The bundle structure is unchanged: one outer zip → one zip per audience segment → one workbook per article, shared articles riding into every segment's zip. Column mapping: Primary Keyword = the article's highest-volume target keyword with its real Semrush MSV (Const III.8); Secondary Keywords = the rest of the canonical set with real MSVs; Target GEO Prompts, Internal Linking and Pre-Sale Audience are filled client-side from data already in hand. The three SERP-derived groups the browser can't build — Top-Ranked competitors, Direct competitors, and PAA — come from a new server route, POST /api/projects/[id]/brief-enrich: Top-Ranked 1–3 are the top-3 organic results for the primary keyword (real SerpAPI rows: domain, URL, title, plus whether the domain is cited in that keyword's AI Overview) with the page's real first <h1> fetched server-side; Direct 1–3 are the project's configured competitors shown with their own ranking (or AI-Overview-cited) page for that keyword, blank when they neither rank nor are cited. PAA questions come from SerpAPI — reused free when the keyword is already scanned, else live-scanned (credit-safe, capped, and merged back into the snapshot so the next brief reuses them). Every value written is a real source row (Const I.1); missing data — including the "10X content description," which is intentionally left to the CA — is blank, never fabricated (I.5). The button now shows two-phase determinate progress with an ETA ("Enriching briefs… X of N · ~Ns left" → "Building briefs… X of N", Const IV.2). No new dependencies (xlsx + jszip were already in the tree). Verified on a clone of the LIVE repo: full-project `tsc --noEmit` CLEAN (V.1a); a 36-check Node harness that builds a real bundle and asserts BOTH sheets' headers match the uploaded template cell-for-cell, the full data mapping, the enrichment core (top-3 excludes client, direct organic-then-AIO fallback, AIO flag, PAA dedup) and the H1 extractor; and the full retained regression suite re-run A/B against base — 292 pass, the 13 known pre-existing esbuild-alias FAILs unchanged, zero unexpected delta — with the v7.354 brief block updated (dated) from .docx to .xlsx assertions per V.6. (lib/export/briefExport.ts · lib/apis/pageMeta.ts NEW · lib/apis/briefEnrichCore.ts NEW · app/api/projects/[id]/brief-enrich/route.ts NEW · components/brief/ContentPlanSection.tsx · package.json)

## v7.363 — 2026-07-10 · API Usage cost: real tokens × published rates → USD

Wayne asked to translate a project's API usage into US dollars (starting with TD Bank). The api_usage ledger already records REAL per-call token counts, but it stores each Anthropic/OpenAI row as input+output summed and the read routes collapse every model into one line — and Anthropic list rates span 25× (Haiku input $1/M to Opus output $25/M), so a summed total can't be priced defensibly without the per-model input/output split. That split was already sitting in each row's meta (inputTokens / outputTokens); this release exposes and prices it. New shared, sourced rate card (lib/usage/pricing.ts, verified 2026-07-10: Claude Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.6 $5/$25, GPT-4o mini $0.15/$0.60 per 1M in/out); a read-only GET /api/usage/cost that sums meta input/output tokens per project+model, applies the rates, and returns per-project + grand-total USD with the rate card, its sources, and a plain basis note; and an "Est. cost (USD · list price)" column added to the API Usage dashboard with an on-panel provenance line (rates, as-of date, source links, and the caveat that it's a computed estimate at list price — not the invoice; caching/batch/negotiated discounts not reflected; Semrush units, SerpAPI searches, and image generations are plan-dependent or count-only and left unpriced). Per Const I.5a the dollar figure is a derived metric: real token counts × a named, sourced published list rate, labeled a computed estimate, never presented as measured billing (provider dashboards remain the source of truth). Cost is additive — if the cost route fails the usage view still renders. No existing behavior changed; both new routes are read-only. Verified on a clone of the LIVE repo: full-project tsc --noEmit CLEAN (V.1a), a 13-check money-math + aggregation harness on the real compiled pricing logic, a dual-theme jsdom render (10/10 — USD column, per-project value, grand total, and rate-source link in both light and dark), an SSR smoke render, and a theme-token scan (orbit-* only). Full detail in CHANGELOG_v7.363_ENTRY.md. (lib/usage/pricing.ts NEW · app/api/usage/cost/route.ts NEW · components/dashboard/UsageRollup.tsx · package.json/package-lock.json)

## v7.362 — 2026-07-07 · Fix phantom "N selected" — heal orphaned Content Plan selections

Wayne saw "2 selected" on the Content Map with no checkbox actually ticked. The saved Content Plan selection is keyed by ContentTopic.id and persisted on the project; after a re-analysis regenerates the taxonomy, ids saved under the OLD taxonomy no longer match any current topic — they can't render a checked row, but they still counted toward the "N selected" total, so the count claimed selections that no longer exist. The Content Map now reconciles the saved selection against the live canonical topics once they resolve: any selected id not present in the current topic set is pruned, the corrected set is written back to the project (so the count is honest here, in the Content Plan, and in Scope — scope ⊆ plan is pruned by the same PUT route), and the checkboxes and count agree. The heal only runs after the canonical topics have loaded (never while empty, so a valid selection is never wiped) and is a no-op when nothing is orphaned. No other behavior changed. Verified: full-project `tsc --noEmit` CLEAN on the live-repo clone + a unit check of the prune logic (keeps valid ids, drops orphans, no-ops when all valid). One file. (components/brief/ContentMapSection.tsx · package.json/package-lock.json)

## v7.361 — 2026-07-07 · Content Map steps in cards — visual separation

Wayne said the Step 1 / 2 / 3 stack read as one flat blob with no separation. Each guided step now sits in its own card — a raised panel with a hairline border and rounded corners — so the three blocks read as distinct sections instead of running together. Step 1 (Choose your audience), Step 2 (Filter & focus) and Step 3 (Select your topics) each get a card via a new shared StepCard wrapper (card + the existing StepHeader inside). Within Step 2, the active dimension's chips now sit in an inset "tab-panel" that attaches under the tab strip (square top, rounded bottom, slightly darker fill), so the tabs and their chips read as one connected control instead of floating rows. Purely presentational — same tokens, both themes (IV.6); no behavior, data, or filter logic changed. Content-Map-only (`mode==='content'`); the Content Plan and Scope panels are untouched. Verified: full-project `tsc --noEmit` CLEAN on the live-repo clone + an SSR render confirming Step 2 + Step 3 cards render, the dimension tabs are intact, and StepCard renders its rounded container. (components/brief/ContentPlanSection.tsx · ContentMapSection.tsx · package.json/package-lock.json)

## v7.360 — 2026-07-07 · Content Map filter redesign (Option C): dimension tabs

Wayne asked to redesign the Content Map filter section to be more organized and professional, and to fold the priority buckets in. From three mockups he picked Option C — a dimension tab strip over one contextual chip row. The Step-2 filter area is now a single tidy row of tabs — Priority · Funnel stage · Search demand · Where you rank · Status — and picking a tab shows only that dimension's chips (each an "All" plus its values with count, monthly volume, and an Excel download, exactly like the old "Where you rank" chips). Clicking a chip filters the list; clicking it again clears that dimension. Dimensions combine (AND): the list is one flat set filtered by every active dimension, and each tab's chip counts/volumes are FACETED over the other active filters, so a chip always shows what picking it would actually yield in the current context. Any active filters from tabs you're not looking at surface as removable pills under the chips (with a Clear all), and each tab shows a small dot when it has an active filter — so nothing is hidden. This replaces the previous stack (big status cards + separate priority cards + View lens + group chips + Where-you-rank row) and the funnel/demand GROUPING view — funnel stage and search demand are now filter dimensions, and the list stays flat, sorted priority→distance→volume. The inline row Move-to-priority control (v7.359) and the drawer are unchanged, as are the Content Plan and Scope panels (this redesign is Content-Map-only). Verified: full-project `tsc --noEmit` CLEAN on the live-repo clone + an SSR render confirming all five tabs, the priority chip row, the preserved inline Move control, and that the Content Plan panel is untouched. One file. (components/brief/ContentPlanSection.tsx · package.json/package-lock.json)

## v7.359 — 2026-07-07 · Inline priority move — right on the row, no drawer needed

Wayne asked to keep the drawer's Move-to-priority control but also surface it inline on each Content Map row, in the open space beside the topic. Every content row now carries a compact **Move · P0 P1 P2 P3** control in that space: click a tier to reassign the topic instantly (same sticky, DB-backed override as the drawer, v7.358), and clicking the current tier when it's already a manual move resets it to auto. The current tier is highlighted in its priority colour, and the row still shows the ✎ manual marker. It uses the exact same optimistic handler + persistence as the drawer control (one `onMovePriority`, Const II.7) — the drawer version stays for the full topic view. The control is Content-Map-only (it renders where `onMovePriority` is wired); the Content Plan / Scope rows are unaffected. Verified: full-project `tsc --noEmit` CLEAN on the live-repo clone + an SSR render confirming the inline Move control renders on content rows and not on plan rows, with the manual marker intact. One file. (components/brief/ContentPlanSection.tsx · package.json/package-lock.json)

## v7.358 — 2026-07-07 · Manual priority moves: reassign a topic's bucket, sticky across re-analysis

Wayne asked to be able to edit a topic and move it manually to a different priority bucket — and (v7.357 decision) for that move to be a **sticky override that survives re-analysis and reconciles across every panel**. Opening a topic on the Content Map now shows a **Move to priority** control (P0 / P1 / P2 / P3, plus **Reset to auto** once moved); one click reassigns the topic and it re-scores instantly. Moved topics carry a **Manual** tag in the drawer and a small ✎ marker on the priority pill so it's clear the bucket was set by hand, not by the scorer. The move is **persisted per project** in a new `projects.priority_overrides` column (ContentTopic.id → P0..P3), applied at READ time — injected onto the snapshot as `_priorityOverrides` (exactly like the scope-gate overrides, v7.326) and applied inside the ONE shared plan builder — so the move takes effect **without re-analysis** and every panel that reads priority (Content Map, Content Plan, Scope, Executive Summary) shows the same bucket (Const II.7). A re-analysis keeps your moves (the override is keyed by topic id, stored on the project, not on the analysis snapshot); resetting a topic reverts it to the auto tier. The manual bucket overrides only the priority tier — distance-to-conversion and quick-win stay the auto signals (they describe the topic, not your workflow choice). Also in this release (Wayne follow-up on the v7.357 views): the Content Map's **By funnel stage** and **By search demand** lenses now surface each stage / demand bucket as a **selectable chip** carrying its topic count and monthly volume with an Excel download (like the "Where you rank" chips), and picking a chip filters the list to that group — the count, "Select all shown" and "Clear all" all track the visible group. New `PUT/GET /api/projects/[id]/priority-overrides` mirrors the scope-overrides route byte-for-byte (full-set replace, no-store, runtime `ADD COLUMN IF NOT EXISTS`); the column is also ensured on the dashboard-list and project-page load paths so a `SELECT *` never 500s before the route is first hit (the projects-list ensureColumns lesson, v7.327). The Content Map applies moves optimistically for instant feedback, then persists and calls back to the page to refetch and re-hydrate every panel. Verified on a clone of the LIVE repo: full-project `tsc --noEmit` CLEAN, an 8-check Node harness on the real compiled logic (override wins, manual flag, distance untouched, scope rollup reflects moves and still partitions the total, unknown-id safety), and an SSR render of both panel modes confirming the manual marker renders. Full detail in CHANGELOG_v7.358_ENTRY.md. (db/schema.ts · app/api/projects/[id]/priority-overrides/route.ts NEW · app/api/projects/route.ts · app/api/projects/[id]/route.ts · app/projects/[id]/page.tsx · lib/journey/contentPlan.ts · components/brief/ContentMapSection.tsx · ContentPlanSection.tsx · ScopeSection.tsx · ExecutiveSummarySection.tsx · package.json/package-lock.json)

## v7.357 — 2026-07-07 · Content Map becomes a guided flow: P0–P3 tiers, funnel & demand views

Wayne asked to turn the Content Map into a stepped workflow and give it more ways to slice the topics. The panel now reads as **Step 1 Choose your audience** (the segment chips), **Step 2 Filter & focus**, and **Step 3 Select your topics** (the checkboxes), each with a numbered header. Step 2 gains three things: a **P0–P3 priority-card row** (clickable filters — P3 is a new fourth "Backlog" tier), and a **View lens** that regroups the list either **by funnel stage** (Decision → Consideration → Awareness → Retention, lower-funnel first) or **by search demand** (High / Med / Low), each group carrying its own count and volume. The **fourth priority tier (P3 = Backlog)** extends the funnel-×-demand model approved with v7.356: P0 = brand/decision with real demand or consideration/retention above the median; P1 = those below median or brand/decision with no demand; P2 = product-awareness below median or pre-product above median; **P3 = pre-product below median** (farthest from conversion + thinnest demand). Demand buckets follow Wayne's rule — Low = at/below this project's median topic volume, Med = above median, High = top ~10% (90th-percentile outliers) — computed once over the whole topic set so the buckets stay stable under any filter. Everything is an ordinal from the stored funnel-stage tag (Const III.11) over the exact volume rollup (I.1); nothing is modeled. The scorer stays ONE shared `scoreTopic` feeding all four plan panels, so P3 and every tier reconcile across Content Map / Content Plan / Scope / Executive Summary (II.7) — the shared `Priority` type, `scopeOf` rollup, Scope multi-year lanes (P3 → Year 4+), and the brief export all learn the new tier in lockstep. Verified on a clone of the LIVE repo: full-project `tsc --noEmit` CLEAN, a 28-check Node harness on the real compiled logic (4-tier matrix, demand buckets, scope partition), and an SSR render of both panel modes confirming the steps, the P3 card, and both views render. The manual "move a topic to another priority bucket" is the next release (v7.358, DB-backed so it survives re-analysis). Full detail in CHANGELOG_v7.357_ENTRY.md. (lib/journey/contentPlan.ts · components/brief/ContentPlanSection.tsx · ContentMapSection.tsx · ScopeSection.tsx · lib/export/briefExport.ts · package.json/package-lock.json)

## v7.356 — 2026-07-07 · Content Map priority reads the funnel: lower-funnel & brand terms rank higher

Wayne asked to stop flattening every product-journey topic to one distance-to-conversion and instead let the funnel stage drive priority — lower-funnel, high-intent-to-convert terms should rank higher — and to treat brand / brand-modifier terms as higher priority because they're lower-effort wins. Each topic already carries its constitutionally-fixed funnel-stage tag (III.11: intent group → Awareness/Consideration/Decision/Retention), so we now read that stored stage instead of hard-coding distance 2 for all product topics. New mapping: Decision → distance 1 "At decision" (P0 when it has real demand, else P1); Consideration/Retention → distance 2 "Evaluating" (P0 when high-demand, else P1); product Awareness → distance 3 "Researching" (P1 when high-demand, else P2); pre-product unchanged (4/3, P2 unless a researching-stage topic has high demand). Brand-related topics — brand-category or a topic whose text carries the client's own brand token — are treated as high-intent, low-effort wins: distance 1, P0 when they have real demand, else P1 (Wayne 2026-07-07); only the client's brand is bumped, competitor brands never are. Quick-win keeps its meaning (a competitor gap close to conversion, distance ≤ 2, with high demand) and so now spans exactly the lower-funnel + brand tiers. The Content Map's row sort — previously volume-only — now sorts within each priority tier by funnel proximity then real volume (the same tiebreaker the Content Plan already used), so the strongest, closest-to-conversion opportunities surface at the top of each tier. Distance is an ORDINAL from the stored stage (not a metric, per the panel's own header); volume stays the exact TypeScript rollup (Const I.1) — nothing is modeled. One shared scorer (scoreTopic) and one shared brand-vocabulary helper (brandTermsOf) are used by ALL four panels that build the plan — Content Map, Content Plan, Scope, Executive Summary — so a topic's distance and priority reconcile everywhere (Const II.7); the dead distanceOf helper was removed (II.8). Verified on the live v7.355 source: isolated tsc clean on the pure lib (mirrored project tsconfig, V.1a); a 32-check Node harness on the real compiled logic (full priority matrix, brand bump, brand-token guard against short-token false matches, quick-win, exact scope rollups, and that product distances now genuinely vary); all four changed components syntax-clean; render support (DistMeter + distFill, both themes) already covers distances 1–4 with no JSX change. Full detail in CHANGELOG_v7.356_ENTRY.md. (lib/journey/contentPlan.ts · components/brief/ContentMapSection.tsx · ContentPlanSection.tsx · ScopeSection.tsx · ExecutiveSummarySection.tsx · package.json/package-lock.json)

## v7.355 — 2026-07-07 · Content Plan "Clear all": one click empties the plan

Wayne asked for a select-all / deselect-all option right at the Content Plan's topic-list toolbar (the "N topics · X/mo" line). Since the Content Plan lists only the topics already picked on the Content Map, every visible row is by definition selected — a literal "Select all" has nothing to act on — so we shipped a single Clear all (N) button at that spot. One click removes every topic the current filters SHOW from the plan: with an audience-segment chip (v7.353 lens) or a status/priority filter on it clears just that visible slice, with no filter it clears the whole plan, and N + the volume beside it always match what's about to go. Because the plan has no undo, a two-click guard arms the button first (it turns into "Confirm — clear all (N)") and only the second click within ~3.5s removes; changing the filter or segment cancels a pending confirm. Under the hood the new clearFromPlan handler removes every shown id in ONE full-set PUT to /api/projects/[id]/content-plan (the bulk sibling of the per-row × removeSelection), optimistic with revert, and prunes those ids from the Scope cart so "N in scope" stays honest (scope ⊆ plan, v7.269); it writes the same selection store, so cleared topics un-tick on the Content Map. The button reuses the existing both-theme red token pair (legible light + dark, IV.6). tsc clean on the live v7.354 clone (V.1a); retained suite A/B vs v7.354 base zero delta (289 PASS), then 9 new v7.355 checks (dual-theme jsdom render, two-click guard, bulk-id fire, absent-when-unwired guard, source/persistence checks) → 298 PASS. Full detail in CHANGELOG_v7.355_ENTRY.md. (components/brief/ContentPlanSection.tsx · package.json/package-lock.json)

## v7.354 — 2026-07-06 · Push to Brief Agent goes live: Word briefs, zipped per audience segment

Wayne asked to activate the Content Plan's "Push to Brief Agent" button: one click should download a bundle — a zip per audience segment, each holding an individual Word doc per content article, and every doc carrying the segment, the product category + its architecture (parent category and sub-categories), everything the article drawer shows, distance to conversion, priority bucket, existing URL, the optimise-vs-net-new action, volume, rank position, keywords with competitor rankings, and the product vs pre-product journey. The button now builds exactly that, client-side: <client>-content-briefs.zip → segment-a-<name>.zip per segment → numbered .docx per article (volume-ordered). Segment membership is the same v7.353 lens attribution the Journey panel stores (Const II.7); Shared articles ride into every segment's zip, labeled shared inside the doc (Wayne's standing call; never summed across, I.3). Every figure in a doc is the exact canonical value — real Semrush volumes and positions, real competitor-gap attributions in the full keyword table; the title/outline/PAA are the drawer's editorial scaffolding, labeled as suggestions (I.1). Real "Building briefs… X of N" progress while it builds, green confirmation on download, honest red strip on failure (IV.2/I.5); docx + jszip are dynamic-imported so the page bundle stays lean. tsc clean on the live clone (V.1a); retained suite A/B vs v7.353 base zero delta, 289 PASS incl. 19 new v7.354 checks that build a real bundle in Node and unzip outer → segment zips → docx → document.xml asserting every required field. Full detail in CHANGELOG_v7.354_ENTRY.md. (lib/export/briefExport.ts NEW · components/brief/ContentPlanSection.tsx · package.json/package-lock.json + docx ^9.7.1, jszip ^3.10.1)

## v7.353 — 2026-07-06 · Audience-segment lens on Content Map, Content Plan & Scope

Wayne asked to carry the Audience Journeys segment↔category association forward into the Content Map, Content Plan and Scope panels — filter each panel by segment (e.g. pull all of segment A's content into the plan) and see which segment every topic belongs to. The Journey panel's topic→segment attribution (the v7.170 exclusive audience-language partition) is now ONE exported function (buildCanonTopicSegmentMap) that all four panels share through the new SegmentLens module, so a topic sits in the same segment everywhere (Const II.7). Each panel gets an Audience-segment chip row (All Segments + one per segment, persona portraits, real row counts); picking a segment narrows the panel — on Scope the multi-year roadmap narrows too — and all cards recompute through the shared scopeOf rollup (exact sums of the rows shown, I.1). Topics matching several segments sit in Shared and appear under EVERY segment, tagged Shared (Wayne's call — no segment view hides relevant content; views may overlap but are never summed across, I.3/I.5). Every row carries a segment tag. Workflow glue: Content Map gains "Select all shown (N)" (one click pushes a whole filtered segment view into the plan, one idempotent save), and with a segment active the Content Plan's Add to Scope scopes exactly the visible slice. Chips render only when segments + canonical topics exist (honest gap, I.5). tsc clean on the full live clone (V.1a); retained suite A/B vs v7.352 base: zero delta, 270 PASS incl. 19 new v7.353 checks (attribution parity, view semantics, rollups, dual-theme jsdom render, token audit). Per-segment export deferred to a later release. Full detail in CHANGELOG_v7.353_ENTRY.md. (components/brief/SegmentLens.tsx NEW · JourneySection.tsx · ContentPlanSection.tsx · ContentMapSection.tsx · ScopeSection.tsx)

## v7.352 — 2026-07-06 · Audience panel: per-segment CSV download + copy to clipboard

Wayne asked for a CSV download and a copy-to-clipboard icon on each audience segment, with the CSV carrying ALL of the segment's information. Every segment card (Segment A/B/C) now carries two small icon buttons bottom-right: Download emits audience-segment-a-<name>.csv — a Field,Value CSV with every field the panel renders (label, name, tagline, share of volume, YoY growth, demographics, trigger, influencer role, every pre-product LLM prompt, every product-stage prompt, every touchpoint, messaging & tone, creative direction, channel approach; RFC-4180 escaped, UTF-8 BOM for Excel). Copy puts the same complete profile on the clipboard as labeled Field: value lines and flips to a ✓ on success. Both read ONE shared row-builder so CSV, clipboard, and panel can never drift (Const II.7); values export exactly as rendered (I.1). Icons are siblings of the card button (no nested-interactive HTML), theme-token styled and verified in light + dark (IV.6/V.5); 17 new retained-suite checks, A/B zero delta vs v7.351. Full detail in CHANGELOG_v7.352_ENTRY.md. (components/brief/AudienceSegmentsSection.tsx)

## v7.351 — 2026-07-06 · Analyzing screen stops freezing at "batch 0 of 58" (Const IV.2/IV.3)

Wayne's 1,429-keyword TD Bank refresh sat at "Categorizing keywords — batch 0 of 58 · 5%" for the whole ~10-minute run and looked stuck. The synthesis was fine (it completed across 3 Vercel windows as designed); the progress DISPLAY was broken. The screen's 10s poll — GET /api/projects/[id]/synthesis-progress — was doing db.query.analyses.findFirst, which ships the entire multi-MB semrush_snapshot (1,400+ keywords + the per-keyword cbProgress.proposed array + canon.mappings) to the function and JSON-parses it every poll; the read timed out, so the bar froze at its first reading. Now the route extracts only the small scalar counts via Postgres jsonb operators (the big arrays never leave the DB → poll returns in ms), the engine persists cbProgress.batchTotal for an exact "X of N", and three post-breakdown insight milestones keep the bar advancing through the tail with a fixed-size consolidation reserve so the denominator never grows mid-run. Math extracted to lib/synthesis/progressMath.ts and unit-tested 25/25; SSR render 4/4. No data/volume/taxonomy math changed. Full detail in CHANGELOG_v7.351_ENTRY.md. (app/api/projects/[id]/synthesis-progress/route.ts · lib/synthesis/progressMath.ts · lib/claude/synthesize.ts)

## v7.345 — 2026-07-04 · Large-run consolidation resumes instead of looping forever (Const IV.2)

Wayne's 8,177-keyword td.com run kept dying on "Analysis failed / click Refresh" and Refresh never finished it. Live logs showed each 300s window replaying the same tail-of-discovery + full taxonomy rebuild, then timing out — the chunked canonicalization pass restarted from zero every resume (nothing checkpointed), so on a large footprint it could never finish; the last discovery wave also replayed every time, and 250-path canon chunks truncated their JSON. Now consolidation checkpoints each canon chunk (resume skips finished ones, no re-spend), the final discovery wave is saved, chunks are 150 paths at 12k tokens with a salvage parser, and the progress route folds canon chunks into done/total (new "consolidating" stage) so the bar keeps climbing and the run auto-resumes to completion. Full detail in CHANGELOG_v7.345_ENTRY.md. (lib/claude/synthesize.ts · app/api/projects/[id]/synthesis-progress/route.ts · components/brief/AnalysisRunningState.tsx)

## v7.344 — 2026-07-04 · Already-loaded CSVs unlock the Run button

Wayne re-uploaded a CSV on the pre-run data-source screen and hit a red error — “All keywords were already uploaded for this domain” — with the Run button locked. His data was fully loaded (the de-dupe correctly skipped identical rows after the interrupted run left them in place); the handler treated inserted === 0 as failure and never marked the domain satisfied, dead-ending a project whose data was 100% present. Now inserted === 0 counts as success: the domain is marked uploaded (Run unlocks) and the note reads “already loaded … you can run the analysis”, styled amber-informational. De-dupe untouched (Const I.3). (app/projects/[id]/page.tsx)

## v7.343 — 2026-07-04 · Honest progress, walk-away resume, faster batches, clear-uploads control (Const IV.2)

Wayne watched an 8,177-keyword rebuild sit at “98% — Saving results” for 10+ minutes and asked if it was broken. It wasn’t — but the screen was lying (time-based fake percentage capped at 98%), and the page silently gave up after 3 auto-retries while the run was still advancing. Full detail in CHANGELOG_v7.343_ENTRY.md.

**Real progress (Const IV.2).** New GET /api/projects/[id]/synthesis-progress returns REAL checkpoint numbers (categorization batches done vs total + actual stage). The analyzing screen shows “Categorizing keywords — batch 210 of 328”, a percentage derived from real batch counts, an ETA from the observed batch rate, and — before the first checkpoint — an honest “Working…” with elapsed time only (I.5). The fake TOTAL_DURATION curve is deleted; copy sets real expectations (1–2 min small, 15–25 min for 5k+ keywords).

**Walk-away auto-resume.** The Phase-2 loop keeps resuming across 300s windows AS LONG AS the checkpoint advanced since the last attempt (zero re-spend), stopping only after two consecutive stalls or a 15-window cap — no more silent give-up at 3 attempts mid-run.

**Faster batches.** Adaptive discovery concurrency: 12 workers past 120 batches (~halves wall time on 8k-kw uploads), 6 otherwise. Same total calls; per-batch retry absorbs throttling.

**“Cancel & clear uploaded files” on the analyzing screen (Wayne’s ask).** Two-step destructive confirm wired to the EXISTING full-reset route (one deletion code path). Project settings, brand terms, and the v7.342 taxonomy anchor are preserved, so the next upload still converges on the same tree.

**Verification (Art. V):** isolated tsc clean on all changed files (one PRE-EXISTING type mismatch in the untouched ContentMapSection/page pair confirmed byte-identical to live main, which builds READY — authoritative check is the real Vercel build, V.1a); jsdom harness 13/13; retained suite zero delta + 8 new v343 invariants (V.6).

## v7.342 — 2026-07-04 · Project-level anchor + the same-meaning leaf rule (Const III.1c-i / III.1e, v0.19)

Wayne’s second TD Bank rebuild surfaced the two remaining failures, both root-caused in stored data + code. Full detail in CHANGELOG_v7.342_ENTRY.md.

**“Same CSVs, different numbers every time” — the anchor never survived his workflow.** The upload flow runs the FULL RESET (keywords/reset), which deletes every analyses row — the v7.339 prior-ANALYSIS anchor was destroyed before each rebuild, so every upload re-derived the tree from scratch (“Borrowing & Loans > Mortgages & Refinancing” one run, “Lending > Mortgages” the next). The anchor now lives on the PROJECT row (projects.taxonomy_anchor), which the reset deliberately preserves (like brand terms): written after every successful anchored breakdown (≤ 400 distinct canonical paths, Other excluded), read as the skeleton anchor on the next run; fallback to the newest anchored-v1 analysis. Columns ensured in the projects LIST route, the [id] route, AND the synthesize route (v7.268/v7.327 lesson). Honest scope: names/structure converge run-over-run; LLM placement variance shrinks to within-node detail — never claimed byte-identical.

**Mixed intents in one node — Wayne’s APR rule, now discovery rule 2b (BASE rules, so unanchored runs get it too).** “The leaf is a same-meaning group”: “apr / what is an apr / meaning of apr / how do aprs work” = ONE definitional leaf; “apr rates / best apr rates” = a DIFFERENT-need sibling leaf (“best” stays a modifier inside it); definitional vs commercial/rate needs are different pages even sharing the head term. Plus the never-park clause in base rule 3 (the v7.341 depth mandate lived only in the anchor block, so his unanchored rebuild still parked 292 mixed keywords flat at “Mortgages”). Constitution v0.19: new III.1c-i + III.1e extension.

**Deterministic bare-domain → brand override.** “realtor.com” (12M) sat inside Mortgages at 25% confidence. A keyword that IS a bare domain is a navigational brand search by definition — a TypeScript rule now types it “<Stem> Brand Searches” (confidence 100, reasoning names the rule).

**Verification (Art. V):** isolated tsc exit 0 across both changed-file sets; pipeline harness 21/21 (incl. bare-domain end-to-end); 41 unit + prompt checks; retained suite zero delta + 8 new v342 invariants (V.6).

## v7.341 — 2026-07-03 · Depth mandate + sibling audit (Const III.1e follow-through)

Wayne’s first v7.339-era rebuild (TD Bank) exposed two defects, both confirmed in stored data: (1) **theme-level parking** — 276 of 562 Mortgages & Refinancing keywords (49%) sat flat at the theme node while sub-topics existed (“mortgage calculator”, 40.2M, parked at the theme; the “Mortgage Calculators” sub-node held 5) — the anchor told batches to reuse the top two levels exactly and the model stopped there; (2) **same-concept siblings one level down** — “Loan Interest Rates” (119 kws) beside “Mortgage Rates” (32) under one parent: chunked canonicalization saw them in different slices, so the duplicate survived. Full detail in CHANGELOG_v7.341_ENTRY.md.

**Depth mandate under the anchor.** The anchored discovery block now states: THE ANCHOR FIXES ONLY THE TOP TWO LEVELS — every keyword must still be placed in its most-specific sub-topic beneath the theme, with worked examples; a path stopping at the theme is correct only for the theme’s own generic head term, and theme-parking is named a failure. (lib/claude/prompts.ts)

**Pass 2.7 — sibling audit.** New bounded pass after canonicalization: every parent with ≥ 2 children is reviewed WITH its full child list (names only — the exact context chunking loses; chunked past 200 groups); the model returns same-concept sibling merges (conservative: “when in doubt, do not merge”; both labels must be real children of that parent); TypeScript applies + logs them (kind reparent, descendants follow — applySiblingMerges/buildSiblingGroups in canonicalize.ts, pure + unit-checked). Established-node carry between canonicalization chunks raised 150 → 250. Adds ~1 haiku call per 200 sibling groups. (lib/claude/prompts.ts, lib/claude/synthesize.ts, lib/category/canonicalize.ts)

**Verification (Art. V):** isolated tsc exit 0 (project tsconfig mirrored, V.1a); pipeline harness extended to a real duplicate-sibling scenario (rate concept parity-split across all 28 mock batches) — 18/18, siblings collapsed to one node + merge logged; 38/38 unit + prompt checks; retained suite zero delta + 6 new depth-sibling invariants (V.6).

## v7.340 — 2026-07-03 · Anchor guard: never anchor to a pre-v7.339 taxonomy (Const III.1e)

**One-condition patch (Wayne-approved).** The v7.339 prior-taxonomy anchor loads the previous completed analysis’s tree so re-analyses keep stable category names — but for a project whose last build predates v7.339, that “prior tree” is exactly the duplicate/split mess III.1e exists to eliminate. The synthesize route now anchors ONLY when the prior breakdown carries taxonomyEngine === ‘anchored-v1’ (i.e., was itself built by the anchored engine). Effect: every project’s FIRST v7.339-era rebuild is a clean, unanchored build; name stability kicks in from the second run onward. No other behavior changes. (app/api/synthesize/route.ts)

**Verification (Art. V):** isolated tsc exit 0 (project tsconfig mirrored, V.1a); retained regression suite re-run — all v7.339 checks pass, zero delta on prior checks, + 2 new anchorguard invariants (V.6).

## v7.339 — 2026-07-03 · Anchored categorization: one concept, one node (Const III.1e, new)

Wayne’s finding: duplicate/overlapping categories — “Wills & Trusts”, “Wills”, and “Estate Planning” as three separate nodes where one hierarchy should exist. Causes found in code: 25-kw discovery batches invented the taxonomy independently (no shared vocabulary); the canonicalization pass was forbidden from re-parenting (“Preserve the parent chain”) and silently skipped above 300 distinct paths; re-analyses rebuilt the tree from scratch; failed batches fell into “Other” silently. Constitution amended: Art. III.1e (v0.18). Full detail in CHANGELOG_v7.339_ENTRY.md.

**Skeleton-first anchored discovery.** New taxonomySkeletonPrompt proposes the canonical umbrella → theme tree from a volume-ranked sample before batching; every discovery batch assigns INTO it, reusing labels exactly. On a re-analysis the skeleton anchors to the PREVIOUS stored taxonomy (loaded in the synthesize route), so adding a competitor CSV keeps category names stable. Skeleton failure → unanchored discovery exactly as before (honest fallback, I.5). (lib/claude/prompts.ts, lib/claude/synthesize.ts, app/api/synthesize/route.ts)

**Consolidation rewritten — deterministic pass + chunked LLM re-parenting.** New lib/category/canonicalize.ts (pure, unit-checked): TypeScript label unification (case, “&”/“and”, conservative plural fold, word order) merges trivial spelling variants with no model call. pathCanonicalizationPrompt rewritten: the “Preserve the parent chain” ban is REMOVED and replaced with a mandatory subsumption rule (“Wills” → Estate Planning › Wills & Trusts); runs in chunks of 250 over the ENTIRE distinct-path set — never skipped — with established canonical nodes carried into later chunks.

**Merge log — auto-apply, never silent (Wayne’s call).** Every applied change (relabel or re-parent) is stored in _categoryBreakdown.mergeLog (cap 800) and rendered as an “N merged” chip + bounded scrollable log in the Keyword panel header. Pre-v7.339 analyses carry no log → no chip (I.5). (lib/claude/synthesize.ts, components/brief/KeywordsPanel.tsx)

**Retry-then-flag.** Failed discovery batches retry once; keywords still unplaced land in Other with keywordMeta {confidence: 0, needsReview: true} so they surface in the existing Needs Review flow (III.7) — never silently.

**Pre-product stored membership.** Problem-lane demand topics now file deterministically under “Pre-Product Journey › <Problem Seed>” in keywordPaths/keywordCategories (additive-only — base footprint wins, II.8); the pre lane “Clear all” strips exactly that root. journey-problem-clusters receives the canonical category list so a theme never duplicates the product-category namespace. (app/api/projects/[id]/demand-universe/route.ts, app/api/projects/[id]/journey-problem-clusters/route.ts, components/brief/JourneySection.tsx)

**New stored fields (additive, no schema change):** _categoryBreakdown.mergeLog, .taxonomySkeleton, .taxonomyEngine: ‘anchored-v1’.

**Verification (Art. V):** isolated tsc exit 0 over all 8 changed files + dependency graph (project tsconfig mirrored verbatim, V.1a). Mock-model pipeline harness at REAL scale: 700 keywords / 28 batches / 650 distinct paths / 3 canonicalization chunks — 16/16 (single wills node, both merge kinds logged, chunk carry-forward, retry-then-flag, exact TS rollups). 29/29 unit + prompt-invariant checks (all 9 retained v7.235–238 prompt rules still pass post-rewrite). 9/9 jsdom UI checks. Retained regression suite: zero delta vs untouched base + 12 new v7.339 invariants (V.6). Live-base verified pre-deploy: all 8 files SHA-256 byte-identical to main.

## v7.338 — 2026-07-02 · Local Search: crawl multi-level store-locator directories

**Locations crawler for directory-style store locators (TD Bank case).** The manual Locations-URL reader (v7.302) understood only a single page — a KML, an XML sitemap, embedded GeoJSON map markers, or `/location(s)/{slug}` hrefs. A Yext-style directory — a country index that links to state pages, then city pages, then individual store pages (locations.td.com/us to /us/{state} to /us/{state}/{city} to /us/{street-slug}) — matched none of those and returned 0 offices: no single page lists every location, and the store URLs are /us/{slug}, not /location(s)/. New lib/local/crawl.ts walks that tree from the seed URL: a BFS over the same subdomain under the seed's path, classifying each page by content — a page carrying a geo.position meta (or schema.org address) is a store leaf; otherwise it is a directory whose child links are enqueued. Relative hrefs (../../us/...) are resolved against the page URL; off-host and off-path links are dropped.

**Real per-office data, branches only (Const I.1).** Each store leaf is hydrated from its OWN page markup — exact GPS from meta geo.position, street/city/state/zip from the Google-Maps directions link text plus geo.region/geo.placename, phone from the tel: link. (TD's pages carry no schema.org JSON-LD, so the reader falls back to these meta signals; JSON-LD is still preferred when present.) Standalone ATMs (a leaf named "...ATM" with no branch phone) are excluded. Nothing is modeled.

**Completeness by default, runtime-guarded (Const I.6).** The crawl is not top-N capped; it walks the whole tree. A wall-clock budget exists only so one streamed request stays under Vercel's 300s ceiling (mirroring the v7.303 enrich budget), and when it is hit the result is flagged manual-crawl-partial rather than silently dropping offices. The crawl runs on the real scan only — a dryRun estimate never fires it — and streams live "found X, scanned N pages" progress (Const IV.2). Existing KML/sitemap/marker/href sites are byte-unchanged: the crawl is a fallback reached only when every prior method returns 0.

**Build.** New lib/local/crawl.ts type-checks clean under the project tsconfig (no target override, Const V.1a); 27/27 crawler harness assertions pass against TD's real page markup (leaf parse, directory classification, relative-link resolution, ATM exclusion, and a multi-level BFS integration crawl). Backend-only — no component/styling touched. Changed-files-only deploy (Const VI.6): lib/local/crawl.ts (new) + app/api/projects/[id]/local-scan/route.ts.

## v7.337 — 2026-07-02 · QC-audit cleanup batch (B4, B9a, B9b, B12, B14) + dead-panel removal

**B14 — competitor-gap estimate and pull now span every competitor domain, Const I.6.** The Semrush gap step was capped at 5 competitor domains at four call sites (including the cost estimate); Wayne chose to remove the cap (2026-07-01). New analyses estimate and pull gap keywords across all configured competitor domains, so the cost estimate shows the true, larger figure up front. (lib/apis/semrush.ts, lib/utils/kwVolume.ts, app/api/projects/[id]/semrush-estimate/route.ts)

**B9a — competitor-brand drop is one tested implementation.** Consolidated the demand-lens competitor-brand drop into a single exported buildCompetitorBrandDropTest in kwVolume, replacing duplicated inline logic. (lib/utils/kwVolume.ts)

**B9b — Journey demand fallback fails honestly, Const I.5/II.8.** When the canonical build cannot produce the demand lens, the Journey panel logs the failure and shows an honest amber notice instead of silently degrading; its lexical fallback is removed so it reads stored membership only, matching ContentMap. (components/brief/JourneySection.tsx, app/projects/[id]/page.tsx)

**B12 — one shared path-tree.** KeywordsPanel and serviceLines build their product-line path tree from a single shared lib/category/pathTree, removing duplicated tree logic. (lib/category/pathTree.ts, lib/local/serviceLines.ts, components/brief/KeywordsPanel.tsx)

**B4 — Executive SERP-features roll-up is live, not "at analysis."** The Exec Summary AIO/PAA/Video tokens roll up from a shared lib/serp/featurePool over the live pool; the stale "(at analysis)" suffix is dropped and the retained-suite check updated with a dated note. (lib/serp/featurePool.ts, components/brief/SerpFeaturesSection.tsx, ExecutiveSummarySection.tsx)

**Dead-panel removal, B13 (Wayne approved 2026-07-01).** Removed six unused brief panels with zero code references: MarketGapSection, CompetitorGapSection, FootprintSection, OpportunitiesSection, PersonasSection, ReportsPanel.

**Build.** tsc clean under the project tsconfig (no target override, Const V.1a); jsdom harness + retained regression suite pass; changed-files-only deploy (Const VI.6).

## v7.336 — 2026-07-01 · QC-audit fixes B3/B5/B6 + the ContentMap cluster-builder mirror

**B3 — server scan routes now see brandTerms, excludedBrands and scopeOverrides, Const II.7 and III.1d.** serp-scan and local-scan built their pools from the raw DB snapshot, so scan candidate sets included user-blocklisted keywords and ignored promote and demote scope overrides — their X-of-N counts drifted from panel totals. Both routes now wrap the snapshot with the shared hydrateSnapshotForPool from v7.335 before buildKwPool; local-scan's secondary raw-snapshot brand-token read fixed too. The underscore fields never persist to the DB — verified the raw snapshot is not mutated.

**B5 — one shared basis for canonical topic counts, Const I.6.** ThemeClustersPanel was the only consumer feeding project volume thresholds into the canonical cluster build; Journey, Exec, ContentMap, ContentPlan and Scope all build unfloored. With a nonzero threshold set the Cluster panel diverged from Topics-in-journey and the Content Map. The panel now builds unfloored like everyone else — completeness is the default per I.6; thresholds remain view-level filters. Verified at thresholds 400 and 400 the panel count now equals the canonical count; the old code differed.

**B6 — no more lexical category fallback in Google Ranks, Const II.8, III.1b, I.5.** inferCategoryForKw Tiers 2 and 3 reconstructed category membership by shared-word string matching at render — the class of bug III.1b was written for. Replaced with stored membership only; keywords absent from keywordCategories now roll into an honest dimmed Uncategorized group rendered last — a real roll-up, expandable — in the expanded-row filter and in the rank-bucket XLSX export.

**B1-mirror — ContentMapSection's own cluster builder gets the v7.335 treatment, Const II.7, II.8, III.1a, III.1d.** Found during the v7.335 B1 fix: ContentMap kept a second inline pool with the same leaks. Now pool via buildKwPool, category reads through buildCategoryGuard, stored membership only — unassigned keywords flow to the relevance-gated pre-product catch-all. Clean-fixture output byte-identical old vs new; dirty fixtures drop the competitor-brand cluster, adjacent-umbrella keywords and blocklisted keywords the old code leaked.

**Verification Art. V.** Live base verified by shallow git clone, head bc9b1e53 — every base blob sha matched before patching; note the GitHub trees API via web_fetch served stale cached JSON and must not be trusted, git clone is the reliable check. tsc exit 0 under the project tsconfig verbatim, V.1a; routes esbuild-clean — next and drizzle not installable in the isolated tree, validated by the real Vercel build per VI.7. jsdom harness 22 of 22 at real scale including old-vs-new byte-equality on clean fixtures and demonstrations of each pre-fix bug; retained v7.334 suite re-run 13 of 13, V.6, plus an independent second run on a fresh live-clone union, V.4.

**Files.** app/api/projects/id/serp-scan/route.ts, app/api/projects/id/local-scan/route.ts, components/brief/ThemeClustersPanel.tsx, components/brief/GoogleSerpSection.tsx, components/brief/ContentMapSection.tsx, package.json to 7.336.0. Follow-ups queued: JourneySection's builder still carries its lexical fallback — ContentMap is now stricter, align in the cleanup batch; ContentMap dead code buildArticleTopics and buildContentGaps; ThemeClustersPanel threshold props intentionally unused.

## v7.335 — 2026-07-01 · QC-audit fixes B1/B2/B7: buildClusters on the canonical pool + guard; PDF export on the current capture/SoV model; guards learn brandTerms

**B1 — Journey buildClusters rebased on the canonical pool + category guard, Const II.7, III.1a, III.1d.** buildClusters and buildJourneyClassifier built a parallel inline pool from raw snapshot rows with only the blocked-list applied — skipping every competitor-brand exclusion, the user brand blocklist and the v7.326 scope gate — and read cb.categories unguarded. Their output feeds Exec journey-stage coverage, AI-stage rates and Journey internals, so competitor-brand categories and adjacent-vertical keywords counted toward journey coverage while every canonical panel excluded them. The inline pool is now one buildKwPool call and both category reads go through buildCategoryGuard. Clean-fixture regression proved byte-identical output on unaffected data — 155 clusters, 678,700 vol, 1,279 kws identical old vs new; on projects with brand, adjacent or blocklist data the journey coverage volumes will legitimately drop — that is the fix. All exported signatures unchanged.

**B2 — PDF export now renders the app's actual capture + Share-of-Voice model, closing the v0.11 amendment follow-up, Const I.5a and II.7.** The PDF still used stored marketCaptureRate and competitor organic-traffic bars — the pre-v7.245 competitor-relative SoV. The SoV model — GrowthSRC 2025 CTR curve, ctrAt, computeSov — moved verbatim into a new server-safe lib/sov/model.ts; GoogleSerpSection re-exports it so every existing import compiles unchanged. The PDF route hydrates the snapshot via the new shared lib/utils/hydrateSnapshot.ts — injecting _brandTerms, _excludedBrands and _scopeOverrides exactly as the project page does — builds the canonical pool, and passes live computeVolumeMetrics + computeSov results to the template. The template hero and SoV section now match the app, carry the required modeled-estimate and GrowthSRC 2025 CTR-curve labels, and fall back honestly to labeled stored-at-analysis values or an empty state when a pool cannot be built — never the old bars.

**B7 — category guards now receive the client brand vocabulary, Const III.1a.** buildCategoryGuard and GoogleSerpSection's inline guard called isBrandedKeyword with an empty vocabulary, so a client brand category recognizable only via brandTerms — the TD and Toronto Dominion class — was dropped as a competitor brand. Both guards now read snap._brandTerms; signatures unchanged, all callers compile as-is. Harness demonstrates the pre-fix bug and the post-fix behavior — TD kept, Wells Fargo still dropped.

**Verification Art. V.** Per-fix: tsc exit 0 under the project tsconfig verbatim, V.1a, and 29 of 29 plus 29 of 29 jsdom checks at real scale — 1,303 and 1,644 kw fixtures — including old-vs-new equivalence proofs. Combined: union tree tsc exit 0 across all touched files and consumers, and the full retained v7.334 suite re-run 13 of 13, V.6. Every patched base byte-verified against live main via git blob SHAs from the trees API at commit 522c8a0c — the raw CDN truncated GoogleSerpSection and was NOT used as a base.

**Files.** components/brief/JourneySection.tsx, components/brief/GoogleSerpSection.tsx, lib/sov/model.ts new, lib/utils/hydrateSnapshot.ts new, lib/pdf/template.ts, lib/category/categoryGuard.ts, app/api/reports/pdf/route.ts, package.json to 7.335.0. Also this cycle: Constitution amended to v0.17 — new Art. VI.8, deploy folders contain only deployable files, QC finding B8. Queued for v7.336: ContentMapSection's local buildClusters mirror has the same B1 leak — found during this fix; B3 server-route hydration; B5 threshold split; B6 lexical category fallback.

## v7.334 — 2026-07-01 · QC-audit consistency fixes: ThemeClusters header, Exec as-of stamps, Journey topic groups

**What was wrong.** The 2026-07-01 QC audit — full report in GEO/OrbitIQ_QC_Audit_2026-07-01.md in Wayne's records — confirmed three cross-panel inconsistencies live on WEG. A1: the Theme Clusters header said 360 topic clusters while the Total-clusters card, funnel, journey chips, Exec Summary and Journeys panel all said 531 — the header still counted with the legacy intent flatten instead of the stored-taxonomy flatten the cards use. A2: the Exec narrative and bottom roll-up carry synthesis-time figures — 9 percent capture, AIO 20 percent — beside live cards showing 3 percent SoV and 2 percent AIO. A3: the Journeys lane line called its parentName groups categories, showing 271 against the Cluster panel's 173 stored categories for the same 531 topics.

**What shipped.** ThemeClustersPanel header now counts with the SAME flatten ClustersTab renders — taxonomy build when keywordPaths exist, intent flatten only as the pre-taxonomy fallback — so header equals card by construction, Const II.7. Exec Summary stamps the narrative, the AI-generated priorities and the roll-up AIO token as written at analysis with the analysis date — honest freshness, Const I.5; recomputing the AIO roll-up live is the logged follow-up, QC audit B4. Journeys lane line now says topic groups instead of categories.

**Verification Art. V.** Isolated tsc 5.4.5 clean, exit 0, under the project tsconfig verbatim, no target override, V.1a, with real react and xlsx types. jsdom harness at real scale — 1,244 keywords, 173 categories, 531 taxonomy topics — 13 of 13 checks pass: header equals card, all three as-of stamps, topic-groups label, panel scroll retained IV.1, CSS-var-only new styling in both themes IV.6. Base files were byte-verified against live main at ed7d319 via git blob SHAs before patching, so the v7.328 per-segment download features are fully preserved in these files.

**Files.** components/brief/ThemeClustersPanel.tsx, components/brief/ExecutiveSummarySection.tsx, components/brief/JourneySection.tsx, package.json to 7.334.0.

## v7.333 — 2026-07-01 · SERP Features: download icon on the AI Overviews / People Also Ask / Video Carousel summary cards

**Wayne asked.** Add a download icon to each of the AIO/PAA/Video summary cards, same as before -- the excel should contain all the information.

**What shipped -- 1 new file, 1 changed file.** New lib/export/serpFeatureExport.ts: per-keyword XLSX (Feature, Keyword, Search Volume, Scan Status, Cited, Source), mirroring the existing rankBucketExport/topicExport dynamic-import pattern so xlsx stays out of the static bundle. components/brief/SerpFeaturesSection.tsx: reused SegmentDownloadButton, the same green download control from v7.328. FeatureRateCard's root changed from a button to a div role=button matching the v7.324 summary-card-trash pattern so it can legally host the nested download control without invalid nested-button HTML. A new buildFeatureExportRows draws directly from the v7.332 buildFeaturePool pool so a download always matches what is on screen -- the same Available count and the same Has-the-feature keyword list -- filtered to hasFeature, highest-volume first.

**Real data only.** Search volume is the real project_keywords.search_volume column, already returned by the keywords route, just not read by this component before. An unscanned keyword's Cited column exports Unknown, never a guessed No Const I.5.

**Verification Art. V.** Isolated tsc clean exit 0 under the project tsconfig.json, no target override V.1a. jsdom harness at the same 6,511-keyword scale confirms all 3 download controls render, clicking the icon does NOT switch tabs stopPropagation intact, clicking the card body still switches tabs, Enter-key activation still works on the new div role=button card, and no illegal nested button. A standalone unit test round-trips a real xlsx file through the actual xlsx library and confirms the exact column set and order and that an unscanned row's Cited cell reads Unknown. Zero new CSS tokens -- the only color is SegmentDownloadButton's own var dash dash c-34d399, already proven in both themes.

**Files.** components/brief/SerpFeaturesSection.tsx. lib/export/serpFeatureExport.ts new. package.json to 7.333.0.

## v7.332 — 2026-07-01 · SERP Features: keyword lists now match the Available/Gap count (Semrush = source of truth)

**Bug Wayne hit.** On the Video Carousel tab, the "6,112 uncaptured" gap banner sat directly above a keyword list showing "No video carousel" on every visible row — the count and the list looked contradictory.

**Root cause (verified against the live app, not assumed).** The AIO/PAA/Video "available" counts already correctly blended two real sources — SerpAPI-scanned keywords (live-verified) plus Semrush's uploaded "SERP Features by Keyword" column for the rest of the footprint. But the per-tab keyword LIST only ever iterated the ~5 SerpAPI-scanned keywords, never the ~6,500 Semrush-classified ones. Same footprint math powering two completely different lists.

**Fix — one file, components/brief/SerpFeaturesSection.tsx.** Wayne's direction: let's just use the Semrush SERP features as a source of truth. Added buildFeaturePool, one shared helper used by AIO/PAA/Video: a scanned keyword's own live SerpAPI result always wins strongest, freshest evidence, Const I.1; an unscanned keyword falls back to Semrush's uploaded classification — the source of truth for the part of the footprint that hasn't been scanned yet. WHO is cited still comes only from a live scan Semrush has no citation data, so cited stays null — unknown, not not cited — for anything never scanned Const I.5, never guess a negative. The Video and PAA tabs now render from this pool via a new FeaturePoolList component default view = has the feature, toggle to see all keywords, search box, a provenance tag per row showing Semrush vs. SerpAPI scan. The AIO Keyword Drilldown now includes Semrush-flagged unscanned keywords too, with a new Not yet scanned status distinct from Missing verified not cited so an unverified row is never mislabeled as a loss — new filter pill added.

**Verification Art. V.** Isolated tsc clean exit 0 under the project tsconfig.json — no target override V.1a. New jsdom harness rendered the real compiled component at real scale 5 scanned plus 6,511 uploaded keywords, mirroring this exact case: confirmed the Video tab list renders exactly 6,112 Video carousel rows matching the Available count was 5 before this fix, zero console errors, AIO Keyword Drilldown correctly shows Not yet scanned instead of a false missing for unscanned rows, panel scroll container intact IV.1. Theme parity IV.6/V.5: every CSS token used in the new/changed code was cross-checked against globals.css and confirmed defined in both the dark and light blocks — one invented token was caught by this check and corrected before packaging.

**Honest gap — not run this release.** The full retained multi-release regression suite was not available in this environment dev-only file, not in the shipped manifest. This is a single-file, additive change that touches no taxonomy/cluster/journey/rank logic, so regression risk is low, but this is disclosed as a gap rather than a claimed pass Const V.6.

**Known follow-up logged, not fixed this release.** The More Features tab's Full SERP feature inventory by keyword list still iterates scanned keywords only — the same underlying pattern, lower severity since it isn't paired with a Gap banner. Flagging for a future release.

**Files.** components/brief/SerpFeaturesSection.tsx. package.json to 7.332.0.

## v7.331 - 2026-07-01 - Google Ranks: rank-bucket cards also filter the Category Performance section (categories + expanded keywords)

**What Wayne asked.** After v7.330 the rank-bucket cards filtered the keyword table but NOT the Category Performance section below it. Make the categories and keywords there filter to the selected bucket too.

**What shipped.** The active rank-bucket filter now also drives the Category Performance table: selecting a bucket shows only categories that have keywords ranking in it, an expanded category row lists only that bucket's keywords, and the header notes "filtered to Pos 1-3" in the bucket color. Chosen scope (Wayne): filter WHICH categories/keywords show; each category keeps its full metrics (Annual Demand / Share / Avg Pos / Rank Split are not position-specific), and the four summary cards above (Strongest / Weakest / Competitor Outperforming / Largest Opportunity) stay as the full-footprint overview. Visibility uses the already-stored per-bucket dist (no re-derivation, Const II.8); honest empty note when a bucket matches no categories (I.5). The keyword table already filtered (v7.330); this closes the gap for the categories.

**Verification + Files.** 1 file: components/brief/GoogleSerpSection.tsx (CategoryPerformanceSection gains a filter prop; shownProcedure/shownNav visibility filter + bucket-scoped expandedKws + filtered header note + honest empty state; call site passes filter). tsc clean (exit 0) under the project tsconfig with faithful react/xlsx shims, no target override (V.1a); view-only change, no new color tokens (reuses the bucket hex, both-theme). package.json -> 7.331.0.

## v7.330 - 2026-07-01 - Google Ranks: 4 rank-bucket filter cards (Pos 1-3 / 4-10 / Page 2 / Page 3+) with per-bucket Excel download

**What shipped.** Wayne asked for filtering summary cards for the rank buckets (1-3, 4-10, page 2, page 3+) with a per-bucket Excel download. Added a new row of 4 cards directly under the 5-card stat strip (Wayne's placement choice). Each card shows the bucket keyword count, its annual search volume, and its share of the ranked footprint as a colored bar (bucket colors match the Volume Opportunity bars). Option A behavior: clicking a card filters the keyword table to that bucket (click the active card again to clear back to All); the old filter-pill row above the table was removed (a small "Clear filter" control shows there only while a bucket is active). Each card's green download icon (the shared SegmentDownloadButton, var(--c-34d399), theme-safe) exports just that bucket as .xlsx - one row per keyword: Rank Bucket, Topic Category, Keyword, Search Volume (monthly), highest-volume first.

**Data integrity + verification.** Card counts and volumes come from the same posKws the Volume Opportunity card and keyword table already use (one source of truth, Const II.7); share % divides by the ranked-footprint volume, so it reconciles with the Volume Opportunity bars (v7.320 ranked basis). The download's topic category is read from stored membership (inferCategoryForKw over _categoryBreakdown.keywordCategories, II.8, never re-derived); it is left blank when the analysis carries no taxonomy (honest gap, I.5), never fabricated (I.1). tsc clean (exit 0) under the project tsconfig with faithful react/xlsx shims and no target override (V.1a), across GoogleSerpSection + SegmentDownloadButton + the new rankBucketExport + kwVolume. Cards rendered in both light and dark themes (V.5 / IV.6); every token used is defined in both. Panel scroll container untouched (IV.1). The real Next build (both files present) built READY in production. Exact surgical diff vs the live v7.329 blob.

**Files.** components/brief/GoogleSerpSection.tsx (rank-bucket cards + bucketStats/downloadRankBucket; removed the filter-pill row); NEW lib/export/rankBucketExport.ts (per-keyword rank-bucket to XLSX, dynamic import of xlsx); reuses components/brief/SegmentDownloadButton.tsx (v7.328). package.json -> 7.330.0.

## v7.329 — 2026-07-01 · Google Rank SoV: "Add top SERP rivals" control moved inside the Share-of-Voice card; Volume Opportunity restored to its right

**What Wayne asked.** On the Google Rank panel, put the "Add top SERP rivals" control on the Share-of-Voice card instead of its own separate card, and move the Volume Opportunity card back up to the right of Share of Voice.

**What shipped.** The opt-in SERP-rivals block (estimate → pull → inject) now renders INSIDE the SoV card via a new optional `footer` prop on `SovPanel`, so the two-up row reads `[Share of Voice | Volume Opportunity]` again. The standalone third card is gone.

**Verification (Art. V).** `tsc` clean (exit 0) under the project tsconfig with no `target` override (V.1a). Pure layout relocation — no new color tokens, so theme parity holds in both light and dark (Const IV.6 / V.5), confirmed with a dual-theme render. Exact one-file diff vs the live v7.323 blob; panel scroll container and the SoV page-1-capture math untouched.

**Files.** `components/brief/GoogleSerpSection.tsx` (SovPanel gains optional `footer`; the SoV/Volume grid drops the standalone SERP cell). `package.json` → 7.329.0.

## v7.328 — 2026-07-01 · Per-segment Excel download on every card, funnel stage, and filter/journey tab

**What Wayne asked.** Add a download icon to each summary card so you can export that segment to Excel — including the theme/topic, its keywords, volume, existing-URL map, priority/stage, and a net-new-vs-existing label. Extended (Wayne's choice) to **every** card, funnel stage, and filter/journey tab across all three panels.

**What shipped.** A small green download control (`ti ti-download`, `var(--c-34d399)` so it reads in both themes — Const IV.6) now sits on: the Content Map / Content Plan cards (All topics, Existing→optimise, Net-new→build, Quick wins, Total, P0/P1/P2) **and** the "Where you rank" page tabs (All / Page 1–4+ / Unranked); the Cluster panel cards (Total, Leading, Trailing, Low Competition), each **funnel stage** (Awareness / Consideration / Decision / Retention) and the journey-scope tabs; and the Journey panel's three cards (Topics in journey, Existing—optimize, Net-new—build) and its All / Product / Pre-product tabs. Clicking one downloads an `.xlsx` of exactly that segment, **one row per topic**, columns: Topic, Keywords (the topic's keywords joined into one cell), Keyword Count, Total Monthly Volume, Existing URL, Priority, Journey Stage, Type (Existing / Net-new).

**Data integrity (Const I.1).** Every value is read from the canonical per-topic model the panels already render (`ContentTopic` / cluster `Topic`) — the same one-source-of-truth keyword→topic assignment (Const II.7), so an exported row's keywords/volume reconcile with what's on screen. A field that doesn't exist for a panel (e.g. P0/P1/P2 priority on the Cluster panel) is left **blank**, never fabricated. Each segment's exported row count equals the count shown on its card/tab.

**Files.** New `lib/export/topicExport.ts` (shared `exportSegmentXLSX`, dynamic `import('xlsx')` — no static bundle cost, reusing the existing `KeywordsPanel.downloadXLSX` pattern) and `components/brief/SegmentDownloadButton.tsx` (a `<span role="button">` — never a nested `<button>` — that `stopPropagation`s so a download click never also toggles the card's filter). Wired into `ContentPlanSection.tsx` (shared `ContentExplorer`, used by Content Map + Content Plan + Scope), `ThemeClustersPanel.tsx`, and `JourneySection.tsx`; one-line `clientName` prop threaded through `ContentMapSection.tsx` and `ScopeSection.tsx`.

**Verification (Art. V).** `tsc -p tsconfig.json --noEmit` clean (exit 0) under the project tsconfig — no `target` override (V.1a); baseline 0 errors → 0 after (zero new errors). Additive UI only: no component's scroll container, counts, filters, or the checkbox logic changed (Art. IV intact). Theme parity (IV.6/V.5): the only new color token `--c-34d399` is defined in **both** the dark `:root` (#34d399) and the light `[data-theme="light"]` (#26b07e) palettes. All 7 code files verified byte-identical on the deploy commit (`4936b36`) via SHA-256; changed-files-only, in place at exact paths (VI.6); builds on live v7.327; `package.json` → 7.328.0.

## v7.327 — 2026-07-01 · Fix selection checkboxes across panels — projects-list route now ensures the scope_overrides column

**Bug Wayne hit.** Checkboxes stopped working in several panels — clicking a topic's box in the Content Map (and the Journey plan list / any Content-Plan selection) did nothing: the tick flipped for an instant, then reverted. The dashboard project cards were also loading as empty skeletons.

**Root cause (verified against the live app + Vercel runtime logs, not assumed).** Every `projects` query was throwing `NeonDbError: column "scope_overrides" does not exist` (Postgres 42703) — GET `/api/projects` (dashboard list), GET `/api/projects/[id]`, and GET/PUT `/api/projects/[id]/content-plan` all 500'd. v7.326 added `projects.scope_overrides` (+ `_updated_at`) to the Drizzle schema and self-migrates it inside the new `/scope-overrides` route, **but did not add the `ADD COLUMN IF NOT EXISTS` to the projects-LIST route** — and Drizzle's `db.select().from(projects)` selects *every* schema column, so on any DB that hadn't yet hit `/scope-overrides` the whole projects table was unqueryable. This is the exact **v7.268 lesson** (already applied for brand_terms / scope_selections / scope_workstreams / profound_data): the list route must ensure every runtime-migrated column because the dashboard loads before any feature route. The checkbox's optimistic PUT 500'd → the UI reverted → "checkboxes don't work in several panels."

**Fix — 1 changed file, `app/api/projects/route.ts`.** Added the two idempotent `ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_overrides JSONB` / `scope_overrides_updated_at TIMESTAMP` calls to `ensureColumns()`, alongside the existing v7.206–v7.318 ensures, with a comment recording the miss so the pattern isn't dropped again. The production DB was also migrated immediately (the additive column now exists), so the live app was restored before this deploy; this guard makes it durable for any fresh DB / new environment.

**Verification (Art. V).** Isolated `tsc --noEmit` clean (exit 0) under the project `tsconfig.json` — no `target` override (V.1a); esbuild transpile clean. The change is additive, references no new symbols, and touches no component (Art. IV / V.5 UX + theme checks N/A — API route only). Live re-check: `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/content-plan` GET + PUT all 200 (were 500); dashboard renders all three projects; content-plan PUT round-trip 200. Changed files only, in place at exact paths (VI.6); builds on live v7.326 (`42ea4d1b`); `package.json` → 7.327.0.

## v7.325 — 2026-06-30 · Fix the summary-card trash — actually delete the data (snapshot + rows)

**Bug Wayne hit.** Hitting the Competitor Gap trash didn't remove the competitor data, and it wiped the Local Intent keywords instead. **Root cause (verified against the live project's real data, not assumed):** the Keyword Landscape cards are **double-sourced** (Const II.7) — each count is the saved analysis snapshot (`semrushSnapshot.topKeywords` / `.gapKeywords`) **unioned with** the uploaded `project_keywords` rows. v7.324 wired the trash to `/keywords/clear`, which only deletes uploaded rows. So on this project (snapshot gapKeywords = 680) the Competitor Gap card stayed populated, while the uploaded competitor rows — the *only* carrier of the gap "Local pack" SERP signal (128 rows) — were deleted, collapsing Local Intent.

**Fix — new route `POST /api/projects/[id]/keywords/clear-scope` + `lib/clearScope.ts`.** The trash now clears the scope from **both** stores:
- **Competitor** → deletes competitor rows (`type='gap'` or a domain attached) + all tracked competitors, and clears `gapKeywords` / `competitors` / `serpCompetitorPositions` / `competitorPositionVol` / `competitorPositionDist` on **every** analysis snapshot. Competitor Gap card → 0; SoV + Exec drop the competitors. Client footprint untouched.
- **Client** → deletes client rows (`type != 'gap'`) and clears `topKeywords` / `positionVol` / `positionDist` / `localPackKeywords` / `_demandUniverse` / `_categoryBreakdown` / `_audienceSegments` on every snapshot. Because clusters/journeys/content/Exec are **views** over those (Const II.6), they empty honestly too (this is the "full wipe" Wayne chose).

Genuine DELETE everywhere — never hides. `lib/clearScope.ts` is the pure snapshot transform (shallow copy, only removes fields, never fabricates — Const I.1); the route does the row + competitor deletes. `KeywordsPanel.tsx`'s `clearBox` now calls the new route for `base`/`competitor` (so the workflow-bar clears are fixed too) and closes the card confirm on completion.

**Verification (Art. V).** `lib/clearScope.ts` + `KeywordsPanel.tsx` pass isolated `tsc --noEmit` (exit 0, project tsconfig, no `target` override — V.1a); the route transpiles clean (esbuild); the new route's drizzle types are validated by the real Vercel build (VI.7). **21/21 unit assertions** on `clearScopeFromSnapshot` against a real-shaped snapshot: competitor-clear empties gap/competitor fields and KEEPS client (topKeywords/demand/taxonomy/localPack), client-clear empties client fields and KEEPS competitor gap/competitors, original object not mutated, null/undefined passthrough. Changed/new files only, in place (VI.6); builds on live v7.324; `package.json` → 7.325.0.

## v7.324 — 2026-06-30 · Keyword Landscape summary cards — per-card trash (delete client / competitor data)

**What Wayne asked (2026-06-30).** Add a trash-can icon to the Keyword Landscape summary cards: one for **competitor data**, and — since **client data is spread across Branded, Non-branded and Local Intent** — a trash on each of those three that, when used, **erases all client data together** (activating any one wipes all three).

**What shipped (1 changed file).**
- `components/brief/KeywordsPanel.tsx` — each summary card now carries an optional `clearScope` (`'client'` on Branded / Non-branded / Local Intent; `'competitor'` on Competitor Gap; none on All Keywords). A small trash icon appears on a card **only when that scope actually has data** to delete (`clientCount > 0` / `gapCount > 0`; honest — no dangling delete on an empty box). Clicking it opens an **inline two-step confirm** in the card's subtitle slot — *"Delete ALL client data?"* / *"Delete ALL competitor data?"* with **Delete** / **Cancel** — matching the existing workflow-bar trash pattern. Confirming reuses the existing `clearBox()` handler: client → `/keywords/clear` `scope:'client'` (deletes every client base row — the shared footprint behind branded/non-branded/local); competitor → `/keywords/clear` `scope:'competitor'` + `DELETE /competitors` (clears gap rows + tracked competitors). Both are **genuine scoped DB deletes** (Const "delete, never hide") and trigger the standard cross-panel refresh.

**Details.** The card was converted from a `<button>` to a `<div role="button">` (keyboard-accessible: Enter/Space still selects the filter) so the trash/confirm controls nest legally; the trash and confirm controls `stopPropagation` so they never change the active filter. A dedicated `cardConfirm` state keeps the card confirm separate from the workflow-bar's `confirmClear` so the two never cross-fire.

**Verification (Art. V).** Isolated `tsc --noEmit` clean (exit 0) under the **project `tsconfig.json`, no `target` override** (V.1a); esbuild full-file bundle clean. **Theme parity (IV.6/V.5):** every color token used (`--c-f87171`, `--c-8a8aa8`, `--c-2a2a40`, `--c-9090b8`, `--c-7070a0`, `--ca-248-113-113-0_2`) is defined in **both** the dark `:root` and `[data-theme="light"]` palettes — the same tokens the already-shipped workflow-bar trash uses. Reuses the existing, deployed delete endpoints (no backend change). Changed files only, in place at exact paths (VI.6); builds on live v7.323 (commit `26f39ad`); `package.json` synced to 7.324.0.

## v7.323 — 2026-06-30 · Share of Voice — opt-in "Top SERP rivals" pull for upload-footprint projects

**What Wayne hit.** After v7.322 shipped, the **Top SERP rivals** slices never appeared on his TD Bank project even after re-uploading the footprint and refreshing. Root cause (verified in code, not assumed): TD Bank is an **upload-footprint** project. The analyze route prefers uploaded keywords and builds the snapshot with `buildSnapshotFromUploads`, which **never pulls Semrush competitor footprints** — so `serpCompetitorPositions` (the field v7.322's slices read) is never created on upload projects. The v7.322 feature only had data on the Semrush **auto** path. A data-only refresh wouldn't help, and a full re-analysis on an upload project just rebuilds from the CSVs and still skips Semrush.

**Wayne's decision (2026-06-30).** Add a **deliberate, cost-shown opt-in action** to pull the SERP rivals for upload projects (not automatic — it spends Semrush units).

**What shipped (changed files only; 1 new).**
- `lib/apis/semrush.ts` — extracted the v7.322 inline builder into an exported **`buildSerpCompetitorPositions(topKeywords, perDomain)`** (single source of truth; `getSemrushSnapshot` now calls it, so the auto and upload paths compute positions identically — Const II). Added **`enrichSerpCompetitors()`** — pulls the Semrush auto-discovered organic competitors (+ manual), their FULL footprints (the same `domain_organic` pulls the auto path makes, ≤5 domains), and intersects with the project's existing (uploaded) `topKeywords`. The client footprint is **NOT** re-pulled — only competitor footprints — so uploaded data is untouched (I.1: real positions only). Added **`estimateSerpCompetitorPull()`** — competitor-footprint-only unit estimate (CEILING when a competitor floor is set).
- `app/api/projects/[id]/serp-rivals/route.ts` (**new**) — `GET` returns the unit estimate; `POST` runs `enrichSerpCompetitors` against the latest completed analysis's snapshot, **merges ONLY** `serpCompetitorPositions` into `semrushSnapshot` (every other field untouched), and returns `{ rivalsFound, competitorsPulled, warnings }`. Usage is auto-attributed via `setUsageProject` + the existing `recordSemrush` ledger. `nodejs` runtime, `no-store`.
- `components/brief/GoogleSerpSection.tsx` — when the snapshot has no `serpCompetitorPositions` (upload projects, or pre-v7.322 auto snapshots), the SoV area shows an opt-in card: **"Add top SERP rivals…"** → fetch estimate → confirm (**`~N units · the competitor domains`**) → **"Pull now"** with a live elapsed-seconds indicator while it runs (Art IV.2). On success the returned positions are injected into the donut via a local override so the slices appear **without a page reload** (real positions only — never modeled). Honest empty result when competitors rank but none hit page 1 (I.5). All new color tokens verified defined in **both** themes (IV.6).

**Scope / honesty.** Still ranks the up-to-5 tracked + Semrush auto-discovered competitor field (for banking that already includes the big aggregators), not the full open SERP. Auto (Semrush) projects already get the field for free during analysis and don't show the button.

**Verification (Art. V).** **Real project `tsc --noEmit` clean (exit 0)** over all three files using the **actual project `tsconfig.json` (no `target` override — V.1a) and the real dependency set** (next, drizzle-orm, react, `@/db`) — no stubs. A node harness on the **real compiled `computeSov`** (1,300-kw scale) still passes **17/17** (no regression from the refactor; the new override path renders); the real `SovPanel` render passes **12/12**; a focused test of the refactored `buildSerpCompetitorPositions` + the competitor dedup/cap-5 logic passes **5/5** (page-1 filter, footprint intersection, case-insensitive per-keyword dedup, empty-competitor omission, gap-domain dedup). The new route + `enrichSerpCompetitors` network/db orchestration is type-checked and validated by the real Vercel build (VI.7) — its pure sub-logic (domain selection, position build) is covered by the harness. Changed files only, in place at exact paths (VI.6). Builds on the live v7.322 tree (commit `751dc71`); `package.json` synced to 7.323.0.

## v7.322 — 2026-06-30 · Share of Voice — add the top 3 SERP rivals as real page-1-capture slices (alongside uploaded competitors)

**What Wayne asked (2026-06-30).** On the Google-Rank **Share of Voice** donut, also show the **top SERP competitors that occupy the largest share** of the keyword landscape — the top 3 sites by share — *alongside* the client and the uploaded tracked competitors (which were the only competitor slices before).

**The data question, answered honestly first.** A SoV slice is **page-1 click capture** — Σ(footprint keyword volume × CTR at that domain's real ranking position, pos ≤ 10) over the keywords it shares with the client footprint, on the SAME denominator as the client (Const II.7). That needs each rival's **per-keyword position on the client footprint**. We only had that for **uploaded** competitors (their CSV rows carry positions). For the broader SERP field, Semrush's auto-discovered organic competitors were in the snapshot but only as **domain-level** metrics — not positions — and the stored `gapKeywords` deliberately strips keywords the client also ranks for, so using it would **undercount** a rival's true share. Computing a real same-denominator slice for them looked like it needed a new (expensive) per-keyword SERP pull.

**Key finding — zero extra Semrush units.** The accurate input was **already being fetched**. Every analysis pulls each competitor's **full organic footprint with positions** (`getKeywordGap` → `gapResults[i]`) for the gap analysis, uses it to build the aggregate rank bands, then discards the per-keyword detail. v7.322 keeps the part we need: each competitor's **page-1 ranks intersected with the client footprint**, retaining the full overlap (unlike `gapKeywords`). No new API calls, no live-pull latency.

**What shipped (changed files only).**
- `lib/apis/semrush.ts` — new snapshot field `serpCompetitorPositions: Record<domain, {keyword, position}[]>`, computed in `getSemrushSnapshot` from the already-pulled `gapResults` (page-1 window pos 1–10, intersected with `topKeywords`, one rank per keyword). Zero additional Semrush units (Const I.1 — real positions only). Backward compatible: absent on pre-v7.322 snapshots.
- `components/brief/GoogleSerpSection.tsx` — `computeSov` now scores each auto-discovered rival's page-1 capture from `serpCompetitorPositions`, applying the **live** footprint volume per keyword so the **denominator is identical** to the client's and to the uploaded-competitor slices (II.7). Domains already shown as uploaded competitors are **de-duplicated** (uploaded wins). Ranked desc, capped at the **top 3** (Wayne's ask). New `serpEntries` field on `SovComputed`; `compEntries`, `sovPct`, and the denominator are **unchanged**, so the Executive-Summary hero reconciles by construction (Const II.6/II.7). `SovPanel` renders a new **"Top SERP rivals (page-1 capture)"** legend group + donut slices in an amber/gold palette (distinct from client purple and the cyan uploaded-competitor family), with an honest source caption ("largest organic rivals on your footprint · real page-1 positions, same denominator"). The uploaded section relabels to "Tracked competitors" when SERP rivals are present.

**What it does and doesn't do.** The top-3 are ranked among your **tracked + Semrush auto-discovered competitor field** (the up-to-5 domains already pulled for the gap analysis — for banking this already includes the big aggregators), by **true** page-1 capture — not a gap floor, and not a modeled estimate. It is **not** a full open-SERP aggregation of every domain that appears in positions 1–10 (that would require a per-keyword SERP pull and new API spend). The feature appears after the **next analysis** runs for a project (older stored snapshots have no `serpCompetitorPositions` and fall back to uploaded-only — honest gap, I.5).

**Verification (Art. V).** Isolated `tsc --noEmit` clean (exit 0) on **both** changed files under the **project tsconfig with no `target` override** (Const V.1a) — external `@/db`/`drizzle-orm` stubbed; no errors in the changed code; no Map/Set-iterator spread. A node behavioral harness on the **real compiled `computeSov`** at **real scale** (1,300 client keywords + 5 competitor domains) passed **17/17**: denominator stable when SERP rivals are added; **client `sovPct` and `capturedClicks` unchanged** (Exec reconciliation); top-3 cap; uploaded-domain de-dup; descending order; per-rival capture matches a manual Σ(volume × CTR); "open" shrinks by exactly the captured delta; all slices sum to `availableClicks` with no overflow; pcts sum to 1; backward-compat (no field → empty `serpEntries`, identical to baseline). A `react-dom/server` render of the **real `SovPanel`** passed **12/12** (SERP header + top-3 domains render, 4th excluded, uploaded competitor still shown, donut intact). Dual-theme parity (Const IV.6/V.5): every color token used (`--c-d9a23f`/`-f59e0b`/`-fbbf24` and the reused neutrals) is defined in **both** the light and dark blocks of `globals.css` — harness asserts 2 definitions each. A focused data-layer test of the snapshot block passed **5/5** (page-1 filter, footprint intersection, case-insensitive per-keyword de-dup, empty-competitor omission). Scroll root unchanged (IV.1); no new wait introduced (IV.2). Changed files only, in place at exact paths (VI.6). Builds on the live v7.321 tree (commit `9b5627a`); `package.json` synced to 7.322.0.

## v7.321 — 2026-06-29 · API Usage panel shows nothing — self-create the `api_usage` ledger table (it was never migrated in prod)

**What Wayne saw.** The **API Usage** panel (both the per-project section and the cross-project Dashboard rollup) showed **no results**, even though real Semrush/SerpAPI/Profound/LLM calls had been made.

**Root cause (verified on live prod, not assumed).** Production runtime logs on the live deployment (v7.320, commit `71d7165`, dep `dpl_hxu9vbyra9ei…`) showed, on every panel open:
`[OrbitIQ usage] rollup failed: relation "api_usage" does not exist` and `[OrbitIQ usage] project summary failed: relation "api_usage" does not exist`. The `api_usage` ledger table was **never created** in the production Neon database (`drizzle-kit push` never ran for it). So every `recordUsage()` insert silently failed (it's caught so it never breaks a real API call), nothing was ever recorded, and both read routes fell back to their honest empty-ledger state (I.5) → the panel was correctly empty because the ledger was empty. A self-heal added back in the v7.305–v7.307 line was lost when `main` was reset, so v7.320 had no table-creation path.

**What shipped (changed files only).**
- `lib/usage/record.ts` — new memoized, idempotent `ensureUsageTable()` that runs `CREATE TABLE IF NOT EXISTS api_usage (…)` plus the two indexes (`project_id`, `created_at`), mirroring the established runtime auto-migration pattern (`ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `app/api/projects/route.ts`). Column set/types/defaults match `db/schema.ts` exactly. It never throws (resets its memo on failure so a later call retries). `recordUsage()` calls it before the first insert.
- `app/api/usage/route.ts` and `app/api/projects/[id]/usage/route.ts` — call `ensureUsageTable()` at the top of the read `GET` handlers (and the baseline `POST`), so simply **opening either panel** creates the table immediately and the `relation does not exist` log spam stops.

**What this does and doesn't recover.** Forward-only by construction (Const I.1 — real data only): API calls made **before** the table existed were never recorded and **cannot** be back-filled. The panel will now populate as new billable calls are made, and the lifetime figure can be anchored to the real provider-dashboard number via the existing per-project **baseline** (POST `/api/projects/[id]/usage`) — a real, user-entered reconciliation value, never modeled.

**Verification (Art. V).** `tsc --noEmit` on `lib/usage/record.ts` clean (exit 0) under the **project tsconfig with no `target` override** (Const V.1a); the 3-file scoped check showed only pre-existing `next/server` module-resolution artifacts of the minimal sandbox install (that import is unchanged and builds on Vercel), zero errors in the added code. A node behavioral harness on the real transpiled `record.ts` (db/`sql`/context mocked) passed **9/9**: emits `CREATE TABLE IF NOT EXISTS` + 2 indexes; DDL carries all 12 schema columns with matching NOT NULL/defaults; memoized (no repeat DDL); `recordUsage` ensures the table **before** the insert; never throws on DDL failure; retries cleanly after a failure. No UI/styling/data-model change → theme parity (IV.6), scroll (IV.1), and taxonomy/architecture articles unaffected by construction; the real Vercel build is the backstop (VI.7). Changed files only, in place at exact paths (VI.6). Builds on the live v7.320 tree (commit `71d7165`). `package.json` synced to 7.321.0.



**What Wayne saw.** The Google-Rank **Volume Opportunity** card read **"100% of volume outside top 3"** and **"832.9M / yr … out of 20.6M total"** while its own bars showed **2.3M (10.9%) sitting in Positions 1–3**. 100% and an impossible "832.9M out of 20.6M" can't both be right.

**Root cause.** Introduced in v7.305. The card's **headline** ("% outside top 3", the big "/ yr" figure) and the **PG-1 / Top-3 share** stat cards divided by `footprintVolDenom = totalVol + demandVolMonthly` — ranked volume **plus** "missing demand" (≈814M/yr of keywords the client doesn't rank for at all). The card's **bars** and the **"out of … total"** label kept dividing by `totalVol` (ranked-only, 20.6M/yr). Two denominators in one card. Because the missing-demand pool dwarfs the ranked footprint, the top-3 slice rounded away and the headline collapsed to 100%; it also labeled ~814M of **unranked** demand as "pos 4+", which is wrong — those keywords have no SERP position. The Executive Summary's Volume Opportunity had the same demand-inclusive basis (`includeDemand:true`), so it matched the broken 100% rather than the bars.

**What Wayne decided (2026-06-29).** Volume Opportunity uses the **ranked-footprint basis**: opportunity among keywords the client actually ranks for. Uncaptured / full-market demand continues to live in the **Share-of-Voice** panel (Const I.5a), which already shows "open / uncaptured demand".

**What shipped (changed files only).**
- `components/brief/GoogleSerpSection.tsx` — `volOutsideTop3`, `pctOutsideTop3`, `top3VolPct`, and `page1Pct` now divide by `totalVol` (ranked footprint). Removed the `footprintVolDenom` local. Headline, "out of … total" label, bars, and the PG-1 / Top-3 stat cards now share **one** denominator. `demandVolMonthly` is still shown in the "Total Keywords — full footprint" card (correctly labeled), untouched.
- `components/brief/ExecutiveSummarySection.tsx` — its `totalVol` now excludes `origin:'demand'` volume too (mirroring how gaps were already excluded in v7.127, and how GoogleSerp's `topKws` drops demand). `includeDemand:true` stays, so the keyword **count** card still matches the Keyword Landscape panel — only the ranked-volume basis changes. This re-reconciles the exec Volume Opportunity with the Google-Rank panel (Const II.6/II.7).

**Result.** Headline now reads ≈**89% outside top 3** (= 100% − the Positions 1–3 share), the "/ yr" figure equals `ranked total − top-3` against the same 20.6M base, the three bars still sum to 100%, and the Executive Summary agrees with the Google-Rank panel by construction.

**Verification (Art. V).** Isolated `tsc --noEmit` clean under the **project tsconfig with no `target` override** (Const V.1a) over a typed reproduction of both changed code paths (real `PoolItem` shape, `origin` union). A node + jsdom harness on a **real-scale fixture** (≈8K pool items; ranked ≈20M/yr, demand ≈828M/yr) asserts: headline is no longer pinned at 100% (87% on the fixture); headline denominator === bars denominator; `volOutsideTop3 === totalVol − top3Vol`; bars sum to 100%; **Exec `totalVol` === GoogleSerp `totalVol`** and **Exec % === GoogleSerp %** (reconciliation, II.6/II.7); and a regression check confirming the old demand-inclusive path produced 100% + an "out-of-total" larger than the stated total. Dual-theme render (Const IV.6/V.5): **no color or markup changed** — only the numeric bindings — so every CSS var still resolves in both light and dark; harness parity assertion passes. Scroll root (`overflow-y-auto flex-1`) intact (IV.1). Manifest identical to v7.319 (112 files); `package.json` synced to 7.320.0 (VI). Changed files only, in place at exact paths (VI.6). Builds on the live v7.319 tree (commit `92bc0d5`).

**Supersedes (Art. V.6 / IX note).** This is a deliberate behavior change to the v7.305 "full-footprint parity" decision for the Volume Opportunity / PG-1 / Top-3 share metrics (Wayne, 2026-06-29): those metrics revert to the ranked-footprint basis. The full-market demand view is unchanged in the Share-of-Voice panel.

## v7.319 — 2026-06-29 · Hide the "LLM Visibility" left-nav link (temporary)

**What Wayne asked.** Hide the **LLM Visibility** link in the left navigation for now.

**What shipped.** In `app/projects/[id]/page.tsx`, the `NAV_ITEMS` entry `{ id: 'llm', … label: 'LLM Visibility' }` is commented out, so the left-nav link no longer appears. Everything else is untouched: the **AI Answer Engines** item (same "LLM Visibility" group) stays, the underlying `LLMVisibilitySection` render block remains in the file (simply unreachable while the link is hidden), and no data, rollups, or Executive-Summary figures change. Fully reversible — uncomment the one line to restore the link.

**Verification (Art. V).** **Real project `tsc --noEmit` clean** (full app, project tsconfig, no `target` override — Const V.1a). No styling/data/architecture change — the edit removes one nav array item — so theme parity (IV.6), scroll (IV.1), and the regression suite are unaffected by construction. Changed files only, in place at exact paths (Const VI.6). Builds on the live v7.318 tree.

# OrbitIQ Changelog

## v7.304 — 2026-06-26 · Offices populate with real address/phone/GPS in ONE fetch (embedded map markers); reviews show "Pending", not "0/Weak"

**Two things Wayne saw on v7.303.** Offices still showed *no address / no phone / no coordinates*, and the Reviews tab showed *— / 0 / Weak* for every office. Two causes:

1. **Enrichment runs during a scan, not on cached data.** v7.303's per-office enrichment only fills address/phone/GPS while a scan is running. After deploying it, the panel still showed the *previous* scan's data (with the new labels). It needed a re-run — **and** the per-office approach meant ~192 page fetches, which a guarded site can throttle.
2. **Reviews are Google data, not on the website.** The client site carries no ratings, so "0 reviews / Weak" was an unknown shown as a measured zero.

**What shipped.**
- **`lib/local/sitemap.ts` — `parseEmbeddedLocationMarkers`.** Reads the `/locations` page's **embedded map data** (GeoJSON `features` / Drupal `geofield_google_map`, or any inline JSON with `geometry.coordinates`) — every office with **real GPS + street + zip + phone** in the **single page fetch we already make**. No 192-page crawl, no throttling risk. Pure parsing of the page's own marker JSON/popup (Const I.1).
- **`app/api/projects/[id]/local-scan/route.ts`.** `discoverFromUrl` now tries embedded markers first; per-office `parseLocationPageJsonLd` enrichment remains the fallback for sites without embedded markers. Offices already complete from markers are skipped, so no redundant fetching.
- **`components/brief/LocalSearchSection.tsx`.** The Reviews tab now shows **rating "—", reviews "—", status "Pending"** (cyan) when no Google rating has been fetched — never "0/Weak" for an unknown (Const I.1/I.5). Note clarified: ratings/reviews come from Google Business Profiles via SerpAPI; *Pending* = not fetched yet (the site has no review data).

**Action for Wayne: re-run the scan.** Enrichment runs *during* a scan, so after uploading v7.304, click **Re-run scan** — the offices will fill in real address / phone / map coordinates from the embedded markers (one fetch), and reviews will read **Pending** until a Google lookup.

**Where ARE the review ratings?** They live on Google, not the website. To get the real per-office star rating + review count we run a **SerpAPI Google/Maps lookup per office** (paid, ~1 credit each) — now straightforward since every office has GPS + address. That's a separate, opt-in step (it spends credits), so it isn't run automatically.

**Verification (Art. V).** **Real project `tsc --noEmit` clean** (project tsconfig, no `target` override — Const V.1a; parser uses indexed `regex.exec` loops). **`parseEmbeddedLocationMarkers` harness 7/7 on the REAL WEG geofield feature**: Gilbert → coords (33.30733, -111.76986), address "936 E Williams Field Rd, Suite 103, Gilbert, AZ, 85295", phone "(480) 744-1112", correct /location URL; second office parsed; `tel:` country code stripped and formatted. `parseLocationPageJsonLd` 7/7 (v7.303) retained as fallback. Theme-safe Pending pill (defined CSS vars). Builds on v7.298–v7.303.

## v7.303 — 2026-06-26 · Office address / phone / GPS now read from each location page (real data); "0 reviews" relabeled "pending"

**What Wayne flagged.** After the Locations URL found all 192 offices, each one showed *"no address · no phone · no map coordinates · 0 reviews"* — yet the office page clearly lists the address (936 E Williams Field Rd, Suite 103, 85295) and phone ((480) 744-1112). Fair question: how do we know the data is accurate?

**The answer (every field traced to a source).**
- **City / state** came from the office URL slug (`/location/gilbert-az`) — correct, but that's all the index gave us.
- **Address / phone / GPS** were shown as missing because we only read the index, not each office page. They were never *wrong* — just not fetched. Each page carries a **schema.org `FinancialService` JSON-LD** block with the real `streetAddress`, `telephone`, and `geo` lat/lng.
- **"0 reviews" was a mislabel.** The client site has **no** review data (no `aggregateRating` in the markup). Ratings/reviews are Google Business Profile data — they only come from a Google/SerpAPI lookup, which hadn't run for these offices. So it's *pending*, not a confirmed zero.

**What shipped.**
- **`lib/local/sitemap.ts` — `parseLocationPageJsonLd`.** Pure parser for a location page's schema.org JSON-LD (`LocalBusiness`/`FinancialService`/`Organization`/`Place`): real `streetAddress` (+ locality/region/postal), `telephone`, and `geo` lat/lng. No DOM, no network, no modeling — Const I.1, sourced from the client's own structured markup.
- **`app/api/projects/[id]/local-scan/route.ts` — `enrichOfficesFromPages`.** On a real scan, fetches each discovered office page (free, no SerpAPI) and fills in real address, phone, and **GPS coordinates** from its JSON-LD. Bounded concurrency (10) + a **120s wall-clock budget** so the request stays under Vercel's 300s cap; any office not reached keeps its honest gap. Streams "Reading office details X of N…" progress.
- **`components/brief/LocalSearchSection.tsx`.** The per-office line now shows **"reviews pending"** (not "0 reviews") whenever no real Google rating has been fetched, so an unknown is never presented as a measured zero (Const I.1/I.5). The Locations source line is clarified: address/phone/coordinates come from each office page; Google ratings/reviews are pending until a map-pack scan or Google lookup.

**So: is the data accurate?** Yes, and now traceable — after a scan, address/phone/GPS are the office page's own published values (not guessed); city/state are the URL; reviews are honestly marked *pending* because Google hasn't been queried yet. **Real Google reviews/ratings** would need a per-office SerpAPI Maps lookup (paid) — now feasible since we have each office's GPS/address — offered as a separate step rather than spending credits automatically.

**Verification (Art. V).** **Real project `tsc --noEmit` clean** (project tsconfig, no `target` override — Const V.1a; the parser uses an indexed `regex.exec` loop, no `matchAll`/iterator spread). **`parseLocationPageJsonLd` harness 7/7** on the **real WEG Gilbert page structure**: exact address ("936 E Williams Field Rd, Suite 103, Gilbert, AZ, 85295"), phone ("+1 (480) 744-1112"), and GPS (33.30733, -111.76986); null when no JSON-LD or no address. Enrichment is bounded + budgeted; the live per-office fetch is confirmed on deploy (the scan's progress shows it working). Builds on v7.298–v7.302.

## v7.302 — 2026-06-26 · Manual "Locations URL" input — point the scan at your locations page / sitemap / KML when auto-detect can't reach it

**Why.** Some client sites (wealthenhancement.com included) block or throttle non-browser requests: a normal browser visit to the sitemap returns 200, but a programmatic fetch stalls (the server-side `web_fetch` timed out at 180s; a same-origin `fetch()` hung past 45s). That pattern is classic CDN/bot protection, so even with the v7.301 `/location/` parsing fix the app's server-side discovery may still come back empty. Per Wayne: add a manual input to point us at the right URL.

**What shipped.**
- **Scan Setup → "Locations URL (optional)"** (`components/brief/LocalSearchSection.tsx`). Paste a locations page, a sitemap (`urlset` or index), or a `.kml`. Persisted per project (localStorage). Sent with both the estimate and the scan.
- **`app/api/projects/[id]/local-scan/route.ts` — `discoverFromUrl`.** A manually-provided URL takes priority over auto-discovery (free, no SerpAPI). It auto-detects the content: **KML** → placemarks; **sitemap** (urlset, or an index → fetches a few children) → `parseLocationUrls`; **HTML page** → pulls the `/location(s)/…` office links straight from the markup (regex, no DOM) → `parseLocationUrls`. Single-segment office pages only (service sub-pages and the index are skipped), city+state parsed from the slug, deduped.
- **Live feedback in the preview.** Because the URL fetch is free, the dry-run runs it and the confirm card now reports **"📍 N office locations found from your Locations URL"** (or a clear "0 found — check the URL" / "none auto-detected, add a Locations URL"). So you know immediately whether it worked, before spending any SerpAPI credits. The Locations tab labels the source as read from your URL.

**Honest caveat.** This routes the fetch through the app server, so it still needs the server to be *able* to reach that URL. If a site hard-blocks the server's fetch entirely (not just the wrong path), the preview will show "0 found" — at which point the next option is a render/anti-bot fetch or a direct office upload. The keyword scan itself is unaffected either way (it doesn't need locations).

**Verification (Art. V).** **Real project `tsc --noEmit` clean** (full app, project tsconfig, no `target` override — Const V.1a; `discoverFromUrl` uses an indexed `regex.exec` loop, no Map/Set-iterator spread / `matchAll`). **Harness:** the HTML-page office extraction path **6/6** (relative + absolute hrefs, service sub-pages + index excluded, city/state parsed, deduped) and `parseLocationUrls` **10/10** (v7.301) on the real WEG URL patterns. Live server-side fetch of a protected site is, by nature, confirmed only on deploy — the in-preview "N found" count is built precisely so that confirmation is one click. Builds on v7.298–v7.301.

## v7.301 — 2026-06-26 · Location discovery now finds the client's offices (matches `/location/{city}-{state}`, not just `/locations/`)

**What Wayne flagged.** The Locations panel said *"No client locations were discovered"* even though wealthenhancement.com has ~193 office pages (e.g. https://www.wealthenhancement.com/locations).

**Root cause (verified on the live sitemap, not guessed).** The site's office pages live at **`/location/{city}-{state}`** — *singular* "location" — e.g. `/location/plymouth-mn`, `/location/green-bay-wi`. The discovery's `parseLocationUrls` only matched the **plural** `/locations/` path, so it found **0** offices → the code fell back to a Maps brand search → 0 matched → the empty-state message. Confirmed by walking the real sitemap: `sitemap.xml` is a Drupal simple_sitemap index → `?page=1/2/3`; **page 2 carries 193 single-segment `/location/{city}-{state}` office URLs** (alongside `/location/{city}/{service}` sub-pages).

**The fix.**
- **`lib/local/sitemap.ts` — `parseLocationUrls`** now matches **both `/location/` and `/locations/`** (plus `/office(s)/`, `/branch(es)/`), takes only the **single segment** after the hint (so `/location/{city}/{service}` service sub-pages and the `/locations` index are correctly skipped), **parses the trailing US state code** out of the slug (`plymouth-mn` → city *Plymouth*, state *MN*), and dedupes. The two hints never overlap, so plural-convention sites still work unchanged.
- **`app/api/projects/[id]/local-scan/route.ts` — `fetchText`** now sends a **browser-like User-Agent** and a 15s timeout (an unknown UA can be silently dropped by a site's CDN/bot filter, which would also return 0 locations).

**Note.** These sitemap office pages carry no GPS coordinates, so they appear in the **Locations / Reviews** tabs (city, state, page URL; ratings backfilled when the office shows in a scanned pack). The v7.299+ keyword scan doesn't depend on locations — this purely restores the Locations panel.

**Verification (Art. V).** **Real project `tsc --noEmit` clean** (full app, project tsconfig, no `target` override — Const V.1a). **`parseLocationUrls` harness 10/10 on the REAL WEG URL patterns**: 193 offices matched; city + state parsed (West Conshohocken→PA, Grand Rapids→MN, multi-word *Jacksonville Orange Park*→FL, *Los Angeles Westwood*→CA); `/location/{city}/{service}` sub-pages and the `/locations` index excluded; duplicates collapsed; plural `/locations/{city}` back-compat retained. The site's `sitemap.xml` returns **200** to a browser; the live server-side fetch (with the hardened UA) is to be confirmed on the deployed build. Builds on v7.298–v7.300.

## v7.300 — 2026-06-26 · Local scan now covers EVERY product/service category with local-map-pack keywords (stored membership), not just the curated lines

**What Wayne flagged.** v7.299 read "29 keywords across 4 tracked service lines" — but there are 69 local-intent keywords in the Keyword panel and more than 4 product service categories. The scan should check the keywords that **represent the intent of the product service categories** — and specifically only the product lines **associated with the local-map-pack keywords**.

**Two causes in v7.299.** (1) The scan set was gated by the **curated tracked service list** (this project had 4 saved picks) instead of all product categories. (2) It pulled keywords from the **path-tree lines**, which only include keywords that carry a stored taxonomy *path* — on this data only **38** of the local keywords have a path, while **59** actually map to a product/service category by stored membership. So real local-intent keywords were being dropped.

**The fix (stored membership, ungated).** `components/brief/LocalSearchSection.tsx` now builds the scan set as **every local-intent keyword (client + gap) whose stored category (`categoryForKeyword`, Const II.8) is a product/service category** (procedure type) — excluding the "Other" catch-all, brand, location/nav, and competitor-brand-guarded categories (Const III.1a). The local signal is the union of the uploaded-cell + footprint roll-up + **live SerpAPI** `local_pack` signals (matches the Keyword panel's `isLocalIntent`). This is **not** gated by the curated service list and **not** limited to keywords that happen to carry a taxonomy path — so it covers all product categories that the local-map-pack keywords belong to. Each keyword is grouped to its canonical product LINE for display only. On Wealth Enhancement Group this resolves to ~59 keywords across ~11 product service categories (more once the uploaded-cell signal is folded in the live app), versus the old 29/4.

- The **Scan Setup** and banner now read "N local-intent keywords across M product service categories (client + gap · only categories with local-map-pack keywords)."
- The **Services** tab is retitled **Product service categories scanned** and lists those categories with their local-pack keyword counts (📍 local pack), each scanned as-is. The obsolete curated add/remove/＋Add UI (a leftover from the service×city grid) is removed — the scan set is defined by the keywords' category membership, not a hand-picked list.

**Verification (Art. V).** **Real project `tsc --noEmit` clean** (full app, 505 deps, project tsconfig, no `target` override — Const V.1a; indexed loops / `Array.from`, no Map/Set-iterator spread). Project ships no ESLint config, so unused leftover declarations don't fail `next build` (consistent with every prior deploy). **Real-data check** against the live canonical model + `serpApiSnapshot`: of the local keywords, **59 map to product/service categories by stored membership** (vs 38 with a stored path and 29 under the old 4 curated lines) — confirming the set now represents all product categories associated with local-map-pack keywords. The scan loop reuses the proven `getLocalPack(keyword, market)` + `detectLocalIntent`; the live SerpAPI run is to be confirmed on the deployed build. Logic/copy change reusing existing themed primitives — no new colors (Const IV.6/V.5); scroll root unchanged (Const IV.1). Builds on v7.298 (service-line fix) + v7.299 (keyword scan model).

## v7.299 — 2026-06-26 · Local Search now scans the REAL local-intent keywords (no synthetic "{service} {city}"), and the estimator stops showing "0 locations"

**Two things Wayne flagged.** (1) The scan estimator read **"8 services × 0 of 0 locations = 0"** even with Locations set to 200. (2) The scan synthesized **`"{service} {city}"`** queries — but we already have the exact local-intent keywords per category, each already confirmed to trigger a Google Local Pack, so it should scan **those keywords as-is** and report their local rankings.

**The "0 locations" bug (diagnosed, not guessed).** The "200" was the location **cap**, not discovered locations. The estimate's location count came from `discoverLocationsFromSite()` (the client's sitemap/KML), which returns **0** for wealthenhancement.com (offices aren't in a machine-readable sitemap). The Maps-brand-search fallback that would find them is deliberately skipped during the **preview** (it costs a credit), so the dry-run could only ever show 0 locations for a sitemap-less client → "8 × 0 = 0." Wayne's keyword approach removes the city/location grid entirely, so this dissolves.

**The redesign (Wayne's choices: per-keyword · single locale · all local-pack keywords client + gap in the tracked lines).** The Local panel no longer builds a service×city grid. It now scans each **real local-intent keyword** once in Google's local 3-pack at the client's **market locale** (no `ll`, no city modifier — the keyword already carries its local intent) and reports the client's map-pack rank per keyword.

- **`lib/local/serviceLines.ts`** — `buildLocalServiceLines` now also returns, per product line, its **local-pack keywords** (client + gap) — the real queries to scan. Read from stored membership/paths (Const II.8/III.1b), real Semrush keywords only (Const I.1).
- **`app/api/projects/[id]/local-scan/route.ts`** — new **keyword scan model** (active whenever the panel passes `keywords`). For each keyword: `getLocalPack(keyword, market)` (single market locale, **no `ll`**), build a per-keyword `LocalKeywordScan` (real volume, detected intent, pack present, client rank, pack leader). Bounded concurrency **10** (local pack = 1 search, no AI 2nd call) with a **300-keyword runtime ceiling** so one streamed request stays under Vercel's 300s cap (a runtime guard, not a data cap — Const I.6). The dry-run returns a **keyword-count** plan (`keywords` = credits), spending nothing. Location discovery still runs **free from the sitemap** for the Locations/Reviews tabs, but the scan no longer depends on it (so a sitemap-less client still scans). `model: 'keyword'`.
- **`components/brief/LocalSearchSection.tsx`** — Scan Setup drops Services×Locations×Priority; it now shows **"N local-intent keywords across M tracked service lines"** and the estimate is **N keywords = N credits**. The panel assembles the scan set from the tracked lines' local keywords (client + gap) and sends them to the route. The **Map Pack** tab renders **per keyword** (keyword · intent · volume · pack? · your rank · pack leader), gaps you're missing first then by volume. The Services tab shows each line's **local-keyword count** instead of a `"{service} {city}"` template.

**Result on Wealth Enhancement Group.** The default brand + top-7 lines resolve to ~33–60 **real** local-intent keywords (e.g. *wealth management near me, financial consultant near me, financial advisor miami, estate planner, retirement planner*) — scanned as-is. The estimate reads "~N keywords = ~N SerpAPI credits," not "0 locations."

**Verification (Art. V).** **Real project `tsc --noEmit` clean** — the full app (505 deps installed), under the project's own tsconfig, **no `target` override** (Const V.1a); the new code uses indexed loops only (no Map/Set-iterator spread). `serviceLines` unit harness **9/9** (line emit, vol roll-up, brand/location excluded, brand-guard drop, no-taxonomy gap, single-child collapse, sort). **Real-data check** against the live canonical model + `serpApiSnapshot`: the new keyword scan-set logic yields the real local-intent keywords under the tracked lines (33 on the serp+rollup signal alone; more with the uploaded-cell signal the app also folds), no synthetic terms. The keyword scan loop reuses the **proven** `getLocalPack` + `detectLocalIntent`; the live SerpAPI run is to be confirmed on the deployed build. Logic/copy change reusing existing themed primitives (intent/rank chips) — no new colors, so theme parity (Const IV.6/V.5) holds; scroll root unchanged (Const IV.1). **Const V.6:** the `_regression/` suite is a `_*` dev artifact not carried in this source folder; this is a Local-panel scan-model change orthogonal to the prompt/cluster/taxonomy invariants. Builds on v7.298 (the service-line fix).

## v7.298 — 2026-06-26 · Local services now mirror the Keyword panel EXACTLY — its 📍 Local pack product LINES, not granular leaf categories

**The ask (Wayne).** The Local panel was still pulling the wrong product categories — *401k, financial advisory services, finding a advisor, life insurance, wills trusts, net investment income tax, local advisors, …* (25 of them). The rule, restated: show **only the categories from the local-intent keywords** — the Keyword panel already has them (its **Local Intent = 69**), and those keywords sit in product categories. Those are the categories the Local panel should offer.

**Verified on the live data, not guessed.** Read straight from the live **Wealth Enhancement Group** project (extracted the running app's own canonical `categoryModel` + `serpApiSnapshot`). The Keyword panel's Category Breakdown rolls procedure rows up to **product LINES** via `buildPathTree(procRows, keywordPaths)` and badges a line 📍 Local pack when any keyword under it triggers a Local Pack — yielding **11 product lines**: Retirement Planning, Retirement Plans, Estate Planning, Wealth Management, Tax Planning, Financial Advisory Services, Insurance, Wealth Management Services, Tax & Estate Planning, Advisor & Service Selection, Find an Advisor. The Local panel showed **25 granular leaves** instead — a different, larger, wrong set.

**Root cause (two gaps left by v7.293).** v7.293 correctly moved the Local panel onto the **canonical category model** (Const II.7), but:
1. **It emitted at the LEAF level** (`categoryModel.members[].categoryName`) instead of rolling up to the Keyword panel's product LINES — so big informational buckets ("401k" 961K, "net investment income tax", "local advisors") surfaced as "services" and the set never matched the Keyword panel's lines.
2. **Its local-pack signal omitted live SerpAPI.** The Local panel's `buildLocalPackKeywordSet` reads only the uploaded SERP-feature cells + footprint roll-up; the Keyword panel's `isLocalIntent` ALSO ORs in the **live SerpAPI `local_pack`** flag (113 keywords on this project). Missing it dropped serp-flagged lines (e.g. **Insurance**, **Advisor & Service Selection**) the Keyword panel badges.

**What changed (1 new lib + 1 read-site edit; no styling/UI/data change).**
- **NEW `lib/local/serviceLines.ts` — `buildLocalServiceLines(model, localPackKw, dropCategoryNames)`.** Reproduces the Keyword panel's exact roll-up — the `buildPathTree` logic (stored taxonomy paths → top-level nodes, single-child collapse) over the **same shared `categoryModel`** — and returns the top-level **product LINES that are local-pack**. Reads STORED paths/membership only (Const II.8 / III.1b — never lexical); a line's demand is the exact arithmetic roll-up of its own keyword volumes (Const I.1/I.3). Applies the competitor-brand guard (Const III.1a) and drops brand/location/"Other".
- **`components/brief/LocalSearchSection.tsx`** — `localServiceCats` now (a) folds the **live SerpAPI `local_pack`** signal into the local set so it matches the Keyword panel's `isLocalIntent` exactly (Const II.7), then (b) calls `buildLocalServiceLines`. The service list and the **+ Add** dropdown are now the product service lines, brand pinned + top 7 by demand.
- **Result on WEG:** brand + the 7 highest-demand lines tracked (Retirement Planning, Retirement Plans, Estate Planning, Wealth Management, Tax Planning, Financial Advisory Services, Insurance), with **"(4 available)"** in the dropdown (Wealth Management Services, Tax & Estate Planning, Advisor & Service Selection, Find an Advisor) — **identical** to the Keyword panel's 📍 Local pack categories. Existing projects that show old manual picks: click **↺ Reset to auto**.

**Verification (Art. V).** Real-data, not a fixture: extracted the live canonical model from the running Keyword panel and ran the **exact shipped `buildLocalServiceLines`** → **11 product lines, byte-identical to the Keyword panel's badged 📍 Local pack set** (and to the rendered DOM badges), replacing the prior 25 leaves. Project-tsconfig **`tsc --noEmit` clean** on the new file and the panel integration expressions — **no `target` override** (Const V.1a); indexed loops only, no Map/Set-iterator spread (downlevel-iteration safe). **Unit harness on the new logic: 9/9** (line emit + exact vol roll-up; brand- and location-type excluded; competitor-brand guard drop; no-taxonomy → honest-gap []; non-local line excluded; single-child collapse → child name; demand-desc sort). **Downstream `seeds.ts` pipeline** run with the real 11 lines: brand pinned + top-7 tracked, dropdown "(4 available)", every term carries its real volume. **Logic-only change — no JSX/color/styling touched**, so theme parity (Const IV.6/V.5) and the panel scroll root (Const IV.1) are unaffected; `KeywordsPanel` is untouched. **Const V.6:** the `_regression/` suite is a `_*` dev artifact not carried in this canonical source folder; this is a Local-panel read-site change orthogonal to the prompt/cluster/taxonomy invariants. The v7.293 `local-ui:` leaf/top-7 expectation is **superseded by design** (dated note) by the line-level roll-up + SerpAPI-inclusive local set.

## v7.297 — 2026-06-26 · SERP feature scan no longer stalls at "0 of N" — bounded-concurrency scan + smaller batch keep every call under Vercel's 300s cap

**The symptom (Wayne).** The SERP Features panel's "Scan all" sat spinning at **"Scanning… 0 of 1,239"** and never advanced, even with SerpAPI credits available.

**Root cause (from the live runtime logs, deploy `dpl_5uBc5BR…`, not a guess).** The scan was the problem, not the key or credits. `batchKeywordScan` scanned each batch **strictly one keyword at a time** (15s timeout per call, an optional second AI-Overview call, +200ms each). The "Scan all" loop sends **75-keyword** batches. With SerpAPI responding slowly today (logs full of `TimeoutError: operation aborted due to timeout`), 75 sequential keywords ran past Vercel's hard **300-second function cap** → the function was killed with a **504** before it could respond, so the client never got a result and the progress counter stayed at 0. Live evidence: two 75-keyword "all" batches today both ended in `Vercel Runtime Timeout Error: Task timed out after 300 seconds`, while smaller 25-keyword batches returned 200 and saved (`SERP scan complete (aio): +25`). Credits were fine throughout (224 keywords had already scanned).

**What changed (2 server-side files; no UI, data, taxonomy, or styling change).**
- **`lib/apis/serp.ts` — `batchKeywordScan` now runs with bounded concurrency** (`SCAN_CONCURRENCY = 5`) instead of fully sequential. A small fixed number of keywords scan in parallel via an index-ordered worker pool; one slow or failed keyword can't block the others. **Credit safety is identical** — per-call 15s timeout and per-keyword try/catch are unchanged, 1 keyword = 1 search, a failed keyword is skipped (never retried). Result order is preserved by index; failed slots are dropped, so the route's "0 results → 502" account-level guard still fires correctly.
- **`app/api/projects/[id]/serp-scan/route.ts` — batch hard-capped at 25** (was 75 default / 100 max). The client loop still sends 75; the route caps it and simply runs **more, shorter batches** until `remaining` reaches 0 (the loop already reads `scanned`/`remaining` from each response, so progress now advances batch by batch). Worst case per call ≈ (25 / 5) × ~30s ≈ 150s — comfortably under the 300s cap; typical case is far faster.

**Result.** "Scan all" now progresses (25 at a time, concurrently) instead of 504-ing on the first batch. Nothing else in the scan, merge, or persistence path changed; already-scanned keywords are still never re-scanned.

**Separately flagged (not changed here).** The runtime logs are flooded with `relation "api_usage" does not exist` — the usage-ledger table isn't present in this database. It is caught and harmless to scanning (and unrelated to this fix), but the table should be created (or the recorder disabled) so logs are readable. Left for a follow-up per Wayne's call.

**Verification (Art. V).** Project-tsconfig **`tsc --noEmit` clean** on the changed `lib/apis/serp.ts` and its full local dependency chain — **no `target` override** (Const V.1a); the new code uses `Array.from(...)` (no Map/Set-iterator spread, downlevel-iteration safe). `route.ts` transpiles clean (esbuild). **Behavioral test against the REAL compiled `batchKeywordScan`** (esbuild-bundled, mocked SerpAPI): order preserved + failed keywords skipped; concurrency observed and capped at exactly 5; **wall-clock 311ms for 12 keywords vs ~1,200ms+ the old sequential path** (proves the speedup); all-fail batch returns `[]` so the 502 guard is intact. **Note on the retained regression suite (Const V.6):** the `_regression/` suite is a `_*` dev artifact not carried in this canonical source folder, so it was **not** re-run here; this change is server-side scan plumbing, orthogonal to the prompt/cluster/taxonomy invariants that suite guards — no behavior it checks is touched. No React component changed, so dual-theme render (V.5) is N/A.


## v7.296 — 2026-06-26 · Re-apply the Keyword Landscape SERP-Features parser fix (reverted by a colliding v7.295) — on top of the IndexedDB persistence

**Why this exists.** Two parallel build streams both shipped a "v7.295": one was the CSV **parser fix** (below), the other was the **IndexedDB persistence** fix for the AI Answer Engines panel. They were deployed in sequence, and the second full-zip deploy **reverted the parser fix** (its `page.tsx` was the old version). Confirmed from the live commit `093866e3` diff, which removed `splitDelimitedLine` and the SERP-Features read. v7.296 carries **both**: the live IndexedDB `ProfoundVisibilitySection.tsx` (unchanged from the deployed v7.295) **plus** the re-applied parser fix in `page.tsx`. Nothing is reverted.

**The parser fix (`app/projects/[id]/page.tsx`).** The Keyword Landscape / scope upload uses `parseCsvText` here (not `KeywordsPanel`'s parser). It (a) never read the "SERP Features by Keyword" column, and (b) split rows with a naive `line.split(',')` that shatters Semrush's quoted comma cells ("Trends", "SERP Features"), misaligning every column to their right — so the SERP column never reached the upload. Now uses a **quoted-field-aware splitter** (`splitDelimitedLine`) and reads the SERP-Features column (aliases `serp features by keyword` / `serp features` / `serp_features` / Semrush `Fl`), returning it as `serpFeatures`. `handleFileUpload` posts it verbatim → it persists to `serp_features` and feeds Local Pack / Local Intent. Proof (live log signature): the upload that fails shows `serpFeaturesPrepared=0 … sampleKeys=[keyword|searchVolume|position|url]`; with this fix it sends `serpFeaturesPrepared=31`.

**Verification (Art. V).** Real project **`tsc --noEmit` clean** across the full source incl. the IndexedDB Profound panel (no `target` override, Const V.1a). **Replayed the actual `weg.csv` (392 rows) through the exact new `parseCsvText`:** 392 rows, all carry `serpFeatures`, **31 Local pack**, URL column aligned through the quoted Trends cell. Retained regression suite **222 checks, all PASS** (10 `pageparse:` invariants). The IndexedDB persistence code is byte-identical to the deployed v7.295 (folded in, not re-authored).

## v7.295 — 2026-06-25 · AI Answer Engines panel now persists across refresh (IndexedDB, not localStorage)

> Shipped by the parallel build stream; folded into v7.296 unchanged. Persistence moved from localStorage to **IndexedDB** (DB `orbitiq`, store `profound`, keyed by project id) because the full ~2.8 MB Profound dataset (~5.6 MB in localStorage's UTF-16 store) exceeded the ~5 MB quota — the write failed silently and a refresh reverted to whatever smaller file last fit. Includes a one-time localStorage→IndexedDB migration (then clears the legacy key), async hydration with a "Restoring saved data…" spinner (no empty-state flash), an honest amber notice when a save can't complete (Const I.5), and `Clear all` deleting the IndexedDB record. (`components/brief/ProfoundVisibilitySection.tsx`.)

## v7.294 — 2026-06-25 · New "AI Answer Engines" panel — upload Profound exports to see real GEO visibility across ChatGPT, Perplexity, Gemini, Copilot & Google AI

**The ask (Wayne).** Add a new panel under the **LLM Visibility** nav group, fed by **Profound** CSV exports, that extracts and displays as much as possible from the files — and give each file its own upload feature so the upload activates the panel. Identify what each CSV does.

**What shipped.** A new left-nav item **`09 · AI Answer Engines`** in the **LLM Visibility** group (the existing live Claude+ChatGPT probe stays at `08 · LLM Visibility`, untouched; items 09–14 renumbered to 10–15). New component **`components/brief/ProfoundVisibilitySection.tsx`** — fully upload-driven, so it renders even before an analysis exists (like API Usage).

- **Three upload slots, auto-routed by CSV header (filename-independent):** (1) **Responses** — `raw_data*.csv` / `Raw Data.csv` (required); (2) **Rankings** — `rankings-by-topic.csv` (optional); (3) **Prompts** — `prompts_export_*.csv` (optional). Drop any export into any slot; the header signature decides. Multiple raw response files are **merged and de-duplicated** (by run+platform+type+prompt+asset, keeping the richer row), so the partial `Raw Data.csv` / `raw_data2/3` are subsumed by the fuller `raw_data4`.
- **Tracked brand auto-detected** as the brand present in every response Profound flagged "mentioned" → **Wealth Enhancement Group** on this data (with a sensible fallback; works for any future client's export).
- **Six views (tabs), every figure a direct count of uploaded rows — Const I.1, nothing modeled:** *Overview* (engines covered, topics, answer-presence rate = tracked-brand mentions ÷ visibility responses, position-when-mentioned distribution, tracked-brand sentiment split); *Engines & Topics* (answer presence by AI engine and by topic); *Competitive* (Profound's per-topic visibility leaderboard + aggregate brand table from `rankings-by-topic`, **plus** an independent raw brand co-mention share-of-voice from the response text); *Reputation* (per-brand positive/negative sentiment from the sentiment-type rows via the `asset` column, praise/criticism theme extraction for the tracked brand, and the search queries the engines ran); *Prompts* (the 405-prompt catalogue by topic + target engines); *Responses* (searchable/filterable browser over the per-engine answers with mention flag, position, and brands named).
- **UX invariants:** robust RFC-4180 CSV parser (handles the multiline quoted response text); per-file load state + row counts + a *Clear all* CTA in-place (Const IV.4); data date + uploaded-at timestamp in the header (Const IV.5); parsing spinner with the file name (Const IV.2); honest empty states per slot (Const I.5). Data is persisted per project in the browser (quota-safe; large response bodies stored as excerpts, labeled as such).

**Why no brand-guard scrub (Const III.1a).** The competitor-brand guard is scoped to read sites over the **canonical keyword pool / `_categoryBreakdown`**. This panel reads **uploaded Profound CSVs** — a separate data source whose entire purpose is competitive share-of-voice — so competitor brands are shown by design (exactly as `rankings-by-topic` lists them), not leaked into keywords/clusters. No canonical-pool read site is touched.

**Verification (Art. V).** New component **`tsc --noEmit` clean** under the project tsconfig — **no `target` override** (Const V.1a); imports only `react`, no Map/Set-iterator spread or `for…of` (downlevel-iteration safe). **jsdom harness at real scale** (the actual 2,430-response / 300-ranking / 405-prompt exports): parser yields exactly 2,430 rows from the multiline-quoted CSV, 990 visibility rows, 10 "mentioned", 6 engines, 30 topics, tracked brand = Wealth Enhancement; React tree **mounts and every one of the 6 tabs renders without crash in BOTH dark and light** (Const V.5); theme-parity static guard confirms no `text-white`/cyan text on surfaces and 600-shade colored text for light legibility (Const IV.6). `page.tsx` edits parse clean. Visual render saved as `orbitiq-v7.294-RENDER.html` (both themes, real data).

## v7.293 — 2026-06-25 · Local services now come from the Keyword panel's canonical categories (brand + top 7 local-pack product categories)

**The ask (Wayne).** v7.292 still showed the wrong categories — "wealth management", "wealth management services", "…investment advisory" in the list and "tax planning / 401k / wealthenhancement brand searches" in the "28 available" dropdown. The rule, restated plainly: the Keyword panel already identifies which keywords trigger a local map pack, and those keywords sit in **product categories**. Those product categories should populate the Local services — **one branded category + the top 7 by volume** — and the dropdown should list **only** those categories.

**Root cause.** The Local panel sourced from the **raw `_categoryBreakdown.categories`** — the un-merged synthesis output with near-duplicate variants ("wealth management" vs "wealth management services" vs "high net worth wealth management") and brand/nav rows. The **Keyword panel** renders from the **canonical category model** (`buildCategoryModel` → `buildCanonicalClusterTopics`), which merges those near-dups into one "Wealth Management" node, stores parent/type, and applies the competitor-brand guard. The two panels were reading different category sets, so v7.292's local-pack filter — even when correct — narrowed the *wrong* list (and since nearly every raw category had a local-pack keyword, it didn't narrow at all → still "28 available").

**What changed (read from the ONE canonical model — Const II.7).**
- **`components/brief/LocalSearchSection.tsx`** — the service list **and** the + Add dropdown now derive from `buildCategoryModel(analysis, domain, competitors, dbKeywords)` — the **same** categories the Keyword panel shows. A category is a Local service candidate when it is a **product/service category** (`parentType === 'procedure'` — excludes brand, location/nav, and the pre-product demand/problem lanes) **and** at least one of its keywords triggers a Google **Local Pack** (real `Fl` roll-up + uploaded SERP-feature cells, Const II.8 stored membership — never re-derived lexically). Each category's volume is the **exact TS roll-up** of its own keyword volumes (Const I.1/I.3, no double count), the same demand the Keyword panel shows. The default list is the **brand (pinned) + the top 7** of those categories by demand; the dropdown lists only the remaining local-pack product categories. No local signal → **brand only + honest-gap notice** (Const I.5). The competitor-brand guard now comes from the canonical model itself (III.1a), so the read site no longer re-implements it over the raw breakdown.
- **Note for existing projects:** the service list persists your manual edits per project (localStorage). If a project shows the old picks, click **↺ Reset to auto** to pull the new brand + top-7 default.

**Verification (Art. V).** Real project **`tsc --noEmit` clean** under the project tsconfig (no `target` override, Const V.1a). Dual-theme SSR render of `LocalSearchSection` against a canonical-shaped fixture (3 `procedure` product categories — 2 local-pack, 1 not — plus a `brand` and a `location` nav row): with signal → brand + the two **local-pack product** categories shown, the non-local procedure category **and** both brand/nav rows **excluded** (even though the brand/nav rows carried a local-pack keyword), cyan map-pack notice shown; no signal → brand only + honest-gap notice; scroll root intact (Const IV.1); **0** hex literals, identical markup in light + dark (Const IV.6/V.5). Retained regression suite **212 checks, all PASS** — the v7.286/v7.292 picker checks were **updated by design** (Const V.6, dated notes in `_regression/run.sh`) from the old raw-breakdown gate to the canonical-model sourcing, with new `local-ui:` invariants (canonical source, `procedure`-only filter, top-7 default).

## v7.292 — 2026-06-25 · Local Search service areas now read the Keyword panel's local-pack segmentation (brand pinned + map-pack categories only)

**The ask (Wayne).** On the Local Search panel, the service areas should be: the one **branded** service area always, plus the categories from the **Keyword panel segmentation** that are mapped to local keywords carrying the 📍 **Local pack** badge (the product categories). And the **+ Add a service** dropdown should be populated **only** with those same local-pack categories — not the full catalog (it was showing "28 available").

**Root cause.** The Local Search picker gated categories with `buildLocalPackCategorySet(snap)`, which read **only** the footprint roll-up `snap.localPackKeywords`. On an analysis whose local signal lives in the uploaded **SERP Features** (`Fl`) cells — but with no roll-up yet — `hasLocalPackData` was false, so the gate switched off entirely and fell back to **all** guarded categories (the "28 available"). The Keyword panel, by contrast, badges 📍 Local pack from a broader set (roll-up **plus** the uploaded `Fl` cells), so the two panels disagreed.

**What changed (single source of truth — Const II.7; no modeled data).**
- **`lib/utils/kwVolume.ts`** — added `buildLocalPackKeywordSet(snap, dbKeywords)` (the real local-pack keyword set = footprint `Fl` roll-up **+** uploaded SERP-feature cells, the same pair the Keyword panel badges from) and `hasAnyLocalSignal(snap, dbKeywords)`. `buildLocalPackCategorySet` now takes the optional `dbKeywords` and folds in the cell signal, still keying categories through **stored** membership (`_categoryBreakdown.keywordCategories`, Const II.8 — never re-derived lexically). Real Semrush `Fl` data only (Const I.1).
- **`components/brief/LocalSearchSection.tsx`** — the service list **and** the + Add dropdown now source from the categories that **trigger a Google local map pack** (the Keyword-panel segmentation), folding in uploaded cells via `dbKeywords`. Per Wayne's choice, **every** category that triggers a local pack is eligible (product + the client's own brand/nav); foreign-brand categories are still dropped by the competitor-brand guard (Const III.1a). The **brand** service area is pinned, always. When there is **no** local signal at all, the panel shows the **brand only** and an honest-gap notice (Const I.5) — re-upload/​re-run to populate — instead of falling back to every category.

**Verification (Art. V).** Real project **`tsc --noEmit` clean** under the project tsconfig (no `target` override, Const V.1a). Dual-theme SSR render of `LocalSearchSection` (Const V.5/IV.6): with signal → brand + the local-pack categories (Wealth Management, Retirement Planning) shown, a non-local category (Tax Consulting) and a competitor brand (Wells Fargo) correctly **excluded**, cyan map-pack notice shown; no signal → brand only + honest-gap notice; scroll root intact (Const IV.1); **0** hex literals, identical markup in light + dark (token-driven parity). Retained regression suite **210 checks, all PASS** — the two v7.286 picker checks were **updated by design** (Const V.6, dated note in `_regression/run.sh`) to the new behavior, and **5** new `localpack:` invariants added (cell-folding category set, `hasAnyLocalSignal`, `buildLocalPackKeywordSet`, the new gate, and the brand-only honest-gap notice).

## v7.291 — 2026-06-25 · Force-refresh the competitor uploader + log exactly what the browser sends (stale-bundle diagnosis)

**The situation.** On the live v7.290 build, every CSV upload (client Wealth Enhancement + competitors) reaches the server with `serpFeaturesPrepared=0` — confirmed in the Vercel runtime logs. But the client file `weg-880+.csv` (505 distinct keywords, matching the log) **has** the SERP-features column, fully populated, 57 "Local pack" rows; and the deployed CompetitorsModal parser (read at the running commit) is correct and extracts those features when run on the same files. Correct code + correct file + zero received ⇒ the browser is running a **stale cached copy of the uploader chunk** that predates SERP-features parsing.

**What changed (diagnostic + cache-bust only — no behavior change).**
- **`components/brief/CompetitorsModal.tsx`** — added a client-side probe that logs `competitor CSV parsed rows=… withSerpFeatures=… sample=…` right after parsing. This both (a) **changes the file's content hash**, so the next deploy forces every browser to fetch a fresh uploader chunk (clearing the stale one), and (b) prints, in the browser console, whether THIS browser parsed the SERP column.
- **`app/api/projects/[id]/keywords/batch/route.ts`** — the upload log now also prints `sampleKeys=[…]` (the field names on the first incoming keyword) and `sampleSerp=…` (its SERP-features value). If `serpFeatures` is missing from `sampleKeys`, the browser definitively didn't send it (stale bundle); if present with a real value but `prepared=0`, it's a server-side count bug. Pure read-only logging.

**How to use it.** Deploy these 3 files, then in the app do a hard refresh (Cmd/Ctrl+Shift+R) or open in a private window, and re-upload. Expected: with the fresh chunk, the uploader now reads the SERP column and `serpFeaturesPrepared` jumps to a real number — populating Local Intent. The new logs confirm it either way.

**Verification (Art. V).** `tsc` clean (components); both changed files transform clean; no behavior/styling change (render + theme parity unaffected); retained regression suite **205 checks, all PASS**.

## v7.290 — 2026-06-24 · Large CSV uploads now persist reliably (the real reason SERP features showed empty)

**The ask (Wayne).** After re-uploading, Local Intent still showed 0 / "No SERP-features in upload" — even on the correct, full file.

**Root cause.** Verified against Wayne's actual file (`td-4400-more-…csv`): the file is perfect — 5,459 of 5,461 rows carry SERP features, 451 say "Local pack" — and his live `db/schema.ts` and v7.288 upload route handle `serp_features` correctly. So the data and the logic were fine; the failure was the **upload not persisting at scale**. That CSV posts as eleven batches, and **every batch re-read the entire project footprint** (the v7.288 `existing` SELECT pulled all rows for the domain — thousands, each with a 500-char `serp_features` cell — once per batch). On a large project that read alone can exceed the serverless function's time budget; the batch 504s, its rows never save, `serp_features` stays empty, and the honest-gap notice (correctly) reports no SERP data.

**What changed (no change to the data model or detection).**
- **`app/api/projects/[id]/keywords/batch/route.ts`** — the existing-rows read is now **scoped to just the keywords in the current batch** (`inArray(keyword, payloadKws)`) instead of the whole footprint. Exact, not a sample (Const I.6) — we only need the prior state of the keywords we're about to write. Turns a per-batch full-table scan into a small lookup, so each batch finishes well inside the time budget. Cross-batch SERP-features union is preserved (a keyword's duplicates in a later batch still read and merge the earlier batch's stored value).
- **`components/brief/KeywordsPanel.tsx`** — upload batches reduced **500 → 250** (lighter request) and each batch now **retries up to 3× with backoff** before it's counted as failed, so a transient timeout no longer silently drops rows. Real accounting preserved — a batch only counts as failed after retries are exhausted, and the "Saved X of N … failed" message (plus the v7.289 SERP diagnostics) still report the truth.

**Verification (Art. V).** `tsc` clean (components); batch route transforms clean; **replayed the real upload** of Wayne's 5,461-row file through the new 250-row + scoped-existing union path — all **82** distinct local keywords preserved, zero lost by the scale fix; no styling change so the v7.289 dual-theme render still holds (Const IV.6 unaffected); retained regression suite **205 checks, all PASS** (6 new `scale:` invariants). Combine with v7.289's diagnostics: after deploying, the upload message now reports SERP features stored, and the panel shows the coverage line.

## v7.289 — 2026-06-24 · Self-diagnose why SERP features aren't stored (upload report + panel coverage readout)

**The ask (Wayne).** After re-uploading, Local Intent still showed 0 with the "No SERP-features in upload" notice — even though his files are full of "Local pack" rows.

**What we established.** The app's exact CSV parser pulls all 451 "Local pack" rows from his TD file, and the v7.288 write/read code is correct. Critically, his keyword cards still show data — which means the `keywords` SELECT (which lists `serp_features` explicitly) is succeeding, so the **column exists** and the **read works**. That isolates it to the **write**: `serp_features` is landing empty. Rather than keep guessing against a database we can't see, this release makes the app report the truth.

**What changed (instrumentation only — no behavior change to the data model).**
- **`app/api/projects/[id]/keywords/batch/route.ts`** — after each upload the route now (a) counts how many rows in the payload carried a SERP-features value (`serpFeaturesPrepared`), and (b) runs a **post-insert `COUNT(*)` read-back** of how many rows in the project actually have a non-empty `serp_features` column (`serpFeaturesStored`), returning both and logging them to the Vercel log. `prepared > 0` but `stored === 0` proves the write is being dropped at the DB layer; `prepared === 0` proves the client never sent it.
- **`components/brief/KeywordsPanel.tsx`** — (a) the **upload result message** now reports it: "SERP features stored on N keywords," or a loud **"⚠ SERP features did not save (X sent, 0 stored)"** when the write fails. (b) A permanent **read-only coverage line** in the panel's Source-of-count strip: **"SERP-features data on X of N stored rows · Y trigger a local pack,"** turning red with a re-upload hint when X is 0. Real data only (Const I.1) — reads stored rows, computes nothing.

**How to use it.** Deploy v7.289 (all files), re-upload your CSV, and read the upload message + the strip line. If it says SERP features were sent but 0 stored, it's a database-write issue and we fix the DB layer next; if it shows a real count but the card is still 0, it's a panel bug and I fix that. Either way we stop guessing.

**Verification (Art. V).** `tsc` clean under the project tsconfig (components); batch route transforms clean; dual-theme render `orbitiq-v7.289-RENDER.html` (coverage line in data-present + empty states, both themes) with WCAG contrast on every new color — base grey 5.9/7.4, red 5.2/5.9, cyan 10.3/4.8 (all ≥4.5, Const IV.6; switched the empty-state warning off amber, which failed at 2.7:1 on the light strip, onto the red token which passes); retained regression suite **199 checks, all PASS** (6 new `serpdiag:` invariants).

## v7.288 — 2026-06-24 · Local Intent: don't lose SERP features on upload (union duplicates) + honest-gap notice when data is missing

**The ask (Wayne).** The Local Intent card showed only ~1 keyword even though many of his keywords clearly trigger a map pack.

**Diagnosis (from Wayne's real files — TD client + Fisher & Creative Planning competitors).** The data is rich and the v7.287 detection is correct: the three CSVs carry **180 distinct keywords** with a "Local pack" SERP-feature (TD alone: 82 distinct, 451 rows), and v7.287's exact `buildKwPool` + `isLocalIntent` computes **139 on the card (82 client + 57 gap)** on these files — verified by replaying the real pipeline. So a count of ~1 is **not** a detection bug — it means the project's stored rows carry **no** SERP-feature data (the column is only captured at upload time, so keywords loaded under an older build have `serp_features` empty). Fix on Wayne's side: re-upload the CSVs on v7.287+. This release hardens two real weak spots that surfaced during the diagnosis.

**What changed.**
- **`app/api/projects/[id]/keywords/batch/route.ts`** — **SERP features are now UNIONed across duplicate keyword rows instead of last-occurrence-wins.** A Semrush organic export lists the same keyword once per ranking URL/snapshot, and the SERP-feature list can differ between those rows — so the old de-dupe could silently drop a real feature (Local Pack / AI Overview / PAA / Video) that only appeared on an earlier row. New `mergeSerpFeatures()` unions the token sets (case-insensitive de-dupe, original casing, capped 500). Because the panel posts in 500-row chunks, the existing-row `SELECT` now also pulls `serp_features` so a keyword whose duplicates span chunks unions onto what an earlier chunk already stored (never clobbers it). Real data only (Const I.1) — we only preserve features present in the upload, never invent one.
- **`components/brief/KeywordsPanel.tsx`** — **honest-gap notice on the Local Intent card (Const I.5).** New `localDataPresent` check (snapshot `Fl` roll-up, any stored "SERP Features" cell, or a live SerpAPI scan). When none is present, the card sub-line reads **"⚠ No SERP-features in upload — re-upload to populate"** instead of a silent near-zero that looks like a bug. When data is present it shows the usual "N client + M gap" breakout.

**Verification (Art. V).** `tsc` clean under the project tsconfig (components) and the batch route transforms clean; `mergeSerpFeatures` unit-tested (preserves a Local pack that last-wins would drop; case-insensitive de-dupe; null handling); replayed the **real chunked upload** on the TD file — union preserves all **82** distinct local keywords (last-wins also 82 here, i.e. no regression) and the unit test proves union recovers the drop case; dual-theme render `orbitiq-v7.288-RENDER.html` (Local Intent card in both data-present and honest-gap states, both themes — no new colors, parity holds); retained regression suite **193 checks, all PASS** (8 new `localfix:` invariants).

## v7.287 — 2026-06-24 · New "Local Intent" summary card in the Keyword panel (client vs gap) + moved the SERP-feature scan into the SERP Features panel (prominent CTA + last-scan)

> This release ships two changes together (Wayne's call): the **Local Intent summary card** (below) and the **SERP-feature scan move** (the "Plus" section after it).

**The ask (Wayne).** In the Keyword Landscape Summary, add a new card after **Non-branded** called **Local Intent Keywords** — any keyword that triggers a local map pack. Under the total, break out how many come from the **client footprint** vs the **competitor gap**. The signal is in the **SERP Features** column of the Semrush CSV uploads. Clicking the card segments the product categories below accordingly.

**The signal is real, not a heuristic.** A keyword is "Local Intent" when its Google SERP shows a **Local Pack** — read straight from Semrush's own SERP-features value (`Fl`, the "SERP Features by Keyword" CSV column). Sources: [Semrush KB 986](https://www.semrush.com/kb/986-api-serp-features), [KB 1340](https://www.semrush.com/kb/1340-serp-features-local-pack). No modeled or guessed values (Const I.1); when a row carries no SERP-feature data it simply isn't counted as local (honest gap, Const I.5).

**What changed.**
- **`lib/utils/kwVolume.ts`** — new `serpCellHasLocalPack()`: client-safe, value-robust detection of a Local Pack in a single uploaded SERP-features cell (numeric id `3` / Projects label `geo` / any "local" token). Mirrors the server `serpFeaturesHasLocalPack` so the panel can flag rows straight off the CSV.
- **`components/brief/KeywordsPanel.tsx`** — every keyword row now carries a real `isLocalIntent` flag, OR-ed across all real signals: a live SerpAPI `local_pack`, the uploaded `Fl` cell, or the footprint roll-up (`localPackKeywords`). Works for **client-footprint AND competitor-gap** rows. New **Local Intent** summary card (after Non-branded; grid now 5-up) showing the total, annual volume, and a **"N client + M gap"** breakout sub-line. New `localIntent` filter: clicking the card segments the Category Breakdown below to local-intent keywords only (same `segmentRows` path as the other cards). Node **📍 Local pack** badges now also reflect the row-level flag, so badges and the card agree (Const II.7).
- **`app/globals.css`** — added the cyan card alpha tokens (`--ca-6-182-212-0_04/0_10/0_45`) in **both** themes; darkened the light-theme `--c-46cce0` (cyan accent) from `#1fa5b9` → `#0e7490` so it is legible on the near-white summary strip (was ~2.6:1, now ~4.8:1). Dark theme unchanged; the v7.286 Local-pack badge / Local panel chips inherit the improved light-mode contrast.

**Data integrity (Const I.1 / I.5).** The local flag is real Semrush SERP-feature data only; the client-vs-gap breakout is counted on the same basis as All Keywords (client footprint + competitor gap). Rows without the column aren't invented as "no" — they're simply not local.

**Verification (Art. V).** Isolated `tsc` under the project tsconfig (no `target` override, V.1a) clean across the real import graph (verified it catches injected errors); dual-theme render (5 cards both themes) + WCAG contrast check on the new cyan accent — dark ≈9–10:1, light ≈4.4–4.8:1 (Const IV.6 parity); retained regression suite re-run with the `localcard:` invariants (8 added — detection, card present, click-segments-by-isLocalIntent, client/gap breakout, 5-col grid, real-signal OR, dual-theme tokens). *(All `localcard:` checks still PASS in the final combined 185-check run below.)*

---

**Plus — SERP-feature scan moved out of the Keyword panel into the SERP Features panel (Wayne).**

**The ask.** The small "SERP FEATURES · X of N keywords scanned · Scan all …" strip lived at the top of the **Keyword** panel. Move that scan into the **SERP Features** panel, make it a **larger, noticeable CTA in the top-right corner**, and label **when the data was last scanned — or that it has never been scanned.**

**What changed.**
- **`components/brief/SerpFeaturesSection.tsx`** — the panel header (top-right) now carries a **last-scan freshness line** ("Last scanned Jun 23, 2026", or amber **"Never scanned"** when there is no scan yet — Const IV.5) and a **prominent filled CTA**: "⚡ Scan all N remaining · ~N credits". It triggers the same page-level auto-batch scan loop (`onStartSerpScan`) and mirrors its live progress ("Scanning… X of Y"). At full coverage it shows a green **"✓ Full SERP coverage"** state. Coverage (scanned / total / remaining) is computed over the real footprint — the uploaded canonical keyword pool ∪ the already-scanned set, deduped; nothing modeled (Const I.1). Three new optional props (`onStartSerpScan`, `serpScanRunning`, `serpScanProgress`).
- **`app/projects/[id]/page.tsx`** — passes the existing background-scan controls (`requestSerpScan` + running/progress) into `SerpFeaturesSection`, the same wiring the Keyword panel used.
- **`components/brief/KeywordsPanel.tsx`** — removed the old SERP-feature coverage/scan strip. The scan results still merge into this panel's table via `mergedScanned`, so the AIO / PAA / Video columns are unchanged — only the scan **trigger** moved, so the action now lives where the data lives (Const IV.4).

**Verification (Art. V).** Isolated `tsc` under the project tsconfig (no `target` override, V.1a) clean on the changed components and on the full `page.tsx` import graph (only the sandbox's `next/*` module stubs differ — no prop-type errors). jsdom SSR render harness asserts every CTA state: **Never scanned**, **Last scanned**, the active **"Scan all 1,011 remaining · ~1,011 credits"** (real coverage math, 1,014 footprint − 3 scanned), the **running** progress, and **✓ Full SERP coverage** — all theme-token-only (no hex literals), legible in both themes (Const IV.6 / V.5). Dual-theme `orbitiq-v7.287-RENDER.html` renders the SERP Features header in light + dark. Retained regression suite re-run **185 checks, all PASS** (10 new `serpscan:` invariants — props, coverage math, CTA text + credits, last-scan/Never-scanned label, full-coverage state, old strip removed from the Keyword panel, `mergedScanned` retained, page wiring).

## v7.286 — 2026-06-24 · Identify which categories trigger a Google local map pack (real Semrush SERP data) + gate the Local picker to them

**The ask (Wayne).** Identify which product categories trigger a local map pack; show it in the Keyword panel; and in the Local view only offer categories whose keywords trigger a local map pack.

**The signal is real, not a heuristic.** Per-keyword Local Pack presence comes from Semrush's SERP-features column (`Fl`), added to the footprint pull. Sources: [Semrush KB 986](https://www.semrush.com/kb/986-api-serp-features), [KB 1340](https://www.semrush.com/kb/1340-serp-features-local-pack). Decisions: source = Semrush `Fl` (broad coverage, no extra API cost; **requires re-running an analysis to populate** — existing snapshots won't have it until then); Local picker = **show only** local-pack categories.

**What changed.**
- **`lib/apis/semrush.ts`** — the footprint pull now requests `Fl`; each keyword gets a real `triggersLocalPack` flag (value-robust detection: numeric id `3` / Projects label `geo` / name "local pack"); the snapshot carries `localPackKeywords` + `localPackDataAvailable`. A one-time log prints a raw `Fl` sample on the first live run so the constant is **self-verified against your account**.
- **`lib/utils/kwVolume.ts`** — `buildLocalPackCategorySet()` rolls the per-keyword flag up to category names through STORED membership (`_categoryBreakdown.keywordCategories`, Const II.8 — never re-derived). One shared helper so the Keyword badge and the Local gate agree (Const II.7).
- **`components/brief/KeywordsPanel.tsx`** — a **📍 Local pack** badge on every category/sub-category whose keywords trigger a map pack (computed over the node's real keyword subtree, works in flat and path-tree modes).
- **`components/brief/LocalSearchSection.tsx`** — the +Add picker and auto-selection are gated to local-pack categories only. **Graceful fallback (Const I.5):** when the analysis predates this data, it does NOT blank out — it shows all categories with an amber "local-pack filtering needs a fresh analysis run" notice; when active, a cyan "showing only local-pack categories" notice.

**Data integrity (Const I.1 / I.5).** The flag is real Semrush SERP-feature data; the rollup never fabricates. Unknown/absent data is shown honestly and never hidden as "no". **Verification caveat:** the exact `Fl` value format couldn't be confirmed from the build sandbox (the Semrush MCP ignores `export_columns`; no app API key here), so detection is value-robust + self-verifying on first live run, and degrades gracefully if the column comes back empty — by Wayne's explicit choice (fail-safe build).

**Verification (Art. V).** Isolated `tsc` (project tsconfig, no `target` override) clean on all changed files; jsdom render + unit harness (17 checks: detection across formats, rollup, gate-on, graceful-fallback-off) all pass; dual-theme render `orbitiq-v7.286-RENDER.html`; retained regression suite re-run **167 checks, all PASS** (13 new `localpack:` invariants added).

## v7.285 — 2026-06-24 · Local Search services → rank by real category demand + un-lock the +Add picker

**The ask (Wayne).** On the Local Search **Services** tab, the categories shown in the Keyword/Market-Gap "PROCEDURE LINES" (Retirement Planning, Tax Planning, Estate Planning…) weren't appearing in the **+ Add service** dropdown.

**Root cause (both in the v7.284 code).** (1) **Cap lockout** — the list auto-selected the top 9 services, filling the cap, so the dropdown was *disabled* ("At limit") with no options until you deleted one. (2) **Wrong volume basis** — the picker ranked/labelled categories by `volumeFor()` (the client's *already-ranked* keyword volume), not the category's real demand. Categories the client doesn't yet rank for scored 0, sorted to the bottom, and showed "—", so the high-demand Market-Gap categories were buried.

**What changed.**
- **`lib/local/seeds.ts`** — `buildServiceCatalog()` and `buildSeedsFromServiceTerms()` now rank and label each category by its **real `monthlyDemand`** (the same field Market Gap reads), falling back to the ranked-pool volume only when a category carries no demand (older snapshots). Added a `SeedCategory` type (`name`/`type`/`monthlyDemand`) and a shared `demandByTerm` map; split the old `resolveServiceSeed` into a volume-free `serviceTermOf` so the catalog and the curated list assign volume from one demand source (Const II.7 / I.1).
- **`components/brief/LocalSearchSection.tsx`** — the **+Add dropdown is now always browsable**: it's disabled only when *nothing* remains to add (not at the cap). At the 10-cap it still lists every remaining category, with an amber hint to remove one first. The list ranks by real demand, the column/stat are relabelled **"Demand / mo"** / **"SERVICE DEMAND / MO"**, and the picker shows each category's demand and an "(N available)" count. Guarded categories now carry `monthlyDemand` into the seed builder.
- **`app/api/projects/[id]/local-scan/route.ts`** — passes the guarded categories into `buildSeedsFromServiceTerms` so curated terms resolve to the same real demand on the scan side.

**Data integrity (Const I.1).** `monthlyDemand` is the category's real demand off `_categoryBreakdown` — nothing modeled. The competitor-brand guard (III.1a) is unchanged and still applied at the read site.

**Theme parity (Const IV.6 / V.5).** No new colors; the at-cap hint reuses the existing amber token. Dual-theme render `orbitiq-v7.285-RENDER.html`.

**Verification (Art. V).** Isolated `tsc` (project tsconfig, no `target` override) clean on all changed files; jsdom dual-theme render asserts demand-ranked order, the demand values, the picker staying browsable at cap, the relabel, and the competitor category guarded out; retained regression suite re-run **154 checks, all PASS** (new `local:`/`local-ui:`/`local-route:` v7.285 invariants added).

## v7.284 — 2026-06-24 · Local Search → editable primary services (cap 10, delete, add from category catalog)

**The ask (Wayne).** On the Local Search panel's **Services** tab: (1) expand the 8 primary services to **10**; (2) put a **trash can** next to each service to remove it from what we check locally; (3) add a **＋** to add a primary service, picked from the product categories defined by the Keyword panel, ordered **highest → lowest real search volume**.

**What changed.**
- **`lib/local/seeds.ts`** — added `buildServiceCatalog()` (the full, un-capped list of candidate service seeds from the client's categories, sorted by **real Semrush volume** desc) and `buildSeedsFromServiceTerms()` (brand pinned first + an explicit curated term list, each volume resolved from the real pool exactly as the auto list does, deduped, capped). `buildServiceSeeds()` now composes the catalog; default cap **8 → 10** (`DEFAULT_SERVICE_CAP`).
- **`components/brief/LocalSearchSection.tsx`** — the Services table is now **editable**: a 🗑 on every **service** row (the brand row is **pinned** 📌, always tracked), and a **＋ Add service** picker listing the remaining service categories **sorted by real volume** (with each category's volume shown). Cap is **10 total** (brand + up to 9 services). Edits **persist per project** (localStorage) and are the exact set the next scan uses — the displayed list and the scanned list reconcile (Const II.7). A **↺ Reset to auto** clears the curation.
- **Brand guard at the read site (Const III.1a)** — the catalog reads `_categoryBreakdown.categories`, which still contains competitor-brand categories, so the panel now applies the competitor/blocklist **brand guard** (`buildCompetitorBrandTokens` / `buildExcludedBrandTokens` / `textHasCompetitorBrand` + `isBrandedKeyword`) before building the catalog — a rival brand can never appear as a selectable service; the client's own brand is kept. Same guard added to the scan route's fallback category read.
- **`app/api/projects/[id]/local-scan/route.ts`** — accepts the curated `services[]` (brand added server-side) and scans those exact terms in the user's order; server default + cap raised to **10**.

**Data integrity (Const I.1).** Every volume — auto or curated — is the real Semrush volume of the service term off the canonical pool; nothing modeled. The add-picker only offers categories that already exist in the client's footprint.

**Theme parity (Const IV.6 / V.5).** New controls (`.svc-del` / `.svc-add-sel` / `.svc-add-btn` / `.svc-reset`) use the existing `var(--…)` palette only — no hex literals — verified legible in both themes by the render check.

**Verification (Art. V, incl. V.1a / V.5 / V.6).** Isolated `tsc` mirroring the project tsconfig (no `target` override) — clean on all changed files. **jsdom SSR render** of the Services tab in **both** themes (`orbitiq-v7.284-RENDER.html`) asserts: brand pinned, 🗑 on every service row, ＋Add picker, the competitor category (`Vanguard Funds`) guarded out, cap 10, and theme-var-only styling. **Retained regression suite re-run — all checks PASS** (carried forward from the latest recoverable suite, v7.278 base, + a new `local:`/`local-ui:`/`local-route:` block; 150 checks). *Note: the v7.279–283 working folders on disk are empty stubs and the regression suite is excluded from shipped zips, so those releases' added blocks could not be located to merge — recommend committing `_regression/` to source control going forward so the chain isn't lost.*

## v7.283 — 2026-06-24 · Exec Summary readability + AI per-stage row (LLM categories → journey stages) + LLM card big numbers

**The ask (Wayne).** (1) The card breakdown text is hard to read — make it larger. (2) The "Where you disappear" **AI row** (was all "coming") — we can now pull it from the LLM Visibility panel. (3) On the exec's **LLM visibility card**, add two larger numbers above the bar charts: **non-branded visibility %** and **branded visibility %**.

**What changed (`components/brief/ExecutiveSummarySection.tsx`, presentational + a real roll-up).**
- **Larger text** — the two-worlds card breakdown rows go from 9/10px to **label 12px / value 14px**, the sub line to 11px, and the Journey card rows from 8px to 10px labels/subs (value 19px). Colors use existing readable tokens (`--c-c0c0e0` / `--c-e8e8ff`).
- **AI per-stage row** — the four "coming" cells are replaced with a real per-stage AI mention rate. New `aiStageRates` memo maps the LLM Visibility panel's per-**category** mention rates onto the 4 journey stages: for each stage it takes the **volume-weighted mean** of the probed categories' mention rate, using the **same `buildClusters()`** stage volumes the grid's Organic row uses (Const II.6/II.7). Categories the probe didn't cover are skipped, and a stage with no probed volume renders **"no data"** — never a fabricated 0% (Const I.1/I.5). v2 probe only. Caption updated to explain the mapping.
- **LLM card big numbers** — above the per-platform citation bars, two large figures: **Non-branded visibility** (`unbranded.score`) and **Branded visibility** (`branded.score`) — the LLM panel's own real mention/recognition rates. v2 probe only.

**No data change (Const I.1).** The AI per-stage figure is a transparent volume-weighted roll-up of real per-category mention rates; the LLM card numbers are the probe's own rates. Nothing modeled; missing data shows as "no data".

**Theme parity (Const IV.6 / V.5).** No new tokens or hex; the AI cells reuse the existing red/amber/green band tokens. Dual-theme client render asserts zero raw hex.

**Verification (Art. V, incl. V.1a / V.5 / V.6).** Isolated `tsc` (project-mirrored, no `target` override) — PASS. Full **retained regression suite 216/216 PASS**. New `exec283:` / `viz283:` / `render283:` invariants lock: `aiStageRates` reads `llmSnap.categories`, the per-stage rate is a volume-weighted mean with a null (no-data) honest gap, the "coming" placeholder is gone, the LLM card big numbers come from `unbranded.score`/`branded.score`, and the enlarged fonts — plus a **jsdom client render** (fixture with categories) confirming the LLM big numbers, a populated AI row (≥ 1 per-stage % cell), the stage-mapping caption, the 14px breakdown value, and no raw hex. Dual-theme render at `orbitiq-v7.283-RENDER.html`.

## v7.282 — 2026-06-24 · Executive Summary cards — each big number gains a breakdown beneath it

**The ask (Wayne).** On the "two worlds" cards, keep the big headline and add a breakdown under each:
- **Google SERP Ranks** — keep the page-1 % total; underneath split into **ranks 1-3** and **ranks 4-10**.
- **AI Visibility** — keep the combined %; underneath show the **non-branded** and **branded** visibility %.
- **Coverage map** — keep the big total pages; underneath show how many are **existing** vs **net-new**.

**What changed (`components/brief/ExecutiveSummarySection.tsx`, presentational only).**
- **Google SERP Ranks** — new `rank410Pct = (page1Vol - top3Vol) / totalVol`; the card now shows `page1Pct%` big, with a breakdown **"Ranks 1-3 {top3VolPct}% · Ranks 4-10 {rank410Pct}%"** (same volume basis as the headline, so they reconcile to page-1).
- **AI Visibility** — keeps the combined brand-mention rate big, and adds **"Non-branded {unbranded.score}% · Branded {branded.score}%"** — the LLM Visibility panel's own *Unbranded visibility* and *Brand recognition* figures (real mention/recognition rates off the probe, `lib/apis/llmProbe.ts`). Only shown for a v2 probe (no fabricated split for v1/AIO).
- **Coverage map** — the optimize/build counts moved from the subtext into a labeled breakdown under the total: **"Existing (optimize) {existing} · Net-new (build) {build}"** (same `scope.existing`/`scope.build` from the Content Map plan).
- Added a reusable `breakdown` block to the card renderer (label · value rows); the Journey card's two-row layout is unchanged.

**No data change (Const I.1).** Every breakdown figure is a real roll-up — rank-band volumes off the canonical pool, the probe's own unbranded/branded rates, and the content-map optimise/net-new split. Nothing modeled.

**Theme parity (Const IV.6 / V.5).** No new color tokens or hex; breakdown rows use existing muted tokens. The dual-theme client render asserts zero raw hex.

**Verification (Art. V, incl. V.1a / V.5 / V.6).** Isolated `tsc` (project-mirrored, no `target` override) — PASS. Full **retained regression suite 198/198 PASS**. Per V.6, four prior-release checks whose wording changed (coverage subtext → breakdown) were **updated in place with dated notes**. New `exec282:` / `viz282:` / `render282:` invariants lock: `rank410Pct` volume math (1-3 + 4-10 reconcile to page-1), the AI breakdown sourced from `unbranded.score`/`branded.score`, the coverage existing/net-new breakdown, and a **jsdom client render** confirming all three breakdowns render with values and no raw hex. Dual-theme render at `orbitiq-v7.282-RENDER.html`.

## v7.281 — 2026-06-24 · Journey card pulls its pre-product / product split from the Journey panel (fixes phantom pre-product coverage)

**The bug (Wayne).** The v7.280 Journey card showed **"Pre-product 16 of 19 problem themes covered"** even though the **pre-product journey has not been built** — the Journey panel itself shows **"Pre-product journey 0"**. Cause: v7.280 computed the lanes with a **forked `buildClusters()` classification** (its own problem-pool heuristic), which disagrees with how the Journey panel defines the lanes. Wayne: pull this from the Journey panel, do not add new logic.

**The fix (Const II.7 — single source of truth).** Extracted the panel's exact lane logic into one exported helper and made the card call it.
- **`components/brief/JourneySection.tsx`** — new exported `journeyLaneSummary(topics, problemSeeds)` containing the panel's verbatim rule: a topic is **pre-product** only when it is a `'problem'` cluster **or** a `'demand'` cluster seeded by a deep-journey problem head term (`_demandUniverse.problemSeeds`); coverage = topics whose `canonTopicState` is `'existing'` (the client owns a ranking page). CanonicalJourneyView now has a shared helper to defer to (no behavior change to the panel).
- **`components/brief/ExecutiveSummarySection.tsx`** — the card's `journeyLanes` now calls `journeyLaneSummary(canonicalTopics, problemSeeds)` over the **same canonical topics** the Content Map / Journey panels build, with `problemSeeds` read from `analysis._demandUniverse`. The forked `buildClusters` lane logic is gone. Pre-product therefore reads **"—" / "not built yet"** exactly when the panel shows "Pre-product journey 0"; the Product row shows **"{covered} of {N}"** topics (N = the panel's product-lane topic count). Canonical topics are now built **once** and shared by the coverage-map plan and the journey summary.

**No data change (Const I.1).** Counts are the panel's own roll-ups over the canonical topic pool — nothing modeled; the change removes invented numbers rather than adding any.

**Verification (Art. V, incl. V.1a / V.5 / V.6).** Isolated `tsc` (project-mirrored, no `target` override) — PASS. Full **retained regression suite 185/185 PASS**. Per V.6, two `*280` checks whose behavior changed by design (lane logic now via `journeyLaneSummary`; product row shows "of N" not "of 4") were **updated in place with dated notes**. New `exec281:` / `journey281:` / `render281:` invariants lock: the exec reads `journeyLaneSummary` over canonical topics with `_demandUniverse` seeds (no forked classification), the helper classifies problem + deep-journey-seeded demand as pre-product **and drops a demand topic back to product when its seed is absent** (the exact bug), coverage counts only client-owned topics, and the client render shows the **Pre-product "not built yet"** honest gap when no deep journey exists. Dual-theme render at `orbitiq-v7.281-RENDER.html`.

## v7.280 — 2026-06-24 · Executive Summary cards — "Google SERP Ranks" rename, Coverage shows optimise + build, Journey split into pre-product + product rows

**The ask (Wayne).** On the Exec Summary "two worlds" cards: (1) rename **"Traditional"** -> **"Google SERP Ranks"**; (2) on the Coverage card, bring in **both** existing pages to optimise **and** net-new pages to build; (3) on the Journey card, show the **product journey** coverage **plus a second row above it for the pre-product journey**.

**What changed (`components/brief/ExecutiveSummarySection.tsx`, presentational + roll-up only).**
- **Rename** -- the card is now **"Google SERP Ranks"**, and the matching pillar label in the Overall Visibility Score block was renamed too for consistency (pillar label column widened 82->118px). The 1/3 formula and the underlying `page1Pct` value are unchanged.
- **Coverage card -> both halves of the Content Map (05).** New `optimizeTopics` = `contentPlan.scope.existing`; headline `coverageTopics` = existing + build **pages**; subtext reads **"{existing} to optimize . {build} to build"**. Both numbers come from the same canonical content-map plan (`buildContentPlanFromTopics(buildCanonicalClusterTopics(...))`) so they reconcile to that panel's optimise/net-new split. Card label updated to **"Coverage map."**
- **Journey card -> two stacked rows.** New `journeyLanes` memo runs the **same `buildClusters()`** the Journey panel renders and splits clusters by `journeyType`: the **Product** row shows funnel-stage coverage (**X of 4** stages with client organic coverage); the **Pre-product** row (rendered **above** it) shows problem-theme coverage (**X of Y** themes). Pre-product is awareness-only (Const III.2a) and is populated only from the deep-journey build (III.2a-ii) -- so when it hasn't been built the row honestly shows **"--" / "not built yet"** rather than a fabricated count.

**No data change (Const I.1).** Every figure is a count/sum off the canonical keyword pool and the same cluster/plan builders the other panels use -- nothing modeled, simulated, or hard-coded.

**Theme parity (Const IV.6 / V.5).** No new color tokens or hex -- the cards reuse the existing palette already validated in both themes; the dual-theme client render asserts zero raw hex.

**Verification (Art. V, incl. V.1a / V.5 / V.6).** Isolated `tsc` under the project-mirrored `tsconfig` (no `target` override) -- PASS. Full **retained regression suite 170/170 PASS** (129 baseline + 21 *279 + 20 new *280). Per V.6, four *279 checks whose behavior legitimately changed (coverage wording; "Coverage gap"->"Coverage map") were **updated in place with dated notes**, not deleted. New `exec280:`/`gap280:`/`render280:` invariants lock the rename (card + pillar), `coverageTopics = scope.existing + scope.build` with the optimize/build subtext, the journey lane split by `journeyType` with Pre-product + Product rows and the pre-product honest-gap, plus a **jsdom client render (mocked fetch)** confirming "Google SERP Ranks", "Coverage map" with both halves, both journey rows ("of 4"), and no raw hex. Dual-theme render at `orbitiq-v7.280-RENDER.html`.

## v7.279 — 2026-06-24 · Executive Summary — "Overall Visibility Score" relabel + AI/Coverage cards sourced from their panels

**The ask (Wayne).** On the Executive Summary: (1) rename the lead KPI from **"GEO Visibility Score"** to **"Overall Visibility Score"**; (2) make the **AI Visibility** summary card pull from the **LLM Visibility** panel; (3) make the **Coverage Gap** card pull from the **Content Map**; (4) keep **Journey** sourced from the Journey panel.

**Decisions (Wayne, AskUserQuestion).** AI Visibility = the **combined unbranded + branded mention rate** (the LLM panel's "Brand mention share"); the **Overall Visibility Score's AI pillar uses that same number** so the card and the score agree; Coverage Gap shows **both — net-new topics (headline) + annual volume (subtext)**; Journey stays **"stages with organic coverage (X of 4)."**

**What changed (`components/brief/ExecutiveSummarySection.tsx` + `app/projects/[id]/page.tsx`).**
- **Relabel** — the lead KPI now reads **"Overall Visibility Score"** (the equal-weighted ⅓ formula is unchanged; only the label moved).
- **AI Visibility now mirrors the LLM Visibility panel.** New `llmMentionPct` reproduces that panel's *Brand mention share* **verbatim** — acquired ÷ available across **all** probe responses (unbranded + branded, both platforms: `llmSnap.results.filter(r => r.mentioned).length / llmSnap.results.length`); v1 probes fall back to their all-prompt rate. `aiVisPct` now reads this LLM figure first (AI Overviews remain a fallback **only** when no LLM probe was run — honest gap, never fabricated). Because the **score's AI pillar and the landscape line already read `aiVisPct`**, the card, the pillar, and the headline now show one consistent number.
- **Coverage Gap now reads the Content Map (05).** The exec builds the **same** canonical content-map plan the Content Map renders — `buildCanonicalClusterTopics(...)` → `buildContentPlanFromTopics(...)` — with the same inputs (raw snapshot domain, competitor list, uploaded keywords, and the page-lifted `claudeAssigns` now threaded into the exec). The card shows `scope.build` **net-new topics** (headline) + `fmtAnnual(scope.buildVol)` **annual search volume** (subtext); it reconciles to that panel's *build net-new* set by construction (II.6/II.7).
- **Journey** card unchanged — still the `buildClusters()` stages-with-coverage count.

**No data change (Const I.1).** Every figure is a direct count/sum of real probe results and the canonical keyword pool — nothing modeled, simulated, or hard-coded. The change re-sources and relabels existing real metrics.

**Theme parity (Const IV.6 / V.5).** No new color tokens or hex were introduced — the cards reuse the existing `--c-22c55e / --c-ef4444 / --c-f59e0b / --c-06b6d4` tokens already validated in both themes. The dual-theme client render asserts zero raw hex in the rendered inline styles.

**Verification (Art. V, incl. V.1a / V.5 / V.6).** Isolated `tsc` under the project-mirrored `tsconfig` (extends `./tsconfig.json`, **no `target` override**) — PASS. Full **retained regression suite re-run: 150/150 PASS** (129 prior + 21 new `exec279:` / `gap279:` / `aivis279:` / `render279:` invariants). The new checks lock: the relabel, the AI card sourcing from `llmSnap.results` and `aiVisPct` preferring it, the coverage card reading `scope.build`/`buildVol` from the canonical content-map plan (build+existing==total, no double count), the exec combined-rate == the LLM panel's brand-mention-share formula, and a **jsdom client render (mocked fetch)** that drives the data-gated cards and confirms "Overall Visibility Score", AI 25% (3 of 12), the Coverage-gap topics+volume card, and no raw hex. Dual-theme render at `orbitiq-v7.279-RENDER.html` (dark + light side by side).

## v7.278 — 2026-06-23 · LLM Visibility — "Sentiment of mentions" card redesigned into three labeled bar rows with tone icons

**The ask (Wayne).** Change the sentiment summary card to **three rows, each with a horizontal bar graph** — one for positive, one for neutral, one for negative — and add a **thumbs-up** icon for positive, a **thumbs-down** for negative, and a neutral icon for neutral.

**What changed (`components/brief/LLMVisibilitySection.tsx`, UI only).**
- The single stacked positive/neutral/negative bar is replaced by **three labeled rows**. Each row is `icon · horizontal bar · count · %`, rendered by a new `SentimentBar` component. Positive uses a thumbs-up, negative a thumbs-down, neutral a circle-minus — three inline SVG icons (`ThumbsUpIcon` / `ThumbsDownIcon` / `NeutralIcon`); no icon library added.
- Each bar's fill width is the row's real share (`pctPos` / `pctNeu` / `pctNeg`, already derived from `sentiment.positive/neutral/negative`); the footer now reads "N mentions assessed". The non-assessed / zero-mention empty states are unchanged.

**No data change (Const I.1).** Counts and percentages are the existing real, Claude-assessed sentiment values off the probe snapshot — nothing modeled, nothing hard-coded. Presentational only.

**Theme parity (Const IV.6 / V.5).** The app toggles theme via `[data-theme="light"]` on `<html>`, not the OS `prefers-color-scheme`, and `darkMode` is unset in `tailwind.config.ts` — so OS-based `dark:` variants are **not** used. Icon shades are single tones verified ≥3:1 against **both** the light (`#fff`) and dark (`#111118`) `orbit-surface`: green-600 (3.30 / 5.70), red-600 (4.83 / 3.89), slate-500 (4.76 / 3.95). Bar track stays the theme-aware `bg-orbit-muted`; counts use `text-orbit-secondary`.

**Verification (Art. V, incl. V.1a / V.5 / V.6).** `tsc` under the project-mirrored `tsconfig` (extends `./tsconfig.json`, **no `target` override**) — PASS. SSR render harness (real-shaped 43/36/6) — three bars at correct widths, all three tone icons present, aria-labelled, theme-safe colors, no `dark:` in code — PASS. Dual-theme render (`orbitiq-v7.278-RENDER.html`, light + dark side by side) — both legible. Contrast computed numerically against the real token values (above). Full **retained regression suite re-run: 129/129 PASS**; added 8 `llmsent:` invariants for this release.

## v7.277 — 2026-06-23 · LLM Visibility — per-prompt mention badges + a Brand Mention Share card (citations deferred)

**The ask (Wayne).** Badge each prompt where we secured a brand mention, labeled by platform (Claude / ChatGPT). Add summary cards for **Citation Share** and **Brand Mention Share** (acquired vs available, with exact data).

**Data-integrity decision (Const I.1 / Art. X).** The LLM probe captures **brand mentions** per platform (`ProbeResultV2.mentioned`) — real data — but captures **no citation links** (the probe calls plain `chat/completions` / `messages` with no web-search tool, so responses carry no citations; URLs a chat model types in prose are ungrounded). Per Wayne: **ship the brand-mention pieces now, defer Citation Share** until we add citation-grounded (web-search) probing. No citation card is shown rather than fabricate one.

**What changed (`components/brief/LLMVisibilitySection.tsx`, UI only).**
- **Per-prompt mention badges** in the category drawer: a green "✓ Claude mention" / "✓ ChatGPT mention" badge appears next to a prompt for each platform whose response actually mentioned the brand. (`promptsByCat` now carries per-platform mention; new `DrawerRow` type + `MentionBadge`.)
- **New "Brand mention share" summary card** (score grid now 4-up): acquired ÷ available across **all** probe responses (unbranded + branded, both platforms — Wayne's chosen denominator), with exact counts and a per-platform split (Claude A/B · ChatGPT C/D) below. Every figure is a direct count of real probe results.
- **Citation Share — deferred**, with an in-code note explaining why (no citation data captured yet).

**No data/probe change** — scheme/cap unchanged from v7.274/275; this reads existing stored probe results.

**Verification (Art. V, incl. V.1a).** `tsc` under the project-mirrored tsconfig (no `target` override) — PASS. SSR render at real scale: Brand mention share card shows correct %, acquired/available, and per-platform split; no citation card; 4-up grid; drawer renders per-platform mention badges; **theme parity** — 0 hardcoded colors, orbit-*/established green tokens only (Const IV.6 / V.5).


## v7.276 — 2026-06-23 · LLM Visibility — "view prompts" moved inline onto each category row (expandable drawer)

**The ask (Wayne).** Move "view prompts" inline onto the category row; clicking opens an expandable drawer for that category, clicking again collapses it.

**What changed (`components/brief/LLMVisibilitySection.tsx`).**
- The bottom global "View prompts (N)" link is **gone**. Each **category row is now clickable** ("view prompts" / "hide prompts" with a rotating chevron); clicking expands an **inline drawer row** directly beneath it showing that category's exact prompts — the 5 unbranded + 1 branded, each tagged — and clicking again collapses it. One row open at a time.
- Brand-level prompts (not tied to a category row) remain available in the existing **"View all prompts & responses"** detail toggle, which is retained.
- New `PromptDrawer` component (replaces the removed global `PromptList`); per-category dedup via `promptsByCat`; `expandedCat` state; `Fragment` used to emit the row + its drawer row.

**No data change.** Probe scheme/cap unchanged from v7.274/275 — this is a UI/interaction change only. Prompts shown are the actual prompts stored on the analysis (Const I.1).

**Verification (Art. V, incl. V.1a).** `tsc` under a tsconfig that **mirrors the project's** (no `target` override) — PASS. SSR render at real scale (30 categories): rows show inline "view prompts"; collapsed = no drawer; expanding a category renders its drawer (explainer + 5 unbranded tags + 1 branded tag) and flips the label to "hide prompts"; old global link absent; full-detail toggle retained; `/5` totals intact; **theme parity** — 0 hardcoded colors, orbit-* tokens only (Const IV.6 / V.5).


## v7.275 — 2026-06-23 · Hotfix: v7.274 build error (Map iterator spread under the project's TS target)

**The problem.** v7.274 failed `npm run build` (Vercel): `LLMVisibilitySection.tsx:151` spread a `Map.keys()` iterator (`[...byGroup.keys()]`), which TypeScript rejects under the project's tsconfig (no explicit `target`, so downlevel-iteration rules apply) — "MapIterator can only be iterated through with --downlevelIteration or --target es2015+". The v7.274 isolated typecheck used `target: ES2020`, which masked it.

**The fix.** `Array.from(byGroup.keys())` instead of the spread, and `cats.concat(...)` instead of an array-spread merge (`components/brief/LLMVisibilitySection.tsx`). Behavior is identical — only the iteration form changed. No other functional change from v7.274.

**Verification.** Re-typechecked with a tsconfig that **mirrors the project's** (no `target` set): the fixed file PASSES; reverting to the spread reproduces the exact `TS2802` build error, confirming the fix removes it. Scanned all v7.274-changed files for other Map/Set iterator spreads — none (remaining spreads are over arrays, allowed at any target). Process note: isolated typechecks must mirror the project tsconfig (no `target` override), not a hand-picked ES2020.


## v7.274 — 2026-06-23 · LLM Visibility — deeper unbranded coverage (5 prompts/category, 30 categories) + a "View prompts" link

**The ask (Wayne).** On the AI Search Visibility (LLM Visibility) panel: (1) add an inline link to see the exact prompts that were sent; (2) the old 12-category / 2-unbranded-prompt sample was too thin to draw insights from — widen it; (3) we care about **unbranded** category visibility, not branded — keep just one branded prompt per category for sentiment.

**What changed.**
- **Probe scheme is now 6 prompts per category — 5 unbranded + 1 branded** (was 2 unbranded + 1 branded). The five unbranded prompts are distinct query framings of the same category (best / considering / top-rated / shortlist / word-of-mouth), so the unbranded mention rate is now out of /5 per platform (/10 combined) instead of /2 (/4). The single branded prompt is retained **only** for per-category sentiment & recognition. (`lib/apis/llmProbe.ts` — `buildPromptSpecs`, `ProbeIntent`.)
- **Category cap raised 12 to 30** (`lib/claude/synthesize.ts`). The probe runs in one Lambda window; 30 categories x 6 prompts x 2 platforms (Claude Haiku 4.5 + GPT-4o-mini) fits comfortably (~150-180s), 40+ risks the ~300s kill. **This cap is a deliberate, Wayne-requested runtime exception (Const I.6)** — chosen over "uncapped," which would require batching/checkpointing the probe and chunking the classifier; logged here rather than diverging silently.
- **New "View prompts" link** on the panel (`components/brief/LLMVisibilitySection.tsx`) — a dedicated, prompt-only view (no responses), grouped by category with brand-level last, each prompt tagged unbranded/branded. Separate from the existing "View all prompts & responses" detail toggle. Methodology line updated to "6 prompts per category (5 unbranded + 1 branded)".
- **Classifier output cap raised 4000 to 16000 tokens** (`lib/apis/llmProbe.ts`, sentiment/recognition pass). At 30 categories the candidate set can exceed 100 items; the classifier returns one JSON object each, and the old 4000-token cap would truncate the array and blank sentiment (the v7.231 truncation class). Billed on actual output only — free headroom, not added cost.

**Data integrity.** All probe figures remain live API responses at analysis time (Const I.1) — nothing modeled. The "View prompts" view shows the actual prompts sent. Cost is negligible (~$0.70/run at 30 categories on verified June-2026 API rates); runtime, not cost, is the binding constraint.

**Verification (Art. V).** Isolated `tsc` — 0 new type errors (diffed against the v7.273 baseline). `buildPromptSpecs` behavioral test on the real function — 184 prompts/platform, 150 unbranded + 30 branded (cat) + 4 brand-level, 5 distinct unbranded framings per category, no brand name in unbranded prompts, brand name in every branded prompt. SSR render at real scale (30 categories): renders clean, methodology text updated, /5 category totals, working "View prompts (N)" link, **theme parity** — new markup uses only orbit-* tokens, no hardcoded white/black/cyan (Const IV.6 / V.5). PDF + Executive Summary read aggregate scores dynamically — no parity edits needed.


## v7.273 — 2026-06-23 · Journey panel — view toggle moved to the top, segments shown as a 4-box selector

**The ask (Wayne).** On the Audience Journeys panel, bring the List / Mind-map **view toggle up to the top**, directly under the header text. Then show the **segments as boxes** — one box per segment, with a box for **All Segments in front** (leading the row).

**Decisions you made (this session).**
- **Drop "Shared / all personas"** as its own box — the selector is exactly four boxes (All Segments + the three segments). The Shared partition still exists internally and its topics continue to roll into the **All Segments** combined view, so no data is hidden (Const I.5).
- **Active segment expands inline** — clicking a segment box expands *that box* to show its trigger + tagline; the others stay compact. (Replaces the old large bracket-connected persona card.)

**What changed (presentational only — no data, Const I.1).**
- **View toggle relocated** to the top of the panel, under the "Audience Journeys" description and **above** the segment selector. It still governs only the canonical List ⇄ Mind-map view, so it appears when canonical topics exist; it was removed from its old spot lower in the canonical view.
- **Segment pills → a responsive row of boxes.** "All Segments" leads the row, followed by one box per segment (portrait/initials, name, and volume %). The active segment box expands inline with its trigger and tagline.
- **Removed the old stacked-pill layout** and its measured pill→persona SVG bracket connector (and the now-dead geometry refs/state that drove it). The shared `buildConnector` helper is retained (still exported).

**Defensibility.** No numbers invented, modeled, or changed; this is layout only. The segment→bucket partition (segments + Shared = total) is untouched, so combined totals still reconcile (Const II.7). All new styling uses existing theme tokens — no hex literals — so it is legible in both light and dark (Const IV.6).

**Verified.** Isolated `tsc` on `JourneySection.tsx` — clean. Full retained regression suite re-run (Const V.6) — all prior checks **PASS**, including the journey partition block (segments + Shared = all). Added a new retained `journeyboxes:` block: SSR render confirms the toggle renders **above** the boxes, all three segment boxes render, the **Shared box is gone**, and the selector region carries **theme tokens only (no hex)** — all **PASS**.

**Action for Wayne:** deploy v7.273 — open the Audience Journeys panel: the List / Mind-map toggle now sits at the top under the heading, with the four selector boxes (All Segments + the three segments) beneath it. Click a segment box to expand its trigger + tagline inline.

## v7.272 — 2026-06-23 · Category Breakdown — delete a keyword, sub-category, or category (trash icons)

**The ask (Wayne).** In the Keyword panel's Category Breakdown tree, add a trash-can to delete any category, sub-category, or keyword. (The opposite — adding categories/sub-categories/keywords — is the next release, v7.273, and will pull real Semrush volume for added keywords.)

**Decisions you made.**
- **Delete is destructive:** deleting a category or sub-category also deletes the keywords inside it.
- Added keywords (next release) will get **real Semrush volume** so the data stays defendable (Const I.1).

**What changed.**
- **Trash icon on every category and sub-category row** (next to the keyword count). Clicking it opens an inline confirm — "Delete '<name>' and its N keywords permanently?" — with Delete / Cancel, so a destructive action is never one accidental click.
- **A small × on each keyword chip** (expand a leaf to see them) deletes that single keyword immediately, mirroring the existing per-row delete in the table.
- **How removal works (defensible):** each removed keyword goes through the same path the table's delete already uses — Semrush / demand / competitor-gap keywords are *blocked* (hidden) and uploaded/custom keywords are hard-deleted. The canonical keyword pool stays the single source of truth (Const II.7); the tree is a view, so removing members makes the node disappear and re-rolls-up every volume arithmetically. No taxonomy data is hand-edited at a read site. After a delete, dependent panels refresh once.

**Defensibility.** No numbers invented or modeled; deletes only remove real rows and recompute exact roll-ups (Const I.1/I.3). Membership is read from the canonical model, never re-derived (Const II.8). All delete UI uses existing theme tokens (no hex) — legible in both light and dark.

**Verified.** Isolated `tsc` on `KeywordsPanel.tsx` — clean. Dual-theme render check (Const V.5) — trash icons, the confirm strip, and chip-delete rendered legibly in both light and dark; every added token defined in both theme blocks, no hex literals. Full retained regression suite + new `kwdelete:` block (bulk delete blocks semrush/demand/gap and hard-deletes custom/csv; collectOwnKeywords gathers the full subtree; one refresh; confirm + chip delete present; theme-token-only) — **all PASS**.

**Action for Wayne:** deploy v7.271 — open the Keyword panel's Category Breakdown; hover a category or sub-category for the trash icon (confirms before deleting its keywords), or expand a leaf and click the × on a keyword chip to remove just that one.

## v7.271 — 2026-06-23 · Keyword panel — clearer Landscape Summary header, numbered steps, and a stronger journey selector

**The ask (Wayne).** Make the top of the Keyword panel orient the user: add a "Keyword Landscape Summary" title with a short explanation, make "Let's build the workflow" larger with context, label the four build cards as Step 1–4, and make the journey segmentation read as the next major area to choose.

**What changed (presentational only — no data, Const I.1).**
- **New "Keyword Landscape Summary" intro band** at the very top of the panel body: a titled header with a `ti-map-2` icon and a one-line explanation of what the view is and how to read it.
- **Enlarged "Let's build the workflow"** — the old tiny uppercase label is now a 16px sentence-case heading with a one-line context sentence (base → competitors → product demand → pre-product demand · each step unlocks the next). The "N actions needed" chip and the Min-volume control keep their places.
- **"Step N" labels** on each build card — the bare number badge now reads "Step 1"…"Step 4", making the sequence explicit.
- **Journey strip reframed as "Explore by journey"** — a 15px heading + a "Select a view" cue + a one-line instruction sit above the existing All / Product / Pre-product toggle, so it reads as the next major selection area. The toggle behavior is unchanged.

**Defensibility.** Pure copy/markup and styling; no numbers, data flow, taxonomy, brand guard, or selection logic touched. All colors use existing theme tokens (no hex), so light/dark parity is automatic.

**Verified.** Isolated `tsc` on `KeywordsPanel.tsx` — clean. Dual-theme render check (Const V.5) — rendered in both light and dark; every added token defined in both theme blocks, no hex literals. Full retained regression suite + new `kwheader:` block (summary intro, enlarged title, Step-N labels, journey selector, theme-token-only) — **all PASS**.

**Action for Wayne:** deploy v7.270 — open the Keyword panel; the header now leads with the Landscape Summary, the four steps are numbered, and "Explore by journey" stands out as the next thing to pick.

## v7.270 — 2026-06-23 · Scope becomes a six-workstream spec sheet with a multi-year plan

**The ask (Wayne).** The Scope panel should aggregate everything pushed in from the other panels — not just content, but LLM prompts, themes, authority, technical and citations — organised by workstream and priority bucket, and able to show a multi-year plan/approach.

**What changed (this release = the aggregation shell; content fully working, the other five ready to wire).**
- **Six workstreams.** The Scope panel now opens on a workstream selector — Content, LLM Prompts, Themes, Authority, Technical, Citations — each a card with its scoped count and demand. Content is fully live; the other five show a "ready to wire" state and light up the moment their source panel ships an *Add to Scope* control.
- **Multi-year plan (roadmap) view.** A new "Multi-year plan" toggle lays the scoped content onto a 3-year, quarter-by-quarter roadmap. The horizon is **auto-derived from priority** (your choice): P0 → Year 1, P1 → Year 2, P2 → Year 3+, then sequenced into quarters by quick-win, distance to conversion, then demand. It's clearly labelled a *suggested schedule* (a derived view, not a measured metric, Const I.5a) — reshape it by changing priorities on the Content Plan. The "Spec sheet" view (priority buckets, removable rows) is unchanged.
- **Backend is purely additive.** Content keeps its own `scope_selections` column and its scope ⊆ plan two-way sync **byte-for-byte unchanged**. The other five workstreams persist into a new namespaced `scope_workstreams` map (ids only, re-derived from each source — Const II.7). New columns auto-migrate at runtime (`ADD COLUMN IF NOT EXISTS`) and are ensured in the project-list route too (the v7.268 dashboard-crash lesson).

**Defensibility (Const II.7 / I.3).** Still ids only — no brief data copied. Roadmap volumes are exact roll-ups of the same scoped topics (Year-band demand reconciles to p0/p1/p2 volume — no double-count).

**Verified.** Isolated `tsc` on ScopeSection — **0 errors**. All three backend files parse. Real-scale render of the roadmap + pending state in **both themes** — no hex literals, every emitted color token defined in both light and dark (Const IV.6 / V.5). Full retained regression suite + new `scope270:` / `roadmap270:` blocks — **all 126 checks PASS, 0 FAIL** (every prior-release scope/sync/no-hex check still green).

**Action for Wayne:** deploy v7.270 — open Executive Summary → Scope, switch between **Spec sheet** and **Multi-year plan**, and click through the six workstream cards.



## v7.269 — 2026-06-23 · Scope now two-way synced with the plan (deselect in Scope unchecks everywhere)

**The ask (Wayne).** Deselecting a topic in the Scope panel didn't deselect it in the other connected views (Content Plan, Content Map, Journey list, Journey mind-map).

**Why.** Those four views share one selection set (`content_plan_selections`); Scope was a separate set (`scope_selections`), so removing from Scope only touched Scope. Per your call, Scope should be a curated **subset** of the plan, kept **two-way in sync**.

**What changed (server-side, so every view inherits it).**
- **`/scope` PUT** — any id removed from Scope is also removed from `content_plan_selections`, so the topic unchecks in the Content Plan, Content Map, and both Journey views. (Adding to Scope never changes the plan — scoped topics are already in it.)
- **`/content-plan` PUT** — `scope_selections` is pruned to stay within the plan, so deselecting a topic anywhere (Map / Plan / Journey) also drops it from Scope. Net effect: `scope ⊆ plan` is guaranteed from either direction, and no client view needed changing.
- **Content Plan panel** — when you remove a plan row, the "N in scope" badge updates immediately (the server already prunes it).

**Defensibility (Const II.7).** Still ids only — no brief data copied; both panels re-derive every topic from the canonical pool. The relationship is enforced as one server-side invariant rather than duplicated across clients.

**Verified.** Isolated `tsc` — clean. Both routes parse. Full retained regression suite + new `sync:` block (scope-removal cascades to the plan; plan-shrink prunes scope; adding to scope leaves the plan untouched) — **all PASS (105 checks)**.

**Action for Wayne:** deploy v7.269 — deselect a topic in View Scope and it now disappears from the Content Plan, Content Map, and Journey views too (and vice-versa).



## v7.268 — 2026-06-23 · Hotfix: blank project list after the v7.267 scope column

**The break (Wayne).** After v7.267, OrbitIQ bounced back to the Client Projects screen with **no projects listed**.

**Root cause.** v7.267 added `scope_selections` / `scope_selections_updated_at` to the `projects` schema. The project-list endpoint runs `db.select().from(projects)`, which selects **every** column declared in the schema. The build script is `next build` only — there is no `drizzle-kit push` — so new columns are created solely by the runtime `ALTER TABLE … ADD COLUMN IF NOT EXISTS` calls inside each route. The list route's `ensureColumns` had not been updated for the scope columns, so on a database that didn't yet have them the list query referenced a non-existent column and failed, which blanked the whole project list. (The same latent hazard had existed for earlier optional columns; they survived only because another route had already created them.)

**The fix.** `app/api/projects/route.ts` now ensures **every** runtime-migrated optional column (`brand_terms`, `excluded_brands`, `content_plan_selections`, `scope_selections`, and their `_updated_at` partners) before the list select — so the dashboard self-heals on first load. The project-detail route (`app/api/projects/[id]/route.ts`) also ensures the scope columns, covering a deep-link that hits a project before the dashboard runs. Every statement is `ADD COLUMN IF NOT EXISTS` — idempotent and safe. No data touched; the scope feature itself is unchanged from v7.267.

**Verified.** esbuild parse of both routes — OK. Full retained regression suite + new `projlist:` guard (list route ensures scope + content_plan columns; GET ensures before selecting) — **all PASS**.

**Action for Wayne:** deploy v7.268 — the project list returns on first load; no re-upload or manual DB change needed.



## v7.267 — 2026-06-23 · Content Plan → Scope: "Add to Scope" cart + a View Scope spec sheet

**The ask (Wayne).** On the Content Plan panel, add two primary CTA buttons. **"Add to Scope"** gathers all the content info for the existing and net-new assets into a running scope spec sheet — like a shopping cart. Under the Executive Summary, add a **"View Scope"** where everything added to scope appears. A second button, **"Push to Brief Agent,"** is a placeholder we'll wire up later.

**What changed.**
- **Content Plan panel (`components/brief/ContentPlanSection.tsx`).** Two primary CTAs now sit under the header once the plan has topics. **Add to Scope** unions *every* topic in the plan (both existing→optimise and net-new→build, regardless of the active card/priority filter) into the running scope cart and saves it; it shows an "Adding…" → "Added to scope ✓" state and a live "N in scope · this plan is fully scoped" status. **Push to Brief Agent** is present but not yet connected — clicking it shows a short "hand-off isn't connected yet — your scope is saved and ready for it" note.
- **New View Scope panel (`components/brief/ScopeSection.tsx`).** A new sub-nav item under **Executive Summary** (Executive summary · View scope). It shows everything in scope as a writer-ready spec sheet — the same summary cards, rows, and full briefs the Content Plan uses — with a × to drop a topic, a Refresh CTA, and a "Scope last updated …" timestamp.
- **Persistence (`/api/projects/[id]/scope`, `scope_selections` column).** Scope is a true running cart: saved on the project so it survives reloads, devices, and re-analysis. Auto-migrated at runtime (ADD COLUMN IF NOT EXISTS) — no manual db:push.

**One source of truth (Const II.7).** Scope stores **only** topic ids — never a copy of the brief data. The View Scope panel re-derives every topic and brief from the canonical pool (the same builder the Content Plan and Cluster panels use) and filters to the scoped ids, so volumes and briefs reconcile exactly. Nothing modeled; every figure still traces to a real Semrush row (Const I.1).

**Theme parity (Const IV.6 / V.5).** The two CTAs are filled buttons whose text token flips with the theme. Measured contrast: Add to Scope (indigo) = 4.63:1 dark / 12.70:1 light; Push to Brief Agent (purple) = 7.34:1 dark / 14.16:1 light — both clear 4.5:1 in **both** themes. Cyan/green/amber fills were tested and rejected because their light-mode tones drop the flipping text below 2.5:1.

**Verified (own debugging agent, real compiled code).** Isolated `tsc` — **clean**. jsdom render harness (both themes) — **all PASS**: View Scope spec sheet renders scoped existing + net-new topics with the remove control; both CTAs render with the theme-safe filled tokens; both panels mount without throwing. Full retained regression suite + 8 new v7.267 scope invariants (ids-only persistence, re-derived view, single scroll container, CTA contrast tokens, no hex literals) — **all PASS**.

**Action for Wayne:** deploy v7.267. On the Content Plan, click **Add to Scope** to gather the plan into your scope cart, then open **Executive Summary → View scope** to see the running spec sheet. (Push to Brief Agent is staged for a later release.)



## v7.266 — 2026-06-23 · Journey list view: same checkboxes that push topics into the Content Plan

**The ask (Wayne).** Add the same checkboxes and behavior to the **list view** of the Journey panel that the mind-map already has — checking a topic pushes those topics into the Content Plan, with a way to deselect, and checking a parent selects every child under it.

**What changed (`components/brief/JourneySection.tsx`).** The Journey **list view** (the collapsible, category-grouped "Topic Journeys — every cluster") now carries a Content-Plan checkbox at three levels: every **topic** row, every **category** header, and every **journey lane** (Product / Pre-product). Checking a topic adds just that topic; checking a **category or lane checks its whole branch** — every topic under it — and a partly-selected parent shows an indeterminate dash. A header chip shows "N topics in Content Plan" with a Clear button, plus a one-line instruction. Clicking a category still expands/collapses it — the checkbox sits beside the toggle, not inside it.

**One source of truth (Const II.7 / II.8).** The list view and the mind-map now share a single `useContentPlanSelection` hook that reads & writes the *same* persisted set the Content Map and Content Plan already use — `project.content_plan_selections`, keyed by `ContentTopic.id`, which on a canonical topic node *is* `r.t.id`. So a topic checked in the list is the exact same row the mind-map ticks, the Content Map shows, and the Content Plan lists — no parallel copy, no lexical re-derivation; the parent→child cascade reads the stored taxonomy rows the list draws. The mind-map's previous inline copy of this logic was factored into the shared hook (one source, not two).

**Verified (own debugging agent, real compiled code).** Isolated `tsc` (iso266) — **clean**. Full retained regression suite (now incl. a new Journey-list-view checkbox guard) — **all PASS**. jsdom client-render harness — **all PASS**: a checkbox on every lane (2) + category (2); expanding a category reveals topic checkboxes; clicking a topic box fires a PUT whose `selections` carry that topic's id (push to Content Plan); the summary chip renders; theme parity — zero hex literals, css-var tokens only (Const IV.6 / V.5). SSR re-render of the refactored mind-map confirms its checkboxes still render unchanged.

**Action for Wayne:** deploy v7.266. On the Journey panel's List view, tick a topic (or a whole category / lane) to push it into your Content Plan — exactly like the Mind-map view.



## v7.265 — 2026-06-22 · Journey map: select branches/topics straight into the Content Plan

**The ask (Wayne).** On the Journey mind-map, add a way to select a branch or element so the same topics get selected in the Content Map — and, because a Content-Map selection is already pushed to the Content Plan, into the Content Plan too. Include a way to deselect, and make checking a parent select every child under it.

**What changed (`components/brief/JourneySection.tsx`).** Every node on the Topic-Hierarchy mind-map (umbrella, category, topic) now carries a checkbox in its top-left corner. Clicking the box adds/removes that node from your Content Plan; clicking the node body still opens its keyword/volume detail (nothing existing changed). A topic checks itself; a **category or umbrella checks its whole branch** — every topic underneath it, including the ones hidden behind "+N more topics" — and a partly-selected parent shows an indeterminate dash. A header chip shows "N topics in Content Plan" with a Clear button.

**One source of truth (Const II.7 / II.8).** The journey checkbox writes to the *same* persisted set the Content Map and Content Plan already read — `project.content_plan_selections`, keyed by `ContentTopic.id`, which on a canonical topic node *is* `r.t.id`. So a topic checked on the journey is the exact same row the Content Map ticks and the Content Plan lists — no parallel copy, no lexical re-derivation; the parent→child cascade reads the stored taxonomy. Switching panels re-reads the set, so the three views stay in lockstep.

**Verified (own debugging agent, real compiled code).** Isolated `tsc` (iso265) — **clean**. Full retained regression suite (61 checks incl. a new Journey↔Plan id-reconcile guard) — **all PASS**. jsdom client-render harness — **all PASS**: checkbox on every umbrella/category/topic (none on "+N more"); category cascade selects all 10 topics including the 2 hidden; umbrella cascade selects all 12; single-topic selects only its id; deselect clears; theme parity — the rendered map uses only css-var tokens, zero hex literals (Const IV.6 / V.5).

**Action for Wayne:** deploy v7.265.


## v7.264 — 2026-06-22 · Content Map: clearer selection instruction above the topic list

**The ask (Wayne).** Add an instruction telling the user what the checkboxes do.

**What changed (`components/brief/ContentPlanSection.tsx` + `ContentMapSection.tsx`).** Added an instruction banner directly above the topic list on the Content Map — "Check a box to select which topics to include in your scope & content plan" — with a live "N selected" count. It shows only where the checkboxes are (the Content Map); the Content Plan panel doesn't get it. Removed the shorter, redundant hint that sat above the summary cards, so there's one clear instruction placed right where you tick the boxes.

**Verified (own debugging agent, real compiled code).** Isolated `tsc` (iso264) — **clean**. Full retained regression suite — **all PASS**. SSR render confirms the instruction (with the selected-count) renders on the Content Map and is absent on the Content Plan; cyan-tint banner uses theme tokens (Const IV.6).

**Action for Wayne:** deploy v7.264.


## v7.263 — 2026-06-22 · Content Map: remove the redundant "Detailed page & cluster mapping" section

**The ask (Wayne).** The Content Map stacked two views: the explorer (cards + tickable topic list, 704 topics) and an older "Detailed page & cluster mapping" block below it (stat cards counting 460 "article topics", plus Pages/Briefs/Table views). The two used different topic models, so the numbers didn't reconcile (704 vs 460) and the bottom block didn't respond to the top filter cards — when you clicked Net-new or Quick-wins (0 results up top) it still showed 460 / 23.5M/mo, reading like stale/old data. Remove it.

**What changed (`components/brief/ContentMapSection.tsx`).** Deleted the entire bottom section — the "Detailed page & cluster mapping" divider, the article-topic stat cards (Total Articles / Optimise / Build / Pages Mapped / Volume at Stake), the Pages/Briefs/Table view toggle, and the three table views. The Content Map is now just the summary cards + the tickable topic list (the explorer), which already drives the Content Plan. Also removed the now-dead per-render computations that fed that section (the article-topics and content-gaps memos), so ticking a checkbox no longer recomputes 460 article topics + gaps on every render — the list stays snappy. The page-map ("Map ranking pages") pull, the header, and the tick-to-plan flow are untouched. (~360 lines lighter.)

**Verified (own debugging agent, real compiled code).** Isolated `tsc` (iso263) — **clean**. Full retained regression suite — **all PASS**. SSR render of the panel — renders without throwing, title reads **Content Map**, and the old Detailed-page / Total-Articles / Build-Net-New section is gone. The explorer + checkbox path is unchanged (separately render-checked).

**Action for Wayne:** deploy v7.263. The Content Map is now a single clean view — cards + the tickable list; the confusing 460-count section is gone.


## v7.262 — 2026-06-22 · Fix: removing a topic from the Content Plan now sticks (stale-cache bug)

**The bug (Wayne).** Clicking × on a Content Plan row removed it from the plan, but going to the Content Map showed it still checked, and returning to the Content Plan made it reappear. The removal **was** saved to the project — but the selection **read** was being served from cache, so the next mount re-hydrated the old set and the topic looked selected again.

**The fix.** The content-plan selection endpoint and both panel reads are now always fresh:
- `app/api/projects/[id]/content-plan/route.ts` — `export const dynamic = 'force-dynamic'` + `revalidate = 0`, and GET/PUT responses send `Cache-Control: no-store` (the same guard the page-map route already uses).
- `ContentMapSection` and `ContentPlanSection` — the selection GET is fetched with `{ cache: 'no-store' }`.

Now: × removes the topic, the save persists, and on the next mount both panels read the **live** set — the Content Map checkbox is unticked and the row stays gone.

**Verified (own debugging agent, real compiled code).** Isolated `tsc` (iso262) — **clean**. Full retained regression suite — **all PASS**. SSR render unchanged (× still one-per-row, checkboxes intact). Route confirmed `force-dynamic` + `no-store`; both client reads confirmed `no-store`.

**Action for Wayne:** deploy v7.262, then re-test — tick on Content Map → appears in Content Plan; click × → gone, and the Content Map checkbox is freed.


## v7.261 — 2026-06-22 · Content Plan: × to remove a topic, and the source panel is now titled "Content Map"

**The ask (Wayne).** Three follow-ups on v7.260: (1) ticking a checkbox should push the topic into the Content Plan (kept — that is the behaviour); (2) the source panel header should read **Content Map**, not "Content Plan"; (3) in the Content Plan, add an **×** to remove a topic — which deselects it and frees its checkbox back on the Content Map.

**What changed.**
- **Title (`components/brief/ContentMapSection.tsx`).** The source panel header now reads **Content Map** (was "Content Plan"); it now matches the sub-nav label.
- **Remove from plan (`components/brief/ContentPlanSection.tsx`).** Each Content Plan row gains an **×** control on the left. Clicking it deselects the topic and persists the smaller set — the row leaves the plan immediately, and because the Content Map re-reads the saved selection when you switch back to it, that topic's checkbox is unticked and available again. A per-row spinner shows while the remove-save is in flight (Const IV.2); the row is restored if the save fails. The × renders only on the Content Plan and the checkbox only on the Content Map — neither control leaks into the other mode.
- **Behaviour unchanged.** Ticking a checkbox on the Content Map still pushes the topic into the Content Plan and persists to the project — that already worked in v7.260 and is retained.

**Verified (own debugging agent, real compiled code).** Isolated `tsc` (iso261) — **clean**. Full retained regression suite (new + every prior `contentplan:` and earlier check) — **all PASS**. SSR render — Content Plan rows render one × per row with tick/spinner states + aria-labels, Content Map keeps its checkboxes, neither control leaks into the other mode; theme tokens only (Const IV.6/V.5). Panels keep their single vertical scroller (IV.1).

**Action for Wayne:** deploy v7.261. Tick to add on the Content Map; open Content Plan and click × on any row to drop it (its Content Map checkbox frees up again).


## v7.260 — 2026-06-22 · Content Map → Content Plan: tick a topic to push it into your plan

**The ask (Wayne).** On the Content Map, add a checkbox to the left of each topic. Ticking a topic pushes it into the **Content Plan** panel — which should now be a **blank panel** that fills only with the topics you pick. Selections persist (saved to the project), and the Content Plan shows **only** the picked topics.

**What changed.**
- **Content Map (`components/brief/ContentPlanSection.tsx` `ContentExplorer`, used by `ContentMapSection.tsx`).** Each topic row in the Content Map now carries a selection checkbox on the left (shown **only** in the Content Map instance — the destination `mode="plan"` has none). Ticking adds the topic to your plan; a per-row spinner shows while the save is in flight (Const IV.2), and the box reverts if the save fails (never a claimed-but-unsaved pick). A one-line hint above the list and a live "N selected" count make it discoverable.
- **Content Plan (destination, `ContentPlanSection`).** Now shows **only** the hand-picked topics — a view filtered from the same canonical plan (Const II.7), with the scope cards recomputed through a new shared `scopeOf` so they reconcile **exactly** with the picked rows (Const I.3, no double-count). Blank until you pick: a clear "Your content plan is empty — tick topics on the Content Map" empty state.
- **Persistence (`db/schema.ts` + new `app/api/projects/[id]/content-plan/route.ts`).** New `content_plan_selections` (jsonb) on `projects`, auto-migrated at runtime via the existing `ADD COLUMN IF NOT EXISTS` pattern — **no manual db:push**. GET returns the saved ids; PUT replaces the set (de-duped, order preserved). Stored on the **project** so the plan survives reloads, devices, and re-analysis. Only topic **ids** are stored — never a copy of the topic data (Const II.7); unknown/stale ids (after a re-analysis) are silently ignored.
- **One rollup, no fork (`lib/journey/contentPlan.ts`).** Extracted the scope roll-up both plan builders already used into a single `scopeOf`, and added `filterPlanByIds` (selected subset → recomputed scope) — so the picked-plan cards and the full-plan cards share one definition.

**Verified (own debugging agent, real compiled code).** Isolated `tsc` (iso260) — **clean**. Full retained regression suite re-run (**new + every prior check**) — **all PASS**, including 7 new `contentplan:` invariants (filter-by-all reproduces the full plan; `scopeOf` reproduces the builder scope; selection keeps only picked rows in source order; picked scope = exact rollup; empty pick → blank plan; stale id ignored). SSR render check both modes — checkbox renders one-per-row with tick/spinner states, **plan mode has none**, colors are theme tokens with no raw white/#fff (Const IV.6/V.5). Panels keep their single vertical scroller (IV.1).

**Action for Wayne:** deploy v7.260. On the Content Map, tick the topics you want; open the Content Plan tab to see just those, as prioritised briefs. (The `content_plan_selections` column self-creates on first use — no db:push needed.)


## v7.259 — 2026-06-22 · Mind-map: full-width canvas, on-node status badge, keyword data moved below the map

**The ask (Wayne).** On the v7.258 Mind-map: remove the left legend panel and the right "click any node" empty-state panel; put a **small badge on each node showing existing-page vs new-build**; **move the keyword data below the map**; and **extend the map to the full width of the panel**.

**What changed (`components/brief/JourneySection.tsx`, Mind-map view).**
- **Removed** the left Levels/Topic-status legend column and the right empty-state panel.
- **On-node status badge** — each topic node now carries a small pill: green **EXISTING** (you rank / have a page — optimize) or red **BUILD** (net-new). The level row labels (Umbrella / Category / Topic) still identify the tiers, so the legend isn't needed. Node height bumped slightly to seat the badge alongside the title and volume.
- **Full-width canvas** — the map now spans the whole panel (no side columns), centered when narrower than the panel, scrollable when wider.
- **Keyword data moved below the map** — clicking any node opens the keyword panel **beneath** the canvas, full width, with the keywords laid out in a responsive multi-column grid (up to 60 shown, "+N more" beyond). Each keyword shows its real Semrush volume (Const I.1). The panel appears only after a node is clicked (no permanent empty box).

Pure layout/presentation change — same canonical data, same stored hierarchy, no data logic touched.

**Verified (own debugging agent, real compiled code).** Full retained regression suite — **all PASS**. Isolated `tsc` — **no real type errors** in the changed file. SSR-rendered both themes (`orbitiq-v7.259-RENDER.html`), **no React warnings**; geometry checked: canvas in-bounds, **zero** `NaN` paths, status badges render (EXISTING/BUILD), legend + empty-state confirmed gone. Valid theme tokens throughout → parity (IV.6/V.5) holds; panel keeps its single vertical scroller (IV.1).

**Action for Wayne:** deploy v7.259. The map fills the panel; each topic shows an EXISTING/BUILD badge; click a node and the keywords appear below the map.


## v7.258 — 2026-06-22 · Mind-map = umbrella → category → topic hierarchy, click any node for its keywords + volume (Wayne's Option 3) 2026-06-22 · Mind-map = umbrella → category → topic hierarchy, click any node for its keywords + volume (Wayne's Option 3)

**The ask (Wayne).** Two problems with the v7.257 explorer: (1) the node titles were unreadable, and (2) it focused one category laid out by funnel stage, so it "looked like it's selecting individual topics" rather than showing a **full branch from the parent category all the way down**. After comparing three depth options, Wayne picked **Option 3 — Umbrella → Category → Topic** (top-down tree), and asked that **clicking a node show that node's keywords and volume**.

**Bug fixed — unreadable titles.** The v7.256/7.257 node text used color tokens that don't exist in the theme (`--c-e0e0f4`, `--c-0a0a1e`, `--c-c0c0dc`, …), so the title text fell back to black on a dark canvas. All node/detail text now uses **valid tokens** (`--c-e0e0f8`, `--c-08081a`, `--c-d8d8f0`, the stage/level palette), legible in both themes. (The dual-theme render check now also greps for unknown `var(--c-…)` tokens so this can't recur.)

**Rebuilt (`components/brief/JourneySection.tsx`).** The Mind-map view is now a **top-down hierarchy tree** read straight from the stored taxonomy (Const III.1b / II.8 — umbrella = `path[0]`, never re-derived):
- **Umbrella → Category → Topic**, three rows top→bottom with level labels down the left gutter (amber umbrella → purple category → cyan topic, matching the approved preview). Topic nodes carry a green/red status spine (existing/optimize vs. net-new/build).
- **Click any node → keywords + real volume.** The right-hand detail panel lists that node's keywords with their real Semrush volume (Const I.1). A topic shows its own keywords; a category aggregates its topics' keywords; the umbrella aggregates the whole branch (deduped, max real volume — no double counting, Const I.3).
- **"Branch for" picker** chooses which umbrella's full branch is on the canvas (default = highest-volume). Journey-scope pills (All / Product / Pre-product) still apply.
- **Scale-safe.** Only the focused umbrella's branch is drawn; large categories show their top 8 topics with a **"+N more topics"** node that expands on click (count always shown; nothing capped — Const I.6). Computed deterministic layout (no DOM measurement). Canvas scrolls in its own box; the panel keeps its single vertical scroller (Const IV.1).

No funnel edges or modeled weights — this is the stored parent→child hierarchy, and all volumes are real Semrush (Const I.1). The List view is unchanged.

**Verified (own debugging agent, real compiled code).** Full retained regression suite re-run — **all PASS**. Isolated `tsc` — **no real type errors** in the changed file. SSR-rendered in **both light and dark** (`orbitiq-v7.258-RENDER.html`), **no React warnings**; checked geometry: canvas in-bounds, **zero** `NaN` paths, no `undefined`, all three level labels + node titles render. Uses only valid theme tokens → parity (IV.6/V.5) holds.

**Action for Wayne:** deploy v7.258. Journey panel → **View → Mind-map** → **Branch for** picks the umbrella; click any node to see its keywords and volume.


## v7.257 — 2026-06-22 · Mind-map view redesigned as a node-link "Content Topic Explorer" (matches Wayne's reference) 2026-06-22 · Mind-map view redesigned as a node-link "Content Topic Explorer" (matches Wayne's reference)

**The ask (Wayne).** After v7.256 shipped the Mind-map as boxed stage-columns, Wayne shared two reference visuals — a classic radial mind map and, more precisely, a **"User Journey Map – Content Topic Explorer"**: a node-link graph where each topic is a pill, the funnel runs top→bottom (trigger → problem → category discovery → product evaluation → usage → advanced), connections are typed and colored (Next step / Compare / Broader), a legend sits on the left, and a detail panel describes the selected node. "I was looking at visuals more like this."

**What changed (`components/brief/JourneySection.tsx`).** Replaced the v7.256 boxed-column layout inside the Mind-map view with a true **node-link graph**, rendered as SVG:
- **Funnel rows top→bottom** — a root *entry* node for the focused category, then one row per stage (Category Discovery = Awareness, Product Evaluation = Consideration, Usage & Decision, Advanced / Retention), with the row labels down the left gutter (mirrors the reference).
- **Topic nodes** are colored pills (by stage), each with a status spine (green = existing/optimize, red = net-new/build) and its real volume.
- **Typed, colored connections** — green **Next step** (most likely), purple **Compare / alternative** (same-stage siblings), gray dashed **Broader / intro** (entry → first stage), with arrowheads — plus a left legend explaining each.
- **Focused, scale-safe** — a category picker drives which category's journey is on the canvas (default = highest-volume), so the graph stays a readable ~10-node neighborhood instead of thousands of nodes. Layout positions are **computed deterministically** (no DOM measurement — the fragility that broke earlier maps). The canvas scrolls inside its own box; the panel keeps its single vertical scroller (Const IV.1).
- **Click a node** → it highlights its incident connections (others dim), labels the next-step edges with the real volume, and the detail panel shows Next step / Compare / Leads-here, each ranked by real volume.

**Data integrity (unchanged from v7.256, Wayne's standing call).** The reference images show `probability_score` numbers on edges. Those have no real source row, so per Const I.1 and Wayne's rule **none are invented** — connection thickness and ranking come from **real Semrush search volume**, and the legend states it ("No modeled probabilities — only measured demand"). Both views read the same canonical topics (Const II.7).

**Verified (own debugging agent, real compiled code).** Full retained regression suite re-run — **all PASS** (the `journey:`/`preproduct:` blocks compile the edited file). Isolated `tsc` — **no real type errors** in the changed file. SSR-rendered the explorer in **both light and dark** (`orbitiq-v7.257-RENDER.html`); checked the computed SVG geometry: canvas 724×599, all nodes in-bounds, **zero** `NaN` paths, no `undefined`. Uses only existing theme tokens, so parity (IV.6/V.5) holds. List view and all prior behavior unchanged.

**Action for Wayne:** deploy v7.257. Journey panel → **View → Mind-map**, then use **Journey for** to pick a category and click any node to trace its path.


## v7.256 — 2026-06-22 · Journey panel gains a Mind-map view (behavioral knowledge graph) alongside the List view 2026-06-22 · Journey panel gains a Mind-map view (behavioral knowledge graph) alongside the List view

**The ask (Wayne).** The Journey panel's list view is good for a hierarchical read of the journey. Add a second presentation — a **Mind-map view** — modeled on a behavioral user-journey knowledge graph: each topic is a node, connected to the most likely *next step* in the user's journey, so it reads like how a person explores a topic, not how a site is organized. Keep the current list as one option and add the mind-map as the other. (Earlier flat-map visuals had been removed; this is a fresh, scale-safe one.)

**What shipped (`components/brief/JourneySection.tsx`).** A `View` toggle (**List ⇄ Mind-map**) now sits at the top of the canonical Journey view; List is the current collapsible content plan, Mind-map is new. Both render from the **same canonical cluster topics** — the single source of truth (Const II.7) — so counts reconcile exactly with the list and the Cluster panel.

The Mind-map is a **behavioral journey graph**, laid out as the funnel spine: for each lane (Pre-product · problem-aware, Product · solution-aware) the stages run left → right with progression arrows — **Awareness → Consideration → Decision → Retention** ("what users learn first → what they compare → what they decide"). Within each stage, topics group by category (collapsible). Clicking a topic node traces its journey within its category:
- **Next step** — the most likely next topic (same category, next funnel stage),
- **Compare** — sibling topics at the same stage (alternatives the user weighs),
- **Leads here** — the topic that most likely preceded it (previous stage).

**Data integrity (Wayne's call, this session).** The reference prompt asked every connection to carry a `probability_score`. Those numbers have no real source row, so — per Const I.1 and Wayne's standing rule — **no modeled probability is shown**. Instead, every node and every connection is **weighted and ranked by real Semrush search volume** (traceable to the canonical pool), and the legend says so explicitly. Connections are journey-stage structure, not invented likelihoods.

**Scale-safe by construction (durable constraint).** The prior flat maps stacked every node of a stage in one column — thousands of nodes → an unusable ~130k-px SVG. This view never renders flat: categories are collapsed by default and topics render only when a category is expanded; each stage column shows its top categories with a "+ N more categories" progressive-disclosure control (the count is always shown; nothing is capped — Const I.6). Horizontal overflow scrolls inside the map; the panel keeps its single vertical scroller (Const IV.1).

**Verified (own debugging agent, real compiled code).** Full retained regression suite re-run against the real compiled code at real scale — **all PASS** (the `journey:` and `preproduct:` blocks import from the edited `JourneySection`, confirming it compiles and its exports are intact). Isolated `tsc` shows **no real type errors** in the changed file. SSR-rendered the new view in **both light and dark** themes (`orbitiq-v7.256-RENDER.html`): all stage labels, relationship types, scope pills, and the volume-weighting note render; no `undefined`/`NaN`. The view uses only existing theme tokens (`var(--c-*)`), which are remapped for light mode, so theme parity (IV.6/V.5) holds by construction. List view, all prior behavior, and panel scroll unchanged.

**Action for Wayne:** deploy v7.256. Open the Journey panel and use the **View** toggle (top of the journey) to switch between **List** and **Mind-map**.


## v7.255 — 2026-06-22 · The suggested article title now carries the highest-volume target keyword (Const III.8)

**The ask (Wayne).** A Content-plan card was titled **"Stock Investing"** while its top target keyword was **"how to invest in stocks" (673K)** — the suggested title dropped the highest-volume head term for a generic paraphrase of the cluster name. The title should always contain the highest-volume matching keyword. Codified first as **Constitution Art. III.8** (amendment v0.13, 2026-06-22), then implemented here.

**Root cause.** All three article-title builders titled from the *cluster name*, never the keywords:
- `buildContentPlanFromTopics` (the Content-plan drawer — the panel Wayne screenshotted) set `title: cap(t.product)`.
- the graph-path `briefTitle(n)` used domain-flavored name templates.
- `deriveArticleTitle` in `ContentMapSection` templated off `cluster.name` + stage.

The keyword list shown under "Target keywords" was already sorted by real Semrush volume, but the title ignored it.

**Fix (`lib/journey/contentPlan.ts` + `components/brief/ContentMapSection.tsx`).** Added one shared, exported helper `briefTitleFromKeywords(product, keywords)` (single source of truth — both files call it):
- picks the **highest real-volume** keyword (Const I.1/I.2; volume traces to the canonical pool),
- ties break to the **more specific / longer** commercially-useful term (Const III.6), then alphabetically for determinism,
- renders it in **natural title case** ("how to invest in stocks" → "How to Invest in Stocks"), preserving already-styled tokens (APR, VA, 0%),
- falls back to the product noun **only** when the piece has zero keywords (honest gap, Const I.5).
Wired into all three sites; the old name-based templates remain solely as the no-keyword fallback. No data is invented — the title is a real target keyword verbatim.

**Verified (own debugging agent, real compiled code).** Added a `title:` block to the retained regression suite (Const V.6) and re-ran the FULL suite: **79/79 PASS, 0 FAIL** — the new III.8 checks plus every prior-release check. The new checks assert the title contains "how to invest in stocks", equals "How to Invest in Stocks", is **not** "Stock Investing", a volume tie resolves to the more specific term, and the no-keyword case falls back to the product noun. Full-project `tsc --strict` (project tsconfig) = **0 errors**. SSR-rendered `ContentExplorer` in **both light and dark** themes — renders OK, computed title = "How to Invest in Stocks". Logic-only change: no color/border/contrast touched, so theme parity (IV.6/V.5) is unaffected; scroll (IV.1) untouched.

**Action for Wayne:** deploy v7.255. Suggested article titles across the Content Plan and Content Map now lead with the highest-volume keyword for each piece. No re-upload needed.


## v7.254 — 2026-06-21 · The URL was reaching the DB but buildKwPool discarded it — backfill the uploaded ranking URL (verified against the real TD CSV)

**The ask (Wayne).** After v7.253 (and v7.251 before it), deploy + clear + re-upload STILL showed "no URL in the dataset" on existing pages. Three releases, no visible change. Wayne — rightly — asked me to do my own quality checks against his real data before shipping again.

**Ground truth established this time (no guessing, Const I.1).** Using Wayne's actual client CSV (`td-4400-more.csv`, header `Keyword,Position,…,URL,…`) and his live deployment:
- The v7.253 parser extracts a URL for **5,461 / 5,461** rows — parser is correct.
- The deployed `/api/projects/.../keywords` response has **zero** `"url":null` and real `https://…` values — the URL **is** persisted in the database.
- So the loss was downstream. Reproduced it in the **real** `buildKwPool`: with a URL-less `semrushSnapshot.topKeywords` present (which a "Run Analysis" creates), **all 1,429** client keywords come back URL-less; CSV-only (no topKeywords) keeps all 1,429. That is the bug.

**Root cause (the real one, at last).** `buildKwPool` adds §1 `topKeywords` first (recording each keyword in `seen`), then §2 the uploaded CSV rows. Semrush `topKeywords` rows usually arrive **without** a URL, and §2 did `if (seen.has(kw)) continue` — so for every keyword already present from §1, the uploaded row carrying the **real URL was skipped entirely**. The URL was in the DB and on the uploaded row, but the pool builder threw it away before `Topic.pageUrl` could read it. This is why both prior parser fixes (which correctly got the URL into the DB) produced no visible change.

**Fix (`lib/utils/kwVolume.ts`, 1 function).** §2 now **backfills**: when an uploaded client keyword is already in the pool from §1 but that entry has no URL, the uploaded CSV's real URL is written onto the existing entry. The uploaded CSV is the authoritative source of the client's ranking URL (Const I.1). It never invents a URL, never overwrites a URL `topKeywords` already supplied, and adds no new rows — the client keyword count is unchanged.

**Verified against the REAL CSV (own debugging agent).** Bundled the real compiled `buildKwPool` + the real `parseCsvText` and ran Wayne's file end-to-end — **6/6**: (A) CSV-only keeps all 1,429 URLs; (B) the failing case — URL-less `topKeywords` + uploaded — now backfills all 1,429 (`'td bank'` → `https://www.td.com/us/en/personal-banking`); (C) a real `topKeywords` URL is preserved, not overwritten; client-count integrity A===B (no duplicate rows); and the `Topic.pageUrl` derivation (`position!=null && url`) returns the URL. Isolated `tsc --strict` on the patched `kwVolume.ts` = **0 errors**. Pure pool-logic change: no rendered component, styling, scroll, or theme surface touched (IV.1/IV.6/V.5 N/A).

**Action for Wayne:** deploy v7.254. No re-upload needed — the URLs are already in your database; this release stops the pool builder from discarding them. Existing pages will show their real URL in the Content-plan drawer and the open-page icon on each row. (If anything still looks off, hard-refresh so the client re-fetches.)

## v7.253 — 2026-06-21 · The SECOND CSV parser — uploaded URL now survives the project-page upload (completes the v7.251 fix)

**The ask (Wayne).** After deploying v7.252, clearing keywords, and re-uploading a client CSV whose every row has a keyword **and** a URL (header `URL`), existing pages in the Content plan STILL showed "no URL in the dataset." Deploy + re-upload — the exact remedy v7.251 prescribed — did not help.

**Root cause (the real one).** There are **two** client-side CSV parsers. v7.251 wired the URL end-to-end through the *KeywordsPanel* parser, the batch API, the `project_keywords.url` column, `buildKwPool`, and every topic builder (`Topic.pageUrl` → `ContentTopic.url`). But the **primary upload flow** — the file picker on the project page (`handleFileUpload`) — uses a *different* parser, `parseCsvText` in `app/projects/[id]/page.tsx`, and that one was never updated. It returned only `{ keyword, searchVolume, position }` and never read a URL column, so the URL was dropped at the very first step and never reached the batch payload, the database, or anything downstream. No amount of re-uploading could populate a column the parser threw away before sending.

**Fix.** `parseCsvText` now detects the URL column and carries `url` on each parsed row, using the same header aliases as the KeywordsPanel parser — `url`, `ranking url`, `landing page`, `page`, `page url`, `address`, `current url`, `target url` — plus the Semrush raw code `Ur` (its `Ph`/`Nq`/`Po` siblings were already handled). The existing batch endpoint already accepts and stores per-row `url` (v7.251), so threading it onto the parsed object is all that was missing.

**Still honest when truly absent (Const I.1 / I.5).** No URL is invented. A blank URL cell or a CSV with no URL column yields `url: undefined`; that keyword stays unmapped and the drawer shows the honest "no URL in the dataset" note rather than a fabricated link.

**Verified (own debugging agent).** Isolated `tsc --strict` on the patched `parseCsvText` = **0 errors**. New retained `csvurl2:` functional harness against the REAL compiled function = **10/10**: header `URL` populates `url` on every row (Wayne's exact case, incl. a #84-ranked row), volume/position still parse, blank URL → `undefined`, no-URL-column → `undefined`, Semrush `Ph;Nq;Po;Ur` (semicolon) works, and the `Landing Page` + quoted-value variants resolve. End-to-end assertion replays the v7.252 batch-route persistence logic on the parsed rows and confirms the URL reaches the stored `project_keywords.url` value. Parser-only change: no rendered component, styling, scroll, or theme surface touched (IV.1/IV.6/V.5 N/A). Note: full-project `tsc` not run — the shipped folder carries no toolchain and the change is an isolated pure function with no new dependencies.

**Action for Wayne:** deploy v7.253, then **re-upload your client CSV** (clear first is fine). Rows are re-inserted with the URL parsed from the `URL` column; existing pages will then show their real URL in the Content-plan drawer and the open-page icon on each row.

## v7.252 — 2026-06-19 · Read-only provenance strip — trace the "All Keywords" count to its real sources

**The ask (Wayne).** The "All Keywords" count read ~1,346 and is now 5,796 with no upload and nothing run — "where did all the new keywords come from? We cannot be adding data."

**What I verified first (no code shipped for this part).** I diffed every count-relevant function — `buildKwPool` and the KeywordsPanel `summaryRows` / `kwSummary` / `buildRows` — across v7.244 → v7.251. They are **byte-identical except for the v7.251 URL field**. The keyword count math has not changed, there is **no auto-enrichment** (the only keyword-pulling calls, `/analyze` and `/demand-universe`, fire from explicit buttons, never on load/upload), and the pool **dedupes by keyword** (duplicate rows can't inflate the headline). So nothing in recent releases adds keywords; the count reflects the distinct keywords actually stored in the project.

**What this release adds (read-only — adds no data).** A **provenance strip** under the summary cards that partitions the All Keywords count by its REAL source so the number is fully traceable (Const I.2): **your CSV upload · Semrush crawl (topKeywords, only populated by "Run Analysis") · missing demand · competitor gap**, plus **"N distinct of M uploaded rows"** which surfaces any duplicate keyword rows. Each pool row lands in exactly one bucket (no double counting, I.3) and the buckets sum to the headline. The partition is a new pure lib `lib/utils/keywordProvenance.ts` (so it is unit-tested against the real compiled code). It reads existing data only — it writes nothing and changes no count.

**How it resolves your question.** Open the Keyword panel and read the strip: it tells you exactly where the 5,796 come from. If it reads "5,796 your CSV", the footprint table genuinely holds that many distinct keywords (a larger CSV / more than one upload over time) — not data we invented. If "Semrush crawl" or "missing demand" is non-zero, a Run Analysis or a journey build populated them. Either way the source is now visible rather than hidden behind one "client" label.

**Verified.** Isolated `tsc` = **0 errors** (KeywordsPanel, ThemeClustersPanel, ContentPlanSection, contentPlan, graph, kwVolume, keywordProvenance). New retained `provenance:` invariants — correct upload/crawl/demand/gap attribution, buckets sum to total (I.3), duplicate + blocked rows surfaced. **Full retained suite PASS (73 checks, 0 fail).** Strip uses CSS-var tokens only → theme parity (IV.6) holds.

**Action for Wayne:** deploy v7.252 and read the provenance strip on the Keyword panel. Tell me what the split says and I'll resolve it from there (e.g. if "missing demand" is folded in, I'll pull it out of the client headline per Const I.4; if it's all CSV, we confirm the upload history).

## v7.251 — 2026-06-19 · Persist the uploaded CSV's ranking URL (the real fix behind "no URL in the dataset")

**The ask (Wayne).** A ranked page still showed "no URL in the dataset" even though the uploaded CSV has a keyword **and** a ranking URL for every row — and that CSV is the only data in the project, so a URL should exist.

**Root cause (the real one).** v7.250 only resolved URLs from `topKeywords` and the page-map scan — neither exists in a CSV-only project. The uploaded CSV's **URL column was being dropped at every layer**: the CSV parser never looked for a URL column, the upload API never accepted it, and the `project_keywords` table had no `url` column. So the URL never made it into the system at all.

**What changed (end-to-end, real data only — Const I.1).**
- **Schema + auto-migration.** `project_keywords` gains a `url` column; both `ensureTable()` paths `ALTER TABLE … ADD COLUMN IF NOT EXISTS url TEXT` (same idempotent pattern as `domain`/`serp_features`), so it appears on deploy with no manual migration.
- **CSV parser detects the URL column.** The upload parser now recognizes `URL` (Semrush Positions export) plus common variants (`ranking url`, `landing page`, `page url`, `address`, `current url`, `target url`), reads it per row, and sends it in the batch payload.
- **API persists it.** The batch endpoint and the single-keyword POST both accept and store the per-row `url` (trimmed, capped). `GET` already returns all columns.
- **Threaded to the topic.** `buildKwPool` carries `url` on each client pool item (§1 footprint, §2 uploaded); `ThemeClustersPanel` maps `KwItem.url = item.url ?? snapshot-lookup`, so the uploaded URL flows into `Topic.pageUrl` → `ContentTopic.url` → the drawer's "Mapped page" block and the row's open-page icon. The page-map/topKeywords sources from v7.250 remain as fallbacks.

**Still honest when truly absent (Const I.5).** No URL is invented. If a CSV has no URL column (or a row is blank), that keyword stays unmapped and the drawer shows the honest "no URL in the dataset" note rather than a fabricated link.

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` = **0 errors** (ContentPlanSection, ThemeClustersPanel, contentPlan, graph, kwVolume); server files (schema + both routes) syntax-checked via esbuild. New retained `csvurl:` invariant — in a CSV-only project (no topKeywords, no page-map) the uploaded ranking URL reaches `topic.pageUrl`, and no URLs are invented. **Full retained suite PASS (66 checks, 0 fail).** SSR render confirms the row open-page anchor renders with var-token-only styling (theme parity V.5/IV.6). 

**Action for Wayne (important):** deploy v7.251, then **re-upload your client CSV**. Existing rows were saved before the `url` column existed (so their URL is still blank); the re-upload (UPSERT) fills the URL for every row, after which existing pages show their real URL in the drawer and the open-page icon on each row.

## v7.250 — 2026-06-19 · Content panel: existing pages now map their real URL — full URL in the detail drawer + open-page icon on each row

**The ask (Wayne).** For existing (ranked) pages there should be a mapped URL. Show the full URL in the detail drawer, and add an inline open-page icon on the summary-table row.

**Root cause.** A topic that clearly ranks (e.g. "High Yield Savings" at #14) was showing as **Net-new build** with no URL. The cluster builder only resolved a keyword's page URL from `topKeywords[].url`, and many of those Semrush rows arrive with an **empty URL** — so the ranked keyword mapped to no page and the existing page looked net-new.

**What changed (real data only, Const I.1).**
- **URL resolution now also reads the page-map scan.** `buildThemeClusters` builds `urlByKeyword` from `topKeywords[].url` **and** from `semrushSnapshot._pageMap.pages[]` (the `url_organic` scan: each real client page → the keywords it ranks for). `topKeywords` URL wins when present; the page-map fills the gaps. No URL is ever invented — a keyword with no real page stays unmapped (honest gap, Const I.5), so an existing page with no URL in the dataset says so and points to the Page Map scan rather than mislabeling as net-new.
- **Detail drawer shows the full mapped URL.** A new **"Mapped page"** block at the top of the drawer renders the complete, clickable URL (opens in a new tab) for existing pages. The bottom CTA is now **state-aware**: existing pages read "Optimise existing page" (linked when a URL exists), only true net-new topics read "Net-new build".
- **Inline open-page icon on the row.** Each summary-table row with a mapped URL gets an external-link icon next to the topic name that opens the live page in a new tab; clicking it does **not** open the detail drawer (`stopPropagation`).

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` = **0 errors** (ContentPlanSection, ThemeClustersPanel, contentPlan, graph). New retained `contenturl:` invariants — a ranked keyword with an empty `topKeywords` URL resolves its page from `_pageMap` (Const I.1); no invented URLs appear. **Full retained suite PASS (64 checks, 0 fail).** SSR render harness confirms the row open-page anchor + external-link icon render only on mapped rows (unmapped existing + net-new carry none) and **CSS-var-token-only** styling → dual-theme parity (V.5/IV.6) holds. Panel still one working scroller (IV.1).

**Action for Wayne:** deploy v7.250. Existing pages will show their URL (in the drawer and as a row icon) wherever the URL is in the dataset. If a ranked page shows "no URL in the dataset", run the **Page Map** scan for that project to pull the live URLs from Semrush.

## v7.249 — 2026-06-19 · Content panel: filter pages by where you rank on Google (Page 1 / 2 / 3 / 4+)

**The ask (Wayne).** On the Content panel, add a filter below the summary cards to see which pages are ranked on **page 1, page 2, page 3, or page 4+**.

**What changed.**
- **New "Where you rank" filter row** sits directly below the four summary cards (content mode only). It has pills for **All / Page 1 / Page 2 / Page 3 / Page 4+ / Unranked**, each with a live count, and composes with the existing card filter (All / Existing / Net-new / Quick wins). A **Clear filters** link appears in the toolbar when any filter is active.
- **Each topic now carries `bestPosition`** — the client's **best (lowest) real SERP position** across the topic's ranked keywords — shown as a `#<pos> · Page N` badge in the row. Pages map on the standard 10-results-per-page basis: 1–10 = Page 1, 11–20 = Page 2, 21–30 = Page 3, 31+ = Page 4+. Topics the client doesn't rank for yet (net-new / competitor-only) read **Unranked**.

**Data is real, not modeled (Const I.1).** `bestPosition` is an **exact rollup of real Semrush positions** — the minimum position over the topic's client-ranked **footprint** keywords (demand-origin keywords are excluded; nothing is modeled or estimated). When the client ranks for none, it is `null` → Unranked (honest gap, Const I.5). Computed in both plan builders (`buildContentPlanFromTopics` from `position`, `buildContentPlan` from `TopicKeyword.rank`).

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` = **0 errors** (ContentPlanSection, ThemeClustersPanel, contentPlan, graph). New retained `content:` invariants — bestPosition = MIN real footprint position; no-rank ⇒ null; page buckets map 1-10/11-20/21-30/31+; demand-origin keyword excluded from bestPosition. **Full retained suite PASS.** SSR render harness confirms the filter row, all five page buckets, the in-row rank badges, and **CSS-var-token-only** styling → dual-theme parity (V.5/IV.6) holds (rendered light + dark). Panel still resolves to one working vertical scroller (IV.1).

**Action for Wayne:** deploy v7.249. On the Content panel, use the **Where you rank** pills to filter topics by their Google SERP page; the count on each pill reflects the current card filter.

## v7.248 — 2026-06-19 · Pre-product journey corrected: deep-journey-only, no client products/services

**The ask (Wayne).** Two problems on the Audience Journeys pre-product lane: (1) it had topics even though the deep journey hadn't been built — "how can there be anything in pre-product when we haven't built them yet?"; and (2) it showed client **products/services** (Cashback Credit Cards, loans, checking) when pre-product should be **need states / life events / pain points / goals** with no mention of products or services (Const III.2a).

**Root cause (pre-existing, from the v7.203 design — not the v7.247 change).** The shared classifier (`buildJourneyClassifier`) only counted a keyword as "product" if the *distinctive word of its matched category appeared literally in the keyword*. Keywords filed under broadly-named parents ("Rewards", "Credit Reports & Scores", "Payment & Access") failed that literal test and fell into pre-product even though they clearly name a product. Separately, `buildPreProductClusters` peeled pre-product keywords out of the **existing footprint** on every render — so the lane filled with footprint keywords you already rank for (which is why 30 of 33 read "Existing"), independent of any deep-journey build.

**What changed (both per Wayne's decisions; Constitution amended v0.12).**
- **Pre-product = the deep-journey build only (Const III.2a-ii).** `buildPreProductClusters` now only considers deep-journey demand keywords (`origin: 'demand'`); footprint keywords never auto-create pre-product topics. Until you build the deep journey the lane is **empty** (honest gap), not back-filled.
- **Any product/service-category mapping is product (Const III.2a-i).** The shared `classify` now returns **product** for any keyword that maps to a product/service category — by stored membership (Const II.8) or the same name match the cluster builder uses — dropping the literal-substring sub-gate that caused the leak. So "cashback credit cards", "checking account", "personal loan rates" are product, never pre-product. The `ContentMapSection` fork was brought to parity so the Content Map splits the same way.

**Effect.** The change lives in the single-source classifier, so the Keyword, Cluster, and Journey panels all agree. Pre-product now contains only genuine problem/need/trigger demand from the deep-journey build (e.g. "how to stop living paycheck to paycheck", "build an emergency fund"); every client product/service sits in the product lane.

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` = **0 errors** across JourneySection, ThemeClustersPanel, ContentMapSection, KeywordsPanel. New retained `preproduct:` invariants — product-category keyword under a broad parent ⇒ product; genuine problem keyword ⇒ pre-product; pre-product topics are all `origin=demand`; footprint problem keyword is never pre-product; product keyword is never pre-product. **Full retained suite PASS (58 checks, 0 fail).** Real-pipeline SSR render (buildCanonicalClusterTopics → panel) confirms the 4 product terms route to the product lane and the 3 deep-journey need-states are the only pre-product topics; rendered light + dark (no styling change this release).

**Action for Wayne:** deploy v7.248. The pre-product lane will be empty until you build the deep journey; once built it shows only problem/need/trigger topics, never product names.

## v7.247 — 2026-06-19 · Journey panel: per-segment slicing restored + Product/Pre-product journey filter

**The ask (Wayne).** Two things on the Audience Journeys panel. (1) **Regression:** clicking an audience segment used to re-slice the summary cards and the topic list to just that persona — it stopped doing that. (2) **New:** add the same **Product journey / Pre-product journey** filter the Theme-Clusters panel has.

**Why it regressed.** When the canonical clusters became the journey's single source of truth (v7.221), the panel's default render switched to `CanonicalJourneyView`, which was passed the **full** topic list and never received the active segment — so the persona pills changed the highlight but not the data. (Demand-mode still filtered via the v7.170 partition; the new default path simply wasn't wired to it.)

**What changed.**
- **Per-segment slice restored (canonical mode).** Each canonical cluster topic is now attributed to exactly **one** persona bucket — a segment, or **Shared / all personas** — using the *same* exclusive audience-language word-overlap mechanism the demand journey has used since v7.170 (factored into a shared `bucketForText`). Selecting a persona filters the topics passed to the view, so the **summary cards (Topics in journey / optimize / build / coverage) and the topic list both re-slice** to that persona; the slices **partition** the combined total (segments + Shared = all). A "Shared / all personas" pill now also appears in canonical mode, and the active persona is labeled on the content-plan header. No persona match (or a tie) → Shared, so a topic is **never silently dropped**.
- **Journey scope filter added.** The same **All journeys / Product journey / Pre-product journey** segmented control from the Theme-Clusters panel now sits below the summary cards; choosing a scope re-slices the cards and the grouped topic list (product = solution-aware full funnel; pre-product = problem/trigger, awareness-only — the single source-of-truth split, Const III.2a). It composes with the persona filter.

**Attribution is honest, not modeled (Const I.1 / I.5).** The persona bucket is decided by **real word overlap** between a topic's own language (its category, product label, and keyword text) and each persona's stated language — never a modeled or invented split. Every volume/keyword still traces to its real source row; only the persona grouping is computed, exactly as in v7.170.

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` = **0 errors**. SSR render harness confirms: the per-segment partition sums to the total, each persona earns a real non-empty slice, no-match topics fall to Shared, the All/Product/Pre-product control + Shared tab render, and the panel uses **CSS-var tokens only** → dual-theme parity (V.5/IV.6) holds (rendered in both light + dark). **Full retained regression suite PASS** — all prior checks (v7.235–246) plus the new journey-partition invariants (one bucket per topic, slices partition the total, language-match attribution, Shared fallback, empty-segments-safe).

**Action for Wayne:** deploy v7.247. On the Audience Journeys panel, click a persona to see its slice (cards + list update, with a chip showing whose slice it is), and use the **Journey** control to switch between All / Product / Pre-product.

## v7.246 — 2026-06-19 · Competitor Share of Voice — slices added to the donut, auto-updating as competitor data loads

**The ask (Wayne).** As competitors are added, their Share of Voice should also be calculated and added to the donut; the graphs and donut should update accordingly when competitor data is loaded.

**What changed.** `computeSov` now computes a **page-1 capture slice per competitor** on the **same footprint and the same denominator** as the client: a competitor's slice = `Σ(footprint-keyword volume × CTR at the competitor's ranking position, pos ≤ 10)` over the keywords it shares with the client footprint. The donut (both the Google-Rank panel and the Executive Summary, which share `computeSov`) now renders **client + each competitor + open/uncaptured**, with a "Competitors (page-1 capture)" legend group. Because the brief reads competitor keyword rows from the live `dbKeywords` fetch (refetched on `kwVersion`), **the donut updates automatically** as competitor CSVs (with positions) are uploaded.

**Stable denominator (design choice, stated to Wayne).** The denominator stays "all page-1 clicks available across **your** footprint", so **the client's own SoV % does not move when a competitor is added** — a competitor's slice eats into the "open / uncaptured" wedge instead. This keeps the client number stable and reconciling with the header (Const II.7), and frames competitors as "how much of *your* footprint's page-1 clicks they're taking." (Competitor gap keywords outside your footprint remain a separate lens.)

**Honest gaps (Const I.5).** A competitor's slice needs **real ranking positions** (uploaded competitor rows with a Position column). A competitor that has keywords on file but **no page-1 overlap** on your footprint, or **no positions at all**, gets **no slice** and is surfaced explicitly ("none rank page 1 on your footprint…" / "no ranking positions uploaded — re-upload its CSV including a Position column"). Never a modeled or silent-zero slice presented as fact (volume + position stay real Semrush/CSV rows; only the CTR multiplier is the labeled model, Const I.5a).

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` = **0 errors**. SSR render harness with a real-shaped client footprint + competitor rows confirms: client SoV % is **identical with and without competitors** (stable denominator); a competitor with page-1 overlap earns a real slice (160 overlap kws); client+competitors+open sum to 100%; open never goes negative and shrinks as competitors capture; a positionless competitor and a no-overlap competitor both render as honest gaps. **Full retained regression suite PASS** — all prior checks (v7.235–245 + v7.245 SoV invariants) plus new competitor-SoV invariants (stable client %, real overlap slice, honest-gap for no-overlap/no-positions, slices sum to 100%, open ≥ 0). Only existing CSS-var tokens → dual-theme parity (V.5/IV.6) holds.

**Action for Wayne:** deploy v7.246. Upload each competitor's keyword CSV **including the Position column** — their page-1 capture slice will appear in the donut automatically, with the uncaptured remainder shown as "open." Competitors without positions are flagged with the fix.

## v7.245 — 2026-06-19 · Share of Voice fixed: page-1 click capture, not a meaningless 100%

**The ask (Wayne).** On the Google-Rank panel, Share of Voice showed **100% CLIENT SOV** even though ~180M+ of annual volume sits *outside* page 1 and the Pg-1 Vol Share card right beside it read **32%**. 100% can't be right — there's no way the client owns all the voice.

**Root cause.** The old SoV was *competitor-relative*: client page-1 volume ÷ whatever competitor rankings happened to be on file. With no competitor data in this project, the denominator was just the client → a trivial, misleading 100%. It also contradicted the panel's own 32% page-1 capture.

**What changed — SoV is now page-1 click CAPTURE.** Per the formula Wayne specified:

> `SoV % = Σ(keyword volume × CTR at the client's ranking position, pos 1–10) ÷ Σ(volume × page-1 CTR sum)`

The numerator is the modeled clicks the client actually wins on page 1; the denominator is **all** page-1 clicks available across the **same footprint** the Google-Rank header counts (built from the shared `buildKwPool`, so it reconciles with the Total / Ranked / Pg-1 cards — Const II.7). Demand that ranks page-2+ now correctly sits in **"open / uncaptured"**, not in the client's share — so a client capturing a slice of a large off-page-1 footprint lands at a realistic low percentage, never 100%. The donut now reads **PAGE-1 SOV (est.)** with two slices (client captured + open demand), the captured-vs-available click counts, and the underlying real footprint numbers.

**Data integrity (Const I.1 / new Art. I.5a).** A CTR-by-position curve is an industry **model**, so SoV is labeled an **on-panel modeled estimate** with its source shown — exactly the III.7 treatment of confidence. Volume and ranking position remain real Semrush rows; only the CTR multiplier is modeled. Curve = **GrowthSRC 2025** (200K-keyword, post-AI-Overviews GSC study): pos1 19.0%, pos2 13.1% (GrowthSRC's own article states 12.6% for pos2; theStacc's per-position table — used for the full 1–10 curve — shows 13.1%; minor secondary-source delta, noted here), pos3 9.8% … pos10 1.9%; page-1 CTR sum ≈ 0.691. Held in **one shared constant** (`CTR_BY_POSITION` in `GoogleSerpSection`) and reused by the Exec value-at-stake ladder (which previously used a separate ~28% curve), so the whole brief now sits on one CTR source of truth. Sources: GrowthSRC (growthsrc.com/google-organic-ctr-study), per-position table via theStacc (thestacc.com/blog/organic-ctr-by-position).

**Scope (Wayne's choice: replace everywhere).** Both the Google-Rank donut (nav 06) and the Executive Summary SoV use the new metric; the Exec's old competitor-share derivations were removed and its "Competitors" readiness check now reads the configured/auto-discovered competitor lists directly. **Known follow-up (logged, not diverged):** the PDF export's "Share of Voice" section still renders competitor organic-traffic bars (a separate competitor-gap view) — not yet converted to the capture metric.

**Constitution.** Amended to **v0.11**: added **Art. I.5a** (labeled, cited industry models permitted for *derived* metrics, never shown as measured data) and recorded the SoV redefinition. Per Art. X this was a deliberate amend-and-label (Wayne chose it over reworking the request).

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` over both edited components = **0 errors**. SSR render harness on a footprint with a heavy page-2 tail confirms SoV computes **3%** (309,784 captured ÷ 9,526,126 available clicks/mo), strictly 0–100%, equals captured÷available, reconciles page-1=497 / footprint=1381, renders the modeled-estimate label + CTR source + donut. **Full retained regression suite PASS** (all prior checks v7.235–244 + new SoV invariants: never trivial 100%, capture math, header reconciliation, GrowthSRC curve values locked, honest-gap empty state). Only existing CSS-var tokens → dual-theme parity (V.5/IV.6) holds.

**Action for Wayne:** deploy v7.245. The Google-Rank Share of Voice will now show a realistic page-1 capture percentage (labeled a modeled estimate, with the GrowthSRC CTR source shown) instead of 100%, with the uncaptured demand called out as "open."

## v7.244 — 2026-06-18 · Optional minimum-volume floor for the product & pre-product builds (steps 3 & 4)

**The ask (Wayne).** When running steps 3 ("Expand product data") and 4 ("Build pre-product journey"), be able to set a volume threshold so keywords below X aren't pulled — either by typing a custom value or picking a preset (500 / 1,000 / 1,900 / 2,400 / 3,600 / 4,400).

**What changed.** A shared **"Min volume · steps 3 & 4"** control now sits in the Build-workflow header: preset chips (None / 500 / 1K / 1.9K / 2.4K / 3.6K / 4.4K) plus a free **custom** number input. The chosen floor is sent to the build; only keywords whose **real Semrush monthly volume is ≥ the floor** are kept (`demand-universe` route now accepts `minVolume`, filters the freshly-pulled lane before merge, records it on `_demandUniverse.minVolume`, and surfaces an honest gap if nothing clears the floor). The floor is **opt-in** per Const I.6 (default 0 = full footprint, unchanged); it is a filter on real source rows, never a modeled value (Const I.1). Each build's active floor also shows in the step 3 / 4 card text and the universe status string.

**Verified (own debugging agent + Const V.6 regression gate).** esbuild + isolated `tsc` over both edited files = **0 errors**. SSR render confirms the control renders with all presets + custom input + "/mo" and the four build buttons remain intact. **Full retained regression suite PASS** (all prior checks v7.235–243 + lane-merge + product-expansion). No new colors (existing CSS-var tokens) → dual-theme parity holds.

**Action for Wayne:** deploy v7.244. Before running step 3 or 4, set a Min volume (pick a preset or type a custom number); the build will only pull keywords at or above that monthly volume. Leave it on "None" for the full footprint.

## v7.243 — 2026-06-18 · Per-box "Clear all" (true delete); product expansion now stays inside existing categories (no more "Other")

**The asks (Wayne).** (1) Each of the four workflow boxes needs a **Clear all** that genuinely DELETES that box's data (not hide). (2) "Expand product data" was dumping every expanded keyword into a single top-level **"Other"** category. The rule for that action is to expand each EXISTING product category into upper/mid-funnel demand **within the same hierarchy — never invent new categories**.

**Item 2 — expansion stays inside the existing categories (the "Other" bug).** The expanded keywords had no stored category membership, so every read site dropped them into a catch-all "Other". Now, when the product pass runs, each product-lane keyword is filed under the **existing base category it was seeded from** (the seed phrase IS a base category name), beneath a deterministic **funnel-stage sub-node** (Awareness / Education / Benefits / Comparisons / Features / Use Cases / How It Works / Costs & Fees / Eligibility / Alternatives / Best Options / Reviews / FAQs). This is written into the stored taxonomy (`_categoryBreakdown.keywordPaths` + `keywordCategories`) so the Keyword and Cluster panels read membership from stored data (Const II.8) — never re-derived lexically. **No new top-level category is ever created**; funnel stages are sub-topics inside the existing category, exactly as the spec's hierarchy requires (Category → Product Type → … → Awareness/…/FAQs → keyword). Volumes remain the real Semrush values (Const I.1); the funnel stage is labeled classification metadata, not a measured number. New pure module `lib/category/productExpansion.ts` (`classifyFunnelStage` + `assignProductExpansionPaths`).

**Item 1 — per-box Clear all (true delete).** Each box now has a trash control (shown only when there's data to clear) with a confirm step:
- **Client base keywords** → deletes the client base keyword rows (`keywords/clear` new `scope:'client'` — domain-less rows only).
- **Competitor data** → deletes competitor keyword rows (`scope:'competitor'`) **and** all competitor entries (new bulk `DELETE /competitors`).
- **Expand product data** → `DELETE /demand-universe { mode:'product' }` removes the product lane's topics + seeds and strips the funnel-stage paths this build authored (base footprint paths, which never end in a funnel stage, are untouched).
- **Build pre-product journey** → `DELETE /demand-universe { mode:'pre' }` removes the pre-product lane.
All four genuinely delete (no hiding) and trigger a full refresh so every panel reflects the deletion. Cards were converted from `<button>` to an accessible `role="button"` div so the nested Clear control is valid markup.

**Verified (own debugging agent + Const V.6 regression gate).** esbuild transform + isolated `tsc` over every edited/added file = **0 errors**. **Full retained regression suite PASS** — all prior checks (v7.235–242 + lane-merge) plus new product-expansion invariants: funnel-stage classification maps to Wayne's stages; an expanded keyword nests under its EXISTING category + funnel sub-node; it is filed in the existing category (no new category); pre-lane topics get no product category; base paths are never overwritten (II.8); topics with no matching existing category are left unplaced (honest gap, I.5). SSR render confirms the four buttons, single scroll container, the Clear (trash) controls appear only where data exists, and the prominence (Action-needed chips, header badge, CTA pills) holds. Only existing CSS-var tokens used → dual-theme parity (also fixed three non-existent red tokens).

**Action for Wayne:** deploy v7.243, then **Run Analysis** and **Run "Expand product data"** again — the expanded keywords will now nest under your existing product categories (with funnel-stage sub-nodes) instead of "Other". Each box's trash icon clears that box's data permanently.

## v7.242 — 2026-06-18 · Workflow-bar fixes: Journey build-status fully removed, competitor "done" = real data, action buttons made prominent

**The asks (Wayne, on v7.241).** (1) The Journey panel *still* showed a build-status block (the "Build the deep journey from the Keyword panel" note + a "Never run" badge + the ranking-footprint provenance) — it wasn't actually deleted. (2) The "Competitor data" button read **Completed** even though no competitor data was uploaded (only competitor domains were listed; the Competitor Gap card was 0). (3) The 4 workflow buttons were too subtle — the ones that need action should stand out.

**What changed.**
- **`components/brief/JourneySection.tsx`** — the entire right-column build-status block (note, run-status badge, demand-universe provenance, progress, error) is **fully removed**. The Journey panel is now purely a display of the journey; nothing build-related remains on it.
- **`components/brief/KeywordsPanel.tsx`**
  - **Competitor "done" now means real competitor keyword data exists** — `compDone = (competitor-gap keyword count) > 0`, not merely that competitor *domains* are listed. Adding a domain without uploading/pulling its keywords now correctly stays **Action needed** ("N competitors added, no keyword data yet — upload it") instead of falsely showing Completed. (Const I.1 — status reflects real data.)
  - **Prominence redesign.** Each stage is now `done` (calm green check), `building` (cyan, live progress bar), or `action` (bright). Action cards get an accent-tinted fill, a full-accent border, a soft glow, an accent left-stripe, a solid accent number badge, an "Action needed" chip, and a filled **CTA pill** ("Upload CSV", "Add competitors / Upload data", "Run expansion", "Run build"). The header shows a "**N actions needed**" badge. Completed builds (3 & 4) keep a subtle "Re-run" affordance. All colors are existing CSS-var tokens → dual-theme parity holds (also fixed two undefined amber/purple border tokens from v7.241).

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` over every edited file = **0 errors**. SSR render of the real `KeywordsPanel` confirms: the four buttons, single scroll container, "Action needed" chips + "N actions needed" header badge + all CTA pills render; **a competitor domain with no keyword data is NOT "Completed" and prompts upload**; built state shows "Built" + "Re-run" + volume-backed topics. JourneySection compiles with the block gone. Full **retained regression suite (v7.235–241 + lane-merge) PASS**. Only CSS-var tokens used → V.5/IV.6 parity holds.

**Action for Wayne:** deploy v7.242. The Journey panel no longer shows any build control; on the Keyword panel the action-needed buttons now clearly stand out, and "Competitor data" only reads Completed once real competitor keyword data is loaded.

## v7.241 — 2026-06-18 · Build workflow moves to the Keyword panel: 4-stage bar; Journey/Cluster build buttons removed

**The ask (Wayne).** On the Keyword panel, between the summary cards and the journey toggle, add **4 buttons**: (1) **client base keywords** — usually already complete (the project starts from a base-keyword CSV upload); (2) **competitor data** — active until competitor data exists, opens the Competitors panel on click; (3) **Expand product data** — expand each existing product category into full-funnel demand (awareness → education → comparisons → … → FAQs) within the same hierarchy; (4) **Build pre-product journey** — surface problem-/trigger-aware demand *before* the product is known (life events, need states, frustrations, goals), never naming the product/category/brand. Then **remove** the Journey panel's "Build deep journey" button and the Cluster pane's "Refine clusters with AI" button.

**Data-integrity gate (Const Art. X + Art. I).** Buttons 3 & 4 are written as "generate keywords" prompts, which would violate I.1/I.2 if the model's text were shown as keyword data with invented volumes. Confirmed with Wayne: the chosen path is **LLM seeds → Semrush fills volume** — each pass produces seed/structure terms (product categories, problem head-terms) and Semrush's `phrase_questions`/`phrase_related` return the real, volume-backed keywords. **No modeled or simulated numbers are ever shown** (I.1); every topic traces to a real Semrush row (I.2).

**What changed.**
- **`app/api/projects/[id]/demand-universe/route.ts`** — now accepts `mode: 'product' | 'pre' | 'all'` (default `all` = legacy combined build). A single-lane pass expands only that lane's seeds and **merges into the existing `_demandUniverse`**, so running one lane never wipes the other (Const II.3 backfill). Each keyword is kept once and the higher **real** volume wins on a collision (I.3 / I.1).
- **New `lib/apis/demandLaneMerge.ts`** — the pure, dependency-free `mergeDemandLanes` helper (so it's unit-checkable in the regression suite); re-exported from `demandExpansion.ts`.
- **`components/brief/KeywordsPanel.tsx`** — the 4-stage **Build workflow** bar. Statuses are derived from **real data**, never a hardcoded "completed": base = client footprint rows present; competitor = competitor domains present; product/pre = `_demandUniverse` topics in that lane. Buttons 3 & 4 stream determinate progress ("seed X of N" + ETA, Const IV.2). On completion the page refetches so new demand backfills every panel.
- **`app/projects/[id]/page.tsx`** — wires `onOpenCompetitors` (opens the Competitors modal) and `onDeepJourneyBuilt` (refetch analysis).
- **`components/brief/JourneySection.tsx`** — "Build / Rebuild deep journey" button removed; the panel is now display-only with a note pointing to the Keyword panel.
- **`components/brief/ThemeClustersPanel.tsx`** — "Refine clusters with AI" button + block removed; the cluster pane is display-only.
- **`components/brief/ContentPlanSection.tsx`** — empty-state copy now points to the Keyword panel's two build buttons.

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` over every edited file (with React/Node types fully resolved) = **0 errors**. SSR render of the real `KeywordsPanel` mounts cleanly and shows all four buttons, a single scroll container, and the correct status chips in both empty ("Upload"/"Add"/"Not run") and built ("Built"/"Completed"/volume-backed topics) states. The **full retained regression suite** — every prior check (v7.235–240) **plus** new lane-merge invariants (rebuilds only its lane, preserves the other lane, no double-count, max-real-volume on collision) — **PASS** on real compiled code. No raw colors introduced (only existing CSS-var tokens) → dual-theme parity holds (IV.6 / V.5).

**Action for Wayne:** deploy v7.241. On the Keyword panel, the new Build workflow bar drives the deep journey; "Expand product data" pulls the product-funnel demand and "Build pre-product journey" pulls the problem/trigger demand — each volume-backed by Semrush. The old Journey and Cluster build buttons are gone.

## v7.240 — 2026-06-18 · Journey + Content panels now use the same base taxonomy as Keyword + Cluster

**The ask (Wayne).** "Now let's bring this base categorization into the journey panel." Phase 2 of the unification.

**What changed (`components/brief/ThemeClustersPanel.tsx`).** `buildCanonicalClusterTopics` — the single function the **Journey, Content, and keyword category model** all consume — now builds its topics from the **shared taxonomy tree** (`buildTopicsFromTaxonomy` over the stored `keywordPaths`) instead of the intent-mined `flattenTopics`, whenever the stored taxonomy is present. So every panel now derives its categories from the one canonical structure (Const II.7): the Journey panel's nodes are the canonical umbrella → theme → sub topics (no mined names), placed in their funnel stage/lane; Content inherits the same. Keywords with no stored path (deep-journey demand / pre-product problem themes) still fall back to the intent grouping inside `buildTopicsFromTaxonomy`, preserving that incremental lens. Pre-taxonomy analyses keep the old flatten (honest gap, I.5).

**Net effect.** All four surfaces — Keyword, Cluster, Journey, Content — now share one base categorization built once from `keywordPaths`. Because they read the same structure, the Cluster "Total topics" and "Topics in journey" counts reconcile again.

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` over the changed file + every consumer (ThemeClustersPanel, KeywordsPanel, JourneySection, ContentPlanSection, ContentMapSection, categoryModel, contentPlan) = 0 errors. The **full retained regression suite** — every prior check (v7.235–239) plus a new journey-stage assertion — **19/19 PASS** on real compiled code: `buildCanonicalClusterTopics` (the journey/content source) now returns canonical umbrella/theme/sub topics with no mined labels, the brand drop + no-flatten hold, and every topic carries a valid journey stage (awareness/consideration/decision/retention). No styling change → dual-theme parity holds.

**Action for Wayne:** deploy v7.240 and **Run Analysis** once. The Journey (and Content) panel topics will now match the Keyword and Cluster panels' categories — same labels, no invented names — laid out by funnel stage.

## v7.239 — 2026-06-18 · One taxonomy, two panels: the Cluster panel now renders the SAME tree as the Keyword panel

**The decision (Wayne).** "I don't think we need to recreate this view in the clusters. Can we not just have the one view in the keyword panel populate the clusters?" Yes — after four releases patching the cluster panel's *own* category pipeline, the durable fix is to build the taxonomy **once** and render it in both panels (Const II.7, single source of truth), with the cluster panel adding its intent / journey-stage / ownership annotations.

**What changed.**
- **New `lib/category/taxonomyTree.ts`** — THE shared builder. `buildTaxonomyTree(rows, keywordPaths, accessors)` groups keywords by their stored path into the umbrella → theme → sub tree, collapses redundant single-child levels, and rolls metrics up arithmetically (every keyword in exactly one node → a parent is the exact sum of its descendants). Generic over the row type so both panels use the identical algorithm.
- **`components/brief/ThemeClustersPanel.tsx`** — the Cluster panel's topic list is now built by `buildTopicsFromTaxonomy`, which walks that shared tree: each node that holds keywords becomes one topic whose **umbrella / theme / sub labels ARE the canonical `keywordPaths` nodes** — identical to the Keyword tree by construction, never mined from keyword text. Each topic still carries the cluster panel's annotations (dominant search intent, journey stage, client/competitor/missing-demand ownership). Keywords with no stored path (deep-journey demand / pre-product problem themes) fall back to the prior intent grouping, so that incremental lens is preserved. Pre-taxonomy analyses fall back to the old view (honest gap, I.5).

**Why this is different from v7.236–238.** Those added an umbrella level / sub-labels *on top of* the cluster's separate category pipeline, which kept drifting. This release removes that pipeline as the structure source: the cluster reads the exact same `keywordPaths` the keyword tree does, so they cannot diverge.

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` over the new module + all `Topic` consumers = 0 errors. The **full retained regression suite** (`_regression/run.sh`) — every prior check (v7.235–238) plus new v7.239 ones — **18/18 PASS** on real compiled code, including: the shared `buildTaxonomyTree` produces a single "Credit Cards" umbrella with "Balance Transfer"/"Cash Back" themes nesting under it, a theme holds its head keyword plus its canonical sub "No Annual Fee", and the rollup is the exact arithmetic sum (1500). No styling change → dual-theme parity (verified for this render in v7.236) holds.

**Action for Wayne:** deploy v7.239, then **Run Analysis** once (so the cleanest, fully-merged `keywordPaths` are stored — the stronger synonym merge from v7.238 applies on a fresh run). The Cluster panel's umbrella → theme → sub should now match the Keyword panel exactly, with intent/stage/ownership shown per node. (Note: with one shared structure, the cluster "Total topics" count now counts taxonomy nodes; the Journey/Content panels move onto the same tree in the next phases.)

## v7.238 — 2026-06-18 · Cluster sub-categories now come from the canonical taxonomy (no mined names); stronger synonym merge

**The issue (Wayne).** Comparing the same primary category (Credit Cards): the Keyword panel was right, the Cluster panel was wrong — the cluster showed a messy, duplicated set ("Balance Transfer" + "Balance Transfer Credit Cards" + "Balance Transfer Cards"; "Cash Back" + "Cashback"; "Secured" + "Secured Cards" + "Secured Credit Cards"). The v7.236 umbrella nesting sat on top of the old layer, so the labels never changed.

**Root cause.** The cluster panel labelled its sub-level (`Topic.product`) with names **mined from keyword text** (`buildIntentClusters` → `nameIntentCluster`), e.g. "Head + Modifier" → "Balance Transfer Credit Cards". That re-derives structure from keyword text at a read site (against Const III.1b/II.8) and never read the canonical `keywordPaths` the Keyword tree uses. A second issue: the synonym-merge pass left near-duplicates ("Cash Back"/"Cashback") unmerged in both panels.

**The fix (2 changes, both `lib/claude/prompts.ts` + `components/brief/ThemeClustersPanel.tsx`).**
1. **Cluster sub-topics from the stored taxonomy.** Each keyword now carries `subTopic` = its canonical `keywordPaths` node below the theme (path[2]). `flattenTopics` groups procedure categories by that canonical sub-topic instead of mining names — so a topic's label is the real taxonomy node ("No Annual Fee"), or the theme itself for head-term keywords. The Cluster panel now mirrors the Keyword tree's umbrella → theme → sub structure exactly, from one source of truth (Const II.7).
2. **Stronger synonym merge.** `pathCanonicalizationPrompt` now aggressively collapses near-duplicates that differ only by spacing/compounding (Cash Back = Cashback), plural (Card = Cards), word order, or a redundant parent-name suffix (Balance Transfer = "Balance Transfer Credit Cards"), and forbids appending the parent's name into a child label — while keeping genuinely distinct nodes separate (Secured ≠ Unsecured, Cash Back ≠ Cash Advances).

**Verified (own debugging agent + Const V.6 regression gate).** Isolated `tsc` over the changed files + all `Topic` consumers = 0 errors. The **full retained regression suite** (`_regression/run.sh`) re-ran every prior-release check (v7.235/236/237) plus the new v7.238 ones — **14/14 PASS** on real compiled code, including: a cluster topic's `product` equals the canonical `keywordPaths` node ("No Annual Fee"), **no** mined near-duplicate label ("Balance Transfer Credit Cards") is produced, the umbrella nesting + brand-drop still hold, and the synonym-merge rules are present.

**Action for Wayne:** deploy v7.238 and **Run Analysis** again (both fixes are synthesis/structure changes — they take effect on a fresh run). The Cluster panel's categories + sub-categories should now match the Keyword panel, and the duplicate labels should collapse.

## v7.237 — 2026-06-18 · FIX: modifier rule was flattening the keyword hierarchy

**The regression (Wayne).** After re-running the analysis on v7.236, the Keyword panel's Category Breakdown went **flat** — "Credit Cards" showed every keyword as a chip directly beneath it with no sub-categories, and each distinguishing term ("no annual fee", "0 APR", "balance transfer", "prequalify") had been pulled into a **modifier** chip. The Cluster panel then had no theme level to nest by either.

**Root cause (mine, from v7.235).** The modifier-separation rule in `hierarchicalDiscoveryPrompt` (Const III.1c) was too aggressive. It listed *rates* and *calculator* as modifiers and told the model to "separate the topic from its modifiers," so on a fresh run the classifier stripped **product-defining facets** (no annual fee, 0 APR, balance transfer, cash back, …) out of the path and into the modifier field. That collapsed every path to a single umbrella node → the tree flattened. This is a synthesis/prompt change, so it only surfaced on the re-run.

**The fix (`lib/claude/prompts.ts`).** Rewrote the modifier rule around the **"same page vs different page" test**: strip a term as a modifier ONLY if two keywords differing just by it would target the **same page** (best, top, reviews, compare, vs, near me, online, how to, requirements, apply). Any term that names a **distinct product/sub-product** — no annual fee, 0 APR / balance transfer, cash back, rewards, secured, student, business, for bad credit, 30-year, VA, current, and any "<thing> rates" / "<thing> calculator" — **stays a sub-topic path node, never a modifier**. Added an explicit "never collapse an umbrella's sub-products into modifiers — that flattens the tree" warning with worked examples ("no annual fee credit cards" → `["Credit Cards","No Annual Fee"]`, modifier ""). Constitution **III.1c corrected to v0.9** with the same test, and over-stripping that flattens the hierarchy is now an explicit FAIL.

**Verified (own debugging agent — real code).** Isolated `tsc` (prompts + synthesize) = 0 errors. The **real** `hierarchicalDiscoveryPrompt` now emits the same-page test, the keep-facets rule, the anti-flatten warning, the "no annual fee → sub-topic" example, and no longer frames "calculator" as a stripped modifier — 5/5 PASS.

**Action for Wayne:** deploy v7.237 and **Run Analysis** again (this is a synthesis fix — it only takes effect on a fresh run). The Keyword tree's umbrella → theme → sub hierarchy returns, facets become sub-categories again (with "best/apply/etc." still shown as modifier chips), and — because the paths now carry real theme levels — the v7.236 Cluster nesting will populate too.

## v7.236 — 2026-06-18 · Cluster panel mirrors the keyword taxonomy (umbrella → theme → topic); brand-typing fix

**The ask (Wayne):** the Keyword panel's Category Breakdown looks right, but the Cluster panel (and Journey/Content) don't mirror it — and they showed themes that weren't in the keyword categories even with no competitor upload and no deep journey run. Make all three panels share the SAME foundational hierarchy as the Keyword panel, with deep-journey demand layered on top only when present. (Phase 1 of 3 — this release does the **Cluster** panel; Journey = v7.237, Content = v7.238.)

**Root cause (traced).** All panels already flow through one function (`buildCanonicalClusterTopics`), so membership wasn't the problem — it was **grouping depth**. The Keyword tree renders the full stored taxonomy (`keywordPaths`: umbrella → theme → sub), while the Cluster panel rendered **flat at the theme level** (`cb.categories`) and never read the umbrella. That flat-vs-nested difference was the whole divergence. Separately, "Nordstrom Card" leaked because synthesis typed it as a *procedure* (not a brand), so the brand guard — which only drops `type:'brand'` non-client categories — never saw it, and with no competitors loaded there was no token to catch it.

**What changed.**
- **`components/brief/ThemeClustersPanel.tsx`.** Each canonical `Topic` now carries its **`umbrella`** — the stored taxonomy parent (`_categoryBreakdown.categories[].parent`, i.e. path[0]), read once, never re-derived from text (Const III.1b). `ThemeCluster` carries `parentLine`; `flattenTopics` sets `topic.umbrella = parentLine ?? name` (a theme with no stored parent, or a brand/location/demand/problem theme, is its own umbrella). The grouped cluster list is now a **tree**: umbrella → theme → topic, each level independently collapsible (umbrella default-collapsed, like the Keyword tree). A theme that is its own umbrella collapses the two header levels into one (no redundant repeat). The `group` sort orders by umbrella, then theme. Summary cards, funnel rollups, ownership/stage filters are untouched — they read the flattened `topics`, independent of the visual grouping.
- **`lib/claude/prompts.ts`.** `hierarchicalDiscoveryPrompt` now requires ANY third-party company/retailer/store/issuer brand — including a co-branded product like "nordstrom card" / "amazon store card" / "costco visa" — to be typed `brand` (path `["<Brand> Brand Searches"]`), **never** `procedure`. So the existing brand guard drops it even with no competitors loaded. (Takes effect on a fresh Run Analysis.)

**Verified (own debugging agent — isolated, real code).** Isolated `tsc` over the changed file + every `Topic` consumer (ThemeClustersPanel, KeywordsPanel, JourneySection, ContentPlanSection, ContentMapSection, categoryModel) = 0 errors — the new required `umbrella` field broke no consumer. Two behavioral suites, all PASS: (a) the **real** `buildCanonicalClusterTopics` over a fixture — "Mortgage Rates" and "Mortgage Calculator" both resolve to umbrella "Mortgages" (siblings, mirroring the keyword tree), "Credit Cards" is its own umbrella, every topic has a non-empty umbrella, and a `type:'brand'` "Nordstrom" category is dropped **with no competitors loaded**; (b) the **real** extracted `TopicTable` rendered in four states — collapsed shows only umbrella headers (no theme/topic rows), expanding an umbrella reveals its theme headers, expanding a theme reveals topic rows, a self-umbrella reveals its rows directly, and for dual-theme parity (Const IV.6/V.5) the new umbrella header uses only theme tokens (`var(--c-6c63ff)`/`var(--c-8b85ff)`) with no hardcoded white/cyan. Cluster-tab scroll root untouched (IV.1); no new wait states (IV.2).

**Action for Wayne:** deploy v7.236, then **Run Analysis** (fresh, so the brand-typing fix applies). Open the Cluster panel → the topic list now nests umbrella → theme → topic, matching the Keyword panel's Category Breakdown, and third-party brand cards are gone. Journey + Content get the same tree in v7.237/v7.238.

## v7.235 — 2026-06-18 · Hierarchical taxonomy: separated modifiers, search intent, confidence + Needs Review, and a Taxonomy CSV

**The ask (Wayne):** classify the uploaded/auto-detected footprint into a strict hierarchical taxonomy where the main topic is separated from its modifiers (best, rates, near me, calculator, requirements, compare, reviews, apply, online…), each keyword gets a search intent, a confidence score, and a one-line reasoning, low-confidence placements go to a "Needs Review" bucket, routing is by meaning not word-overlap (so "home construction loan" → Mortgage/Home Lending and "business construction loan" → Business Lending, never defaulted under Personal Loans), and the result exports as CSV with columns keyword, volume, level_1–5, search_intent, confidence, reasoning. This is the v0.8 Constitution amendment (Art. III.1c / III.6 / III.7) turned into code. Per Wayne's decisions: keep the existing unlimited-depth tree and **add** the modifier split; **show** confidence but label it as an LLM self-estimate (never a measured data metric, Const III.7); the approved Finance→Lending example is a shape reference only — the tree is derived fresh from the client's real footprint.

**What changed.**
- **`lib/claude/prompts.ts` — `hierarchicalDiscoveryPrompt`.** Now also returns, per keyword: the separated `modifier`, the `intent` (informational/commercial/transactional/navigational), an integer `confidence` 0–100, and a ≤12-word `reasoning`. New rules: pull modifiers OUT of the path (never a node, never a new theme); most-specific commercially-useful placement; meaning-based cross-line routing with the worked construction-loan examples.
- **`lib/claude/synthesize.ts`.** Captures + sanitises the new fields (confidence clamped 0–100, strings trimmed/bounded), stores them as `_categoryBreakdown.keywordMeta` (modifier/intent/confidence/reasoning/`needsReview`, where `needsReview = confidence < 80`). Volume sums stay pure TypeScript over real Semrush/upload rows (Const I.1) — the LLM only assigns labels/structure/metadata. The richer per-keyword output is larger, so the discovery batch drops 40→25 and `max_tokens` 8000→12000 to avoid JSON truncation (the salvage parser still backstops a clipped tail).
- **`lib/category/categoryModel.ts`.** Reads `keywordMeta` once into `CategoryModel.keywordMeta` (the stored assignment, never re-derived — Const II.8), alongside the existing `keywordPaths`.
- **`components/brief/KeywordsPanel.tsx`.** (1) New **Taxonomy CSV** export — keyword, volume, level_1–5 (the clean topic path with the modifier appended as the trailing level, Const III.1c; deeper paths show the first 5), search_intent, confidence, reasoning, needs_review; shown only when the analysis carries the stored taxonomy. (2) Leaf keyword chips now show the modifier tag and the confidence % (with a tooltip explicitly labeling it an LLM estimate, Const III.7); low-confidence chips get an amber border + ⚠. (3) A "N needs review" badge in the Category Breakdown header.

**Verified (own debugging agent — isolated, real code).** Isolated `tsc` (`tsconfig.iso.json`) over all four changed files = 0 errors. Four behavioral suites, all PASS: (a) the **real** `hierarchicalDiscoveryPrompt` emits the modifier-separation rule, construction-loan routing, and the modifier/intent/confidence/reasoning schema; (b) the salvage parser at **real batch scale (25 kw)** captures all new fields and recovers ≥24 complete objects from a truncated response (per the harness-real-scale rule); (c) the **real** `downloadTaxonomyCSV` (extracted + bundled) produces the exact header and rows — trailing modifier level, >5-level truncation, comma-escaping in keyword and reasoning, `needs_review=YES` at confidence 62, and clean empty columns for a no-metadata keyword; (d) the **real** `KwCatRow` (extracted + bundled) renders the chips with confidence labeled as an LLM estimate, the ⚠ review marker, the modifier tag, and — for dual-theme parity (Const IV.6/V.5) — uses only theme tokens (`var(--amber)` is defined in both themes: #F59E0B dark / #ce8408 light) with no hardcoded white/cyan literal. Scroll root untouched (IV.1); no new wait states (IV.2).

**Action for Wayne:** deploy v7.235, then **Run Analysis** on a project (auto-discover or upload a Semrush footprint). Open the Keyword panel → the Category Breakdown chips now carry intent/confidence/modifier and flag low-confidence keywords; click **Taxonomy CSV** to export the full hierarchy. Confidence is the AI's own certainty estimate, not a measured metric.

## v7.234 — 2026-06-18 · Reset lands on the Run screen (no dead-end); uploaded Semrush SERP features now show

**Two issues after the v7.233 reset + a fresh CSV upload (Wayne):** (1) the Journey and Audience tabs asked to "upload a file" and the Keyword **list/cluster sub-panels were missing**, even though the Keyword Landscape showed the 1,427 uploaded keywords; (2) the **SERP-feature columns were all "—"**, even though the Semrush CSV export carries a "SERP Features by Keyword" column.

**Issue 1 — post-reset dead-end (my v7.233 design).** A full reset deletes the analysis record, so `hasResults` is false. The Journey/Audience tabs and the Keyword list/cluster sub-nav are all gated on having a completed analysis, so they correctly showed the pre-run screen / hid. The trap: v7.233 kept the user on the empty Keyword Landscape, whose "Upload CSV" button only adds rows to the keyword table — it does **not** run the analysis the other panels need — with no signal that a "Run Analysis" was still required. So uploading there looked like it should populate everything, but couldn't.
- **Fix (`app/projects/[id]/page.tsx`):** after a reset the app now lands on the **pre-run data-source / Run screen** (the proper "start over" entry — choose Auto-discover or Upload footprints, then Run Analysis, and every panel rebuilds). Reverted the v7.233 `cleared`-flag forcing; `onCleared` now just refetches the (empty) project so `hasResults` flips false and the data-source screen shows. (Wayne chose this over keeping the empty Keyword panel.) Note: the upload-mode analysis already reads existing `source='csv'` rows, so a client CSV uploaded via the Keyword Landscape is picked up by Run Analysis — no Semrush units, no re-upload needed.

**Issue 2 — uploaded SERP features never rendered.** The CSV parser already reads the "SERP Features by Keyword" column and stores it on the row (`project_keywords.serp_features`), but `buildRows` derived the AIO / PAA / Video pills **only** from live SerpAPI data (`serpMap`) and never looked at the uploaded cell — so an upload-only project showed "—".
- **Fix (`components/brief/KeywordsPanel.tsx`):** `buildRows` now falls back to the uploaded `serp_features` cell when there's no live SerpAPI row for a keyword — parsing Semrush's own labels ("AI Overview" → AIO, "People also ask" → PAA, "Video"/"Video Carousel" → Video). Real data only (Const I.1) — the flags come straight from Semrush's column. Live SerpAPI stays authoritative when present. The "client cited" check needs a live SERP scan, so it stays off for uploaded-only rows (honest gap, Const I.5). Added `serpFeatures` to the runtime `DbKeyword` type.

**Verified (own debugging agent).** esbuild type-strip transform of both changed files = clean. Feature-string parser unit-checked = 6/6 (multi-feature, single, none, "Video Carousel", empty, null). `page.tsx` diffed back to the v7.232 render baseline (only the new `onCleared` prop remains); SERP fix adds no colors (theme parity IV.6 unaffected); scroll root unchanged (IV.1). node_modules not vendored → no full-deps tsc/jsdom (isolated-harness model, same as prior releases).

**Action for Wayne:** deploy v7.234. To finish your current project without re-uploading, just click **Run Analysis** — it will use the client CSV already on file (Semrush skipped) and rebuild the clusters, journeys, and audience, and the SERP-feature columns will populate from your Semrush export.

## v7.233 — 2026-06-18 · Clear All now truly DELETES (no more hiding); full reset back to a blank project

**The ask (Wayne):** "I'm trying to delete the client's keywords to start over and Clear All is not working. I also saw a message 'Hiding Semrush keywords.' When we delete the keywords there should be NO hiding — it should delete and clear them out."

**Root cause.** The Semrush footprint (the 6,705 keywords) is **not stored in the keyword table** — it lives inside the saved analysis record (`analyses.semrush_snapshot`, a JSON blob). The keyword table only holds CSV/custom uploads plus `blocked` masking rows. So the old Clear All couldn't delete the footprint; instead it (1) deleted the uploaded rows, then (2) **inserted a `blocked` row for every Semrush keyword to hide them** — that's the "Hiding Semrush keywords…" message. Two failures: it was masking instead of deleting, and the mask was incomplete (step 2 only covered `topKeywords + gapKeywords`, but the table also renders demand-universe and competitor-gap keywords via `buildKwPool(includeDemand:true)`, which were never blocked), so a large chunk stayed visible and it looked like nothing happened. A second gap: the Clear All button was gated on `dbKeywords.length > 0`, so on a pure-Semrush project (no uploads) the button could be hidden exactly when a reset was needed.

**What changed.**
- **New `POST /api/projects/[id]/keywords/reset`** — a true full reset. Deletes **every** `project_keywords` row (client + competitor uploads + any leftover `blocked` rows) **and every `analyses` row** for the project (which cascades to that analysis's personas / opportunities / reports via the existing FK `ON DELETE CASCADE`). Deliberately preserved: the project row, its competitors list, brand terms / excluded-brand blocklist (setup config), and the **api_usage credit ledger** (real spend history must survive a reset).
- **`components/brief/KeywordsPanel.tsx`** — `handleClearAll` now calls `/reset` in one shot. The `blocked`-masking loop and the "Hiding Semrush keywords…" step are **gone**. The button now shows whenever there's anything to wipe (a Semrush footprint **or** uploaded rows), and the tooltip/confirm copy says plainly that it deletes everything and can't be undone.
- **`app/projects/[id]/page.tsx`** — after a reset the project genuinely has no completed analysis, so to honor "stay on the Keyword panel, empty" (Wayne's choice) a new `cleared` flag keeps the empty **Keyword Landscape** visible (showing "No keyword data — run an analysis first.") instead of bouncing to the pre-run data-source screen. The header **Run Analysis** CTA stays available to start over; starting a run clears the flag. When there's no analysis the panel is passed an empty snapshot shell so the pool/classifier builders never deref a null.

**Verified (own debugging agent).** esbuild type-strip transform of all three changed files = clean (no syntax errors). Isolated `tsc` (stubbed imports) on the new `/reset` route = 0 errors. Behavioral harness over the **real** compiled `buildKwPool`: empty/empty-shell snapshot → `[]` (no throw, so the post-reset empty panel can't crash), and a real keyword still yields a row (proving the empty result is genuine, not a swallowed error). `buildJourneyClassifier` construction over the empty shell is safe (all helpers iterate `?? []`-guarded empty arrays; `classify` short-circuits to `offtopic` at zero categories, and at the default "all" scope the panel never calls it). Scroll root unchanged (`flex-1 min-h-0 overflow-y-auto`, Const IV.1); no new colors introduced (theme parity IV.6 unaffected). NOTE: a full-dependency `tsc`/jsdom render wasn't run because `node_modules` isn't vendored in this snapshot — same isolated-harness model as prior releases.

**Action for Wayne:** deploy v7.233. On a project, click **Clear All** → confirm. Everything (uploaded keywords + the Semrush footprint + the saved analysis) is deleted with no hiding, and you land on an empty Keyword Landscape ready to **Run Analysis** again. (One-time: this adds a new API route — no `db:push` needed; it reuses existing tables.)

## v7.232 — 2026-06-18 · Fix v7.231 regression: discovery truncation blanked the Cluster panel; speed up navigation

**The ask (Wayne):** after re-running on v7.231, the Cluster panel's themes were completely gone, the Keyword panel lost its categories, and every click/navigation lagged for seconds.

**Root cause (my v7.231 bug).** The new hierarchical discovery returns a full path per keyword — ~3× more verbose than the old flat index lists — but the batch size (250 keywords) and response limit (4,000 tokens) were unchanged. So each batch's JSON truncated, every batch failed to parse, and `generateCategoryBreakdown` collapsed to an EMPTY result. Both the Cluster panel and the Keyword-panel categories read that same `_categoryBreakdown`, so both blanked. My v7.231 harness only used 9-keyword fixtures, so it never hit the real-scale token budget — that's the gap that let this ship.

**What changed.**
- `lib/claude/synthesize.ts` — discovery batch 250 → 40 and `max_tokens` 4,000 → 8,000 (and canonicalization 4,000 → 8,000), so each response stays well inside the budget; concurrency 5 → 6 to keep wall-time down. Added a tolerant `parseAssignments` that salvages every COMPLETE assignment object from a response even if the tail is truncated — so a partial response still contributes its keywords instead of dropping the whole batch.
- `components/brief/ThemeClustersPanel.tsx` — `buildCanonicalClusterTopics` (which walks the full ~14k-keyword footprint and is called by every panel) is now memoized on a signature of its inputs. The first panel computes it; the Cluster/Journey/Content/Keyword views reuse the cached result instead of recomputing on every navigation and interaction. The result is read-only to callers (verified: no caller sorts/pushes the returned array in place), so the cache can't be poisoned.

**Verified (own debugging agent).** Isolated `tsc` = 0 errors. Behavioral harness (esbuild-bundled real compiled code): pipeline regression on the mortgage fixture = 12/12 (unchanged); a new truncation test = 5/5 — a deliberately truncated discovery response still yields a non-empty category breakdown (panels not blanked), `keywordPaths` populated from the salvaged objects, recovered keywords categorized, and all keywords still accounted for. Memo logic verified by inspection (signature covers footprint size, demand universe, category/keyword-map counts, domains, thresholds).

**Still open (separate, pre-existing).** The Google Ranks "ranked" count (`topKeywords.length`) vs the Keyword Landscape "ranked/client" count differ because they count "ranked" differently (the latter includes uploaded keywords without a position). That's a different code path, not part of the taxonomy work, and is NOT fixed here — flagged for a follow-up.

**Action for Wayne:** deploy v7.232 and run a fresh Data-only refresh. The Cluster panel + keyword categories should return, and navigation should be snappy.

## v7.231 — 2026-06-18 · Hierarchical taxonomy (Phase 1): one stored multi-level tree, every node a page (Const I.1, II.8, III.1b)

**The ask (Wayne):** the v7.230 sub-clusters were mechanically mined ("Mortgage Year", "Rate Current" — two boxes that are really the same theme). Group categories and sub-categories by meaning into a real hierarchy: parent → sub → sub-sub, every level a page with keywords + volumes. Decisions: unlimited depth, a "Mortgages" umbrella over Rates/Calculator, every level is its own page. Approach: combined hierarchical discovery, fresh umbrellas, single-child collapse (no depth cap). See `OrbitIQ_Hierarchical_Taxonomy_Spec.md`.

**What changed.**
- `lib/claude/prompts.ts` — `hierarchicalDiscoveryPrompt` (per keyword: full [umbrella, theme, sub, …] path + type, group by MEANING, unlimited depth, head terms stop shallow) replaces the flat discovery prompt; `pathCanonicalizationPrompt` aligns synonym labels across batches over the DISTINCT paths.
- `lib/claude/synthesize.ts` — `generateCategoryBreakdown` rewired: hierarchical discovery (paths, same batch cost as before — no extra pass) → path canonicalization → TypeScript reconcile. Stores `keywordPaths` (keyword → canonical path) and DERIVES the flat `keywordCategories` (theme level), `categories`, and umbrella `parent` so the 14 existing consumers keep working unchanged. The separate v7.229 taxonomy pass and membership self-check are subsumed by the path assignment (umbrella = path[0]; correct home assigned directly). All volume math stays in TypeScript (Const I.1); the LLM only labels + structures.
- `lib/category/categoryModel.ts` — `CategoryModel` gains `keywordPaths` (read once from the stored taxonomy, Const II.8).
- `components/brief/KeywordsPanel.tsx` — `buildPathTree` builds the N-level page tree from `keywordPaths`: each node holds its own head-term keywords (`own`) and rolls up its descendants' volume (exact arithmetic); single-child no-own nodes collapse (Wayne: collapse instead of a depth cap). A node can show BOTH its sub-pages and its own keyword chips on expand. Falls back to the v7.230 2-level view when an analysis has no stored paths (honest gap I.5).

**Data impact.** "Mortgage Year"/"Rate Current"-style look-alikes collapse into one real theme; sub-topics ("Current rates", "30-yr fixed", "VA") live at their true depth instead of as flat boxes; "Mortgage Rates" and "Mortgage Calculator" sit as siblings under a "Mortgages" umbrella. Totals are conserved and every node's volume is the exact sum beneath it — no number is modeled. Needs a fresh analysis to populate; pre-v7.231 analyses render the v7.230 view.

**Verified (own debugging agent).** Isolated `tsc` = 0 errors. Behavioral harness (esbuild-bundled real compiled code): synthesize pipeline on a mortgage fixture = 12/12 (deep 4-level paths stored; "30 Year Fixed" synonym canonicalized + merged to one node; themes derived with umbrella parents; both Rates + Calculator under "Mortgages"; sub-topics not promoted to top categories; brand handled; totals conserved; theme rollup exact). Render tree `buildPathTree` = 11/11 (umbrella → theme with own head keyword → sub → sub-sub at correct depths; exact rollups; single-child umbrella collapses to its theme; 2-theme umbrella kept). KwCatRow markup unchanged from v7.230 → no new color literals; `orbitiq-v7.231-RENDER.html` regenerated (light/dark toggle, 0 hardcoded colors). This is Phase 1 of the spec; Phase 2 = per-node page/gap indicators + sharing the tree with Cluster/Journey/Content; Phase 3 = polish.

## v7.230 — 2026-06-18 · Restore Category drill-down on real data — sub-clusters + keywords at each level (Const II.8, III)

**The ask (Wayne):** after v7.229 the Category Breakdown was correct but you couldn't click a category to see its sub-categories and the keywords at each level. v7.229 had (correctly) deleted the *fabricated* word-guess sub-splitting, but it left categories as flat leaves with no drill-down at all — a regression in usefulness.

**What changed (ONE file, `components/brief/KeywordsPanel.tsx`).**
- New `buildCategoryNode` — splits a procedure category into its **real single-intent sub-clusters** using `categoryModel.topics` (the canonical "one cluster = one intent = one page" unit the Cluster/Journey panels already use). The sub-cluster membership is the **stored topic assignment** (Const II.8), not a lexical guess. A keyword with no topic, or a topic with only one keyword, falls into a "— general" remainder; if the split wouldn't yield ≥2 real sub-clusters the category stays a single leaf. Keywords live on each leaf's `own`.
- `KwCatRow` now reveals the **actual keywords** of a leaf as chips when you expand it (`canRevealKeywords`) — each chip is a real source row showing the keyword, its annual demand, and a rank-colored dot for the client's position bucket. So the tree is: Product Line → Category → intent sub-cluster → (expand) keyword chips, and every level's totals stay the exact arithmetic sum of the keywords beneath it.

**Data impact.** Pure presentation over the existing canonical model — no data sourcing, volume, or membership change; category/line totals are byte-identical to v7.229 (the sub-clusters just partition what was already there). Brand/Location/Other stay flat (navigational).

**Verified (own debugging agent).** Isolated `tsc` = 0 errors. Behavioral harness (esbuild-bundled real compiled code): drill-down logic `buildCategoryNode`/`buildProductLines` = **11/11** (category splits into its real sub-clusters + "— general"; each leaf carries its own keywords; single-topic category stays a viewable leaf; totals exact, no double-count; lines wrap without disturbing sub-cluster depth). SSR render of `KwCatRow` = **6/6** (expanded leaf renders its real keyword chips with annual demand + reveal badge; collapsed shows none). This release ADDS markup (keyword chips) → Const IV.6/V.5 dual-theme parity **triggered and verified**: the harness asserts every color in the new rows is an existing theme CSS variable (zero hardcoded literals), and `orbitiq-v7.230-RENDER.html` renders the tree with a light/dark toggle for eyeballing. Panel scroll untouched.

## v7.229 — 2026-06-18 · Real category taxonomy — parent/child is stored data, not a render-time word guess (Const I.1, II.8, III.1)

**The ask (Wayne, with screenshot):** the category tree was wrong — "Mortgage Rates and Calculators" sat under a "Calculators" parent, and "Credit Card" was nested *inside* the Mortgage category. How do we make the category structure accurate? Decision: make the hierarchy **real data** (not a heuristic), ship it in one release, and amend the Constitution.

**Root cause (two layers).** (1) The category breakdown was a *flat* list — no parent/child anywhere. The whole tree was *fabricated at render time* in `KeywordsPanel` by two lexical heuristics: `buildFamilies` grouped categories by their **literal last word** (so "…and Calculators" fell under "Calculators"), and `buildSubTree` promoted recurring word-pairs to child rows. This is exactly the lexical re-derivation Const II.8 forbids. (2) Batched discovery had **misfiled** keywords — credit-card keywords were sitting inside the Mortgage category, which the sub-tree splitter then surfaced as a fake "Credit Card" sub-line.

**What changed.**
- **`lib/claude/prompts.ts`** — two new prompts: `categoryTaxonomyPrompt` (assign each procedure category a **semantic** product-line parent — "Mortgage Rates and Calculators" → "Mortgages", never "Calculators"; siblings never nest under each other) and `categoryMembershipCheckPrompt` (flag keywords clearly filed in the wrong category and give the correct one from the same canonical list).
- **`lib/claude/synthesize.ts`** — `CategoryBreakdownResult.categories[]` gains an optional `parent`. Two bounded, fault-tolerant passes added: **Pass 2.5c membership self-check** (re-files misfiled keywords *before* the demand sums — Claude only relabels, all volume math stays in TS) and **Pass 2.5d taxonomy** (writes the real product-line `parent` onto each procedure category). Both run as a single LLM call, are guarded for the Lambda time budget, and on any failure leave the prior behavior intact (flat = honest gap, Const I.5).
- **`lib/category/categoryModel.ts`** — `ModelCategory` gains `parentLine?`; `CategoryModel` gains `parentForCategory` (canonical name → product line), read **once** from the stored `_categoryBreakdown` (Const II.8 — never re-derived at a read site).
- **`components/brief/KeywordsPanel.tsx`** — deleted the fabrication: `buildFamilies`, `buildSubTree`, and the bigram/unigram token machinery are gone. Categories are now leaves; `buildProductLines` groups them under their **real** stored parent (synthetic line row only when ≥2 categories share a line; unique or untagged categories stay top-level). Parent metrics remain the exact arithmetic sum of their leaves.

**Data impact.** On a freshly-run analysis the Keyword Category Breakdown shows a real two-level tree (Product Line → Category); misfiled keywords are re-filed (their volume moves with them, totals conserved). On analyses run before v7.229 there is no stored `parent`, so the panel renders **flat** rather than guessing — re-run the analysis to populate the taxonomy. No data caps added; the time-budget guards skip the *optional* enrichment on very large footprints (→ flat) but never trim keywords or volume.

**Verified (own debugging agent).** Isolated `tsc --noEmit` on all four changed files + deps = 0 errors. Behavioral harness (esbuild-bundled **real** compiled code): the synthesize pipeline on a bank fixture that reproduces the exact bug = **12/12** — credit-card keywords misfiled into "Mortgage Rates and Calculators" are moved to "Credit Cards", parents are semantic ("Mortgages"/"Loans"/"Credit Cards", nothing under "Calculators"), demand conserved (5000==5000); the render tree (`buildProductLines`/`leafCatNode`/`aggregateCatNode`) = **11/11** — ≥2-member line becomes a synthetic parent with exact-sum totals, unique lines stay top-level, and absent taxonomy → flat. No styling/markup/color change → Const IV.6/V.5 dual-theme parity not triggered (KwCatRow render is byte-unchanged; only the tree it is handed changed). Panel scroll untouched.

**Constitution.** Amended **v0.7** — new Art. III.1b: category parent/child structure is **real, stored data**, assigned semantically at synthesis, and is never fabricated from keyword text (shared words, trailing nouns) at a read site. Added to the Art. III pass/fail and the Art. VIII release-gate checklist.

## v7.228 — 2026-06-17 · Staged category members on the shared model (Step 2 foundation, Const III.2a)

**The ask (Wayne):** continue the enrichment build — stage the members so the deep-journey / pre-product layer has a foundation.

**What changed (ONE file added-to):** `lib/category/categoryModel.ts` — `CategoryModel` gains a `members: ModelMember[]` projection. Each keyword is tagged, derived ONCE from the canonical topics, with: `provenance` (footprint vs deep-journey **demand** — from `KwItem.origin`), `journey` lane (**product** solution-aware vs **pre-product** problem-aware — Const III.2a), `stage` (awareness → consideration → decision → retention), and `mentionsProduct` (false for pre-product / trigger terms). The pre-product classification is **identical to CanonicalJourneyView** (JourneySection lines 1986-1988: a `problem` cluster, or a `demand` cluster whose name is a deep-journey `problemSeed`), so the model's lanes match the Journey panel exactly (Const II.7).

**No consumer yet → zero behavior change.** `categories` and `categoryForKeyword` are byte-unchanged; KeywordsPanel and ThemeClustersPanel are byte-identical to v7.227 (`cmp`-verified). This is purely the staged-membership foundation that Step 3 (deep-journey enrichment, which WRITES pre-product members with a seed-category edge) consumes.

**Why it matters:** this is where the pre-product use case lives — e.g. a trigger query like "how to stop rising rent" attaches to a mortgage category as `provenance:demand, journey:pre-product, mentionsProduct:false`, exactly the awareness-only, problem-aware demand the deep journey is meant to surface (Const III.2a). Membership is stored-at-source, never re-derived lexically (Const II.8).

**Verification (own debugging agent):** isolated `tsc --noEmit` = **0 errors**. Behavioral harness — esbuild-bundled REAL pipeline, mortgage + `_demandUniverse` (rising-rent problem seed) fixture = **9/9**: members non-empty; every member has a valid stage / provenance / lane; `mentionsProduct === (journey is product)`; members align 1:1 with `categoryForKeyword` and every `categoryName` matches the membership map; footprint mortgage kw → footprint/product; **demand "how to stop rising rent" → demand provenance, pre-product lane, mentionsProduct false.** No styling change → Art. IV.6/V.5 not triggered. Manifest diff vs v7.227 = only categoryModel.ts + package.json changed.

## v7.226 — 2026-06-17 · Centralized competitor-brand category guard (Const III.1a)

**The ask (Wayne):** the Theme-Cluster panel and the Keyword panel showed different category lists, and the cluster panel looked "cleaner / more accurate." **Root cause:** both panels read the same `_categoryBreakdown`, but ThemeClustersPanel applied the competitor-brand category guard while KeywordsPanel applied **none** — a III.1a gap (same class as the v7.224 "Wells Fargo" leak in the Google-Rank panel). The categorization was identical; only the post-categorization guard diverged.

**What changed:**
- **New `lib/category/categoryGuard.ts`** — single source of truth for the competitor-brand category guard. `buildCategoryGuard(snap, clientDomain, competitorDomains)` exposes `isCompetitorBrandCategory(name, type)` and `droppedCategoryNames(categories)`, encoding the exact three drop conditions ThemeClustersPanel used (v7.196 brand-type that isn't the client; v7.201 auto-discovered/configured competitor brand carried in the name; v7.208 user blocklist). The client's own brand category is always kept.
- **ThemeClustersPanel** now calls the shared guard instead of its inline token-set checks — **identical behavior (pure extraction).**
- **KeywordsPanel** now applies the same guard: any keyword row mapped to a competitor-brand category is rerouted to **"Other"** (volume preserved, brand label removed) and no competitor-brand leaf is formed. The two panels' category lists now agree.

**Data impact:** the Keyword panel's Category Breakdown no longer shows competitor / third-party brand categories; their (non-branded) keyword volume rolls into **"Other."** Client brand categories are unchanged. No change to ThemeClusters, Journey, or any total beyond removing brand-category labels the panel should never have shown.

**Architecture:** first brick of the one-`CategoryModel` direction (see `OrbitIQ_Enrichment_Workflow_Spec.md`, Step 1) — the brand guard becomes shared infrastructure instead of per-panel code (Art. III.1a: the guard, not the synthesis output, is the enforcement layer). Constitution amended to **v0.6** (Art. II.8: category membership is established at discovery, never re-derived lexically at a read site).

**Verification (own debugging agent):** isolated `tsc --noEmit` over the full project = **0 errors**. Behavioral harness against the **real compiled** guard = **9/9** (client brand kept; competitor brand-type, competitor-brand-in-name, and user-blocklisted dropped; generic procedure/location categories kept; `droppedCategoryNames` excludes the client brand). **No styling change → Art. IV.6/V.5 dual-theme parity not triggered.** Manifest: diff vs pristine v7.225 = only the two panels + `package.json` changed, `categoryGuard.ts` added; nothing else.

## v7.225 — 2026-06-17 · API usage & credit ledger (per-project + cross-project Dashboard)

**The ask (Wayne):** "how many Semrush API credits have we used since we started?" — and then: build a log that shows, per project, how many API credits are being used across all API keys; surface it from a global **Dashboard** button that opens stats across all projects and at the individual-project level without opening a project.

**Why it couldn't be answered before:** OrbitIQ logged no usage. The Semrush MCP exposes no units-balance endpoint, and nothing recorded historical spend. Any past total would have been a guess — which Art. I.1 forbids. So this release starts a **real, forward-looking ledger**: counting begins at deploy; a per-provider **baseline** field lets you anchor the in-app total to your provider dashboard's real figure.

**What's counted (all five metered providers), measured not modeled (Art. I.1):**
- **Semrush** — units = rows *actually returned* × the provider's **published per-line rate**, verified live at developer.semrush.com on 2026-06-17: domain overview / organic / unique-pages / URL reports **10**/line; **competitor-discovery (`domain_organic_organic`) and demand reports (`phrase_questions`, `phrase_related`) 40**/line (the code's old generic "10/row" comment under-counted these). Recorded at the single `semrushGet` choke point, so every report type is captured automatically.
- **SerpAPI** — searches actually run (Google, AI-Overview follow-up, Maps, Local-Pack each billed separately).
- **Profound** — calls made.
- **Anthropic (Claude)** — input+output tokens reported by each response (auto-recorded by wrapping `getClient()` so all current and future calls are caught).
- **OpenAI** — chat tokens, and persona portraits counted as images.

**How it's wired:**
- New `api_usage` table (`db/schema.ts`) — one row per billed call: provider, endpoint, unit, quantity, rows×rate provenance, a non-reversible key fingerprint (supports multiple keys per provider), `kind` (usage|baseline), and a JSON meta. Created at deploy by `drizzle-kit push`; reads are fault-tolerant so a not-yet-migrated table shows an honest empty ledger (Art. I.5).
- `lib/usage/context.ts` (request-scoped `AsyncLocalStorage`) + `lib/usage/record.ts` (the recorder + verified rate table + key fingerprint). Recording can **never** break a real call — every write is try/caught.
- Each paid API route sets the project once (`setUsageProject`), so calls attribute to the right project; calls with no project context roll up under **Unattributed**.
- **UI:** per-project **API Usage** panel (new left-nav section) — provider cards (measured vs. baseline vs. total, rows/calls), a recent-calls log (provenance), an in-place Refresh + last-activity timestamp (Art. IV.4/IV.5), and a methodology note. New global **Dashboard** button (top nav, inline by New Project; also in the project header) opens `/usage` — grand totals across all projects + a per-project breakdown table with an "All projects" total.

**Data integrity:** the ledger only ever **adds** measured rows; provider dashboards remain the billing source of truth and the panel says so. Nothing here touches the keyword/cluster/journey pipeline, brand guard, or any existing number.

**Verification (own debugging agent):** full-project isolated `tsc --noEmit` (real next/drizzle/anthropic/neon/vercel/zod deps installed) = **0 errors**. jsdom render harness for `ApiUsageSection` + `UsageRollup`, effects flushed against stubbed routes, in **both** dark and light themes (Art. V.5) = **24/24** — headers, provider cards, formatted figures, baseline control, recent-calls log, per-project table, Unattributed bucket, grand-total row all render; theme-parity scan confirms no `text-white` off an accent surface and no hardcoded #fff/#000 (Art. IV.6). Scroll: the new panel resolves to one `overflow-y-auto flex-1 min-h-0` container (Art. IV.1).

**Note:** counting starts when v7.225 is deployed and `db:push` runs. To reflect spend before today, open a project's **API Usage** panel and set a per-provider baseline from your real Semrush/SerpAPI/etc. dashboard figure.

## v7.224 — 2026-06-16 · Google-Rank panel: competitor brand categories removed (Const III.1)

**The problem (Wayne):** on the Google-Rank panel, TD Bank's "Weakest Categories" and "Competitor Outperforming" cards surfaced **"Wells Fargo Brand Searches"** (and other non-client brands). Constitution III.1 is absolute — no brand name other than the client's may appear anywhere.

**Root cause:** the Keyword, Cluster, Journey and Content panels already strip competitor / third-party brands (`buildKwPool` + the v7.196/v7.201/v7.208 guards in `ThemeClustersPanel`). But the Google-Rank summary cards (Strongest / Weakest / Competitor-Outperforming / Largest-Opportunity) and the Category-Performance table read `semrushSnapshot._categoryBreakdown.categories` **directly**, and that read had **no brand guard**. A `brand`-typed category named after a competitor (built from competitor *gap* keywords during synthesis) therefore leaked straight into the panel.

**Fix (`components/brief/GoogleSerpSection.tsx`):** the panel now sanitizes `_categoryBreakdown` before use, mirroring the `ThemeClustersPanel` rule exactly. A category is dropped when it is a `brand`-type category that is **not** the client's own brand, **or** its name carries an auto-discovered / configured / blocklisted competitor brand (`buildCompetitorBrandTokens` + `buildExcludedBrandTokens` + `textHasCompetitorBrand`). The client's **own** brand category is always kept (its name contains the client brand via `isBrandedKeyword`). The matching `keywordCategories` entries are stripped too, so the expanded keyword sub-tables and `inferCategoryForKw` can never resurface a dropped category.

**Data integrity (Art I):** the guard only **removes** rows — it never fabricates. `totalMonthlyDemand` / `totalPage1Demand` are recomputed as exact roll-ups of the surviving real categories. Because it filters at the view (not the stored snapshot), it fixes **already-analysed projects with no re-run** — consistent with the v7.208 blocklist philosophy.

**Verification (own debugging agent):** isolated `tsc` on `GoogleSerpSection.tsx` + `kwVolume.ts` = **0 errors**. Logic harness against the **real** `kwVolume` helpers (TD Bank fixture) = **10/10** in two scenarios — (A) empty blocklist (relies on the `brand`-type + competitor-domain guard) and (B) populated blocklist: "Wells Fargo Brand Searches", "Bank of America Locations" and a competitor-named procedure ("Usbank Mortgage Rates") all dropped; "TD Bank Brand Searches" and generic procedures kept; `keywordCategories` cleaned; totals exact. Dual-theme render `orbitiq-v7.224-RENDER.html` (Art V.5) — before/after cards in light + dark; jsdom self-check confirms no competitor-brand text in the AFTER columns. No markup or color changed, so theme parity holds by construction.

## v7.223 — 2026-06-16 · Journey categories: existing/net-new split + clearer type label; pre-product lane now populated from problem-aware demand

**The ask (Wayne):** on the canonical Journeys view — (1) "Procedure" was unclear; (2) categories should show existing vs net-new without expanding; (3) the product-vs-pre-product segmentation was missing (the Pre-product lane showed ~1 topic).

**Fix (`components/brief/JourneySection.tsx`, `CanonicalJourneyView`):**

- **Clearer type label.** The category type badge `Procedure` is relabeled **"Product topic"** (Brand / Location / Missing demand / Pre-product unchanged). "Procedure" was cosmetic-vertical wording that read oddly for non-cosmetic clients.
- **Existing/net-new per category (chosen layout, Option A).** Each category header now shows `N existing · M build` (green/red) alongside the type badge — so coverage reads at a glance without expanding. Existing = client ranks or has a page; build = net-new.
- **Pre-product lane populated correctly (Const III.2a).** A topic is now treated as pre-product (problem-aware, awareness-only) when it is a `problem` cluster **or** a missing-demand cluster seeded by a deep-journey problem head term (`demandUniverse.problemSeeds`). Before, problem-aware demand was absorbed into the product lane, leaving the Pre-product journey nearly empty. The product journey stays solution-aware/full-funnel; the pre-product journey carries the problem/life-trigger demand. `problemSeeds` is read from the demand universe (panel state or the analysis snapshot) and passed into the view.

No data sourcing changed — every count is a real roll-up of the cluster topics; the pre-product routing only re-lanes existing topics using the deep journey's own problem seeds (Const I, II.7).

**Verification (own debugging agent):** isolated `tsc` = **0 errors**; SSR harness = **8/8** — type relabeled (old "Procedure" gone), per-category existing/build split present, problem-seed demand routed to the Pre-product lane, product-seed demand stays in the Product lane. Dual-theme render `orbitiq-v7.223-RENDER.html`.

## v7.222 — 2026-06-16 · Build deep journey now refreshes the Keyword / Clusters / Content panels automatically (no manual reload)

**The ask (Wayne):** after clicking **Build deep journey**, the Journeys panel updated live but the Keyword, Clusters, and Content panels only reflected the new demand after a page reload. Make them update in one step.

**Why:** those panels read the demand universe from the analysis snapshot (`semrushSnapshot._demandUniverse`, via `buildKwPool(includeDemand)`), and the build persists it to the DB — but the page's `analysis` prop is only fetched at load, so it was stale until reload. Only the Journeys panel saw it live (it keeps the built universe in its own state + cache).

**Fix:**

- `JourneySection` gains an optional `onDeepJourneyBuilt` callback, fired on the build's `done` event (after the universe is persisted + cached).
- The page (`app/projects/[id]/page.tsx`) passes a handler that refetches the project — which re-reads the analysis snapshot now carrying `_demandUniverse` — and bumps `kwVersion`. That flows the new demand into `analysisForPanels` and triggers the panels' `/keywords` refetch, so the Keyword landscape, Clusters, Content Map/Plan, and the canonical Journey count all update together (closing the footprint→deep-journey→backfill loop, Const II.4).

No data sourcing or visual change — purely wiring an existing refresh to the build-complete event (every number is still a real roll-up; Const I). 

**Verification (own debugging agent):** isolated `tsc` = **0 errors** on the brief components; `page.tsx` = no new errors (only pre-existing `next/*` env gaps); SSR render harness = **3/3** (panel renders unchanged with the new optional prop). Dual-theme render `orbitiq-v7.222-RENDER.html`.

## v7.221 — 2026-06-16 · Journeys panel rebuilt from the canonical clusters (count + map now reconcile to the Cluster panel)

**The ask (Wayne):** v7.220 didn't move the number — the Journeys panel still showed **617** "Topics in journey" vs the Cluster panel's **2,514**. The journey should equal the cluster count.

**Root cause (the real one):** once a deep journey exists, the Journeys panel renders in *demand mode*, where "Topics in journey" = `graph.plan.total` from `buildTopicJourneyGraph` (`lib/journey/graph.ts`) — the count of **demand-universe journey step-nodes**, a different model from the canonical cluster topics. v7.211's "one node per cluster" reconciliation only applied in *footprint mode*; demand mode bypassed it entirely. So v7.220 (which rewired the canonical builder) never touched the number on screen.

**Fix (`components/brief/JourneySection.tsx`):** when canonical cluster topics are present (always, after an analysis), the panel now renders a new `CanonicalJourneyView` instead of the demand-universe graph:

- **Count reconciles.** "Topics in journey" = the canonical cluster topic count (= the Cluster panel's). Existing/optimize vs net-new/build is split per cluster (client-ranked or has a page → optimise; else build), with the pre/product breakdown.
- **Map rebuilt as a scalable, collapsible category list.** A flat node map can't legibly show thousands of clusters (one funnel column would be ~130k px tall), so the journey map is now a collapsible parent-category list grouped into the two lanes (Product · solution-aware / Pre-product · problem-aware) — the same shape the Cluster panel uses to stay navigable at scale. Expand a category to see its topics with stage, volume, keyword count, and an Existing/Build badge.
- The demand-universe `buildTopicJourneyGraph` view remains only as the legacy fallback when no canonical topics exist. The deep journey still backfills *into* the clusters this reads, so its demand is included — nothing is lost.

Data sourcing unchanged (every number is a real roll-up of the cluster topics; Const I). Colors reuse existing journey tokens (lane accents, stage labels, state badges) legible in both themes (Const IV.6).

**Verification (own debugging agent):** isolated `tsc` = **0 errors**; SSR harness = **7/7** — "Topics in journey" reconciles to the canonical topic count (7 = 7), the canonical branch is active (not demand/footprint), both lanes render, parent categories group correctly, optimize/build split shows. Dual-theme render `orbitiq-v7.221-RENDER.html`.

**Note:** verified structurally on synthetic data (the journey now counts the same canonical topics the Cluster panel does). On your live project the "Topics in journey" figure should now equal the Cluster panel's 2,514 after you redeploy — no deep-journey rebuild needed.

## v7.220 — 2026-06-16 · Journey & Content topic counts reconcile to the Cluster panel (one intent map, Const II.7)

**The ask (Wayne):** the Journeys panel showed **617** "Topics in journey" while the Cluster panel showed **2,514** total clusters. Journeys (and the Content panels) should be in sync with the clusters — every cluster is one journey topic.

**Root cause:** the Cluster panel builds clusters with its live Claude intent-assignment map (`claudeAssigns`), but `buildCanonicalClusterTopics` — the shared builder the Journey and both Content panels read — passed a hard-coded `{}` for that map. With the map, no-signal keywords split into their real per-intent topics; without it they collapsed into one. So the canonical views under-counted (617) versus the Cluster panel (2,514), breaking the single-source-of-truth rule (Const II.7).

**Fix:**

- `buildCanonicalClusterTopics` now accepts a `claudeAssigns` argument and threads it into `buildThemeClusters` (was hard-coded `{}`).
- The Claude intent pass is lifted to the page (`app/projects/[id]/page.tsx`) so the map is computed once, cached under the same key the Cluster panel uses, and runs regardless of which tab is open.
- That one map is passed into the Journey canonical build and as a `claudeAssigns` prop to `ThemeClustersPanel`, `ContentMapSection`, and `ContentPlanSection`, so all four panels build from identical inputs and their topic counts reconcile.
- `detectIntentSignal` / `IntentType` exported from `ThemeClustersPanel` for the page-level pass.

No data sourcing, taxonomy, scroll, progress, or styling changed (Const I, III, IV.1/2/4/5/6 unaffected) — this only unifies which intent map the existing builder uses.

**Verification (own debugging agent):** isolated `tsc` = **0 errors** on changed components; `page.tsx` = no new errors (only pre-existing `next/*` env gaps in the isolated build); reconciliation harness = **PASS** (canonical builder: 1 topic with `{}` → 3 with the map, deterministic); JourneySection SSR = **3/3**; dual-theme render regenerated (`orbitiq-v7.220-RENDER.html`).

**Note:** the live counts (617 / 2,514) come from Wayne's project database, which isn't in the build workspace — the fix is verified *structurally* (the canonical builder now uses the same intent map the Cluster panel does). The exact on-screen number should be confirmed in the running app after upload.

## v7.219 — 2026-06-16 · Topic Journeys — easier deselect after clicking a cluster

**The ask (Wayne):** after clicking a journey cluster there was no obvious way to deselect — the only exits were the small ×, the Esc key, or clicking empty canvas.

**Fix (`components/brief/JourneySection.tsx`, presentation only):**

- **Click the selected box again to close it.** In `TopicJourneyMap` a box's click now toggles: clicking the box that's already open clears the selection (and the overlay) instead of re-opening it. The hover tooltip on the open box reads "Click to close · …" so the affordance is discoverable.
- **Bigger, clearer close control.** The overlay's × is now a proper 26×26 bordered button with a faint surface fill and a "Close (Esc)" tooltip, instead of a bare 16px glyph — easy to see and tap.
- Background-click-to-clear and Esc still work as before.

No data, taxonomy, architecture, scroll, or progress logic touched (Const I–III, IV.1/2/4/5 unaffected). Close-button colors use defined tokens legible in both themes (Art. IV.6).

**Verification (own debugging agent):** isolated `tsc` = **0 errors**; jsdom/SSR harness = **3/3**; journey-adapter harness = **11/11**; dual-theme contrast assertion = **PASS**. Dual-theme render regenerated (`orbitiq-v7.219-RENDER.html`).

## v7.218 — 2026-06-16 · Topic Journeys — real topic names in the boxes + click-anchored detail overlay

**The ask (Wayne):** on the Topic Journeys panel the boxes just repeated the step facet ("What it is", "Why it matters", …) over and over — the column header already says that, so the box itself was empty of meaning. The boxes should carry the **actual topic name**. And clicking a box shouldn't make you scroll to the bottom of the page to read the detail — the detail should appear as an **overlay anchored directly under the box you clicked**. Both changes were rendered and approved in chat before build.

**Fix (`components/brief/JourneySection.tsx`, presentation only):**

- **Box title = the topic name.** In `TopicJourneyMap`, each step box now renders `n.topicLabel` (the AI-/title-cased topic name) instead of `STEP_LABEL[n.step]`. Read down a column to scan one topic across every stage; the column header still names the stage, so nothing is lost. The title is truncated to fit the box with the full label on hover (`<title>`). No data sourcing changed — the label is the same real topic label already carried on the node (Const I.1/I.2 unaffected).
- **Click detail is now an anchored overlay.** The per-topic `GraphDetail` (keywords, coverage, why-it-connects, page CTA) used to render in a panel at the bottom of the page, which forced a scroll and looked like nothing happened on click. It now renders as an absolutely-positioned popover **directly beneath the clicked box** inside the map (a `position:relative` wrapper measures the rendered SVG width so screen-px = viewBox-coord × width/W; the card is clamped to stay on-canvas, with a small caret). New optional `anchored` prop on `GraphDetail` drops the top margin and adds the popover shadow. The bottom panel + its `scrollIntoView` for the demand view were removed; the footprint-mode `DetailPanel` (and its scroll) are unchanged. Click outside or the card's × closes it; Esc still clears.
- **Incidental theme-parity fix (Art. IV.6).** The box's volume/keyword sub-line referenced `var(--c-7a7aa0)`, a token that is **undefined in both themes** (no fallback → defaulted to black, near-invisible on the dark node surface). Since it sits in the box being restyled, it was swapped to the defined `var(--c-8080a0)` (legible on both themes).

No data, taxonomy, architecture, scroll-container, or progress logic touched — Const Articles I–III and IV.1/IV.2/IV.4/IV.5 unaffected.

**Theme-parity (Art. IV.6 / V.5):** every color in the touched boxes + overlay was resolved in **both** themes and contrast-checked against its surface (box title 13.7/17.5, vol-kw 5.0/8.2, overlay heading 14.3/17.5, body 6.3/8.2, accents all ≥2.0) — parity assertion **PASS**. Dual-theme render regenerated (`orbitiq-v7.218-RENDER.html`) showing the new box titles and the anchored overlay in dark + light.

**Verification (own debugging agent):** isolated `tsc` = **0 errors**; jsdom/SSR harness = **3/3**; journey-adapter harness = **11/11**; theme-parity contrast assertion = **PASS** (both themes). Rendered in both light and dark before packaging.

## v7.217 — 2026-06-16 · Re-release of the v7.216 connector fix (deploy hygiene)

**Why this exists:** v7.216 was built and verified correctly but never reached production — Vercel's newest deployment was still v7.215 (confirmed in the Vercel dashboard: latest production build = v7.215, no v7.216 deployment ever appeared), so the v7.216 file changes weren't in the committed/pushed code. A prior version's zip is never overwritten (Const VI.3), so this re-release bumps the version to v7.217 to produce a clean new deployment row.

**Code:** identical to v7.216 — the one continuous SVG neck connector (rounded corners, rounded mouth, hollow opening, drawn from measured rects) and the share-of-volume moved to the far right of the detail card. No component logic changed from v7.216; only `package.json` version + this changelog entry.

**Deploy note (for upload):** copy the **contents** of the `orbitiq-v7.217/` folder into the repo root (replacing files) — do not commit the `orbitiq-v7.217/` folder nested inside the repo. Before committing in GitHub Desktop, confirm `components/brief/AudienceSegmentsSection.tsx` shows as changed; that's the file that drives the UI. After push, a v7.217 row should appear in Vercel.

**Verification:** isolated `tsc` = 0 errors; jsdom/SSR + geometry harness = 15/15 (re-run on the unchanged component); dual-theme render regenerated.

## v7.216 — 2026-06-16 · Audience Segments — neck connector redrawn as one continuous outline + share % moved

**The ask (Wayne):** the v7.215 connector didn't match the approved mockup — there were hairlines crossing the mouth, the facing corners were squared, and the mouth corners were sharp. It should be one continuous shape: rounded outer corners, a rounded (filleted) mouth, and a truly hollow opening. Also move the detail card's share-of-volume to the far right. Corrected version rendered and approved in chat before build.

**Root cause of the v7.215 miss:** the connector was faked with CSS border-stubs + a `var(--card)` cover strip. The cover only spanned the inner 1px of the 2px border, so a hairline showed through the mouth; and `lg:rounded-b-none` / `lg:rounded-t-none` squared the facing corners. Border-stubs also can't round the mouth shoulders.

**Fix (`components/brief/AudienceSegmentsSection.tsx`, presentation + layout only):**

- **One measured SVG outline.** New exported `buildNeckPath(A, B, r, fr, mh)` returns a single closed path: the active card as a rounded rect whose bottom edge opens in the middle, rounded throat fillets, two walls across the gap, then the rounded detail card — the same geometry as the approved chat mockup. `neckParams(A, B)` clamps the corner radius, mouth fillet, and mouth half-width to the measured throat/column so the curve never self-overlaps. The component measures both card rects (`getBoundingClientRect`, via a `ResizeObserver` + resize listener, re-run on segment change) and renders the path with `fill: var(--card)` + a 2px segment-accent stroke. When connected, the active card and the detail card set their own background + border to transparent so the SVG provides the fill **and** the outline — no doubled lines, no hairline, fully rounded corners and mouth. The old border-stub spans and the `rounded-b/t-none` squaring are gone; corners stay rounded.
- **Graceful fallback.** The neck draws only at `lg` when the active card is in the last grid row (directly above the full-width detail). On mobile / before measurement / SSR, the cards keep their own rounded 2px accent border and normal background — so the section is always correct without JS.
- **Share-of-volume moved.** In the merged detail card it now sits in a full-width header row, pinned to the **far right**, with the segment label + YoY growth on the left. Below it, the two columns are unchanged (portrait + name + quote left; Trigger + Influencer/Gatekeeper right).

No data, taxonomy, scroll, or progress logic touched — Constitution Articles I–III and IV.1/IV.2/IV.4/IV.5 unaffected.

**Theme-parity note (Art. IV.6):** unchanged from v7.215 — the active "who they are" copy uses the adaptive `text-orbit-primary` token (legible on both themes); the segment accent (`#22d3ee` etc.) is the component's existing fixed accent hue, vivid on dark and fainter on the white light card. Both themes rendered before packaging (`orbitiq-v7.216-RENDER.html` measures and draws the real neck on open). Open item for Wayne still stands: darken the light-mode segment accent for stronger outline contrast, or keep the current hue.

**Verification (own debugging agent):** isolated `tsc` = **0 errors**; jsdom/SSR + geometry harness = **15/15** — SSR content (active who-they-are primary token; inactive muted+clamped; no repeated "Who They Are"; Trigger + Influencer; quote; share-of-volume present; rounded accent-border fallback on both cards; neck wrapper mounts), **plus** unit tests of the new geometry (closed path; 12 rounded joins = 8 outer corners + 4 mouth fillets; `neckParams` sane for a normal throat and clamped for a tight one; mouth opens symmetrically about the active-card centre). Rendered in both light and dark mode before packaging.

## v7.215 — 2026-06-16 · Audience Segments — selected card opens into the detail (neck connector) + restructured detail

**The ask (Wayne):** replace the v7.213 caret bridge. The selected summary card should keep its rounded outline, but its bottom edge opens in the middle and a straight vertical neck drops down to fuse into the detail card below, so the two read as one continuous shape. On activation, move the "Who they are" copy up into the selected card (in white); restructure the detail's top card into two columns — portrait + quote on the left, Trigger + Influencer/Gatekeeper stacked on the right — and drop the now-duplicated "Who they are" from the detail. Mouth size iterated and approved in chat (render v6) before build.

**What changed (`components/brief/AudienceSegmentsSection.tsx`, presentation + layout only):**

- **Neck connector replaces the caret.** The active summary card now carries a full 2px segment-accent border, squares its bottom corners at `lg` (`lg:rounded-b-none`), and opens a mouth in the centre of its bottom edge (the inner 60% of the card, `left-[20%] right-[20%]`, painted with `var(--card)`). Two short accent walls drop from the mouth shoulders (`-bottom-[13px]`, `h-[14px]`) into the detail card. The detail's merged top card carries the matching full accent border, squares its top corners (`lg:rounded-t-none`), and paints over its own top border directly beneath the active column so the opening reads through. Alignment is pure CSS `calc` off the `lg:grid-cols-3` track (column centre `colCenterLeft`, mouth width `(100% - 24px) / 5`) — no runtime measurement, so it renders identically in SSR and the browser. The neck is `hidden lg:block` and is only drawn when the active card sits in the last grid row (directly above the full-width detail); the stacked mobile layout is unchanged. The old caret bridge and the `ring`/`border-top` treatment are removed.
- **"Who they are" moves to the active card, in an adaptive token.** The summary card's demographics line is now `text-orbit-primary` when the card is active (near-white on dark, near-black on light — legible in **both** themes per Art. IV.6; literal white was deliberately avoided) and `text-orbit-secondary line-clamp-3` when inactive, so non-active cards stay muted.
- **Detail top card restructured into two columns.** The old hero header and the separate "Who they are" card are merged into one accent-bordered card: left column = portrait + name + the audience quote; right column = Trigger above the Influencer / Gatekeeper box. The "Who they are" demographics paragraph is removed from the detail (it now lives on the active card). Touchpoints, prompt sets, and the strategy row below are unchanged.

No data, taxonomy, scroll, or progress logic touched — Constitution Articles I–III and IV.1/IV.2/IV.4/IV.5 unaffected.

**Theme-parity note (Art. IV.6):** the per-segment accent (`#22d3ee` / `#a78bfa` / `#fbbf24`) is a fixed hue the component already uses for accents in both themes; the new full-card outline + neck follow that existing system for continuity (Art. VII.3). The accent reads vividly on dark and is fainter (lower-contrast) on the white light-theme card — same behaviour as the existing accent borders/headings. The adaptive token swap was applied to the one new **text** element (the active "who they are" copy) so it never relies on a colour that vanishes on white. Both themes were rendered before packaging (`orbitiq-v7.215-RENDER.html`). Open item for Wayne: darken the light-mode segment accent for stronger outline contrast, or keep the current vivid hue — flagged, not silently changed.

**Verification (own debugging agent):** isolated `tsc` on the full component = **0 errors**; jsdom/SSR harness on the real component = **12/12** (renders; active who-they-are uses `text-orbit-primary`; inactive stay muted+clamped; "Who They Are" no longer repeated in the detail; Trigger + Influencer retained; quote retained; active card **and** merged detail both carry the full accent outline; neck walls + middle mouth present; detail-side mouth width aligned to the active column; facing corners squared at `lg`). Rendered in **both** light and dark mode before packaging.

## v7.214 — 2026-06-16 · Audience Segments headlines — light-mode contrast fix

**The ask (Wayne):** the v7.212 section headlines looked great in dark mode, but in light mode the headline text and the accent bar got lost on the white background.

**Note on versioning:** v7.213 (the selected-card "caret bridge", below) shipped in parallel. This release lands on top of it — it carries the caret bridge **and** this light-mode fix together.

**Root cause:** v7.212 used a fixed Tailwind color (`text-slate-200`) for the headline and fixed 400-level hues (`accent.bar` = `bg-cyan-400` / `bg-violet-400` / `bg-amber-400`) for the rail. Those are constant across themes — Tailwind `darkMode` isn't wired to the app's `[data-theme]` toggle; only the CSS-variable-backed `orbit-*` tokens adapt — so on the light theme's white card the light-gray text and pale rail washed out.

**Fix (`components/brief/AudienceSegmentsSection.tsx`, styling only):**

- **Headline text → adaptive token.** `text-slate-200` → `text-orbit-primary`: near-white (rgb 240 240 255) in dark, near-black (rgb 23 24 43) in light — readable on both card backgrounds.
- **Accent rail → adaptive per-segment token.** Added a `rail` field to each `SEGMENT_ACCENTS` entry (`bg-orbit-cyan`, `bg-orbit-accent`, `bg-orbit-amber`); `SectionLabel` now uses `accent.rail` instead of `accent.bar`. These follow `[data-theme]`, resolving to the deliberately darkened light-theme values (cyan rgb 6 179 208, indigo rgb 9 0 156, amber rgb 206 132 8) that hold contrast on white, while staying vivid in dark. The original `bar` token is left untouched — still used by the v7.213 caret bridge.

No data / taxonomy / scroll / progress logic touched — Const I–IV unaffected.

**Verification (own debugging agent):** isolated `tsc` on the full component (caret bridge + this fix) = **0 errors**; jsdom harness on the real `SectionLabel` + `SEGMENT_ACCENTS` = **6/6** (headline uses `text-orbit-primary` not `text-slate-200`; rails resolve to `bg-orbit-cyan` / `bg-orbit-accent` / `bg-orbit-amber`; icon rows still render no rail with the adaptive title). Rendered side-by-side with the real light + dark token values before packaging.

## v7.213 — 2026-06-16 · Audience Segments — selected card flows into its detail panel

**The ask (Wayne):** on the Audience panel, when you select a persona card the detail box below already updates — make the two visually connect so the selected card flows into the connected detail box beneath it. Chosen direction: Concept 1 (caret bridge), rendered and approved in chat before build.

**What changed (`components/brief/AudienceSegmentsSection.tsx`, presentation only):**

- **Selected card docks downward.** The active card now squares its bottom corners at the `lg` breakpoint (`lg:rounded-b-none`) and drops a small segment-colored caret (rotated square, `accent.bar` → cyan / violet / amber) from its bottom-center, pointing into the detail panel below. The caret is `hidden lg:block` so it only appears when the three cards sit in a row; the stacked mobile layout is unchanged.
- **Detail hero receives the connection.** The detail panel's hero header gains a 2px accent top border in the selected segment's color (`border-t-2`, `borderTopColor: accent.hex`) and squares its top corners at `lg` (`lg:rounded-t-none`), so the card above and the box below read as one continuous shape in the segment's accent.
- **Stacking fix.** The cards grid gets `relative z-10` so the caret paints above the detail panel's top border rather than behind it.
- **Palette addition.** Each `SEGMENT_ACCENTS` entry gains a `hex` value (cyan `#22d3ee`, violet `#a78bfa`, amber `#fbbf24`) used for the inline top-border color.

No data, taxonomy, scroll, or progress logic touched — Constitution Articles I–IV unaffected. Verified: isolated `tsc` = 0 errors; jsdom/SSR harness on the real component = 9/9 (exactly one caret on the active card, accent top border `#22d3ee`, squared corners, stacking context, all three segments render).

## v7.212 — 2026-06-16 · Audience Segments — readable section headlines

**The ask (Wayne):** style the card headlines in the Audience Segments view (Who They Are, Touchpoints by Journey Stage, Pre-Product LLM Prompts, etc.) — make them more readable and larger. Chosen direction: Option B (accent bar), on the main card titles only — not on the Trigger sub-label.

**What changed (`components/brief/AudienceSegmentsSection.tsx`, presentation only):**

- **`SectionLabel` restyled.** Bumped from `text-[10px]` dim `text-orbit-tertiary` to `text-[12.5px] font-bold text-slate-200` with tighter `tracking-[0.07em]` — larger and brighter while keeping the app's uppercase eyebrow language. Now a flex row so an optional leading accent bar can sit inline.
- **Per-segment accent bar.** New optional `accent` prop renders a 3px×14px segment-colored bar (`accent.bar` → cyan / violet / amber by segment) before the title. Passed to the four main headlines: Who They Are, Touchpoints by Journey Stage, Pre-Product LLM Prompts, Product-Stage Search Prompts.
- **Icon rows unchanged in structure.** Messaging & Tone, Creative & Imagery Direction, and Channel Approach already lead with a colored Tabler icon; they get the larger/brighter title via `bar={false}` (no double marker).
- **Sub-labels untouched.** The inline Trigger and Influencer / Gatekeeper Role labels keep their existing small style per Wayne's instruction.

**Data integrity:** purely a styling change — no data, calculation, source, or taxonomy logic touched (Const I/II/III unaffected). No panel scroll structure changed (Const IV.1 unaffected); no new waits introduced (IV.2 unaffected).

**Verification (own debugging agent):** isolated `tsc` on `AudienceSegmentsSection.tsx` = **0 errors**. jsdom `renderToStaticMarkup` harness on the REAL extracted `SectionLabel` + `SEGMENT_ACCENTS` = **8/8**: main label renders larger (`text-[12.5px] font-bold`) and brighter (`text-slate-200`); cyan bar on segment 1, violet bar on segment 2 (bar tracks segment color); bar is `aria-hidden`; `bar={false}` icon rows render NO accent bar but keep the larger/brighter title. Change rendered before packaging (Const V.2).

## v7.211 — 2026-06-15 · Reconciliation — Journey = one node per cluster

**The ask (Wayne):** finish option A — the Journey should show one node per cluster so "Topics in journey" reconciles to the cluster count (it read 617 while the Cluster panel had ~2514). Wayne chose one node per cluster (accepting a denser graph).

**What changed:**

- **Canonical topics → the Journey (`app/projects/[id]/page.tsx`).** The page now builds the canonical cluster topics once (via `buildCanonicalClusterTopics`, the same source the Cluster panel and Content plan use) and passes them to `JourneySection` as a new `canonicalTopics` prop. Done at the page level because `ThemeClustersPanel` imports `JourneySection`, so the Journey can't import the builder back — the page is the cycle-free seam. The page fetches the project keywords once for this.
- **One node per cluster (`components/brief/JourneySection.tsx`).** New `nodesFromCanonical(topics)` adapter maps each canonical cluster to exactly one journey node (lane from product vs problem; stage → funnel column; state existing/competitor/missing from the cluster's own ranking + gap signals; volumes and keyword list carried through). When `canonicalTopics` are supplied they drive `preNodes`/`prodNodes`, so the "Topics in journey" count, the completeness roll-ups and the mind-map all reflect the cluster count. The empty-state gate now also recognises canonical topics.
- **Performance guard.** The within-theme edge mesh is O(n²); above `MAX_EDGE_MESH_NODES` (300) the journey renders nodes with no mesh (the funnel columns still read left→right) rather than hang. Nodes themselves are never capped — every cluster shows.

**Data integrity:** the Journey is now a view over the same canonical cluster list as the Cluster panel and Content plan (Const II.7) — one node per cluster, one cluster per node, no fork. Volumes are the clusters' real keyword volumes.

**Verification (own debugging agent):** isolated `tsc` on `JourneySection` + `ThemeClustersPanel` + `ContentPlanSection` + `ContentMapSection` + `contentPlan` = **0 errors**. Adapter harness on the REAL `nodesFromCanonical` + edge guard = **11/11**: one node per cluster (count parity), correct lane split, existing/competitor/missing states, stage→column, keywords carried; **1200 clusters → 1200 nodes in <500 ms** (O(n), no hang) and the edge mesh is correctly skipped above the threshold. jsdom `renderToString` of the REAL `JourneySection` with `canonicalTopics` = **3/3**: renders, shows "Topics in journey", count reflects the canonical clusters.

**Live-data caveat (please eyeball after deploy):** the anti-hang guards are verified, but the *visual density* of a mind-map with thousands of nodes can only be judged on your real project. If it's too dense to read, the natural next step is a per-theme collapse on the Journey (same pattern as the v7.207 cluster headers) — tell me and I'll add it.

**Reconciliation complete:** Cluster panel, Content plan, Content map and Journey now all derive from the one canonical cluster list (1 cluster = 1 intent = 1 page = 1 journey node).

## v7.210 — 2026-06-15 · Reconciliation — Content plan = one page per cluster (Const III.5)

**The ask (Wayne):** the cluster count (2514), Journey (617) and Content plan (323) didn't agree, but the Constitution says one cluster = one intent = one page (III.4/III.5). Root cause: three separate builders over two different sources — the Cluster panel builds from the keyword pool; the Journey and Content plan each build their own buckets from the demand universe. Wayne chose option A (refined clusters as the single source of truth) and confirmed: Content plan should list one page per cluster (total rises from 323 toward the cluster count), and the Journey should show one node per cluster.

**This release (Content reconciliation):**

- **Canonical source (`components/brief/ThemeClustersPanel.tsx`).** New exported `buildCanonicalClusterTopics(...)` — a thin wrapper over the panel's existing `buildPreProductClusters` + `buildThemeClusters` + `flattenTopics` (zero change to those proven builders). `flattenTopics` already emits exactly one topic per intent group (= one page), so this IS the canonical "one cluster = one intent = one page" list. AI-refined synonym merges flow in automatically when the snapshot carries `_categoryBreakdown.intentGroups`.
- **One page per cluster (`lib/journey/contentPlan.ts`).** New pure `buildContentPlanFromTopics(topics)` builds exactly one `ContentTopic` per canonical cluster: state = existing (client ranks / has a page) vs competitor vs missing; action = optimize vs build; priority/quick-win/refresh from stage + demand; brief templated from the cluster's own keywords; internal links = sibling clusters in the same theme. Takes a local `CanonicalTopicInput` interface so the lib never imports the client component (no import cycle).
- **Consumers (`ContentPlanSection.tsx` + `ContentMapSection.tsx`).** Both now build the plan from `buildContentPlanFromTopics(buildCanonicalClusterTopics(...))` instead of the demand-universe-only `planFromSnapshot` (kept as the fallback when no clusters exist). Result: the Content plan and Content map totals reconcile to the cluster count — every cluster maps to exactly one page.

**Data integrity:** the plan is now a recomputed VIEW over the one canonical cluster pool (Const II.7) — no forked topic set. Volumes are exact roll-ups of the clusters' real keyword volumes (verified: plan total volume === sum of cluster volumes). Every cluster maps to exactly one page, no loss or duplication (Art I.3). No caps (Art I.6).

**Verification (own debugging agent):** isolated `tsc` on `ThemeClustersPanel` + `contentPlan` + `ContentPlanSection` + `ContentMapSection` = **0 errors**. Reconciliation harness on the REAL `buildCanonicalClusterTopics` + `buildContentPlanFromTopics` = **8/8**: 1 page per cluster (plan.topics.length === cluster count), scope.total === cluster count, existing + net-new === total, every cluster maps to exactly one page (no loss/dup), URL-backed clusters = optimize, plan total volume === exact sum of cluster volumes. jsdom `renderToString` of the REAL `ContentExplorer` on the cluster-based plan = **3/3** (renders, shows the reconciled total + existing/net-new split).

**Scope note (Journey → v7.211):** Wayne also chose one node per cluster for the Journey. That requires breaking the `ThemeClustersPanel ↔ JourneySection` import cycle (extracting the canonical builder + the journey classifier into neutral libs) and a live-data check that a dense per-cluster graph renders/performs acceptably — so it ships as its own verified release. After v7.211 the Cluster panel, Content plan, Content map AND Journey all reconcile to the same count.

## v7.209 — 2026-06-15 · Brand rule — AI suggests competitor brands to exclude

**The ask (Wayne):** the second half of the v7.208 decision — "auto AI-flag" the competitor/third-party brands so you don't have to spot every one yourself.

**Approach:** mirror the proven client brand-vocabulary suggester (v7.206), inverted. An AI pass scans the client's real footprint + competitor-gap keywords and proposes the NON-client brand names that appear (e.g. "schwab", "vanguard", "fidelity"). It's a **suggestion you review** — it pre-fills the v7.208 blocklist, which is what actually enforces removal. AI only NAMES brands it finds; it never invents a keyword or a number, never auto-applies, and never proposes the client's own brand. (This is the cost-controlled, review-first form of "auto-flag", consistent with the app's existing "✦ Suggest with AI" pattern; a fully automatic on-analysis pass remains an option if you want it.)

**What changed:**

- **AI helper (`lib/claude/excludedBrandVocab.ts`, NEW).** `suggestExcludedBrands({ clientName, domain, competitorDomains, sampleKeywords })` → de-duped lowercase list of non-client brand terms found in the sample. Strict-JSON parse; failures return `[]` (never blocks). Mirrors `brandVocab.ts` exactly (same model, same guard rails), inverted to find competitors instead of the client.
- **Route (`app/api/projects/[id]/excluded-brands/suggest/route.ts`, NEW).** POST grounds the scan in the latest snapshot's `topKeywords` + `gapKeywords` and the tracked competitor domains, returns `{ excludedBrands }`; does not persist. Mirrors `brand-terms/suggest`.
- **Manager (`components/brief/CompetitorsModal.tsx`).** The Excluded Competitor / Brand Terms section gains a "✦ Suggest with AI" button (scans, then drops the proposals into the editable chips for review) with its own scanning state + error line. You still click Save to commit — review-first.

**Data integrity:** suggestions are candidates only, never auto-applied; the deterministic v7.208 blocklist remains the enforcement layer (Art I). The client's own brand is excluded from suggestions. No caps (Art I.6).

**Verification (own debugging agent):** isolated `tsc` on `CompetitorsModal` + `ThemeClustersPanel` + `contentPlan` + `JourneySection` + `kwVolume` = **0 errors**. The two new server files (`excludedBrandVocab.ts`, `excluded-brands/suggest/route.ts`) parse clean under esbuild; their `@anthropic-ai/sdk` / next deps are absent from the isolated verify env but they mirror the proven v7.206 suggester byte-for-pattern. jsdom `renderToString` of the REAL `CompetitorsModal` = **6/6**: now shows TWO "Suggest with AI" CTAs (client brand + excluded brands), the blocklist section, chips, and Save all render; existing brand section intact. **Live-data note:** the AI suggestion quality itself is exercised at runtime against the real ANTHROPIC_API_KEY — the deterministic v7.208 blocklist is the safety net regardless of what the AI proposes.

**Scope note:** count reconciliation (option A — refined clusters as the single source of truth for journey + content plan) follows as v7.210.

## v7.208 — 2026-06-15 · Brand rule — editable competitor-brand blocklist, honored everywhere

**The ask (Wayne):** competitor/third-party brand terms (e.g. "Schwab") must NOT exist in keywords or clusters — a hard rule, whether the term came from a CSV upload or not (Constitution III.1). v7.201 already stripped brands that were configured competitors / Semrush auto-discovered / AI-flagged, but documented a gap: a brand that is none of those (Schwab isn't a tracked competitor here) slips through, even from an upload — and the Content Map / Journey panels had their own separate brand filters.

**Decision (Wayne):** editable blocklist + auto AI-flag. This release ships the **editable blocklist** — the deterministic safety net that fully enforces the rule. (The auto AI-flag, which pre-populates suspected brands during analysis, is a server/AI-pipeline change that needs verification against live data; it follows as v7.209.)

**What changed:**

- **Single source of truth (`lib/utils/kwVolume.ts`).** New `buildExcludedBrandTokens(snap, explicit)` (normalises terms: lowercase, strip non-alphanumerics, ≥3 chars) and `filterUniverseExcludedBrands(universe, snap)`. In `buildKwPool`, `isExcludedBrand(kw)` = term match AND not the client's own brand (guarded by `clientDomain` + `_brandTerms`); folded into the skip at every pool site — §1 client-ranked, §2 client uploads, §3 crawl gaps, §4 uploaded gaps, and §5 demand (via `dropCompetitorBrand`). So the Keyword and Cluster pools drop blocklisted brands no matter the source.
- **Cluster names (`components/brief/ThemeClustersPanel.tsx`).** Drops any cluster whose NAME carries a blocklisted brand (mirrors the v7.201 competitor-name drop), so a procedure-typed "529 Schwab" can't survive.
- **Demand lens (`lib/journey/contentPlan.ts` + `components/brief/JourneySection.tsx`).** Both now run the demand universe through `filterUniverseExcludedBrands` before building nodes — closing the v7.201 OPEN item (these panels read `_demandUniverse`, not `buildKwPool`). The Journey "Topics in journey" count and every Content-plan page now honor the rule too.
- **Storage (`db/schema.ts` + `app/api/projects/[id]/route.ts`).** New `excluded_brands` (jsonb) + `excluded_brands_updated_at`, auto-migrated at runtime via the existing `ADD COLUMN IF NOT EXISTS` pattern (no manual `db:push`). PATCH normalises (lowercase/trim/de-dupe) and stamps the edit time.
- **Editable manager (`app/projects/[id]/page.tsx` + `components/brief/CompetitorsModal.tsx`).** `project.excludedBrands` is injected onto the snapshot as `_excludedBrands` (same one-injection pattern as `_brandTerms`), so every panel shares one list (Art II.7). A new "Excluded Competitor / Brand Terms" section in the Competitors/upload modal: add/remove chips, Save, last-updated label (Art IV.5) — the action lives where the data lives (Art IV.4). Saving refetches the project so all panels recompute live.

**Data integrity:** the blocklist only REMOVES (never fabricates); the client's own brand is never stripped (guarded everywhere). Counts stay exact roll-ups of the remaining real rows (Art I). No caps introduced (Art I.6). Works on already-stored analyses with no re-run.

**Verification (own debugging agent):** isolated `tsc` on `kwVolume` + `ThemeClustersPanel` + `contentPlan` + `JourneySection` = **0 errors**. Behavioural harness on the REAL `buildKwPool` + `filterUniverseExcludedBrands` = **12/12**: blocklisting "schwab"+"vanguard" drops them across client-ranked / gap / demand and from the universe, while keeping generic terms, the client's OWN brand, and non-brand demand; empty list is a verified no-op; client-brand GUARD holds (a `schwab.com` client keeps its own brand even when "schwab" is excluded); term normalisation correct. jsdom `renderToString` of the REAL `CompetitorsModal` = **8/8**: the new blocklist section, chips, Save CTA, input, and last-updated label render; the existing brand section is intact. (API/schema/page edits mirror the proven v7.206 brand-terms pattern; their next/zod/drizzle deps are absent from the isolated verify env.)

**Scope note:** the auto AI-flag half of Wayne's choice ships next as v7.209 (auto-suggest competitor brands during analysis — server/AI change, verify vs real data). Count reconciliation (option A) follows as v7.210.

## v7.207 — 2026-06-15 · Clusters — collapsible parent-category navigation (default collapsed)

**The ask (Wayne):** on the Cluster panel, make the parent topic header rows collapsible/expandable so you can navigate the list easily, and start with every parent collapsed until you expand it.

**What changed:**

- **Collapsible parent headers (`components/brief/ThemeClustersPanel.tsx`, grouped `TopicTable`).** Each parent-category header row is now a toggle: click it (or its chevron) to expand/collapse its child topic rows. State is tracked as `expandedParents` (a Set of expanded parent names); the default is an **empty set, so every parent starts collapsed** and the grouped list reads as a tidy index you drill into. Header rows always render (with their topic count + monthly volume); child rows render only when their parent is expanded.
- **Chevron affordance.** Collapsed parent shows `ti-chevron-right`, expanded shows `ti-chevron-down`, tinted to the category's own type colour. The header carries `aria-expanded` for assistive tech.
- **Expand all / Collapse all.** A small control above the grouped table toggles every parent at once and shows "{N} categories · {k} expanded", so navigating a large taxonomy (e.g. 270 categories) is one click either way. Only shown in the grouped (Theme · product) sort, where parent headers exist.

**Scope note:** this release is the UI/navigation change only. Two related data-pipeline items Wayne raised in the same review — the global no-competitor-brand rule (e.g. "Schwab") and reconciling the cluster count with the journey + content-plan counts (1 cluster = 1 intent = 1 page) — change the numbers in CMO-facing briefs and will ship as their own verified releases (v7.208, v7.209), per Art I (data integrity) and Art V.4 (high-stakes independent verification against real data).

**Data integrity:** no data touched — collapse is presentation-only. Counts, volumes, and roll-ups are byte-for-byte unchanged (Art I). No caps introduced (Art I.6).

**Verification (own debugging agent):** isolated `tsc` on `ThemeClustersPanel.tsx` + its resolvable deps (`kwVolume`, `JourneySection`) = **0 errors**. jsdom `renderToString` of the real `TopicTable` = **9/9**: both parent headers render while collapsed, all child rows hidden by default, collapsed header shows the right chevron; expanding one parent reveals only its children (other parent stays collapsed) and flips that header to the down chevron. Panel-scroll invariant (Art IV.1) confirmed intact — the collapse control and table remain children of the existing `flex-1 overflowY:auto` root; no nested scroll added. Render: `orbitiq-v7.207-RENDER.html`.

## v7.206 — 2026-06-15 · Branded — editable, AI-seeded client brand vocabulary (all clients)

**The ask (Wayne):** "branded" must mean the client's own brand terms (a subset — generic terms TD ranks for like "0 apr credit cards" are NOT branded), it must reflect the **actual CSV upload**, and the rule must work **for all clients** — not just TD. v7.205 fixed the 2-char "td" drop but still missed TD's real brand **variants** (Toronto-Dominion, EasyWeb, Ameritrade, tidi) because a domain string can't yield them.

**Decision (confirmed with Wayne):** branded = brand-name match against a per-client **brand vocabulary**, **AI-seeded and editable**, **stored on the project** (so it survives re-analysis), edited in the same Competitors/upload manager where files are added.

**What changed:**

- **Matcher — brand vocabulary (`lib/utils/kwVolume.ts` `isBrandedKeyword`, mirrored in `ContentMapSection` + `JourneySection`).** Adds an optional `brandTerms[]`: multi-word terms ("toronto dominion") match as whole phrases (punctuation/hyphen-insensitive, so "toronto-dominion" matches too); single-word terms fold into the v7.205 long/short token rules. The domain root stays an implicit member. Long-brand behaviour (e.g. Sonobello) is byte-for-byte unchanged.
- **Single source of truth (`buildKwPool`).** A new `brandTerms` option, **and** a fallback to `_brandTerms` carried on the snapshot. The page injects `project.brandTerms` onto the analysis snapshot once, so **every** panel's pool (Keyword, Cluster, Journey, Content Map) shares one vocabulary without threading the list through dozens of signatures (Art II.7).
- **Storage (`db/schema.ts` + `app/api/projects/[id]/route.ts`).** New `brand_terms` (jsonb) + `brand_terms_updated_at` on `projects`, auto-migrated at runtime via the existing `ensureColumns()` `ADD COLUMN IF NOT EXISTS` pattern — **no manual `db:push` required**. PATCH normalises (lowercase/trim/de-dupe) and stamps the edit time.
- **AI seed, on demand (`lib/claude/brandVocab.ts` + `app/api/projects/[id]/brand-terms/suggest`).** A "✦ Suggest with AI" action proposes the client's brand names/variants from the client name, domain, and the client's own ranked keywords (real data). It is a **suggestion the user reviews/edits** — never silently applied, never blocks analysis (failures return []).
- **Editable manager (`components/brief/CompetitorsModal.tsx`).** A "Branded Keyword Terms" section in the Competitors/upload modal: add/remove chips, Suggest with AI, Save, plus a **last-updated label** (Art IV.5) — the action lives where the data lives (Art IV.4). Saving refetches the project so all panels recompute live.

**Data integrity:** branded is brand-name match only; generic terms stay non-branded client footprint (Art III.1). Counts remain exact roll-ups of real rows; the AI output is an editable seed, not data presented as fact (Art I.1). No caps introduced (Art I.6).

**Verification (own debugging agent):** isolated `tsc` on all resolvable changed files (`kwVolume`, `semrush`, `KeywordsPanel`, `ThemeClustersPanel`, `JourneySection`, `ContentMapSection`, `CompetitorsModal`) = **0 errors** (API/page/`brandVocab` import deps absent from the verify env — they follow existing working route/page patterns; the one real issue, a missing `useMemo` import in `page.tsx`, was caught and fixed). Behavioural harness on the **real** `td-2400-more.csv` through the **real** `buildKwPool` = **17/17**: with the TD vocabulary branded = **243** (204 from "td" word-forms + 39 variants — toronto-dominion / easyweb / ameritrade / tidi now caught), generic terms (0 apr / definition / ebitda / inflation) still non-branded, **snapshot fallback == explicit option**, no-vocab path == v7.205, Sonobello regression intact. jsdom `renderToString` of the real `CompetitorsModal` = **7/7**: brand section, Suggest-with-AI + Save CTAs, last-updated label and brand chips all render; competitors section intact. Render: `orbitiq-v7.206-RENDER.html` (REAL client data, flagged).

## v7.205 — 2026-06-15 · Keywords — short client brand tokens now detected ("TD")

**The bug (Wayne):** the Keyword Landscape "Branded" card showed only **7** for a TD Bank project even though the uploaded footprint was full of TD-branded terms.

**Root cause (verified against the real upload `td-2400-more.csv`):** branded detection derived the client brand root from the domain — `extractBrand("td.com")` → `"td"` — and then **discarded every brand token shorter than 4 characters** (`isBrandedKeyword`'s `filter(b => b.length >= 4)`). With its only token thrown away, the client brand was undetectable, so "td bank", "td bank login", "tdbank", "mytdfinancing", etc. all came back **non-branded**. The 4-char guard exists to stop a 2-char token from false-matching the letters "td" inside unrelated words ("direc**t d**eposit", "accoun**t d**efinition", "ebi**td**a"), but it also killed legitimately short brands like TD. (The file holds **2,274 unique** keywords, of which **204** are genuinely TD-branded — the "2,274 branded" figure was the total unique count, not the branded subset; flagged to Wayne.)

**Decision (confirmed with Wayne):** *anything that is genuinely TD is branded* — including a mid-word compound like `mytdfinancing` — **while excluding the letter-coincidences** (`direct deposit`, `definition`, `ebitda`).

**The rule (short brand tokens, 2–3 chars — word boundary only, never the space-stripped substring):** a keyword is client-branded when, for some short token, (a) a **word starts** with the token (`td`, `td bank`, `tdbank`, `tdameritrade`), or (b) the token appears **mid-word with both residual segments ≥2 chars** (catches `mytdfinancing` = `my`|`financing`; rejects `ebitda` = `ebi`|`a`), or (c) the token is spelled with **letters spaced** (`t d bank`). **Long tokens (≥4 chars) are completely unchanged** — Sonobello and every existing client behave byte-for-byte as before.

**What changed (4 files, logic only — no JSX / layout / scroll changes):**

- `lib/utils/kwVolume.ts` — `isBrandedKeyword` split into a short-token (word-boundary) path and the original long-token (substring/prefix/fuzzy) path.
- `components/brief/ContentMapSection.tsx` and `components/brief/JourneySection.tsx` — the mirrored local `isBranded` copies updated to stay byte-identical.
- `lib/apis/semrush.ts` — `isClientBranded` (the gap-list client-brand strip) made short-token aware so a short client brand no longer leaks branded terms into the gap set.

**Data integrity:** detection only; every count is an exact roll-up of real source rows (Art I.1). No caps/limits introduced (Art I.6). Branded = the client's own brand, **labeled** (not removed) — Art III.1.

**Verification (own debugging agent):** isolated `tsc --noEmit` (strict, `@/*` paths) on all 4 changed files + their import graph (`KeywordsPanel`, `ThemeClustersPanel`, `JourneySection`, `kwVolume`, `semrush`) = **0 errors**. Behavioural harness (esbuild→cjs on the **real exported** `isBrandedKeyword` + `buildKwPool`) = **23/23**: every expected TD term branded, every coincidence (`direct deposit`/`definition`/`ebitda`) non-branded, Sonobello long-brand regression intact. Run through the **real** `buildKwPool` on the actual `td-2400-more.csv`: **204 branded** (was 0 from this file under old logic; the card's prior 7 came from the earlier auto-crawl footprint), `mytdfinancing` in, `ebitda`/`direct deposit` out, **0 false positives across all 2,274 keywords**. Panel-scroll invariant (Art IV.1) re-checked — touched files have no `overflow-*` and no JSX changes, scroll roots unchanged. Render: `orbitiq-v7.205-RENDER.html` (REAL client data, flagged).

## v7.204 — 2026-06-15 · Keywords — Journey scope toggle (All / Product / Pre-product)

**The ask (Wayne):** add the **same** Product journey / Pre-product journey / All journeys segmented control to the **Keyword panel**, placed **directly below the summary cards** — mirroring the v7.203 control on the Clusters panel.

**Decision / definition (unchanged from v7.203):** the split **reuses the Journey panel's classifier** (single source of truth, Art II.7) — no new heuristic. A keyword is **pre-product** only when it names *no* solution (a problem / symptom / life-trigger) yet is still topically relevant to the client; everything that names a procedure, the brand, or a location — plus off-topic noise — stays **product** (this panel shows the full footprint, so off-topic is kept in the product lane, exactly as the Clusters panel does). This is the solution-awareness rule `JourneySection.buildClusters` already applies; the product journey carries the full funnel and the pre-product journey is Awareness-only (Art III.2a).

**What changed (one file — `components/brief/KeywordsPanel.tsx`):**

- **Imports `buildJourneyClassifier`** from `JourneySection` — the *same* exported classifier the Clusters panel uses (added in v7.203). No new classification logic was written; the Keyword, Cluster, Journey and Content Map panels now all label a keyword identically.
- **The "Journey" segmented control** sits directly below the summary cards (Wayne's placement): **All journeys · Product journey · Pre-product journey**, each with its live keyword count and the same styling/colour tokens as the Clusters control (product = indigo `--c-9b96ff`, pre-product = emerald `--c-34d399`). Counts are computed on the **unscoped full footprint** on the same population as the "All Keywords" card, so *All journeys = All Keywords* and *Product + Pre = All* by construction.
- **Selecting a scope re-slices everything together:** the summary cards (`kwSummary`), the client rank distribution (`clientDist`), the competitor rank distribution (`competitorDist`), the keyword table (`segmentRows → visibleRows`, with pagination + exports) and the SERP-coverage line all recompute for the chosen journey. When scope = "All journeys" every derived value is byte-for-byte the previous behaviour (identity pass), so the default view is unchanged. Choosing a scope also resets the ownership + rank filters to "All" so you never land on an empty cross-filter. The competitor rank distribution, whose precomputed snapshot dists are *not* journey-aware, bypasses them when a scope is active and buckets from the real gap rows on the page (filtered by the same classifier) — keeping both sides journey-consistent.

**Data integrity:** the split is 100% the Journey panel's real, deterministic solution-awareness rule — nothing modeled or simulated. Every count/volume is an exact roll-up of real source rows; product and pre-product partition the pool with zero overlap (every keyword is pre-product or not). No caps/limits introduced (Art I.6).

**Verification (own debugging agent):** isolated `tsc --noEmit` on the changed file + its full local import graph (`JourneySection`, `lib/utils/kwVolume`, `lib/journey/graph`) under the project's strict compiler options (`strict`, `moduleResolution bundler`, `@/*` paths) = **0 errors**. jsdom render harness (esbuild→cjs on the REAL `KeywordsPanel` export, `react-dom/server`, synthetic cosmetic-surgery analysis with audience-segment vocab) = **all pass**: panel renders without throw; all three journey buttons present; the control sits **below** the "All Keywords" summary cards and **above** the Rank Distribution; the real shared classifier produces a genuine split (5 product · 2 pre-product) on the sample pool. Panel-scroll invariant (Art IV.1) re-checked — the scroll root (`flex-1 min-h-0 overflow-y-auto`) is unchanged, the new control is a `flexShrink:0` block child, and the file's `overflow-*` count is unchanged. Render: `orbitiq-v7.204-RENDER.html` (illustrative data, flagged).

## v7.203 — 2026-06-15 · Clusters — Journey scope toggle (All / Product / Pre-product)

**The ask (Wayne):** add a control below the summary cards to view the **Product journey**, the **Pre-product journey**, or **All journeys** — and have the summary cards and everything below adjust accordingly.

**Decision (confirmed with Wayne before building):** the product vs pre-product split **reuses the Journey panel's definition** (single source of truth) rather than inventing a new one. A keyword is **pre-product** only when it names *no* solution (a problem / symptom / life-trigger) yet is still topically relevant to the client; everything that names a procedure, the brand, or a location is **product**. This is exactly the solution-awareness rule `JourneySection.buildClusters` already applies. Per the Constitution (Art III.2a), the **product journey carries the full funnel** (Awareness→Consideration→Decision→Retention) and the **pre-product journey is Awareness-only** (problem/trigger searches — the user doesn't yet know the offering). Wayne also chose "everything reacts": cards, funnel-stage box, filter pills and the grid all recompute for the selected scope.

**What changed (two files — `components/brief/JourneySection.tsx` + `components/brief/ThemeClustersPanel.tsx`):**

- **New shared classifier (`JourneySection.buildJourneyClassifier`).** Exported, additive — it reuses the *same* helpers the canonical `buildClusters` uses (`deriveProblemVocab`, `buildProcWordsByCat`, `matchKeywordToCategory`, `namesSolutionFor`, `buildRelevanceTokens`, `isClientRelevant`, `deterministicProblemTheme`) and replicates `buildClusters`' assignment loop exactly, returning `'product' | 'pre-product' | 'offtopic'` per keyword plus the life-problem theme name. `buildClusters` itself is untouched, so the Journey & Content Map panels are unchanged. Verified the classifier matches `buildClusters`' own journey labels on every pooled keyword (8/8 parity).
- **Pre-product clusters in the Cluster panel.** A new `buildPreProductClusters` classifies the panel's *own* pooled keywords (footprint + deep-journey demand), peels the pre-product ones into life-problem themes (a new `type: 'problem'`, emerald, Awareness-only), and returns the set of peeled keywords. `buildThemeClusters` gained an `excludeKeywords` argument and drops those keywords from the product lane — so **a keyword is never counted in both lanes** (Art I.3; verified overlap = 0). Off-topic noise stays in the product lane (this panel shows the full footprint, Art I.6; the Journey panel's relevance gate is its own lens). `flattenTopics` forces `stage: 'awareness'` for `problem` clusters.
- **The "Journey" segmented control** sits directly below the summary cards: **All journeys · Product journey · Pre-product journey**, each with its live topic count. Selecting a scope slices the combined cluster list *before* the topics/cards/funnel/pills/grid are computed, so the entire panel recomputes. Choosing a scope also resets the ownership/stage filter to "All" so you never land on an empty cross-filter. Colors reuse defined tokens (product = indigo `--c-9b96ff`, pre-product = emerald `--c-34d399` / `--ca-52-211-153-0_2`).

**Data integrity:** the split is 100% the Journey panel's real, deterministic solution-awareness rule — no new heuristic, nothing modeled or simulated. Every count/volume is an exact roll-up of real source rows; pre-product and product partition the relevant pool with zero overlap. Note: pre-product theme **names** use the deterministic project-spec namer (AI problem-naming, when present, is the Journey panel's; the Cluster panel passes `{}` → deterministic names).

**Verification (own debugging agent):** isolated `tsc` on both changed files + their imports under the project's strict low-target guard (`target es5`, `downlevelIteration:false`, `strict`, `jsx react-jsx`, `@/*` paths) = **0 errors**. Behavioural harness (esbuild→cjs on the REAL exported functions, synthetic cosmetic-surgery analysis) = **16/16**: classifier⇄`buildClusters` parity 8/8, product/pre-product/off-topic each detected correctly, pre-product peeled into `problem` clusters, **no keyword in both lanes (overlap 0)**, pre-product topics all `awareness`, scope slices partition cleanly and counts add up. jsdom mount of the real `ClustersTab` (react-dom/client + act) = **10/10**: all three journey buttons render; clicking **Product** then **Pre-product** recomputes the topic count (All 6 = Product 4 + Pre 2), the pre-product view surfaces life-problem themes and hides the product "Breast Augmentation" cluster — proving the cards/grid react. Panel-scroll invariant (Art IV.1) re-checked: the scroll root (`flex:1; overflowY:auto`) is unchanged and the new control sits inside it. Render: `orbitiq-v7.203-RENDER.html` (illustrative data, flagged).

## v7.202 — 2026-06-15 · Clusters — funnel-stage box: full-height funnel, legend dots, hover affordance

**The ask (Wayne):** in the Clusters panel's "Clusters by funnel stage" card, (1) remove the header *"Clusters by funnel stage"* and its description line (*"Each cluster counted once · stage = its dominant intent · client ranks for most / gap = competitors own most · click to filter"*) so the funnel itself fills the full height of the box and reads larger — **without changing the box's outer size**; (2) add a small dot legend defining the colours (client / gap) in the upper-right corner; (3) add a hover state on each funnel band that signals it's clickable.

**What changed (one file — `components/brief/ThemeClustersPanel.tsx`; everything above the funnel block is byte-for-byte identical to v7.201):**

- **Header + description removed.** The "Clusters by funnel stage" title row and the explanatory sub-line are gone. The funnel-band column now stretches to the full box height: each band button is `flex: 1` (was a centred stack with `minHeight: 30`), so the four bands divide the available height evenly and read noticeably larger — band width `86 → 110`, stage label `11 → 14px`, the topic count `15 → 22px`, the client/gap/demand sub-line `9 → 11px`. The container's outer size is unchanged (still the third column of the same `1.15fr / 1fr / 1.2fr` grid, same border/radius/background).
- **Legend dots, upper-right.** A compact legend sits absolutely positioned in the box's top-right corner: a green dot = **client**, an amber dot = **gap**, and (only when a stage actually has demand clusters) a cyan dot = **demand**. This preserves the colour key that the removed description line used to carry, in a smaller footprint.
- **Clickable hover affordance.** Hovering a band now (a) draws a 1px focus ring + subtle border (`--ca-155-150-255-0_30`), (b) tints the row background (`--ca-155-150-255-0_04`), and (c) fades in a filter icon (`ti-filter`) on the right edge. Each band also carries a native `title="Click to filter by {stage}"` tooltip. The active (filtered) band keeps the ring/icon shown. Click behaviour is unchanged — toggle the grid filter by that dominant stage.

**Data integrity:** purely presentational. No metric, count, roll-up, or data path was touched — `stageRollups` (client/gap/demand cluster counts and annual volume per stage) is computed exactly as before over the same real keyword pool. Nothing modeled or simulated; the render harness used illustrative numbers only to exercise the markup.

**Verification (own debugging agent):** isolated `tsc` on the changed file + its one local dep (`lib/utils/kwVolume.ts`) under the project's strict low-target guard (`target es5`, `downlevelIteration:false`, `strict`) = **0 errors**. Static render harness (esbuild→cjs, real funnel JSX extracted from the file, synthetic stage data) = **12/12**: header/description gone, legend client+gap dots present, exactly 4 clip-path bands, 4 filter icons, all four stage labels + totals render, `title` tooltip present, band width enlarged to 110. jsdom hover/click harness = **7/7**: 4 clickable band buttons, filter icon hidden at rest, hover sets the ring boxShadow + reveals the icon, mouse-out clears both, click filters by `awareness`. Panel scroll invariant (Art. IV.1) re-checked — the scroll root (`flex:1; overflowY:auto`) is unchanged; the edit is confined to the fixed-size funnel sub-box. Render: `orbitiq-v7.202-RENDER.html`.

## v7.201 — 2026-06-15 · Clusters — strip auto-discovered competitor brands ("529 Schwab")

**The ask (Wayne):** competitor brand names were *still* showing in the Clusters panel — a cluster literally named **"529 Schwab"** with chips "schwab 529 · 5K" and "charles schwab 529 · 4K", even though Schwab was never added as a competitor.

**Root cause (verified):** brand stripping only knew (a) the competitors the user **manually configured**, (b) uploaded competitor-CSV domains, and (c) the **AI "Refine with AI"** flags. Schwab was none of these — it was never configured, and the AI brand pass (which only scans `procedure` categories and flags by exact keyword) missed it. Meanwhile Semrush had **auto-discovered** `schwab.com` as a top organic competitor and stored it in `semrushSnapshot.competitors[]` — but the brand filter never looked there. So the client's own ranked terms "schwab 529" / "charles schwab 529" (client footprint, §1) flowed straight into the pool, and the procedure-typed category named "529 Schwab" rendered as a cluster.

**The fix (deterministic — no AI, no re-run; uses real data already in the snapshot):**

- **New shared helpers in `lib/utils/kwVolume.ts`** — `buildCompetitorBrandTokens(snap, clientDomain, …)` derives a brand-token set from `snap.competitors[].domain` (Semrush auto-discovered organic competitors) **plus** any configured/uploaded competitor domains; `textHasCompetitorBrand(text, tokens)` tests a string against it. Tokens are **full domain roots only** (≥4 chars, plain substring) — no fuzzy half-tokens — so generic theme words ("529", "plan", "college") are never matched. The **client's own brand token is removed** from the set, and every strip is additionally guarded by `!isBrandedKeyword(kw, clientDomain, [])`, so the client footprint is never touched.
- **`buildKwPool` now strips auto-discovered competitor brands from all five sections** (client ranked §1, client uploads §2, crawl gaps §3, uploaded gaps §4, demand §5). This is what removes "schwab 529" / "charles schwab 529" from both the Keyword Landscape and the Clusters pool.
- **Cluster-NAME guard in `ThemeClustersPanel`** — any cluster whose category name carries a competitor brand (e.g. "529 Schwab") is dropped at render, belt-and-suspenders with the pool-level stripping. The client's own brand category is kept.

**Defensibility / data:** no fabricated brand list — the signal is Semrush's own auto-discovered competitor domains (real data already in every snapshot). Verified that when **no** signal exists (no auto competitors, none configured, no AI flags) the filter does **not** invent brand detection — the term stays — so we never silently drop data we can't defend. Volumes/counts are untouched real roll-ups of whatever survives the filter.

**Verification (own debugging agent):** isolated `tsc` on both changed files under the project's strict low-target guard (`target es5`, `downlevelIteration:false`, `strict`) = **0 errors**. Behavioural harness (esbuild→cjs, synthetic snapshot mirroring the screenshot) = **17/17**: "schwab 529", "charles schwab 529", gap "vanguard 529" removed and no surviving kw contains "schwab"; generic "529 plan"/"529 college savings", client-brand "futurescholar 529", "best 529 plans", "529 vs roth ira" all kept; the "529 Schwab" name-guard fires while "529 Plan Basics" and the client's own brand cluster are kept; control case (no signal → term retained, no fabrication); prefix edge case (`schwabcharitable` client vs `schwab` competitor → client kept, competitor removed). Render `orbitiq-v7.201-RENDER.html` shows the before/after cluster list.

**Note:** this corrects the case for **already-stored** analyses with no re-run, because it reads `snap.competitors` which the analysis already captured. (If a brand is somehow absent from Semrush's auto-competitor list AND unconfigured AND un-flagged by AI, it remains undetectable by design — add it as a competitor or run "Refine with AI".)

## v7.200 — 2026-06-15 · Clusters — tinted parent-category header rows

**The ask (Wayne):** in the Clusters panel, give the header row of each parent label category a background colour so the parent bands stand out from their topic rows.

**What changed (two files — `components/brief/ThemeClustersPanel.tsx` + `app/globals.css`; 72-file manifest unchanged):**

- **Per-category accent tint (~20%).** Each parent-category header is now banded with a ~20% tint of the category's *own type colour* (Procedure = purple, Brand = amber, Location = blue, Missing demand = cyan — the same colours already used by the type badge), plus a 3px left accent bar in the full type colour. This is the "per-category accent at ~20%" option Wayne approved in the in-chat preview.
- **Applied in both Clusters views:** the card-grid section header (`CategorySection`) and the grouped-by-theme table header (`TopicTable`). In the card-grid header the topic-count moved to the right edge (flex spacer) so the band reads name-left / count-right, matching the approved mockup; the count colour was lifted (`--c-8a8ab0`) for contrast on the tint.
- **`TYPE_META` gains a `headBg` field** mapping each type to its 20% tint var. Four theme-aware CSS variables were added in `globals.css` — `--ca-155-150-255-0_20` (purple) and `--ca-56-189-248-0_20` (blue) in *both* the dark `:root` and `:root[data-theme="light"]` blocks (amber `--ca-245-158-11-0_2` and cyan `--ca-34-211-238-0_2` already existed). Because the tint uses the existing `--ca-*` system it remaps correctly in light mode.

**Defensibility / data:** purely presentational — no data path, keyword pool, volume, count, or grouping logic touched. Category names/counts/volumes are unchanged real roll-ups; the only new code is colour styling.

**Verification (own debugging agent):** isolated `tsc` on `ThemeClustersPanel.tsx` (+ its `@/` imports) under project-equivalent strict settings with `target: es5` and `downlevelIteration: false` (the v7.198 build-error guard) = **0 errors**. `globals.css` brace-balanced (21/21); all four `headBg` vars confirmed defined in both theme blocks (2 defs each). Render `orbitiq-v7.200-RENDER.html` shows both views across all four category types using the exact dark-theme token values (sample names/counts/volumes flagged ILLUSTRATIVE).

## v7.199 — 2026-06-15 · AI cluster refinement — merge synonym intents + strip brand terms

**The ask (Wayne):** the heuristic couldn't merge synonyms ("529 account" = "529 college plan" = "college savings 529") or recognise arbitrary brand names ("schwab 529", "charles schwab 529") — both need semantic understanding. This is the LLM half of the hybrid. Chosen: run it **both** ways (automatic + on-demand button); no interim heuristic patch.

**What's new:**

- **AI grouping module** (`lib/claude/intentGroups.ts`) — `groupCategoriesByIntent` asks Claude (haiku, batched) to group each procedure category's keywords by true search intent, name each group topically ("What is a 529 Plan", "401k vs IRA"), assign a funnel stage, and flag BRAND keywords to drop. Strict validation: only keywords from the input are kept, anything the model didn't place is left out (the panel heuristics it), so **no keyword is ever lost and volumes stay exact**.
- **On-demand "Refine clusters with AI" button** in the Clusters panel, backed by a streaming route (`app/api/projects/[id]/refine-clusters/route.ts`) that shows a **determinate progress bar + ETA** (categories done / total), persists the result on the analysis, and re-renders the panel live — no page reload. Resumable (skips already-refined categories; re-run with force).
- **Automatic in the pipeline** — the analysis's category pass now runs the same grouping inline for smaller footprints (bounded + fault-tolerant so it can never break an analysis; large footprints use the button).
- **Consumption** — `ThemeClustersPanel.buildIntentClusters` prefers the AI groups when present (heuristic fallback otherwise); `buildKwPool` drops AI-flagged brand terms from **both** the clusters and the Keyword Landscape.

**Defensibility:** the AI only groups / names / flags brands — it never invents a keyword or a number; every group volume is an exact roll-up of real members.

**Verification (own debugging agent):** low-target `tsc` (project settings) on the panel + pool = 0; `tsc` on the new module and route (shimmed) = 0; route + pipeline files parse clean. Behavioural: AI-consumption 10/10 (6 synonyms → one "What is a 529 Plan", exact volume, AI stage honoured, Schwab removed from pool + clusters, no keyword loss); module parse/validation 9/9 (hallucinated keywords dropped, brands captured, progress reported); heuristic fallback still 13/13. Render `orbitiq-v7.199-RENDER.html` (before/after + live table; sample volumes flagged). NOTE: the LLM's grouping *quality* is validated when run against live data with the API key — all deterministic plumbing is machine-verified here.

## v7.198 — 2026-06-15 · Build fix — Set iteration (Vercel `next build` type error)

**The problem:** the v7.197 Vercel build failed to compile — `ThemeClustersPanel.tsx:999` iterated a `Set` directly with `for…of` (`for (const t of new Set(...))`), which the project's TypeScript target rejects (`Type 'Set<string>' can only be iterated through when using '--downlevelIteration' or target 'es2015'+`). The rest of the file already uses `Array.from(...)` for this reason; v7.197 broke that convention in one spot.

**The fix (one line in `components/brief/ThemeClustersPanel.tsx`):** wrapped the set in `Array.from(...)`. No behaviour change — purely the iteration form.

**Verification (own debugging agent):** reproduced the exact `next build` failure under a low-target tsconfig (target es5, `downlevelIteration` off) and confirmed it now compiles with **0 errors**; full type-check passes; the v7.197 intent-clustering behavioural test still passes 13/13 (identical grouping/naming output). Going forward, type-checks mirror the project's tsconfig (no `target`) so this class of error is caught before shipping.

## v7.197 — 2026-06-15 · Clusters grouped by SEARCH INTENT, named by topic (one intent = one page)

**The ask (Wayne):** sub-clusters were named by bare keyword modifiers ("401k", "401k Ira") and the same search intent was fragmented across funnel types (one "401k vs IRA" intent appeared as three separate "401k Ira" rows). A cluster should be a **single search intent → a single page**, named after that intent ("What is a 401k", "401k vs IRA", "401k Withdrawal").

**What changed (one file — `components/brief/ThemeClustersPanel.tsx`; 88-file manifest unchanged):** `flattenTopics` now groups a **procedure** category's keywords by **semantic search intent** instead of product-modifier × funnel-type:

- **Intent grouping.** Each keyword is classified by the intent behind it — comparison ("vs", "difference between", "advantages over"), definition ("what is", "how does … work"), how-to, cost, amount, best/review, or general — and grouped with the others that share that intent + entities. Comparison keywords like "ira vs 401k", "401k vs ira", "explain the difference between a 401k and an ira", and "ira advantages over 401k" now collapse into **one "401k vs IRA" cluster** instead of three.
- **Topic-based names.** Comparisons → "{A} vs {B}"; definitions → "What is a {entity}"; general → "{entity} {modifier}" (e.g. "401k Withdrawal"); how-to/amount/best use the clearest representative keyword. No more bare "401k" / "401k Ira" labels.
- **Funnel types merged; one stage per cluster.** A single intent that spans informational + commercial is one cluster; its displayed funnel **stage = the dominant intent by volume** (your choice). Volumes are an exact roll-up of the member keywords — nothing dropped or double-counted.
- **Brand / location / demand categories are unchanged** (they have no clean head entity for topical naming, so they keep the v7.196 intent-labelled children).

**Hybrid (your choice):** this is the **heuristic pass that runs now on existing data** — no re-analysis needed. `buildIntentClusters` is the single seam where a later **LLM grouping pass** can take over for borderline semantic cases (e.g. recognising "how to take money out of 401k" ≈ "401k withdrawal"), populating `_categoryBreakdown.keywordIntentClusters`.

**Verification (own debugging agent):** strict `tsc` on the panel + `kwVolume` chain = 0 errors; 13/13 behavioural checks on the real `flattenTopics` using your 401k example (all 5 comparison keywords in ONE "401k vs IRA" cluster, "What is a 401k" groups the definitional terms, "401k Withdrawal" groups withdrawal terms, no duplicate cluster names, exact volume rollup, no keyword loss, dominant stage correct). Shipped `TopicTable` server-rendered to `orbitiq-v7.197-RENDER.html` (before/after + live table; sample volumes flagged illustrative).

## v7.196 — 2026-06-15 · Strip competitor brand *categories* (abbreviations & other languages)

**The ask (Wayne):** v7.195 didn't fully fix it — a "Bank of America" cluster still showed competitor brand terms like "boa login online", "bofa credit card customer care number", "bof", and even "美国银行" (Bank of America in Chinese).

**Why v7.195 missed them:** those terms are abbreviations / another language, so they don't textually resemble `bankofamerica.com` — per-keyword string matching can't catch them. But the upstream categoriser already groups them under a **brand-type category named "Bank of America"**, with a keyword→category map. That category is the reliable signal.

**What changed (two files; 88-file manifest unchanged):**

- **`lib/utils/kwVolume.ts`** — `buildKwPool` now also excludes any keyword mapped (via `_categoryBreakdown.keywordCategories`) to a **brand-type category that isn't the client's own brand**. This removes the whole competitor brand cluster regardless of how each member term is spelled (abbreviation, foreign script, anything). Applied to the auto gaps, uploaded competitor gaps, and the demand lens. The earlier v7.195 string + competitor-domain checks remain as a backstop for branded terms that fall outside a brand category.
- **`components/brief/ThemeClustersPanel.tsx`** — defensive guard: `buildThemeClusters` never renders a non-client brand category as a cluster, even if a stray member keyword slipped through.

**Scope unchanged from v7.195:** only **non-client** brand categories are removed — the **client's own brand category/cluster is kept** (identified by its name containing the client brand). Generic, non-branded terms are untouched.

**Verification (own debugging agent):** strict `tsc` on both files = 0 errors; 15/15 behavioural checks on the real `buildKwPool` + `buildThemeClusters` using a Bank-of-America scenario (abbreviations "boa"/"bofa"/"bof", possessive "bofa's", and the Chinese term all removed from gaps + demand; the "Bank of America" cluster disappears; the client "TD Bank" brand cluster and all generic terms stay). Proof rendered to `orbitiq-v7.196-RENDER.html`.

## v7.195 — 2026-06-15 · Strip competitor brand terms from the keyword landscape & clusters

**The ask (Wayne):** competitor brand terms (e.g. "american express login") were appearing in the clusters / keyword landscape. Only **non-branded** terms from a competitor should be brought in — parsed out at competitor-CSV upload time, or auto-detected.

**What changed (one file — `lib/utils/kwVolume.ts`; 88-file manifest unchanged):** the shared `buildKwPool` (the single source of truth feeding the Keyword Landscape, Clusters, Executive Summary, Journey and Content Map) now excludes competitor brand terms:

- **Uploaded competitor CSV gaps (§4)** — previously these passed straight through, brand terms and all. They now skip any keyword branded to a competitor. *(This was the leak.)*
- **Auto-detected Semrush gaps (§3)** — already skipped branded terms; the competitor-brand detection is now also fed by the uploaded CSV's `domain` column, so a competitor present only in an upload is still caught.
- **Demand lens (§5)** — competitor brand terms can no longer enter the clusters via "missing demand" either.

**Scope (per Wayne):** only **competitor** brands are removed — the **client's own brand footprint is kept** (the client brand cluster stays). Competitor brands are **auto-derived** from the configured competitor domains **plus the `domain` column of uploaded competitor CSV rows** — no manual list. Result: the "American Express Brand Searches" cluster loses all its members and disappears; client and generic terms are untouched. Underlying DB rows are left intact (Share-of-Voice math unaffected); the filtering happens at pool-build time so it covers both the CSV-upload and auto-detect paths in one place.

**Known limitation (auto-only detection):** a pure contraction like "amex" that doesn't textually resemble "americanexpress.com" is not auto-caught — full brand names are. Catching contractions/aliases needs the optional manual brand-alias list (not enabled).

**Verification (own debugging agent):** isolated strict `tsc` on `kwVolume.ts` and on the consuming `ThemeClustersPanel.tsx` chain = 0 errors; 12/12 behavioural checks on the real `buildKwPool` (full competitor brand names removed from upload + auto-gap + demand, including a competitor known only via the CSV domain column; client brand and all generic terms kept; gap/footprint counts correct). Before/after proof rendered to `orbitiq-v7.195-RENDER.html`.

## v7.194 — 2026-06-15 · Cluster panel — no duplicate parent names; true parent → child grouping

**The ask (Wayne):** the Cluster panel was showing duplicate cluster names — multiple "401k & Retirement Planning", separate "529 College Savings Plans" and "529 Education Savings Plans", etc. Clusters should be matched by search intent and then grouped by parent → child (category / sub-category) with no duplicate names.

**Two root causes fixed (one file — `components/brief/ThemeClustersPanel.tsx`; 88-file manifest unchanged):**

- **Non-split themes repeated the parent name on every row.** A theme that isn't split into products placed its keywords in a "Core" bucket labelled with the *theme name itself*, so its General / Informational / Transactional rows all showed the same title. Core sub-topics are now labelled by their **intent** (General / Informational / Transactional / …) and never by the parent name.
- **No parent grouping + near-duplicate parents weren't merged.** The table now renders **one group-header row per parent** (with its topic count and combined monthly volume) and indents the child topic rows beneath it, so a parent name appears exactly once. Near-duplicate upstream categories that describe the same thing — e.g. "529 College Savings Plans" and "529 Education Savings Plans" — are **merged in-panel into a single canonical parent** (the higher-volume name), absorbing the other's keywords. Detection is data-derived from the names' own tokens (shared ≥2 tokens, each side differing by ≤1), so genuinely different categories like "Credit Cards" vs "Debit Cards" are *not* merged.

**Numbers stay a pure roll-up** — merging and re-labelling never drop or double-count a keyword; every parent/topic volume is the exact sum of its members.

**Verification (own debugging agent):** isolated strict `tsc` on the panel + `kwVolume` chain = 0 errors; 17/17 behavioural checks on the real `buildThemeClusters` / `flattenTopics` code (no topic labelled with the parent name, exact volume rollup, no keyword loss, two 529 parents → one canonical "529 College Savings Plans" at exact summed volume, Credit/Debit Cards stay separate). Shipped `TopicTable` server-rendered to `orbitiq-v7.194-RENDER.html` (layout preview; sample volumes flagged illustrative).

## v7.193 — 2026-06-14 · Content Map — journey filter + prominent, legible controls

**The ask (Wayne):** give a way to view the **pre-product journey, the product journey, or both**, and make all the CTAs / filter / sort buttons far more visible — they were too dim to see.

**What changed (one file — `components/brief/ContentMapSection.tsx`; 88-file manifest unchanged):**

- **Journey filter.** A new *Both journeys / Pre-product / Product* segmented control. Pre-product shows only the pre-product table, Product shows only the product table, Both shows both. Color-coded (cyan = pre, purple = product, indigo = both).
- **Prominent controls.** New reusable `Segmented` control — raised container, icons, a **filled active state** (solid accent fill, dark/light ink for contrast) instead of the faint outline, and a clearly-visible medium-grey inactive label (was near-black). The view toggle (Pages / Briefs / Table) and the order toggle (Net-new first / Existing first) both use it.
- **CTA.** *Map ranking pages* is now a solid filled button, not a dim outline.
- **Source legend** became actual colored chips (Competitor gap / Journey gap / Both) on its own labeled row, grouped with the other controls in one bordered control bar.

All colors use existing `--c-`/`--ca-` theme tokens (verified present in `globals.css`) so nothing renders invisible, and they adapt to light/dark mode.

**Verified (own debugging agent):** isolated strict `tsc` on the changed panel + real dependency chain = **0 errors**. **48/48 assertions** on the real bundled code (esbuild → jsdom): 32 regression (builders + `TopicGroupTable` + `ArticleDrawer` unchanged), 7 on the new `Segmented` (all labels/icons render, active carries its fill + dark ink, inactive uses visible `9090b8` not near-black, correct `aria-pressed`), and a **9-assertion full client mount** flushing effects — confirms the control bar renders and the journey filter live-toggles which tables show (Both → both; Product → only product, pre hidden; Pre-product → only pre, product hidden). Panel-scroll root unchanged. Render: `orbitiq-v7.193-RENDER.html` (the real `Segmented` + `TopicGroupTable`, server-rendered; illustrative data, flagged).


## v7.192 — 2026-06-14 · Content Map — parent→child article topics, net-new source split & article drawer

**The ask (Wayne):** rebuild the Content Map so it (1) leads with summary cards including a **Total Articles Needed** count that reconciles with the Cluster panel and Journey, (2) lets you sort net-new vs existing, (3) labels each net-new item by whether it came from a **competitor** or a **journey gap**, (4) sorts by the same product order being refined in the Cluster & Keyword panels, and (5) separates the **pre-product journey** from the **product journey** — with that split surfaced on the cards too. Then: the clusters should share the **same parent → child grouping** as the Cluster panel, and clicking a topic should open an **article drawer** with the article topic name, primary keywords + volume, the audience segment (with its circular portrait), the tonality, and the key points of view.

**What changed (one file — `components/brief/ContentMapSection.tsx`; 88-file manifest unchanged):**

- **Parent → child grouping.** Each theme is now a parent header and its journey-stage **topics** nest beneath it — the same readable grouped layout as the Cluster panel. A topic = theme × journey stage, which is the unit a writer briefs against.
- **Two separate tables.** A *Pre-Product Journey* table and a *Product Journey* table, each with its own subtotal (topics · net-new · optimise · volume). Within each, themes are ordered by the same product order as the Cluster & Keyword panels (procedure → brand → location, then volume).
- **Net-new source.** Every net-new topic carries a sortable **Source** column and a colored badge — *Competitor gap* (a rival ranks, you don’t), *Journey gap* (demand from the journey, no page yet), or *Both* — derived from the real keyword provenance (competitor domain vs. pure demand).
- **Order toggle.** *Net-new first / Existing first* re-orders the theme groups.
- **Summary cards.** A new **Total Articles Needed** card (count of topics) plus pre-product/product splits on it and on Optimise Existing, and a competitor/journey split on Build Net-New — so the cards reconcile exactly to the two tables.
- **Article drawer.** Clicking a topic opens a brief showing the article topic name, the primary keywords with their real volume and rank state, the matched **audience segment** (with its circular AI portrait, initials fallback), the **tonality** (the segment’s messaging & tone), and the **key points of view** (the segment’s creative direction). Keywords/volume are real Semrush; the segment match is by real prompt↔keyword overlap; tonality and POVs are surfaced verbatim from the segment model — nothing fabricated.

**Verified (own debugging agent):** isolated strict `tsc` on the changed panel + its real dependency chain (ContentPlanSection → contentPlan → graph) = **0 errors**. Behavioral + render harness on the **real** bundled code (esbuild → jsdom/SSR), **32/32 assertions**: topic build (parent→child, action optimize/net-new, source competitor/journey/both, exact volume sums — no modeled numbers, segment match by overlap, tonality = messagingAndTone verbatim, POV split from creativeDirection), group ordering (net-new vs existing), and a full render of the shipped `TopicGroupTable` + `ArticleDrawer` (parent headers, child rows, source badges, drawer with persona-avatar initials, real keyword + volume, segment, tonality, POV). Panel-scroll root unchanged (`overflow-y-auto`, no scroll-theft child). Render: `orbitiq-v7.192-contentmap-RENDER.html` (the actual components, server-rendered; illustrative data, flagged).

**Reconciliation note:** Total Articles Needed counts this panel’s topics exactly (the rows in the two tables). It now mirrors the Cluster panel’s parent→child structure, but the two panels still use separate builders, so exact numeric parity with the Cluster panel’s topic count is a follow-up (shared builder) — flagged, not silently forced.


## v7.191 — 2026-06-14 · Keyword panel — Category Breakdown becomes a collapsible parent ▸ child ▸ sub tree

**The ask (Wayne):** the Category Breakdown was a flat list — "personal loans" and "mortgage" scattered among everything else. Wanted a parent → child relationship: a parent category (e.g. *Lending*) with the related categories nested under it, and, where it exists, a deeper sub-category level (e.g. *Personal Loans* ▸ *wedding loans*, *construction loans*). Parents listed by default; click to reveal the indented children. Derived **from the keyword data**, **as many levels as the data supports**, **collapsed by default**.

**What changed (one file — `components/brief/KeywordsPanel.tsx`; 88-file manifest unchanged):** the flat `KwCategorySection` is now a hierarchy, built two ways, both 100% data-derived (no hardcoded vertical word list — the v7.187 rule):

- **Sub-categories (going deeper).** Within a procedure category, recurring distinctive keyword *modifiers* (adjacent bigrams, then unigrams; each must appear in ≥2 keywords) become child rows, **recursively**, after stripping the parent's own head words. Everything that doesn't match a recurring modifier falls into a "— general" remainder child, so **every keyword keeps a home** and each node's totals are the **exact arithmetic sum** of its descendants. On real Semrush data, *Personal Loans* split into *Bad Credit*, *Interest Rates*, *Debt Consolidation*, lender brands, etc.
- **Families (going up).** Procedure categories that share the **same trailing product noun** (e.g. *Personal Loans* + *Auto Loans* + *Student Loans* → **Loans**) nest under a derived parent named from that shared noun. A category with a unique noun (e.g. *Mortgage Rates and Calculators*, *Credit Cards*) stays top-level.
- **Collapsed by default.** Only top-level rows show on load, each with a ▸ chevron and a child count; click a row to expand its indented children (and again to collapse). Brand & navigation categories stay flat (navigational, not product lines).

**Defensibility:** the rollup is pure arithmetic — a parent equals the sum of its children, the grand Overall total is unchanged, and no keyword is lost or double-counted. All demand figures trace to real Semrush volumes (the live panel uses the client's real positions). **Note:** a *semantic* super-group whose label isn't a word in the data (e.g. "Lending" over Mortgage + Loans) can't be invented here — that requires the LLM grouping pass (a re-analysis). This release groups by the terms actually present in the keywords; the LLM-labelled parents are the natural next version if you want curated names.

**Verified (own debugging agent):** isolated strict `tsc` on the changed file + its dependency = **0 errors**. Behavioral test on REAL Semrush data (US, 2026-06-14, `phrase_fullsearch` personal-loan / credit-card / auto / student / mortgage) = **48/48** — exact rollups at every node, zero keyword loss or duplication, sub-category mining, family nesting with correct depths, collapsed-by-default, brand categories not split. jsdom render + interaction = **12/12** — collapsed default shows parents only, clicking a family reveals its categories, clicking a category reveals its mined sub-categories (deep), collapse hides them again. Panel scroll root unchanged (`flex-1 min-h-0 overflow-y-auto`); no nested vertical scroller introduced. Static preview `orbitiq-v7.191-RENDER.html` server-renders the exact shipped components over the real data in both collapsed and fully-expanded states.

## v7.190 — 2026-06-14 · Theme Clusters — sub-product topics + sortable table

**The problem (Wayne):** the cluster panel was hard to read and far too shallow. A whole theme like *Credit Cards* showed only **2 topics** (Awareness · Informational and Decision · Transactional) — every card product (balance transfer, secured, cash back, travel, business, each of the client's actual card pages) was flattened into those same two intent buckets. The client's site has a separate page for each card, and each deserves to be its own topic cluster with its own upper-funnel and consideration stages.

**What changed:**
- **Each theme now splits into PRODUCTS, then funnel stages.** A broad procedure theme is divided into product sub-clusters mined entirely from the data — never a hardcoded vertical word list (the v7.187 rule):
  1. **Client pages first** — every keyword's real ranking-page URL slug is a product page; the product is named from the client's own slug (e.g. *Cash Secured Credit Card*, *Business Solutions Credit Card*).
  2. **Keyword modifiers** — recurring distinctive words / order-independent bigrams left after stripping the theme's own head words and generic question/intent words (e.g. *Balance Transfer*, *Cash Back*, *Travel*, *Travel Rewards*). Catches products that have no matched page yet.
  3. **Core** — keywords with no distinctive modifier stay in a Core row so nothing is lost.
  Each product is then split by intent into its funnel stages, so one product yields up to one row per stage.
- **Readable, sortable table.** The card grid is replaced by a single table — Theme · product / Stage / Keywords / Vol-per-mo / Coverage / Best rank / Status — sortable by any column (default groups product then funnel stage). Click a row to expand its keywords. Coverage and best rank are computed from the client's real Semrush positions.
- **Hybrid deep-journey feedback.** Deep-journey demand keywords flow through the same product matcher, so "Build deep journeys" deepens the right product automatically (a balance-transfer demand keyword lands on the Balance Transfer product, not a generic bucket).

**Verified (own debugging agent):** isolated strict `tsc` on the changed panel + its real dependency = 0 errors. Behavioral test on REAL Semrush data (US, 2026-06-14) for the credit-card product lines: the splitter turned one broad theme into **6 products / 14 topic rows with zero keyword loss**, named the two client-page products from their real slugs, kept no catch-all bucket, and placed every topic in exactly one funnel stage (10/10 assertions). Shipped `TopicTable` server-rendered over that real data → `orbitiq-v7.190-RENDER.html` (static; keywords + volumes real, ownership/rank illustrative).

**Scope note:** in-panel products are surfaced from keywords + the page slugs that already rank. Surfacing a client product page that has **no** keyword yet (the "awaiting demand" rows) comes from the deep-journey / sitemap side of the hybrid and fills in when you build deep journeys. Only `components/brief/ThemeClustersPanel.tsx` changed — 88-file manifest unchanged.


## v7.189 — 2026-06-14 · Audience Journey — per-topic multi-step journeys (replaces hub-and-spoke)

**The problem (Wayne):** in the journey map, all the good upper-level topics routed into one single page — and that page was an unrelated topic ("everything → Monitoring Precious Metals"). And a topic like *improve credit score* was a single node with nothing under it, instead of a real journey (what a good score is, why it matters, what moves it, how to improve it, the bureaus, etc.).

**Root cause (two bugs):**
1. *Footprint view:* the edge fallback `stageOrderEdges` linked **every** node in a funnel column to **every** node in the next column. When one theme happened to sit alone in the decision column, it collected an arrow from every other topic — the "everything → one page" mesh.
2. *Deep-journey view:* the old model collapsed each topic to a single node and bridged them all into a product "core," so a topic had no internal depth.

**What changed:**
- **Each topic is now its own multi-step journey.** Sourced from the deep-journey demand universe, a topic's real Semrush keywords are split into ordered steps — **What it is → Why it matters → What affects it → How to do it → Compare options → Take action** — one node per occupied step, chained in journey order. *Improve credit score* now reads: *what is a good credit score* (60.5K) → *what is the max / considered good* → *how to improve / build / raise / fix* (368K) → *best credit score*.
- **Topics only connect on real overlap.** A faint "related topic" link is drawn between two topics only when a single demand keyword carries both topic seeds (co-searched) or they share ≥2 distinctive tokens — never by arbitrary funnel position.
- **New swimlane map** (`TopicJourneyMap`): one row per topic, steps flowing left→right, color-coded by coverage (existing / competitor / missing). Click a step to focus that topic's whole journey (plus directly-related topics) and dim the rest; Esc or empty-click to exit.
- **Footprint view de-meshed.** Until the deep journey is built, themes are independent nodes linked only on real shared keywords — no more false convergence.

**Defensibility:** every keyword and monthly volume is the real Semrush demand row; the step facet is a deterministic classification of each keyword's own wording (topic-name words are stripped first so topic vocabulary — e.g. "yield" in *high yield savings* — never acts as an intent signal). No number is invented. The Content panel's rollup (`lib/journey/contentPlan`) is intentionally left on the prior builder and is unchanged.

**Verification (own debugging agent):** strict `tsc` on `graph.ts` + `contentPlan.ts` + `JourneySection.tsx` — **0 errors**. Facet classification tested on **real, live-pulled Semrush keywords** (credit-score + high-yield-savings) — **23/23**. `buildTopicJourneyGraph` structure test — **34/34**: per-topic step chains in journey order, max in-edge degree ≤ 1 (no convergence hub), data-derived cross-topic links, client-rank coverage overlay, real (un-invented) volumes, plan rollup. React-SSR render of the shipped `TopicJourneyMap` — **14/14**: topic rows, all six step headers, real volumes, dashed related links, node bodies, topic-scoped focus dimming. Render `orbitiq-v7.189-RENDER.html` built from the exact component using **real Semrush data for four sample topics** (coverage colors illustrative). Edited: `lib/journey/graph.ts`, `components/brief/JourneySection.tsx`. No files added or removed (88-file manifest unchanged).

## v7.188 — 2026-06-14 · Audience Journey — clickable cluster detail + connected-journey focus

**What changed:** clicking a cluster in the journey now does two things it didn't before.

- **It opens a detail panel with real information.** Before, a click gave no visible feedback (the panel rendered below the fold). Now the panel auto-scrolls into view and shows: the topic, total monthly volume and keyword count, a coverage bar (what share of the topic's demand you already rank for), the existing page to optimize with its best rank, and a full **keyword table** — every keyword in the cluster with its search volume and your live SERP rank (`#4` where you rank, "competitor" where only a competitor ranks, "not ranking" otherwise).
- **It brings the whole connected journey into focus.** Clicking a cluster now lights up the entire path it belongs to — problem → discovers solution → product → decision topics, followed transitively across every link — and dims everything else, so you can trace where the journey goes. A focus banner names the focused journey; click empty space or press Esc to exit. (Previously, clicking only changed the immediate connected lines with no way to see the full path.)

Both behaviors apply to **both** journey views — the deep-journey connected graph and the footprint stage-column view.

**How (and why it's defensible):**
- Per-keyword rank is threaded from the analysis snapshot (the ranked rows already carry `position`) into the node data: `graph.ts` `TopicKeyword` gains a `rank` field fed by a new `rankByKeyword` option; `JourneyNode` gains a `keywords[]` list (volume + rank) built in `clusterToNode` and `buildDemandNodes`. No rank is invented — a keyword shows a rank only if the client actually ranks for it in the data.
- Focus = the transitive connected component of the selected node over the journey edges (both directions, all edge kinds). Pure graph traversal, no modeling.
- New shared `KeywordTable` component renders the keyword list in both panels; a `FocusBanner` shows the focused state and the exit affordance.

**Verification (own debugging agent):** strict `tsc` on `JourneySection.tsx` + `ContentMapSection.tsx` + `graph.ts` — **0 errors**. Data-threading test on the real bundled `buildJourneyGraph` and `buildDemandNodes`: client keywords carry the correct rank (`#4`, `#9`), competitor-only keywords carry a null rank + competitor state — **pass**. Connected-component (focus) unit test on chained and disconnected graphs, for both graph-edge and tuple-edge forms — **pass**. Full **integration test**: mounted the real `JourneySection` in jsdom in deep-journey mode, clicked a node, and confirmed the focus banner appears, the detail panel populates with the keyword table and rank/volume data, and off-path nodes dim — **all pass**. Render `orbitiq-v7.188-RENDER.html` (interactive; opens with a cluster selected). Edited: `lib/journey/graph.ts`, `components/brief/JourneySection.tsx`. No files added or removed.

## v7.187 — 2026-06-14 · Audience Journey — domain-agnostic clustering (no inherited vertical vocabulary)

**What changed:** "Build deep journey" (and the footprint Journey view) no longer pulls in off-topic clusters from a different vertical. On a financial-services project the journey was showing cosmetic-surgery clusters like **"Chin / Neck"** and **"Arm Concerns"**. Those came from a hardcoded cosmetic vocabulary baked into the clustering engine — not from the current project's specs. The clustering is now derived entirely from **this project's own data**: its audience-segment language (pre-LLM prompts + triggers), its category names, and its brand. It works for any industry.

**Root cause (why the cosmetic clusters appeared):** three places carried a hardcoded body/aesthetic vocabulary left over from an earlier vertical:

- `app/api/projects/[id]/demand-universe/route.ts` — a `PROBLEM_SEED_ANCHORS` list ("double chin", "arm fat", "turkey neck", …) plus a cosmetic last-resort fallback (`"stubborn belly fat", "loose skin", …`) that injected those seeds whenever a project's own language produced none.
- `components/brief/JourneySection.tsx` and `components/brief/ContentMapSection.tsx` — a `PROBLEM_ANCHORS` map ("chin → Chin / Neck", "arm → Arm Concerns", …) and an `ANATOMY_WORDS` list used both to name pre-product themes and to gate relevance. The matching was naive substring/whole-word, so unrelated finance terms were captured and mislabeled: **"401k matching"** contains the substring "chin" → *Chin / Neck*; **"5/1 ARM"** (adjustable-rate mortgage) matched the anatomy word "arm" → *Arm Concerns*.

**How it's fixed (and why it's defensible):**

- **All hardcoded cosmetic vocabulary removed** (`PROBLEM_SEED_ANCHORS`, the cosmetic fallback, `PROBLEM_ANCHORS`, `ANATOMY_WORDS`).
- **Relevance gate** is now project-spec: a pre-product keyword is kept only if it shares a ≥4-char stem with the client's category names, brand, or the audience's own language. Matching is stem-based (so "invest" still matches "investing"/"investment") but no longer does cross-word substring matches ("arm" inside "pharmacy", "chin" inside "matching"). Every drop is explainable by zero token overlap with the client.
- **Deterministic theme names** come from the project's own audience language (each pre-LLM prompt reduced to a short head term — the same reduction the deep-build uses for its seeds). The AI naming route still supplies human theme names when available; these are only the fallback.
- **Distinctive "procedure word"** for the product lane is now data-derived (a category word that is not shared across categories and not part of the audience's problem language) instead of relying on the cosmetic anatomy list — so problem searches like "tummy fat" don't leak into a "Tummy Tuck" product cluster.
- **Stale-universe invalidation:** a built demand universe is tagged with an engine version (`demand-v2`); any universe built by the old engine (or cached under the old key / the old problem-theme cache) is ignored, so the project falls back to the footprint view and a clean deep journey can be rebuilt on the current specs.

**Verification (own debugging agent):** isolated `tsc` (strict) on the two rewritten panels — **0 errors**; `esbuild` parse of all four changed files — clean; no dangling references to the removed symbols anywhere in the tree. Behavioral test on the **real shipped `buildClusters()`** with representative inputs (logic test, not live data): financial project yields finance-derived themes ("Invest In Stocks For Beginners", "Building An Emergency Fund", "High-Yield Savings") with **no cosmetic-named cluster**, and "401k matching" / "5/1 arm" are no longer mislabeled; cosmetic project (regression guard) is unchanged — procedures stay in the product lane and "tummy fat" remains a pre-product problem theme. Render `orbitiq-v7.187-RENDER.html` shows both panels. Edited: `app/api/projects/[id]/demand-universe/route.ts`, `app/api/projects/[id]/journey-problem-clusters/route.ts`, `components/brief/JourneySection.tsx`, `components/brief/ContentMapSection.tsx`. No files added or removed.

## v7.186 — 2026-06-13 · Light mode fixes — stuck dark-blue nav + text contrast

**What changed:** two issues in the v7.185 light theme are fixed.

- **Dark-blue blocks in the left nav are gone.** The expanded sub-nav sections (Keyword list / Theme clusters, Content map / Content plan) and other near-black surfaces were rendering as solid dark-blue in light mode. Cause: the v7.185 "darken vivid accents" step keyed off HSL *saturation*, which spikes to a high value for near-black colors that carry a faint blue tint (e.g. the sub-nav background `#060610`) — so those surfaces were wrongly darkened instead of lightened.
- **Higher text contrast.** Pure inversion preserved the *deliberately low* contrast of secondary/tertiary text, so faint dark-mode labels stayed faint in light mode.

**How:** the light-value rule now splits colors by **absolute chroma** (max−min of RGB), which is reliable at extreme lightness. Perceptual neutrals (grays/navies, chroma < 0.22) map to a hand-tuned light scale — page bg `#F2F3F8`, white surfaces/cards, `#E3E4EE` borders, and contrast-boosted text (`text-secondary` → `#4C4D67` ≈ 8.7:1 on white, `text-tertiary` → `#6E6F88` ≈ 5:1, primary → near-black). Only genuine accents (chroma ≥ 0.22) use HSL lightness inversion, and the legibility darkening now fires only on true mid-lightness accents — so near-black navies correctly become light surfaces. Dark mode is byte-for-byte unchanged; only the `:root[data-theme="light"]` values in `app/globals.css` changed (no `.tsx` edits).

**Verification (own debugging agent):** TS AST scan of all 52 files still **0 syntax errors / 0 duplicate attributes**; confirmed in the generated `globals.css` that the former dark-nav tokens now resolve light (`--c-060610 → #F2F3F8`, `--c-0d0d16 → #F2F3F8`) and the text channels are boosted; computed contrast ratios for secondary/tertiary text on white meet WCAG AA. Render `orbitiq-v7.186-RENDER.html` (SAMPLE) shows the expanded sub-nav with no dark-blue and readable text.

## v7.185 — 2026-06-13 · Global dark/light theme toggle

**What changed:** a dark/light switch now lives in the global header (both the project view and the dashboard). The app stays dark by default; flip the switch and the entire UI recolors to a light theme. Your choice is remembered per browser and applied before the page paints, so there's no flash on reload.

**How light mode is built (and why it's defensible):** the app had ~1,800 color literals scattered inline across all 23 panels plus the Tailwind `orbit-*` palette. Every color is now a theme token, and the light value of each is computed by **HSL lightness inversion** — hue and saturation are preserved, only lightness flips (1 − L). Because inversion preserves the lightness *distance* between any two colors, the contrast and visual hierarchy already tuned for dark mode are mathematically preserved in light mode. Vivid mid-lightness accents (green/cyan/purple) are darkened just enough to stay legible on white. Google brand colors (the logo) are deliberately left fixed. The Tailwind `orbit-*` classes and the inline tokens share the *same* inversion, so both styling systems always agree for a given source color.

**Mechanics:**
- `tailwind.config.ts` — `orbit-*` colors now resolve to `rgb(var(--orbit-*) / <alpha-value>)`, so the classes follow the active theme while keeping opacity modifiers (e.g. `bg-orbit-card/50`) working.
- `app/globals.css` — defines every theme token under `:root` (dark, default) and `:root[data-theme="light"]`; switching the attribute swaps all colors live, with a smooth transition.
- `app/layout.tsx` — a tiny inline script sets `data-theme` from `localStorage('orbitiq-theme')` before first paint (no flash; default dark).
- `components/ThemeToggle.tsx` — new client component (sun/moon switch) wired into the project header and the dashboard nav.
- All inline `#hex` / `rgba()` / SVG `fill=`/`stroke=` literals across `app/` + `components/` converted to theme tokens (SVG attributes moved to `style` so `var()` resolves reliably).

**Verification (own debugging agent):** TypeScript AST scan of all 52 `.tsx`/`.ts` files — **0 syntax errors, 0 duplicate attributes** (the only structural change, attribute→`style`, introduced none). `tsc` at **ES5** (project default target) clean on the new `ThemeToggle.tsx` and the rewritten `tailwind.config.ts`. Tailwind CLI compile confirms `orbit-*` utilities emit `rgb(var(--orbit-…) / α)` with opacity modifiers intact. Render `orbitiq-v7.185-RENDER.html` (SAMPLE, flagged) renders the real header + sidebar + panel using the exact shipped token values in both themes. No data/logic changed — this release is purely presentational.

## v7.184 — 2026-06-13 · Local Search — visible Scan setup, location priority, All toggles

**What changed:** the scan controls were easy to miss and didn't explain themselves, and there was no defensible answer to "which locations get scanned when I cap below my total."

- **Visible "Scan setup" panel.** A clearly labeled panel (services, locations, priority) replaces the cramped inline inputs, with helper text explaining that **Services = your brand + core service categories**, scanned as "{service} {city}" from each location's GPS.
- **Location priority — you choose, and it's defensible.** A selector controls which locations a capped scan covers first: **Largest markets** (metro-size order, the default), **Highest demand** (real Semrush volume per city, from data already pulled), or **A→Z**. Previously a capped scan just took locations in arbitrary sitemap order. ("Lowest competition" needs scan data to know, so it's surfaced in results, not as a pre-scan selector — noted in the UI.)
- **"All" toggles** for both Services and Locations, so you can cover everything in one click (cost rises accordingly).
- The dry-run preview now shows the chosen priority and the first cities that will be scanned.

**Verification (own debugging agent):** ordering harness **10/10** (cityMarketRank ranks bigger metros first; market/demand/A–Z orderings correct; stable, non-mutating); route order harness **4/4** (order echoed, "largest markets" puts NYC/Houston first, A–Z alphabetical, default = market); `tsc` at ES5 clean on all changed files; jsdom render **8/8** (scan-setup panel, All toggles, priority selector, services explanation, competition caveat). Render snapshot `orbitiq-v7.184-RENDER.html` (SAMPLE, flagged). Edited: `lib/local/detect.ts` (cityMarketRank), `lib/local/seeds.ts` (orderLocationsForScan), `app/api/projects/[id]/local-scan/route.ts`, `components/brief/LocalSearchSection.tsx`. No files added.

## v7.183 — 2026-06-13 · Local Search — per-location map-pack GRID (services × cities)

**What changed:** the Local panel now models local visibility the way a multi-location brand actually competes — a **grid of services × locations**, not a flat list of ~25 national keywords. For each of the client's core services (and brand), it checks the Google map-pack rank **from every location's GPS**, city by city ("liposuction austin", "sono bello dallas", …). With 138 locations and several services, that's hundreds of real, per-location rank checks instead of 25 aggregate ones.

**Why:** the previous model surfaced only the local-intent subset of the Semrush footprint (≈30 national keywords) and ignored the per-location dimension entirely — so "Map Pack 25" was just a scan cap, unrelated to your locations. It couldn't answer "how does my Austin location rank for liposuction."

**New pieces:**
- **Service seeds** (`lib/local/seeds.ts`): brand + top service categories, derived from the client's own footprint, each with its real base Semrush volume. Geo/noise excluded; competitor-gap keywords never seed it (v7.182 fix carried through).
- **Grid scan** (route): seeds × locations → "{service} {city}" map-pack check from each location's GPS; records your rank, the pack leader, and pack members per cell. Location ratings still backfill from the packs (no extra calls).
- **Per-run caps**: set how many **Locations** and **Services** to scan right in the panel header; the dry-run shows the exact grid size ("N services × M locations = K checks") and credit estimate before spending. Sitemap discovery stays free.
- **UI**: "Services" tab lists the seeds tracked per location (with how each is scanned); the **Map Pack** tab is now the grid — Service · City · base volume · in-pack? · your rank · leader.

**Defensibility:** every cell is a real SerpAPI local-pack read from a real GPS; service volume is the base term's real Semrush figure (labeled as such — per-"{service} {city}" long-tail volumes aren't fabricated).

**Verification (own debugging agent):** seeds harness **9/9** (brand-first, real volumes from pool, noise/junk excluded, gridKeyword); route grid harness **15/15** (dry-run grid estimate respects caps: 3 services × 2 locations = 6 checks; full scan produces seeds×locations cells each keyed "{seed} {city}", seeds persisted, rank from pack); `tsc` at ES5 clean on all new/changed files; jsdom render **9/9** (Services tab seeds, caps inputs, Map Pack grid with Service+City columns and rank chips). Render snapshot `orbitiq-v7.183-RENDER.html` (SAMPLE, flagged). NEW `lib/local/seeds.ts`; edited `lib/local/build.ts`, `app/api/projects/[id]/local-scan/route.ts`, `components/brief/LocalSearchSection.tsx`.

## v7.182 — 2026-06-13 · Local Search — fix relevance-vocabulary poisoning (off-topic keywords)

**What changed:** off-topic keywords ("delaware state football", "march madness locations", "houston rockets", "buffalo hump", "ponce city market atlanta") were still appearing as competitor keywords. Root cause found by simulating the gate against Sono Bello's real Semrush data: the client-relevance vocabulary is built from the client's own ranking keywords, selected with `competitor == null` — but a competitor **gap** keyword can carry `competitor = null` (the per-keyword competitor domain isn't always recorded) while still being flagged `isGap = true`. Those gap keywords were leaking into the *client* vocabulary, so their off-topic tokens ("football", "rockets", "market", "madness", "hump"…) ended up whitelisting other junk.

**Fix:** the client vocabulary is now built from genuinely client-ranked rows only — `!competitor && !isGap` — in both the panel and the scan route. Competitor gap keywords no longer seed the client's business vocabulary, so off-topic terms have nothing to match against and are excluded.

**Verification (own debugging agent):** simulated the gate on Sono Bello's **real** Semrush keyword set (280 keywords) — every junk term from both screenshots drops, real local keywords stay; route harness **7/7** (junk gap rows with `competitor=null, isGap=true` now drop; "sono bello near me", "liposuction houston" kept); `tsc` at ES5 clean; jsdom render **7/7**. Render snapshot `orbitiq-v7.182-RENDER.html` (SAMPLE, flagged). Files: `components/brief/LocalSearchSection.tsx`, `app/api/projects/[id]/local-scan/route.ts`.

## v7.181 — 2026-06-13 · Local Search — location badge on opportunity cards

**What changed:** each Local Opportunity card now shows a prominent **📍 location badge** in its header, so you can see at a glance which location the opportunity targets (e.g. "📍 East Syracuse"). The location was previously only in the card's prose and a small chip at the bottom; the redundant lower "Location" chip was removed now that the badge carries it. Display-only change in `components/brief/LocalSearchSection.tsx` (no data/logic change).

**Verification (own debugging agent):** `tsc` at ES5 clean; jsdom render **5/5** (badge present with the city on each of 3 pack-miss cards, redundant lower chip removed, other chips intact). Render snapshot `orbitiq-v7.181-RENDER.html` (SAMPLE, flagged).

## v7.180 — 2026-06-13 · Local Search — clearer location status labels

**What changed:** the location "Incomplete" label was misleading. Sitemap-discovered locations come with a full address and phone but no Google rating until they show up in a scanned map pack — yet they were flagged "⚠ Incomplete," implying a defect.

Locations now show one of three statuses: **✓ Verified** (a real Google rating, reviews and address are on file), **◷ Rating pending** (discovered from the client's sitemap — the Google rating is captured when the location appears in a scanned map pack; not a defect), or **⚠ Incomplete** (a genuine gap — missing address or no reviews). Each badge has a hover tooltip explaining it. Display-only change in `components/brief/LocalSearchSection.tsx` (new `locStatus` helper); no data or scan logic changed.

**Verification (own debugging agent):** `tsc` at ES5 clean; jsdom render **7/7** — a Verified, a Rating-pending and an Incomplete location each render with the correct single label, and the pending location is no longer flagged as a warning. Render snapshot `orbitiq-v7.180-RENDER.html` (SAMPLE, flagged).

## v7.179 — 2026-06-13 · Local Search — sitemap location discovery, client/competitor keywords, stronger relevance

**What changed:** the Local Search panel now discovers locations from the client's own website, sources keywords from both the client and competitors (clearly labeled), and applies a much stronger relevance filter so off-topic keywords stop appearing.

**1) Locations from the client's sitemap (authoritative, free).** A new parser reads the client's `sitemap.xml` → `local-sitemap.xml` → `locations.kml` and extracts every location with its name, full address, city/state, phone, location-page URL, and exact GPS coordinates — straight from the client's own site, at no SerpAPI cost. (For Sono Bello this is all 116 locations.) If the site has no usable sitemap, it falls back to the previous Google Maps brand search. The dry-run estimate now shows the discovery source and notes when locations were read free from the sitemap. Location ratings/reviews are backfilled from the live map-pack scan (no extra API calls).

**2) Keywords come from both client and competitors — and say which.** The local list runs on the same `buildKwPool` as the Keywords panel, which already unions client ranking keywords + competitor gap keywords + uploads. Each local keyword now shows a **client** vs **competitor** source badge, and the summary cards split client-ranked vs competitor-gap counts.

**3) Stronger relevance gate (the real fix for the junk).** The off-topic terms ("march madness locations", "roswell new mexico cast", "houston rockets") were entering through competitor gap keywords. Relevance is now built from the client's **actual ranking vocabulary** (its own keywords + categories + brand), and — critically — **geographic words are excluded** from that vocabulary, so a shared city name can never whitelist an off-topic term (a client ranking for "liposuction houston" no longer lets "houston rockets" through). Every excluded keyword has zero business-vocabulary overlap with the client.

**Verification (own debugging agent):** sitemap parser harness **16/16** against the real Sono Bello KML structure (placemark name/address/city/state/zip/phone/page-URL/GPS, sitemap-index pick, /locations/ page fallback, geo-vocab); relevance-gate harness **16/16** (geo exclusion drops "houston rockets" while keeping "liposuction houston"; competitor-relevant kept with competitor tag; backward-compatible 3-arg call); route harness **15/15** (dry-run single-line, KML discovery via mocked fetch, source=kml with no discovery credits, junk gated from estimate + scan, rating backfill from pack); `tsc` at **ES5** clean on all changed/new files; jsdom render **15/15** (client/competitor badges, junk excluded, scroll guard). Render snapshot: `orbitiq-v7.179-RENDER.html` (SAMPLE fixture, flagged).

**Files:** NEW `lib/local/sitemap.ts`; edited `lib/local/detect.ts` (relevance vocab + geo exclusion), `app/api/projects/[id]/local-scan/route.ts` (sitemap discovery + rating backfill + relevance), `components/brief/LocalSearchSection.tsx` (client/competitor badges, sitemap locations view), `lib/local/build.ts` (LocalListing.pageUrl, LocalScan.source).

## v7.178 — 2026-06-13 · Local Search panel — fix build error + off-topic keywords

**What changed:** two bug fixes to the v7.177 Local Search panel.

**1) "Unexpected non-whitespace character after JSON" error (gone).** Clicking *Run local scan* showed a red JSON error in the panel header. Cause: the dry-run credit-estimate step streamed a "discovering listings…" progress line *before* the result line, but the panel reads the estimate with a single-object JSON parse — two lines tripped it. The dry-run now returns exactly one JSON object, so the estimate loads cleanly. No effect on the live scan stream.

**2) Off-topic keywords no longer appear.** The Local Keywords list was showing terms unrelated to the client (e.g. *indianapolis zoo*, *al-nassr fc*, *flagstar bank*, *world longest river in the world*, *knicks vs chicago bulls*). Two causes, both fixed:
   - **State-abbreviation false positives.** A 2-letter state code was matched anywhere it appeared, so the preposition "**in**" (Indiana), the name fragment "**al**" (Alabama), and "**pa**" (Pennsylvania) wrongly flagged keywords as geo-local. State codes are now matched only in the postal "City, **ST**" form (after a comma). Full state names, the major-city list, and the client's own discovered locations are unchanged.
   - **Missing client-relevance gate.** Unlike the Content & Journey panels (which gained this gate in v7.173), the Local panel surfaced every footprint keyword — including tangential ones that merely contained a city name. The Local panel now applies the same gate: a keyword is only treated as local if it shares vocabulary with the client's own content categories or brand. Nothing is fabricated — every excluded keyword has zero overlap with the client's categories/brand. Applied in both the panel and the scan route.

**Verification (own debugging agent):** detect logic harness **25/25** (abbr false-positives dropped, postal "City, ST" preserved, core intents intact, relevance gate keeps client keywords / drops the exact screenshot junk, gate is opt-in); route harness **14/14** (dry-run body is one parseable JSON object, full scan streams valid NDJSON, junk gated from both the credit estimate and the scan); `tsc` at **ES5** clean on all three changed files; jsdom render of the real panel **13/13** (only client-relevant local keywords shown, junk excluded, panel-scroll guard intact). Render snapshot: `orbitiq-v7.178-RENDER.html` (SAMPLE fixture, flagged).

**Files touched (3):** `lib/local/detect.ts` (abbr fix + `buildClientRelevance` + relevance gate in `classifyLocalKeywords`), `app/api/projects/[id]/local-scan/route.ts` (dry-run single-line fix + relevance gate), `components/brief/LocalSearchSection.tsx` (relevance gate). No files added or removed.

## v7.177 — 2026-06-13 · Local Search panel (#09) — map pack, reviews, locations, local competition & opportunities

**What changed:** the Local Search nav slot (#09) is now a full working panel. It activates only when the keyword set carries **local intent**, and surfaces — from real data only — how many locations the client has, how they perform in the Google map pack, how strong their reviews are, which local keywords have volume, who the local competition is, and where the search opportunities are.

**Local-intent detection (deterministic, no AI):** a new `lib/local/detect.ts` classifies every keyword as `near-me` (proximity phrasing), `geo-modifier` (a US state, a major city, or a term from the client's own discovered locations), or `implicit-local` (a physical-visit / local-business search such as "emergency dentist", "atm", "store hours"). Every classification records the literal matched term, so it is fully auditable. The panel stays dormant for non-local businesses.

**On-demand local scan (`/api/projects/[id]/local-scan`, streamed):** three steps, all on existing APIs —
1. **Discover listings** — a SerpAPI Maps brand search returns the client's Google Business listings (rating, reviews, GPS, website). Their cities feed the geo detector so detection adapts per client.
2. **Detect local keywords** — over the canonical keyword pool (same `buildKwPool` as every panel); scans the **top keywords by volume** (your choice).
3. **Map-pack scan** — for each local keyword, reads the Google local 3-pack from each location's GPS (`engine=google` + `ll`) and records your best pack rank + the pack members.
   Persists `semrushSnapshot._localScan` (additive). Determinate progress bar + ETA (global progress rule); a dry-run first reports the exact SerpAPI-credit estimate before any spend; snapshot-first + localStorage cache so results survive tab switches.

**Six views (`LocalSearchSection`):** Local Keywords (intent universe with real Semrush volume — works with no scan), Locations (discovered listings + health flags), Map Pack (rank per keyword from each location), Reviews (real rating + review count per location vs nearby pack leaders), Competition (Share of Local Voice across your packs), Opportunities (deterministic P0/P1/P2 — pack misses with volume at stake, rank-improvement levers, listing-health fixes). A composite **Local Visibility Index** blends presence (40%) · rank quality (25%) · reviews (20%) · listing completeness (15%) — weights shown in the UI, every input a real ratio.

**Defensibility:** every figure traces to a real SerpAPI row (map-pack place, Maps listing, rating/review count) or a real Semrush volume — nothing modeled or simulated. Star distribution / review velocity are intentionally **omitted** in v1 because they require a per-review pull (not fabricated).

**Architecture:** two new pure ES5-safe modules — `lib/local/detect.ts` (detection) and `lib/local/build.ts` (rollups: pack, reviews, share-of-voice, opportunities, index) — shared by the route, the panel, and the tests. New `app/api/projects/[id]/local-scan/route.ts` and `components/brief/LocalSearchSection.tsx`; SerpAPI `getMapsListings` + `getLocalPack` added to `lib/apis/serp.ts`; wired into `app/projects/[id]/page.tsx` (removed from "coming soon").

**Verification (own debugging agent):** `tsc` at **ES5** clean on all new files + the full `page.tsx` component tree; logic harness **32/32** (detection precedence, geo-vocab adaptivity, dedupe, pack rollup, share-of-voice no-double-count, opportunity tiers, review rollup, index); jsdom render of the real component **12/12** (detection banner, local-keyword table, non-local excluded, sub-nav, hero with scan, scan badges, **panel-scroll guard**: root is a block `overflow-y-auto`, not `flex flex-col`). Real-component render snapshot in `orbitiq-v7.177-RENDER.html` (SAMPLE fixture, flagged).

## v7.176 — 2026-06-13 · Content Plan (new sub-nav) + journey backfill into Keyword/Cluster panels

**What changed:** the journey topics now flow into every downstream panel, and the Content area is rebuilt around them with a new **Content Plan** sub-nav for writers.

**Backfill into existing panels:**
- **Keyword panel** now includes the deep-journey demand keywords (`includeDemand: true`), tagged with a cyan `demand` badge. The new topic keywords appear alongside the footprint.
- **Cluster panel** already surfaced deep-journey demand as "missing demand" clusters (v7.162/168/169) — unchanged, still keyed off the same demand universe.
- **Volume reconciles by construction:** the Keyword, Cluster, Content panel, and Content Plan all read the SAME `_demandUniverse` topic→keyword pool and sum the same verified Semrush volumes.

**Redesigned Content panel (`ContentMapSection`):** when a deep journey exists, the panel leads with a journey-fed explorer — summary cards that double as filters (All / Existing→optimise / Net-new→build / Quick wins, each carrying volume and an existing-vs-net-new split bar), a compact topic list, and a click-to-open right-hand drawer with the full detail. The legacy page/cluster mapping stays below under a "Detailed page & cluster mapping" divider.

**New Content Plan sub-nav (`ContentPlanSection`):** nested under Content in the left nav. A scope row (Total articles / Existing / Net-new, all with volume) sits above P0/P1/P2 priority filter cards; the list opens a drawer with a ready-to-write **brief** per topic — suggested title, H2 outline, People-Also-Ask questions, target keywords (with volumes), internal-linking instructions (derived from the journey edges), SERP-feature targets, refresh flags, quick-win badge, and competitive insight.

**Prioritisation (P0/P1/P2):** bucketed from distance-to-conversion (ordinal: product decision/support = closest, pre-product awareness = farthest) + search demand (vs. the topic-volume median) + audience-prompt coverage (a COUNT of segment prompts touching the topic — never a fabricated "conversation volume"). Quick wins = competitor-ranks-and-you-don't + close to conversion + real demand.

**Architecture:** two new pure, framework-free, ES5-safe modules — `lib/journey/graph.ts` (extended with per-topic member keywords + competitor) and new `lib/journey/contentPlan.ts` (`buildContentPlan` + `planFromSnapshot`, the single wiring point both Content panels share). New `components/brief/ContentPlanSection.tsx` exports the section + a reusable `ContentExplorer` used by both the Content panel and the Content Plan.

**Verification (own debugging agent):** content-plan + graph logic harness 18/18 (distance, priority tiers, quick-win, refresh, prompt coverage, briefs, internal links, SERP targets, **volume reconciliation**); `tsc` at **ES5** clean across all 6 touched files; jsdom render 11/11 (Content Plan scope row + priority cards + rows + drawer; redesigned Content panel filter cards + existing/net-new split + explorer leading). Panel-scroll rule confirmed (section roots are block `overflow-y-auto`; the drawer is `position:fixed`, no nested scroller).

**Files touched:** `lib/journey/graph.ts`, `lib/journey/contentPlan.ts` (new), `components/brief/ContentPlanSection.tsx` (new), `components/brief/ContentMapSection.tsx`, `components/brief/KeywordsPanel.tsx`, `app/projects/[id]/page.tsx`, `package.json`, `CHANGELOG.md`.

## v7.175 — 2026-06-13 · Connected Audience Journey (relationships + content feed)

**What changed:** the Audience Journey is rebuilt as ONE connected map instead of two disconnected lanes, and every topic now maps to a page (optimise) or a net-new build that feeds the Content panel.

**The model (repeatable for any client):**
- **Problem topics** (pre-product) are derived from each client's OWN audience-segment language (pre-LLM prompts + triggers), reduced to concise head-term seeds — no hardcoded vertical vocabulary, so the deep-journey build now generalises to any industry (verified with a non-cosmetic HVAC fixture). Labels are AI-phrased when available, else the title-cased seed.
- **Product topics** split into a CORE node (the named solution) plus SUPPORTING nodes (cost & financing, recovery, safety & candidacy, results & reviews, comparisons) — the content a buyer researches before deciding.
- **Three behaviour-based, data-derived edge kinds:** `co` (problem↔problem — Semrush surfaced both from the same seed = real co-search adjacency), `bridge` (problem→core — co-surfaced shared seed, or concern-vocabulary overlap = the moment a searcher discovers the solution), `support` (core→supporting). No edge is invented; each traces to a shared seed or shared token.
- **Content mapping on every node:** existing ranking page (links to the URL, optimise) vs net-new build, plus a content-plan rollup (optimise / build counts). The Content panel reads the SAME graph and lists every journey topic mapped to a page — one source of truth.

**Architecture:** new shared, framework-free module `lib/journey/graph.ts` (pure `buildJourneyGraph`) imported by BOTH `JourneySection` and `ContentMapSection`, ending the historical duplicate-builder drift. Footprint mode (no demand universe yet) keeps the prior two-lane view unchanged.

**Defensibility:** topics + volumes are real Semrush; edges trace to data; only node labels may be AI-phrased — no number is invented.

**Verification (own debugging agent):** graph logic harness 27/27 (edges, bridge, supporting-topic split, content plan, segment partition, AI labels); route seed logic 7/7 incl. cross-vertical repeatability; `tsc` at **ES5** clean on the module + both panels; jsdom render of the REAL `JourneySection` 13/13 (connected map, 3 edge legends, content plan, badges, core star — and footprint fallback unaffected); `ContentMapSection` render 5/5 (journey-feed section + counts). Panel-scroll rule confirmed (parent `overflow-y-auto` wrapper; SVG is normal-flow `height:auto`).

**Files touched:** `lib/journey/graph.ts` (new), `components/brief/JourneySection.tsx`, `components/brief/ContentMapSection.tsx`, `app/api/projects/[id]/demand-universe/route.ts`, `package.json`, `CHANGELOG.md`.

## v7.174 — 2026-06-09 · HOTFIX: v7.173 Vercel build failure (Set iteration at ES5)

**What broke:** the v7.173 deploy failed `npm run build` with `Type error: Type 'Set<string>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher` at `components/brief/ContentMapSection.tsx:310`.

**Root cause:** the project's `tsconfig.json` sets no `target`, so TypeScript defaults to **ES5**, where iterating a `Set` directly with `for…of` is illegal. The new gate's `for (const t of relevanceTokens)` (a `Set`) tripped it. My v7.173 verification used `target es2017`, which silently allowed the construct and missed it — the same ES5-default trap as the v7.166→v7.167 hotfix.

**Fix (1 line in each panel):** `for (const t of relevanceTokens)` → `for (const t of Array.from(relevanceTokens))` in `ContentMapSection.tsx` and `JourneySection.tsx`. No logic change — the relevance gate behaves identically.

**Verification hardened:** the isolated `tsc` check now runs at the project's real config (`--target ES5 --lib dom,dom.iterable,esnext`, no `downlevelIteration`). It reproduces the exact `TS2802` error on the bare-`Set` version and confirms the `Array.from` version compiles clean — for both files.

**Files touched:** `components/brief/ContentMapSection.tsx`, `components/brief/JourneySection.tsx`, `package.json`, `CHANGELOG.md`.

## v7.173 — 2026-06-09 · Content Plan / Journey: off-topic keywords filtered out of the demand universe

**What Wayne flagged:** in the Content Plan a brief's *content angle* read fine but its *Target Keywords* looked random and unrelated — e.g. a card showed `what is a hurricane`, `what is an ion`, `israel palestine conflict explained`, `what about daca` with 16.5M/mo volume.

**Root cause:** those keywords sat in the client's real Semrush/CSV data but named no body area, problem, or solution, so they all fell into the `'General Problem Searches'` catch-all bucket (`deterministicProblemTheme`). That bucket was then surfaced as a content brief whose angle came from the audience **segment trigger** (a polished sentence) while its keywords came from the **catch-all** — two different sources, hence the mismatch. The phantom 16.5M volume also inflated the rollup.

**Change — a deterministic client-relevance gate (`buildRelevanceTokens` + `isClientRelevant`), added identically to `components/brief/ContentMapSection.tsx` and `components/brief/JourneySection.tsx`.** A keyword now only enters the pre-product/problem pool if it is topically relevant to THIS client: it must EITHER hit a curated body-problem anchor (belly, chin, weight, fat, cellulite…), OR name a body area as a whole word (anatomy term), OR share a distinctive token with the client's own category names or brand. A keyword that matches none of these shares zero vocabulary with the client and is **dropped from the demand universe before clustering** — so it can never surface as a brief or roll into the Executive Summary.

**Defensibility:** no AI and no modeling. Every drop is explainable by the keyword having zero overlap with the client's anchors, anatomy, category names, or brand. The relevance vocabulary is the same body/aesthetic domain the panels already use, plus the client's real category and brand tokens. Verified with an isolated harness that extracts the actual shipped functions and asserts against the exact screenshot keywords: all four junk terms drop; legitimate body-problem keywords (`how to lose belly fat`, `double chin exercises`, `loose skin after weight loss`, `stubborn fat…`, `cellulite on thighs`, `arm flab`, `tummy bulge`, `lose weight fast`) all survive. Strict `tsc` clean.

**Why both panels:** `JourneySection.buildClusters` is the SAME function the Executive Summary consumes, so gating there keeps the journey, the content plan, and the rollup consistent.

**Files touched:** `components/brief/ContentMapSection.tsx`, `components/brief/JourneySection.tsx`, `package.json`, `CHANGELOG.md`.

## v7.172 — 2026-06-08 · Keyword Landscape sub-nav stays expanded

**What Wayne asked:** keep the Keyword Landscape sub-items (Keyword list / Theme clusters) always visible instead of collapsing when you navigate to another section.

**What changed:** in `app/projects/[id]/page.tsx`, the keywords sub-nav render condition dropped the `isActiveItem` gate — it now shows whenever results exist (`item.id === 'keywords' && hasResults`). Two supporting changes so the always-on row behaves correctly:
- Clicking a sub-item now also calls `setActiveSection('keywords')`, so selecting Keyword list / Theme clusters from any other panel navigates you to the Keyword panel (previously it only set the sub-view state and would have done nothing visible while another section was active).
- A sub-item only renders highlighted when the Keyword panel is the active section (`isActiveItem && keywordsSubView === sv`), so the expanded row shows no false highlight while you're viewing a different panel.

**Files touched:** `app/projects/[id]/page.tsx`, `package.json`, `CHANGELOG.md`.

## v7.171 — 2026-06-08 · Removed score number + status dot from left-nav rows

**What Wayne asked:** strip the per-section score values (e.g. 21.6, 12.1, 4.5, 0) and the trailing green/grey status dot from each item in the left navigation panel.

**What changed:** in `app/projects/[id]/page.tsx`, the nav row no longer renders the `score` span or the colored dot span. Each row is now just `number · icon · label`. The per-row `const score = navScores[item.id]` local was removed since it was only feeding those two spans.

**What was kept:** `calcNavScores`/`navScores` remain in place because `navItemStyles` still uses `hasData` (data-presence) to subtly tint each row's icon and label — that styling cue was not part of the removal request. The now-unused `styles.score` style object key was left intact (harmless, no behavior).

**Files touched:** `app/projects/[id]/page.tsx`, `package.json`, `CHANGELOG.md`.

## v7.170 — 2026-06-08 · Per-segment journeys now PARTITION (personas + Shared sum to the total)

**What Wayne flagged:** clicking a segment in the journey gave numbers that don't add up — All Segments 370, but Body-Change Seeker 370, Post-Journey Loose-Skin 367, Validation Shopper 365. They overlapped instead of summing to 370.

**Root cause:** the old per-segment filter (v7.158) showed the entire product lane (358 topics) to *every* segment, and showed pre-product topics with no/multi persona signal to *all* segments. So each segment inherited almost everything — the views overlapped and couldn't sum.

**Change (`components/brief/JourneySection.tsx`):** every theme is now assigned to **exactly one** bucket via `assignSeedSegments` — the single persona whose actual language (trigger, demographics, LLM prompts, tagline) best matches the theme's words, or a **"Shared / all personas"** bucket when no persona matches or several tie. `buildDemandNodes` filters **both** lanes by the theme's bucket, so each theme × stage node belongs to one bucket and the per-persona node counts **partition** the combined total: the three personas + Shared sum to it exactly. A new **"Shared / all personas"** tab surfaces the shared bucket.

**Defensibility:** attribution is real word-overlap against each persona's own language — never a modeled or share-weighted split (a topic everyone or no-one uniquely searches lands in Shared, honestly). The persona pill percentages (45/30/25) are unchanged — they remain the *audience* share, a separate metric from topic counts.

**Result:** All Segments = total; Body-Change Seeker + Post-Journey + Validation Shopper + Shared = the same total. No deep journey built ⇒ unchanged.

## v7.169 — 2026-06-08 · Theme Clusters re-granularized to TOPICS (theme × intent) so they align with the journey

**What Wayne flagged:** still showing 208 clusters but 370 journey topics — "every topic we write about should be a cluster; a cluster is a small group of similar-intent keywords about a single topic."

**Root cause:** the panel was counting *broad categories* (≈208), while each category secretly held several topic-level intent groups inside it. The journey already counts *topics* (theme × funnel-stage). So the two panels measured different units and could never line up.

**Change (`components/brief/ThemeClustersPanel.tsx`):** a "cluster" is now a **topic** = one theme at one intent/stage — exactly a category's intent sub-cluster, the same unit the journey uses.
- The panel **flattens every category into its topics** (`flattenTopics`) and counts/filters/rolls-up on those (`classifyTopic`). The big TOTAL CLUSTERS number, the ownership/performance/funnel pills, and the header all now count topics.
- Display is **two-level**: each category is a section header, with one small **topic card** per theme × intent inside it. Cards show stage · intent, content type, keyword count, monthly volume, content coverage, and a Winning / Trailing / Missing-demand badge; click to expand the keywords.
- Deep-journey demand now feeds back at the **topic** level: same-intent demand merges into the matching topic; a demand intent the category doesn't cover becomes a new "missing demand" **topic under that same category** (not a separate row); demand with no category match becomes its own demand category with topic cards.
- Demand-only topics are classed as a third lens (not client-rank, not competitor-gap); a footprint topic that merely absorbed same-intent demand keeps its footprint ownership.

**Result:** the cluster count rises from category-level (~208) to topic-level — the same granularity as the journey's 370 topics, so the two panels reconcile. (They draw from slightly different keyword sets — footprint+demand vs the demand universe — so the totals are aligned in *unit*, not guaranteed identical.) No deep journey built ⇒ identical behavior to before, just counted/displayed at topic granularity.

## v7.168 — 2026-06-08 · Deep journey feeds back into Theme Clusters (intent-aware merge)

**What Wayne flagged:** the Journey panel shows 370 topics but Theme Clusters shows only 195 — the deep-journey analysis should feed back into the cluster data and update the cluster panel.

**Two different units (why they never matched 1:1):** the Journey "topics" count is *theme × funnel-stage* nodes (one theme can appear up to 4× — once per stage). Theme Clusters counts *one row per category/seed*. So the panels measure different things; this release makes the deep-journey demand flow into clusters so the cluster panel grows to reflect the journey, using Wayne's intent-aware rule.

**Rule (Wayne):** surface every demand theme as a cluster — *if the search intent matches an existing footprint cluster, merge; if the intent differs, create a modifier in the title name.*

**Change (`components/brief/ThemeClustersPanel.tsx`, `buildThemeClusters` demand section):**
- A deep-journey demand keyword whose theme matches a footprint cluster **and** whose intent that cluster already covers → **merged** into that cluster's matching sub-cluster (no duplicate row; the cluster's volume grows; a cyan "+N deep-journey demand kws · X/mo" note appears on the card).
- A demand keyword matching a footprint cluster but at an intent it does **not** cover → surfaced as its **own** cluster titled **"{Category} — {Intent}"** (the modifier).
- A demand keyword matching **no** footprint category → seed-grouped "Missing demand" cluster (unchanged v7.162 behaviour).
- Merged demand keeps `origin:'demand'` and is **excluded from client-rank / competitor-gap ownership** counts (it is a third lens — it only adds to overall market demand / `totalVolume`).

**Result:** TOTAL CLUSTERS, "N keywords grouped by category", and annual/monthly volume now all reflect the deep-journey demand. No deep journey built ⇒ no `_demandUniverse` ⇒ identical to v7.167 (existing analyses untouched).

**Next:** roll this same demand-aware cluster count into the Executive Summary / Content Map rollup.

## v7.167 — 2026-06-08 · Hotfix: ES5 build error in the page-map route (nested function declaration)

**What Wayne hit:** Vercel build failed type-checking — `Function declarations are not allowed inside blocks in strict mode when targeting 'ES5'` at `app/api/projects/[id]/page-map/route.ts` (the concurrency `worker`).

**Root cause:** the project's `tsconfig.json` sets no `target`, so TypeScript defaults to ES5, which forbids a `function` declaration nested inside a block. The v7.166 page-map route declared `async function worker()` inside the stream's `start()` body. (My isolated `tsc` check had used target ES2020, so it didn't catch this — fixed below.)

**Fix:** `app/api/projects/[id]/page-map/route.ts` — `worker` is now an arrow const (`const worker = async (): Promise<void> => { … }`), which is legal in a block at ES5. No logic change. **Verification hardened:** the isolated `tsc` harness now targets ES5 with the project's `lib` (no `downlevelIteration`), which reproduces the exact build error on the v7.166 route and confirms v7.167 compiles clean; the component also passes ES5 (no raw Set/Map `for…of`). Route integration test 11/11 and render harness 24/24 + 10/10 still green (unchanged behaviour).

**Built on v7.166-src→v7.167-src, package.json 7.167.0, inner folder `orbitiq-v7.167/`, 78 files, zip in /tmp → cp to GEO `orbitiq-v7.167.zip`.**

## v7.166 — 2026-06-08 · Page-map rebuilt on unique pages + per-page keywords (fixes 605 + the 98k-keyword pull)

**What Wayne hit:** the pull still failed with `ERROR 605 :: Invalid display_offset` and the progress bar said it was "mapping 98k keywords." Both stem from the same wrong approach — pulling the entire `domain_organic` keyword footprint (98k rows ≈ 980k Semrush units) and paginating it (page 2's offset of 10,000 equals the page limit, which Semrush rejects). Wayne: we don't want to map every keyword — get the unique URLs in the footprint, then map those to the clusters.

**New approach (verified against the live Semrush API).** Decision via AskUserQuestion: map each unique URL to a cluster by its real ranking keywords.
- `lib/apis/semrush.ts` — two new functions: `getOrganicPages` (`domain_organic_unique` — the client's unique ranking URLs with keyword count + traffic, one request, no pagination → no 605) and `getUrlKeywords` (`url_organic` — the real keywords a single page ranks for).
- `app/api/projects/[id]/page-map/route.ts` — rewritten: pull unique pages (cap `maxPages`, default 100), then pull each page's top keywords (`kwPerPage`, default 25) with bounded concurrency (5) and live progress, and persist `_pageMap.pages = [{ url, keywords[], keywordCount, traffic, bestPosition }]`. Cost ≈ maxPages + maxPages×kwPerPage rows (≈26k units at defaults) instead of ~980k — and no full-footprint pull.
- `components/brief/ContentMapSection.tsx` — page-centric mapping: each unique page is assigned to the cluster its real keywords most belong to (`assignPageToCluster`, reusing the existing category/problem matching), independent of whether the analysis keyword set contained those keywords (so a CSV-loaded footprint still maps to its real pages). A cluster with ≥1 assigned page = Optimise, else Build net-new. Pages whose dominant theme isn't a plan cluster are counted as pulled-but-unmapped ("Existing Pages Mapped: N of M ranking pages") rather than forced into a wrong cluster. The Pages-view "Pages" column shows each cluster's mapped-page count. Live-mode analyses with inline ranking URLs still work via the existing keyword-url fallback when no page-pull exists.

**Verification:** isolated `tsc --noEmit` → exit 0. Route integration test (bundled real route, stubbed db/semrush/next-server, drove `POST`, read the stream) 11/11: start total = page count, one progress event per page, `pages[]` with lowercased real keywords + real keywordCount/traffic/bestPosition, no `byKeyword`, persisted to `snapshot._pageMap.pages`. Render harness 24/24 unchanged (live-mode url fallback) + new 10/10 page-centric test (two liposuction pages both assigned to the Liposuction cluster → Optimise, others net-new, correct counts + "of N ranking pages"). Real Semrush data confirmed live for sonobello.com via the Semrush MCP (`domain_organic_unique` returns unique URLs + keyword counts + traffic; `url_organic` returns real per-page keywords). Render shown in chat before delivery.

**Built on v7.165-src→v7.166-src, package.json 7.166.0, inner folder `orbitiq-v7.166/`, 78 files, zip in /tmp → cp to GEO `orbitiq-v7.166.zip`.**

## v7.165 — 2026-06-08 · Page-map stores UNIQUE pages (no per-keyword URL duplication)

**What Wayne asked for:** don't store a URL on every keyword — that's a lot of data and duplication (many keywords share one page). Instead pull the unique URLs and map each to its keywords → cluster → content plan.

**Change (data model).** `app/api/projects/[id]/page-map/route.ts` — instead of persisting `byKeyword` (the URL string repeated on every keyword), it now resolves each keyword's best-position ranking page, then groups keywords under their unique page and stores `_pageMap.pages = [{ url, keywords[], bestPosition, volume }]` (sorted by volume). The URL string is stored once per page with its keyword list, so the payload scales with the number of pages, not keywords. `components/brief/ContentMapSection.tsx` — `PageMap` now carries `pages[]` (with `byKeyword` kept optional for backward-compat with any older cached pull); the `urlByKeyword` memo inverts `pages` (url → its keywords) into keyword→url at load, so every downstream behaviour (cluster mapping, optimise/net-new, the Pages view) is unchanged. The keyword→cluster→content-plan flow is identical — only the stored shape is leaner.

**Verification:** isolated `tsc --noEmit` (component + route + semrush) → exit 0. Route integration test (bundled real route with stubbed db/semrush/next-server, drove `POST`, read the streamed `done`) 12/12: unique-pages shape with NO `byKeyword`, 2 unique pages from 5 rows, the two `liposuction` keywords grouped under one `/liposuction/` page with summed volume 1600 and bestPosition 5, a non-client keyword filtered out, a duplicate keyword's worse-position page dropped, persisted to `snapshot._pageMap.pages`. Render harness 24/24 unchanged, plus a new 8/8 test confirming a `pages`-shaped `_pageMap` (CSV-mode, no inline URLs on topKeywords) inverts correctly and lights up the Liposuction cluster as Optimise with its real page link while Tummy Tuck stays net-new.

**Built on v7.164-src→v7.165-src, package.json 7.165.0, inner folder `orbitiq-v7.165/`, 78 files, zip in /tmp → cp to GEO `orbitiq-v7.165.zip`.**

## v7.164 — 2026-06-08 · Hotfix: Semrush ERROR 605 on the page-map pull (display_offset=0)

**What Wayne hit:** clicking "Map ranking pages" failed with `Semrush API error 400: ERROR 605 :: Invalid display_offset parameter, must be a positive integer number and less than display_limit or it should be skipped`.

**Root cause:** `getOrganicKeywords` (`lib/apis/semrush.ts`) sent `display_offset=0` on the first page. Semrush rejects `0` — the parameter must be a positive integer below `display_limit`, or omitted entirely. FIX: only include `display_offset` for pages after the first (`offset > 0`); the first page omits it. One-line, type-safe, and it also hardens the analyze pipeline's footprint pull (same function).

**Verification:** isolated `tsc --noEmit` (component + route + semrush) → exit 0. Focused unit test bundling the real `semrush.ts` with a mocked fetch, 6/6: two pages fetched, page 1 has NO `display_offset` and `display_limit=10000`, page 2 has `display_offset=10000`, 10,005 rows accumulated across the short final page, ranking URL parsed. v7.163 Content Plan render/behaviour unchanged.

**Built on v7.163-src→v7.164-src, package.json 7.164.0, inner folder `orbitiq-v7.164/`, 78 files, zip in /tmp → cp to GEO `orbitiq-v7.164.zip`.**

## v7.163 — 2026-06-08 · Content Plan: map clusters to existing pages (optimise vs build net-new)

**What Wayne asked for:** (1) the Content Plan flashed a number on open — ~181 — then settled to ~45; he thought it was a hardcoded value hanging in the code. (2) Map the content clusters to the pages that already exist on the site versus the articles that are missing — count how many URLs match the existing clusters and which don't, so we can see how much existing content needs **optimising** versus how much must be **built net-new**, and surface that on the panel.

**The flash (not hardcoded — a recompute):** the panel computes "Articles Needed" from the analysis snapshot first, then fetches the uploaded/CSV client keywords from the DB and recomputes once client coverage is folded in (snapshot-only count → final count). FIX (`components/brief/ContentMapSection.tsx`): a `kwLoaded` gate holds the stat cards and views behind a "Loading content plan…" state until the uploaded keywords resolve, so no intermediate number ever paints.

**Existing-page mapping (real Semrush ranking URLs).** Decisions via AskUserQuestion: page source = **pull ranking URLs from Semrush** (the `Ur` column — the actual page that ranks for each keyword); classification = **any ranking page ⇒ optimise, zero ⇒ build net-new**.
- `lib/apis/semrush.ts` — `getOrganicKeywords` gains an optional `onPage` progress callback (default undefined → the analyze pipeline is byte-for-byte unchanged).
- NEW route `app/api/projects/[id]/page-map/route.ts` — on-demand, streamed NDJSON (start/progress/done/error) with a determinate bar + ETA. Pulls the client's organic ranking footprint (real `Ph,Po,Nq,Ur`), builds a keyword→best-ranking-page map trimmed to the client keyword set, and persists it on the snapshot as `_pageMap` (additive JSONB, no schema change). Opt-in button only — Semrush bills ~10 units/row, so spend is never automatic.
- `components/brief/ContentMapSection.tsx` — threads the real ranking URL onto every client keyword (snapshot `topKeywords[].url` first, the on-demand `_pageMap` overrides with a fresher pull). Each cluster now carries its distinct ranking pages, a `rankedKwCount`, and a `pageStatus` of `optimize`/`net-new`. New summary cards — **Optimise Existing**, **Build Net-New**, **Existing Pages Mapped**, **Monthly Volume at Stake** — replace the old gap-count cards. New default **🗺 Pages** view shows the cluster → existing-page mapping (cluster, optimise/net-new action, the actual ranking URL(s), keywords-with-a-page, monthly volume). When the analysis has no ranking-URL data (e.g. a CSV-loaded footprint), the view explains this and the "Map ranking pages" button pulls it from Semrush. The pull is cached in localStorage and hydrated snapshot-first so it survives leaving/re-entering the panel in-session (mirrors the demand-universe pattern).

**Defensibility:** every page shown is a real Semrush ranking URL — nothing is crawled-and-guessed or simulated. A cluster is "optimise" only when at least one of its keywords has a real ranking page; otherwise "net-new". The render shown to Wayne before delivery used a sample fixture to demonstrate the UI — real numbers come from his live analysis + the Semrush pull.

**Verification (machine):** isolated `tsc --noEmit` across the changed component + route + `semrush.ts` (faithful ambient stubs for `next/server`, `@/db`, `@/db/schema`, `drizzle-orm`) → exit 0. jsdom render harness driving the REAL default-export panel (createRoot + mocked `/keywords` fetch) **24/24**: flash fix (loading state before kw-load, no cards; cards appear after), the four new cards, default Pages view, optimise/net-new badges, real ranking-page links, "no ranking page" for net-new, optimise/net-new/pages-mapped counts (2 / 2 / 3 with URLs; 0 / 3 when URLs stripped), the no-URL CTA banner, and the panel scroll root. Render shown in chat before delivery.

**Built on v7.162-src→v7.163-src, package.json 7.163.0, inner folder `orbitiq-v7.163/`, 78 files (77 + new page-map route), zip in /tmp → cp to GEO `orbitiq-v7.163.zip`.** NEXT: optionally have the analyze pipeline always store ranking URLs so CSV-mode analyses don't need the manual pull; and roll the optimise/net-new split into the Executive Summary.

## v7.162 — 2026-06-08 · Theme Clusters: deep-journey demand flows back in as "Missing demand"

**What Wayne asked for (workflow design session):** the keyword footprint is only a starting signal. After we build the deep journeys (the demand universe — real Semrush volume for the discovery questions between a problem and a procedure), that data needs to flow **back** into the clusters so the clusters reflect overall **market demand = ranking footprint + deep-journey demand**, not just what the client/competitors already rank for. Classification decision (Wayne): deep-journey keywords are a distinct class — **"missing demand"**. Rank data does not override demand and demand does not override rank; they are different lenses. First release = backfill into the Theme Clusters panel.

**Foundation (`lib/utils/kwVolume.ts`):** `KwPoolItem` gains provenance — `origin: 'footprint' | 'demand'`, plus optional `inDemand` / `demandSeeds`. New **opt-in** `includeDemand` option (default **false**, so every existing caller is byte-for-byte unchanged) adds a §5 step that unions `semrushSnapshot._demandUniverse.topics` into the pool as `origin:'demand'`. Dedupe by keyword: a demand keyword already in the footprint is **not** re-added (no double-counted volume) — the footprint row is kept and flagged `inDemand`; a demand keyword not in the footprint becomes a "missing demand" row carrying its real Semrush volume (no rank, no competitor).

**Surface (`components/brief/ThemeClustersPanel.tsx`):** the panel opts into `includeDemand`. The ranking footprint flows through the existing category logic **unchanged**; the demand keywords are peeled off and grouped **by their journey seed** into distinct `type:'demand'` "Missing demand" clusters, so they never inflate the footprint cluster numbers. Demand is treated as a **third ownership class** (not client, not competitor gap): a new "Missing demand" filter pill (shown only when demand exists), demand excluded from Leading/Trailing/Low-Competition and from the client/competitor counts, and the funnel band now reads `client · gap · demand`. Demand cluster cards render a cyan "Missing demand" badge instead of Leading/Trailing. **When no deep journey has been built (`_demandUniverse` absent), the pool returns the identical footprint and the panel is byte-for-byte unchanged** — so existing analyses are untouched until a deep journey is run.

**Verification (machine):** isolated `tsc --noEmit` → exit 0; unit test on `buildKwPool` (opt-in off = unchanged pool; demand union dedupes against footprint, no double-count, real volume preserved); jsdom/SSR render harness (demand clusters appear with the "Missing demand" pill + badge, footprint cluster numbers unchanged, demand excluded from client/competitor/performance counts, panel scrolls). Rendered in chat before delivery.

**Built on v7.161-src→v7.162-src, package.json 7.162.0, inner folder `orbitiq-v7.162/`, 77 files, zip in /tmp → cp to GEO `orbitiq-v7.162.zip`.** First slice of the enrichment-loop build (backfill → clusters → rollup → stopping rule); next increments wire the cluster × journey-stage content-plan rollup and the loop stopping rule.

## v7.161 — 2026-06-08 · Audience Journeys: combined summary cards with pre/product split

**What Wayne asked for:** a journey summary between the legend and the lanes. Chosen design (from two options he floated): a single row of cards where each card shows the **overall total** across both lanes plus a **pre-product / product split** in the same card (so "Topics in journey" reads as X pre + Y product, "Existing" as X pre + Y product, etc.). Keep the existing per-lane completeness strips under each map.

**Change (`components/brief/JourneySection.tsx`, display only):** new `CombinedSummary` component rendered right after the `Legend`, before the lanes. Five cards — Topics in journey, Existing, Missing, Competitor only, Completeness — each with the combined number on top and, beneath, a two-segment bar (cyan = pre-product, purple = product) with "Pre N · Prod N" labels. Completeness shows the overall % bar plus "Pre %· Prod %" (each lane's own existing-coverage rate). Counts are derived from the same `preNodes`/`prodNodes` the lanes render, so the summary always reconciles with the maps. The per-lane `CompletenessRow` strips under each mind map are unchanged (kept, per Wayne).

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom/SSR render harness → **8/8**: the combined summary header + pre/product legend render, the Topics card appears in both the combined summary and the kept per-lane strips, split labels render, and there's no regression (run badge present, Liposuction/Breast Lift still in the product lane; summary also renders in footprint mode). Layout rendered + approved in chat before build.

**Built on v7.160-src→v7.161-src, package.json 7.161.0, inner folder `orbitiq-v7.161/`, 77 files, zip in /tmp → cp to GEO `orbitiq-v7.161.zip`.**

## v7.160 — 2026-06-08 · Audience Journeys: segment pills glow on hover

**What Wayne asked for:** make the stacked segment pills glow / activate on mouse hover. (Also confirmed the persona card + bracket correctly appear only once a specific segment is selected — "All Segments" intentionally shows neither.)

**Change (`components/brief/JourneySection.tsx`, display only):** added a `hoveredTab` state with `onMouseEnter`/`onMouseLeave` on each pill (including "All Segments"). A pill that is hovered **or** active now takes its accent color (text + border) plus a soft glow (`box-shadow: 0 0 0 1px {accent}22, 0 0 14px {accent}40`); hover also adds a faint accent background. The active state is unchanged otherwise, and the existing `transition: all 0.15s` animates the glow in/out. No logic, data, or layout changes.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom/SSR render harness → **9/9** unchanged (badges, All-Segments-hides-persona, lanes — no regression). The hover glow itself is a runtime `:hover`-equivalent state effect (not SSR-observable), but the hover wiring and styling are in place and type-checked.

**Built on v7.159-src→v7.160-src, package.json 7.160.0, inner folder `orbitiq-v7.160/`, 77 files, zip in /tmp → cp to GEO `orbitiq-v7.160.zip`.**

## v7.159 — 2026-06-08 · Audience Journeys header redesign: persona-up, bracket connector, run-status badge

**What Wayne asked for (design approved from an in-chat render first):** move the persona sentence + a larger portrait UP next to the stacked segment pills; draw a light connector with a containing bracket from the active segment pill to that persona (so the link is obvious), with the bracket pointing to the MIDDLE of the pill it's on; and on the right, wrap the build-universe text and add a badge showing whether the demand universe has ever been run / when it was last run.

**Layout (`components/brief/JourneySection.tsx`, display only):** the old below-the-tabs tagline block is gone. The header row is now: left zone = stacked segment pills + (when one segment is active) a 58px bracket gutter + a persona card (64px portrait, segment name, trigger sentence, italic quote); right column = Build/Rebuild button, the run-status badge, wrapped provenance, progress, and errors. On **"All Segments"** the persona card + connector collapse (pills + build control only).

**Bracket connector (measured, points to the pill middle):** new pure `buildConnector()` returns the SVG `line` + curly-`brace` path strings from container-relative coordinates. A layout effect (`useIsoLayoutEffect`, SSR-safe) measures the active pill, persona card, and zone via `getBoundingClientRect`, computes the geometry, and draws an absolutely-positioned overlay `<svg>` in the active segment's accent color: a faint line from the active pill's vertical center to a curly brace embracing the persona card's left edge. It recomputes on tab change, segment-data change, and container resize (`ResizeObserver` + window resize), so the line always lands on the selected pill's middle even as pills wrap.

**Run-status badge:** gray "Never run" (no universe yet), cyan "Building…" (during the stream), or green "Last run [date]" (from `_demandUniverse.builtAt`) once built. The "built [date]" text moved out of the provenance line into this badge.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. Pure `buildConnector` geometry unit test → **6/6**: the line STARTS at the active pill's middle Y, ENDS at the brace tip `(perLeft-15, perMid)`, the brace passes through the tip, and the line re-origins to a different pill's middle when the active pill changes (the "point to the middle of the pill" requirement). jsdom/SSR render harness → **9/9**: green "Last run" badge in demand mode, gray "Never run" in footprint mode, "All Segments" hides the persona card (trigger sentence absent), Rebuild/Build buttons + provenance correct, and Liposuction/Breast Lift still land in the product lane (no regression). Design rendered + approved in chat before build.

**Built on v7.158-src→v7.159-src, package.json 7.159.0, inner folder `orbitiq-v7.159/`, 77 files, zip in /tmp → cp to GEO `orbitiq-v7.159.zip`.** The connector's live geometry runs in the browser (refs + layout effect); the geometry function itself is unit-tested.

## v7.158 — 2026-06-08 · Audience Journeys: per-segment filtering + header rearrange

**What Wayne flagged:** (1) switching the audience-segment tab didn't change the journey — only the persona portrait + prompt chips changed, the mind-map nodes stayed the same; (2) rearrange the header so the three segment tabs stack on the left and the "Build deep journey" button moves to the right.

**(1) Per-segment journey (defensible, no rebuild) — `components/brief/JourneySection.tsx`:**
- New exported `buildSeedSegmentMap(universe, segments)` maps each pre-product **seed** to the segment(s) whose own language (`whoTheyAre.trigger` + `preLLMPrompts`) contains it. Demand topics already store their seeds and segments already store their language, so the attribution — "this segment talks about this problem" — is derived client-side from existing data; **no rebuild and no extra Semrush spend.**
- `buildDemandNodes` gained `activeSegmentId` + `seedToSegments`. With a segment active, the **pre-product lane** keeps only topics whose seed belongs to that segment (plus unattributed/generic topics); the **product lane** (procedures) stays cross-segment (procedures aren't segment-specific and there's no defensible per-segment product signal). "All Segments" shows the union (prior behavior). The component computes the map + `activeSegmentId` (`activeTab` → `null` for combined) and feeds them in; the demand memo now re-runs on tab change, so the lanes, completeness, and edges all update per segment.
- Footprint mode (no demand universe) is unchanged — clusters aren't segment-tagged, so it stays shared as before.

**(2) Header rearrange — same file, layout only:** the build control moved out of the title block. New row is `justify-between`: **left** = segment tabs stacked vertically (All Segments + each segment, full pills with portrait + volume %); **right** = the Build/Rebuild button with its provenance line, progress bar, and any error, right-aligned. No logic change to the build flow.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. Deterministic per-segment unit test on the exported `buildSeedSegmentMap` + `buildDemandNodes` → **7/7**: seed→segment map correct; All Segments shows both themes; Segment A shows only its theme (other filtered out); Segment B the inverse; product theme shown for both; and `preThemes(A) !== preThemes(B)` (the journey demonstrably changes between segments — the reported bug). Full demand/footprint render harness → **15/15** unchanged (no regression; combined view filters nothing). New layout rendered in chat before delivery.

**Built on v7.157-src→v7.158-src, package.json 7.158.0, inner folder `orbitiq-v7.158/`, 77 files, zip in /tmp → cp to GEO `orbitiq-v7.158.zip`.** Note: works on the already-built demand universe (no rebuild needed); product lane is intentionally shared across segments.

## v7.157 — 2026-06-08 · Fix: deep journey lost when leaving and re-entering the panel

**What Wayne saw:** built the deep journey, the data populated, then navigated to another panel and back — and it was gone (dropped back to "Build deep journey" / footprint mode).

**Root cause:** the Journey panel is conditionally mounted (`activeSection === 'journeys'` in `app/projects/[id]/page.tsx`), so leaving the tab **unmounts** it and returning **remounts** it fresh. The built universe was persisted server-side (`semrushSnapshot._demandUniverse`), but the parent page's `analysis` prop isn't refetched in-session, so on remount the panel re-initialized from the stale prop (no `_demandUniverse`) and showed footprint mode. The data was never lost in the database — it just wasn't read back in-session.

**Fix (`components/brief/JourneySection.tsx` only):** the built universe is now also cached in `localStorage` (`orbitiq-demand-{analysis.id}`) at build time, mirroring the existing journey-edges / problem-cluster caches. A new `readDemandCache(analysis)` resolves the universe **server snapshot first** (source of truth on a fresh page load) **then the localStorage cache** — used by both the `useState` initializer (instant, no footprint flash on remount) and the analysis-id sync effect. The `done` handler of the build stream writes the cache. No route/DB/data changes; the volume math and journey logic are untouched.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. Render harness reproducing the bug → **6/6**: stale footprint-only prop + empty cache renders footprint mode (the bug state); after the cache is populated (as a successful build would), a remount with the same stale prop **restores demand mode** (provenance + "Rebuild" + product node back); and a present server snapshot still wins on the fresh-load path. Full demand/footprint render harness → **15/15** unchanged (no regression). Rendered/verified before delivery.

**Built on v7.156-src→v7.157-src, package.json 7.157.0, inner folder `orbitiq-v7.157/`, 77 files, zip in /tmp → cp to GEO `orbitiq-v7.157.zip`.** NOTE: localStorage cache is per-browser; a fresh page load on any device still hydrates from the persisted DB snapshot, so nothing is browser-locked.

## v7.156 — 2026-06-08 · Deep-journey build: streamed progress bar + ETA (no more bare spinner)

**What Wayne flagged:** the v7.155 "Building deep journey…" button showed only an indefinite spinner — no sense of how far along, how long left, or whether it was stuck. He set this as a **standing rule**: any build/data-pull that makes the user wait must show live progress (what's left + ETA + still-working), for everything we build going forward. (Saved to long-term memory.)

**The fix — real streamed progress (not a fake timer):**
- `lib/apis/demandExpansion.ts` — `buildDemandUniverse` gained an `onProgress(done, total, seed)` callback, invoked after each seed completes. Total is the seed count, known up front.
- `app/api/projects/[id]/demand-universe/route.ts` — now returns a **streamed NDJSON `ReadableStream`** instead of one blocking JSON response. Emits `{type:'start', total}`, one `{type:'progress', done, total, seed}` per finished seed, then `{type:'done', demandUniverse}` (after persisting `_demandUniverse`), or `{type:'error', error}`. Pre-stream validation errors (missing key, no seeds) still return a normal JSON error with the right status code. Headers disable buffering so progress flushes live.
- `components/brief/JourneySection.tsx` — `buildDeepJourney` now reads the stream with a `ReadableStreamDefaultReader`, parses NDJSON line-by-line, and drives a new `DemandProgress` component: a **determinate bar** with "Seed X of N · <seed>", a percent, and a **live ETA** (`elapsed ÷ done × remaining`, formatted `~Ns`/`~Mm SSs`). Before the first seed finishes it shows an indeterminate "Starting — gathering seeds…" sweep so it never looks frozen. The footprint/demand journey logic is unchanged.

**Verification (machine):** isolated `tsc --noEmit` (both panels + both routes + module, ambient stubs incl. `@/db`/`drizzle-orm`, run in a fresh dir to dodge stale locked copies) → **exit 0**. Deterministic `onProgress` unit test (Semrush stubbed via esbuild alias, no network) → **6/6**: progress fires once per seed, every event carries `total=3`, `done` increments 1→2→3, the final event has `done===total` (bar hits 100%), the seed label is reported per step, deduped topic count correct. jsdom/SSR render harness on the **real** JourneySection → **15/15** unchanged (demand depth + overlay + within-theme edges; footprint fallback intact). Progress UI rendered in chat before delivery.

**Built on v7.155-src→v7.156-src, package.json 7.156.0, inner folder `orbitiq-v7.156/`, 77 files, zip in /tmp → cp to GEO `orbitiq-v7.156.zip`.**

## v7.155 — 2026-06-08 · Audience Journeys: demand-universe expansion (depth + defensible volume)

**What Wayne flagged:** the journey was too thin — a problem doesn't jump straight to a procedure; there are many discovery questions in between (how many ways people ask about "stubborn fat" or a "double chin"). Root concern, correctly diagnosed: the keyword corpus is the client/competitor *ranking footprint*, which is biased to mid/bottom-funnel and barely contains the upstream discovery layer — and since keywords → clusters → journey, a thin corpus caps the whole journey. He wants every topic defensible by real search (and/or conversation) volume.

**Proven first (live Semrush, in chat):** one seed "stubborn fat" returned 40+ question-format keywords with real MSV ("how to get rid of stubborn belly fat" 1,900/mo, "why is belly fat so stubborn" 70, sub-segments for arm/thigh/back/lower-belly) — none naming a procedure. Confirms the demand universe is far richer than the footprint and is reachable with defensible volumes.

**Decisions (AskUserQuestion):** (1) source the journey from a **demand universe + footprint overlay**, every node volume-backed; (2) anchor defensibility on **search volume**, with LLM-probe/PAA as labeled qualitative signals only — there is no defensible public "conversation volume" metric, so we don't invent one; (3) run the expansion **on-demand via a button** (not automatically) to control Semrush API spend; (4) **deep** budget — all seeds, 50 lines/report/seed.

**New (`lib/apis/semrush.ts`):** `getPhraseQuestions` + `getPhraseRelated` (type=phrase_questions / phrase_related, real MSV, US-or-project database), mirroring the existing report helpers + CSV parser.

**New (`lib/apis/demandExpansion.ts`):** `buildDemandUniverse(seeds, linesPerSeed, database)` — per seed runs both reports (Promise.allSettled so one failure never loses the rest), dedupes by keyword keeping max volume, tags each topic with its seeds + reports, returns topics sorted by volume + a status string. AI never invents a topic or number; everything is Semrush.

**New route (`app/api/projects/[id]/demand-universe/route.ts`):** on-demand POST. Loads the latest analysis, derives seeds = procedure category names (product side) + concise life-problem anchors found in the audience's own segment triggers/pre-LLM prompts (problem side; falls back to broad body-concern anchors), runs the deep expansion, tags each topic product/problem, and stores `semrushSnapshot._demandUniverse` (additive JSONB, no schema change). Mirrors the serp-scan route pattern; returns the universe for live use. Guarded for missing SEMRUSH_API_KEY / zero topics / failures.

**Panel (`components/brief/JourneySection.tsx`):** new "Build deep journey" button + provenance line (footprint-only vs "Demand universe · N volume-backed topics from M seeds · built …"). When `_demandUniverse` is present, `buildDemandNodes()` builds journey nodes as **theme × funnel stage** (so each theme shows its full awareness→consideration→decision depth instead of collapsing to one node), overlays the client/competitor ranking footprint as coverage state (existing/competitor/missing by exact keyword match), and draws **within-theme stage edges** — eliminating the v7.152 "everything points to one node" hub artifact (that was the deterministic fallback firing on sparse edges). Falls back to the v7.154 footprint build (and its AI edges) when no demand universe exists, so existing analyses render unchanged with no re-run. Every node shows a real MSV.

**Verification (machine):** isolated `tsc --noEmit` on the new module + route + both panels + the two existing routes (faithful ambient stubs for next/server, @anthropic-ai/sdk discriminated union, @/db, @/db/schema, drizzle-orm) → **exit 0** (re-run in a fresh dir to confirm it checked the new code, not a locked stale copy). jsdom/SSR harness on the **real** JourneySection → **15/15**: demand mode renders the provenance + "Rebuild" button, 7 theme×stage nodes from 8 topics (depth), Liposuction in the product lane / problem themes in pre-product (and not crossed), an existing-green node from the client footprint overlay + missing-red nodes, within-theme `<path>` edges, SVG present; footprint mode (no universe) still shows the "Build deep journey" button + v7.154 behavior (Breast Lift in product). Real SSR demand-mode render shown in chat + inline depth widget before delivery.

**Built on v7.154-src→v7.155-src, package.json 7.155.0, inner folder `orbitiq-v7.155/`, 77 files (75 + demandExpansion.ts + demand-universe route), zip in /tmp → cp to GEO `orbitiq-v7.155.zip`.** WAYNE NOTE: the deep build spends Semrush API units (~40/row; deep build across all seeds can be tens of thousands of units) and only runs when you click "Build deep journey"; result is cached on the analysis so reopening costs nothing.

## v7.154 — 2026-06-08 · Audience Journeys: pre-product vs product split fixed (solution awareness, not intent)

**What Wayne flagged:** named procedures like "Breast Lift" and "Love Handle Liposuction" were showing in the **Pre-Product** lane. His point: if a searcher types "breast lift", they already know the solution exists — that whole topic ("what is a breast lift", "how much does it cost", "recovery") is the **Product** journey. Pre-product is problem/desire language with no solution named: "my breasts are small what can I do", "how to make my breasts look larger", "loose skin after weight loss".

**The flaw:** the split was decided by *search intent dominance* — a procedure cluster whose dominant intent was informational was sent to pre-product. That's the wrong axis. The category pipeline (by design) files every keyword — pricing, cost, reviews, how-to — under its parent procedure, so a procedure cluster is solution-aware by definition and can never legitimately be pre-product. Result: informational-heavy procedures wrongly landed in pre-product.

**The fix (`components/brief/JourneySection.tsx`):** the journey split is now decided by **solution awareness**, not intent.
- A procedure / brand / location cluster is **always Product journey** (the old intent-dominance branch is deleted). Its informational/commercial/transactional sub-clusters simply become the awareness → consideration → decision stages *of the product journey*.
- A keyword is **Pre-Product only if it names no solution** — no distinctive procedure word (derived from the category name, e.g. "lift", "liposuction", "removal"; bare anatomy words like "breast"/"belly" are explicitly excluded so they never count), not the brand, no location signal. These problem-language keywords (including ones the server had mis-filed under a procedure by body part) are peeled out and grouped into their own **`problem`-type clusters** carrying their real Semrush volumes — they are no longer force-dumped into the first procedure.
- Brand/location membership for the split now uses a **strict substring** brand check (`brandedStrict`), dropping the fuzzy edit-distance path that matched "belly" ≈ "bello" (Sono **Bello**) and leaked problem searches into the brand/product lane. Strictly narrower than the prior `isBranded` — only removes false fuzzy matches.

**New route (`app/api/projects/[id]/journey-problem-clusters/route.ts`):** mirrors `/journey-edges` — Claude haiku, fault-tolerant, cached client-side in localStorage. Takes the pre-product keywords and returns life-problem **theme names** (e.g. "Loose Skin After Weight Loss"), never procedure names. On no API key / failure / bad JSON it returns empty and the panel falls back to deterministic anchor-based theme names, so the lane always renders on existing analyses with no re-run. All volume math stays in TypeScript on the client.

**Also fixed for consistency (`components/brief/ContentMapSection.tsx`):** this panel kept its own duplicate copy of the same intent-dominance logic, which would otherwise label the same Breast Lift cluster "pre-product" in the Content Map while the Journey panel calls it product. The identical solution-awareness rule (deterministic theme names — the pre-product content angle keys off the segment trigger, not the cluster name) is mirrored here so both panels agree on what "pre-product" means. The Executive Summary already imports `buildClusters` from JourneySection, so its journey-stage rollup picks up the corrected build automatically; it counts stage coverage (awareness/consideration/decision/retention) regardless of lane, so the rollup is unchanged in shape and slightly more accurate.

**Verification (machine):** isolated `tsc --noEmit` (both panels + both routes, faithful ambient stubs for `next/server` + a discriminated-union `@anthropic-ai/sdk`) → **exit 0**. jsdom/SSR harness on the **real** `JourneySection` with a fixture reproducing Wayne's case (procedures the server mis-filed by anatomy + genuine problem queries) → **19/19**: all six solution-named queries ("what is a breast lift", "breast lift cost/recovery", "liposuction reviews", "love handle liposuction", "sono bello reviews") classify **Product**; all five problem queries ("my breasts are small…", "how to make my breasts look larger", "loose skin after weight loss", "…belly fat…", "stubborn belly fat") classify **Pre-Product / problem-type**; the rendered component shows "Breast Lift" and "Liposuction" nodes in the Product lane and NOT in the Pre-Product lane, with life-problem theme nodes in the Pre-Product lane; SVG mind map present. The "belly" ≈ "bello" leak was caught and fixed by this harness before delivery. Rendered in chat before delivery.

## v7.153 — 2026-06-07 · Fix invalid next.config.js key (build warning)

**What Wayne saw:** the build logged `Invalid next.config.js options detected: Unrecognized key(s) in object: 'serverExternalPackages'`. The build still compiled and deployed (warning only), but the key was wrong for this Next.js version.

**Fix (`next.config.js` only):** `serverExternalPackages` is the Next.js **15** top-level key; on Next.js **14.2.15** (the version this app runs) it is rejected as unrecognized. Moved the setting back to its Next 14 home: `experimental.serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium']`. The webpack `externals` block is unchanged. No application/runtime/data behavior changes — this only removes the build warning.

**Verification:** `node --check next.config.js` → valid JS; key now nests under `experimental`. (No tsc/jsdom impact — config-only change; the v7.152 journey mind map is carried forward unchanged.)

## v7.152 — 2026-06-07 · Audience Journeys: topic-cluster mind map (pre-product vs product)

**What Wayne asked for:** rebuild the Journey panel into a visual mind map of the full user journey per audience segment. Each topic cluster is a node; the panel should show how many topics a complete journey needs and, of those, how many the client already has content for vs. how many are missing vs. owned only by a competitor. Nodes are color-coded for existing / missing / competitor, enlarge on hover with their connecting paths highlighted, and open a cluster detail on click. Topic-to-topic relationships are established so multiple paths can run from one cluster to another. The pre-product journey (has a problem, doesn't know the product exists) is kept separate from the product journey (knows the category). The persona portrait from Audience Segments is carried into the segment tabs here.

**Decisions (via the rendered concept + AskUserQuestion before build):** (1) edges are **AI-inferred** by Claude (labeled "topic links are AI-inferred" in the UI so they're never mistaken for measured SEO data); (2) node coverage state reuses the **existing `buildClusters` logic** — `existing` = client ranks for ≥1 keyword in the cluster, `competitor` = a competitor-gap cluster the client doesn't rank for, `missing` = neither; (3) layout = **funnel columns** (awareness → consideration → decision → retention).

**New route (`app/api/projects/[id]/journey-edges/route.ts`):** mirrors the `/clusters` intent route — Claude haiku, fault-tolerant, results cached client-side in localStorage. Takes the cluster list (name, stage, lane) and returns directed next-topic edges per lane `{ preProduct, product }`. Validates every returned edge against the known cluster names (drops self-loops, unknown names, duplicates). On any failure returns empty edges and the panel falls back to a deterministic funnel-stage ordering, so the map always renders.

**Panel (`components/brief/JourneySection.tsx`):** the two old cluster-pill lanes are replaced by an interactive SVG `MindMap` (nodes = clusters at their dominant funnel stage, color-coded by state; bezier edges with same-column bow; hover enlarges a node 1.15× and highlights its incident edges while dimming the rest; click selects a node into a shared `DetailPanel`). Adds `clusterToNode` (aggregates client vs. competitor volume from the cluster's sub-clusters to derive state, dominant stage, sample keywords), `stageOrderEdges` fallback, `CompletenessRow` (Topics in journey / Existing / Missing / Competitor only / Completeness %), `Legend`, `PromptStrip`, and `DetailPanel` (volume, kw count, stage, state badge, % client coverage, representative keywords, recommended action). Segment tabs now render the **carried persona portrait** (img when `personaImageUrl` is set, else initials in the accent ring) plus the volume %. `AudienceSegment` interface gained `personaImageUrl?`. Pre-product and product lanes are rendered as two separate mind maps. The `buildClusters` engine, intent/branded logic and all volume math are unchanged — this is a presentation + relationship-inference layer on top.

**Scroll:** the Journeys section is page-wrapped in `overflow-y-auto flex-1` (in `app/projects/[id]/page.tsx`); the section root remains a normal flowing flex column, so the whole panel scrolls (scroll rule preserved).

**Verification (machine):** isolated `tsc --noEmit` (component + new route, faithful ambient stubs for next/server + @anthropic-ai/sdk) → **exit 0**. jsdom/SSR harness on the **real** `JourneySection` (fixture with all three states across both lanes) → **21/21**: header, both lanes, AI-inferred legend note, all five node labels, all three state colors, completeness labels on both lanes, SVG edges (`<path>`) and `<svg>` present, stage column headers, persona-initials tab + 42% volume, empty detail-panel prompt. Rendered in chat before delivery.

## v7.151 — 2026-06-07 · Audience Segments: larger hero portrait, caption + AI badge removed

**What Wayne asked for:** after the persona portraits started generating (Blob now configured), make the hero card's portrait larger so it fills more of the card's vertical height, remove the small "AI-generated" caption under it, and remove the "AI" badge on the portraits.

**UI (`components/brief/AudienceSegmentsSection.tsx`, display-only):** the hero `PersonaAvatar` grew from 64px to **104px** and the hero header row switched from `items-start` to `items-center gap-5` so the bigger circular portrait sits centered against the badge/name/tagline block and fills more of the card height. The `flex-col` wrapper that held the portrait + caption is gone — the avatar now renders directly, and the **"AI-generated" caption text was removed**. The **"AI" corner badge was also removed from `PersonaAvatar`** (so it's gone from both the hero and the 3-up summary cards). Disclosure is preserved non-visually: the portrait keeps `alt="AI-generated portrait representing {name}"` and the wrapper keeps the hover `title` "AI-generated persona portrait — illustrative, not a real customer." The 44px summary-card portrait sizing and the initials fallback are otherwise unchanged, as are the v7.150 diagnostic line and the panel scroll root.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom/SSR harness on the **real** `AudienceSegmentsSection` → hero portrait renders at 104px, the "AI-generated" caption text node is **gone**, the visible "AI" badge is **gone** (no `>AI</span>` chip), the portrait `<img>` (with its AI-generated `alt`) is still present, and the 44px summary portraits still render. Rendered in chat before delivery.

## v7.150 — 2026-06-07 · Audience Segments: persona-image diagnostic status (why portraits are/aren't generating)

**What Wayne asked for:** after deploying v7.149, the persona portraits still showed the initials fallback. Vercel's log view collapses to one line per request, so the exact reason wasn't visible. This version makes the image step report *why* it produced no portraits, surfaced both in logs and on the panel.

**Utility (`lib/apis/personaImage.ts`):** `generatePersonaImages` now returns `{ segments, status }` (new `PersonaImageResult`) instead of just the segments. `status` is a short human-readable diagnostic: `"skipped: OPENAI_API_KEY not set"` (lists every missing prerequisite via a new `missingPrereqs()`), or after a real attempt `"N/M generated"` — and when N < M it appends `· first error: …`. `generateOne` now returns `{ url, error }` and classifies failures: OpenAI **HTTP 403 → "(org likely not verified for gpt-image-1)"**, 401 → "(bad/blocked OPENAI_API_KEY)", non-OK bodies, "openai returned no image data", and Blob `put()` failures as `"blob error: …"`. All still fully non-fatal — the analysis always completes and segments without a portrait keep the initials fallback.

**Pipeline (`app/api/synthesize/route.ts`):** stores the diagnostic into `semrushSnapshot._audienceSegmentsImageStatus` alongside `_audienceSegments` (additive JSONB field, no schema change). The `.catch` fallback now also yields a `failed: …` status instead of swallowing the reason.

**UI (`components/brief/AudienceSegmentsSection.tsx`, display only):** reads `_audienceSegmentsImageStatus` and shows a small amber line under the panel subtitle — `"Persona images — {status}"` — but **only when a status exists and at least one segment still has no portrait**, so it disappears once images work. The portraits, AI badge, and initials fallback from v7.149 are unchanged.

**How to use it:** redeploy this build, run one fresh analysis, then open Audience Segments. The amber line will read exactly why — e.g. `skipped: OPENAI_API_KEY not set` (key not in the deployed env → confirm Production scope + redeploy), `openai HTTP 403 (org likely not verified for gpt-image-1)` (verify your OpenAI org), or `blob error: …` (Blob store not provisioned). When it works it reads `3/3 generated` and the line vanishes.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom/SSR harness on the **real** `AudienceSegmentsSection` → the amber diagnostic line renders with the status text when `_audienceSegmentsImageStatus` is set and a segment lacks a portrait, and is **absent** when all segments have portraits; v7.149 portrait/badge/fallback checks still green. Rendered in chat before delivery.

## v7.149 — 2026-06-07 · Audience Segments: AI-generated persona portrait per segment

**What Wayne asked for:** add a persona image to each audience-segment card — a photoreal portrait representative of that segment, with a different image generated per segment. Direction approved from an in-chat render first: Option A (circular portrait on the left), photoreal style with an "AI-generated" label, generated during the analysis run and stored in Vercel Blob, via OpenAI gpt-image-1.

**New utility (`lib/apis/personaImage.ts`):** `generatePersonaImages(segments, { industry, clientName, idPrefix })` builds a respectful editorial head-and-shoulders prompt from each segment's own `whoTheyAre.demographics` + `creativeDirection`, calls OpenAI `gpt-image-1` (1024×1024, `n:1`, fetch-based — no new SDK dependency), decodes the returned `b64_json`, and uploads the PNG to Vercel Blob with `put(..., { access: 'public' })`. The public URL is attached to the segment as `personaImageUrl`. The prompt explicitly excludes text/logos, before/after, clinical or body-exposure framing, and multi-person collages so it stays defensible for health/cosmetic clients. **Data-integrity:** the portrait is an *illustration* derived only from the segment's text — never a real customer — and the panel labels every portrait "AI-generated" (corner "AI" badge + title, plus an "AI-generated" caption under the hero portrait).

**Fully fault-tolerant (matches the app's `.catch`-returns-data pattern):** `personaImagesEnabled()` requires both `OPENAI_API_KEY` and a Blob token; if either is missing it is a silent no-op and segments are returned unchanged. Each image is generated in its own try/catch (one failure never affects the others), generation runs in parallel across the 3-4 segments to stay inside the synthesis time budget, and segments that already carry a `personaImageUrl` (e.g. a resumed run) are skipped so retries never re-spend. The whole step is wrapped so the analysis always completes even with no images.

**Pipeline (`app/api/synthesize/route.ts`):** after Phase-2 synthesis and before the final DB write, `synthesis.personas` is passed through `generatePersonaImages(...)` and the result is stored into `semrushSnapshot._audienceSegments` (no schema change — additive field on the existing JSONB). The call is `.catch`-guarded to fall back to the original personas.

**UI (`components/brief/AudienceSegmentsSection.tsx`, display only):** new `PersonaAvatar` component renders the photo as a circular, accent-ringed portrait when present, else a graceful initials fallback (so the panel looks right before/without images). Placed Option-A style — a 64px portrait to the left of the hero header (badge/name/tagline shift into a `flex-1` column beside it, with an "AI-generated" caption under the portrait) and a 44px portrait to the left of each 3-up summary card's badge. `AudienceSegment` gains optional `personaImageUrl`. Panel scroll root unchanged (`overflow-y-auto flex-1`).

**Config:** `.env.example` documents the new optional `OPENAI_API_KEY` and notes Blob is now used for portraits as well as PDF export. **Wayne action to light it up:** add `OPENAI_API_KEY` in Vercel → Settings → Environment Variables and ensure Blob is enabled; until then the panel shows initials-fallback avatars and everything else works.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom on the **real** `AudienceSegmentsSection` (fixtures with and without `personaImageUrl`) → renders the `<img>` portrait with the "AI" badge + "AI-generated" caption when a URL is present, the initials-fallback circle when absent, in both the summary cards and the hero, and the panel still scrolls. Built card rendered in chat before delivery.

## v7.148 — 2026-06-07 · Theme Clusters: funnel-stage roll-up moved into the top row as a half inverted-pyramid

**What Wayne asked for:** change the cluster-summary card layout — move the funnel-stage summary up into the top row as a third column, and instead of boxes, render it as an inverted pyramid cut in half with the flat edge on the right so the stage words/info sit beside it. Layout approved from an in-chat render before build; funnel bands stay clickable to filter.

**UI (`components/brief/ThemeClustersPanel.tsx`, display/layout only — ZERO change to any metric, classification, ownership, or volume math):** the top region went from a 2-column grid (total-clusters hero · Leading/Trailing/Low-Competition stack) to a 3-column grid `minmax(0,1.15fr) minmax(0,1fr) minmax(0,1.2fr)`. Column 3 now holds the funnel-stage roll-up — previously a separate full-width 4-box row below the cards, now **removed** from there. It renders as a half inverted pyramid: four horizontal bands (Awareness → Retention) whose right edge is flat (vertical) and whose left edge steps in 18% per stage, drawn with `clip-path: polygon(...)` so the four bands read as one continuous funnel narrowing downward. Band colors deepen down the funnel (`#8B85FF → #6C63FF → #574DD6 → #443AA8`). Each band's stage label, cluster count, and `N client · M gap · annualVol` split sit immediately to the right of the flat edge. Every band is a `<button>` that filters the grid to that dominant stage (re-click → back to all), with an active highlight + ACTIVE pill, exactly as the old funnel cards did. Data source is the unchanged `stageRollups` derivation (`dominantStage`, client-footprint vs competitor-gap, annual = monthly × 12) — same numbers, new shape. Panel root scroll container unchanged (`flex:1, overflowY:auto`).

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom on the **real** `ThemeClustersPanel` (9-kw fixture → 3 clusters) → top-row + funnel harness: 3-column grid present, four funnel bands render with correct per-stage counts and `clip-path` flat-right geometry, clicking a band filters the grid ("Showing X of N") and toggles back to all on re-click, the old standalone funnel-card row is gone, and the panel still scrolls. Built layout rendered in chat before delivery.

## v7.147 — 2026-06-06 · Theme Clusters filter nav: added a performance group (Winning / Trailing / Low Competition) + glowing-line framing

**What Wayne asked for:** add Winning, Trailing, and Low Competition to the pill nav; give the bar more padding and space above and below; frame it with a couple of glowing horizontal lines.

**UI (`components/brief/ThemeClustersPanel.tsx`, display only):** the nav now carries three groups, divider-separated — ownership (All clusters · Client only · Competitor only) · performance (Winning · Trailing · Low Competition) · funnel stage (the four stages). The performance pills reuse the existing `leading` / `trailing` / `opportunity` filters that already drive the top summary cards, with matching accent colors on their counts (Winning green, Trailing pink, Low Competition blue). "Winning" is Wayne's label for the Leading filter — note the top summary card still reads "Leading" for the same filter (same state, two labels). The bar gained more internal padding (16×14) and outer margin (22px above / 20px below), and is framed top and bottom by a 1px purple gradient line with a soft glow (`box-shadow 0 0 6px rgba(108,99,255,0.45)`) instead of the flat hairline borders. No new filters or metrics — the three performance pills are entry points to filters that already existed.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom on the **real** `ThemeClustersPanel` (9-kw fixture → 3 clusters) → **nav harness 20/20** (15 prior + 5 new) + **funnel harness 20/20 (40 total)**: performance pills render exact counts (Winning 2 = the two leading clusters, Trailing 1, Low Competition 0); Winning → "Showing 2 of 3", Trailing → "Showing 1 of 3"; All clusters resets. All ownership + stage checks still green. Built nav rendered in chat before delivery.

## v7.146 — 2026-06-06 · Theme Clusters: filter nav between the summary cards and the grid (ownership + funnel stage)

**What Wayne asked for:** a small navigation inserted between the summary cards and the cluster grid that both separates the two zones and filters/sorts the clusters by — All clusters, Client only, Competitor only, and the four funnel stages (Awareness, Consideration, Decision, Retention). Style chosen: pill segments. "Client only / Competitor only" defined as majority ownership (same client-footprint vs gap split the funnel cards use).

**UI (`components/brief/ThemeClustersPanel.tsx`, display + derivation only — no change to any metric or volume math):** the bare 1px divider and the old status/filter row are replaced by a pill-segment nav with top + bottom hairline borders, so the nav *is* the separator. Two groups split by a divider: ownership (All clusters · Client only · Competitor only) and funnel stage (the four stages), each pill carrying a live count (client count in green, gap in amber, stage counts muted). The active pill is solid purple. A right-aligned status line shows `N clusters · click a card to expand` (all) or `Showing X of N` (filtered), and the intent-classification spinner moved into the bar.

**Shared filter state — nothing fights.** The nav reuses the single `filter` state already shared by the summary cards (Leading/Trailing/Low-Competition) and the v7.145 funnel-stage cards, so clicking a stage pill or its funnel card does the same thing and the active highlight stays in sync. `ClusterFilter` gained `'client' | 'competitor'`; the grid filter now also handles those two (client = `isClientFootprint`, competitor = `!isClientFootprint` — the v7.145 majority-keyword ownership, so the two counts sum to the total cluster count). Re-clicking an active non-"all" pill clears back to all. Empty-state copy generalised ("No clusters match this filter." when a filter yields zero, vs the run-an-analysis message only when there is no cluster data at all).

**Verification (machine):** isolated `tsc --noEmit` (component + `kwVolume`) → **exit 0**. jsdom on the **real** `ThemeClustersPanel` with the same controlled fixture (9 keywords → 3 clusters: Liposuction = Awareness/client, Tummy Tuck = Consideration/gap, Pricing = Decision/client) → **nav harness 15/15** + **funnel harness 20/20 (35 total)**: pills render exact counts (All 3 · Client only 2 · Competitor only 1 · Awareness 1 · Consideration 1 · Decision 1 · Retention 0); clicking Client only → "Showing 2 of 3" with Liposuction + Pricing and Tummy Tuck excluded; Competitor only → "Showing 1 of 3"; Consideration pill → "Showing 1 of 3"; All clusters resets; re-clicking an active pill clears to all. Panel still scrolls (`ClustersTab` root `overflowY:auto` unchanged). Built pill nav rendered in chat (Client-only active) before delivery.

## v7.145 — 2026-06-06 · Theme Clusters: new "Clusters by funnel stage" card row (client footprint vs competitor gap)

**What Wayne asked for:** on the Theme Clusters panel, a row of summary cards below the main cards and above the cluster grid, showing how many clusters fall in each funnel stage, split by how many come from the **client footprint** vs the **competitor gap**. His framing: "keywords drive the intent which get grouped to a cluster, then that cluster is the output and identified per funnel stage — so 5 clusters in awareness, 10 in consideration, etc."

**How the numbers are derived (defendable, no new data):** every metric reuses the existing keyword pool (`buildKwPool`, shared with Keyword Landscape and Executive Summary) and the panel's existing intent classification — nothing new is fetched or estimated.
- **Stage assignment.** Keyword → intent (signal detection + Claude pass) → `INTENT_META.stage`: informational→Awareness, commercial→Consideration, transactional→Decision, navigational→Retention. Each cluster is assigned to exactly **one** stage — the stage holding the most of its keywords (ties resolve to the earliest stage in journey order). So the four stage buckets sum exactly to the total cluster count; no cluster is double-counted.
- **Client footprint vs competitor gap.** Each keyword is cleanly either client-ranked (`!isGap`) or a competitor gap (`isGap`). A cluster is counted as **client footprint** when the client ranks for at least half of its keywords, otherwise **competitor gap**. The on-screen sub-line states this rule.
- Annual volume per stage = the stage's clusters' monthly search volume × 12 (same annualisation the other cards use).

**UI (`components/brief/ThemeClustersPanel.tsx`, display + derivation only — zero change to existing metrics):** a new "Clusters by funnel stage" row sits between the top cards and the divider. Four cards (Awareness, Consideration, Decision, Retention), each showing the stage's total cluster count, a green/amber split bar + readout (`N client · M gap`, using the same green=client / amber=gap legend as the panel header), and the stage's annual search volume. Each card is clickable and filters the cluster grid to that stage (click again to clear), consistent with the existing Leading/Trailing/Low-Competition cards. `ClusterStat` gained `stage` + `isClientFootprint`; `ClusterFilter` gained the four stage keys. No change to the Leading/Trailing/Low-Competition logic, the cluster grid, or any volume math.

**Verification (machine):** isolated `tsc --noEmit` on the changed component + `kwVolume` → **exit 0**. jsdom harness mounting the **real** `ThemeClustersPanel` (esbuild bundle, mocked `/keywords` + `/clusters` fetch) with a controlled fixture (9 keywords → intents → 3 clusters) → **20/20**: Awareness 1 cluster (1 client · 0 gap), Consideration 1 (0 client · 1 gap), Decision 1 (1 client · 0 gap), Retention 0; stage buckets sum to the 3-cluster total; clicking the Awareness card filters the grid to "Showing 1 of 3 clusters" (Liposuction only). Panel still scrolls (`ClustersTab` root `overflowY:auto` unchanged).

## v7.144 — 2026-06-06 · FIX (recurring): Keywords panel wouldn't scroll after a large CSV reload — root made a plain block scroller

**Symptom (Wayne):** reloaded the CSV files, and the Keywords panel stopped scrolling again.

**Root cause — a flexbox scroll-stealing trap.** v7.139 made the panel root the vertical scroller (`flex flex-col flex-1 min-h-0 overflow-y-auto`) and gave the table wrapper `overflow-x-auto`. But `overflow-x: auto` makes the browser compute `overflow-y` to `auto` too, so the wrapper became a **scroll container** — and a scroll container that is a **flex item gets an automatic `min-height: 0`**. So in the flex column, every fixed section above (toolbar, summary cards, Rank Distribution, scan bars — all `shrink-0`) kept its size while flexbox shrank the **only** shrinkable item, the table wrapper, down to absorb the overflow. The panel root therefore never overflowed (so it never scrolled), and once the reloaded CSVs made the content tall, the wrapper collapsed and the page froze in place. This is the same class of bug as the earlier scroll reports — it only surfaced again at large data volume.

**Fix (`components/brief/KeywordsPanel.tsx`, 1 line):** the root is now a plain **block** scroll container — `flex-1 min-h-0 overflow-y-auto` (dropped `flex flex-col`). With no flex context, children stack in normal flow at their natural height and the root scrolls the entire panel; the table wrapper's `overflow-x-auto` still gives the wide table its own horizontal scroll without ever stealing the vertical scroll. No flex-item `min-height: 0` trap, so it can't recur at any data size. (Children used `shrink-0` only to hold size in the flex column — harmless no-ops in block flow; layout is visually identical.)

**Panel audit (per Wayne's standing request that ALL panels scroll):** Executive Summary, Content Map, Google Ranks, SERP Features each root on `overflow-y-auto flex-1`; LLM / Audience / Journeys are wrapped in a scroller by `page.tsx`; Theme Clusters uses a compact fixed-header + inner `overflow-y:auto` body that fits. Keywords was the only one with the flex-item trap.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom harness on the real component → **19/19**, including a new guard (**A1b**) asserting the root is the block scroller and is NOT a `flex flex-col` (locks the fix against regression), alongside the existing A1 `overflow-y-auto` check. All v7.140–v7.143 checks still green.

## v7.143 — 2026-06-06 · Hardened client CSV upload: reports "saved X of N rows" + stores client rows under one canonical tag

**Context (verified against Wayne's live DB):** the client footprint showed ~171 even though `sonobello-high volume.csv` has 731 rows. Reading `project_keywords` directly: only ~171 unique client keywords are actually stored, split across TWO tags — ~168 rows with a blank domain and ~123 tagged with the literal client domain `sonobello.com` (both `type:ranked`, overlapping). The competitor blocks (airsculpt.com ~456, bruggemanplasticsurgery.com ~76) are intact. So the panel was faithfully reporting the DB; the **stored client data was incomplete** — the 731-row upload didn't fully persist, and earlier uploads tagged client rows two different ways. Wayne chose "harden the upload + re-upload."

**Changes (2 files):**
- `components/brief/KeywordsPanel.tsx` (client CSV uploader) — full row accounting. The result toast now reads **"Saved X of N CSV rows"** with a breakdown of everything that didn't land: duplicate keywords in the file, blank/unparseable rows, and — critically — **rows that failed to save** (HTTP/network errors are now counted as `failed`, not silently folded into "skipped"). A partial upload (the cause of the 731→171 gap) is now impossible to miss instead of looking like a clean success. Toast persists 10s.
- `app/api/projects/[id]/keywords/batch/route.ts` — (1) client rows are stored under **one canonical tag** (blank domain) so the footprint can never split across `''` vs the literal client domain again; (2) a client re-upload's replace/dedup scope now covers the **whole** client bucket (`''` + NULL + client domain), so re-uploading heals the existing split in place. Competitor uploads and the v7.100 competitor-row repair are unchanged.

**What Wayne does next:** re-upload `sonobello-high volume.csv` via the Keyword Landscape **Upload CSV** button. The toast will say e.g. "Saved 731 of 731 CSV rows" — or, if rows still drop, exactly how many failed, which tells us precisely where to look next. Client footprint then reflects the full CSV.

**Verification (machine):** isolated `tsc --noEmit` (component + `kwVolume`) → **exit 0**. Component jsdom harness → **18/18** (unchanged render). New **route harness 8/8** (real `POST` bundled via esbuild with stubbed `@/db`/`@/db/schema`/`drizzle-orm`/`next/server`): client rows stored under blank domain + kept `ranked`; existing client rows (any tag) detected for replace; in-file duplicate counted as skipped; inserted+updated = unique payload; competitor rows keep their domain and are forced to `gap`. Includes the v7.142 pool-precedence fix.

## v7.142 — 2026-06-06 · FIX: uploaded client CSV footprint was being swallowed by the auto-crawl gap set (client showed 136 instead of the full 731)

**Symptom (Wayne):** uploaded the client footprint CSV (`sonobello-high volume.csv`, 731 keyword rows) but the panel showed only **136** client keywords.

**Verified against the live database** (read-only, via the production API): the 731 client CSV rows ARE stored correctly — `source:'csv'`, `type:'ranked'`, empty domain (client). So the upload worked; the **pool builder** was miscounting them.

**Root cause (`lib/utils/kwVolume.ts` `buildKwPool`, the shared pool used by the cards, exec summary, and clusters):** the build order was (1) crawl client `topKeywords` → (2) crawl `gapKeywords` → (3) uploaded rows, deduping by keyword with **first-seen wins**. This project runs `dataSource: auto` with a **client volume floor of 500**, so the auto-crawl only knew the client ranked for vol≥500 terms (≈136). Every *lower-volume* client keyword that a competitor also ranks for landed in the crawl `gapKeywords`. When the client then uploaded their full CSV, those keywords were already "seen" as gap, so the uploaded client rows were **skipped** — ~600 of the 731 were silently reclassified as competitor gap, leaving client stuck at the crawl's 136.

**Fix:** reordered `buildKwPool` so the client's OWN uploaded footprint is authoritative. New order: (1) crawl client `topKeywords` → (2) **uploaded CLIENT rows (non-gap)** → (3) crawl `gapKeywords` (only those not already claimed as client) → (4) uploaded GAP rows (competitor CSVs). A keyword the client uploaded as ranked now wins the dedup and counts as **client**, and is correctly **excluded from gap** (gap = competitor terms genuinely not in the client footprint — crawl *or* CSV). Same total pool, correct client/gap split. No other logic changed; competitor uploads and volume floors behave as before.

**Effect on Wayne's data:** client footprint jumps from 136 to the full uploaded CSV footprint; the keywords that were wrongly inflating Competitor Gap move back to client. Every number stays backed by real DB rows. (The v7.141 chart reconciliation means the Rank Distribution client side moves in lockstep.)

**Verification (machine):** isolated `tsc --noEmit` (`kwVolume.ts` + `KeywordsPanel.tsx`) → **exit 0**. jsdom harness on the **real** component → **18/18**, including the decisive case: a keyword present in BOTH the crawl gap set AND an uploaded client row is counted as **client, not gap** (client 9 / gap 4, vs the pre-fix 8 / 5), plus the chart client side ("sonobello · 9 kw") tracking it. All v7.139–v7.141 checks still green.

## v7.141 — 2026-06-06 · Rank Distribution: client side reconciled to the real keyword pool (one client footprint number everywhere)

**Request (Wayne):** "It should be client data (whether from CSV upload or crawl) plus competitor gap (also from CSV or crawled)" — i.e. one consistent client number, not the chart's 2,329 sitting next to the cards' 136.

**Root cause:** the Rank Distribution client side read `semrushSnapshot.positionDist` — a stand-alone band-COUNT aggregate. On Wayne's (legacy) analysis that aggregate held the full ranked-footprint count (2,329) while only ~136 individual client keyword ROWS were persisted, so the chart and the cards (which build from the real keyword pool) disagreed. The aggregate count isn't backed by stored keyword rows → not defensible.

**Fix (1 file, `components/brief/KeywordsPanel.tsx`, additive):** new `clientDist` memo buckets the **same real pool** the cards use (`summaryRows` = crawl `topKeywords` + CSV uploads, no volume floor) into the four rank bands (counts + volume), skipping unranked rows (no rank band). `RankDistributionSplit` now receives `clientDist.dist`/`clientDist.vol` instead of the snapshot `positionDist`/`positionVol`. Result: the chart's "Client · N kw" equals the cards' client count — **client footprint + competitor gap is now consistent across the header, the cards, and the chart**, every bar backed by real keywords on file. Competitor side unchanged (already real: snapshot full-footprint dists, or the v7.139 0-unit fallback). No API/data-pull changes.

**Note for Wayne (on screen + here):** this makes the client number *smaller but real* (the 2,329 was an unbacked legacy count). To make the real number *larger*, run a Full "Refresh Analysis" — the old keyword cap is gone, so it now pulls and stores the complete client footprint, and every number rises together while staying defensible.

**Verification (machine):** isolated `tsc --noEmit` → **exit 0**. jsdom harness on the **real** component → **16/16**, incl. new checks that the chart client side uses the real pool ("sonobello · 6 kw", matching the cards' 6 client rows) and does **not** use the stale standalone aggregate (the fixture's `positionDist` total of 5). All v7.139/v7.140 checks (scroll, competitor fallback, client-only Branded/Non-branded, All = sum) still green.

## v7.140 — 2026-06-06 · Keywords summary cards: Branded & Non-branded are now CLIENT-only; All = Branded + Non-branded + Gap

**Request (Wayne, after v7.139):** make each summary card mean exactly one thing — "All keywords = branded from client + non-branded from client + competitor gap; Branded = only branded client terms; Non-branded = only non-branded client terms; Gap = only terms not in the client's footprint."

**Bug fixed (1 file, `components/brief/KeywordsPanel.tsx`, `kwSummary` only):** the **Non-branded** card was counting *every* non-branded keyword in the pool — which includes the competitor-gap terms (gap rows are non-branded by construction). On Wayne's data that read **720** (≈ 33 client non-branded + 687 gap) instead of the ~33 client non-branded terms. Branded already excluded gap (gap is never branded), so it was already client-only.

**Change:** `kwSummary` now derives a `clientRows` slice (`type !== 'gap'`) and computes **Branded = clientRows ∩ branded** and **Non-branded = clientRows ∩ non-branded** — both client-footprint only. **Competitor Gap** = gap rows (competitor terms the client doesn't rank for). **All Keywords** is now computed as the literal **sum of the three** (`brandedCount + nonBrandCount + gapCount`, and the same for annual volume), so the headline always equals what the three cards show. The "N client + M gap" sub-line uses `clientCount = branded + non-branded`. Still on the full-footprint (no volume floor) basis from v7.139; the table below stays volume-filtered, so cards can read higher than visible rows — by design.

**Net effect on Wayne's screenshot numbers:** All Keywords **823** unchanged (136 client + 687 gap); Branded **103** unchanged; **Non-branded 720 → ~33** (client non-branded only); Competitor Gap **687** unchanged. The three cards now sum exactly to All.

**Verification (machine):** isolated `tsc --noEmit` over `KeywordsPanel.tsx` + `kwVolume` → **exit 0**. jsdom harness on the **real** component (esbuild `--jsx=automatic`, fixture with 1 branded + 5 non-branded client terms + 5 gap) → **14/14**, including the decisive check that **Non-branded excludes gap** (no card shows the would-be-buggy 10) and All = 11 = 1 + 5 + 5 with sub-line "6 client + 5 gap". v7.139 checks (scroll, competitor-distribution fallback vs snapshot) all still green.

## v7.139 — 2026-06-06 · Keywords panel: scroll fix + competitor Rank Distribution populates from data on file + "All Keywords" = full footprint + gap

Three Keywords-panel items from Wayne, all **client-side only** (no API/route/data-pull changes — single file `components/brief/KeywordsPanel.tsx`):

**1. Scroll fix (panel was unscrollable).** Root cause: the panel root was `overflow-hidden` with only the inner table as a scroller. Once v7.136 added the Rank Distribution to the fixed (non-scrolling) top region — toolbar + 4 summary cards + the split chart + scan bar — that region could exceed the viewport, so the chart/cards became unreachable and the table got squeezed. Fix: the **panel root is now the single vertical scroller** (`overflow-y-auto`); the table wrapper handles horizontal overflow only (`overflow-x-auto`, no fixed height). This matches every other section rendered into the `overflow-hidden` `<main>`. **Panel audit:** ExecutiveSummary, ContentMap, GoogleSerp, SerpFeatures each own a root `overflow-y-auto` scroller; LLM/Audience/Journeys are wrapped in a scroller by `page.tsx`; ThemeClusters uses a compact fixed-header + scrolling body that fits. KeywordsPanel was the only one whose fixed region had grown past the viewport.

**2. Competitor Rank Distribution now populates from data already on the page (0 Semrush units).** Root cause: the competitor side only filled from `semrushSnapshot.competitorPositionDist`, which is built **only** on a full Semrush re-analysis or an uploaded-footprint build — so a gap-refresh / data-only refresh (or any older snapshot) left it empty, which is why Wayne's refresh didn't populate it. Fix: when the precomputed dist is absent, the competitor distribution is now **bucketed client-side** from competitor keywords already loaded — uploaded competitor CSV rows (`domain` + `position`) and snapshot `gapKeywords` (`competitor` + `competitorPosition`), deduped by domain+keyword (uploaded rows win). Exactly matches the card's promise ("computed from data already pulled · 0 extra Semrush units"); a small note appears on the card when the fallback basis is used. The full-footprint snapshot dist is still preferred when present.

**3. "All Keywords" total = full footprint + gap (Wayne's decision, AskUserQuestion).** Root cause of the confusion: the four summary cards counted the **volume-floored** keyword pool (same set as the table), while the Rank Distribution right below shows the client's **full** footprint — so "823" sat under "Client · 2,329 kw" and looked client-only/too small. Fix: the summary cards now compute from an **unfloored** pool (`summaryRows` = `buildKwPool` with `clientVolMin=0, competitorVolMin=0`), so **All Keywords = full client footprint + all competitor-gap keywords**, reconciling with the Rank Distribution client count. Branded/Non-branded/Competitor-Gap cards switch to the same full basis so they still sum to the total. The All Keywords card subtitle now shows the live breakdown **"N client + M gap"**. The table below intentionally stays volume-filtered, so the cards read higher than the visible rows — by design. **Confirmed (no change needed):** Competitor Gap already = keywords a competitor ranks for that the client does **not** (client-ranked and client-branded terms are stripped server-side), for both uploaded CSVs and auto-detected Semrush data.

**Verification (machine):** isolated `tsc --noEmit` (strict, bundler resolution) over the changed `KeywordsPanel.tsx` + its `kwVolume` util → **exit 0**. jsdom harness mounting the **real** `KeywordsPanel` (esbuild bundle, mocked `/keywords` fetch, two fixtures) → **13/13**: root `overflow-y-auto`; All Keywords = 10 (5 client + 5 gap) with subtitle "5 client + 5 gap"; Branded 0 / Competitor Gap 5; competitor card populated from the **fallback** (gapKeywords + uploaded rows) with the on-file note and **no** "re-run" empty box; and when `competitorPositionDist` IS in the snapshot it's used directly with **no** fallback note.

## v7.138 — 2026-06-06 · FIX (no data loss): a failed/interrupted run no longer masks existing results — page shows the latest COMPLETED analysis

**Symptom (Wayne):** after a Full re-analysis failed with a network error, the project showed the pre-run data-source picker ("How should OrbitIQ source keyword footprint data?") as if all data was gone.

**Root cause — display only, NO data was lost.** Every `/api/analyze` run `INSERT`s a NEW `analyses` row (route.ts:90); old completed rows are retained (the data-mode recovery already relies on this, scanning up to 15 recent completed rows). But the project page derived the displayed analysis as `project.analyses?.[0]` — the newest row by `triggeredAt`, regardless of status. The failed re-run became row [0] with `status:'failed'`, so `hasResults = (status==='completed')` was false and the UI fell back to the run screen, **masking** the prior completed analysis still sitting in the DB at row [1]. Pre-existing logic since well before the rank-distribution work — the failed run merely exposed it.

**Fix (1 file, `app/projects/[id]/page.tsx`, display-selection only):**
- `const latestAnalysis = project?.analyses?.[0] ?? null;` (newest row, any status)
- `const analysis = project?.analyses?.find(a => a.status === 'completed') ?? latestAnalysis;` — display now prefers the most recent COMPLETED analysis, falling back to the newest row only when nothing has completed yet (true first run / first-run-in-progress).
- The resume/checkpoint detection (`requestAnalysisWithEstimate` + `triggerAnalysis`) now reads `latestAnalysis` instead of the displayed row, so resuming an interrupted run still targets that interrupted run (not the last good one). Report/keyword-count refs continue to use the displayed (completed) `analysis`, which is correct.

**Effect:** Wayne's existing completed analysis reappears immediately on load — **no re-run, no API units**. A failed/interrupted refresh now leaves the last good results on screen (with the dismissable failure banner), instead of blanking the project. The projects API still returns the latest 5 rows, so the completed row is in range in the realistic case (a failed run is row [0], the completed one row [1]).

**Verification (machine):** **full-project `tsc --noEmit` exit 0** (real deps installed in a clean /tmp copy — 505 packages; the whole app type-checks, incl. the v7.136/137 rank-distribution changes). Row-selection unit test **8/8**: failed-newest→displays completed + resume targets the failed row; running-newest→keeps showing completed + resume targets running; only-failed→run screen; only-completed; empty→run screen; newest-completed wins after a successful refresh.

## v7.137 — 2026-06-06 · Rank Distribution hardening: gap-refresh keeps client volume in sync + uploaded (CSV) footprints now populate the cards

**Request (Wayne):** two follow-ups to v7.136's Rank Distribution, approved after review: (1) in Gap & rank refresh mode, keep client volume-per-band in sync with the refreshed counts; (2) populate the competitor distribution for projects running on an uploaded CSV footprint (which skip the Semrush pull), so they get the cards too.

**Why:** v7.136 only computed the new `positionVol` / `competitorPositionDist` / `competitorPositionVol` on a FULL Semrush re-analysis. Gap-refresh recomputed `positionDist` (counts) but not `positionVol`, leaving client volume stale after an incremental refresh; and the uploaded-footprint path (`buildSnapshotFromUploads`) never produced any of the new fields, so CSV-based projects showed count-only client bars + the competitor "re-run" hint forever.

**Changes (3 files, additive — no existing metric/classification logic changed):**
- `lib/apis/semrush.ts` — `export` the three v7.136 bucketing helpers (`buildVolumeDistribution`, `buildCompetitorPositionDistribution`, `buildCompetitorVolumeDistribution`) so the uploaded-footprint builder reuses the *exact* same bucket definition (single source of truth). No logic change.
- `lib/apis/uploadedFootprint.ts` — compute `positionVol` from the uploaded client `topKeywords`, and `competitorPositionDist` / `competitorPositionVol` by grouping the uploaded `gapKeywords` by competitor domain (blank/unknown domains skipped). Added all three to the returned snapshot. For CSV projects the uploaded rows *are* the footprint, so this is the full available data — defensible, nothing modeled.
- `app/api/analyze/route.ts` (gaps mode merge) — recompute `newPositionVol` alongside the existing `newPositionDist` from `mergedTopKeywords` and add it to `mergedSnapshot`. **Competitor dists are deliberately NOT recomputed here** — gap mode only pulls net-new gap keywords (not each competitor's full footprint), so the accurate full-footprint dists from the last FULL run are preserved untouched via the `...existingSnapshot` spread (avoids overwriting good data with a gap-subset approximation).

**Unchanged:** `components/brief/KeywordsPanel.tsx` (the v7.136 `RankDistributionSplit` UI) is byte-identical — these changes only feed it more-populated data. Data-only refresh mode is untouched (it never rebuilds the footprint).

**Verification (machine):**
- Isolated `tsc --noEmit` (TS 5.5.4, strict/bundler, node types) over the changed library files + a synthetic mirror of the route's `mergedSnapshot` shape (with stubbed `@/db` / `@/db/schema` / `drizzle-orm`): **exit 0, no type errors**.
- Pure-logic checks on the real exported helpers + the exact new code paths: **14/14** — uploaded `positionVol` buckets exact; per-competitor grouping yields correct counts+volume for compA/compB and skips blank-domain rows (no 999-vol leak); gaps-mode `positionVol` sums correctly incl. null-position → 21+, counts unchanged.
- v7.136 component harness (19/19) still applies — UI file unchanged.

## v7.136 — 2026-06-06 · Keywords: split-screen Rank Distribution (client vs selectable competitor) — kw + volume + share per rank band

**Request (Wayne):** On the Keywords panel, under the summary cards, add a split-screen horizontal bar chart — client volume/rank distribution (1–3, 4–10, Page 2, Page 3+) on the left, the same for competitors on the right. Then: add search volume to each band alongside the keyword count and the share %. Rendered in-chat and approved before build. Rebased onto v7.135 (the v7.134/v7.135 numbers were taken by a parallel session's Exec-LLM and Clusters-layout changes; this work is orthogonal — it touches only `KeywordsPanel.tsx` and `semrush.ts`, which those releases did not).

**Data integrity (told Wayne up front):**
- The **client** side is a true full-footprint distribution — `semrushSnapshot.positionDist` (counts) and the new `positionVol` (monthly volume), both bucketed from the client's full organic pull (`topKeywords`).
- The **competitor** side needed new data: the app never persisted a competitor's full-footprint distribution (only the filtered *gap* subset, deduped across competitors — not defensible per-competitor). So v7.136 persists `competitorPositionDist` (counts) and `competitorPositionVol` (monthly volume), keyed by competitor domain. These are computed from the competitor organic rows **already fetched** for the gap analysis (`gapResults`, before gap filtering) — **zero additional Semrush API units**. Empty competitor pulls are skipped, so no fabricated all-zero band is ever stored.
- Per Wayne's choice (AskUserQuestion): the competitor card is a **selectable dropdown** over the tracked competitor domains, defaulting to `analysis.topCompetitor` when present.
- The share % and bar length are **volume-driven** (each band's volume as a share of that entity's total footprint volume); the footer is page-1 share by volume. Volume is annualized for display via `fmtKwAnn` (monthly × 12) to match the Category Breakdown's "Annual Demand" convention directly below. Older snapshots (pre-v7.136, no volume fields) fall back to count-based bars/%; snapshots with no competitor field show a "re-run to populate" hint (Wayne re-runs once — 0 extra units — to populate).

**Changes (2 files, additive — no existing metric/classification logic changed):**
- `lib/apis/semrush.ts` — `SemrushSnapshot` gains optional `positionVol`, `competitorPositionDist`, `competitorPositionVol`. New pure helpers `buildVolumeDistribution`, `buildCompetitorPositionDistribution`, `buildCompetitorVolumeDistribution` (identical bucket cutoffs to `buildPositionDistribution`: ≤3 / ≤10 / ≤20 / 21+; competitor rows with no/zero rank are skipped). Per-competitor dists built from `gapResults[i]` (↔ `gapDomains[i]`) and added to the returned snapshot (persisted via the existing jsonb write — no route change).
- `components/brief/KeywordsPanel.tsx` — new `RankDistributionSplit` + `RankDistBars` rendered directly under the summary cards. Reads only from the canonical snapshot; client left / competitor right; per band: `count kw · annual vol · volume %`; shared bar scale across both cards; competitor dropdown; volume-mode and count-mode; competitor empty-state. App dark styling + existing rank-bucket colors (#6C63FF / #06B6D4 / #F59E0B / #EF4444).

**Verification (machine):**
- Isolated `tsc --noEmit` (TS 5.5.4, project's strict/bundler settings) over the two changed files + their real dependency (`lib/utils/kwVolume.ts`): **exit 0, no type errors**.
- jsdom harness mounting the **real** extracted `RankDistributionSplit` via react-dom/client: **19/19** — header + bands render, client `6 kw` + annualized `7.3M` vol + `14.9%` page-1 vol share, default competitor = `topCompetitor`, compA `54.6%`, dropdown switch → compB `150 kw` + `10.6%`, empty-competitor "Re-run the analysis" hint + no `<select>`, count-mode hides volume token and shows count-based `8.5%`, null client → renders nothing.
- Pure-function data check on the real `semrush.ts` bucketing helpers: **13/13** — count and volume bucket boundaries exact (1/3/4/10/11/20/21/100), competitor 0/null-rank rows skipped with no volume leak.
- In-chat render approved before build.

## v7.135 — 2026-06-06 · Clusters: top cards rearranged into 2-column layout (total hero left, group cards stacked right) + total card now clickable

**Request (Wayne):** On the Clusters panel, rearrange the top card panels — put the overall total clusters / volume on the left, and stack all three group cards (Leading, Trailing, Low Competition) on the right. Make every card clickable to filter the cluster grid by that grouping. Rendered an in-chat preview first; approved, then built.

**Changes (1 file, display/layout-only — no metric or classification logic changed):**
- `components/brief/ThemeClustersPanel.tsx` (`ClustersTab`) — replaced the full-width centered hero + the `repeat(3, 1fr)` summary-card row with a single 2-column grid (`minmax(0, 1.05fr) minmax(0, 1fr)`).
  - **Left:** the Total-clusters / annual-vol / monthly-vol hero is now a `<button>` that sets `filter='all'` and shows the active highlight (purple `#9B96FF` ring) when `filter === 'all'`. Hero font sizes trimmed slightly (count 72→60, annual 28→26, monthly 20→19) to fit the side-by-side height.
  - **Right:** the existing `SUMMARY_CARDS` (Leading / Trailing / Low Competition) now render in a vertical flex stack (`flex: 1` each) with a horizontal internal layout — label + subtitle on the left, count + annual vol right-aligned. Same toggle-to-filter behavior (click again to clear), same accent colors, same `ACTIVE` pill.
  - All counts, volumes (`ann()`, `totalAnnualVol`, `totalMonthlyVol`), and the `clusterStats` classification (`isLeading`, `compGapPct`, opportunity rule) are UNCHANGED — only markup/styling moved. The grid-filter logic (`filtered`) and downstream cluster grid are untouched.

**Verification:** full-project `tsc --noEmit` (see build log). Layout previewed in-chat before build per project workflow.

## v7.134 — 2026-06-05 · Exec: SOV card renamed "Share of Voice on Google" + head-to-head replaced with LLM visibility (platform bars + sentiment)

**Request (Wayne):** on the Executive Summary, rename the Share-of-Voice card to "Share of Voice on Google", and replace the right-side head-to-head scorecard with an LLM-visibility view.

**Data-integrity note (told Wayne up front):** the LLM probe (`llm_probe_v2`) records whether OUR brand was mentioned per answer (+ platform + sentiment), but does NOT capture which competitors appear in those answers — so a true competitor "share of voice" for LLMs is not computable from stored data without re-architecting the probe + a re-scan. Wayne chose (AskUserQuestion) the honest, available-now option: per-platform mention bars + sentiment. (True LLM SOV remains a future build: extract competitor brand mentions from probe responses.)

**Changes (2 files, display-only — no metric/data logic changed):**
- `components/brief/GoogleSerpSection.tsx` — `SovPanel` gains an optional `title` prop (defaults to "Share of Voice"); the three header render states (notice / empty / main) now show `{title ?? 'Share of Voice'}`. The Google Ranks (nav 06) call passes no title, so it is UNCHANGED ("Share of Voice"); only the exec overrides it.
- `components/brief/ExecutiveSummarySection.tsx` — exec's `SovPanel` now passes `title="Share of Voice on Google"`. The head-to-head scorecard (and its now-dead rival derivations) is REPLACED by an LLM-visibility card: per-platform mention-rate bars (Claude / ChatGPT badge + bar + "N/M prompts cited" + %), an "Overall citation rate" line (`overallLlmRate` · mentions/total), and a "Sentiment when mentioned" stacked bar (positive/neutral/negative) shown only when `llmSent.total > 0`. All values come from the already-computed `llmPlatforms` / `overallLlmRate` / `overallMentions` / `overallTotal` and the probe's `sentiment` aggregate — zero new data. Empty state: "Run the LLM probe to see AI answer citations."

**Verification:** full-project `tsc --noEmit` exit 0 (clean /tmp env incl. v7.131 scroll fix + v7.132 serp scan). jsdom harness on the REAL component: 33/33 — adds SOV-titled-"on Google", LLM card title, overall citation-rate line, sentiment bar (1 positive), head-to-head removed; all prior 28 checks (score math, confidence, ladder, journey, headline gating, etc.) still green. Built on v7.133 (carries the full merged feature set). Zip 72 files, inner folder orbitiq-v7.134/, integrity OK.

## v7.133 — 2026-06-05 · Exec value-adds rebased onto v7.132 (GEO Score, confidence, quick-wins ladder, head-to-head) — parallel-session merge

**Why this version exists:** a parallel session shipped v7.131 (Content Map scroll fix) and v7.132 (SERP one-click auto-batch) on top of v7.130. This session independently built the Executive Summary value-adds and first packaged them (incorrectly) as v7.131, colliding with the scroll-fix release. RESOLUTION: the exec value-adds were rebased on top of v7.132-src and shipped here as v7.133, so this single build carries EVERYTHING: v7.130 GEO-story reframe + v7.131 scroll fix + v7.132 background SERP scan + the exec value-adds below. The mislabeled standalone v7.131 exec build was removed; v7.131 is restored to its true scroll-fix content. DEPLOY v7.133.

**Exec value-adds (items 2–6 from Wayne's value brainstorm; all from existing canonical data, zero new sources):**
- **GEO Visibility Score (0–100)** — lead KPI band. Equal-weighted mean of Traditional (`page1Pct`), AI visibility (`aiVisPct` = AIO citation rate → LLM fallback), Journey (`journeyStagesCovered/4·100`). If AI is unmeasured the dimension is EXCLUDED and the formula line says so (never zero-filled). Shows score + three component bars + live formula; added to the roll-up footer.
- **Read-confidence meter** — % of 5 data signals present (keywords / competitors / AI Overviews / LLM probe / journey clusters) with missing ones named.
- **Where to spend first — quick-wins ladder** — three effort/payoff tiers from real position bands (Quick win pos 4–10→top3, Climber pos 11–20→page1, Big bet gaps→new content) with measured kw count + searches/yr. Replaces the old standalone volume-split card.
- **Value-at-stake (modeled clicks)** — per-tier estimated annual clicks via an industry-average organic CTR-by-position curve (pos1 .28 … pos8 .025); on-screen note labels searches measured, clicks modeled.
- **Head-to-head vs top rival** — scorecard beside the SOV donut: Share of voice, Page-1 keywords (rival from uploaded competitor rows; "—" + upload hint when absent), Gap kws they own. Top rival + shares from the same `computeSov()`; gap attribution from canonical `gapItems`.

**Changes vs v7.132:** `components/brief/ExecutiveSummarySection.tsx` only — added `fmtCompact()`, score/confidence/ladder/CTR/head-to-head derivations, render extended (score band as lead, head-to-head replaces the volume-split card in the evidence row, ladder before the priority actions). v7.132's SERP-scan and v7.131's scroll fix are untouched and intact.

**Verification:** full-project `tsc --noEmit` exit 0 in a clean /tmp env that includes the v7.131 scroll fix + v7.132 SERP-scan code (so the merge type-checks end-to-end). jsdom harness on the REAL merged component: 30/30 — deterministic score math (with-AI 100/6/75→60; AI-excluded 100/75→88), confidence 5/5 vs 3/5 w/ named missing signals, all three ladder tiers + modeled-click labels, head-to-head vs rival + share-of-voice row, old volume-split removed, all 15 v7.130 checks green. Zip: 72 files, inner folder orbitiq-v7.133/, integrity OK.

## v7.132 — 2026-06-05 · SERP scan: one-click auto-batch + runs in the background across panels

**Request (Wayne):** the SERP scan made him click "Scan next 75" over and over. He asked for (1) a single button that batches automatically to completion, and (2) the scan to keep running in the background while he navigates to other panels. Chose (via prompt): full background scan + a credit-cost confirmation before auto-running.

**What changed — the scan is lifted out of the Keywords panel into the always-mounted project shell**, so the loop survives navigation between panels.

- `app/api/projects/[id]/serp-scan/route.ts`: new `{ dryRun: true }` flag → returns the unscanned `remaining` count with **0 SerpAPI credits and no DB write**. Powers the cost-confirm modal. (filter='all'/'aio' path only; rescan unaffected.)
- `app/projects/[id]/page.tsx`: page-level auto-batch runner (`requestSerpScan` dry-run → confirm modal → `runSerpScan` loops 75-keyword batches until the server reports 0 remaining). Each batch is its own request (Vercel ~300s cap = one batch/request); the server saves every batch and excludes already-scanned keywords, so the loop just keeps going and an error can be **resumed** from where it stopped. A **global progress bar** sits below the header and is visible on *every* panel (running / paused+Resume / complete+Dismiss). A **cost-confirm modal** ("Scan all N · ~N credits") gates the run. `serpScanRef` guards double-start.
- `components/brief/KeywordsPanel.tsx`: the in-panel button now delegates to the page runner (`onStartSerpScan`), shows live page-level progress ("Scanning… N of M"), and its label became "Scan all N remaining · ~N credits". Page-level results merge into the table + coverage count live (new `mergedScanned`, fresh-wins). Falls back to the legacy single-batch button if the props aren't supplied.
- `components/brief/SerpFeaturesSection.tsx`: new `externalScanned` prop merges the background-scan results into `scannedKws` live, so the SERP Features panel updates as the scan progresses.

**Honest limit (stated to Wayne):** "background" = keeps running while you browse other panels **as long as the browser tab stays open**. It is browser-driven, not server-side, so closing the tab or sleeping the laptop pauses it — completed batches are saved and it resumes on return. The AIO citation scan and the per-card "Refresh required" rescans already auto-batch and were left as-is.

**Verified (machine):** full-project `tsc --noEmit` exit 0 in clean `/tmp` env, 0 errors. Route harness 10/10 (real route bundled via esbuild + stubbed db/serp/pool): dryRun returns remaining=3 with **0 scan calls + 0 persists**, real batch scans 3 + persists once. Component harness 8/8 (real KeywordsPanel + SerpFeaturesSection mounted in jsdom): external results merge into coverage ("4 of 5"), button reads "Scan all 1 remaining", legacy label gone, click delegates to `onStartSerpScan`, running shows "Scanning… 75 of 300", SerpFeatures output changes live with `externalScanned`. UI states (button / confirm modal / running bar / paused+resume) rendered in chat. No data/logic touched in metrics — display + orchestration only.

## v7.131 — 2026-06-05 · Fix: Content Map panel would not scroll

**Request (Wayne):** "In the content panel from the left side nav, it does not seem to be allowing me to scroll up and down."

**Root cause:** The left-nav content area (`app/projects/[id]/page.tsx`) renders each section inside `<main className="flex-1 overflow-hidden flex flex-col">`. Because `main` is `overflow-hidden`, every section must supply its own scroll container. The other raw-rendered sections do: ExecutiveSummary / GoogleSerp / SerpFeatures use `overflow-y-auto flex-1`, KeywordsPanel uses an inner `overflow-auto flex-1 min-h-0` table, ThemeClustersPanel uses `flex:1, overflowY:auto`. **ContentMapSection's root `<div>` was the only one without one** — it was just `display:flex; flexDirection:column; gap:0`. With no `flex:1` and no `overflowY:auto`, its content was clipped at the bottom of the viewport with no way to scroll (the "Content Plan" / Content Map nav item).

**Fix (`components/brief/ContentMapSection.tsx`, display-only — no data/logic change):**
- Main return root `<div>`: added `flex: 1, minHeight: 0, overflowY: 'auto'` and `padding: '12px 16px'` (mirrors the sibling ThemeClustersPanel pattern; the section is rendered raw in `page.tsx` with no wrapper, so padding now also gives the content breathing room instead of touching the edges).
- Empty-state return root `<div>`: added `flex: 1, minHeight: 0, overflowY: 'auto'` for consistency.

**Verified:** full-project `tsc --noEmit` exit 0 in a clean `/tmp` env (`npm install --ignore-scripts`), 0 errors, 0 in the changed file. Scroll audit across all eight nav sections confirms each now resolves to exactly one scroll container under the `overflow-hidden` main (overview / keywords-list / keywords-clusters / content / serp / serpFeatures + the page.tsx-wrapped llm / audienceSegments / journeys). Before/after layout preview rendered in chat. No other section touched.

## v7.130 — 2026-06-05 · Executive Summary rebuilt around the GEO story (landscape → two worlds → journey → continuous cycle)

**Request (Wayne):** the old exec read as "a lot of data, not a story." Reshape it so a CMO instantly gets: where they stand, where their gaps are, who's beating them, and what to do — framed inside the company GEO narrative (discovery shifting from search links to AI answers; ranked content largely uncited in LLMs). Direction chosen across a design session: hybrid editorial-headline + answer-grid, competition kept as supporting evidence (not a headline), industry stats used as conceptual framing only (never presented as client-measured data), and story elements the app can't yet measure shipped as visible "coming" placeholders.

**Layout (replaces the hero + 8-card signals rail + 2/3 body grid):**
- **The landscape — headline band**, rendered ONLY when narrative data exists (`narrativeText` truthy; else hidden and the grid leads). States the core contrast from real metrics: page-1 demand share vs AI-answer citation rate, with the AI narrative as subhead. Honors Wayne's "hide headline if no narrative" choice.
- **The approach — two worlds of visibility (4 boxes):** Traditional (page-1 volume share), AI visibility (citation rate), Coverage gap (gap volume + count), Journey (stages covered). Every box states its denominator on screen.
- **Where you disappear across the journey:** real per-stage ORGANIC coverage row (present / thin / absent, derived from `buildClusters` client vs total stage volume, 20% share floor = "thin"); the AI row ships as four disabled "coming" cells with an on-screen note that AI-per-stage, audience segments, and Sentinel live signals are in build.
- **Supporting evidence:** Share-of-Voice donut (`SovPanel`, the competitive "who's beating me" — kept as evidence, not a headline) beside the volume-distribution split.
- **The continuous cycle:** the priority-action cards, reframed as "secure the coverage gaps."
- **Slim roll-up footer:** one line rolling up every nav panel's headline number (framing only — the Sentinel/IQ.Impact monitoring line carries NO fabricated signal data).

**Data integrity:** zero new data sources. Every figure still flows from the existing canonical helpers — `buildKwPool` (traditional visibility, gap, volume split), `computeSov` (SOV + footer share), `buildClusters` (journey stages), the stored AIO/LLM snapshots (AI visibility). So the exec continues to reconcile with Keyword Landscape (02), Google Ranks (06), Journeys (04), and SERP Features (07) by construction. The new `aiVisPct` is the AIO citation rate, falling back to the LLM-probe mention rate, and `null` (em dash + "run an AIO scan") when neither has data — never fabricated.

**Changes:** `components/brief/ExecutiveSummarySection.tsx` only. Swapped the `journeyStagesCovered` count for a richer `journeyStages` reducer (per-stage client/total volume + present/thin/absent status, covered-count derived from it); added `aiVisPct`/`aiVisDenom`/`aiVisColor` and `STATUS_STYLE`; replaced the entire render. All upstream computations kept verbatim. The old `SignalCard`/`StatRow` helpers remain defined but unused (no longer rendered).

**Verification:** full-project `tsc --noEmit` exit 0 in a clean `npm install --ignore-scripts` env in /tmp (505 packages, @types present — the defendable tsc env). jsdom interaction harness mounting the REAL component (esbuild bundle, mocked `/keywords` fetch, two fixtures): 15/15 — narrative-present headline shown + narrative text + two-worlds + AI 6% + "of 359 AI Overviews" denominator + journey present/absent chips + AI "coming" ×4 + continuous-cycle + roll-up footer + traditional-box label; and the narrative-absent fixture: headline HIDDEN, AI box em dash + "run an AIO scan", grid still renders. Real rendered text extract captured from the harness output.

## v7.129 — 2026-06-05 · Exec sourcing audit (pass 2 of 3): hero competitor share now matches the Share-of-Voice donut

**Context:** continuation of the v7.128 audit. The Executive Summary hero claimed "[topComp] holds X% of total demand," but that figure was computed independently from the Share-of-Voice donut rendered directly below it — so two different competitor-share numbers appeared inches apart.

**Root cause:** the hero built its own share from organic traffic only, and truncated the field to the **top 4** competitors before computing the denominator. SovPanel (Google Ranks, nav 06) uses **all** competitors and a basis that is traffic when Semrush traffic exists, otherwise page-1 keyword volume. Different inputs, different denominator → different percentage.

**Fix — single source of truth:**
- `components/brief/GoogleSerpSection.tsx` — extracted SovPanel's entire share computation **verbatim** into a new exported pure function `computeSov({ analysis, competitors, dbKeywords, clientLabel })` returning `{ basis, rawEntries, total, clientVoice, clientKwsUsed, compEntries, rowsByComp, zeroP1Domains, compRows, clientDisplay }` (typed via the new `SovComputed` interface). `SovPanel` now calls `computeSov()` and destructures it, then builds the donut arcs/legend/readout exactly as before — zero rendering change. All the v7.88–v7.111 basis logic (traffic / volume / tracked / gapOnly, the zero-page-1 diagnostics, the on-screen data readout) is untouched; it simply lives in one function now.
- `components/brief/ExecutiveSummarySection.tsx` — the hero's competitor-share block now calls the SAME `computeSov()` (with the same `manualDomains` and client label this exec already passes to its `SovPanel`), and derives `topComp` / `topCompShare` / `clientShare` / `gapVsTop` from its `rawEntries` + `total`. Removed the old traffic-only, top-4-truncated `allPlayers` math. The hero narrative ("topComp holds X%") and the "Competitor gap" signal card now reconcile with the donut by construction.

**Verification:** isolated `tsc --noEmit --strict` on `computeSov`'s signature and the hero's consumption — exit 0. Behavioral parity harness porting `computeSov` + both consumers (SovPanel donut and the hero) across a traffic-basis fixture (5 competitors — exercising the old top-4 truncation bug) and a volume-basis fixture (CSV upload, no traffic, page-1-only): both consumers return identical client % and identical top-competitor domain + % — 2/2 PASS. Confirmed SovPanel references only destructured values (no dangling references to the moved locals `compRowsWithPos`, `compDiag`, `semComps`, `trafficTotal`, `byComp`, etc.), GoogleSerpSection braces balanced (787/787), exec declares `clientDomain` once. Full-project `tsc` not runnable in the packaging sandbox (copied `node_modules` missing `@types/node`, as in v7.127/v7.128; clean-install builds remain green).

**Remaining (pass 3):** SERP feature coverage (#3) still reads the stale snapshot summary instead of SERP Features' live scanned set. LLM rate (#5) and Theme-clusters count (#6) recomputed-but-consistent follow-ups.

## v7.128 — 2026-06-05 · Exec Summary sourcing audit (pass 1 of 3): gap stats, Journeys signal, ranked-count label now pull from their owning panels

**Request (Wayne):** "Go through the exec summary and make sure all data points and mentions are pulling from the individual panels from the left nav. The left nav should hold the entire detail; bits and pieces are pulled forward to the exec summary."

**Audit result:** most hero/volume metrics already pull from the canonical `buildKwPool` (so they match Keyword Landscape 02 and Google Ranks 06) and the Share-of-Voice card literally imports `SovPanel`. Three items were recomputed from raw snapshot fields or fabricated; this release fixes the clean, self-contained ones. (Competitor-share basis and SERP-feature coverage need careful extraction from their owning panels and ship next, as passes 2 and 3, to avoid regressing those panels.)

**Changes (`components/brief/ExecutiveSummarySection.tsx`, `components/brief/JourneySection.tsx`):**
- **#1 Gap count + gap volume now derive from the canonical `kwPool`.** Previously read raw `semSnap.gapKeywords`, which skips `buildKwPool`'s branded-exclusion, project competitor-volume threshold, and dedupe — so the exec gap figures could exceed what Keyword Landscape (02) and Content Map (05) display. Now `gapItems = kwPool.filter(i => i.isGap && !!i.competitor)`, which equals KeywordsPanel's canonical `gapFiltered` count by construction (its `volThreshold = defaultCompetitorThreshold` is the same threshold `buildKwPool` already applied via `competitorVolMin`). Feeds the hero text, content tiles, the "Competitor gap" / "Content map" signal cards, and the fallback priorities.
- **#4 "Journeys" signal now reflects real stage coverage.** It was hardcoded as `page1Pct > 30 ? '2 of 4' : '1 of 4'` — a fabricated heuristic with no link to the Journeys panel (04). `buildClusters()` is now `export`ed from `JourneySection.tsx`; the exec runs the same cluster build and counts how many of the 4 stages (awareness / consideration / decision / retention) have client page-1 volume (`subCluster.clientVolume > 0`). `claudeAssignments` is passed as `{}`, giving the deterministic default intent mapping the panel shows before any AI refinement (cached AI intents live in UI state and only reassign 'unmatched' keywords).
- **#7 "Total ranked kws" tile was mislabeled.** It showed `totalKws`, which includes non-ranked gap keywords (and duplicated the hero's "Total keywords"). Now shows `posKws.length` — keywords with an actual rank position — matching Google Ranks (06). The full pool count (incl. gaps) still lives in the hero "Total keywords" tile.

**Still to come (explicitly NOT changed here):**
- **#2 Hero competitor share** ("topComp holds X% of total demand") is computed from organic-traffic shares truncated to the top 4 competitors, so it won't match the Share-of-Voice donut beside it (which uses all competitors, and a traffic-or-page-1-volume basis). Fix = extract SovPanel's share computation into a shared helper both consume. (Pass 2.)
- **#3 SERP feature coverage** reads the stale snapshot summary (`analysis.aioAvailable`, `serpFeatureSummary`); SERP Features (07) computes from the LIVE scanned set (`useAIOData` + `scannedKws` + uploaded-feature counts) and clamps to 100. Fix = consume the same live computation. (Pass 3.)
- LLM mention rate (#5) and Theme-clusters count (#6) are recomputed but currently consistent — lower priority follow-ups.

**Verification:** isolated `tsc --noEmit --strict` on all three new expressions against the real `KwPoolItem` and `buildClusters` return shapes — exit 0. Confirmed `buildClusters` export, no circular import (JourneySection does not import the exec or GoogleSerp), and that `subCluster` carries `stage` + `clientVolume`. No stale references to the removed `gapKeywords` variable. Full-project `tsc` not runnable in the packaging sandbox (copied `node_modules` missing `@types/node` — same environmental limitation noted in v7.127; clean-install builds remain green). Changes are localized to the exec read-model plus a one-word `export`.

## v7.127 — 2026-06-05 · Fix: Executive Summary "Volume Opportunity" (99%) disagreed with the Google Rank panel (83%)

**Symptom (Wayne):** "On the exec summary it says there is a 99% volume opportunity, however on the Google Rank panel (which is where the exec summary should be pulling from) it says 83%. Why is it wrong?" Both screenshots agreed on Positions 1–3 (1.4M) and Positions 4–10 (518K) but diverged wildly on Page 2+ (exec 217.2M vs rank panel 6.2M) and on the total (exec 219.2M vs 8.1M).

**Root cause (`components/brief/ExecutiveSummarySection.tsx`):** the panels share identical distribution math; the bug was in the **input to `totalVol`**, not the formula. `totalVol` summed `searchVolume` over the *entire* `kwPool`, which includes **gap keywords** — terms the client does NOT rank for, sourced from competitor/gap uploads. By design (`lib/utils/kwVolume.ts`), every gap row carries `position = null`. The volume bars compute `Page 2+ = totalVol − page1Vol`, and `page1Vol`/`top3Vol` only count `posKws` (position ≠ null) — so all the null-position gap volume silently fell into the "Page 2+ (11+)" bucket, inflating both the total and the "% outside top 3". This turned ~211M of non-ranked gap volume into fake "Page 2+ rankings" and pushed the headline from the correct ~83% to 99%.

`GoogleSerpSection.tsx` — the source of truth — already excludes gaps from its volume basis (`pool.filter(item => !item.isGap)`), which is why the rank panel read correctly.

**Fix:** `totalVol` now sums only non-gap pool items, mirroring GoogleSerpSection exactly:
```ts
// before:
const totalVol = topKws.reduce((s, k) => s + (k.searchVolume ?? 0), 0);          // included gap volume
// after:
const totalVol = kwPool.reduce((s, item) => s + (item.isGap ? 0 : (item.searchVolume ?? 0)), 0);
```
This corrects every metric whose denominator is `totalVol`: **% outside top 3**, **Top-3 volume %**, **Page-1 coverage %**, and the three Volume Opportunity bars. `totalKws` (the keyword-count card) intentionally still counts the full pool, so it continues to match the **Keyword Landscape** panel — only the *volume* basis changed. `top3Vol`/`page1Vol`/`posVol`/`weightedPos` were already gap-free (they filter on `posKws`), so they're unchanged. Market-capture rate is computed from a separate block and is unaffected.

**Verification:** numeric reconciliation harness replicating BOTH panels' exact `reduce` expressions on a controlled pool (ranked top-3 / 4–10 / 11+, a ranked-but-position-unknown row, and three gap rows) — fixed exec now equals GoogleSerpSection on **total, top3, page1, Page 2+, and % outside top 3** (5/5 PASS); old code confirmed divergent (99% vs truth). Isolated `tsc --noEmit --strict` on the new expression against the real `KwPoolItem` interface: exit 0. Full-project `tsc` was not runnable in this packaging sandbox (the copied `node_modules` is missing `@types/node` — the untouched v7.126 throws the identical error here; v7.126 shipped `tsc` exit 0 on a clean install). The change is a single self-contained arithmetic expression touching no imports, types, or JSX.

## v7.126 — 2026-06-05 · AIO Keyword Drilldown redesigned to match the AIO Coverage Tracker layout

**Request (Wayne):** "In the AIO section of the SERP features for the keyword drill down — modify the existing layout to match the screenshot from the AIO Coverage Tracker." (Two-column expansion: AI Overview Answer panel + Tracked Brand Hits on the left, numbered Citations list with source-type tags on the right.)

**Changes:**
- `lib/apis/serp.ts` — NEW `KeywordSerpData.aioText`: the verbatim AI Overview answer text, flattened from SerpAPI's `ai_overview.text_blocks` (paragraphs, headings, list items incl. nesting), capped at 6,000 chars. Captured on every scan from v7.126 on. **Pre-v7.126 scans stored citation links only — they have NO answer text, and the UI says so instead of inventing one.**
- `components/brief/SerpFeaturesSection.tsx` — the expanded drill-down row (old flat "All AIO sources" chip list) is now the Coverage-Tracker layout:
  - **AI Overview Answer** (left): scrollable panel with the captured answer text; dashed placeholder with re-scan instruction when text wasn't captured (older scans).
  - **Tracked Brand Hits** (left): one chip per tracked brand (client first, client dot purple / competitor dots pink). Status per brand: `cited #N` (1-based position in this AIO's citation list), `· mentioned` appended when the brand name appears in the captured answer text (whole-word, case-insensitive — only evaluated when text exists), `mentioned` alone, or `absent`. Green border = any hit, red = absent.
  - **Citations (N)** (right): numbered list — clickable title (falls back to domain), domain, and a type tag: `industry` (domain matches a tracked brand), `wikipedia`, or `other`. Client rows highlighted with "★ you". Scroll-capped at ~320px.
  - Rows are now expandable when the AIO has citations OR captured answer text. Empty-source AIOs show "no citation links (scan-confirmed)" — consistent with the v7.125 staleness rule (no behavior change there).
- All classification is deterministic (tracked-domain match / wikipedia.org suffix); nothing is modeled or guessed.

**Data caveat (important):** the Answer panel and "mentioned" detection only populate for keywords scanned on v7.126+. Existing AIO data (citations, positions, brand cited/absent) is unaffected and fully accurate. Re-scan keywords to fill in answer text.

**Verification:** full `npx tsc --noEmit` exit 0 (clean install); jsdom interaction harness 27/27 on the new expanded layout — text+sources full layout (chips `cited #2`, `cited #1 · mentioned`, tags industry/wikipedia/other, ★ you, numbered #1–#4), sources-without-text re-scan placeholder, text-without-sources scan-confirmed note + mentioned-only chip, word-boundary negatives ("TD" ≠ "today", "Sono" ≠ "sonobello") and positive (standalone "TD"), non-expandable empty row, collapse toggle. Parser harness 9/9 against the real serp.ts module — paragraph/heading/list/nested text_blocks flattened, `Title: snippet` join, 6,000-char cap with ellipsis, no text_blocks → aioText undefined with references intact, no AIO → no text. All buttons remain `type` unchanged; no new API calls — answer text rides along on the existing scan request at zero extra credits.

## v7.125 — 2026-06-05 · Fix: "Refresh required" loop on AIOs that genuinely have no citation links

**Symptom (Wayne):** "I click these buttons but it flashes and goes back to this." The amber refresh on 5 AIOs re-scanned them (≈5 credits per click), the scan succeeded — and the button instantly reappeared.

**Root cause:** those 5 AIOs genuinely expose no citation links (or SerpAPI cannot retrieve them). The re-scan correctly saved that result, but the v7.122 staleness rule treated ANY empty-source AIO as stale → infinite refresh loop that charges credits on every click.

**Fix (SerpFeaturesSection.tsx):** empty-source AIOs are only STALE when they lack a per-keyword `scannedAt` (i.e., never fetched by the modern scanner). Once a fresh scan confirms an AIO has no citation links, that's a verified fact: it leaves the stale set and is reported as information on the Citation Rate card — "N AIOs expose no citation links (scan-confirmed)". No math changes; those AIOs contribute 0 to the citations-available denominator, as before.

**Also confirmed working in Wayne's screenshot:** the full AIO scan succeeded post-v7.124 — 299 citation-verified AIOs, 3,171 citations available, rate 0.4% (12 citations), avg position 2.0.

**Verification:** jsdom 5/5 reproducing the exact loop — legacy-empty kw flagged (1 credit, not 2), confirmed-empty shown as info, click re-scans exactly the legacy kw, button does NOT reappear when sources remain empty (now scan-confirmed), info count updates to 2. Full `npx tsc --noEmit` exit 0.

## v7.124 — 2026-06-05 · Scan timeout fix + persistent progress bars on every scan

**Symptom (Wayne):** AIO scan failed with `Unexpected token 'A', "An error o"… is not valid JSON`. Also requested: "any scans always show a progress indicator so the user knows something is still working."

**Root cause:** 75-keyword batches of AIO-flagged keywords can exceed Vercel's 300s function limit — AIO keywords usually require a SECOND SerpAPI request (async token follow-up), so 75 × ~3–5s ≈ 225–375s. On timeout Vercel returns a plain-text error page; the panel's `res.json()` choked on it, surfacing the raw parse error. **Completed batches were saved server-side — no credits lost.**

**Fixes (SerpFeaturesSection.tsx):**
- Batch size 75 → 25 for both the AIO scan and the in-card rescans (25 × ~5s ≈ 125s worst case, well inside the limit).
- `safeJson()` guard: non-JSON responses no longer throw — both runners now show "The server returned an unexpected NNN response (likely a timeout while scanning). All completed batches are already saved — click the button again to continue from where it stopped." Resume is automatic: the server pool excludes already-scanned keywords.
- New `ScanProgress` bar rendered under the KPI strip whenever ANY scan runs: label, N of M keywords, %, pulsing fill while a batch is in flight, and the note "results save after every batch — keep this tab open." Shown for the violet AIO scan and all amber rescans (buttons keep their inline counts too).

**Verification:** jsdom 5/5 — progress bar visible mid-flight with the keep-tab-open note, batchSize 25 asserted on the wire, simulated 504 plain-text page → friendly resume message (no raw "Unexpected token" ever shown), bar clears when the scan stops. Full `npx tsc --noEmit` exit 0.

## v7.123 — 2026-06-05 · AIO scan moved INTO the Citation Rate card — one in-card action language

**Feedback (Wayne):** "This button got lost — I thought that was the refresh button I hit in the citation rate card. We have to make all UI changes very intuitive for an average user." (He re-scanned the 9 existing AIOs thinking he was expanding coverage to all 359.) Mockup rendered before build.

**Changes (SerpFeaturesSection.tsx, display/wiring only):**
- The standalone v7.121 "Scan N AIO keywords" banner is REMOVED.
- The expand-coverage action now lives INSIDE the Citation Rate card: context line "350 of your 359 available AIOs aren't citation-verified yet" + violet button "Verify all 359 AIOs · ~350 credits" (same batched scan + live merge as before).
- One visual rule across cards: **amber = fix stale data ("Refresh required")**, **violet = expand coverage (cost always shown)**. `KpiCard` now takes an `actions` array so a card can carry both (Citation Rate card shows amber + violet together when both apply).
- Scan/refresh errors surface in one line under the KPI strip.

**Verification:** jsdom 6/6 (banner gone, violet button inside the card with correct counts/cost, healthy data shows no amber, click → `filter:'aio'` POST, button self-clears at full coverage, denominator recomputes live). Full `npx tsc --noEmit` exit 0.

## v7.122 — 2026-06-05 · In-card "Refresh required" buttons — per-card targeted refreshes

**Request (Wayne):** "If any card summary needs a data refresh, add a button in that card that says refresh required. When we hit that button it only refreshes the data it needs — mini refresh options plus the overall ones." Mockup rendered and approved (button inside the card body, full width at the bottom).

**Staleness rules — all detected from real stored data, never guessed; a button appears only when a rule is true:**
1. Scanned AIO returned zero citation sources (token follow-up failure / pre-v7.102 data).
2. Scan predates v7.117 source capture (PAA box present but no `paaSources`; video carousel but no `videoSources`).
3. Scan older than 30 days — powered by NEW per-keyword `scannedAt` timestamp (serp.ts stamps every scan from now on; older entries without timestamps aren't age-flagged).

**Scanner/route:** `serp-scan` gains `filter: 'rescan'` + `keywords[]` — re-scans EXACTLY the listed keywords. Credit safety: 400 on empty/unknown lists; only keywords already in the stored scan set are accepted; capped per batch. Merge is now fresh-wins (re-scanned entries replace their old rows; default/aio modes unaffected).

**UI (SerpFeaturesSection.tsx):**
- `KpiCard` gains optional `stale` prop → amber border, the reason line, and a full-width in-card button "Refresh required · ~N credits" → batched rescan of only the affected keywords, live progress, results merge without reload, button disappears when the rule clears.
- Wired: Citation Rate + Avg Citation Position cards (rules 1+3, shared run state so both animate together). PAA and Video landscape stale notices get the same button (rule 2) — "Refresh required — re-scan N keywords (~N credits)".
- The big Refresh Analysis modal and v7.121 AIO-scan banner are unchanged — these are additive mini-refreshes.

**Verification:** route harness 8/8 (rescan targets exact list, fresh-wins merge keeps healthy rows, 400s on unknown/missing keywords with zero scan calls, default mode untouched). jsdom 6/6 (both stale reasons detected from fixture, in-card button + credit math, click → `filter:'rescan'` POST with exactly the 2 stale kws, button clears after refresh, slot totals recompute live). Full `npx tsc --noEmit` exit 0.

## v7.121 — 2026-06-05 · ONE Citation Rate (Wayne's definition) + targeted AIO keyword scanning

**Request (Wayne):** "Why do we have all 3 of these cards? We should just have one citation rate. Out of the 359 AIOs, how many citations are available — that's the denominator. Then how many citations does the client have." When offered scanned-only vs estimated denominators, he chose: "Pull the SerpAPI info for just those available AIOs and calculate how many citations are available and what the rate is."

**KPI strip (SerpFeaturesSection.tsx):** the three cards (verified sample / footprint / share) replaced by a single **Citation Rate** = client citations ÷ citations available, computed over citation-verified (scanned) AIOs. Sub-line: "N of M citations available across the X citation-verified AIOs." No estimates anywhere — the denominator grows only with real scans.

**New: targeted AIO scan.**
- `serp-scan` route accepts `filter: 'aio'` — candidate pool = uploaded keywords whose Semrush SERP-features cell includes "AI Overview" (deduped, blocked excluded, already-scanned excluded, volume-desc), exactly matching the panel's remaining count.
- AIO tab banner under the KPI strip: "Citation data covers X of Y available AIOs" + button "Scan N AIO keywords (~N SerpAPI credits)". Runs 75-keyword batches until done with live progress; results merge into the panel WITHOUT reload — Citation Rate, Available AIOs, penetration, landscape table and drilldown all recompute live.
- Aggregate metrics switched from stored `analysis.aioAvailable`/`featSummary` to live computation over the merged scanned set (stored values go stale during in-panel scans).

**Cost note (stated on button):** 1 SerpAPI search credit per keyword (+1 per async AIO token follow-up where Google serves the AIO lazily). Scanning Sonobello's 350 remaining AIO keywords ≈ 350–700 credits, 0 Semrush units.

**Verification:** real serp-scan route bundled with stubbed db/serp 9/9 (AIO filter picks exactly the unscanned AIO-flagged uploads, volume order, dedupe/blocked/scanned exclusions, all-filter unchanged, nothing-left short-circuit, snapshot merge). jsdom interaction harness 8/8 (single card + old labels gone, 25.0% slot math, banner coverage line, button credit estimate, click → POST with filter:'aio', live recompute to "2 of 8 citations / 4 citation-verified AIOs", button clears at remaining 0). Full `npx tsc --noEmit` exit 0.

## v7.120 — 2026-06-05 · KPI sub-lines wrap instead of truncating

**Symptom (Wayne, after deploying v7.119):** "Still says 5 of 108" — the new explanatory sub-lines WERE deployed but `KpiCard`'s sub style (`white-space: nowrap` + ellipsis) clipped them to one line: "5 of 108 cita…", "1 of 9 scanned AIOs — wh…". The unit/denominator context the v7.119 copy exists to provide was exactly what got hidden.

**Change (SerpFeaturesSection.tsx, one style rule):** KpiCard sub-line now wraps (`line-height 1.45`, `overflow-wrap: break-word`); nowrap/ellipsis removed there only — table-row truncation elsewhere intentionally unchanged.

**Verification:** Full `npx tsc --noEmit` exit 0. SSR harness re-run 5/5 (v7.119 copy intact). Grep-verified zero `nowrap` left in the KpiCard sub; the 9 remaining nowrap usages are table rows, unchanged by design.

## v7.119 — 2026-06-05 · KPI sub-lines now state UNIT + basis (slots ≠ AIOs)

**Question (Wayne):** "If there are 359 AIOs why does Citation Share say 5 of 108?"

**Answer (math verified correct):** Citation Share counts citation SLOTS, not AIOs — each scanned AIO cites multiple sources (his 9 scanned AIOs hold 108 individual citation links; Sonobello owns 5 → 4.6%). Slots are only countable on scanned SERPs. The sub-line "5 of 108 slots" didn't declare the unit, violating the v7.118 rule that every card on this panel states its denominator.

**Change (SerpFeaturesSection.tsx, sub-line copy only — no math touched):**
- Citation Share → "N of M citation links inside the X scanned AIOs (not keywords)"
- Avg Citation Position → "avg rank in the source list of scanned AIOs citing you"
- Top Competitor → "cited in N of X scanned AIOs"
- Others → "non-tracked domains' share of the M citation links"

**Verification:** Full `npx tsc --noEmit` exit 0 (complete real node_modules). SSR render of the real component 5/5 — new sub-lines render with fixture math (2 of 11 links), v7.118 rate cards intact.

## v7.118 — 2026-06-05 · "Your Citation Rate" KPI split into verified-sample + footprint rates

**Request (Wayne):** "There are 359 AIOs available and they have been cited in 2 of them. How can the citation rate be 22.2%? The card says 2 of 9 — there are not 9 AIOs, there are 359."

**Why it read wrong (not a math bug):** 22.2% was the verified rate on the 9 SCANNED AIOs (2 won of 9 where SerpAPI reveals who's cited). The 359 figure is hybrid availability (9 scanned + 350 uploaded Semrush rows, where citation status is unknowable). One KPI card silently used the scanned denominator while the Available card next to it used the hybrid one. Wayne chose (AskUserQuestion): show BOTH rates, matching the landscape table's two columns.

**Change (SerpFeaturesSection.tsx, display-only):** "Your Citation Rate" replaced by two cards: **Citation Rate (verified sample)** — wins ÷ scanned AIOs, sub-line "who's cited is only visible on scanned SERPs" — and **Citation Rate (footprint)** — same wins ÷ hybrid available AIOs, sub-line "verified floor, rises as more keywords are scanned". On Wayne's data: 22.2% (2 of 9) and 0.6% (2 of 359). The footprint card matches the AI Overviews selector tile's percentage above it.

**Verification:** Full `npx tsc --noEmit` with complete real node_modules: exit 0. SSR render of the real component 6/6 — both cards present, old label gone, rates correct on fixture, floor wording present.

## v7.117 — 2026-06-05 · Citation landscape tables for PAA and Video tabs

**Request (Wayne):** "Add a similar table for competitive coverage of both the PAA and the videos as well. Same position and location."

**Data prerequisite (told Wayne up front):** the scanner stored only the client-cited boolean for PAA and video — every other domain was discarded at parse time, so competitive tables were impossible from stored data. This release extends the scanner; existing stored scans lack the new fields and show an explicit amber notice instead of fabricated zeros.

**Scanner (lib/apis/serp.ts):**
- New stored fields per scanned keyword: `paaSources[]` (question + answer link domain for every PAA answer) and `videoSources[]` (hosting domain + channel name for every carousel entry). Existing booleans/summaries unchanged; fields optional so old snapshots stay type-valid.

**UI (SerpFeaturesSection.tsx):**
- `CitationLandscape` generalized (title/subtitle/unit/denominator labels + rows passed in) — one component now powers AIO, PAA and Video tables; AIO behavior unchanged.
- New `buildFeatureLandscape()` aggregator: per-brand and per-other coverage (distinct keywords acquired + total source slots). Video attribution: domain match PLUS channel-name match (normalized contains, ≥3 chars), since carousel entries mostly host on youtube.com; non-tracked video entries grouped by CHANNEL (stated in the sub-line) — otherwise everything lumps into youtube.com.
- PAA tab + Video tab: landscape table rendered in the same position as the AIO tab's (below the header, above the per-keyword list). Market rate denominators: scanned keywords with a PAA box / with a video carousel; footprint rate vs hybrid availability, same "verified floor" footnote.
- Stale-scan handling: if stored scans predate v7.117, the table area shows "run Refresh → Data-only refresh (0 Semrush units) to re-scan and populate" instead of an all-zero table.

**Deploy note:** run **Data-only refresh once after deploying** to populate both tables (re-scans existing keywords; SerpAPI credits only).

**Verification:** real `serp.ts` parser run with stubbed SerpAPI fixture 9/9 (PAA links incl. `source.link` fallback + linkless question skipped; video channel as string, as object `.name`, and absent; AIO refs unchanged). jsdom interaction harness on the real component 13/13 (tab clicks; PAA table rows + others tab; video channel grouping; "Sono Bello" channel attributed to client; 100.0% market math; amber stale notice on pre-v7.117 fixtures with no fabricated table). Full `npx tsc --noEmit` with complete node_modules: **exit 0, zero errors**.

## v7.116 — 2026-06-05 · Citation Landscape promoted into the AIO tab body (reference-style table)

**Request (Wayne):** Replace the removed gap card's spot with a citation-landscape table laid out like his reference screenshot (Tracked brands / Other domains / All tabs; Brand · Domain · AIOs acquired · Citation slots · Citation rate (market) · Citation rate (footprint); client row highlighted with badge).

**Changes (SerpFeaturesSection.tsx only, display-only):**
- `CitationLandscape` rewritten to the reference layout: header + sub-line, three pill tabs with counts, unified 6-column table for brands AND other domains, client row highlighted with `client` badge.
- **Citation rate (market)** = AIOs acquired ÷ scanned AIO-triggering keywords (same basis for every row — matches the reference math, e.g. 273/341 = 80.1%).
- **Citation rate (footprint)** = same scan-verified wins ÷ hybrid available AIOs (scanned + uploaded). On-screen footnote states it's a verified FLOOR since only scanned SERPs reveal citations.
- **"Mention rate" column from the reference intentionally NOT included** — it requires the AI answer text, which SerpAPI's AIO payload (as stored) doesn't provide; no data is fabricated.
- `useAIOData`: other-domain stats now track BOTH distinct AIOs acquired and citation slots (was slots only), so every row reports identical metrics; other domains ranked by AIOs acquired.
- The table renders always-on where the gap card sat; the old Keyword Drilldown / Citation Landscape view toggle is removed (drilldown renders below under its own label). Dead `AIOViewTab` type + state removed.

**Verification:** `npx tsc --noEmit` error set byte-identical to the v7.111 clean baseline. SSR harness of the real component 10/10 — table always visible, toggle gone, 6 headers present, client badge + 22.2% market rate from fixture (2/9), tab counts, drilldown intact, gap box still absent. Layout preview rendered in chat before packaging.

## v7.115 — 2026-06-05 · Removed the AIO "Gap / N uncaptured AIOs" callout box

**Request (Wayne):** "How is this only 7 in a gap when there are 359 available? Let's remove this gap insight box."

**Why the numbers diverged (not a bug):** the box counted only the SCANNED AIO subset (9 scanned AIOs, 2 won → "7 uncaptured"), because only SerpAPI scans reveal who is cited; the 359 "Available AIOs" figure is hybrid (9 scanned + 350 from uploaded Semrush data, where citation status is unknowable). Accurate but contradictory-looking side by side.

**Change (SerpFeaturesSection.tsx, display-only):** Gap callout box removed from the AIO tab. The same scanned-only gap remains visible via the "Missing" pill in the Keyword Drilldown. No other panels touched.

**Context confirmed in the same screenshot:** the v7.114 data-only refresh worked — AIO citations now populate (2 AIOs won, 6 of 102 slots, avg citation position 1.0, Others 94.1%).

**Verification:** `npx tsc --noEmit` error set byte-identical to the v7.111 clean baseline. SSR render harness of the real component 4/4 — gap box gone, KPI strip / Citation Rate card / Keyword Drilldown all still render.

## v7.114 — 2026-06-04 · Refresh modes now recover data assets across recent analyses (self-heals polluted rows)

**Symptom (Wayne, after v7.113):** Data-only refresh STILL warned "No previously scanned SERP keywords found" and did not re-scan.

**Root cause:** The buggy v7.112 run COMPLETED, so it became the newest completed analysis — and it contains the OLDEST run's copied snapshots (no scanned keywords, stale footprint). v7.113's `orderBy desc` correctly picks the newest completed row, but the newest row is now the polluted one. The 10 scanned keywords still exist in an older analysis row; a single-row "latest completed" lookup can never see them.

**Fix — per-asset recovery across the last 15 completed analyses (both data AND gap mode), mirroring full mode's v7.82 serp carry-forward:**
- `serpApiSnapshot` → the row that actually HAS scanned keywords (newest `fetchedAt` among those).
- `semrushSnapshot` → the row whose snapshot has the NEWEST `fetchedAt`. fetchedAt is stamped only when Semrush data is genuinely pulled/merged; data-mode copies retain the old stamp, so polluted rows are skipped automatically.
- `profoundSnapshot` → most recent row that has one.
- **New fallback:** if NO keyword was ever scanned anywhere, data mode scans the top 10 client keywords by volume fresh (10 SerpAPI credits, still 0 Semrush units) instead of doing nothing, with an explanatory warning.
- Gap mode's serp-merge and probe reuse now read the recovered assets instead of the single latest row.

**Verification:** Real route code bundled via esbuild with stubbed db/Semrush/SerpAPI — 20/20 checks across 5 scenarios, including a fixture replicating Wayne's exact history (polluted newest row + good middle row + bare oldest row): footprint recovered from newest-fetchedAt row, all 10 scanned keywords re-scanned, 0 Semrush calls, 400 on empty history, fallback top-kw scan, empty-AIO-source warning, gap mode recovery. `npx tsc --noEmit` error set byte-identical to the v7.111 clean baseline.

## v7.113 — 2026-06-04 · Fix: refresh modes were reading the OLDEST completed analysis, not the latest

**Symptom (Wayne, first v7.112 run):** Data-only refresh warned "No previously scanned SERP keywords found — nothing to re-scan" despite the SERP Features panel showing 10 scanned keywords.

**Root cause (code-verified):** Both the new `mode='data'` block AND the pre-existing `mode='gaps'` block (since v7.31) fetched the "last completed analysis" via `db.query.analyses.findFirst({ where: completed })` with **no `orderBy`** — Drizzle's findFirst is just LIMIT 1, so Postgres returned an arbitrary row, in practice the OLDEST completed analysis. Wayne's oldest run predates SERP scanning (no scanned keywords) and holds a stale footprint. Every other route in the app (`projects/[id]`, `serp-scan`, full-mode carry-forward) already orders `desc(triggeredAt)`; these two didn't.

**Fix:** `orderBy: desc(triggeredAt)` added to both findFirst calls — data mode and gap mode now genuinely reuse the MOST RECENT completed analysis.

**Impact of the bug while present:** the v7.112 data refresh that triggered the warning copied the OLDEST analysis's footprint/probe data into a new analysis row — panels may show stale data until the next refresh. Gap refreshes since v7.31 could likewise have merged against an old snapshot whenever a project had multiple completed analyses. **After deploying v7.113, run Data-only refresh once** — it restores the latest footprint and performs the intended re-scan.

**Verification:** `npx tsc --noEmit` — error set byte-identical to the v7.111 clean baseline under the identical environment (0 errors in changed file). Fix mirrors the exact orderBy already used in 3 other routes.

## v7.112 — 2026-06-04 · Data-only refresh mode — refresh what you have for 0 Semrush units

**Request (Wayne):** Clicked Refresh expecting to refresh the existing footprint and got a ~1,293,790-unit Semrush confirmation. Verified NOT a bug: since v7.86, "Gap & rank refresh" re-pulls FULL client + competitor footprints (that's how it updates rankings/finds gaps); Semrush bills per row, and its domain reports can't be filtered to an arbitrary existing-keyword list — so a "refresh what I have" via Semrush costs ≈ a full pull. Wayne chose a new zero-Semrush mode instead.

**New mode — `mode='data'` (analyze route + RefreshModal + project page):**
- **Keyword footprint reused untouched** from the last completed analysis — 0 Semrush units billed. LLM probe data also reused.
- **Previously scanned SERP keywords are RE-scanned via SerpAPI** (cap 50; 1 credit each) — fresh AIO citation sources, PAA & video data. This is the only path in the app that re-scans already-scanned keywords (the incremental /serp-scan endpoint deliberately never does) — and therefore the fix path for the v7.102-era stored scans whose `aioSources` arrays are empty ("0 of 0 slots" in the AIO panel).
- **New diagnostic warning:** any re-scanned keyword with `hasAIO` but zero citation sources is reported ("N AI Overviews returned no citation sources from SerpAPI — citation metrics unverifiable this run") instead of silently reading as "client not cited".
- Phase 2 (Claude synthesis) re-runs on the refreshed data as usual.
- **RefreshModal:** third card "Data-only refresh" (now the default selection) with green "0 Semrush units" badge + a how-it-works breakdown that states explicitly: rankings are NOT updated in this mode. Volume-floor controls hidden in data mode (no Semrush pull, nothing to filter). Gap & rank card copy now says its Semrush cost ≈ full re-analysis so the estimate is never a surprise.
- **Project page:** `mode='data'` skips the Semrush cost-estimate modal entirely — there is nothing to bill or confirm.
- No schema changes. Requires a completed prior analysis; returns a clear 400 otherwise.

**Verification:** `npx tsc --noEmit` run on v7.112 AND on pristine v7.111 under the identical environment — error sets byte-identical (47 pre-existing environment artifacts from the borrowed node_modules' drizzle-orm type resolution; 0 errors in the three changed files; v7.111's clean-install baseline was exit 0). Modal rendered and reviewed in chat before packaging.

## v7.111 — 2026-06-04 · Competitors with zero page-1 rows no longer vanish silently (AirSculpt case)

**Symptom (Wayne):** "I don't see any competitor data in here but I have a strong competitor (AirSculpt) loaded." AirSculpt shows 624 kws uploaded · 624 with position in the Competitors modal, yet was absent from the SOV donut, legend, AND data readout, and the new Competitor Outperforming card showed its empty state.

**Diagnosis (code-verified):** GET /keywords returns all rows unfiltered, so AirSculpt's rows DO reach the browser. SOV and the Competitor card count PAGE-1 volume only (`position ≤ 10`, Wayne's locked v7.93 SOV definition). The SOV readout (`rowsByComp`) only counted rows inside the page-1 loop — a domain with positions but ZERO rows at ≤ 10 disappeared from every surface with no trace. That exactly matches the screenshots: only coolcontouringnewyork.com (35 page-1 kws) and bruggemanplasticsurgery.com (21) appear. **Conclusion: all 624 stored AirSculpt positions are > 10.** Whether that reflects reality (genuinely page 2+ on those keywords) or a Position-column misparse in the trimmed 624-kw CSV cannot be determined without the data — so this release makes the answer visible on screen instead of guessing.

**Changes (GoogleSerpSection.tsx only, display-only):**
- SovPanel: new per-domain diagnostics over ALL competitor rows with positions (row count, page-1 count, best position). Data readout now appends "domain N kws · 0 page-1" for zero-page-1 domains. New amber warning box: "domain: N uploaded kws, none rank page 1 (best position X) — excluded from page-1 Share of Voice. If unexpected, open the CSV and verify the Position column values."
- Competitor Outperforming card: empty state now lists every competitor domain with row count + page-1 count; zero-page-1 domains highlighted amber with best position and the verify-CSV hint.
- The "best position" value is the tell: a plausible rank (e.g. 14) means the rankings are real; an implausible one (e.g. 4-digit) means the CSV's Position column was misparsed and a re-upload with corrected columns is needed.

**Verification:** `npx tsc --noEmit` exit 0 (full project). jsdom harness 23/23 — all 17 v7.110 checks unchanged, plus 6 new: card empty-state keeps message + per-domain diagnostic with best pos + verify hint; SOV amber warning text; readout lists the 0-page-1 domain; no share is fabricated for it.

## v7.110 — 2026-06-04 · Google Ranks: Category Position Summary cards (Strong / Weak / Competitor / Opportunity)

**Request (Wayne):** "Add a couple new summary cards above the category performance and below the SOV summary. I would like to summarize the category positions. So what they are strong in, what they are weak in, what the competitor is out performing, and where their largest opportunity is." Mockup rendered and approved before build; Wayne chose: build as shown, ALL categories considered (incl. brand/location), 4 cards across one row.

**New (GoogleSerpSection.tsx only — display-only, no schema/API changes):**
- `CategoryPositionSummary` component rendered between the SOV/Volume-Opportunity row and Category Performance, gated on the same `cb.categories.length > 0` condition.
- **Strongest Categories** (green) — highest client page-1 volume share; hero + 2 runner-ups, each with share %, avg position, annual demand, and "N of M kws top 3".
- **Weakest Categories** (red) — lowest share; sub-line shows "N of M kws page 2+".
- **Competitor Outperforming** (amber) — per category, each uploaded competitor's page-1 volume (rows with `position ≤ 10`, `source ≠ 'blocked'`, domain ≠ client — same source rules as SovPanel) is mapped through `inferCategoryForKw`; categories where the leading competitor's page-1 volume beats the client's are ranked by absolute monthly volume gap. Shows "competitor.com leads · X% vs your Y%". Explicit fallback notices when competitor CSVs are missing entirely or have no Position column — never a fabricated share.
- **Largest Opportunity** (purple) — uncaptured demand = category demand − client page-1 volume, annualized, with "% of category demand not on your page 1".
- Shared math with the table below: client page-1 volume per category uses `categoryRankStats.page1Vol` with `cat.page1Demand` fallback — the exact rule `CatRow` uses, so card shares always match the Share column.
- Noise guard: categories under 2% of total demand excluded from the rankings (floor auto-relaxed if it leaves <3 categories); methodology footnote under the cards states all of this on screen.
- `DbKeyword` interface gains optional `domain` field (rows already carry it; SovPanel was reading it untyped).

**Verification:** `npx tsc --noEmit` exit 0 (full project, complete node_modules). jsdom harness rendering the REAL `GoogleSerpSection` with fixture data: 17/17 — share/avg-pos/annual-demand math on all four heroes and runner-ups, competitor pos>10 row excluded, blocked-source row excluded, sub-2%-demand category excluded, no-positions fallback notice, no-competitor-rows notice, remaining cards still populate when competitor card falls back. Harness fixture lesson: a `source:'blocked'` DB row blocks that keyword project-wide in `buildKwPool` — don't reuse a client keyword for the blocked-row fixture.

## v7.109 — 2026-06-04 · Google Ranks: leading "Total Keywords" summary card makes the ranked-only scope obvious

**Request (Wayne):** after confirming Google Ranks shows only ranked keywords by design (135/4.5M vs Landscape's 823/215.6M), he asked for a summary card IN FRONT of Ranked Keywords showing total keywords + total volume, "then the math will be more obvious for the user."

**Change (`components/brief/GoogleSerpSection.tsx`, display-only):**
- Stat strip goes 4 → 5 cards. New first card **Total Keywords**: full footprint count (ranked + gap, identical pool to Keyword Landscape — same buildKwPool options since v7.77), annual volume of the full footprint, and a reconciliation sub-line "matches Keyword Landscape · N ranked + M gap". On Wayne's current data it will read: 823 · 215.6M annual vol — full footprint · 135 ranked + 688 gap.
- Ranked Keywords card's sub-line simplified to "688 gap kws (211.1M/yr) excluded — no client rankings" (the Landscape-total cross-reference now lives on the Total card beside it).
- No math changes — same memoized values (totalKws, gapKwCount, totalVol, gapVolMonthly) recombined.

**Verification:** `npx tsc --noEmit` zero project-file errors. jsdom harness with a 5-keyword fixture (2 ranked + 3 gap): Total card shows 5, 96K annual (sum × 12), "2 ranked + 3 gap" reconciliation, Ranked card unchanged — 5/5. v7.107 kwVersion harness 3/3; v7.105 Replace/Merge harness 14/14.

## v7.108 — 2026-06-04 · Client-side keyword changes now refresh ALL panels (completes the v7.107 propagation)

**Request (Wayne):** "Make sure all the necessary dependencies are updated when a keyword footprint changes either from the client or the competitor set — the SOV needs to update, the keyword clusters need to update, etc."

**What was still missing after v7.107:** v7.107 wired the refresh only for the COMPETITORS modal (closing it bumps `kwVersion` → all 7 panels refetch). But CLIENT-side keyword mutations inside the Keyword Landscape panel — client CSV upload, add custom keyword, delete/block a row, Clear All — only refetched KeywordsPanel's own data. SOV, clusters, SERP features, journey, content map and exec summary stayed stale until reload.

**Fix:**
- `KeywordsPanel.tsx` — new optional `onKeywordsChanged` prop, fired after every successful keyword mutation (all 4 mutation paths: CSV upload, add, delete/block, clear-all — each already ended in a local `fetchDb()`; the callback fires right after it).
- `page.tsx` — passes `onKeywordsChanged={() => setKwVersion(v => v + 1)}`, so the same kwVersion mechanism from v7.107 now covers client-side changes too. Complete refresh matrix: competitor CSVs (modal close) ✓ v7.107 · client CSV/add/delete/clear ✓ v7.108 → both paths refresh all 7 keyword-consuming panels.

**NOT a bug — Google Ranks 135 kws / 4.5M vs Landscape 823 / 215.6M:** that panel is client RANKINGS only by design (v7.77): gap keywords have no client position so they can't appear in a ranking distribution. The card reconciles exactly on screen: 135 ranked + 688 gap = 823 Landscape total; 4.5M + 211.1M excluded gap vol = 215.6M. The sub-line states this.

**Note on clusters/categories:** ThemeClustersPanel's keyword rows refresh live (kwVersion), but the CATEGORY/cluster definitions (`_categoryBreakdown`) are produced by analysis synthesis — newly uploaded keywords join existing clusters' keyword pools immediately but re-clustering of category definitions requires the next run/refresh (as does gap analysis / Competitor Gap).

**Verification:** `npx tsc --noEmit` zero project-file errors. jsdom harness: client CSV upload through the real KeywordsPanel hit the batch endpoint AND fired onKeywordsChanged (2/2). v7.107 kwVersion harness re-run 3/3; v7.105 Replace/Merge harness re-run 14/14.

## v7.107 — 2026-06-04 · Panels now refetch uploaded keywords when the Competitors modal closes (SOV no longer stale)

**Symptom (Wayne):** uploaded fresh competitor CSVs (Cool Contouring 55, Bruggerman 34, AirSculpt 624 — all with positions), hit Done — but Share of Voice still showed the OLD data (gap-only basis, "competitor rankings on shared keywords not available", AirSculpt missing entirely, readout showing pre-upload row counts). Asked whether uploads even save across builds.

**Two separate answers:**
1. **The data saves.** Uploads live in the Postgres `project_keywords` table — deploys/builds never touch it. (The earlier all-zero screenshot reflected rows actually cleared/deleted via the eraser/trash actions, not a build wiping data.)
2. **The panels were stale.** Seven sections (GoogleSerpSection/SOV, ExecutiveSummarySection, KeywordsPanel, SerpFeaturesSection, ContentMapSection, JourneySection, ThemeClustersPanel) fetch `/api/projects/[id]/keywords` exactly once on page mount (`useEffect` keyed on `[projectId]` only). Uploading in the Competitors modal and pressing Done changed the DB but nothing re-fetched — panels kept the page-load snapshot until a full browser reload. AirSculpt was missing from SOV because the stale `dbKeywords` had no competitor rows → SovPanel fell back to gap-only basis, which only knows competitors from the last analysis snapshot (AirSculpt was added after it).

**Fix:**
- `page.tsx` — new `kwVersion` counter, incremented when the Competitors modal closes; passed to all 7 sections.
- All 7 sections — new optional `kwVersion` prop added to the `/keywords` fetch effect deps (`[projectId, kwVersion]`). Bump → refetch. No behavior change when the prop is absent.
- After closing the modal, SOV recomputes from the fresh rows: with positions present it upgrades to the page-1 volume basis and AirSculpt appears in the legend automatically. No analysis re-run needed for SOV/keyword panels (gap analysis & Competitor Gap still require a run/refresh, as the modal footer says).

**Verification:** `npx tsc --noEmit` zero project-file errors. jsdom harness: GoogleSerpSection mounted with kwVersion=0 → 1 `/keywords` fetch; prop bumped to 1 → second fetch fired and dbKeywords replaced with the new rows (3/3 checks). v7.105 Replace/Merge harness re-run 14/14.

## v7.106 — 2026-06-04 · Competitor rows always show uploaded keyword count (including zero)

**Request (Wayne):** "In the competitor tab, in each line of the competitors, add how many keywords are uploaded for each."

**Context:** rows with uploaded keywords already showed the live count ("21,981 kws uploaded · 21,981 with position", green, from project_keywords). But rows with no uploaded rows said only "no CSV — auto-discover on next full analysis" — no number at all.

**Change (`components/brief/CompetitorsModal.tsx`, display-only):** the zero state now reads "**0 kws uploaded** — no CSV; auto-discover on next full analysis", so every competitor line shows its count at a glance. Non-zero rows unchanged. Counts remain live per-domain sums over project_keywords (source csv/custom) — actual DB rows, not estimates.

**Verification:** `npx tsc --noEmit` zero project-file errors. SSR harness: zero-keyword competitor renders "0 kws uploaded", populated competitor renders its count. jsdom interactive harness from v7.105 re-run 14/14 (Replace/Merge flow unaffected).

## v7.105 — 2026-06-04 · Competitor CSV upload now asks Replace vs Merge when keywords already exist

**Symptom (Wayne):** Cleared the AirSculpt footprint and uploaded a 28K-row Semrush export → panel correctly showed 21,978 unique kws. Then uploaded a trimmed CSV (754 rows / 624 unique) expecting the panel to drop to ~624 — it showed 21,981 instead. Verified from the actual files: 621 of the new file's keywords already existed (updated in place) and 3 were new (inserted) — exactly the v7.92 UPSERT behavior, so no data corruption, but the merge-only model didn't match the mental model "upload = replace".

**Root cause:** v7.92 deliberately made `/keywords/batch` an upsert (update matches, insert new, never delete) so corrected CSVs could repair bad rows. There was no replace path on upload — replacing required knowing to click the eraser first.

**Change (`components/brief/CompetitorsModal.tsx`):**
- Uploading a CSV onto a competitor that already has uploaded keywords now pauses and asks inline on the row: "N kws exist · new file has M — **Replace** / **Merge** / Cancel".
  - **Replace** — POSTs `/keywords/clear` (sources csv/custom, that competitor's domain only — other competitors and client keywords untouched), then runs the normal chunked batch upload. If the clear request fails, the upload is **aborted** with an error message (never silently falls back to merging).
  - **Merge** — unchanged v7.92 upsert.
- First upload onto an empty competitor uploads immediately, no prompt.
- Success toast now says "uploaded (replaced existing)" vs "uploaded/updated" so the mode used is visible.
- Footer help text updated to describe Replace vs Merge.
- No backend changes — both endpoints (`/keywords/clear` with domain scoping, `/keywords/batch`) already existed (v7.101/v7.92).
- All new buttons `type="button"` (v7.94 lesson).

**Verification:** `npx tsc --noEmit` zero project-file errors. SSR harness 4/4 (renders, no prompt in initial state, footer text). jsdom interactive harness 14/14 against the real component with mocked fetch: prompt appears only when existing count > 0 and shows both counts; nothing uploads before a choice; Replace calls `/keywords/clear` (domain airsculpt.com, sources csv/custom) strictly BEFORE `/keywords/batch` and the toast says "replaced existing"; Merge never calls clear; a failed clear never reaches batch and shows "upload cancelled"; empty competitor uploads immediately with no prompt; Cancel issues zero POSTs and restores the action buttons.

## v7.104 — 2026-06-04 · Fix: "Page Unresponsive" browser freeze — keyword tables rendered all 36K rows at once

**Symptom (Wayne):** Chrome "Page Unresponsive" dialog on the project page (Keyword Landscape visible behind it). Footprint is now ~36K rows after the full client + competitor CSV uploads.

**Root cause:** two tables rendered the ENTIRE keyword set with no pagination — `KeywordsPanel` (`visibleRows.map`, ~8 cells + SVG icons per row) and `GoogleSerpSection` (`filteredKws.map`). 36K rows ≈ 300K+ DOM nodes built in one React commit → main thread locked → Chrome's unresponsive dialog. Pre-existing bug; only became visible once uploads crossed tens of thousands of rows (pre-upload footprints were ~1.7K).

**Fixes:**
- `KeywordsPanel.tsx` — table paginated at 100 rows/page with First/Prev/Next/Last pager + "Showing X–Y of N". Page resets on segment/rank-filter/sort changes. Filters, sort, summary cards, category section, and CSV/XLSX exports still operate on the FULL set (export downloads all rows, not the page). Pager hidden when ≤100 rows.
- `GoogleSerpSection.tsx` — same pagination (own state) on the Keyword Rankings table; stats/buckets unchanged (full set).
- `ThemeClustersPanel.tsx` — expanded cluster keyword chips capped at 300 with "+N more — use the Keyword Landscape panel to browse all" (a single cluster can hold thousands of keywords on large footprints).

**Verification:** `npx tsc --noEmit` zero project-file errors. SSR harness with a REAL 36,000-keyword snapshot: 8/8 — both panels render ≤100 keyword rows (previously 36K), render completes in milliseconds (previously frozen), pager shows "of 36,000", pager hidden on ≤100-row datasets. All buttons `type="button"` (v7.94 lesson).

## v7.103 — 2026-06-04 · SERP feature availability from uploaded Semrush CSVs (hybrid model)

**Context (Wayne):** "The serp feature data should be pulling from the uploads in the keyword csv files that I have uploaded. Is it?" — It wasn't: the upload parsers read only keyword/volume/position, the DB had no field for it, and the panel read exclusively from serpApiSnapshot. Wayne chose the hybrid model: Semrush's "SERP Features by Keyword" column supplies feature AVAILABILITY across the full uploaded footprint; SerpAPI scans remain the only source for CAPTURED/citation data (Semrush exports cannot say who is cited in an AIO/PAA/video).

**Changes:**
- `db/schema.ts` + both keyword API routes — NEW `project_keywords.serp_features` TEXT column (raw Semrush cell, e.g. "AI Overview, People also ask, Video"; NULL = column absent in upload, i.e. unknown — NOT "no features"). Auto-migrated via ALTER TABLE IF NOT EXISTS in both routes' ensure functions (GET /keywords does explicit-column selects, so the ALTER must run there too).
- `app/api/projects/[id]/keywords/batch/route.ts` — accepts optional `serpFeatures` per keyword (trimmed, capped 500 chars); stored on insert AND on v7.92 UPSERT, so re-uploading the same CSVs populates the column on existing rows.
- `components/brief/KeywordsPanel.tsx` (client uploads) + `components/brief/CompetitorsModal.tsx` (competitor uploads) — both header-aware parsers now detect "SERP Features by Keyword" / "SERP Features" / "serp_features" (optional; CSVs without it behave exactly as before) and pass the cell through to the batch endpoint.
- `components/brief/SerpFeaturesSection.tsx` — gains `projectId` prop (passed from page.tsx); fetches uploaded keywords on mount. NEW semrushFeaturesToBuckets (case-insensitive substring mapping: AI overview→ai_overview, People also ask→paa, Video/Featured video→video_carousel, Featured snippet, Knowledge panel, Local pack, Shopping, Image*→image_pack) + countUploadFeatures (dedupes by keyword, skips scanned keywords to avoid double counting, skips blocked rows). Hero Available/Gap, the three feature tab cards, and More Features counts now use scan + upload availability with explicit "X scanned + Y from upload" sub-labels. Captured stays scan-verified (sub-label says so). Available AIOs KPI is hybrid; penetration/citation KPIs relabeled "scanned queries/AIOs". New status notes: amber hint when uploads carry NO feature column (tells Wayne to re-export from Semrush Organic Research → Positions with all columns and re-upload); gray methodology note when hybrid data is active.

**Expected effect on Wayne's panel:** coverage % will DROP when upload data lands — the denominator becomes the full footprint's available features instead of only 10 scanned keywords. That is the honest number; the methodology note explains it on-screen.

**Action required:** re-upload the client + competitor CSVs (same Semrush exports, if they contain the SERP Features column) once after deploying — the UPSERT fills serp_features on existing rows. Uploads done before v7.103 have NULL serp_features until re-uploaded.

**Verification:** `npx tsc --noEmit` zero project-file errors. Offline harness 12/12 against the REAL extracted source: competitor CSV parser with the real 17-column Semrush positions header (features cell with quoted commas intact, empty cell→null, simple 3-col CSV unaffected); bucket mapping; upload counting (dedupe, scanned-keyword exclusion, blocked exclusion, unmapped features ignored). SSR render harness 6/6: panel renders with and without projectId, scan-only totals unchanged when no upload data, no upload notes shown in initial state, citation slots intact.

## v7.102 — 2026-06-04 · Fix: AI Overview citations always zero — SerpAPI returns `references`, not `sources` (+ page_token follow-up)

**Symptom (Wayne):** SERP Features panel showed the scan ran (10 kws, 8 AIOs detected, 10 PAA boxes) but every citation metric was zero: Citation Rate 0.0%, Citation Share "0 of 0 slots", Top Competitor 0.0%, Others 0.0%, captured 0/18. The "0 of 0 slots" was the giveaway — 8 AIOs found yet zero sources extracted from ALL of them, so even competitors showed 0%, which is impossible if parsing worked. (Also clarified: this panel is fed by the SerpAPI scan, not the Semrush footprint uploads.)

**Root cause (`lib/apis/serp.ts` parseKeywordSerp):** the AIO citation extractor read `aio.sources`, but per SerpAPI's documented response shape AI Overview citations live in `ai_overview.references` (each with title/link/source/index). `aio.sources` doesn't exist → `aioSources` was always `[]` → every downstream AIO metric (citation rate, share, avg position, top competitor, Others) computed to 0. Second layer: on many SERPs Google serves the AIO asynchronously and the main search response carries only `ai_overview.page_token` (expires within ~1 min) — extracting citations requires a follow-up request to SerpAPI's `google_ai_overview` engine, which the code never made. Docs: https://serpapi.com/google-ai-overview-api

**Fixes:**
- `parseKeywordSerp` now reads `ai_overview.references` (falls back to `sources` if SerpAPI ever returns it) and is async.
- NEW `fetchAIOverviewByToken` — when the inline AIO has only a `page_token`, immediately fetches the full AIO via `engine=google_ai_overview` (15s timeout, errors logged and non-fatal: keyword still recorded with hasAIO=true, empty sources). Note: the follow-up is an additional SerpAPI request per token-only AIO keyword.
- `batchKeywordScan` awaits the now-async parser. No schema, UI, or endpoint changes — SerpFeaturesSection already computes everything from `aioSources`.

**Per Wayne's choice:** existing scanned keywords are left as-is (scan endpoint never re-scans, by design). The already-scanned 10 keywords will keep showing zero citations; keywords scanned from v7.102 onward parse correctly. To repair the existing 10, a future re-scan/reset option would be needed.

**Verification:** `npx tsc --noEmit` — zero errors in changed files. Runtime harness against the REAL module with mocked SerpAPI: 3/3 — (A) inline `references` parsed, client + competitor domains extracted; (B) page_token-only AIO triggers the `google_ai_overview` follow-up and parses its references; (C) AIO with no references degrades gracefully (hasAIO=true, 0 sources).

## v7.101 — 2026-06-04 · Competitors moved to the top global nav — one manager for add/edit/delete, CSV uploads, clears & volume thresholds

**Context (Wayne):** Competitor functionality was scattered — add/remove inside Edit Project, CSV upload buried in Keyword Landscape's "Competitor Gap" dropdown, volume thresholds in both Edit Project and the Refresh modal. Wayne asked to move it all to the top global nav with full add/delete/modify, CSV upload, clear, and threshold controls. He chose full centralization with full per-row controls.

**Changes:**
- NEW `components/brief/CompetitorsModal.tsx` — opened from a new amber **Competitors** button (with live count badge) in the project's top header. Per-competitor row: favicon · name/domain (inline-editable) · live uploaded-keyword stats straight from project_keywords (count + how many rows carry rank positions — flagged when 0 because page-1 Share of Voice needs positions) · **Upload CSV** (v7.92 header-aware parser, chunked batch upload with progress %, re-upload updates rows) · **Clear keywords** (per-competitor, inline confirm) · **Delete** (inline confirm; also removes that competitor's uploaded keyword rows). Add form supports Enter-to-add. Volume thresholds (client + competitor gap, same presets) now live here and save instantly on click with a Saving…/✓ Saved indicator — same PATCH as before, project record remains the single source of truth (v7.98).
- `app/api/projects/[id]/competitors/[cid]/route.ts` — NEW **PATCH** (edit domain/name; duplicate-domain guard; on domain rename, uploaded keyword rows are re-tagged to the new domain so CSV data follows the competitor). **DELETE** now also deletes that competitor's uploaded rows (source csv/custom) so orphaned rows can't keep feeding Competitor Gap / SOV.
- `app/api/projects/[id]/keywords/clear/route.ts` — accepts optional `domain` to clear a single competitor's uploaded rows without touching client keywords or other competitors.
- `components/brief/EditProjectModal.tsx` — Competitors section and Keyword Volume Thresholds section REMOVED (now Project Info + Market only, with a pointer to the new Competitors button). `components/brief/CompetitorsPanel.tsx` DELETED (no longer referenced).
- `components/brief/KeywordsPanel.tsx` — "Competitor Gap" upload button + "Upload Competitor Keywords" dropdown panel REMOVED along with their handler/state (~140 lines). Client keyword upload / Clear All / Add Keyword / exports unchanged.
- `app/projects/[id]/page.tsx` — Competitors button + modal wiring; Edit Project call site slimmed. RefreshModal's pre-run threshold editor intentionally KEPT (it runs right before billing).
- v7.94 lesson applied throughout: CompetitorsModal contains NO `<form>` and every button is explicitly `type="button"`.

**Verification:** offline harness 22/22 — CSV parser against the real Semrush export header order (`Keyword,Position,Previous position,Search Volume,…`: volume taken from Search Volume not Position, quoted commas intact, BOM stripped, position-less files give null positions); SSR render of CompetitorsModal (populated/empty/loading states, threshold badge, all 21 buttons explicitly typed, zero forms, zero submit buttons) and slimmed EditProjectModal (sections gone, exactly 1 form + 1 submit, market still preselects). `npx tsc --noEmit` zero project-file errors. Includes the parallel v7.100 fix (competitor uploads no longer counted as client rankings).

**Note:** counts shown in the manager are live DB rows (uploaded CSV keywords), not Semrush estimates.

## v7.100 — 2026-06-04 · Fix: competitor uploads were counted as client rankings (Competitor Gap = 0 after 28K upload)

**Symptom (Wayne):** Uploaded a 28K-keyword competitor footprint (airsculpt.com) — Competitor Gap card stayed at 0 while the header showed "36,281 ranked · 0 gap" and All Keywords jumped to 36,281 / 63.6M annual vol.

**Root cause (`app/api/projects/[id]/keywords/batch/route.ts`):** `type` was computed purely from position presence (`pos ≤ 100 → 'ranked'`) with no awareness of WHOSE position it was. The competitor upload flow explicitly asks for the Position column (needed for Share of Voice), so all 28K competitor rows were stored as `type='ranked'` — which the entire app interprets as "the client ranks for this". Result: Competitor Gap = 0 (it filters on `type='gap'`), and worse, AirSculpt's rankings inflated every client metric (ranked counts, page-1 capture, annual volume, branded counts).

**Fixes:**
- Batch route now loads the project's client domain and only assigns `type='ranked'` when the upload is the CLIENT's footprint (domain empty or equal to the client domain). Competitor rows are ALWAYS `type='gap'`; their position is still stored — it's the competitor's rank, used by Share of Voice.
- Auto-repair on every upload (idempotent, scoped to the project): pre-existing competitor rows stored as 'ranked' by the old logic are flipped back to 'gap' — Wayne's 28K rows are repaired by the next upload to this project, or by simply re-uploading the same CSV (UPSERT also recomputes type).
- `lib/utils/kwVolume.ts` buildKwPool: pool `position` now means the client's rank only — gap rows get `position: null` so a competitor's rank can never leak into client page-1/capture metrics (previously uploaded competitor rows fed their rank straight into `computeVolumeMetrics`).

**Verification:** the REAL route code bundled with a stubbed DB — 7/7 assertions (competitor rows all gap with positions preserved and domain attributed; auto-repair UPDATE fires; client uploads keep ranked/gap rules; client-domain uploads treated as client). buildKwPool harness — 5/5 (gap row position null, competitor attribution, client rows keep position, page-1 volume excludes competitor ranks). `npx tsc --noEmit` zero new errors.

**Wayne's path:** deploy v7.100, then re-upload the same airsculpt.com CSV (or upload anything to the project) — the auto-repair flips the 28K rows to gap. Competitor Gap will then show the non-overlapping keywords, and the client metrics return to the client's true footprint.

## v7.99 — 2026-06-04 · Per-project market (country) setting — Semrush database + SerpAPI country

**Context (Wayne):** The "104K vs 2,862" mystery resolved — both numbers were real, from different country databases (US 104.1K vs CA 2.9K, visible in Semrush's own country selector). Sono Bello's analysis needs the Canada market, but the app hardcoded `database: 'us'` in every Semrush call AND `gl: 'us'` in every SerpAPI scan. Wayne chose a per-project market setting over manual CSV uploads (which would have left gap refresh unusable and SERP scans on US Google).

**Changes:**
- NEW `lib/utils/markets.ts` — single source of truth: market code → Semrush database + SerpAPI gl/hl/google_domain. Ships with US/CA/UK/AU; adding a market is one line.
- `db/schema.ts` + both project routes — new `semrush_database` column (default 'us'), auto-migrated via the existing ensureColumns pattern (no manual db:push); zod create/update schemas accept `semrushDatabase` validated against the MARKETS list.
- `lib/apis/semrush.ts` — `getDomainOverview`, `getOrganicKeywords`, `getCompetitors`, `getKeywordGap`, `getSemrushSnapshot`, `estimateSemrushPull` all accept a `database` param (default 'us').
- `lib/apis/serp.ts` — `fetchSerpData`/`batchKeywordScan`/`getSerpApiSnapshot` accept a `Market`; SerpAPI calls now send gl/hl/google_domain for that market, so SERP-feature scans check the same country's Google as the keyword data.
- `app/api/analyze/route.ts` (both modes), `serp-scan` route, `semrush-estimate` route — read the project's market and pass it through; estimate response includes `database`.
- UI — Market dropdown in NewProjectModal and EditProjectModal (with "changing requires full re-analysis" note); cost-confirm modal shows a market badge (e.g. "🇨🇦 Canada database") so it's always clear which database is being billed.

**Verification:** stubbed-fetch harness 9/9 (every Semrush call carries database=ca when set / us by default; estimate uses market and returns market-specific counts; floors + market combine; SerpAPI gets gl=ca + google_domain=google.ca, defaults preserved); SSR render of both modals 8/8 (selector present, ca preselects, US default, notes); `npx tsc --noEmit` zero new errors.

**For the Sono Bello CA analysis:** Edit Project → Market → 🇨🇦 Canada → full re-analysis. CA footprint is ~2.9K client keywords, so the pull is cheap (~29K units for the client + small CA competitor footprints). Existing US-based data remains until the re-analysis completes.

## v7.98 — 2026-06-04 · Volume floors applied inside the Semrush query (never fetch, never bill) + editable in refresh flow

**Context (Wayne):** The estimate modal showed ~1,293,790 units for a refresh. Verified live against the Semrush API: sonobello.com really has 104,081 organic keywords in the US database (`domain_rank` report) — the estimate was honest, the uncapped pull is just expensive. Wayne chose: apply the project's volume thresholds to the pull itself, and make them editable in the refresh screens, with the project record as the single source of truth.

**Semrush filter — verified live before coding:** `display_filter=+|Nq|Gt|999` against `domain_organic` (sorted nq_asc) returned only rows with Search Volume ≥ 1,000. Volumes are integers, so `Gt|min−1` ≡ `≥ min`. Filtered rows are never returned and never billed (10 units/row).

**Changes:**
- `lib/apis/semrush.ts` — new `volumeFilter()` helper; `getOrganicKeywords` and `getKeywordGap` gain a `volMin` param that adds `display_filter` to the query (omitted entirely when 0); `getSemrushSnapshot` gains `clientVolMin` and passes both floors through; `estimateSemrushPull` gains floor params and the response now carries `clientVolMin`/`competitorVolMin`/`isCeiling` (per-domain counts are unfiltered footprint sizes — Semrush has no cheap filtered-count endpoint — so with a floor the estimate is a ceiling).
- `app/api/analyze/route.ts` — full mode passes `kwVolThresholdClient`; gaps mode passes both floors into its direct `getOrganicKeywords`/`getKeywordGap` calls AND its silent `.catch(() => [])` swallows are replaced with user-visible warnings (same fix as full mode got in v7.96). The v7.86 partial-pull warning is suppressed when a client floor is set (fetched < overview count is then expected, not a failure).
- `app/api/projects/[id]/semrush-estimate/route.ts` — passes the project's floors to the estimate.
- `components/brief/RefreshModal.tsx` — new "Keyword volume floor" section: same preset buttons as Edit Project (All/500+/1K+/2.4K+/5K+) for client and competitors, prefilled from the project; changed values are PATCHed to the project record before the run proceeds (Run button shows "Saving thresholds…"), so create/edit/refresh all share one source of truth.
- `app/projects/[id]/page.tsx` — passes thresholds + save callback to RefreshModal (same PATCH as Edit Project, updates local state); cost modal: "Estimated cost" becomes "Maximum cost / up to N units" when a floor is active, with a note that footprint counts are unfiltered and the filtered pull bills less.
- `components/brief/EditProjectModal.tsx` — threshold copy updated: thresholds now also exclude keywords from the Semrush pull (never fetched, never billed), not just hide them from panels.

**Verification:** offline stubbed-fetch harness — 11/11 assertions (filter string exact `+|Nq|Gt|min−1` on client and competitor calls, no filter param when floors are 0, estimate ceiling flags, units = rows×10, gaps-mode direct calls); SSR render of RefreshModal — 8/8 (floor section, presets, save note, no stale text); `npx tsc --noEmit` zero new errors.

**Note:** floors take effect on the NEXT pull. Existing snapshot data is unchanged until a refresh runs.

## v7.97 — 2026-06-04 · Remove stale "~450 units" badge from gap refresh

**Symptom (caught by Wayne):** The Refresh modal's "Gap & rank refresh" card showed a hardcoded "~450 units" badge. That figure dates from the pre-v7.86 capped pulls (150 client + 100/competitor keywords). Since v7.86 the gap scan re-pulls the FULL client footprint plus FULL footprints of up to 5 competitors — Semrush cost is comparable to a full re-analysis (the actual savings are SerpAPI credits + LLM probe reuse). The v7.87 stale-text sweep fixed the full re-analysis badges but missed this one.

**Changes (`components/brief/RefreshModal.tsx` — text-only, no logic):**
- "~450 units" badge → "cost shown before run" (matches the full re-analysis card; accurate — both modes go through the real `semrush-estimate` confirmation modal before any units are spent).
- "How gap scan works" rows updated: client rankings → "full footprint re-pulled"; competitor keywords → "full footprints pulled, net-new merged"; SERP & LLM reuse row marked "(this is where the savings are)".
- New footnote: Semrush bills 10 units per keyword row, Semrush cost similar to full re-analysis, exact estimate confirmed before run.

**Verification:** grep — no "450" remains in app/components markup; SSR render harness of RefreshModal (esbuild + renderToStaticMarkup) — 6/6 assertions pass (no 450, both badges, new rows, footnote, run button); `npx tsc --noEmit` zero new errors.

## v7.96 — 2026-06-04 · Competitor Gap = 0 is no longer silent

**Symptom (reported by Wayne):** After the v7.86 uncapped pulls, All Keywords jumped 1,740 → 5,845 but the Competitor Gap card showed 0 with no explanation. Root cause analysis: the jump is the client's own full footprint (uncapped client pull), NOT gap keywords. Gap = 0 was unexplainable because each per-competitor gap pull in `getSemrushSnapshot` was wrapped in `.catch(() => [])` — failures (e.g. Semrush API units exhausted after the large uncapped pulls) produced an empty gap list with no warning. The v7.86 partial-data warning only covered the client pull.

**Changes:**
- `lib/apis/semrush.ts` — `SemrushSnapshot` gains optional `warnings: string[]`. Each competitor gap pull now logs its raw row count and reports: pull failed (with the API error), pull returned 0 rows (likely unit exhaustion), no competitors at all, or rows returned but 100% filtered out (client already ranks / branded / below the gap volume threshold — threshold value included in the message).
- `app/api/analyze/route.ts` — snapshot warnings are appended to the run's warnings array, so they render in the existing amber "Data warning" banner on the project page.

No math, schema, or UI-component changes. Verification: offline harness with stubbed fetch — 4 scenarios (all pulls fail / return 0 rows / all rows filtered / healthy), 9/9 assertions pass; healthy path produces zero warnings and correct competitor attribution. `npx tsc --noEmit`: zero new errors (only pre-existing sandbox-only type-dir noise).

**Action for Wayne:** re-run the analysis — the banner will now state exactly why Competitor Gap is empty (most likely Semrush API unit balance).

## v7.95 — 2026-06-04 · Share of Voice shows the client name

**Request (Wayne):** The SOV legend said the generic word "Client" — it should show the actual client name on both the Executive Summary and Google Ranks panels.

**Changes (`GoogleSerpSection.tsx` SovPanel + both call sites + `page.tsx`):**
- `SovPanel` gains a `clientLabel` prop; the client legend row, the data readout line, and ordering all use it (fallback: snapshot domain, then "Client").
- Executive Summary passes `projectName` (the project's client name, e.g. "Sono Bello"); `projectName` added to its destructured props (it was already in the Props interface and passed by page.tsx).
- Google Ranks: `projectName` prop added to GoogleSerpSection and passed from page.tsx; SovPanel receives `projectName ?? domain`.

Display-only change — no math, API, or schema changes. tsc: zero new errors.

## v7.94 — 2026-06-04 · Fix: Edit Project modal closes when adding a competitor

**Symptom (reported by Wayne):** In Edit Project → Competitors, clicking "+ Add Competitor" and then clicking into the competitor input made the whole modal disappear.

**Root cause (`components/brief/CompetitorsPanel.tsx`):** The panel renders inside EditProjectModal's `<form onSubmit={handleSave}>`. Two HTML/React issues:
1. The "+ Add Competitor" toggle button and each competitor row's delete (×) button had no `type` attribute. An HTML button defaults to `type="submit"`, so clicking "+ Add Competitor" ALSO submitted the modal's form → project saved → `setTimeout(onClose, 800)` closed the modal ~0.8s later — right as the user clicked into the Domain input. (Side effect of the same bug: clicking × on a competitor row also silently saved the project.)
2. The add-competitor `<form>` was nested inside the modal's `<form>` — invalid HTML; its submit events bubble to the modal's save handler.

**Fixes:**
- `type="button"` added to the "+ Add Competitor" toggle and the row-delete buttons.
- Inner `<form>` replaced with a `<div>`; the Add button is now `type="button"` with an `onClick`, and `addCompetitor()` no longer takes a form event.
- Enter key in the Domain/Name inputs is handled manually (`onKeyDown`): prevents the keypress from submitting the modal's form, and triggers Add when the form is complete.

No API, schema, or other component changes. Verified: `npx tsc --noEmit` — zero new errors (only the pre-existing sandbox-only drizzle type noise); grep audit of all `<button>` elements rendered inside the modal's form confirms every one is now explicitly `type="button"` or the intended `type="submit"` Save button.

Note: changelog entries v7.83–v7.93 were tracked in session logs rather than this file; see version history in project memory. v7.94 builds directly on v7.93 (current deployed baseline).

## v7.82 — 2026-06-04 · Merged release (LLM probe v2 + incremental SERP scanning)

Two conversations worked in parallel on 2026-06-04; this release merges both streams and is the one to deploy:
- **LLM Visibility panel v2** (this conversation — see v7.81 entry below for full detail).
- **Incremental SERP feature scanning** (parallel conversation): new `POST /api/projects/[id]/serp-scan` endpoint scans unscanned keywords in batches (default 75, volume-desc, never re-scans = no double SerpAPI credits), merges into the latest analysis snapshot and recomputes all SERP summaries via new `buildSnapshotFromKeywordData()` in serp.ts; KeywordsPanel gains a SERP coverage strip (scanned X of N, progress bar, "Scan next 75" button, live-merge of batch results without reload); fixed Video pill never lighting up (checked 'videos' but serp.ts stores 'video_carousel').

File-level note: the two streams touched disjoint files (probe: llmProbe.ts, synthesize.ts, prompts.ts, analyze/synthesize routes, LLMVisibilitySection, ExecutiveSummarySection, pdf/template.ts · serp: serp.ts, serp-scan route, KeywordsPanel.tsx) — no conflicts. tsc parity vs baseline: zero new errors beyond pre-existing sandbox-only drizzle type noise.

Packaging history: orbitiq-v7.81.zip in the project folder contains ONLY the probe v2 work (the parallel conversation's v7.81 zip was overwritten in a race). Use v7.82.

## v7.81 — 2026-06-04 · LLM Visibility panel v2 (category-driven probe + sentiment)

**Why:** The old probe sent only 3 generic prompts and its single score was inflated by branded prompts. The panel could also render empty when both API calls failed silently.

**Probe engine (`lib/apis/llmProbe.ts` — full rewrite, snapshot source `llm_probe_v2`):**
- Prompts are now generated from the SAME product categories shown on the Keyword Landscape panel (`_categoryBreakdown`, procedure type, "Other" excluded — ALL of them per Wayne's choice).
- Per category: 2 unbranded prompts (best providers / considering this procedure) + 1 branded (pros & cons). Plus 4 brand-level prompts (overview, reputation, top-of-industry, competitor comparison).
- Platforms: Claude (claude-haiku-4-5) + ChatGPT (gpt-4o-mini), all calls in a bounded pool (8 concurrent per platform).
- Two scores replace the old single score: **Unbranded visibility** (mentioned when the prompt never named the brand — the real GEO metric; also kept as `overallScore` for backward compat) and **Brand recognition** (LLM showed real knowledge on branded prompts).
- Sentiment: one Claude sonnet classification pass over responses that actually mention the brand → positive/neutral/negative counts + example quotes. Quotes are substring-verified against the raw response; non-verbatim classifier output is rejected and replaced with the detected mention sentence.

**Pipeline (`app/api/analyze/route.ts`, `app/api/synthesize/route.ts`, `lib/claude/synthesize.ts`):**
- Probe moved from Phase 1 (analyze) to Phase 2 (synthesize) because categories don't exist until synthesis. Order: personas ∥ category breakdown → LLM probe → opportunities → narrative ∥ PPT prompt.
- Opportunities + narrative + PPT prompts now consume fresh probe data via new `llmProbeContext()` helper in prompts.ts (handles v2/v1/none).
- Phase 1 carries the previous analysis's probe forward so the panel isn't blank between phases; probe failure in Phase 2 falls back to previous probe data instead of blanking the panel.
- Gap scans still reuse the last probe (no re-probe) per Wayne's choice.

**UI (`components/brief/LLMVisibilitySection.tsx` — rebuilt; `ExecutiveSummarySection.tsx`, `lib/pdf/template.ts` updated):**
- New panel: unbranded visibility + brand recognition + sentiment bar cards; per-category visibility table (monthly demand from real keyword volumes, Claude x/2, ChatGPT x/2, mention-rate bar); verbatim positive/negative excerpt cards; collapsible full prompt/response log; methodology footnote.
- v1 snapshots and empty states still render (legacy views kept).
- Exec summary LLM card reads v2 (unbranded rates per platform); PDF template renders v2 scores, sentiment counts, and top category bars.

**Verification:** offline harness with stubbed Anthropic/OpenAI — 13/13 assertions pass (score math, per-category rates, recognition, verbatim-quote guard). SSR render smoke test of v2/v1/empty panel states passes. `tsc` parity vs v7.79/v7.80 baseline: zero new errors.

**Note:** existing analyses keep their v1 panel; re-run a full analysis to populate the v2 panel. Runtime/cost: ~(3×categories+4)×2 probe calls + 1 classification call per full analysis.

## v7.80 — 2026-06-04 · Keyword Landscape category redesign (separate conversation)

Category discovery now spans the entire keyword footprint (batches of 250, concurrency 5) with a consolidation pass merging alias category names; KeywordsPanel rank-bucket pills + rewritten category section. See version log for details.

## v7.79 and earlier

See the OrbitIQ version log (project memory) for the full history back to v6.0.
