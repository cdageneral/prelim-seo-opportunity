/**
 * /api/projects/[id]/profound-links/answers — v7.569
 *
 * The verbatim AI answers behind every "N answers" count on Product Insights. The AI Answer
 * Engines panel keeps, from the SAME Profound Responses upload it computes its metrics from,
 * each answer that cites one of the client's own pages (lib/profound/pageLinks.ts
 * createLinkAccumulator → answers()). Nothing here is generated: every row is one answer row
 * of the export, with its prompt, run date, engine, brand-mention flag and the owned paths it
 * cites.
 *
 * Own table (answers run to tens of MB — never inside the projects row), named columns
 * (Const II.9), auto-created on first call.
 *
 * POST   { reset?: boolean, answers: [...] } → appends a chunk (reset clears the project first)
 * GET    ?summary=1                          → { total }
 * GET    ?path=&prompt=&offset=&limit=       → { total, answers } newest first, limit ≤ 50
 * DELETE                                     → clears the project's answers
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = { 'Cache-Control': 'no-store, no-transform' } as const;

function rowsOf(res: unknown): Array<Record<string, any>> {
  const r = (res as { rows?: unknown })?.rows ?? res;
  return Array.isArray(r) ? (r as Array<Record<string, any>>) : [];
}

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS profound_answers (
      id          BIGSERIAL PRIMARY KEY,
      project_id  UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      prompt_key  TEXT      NOT NULL,
      prompt      TEXT      NOT NULL,
      run_date    TEXT,
      platform    TEXT,
      mentioned   BOOLEAN,
      owned_paths JSONB     NOT NULL DEFAULT '[]'::jsonb,
      response    TEXT      NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS profound_answers_project_idx ON profound_answers (project_id, prompt_key)`);
  ensured = true;
}

const Answer = z.object({
  pk:        z.string().min(1),
  prompt:    z.string(),
  date:      z.string(),
  platform:  z.string(),
  mentioned: z.boolean().nullable(),
  paths:     z.array(z.string()),
  response:  z.string(),
});
const PostSchema = z.object({ reset: z.boolean().optional(), answers: z.array(Answer).max(1000) }).strict();

const exists = async (id: string) =>
  rowsOf(await db.execute(sql`SELECT 1 FROM projects WHERE id = ${id} LIMIT 1`)).length > 0;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureTable();
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!(await exists(params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (parsed.data.reset) await db.execute(sql`DELETE FROM profound_answers WHERE project_id = ${params.id}`);
  const rows = parsed.data.answers.map(a => ({
    prompt_key: a.pk, prompt: a.prompt, run_date: a.date || null, platform: a.platform || null,
    mentioned: a.mentioned, owned_paths: a.paths, response: a.response,
  }));
  if (rows.length > 0) {
    await db.execute(sql`
      INSERT INTO profound_answers (project_id, prompt_key, prompt, run_date, platform, mentioned, owned_paths, response)
      SELECT ${params.id}::uuid, x.prompt_key, x.prompt, x.run_date, x.platform, x.mentioned, COALESCE(x.owned_paths, '[]'::jsonb), x.response
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
        AS x(prompt_key text, prompt text, run_date text, platform text, mentioned boolean, owned_paths jsonb, response text)
    `);
  }
  return NextResponse.json({ ok: true, inserted: rows.length }, { headers: NO_STORE });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureTable();
  const u = new URL(req.url);
  if (u.searchParams.get('summary')) {
    const r = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS n FROM profound_answers WHERE project_id = ${params.id}`))[0];
    return NextResponse.json({ total: Number(r?.n ?? 0) }, { headers: NO_STORE });
  }
  const path = (u.searchParams.get('path') ?? '').trim();
  const pk = (u.searchParams.get('prompt') ?? '').trim();
  const offset = Math.max(0, parseInt(u.searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(u.searchParams.get('limit') ?? '20', 10) || 20));
  const pathCond = path ? sql`AND owned_paths @> ${JSON.stringify([path])}::jsonb` : sql``;
  const pkCond = pk ? sql`AND prompt_key = ${pk}` : sql``;
  const totalRow = rowsOf(await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM profound_answers WHERE project_id = ${params.id} ${pathCond} ${pkCond}`))[0];
  const answers = rowsOf(await db.execute(sql`
    SELECT prompt_key, prompt, run_date, platform, mentioned, owned_paths, response
    FROM profound_answers WHERE project_id = ${params.id} ${pathCond} ${pkCond}
    ORDER BY run_date DESC NULLS LAST, id ASC OFFSET ${offset} LIMIT ${limit}`)).map(r => ({
      pk: String(r.prompt_key), prompt: String(r.prompt), date: r.run_date ?? '', platform: r.platform ?? '',
      mentioned: r.mentioned === null || r.mentioned === undefined ? null : !!r.mentioned,
      paths: Array.isArray(r.owned_paths) ? r.owned_paths : [], response: String(r.response ?? ''),
    }));
  return NextResponse.json({ total: Number(totalRow?.n ?? 0), answers }, { headers: NO_STORE });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureTable();
  await db.execute(sql`DELETE FROM profound_answers WHERE project_id = ${params.id}`);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
