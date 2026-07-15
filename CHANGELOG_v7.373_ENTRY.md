# v7.373 — 2026-07-15 · User login + admin panel (role tiers + per-project grants + activity log)

Wayne asked for a way to put OrbitIQ behind a login, add and manage users from an
admin panel, control what each person can open, and track who logs in and what
projects they access or create. This release builds that layer. It is the app's
FIRST authentication layer — before v7.373 `middleware.ts` was an explicit no-op
("app is open access") and the `projects` table carried unused `clerk_*` columns.

## Rollout — feature-flagged, staged (Wayne's choice, 2026-07-15)

Everything is gated behind the `AUTH_ENFORCED` env var. While it is unset (or
anything other than the string `true`), middleware and all per-project access
checks are **no-ops** and the app behaves **byte-for-byte as it did in v7.372**
(open access). Turning `AUTH_ENFORCED=true` enforces the login wall + per-project
access. This lets the code ship safely, the owner create accounts and grants, the
access wall be tested with a throwaway Viewer, and only then be switched on.

Env vars (set in Vercel):
- `AUTH_SECRET` — a long random string used to sign the session cookie. Required
  for login/session to function (even with the wall off, since you still sign in
  to reach the admin panel).
- `AUTH_ENFORCED` — leave unset for the staged window; set to `true` to enforce.

## What shipped

- **Sign-in (`/sign-in`)** — real email + password login, styled with orbit-* theme
  tokens (light/dark parity, IV.6). On first run (no users yet) it shows a
  one-time "Create your owner account" bootstrap form; once any user exists the
  bootstrap endpoint is closed (403). No open sign-up.
- **Admin panel (`/admin`)** — owner/admin only. Three tabs:
  - *Users & Access* — every user with role, per-project grant chips, last login,
    status; a Manage drawer to change role, toggle per-project grants, reset
    password, suspend/reactivate, or remove (with last-owner + self-delete guards).
  - *Add User* — name, email, role (Admin/Editor/Viewer — owner is not assignable),
    temporary password, and per-project grant toggles.
  - *Activity Log* — REAL audit events (Const I.1), newest first, filterable by
    login / project access / project created / edits, with an honest empty state
    (I.5). Owner/admin only.
- **Role tiers + per-project grants** — role decides *what actions* (owner/admin
  see & manage everything; editor creates/edits inside granted projects; viewer is
  read-only); per-project grants decide *which projects* an editor/viewer can even
  see. Enforced at the single project-route source, so a non-granted project cannot
  leak one panel at a time.
- **Activity tracking** — logins, project opens, project creates, and project edits
  (plus user-management actions) are written to `audit_events`, attributed to the
  signed-in user with ip + user-agent. Logging never throws and skips when there is
  no user to attribute.

## Data model (created at runtime — Const build pattern)

Four new tables, created via `ensureAuthTables()` with `CREATE TABLE IF NOT EXISTS`
(the build is `next build` only, never drizzle-kit push — same discipline as the
projects `ensureColumns()` pattern): `app_users`, `project_access`, `auth_sessions`,
`audit_events`. Documented in `db/schema.ts`.

## Auth mechanics

- Session = a `jose`-signed HS256 JWT in an httpOnly / secure / sameSite=lax cookie
  (7-day TTL). Middleware verifies it on the edge with no DB round-trip.
- Passwords hashed with node:crypto scrypt + per-password random salt (no external
  hashing dependency; only run in node route handlers).
- Suspension / force-sign-out enforced in node route handlers via `getActiveUser`
  (checks the session row + user status), so a suspended user is blocked on their
  next request, not just at token expiry.
- One new dependency: `jose` (^5.10.0), edge-safe JWT.

## Verification (Const V)

- **tsc** — full-project `tsc --noEmit` under the project's own tsconfig, no target
  override (V.1a): CLEAN.
- **Real build** — `next build`: CLEAN. The edge middleware bundles correctly
  (32.3 kB, jose only — no node:crypto in the edge path).
- **Dual-theme render (V.5)** — `/sign-in` and `/admin` (users table, Manage drawer
  with grant toggles, activity feed, add-user form) rendered in BOTH light and dark
  via a headless browser; every element legible in both (IV.6). orbit-* tokens only.
- **Regression posture (V.6)** — this release is purely additive and flag-gated:
  with `AUTH_ENFORCED` unset, middleware early-returns and every access check
  returns "open", so existing behavior is unchanged (the `next build` confirms the
  additive edits compile). NOTE: the carried-forward retained behavioral suite
  (`_verify/run.sh`) was NOT re-run in this cloud session — it lives in the device
  source folders, not the repo. The safety guarantee for existing behavior rests on
  the flag-off no-op invariant, verified by code inspection + the clean build.

## Files

New: `lib/auth/{config,jwt,passwords,store,session,access,audit}.ts`,
`app/api/auth/{login,logout,bootstrap,me}/route.ts`,
`app/api/admin/users/route.ts`, `app/api/admin/users/[id]/route.ts`,
`app/api/admin/activity/route.ts`, `app/admin/page.tsx`.
Changed: `db/schema.ts`, `middleware.ts`, `app/(auth)/sign-in/[[...sign-in]]/page.tsx`,
`app/dashboard/page.tsx`, `app/api/projects/route.ts`,
`app/api/projects/[id]/route.ts`, `package.json`, `package-lock.json`.
