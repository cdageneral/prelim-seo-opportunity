import { NextRequest, NextResponse } from 'next/server';
import { z }       from 'zod';
import { put }     from '@vercel/blob';
import { db }      from '@/db';
import { analyses, reports, projectKeywords, competitors } from '@/db/schema';
import { eq }      from 'drizzle-orm';
import { buildBriefHTML } from '@/lib/pdf/template';
// v7.335 (QC audit B2, Const I.5a/II.7): the PDF now computes the SAME page-1
// capture + Share-of-Voice the app renders, instead of the stored pre-v7.245 model.
import { hydrateSnapshotForPool }             from '@/lib/utils/hydrateSnapshot';
import { buildKwPool, computeVolumeMetrics }  from '@/lib/utils/kwVolume';
import { computeSov }                          from '@/lib/sov/model';

const Schema = z.object({ analysisId: z.string().uuid() });
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, parsed.data.analysisId),
    with: { project: true, opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] }, personas: true },
  });

  if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });

  // ── v7.335 (QC audit B2, Const I.5a/II.7) ──────────────────────────────────
  // Build the SAME canonical pool the app's panels read: snapshot hydrated with
  // the project row's _brandTerms/_excludedBrands/_scopeOverrides (mirroring
  // app/projects/[id]/page.tsx via hydrateSnapshotForPool), uploaded
  // project_keywords rows, tracked competitor domains, and the project-default
  // volume thresholds (same semantics as the Exec hero). Capture comes from
  // computeVolumeMetrics on that pool; Share of Voice from the shared page-1
  // click-capture model (lib/sov/model.ts — the exact math SovPanel renders).
  // The template falls back to the stored legacy fields, clearly labeled, ONLY
  // when this snapshot cannot build a pool (honest fallback, Const I.5).
  const project = (analysis as any).project ?? {};
  const [kwRows, compRows] = await Promise.all([
    db.select().from(projectKeywords).where(eq(projectKeywords.projectId, (analysis as any).projectId)),
    db.select().from(competitors).where(eq(competitors.projectId, (analysis as any).projectId)),
  ]);
  const snap              = hydrateSnapshotForPool(project, (analysis as any).semrushSnapshot ?? {});
  const clientDomain      = (snap?.domain ?? '') as string;
  const competitorDomains = compRows.map(c => c.domain).filter(Boolean);
  const pool = buildKwPool({
    semrushSnapshot:   snap,
    uploadedKeywords:  kwRows,
    clientDomain,
    competitorDomains,
    clientVolMin:      project.kwVolThresholdClient ?? 0,
    competitorVolMin:  project.kwVolThresholdCompetitor ?? 0,
    includeDemand:     true,   // same footprint basis as the Exec hero (v7.305)
  });
  const metrics = computeVolumeMetrics(pool);
  const sov = computeSov({
    analysis:    { ...(analysis as any), semrushSnapshot: snap },
    competitors: competitorDomains,
    dbKeywords:  kwRows,
    clientLabel: project.clientName ?? '',
  });

  const html = buildBriefHTML({ ...(analysis as any), semrushSnapshot: snap }, { metrics, sov });
  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await renderPDF(html);
  } catch (err) {
    console.error('[PDF] Render error:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  const filename = `orbitiq-brief-${(analysis as any).project?.clientName?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  const { url }  = await put(filename, pdfBuffer, { access: 'public', contentType: 'application/pdf' });

  await db.insert(reports).values({ analysisId: parsed.data.analysisId, type: 'PDF', generatedAt: new Date(), fileUrl: url });
  return NextResponse.json({ fileUrl: url });
}

async function renderPDF(html: string): Promise<Buffer> {
  const chromium  = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  const browser = await puppeteer.default.launch({
    args:            chromium.default.args,
    defaultViewport: chromium.default.defaultViewport,
    executablePath:  await chromium.default.executablePath(),
    headless:        chromium.default.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
