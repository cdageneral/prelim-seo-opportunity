/**
 * lib/profound/sentimentScore.ts  (v7.417)
 * ----------------------------------------
 * Pure helpers for Profound's `sentiment_v2_score` column.
 *
 * WHY THIS FILE EXISTS
 * Profound's export changed. Through the 2026-07-27 export the Sentiment file carried a
 * `sentiment_claims` JSON array per row - every claim tagged with the brand it was about
 * (`asset`), a theme, and a positive/negative label. That column is the ONLY input the
 * "Net sentiment by brand" and "Client sentiment by theme" charts were ever built from.
 *
 * In the current export (verified against Wayne's five 2026-08-07..09 files on 2026-08-10)
 * `sentiment_claims` is absent from EVERY file - visibility, sentiment, platforms, prompts
 * and citations. What replaced it is a single scalar per row, `sentiment_v2_score`.
 * The per-brand claim breakdown is therefore not recoverable from this export by any parse:
 * the brand labels and the theme labels are simply not in the data any more. Const I.5 - the
 * panel states that gap rather than inventing a substitute for it.
 *
 * WHAT THE SCORE ACTUALLY IS - and what we are careful NOT to claim
 * Profound ships no definition of the column in the file. Two properties are measured facts
 * about Wayne's export and are safe to rely on:
 *   1. It is sparse. 268 of 3,281 rows carry a value (8.2%).
 *   2. It is CLIENT-ONLY. On the direct-evaluation prompts the client scored 122 of its 136
 *      rows; the three competitors scored 11, 0 and 0. On the brand-agnostic prompts, 133 of
 *      the 135 scored rows name the client versus 61 of the 2,602 unscored ones.
 * Everything past that is inference, so the panel does not assert it. In particular the
 * observed values collapse to 24 distinct small-denominator fractions (0.4286 = 3/7,
 * 0.5556 = 5/9, 0.6154 = 8/13), which LOOKS like a positive share of claims - i.e. the old
 * `sentiment_claims` pre-aggregated with its labels dropped. That reading is not confirmed by
 * Profound, so no surface in OrbitIQ describes the number as a positive share, a percentage,
 * or a claim count. It is rendered as what the export calls it: a 0-1 sentiment score.
 * (Const I.1 - a source must also be NAMED correctly wherever it is shown.)
 *
 * TWO POPULATIONS, NEVER BLENDED
 * The scored rows split cleanly by prompt shape and the two halves disagree sharply:
 *   - direct evaluation - "Evaluate <Brand> on <topic>" - client mean 0.553 over 122 rows
 *   - open answers      - brand-agnostic prompts        - mean 0.948 over 135 rows
 * Asking an engine to *evaluate* a brand elicits criticism; a brand merely *listed* in a
 * "best savings accounts" roundup is mentioned near-uniformly positively. A single blended
 * average describes neither population, so the two are computed and rendered separately and
 * this module offers no function that merges them.
 *
 * Const I.1 / I.5: a bucket with no scored rows returns `mean: null`, never 0. Marcus and Sofi
 * have zero scored rows in this export; rendering them at 0.00 would read as damning sentiment
 * when the truth is an absence of data. `null` is the honest value and every caller must
 * branch on it.
 *
 * Const I.6: nothing here truncates. Callers roll up every topic and every engine present.
 */

/** One accumulator bucket: `rows` counts every row seen, `n` only the scored ones. */
export interface ScoreAgg { n: number; sum: number; rows: number; }

export function emptyAgg(): ScoreAgg { return { n: 0, sum: 0, rows: 0 }; }

/**
 * Record one row against a bucket. `v === null` means "row existed but carried no score" -
 * it still increments `rows`, which is what makes the coverage denominator honest.
 */
export function addScore(a: ScoreAgg, v: number | null): void {
  a.rows++;
  if (v !== null) { a.n++; a.sum += v; }
}

/** Mean of the scored rows, or null when nothing in this bucket was scored (never 0). */
export function meanOf(a: ScoreAgg): number | null {
  return a.n > 0 ? a.sum / a.n : null;
}

