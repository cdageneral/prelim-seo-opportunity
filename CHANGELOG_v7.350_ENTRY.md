# v7.350 — Distinct products get distinct umbrellas (no "&"-merged product families)

**2026-07-05 · taxonomy guidance**

## Symptom
Two separate products were bundled under one umbrella — e.g. "Checking & Savings Accounts"
— when Checking Accounts and Savings Accounts are distinct products with distinct pages and
intent.

## Fix
Added a rule to both the taxonomy-skeleton and hierarchical-discovery prompts: distinct
products are distinct level-1 families — never merge two separate products into one umbrella
("Checking Accounts" and "Savings Accounts" are SEPARATE, not "Checking & Savings Accounts").
A shared umbrella is kept only when the terms are genuinely one offering. Written as a general,
example-guided rule (not client-specific).

## Scope
- `lib/claude/prompts.ts` — level-1 rule in `taxonomySkeletonPrompt` + `hierarchicalDiscoveryPrompt`.
- `package.json` — 7.349.0 → 7.350.0.

## Verify
- Real project `tsc --noEmit` (Const V.1a): clean.
- Regression 5/5 — v7.346 probe time-box, v7.347 intent-first, v7.348 node-precise local badge,
  v7.349 duplicate-collapse all retained.

## Note
Applies on the NEXT analysis (discovery/skeleton guidance). Re-run TD Bank to split
"Checking & Savings Accounts" into "Checking Accounts" and "Savings Accounts".

## Also verified this session (no code change)
- "high yield savings" vs "high yield savings rates" — checked live SERPs: 6 of top-10 URLs
  identical → Google rewards the SAME page → one leaf, "rates" is a modifier (current grouping correct).
- v7.349 collapse confirmed live on TD's re-run: 6 duplicates → 0, Education nodes 19 → 14, 1,429 kw intact.
