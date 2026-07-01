// v7.330: per-KEYWORD rank-bucket → XLSX export for the Google Ranks panel's
// rank-bucket summary cards. ONE ROW PER KEYWORD. Real data only — a field that is
// absent (e.g. no stored topic category) is left blank, never fabricated (Const I.1).
// Uses the same dynamic-import pattern as KeywordsPanel.downloadXLSX / topicExport so
// xlsx stays out of the static bundle (no top-level xlsx import).

export interface RankBucketKeywordRow {
  bucket:   string;   // rank bucket label, e.g. 'Pos 1–3'
  category: string;   // stored topic category ('' when the analysis has no taxonomy)
  keyword:  string;   // the keyword text
  volume:   number;   // monthly search volume (matches the keyword table's Vol / mo)
}

// Excel forbids : \ / ? * [ ] in sheet names, and caps them at 31 chars.
function sanitizeSheetName(s: string): string {
  const cleaned = (s || '').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Segment').slice(0, 31);
}

// lowercase, non-alphanumerics → '-', trim leading/trailing '-'.
function slug(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function exportRankBucketXLSX(
  rows: RankBucketKeywordRow[],
  opts: { clientName: string; segment: string },
): Promise<void> {
  const XLSX = await import('xlsx');

  const toRecord = (r: RankBucketKeywordRow) => ({
    'Rank Bucket':    r.bucket ?? '',
    'Topic Category': r.category ?? '',
    'Keyword':        r.keyword ?? '',
    'Search Volume':  r.volume ?? 0,
  });

  // Empty segment → still emit a header-only sheet so the download isn't broken.
  const EMPTY = { 'Rank Bucket': '', 'Topic Category': '', 'Keyword': '', 'Search Volume': '' };
  const data = rows.length ? rows.map(toRecord) : [EMPTY];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.segment));
  ws['!cols'] = [16, 32, 48, 15].map((wch) => ({ wch }));

  const name = `${slug(opts.clientName) || 'client'}-${slug(opts.segment) || 'segment'}-keywords.xlsx`;
  XLSX.writeFile(wb, name);
}
