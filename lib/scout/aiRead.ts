/**
 * lib/scout/aiRead.ts — what AI answer engines say about a theme (v7.513).
 *
 * Reads RECORDED answers from DataForSEO's LLM Mentions index (ChatGPT + Google AI
 * Overviews) whose question contains the theme — the same measured source the
 * Product Insights panel uses. Nothing is prompted, generated or modeled here:
 * a brand is "named" only when its token literally occurs in the recorded answer
 * or its domain is among the answer's sources (lib/productInsights matchers).
 * DataForSEO not configured → null, and the report drops the AI page (Const I.5).
 *
 * v7.545 — the read follows the run's market. Before this, no location was sent, so
 * DataForSEO defaulted to the United States and a UK/CA/AU report put US AI answers
 * beside that country's search data. planAiMarket() reads DataForSEO's free coverage
 * list once per run and decides, per platform, whether English-language answers are
 * recorded for the market (themes are matched in English). ChatGPT is US/English only
 * per DataForSEO's docs; anything not covered is skipped with a stated reason, never
 * substituted with another country's answers.
 */

import { dfsSearchLlmMentions, dfsLlmMentionsLocations, dataForSeoEnabled, type DfsLlmLocation } from '@/lib/apis/dataforseo';
import type { ScoutMarket } from './markets';
import { buildBrandTokens, rowNamesBrand, rowCitesClient } from '@/lib/productInsights';
import { normSovDomain } from '@/lib/sov/model';
import type { AiThemeRead } from './opportunity';
import { AI_ROWS_PER_PLATFORM } from './config';

export const aiReadAvailable = () => dataForSeoEnabled();

export type AiPlatform = 'chat_gpt' | 'google';
export const AI_PLATFORMS: AiPlatform[] = ['chat_gpt', 'google'];
export const AI_PLATFORM_LABEL: Record<AiPlatform, string> = { chat_gpt: 'ChatGPT', google: 'Google AI Overviews' };
/** Themes are English words, so only English-language answers can match them. */
export const AI_LANGUAGE = 'en';
/** DataForSEO's documented default location (United States) — the pre-v7.545 request. */
const US_GEO = 2840;

export interface AiMarketPlan {
  marketCode:   string;
  marketLabel:  string;
  locationCode: number | null;   // null = nothing will be read
  platforms:    AiPlatform[];    // read for this market, in English
  notes:        string[];        // why a platform was not read (goes into the report's method note)
}

const normName = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');

/** Find the market in the coverage list: geo-target id first, then the country name. */
export function findAiLocation(list: DfsLlmLocation[], m: ScoutMarket): DfsLlmLocation | null {
  return list.find(l => l.locationCode === m.geo) ?? list.find(l => normName(l.locationName) === normName(m.label)) ?? null;
}

/** PURE — what to read for a market, from the coverage list (null = the list could not be read). */
export function planFromCoverage(m: ScoutMarket, list: DfsLlmLocation[] | null): AiMarketPlan {
  const plan: AiMarketPlan = { marketCode: m.code, marketLabel: m.label, locationCode: null, platforms: [], notes: [] };
  if (!list) {
    if (m.code === 'us') { plan.locationCode = US_GEO; plan.platforms = [...AI_PLATFORMS]; return plan; }
    plan.notes.push(`The list of markets with recorded AI answers could not be read, so no AI answers were read for ${m.label}.`);
    return plan;
  }
  const loc = findAiLocation(list, m);
  if (!loc) { plan.notes.push(`No recorded AI answers are indexed for ${m.label}, so the AI page was left out.`); return plan; }
  const en = loc.languages.find(l => l.code === AI_LANGUAGE) ?? null;
  for (const pf of AI_PLATFORMS) {
    if (en && en.platforms.includes(pf)) { plan.platforms.push(pf); continue; }
    if (pf === 'chat_gpt') { plan.notes.push(`ChatGPT answers are not recorded for ${m.label} in English.`); continue; }
    const other = loc.languages.filter(l => l.code !== AI_LANGUAGE && l.platforms.includes(pf)).map(l => l.name || l.code);
    plan.notes.push(other.length
      ? `Google AI Overview answers for ${m.label} are recorded in ${other.join(', ')} only; Scout matches themes in English, so they were not read.`
      : `Google AI Overview answers are not recorded for ${m.label}.`);
  }
  if (plan.platforms.length) plan.locationCode = loc.locationCode;
  return plan;
}

/** Once per run: read the free coverage list and plan the AI read for this market. */
export async function planAiMarket(m: ScoutMarket): Promise<AiMarketPlan> {
  return planFromCoverage(m, await dfsLlmMentionsLocations());
}

export async function readAiForTheme(theme: string, query: string, domains: string[], plan: AiMarketPlan): Promise<{ read: AiThemeRead; costUSD: number } | null> {
  if (!dataForSeoEnabled() || plan.locationCode === null || !plan.platforms.length) return null;
  const platforms = plan.platforms;
  const loc = plan.locationCode;
  // byPlatform gets a key only for a platform that ANSWERED (null = no match or a failed request — the
  // two are indistinguishable here); run.ts names in the PDF only engines that answered for some theme.
  const results = await Promise.all(platforms.map(pf => dfsSearchLlmMentions(query, { limit: AI_ROWS_PER_PLATFORM, platform: pf, locationCode: loc, languageCode: AI_LANGUAGE }).catch(() => null)));
  const read: AiThemeRead = { theme, query, answers: 0, byPlatform: {}, named: {}, cited: {}, topSources: [], totalInIndex: 0 };
  for (const d of domains) { read.named[d] = 0; read.cited[d] = 0; }
  const toks: Record<string, string[]> = {}; for (const d of domains) toks[d] = buildBrandTokens(d, []);
  const src = new Map<string, number>();
  let cost = 0;
  results.forEach((res, i) => {
    if (!res) return;
    cost += res.costUSD || 0; read.totalInIndex += res.totalCount || 0;
    read.byPlatform[platforms[i]] = res.rows.length;
    for (const row of res.rows) {
      read.answers++;
      for (const d of domains) {
        const cited = rowCitesClient(row as any, normSovDomain(d));
        if (cited) read.cited[d]++;
        if (cited || rowNamesBrand(row as any, toks[d])) read.named[d]++;
      }
      const seen = new Set<string>();
      for (const s of row.sources) { const dom = normSovDomain(s.domain); if (dom && !seen.has(dom)) { seen.add(dom); src.set(dom, (src.get(dom) ?? 0) + 1); } }
    }
  });
  read.topSources = Array.from(src.entries()).map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain)).slice(0, 8);
  return { read, costUSD: cost };
}
