/**
 * /api/projects/[id]/competitors
 * GET  — list competitors for a project
 * POST — add a competitor
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }      from 'zod';
import { db }     from '@/db';
import { competitors } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const AddSchema = z.object({
  domain: z.string().min(1).max(200),
  name:   z.string().max(200).optional(),
});

function normalizeDomain(input: string): string {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return input.replace(/^www\./, '').toLowerCase().trim();
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const rows = await db.select().from(competitors)
    .where(eq(competitors.projectId, params.id));
  return NextResponse.json({ competitors: rows });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const domain = normalizeDomain(parsed.data.domain);

  const [competitor] = await db.insert(competitors).values({
    projectId: params.id,
    domain,
    name: parsed.data.name ?? null,
  }).returning();

  return NextResponse.json({ competitor }, { status: 201 });
}
