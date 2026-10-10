/**
 * lib/pages/pageMap.ts — v7.549 (Wayne 2026-10-09: "the url match is not about what is the
 * highest ranking keyword. It is matching keyword cluster themes to the right intent matched URL")
 *
 * THE page map: every taxonomy node (cluster) is matched to the client page whose INTENT and
 * THEME fit it — a category-level cluster to its category hub, a product cluster to that
 * product's page, an informational cluster to the guide — instead of to whichever page
 * happens to rank for one of its keywords. Builds AUTOMATICALLY on a project (the project
 * page runs the steps when work is pending — nobody presses "map pages").
 *
 * Three stores, one JSONB column (projects.page_mapping — named column, II.9):
 *   inventory  the client's REAL pages: sitemap(s) + every ranking URL the pool knows, each
 *              with its fetched <title> / <h1> (real page data, I.1) and a page TYPE —
 *              rule-labelled when the path is unambiguous (login, legal), otherwise
 *              Claude-labelled with the model's own confidence (stored as an AI label, never
 *              shown as measured data — III.7).
 *   nodes      per taxonomy node: the page Claude filed it to (or 0 = no page), its
 *              confidence, and the RANKING EVIDENCE for that page (how many of the node's
 *              keywords it ranks for, their volume, its best rank) — shown beside the
 *              mapping as confirmation, never as the decider.
 *   job        the step runner's lock + progress (one runner at a time).
 *
 * Resolution order everywhere (ONE rule, II.7 — clusters, Product Insights, the Profound
 * join, the PDF): user override ("set by you") → mapped page (confidence ≥ MAP_REVIEW_BELOW)
 * → the ranking vote (lib/pages/electPage.ts) labelled as a fallback → no page (build).
 *
 * Pure + dependency-free (no DB, no network, no SDK): the route does the fetching and the
 * Claude calls; everything here is unit-testable in the retained suite.
 */

import { normContentUrl, pathOfNormUrl } from '@/lib/utils/pageUrl';
import { electPage, type PageVoteKw, type PageElection, type PageOverrides, type PageOverride, pageOverrideKey } from '@/lib/pages/electPage';

export const PAGE_MAP_VERSION     = 551;   // v7.551: children first — a page taken by a sub-category is never the parent's; non-branded keywords shown (re-maps every node once)
export const PAGE_MAP_MODEL       = 'claude-sonnet-4-6';   // same model the keyword + prompt filers settled on
export const PAGE_INVENTORY_CAP   = 3000;   // pages kept (ranking pages first, then sitemap by depth)
export const SITEMAP_CHILD_CAP    = 60;     // child sitemaps followed from an index
export const SITEMAP_URL_CAP      = 20000;  // raw sitemap URLs read before the inventory cap applies
export const LABEL_BATCH          = 40;     // pages per Claude call
export const MAP_BATCH            = 8;      // nodes per Claude call
export const MAP_CANDIDATES       = 30;     // candidate pages shown per node
export const HUB_CANDIDATE_CAP    = 40;     // v7.550: hub / comparison pages always added for category-level nodes
export const MAP_REVIEW_BELOW     = 0.6;    // confidence under this = review, not mapped
export const NODE_KW_SHOWN        = 12;     // top own keywords shown per node in the prompt
export const TITLE_MAX            = 90;
export const MAX_ATTEMPTS         = 3;      // Claude attempts per page / node before it is left pending-failed

export type PageType = 'hub' | 'product' | 'guide' | 'comparison' | 'support' | 'location' | 'other';
export const PAGE_TYPES: PageType[] = ['hub', 'product', 'guide', 'comparison', 'support', 'location', 'other'];
export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  hub: 'category hub', product: 'product page', guide: 'guide / article', comparison: 'comparison',
  support: 'support / account', location: 'location', other: 'other',
};

export interface PageRecord {
  url:        string;            // canonical page URL (https://host/path, no query/hash/trailing slash)
  path:       string;            // pathOfNormUrl
  source:     'sitemap' | 'ranking' | 'both';
  depth:      number;            // path segments
  title?:     string;
  h1?:        string;
  fetchedAt?: string;
  httpStatus?: number;           // 0 = network error / timeout
  type?:      PageType;
  typeBasis?: 'rule' | 'ai';
  topic?:     string;            // AI-labelled subject (≤ 6 words)
  confidence?: number;           // the model's own 0–1 (AI labels only)
  labeledAt?: string;
  labelAttempts?: number;        // failed Claude attempts; MAX_ATTEMPTS and the page stays unlabelled (disclosed)
}

