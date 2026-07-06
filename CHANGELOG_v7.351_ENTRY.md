# v7.351 — The analyzing screen stops freezing at "batch 0 of 58"

**2026-07-06 · progress UX / performance (Const IV.2, IV.3, V.6)**

## Symptom
On a large refresh (TD Bank, 1,429 keywords), the analyzing screen sat at
"Categorizing keywords — batch 0 of 58 · 5%" for the whole ~10-minute run and
looked stuck ("it's just spinning"). The synthesis itself was fine — it
completed across 3 Vercel windows exactly as the resume system is designed to
(discovery → consolidation → insights → finalize, all checkpointed). Only the
**progress display** was broken.

## Root cause
`GET /api/projects/[id]/synthesis-progress` — the screen's 10-second poll —
called `db.query.analyses.findFirst`, which ships the ENTIRE `semrush_snapshot`
to the function and JSON-parses it every poll. For a large project that snapshot
is several MB (1,400+ `topKeywords` + `gapKeywords` + the
`_synthCheckpoint.cbProgress.proposed` array, one object per keyword, +
`canon.mappings`). The read ran for many seconds and the poll frequently TIMED
OUT; when a poll times out the client keeps its last value, so the bar froze at
its first reading (batch 0) even though the engine was advancing. A live fetch
of that endpoint took >180s to return.

## Fix
1. **Cheap poll (the real fix).** The route now extracts only the small scalar
   counts with Postgres jsonb operators (`jsonb_array_length`, path `->`/`->>`,
   `IS NOT NULL`) in a single `SELECT` — the multi-MB arrays never leave the
   database, so the poll returns in milliseconds and the bar tracks real
   progress (Const IV.2 / I.1). The done/total/stage math is extracted to
   `lib/synthesis/progressMath.ts` so it is unit-tested without a DB (Const
   V.3/V.6).
2. **Exact discovery total.** `lib/claude/synthesize.ts` now persists
   `cbProgress.batchTotal` on every checkpoint, so the poll reports an exact
   "X of N" without touching the keyword pool (falls back to a pool-size
   estimate only before the first checkpoint).
3. **Advancing tail.** The bar used to freeze at 100 % of discovery through the
   post-breakdown tail (personas → LLM probe → opportunities → narrative/deck).
   Three real insight milestones now keep it advancing to completion, and
   consolidation occupies a fixed-size reserve segment so the denominator never
   grows mid-run (which would have slid the percentage backward — worse than
   frozen, Const IV.3).

No data, volume, or taxonomy math changed; every count shown is a real
checkpoint value (Const I.1). No styling changed (no theme-parity surface).

## Scope
- `app/api/projects/[id]/synthesis-progress/route.ts` — server-side scalar
  extraction; delegates math to the new module.
- `lib/synthesis/progressMath.ts` — **new** pure, tested transform.
- `lib/claude/synthesize.ts` — persist `batchTotal` on each discovery/canon
  checkpoint (+ interface field).
- `package.json` — 7.350.0 → 7.351.0.

## Verify
- Real project `tsc --noEmit` (Const V.1a): clean, project tsconfig, no `target`
  override.
- Progress-math harness **25/25** — every stage (gathering, categorizing,
  consolidating, insights, finalizing, completed, failed), monotonic `done`,
  `done ≤ total`, stable `total` across the whole lifecycle, ends at 100 %,
  Postgres text-boolean (`'t'`) handling, and the null/no-snapshot fallbacks.
- SSR render of `AnalysisRunningState` **4/4** — each stage the route emits
  renders the correct label and a live percentage (route↔component contract).
- Regression retained: v7.345 `consolidating` semantics and the done/total
  contract preserved; v7.346–v7.350 untouched.

## Note
TD Bank's current data already finished server-side (13:45, 1,429 kw / 80
categories) — reopen the project to see the results; no re-run needed. This
release fixes what the screen shows on the NEXT large refresh.
