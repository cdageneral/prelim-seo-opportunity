# v7.362 — Fix phantom "N selected" (orphaned selections) (2026-07-07)

## The bug
Wayne saw "2 selected" on the Content Map with no checkbox actually ticked.

## Cause
The Content Plan selection is stored per project as a set of `ContentTopic.id`s (`content_plan_selections`). After a re-analysis regenerates the taxonomy, topic ids change, so ids saved under the OLD taxonomy no longer match any current topic. Those orphaned ids can't render a checked row, but they still counted toward the `{selectedIds.size} selected` total — a phantom count.

## Fix
`ContentMapSection` now reconciles the loaded selection against the live canonical topics:
- Once `canonTopics` resolve (guarded: never runs while empty, so a valid selection is never wiped), build the set of valid ids.
- Prune any selected id not in that set.
- If anything was pruned, update state and PUT the healed set to `/api/projects/[id]/content-plan` — which also prunes Scope (scope ⊆ plan) via the same route.
- No-op when nothing is orphaned (no needless writes / render loops).

Result: the checkbox state and the "N selected" count agree, and the heal persists so the Content Plan and Scope panels are corrected too.

## Files
`components/brief/ContentMapSection.tsx` · `package.json` / `package-lock.json` (7.362.0).

## Verification
- **Full-project `npx tsc --noEmit`** on the live-repo clone with real deps → CLEAN.
- **Unit check** of the prune logic: keeps valid ids, drops orphans, no-ops when all valid.

## Note
The root cause is topic-id churn across re-analysis. A durable follow-up would be a stable topic-id anchor (like the taxonomy anchor) so selections survive re-runs by identity rather than needing to be pruned — worth considering if this recurs.