/**
 * Parse one `sentiment_v2_score` cell.
 *
 * Deliberately strict: an empty / whitespace cell is `null`, not 0 - `Number('')` is 0 in
 * JavaScript, and letting that through would have silently created 3,013 fabricated
 * zero-sentiment rows out of blanks. Non-numeric text is `null` for the same reason. No
 * clamping to 0-1: an out-of-range value from a future export must surface as itself rather
 * than be quietly squeezed into the expected band (I.6).
 */
export function parseScore(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (t.length === 0) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/**
 * Profound's direct-evaluation prompt shape: "Evaluate <Brand> on <topic>".
 * Matched case-insensitively on the PROMPT rather than on the `type` column: on Wayne's
 * export the two agree exactly (all 544 `Sentiment, Sentiment` rows match this shape and no
 * other row does), and the prompt text is the more durable of the two - Profound has renamed
 * `type` values before (`normalized_mentions` -> `mentions`, v7.379) without changing prompts.
 */
const EVAL_RE = /^\s*Evaluate\s+(.+?)\s+on\s+(.+?)\s*$/i;

export interface EvalPrompt { brand: string; topic: string; }

/** Returns the brand + topic for a direct-evaluation prompt, or null for an open answer. */
export function parseEvalPrompt(prompt: string | undefined): EvalPrompt | null {
  if (!prompt) return null;
  const m = EVAL_RE.exec(String(prompt));
  if (!m) return null;
  const brand = m[1].trim();
  const topic = m[2].trim();
  if (!brand || !topic) return null;
  return { brand, topic };
}

/** A named bucket (a topic, an engine, a brand) with its coverage and its mean. */
export interface SentScoreBucket {
  label: string;
  n: number;        // scored rows
  rows: number;     // rows seen (scored + unscored) - the coverage denominator
  mean: number | null;
}

/**
 * Roll a label->ScoreAgg map into a sorted bucket list.
 * Buckets WITHOUT a mean sort last and keep their row counts, so an unscored topic stays
 * visible as a stated gap instead of dropping out of the view entirely (I.5 + I.6).
 */
export function rollBuckets(map: Record<string, ScoreAgg>): SentScoreBucket[] {
  return Object.keys(map).map((label) => {
    const a = map[label];
    return { label, n: a.n, rows: a.rows, mean: meanOf(a) };
  }).sort((x, y) => {
    if (x.mean === null && y.mean === null) return y.rows - x.rows;
    if (x.mean === null) return 1;
    if (y.mean === null) return -1;
    return y.mean - x.mean;
  });
}

/**
 * Is this parsed CSV row an actual data row?
 *
 * Profound appends a ONE-CELL TRAILER to its exports describing the filters that produced them:
 *   "Filters - Date: Aug 7, 2026 - Aug 9, 2026 . Regions: United States . Analysis: Sentiment"
 * Verified present on four of Wayne's five 2026-08 files (visibility, sentiment, platforms,
 * citations; the prompt-volume export has none). The panel's older parses never noticed it
 * because each of them keys off a REQUIRED column the trailer does not have - a citation row
 * needs a hostname, a visibility row needs a prompt - so the trailer fell out on its own and
 * `totalRuns` / `citeTotal` have always been right.
 *
 * A row counter, however, counts anything. Without this guard the sentiment coverage denominator
 * read 3,282 against a file with 3,281 data rows, which is a number that cannot be reconciled
 * against the export by anyone checking it (Const I.1 - every figure must be defendable).
 *
 * The test is structural (cell count), not a match on the word "Filters", so it survives a
 * localised or reworded trailer. A real row of this export has 49 cells; the trailer has one.
 */
export function isDataRow(row: string[]): boolean {
  return Array.isArray(row) && row.length >= 2;
}

/** Format a 0-1 score for display, or an explicit dash when the bucket has no scored rows. */
export function fmtScore(mean: number | null): string {
  return mean === null ? '—' : mean.toFixed(2);
}
