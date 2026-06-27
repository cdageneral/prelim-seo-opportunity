/**
 * GET  /api/projects/[id]/usage  — per-project API credit ledger summary (v7.225)
 * POST /api/projects/[id]/usage  — set/clear a manual reconciliation baseline
 *
 * GET returns real, measured consumption for THIS project, grouped by provider
 * + native unit, split into live usage vs. a manual baseline anchor, with the
 * last-activity timestamp (Art. IV.5) and the most recent itemized calls.
 *
 * POST body: { provider, unit, quantity, note? } upserts a per-provider baseline
 * (kind='baseline') so the in-app total can reflect spend that happened before
 * this ledger existed — entered from the user's real provider dashboard, never
 * modeled. quantity <= 0 clears the baseline for that provider+unit.
 *
 * Fault-tolerant: if the api_usage table isn't migrated yet, GET returns an
 * empty ledger rather than erroring. v7.305: both GET and POST first ensure the
 * table exists, so opening the panel or saving a baseline self-heals a
 * never-migrated ledger instead of silently failing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { apiUsage } from '@/db/schema';
import { and, eq, sql, desc, isNotNull } from 'drizzle-orm';
import { ensureUsageTable } from '@/lib/usage/record';

export const dynamic = 'force-dynamic';

interface ProviderLine {
  provider:  string;
  unit:      string;
  usage:     number;   // measured live consumption
  baseline:  number;   // manual reconciliation anchor
  total:     number;   // usage + baseline
  calls:     number;   // number of billed calls recorded
  rows:      number;   // rows returned (Semrush) — provenance
  lastActivity: string | null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  try {
    await ensureUsageTable();   // v7.305: self-heal a never-migrated ledger table
    const grouped = await db
      .select({
        provider: apiUsage.provider,
        unit:     apiUsage.unit,
        kind:     apiUsage.kind,
        quantity: sql<number>`coalesce(sum(${apiUsage.quantity}), 0)`,
        calls:    sql<number>`count(*)`,
        rows:     sql<number>`coalesce(sum(${apiUsage.rows}), 0)`,
        last:     sql<string | null>`max(${apiUsage.createdAt})`,
      })
      .from(apiUsage)
      .where(eq(apiUsage.projectId, projectId))
      .groupBy(apiUsage.provider, apiUsage.unit, apiUsage.kind);

    const map = new Map<string, ProviderLine>();
    for (const r of grouped) {
      const key = `${r.provider}|${r.unit}`;
      const line = map.get(key) ?? {
        provider: r.provider, unit: r.unit,
        usage: 0, baseline: 0, total: 0, calls: 0, rows: 0, lastActivity: null,
      };
      const qty = Number(r.quantity) || 0;
      if (r.kind === 'baseline') {
        line.baseline += qty;
      } else {
        line.usage += qty;
        line.calls += Number(r.calls) || 0;
        line.rows  += Number(r.rows) || 0;
        const last = r.last ? new Date(r.last).toISOString() : null;
        if (last && (!line.lastActivity || last > line.lastActivity)) line.lastActivity = last;
      }
      line.total = line.usage + line.baseline;
      map.set(key, line);
    }

    const providers = Array.from(map.values()).sort((a, b) =>
      a.provider === b.provider ? a.unit.localeCompare(b.unit) : a.provider.localeCompare(b.provider),
    );

    // Most recent itemized calls (provenance for the totals above).
    const recent = await db
      .select({
        provider: apiUsage.provider, endpoint: apiUsage.endpoint, unit: apiUsage.unit,
        quantity: apiUsage.quantity, rows: apiUsage.rows, rate: apiUsage.rate,
        keyHash: apiUsage.keyHash, kind: apiUsage.kind, createdAt: apiUsage.createdAt,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.projectId, projectId), isNotNull(apiUsage.createdAt)))
      .orderBy(desc(apiUsage.createdAt))
      .limit(25);

    const lastActivity = providers.reduce<string | null>(
      (acc, p) => (p.lastActivity && (!acc || p.lastActivity > acc) ? p.lastActivity : acc), null,
    );

    return NextResponse.json({
      projectId,
      asOf: new Date().toISOString(),
      lastActivity,
      providers,
      recent: recent.map(r => ({ ...r, createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null })),
    });
  } catch (err) {
    // Table not migrated yet, or DB hiccup — honest empty ledger, not an error.
    console.warn('[OrbitIQ usage] project summary failed:', (err as any)?.message ?? err);
    return NextResponse.json({
      projectId, asOf: new Date().toISOString(), lastActivity: null,
      providers: [], recent: [],
      note: 'Usage ledger is empty or not yet migrated. It populates as API calls are made on this version.',
    });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty ok */ }

  const provider = String(body?.provider ?? '').trim();
  const unit     = String(body?.unit ?? '').trim();
  const quantity = Math.round(Number(body?.quantity) || 0);
  const note     = body?.note ? String(body.note).slice(0, 280) : null;

  if (!provider || !unit) {
    return NextResponse.json({ error: 'provider and unit are required' }, { status: 400 });
  }

  try {
    await ensureUsageTable();   // v7.305: self-heal a never-migrated ledger table
    // Upsert semantics: a baseline is a single anchor per provider+unit, so clear
    // any prior baseline rows for this combination before inserting the new one.
    await db.delete(apiUsage).where(and(
      eq(apiUsage.projectId, projectId),
      eq(apiUsage.provider, provider),
      eq(apiUsage.unit, unit),
      eq(apiUsage.kind, 'baseline'),
    ));
    if (quantity > 0) {
      await db.insert(apiUsage).values({
        projectId, provider, unit, quantity,
        endpoint: 'baseline', kind: 'baseline',
        meta: { note: note ?? 'manual reconciliation baseline', enteredAt: new Date().toISOString() },
      });
    }
    return NextResponse.json({ ok: true, provider, unit, quantity });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save baseline: ${(err as any)?.message ?? err}` },
      { status: 500 },
    );
  }
}
