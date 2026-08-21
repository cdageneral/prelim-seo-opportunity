/**
 * lib/insightsPanel/build.ts — v7.471 · deterministic builders for the Insights panel.
 *
 * Two computed views, both pure TypeScript over ALREADY-STORED data (Const I.1 /
 * II.6 — a rollup is a view; nothing here calls an API or invents a number):
 *
 *  1. buildQuadrant — the source-vs-answer quadrant. X = how often AI answers
 *     CITE the brand's own domain (projects.profound_data `domains` — the panel's
 *     stored citation tallies). Y = how often AI answers NAME the brand
 *     (`coverage` — the stored per-brand prompt-coverage percentages the AI
 *     Answer Engines panel renders). Brand→domain matching is deterministic
 *     token containment (squash — the v7.432 two-word-brand lesson); a brand
 *     whose domain cannot be matched is returned in `unmatched`, never plotted
 *     at zero (absence is never zero, I.5).
 *
 *  2. buildCoverageSummary — the demand-coverage table. Reads the Product
 *     Insights panel's OWN shared Content-Footprint-vs-Journey numbers via
 *     lib/seer/core's toolContentCoverage (Const II.6a — reads the panel basis,
 *     never re-derives). Field average is the arithmetic mean of the brands'
 *     tool-computed pctOfJourney values, computed here in TS.
 *
 * Both are consumed by the Insights panel route (GET), and by the Assessment
 * PDF section (Const II.6b — same builders, same release).
 */

import { type SeerContext, toolContentCoverage } from '@/lib/seer/core';

// ─── quadrant ────────────────────────────────────────────────────────────────

export interface QuadrantPoint {
  brand: string;
  isClient: boolean;
  /** % of tracked prompts whose answers name this brand (stored `coverage` pct). */
  visibilityPct: number;
  /** stored citation count for the matched domain. */
  citations: number;
  /** the cited domain the brand was matched to. */
  domain: string;
  /** classification vs the plotted field's medians — a computed view label. */
  quadrant: 'answer_and_source' | 'named_not_cited' | 'cited_not_named' | 'invisible';
}

export interface QuadrantResult {
  points: QuadrantPoint[];
  /** brands with a stored visibility % but no matchable cited-domain row — LISTED, never plotted at 0 (I.5). */
  unmatched: Array<{ brand: string; isClient: boolean; visibilityPct: number }>;
  medians: { visibilityPct: number; citations: number };
  basis: string;
}

