# OrbitIQ Changelog

## v7.258 — 2026-06-22 · Mind-map = umbrella → category → topic hierarchy, click any node for its keywords + volume (Wayne's Option 3)

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
