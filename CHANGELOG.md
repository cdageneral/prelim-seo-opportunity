# OrbitIQ Changelog

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
