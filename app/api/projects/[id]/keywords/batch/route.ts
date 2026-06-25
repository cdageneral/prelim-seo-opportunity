/**
 * POST /api/projects/[id]/keywords/batch
 *
 * Bulk-inserts keyword footprint rows for a domain (client or competitor).
 * Used by the "Upload footprints" flow in the project page.
 *
 * Body: {
 *   domain:   string,               // client domain or competitor domain
 *   source:   'csv',
 *   keywords: Array<{
 *     keyword:      string,
 *     searchVolume: number,
 *     position?:    number,
 *     serpFeatures?: string,   // v7.103: raw "SERP Features by Keyword" cell from Semrush export
 *   }>
 * }
 *
 * Returns: { inserted: number, updated: number, skipped: number }
 *
 * v7.31 — new endpoint for uploaded keyword footprints
 * v7.92 — UPSERT semantics: re-uploading a keyword that already exists for the
 *         same domain UPDATES its searchVolume/position/type instead of being
 *         skipped. Required so corrected CSVs can repair rows stored before
 *         header-aware parsing (rank positions had been saved as volumes).
 *         Duplicate check is now per-domain (was per-source only, which also
 *         blocked the same keyword from existing under two competitors).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }              from '@/db';
import { projectKeywords, projects } from '@/db/schema';
import { and, eq, sql, or, isNull, inArray, ne }   from 'drizzle-orm';

async function ensureTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_keywords (
        id            SERIAL    PRIMARY KEY,
        project_id    UUID      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        keyword       TEXT      NOT NULL,
        search_volume INTEGER   NOT NULL DEFAULT 0,
        position      INTEGER,
        type          TEXT      NOT NULL DEFAULT 'gap',
        branded       BOOLEAN   NOT NULL DEFAULT false,
        source        TEXT      NOT NULL,
        domain        TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS domain TEXT
    `);
    // v7.103: raw Semrush "SERP Features by Keyword" cell (comma-separated
    // feature names, e.g. "AI Overview, People also ask, Video"). NULL = the
    // upload had no SERP Features column (unknown, NOT "no features").
    await db.execute(sql`
      ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS serp_features TEXT
    `);
    // v7.251: real ranking/landing URL from the uploaded CSV (Semrush "URL" column).
    await db.execute(sql`
      ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS url TEXT
    `);
  } catch {
    // Safe to continue — table exists or DB unavailable
  }
}

// v7.288: union two Semrush "SERP Features by Keyword" cells. A Semrush organic export
// lists the SAME keyword once per ranking URL/snapshot, and the SERP-feature list can
// differ between those rows — so the old last-occurrence-wins de-dupe could silently DROP
// a real feature (Local Pack / AI Overview / PAA / Video) that only appeared on an earlier
// row. Merging the token sets keeps every feature Semrush ever reported for the keyword
// (real data only, Const I.1 — we never invent a feature, only preserve ones present in
// the upload). Case-insensitive token de-dupe, original casing kept, capped at 500 chars.
function mergeSerpFeatures(a: string | null, b: string | null): string | null {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cell of [a, b]) {
    if (!cell) continue;
    for (const raw of cell.split(',')) {
      const tok = raw.trim();
      if (!tok) continue;
      const key = tok.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tok);
    }
  }
  if (out.length === 0) return null;
  return out.join(', ').slice(0, 500);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureTable();

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { domain = '', source = 'csv', keywords } = body;

  if (!Array.isArray(keywords) || keywords.length === 0) {
    return NextResponse.json({ error: 'keywords must be a non-empty array' }, { status: 400 });
  }

  const projectId = params.id;
  const domainNorm = domain.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

  // v7.100: determine whether this upload is the CLIENT's footprint or a
  // COMPETITOR's. Competitor rows must NEVER be type 'ranked' — 'ranked' means
  // "the client ranks for this", and competitor positions stored as 'ranked'
  // were counted as client rankings in every panel (Wayne's 28K airsculpt.com
  // rows showed up as 36,281 ranked / 0 gap). The competitor's position is
  // still stored (needed for page-1 Share of Voice) — only the type changes.
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  const clientDomainNorm = (project?.websiteUrl ?? '')
    .trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const isClientUpload = domainNorm === '' || domainNorm === clientDomainNorm;

  // v7.100 auto-repair: flip pre-existing COMPETITOR rows that the old logic
  // stored as 'ranked' back to 'gap'. Competitor rows = domain set and not the
  // client's domain (client rows have domain ''/NULL or the client domain).
  // Scoped to this project. Idempotent — runs cheaply on every upload.
  if (clientDomainNorm) {
    try {
      await db.update(projectKeywords)
        .set({ type: 'gap' })
        .where(and(
          eq(projectKeywords.projectId, projectId),
          eq(projectKeywords.type, 'ranked'),
          sql`${projectKeywords.domain} IS NOT NULL`,
          ne(projectKeywords.domain, ''),
          ne(projectKeywords.domain, clientDomainNorm),
        ));
    } catch (err) {
      console.error('[OrbitIQ] competitor-row type repair failed (non-fatal):', err);
    }
  }

  // v7.92/v7.143: duplicate + replace scope. For CLIENT uploads, treat the whole
  // client bucket as ONE — blank domain, NULL (legacy), AND the literal client
  // domain. Some earlier client uploads were tagged with the client's own domain
  // (e.g. sonobello.com), splitting the footprint across two tags; a client
  // re-upload now refreshes all of them so the split is healed.
  const clientDomainConds = [
    eq(projectKeywords.domain, ''),
    isNull(projectKeywords.domain),
    ...(clientDomainNorm ? [eq(projectKeywords.domain, clientDomainNorm)] : []),
  ];
  const domainCond = isClientUpload
    ? or(...clientDomainConds)
    : eq(projectKeywords.domain, domainNorm);

  // v7.288: pull each existing row's serp_features too, so a re-upload that arrives in
  // CHUNKS (the panel posts in batches, and a keyword's duplicate rows can span chunks)
  // unions onto what an earlier chunk already stored — never clobbering it.
  // v7.290 SCALE FIX: scope this read to ONLY the keywords in THIS payload (inArray), not
  // the whole project footprint. The old query pulled every existing row for the domain —
  // up to thousands, each with a 500-char serp_features cell — on EVERY batch, so an
  // 11-batch upload re-read the entire footprint 11×. On a large project (TD ≈ 5,400 rows)
  // that read alone could blow the serverless function's time budget, the batch would 504,
  // its rows never persisted, and serp_features stayed empty (the bug Wayne hit). We only
  // ever need the existing state of the keywords we're about to write, so this is exact —
  // not a sampling shortcut (Const I.6) — and turns a full-table scan into a small lookup.
  const payloadKws = Array.from(new Set(
    keywords.map((k: any) => (k?.keyword ?? '').trim().toLowerCase()).filter((s: string) => s.length > 0),
  ));
  const existing = payloadKws.length === 0 ? [] : await db
    .select({ keyword: projectKeywords.keyword, serpFeatures: projectKeywords.serpFeatures })
    .from(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, projectId),
      eq(projectKeywords.source, source),
      domainCond,
      inArray(projectKeywords.keyword, payloadKws),
    ));
  const existingSet  = new Set(existing.map((r: any) => r.keyword));
  const existingFeat = new Map<string, string | null>(existing.map((r: any) => [r.keyword, r.serpFeatures ?? null]));

  // Build valid rows (dedupe within the payload itself; UNION serp-features across duplicates)
  const byKw = new Map<string, any>();
  for (const k of keywords) {
    const kw = (k?.keyword ?? '').trim().toLowerCase();
    if (kw.length === 0) continue;
    const vol = Number(k.searchVolume) || 0;
    const pos = k.position != null && !isNaN(Number(k.position)) ? Number(k.position) : null;
    // v7.103: keep the raw Semrush feature list; trim + cap length defensively.
    const rowFeats = typeof k.serpFeatures === 'string' && k.serpFeatures.trim().length > 0
      ? k.serpFeatures.trim().slice(0, 500)
      : null;
    // v7.288: union with what we already have for this keyword — the prior occurrence in
    // THIS payload, or (first time seen here) whatever a previous chunk stored in the DB —
    // so no real SERP feature is lost to last-occurrence-wins.
    const priorFeats = byKw.has(kw) ? (byKw.get(kw).serpFeatures as string | null) : (existingFeat.get(kw) ?? null);
    const feats = mergeSerpFeatures(priorFeats, rowFeats);
    // v7.251: real ranking/landing URL from the CSV row (Semrush "URL" column).
    const kurl = typeof k.url === 'string' && k.url.trim().length > 0
      ? k.url.trim().slice(0, 500)
      : null;
    byKw.set(kw, {
      projectId,
      keyword:      kw,
      searchVolume: vol,
      position:     pos,
      serpFeatures: feats,
      url:          kurl,
      // v7.100: 'ranked' is reserved for CLIENT rows (the client ranks for it).
      // Competitor rows are ALWAYS 'gap' — their position is the competitor's
      // rank, kept for Share of Voice, not a client ranking.
      type:         isClientUpload && pos !== null && pos <= 100 ? 'ranked' : 'gap',
      branded:      false,
      source,
      // v7.143: store client rows under ONE canonical tag (blank domain) so the
      // footprint can never split across '' vs the literal client domain again.
      domain:       isClientUpload ? '' : domainNorm,
    });
  }
  const rows     = Array.from(byKw.values());
  const toUpdate = rows.filter(r => existingSet.has(r.keyword));
  const toInsert = rows.filter(r => !existingSet.has(r.keyword));

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, skipped: keywords.length });
  }

  const CHUNK = 500;

  // v7.92 UPSERT: delete the existing rows for re-uploaded keywords, then
  // insert everything fresh — repairs volume/position/type in place.
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const kwChunk = toUpdate.slice(i, i + CHUNK).map(r => r.keyword);
    await db.delete(projectKeywords).where(and(
      eq(projectKeywords.projectId, projectId),
      eq(projectKeywords.source, source),
      domainCond,
      inArray(projectKeywords.keyword, kwChunk),
    ));
  }
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(projectKeywords).values(rows.slice(i, i + CHUNK));
  }

  // v7.289: self-diagnosis — how many rows in THIS payload carried SERP features, and how
  // many actually persisted to the column. When prepared > 0 but stored === 0 the write is
  // being silently dropped at the DB layer (column missing / migration failed); when
  // prepared === 0 the client never sent it. Returned to the panel so the upload result
  // shows it, and logged server-side for the Vercel log. Pure read-back — changes nothing.
  const serpFeaturesPrepared = rows.filter(
    r => typeof r.serpFeatures === 'string' && r.serpFeatures.trim().length > 0,
  ).length;
  let serpFeaturesStored = 0;
  try {
    const res: any = await db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM project_keywords
      WHERE project_id = ${projectId}
        AND serp_features IS NOT NULL
        AND serp_features <> ''
    `);
    serpFeaturesStored = Number(res?.rows?.[0]?.n ?? res?.[0]?.n ?? 0);
  } catch (err) {
    console.error('[OrbitIQ] serp_features verify query failed:', err);
  }
  console.log(
    `[OrbitIQ] batch upload project=${projectId} source=${source} domain="${domainNorm}" rows=${rows.length} serpFeaturesPrepared=${serpFeaturesPrepared} serpFeaturesStored(total project)=${serpFeaturesStored}`,
  );

  return NextResponse.json({
    inserted: toInsert.length,
    updated:  toUpdate.length,
    skipped:  keywords.length - rows.length,
    serpFeaturesPrepared,   // v7.289: rows in this payload that carried a SERP-features value
    serpFeaturesStored,     // v7.289: rows in the project whose serp_features column is now non-empty
  });
}
