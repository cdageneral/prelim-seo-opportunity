/**
 * POST /api/scout/runs/[id]/execute  (v7.513)
 * Runs the six Scout steps inside this request (no fire-and-forget — same stance
 * as /api/analyze since v7.2). The client keeps the request open and polls the
 * run row for progress. claimRun() flips queued → running atomically, so a
 * double click or a retry can never execute, or bill, the same run twice.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { requireScout } from '@/lib/scout/access';
import { getRun, claimRun } from '@/lib/scout/store';
import { executeRun } from '@/lib/scout/run';
import { setUsageProject } from '@/lib/usage/context';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  const run = await getRun(params.id);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  if (!g.isAdmin && g.user && run.userId !== g.user.sub) return NextResponse.json({ error: 'Not your run' }, { status: 403 });
  if (!(await claimRun(params.id))) return NextResponse.json({ status: run.status, note: 'Already started.' });
  setUsageProject(null);   // Scout spend is not a project's spend — it reaches the ledger unattributed.
  await executeRun(params.id);
  const done = await getRun(params.id);
  return NextResponse.json({ status: done?.status ?? 'failed', error: done?.error ?? null });
}
