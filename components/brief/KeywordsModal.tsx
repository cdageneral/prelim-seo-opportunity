'use client';

import { useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KeywordRow {
  keyword:       string;
  searchVolume:  number;
  position:      number | null;  // null = gap keyword (client not ranked)
  type:          'ranked' | 'gap';
  hasAIO:        boolean;
  clientInAIO:   boolean;
  hasPAA:        boolean;
  clientInPAA:   boolean;
  hasVideo:      boolean;
  clientInVideo: boolean;
}

interface Props {
  analysis: any;
  onClose:  () => void;
}

// ─── Data Merge ───────────────────────────────────────────────────────────────

function buildKeywordRows(analysis: any): KeywordRow[] {
  const semrush   = analysis?.semrushSnapshot ?? {};
  const serpSnap  = analysis?.serpApiSnapshot ?? {};

  // Build SERP lookup keyed by keyword text
  const serpMap: Record<string, any> = {};
  for (const k of (serpSnap.keywords ?? [])) {
    serpMap[k.keyword?.toLowerCase()] = k;
  }

  const rows: KeywordRow[] = [];

  // Ranked keywords (client has a position)
  for (const k of (semrush.topKeywords ?? [])) {
    const serp = serpMap[k.keyword?.toLowerCase()];
    rows.push({
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     k.position ?? null,
      type:         'ranked',
      hasAIO:       serp?.hasAIO ?? false,
      clientInAIO:  serp ? (serp.aioSources ?? []).some((s: any) =>
                      analysis?.semrushSnapshot?.domain &&
                      s.domain?.includes(analysis.semrushSnapshot.domain)
                    ) : false,
      hasPAA:       (serp?.paaQuestions ?? []).length > 0,
      clientInPAA:  serp?.paaClientCited ?? false,
      hasVideo:     (serp?.serpFeatures ?? []).includes('videos'),
      clientInVideo: serp?.videoClientCited ?? false,
    });
  }

  // Gap keywords (competitor ranks, client doesn't)
  const existing = new Set(rows.map(r => r.keyword.toLowerCase()));
  for (const k of (semrush.gapKeywords ?? [])) {
    if (existing.has(k.keyword?.toLowerCase())) continue;
    const serp = serpMap[k.keyword?.toLowerCase()];
    rows.push({
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     null,
      type:         'gap',
      hasAIO:       serp?.hasAIO ?? false,
      clientInAIO:  false,
      hasPAA:       (serp?.paaQuestions ?? []).length > 0,
      clientInPAA:  false,
      hasVideo:     (serp?.serpFeatures ?? []).includes('videos'),
      clientInVideo: false,
    });
  }

  // Sort: ranked first (by position), then gap (by volume)
  return rows.sort((a, b) => {
    if (a.type === 'ranked' && b.type === 'gap') return -1;
    if (a.type === 'gap' && b.type === 'ranked') return 1;
    if (a.position !== null && b.position !== null) return a.position - b.position;
    return b.searchVolume - a.searchVolume;
  });
}

// ─── Downloads ────────────────────────────────────────────────────────────────

function downloadCSV(rows: KeywordRow[], clientName: string) {
  const headers = ['Keyword','Search Volume','Client Rank','Type','AI Overview','Client in AIO','PAA','Client in PAA','Video Carousel','Client in Video'];
  const lines   = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.keyword}"`,
      r.searchVolume,
      r.position ?? 'Not ranked',
      r.type,
      r.hasAIO    ? 'Yes' : 'No',
      r.clientInAIO  ? 'Yes' : 'No',
      r.hasPAA    ? 'Yes' : 'No',
      r.clientInPAA  ? 'Yes' : 'No',
      r.hasVideo  ? 'Yes' : 'No',
      r.clientInVideo ? 'Yes' : 'No',
    ].join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${clientName.replace(/\s+/g, '-')}-keywords.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadXLSX(rows: KeywordRow[], clientName: string) {
  const XLSX = await import('xlsx');

  const data = rows.map(r => ({
    'Keyword':          r.keyword,
    'Search Volume':    r.searchVolume,
    'Client Rank':      r.position ?? 'Not ranked',
    'Type':             r.type === 'ranked' ? 'Ranked' : 'Gap',
    'AI Overview':      r.hasAIO    ? 'Yes' : 'No',
    'Client in AIO':    r.clientInAIO  ? 'Yes' : 'No',
    'People Also Ask':  r.hasPAA    ? 'Yes' : 'No',
    'Client in PAA':    r.clientInPAA  ? 'Yes' : 'No',
    'Video Carousel':   r.hasVideo  ? 'Yes' : 'No',
    'Client in Video':  r.clientInVideo ? 'Yes' : 'No',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Keywords');

  // Column widths
  ws['!cols'] = [
    { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 8 },
    { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 13 },
    { wch: 15 }, { wch: 14 },
  ];

  XLSX.writeFile(wb, `${clientName.replace(/\s+/g, '-')}-keywords.xlsx`);
}

// ─── Pill helpers ─────────────────────────────────────────────────────────────

function Pill({ active, cited, label }: { active: boolean; cited: boolean; label: string }) {
  if (!active) return <span className="text-orbit-tertiary text-xs">—</span>;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
      cited
        ? 'bg-green-500/10 border-green-500/30 text-green-400'
        : 'bg-orbit-muted border-orbit-border text-orbit-tertiary'
    }`}>
      {cited ? `✓ ${label}` : label}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function KeywordsModal({ analysis, onClose }: Props) {
  const rows       = useMemo(() => buildKeywordRows(analysis), [analysis]);
  const clientName = analysis?.semrushSnapshot?.domain ?? 'keywords';
  const ranked     = rows.filter(r => r.type === 'ranked').length;
  const gap        = rows.filter(r => r.type === 'gap').length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl bg-orbit-card border border-orbit-border rounded-xl shadow-2xl flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-orbit-border shrink-0">
          <div>
            <h2 className="text-orbit-primary font-semibold text-base">Keyword List</h2>
            <p className="text-orbit-tertiary text-xs mt-0.5">
              {ranked} ranked · {gap} gap · {rows.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCSV(rows, clientName)}
              className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV
            </button>
            <button
              onClick={() => downloadXLSX(rows, clientName)}
              className="text-xs text-green-400 hover:text-green-300 border border-green-500/30 hover:border-green-500/60 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>
            <button
              onClick={onClose}
              className="text-orbit-tertiary hover:text-orbit-primary ml-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-orbit-surface border-b border-orbit-border">
              <tr>
                <th className="text-left text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest px-4 py-2.5 w-[35%]">Keyword</th>
                <th className="text-right text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest px-4 py-2.5">Search Vol</th>
                <th className="text-right text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest px-4 py-2.5">Rank</th>
                <th className="text-center text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest px-4 py-2.5">AI Overview</th>
                <th className="text-center text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest px-4 py-2.5">PAA</th>
                <th className="text-center text-orbit-tertiary text-[10px] font-medium uppercase tracking-widest px-4 py-2.5">Video</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-orbit-border/50 hover:bg-orbit-surface/60 transition-colors ${
                    row.type === 'gap' ? 'opacity-75' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-orbit-primary text-xs">{row.keyword}</span>
                      {row.type === 'gap' && (
                        <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full shrink-0">gap</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-orbit-secondary text-xs">{row.searchVolume.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.position !== null
                      ? <span className={`text-xs font-medium ${row.position <= 10 ? 'text-green-400' : row.position <= 20 ? 'text-amber-400' : 'text-orbit-tertiary'}`}>#{row.position}</span>
                      : <span className="text-orbit-tertiary text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Pill active={row.hasAIO} cited={row.clientInAIO} label="AIO" />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Pill active={row.hasPAA} cited={row.clientInPAA} label="PAA" />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Pill active={row.hasVideo} cited={row.clientInVideo} label="Video" />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-orbit-tertiary text-sm">
                    No keyword data — run an analysis first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer legend */}
        <div className="px-6 py-3 border-t border-orbit-border shrink-0 flex items-center gap-4">
          <span className="text-[10px] text-orbit-tertiary">SERP features based on keywords scanned by SerpAPI at analysis time</span>
          <span className="text-[10px] bg-green-500/10 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full">✓ cited = client appears in this feature</span>
          <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">gap = client not ranking</span>
        </div>
      </div>
    </div>
  );
}
