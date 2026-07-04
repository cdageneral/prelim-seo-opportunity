# v7.347 — Intent-First Semantic Taxonomy (Constitution v0.20)

**2026-07-04 · engine refactor**

OrbitIQ moves from a product-classification engine to a page-architecture engine: intent —
not shared words — decides where a keyword sits. Implements Constitution v0.20 (III.9 dual
classification, III.10 page-architecture rule, III.11 three-tier hierarchy, revised III.1c).

## What changed
- **Three-tier stored hierarchy** — the taxonomy path is now `[Product Family → Intent Group → Leaf]`.
  Level 2 is a real stored **Intent Group** (the user task / page cluster: "Getting a Credit Card",
  "Choosing", "Credit Card Types", "Education", "Using"), not a product sub-noun. Because the tree,
  rollups, project anchor, and KeywordsPanel are all path-driven, they inherit the new shape with no
  structural rewrite — the anchor now stores product→intent-group paths for free, and the panel nests
  intent groups automatically.
- **Discovery + skeleton prompts rewritten intent-first** (`lib/claude/prompts.ts`): level-2 = intent
  group; revised modifier rule (a qualifier that changes the user's task — apply, requirements,
  compare, reviews, rates, calculator — becomes a NODE, not a stripped modifier; only purely
  linguistic adjectives are stripped); every keyword returns an `intentFamily`.
- **Deterministic funnel mapping** (`lib/category/funnelMap.ts`, new): each keyword's `intentFamily`
  (fixed 25-item vocabulary) maps to a funnel stage in TypeScript — never an LLM per-keyword guess —
  so the Product-journey funnel (Awareness→Consideration→Decision→Retention) keeps reading a stage.
- **intentFamily / funnelStage threaded and stored** on `keywordMeta` (`synthesize.ts`,
  `categoryModel.ts`), read at panels, never re-derived lexically (Const II.8).

## Verify
- Real project `tsc --noEmit` (strict, project tsconfig, no target override — Const V.1a): clean.
- funnelMap runtime unit tests 12/12; intent-first source invariants 15/15, incl. V.6 regression that the v7.346 probe time-box is retained.
- Rebased on the live post-hotfix head (82c22b7); v7.346 probe fix carried forward intact.

## Notes
- Intent groups are derived per project on first analysis and **anchored** on `projects.taxonomy_anchor`
  (reuses the existing anchor) so re-uploads keep the same group names.
- Existing projects re-derive their tree once on the next upload; pre-refactor analyses render the old
  two-tier shape until re-run (honest gap, Const I.5).