export interface NodeMapping {
  url:        string | null;     // null = the model said no page fits (0)
  confidence: number;
  status:     'mapped' | 'review' | 'none';
  nodeSig:    string;            // taxonomy fingerprint the mapping was made against
  mappedAt:   string;
  model:      string;
  mapVersion: number;
}

export interface PageMapJob {
  token:      string;
  lockUntil:  string;
  phase:      PageMapPhase;
  startedAt:  string;
  updatedAt:  string;
  lastError?: string;
}

export type PageMapPhase = 'inventory' | 'fetch' | 'label' | 'map' | 'done';

export interface PageMapInventory {
  builtAt:       string;
  analysisId:    string;
  host:          string;
  sitemapUrls:   string[];       // sitemaps actually read
  sitemapTotal:  number;         // URLs seen in sitemaps (before host filter + cap)
  sitemapKept:   number;
  rankingTotal:  number;         // distinct ranking URLs from the pool / page map
  capped:        boolean;
  sitemapError?: string;         // disclosed when no sitemap could be read (I.5)
  pages:         PageRecord[];
}

export interface PageMapStore {
  version:    number;
  inventory:  PageMapInventory | null;
  nodes:      Record<string, NodeMapping>;   // key = taxonomy path joined by ' › '
  mapAttempts?: Record<string, number>;      // failed Claude attempts per node key
  job?:       PageMapJob | null;
}

export const emptyPageMap = (): PageMapStore => ({ version: PAGE_MAP_VERSION, inventory: null, nodes: {} });

// ─── URL identity ─────────────────────────────────────────────────────────────────────

const NON_PAGE_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|ico|css|js|json|xml|txt|zip|gz|mp4|mp3|woff2?|ttf|eot|csv|xlsx?|docx?|pptx?)$/i;

export const hostOf = (domainOrUrl: string): string => {
  let s = String(domainOrUrl ?? '').trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return s.split('/')[0].split('?')[0].split('#')[0];
};

/** The registrable-ish root used to accept subdomains: last two labels (three for ccTLD-style). */
const rootOf = (host: string): string => {
  const p = host.split('.');
  if (p.length <= 2) return host;
  const last = p[p.length - 1], second = p[p.length - 2];
  if (last.length === 2 && second.length <= 3) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
};

/** Canonical page URL on the client host, or null when it is off-host / not a page. */
export function canonicalPageUrl(raw: string, clientHost: string): string | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.startsWith('//')) s = 'https:' + s;
  if (s.startsWith('/')) s = `https://${hostOf(clientHost)}${s}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  const root = rootOf(hostOf(clientHost));
  if (!(h === root || h.endsWith('.' + root))) return null;
  let path = u.pathname.replace(/\/{2,}/g, '/');
  if (NON_PAGE_EXT.test(path)) return null;
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (!path) path = '/';
  // query strings never make a page (tracking / view params) — the v7.541 identity keeps
  // them, so the inventory is stricter than the cluster identity on purpose: a page is one path.
  return `https://${h}${path}`;
}

export const pageDepth = (path: string): number => path.split('/').filter(Boolean).length;

// ─── HTML extraction (regex, no DOM) ──────────────────────────────────────────────────

const NAMED_ENTITY: Record<string, string> = { reg: '®', copy: '©', trade: '™', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·' };
const decodeEntities = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
   .replace(/&nbsp;/g, ' ').replace(/&([a-z]+);/g, (m, n) => NAMED_ENTITY[n] ?? m).replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
   .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; } });
const stripTags = (s: string): string => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** v7.550: a blocked / errored fetch (403 "Access Denied", 404, 5xx) carries no real title — judge by path. */
export const pageTitle = (p: { title?: string; httpStatus?: number }): string => (p.httpStatus && p.httpStatus >= 400) ? '' : (p.title ?? '');
export const pageH1    = (p: { h1?: string; httpStatus?: number }): string => (p.httpStatus && p.httpStatus >= 400) ? '' : (p.h1 ?? '');

export function extractTitleH1(html: string): { title: string; h1: string } {
  const h = String(html ?? '');
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(h);
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
  return { title: t ? stripTags(t[1]).slice(0, 200) : '', h1: h1 ? stripTags(h1[1]).slice(0, 200) : '' };
}

// ─── rule labels (only the unambiguous — everything else is the model's call) ─────────

const RULE_SUPPORT = /(^|\/)(log-?in|log-?on|sign-?in|sign-?on|signin|account|my-?account|register|password|reset|activate|verify|otp)(\/|$)/i;
const RULE_OTHER   = /(^|\/)(privacy|terms|legal|accessibility|careers?|jobs|sitemap|press|investors?|newsroom|cookie-?policy|disclosures?)(\/|$)/i;

