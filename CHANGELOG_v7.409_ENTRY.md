## v7.409 — SERP provider is chosen per CAPABILITY; Local search stays on SerpAPI (2026-08-05)

**Wayne, right after the v7.408 switch went live:** *"if Local panel still needs to use SERPAPI - then use that. We can use both APIs."*

**The problem this fixes.** `SERP_PROVIDER` governed **three** call paths at once — keyword scans (AIO/PAA), Google Maps listings, and the local 3-pack. Only the AIO/PAA path was ever parity-tested against DataForSEO (2026-08-05, `/api/serp-compare`, real client keywords). So the moment `SERP_PROVIDER=dataforseo` went live, the Local Search panel started serving from a provider nobody had compared — an unverified source behind a client-facing panel, which is the case Const I.1 exists to prevent. v7.408 documented this as a known gap; v7.409 closes it.

**Provider selection is now per capability.** `SERP_PROVIDER` selects the **keyword-scan** provider only. Maps listings and the local 3-pack read `localSerpProvider()`, pinned to SerpAPI via `LOCAL_SERP_PROVIDER` in `lib/apis/serp.ts`. Both providers now run side by side, each on the path it has been verified for.

**Why a constant and not another env var.** Two reasons, both I.1. A flag would let local be moved to an untested provider without anyone running the comparison first. And the Local panel's own copy still names SerpAPI in several places ("1 SerpAPI credit per keyword", "Real SerpAPI local results") — those sentences are **true** while local stays pinned, and would become false provenance claims the instant a flag moved it (the v0.24 naming rule). Moving local is therefore a deliberate release: extend `/api/serp-compare` to cover Maps + Local Pack, run it, then change the constant and make the panel's labels dynamic **in the same commit**.

**Verified:** real project `tsc --noEmit` clean and a real `next build` clean (V.1a); retained suite **965 pass / 19 pre-existing / zero regression delta** with **10 new v7.409 checks** (including that there is NO env override for local, and that neither local path still reads the global flag). The v7.397 check asserting all three entry points shared one resolver was **amended with a dated note, never deleted** (V.6) — it still asserts a total dispatch count of 3, so a dropped entry point is still caught, but now across two capability-scoped resolvers.

