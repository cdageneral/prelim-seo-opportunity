# v7.579 — Local map-pack scan checks every keyword, not the first 300 (2026-10-20)

Wayne: *"In the local search panel why is there a 300 keyword cap?"* → option B (remove it).

- **No cap.** The keyword map-pack scan used to run in one request and keep only the first 300 keywords, in whatever order the panel listed them. Everything past 300 was dropped without a word (v7.299 runtime guard against Vercel's 300-second limit, not a requested limit — Const I.6). Every local-intent keyword is now checked.
- **Highest demand first.** Keywords are scanned in order of real Semrush volume, so a scan that stops early has already covered the biggest keywords.
- **Runs in batches and resumes on its own** (same pattern as the v7.410 review fetch). Each request scans for up to ~4 minutes, saves its progress, and the panel starts the next batch automatically until none are left. Progress and ETA cover the whole run. Closing the page loses nothing: everything checked so far is saved.
- **Continue scan.** If a scan has not checked every keyword (including scans stored before this release, which stopped at 300), the panel says "X of Y keywords scanned — Z still to check" and shows a **Continue scan** button that checks only the remaining keywords. The header badge and the Assessment PDF's local page show "X of Y" until the scan is complete.
- **Cost shown before you spend.** The confirm card shows the search count and the dollar cost at the SerpAPI plan rate from the rate registry ($275 / 30,000 searches).
- **Failed lookups are no longer recorded as "no map pack."** A SerpAPI error or timeout used to be stored as if Google showed no local pack. A failed lookup now stays pending and is retried on the next batch. If a whole batch fails, the scan stops and says so instead of looping.
- Checkpoints write only the `_localScan` field (jsonb_set), not the whole snapshot.
- Verified: `tsc` (project tsconfig), `next build`, retained suite A/B against v7.578: identical FAIL set (63 pre-existing, unrelated), +37 new checks all PASS. Among them, the real route runs at 1,000 keywords: 9 batches, 1,000/1,000 stored, no duplicates, failed lookups retried. The panel was rendered in light and dark.
