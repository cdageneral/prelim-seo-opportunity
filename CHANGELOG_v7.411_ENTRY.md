# v7.411 — a project with large analyses stops being unopenable

**2026-08-05.** Wayne: *"i am trying to click into my NYP project and its not allowing me."*

## What was happening

Clicking the NYP tile put a focus ring on the card and did nothing else. Loading
`/projects/<id>` directly landed back on the dashboard just as fast. Nothing was
printed to the console, and every other client opened normally.

The production runtime log named it exactly (deployment
`dpl_F2jXkyxbMYgrao3hUPoTJs8Rmave`, `GET /api/projects/b2a594a8-…` → 500):

```
NeonDbError: Server error (HTTP status 507):
{"message":"response is too large (max is 67108864 bytes)"}
    at async j (/var/task/.next/server/app/api/projects/[id]/route.js)
```

`GET /api/projects/[id]` loaded the project `with: { analyses: { limit: 5, with:
{ opportunities, personas } } }` — **one** Neon query carrying up to fifteen
JSONB snapshot columns (`semrush_snapshot` + `serpapi_snapshot` +
`profound_snapshot`, five rows deep). Neon's HTTP driver refuses any single
response over 64 MiB, so once a project's analyses had grown past that line the
query died outright.

The reason it read as *"the tile won't open"* rather than as an error is the
client:

```ts
const res = await fetch(`/api/projects/${projectId}`);
if (!res.ok) { router.push('/dashboard'); return; }
```

Any non-ok response is a silent redirect. A 500 and a deleted project are
indistinguishable on screen.

## What changed

`app/api/projects/[id]/route.ts` only. The page reads exactly **two** of those
five rows — `analyses[0]` (the newest, for the resume/checkpoint path) and
`pickDisplayAnalysis(analyses)` (the newest *completed* one, for everything
rendered). The other three shipped megabytes nobody read.

1. **Heads are scalar-only.** The five most recent analyses come back from a
   `SELECT` that names only scalar columns plus `(<col> IS NOT NULL)` booleans.
   The snapshot JSONB never leaves Postgres for them.
2. **Each read row is hydrated in its own query,** so it gets its own 64 MiB
   budget instead of sharing one. When the newest row *is* the displayed row —
   the normal case — exactly one hydration runs.
3. **A row that still exceeds the limit degrades honestly** (Const I.5): it
   returns without its snapshot alongside `snapshotUnavailable`, carrying the
   real byte sizes measured by Postgres (`octet_length(<col>::text)` — measured,
   never estimated, Const I.1). The project opens instead of bouncing.
4. **`?sizes=1`** returns those measured sizes for the five most recent analyses
   and nothing else — a read-only probe that never loads a snapshot to measure
   one, so the next occurrence is diagnosed with numbers rather than guesses.

Response shape is otherwise unchanged: same five rows, same newest-first order,
competitors and the v7.373 audit event untouched.

## Measured on NYP after deploy

`?sizes=1` against the live production deployment, analysis
`dd902630-fe24-4bb9-b71c-d197c7b3136b`:

| column | bytes | MB |
|---|---:|---:|
| `semrush_snapshot` | 5,436,703 | 5.18 |
| `serpapi_snapshot` | 57,636,974 | 54.97 |
| `profound_snapshot` | 566,154 | 0.54 |
| **total** | **63,639,831** | **60.69** |

Against a 67,108,864-byte (64 MiB) limit. **The project has exactly one
analysis**, so this release's five-into-one split does not by itself bring NYP
under the cap — a single row is already too large once Neon's own JSON envelope
escapes it. NYP therefore opens and serves every panel that fetches its own
endpoint, and the snapshot-derived readings come back empty with
`snapshotUnavailable` stating why. `serpapi_snapshot` is 90% of the weight.

**Known gap, deliberately not papered over:** the project page renders those
empty readings as `0` / `absent` rather than saying the snapshot could not be
loaded. That is a Const I.5 honesty gap and is the next thing to fix, together
with projecting `serpapi_snapshot` down to the fields
`computeSerpFeatureRollup` actually reads.

## Verification

- Real `next build` clean (not just `tsc`) — Const V.1a.
- Retained regression suite: **955 pass / 21 pre-existing failures / zero
  delta** against pristine base, +21 new v7.411 checks. The 21 pre-existing
  failures are inherited: the carried-forward suite is the v7.405 copy and
  predates the v7.406–v7.410 lineage shipped from the parallel session.
- New checks bundle the real route against stubbed drizzle/db and assert the
  hydration set, the snapshot-null rows, the honest-degrade path, the measured
  byte sizes, and the `?sizes=1` probe — behaviour, not source greps. Source
  assertions strip comments first (the v7.402 lesson).
- No component touched → no dual-theme render required (Const V.5).
- Live: `dpl_FSpPFyTfRUdFeiaBJkiD8VFDEC9g`, READY, `target: production`,
  `aliasError: null`, sha `0682e59`. NYP loads on the canonical domain; the GET
  returns 200 in ~1.5 s at 0.07 MB, down from a 500.
