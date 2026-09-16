/**
 * lib/insightsPanel/decision.ts — v7.496 · the Insights panel's DECISION INPUTS.
 *   v7.497: the serialised lists are BOUNDED (BRANDS_SHOWN / PLAYS_SHOWN, `playsBasis`)
 *   after every field figure is computed over the full measured set — measured on
 *   Sono Bello, the unbounded block was 847 KB and overran the generation prompt.
 *
 * Wayne (2026-09-15): "I need real insights on what is happening to the brand,
 * what are their high level problem areas and key opportunities. What the
 * competitors are doing successfully. Are there any local markets that have more
 * demand than others … Strong market insights to share with a CEO or CMO … where
 * the brand should invest, what impact would it have if it did abc, what is
 * holding them back from becoming a market leader and if they could achieve
 * market leader status what traffic or incremental gains could it have."
 *
 * The v7.471 engine received raw panel previews and had to dig with tools; it
 * ran out of turns and wrote what it found first — on Sono Bello it called a
 * weighted-average position of 32 "owns search rank" because the rank standing
 * never reached it. This module precomputes, in pure TypeScript over the SAME
 * shared bases every panel reads (Const II.6a / II.7), everything the engine
 * needs to REASON instead of dig:
 *
 *   standing  — client vs field average vs best-in-class, traditional search AND
 *               AI visibility, overall and per product line (measured; the one
 *               modeled row is the CTR-curve click capture, labeled).
 *   scenarios — "what if": modeled incremental clicks per move (match the leader,
 *               pos 4–10 → top 3, page 2 → page 1, take open demand) computed on
 *               the ONE approved CTR curve (Const I.5a / Art. IX — the same curve
 *               and constant as Share of Voice; volumes + positions are real rows,
 *               only the click multiplier is modeled). AI moves carry a share gap
 *               only — there is no click curve for AI answers and none is invented.
 *   plays     — per competitor: where its page-1 hold concentrates (lines, query
 *               types, page types from real URLs), local pack standing, AI
 *               presence — the facts behind "what they do well / where exposed".
 *   local     — demand by city (geo-modifier keywords with real volume), the
 *               client's hold there, the strongest rival, and the map-pack
 *               standing from the stored Local scan.
 *   shifts    — AI Overviews / PAA on the scanned SERPs, AI answer presence.
 *
 * Nothing here calls an API. Every number is either a stored row, a sum/count of
 * stored rows, or a labeled CTR-curve estimate. The generator receives this
 * object inside the data census, so every figure it quotes is verifiable by the
 * v7.463 number gate by construction. `history` is null and says why: the app
 * stores one snapshot per analysis — trends are a later metric ledger, not an inference.
 */

import { type SeerContext, ensureProductRows, normDomain } from '@/lib/seer/core';
import { computeSov, ctrAt, CTR_SOURCE_LABEL, normSovDomain } from '@/lib/sov/model';
import { buildRivalRankMap, accumulateLadder, type RivalRankMap, type ProductRow } from '@/lib/productInsights';
import { classifyLocalKeywords, buildClientRelevance } from '@/lib/local/detect';
import { buildShareOfLocalVoice, type LocalScan } from '@/lib/local/build';
import { buildQuadrant } from '@/lib/insightsPanel/build';

// ─── shapes ──────────────────────────────────────────────────────────────────

export type StandingWord = 'leads' | 'above' | 'below' | 'last' | 'unmeasured';

export interface StandingRow {
  key: string;
  metric: string;
  unit: 'pct' | 'pos' | 'count' | 'volume';
  basis: 'measured' | 'modeled';
  client: number | null;
  fieldAvg: number | null;            // arithmetic mean over the OTHER measured brands
  best: { domain: string; value: number } | null;   // best-in-class (may be the client)
  clientRank: number | null;
  of: number;                         // brands measured on this metric (incl. client when measured)
  standing: StandingWord;
  /** v7.497 — the top BRANDS_SHOWN of the ranked list (+ the client wherever it sits). `of`, `fieldAvg`,
   *  `best` and `clientRank` are computed over ALL `of` brands BEFORE this cut; the list is bounded only
   *  so the block stays a prompt-sized payload (Sono Bello measured 620 brands per row = 87 KB per table). */
  brands: Array<{ domain: string; value: number; isClient: boolean }>;
  brandsShown: number;                // v7.497 — brands.length (≤ BRANDS_SHOWN + 1)
  note: string;
}

/** v7.497 — serialisation bounds. Field maths never depend on these: every average, rank and count is
 *  computed over the full measured set first; only the lists that ride in the response / the prompt are cut. */
export const BRANDS_SHOWN = 10;   // ranked brands listed per standing row (the client is always included)
export const PLAYS_SHOWN  = 12;   // rival plays listed beyond the tracked competitors (by page-1 volume held)

export interface LineStanding {
  product: string;
  demandMonthly: number;
  kwCount: number;
  client: { p1Vol: number; p1Share: number; rank: number | null; bands: [number, number, number, number] };
  /** the ONE standing word every surface renders for this line (Const II.7): rank 1 = leads; no page-1
   *  hold with ranked rows = last (a real 0, not a gap); no ranked rows at all = unmeasured. */
  standing: StandingWord;
  fieldAvgP1Vol: number | null;
  best: { domain: string; p1Vol: number; isClient: boolean } | null;
  brandsOnLadder: number;
  ladderTop: Array<{ domain: string; p1Vol: number; p1Kw: number; kind: string }>;
  ai: {
    probeMentionRate: number | null;   // 0–1, LLM probe (client)
    probeMentions: number | null; probeTotal: number | null;
    answerShare: number | null;        // 0–1, DataForSEO LLM-mentions scan (client)
    citedLeader: { domain: string; count: number; isClient: boolean } | null;
    clientCited: number | null;
  };
  serp: { aioAvail: number; aioAcq: number; aioRate: number; paaAvail: number; paaAcq: number; paaRate: number } | null;
}

