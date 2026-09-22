/**
 * lib/scout/opportunity.ts — Scout's measured universe + the opportunity picker (v7.513).
 *
 * PURE functions, no I/O — so the retained suite can run the real code on fixtures.
 *
 * Exactness (Const I.1): Scout pulls each competitor's highest-volume page-one
 * keywords, sorted by volume, up to a row limit. When a list comes back FULL its
 * last row's volume V is a floor: below V the list is incomplete, above V it is
 * complete. The universe therefore keeps only keywords with volume STRICTLY above
 * the highest such floor, and the prospect is pulled with the same floor. Above
 * the floor every statement is exact — "competitor X is not on page one for this
 * keyword" is a fact, not a gap in the sample. The floor is printed on the report.
 *
 * No blended score (same stance as the Ranking Gap Diagnostic): a theme qualifies
 * on named, individually printed checks, and the report names ONE binding constraint.
 */

import {
  OPEN_BELOW_SHARE, HELD_FROM_SHARE, DEMAND_FLOOR_MONTHLY, AUTHORITY_TOLERANCE,
  PAGES_GAP_MULTIPLE, NEAR_WIN_MIN, CHECKS_TO_QUALIFY, MIN_THEME_KEYWORDS,
  AI_NAMED_FROM, AI_RIVAL_STRONG,
} from './config';

export interface PullRow { keyword: string; position: number; volume: number; url: string }
export interface DomainPull {
  domain: string;
  rows:   PullRow[];
  /** true when the request returned exactly its row limit — the list is cut at `floorVolume`. */
  full:   boolean;
  /** volume of the last (lowest-volume) row when `full`; null otherwise. */
  floorVolume: number | null;
}
export interface Placement { position: number; url: string }
export interface UKeyword {
  keyword:  string;
  volume:   number;
  prospect: Placement | null;             // top 20, else null
  rivals:   Record<string, Placement>;    // page one only
  slice:    string | null;                // product term this keyword was pulled under (product scope)
}
export interface Universe {
  keywords:     UKeyword[];
  floorVolume:  number;       // exclusive: every keyword has volume > floorVolume (0 = no floor reached)
  brandedDropped: number;
  belowFloorDropped: number;
}

const squash = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function isBranded(keyword: string, brandTokens: string[]): boolean {
  const flat = squash(keyword);
  return brandTokens.some(t => { const q = squash(t); return q.length >= 3 && flat.includes(q); });
}

/** The exclusive floor a set of pulls supports: the highest floor among the FULL lists. */
export function floorOf(pulls: DomainPull[]): number {
  let f = 0;
  for (const p of pulls) if (p.full && p.floorVolume !== null && p.floorVolume > f) f = p.floorVolume;
  return f;
}

export function buildUniverse(opts: {
  prospect:     DomainPull;
  competitors:  DomainPull[];
  brandTokens:  string[];
  slice?:       string | null;
}): Universe {
  const floor = floorOf([opts.prospect, ...opts.competitors]);
  const map = new Map<string, UKeyword>();
  let branded = 0, below = 0;
  const seenDrop = new Set<string>();
  const admit = (r: PullRow): UKeyword | null => {
    const k = r.keyword.toLowerCase().trim();
    if (!k || !(r.volume > 0) || !(r.position >= 1)) return null;
    if (r.volume <= floor) { if (!seenDrop.has('f' + k)) { seenDrop.add('f' + k); below++; } return null; }
    if (isBranded(k, opts.brandTokens)) { if (!seenDrop.has('b' + k)) { seenDrop.add('b' + k); branded++; } return null; }
    let u = map.get(k);
    if (!u) { u = { keyword: k, volume: r.volume, prospect: null, rivals: {}, slice: opts.slice ?? null }; map.set(k, u); }
    return u;
  };
  for (const c of opts.competitors) {
    for (const r of c.rows) {
      if (r.position > 10) continue;
      const u = admit(r); if (!u) continue;
      const prev = u.rivals[c.domain];
      if (!prev || r.position < prev.position) u.rivals[c.domain] = { position: r.position, url: r.url };
    }
  }
  for (const r of opts.prospect.rows) {
    if (r.position > 20) continue;
    const u = admit(r); if (!u) continue;
    if (!u.prospect || r.position < u.prospect.position) u.prospect = { position: r.position, url: r.url };
  }
  const keywords = Array.from(map.values()).sort((a, b) => b.volume - a.volume || a.keyword.localeCompare(b.keyword));
  return { keywords, floorVolume: floor, brandedDropped: branded, belowFloorDropped: below };
}

