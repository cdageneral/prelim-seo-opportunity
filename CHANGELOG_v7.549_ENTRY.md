# v7.549 — The automatic page map: clusters matched to pages by intent and theme (2026-10-09)

Wayne, on Citi (Cards): "the credit card types category you list the url as the strata card … when they have the view all
credit cards page which matches the card types category"; "the airline cards page is the same as the american airlines
page - why?"; then the rule itself: "the url match is not about what is the highest ranking keyword. It is matching
keyword cluster themes to the right intent matched URL" — and "the mapping should happen automatically on a project".

Verified cause on the live data: Product Insights rows took the URL of the single best-ranked keyword and the cluster
builder the URL with the most ranked volume, both letting branded terms vote. One branded #1 ("citi strata") decided a
634-keyword category; a parent row inherited its child's best keyword ("citi aa" → the AAdvantage card page), so Airline
Cards and American Airlines showed one page. The view-all hub ranks for 30 pool keywords, 29 of them Citi-branded and
none under Credit Card Types — no ranking rule could ever have placed it there.

- **Page map, built automatically** (`lib/pages/pageMap.ts`, `/api/projects/[id]/page-mapping`, `lib/pages/usePageMap.ts`).
  The project page runs the steps whenever work is pending — nobody presses "map pages". Steps: the site's own sitemap(s)
  + every URL the client ranks on → one page inventory (capped at 3,000, ranking pages first, disclosed) → titles/H1 read
  from the pages → page TYPE (hub / product / guide / comparison / support / location / other; login + legal by rule, the
  rest Claude-labelled with its own confidence) → every taxonomy node matched by Claude to the page whose intent and theme
  fit it, from candidates chosen by theme + ranking evidence. Time-boxed steps, one runner lock (a second tab polls), every
  Claude call in the API Usage ledger, stale nodes re-mapped only when their keywords or children change.
- **One rule everywhere** (`resolveNodePage`): set page → page map match (≥ 0.6) → the ranking vote as a labelled fallback
  (non-branded top-20 volume first; branded terms decide last) → "no page" is final: the node is a page to BUILD and its
  ranking URLs are disclosed as consolidation candidates, never borrowed. Read by the cluster builder (`pageRootTopics`),
  the category tree, topic rows, the Profound prompt join and the Assessment PDF.
- **Product Insights:** PAGE MAP · AUTOMATIC card (inventory, page types, matched / review / no page, live step
  progress, re-match + rebuild controls, basis line); every topic row and sub-category row shows its resolved page, a
  basis chip (intent-matched / set by you / review / branded ranking only / no page — build), the measured ranking evidence
  for that page, "same page as …" when another row shares it, and **Set page** (ranking candidates, searchable inventory,
  or any URL on the client host → `/api/projects/[id]/page-overrides`, labelled "set by you" everywhere).
- **PDF (II.6b):** sub-category rows print the page, its basis and evidence; a page-map basis line separates labels from
  measured figures.
- Constitution v0.40: III.5(a) revised to the intent-matched page rule; Art. VIII line updated.
- Verified: tsc + `next build` clean; suite A/B identical FAIL set (48 pre-existing), +65 invariant checks (v7549) and +11
  dual-theme render checks (card, both row kinds, same-page note, picker → PUT); Chromium render both themes.
- Files: lib/pages/{pageMap,electPage,usePageMap}.ts, app/api/projects/[id]/{page-mapping,page-overrides}/route.ts,
  components/brief/PageMapControls.tsx, components/brief/ProductInsightsSection.tsx, lib/clusters/canonical.ts,
  lib/productInsights.ts, lib/profound/pageLinks.ts, lib/utils/hydrateSnapshot.ts, lib/seer/core.ts, db/schema.ts,
  app/projects/[id]/page.tsx, app/api/projects/route.ts, app/api/projects/[id]/route.ts, categorize-pending + profound-links
  assign routes, app/api/reports/pdf/route.ts, lib/pdf/assessmentTemplate.ts, package.json.
