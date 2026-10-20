# v7.574 — Split: tighter groups, never into a brand bucket (2026-10-20)

Found by a propose-only test of v7.573 on live Citi (travel cards) "Credit Cards › Card Types › Travel" (137 keywords, 13 s, nothing written):
- The largest group, "Best Travel Credit Cards" (45 keywords), only restated Travel itself. "Best" is a linguistic adjective (III.1c). Code now sends any group whose name unifies to the category's own name back to General.
- Look-alike siblings appeared (Airline / Airline Miles / Frequent Flyer; Travel Rewards & Bonus). The prompt now forbids sub-categories one page would answer and names this exact case.
- Two keywords were moved into "Co-Branded & Retail Credit Cards" nodes. Brand-typed nodes are held, never categories (v7.566), so they are no longer offered as targets. A keyword that doesn't belong goes to an existing product category or "Other".
- Verified: `tsc`, `next build`, suite 3,643 PASS with the same FAIL set as v7.573, +4 checks.
