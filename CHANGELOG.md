# OrbitIQ Changelog

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
