/**
 * briefEnrichCore (v7.364) — pure SERP→brief-column mapping for the Brief Agent.
 *
 * The competitor + PAA resolution for /api/projects/[id]/brief-enrich, factored
 * out of the route so it carries no next/db imports and can be unit-tested
 * directly. Real rows only (Const I.1): Top-Ranked from the primary keyword's
 * organic results, Direct from the configured competitors' own ranking (or
 * AI-Overview-cited) page, PAA from the real People-Also-Ask sets. H1 is filled
 * in afterward by the route (server-side page fetch); here it is left ''.
 */

import type { KeywordSerpData } from '@/lib/apis/serp';

export interface EnrichComp { name: string; url: string; title: string; h1: string; inAIO: boolean; }
export interface EnrichTopic { id: string; topRanked: EnrichComp[]; direct: EnrichComp[]; paaPrimary: string[]; paaSecondary: string[]; }

export function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return String(url ?? '').replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
  }
}

export const lc = (s: string) => String(s ?? '').trim().toLowerCase();

export function aioDomainsOf(kd?: KeywordSerpData): Set<string> {
  const set = new Set<string>();
  if (!kd) return set;
  for (const s of (kd.aioSources ?? [])) { const d = normalizeDomain((s as any).domain ?? (s as any).url ?? ''); if (d) set.add(d); }
  return set;
}

/**
 * Resolve ONE article's competitor + PAA groups from real SERP rows (H1 blank —
 * the route fills it after fetching pages).
 *   topRanked = first 3 organic domains for the primary keyword that aren't the
 *     client, deduped by domain.
 *   direct = the configured competitors (≤3), each shown with their organic (or,
 *     failing that, AI-Overview-cited) page for the keyword; blank page when
 *     neither (honest gap, Const I.5).
 *   inAIO = the domain is cited in the keyword's AI Overview.
 */
export function resolveTopicEnrich(
  topic: { id: string; primaryKeyword: string; secondaryKeywords: string[] },
  byKeyword: Map<string, KeywordSerpData>,
  directDomains: string[],
  clientDomain: string,
): EnrichTopic {
  const kd = byKeyword.get(lc(topic.primaryKeyword));
  const aio = aioDomainsOf(kd);
  const organic = (kd?.organicResults ?? []).slice().sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  const topRanked: EnrichComp[] = [];
  const seen = new Set<string>();
  for (const r of organic) {
    const d = normalizeDomain(r.domain ?? r.url ?? '');
    if (!d || d === clientDomain || seen.has(d)) continue;
    seen.add(d);
    topRanked.push({ name: d, url: r.url ?? '', title: r.title ?? '', h1: '', inAIO: aio.has(d) });
    if (topRanked.length >= 3) break;
  }

  const direct: EnrichComp[] = directDomains.slice(0, 3).map((d0) => {
    const d = normalizeDomain(d0);
    const hit = organic.find((r) => normalizeDomain(r.domain ?? r.url ?? '') === d);
    let url = hit?.url ?? '', title = hit?.title ?? '';
    if (!url) {
      const cited = (kd?.aioSources ?? []).find((s: any) => normalizeDomain(s.domain ?? s.url ?? '') === d);
      if (cited) { url = (cited as any).url ?? ''; title = (cited as any).title ?? ''; }
    }
    return { name: d, url, title, h1: '', inAIO: aio.has(d) };
  });

  const paaPrimary = Array.from(new Set((kd?.paaQuestions ?? []).map((q) => String(q ?? '').trim()).filter(Boolean)));
  const paaSet = new Set<string>();
  for (const s of topic.secondaryKeywords) {
    const skd = byKeyword.get(lc(s));
    for (const q of (skd?.paaQuestions ?? [])) { const v = String(q ?? '').trim(); if (v && !paaPrimary.includes(v)) paaSet.add(v); }
  }
  return { id: topic.id, topRanked, direct, paaPrimary, paaSecondary: Array.from(paaSet) };
}
