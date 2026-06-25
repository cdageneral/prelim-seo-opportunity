'use client';

/*
 * ProfoundVisibilitySection (v7.294)
 * ----------------------------------
 * Upload-driven AI Answer-Engine visibility panel, fed by Profound CSV exports.
 *
 * THREE upload slots, auto-routed by header signature (filename-independent):
 *   1. Responses  (raw_data*.csv / "Raw Data.csv") — REQUIRED. Per-run LLM answers
 *      across the AI engines: mention flag, position, co-mentioned brands, sentiment,
 *      themes, and the brand each sentiment row is about (the `asset` column).
 *   2. Rankings   (rankings-by-topic.csv) — OPTIONAL. Profound's computed competitive
 *      visibility leaderboard: topic x brand x rank x visibility-score%.
 *   3. Prompts    (prompts_export_*.csv)  — OPTIONAL. The prompt catalogue: topics,
 *      target platforms, analysis types.
 *
 * DATA INTEGRITY (Const I.1): every number rendered here is a DIRECT COUNT or a value
 * read verbatim from an uploaded source row. Nothing is modeled, simulated, or
 * estimated. Where a denominator is a subset (e.g. visibility-type rows only), the
 * subset is stated on-screen. Honest empty states (I.5) when a slot is not uploaded.
 *
 * Theme parity (Const IV.6): colours use 500/600 shades + orbit-* tokens that hold
 * contrast on BOTH the light and dark orbit surfaces; no OS `dark:` variants (the app
 * toggles theme via [data-theme="light"]).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

// ─── Robust RFC-4180 CSV parser ───────────────────────────────────────────────
// Handles quoted fields with embedded commas, embedded newlines, and escaped
// quotes (""). Strips a leading UTF-8 BOM. Returns an array of rows of strings.

function parseCSV(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function rowsToObjects(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim());
  const records: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0].trim() === '') continue; // skip blank line
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = (cells[c] ?? '').trim();
    records.push(obj);
  }
  return { headers, records };
}

// ─── File-kind detection by header signature ──────────────────────────────────

type FileKind = 'responses' | 'rankings' | 'prompts' | 'unknown';

function detectKind(headers: string[]): FileKind {
  const h = new Set(headers.map(x => x.toLowerCase().trim()));
  if (h.has('visibility_rank') && h.has('visibility_score_percent') && h.has('brand')) return 'rankings';
  if (h.has('prompt') && h.has('analysis types') && (h.has('platforms') || h.has('regions'))) return 'prompts';
  // responses: a run id + platform + mentioned? are the stable signature across variants
  const hasRun = h.has('run_id') || h.has('runid');
  const hasPlatform = h.has('platform');
  const hasMentioned = h.has('mentioned?');
  if (hasRun && hasPlatform && hasMentioned) return 'responses';
  if (hasPlatform && h.has('prompt') && h.has('response')) return 'responses';
  return 'unknown';
}

// ─── Domain types ─────────────────────────────────────────────────────────────

interface ResponseRow {
  runId: string;
  date: string;
  platform: string;
  topic: string;
  region: string;
  type: string;
  prompt: string;
  mentions: string[];        // co-mentioned brands (visibility rows)
  position: string;          // e.g. "#3" when mentioned
  mentioned: boolean;        // tracked brand present
  excerpt: string;           // response text (may be a stored excerpt after reload)
  truncated: boolean;
  searchQueries: string;
  themes: string[];          // sentiment rows
  sentiment: string;         // raw sentiment_category cell
  asset: string;             // brand a sentiment row is about
}

interface RankingRow { topic: string; brand: string; rank: number; score: number; }

interface PromptRow {
  id: string; topic: string; prompt: string; platforms: string[]; analysisTypes: string[];
}

interface Dataset {
  responses: ResponseRow[];
  rankings: RankingRow[];
  prompts: PromptRow[];
  uploadedAt: string | null;     // ISO of last upload
  client: string;                // detected tracked brand label
}

const EXCERPT_CAP = 600;

function splitList(v: string): string[] {
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

function mapResponses(records: Record<string, string>[]): ResponseRow[] {
  const get = (o: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) { if (o[k] != null) return o[k]; }
    return '';
  };
  return records.map(o => {
    const resp = get(o, 'response', 'Response');
    return {
      runId:    get(o, 'run_id', 'Run_id', 'runId'),
      date:     get(o, 'date', 'Date'),
      platform: get(o, 'platform', 'Platform'),
      topic:    get(o, 'topic', 'Topic'),
      region:   get(o, 'region', 'Region'),
      type:     get(o, 'type', 'Type'),
      prompt:   get(o, 'prompt', 'Prompt'),
      mentions: splitList(get(o, 'mentions', 'Mentions')),
      position: get(o, 'position', 'Position'),
      mentioned: get(o, 'mentioned?', 'Mentioned?').toLowerCase() === 'yes',
      excerpt:  resp.length > EXCERPT_CAP ? resp.slice(0, EXCERPT_CAP) : resp,
      truncated: resp.length > EXCERPT_CAP,
      searchQueries: get(o, 'search_queries', 'Search_queries').slice(0, 400),
      themes:   splitList(get(o, 'themes')),
      sentiment: get(o, 'sentiment_category'),
      asset:    get(o, 'asset'),
    };
  });
}

function mapRankings(records: Record<string, string>[]): RankingRow[] {
  return records.map(o => ({
    topic: o['topic'] ?? '',
    brand: o['brand'] ?? '',
    rank: parseInt(o['visibility_rank'] ?? '0', 10) || 0,
    score: parseFloat(o['visibility_score_percent'] ?? '0') || 0,
  })).filter(r => r.topic && r.brand);
}

function mapPrompts(records: Record<string, string>[]): PromptRow[] {
  return records.map(o => ({
    id: o['ID'] ?? o['id'] ?? '',
    topic: o['Topic'] ?? o['topic'] ?? '',
    prompt: o['Prompt'] ?? o['prompt'] ?? '',
    platforms: splitList(o['Platforms'] ?? o['platforms'] ?? ''),
    analysisTypes: splitList(o['Analysis Types'] ?? o['analysis types'] ?? ''),
  })).filter(p => p.prompt);
}

// Detect the tracked/client brand: the brand present in EVERY response flagged
// "mentioned" (Profound sets that flag only when the tracked brand appears).
// Falls back to the most-frequent token, then to a sensible default.
function detectClient(responses: ResponseRow[]): string {
  const yes = responses.filter(r => r.mentioned && r.mentions.length);
  if (yes.length === 0) return 'Wealth Enhancement Group';
  const counts = new Map<string, number>();
  for (const r of yes) for (const b of r.mentions) counts.set(b, (counts.get(b) ?? 0) + 1);
  let best = ''; let bestC = 0;
  counts.forEach((c, b) => { if (c > bestC) { bestC = c; best = b; } });
  // require it to appear in (nearly) all mentioned rows to trust it as the tracked brand
  return bestC >= Math.ceil(yes.length * 0.8) ? best : (best || 'Wealth Enhancement Group');
}

function isClient(name: string, client: string): boolean {
  const a = name.toLowerCase(); const b = client.toLowerCase();
  if (!a || !b) return false;
  // loose match across short/long brand variants (e.g. "Wealth Enhancement" vs "Wealth Enhancement Group")
  const core = b.replace(/\b(group|inc|llc|advisors|advisory|planning|financial)\b/g, '').trim();
  return a.includes(b) || b.includes(a) || (core.length > 3 && a.includes(core));
}

// ─── Merge raw response uploads (dedupe, prefer the richer row) ────────────────

function mergeResponses(existing: ResponseRow[], incoming: ResponseRow[]): ResponseRow[] {
  const key = (r: ResponseRow) => `${r.runId}|${r.platform}|${r.type}|${r.prompt}|${r.asset}`;
  const map = new Map<string, ResponseRow>();
  for (const r of existing) map.set(key(r), r);
  for (const r of incoming) {
    const k = key(r);
    const prev = map.get(k);
    // prefer the row carrying more signal (themes/sentiment/asset/excerpt)
    const score = (x: ResponseRow) => x.themes.length + (x.sentiment ? 1 : 0) + (x.asset ? 1 : 0) + (x.excerpt ? 1 : 0);
    if (!prev || score(r) > score(prev)) map.set(k, r);
  }
  return Array.from(map.values());
}

// ─── Persistence (per project, trimmed, quota-safe) ───────────────────────────

const storeKey = (pid: string) => `orbitiq:profound:${pid}`;

function loadPersisted(pid: string): Dataset | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storeKey(pid));
    if (!raw) return null;
    const d = JSON.parse(raw) as Dataset;
    if (!d || !Array.isArray(d.responses)) return null;
    return d;
  } catch { return null; }
}

function persist(pid: string, d: Dataset) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(storeKey(pid), JSON.stringify(d)); }
  catch { /* quota — keep session-only, no crash */ }
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function pctColor(p: number): string {
  return p >= 60 ? 'text-green-600' : p >= 30 ? 'text-amber-600' : 'text-red-600';
}
function barColor(p: number): string {
  return p >= 60 ? 'bg-green-500' : p >= 30 ? 'bg-amber-500' : 'bg-red-500/70';
}
function fmtPct(num: number, den: number): string {
  return den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="flex-1 h-1.5 bg-orbit-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'engines' | 'competitive' | 'reputation' | 'prompts' | 'responses';

interface Props { projectId: string; clientName?: string | null; }

export default function ProfoundVisibilitySection({ projectId, clientName }: Props) {
  const [data, setData] = useState<Dataset>(() =>
    loadPersisted(projectId) ?? { responses: [], rankings: [], prompts: [], uploadedAt: null, client: clientName || 'Wealth Enhancement Group' }
  );
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const respInput = useRef<HTMLInputElement>(null);
  const rankInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLInputElement>(null);

  useEffect(() => { persist(projectId, data); }, [projectId, data]);

  const hasResp = data.responses.length > 0;

  async function ingest(file: File) {
    setError(null); setNotice(null); setBusy(file.name);
    try {
      const text = await file.text();
      const { headers, records } = rowsToObjects(parseCSV(text));
      const kind = detectKind(headers);
      if (kind === 'unknown') {
        setError(`Could not recognise "${file.name}". Expected a Profound export (responses, rankings-by-topic, or prompts).`);
        return;
      }
      setData(prev => {
        const next: Dataset = { ...prev };
        if (kind === 'responses') {
          const mapped = mapResponses(records);
          next.responses = mergeResponses(prev.responses, mapped);
          next.client = detectClient(next.responses);
          setNotice(`Responses loaded: ${mapped.length.toLocaleString()} rows from "${file.name}" (${next.responses.length.toLocaleString()} total after merge).`);
        } else if (kind === 'rankings') {
          next.rankings = mapRankings(records);
          setNotice(`Rankings loaded: ${next.rankings.length.toLocaleString()} topic-brand rows from "${file.name}".`);
        } else if (kind === 'prompts') {
          next.prompts = mapPrompts(records);
          setNotice(`Prompt catalogue loaded: ${next.prompts.length.toLocaleString()} prompts from "${file.name}".`);
        }
        next.uploadedAt = new Date().toISOString();
        return next;
      });
    } catch (e: any) {
      setError(`Failed to read "${file.name}": ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // sequential so the merge/notice is deterministic
    (async () => { for (const f of files) await ingest(f); })();
    e.target.value = '';
  }

  function clearAll() {
    setData({ responses: [], rankings: [], prompts: [], uploadedAt: null, client: clientName || 'Wealth Enhancement Group' });
    setNotice('Cleared all uploaded Profound data for this project.');
    setError(null);
  }

  // ── Derived analytics (all real counts) ───────────────────────────────────────
  const a = useAnalytics(data);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="orbit-card p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">GEO / AI Answer Engines</p>
            <h3 className="text-orbit-primary text-lg font-semibold mt-1">Profound AI Visibility</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] bg-orbit-accent/10 border border-orbit-accent/30 text-orbit-accent px-2 py-0.5 rounded-full font-medium">
                Uploaded data · Profound
              </span>
              {hasResp && (
                <span className="text-orbit-tertiary text-[10px]">
                  Tracked brand: <span className="text-orbit-secondary font-medium">{data.client}</span>
                  {a.dataDate && <> · data dated {a.dataDate}</>}
                  {data.uploadedAt && <> · uploaded {new Date(data.uploadedAt).toLocaleString()}</>}
                </span>
              )}
            </div>
          </div>
          {hasResp && (
            <div className="text-right">
              <span className={`text-4xl font-black ${pctColor(a.mentionRatePct)}`}>{a.mentionRatePct.toFixed(1)}<span className="text-sm font-medium text-orbit-tertiary">%</span></span>
              <p className="text-orbit-tertiary text-[10px] mt-0.5">Answer presence · {a.mentionedRows} of {a.visRows} visibility responses</p>
            </div>
          )}
        </div>

        {/* Upload slots — always available so the user can replace/refresh in place (Const IV.4) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <UploadSlot
            title="Responses" required loaded={data.responses.length}
            unit="responses" hint="raw_data*.csv · per-engine answers, sentiment, themes"
            busy={busy} onTrigger={() => respInput.current?.click()} inputRef={respInput} onPick={onPick}
          />
          <UploadSlot
            title="Rankings" loaded={data.rankings.length}
            unit="topic-brand rows" hint="rankings-by-topic.csv · competitive leaderboard"
            busy={busy} onTrigger={() => rankInput.current?.click()} inputRef={rankInput} onPick={onPick}
          />
          <UploadSlot
            title="Prompts" loaded={data.prompts.length}
            unit="prompts" hint="prompts_export_*.csv · question catalogue"
            busy={busy} onTrigger={() => promptInput.current?.click()} inputRef={promptInput} onPick={onPick}
          />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-orbit-tertiary text-[10px]">
            File type is detected from the CSV header — drop any of the Profound exports into any slot. Responses are merged &amp; de-duplicated across files. Data is stored in your browser for this project.
          </p>
          {(hasResp || data.rankings.length > 0 || data.prompts.length > 0) && (
            <button onClick={clearAll} className="text-red-600 text-[11px] hover:underline shrink-0">Clear all</button>
          )}
        </div>

        {busy && (
          <div className="flex items-center gap-2 text-orbit-secondary text-xs">
            <span className="inline-block w-3 h-3 border-2 border-orbit-accent border-t-transparent rounded-full animate-spin" />
            Parsing &ldquo;{busy}&rdquo;…
          </div>
        )}
        {error && <p className="text-red-600 text-xs">{error}</p>}
        {notice && !error && <p className="text-green-600 text-xs">{notice}</p>}
      </div>

      {/* Empty state */}
      {!hasResp && (
        <div className="orbit-card p-8 text-center flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-orbit-accent/10 border border-orbit-accent/20 flex items-center justify-center">
            <i className="ti ti-upload text-orbit-accent text-xl" aria-hidden="true" />
          </div>
          <p className="text-orbit-secondary text-sm font-medium">Upload a Profound responses export to activate this panel</p>
          <p className="text-orbit-tertiary text-xs max-w-md">
            Start with the raw responses file (raw_data*.csv). Add rankings-by-topic and the prompts export to unlock the competitive leaderboard and prompt catalogue.
          </p>
        </div>
      )}

      {/* Tabs + body */}
      {hasResp && (
        <>
          <div className="flex items-center gap-1 flex-wrap">
            {([
              ['overview', 'Overview'],
              ['engines', 'Engines & Topics'],
              ['competitive', 'Competitive'],
              ['reputation', 'Reputation'],
              ['prompts', 'Prompts'],
              ['responses', 'Responses'],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tab === id
                    ? 'bg-orbit-accent/15 border-orbit-accent/40 text-orbit-accent font-medium'
                    : 'border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/30'
                }`}
              >{label}</button>
            ))}
          </div>

          {tab === 'overview'    && <OverviewTab a={a} client={data.client} />}
          {tab === 'engines'     && <EnginesTab a={a} />}
          {tab === 'competitive' && <CompetitiveTab a={a} data={data} />}
          {tab === 'reputation'  && <ReputationTab a={a} client={data.client} />}
          {tab === 'prompts'     && <PromptsTab data={data} />}
          {tab === 'responses'   && <ResponsesTab data={data} />}
        </>
      )}
    </div>
  );
}

