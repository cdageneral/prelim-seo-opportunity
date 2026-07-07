# v7.356 — Content Map priority reads the funnel (2026-07-07)

## What Wayne asked
1. Stop giving every product-journey topic the same distance-to-conversion (they were all hard-coded to distance 2 / "Evaluating"). Use the funnel stages instead — anything lower-funnel (high intent to convert) should be higher priority.
2. Brand and brand-modifier terms should be **higher** priority, not lower, because they are easier to win (lower effort), gated on real search demand.
3. (Accepted add-on) Within a priority tier, surface the strongest opportunities first.

## The signal we used (already stored, nothing new pulled)
Every canonical topic already carries a fixed funnel-stage tag from its intent group (Const III.11):
- Learn / Definition / Education / How-It-Works / Benefits / FAQs → **Awareness**
- Comparison / Selection / Reviews / Alternatives / Use-Cases → **Consideration**
- Qualification / Application / Purchase / Requirements / Rates / Calculator → **Decision**
- Management / Optimization / Support / Redemption / Merchant-Acceptance → **Retention**

We read that stored stage — we do not re-derive intent (II.8) and we do not model anything (I.1).

## New distance mapping (reuses the existing DISTANCE_LABEL + 4-dot meter)
| Funnel stage (product) | Distance | Label |
|---|---|---|
| Decision (transactional) | 1 | At decision |
| Consideration (commercial) | 2 | Evaluating |
| Retention (navigational/support) | 2 | Evaluating |
| Awareness (informational) | 3 | Researching |
| Brand-related (any stage) | 1 | At decision |
| Pre-product awareness | 4 | Just aware |
| Pre-product (deeper) | 3 | Researching |

## New priority rule
| Bucket | Priority |
|---|---|
| Brand-related, real demand | P0 |
| Brand-related, zero demand | P1 |
| Decision, real demand | P0 |
| Decision, zero demand | P1 |
| Consideration / Retention, high demand | P0 |
| Consideration / Retention, below median | P1 |
| Awareness (product), high demand | P1 |
| Awareness (product), below median | P2 |
| Pre-product researching, high demand | P1 |
| Pre-product (else) | P2 |

- **high demand** = topic total volume ≥ the median topic volume (and > 0) — relative to this project's own spread, exact rollup.
- **real demand** = topic total volume > 0.
- **quick-win** unchanged in spirit: a competitor-gap topic close to conversion (distance ≤ 2) with high demand. It now spans exactly the lower-funnel + brand tiers.
- **Brand-related** = the topic's parent category is a brand category, OR the topic's own text (product label + top keywords) carries the **client's** brand token (≥4 chars; short 2–3 char brands are covered by the brand category, avoiding false matches like "td" inside "study"). Competitor brands are never bumped.

## Row sort
The Content Map (`mode="content"`) previously sorted by volume only, so distance/priority were invisible to the ordering. It now sorts within each priority tier by funnel proximity (distance asc) then real volume (desc) — the identical tiebreaker the Content Plan already used. The shared `order` map was moved above `contentRows` to avoid a temporal-dead-zone reference.

## One source of truth (Const II.7)
- `scoreTopic()` — the single distance+priority+quick-win definition, used by BOTH `buildContentPlanFromTopics` (canonical path) and `buildContentPlan` (graph fallback), so the two can never diverge.
- `brandTermsOf(clientDomain, snapshot)` — the single client-brand-vocabulary derivation (domain root + snapshot `_brandTerms`), used by ALL four panels that build the plan (Content Map, Content Plan, Scope, Executive Summary), so a topic's priority reconciles everywhere.
- Dead `distanceOf()` helper removed (II.8).

## Files
- `lib/journey/contentPlan.ts` — new `scoreTopic`, `topicIsBrandRelated`, `brandTermsOf`, `TopicScore`; `PlanOpts.brandTerms`; `buildContentPlanFromTopics` + `buildContentPlan` + `planFromSnapshot` rewired to the shared scorer; `distanceOf` removed.
- `components/brief/ContentMapSection.tsx` — pass `brandTerms` into the plan build; import `brandTermsOf`.
- `components/brief/ContentPlanSection.tsx` — Content-Map row sort now priority→distance→volume; `order` hoisted; pass `brandTerms`; import `brandTermsOf`.
- `components/brief/ScopeSection.tsx` — pass `brandTerms`; import `brandTermsOf`.
- `components/brief/ExecutiveSummarySection.tsx` — pass `brandTerms`; import `brandTermsOf`.
- `package.json` / `package-lock.json` — 7.356.0.

## Verification
- Isolated **tsc** on the pure lib (mirrored project tsconfig: strict, module esnext, moduleResolution bundler, isolatedModules) — **CLEAN**.
- **32/32** Node checks on the real compiled logic: full priority matrix (decision/consideration/retention/awareness × demand), brand override at every stage, brand-token guard (short-token false-match rejected), quick-win truth table, `brandTermsOf` derivation, and an end-to-end `buildContentPlanFromTopics` fixture asserting varied distances (not all 2) and exact scope rollups (p0/p1/p2 counts + volume sums).
- All **4 changed components** syntax-clean (esbuild transform).
- Render support unchanged: `DistMeter` + `distFill` already cover distances 1–4 with theme-aware tokens (both light + dark, IV.6); no JSX changed.

## Behavior shifts (by design)
- Product Decision topics with modest volume now surface as **P0** (were P1) — lower funnel, highest intent.
- Product Awareness topics below median now drop to **P2** (were P1) — top-of-funnel, demoted unless high demand.
- Brand topics with demand are **P0** — low-effort wins (Wayne's call).
- The distance-to-conversion bar now genuinely varies across product rows instead of all reading "Evaluating".
