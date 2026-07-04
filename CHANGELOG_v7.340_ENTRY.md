# v7.340 — 2026-07-03 · Anchor guard: never anchor to a pre-v7.339 taxonomy (Const III.1e)

**One-condition patch, Wayne-approved.** The v7.339 prior-taxonomy anchor loads the previous completed analysis's tree so re-analyses keep stable category names. But for a project whose last build predates v7.339, that "prior tree" is exactly the duplicate/split mess III.1e exists to eliminate ("Wills" / "Wills & Trusts" / "Estate Planning" as three nodes, a 4,626-kw "Other") — anchoring to it would drag the mess into the first anchored rebuild. The synthesize route now anchors ONLY when the prior breakdown carries `taxonomyEngine === 'anchored-v1'` (i.e., was itself built by the anchored engine). Effect: every project's FIRST v7.339-era rebuild is a clean, unanchored build; name stability kicks in from the second run onward. No other behavior changes.
`app/api/synthesize/route.ts`

**Verification (Art. V):** isolated tsc exit 0 (project tsconfig mirrored, V.1a); retained regression suite re-run — all v7.339 checks pass, zero delta on prior checks, + 2 new `anchorguard` invariants added (V.6).
