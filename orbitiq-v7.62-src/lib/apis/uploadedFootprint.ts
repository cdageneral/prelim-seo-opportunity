/**
 * uploadedFootprint.ts
 *
 * Builds a SemrushSnapshot-shaped object from user-uploaded keyword CSVs
 * stored in the project_keywords table (source = 'csv').
 *
 * This lets the analysis pipeline (analyze → synthesize) run unchanged
 * whether keyword data came from Semrush auto-discovery or user uploads.
 *
 * Returns null if no uploaded keywords exist for this project (falls back
 * to Semrush auto-discovery in the analyze route).
 *
 * v7.31 — introduced for the "Upload footprints" data-source option.
 */

import { db }              from '@/db';
import { projectKeywords } from '@/db/schema';
import { and, eq }         from 'drizzle-orm';
import type { SemrushSnapshot, SemrushKeyword, SemrushKeywordGap, SemrushCompetitor } from './semrush';

export async function buildSnapshotFromUploads(
  projectId:          string,
  clientDomain:       string,
  competitorDomains:  string[],
): Promise<SemrushSnapshot | null> {
  // Fetch all csv-sourced keywords for this project
  const rows = await db
    .select()
    .from(projectKeywords)
    .where(and(
      eq(projectKeywords.projectId, projectId),
      eq(projectKeywords.source, 'csv'),
    ));

  if (rows.length === 0) return null;   // No uploads → caller uses Semrush

  const clientNorm = normDomain(clientDomain);

  // Partition: client rows vs competitor rows
  const clientRows     = rows.filter(r => !r.domain || normDomain(r.domain) === clientNorm);
  const competitorRows = rows.filter(r => r.domain && normDomain(r.domain) !== clientNorm);

  // Build set of client keywords for gap filtering
  const clientKeywordSet = new Set(clientRows.map(r => r.keyword.toLowerCase()));

  // ── topKeywords ────────────────────────────────────────────────────────────
  const topKeywords: SemrushKeyword[] = clientRows.map(r => ({
    keyword:      r.keyword,
    position:     r.position ?? 999,
    searchVolume: r.searchVolume,
    url:          '',
    cpc:          0,
    competition:  0,
  })).sort((a, b) => b.searchVolume - a.searchVolume);

  // ── gapKeywords ────────────────────────────────────────────────────────────
  // Competitor keywords the client does NOT rank for
  const gapKeywords: SemrushKeywordGap[] = competitorRows
    .filter(r => !clientKeywordSet.has(r.keyword.toLowerCase()))
    .map(r => ({
      keyword:            r.keyword,
      searchVolume:       r.searchVolume,
      clientPosition:     null,
      competitor:         r.domain ?? '',
      competitorPosition: r.position ?? 1,
      cpc:                0,
    }))
    .sort((a, b) => b.searchVolume - a.searchVolume);

  // ── positionDist ───────────────────────────────────────────────────────────
  const positionDist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const kw of topKeywords) {
    if (kw.position <= 3)       positionDist['1-3']++;
    else if (kw.position <= 10) positionDist['4-10']++;
    else if (kw.position <= 20) positionDist['11-20']++;
    else                        positionDist['21+']++;
  }

  // ── competitors list ───────────────────────────────────────────────────────
  const uploadedCompetitorDomains = Array.from(
    new Set(competitorRows.map(r => r.domain).filter(Boolean) as string[])
  );
  const allCompetitorDomains = Array.from(
    new Set(uploadedCompetitorDomains.concat(competitorDomains))
  );

  const competitors: SemrushCompetitor[] = allCompetitorDomains.map(domain => {
    const kwCount = competitorRows.filter(r => r.domain && normDomain(r.domain) === normDomain(domain)).length;
    return {
      domain,
      commonKeywords:  0,
      organicKeywords: kwCount,
      organicTraffic:  0,
      relevance:       1,
    };
  });

  return {
    domain:   clientNorm,
    overview: {
      domain:          clientNorm,
      organicKeywords: clientRows.length,
      organicTraffic:  0,   // Not available from CSV exports
      organicCost:     0,
      authorityScore:  0,
      backlinks:       0,
    },
    topKeywords,
    competitors,
    gapKeywords,
    positionDist,
    fetchedAt: new Date().toISOString(),
  };
}

function normDomain(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('/')[0];
}
