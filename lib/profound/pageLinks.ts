/**
 * lib/profound/pageLinks.ts — v7.547
 *
 * THE ONE basis that connects the AI Answer Engines panel's prompt data (the uploaded
 * Profound exports) to the pages in Product Insights (Wayne, 2026-10-09: "connect the
 * prompt data from the ai answer panel to the individual pages and have it show up in
 * the product insight panel").
 *
 * Two lanes, never blended, each labelled on every surface (Const I.1 / I.5a):
 *
 *   LANE 1 · MEASURED — URL citation match. A recorded answer's `citation_N` URL on the
 *   client's own domain is normalised with the SAME `normContentUrl` the URL-rooted
 *   clusters use (v7.541, Const III.5) and matched to a topic's ranking page(s). A direct
 *   count of real rows: "this page was cited in N answers to this prompt on these engines".
 *
 *   LANE 2 · ASSIGNED — the prompt filed into the stored taxonomy by the Claude filer
 *   (lib/profound/promptFiler.ts), stored once with the model's own confidence and never
 *   re-derived at read time (Const III.1b). It answers "which page SHOULD be answering
 *   this prompt" for the prompts the client was merely named in, or absent from.
 *
 * The store this module builds at upload time (`ProfoundLinkStore`) is BOUNDED — one row
 * per distinct prompt (~1k on a real export), never the 100k+ answer rows — and lives in
 * its own `projects.profound_page_links` column so Product Insights can read it without
 * loading the panel's metrics blob (Const II.9). Everything here is pure: the streaming
 * upload feeds `createLinkAccumulator`, the Product Insights panel AND the Assessment PDF
 * both read `joinPromptsToTopics` / `buildGapViews` (Const II.6b / II.7).
 */

import { normContentUrl, pathOfNormUrl } from '@/lib/utils/pageUrl';
import { brandRootOf, hostOf } from '@/lib/utils/brandRoot';

export const PAGE_LINKS_VERSION = 1;

/** Caps keep the stored blob bounded; every cap is disclosed via the `*Total` fields (I.6). */
export const LINK_PROMPT_CAP    = 3000;   // distinct prompts kept (most-answered first)
export const LINK_OWNED_CAP     = 20;     // owned paths kept per prompt
export const LINK_RIVAL_CAP     = 12;     // cited third-party domains kept per prompt
export const ASSIGN_REVIEW_BELOW = 0.6;   // filer confidence under this → Needs Review (III.7)

export interface EngineTally { runs: number; named: number; cited: number }

export interface ProfoundPromptLink {
  prompt:  string;
  topic:   string;                          // Profound's own topic label, verbatim
  runs:    number;                          // Visibility-typed answers recorded for this prompt
  named:   number;                          // of those, answers Profound flags `mentioned? = Yes`
  cited:   number;                          // of those, answers citing ≥1 owned URL
  engines: Record<string, EngineTally>;     // per platform, verbatim platform label
  owned:   Record<string, number>;          // owned path (citationPathOf) → answers citing it (capped)
  ownedTotal: number;                       // distinct owned paths seen before the cap
  rivals:  Record<string, number>;          // third-party cited domain → answers citing it (capped)
  rivalTotal: number;                       // distinct third-party domains seen before the cap
}

export type AssignStatus = 'assigned' | 'review' | 'none';

export interface PromptAssignment {
  /** Full stored chain, umbrella first — the taxonomy path the prompt was filed under. */
  path:       string[];
  node:       string;                       // leaf node name (= Topic.product)
  /** The model's OWN estimate 0–1 (labelled; never a data metric — Const III.7). */
  confidence: number;
  status:     AssignStatus;                 // 'none' = the filer answered "no fit" (0)
  filedAt:    string;
  model:      string;
}

export interface ProfoundLinkStore {
  version:     number;
  builtAt:     string;
  sourceFile:  string;
  clientRoot:  string;                      // brandRootOf(project domain) used for OWNED detection
  totalRows:   number;                      // visibility-typed answers read (BROAD set: every type containing 'Visibility', v7.548)
  hasNamedFlag: boolean;                    // the export carried `mentioned?` (else `named` is unknowable, I.5)
  promptTotal: number;                      // distinct prompts seen (may exceed prompts.length — capped)
  prompts:     ProfoundPromptLink[];
  assignments?: Record<string, PromptAssignment>;   // keyed by promptKey(prompt)
  assignedAt?:  string;
}

