/**
 * v7.579 — the keyword map-pack scan's work queue, shared by the local-scan route,
 * the Local panel and the Assessment PDF so all three read ONE rule (Const II.6a).
 *
 * Before v7.579 the route kept the first 300 keywords of whatever order the panel
 * sent and silently dropped the rest (v7.299 MAX_SCAN_KEYWORDS — a runtime guard
 * against Vercel's 300s cap, not a requested limit; Const I.6). The scan now runs in
 * time-budgeted passes that checkpoint and resume, so every keyword is checked.
 *
 * Pure functions only — no I/O — so the regression suite can exercise them directly.
 */
import type { LocalKeywordScan, LocalScan } from './build';

const norm = (k: unknown): string => String(k ?? '').toLowerCase().trim();

/** De-duplicated, normalised keyword list, first occurrence wins. */
export function dedupeKeywords(keywords: string[]): string[] {
  const seen: Record<string, boolean> = {};
  const out: string[] = [];
  for (let i = 0; i < keywords.length; i++) {
    const k = norm(keywords[i]);
    if (k && !seen[k]) { seen[k] = true; out.push(k); }
  }
  return out;
}

/**
 * The keywords still to check: the full list minus every keyword already stored,
 * ordered by real Semrush volume (highest first; ties keep the panel's order), so an
 * interrupted run has always covered the highest-demand keywords first.
 */
export function pendingKeywords(
  all: string[],
  scanned: Array<Pick<LocalKeywordScan, 'keyword'>>,
  volByKw: Record<string, number>,
): string[] {
  const done: Record<string, boolean> = {};
  for (let i = 0; i < scanned.length; i++) { const k = norm(scanned[i]?.keyword); if (k) done[k] = true; }
  const list = dedupeKeywords(all).filter(k => !done[k]);
  const idx: Record<string, number> = {};
  list.forEach((k, i) => { idx[k] = i; });
  return list.slice().sort((a, b) => ((volByKw[b] ?? 0) - (volByKw[a] ?? 0)) || (idx[a] - idx[b]));
}

/** Merge a pass's results into the stored rows — by keyword, the newer row wins. */
export function mergeKeywordScans(prior: LocalKeywordScan[], fresh: LocalKeywordScan[]): LocalKeywordScan[] {
  const at: Record<string, number> = {};
  const out: LocalKeywordScan[] = [];
  const put = (r: LocalKeywordScan) => {
    const k = norm(r?.keyword);
    if (!k) return;
    if (at[k] != null) out[at[k]] = r;
    else { at[k] = out.length; out.push(r); }
  };
  prior.forEach(put);
  fresh.forEach(put);
  return out;
}

export interface KeywordScanCoverage {
  scanned:   number;   // keywords with a stored map-pack read
  total:     number;   // keywords the scan set out to check
  remaining: number;
  partial:   boolean;  // true when the stored scan has not checked every keyword yet
}

/**
 * How much of the keyword scan is stored. Only the v7.299 keyword model has a queue;
 * grid and legacy scans report complete. Reads the stored counts — never re-derives
 * the keyword list — so pre-v7.579 scans (capped at 300) disclose their real coverage.
 */
export function keywordScanCoverage(scan: Pick<LocalScan, 'model' | 'keywords' | 'scannedCount' | 'localTotal'> | null | undefined): KeywordScanCoverage | null {
  if (!scan) return null;
  const scanned = (scan.keywords ?? []).length;
  if (scan.model !== 'keyword') return { scanned, total: scanned, remaining: 0, partial: false };
  const total = Math.max(scanned, Number(scan.localTotal) || 0);
  const remaining = Math.max(0, total - scanned);
  return { scanned, total, remaining, partial: remaining > 0 };
}
