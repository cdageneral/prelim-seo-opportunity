/**
 * /api/projects/[id]/competitors/[cid]
 *
 * PATCH  — v7.101: edit a competitor's domain / name.
 *           If the domain changes, uploaded keyword rows (project_keywords)
 *           tagged with the old domain are re-tagged to the new domain so
 *           CSV data follows the competitor.
 * DELETE — remove a competitor. v7.101: also deletes that competitor's
 *           uploaded keyword rows (source csv/custom, matching domain) so
 *           no orphaned rows keep feeding Competitor Gap / Share of Voice.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z }   from 'zod';
import { db }  from '@/db';
import { competitors, projectKeywords } from '@/db/schema';
import { eq, and, inArray, ne } from 'drizzle-orm';

function normalizeDomain(input: string): string {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return input.replace(/^www\./, '').toLowerCase().trim();
  }
}

const PatchSchema = z.object({
  domain: z.string().min(1).max(200).optional(),
  name:   z.string().max(200).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; cid: string } }
) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid fields' }, { status: 400 });
  }

  const [existing] = await db.select().from(competitors)
    .where(and(eq(competitors.id, params.cid), eq(competitors.projectId, params.id)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
  }

  const newDomain = parsed.data.domain !== undefined
    ? normalizeDomain(parsed.data.domain)
    : existing.domain;

  // Prevent renaming onto another tracked competitor
  if (newDomain !== existing.domain) {
    const dup = await db.select().from(competitors)
      .where(and(
        eq(competitors.projectId, params.id),
        eq(competitors.domain, newDomain),
        ne(competitors.id, params.cid),
      ))
      .limit(1);
    if (dup.length > 0) {
      return NextResponse.json({ error: 'Another tracked competitor already uses this domain.' }, { status: 409 });
    }
  }

  const [updated] = await db.update(competitors)
    .set({
      domain: newDomain,
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    })
    .where(and(eq(competitors.id, params.cid), eq(competitors.projectId, params.id)))
    .returning();

  // Move uploaded keyword rows to the new domain so CSV data follows the rename
  let movedKeywords = 0;
  if (newDomain !== existing.domain) {
    const moved = await db.update(projectKeywords)
      .set({ domain: newDomain })
      .where(and(
        eq(projectKeywords.projectId, params.id),
        eq(projectKeywords.domain, existing.domain),
        inArray(projectKeywords.source, ['csv', 'custom']),
      ))
      .returning({ id: projectKeywords.id });
    movedKeywords = moved.length;
  }

  return NextResponse.json({ competitor: updated, movedKeywords });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; cid: string } }
) {
  // Look up the competitor first so we can clear its uploaded keyword rows
  const [existing] = await db.select().from(competitors)
    .where(and(eq(competitors.id, params.cid), eq(competitors.projectId, params.id)))
    .limit(1);

  let deletedKeywords = 0;
  if (existing) {
    const deleted = await db.delete(projectKeywords)
      .where(and(
        eq(projectKeywords.projectId, params.id),
        eq(projectKeywords.domain, existing.domain),
        inArray(projectKeywords.source, ['csv', 'custom']),
      ))
      .returning({ id: projectKeywords.id });
    deletedKeywords = deleted.length;
  }

  await db.delete(competitors)
    .where(and(eq(competitors.id, params.cid), eq(competitors.projectId, params.id)));

  return NextResponse.json({ success: true, deletedKeywords });
}
