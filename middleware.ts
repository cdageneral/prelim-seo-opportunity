/**
 * middleware.ts — route gate (v7.373).
 *
 * BEFORE v7.373 this was a no-op ("app is open access"). It stays a no-op until
 * AUTH_ENFORCED === 'true': the function early-returns, so the live app is
 * byte-for-byte unchanged while the flag is off (staged rollout). When the flag
 * is on it enforces a signed session on every app route, redirecting signed-out
 * users to /sign-in and requiring owner/admin for /admin.
 *
 * Runs on the edge, so it imports ONLY jwt.ts (jose) — no node:crypto, no DB.
 * Session revocation / suspension is enforced in the node route handlers
 * (getActiveUser); middleware does the fast signature+expiry gate.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, authEnforced } from '@/lib/auth/config';
import { verifySessionToken } from '@/lib/auth/jwt';

// Paths reachable without a session.
// v7.485: /reset-password is public BY DESIGN — the whole point is that the
// person cannot sign in. The one-time token in the URL is the credential and
// every guard on it lives in /api/auth/reset (already public under /api/auth).
const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/reset-password', '/api/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  // Flag off → do nothing (open access, exactly as before v7.373).
  if (!authEnforced()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  const isApi = pathname.startsWith('/api');

  if (!claims) {
    if (isApi) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Admin area requires owner/admin.
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin')) {
    if (claims.role !== 'owner' && claims.role !== 'admin') {
      if (isApi) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Match everything except Next internals and static asset files. The flag check
  // above makes this a cheap pass-through when auth is off.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|woff2?|ttf)).*)'],
};
