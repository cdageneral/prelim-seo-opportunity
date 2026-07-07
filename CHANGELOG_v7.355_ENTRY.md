# v7.355 — Content Plan "Clear all": one click empties the plan

**2026-07-07 · Content Plan bulk-remove control (Const I.1, IV.2, IV.6, V.6)**

## What was asked
Wayne: on the Content Plan panel, right at the topic-list toolbar (the
"N topics · X/mo" line in the screenshot), add a select-all / deselect-all
option. On review we agreed a literal "Select all" has nothing to act on
here — the Content Plan lists only the topics already picked on the Content
Map, so every visible row is by definition selected. The useful bulk action
is a single **Clear all** that removes them in one click instead of clicking
each row's ×.

## What shipped

**One "Clear all (N)" button** sits at the topic toolbar, next to the
"N topics · X/mo" count — exactly the screenshot spot. Clicking it removes
every topic the current filters SHOW from the plan in a single save. It
respects the active view: with an audience-segment chip on (v7.353 lens) or a
status/priority filter applied, it clears only that visible slice; with no
filter, it clears the whole plan. N and the volume next to it always match
what's about to go.

**A two-click guard so a stray click can't wipe the plan.** The plan has no
undo (clearing means re-picking on the Content Map), so the first click arms
the button — it turns into "Confirm — clear all (N)" with a warning icon — and
only the second click within ~3.5s actually removes. Changing the filter or
segment mid-way cancels a pending confirm.

**Same persistence as the row ×, just in bulk.** The new `clearFromPlan`
handler removes every shown id from the saved selection in ONE full-set PUT to
`/api/projects/[id]/content-plan` (the bulk sibling of the existing
per-row `removeSelection`) — optimistic with revert on failure. It also prunes
those ids from the Scope cart so "N in scope" stays honest (scope ⊆ plan,
v7.269), and because it writes the same selection store, the cleared topics
un-tick on the Content Map on its next mount.

**Both themes (IV.6).** The button reuses the same both-theme red token pair
the drawer's competitor strip and the brief-error strip already use — legible
in light and dark. No new color literals.

## Verification (Const V)
Real-project `tsc --noEmit` clean on the live v7.354 clone (V.1a). Retained
suite A/B vs pristine v7.354 base: retained delta ZERO (289 PASS / 289 PASS),
then 9 new v7.355 checks added — a jsdom render in BOTH themes asserting the
button shows the shown-row count, the first click arms confirm without
removing, the second click fires with every shown id, the button is absent
when the bulk handler isn't wired (guard), plus source checks that
`clearFromPlan` persists via the /content-plan PUT, the two-click guard is
present, and the both-theme red token is used. Suite now 298 PASS; the only
FAILs remain the 13 known pre-existing esbuild-alias harness artifacts,
byte-identical on base.

## Files
- `components/brief/ContentPlanSection.tsx` — Clear-all toolbar button
  (two-click guard, both-theme) + `clearFromPlan` bulk-remove handler wired to
  the plan's ContentExplorer via the new optional `onBulkRemove` prop.
- `package.json` / `package-lock.json` — 7.355.0.
