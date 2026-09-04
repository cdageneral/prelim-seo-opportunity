/**
 * POST /api/auth/reset  (v7.485) — public (no session required, by design)
 *
 * Two calls, one endpoint:
 *   { token }             → validate only; returns who the link is for
 *   { token, password }   → set the new password and burn the token
 *
 * This is the only route in the app that changes a password without a session,
 * so every guard lives here: the token must exist, be unexpired, be unused, and
 * belong to a non-suspended user. Consumption is atomic (see consumeResetToken)
 * so a double submit cannot spend one token twice.
 *
 * Failure is deliberately non-committal — an invalid, expired and already-used
 * token all return the same message, so the endpoint cannot be used to probe
 * which tokens ever existed.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { appUsers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  ensureAuthTables, getResetByTokenHash, getUserById, updateUser,
  consumeResetToken, invalidateUserResets, revokeUserSessions, insertAudit,
} from '@/lib/auth/store';
import { hashResetToken, resetHashesMatch } from '@/lib/auth/resetTokens';
import { hashPassword } from '@/lib/auth/passwords';
import { clientIp, userAgent } from '@/lib/auth/audit';

const Body = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

/** One message for every bad-token case — never say WHICH way it was bad. */
const BAD_TOKEN = 'This reset link is invalid or has expired. Ask an admin for a new one.';

export async function POST(req: NextRequest) {
  await ensureAuthTables();

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const tokenHash = hashResetToken(token);
  const row = await getResetByTokenHash(tokenHash);
  // The hash lookup already matched exactly; the constant-time compare is belt
  // and braces so the code path never leaks timing on a near-miss.
  if (!row || !resetHashesMatch(row.tokenHash, tokenHash)) {
    return NextResponse.json({ error: BAD_TOKEN }, { status: 400 });
  }
  if (row.usedAt) return NextResponse.json({ error: BAD_TOKEN }, { status: 400 });
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: BAD_TOKEN }, { status: 400 });
  }

  const user = await getUserById(row.userId);
  if (!user || user.status === 'suspended') {
    return NextResponse.json({ error: BAD_TOKEN }, { status: 400 });
  }

  // Validate-only call: tell the page who it is setting a password for.
  if (!password) {
    return NextResponse.json({
      valid: true,
      user: { name: user.name, email: user.email },
      expiresAt: new Date(row.expiresAt).toISOString(),
    });
  }

  // Spend the token FIRST. If another submission already spent it, stop here —
  // this is what makes the link single-use under a double-click or a retry.
  const spent = await consumeResetToken(row.id);
  if (!spent) return NextResponse.json({ error: BAD_TOKEN }, { status: 400 });

  await updateUser(user.id, { passwordHash: hashPassword(password) });
  // A pending (invited, never-signed-in) user becomes active by setting one.
  if (user.status === 'pending') {
    await db.update(appUsers).set({ status: 'active' }).where(eq(appUsers.id, user.id));
  }
  // Burn any other outstanding link, and sign out every existing session:
  // resetting a password must not leave an older session alive.
  await invalidateUserResets(user.id);
  await revokeUserSessions(user.id);

  await insertAudit({
    actorUserId: user.id, actorEmail: user.email, actorName: user.name,
    action: 'user.password_reset',
    meta: { viaResetLink: true, issuedByEmail: row.issuedByEmail ?? undefined },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true, email: user.email });
}
