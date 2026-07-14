/**
 * /api/projects/[id]/authority-scan — Google Rank Authority signal scan (v7.367)
 *
 * Pulls the REAL Semrush backlink-authority profile for the client domain and
 * every configured competitor (Const I.1 — every count is a crawled Semrush
 * index row, date-stamped):
 *   • backlinks_overview        — Authority Score (modeled composite, labeled at
 *                                 render per I.5a), total backlinks, referring
 *                                 domains, follow/nofollow split   (45 units/request)
 *   • backlinks_ascore_profile  — referring-domain count per Authority Score
 *                                 value; quality tiers are exact TS rollups     (1 unit/line)
 *   • backlinks_anchors         — top anchors by referring domains             (40 units/line)
 *   • backlinks_categories_profile — topical categories of the referring
 *                                 domains (Semrush's modeled classifier,
 *                                 labeled at render)                            (rate not published — recorded
 *                                                                               at the assumed default w/ meta note)
 *   • phrase_this               — real monthly search volume for the brand
 *                                 phrase (entity-demand signal)                 (10 units/line)
 *
 * GET  → { snapshot } — the stored scan (projects.authority_snapshot), or null.
 * POST { dryRun:true, anchorsLimit?, categoriesLimit? }
 *      → the plan + estimated Semrush units WITHOUT spending any.
 * POST { anchorsLimit?, categoriesLimit? }
 *      → streamed NDJSON progress (start / progress / done / error) with a
 *        determinate bar + ETA (Const IV.2), then persists the snapshot on the
 *        PROJECT row (survives the full keyword reset, like taxonomy_anchor).
 *
 * The anchors/categories row limits are USER-VISIBLE choices confirmed in the
 * panel's dry-run step (Const I.6 — a limit is a deliberate user decision, and
 * anchors cost 40 units/row; the full anchor list of a large domain would be
 * millions of units). Every pull is fault-tolerant per domain: a failed report
 * records an honest gap (I.5) — never a fabricated zero.
 *
 * Feeds the Authority Calculator panel (v7.368): campaigns-to-bridge math reads
 * this snapshot; it never re-pulls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/db';
import { projects, competitors as competitorsTable } from '@/db/schema';
import { setUsageProject } from '@/lib/usage/context';
import {
  getBacklinksOverview, getBacklinksAscoreProfile, getBacklinksAnchors,
  getBacklinksCategoriesProfile, getPhraseVolume,
  type BacklinksOverview, type BacklinksAnchor, type BacklinksCategory,
} from '@/lib/apis/semrush';

export const maxDuration = 300;

const DEFAULT_ANCHORS_LIMIT    = 50;
const DEFAULT_CATEGORIES_LIMIT = 25;
const MAX_ANCHORS_LIMIT        = 500;   // 500 × 40 = 20,000 units — already a deliberate spend
const MAX_CATEGORIES_LIMIT     = 100;

// ─── Snapshot shape (versioned; the Calculator panel consumes this) ──────────

export interface AuthorityDomainSignals {
  domain:      string;
  role:        'client' | 'competitor';
  brandPhrase: string;                       // the phrase whose volume was pulled
  overview:            BacklinksOverview | null;
  ascoreProfile:       Record<string, number> | null;   // ascore value → referring-domain count (raw Semrush rows)
  qualityTiers:        { lt10: number; ge10: number; ge30: number; ge50: number } | null;  // exact TS rollup of ascoreProfile
  anchors:             BacklinksAnchor[] | null;         // top N by referring domains (N recorded in scan config)
  refdomainCategories: BacklinksCategory[] | null;       // top N topical categories (Semrush modeled classifier)
  brandVolume:         number | null;                    // real phrase_this monthly volume; null = not in database (honest gap)
  errors:              string[];                         // per-report failures — honest gaps, never zeros
}

export interface AuthorityScanSnapshot {
  version:   1;
  fetchedAt: string;    // ISO — Const IV.5 last-scan timestamp
  database:  string;    // Semrush regional database used for brand volume
  config:    { anchorsLimit: number; categoriesLimit: number };
  domains:   AuthorityDomainSignals[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDomain(url: string): string {
  return String(url ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim();
}

/** The brand phrase whose real search volume we pull: the client/competitor name
 *  when present, else the domain root ("wellsfargo.com" → "wellsfargo"). */
function brandPhraseFor(name: string | null | undefined, domain: string): string {
  const n = String(name ?? '').trim().toLowerCase();
  if (n) return n;
  return domain.replace(/\.[a-z.]+$/i, '');
}

/** Exact TypeScript rollup of the ascore distribution into quality tiers (Const I.1 —
 *  the tier boundaries are Semrush's modeled AS scale, labeled at render per I.5a). */
function rollupQualityTiers(profile: Record<string, number>): { lt10: number; ge10: number; ge30: number; ge50: number } {
  let lt10 = 0, ge10 = 0, ge30 = 0, ge50 = 0;
  Object.keys(profile).forEach(k => {
    const score = parseInt(k, 10);
    const n = profile[k] ?? 0;
    if (isNaN(score) || !n) return;
    if (score < 10) lt10 += n; else ge10 += n;
    if (score >= 30) ge30 += n;
    if (score >= 50) ge50 += n;
  });
  return { lt10, ge10, ge30, ge50 };
}

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS authority_snapshot JSONB`);                // v7.367
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS authority_snapshot_updated_at TIMESTAMP`); // v7.367
  } catch { /* already exists */ }
}

// ─── GET — stored snapshot ────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureColumns();
    const rows = await db.select({ snapshot: projects.authoritySnapshot, updatedAt: projects.authoritySnapshotUpdatedAt })
      .from(projects).where(eq(projects.id, params.id)).limit(1);
    if (!rows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    return NextResponse.json({ snapshot: rows[0].snapshot ?? null, updatedAt: rows[0].updatedAt ?? null });
  } catch (e) {
    return NextResponse.json({ error: String((e as any)?.message ?? e) }, { status: 500 });
  }
}

