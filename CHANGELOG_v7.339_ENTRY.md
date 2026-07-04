# v7.339 — 2026-07-03 · Anchored categorization: one concept, one node (Const III.1e, new)

Wayne's finding: the Keyword panel grew duplicate/overlapping categories — "Wills & Trusts", "Wills", and "Estate Planning" as three separate nodes where one hierarchy should exist. Root causes found in code: discovery batches invented the taxonomy independently (no shared vocabulary); the canonicalization pass was explicitly forbidden from re-parenting ("Preserve the parent chain") and was silently skipped above 300 distinct paths; re-analyses rebuilt the tree from scratch; failed batches fell into "Other" silently. Wayne approved the full fix in one release, with merges auto-applied + visibly logged (2026-07-03). Constitution amended: **Art. III.1e** (v0.18).

**1 — Taxonomy skeleton before batching (`taxonomySkeletonPrompt`, new).**
One upfront haiku call over a volume-ranked 200-keyword sample proposes the canonical umbrella → theme skeleton; every 25-kw discovery batch now receives it and must assign INTO it, reusing labels exactly — a node meaning the same as (or a subtype of) an existing node must never be created. On a re-analysis the skeleton is additionally anchored to the project's PREVIOUS stored taxonomy (up to 400 distinct paths loaded in the synthesize route), so adding a competitor CSV no longer renames or re-splits the tree. Skeleton failure → unanchored discovery exactly as before (honest fallback, I.5).
`lib/claude/prompts.ts`, `lib/claude/synthesize.ts`, `app/api/synthesize/route.ts`

**2 — Consolidation rewritten: deterministic pass + chunked LLM re-parenting.**
Phase 2a (new `lib/category/canonicalize.ts`, pure/unit-checked): TypeScript label unification — case, punctuation, "&"/"and", conservative plural fold, word order — merges trivial spelling variants with no model call ("Wills and Trust" = "Wills & Trusts" = "Trusts & Wills"). Phase 2b: `pathCanonicalizationPrompt` rewritten — the "Preserve the parent chain" ban is REMOVED and replaced with a mandatory subsumption rule (a strict subtype re-parents into its parent's chain: "Wills" → Estate Planning › Wills & Trusts); runs in chunks of 250 over the ENTIRE distinct-path set (never skipped), with canonical nodes established by earlier chunks carried into later ones so labels align across chunks. The distinct-nodes guard (Secured ≠ Unsecured) is retained verbatim.
`lib/category/canonicalize.ts` (new), `lib/claude/prompts.ts`, `lib/claude/synthesize.ts`

**3 — Merge log: auto-apply, never silent (Wayne's call).**
Every applied change — deterministic relabel or LLM re-parent — is recorded as `{from, to, kind: 'label'|'reparent'}` in stored `_categoryBreakdown.mergeLog` (capped 800). The Keyword panel header shows an "N merged" chip beside "needs review"; clicking it opens a bounded scrollable log ("relabeled/moved · old → new"). Pre-v7.339 analyses carry no log → no chip (I.5). Existing CSS var tokens reused → dual-theme parity inherited (IV.6).
`lib/claude/synthesize.ts`, `components/brief/KeywordsPanel.tsx`

**4 — Failed discovery batches: retry, then flag — never silent "Other".**
A transient batch failure used to silently file 25 keywords under Other (a real slice of the 421-kw Other node). Failed batches now retry once; keywords still unplaced land in Other with `keywordMeta = {confidence: 0, needsReview: true, reasoning: 'not placed by discovery…'}` so they surface in the existing Needs Review flow (III.7).
`lib/claude/synthesize.ts`

**5 — Pre-product keywords get stored membership (Wayne's pipeline stage 4).**
Problem-lane demand topics carried no stored path → every panel dumped them into "Other". They now file deterministically under `Pre-Product Journey › <Problem Seed>` in `keywordPaths`/`keywordCategories` (additive-only: a base-footprint path always wins, II.8); the pre-lane "Clear all" strips exactly this root (mirroring the funnel-stage strip on the product side). Pre-product theme naming (`journey-problem-clusters`) now receives the canonical category list so a theme never duplicates the product-category namespace.
`lib/category/canonicalize.ts`, `app/api/projects/[id]/demand-universe/route.ts`, `app/api/projects/[id]/journey-problem-clusters/route.ts`, `components/brief/JourneySection.tsx`

**New stored fields (all additive, no schema change):** `_categoryBreakdown.mergeLog`, `.taxonomySkeleton`, `.taxonomyEngine: 'anchored-v1'`.

**Verification (Art. V):** isolated tsc exit 0 over all 8 changed files + full dependency graph (project tsconfig mirrored verbatim, V.1a; `lib/export/topicExport` shimmed — file exists live but is absent from the local zip archive). Mock-model pipeline harness at REAL scale: 700 keywords / 28 batches / 650 distinct paths / 3 canonicalization chunks — 16/16 (single wills node, both merge kinds logged, chunk carry-forward, retry-then-flag, exact TS rollups, all 700 keywords placed once). 29/29 unit + prompt-invariant checks (all 9 retained v7.235–238 prompt rules still pass post-rewrite). 9/9 jsdom UI checks (chip renders/toggles, bounded scroll, absent pre-v7.339). Retained regression suite: zero delta vs untouched base (the 18 pre-existing FAILs are local-archive artifacts — six esbuild bundles need the missing v7.328 `topicExport.ts`; the v7.290-era `local-ui` greps are stale against the v7.298+ LocalSearchSection) + 12 new v7.339 invariants added to `_regression/run.sh` (V.6), 12/12.

**Deploy note:** base = v7.338 reconstructed from the local zip archive (v7.326 + overlays; GitHub API not reachable from this sandbox). Per the parallel-release rule, diff the 8 changed files against live main in the GitHub upload session before committing, and confirm v7.339 is still the next free version.

**Known follow-ups:** the dead v7.229-era passes (`categoryBreakdownPrompt`, `categoryConsolidationPrompt`, `categoryTaxonomyPrompt`, `categoryMembershipCheckPrompt`) are still exported from `prompts.ts` unused — cleanup candidate; `MAX_KW=140` cap in journey-problem-clusters unchanged; skeleton sample size (200) and canonicalization chunk (250) tunable only on Wayne's instruction (I.6).