// ─── Upload slot ──────────────────────────────────────────────────────────────

interface SlotProps {
  title: string; required?: boolean; loaded: number; unit: string; hint: string;
  busy: string | null; onTrigger: () => void; inputRef: React.RefObject<HTMLInputElement>;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
}
function UploadSlot({ title, required, loaded, unit, hint, busy, onTrigger, inputRef, onPick }: SlotProps) {
  const done = loaded > 0;
  return (
    <button
      onClick={onTrigger}
      disabled={!!busy}
      className={`text-left rounded-lg p-3 border transition-colors ${
        done ? 'bg-green-500/5 border-green-500/40' : 'bg-orbit-surface border-orbit-border hover:border-orbit-accent/40'
      } ${busy ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-orbit-primary text-xs font-semibold flex items-center gap-1.5">
          {done && <span className="text-green-600">✓</span>}
          {title}
          {required && !done && <span className="text-red-600 text-[9px] font-normal">required</span>}
        </span>
        <i className={`ti ti-upload text-sm ${done ? 'text-green-600' : 'text-orbit-tertiary'}`} aria-hidden="true" />
      </div>
      <p className="text-orbit-tertiary text-[10px] mt-1 leading-snug">{hint}</p>
      <p className={`text-[10px] mt-1 font-medium ${done ? 'text-green-600' : 'text-orbit-tertiary'}`}>
        {done ? `${loaded.toLocaleString()} ${unit} loaded — click to replace` : 'Click to upload'}
      </p>
      <input ref={inputRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={onPick} />
    </button>
  );
}

// ─── Analytics (memoised, all derived from real rows) ─────────────────────────

interface Analytics {
  visRows: number;
  mentionedRows: number;
  mentionRatePct: number;
  dataDate: string | null;
  platforms: { name: string; mentioned: number; total: number }[];
  topics: { name: string; mentioned: number; total: number }[];
  positions: { label: string; count: number }[];
  avgPosition: number | null;
  coMentions: { brand: string; count: number }[];   // raw share-of-voice
  sentByBrand: { brand: string; pos: number; neg: number; total: number }[];
  clientSent: { pos: number; neg: number; total: number } | null;
  themesPos: { theme: string; count: number }[];
  themesNeg: { theme: string; count: number }[];
  topSearches: { q: string; count: number }[];
  totalResponses: number;
  topicCount: number;
}

function useAnalytics(data: Dataset): Analytics {
  return useMemo(() => computeAnalytics(data), [data]);
}

function computeAnalytics(data: Dataset): Analytics {
  const { responses, client } = data;
  const vis = responses.filter(r => /visibility/i.test(r.type));
  const sent = responses.filter(r => /sentiment,\s*sentiment/i.test(r.type) || (r.asset && r.sentiment));

  const mentionedRows = vis.filter(r => r.mentioned).length;
  const mentionRatePct = vis.length ? (mentionedRows / vis.length) * 100 : 0;

  const dataDate = responses.find(r => r.date)?.date ?? null;

  // by platform / topic (visibility)
  const byPlat = new Map<string, { m: number; t: number }>();
  const byTopic = new Map<string, { m: number; t: number }>();
  for (const r of vis) {
    const p = byPlat.get(r.platform) ?? { m: 0, t: 0 }; p.t++; if (r.mentioned) p.m++; byPlat.set(r.platform, p);
    const tp = byTopic.get(r.topic) ?? { m: 0, t: 0 }; tp.t++; if (r.mentioned) tp.m++; byTopic.set(r.topic, tp);
  }
  const platforms = Array.from(byPlat, ([name, v]) => ({ name, mentioned: v.m, total: v.t })).sort((x, y) => y.total - x.total);
  const topics = Array.from(byTopic, ([name, v]) => ({ name, mentioned: v.m, total: v.t })).sort((x, y) => (y.mentioned - x.mentioned) || (y.total - x.total));

  // positions when mentioned
  const posMap = new Map<string, number>();
  const posNums: number[] = [];
  for (const r of vis) {
    if (r.mentioned && r.position) {
      posMap.set(r.position, (posMap.get(r.position) ?? 0) + 1);
      const num = parseInt(r.position.replace('#', ''), 10);
      if (!isNaN(num)) posNums.push(num);
    }
  }
  const positions = Array.from(posMap, ([label, count]) => ({ label, count }))
    .sort((x, y) => parseInt(x.label.replace('#', '')) - parseInt(y.label.replace('#', '')));
  const avgPosition = posNums.length ? posNums.reduce((s, n) => s + n, 0) / posNums.length : null;

  // raw co-mention share of voice (every brand named across visibility responses)
  const coMap = new Map<string, number>();
  for (const r of vis) for (const b of r.mentions) coMap.set(b, (coMap.get(b) ?? 0) + 1);
  const coMentions = Array.from(coMap, ([brand, count]) => ({ brand, count })).sort((x, y) => y.count - x.count);

  // sentiment by brand (asset) + theme extraction
  const sb = new Map<string, { pos: number; neg: number; total: number }>();
  const tPos = new Map<string, number>();
  const tNeg = new Map<string, number>();
  for (const r of sent) {
    const brand = r.asset || '(unattributed)';
    const cats = r.sentiment.toLowerCase();
    const hasPos = cats.includes('positive');
    const hasNeg = cats.includes('negative');
    const e = sb.get(brand) ?? { pos: 0, neg: 0, total: 0 };
    if (hasPos) e.pos++; if (hasNeg) e.neg++; if (hasPos || hasNeg) e.total++;
    sb.set(brand, e);
    if (isClient(brand, client)) {
      // themes: ALLCAPS tokens read as criticisms in this export; mixed-case as strengths.
      for (const th of r.themes) {
        const isNegTheme = th === th.toUpperCase() && /[A-Z]/.test(th);
        const norm = th.trim();
        if (!norm) continue;
        if (isNegTheme || (hasNeg && !hasPos)) tNeg.set(titleCase(norm), (tNeg.get(titleCase(norm)) ?? 0) + 1);
        else tPos.set(titleCase(norm), (tPos.get(titleCase(norm)) ?? 0) + 1);
      }
    }
  }
  const sentByBrand = Array.from(sb, ([brand, v]) => ({ brand, ...v })).sort((x, y) => y.total - x.total);
  const clientEntry = sentByBrand.find(s => isClient(s.brand, client));
  const clientSent = clientEntry ? { pos: clientEntry.pos, neg: clientEntry.neg, total: clientEntry.total } : null;
  const themesPos = Array.from(tPos, ([theme, count]) => ({ theme, count })).sort((x, y) => y.count - x.count).slice(0, 18);
  const themesNeg = Array.from(tNeg, ([theme, count]) => ({ theme, count })).sort((x, y) => y.count - x.count).slice(0, 18);

  // top search queries the engines ran
  const sq = new Map<string, number>();
  for (const r of responses) if (r.searchQueries) {
    for (const q of r.searchQueries.split(/[\n;]+/).map(s => s.trim()).filter(Boolean)) {
      sq.set(q, (sq.get(q) ?? 0) + 1);
    }
  }
  const topSearches = Array.from(sq, ([q, count]) => ({ q, count })).sort((x, y) => y.count - x.count).slice(0, 25);

  const topicCount = new Set(responses.map(r => r.topic).filter(Boolean)).size;

  return {
    visRows: vis.length, mentionedRows, mentionRatePct, dataDate,
    platforms, topics, positions, avgPosition, coMentions,
    sentByBrand, clientSent, themesPos, themesNeg, topSearches,
    totalResponses: responses.length, topicCount,
  };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
      <p className="text-orbit-tertiary text-xs">{label}</p>
      <p className="text-2xl font-black mt-1 text-orbit-primary">{value}</p>
      {sub && <p className="text-orbit-tertiary text-[10px] mt-1">{sub}</p>}
    </div>
  );
}

function OverviewTab({ a, client }: { a: Analytics; client: string }) {
  const cs = a.clientSent;
  const csTotal = cs?.total ?? 0;
  return (
    <div className="orbit-card p-6 flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="AI engines covered" value={a.platforms.length} sub={a.platforms.map(p => p.name).join(', ')} />
        <StatCard label="Topics tracked" value={a.topicCount} />
        <StatCard label="Visibility responses" value={a.visRows.toLocaleString()} sub={`${a.totalResponses.toLocaleString()} total rows incl. sentiment`} />
        <StatCard label="Answer presence" value={<span className={pctColor(a.mentionRatePct)}>{a.mentionRatePct.toFixed(1)}%</span>} sub={`${client} in ${a.mentionedRows} of ${a.visRows}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-2">Where {client} ranks when it appears</p>
          {a.positions.length > 0 ? (
            <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-2">
              {a.positions.map(p => {
                const max = Math.max(...a.positions.map(x => x.count));
                return (
                  <div key={p.label} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-orbit-secondary tabular-nums">{p.label}</span>
                    <Bar pct={(p.count / max) * 100} />
                    <span className="w-8 text-right text-orbit-secondary tabular-nums">{p.count}</span>
                  </div>
                );
              })}
              {a.avgPosition != null && (
                <p className="text-orbit-tertiary text-[10px] mt-1">Average position when mentioned: <span className="text-orbit-secondary font-medium">#{a.avgPosition.toFixed(1)}</span></p>
              )}
            </div>
          ) : (
            <p className="text-orbit-tertiary text-xs italic bg-orbit-surface border border-orbit-border rounded-lg p-4">
              {client} was not mentioned in any visibility response — answer presence is {a.mentionRatePct.toFixed(1)}%.
            </p>
          )}
        </div>

        <div>
          <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-2">{client} sentiment (from sentiment analyses)</p>
          {cs && csTotal > 0 ? (
            <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-2">
              <SentRow label="Positive" count={cs.pos} pct={(cs.pos / csTotal) * 100} tone="pos" />
              <SentRow label="Negative" count={cs.neg} pct={(cs.neg / csTotal) * 100} tone="neg" />
              <p className="text-orbit-tertiary text-[10px] mt-1">{csTotal} sentiment-tagged analyses · rows may carry both a positive and a negative note</p>
            </div>
          ) : (
            <p className="text-orbit-tertiary text-xs italic bg-orbit-surface border border-orbit-border rounded-lg p-4">No sentiment rows attributed to {client} in this upload.</p>
          )}
        </div>
      </div>

      <p className="text-orbit-tertiary text-[10px] border-t border-orbit-border pt-3">
        Every figure is a direct count of uploaded Profound rows. &ldquo;Answer presence&rdquo; is computed over visibility-type responses only; sentiment splits over sentiment-type rows. Nothing here is modeled.
      </p>
    </div>
  );
}

function SentRow({ label, count, pct, tone }: { label: string; count: number; pct: number; tone: 'pos' | 'neg' }) {
  const text = tone === 'pos' ? 'text-green-600' : 'text-red-600';
  const bar = tone === 'pos' ? 'bg-green-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-16 ${text}`}>{label}</span>
      <div className="flex-1 h-2 bg-orbit-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-orbit-secondary tabular-nums">{count} · {pct.toFixed(0)}%</span>
    </div>
  );
}

