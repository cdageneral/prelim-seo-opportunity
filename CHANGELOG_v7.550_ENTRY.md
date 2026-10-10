# v7.550 — Page map: the spanning-hub rule; hubs always offered; blocked titles ignored (2026-10-09)

First live run of the v7.549 page map on Citi (Cards): 731 pages, 291 of 347 clusters matched in one pass — but
"Credit Card Types" matched the cash-back hub (0.72) instead of /credit-cards/view-all-credit-cards, and Citi answers
403 "Access Denied" on 595 pages, which was stored as their title and shown to the labeller.

- **Spanning-hub rule.** A category cluster with sub-categories belongs on the hub that spans all of them (overview /
  "view all" / "compare"), never on the hub of one of its own sub-categories. Written into the match prompt.
- **Hubs always offered.** A product line or any node with sub-categories is offered every hub / comparison page on
  the site (bounded at 40) in addition to the lexical candidates — the spanning hub rarely shares the node's words.
- **Blocked pages.** A fetch that returns 4xx/5xx stores no title/H1; labelling, candidate matching and the picker judge
  such a page by its path and say so. Existing "Access Denied" titles are ignored at read.
- PAGE_MAP_VERSION 550: every node is re-matched once, automatically, on the next project open (page labels kept).
- Verified: tsc + `next build` clean; v7549 checks 70 PASS (+5, one updated with a dated note), render checks both themes.
- Files: lib/pages/pageMap.ts, app/api/projects/[id]/page-mapping/route.ts, components/brief/PageMapControls.tsx, package.json.
