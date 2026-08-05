/**
 * lib/serp/featurePool.ts — v7.337 (QC audit B4-proper)
 *
 * ONE shared home for the SERP-feature pool/count builders (Const II.7). These
 * previously lived inline in components/brief/SerpFeaturesSection.tsx (v7.103 upload
 * mapping, v7.332 pools, v7.333 volume), while the Executive Summary + nav scores
 * read the STORED analysis.aioAvailable / aioAcquired / serpFeatureSummary columns —
 * frozen at analysis time and stale the moment scans run. Extracted verbatim (byte-
 * equal panel behavior, verified old-vs-new in the v7.337 harness) so the exec
 * roll-up + nav score can compute the SAME live numbers from the same inputs:
 * the scanned SERP rows persisted on analysis.serpApiSnapshot plus the uploaded
 * Semrush "SERP Features by Keyword" cells on the /keywords rows.
 *
 * Rule of evidence (v7.332, Const I.1/I.5): a SCANNED keyword's own live SerpAPI
 * detection always wins; an UNSCANNED keyword falls back to Semrush's uploaded
 * feature column. WHO is cited can only come from a live scan, so `cited` is null
 * (unknown, never a guessed negative) for anything never scanned.
 */

// ── Domain helpers (moved verbatim from SerpFeaturesSection) ───────────────────

