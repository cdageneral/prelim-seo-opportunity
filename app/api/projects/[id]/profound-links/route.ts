/**
 * /api/projects/[id]/profound-links — v7.547
 *
 * The prompt ↔ owned-URL link store the AI Answer Engines panel builds from the SAME
 * Profound upload it computes its metrics from (lib/profound/pageLinks.ts). Product
 * Insights reads it here to show, per page, the prompts whose answers cite that page
 * (measured) and the prompts filed to that page (assigned).
 *
 * GET    → { links: ProfoundLinkStore | null, updatedAt, hasProfoundData }
 *          hasProfoundData tells Product Insights whether the panel has an upload at all —
 *          "re-upload to link prompts" (metrics exist, links don't) is a different state
 *          from "no Profound export yet" (I.5), and the metrics blob itself is never loaded.
 * PUT    body { links }   → replaces the store (assignments are kept when the new store
 *          carries none and the prompt set still matches — a re-upload of the same export
 *          must not throw away a filing run)
 * DELETE → clears it (the panel's Clear all).
 *
 * Named columns only, own column (Const II.9); auto-migrated ADD COLUMN IF NOT EXISTS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { PAGE_LINKS_VERSION, promptKey, type ProfoundLinkStore } from '@/lib/profound/pageLinks';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

async function ensureLinkColumns() {
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_page_links JSONB`); } catch { /* exists */ }
  try { await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS profound_page_links_updated_at TIMESTAMP`); } catch { /* exists */ }
}

const PutSchema = z.object({
  links: z.object({
    version:     z.number(),
    builtAt:     z.string(),
    sourceFile:  z.string(),
    clientRoot:  z.string(),
    totalRows:   z.number(),
    hasNamedFlag: z.boolean(),
    promptTotal: z.number(),
    prompts:     z.array(z.object({}).passthrough()),
  }).passthrough(),
}).strict();

async function loadRow(id: string) {
  const [row] = await db.select({
    links:     projects.profoundPageLinks,
    updatedAt: projects.profoundPageLinksUpdatedAt,
    hasProfoundData: sql<boolean>`(${projects.profoundData} IS NOT NULL)`,
  }).from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureLinkColumns();
  const row = await loadRow(params.id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ links: (row.links as ProfoundLinkStore | null) ?? null, updatedAt: row.updatedAt ?? null, hasProfoundData: String(row.hasProfoundData) === 'true' }, { headers: NO_STORE });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureLinkColumns();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.links.version !== PAGE_LINKS_VERSION) {
    return NextResponse.json({ error: `Unsupported link-store version ${parsed.data.links.version} (expected ${PAGE_LINKS_VERSION})` }, { status: 400 });
  }
  const incoming = parsed.data.links as unknown as ProfoundLinkStore;

  // Keep a prior filing run when the re-uploaded export still tracks the same prompts.
  const prev = await loadRow(params.id);
  if (!prev) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const prevStore = prev.links as ProfoundLinkStore | null;
  if (!incoming.assignments && prevStore?.assignments) {
    const keys = new Set(incoming.prompts.map(p => promptKey(p.prompt)));
    const kept: NonNullable<ProfoundLinkStore['assignments']> = {};
    for (const [k, a] of Object.entries(prevStore.assignments)) if (keys.has(k)) kept[k] = a;
    if (Object.keys(kept).length > 0) { incoming.assignments = kept; incoming.assignedAt = prevStore.assignedAt; }
  }

  const now = new Date();
  const [updated] = await db.update(projects)
    .set({ profoundPageLinks: incoming as any, profoundPageLinksUpdatedAt: now, updatedAt: now } as any)
    .where(eq(projects.id, params.id))
    .returning({ links: projects.profoundPageLinks, updatedAt: projects.profoundPageLinksUpdatedAt });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ links: updated.links ?? null, updatedAt: updated.updatedAt ?? null, hasProfoundData: true }, { headers: NO_STORE });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureLinkColumns();
  const now = new Date();
  const [updated] = await db.update(projects)
    .set({ profoundPageLinks: null as any, profoundPageLinksUpdatedAt: null as any, updatedAt: now } as any)
    .where(eq(projects.id, params.id))
    .returning({ id: projects.id });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ links: null, updatedAt: null }, { headers: NO_STORE });
}
