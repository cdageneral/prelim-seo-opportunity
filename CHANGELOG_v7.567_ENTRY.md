# v7.567 — Only ticked boxes count; the filer files into the most specific category (2026-10-19)

Wayne, after v7.566 on Citi (travel cards), with a screenshot: *"i did all of that and the terms are still in there"*.
"costco credit card", "citi strata elite", "citi double cash card" and others were still in scope.

- **What was happening (live data, Citi (travel cards)).** Filing had run (0 pending), and it exposed two leaks.
  (1) The filer could only choose among the ~30 top-level category names, so co-brand searches landed on
  broad parents: all ten keywords in the screenshot went to "Credit Cards › Card Types". (2) A keyword filed
  directly on a node with children has no checkbox. When that node was only partly ticked, nothing hid it, so it
  stayed in scope. On this project that was 3,072 keywords and 4.56M monthly volume: Credit Cards 361,
  Card Types 645, Education 1,307, Choosing a Credit Card 758. 3,026 of them were placed there by the filer.
- **Only ticked boxes count (General rows).** Every node that has children and its own keywords now shows a
  "General <name>" row in Step 2. On a partly-ticked node it starts unticked, so those keywords are out of
  scope until it is ticked. On a fully ticked node it starts ticked. The choice is saved with the selection
  (`own: include | exclude`). One rule, `ownIsOutOfScope` in lib/category/selectionScope.ts, is read by the
  pool, the wizard tree and every count (II.7). The hidden-categories route, the Category Breakdown hide,
  restore and list, the PDF scope block and the canonical cache signature all keep General choices separate
  from hides.
- **The filer files into the most specific node.** Candidates are every stored keyword path and its
  prefixes: 198 on this project, including "Card Types › Travel", "Card Types › Premium Travel" and
  "Education › Travel Rewards". The prompt asks for the most specific node, and a parent only when the search
  is general to it. The stored category name is the deepest `categories` entry on the path, as synthesis stores it.
- **Re-file of what the old filer left on parents.** A keyword with a filer stamp below 567 sitting on a node
  that has children is held as awaiting categorization. "Categorize now" re-files it. New stamps (567, 568
  and 569) are never held again, so there is no loop. Synthesis placements carry no stamp and are untouched.
  On Citi (travel cards) 3,094 keywords (17.3M monthly) are held. Until they are re-filed, 25 keywords are in
  scope. Those are the ones genuinely under the ticked travel nodes.
- **Also:** "Categorize now" is now on Step 2 as well as Step 3. The Step 3 note states the real filing rule. The
  brand-term box takes a pasted comma-separated list, and unsaved brand terms show "Not saved yet". Wayne's terms
  had not been saved, and the project still had none.
- **Verified.** Project `tsc` clean. Real `next build` clean. Retained suite: 3,553 PASS. Zero new FAILs vs v7.566,
  apart from the timing-sensitive v7552-render ETA pill check, which also flaked in a v7.566 run and touches no
  file in this release. The v476-scope parity check was updated with a dated note: a keyword on a partly-ticked
  node is now out by design. +32 v7567 unit checks and +8 v7567-render checks run the real KeywordSelectionSection
  in jsdom. They check the General row, wizard-vs-pool parity before and after save, and the own:include payload.
  Real-data replay on the live snapshot: none of the ten screenshot keywords remain in scope, and 198 deep candidates.
- **Constitution v0.42** (III.1e, Article VIII III line).
- Files: lib/category/selectionScope.ts, lib/utils/kwVolume.ts, lib/category/pendingCategorization.ts,
  app/api/projects/[id]/hidden-categories/route.ts, app/api/reports/pdf/route.ts, lib/clusters/canonical.ts,
  components/brief/KeywordSelectionSection.tsx, components/brief/KeywordsPanel.tsx,
  components/brief/CompetitorsModal.tsx, package.json, CHANGELOG.md.

