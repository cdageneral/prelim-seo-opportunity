# v7.575 — Split review: merge groups, and catch existing categories by label (2026-10-20)

A second propose-only test on live Citi Travel (12 s, nothing written) still returned look-alike groups (Airline Credit Cards next to Airline Miles & Mileage Cards) and a new "Travel Cards with Lounge Access" beside the existing Credit Cards › Choosing a Card › Lounge Access. The model's grouping varies run to run, so the review step now gives you the final say, and code catches the existing-node case:
- Each proposed group has a **Merge into…** control: fold it into another group, or keep its keywords on General. Apply sends the edited proposal and the server re-validates it.
- A new group whose label, minus the category's own words and filler, equals an existing category elsewhere in the tree is moved to that category (III.1e: one concept, one node).
- Verified: `tsc`, `next build`, suite 3,644 PASS. The only new FAIL is the known v7552-render ETA timing flake (unrelated, unchanged code). +1 v7573 check, +1 render check (merge during review).
