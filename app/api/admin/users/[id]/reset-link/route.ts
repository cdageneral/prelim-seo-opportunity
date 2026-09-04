/**
 * POST /api/admin/users/[id]/reset-link  (v7.485) — owner/admin only
 *
 * Mints a one-time, short-lived password-reset link for a user and returns it
 * ONCE, to the admin who asked. Wayne's recovery path (2026-09-04): there is no
 * mail sender in this app, so the admin copies the link and hands it over
 * out-of-band. Nothing about the user's CURRENT password is read or revealed —
 * it is a scrypt hash and recovery can only issue a new secret.
 *
 * Only the token's SHA-256 reaches the database. This response is the single
 * moment the plaintext exists server-side; it is not logged, and the audit row
 * records that a link was issued, never the link itself.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth/access';
import { ensureAuthTables, getUserById, createResetToken, insertAudit } from '@/lib/auth/store';
import { mintResetToken, resetUrl, RESET_TTL_MINUTES } from '@/lib/auth/resetTokens';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const target = await getUserById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.status === 'suspended') {
    return NextResponse.json(
      { error: 'This account is suspended — reactivate it before issuing a reset link.' },
      { status: 400 },
    );
  }

  const actor = await getCurrentUser();
  const { token, tokenHash, expiresAt } = mintResetToken();
  await createResetToken({
    userId: target.id, tokenHash, expiresAt,
    issuedBy: actor?.sub ?? null, issuedByEmail: actor?.email ?? null,
  });

  // Build the link against the origin this request actually arrived on, so the
  // link works on whatever host the operator is using (Const I.1 — no invented
  // hostname). x-forwarded-* is what Vercel populates behind its proxy.
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  const url   = resetUrl(`${proto}://${host}`, token);

  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'user.reset_link_issued',
    meta: { targetUserId: target.id, targetEmail: target.email, expiresAt: expiresAt.toISOString() },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({
    url,
    expiresAt: expiresAt.toISOString(),
    ttlMinutes: RESET_TTL_MINUTES,
    user: { id: target.id, name: target.name, email: target.email },
  });
}
