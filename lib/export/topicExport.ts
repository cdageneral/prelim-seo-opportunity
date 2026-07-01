// v7.328: shared per-segment topic → XLSX export. ONE ROW PER TOPIC. Real data only —
// a field that is absent is left blank, never fabricated (Const I.1). Uses the same
// dynamic-import pattern as KeywordsPanel.downloadXLSX so xlsx stays out of the static
// bundle (no top-level xlsx import).

export interface ExportTopicRow {
  topic:       string;
  keywords:    string[];        // keyword strings; joined into one cell
  totalVolume: number;
  url?:        string | null;
  priority?:   string;          // '' when the panel has no P0/P1/P2
  stage?:      string;
  label:       string;          // 'Existing' | 'Net-new'
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

export async function exportSegmentXLSX(
  rows: ExportTopicRow[],
  opts: { clientName: string; segment: string },
): Promise<void> {
  const XLSX = await import('xlsx');

  const toRecord = (r: ExportTopicRow) => ({
    'Topic':                r.topic ?? '',
    'Keywords':             (r.keywords ?? []).join(', '),
    'Keyword Count':        (r.keywords ?? []).length,
    'Total Monthly Volume': r.totalVolume ?? 0,
    'Existing URL':         r.url ?? '',
    'Priority':             r.priority ?? '',
    'Journey Stage':        r.stage ?? '',
    'Type':                 r.label ?? '',
  });

  // Empty segment → still emit a header-only sheet so the download isn't broken.
  const EMPTY = {
    'Topic': '', 'Keywords': '', 'Keyword Count': '', 'Total Monthly Volume': '',
    'Existing URL': '', 'Priority': '', 'Journey Stage': '', 'Type': '',
  };
  const data = rows.length ? rows.map(toRecord) : [EMPTY];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.segment));
  ws['!cols'] = [40, 60, 13, 20, 46, 10, 16, 12].map((wch) => ({ wch }));

  const name = `${slug(opts.clientName) || 'client'}-${slug(opts.segment) || 'segment'}.xlsx`;
  XLSX.writeFile(wb, name);
}
