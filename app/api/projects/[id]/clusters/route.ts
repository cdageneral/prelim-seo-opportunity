/**
 * POST /api/projects/[id]/clusters
 *
 * Layer 2 of ThemeClusters intent classification.
 * Called only for keywords that signal-matching (Layer 1) could not classify.
 * Uses Claude haiku — fast + cheap.
 *
 * Body:  { keywords: string[], industry: string, domain: string, analysisId?: string }
 * Returns: { assignments: Record<string, 'informational'|'commercial'|'transactional'|'navigational'> }
 *
 * v7.376: the classification core moved to lib/clusters/intentAssign.ts (shared
 * with the assessment-report route, Const II.7), and the resulting map is now
 * PERSISTED at analyses.semrushSnapshot._clusterAssigns — before this it lived
 * only in the browser's localStorage, so server-side canonical builds ran with
 * an empty map (the v7.220 under-count bug class). A PUT handler lets the page
 * write through an already-cached localStorage map so existing projects
 * converge on the stored copy without re-running the pass.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { setUsageProject } from '@/lib/usage/context';
import { instrumentAnthropic } from '@/lib/usage/record';
import { classifyIntents, persistClusterAssigns, type AssignMap } from '@/lib/clusters/intentAssign';
import { db } from '@/db';
import { analyses } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { latestAnalysisIdWithSnapshot } from '@/lib/latestAnalysis';   // v7.445

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return instrumentAnthropic(new Anthropic({ apiKey }));   // v7.225: auto-record token usage
}

/** Resolve the analysis row to persist onto: the caller's analysisId when
 *  given, else the project's most recent analysis with a snapshot. */
async function resolveAnalysisId(projectId: string, analysisId?: string): Promise<string | null> {
  if (analysisId) return analysisId;
  // v7.445: this only ever needed the ID — fetching 5 whole snapshots to read one
  // was what blew Neon's response cap elsewhere (lib/latestAnalysis.ts).
  return latestAnalysisIdWithSnapshot(projectId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  setUsageProject(params.id);   // v7.225: attribute Claude usage to this project
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { keywords, industry, domain, analysisId } = body as {
    keywords: string[];
    industry: string;
    domain:   string;
    analysisId?: string;
  };

  if (!keywords?.length) {
    return NextResponse.json({ assignments: {} });
  }

  try {
    const assignments = await classifyIntents(getClient(), keywords, industry, domain);

    // v7.376: persist so server-side canonical builds read the SAME map.
    // Best-effort — a persistence failure must not break the panel's response.
    try {
      const aid = await resolveAnalysisId(params.id, analysisId);
      if (aid) await persistClusterAssigns(aid, assignments);
    } catch (persistErr) {
      console.error('[OrbitIQ v7.376] _clusterAssigns persist failed (panel unaffected):', persistErr);
    }

    return NextResponse.json({ assignments });

  } catch (err) {
    console.error('[OrbitIQ] Cluster classification failed:', err);
    // Return empty — the panel will show unmatched keywords under informational as fallback
    return NextResponse.json({ assignments: {} });
  }
}

/**
 * PUT — write-through persistence for an assignment map the browser already
 * holds (its localStorage cache predates v7.376's server persistence). The
 * page calls this once when it finds a local map but no stored `_clusterAssigns`,
 * so the assessment report and every future server read use the EXACT map the
 * user's panels have been rendering. Validated with the same intent whitelist.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { assignments, analysisId } = body as { assignments: Record<string, string>; analysisId?: string };
  if (!assignments || typeof assignments !== 'object') {
    return NextResponse.json({ error: 'assignments object required' }, { status: 400 });
  }
  const VALID = new Set(['informational', 'commercial', 'transactional', 'navigational']);
  const clean: AssignMap = {};
  for (const [kw, intent] of Object.entries(assignments)) {
    if (typeof kw === 'string' && VALID.has(intent)) clean[kw.toLowerCase()] = intent as any;
  }
  if (Object.keys(clean).length === 0) return NextResponse.json({ stored: 0 });

  try {
    const aid = await resolveAnalysisId(params.id, analysisId);
    if (!aid) return NextResponse.json({ error: 'No analysis to persist onto' }, { status: 404 });
    await persistClusterAssigns(aid, clean);
    return NextResponse.json({ stored: Object.keys(clean).length });
  } catch (err) {
    console.error('[OrbitIQ v7.376] _clusterAssigns PUT failed:', err);
    return NextResponse.json({ error: 'Persist failed' }, { status: 500 });
  }
}
