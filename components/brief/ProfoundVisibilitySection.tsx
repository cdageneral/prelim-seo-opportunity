'use client';

/*
 * ProfoundVisibilitySection (v7.316)
 * ----------------------------------
 * v7.316: added Step 5 — Citation Landscape (citations_data.csv): a 5th upload box that
 *   parses the granular citation-source export (one row per cited URL: hostname, platform,
 *   category, mentioned). Surfaces four insights — owned-vs-competitor citation gap, earned-
 *   media target list, source mix by engine, and the brand-mention surface. The client's own
 *   ("Owned") domain is read from the file's own Owned labels (Profound-assigned), not hardcoded
 *   (Const I.1: every count is a direct tally of source rows; honest empty state until loaded).
 * v7.315: moved the "Sentiment of mentions" widget UP into the summary-card grid, in the
 *   slot the "Net sentiment" card used (Wayne). Falls back to the claim-level Net sentiment
 *   card when mentionSent isn't present (old saved metrics). Removed the lower-section copy.
 * v7.314: hotfix — guard m.mentionSent (metrics persisted by an older version lack it;
 *   `(m.mentionSent || [])` prevents the client-side crash on previously-saved data).
 * v7.313: added the "Sentiment of mentions" widget (👍/neutral/👎 · count · %),
 *   a per-mention rollup of the client's sentiment rows (each evaluation classified
 *   by its balance of positive vs negative claims; tie = neutral). The per-brand and
 *   per-theme claim-level charts are retained below it.
 * AI Answer-Engine visibility panel, rebuilt for the second Profound export set.
 *
 * FOUR explicit upload boxes (one per file; the user drops each file in its box):
 *   1. Responses  (visibility-with-citations.csv)  — REQUIRED. Generic competitive
 *      prompts run across the AI engines: platform, topic, prompt, the co-mentioned
 *      brands (`normalized_mentions`), and whether the client appears (`mentioned?`).
 *   2. Sentiment  (sentiment-with-citations.csv)   — OPTIONAL. `sentiment_claims` JSON
 *      per row: theme + sentiment + the brand the claim is about (`asset`). Also the
 *      authoritative tracked-brand roster.
 *   3. Platforms  (platforms-with_citations.csv)   — OPTIONAL. Master/citation file;
 *      citation_1..N URLs → the sources the engines cite.
 *   4. Prompt Volume (prompt-volume-report.csv)    — OPTIONAL. Topic / Prompt / Share —
 *      the demand catalogue (what buyers ask, and how much).
 *
 * CLIENT IDENTIFICATION (no hardcoding): the client is matched automatically from the
 * project's own `clientName` against the brand roster the data itself defines
 * (sentiment `asset` values + "Evaluate <Brand> on …" prompts). The remaining tracked
 * brands become the competitive set. Works for any future project with different
 * competitors — nothing about a specific client is baked in.
 *
 * DATA INTEGRITY (Const I.1): every number is a DIRECT COUNT from an uploaded source
 * row — nothing modeled, simulated, or estimated. Denominators that are subsets (e.g.
 * visibility-type rows only) are stated on-screen, and any "top N" view shows the full
 * total so nothing is silently trimmed (I.6). Honest empty states when a box is unfilled.
 *
 * Theme parity (Const IV.6): colours use orbit-* tokens + 500/600 chart shades that hold
 * contrast on BOTH the light and dark orbit surfaces; no OS `dark:` variants.
 * Progress (IV.2/IV.3): parsing shows a determinate bar (rows of total + % + ETA).
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { InsightStack } from './InsightBanner';   // v7.366: insight-sentence layer
import { shadowCompetitorInsight, earnedFastPathInsight } from '@/lib/insights';   // v7.366 (A3 · A4)
// v7.417 — Profound's `sentiment_v2_score` replaced the removed `sentiment_claims` column.
import {
  emptyAgg, addScore, meanOf, parseScore, parseEvalPrompt, rollBuckets, isDataRow,
  type ScoreAgg, type SentScoreBucket,
} from '@/lib/profound/sentimentScore';

// ─── Types ─────────────────────────────────────────────────────────────────────
type SlotKey = 'visibility' | 'sentiment' | 'platforms' | 'demand' | 'citations';

interface SlotInfo { fileName: string; rows: number; }
type SlotMap = Partial<Record<SlotKey, SlotInfo>>;

interface BrandStat { brand: string; count: number; pct: number; isClient: boolean; }
interface PlatStat { platform: string; runs: number; hits: number; }
interface TopicStat { topic: string; runs: number; hits: number; }
interface PromptGap { prompt: string; topic: string; rivalMentions: number; leader: string; leaderCount: number; }
interface ThemeStat { theme: string; pos: number; neg: number; }
interface DomainStat { domain: string; count: number; isClient: boolean; isCompetitor: boolean; }
interface DemandTopic { topic: string; share: number; prompts: number; }
interface DemandPrompt { prompt: string; share: number; topic: string; }
// v7.416 — how many demand prompts the metrics blob carries, and how many the card reveals
// per click. The store cap keeps the persisted snapshot bounded; the page size keeps the card
// the same height it has always been until the reader asks for more.
const DEMAND_PROMPT_STORE_CAP = 200;
const DEMAND_PROMPT_PAGE = 12;
interface SentBrand { brand: string; pos: number; neg: number; isClient: boolean; }
// v7.417 — one brand's `sentiment_v2_score` coverage under DIRECT EVALUATION prompts.
// `mean` is null (never 0) when the brand has evaluation rows but none of them were scored —
// Profound scores the client's rows and almost none of the competitors', so a 0.00 here would
// read as damning sentiment when the truth is simply an absence of data (Const I.1 / I.5).
interface SentScoreBrand { brand: string; n: number; rows: number; mean: number | null; isClient: boolean; }
interface MentionSent { brand: string; pos: number; neutral: number; neg: number; total: number; isClient: boolean; }
// Step 5 — Citation Landscape (citations_data.csv)
interface CiteCatStat { category: string; count: number; pct: number; }
interface CiteDomain { hostname: string; count: number; }
interface EngineSourceMix { platform: string; total: number; earned: number; competition: number; owned: number; other: number; }
interface MentionSource { hostname: string; count: number; isClient: boolean; }

interface Metrics {
  client: string;
  tracked: string[];
  totalRuns: number;
  clientHits: number;
  engines: PlatStat[];
  sov: BrandStat[];
  overallTop: { brand: string; count: number; pct: number }[];
  topics: TopicStat[];
  promptN: number;
  coverage: BrandStat[];
  gaps: PromptGap[];
  clientPromptCount: number;
  sentBrands: SentBrand[];
  mentionSent: MentionSent[];
  clientThemes: ThemeStat[];
  // ── v7.417 · sentiment_v2_score (the column that replaced `sentiment_claims`) ──────────
  // All optional on read: metrics persisted before v7.417 carry none of these fields, and the
  // panel must keep rendering those saved analyses unchanged rather than crashing or blanking.
  sentScoreCol?: boolean;          // did the Sentiment export actually carry the column?
  sentScoreRows?: number;          // rows in the Sentiment file
  sentScoreScored?: number;        // rows carrying a parseable score — the coverage numerator
  sentScoreBrands?: SentScoreBrand[];        // direct-evaluation coverage per brand
  sentScoreClientTopics?: SentScoreBucket[]; // client, by topic (every topic, no top-N — I.6)
  sentScoreClientEngines?: SentScoreBucket[];// client, by engine
  sentScoreClientDates?: SentScoreBucket[];  // client, by run date
  sentScoreOpen?: SentScoreBucket | null;    // brand-agnostic prompts, as ONE separate population
  sentScoreOpenEngines?: SentScoreBucket[];
  totalCites: number;
  domains: DomainStat[];
  domainTotalDistinct: number;
  clientDomainCites: number;
  demandTopics: DemandTopic[];
  demandPrompts: DemandPrompt[];
  demandPromptTotal: number;
  // Step 5 — Citation Landscape
  citeTotal: number;
  citeOwned: number;
  citeOwnedShare: number;
  citeOwnedDomain: string;
  citeCompetition: number;
  citeCatMix: CiteCatStat[];
  earnedTargets: CiteDomain[];
  competitorCites: CiteDomain[];
  engineSourceMix: EngineSourceMix[];
  citeMentions: number;
  citeMentionSources: MentionSource[];
  citeMentionByPlatform: { platform: string; count: number }[];
  slots: SlotMap;
  // v7.380 — Profound-matched Visibility Score (strict `type == 'Visibility'` prompt set).
  // Profound's own dashboard scores ONLY the pure visibility prompts; the dual-purpose
  // 'Sentiment, Visibility' rows are real answers but are NOT in its denominator, which is why
  // the blended figure read 2.7pp low against the client's own Profound screen. Headline score +
  // per-engine now reconcile with Profound; gap/whitespace/coverage keep the FULL prompt set.
  visRuns: number;
  visHits: number;
  visPromptN: number;
  visEngines: PlatStat[];
  dateFrom: string;
  dateTo: string;
  dateDays: number;
  inventoryChanges: { date: string; delta: number }[];
  // v7.379 — parse-integrity surface
  clientMatched: boolean;      // was the client resolved to a brand IN the data?
  clientMatchScore: number;    // 0..1 share of the matched brand's tokens covered
  flagHits: number;            // Profound's own `mentioned?` = Yes tally (0 when column absent)
  hasFlagCol: boolean;
  notices: string[];           // honest, on-screen notes about degraded/absent inputs
  updatedAt: string;
}

// ─── Brand normalisation + matching ─────────────────────────────────────────────
// NOTE: "wealth" is intentionally NOT a suffix — it is part of real brand names.
const SUFFIXES = new Set<string>([
  'group', 'financial', 'engines', 'investments', 'advisors', 'advisory', 'planning',
  'llc', 'inc', 'llp', 'management', 'capital', 'partners', 'co', 'company', 'the',
]);

function toks(s: string): string[] {
  // v7.379: a run of single-character tokens is an initialism that punctuation split apart
  // ("U.S. Bank" → u | s | bank). Re-join the run BEFORE suffix filtering so the initialism
  // and its unpunctuated twin collapse to the same signature. This is not cosmetic: the real
  // US Bank export carries BOTH "U.S. Bank" (1,169 rows) and "US Bank" (1,223 rows) as separate
  // `mentions` strings. Without the merge they tokenise differently (['u','s','bank'] vs
  // ['us','bank']), so brandIn() matches one surface form and misses the other, and the roster
  // carries the same brand twice — double-counting its Share of Voice.
  const raw = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const merged: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].length === 1) {
      let j = i;
      let acc = '';
      while (j < raw.length && raw[j].length === 1) { acc += raw[j]; j++; }
      if (acc.length > 1) { merged.push(acc); i = j - 1; continue; }
    }
    merged.push(raw[i]);
  }
  return merged.filter((t) => !SUFFIXES.has(t));
}

// canonical signature for a brand string — two surface forms of one brand share it
function brandSig(s: string): string { return toks(s).join(' '); }

// brand tokens are a subset of some mention's tokens
function brandIn(brand: string, mentions: string[]): boolean {
  const bt = toks(brand);
  if (bt.length === 0) return false;
  for (let m = 0; m < mentions.length; m++) {
    const mt = new Set(toks(mentions[m]));
    let all = true;
    for (let k = 0; k < bt.length; k++) { if (!mt.has(bt[k])) { all = false; break; } }
    if (all) return true;
  }
  return false;
}

// v7.379: score = share of the CANDIDATE's own tokens covered by the project name, not the raw
// overlap count. The old raw-count version took the first strict maximum, so for the project
// "US Bank Deposits" the candidates "U.S. Bank" and "Bank of America" both scored 1 (the shared
// word "bank") and whichever sat earlier in the roster won — a silent WRONG-client identification,
// which is more dangerous than the 0% this release fixes. Coverage scoring separates them
// cleanly: "US Bank" 2/2 = 1.00 vs "Bank of America" 1/3 = 0.33.
const MATCH_MIN = 0.5;
interface ClientMatch { brand: string; score: number; }

function matchClient(clientName: string, candidates: string[]): ClientMatch | null {
  const ct = new Set(toks(clientName));
  if (ct.size === 0) return null;
  let best: ClientMatch | null = null;
  let bestOverlap = 0;
  for (let i = 0; i < candidates.length; i++) {
    const at = toks(candidates[i]);
    if (at.length === 0) continue;
    let overlap = 0;
    for (let k = 0; k < at.length; k++) { if (ct.has(at[k])) overlap++; }
    if (overlap === 0) continue;
    const score = overlap / at.length;
    if (!best || score > best.score || (score === best.score && overlap > bestOverlap)) {
      best = { brand: candidates[i], score };
      bestOverlap = overlap;
    }
  }
  // One shared generic word out of many is not an identification — say so instead of guessing.
  return best && best.score >= MATCH_MIN ? best : null;
}

function clientDomainRoot(clientName: string): string {
  return toks(clientName).join('');
}

// ─── Robust RFC-4180 streaming parser (handles quoted fields w/ embedded commas + newlines) ──
async function streamCsv(
  file: File,
  onRow: (row: string[], idx: number) => void,
  onProgress: (frac: number, rows: number) => void,
): Promise<number> {
  const text = await file.text();
  const len = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let field = '';
  let row: string[] = [];
  let inQ = false;
  let idx = 0;
  let lastYield = 0;
  while (i < len) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      onRow(row, idx); idx++; row = [];
      i++;
      if (idx - lastYield >= 4000) { lastYield = idx; onProgress(i / len, idx); await new Promise((r) => setTimeout(r)); }
      continue;
    }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); onRow(row, idx); idx++; }
  onProgress(1, idx);
  return idx;
}

// ─── Header resolution + validation (v7.379) ────────────────────────────────────
// Profound renamed export columns between exports (`normalized_mentions` → `mentions`,
// `sentiment_claims` removed entirely, `Prompts.csv` shipped Title-Case headers). The old
// lookup did `.trim().toLowerCase()` and then indexed a bare literal, so a renamed column
// silently yielded `row[undefined]` → `''` → every tally zero. The panel then rendered a
// confident, fully-formatted 0.00% off a broken parse — the exact failure this layer removes.
//
// Two defences, plus the assertions in computeAll():
//   1. normKey() collapses BOM/case/separators, so `Normalized Mentions`, `normalized-mentions`
//      and `normalized_mentions` all resolve to one key. Casing/separator drift can never break
//      the parse again, for any column, without a code change.
//   2. Every logical field carries an ALIAS LIST and a required flag. A missing REQUIRED column
//      throws a named diagnostic (Const I.5: an honest, specific gap) — never a silent zero.
function normKey(s: string): string {
  return (s || '').replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

interface FieldSpec { field: string; aliases: string[]; required: boolean; note?: string }

// Aliases are grounded in the REAL export headers verified on 2026-07-27, not guessed.
// Left-most alias wins; the logical `field` name is what computeAll() indexes by, so the
// downstream call sites are untouched when Profound renames a column again.
const COLS: Record<SlotKey, FieldSpec[]> = {
  visibility: [
    { field: 'type', aliases: ['type', 'run_type', 'response_type'], required: true },
    { field: 'prompt', aliases: ['prompt', 'query', 'question'], required: true },
    { field: 'platform', aliases: ['platform', 'engine', 'model'], required: true },
    { field: 'topic', aliases: ['topic', 'category'], required: true },
    // 2026-07-27: Profound renamed `normalized_mentions` → `mentions`. THE break.
    { field: 'normalized_mentions', aliases: ['mentions', 'normalized_mentions', 'brand_mentions', 'brands', 'companies'], required: true },
    // Profound's own client-mentioned flag — used as an independent cross-check below.
    { field: 'mentioned_flag', aliases: ['mentioned?', 'mentioned', 'is_mentioned'], required: false },
    // v7.380: run date — drives the coverage window + prompt-inventory-change notice.
    { field: 'date', aliases: ['date', 'run_date', 'timestamp'], required: false },
  ],
  // `sentiment_claims` was REMOVED from the 2026-07-27 export and is absent from EVERY file in
  // the 2026-08-07..09 set (verified 2026-08-10). It is kept OPTIONAL rather than deleted for two
  // reasons: an export that still carries it parses exactly as before, and metrics already saved
  // from an older export keep rendering their per-brand charts. What the current export ships
  // instead is `sentiment_v2_score` (v7.417) — a sparse, client-only 0-1 scalar. The remaining
  // columns are the dimensions the score is rolled up by; all optional, so a thinner Sentiment
  // export still parses and simply yields fewer breakdowns (I.5) rather than failing the upload.
  sentiment: [
    { field: 'sentiment_claims', aliases: ['sentiment_claims', 'claims', 'sentiment_claims_json'], required: false },
    { field: 'sentiment_v2_score', aliases: ['sentiment_v2_score', 'sentiment_score', 'sentiment_v2'], required: false },
    { field: 'prompt', aliases: ['prompt', 'query', 'question'], required: false },
    { field: 'platform', aliases: ['platform', 'engine', 'model'], required: false },
    { field: 'topic', aliases: ['topic', 'category'], required: false },
    { field: 'date', aliases: ['date', 'run_date', 'timestamp'], required: false },
  ],
  platforms: [],   // citation_1..N are resolved dynamically below
  demand: [
    { field: 'topic', aliases: ['topic'], required: true },
    { field: 'prompt', aliases: ['prompt', 'query'], required: true },
    { field: 'share', aliases: ['share', 'volume', 'demand_share'], required: true },
  ],
  citations: [
    { field: 'hostname', aliases: ['hostname', 'host', 'domain'], required: true },
    { field: 'platform', aliases: ['platform', 'engine'], required: true },
    { field: 'category', aliases: ['category', 'citationcategory', 'source_category'], required: true },
    { field: 'mentioned', aliases: ['mentioned', 'mentioned?'], required: false },
  ],
};

const SLOT_FILE: Record<SlotKey, string> = {
  visibility: 'Step 1 · Responses',
  sentiment: 'Step 2 · Sentiment',
  platforms: 'Step 3 · Platforms & Citations',
  demand: 'Step 4 · Prompt Volume',
  citations: 'Step 5 · Citation Landscape',
};

class ProfoundParseError extends Error {
  slot: SlotKey; missing: FieldSpec[]; header: string[]; looksLike: SlotKey | null;
  constructor(slot: SlotKey, missing: FieldSpec[], header: string[], looksLike: SlotKey | null = null) {
    super(`${SLOT_FILE[slot]}: missing required column${missing.length > 1 ? 's' : ''} ${missing.map((m) => m.field).join(', ')}`);
    this.name = 'ProfoundParseError';
    this.slot = slot; this.missing = missing; this.header = header; this.looksLike = looksLike;
  }
}

// v7.381: the commonest upload error is a RIGHT file in the WRONG box — the five Profound
// exports look alike and four of them share most columns. Naming the missing column is accurate
// but unhelpful when the real problem is that this is a different export entirely. So when a
// required column is missing, check whether the header fully satisfies some OTHER step's schema
// and, if exactly one does, say which — "this looks like Step 1 · Responses" beats "missing share".
function identifySlot(header: string[], exclude: SlotKey): SlotKey | null {
  const raw: Record<string, boolean> = {};
  for (let i = 0; i < header.length; i++) { const k = normKey(header[i]); if (k) raw[k] = true; }
  const hits: SlotKey[] = [];
  (Object.keys(COLS) as SlotKey[]).forEach((sk) => {
    if (sk === exclude) return;
    const specs = COLS[sk].filter((sp) => sp.required);
    if (specs.length === 0) return;                       // no required columns → not identifiable
    const all = specs.every((sp) => sp.aliases.some((a) => normKey(a) in raw));
    if (all) hits.push(sk);
  });
  return hits.length === 1 ? hits[0] : null;
}

// Resolves the header row into a LOGICAL field → column-index map. Unrecognised columns are
// passed through under their normalised key so dynamic families (citation_1..N) still work.
function resolveHeader(slot: SlotKey, header: string[]): Record<string, number> {
  const raw: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    const k = normKey(header[i]);
    if (k && !(k in raw)) raw[k] = i;
  }
  const out: Record<string, number> = {};
  const missing: FieldSpec[] = [];
  const specs = COLS[slot] || [];
  for (let s = 0; s < specs.length; s++) {
    const spec = specs[s];
    let hit = -1;
    for (let a = 0; a < spec.aliases.length; a++) {
      const nk = normKey(spec.aliases[a]);
      if (nk in raw) { hit = raw[nk]; break; }
    }
    if (hit >= 0) out[spec.field] = hit;
    else if (spec.required) missing.push(spec);
  }
  if (missing.length > 0) throw new ProfoundParseError(slot, missing, header, identifySlot(header, slot));
  Object.keys(raw).forEach((k) => { if (!(k in out)) out[k] = raw[k]; });
  return out;
}

function splitMentions(s: string): string[] {
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
}

// ─── IndexedDB persistence (compact computed metrics only — never the raw rows) ──
const IDB_NAME = 'orbitiq-profound-geo';
const IDB_STORE = 'metrics';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(IDB_NAME, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbSave(pid: string, m: Metrics): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(m, pid);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    } catch { resolve(false); }
  });
}

async function idbLoad(pid: string): Promise<Metrics | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const rq = tx.objectStore(IDB_STORE).get(pid);
      rq.onsuccess = () => { db.close(); resolve((rq.result as Metrics) || null); };
      rq.onerror = () => { db.close(); resolve(null); };
    } catch { resolve(null); }
  });
}

async function idbDelete(pid: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(pid);
    tx.oncomplete = () => db.close();
  } catch { /* no-op */ }
}

