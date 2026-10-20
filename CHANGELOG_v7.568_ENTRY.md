# v7.568 — SERP Features counts only the in-scope keywords (2026-10-20)

Wayne, with a screenshot of SERP Features on Citi (travel cards): *"looks like this is not reflecting the updated keywords"*.
The panel showed "Available 24109 · 9 scanned + 24,100 from upload" against a 25-keyword scope.

- **Cause.** SERP Features counted the raw `/keywords` rows. That is every row ever uploaded: the client, every
  competitor, out-of-scope categories, and rows awaiting categorization. It never went through `buildKwPool`, so the
  Step-2 selection, the brand guard and v7.566/v7.567 did not reach it (a II.7 gap). The same raw rows fed three
  other places. The nav SERP-features score. The "AIO-only" SERP scan, which could spend API calls on out-of-scope
  keywords. And the PDF SERP section, which listed every scanned keyword.
- **Fix.** New shared `scopeUploadRows` (lib/serp/featurePool.ts). The panel builds the canonical pool with the
  same options as the SERP scan route and counts only those keywords, uploaded or scanned. The page's nav score,
  the AIO-only scan candidates and the PDF SERP section now read the same in-scope set. Out-of-scope rows stay
  stored, and they come back the moment their category is selected.
- **Verified.** Project `tsc` clean. Real `next build` clean. Retained suite: 3,561 PASS with the identical FAIL
  set to v7.567. +8 v7568 checks cover the scoped counts (AIO availability 3 → 1 on the fixture) and the wiring at
  all four sites.
- Files: lib/serp/featurePool.ts, components/brief/SerpFeaturesSection.tsx, app/projects/[id]/page.tsx,
  app/api/projects/[id]/serp-scan/route.ts, app/api/reports/pdf/route.ts, package.json, CHANGELOG.md.

