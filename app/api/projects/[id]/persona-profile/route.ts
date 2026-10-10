/**
 * /api/projects/[id]/persona-profile — v7.552
 *
 * Renders ONE audience segment as a presentation-ready persona profile image
 * (Wayne's prompt + the segment's complete stored data → OpenAI image API →
 * JPG bytes), for the profile-download control on each Audience Segments card.
 *
 * POST body { segmentId, analysisId? }
 *   → 200 image/jpeg (attachment; X-Orbit-Model / X-Orbit-Size / X-Orbit-Duration-Ms
 *     carry what actually rendered it), or JSON { error } with the provider's
 *     real reason (503 when OPENAI_API_KEY is not set — an honest gap, I.5).
 *   The segment is read from the STORED analysis (the one the page shows when
 *   `analysisId` is given, else the shared display pick), never from the request
 *   body, so the image is built from the same rows the panel, the CSV and the
 *   clipboard copy read (II.7).
 *
 * GET → { enabled, model, history: { runs, medianMs, lastMs } }
 *   The panel's ETA basis (IV.2): the MEASURED durations of this feature's
 *   previous renders from the usage ledger — a median of real runs, labelled as
 *   such on screen; no history → the panel shows elapsed time only (IV.3).
 *
 * II.9: every query names its columns; the segment array is read with a jsonb
 * path (`semrush_snapshot -> '_audienceSegments'`), so the multi-MB snapshot
 * never crosses the wire; one blob-bearing row per query (none, in fact).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { projects, apiUsage } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { setUsageProject } from '@/lib/usage/context';
import { ensureUsageTable } from '@/lib/usage/record';
import { loadDisplayAnalysisHead } from '@/lib/analysis/loadDisplayAnalysis';
import { buildPersonaProfilePrompt, PERSONA_PROFILE_PROMPT_VERSION, type ProfileCanvas } from '@/lib/audience/personaProfilePrompt';
import { personaProfileFilename, segmentLabelAt, type AudienceSegment } from '@/lib/audience/segmentRows';
import { generatePersonaProfileImage, primaryProfileModel } from '@/lib/apis/personaProfileImage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;   // a high-quality 1024-wide render takes tens of seconds; the Vercel cap is the ceiling
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

const PostSchema = z.object({
  segmentId:  z.string().min(1),
  analysisId: z.string().uuid().optional(),
}).strict();

function rowsOf(res: any): any[] { return Array.isArray(res) ? res : (res?.rows ?? []); }

/** The stored `_audienceSegments` array of ONE analysis, read by jsonb path (II.9). */
async function loadSegments(projectId: string, analysisId: string | undefined): Promise<{ analysisId: string; segments: AudienceSegment[] } | null> {
  let id = analysisId ?? null;
  if (!id) {
    const head = await loadDisplayAnalysisHead(projectId);
    if (!head) return null;
    id = head.id;
  }
  const res = await db.execute(sql`
    SELECT (semrush_snapshot -> '_audienceSegments')::text AS "segs"
      FROM analyses
     WHERE id = ${id}::uuid AND project_id = ${projectId}::uuid
     LIMIT 1
  `);
  const row = rowsOf(res)[0];
  if (!row) return null;
  let segs: unknown = null;
  try { segs = row.segs ? JSON.parse(String(row.segs)) : null; } catch { segs = null; }
  return { analysisId: id, segments: Array.isArray(segs) ? (segs as AudienceSegment[]) : [] };
}

async function loadHistory(projectId: string): Promise<{ runs: number; medianMs: number | null; lastMs: number | null }> {
  // Measured durations of the last 20 persona-profile renders, any project —
  // the render time depends on the model and canvas, not the client.
  await ensureUsageTable();
  const rows = await db.select({ meta: apiUsage.meta, createdAt: apiUsage.createdAt })
    .from(apiUsage)
    .where(and(eq(apiUsage.provider, 'openai'), eq(apiUsage.unit, 'images'), sql`${apiUsage.meta} ->> 'feature' = 'persona-profile'`))
    .orderBy(desc(apiUsage.createdAt))
    .limit(20);
  void projectId;
  const ms = rows
    .map(r => Number((r.meta as any)?.durationMs))
    .filter(n => Number.isFinite(n) && n > 0);
  if (ms.length === 0) return { runs: 0, medianMs: null, lastMs: null };
  const sorted = ms.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return { runs: ms.length, medianMs, lastMs: ms[0] };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const history = await loadHistory(params.id).catch(() => ({ runs: 0, medianMs: null, lastMs: null }));
  return NextResponse.json({
    enabled: !!process.env.OPENAI_API_KEY,
    model: primaryProfileModel(),
    promptVersion: PERSONA_PROFILE_PROMPT_VERSION,
    history,
  }, { headers: NO_STORE });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not set on this deployment — persona profiles need the OpenAI image API' }, { status: 503, headers: NO_STORE });
  }

  setUsageProject(projectId);

  // Named columns only (II.9) — the three strings the prompt's source block needs.
  const [proj] = await db.select({
    clientName: projects.clientName,
    websiteUrl: projects.websiteUrl,
    industry:   projects.industry,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!proj) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const loaded = await loadSegments(projectId, parsed.data.analysisId);
  if (!loaded) return NextResponse.json({ error: 'No analysis on this project yet' }, { status: 404 });
  const index = loaded.segments.findIndex(s => String(s?.id) === parsed.data.segmentId);
  if (index < 0) return NextResponse.json({ error: `Segment ${parsed.data.segmentId} is not on analysis ${loaded.analysisId}` }, { status: 404 });
  const segment = loaded.segments[index];
  const label = segmentLabelAt(index);

  const ctx = { clientName: proj.clientName, websiteUrl: proj.websiteUrl, industry: proj.industry ?? null };
  const result = await generatePersonaProfileImage(
    (canvas: ProfileCanvas) => buildPersonaProfilePrompt(segment, label, ctx, canvas),
    { ledgerMeta: { segment: label, segmentId: segment.id, analysisId: loaded.analysisId, promptVersion: PERSONA_PROFILE_PROMPT_VERSION } },
  );
  if (result.error !== null) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  }

  const filename = personaProfileFilename(segment, label);
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': 'image/jpeg',
      'Content-Length': String(result.bytes.length),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Orbit-Model': result.model,
      'X-Orbit-Size': result.size,
      'X-Orbit-Quality': result.quality,
      'X-Orbit-Duration-Ms': String(result.durationMs),
      ...(result.fallbackFrom ? { 'X-Orbit-Fallback-From': result.fallbackFrom } : {}),
    },
  });
}
