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

