/**
 * Demand-universe expansion (v7.155)
 *
 * For a set of SEED phrases (the client's procedures + the audience's life
 * problems) this pulls the full demand universe around each seed from Semrush —
 * `phrase_questions` + `phrase_related` — and merges them into a deduped topic
 * list where EVERY topic carries a real monthly search volume.
 *
 * This is what lets the Audience Journey show the full topic map (the many
 * discovery questions between "problem" and "procedure") instead of only the
 * client's ranking footprint. AI never invents a topic or a number here — topics
 * and volumes come straight from Semrush, so every node is defensible.
 *
 * Fault-tolerant: each seed/report is independently try/caught, so one failure
 * (or running out of API units mid-build) never loses the seeds already pulled.
 *
 * COST: Semrush bills ~40 API units per returned row for these reports.
 */

import { getPhraseQuestions, getPhraseRelated, type SemrushPhrase } from '@/lib/apis/semrush';

export interface DemandTopic {
  keyword:      string;
  searchVolume: number;
  seeds:        string[];                          // which seed(s) surfaced it
  reports:      Array<'questions' | 'related'>;    // which report(s) surfaced it
}

export interface SeedResult {
  seed:      string;
  questions: number;
  related:   number;
  error?:    string;
}

export interface DemandUniverse {
  topics:      DemandTopic[];
  seedResults: SeedResult[];
  database:    string;
  builtAt:     string;          // ISO timestamp
  seedCount:   number;
  topicCount:  number;
  status:      string;          // human-readable summary
}

function mergeInto(
  map: Map<string, DemandTopic>,
  rows: SemrushPhrase[],
  seed: string,
  report: 'questions' | 'related',
): void {
  for (const r of rows) {
    const key = r.keyword.toLowerCase().trim();
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.searchVolume = Math.max(existing.searchVolume, r.searchVolume);
      if (!existing.seeds.includes(seed)) existing.seeds.push(seed);
      if (!existing.reports.includes(report)) existing.reports.push(report);
    } else {
      map.set(key, { keyword: r.keyword, searchVolume: r.searchVolume, seeds: [seed], reports: [report] });
    }
  }
}

/**
 * Expand the demand universe for the given seeds.
 * @param seeds        phrases to expand (procedures + life problems)
 * @param linesPerSeed rows to request per report per seed (deep build = 50+)
 * @param database     Semrush regional database (e.g. 'us')
 */
export async function buildDemandUniverse(
  seeds: string[],
  linesPerSeed = 50,
  database = 'us',
): Promise<DemandUniverse> {
  // De-dupe seeds (case-insensitive), drop blanks.
  const seen = new Set<string>();
  const cleanSeeds: string[] = [];
  for (const s of seeds) {
    const t = (s ?? '').trim();
    const lo = t.toLowerCase();
    if (!t || seen.has(lo)) continue;
    seen.add(lo);
    cleanSeeds.push(t);
  }

  const map = new Map<string, DemandTopic>();
  const seedResults: SeedResult[] = [];

  // Sequential across seeds (gentle on rate limits), both reports per seed in
  // parallel. Each report independently guarded so partial pulls survive.
  for (const seed of cleanSeeds) {
    const [qRes, rRes] = await Promise.allSettled([
      getPhraseQuestions(seed, linesPerSeed, database),
      getPhraseRelated(seed, linesPerSeed, database),
    ]);

    let questions = 0, related = 0;
    let error: string | undefined;

    if (qRes.status === 'fulfilled') { mergeInto(map, qRes.value, seed, 'questions'); questions = qRes.value.length; }
    else { error = `questions: ${String(qRes.reason?.message ?? qRes.reason)}`; }

    if (rRes.status === 'fulfilled') { mergeInto(map, rRes.value, seed, 'related'); related = rRes.value.length; }
    else { error = (error ? error + ' · ' : '') + `related: ${String(rRes.reason?.message ?? rRes.reason)}`; }

    seedResults.push({ seed, questions, related, error });
  }

  const topics = Array.from(map.values()).sort((a, b) => b.searchVolume - a.searchVolume);
  const failedSeeds = seedResults.filter(s => s.error).length;
  const status = topics.length === 0
    ? (seedResults.length === 0 ? 'no seeds to expand' : 'no topics returned (check SEMRUSH_API_KEY / unit balance)')
    : `${topics.length} topics from ${cleanSeeds.length} seeds` + (failedSeeds ? ` · ${failedSeeds} seed(s) partial` : '');

  return {
    topics,
    seedResults,
    database,
    builtAt:    new Date().toISOString(),
    seedCount:  cleanSeeds.length,
    topicCount: topics.length,
    status,
  };
}
