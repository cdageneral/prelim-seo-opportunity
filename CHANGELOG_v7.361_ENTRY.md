# v7.361 — Content Map steps in cards (2026-07-07)

## What Wayne asked
The Step 1 / 2 / 3 area "is all blending together… a blob of a mess." Add boxes / dimension so the sections separate.

## What shipped
- New shared `StepCard` component (exported from ContentPlanSection): a raised card — `var(--c-0d0d1e)` fill, `var(--c-1f1f3a)` hairline, 12px radius, padding, bottom margin — with the existing `StepHeader` rendered at its top.
- Step 1 (Choose your audience), Step 2 (Filter & focus), Step 3 (Select your topics) are each wrapped in a `StepCard`, so the three guided blocks read as distinct sections with clear separation.
- Within Step 2, the active dimension's chip row (and the active-filter pills) now sit in an inset **tab-panel** that attaches directly under the tab strip: square top corners, rounded bottom, slightly darker fill (`var(--c-090917)`), so the tabs and their chips read as one connected control instead of loose floating rows.

## Scope
- Presentational only — no behavior, data, filter, or scoring logic changed. Same theme tokens, verified for both light and dark (Const IV.6).
- Content-Map-only (`mode==='content'`). The Content Plan and Scope panels (which share ContentExplorer) render unchanged.

## Files
`components/brief/ContentPlanSection.tsx` (new `StepCard`; Step 2 + Step 3 wrapped; Step 2 chips inset) · `components/brief/ContentMapSection.tsx` (Step 1 wrapped; imports `StepCard`) · `package.json` / `package-lock.json` (7.361.0).

## Verification
- **Full-project `npx tsc --noEmit`** on the live-repo clone with real deps → CLEAN.
- **SSR render**: content mode renders the Step 2 and Step 3 cards and the dimension tabs; `StepCard` renders its rounded (border-radius:12) container standalone.
