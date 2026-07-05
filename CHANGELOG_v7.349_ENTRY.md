# v7.349 — One concept, one node: collapse duplicate intent-group labels within an umbrella

**2026-07-04 · fix (Const III.1e / III.11)**

## Symptom
The Keyword panel showed two categories labelled the same thing (e.g. "Education" twice).

## Root cause
The v7.347 intent-first reshape can create a generic intent group (Education, "Getting an
Account", "Business Loans") as BOTH a direct child of its product AND nested one level deeper
under a sub-product — e.g. "Credit Cards > Education" AND "Credit Cards > Using a Credit Card >
Education". Two nodes for one concept (an III.1e violation). The LLM consolidation missed it
because the two paths are lexically distinct. Verified against TD Bank's live data: 6 such
duplicates across 1,429 keywords (4× Education + "Getting an Account" + "Business Loans").

## Fix
Added a DETERMINISTIC post-consolidation pass in synthesize: within each umbrella, any label
that appears at two different depths is hoisted to its shallowest (product-level) instance,
merging the deeper copy into the shallow one. Genuinely-distinct deeper nodes (e.g. "Education
> APR", "Education > Credit Card Basics") are untouched. Labels/structure only — no keyword is
dropped and no volume changes (Const I.1).

## Scope
- `lib/claude/synthesize.ts` — deterministic collapse pass (runs after canonicalization + the
  domain-brand rule, before keywordPaths/categories are built).
- `package.json` — 7.348.0 → 7.349.0.

## Verify
- Real project `tsc --noEmit` (Const V.1a): clean.
- Logic verified against TD Bank's real 1,429 paths: 6 duplicates → 0, keyword count unchanged (1,429).
- Fixture unit test 9/9 (hoist deep dup, preserve distinct children, no keyword loss); regression checks that v7.346 probe time-box, v7.347 intent-first threading, and v7.348 node-precise local badge are all retained (V.6).

## Note
Applies on the NEXT analysis (write-time fix; stored membership is never re-derived at a read
site, Const II.8). Re-run TD Bank to collapse its existing duplicates.