function EnginesTab({ a }: { a: Analytics }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="orbit-card p-6">
        <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-3">Answer presence by AI engine</p>
        <div className="flex flex-col gap-2">
          {a.platforms.map(p => {
            const pct = p.total ? (p.mentioned / p.total) * 100 : 0;
            return (
              <div key={p.name} className="flex items-center gap-3 text-xs">
                <span className="w-40 text-orbit-primary truncate">{p.name}</span>
                <Bar pct={pct} />
                <span className={`w-12 text-right tabular-nums ${pctColor(pct)}`}>{pct.toFixed(0)}%</span>
                <span className="w-16 text-right text-orbit-tertiary tabular-nums">{p.mentioned}/{p.total}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="orbit-card p-6">
        <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-3">
          Answer presence by topic <span className="normal-case">({a.topics.length} topics)</span>
        </p>
        <div className="bg-orbit-surface border border-orbit-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-orbit-tertiary text-[10px] border-b border-orbit-border">
                <th className="text-left font-medium px-4 py-2">Topic</th>
                <th className="text-right font-medium px-3 py-2">Mentioned</th>
                <th className="text-left font-medium px-4 py-2 w-[40%]">Presence</th>
              </tr>
            </thead>
            <tbody>
              {a.topics.map(t => {
                const pct = t.total ? (t.mentioned / t.total) * 100 : 0;
                return (
                  <tr key={t.name} className="border-b border-orbit-border/50 last:border-0">
                    <td className="px-4 py-2 text-orbit-primary">{t.name}</td>
                    <td className="px-3 py-2 text-right text-orbit-secondary tabular-nums">{t.mentioned}/{t.total}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Bar pct={pct} />
                        <span className={`w-10 text-right tabular-nums ${pctColor(pct)}`}>{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CompetitiveTab({ a, data }: { a: Analytics; data: Dataset }) {
  const { rankings, client } = data;
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  // aggregate brand leaderboard from rankings file
  const agg = useMemo(() => {
    const m = new Map<string, { topics: Set<string>; sum: number; best: number; firsts: number }>();
    for (const r of rankings) {
      const e = m.get(r.brand) ?? { topics: new Set(), sum: 0, best: 99, firsts: 0 };
      e.topics.add(r.topic); e.sum += r.score; e.best = Math.min(e.best, r.rank); if (r.rank === 1) e.firsts++;
      m.set(r.brand, e);
    }
    return Array.from(m, ([brand, e]) => ({
      brand, topics: e.topics.size, avg: e.sum / e.topics.size, best: e.best, firsts: e.firsts,
    })).sort((x, y) => (y.topics - x.topics) || (y.avg - x.avg));
  }, [rankings]);

  const byTopic = useMemo(() => {
    const m = new Map<string, RankingRow[]>();
    for (const r of rankings) { if (!m.has(r.topic)) m.set(r.topic, []); m.get(r.topic)!.push(r); }
    m.forEach(list => list.sort((x, y) => x.rank - y.rank));
    return Array.from(m.entries()).sort((x, y) => x[0].localeCompare(y[0]));
  }, [rankings]);

  const maxCo = a.coMentions.length ? a.coMentions[0].count : 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Rankings leaderboard */}
      <div className="orbit-card p-6">
        <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-1">Competitive leaderboard <span className="normal-case">(Profound visibility score)</span></p>
        {rankings.length === 0 ? (
          <p className="text-orbit-tertiary text-xs italic mt-2">Upload <span className="font-medium">rankings-by-topic.csv</span> to see the competitive leaderboard.</p>
        ) : (
          <>
            <p className="text-orbit-tertiary text-[10px] mb-3">{agg.length} brands across {byTopic.length} topics. Visibility score is Profound&rsquo;s per-topic share metric (read verbatim).</p>
            <div className="bg-orbit-surface border border-orbit-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-orbit-tertiary text-[10px] border-b border-orbit-border">
                    <th className="text-left font-medium px-4 py-2">Brand</th>
                    <th className="text-right font-medium px-3 py-2">Topics ranked</th>
                    <th className="text-right font-medium px-3 py-2">Avg score</th>
                    <th className="text-right font-medium px-3 py-2">Best rank</th>
                    <th className="text-right font-medium px-4 py-2">#1 finishes</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.slice(0, 30).map(b => {
                    const mine = isClient(b.brand, client);
                    return (
                      <tr key={b.brand} className={`border-b border-orbit-border/50 last:border-0 ${mine ? 'bg-orbit-accent/10' : ''}`}>
                        <td className="px-4 py-2 text-orbit-primary">{b.brand}{mine && <span className="ml-2 text-[9px] bg-orbit-accent/20 text-orbit-accent px-1.5 py-0.5 rounded-full">tracked</span>}</td>
                        <td className="px-3 py-2 text-right text-orbit-secondary tabular-nums">{b.topics}</td>
                        <td className="px-3 py-2 text-right text-orbit-secondary tabular-nums">{b.avg.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right text-orbit-secondary tabular-nums">#{b.best}</td>
                        <td className="px-4 py-2 text-right text-orbit-secondary tabular-nums">{b.firsts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-topic expandable */}
            <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mt-5 mb-2">By topic</p>
            <div className="flex flex-col gap-1.5">
              {byTopic.map(([topic, list]) => {
                const open = openTopic === topic;
                const mineRow = list.find(r => isClient(r.brand, client));
                return (
                  <div key={topic} className="bg-orbit-surface border border-orbit-border rounded-lg">
                    <button onClick={() => setOpenTopic(t => t === topic ? null : topic)} className="w-full flex items-center justify-between px-4 py-2 text-xs">
                      <span className="text-orbit-primary flex items-center gap-2">
                        <span className={`text-orbit-tertiary text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                        {topic}
                      </span>
                      <span className="text-orbit-tertiary text-[10px]">
                        {mineRow ? <span className="text-orbit-accent">{client} #{mineRow.rank} · {mineRow.score.toFixed(1)}%</span> : 'tracked brand not ranked'}
                      </span>
                    </button>
                    {open && (
                      <div className="px-4 pb-3 flex flex-col gap-1.5">
                        {list.map(r => {
                          const mine = isClient(r.brand, client);
                          const max = list[0]?.score || 1;
                          return (
                            <div key={r.brand + r.rank} className="flex items-center gap-2 text-xs">
                              <span className="w-6 text-orbit-tertiary tabular-nums text-right">{r.rank}.</span>
                              <span className={`w-44 truncate ${mine ? 'text-orbit-accent font-medium' : 'text-orbit-primary'}`}>{r.brand}</span>
                              <div className="flex-1 h-1.5 bg-orbit-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${mine ? 'bg-orbit-accent' : 'bg-orbit-accent/40'}`} style={{ width: `${(r.score / max) * 100}%` }} />
                              </div>
                              <span className="w-12 text-right text-orbit-secondary tabular-nums">{r.score.toFixed(1)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Raw co-mention share of voice */}
      <div className="orbit-card p-6">
        <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-1">Brand co-mentions <span className="normal-case">(raw — every brand named across visibility responses)</span></p>
        <p className="text-orbit-tertiary text-[10px] mb-3">A second, independent lens: how often each brand was actually named in the AI answers (not Profound&rsquo;s score). Top {Math.min(a.coMentions.length, 30)} of {a.coMentions.length}.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
          {a.coMentions.slice(0, 30).map(b => {
            const mine = isClient(b.brand, data.client);
            return (
              <div key={b.brand} className="flex items-center gap-2 text-xs">
                <span className={`w-40 truncate ${mine ? 'text-orbit-accent font-medium' : 'text-orbit-primary'}`}>{b.brand}</span>
                <div className="flex-1 h-1.5 bg-orbit-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${mine ? 'bg-orbit-accent' : 'bg-orbit-accent/40'}`} style={{ width: `${(b.count / maxCo) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-orbit-secondary tabular-nums">{b.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReputationTab({ a, client }: { a: Analytics; client: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="orbit-card p-6">
        <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-3">Sentiment by brand <span className="normal-case">(from sentiment analyses · positive / negative share)</span></p>
        {a.sentByBrand.length === 0 ? (
          <p className="text-orbit-tertiary text-xs italic">No sentiment rows in this upload.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {a.sentByBrand.map(b => {
              const mine = isClient(b.brand, client);
              const pos = b.total ? (b.pos / b.total) * 100 : 0;
              const neg = b.total ? (b.neg / b.total) * 100 : 0;
              return (
                <div key={b.brand} className="flex items-center gap-3 text-xs">
                  <span className={`w-40 truncate ${mine ? 'text-orbit-accent font-medium' : 'text-orbit-primary'}`}>{b.brand}{mine && ' ★'}</span>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-orbit-muted">
                    <div className="h-full bg-green-500" style={{ width: `${pos}%` }} title={`${b.pos} positive`} />
                    <div className="h-full bg-red-500" style={{ width: `${neg}%` }} title={`${b.neg} negative`} />
                  </div>
                  <span className="w-24 text-right text-orbit-tertiary tabular-nums">
                    <span className="text-green-600">{b.pos}</span> / <span className="text-red-600">{b.neg}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ThemeList title={`What AIs praise about ${client}`} themes={a.themesPos} tone="pos" />
        <ThemeList title={`What AIs criticise about ${client}`} themes={a.themesNeg} tone="neg" />
      </div>

      {a.topSearches.length > 0 && (
        <div className="orbit-card p-6">
          <p className="text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest mb-3">Search queries the engines ran <span className="normal-case">(top {a.topSearches.length})</span></p>
          <div className="flex flex-wrap gap-1.5">
            {a.topSearches.map(s => (
              <span key={s.q} className="text-[11px] bg-orbit-surface border border-orbit-border rounded-full px-2.5 py-1 text-orbit-secondary">
                {s.q}{s.count > 1 && <span className="text-orbit-tertiary"> ·{s.count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeList({ title, themes, tone }: { title: string; themes: { theme: string; count: number }[]; tone: 'pos' | 'neg' }) {
  const accent = tone === 'pos' ? 'text-green-600' : 'text-red-600';
  const border = tone === 'pos' ? 'border-green-500/40' : 'border-red-500/40';
  return (
    <div className="orbit-card p-6">
      <p className={`text-[10px] font-medium uppercase tracking-widest mb-3 ${accent}`}>{title}</p>
      {themes.length === 0 ? (
        <p className="text-orbit-tertiary text-xs italic">No themes attributed to the tracked brand in this upload.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {themes.map(t => (
            <span key={t.theme} className={`text-[11px] bg-orbit-surface border rounded-full px-2.5 py-1 text-orbit-secondary ${border}`}>
              {t.theme}{t.count > 1 && <span className="text-orbit-tertiary"> ·{t.count}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptsTab({ data }: { data: Dataset }) {
  const { prompts } = data;
  const byTopic = useMemo(() => {
    const m = new Map<string, PromptRow[]>();
    for (const p of prompts) { if (!m.has(p.topic)) m.set(p.topic, []); m.get(p.topic)!.push(p); }
    return Array.from(m.entries()).sort((x, y) => x[0].localeCompare(y[0]));
  }, [prompts]);
  const [open, setOpen] = useState<string | null>(null);

  const platforms = useMemo(() => {
    const s = new Set<string>(); for (const p of prompts) for (const pl of p.platforms) s.add(pl); return Array.from(s).sort();
  }, [prompts]);

  if (prompts.length === 0) {
    return (
      <div className="orbit-card p-6">
        <p className="text-orbit-tertiary text-xs italic">Upload <span className="font-medium">prompts_export_*.csv</span> to see the prompt catalogue.</p>
      </div>
    );
  }

  return (
    <div className="orbit-card p-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Prompts" value={prompts.length} />
        <StatCard label="Topics" value={byTopic.length} />
        <StatCard label="Target engines" value={platforms.length} sub={platforms.join(', ')} />
        <StatCard label="Avg prompts / topic" value={(prompts.length / Math.max(byTopic.length, 1)).toFixed(1)} />
      </div>
      <div className="flex flex-col gap-1.5">
        {byTopic.map(([topic, list]) => {
          const isOpen = open === topic;
          return (
            <div key={topic} className="bg-orbit-surface border border-orbit-border rounded-lg">
              <button onClick={() => setOpen(t => t === topic ? null : topic)} className="w-full flex items-center justify-between px-4 py-2 text-xs">
                <span className="text-orbit-primary flex items-center gap-2">
                  <span className={`text-orbit-tertiary text-[9px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                  {topic}
                </span>
                <span className="text-orbit-tertiary text-[10px]">{list.length} prompts</span>
              </button>
              {isOpen && (
                <ol className="px-4 pb-3 flex flex-col gap-1.5 list-decimal list-inside">
                  {list.map(p => (
                    <li key={p.id} className="text-orbit-secondary text-[11px] leading-relaxed">{p.prompt}</li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResponsesTab({ data }: { data: Dataset }) {
  const { responses, client } = data;
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('all');
  const [onlyMentioned, setOnlyMentioned] = useState(false);
  const [limit, setLimit] = useState(50);

  const platforms = useMemo(() => Array.from(new Set(responses.map(r => r.platform))).sort(), [responses]);
  const vis = useMemo(() => responses.filter(r => /visibility/i.test(r.type)), [responses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return vis.filter(r => {
      if (platform !== 'all' && r.platform !== platform) return false;
      if (onlyMentioned && !r.mentioned) return false;
      if (needle && !(`${r.prompt} ${r.topic} ${r.excerpt} ${r.mentions.join(' ')}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [vis, q, platform, onlyMentioned]);

  return (
    <div className="orbit-card p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={q} onChange={e => { setQ(e.target.value); setLimit(50); }}
          placeholder="Search prompt, topic, response, brand…"
          className="flex-1 min-w-[200px] bg-orbit-surface border border-orbit-border rounded-lg px-3 py-1.5 text-xs text-orbit-primary placeholder:text-orbit-tertiary focus:outline-none focus:border-orbit-accent/50"
        />
        <select value={platform} onChange={e => { setPlatform(e.target.value); setLimit(50); }}
          className="bg-orbit-surface border border-orbit-border rounded-lg px-3 py-1.5 text-xs text-orbit-secondary">
          <option value="all">All engines</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-orbit-secondary cursor-pointer">
          <input type="checkbox" checked={onlyMentioned} onChange={e => { setOnlyMentioned(e.target.checked); setLimit(50); }} />
          Mentioned only
        </label>
      </div>
      <p className="text-orbit-tertiary text-[10px]">{filtered.length.toLocaleString()} of {vis.length.toLocaleString()} visibility responses</p>

      <div className="flex flex-col gap-2">
        {filtered.slice(0, limit).map((r, i) => (
          <div key={r.runId + r.platform + i} className="bg-orbit-surface border border-orbit-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-orbit-primary text-xs font-medium">{r.prompt}</span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] bg-orbit-muted text-orbit-tertiary px-1.5 py-0.5 rounded-full">{r.platform}</span>
                {r.mentioned
                  ? <span className="text-[9px] bg-green-500/15 text-green-600 border border-green-500/30 px-1.5 py-0.5 rounded-full">✓ {client}{r.position && ` ${r.position}`}</span>
                  : <span className="text-[9px] bg-orbit-muted text-orbit-tertiary px-1.5 py-0.5 rounded-full">not mentioned</span>}
              </span>
            </div>
            <p className="text-orbit-tertiary text-[10px] mt-0.5">{r.topic}</p>
            {r.excerpt && (
              <p className="text-orbit-secondary text-[11px] mt-2 leading-relaxed whitespace-pre-line">
                {r.excerpt}{r.truncated && <span className="text-orbit-tertiary italic"> … (stored excerpt — re-upload responses to view full text)</span>}
              </p>
            )}
            {r.mentions.length > 0 && (
              <p className="text-orbit-tertiary text-[10px] mt-2">
                Brands named: {r.mentions.map((b, bi) => (
                  <span key={bi} className={isClient(b, client) ? 'text-orbit-accent font-medium' : ''}>{b}{bi < r.mentions.length - 1 ? ', ' : ''}</span>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>

      {filtered.length > limit && (
        <button onClick={() => setLimit(l => l + 50)} className="text-orbit-accent text-xs hover:underline self-center">
          Show more ({filtered.length - limit} remaining)
        </button>
      )}
      {filtered.length === 0 && <p className="text-orbit-tertiary text-xs italic text-center py-4">No responses match your filters.</p>}
    </div>
  );
}
