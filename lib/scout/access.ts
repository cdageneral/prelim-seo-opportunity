/**
 * lib/scout/access.ts — which products a user may open (v7.513).
 *
 * Orbit (projects) and Scout are two switches per USER (a group carries no role,
 * v7.418, so this cannot hang off groups). Flag off → everything open, exactly
 * like the rest of the auth layer. Owner/admin always have both. Everyone else
 * defaults to Orbit ON / Scout OFF until an admin says otherwise — so shipping
 * this changes nothing for the existing team.
 */

import { authEnforced, isAdminRole, canWrite } from '@/lib/auth/config';
import { getActiveUser } from '@/lib/auth/session';
import type { SessionClaims } from '@/lib/auth/jwt';
import { getProductRow, countRunsSince, type ProductAccess } from './store';
import { DEFAULT_DAILY_CAP } from './config';

export interface ScoutGate {
  ok: boolean; status: number; reason?: string;
  user: SessionClaims | null;
  access: ProductAccess;
  isAdmin: boolean;
  canWrite: boolean;
}

export async function resolveAccess(): Promise<ScoutGate> {
  if (!authEnforced()) return { ok: true, status: 200, user: null, access: { orbit: true, scout: true, cap: null }, isAdmin: true, canWrite: true };
  const user = await getActiveUser();
  if (!user) return { ok: false, status: 401, reason: 'Not signed in', user: null, access: { orbit: false, scout: false, cap: 0 }, isAdmin: false, canWrite: false };
  if (isAdminRole(user.role)) return { ok: true, status: 200, user, access: { orbit: true, scout: true, cap: null }, isAdmin: true, canWrite: true };
  const row = await getProductRow(user.sub);
  return { ok: true, status: 200, user, access: row ?? { orbit: true, scout: false, cap: DEFAULT_DAILY_CAP }, isAdmin: false, canWrite: canWrite(user.role) };
}

export async function requireScout(): Promise<ScoutGate> {
  const g = await resolveAccess();
  if (!g.ok) return g;
  if (!g.access.scout) return { ...g, ok: false, status: 403, reason: 'Your account does not have Scout access. Ask an admin to turn it on.' };
  return g;
}

/** Runs started in the last 24 hours (failed runs do not count against the cap). */
export async function usedToday(userId: string | null): Promise<number> {
  if (!userId) return 0;
  return countRunsSince(userId, new Date(Date.now() - 24 * 3600 * 1000));
}
