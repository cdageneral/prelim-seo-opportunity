/**
 * POST /api/reports/pdf
 *
 * Renders the brief as a styled PDF using Puppeteer + @sparticuz/chromium.
 * Uploads to Vercel Blob and returns the signed URL.
 *
 * Body: { analysisId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }    from '@clerk/nextjs/server';
import { z }       from 'zod';
import { put }     from '@vercel/blob';
import { db }      from '@/db';
import { analyses, reports } from '@/db/schema';
import { eq }      from 'drizzle-orm';
import { buildBriefHTML } from '@/lib/pdf/template';

const Schema = z.object({ analysisId: z.string().uuid() });

export const maxDuration = 60; // Vercel Pro supports up to 60s

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { analysisId } = parsed.data;

  // Load analysis with all related data
  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, analysisId),
    with: {
      project:       true,
      opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] },
      personas:      true,
    },
  });

  if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });

  // Build HTML from brief template
  const html = buildBriefHTML(analysis as any);

  // Render HTML to PDF with Puppeteer
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPDF(html);
  } catch (err) {
    console.error('[PDF] Render error:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  // Upload to Vercel Blob
  const filename  = `orbitiq-brief-${(analysis as any).project?.clientName?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  const { url }   = await put(filename, pdfBuffer, {
    access: 'public',
    contentType: 'application/pdf',
  });

  // Save report record
  await db.insert(reports).values({
    analysisId,
    type:        'PDF',
    generatedAt: new Date(),
    fileUrl:     url,
  });

  return NextResponse.json({ fileUrl: url });
}

// ─── Puppeteer PDF Render ─────────────────────────────────────────────────────

async function renderPDF(html: string): Promise<Buffer> {
  // Dynamic import to avoid bundling issues
  const chromium = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  const browser = await puppeteer.default.launch({
    args:           chromium.default.args,
    defaultViewport: chromium.default.defaultViewport,
    executablePath:  await chromium.default.executablePath(),
    headless:        chromium.default.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.waitForTimeout(500); // Allow animations to settle

    const pdf = await page.pdf({
      format:          'A4',
      printBackground:  true,
      margin: {
        top:    '16mm',
        right:  '14mm',
        bottom: '16mm',
        left:   '14mm',
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