/** Union slice universes (product scope). First sighting wins; placements merge to best rank. */
export function mergeUniverses(parts: Universe[]): Universe {
  const map = new Map<string, UKeyword>();
  let floor = 0, branded = 0, below = 0;
  for (const p of parts) {
    floor = Math.max(floor, p.floorVolume); branded += p.brandedDropped; below += p.belowFloorDropped;
    for (const k of p.keywords) {
      const prev = map.get(k.keyword);
      if (!prev) { map.set(k.keyword, { ...k, rivals: { ...k.rivals } }); continue; }
      if (k.prospect && (!prev.prospect || k.prospect.position < prev.prospect.position)) prev.prospect = k.prospect;
      for (const d of Object.keys(k.rivals)) {
        const a = prev.rivals[d], b = k.rivals[d];
        if (!a || b.position < a.position) prev.rivals[d] = b;
      }
    }
  }
  const keywords = Array.from(map.values()).sort((a, b) => b.volume - a.volume || a.keyword.localeCompare(b.keyword));
  return { keywords, floorVolume: floor, brandedDropped: branded, belowFloorDropped: below };
}

// ─── Themes ──────────────────────────────────────────────────────────────────

export type ThemeState = 'held' | 'contested' | 'open';
export interface RivalStat { domain: string; p1Keywords: number; p1Volume: number; p1Share: number; pages: number }
export interface ThemeStat {
  name:        string;
  keywords:    UKeyword[];
  count:       number;
  demand:      number;                 // Σ monthly volume (Semrush)
  prospectP1:  number;                 // keywords where the prospect is on page one
  prospectP1Volume: number;
  share:       number;                 // prospectP1 / count
  state:       ThemeState;
  rivals:      RivalStat[];            // sorted, leader first
  leader:      RivalStat | null;
  nearWins:    UKeyword[];             // prospect at 11–20
  nearWinVolume: number;
  prospectPages: number;               // distinct prospect URLs ranking in the top 20 for the theme
}

