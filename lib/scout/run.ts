/**
 * lib/scout/run.ts — one Scout run, start to stored result (v7.513).
 *
 * Six steps, each written to the run row BEFORE it starts, so the screen always
 * shows "step X of 6 · what it is doing" plus elapsed time and — once there is
 * timing history — an ETA from the median of real finished runs (Const IV.2/IV.3).
 * A failure in an optional step (AI read, buyer questions) drops that section and
 * records why; it never takes the run down and never gets filled with a guess.
 */

import { getMarket } from '@/lib/utils/markets';
import { extractBrand } from '@/lib/utils/kwVolume';
import {
  MAX_TERMS_PER_PRODUCT, ROWS_PER_COMPETITOR_DOMAIN, ROWS_PROSPECT_DOMAIN, ROWS_PER_COMPETITOR_TERM,
  ROWS_PROSPECT_TERM, AI_THEMES_MAX, SCOUT_VERSION, PULL_CONCURRENCY, getIndustry, unitCeiling,
} from './config';
import {
  buildUniverse, mergeUniverses, buildThemes, floorOf, leaderPagesOf, pickSearchOpening, pickAiOpening, quadrantOf,
  type Universe, type ThemeStat, type Opening, type AiThemeRead, type Quadrant, type DomainPull,
} from './opportunity';
import { pullOrganic, pullOverview, pullQuestions, newMeter, getApiUnitsBalance, type DomainFacts, type QuestionRow } from './semrushScout';
import { groupIntoThemes, proposeProductTerms, assignToProducts } from './themes';
import { readAiForTheme, aiReadAvailable } from './aiRead';
import { getRun, setProgress, finishRun, failRun, type Milestone } from './store';

export const STEPS = [
  'Domain footprint and authority',
  'Competitor page-one keywords',
  'Prospect rankings on the same searches',
  'Grouping searches into themes',
  'Picking the opening and reading AI answers',
  'Buyer questions and final checks',
];

export interface ThemeLite {
  name: string; count: number; demand: number; prospectP1: number; prospectP1Volume: number; share: number; state: ThemeStat['state'];
  rivals: ThemeStat['rivals']; leader: string | null; nearWinCount: number; nearWinVolume: number; prospectPages: number;
}
export interface KeywordLite { keyword: string; volume: number; you: number | null; best: { domain: string; position: number } | null }
export interface ScoutResult {
  version: string; generatedAt: string; database: string; marketLabel: string;
  input: { domain: string; industry: string; industryLabel: string; regulated: boolean; scope: string; products: string[]; competitors: Array<{ domain: string; manual: boolean }> };
  floorVolume: number;
  counts: { universe: number; themed: number; brandedDropped: number; belowFloorDropped: number; notGrouped: number };
  productTerms: Record<string, string[]> | null;
  facts: DomainFacts[];
  field: Array<{ domain: string; isProspect: boolean; authority: number | null; traffic: number; p1Keywords: number; p1Volume: number }>;
  totals: { demand: number; prospectP1Volume: number };
  themes: ThemeLite[];
  opening: Opening | null;
  detail: null | {
    topKeywords: KeywordLite[]; nearWins: KeywordLite[];
    leaderPages: Array<{ url: string; keywords: number; volume: number; traffic?: number }>;   // traffic: v7.519, modeled (volume × CTR at rank)
    pagesByDomain: Array<{ domain: string; isProspect: boolean; pages: number }>;
    questions: QuestionRow[]; questionSeed: string | null;
  };
  ai: null | { reads: AiThemeRead[]; quadrants: Array<{ theme: string; quadrant: Quadrant }>; costUSD: number };
  notes: string[];
  usage: { semrushUnits: number; semrushRows: number; semrushCalls: number; aiCostUSD: number };
}

