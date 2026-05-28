/**
 * /api/projects/[id]
 * GET    — project + analyses + competitors
 * PATCH  — update name, url, industry, notes
 * DELETE — hard delete project
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects } from '@/db/schema';
import { eq }     from 'drizzle-orm';

const UpdateSchema = z.object({
  clientName: z.string().min(1).optional(),
  websiteUrl: z.string().url().optional(),
  industry:   z.string().optional(),
  notes:      z.string().optional(),
  status:     z.enum(['active', 'archived', 'draft']).optional(),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: {
      analyses: {
        orderBy: (a, { desc }) => [desc(a.triggeredAt)],
        limit: 5,
        with: {
          opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] },
          personas:      true,
        },
      },
      competitors: { orderBy: (c, { asc }) => [asc(c.createdAt)] },
    },
  });

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await db.delete(projects).where(eq(projects.id, params.id));
  return NextResponse.json({ success: true });
}
