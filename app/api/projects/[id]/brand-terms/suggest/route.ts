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
import { setUsageProject } from '@/lib/usage/context';
// v7.491 (Const II.9): the sample is extracted in Postgres — see the module header.
import { newestAnalysisId, snapshotKeywordSample } from '@/lib/keywords/snapshotSample';

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  setUsageProject(params.id);   // v7.225: attribute Claude usage to this project
  // ── v7.491 (Const II.9) ────────────────────────────────────────────────────
  // This read used to be `findFirst({ with: { analyses: { limit: 1 } } })` — the
  // whole project row (sixteen JSONB stores) AND the newest analysis (three
  // snapshots) in ONE response, to end up using three project fields and 120
  // keyword strings. On TD Bank that pair measures 67,003,709 bytes against
  // Neon's 67,108,864 limit: 105 KB of headroom, and the identical shape that
  // 500'd the Assessment PDF at v7.490. Now two small queries, neither carrying
  // a snapshot: the project's three scalars, and the sample extracted in
  // Postgres (lib/keywords/snapshotSample.ts).
  const projRows = await db
    .select({ id: projects.id, clientName: projects.clientName, websiteUrl: projects.websiteUrl })
    .from(projects)
    .where(eq(projects.id, params.id));
  const project = projRows[0];
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Ground the suggestion in the client's own ranked terms (real data).
  const analysisId = await newestAnalysisId(params.id);
  const sampleKeywords: string[] = analysisId
    ? await snapshotKeywordSample(analysisId, 'topKeywords', 120)
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