/**
 * v7.515 — pulls run at most PULL_CONCURRENCY at a time (a bound on the Semrush burst; at the
 * 4-competitor cap every pull still runs at once). Results keep input order, and any failure
 * still rejects (same as Promise.all).
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length); let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

const lite = (t: ThemeStat): ThemeLite => ({
  name: t.name, count: t.count, demand: t.demand, prospectP1: t.prospectP1, prospectP1Volume: t.prospectP1Volume, share: t.share, state: t.state,
  rivals: t.rivals, leader: t.leader?.domain ?? null, nearWinCount: t.nearWins.length, nearWinVolume: t.nearWinVolume, prospectPages: t.prospectPages,
});
const kwLite = (k: ThemeStat['keywords'][number]): KeywordLite => {
  let best: KeywordLite['best'] = null;
  for (const d of Object.keys(k.rivals)) if (!best || k.rivals[d].position < best.position) best = { domain: d, position: k.rivals[d].position };
  return { keyword: k.keyword, volume: k.volume, you: k.prospect?.position ?? null, best };
};

/**
 * v7.523 — the run's milestone log. Each step records when it started and ended (server clock) and,
 * when it ends, the counts it ACTUALLY produced — nothing is estimated here. The live card reads it.
 */
function milestoneLog(runId: string) {
  const ms: Milestone[] = [];
  const now = () => new Date().toISOString();
  const close = (detail?: string) => { const cur = ms[ms.length - 1]; if (cur && !cur.endedAt) { cur.endedAt = now(); if (detail) cur.detail = detail; } };
  return {
    ms,
    /** Close the running step with what it produced, then open step n. */
    step: async (n: number, detail?: string) => { close(detail); ms.push({ n, startedAt: now() }); await setProgress(runId, n, STEPS[n - 1], ms.map(m => ({ ...m }))); },
    close,
  };
}
const n0 = (x: number) => Math.round(x).toLocaleString('en-US');