export const promptKey = (p: string): string => String(p ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Owned test: the cited URL's registrable brand root equals the client's. Same root rule as
 *  v7.533 (creditcards.chase.com → chase), so a subdomain is still the client's own page. */
export function isOwnedUrl(url: string, clientRoot: string): boolean {
  if (!clientRoot) return false;
  let host = '';
  try { host = new URL(url).hostname; } catch { host = hostOf(url); }
  return brandRootOf(host) === clientRoot;
}

/** The path identity of a client ranking URL — the SAME identity a cluster page carries. */
export function ownedPathOf(url: string): string {
  return pathOfNormUrl(normContentUrl(url));
}

/** Query keys an AI engine appends to a citation link (ChatGPT's utm_source=chatgpt.com, Google's
 *  srsltid, ad/click ids). They are not part of the page's identity, so they are removed from the
 *  CITATION side only — the cluster side keeps normContentUrl's query untouched. */
// v7.548: + msockid (Copilot/Bing), ef_id, _ga/_gl, s_cid/sc_cid, ncid, mkwid/pcrid, trk — seen on Citi's citations
const TRACKING_KEY = /^(utm_[a-z0-9_]*|srsltid|gclid|gbraid|wbraid|fbclid|msclkid|msockid|dclid|twclid|ttclid|yclid|igshid|mc_cid|mc_eid|ref|ref_src|ref_url|_hsenc|_hsmi|vero_id|mkt_tok|cmpid|icid|s_kwcid|ocid|ef_id|_ga|_gl|s_cid|sc_cid|ncid|mkwid|pcrid|trk|trkcampaign)$/i;
export function citationPathOf(url: string): string {
  let u: URL | null = null;
  try { u = new URL(url); } catch { return ownedPathOf(url); }
  const keep: string[] = [];
  u.searchParams.forEach((v, k) => { if (!TRACKING_KEY.test(k)) keep.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`); });
  const base = `${u.protocol}//${u.host}${u.pathname}`;
  return ownedPathOf(keep.length ? `${base}?${keep.join('&')}` : base);
}

export interface LinkRowInput {
  prompt:    string;
  topic:     string;
  platform:  string;
  /** Profound's `mentioned?` flag: true/false when the column exists, null when it does not. */
  mentioned: boolean | null;
  citations: string[];                      // every citation_N cell on the row (non-empty)
}

/**
 * Streaming accumulator — fed one Visibility-typed row at a time by the upload pass,
 * finished once. Holds one entry per distinct prompt, so memory is O(prompts), not O(rows).
 */
export function createLinkAccumulator(clientDomain: string) {
  const clientRoot = brandRootOf(clientDomain);
  const byPrompt = new Map<string, ProfoundPromptLink & { rivalSeen: Set<string>; ownedSeen: Set<string> }>();
  let totalRows = 0;
  let hasNamedFlag = false;

  const add = (r: LinkRowInput): void => {
    const prompt = String(r.prompt ?? '').trim();
    if (!prompt) return;
    totalRows++;
    if (r.mentioned !== null) hasNamedFlag = true;
    const key = promptKey(prompt);
    let e = byPrompt.get(key);
    if (!e) {
      e = { prompt, topic: String(r.topic ?? '').trim(), runs: 0, named: 0, cited: 0, engines: {}, owned: {}, ownedTotal: 0, rivals: {}, rivalTotal: 0, rivalSeen: new Set(), ownedSeen: new Set() };
      byPrompt.set(key, e);
    }
    const plat = String(r.platform ?? '').trim() || 'unknown';
    const et = e.engines[plat] ?? (e.engines[plat] = { runs: 0, named: 0, cited: 0 });
    e.runs++; et.runs++;
    if (r.mentioned === true) { e.named++; et.named++; }
    let citedOwned = false;
    const seenOwned = new Set<string>();
    const seenRival = new Set<string>();
    for (const u of r.citations) {
      if (!u || u.indexOf('http') !== 0) continue;
      if (isOwnedUrl(u, clientRoot)) {
        const p = citationPathOf(u);
        if (seenOwned.has(p)) continue;
        seenOwned.add(p);
        citedOwned = true;
        if (!e.ownedSeen.has(p)) { e.ownedSeen.add(p); e.ownedTotal++; }
        if (p in e.owned || Object.keys(e.owned).length < LINK_OWNED_CAP) e.owned[p] = (e.owned[p] ?? 0) + 1;
      } else {
        let host = '';
        try { host = new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { continue; }
        if (!host || seenRival.has(host)) continue;
        seenRival.add(host);
        if (!e.rivalSeen.has(host)) { e.rivalSeen.add(host); e.rivalTotal++; }
        if (host in e.rivals || Object.keys(e.rivals).length < LINK_RIVAL_CAP) e.rivals[host] = (e.rivals[host] ?? 0) + 1;
      }
    }
    if (citedOwned) { e.cited++; et.cited++; }
  };

  const finish = (sourceFile: string): ProfoundLinkStore => {
    const all = Array.from(byPrompt.values()).sort((a, b) => b.runs - a.runs || a.prompt.localeCompare(b.prompt));
    const prompts: ProfoundPromptLink[] = all.slice(0, LINK_PROMPT_CAP).map(e => {
      const { rivalSeen: _s, ownedSeen: _o, ...rest } = e;
      // rivals ordered most-cited first so every reader shows the real leaders
      const rivals: Record<string, number> = {};
      for (const [h, n] of Object.entries(rest.rivals).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))) rivals[h] = n;
      return { ...rest, rivals };
    });
    return {
      version: PAGE_LINKS_VERSION, builtAt: new Date().toISOString(), sourceFile, clientRoot,
      totalRows, hasNamedFlag, promptTotal: all.length, prompts,
    };
  };

  return { add, finish, get size() { return byPrompt.size; } };
}

// ─── Reading side: join prompts to topics ──────────────────────────────────

/** The minimum a reader needs from a Topic — the panel passes real Topics, the PDF the same. */
export interface LinkTopicLike {
  id:       string;
  product:  string;
  parentName?: string;
  totalVolume: number;
  keywords: Array<{ position: number | null; url?: string; searchVolume?: number; isGap?: boolean; origin?: string }>;
  /** v7.549: the cluster's resolved page (override → page map → ranking vote) — the primary page when set */
  pageUrl?: string;
  mergedIds?: string[];
  mergedTopics?: Array<{ id: string; name: string }>;
}

/** 'unknown' = filed to the topic, not cited, and the export carries NO mentioned? column — whether
 *  the answer named the brand is unknowable, so it is never shown as absent (I.5). */
export type PromptBucket = 'cited' | 'named' | 'absent' | 'unknown';

export interface TopicPromptRow {
  link:     ProfoundPromptLink;
  bucket:   PromptBucket;
  /** Lane: 'measured' when attached by a citation URL on this topic's page; 'assigned' when filed.
   *  v7.548: a CITED row can be 'assigned' — the answers cite an owned page that is no topic's
   *  ranking page, and the prompt was filed here; `paths` then names that page (not in the pool). */
  lane:     'measured' | 'assigned';
  /** Owned paths the answers cited: this topic's page (measured) or the un-pooled page (assigned). */
  paths:    string[];
  assignment?: PromptAssignment;
}

export interface TopicPromptSummary {
  topicId:  string;
  cited:    number;
  named:    number;
  absent:   number;
  unknown:  number;                         // filed, not cited, mention flag absent from the export
  review:   number;                         // assigned here but below the confidence threshold
  /** per engine over the attached prompts: answers citing ANY owned page / answers recorded
   *  (the store is prompt-level; it does not say which owned page each engine cited) */
  engines:  Record<string, { cited: number; runs: number }>;
  rows:     TopicPromptRow[];
  /** this topic's page identities: primary (displayed) first, then every other client URL ranking here */
  pages:    string[];
  /** set when this topic's primary page is cited, but the citations are counted on ANOTHER topic
   *  that shares the page (one page = one owner) — the name of that topic */
  citedOn?: string;
}

export interface JoinResult {
  byTopic:  Map<string, TopicPromptSummary>;
  /** owned paths cited by answers that match NO topic's ranking page — disclosed, never dropped (I.5) */
  unmappedOwned: Array<{ path: string; prompts: number; answers: number }>;
  /** assigned to a node that is not among the topics passed (another line, or a hidden category) */
  assignedElsewhere: number;
  /** assigned to a node NAME that matches more than one topic and no id — not guessed onto either */
  assignedAmbiguous: number;
  /** prompts whose answers cite an owned URL that is no topic's page and are NOT filed yet — never named/absent */
  citedUnmappedOnly: number;
  /** every primary page cited at least once (by its owner topic) */
  citedPages: Set<string>;
  counts: { prompts: number; citedAny: number; namedAny: number; assigned: number; review: number; noFit: number; unassigned: number };
}

/** Primary page = the topic's displayed "your page" — v7.549: the cluster's resolved `pageUrl`
 *  (override → intent-matched page map → ranking vote, the SAME rule every surface reads); a
 *  topic without one (pre-v7.549 shape) falls back to the best-ranked keyword's URL. Then every
 *  other client URL ranking for its keywords. */
export function topicPages(t: LinkTopicLike): string[] {
  let bestPos: number | null = null; let bestUrl = t.pageUrl ? (ownedPathOf(t.pageUrl) ?? '') : '';
  const others = new Map<string, number>();
  for (const k of t.keywords) {
    // real client rank + URL rows only — a competitor gap row's URL is never a client page (v7.541 rule)
    if (k.position === null || k.position < 1 || !k.url || k.isGap || k.origin === 'demand') continue;
    const p = ownedPathOf(k.url);
    if (!p) continue;
    others.set(p, (others.get(p) ?? 0) + (k.searchVolume ?? 0));
    if (!t.pageUrl && (bestPos === null || k.position < bestPos)) { bestPos = k.position; bestUrl = p; }
  }
  const out: string[] = [];
  if (bestUrl) out.push(bestUrl);
  for (const [p] of Array.from(others.entries()).sort((a, b) => b[1] - a[1])) if (!out.includes(p)) out.push(p);
  return out;
}

const topicIdOfPath = (path: string[]): string => 'tax:path:' + path.join(' › ');

export function joinPromptsToTopics(store: ProfoundLinkStore | null, topics: LinkTopicLike[]): JoinResult {
  const byTopic = new Map<string, TopicPromptSummary>();
  const empty: JoinResult = { byTopic, unmappedOwned: [], assignedElsewhere: 0, assignedAmbiguous: 0, citedUnmappedOnly: 0, citedPages: new Set(),
    counts: { prompts: 0, citedAny: 0, namedAny: 0, assigned: 0, review: 0, noFit: 0, unassigned: 0 } };
  if (!store || !Array.isArray(store.prompts) || store.prompts.length === 0) return empty;

  // page → topic (primary page wins; else the highest-volume topic that URL ranks in)
  const pageOwner = new Map<string, LinkTopicLike>();
  const pagesOf = new Map<string, string[]>();
  const sorted = topics.slice().sort((a, b) => b.totalVolume - a.totalVolume);
  for (const t of sorted) {
    const pages = topicPages(t);
    pagesOf.set(t.id, pages);
    byTopic.set(t.id, { topicId: t.id, cited: 0, named: 0, absent: 0, unknown: 0, review: 0, engines: {}, rows: [], pages });
  }
  for (const t of sorted) { const p = pagesOf.get(t.id)![0]; if (p && !pageOwner.has(p)) pageOwner.set(p, t); }
  for (const t of sorted) for (const p of pagesOf.get(t.id)!.slice(1)) if (!pageOwner.has(p)) pageOwner.set(p, t);

  // taxonomy id → topic (own id, or an absorbed node's id/name — v7.541 merges)
  const nodeOwner = new Map<string, LinkTopicLike>();
  const nameOwner = new Map<string, LinkTopicLike[]>();
  for (const t of sorted) {
    nodeOwner.set(t.id, t);
    for (const id of t.mergedIds ?? []) if (!nodeOwner.has(id)) nodeOwner.set(id, t);
    const names = [t.product, ...(t.mergedTopics ?? []).map(m => m.name)];
    for (const n of names) { const k = n.toLowerCase(); const l = nameOwner.get(k) ?? []; if (!l.includes(t)) l.push(t); nameOwner.set(k, l); }
  }
  const resolveAssigned = (a: PromptAssignment): LinkTopicLike | 'ambiguous' | null => {
    const byId = nodeOwner.get(topicIdOfPath(a.path));
    if (byId) return byId;
    const byName = nameOwner.get(String(a.node ?? '').toLowerCase());
    if (!byName) return null;
    return byName.length === 1 ? byName[0] : 'ambiguous';   // ambiguous name → not guessed (I.5)
  };

  const assignments = store.assignments ?? {};
  const unmapped = new Map<string, { prompts: Set<string>; answers: number }>();
  const counts = { prompts: store.prompts.length, citedAny: 0, namedAny: 0, assigned: 0, review: 0, noFit: 0, unassigned: 0 };
  let assignedElsewhere = 0, assignedAmbiguous = 0, citedUnmappedOnly = 0;
  const citedPages = new Set<string>();

  for (const link of store.prompts) {
    if (link.cited > 0) counts.citedAny++;
    if (link.named > 0) counts.namedAny++;
    const a = assignments[promptKey(link.prompt)];
    if (!a) counts.unassigned++;
    else if (a.status === 'none') counts.noFit++;
    else if (a.status === 'review') counts.review++;
    else counts.assigned++;

    // Lane 1 — measured: every owned path cited → the topic owning that page
    const hitTopics = new Map<LinkTopicLike, string[]>();
    for (const [p, n] of Object.entries(link.owned)) {
      const t = pageOwner.get(p);
      if (t) { const l = hitTopics.get(t) ?? []; l.push(p); hitTopics.set(t, l); }
      else { const u = unmapped.get(p) ?? { prompts: new Set(), answers: 0 }; u.prompts.add(link.prompt); u.answers += n; unmapped.set(p, u); }
    }
    for (const [t, paths] of Array.from(hitTopics.entries())) {
      const s = byTopic.get(t.id)!;
      s.cited++;
      for (const p of paths) citedPages.add(p);
      s.rows.push({ link, bucket: 'cited', lane: 'measured', paths, assignment: a });
      for (const [eng, et] of Object.entries(link.engines)) {
        const x = s.engines[eng] ?? (s.engines[eng] = { cited: 0, runs: 0 });
        x.runs += et.runs; x.cited += et.cited;
      }
    }

    // Lane 2 — assigned: the prompt's filed node. ONE home per prompt: a prompt whose answers
    // already cite one of the client's topic pages lives on that page (measured) and is never
    // also counted as named/absent on the topic it was filed to (no double counting, I.3). A
    // prompt that cites an owned URL no topic owns is disclosed in unmappedOwned and likewise
    // never filed as named/absent — an answer DID cite the client.
    if (hitTopics.size > 0) continue;
    const citesUnpooled = link.cited > 0;   // cites an owned page no topic owns (not in the ranking pool)
    if (a && a.status !== 'none') {
      const t = resolveAssigned(a);
      if (t === 'ambiguous') { assignedAmbiguous++; continue; }
      if (!t) { assignedElsewhere++; continue; }
      const s = byTopic.get(t.id)!;
      // v7.548 (Wayne: "prompts mapped to an individual page below in the category structure"):
      // a prompt that cites an un-pooled owned page lands on its FILED topic as CITED, with that
      // page named — the answer did cite the client; the page just holds no keyword rank.
      const bucket: PromptBucket = citesUnpooled ? 'cited' : !store.hasNamedFlag ? 'unknown' : link.named > 0 ? 'named' : 'absent';
      if (bucket === 'cited') s.cited++; else if (bucket === 'named') s.named++; else if (bucket === 'absent') s.absent++; else s.unknown++;
      if (a.status === 'review') s.review++;
      s.rows.push({ link, bucket, lane: 'assigned', paths: citesUnpooled ? Object.keys(link.owned) : [], assignment: a });
      for (const [eng, et] of Object.entries(link.engines)) {
        const x = s.engines[eng] ?? (s.engines[eng] = { cited: 0, runs: 0 });
        x.runs += et.runs; if (citesUnpooled) x.cited += et.cited;
      }
    } else if (citesUnpooled) citedUnmappedOnly++;
  }

  const order: Record<PromptBucket, number> = { cited: 0, named: 1, absent: 2, unknown: 2 };
  for (const s of Array.from(byTopic.values())) {
    s.rows.sort((x, y) => order[x.bucket] - order[y.bucket] || y.link.runs - x.link.runs || x.link.prompt.localeCompare(y.link.prompt));
    // a topic whose primary page is cited, counted on the page's owner topic
    if (s.cited === 0 && s.pages[0] && citedPages.has(s.pages[0])) { const o = pageOwner.get(s.pages[0]); if (o && o.id !== s.topicId) s.citedOn = o.product; }
  }

  return {
    byTopic,
    unmappedOwned: Array.from(unmapped.entries()).map(([path, u]) => ({ path, prompts: u.prompts.size, answers: u.answers })).sort((a, b) => b.prompts - a.prompts || a.path.localeCompare(b.path)),
    assignedElsewhere, assignedAmbiguous, citedUnmappedOnly, citedPages,
    counts,
  };
}

// ─── v7.548: one summary for a SET of topics (a sub-category node and every level beneath) ──
// A prompt is counted ONCE per node even when it is cited on two of the node's topic pages
// (the cited row wins); engines and pages are unioned. The node row and its drawer read this.
export function summarizeTopics(join: JoinResult, topicIds: string[], key: string): TopicPromptSummary {
  const out: TopicPromptSummary = { topicId: key, cited: 0, named: 0, absent: 0, unknown: 0, review: 0, engines: {}, rows: [], pages: [] };
  const best = new Map<string, TopicPromptRow>();
  const order: Record<PromptBucket, number> = { cited: 0, named: 1, absent: 2, unknown: 2 };
  const pages = new Set<string>();
  for (const id of topicIds) {
    const s = join.byTopic.get(id);
    if (!s) continue;
    for (const p of s.pages) pages.add(p);
    for (const r of s.rows) {
      const k = promptKey(r.link.prompt);
      const cur = best.get(k);
      if (!cur || order[r.bucket] < order[cur.bucket]) best.set(k, cur ? { ...r, paths: Array.from(new Set([...cur.paths, ...r.paths])) } : r);
      else if (cur && r.bucket === cur.bucket && r.paths.length) best.set(k, { ...cur, paths: Array.from(new Set([...cur.paths, ...r.paths])) });
    }
  }
  for (const r of Array.from(best.values())) {
    out.rows.push(r);
    if (r.bucket === 'cited') out.cited++; else if (r.bucket === 'named') out.named++; else if (r.bucket === 'absent') out.absent++; else out.unknown++;
    if (r.assignment?.status === 'review' && r.lane === 'assigned') out.review++;
    for (const [eng, et] of Object.entries(r.link.engines)) {
      const x = out.engines[eng] ?? (out.engines[eng] = { cited: 0, runs: 0 });
      x.runs += et.runs; if (r.bucket === 'cited') x.cited += et.cited;
    }
  }
  out.rows.sort((x, y) => order[x.bucket] - order[y.bucket] || y.link.runs - x.link.runs || x.link.prompt.localeCompare(y.link.prompt));
  out.pages = Array.from(pages);
  return out;
}

// ─── Gap views (the two cards) ────────────────────────────────────────────

export interface NoPageGap { topicId: string; topic: string; theme: string; prompts: number; named: number; review: number; rivals: Array<{ domain: string; n: number }> }
/** absent = answers never name the brand; unknown = the export has no mentioned? column (never shown as absent) */
export interface NeverCitedGap { topicId: string; topic: string; theme: string; page: string; bestPos: number | null; absent: number; named: number; unknown: number; cited: number; rivals: Array<{ domain: string; n: number }> }

export interface GapViews {
  /** prompts filed to a topic that has no ranking page — the page to BUILD */
  noPage:      NoPageGap[];
  /** topics with a ranking page that answers never cite — the page to OPTIMISE */
  neverCited:  NeverCitedGap[];
}

function topRivals(rows: TopicPromptRow[], n = 3): Array<{ domain: string; n: number }> {
  const m = new Map<string, number>();
  for (const r of rows) for (const [d, c] of Object.entries(r.link.rivals)) m.set(d, (m.get(d) ?? 0) + c);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([domain, c]) => ({ domain, n: c }));
}

export function buildGapViews(join: JoinResult, topics: LinkTopicLike[]): GapViews {
  const noPage: NoPageGap[] = [];
  const neverCited: NeverCitedGap[] = [];
  for (const t of topics) {
    const s = join.byTopic.get(t.id);
    if (!s || s.rows.length === 0) continue;
    const theme = t.parentName ?? '';
    let bestPos: number | null = null;
    for (const k of t.keywords) if (k.position !== null && k.position >= 1 && !k.isGap && k.origin !== 'demand' && (bestPos === null || k.position < bestPos)) bestPos = k.position;
    if (s.pages.length === 0) {
      const assigned = s.rows.filter(r => r.lane === 'assigned');
      if (assigned.length) noPage.push({ topicId: t.id, topic: t.product, theme, prompts: assigned.length, named: s.named, review: s.review, rivals: topRivals(assigned) });
    } else if (s.cited === 0 && !s.citedOn && (s.absent + s.named + s.unknown) > 0) {
      // a page cited under ANOTHER topic that shares it is not a never-cited page (one page, one owner)
      neverCited.push({ topicId: t.id, topic: t.product, theme, page: s.pages[0], bestPos, absent: s.absent, named: s.named, unknown: s.unknown, cited: 0, rivals: topRivals(s.rows) });
    }
  }
  noPage.sort((a, b) => b.prompts - a.prompts || a.topic.localeCompare(b.topic));
  // the cheapest wins first: most absent prompts, then the better-ranking page
  neverCited.sort((a, b) => (b.absent + b.unknown) - (a.absent + a.unknown) || (a.bestPos ?? 999) - (b.bestPos ?? 999) || a.topic.localeCompare(b.topic));
  return { noPage, neverCited };
}

/** Engine order for dots/labels — Profound's six, then anything else the export carries. */
export const ENGINE_ORDER = ['ChatGPT', 'Google AI Overviews', 'Google AI Mode', 'Google Gemini', 'Microsoft Copilot', 'Perplexity'];
export function orderedEngines(keys: string[]): string[] {
  const rest = keys.filter(k => !ENGINE_ORDER.includes(k)).sort();
  return [...ENGINE_ORDER.filter(k => keys.includes(k)), ...rest];
}

/** TSV export of one topic's prompts — the same rows the drawer shows (II.6a). */
export function topicPromptsTsv(s: TopicPromptSummary): string {
  const lines = ['Prompt\tBucket\tLane\tAnswers\tNamed\tCited (any owned page)\tEngines (cited any owned page / answers)\tOwned pages cited\tOther domains cited\tAssigned node\tConfidence'];
  for (const r of s.rows) {
    const engs = orderedEngines(Object.keys(r.link.engines)).map(e => `${e} ${r.link.engines[e].cited}/${r.link.engines[e].runs}`).join('; ');
    const rivals = Object.entries(r.link.rivals).slice(0, 5).map(([d, n]) => `${d} ×${n}`).join('; ');
    lines.push([r.link.prompt.replace(/\t/g, ' '), r.bucket, r.lane, r.link.runs, r.link.named, r.link.cited, engs, r.paths.join('; '), rivals,
      r.assignment ? r.assignment.path.join(' > ') : '', r.assignment ? r.assignment.confidence.toFixed(2) : ''].join('\t'));
  }
  return lines.join('\n');
}
