/**
 * lib/notices.ts — operator → user broadcast notices (v7.461).
 *
 * Wayne, 2026-08-15: "is there a way to send a message to all users? … a notice
 * with whatever message I enter would appear and when they dismiss or close it
 * then its gone. I need a way to communicate with all users."
 *
 * Shape of the feature:
 *   - An admin writes a notice in the Admin panel (title, body, severity, and an
 *     optional start/end window). Multiple notices can exist at once.
 *   - Every ACTIVE, in-window notice the signed-in user has not dismissed is
 *     returned by listActiveNoticesForUser() and rendered by the app shell.
 *   - Closing one writes ONE dismissal row for THAT user. Dismissal is per user:
 *     one person closing a notice never silences it for anyone else, and it never
 *     comes back for the person who closed it.
 *
 * Const I.1 — every number the Admin panel shows here (seen-by count, who
 * dismissed and when) is a real `notice_dismissals` row, never inferred from a
 * login timestamp or estimated from user counts. A user who has not dismissed is
 * reported as "not yet dismissed", never as a modeled read-rate.
 *
 * Const II.6c — this is an INTERNAL / operator surface. Notices live in the app
 * shell and the Admin panel only. No client deliverable (lib/pdf/*, lib/export/*,
 * app/api/reports/*) may import this module; the retained suite asserts that at
 * the source level.
 */

import { db } from '@/db';
import { notices, noticeDismissals, appUsers } from '@/db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

export type NoticeSeverity = 'info' | 'warning' | 'success';

export const NOTICE_SEVERITIES: NoticeSeverity[] = ['info', 'warning', 'success'];

export function isNoticeSeverity(v: unknown): v is NoticeSeverity {
  return typeof v === 'string' && (NOTICE_SEVERITIES as string[]).includes(v);
}

/** A notice as the app shell shows it to one user. */
export interface UserNotice {
  id:        string;
  title:     string;
  body:      string;
  severity:  NoticeSeverity;
  createdAt: string;
}

/** One read receipt — a real dismissal row. */
export interface NoticeReceipt {
  userId:      string;
  name:        string;
  email:       string;
  dismissedAt: string;
}

/** A notice as the Admin panel shows it, with its measured receipts. */
export interface AdminNotice {
  id:            string;
  title:         string;
  body:          string;
  severity:      NoticeSeverity;
  active:        boolean;
  startsAt:      string | null;
  endsAt:        string | null;
  createdByName: string | null;
  createdAt:     string;
  updatedAt:     string;
  /** Users who have closed it (real rows, newest first). */
  receipts:      NoticeReceipt[];
  /** Active users who have NOT closed it yet — an honest gap, not a read-rate. */
  pending:       { userId: string; name: string; email: string }[];
}