export async function executeRun(runId: string): Promise<void> {
  const meter = newMeter();
  const notes: string[] = [];
  let aiCost = 0;
  const log = milestoneLog(runId);
  try {
    const run = await getRun(runId);
    if (!run) throw new Error('Run not found.');
    const db = getMarket(run.market).code;
    const prospect = run.domain;
    const comps = run.competitors.map(c => c.domain);
    const industry = getIndustry(run.industry);
    const scope = run.scope === 'products' && run.products.length ? 'products' : 'domain';

    // Never start a pull the account cannot pay for (v7.457: Semrush pre-authorises display_limit × rate).
    const ceiling = unitCeiling(scope, comps.length, run.products.length);
    const balance = await getApiUnitsBalance();
    if (balance !== null && balance < ceiling) {
      throw new Error(`Semrush has ${balance.toLocaleString()} API units left and this run can need up to ${ceiling.toLocaleString()}. Nothing was requested and nothing was spent.`);
    }

    // 1 ── footprint + authority
    await log.step(1);
    const facts = await mapLimit([prospect, ...comps], PULL_CONCURRENCY, d => pullOverview(d, db, meter));
    const d1 = `${facts.filter(f => f.found).length} of ${facts.length} sites profiled · Authority Score read for ${facts.filter(f => typeof f.authorityScore === 'number').length}`;
    if (!facts[0].found) {
      log.close(d1);
      await finishRun(runId, { status: 'thin', headline: null, units: meter.units, milestones: log.ms, result: { version: SCOUT_VERSION, thin: `Semrush has no organic data for ${prospect} in the ${getMarket(db).label} database.` } });
      return;
    }
    const brandTokens = [prospect, ...comps].map(d => extractBrand(d)).filter(t => t.length >= 3);

    // 2 + 3 ── pulls
    let universe: Universe;
    let productTerms: Record<string, string[]> | null = null;
    let d3 = '';
    if (scope === 'domain') {
      await log.step(2, d1);
      const compPulls = await mapLimit(comps, PULL_CONCURRENCY, d => pullOrganic({ domain: d, database: db, maxPos: 10, limit: ROWS_PER_COMPETITOR_DOMAIN, meter }));
      const floor = floorOf(compPulls);
      await log.step(3, `${n0(compPulls.reduce((a, p) => a + p.rows.length, 0))} page-one rows from ${comps.length} competitor${comps.length === 1 ? '' : 's'} · ${floor > 0 ? `volume floor ${n0(floor)}/mo` : 'no volume floor'}`);
      const myPull = await pullOrganic({ domain: prospect, database: db, maxPos: 20, limit: ROWS_PROSPECT_DOMAIN, aboveVolume: floor, meter });
      universe = buildUniverse({ prospect: myPull, competitors: compPulls, brandTokens });
      d3 = `${n0(myPull.rows.length)} prospect rankings in the top 20 · ${n0(universe.keywords.length)} non-branded searches in play`;
    } else {
      await log.step(2, d1);
      productTerms = await proposeProductTerms({ industry: industry.label, products: run.products, max: MAX_TERMS_PER_PRODUCT });
      const slices: Array<{ product: string; term: string }> = [];
      for (const p of run.products) for (const t of productTerms[p] ?? []) slices.push({ product: p, term: t });
      const compBySlice: DomainPull[][] = [];
      for (const s of slices) compBySlice.push(await mapLimit(comps, PULL_CONCURRENCY, d => pullOrganic({ domain: d, database: db, maxPos: 10, limit: ROWS_PER_COMPETITOR_TERM, term: s.term, meter })));
      await log.step(3, `${slices.length} product search term${slices.length === 1 ? '' : 's'} · ${n0(compBySlice.reduce((a, ps) => a + ps.reduce((b, p) => b + p.rows.length, 0), 0))} page-one rows from ${comps.length} competitor${comps.length === 1 ? '' : 's'}`);
      const parts: Universe[] = [];
      let myRows = 0;
      for (let i = 0; i < slices.length; i++) {
        const my = await pullOrganic({ domain: prospect, database: db, maxPos: 20, limit: ROWS_PROSPECT_TERM, term: slices[i].term, aboveVolume: floorOf(compBySlice[i]), meter });
        myRows += my.rows.length;
        parts.push(buildUniverse({ prospect: my, competitors: compBySlice[i], brandTokens, slice: slices[i].term }));
      }
      universe = mergeUniverses(parts);
      d3 = `${n0(myRows)} prospect rankings in the top 20 · ${n0(universe.keywords.length)} non-branded searches in play`;
    }

    // 4 ── themes
    await log.step(4, d3);
    const kwList = universe.keywords.map(k => k.keyword);
    const grouped = scope === 'domain'
      ? await groupIntoThemes({ domain: prospect, industry: industry.label, keywords: kwList })
      : await assignToProducts({ domain: prospect, industry: industry.label, products: run.products, keywords: kwList });
    const { themes } = buildThemes(universe, grouped.assignment, comps);
    const themed = themes.reduce((s, t) => s + t.count, 0);

    const d4 = `${n0(kwList.length)} searches → ${themes.length} theme${themes.length === 1 ? '' : 's'}`;
    if (universe.keywords.length < 20 || themes.length < (scope === 'domain' ? 2 : 1)) {
      log.close(d4);
      await finishRun(runId, { status: 'thin', headline: null, units: meter.units, milestones: log.ms, result: {
        version: SCOUT_VERSION,
        thin: `Only ${universe.keywords.length} non-branded searches cleared the pull for ${prospect} and the selected competitors — too few to chart or to name an opening honestly.`,
        usage: { semrushUnits: meter.units, semrushRows: meter.rows, semrushCalls: meter.calls, aiCostUSD: 0 },
      } });
      return;
    }

    // 5 ── opening + AI read
    await log.step(5, d4);
    const authority: Record<string, number | null> = {}; for (const f of facts) authority[f.domain] = f.authorityScore;
    let opening: Opening | null = pickSearchOpening(themes, authority, prospect);
    let ai: ScoutResult['ai'] = null;
    if (aiReadAvailable()) {
      const order = [...themes];
      if (opening) { const i = order.findIndex(t => t.name === opening!.theme); if (i > 0) order.unshift(order.splice(i, 1)[0]); }
      const picked = order.slice(0, AI_THEMES_MAX);
      const reads: AiThemeRead[] = [];
      for (const t of picked) {
        try {
          const r = await readAiForTheme(t.name, t.name.toLowerCase(), [prospect, ...comps]);
          if (r) { aiCost += r.costUSD; if (r.read.answers > 0) reads.push(r.read); }
        } catch (e) { notes.push(`AI answers for "${t.name}" could not be read (${(e as Error).message.slice(0, 80)}).`); }
      }
      if (reads.length) {
        if (!opening) opening = pickAiOpening(themes, reads, prospect, authority);
        ai = { reads, costUSD: aiCost, quadrants: reads.map(r => ({ theme: r.theme, quadrant: quadrantOf(themes.find(t => t.name === r.theme)!, r, prospect) })) };
      } else notes.push('No recorded AI answers matched these themes, so the AI page was left out.');
    } else notes.push('AI answer data is not configured, so the AI page was left out.');

    // 6 ── detail for the opening
    const answersRead = ai ? ai.reads.reduce((a, r) => a + r.answers, 0) : 0;
    await log.step(6, `${themes.length} theme${themes.length === 1 ? '' : 's'} scored · ${ai ? `${n0(answersRead)} AI answers read` : 'AI answers not read'} · ${opening ? 'opening found' : 'no theme cleared the bar'}`);
    let detail: ScoutResult['detail'] = null;
    if (opening) {
      const t = themes.find(x => x.name === opening!.theme)!;
      const leader = opening.leader;
      const seed = t.keywords[0]?.keyword ?? null;
      let questions: QuestionRow[] = [];
      if (seed) { try { questions = await pullQuestions(seed, db, meter); } catch (e) { notes.push(`Buyer questions could not be read (${(e as Error).message.slice(0, 80)}).`); } }
      detail = {
        topKeywords: t.keywords.slice(0, 10).map(kwLite),
        nearWins: t.nearWins.slice(0, 8).map(kwLite),
        leaderPages: leader ? leaderPagesOf(t, leader) : [],
        pagesByDomain: [{ domain: prospect, isProspect: true, pages: t.prospectPages }, ...t.rivals.map(r => ({ domain: r.domain, isProspect: false, pages: r.pages }))],
        questions, questionSeed: seed,
      };
    }

    const field = [prospect, ...comps].map((d, i) => {
      let n = 0, v = 0;
      for (const t of themes) for (const k of t.keywords) { const pos = i === 0 ? (k.prospect?.position ?? 99) : (k.rivals[d]?.position ?? 99); if (pos <= 10) { n++; v += k.volume; } }
      return { domain: d, isProspect: i === 0, authority: facts[i].authorityScore, traffic: facts[i].organicTraffic, p1Keywords: n, p1Volume: v };
    });

    const result: ScoutResult = {
      version: SCOUT_VERSION, generatedAt: new Date().toISOString(), database: db, marketLabel: getMarket(db).label,
      input: { domain: prospect, industry: industry.key, industryLabel: industry.label, regulated: industry.regulated, scope, products: run.products, competitors: run.competitors },
      floorVolume: universe.floorVolume,
      counts: { universe: universe.keywords.length, themed, brandedDropped: universe.brandedDropped, belowFloorDropped: universe.belowFloorDropped, notGrouped: universe.keywords.length - themed },
      productTerms, facts, field,
      totals: { demand: themes.reduce((s, t) => s + t.demand, 0), prospectP1Volume: themes.reduce((s, t) => s + t.prospectP1Volume, 0) },
      themes: themes.map(lite), opening, detail, ai, notes,
      usage: { semrushUnits: meter.units, semrushRows: meter.rows, semrushCalls: meter.calls, aiCostUSD: aiCost },
    };
    const headline = opening ? `${opening.theme} · ${opening.constraint === 'ai_citation' ? 'AI citation' : opening.constraint}` : null;   // constraint derived per case (v7.516)
    log.close(detail ? `${detail.questions.length} buyer question${detail.questions.length === 1 ? '' : 's'} · report assembled` : 'field-view report assembled');
    await finishRun(runId, { status: opening ? 'ready' : 'no_opening', headline, units: meter.units, milestones: log.ms, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[scout.run] failed:', msg);
    await failRun(runId, msg, meter.units, log.ms.length ? log.ms : undefined).catch(() => {});   // the open step stays open: the card marks it as where the run stopped
  }
}
