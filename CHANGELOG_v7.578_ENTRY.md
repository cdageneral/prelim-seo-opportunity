# v7.578 — Split review: Add / Leave / Exclude on every group (2026-10-20)

Wayne: *"can we add some other indicator as i dont want to merge it into anything and need an option for not to included"*.

- Every proposed group now has a three-way switch: **Add** (create it, or move it to the category shown), **Leave** (no page; its keywords stay in the category being split, exactly as now) and **Exclude** (its keywords leave scope and move to Other). Default is Add. A group set to Leave or Exclude is dimmed.
- The summary line and the Apply button count only what will actually happen: "N new pages · M keywords move · K stay on General … · X excluded".
- Nothing is merged unless you ask. The "More…" menu still has Make-it-its-own-page and Merge-into for anyone who wants them. Apply sends the decided proposal and the server re-validates it.
- Verified: `tsc`, `next build`, suite 3,650 PASS. The only new FAIL is the known v7552-render ETA timing flake (unrelated). +2 render checks (Leave, Exclude).
