# v7.566 — The categories are the only boundary: brand is a tag, not a category (2026-10-19)

Wayne, with a screenshot of the Keyword list: *"the category boundary is being superceded by the branded and co-branded footprint. The categories should be the ultimate boundary in the keyword selection panel."*

- **What was happening (measured on Citi (travel cards), live data).** Keyword Selection Step 2 never listed
  brand-typed categories; the panel said "Brand categories are always in scope". v7.530 also kept client brand buckets,
  so every keyword stored under a brand node skipped the selection. On this project that was 798 keywords and
  7,543,860 monthly volume under "Co-Branded & Retail Credit Cards", "Rewards & Loyalty Programs", "Citicards Brand
  Searches" and "Citibank Brand Searches". "citi aa", "costco citibank visa", "citi diamond preferred card login" and
  "store credit cards" all sat under "Co-Branded & Retail Credit Cards".
- **Fix: brand is a label, not a category.** `buildKwPool` now holds any footprint keyword, client or competitor gap,
  whose stored category or any node of its stored path is brand-typed. It is held as awaiting categorization: counted,
  never dropped. It keeps its Branded label. "Categorize now" files it under the product or task it names, or under
  "Other". From then on the Step-2 selection governs it like every other keyword. The category guard, the Google Ranks
  guard and the local-scan guard no longer render any brand-typed category, the client's own included.
- **The filer files into the true home.** Candidates are the whole product tree, not just the selected categories.
  The selection is applied when the pool is read. Before this, "selected or Other" pushed keywords from deselected
  products into "Other", which then leaked whenever "Other" was in scope.
- **Brand-node paths are never a target (no re-file loop).** A category's stored parent is a single value, but
  keywords reach the same leaf by different paths: "Card Login" has parent "Co-Branded & Retail Credit Cards", yet
  keywords sit at "Credit Cards › Card Login". So targets are the stored product paths with no brand node in them,
  one candidate per path ("Credit Cards › Management" and "Business Credit Cards › Management" are both offered).
- **Prompt.** The v7.538 instruction to file own-brand searches "in the category named for the client's brand" is
  withdrawn. Own and partner brand searches are now filed by the product, card, account or task they name.
- **Real-data A/B (Citi (travel cards), in-page replay of the real compiled pool over the live snapshot).** Pool
  3,658 → 2,860. Rows under a brand node in the pool: 798 → 0. Held for filing: 0 → 798 (515 client, 283 gap, 270
  Branded). Volume is conserved exactly: 7,543,860 left the pool and 7,543,860 is held. Filing candidates: 16 product
  paths, none through a brand node.
- **Verified.** Project `tsc` clean (no target override). Retained suite: 3,514 PASS. Zero new FAILs vs v7.565; the
  pre-existing environment FAILs are unchanged. +31 v7566 checks cover the pool hold, guard, candidates, the filing
  round-trip, the selection tree, the prompt and wiring. Negative control: 21 of the 31 fail on v7.565.
- **Constitution v0.41** (III.1, III.1a, III.1e, Article VIII III line).
- Release gate: II.9 not touched (no new queries). I.5: nothing dropped, held rows are counted on the pending bar.
  IV/V.5: copy-only UI change (two strings, existing tokens), legible in light and dark.
- Files: lib/utils/kwVolume.ts, lib/category/categoryGuard.ts, lib/category/pendingCategorization.ts,
  app/api/projects/[id]/categorize-pending/route.ts, app/api/projects/[id]/local-scan/route.ts,
  components/brief/GoogleSerpSection.tsx, components/brief/KeywordSelectionSection.tsx,
  components/brief/PendingCategorizationBar.tsx, package.json, CHANGELOG.md.

