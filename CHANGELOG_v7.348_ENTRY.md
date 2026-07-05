# v7.348 — Local Pack badge is node-precise (no subtree roll-up)

**2026-07-04 · fix**

## Symptom
Top-level product lines (e.g. "Credit Cards") showed a 📍 LOCAL PACK badge even though the
category head term ("credit card") does not trigger a Google local pack.

## Root cause
The Keyword-panel badge used `collectOwnKeywords(node)`, which walks the node AND every
descendant — so a single buried local-intent keyword lit the whole umbrella. Verified against
TD Bank's real data (Local Search panel): 58 genuinely local-intent keywords across 15
categories, with **Credit Cards holding exactly 1** — a real keyword, correctly detected, but
rolled up to the parent. Not a false positive, and not introduced by the v7.347 intent-first
refactor (the roll-up dates to v7.286); it surfaced now because this was the first TD run to
complete after the v7.346 timeout fix.

## Fix
Badge a node only when its OWN keywords carry the real Semrush `Fl` local-pack flag
(`collectOwnKeywords(n)` → `n.own` on the badge prop only). The 📍 label now lands on the
specific keyword's node, never rolled up to ancestor product lines. Matches the rule: only
keywords whose Semrush SERP feature is a local pack get the label. `collectOwnKeywords` is
unchanged and still used for row deletion.

## Scope
- `components/brief/KeywordsPanel.tsx` — one line (badge prop).
- `package.json` — 7.347.0 → 7.348.0.

## Verify
- Real project `tsc --noEmit` (Const V.1a): clean.
- Invariant suite 6/6, incl. regression checks that the v7.346 probe time-box and v7.347 intent-first threading are retained (V.6).
