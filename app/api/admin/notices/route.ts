/**
 * /api/admin/notices  (v7.461)  — owner/admin only
 * GET  — every notice with its measured read receipts (who closed it, when) and
 *        the active users who have not closed it yet.
 * POST — create a notice { title, body, severity, active, startsAt?, endsAt? }
 *
 * Const I.1: the receipt list is real `notice_dismissals` rows. A user who has
 * not dismissed is reported as pending — never as a modeled read-rate.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAdmin } from '@/lib/auth/access';
import { ensureAuthTables, insertAudit } from '@/lib/auth/store';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';
import { listNoticesForAdmin, createNotice } from '@/lib/notices';

const CreateNotice = z.object({
  title:    z.string().min(1).max(160),
  body:     z.string().min(1).max(4000),
  severity: z.enum(['info', 'warning', 'success']).optional().default('info'),
  active:   z.boolean().optional().default(true),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt:   z.string().datetime().nullable().optional(),
});

export async function GET() {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();
  return NextResponse.json({ notices: await listNoticesForAdmin() });
}

export async function POST(req: NextRequest) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = CreateNotice.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const p = parsed.data;
  const title = p.title.trim();
  const body  = p.body.trim();
  if (!title || !body) return NextResponse.json({ error: 'A title and a message are required.' }, { status: 400 });

  const startsAt = p.startsAt ? new Date(p.startsAt) : null;
  const endsAt   = p.endsAt   ? new Date(p.endsAt)   : null;
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: 'The end date must be after the start date.' }, { status: 400 });
  }

  const actor = await getCurrentUser();
  const created = await createNotice({
    title, body, severity: p.severity, active: p.active, startsAt, endsAt,
    createdBy: actor?.sub ?? null, createdByName: actor?.name ?? null,
  });

  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'notice.create',
    meta: { noticeId: created.id, title, severity: p.severity, active: p.active },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({ notice: created }, { status: 201 });
}
