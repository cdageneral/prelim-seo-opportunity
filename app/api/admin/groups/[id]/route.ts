/**
 * /api/admin/groups/[id]  (v7.418)  — owner/admin only
 * PATCH  — update { name?, memberIds?, projectIds? }
 * DELETE — remove the group (members and project grants cascade; the users
 *          themselves are untouched and keep any direct grants they hold)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAdmin } from '@/lib/auth/access';
import {
  ensureAuthTables, getGroupById, getGroupByName, renameGroup, deleteGroup,
  setGroupMembers, setGroupGrants, listGroupsWithDetail, insertAudit,
} from '@/lib/auth/store';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';

const Patch = z.object({
  name:       z.string().min(1).max(80).optional(),
  memberIds:  z.array(z.string().uuid()).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const target = await getGroupById(params.id);
  if (!target) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = Patch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { name, memberIds, projectIds } = parsed.data;

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) return NextResponse.json({ error: 'Group name is required.' }, { status: 400 });
    const clash = await getGroupByName(trimmed);
    if (clash && clash.id !== params.id) {
      return NextResponse.json({ error: 'A group with that name already exists.' }, { status: 409 });
    }
    if (trimmed !== target.name) await renameGroup(params.id, trimmed);
  }
  if (memberIds)  await setGroupMembers(params.id, memberIds);
  if (projectIds) await setGroupGrants(params.id, projectIds);

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'group.update',
    meta: {
      groupId: params.id, groupName: name?.trim() || target.name,
      changed: {
        name:    name !== undefined ? true : undefined,
        members: memberIds  ? memberIds.length  : undefined,
        grants:  projectIds ? projectIds.length : undefined,
      },
    },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  const groups = await listGroupsWithDetail();
  const updated = groups.find(g => g.id === params.id) ?? null;
  return NextResponse.json({ group: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const target = await getGroupById(params.id);
  if (!target) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  await deleteGroup(params.id);

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'group.delete',
    meta: { groupId: params.id, groupName: target.name },
    ip: clientIp(req), userAgent: userAgent(req),
  });
  return NextResponse.json({ ok: true });
}
