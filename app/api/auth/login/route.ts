/**
 * POST /api/auth/login  (v7.373)
 * Body: { email, password }
 * Verifies credentials, creates a session, sets the httpOnly session cookie, and
 * records a real `login` audit event. Works regardless of AUTH_ENFORCED so you
 * can sign in and reach the admin panel during the staged (flag-off) window.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureAuthTables, getUserByEmail, setLastLogin, createSession, insertAudit } from '@/lib/auth/store';
import { verifyPassword } from '@/lib/auth/passwords';
import { setSessionCookie } from '@/lib/auth/session';
import { SESSION_TTL_SECONDS } from '@/lib/auth/config';
import { clientIp, userAgent } from '@/lib/auth/audit';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  await ensureAuthTables();
  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });

  const { email, password } = parsed.data;
  const user = await getUserByEmail(email);

  // Generic message — never reveal whether the email exists.
  const invalid = () => NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  if (!user || user.status === 'suspended') return invalid();
  if (!verifyPassword(password, user.passwordHash)) return invalid();

  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const sid = await createSession(user.id, expiresAt, clientIp(req) ?? undefined, userAgent(req) ?? undefined);

  await setSessionCookie({ sub: user.id, email: user.email, name: user.name, role: user.role, sid });
  await setLastLogin(user.id);
  await insertAudit({
    actorUserId: user.id, actorEmail: user.email, actorName: user.name,
    action: 'login', ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
  });
}
