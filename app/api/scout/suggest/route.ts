/**
 * POST /api/scout/suggest  (v7.513)
 *   { domain, market }              → Semrush organic competitors for the prospect (10 rows × 40 units)
 *   { domain, market, check }       → one manually typed competitor, checked against Semrush (10 units)
 * A manual competitor with no organic data is reported, never silently accepted
 * and never blocked — the prospect may care about a rival search does not.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireScout } from '@/lib/scout/access';
import { suggestCompetitors, pullOverview, newMeter } from '@/lib/scout/semrushScout';
import { normDomain, isValidDomain, PUBLISHER_DOMAINS } from '@/lib/scout/config';
import { getMarket } from '@/lib/utils/markets';
import { setUsageScout } from '@/lib/usage/context';

const Body = z.object({ domain: z.string().min(3).max(200), market: z.string().max(4).optional(), check: z.string().max(200).optional() });

export async function POST(req: NextRequest) {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  let json: unknown; try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const p = Body.safeParse(json);
  if (!p.success) return NextResponse.json({ error: 'Enter a domain.' }, { status: 400 });
  const domain = normDomain(p.data.domain); const db = getMarket(p.data.market).code;
  if (!isValidDomain(domain)) return NextResponse.json({ error: `"${p.data.domain}" is not a domain. Enter it like example.com.` }, { status: 400 });

  setUsageScout(null);   // v7.514 — Scout spend before a run exists (suggestions + manual check)
  try {
    if (p.data.check) {
      const c = normDomain(p.data.check);
      if (!isValidDomain(c)) return NextResponse.json({ error: `"${p.data.check}" is not a domain.` }, { status: 400 });
      if (c === domain) return NextResponse.json({ error: 'That is the prospect itself.' }, { status: 400 });
      const f = await pullOverview(c, db, newMeter());
      const root = c.split('.').slice(-2).join('.');
      return NextResponse.json({ competitor: { domain: c, organicKeywords: f.organicKeywords, found: f.found, publisher: PUBLISHER_DOMAINS.has(c) || PUBLISHER_DOMAINS.has(root) } });
    }
    const suggestions = await suggestCompetitors(domain, db);
    return NextResponse.json({ domain, suggestions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Semrush request failed' }, { status: 502 });
  }
}
