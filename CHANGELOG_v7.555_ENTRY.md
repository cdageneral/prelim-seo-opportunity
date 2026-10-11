# v7.555 — Themes panel roots on the page map; unique-URL count on every theme summary (2026-10-11)

Wayne: *"are the themes now mapped to unique URLs? so is the 100 existing matching 100 unique existing urls?"* …
*"yes fix and then also add a note in each theme summary on how many unique urls there are"*

- **The bug.** v7.549 wired the automatic intent-matched page map (+ "Set page" overrides) into
  `buildCanonicalClusterTopics` — Content Plan, Journey, Exec, PDF — but the Themes panel's own two
  `pageRootTopics` calls (the hero/table flatten and the header topic count) were never passed it, so the panel
  kept rooting every cluster on the best-RANKING page. Live Citi (Cards) still showed the exact pre-map v7.541
  figures (166 · 109 existing · 57 net-new). Its counts could disagree with every canonical surface (II.7) and a
  set page never reached it.
- **The fix.** The panel reads `_pageMapNodes` + `_pageOverrides` from the same snapshot the canonical build reads
  and passes them to both calls — one page rule, every surface (III.5(a) v0.40).
- **Unique URLs on every theme summary.** Each umbrella and theme header now reads
  "N topics · X unique URLs · Y to build · vol/mo", plus "(+Z not on file)" when an existing topic has no URL on
  file. X is counted as DISTINCT normalised page URLs from the rows (new shared `pageUrlSummary` in
  lib/clusters/canonical.ts), never assumed from the one-cluster-per-URL rule. Numbers are bold in the header's
  own colour (the hero's green/amber measured 3.1:1 on the light procedure-tint band).
- **Uniqueness (answering the question).** Clusters are grouped by URL before they are emitted, so no two existing
  clusters share a URL; the hero's "N are cluster pages" equal to "N existing" with no "URL not on file" proves a
  1:1 match.
- **Downstream (II.6a).** The PDF, Content Plan, Journey and Exec already read the page-mapped canonical build — this
  release brings the panel onto them; no downstream basis changed. II.9: no queries touched.
- **Verified.** Project `tsc` clean; real `next build` clean; retained suite zero delta (49 pre-existing FAILs
  identical to pristine v7.554); +28 new v7555 checks — pageUrlSummary unit checks (two spellings of one page
  count once), source guard that every Themes-panel `pageRootTopics` call passes the page map, and the REAL
  ThemeClustersPanel rendered in dark + light against a hand tally: no map → 2 existing · 2 net-new (v7.541
  unchanged); with map → 4 · 2, equal to the canonical build on the same snapshot; "5 topics · 3 unique URLs ·
  2 to build", "3 topics · 2 unique URLs · 1 to build", "1 topic · 0 unique URLs (+1 not on file)".
- Files: components/brief/ThemeClustersPanel.tsx, lib/clusters/canonical.ts, package.json.

