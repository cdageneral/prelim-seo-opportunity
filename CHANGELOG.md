# OrbitIQ Changelog

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
