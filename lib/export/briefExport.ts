/**
 * briefExport (v7.364) — "Push to Brief Agent" bundle, now EXCEL per article.
 *
 * Turns the picked Content Plan into a downloadable bundle: ONE outer zip → one
 * zip per audience segment → one Excel (.xlsx) brief per article (was .docx
 * through v7.363). Segment membership reuses the ONE topic→segment attribution
 * the Journey panel and the v7.353 segment lens share (Const II.7); Shared-bucket
 * articles appear in EVERY segment's zip (Wayne 2026-07-06). Nothing is summed
 * across bundles (Const I.3).
 *
 * Each workbook mirrors Wayne's "Briefing Agent Data Population" template exactly:
 * two tabs — "Content Brief (Jasper Grid)" (17 cols, the full CA/Jasper grid) and
 * "Required Orbit Outputs" (13 cols, the Orbit-only subset) — with the same
 * row-2 headers, row-3 source labels and row-4 descriptions, and ONE data row
 * (row 5) for this article. Orbit-sourced cells are filled from real data; the
 * CA-manual and Jasper-created cells are left blank for the downstream workflow.
 *
 * DEFENSIBILITY (Const I.1): every value written is a real source row — Semrush
 * volumes, real Semrush/SerpAPI positions, the top organic + AI-Overview rows for
 * the primary keyword, real People-Also-Ask questions, and the competitor page's
 * real fetched <h1> (supplied by /api/projects/[id]/brief-enrich). Missing data is
 * left blank (honest gap, Const I.5) — never fabricated. The "10X content
 * description" column is intentionally left to the CA. Primary keyword = the
 * highest-volume target keyword (Const III.8). Suggested titles/outlines are not
 * part of this template.
 *
 * Runs in the browser (dynamic-imported from ContentPlanSection so the xlsx + jszip
 * payload stays out of the initial bundle) AND under Node for the regression
 * harness — hence base64 workbook strings + jszip uint8array, identical in both.
 */

import JSZip from 'jszip';
import type { ContentTopic } from '@/lib/journey/contentPlan';

// Minimal structural slice of a canonical cluster topic (ThemeClustersPanel
// `Topic`) — carries the full keyword rows the ContentTopic no longer holds.
export interface BriefCanonTopic {
  id:         string;
  umbrella:   string;
  parentName: string;
  product:    string;
  stage:      string;
  keywords:   Array<{ keyword: string; searchVolume: number; position: number | null; isGap: boolean; competitor?: string | null }>;
}

// One competitor page as resolved by the enrichment route.
export interface BriefEnrichComp { name: string; url: string; title: string; h1: string; inAIO: boolean; }
// SERP-derived groups per article (the three the browser can't build).
export interface BriefEnrichTopic {
  topRanked:    BriefEnrichComp[];
  direct:       BriefEnrichComp[];
  paaPrimary:   string[];
  paaSecondary: string[];
}

// Segment profile carried from readSegments() so the client fills the audience +
// GEO-prompt columns without a second source of truth.
export interface BriefSegment { id: string; name: string; tagline?: string; who?: string; geoPrompts?: string[]; }

export const SHARED_SEG_BUCKET = 'shared';   // mirrors JourneySection.SHARED_BUCKET (stable since v7.170)

export function slugify(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}

function n(v: number): string { return (v ?? 0).toLocaleString('en-US'); }

// Highest-volume keyword = the primary (Const III.8). Shared by the client (to
// build the enrichment request) and the workbook builder, so both agree.
export function pickPrimary(canon: BriefCanonTopic | undefined, t: ContentTopic): { keyword: string; searchVolume: number } | null {
  const kws = (canon?.keywords?.length ? canon.keywords : (t.brief.keywords ?? []).map((k) => ({ keyword: k.keyword, searchVolume: k.searchVolume })));
  if (!kws.length) return null;
  let best = kws[0];
  for (const k of kws) if ((k.searchVolume ?? 0) > (best.searchVolume ?? 0)) best = k;
  return { keyword: best.keyword, searchVolume: best.searchVolume ?? 0 };
}

