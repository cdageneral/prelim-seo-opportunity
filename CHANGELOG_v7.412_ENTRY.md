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

