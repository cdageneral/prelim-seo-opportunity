/**
 * /api/admin/groups  (v7.418)  — owner/admin only
 * GET  — list groups with their members and project grants (plus the user and
 *        project rosters the admin UI needs to label and toggle them)
 * POST — create a group { name, memberIds[], projectIds[] }
 *
 * A group carries NO role of its own: membership only widens WHICH projects a
 * user can see; what they can do there still comes from their individual role.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { checkAdmin } from '@/lib/auth/access';
import {
  ensureAuthTables, listGroupsWithDetail, listUsersWithAccess, createGroup,
  getGroupByName, setGroupMembers, setGroupGrants, insertAudit,
} from '@/lib/auth/store';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';

const CreateGroup = z.object({
  name:       z.string().min(1).max(80),
  memberIds:  z.array(z.string().uuid()).optional().default([]),
  projectIds: z.array(z.string().uuid()).optional().default([]),
});

async function projectList() {
  const rows = await db.select({ id: projects.id, name: projects.clientName, url: projects.websiteUrl })
    .from(projects).orderBy(desc(projects.updatedAt));
  return rows;
}

export async function GET() {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();
  const [groups, users, allProjects] = await Promise.all([
    listGroupsWithDetail(), listUsersWithAccess(), projectList(),
  ]);
  return NextResponse.json({
    groups,
    users: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status })),
    projects: allProjects,
  });
}

export async function POST(req: NextRequest) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = CreateGroup.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { name, memberIds, projectIds } = parsed.data;

  const trimmed = name.trim();
  if (!trimmed) return NextResponse.json({ error: 'Group name is required.' }, { status: 400 });
  if (await getGroupByName(trimmed)) {
    return NextResponse.json({ error: 'A group with that name already exists.' }, { status: 409 });
  }

  const group = await createGroup(trimmed);
  if (memberIds.length)  await setGroupMembers(group.id, memberIds);
  if (projectIds.length) await setGroupGrants(group.id, projectIds);

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'group.create',
    meta: { groupId: group.id, groupName: group.name, members: memberIds.length, grants: projectIds.length },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({
    group: { id: group.id, name: group.name, createdAt: group.createdAt, memberIds, projectIds },
  }, { status: 201 });
}
