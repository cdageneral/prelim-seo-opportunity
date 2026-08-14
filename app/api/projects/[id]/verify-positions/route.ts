/**
 * POST /api/projects/[id]/verify-positions — v7.451
 *
 * Wayne, 2026-08-14: OrbitIQ reported "gross income · #1" while Google showed no
 * Synchrony result on page 1. The stored row came from a CSV upload, and a Semrush
 * Positions export writes a SERP-feature slot (People also ask, Things to know, …)
 * with Position = 1. The parser never read the "Position Type" column, so boxes
 * entered the pool as organic #1s — Const I.4, two lenses blended into one number.
 *
 * This route repairs a project WITHOUT a re-upload (Wayne's choice, 2026-08-14):
 * `domain_organic` returns ORGANIC placements only, so it is the authoritative
 * answer to "what does this domain actually rank for". Every stored client row
 * claiming a position inside the checked window is reconciled against it:
 *
 *   - found  -> position corrected to the real organic rank, positionType 'Organic'
 *   - absent -> the claim was not an organic placement in the window. The position
 *               is cleared and the row is typed with whatever SERP feature its
 *               stored feature list shows it held ('SERP feature' when unnamed),
 *               so it renders as presence, not a rank (Wayne's display choice).
 *
 * Rows outside the window are left ALONE and stay 'unknown' — a feature never
 * exports as #40, and re-scoring a deep row we did not check would invent data (I.5).
 *
 * GET  = dry run: what would be checked and what it costs. Nothing is written and
 *        no Semrush call is made (I.5b — priced before a cent is spent).
 * POST  = run it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db }              from '@/db';
import { projectKeywords, projects } from '@/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { getOrganicPositions } from '@/lib/apis/semrush';
import { setUsageProject } from '@/lib/usage/context';
import { positionBasisOf } from '@/lib/keywords/positionBasis';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** The rank window reconciled. A SERP-feature placement exports as position 1, so
 *  the error lives at the top; 20 covers page 1 plus a margin for movement. */
const WINDOW = 20;

/** projects.websiteUrl -> the bare domain Semrush expects. */
const normDomain = (u: unknown): string =>
  String(u ?? '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();

async function ensureColumns() {
  try {
    await db.execute(sql`ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS position_type TEXT`);
    await db.execute(sql`ALTER TABLE project_keywords ADD COLUMN IF NOT EXISTS position_verified_at TIMESTAMP`);
  } catch { /* column exists or DB unavailable */ }
}

async function loadTargets(projectId: string) {
  await ensureColumns();
  const rows = await db
    .select({
      id: projectKeywords.id,
      keyword: projectKeywords.keyword,
      position: projectKeywords.position,
      positionType: projectKeywords.positionType,
      serpFeatures: projectKeywords.serpFeatures,
    })
    .from(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, projectId),
      // Client rows only — a competitor row's position is the COMPETITOR's rank and is
      // not what this project's organic pull can speak to.
      // v7.452: client rows are stored under the canonical BLANK domain (v7.143), which
      // is the empty string, not NULL — `isNull` alone matched nothing, so v7.451 reported
      // "0 unverified" on a project with 241 unverified rows. Accept both spellings of
      // "no competitor domain", exactly as buildKwPool's `!k.domain` test does.
      or(isNull(projectKeywords.domain), eq(projectKeywords.domain, '')),
    ));
  return rows.filter(r =>
    (r as any).position != null &&
    Number((r as any).position) >= 1 &&
    Number((r as any).position) <= WINDOW &&
    positionBasisOf((r as any).positionType) === 'unknown',   // already-known rows are not re-bought
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const targets = await loadTargets(id);
    const [proj] = await db.select({ websiteUrl: projects.websiteUrl }).from(projects).where(eq(projects.id, id)).limit(1);
    return NextResponse.json({
      window: WINDOW,
      unverified: targets.length,
      domain: normDomain((proj as any)?.websiteUrl) || null,
      // Semrush publishes no per-unit price (I.5b: a dated unpriced declaration), so the
      // cost is stated in UNITS actually consumed — 10 per returned line — never in dollars.
      unitsPerLine: 10,
      note: targets.length === 0
        ? 'Every stored position in the checked window already carries a known basis — nothing to verify, nothing to spend.'
        : `${targets.length} stored position${targets.length === 1 ? '' : 's'} at 1-${WINDOW} carry no basis. One Semrush organic pull for this domain resolves all of them at once.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  setUsageProject(id);   // v7.225: the Semrush pull posts to THIS project's ledger
  try {
    const [proj] = await db
      .select({ websiteUrl: projects.websiteUrl, database: projects.semrushDatabase })
      .from(projects).where(eq(projects.id, id)).limit(1);
    const domain = normDomain((proj as any)?.websiteUrl);
    if (!domain) return NextResponse.json({ error: 'This project has no domain set, so there is nothing to verify against.' }, { status: 400 });

    const targets = await loadTargets(id);
    if (targets.length === 0) {
      return NextResponse.json({ verified: 0, corrected: 0, featureOnly: 0, rowsRead: 0,
        note: 'Nothing to verify — every position in the window already carries a known basis.' });
    }

    const db2 = String((proj as any)?.database ?? 'us') || 'us';
    const { byKeyword, rowsRead, capped } = await getOrganicPositions(domain, WINDOW, db2);
    // v7.453: if Semrush returned a full page the organic set may be incomplete, and a
    // keyword missing from a TRUNCATED answer must not be retyped as a feature placement
    // — that would assert "no organic ranking" from data we know is partial (Const I.5).
    if (capped) {
      return NextResponse.json({
        error: `Semrush returned the maximum ${rowsRead.toLocaleString()} rows for ${domain}, so its organic set may be incomplete. Nothing was changed — a keyword missing from a truncated answer cannot be called a SERP-feature placement.`,
      }, { status: 409 });
    }

    let corrected = 0, featureOnly = 0, confirmed = 0;
    const now = new Date();
    for (const t of targets) {
      const kw = String((t as any).keyword ?? '').toLowerCase().trim();
      const truth = byKeyword.get(kw) ?? null;
      if (truth) {
        const same = Number((t as any).position) === truth.position;
        await db.update(projectKeywords)
          .set({ position: truth.position, positionType: 'Organic', positionVerifiedAt: now })
          .where(eq(projectKeywords.id, (t as any).id));
        if (same) confirmed++; else corrected++;
      } else {
        // No organic placement in the window. Name the feature it held when the stored
        // feature list says which; otherwise state the basis plainly. Never guess a rank.
        const feats = String((t as any).serpFeatures ?? '');
        const named = ['People also ask', 'Things to know', 'Featured snippet', 'Knowledge panel']
          .find(f => feats.includes(f));
        await db.update(projectKeywords)
          .set({ position: null, positionType: named ?? 'SERP feature', positionVerifiedAt: now })
          .where(eq(projectKeywords.id, (t as any).id));
        featureOnly++;
      }
    }

    return NextResponse.json({
      verified: targets.length, confirmed, corrected, featureOnly, rowsRead, capped, window: WINDOW, domain,
      note: `${confirmed} confirmed, ${corrected} corrected to their real organic rank, ${featureOnly} were SERP-feature placements and now show as presence rather than a ranking.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
