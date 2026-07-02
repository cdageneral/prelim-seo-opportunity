/**
 * lib/sov/model.ts — v7.335 (QC audit B2)
 *
 * SINGLE SOURCE OF TRUTH for the Share-of-Voice model — moved VERBATIM from
 * components/brief/GoogleSerpSection.tsx (v7.245 page-1 click-capture definition,
 * v7.246 competitor slices, v7.322 top-SERP-rival slices) so SERVER code (the PDF
 * export route, app/api/reports/pdf) and the client panels (SovPanel, the Exec
 * hero) compute the SAME numbers from the SAME canonical pool (Const II.7).
 * Until v7.335 the PDF rendered the pre-v7.245 competitor-relative model from
 * stored fields — a structurally different chart than the app (QC audit B2/F4).
 *
 * The CTR curve is a labeled model estimate (Const I.5a / Art. IX): every surface
 * rendering these numbers MUST carry the "modeled estimate" disclosure and name
 * the curve ("GrowthSRC 2025 · 200K-kw study" — CTR_SOURCE_LABEL below).
 *
 * Server-safe: no 'use client', no React — importable from routes and components.
 */

import { buildKwPool } from '@/lib/utils/kwVolume';

// ── CTR-by-position model (Const I.1 labeled-estimate exception — Art. IX, 2026-06-19) ──
// Organic click-through rate by Google ranking position. SOURCE: GrowthSRC 2025
// "Google Organic CTR" study — 200,000 keywords across 30+ sites, GSC-derived,
// post-AI-Overviews. Per-position values 1–10 as tabulated by theStacc (attributing
// GrowthSRC); note GrowthSRC's own article states pos1=19.0%, pos2=12.6% (theStacc's
// table shows 13.1% for pos2 — minor secondary-transcription delta, logged in the
// version log). These are INDUSTRY-MODELED rates, NOT measured client data: keyword
// volume and ranking position trace to real Semrush rows (I.1); the CTR multiplier
// is a labeled model estimate, never presented as measured data (parallels III.7).
// Single source of truth — also imported by ExecutiveSummarySection value-at-stake.
export const CTR_BY_POSITION: Record<number, number> = {
  1: 0.190, 2: 0.131, 3: 0.098, 4: 0.077, 5: 0.053,
  6: 0.041, 7: 0.033, 8: 0.027, 9: 0.022, 10: 0.019,
};
// Total organic clicks available per search on page 1 = Σ CTR(pos 1–10) ≈ 0.691.
export const PAGE1_CTR_SUM = Object.values(CTR_BY_POSITION).reduce((s, v) => s + v, 0);
export const CTR_SOURCE_LABEL = 'GrowthSRC 2025 · 200K-kw study';
// CTR at a position. Page-1 (1–10) uses the study curve; a small page-2+ tail is
// kept ONLY for the Exec value-at-stake climber math (not used in the SoV page-1
// capture denominator, which is bounded to positions 1–10).
export function ctrAt(p: number): number {
  return CTR_BY_POSITION[p] ?? (p <= 20 ? 0.01 : 0.005);
}

export interface SovRawEntry {
  domain:  string;
  traffic: number;
  type:    'client' | 'competitor' | 'serp' | 'open';
  color:   string;
}

// v7.246: competitor slice palette (cyan family — distinct from client purple,
// muted-open). Cycles if more competitors than colors.
const SOV_COMP_COLORS = ['var(--c-06b6d4)', 'var(--c-0891b2)', 'var(--c-22d3ee)', 'var(--c-0e7490)', 'var(--c-67e8f9)'];

// v7.322: top-SERP-rival slice palette (amber/gold family — distinct from client
// purple and the cyan uploaded-competitor family). All three tokens are defined in
// BOTH light and dark themes (Const IV.6 parity). Cycles if ever more than the colors.
const SOV_SERP_COLORS = ['var(--c-f59e0b)', 'var(--c-d9a23f)', 'var(--c-fbbf24)'];
// How many top SERP rivals to surface as slices (Wayne, 2026-06-30: "top 3 sites").
const SOV_SERP_TOP_N = 3;

