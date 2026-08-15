/**
 * /api/admin/notices/[id]  (v7.461)  — owner/admin only
 * PATCH  — edit a notice, or flip it active/inactive.
 *          { resend: true } additionally CLEARS every receipt so the notice shows
 *          again for everyone — deliberate and explicit, never automatic.
 * DELETE — remove the notice (its receipts cascade away with it).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAdmin } from '@/lib/auth/access';
import { ensureAuthTables, insertAudit } from '@/lib/auth/store';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';
import { getNotice, updateNotice, deleteNotice, resetNoticeDismissals } from '@/lib/notices';

const PatchNotice = z.object({
  title:    z.string().min(1).max(160).optional(),
  body:     z.string().min(1).max(4000).optional(),
  severity: z.enum(['info', 'warning', 'success']).optional(),
  active:   z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt:   z.string().datetime().nullable().optional(),
  resend:   z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const existing = await getNotice(params.id);
  if (!existing) return NextResponse.json({ error: 'Notice not found' }, { status: 404 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = PatchNotice.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const p = parsed.data;

  const startsAt = p.startsAt === undefined ? undefined : (p.startsAt ? new Date(p.startsAt) : null);
  const endsAt   = p.endsAt   === undefined ? undefined : (p.endsAt   ? new Date(p.endsAt)   : null);
  const effStart = startsAt === undefined ? existing.startsAt : startsAt;
  const effEnd   = endsAt   === undefined ? existing.endsAt   : endsAt;
  if (effStart && effEnd && new Date(effEnd).getTime() <= new Date(effStart).getTime()) {
    return NextResponse.json({ error: 'The end date must be after the start date.' }, { status: 400 });
  }

  const updated = await updateNotice(params.id, {
    title:    p.title?.trim(),
    body:     p.body?.trim(),
    severity: p.severity,
    active:   p.active,
    startsAt, endsAt,
  });
  if (p.resend) await resetNoticeDismissals(params.id);

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: p.resend ? 'notice.resend' : 'notice.update',
    meta: { noticeId: params.id, title: updated?.title ?? existing.title, active: updated?.active ?? existing.active },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({ notice: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const existing = await getNotice(params.id);
  if (!existing) return NextResponse.json({ error: 'Notice not found' }, { status: 404 });
  await deleteNotice(params.id);

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'notice.delete',
    meta: { noticeId: params.id, title: existing.title },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({ ok: true });
}
