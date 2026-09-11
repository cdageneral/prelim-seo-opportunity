/**
 * POST /api/reports/journey-map — v7.489: the Journey panel's mind-map as a PDF.
 *
 * WHY THE LAYOUT COMES FROM THE CLIENT
 * The panel has already read the canonical topics, applied the journey scope, the
 * segment lens and the Content-Plan selection, and has already PLACED every box
 * with lib/journey/mapLayout.ts. This route renders those exact objects. It
 * re-queries nothing and re-derives nothing — a second server-side build of the
 * same tree would produce a slightly different picture the moment either side
 * changed, which is the screen-vs-report divergence Const II.6a exists to end
 * (same discipline as the v7.378 delivery package and the v7.482 usage report).
 * The body is shape-checked before anything renders: a caller that cannot produce
 * a real layout gets a 400, never an invented map.
 *
 * WHY THE BYTES COME BACK INLINE
 * This is a client-deliverable artifact but a per-request one — there is no link
 * to hand anybody and no reason to leave a copy of a client's content strategy at
 * a public blob URL, so the PDF streams straight back to the operator who asked
 * for it (the assessment report keeps its blob link because that link is the
 * deliverable).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildJourneyMapHTML, type JourneyMapInput } from '@/lib/pdf/journeyMapTemplate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NodeSchema = z.object({
  id: z.string(), kind: z.enum(['umbrella', 'category', 'topic']),
  level: z.number(), x: z.number(), y: z.number(),
  label: z.string(), sub: z.string(),
  action: z.enum(['optimize', 'build']).optional(),
  kids: z.number().optional(), shut: z.boolean().optional(),
  plan: z.enum(['none', 'some', 'all']).optional(),
}).passthrough();

const EdgeSchema = z.object({
  id: z.string(), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), level: z.number(),
}).passthrough();

const LayoutSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  width: z.number(), height: z.number(),
  NW: z.array(z.number()).length(3), NH: z.number(),
  colX: z.array(z.number()).length(3),
});

const Schema = z.object({
  clientDomain: z.string(),
  projectName: z.string().nullable().optional(),
  scopeLabel: z.string(),
  scopeStatement: z.string(),
  segmentLabel: z.string().nullable().optional(),
  planCount: z.number(),
  umbrellas: z.array(z.object({
    name: z.string(), volLabel: z.string(),
    categories: z.number(), topics: z.number(),
    existing: z.number(), build: z.number(), inPlan: z.number(),
    layout: LayoutSchema,
    overview: LayoutSchema.nullable().optional(),
  })).min(1),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Journey payload did not match the panel map shape', detail: parsed.error.flatten() }, { status: 400 });
  }

  const html = buildJourneyMapHTML({
    ...(parsed.data as unknown as Omit<JourneyMapInput, 'generatedAt'>),
    generatedAt: new Date().toISOString(),
  });

  let pdf: Buffer;
  try {
    pdf = await renderPDF(html);
  } catch (err) {
    console.error('[journey-map-pdf] render error:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (parsed.data.clientDomain || 'journey').replace(/[^a-z0-9.-]+/gi, '-').toLowerCase();
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="orbitiq-journey-map-${slug}-${stamp}.pdf"`,
      'Content-Length':      String(pdf.length),
      'Cache-Control':       'no-store, no-transform',
    },
  });
}

async function renderPDF(html: string): Promise<Buffer> {
  const chromium  = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  // Same launch recipe as the assessment report and the usage report:
  // @sparticuz/chromium ^149 (AL2023/node22-compatible) + puppeteer-core ^24.
  const browser = await puppeteer.default.launch({
    args:           chromium.default.args,
    executablePath: await chromium.default.executablePath(),
    headless:       true,
  });

  try {
    const page = await browser.newPage();
    // 'load', not networkidle0: the map HTML is fully self-contained — inline SVG,
    // no external requests, no webfonts, no icon set.
    await page.setContent(html, { waitUntil: 'load' });
    // The template lays out fixed 11x8.5in landscape pages with its own margins
    // and footers, so this prints edge to edge.
    const pdf = await page.pdf({ format: 'Letter', landscape: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
