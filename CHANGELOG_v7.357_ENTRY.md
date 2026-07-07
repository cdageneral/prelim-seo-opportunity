# v7.357 — Content Map guided flow: P0–P3 tiers + funnel & demand views (2026-07-07)

## What Wayne asked
Turn the Content Map into a stepped workflow (Step 1 audience → Step 2 filter → Step 3 select), add P0/P1/P2/**P3** priority summary cards, add a **funnel view** (sort/group by funnel), and add a **search-demand view** (segment topics High/Med/Low). (The manual move-to-a-priority-bucket is v7.358.)

## Steps
- **Step 1 · Choose your audience** — the existing segment chips, now under a numbered header (in ContentMapSection).
- **Step 2 · Filter & focus** — status cards + the new priority cards + the View lens + "Where you rank".
- **Step 3 · Select your topics** — the checkboxes + "Select all shown".

## Fourth priority tier (P3 = Backlog)
Extends the v7.356 funnel-×-demand model to four tiers. "Above median" = this project's own median topic volume is the demand gate.

| Bucket | Rule |
|---|---|
| **P0** Do first | brand OR decision with real demand; consideration/retention above median |
| **P1** Next | consideration/retention below median; product-awareness above median; brand/decision with zero demand |
| **P2** Later | product-awareness below median; pre-product above median |
| **P3** Backlog | pre-product below median (farthest from conversion + thinnest demand) |

Distance (the 4-dot meter) stays a separate funnel-proximity ordinal (brand/decision 1, consideration/retention 2, product-awareness 3, pre-product 4). quick-win = competitor gap, distance ≤ 2, above median.

## Search-demand buckets (Wayne's rule)
- **Low** = at/below the median topic volume
- **Med** = above median
- **High** = top ~10% (90th-percentile outliers)

`demandStatsOf` computes {median, p90} once over the whole topic set; `demandBucketOf` assigns each topic. Stable regardless of the active filter. Pure ordinals over the exact volume rollup (Const I.1).

## View lens (Step 2)
A segmented control: **Flat list** (default, unchanged) · **By funnel stage** (grouped Decision → Consideration → Awareness → Retention, lower-funnel first) · **By search demand** (grouped High → Med → Low). Each group header shows its count and monthly volume. Row order inside a group keeps the priority→distance→volume sort.

## One source of truth (Const II.7)
`scoreTopic` (the single shared scorer) now emits four tiers; every consumer of the shared `Priority` type learns P3 in lockstep:
- `contentPlan.ts` — `Priority` union + `scopeOf` (adds p3/p3Vol) + `PRIORITY_LABEL` (P3 = Backlog) + new `demandStatsOf` / `demandBucketOf` / `DEMAND_LABEL`.
- `ContentPlanSection.tsx` — priColor + order + content-mode priority cards + View lens + grouped rendering + shared exported `StepHeader`.
- `ContentMapSection.tsx` — Step 1 header around the segment bar.
- `ScopeSection.tsx` — P3 → Year 4+ lane + priColor.
- `lib/export/briefExport.ts` — PRI_LABEL adds P3.

## Files
`lib/journey/contentPlan.ts` · `components/brief/ContentPlanSection.tsx` · `ContentMapSection.tsx` · `ScopeSection.tsx` · `lib/export/briefExport.ts` · `package.json` / `package-lock.json` (7.357.0).

## Verification
- **Full-project `npx tsc --noEmit`** on a clone of the LIVE repo (v7.356.0) with real deps, 5 files overlaid → **CLEAN** (V.1a gold standard).
- **28/28** Node checks on the real compiled logic: 4-tier matrix, brand override, quick-win, demand buckets (median + top decile), e2e scope rollup includes p3 and tiers partition the total (no double-count).
- **SSR render** (react-dom/server) of ContentExplorer both modes → OK: content mode shows Step headers + P3 card + "By funnel stage" + "By search demand"; plan mode has no steps (correct).
- Both themes: only COL / `var(--ca-*)` theme tokens; no JSX color hardcodes (IV.6).

## Deferred
- **v7.358** — manual "move a topic to another priority bucket", persisted per project (DB column, survives re-analysis, reconciles across panels).