// ─── Template constants (verbatim from Wayne's "Briefing Agent Data Population") ──

const SHEET_JASPER = 'Content Brief (Jasper Grid)';
const SHEET_ORBIT  = 'Required Orbit Outputs';
// Reproduced verbatim, including the template's own spelling ("Decription", "yes or now").
const COMP_DESC = 'Name, URL, title, H1, Decription of 10X content (if applicable), is the competitor in AI overviews yes or now';
const AUD_DESC  = "Audience Segement based on Orbit's search data analysis";

const JASPER_HEADERS = [
  'Project Context and Notes',
  'Top Ranked Competitor 1', 'Top Ranked Competitor 2', 'Top Ranked Competitor 3',
  'Direct Competitor 1', 'Direct Competitor 2', 'Direct Competitor 3',
  'Primary Keyword', 'PAA (From primary kw)', 'Secondary Keywords', 'PAA (From secondary kws)',
  'Target GEO Prompts', 'Internal Linking (new and existing)', 'Pre-Sale Audience (ORBIT)',
  'Audience Overview', 'Visual Content Recommendation', 'Meta Elements',
];
const JASPER_SOURCES = [
  'CA Manual Entry',
  'Pull from Orbit', 'Pull from Orbit', 'Pull from Orbit',
  'Pull from Orbit', 'Pull from Orbit', 'Pull from Orbit',
  'Pull from Orbit', 'Pull from Orbit', 'Pull from Orbit', 'Pull from Orbit',
  'Pull from Orbit', 'Pull from Orbit', 'Pull from Orbit',
  'Pull from Jasper when using Briefing Agent', 'Instruct Jasper to create', 'Instruct Jasper to create',
];
const JASPER_DESCS = [
  'CA to enter if needed',
  COMP_DESC, COMP_DESC, COMP_DESC, COMP_DESC, COMP_DESC, COMP_DESC,
  'Primary Keyword and MSV', 'List all that align with Primary Keyword',
  'Secondary Keywords and MSVs', 'List all that align with Secondary Keywords',
  'List prompts', 'Recommended links', AUD_DESC,
  'CA will run audience information from Orbit through Audience Studio to enhance it before adding it to Jasper iQ',
  '', 'New or existing URL, meta title, meta description',
];

const ORBIT_HEADERS = [
  'Top Ranked Competitor 1', 'Top Ranked Competitor 2', 'Top Ranked Competitor 3',
  'Direct Competitor 1', 'Direct Competitor 2', 'Direct Competitor 3',
  'Primary Keyword', 'PAA (From primary kw)', 'Secondary Keywords', 'PAA (From secondary kws)',
  'Target GEO Prompts', 'Internal Linking (new and existing)', 'Pre-Sale Audience (ORBIT)',
];
const ORBIT_SOURCES = ORBIT_HEADERS.map(() => 'Pull from Orbit');
const ORBIT_DESCS = [
  COMP_DESC, COMP_DESC, COMP_DESC, COMP_DESC, COMP_DESC, COMP_DESC,
  'Primary Keyword and MSV', 'List all that align with Primary Keyword',
  'Secondary Keywords and MSVs', 'List all that align with Secondary Keywords',
  'List prompts', 'Recommended links', AUD_DESC,
];

// ─── Cell builders (real data only; blank when absent) ────────────────────────

function compCell(c: BriefEnrichComp | undefined): string {
  if (!c || !c.name) return '';
  return [
    `Name: ${c.name}`,
    `URL: ${c.url || ''}`,
    `Title: ${c.title || ''}`,
    `H1: ${c.h1 || ''}`,
    '10X content: ',                                   // left for the CA (Wayne 2026-07-11)
    `In AI Overviews: ${c.inAIO ? 'Yes' : 'No'}`,
  ].join('\n');
}

