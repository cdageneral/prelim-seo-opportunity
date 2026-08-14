/**
 * /api/admin/hours — v7.447 — the editable Hours Saved activity list.
 *
 * GET → { activities, gates, updatedAt, scope }  (gates = the picker catalog)
 * PUT → body { activities }  full-set replace
 *
 * The hours figures are Wayne's business input, not measured data, so they live
 * in a table he owns rather than in a release: changing "LOB SEO Strategy Plan"
 * from 230 to 180 must not require a deploy. What the app measures is whether
 * the deliverable EXISTS — that stays in code, in the fail-closed gate registry.
 *
 * A gate key that is not in the registry is accepted and stored (so a typo is
 * visible rather than silently rewritten) but is never credited — the route
 * reports it back, and Admin shows it in red.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { loadActivities, saveActivities } from '@/lib/hours/store';
import { gateCatalog, getGate } from '@/lib/hours/gates';
import { scopeCeiling, type HoursActivity } from '@/lib/hours/activities';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

const PutSchema = z.object({
  activities: z.array(z.object({
    key:       z.string().min(1).max(80).regex(/^[a-z0-9_]+$/, 'lowercase letters, numbers and underscores only'),
    label:     z.string().min(1).max(200),
    hours:     z.number().int().min(0).max(100000),
    gateKey:   z.string().min(1).max(80),
    group:     z.enum(['base', 'local']),
    sortOrder: z.number().int().min(0).max(100000),
    active:    z.boolean(),
  }).strict()).min(1).max(200),
}).strict();

function payload(activities: HoursActivity[], updatedAt: string | null, seeded: boolean) {
  return {
    activities,
    gates: gateCatalog(),
    scope: scopeCeiling(activities),
    updatedAt,
    usingSeed: seeded,
    unregistered: activities.filter(a => !getGate(a.gateKey)).map(a => a.key),
  };
}

export async function GET() {
  const { activities, updatedAt, seeded } = await loadActivities();
  return NextResponse.json(payload(activities, updatedAt, seeded), { headers: NO_STORE });
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // First key wins on a duplicate — a full-set replace must not half-apply.
  const seen = new Set<string>();
  const list: HoursActivity[] = [];
  for (const a of parsed.data.activities) {
    if (seen.has(a.key)) continue;
    seen.add(a.key);
    list.push({ ...a, label: a.label.trim() });
  }

  await saveActivities(list);
  const { activities, updatedAt, seeded } = await loadActivities();
  return NextResponse.json(payload(activities, updatedAt, seeded), { headers: NO_STORE });
}
