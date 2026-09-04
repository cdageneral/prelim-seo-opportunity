/**
 * POST /api/usage/pdf — v7.482: the API Usage & Cost report as a PDF.
 *
 * WHY THE PAYLOADS COME FROM THE CLIENT
 * The dashboard has already fetched /api/usage, /api/usage/cost and
 * /api/usage/hours, and has already fanned out the per-project keyword counts.
 * This route renders THOSE EXACT OBJECTS. It is a pure serializer: it does not
 * re-query the ledger, re-price a line or re-credit an hour, so the report and
 * the screen cannot disagree (Const II.6a — a rollup READS a metric, it never
 * re-derives one; the same discipline as the v7.378 delivery package). Re-running
 * the three queries here would produce a second, slightly-later set of numbers
 * and reintroduce exactly the screen-vs-report divergence Art. II.6a exists to
 * end. The body is shape-checked before anything is rendered: a caller that
 * cannot produce a real rollup gets a 400, never an invented report.
 *
 * WHY THE BYTES COME BACK INLINE INSTEAD OF VIA BLOB STORAGE
 * The assessment PDF and the delivery package both `put()` to a PUBLIC Vercel
 * blob URL and hand back the link. This report carries Hours Saved and the full
 * internal cost position, which Wayne declared INTERNAL (Const II.6c, 2026-08-14)
 * — so it is never written to public storage. The PDF is streamed straight back
 * to the operator who asked for it and lives nowhere else.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildUsageHTML } from '@/lib/usage/pdfTemplate';
import type { RollupPayload, CostPayload, HoursPayload, KwCount } from '@/lib/usage/rollupView';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Validated to the depth this report READS. The nested rows keep passthrough
 * shapes on purpose: the three routes own those contracts, and a stricter
 * mirror here would reject a legitimately-extended payload and silently stop
 * producing reports. What is NOT optional is the spine — no rollup, no report.
 */
const LineSchema = z.object({
  provider: z.string(), unit: z.string(),
  usage: z.number(), baseline: z.number(), total: z.number(), calls: z.number(),
}).passthrough();

const Schema = z.object({
  rollup: z.object({
    asOf: z.string(),
    grandTotals: z.array(LineSchema),
    projects: z.array(z.object({
      projectId: z.string().nullable(),
      projectName: z.string(),
      lines: z.array(LineSchema),
      lastActivity: z.string().nullable(),
    }).passthrough()),
  }).passthrough(),
  cost:  z.object({ grandTotalUSD: z.number() }).passthrough().nullable().optional(),
  hours: z.object({ grandHours: z.number(), projects: z.array(z.any()) }).passthrough().nullable().optional(),
  keywordCounts: z.record(z.union([z.number(), z.null(), z.literal('error')])).optional(),
  // v7.483 — the scope the dashboard was showing. Optional so a pre-v7.483
  // caller still gets a report; when absent the template prints no statement
  // rather than claiming an unfiltered view it cannot vouch for (Const I.5).
  scope: z.object({
    statement: z.string(), rangeLabel: z.string(),
    dated: z.boolean(), projectFiltered: z.boolean(),
  }).nullable().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Usage payload did not match the dashboard rollup shape', detail: parsed.error.flatten() }, { status: 400 });
  }

  const html = buildUsageHTML({
    rollup:        parsed.data.rollup as unknown as RollupPayload,
    cost:          (parsed.data.cost  ?? null) as unknown as CostPayload  | null,
    hours:         (parsed.data.hours ?? null) as unknown as HoursPayload | null,
    keywordCounts: (parsed.data.keywordCounts ?? {}) as Record<string, KwCount>,
    generatedAt:   new Date().toISOString(),
    scope:         parsed.data.scope ?? null,
  });

  let pdf: Buffer;
  try {
    pdf = await renderPDF(html);
  } catch (err) {
    console.error('[usage-pdf] render error:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="orbitiq-api-usage-${stamp}.pdf"`,
      'Content-Length':      String(pdf.length),
      'Cache-Control':       'no-store, no-transform',
    },
  });
}

async function renderPDF(html: string): Promise<Buffer> {
  const chromium  = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  // Same launch recipe as the assessment report (app/api/reports/pdf/route.ts):
  // @sparticuz/chromium ^149 (AL2023/node22-compatible) + puppeteer-core ^24,
  // whose v149 API dropped the defaultViewport/headless statics.
  const browser = await puppeteer.default.launch({
    args:           chromium.default.args,
    executablePath: await chromium.default.executablePath(),
    headless:       true,
  });

  try {
    const page = await browser.newPage();
    // 'load', not networkidle0: the usage HTML is fully self-contained — no
    // external requests, no webfonts, no icon set.
    await page.setContent(html, { waitUntil: 'load' });
    // The template lays out fixed 11x8.5in landscape pages with its own margins
    // and footers, so this prints edge-to-edge.
    const pdf = await page.pdf({ format: 'Letter', landscape: true, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