function primaryCell(p: { keyword: string; searchVolume: number } | null): string {
  return p ? `${p.keyword} (MSV: ${n(p.searchVolume)}/mo)` : '';
}

function secondaryCell(canon: BriefCanonTopic | undefined, t: ContentTopic, primaryKw: string): string {
  const rows = (canon?.keywords?.length ? canon.keywords : (t.brief.keywords ?? []).map((k) => ({ keyword: k.keyword, searchVolume: k.searchVolume })))
    .filter((k) => k.keyword.toLowerCase() !== primaryKw.toLowerCase())
    .slice()
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
  return rows.map((k) => `${k.keyword} — ${n(k.searchVolume)}/mo`).join('\n');
}

function linksCell(t: ContentTopic): string {
  return (t.brief.links ?? []).map((l) => `${l.dir === 'from' ? 'Link from' : 'Link to'}: ${l.name} — ${l.why}`).join('\n');
}

function audienceCell(seg: BriefSegment | undefined, shared: boolean, sharedNames: string[]): string {
  if (shared) return `Shared across segments: ${sharedNames.join(', ')}`;
  if (!seg) return '';
  const bits = [seg.name];
  if (seg.tagline) bits.push(seg.tagline);
  if (seg.who) bits.push(seg.who);
  return bits.filter(Boolean).join('\n');
}

function geoPromptsCell(seg: BriefSegment | undefined, shared: boolean, allSegs: BriefSegment[]): string {
  const src = shared ? allSegs : (seg ? [seg] : []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of src) for (const p of (s.geoPrompts ?? [])) { const v = String(p ?? '').trim(); if (v && !seen.has(v)) { seen.add(v); out.push(v); } }
  return out.join('\n');
}

/** Build ONE article brief as an .xlsx workbook, returned base64. */
export async function buildBriefWorkbook(
  XLSX: typeof import('xlsx'),
  t: ContentTopic,
  canon: BriefCanonTopic | undefined,
  enrich: BriefEnrichTopic | undefined,
  seg: BriefSegment | undefined,
  shared: boolean,
  allSegs: BriefSegment[],
): Promise<string> {
  const primary = pickPrimary(canon, t);
  const top = enrich?.topRanked ?? [];
  const dir = enrich?.direct ?? [];
  const comp = (arr: BriefEnrichComp[], i: number) => compCell(arr[i]);

  const sharedNames = allSegs.map((s) => s.name);
  const audience = audienceCell(seg, shared, sharedNames);
  const geo      = geoPromptsCell(seg, shared, allSegs);
  const secondary = secondaryCell(canon, t, primary ? primary.keyword : '');
  const paaP = (enrich?.paaPrimary ?? []).join('\n');
  const paaS = (enrich?.paaSecondary ?? []).join('\n');
  const links = linksCell(t);

  // Jasper Grid data row (17 cols, A..Q). A = CA manual (blank); O/P/Q = Jasper (blank).
  const jasperData = [
    '',
    comp(top, 0), comp(top, 1), comp(top, 2),
    comp(dir, 0), comp(dir, 1), comp(dir, 2),
    primaryCell(primary), paaP, secondary, paaS,
    geo, links, audience,
    '', '', '',
  ];
  // Orbit Outputs data row (13 cols, A..M) — the Pull-from-Orbit subset.
  const orbitData = [
    comp(top, 0), comp(top, 1), comp(top, 2),
    comp(dir, 0), comp(dir, 1), comp(dir, 2),
    primaryCell(primary), paaP, secondary, paaS,
    geo, links, audience,
  ];

  const wb = XLSX.utils.book_new();

  // Row 1 blank, then headers/source/desc on rows 2-4, data on row 5 — exactly the template shape.
  const jasperAoa = [[], JASPER_HEADERS, JASPER_SOURCES, JASPER_DESCS, jasperData];
  const wsJ = XLSX.utils.aoa_to_sheet(jasperAoa);
  wsJ['!cols'] = JASPER_HEADERS.map(() => ({ wch: 34 }));
  XLSX.utils.book_append_sheet(wb, wsJ, SHEET_JASPER);

  const orbitAoa = [[], ORBIT_HEADERS, ORBIT_SOURCES, ORBIT_DESCS, orbitData];
  const wsO = XLSX.utils.aoa_to_sheet(orbitAoa);
  wsO['!cols'] = ORBIT_HEADERS.map(() => ({ wch: 34 }));
  XLSX.utils.book_append_sheet(wb, wsO, SHEET_ORBIT);

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
}

