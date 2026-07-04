/**
 * GET /api/projects/[id]/synthesis-progress?analysisId=…  — v7.343
 *
 * Tiny, cheap poll target for the analyzing screen (Const IV.2 — determinate
 * progress). The old screen showed a TIME-based fake percentage capped at 98%
 * ("Saving results" while the engine was actually mid-categorization) — Wayne
 * watched a 8,177-keyword run sit at "98%" for 10+ minutes. This returns the
 * REAL numbers from the server-side synthesis checkpoint:
 *
 *   { status, done, total, stage }
 *
 *   done / total — categorization batches completed vs total (from
 *                  `_synthCheckpoint.cbProgress.doneStarts` + the keyword pool;
 *                  real counts, nothing modeled — Const I.1)
 *   stage        — 'gathering' | 'categorizing' | 'insights' | 'finalizing' | 'completed' | 'failed'
 *
 * Read-only; never mutates. Any error → 200 with nulls (the screen falls back
 * to its elapsed-time display — honest fallback, Const I.5).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { analyses } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const DISCOVERY_BATCH = 25;   // mirrors lib/claude/synthesize.ts

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const analysisId = req.nextUrl.searchParams.get('analysisId');
    let analysis: any = null;
    if (analysisId) {
      analysis = await db.query.analyses.findFirst({ where: eq(analyses.id, analysisId) });
    } else {
      const recent = await db.query.analyses.findMany({
        where:   eq(analyses.projectId, params.id),
        orderBy: (a: any, { desc }: any) => [desc(a.triggeredAt)],
        limit:   1,
      });
      analysis = recent[0] ?? null;
    }
    if (!analysis) return NextResponse.json({ status: null, done: null, total: null, stage: null });

    const snap: any = analysis.semrushSnapshot ?? null;
    if (analysis.status === 'completed') {
      return NextResponse.json({ status: 'completed', done: null, total: null, stage: 'completed' });
    }
    if (analysis.status === 'failed') {
      return NextResponse.json({ status: 'failed', done: null, total: null, stage: 'failed' });
    }
    if (!snap) {
      return NextResponse.json({ status: analysis.status, done: null, total: null, stage: 'gathering' });
    }

    // Total categorization batches = merged keyword pool (ranked + deduped gap) / batch size.
    const ranked: any[] = snap.topKeywords ?? [];
    const gap: any[]    = snap.gapKeywords ?? [];
    const rankedSet = new Set(ranked.map((k: any) => String(k?.keyword ?? '').toLowerCase()));
    let mergedCount = ranked.length;
    for (const g of gap) if (!rankedSet.has(String(g?.keyword ?? '').toLowerCase())) mergedCount++;
    const discTotal = Math.max(1, Math.ceil(mergedCount / DISCOVERY_BATCH));

    const ckpt: any = snap._synthCheckpoint ?? {};
    const discDone = Array.isArray(ckpt?.cbProgress?.doneStarts) ? ckpt.cbProgress.doneStarts.length : 0;

    // v7.345: consolidation (chunked canonicalization) reports its own chunk
    // progress so the analyzing screen keeps advancing after discovery hits 100%
    // AND the page's progress-aware auto-resume keeps resuming through it. The
    // page stops resuming when `done` stalls two windows in a row; during the
    // long consolidation phase discovery is frozen at max, so WITHOUT folding
    // canon chunks into `done` the run was declared "failed" mid-success.
    const canon: any     = ckpt?.cbProgress?.canon ?? null;
    const canonTotal     = Number.isInteger(canon?.total) ? canon.total : 0;
    const canonDone      = Array.isArray(canon?.chunksDone) ? canon.chunksDone.length : 0;

    const done  = discDone + canonDone;
    const total = discTotal + canonTotal;

    // Stage from which checkpointed passes exist (categorization is the long one;
    // consolidation is the second long phase, still pre-categoryBreakdown).
    let stage: string = 'categorizing';
    if (canonTotal > 0 && !ckpt?.categoryBreakdown) stage = 'consolidating';
    if (ckpt?.categoryBreakdown) stage = ckpt?.opportunities ? 'finalizing' : 'insights';

    return NextResponse.json({ status: analysis.status, done, total, stage });
  } catch (err) {
    // Honest fallback — the screen shows elapsed time instead (Const I.5).
    return NextResponse.json({ status: null, done: null, total: null, stage: null });
  }
}