// ─── Server-side persistence (v7.318) ────────────────────────────────────────────
// The computed metrics also live on the project row (Neon Postgres) via
// /api/projects/[id]/profound, so the analysis survives refreshes, new browsers/devices, and is
// visible to ANY user who opens the project URL (the IndexedDB store above is kept only as a fast
// local cache / offline fallback). All three are fault-tolerant: a network/DB hiccup never loses
// the in-memory result or the local cache.
async function serverLoad(pid: string): Promise<Metrics | null> {
  try {
    const r = await fetch(`/api/projects/${pid}/profound`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.metrics) ? (j.metrics as Metrics) : null;
  } catch { return null; }
}

async function serverSave(pid: string, m: Metrics): Promise<boolean> {
  try {
    const r = await fetch(`/api/projects/${pid}/profound`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: m }),
    });
    return r.ok;
  } catch { return false; }
}

async function serverDelete(pid: string): Promise<void> {
  try { await fetch(`/api/projects/${pid}/profound`, { method: 'DELETE' }); } catch { /* no-op */ }
}

// ─── Compute all metrics from the currently-loaded files ────────────────────────
type FileMap = Partial<Record<SlotKey, File>>;

interface Progress { label: string; pct: number; rows: number; startedAt: number; }

// v7.417 — exported so the retained regression suite can run the REAL parser against Wayne's
// REAL five Profound exports at full scale (Const V.4 / V.6), rather than a replica of it in the
// test. Same pattern as ThemeClustersPanel exporting buildCanonicalClusterTopics. This is a
// component file, not an App Router route, so a named export alongside the default is safe.
export async function computeAll(
  files: FileMap,
  clientName: string,
  setProgress: (p: Progress | null) => void,
): Promise<Metrics> {
  const startedAt = Date.now();
  const slots: SlotMap = {};

  // ── Sentiment pass: tracked roster + per-brand / per-theme sentiment ──
  const assets: Record<string, boolean> = {};
  const sentByBrand: Record<string, { pos: number; neg: number }> = {};
  const themeByBrand: Record<string, Record<string, { pos: number; neg: number }>> = {};
  // v7.313: per-brand MENTION-level sentiment — each sentiment row is one evaluation,
  // classified by its balance of positive vs negative claims (tie → neutral).
  const mentionByBrand: Record<string, { pos: number; neutral: number; neg: number }> = {};
  // v7.417 — `sentiment_v2_score` accumulators, filled in the SAME pass as the claim parse.
  // Keyed by brand because the client is not resolved until the visibility pass below; the
  // client's slice is taken afterwards. Four brands x eight topics x six engines, so the nesting
  // is bounded by the export, not by a cap (I.6).
  interface BrandScore { all: ScoreAgg; byTopic: Record<string, ScoreAgg>; byPlatform: Record<string, ScoreAgg>; byDate: Record<string, ScoreAgg>; }
  const evalScore: Record<string, BrandScore> = {};
  const openAll = emptyAgg();
  const openByPlatform: Record<string, ScoreAgg> = {};
  let sentRowsSeen = 0;      // every data row in the Sentiment file
  let sentRowsScored = 0;    // rows carrying a parseable sentiment_v2_score
  let sentHasScoreCol = false;
  if (files.sentiment) {
    let H: Record<string, number> = {};
    const f = files.sentiment;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader('sentiment', row);
        sentHasScoreCol = H['sentiment_v2_score'] !== undefined;
        return;
      }
      // ── v7.417 · sentiment_v2_score rollup ──────────────────────────────────────────
      // Runs for every row, independently of the claim parse below, so an export carrying
      // BOTH columns feeds both views rather than one silently winning.
      // Profound appends a one-cell "Filters - ..." trailer to the export; it is not a data row
      // and must not land in the coverage denominator (see isDataRow).
      if (sentHasScoreCol && isDataRow(row)) {
        sentRowsSeen++;
        const v = parseScore(row[H['sentiment_v2_score']]);
        if (v !== null) sentRowsScored++;
        const pi = H['prompt'];
        const ev = pi === undefined ? null : parseEvalPrompt(row[pi]);
        const plat = H['platform'] === undefined ? '' : (row[H['platform']] || '').trim();
        if (ev) {
          // Direct evaluation: "Evaluate <Brand> on <topic>". Topic comes from the PROMPT, not
          // the `topic` column, so the label always matches the question that was actually asked.
          if (!evalScore[ev.brand]) evalScore[ev.brand] = { all: emptyAgg(), byTopic: {}, byPlatform: {}, byDate: {} };
          const b = evalScore[ev.brand];
          addScore(b.all, v);
          if (!b.byTopic[ev.topic]) b.byTopic[ev.topic] = emptyAgg();
          addScore(b.byTopic[ev.topic], v);
          if (plat) {
            if (!b.byPlatform[plat]) b.byPlatform[plat] = emptyAgg();
            addScore(b.byPlatform[plat], v);
          }
          const d = H['date'] === undefined ? '' : (row[H['date']] || '').trim();
          if (d) {
            if (!b.byDate[d]) b.byDate[d] = emptyAgg();
            addScore(b.byDate[d], v);
          }
        } else {
          // Open answer: a brand-agnostic prompt. Kept in its own population — a brand LISTED in
          // a roundup scores far higher than the same brand put under direct evaluation, so the
          // two are never averaged together.
          addScore(openAll, v);
          if (plat) {
            if (!openByPlatform[plat]) openByPlatform[plat] = emptyAgg();
            addScore(openByPlatform[plat], v);
          }
        }
      }
      const sci = H['sentiment_claims'];
      const sc = sci === undefined ? '' : row[sci];
      if (!sc || sc[0] !== '[') return;
      let claims: Array<{ asset?: string; sentiment?: string; theme?: string }>;
      try { claims = JSON.parse(sc); } catch { return; }
      const rowByAsset: Record<string, { p: number; n: number }> = {};
      for (let c = 0; c < claims.length; c++) {
        const a = (claims[c].asset || '').trim();
        const s = (claims[c].sentiment || '').toLowerCase();
        const th = (claims[c].theme || 'Other').trim();
        if (!a) continue;
        assets[a] = true;
        if (!sentByBrand[a]) sentByBrand[a] = { pos: 0, neg: 0 };
        if (!themeByBrand[a]) themeByBrand[a] = {};
        if (!themeByBrand[a][th]) themeByBrand[a][th] = { pos: 0, neg: 0 };
        if (!rowByAsset[a]) rowByAsset[a] = { p: 0, n: 0 };
        if (s === 'positive') { sentByBrand[a].pos++; themeByBrand[a][th].pos++; rowByAsset[a].p++; }
        else if (s === 'negative') { sentByBrand[a].neg++; themeByBrand[a][th].neg++; rowByAsset[a].n++; }
      }
      // classify this row as ONE mention per asset by its claim balance (direct count)
      Object.keys(rowByAsset).forEach((a) => {
        const { p, n } = rowByAsset[a];
        if (p + n === 0) return;
        if (!mentionByBrand[a]) mentionByBrand[a] = { pos: 0, neutral: 0, neg: 0 };
        if (p > n) mentionByBrand[a].pos++;
        else if (n > p) mentionByBrand[a].neg++;
        else mentionByBrand[a].neutral++;
      });
    }, (pct, r) => setProgress({ label: 'Sentiment', pct, rows: r, startedAt }));
    slots.sentiment = { fileName: f.name, rows };
  }

  // ── Visibility pass 1: totals, market-context brands, prompt index, eval subjects ──
  let totalRuns = 0;
  const platRuns: Record<string, number> = {};
  const topicRuns: Record<string, number> = {};
  const overallRaw: Record<string, number> = {};
  const promptInfo: Record<string, { topic: string; runs: number }> = {};
  const evalSubjects: Record<string, boolean> = {};
  let flagHits = 0;                 // v7.379: tally of Profound's own `mentioned?` = Yes
  let hasFlagCol = false;
  // v7.380: STRICT set = Profound's own Visibility Score denominator (type is exactly 'Visibility').
  let visRuns = 0;
  const visPlatRuns: Record<string, number> = {};
  const visPrompts: Record<string, boolean> = {};
  const rowsByDate: Record<string, number> = {};
  const notices: string[] = [];     // v7.379: honest, on-screen notes about degraded inputs
  // capture each visibility row's mentions for pass-2 by re-streaming (files stay in memory)
  if (files.visibility) {
    let H: Record<string, number> = {};
    const f = files.visibility;
    await streamCsv(f, (row, idx) => {
      if (idx === 0) { H = resolveHeader('visibility', row); return; }
      const type = row[H['type']] || '';
      const ev = /^Evaluate (.+?) on /.exec(row[H['prompt']] || '');
      if (ev) evalSubjects[ev[1].trim()] = true;
      if (type.indexOf('Visibility') === -1) return;
      totalRuns++;
      const plat = row[H['platform']] || '';
      const topic = row[H['topic']] || '';
      const prompt = (row[H['prompt']] || '').trim();
      // v7.380: strict = Profound's denominator; broad = every answer the client could have won.
      if (type.trim() === 'Visibility') {
        visRuns++;
        visPlatRuns[plat] = (visPlatRuns[plat] || 0) + 1;
        if (prompt) visPrompts[prompt] = true;
      }
      const di = H['date'];
      if (di !== undefined) {
        const d = (row[di] || '').slice(0, 10);
        if (d) rowsByDate[d] = (rowsByDate[d] || 0) + 1;
      }
      platRuns[plat] = (platRuns[plat] || 0) + 1;
      topicRuns[topic] = (topicRuns[topic] || 0) + 1;
      if (!promptInfo[prompt]) promptInfo[prompt] = { topic, runs: 0 };
      promptInfo[prompt].runs++;
      const seen: Record<string, boolean> = {};
      const ms = splitMentions(row[H['normalized_mentions']] || '');
      for (let k = 0; k < ms.length; k++) { if (!seen[ms[k]]) { seen[ms[k]] = true; overallRaw[ms[k]] = (overallRaw[ms[k]] || 0) + 1; } }
      // Profound's own client-mentioned flag, tallied independently for the cross-check below.
      const mfi = H['mentioned_flag'];
      if (mfi !== undefined) { hasFlagCol = true; if ((row[mfi] || '').trim().toLowerCase() === 'yes') flagHits++; }
    }, (pct, r) => setProgress({ label: 'Responses', pct, rows: r, startedAt }));

    // ── Layer C · structural assertions (v7.379) ──
    // Aliasing fixes header RENAMES. These catch the other failure mode: a column that still
    // resolves but whose VALUES changed shape. A real competitive export cannot have thousands
    // of parsed answers and no brands in them — if it does, the parse is broken, and a loud
    // failure is the only defensible output (Const I.1/I.5).
    if (totalRuns === 0) {
      throw new ProfoundParseError('visibility', [{ field: 'type', aliases: ['type'], required: true, note: 'resolved, but no row matched the "Visibility" run type — the type vocabulary may have changed' }], []);
    }
    if (Object.keys(overallRaw).length === 0) {
      throw new ProfoundParseError('visibility', [{ field: 'normalized_mentions', aliases: COLS.visibility[4].aliases, required: true, note: `resolved, but ${totalRuns} answers yielded zero brand mentions — the column format may have changed` }], []);
    }
  }

  // ── Determine client + tracked roster (no hardcoding) ──
  // v7.379: dedupe the roster by canonical signature FIRST. The real export lists the same brand
  // under multiple surface forms ("U.S. Bank" and "US Bank"); left un-deduped each becomes its own
  // roster entry and splits that brand's Share of Voice across two bars. Keep the most-mentioned
  // surface form as the display label.
  function dedupeBySig(list: string[]): string[] {
    const bySig: Record<string, string> = {};
    for (let i = 0; i < list.length; i++) {
      const sg = brandSig(list[i]);
      if (!sg) continue;
      const cur = bySig[sg];
      if (!cur || (overallRaw[list[i]] || 0) > (overallRaw[cur] || 0)) bySig[sg] = list[i];
    }
    return Object.keys(bySig).map((k) => bySig[k]);
  }
  const rosterFromData = Object.keys(assets).length > 0
    ? Object.keys(assets)
    : Object.keys(evalSubjects);
  let tracked: string[] = dedupeBySig(rosterFromData);
  const cm = matchClient(clientName, tracked.length ? tracked : dedupeBySig(Object.keys(overallRaw)));
  const clientMatched = !!cm;
  const clientMatchScore = cm ? cm.score : 0;
  let client = cm ? cm.brand : clientName.trim();
  if (tracked.length === 0) {
    // No roster in the data → derive a competitive set from the most-mentioned brands.
    const top = dedupeBySig(Object.keys(overallRaw)).sort((a, b) => overallRaw[b] - overallRaw[a]);
    const picked: string[] = [];
    for (let i = 0; i < top.length && picked.length < 7; i++) {
      if (brandSig(top[i]) !== brandSig(client)) picked.push(top[i]);
    }
    tracked = [client].concat(picked);
  } else if (!tracked.some((b) => brandSig(b) === brandSig(client))) {
    tracked = [client].concat(tracked);
  }
  const brandList = tracked.slice();

  // ── Visibility pass 2: per-brand cross-tabs over the fixed roster ──
  const trackedOverall: Record<string, number> = {};
  const platBrand: Record<string, Record<string, number>> = {};
  const topicBrand: Record<string, Record<string, number>> = {};
  const promptBrand: Record<string, Record<string, number>> = {};
  const coverage: Record<string, number> = {};
  let clientHits = 0;
  let visHits = 0;                                        // v7.380 strict-set client hits
  const platClient: Record<string, number> = {};
  const visPlatClient: Record<string, number> = {};       // v7.380 strict-set per-engine hits
  const topicClient: Record<string, number> = {};
  brandList.forEach((b) => { trackedOverall[b] = 0; coverage[b] = 0; });
  if (files.visibility) {
    let H: Record<string, number> = {};
    const f = files.visibility;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) { H = resolveHeader('visibility', row); return; }
      const type = row[H['type']] || '';
      if (type.indexOf('Visibility') === -1) return;
      const plat = row[H['platform']] || '';
      const topic = row[H['topic']] || '';
      const prompt = (row[H['prompt']] || '').trim();
      const ms = splitMentions(row[H['normalized_mentions']] || '');
      for (let bi = 0; bi < brandList.length; bi++) {
        const b = brandList[bi];
        if (!brandIn(b, ms)) continue;
        trackedOverall[b]++;
        if (!platBrand[plat]) platBrand[plat] = {};
        platBrand[plat][b] = (platBrand[plat][b] || 0) + 1;
        if (!topicBrand[topic]) topicBrand[topic] = {};
        topicBrand[topic][b] = (topicBrand[topic][b] || 0) + 1;
        if (!promptBrand[prompt]) promptBrand[prompt] = {};
        promptBrand[prompt][b] = (promptBrand[prompt][b] || 0) + 1;
        if (b === client) {
          clientHits++;
          platClient[plat] = (platClient[plat] || 0) + 1;
          topicClient[topic] = (topicClient[topic] || 0) + 1;
          if (type.trim() === 'Visibility') {
            visHits++;
            visPlatClient[plat] = (visPlatClient[plat] || 0) + 1;
          }
        }
      }
    }, (pct, r) => setProgress({ label: 'Responses (analysing)', pct, rows: r, startedAt }));
    slots.visibility = { fileName: f.name, rows };

    // v7.379 · independent cross-check. Two unrelated signals should agree on client presence:
    // (a) brand-token matching over `mentions`, (b) Profound's own `mentioned?` flag. On the
    // verified 2026-07-27 US Bank export they agree on all 1,192 of 1,192 rows. A material
    // divergence means one of the two inputs drifted — surface it rather than quietly picking one.
    if (hasFlagCol && totalRuns > 0) {
      const delta = Math.abs(flagHits - clientHits) / totalRuns;
      if (delta > 0.02) {
        notices.push(
          `Cross-check divergence: brand matching found the client in ${clientHits} of ${totalRuns} answers, ` +
          `while Profound's own "mentioned?" flag reports ${flagHits} (${(delta * 100).toFixed(1)}pp apart). ` +
          `Treat both as unconfirmed until the export is reviewed.`,
        );
      }
    }
    if (!clientMatched) {
      notices.push(
        `The project name "${clientName.trim()}" could not be matched to any brand in the uploaded data, ` +
        `so every client figure below is 0 by construction. Rename the project to the brand as the export ` +
        `spells it, or confirm the client is actually tracked in this Profound export.`,
      );
    }
  }
  // v7.417 — the v7.379 notice said only that the charts were "unavailable", which read as though
  // the uploaded file was wrong. It was not: Profound removed the column. The notice now names
  // what was dropped, what replaced it, and what the replacement can and cannot support, so the
  // reader can tell a vendor change apart from a bad upload (Const I.5 — an honest, specific gap).
  if (files.sentiment && Object.keys(assets).length === 0) {
    if (sentHasScoreCol) {
      const pct = sentRowsSeen > 0 ? (100 * sentRowsScored) / sentRowsSeen : 0;
      notices.push(
        `${SLOT_FILE.sentiment}: this export no longer carries the per-brand "sentiment_claims" column ` +
        `Profound shipped through 2026-07-27, so net sentiment by brand and sentiment by theme cannot be ` +
        `built from it — the brand and theme labels are not in the data. It ships "sentiment_v2_score" ` +
        `instead: ${fmt(sentRowsScored)} of ${fmt(sentRowsSeen)} rows scored (${pct.toFixed(1)}%), scored ` +
        `for the client rather than for every brand, so it supports a client sentiment reading but not a ` +
        `competitor comparison. Everything else in this panel is unaffected.`,
      );
    } else {
      notices.push(
        `${SLOT_FILE.sentiment}: this export carries neither the per-brand "sentiment_claims" column nor ` +
        `the "sentiment_v2_score" column, so no sentiment reading can be built from it. Everything else is ` +
        `unaffected.`,
      );
    }
  }
  // prompt coverage = distinct prompts where a brand appears at least once
  const promptKeys = Object.keys(promptInfo);
  promptKeys.forEach((p) => {
    const pb = promptBrand[p] || {};
    brandList.forEach((b) => { if ((pb[b] || 0) > 0) coverage[b]++; });
  });
  // winnable gaps: prompts where client absent but a competitor present
  const gaps: PromptGap[] = [];
  let clientPromptCount = 0;
  promptKeys.forEach((p) => {
    const pb = promptBrand[p] || {};
    if ((pb[client] || 0) > 0) { clientPromptCount++; return; }
    let rival = 0; let leader = ''; let leaderCount = 0;
    brandList.forEach((b) => {
      if (b === client) return;
      const c = pb[b] || 0;
      rival += c;
      if (c > leaderCount) { leaderCount = c; leader = b; }
    });
    if (rival > 0) gaps.push({ prompt: p, topic: promptInfo[p].topic, rivalMentions: rival, leader, leaderCount });
  });
  gaps.sort((a, b) => b.rivalMentions - a.rivalMentions);

  // ── Platforms pass: citation domains ──
  const domainCount: Record<string, number> = {};
  let totalCites = 0;
  if (files.platforms) {
    let H: Record<string, number> = {};
    let citeCols: number[] = [];
    const f = files.platforms;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) {
        H = resolveHeader('platforms', row);
        citeCols = Object.keys(H).filter((k) => /^citation\d+$/.test(k)).map((k) => H[k]);
        return;
      }
      for (let c = 0; c < citeCols.length; c++) {
        const u = row[citeCols[c]];
        if (!u || u.indexOf('http') !== 0) continue;
        totalCites++;
        let host = '';
        try { host = new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { continue; }
        if (host) domainCount[host] = (domainCount[host] || 0) + 1;
      }
    }, (pct, r) => setProgress({ label: 'Platforms & Citations', pct, rows: r, startedAt }));
    slots.platforms = { fileName: f.name, rows };
  }
  const cRoot = clientDomainRoot(client);
  let clientDomainCites = 0;
  Object.keys(domainCount).forEach((d) => { if (cRoot && d.replace(/[^a-z0-9]/g, '').indexOf(cRoot) !== -1) clientDomainCites += domainCount[d]; });
  const compRoots = brandList.filter((b) => b !== client).map((b) => clientDomainRoot(b)).filter((r) => r.length > 2);

  // ── Demand pass: prompt-volume report ──
  const demandTopicShare: Record<string, number> = {};
  const demandTopicCount: Record<string, number> = {};
  const demandPromptsArr: DemandPrompt[] = [];
  if (files.demand) {
    let H: Record<string, number> = {};
    const f = files.demand;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) { H = resolveHeader('demand', row); return; }
      const topic = (row[H['topic']] || '').trim();
      const prompt = (row[H['prompt']] || '').trim();
      const share = parseFloat(row[H['share']] || '');
      if (!topic && !prompt) return;
      const sh = isNaN(share) ? 0 : share;
      demandTopicShare[topic] = (demandTopicShare[topic] || 0) + sh;
      demandTopicCount[topic] = (demandTopicCount[topic] || 0) + 1;
      demandPromptsArr.push({ prompt, share: sh, topic });
    }, (pct, r) => setProgress({ label: 'Prompt Volume', pct, rows: r, startedAt }));
    slots.demand = { fileName: f.name, rows };
  }

  // ── Citation-landscape pass: citations_data.csv (each row = one cited source URL) ──
  // Direct tally only (Const I.1). The client's own domain is whatever the file labels
  // category=Owned — Profound assigns it, so nothing about the client is hardcoded.
  const citeCatCount: Record<string, number> = {};
  const earnedDomain: Record<string, number> = {};
  const compDomainCite: Record<string, number> = {};
  const ownedDomainCite: Record<string, number> = {};
  const engMix: Record<string, { total: number; earned: number; competition: number; owned: number; other: number }> = {};
  const mentionHost: Record<string, number> = {};
  const mentionPlat: Record<string, number> = {};
  let citeTotal = 0;
  let citeMentions = 0;
  if (files.citations) {
    let H: Record<string, number> = {};
    const f = files.citations;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) { H = resolveHeader('citations', row); return; }
      const host = (row[H['hostname']] || '').replace(/^www\./, '').toLowerCase().trim();
      const plat = (row[H['platform']] || '').trim();
      const cat = (row[H['category']] || 'Other').trim() || 'Other';
      const mi = H['mentioned'];
      const mentioned = (mi === undefined ? '' : (row[mi] || '')).trim().toLowerCase() === 'mentioned';
      if (!host && !plat) return;
      citeTotal++;
      citeCatCount[cat] = (citeCatCount[cat] || 0) + 1;
      const lc = cat.toLowerCase();
      if (lc === 'earned media' && host) earnedDomain[host] = (earnedDomain[host] || 0) + 1;
      if (lc === 'competition' && host) compDomainCite[host] = (compDomainCite[host] || 0) + 1;
      if (lc === 'owned' && host) ownedDomainCite[host] = (ownedDomainCite[host] || 0) + 1;
      if (plat) {
        if (!engMix[plat]) engMix[plat] = { total: 0, earned: 0, competition: 0, owned: 0, other: 0 };
        engMix[plat].total++;
        if (lc === 'earned media') engMix[plat].earned++;
        else if (lc === 'competition') engMix[plat].competition++;
        else if (lc === 'owned') engMix[plat].owned++;
        else engMix[plat].other++;
      }
      if (mentioned) {
        citeMentions++;
        if (host) mentionHost[host] = (mentionHost[host] || 0) + 1;
        if (plat) mentionPlat[plat] = (mentionPlat[plat] || 0) + 1;
      }
    }, (pct, r) => setProgress({ label: 'Citation Landscape', pct, rows: r, startedAt }));
    slots.citations = { fileName: f.name, rows };
  }

  // ── Finalise ──
  // ── v7.380 · coverage window + prompt-inventory change ──────────────────────────
  // The export can span a period in which the prompt set itself changed (the 2026-07-27 US Bank
  // export added 852 answers/day on 07-24). A single pooled percentage across such a boundary
  // reads as a visibility TREND when it is really a change of denominator — so the window and
  // every inventory change are stated on screen rather than silently averaged away.
  const dateKeys = Object.keys(rowsByDate).sort();
  const dateFrom = dateKeys.length ? dateKeys[0] : '';
  const dateTo = dateKeys.length ? dateKeys[dateKeys.length - 1] : '';
  const inventoryChanges: { date: string; delta: number }[] = [];
  for (let i = 1; i < dateKeys.length; i++) {
    const delta = rowsByDate[dateKeys[i]] - rowsByDate[dateKeys[i - 1]];
    if (delta !== 0) inventoryChanges.push({ date: dateKeys[i], delta });
  }
  if (inventoryChanges.length > 0) {
    notices.push(
      `Prompt set changed mid-window: ` +
      inventoryChanges.map((c) => `${c.date} (${c.delta > 0 ? '+' : ''}${c.delta.toLocaleString()} answers/day)`).join(', ') +
      `. Figures below pool every date in ${dateFrom} – ${dateTo}, so a change in the score across this ` +
      `window partly reflects the new prompts entering the average — not visibility movement alone.`,
    );
  }

  // v7.380: per-engine visibility on the STRICT set, so it reconciles with the headline score.
  const visEngines: PlatStat[] = Object.keys(visPlatRuns)
    .map((p) => ({ platform: p, runs: visPlatRuns[p], hits: visPlatClient[p] || 0 }))
    .sort((a, b) => (b.hits / Math.max(1, b.runs)) - (a.hits / Math.max(1, a.runs)));

  const engines: PlatStat[] = Object.keys(platRuns)
    .map((p) => ({ platform: p, runs: platRuns[p], hits: platClient[p] || 0 }))
    .sort((a, b) => (b.hits / Math.max(1, b.runs)) - (a.hits / Math.max(1, a.runs)));

  const sov: BrandStat[] = brandList
    .map((b) => ({ brand: b, count: trackedOverall[b] || 0, pct: totalRuns ? (100 * (trackedOverall[b] || 0)) / totalRuns : 0, isClient: b === client }))
    .sort((a, b) => b.count - a.count);

  const overallTop = Object.keys(overallRaw)
    .map((b) => ({ brand: b, count: overallRaw[b], pct: totalRuns ? (100 * overallRaw[b]) / totalRuns : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topics: TopicStat[] = Object.keys(topicRuns)
    .map((t) => ({ topic: t, runs: topicRuns[t], hits: topicClient[t] || 0 }))
    .sort((a, b) => (a.hits / Math.max(1, a.runs)) - (b.hits / Math.max(1, b.runs)));

  const coverageStat: BrandStat[] = brandList
    .map((b) => ({ brand: b, count: coverage[b] || 0, pct: promptKeys.length ? (100 * (coverage[b] || 0)) / promptKeys.length : 0, isClient: b === client }))
    .sort((a, b) => b.count - a.count);

  const sentBrands: SentBrand[] = brandList
    .filter((b) => sentByBrand[b])
    .map((b) => ({ brand: b, pos: sentByBrand[b].pos, neg: sentByBrand[b].neg, isClient: b === client }))
    .sort((a, b) => netPct(b.pos, b.neg) - netPct(a.pos, a.neg));

  const mentionSent: MentionSent[] = brandList
    .filter((b) => mentionByBrand[b])
    .map((b) => {
      const m = mentionByBrand[b];
      return { brand: b, pos: m.pos, neutral: m.neutral, neg: m.neg, total: m.pos + m.neutral + m.neg, isClient: b === client };
    })
    .sort((a, b) => b.total - a.total);

  const clientThemesRaw = themeByBrand[client] || {};
  const clientThemes: ThemeStat[] = Object.keys(clientThemesRaw)
    .map((t) => ({ theme: t, pos: clientThemesRaw[t].pos, neg: clientThemesRaw[t].neg }))
    .filter((t) => t.pos + t.neg >= 8)
    .sort((a, b) => netPct(b.pos, b.neg) - netPct(a.pos, a.neg));

  // ── v7.417 · sentiment_v2_score rollups ─────────────────────────────────────────────────
  // The score is accumulated per brand above because `client` is not resolved until this point.
  // Brands are matched against the SAME resolved client the rest of the panel uses, so the
  // sentiment view and the visibility view can never disagree about who the client is.
  // brandSig() is the panel's own brand-identity function (token-normalised), the same one the
  // roster and client match use — so a prompt-derived spelling ("Sofi") and a roster spelling
  // ("SoFi") resolve to one brand here exactly as they do everywhere else in the panel.
  const sentScoreBrands: SentScoreBrand[] = Object.keys(evalScore)
    .map((b) => {
      const a = evalScore[b].all;
      return { brand: b, n: a.n, rows: a.rows, mean: meanOf(a), isClient: brandSig(b) === brandSig(client) };
    })
    // Scored brands first (by mean), then unscored ones — an unscored competitor stays visible
    // as a stated data gap rather than silently vanishing from the list (I.5 / I.6).
    .sort((x, y) => {
      if (x.mean === null && y.mean === null) return y.rows - x.rows;
      if (x.mean === null) return 1;
      if (y.mean === null) return -1;
      return y.mean - x.mean;
    });
  const clientEvalKey = Object.keys(evalScore).find((b) => brandSig(b) === brandSig(client));
  const clientEval = clientEvalKey ? evalScore[clientEvalKey] : null;
  const sentScoreClientTopics  = clientEval ? rollBuckets(clientEval.byTopic)    : [];
  const sentScoreClientEngines = clientEval ? rollBuckets(clientEval.byPlatform) : [];
  // Dates read chronologically, not by score — this is a time series, so re-sorting it by value
  // would destroy the only thing it is for.
  const sentScoreClientDates: SentScoreBucket[] = clientEval
    ? rollBuckets(clientEval.byDate).slice().sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    : [];
  const sentScoreOpen: SentScoreBucket | null = openAll.rows > 0
    ? { label: 'Open answers', n: openAll.n, rows: openAll.rows, mean: meanOf(openAll) }
    : null;
  const sentScoreOpenEngines = rollBuckets(openByPlatform);

  const domainsSorted = Object.keys(domainCount).sort((a, b) => domainCount[b] - domainCount[a]);
  const domains: DomainStat[] = domainsSorted.slice(0, 25).map((d) => {
    const dd = d.replace(/[^a-z0-9]/g, '');
    return {
      domain: d,
      count: domainCount[d],
      isClient: cRoot ? dd.indexOf(cRoot) !== -1 : false,
      isCompetitor: compRoots.some((r) => dd.indexOf(r) !== -1),
    };
  });

  const demandTopics: DemandTopic[] = Object.keys(demandTopicShare)
    .map((t) => ({ topic: t, share: Math.round(demandTopicShare[t] * 10) / 10, prompts: demandTopicCount[t] }))
    .sort((a, b) => b.share - a.share);
  // v7.416: the panel used to keep only the top 12 prompts, so a "load more" control would have
  // had nothing left to load. Store up to DEMAND_PROMPT_STORE_CAP rows — still a direct, unrounded
  // tally of the uploaded prompt-volume export (Const I.1) — and let the card page through them.
  // The card states plainly whenever the cap trimmed the list.
  const demandPrompts = demandPromptsArr.slice().sort((a, b) => b.share - a.share).slice(0, DEMAND_PROMPT_STORE_CAP);

  // ── Citation-landscape finalise ──
  const ownedDomainsSorted = Object.keys(ownedDomainCite).sort((a, b) => ownedDomainCite[b] - ownedDomainCite[a]);
  const citeOwnedDomain = ownedDomainsSorted[0] || '';
  let citeOwned = 0;
  ownedDomainsSorted.forEach((d) => { citeOwned += ownedDomainCite[d]; });
  const citeCompetition = citeCatCount['Competition'] || 0;
  const citeOwnedShare = citeTotal ? (100 * citeOwned) / citeTotal : 0;
  const citeCatMix: CiteCatStat[] = Object.keys(citeCatCount)
    .map((c) => ({ category: c, count: citeCatCount[c], pct: citeTotal ? (100 * citeCatCount[c]) / citeTotal : 0 }))
    .sort((a, b) => b.count - a.count);
  const earnedTargets: CiteDomain[] = Object.keys(earnedDomain)
    .map((h) => ({ hostname: h, count: earnedDomain[h] }))
    .sort((a, b) => b.count - a.count).slice(0, 10);
  const competitorCites: CiteDomain[] = Object.keys(compDomainCite)
    .map((h) => ({ hostname: h, count: compDomainCite[h] }))
    .sort((a, b) => b.count - a.count).slice(0, 10);
  const engineSourceMix: EngineSourceMix[] = Object.keys(engMix)
    .map((p) => ({ platform: p, total: engMix[p].total, earned: engMix[p].earned, competition: engMix[p].competition, owned: engMix[p].owned, other: engMix[p].other }))
    .sort((a, b) => b.total - a.total);
  const ownedKey = citeOwnedDomain.replace(/[^a-z0-9]/g, '');
  const citeMentionSources: MentionSource[] = Object.keys(mentionHost)
    .map((h) => ({ hostname: h, count: mentionHost[h], isClient: ownedKey.length > 0 && h.replace(/[^a-z0-9]/g, '').indexOf(ownedKey) !== -1 }))
    .sort((a, b) => b.count - a.count).slice(0, 10);
  const citeMentionByPlatform = Object.keys(mentionPlat)
    .map((p) => ({ platform: p, count: mentionPlat[p] }))
    .sort((a, b) => b.count - a.count);

  return {
    client, tracked: brandList, totalRuns, clientHits, engines, sov, overallTop, topics,
    promptN: promptKeys.length, coverage: coverageStat, gaps, clientPromptCount,
    sentBrands, mentionSent, clientThemes, totalCites, domains, domainTotalDistinct: domainsSorted.length,
    sentScoreCol: sentHasScoreCol, sentScoreRows: sentRowsSeen, sentScoreScored: sentRowsScored,
    sentScoreBrands, sentScoreClientTopics, sentScoreClientEngines, sentScoreClientDates,
    sentScoreOpen, sentScoreOpenEngines,
    clientDomainCites, demandTopics, demandPrompts, demandPromptTotal: demandPromptsArr.length,
    citeTotal, citeOwned, citeOwnedShare, citeOwnedDomain, citeCompetition, citeCatMix,
    earnedTargets, competitorCites, engineSourceMix, citeMentions, citeMentionSources, citeMentionByPlatform,
    slots, clientMatched, clientMatchScore, flagHits, hasFlagCol, notices,
    visRuns, visHits, visPromptN: Object.keys(visPrompts).length, visEngines,
    dateFrom, dateTo, dateDays: dateKeys.length, inventoryChanges,
    updatedAt: new Date().toISOString(),
  };
}

function netPct(pos: number, neg: number): number {
  const t = pos + neg; return t ? Math.round((100 * (pos - neg)) / t) : 0;
}

// ─── Small presentational helpers ───────────────────────────────────────────────
function fmt(n: number): string { return n.toLocaleString(); }

const SLOT_DEFS: Array<{ key: SlotKey; step: string; title: string; required?: boolean; file: string; desc: string }> = [
  { key: 'visibility', step: 'Step 1', title: 'Responses', required: true, file: 'visibility-with-citations.csv', desc: 'Per-engine answers · visibility runs' },
  { key: 'sentiment', step: 'Step 2', title: 'Sentiment', file: 'sentiment-with-citations.csv', desc: 'Sentiment claims by brand & theme' },
  { key: 'platforms', step: 'Step 3', title: 'Platforms & Citations', file: 'platforms-with_citations.csv', desc: 'Master file · citation sources' },
  { key: 'demand', step: 'Step 4', title: 'Prompt Volume', file: 'prompt-volume-report.csv', desc: 'Topic / prompt demand share' },
  { key: 'citations', step: 'Step 5', title: 'Citation Landscape', file: 'citations_data.csv', desc: 'Every cited source · category & brand mentions' },
];

function disp(b: string): string {
  const M: Record<string, string> = {
    Creative: 'Creative Planning', Edelman: 'Edelman Financial Engines', Fisher: 'Fisher Investments',
    Focus: 'Focus Financial', Mariner: 'Mariner', Hightower: 'Hightower', Mercera: 'Mercera',
  };
  return M[b] || b;
}

// ─── Component ───────────────────────────────────────────────────────────────────
interface Props { projectId: string; clientName?: string | null; }

export default function ProfoundVisibilitySection({ projectId, clientName }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [files, setFiles] = useState<FileMap>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parseErr, setParseErr] = useState<ProfoundParseError | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const inputRefs = {
    visibility: useRef<HTMLInputElement>(null),
    sentiment: useRef<HTMLInputElement>(null),
    platforms: useRef<HTMLInputElement>(null),
    demand: useRef<HTMLInputElement>(null),
    citations: useRef<HTMLInputElement>(null),
  } as const;

  const cName = (clientName || '').trim();

  useEffect(() => {
    let alive = true;
    (async () => {
      // v7.318: the project row (server) is the source of truth so the analysis is SHARED across
      // refreshes, devices, and users. Load it first; fall back to the local IndexedDB cache only
      // when the server has nothing yet — and when it does (a pre-v7.318 upload that only ever
      // lived in this browser), migrate it up to the server so every other user finally sees it.
      const fromServer = await serverLoad(projectId);
      if (alive && fromServer) {
        setMetrics(fromServer);
        void idbSave(projectId, fromServer);          // refresh the local cache
      } else {
        const fromIdb = await idbLoad(projectId);
        if (alive && fromIdb) {
          setMetrics(fromIdb);
          void serverSave(projectId, fromIdb);         // one-time migration into the shared store
        }
      }
      if (alive) setHydrated(true);
    })();
    return () => { alive = false; };
  }, [projectId]);

  async function runCompute(nextFiles: FileMap) {
    setError(null); setParseErr(null);
    setFiles(nextFiles);
    if (!nextFiles.visibility) {
      // Step 1 is the required file — with it gone there is nothing to compute (I.5).
      setMetrics(null);
      void serverDelete(projectId);
      void idbDelete(projectId);
      return;
    }
    try {
      const m = await computeAll(nextFiles, cName || 'client', setProgress);
      setMetrics(m);
      void serverSave(projectId, m);   // v7.318: persist to the shared project row (survives refresh + reaches other users)
      void idbSave(projectId, m);      // and the fast local cache
    } catch (e) {
      // v7.379: a schema mismatch is NOT a generic parse failure — surface the structured
      // diagnostic, and drop any previously-rendered metrics so a stale panel can never be
      // mistaken for the result of this upload.
      if (e instanceof ProfoundParseError) { setParseErr(e); setMetrics(null); }
      else setError('Could not parse that file — check it is the matching Profound export. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setProgress(null);
    }
  }

  async function onPick(slot: SlotKey, file: File | null) {
    if (!file) return;
    await runCompute({ ...files, [slot]: file });
  }

  // v7.379 (Wayne): clear ONE box and recompute from whatever remains.
  async function clearSlot(slot: SlotKey) {
    const nextFiles: FileMap = { ...files };
    delete nextFiles[slot];
    await runCompute(nextFiles);
  }

  function clearAll() {
    setMetrics(null); setFiles({}); setError(null); setParseErr(null);
    void serverDelete(projectId);   // v7.318: clear the shared store so it clears for everyone
    void idbDelete(projectId);
  }

  const hasData = !!metrics && metrics.totalRuns > 0;
  const trackedBrandLabel = metrics ? disp(metrics.client) : (cName || '—');

  return (
    <div className="text-orbit-secondary">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">AI Answer Engines</p>
          <h3 className="text-orbit-primary text-lg font-semibold mt-1">Profound AI Visibility</h3>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] bg-orbit-accent/10 border border-orbit-accent/30 text-orbit-accent px-2 py-0.5 rounded-full font-medium">
              Uploaded data · Profound
            </span>
            {metrics && (metrics.clientMatched !== false ? (
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 px-2 py-0.5 rounded-full font-medium">
                Client auto-identified: {trackedBrandLabel}
              </span>
            ) : (
              /* v7.379: the old badge said "auto-identified" even when the match FAILED and the
                 label was just the project name echoed back — which is precisely what made a
                 broken parse look like a real 0% result. Failure now reads as failure. */
              <span className="text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-500 px-2 py-0.5 rounded-full font-medium">
                Client NOT found in data: &ldquo;{trackedBrandLabel}&rdquo; matches no brand in this export
              </span>
            ))}
            {metrics && (
              <span className="text-orbit-tertiary text-[10px]">
                Updated {new Date(metrics.updatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        {metrics && (
          <button onClick={clearAll} className="text-orbit-tertiary hover:text-orbit-primary text-[11px] border border-orbit-border hover:border-orbit-accent/40 rounded-lg px-2.5 py-1">
            Clear data
          </button>
        )}
      </div>

      {/* 5 upload boxes */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        {SLOT_DEFS.map((s) => {
          const loaded = metrics?.slots[s.key];
          return (
            <div key={s.key} className="relative">
              <span className="absolute -top-2 left-3 z-10 text-[9px] font-semibold uppercase tracking-wider bg-orbit-accent text-white rounded px-1.5 py-0.5">{s.step}</span>
              {loaded && (
                /* v7.379 (Wayne): per-box clear — drop just this file and recompute from the rest,
                   instead of the all-or-nothing global "Clear data". */
                <button
                  type="button"
                  aria-label={`Clear ${s.title}`}
                  title={`Remove this file and recompute from the remaining steps`}
                  onClick={(e) => { e.stopPropagation(); void clearSlot(s.key); }}
                  className="absolute -top-2.5 right-2 z-10 flex items-center gap-1 rounded-full bg-orbit-surface border border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:border-rose-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider leading-none transition-colors"
                >
                  <span aria-hidden="true">×</span> Clear
                </button>
              )}
              <button
                onClick={() => inputRefs[s.key].current?.click()}
                className={`w-full text-left bg-orbit-surface border ${loaded ? 'border-emerald-500/40' : 'border-orbit-border'} hover:border-orbit-accent/40 rounded-xl p-4 pt-4 transition-colors`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-orbit-primary text-xs font-semibold">{s.title}</span>
                  {s.required && <span className="text-[9px] text-rose-500 font-bold uppercase tracking-wide">required</span>}
                </div>
                <p className="text-orbit-tertiary text-[10px] mt-1 font-mono truncate">{s.file}</p>
                <p className="text-orbit-tertiary text-[10px] mt-0.5 leading-snug">{s.desc}</p>
                <p className={`text-[10px] mt-2 font-medium ${loaded ? 'text-emerald-500' : 'text-orbit-secondary'}`}>
                  {loaded ? `✓ ${fmt(loaded.rows)} rows` : 'Click to upload'}
                </p>
              </button>
              <input
                ref={inputRefs[s.key]} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { onPick(s.key, e.target.files?.[0] || null); e.target.value = ''; }}
              />
            </div>
          );
        })}
      </div>

      <p className="text-orbit-tertiary text-[11px] mt-3 border-t border-orbit-border pt-3">
        Drop each Profound export into its box. The client is identified automatically by matching this project&apos;s name against the brands in the data — no client name is hardcoded. Computed results are saved to this project on the server, so they persist across refreshes and are available to anyone who opens this project — no re-upload needed.
      </p>

      {/* Progress */}
      {progress && (
        <div className="mt-4 bg-orbit-surface border border-orbit-border rounded-lg p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-orbit-secondary font-medium flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 border-2 border-orbit-accent border-t-transparent rounded-full animate-spin" />
              Parsing {progress.label}…
            </span>
            <span className="text-orbit-tertiary tabular-nums">
              {Math.round(progress.pct * 100)}% · {fmt(progress.rows)} rows
              {progress.pct > 0.02 ? ` · ~${Math.max(1, Math.round(((Date.now() - progress.startedAt) / progress.pct) * (1 - progress.pct) / 1000))}s left` : ''}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-orbit-muted rounded-full overflow-hidden">
            <div className="h-full bg-orbit-accent rounded-full transition-all" style={{ width: `${Math.round(progress.pct * 100)}%` }} />
          </div>
        </div>
      )}

      {/* v7.379 · structured parse diagnostic. A missing REQUIRED column used to sail through as
          an empty string and render a confident 0.00%; it now stops the compute and names the
          file, the field, every alias tried, and the header row actually found. */}
      {parseErr && (
        <div className="mt-4 bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 text-xs">
          <p className="text-rose-500 font-semibold">
            {parseErr.looksLike ? 'Wrong box — this file belongs in a different step' : 'Upload rejected — the export schema does not match'}
          </p>
          <p className="text-orbit-secondary mt-1">Dropped into {SLOT_FILE[parseErr.slot]}</p>
          {parseErr.looksLike && (
            <p className="text-amber-600 mt-1.5">
              Its columns match <span className="font-semibold">{SLOT_FILE[parseErr.looksLike]}</span> — drop it there instead, and put the{' '}
              <span className="font-mono">{(SLOT_DEFS.find((d) => d.key === parseErr.slot) || { file: '' }).file}</span> export in this box.
            </p>
          )}
          <ul className="mt-2 space-y-1.5">
            {parseErr.missing.map((mf) => (
              <li key={mf.field} className="text-orbit-secondary">
                <span className="text-rose-500 font-mono">{mf.field}</span>
                {mf.note ? <span className="text-orbit-tertiary"> — {mf.note}</span> : null}
                <div className="text-orbit-tertiary mt-0.5">
                  tried: <span className="font-mono">{mf.aliases.join(', ')}</span>
                </div>
              </li>
            ))}
          </ul>
          {parseErr.header.length > 0 && (
            <div className="mt-2 text-orbit-tertiary">
              columns found: <span className="font-mono break-all">{parseErr.header.slice(0, 30).join(', ')}{parseErr.header.length > 30 ? ` … (+${parseErr.header.length - 30})` : ''}</span>
            </div>
          )}
          <p className="text-orbit-tertiary mt-2">Nothing was computed or saved from this file, so no figure below is derived from a partial parse.</p>
        </div>
      )}

      {error && !parseErr && (
        <div className="mt-4 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-rose-500 text-xs">{error}</div>
      )}

      {/* v7.379 · non-fatal integrity notices (Const I.5 — an honest gap, stated on screen) */}
      {metrics && (metrics.notices || []).length > 0 && (
        <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1.5">
          {(metrics.notices || []).map((n, i) => (
            <p key={i} className="text-amber-600 text-[11px] leading-snug">{n}</p>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasData && !progress && hydrated && (
        <div className="mt-8 flex flex-col items-center text-center py-10">
          <div className="w-12 h-12 rounded-xl bg-orbit-accent/10 border border-orbit-accent/30 flex items-center justify-center text-orbit-accent text-xl">↑</div>
          <p className="text-orbit-secondary text-sm font-medium mt-3">Upload the Profound responses export to activate this panel</p>
          <p className="text-orbit-tertiary text-xs max-w-md mt-1">
            Start with the required <span className="font-mono">visibility-with-citations.csv</span> in Step 1. Add Sentiment, Platforms &amp; Citations, and Prompt Volume to unlock the full analysis.
          </p>
        </div>
      )}

      {/* Analysis */}
      {hasData && metrics && <Analysis m={metrics} />}
    </div>
  );
}

// ─── Analysis render ─────────────────────────────────────────────────────────────
function Analysis({ m }: { m: Metrics }) {
  // v7.380 · TWO denominators, each stated on screen and never mixed.
  //   STRICT  (`type == 'Visibility'`) = Profound's own Visibility Score denominator → the headline
  //           score + the per-engine chart, so both reconcile with the client's Profound dashboard.
  //   FULL    (every Visibility-typed answer, incl. the dual-purpose 'Sentiment, Visibility' rows)
  //           = the opportunity lens → topic whitespace, prompt gaps, coverage, Share of Voice.
  // Narrowing the opportunity views to the strict set would discard two-thirds of the real answers
  // the client could have won, so they deliberately keep the full footprint (Const I.6).
  // Metrics saved before v7.380 carry no strict tallies → fall back to the blended figure.
  const hasStrict = typeof m.visRuns === 'number' && m.visRuns > 0;
  const scoreRuns = hasStrict ? m.visRuns : m.totalRuns;
  const scoreHits = hasStrict ? m.visHits : m.clientHits;
  const visPct = scoreRuns ? (100 * scoreHits) / scoreRuns : 0;
  const scoreEngines = (hasStrict && (m.visEngines || []).length) ? m.visEngines : m.engines;
  const windowLabel = m.dateFrom && m.dateTo
    ? (m.dateFrom === m.dateTo ? m.dateFrom : `${m.dateFrom} – ${m.dateTo}`)
    : '';
  const enginesZero = scoreEngines.filter((e) => e.hits === 0).length;
  const topicsZero = m.topics.filter((t) => t.hits === 0).length;
  const sovRank = m.sov.findIndex((s) => s.isClient) + 1;
  const clientSent = m.sentBrands.find((s) => s.isClient);
  const clientNet = clientSent ? netPct(clientSent.pos, clientSent.neg) : null;
  const clientCov = m.coverage.find((c) => c.isClient);
  const topRival = m.coverage.find((c) => !c.isClient);
  // v7.315: client mention-level sentiment drives the "Sentiment of mentions" card
  // (in the slot the Net sentiment card used). Guarded for metrics saved by an earlier
  // version that has no mentionSent field → falls back to the claim-level Net sentiment.
  const cms = (m.mentionSent || []).find((x) => x.isClient);
  // ── v7.417 · sentiment_v2_score, read for render ────────────────────────────────────────
  // Every field is optional: metrics saved before v7.417 carry none of them and must keep
  // rendering exactly as they did. `?? null` / `|| []` throughout, never a non-null assertion.
  const ssBrands   = m.sentScoreBrands   || [];
  const ssTopics   = m.sentScoreClientTopics  || [];
  const ssEngines  = m.sentScoreClientEngines || [];
  const ssDates    = m.sentScoreClientDates   || [];
  const ssOpen     = m.sentScoreOpen ?? null;
  const ssClient   = ssBrands.find((b) => b.isClient) ?? null;
  const ssCoverage = (m.sentScoreCol && (m.sentScoreRows || 0) > 0)
    ? { scored: m.sentScoreScored || 0, rows: m.sentScoreRows || 0 }
    : null;
  // A brand with evaluation rows but no scored rows has mean === null. It is NOT rendered as 0 —
  // that would state "this brand is rated terribly" when the data says nothing at all (I.1/I.5).
  const ssHasClient = !!(ssClient && ssClient.mean !== null);
  const ssHasOpen   = !!(ssOpen && ssOpen.mean !== null);

  const cards: Array<{ k: string; v: string; tone: string; s: string; kind?: 'sentiment' }> = [
    { k: 'Overall AI visibility', v: visPct.toFixed(2) + '%', tone: 'text-rose-500', s: `${fmt(scoreHits)} of ${fmt(scoreRuns)} answers${hasStrict ? ' · Profound Visibility prompts' : ''}` },
  ];
  if (clientCov) cards.push({ k: 'Prompt coverage', v: `${clientCov.count} / ${m.promptN}`, tone: 'text-amber-500', s: `${clientCov.pct.toFixed(1)}% of all tested prompts` });
  if (sovRank > 0) cards.push({ k: 'Share-of-Voice rank', v: `#${sovRank} / ${m.sov.length}`, tone: 'text-amber-500', s: 'tracked brands' });
  if (scoreEngines.length) cards.push({ k: 'Engines at 0%', v: `${enginesZero} / ${scoreEngines.length}`, tone: 'text-rose-500', s: scoreEngines.filter((e) => e.hits === 0).map((e) => e.platform).slice(0, 3).join(' · ') || 'none' });
  if (m.topics.length) cards.push({ k: 'Topics at 0%', v: `${topicsZero} / ${m.topics.length}`, tone: 'text-amber-500', s: 'no presence at all' });
  if (clientNet !== null) cards.push({ k: 'Net sentiment', v: (clientNet > 0 ? '+' : '') + clientNet, tone: clientNet >= 0 ? 'text-emerald-500' : 'text-rose-500', s: `of ${fmt((clientSent as SentBrand).pos + (clientSent as SentBrand).neg)} claims`, kind: 'sentiment' });
  // v7.417 — the two sentiment_v2_score populations get two cards and are never averaged into
  // one. Direct evaluation ("Evaluate <Brand> on <topic>") invites critique; an open answer that
  // merely lists the brand does not. On Wayne's export they read 0.55 and 0.95 — a single blended
  // figure would describe neither. Each card states its own row count so the reader can weigh it.
  if (ssHasClient) cards.push({ k: 'Sentiment · direct evaluation', v: (ssClient!.mean as number).toFixed(2), tone: 'text-orbit-accent', s: `${fmt(ssClient!.n)} of ${fmt(ssClient!.rows)} scored · 0–1 scale` });
  if (ssHasOpen) cards.push({ k: 'Sentiment · open answers', v: (ssOpen!.mean as number).toFixed(2), tone: 'text-orbit-accent', s: `${fmt(ssOpen!.n)} scored rows · 0–1 scale` });
  if (topRival) cards.push({ k: 'Top rival in prompts', v: topRival.pct.toFixed(0) + '%', tone: 'text-orbit-accent', s: `${disp(topRival.brand)} (${topRival.count}/${m.promptN})` });
  if (m.totalCites > 0) cards.push({ k: 'Citations analysed', v: fmt(m.totalCites), tone: 'text-orbit-accent', s: `${fmt(m.clientDomainCites)} from client domain` });
  if ((m.citeTotal || 0) > 0) cards.push({ k: 'Owned citation share', v: m.citeOwnedShare.toFixed(1) + '%', tone: 'text-rose-500', s: `${fmt(m.citeOwned)} of ${fmt(m.citeTotal)} cited sources` });

  const maxSov = Math.max(1, ...m.sov.map((s) => s.count));
  const maxCov = Math.max(1, ...m.coverage.map((c) => c.count));
  const maxDom = Math.max(1, ...m.domains.map((d) => d.count));
  const maxDemand = Math.max(1, ...m.demandPrompts.map((d) => d.share));
  const maxThemeAbs = Math.max(1, ...m.clientThemes.map((t) => Math.abs(netPct(t.pos, t.neg))));
  const maxBrandAbs = Math.max(1, ...m.sentBrands.map((t) => Math.abs(netPct(t.pos, t.neg))));

  // v7.366: insight sentences (A3 shadow competitor · A4 earned-media fast path) —
  // pure rules over the SAME uploaded-Profound tallies the cards below render
  // (Const II.6); every count is a direct row tally (I.1); null → nothing (I.5).
  const _updated = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : undefined;
  const _earned  = m.citeCatMix.find((c) => c.category.toLowerCase().includes('earned'));
  const _insights = [
    shadowCompetitorInsight({
      rival: topRival ? { brand: disp(topRival.brand), count: topRival.count, pct: topRival.pct } : null,
      client: clientCov ? { count: clientCov.count, pct: clientCov.pct } : null,
      promptN: m.promptN,
      updatedAt: _updated,
    }),
    earnedFastPathInsight({
      citeTotal: m.citeTotal || 0,
      citeOwned: m.citeOwned || 0,
      citeOwnedShare: m.citeOwnedShare || 0,
      earnedShare: _earned ? _earned.pct : 0,
      mentionHosts: (m.citeMentionSources || []).filter((h) => !h.isClient),
      citeMentions: m.citeMentions || 0,
      updatedAt: _updated,
    }),
  ];

  return (
    <div className="mt-6 space-y-6">
      <InsightStack insights={_insights} />
      {/* Summary cards */}
      {/* v7.380 · coverage window + which prompt set the headline score uses. Stated up front so
          the score is never read against the wrong denominator or the wrong date range. */}
      {(windowLabel || hasStrict) && (
        <p className="text-orbit-tertiary text-[11px] mb-3">
          {windowLabel ? <>Data covers <span className="text-orbit-secondary">{windowLabel}</span>{m.dateDays > 1 ? ` (${m.dateDays} days)` : ''}. </> : null}
          {hasStrict ? <>Headline score and per-engine chart use Profound&apos;s Visibility prompt set (<span className="text-orbit-secondary">{fmt(m.visRuns)}</span> answers · {m.visPromptN} prompts), so they reconcile with the Profound dashboard. Topic whitespace, prompt gaps and Share of Voice use all <span className="text-orbit-secondary">{fmt(m.totalRuns)}</span> tested answers ({m.promptN} prompts).</> : null}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          c.kind === 'sentiment' && cms && cms.total > 0 ? (
            <div key={c.k} className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-1">
              <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">Sentiment of mentions</span>
              <div className="mt-1.5 space-y-1.5">
                {([
                  { icon: '👍', v: cms.pos, bar: 'bg-emerald-500' },
                  { icon: '⊖', v: cms.neutral, bar: 'bg-slate-400' },
                  { icon: '👎', v: cms.neg, bar: 'bg-rose-500' },
                ]).map((r, i) => {
                  const pct = cms.total ? Math.round((100 * r.v) / cms.total) : 0;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-4 text-center text-sm leading-none">{r.icon}</span>
                      <div className="flex-1 h-2 bg-orbit-muted rounded-full overflow-hidden"><div className={`h-full ${r.bar} rounded-full`} style={{ width: `${pct}%` }} /></div>
                      <span className="w-16 text-right text-orbit-secondary text-[11px] tabular-nums">{fmt(r.v)} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
              <span className="text-orbit-tertiary text-[10px] mt-1.5">{fmt(cms.total)} mentions assessed</span>
            </div>
          ) : (
            <div key={c.k} className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-1">
              <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">{c.k}</span>
              <span className={`text-2xl font-bold tabular-nums ${c.tone}`}>{c.v}</span>
              <span className="text-orbit-tertiary text-[10px]">{c.s}</span>
            </div>
          )
        ))}
      </div>

      {/* Visibility by engine + SoV */}
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="AI visibility by engine" sub={hasStrict ? `% of Profound Visibility answers where the client appears (${fmt(m.visRuns)} answers · ${m.visPromptN} prompts)` : '% of competitive answers where the client appears, per engine'}>
          {scoreEngines.map((e) => {
            const pct = e.runs ? (100 * e.hits) / e.runs : 0;
            return <Bar key={e.platform} label={e.platform} valueLabel={`${pct.toFixed(1)}%`} frac={pct / Math.max(1, Math.max(...scoreEngines.map((x) => (x.runs ? (100 * x.hits) / x.runs : 0)), 1))} color={e.hits === 0 ? 'bg-orbit-muted' : 'bg-indigo-500'} sub={`${e.hits}/${e.runs}`} />;
          })}
        </Panel>
        <Panel title="Share of Voice — tracked brands" sub={`% of ALL ${fmt(m.totalRuns)} tested answers mentioning each tracked firm`}>
          {m.sov.map((s) => (
            <Bar key={s.brand} label={disp(s.brand)} valueLabel={`${s.pct.toFixed(2)}%`} frac={s.count / maxSov} color={s.isClient ? 'bg-emerald-500' : 'bg-indigo-500'} sub={`${s.count}`} highlight={s.isClient} />
          ))}
          {m.overallTop.length > 0 && (
            <p className="text-orbit-tertiary text-[10px] mt-2 leading-snug">
              Market leaders across all answers: {m.overallTop.slice(0, 3).map((b) => `${b.brand} ${b.pct.toFixed(1)}%`).join(' · ')}. Tracked firms sit below these.
            </p>
          )}
        </Panel>
      </div>

      {/* Topics */}
      <Panel title={`Topic visibility — ${topicsZero} of ${m.topics.length} topics at 0%`} sub={`Client visibility % across every topic, over ALL ${fmt(m.totalRuns)} tested answers (sorted; 0% = whitespace opportunity)`}>
        <div className="space-y-1">
          {m.topics.map((t) => {
            const pct = t.runs ? (100 * t.hits) / t.runs : 0;
            return <Bar key={t.topic} label={t.topic} valueLabel={`${pct.toFixed(1)}%`} frac={pct / Math.max(1, Math.max(...m.topics.map((x) => (x.runs ? (100 * x.hits) / x.runs : 0)), 1))} color={pct === 0 ? 'bg-rose-500/50' : pct < 3 ? 'bg-amber-500' : 'bg-indigo-500'} sub={`${t.hits}/${t.runs}`} small />;
          })}
        </div>
      </Panel>

      {/* Prompts */}
      <p className="text-orbit-primary text-sm font-semibold pt-1">Prompt visibility &amp; demand</p>
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Prompt coverage vs competitors" sub={`Distinct prompts (of ${m.promptN}) where each firm appears at least once`}>
          {m.coverage.map((c) => (
            <Bar key={c.brand} label={disp(c.brand)} valueLabel={`${c.count} (${c.pct.toFixed(1)}%)`} frac={c.count / maxCov} color={c.isClient ? 'bg-emerald-500' : 'bg-indigo-500'} highlight={c.isClient} />
          ))}
        </Panel>
        {m.demandPrompts.length > 0 ? (
          <Panel
            title="Search demand — top prompts"
            sub={`Highest-volume questions buyers ask (of ${fmt(m.demandPromptTotal)} prompts; share of volume)`}
            action={<CopyButton label="Copy every prompt in this card (tab-separated)" text={demandPromptsTsv(m.demandPrompts)} />}
          >
            <DemandPromptList prompts={m.demandPrompts} total={m.demandPromptTotal} max={maxDemand} />
          </Panel>
        ) : (
          <Panel title="Search demand — top prompts" sub="Upload prompt-volume-report.csv (Step 4) to unlock demand">
            <p className="text-orbit-tertiary text-xs italic">No prompt-volume export loaded yet.</p>
          </Panel>
        )}
      </div>

      {/* Winnable prompts */}
      {m.gaps.length > 0 && (
        <Panel title={`Winnable prompts — ${m.gaps.length} where competitors appear and the client does not`} sub="Highest-leverage prompts: rivals are cited, the client is not. Target these with content + citations.">
          <div className="max-h-80 overflow-y-auto -mx-1 px-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-orbit-tertiary text-[10px] uppercase tracking-wide">
                  <th className="text-left font-medium py-1.5 pr-2">Prompt</th>
                  <th className="text-left font-medium py-1.5 pr-2">Topic</th>
                  <th className="text-left font-medium py-1.5 pr-2">Leading competitor</th>
                  <th className="text-right font-medium py-1.5">Rival mentions</th>
                </tr>
              </thead>
              <tbody>
                {m.gaps.map((g, i) => (
                  <tr key={i} className="border-t border-orbit-border">
                    <td className="py-1.5 pr-2 text-orbit-secondary">{g.prompt}</td>
                    <td className="py-1.5 pr-2"><span className="text-[10px] text-orbit-accent bg-orbit-accent/10 border border-orbit-accent/20 rounded px-1.5 py-0.5">{g.topic}</span></td>
                    <td className="py-1.5 pr-2 text-amber-500 font-medium">{disp(g.leader)} <span className="text-orbit-tertiary">·{g.leaderCount}</span></td>
                    <td className="py-1.5 text-right text-orbit-tertiary tabular-nums">{g.rivalMentions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* v7.417 — Sentiment score (Profound `sentiment_v2_score`) ─────────────────────────
          Renders whenever the current export carries the column. Independent of the claim-level
          section below, which still renders for an export (or a saved analysis) that has
          `sentiment_claims`; an export carrying BOTH shows both. The bars are drawn against the
          FIXED 0–1 scale rather than rescaled to the highest bucket, so a set of similar means
          reads as similar rather than being stretched into a false spread. */}
      {ssCoverage && (ssHasClient || ssHasOpen || ssBrands.length > 0) && (
        <>
          <p className="text-orbit-primary text-sm font-semibold pt-1">Sentiment score</p>
          <p className="text-orbit-tertiary text-[11px] -mt-3 leading-snug">
            Profound&apos;s <span className="text-orbit-secondary">sentiment_v2_score</span> (0–1), a direct read of the
            export column — <span className="text-orbit-secondary">{fmt(ssCoverage.scored)}</span> of {fmt(ssCoverage.rows)} rows
            in the Sentiment file carry a score ({((100 * ssCoverage.scored) / Math.max(1, ssCoverage.rows)).toFixed(1)}%).
            Profound does not define the scale in the file, so it is shown as the score it is, never converted to a
            percentage or a claim count. Direct-evaluation and open-answer rows are two different populations and are
            never averaged together.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Score coverage by brand" sub="Direct-evaluation rows scored, per brand — how much of this metric each brand actually has">
              {ssBrands.map((b) => (
                <Bar
                  key={b.brand}
                  label={disp(b.brand)}
                  valueLabel={b.mean === null ? '—' : b.mean.toFixed(2)}
                  frac={b.mean === null ? 0 : b.mean}
                  color={b.mean === null ? 'bg-orbit-muted' : b.isClient ? 'bg-emerald-500' : 'bg-indigo-500'}
                  sub={b.mean === null ? `0 of ${b.rows} scored` : `${b.n}/${b.rows}`}
                  highlight={b.isClient}
                  small
                />
              ))}
              <p className="text-orbit-tertiary text-[10px] mt-2 leading-snug">
                A brand with no scored rows shows &ldquo;—&rdquo;, not 0 — the export scored none of its rows, which is an
                absence of data rather than a poor score. Competitor sentiment is not comparable from this export.
              </p>
            </Panel>
            {ssTopics.length > 0 && (
              <Panel title="Client sentiment by topic" sub="Direct-evaluation prompts, grouped by the topic asked about (0–1)">
                {ssTopics.map((t) => (
                  <Bar
                    key={t.label}
                    label={t.label}
                    valueLabel={t.mean === null ? '—' : t.mean.toFixed(2)}
                    frac={t.mean === null ? 0 : t.mean}
                    color={t.mean === null ? 'bg-orbit-muted' : 'bg-indigo-500'}
                    sub={`${t.n}/${t.rows}`}
                    small
                  />
                ))}
              </Panel>
            )}
          </div>
          {(ssEngines.length > 0 || ssDates.length > 1) && (
            <div className="grid md:grid-cols-2 gap-4">
              {ssEngines.length > 0 && (
                <Panel title="Client sentiment by engine" sub="Direct-evaluation prompts, per AI engine (0–1)">
                  {ssEngines.map((e) => (
                    <Bar
                      key={e.label}
                      label={e.label}
                      valueLabel={e.mean === null ? '—' : e.mean.toFixed(2)}
                      frac={e.mean === null ? 0 : e.mean}
                      color={e.mean === null ? 'bg-orbit-muted' : 'bg-indigo-500'}
                      sub={`${e.n}/${e.rows}`}
                      small
                    />
                  ))}
                </Panel>
              )}
              {ssDates.length > 1 && (
                <Panel title="Client sentiment by run date" sub="Direct-evaluation prompts, in date order (0–1)">
                  {ssDates.map((d) => (
                    <Bar
                      key={d.label}
                      label={d.label}
                      valueLabel={d.mean === null ? '—' : d.mean.toFixed(2)}
                      frac={d.mean === null ? 0 : d.mean}
                      color={d.mean === null ? 'bg-orbit-muted' : 'bg-indigo-500'}
                      sub={`${d.n}/${d.rows}`}
                      small
                    />
                  ))}
                  <p className="text-orbit-tertiary text-[10px] mt-2 leading-snug">
                    {ssDates.length} run date{ssDates.length === 1 ? '' : 's'} — too short a series to read as a trend.
                  </p>
                </Panel>
              )}
            </div>
          )}
        </>
      )}

      {/* Sentiment */}
      {m.sentBrands.length > 0 && (
        <>
          <p className="text-orbit-primary text-sm font-semibold pt-1">Sentiment</p>
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Net sentiment by brand" sub="Positive − Negative share of sentiment claims (client highlighted)">
              {m.sentBrands.map((s) => (
                <Diverge key={s.brand} label={disp(s.brand)} net={netPct(s.pos, s.neg)} maxAbs={maxBrandAbs} highlight={s.isClient} sub={`+${s.pos}/-${s.neg}`} />
              ))}
            </Panel>
            {m.clientThemes.length > 0 && (
              <Panel title="Client sentiment by theme" sub="Where AI engines praise vs criticise the client">
                {m.clientThemes.map((t) => (
                  <Diverge key={t.theme} label={t.theme} net={netPct(t.pos, t.neg)} maxAbs={maxThemeAbs} sub={`+${t.pos}/-${t.neg}`} />
                ))}
              </Panel>
            )}
          </div>
        </>
      )}

      {/* Citations */}
      {m.domains.length > 0 && (
        <>
          <p className="text-orbit-primary text-sm font-semibold pt-1">Citations</p>
          <Panel title={`Top cited sources — ${fmt(m.domains.length)} of ${fmt(m.domainTotalDistinct)} domains`} sub="Domains the engines cite most (green = client, purple = competitor-owned). The citation battleground.">
            {m.domains.map((d) => (
              <Bar key={d.domain} label={d.domain} valueLabel={fmt(d.count)} frac={d.count / maxDom} color={d.isClient ? 'bg-emerald-500' : d.isCompetitor ? 'bg-violet-400' : 'bg-indigo-500'} highlight={d.isClient} small />
            ))}
            <p className="text-orbit-tertiary text-[10px] mt-2 leading-snug">
              Third-party authority sites drive a large share of citations — earned mentions there move visibility. The client domain has {fmt(m.clientDomainCites)} citations.
            </p>
          </Panel>
        </>
      )}

      {/* Step 5 — Citation Landscape (citations_data.csv) */}
      {(m.citeTotal || 0) > 0 && (
        <>
          <p className="text-orbit-primary text-sm font-semibold pt-1">Citation Landscape</p>
          <p className="text-orbit-tertiary text-[11px] -mt-3 leading-snug">
            The source supply chain behind the answers — every cited URL across {fmt(m.citeTotal)} citations, classified by Profound.{m.citeOwnedDomain ? ` Owned = ${m.citeOwnedDomain}.` : ''}
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Owned vs competitor citation gap" sub="Share of all cited sources by ownership — the core GEO opportunity">
              {m.citeCatMix.map((c) => (
                <Bar key={c.category} label={c.category} valueLabel={`${c.pct.toFixed(1)}%`} frac={c.count / Math.max(1, ...m.citeCatMix.map((x) => x.count))} color={catColor(c.category)} sub={fmt(c.count)} highlight={c.category.toLowerCase() === 'owned'} small />
              ))}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-orbit-tertiary">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />Owned</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" />Earned</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" />Competition</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-400" />Social</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500" />Institution</span>
              </div>
              <p className="text-orbit-tertiary text-[10px] mt-2 leading-snug">
                Owned {m.citeOwnedShare.toFixed(1)}% ({fmt(m.citeOwned)}) vs Competition {m.citeTotal ? ((100 * m.citeCompetition) / m.citeTotal).toFixed(1) : '0'}% ({fmt(m.citeCompetition)}). Closing this gap is the GEO program in one number.
              </p>
            </Panel>

            <Panel title="Source mix by engine" sub="How each AI engine sources answers — earned vs competition vs owned vs other">
              {m.engineSourceMix.map((e) => (
                <StackBar
                  key={e.platform}
                  label={e.platform}
                  sub={`${e.total ? Math.round((100 * e.earned) / e.total) : 0}% earned`}
                  segs={[
                    { frac: e.total ? e.earned / e.total : 0, color: 'bg-indigo-500' },
                    { frac: e.total ? e.competition / e.total : 0, color: 'bg-amber-500' },
                    { frac: e.total ? e.owned / e.total : 0, color: 'bg-emerald-500' },
                    { frac: e.total ? e.other / e.total : 0, color: 'bg-orbit-muted' },
                  ]}
                />
              ))}
              <p className="text-orbit-tertiary text-[10px] mt-2 leading-snug">
                Engines leaning earned reward PR/placements; engines leaning &quot;other&quot; reward broad authority. Bars: earned · competition · owned · other.
              </p>
            </Panel>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="Earned-media targets" sub="Third-party domains AI trusts most — the placement hit-list">
              {m.earnedTargets.length > 0 ? m.earnedTargets.map((d) => (
                <Bar key={d.hostname} label={d.hostname} valueLabel={fmt(d.count)} frac={d.count / Math.max(1, ...m.earnedTargets.map((x) => x.count))} color="bg-indigo-500" small />
              )) : <p className="text-orbit-tertiary text-xs italic">No earned-media citations in this export.</p>}
            </Panel>

            <Panel title="Competitor citation dominance" sub="Rival-owned domains cited inside AI answers">
              {m.competitorCites.length > 0 ? m.competitorCites.map((d) => (
                <Bar key={d.hostname} label={d.hostname} valueLabel={fmt(d.count)} frac={d.count / Math.max(1, ...m.competitorCites.map((x) => x.count))} color="bg-amber-500" small />
              )) : <p className="text-orbit-tertiary text-xs italic">No competitor-owned citations in this export.</p>}
            </Panel>
          </div>

          {m.citeMentions > 0 && (
            <Panel title={`Brand-mention surface — ${fmt(m.citeMentions)} citations name the client`} sub="The third-party pages where the client is actually mentioned inside cited sources">
              {m.citeMentionSources.map((d) => (
                <Bar key={d.hostname} label={d.hostname} valueLabel={fmt(d.count)} frac={d.count / Math.max(1, ...m.citeMentionSources.map((x) => x.count))} color={d.isClient ? 'bg-emerald-500' : 'bg-indigo-500'} highlight={d.isClient} small />
              ))}
              {m.citeMentionByPlatform.length > 0 && (
                <p className="text-orbit-tertiary text-[10px] mt-2 leading-snug">
                  By engine: {m.citeMentionByPlatform.map((p) => `${p.platform} ${p.count}`).join(' · ')}.
                </p>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

// ─── Chart primitives (CSS bars; theme-safe via orbit-* + 500/600 shades) ─────────
// v7.416: `action` renders in the card's top-right corner (used for the demand copy button).
// Panels that pass no action keep exactly the markup they had before.
function Panel({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-xl p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-orbit-primary text-sm font-semibold">{title}</p>
          {sub && <p className="text-orbit-tertiary text-[11px] mt-0.5 mb-3">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// ─── v7.416 — copy-to-clipboard control ──────────────────────────────────────────
// Inline SVG, not a glyph font: the icon must render wherever this markup lands.

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);
  const tone = state === 'ok'
    ? 'border-emerald-500/50 text-emerald-500'
    : state === 'err'
      ? 'border-rose-500/50 text-rose-500'
      : 'border-orbit-border text-orbit-tertiary hover:text-orbit-primary hover:border-orbit-accent';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async () => { setState((await copyTextToClipboard(text)) ? 'ok' : 'err'); }}
      className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium leading-none transition-colors ${tone}`}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {state === 'ok'
          ? <polyline points="20 6 9 17 4 12" />
          : <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
      </svg>
      {state !== 'idle' && <span>{state === 'ok' ? 'Copied' : 'Copy failed'}</span>}
    </button>
  );
}

// ─── v7.416 — demand prompts: full text, paged, copyable ─────────────────────────
// The old row was a <Bar>, whose fixed-width label truncated every prompt to ~40px of
// text. Prompts are whole sentences, so the text now owns a full-width wrapping line
// and the bar sits beneath it. Nothing here rounds or reweights a share — the values
// are the export's own, exactly as parsed (Const I.1).

export function demandPromptsTsv(prompts: DemandPrompt[]): string {
  return ['Rank\tPrompt\tShare of volume\tTopic']
    .concat(prompts.map((d, i) => `${i + 1}\t${d.prompt}\t${d.share}%\t${d.topic}`))
    .join('\n');
}

export function DemandPromptList({ prompts, total, max }: { prompts: DemandPrompt[]; total: number; max: number }) {
  const [shown, setShown] = useState(DEMAND_PROMPT_PAGE);
  const visible = prompts.slice(0, shown);
  const more = Math.min(DEMAND_PROMPT_PAGE, prompts.length - visible.length);
  const btn = 'rounded-md border border-orbit-border px-2 py-1 text-[10px] font-medium text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent transition-colors';
  return (
    <>
      {/* No nested scroller. Paging is what bounds this card's height; a second scroll context
          inside it clipped a row mid-sentence, which is the exact defect this release fixes.
          Const IV.1 — one working vertical scroller, which here is the page's. */}
      <div data-oiq-demand-rows>
        {visible.map((d, i) => (
          <div key={`${i}-${d.prompt}`} className="py-2 border-t border-orbit-border first:border-t-0">
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-5 text-orbit-tertiary text-[10px] tabular-nums">{i + 1}.</span>
              <p className="flex-1 min-w-0 text-orbit-secondary text-[11px] leading-snug break-words">{d.prompt}</p>
              <span className="shrink-0 text-orbit-primary text-[11px] font-medium tabular-nums">{d.share}%</span>
            </div>
            <div className="flex items-center gap-2 mt-1 pl-7">
              <div className="flex-1 h-2 bg-orbit-muted rounded overflow-hidden">
                <div className="h-full bg-violet-400 rounded" style={{ width: `${Math.max(1.5, Math.min(100, (d.share / max) * 100))}%` }} />
              </div>
              {d.topic && <span className="shrink-0 max-w-[8rem] truncate text-orbit-tertiary text-[10px]" title={d.topic}>{d.topic}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-orbit-border">
        <span className="text-orbit-tertiary text-[10px]">
          Showing {visible.length} of {prompts.length}
          {total > prompts.length ? ` (this card holds the top ${prompts.length} of ${total} by share)` : ''}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {visible.length > DEMAND_PROMPT_PAGE && (
            <button type="button" className={btn} onClick={() => setShown(DEMAND_PROMPT_PAGE)}>Show less</button>
          )}
          {more > 0 && (
            <button type="button" className={btn} onClick={() => setShown((s) => s + DEMAND_PROMPT_PAGE)}>Show {more} more</button>
          )}
        </div>
      </div>
    </>
  );
}

function Bar({ label, valueLabel, frac, color, sub, highlight, small }: {
  label: string; valueLabel?: string; frac: number; color: string; sub?: string; highlight?: boolean; small?: boolean;
}) {
  const w = Math.max(1.5, Math.min(100, frac * 100));
  return (
    <div className="flex items-center gap-2">
      <div className={`${small ? 'w-40' : 'w-44'} shrink-0 truncate ${highlight ? 'text-orbit-primary font-medium' : 'text-orbit-secondary'} text-[11px]`} title={label}>{label}</div>
      <div className="flex-1 h-3.5 bg-orbit-muted rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${w}%` }} />
      </div>
      <div className="w-24 shrink-0 text-right text-orbit-secondary text-[11px] tabular-nums">
        {valueLabel}{sub ? <span className="text-orbit-tertiary"> · {sub}</span> : ''}
      </div>
    </div>
  );
}

function Diverge({ label, net, maxAbs, highlight, sub }: { label: string; net: number; maxAbs: number; highlight?: boolean; sub?: string }) {
  const w = Math.min(50, (Math.abs(net) / maxAbs) * 50);
  return (
    <div className="flex items-center gap-2">
      <div className={`w-44 shrink-0 truncate ${highlight ? 'text-orbit-primary font-medium' : 'text-orbit-secondary'} text-[11px]`} title={label}>{label}</div>
      <div className="flex-1 h-3.5 bg-orbit-muted rounded relative overflow-hidden">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-orbit-border" />
        {net >= 0 ? (
          <div className={`absolute top-0 bottom-0 left-1/2 ${highlight ? 'bg-emerald-500' : 'bg-indigo-500'} rounded-r`} style={{ width: `${w}%` }} />
        ) : (
          <div className="absolute top-0 bottom-0 bg-rose-500 rounded-l" style={{ right: '50%', width: `${w}%` }} />
        )}
      </div>
      <div className="w-24 shrink-0 text-right text-orbit-secondary text-[11px] tabular-nums">
        {net > 0 ? '+' : ''}{net}{sub ? <span className="text-orbit-tertiary"> · {sub}</span> : ''}
      </div>
    </div>
  );
}

// ─── Step 5 helpers — category colour map + stacked source-mix bar (theme-safe) ──
function catColor(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'owned': return 'bg-emerald-500';
    case 'earned media': return 'bg-indigo-500';
    case 'competition': return 'bg-amber-500';
    case 'social': return 'bg-violet-400';
    case 'institution': return 'bg-sky-500';
    case 'pr wire': return 'bg-rose-400';
    default: return 'bg-orbit-muted';
  }
}

function StackBar({ label, segs, sub }: { label: string; segs: Array<{ frac: number; color: string }>; sub?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-40 shrink-0 truncate text-orbit-secondary text-[11px]" title={label}>{label}</div>
      <div className="flex-1 h-3.5 bg-orbit-muted rounded overflow-hidden flex">
        {segs.map((s, i) => (
          <div key={i} className={`h-full ${s.color}`} style={{ width: `${Math.max(0, Math.min(100, s.frac * 100))}%` }} />
        ))}
      </div>
      <div className="w-24 shrink-0 text-right text-orbit-secondary text-[11px] tabular-nums">{sub}</div>
    </div>
  );
}
