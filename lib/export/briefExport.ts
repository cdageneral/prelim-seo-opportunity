/**
 * briefExport (v7.354) — "Push to Brief Agent" bundle.
 *
 * Turns the picked Content Plan into a downloadable bundle: ONE outer zip →
 * one zip per audience segment → one Word (.docx) brief per article. Segment
 * membership reuses the ONE topic→segment attribution the Journey panel and
 * the v7.353 segment lens share (Const II.7); Shared-bucket articles appear in
 * EVERY segment's zip (Wayne 2026-07-06), so no segment bundle misses content
 * relevant to it. Nothing is summed across bundles (Const I.3).
 *
 * DEFENSIBILITY (Const I.1): every figure written into a doc is the exact
 * value from the canonical pool — real Semrush volumes and positions, real
 * competitor gap attributions. Suggested title / outline / PAA are the same
 * editorial scaffolding the drawer shows, and are labeled "suggested".
 * Distance and priority are the same derived ordinals the panel renders,
 * carried with their labels — never presented as measured data.
 *
 * Runs in the browser (dynamic-imported from ContentPlanSection so the docx +
 * jszip payload stays out of the initial bundle) AND under Node for the
 * regression harness — hence Packer.toBase64String + jszip uint8array, which
 * work identically in both.
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import JSZip from 'jszip';
import type { ContentTopic } from '@/lib/journey/contentPlan';

// Minimal structural slice of a canonical cluster topic (ThemeClustersPanel
// `Topic`) — carries the stored architecture + full keyword rows the
// ContentTopic no longer holds.
export interface BriefCanonTopic {
  id:         string;
  umbrella:   string;
  parentName: string;
  product:    string;
  stage:      string;
  keywords:   Array<{ keyword: string; searchVolume: number; position: number | null; isGap: boolean; competitor?: string | null }>;
}

export interface BriefSegment { id: string; name: string; }

export const SHARED_SEG_BUCKET = 'shared';   // mirrors JourneySection.SHARED_BUCKET (value is stable since v7.170)

export function slugify(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
}

function n(v: number): string { return (v ?? 0).toLocaleString('en-US'); }

const PRI_LABEL: Record<string, string> = { P0: 'P0 · Do first', P1: 'P1 · Next', P2: 'P2 · Later' };
const LANE_LABEL: Record<string, string> = { product: 'Product journey', 'pre-product': 'Pre-product journey' };

function cap(s: string): string { const t = String(s ?? ''); return t.charAt(0).toUpperCase() + t.slice(1); }

// ─── docx building blocks ─────────────────────────────────────────────────────

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({ heading: level, children: [new TextRun({ text })] });
}
function kv(label: string, value: string): Paragraph {
  return new Paragraph({ spacing: { after: 60 }, children: [
    new TextRun({ text: label + ':  ', bold: true }),
    new TextRun({ text: value }),
  ] });
}
function para(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text })] });
}
function bullet(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text })] });
}
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' } as const;
function cell(text: string, bold = false): TableCell {
  return new TableCell({
    borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
  });
}

/** Build ONE article brief as a docx Document. Everything rendered comes from the topic's own real data. */
export function buildBriefDoc(t: ContentTopic, canon: BriefCanonTopic | undefined, segmentLabel: string, shared: boolean, clientName: string): Document {
  const children: Array<Paragraph | Table> = [];

  children.push(h(t.name, HeadingLevel.HEADING_1));
  children.push(para(`Content brief · ${clientName} · generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`));

  // ── Audience ──
  children.push(h('Audience segment', HeadingLevel.HEADING_2));
  children.push(kv('Segment', shared ? `${segmentLabel} (shared — this topic is relevant to multiple segments)` : segmentLabel));

  // ── Architecture / where it sits ──
  children.push(h('Where this sits', HeadingLevel.HEADING_2));
  if (canon) {
    children.push(kv('Product category', canon.umbrella || canon.parentName));
    children.push(kv('Parent theme', canon.parentName));
    children.push(kv('Page topic', canon.product));
    const path = [canon.umbrella, canon.parentName !== canon.umbrella ? canon.parentName : '', canon.product]
      .filter(Boolean).join(' › ');
    children.push(kv('Category path', path));
  } else {
    children.push(para('Category architecture unavailable for this topic (no stored taxonomy on this analysis).'));
  }
  children.push(kv('Journey', LANE_LABEL[t.lane] ?? t.lane));
  children.push(kv('Funnel stage', cap(t.stage)));
  children.push(kv('Distance to conversion', `${t.distanceLabel} (${t.distance} of 4, 1 = closest to conversion)`));
  children.push(kv('Priority', PRI_LABEL[t.priority] ?? t.priority));
  const flags: string[] = [];
  if (t.quickWin) flags.push('Quick win');
  if (t.refresh) flags.push('Refresh candidate');
  if (flags.length) children.push(kv('Flags', flags.join(' · ')));

  // ── Action ──
  children.push(h('Action', HeadingLevel.HEADING_2));
  children.push(kv('Action', t.state === 'existing'
    ? (t.refresh ? 'Optimise / refresh existing page' : 'Optimise existing page')
    : (t.state === 'competitor' ? 'Build net-new (competitor currently holds this demand)' : 'Build net-new')));
  if (t.url) children.push(kv('Existing page', t.url));
  else if (t.state === 'existing') children.push(kv('Existing page', 'Ranks, but no URL mapped in the dataset yet — run the Page Map scan to link it'));
  else children.push(kv('Existing page', 'None — net-new build'));
  children.push(kv('Your best rank', t.bestPosition != null ? `#${t.bestPosition}` : 'Not ranking yet'));
  children.push(kv('Monthly search volume (topic total)', `${n(t.totalVol)}/mo`));
  children.push(kv('Volume you already capture', `${n(t.clientVol)}/mo (${t.clientCovPct}% of the topic)`));
  children.push(kv('Keywords in topic', String(t.kwCount)));
  children.push(kv('Audience prompts touching this topic', String(t.promptCount)));

  // ── Competitive insight ──
  children.push(h('Competitive insight', HeadingLevel.HEADING_2));
  children.push(para(t.competitor
    ? `${t.competitor.replace(/^www\./, '')} ranks for this topic and you don't — beat their depth to capture it.`
    : 'Open field — no tracked competitor ranks here yet. First-mover advantage.'));

  // ── Suggested brief ──
  children.push(h('Suggested article title', HeadingLevel.HEADING_2));
  children.push(para(t.brief.title));

  children.push(h('Outline (suggested H2s)', HeadingLevel.HEADING_2));
  t.brief.outline.forEach((o: string) => children.push(bullet(o)));

  children.push(h('Answer these (People Also Ask)', HeadingLevel.HEADING_2));
  t.brief.faq.forEach((q: string) => children.push(bullet(q)));

  // ── Target keywords (full canonical set; real Semrush volumes + positions) ──
  children.push(h('Target keywords', HeadingLevel.HEADING_2));
  const kws = (canon?.keywords?.length ? canon.keywords : t.brief.keywords.map((k) => ({
    keyword: k.keyword, searchVolume: k.searchVolume,
    position: null as number | null, isGap: k.state === 'competitor', competitor: null as string | null,
  }))).slice().sort((a, b) => b.searchVolume - a.searchVolume);
  const rows: TableRow[] = [new TableRow({ children: [
    cell('Keyword', true), cell('Volume/mo', true), cell('Your position', true), cell('Competitor ranking', true),
  ] })];
  kws.forEach((k) => rows.push(new TableRow({ children: [
    cell(k.keyword),
    cell(n(k.searchVolume)),
    cell(k.position != null ? `#${k.position}` : '—'),
    cell(k.isGap ? ((k.competitor ?? '').replace(/^www\./, '') || 'Yes — competitor gap') : '—'),
  ] })));
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));

  // ── Internal links ──
  children.push(h('Internal links', HeadingLevel.HEADING_2));
  if (t.brief.links.length) t.brief.links.forEach((l) => children.push(bullet(`${l.dir === 'from' ? 'Link from' : 'Link to'}: ${l.name} — ${l.why}`)));
  else children.push(para('No sibling topics under this theme yet.'));

  // ── SERP targets ──
  children.push(h('SERP feature targets', HeadingLevel.HEADING_2));
  children.push(para(t.brief.serp.join(' · ')));

  return new Document({
    creator: 'OrbitIQ',
    title: t.name,
    description: `Content brief for ${clientName}`,
    sections: [{ children }],
  });
}