/** True when `now` falls inside the notice's optional start/end window. */
export function inWindow(
  n: { startsAt: Date | string | null; endsAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  if (n.startsAt && new Date(n.startsAt).getTime() > t) return false;
  if (n.endsAt   && new Date(n.endsAt).getTime()   <= t) return false;
  return true;
}

const iso = (d: Date | string | null): string | null =>
  d == null ? null : (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Every active, in-window notice this user has not dismissed — oldest first, so
 * the longest-standing message is read before the newest one.
 */
export async function listActiveNoticesForUser(userId: string): Promise<UserNotice[]> {
  const rows = await db
    .select({
      id: notices.id, title: notices.title, body: notices.body,
      severity: notices.severity, createdAt: notices.createdAt,
      startsAt: notices.startsAt, endsAt: notices.endsAt,
      dismissedAt: noticeDismissals.dismissedAt,
    })
    .from(notices)
    .leftJoin(
      noticeDismissals,
      and(eq(noticeDismissals.noticeId, notices.id), eq(noticeDismissals.userId, userId)),
    )
    .where(and(eq(notices.active, true), isNull(noticeDismissals.dismissedAt)))
    .orderBy(notices.createdAt);

  const now = new Date();
  return rows
    .filter(r => inWindow(r, now))
    .map(r => ({
      id: r.id, title: r.title, body: r.body,
      severity: r.severity as NoticeSeverity,
      createdAt: iso(r.createdAt)!,
    }));
}

/** Every notice with its measured receipts — the Admin manager's list. */
export async function listNoticesForAdmin(): Promise<AdminNotice[]> {
  const rows = await db.select().from(notices).orderBy(desc(notices.createdAt));
  if (!rows.length) return [];

  const [dRows, users] = await Promise.all([
    db.select({
      noticeId: noticeDismissals.noticeId, userId: noticeDismissals.userId,
      dismissedAt: noticeDismissals.dismissedAt,
      name: appUsers.name, email: appUsers.email,
    })
      .from(noticeDismissals)
      .innerJoin(appUsers, eq(appUsers.id, noticeDismissals.userId))
      .orderBy(desc(noticeDismissals.dismissedAt)),
    db.select({ id: appUsers.id, name: appUsers.name, email: appUsers.email, status: appUsers.status })
      .from(appUsers),
  ]);

  const byNotice = new Map<string, NoticeReceipt[]>();
  for (const d of dRows) {
    const list = byNotice.get(d.noticeId) ?? [];
    list.push({ userId: d.userId, name: d.name, email: d.email, dismissedAt: iso(d.dismissedAt)! });
    byNotice.set(d.noticeId, list);
  }
  const activeUsers = users.filter(u => u.status === 'active');

  return rows.map(n => {
    const receipts = byNotice.get(n.id) ?? [];
    const done = new Set(receipts.map(r => r.userId));
    return {
      id: n.id, title: n.title, body: n.body,
      severity: n.severity as NoticeSeverity,
      active: n.active,
      startsAt: iso(n.startsAt), endsAt: iso(n.endsAt),
      createdByName: n.createdByName ?? null,
      createdAt: iso(n.createdAt)!, updatedAt: iso(n.updatedAt)!,
      receipts,
      pending: activeUsers
        .filter(u => !done.has(u.id))
        .map(u => ({ userId: u.id, name: u.name, email: u.email })),
    };
  });
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function createNotice(input: {
  title: string; body: string; severity: NoticeSeverity;
  active: boolean; startsAt: Date | null; endsAt: Date | null;
  createdBy: string | null; createdByName: string | null;
}) {
  const rows = await db.insert(notices).values({
    title: input.title, body: input.body, severity: input.severity,
    active: input.active, startsAt: input.startsAt, endsAt: input.endsAt,
    createdBy: input.createdBy, createdByName: input.createdByName,
  }).returning();
  return rows[0];
}

export async function updateNotice(id: string, patch: {
  title?: string; body?: string; severity?: NoticeSeverity;
  active?: boolean; startsAt?: Date | null; endsAt?: Date | null;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title    !== undefined) set.title    = patch.title;
  if (patch.body     !== undefined) set.body     = patch.body;
  if (patch.severity !== undefined) set.severity = patch.severity;
  if (patch.active   !== undefined) set.active   = patch.active;
  if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
  if (patch.endsAt   !== undefined) set.endsAt   = patch.endsAt;
  const rows = await db.update(notices).set(set).where(eq(notices.id, id)).returning();
  return rows[0] ?? null;
}

export async function deleteNotice(id: string) {
  await db.delete(notices).where(eq(notices.id, id));
}

/**
 * Record that ONE user closed ONE notice. Idempotent — a double-click or a second
 * tab must not create a second receipt (the unique index makes it a no-op).
 */
export async function dismissNotice(noticeId: string, userId: string) {
  await db.execute(sql`
    INSERT INTO notice_dismissals (notice_id, user_id)
    VALUES (${noticeId}::uuid, ${userId}::uuid)
    ON CONFLICT (notice_id, user_id) DO NOTHING
  `);
}

/**
 * Re-send: clear every receipt so the notice appears again for everyone. Used by
 * the Admin "show again to everyone" control — deliberate and explicit, never
 * automatic (a notice the user closed stays closed unless an admin re-sends it).
 */
export async function resetNoticeDismissals(noticeId: string) {
  await db.delete(noticeDismissals).where(eq(noticeDismissals.noticeId, noticeId));
}

export async function getNotice(id: string) {
  const rows = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
  return rows[0] ?? null;
}
