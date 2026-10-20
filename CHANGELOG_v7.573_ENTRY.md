# v7.573 — Split a broad category into page-level sub-categories (2026-10-20)

Wayne, on Citi (travel cards) Content Clusters: *"how can there be only 5 pages overall?"* Then he picked option B, fix the cause.

- **Cause (live data).** The rebuilt tree holds "Credit Cards › Card Types › Travel" as one leaf with 137 keywords, 117 of them competitor keywords: airline cards, hotel cards, no-foreign-fee cards and co-brand searches. One node is one page (III.5/III.10), so the page map could only ever give it one page. Travel, Travel & Rewards and No Foreign Transaction Fee all mapped to /travel-reward-credit-cards. 5 pages, 0 net-new.
- **Fix: Split.** Keyword Selection Step 2 shows **Split** on any category with 20+ keywords of its own. One Sonnet call proposes sub-categories, each a page Google would rank on its own (the Same Page Test). Nothing is written until you review the proposal and click Apply. The rules are enforced in code (`lib/category/splitNode.ts`), not left to the model:
  - every keyword is placed exactly once, and anything not placed stays on "General <category>" (I.3);
  - a keyword whose home already exists elsewhere moves to that existing node (one concept, one node, III.1e);
  - new names are unified against existing children (case, "&", plural, word order, filler words like "credit"/"card");
  - a one-keyword group stays on the parent (III.11);
  - a name carrying another company's brand is refused (III.1);
  - apply re-validates against the current tree and leaves anything re-filed since the proposal alone.
- **What a split writes.** Moved keyword paths, current filer stamps (nothing re-files them), a mergeLog entry per group (shown as "split · N kw" in the Keyword panel's merge log), and the new paths placed first on `projects.taxonomy_anchor` so a Refresh Analysis keeps them. The page map then matches each new sub-category to a page automatically; any without a matching client page becomes a page to build.
- **Verified.** `tsc` clean, `next build` clean, suite 3,639 PASS with the same FAIL set as v7.572. +20 v7573 checks (placement, unification, brand refusal, stray-group collapse, apply validation, tree rollups, merge log, anchor, ledger) and +4 v7573-render checks (propose writes nothing; Apply sends exactly the reviewed proposal).
