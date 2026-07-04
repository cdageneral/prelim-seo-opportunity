# v7.343 — 2026-07-04 · Honest progress, walk-away resume, faster batches, clear-uploads control (Const IV.2)

Wayne watched an 8,177-keyword rebuild sit at "98% — Saving results" for 10+ minutes and asked if it was broken. It wasn't — but the screen was lying (time-based fake percentage capped at 98%), and the page silently gave up after 3 auto-retries while the run was still advancing. All four fixes Wayne-approved.

**Real progress (Const IV.2).** New tiny `GET /api/projects/[id]/synthesis-progress` returns REAL numbers from the server checkpoint: categorization batches done vs total + the actual stage. The analyzing screen now shows "Categorizing keywords — batch 210 of 328", a percentage derived from real batch counts (never time), an ETA computed from the observed batch rate, and — before the first checkpoint lands — an honest "Working…" with elapsed time only (I.5). The fake `TOTAL_DURATION` curve is deleted. Copy now sets real expectations: 1–2 min small uploads, 15–25 min for 5k+ keywords.
`app/api/projects/[id]/synthesis-progress/route.ts` (new), `components/brief/AnalysisRunningState.tsx`

**Walk-away auto-resume.** The Phase-2 retry loop no longer stops at a fixed 3 attempts: it keeps resuming across the platform's 300s windows AS LONG AS the checkpoint advanced since the last attempt (real forward progress, zero re-spend), stopping only after two consecutive stalls or a 15-window safety cap. Large uploads now complete unattended.
`app/projects/[id]/page.tsx`

**Faster batches.** Discovery concurrency is adaptive: 12 parallel workers when the pool exceeds 120 batches (8k kws ≈ 328 batches — roughly halves wall time), 6 otherwise. Same total API calls — no extra spend; per-batch retry (v7.339) absorbs any throttling.
`lib/claude/synthesize.ts`

**"Cancel & clear uploaded files" on the analyzing screen (Wayne's ask).** Two-step destructive confirm ("stops the run and deletes ALL uploaded keyword files… cannot be undone" / "Keep running"), wired to the EXISTING full-reset route — one deletion code path, no new deleter. Project settings, brand terms, and the v7.342 taxonomy anchor are preserved, so the next upload still converges on the same tree.
`components/brief/AnalysisRunningState.tsx`, `app/projects/[id]/page.tsx`

**Verification (Art. V):** isolated tsc — all changed files clean (one pre-existing type mismatch in the untouched ContentMapSection/page pair confirmed byte-identical to live main, which builds READY; authoritative check = the real Vercel build per V.1a). jsdom harness 13/13 (no fake %, real batch line at 210/328 → 56%, stage transitions, two-step cancel fires exactly once, escape hatch, absent without handler). Retained suite: zero delta + 8 new `v343` invariants (V.6).
