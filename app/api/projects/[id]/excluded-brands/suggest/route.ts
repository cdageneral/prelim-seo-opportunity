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
import { projects } from '@/db/schema';
import { eq }       from 'drizzle-orm';
import { suggestExcludedBrands } from '@/lib/claude/excludedBrandVocab';

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: {
      analyses: {
        orderBy: (a, { desc }) => [desc(a.triggeredAt)],
        limit: 1,
      },
      competitors: true,
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const snap: any = (project.analyses?.[0] as any)?.semrushSnapshot ?? {};
  // Ground the scan in the client's own ranked terms + competitor gaps (real data),
  // where foreign brand names actually appear.
  const topKw: string[] = Array.isArray(snap?.topKeywords)
    ? snap.topKeywords.slice(0, 140).map((k: any) => String(k?.keyword ?? '')).filter(Boolean)
    : [];
  const gapKw: string[] = Array.isArray(snap?.gapKeywords)
    ? snap.gapKeywords.slice(0, 80).map((k: any) => String(k?.keyword ?? '')).filter(Boolean)
    : [];
  const sampleKeywords = Array.from(new Set([...topKw, ...gapKw]));

  const competitorDomains: string[] = Array.isArray((project as any).competitors)
    ? (project as any).competitors.map((c: any) => String(c?.domain ?? '')).filter(Boolean)
    : [];

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
