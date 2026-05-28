/**
 * /api/projects/[id]
 *
 * GET    — fetch project + latest analysis
 * PATCH  — update project fields
 * DELETE — soft delete (status = archived)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }   from '@clerk/nextjs/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects, analyses } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

const UpdateSchema = z.object({
  clientName: z.string().min(1).optional(),
  websiteUrl: z.string().url().optional(),
  industry:   z.string().optional(),
  notes:      z.string().optional(),
  status:     z.enum(['active', 'archived', 'draft']).optional(),
}).strict();

async function getProject(id: string, orgFilter: string) {
  return db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.clerkOrgId, orgFilter)),
    with: {
      analyses: {
        orderBy: (a, { desc }) => [desc(a.triggeredAt)],
        limit: 5,
        with: {
          opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] },
          personas:      true,
        },
      },
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(params.id, orgId ?? userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgFilter = orgId ?? userId;
  const existing  = await getProject(params.id, orgFilter);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db.update(projects)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projects.id, params.id))
    .returning();

  return NextResponse.json({ project: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgFilter = orgId ?? userId;
  const existing  = await getProject(params.id, orgFilter);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.update(projects)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(projects.id, params.id));

  return NextResponse.json({ success: true });
}
