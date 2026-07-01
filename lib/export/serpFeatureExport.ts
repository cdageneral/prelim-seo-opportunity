// v7.333: per-KEYWORD SERP-feature → XLSX export for the SERP Features panel's
// AI Overviews / People Also Ask / Video Carousel summary cards. ONE ROW PER
// KEYWORD, drawn from the same v7.332 buildFeaturePool() pool that feeds the
// card's own Available count and its "Has {feature}" keyword list — so the
// export always reconciles with what's on screen (Const II.7). Real data only
// (Const I.1): "Cited" is 'Unknown' (never 'No') for a keyword that hasn't
// been SerpAPI-scanned yet, because Semrush's uploaded data can say a feature
// exists but never who is cited (Const I.5 — never guess a negative). Uses the
// same dynamic-import pattern as KeywordsPanel.downloadXLSX / topicExport /
// rankBucketExport so xlsx stays out of the static bundle.

export interface SerpFeatureKeywordRow {
  feature:    string;               // 'AI Overview' | 'People Also Ask' | 'Video Carousel'
  keyword:    string;
  volume:     number;               // monthly search volume
  scanStatus: 'Scanned' | 'Not yet scanned';
  cited:      'Yes' | 'No' | 'Unknown';
  source:     'SerpAPI scan' | 'Semrush upload';
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

export async function exportSerpFeatureXLSX(
  rows: SerpFeatureKeywordRow[],
  opts: { clientName: string; segment: string },
): Promise<void> {
  const XLSX = await import('xlsx');

  const toRecord = (r: SerpFeatureKeywordRow) => ({
    'Feature':        r.feature ?? '',
    'Keyword':        r.keyword ?? '',
    'Search Volume':  r.volume ?? 0,
    'Scan Status':    r.scanStatus ?? '',
    'Cited':          r.cited ?? 'Unknown',
    'Source':         r.source ?? '',
  });

  // Empty segment → still emit a header-only sheet so the download isn't broken.
  const EMPTY = {
    'Feature': '', 'Keyword': '', 'Search Volume': '', 'Scan Status': '', 'Cited': '', 'Source': '',
  };
  const data = rows.length ? rows.map(toRecord) : [EMPTY];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.segment));
  ws['!cols'] = [16, 48, 15, 17, 10, 15].map((wch) => ({ wch }));

  const name = `${slug(opts.clientName) || 'client'}-${slug(opts.segment) || 'segment'}-keywords.xlsx`;
  XLSX.writeFile(wb, name);
}
