/**
 * /api/projects
 *
 * GET  — list all projects for the org
 * POST — create a new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth }   from '@clerk/nextjs/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

const CreateProjectSchema = z.object({
  clientName:  z.string().min(1).max(200),
  websiteUrl:  z.string().url(),
  industry:    z.string().optional(),
  notes:       z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgFilter = orgId ?? userId;

  const rows = await db.select().from(projects)
    .where(eq(projects.clerkOrgId, orgFilter))
    .orderBy(desc(projects.createdAt));

  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const orgFilter = orgId ?? userId;

  const [project] = await db.insert(projects).values({
    ...parsed.data,
    clerkOrgId:  orgFilter,
    clerkUserId: userId,
  }).returning();

  return NextResponse.json({ project }, { status: 201 });
}
