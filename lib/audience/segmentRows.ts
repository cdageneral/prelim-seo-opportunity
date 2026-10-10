/**
 * Audience segment — the ONE flattened view of a segment (v7.552).
 *
 * v7.352 introduced `buildSegmentRows` inside the Audience panel so the CSV
 * download and the clipboard copy could never drift from each other or from
 * the UI (Const II.7 in miniature). v7.552 adds a third reader — the persona
 * profile image prompt, built on the SERVER — so the pure helpers move here,
 * where both the panel and an API route can import them without dragging a
 * 'use client' component into a lambda. The panel re-exports every name, so
 * every existing import (and the retained suite) keeps working unchanged.
 *
 * Pure functions only — no React, no DOM.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudienceTouchpoint {
  stage: string;       // "Stage 1 (LLM)"
  description: string;
}

export interface AudienceSegment {
  id: string;
  name: string;              // "The Crisis Converter"
  tagline: string;           // "I can't afford my mortgage renewal. I need options — fast."
  volumePct: number;         // 42
  yoyGrowth?: string;        // "+32% YoY"
  personaImageUrl?: string;  // v7.149: AI-generated photoreal portrait (Vercel Blob URL)

  whoTheyAre: {
    demographics: string;    // Age range, employment status, financial profile
    trigger: string;         // What drives them to search
    influencerRole?: string; // Spouse / adult child / advisor role
  };

  preLLMPrompts: string[];   // Life-problem prompts before they think of the product
  productPrompts: string[];  // Product/solution-stage searches

  touchpoints: AudienceTouchpoint[];

  messagingAndTone: string;
  creativeDirection: string;
  channelApproach: string;
}

/** "Segment A" … "Segment D" — the label the panel shows for the i-th segment. */
export const SEGMENT_LABELS = ['Segment A', 'Segment B', 'Segment C', 'Segment D'];
export function segmentLabelAt(index: number): string {
  return SEGMENT_LABELS[index] ?? `Segment ${index + 1}`;
}

// ── Rows ──────────────────────────────────────────────────────────────────────
// Every field the panel renders for a segment is flattened into ordered
// [field, value] rows — the single source every export reads.

export function buildSegmentRows(segment: AudienceSegment, label: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Segment', label],
    ['Name', segment.name ?? ''],
    ['Tagline', segment.tagline ?? ''],
    ['Share of Volume (%)', String(segment.volumePct ?? '')],
  ];
  if (segment.yoyGrowth) rows.push(['YoY Growth', segment.yoyGrowth]);
  rows.push(['Demographics', segment.whoTheyAre?.demographics ?? '']);
  rows.push(['Trigger', segment.whoTheyAre?.trigger ?? '']);
  if (segment.whoTheyAre?.influencerRole) rows.push(['Influencer / Gatekeeper Role', segment.whoTheyAre.influencerRole]);
  (segment.preLLMPrompts ?? []).forEach((p, i) => rows.push([`Pre-Product LLM Prompt ${i + 1}`, p]));
  (segment.productPrompts ?? []).forEach((p, i) => rows.push([`Product-Stage Search Prompt ${i + 1}`, p]));
  (segment.touchpoints ?? []).forEach((tp, i) => rows.push([`Touchpoint ${i + 1} — ${tp.stage}`, tp.description]));
  rows.push(['Messaging & Tone', segment.messagingAndTone ?? '']);
  rows.push(['Creative & Imagery Direction', segment.creativeDirection ?? '']);
  rows.push(['Channel Approach', segment.channelApproach ?? '']);
  return rows;
}

// RFC-4180 escaping: quote any field carrying a comma, quote, or newline; double
// embedded quotes. Values pass through otherwise untouched (Const I.1 — export
// exactly what the panel shows, no reformatting).
export function csvEscape(v: string): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function segmentToCsv(segment: AudienceSegment, label: string): string {
  const lines = ['Field,Value'];
  buildSegmentRows(segment, label).forEach(([f, v]) => lines.push(`${csvEscape(f)},${csvEscape(v)}`));
  return lines.join('\r\n');
}

export function segmentToClipboardText(segment: AudienceSegment, label: string): string {
  return buildSegmentRows(segment, label).map(([f, v]) => `${f}: ${v}`).join('\n');
}

/** "segment-a-the-loyal-retail-cardholder" — shared by every per-segment filename. */
export function segmentSlug(segment: AudienceSegment, label: string): string {
  return `${label} ${segment.name ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function segmentCsvFilename(segment: AudienceSegment, label: string): string {
  return `audience-${segmentSlug(segment, label) || 'segment'}.csv`;
}

/** v7.552: the persona profile image download name. */
export function personaProfileFilename(segment: AudienceSegment, label: string): string {
  return `persona-profile-${segmentSlug(segment, label) || 'segment'}.jpg`;
}
