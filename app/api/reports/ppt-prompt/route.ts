/**
 * POST /api/reports/ppt-prompt
 *
 * Generates the Claude PPTX skill prompt pre-loaded with all client analysis data.
 * Stores the result in the reports table and returns the text.
 *
 * Body: { analysisId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }    from '@clerk/nextjs/server';
import { z }       from 'zod';
import { db }      from '@/db';
import { analyses, reports } from '@/db/schema';
import { eq }      from 'drizzle-orm';
import { generatePPTPrompt } from '@/lib/claude/synthesize';

const Schema = z.object({ analysisId: z.string().uuid() });

export const maxDuration = 30;

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

  // Check for existing PPT prompt report (avoid regenerating)
  const existing = await db.query.reports.findFirst({
    where: eq(reports.analysisId, analysisId),
  });
  if (existing?.type === 'PPT_PROMPT' && existing.promptText) {
    return NextResponse.json({ promptText: existing.promptText, cached: true });
  }

  // Load full analysis
  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, analysisId),
    with: {
      project:       true,
      opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] },
    },
  });

  if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  if (analysis.status !== 'completed') {
    return NextResponse.json({ error: 'Analysis not yet complete' }, { status: 400 });
  }

  const project  = (analysis as any).project;
  const opps     = (analysis as any).opportunities ?? [];
  const narrative = (analysis.semrushSnapshot as any)?._narrative ?? {};

  const promptText = await generatePPTPrompt(
    project.clientName,
    project.websiteUrl,
    project.industry ?? 'General',
    narrative,
    opps,
    analysis.semrushSnapshot  as any,
    analysis.serpApiSnapshot  as any,
    analysis.profoundSnapshot as any,
  );

  // Save report record
  await db.insert(reports).values({
    analysisId,
    type:        'PPT_PROMPT',
    generatedAt: new Date(),
    promptText,
  });

  return NextResponse.json({ promptText });
}
