/**
 * GET /api/admin/activity  (v7.373)  — owner/admin only
 * Returns real audit_events (Const I.1), newest first, optionally filtered by
 * ?action=login|logout|project.open|project.create|project.edit|user.invite|user.update
 * and limited by ?limit=. Honest empty state when nothing has happened yet.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/auth/access';
import { ensureAuthTables, listAudit, projectNames } from '@/lib/auth/store';

export async function GET(req: NextRequest) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const action = req.nextUrl.searchParams.get('action') ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200;

  const events = await listAudit({ action, limit });

  // Fill any missing project names (older rows / renamed projects) from live data.
  const missing = Array.from(new Set(events.filter(e => e.projectId && !e.projectName).map(e => e.projectId as string)));
  const names = missing.length ? await projectNames(missing) : {};

  return NextResponse.json({
    events: events.map(e => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      actorEmail: e.actorEmail,
      projectId: e.projectId,
      projectName: e.projectName ?? (e.projectId ? names[e.projectId] ?? null : null),
      meta: e.meta,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt,
    })),
  });
}
