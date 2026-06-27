# OrbitIQ Changelog

## v7.305 — 2026-06-26 · Demand-keyword parity: Google Rank + Executive Summary reflect the expanded footprint
After "Expand product data" unioned the deep-journey missing-demand universe into the Keyword Landscape (1,243 → 2,713 = 358 CSV + 1,470 missing demand + 885 gap), the **Google Rank** and **Executive Summary** panels still showed the old 1,243 footprint. ROOT CAUSE: both called `buildKwPool` WITHOUT the opt-in `includeDemand` flag (only KeywordsPanel + ThemeClustersPanel passed it), so the 1,470 `origin:'demand'` keywords were excluded. FIX (2 files): `GoogleSerpSection.tsx` + `ExecutiveSummarySection.tsx` now pass `includeDemand:true`. In Google Rank the missing-demand keywords are split out (`origin==='demand'`) so they are counted in **Total Keywords** (→ 2,713, matches Keyword Landscape) and folded into the share denominators (Pg-1 Vol Share, Top-3 Share, % outside top 3, Share of Voice) — per Wayne's "fold demand into share too" decision — but kept OUT of the ranked footprint, so **Ranked Keywords** stays the real client count (358) and the rankings table lists only real client rankings (Const I.1). Stat-card labels broken out honestly: "358 ranked + 1,470 missing demand + 885 gap". Executive Summary's SoV already routes through GoogleSerp's `computeSov`, so it inherits the SoV fix; its `kwPool` gets the flag so the Volume-Opportunity denominator reconciles (Const II.6/II.7). Local Intent unchanged by design (canonical category model + local-pack filter; missing-demand kws carry no local-pack signal). Verified: isolated tsc (project tsconfig, no target override, Const V.1a), TS compiler-API parse 0 diagnostics, real-scale reconciliation sim (358/1,470/885 → Total 2,713 / Ranked 358). No styling changes → theme parity (IV.6/V.5) unaffected. Rebased on the LIVE production tree (v7.304, commit 64f8fbdc); the parallel session's v7.298–v7.304 changes to LocalSearchSection / local-scan / CHANGELOG are preserved in this package.

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

**The ask (Wayne).** On the Content Plan panel, add two primary CTA buttons. **"Add to Scope"** gathers all the content info for the existing and net-new assets into a running scope spec sheet — like a shopping cart. Under the Executive Summary, add a **"View Scope"** where everything added to scope appears. A second button, **"Push to Brief Agent,"** is a