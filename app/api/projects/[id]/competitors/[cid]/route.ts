/**
 * DELETE /api/projects/[id]/competitors/[cid]
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }  from '@/db';
import { competitors } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; cid: string } }
) {
  await db.delete(competitors)
    .where(and(eq(competitors.id, params.cid), eq(competitors.projectId, params.id)));
  return NextResponse.json({ success: true });
}