export function normDomain(d: string): string {
  return (d ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase().trim();
}
export function domainsMatch(a: string, b: string): boolean {
  const na = normDomain(a), nb = normDomain(b);
  if (!na || !nb) return false;
  return na === nb || na.endsWith('.' + nb) || nb.endsWith('.' + na);
}

// ── Types ──────────────────────────────────────────────────────────────────────

// The /api/projects/[id]/keywords row fields these builders read.
export interface UploadKwRow { keyword: string; serpFeatures: string | null; source: string; searchVolume?: number | null; }

// The scanned-SERP row fields these builders read (structural subset of the panel's
// SerpKw — any richer scan row satisfies it).
export interface ScannedKwLike {
  keyword:           string;
  hasAIO?:           boolean;
  aioSources?:       Array<{ domain: string }>;
  paaQuestions?:     unknown[];
  paaClientCited?:   boolean;
  videoClientCited?: boolean;
  serpFeatures?:     string[];
}

// Semrush exports list features as a comma-separated cell, e.g.
// "AI overview, People also ask, Video, Featured snippet". Case-insensitive
// substring so minor Semrush label variations still map (v7.103).
export function semrushFeaturesToBuckets(raw: string): Set<string> {
  const out = new Set<string>();
  const f = raw.toLowerCase();
  if (f.includes('ai overview'))                          out.add('ai_overview');
  if (f.includes('people also ask'))                      out.add('paa');
  if (f.includes('video'))                                out.add('video_carousel'); // covers "Video", "Featured video", "Video carousel"
  if (f.includes('featured snippet'))                     out.add('featured_snippet');
  if (f.includes('knowledge panel'))                      out.add('knowledge_panel');
  if (f.includes('local pack'))                           out.add('local_pack');
  if (f.includes('shopping'))                             out.add('shopping');
  if (f.includes('image'))                                out.add('image_pack');
  return out;
}

export interface UploadFeatureCounts {
  rowsWithFeatureData: number;  // uploaded keywords carrying a SERP Features cell (deduped, unscanned only)
  aio:   number;
  paa:   number;
  video: number;
  more:  Record<string, number>; // featured_snippet / knowledge_panel / local_pack / shopping / image_pack
}

export function countUploadFeatures(rows: UploadKwRow[], scannedSet: Set<string>): UploadFeatureCounts {
  const more: Record<string, number> = { featured_snippet: 0, knowledge_panel: 0, local_pack: 0, shopping: 0, image_pack: 0 };
  let aio = 0, paa = 0, video = 0, withData = 0;
  // Dedupe by keyword — the same keyword can exist under client + competitor rows.
  const seen = new Set<string>();
  for (const r of rows) {
    const kw = (r.keyword ?? '').trim().toLowerCase();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    if (scannedSet.has(kw)) continue;            // scanned keywords already counted from live SERP data
    if (r.source === 'blocked') continue;
    if (!r.serpFeatures) continue;
    const buckets = semrushFeaturesToBuckets(r.serpFeatures);
    if (buckets.size === 0) continue;
    withData++;
    if (buckets.has('ai_overview'))   aio++;
    if (buckets.has('paa'))           paa++;
    if (buckets.has('video_carousel')) video++;
    for (const k of Object.keys(more)) if (buckets.has(k)) more[k]++;
  }
  return { rowsWithFeatureData: withData, aio, paa, video, more };
}

// v7.332 (Wayne: "let's just use the semrush serp features as a source of truth"):
// ONE pool per feature so the list and the count are always the same footprint.
export interface FeaturePoolRow {
  keyword:     string;
  hasFeature:  boolean;
  fromSemrush: boolean;        // true = classified from the Semrush upload column (unscanned); false = live scan detection
  isScanned:   boolean;
  cited:       boolean | null; // null = never scanned, citation status unknown
  volume:      number;         // v7.333: real monthly search volume, for the card download
  // v7.408: WHICH SERP provider produced this row's scan. Only meaningful when
  // isScanned — undefined for upload-only rows. A scanned row whose stored
  // scannedBy is absent predates v7.408, when SerpAPI was the only provider
  // that ever ran, so the reader resolves absent ⇒ 'serpapi' as fact (Const I.1).
  scannedBy?:  'serpapi' | 'dataforseo';
}

export function buildFeaturePool<K extends { keyword: string; scannedBy?: 'serpapi' | 'dataforseo' }>(
  uploadRows:     UploadKwRow[],
  scannedKws:     K[],
  bucketKey:      string,
  scanHasFeature: (kw: K) => boolean,
  citedFn:        (kw: K) => boolean,
): FeaturePoolRow[] {
  const scannedMap = new Map(scannedKws.map(k => [(k.keyword ?? '').trim().toLowerCase(), k]));
  const seen = new Set<string>();
  const out: FeaturePoolRow[] = [];

  for (const r of uploadRows) {
    const kwLow = (r.keyword ?? '').trim().toLowerCase();
    if (!kwLow || seen.has(kwLow) || r.source === 'blocked') continue;
    seen.add(kwLow);
    const scannedKw = scannedMap.get(kwLow);
    const hasFeature = scannedKw
      ? scanHasFeature(scannedKw)
      : (r.serpFeatures ? semrushFeaturesToBuckets(r.serpFeatures).has(bucketKey) : false);
    out.push({
      keyword:     r.keyword,
      hasFeature,
      fromSemrush: !scannedKw,
      isScanned:   !!scannedKw,
      cited:       scannedKw ? citedFn(scannedKw) : null,
      volume:      Number(r.searchVolume) || 0,
      scannedBy:   scannedKw ? (scannedKw.scannedBy ?? 'serpapi') : undefined,
    });
  }
  // Scanned keywords with no matching upload row (e.g. an ad-hoc single-keyword
  // scan outside the uploaded footprint) — no Semrush data exists for them, so
  // fall back to the live scan's own detection; still real, never guessed.
  // No uploaded row also means no stored search volume for these — 0, same
  // "unknown numeric" convention topicExport/rankBucketExport already use.
  for (const k of scannedKws) {
    const kwLow = (k.keyword ?? '').trim().toLowerCase();
    if (!kwLow || seen.has(kwLow)) continue;
    seen.add(kwLow);
    out.push({ keyword: k.keyword, hasFeature: scanHasFeature(k), fromSemrush: false, isScanned: true, cited: citedFn(k), volume: 0, scannedBy: k.scannedBy ?? 'serpapi' });
  }
  return out;
}

// ── v7.337: the LIVE AIO / PAA / Video roll-up ─────────────────────────────────
// Exactly the aggregate math SerpFeaturesSection has computed since v7.103/121/332:
//   available = live scanned detections + Semrush-flagged UNSCANNED upload rows;
//   acquired  = live scanned citations only (Semrush has no citation data — I.5).
// Consumed by the panel itself, the Executive Summary roll-up strip, and the nav
// scores — one implementation, three readers (Const II.7).
export interface SerpFeatureRollup {
  aioAvail: number; aioAcq: number; aioRate: number;       // rates are Math.round percent
  paaAvail: number; paaAcq: number; paaRate: number;
  videoAvail: number; videoAcq: number; videoRate: number;
  totalAvail: number; totalAcq: number;                    // AIO + PAA + Video combined
}

export function computeSerpFeatureRollup(
  uploadRows:   UploadKwRow[],
  scannedKws:   ScannedKwLike[],
  clientDomain: string,
): SerpFeatureRollup {
  const scannedSet = new Set<string>();
  for (const k of scannedKws) {
    const kw = (k.keyword ?? '').trim().toLowerCase();
    if (kw) scannedSet.add(kw);
  }
  const uploadFeat = countUploadFeatures(uploadRows, scannedSet);

  const aioKws     = scannedKws.filter(k => !!k.hasAIO);
  const aioAvail   = aioKws.length + uploadFeat.aio;
  const aioAcq     = aioKws.filter(kw => (kw.aioSources ?? []).some(s => domainsMatch(s.domain, clientDomain))).length;

  const paaAvail   = scannedKws.filter(k => (k.paaQuestions?.length ?? 0) > 0).length + uploadFeat.paa;
  const paaAcq     = scannedKws.filter(k => !!k.paaClientCited).length;

  const videoAvail = scannedKws.filter(k => !!k.serpFeatures?.includes('video_carousel')).length + uploadFeat.video;
  const videoAcq   = scannedKws.filter(k => !!k.videoClientCited).length;

  return {
    aioAvail,   aioAcq,   aioRate:   aioAvail   > 0 ? Math.round((aioAcq   / aioAvail)   * 100) : 0,
    paaAvail,   paaAcq,   paaRate:   paaAvail   > 0 ? Math.round((paaAcq   / paaAvail)   * 100) : 0,
    videoAvail, videoAcq, videoRate: videoAvail > 0 ? Math.round((videoAcq / videoAvail) * 100) : 0,
    totalAvail: aioAvail + paaAvail + videoAvail,
    totalAcq:   aioAcq   + paaAcq   + videoAcq,
  };
}
