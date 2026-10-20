# v7.577 — Split review: keep groups as their own pages, see scope, drop single keywords (2026-10-20)

Wayne, reviewing the Travel split: *"i dont want to merge - i want more pages that match a specific intent"*. Also earlier: *"what if there are some that I dont want to include"*.

- **Make it its own new page.** A group the model sent to an existing category elsewhere (e.g. "Rewards" → Card Types › Rewards) can be turned into a new sub-category under the category being split instead.
- **Scope shown on every row.** Each group is tagged NEW PAGE or REUSES EXISTING. If its destination is unticked in Step 2, it also shows "OUT OF YOUR SCOPE — these keywords stop counting", read with the pool's own selection rule. On Citi Travel this flagged the 21-keyword Rewards group (58K/mo) before it was applied.
- **Drop one keyword.** Expand a group and click ✕ on a keyword to move it to "Other".
- "Merge into…" is now "Change…" (own page / merge into a group / General). The server still re-validates the edited proposal; "Other" is always an allowed destination.
- Verified: `tsc`, `next build`, suite 3,649 PASS with the same FAIL set as v7.576, +3 render checks.
