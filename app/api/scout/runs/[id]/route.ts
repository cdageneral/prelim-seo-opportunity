/**
 * /api/scout/runs/[id]  (v7.513, v7.515) — owners of the run and admins only.
 * GET    — status + progress for the poller, plus the stored summary once finished.
 * PATCH  — v7.515: edit a SAVED (draft) setup — competitors added or removed, products, scope.
 *          A run that has executed is never edited: its report was built from those inputs,
 *          so "edit & re-run" on a finished run saves or runs a NEW row instead.
 * DELETE — v7.515: soft delete (lib/scout/store deleteRun). Refused while the run is executing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireScout } from '@/lib/scout/access';
import { getRun, getRunResult, medianRunSeconds, updateDraft, deleteRun } from '@/lib/scout/store';
import { parseRunInput } from '@/lib/scout/input';
import { recordEvent } from '@/lib/auth/audit';

async function ownRun(id: string) {
  const g = await requireScout();
  if (!g.ok) return { res: NextResponse.json({ error: g.reason }, { status: g.status }) } as const;
  const run = await getRun(id);
  if (!run) return { res: NextResponse.json({ error: 'Run not found' }, { status: 404 }) } as const;
  if (!g.isAdmin && g.user && run.userId !== g.user.sub) return { res: NextResponse.json({ error: 'Not your run' }, { status: 403 }) } as const;
  return { g, run } as const;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const o = await ownRun(params.id); if ('res' in o) return o.res;
  const { run } = o;
  const wantResult = req.nextUrl.searchParams.get('result') === '1' && run.status !== 'queued' && run.status !== 'running' && run.status !== 'draft';
  const timing = run.status === 'running' ? await medianRunSeconds().catch(() => null) : null;
  return NextResponse.json({ run, timing, serverNow: new Date().toISOString(), result: wantResult ? await getRunResult(params.id) : undefined });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const o = await ownRun(params.id); if ('res' in o) return o.res;
  if (o.run.status !== 'draft') return NextResponse.json({ error: 'Only a saved setup can be edited. A run that has executed keeps the inputs its report was built from.' }, { status: 409 });
  let json: unknown; try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const p = parseRunInput(json);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  if (!(await updateDraft(params.id, p.input))) return NextResponse.json({ error: 'This setup has already started running.' }, { status: 409 });
  await recordEvent(req, { action: 'scout.save', meta: { runId: params.id, domain: p.input.domain, competitors: p.input.competitors.map(c => c.domain) } });
  return NextResponse.json({ id: params.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const o = await ownRun(params.id); if ('res' in o) return o.res;
  if (!(await deleteRun(params.id))) return NextResponse.json({ error: 'This run is still executing. Delete it once it finishes.' }, { status: 409 });
  await recordEvent(req, { action: 'scout.delete', meta: { runId: params.id, domain: o.run.domain } });
  return NextResponse.json({ deleted: true });
}
