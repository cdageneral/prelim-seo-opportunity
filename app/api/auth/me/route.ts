/**
 * GET /api/auth/me  (v7.373) — TEMP DIAGNOSTIC BUILD
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getActiveUser } from '@/lib/auth/session';
import { authEnforced } from '@/lib/auth/config';
import { ensureAuthTables, countUsers } from '@/lib/auth/store';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  const diag: Record<string, unknown> = {};
  let needsBootstrap = false;
  try {
    await ensureAuthTables();
    const cu = await countUsers();
    diag.countUsers = cu;
    needsBootstrap = cu === 0;
  } catch (e) { diag.err = String((e as Error)?.message ?? e); }
  try {
    const r = await db.execute(sql`select count(*)::int as c from app_users`);
    diag.rawCount = (r as { rows?: unknown }).rows ?? r;
  } catch (e) { diag.rawErr = String((e as Error)?.message ?? e); }
  try {
    const r = await db.execute(sql`select current_database() as db, current_schema() as schema, current_user as usr`);
    diag.dbInfo = (r as { rows?: unknown }).rows ?? r;
  } catch (e) { diag.dbInfoErr = String((e as Error)?.message ?? e); }
  try {
    const r = await db.execute(sql`select id, email from app_users limit 3`);
    diag.sample = (r as { rows?: unknown }).rows ?? r;
  } catch (e) { diag.sampleErr = String((e as Error)?.message ?? e); }
  diag.hasDbUrl = !!process.env.DATABASE_URL;
  diag.dbUrlTail = (process.env.DATABASE_URL || '').slice(-24);

  const user = await getActiveUser();
  return NextResponse.json({
    enforced: authEnforced(),
    needsBootstrap,
    user: user ? { id: user.sub, name: user.name, email: user.email, role: user.role } : null,
    diag,
  });
}
