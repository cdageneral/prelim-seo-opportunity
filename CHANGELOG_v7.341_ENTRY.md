# v7.341 — 2026-07-03 · Depth mandate + sibling audit (Const III.1e follow-through)

Wayne's first v7.339-era rebuild (TD Bank) exposed two defects in the anchored engine, both confirmed in the stored data before fixing:
(1) **theme-level parking** — 276 of 562 Mortgages & Refinancing keywords (49%) sat flat at the theme node while sub-topics existed ("mortgage calculator", 40.2M, parked at the theme; the "Mortgage Calculators" sub-node held 5). The anchor block told batches to reuse the top two levels exactly and the model stopped there instead of continuing deeper.
(2) **same-concept siblings one level down** — "Loan Interest Rates" (119 kws) beside "Mortgage Rates" (32) under one parent: the chunked canonicalization saw them in different slices, so the duplicate survived.

**Depth mandate under the anchor.** The anchored discovery block now states: THE ANCHOR FIXES ONLY THE TOP TWO LEVELS — every keyword must still be placed in its most-specific sub-topic beneath the theme, with worked examples ("mortgage calculator" → …› Mortgage Calculators); a path stopping at the theme is correct only for the theme's own generic head term, and theme-parking is named a failure.
`lib/claude/prompts.ts`

**Pass 2.7 — sibling audit.** New bounded pass after canonicalization: every parent with ≥ 2 children is reviewed WITH its full child list (names only — the exact context chunking loses; chunked past 200 groups), the model returns same-concept sibling merges (conservative: "when in doubt, do not merge"; both labels must be real children of that parent), and TypeScript applies + logs them (kind `reparent`, descendants follow the merge — `applySiblingMerges`/`buildSiblingGroups` in canonicalize.ts, pure + unit-checked). Established-node carry between canonicalization chunks raised 150 → 250 lines.
`lib/claude/prompts.ts` (siblingAuditPrompt), `lib/claude/synthesize.ts`, `lib/category/canonicalize.ts`

**Verification (Art. V):** isolated tsc exit 0 (project tsconfig mirrored, V.1a). Pipeline harness extended to a real duplicate-sibling scenario (rate concept parity-split across all 28 batches): 18/18 — audit ran, siblings collapsed to one node, merge logged. 38/38 unit + prompt checks. Retained suite: zero delta on all prior checks + 6 new `depth-sibling` invariants (V.6).

**Runtime note:** adds 1 haiku call per ~200 sibling groups (TD-scale ≈ 2–3 calls) — bounded, names only.
