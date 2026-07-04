# v7.344 — 2026-07-04 · Already-loaded CSVs unlock the Run button

Wayne re-uploaded td-4400-more.csv on the pre-run data-source screen and hit a red error — "All keywords were already uploaded for this domain" — with the Run button locked. His data was fully loaded (the de-dupe correctly skipped identical rows after the interrupted run left them in place); the handler just treated inserted === 0 as failure and never marked the domain satisfied, dead-ending a project whose data was 100% present.

**Fix:** inserted === 0 now counts as success — the domain is marked uploaded (Run unlocks) and the note reads "already loaded … you can run the analysis", styled amber-informational instead of error-red. The de-dupe itself is untouched (it protects counts, Const I.3).
`app/projects/[id]/page.tsx`

**Verification (Art. V):** isolated tsc clean on the changed file (known pre-existing ContentMapSection pair excluded — live builds READY); retained suite zero delta + 2 new `v344` invariants (V.6).
