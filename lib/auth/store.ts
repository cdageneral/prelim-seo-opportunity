/**
 * lib/auth/store.ts — auth data access + runtime table creation (v7.373).
 *
 * The app builds with `next build` only (no drizzle-kit push), so — exactly like
 * the projects table's ensureColumns() pattern — the auth tables are created at
 * runtime with CREATE TABLE IF NOT EXISTS. Every auth/admin route calls
 * ensureAuthTables() before touching these tables. All statements are idempotent.
 */

import { db } from '@/db';
import { appUsers, projectAccess, authSessions, auditEvents, projects } from '@/db/schema';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Role, UserStatus } from './config';

let ensured = false;

export async function ensureAuthTables(): Promise<void> {
  if (ensured) return;
  // Enums (guard against duplicate_object so re-runs are safe).
  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('owner','admin','editor','viewer');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  await db.execute(sql`DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active','pending','suspended');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS app_users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    name          text NOT NULL,
    password_hash text,
    role          user_role   NOT NULL DEFAULT 'viewer',
    status        user_status NOT NULL DEFAULT 'active',
    created_at    timestamp   NOT NULL DEFAULT now(),
    last_login_at timestamp
  )`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS project_access (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS project_access_user_project_uq
    ON project_access(user_id, project_id)`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS auth_sessions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at timestamp NOT NULL DEFAULT now(),
    expires_at timestamp NOT NULL,
    revoked_at timestamp,
    ip         text,
    user_agent text
  )`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS audit_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid,
    actor_email   text,
    actor_name    text,
    action        text NOT NULL,
    project_id    uuid,
    project_name  text,
    meta          jsonb,
    ip            text,
    user_agent    text,
    created_at    timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC)`);

  ensured = true;
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function countUsers(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(appUsers);
  return rows[0]?.n ?? 0;
}

export async function getUserByEmail(email: string) {
  const rows = await db.select().from(appUsers).where(eq(appUsers.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function getUserById(id: string) {
  const rows = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(input: {
  name: string; email: string; role: Role; status: UserStatus; passwordHash?: string | null;
}) {
  const [row] = await db.insert(appUsers).values({
    name:         input.name,
    email:        input.email.toLowerCase(),
    role:         input.role,
    status:       input.status,
    passwordHash: input.passwordHash ?? null,
  }).returning();
  return row;
}

export async function updateUser(id: string, patch: {
  role?: Role; status?: UserStatus; name?: string; passwordHash?: string | null;
}) {
  const set: Record<string, unknown> = {};
  if (patch.role   !== undefined) set.role = patch.role;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.name   !== undefined) set.name = patch.name;
  if (patch.passwordHash !== undefined) set.passwordHash = patch.passwordHash;
  if (Object.keys(set).length === 0) return;
  await db.update(appUsers).set(set).where(eq(appUsers.id, id));
}

export async function setLastLogin(id: string) {
  await db.update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, id));
}

/** All users with their granted project ids (owner/admin implicitly see all). */
export async function listUsersWithAccess() {
  const users = await db.select().from(appUsers).orderBy(desc(appUsers.createdAt));
  const grants = await db.select().from(projectAccess);
  const byUser = new Map<string, string[]>();
  for (const g of grants) {
    const list = byUser.get(g.userId) ?? [];
    list.push(g.projectId);
    byUser.set(g.userId, list);
  }
  return users.map(u => ({
    id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
    projectIds: byUser.get(u.id) ?? [],
  }));
}

// ─── Grants ─────────────────────────────────────────────────────────────────

export async function getGrantedProjectIds(userId: string): Promise<string[]> {
  const rows = await db.select({ p: projectAccess.projectId }).from(projectAccess).where(eq(projectAccess.userId, userId));
  return rows.map(r => r.p);
}

/** Replace a user's grant set with exactly `projectIds`. */
export async function setGrants(userId: string, projectIds: string[]) {
  const current = await getGrantedProjectIds(userId);
  const want = new Set(projectIds);
  const have = new Set(current);
  const toAdd = projectIds.filter(p => !have.has(p));
  const toRemove = current.filter(p => !want.has(p));
  if (toAdd.length) {
    await db.insert(projectAccess)
      .values(toAdd.map(p => ({ userId, projectId: p })))
      .onConflictDoNothing();
  }
  if (toRemove.length) {
    await db.delete(projectAccess).where(and(eq(projectAccess.userId, userId), inArray(projectAccess.projectId, toRemove)));
  }
}

export async function hasProjectAccess(userId: string, projectId: string): Promise<boolean> {
  const rows = await db.select({ id: projectAccess.id }).from(projectAccess)
    .where(and(eq(projectAccess.userId, userId), eq(projectAccess.projectId, projectId))).limit(1);
  return rows.length > 0;
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(userId: string, expiresAt: Date, ip?: string, userAgent?: string): Promise<string> {
  const [row] = await db.insert(authSessions)
    .values({ userId, expiresAt, ip: ip ?? null, userAgent: userAgent ?? null })
    .returning({ id: authSessions.id });
  return row.id;
}

export async function revokeSession(sid: string) {
  if (!sid) return;
  await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, sid));
}

/** A session is usable only if it exists, is not revoked, and has not expired. */
export async function isSessionActive(sid: string): Promise<boolean> {
  if (!sid) return false;
  const rows = await db.select({ id: authSessions.id }).from(authSessions)
    .where(and(eq(authSessions.id, sid), isNull(authSessions.revokedAt), sql`${authSessions.expiresAt} > now()`))
    .limit(1);
  return rows.length > 0;
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export async function insertAudit(row: {
  actorUserId?: string | null; actorEmail?: string | null; actorName?: string | null;
  action: string; projectId?: string | null; projectName?: string | null;
  meta?: Record<string, unknown> | null; ip?: string | null; userAgent?: string | null;
}) {
  await db.insert(auditEvents).values({
    actorUserId: row.actorUserId ?? null,
    actorEmail:  row.actorEmail  ?? null,
    actorName:   row.actorName   ?? null,
    action:      row.action,
    projectId:   row.projectId   ?? null,
    projectName: row.projectName ?? null,
    meta:        row.meta ?? null,
    ip:          row.ip ?? null,
    userAgent:   row.userAgent ?? null,
  });
}

export async function listAudit(opts: { limit?: number; action?: string } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const where = opts.action && opts.action !== 'all'
    ? eq(auditEvents.action, opts.action)
    : undefined;
  const q = db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
  const rows = where ? await q.where(where) : await q;
  return rows;
}

/** Resolve project names for a set of ids (used to label grants/audit in the UI). */
export async function projectNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await db.select({ id: projects.id, name: projects.clientName }).from(projects).where(inArray(projects.id, ids));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.id] = r.name;
  return map;
}
