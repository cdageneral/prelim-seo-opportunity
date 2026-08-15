/**
 * POST /api/notices/[id]/dismiss  (v7.461)
 * Records that THIS user closed THIS notice. One row per (notice, user) — the
 * unique index makes a double-click or a second tab a no-op. Dismissal is per
 * user: closing it never silences the notice for anyone else.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getActiveUser } from '@/lib/auth/session';
import { ensureAuthTables } from '@/lib/auth/store';
import { dismissNotice, getNotice } from '@/lib/notices';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  await ensureAuthTables();
  const notice = await getNotice(params.id);
  if (!notice) return NextResponse.json({ error: 'Notice not found' }, { status: 404 });
  await dismissNotice(params.id, user.sub);
  return NextResponse.json({ ok: true });
}
