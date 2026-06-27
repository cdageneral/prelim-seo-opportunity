## v7.306 — 2026-06-26 · API Usage panel now actually records — `api_usage` table self-creates (no more silent drops)

**What Wayne saw.** The **API Usage & Credits** panel showed *"No usage recorded yet"*
even after real SerpAPI and Semrush calls. The recorder was firing correctly on every
call — the failure was one layer down.

**The cause (verified against live v7.304 + prod runtime logs).** The `api_usage` ledger
table is defined in `db/schema.ts`, but a brand-new *table* is only created by
`drizzle-kit push` — which was never run against the production Neon database (the build
is just `next build`, and the schema's "run `npm run db:push` once" note was never
executed). So every `db.insert(apiUsage)` threw `relation "api_usage" does not exist`.
That error is deliberately swallowed (Const I.5 — accounting must never break a real API
call), so the ledger stayed permanently empty. Prod logs confirmed this firing on every
request.

**What shipped (self-healing, no manual DB work — Wayne's choice).**
- **`lib/usage/record.ts` — `ensureUsageTable()`.** A memoized `CREATE TABLE IF NOT
  EXISTS api_usage (...)` (+ project_id / created_at indexes), columns mirroring
  `db/schema.ts` exactly. Mirrors the project's established "ADD COLUMN IF NOT EXISTS"
  runtime auto-migration pattern, but for a whole table. Runs at most once per warm
  process; a transient failure resets the memo so the next call retries. `recordUsage`
  calls it before the first insert.
- **`app/api/usage/route.ts` and `app/api/projects/[id]/usage/route.ts`.** Both read
  routes (and the baseline POST) call `ensureUsageTable()` first, so the ledger
  self-creates on the **first panel open / Refresh** too — not only on the first
  billable call.

**No schema/data change.** Each row already captures exactly what was asked: `provider`
(what API) · `endpoint` · `unit` + `quantity` (+ `rows`×`rate` provenance) · `created_at`
(when) · `project_id` (what project). All quantities remain **real measured values**
(Const I.1) — nothing modeled.

**Forward-only.** Calls made before this release were never recorded and can't be
back-filled; recording starts from deploy.

**Verification (Art. V).** Diagnosis confirmed against the **live v7.304 source**
(GitHub raw) and **production runtime logs** (`relation "api_usage" does not exist`).
The only new type surface is `db.execute(sql\`…\`)` + `import { sql } from 'drizzle-orm'`
— both already used verbatim in the existing usage routes, so valid in this exact
drizzle 0.33 / neon-http codebase; no Map/Set spread or downlevel-iteration introduced
(Const V.1a). A Node behavior harness passed 7/7: DDL memoized once across concurrent
calls, retry-after-failure, `recordUsage` never throws on DDL/insert failure, fields +
timestamp captured, negative quantity clamped. ⚠️ The canonical `tsc`/`next build` could
not be run in this session (no npm-registry access in the sandbox to install drizzle) —
Vercel's build on deploy is the backstop; the change is additive and trivially
reversible. Patch built on live v7.304.
