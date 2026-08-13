/**
 * lib/pdf/assessmentTemplate.ts — v7.374: the client ASSESSMENT REPORT.
 * v7.375: dates removed report-wide (Wayne 2026-07-16); NEW conditional
 * Authority Signals section (projects.authority_snapshot) and Local Search
 * section (semrushSnapshot._localScan) — each renders ONLY when its panel
 * holds scan data, and is omitted entirely (not gap-blocked) otherwise.
 * Section numbers are now assigned dynamically at assembly. Design spec:
 * GEO/orbitiq-assessment-report-mockup-v4-2026-07-16.html (approved).
 *
 * Constitution:
 *  - I.1  Every number arrives from a real computed source: the shared pool
 *         (buildKwPool/computeVolumeMetrics), the shared SoV model (computeSov),
 *         the stored Profound panel metrics (projects.profound_data), the stored
 *         authority snapshot (crawled backlinks-index rows; Authority Score is
 *         the index's modeled composite and is labeled as such, I.5a), and the
 *         stored local scan (real pack/listing/rating rows).
 *  - I.5  A section whose data source is absent is omitted (local/authority,
 *         per Wayne) or renders an explicit honest-gap block (AI layer) —
 *         never a placeholder value.
 *  - II.6/II.7 No forked math: pool metrics + SoV come from the shared
 *         functions the panels call; local rollups reuse lib/local/build.ts
 *         (buildPackRollup / buildReviewRollup / buildShareOfLocalVoice /
 *         buildLocalIndex — the exact functions LocalSearchSection renders);
 *         insight sentences reuse lib/insights.ts verbatim.
 *  - Wayne's report rules: no data-vendor names; no dates anywhere; every page
 *         carries "Provided by iQuanti" — iQuanti-only attribution, no
 *         partner co-brand (v7.377, Wayne 2026-07-17).
 */

import type { SovComputed } from '@/lib/sov/model';
import {
  landGrabInsight, shadowCompetitorInsight, earnedFastPathInsight,
  localDiagnosisInsight, localUsurperInsight, reviewDeficitInsight,
  fmtInsightVol, type Insight,
} from '@/lib/insights';
import {
  buildPackRollup, buildReviewRollup, buildShareOfLocalVoice, buildLocalIndex,
  type LocalScan,
} from '@/lib/local/build';
// v7.376: the SAME segment attribution + journey lane/state rules the panels run
// (moved to lib/ this release precisely so this report can reuse them — Const II.7).
import {
  buildSegTokens, buildCanonTopicSegmentMap, canonTopicState, isPreProductTopic,
  SHARED_BUCKET, type SegmentLike,
} from '@/lib/journey/segments';
import { JOURNEY_ORDER, JOURNEY_LABELS, type JourneyStage as CanonStage } from '@/lib/clusters/canonical';
// v7.405: the Part V counts (striking-distance set, Pareto cut, AIO/PAA on that
// same keyword set) — pure functions over the shared pool, so the report and the
// panels cannot drift (Const II.6/II.7).
import type { ProgramData } from '@/lib/pdf/programData';
// v7.407: the authority snapshot freezes the competitor list at scan time, so it
// is reconciled against the project's CURRENT competitors before anything
// renders — one shared reconciler, four read sites (Const II.6/II.7).
import { reconcileAuthoritySnapshot } from '@/lib/authority/reconcile';

// ── Profound panel metrics (shape persisted verbatim by /api/projects/[id]/profound;
//    declared locally so this server module never imports from a client component) ──
interface PBrandStat  { brand: string; count: number; pct: number; isClient: boolean }
interface PPlatStat   { platform: string; runs: number; hits: number }
interface PTopicStat  { topic: string; runs: number; hits: number }
interface PPromptGap  { prompt: string; topic: string; rivalMentions: number; leader: string; leaderCount: number }
interface PSentBrand  { brand: string; pos: number; neg: number; isClient: boolean }
interface PMentionSent{ brand: string; pos: number; neutral: number; neg: number; total: number; isClient: boolean }
interface PDomainStat { domain: string; count: number; isClient: boolean; isCompetitor: boolean }
interface PDemandTopic{ topic: string; share: number; prompts: number }
interface PDemandPrompt{ prompt: string; share: number; topic: string }
interface PCiteCat    { category: string; count: number; pct: number }
interface PCiteDomain { hostname: string; count: number }
interface PEngineMix  { platform: string; total: number; earned: number; competition: number; owned: number; other: number }
interface PMentionSrc { hostname: string; count: number; isClient: boolean }
// v7.417 — `mean` is null when a bucket has rows but none of them were scored. It is never
// coerced to 0: the report would then assert a bad score where the export in fact said nothing.
interface PSentScoreBucket { label: string; n: number; rows: number; mean: number | null }
interface PSentScoreBrand  { brand: string; n: number; rows: number; mean: number | null; isClient: boolean }

export interface ProfoundMetrics {
  client: string; tracked: string[];
  totalRuns: number; clientHits: number;
  // v7.422 — the denominators the PANEL scores on. Optional: analyses stored before v7.420/v7.421
  // carry neither and fall back to the whole-file basis they were actually computed with.
  scoredRuns?: number;
  engines: PPlatStat[]; sov: PBrandStat[];
  overallTop: { brand: string; count: number; pct: number }[];
  topics: PTopicStat[]; promptN: number; coverage: PBrandStat[];
  gaps: PPromptGap[];
  sentBrands: PSentBrand[]; mentionSent: PMentionSent[];
  totalCites: number; domains: PDomainStat[];
  demandTopics: PDemandTopic[]; demandPrompts: PDemandPrompt[]; demandPromptTotal: number;
  citeTotal: number; citeOwned: number; citeOwnedShare: number;
  citeCategorised?: number; citeUncategorised?: number;
  citeCompetition: number; citeCatMix: PCiteCat[];
  earnedTargets: PCiteDomain[]; competitorCites: PCiteDomain[];
  engineSourceMix: PEngineMix[];
  citeMentions: number; citeMentionSources: PMentionSrc[];
  citeMentionByPlatform: { platform: string; count: number }[];
  domainTotalDistinct?: number;
  updatedAt?: string;
  // v7.417 — Profound replaced the per-brand `sentiment_claims` column with a sparse,
  // client-only `sentiment_v2_score`. All optional: a report built from metrics saved before
  // v7.417, or from an export that still carries claims, is byte-for-byte unchanged.
  sentScoreCol?: boolean;
  sentScoreRows?: number;
  sentScoreScored?: number;
  sentScoreBrands?: PSentScoreBrand[];
  sentScoreClientTopics?: PSentScoreBucket[];
  sentScoreClientEngines?: PSentScoreBucket[];
  sentScoreOpen?: PSentScoreBucket | null;
}

// ── Authority snapshot (shape persisted by /api/projects/[id]/authority-scan on
//    projects.authority_snapshot — mirrors GoogleRankAuthoritySection's Snapshot) ──
interface ADomainSignals {
  domain: string;
  role: 'client' | 'competitor';
  brandPhrase?: string;
  overview: { ascore: number; total: number; refDomains: number; follows: number; nofollows: number } | null;
  qualityTiers: { lt10: number; ge10: number; ge30: number; ge50: number } | null;
  brandVolume: number | null;
  errors?: string[];
}
export interface AuthoritySnapshot {
  version?: number; fetchedAt?: string; database?: string;
  domains: ADomainSignals[];
}

// v7.376: structural slice of the canonical Topic the journey sections read —
// the route passes the exact objects buildCanonicalClusterTopics returns.
export interface JourneyTopicLike {
  id:          string;
  parentName:  string;
  parentType:  string;
  product:     string;
  pageUrl?:    string;
  stage:       CanonStage;
  totalVolume: number;
  // v7.404: `url` (the client's ranking URL for this keyword) is now carried
  // through. It was always present on KwItem but dropped by this slice, so the
  // report could not count the existing URLs behind a position band. Optional —
  // pre-v7.404 scans stored '' for every row (see the semrush.ts `Url` fix).
  keywords: Array<{ keyword: string; searchVolume: number; position: number | null; isGap: boolean; url?: string; origin?: 'footprint' | 'demand' }>;
}

// ── v7.404: real per-keyword SERP feature rows (AI Overview + People Also Ask) ──
// Shape mirrors the stored analyses.serpApiSnapshot, flattened by the PDF route
// and declared locally so this server module never imports a client component.
// Every field is a direct scan row: no value here is modeled or estimated.
export interface SerpFeatureKeyword {
  keyword:        string;
  clientRank:     number | null;   // client's position on this SERP (null = not found)
  clientUrl:      string | null;   // resolved from organicResults at the route
  searchVolume:   number | null;   // joined from the shared pool at the route
  hasAIO:         boolean;
  aioClientCited: boolean;
  hasPAA:         boolean;
  paaClientCited: boolean;
}
export interface SerpFeatureSnapshot {
  scanned:        number;
  withAIO:        number;
  aioClientCited: number;
  withPAA:        number;
  paaClientCited: number;
  keywords:       SerpFeatureKeyword[];
}