export interface Scenario {
  key: 'matchLeader' | 'top3FromP410' | 'page1FromP2' | 'openDemand' | 'aioCitations';
  label: string;
  basis: 'modeled' | 'measured';
  keywords: number;
  volumeMonthly: number;               // real Semrush volume of the keywords in this move
  clicksMonthlyFloor: number | null;   // modeled incremental clicks/mo (conservative target)
  clicksMonthlyCeiling: number | null; // modeled incremental clicks/mo (best-case target)
  floorTarget: string; ceilingTarget: string;
  perLine: Array<{ product: string; keywords: number; volumeMonthly: number; clicksMonthlyFloor: number | null; clicksMonthlyCeiling: number | null }>;
  note: string;
}

export interface Scenarios {
  currentClicksMonthly: number;        // modeled clicks the client wins today across the landscape (page 1)
  leaderClicksMonthly: number | null;  // modeled clicks the current best-in-class brand wins today
  leaderDomain: string | null;
  moves: Scenario[];
  ctrSource: string;
  basis: string;
}

export interface CompetitorPlay {
  domain: string;
  kind: 'tracked' | 'rival' | 'serp';
  landscape: { p1Vol: number; p1Kw: number; top3Vol: number; top3Kw: number; measuredKw: number; rank: number | null };
  linesWon: Array<{ product: string; rank: number; p1Vol: number; p1Kw: number }>;   // where they hold page-1 volume
  linesAbsent: string[];                                                             // lines with no page-1 hold
  queryMix: Array<{ type: string; kw: number; volume: number }>;                     // page-1 keywords by query type
  pageTypes: Array<{ type: string; urls: number }> | null;                            // from real ranking URLs (uploaded rows), null when none
  outrankedByClient: { kw: number; volume: number };                                  // keywords where the client sits above them
  outranksClient: { kw: number; volume: number };
  local: { packAppearances: number; packShare: number; avgRating: number | null; maxReviews: number } | null;
  ai: { namedPct: number | null; citations: number | null } | null;                   // Profound export, when matched
}

export interface LocalMarket {
  city: string;
  demandMonthly: number;
  kwCount: number;
  client: { p1Kw: number; p1Vol: number; bestPos: number | null; rankedKw: number };
  topRival: { domain: string; p1Vol: number; p1Kw: number } | null;
  pack: { cells: number; withPack: number; clientBestRank: number | null; clientInPack: number; leaders: string[]; clientReviews: number | null; leaderReviews: number | null } | null;
}

export interface LocalMarkets {
  markets: LocalMarket[];
  nearMe: { kwCount: number; demandMonthly: number; clientP1Kw: number; clientP1Vol: number };
  geoTotal: { kwCount: number; demandMonthly: number; cities: number };
  scan: { locations: number; scannedCells: number; withPack: number; clientInPack: number; clientRank1: number; builtAt: string | null } | null;
  packLeaders: Array<{ name: string; appearances: number; sharePct: number; avgRating: number | null; maxReviews: number; isClient: boolean }>;
  basis: string;
}

export interface Shifts {
  serp: { scanned: number; withAIO: number; aioClientCited: number; withPAA: number; paaClientCited: number; aioVolumeMonthly: number; aioUncitedVolumeMonthly: number } | null;
  aiAnswers: { probeMentions: number; probeTotal: number; linesScanned: number; linesWithClientShare: number } | null;
  history: null;
  historyNote: string;
}

/** v7.497 — what the bounded `plays` list is a cut of. `measured` counts every non-client brand on the
 *  landscape ladder; `withPage1` those holding any page-1 volume; `shown` = plays.length. */
export interface PlaysBasis {
  measured: number;
  withPage1: number;
  tracked: number;
  shown: number;
  rule: string;
}