// ─── Bundle assembly ──────────────────────────────────────────────────────────

export interface BriefBundleResult {
  data: Uint8Array;          // the outer zip bytes
  filename: string;
  segmentZips: number;
  docs: number;              // total workbooks written (shared counted once per segment zip)
}

/**
 * Assemble the full bundle. Structure with segments:
 *   <client>-content-briefs.zip
 *     segment-a-<name>.zip   → NN-<topic>.xlsx per article (exclusive + Shared)
 *     segment-b-<name>.zip   → …
 * Without segments (honest fallback): the workbooks sit at the outer zip root.
 */
export async function buildBriefBundle(opts: {
  clientName: string;
  topics: ContentTopic[];
  canonById: Map<string, BriefCanonTopic>;
  enrichById: Map<string, BriefEnrichTopic>;
  topicBucket: Map<string, string>;     // topic.id → segment.id | 'shared'
  segments: BriefSegment[];
  onProgress?: (done: number, total: number) => void;
}): Promise<BriefBundleResult> {
  const { clientName, topics, canonById, enrichById, topicBucket, segments, onProgress } = opts;
  const XLSX = await import('xlsx');
  const outer = new JSZip();
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const segById = new Map(segments.map((s) => [s.id, s]));

  // Which workbooks go where. Shared topics ride into EVERY segment zip (Wayne 2026-07-06).
  const groups: Array<{ zipName: string | null; label: string; topics: ContentTopic[] }> = [];
  if (segments.length && topicBucket.size) {
    segments.forEach((seg, i) => {
      const segTopics = topics.filter((t) => {
        const b = topicBucket.get(t.id);
        return b === seg.id || b === SHARED_SEG_BUCKET;
      });
      if (segTopics.length) groups.push({ zipName: `segment-${letters[i % 26]}-${slugify(seg.name)}.zip`, label: seg.name, topics: segTopics });
    });
  }
  if (!groups.length) groups.push({ zipName: null, label: 'All segments', topics });

  const total = groups.reduce((s, g) => s + g.topics.length, 0);
  let done = 0;
  let docs = 0;
  if (onProgress) onProgress(0, total);

  for (const g of groups) {
    const target = g.zipName ? new JSZip() : outer;
    const sorted = g.topics.slice().sort((a, b) => b.totalVol - a.totalVol);
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const bucket = topicBucket.get(t.id);
      const shared = bucket === SHARED_SEG_BUCKET && segments.length > 0;
      const seg = shared ? undefined : segById.get(bucket ?? '');
      const b64 = await buildBriefWorkbook(XLSX, t, canonById.get(t.id), enrichById.get(t.id), seg, shared, segments);
      target.file(`${String(i + 1).padStart(2, '0')}-${slugify(t.name)}.xlsx`, b64, { base64: true });
      docs++; done++;
      if (onProgress) onProgress(done, total);
    }
    if (g.zipName) {
      const innerBytes = await (target as JSZip).generateAsync({ type: 'uint8array' });
      outer.file(g.zipName, innerBytes);
    }
  }

  const data = await outer.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { data, filename: `${slugify(clientName)}-content-briefs.zip`, segmentZips: groups.filter((g) => g.zipName).length, docs };
}

/** Browser download helper. */
export function downloadBundle(res: BriefBundleResult): void {
  const ab = new ArrayBuffer(res.data.length);
  new Uint8Array(ab).set(res.data);
  const blob = new Blob([ab], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = res.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