export function normSovDomain(d: string): string {
  return (d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
}

// v7.129 — SINGLE SOURCE OF TRUTH for Share-of-Voice shares. The body below was
// extracted verbatim from SovPanel so the Executive Summary hero can read the
// SAME ranked entries and percentages the donut renders. Previously the hero
// computed its own organic-traffic-only share, truncated to the top 4
// competitors, which disagreed with this panel (different basis, different
// denominator). Both now call computeSov(), so they reconcile by construction.
// v7.245 — Share of Voice REDEFINED (Wayne, 2026-06-19) as page-1 click CAPTURE,
// not competitor-relative share. The old definition divided the client's page-1
// volume by the volume of whatever competitor rankings happened to be on file —
// so a client with NO competitor data scored a meaningless 100% even while most of
// its demand sat below page 1. The new metric answers "what share of the clicks
// available on page 1 across this footprint is the client actually winning?":
//   SoV = Σ(volume × CTR at client's position, pos ≤ 10)  ÷  Σ(volume × PAGE1_CTR_SUM)
// Numerator = modeled clicks the client captures; denominator = all page-1 clicks
// available across the SAME footprint the Google-Rank header counts (built via the
// shared buildKwPool, so it reconciles with Total/Ranked/Pg-1 cards — Const II.7).
// The CTR curve is a labeled model estimate (Art. IX); volumes/positions are real.
export interface SovComputed {
  basis:           'capture' | 'empty';
  sovPct:          number;   // capturedClicks / availableClicks (0..1) — modeled
  capturedClicks:  number;   // monthly modeled clicks the client wins on page 1
  availableClicks: number;   // monthly modeled total page-1 clicks across the footprint
  // real, measured inputs (Semrush rows) — surfaced for on-screen verifiability (I.1)
  totalVolMonthly: number;
  page1VolMonthly: number;
  page1KwCount:    number;
  totalKwCount:    number;
  clientDisplay:   string;
  ctrSource:       string;
  // v7.246 — competitor capture on the SAME footprint/denominator. Each competitor's
  // slice = Σ(footprint-keyword volume × CTR at the competitor's position, pos ≤ 10)
  // over the keywords it shares with the client footprint. Stable denominator means
  // the client's own % does not move when a competitor is added; their slice eats
  // into "open" instead. Competitors with rows but no usable page-1 overlap are
  // surfaced as honest gaps (I.5), never given a modeled or zero slice as fact.
  compEntries:     Array<{ domain: string; capturedClicks: number; pct: number; kwCount: number }>;
  compGaps:        Array<{ domain: string; rows: number; hasPositions: boolean; minPos: number | null }>;
  // v7.322 — top SERP rivals on the client footprint by page-1 click capture. Same
  // basis/denominator as compEntries (Σ footprint-volume × CTR at the rival's real
  // page-1 position over shared keywords), but sourced from Semrush auto-discovered
  // competitor footprints already pulled for the gap analysis (snapshot
  // `serpCompetitorPositions`) rather than uploaded CSVs. Ranked desc, capped at
  // SOV_SERP_TOP_N. A domain already shown as an uploaded competitor is NOT repeated
  // here. Empty when the snapshot predates v7.322 or has no overlap (honest gap, I.5).
  serpEntries:     Array<{ domain: string; capturedClicks: number; pct: number; kwCount: number }>;
  // donut slices: [client captured, ...uploaded competitors, ...top SERP rivals, open/uncaptured]
  rawEntries:      SovRawEntry[];
  total:           number;   // = availableClicks (donut denominator)
}

export function computeSov(
  { analysis, competitors, dbKeywords, clientLabel }:
  { analysis: any; competitors?: string[]; dbKeywords?: any[]; clientLabel?: string }
): SovComputed {
  const snap          = analysis.semrushSnapshot ?? {};
  const clientDomain  = (snap.domain ?? '') as string;
  const clientDisplay = (clientLabel ?? '').trim() || snap.domain || 'Client';

  // Build the SAME footprint pool the Google-Rank header + Keyword Landscape use,
  // so SoV reconciles with the Total/Ranked/Pg-1 cards by construction (Const II.7).
  // Thresholds 0 = full footprint (matches the panel's default render). Non-gap
  // items carry the client's real ranking positions.
  const pool = buildKwPool({
    semrushSnapshot:   snap,
    uploadedKeywords:  dbKeywords ?? [],
    clientDomain,
    competitorDomains: competitors ?? [],
    clientVolMin:      0,
    competitorVolMin:  0,
    includeDemand:     true,   // v7.305: fold missing-demand volume into the SoV denominator (full-footprint parity)
  });
  const ranked = pool.filter(i => !i.isGap);

  let totalVolMonthly = 0;
  let page1VolMonthly = 0;
  let page1KwCount    = 0;
  let capturedClicks  = 0;   // Σ volume × CTR(client position) for pos 1–10 — modeled
  for (const i of ranked) {
    const vol = i.searchVolume ?? 0;
    totalVolMonthly += vol;
    const p = i.position;
    if (p != null && p >= 1 && p <= 10) {
      page1VolMonthly += vol;
      page1KwCount++;
      capturedClicks  += vol * ctrAt(p);
    }
  }
  // Denominator: all page-1 clicks available across the footprint (Wayne's chosen
  // definition) = Σ(volume × PAGE1_CTR_SUM). Includes keywords ranking page-2+,
  // so their uncaptured clicks correctly sit in "open demand", not the numerator.
  const availableClicks = totalVolMonthly * PAGE1_CTR_SUM;
  const sovPct          = availableClicks > 0 ? capturedClicks / availableClicks : 0;

  // ── v7.246: competitor capture on the SAME footprint + denominator ──────────
  // A competitor's slice = Σ(footprint volume × CTR at competitor position, pos
  // ≤ 10) over the keywords it shares with the client footprint. Volume is the
  // footprint's measured value (one number per keyword, position-independent), so
  // every player is scored on the same real volumes (Const I.1) and the same
  // denominator (II.7). Competitor rankings are real uploaded rows (project_keywords
  // with domain = competitor + a Position); a competitor with rows but no page-1
  // overlap — or no positions at all — gets NO slice and is reported as an honest
  // gap (I.5), never a modeled or silent-zero share.
  const footprintVol = new Map<string, number>();
  for (const i of ranked) {
    const k = (i.keyword ?? '').toLowerCase().trim();
    if (k) footprintVol.set(k, i.searchVolume ?? 0);
  }
  const clientNorm = normSovDomain(clientDomain);
  const compCap = new Map<string, number>();   // domain → captured clicks
  const compKw  = new Map<string, number>();    // domain → page-1 overlap kw count
  const compDiag = new Map<string, { rows: number; withPos: number; minPos: number }>();
  for (const r of (dbKeywords ?? [])) {
    const dom = normSovDomain((r as any).domain ?? '');
    if (!dom || dom === clientNorm || (r as any).source === 'blocked') continue;
    let d = compDiag.get(dom);
    if (!d) { d = { rows: 0, withPos: 0, minPos: Infinity }; compDiag.set(dom, d); }
    d.rows++;
    const p = (r as any).position;
    if (p != null) { d.withPos++; if (p < d.minPos) d.minPos = p; }
    if (p == null || p < 1 || p > 10) continue;
    const k = ((r as any).keyword ?? '').toLowerCase().trim();
    if (!footprintVol.has(k)) continue;   // overlap only — keeps the denominator stable
    const vol = footprintVol.get(k) ?? 0;
    compCap.set(dom, (compCap.get(dom) ?? 0) + vol * ctrAt(p));
    compKw.set(dom,  (compKw.get(dom)  ?? 0) + 1);
  }
  const compEntries = Array.from(compCap.entries())
    .filter(([, c]) => c > 0)
    .map(([domain, capturedClicks]) => ({
      domain,
      capturedClicks,
      pct:     availableClicks > 0 ? capturedClicks / availableClicks : 0,
      kwCount: compKw.get(domain) ?? 0,
    }))
    .sort((a, b) => b.capturedClicks - a.capturedClicks);
  const sliced = new Set(compEntries.map(c => c.domain));
  const compGaps = Array.from(compDiag.entries())
    .filter(([dom]) => !sliced.has(dom))   // had rows but earned no page-1-overlap slice
    .map(([domain, d]) => ({
      domain,
      rows:         d.rows,
      hasPositions: d.withPos > 0,
      minPos:       isFinite(d.minPos) ? d.minPos : null,
    }));

  // ── v7.322: top SERP rivals on the SAME footprint + denominator ─────────────
  // Each Semrush auto-discovered competitor's slice = Σ(live footprint volume × CTR at
  // its real page-1 position) over keywords it shares with the client footprint —
  // identical basis to the uploaded-competitor slices above, just sourced from the
  // snapshot's `serpCompetitorPositions` (real positions already pulled for the gap
  // analysis, zero extra Semrush units) instead of uploaded CSV rows. Applying the LIVE
  // `footprintVol` keeps the denominator identical to the client's (Const II.7). A
  // domain already shown as an uploaded competitor is skipped so the two sections never
  // double-list one site. Ranked desc, capped at SOV_SERP_TOP_N (Wayne: top 3 sites).
  const snapSerpPos     = (snap.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>;
  const uploadedDomains = new Set(compDiag.keys());   // every competitor that had dbKeywords rows
  type SovCompEntry     = { domain: string; capturedClicks: number; pct: number; kwCount: number };
  const serpEntries: SovCompEntry[] = Object.entries(snapSerpPos)
    .map(([rawDom, positions]): SovCompEntry | null => {
      const dom = normSovDomain(rawDom);
      if (!dom || dom === clientNorm || uploadedDomains.has(dom)) return null;
      let captured = 0; let kw = 0;
      for (const pos of (positions ?? [])) {
        const p = pos.position;
        if (p == null || p < 1 || p > 10) continue;
        const k = (pos.keyword ?? '').toLowerCase().trim();
        if (!footprintVol.has(k)) continue;              // live footprint overlap only — stable denominator
        captured += (footprintVol.get(k) ?? 0) * ctrAt(p);
        kw++;
      }
      return captured > 0
        ? { domain: dom, capturedClicks: captured, pct: availableClicks > 0 ? captured / availableClicks : 0, kwCount: kw }
        : null;
    })
    .filter((e): e is SovCompEntry => e != null)
    .sort((a, b) => b.capturedClicks - a.capturedClicks)
    .slice(0, SOV_SERP_TOP_N);

  const compCapTotal = compEntries.reduce((s, c) => s + c.capturedClicks, 0);
  const serpCapTotal = serpEntries.reduce((s, c) => s + c.capturedClicks, 0);
  const openClicks   = Math.max(0, availableClicks - capturedClicks - compCapTotal - serpCapTotal);

  const rawEntries: SovRawEntry[] = availableClicks > 0
    ? [
        { domain: clientDisplay, traffic: capturedClicks, type: 'client', color: 'var(--c-6c63ff)' },
        ...compEntries.map((c, idx) => ({
          domain:  c.domain,
          traffic: c.capturedClicks,
          type:    'competitor' as const,
          color:   SOV_COMP_COLORS[idx % SOV_COMP_COLORS.length],
        })),
        ...serpEntries.map((c, idx) => ({
          domain:  c.domain,
          traffic: c.capturedClicks,
          type:    'serp' as const,
          color:   SOV_SERP_COLORS[idx % SOV_SERP_COLORS.length],
        })),
        { domain: 'Open / uncaptured demand', traffic: openClicks, type: 'open' as const, color: 'var(--c-2a2a44)' },
      ]
    : [];

  return {
    basis:           availableClicks > 0 ? 'capture' : 'empty',
    sovPct,
    capturedClicks,
    availableClicks,
    totalVolMonthly,
    page1VolMonthly,
    page1KwCount,
    totalKwCount:    ranked.length,
    clientDisplay,
    ctrSource:       CTR_SOURCE_LABEL,
    compEntries,
    compGaps,
    serpEntries,
    rawEntries,
    total:           availableClicks,
  };
}
