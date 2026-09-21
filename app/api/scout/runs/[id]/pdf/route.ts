/**
 * GET /api/scout/runs/[id]/pdf  (v7.513) — render the stored result to a Letter PDF.
 * Rendered on demand from the STORED result (Const II.6a), so re-downloading a
 * run never re-spends an API unit and always prints the figures the run measured.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { requireScout } from '@/lib/scout/access';
import { getRun, getRunResult } from '@/lib/scout/store';
import { buildScoutHtml } from '@/lib/scout/pdfTemplate';
import { renderScoutPdf } from '@/lib/scout/renderPdf';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  const run = await getRun(params.id);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  if (!g.isAdmin && g.user && run.userId !== g.user.sub) return NextResponse.json({ error: 'Not your run' }, { status: 403 });
  if (run.status !== 'ready' && run.status !== 'no_opening') return NextResponse.json({ error: 'This run has no report to print.' }, { status: 409 });
  const result = await getRunResult(params.id);
  if (!result?.themes) return NextResponse.json({ error: 'Stored result is missing.' }, { status: 409 });

  const html = buildScoutHtml(result);
  if (new URL(req.url).searchParams.get('format') === 'html') return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  let pdf: Buffer;
  try { pdf = await renderScoutPdf(html); } catch (e) {
    console.error('[scout.pdf] render failed:', e);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }
  const stamp = String(result.generatedAt ?? '').slice(0, 10);
  return new NextResponse(new Uint8Array(pdf), { status: 200, headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="iq-impact-snapshot-${run.domain.replace(/[^a-z0-9.-]/gi, '')}-${stamp}.pdf"`,
    'Content-Length': String(pdf.length), 'Cache-Control': 'no-store, no-transform',
  } });
}
