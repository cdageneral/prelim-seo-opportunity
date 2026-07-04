# v7.346 — Hotfix: time-box the LLM visibility probe (unstick the synthesize loop)

**2026-07-04 · production incident fix**

## Symptom
Large uploads (e.g. TD Bank, 1,429 keywords) got stuck on the analysis screen at
"Categorizing keywords — batch 0 of 58 / 5%" for a very long time and never finished.

## Root cause
Categorization actually **completed** (91 categories, 1,429/1,429 keywords, checkpointed).
The blocker was the **LLM visibility probe** (Phase 2): 30 categories × 6 prompts × 2
platforms (~370 external AI calls) could not finish inside Vercel's 300s function limit
(`maxDuration = 300`). The probe only checkpointed its result **after fully completing**,
so every 300s timeout (`504 / Task timed out after 300 seconds`) saved nothing and the
next auto-resume restarted the probe from scratch — an infinite loop. The progress UI
stayed on the categorization phase because discovery is skipped on resume (counter = 0).

## Fix
Time-box the probe against a wall-clock deadline (`PROBE_SAFETY_MS = 250_000`, measured
from synthesis start) that keeps a safety margin under the 300s kill. The probe races that
deadline; if it can't finish in the remaining budget, the brief completes with the previous
probe data (or an honest empty gap, Const I.5) and a later run backfills. The synthesize
function now **always returns cleanly**, so the run finishes and the brief renders instead
of looping. No infinite 504 loop regardless of project size.

## Scope
- `lib/claude/synthesize.ts` — probe time-box (branches verified: probe-fits / exceeds-with-prior / exceeds-no-prior / too-little-time).
- `package.json` — 7.345.0 → 7.346.0.

## Verify
- Real project `tsc --noEmit` (strict, project tsconfig, no target override — Const V.1a): clean.
- Existing stuck runs auto-resume to completion because the category breakdown is already checkpointed on the analysis — no re-upload needed.