export interface DecisionInputs {
  clientDomain: string;
  standing: { search: StandingRow[]; ai: StandingRow[]; lines: LineStanding[]; basis: string };
  scenarios: Scenarios;
  plays: CompetitorPlay[];
  playsBasis: PlaysBasis;   // v7.497
  local: LocalMarkets | null;
  shifts: Shifts;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

function rankWord(clientRank: number | null, of: number, client: number | null, fieldAvg: number | null, higherIsBetter = true): StandingWord {
  if (client == null || clientRank == null || of === 0) return 'unmeasured';
  if (clientRank === 1 && of > 1) return 'leads';
  if (of > 1 && clientRank === of) return 'last';
  if (fieldAvg == null) return of === 1 ? 'unmeasured' : 'below';
  return (higherIsBetter ? client >= fieldAvg : client <= fieldAvg) ? 'above' : 'below';
}

function standingRow(
  key: string, metric: string, unit: StandingRow['unit'], basis: StandingRow['basis'],
  brands: Array<{ domain: string; value: number; isClient: boolean }>, clientMeasured: boolean, note: string,
  higherIsBetter = true,
): StandingRow {
  const sorted = [...brands].sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
  const ci = sorted.findIndex(b => b.isClient);
  const client = ci >= 0 ? sorted[ci].value : null;
  const others = sorted.filter(b => !b.isClient).map(b => b.value);
  const fieldAvg = mean(others);
  const best = sorted[0] ? { domain: sorted[0].domain, value: sorted[0].value } : null;
  const of = sorted.length;
  const clientRank = ci >= 0 ? ci + 1 : null;
  // v7.497 — the list is bounded AFTER every field figure above is computed over all `of` brands.
  const shown = sorted.slice(0, BRANDS_SHOWN);
  if (ci >= BRANDS_SHOWN) shown.push(sorted[ci]);
  return {
    key, metric, unit, basis, client, fieldAvg: fieldAvg == null ? null : (unit === 'pct' ? r1(fieldAvg) : r0(fieldAvg)),
    best, clientRank, of,
    standing: clientMeasured ? rankWord(clientRank, of, client, fieldAvg, higherIsBetter) : 'unmeasured',
    brands: shown, brandsShown: shown.length, note,
  };
}

const QUERY_TYPES: Array<{ type: string; re: RegExp }> = [
  { type: 'cost / pricing',         re: /\b(cost|costs|price|prices|pricing|how much|cheap|affordable|financing|payment plan|\$)\b/ },
  { type: 'local (near me / city)', re: /\b(near me|nearby|near by|closest|in my area)\b/ },
  { type: 'reviews / results',      re: /\b(review|reviews|before and after|before & after|results|testimonial|testimonials|rating|ratings|gallery|photos)\b/ },
  { type: 'comparison',             re: /\b(vs|versus|alternative|alternatives|best|top|compare|comparison|difference between|better than|or)\b/ },
  { type: 'informational',          re: /\b(what is|what are|how does|how do|does|is it|can you|should i|recovery|risks?|side effects?|pain|painful|safe|candidate|worth it|last|long|after|swelling|scar|scars|permanent)\b/ },
];
const PAGE_TYPES: Array<{ type: string; re: RegExp }> = [
  { type: 'location page',     re: /\/(locations?|clinics?|offices?|centers?|centres?|near-me|areas?-served|find-a-|our-locations)\b|\/[a-z-]+-(tx|ca|fl|ny|az|il|ga|nc|wa|co|mn|oh|pa|nj|va|md|mi|or|nv|tn|mo|wi|ut|sc|ok|ks|ky|ct|ia|ar|ms|nm|ne|id|hi|nh|me|mt|ri|de|sd|nd|ak|vt|wv|wy|al|la|in|ma)\b/ },
  { type: 'cost / pricing page', re: /\/(cost|costs|price|prices|pricing|financing|specials?|promotions?|offers?)\b/ },
  { type: 'before & after / gallery', re: /\/(before-and-after|before-after|gallery|results|photos|case-studies)\b/ },
  { type: 'blog / guide / FAQ', re: /\/(blog|blogs|articles?|guides?|faqs?|resources?|news|learn|education|insights?|library|knowledge)\b/ },
  { type: 'reviews page',      re: /\/(reviews?|testimonials?)\b/ },
];
function queryType(kw: string): string {
  const k = ' ' + kw.toLowerCase().replace(/[^a-z0-9$ ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  for (const q of QUERY_TYPES) if (q.re.test(k)) return q.type;
  return 'core procedure / service';
}
function pageType(url: string): string {
  let path = '';
  try { path = new URL(/^https?:/i.test(url) ? url : 'https://' + url).pathname.toLowerCase(); } catch { path = String(url ?? '').toLowerCase(); }
  if (path === '/' || path === '') return 'home page';
  for (const p of PAGE_TYPES) if (p.re.test(path)) return p.type;
  return 'procedure / service page';
}

/** best rival position on a keyword (any non-client domain in the rank map). */
function bestRivalPos(rm: RivalRankMap, kw: string): { domain: string; pos: number } | null {
  const m = rm.perKw.get(kw);
  if (!m) return null;
  let best: { domain: string; pos: number } | null = null;
  m.forEach((p, dom) => { if (!best || p < best.pos) best = { domain: dom, pos: p }; });
  return best;
}
/** the client's modeled CTR at its stored position — page 1 by the curve, page 2+ by the small tail, unranked 0. */
function clientCtr(pos: number | null): number {
  if (pos == null || pos < 1) return 0;
  return ctrAt(pos);
}

// ─── the builder ─────────────────────────────────────────────────────────────

export function buildDecisionInputs(ctx: SeerContext): DecisionInputs {
  const { project, analysis, snap, rawSnap, pool, dbKeywords, clientDomain, competitorDomains } = ctx;
  const clientNorm = normSovDomain(clientDomain);
  const products: ProductRow[] = ensureProductRows(ctx);

  // ── the ONE rival rank map (uploaded rows > Semrush rivals > SERP occupants), v7.492 ──
  const rm = buildRivalRankMap({
    uploadedKeywords: dbKeywords,
    serpPositions: ((snap as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
    serpScan: ((analysis as any)?.serpApiSnapshot ?? null) as any,
    clientDomain,
    trackedCompetitors: competitorDomains,
  });

  // ── the landscape (v7.405 definition): non-branded pool rows, one volume per keyword ──
  const landscape = pool.filter(i => !i.isBranded).map(i => ({
    keyword: i.keyword.toLowerCase().trim(), searchVolume: i.searchVolume || 0,
    position: (i.position != null && !i.featurePlacement) ? i.position : null, isGap: i.isGap,
  }));
  const landscapeVol = new Map<string, number>();
  const clientPos = new Map<string, number | null>();
  for (const k of landscape) { if (!landscapeVol.has(k.keyword)) { landscapeVol.set(k.keyword, k.searchVolume); clientPos.set(k.keyword, k.isGap ? null : k.position); } }
  const landscapeKws = Array.from(landscapeVol.entries()).map(([keyword, searchVolume]) => ({ keyword, searchVolume, position: clientPos.get(keyword) ?? null }));

  // ── STANDING · traditional search ───────────────────────────────────────────
  // (a) modeled page-1 click capture — Share of Voice, same builder as the SoV panel
  let sov: ReturnType<typeof computeSov> | null = null;
  try {
    sov = analysis && snap ? computeSov({ analysis: { ...(analysis as any), semrushSnapshot: snap }, competitors: competitorDomains, dbKeywords, clientLabel: (project as any).clientName ?? '' }) : null;
  } catch { sov = null; }
  const captureBrands: Array<{ domain: string; value: number; isClient: boolean }> = [];
  if (sov && sov.basis === 'capture') {
    captureBrands.push({ domain: clientNorm, value: r1(sov.sovPct * 100), isClient: true });
    for (const c of sov.compEntries) captureBrands.push({ domain: c.domain, value: r1(c.pct * 100), isClient: false });
    for (const c of sov.serpEntries) captureBrands.push({ domain: c.domain, value: r1(c.pct * 100), isClient: false });
  }
  // (b) measured page-1 volume held on the landscape — the v7.492 ladder over ALL landscape keywords
  const ladderAll = accumulateLadder(landscapeKws, rm, clientNorm);
  const p1Brands = ladderAll.ladder.map(e => ({ domain: e.domain, value: e.p1Vol, isClient: e.kind === 'client' }));
  // a client with ranked rows but no page-1 hold is MEASURED at 0 (the ladder omits it by design — honest gap for rivals, a real 0 for the client)
  // (c) measured top-3 volume held
  const top3ByDom = new Map<string, { vol: number; kw: number }>();
  let clientTop3Vol = 0, clientTop3Kw = 0, clientP1Vol = 0, clientP1Kw = 0, wposNum = 0, wposDen = 0, clientRankedKw = 0;
  const clientBands: [number, number, number, number] = [0, 0, 0, 0];
  for (const k of landscapeKws) {
    const p = k.position;
    if (p != null && p >= 1) {
      clientRankedKw++;
      wposNum += p * k.searchVolume; wposDen += k.searchVolume;
      if (p <= 3) { clientTop3Vol += k.searchVolume; clientTop3Kw++; clientBands[0] += k.searchVolume; }
      else if (p <= 10) clientBands[1] += k.searchVolume;
      else if (p <= 20) clientBands[2] += k.searchVolume;
      else clientBands[3] += k.searchVolume;
      if (p <= 10) { clientP1Vol += k.searchVolume; clientP1Kw++; }
    }
    const m = rm.perKw.get(k.keyword);
    if (m) m.forEach((bp, dom) => {
      if (bp >= 1 && bp <= 3) { const e = top3ByDom.get(dom) ?? { vol: 0, kw: 0 }; e.vol += k.searchVolume; e.kw++; top3ByDom.set(dom, e); }
    });
  }
  if (clientRankedKw > 0 && !p1Brands.some(b => b.isClient)) p1Brands.push({ domain: clientNorm, value: 0, isClient: true });
  const top3Brands: Array<{ domain: string; value: number; isClient: boolean }> = [];
  if (clientRankedKw > 0) top3Brands.push({ domain: clientNorm, value: clientTop3Vol, isClient: true });
  top3ByDom.forEach((e, dom) => { if (e.vol > 0) top3Brands.push({ domain: dom, value: e.vol, isClient: false }); });
  const wtdAvgPos = wposDen > 0 ? r1(wposNum / wposDen) : null;

  const search: StandingRow[] = [
    standingRow('capture', 'Page-1 click capture (share of voice)', 'pct', 'modeled', captureBrands, captureBrands.some(b => b.isClient),
      `Modeled estimate — ${CTR_SOURCE_LABEL} CTR curve over real volumes and positions on the ${sov?.landscapeKwCount ?? landscapeKws.length}-keyword non-branded landscape; every brand scored on the same keywords (Const I.5a).`),
    standingRow('p1vol', 'Page-1 search volume held (monthly)', 'volume', 'measured', p1Brands, ladderAll.clientP1Vol > 0 || clientRankedKw > 0,
      'Measured — Σ real Semrush volume of landscape keywords where the brand holds a stored position 1–10. Competitor positions come from uploaded rows, Semrush rival positions and the SERP scan (the v7.492 rank map).'),
    standingRow('top3vol', 'Top-3 search volume held (monthly)', 'volume', 'measured', top3Brands, clientRankedKw > 0,
      'Measured — Σ real volume of landscape keywords where the brand holds a stored position 1–3.'),
  ];
  // weighted average position — client only (competitor rank coverage differs per brand; not comparable)
  search.push({
    key: 'wpos', metric: 'Weighted average position (client)', unit: 'pos', basis: 'measured',
    client: wtdAvgPos, fieldAvg: null, best: null, clientRank: null, of: wtdAvgPos == null ? 0 : 1,
    standing: 'unmeasured', brands: wtdAvgPos == null ? [] : [{ domain: clientNorm, value: wtdAvgPos, isClient: true }], brandsShown: wtdAvgPos == null ? 0 : 1,
    note: `Measured — volume-weighted mean of the client's stored positions over ${clientRankedKw} ranked landscape keywords. Client only: rival rank coverage differs per brand, so a field average would not be like-for-like. Bands (monthly volume): pos 1–3 ${clientBands[0]}, 4–10 ${clientBands[1]}, 11–20 ${clientBands[2]}, 21+ ${clientBands[3]}.`,
  });

  // ── STANDING · AI visibility ─────────────────────────────────────────────────
  const ai: StandingRow[] = [];
  let quadrant: ReturnType<typeof buildQuadrant> = null;
  try { quadrant = buildQuadrant((project as any).profoundData ?? null); } catch { quadrant = null; }
  if (quadrant) {
    const named = [...quadrant.points.map(p => ({ domain: p.brand, value: r1(p.visibilityPct), isClient: p.isClient })),
                   ...quadrant.unmatched.map(u => ({ domain: u.brand, value: r1(u.visibilityPct), isClient: u.isClient }))];
    ai.push(standingRow('aiNamed', 'Named in AI answers (share of tracked prompts)', 'pct', 'measured', named, named.some(b => b.isClient),
      'Measured — stored Profound export: % of tracked prompts whose answers name the brand.'));
    const cited = quadrant.points.map(p => ({ domain: p.brand, value: p.citations, isClient: p.isClient }));
    ai.push(standingRow('aiCited', 'AI-answer citations of the brand domain', 'count', 'measured', cited, cited.some(b => b.isClient),
      `Measured — stored Profound export citation counts for each brand's matched domain.${quadrant.unmatched.length ? ` Not matchable (unmeasured, not zero): ${quadrant.unmatched.map(u => u.brand).join(', ')}.` : ''}`));
  } else {
    ai.push({ key: 'aiNamed', metric: 'Named in AI answers (share of tracked prompts)', unit: 'pct', basis: 'measured', client: null, fieldAvg: null, best: null, clientRank: null, of: 0, standing: 'unmeasured', brands: [], brandsShown: 0, note: 'UNMEASURED for every brand — no Profound export is stored for this project. Upload it in AI Answer Engines to measure the field.' });
  }
  // LLM probe (client only) + DataForSEO answer share + cited-domain leaders per line — aggregated across lines in TS
  let probeM = 0, probeT = 0, linesScanned = 0, linesWithShare = 0;
  const citedAgg = new Map<string, { count: number; isClient: boolean }>();
  for (const p of products) {
    if (p.probe) { probeM += p.probe.mentions; probeT += p.probe.total; }
    if (p.scan) { linesScanned++; if ((p.dfsShare ?? 0) > 0) linesWithShare++; }
    for (const c of p.citedTop) { const e = citedAgg.get(c.domain) ?? { count: 0, isClient: c.isClient }; e.count += c.count; citedAgg.set(c.domain, e); }
  }
  ai.push({
    key: 'probe', metric: 'AI answers naming the brand (LLM probe, client)', unit: 'pct', basis: 'measured',
    client: probeT > 0 ? r1((probeM / probeT) * 100) : null, fieldAvg: null, best: null, clientRank: null, of: probeT > 0 ? 1 : 0,
    standing: 'unmeasured', brands: probeT > 0 ? [{ domain: clientNorm, value: r1((probeM / probeT) * 100), isClient: true }] : [], brandsShown: probeT > 0 ? 1 : 0,
    note: probeT > 0 ? `Measured — ${probeM} unbranded mentions across ${probeT} completed Claude + ChatGPT probes (client only; competitors are not probed).` : 'UNMEASURED — no LLM probe results stored.',
  });
  const citedBrands = Array.from(citedAgg.entries()).map(([domain, e]) => ({ domain, value: e.count, isClient: e.isClient }));
  ai.push(standingRow('aiCitedScan', 'Domains cited in recorded AI answers (product scans)', 'count', 'measured', citedBrands, citedBrands.some(b => b.isClient),
    citedBrands.length ? `Measured — citation counts summed over the ${linesScanned} product lines with a stored AI scan (DataForSEO LLM Mentions: Google AI Overviews + ChatGPT).` : 'UNMEASURED — no product-line AI scans stored (run Scan AI on Product Insights).'));

  // ── STANDING · per product line ─────────────────────────────────────────────
  const lines: LineStanding[] = products.map(p => {
    const others = p.ladder.filter(e => e.kind !== 'client');
    const best = p.ladder[0] ? { domain: p.ladder[0].domain, p1Vol: p.ladder[0].p1Vol, isClient: p.ladder[0].kind === 'client' } : null;
    const you = p.ladder.find(e => e.kind === 'client');
    const sf = p.serpFeatures;
    const fieldAvgP1Vol = others.length ? r0(others.reduce((s, e) => s + e.p1Vol, 0) / others.length) : null;
    const clientRankedVol = p.bands[0] + p.bands[1] + p.bands[2] + p.bands[3];
    const lineWord: StandingWord = p.clientRank != null
      ? (p.clientRank === 1 ? 'leads' : (p.ladder.length > 1 && p.clientRank === p.ladder.length) ? 'last' : (fieldAvgP1Vol != null && (you?.p1Vol ?? 0) >= fieldAvgP1Vol) ? 'above' : 'below')
      : (clientRankedVol > 0 && others.length > 0 ? 'last' : 'unmeasured');
    return {
      product: p.name, demandMonthly: p.demand, kwCount: p.kwCount,
      client: { p1Vol: you?.p1Vol ?? 0, p1Share: r1(p.p1Share * 100), rank: p.clientRank, bands: p.bands },
      standing: lineWord,
      fieldAvgP1Vol,
      best, brandsOnLadder: p.ladder.length,
      ladderTop: p.ladder.slice(0, 6).map(e => ({ domain: e.domain, p1Vol: e.p1Vol, p1Kw: e.p1Kw, kind: e.kind })),
      ai: {
        probeMentionRate: p.aiRate, probeMentions: p.probe?.mentions ?? null, probeTotal: p.probe?.total ?? null,
        answerShare: p.dfsShare,
        citedLeader: p.citedTop[0] ? { domain: p.citedTop[0].domain, count: p.citedTop[0].count, isClient: p.citedTop[0].isClient } : null,
        clientCited: p.citedTop.find(c => c.isClient)?.count ?? (p.scan ? 0 : null),
      },
      serp: sf ? { aioAvail: sf.aioAvail, aioAcq: sf.aioAcq, aioRate: sf.aioRate, paaAvail: sf.paaAvail, paaAcq: sf.paaAcq, paaRate: sf.paaRate } : null,
    };
  });

  // ── SCENARIOS (modeled on the one approved CTR curve, Const I.5a) ────────────
  // per-keyword → per-line attribution reads each product's canonical keywords
  const kwLine = new Map<string, string>();
  for (const p of products) for (const t of p.topics) for (const k of (t.keywords as any[])) {
    const kk = String(k?.keyword ?? '').toLowerCase().trim(); if (kk && !kwLine.has(kk)) kwLine.set(kk, p.name);
  }
  type Acc = { kw: number; vol: number; floor: number; ceil: number };
  const newAcc = (): Acc => ({ kw: 0, vol: 0, floor: 0, ceil: 0 });
  const perLine = (): Map<string, Acc> => new Map();
  const bump = (m: Map<string, Acc>, kw: string, vol: number, floor: number, ceil: number) => {
    const line = kwLine.get(kw) ?? '(unassigned)';
    const a = m.get(line) ?? newAcc(); a.kw++; a.vol += vol; a.floor += floor; a.ceil += ceil; m.set(line, a);
  };
  const S = { matchLeader: perLine(), top3: perLine(), page1: perLine(), open: perLine() };
  let currentClicks = 0;
  const brandClicks = new Map<string, number>();
  for (const k of landscapeKws) {
    const v = k.searchVolume; const p = k.position; const cur = clientCtr(p);
    if (p != null && p >= 1 && p <= 10) currentClicks += v * cur;
    const m = rm.perKw.get(k.keyword);
    if (m) m.forEach((bp, dom) => { if (bp >= 1 && bp <= 10) brandClicks.set(dom, (brandClicks.get(dom) ?? 0) + v * ctrAt(bp)); });
    const rival = bestRivalPos(rm, k.keyword);
    // match the leader: take the best rival's position wherever it beats the client (floor = that position, ceiling = position 1)
    if (rival && rival.pos <= 10 && (p == null || rival.pos < p)) {
      bump(S.matchLeader, k.keyword, v, v * Math.max(0, ctrAt(rival.pos) - cur), v * Math.max(0, ctrAt(1) - cur));
    }
    if (p != null && p >= 4 && p <= 10) bump(S.top3, k.keyword, v, v * (ctrAt(3) - cur), v * (ctrAt(1) - cur));
    if (p != null && p >= 11 && p <= 20) bump(S.page1, k.keyword, v, v * (ctrAt(10) - cur), v * (ctrAt(5) - cur));
    if ((p == null || p > 20) && rival && rival.pos <= 10) bump(S.open, k.keyword, v, v * Math.max(0, ctrAt(rival.pos) - cur), v * Math.max(0, ctrAt(3) - cur));
  }
  const toScenario = (key: Scenario['key'], label: string, m: Map<string, Acc>, floorTarget: string, ceilingTarget: string, note: string): Scenario => {
    const rows = Array.from(m.entries()).map(([product, a]) => ({ product, keywords: a.kw, volumeMonthly: a.vol, clicksMonthlyFloor: r0(a.floor), clicksMonthlyCeiling: r0(a.ceil) }))
      .sort((a, b) => (b.clicksMonthlyFloor ?? 0) - (a.clicksMonthlyFloor ?? 0));
    const tot = rows.reduce((t, r) => ({ kw: t.kw + r.keywords, vol: t.vol + r.volumeMonthly, f: t.f + (r.clicksMonthlyFloor ?? 0), c: t.c + (r.clicksMonthlyCeiling ?? 0) }), { kw: 0, vol: 0, f: 0, c: 0 });
    return { key, label, basis: 'modeled', keywords: tot.kw, volumeMonthly: tot.vol, clicksMonthlyFloor: r0(tot.f), clicksMonthlyCeiling: r0(tot.c), floorTarget, ceilingTarget, perLine: rows, note };
  };
  // AIO citations — measured volume at stake, no click model
  const serpKws: any[] = ((analysis as any)?.serpApiSnapshot?.keywords ?? []) as any[];
  let withAIO = 0, aioCited = 0, withPAA = 0, paaCited = 0, aioVol = 0, aioUncitedVol = 0, aioUncitedKw = 0;
  const aioLine = perLine();
  for (const row of serpKws) {
    const kw = String(row?.keyword ?? '').toLowerCase().trim();
    const v = landscapeVol.get(kw) ?? 0;
    if (row?.hasAIO) {
      withAIO++; aioVol += v;
      const cited = Array.isArray(row?.aioSources) && row.aioSources.some((s: any) => normDomain(String(s?.domain ?? '')) === clientNorm);
      if (cited) aioCited++; else { aioUncitedVol += v; aioUncitedKw++; bump(aioLine, kw, v, 0, 0); }
    }
    if (Array.isArray(row?.paaQuestions) && row.paaQuestions.length) { withPAA++; if (row?.paaClientCited) paaCited++; }
  }
  const aioScenario: Scenario = {
    key: 'aioCitations', label: 'Win the AI Overview citation on scanned keywords that show one without you', basis: 'measured',
    keywords: aioUncitedKw, volumeMonthly: aioUncitedVol, clicksMonthlyFloor: null, clicksMonthlyCeiling: null,
    floorTarget: 'cited in the AI Overview', ceilingTarget: 'cited in the AI Overview',
    perLine: Array.from(aioLine.entries()).map(([product, a]) => ({ product, keywords: a.kw, volumeMonthly: a.vol, clicksMonthlyFloor: null, clicksMonthlyCeiling: null })).sort((a, b) => b.volumeMonthly - a.volumeMonthly),
    note: 'Measured volume at stake only — there is no published click curve for AI Overview citations, so no click figure is modeled.',
  };
  let leaderDomain: string | null = null; let leaderClicks: number | null = null;
  for (const [dom, c] of Array.from(brandClicks.entries())) { if (leaderClicks == null || c > leaderClicks) { leaderClicks = c; leaderDomain = dom; } }
  if (leaderClicks == null || currentClicks > leaderClicks) { leaderDomain = clientNorm; leaderClicks = currentClicks; }
  const scenarios: Scenarios = {
    currentClicksMonthly: r0(currentClicks),
    leaderClicksMonthly: leaderClicks == null ? null : r0(leaderClicks), leaderDomain,
    moves: [
      toScenario('matchLeader', 'Match the best-ranked rival on every keyword where one outranks you (market-leader parity)', S.matchLeader,
        'the best rival\'s current position', 'position 1', 'Modeled — for each landscape keyword where a rival holds a better page-1 position than the client, the click difference on the CTR curve between the client\'s position today and the rival\'s (floor) or position 1 (ceiling).'),
      toScenario('top3FromP410', 'Move positions 4–10 into the top 3', S.top3, 'position 3', 'position 1',
        'Modeled — client keywords currently at 4–10; incremental clicks to position 3 (floor) or 1 (ceiling).'),
      toScenario('page1FromP2', 'Move page 2 onto page 1', S.page1, 'position 10', 'position 5',
        'Modeled — client keywords currently at 11–20; incremental clicks to position 10 (floor) or 5 (ceiling).'),
      toScenario('openDemand', 'Take open demand rivals already hold on page 1 (client unranked or page 3+)', S.open, 'the best rival\'s position', 'position 3',
        'Modeled — keywords with no client position (or 21+) where a rival holds page 1; clicks at the rival\'s position (floor) or position 3 (ceiling).'),
      aioScenario,
    ],
    ctrSource: CTR_SOURCE_LABEL,
    basis: `Modeled estimates (Const I.5a): incremental monthly clicks = real Semrush volume × the difference in ${CTR_SOURCE_LABEL} CTR between today's stored position and the target position. Volumes and positions are stored rows; only the click multiplier is modeled — the same curve and constant Share of Voice uses. Multiply by 12 for annual. AI moves carry measured volume only.`,
  };

  // ── COMPETITOR PLAYS ─────────────────────────────────────────────────────────
  // local pack rows (by business name) for the play's local block
  const localScan = (rawSnap?._localScan ?? null) as LocalScan | null;
  const solv = localScan?.keywords?.length ? buildShareOfLocalVoice(localScan.keywords) : [];
  const brandRoot = (d: string) => normSovDomain(d).split('.')[0] ?? '';
  const squash = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const plays: CompetitorPlay[] = [];
  const brandKwPos = new Map<string, Array<{ kw: string; pos: number; vol: number }>>();
  rm.perKw.forEach((m, kw) => m.forEach((p, dom) => { const a = brandKwPos.get(dom) ?? []; a.push({ kw, pos: p, vol: landscapeVol.get(kw) ?? 0 }); brandKwPos.set(dom, a); }));
  const urlsByDom = new Map<string, Set<string>>();
  for (const r of dbKeywords) {
    const dom = normSovDomain(r?.domain ?? ''); const u = String(r?.url ?? '').trim();
    if (!dom || dom === clientNorm || !u || r?.source === 'blocked') continue;
    const s = urlsByDom.get(dom) ?? new Set(); s.add(u); urlsByDom.set(dom, s);
  }
  const ladderRank = new Map<string, number>(ladderAll.ladder.map((e, i) => [e.domain, i + 1]));
  for (const e of ladderAll.ladder) {
    if (e.kind === 'client') continue;
    const rows = brandKwPos.get(e.domain) ?? [];
    const p1 = rows.filter(r => r.pos <= 10 && landscapeVol.has(r.kw));
    const t3 = top3ByDom.get(e.domain) ?? { vol: 0, kw: 0 };
    const mix = new Map<string, { kw: number; volume: number }>();
    for (const r of p1) { const t = queryType(r.kw); const a = mix.get(t) ?? { kw: 0, volume: 0 }; a.kw++; a.volume += r.vol; mix.set(t, a); }
    const outBy = { kw: 0, volume: 0 }; const outs = { kw: 0, volume: 0 };
    for (const r of rows) {
      const cp = clientPos.get(r.kw); if (!landscapeVol.has(r.kw)) continue;
      if (cp != null && cp < r.pos) { outBy.kw++; outBy.volume += r.vol; }
      else if (r.pos <= 10 && (cp == null || cp > r.pos)) { outs.kw++; outs.volume += r.vol; }
    }
    const won: CompetitorPlay['linesWon'] = []; const absent: string[] = [];
    for (const p of products) {
      const i = p.ladder.findIndex(x => x.domain === e.domain);
      if (i >= 0) won.push({ product: p.name, rank: i + 1, p1Vol: p.ladder[i].p1Vol, p1Kw: p.ladder[i].p1Kw }); else absent.push(p.name);
    }
    won.sort((a, b) => b.p1Vol - a.p1Vol);
    const urls = urlsByDom.get(e.domain);
    const pt = new Map<string, number>();
    if (urls) urls.forEach(u => pt.set(pageType(u), (pt.get(pageType(u)) ?? 0) + 1));
    const root = brandRoot(e.domain);
    const lp = root.length >= 4 ? solv.find(s => !s.isClient && squash(s.name).includes(root)) : undefined;
    const qp = quadrant ? quadrant.points.find(q => !q.isClient && (squash(q.brand).includes(root) || root.includes(squash(q.brand)))) : undefined;
    const qu = !qp && quadrant ? quadrant.unmatched.find(q => !q.isClient && (squash(q.brand).includes(root) || root.includes(squash(q.brand)))) : undefined;
    plays.push({
      domain: e.domain, kind: e.kind,
      landscape: { p1Vol: e.p1Vol, p1Kw: e.p1Kw, top3Vol: t3.vol, top3Kw: t3.kw, measuredKw: e.measuredKw, rank: ladderRank.get(e.domain) ?? null },
      linesWon: won, linesAbsent: absent,
      queryMix: Array.from(mix.entries()).map(([type, a]) => ({ type, kw: a.kw, volume: a.volume })).sort((a, b) => b.volume - a.volume),
      pageTypes: pt.size ? Array.from(pt.entries()).map(([type, urls]) => ({ type, urls })).sort((a, b) => b.urls - a.urls) : null,
      outrankedByClient: outBy, outranksClient: outs,
      local: lp ? { packAppearances: lp.appearances, packShare: lp.sharePct, avgRating: lp.avgRating, maxReviews: lp.maxReviews } : null,
      ai: qp ? { namedPct: r1(qp.visibilityPct), citations: qp.citations } : qu ? { namedPct: r1(qu.visibilityPct), citations: null } : null,
    });
  }
  plays.sort((a, b) => b.landscape.p1Vol - a.landscape.p1Vol);
  // v7.497 — bound the list. Sono Bello's ladder carries 897 SERP occupants; serialised in full the block
  // was 722 KB and pushed the generation prompt past the model's context. Every tracked competitor stays;
  // beyond them, the PLAYS_SHOWN rivals holding the most page-1 volume. Nothing measured is lost from the
  // standing figures — `playsBasis` states the cut so no surface mistakes the list for the field.
  const measuredPlays = plays.length;
  const withPage1 = plays.filter(p => p.landscape.p1Vol > 0).length;
  const trackedPlays = plays.filter(p => p.kind === 'tracked');
  const rivalPlays = plays.filter(p => p.kind !== 'tracked' && p.landscape.p1Vol > 0).slice(0, PLAYS_SHOWN);
  const shownPlays = [...trackedPlays, ...rivalPlays].sort((a, b) => b.landscape.p1Vol - a.landscape.p1Vol);
  const playsBasis: PlaysBasis = {
    measured: measuredPlays, withPage1, tracked: trackedPlays.length, shown: shownPlays.length,
    rule: `Every tracked competitor (${trackedPlays.length}) plus the ${PLAYS_SHOWN} other brands holding the most page-1 volume, out of ${measuredPlays} brands measured on the landscape ladder (${withPage1} with any page-1 hold). Field averages and ranks in standing are computed over all measured brands, not this list.`,
  };

  // ── LOCAL MARKETS ────────────────────────────────────────────────────────────
  let local: LocalMarkets | null = null;
  try {
    const listings = localScan?.locations ?? [];
    const geoVocab = Array.from(new Set(listings.map(l => String(l.city ?? '').toLowerCase().trim()).filter(Boolean)));
    const relevance = buildClientRelevance(ctx.guardedCategories, clientDomain, competitorDomains, pool.filter(i => !i.isGap).slice(0, 4000).map(i => i.keyword));
    const locals = classifyLocalKeywords(pool.filter(i => !i.isBranded).map(i => ({ keyword: i.keyword, searchVolume: i.searchVolume, position: i.featurePlacement ? null : i.position, isGap: i.isGap, competitor: i.competitor })), { geoVocab, relevanceTokens: relevance });
    const byCity = new Map<string, LocalMarket>();
    const rivalByCity = new Map<string, Map<string, { p1Vol: number; p1Kw: number }>>();
    const nearMe = { kwCount: 0, demandMonthly: 0, clientP1Kw: 0, clientP1Vol: 0 };
    for (const l of locals) {
      const kw = l.keyword.toLowerCase().trim();
      const p = l.isGap ? null : l.position;
      if (l.intent === 'near-me') { nearMe.kwCount++; nearMe.demandMonthly += l.searchVolume; if (p != null && p >= 1 && p <= 10) { nearMe.clientP1Kw++; nearMe.clientP1Vol += l.searchVolume; } continue; }
      if (l.intent !== 'geo-modifier') continue;
      const city = l.matchedTerm;
      const m = byCity.get(city) ?? { city, demandMonthly: 0, kwCount: 0, client: { p1Kw: 0, p1Vol: 0, bestPos: null, rankedKw: 0 }, topRival: null, pack: null };
      m.demandMonthly += l.searchVolume; m.kwCount++;
      if (p != null && p >= 1) { m.client.rankedKw++; if (m.client.bestPos == null || p < m.client.bestPos) m.client.bestPos = p; if (p <= 10) { m.client.p1Kw++; m.client.p1Vol += l.searchVolume; } }
      const rmk = rm.perKw.get(kw);
      if (rmk) rmk.forEach((bp, dom) => { if (bp >= 1 && bp <= 10) { const rc = rivalByCity.get(city) ?? new Map(); const a = rc.get(dom) ?? { p1Vol: 0, p1Kw: 0 }; a.p1Vol += l.searchVolume; a.p1Kw++; rc.set(dom, a); rivalByCity.set(city, rc); } });
      byCity.set(city, m);
    }
    rivalByCity.forEach((rc, city) => {
      let best: LocalMarket['topRival'] = null;
      rc.forEach((a, dom) => { if (!best || a.p1Vol > best.p1Vol) best = { domain: dom, p1Vol: a.p1Vol, p1Kw: a.p1Kw }; });
      const m = byCity.get(city); if (m) m.topRival = best;
    });
    // map-pack standing per city from the stored Local scan grid
    if (localScan?.keywords?.length) {
      const cells = new Map<string, { cells: number; withPack: number; best: number | null; inPack: number; leaders: Map<string, number>; leaderReviews: number | null }>();
      for (const c of localScan.keywords) {
        const city = String(c.city ?? c.bestLocationCity ?? '').toLowerCase().trim(); if (!city) continue;
        const e = cells.get(city) ?? { cells: 0, withPack: 0, best: null, inPack: 0, leaders: new Map(), leaderReviews: null };
        e.cells++;
        if (c.packPresent) {
          e.withPack++;
          if (c.clientBestRank != null) { e.inPack++; if (e.best == null || c.clientBestRank < e.best) e.best = c.clientBestRank; }
          const lead = c.pack?.[0]; if (lead && !lead.isClient) { e.leaders.set(lead.title, (e.leaders.get(lead.title) ?? 0) + 1); if (e.leaderReviews == null || lead.reviews > e.leaderReviews) e.leaderReviews = lead.reviews; }
        }
        cells.set(city, e);
      }
      cells.forEach((e, city) => {
        const m = byCity.get(city) ?? { city, demandMonthly: 0, kwCount: 0, client: { p1Kw: 0, p1Vol: 0, bestPos: null, rankedKw: 0 }, topRival: null, pack: null };
        const clientListing = listings.filter(l => l.isClient && String(l.city ?? '').toLowerCase().trim() === city);
        m.pack = {
          cells: e.cells, withPack: e.withPack, clientBestRank: e.best, clientInPack: e.inPack,
          leaders: Array.from(e.leaders.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
          clientReviews: clientListing.length ? Math.max(...clientListing.map(l => l.reviews || 0)) : null,
          leaderReviews: e.leaderReviews,
        };
        byCity.set(city, m);
      });
    }
    const markets = Array.from(byCity.values()).sort((a, b) => b.demandMonthly - a.demandMonthly);
    let scanned = 0, withPack = 0, inPack = 0, rank1 = 0;
    for (const c of (localScan?.keywords ?? [])) { scanned++; if (c.packPresent) { withPack++; if (c.clientBestRank != null) { inPack++; if (c.clientBestRank === 1) rank1++; } } }
    local = (markets.length || localScan) ? {
      markets,
      nearMe,
      geoTotal: { kwCount: markets.reduce((s, m) => s + m.kwCount, 0), demandMonthly: markets.reduce((s, m) => s + m.demandMonthly, 0), cities: markets.length },
      scan: localScan ? { locations: listings.length, scannedCells: scanned, withPack, clientInPack: inPack, clientRank1: rank1, builtAt: localScan.builtAt ?? null } : null,
      packLeaders: solv.slice(0, 8).map(s => ({ name: s.name, appearances: s.appearances, sharePct: s.sharePct, avgRating: s.avgRating, maxReviews: s.maxReviews, isClient: s.isClient })),
      basis: 'Demand by city = Σ real Semrush volume of non-branded keywords carrying that city name (geo-modifier intent, client-relevance gated — the Local panel\'s classifier). Client hold and top rival read the same rank map as every ladder. Map-pack standing = the stored Local scan grid (service × city cells; real 3-pack rows).',
    } : null;
  } catch { local = null; }

  // ── SHIFTS ───────────────────────────────────────────────────────────────────
  const shifts: Shifts = {
    serp: serpKws.length ? { scanned: serpKws.length, withAIO, aioClientCited: aioCited, withPAA, paaClientCited: paaCited, aioVolumeMonthly: aioVol, aioUncitedVolumeMonthly: aioUncitedVol } : null,
    aiAnswers: probeT > 0 || linesScanned > 0 ? { probeMentions: probeM, probeTotal: probeT, linesScanned, linesWithClientShare: linesWithShare } : null,
    history: null,
    historyNote: 'No time series is stored: OrbitIQ keeps one snapshot per analysis. Every figure here is cross-sectional (this analysis). Do not describe movement over time; a metric ledger for trends is a separate release.',
  };

  return {
    clientDomain: clientNorm,
    standing: {
      search, ai, lines,
      basis: 'Field average = mean of the other measured brands on the same metric and the same keywords; best-in-class = the top brand (may be the client). Rank = client\'s position among measured brands. A brand with no stored rank data on a metric is absent from that metric, never scored zero (Const I.5).',
    },
    scenarios, plays: shownPlays, playsBasis, local, shifts,
  };
}
