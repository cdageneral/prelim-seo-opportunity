/**
 * /api/scout/runs  (v7.513)
 * GET  — the caller's runs (admins: everyone's). Blob-free column list (Const II.9).
 * POST — validate + create a queued run. Spends nothing: the client then calls
 *        /api/scout/runs/[id]/execute, which claims the row atomically.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireScout, usedToday } from '@/lib/scout/access';
import { createRun, listRuns } from '@/lib/scout/store';
import { MAX_COMPETITORS, MAX_PRODUCTS, normDomain, isValidDomain, getIndustry } from '@/lib/scout/config';
import { getMarket } from '@/lib/utils/markets';
import { recordEvent } from '@/lib/auth/audit';

const Body = z.object({
  domain:      z.string().min(3).max(200),
  market:      z.string().max(4).optional(),
  industry:    z.string().max(40).optional(),
  scope:       z.enum(['domain', 'products']),
  products:    z.array(z.string().min(2).max(60)).max(MAX_PRODUCTS).optional().default([]),
  competitors: z.array(z.object({ domain: z.string().min(3).max(200), manual: z.boolean().optional().default(false) })).min(1).max(MAX_COMPETITORS),
});

export async function GET() {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  const runs = await listRuns({ userId: g.user?.sub ?? null, all: g.isAdmin });
  return NextResponse.json({ runs });
}

export async function POST(req: NextRequest) {
  const g = await requireScout();
  if (!g.ok) return NextResponse.json({ error: g.reason }, { status: g.status });
  let json: unknown; try { json = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const p = Body.safeParse(json);
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  const domain = normDomain(p.data.domain);
  if (!isValidDomain(domain)) return NextResponse.json({ error: `"${p.data.domain}" is not a domain.` }, { status: 400 });
  const seen = new Set<string>([domain]);
  const competitors: Array<{ domain: string; manual: boolean }> = [];
  for (const c of p.data.competitors) {
    const d = normDomain(c.domain);
    if (!isValidDomain(d)) return NextResponse.json({ error: `"${c.domain}" is not a domain.` }, { status: 400 });
    if (seen.has(d)) continue;
    seen.add(d); competitors.push({ domain: d, manual: !!c.manual });
  }
  if (!competitors.length) return NextResponse.json({ error: 'Pick at least one competitor.' }, { status: 400 });
  const products = p.data.scope === 'products' ? Array.from(new Set(p.data.products.map(s => s.trim()).filter(Boolean))) : [];
  if (p.data.scope === 'products' && !products.length) return NextResponse.json({ error: 'Add at least one product, or switch to Full domain.' }, { status: 400 });

  if (g.access.cap !== null && g.user) {
    const used = await usedToday(g.user.sub);
    if (used >= g.access.cap) return NextResponse.json({ error: `You have used ${used} of your ${g.access.cap} Scout runs for the last 24 hours. An admin can raise the cap.` }, { status: 429 });
  }

  const id = await createRun({
    userId: g.user?.sub ?? null, userName: g.user?.name ?? null, userEmail: g.user?.email ?? null,
    domain, market: getMarket(p.data.market).code, industry: getIndustry(p.data.industry).key,
    scope: p.data.scope, products, competitors,
  });
  await recordEvent(req, { action: 'scout.run', meta: { runId: id, domain, scope: p.data.scope, competitors: competitors.map(c => c.domain) } });
  return NextResponse.json({ id }, { status: 201 });
}
