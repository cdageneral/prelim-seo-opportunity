'use client';

/*
 * ProfoundVisibilitySection (v7.314)
 * ----------------------------------
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

// ─── Types ─────────────────────────────────────────────────────────────────────
type SlotKey = 'visibility' | 'sentiment' | 'platforms' | 'demand';

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
interface SentBrand { brand: string; pos: number; neg: number; isClient: boolean; }
interface MentionSent { brand: string; pos: number; neutral: number; neg: number; total: number; isClient: boolean; }

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
  totalCites: number;
  domains: DomainStat[];
  domainTotalDistinct: number;
  clientDomainCites: number;
  demandTopics: DemandTopic[];
  demandPrompts: DemandPrompt[];
  demandPromptTotal: number;
  slots: SlotMap;
  updatedAt: string;
}

// ─── Brand normalisation + matching ─────────────────────────────────────────────
// NOTE: "wealth" is intentionally NOT a suffix — it is part of real brand names.
const SUFFIXES = new Set<string>([
  'group', 'financial', 'engines', 'investments', 'advisors', 'advisory', 'planning',
  'llc', 'inc', 'llp', 'management', 'capital', 'partners', 'co', 'company', 'the',
]);

function toks(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !SUFFIXES.has(t));
}

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

function matchClient(clientName: string, candidates: string[]): string | null {
  const ct = new Set(toks(clientName));
  if (ct.size === 0) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (let i = 0; i < candidates.length; i++) {
    const at = toks(candidates[i]);
    let overlap = 0;
    for (let k = 0; k < at.length; k++) { if (ct.has(at[k])) overlap++; }
    if (overlap > bestScore) { bestScore = overlap; best = candidates[i]; }
  }
  return bestScore > 0 ? best : null;
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

function headerIndex(header: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    const key = (header[i] || '').replace(/^﻿/, '').trim().toLowerCase();
    if (key && !(key in m)) m[key] = i;
  }
  return m;
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

// ─── Compute all metrics from the currently-loaded files ────────────────────────
type FileMap = Partial<Record<SlotKey, File>>;

interface Progress { label: string; pct: number; rows: number; startedAt: number; }

async function computeAll(
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
  if (files.sentiment) {
    let H: Record<string, number> = {};
    const f = files.sentiment;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) { H = headerIndex(row); return; }
      const sc = row[H['sentiment_claims']];
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
  // capture each visibility row's mentions for pass-2 by re-streaming (files stay in memory)
  if (files.visibility) {
    let H: Record<string, number> = {};
    const f = files.visibility;
    await streamCsv(f, (row, idx) => {
      if (idx === 0) { H = headerIndex(row); return; }
      const type = row[H['type']] || '';
      const ev = /^Evaluate (.+?) on /.exec(row[H['prompt']] || '');
      if (ev) evalSubjects[ev[1].trim()] = true;
      if (type.indexOf('Visibility') === -1) return;
      totalRuns++;
      const plat = row[H['platform']] || '';
      const topic = row[H['topic']] || '';
      const prompt = (row[H['prompt']] || '').trim();
      platRuns[plat] = (platRuns[plat] || 0) + 1;
      topicRuns[topic] = (topicRuns[topic] || 0) + 1;
      if (!promptInfo[prompt]) promptInfo[prompt] = { topic, runs: 0 };
      promptInfo[prompt].runs++;
      const seen: Record<string, boolean> = {};
      const ms = splitMentions(row[H['normalized_mentions']] || '');
      for (let k = 0; k < ms.length; k++) { if (!seen[ms[k]]) { seen[ms[k]] = true; overallRaw[ms[k]] = (overallRaw[ms[k]] || 0) + 1; } }
    }, (pct, r) => setProgress({ label: 'Responses', pct, rows: r, startedAt }));
  }

  // ── Determine client + tracked roster (no hardcoding) ──
  const rosterFromData = Object.keys(assets).length > 0
    ? Object.keys(assets)
    : Object.keys(evalSubjects);
  let tracked: string[] = rosterFromData.slice();
  let client = matchClient(clientName, tracked.length ? tracked : Object.keys(overallRaw)) || clientName.trim();
  if (tracked.length === 0) {
    // No roster in the data → derive a competitive set from the most-mentioned brands.
    const top = Object.keys(overallRaw).sort((a, b) => overallRaw[b] - overallRaw[a]);
    const picked: string[] = [];
    for (let i = 0; i < top.length && picked.length < 7; i++) {
      if (toks(top[i]).join(' ') !== toks(client).join(' ')) picked.push(top[i]);
    }
    tracked = [client].concat(picked);
  } else if (!tracked.some((b) => toks(b).join(' ') === toks(client).join(' '))) {
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
  const platClient: Record<string, number> = {};
  const topicClient: Record<string, number> = {};
  brandList.forEach((b) => { trackedOverall[b] = 0; coverage[b] = 0; });
  if (files.visibility) {
    let H: Record<string, number> = {};
    const f = files.visibility;
    const rows = await streamCsv(f, (row, idx) => {
      if (idx === 0) { H = headerIndex(row); return; }
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
        }
      }
    }, (pct, r) => setProgress({ label: 'Responses (analysing)', pct, rows: r, startedAt }));
    slots.visibility = { fileName: f.name, rows };
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
        H = headerIndex(row);
        citeCols = Object.keys(H).filter((k) => /^citation_\d+$/.test(k)).map((k) => H[k]);
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
      if (idx === 0) { H = headerIndex(row); return; }
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

  // ── Finalise ──
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
  const demandPrompts = demandPromptsArr.slice().sort((a, b) => b.share - a.share).slice(0, 12);

  return {
    client, tracked: brandList, totalRuns, clientHits, engines, sov, overallTop, topics,
    promptN: promptKeys.length, coverage: coverageStat, gaps, clientPromptCount,
    sentBrands, mentionSent, clientThemes, totalCites, domains, domainTotalDistinct: domainsSorted.length,
    clientDomainCites, demandTopics, demandPrompts, demandPromptTotal: demandPromptsArr.length,
    slots, updatedAt: new Date().toISOString(),
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
  const [hydrated, setHydrated] = useState(false);
  const inputRefs = {
    visibility: useRef<HTMLInputElement>(null),
    sentiment: useRef<HTMLInputElement>(null),
    platforms: useRef<HTMLInputElement>(null),
    demand: useRef<HTMLInputElement>(null),
  } as const;

  const cName = (clientName || '').trim();

  useEffect(() => {
    let alive = true;
    (async () => {
      const m = await idbLoad(projectId);
      if (alive && m) setMetrics(m);
      if (alive) setHydrated(true);
    })();
    return () => { alive = false; };
  }, [projectId]);

  async function onPick(slot: SlotKey, file: File | null) {
    if (!file) return;
    setError(null);
    const nextFiles: FileMap = { ...files, [slot]: file };
    setFiles(nextFiles);
    try {
      const m = await computeAll(nextFiles, cName || 'client', setProgress);
      setMetrics(m);
      void idbSave(projectId, m);
    } catch (e) {
      setError('Could not parse that file — check it is the matching Profound export. ' + (e instanceof Error ? e.message : ''));
    } finally {
      setProgress(null);
    }
  }

  function clearAll() {
    setMetrics(null); setFiles({}); setError(null);
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
            {metrics && (
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 px-2 py-0.5 rounded-full font-medium">
                Client auto-identified: {trackedBrandLabel}
              </span>
            )}
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

      {/* 4 upload boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {SLOT_DEFS.map((s) => {
          const loaded = metrics?.slots[s.key];
          return (
            <div key={s.key} className="relative">
              <span className="absolute -top-2 left-3 z-10 text-[9px] font-semibold uppercase tracking-wider bg-orbit-accent text-white rounded px-1.5 py-0.5">{s.step}</span>
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
        Drop each Profound export into its box. The client is identified automatically by matching this project&apos;s name against the brands in the data — no client name is hardcoded. Computed results are saved in your browser (IndexedDB) for this project.
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

      {error && (
        <div className="mt-4 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-rose-500 text-xs">{error}</div>
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
  const visPct = m.totalRuns ? (100 * m.clientHits) / m.totalRuns : 0;
  const enginesZero = m.engines.filter((e) => e.hits === 0).length;
  const topicsZero = m.topics.filter((t) => t.hits === 0).length;
  const sovRank = m.sov.findIndex((s) => s.isClient) + 1;
  const clientSent = m.sentBrands.find((s) => s.isClient);
  const clientNet = clientSent ? netPct(clientSent.pos, clientSent.neg) : null;
  const clientCov = m.coverage.find((c) => c.isClient);
  const topRival = m.coverage.find((c) => !c.isClient);

  const cards: Array<{ k: string; v: string; tone: string; s: string }> = [
    { k: 'Overall AI visibility', v: visPct.toFixed(2) + '%', tone: 'text-rose-500', s: `${m.clientHits} of ${fmt(m.totalRuns)} answers` },
  ];
  if (clientCov) cards.push({ k: 'Prompt coverage', v: `${clientCov.count} / ${m.promptN}`, tone: 'text-amber-500', s: `${clientCov.pct.toFixed(1)}% of tested prompts` });
  if (sovRank > 0) cards.push({ k: 'Share-of-Voice rank', v: `#${sovRank} / ${m.sov.length}`, tone: 'text-amber-500', s: 'tracked brands' });
  if (m.engines.length) cards.push({ k: 'Engines at 0%', v: `${enginesZero} / ${m.engines.length}`, tone: 'text-rose-500', s: m.engines.filter((e) => e.hits === 0).map((e) => e.platform).slice(0, 3).join(' · ') || 'none' });
  if (m.topics.length) cards.push({ k: 'Topics at 0%', v: `${topicsZero} / ${m.topics.length}`, tone: 'text-amber-500', s: 'no presence at all' });
  if (clientNet !== null) cards.push({ k: 'Net sentiment', v: (clientNet > 0 ? '+' : '') + clientNet, tone: clientNet >= 0 ? 'text-emerald-500' : 'text-rose-500', s: `of ${fmt((clientSent as SentBrand).pos + (clientSent as SentBrand).neg)} claims` });
  if (topRival) cards.push({ k: 'Top rival in prompts', v: topRival.pct.toFixed(0) + '%', tone: 'text-orbit-accent', s: `${disp(topRival.brand)} (${topRival.count}/${m.promptN})` });
  if (m.totalCites > 0) cards.push({ k: 'Citations analysed', v: fmt(m.totalCites), tone: 'text-orbit-accent', s: `${fmt(m.clientDomainCites)} from client domain` });

  const maxSov = Math.max(1, ...m.sov.map((s) => s.count));
  const maxCov = Math.max(1, ...m.coverage.map((c) => c.count));
  const maxDom = Math.max(1, ...m.domains.map((d) => d.count));
  const maxDemand = Math.max(1, ...m.demandPrompts.map((d) => d.share));
  const maxThemeAbs = Math.max(1, ...m.clientThemes.map((t) => Math.abs(netPct(t.pos, t.neg))));
  const maxBrandAbs = Math.max(1, ...m.sentBrands.map((t) => Math.abs(netPct(t.pos, t.neg))));

  return (
    <div className="mt-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.k} className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-1">
            <span className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest">{c.k}</span>
            <span className={`text-2xl font-bold tabular-nums ${c.tone}`}>{c.v}</span>
            <span className="text-orbit-tertiary text-[10px]">{c.s}</span>
          </div>
        ))}
      </div>

      {/* Visibility by engine + SoV */}
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="AI visibility by engine" sub="% of competitive answers where the client appears, per engine">
          {m.engines.map((e) => {
            const pct = e.runs ? (100 * e.hits) / e.runs : 0;
            return <Bar key={e.platform} label={e.platform} valueLabel={`${pct.toFixed(1)}%`} frac={pct / Math.max(1, Math.max(...m.engines.map((x) => (x.runs ? (100 * x.hits) / x.runs : 0)), 1))} color={e.hits === 0 ? 'bg-orbit-muted' : 'bg-indigo-500'} sub={`${e.hits}/${e.runs}`} />;
          })}
        </Panel>
        <Panel title="Share of Voice — tracked brands" sub="% of competitive answers mentioning each tracked firm">
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
      <Panel title={`Topic visibility — ${topicsZero} of ${m.topics.length} topics at 0%`} sub="Client visibility % across every topic (sorted; 0% = whitespace opportunity)">
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
          <Panel title="Search demand — top prompts" sub={`Highest-volume questions buyers ask (of ${fmt(m.demandPromptTotal)} prompts; share of volume)`}>
            {m.demandPrompts.map((d, i) => (
              <Bar key={i} label={d.prompt} valueLabel={`${d.share}%`} frac={d.share / maxDemand} color="bg-violet-400" sub={d.topic} small />
            ))}
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

      {/* Sentiment */}
      {m.sentBrands.length > 0 && (
        <>
          <p className="text-orbit-primary text-sm font-semibold pt-1">Sentiment</p>
          {(() => {
            // v7.314: guard — metrics persisted by an earlier version have no
            // mentionSent field; default to [] so the panel never crashes on old data
            // (the widget appears after the next upload re-computes it).
            const cms = (m.mentionSent || []).find((x) => x.isClient);
            if (!cms || cms.total === 0) return null;
            const rows = [
              { icon: '👍', label: 'Positive', v: cms.pos, bar: 'bg-emerald-500' },
              { icon: '⊖', label: 'Neutral', v: cms.neutral, bar: 'bg-slate-400' },
              { icon: '👎', label: 'Negative', v: cms.neg, bar: 'bg-rose-500' },
            ];
            return (
              <Panel title="Sentiment of mentions" sub={`Each AI evaluation of ${disp(m.client)} classified by its balance of positive vs negative claims (tie = neutral)`}>
                <div className="space-y-2.5" style={{ maxWidth: 560 }}>
                  {rows.map((r) => {
                    const pct = cms.total ? Math.round((100 * r.v) / cms.total) : 0;
                    return (
                      <div key={r.label} className="flex items-center gap-3">
                        <span className="w-5 text-center text-base leading-none">{r.icon}</span>
                        <div className="flex-1 h-3 bg-orbit-muted rounded-full overflow-hidden">
                          <div className={`h-full ${r.bar} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-24 text-right text-orbit-secondary text-xs tabular-nums">{fmt(r.v)} · {pct}%</div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-orbit-tertiary text-[11px] mt-3">{fmt(cms.total)} mentions assessed</p>
              </Panel>
            );
          })()}
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
    </div>
  );
}

// ─── Chart primitives (CSS bars; theme-safe via orbit-* + 500/600 shades) ─────────
function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-xl p-4">
      <p className="text-orbit-primary text-sm font-semibold">{title}</p>
      {sub && <p className="text-orbit-tertiary text-[11px] mt-0.5 mb-3">{sub}</p>}
      <div className="space-y-1.5">{children}</div>
    </div>
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
