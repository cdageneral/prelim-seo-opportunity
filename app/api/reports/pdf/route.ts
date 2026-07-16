import { NextRequest, NextResponse } from 'next/server';
import { z }       from 'zod';
import { put }     from '@vercel/blob';
import { db }      from '@/db';
import { analyses, reports, projectKeywords, competitors } from '@/db/schema';
import { eq }      from 'drizzle-orm';
// v7.374: the header PDF button now generates the client ASSESSMENT REPORT
// (design spec GEO/orbitiq-assessment-report-mockup-v3-2026-07-16.html) instead
// of the legacy brief. Same shared math as the panels (Const II.6/II.7): pool +
// capture from buildKwPool/computeVolumeMetrics, SoV from computeSov, and the
// AI answer-layer sections from the stored Profound panel metrics
// (projects.profound_data — the panel's own aggregate of real CSV rows, v7.318).
import { buildAssessmentHTML, type ProfoundMetrics } from '@/lib/pdf/assessmentTemplate';
// v7.335 (QC audit B2, Const I.5a/II.7): the PDF computes the SAME page-1
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

  // ── v7.374: assemble the assessment-report data (real sources only, I.1) ──
  const fmtDate = (v: unknown): string | null => {
    if (!v) return null;
    const dt = v instanceof Date ? v : new Date(String(v));
    return isNaN(dt.getTime()) ? null : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const profound = ((project as any).profoundData ?? null) as ProfoundMetrics | null;
  const html = buildAssessmentHTML({
    clientName:   project.clientName ?? 'Client',
    websiteUrl:   project.websiteUrl ?? '',
    industry:     project.industry ?? null,
    preparedDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    scanDate:     fmtDate((analysis as any).updatedAt ?? (analysis as any).createdAt),
    aiDataDate:   fmtDate((project as any).profoundDataUpdatedAt),
    poolCount:    pool.length,
    metrics,
    sov,
    profound,
  });
  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await renderPDF(html);
  } catch (err) {
    console.error('[PDF] Render error:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  const filename = `orbitiq-assessment-${(analysis as any).project?.clientName?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
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
    // v7.374: the assessment template lays out fixed 8.5×11in pages with its own
    // margins/footers, so the PDF prints Letter edge-to-edge (no outer margins).
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