/** lowercase letters+digits only — the v7.432 squash, so "Capital One" meets capitalone.com. */
function squash(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** the registrable label of a hostname: "www.capitalone.com" -> "capitalone". */
function domainRoot(d: string): string {
  const host = String(d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  const sld = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
  let i = parts.length - 2;
  if (i > 0 && sld.has(parts[i]) && parts[parts.length - 1].length === 2) i -= 1;
  return parts[i] ?? '';
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * profound = the stored projects.profound_data Metrics object (the AI Answer
 * Engines panel's own persisted aggregate — v7.318). Returns null when no
 * Profound data is stored for the project (the panel then says so honestly).
 */
export function buildQuadrant(profound: any): QuadrantResult | null {
  const coverage: any[] = Array.isArray(profound?.coverage) ? profound.coverage : [];
  const domains: any[] = Array.isArray(profound?.domains) ? profound.domains : [];
  if (!coverage.length || !domains.length) return null;

  const domainRows = domains
    .map((d: any) => ({ domain: String(d?.domain ?? ''), count: Number(d?.count ?? 0), root: squash(domainRoot(String(d?.domain ?? ''))) }))
    .filter(r => r.domain && r.root.length >= 3);

  const points: QuadrantPoint[] = [];
  const unmatched: QuadrantResult['unmatched'] = [];

  for (const b of coverage) {
    const brand = String(b?.brand ?? '').trim();
    if (!brand) continue;
    const bq = squash(brand);
    if (bq.length < 3) continue;
    // deterministic match: exact root equality first, then containment either
    // way (root length >= 4 for containment so 3-letter fragments cannot
    // false-match). Longest root wins ties.
    let best: { domain: string; count: number; root: string } | null = null;
    for (const d of domainRows) {
      const exact = d.root === bq;
      const contains = d.root.length >= 4 && (bq.includes(d.root) || d.root.includes(bq));
      if (exact || contains) {
        if (!best || exact || d.root.length > best.root.length) best = d;
        if (exact) break;
      }
    }
    const visibilityPct = Number(b?.pct ?? 0);
    if (!best) {
      unmatched.push({ brand, isClient: !!b?.isClient, visibilityPct });
      continue;
    }
    points.push({
      brand, isClient: !!b?.isClient, visibilityPct,
      citations: best.count, domain: best.domain,
      quadrant: 'invisible',   // classified below once medians exist
    });
  }
  if (!points.length) return null;

  const med = {
    visibilityPct: median(points.map(p => p.visibilityPct)),
    citations: median(points.map(p => p.citations)),
  };
  for (const p of points) {
    const named = p.visibilityPct >= med.visibilityPct && p.visibilityPct > 0;
    const cited = p.citations >= med.citations && p.citations > 0;
    p.quadrant = named && cited ? 'answer_and_source'
      : named ? 'named_not_cited'
      : cited ? 'cited_not_named'
      : 'invisible';
  }
  points.sort((a, b) => b.visibilityPct - a.visibilityPct);
  return {
    points, unmatched, medians: med,
    basis: 'Stored Profound export: coverage = % of tracked prompts naming the brand; citations = stored count of AI-answer citations of the brand’s matched domain. Quadrant labels compare each brand to the plotted field’s medians (a computed view). Brands without a matchable cited domain are listed, not plotted at zero.',
  };
}

// ─── demand-coverage table ───────────────────────────────────────────────────

export interface CoverageLine {
  product: string;
  journeyTopicsRequired: number | null;
  client: { covered: number | null; pct: number | null };
  leader: { domain: string; isClient: boolean; covered: number | null; pct: number | null } | null;
  /** arithmetic mean of the per-brand tool-computed pctOfJourney values (brands with measured coverage only). */
  fieldAvgPct: number | null;
  brandsMeasured: number;
  gapSubCategories: string[];
}

export interface CoverageSummary {
  lines: CoverageLine[];
  basis: string;
}

export function buildCoverageSummary(ctx: SeerContext): CoverageSummary | null {
  const summary = toolContentCoverage(ctx, {});
  if (!summary || summary.dataAbsent || !Array.isArray(summary.lines) || !summary.lines.length) return null;

  const lines: CoverageLine[] = [];
  for (const line of summary.lines) {
    if (line?.error) continue;
    const detail = toolContentCoverage(ctx, { line: line.product });
    const brands: any[] = Array.isArray(detail?.brands) ? detail.brands : [];
    const pcts = brands.map((b: any) => (typeof b?.pctOfJourney === 'number' ? b.pctOfJourney : null))
      .filter((v: number | null): v is number => v != null);
    const leaderRow = brands.length ? brands.reduce((a: any, b: any) =>
      ((b?.covered?.total ?? -1) > (a?.covered?.total ?? -1) ? b : a), brands[0]) : null;
    lines.push({
      product: String(line.product),
      journeyTopicsRequired: line.journeyTopicsRequired ?? null,
      client: { covered: line.you?.topicsCovered ?? null, pct: line.you?.pctOfJourney ?? null },
      leader: leaderRow ? {
        domain: String(leaderRow.domain ?? ''), isClient: leaderRow.kind === 'client',
        covered: leaderRow.covered?.total ?? null,
        pct: typeof leaderRow.pctOfJourney === 'number' ? leaderRow.pctOfJourney : null,
      } : null,
      fieldAvgPct: pcts.length ? Math.round(pcts.reduce((s: number, v: number) => s + v, 0) / pcts.length) : null,
      brandsMeasured: pcts.length,
      gapSubCategories: Array.isArray(line.gapSubCategories) ? line.gapSubCategories : [],
    });
  }
  if (!lines.length) return null;
  return {
    lines,
    basis: 'Content Footprint vs Journey — the Product Insights panel’s shared builders (Const II.6a/II.7). Covered = topics with stored rank evidence; field avg = mean of the measured brands’ % of journey. Pages that never rank are not counted.',
  };
}