// ─── Bundle assembly ──────────────────────────────────────────────────────────

export interface BriefBundleResult {
  data: Uint8Array;          // the outer zip bytes
  filename: string;
  segmentZips: number;
  docs: number;              // total docs written (shared docs counted once per segment zip)
}

/**
 * Assemble the full bundle. Structure with segments:
 *   <client>-content-briefs.zip
 *     segment-a-<name>.zip   → NN-<topic>.docx per article (exclusive + Shared)
 *     segment-b-<name>.zip   → …
 * Without segments (honest fallback): the docs sit at the outer zip root.
 */
export async function buildBriefBundle(opts: {
  clientName: string;
  topics: ContentTopic[];
  canonById: Map<string, BriefCanonTopic>;
  topicBucket: Map<string, string>;     // topic.id → segment.id | 'shared'
  segments: BriefSegment[];
  onProgress?: (done: number, total: number) => void;
}): Promise<BriefBundleResult> {
  const { clientName, topics, canonById, topicBucket, segments, onProgress } = opts;
  const outer = new JSZip();
  const letters = 'abcdefghijklmnopqrstuvwxyz';

  // Which docs go where. Shared topics ride into EVERY segment zip (Wayne 2026-07-06).
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
      const shared = topicBucket.get(t.id) === SHARED_SEG_BUCKET && segments.length > 0;
      const doc = buildBriefDoc(t, canonById.get(t.id), g.label, shared, clientName);
      const b64 = await Packer.toBase64String(doc);
      target.file(`${String(i + 1).padStart(2, '0')}-${slugify(t.name)}.docx`, b64, { base64: true });
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
