# v7.576 — Split: read the model's reply reliably (2026-10-20)

A third propose-only test on live Citi Travel failed with "No usable sub-categories came back". The new diagnostic showed why: the model wrapped its JSON in a ```json fence and added a note after it. The greedy brace match then ran past the end of the object, the parse failed, and all 137 keywords fell back to General. The reply is now read as the first balanced JSON object (fences, leading prose and trailing notes are tolerated). An empty proposal still writes nothing and now reports why.
- Verified: `tsc`, `next build`, suite 3,646 PASS with the same FAIL set as v7.574, +1 check reproducing the live reply shape.
