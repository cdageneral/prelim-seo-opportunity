/**
 * lib/auth/session.ts — session cookie helpers for node route handlers (v7.373).
 *
 * Middleware verifies the token itself (edge, via jwt.ts). These helpers are for
 * node-runtime route handlers: set/clear the cookie, and read the current user
 * from the request. getCurrentUser() is signature-only (fast, no DB);
 * getActiveUser() additionally confirms the session is not revoked and the user
 * is still active — used on sensitive actions (admin + project mutations).
 */

import { cookies } from 'next/headers';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './config';
import { signSessionToken, verifySessionToken, type SessionClaims } from './jwt';
import { isSessionActive, getUserById } from './store';

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await signSessionToken(claims);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 0,
  });
}

/** Identity from the signed cookie (no DB). null if no/invalid cookie. */
export async function getCurrentUser(): Promise<SessionClaims | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Like getCurrentUser but confirms (via DB) the session is live and the user is
 * still 'active'. Returns null if revoked / expired / suspended. Use before any
 * privileged action so a suspended user or a force-signed-out session is blocked
 * immediately, not just when their token expires.
 */
export async function getActiveUser(): Promise<SessionClaims | null> {
  const claims = await getCurrentUser();
  if (!claims) return null;
  if (claims.sid && !(await isSessionActive(claims.sid))) return null;
  const user = await getUserById(claims.sub);
  if (!user || user.status !== 'active') return null;
  // reflect any role change since the token was minted
  return { ...claims, role: user.role };
}