export function ruleType(path: string): PageType | null {
  if (path === '/' ) return 'hub';
  if (RULE_SUPPORT.test(path)) return 'support';
  if (RULE_OTHER.test(path)) return 'other';
  return null;
}

// ─── taxonomy nodes (the SAME keyword → path store Product Insights drills) ───────────

export interface NodeInfo {
  key:       string;      // path joined by ' › ' (= CatNode.key, = topic id without 'tax:path:')
  path:      string[];
  name:      string;
  depth:     number;      // 1 = product line
  own:       PageVoteKw[];     // keywords filed AT this node, volume desc
  all:       PageVoteKw[];     // own + descendants
  ownVol:    number;
  allVol:    number;
  children:  string[];
  intent:    string;      // dominant signal over own keywords ('informational' | 'commercial' | 'transactional' | 'navigational' | 'mixed')
}

export interface PoolKwLike { keyword: string; searchVolume: number; position: number | null; url?: string; isGap?: boolean; origin?: string; isBranded?: boolean }

/** Every taxonomy node from `keywordPaths`, with its own + descendant pool keywords. Nodes with
 *  no pool keyword at any level are skipped (hidden / out of scope — the same gate the drill uses). */
export function taxonomyNodes(keywordPaths: Record<string, string[]> | null | undefined, pool: PoolKwLike[], intentOf: (kw: string) => string | null): NodeInfo[] {
  const byKw = new Map<string, PoolKwLike>();
  for (const k of pool) { const key = String(k.keyword ?? '').toLowerCase().trim(); if (key && !byKw.has(key)) byKw.set(key, k); }
  const nodes = new Map<string, NodeInfo>();
  const ensure = (path: string[]): NodeInfo => {
    const key = path.join(' › ');
    let n = nodes.get(key);
    if (!n) { n = { key, path, name: path[path.length - 1], depth: path.length, own: [], all: [], ownVol: 0, allVol: 0, children: [], intent: 'mixed' }; nodes.set(key, n); }
    return n;
  };
  for (const [kwRaw, pathRaw] of Object.entries(keywordPaths ?? {})) {
    if (!Array.isArray(pathRaw) || pathRaw.length === 0) continue;
    const path = pathRaw.map(x => String(x ?? '').trim()).filter(Boolean);
    if (!path.length) continue;
    const row = byKw.get(String(kwRaw).toLowerCase().trim());
    if (!row) continue;
    const kw: PageVoteKw = { keyword: row.keyword, searchVolume: row.searchVolume || 0, position: row.position ?? null, url: row.url, isGap: !!row.isGap, origin: row.origin, isBranded: !!row.isBranded };
    for (let i = 1; i <= path.length; i++) {
      const n = ensure(path.slice(0, i));
      n.all.push(kw); n.allVol += kw.searchVolume;
      if (i === path.length) { n.own.push(kw); n.ownVol += kw.searchVolume; }
      if (i < path.length) { const child = path[i]; if (!n.children.includes(child)) n.children.push(child); }
    }
  }
  const out = Array.from(nodes.values());
  for (const n of out) {
    n.own.sort((a, b) => b.searchVolume - a.searchVolume);
    n.all.sort((a, b) => b.searchVolume - a.searchVolume);
    const vol = new Map<string, number>();
    for (const k of n.own.length ? n.own : n.all) { const it = intentOf(k.keyword) ?? 'unmatched'; vol.set(it, (vol.get(it) ?? 0) + k.searchVolume); }
    let best = 'mixed', bv = -1, total = 0;
    for (const [it, v] of Array.from(vol.entries())) { total += v; if (v > bv) { bv = v; best = it; } }
    n.intent = total > 0 && bv / total >= 0.5 && best !== 'unmatched' ? best : 'mixed';
  }
  out.sort((a, b) => a.depth - b.depth || b.allVol - a.allVol || a.key.localeCompare(b.key));
  return out;
}

/** Fingerprint of what the mapping depends on: name, level, children, top own keywords. */
export function nodeSig(n: NodeInfo): string {
  const kws = n.own.slice(0, NODE_KW_SHOWN).map(k => k.keyword).join('|');
  return hash32(`${PAGE_MAP_VERSION}|${n.key}|${n.children.join(',')}|${n.intent}|${kws}`);
}

