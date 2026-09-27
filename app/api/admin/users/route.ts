/**
 * /api/admin/users  (v7.373)  — owner/admin only
 * GET  — list users with their role, status, grants, last login
 * POST — create/invite a user { name, email, role, projectIds[], password?, products? }
 *        v7.524: products = { orbit, scout, cap? } sets Orbit / Scout access at creation.
 *
 * All project names are returned alongside so the admin UI can label grants.
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
  ensureAuthTables, listUsersWithAccess, createUser, setGrants, insertAudit, getUserByEmail,
} from '@/lib/auth/store';
import { hashPassword } from '@/lib/auth/passwords';
import { getCurrentUser } from '@/lib/auth/session';
import { clientIp, userAgent } from '@/lib/auth/audit';
import { upsertProductRow } from '@/lib/scout/store';
import { DEFAULT_DAILY_CAP } from '@/lib/scout/config';

const CreateUser = z.object({
  name:       z.string().min(1).max(120),
  email:      z.string().email(),
  role:       z.enum(['admin', 'editor', 'viewer']), // owner is not assignable here
  projectIds: z.array(z.string().uuid()).optional().default([]),
  password:   z.string().min(8).optional(),
  // v7.524: which products the new account may open (same rules as PATCH /api/admin/products).
  // Omitted = the old behaviour (no row → Orbit on, Scout off). Ignored for admins, who always have both.
  products:   z.object({
    orbit: z.boolean(),
    scout: z.boolean(),
    cap:   z.number().int().min(0).max(200).optional(),
  }).optional(),
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
  const [users, allProjects] = await Promise.all([listUsersWithAccess(), projectList()]);
  return NextResponse.json({ users, projects: allProjects });
}

export async function POST(req: NextRequest) {
  const gate = await checkAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: gate.status });
  await ensureAuthTables();

  let json: unknown;
  try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = CreateUser.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { name, email, role, projectIds, password, products } = parsed.data;
  if (products && role !== 'admin' && !products.orbit && !products.scout) {
    return NextResponse.json({ error: 'Give the user at least one product — Orbit, Scout, or both.' }, { status: 400 });
  }

  if (await getUserByEmail(email)) {
    return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 });
  }

  // With a password the account is immediately usable; without one it is
  // 'pending' until an admin sets a password (no email service in v1).
  const user = await createUser({
    name, email, role,
    status: password ? 'active' : 'pending',
    passwordHash: password ? hashPassword(password) : null,
  });
  if (projectIds.length) await setGrants(user.id, projectIds);
  const productAccess = products && role !== 'admin'
    ? { orbit: products.orbit, scout: products.scout, cap: products.cap ?? DEFAULT_DAILY_CAP }
    : null;
  if (productAccess) await upsertProductRow(user.id, productAccess);

  const actor = await getCurrentUser();
  await insertAudit({
    actorUserId: actor?.sub, actorEmail: actor?.email, actorName: actor?.name,
    action: 'user.invite',
    meta: { targetUserId: user.id, targetEmail: user.email, role, grants: projectIds.length, ...(productAccess ? { products: productAccess } : {}) },
    ip: clientIp(req), userAgent: userAgent(req),
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, projectIds, products: productAccess },
  }, { status: 201 });
}
