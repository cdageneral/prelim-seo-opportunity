/**
 * lib/pdf/programData.ts — v7.405
 *
 * The counts behind PART V (The Recommended Program) of the client assessment
 * report. Pure functions over data the app already holds, so the report and the
 * panels cannot drift (Const II.6/II.7) and every figure traces to a real row
 * (Const I.1).
 *
 * Sources, all real:
 *  - positions, volumes and ranking URLs come from the SHARED pool
 *    (buildKwPool), which since v7.254 backfills the uploaded CSV's URL onto a
 *    URL-less footprint row — so this works on Semrush-sourced AND upload-sourced
 *    projects without a re-scan.
 *  - topic counts come from the canonical topic map the journey panels build.
 *  - AI Overview / People Also Ask presence and citation are per-keyword SERP
 *    scan rows (v7.404).
 *
 * Nothing here is modeled. The ONE editorial choice is the 80% Pareto cut, which
 * is a stated threshold applied to real volumes — its rule is printed on the page.
 */

export interface ProgramPoolItem {
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  isGap:        boolean;
  url?:         string;
}

export interface ProgramTopicLike {
  keywords: Array<{ keyword: string }>;
}

export interface ProgramSerpKeyword {
  keyword:        string;
  hasAIO:         boolean;
  aioClientCited: boolean;
  hasPAA:         boolean;
  paaClientCited: boolean;
}

export interface ProgramBand {
  label: string; lo: number; hi: number;
  kws: number; urls: number; vol: number;
}

export interface ProgramUrlRow {
  url: string; kws: number; bestPos: number; vol: number; cumPct: number;
}

export interface ProgramData {
  /** WS1 — the striking-distance set (positions 4–20 on pages that already rank). */
  kw4to20:     number;
  urls4to20:   number;
  topics4to20: number;
  demand4to20: number;
  bands:       ProgramBand[];
  /** The 80% Pareto cut over those URLs, by real monthly demand. */
  paretoUrls:      number;
  paretoVol:       number;
  paretoSharePct:  number;
  excludedUrls:    number;
  topUrls:         ProgramUrlRow[];
  /** WS3 — AIO/PAA on the SAME keyword set, when a SERP feature scan exists. */
  aioShown:  number | null;
  aioCited:  number | null;
  paaShown:  number | null;
  paaCited:  number | null;
  featureScanned: number | null;
}

const BAND_DEFS: Array<{ label: string; lo: number; hi: number }> = [
  { label: 'Positions 4–5',   lo: 4,  hi: 5  },
  { label: 'Positions 6–10',  lo: 6,  hi: 10 },
  { label: 'Positions 11–20', lo: 11, hi: 20 },
];

const PARETO_TARGET = 0.80;   // stated on the page; applied to real volumes only

/**
 * Build the Part V counts. Returns null when the pool holds no 4–20 rows at all —
 * the caller then omits the section entirely rather than printing zeroes
 * (honest gap, Const I.5).
 */
export function buildProgramData(
  pool:      ProgramPoolItem[],
  topics:    ProgramTopicLike[] | null | undefined,
  serpKws:   ProgramSerpKeyword[] | null | undefined,
): ProgramData | null {
  // The striking-distance set: the client actually ranks 4–20 (never a gap row).
  const inBand = (pool ?? []).filter(k =>
    !k.isGap && typeof k.position === 'number' && (k.position as number) >= 4 && (k.position as number) <= 20);
  if (inBand.length === 0) return null;

  const demand4to20 = inBand.reduce((t, k) => t + (k.searchVolume || 0), 0);

  const withUrl = inBand.filter(k => typeof k.url === 'string' && (k.url as string).trim().length > 0);
  const urlKeys = new Set(withUrl.map(k => (k.url as string).trim()));

  const bands: ProgramBand[] = BAND_DEFS.map(b => {
    const rows = inBand.filter(k => (k.position as number) >= b.lo && (k.position as number) <= b.hi);
    const u = new Set(rows.filter(k => k.url && k.url.trim()).map(k => (k.url as string).trim()));
    return {
      label: b.label, lo: b.lo, hi: b.hi,
      kws: rows.length, urls: u.size,
      vol: rows.reduce((t, k) => t + (k.searchVolume || 0), 0),
    };
  });

  // Canonical topics touched by the set — counted off the same topic map the
  // journey panels render, so the two reconcile.
  const bandKw = new Set(inBand.map(k => k.keyword.toLowerCase().trim()));
  let topics4to20 = 0;
  for (const t of (topics ?? [])) {
    if ((t.keywords ?? []).some(k => bandKw.has(String(k.keyword ?? '').toLowerCase().trim()))) topics4to20++;
  }

  // ── the Pareto cut: fewest URLs carrying 80% of the set's real demand ──────
  const byUrl = new Map<string, { url: string; kws: number; bestPos: number; vol: number }>();
  for (const k of withUrl) {
    const u = (k.url as string).trim();
    const e = byUrl.get(u) ?? { url: u, kws: 0, bestPos: 999, vol: 0 };
    e.kws += 1;
    e.bestPos = Math.min(e.bestPos, k.position as number);
    e.vol += (k.searchVolume || 0);
    byUrl.set(u, e);
  }
  const ranked = Array.from(byUrl.values()).sort((a, b) => b.vol - a.vol);
  const urlVolTotal = ranked.reduce((t, e) => t + e.vol, 0);

  let cum = 0, cut = 0;
  for (const e of ranked) {
    cum += e.vol; cut += 1;
    if (urlVolTotal > 0 && cum / urlVolTotal >= PARETO_TARGET) break;
  }
  if (ranked.length === 0) { cut = 0; cum = 0; }

  let running = 0;
  const topUrls: ProgramUrlRow[] = ranked.slice(0, 6).map(e => {
    running += e.vol;
    return {
      url: e.url, kws: e.kws, bestPos: e.bestPos, vol: e.vol,
      cumPct: urlVolTotal > 0 ? (running / urlVolTotal) * 100 : 0,
    };
  });

  // ── AIO / PAA on the SAME keyword set (the Priority-1 pages) ───────────────
  let aioShown: number | null = null, aioCited: number | null = null;
  let paaShown: number | null = null, paaCited: number | null = null;
  let featureScanned: number | null = null;
  if (serpKws && serpKws.length > 0) {
    const scoped = serpKws.filter(s => bandKw.has(String(s.keyword ?? '').toLowerCase().trim()));
    featureScanned = scoped.length;
    aioShown = scoped.filter(s => s.hasAIO).length;
    aioCited = scoped.filter(s => s.hasAIO && s.aioClientCited).length;
    paaShown = scoped.filter(s => s.hasPAA).length;
    paaCited = scoped.filter(s => s.hasPAA && s.paaClientCited).length;
  }

  return {
    kw4to20: inBand.length,
    urls4to20: urlKeys.size,
    topics4to20,
    demand4to20,
    bands,
    paretoUrls: cut,
    paretoVol: Math.round(cum),
    paretoSharePct: urlVolTotal > 0 ? (cum / urlVolTotal) * 100 : 0,
    excludedUrls: Math.max(0, ranked.length - cut),
    topUrls,
    aioShown, aioCited, paaShown, paaCited, featureScanned,
  };
}