export function hash32(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// ─── pending work ─────────────────────────────────────────────────────────────────────

export const pagesToFetch = (store: PageMapStore): PageRecord[] => (store.inventory?.pages ?? []).filter(p => !p.fetchedAt);
export const pagesToLabel = (store: PageMapStore): PageRecord[] => (store.inventory?.pages ?? []).filter(p => !!p.fetchedAt && !p.type && (p.labelAttempts ?? 0) < MAX_ATTEMPTS);
/** nodes whose mapping is missing or stale — excluding nodes that failed MAX_ATTEMPTS times (status 'failed') */
export const nodesToMap   = (store: PageMapStore, nodes: NodeInfo[]): NodeInfo[] =>
  nodes.filter(n => { const m = store.nodes[n.key]; return (!m || m.nodeSig !== nodeSig(n) || (m.mapVersion ?? 0) < PAGE_MAP_VERSION) && (store.mapAttempts?.[n.key] ?? 0) < MAX_ATTEMPTS; });
export const nodesFailed  = (store: PageMapStore, nodes: NodeInfo[]): number =>
  nodes.filter(n => { const m = store.nodes[n.key]; return (!m || m.nodeSig !== nodeSig(n)) && (store.mapAttempts?.[n.key] ?? 0) >= MAX_ATTEMPTS; }).length;

export interface PageMapStatus {
  version:      number;
  phase:        PageMapPhase;
  inventory:    null | { pages: number; sitemapTotal: number; sitemapKept: number; rankingTotal: number; capped: boolean; sitemapError?: string; builtAt: string; fetched: number; fetchFailed: number; labeled: number; byType: Record<string, number> };
  nodes:        { total: number; mapped: number; review: number; none: number; pending: number; failed: number };
  pagesUnlabeled: number;
  running:      boolean;
  lastError?:   string;
  model:        string;
}

export function pageMapStatus(store: PageMapStore | null, nodes: NodeInfo[], now: number = Date.now(), analysisId?: string): PageMapStatus {
  const s = store ?? emptyPageMap();
  // a different analysis = a different keyword set: the inventory's ranking side is rebuilt
  const inv = s.inventory && analysisId && s.inventory.analysisId !== analysisId ? null : s.inventory;
  const pages = inv?.pages ?? [];
  const byType: Record<string, number> = {};
  let fetched = 0, fetchFailed = 0, labeled = 0, unlabeled = 0;
  for (const p of pages) { if (p.fetchedAt) { fetched++; if (!p.httpStatus || p.httpStatus >= 400) fetchFailed++; } if (p.type) { labeled++; byType[p.type] = (byType[p.type] ?? 0) + 1; } else if ((p.labelAttempts ?? 0) >= MAX_ATTEMPTS) unlabeled++; }
  let mapped = 0, review = 0, none = 0;
  const pending = nodesToMap(s, nodes).length;
  for (const n of nodes) { const m = s.nodes[n.key]; if (!m || nodesToMap(s, [n]).length) continue; if (m.status === 'mapped') mapped++; else if (m.status === 'review') review++; else none++; }
  const phase: PageMapPhase = !inv ? 'inventory' : pagesToFetch(s).length ? 'fetch' : pagesToLabel(s).length ? 'label' : pending ? 'map' : 'done';
  const running = !!s.job && new Date(s.job.lockUntil).getTime() > now;
  return {
    version: PAGE_MAP_VERSION, phase,
    inventory: inv ? { pages: pages.length, sitemapTotal: inv.sitemapTotal, sitemapKept: inv.sitemapKept, rankingTotal: inv.rankingTotal, capped: inv.capped, sitemapError: inv.sitemapError, builtAt: inv.builtAt, fetched, fetchFailed, labeled, byType } : null,
    nodes: { total: nodes.length, mapped, review, none, pending, failed: nodesFailed(s, nodes) },
    pagesUnlabeled: unlabeled,
    running, lastError: s.job?.lastError, model: PAGE_MAP_MODEL,
  };
}

// ─── inventory assembly (pure: the route passes the URL lists in) ─────────────────────

export function assembleInventory(opts: {
  analysisId: string; host: string; sitemapUrls: string[]; sitemapPageUrls: string[]; rankingUrls: string[];
  sitemapError?: string; prior?: PageRecord[]; now?: string;
}): PageMapInventory {
  const now = opts.now ?? new Date().toISOString();
  const prior = new Map<string, PageRecord>();
  for (const p of opts.prior ?? []) prior.set(p.url, p);
  const byUrl = new Map<string, PageRecord>();
  const add = (raw: string, source: 'sitemap' | 'ranking') => {
    const url = canonicalPageUrl(raw, opts.host);
    if (!url) return false;
    const ex = byUrl.get(url);
    if (ex) { if (ex.source !== source) ex.source = 'both'; return true; }
    const path = pathOfNormUrl(normContentUrl(url));
    const keep = prior.get(url);
    byUrl.set(url, { ...(keep ?? {}), url, path, source, depth: pageDepth(path) });
    return true;
  };
  for (const u of opts.rankingUrls) add(u, 'ranking');
  const rankingTotal = Array.from(byUrl.values()).length;   // distinct ranking pages (before sitemap pages)
  let sitemapKept = 0;
  for (const u of opts.sitemapPageUrls) if (add(u, 'sitemap')) sitemapKept++;
  // cap: ranking pages first (they are evidence), then sitemap pages shallow-first
  let pages = Array.from(byUrl.values());
  const capped = pages.length > PAGE_INVENTORY_CAP;
  if (capped) {
    pages.sort((a, b) => (a.source === 'sitemap' ? 1 : 0) - (b.source === 'sitemap' ? 1 : 0) || a.depth - b.depth || a.path.length - b.path.length || a.url.localeCompare(b.url));
    pages = pages.slice(0, PAGE_INVENTORY_CAP);
  } else {
    pages.sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url));
  }
  return {
    builtAt: now, analysisId: opts.analysisId, host: hostOf(opts.host), sitemapUrls: opts.sitemapUrls,
    sitemapTotal: opts.sitemapPageUrls.length, sitemapKept, rankingTotal, capped, sitemapError: opts.sitemapError, pages,
  };
}

