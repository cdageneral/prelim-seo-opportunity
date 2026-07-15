/**
 * lib/auth/config.ts — auth constants + the enforcement feature flag (v7.373).
 *
 * The whole auth layer is gated behind AUTH_ENFORCED. When it is anything other
 * than the string 'true', middleware and per-project access checks are no-ops and
 * the app behaves EXACTLY as it did before v7.373 (open access). This is the
 * staged-rollout switch: ship the code with the flag off, create accounts + set
 * grants, verify the access wall, then flip AUTH_ENFORCED=true to go live.
 *
 * Env vars:
 *   AUTH_ENFORCED  'true' turns the login wall + per-project access on. Anything
 *                  else (unset, 'false', '0') = open access, current behaviour.
 *   AUTH_SECRET    HMAC secret used to sign the session cookie. Required for
 *                  login/session to function (even with the wall off, since you
 *                  still log in to reach the admin panel). Set a long random value.
 */

export const SESSION_COOKIE = 'orbitiq_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export type UserStatus = 'active' | 'pending' | 'suspended';

/** Roles that can reach the admin panel and the activity log. */
export const ADMIN_ROLES: Role[] = ['owner', 'admin'];
/** Roles that see every project regardless of per-project grants. */
export const ALL_PROJECT_ROLES: Role[] = ['owner', 'admin'];
/** Roles allowed to create / edit projects (inside their granted set). */
export const WRITE_ROLES: Role[] = ['owner', 'admin', 'editor'];

/** True only when the login wall + access checks should be enforced. */
export function authEnforced(): boolean {
  return process.env.AUTH_ENFORCED === 'true';
}

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function seesAllProjects(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function canWrite(role: string | undefined | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

/** The signing secret, or throw a clear error if it was never configured. */
export function authSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'AUTH_SECRET is not set (or too short). Set a long random AUTH_SECRET env var in Vercel to enable login.',
    );
  }
  return new TextEncoder().encode(s);
}
