/**
 * /api/scout/runs  (v7.513, v7.515)
 * GET  — the caller's runs (admins: everyone's), deleted runs excluded. Blob-free column list (Const II.9).
 * POST — validate + create a run. Spends nothing: the client then calls
 *        /api/scout/runs/[id]/execute, which claims the row atomically.
 *        v7.515: `draft: true` saves the setup to run later (not counted against the daily cap);
 *        up to 4 competitors (lib/scout/input.ts).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireScout, usedToday } from '@/lib/scout/access';
import { createRun, listRuns } from '@/lib/scout/store';
import { parseRunInput } from '@/lib/scout/input';
import { recordEvent } from '@/lib/auth/audit';

export async function GET() {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  const runs = await listRuns({ userId: g.user?.sub ?? null, all: g.isAdmin });
  return NextResponse.json({ runs });
}

export async function POST(req: NextRequest) {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  let json: unknown; try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const p = parseRunInput(json);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });

  if (!p.draft && g.access.cap !== null && g.user) {
    const used = await usedToday(g.user.sub);
    if (used >= g.access.cap) return NextResponse.json({ error: `You have used ${used} of your ${g.access.cap} Scout runs for the last 24 hours. An admin can raise the cap.` }, { status: 429 });
  }

  const id = await createRun({ ...p.input, userId: g.user?.sub ?? null, userName: g.user?.name ?? null, userEmail: g.user?.email ?? null, draft: p.draft });
  await recordEvent(req, { action: p.draft ? 'scout.save' : 'scout.run', meta: { runId: id, domain: p.input.domain, scope: p.input.scope, competitors: p.input.competitors.map(c => c.domain) } });
  return NextResponse.json({ id }, { status: 201 });
}
