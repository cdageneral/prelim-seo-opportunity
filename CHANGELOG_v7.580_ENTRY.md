# v7.580 — Continue scan can't start before the keyword list loads (2026-10-20)

Found while checking v7.579 live on Sonobello: for a second or two after the Local panel opens, its keyword list is empty. Clicking **Continue scan** in that moment would have sent no keywords, and the server would have run the old service × city grid scan instead, spending credits on the wrong scan.
- The Continue scan button stays disabled until the keyword list has loaded.
- The server refuses a continue request with no keywords (plain message, nothing spent), so it can never fall through to the grid scan.
- Verified: `tsc`, `next build`, retained suite A/B: same FAIL set as v7.579 (49 pre-existing, unrelated), +3 checks PASS.
