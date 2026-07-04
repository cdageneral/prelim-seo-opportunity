# v7.342 — 2026-07-04 · Project-level anchor + the same-meaning leaf rule (Const III.1c-i / III.1e, v0.19)

Wayne's second TD Bank rebuild surfaced the two remaining failures, both root-caused in stored data + code before fixing.

**"Same CSVs, different numbers every time" — the anchor never survived his workflow.** The upload flow runs the FULL RESET (`keywords/reset`), which deletes every analyses row — so the v7.339 prior-ANALYSIS anchor was destroyed before each rebuild and every upload re-derived the tree from scratch ("Borrowing & Loans > Mortgages & Refinancing" one run, "Lending > Mortgages" the next). The anchor now lives on the PROJECT row (`projects.taxonomy_anchor` jsonb + timestamp), which the reset deliberately preserves (like brand terms): written after every successful anchored breakdown (up to 400 distinct canonical paths, Other excluded), read as the skeleton anchor on the next run, fallback to the newest anchored-v1 analysis for pre-column projects. Ensured via ADD COLUMN IF NOT EXISTS in the projects LIST route, the [id] route, AND the synthesize route (v7.268/v7.327 column lesson). Honest scope: the anchor makes names/structure converge run-over-run; LLM placement variance shrinks to within-node detail — never claimed byte-identical.
`db/schema.ts`, `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`, `app/api/synthesize/route.ts`

**Mixed intents in one node — Wayne's APR rule, now discovery rule 2b (BASE rules, so unanchored runs get it too).** "The leaf is a same-meaning group": "apr / what is an apr / meaning of apr / how do aprs work" = ONE definitional leaf; "apr rates / best apr rates" = a DIFFERENT-need sibling leaf ("best" stays a modifier inside it); definitional vs commercial/rate needs are different pages even sharing the head term. Plus the never-park clause added to base rule 3 (the v7.341 depth mandate only lived in the anchor block, so his unanchored rebuild still parked 292 mixed keywords flat at "Mortgages"). Constitution v0.19: new III.1c-i + III.1e extension.
`lib/claude/prompts.ts`

**Deterministic bare-domain → brand override.** "realtor.com" (12M) sat inside Mortgages at 25% confidence. A keyword that IS a bare domain is a navigational brand search by definition — a TypeScript rule now types it `<Stem> Brand Searches` (confidence 100, reasoning names the rule) before any stored write.
`lib/claude/synthesize.ts`

**Verification (Art. V):** isolated tsc exit 0 across both changed-file sets (project tsconfig mirrored, V.1a); pipeline harness 21/21 (incl. bare-domain override end-to-end); 41 unit + prompt checks; retained suite zero delta + 8 new `v342` invariants (V.6).
