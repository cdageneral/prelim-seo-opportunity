/**
 * lib/scout/aiRead.ts — what AI answer engines say about a theme (v7.513).
 *
 * Reads RECORDED answers from DataForSEO's LLM Mentions index (ChatGPT + Google AI
 * Overviews) whose question contains the theme — the same measured source the
 * Product Insights panel uses. Nothing is prompted, generated or modeled here:
 * a brand is "named" only when its token literally occurs in the recorded answer
 * or its domain is among the answer's sources (lib/productInsights matchers).
 * DataForSEO not configured → null, and the report drops the AI page (Const I.5).
 */

import { dfsSearchLlmMentions, dataForSeoEnabled } from '@/lib/apis/dataforseo';
import { buildBrandTokens, rowNamesBrand, rowCitesClient } from '@/lib/productInsights';
import { normSovDomain } from '@/lib/sov/model';
import type { AiThemeRead } from './opportunity';
import { AI_ROWS_PER_PLATFORM } from './config';

export const aiReadAvailable = () => dataForSeoEnabled();

export async function readAiForTheme(theme: string, query: string, domains: string[]): Promise<{ read: AiThemeRead; costUSD: number } | null> {
  if (!dataForSeoEnabled()) return null;
  const platforms: Array<'chat_gpt' | 'google'> = ['chat_gpt', 'google'];
  const results = await Promise.all(platforms.map(pf => dfsSearchLlmMentions(query, { limit: AI_ROWS_PER_PLATFORM, platform: pf }).catch(() => null)));
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
