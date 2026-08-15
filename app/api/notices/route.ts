/**
 * GET /api/notices  (v7.461)
 * Every active, in-window notice the SIGNED-IN user has not dismissed.
 *
 * Signed out — or with auth enforcement off, where there is no user identity to
 * key a dismissal to — this returns an empty list rather than a notice nobody can
 * permanently close. An honest empty state (Const I.5), never a notice that
 * re-appears forever because the close had nowhere to be recorded.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getActiveUser } from '@/lib/auth/session';
import { ensureAuthTables } from '@/lib/auth/store';
import { listActiveNoticesForUser } from '@/lib/notices';

export async function GET() {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ notices: [] });
  try {
    await ensureAuthTables();
    return NextResponse.json({ notices: await listActiveNoticesForUser(user.sub) });
  } catch {
    // DB unreachable — show nothing rather than block the app on a banner fetch.
    return NextResponse.json({ notices: [] });
  }
}
