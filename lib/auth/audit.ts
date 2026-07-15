/**
 * lib/auth/audit.ts — the activity-log writer (v7.373).
 *
 * Every row is a REAL event (Const I.1). recordEvent() attributes the action to
 * the signed-in user (from the session cookie) and captures ip / user-agent from
 * the request. It NEVER throws — a logging failure must not break a user action —
 * and it skips silently when there is no signed-in user to attribute (e.g. before
 * the owner account exists, or with the wall off and nobody logged in).
 *
 * Login/logout are recorded explicitly by the auth routes (where the actor is
 * known even though recordEvent's cookie may not be set yet); everything else
 * (project.open / create / edit, user.invite / update) flows through here.
 */

import type { NextRequest } from 'next/server';
import { ensureAuthTables, insertAudit } from './store';
import { getCurrentUser } from './session';

export function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export function userAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent');
}

export async function recordEvent(
  req: NextRequest,
  ev: { action: string; projectId?: string | null; projectName?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return; // nothing to attribute — don't log an anonymous row
    await ensureAuthTables();
    await insertAudit({
      actorUserId: user.sub,
      actorEmail:  user.email,
      actorName:   user.name,
      action:      ev.action,
      projectId:   ev.projectId ?? null,
      projectName: ev.projectName ?? null,
      meta:        ev.meta ?? null,
      ip:          clientIp(req),
      userAgent:   userAgent(req),
    });
  } catch {
    /* logging must never break the underlying action */
  }
}
