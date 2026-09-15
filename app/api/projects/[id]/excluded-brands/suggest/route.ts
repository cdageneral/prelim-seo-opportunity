/**
 * /api/projects/[id]/excluded-brands/suggest  — v7.209
 * POST — AI-propose COMPETITOR / THIRD-PARTY brand terms present in the footprint
 *        that should be added to the blocklist (Const III.1). Returns
 *        { excludedBrands } for the user to review/edit; does NOT persist.
 *        (The deterministic v7.208 blocklist is what actually enforces the rule;
 *        this only suggests candidates to add to it.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }       from '@/db';
import { projects, competitors } from '@/db/schema';
import { eq }       from 'drizzle-orm';
import { suggestExcludedBrands } from '@/lib/claude/excludedBrandVocab';
import { setUsageProject } from '@/lib/usage/context';
// v7.491 (Const II.9): the sample is extracted in Postgres — see the module header.
import { newestAnalysisId, snapshotKeywordSample } from '@/lib/keywords/snapshotSample';

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  setUsageProject(params.id);   // v7.225: attribute Claude usage to this project
  // ── v7.491 (Const II.9) ────────────────────────────────────────────────────
  // Same split as brand-terms/suggest: this carried the whole project row and
  // the newest analysis in one response (67,003,709 bytes on TD Bank, against a
  // 67,108,864 limit) to use two project scalars, the competitor list, and 220
  // keyword strings. The snapshot no longer leaves Postgres.
  const [projRows, compRows] = await Promise.all([
    db.select({ id: projects.id, clientName: projects.clientName, websiteUrl: projects.websiteUrl })
      .from(projects).where(eq(projects.id, params.id)),
    db.select().from(competitors).where(eq(competitors.projectId, params.id)),
  ]);
  const project = projRows[0];
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Ground the scan in the client's own ranked terms + competitor gaps (real data),
  // where foreign brand names actually appear. Order and dedupe are unchanged:
  // top terms first, then gaps, first occurrence wins.
  const analysisId = await newestAnalysisId(params.id);
  const topKw: string[] = analysisId ? await snapshotKeywordSample(analysisId, 'topKeywords', 140) : [];
  const gapKw: string[] = analysisId ? await snapshotKeywordSample(analysisId, 'gapKeywords',  80) : [];
  const sampleKeywords = Array.from(new Set([...topKw, ...gapKw]));

  const competitorDomains: string[] = compRows
    .map((c: any) => String(c?.domain ?? ''))
    .filter(Boolean);

  const domain = project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');

  try {
    const excludedBrands = await suggestExcludedBrands({
      clientName: project.clientName,
      domain,
      competitorDomains,
      sampleKeywords,
    });
    return NextResponse.json({ excludedBrands });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Could not generate brand-exclusion suggestions.', excludedBrands: [] },
      { status: 502 },
    );
  }
}