const normUrl = (u: string) => String(u ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

export function themeStat(name: string, kws: UKeyword[], competitorDomains: string[]): ThemeStat {
  const count = kws.length;
  let demand = 0, p1 = 0, p1Vol = 0, nearVol = 0;
  const near: UKeyword[] = [];
  const myPages = new Set<string>();
  for (const k of kws) {
    demand += k.volume;
    if (k.prospect) {
      if (k.prospect.url) myPages.add(normUrl(k.prospect.url));
      if (k.prospect.position <= 10) { p1++; p1Vol += k.volume; }
      else if (k.prospect.position <= 20) { near.push(k); nearVol += k.volume; }
    }
  }
  const rivals: RivalStat[] = competitorDomains.map(d => {
    let n = 0, v = 0; const pages = new Set<string>();
    for (const k of kws) { const r = k.rivals[d]; if (r) { n++; v += k.volume; if (r.url) pages.add(normUrl(r.url)); } }
    return { domain: d, p1Keywords: n, p1Volume: v, p1Share: count ? n / count : 0, pages: pages.size };
  }).sort((a, b) => b.p1Keywords - a.p1Keywords || b.p1Volume - a.p1Volume || a.domain.localeCompare(b.domain));
  const share = count ? p1 / count : 0;
  const state: ThemeState = share >= HELD_FROM_SHARE ? 'held' : share >= OPEN_BELOW_SHARE ? 'contested' : 'open';
  return {
    name, keywords: kws, count, demand, prospectP1: p1, prospectP1Volume: p1Vol, share, state,
    rivals, leader: rivals[0] && rivals[0].p1Keywords > 0 ? rivals[0] : null,
    nearWins: near.sort((a, b) => b.volume - a.volume), nearWinVolume: nearVol, prospectPages: myPages.size,
  };
}

export function buildThemes(u: Universe, assignment: Map<string, string>, competitorDomains: string[]): { themes: ThemeStat[]; unassigned: number } {
  const groups = new Map<string, UKeyword[]>();
  let unassigned = 0;
  for (const k of u.keywords) {
    const t = assignment.get(k.keyword);
    if (!t) { unassigned++; continue; }
    const list = groups.get(t) ?? []; list.push(k); groups.set(t, list);
  }
  const themes = Array.from(groups.entries())
    .map(([name, kws]) => themeStat(name, kws, competitorDomains))
    .filter(t => t.count >= MIN_THEME_KEYWORDS)
    .sort((a, b) => b.demand - a.demand || a.name.localeCompare(b.name));
  return { themes, unassigned };
}

// ─── The picker ──────────────────────────────────────────────────────────────

/**
 * v7.516 — the constraint is DERIVED from which measured gap exists, never defaulted:
 *   authority    — both Authority Scores are known and the leader is more than AUTHORITY_TOLERANCE ahead
 *   content      — the leader ranks PAGES_GAP_MULTIPLE× as many pages on page one as you have in the top 20
 *   optimization — no page gap, but you already have NEAR_WIN_MIN+ searches at positions 11–20
 * Before v7.516 "content" was simply whatever was left when authority passed — and Authority Score read 0
 * for every domain (domain_ranks has no such column), so authority always "passed" and every report said
 * "a content problem, not an authority one" regardless of the data.
 */
export type Constraint = 'content' | 'optimization' | 'authority' | 'ai_citation';
/** `known` is false when a figure the check needs was not returned; a check that is not known never passes. */
export interface Check { pass: boolean; you: number | null; them: number | null; known?: boolean }
export interface Opening {
  theme:       string;
  constraint:  Constraint;
  leader:      string | null;
  checks:      { authority: Check; pages: Check; nearWins: Check };
  passed:      number;
}

export function evaluateOpenTheme(t: ThemeStat, authority: Record<string, number | null>, prospectDomain: string): Opening | null {
  if (t.state !== 'open' || !t.leader || t.demand < DEMAND_FLOOR_MONTHLY) return null;
  const you = authority[prospectDomain]; const them = authority[t.leader.domain];
  const authKnown = typeof you === 'number' && typeof them === 'number';
  const authority_: Check = { pass: authKnown && (you as number) >= (them as number) - AUTHORITY_TOLERANCE, you: typeof you === 'number' ? you : null, them: typeof them === 'number' ? them : null, known: authKnown };
  const pages: Check = { pass: t.leader.pages >= Math.max(1, t.prospectPages) * PAGES_GAP_MULTIPLE && t.leader.pages >= 2, you: t.prospectPages, them: t.leader.pages, known: true };
  const nearWins: Check = { pass: t.nearWins.length >= NEAR_WIN_MIN, you: t.nearWins.length, them: null, known: true };
  const passed = [authority_, pages, nearWins].filter(c => c.pass).length;
  if (passed < CHECKS_TO_QUALIFY) return null;
  const authorityGap = authKnown && !authority_.pass;
  const constraint: Constraint = authorityGap ? 'authority' : pages.pass ? 'content' : 'optimization';
  return { theme: t.name, constraint, leader: t.leader.domain, checks: { authority: authority_, pages, nearWins }, passed };
}

/** Largest qualifying open theme; ties → more near-wins. */
export function pickSearchOpening(themes: ThemeStat[], authority: Record<string, number | null>, prospectDomain: string): Opening | null {
  const cands = themes.map(t => ({ t, o: evaluateOpenTheme(t, authority, prospectDomain) })).filter(x => x.o) as Array<{ t: ThemeStat; o: Opening }>;
  cands.sort((a, b) => b.t.demand - a.t.demand || b.t.nearWins.length - a.t.nearWins.length || a.t.name.localeCompare(b.t.name));
  return cands[0]?.o ?? null;
}

export interface AiThemeRead {
  theme:    string;
  query:    string;
  answers:  number;                          // recorded answers read (both platforms)
  byPlatform: Record<string, number>;
  named:    Record<string, number>;          // domain → answers naming or citing it
  cited:    Record<string, number>;          // domain → answers citing an owned URL
  topSources: Array<{ domain: string; count: number }>;
  totalInIndex: number;
}
export const aiRate = (r: AiThemeRead, domain: string): number => r.answers > 0 ? (r.named[domain] ?? 0) / r.answers : 0;

/** Fallback opening: the prospect ranks in Google, but recorded AI answers name a rival instead. */
export function pickAiOpening(themes: ThemeStat[], reads: AiThemeRead[], prospectDomain: string, authority: Record<string, number | null>): Opening | null {
  const cands: Array<{ t: ThemeStat; rival: string }> = [];
  for (const r of reads) {
    const t = themes.find(x => x.name === r.theme);
    if (!t || t.state === 'open' || t.demand < DEMAND_FLOOR_MONTHLY || r.answers < 10) continue;
    if (aiRate(r, prospectDomain) >= AI_NAMED_FROM) continue;
    const strong = Object.keys(r.named).filter(d => d !== prospectDomain && aiRate(r, d) >= AI_RIVAL_STRONG)
      .sort((a, b) => aiRate(r, b) - aiRate(r, a));
    if (strong.length) cands.push({ t, rival: strong[0] });
  }
  cands.sort((a, b) => b.t.demand - a.t.demand);
  const c = cands[0]; if (!c) return null;
  const you = authority[prospectDomain]; const them = authority[c.rival];
  return {
    theme: c.t.name, constraint: 'ai_citation', leader: c.rival, passed: 0,
    checks: {
      authority: { pass: typeof you === 'number' && typeof them === 'number' && you >= them - AUTHORITY_TOLERANCE, you: typeof you === 'number' ? you : null, them: typeof them === 'number' ? them : null, known: typeof you === 'number' && typeof them === 'number' },
      pages:     { pass: false, you: c.t.prospectPages, them: c.t.leader?.pages ?? null, known: true },
      nearWins:  { pass: c.t.nearWins.length >= NEAR_WIN_MIN, you: c.t.nearWins.length, them: null, known: true },
    },
  };
}

/** Quadrant placement for the Search × AI page. Only themes with an AI read are placed. */
export type Quadrant = 'both' | 'google_only' | 'ai_only' | 'neither';
export function quadrantOf(t: ThemeStat, r: AiThemeRead, prospectDomain: string): Quadrant {
  const g = t.state !== 'open'; const a = aiRate(r, prospectDomain) >= AI_NAMED_FROM;
  return g && a ? 'both' : g ? 'google_only' : a ? 'ai_only' : 'neither';
}