/** Sitemap URLs a robots.txt declares. */
export function sitemapsFromRobots(robots: string, origin: string): string[] {
  const out: string[] = [];
  const re = /^\s*sitemap\s*:\s*(\S+)/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(robots ?? ''))) !== null) {
    let u = m[1].trim();
    if (u.startsWith('/')) u = origin + u;
    if (/^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

// ─── candidate pages for a node (lexical, deterministic) ──────────────────────────────

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'by', 'vs', 'your', 'you', 'is', 'how', 'what', 'best', 'top', 'near', 'me', 'my', 'us', 'from', 'at', 'all', 'view', 'page', 'pages', 'home', 'www', 'com', 'html', 'htm', 'index', 'cards', 'card']);
// 'cards'/'card' are stopped because on a card issuer every page carries them — the match has to come from the rest.

export function tokens(s: string): string[] {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').map(t => t.trim()).filter(t => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}
export const stem = (t: string): string => t.replace(/(ies)$/, 'y').replace(/(s|es)$/, '').replace(/(ing|ed)$/, '');
/** Lexical match used by the Set-page picker: every query term (stemmed) appears in the page's path / title / topic tokens. */
export function pageMatches(pg: { path: string; title?: string; topic?: string; h1?: string; httpStatus?: number }, terms: string[]): boolean {
  const hay = new Set<string>();
  const text = `${pg.path} ${pageTitle(pg as any)} ${pageH1(pg as any)} ${pg.topic ?? ''}`;
  for (const t of tokens(text)) hay.add(stem(t));
  const raw = text.toLowerCase();
  return terms.every(t => { const s = stem(t.toLowerCase()); return hay.has(s) || raw.includes(t.toLowerCase()); });
}

export interface Candidate { n: number; page: PageRecord; score: number; evidenceKw: number; evidenceVol: number; evidenceBest: number | null; takenBy?: string }

/** v7.551: pages already matched to this node's DESCENDANTS (norm url → sub-category name) — shown to the model as taken. */
export type TakenPages = Map<string, string>;

export function candidatePagesFor(node: NodeInfo, pages: PageRecord[], election: PageElection, cap: number = MAP_CANDIDATES, taken?: TakenPages): Candidate[] {
  const nodeToks = new Set<string>();
  for (const t of tokens(node.name)) nodeToks.add(stem(t));
  const parentToks = new Set<string>();
  for (const seg of node.path.slice(0, -1)) for (const t of tokens(seg)) parentToks.add(stem(t));
  const kwToks = new Map<string, number>();
  for (const k of node.own.slice(0, 40)) for (const t of tokens(k.keyword)) { const s = stem(t); kwToks.set(s, (kwToks.get(s) ?? 0) + k.searchVolume); }
  const kwMax = Math.max(1, ...Array.from(kwToks.values()));
  const evid = new Map<string, { kw: number; vol: number; best: number }>();
  for (const c of election.candidates) evid.set(c.norm, { kw: c.kw, vol: c.vol, best: c.best });

  const scored: Candidate[] = [];
  for (const p of pages) {
    if (p.type === 'support' || p.type === 'other' || p.type === 'location') continue;   // never a cluster's landing page
    const pt = new Set<string>();
    for (const t of tokens(p.path)) pt.add(stem(t));
    for (const t of tokens(pageTitle(p))) pt.add(stem(t));
    for (const t of tokens(pageH1(p))) pt.add(stem(t));
    for (const t of tokens(p.topic ?? '')) pt.add(stem(t));
    let score = 0;
    for (const t of Array.from(nodeToks)) if (pt.has(t)) score += 3;
    for (const t of Array.from(parentToks)) if (pt.has(t)) score += 1;
    for (const [t, v] of Array.from(kwToks.entries())) if (pt.has(t)) score += 2 * (v / kwMax);
    const e = evid.get(normContentUrl(p.url));
    if (e) score += 2 + Math.min(3, e.kw / 3);
    if (score <= 0) continue;
    scored.push({ n: 0, page: p, score, evidenceKw: e?.kw ?? 0, evidenceVol: e?.vol ?? 0, evidenceBest: e ? e.best : null });
  }
  scored.sort((a, b) => b.score - a.score || a.page.depth - b.page.depth || a.page.url.localeCompare(b.page.url));
  let out = scored.slice(0, cap);
  // v7.550: a category-level cluster (a product line or a node with sub-categories) is ALWAYS offered
  // every hub / comparison page on the site — the spanning hub it belongs on ("view all", "compare")
  // rarely shares the node's words, so a lexical cut could leave it out (Citi: Credit Card Types
  // was never shown /credit-cards/view-all-credit-cards). Hubs are few; the list stays bounded.
  if (node.depth <= 2 || node.children.length > 0) {
    const have = new Set(out.map(c => c.page.url));
    const hubs = pages.filter(p => (p.type === 'hub' || p.type === 'comparison') && !have.has(p.url))
      .map(p => { const e = evid.get(normContentUrl(p.url)); return { n: 0, page: p, score: 0, evidenceKw: e?.kw ?? 0, evidenceVol: e?.vol ?? 0, evidenceBest: e ? e.best : null } as Candidate; })
      .sort((a, b) => a.page.depth - b.page.depth || a.page.url.localeCompare(b.page.url))
      .slice(0, HUB_CANDIDATE_CAP);
    out = out.concat(hubs);
  }
  if (taken && taken.size) for (const c of out) { const t = taken.get(normContentUrl(c.page.url)); if (t) c.takenBy = t; }
  out.forEach((c, i) => { c.n = i + 1; });
  return out;
}

/** The pages this node's descendants are already matched to (from the stored node map). */
export function takenByDescendants(node: NodeInfo, mapping: Record<string, NodeMapping>): TakenPages {
  const out: TakenPages = new Map();
  const prefix = node.key + ' › ';
  for (const [k, m] of Object.entries(mapping)) {
    if (!k.startsWith(prefix) || !m || m.status !== 'mapped' || !m.url) continue;
    const norm = normContentUrl(m.url);
    if (!out.has(norm)) out.set(norm, k.slice(prefix.length).split(' › ')[0]);
  }
  return out;
}

// ─── Claude prompts (pure text) ──────────────────────────────────────────────────────

export const trunc = (s: string, n: number = TITLE_MAX): string => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

export function buildPageLabelPrompt(host: string, pages: PageRecord[]): string {
  const lines = pages.map((p, i) => { const t = pageTitle(p), h = pageH1(p); return `${i + 1}. ${p.path}${t ? ` | title: ${trunc(t)}` : ''}${h && h !== t ? ` | h1: ${trunc(h)}` : ''}${!t ? ' | (page text unavailable — judge by the path)' : ''}`; }).join('\n');
  return `You are classifying pages on ${host} by the ROLE each page plays on the site.

PAGES:
${lines}

Types (answer with the word):
- hub         a category / listing page that presents a RANGE of products or topics (e.g. "all credit cards", "travel cards", "savings accounts")
- product     ONE specific product, plan, account or offer (its own name) — the page you apply on or buy from
- guide       an article, explainer, how-to, FAQ or educational page
- comparison  a page whose purpose is comparing options side by side
- support     login, account access, customer service, app, forms, status, contact
- location    a branch / office / store / city page
- other       anything else (legal, careers, press, campaigns, tools without a product)

Rules:
- Judge by what the page IS FOR, not by a word it shares with another type.
- Also give a short topic — the subject of the page in at most 6 words (e.g. "travel rewards credit cards", "Strata Premier card", "how to avoid interest").
- Give YOUR confidence from 0 to 1.
- Answer every page exactly once.

Respond with STRICT JSON only, no prose:
{"p":[[pageNumber,"type","topic",confidence],...]}`;
}

export function parsePageLabels(text: string, count: number): Array<{ type: PageType; topic: string; confidence: number } | undefined> {
  const out: Array<{ type: PageType; topic: string; confidence: number } | undefined> = new Array(count).fill(undefined);
  const arr = parseJsonArray(text, 'p');
  for (const row of arr) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const i = Number(row[0]) - 1;
    const type = String(row[1] ?? '').toLowerCase().trim() as PageType;
    if (!Number.isInteger(i) || i < 0 || i >= count || out[i] !== undefined) continue;
    if (!PAGE_TYPES.includes(type)) continue;
    let conf = Number(row[3]); if (!Number.isFinite(conf)) conf = 0; conf = Math.max(0, Math.min(1, conf));
    out[i] = { type, topic: trunc(String(row[2] ?? ''), 60), confidence: Math.round(conf * 100) / 100 };
  }
  return out;
}