// ─── POST — dry-run estimate or streamed scan ─────────────────────────────────

const REPORTS_PER_DOMAIN = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  setUsageProject(projectId);   // v7.225: attribute API usage to this project

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const anchorsLimit    = Math.min(Math.max(parseInt(body?.anchorsLimit, 10)    || DEFAULT_ANCHORS_LIMIT, 1),    MAX_ANCHORS_LIMIT);
  const categoriesLimit = Math.min(Math.max(parseInt(body?.categoriesLimit, 10) || DEFAULT_CATEGORIES_LIMIT, 1), MAX_CATEGORIES_LIMIT);

  await ensureColumns();
  const projRows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!projRows.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const project = projRows[0] as any;
  const comps = await db.select().from(competitorsTable).where(eq(competitorsTable.projectId, projectId));

  const clientDomain = normalizeDomain(project.websiteUrl);
  const database     = project.semrushDatabase || 'us';
  const targets: Array<{ domain: string; role: 'client' | 'competitor'; brandPhrase: string }> = [
    { domain: clientDomain, role: 'client' as const, brandPhrase: brandPhraseFor(project.clientName, clientDomain) },
    ...comps.map(c => ({
      domain: normalizeDomain(c.domain), role: 'competitor' as const,
      brandPhrase: brandPhraseFor(c.name, normalizeDomain(c.domain)),
    })),
  ].filter((t, i, arr) => t.domain && arr.findIndex(x => x.domain === t.domain) === i);

  // ── Dry run: the plan + estimated units, zero spend ──
  if (body?.dryRun) {
    // Estimates use the VERIFIED published rates (lib/usage/record.ts). The ascore
    // profile's row count isn't knowable before pulling (≤101 score values); the
    // categories rate isn't published — both are labeled estimates. Actual recorded
    // consumption lands in the API Usage panel either way.
    const perDomain =
      45 +                        // backlinks_overview — 45/request (verified)
      101 * 1 +                   // ascore profile — ≤101 lines × 1 (upper bound)
      anchorsLimit * 40 +         // anchors — 40/line (verified)
      categoriesLimit * 10 +      // categories — rate NOT published; assumed default 10 w/ ledger meta note
      10;                         // phrase_this — 10/line (verified)
    return NextResponse.json({
      plan: {
        domains: targets.map(t => t.domain),
        reportsPerDomain: REPORTS_PER_DOMAIN,
        anchorsLimit, categoriesLimit,
        estimatedUnitsPerDomain: perDomain,
        estimatedUnitsTotal: perDomain * targets.length,
        note: 'Estimate from published Semrush rates (backlinks docs, checked 2026-07-14); ascore-profile rows are an upper bound and the categories rate is not published — actual consumption is recorded in API Usage.',
      },
    });
  }

  // ── Real scan: streamed NDJSON, then persist ──
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      const total = targets.length * REPORTS_PER_DOMAIN;
      let done = 0;
      const startedAt = Date.now();
      const tick = (label: string) => {
        done += 1;
        const perStep = (Date.now() - startedAt) / done;
        const etaSec = Math.round(((total - done) * perStep) / 1000);
        send({ type: 'progress', done, total, label, etaSec });
      };
      try {
        send({ type: 'start', total, domains: targets.map(t => t.domain) });

        const results: AuthorityDomainSignals[] = [];
        for (const t of targets) {
          const sig: AuthorityDomainSignals = {
            domain: t.domain, role: t.role, brandPhrase: t.brandPhrase,
            overview: null, ascoreProfile: null, qualityTiers: null,
            anchors: null, refdomainCategories: null, brandVolume: null, errors: [],
          };
          const targetType = 'root_domain';

          try { sig.overview = await getBacklinksOverview(t.domain, targetType); }
          catch (e) { sig.errors.push(`overview: ${String((e as any)?.message ?? e)}`); }
          tick(`${t.domain} — backlink overview`);

          try {
            sig.ascoreProfile = await getBacklinksAscoreProfile(t.domain, targetType);
            if (sig.ascoreProfile) sig.qualityTiers = rollupQualityTiers(sig.ascoreProfile);
          }
          catch (e) { sig.errors.push(`ascore_profile: ${String((e as any)?.message ?? e)}`); }
          tick(`${t.domain} — authority distribution`);

          try { sig.anchors = await getBacklinksAnchors(t.domain, targetType, anchorsLimit); }
          catch (e) { sig.errors.push(`anchors: ${String((e as any)?.message ?? e)}`); }
          tick(`${t.domain} — anchor texts`);

          try { sig.refdomainCategories = await getBacklinksCategoriesProfile(t.domain, targetType, categoriesLimit); }
          catch (e) { sig.errors.push(`categories: ${String((e as any)?.message ?? e)}`); }
          tick(`${t.domain} — referring-domain topics`);

          sig.brandVolume = await getPhraseVolume(t.brandPhrase, database);   // null = honest gap
          tick(`${t.domain} — brand demand`);

          results.push(sig);
        }

        const snapshot: AuthorityScanSnapshot = {
          version: 1,
          fetchedAt: new Date().toISOString(),
          database,
          config: { anchorsLimit, categoriesLimit },
          domains: results,
        };

        await db.update(projects)
          .set({ authoritySnapshot: snapshot as any, authoritySnapshotUpdatedAt: new Date() } as any)
          .where(eq(projects.id, projectId));

        send({ type: 'done', snapshot });
      } catch (e) {
        send({ type: 'error', error: String((e as any)?.message ?? e) });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
