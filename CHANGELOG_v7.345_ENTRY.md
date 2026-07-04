# v7.345 — 2026-07-04 · Large-run consolidation resumes instead of looping forever

Wayne's 8,177-keyword td.com run kept dying on "Analysis failed / click Refresh Analysis," and Refresh never got it past the finish line. The live server logs told the real story: every window replayed the same three beats — `Discovery resume: 324 done, 4 remaining`, then a full taxonomy rebuild, then `Vercel Runtime Timeout Error: Task timed out after 300 seconds` — with several `Canonicalization chunk failed` JSON-truncation errors in between. The run was making progress and then throwing all of it away.

Three compounding causes, all fixed here:

1. **Consolidation restarted from zero every resume.** The chunked LLM canonicalization pass (the "one concept, one node" cleanup, Const III.1e) ran entirely inside one 300s Lambda with no checkpoint. On a large footprint its ~12–20 sequential chunks can't finish inside a single window, and nothing was saved, so the next Refresh started the whole phase over and timed out again — an infinite loop. **Fix:** each canon chunk is now checkpointed as it lands (`cbProgress.canon`), and a resume skips finished chunks. Each window advances a few chunks; the run crosses the line over a couple of Refreshes with no re-spent API credits.

2. **The last discovery wave was never checkpointed.** The wave loop's guard (`i + CONCURRENCY < pendingBatches.length`) skipped saving its final wave, so the last few batches replayed on every resume (the persistent "324 done, 4 remaining"). **Fix:** discovery persists its complete state once the batches finish.

3. **Canonicalization replies truncated.** 250-path chunks overran the 8,000-token reply budget and the JSON was cut mid-array (`Expected ',' or ']' … position ~25000`), so whole chunks fell back to deterministic-only. **Fix:** 150-path chunks at 12,000 tokens, plus a salvage parser (mirrors discovery) that recovers every complete object from any clipped tail. A chunk that still fails keeps its deterministic paths **and** is marked done, so it can never loop.

The analyzing screen and the page's auto-resume were also reading progress only from discovery batches — frozen at 100% during consolidation — which is why the page's two-stall guard declared a still-working run "failed." The progress route now folds canon chunks into the live `done`/`total` and reports a `consolidating` stage, so the bar keeps climbing and the run keeps resuming itself.

`lib/claude/synthesize.ts` · `app/api/projects/[id]/synthesis-progress/route.ts` · `components/brief/AnalysisRunningState.tsx`

**Verification (Art. V):** real project `tsc --noEmit` clean against the full live tree at commit `a2e6143` with the three files overlaid (V.1a — no `target` override; the project's own tsconfig). Retained regression suite: **zero delta** vs the pristine live commit (the only failures are a pre-existing Local-panel esbuild-alias artifact that fails identically on base). 11 new `v345` invariants added to the suite (V.6) — all pass: canon resume-skip, per-chunk checkpoint, perma-fail-marked-done, final-wave checkpoint, salvage recovery from truncated JSON, progress-route done/total fold, and the `consolidating` render. AnalysisRunningState rendered in both themes — theme tokens only, no hex (V.5).