export interface NodePromptItem { node: NodeInfo; candidates: Candidate[] }

export function buildNodeMapPrompt(host: string, items: NodePromptItem[]): string {
  const levelOf = (n: NodeInfo) => n.depth === 1 ? 'PRODUCT LINE (top level)' : n.children.length ? `CATEGORY (has sub-categories: ${n.children.slice(0, 6).join(', ')}${n.children.length > 6 ? ', …' : ''})` : 'SPECIFIC TOPIC (leaf)';
  const blocks = items.map((it, i) => {
    const n = it.node;
    // v7.551: the theme is carried by the NON-branded terms — a branded term names a product, not the theme
    const nb = n.own.filter(k => !k.isBranded), br = n.own.length - nb.length;
    const shown = (nb.length ? nb : n.own).slice(0, NODE_KW_SHOWN);
    const kws = shown.map(k => `${k.keyword} (${k.searchVolume}/mo)`).join('; ') + (nb.length && br ? ` [+ ${br} branded term${br === 1 ? '' : 's'} not shown]` : '');
    const cands = it.candidates.map(c => `   ${c.n}. ${c.page.path} — ${c.page.type ? PAGE_TYPE_LABEL[c.page.type] : 'type unknown'}${c.page.topic ? ` — ${c.page.topic}` : pageTitle(c.page) ? ` — ${trunc(pageTitle(c.page), 70)}` : ''}${c.evidenceKw ? ` — ranks for ${c.evidenceKw} of this cluster's keywords` : ''}${c.takenBy ? ` — ALREADY the page of sub-category "${c.takenBy}" (not this cluster's page)` : ''}`).join('\n');
    return `CLUSTER ${i + 1}: ${n.path.join(' > ')}
   level: ${levelOf(n)} · dominant intent: ${n.intent} · ${n.own.length} keywords filed here (${n.all.length} incl. sub-levels)
   keywords: ${kws || '(none filed at this level — judge by the name and its sub-categories)'}
   candidate pages:
${cands || '   (no candidate page on the site matches this theme)'}`;
  }).join('\n\n');
  return `You are matching keyword clusters to the ONE page on ${host} that should be their landing page — matched by INTENT and THEME, not by which page happens to rank.

${blocks}

Rules:
- A PRODUCT LINE or CATEGORY cluster belongs on a category hub about that theme (a listing / "view all" / range page), never on one specific product's page even if that product dominates the keywords.
- A CATEGORY cluster that has sub-categories belongs on the hub that SPANS all of them (an overview / "view all" / "compare" / "all X" page) — not on the hub of one of its own sub-categories (a cash-back hub is the page for the Cash Back sub-category, not for "Credit Card Types").
- A candidate marked ALREADY the page of a sub-category is that sub-category's page and can NEVER be this cluster's answer. If no page spans the whole cluster, answer 0 — the site needs to build the spanning page.
- A SPECIFIC TOPIC cluster about one product belongs on that product's page; an informational cluster belongs on the guide / article about it; a comparison cluster on the comparison page.
- "ranks for N keywords" is evidence, not the decision: a product page that ranks for category terms is still the wrong page for a category cluster.
- Answer 0 when no listed page is about this theme at the right level — the site needs to build one. Never pick a loosely related page just to answer.
- Give YOUR confidence from 0 to 1 that the chosen page is the right landing page.
- Answer every cluster exactly once with a candidate number from ITS OWN list (or 0).

Respond with STRICT JSON only, no prose:
{"m":[[clusterNumber,candidateNumber,confidence],...]}`;
}

