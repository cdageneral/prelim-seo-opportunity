/**
 * /api/admin/users/[id]  (v7.373)  — owner/admin only
 * PATCH  — update { role?, status?, name?, projectIds?, password? }
 * DELETE — remove a user
 *
 * Lockout guards: the last active owner can't be demoted, suspended, or deleted,
 * and you can't delete yourself.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { appUsers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkAdmin } from '@/lib/auth/access';
import {
  ensureAuthTables, listUsersWithAccess, getUserById, updateUser, setGrants,
  getGrantedProjectIds, insertAudit,
} from '@/lib/auth/store';
import { hashPassword } from '@/lib/auth/passwords';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';

const Patch = z.object({
  role:       z.enum(['owner', 'admin', 'editor', 'viewer']).optional(),
  status:     z.enum(['active', 'suspended']).optional(),
  name:       z.string().min(1).max(120).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
  password:   z.string().min(8).optional(),
});

async function activeOwnerIds(): Promise<string[]> {
  const users = await listUsersWithAccess();
  return users.filter(u => u.role === 'owner' && u.status === 'active').map(u => u.id);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const target = await getUserById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = Patch.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { role, status, name, projectIds, password } = parsed.data;

  // Lockout guard: don't strip the last active owner.
  const owners = await activeOwnerIds();
  const demotingLastOwner =
    target.role === 'owner' &&
    ((role && role !== 'owner') || status === 'suspended') &&
    owners.length <= 1 && owners.includes(target.id);
  if (demotingLastOwner) {
    return NextResponse.json({ error: 'Cannot demote or suspend the last active owner.' }, { status: 400 });
  }

  await updateUser(params.id, {
    role, status, name,
    passwordHash: password ? hashPassword(password) : undefined,
  });
  // Setting a password on a pending user activates them.
  if (password && target.status === 'pending' && !status) {
    await db.update(appUsers).set({ status: 'active' }).where(eq(appUsers.id, params.id));
  }
  if (projectIds) await setGrants(params.id, projectIds);
  // Suspending revokes the user's active sessions is not tracked per-user here;
  // getActiveUser() blocks suspended users on their next request regardless.

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'user.update',
    meta: { targetUserId: params.id, targetEmail: target.email,
            changed: { role, status, name: name ? true : undefined, password: password ? true : undefined,
                       grants: projectIds ? projectIds.length : undefined } },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  const grants = await getGrantedProjectIds(params.id);
  const updated = await getUserById(params.id);
  return NextResponse.json({
    user: updated && {
      id: updated.id, name: updated.name, email: updated.email,
      role: updated.role, status: updated.status, projectIds: grants,
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  const target = await getUserById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const actor = await getCurrentUser();
  if (actor && actor.sub === params.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }
  const owners = await activeOwnerIds();
  if (target.role === 'owner' && owners.length <= 1 && owners.includes(target.id)) {
    return NextResponse.json({ error: 'Cannot delete the last active owner.' }, { status: 400 });
  }

  // grants + sessions cascade via FK ON DELETE CASCADE
  await db.delete(appUsers).where(eq(appUsers.id, params.id));
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'user.delete', meta: { targetUserId: params.id, targetEmail: target.email },
    ip: clientIp(req), userAgent: userAgent(req),
  });
  return NextResponse.json({ ok: true });
}
