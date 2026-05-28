/**
 * /api/projects
 * GET  — list all projects
 * POST — create a new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { projects } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

const CreateProjectSchema = z.object({
  clientName:  z.string().min(1).max(200),
  websiteUrl:  z.string().url(),
  industry:    z.string().optional(),
  notes:       z.string().optional(),
});

export async function GET() {
  const rows = await db.select().from(projects)
    .where(eq(projects.status, 'active'))
    .orderBy(desc(projects.createdAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [project] = await db.insert(projects).values({
    ...parsed.data,
    clerkOrgId:  'default',
    clerkUserId: 'default',
  }).returning();

  return NextResponse.json({ project }, { status: 201 });
}
