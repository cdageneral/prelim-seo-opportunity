# v7.546 — Product Insights category rows no longer spill past their card (2026-10-09)

Wayne: "on the product insight panel the formatting is off" (screenshot: the PAGES · JOURNEY VS ACTUAL card on every
category row sticking out past the row's right edge).

- **Cause.** Each category row was a fixed 6-column grid (`22px minmax(130px,.9fr) minmax(250px,1fr) minmax(350px,1.3fr)
  minmax(180px,.7fr) 236px`). Those minimums sum to ~1,250px — wider than the panel — so the grid could not shrink and
  the last column (the Pages card) was pushed out of the row. Measured in real Chromium on v7.545: 37px past the edge
  even on a wide window, 209px at 1100px, 409px at 900px.
- **Fix.** The row is now `arrow | name | metrics`; the four metric groups (Google Rank Demand → LLM & AI Visibility →
  Google SERP Features → Pages · Journey vs Actual — same order Wayne approved in v7.458) sit in one wrapping flex row.
  With room they stay on one line; on a narrower window a group drops to the next line inside the card instead of
  overflowing. Name column capped at 140px (it was taking ~half the row once the grid could shrink).
- Layout only — no numbers, labels, colours or data paths changed. II.6a: no panel metric changed, PDF unaffected.
  II.9: no queries touched. IV.6/V.5: rendered in both themes.
- Verified: project tsc + `next build` clean; retained suite 2,875 PASS / 48 FAIL on BOTH base and this change (identical
  pre-existing FAIL set, zero delta); new real-Chromium gate `_verify/layout546` — every row contains all its content at
  900/1100/1300/1500/1800px in light + dark, all four groups on one line at ≥1500px, and v7.545 kept as a negative
  control (overflows in 10/10 cases).
- Files: components/brief/ProductInsightsSection.tsx, package.json.
