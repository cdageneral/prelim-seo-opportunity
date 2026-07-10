# v7.363 — API Usage cost: real tokens × published rates → USD (2026-07-10)

## Why
Wayne asked to translate a project's API usage into a dollar figure (starting with TD Bank). The `api_usage` ledger already records **real** per-call token counts — but it stores each Anthropic/OpenAI row as input+output **summed** and the read routes collapse every model into one line. Since Anthropic list rates span 25× (Haiku input $1/M → Opus output $25/M), a summed-token total can't be priced defensibly without the per-model input/output split. That split is already in each row's `meta` (`inputTokens` / `outputTokens`); it just wasn't exposed.

## What shipped
- **`lib/usage/pricing.ts` (NEW)** — one shared, sourced rate card (verified 2026-07-10): Claude Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.6 $5/$25, GPT-4o mini $0.15/$0.60 per 1M in/out. `priceLine()` prices token rows from the published list rate for their model; anything plan-dependent (Semrush units, SerpAPI searches, Profound calls) or count-only (gpt-image-1 images) comes back **unpriced with a reason** — an honest gap, never guessed.
- **`app/api/usage/cost/route.ts` (NEW, read-only GET)** — aggregates `sum(meta->>'inputTokens')` / `sum(meta->>'outputTokens')` per project + provider + model over `kind='usage'` rows, applies the rate card, and returns per-project + grand-total USD, the rate card with its sources, and a plain-language basis note.
- **`components/dashboard/UsageRollup.tsx`** — adds an **Est. cost (USD · list price)** column per project + a grand total, with an on-panel provenance line citing the rates, their as-of date, source links, and the caveat that it's a computed estimate at list price (not the invoice; caching/batch/negotiated discounts not reflected; Semrush/SerpAPI/images left unpriced). Cost is additive: if `/api/usage/cost` fails, the usage view still renders (column shows "—").

## Constitution
Art. **I.5a** — USD is a *derived* metric: the token counts are real source rows; the multiplier is a **named, sourced** published list rate; the figure is **labeled a computed estimate at list price**, never presented as measured billing (provider dashboards remain the source of truth, I.1/I.5). Rate table lives in one shared constant (no per-panel forks). Plan-dependent/count-only units are shown as honest gaps (I.5). No existing behavior changed; the two new routes are read-only.

## Verification (clone of the LIVE v7.362 repo, real deps)
- **Full-project `npx tsc --noEmit`** — CLEAN (project tsconfig, no `target` override; V.1a).
- **Money-math + aggregation harness (13/13)** — Haiku/Sonnet/Opus/GPT-4o-mini rates exact, asymmetric in/out, per-project rollup + grand total, and unpriced gaps (Semrush/SerpAPI/images/unknown-model) all correct.
- **Dual-theme jsdom render (10/10)** — panel renders in light AND dark; the Est. cost column, per-project USD, grand total, and rate-source link all present in both themes (V.5).
- **SSR smoke** — component renders without throwing.
- **Theme-parity scan** — new UI uses only `orbit-*` tokens; no raw colors (IV.6).
- Change is purely additive (2 new files + 1 additive column); existing `/api/usage` and per-project routes untouched (V.6 regression risk minimal; full-project tsc covers the tree).

## Files
`lib/usage/pricing.ts` NEW · `app/api/usage/cost/route.ts` NEW · `components/dashboard/UsageRollup.tsx` · `package.json` / `package-lock.json` (7.363.0)
