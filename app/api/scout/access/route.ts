/**
 * GET /api/scout/access  (v7.513)
 * What the signed-in user may open (Orbit / Scout), their daily Scout cap and how
 * many runs they have used in the last 24 hours. The dashboard reads this to send
 * a Scout-only user to /scout; the Scout screen reads it to show the run counter.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { resolveAccess, usedToday } from '@/lib/scout/access';
import { medianRunSeconds } from '@/lib/scout/store';
import { INDUSTRIES, MAX_COMPETITORS, MAX_PRODUCTS } from '@/lib/scout/config';
import { MARKETS } from '@/lib/utils/markets';
import { SCOUT_MARKETS, SCOUT_TOP_MARKETS } from '@/lib/scout/markets';
import { aiReadAvailable } from '@/lib/scout/aiRead';

export async function GET() {
  const g = await resolveAccess();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  let used = 0; let timing: { seconds: number; runs: number } | null = null;
  try { used = await usedToday(g.user?.sub ?? null); timing = await medianRunSeconds(); } catch { /* tables not reachable — counters stay 0 */ }
  return NextResponse.json({
    user: g.user ? { id: g.user.sub, name: g.user.name, role: g.user.role } : null,
    orbit: g.access.orbit, scout: g.access.scout, cap: g.access.cap, usedToday: used, isAdmin: g.isAdmin, canWrite: g.canWrite,
    timing, aiRead: aiReadAvailable(),
    // v7.515 — 4 competitors; the screen prices the real count with lib/scout/config unitCeiling().
    limits: { competitors: MAX_COMPETITORS, products: MAX_PRODUCTS },
    industries: INDUSTRIES.map(i => ({ key: i.key, label: i.label })),
    // v7.545 — every Semrush country database. `top` = listed first; `orbit` = an Orbit project can be
    // created in this market (Convert is offered only then — Orbit's SERP scans support MARKETS only).
    markets: SCOUT_MARKETS.map(m => ({ code: m.code, label: m.label, top: (SCOUT_TOP_MARKETS as readonly string[]).includes(m.code), orbit: MARKETS.some(o => o.code === m.code) })),
  });
}
