// v7.429: Product Insights KPI drill-down → XLSX. ONE ROW PER TOPIC, exactly the rows
// the drill-down renders (same builder, same order) — the export is a serializer, never a
// second derivation (Const II.6a / II.7). A field the panel could not measure is left
// BLANK, never filled with a guess (Const I.1/I.5): no ranking page means no ranking page.
// Dynamic-imports xlsx so it stays out of the static bundle (same pattern as
// rankBucketExport / topicExport).

export interface ProductInsightTopicRow {
  verdict:  string;          // the on-panel verdict label, verbatim
  product:  string;          // top-level product category
  topic:    string;          // canonical topic name
  page:     string;          // client's best ranking URL path ('' when none measured)
  bestRank: number | null;   // best measured position (null = not ranked in source rows)
  demand:   number;          // monthly volume — exact rollup of the topic's keywords
  stage:    string;          // funnel stage from the stored taxonomy
  keywords: number;          // keyword count in the topic
}

function sanitizeSheetName(s: string): string {
  const cleaned = (s || '').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || 'Topics').slice(0, 31);
}

function slug(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function exportProductInsightTopicsXLSX(
  rows: ProductInsightTopicRow[],
  opts: { clientName: string; verdictLabel: string },
): Promise<void> {
  const XLSX = await import('xlsx');

  const toRecord = (r: ProductInsightTopicRow) => ({
    'Verdict':           r.verdict ?? '',
    'Product':           r.product ?? '',
    'Topic':             r.topic ?? '',
    'Your Ranking Page': r.page ?? '',
    // null rank stays BLANK — an unranked topic is not rank 0 (Const I.1).
    'Best Rank':         r.bestRank === null ? '' : r.bestRank,
    'Demand / mo':       r.demand ?? 0,
    'Funnel Stage':      r.stage ?? '',
    'Keywords':          r.keywords ?? 0,
  });

  const EMPTY = {
    'Verdict': '', 'Product': '', 'Topic': '', 'Your Ranking Page': '',
    'Best Rank': '', 'Demand / mo': '', 'Funnel Stage': '', 'Keywords': '',
  };
  const data = rows.length ? rows.map(toRecord) : [EMPTY];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.verdictLabel));
  ws['!cols'] = [24, 26, 34, 40, 11, 14, 16, 11].map((wch) => ({ wch }));

  const name = `${slug(opts.clientName) || 'client'}-${slug(opts.verdictLabel) || 'topics'}.xlsx`;
  XLSX.writeFile(wb, name);
}
