# OrbitIQ v7.306 — Upload instructions (re-delivery of the v7.305 fix)

**Why v7.306:** v7.305 failed to build — but **not because of this code**. During that
upload, four unrelated core files (`tsconfig.json`, `db/index.ts`, `db/schema.ts`,
`lib/usage/context.ts`) ended up **empty (0 bytes)** in the repo, which wiped the `@/*`
import alias and broke the build. Those files have since been restored (main is back to
the clean v7.304 baseline), but the usage fix came off with them. This re-applies it.

**What it fixes:** the **API Usage & Credits** panel showing "No usage recorded yet" —
the `api_usage` table self-creates at runtime, so usage starts recording.

## Upload these 4 files (same folder paths)

```
lib/usage/record.ts                       <- the fix (self-healing ensureUsageTable)
app/api/usage/route.ts                    <- rollup self-heals on open
app/api/projects/[id]/usage/route.ts      <- per-project ledger self-heals on open
package.json                              <- version bumped to 7.306.0
```

(`CHANGELOG_v7.306.md` is the changelog entry for the record - not a code file.)

## Steps
1. In GitHub (`cdageneral/prelim-seo-opportunity`, `main`), upload the 4 files above into
   their matching folders.
2. **Before committing, check GitHub's "changed files" preview: it must show ONLY these 4
   files.** If `tsconfig.json`, `db/index.ts`, `db/schema.ts`, or `lib/usage/context.ts`
   appear as changed (especially shrinking to empty), **cancel** - that's the blanking
   bug, not your change.
3. Commit message: **`v7.306`**.
4. Tell me when it's pushed - **I'll verify the Vercel build goes READY** and that nothing
   got blanked, before you rely on it.

## After it's live
- Open the project's **API Usage** panel -> **Refresh** (the table is created on first
  open). Then run any Semrush/SerpAPI action; the ledger fills in (provider, units, time,
  project).
- Usage counting is **forward-only** - calls made before this deploys can't be
  back-filled.
