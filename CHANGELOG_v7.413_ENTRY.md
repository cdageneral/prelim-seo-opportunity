## v7.413 — The SERP panel stops naming the vendor in operational copy (2026-08-05)

**Wayne, looking at the "Scan all 10,158 remaining · ~10,158 credits" button:** *"does this serp fetch call use the new dataforseo api?"* — it does. Then: *"no need to name the api in the UI. just call it an api call - which allows us flexibility to change down the road if need be."*

**What was wrong.** `SERP_PROVIDER=dataforseo` has been live since v7.408, so that button scans through the provider dispatch and files every row as DataForSEO. But the panel's own copy still said **"1 SerpAPI credit each"** in the tooltip and **"Availability combines 5 SerpAPI-scanned keywords"** in the caption. The caption was true only by accident — those 5 rows predate the flip. Running the scan would have filed **10,158 DataForSEO rows under the words "SerpAPI-scanned"**, and quoted the cost in the wrong unit at roughly 4.6× the real rate. v7.408 fixed the badge, the XLSX column and the remediation messages; it missed this panel's body copy.

**The fix Wayne chose is better than the one I proposed.** I was going to plumb the active provider down to the panel so it could name the right vendor. Naming no vendor removes the whole class of bug instead: operational copy now says **"API calls"**, so switching providers can never leave a sentence asserting the wrong source, and there is no client-side provider state to keep in sync. The plumbing I had already written for it was reverted rather than shipped.

Changed: the scan tooltip, the scan button label, the AIO verify label, both stale-refresh labels, the availability caption ("live-scanned" rather than a vendor name), and both in-progress scan labels.

**What deliberately did NOT change: per-row provenance.** The badge on each scanned row and the provenance column in the XLSX export still report the provider that actually produced that row, read from the stored `scannedBy`. That is the audit trail, not operational copy — it is what lets a client-facing number say where it came from (Const I.1), and it stays correct across any future provider change precisely because it is recorded per row rather than assumed. The suite now asserts both halves: no vendor name in operational copy, AND the provenance badge still present and still reading the stored value.

**Verified:** real project `tsc --noEmit` clean and a real `next build` clean (V.1a); retained suite **1004 pass / 19 pre-existing / zero regression delta** with **7 new v7.413 checks**, 5 of which were confirmed to FAIL against the live v7.412 base.

