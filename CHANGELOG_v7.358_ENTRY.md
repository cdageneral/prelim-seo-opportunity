# v7.358 — Manual priority moves (DB-backed, sticky) (2026-07-07)

## What Wayne asked
Edit a topic and move it manually to a different priority bucket. Decided in v7.357: a **sticky override** that survives re-analysis and reconciles across every panel (DB-backed).

## UX
- Open a topic on the Content Map → the drawer shows a **Move to priority** control: P0 / P1 / P2 / P3, plus **Reset to auto** once a topic has been moved.
- One click reassigns the bucket; the Content Map re-scores instantly (optimistic).
- A moved topic shows a **Manual** tag in the drawer and a small **✎** on its priority pill.
- The move overrides ONLY the priority tier — distance-to-conversion and quick-win stay the auto signals.

## Persistence & reconciliation (Const II.7 / II.8)
- New column `projects.priority_overrides` (JSONB): `ContentTopic.id → 'P0'|'P1'|'P2'|'P3'`.
- New route `PUT/GET /api/projects/[id]/priority-overrides` — mirrors the scope-overrides route (v7.326): full-set replace, `force-dynamic` + no-store, runtime `ADD COLUMN IF NOT EXISTS`.
- Applied at READ time: `page.tsx` injects `_priorityOverrides` onto the snapshot (like `_scopeOverrides`); the ONE shared plan builder (`scoreTopic` consumers) applies `override[id] ?? autoPriority` and sets `ContentTopic.manual`. So the move takes effect **without re-analysis** and every panel (Content Map, Content Plan, Scope, Exec Summary) reads the same bucket.
- Survives re-analysis: the override is keyed by topic id and stored on the project, not on the analysis snapshot. Reset reverts to the auto tier.
- `scopeOf` rolls up from the (overridden) `t.priority`, so the P0–P3 cards and Scope year-lanes reflect moves exactly and still partition the total (no double-count).

## ensureColumns safety (v7.327 lesson)
`db.query.projects` selects all schema columns, so `priority_overrides` is ensured on the **dashboard-list route** and the **project-page `[id]` route** (both load-path reads) in addition to its own route — a `SELECT *` never 500s before the feature route is first hit.

## Optimistic + callback flow
Content Map holds the override set (seeded from the snapshot), applies a move optimistically for instant feedback, PUTs the full map, then calls `onPriorityChanged` → `page.tsx` refetches the project → `_priorityOverrides` re-hydrates → all panels re-score from one source. A failed PUT reverts (never claims a save that didn't happen).

## Files
`db/schema.ts` · `app/api/projects/[id]/priority-overrides/route.ts` (NEW) · `app/api/projects/route.ts` · `app/api/projects/[id]/route.ts` · `app/projects/[id]/page.tsx` · `lib/journey/contentPlan.ts` · `components/brief/ContentMapSection.tsx` · `ContentPlanSection.tsx` · `ScopeSection.tsx` · `ExecutiveSummarySection.tsx` · `package.json`/`package-lock.json` (7.358.0).

## Verification
- **Full-project `npx tsc --noEmit`** on a clone of the LIVE repo with real deps, all v7.358 files overlaid → **CLEAN**.
- **8/8** Node checks on the real compiled logic: override wins over auto tier + sets `manual`; no override → auto + `manual=false`; override does not change distance; scope rollup reflects moves and still partitions the total; unknown id leaves real topics auto.
- **SSR render** both modes → OK: content mode renders the ✎ manual marker with `onMovePriority` passed; plan mode renders.