export function parseNodeMaps(text: string, items: NodePromptItem[]): Array<{ url: string | null; confidence: number } | undefined> {
  const out: Array<{ url: string | null; confidence: number } | undefined> = new Array(items.length).fill(undefined);
  const arr = parseJsonArray(text, 'm');
  for (const row of arr) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const i = Number(row[0]) - 1, c = Number(row[1]);
    if (!Number.isInteger(i) || i < 0 || i >= items.length || out[i] !== undefined) continue;
    let conf = Number(row[2]); if (!Number.isFinite(conf)) conf = 0; conf = Math.max(0, Math.min(1, conf));
    conf = Math.round(conf * 100) / 100;
    if (c === 0) { out[i] = { url: null, confidence: conf }; continue; }
    const hit = items[i].candidates.find(x => x.n === c);
    if (hit) out[i] = { url: hit.page.url, confidence: conf };
  }
  return out;
}

function parseJsonArray(text: string, key: string): any[] {
  const cleaned = String(text ?? '').replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  try { const j = JSON.parse(cleaned); return Array.isArray(j?.[key]) ? j[key] : []; }
  catch { const m = cleaned.match(/\{[\s\S]*\}/); if (m) { try { const j = JSON.parse(m[0]); return Array.isArray(j?.[key]) ? j[key] : []; } catch { return []; } } return []; }
}

