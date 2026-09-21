/**
 * /api/admin/products  (v7.513) — owner/admin only (middleware + checkAdmin).
 * GET   → { access: { [userId]: { orbit, scout, cap } } } for users with a saved row
 * PATCH → { userId, orbit?, scout?, cap? } — upsert one user's product access
 * Kept off /api/admin/users on purpose: product access lives in its own table
 * (lib/scout/store.ts explains why), so the user routes stay byte-for-byte as they were.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAdmin } from '@/lib/auth/access';
import { getUserById, insertAudit } from '@/lib/auth/store';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';
import { listProductRows, getProductRow, upsertProductRow } from '@/lib/scout/store';
import { DEFAULT_DAILY_CAP } from '@/lib/scout/config';

const Patch = z.object({
  userId: z.string().uuid(),
  orbit:  z.boolean().optional(),
  scout:  z.boolean().optional(),
  cap:    z.number().int().min(0).max(200).optional(),
});

export async function GET() {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  return NextResponse.json({ access: await listProductRows(), defaults: { orbit: true, scout: false, cap: DEFAULT_DAILY_CAP } });
}

export async function PATCH(req: NextRequest) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  let json: unknown; try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const p = Patch.safeParse(json);
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const target = await getUserById(p.data.userId);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'owner' || target.role === 'admin') return NextResponse.json({ error: 'Owners and admins always have both products.' }, { status: 400 });

  const cur = (await getProductRow(p.data.userId)) ?? { orbit: true, scout: false, cap: DEFAULT_DAILY_CAP };
  const next = { orbit: p.data.orbit ?? cur.orbit, scout: p.data.scout ?? cur.scout, cap: p.data.cap ?? cur.cap ?? DEFAULT_DAILY_CAP };
  if (!next.orbit && !next.scout) return NextResponse.json({ error: 'A user needs at least one product. Suspend the account instead.' }, { status: 400 });
  await upsertProductRow(p.data.userId, next);

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name, action: 'user.update',
    meta: { targetUserId: p.data.userId, targetEmail: target.email, changed: { products: next } },
    ip: clientIp(req), userAgent: userAgent(req),
  });
  return NextResponse.json({ access: next });
}
