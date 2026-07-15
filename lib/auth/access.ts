/**
 * lib/auth/access.ts — the per-project access wall (v7.373).
 *
 * This is the security-critical check. When AUTH_ENFORCED is off it is a no-op
 * (open access, pre-v7.373 behaviour). When on:
 *   - owner / admin  → every project
 *   - editor / viewer → only projects with a project_access grant row
 * Suspended / revoked users are rejected (getActiveUser returns null).
 */

import { authEnforced, seesAllProjects, isAdminRole, type Role } from './config';
import { getActiveUser } from './session';
import { hasProjectAccess } from './store';
import type { SessionClaims } from './jwt';

export interface AccessResult {
  ok: boolean;
  status: number;         // suggested HTTP status when !ok (401 unauthenticated, 403 forbidden)
  user: SessionClaims | null;
  reason?: string;
}

const ALLOW_OPEN: AccessResult = { ok: true, status: 200, user: null };

/** Gate a specific project. Allows everything when the flag is off. */
export async function checkProjectAccess(projectId: string): Promise<AccessResult> {
  if (!authEnforced()) return ALLOW_OPEN;
  const user = await getActiveUser();
  if (!user) return { ok: false, status: 401, user: null, reason: 'not signed in' };
  if (seesAllProjects(user.role)) return { ok: true, status: 200, user };
  const granted = await hasProjectAccess(user.sub, projectId);
  return granted
    ? { ok: true, status: 200, user }
    : { ok: false, status: 403, user, reason: 'no access to this project' };
}

/** Require any signed-in, active user. Open when the flag is off. */
export async function checkSignedIn(): Promise<AccessResult> {
  if (!authEnforced()) return ALLOW_OPEN;
  const user = await getActiveUser();
  if (!user) return { ok: false, status: 401, user: null, reason: 'not signed in' };
  return { ok: true, status: 200, user };
}

/** Require owner/admin. Open when the flag is off (so you can bootstrap). */
export async function checkAdmin(): Promise<AccessResult> {
  if (!authEnforced()) return ALLOW_OPEN;
  const user = await getActiveUser();
  if (!user) return { ok: false, status: 401, user: null, reason: 'not signed in' };
  if (!isAdminRole(user.role)) return { ok: false, status: 403, user, reason: 'admins only' };
  return { ok: true, status: 200, user };
}

export type { Role };