export function mappingFor(pick: { url: string | null; confidence: number }, sig: string, at: string): NodeMapping {
  return {
    url: pick.url, confidence: pick.confidence,
    status: pick.url === null ? 'none' : pick.confidence < MAP_REVIEW_BELOW ? 'review' : 'mapped',
    nodeSig: sig, mappedAt: at, model: PAGE_MAP_MODEL, mapVersion: PAGE_MAP_VERSION,
  };
}

// ─── resolution: THE one read rule ────────────────────────────────────────────────────

export type PageBasisAll = 'override' | 'map' | 'vote-non-branded' | 'vote-branded-only' | 'vote-deep-only' | 'none';

export interface ResolvedNodePage {
  url:        string | null;
  basis:      PageBasisAll;
  /** map status when a mapping exists for this node (even when the vote or override won) */
  mapStatus:  'mapped' | 'review' | 'none' | 'pending';
  mapUrl:     string | null;
  confidence: number | null;
  override:   PageOverride | null;
  election:   PageElection;     // the ranking evidence, always computed
  /** ranking evidence for the RESOLVED url: keywords / volume / best rank among this node's keywords */
  evidence:   { kw: number; vol: number; best: number | null };
}

export function resolveNodePage(key: string, kws: PageVoteKw[], mapping: Record<string, NodeMapping> | null | undefined, overrides: PageOverrides | null | undefined, opts: { maxPos?: number } = {}): ResolvedNodePage {
  const election = electPage(kws, opts);
  const k = pageOverrideKey(key);
  const m = mapping?.[k] ?? null;
  const o = overrides?.[k] ?? null;
  const mapStatus: ResolvedNodePage['mapStatus'] = m ? m.status : 'pending';
  const evidenceFor = (url: string | null) => {
    if (!url) return { kw: 0, vol: 0, best: null };
    const norm = normContentUrl(url);
    const c = election.candidates.find(x => x.norm === norm);
    return c ? { kw: c.kw, vol: c.vol, best: c.best } : { kw: 0, vol: 0, best: null };
  };
  if (o && typeof o.url === 'string' && o.url.trim()) {
    return { url: o.url.trim(), basis: 'override', mapStatus, mapUrl: m?.url ?? null, confidence: m?.confidence ?? null, override: o, election, evidence: evidenceFor(o.url.trim()) };
  }
  if (m && m.status === 'mapped' && m.url) {
    return { url: m.url, basis: 'map', mapStatus, mapUrl: m.url, confidence: m.confidence, override: null, election, evidence: evidenceFor(m.url) };
  }
  if (m && m.status === 'none') {
    // the model said no page on the site is about this theme at this level — honest gap (I.5);
    // the ranking vote is NOT substituted (that is the exact failure this map replaces)
    return { url: null, basis: 'none', mapStatus, mapUrl: null, confidence: m.confidence, override: null, election, evidence: { kw: 0, vol: 0, best: null } };
  }
  // pending or review → the ranking vote, labelled as a fallback
  const basis: PageBasisAll = election.basis === 'non-branded' ? 'vote-non-branded' : election.basis === 'branded-only' ? 'vote-branded-only' : election.basis === 'deep-only' ? 'vote-deep-only' : 'none';
  const url = election.page?.url ?? null;
  return { url, basis, mapStatus, mapUrl: m?.url ?? null, confidence: m?.confidence ?? null, override: null, election, evidence: evidenceFor(url) };
}

export function basisLabelAll(b: PageBasisAll, mapStatus?: ResolvedNodePage['mapStatus']): string {
  switch (b) {
    case 'override':          return 'set by you';
    case 'map':               return 'intent-matched';
    case 'vote-non-branded':  return mapStatus === 'review' ? 'review · ranking page shown' : mapStatus === 'pending' ? 'mapping pending · ranking page' : 'ranking page';
    case 'vote-branded-only': return mapStatus === 'review' ? 'review · branded-ranking page' : 'branded ranking only';
    case 'vote-deep-only':    return mapStatus === 'review' ? 'review · deep-ranking page' : 'deep ranking only';
    case 'none':              return mapStatus === 'none' ? 'no page — build' : 'no ranking page';
  }
}
