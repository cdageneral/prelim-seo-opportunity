/**
 * GET /api/scout/runs/[id]  (v7.513) — status + progress for the poller, plus the
 * stored summary once finished. Owners of the run and admins only.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireScout } from '@/lib/scout/access';
import { getRun, getRunResult, medianRunSeconds } from '@/lib/scout/store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  const run = await getRun(params.id);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  if (!g.isAdmin && g.user && run.userId !== g.user.sub) return NextResponse.json({ error: 'Not your run' }, { status: 403 });
  const wantResult = req.nextUrl.searchParams.get('result') === '1' && run.status !== 'queued' && run.status !== 'running';
  const timing = run.status === 'running' ? await medianRunSeconds().catch(() => null) : null;
  return NextResponse.json({ run, timing, serverNow: new Date().toISOString(), result: wantResult ? await getRunResult(params.id) : undefined });
}
