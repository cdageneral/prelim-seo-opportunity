# v7.551 — Page map: sub-categories first; a page a sub-category took is never the parent's (2026-10-09)

Second live pass on Citi (Cards) under v7.550 still put "Credit Card Types" on the cash-back hub (0.78) and "Airline
Cards" on the AAdvantage card page (0.72): the matcher saw every node independently, and the parent's own keyword list
was led by branded product terms.

- **Deepest level first.** Nodes are matched one level at a time from the leaves up; when a parent is matched, every page
  already taken by one of its sub-categories is marked in its candidate list as taken — never the parent's answer. If no
  page spans the whole cluster the answer is 0 (a spanning page to build).
- **Non-branded keywords lead.** The theme shown for a node is its top non-branded terms; branded terms are counted, not listed.
- PAGE_MAP_VERSION 551: every node is re-matched once, automatically, on the next project open.
- Verified: tsc + `next build` clean; v7549 checks 75 PASS (+5, one updated with a dated note).
- Files: lib/pages/pageMap.ts, app/api/projects/[id]/page-mapping/route.ts, package.json.
