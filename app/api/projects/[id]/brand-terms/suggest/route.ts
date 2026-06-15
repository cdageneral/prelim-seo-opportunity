/**
 * /api/projects/[id]/brand-terms/suggest  — v7.206
 * POST — AI-propose the client's brand vocabulary (variants a domain can't yield).
 *        Returns { brandTerms } for the user to review/edit; does NOT persist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }       from '@/db';
import { projects } from '@/db/schema';
import { eq }       from 'drizzle-orm';
import { suggestBrandVocabulary } from '@/lib/claude/brandVocab';

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: {
      analyses: {
        orderBy: (a, { desc }) => [desc(a.triggeredAt)],
        limit: 1,
      },
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const snap: any = (project.analyses?.[0] as any)?.semrushSnapshot ?? {};
  // Ground the suggestion in the client's own ranked terms (real data).
  const sampleKeywords: string[] = Array.isArray(snap?.topKeywords)
    ? snap.topKeywords.slice(0, 120).map((k: any) => String(k?.keyword ?? '')).filter(Boolean)
    : [];

  const domain = project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');

  try {
    const brandTerms = await suggestBrandVocabulary({
      clientName: project.clientName,
      domain,
      sampleKeywords,
    });
    return NextResponse.json({ brandTerms });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Could not generate brand-term suggestions.', brandTerms: [] },
      { status: 502 },
    );
  }
}
