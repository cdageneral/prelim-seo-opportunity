# v7.360 — Content Map filter redesign, Option C: dimension tabs (2026-07-07)

## What Wayne asked
Redesign the Content Map filter section to be more organized and professional, and add the priority buckets. Shown three mockups (A: priority hero + toolbar; B: labeled filter groups; C: dimension tabs → one chip row). Wayne picked **Option C**.

## What shipped
- The Step-2 filter area is now a single **dimension tab strip**: Priority · Funnel stage · Search demand · Where you rank · Status.
- Picking a tab shows only that dimension's **chip row** — an "All" chip plus each value, every chip carrying its topic count, monthly volume, and an Excel download (the same PChip style as the old "Where you rank" row).
- Clicking a chip filters the list to that value; clicking it again clears that dimension.
- **Dimensions combine (AND).** The list is one flat set filtered by every active dimension. Each tab's chip counts and volumes are **faceted** over the OTHER active filters (`facet(except)`), so a chip always reflects what selecting it would yield in the current context.
- **Nothing hidden:** active filters from tabs you're not currently viewing appear as removable pills under the chip row (with a Clear all), and each tab shows a small dot when it holds an active filter.
- **Replaces** the previous stack — big status cards, separate priority cards, the View lens, the group chips, and the Where-you-rank row — and removes the funnel/demand **grouping** view. Funnel stage and search demand are now filter dimensions; the list stays flat, sorted priority→distance→volume.
- Unchanged: the inline row Move-to-priority control (v7.359), the topic drawer, and the Content Plan / Scope panels (this redesign is Content-Map-only, `mode==='content'`).

## Implementation notes
- Reused `cFilter` (status), `cPriority`, `posFilter` (rank) as dimensions; added `dimTab`, `funnelPick`, `demandPick`.
- `dimPreds` = one predicate per dimension; `facet(except)` ANDs all but one; `contentRows = facet('none')` sorted.
- `activeDimChips` builds the active tab's chips (uniform shape; setters cast to `(v: string) => void`; exposes the faceted "All" set).
- `activeFilters` lists non-"all" dimensions for the pills + `clearAllDims`.

## Files
`components/brief/ContentPlanSection.tsx` · `package.json` / `package-lock.json` (7.360.0).

## Verification
- **Full-project `npx tsc --noEmit`** on the live-repo clone with real deps → CLEAN.
- **SSR render**: content mode shows all five tabs, the priority chip row, and the preserved inline Move control; plan mode still renders its own cards (untouched).
