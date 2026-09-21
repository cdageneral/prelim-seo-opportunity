/**
 * lib/scout/semrushScout.ts — Scout's Semrush pulls (v7.513).
 *
 * Small, filtered `domain_organic` requests sorted by volume, so a full list has a
 * well-defined volume floor (see lib/scout/opportunity.ts). Everything goes through
 * `semrushRows` → `semrushGet`, the app's one Semrush choke point, so units reach
 * the ledger like every other call. Each pull also returns the rows it read so the
 * run can state its own measured unit spend (rows × the verified per-line rate).
 */

import { semrushRows, getDomainOverview, getCompetitors, getApiUnitsBalance } from '@/lib/apis/semrush';
import { SEMRUSH_RATES } from '@/lib/usage/record';
import type { DomainPull, PullRow } from './opportunity';
import { PUBLISHER_DOMAINS, SUGGEST_ROWS, QUESTION_ROWS, normDomain } from './config';

export interface UnitMeter { rows: number; units: number; calls: number }
export const newMeter = (): UnitMeter => ({ rows: 0, units: 0, calls: 0 });
function bill(m: UnitMeter, type: string, rows: number) {
  m.calls++; m.rows += rows; m.units += rows * (SEMRUSH_RATES[type] ?? 10);
}

function toRows(parsed: Record<string, string>[]): PullRow[] {
  return parsed.map(r => ({
    keyword:  String(r['Keyword'] ?? '').toLowerCase().trim(),
    position: parseInt(r['Position'] ?? '0', 10) || 0,
    volume:   parseInt(r['Search Volume'] ?? '0', 10) || 0,
    url:      r['Url'] ?? r['URL'] ?? '',
  })).filter(r => r.keyword && r.position >= 1 && r.volume > 0);
}

/**
 * One domain's organic rows at positions 1..maxPos, highest volume first.
 * `term` adds a phrase-contains filter (product scope); `aboveVolume` is an
 * EXCLUSIVE floor (Semrush `Gt`). Filtered-out rows are never returned or billed.
 */
export async function pullOrganic(opts: {
  domain: string; database: string; maxPos: number; limit: number;
  term?: string | null; aboveVolume?: number; meter: UnitMeter;
}): Promise<DomainPull> {
  const filters = [`+|Po|Lt|${opts.maxPos + 1}`];
  if (opts.aboveVolume && opts.aboveVolume > 0) filters.push(`+|Nq|Gt|${opts.aboveVolume}`);
  if (opts.term) filters.push(`+|Ph|Co|${opts.term.replace(/[|]/g, ' ')}`);
  const parsed = await semrushRows({
    type: 'domain_organic', domain: opts.domain, database: opts.database,
    display_limit: String(opts.limit), display_sort: 'nq_desc',
    display_filter: filters.join('|'), export_columns: 'Ph,Po,Nq,Ur',
  });
  bill(opts.meter, 'domain_organic', parsed.length);
  const rows = toRows(parsed);
  const full = parsed.length >= opts.limit;
  let floorVolume: number | null = null;
  if (full) { floorVolume = rows.reduce((m, r) => Math.min(m, r.volume), Number.MAX_SAFE_INTEGER); if (floorVolume === Number.MAX_SAFE_INTEGER) floorVolume = null; }
  return { domain: opts.domain, rows, full, floorVolume };
}

export interface DomainFacts { domain: string; organicKeywords: number; organicTraffic: number; authorityScore: number | null; found: boolean }
export async function pullOverview(domain: string, database: string, meter: UnitMeter): Promise<DomainFacts> {
  try {
    const o = await getDomainOverview(domain, database);
    bill(meter, 'domain_ranks', 1);
    const found = o.organicKeywords > 0 || o.organicTraffic > 0;
    return { domain, organicKeywords: o.organicKeywords, organicTraffic: o.organicTraffic, authorityScore: found && Number.isFinite(o.authorityScore) ? o.authorityScore : null, found };
  } catch {
    return { domain, organicKeywords: 0, organicTraffic: 0, authorityScore: null, found: false };
  }
}

export interface Suggestion { domain: string; commonKeywords: number; organicKeywords: number; publisher: boolean }
export async function suggestCompetitors(domain: string, database: string): Promise<Suggestion[]> {
  const rows = await getCompetitors(domain, database);
  return rows.slice(0, SUGGEST_ROWS).map(r => {
    const d = normDomain(r.domain);
    const root = d.split('.').slice(-2).join('.');
    return { domain: d, commonKeywords: r.commonKeywords, organicKeywords: r.organicKeywords, publisher: PUBLISHER_DOMAINS.has(d) || PUBLISHER_DOMAINS.has(root) };
  }).filter(s => s.domain && s.domain !== domain);
}

export interface QuestionRow { question: string; volume: number }
export async function pullQuestions(phrase: string, database: string, meter: UnitMeter): Promise<QuestionRow[]> {
  const parsed = await semrushRows({
    type: 'phrase_questions', phrase, database,
    display_limit: String(QUESTION_ROWS), display_sort: 'nq_desc', export_columns: 'Ph,Nq',
  });
  bill(meter, 'phrase_questions', parsed.length);
  return parsed.map(r => ({ question: String(r['Keyword'] ?? '').trim(), volume: parseInt(r['Search Volume'] ?? '0', 10) || 0 }))
    .filter(q => q.question && q.volume > 0);
}

export { getApiUnitsBalance };
