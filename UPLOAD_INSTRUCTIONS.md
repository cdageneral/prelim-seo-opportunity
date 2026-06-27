# OrbitIQ v7.305 — Upload instructions

**What this fixes:** The **API Usage & Credits** panel showed "No usage recorded yet"
even though Semrush / SerpAPI calls were being made. Cause: the `api_usage` database
table was never created in the production database, so every usage write failed
silently. This release makes the table **self-create** at runtime — no manual database
work needed.

## This is a PATCH (only 4 files change)

Built on top of the live deployment **v7.304**. Uploading these files to GitHub
**adds/replaces only these 4 files** — it does NOT touch or revert anything else.

Upload these to the repo, keeping the same folder paths:

```
lib/usage/record.ts                       ← the fix (self-healing ensureUsageTable)
app/api/usage/route.ts                    ← cross-project rollup self-heals on open
app/api/projects/[id]/usage/route.ts      ← per-project ledger self-heals on open
package.json                              ← version bumped to 7.305.0
```

(`CHANGELOG_v7.305.md` in this folder is the changelog entry to prepend to the repo's
`CHANGELOG.md` — optional, for the record. Do not upload it as a code file.)

## Steps
1. In GitHub (`cdageneral/prelim-seo-opportunity`, branch `main`), upload the 4 files
   above into their matching folders (drag the `lib/`, `app/`, and `package.json` from
   this folder onto the repo root — GitHub preserves the paths).
2. Commit message: **`v7.305`**.
3. Vercel auto-builds. After it shows **READY**, open the project's **API Usage** panel
   and click **Refresh** — the table is created on first open. Then run any
   Semrush/SerpAPI action and the ledger starts filling in (provider, units, time,
   project).

## Heads-up
- Usage counting is **forward-only**: the Semrush/SerpAPI calls you already made before
  this release can't be back-filled — they were never recorded. New calls record from
  here on.
- The live version when this was built was **v7.304**. If a higher version has shipped
  by the time you upload, tell me and I'll rebase/renumber to avoid a collision.