export interface AssessmentData {
  clientName: string;
  websiteUrl: string;
  industry?: string | null;
  poolCount: number;
  metrics: { totalMonthly: number; totalAnnual: number; page1Monthly: number; page1Annual: number; captureRate: number };
  sov: SovComputed | null;
  profound: ProfoundMetrics | null;
  authority?: AuthoritySnapshot | null;
  // v7.407: the project's CURRENT competitor domains. The authority snapshot is
  // frozen at scan time, so this is what decides which of its rows are still in
  // scope. null/undefined = the caller has no live list and the snapshot passes
  // through unfiltered (pre-v7.407 behaviour, byte-for-byte).
  competitorDomains?: string[] | null;
  localScan?: LocalScan | null;
  // v7.407: does this project have a local component at all (configured
  // locations / a local footprint)? Used ONLY to decide whether the absence of a
  // local scan is an honest gap worth naming (Const I.5) or simply not
  // applicable. It never fabricates local data.
  hasLocalIntent?: boolean;
  segments?: SegmentLike[] | null;          // v7.376: stored _audienceSegments rows
  journeyTopics?: JourneyTopicLike[] | null; // v7.376: canonical topics (same build the panels run)
  problemSeeds?: string[];                   // v7.376: deep-journey problem seeds (lane rule)
  serpFeatures?: SerpFeatureSnapshot | null; // v7.404: real AIO/PAA scan rows (absent = section omitted, Const I.5)
  program?: ProgramData | null;              // v7.405: Part V counts (null = legacy step cards, Const I.5)
  // v7.427 (Const II.6b): Product Insights — the panel's shared basis, computed by the
  // route via lib/productInsights.buildProductRows. null = no products (section omitted).
  productInsights?: {
    products: Array<{
      name: string; kwCount: number; demand: number; p1Share: number;
      ladder: Array<{ domain: string; kind: 'client' | 'tracked' | 'rival'; p1Vol: number; measuredKw: number }>;
      clientRank: number | null;
      probe: { mentions: number; total: number; claude: string; gpt: string } | null;
      scan: { fetched: number; totalCount: number; scannedAt: string } | null;
      aiRate: number | null; dfsShare: number | null;
      citedTop: Array<{ domain: string; count: number; isClient: boolean }>;
      arbTopics: number;
      topics: Array<{ product: string; parentName: string; totalVolume: number;
        keywords: Array<{ position: number | null; searchVolume: number }> }>;
    }>;
    kpi: { arb: number; dual: number; aiOnly: number; none: number; citesClient: number; citesTotal: number };
    scannedAt: string | null;
    // v7.432 (Const II.6b): the sub-category level the panel measures, ranked by demand.
    subNodes?: Array<{ name: string; path: string; depth: number; demand: number; kwCount: number;
      p1Share: number; leader: string | null; leaderPct: number | null; clientRank: number | null;
      dfsShare: number | null; scanned: boolean;
      // v7.435: which AI platforms this node's figure actually covers. A scan stored
      // before v7.435 was one unfiltered request, so the mix is what came back rather
      // than a per-platform measurement — the panel and this table say so either way.
      platformMix?: Array<{ label: string; rows: number; cited: number }> | null;
      platformsMissing?: string[] }>;
  } | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n0  = (v: number) => Math.round(v).toLocaleString('en-US');
const p0  = (v: number) => `${Math.round(v)}%`;
const p1  = (v: number) => `${v.toFixed(1)}%`;
const vol = (v: number) => fmtInsightVol(v);
const mult = (v: number) => `${(Math.round(v * 100) / 100).toFixed(v >= 10 ? 0 : 2).replace(/\.?0+$/, '')}×`;
const clampW = (v: number) => Math.max(1.2, Math.min(100, v));

function insightHTML(ins: Insight | null, title: string, tone: 'blue' | 'red' = 'blue'): string {
  if (!ins) return '';
  const body = ins.parts.map(s => (s.em ? `<b>${esc(s.t)}</b>` : esc(s.t))).join('');
  const style = tone === 'red' ? ' style="border-left-color:var(--critical); background:#fdf0ef;"' : '';
  const tstyle = tone === 'red' ? ' style="color:#9c2b2b;"' : '';
  return `<div class="callout"${style}><div class="t"${tstyle}>${esc(title)}</div><p>${body}</p></div>`;
}

function barRow(label: string, widthPct: number, valText: string, color = 'var(--blue)', labCols = '1.35in', valCols = '1in'): string {
  return `<div class="barrow" style="grid-template-columns:${labCols} 1fr ${valCols};">
    <span class="lab">${esc(label)}</span>
    <div class="track"><div class="fill" style="width:${clampW(widthPct).toFixed(1)}%; background:${color};"></div></div>
    <span class="val">${esc(valText)}</span></div>`;
}

function tile(k: string, v: string, d: string, cls = ''): string {
  return `<div class="tile ${cls}"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`;
}

function gapBlock(what: string, how: string): string {
  return `<div class="gapblock"><div class="t">DATA NOT YET LOADED</div>
    <p><b>${esc(what)}</b> has not been loaded for this project, so this section is omitted rather than estimated. ${esc(how)}</p></div>`;
}

// ── v7.414: star ratings, the index donut, and the local finding cards ───────
//
// WHY THE STAR IS AN SVG PATH AND NOT `&#9733;` (Wayne, 2026-08-05: "show the
// avg star rating rather than just saying 3"):
// the report has printed `&#9733;` beside the local review rating since v7.374,
// and it has NEVER rendered. The PDF is rasterised by @sparticuz/chromium inside
// the Vercel lambda, whose bundled font set does not carry U+2605, and with no
// fallback face the glyph resolves to nothing at all — not even a tofu box. Four
// separate sites therefore printed a rating with an invisible star, which is
// exactly why the reputation card read as a bare "3". A vector path depends on no
// font, so it renders identically in the lambda, in a local browser and in print.
// Any future rating glyph in this template MUST use this helper for the same
// reason. (The app's own panels keep the character — a real browser has the face.)
const STAR_PATH = 'M12 2.6l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.62 6.12 20.71l1.12-6.55-4.76-4.64 6.58-.96z';
function svgStar(px: number, fill: string): string {
  return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" style="display:inline-block; vertical-align:-${(px * 0.13).toFixed(1)}px;" aria-hidden="true"><path d="${STAR_PATH}" fill="${fill}"/></svg>`;
}
/** A 5-star row filled to `rating`/5, clipped at the fractional star. Real value only. */
function starRow(rating: number, px = 13): string {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const row = (fill: string) => Array.from({ length: 5 }, () => svgStar(px, fill)).join('');
  return `<span class="stars" role="img" aria-label="${rating.toFixed(1)} out of 5 stars">
    <span class="sback">${row('#dcdbd4')}</span>
    <span class="sfill" style="width:${pct.toFixed(2)}%;">${row('#b07d10')}</span></span>`;
}

/** Index donut: an arc of `score`/`max`, score printed in the well. Pure encoding of one real number. */
function donut(score: number, max: number, tone: string): string {
  const R = 27, SW = 9, C = 2 * Math.PI * R;
  const on = C * Math.max(0, Math.min(1, score / max));
  return `<svg width="78" height="78" viewBox="0 0 78 78" role="img" aria-label="Local Visibility Index ${score} out of ${max}">
    <circle cx="39" cy="39" r="${R}" fill="none" stroke="#eceae4" stroke-width="${SW}"/>
    <circle cx="39" cy="39" r="${R}" fill="none" stroke="${tone}" stroke-width="${SW}" stroke-linecap="round"
      stroke-dasharray="${on.toFixed(2)} ${(C - on).toFixed(2)}" transform="rotate(-90 39 39)"/>
    <text x="39" y="37" text-anchor="middle" dominant-baseline="central" style="font-size:22px; font-weight:800; fill:var(--ink);">${n0(score)}</text>
    <text x="39" y="52" text-anchor="middle" style="font-size:7px; font-weight:700; fill:var(--muted); letter-spacing:.07em;">OF ${n0(max)}</text>
  </svg>`;
}

/** One weighted input of the Local Visibility Index — its own 0–100 score plus the weight it carries. */
function idxPart(label: string, weight: string, score: number): string {
  return `<div class="prow">
    <span class="pl">${esc(label)} <span class="pw">${esc(weight)}</span></span>
    <div class="ptrack"><div class="pfill" style="width:${clampW(score).toFixed(1)}%;"></div></div>
    <span class="pv">${n0(score)}</span></div>`;
}

/** Review-count bucket: a count of LOCATIONS, labeled as such (Wayne, 2026-08-05). */
function bucketRow(label: string, widthPct: number, count: number, color: string): string {
  return `<div class="brow">
    <span class="bl">${esc(label)}</span>
    <div class="btrack"><div class="bfill" style="width:${clampW(widthPct).toFixed(1)}%; background:${color};"></div></div>
    <span class="bv">${n0(count)} location${count === 1 ? '' : 's'}</span></div>`;
}

/**
 * A local finding as a card in a row, replacing the stacked callout stack.
 * The sentence and its evidence line come from lib/insights.ts verbatim (II.7).
 * The date guard is belt-and-braces: this report never passes `scanDate`, but a
 * future caller that did would otherwise put a date on a page that forbids them.
 */
function findCard(ins: Insight | null, title: string, tone: 'blue' | 'red' = 'blue'): string {
  if (!ins) return '';
  const body = ins.parts.map(s => (s.em ? `<b>${esc(s.t)}</b>` : esc(s.t))).join('')
    .replace(/★/g, svgStar(10, '#b07d10'));
  const ev = String(ins.evidence ?? '').replace(/\s*·\s*\d{1,2}\/\d{1,2}\/\d{2,4}/g, '');
  return `<div class="find${tone === 'red' ? ' red' : ''}">
    <div class="fk">${esc(title)}</div><p>${body}</p>
    ${ev ? `<div class="fsrc">${esc(ev)}</div>` : ''}</div>`;
}

// ── the document ─────────────────────────────────────────────────────────────
export function buildAssessmentHTML(d: AssessmentData): string {
  const name = esc(d.clientName || 'Client');
  // v7.423 — the report speaks the BRAND, never the project label. `d.clientName` is the project
  // record's name field, and Wayne's projects are named for his own filing ("Amex (Card Shop)") —
  // which is exactly the point: a project may be called anything (v7.420). It was printing on the
  // cover, in every page footer, the HTML title and four body sentences of a CLIENT-FACING report,
  // and it disagreed with the bar beside it, which already used the resolved brand. The brand is
  // the one the export's own `mentioned?` column identifies; the project label is used only when
  // no client could be resolved at all, so a report is never left nameless (I.5).
  const brandName = esc((d.profound && d.profound.client) ? d.profound.client : (d.clientName || 'Client'));
  const m = d.metrics;
  const sov = d.sov && d.sov.basis === 'capture' ? d.sov : null;
  const pf  = d.profound && (d.profound.totalRuns > 0 || (d.profound.citeTotal || 0) > 0) ? d.profound : null;

  // authority: render only when the snapshot holds a client row with real overview counts.
  // v7.407 — the snapshot's competitor list is frozen at scan time, so it is first
  // reconciled against the project's CURRENT competitors: rivals that have since been
  // removed are dropped from every view, and rivals added since the last scan have no
  // crawled row to show and are named as an honest gap (Const I.5) instead of appearing
  // as a blank or zeroed line. No value is estimated and no scan is triggered.
  const authDomains = (d.authority?.domains ?? []).filter(x => x && x.overview && x.overview.refDomains > 0);
  const authRec = reconcileAuthoritySnapshot(authDomains, d.competitorDomains ?? null);
  const authClient = authRec.client;
  const authComps = authRec.comps.slice().sort((a, b) => (b.overview!.refDomains) - (a.overview!.refDomains));
  const auth = authClient && authComps.length > 0 ? { client: authClient, comps: authComps } : null;

  // local: render only when the scan holds real pack rows or listings
  const scan = d.localScan && ((d.localScan.keywords?.length ?? 0) > 0 || (d.localScan.locations?.length ?? 0) > 0) ? d.localScan : null;
  const lp = scan ? {
    pack:    buildPackRollup(scan.keywords ?? []),
    reviews: buildReviewRollup(scan.locations ?? []),
    solv:    buildShareOfLocalVoice(scan.keywords ?? []),
    index:   buildLocalIndex(buildPackRollup(scan.keywords ?? []), buildReviewRollup(scan.locations ?? []), scan.locations ?? []),
    clientLocs: (scan.locations ?? []).filter(l => l.isClient),
  } : null;

  // ── v7.376: audience segments + journey (conditional — same rules as the panels) ──
  const segs = (d.segments ?? []).filter(s => s && s.id && s.name);
  const hasSeg = segs.length > 0;
  const jt = (d.journeyTopics ?? []) as JourneyTopicLike[];
  const problemSet = new Set((d.problemSeeds ?? []).map(s => s.toLowerCase().trim()));
  // rows mirror CanonicalJourneyView exactly: state via canonTopicState, lane via the
  // shared pre-product predicate, action = existing→optimize else build.
  const jRows = jt.map(t => {
    const state = canonTopicState(t);
    return { t, state, lane: isPreProductTopic(t, problemSet) ? 'pre' : 'product', action: state === 'existing' ? 'optimize' : 'build' };
  });
  const jTotal = jRows.length;
  const hasJourney = jTotal > 0;
  const jOpt = jRows.filter(r => r.action === 'optimize').length;
  const jBuild = jTotal - jOpt;
  const jPreN = jRows.filter(r => r.lane === 'pre').length;
  const jPreBuild = jRows.filter(r => r.action === 'build' && r.lane === 'pre').length;
  const jCoverage = jTotal ? Math.round((jOpt / jTotal) * 100) : 0;
  const jStageAgg = JOURNEY_ORDER.map(st => {
    const rows = jRows.filter(r => r.t.stage === st);
    return { stage: st, n: rows.length, vol: rows.reduce((s, r) => s + (r.t.totalVolume || 0), 0), builds: rows.filter(r => r.action === 'build').length };
  });
  const jTopStage = jStageAgg.slice().sort((a, b) => b.builds - a.builds)[0] ?? null;
  const jGroupMap = new Map<string, { n: number; vol: number }>();
  for (const r of jRows) {
    const key = r.t.parentName || '(uncategorized)';
    const g = jGroupMap.get(key) ?? { n: 0, vol: 0 };
    g.n += 1; g.vol += r.t.totalVolume || 0;
    jGroupMap.set(key, g);
  }
  const jGroupCount = jGroupMap.size;
  const jTopGroups = Array.from(jGroupMap.entries()).map(([g, v]) => ({ group: g, ...v })).sort((a, b) => b.vol - a.vol).slice(0, 5);
  // segment attribution — the panels' exclusive word-overlap partition (v7.170 rule)
  const segTok = hasSeg ? buildSegTokens(segs) : [];
  const segMap = hasSeg && hasJourney ? buildCanonTopicSegmentMap(jt, segTok) : new Map<string, string>();
  const segAgg = segs.map(s => {
    const rows = jRows.filter(r => segMap.get(r.t.id) === s.id);
    const gm = new Map<string, number>();
    for (const r of rows) gm.set(r.t.parentName || '(uncategorized)', (gm.get(r.t.parentName || '(uncategorized)') ?? 0) + (r.t.totalVolume || 0));
    const top = Array.from(gm.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    return { s, topics: rows.length, optimize: rows.filter(r => r.action === 'optimize').length, build: rows.filter(r => r.action === 'build').length, topGroup: top ? { name: top[0], vol: top[1] } : null };
  }).sort((a, b) => (b.s.volumePct ?? 0) - (a.s.volumePct ?? 0));
  const segSharedN = hasSeg && hasJourney ? jRows.filter(r => segMap.get(r.t.id) === SHARED_BUCKET).length : 0;
  const segAttributedN = hasSeg && hasJourney ? jTotal - segSharedN : 0;
  const topSeg = segAgg[0] ?? null;

  // v7.404 (Wayne 2026-08-04): the PAGE FOOTER now also names the platform —
  // "Provided by iQuanti, Powered by iQ.Impact". Scope is the footer ONLY: the
  // cover PROVIDED BY block, the governance "proprietary to iQuanti" line and the
  // appendix endbrand "An iQuanti product" stay iQuanti-only, so the statement of
  // who is accountable for the numbers is never split. This amends the v7.377
  // iQuanti-only rule, which stands everywhere else in the report. (The removed
  // partner name is deliberately not repeated here — a source-level grep for it
  // must stay clean, and comments count.)
  // v7.405: null when the footprint holds no 4–20 ranks — the ladder then falls
  // back to the legacy step cards rather than rendering an empty table.
  const prog = d.program ?? null;

  const footLeft = `OrbitIQ Assessment · Provided by iQuanti, Powered by iQ.Impact · ${brandName}`;

  // ── derived (direct tallies over stored rows — no re-modeling) ─────────────
  const offPage1Monthly = Math.max(0, m.totalMonthly - m.page1Monthly);
  const openPct   = sov ? (sov.availableClicks > 0 ? (sov.availableClicks - sov.capturedClicks - sov.compEntries.concat(sov.serpEntries).reduce((s, e) => s + e.capturedClicks, 0)) / sov.availableClicks : 0) : 0;
  const rivals    = sov ? sov.compEntries.concat(sov.serpEntries).slice().sort((a, b) => b.pct - a.pct) : [];
  const topRival  = rivals[0] ?? null;

  // v7.422 — READ the panel's denominator, never re-derive one here. This line divided by
  // totalRuns while the panel divides by scoredRuns, so the PDF printed 83.15% where the screen
  // printed 88.02% — the exact vendor-vs-OrbitIQ divergence v7.420 was written to end, recreated
  // one layer up. Const II.6: when a panel changes how a metric is DERIVED, every rollup reading
  // it changes in the SAME release.
  const pfScored   = pf ? ((pf.scoredRuns && pf.scoredRuns > 0) ? pf.scoredRuns : pf.totalRuns) : 0;
  const pfVisPct   = pf && pfScored > 0 ? (pf.clientHits / pfScored) * 100 : 0;
  // Same rule for citations: the share is over CATEGORISED sources, so the caption must be too.
  const pfCiteDen  = pf ? ((pf.citeCategorised && pf.citeCategorised > 0) ? pf.citeCategorised : (pf.citeTotal || 0)) : 0;
  const pfCiteUncat= pf ? (pf.citeUncategorised || 0) : 0;
  const pfClientCov= pf ? pf.coverage.find(c => c.isClient) ?? null : null;
  const pfRivalCov = pf ? pf.coverage.filter(c => !c.isClient).sort((a, b) => b.count - a.count)[0] ?? null : null;
  const pfEarned   = pf ? pf.citeCatMix.find(c => c.category.toLowerCase().includes('earned')) ?? null : null;
  const pfMentionHosts = pf ? (pf.citeMentionSources || []).filter(h => !h.isClient) : [];
  const pfBridge   = pfMentionHosts.filter(h => h.count >= 10).slice(0, 3);
  const pfBridgeSum= pfBridge.reduce((s, h) => s + h.count, 0);
  const gapsByLeader = new Map<string, number>();
  const gapsByTopic  = new Map<string, { n: number; leaders: Map<string, number> }>();
  if (pf) for (const g of pf.gaps || []) {
    gapsByLeader.set(g.leader, (gapsByLeader.get(g.leader) ?? 0) + 1);
    const t = gapsByTopic.get(g.topic) ?? { n: 0, leaders: new Map<string, number>() };
    t.n += 1; t.leaders.set(g.leader, (t.leaders.get(g.leader) ?? 0) + 1);
    gapsByTopic.set(g.topic, t);
  }
  const leaderRows = Array.from(gapsByLeader.entries()).sort((a, b) => b[1] - a[1]);
  const topicRows  = Array.from(gapsByTopic.entries()).map(([topic, t]) => {
    const lead = Array.from(t.leaders.entries()).sort((a, b) => b[1] - a[1])[0];
    return { topic, n: t.n, leader: lead ? lead[0] : '—', leaderN: lead ? lead[1] : 0 };
  }).sort((a, b) => b.n - a.n);

  const g2 = sov ? landGrabInsight({
    clientPct: sov.sovPct, openPct,
    availableClicks: sov.availableClicks,
    topRival: topRival ? { label: topRival.domain, pct: topRival.pct } : null,
    ctrLabel: sov.ctrSource,
  }) : null;
  const a3 = pf ? shadowCompetitorInsight({
    rival: pfRivalCov ? { brand: pfRivalCov.brand, count: pfRivalCov.count, pct: pfRivalCov.pct } : null,
    client: pfClientCov ? { count: pfClientCov.count, pct: pfClientCov.pct } : null,
    promptN: pf.promptN,
  }) : null;
  const a4 = pf ? earnedFastPathInsight({
    citeTotal: pf.citeTotal || 0, citeOwned: pf.citeOwned || 0, citeOwnedShare: pf.citeOwnedShare || 0,
    earnedShare: pfEarned ? pfEarned.pct : 0,
    mentionHosts: pfMentionHosts, citeMentions: pf.citeMentions || 0,
  }) : null;

  // local insight inputs mirror LocalSearchSection exactly (same rollups, same miss rule)
  const lpMiss = scan ? (scan.keywords ?? [])
    .filter(k => k.packPresent && k.clientBestRank == null && (k as any).packLeader)
    .slice().sort((a, b) => ((b as any).searchVolume || 0) - ((a as any).searchVolume || 0))[0] ?? null : null;
  const l1 = lp ? localDiagnosisInsight({
    withPack: lp.pack.withPack, present: lp.pack.inPack,
    avgRank: lp.pack.avgRank > 0 ? lp.pack.avgRank : null,
  }) : null;
  const l2 = lp && lpMiss ? localUsurperInsight({
    top: { keyword: (lpMiss as any).keyword, searchVolume: (lpMiss as any).searchVolume || 0, leader: String((lpMiss as any).packLeader) },
    clientLocations: lp.clientLocs.length,
  }) : null;
  const l3 = lp ? reviewDeficitInsight({
    avgRating: lp.reviews.avgRating > 0 ? lp.reviews.avgRating : null,
    totalReviews: lp.reviews.totalReviews,
  }) : null;

  // ── pages (built conditionally; section numbers + footers assigned at assembly) ──
  const pages: string[] = [];

  // Cover
  pages.push(`<div class="page cover">
    <div class="cbrand">ORBITIQ&nbsp;&nbsp;·&nbsp;&nbsp;GROWTH INTELLIGENCE</div>
    <div class="cmid">
      <div class="ck">SEARCH &amp; AI VISIBILITY ASSESSMENT</div>
      <div class="cname">${brandName}</div>
      <div class="csub">Where your customers are searching, what they're finding instead of you, and the fastest verified routes to change it — across Google and the AI answer engines.</div>
    </div>
    <div class="cfoot">
      <div class="cgrid">
        <div><div class="ckk">PROVIDED BY</div><div class="cvv" style="white-space:nowrap;">iQuanti</div></div>
        <div><div class="ckk">INTELLIGENCE LAYERS</div><div class="cvv">Demand &amp; rankings · Live answer-surface scans · AI visibility tracking${auth ? ' · Authority signals' : ''}${lp ? ' · Local map-pack scans' : ''}${hasSeg || hasJourney ? ' · Audience &amp; journey modeling' : ''}</div></div>
      </div>
      <div class="cnote">Every figure in this report traces to a real scanned source row, regenerated from the current data at the moment this report is produced. Nothing is modeled or estimated unless explicitly labeled.</div>
    </div>
  </div>`);

  // Executive summary
  const execTiles: string[] = [];
  execTiles.push(tile('Page-1 capture', p1(m.captureRate * 100), `Of ${vol(m.totalMonthly)} monthly searches on your footprint, ${vol(m.page1Monthly)} land where you hold a page-1 position.`, 'accent'));
  if (sov) execTiles.push(tile('Unclaimed page-1 clicks', p0(openPct * 100), `Of ~${vol(sov.availableClicks)} modeled page-1 clicks/mo (${esc(sov.ctrSource)}), no tracked competitor captures them either.`, 'accent'));
  if (pf)  execTiles.push(tile('Owned citation share', (pf.citeTotal || 0) > 0 ? p1(pf.citeOwnedShare) : '—', (pf.citeTotal || 0) > 0 ? `${n0(pf.citeOwned)} of ${n0(pfCiteDen)} categorised sources cited by AI engines are yours${pfCiteUncat > 0 ? ` (${n0(pfCiteUncat)} more carry no category and are excluded)` : ''}${pf.citeCompetition ? ` — competitor-owned domains hold ${n0(pf.citeCompetition)}` : ''}.` : 'Citation landscape not yet loaded.', 'accent bad'));
  if (pf && pfRivalCov) execTiles.push(tile('Your real AI rival', esc(pfRivalCov.brand), `Appears in ${p0(pfRivalCov.pct)} of ${n0(pf.promptN)} tracked AI prompts vs your ${pfClientCov ? p0(pfClientCov.pct) : '0%'}.`));
  if (pf && pfBridgeSum > 0) execTiles.push(tile('The shortcut already exists', `${n0(pfBridgeSum)} <small>of ${n0(pf.citeMentions)}</small>`, `Brand mentions already sitting on ${pfBridge.map(h => h.hostname).join(', ')} — hosts AI engines already cite. Converting mentions to citations is outreach, not content.`));
  if (pf && pf.totalRuns > 0) execTiles.push(tile('Overall AI visibility', p1(pfVisPct), `Named in ${n0(pf.clientHits)} of ${n0(pfScored)} AI answers that named at least one brand, across ${pf.engines.length} engines.`, pfVisPct < 5 ? 'bad' : ''));
  if (execTiles.length < 6 && topSeg && (topSeg.s.volumePct ?? 0) > 0) execTiles.push(tile('Your biggest audience', p0(topSeg.s.volumePct ?? 0), `${esc(topSeg.s.name ?? '')} — a modeled share of real demand${pf && pf.totalRuns > 0 ? `; their journey runs through the AI answer layer, where you appear in ${p1(pfVisPct)} of answers` : ''}.`));
  if (execTiles.length < 6 && lp) execTiles.push(tile('Map-pack presence', `${p0(lp.pack.presenceRate)}`, `In ${n0(lp.pack.inPack)} of ${n0(lp.pack.withPack)} scanned local packs — at average rank ${lp.pack.avgRank} when present.`, lp.pack.presenceRate < 50 ? 'bad' : ''));
  pages.push(pageWrap('EXECUTIVE SUMMARY', 'EXECUTIVE SUMMARY', `
    <h1 class="pg">Where the demand is — and who's capturing it.</h1>
    <div class="lede">This assessment maps ${brandName}'s full search footprint across Google and the AI answer engines, from live scans of real queries, rankings and AI answers. The headline findings below each trace to a scanned source; the sections that follow show the work.</div>
    <div class="tiles c3">${execTiles.slice(0, 6).join('')}</div>
    ${insightHTML(g2, 'WHAT THIS MEANS')}
    ${!pf ? gapBlock('AI visibility data', 'Upload the AI visibility exports on the AI Answer Engines panel and regenerate this report to add the full AI answer-layer assessment.') : ''}`));

  // Governance
  pages.push(pageWrap('GOVERNANCE &amp; INTELLIGENCE', 'HOW THIS WAS BUILT', `
    <h1 class="pg">Every number traces to a verified source.</h1>
    <div class="lede">This assessment is generated from live intelligence on your actual search footprint — not industry benchmarks, not estimates. The specific data partnerships and processing pipeline behind it are proprietary to iQuanti. Every figure is regenerated from the current data at the moment this report is produced. What we publish is the governance: how the numbers are sourced, what rules they obey, and why you can defend every one of them in a board meeting.</div>
    <table class="dt" style="margin-bottom:18px;">
      <tr><th style="width:1.7in;">Intelligence layer</th><th>What it tells us</th></tr>
      <tr><td><b>Demand &amp; rankings intelligence</b></td><td>Enterprise-grade search market data: real query volumes, your actual rankings, and the competitive gaps — the demand backbone of the assessment.</td></tr>
      <tr><td><b>Live answer-surface scans</b></td><td>What actually appears on the results page today: page-1 results, AI Overviews, People-Also-Ask boxes, video shelves, local packs.</td></tr>
      <tr><td><b>AI visibility tracking</b></td><td>How often AI answer engines (ChatGPT, Perplexity, Gemini, AI Overviews) mention and cite you across tracked buyer prompts — resolved down to every cited source URL.</td></tr>
      ${auth ? '<tr><td><b>Authority signals</b></td><td>Crawled backlink-index rows for your domain and tracked rivals: referring domains, authority distribution, follow share, and brand demand.</td></tr>' : ''}
      ${lp ? '<tr><td><b>Local map-pack scans</b></td><td>Live Google map-pack checks across your local-intent keywords, plus real listing and review data for every location.</td></tr>' : ''}
      ${hasSeg || hasJourney ? '<tr><td><b>Audience &amp; journey modeling</b></td><td>Who the demand belongs to and how they move: research-backed buyer segments over your real query footprint, plus every topic cluster mapped to a funnel stage. Volumes are real scanned rows; segment shares and topic attributions are modeled partitions and labeled as such.</td></tr>' : ''}
    </table>
    <div class="two">
      <div class="panelbox"><div class="figtitle">How the analysis is assembled</div>
        <p>Every keyword lives in one canonical pool with its real volume, rank and provenance, organized by searcher intent into a page-level architecture. Demand you already capture and demand you're missing are held to the same standard: real volumes, real positions, deduplicated so nothing is counted twice.</p></div>
      <div class="panelbox"><div class="figtitle">Rules this report will not break</div>
        <p><b>No modeled numbers as fact.</b> The only derived metric — Share of Voice — uses a named, industry-published click-through curve over your real volumes and positions, and is labeled as an estimate wherever it appears. <b>No hidden caps:</b> the full footprint is analyzed. Missing data reads as an honest gap, never a zero.</p></div>
    </div>`));

  // Demand & capture
  pages.push(pageWrap('DEMAND VS. CAPTURE', 'PART I · THE MARKET', `
    <h1 class="pg">The size of the market — and your share of it.</h1>
    <div class="lede">Your footprint spans <b>${n0(d.poolCount)} tracked keywords</b> carrying <b>${vol(m.totalMonthly)} searches every month</b> (${vol(m.totalAnnual)}/yr). You hold a page-1 position on ${p1(m.captureRate * 100)} of that demand — the rest is being answered by someone else.</div>
    <div class="tiles c3" style="margin-bottom:18px;">
      ${tile('Monthly search demand', vol(m.totalMonthly), `${vol(m.totalAnnual)} searches per year across the scanned footprint.`)}
      ${tile('Demand you capture on page 1', vol(m.page1Monthly), `${p1(m.captureRate * 100)} of the footprint — searches where you hold a top-10 position.`)}
      ${tile('Demand beyond page 1', vol(offPage1Monthly), 'Searches happening every month where your best position is 11 or worse — or absent.', 'bad')}
    </div>
    <div class="figtitle">Captured vs. open demand</div>
    <div class="figsub">Monthly search volume · real query volumes and positions</div>
    ${barRow('Page-1 captured', m.totalMonthly > 0 ? (m.page1Monthly / m.totalMonthly) * 100 : 0, `${vol(m.page1Monthly)}/mo`, 'var(--blue)', '1.6in')}
    ${barRow('Beyond page 1', m.totalMonthly > 0 ? (offPage1Monthly / m.totalMonthly) * 100 : 0, `${vol(offPage1Monthly)}/mo`, 'var(--critical)', '1.6in')}
    <div class="src">Source: demand + ranking scans — per-keyword volumes and positions are real rows; page-1 = position ≤ 10.</div>
    <div class="callout"><div class="t">READ</div><p>Capture rate is the single most honest summary of a search program: it weighs every ranking by the real demand behind it. The pages that follow break the uncaptured share down — who holds it on Google, and who answers it inside AI engines.</p></div>`));

  // Share of Voice
  if (sov) {
    const rivalBars = rivals.slice(0, 3).map(r =>
      barRow(r.domain, sov.availableClicks > 0 ? (r.capturedClicks / sov.availableClicks) * 100 : 0, p0(r.pct * 100), 'var(--violet)', '1.6in', '.7in')).join('');
    pages.push(pageWrap('SHARE OF VOICE', 'PART I · THE MARKET', `
      <h1 class="pg">${p0(openPct * 100)} of the clicks belong to no one yet.</h1>
      <div class="lede">Of the ~${vol(sov.availableClicks)} page-1 clicks available each month across the non-branded keyword landscape (you + tracked competitors), you capture an estimated ${p0(sov.sovPct * 100)}. Your tracked competitors barely capture more — <b>${p0(openPct * 100)} of the clicks are open</b>, held by aggregators, publishers and nobody in particular.</div>
      <div class="figtitle">Estimated page-1 click capture</div>
      <div class="figsub">Share of Voice — modeled from real volumes &amp; positions via ${esc(sov.ctrSource)} (the one labeled estimate in this report)</div>
      ${barRow('Open / unclaimed', openPct * 100, p0(openPct * 100), '#c9c8c1', '1.6in', '.7in')}
      ${barRow(sov.clientDisplay || name, sov.sovPct * 100, p0(sov.sovPct * 100), 'var(--blue)', '1.6in', '.7in')}
      ${rivalBars}
      <div class="src">Volumes and positions are real scanned rows; the click multiplier is the named published curve, labeled per Constitution I.5a.</div>
      ${insightHTML(g2, 'READ')}
      <div class="two" style="margin-top:14px;">
        <div class="panelbox"><div class="figtitle">Why "open" matters</div><p>When a rival owns the clicks, growth means displacing an entrenched incumbent — slow and expensive. When the clicks are open, growth means showing up with a competent page. The economics of those two situations are completely different.</p></div>
        <div class="panelbox"><div class="figtitle">The eviction zone</div><p>Positions 7–10 are rankings you hold today that one competitor push removes from page 1. The app's opportunity queue flags weakly-held keywords alongside every open gap — defend and advance from the same list.</p></div>
      </div>`));
  }

  // Authority signals (conditional — omitted entirely when no snapshot)
  if (auth) {
    const c = auth.client, co = c.overview!;
    const followShare = (o: { follows: number; nofollows: number }) => o.follows + o.nofollows > 0 ? (o.follows / (o.follows + o.nofollows)) * 100 : 0;
    const rowFor = (x: ADomainSignals, isClient: boolean) => {
      const o = x.overview!;
      const b = (v: string) => isClient ? `<b>${v}</b>` : v;
      return `<tr><td>${b(esc(x.domain))}${isClient ? ' <span class="chip climb" style="font-size:7.5px;">CLIENT</span>' : ''}</td>
        <td class="n">${b(n0(o.ascore))}</td><td class="n">${b(n0(o.refDomains))}</td>
        <td class="n">${b(x.qualityTiers ? n0(x.qualityTiers.ge50) : '—')}</td>
        <td class="n">${b(p0(followShare(o)))}</td>
        <td class="n">${b(x.brandVolume != null ? vol(x.brandVolume) : '—')}</td></tr>`;
    };
    const tableRows = [rowFor(c, true)].concat(auth.comps.map(x => rowFor(x, false))).join('');
    const topComp = auth.comps[0];
    const rdRatio = topComp ? topComp.overview!.refDomains / Math.max(1, co.refDomains) : 0;
    const tierRatio = topComp && topComp.qualityTiers && c.qualityTiers && c.qualityTiers.ge50 > 0
      ? topComp.qualityTiers.ge50 / c.qualityTiers.ge50 : 0;
    const brandRatio = topComp && topComp.brandVolume && c.brandVolume ? topComp.brandVolume / c.brandVolume : 0;
    const nearest = auth.comps.slice().sort((a, b) =>
      Math.abs(a.overview!.refDomains / Math.max(1, co.refDomains) - 1) - Math.abs(b.overview!.refDomains / Math.max(1, co.refDomains) - 1))[0];
    const nearRatio = nearest ? nearest.overview!.refDomains / Math.max(1, co.refDomains) : 0;
    const behind = rdRatio > 1.05;
    const tiles: string[] = [];
    if (nearest && nearest.domain !== topComp?.domain) tiles.push(tile(`vs ${nearest.domain}`, mult(nearRatio), `${nearest.domain}'s referring-domain edge — the closest authority peer on file.`));
    else if (nearest) tiles.push(tile(`vs ${nearest.domain}`, mult(nearRatio), `Referring-domain ratio against your closest tracked rival.`));
    if (topComp && tierRatio > 0) tiles.push(tile(`Top-tier gap vs ${topComp.domain}`, mult(tierRatio), `${n0(topComp.qualityTiers!.ge50)} high-authority referring domains (AS≥50) to your ${n0(c.qualityTiers?.ge50 ?? 0)} — the tier that moves rankings and AI citations most.`, tierRatio > 1.3 ? 'bad' : ''));
    if (brandRatio > 0) tiles.push(tile('Brand demand gap', mult(brandRatio), `${vol(topComp!.brandVolume!)} monthly brand searches for ${topComp!.domain} vs your ${vol(c.brandVolume!)} — brand gravity compounds every other signal.`, brandRatio > 2 ? 'bad' : ''));
    pages.push(pageWrap('AUTHORITY SIGNALS', 'PART II · THE DIAGNOSIS', `
      <h1 class="pg">${behind ? 'Where your link authority stands — and where the gap is.' : 'Your link authority leads the tracked field.'}</h1>
      <div class="lede">Real crawled backlink signals for ${esc(c.domain)} against ${auth.comps.length} tracked rival${auth.comps.length === 1 ? '' : 's'}: referring domains, the high-authority tier, follow share, and brand demand. Counts are facts about the crawled index; Authority Score is the index's modeled composite and is labeled as such.</div>
      <table class="dt" style="margin-bottom:${authRec.missing.length ? '8px' : '16px'};">
        <tr><th>Domain</th><th style="width:.95in;">Authority Score <span style="font-weight:400; text-transform:none;">(modeled)</span></th><th style="width:.95in;">Referring domains</th><th style="width:.9in;">High-authority RDs (AS&ge;50)</th><th style="width:.75in;">Follow share</th><th style="width:1in;">Brand demand /mo</th></tr>
        ${tableRows}
      </table>
      ${authRec.missing.length ? `<div class="gapblock" style="margin-bottom:16px;"><div class="t">NOT YET CRAWLED</div>
        <p>${authRec.missing.length === 1 ? '<b>One tracked competitor</b> was' : `<b>${n0(authRec.missing.length)} tracked competitors</b> were`} added after the last authority crawl, so ${authRec.missing.length === 1 ? 'it has' : 'they have'} no backlink profile on file yet and ${authRec.missing.length === 1 ? 'is' : 'are'} left out of this table rather than shown as a blank row: ${authRec.missing.map(x => esc(x)).join(', ')}. Re-running the authority scan adds ${authRec.missing.length === 1 ? 'it' : 'them'}.</p></div>` : ''}
      ${tiles.length ? `<div class="tiles c3" style="margin-bottom:16px;">${tiles.slice(0, 3).join('')}</div>` : ''}
      <div class="two">
        <div class="panelbox"><div class="figtitle">What the profile says</div>
          <p style="margin-top:6px; font-size:10px;">${followShare(co) >= 70 ? `Your follow share (${p0(followShare(co))}) is healthy and your mid-tier link base is competitive — this is not a domain that needs remedial link building.` : `Your follow share (${p0(followShare(co))}) trails the leaders — link quality, not just quantity, is part of the gap.`} The deficit that matters most sits where links are hardest to buy and easiest to earn: top-authority publishers and press.</p></div>
        <div class="panelbox" style="border-top:3px solid var(--blue);"><div class="figtitle">Why this compounds the earned-media step</div>
          <p style="margin-top:6px; font-size:10px;">The earned-media outreach in the recommended program targets exactly these hosts. Every mention converted to a linked citation does double duty: it enters AI answer supply chains <b>and</b> lands a high-authority referring domain — the tier of this table where gains matter most.</p></div>
      </div>
      <div class="src">Source: crawled backlinks-index rows from the latest authority scan — referring-domain and follow counts are facts about that index; Authority Score is the index's modeled composite (labeled); brand demand is real monthly volume for each domain's brand phrase.</div>`));
  }

  // Local search (conditional — omitted entirely when no scan)
  if (lp && scan) {
    const dist = { big: 0, mid: 0, small: 0 };
    for (const l of lp.clientLocs) {
      const r = l.reviews || 0;
      if (r >= 100) dist.big++; else if (r >= 25) dist.mid++; else if (r >= 1) dist.small++;
    }
    const distMax = Math.max(1, dist.big, dist.mid, dist.small);
    const withAnyReview = dist.big + dist.mid + dist.small;
    // v7.410 made `rating == null` mean either "never looked up" or "looked up, no
    // profile exists". buildReviewRollup counts only rated locations, so the rating
    // card must say WHICH population it describes rather than implying the whole
    // estate carries a Google rating (Const I.5). Identical counts collapse to one number.
    const ratedOfAll = lp.reviews.locationCount === 0
      ? ''
      : lp.reviews.locationCount === lp.clientLocs.length
        ? (lp.clientLocs.length === 1 ? 'its single location' : `all ${n0(lp.clientLocs.length)} locations`)
        : `${n0(lp.reviews.locationCount)} of ${n0(lp.clientLocs.length)} locations`;
    const rateLow = lp.reviews.avgRating > 0 && lp.reviews.avgRating < 4;
    const solvTop = lp.solv.slice(0, 5);
    const solvMax = Math.max(1, ...solvTop.map(r => r.appearances));
    const solvBars = solvTop.map(r =>
      barRow(r.isClient ? `${d.clientName} (you)` : r.name, (r.appearances / solvMax) * 100, `${n0(r.appearances)} · ${p0(r.sharePct)}`, r.isClient ? 'var(--blue)' : '#c9c8c1', '1.5in', '.85in')).join('');
    pages.push(pageWrap('LOCAL SEARCH — THE MAP PACK', 'PART II · THE DIAGNOSIS', `
      <h1 class="pg">${lp.pack.presenceRate < 50 ? `Where you show up, you ${lp.pack.avgRank > 0 && lp.pack.avgRank <= 2 ? 'win' : 'compete'}. You show up ${p0(lp.pack.presenceRate)} of the time.` : `You appear in ${p0(lp.pack.presenceRate)} of your map packs.`}</h1>
      <div class="lede">The local scan checked <b>${n0(lp.pack.scanned)} local-intent keywords</b> against your <b>${n0(lp.clientLocs.length)} location${lp.clientLocs.length === 1 ? '' : 's'}</b>: ${n0(lp.pack.withPack)} returned a Google map pack, and you appear in ${n0(lp.pack.inPack)} of them${lp.pack.avgRank > 0 ? ` — at an average rank of <b>${lp.pack.avgRank}</b> when you do` : ''}.</div>
      <div class="lgrid" style="margin-bottom:13px;">
        <div class="panelbox">
          <div class="figtitle">Local Visibility Index</div>
          <div class="figsub">A fixed 40/25/20/15 blend of four measured ratios — an editorial weighting, not a hidden model. Each bar is that input's own 0–100 score.</div>
          <div class="lidx">
            ${donut(lp.index.score, 100, lp.index.score < 50 ? 'var(--critical)' : 'var(--blue)')}
            <div class="lparts">
              ${idxPart('Map-pack presence', '40%', lp.index.parts.presence)}
              ${idxPart('Rank quality', '25%', lp.index.parts.rankQuality)}
              ${idxPart('Review rating', '20%', lp.index.parts.reviews)}
              ${idxPart('Listing completeness', '15%', lp.index.parts.listings)}
            </div>
          </div>
        </div>
        <div class="lstats">
          ${tile('Map-pack presence', `${p0(lp.pack.presenceRate)} <small>${n0(lp.pack.inPack)} of ${n0(lp.pack.withPack)}</small>`, 'Packs on your keywords where any of your locations appears.', lp.pack.presenceRate < 50 ? 'bad' : '')}
          ${tile('Rank when present', lp.pack.avgRank > 0 ? String(lp.pack.avgRank) : '—', 'Average position inside the 3-pack when you appear.')}
        </div>
      </div>
      <div class="two" style="margin-bottom:13px;">
        <div class="panelbox"${rateLow ? ' style="border-top:3px solid var(--critical);"' : ''}>
          <div class="figtitle">Review rating — the reputation gate</div>
          <div class="figsub">${ratedOfAll
            ? `Google star rating and review volume across ${esc(ratedOfAll)}`
            : `No Google rating has been returned for any of these ${n0(lp.clientLocs.length)} locations yet`}</div>
          ${lp.reviews.avgRating > 0 ? `<div class="ratrow">
            <div class="ratbig" style="color:${rateLow ? 'var(--critical)' : 'var(--ink)'};">${lp.reviews.avgRating.toFixed(1)}<span class="ratmax">/ 5</span></div>
            <div class="ratside">
              ${starRow(lp.reviews.avgRating)}
              <div class="ratnote">weighted by review count across <b>${n0(lp.reviews.totalReviews)} reviews</b>${rateLow ? ' — below the ~4.0 bar that gates pack rank' : ''}</div>
            </div>
          </div>` : '<p class="figsub">No Google rating has been returned for these locations yet.</p>'}
          ${withAnyReview > 0 ? `${bucketRow('100+ reviews', (dist.big / distMax) * 100, dist.big, 'var(--blue-550)')}
          ${bucketRow('25–99 reviews', (dist.mid / distMax) * 100, dist.mid, 'var(--blue)')}
          ${bucketRow('1–24 reviews', (dist.small / distMax) * 100, dist.small, '#4a86cd')}
          <p style="font-size:9px; color:var(--muted); margin-top:8px;">${lp.clientLocs.length > 0 ? `${p0((withAnyReview / lp.clientLocs.length) * 100)} of locations have at least one review.` : ''}</p>` : ''}
        </div>
        <div class="panelbox">
          <div class="figtitle">Who holds the pack slots</div>
          <div class="figsub">Businesses appearing most often across your scanned packs · you highlighted</div>
          ${solvBars || '<p class="figsub">No pack appearances recorded in this scan.</p>'}
          <p style="font-size:9px; color:var(--muted); margin-top:8px;">The full local opportunity queue is itemized in the app.</p>
        </div>
      </div>
      ${(() => {
        // v7.414 — the three local findings move from a stack of full-width callouts
        // into one row of cards (Wayne: "visually display them better than just
        // stacked boxes"). Cards are emitted only for insights that actually fired,
        // and the row's column count follows that number, so one finding never
        // renders as a third of a row (Const I.5 — no placeholder card).
        const cards = [
          findCard(l2, 'FINDING · WHO OWNS YOUR MAP PACK', 'red'),
          findCard(l1, l1?.kicker ? l1.kicker.toUpperCase() : 'DIAGNOSIS', 'blue'),
          findCard(l3, 'FINDING · REVIEW DEFICIT', 'red'),
        ].filter(Boolean);
        return cards.length > 0 ? `<div class="finds c${cards.length}">${cards.join('')}</div>` : '';
      })()}
      <div class="src">Source: live local scan — pack presence, pack leaders, listings and Google ratings are real scanned rows; volumes are real per-keyword rows.</div>`));
  } else if (d.hasLocalIntent) {
    // v7.407 (Wayne, 2026-08-05: "I dont see any of the local insights coming
    // through the report"). Before this, a project WITH a local footprint but no
    // scan on the analysis row this report was built from dropped the local page
    // and eight further local fragments with no trace at all — the section simply
    // vanished, which reads as a rendering bug rather than missing data. It is now
    // an honest gap that names itself (Const I.5). Projects with no local
    // component are unaffected: hasLocalIntent is false and nothing is emitted.
    pages.push(pageWrap('LOCAL SEARCH — THE MAP PACK', 'PART II · THE DIAGNOSIS', `
      <h1 class="pg">This brand competes locally. The map pack is not measured yet.</h1>
      <div class="lede">The footprint carries a local component — locations and map-pack demand — but no local scan is attached to the analysis this report was built from, so every local figure is omitted rather than estimated.</div>
      ${gapBlock('Local map-pack data', 'Run the local scan on the Local Search panel and regenerate this report — the assessment expands with map-pack presence and average pack rank by position band, share of local voice against the rivals actually holding the pack, the location estate and its review reputation, and a Local workstream in the recommended program.')}
      <div class="src">Source: none — no local scan rows exist on this analysis. Nothing on this page is estimated, and no local figure appears anywhere else in this report.</div>`));
  }

  // ── v7.427: Product Insights — search and AI by product (Const II.6b) ──────
  // Reads the SAME shared basis the panel renders (lib/productInsights via the
  // route) — nothing here is re-derived. Absent products => section omitted
  // entirely (honest gap, Const I.5). ASCII-safe glyphs only (the v7.414 rule).
  if (d.productInsights && d.productInsights.products.length > 0) {
    const pi = d.productInsights;
    const prods = pi.products.slice(0, 8);
    const anyScan = pi.products.some(p => p.scan);
    const ownedShare = pi.kpi.citesTotal > 0 ? (pi.kpi.citesClient / pi.kpi.citesTotal) * 100 : null;
    const rowsHtml = prods.map(p => {
      const leader = p.ladder[0] ?? null;
      const field = leader
        ? (leader.kind === 'client'
            ? `You lead - ${p1((leader.p1Vol / Math.max(p.demand, 1)) * 100)} page-1 share`
            : `${esc(leader.domain)} leads${p.clientRank !== null ? ` - you #${p.clientRank} of ${p.ladder.length}` : ' - no page-1 hold'}`)
        : 'No page-1 holds measured';
      const probeTxt = p.probe ? `${p.probe.mentions}/${p.probe.total} unbranded prompts` : 'not probed';
      const recTxt = p.scan
        ? `named in ${p0((p.dfsShare ?? 0) * 100)} of ${n0(p.scan.fetched)}${p.scan.totalCount > p.scan.fetched ? ` of ${n0(p.scan.totalCount)}` : ''}`
        : 'not scanned';
      return `<tr><td><b>${esc(p.name)}</b><br><span style="color:var(--muted); font-size:8.5px;">${n0(p.kwCount)} kws</span></td>
        <td>${vol(p.demand)}/mo</td><td>${p0(p.p1Share * 100)}</td><td>${field}</td>
        <td>${esc(probeTxt)}</td><td>${esc(recTxt)}</td><td style="text-align:right;"><b>${p.arbTopics}</b></td></tr>`;
    }).join('');
    const citedAgg = new Map<string, { count: number; isClient: boolean }>();
    for (const p of pi.products) for (const c of p.citedTop) {
      const e = citedAgg.get(c.domain); if (e) e.count += c.count; else citedAgg.set(c.domain, { count: c.count, isClient: c.isClient });
    }
    const citedTop = Array.from(citedAgg.entries()).map(([domain, v]) => ({ domain, ...v })).sort((a, b) => b.count - a.count).slice(0, 6);
    const maxCite = Math.max(1, ...citedTop.map(c => c.count));
    const citedHtml = citedTop.length > 0
      ? `<div class="h2" style="margin-top:14px;">Who AI answers cite in your product categories</div>
         ${citedTop.map(c => barRow(c.isClient ? `${c.domain} (you)` : c.domain, (c.count / maxCite) * 100, `${n0(c.count)} citations`, c.isClient ? 'var(--blue)' : '#c9c8c1', '1.9in')).join('')}
         ${!citedTop.some(c => c.isClient) ? `<div style="font-size:9px; color:var(--critical); margin-top:4px;">${esc(d.clientName)} is cited 0 times across these recorded answers.</div>` : ''}`
      : '';
    // v7.432: the deepest measured levels — the panel's sub-category drill, in the report.
    const subs = (pi.subNodes ?? []).slice(0, 10);
    const subHtml = subs.length === 0 ? '' : `
      <div class="h2" style="margin-top:14px;">Inside the product lines - the sub-categories carrying the demand</div>
      <table class="dt">
        <tr><th>Sub-category</th><th style="width:.7in;">Demand</th><th style="width:.6in;">Page 1</th><th>Who leads page 1</th><th style="width:1.25in;">AI answers</th></tr>
        ${subs.map(n => `<tr>
          <td><b>${esc(n.name)}</b><br><span style="color:var(--muted); font-size:8px;">${esc(n.path)} - ${n0(n.kwCount)} kws</span></td>
          <td>${vol(n.demand)}/mo</td>
          <td>${p0(n.p1Share * 100)}</td>
          <td>${n.leader ? (n.leader === 'you' ? `You - ${p1(n.leaderPct ?? 0)}` : `${esc(n.leader)} - ${p1(n.leaderPct ?? 0)}${n.clientRank !== null ? ` (you #${n.clientRank})` : ''}`) : 'No page-1 holds'}</td>
          <td>${n.scanned ? `named in ${p0((n.dfsShare ?? 0) * 100)}${(n.platformMix && n.platformMix.length) ? `<br><span style="color:var(--muted); font-size:8px;">${n.platformMix.map(m => `${n0(m.rows)} ${esc(m.label)}`).join(' - ')}${(n.platformsMissing && n.platformsMissing.length) ? `; ${n.platformsMissing.map(esc).join(' + ')} not measured` : ''}</span>` : ''}` : 'not measured at this level'}</td>
        </tr>`).join('')}
      </table>
      <div style="font-size:8px; color:var(--muted); margin-top:3px;">AI is measured per level and never inherited from the product line - a sub-category reads "not measured" until its own recorded-answer scan is run. Each scan queries Google AI Overviews and ChatGPT separately (one request per platform), so the platform counts under each figure are what was actually measured on each; a platform listed as not measured is unknown, not zero.</div>`;
    pages.push(pageWrap('PRODUCT INSIGHTS — SEARCH AND AI BY PRODUCT', 'PART II · THE DIAGNOSIS', `
      <h1 class="pg">Where ranking authority is not yet an AI answer.</h1>
      <div class="lede">Each product line measured on both axes: share of search demand held on page 1, and presence in AI answers. <b>${n0(pi.kpi.arb)} topics</b> already rank on page 1 while the AI side is weak — the authority exists; the AI answer is what is missing.${ownedShare !== null ? ` Across ${n0(pi.kpi.citesTotal)} recorded citations, ${esc(d.clientName)} holds <b>${p1(ownedShare)}</b>.` : ''}</div>
      <table class="dt" style="margin-bottom:6px;">
        <tr><th>Product</th><th style="width:.75in;">Demand</th><th style="width:.65in;">Page 1</th><th>Field position</th><th style="width:1.05in;">AI probe</th><th style="width:1.15in;">Recorded answers</th><th style="width:.5in;">Arb</th></tr>
        ${rowsHtml}
      </table>
      ${pi.products.length > 8 ? `<div style="font-size:8.5px; color:var(--muted);">Showing the top 8 of ${pi.products.length} product lines by demand — the full set lives on the Product Insights panel.</div>` : ''}
      ${citedHtml}
      ${subHtml}
      <div class="src">Source: canonical keyword pool + stored taxonomy (page-1 share and the brand field are measured volume at positions 1-10 — no click model); AI probe = unbranded prompts at analysis time; recorded answers = DataForSEO LLM Mentions index (ChatGPT + Google AI Overviews, first ${anyScan ? '100' : '100'} per category with full match counts shown)${pi.scannedAt ? `, last scanned ${esc(new Date(pi.scannedAt).toLocaleDateString('en-US'))}` : ' — not yet scanned'}. Verdict thresholds: weak below 30%, strong at 50%+. This section reads the same shared computation as the Product Insights panel.</div>`));
  }

  // AI answer layer
  if (pf) {
    const maxTop = Math.max(1, ...pf.overallTop.map(b => b.pct));
    // v7.423 — highlight the client's OWN row rather than appending a second one. Before v7.420
    // the client resolved to the alias bucket "AmEx" (0.55%), which never reached the top 10, so
    // this appended bar was the only way it appeared. Now the client resolves correctly and ranks
    // #1, so appending printed "American Express 88.0% · 35,014" TWICE in one chart. The append is
    // still needed for a genuinely low-ranked client, so it is kept — but only when it is absent.
    const clientKey = (pf.client || '').trim();
    const top10 = pf.overallTop.slice(0, 10);
    const clientInTop = clientKey !== '' && top10.some(b => b.brand === clientKey);
    const topBars = top10.map(b =>
      barRow(b.brand, (b.pct / maxTop) * 100, `${p1(b.pct)} · ${n0(b.count)}`, b.brand === clientKey ? 'var(--blue)' : '#c9c8c1', '1.6in')).join('');
    const clientBar = (!clientInTop && pf.totalRuns > 0) ? barRow(brandName, (pfVisPct / maxTop) * 100, `${p1(pfVisPct)} · ${n0(pf.clientHits)}`, 'var(--blue)', '1.6in') : '';
    const sovRank = pf.sov.slice().sort((a, b) => b.count - a.count).findIndex(s => s.isClient) + 1;
    pages.push(pageWrap('AI ANSWER ENGINES — MARKET POSITION', 'PART III · THE AI ANSWER LAYER', `
      <h1 class="pg">Who AI recommends when your customers ask.</h1>
      <div class="lede">We analyzed <b>${n0(pf.totalRuns)} real AI answers</b> — ${n0(pf.promptN)} buyer prompts across ${pf.engines.length} engines — and counted who gets named. Scores run over the <b>${n0(pfScored)}</b> answers that named at least one brand, the same basis the AI engine vendor reports on; ${brandName} appears in ${p1(pfVisPct)} of them.</div>
      <div class="tiles c3" style="margin-bottom:16px;">
        ${tile('Overall AI visibility', p1(pfVisPct), `Named in ${n0(pf.clientHits)} of ${n0(pfScored)} brand-naming answers.`, pfVisPct < 5 ? 'bad' : '')}
        ${tile('Prompt coverage', pfClientCov ? `${p0(pfClientCov.pct)} <small>${n0(pfClientCov.count)} of ${n0(pf.promptN)}</small>` : '—', pfRivalCov ? `Prompts where you appear at least once — vs ${pfRivalCov.brand} ${n0(pfRivalCov.count)} (${p0(pfRivalCov.pct)}).` : 'Prompts where you appear at least once.', 'bad')}
        ${tile('Tracked-brand rank', sovRank > 0 ? `#${sovRank} <small>of ${pf.sov.length}</small>` : '—', 'Among the brands tracked for this project, by share of answers.')}
      </div>
      <div class="figtitle">Who AI engines actually name — share of the ${n0(pfScored)} brand-naming answers</div>
      <div class="figsub">Every brand mentioned in scanned answers, ranked · ${brandName} highlighted</div>
      ${topBars}${clientBar}
      <div class="src">Source: AI visibility dataset — brand counts are direct mention counts from real answers.</div>
      ${insightHTML(a3, 'READ')}`));

    const maxEng = Math.max(0.1, ...pf.engines.map(e => e.runs > 0 ? (e.hits / e.runs) * 100 : 0));
    const engBars = pf.engines.slice().sort((a, b) => (b.hits / Math.max(1, b.runs)) - (a.hits / Math.max(1, a.runs))).map(e => {
      const pct = e.runs > 0 ? (e.hits / e.runs) * 100 : 0;
      return barRow(e.platform, (pct / maxEng) * 100, `${p1(pct)} · ${n0(e.hits)}`, 'var(--blue)', '1.5in', '.85in');
    }).join('');
    const maxMen = Math.max(1, ...(pf.citeMentionByPlatform || []).map(x => x.count));
    const menBars = (pf.citeMentionByPlatform || []).slice().sort((a, b) => b.count - a.count).map(x =>
      barRow(x.platform, (x.count / maxMen) * 100, n0(x.count), 'var(--aqua)', '1.5in', '.55in')).join('');
    const mixRows = (pf.engineSourceMix || []).slice().sort((a, b) => (b.earned / Math.max(1, b.total)) - (a.earned / Math.max(1, a.total))).map(e => {
      const t = Math.max(1, e.total);
      const w = (x: number) => ((x / t) * 100).toFixed(1);
      return `<div class="barrow" style="grid-template-columns:1.5in 1fr 1.15in;">
        <span class="lab">${esc(e.platform)}</span>
        <div class="track" style="display:flex; gap:1px; background:transparent;">
          <div style="width:${w(e.earned)}%; background:var(--blue); border-radius:3px 0 0 3px;"></div>
          <div style="width:${w(e.competition)}%; background:var(--violet);"></div>
          <div style="width:${w(e.owned)}%; background:var(--good);"></div>
          <div style="width:${w(e.other)}%; background:#e3e2dc; border-radius:0 3px 3px 0;"></div>
        </div>
        <span class="val">${p0((e.earned / t) * 100)} earned · ${n0(e.total)}</span></div>`;
    }).join('');
    pages.push(pageWrap('ENGINE-BY-ENGINE', 'PART III · THE AI ANSWER LAYER', `
      <h1 class="pg">Each engine behaves differently. So should the plan.</h1>
      <div class="lede">Engines differ in two ways that matter: <b>how often they name you</b>, and <b>where they source their answers</b>. Engines leaning on earned media respond to PR; engines leaning on broad authority respond to content depth.</div>
      <div class="two" style="margin-bottom:14px;">
        <div class="panelbox"><div class="figtitle">Your visibility per engine</div><div class="figsub">Answers naming you, per engine scanned</div>${engBars}</div>
        <div class="panelbox"><div class="figtitle">Where you're already known</div><div class="figsub">Third-party cited pages naming you, by engine (${n0(pf.citeMentions)} mentions total)</div>${menBars || '<p class="figsub">No mention-surface data in this dataset.</p>'}</div>
      </div>
      ${mixRows ? `<div class="figtitle">How each engine sources its answers</div>
      <div class="figsub">Citation mix per engine — earned media · competitor-owned · client-owned · other</div>${mixRows}
      <div class="legend"><span><span class="sw" style="background:var(--blue)"></span>Earned media</span><span><span class="sw" style="background:var(--violet)"></span>Competitor-owned</span><span><span class="sw" style="background:var(--good)"></span>Client-owned</span><span><span class="sw" style="background:#e3e2dc"></span>Other</span></div>` : ''}
      <div class="src">Source: AI visibility dataset — per-engine counts are direct tallies.</div>`));

    const maxDem = Math.max(0.1, ...pf.demandTopics.map(t => t.share));
    const demBars = pf.demandTopics.slice().sort((a, b) => b.share - a.share).map(t =>
      barRow(t.topic, (t.share / maxDem) * 100, `${p1(t.share)} · ${n0(t.prompts)} pr`, 'var(--blue)', '1.3in', '.95in')).join('');
    const topicVis = pf.topics.slice().sort((a, b) => (b.hits / Math.max(1, b.runs)) - (a.hits / Math.max(1, a.runs)));
    const maxVis = Math.max(0.1, ...topicVis.map(t => t.runs > 0 ? (t.hits / t.runs) * 100 : 0));
    const visBars = topicVis.map(t => {
      const pct = t.runs > 0 ? (t.hits / t.runs) * 100 : 0;
      return barRow(t.topic, (pct / maxVis) * 100, `${p1(pct)} · ${n0(t.hits)}`, pct < 1 ? 'var(--critical)' : 'var(--blue)', '1.3in', '.85in');
    }).join('');
    const battleRows = topicRows.slice(0, 6).map(r =>
      `<tr><td><b>${esc(r.topic)}</b></td><td class="n">${n0(r.n)}</td><td>${esc(r.leader)} leads ${n0(r.leaderN)}</td></tr>`).join('');
    const leaderTiles = leaderRows.slice(0, 3).map(([leader, n]) =>
      tile(`Led by ${leader}`, n0(n), 'Winnable prompts where this rival is the current incumbent.')).join('');
    pages.push(pageWrap('PROMPT DEMAND &amp; THE WINNABLE SET', 'PART III · THE AI ANSWER LAYER', `
      <h1 class="pg">What buyers ask — and the ${n0((pf.gaps || []).length)} prompts you can take.</h1>
      <div class="lede">${n0(pf.demandPromptTotal)} tracked buyer questions carry measured demand, split across ${n0(pf.demandTopics.length)} product topics. Laying demand against your visibility exposes where the biggest questions meet the thinnest presence.</div>
      <div class="two" style="margin-bottom:14px;">
        <div class="panelbox"><div class="figtitle">Demand — share of tracked question volume</div><div class="figsub">By product topic · prompts tracked per topic</div>${demBars}</div>
        <div class="panelbox" style="border-top:3px solid var(--critical);"><div class="figtitle">Visibility — how often AI answers name you</div><div class="figsub">Per scanned topic</div>${visBars}</div>
      </div>
      ${(pf.gaps || []).length > 0 ? `<div class="figtitle">The winnable set — ${n0(pf.gaps.length)} prompts where rivals appear and you do not</div>
      <div class="figsub">Every prompt is itemized in the app with its leading rival · the battle map:</div>
      <table class="dt" style="margin-bottom:12px;"><tr><th>Topic</th><th style="width:1in;">Winnable</th><th>Who leads them</th></tr>${battleRows}</table>
      <div class="tiles c3">${leaderTiles}</div>` : ''}
      <div class="src">Source: AI visibility dataset — winnable counts and leaders are direct tallies of per-prompt mention rows.</div>`));

    const maxCat = Math.max(1, ...(pf.citeCatMix || []).map(c => c.pct));
    const catBars = (pf.citeCatMix || []).slice().sort((a, b) => b.count - a.count).map(c => {
      const isOwned = c.category.toLowerCase().includes('owned');
      const isComp  = c.category.toLowerCase().includes('compet');
      return barRow(c.category, (c.pct / maxCat) * 100, `${p1(c.pct)} · ${n0(c.count)}`,
        isOwned ? 'var(--critical)' : isComp ? 'var(--violet)' : c.category.toLowerCase().includes('earned') ? 'var(--blue)' : '#c9c8c1', '1.5in', '1in');
    }).join('');
    const domHalf = Math.ceil(Math.min(10, pf.domains.length) / 2);
    const domRows = Array.from({ length: domHalf }, (_, i) => {
      const a = pf.domains[i], b = pf.domains[i + domHalf];
      return `<tr><td${a?.isClient ? ' style="font-weight:700;"' : ''}>${esc(a?.domain ?? '')}</td><td class="n">${a ? n0(a.count) : ''}</td><td${b?.isClient ? ' style="font-weight:700;"' : ''}>${b ? esc(b.domain) : ''}</td><td class="n">${b ? n0(b.count) : ''}</td></tr>`;
    }).join('');
    const mentionByHost = new Map(pfMentionHosts.map(h => [h.hostname, h.count]));
    const bridgeRows = (pf.earnedTargets || []).slice(0, 6).map(t =>
      `<tr><td><b>${esc(t.hostname)}</b></td><td class="n">${n0(t.count)}</td><td class="n">${mentionByHost.has(t.hostname) ? n0(mentionByHost.get(t.hostname)!) : '—'}</td></tr>`).join('');
    pages.push(pageWrap('THE CITATION SUPPLY CHAIN', 'PART III · THE AI ANSWER LAYER', `
      <h1 class="pg">Who feeds the answers.</h1>
      <div class="lede">Every AI answer is assembled from cited sources — <b>${n0(pf.citeTotal)}</b> of them across your tracked prompts${pfCiteUncat > 0 ? `, of which <b>${n0(pfCiteDen)}</b> carry an ownership classification` : ', each classified by ownership'}. Your domain supplies <b>${p1(pf.citeOwnedShare)}</b> of that classified raw material${pf.citeCompetition ? `; competitor-owned domains supply ${n0(pf.citeCompetition)}` : ''}.</div>
      <div class="figtitle">Ownership of the ${n0(pfCiteDen)} classified cited sources${pfCiteUncat > 0 ? ` (${n0(pfCiteUncat)} uncategorised excluded)` : ''}</div>
      <div class="figsub">Who owns the pages AI engines build answers from</div>
      ${catBars}
      <div class="two" style="margin-top:14px; margin-bottom:12px;">
        <div class="panelbox"><div class="figtitle">The domains engines cite most</div><div class="figsub">Top of ${n0(pf.domainTotalDistinct ?? pf.domains.length)} cited domains · your domain in bold</div>
          <table class="dt">${domRows}</table></div>
        <div class="panelbox" style="border-top:3px solid var(--blue);"><div class="figtitle">The earned-media bridge</div><div class="figsub">Hosts AI trusts most · pages already naming you</div>
          <table class="dt"><tr><th>Host</th><th style="width:.9in;">Cited (earned)</th><th style="width:.9in;">Your mentions</th></tr>${bridgeRows}</table></div>
      </div>
      ${insightHTML(a4, 'WHY THIS IS THE CHEAPEST WIN IN THE REPORT')}
      <div class="src">Source: citation-level AI dataset — ownership classes, domain counts and mention surface are direct counts.</div>`));

    const netPct = (pos: number, neg: number) => { const t = pos + neg; return t > 0 ? Math.round(((pos - neg) / t) * 100) : 0; };
    const sentSorted = (pf.sentBrands || []).slice().sort((a, b) => netPct(b.pos, b.neg) - netPct(a.pos, a.neg));
    const maxNet = Math.max(1, ...sentSorted.map(s => Math.abs(netPct(s.pos, s.neg))));
    const sentBars = sentSorted.map(s => {
      const net = netPct(s.pos, s.neg);
      return barRow(s.brand, (Math.abs(net) / maxNet) * 100, `${net >= 0 ? '+' : ''}${net} · +${n0(s.pos)}/−${n0(s.neg)}`, s.isClient ? 'var(--blue)' : '#c9c8c1', '1.5in', '1.1in');
    }).join('');
    const cms = (pf.mentionSent || []).find(x => x.isClient) ?? null;
    const toneTiles = cms && cms.total > 0 ? [
      tile('Positive', `${p0((cms.pos / cms.total) * 100)} <small>${n0(cms.pos)}</small>`, 'Recommended or praised in the answer.'),
      tile('Neutral', `${p0((cms.neutral / cms.total) * 100)} <small>${n0(cms.neutral)}</small>`, 'Listed factually among options, no judgment attached.'),
      tile('Negative', `${p0((cms.neg / cms.total) * 100)} <small>${n0(cms.neg)}</small>`, `${n0(cms.neg)} negative mention${cms.neg === 1 ? '' : 's'} across all scanned answers.`),
    ].join('') : '';
    // ── v7.417 · sentiment_v2_score ────────────────────────────────────────────────────────
    // Const II.6: the panel now reads a sentiment figure this export DOES carry, so the report —
    // a rollup over the same metrics blob — must read the same one rather than printing "no
    // sentiment" while the panel shows a number. Only the client's own reading is rendered:
    // Profound scores the client's rows and almost none of its competitors', so a brand-by-brand
    // bar chart off this column would be a chart of who Profound scored, not of who is liked.
    const ssBrandsP  = pf.sentScoreBrands || [];
    const ssClientP  = ssBrandsP.find(b => b.isClient) ?? null;
    const ssOpenP    = pf.sentScoreOpen ?? null;
    const ssTopicsP  = (pf.sentScoreClientTopics || []).filter(t => t.mean !== null);
    const ssHasP     = !!(pf.sentScoreCol && ((ssClientP && ssClientP.mean !== null) || (ssOpenP && ssOpenP.mean !== null)));
    const scoreTiles = ssHasP ? [
      ssClientP && ssClientP.mean !== null
        ? tile('Direct evaluation', `${ssClientP.mean.toFixed(2)} <small>of 1.00</small>`, `${n0(ssClientP.n)} of ${n0(ssClientP.rows)} evaluation answers carried a score.`)
        : '',
      ssOpenP && ssOpenP.mean !== null
        ? tile('Open answers', `${ssOpenP.mean.toFixed(2)} <small>of 1.00</small>`, `${n0(ssOpenP.n)} scored answers to brand-agnostic questions.`)
        : '',
    ].join('') : '';
    const scoreTopicBars = ssHasP && ssTopicsP.length > 0
      ? ssTopicsP.map(t => barRow(t.label, (t.mean as number) * 100, (t.mean as number).toFixed(2), 'var(--blue)', '1.5in', '1.1in')).join('')
      : '';
    // The claim-level chart is the preferred read when the export still has claims; the score
    // section stands in only when it does not. Both can render if an export carries both.
    const sentFallback = ssHasP
      ? `<div class="figtitle">Sentiment score — the client's own reading</div>
      <div class="figsub">Profound's sentiment_v2_score (0–1) · ${n0(pf.sentScoreScored ?? 0)} of ${n0(pf.sentScoreRows ?? 0)} rows in the sentiment export carry a score</div>
      <div class="tiles s2">${scoreTiles}</div>
      ${scoreTopicBars ? `<div class="figtitle" style="margin-top:16px;">By topic — under direct evaluation</div>
      <div class="figsub">Answers to &ldquo;Evaluate ${esc(pf.client)} on &lt;topic&gt;&rdquo;, scored 0–1</div>${scoreTopicBars}` : ''}
      <div class="figsub" style="margin-top:10px;">This export scores the client's mentions and almost none of its competitors', so it supports a reading of how the client is spoken about — not a ranking of brands against each other. The two populations above are reported separately because a brand put under direct evaluation and a brand merely listed in a recommendation are not measuring the same thing.</div>`
      : '<p class="figsub">This dataset carries no sentiment claims and no sentiment score.</p>';
    pages.push(pageWrap('SENTIMENT', 'PART III · THE AI ANSWER LAYER', `
      <h1 class="pg">Is the problem tone — or frequency?</h1>
      <div class="lede">Two independent reads of tone: the claims AI engines make about each brand, and the tone of each actual mention. Together they answer whether this is a visibility build or a reputation repair.</div>
      ${sentBars ? `<div class="figtitle">Net sentiment by brand — claims made inside AI answers</div>
      <div class="figsub">Positive minus negative share of sentiment claims per brand · you highlighted</div>
      ${sentBars}` : sentFallback}
      ${toneTiles ? `<div class="figtitle" style="margin-top:16px;">Tone of your actual mentions in answers</div>
      <div class="figsub">All ${n0(cms!.total)} assessed mentions across the engines</div>
      <div class="tiles c3">${toneTiles}</div>` : ''}
      <div class="callout"><div class="t">THE STANDING GUARD</div><p>Sentiment is re-scored on every dataset refresh. If net sentiment turns while visibility grows, the program flags it at the source level — AI answers repeat what the cited source pool says, so a souring theme is caught before it compounds into brand tracking.</p></div>
      <div class="src">Source: AI visibility dataset — sentiment claims and per-mention tone are classified in the dataset; counts are direct.</div>`));
  } else {
    pages.push(pageWrap('THE AI ANSWER LAYER', 'PART III · THE AI ANSWER LAYER', `
      <h1 class="pg">The AI answer layer — not yet measured.</h1>
      <div class="lede">AI answer engines (ChatGPT, Perplexity, Gemini, Google's AI results) now answer a large share of buyer questions before any website is visited. This project does not yet have AI visibility data loaded, so this report makes no claims about it — per the governance rules, a gap is shown honestly rather than estimated.</div>
      ${gapBlock('AI visibility tracking', 'Load the AI visibility exports on the AI Answer Engines panel, then regenerate this report — the assessment expands with five sections: market position, engine-by-engine behavior, prompt demand and the winnable set, the citation supply chain, and sentiment.')}`));
  }

  // ── v7.376: PART IV · WHO IT AFFECTS — audience segments + journeys ─────────
  // Both conditional: rendered ONLY when the panel data exists (Const I.5 —
  // absent entirely otherwise, per the client's rule for these sections).
  const partWho = 'PART IV · WHO IT AFFECTS';
  const partOpp = (hasSeg || hasJourney) ? 'PART V · THE OPPORTUNITY' : 'PART IV · THE OPPORTUNITY';

  if (hasSeg) {
    const SEG_ACCENTS = ['var(--blue)', 'var(--good)', 'var(--violet)', 'var(--aqua)'];
    const segCards = segAgg.slice(0, 3).map((a, i) => {
      const s = a.s;
      const accent = SEG_ACCENTS[i % SEG_ACCENTS.length];
      const chips = [...(s.preLLMPrompts ?? []).slice(0, 2), ...(s.productPrompts ?? []).slice(0, 1)]
        .map(p => `<span style="display:inline-block; font-size:7.5px; color:var(--ink2); background:#f4f3ef; border:1px solid #e0dfd8; border-radius:3px; padding:1px 5px; margin:0 3px 3px 0;">&ldquo;${esc(p)}&rdquo;</span>`).join('');
      const pctN = Math.max(0, Math.min(100, s.volumePct ?? 0));
      const foot = a.topics > 0
        ? `<b style="color:var(--ink);">${n0(a.topics)} journey topics</b> (${n0(a.optimize)} optimize &middot; ${n0(a.build)} build)${a.topGroup ? ` &middot; biggest: ${esc(a.topGroup.name)} &middot; ${vol(a.topGroup.vol)}/mo` : ''}`
        : `<span style="color:var(--muted);">No journey topics attributed yet.</span>`;
      return `<div class="panelbox" style="border-top:3px solid ${accent}; display:flex; flex-direction:column;">
        <div style="display:flex; align-items:baseline; gap:8px;"><span style="font-size:22px; font-weight:800; color:${accent};">${p0(pctN)}</span><span style="font-size:8px; font-weight:700; letter-spacing:.08em; color:var(--muted);">OF VOLUME <span style="font-weight:400; text-transform:none;">(modeled share)</span></span></div>
        <div style="font-size:11.5px; font-weight:800; color:var(--ink); margin:2px 0 6px;">${esc(s.name)}</div>
        <div class="track" style="height:5px; margin-bottom:8px;"><div class="fill" style="width:${clampW(pctN).toFixed(1)}%; background:${accent};"></div></div>
        ${s.tagline ? `<p style="font-size:8.8px; font-style:italic; color:var(--ink2); margin:0 0 7px;">&ldquo;${esc(s.tagline)}&rdquo;</p>` : ''}
        ${s.whoTheyAre?.demographics ? `<p style="font-size:8.5px; color:var(--ink2); margin:0 0 3px;"><b style="color:var(--ink);">WHO</b> &nbsp;${esc(s.whoTheyAre.demographics)}</p>` : ''}
        ${s.whoTheyAre?.trigger ? `<p style="font-size:8.5px; color:var(--ink2); margin:0 0 7px;"><b style="color:var(--ink);">TRIGGER</b> &nbsp;${esc(s.whoTheyAre.trigger)}</p>` : ''}
        ${chips ? `<div style="margin-bottom:7px;">${chips}</div>` : ''}
        <div style="margin-top:auto; border-top:1px solid #e6e5de; padding-top:6px; font-size:8.5px; color:var(--ink2);">${foot}</div>
      </div>`;
    }).join('');
    const segRead = topSeg
      ? `<b>${p0(topSeg.s.volumePct ?? 0)} of your demand belongs to ${esc(topSeg.s.name)}</b>${topSeg.s.whoTheyAre?.trigger ? ` — ${esc(topSeg.s.whoTheyAre.trigger)}` : '.'}${pf && pf.totalRuns > 0 ? ` Their journey runs through the AI answer layer, where you appear in ${p1(pfVisPct)} of scanned answers.` : ''} Each segment is won in a different section of this report.`
      : '';
    pages.push(pageWrap('AUDIENCE SEGMENTS', partWho, `
      <h1 class="pg">${segs.length === 1 ? 'The buyer behind your demand.' : `${segs.length === 2 ? 'Two' : segs.length === 3 ? 'Three' : n0(segs.length)} buyers own your demand.`}${topSeg && (topSeg.s.volumePct ?? 0) >= 40 ? ' The biggest one is won early.' : ''}</h1>
      <div class="lede">The audience intelligence distills your search footprint into <b>${n0(segs.length)} research-backed buyer segment${segs.length === 1 ? '' : 's'}</b> — who they are, what triggers them, and the exact prompts they type. Every quoted prompt is a real query from the scanned footprint; the volume shares are a modeled partition of that real demand, labeled per the governance rules.</div>
      <div style="display:grid; grid-template-columns:repeat(${Math.min(3, Math.max(1, segAgg.slice(0, 3).length))},1fr); gap:10px; margin-bottom:13px;">${segCards}</div>
      ${segs.length > 3 ? `<div class="figsub" style="margin-bottom:10px;">Showing the top 3 of ${n0(segs.length)} segments by share — the full set is in the Audience Segments panel.</div>` : ''}
      ${segRead ? `<div class="callout"><div class="t">READ</div><p>${segRead}</p></div>` : ''}
      <div class="src">Source: stored audience-segment research over the project's real query footprint. Quoted prompts are real scanned queries; segment volume shares${hasJourney ? ` and topic attributions (${n0(segAttributedN)} topics attributed + ${n0(segSharedN)} shared across all segments)` : ''} are modeled partitions of real volumes, labeled per Constitution I.5a.</div>`));
  }

  if (hasJourney) {
    const jStageBars = jStageAgg.map(sa => {
      const maxVol = Math.max(1, ...jStageAgg.map(x => x.vol));
      return barRow(JOURNEY_LABELS[sa.stage], (sa.vol / maxVol) * 100, `${n0(sa.n)} · ${vol(sa.vol)}/mo`, 'var(--blue)', '1.05in', '1.15in');
    }).join('');
    const jGroupBars = jTopGroups.map(g => {
      const maxVol = Math.max(1, jTopGroups[0]?.vol ?? 1);
      return barRow(g.group, (g.vol / maxVol) * 100, `${vol(g.vol)}/mo`, 'var(--blue)', '1.9in', '.8in');
    }).join('');
    const awStage = jStageAgg.find(x => x.stage === 'awareness');
    const awShare = jTotal > 0 && awStage ? Math.round((awStage.n / jTotal) * 100) : 0;
    const volTotal = jStageAgg.reduce((s, x) => s + x.vol, 0);
    const awVolShare = volTotal > 0 && awStage ? Math.round((awStage.vol / volTotal) * 100) : 0;
    // the four-stage discovery path stored with the top segment's journey research
    const tps = (topSeg?.s as any)?.touchpoints as Array<{ stage: string; description: string }> | undefined;
    const pathSteps = (tps ?? []).slice(0, 4).map((tp, i) =>
      `<p style="font-size:9.3px; color:var(--ink2); margin:${i === 0 ? '6px' : '0'} 0 4px;"><b style="color:var(--ink);">${n0(i + 1)} &middot; ${esc(tp.stage.replace(/^Stage \d+\s*[—-]?\s*/i, '') || tp.stage)}</b> — ${esc(tp.description.length > 170 ? tp.description.slice(0, 167) + '…' : tp.description)}</p>`).join('');
    const jRead = jTopGroups[0]
      ? `The single biggest journey group — <b>${esc(jTopGroups[0].group)}, ${vol(jTopGroups[0].vol)} searches/mo</b> — leads a map of ${n0(jGroupCount)} groups. ${jBuild > 0 && jTopStage ? `Of the ${n0(jBuild)} net-new build targets, ${n0(jTopStage.builds)} sit at the ${JOURNEY_LABELS[jTopStage.stage].toLowerCase()} stage — the tier that feeds every later decision.` : `All ${n0(jTotal)} topics already have content to optimize.`}`
      : '';
    pages.push(pageWrap('AUDIENCE JOURNEYS', partWho, `
      <h1 class="pg">${jCoverage >= 80 ? 'The journey is mapped. The gaps cluster at the front door.' : 'The journey is mapped — and much of it is uncovered.'}</h1>
      <div class="lede">Every topic cluster is placed on the buyer journey by funnel stage — the same canonical topics the app's panels count, one source of truth. <b>${n0(jOpt)} of ${n0(jTotal)} topics already have ${brandName} content to optimize</b>; ${n0(jBuild)} must be built new${jBuild > 0 && jTopStage && jTopStage.builds > 0 ? ` — ${n0(jTopStage.builds)} of those at the ${JOURNEY_LABELS[jTopStage.stage].toLowerCase()} stage` : ''}.</div>
      <div class="tiles c3" style="margin-bottom:13px;">
        ${tile('Topics in journey', `${n0(jTotal)} <small>${n0(jGroupCount)} groups</small>`, 'Every cluster mapped to a funnel stage; volumes are real scanned roll-ups.')}
        ${tile('Journey coverage', p0(jCoverage), `${n0(jOpt)} topics to optimize on existing pages · ${n0(jBuild)} net-new builds.`)}
        ${jBuild > 0 && jTopStage ? tile('Where the gaps sit', `${n0(jTopStage.builds)} <small>of ${n0(jBuild)}</small>`, `Net-new build targets at the ${JOURNEY_LABELS[jTopStage.stage].toLowerCase()} stage.`, 'bad') : tile('Net-new builds', n0(jBuild), 'Topics with no client page or ranking yet.')}
      </div>
      <div class="two" style="margin-bottom:13px;">
        <div class="panelbox">
          <div class="figtitle">Demand by funnel stage</div>
          <div class="figsub">Topics and real monthly volume per stage &middot; stage placement is rule-based over stored categories</div>
          ${jStageBars}
          ${awStage ? `<p style="font-size:9px; color:var(--muted); margin-top:8px;">${p0(awShare)} of topics and ~${p0(awVolShare)} of journey volume sit at awareness — whoever owns the education tier inherits the later stages.</p>` : ''}
        </div>
        <div class="panelbox"${pathSteps ? ' style="border-top:3px solid var(--blue);"' : ''}>
          ${pathSteps ? `<div class="figtitle">How your buyers actually move</div>
          <div class="figsub">The discovery path stored with ${esc(topSeg!.s.name ?? 'the top segment')}'s journey research</div>
          ${pathSteps}
          ${pf && pf.totalRuns > 0 ? `<p style="font-size:9px; color:var(--muted); margin:0;">Step 1 is why the AI answer layer leads the recommended program: the journey starts in a surface where you appear in ${p1(pfVisPct)} of answers.</p>` : ''}`
          : `<div class="figtitle">Journey lanes</div>
          <div class="figsub">Product vs pre-product topics on this map</div>
          <p style="font-size:9.3px; color:var(--ink2); margin-top:6px;">Product journey: <b>${n0(jTotal - jPreN)}</b> topics &middot; Pre-product (life-events) journey: <b>${n0(jPreN)}</b> topics${jPreN > 0 ? ` (${n0(jPreBuild)} to build)` : ''}.</p>`}
        </div>
      </div>
      <div class="figtitle">Where the journey volume concentrates — top topic groups</div>
      <div class="figsub">Real monthly search volume per journey group &middot; top ${n0(jTopGroups.length)} of ${n0(jGroupCount)} groups mapped</div>
      ${jGroupBars}
      ${jRead ? `<div class="callout" style="margin-top:10px;"><div class="t">READ</div><p>${jRead}</p></div>` : ''}
      <div class="src">Source: journey map over canonical topic clusters — counts and volumes are real rows; stage and segment links are model-inferred, labeled.${jPreN === 0 ? ' The pre-product (life-events) lane joins this map once that journey build runs.' : ''}</div>`));
  }

  // ── Program (v7.405) ───────────────────────────────────────────────────────
  // Part V is now a workstream ladder plus a detail page per workstream, built
  // from real counts (lib/pdf/programData.ts). Every row is conditional on its
  // own data source: a client with no location estate simply has no local row,
  // and a footprint with no 4–20 ranks falls back to the legacy step cards
  // rather than printing an empty ladder (Const I.5).
  const gaugeE = (n: number) => `<div class="gauge">${Array.from({ length: 5 }, (_, i) => `<i class="pip${i < n ? ' e' : ''}"></i>`).join('')}</div>`;
  const gaugeI = (n: number) => `<div class="gauge">${Array.from({ length: 5 }, (_, i) => `<i class="pip${i < n ? ' i' : ''}"></i>`).join('')}</div>`;
  // Impact is the real quantity the row can move against its OWN tracked universe.
  // Published bins: HIGH >=25% - MEDIUM 5-24% - LOW <5%. Never a judgement call.
  const impactBin = (part: number, whole: number): { pips: number; label: string } => {
    const share = whole > 0 ? (part / whole) * 100 : 0;
    if (share >= 25) return { pips: 5, label: 'HIGH' };
    if (share >= 5)  return { pips: 3, label: 'MEDIUM' };
    return { pips: 2, label: 'LOW' };
  };

  if (prog) {
    interface WsRow { tier: 'p1' | 'p2' | 'p3' | 'run'; title: string; tactics: string[];
      ePips: number; eLabel: string; eNote: string; iPips: number; iLabel: string; iNote: string; proof: string; sub: string }
    const ws: WsRow[] = [];

    ws.push({ tier: 'p1', title: 'Close the 4–20 gap on existing URLs',
      tactics: [
        `<b>${n0(prog.kw4to20)}</b> keywords rank 4–20 across <b>${n0(prog.urls4to20)}</b> existing URLs${prog.topics4to20 > 0 ? ` and ${n0(prog.topics4to20)} topics` : ''} — <b>${vol(prog.demand4to20)}</b> monthly demand already in reach`,
        `Pareto cut, not the whole set: <b>${n0(prog.paretoUrls)} URLs carry ${p0(prog.paretoSharePct)}</b> of that demand and lead the queue`,
      ],
      ePips: 3, eLabel: 'MEDIUM', eNote: `optimize existing<br>${n0(prog.paretoUrls)} pages · 0 new`,
      iPips: 5, iLabel: 'HIGH', iNote: `${p0(prog.paretoSharePct)} of ${vol(prog.demand4to20)}`,
      proof: '&sect; The 4–20 set', sub: 'position and volume rows, per URL' });

    if (lp) {
      const packMiss = Math.max(0, 100 - lp.pack.presenceRate);
      ws.push({ tier: 'p1', title: 'Close the map-pack presence gap across the location estate',
        tactics: [
          `Listing completeness and category alignment across <b>${n0(lp.clientLocs.length)} locations</b> — no new content, and it shares no assets with the page work, so it runs in parallel`,
          `Presence before reputation — a location absent from the pack earns nothing from its rating${lp.reviews.avgRating > 0 && lp.reviews.avgRating < 4 ? `, so coverage is fixed before a review dollar is spent against the <b>${lp.reviews.avgRating.toFixed(1)}${svgStar(9,'#b07d10')}</b> gate` : ''}`,
        ],
        ePips: 4, eLabel: 'HIGH', eNote: `bulk record pass<br>${n0(lp.clientLocs.length)} locations`,
        iPips: packMiss >= 25 ? 5 : 3, iLabel: packMiss >= 25 ? 'HIGH' : 'MEDIUM', iNote: `${p0(packMiss)} of pack-eligible queries absent`,
        proof: '&sect; Local search — the map pack', sub: 'real pack and listing rows' });
    }

    const aioOpen = (prog.aioShown ?? 0) - (prog.aioCited ?? 0);
    const paaOpen = (prog.paaShown ?? 0) - (prog.paaCited ?? 0);
    if (prog.aioShown !== null && (prog.aioShown > 0 || (prog.paaShown ?? 0) > 0)) {
      const uni = (prog.aioShown ?? 0) + (prog.paaShown ?? 0);
      const b = impactBin(aioOpen + paaOpen, uni);
      ws.push({ tier: 'p2', title: 'Take AIO and PAA coverage on the Priority-1 pages',
        tactics: [
          `Scoped to the Priority-1 URLs only — <b>${n0(prog.aioShown ?? 0)}</b> render an AI Overview, <b>${n0(prog.paaShown ?? 0)}</b> a People Also Ask box`,
          `You are cited on <b>${n0(prog.aioCited ?? 0)}</b> and <b>${n0(prog.paaCited ?? 0)}</b> — the rest is coverage on pages already being edited`,
        ],
        ePips: 2, eLabel: 'LOW–MED', eNote: 'same pages as WS 1<br>no additional URLs',
        iPips: b.pips, iLabel: b.label, iNote: `${n0(aioOpen + paaOpen)} of ${n0(uni)} boxes open`,
        proof: '&sect; AIO &amp; PAA coverage', sub: 'per-keyword feature scan rows' });
    }

    if (pf && (pf.gaps || []).length > 0) {
      const b = impactBin(pf.gaps.length, Math.max(pf.promptN || 0, pf.gaps.length));
      ws.push({ tier: 'p2', title: 'Map the open prompts onto those same URLs',
        tactics: [
          `<b>${n0(pf.gaps.length)}</b> tracked prompts have a rival in the answer and not you${pf.promptN ? ` — of ${n0(pf.promptN)} prompts tracked` : ''}`,
          leaderRows.length > 0 ? `Incumbents named per prompt — ${leaderRows.slice(0, 2).map(([l, n]) => `<b>${n0(n)} ${esc(l)}-led</b>`).join(', ')}` : 'Each prompt is itemized in the app with its incumbent',
        ],
        ePips: 2, eLabel: 'LOW–MED', eNote: `same pages as WS 1<br>${n0(pf.gaps.length)} prompts`,
        iPips: b.pips, iLabel: b.label, iNote: `${n0(pf.gaps.length)} of ${n0(pf.promptN || pf.gaps.length)} prompts`,
        proof: '&sect; Prompt coverage', sub: 'per-prompt rows with incumbents' });
    }

    if (hasJourney && jBuild > 0) {
      const b = impactBin(jBuild, jTotal);
      ws.push({ tier: 'p3', title: 'Build into proven journey and demand gaps',
        tactics: [
          `<b>${n0(jBuild)} net-new builds</b> on the ${n0(jTotal)}-topic map${jTopStage ? `; <b>${n0(jTopStage.builds)} at ${JOURNEY_LABELS[jTopStage.stage].toLowerCase()}</b>, so the format follows the stage` : ''}`,
          `Qualifies on a proven gap — a journey hole, or search <i>and</i> prompt demand with no page`,
        ],
        ePips: 5, eLabel: 'HIGH', eNote: `net-new assets<br>${n0(jBuild)} pages to build`,
        iPips: b.pips, iLabel: b.label, iNote: `${n0(jBuild)} of ${n0(jTotal)} mapped topics`,
        proof: '&sect; The build queue', sub: 'journey stage + dual-demand rows' });
    }

    if (pf && pfBridgeSum > 0) {
      const uni = Math.max(pf.citeMentions || 0, pfBridgeSum);
      const b = impactBin(pfBridgeSum, uni);
      ws.push({ tier: 'run', title: 'Convert citations and compound authority',
        tactics: [
          `<b>${n0(pfBridgeSum)} brand mentions</b> on ${pfBridge.map(h => esc(h.hostname)).join(', ')} convert to links, no new content`,
          `Each conversion also lands a high-authority referring domain — the widest measured gap`,
        ],
        ePips: 1, eLabel: 'LOW', eNote: `outreach only<br>${n0(pfBridge.length)} hosts · 0 pages`,
        iPips: b.pips, iLabel: b.label, iNote: `${n0(pfBridgeSum)} of ${n0(uni)} mentions`,
        proof: '&sect; Citation supply chain', sub: 'mention-source rows, per host' });
    }

    let wsN = 0;
    const rowHTML = (r: WsRow) => {
      wsN += 1;
      return `<tr>
      <td><div class="rank">WS&nbsp;${wsN}</div></td>
      <td><div class="rec">${r.title}</div></td>
      <td><ul class="tac">${r.tactics.map(t => `<li>${t}</li>`).join('')}</ul></td>
      <td>${gaugeE(r.ePips)}<div class="glab">${r.eLabel}</div><span class="gnum">${r.eNote}</span></td>
      <td>${gaugeI(r.iPips)}<div class="glab">${r.iLabel}</div><span class="gnum">${r.iNote}</span></td>
      <td class="proof"><b>${r.proof}</b>${r.sub}</td></tr>`;
    };
    const lane = (k: string, txt: string, grey = false) =>
      `<tr class="lane${grey ? ' run' : ''}"><td colspan="6"><div class="lanek${grey ? ' g' : ''}">${k} &nbsp;<span>— ${txt}</span></div></td></tr>`;

    const p1 = ws.filter(r => r.tier === 'p1'), p2 = ws.filter(r => r.tier === 'p2');
    const p3 = ws.filter(r => r.tier === 'p3'), rn = ws.filter(r => r.tier === 'run');
    const ladder = [
      p1.length ? lane('PRIORITY 1', `what you already own · no new content${p1.length > 1 ? ' · these run in parallel' : ''}`) + p1.map(rowHTML).join('') : '',
      p2.length ? lane('PRIORITY 2', 'the same pages, on the answer surfaces') + p2.map(rowHTML).join('') : '',
      p3.length ? lane('PRIORITY 3', 'net-new content, only where a real gap is proven') + p3.map(rowHTML).join('') : '',
      rn.length ? lane('RUNNING UNDERNEATH', 'starts with Priority 1, never stops', true) + rn.map(rowHTML).join('') : '',
    ].join('');

    pages.push(pageWrap('THE RECOMMENDED PROGRAM', partOpp, `
      <h1 class="pg sm">Start with the pages you already own.</h1>
      <div class="lede">This is the opening phase, not the whole program. Priority 1 is the work that needs no new content: <b>the pages already ranking 4–20</b>${lp ? ', and <b>the location estate</b>' : ''}. Priority 2 takes the answer surfaces on those same pages. Priority 3 and the citation track reach past that set once it is underway.</div>
      <table class="prog">
        <colgroup><col style="width:.52in"><col style="width:1.42in"><col style="width:2.14in"><col style="width:.86in"><col style="width:.86in"><col style="width:1.26in"></colgroup>
        <tr><th></th><th>Workstream</th><th>What we actually do</th><th>Effort</th><th>Impact</th><th>Backed by</th></tr>
        ${ladder}
      </table>
      <div class="src" style="margin-top:8px;"><b style="color:var(--ink2);">EFFORT</b> is rated by the kind of work — LOW = outreach only, no asset produced &middot; MEDIUM = optimizing assets that already exist &middot; HIGH = net-new asset creation, or a bulk pass over 1,000+ records. <b style="color:var(--ink2);">IMPACT</b> is the real quantity the row can move against its own tracked universe — HIGH &ge;25% &middot; MEDIUM 5–24% &middot; LOW &lt;5%.</div>
      <div class="src">Source: every figure is a count over real scanned rows — positions, volumes and ranking URLs from the shared keyword pool, topic counts from the canonical map, AI Overview and People Also Ask presence from per-keyword scan rows. A workstream whose data source is absent does not appear at all; nothing is zeroed or estimated.</div>`));

    // ── WS1 detail: the 4–20 set ─────────────────────────────────────────────
    const bandRows = prog.bands.map(b => `<tr><td><b>${b.label}</b></td><td class="n">${n0(b.kws)}</td><td class="n">${n0(b.urls)}</td><td class="n">${vol(b.vol)}</td><td>${b.lo === 4 ? 'On-page and internal-link work only — these move on intent match and entity completeness, rarely on new links' : b.lo === 6 ? 'Same on-page work plus the citation lift from the outreach track — the band where authority starts to bind' : 'Needs content depth as well as structure. Highest volume, longest payback — sequenced after the two bands above'}</td></tr>`).join('');
    const urlRows = prog.topUrls.map(u => `<tr><td style="word-break:break-all;">${esc(u.url.replace(/^https?:\/\/(www\.)?/, ''))}</td><td class="n">${n0(u.kws)}</td><td class="n">${n0(u.bestPos)}</td><td class="n">${vol(u.vol)}</td><td class="n">${p0(u.cumPct)}</td></tr>`).join('');
    pages.push(pageWrap('WORKSTREAM 1 &middot; THE 4–20 SET', partOpp, `
      <h1 class="pg sm">The demand you are already one page from.</h1>
      <div class="lede">Positions 4–20 are the cheapest demand on this footprint: the page exists, the topic is already understood, and the ranking is proof the domain can compete there. <b>This set defines the URLs every Priority-2 workstream then works.</b></div>
      <div class="funnel c5">
        <div class="fstep on"><div class="fk">KEYWORDS 4–20</div><div class="fv">${n0(prog.kw4to20)}</div><div class="fd">Tracked keywords ranking 4–20</div></div>
        <div class="fstep"><div class="fk">EXISTING URLS</div><div class="fv">${n0(prog.urls4to20)}</div><div class="fd">Distinct pages behind them</div></div>
        <div class="fstep"><div class="fk">TOPICS</div><div class="fv">${n0(prog.topics4to20)}</div><div class="fd">Canonical topics touched</div></div>
        <div class="fstep"><div class="fk">MONTHLY DEMAND</div><div class="fv">${vol(prog.demand4to20)}</div><div class="fd">Real volume behind the set</div></div>
        <div class="fstep cut"><div class="fk">THE 80% CUT</div><div class="fv">${n0(prog.paretoUrls)}</div><div class="fd">URLs carrying ${p0(prog.paretoSharePct)} of that demand</div></div>
      </div>
      <div class="figtitle">Where the set sits, by position band</div>
      <div class="figsub">Closer bands convert faster; the 11–20 band is where the volume usually hides</div>
      <table class="dt" style="font-size:9.3px;">
        <tr><th style="width:1.0in;">Band</th><th style="width:.8in;">Keywords</th><th style="width:.8in;">URLs</th><th style="width:1.0in;">Monthly demand</th><th>What the work is</th></tr>
        ${bandRows}
      </table>
      ${prog.topUrls.length > 0 ? `<div class="figtitle" style="margin-top:15px;">The Pareto cut — what actually enters the queue</div>
      <div class="figsub">URLs by the real monthly demand behind their 4–20 keywords &middot; top ${n0(prog.topUrls.length)} of ${n0(prog.urls4to20)}</div>
      <table class="dt" style="font-size:9.3px;">
        <tr><th style="width:2.5in;">URL</th><th style="width:.7in;">Keywords</th><th style="width:.8in;">Best position</th><th style="width:.9in;">Monthly demand</th><th>Cumulative share</th></tr>
        ${urlRows}
        <tr><td colspan="5" style="color:var(--muted); font-style:italic;">… list continues to the URL where cumulative share crosses 80% — ${n0(prog.paretoUrls)} URLs queued, ${n0(prog.excludedUrls)} tracked but not queued this cycle.</td></tr>
      </table>` : ''}
      <div class="callout"><div class="t">HOW THE 80/20 CUT IS COMPUTED</div><p>URLs are sorted by the real monthly demand behind their 4–20 keywords, then taken in order until cumulative demand crosses <b>80%</b> of the set total. The cut is data-driven, not a fixed number of pages — a concentrated footprint yields a short queue, a long-tail one a longer queue. Both the queued and excluded counts appear above.</p></div>
      <div class="src">Source: positions, ranking URLs and monthly volumes are real rows on the shared keyword pool; topic assignment is the canonical cluster map. The 80% threshold is a stated editorial cut applied to those real rows — no value is estimated.</div>`));

    // ── WS AIO/PAA + prompts detail ──────────────────────────────────────────
    if (prog.aioShown !== null || (pf && (pf.gaps || []).length > 0)) {
      const gapRows = pf ? (pf.gaps || []).slice(0, 6).map(g => `<tr><td>${esc(g.prompt)}</td><td>${esc(g.topic || '—')}</td><td>${esc(g.leader || '—')}</td><td class="n">${n0(g.rivalMentions || 0)}</td></tr>`).join('') : '';
      pages.push(pageWrap('THE SAME PAGES, MORE SURFACES', partOpp, `
        <h1 class="pg sm">One page set. More than one place to win on it.</h1>
        <div class="lede">Everything here is scoped to the <span class="anchor">PRIORITY-1 URL SET</span> — no new pages enter. The same URLs that move in the organic ranking are also sitting under an AI Overview, a People Also Ask box, and a set of prompts they do not yet answer.</div>
        ${prog.aioShown !== null ? `<div class="figtitle">AI Overview and People Also Ask coverage</div>
        <div class="figsub">Counted only on keywords belonging to the Priority-1 URLs &middot; ${n0(prog.featureScanned ?? 0)} of them carry a feature scan</div>
        <table class="dt" style="font-size:9.3px;">
          <tr><th style="width:1.4in;">Surface</th><th style="width:.8in;">Boxes shown</th><th style="width:.8in;">You cited</th><th style="width:.7in;">Open</th><th>What the fix is, and why it is cheap here</th></tr>
          <tr><td><b>AI Overview</b></td><td class="n">${n0(prog.aioShown ?? 0)}</td><td class="n">${n0(prog.aioCited ?? 0)}</td><td class="n">${n0(aioOpen)}</td><td>Answer-first opening, entity completeness, an extractable table. The page already ranks, so this is a formatting gap, not an authority gap</td></tr>
          <tr><td><b>People Also Ask</b></td><td class="n">${n0(prog.paaShown ?? 0)}</td><td class="n">${n0(prog.paaCited ?? 0)}</td><td class="n">${n0(paaOpen)}</td><td>Every PAA question is captured verbatim with the source currently answering it — the on-page addition is a known question, not a guess</td></tr>
        </table>
        <p style="font-size:9px; margin-top:7px;"><b style="color:var(--ink);">Why these are prioritized together:</b> both surfaces sit on top of a ranking the Priority-1 work is already improving. A page edited once can take the rank, the AI Overview citation and the PAA answer in the same pass — three wins for one production cycle.</p>` : ''}
        ${gapRows ? `<div class="figtitle" style="margin-top:16px;">The open prompts those pages should be answering</div>
        <div class="figsub">Top ${n0(Math.min(6, (pf!.gaps || []).length))} of ${n0((pf!.gaps || []).length)} — every one has a rival in the answer and no mention of you</div>
        <table class="dt" style="font-size:9.3px;">
          <tr><th style="width:3.0in;">Prompt</th><th style="width:1.1in;">Topic</th><th style="width:1.1in;">Incumbent</th><th style="width:.7in;">Rival mentions</th></tr>
          ${gapRows}
        </table>` : ''}
        <div class="src">Source: AI Overview and PAA presence and citation are real per-keyword feature-scan rows, counted only on the Priority-1 keyword set; prompt rows and their incumbents are real per-prompt records.</div>`));
    }
  } else {
    // Program
    const steps: string[] = [];
    if (pf && pfBridgeSum > 0) steps.push(`<div class="panelbox" style="border-top:4px solid var(--good);"><div class="stepk" style="color:var(--good);">STEP 1</div><div class="figtitle">Convert mentions → citations</div><p>Outreach to the ${n0(pfBridgeSum)} existing brand mentions on ${pfBridge.map(h => esc(h.hostname)).join(', ')} — hosts the engines already cite at scale. No new content required.</p></div>`);
    if (pf && (pf.gaps || []).length > 0) steps.push(`<div class="panelbox" style="border-top:4px solid var(--blue);"><div class="stepk" style="color:var(--blue-550);">STEP 2</div><div class="figtitle">Win the winnable prompts</div><p>The ${n0(pf.gaps.length)} tracked prompts where rivals appear and you do not${leaderRows.length > 0 ? ` — ${leaderRows.slice(0, 2).map(([l, n]) => `${n0(n)} led by ${esc(l)}`).join(', ')}` : ''}. Each is itemized in the app with its incumbent.</p></div>`);
    const worstTopics = pf ? pf.topics.filter(t => t.runs >= 6 && t.hits / t.runs <= 0.02).sort((a, b) => b.runs - a.runs).slice(0, 3) : [];
    if (worstTopics.length > 0) steps.push(`<div class="panelbox" style="border-top:4px solid var(--yellow);"><div class="stepk" style="color:#8a5a00;">STEP 3</div><div class="figtitle">Build into verified whitespace</div><p>Net-new answer-ready content aimed at the proven vacuums: ${worstTopics.map(t => `${esc(t.topic)} (${p1((t.hits / Math.max(1, t.runs)) * 100)})`).join(' · ')}.</p></div>`);
    if (steps.length === 0 && sov) steps.push(`<div class="panelbox" style="border-top:4px solid var(--blue);"><div class="stepk" style="color:var(--blue-550);">STEP 1</div><div class="figtitle">Claim the open clicks</div><p>${p0(openPct * 100)} of modeled page-1 clicks on this footprint are unclaimed by any tracked competitor — the opportunity queue in the app itemizes them by demand.</p></div>`);
    if (steps.length > 0) {
      const running: string[] = [];
      if (lp) running.push(`<b>The local layer</b> — listing coverage and review reputation across ${n0(lp.clientLocs.length)} locations: presence first (${p0(lp.pack.presenceRate)} today)${lp.reviews.avgRating > 0 && lp.reviews.avgRating < 4 ? `, then the ${lp.reviews.avgRating.toFixed(1)}${svgStar(9,'#b07d10')} reputation gate` : ''}.`);
      if (auth) running.push(`<b>Authority compounding</b> — every earned placement also lands a high-authority referring domain, the tier of the link profile where gains matter most.`);
      if (hasJourney && jBuild > 0 && jTopStage) running.push(`<b>The journey map</b> — ${n0(jTotal)} topics tracked by funnel stage; the ${n0(jBuild)} net-new builds (${n0(jTopStage.builds)} at ${JOURNEY_LABELS[jTopStage.stage].toLowerCase()}) feed the build queue in priority order.`);
      running.push(`<b>Engine steer &amp; sentiment guard</b> — visibility and tone tracked on every refresh, so a souring theme is caught at the source level.`);
      pages.push(pageWrap('THE RECOMMENDED PROGRAM', partOpp, `
        <h1 class="pg">Sequenced by cost of entry, not by habit.</h1>
        <div class="lede">The work is ordered by what each win costs: conversions of existing assets come before optimization, and optimization comes before net-new builds. Every step below is backed by the counts on the preceding pages.</div>
        <div style="display:grid; grid-template-columns:repeat(${Math.min(3, steps.length)},1fr); gap:14px; margin-bottom:16px;">${steps.join('')}</div>
        <div class="panelbox" style="margin-bottom:14px;"><div class="figtitle">Running throughout</div><p style="margin-top:6px; font-size:10px;">${running.join(' ')}</p></div>
        <div class="callout"><div class="t">WHY THIS ORDER</div><p>Step 1 costs outreach and zero content. Later steps build on the citation trust the earlier ones create, so new content enters AI answers faster. Reversing the order means publishing into a surface that doesn't yet cite you.</p></div>`));
    }
  }

  // Scorecard
  const scoreRows: string[] = [];
  scoreRows.push(`<tr><td><b>Page-1 capture</b> (volume-weighted)</td><td class="n">${p1(m.captureRate * 100)}</td><td>Share of real monthly demand where you hold a top-10 position</td></tr>`);
  if (sov) scoreRows.push(`<tr><td><b>Share of Voice</b> (page-1 click capture, est.)</td><td class="n">${p0(sov.sovPct * 100)}</td><td>Modeled via ${esc(sov.ctrSource)} — the one labeled estimate</td></tr>`);
  if (pf && pf.totalRuns > 0) scoreRows.push(`<tr><td><b>Overall AI visibility</b></td><td class="n">${p1(pfVisPct)} (${n0(pf.clientHits)} of ${n0(pfScored)})</td><td>Answers naming you, of those naming any brand</td></tr>`);
  if (pf && pfClientCov) scoreRows.push(`<tr><td><b>AI prompt coverage</b></td><td class="n">${p0(pfClientCov.pct)}${pfRivalCov ? ` (vs ${esc(pfRivalCov.brand)} ${p0(pfRivalCov.pct)})` : ''}</td><td>Distinct prompts where you appear at least once</td></tr>`);
  if (pf && (pf.citeTotal || 0) > 0) scoreRows.push(`<tr><td><b>Owned citation share</b></td><td class="n">${p1(pf.citeOwnedShare)} (${n0(pf.citeOwned)} of ${n0(pfCiteDen)})</td><td>Cited sources on your own domain, of those classified</td></tr>`);
  if (pf && pfBridgeSum > 0) scoreRows.push(`<tr><td><b>Brand mentions → citations</b></td><td class="n">${n0(pfBridgeSum)} unconverted</td><td>Mentions on top citable hosts, tracked per host</td></tr>`);
  if (auth) {
    const topComp = auth.comps[0];
    scoreRows.push(`<tr><td><b>High-authority referring domains</b> (AS&ge;50)</td><td class="n">${n0(auth.client.qualityTiers?.ge50 ?? 0)}${topComp?.qualityTiers ? ` (vs ${esc(topComp.domain)} ${n0(topComp.qualityTiers.ge50)})` : ''}</td><td>Earned placements land the top-tier links that close this gap</td></tr>`);
  }
  if (lp) {
    scoreRows.push(`<tr><td><b>Map-pack presence</b></td><td class="n">${p0(lp.pack.presenceRate)} (${n0(lp.pack.inPack)} of ${n0(lp.pack.withPack)})</td><td>Listing coverage across ${n0(lp.clientLocs.length)} locations lifts presence first</td></tr>`);
    if (lp.reviews.avgRating > 0) scoreRows.push(`<tr><td><b>Review reputation</b></td><td class="n">${lp.reviews.avgRating.toFixed(1)}${svgStar(9,'#b07d10')} (${n0(lp.reviews.totalReviews)} reviews)</td><td>${lp.reviews.avgRating < 4 ? 'Crossing the ~4.0 gate unlocks pack rank the listings already earn' : 'Held above the ~4.0 pack-rank gate'}</td></tr>`);
  }
  if (hasJourney) scoreRows.push(`<tr><td><b>Journey coverage</b></td><td class="n">${p0(jCoverage)} (${n0(jOpt)} of ${n0(jTotal)})</td><td>Topics with existing content to optimize; ${n0(jBuild)} net-new builds remain</td></tr>`);
  if (hasSeg && hasJourney) scoreRows.push(`<tr><td><b>Audience segments</b></td><td class="n">${n0(segs.length)}</td><td>${n0(segAttributedN)} journey topics attributed + ${n0(segSharedN)} shared across all (modeled attribution)</td></tr>`);
  const cms2 = pf ? (pf.mentionSent || []).find(x => x.isClient) : null;
  if (cms2 && cms2.total > 0) scoreRows.push(`<tr><td><b>Mention tone</b></td><td class="n">${n0(cms2.pos)} pos · ${n0(cms2.neutral)} neu · ${n0(cms2.neg)} neg</td><td>Held healthy while visibility scales — the guard metric</td></tr>`);
  pages.push(pageWrap('THE BASELINE SCORECARD', partOpp, `
    <h1 class="pg">Today's numbers, on the record.</h1>
    <div class="lede">Every metric below is re-computed on the same methodology at each refresh, so progress is measured against this baseline — not a moving target. This is the page you hold us to.</div>
    <table class="dt"><tr><th>Metric</th><th style="width:1.7in;">Baseline</th><th>What it measures</th></tr>${scoreRows.join('')}</table>
    <div class="two" style="margin-top:16px;">
      <div class="panelbox"><div class="figtitle">Cadence</div><p>Full re-scan on the same intelligence layers at a fixed cadence; every refresh regenerates this scorecard against baseline. No metric definitions change mid-program.</p></div>
      <div class="panelbox"><div class="figtitle">Honesty clause</div><p>If a data source is unavailable at re-scan, the metric shows as a gap — it is never estimated to preserve a trend line. The one modeled figure (Share of Voice) keeps its published-curve citation on every appearance.</p></div>
    </div>`));

  // Appendix
  pages.push(pageWrap('APPENDIX &amp; DEFINITIONS', 'APPENDIX', `
    <h1 class="pg">The receipts.</h1>
    <div class="lede">Definitions for every metric in this report. The full underlying data — every keyword, prompt, citation, mention, listing and pack row — is live in the OrbitIQ workspace this report was generated from.</div>
    <table class="dt" style="margin-bottom:16px;">
      <tr><th style="width:1.8in;">Term</th><th>Definition as used in this report</th></tr>
      <tr><td><b>Page-1 capture</b></td><td>Volume-weighted share of tracked keywords where the client holds a position 1–10 ranking. Direct from scan rows.</td></tr>
      <tr><td><b>Share of Voice (SoV)</b></td><td>Estimated share of the page-1 clicks available across the shared non-branded keyword landscape (client + tracked competitors), computed from real volumes and positions via a named, published click-through curve. The only modeled figure in the report; labeled at every appearance.</td></tr>
      <tr><td><b>AI visibility</b></td><td>Share of scanned AI answers naming the brand. Direct count from the AI visibility dataset.</td></tr>
      <tr><td><b>Prompt coverage</b></td><td>Share of tracked buyer prompts where the brand appears in at least one engine's answer. Direct count.</td></tr>
      <tr><td><b>Owned citation</b></td><td>A cited source URL classified as client-owned in the citation landscape. Direct count from the citation-level dataset.</td></tr>
      <tr><td><b>Winnable prompt</b></td><td>A tracked prompt where at least one rival appears in the answer and the client does not. Direct tally of per-prompt mention rows.</td></tr>
      <tr><td><b>Earned share (per engine)</b></td><td>Share of an engine's citations classified as earned media — the measure of how much PR moves that engine.</td></tr>
      ${auth ? `<tr><td><b>Authority Score / referring domains</b></td><td>Referring-domain, follow and tier counts are crawled backlink-index rows; Authority Score is that index's modeled composite, always labeled as modeled.</td></tr>` : ''}
      ${hasSeg || hasJourney ? `<tr><td><b>Segment share / journey attribution</b></td><td>Buyer-segment volume shares and topic&rarr;segment links are modeled partitions of real scanned volumes (an exclusive word-overlap against each segment's own stored language) — always labeled. Topic counts, volumes and funnel-stage placements are real rows and rule-based categories.</td></tr>` : ''}
      ${lp ? `<tr><td><b>Map-pack presence / Local Visibility Index</b></td><td>Presence, rank and ratings are real scanned pack and listing rows; the index is a fixed, documented blend of those four real ratios (40/25/20/15) — an editorial weighting, not a hidden model.</td></tr>` : ''}
    </table>
    <div class="endbrand">
      <div><div style="font-size:12px; font-weight:800;">OrbitIQ</div>
        <div style="font-size:9px; color:var(--muted); margin-top:2px;">An iQuanti product · every number traces to a scanned source</div></div>
      <div style="font-size:9px; color:var(--muted); text-align:right;">Generated by OrbitIQ from live project data</div>
    </div>`));

  // ── assemble: section numbers + page numbers ───────────────────────────────
  const total = pages.length;
  let secN = 0;
  const numbered = pages.map((p, i) =>
    p.replace('__FOOT__', `<div class="foot"><span>${footLeft}</span><span>Page ${i + 1} of ${total}</span></div>`)
     .replace('__EBL__', `${name.toUpperCase()} — SEARCH &amp; AI VISIBILITY ASSESSMENT`)
     .replace(/__SEC__/g, () => String(++secN).padStart(2, '0')));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${brandName} — Search &amp; AI Visibility Assessment</title>
<style>
  :root{--ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --baseline:#c3c2b7; --surface:#fcfcfb;
    --blue:#2a78d6; --blue-550:#1c5cab; --green:#008300; --yellow:#eda100; --aqua:#1baf7a; --orange:#eb6834; --violet:#4a3aa7;
    --good:#0ca30c; --critical:#d03b3b;}
  *{box-sizing:border-box; margin:0; padding:0;}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); -webkit-print-color-adjust:exact; print-color-adjust:exact;}
  .page{width:8.5in; height:11in; background:#fff; position:relative; padding:.68in .72in .78in .72in; overflow:hidden; page-break-after:always;}
  @page{size:letter; margin:0;}
  .eyebrow{display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid var(--ink); padding-bottom:8px; margin-bottom:24px;}
  .eyebrow .l{font-size:9.5px; letter-spacing:.14em; font-weight:700;}
  .eyebrow .r{font-size:9.5px; letter-spacing:.10em; color:var(--muted); font-weight:600;}
  .foot{position:absolute; left:.72in; right:.72in; bottom:.42in; display:flex; justify-content:space-between; font-size:8.5px; color:var(--muted); border-top:1px solid var(--grid); padding-top:8px;}
  .secnum{font-size:11px; font-weight:800; color:var(--blue); letter-spacing:.08em; margin-bottom:6px;}
  h1.pg{font-size:26px; line-height:1.12; font-weight:800; letter-spacing:-.01em; margin-bottom:10px;}
  .lede{font-size:12px; line-height:1.55; color:var(--ink2); max-width:6.4in; margin-bottom:20px;}
  .lede b{color:var(--ink);}
  p{font-size:10.5px; line-height:1.55; color:var(--ink2);}
  .src{font-size:8.5px; color:var(--muted); margin-top:8px;}
  .callout{border-left:3px solid var(--blue); background:#f5f8fd; padding:12px 16px; border-radius:0 6px 6px 0; margin-top:14px;}
  .callout .t{font-size:9px; font-weight:800; letter-spacing:.1em; color:var(--blue-550); margin-bottom:4px;}
  .gapblock{border:1.5px dashed #ecd39a; background:#fdf8ec; padding:14px 16px; border-radius:8px; margin-top:14px;}
  .gapblock .t{font-size:9px; font-weight:800; letter-spacing:.1em; color:#8a5a00; margin-bottom:4px;}
  .tiles{display:grid; gap:12px;} .tiles.c3{grid-template-columns:repeat(3,1fr);}
  /* v7.417 - a two-up tile row for the sentiment-score block. Deliberately a NEW class rather
     than defining .tiles.c2: c2 is referenced elsewhere in this template but has never had a
     rule, so those tiles have always stacked one-up. Defining c2 here would silently re-lay-out
     that other page inside a sentiment release, and a widened row is exactly the kind of change
     that overflows a fixed-height PDF page. Logged, not fixed. NOTE: this block is inside a
     template literal - no backticks in these comments, they terminate the string. */
  .tiles.s2{grid-template-columns:repeat(2,1fr);}
  .tile{border:1px solid var(--grid); border-radius:8px; padding:13px 14px; background:var(--surface);}
  .tile .k{font-size:9px; font-weight:700; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; margin-bottom:7px;}
  .tile .v{font-size:24px; font-weight:800; letter-spacing:-.02em; line-height:1;}
  .tile .v small{font-size:12px; font-weight:700; color:var(--ink2);}
  .tile .d{font-size:9.5px; color:var(--ink2); margin-top:7px; line-height:1.45;}
  .tile.accent{border-top:3px solid var(--blue);} .tile.bad .v{color:var(--critical);}
  .barrow{display:grid; align-items:center; gap:10px; margin-bottom:7px;}
  .barrow .lab{font-size:10px; font-weight:600; text-align:right;}
  .barrow .val{font-size:10px; font-weight:700; font-variant-numeric:tabular-nums;}
  .track{height:12px; background:#f1f0ec; border-radius:4px; position:relative;}
  .fill{height:100%; border-radius:4px; min-width:2px;}
  .figtitle{font-size:11px; font-weight:800; margin-bottom:3px;} .figsub{font-size:9.5px; color:var(--muted); margin-bottom:11px;}
  table.dt{width:100%; border-collapse:collapse; font-size:10px;}
  table.dt th{font-size:8.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); font-weight:700; text-align:left; border-bottom:1.5px solid var(--baseline); padding:6px 8px;}
  table.dt td{padding:6px 8px; border-bottom:1px solid var(--grid); color:var(--ink2); vertical-align:top;}
  table.dt td.n{font-variant-numeric:tabular-nums; text-align:right; color:var(--ink); font-weight:600;}
  table.dt td b{color:var(--ink);}
  .chip{display:inline-block; font-size:8.5px; font-weight:800; letter-spacing:.05em; border-radius:3px; padding:2px 7px;}
  .chip.climb{background:#e7effc; color:#184f95; border:1px solid #b7d3f6;}
  .legend{display:flex; gap:16px; font-size:9px; color:var(--ink2); margin-top:10px;}
  .legend .sw{display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:-1px;}
  .two{display:grid; grid-template-columns:1fr 1fr; gap:18px;}
  .panelbox{border:1px solid var(--grid); border-radius:8px; padding:14px 16px; background:var(--surface);}
  /* v7.414 — Local Search page: index donut + composition, star rating, finding cards */
  .lgrid{display:grid; grid-template-columns:1.62fr 1fr; gap:14px; align-items:stretch;}
  .lgrid>.panelbox{display:flex; flex-direction:column;}
  .lstats{display:grid; grid-template-rows:1fr 1fr; gap:12px;}
  .lstats .tile{display:flex; flex-direction:column; justify-content:center;}
  .lidx{display:flex; gap:15px; align-items:center; flex:1;}
  .lparts{flex:1; min-width:0;}
  .prow{display:grid; grid-template-columns:1.6in 1fr .26in; align-items:center; gap:8px; margin-bottom:8px;}
  .prow:last-child{margin-bottom:0;}
  .prow .pl{font-size:8.8px; font-weight:600; color:var(--ink2); line-height:1.2; white-space:nowrap;}
  .prow .pw{font-size:7.5px; font-weight:800; color:var(--muted); letter-spacing:.04em;}
  .prow .pv{font-size:9px; font-weight:800; text-align:right; font-variant-numeric:tabular-nums;}
  .ptrack{height:7px; background:#f1f0ec; border-radius:3.5px;}
  .pfill{height:100%; border-radius:3.5px; background:var(--blue); min-width:2px;}
  .ratrow{display:flex; gap:13px; align-items:center; margin-bottom:11px;}
  .ratbig{font-size:29px; font-weight:800; letter-spacing:-.02em; line-height:1;}
  .ratbig .ratmax{font-size:12px; font-weight:700; color:var(--muted); margin-left:2px;}
  .ratside{flex:1; min-width:0;}
  .ratnote{font-size:9.2px; color:var(--ink2); line-height:1.4; margin-top:4px;}
  .stars{position:relative; display:inline-block; white-space:nowrap; line-height:0; font-size:0;}
  .stars .sfill{position:absolute; left:0; top:0; overflow:hidden; white-space:nowrap;}
  .brow{display:grid; grid-template-columns:.92in 1fr .8in; align-items:center; gap:9px; margin-bottom:7px;}
  .brow .bl{font-size:9.2px; font-weight:600; text-align:right;}
  .brow .bv{font-size:9px; font-weight:700; font-variant-numeric:tabular-nums;}
  .btrack{height:11px; background:#f1f0ec; border-radius:4px;}
  .bfill{height:100%; border-radius:4px; min-width:2px;}
  .finds{display:grid; gap:11px;}
  .finds.c1{grid-template-columns:1fr;} .finds.c2{grid-template-columns:1fr 1fr;} .finds.c3{grid-template-columns:repeat(3,1fr);}
  .find{border:1px solid var(--grid); border-top:3px solid var(--blue); border-radius:8px; background:var(--surface); padding:11px 12px;}
  .find.red{border-top-color:var(--critical);}
  .find .fk{font-size:7.5px; font-weight:800; letter-spacing:.085em; color:var(--blue-550); margin-bottom:5px; line-height:1.3;}
  .find.red .fk{color:#9c2b2b;}
  .find p{font-size:9px; line-height:1.45;}
  .find .fsrc{font-size:7.5px; color:var(--muted); margin-top:7px; padding-top:5px; border-top:1px solid var(--grid);}
  .stepk{font-size:9px; font-weight:800; letter-spacing:.1em; margin-bottom:6px;}
  .endbrand{display:flex; justify-content:space-between; align-items:flex-end; border-top:2px solid var(--ink); padding-top:14px;}
  .rank{font-size:9px; font-weight:800; color:var(--muted); letter-spacing:.06em; line-height:1.2;}
  .rec{font-size:10.5px; font-weight:800; color:var(--ink); line-height:1.3; margin-bottom:4px;}
  table.prog{width:100%; border-collapse:collapse; table-layout:fixed;}
  table.prog th{font-size:8px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); font-weight:700; text-align:left; border-bottom:1.5px solid var(--baseline); padding:6px 7px;}
  table.prog td{padding:4px 7px; border-bottom:1px solid var(--grid); vertical-align:top;}
  table.prog tr.lane td{background:#f5f8fd; border-bottom:1px solid #dce7f6; padding:4px 7px;}
  table.prog tr.lane.run td{background:#f6f5f1; border-bottom:1px solid var(--grid);}
  .lanek{font-size:8px; font-weight:800; letter-spacing:.11em; color:var(--blue-550);} .lanek.g{color:#6b6a64;}
  .lanek span{color:var(--muted); font-weight:700; letter-spacing:.04em;}
  ul.tac{list-style:none; margin:0; padding:0;}
  ul.tac li{font-size:8.9px; line-height:1.26; color:var(--ink2); padding-left:9px; position:relative; margin-bottom:1.5px;}
  ul.tac li:before{content:"·"; position:absolute; left:1px; color:var(--muted); font-weight:800;}
  ul.tac li b{color:var(--ink); font-weight:700;}
  .gauge{margin-bottom:3px; display:flex; gap:2px;}
  .pip{height:7px; flex:1; border-radius:1.5px; background:#eceae4;}
  .pip.e{background:#c98f14;} .pip.i{background:var(--blue);}
  .glab{font-size:8.5px; font-weight:800; letter-spacing:.06em; color:var(--ink); line-height:1.2;}
  .gnum{font-size:8.5px; color:var(--muted); line-height:1.35; margin-top:2px; display:block; overflow-wrap:anywhere;}
  .proof{font-size:8.5px; color:var(--ink2); line-height:1.4;}
  .proof b{display:block; color:var(--ink); font-weight:700; font-size:8.5px;}
  .funnel{display:grid; gap:8px; margin-bottom:13px;} .funnel.c5{grid-template-columns:repeat(5,1fr);}
  .fstep{border:1px solid var(--grid); border-radius:8px; background:var(--surface); padding:10px 12px;}
  .fstep .fk{font-size:7.5px; font-weight:800; letter-spacing:.09em; color:var(--muted); margin-bottom:5px;}
  .fstep .fv{font-size:19px; font-weight:800; letter-spacing:-.02em; line-height:1;}
  .fstep .fd{font-size:8.2px; color:var(--ink2); margin-top:5px; line-height:1.4;}
  .fstep.on{border-top:3px solid var(--blue);} .fstep.cut{border-top:3px solid var(--good);}
  .anchor{display:inline-block; font-size:7.5px; font-weight:800; letter-spacing:.07em; background:#e7effc; color:#184f95; border:1px solid #b7d3f6; border-radius:3px; padding:1px 6px; vertical-align:1px;}
  .cover{background:#0e1a2b; color:#fff; display:flex; flex-direction:column;}
  .cbrand{font-size:11px; letter-spacing:.22em; font-weight:700; color:#7fa8dc;}
  .cmid{margin-top:2.1in;}
  .ck{font-size:13px; letter-spacing:.14em; color:#9fb3cc; font-weight:600; margin-bottom:14px;}
  .cname{font-size:44px; font-weight:800; letter-spacing:-.015em; line-height:1.05;}
  .csub{font-size:14px; color:#c4d2e4; margin-top:14px; line-height:1.5; max-width:5.6in;}
  .cfoot{margin-top:auto;}
  .cgrid{display:flex; gap:26px; border-top:1px solid rgba(255,255,255,.18); padding-top:16px;}
  .ckk{font-size:8.5px; letter-spacing:.1em; color:#8296ad; font-weight:700;}
  .cvv{font-size:10.5px; margin-top:3px;}
  .cnote{font-size:8.5px; color:#68809c; margin-top:14px;}
</style></head><body>${numbered.join('\n')}</body></html>`;
}

// content pages share this wrapper; cover manages its own chrome.
// __SEC__ is replaced with the sequential section number at assembly, so
// conditional sections never leave numbering holes.
function pageWrap(secTitle: string, right: string, inner: string): string {
  return `<div class="page">
    <div class="eyebrow"><span class="l">__EBL__</span><span class="r">${right}</span></div>
    <div class="secnum">__SEC__ · ${secTitle}</div>
    ${inner}
    __FOOT__
  </div>`;
}
