/**
 * POST /api/scout/runs/[id]/convert  (v7.513) — promote a Scout run to a full Orbit
 * project. Carries domain, market, industry and the chosen competitors; nothing
 * measured by Scout is copied into the project's data stores (a project builds
 * its own full footprint — Scout's is a floor-limited read). Needs Orbit access
 * and a write role. Idempotent: a run already linked returns its project.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, competitors as competitorsTable } from '@/db/schema';
import { requireScout } from '@/lib/scout/access';
import { getRun, linkProject } from '@/lib/scout/store';
import { getIndustry } from '@/lib/scout/config';
import { authEnforced, seesAllProjects } from '@/lib/auth/config';
import { grantProjectToUsers } from '@/lib/auth/store';
import { recordEvent } from '@/lib/auth/audit';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  if (!g.access.orbit || !g.canWrite) return NextResponse.json({ error: 'Converting to a project needs Orbit access with an editor role.' }, { status: 403 });
  const run = await getRun(params.id);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  if (!g.isAdmin && g.user && run.userId !== g.user.sub) return NextResponse.json({ error: 'Not your run' }, { status: 403 });
  if (run.projectId) return NextResponse.json({ projectId: run.projectId, existing: true });

  const [project] = await db.insert(projects).values({
    clientName: run.domain, websiteUrl: `https://${run.domain}`, industry: getIndustry(run.industry).label,
    notes: `Created from a Scout run on ${run.createdAt.slice(0, 10)}${run.headline ? ` — opening: ${run.headline}` : ''}.`,
    dataSource: 'auto', kwVolThresholdClient: 0, kwVolThresholdCompetitor: 0, semrushDatabase: run.market,
    clerkOrgId: 'default', clerkUserId: 'default',
  }).returning({ id: projects.id });
  for (const c of run.competitors) await db.insert(competitorsTable).values({ projectId: project.id, domain: c.domain, name: c.domain });
  if (authEnforced() && g.user && !seesAllProjects(g.user.role)) await grantProjectToUsers(project.id, [g.user.sub]).catch(() => {});
  await linkProject(params.id, project.id);
  await recordEvent(req, { action: 'project.create', projectId: project.id, projectName: run.domain, meta: { fromScoutRun: params.id } });
  return NextResponse.json({ projectId: project.id }, { status: 201 });
}
