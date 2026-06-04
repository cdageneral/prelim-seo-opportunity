'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { buildKwPool, isBrandedKeyword, extractBrand } from '@/lib/utils/kwVolume';

// ─── Types ────────────────────────────────────────────────────────────────────

type KwSource = 'semrush' | 'custom' | 'csv';
type KwFilter = 'all' | 'branded' | 'nonBranded' | 'competitorGap';
type SortCol  = 'keyword' | 'competitor' | 'volume' | 'rank' | null;
type SortDir  = 'asc' | 'desc';

// v7.80: rank-bucket filter — replaces the old segment pills (segments now
// live exclusively on the summary cards). 'all' = no rank filtering.
type RankFilter = 'all' | 'p13' | 'p410' | 'p2' | 'p3p';

// Bucket order is fixed: [1–3, 4–10, Page 2, Page 3+, Unranked/gap]
const RANK_BUCKETS = [
  { id: 'p13'  as const, label: '1–3',            color: '#6C63FF' },
  { id: 'p410' as const, label: '4–10',           color: '#06B6D4' },
  { id: 'p2'   as const, label: 'Page 2',         color: '#F59E0B' },
  { id: 'p3p'  as const, label: 'Page 3+',        color: '#EF4444' },
  { id: 'unr'  as const, label: 'Unranked / gap', color: '#2E2E48' },
];

function bucketIndexOf(position: number | null): number {
  if (position === null) return 4;
  if (position <= 3)     return 0;
  if (position <= 10)    return 1;
  if (position <= 20)    return 2;
  return 3;
}

function matchesRankFilter(position: number | null, rf: RankFilter): boolean {
  if (rf === 'all') return true;
  const idx = { p13: 0, p410: 1, p2: 2, p3p: 3 }[rf];
  return bucketIndexOf(position) === idx;
}

interface KeywordRow {
  key:          string;          // unique key for React
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  type:         'ranked' | 'gap';
  branded:      boolean;
  source:       KwSource;
  competitor:   string | null;   // domain that ranks for this keyword (gap rows only)
  // SERP features (only on semrush rows)
  hasAIO:        boolean;
  clientInAIO:   boolean;
  hasPAA:        boolean;
  clientInPAA:   boolean;
  hasVideo:      boolean;
  clientInVideo: boolean;
}

interface DbKeyword {
  id:           number;
  projectId:    string;
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  type:         string;
  branded:      boolean;
  source:       string;
}

interface Props {
  projectId:   string;
  analysis:    any;
  competitors: string[];  // competitor domains for branded detection
  domain?:     string;    // project websiteUrl — fallback when semrushSnapshot.domain is absent
  defaultClientThreshold?:     number;  // project-level min vol for client ranked keywords
  defaultCompetitorThreshold?: number;  // project-level min vol for competitor gap keywords
}

// ─── Category breakdown types ─────────────────────────────────────────────────

interface KwCategoryRow {
  name:          string;
  type:          'procedure' | 'brand' | 'location';
  monthlyDemand: number;
  page1Demand:   number;
}

interface KwCategoryBreakdown {
  categories:        KwCategoryRow[];
  totalMonthlyDemand: number;
  totalPage1Demand:   number;
  keywordCategories:  Record<string, string>; // lowercase kw → category name
}

// ─── Branded detection — delegated to shared utility ─────────────────────────
// isBrandedKeyword and extractBrand are imported from lib/utils/kwVolume.
// DO NOT add a local isBranded implementation here — edit the utility instead.
const isBranded = isBrandedKeyword;

// ─── Merge semrush + DB rows ──────────────────────────────────────────────────
// Uses buildKwPool from lib/utils/kwVolume for all filtering (thresholds, dedup,
// branded exclusion). Enriches each item with SERP feature flags on top.

function buildRows(
  analysis: any,
  dbKeywords: DbKeyword[],
  clientDomain: string,
  competitorDomains: string[],
  clientVolMin: number = 0,
  competitorVolMin: number = 0,
  extraSerp: any[] = [],   // v7.81: freshly scanned batch results (live-merged, no reload)
): KeywordRow[] {
  const serpSnap = analysis?.serpApiSnapshot ?? {};

  // SERP lookup keyed by lowercase keyword text
  const serpMap: Record<string, any> = {};
  for (const k of (serpSnap.keywords ?? [])) {
    serpMap[k.keyword?.toLowerCase()] = k;
  }
  for (const k of extraSerp) {
    if (k?.keyword) serpMap[k.keyword.toLowerCase()] = k;
  }

  // Core filtering via shared utility — single source of truth
  const pool = buildKwPool({
    semrushSnapshot:  analysis?.semrushSnapshot,
    uploadedKeywords: dbKeywords,
    clientDomain,
    competitorDomains,
    clientVolMin,
    competitorVolMin,
  });

  // Map pool items to KeywordRow, adding SERP enrichment
  const rows: KeywordRow[] = pool.map(item => {
    const kwLow = item.keyword.toLowerCase();
    const serp  = serpMap[kwLow];
    const dbRow = dbKeywords.find(d => d.keyword.toLowerCase() === kwLow && d.source !== 'blocked');

    return {
      key:          dbRow ? `${dbRow.source}-${dbRow.id}` : (item.isGap ? `sem-gap-${kwLow}` : `sem-ranked-${kwLow}`),
      keyword:      item.keyword,
      searchVolume: item.searchVolume,
      position:     item.position,
      type:         item.isGap ? 'gap' : 'ranked',
      branded:      item.isBranded,
      source:       (dbRow?.source ?? 'semrush') as KwSource,
      competitor:   item.competitor,
      hasAIO:       serp?.hasAIO ?? false,
      clientInAIO:  serp
        ? (serp.aioSources ?? []).some(
            (s: any) => clientDomain && s.domain?.includes(extractBrand(clientDomain)),
          )
        : false,
      hasPAA:        (serp?.paaQuestions ?? []).length > 0,
      clientInPAA:   serp?.paaClientCited ?? false,
      // v7.81 fix: serp.ts stores 'video_carousel' — the old 'videos' check
      // meant the Video pill never lit up even for scanned keywords.
      hasVideo:      (serp?.serpFeatures ?? []).includes('video_carousel'),
      clientInVideo: serp?.videoClientCited ?? false,
    };
  });

  // Sort: ranked first (by position asc), then gap (by volume desc)
  return rows.sort((a, b) => {
    if (a.type === 'ranked' && b.type === 'gap') return -1;
    if (a.type === 'gap'    && b.type === 'ranked') return 1;
    if (a.position !== null && b.position !== null) return a.position - b.position;
    return b.searchVolume - a.searchVolume;
  });
}

// ─── Filter ───────────────────────────────────────────────────────────────────

function applyFilter(rows: KeywordRow[], filter: KwFilter, volMin: number = 0): KeywordRow[] {
  switch (filter) {
    case 'branded':       return rows.filter(r => r.branded);
    case 'nonBranded':    return rows.filter(r => !r.branded);
    case 'competitorGap': return rows.filter(r => r.type === 'gap' && !!r.competitor && r.searchVolume >= volMin);
    default:              return rows;
  }
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

function applySort(rows: KeywordRow[], col: SortCol, dir: SortDir): KeywordRow[] {
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case 'keyword':
        cmp = a.keyword.localeCompare(b.keyword);
        break;
      case 'competitor':
        cmp = (a.competitor ?? '').localeCompare(b.competitor ?? '');
        break;
      case 'volume':
        cmp = a.searchVolume - b.searchVolume;
        break;
      case 'rank':
        // null positions always go last regardless of direction
        if (a.position === null && b.position === null) cmp = 0;
        else if (a.position === null) return 1;
        else if (b.position === null) return -1;
        else cmp = a.position - b.position;
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

// Default direction per column (first click)
const SORT_DEFAULT_DIR: Record<NonNullable<SortCol>, SortDir> = {
  keyword:    'asc',
  competitor: 'asc',
  volume:     'desc',
  rank:       'asc',
};

// ─── Downloads ────────────────────────────────────────────────────────────────

// Maps filter id → human label and filename slug
const FILTER_META: Record<KwFilter, { label: string; slug: string }> = {
  all:           { label: 'All',           slug: 'all'            },
  branded:       { label: 'Branded',       slug: 'branded'        },
  nonBranded:    { label: 'Non-branded',   slug: 'non-branded'    },
  competitorGap: { label: 'Competitor Gap', slug: 'competitor-gap' },
};

function downloadCSV(rows: KeywordRow[], clientName: string, filterSlug: string) {
  const headers = ['Keyword','Competitor','Monthly Search Volume','Client Rank','Type','Branded','Source','AI Overview','Client in AIO','PAA','Client in PAA','Video','Client in Video'];
  const lines   = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.keyword}"`,
      r.competitor ? extractBrand(r.competitor) : '—',
      r.searchVolume,
      r.position ?? 'Not ranked',
      r.type,
      r.branded ? 'Yes' : 'No',
      r.source,
      r.hasAIO      ? 'Yes' : 'No',
      r.clientInAIO ? 'Yes' : 'No',
      r.hasPAA      ? 'Yes' : 'No',
      r.clientInPAA ? 'Yes' : 'No',
      r.hasVideo    ? 'Yes' : 'No',
      r.clientInVideo ? 'Yes' : 'No',
    ].join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${clientName.replace(/\s+/g, '-')}-keywords-${filterSlug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadXLSX(rows: KeywordRow[], clientName: string, filterSlug: string) {
  const XLSX = await import('xlsx');
  const data = rows.map(r => ({
    'Keyword':          r.keyword,
    'Competitor':       r.competitor ? extractBrand(r.competitor) : '—',
    'Monthly Search Volume': r.searchVolume,
    'Client Rank':      r.position ?? 'Not ranked',
    'Type':             r.type === 'ranked' ? 'Ranked' : 'Gap',
    'Branded':          r.branded ? 'Yes' : 'No',
    'Source':           r.source,
    'AI Overview':      r.hasAIO      ? 'Yes' : 'No',
    'Client in AIO':    r.clientInAIO ? 'Yes' : 'No',
    'People Also Ask':  r.hasPAA      ? 'Yes' : 'No',
    'Client in PAA':    r.clientInPAA ? 'Yes' : 'No',
    'Video Carousel':   r.hasVideo    ? 'Yes' : 'No',
    'Client in Video':  r.clientInVideo ? 'Yes' : 'No',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Keywords');
  ws['!cols'] = [
    { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 9 },
    { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 13 }, { wch: 15 }, { wch: 14 },
  ];
  XLSX.writeFile(wb, `${clientName.replace(/\s+/g, '-')}-keywords-${filterSlug}.xlsx`);
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ active, cited, label }: { active: boolean; cited: boolean; label: string }) {
  if (!active) return <span className="text-orbit-tertiary text-xs">—</span>;
  return (
    <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${
      cited
        ? 'bg-green-500/10 border-green-500/30 text-green-400'
        : 'bg-orbit-muted border-orbit-border text-orbit-tertiary'
    }`}>
      {cited ? `✓ ${label}` : label}
    </span>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: KwSource }) {
  if (source === 'semrush') return null;
  const styles: Record<string, string> = {
    custom: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    csv:    'bg-blue-500/10 border-blue-500/20 text-blue-400',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${styles[source] ?? ''}`}>
      {source}
    </span>
  );
}

// ─── Format volume ────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// ─── Sort header cell ─────────────────────────────────────────────────────────

function SortHeader({
  label, col, activeCol, dir, align, width, onClick,
}: {
  label:     string;
  col:       NonNullable<SortCol>;
  activeCol: SortCol;
  dir:       SortDir;
  align:     'left' | 'right' | 'center';
  width?:    string;
  onClick:   (col: NonNullable<SortCol>) => void;
}) {
  const active = activeCol === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={`text-[9px] font-medium uppercase tracking-widest px-3 py-2.5 cursor-pointer select-none text-${align}`}
      style={{ width, userSelect: 'none' }}
    >
      <span
        className="inline-flex items-center gap-1 transition-colors"
        style={{ color: active ? '#9B96FF' : '#555575' }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#8080A8'; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#555575'; }}
      >
        {align === 'right' && (
          <span style={{ fontSize: '8px', opacity: active ? 1 : 0.35, lineHeight: 1 }}>
            {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        )}
        {label}
        {align !== 'right' && (
          <span style={{ fontSize: '8px', opacity: active ? 1 : 0.35, lineHeight: 1 }}>
            {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        )}
      </span>
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KeywordsPanel({
  projectId, analysis, competitors, domain,
  defaultClientThreshold     = 0,
  defaultCompetitorThreshold = 0,
}: Props) {
  const clientDomain      = (analysis?.semrushSnapshot?.domain as string) || domain || '';
  const competitorDomains = competitors;
  const clientName        = clientDomain || 'keywords';

  const [dbKeywords,  setDbKeywords]  = useState<DbKeyword[]>([]);
  const [dbLoaded,    setDbLoaded]    = useState(false);
  const [filter,      setFilter]      = useState<KwFilter>('all');
  const [rankFilter,  setRankFilter]  = useState<RankFilter>('all');
  // v7.81: incremental SERP feature scanning
  const [serpExtra,   setSerpExtra]   = useState<any[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError,   setScanError]   = useState('');
  const [showAdd,     setShowAdd]     = useState(false);
  const [newKw,       setNewKw]       = useState('');
  const [newVol,      setNewVol]      = useState('');
  const [newType,     setNewType]     = useState<'ranked' | 'gap'>('gap');
  const [addError,    setAddError]    = useState('');
  const [addLoading,  setAddLoading]  = useState(false);
  const [deletingKey,   setDeletingKey]   = useState<string | null>(null);
  // volThreshold comes from the project-level setting (Edit Project); not adjustable inline
  const [volThreshold] = useState<number>(defaultCompetitorThreshold);
  // Column sort
  const [sortCol,  setSortCol]  = useState<SortCol>(null);
  const [sortDir,  setSortDir]  = useState<SortDir>('desc');
  const [csvStatus,   setCsvStatus]   = useState<{ type: 'loading' | 'success' | 'error'; msg: string } | null>(null);
  const [csvProgress, setCsvProgress] = useState<{ current: number; total: number } | null>(null);
  const [showClearConfirm,     setShowClearConfirm]     = useState(false);
  const [clearLoading,         setClearLoading]         = useState(false);
  const [clearStep,            setClearStep]            = useState('');
  // v7.101: competitor CSV upload moved to CompetitorsModal (top global nav)
  const csvRef = useRef<HTMLInputElement>(null);

  // ── Fetch DB keywords on mount ──
  const fetchDb = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/keywords`);
      const data = await res.json();
      setDbKeywords(data.keywords ?? []);
    } catch { /* silent */ } finally {
      setDbLoaded(true);
    }
  }, [projectId]);

  useEffect(() => { fetchDb(); }, [fetchDb]);

  // ── Build merged rows (project-level thresholds applied at build time) ──
  const allRows = useMemo(
    () => buildRows(analysis, dbKeywords, clientDomain, competitorDomains, defaultClientThreshold, defaultCompetitorThreshold, serpExtra),
    [analysis, dbKeywords, clientDomain, competitorDomains, defaultClientThreshold, defaultCompetitorThreshold, serpExtra],
  );

  // ── SERP feature coverage (v7.81) — scanned keywords vs canonical pool ──
  const serpCoverage = useMemo(() => {
    const set = new Set<string>();
    for (const k of (analysis?.serpApiSnapshot?.keywords ?? [])) {
      if (k?.keyword) set.add(k.keyword.toLowerCase());
    }
    for (const k of serpExtra) {
      if (k?.keyword) set.add(k.keyword.toLowerCase());
    }
    const scanned = allRows.filter(r => set.has(r.keyword.toLowerCase())).length;
    return { scanned, total: allRows.length, remaining: allRows.length - scanned };
  }, [analysis, serpExtra, allRows]);

  // ── Scan next batch of unscanned keywords via SerpAPI ──
  async function handleSerpScan() {
    setScanLoading(true);
    setScanError('');
    try {
      const res  = await fetch(`/api/projects/${projectId}/serp-scan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ batchSize: 75 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? 'Scan failed. Try again.');
        return;
      }
      setSerpExtra(prev => [...prev, ...(data.results ?? [])]);
      if (data.scanned === 0 && data.remaining > 0) {
        setScanError('No results returned — check SerpAPI credits/rate limit and try again.');
      }
    } catch {
      setScanError('Scan failed — network error.');
    } finally {
      setScanLoading(false);
    }
  }
  // Segment rows: summary-card filter only (no rank filter) — the category
  // breakdown needs ALL rank buckets of the active segment for its stacked bars.
  const segmentRows = useMemo(
    () => applyFilter(allRows, filter, filter === 'competitorGap' ? volThreshold : 0),
    [allRows, filter, volThreshold],
  );
  const visibleRows = useMemo(
    () => applySort(
      segmentRows.filter(r => matchesRankFilter(r.position, rankFilter)),
      sortCol, sortDir,
    ),
    [segmentRows, rankFilter, sortCol, sortDir],
  );

  function handleSort(col: NonNullable<SortCol>) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(SORT_DEFAULT_DIR[col]);
    }
  }

  const ranked = visibleRows.filter(r => r.type === 'ranked').length;
  const gap    = visibleRows.filter(r => r.type === 'gap').length;

  // ── Summary card stats — always computed from full allRows, annualised × 12 ──
  const kwSummary = useMemo(() => {
    const brandedRows  = allRows.filter(r =>  r.branded);
    const nonBrandRows = allRows.filter(r => !r.branded);
    const gapRows      = allRows.filter(r => r.type === 'gap' && !!r.competitor);
    const gapFiltered  = gapRows.filter(r => r.searchVolume >= volThreshold);
    const ann          = (rows: KeywordRow[]) => rows.reduce((s, r) => s + r.searchVolume, 0) * 12;
    return {
      allCount:      allRows.length,
      allVol:        ann(allRows),
      brandedCount:  brandedRows.length,
      brandedVol:    ann(brandedRows),
      nonBrandCount: nonBrandRows.length,
      nonBrandVol:   ann(nonBrandRows),
      gapCount:      gapFiltered.length,
      gapVol:        ann(gapFiltered),
    };
  }, [allRows, volThreshold]);

  // ── Category breakdown source ─────────────────────────────────────────────
  // v7.80: cb supplies the category list (names + types) and the complete
  // keyword → category map from synthesis. ALL aggregation (counts, demand,
  // rank buckets, averages) is computed client-side in KwCategorySection from
  // the canonical segmentRows pool, so category totals always balance with
  // the summary cards for the active segment.
  const cb = (analysis?.semrushSnapshot?._categoryBreakdown ?? null) as KwCategoryBreakdown | null;

  // ── Add keyword ──
  async function handleAdd() {
    const kwTrimmed = newKw.trim();
    if (!kwTrimmed) { setAddError('Keyword is required.'); return; }
    setAddError('');
    setAddLoading(true);
    try {
      const detectedBranded = isBranded(kwTrimmed, clientDomain, competitorDomains);
      const res = await fetch(`/api/projects/${projectId}/keywords`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          keyword:      kwTrimmed,
          searchVolume: parseInt(newVol) || 0,
          type:         newType,
          branded:      detectedBranded,
          source:       'custom',
        }),
      });
      if (res.status === 409) {
        setAddError('This keyword already exists in your list.');
        return;
      }
      if (!res.ok) {
        setAddError('Failed to add keyword. Try again.');
        return;
      }
      setNewKw('');
      setNewVol('');
      setNewType('gap');
      setShowAdd(false);
      await fetchDb();
    } finally {
      setAddLoading(false);
    }
  }

  // ── Delete / block keyword ──
  async function handleDelete(row: KeywordRow) {
    setDeletingKey(row.key);
    try {
      if (row.source === 'semrush') {
        // Block the semrush keyword so it stays hidden
        await fetch(`/api/projects/${projectId}/keywords`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            keyword:      row.keyword,
            searchVolume: row.searchVolume,
            type:         row.type,
            branded:      row.branded,
            source:       'blocked',
          }),
        });
      } else {
        // Hard delete the custom/csv row
        await fetch(`/api/projects/${projectId}/keywords`, {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ keyword: row.keyword, source: row.source }),
        });
      }
      await fetchDb();
    } finally {
      setDeletingKey(null);
    }
  }

  // ── CSV upload ──
  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvStatus({ type: 'loading', msg: 'Uploading keywords…' });

    let text: string;
    try { text = await file.text(); } catch {
      setCsvStatus({ type: 'error', msg: 'Could not read file.' });
      if (csvRef.current) csvRef.current.value = '';
      return;
    }

    // Normalise line endings (Windows \r\n or bare \r) then split
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const dataLines = lines.slice(1).filter((l: string) => l.trim().length > 0);

    if (dataLines.length === 0) {
      setCsvStatus({ type: 'error', msg: 'CSV is empty — needs a header row and at least one data row.' });
      if (csvRef.current) csvRef.current.value = '';
      return;
    }

    // Parse CSV — detect column layout from header row
    // Supports: simple (keyword, search_volume, type) AND Semrush Positions export
    const headerLine = lines[0] ?? '';
    const headerCols = headerLine.split(',').map((c: string) => c.replace(/^\"|"$/g, '').trim().toLowerCase());
    const kwCol   = Math.max(0, headerCols.findIndex((h: string) => h === 'keyword' || h === 'keywords'));
    const volCol  = (() => {
      const idx = headerCols.findIndex((h: string) =>
        h === 'search volume' || h === 'search_volume' || h === 'searchvolume' || h === 'volume' || h === 'monthly volume');
      return idx >= 0 ? idx : 1; // fallback: col 1
    })();
    const posCol  = (() => {
      const idx = headerCols.findIndex((h: string) => h === 'position' || h === 'rank' || h === 'ranking position');
      return idx >= 0 ? idx : -1; // -1 = not found
    })();
    const typeCol = headerCols.findIndex((h: string) => h === 'type');

    // Parse CSV rows using a proper quoted-field splitter
    function splitCsvLine(line: string): string[] {
      const result: string[] = [];
      let cur = ''; let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      result.push(cur.replace(/\r$/, '').trim());
      return result;
    }

    const parsed: Array<{ keyword: string; searchVolume: number; position: number | null; type: 'ranked' | 'gap'; branded: boolean }> = [];
    for (const line of dataLines) {
      const cols  = splitCsvLine(line);
      const kwText = (cols[kwCol] ?? '').replace(/^"|"$/g, '').trim();
      if (!kwText) continue;
      const vol     = parseInt(cols[volCol] ?? '0') || 0;
      const pos     = posCol >= 0 ? (parseInt(cols[posCol] ?? '') || null) : null;
      const kwType: 'ranked' | 'gap' = typeCol >= 0
        ? ((cols[typeCol] ?? '').toLowerCase().trim() === 'ranked' ? 'ranked' : 'gap')
        : (pos !== null && pos <= 100 ? 'ranked' : 'gap');
      const branded = isBranded(kwText, clientDomain, competitorDomains);
      parsed.push({ keyword: kwText, searchVolume: vol, position: pos, type: kwType, branded });
    }

    if (parsed.length === 0) {
      setCsvStatus({ type: 'error', msg: 'No valid rows found. Expected columns: keyword, search_volume, type' });
      if (csvRef.current) csvRef.current.value = '';
      return;
    }

    // Send all keywords to the batch endpoint in chunks of 500
    // This avoids 3000+ individual DB connections and is far more reliable
    let added = 0; let skipped = 0;
    const CHUNK = 500;
    setCsvProgress({ current: 0, total: parsed.length });
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      try {
        const res = await fetch(`/api/projects/${projectId}/keywords/batch`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: '',
            source: 'csv',
            keywords: chunk.map((row: { keyword: string; searchVolume: number; position: number | null; type: 'ranked' | 'gap'; branded: boolean }) => ({
              keyword:      row.keyword,
              searchVolume: row.searchVolume,
              position:     row.position,
              type:         row.type,
            })),
          }),
        });
        if (res.ok) {
          const d = await res.json();
          added   += (d.inserted ?? 0) + (d.updated ?? 0);   // v7.92: re-uploads update in place
          skipped += d.skipped  ?? 0;
        } else {
          skipped += chunk.length;
        }
      } catch {
        skipped += chunk.length;
      }
      setCsvProgress({ current: Math.min(i + CHUNK, parsed.length), total: parsed.length });
    }
    setCsvProgress(null);

    if (csvRef.current) csvRef.current.value = '';
    await fetchDb();

    if (added === 0) {
      setCsvStatus({ type: 'error', msg: `All ${skipped} keyword${skipped !== 1 ? 's' : ''} already exist — duplicates skipped.` });
    } else {
      const skipNote = skipped > 0 ? ` · ${skipped} skipped (duplicates)` : '';
      setCsvStatus({ type: 'success', msg: `${added} keyword${added !== 1 ? 's' : ''} uploaded${skipNote}.` });
    }
    setTimeout(() => setCsvStatus(null), 6000);
  }

  // ── Clear all custom/CSV/blocked keywords ──

  async function handleClearAll() {
    setClearLoading(true);
    setClearStep('Deleting uploaded keywords…');

    // Step 1: bulk-delete all csv/custom/blocked rows in a single SQL statement
    await fetch(`/api/projects/${projectId}/keywords/clear`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sources: ['csv', 'custom', 'blocked'] }),
    }).catch(() => null);

    // Step 2: block all Semrush analysis keywords via batch endpoint
    setClearStep('Hiding Semrush keywords…');
    const semSnap = (analysis?.semrushSnapshot ?? {}) as any;
    const semKws: Array<{ keyword: string }> = [
      ...(semSnap.topKeywords ?? []),
      ...(semSnap.gapKeywords ?? []),
    ];
    if (semKws.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < semKws.length; i += CHUNK) {
        await fetch(`/api/projects/${projectId}/keywords/batch`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: '', source: 'blocked',
            keywords: semKws.slice(i, i + CHUNK).map((k: { keyword: string }) => ({ keyword: k.keyword, searchVolume: 0 })),
          }),
        }).catch(() => null);
      }
    }

    setClearStep('Refreshing…');
    await fetchDb();
    setClearLoading(false);
    setClearStep('');
    setShowClearConfirm(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-orbit-border shrink-0" style={{ background: '#0D0D18' }}>
          <div>
            <h2 className="text-orbit-primary font-semibold text-sm">Keyword Landscape</h2>
            <p className="text-orbit-tertiary text-[11px] mt-0.5">
              {dbLoaded
                ? <>{visibleRows.length.toLocaleString()} total &nbsp;·&nbsp; {ranked.toLocaleString()} ranked &nbsp;·&nbsp; {gap} gap</>
                : <span style={{ color: '#333350' }}>Loading keywords…</span>
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Upload CSV */}
            <label
              className="text-xs border border-orbit-border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              title="Upload CSV (columns: keyword, search_volume, type)"
              style={{ color: '#7070A0', opacity: csvProgress ? 0.5 : 1, pointerEvents: csvProgress ? 'none' : 'auto' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload CSV
              <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvUpload} />
            </label>

            {/* Clear All */}
            {dbKeywords.length > 0 && !showClearConfirm && !csvProgress && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs border border-orbit-border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                style={{ color: '#7070A0' }}
                title="Remove all uploaded/custom keywords and unblock any hidden Semrush keywords"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All
              </button>
            )}

            {/* Clear All — inline confirm */}
            {showClearConfirm && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
                {clearLoading ? (
                  <>
                    <svg className="animate-spin shrink-0" style={{ width: 12, height: 12, color: '#f87171' }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path style={{ opacity: 0.85 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    <span className="text-[11px] font-medium" style={{ color: '#f87171' }}>{clearStep}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px]" style={{ color: '#f87171' }}>
                      Clear all keywords (uploads + Semrush analysis)?
                    </span>
                    <button
                      onClick={handleClearAll}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                    >
                      Yes, clear
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{ color: '#6060A0' }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}

            {/* v7.101: competitor CSV upload moved to the Competitors button in the top bar */}

            {/* Result toast */}
            {csvStatus && !csvProgress && (
              <span className="text-[11px] px-2.5 py-1 rounded-md border" style={{
                background:  csvStatus.type === 'success' ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                color:       csvStatus.type === 'success' ? '#34d399' : '#f87171',
                borderColor: csvStatus.type === 'success' ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)',
              }}>
                {csvStatus.msg}
              </span>
            )}

          {/* Add keyword */}
          <button
            onClick={() => { setShowAdd(v => !v); setAddError(''); }}
            className="text-xs border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            style={{
              color: showAdd ? '#8B85FF' : '#7070A0',
              borderColor: showAdd ? 'rgba(108,99,255,0.5)' : '',
              background:  showAdd ? 'rgba(108,99,255,0.08)' : '',
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Keyword
          </button>

          {/* Download CSV */}
          <button
            onClick={() => downloadCSV(visibleRows, clientName, FILTER_META[filter].slug)}
            title={`Download ${FILTER_META[filter].label} keywords as CSV`}
            className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {filter === 'all' ? 'CSV' : <>{FILTER_META[filter].label}<span className="opacity-50 ml-0.5">CSV</span></>}
          </button>

          {/* Download Excel */}
          <button
            onClick={() => downloadXLSX(visibleRows, clientName, FILTER_META[filter].slug)}
            title={`Download ${FILTER_META[filter].label} keywords as Excel`}
            className="text-xs text-green-400 hover:text-green-300 border border-green-500/30 hover:border-green-500/60 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {filter === 'all' ? 'Excel' : <>{FILTER_META[filter].label}<span className="opacity-50 ml-0.5">Excel</span></>}
          </button>
        </div>
      </div>

      {/* ── Summary filter cards ── */}
      {(() => {
        const KW_CARDS: Array<{
          id:       KwFilter;
          label:    string;
          count:    number;
          vol:      number;
          accent:   string;
          activeBg: string;
          activeBdr:string;
          dimBg:    string;
          dimBdr:   string;
          icon:     string;
          subtitle: string;
        }> = [
          {
            id: 'all', label: 'All Keywords', count: kwSummary.allCount, vol: kwSummary.allVol,
            accent: '#9B96FF', activeBg: 'rgba(108,99,255,0.10)', activeBdr: 'rgba(108,99,255,0.45)',
            dimBg: 'rgba(108,99,255,0.04)', dimBdr: 'rgba(108,99,255,0.15)',
            icon: 'ti-list', subtitle: 'Total keyword footprint',
          },
          {
            id: 'branded', label: 'Branded', count: kwSummary.brandedCount, vol: kwSummary.brandedVol,
            accent: '#C882FF', activeBg: 'rgba(200,130,255,0.10)', activeBdr: 'rgba(200,130,255,0.45)',
            dimBg: 'rgba(200,130,255,0.04)', dimBdr: 'rgba(200,130,255,0.15)',
            icon: 'ti-tag', subtitle: 'Client or competitor brand',
          },
          {
            id: 'nonBranded', label: 'Non-branded', count: kwSummary.nonBrandCount, vol: kwSummary.nonBrandVol,
            accent: '#38BDF8', activeBg: 'rgba(56,189,248,0.10)', activeBdr: 'rgba(56,189,248,0.45)',
            dimBg: 'rgba(56,189,248,0.04)', dimBdr: 'rgba(56,189,248,0.15)',
            icon: 'ti-search', subtitle: 'Generic / category terms',
          },
          {
            id: 'competitorGap', label: 'Competitor Gap', count: kwSummary.gapCount, vol: kwSummary.gapVol,
            accent: '#F59E0B', activeBg: 'rgba(245,158,11,0.10)', activeBdr: 'rgba(245,158,11,0.45)',
            dimBg: 'rgba(245,158,11,0.04)', dimBdr: 'rgba(245,158,11,0.15)',
            icon: 'ti-arrows-diff', subtitle: 'Competitor ranks, client doesn\'t',
          },
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '10px 14px', borderBottom: '1px solid #111120', background: '#0A0A14', flexShrink: 0 }}>
            {KW_CARDS.map(card => {
              const active = filter === card.id;
              return (
                <button
                  key={card.id}
                  onClick={() => setFilter(card.id)}
                  style={{
                    background:   active ? card.activeBg : card.dimBg,
                    border:       `1px solid ${active ? card.activeBdr : card.dimBdr}`,
                    borderRadius: 8,
                    padding:      '10px 12px',
                    cursor:       'pointer',
                    textAlign:    'left',
                    transition:   'all 0.15s',
                    outline:      'none',
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = card.activeBdr;
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = card.dimBdr;
                  }}
                >
                  {/* Icon + label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <i className={`ti ${card.icon}`} style={{ fontSize: 13, color: card.accent }} aria-hidden="true" />
                    <span style={{ fontSize: 11, fontWeight: 600, color: card.accent, letterSpacing: '.04em' }}>
                      {card.label}
                    </span>
                    {active && (
                      <span style={{ marginLeft: 'auto', fontSize: 8, fontWeight: 700, background: card.activeBg, border: `1px solid ${card.activeBdr}`, color: card.accent, borderRadius: 20, padding: '2px 7px' }}>
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Count */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
                    <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, letterSpacing: '-1px', color: active ? card.accent : '#E8E8FF' }}>
                      {dbLoaded ? card.count.toLocaleString() : '—'}
                    </span>
                    <span style={{ fontSize: 12, color: '#9090B8' }}>keywords</span>
                  </div>

                  {/* Annual volume */}
                  <div style={{ fontSize: 14, fontWeight: 600, color: card.accent, marginBottom: 3 }}>
                    {dbLoaded ? fmtVol(card.vol) : '—'}
                    <span style={{ fontSize: 11, color: '#8080A8', fontWeight: 400, marginLeft: 4 }}>annual vol</span>
                  </div>

                  {/* Subtitle */}
                  <div style={{ fontSize: 11, color: '#7070A0', marginTop: 2 }}>
                    {card.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* ── Add keyword form ── */}

      {showAdd && (
        <div className="px-5 py-3 border-b border-orbit-border shrink-0" style={{ background: '#0B0B16' }}>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newKw}
              onChange={e => setNewKw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Keyword text…"
              className="flex-1 bg-orbit-surface border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs focus:outline-none focus:border-orbit-accent transition-colors"
            />
            <input
              type="number"
              value={newVol}
              onChange={e => setNewVol(e.target.value)}
              placeholder="Monthly vol."
              className="w-28 bg-orbit-surface border border-orbit-border rounded-lg px-3 py-2 text-orbit-primary text-xs focus:outline-none focus:border-orbit-accent transition-colors"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as 'ranked' | 'gap')}
              className="bg-orbit-surface border border-orbit-border rounded-lg px-3 py-2 text-orbit-secondary text-xs focus:outline-none focus:border-orbit-accent transition-colors"
            >
              <option value="gap">Gap</option>
              <option value="ranked">Ranked</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={addLoading}
              className="bg-orbit-accent hover:bg-orbit-accent-light text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {addLoading ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setAddError(''); setNewKw(''); setNewVol(''); }}
              className="text-orbit-tertiary hover:text-orbit-secondary border border-orbit-border px-3 py-2 rounded-lg text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
          {addError && (
            <p className="text-red-400 text-[11px] mt-1.5">{addError}</p>
          )}
          <p className="text-orbit-tertiary text-[10px] mt-1.5">
            Branded flag auto-detected from client + competitor domains. CSV format: <span className="font-mono text-orbit-muted">keyword, search_volume, type</span>
          </p>
        </div>
      )}

      {/* ── Upload progress bar ── */}
      {clearLoading && (
        <div className="animate-pulse" style={{ height: 3, background: 'rgba(239,68,68,0.45)', flexShrink: 0 }} />
      )}

      {csvProgress && (
        <div style={{ background: '#0D0D18', borderBottom: '1px solid #1A1A30', padding: '10px 20px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg style={{ width: 13, height: 13, animation: 'spin 1s linear infinite', flexShrink: 0, color: '#6C63FF' }} fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#8888C8', letterSpacing: '0.01em' }}>
                Uploading keywords
              </span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6060A0', fontVariantNumeric: 'tabular-nums' }}>
              {csvProgress.current} <span style={{ opacity: 0.45, fontWeight: 400 }}>/ {csvProgress.total}</span>
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: '#14142A', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, #5A52E8, #8B85FF)',
              width: csvProgress.total > 0 ? `${Math.round((csvProgress.current / csvProgress.total) * 100)}%` : '0%',
              transition: 'width 0.25s ease',
              boxShadow: '0 0 10px rgba(108,99,255,0.7)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: 10, color: '#4040608' }} />
            <span style={{ fontSize: 10, color: '#4A4A70' }}>
              {csvProgress.total > 0 ? Math.round((csvProgress.current / csvProgress.total) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* ── Rank-bucket filter pills (v7.80) ── */}
      {/* Segments live on the summary cards above; these pills filter by rank
          bucket WITHIN the active segment — both the category breakdown and
          the keyword table below respond. */}
      <div className="flex items-center gap-2 px-5 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: '#111120', background: '#0A0A14' }}>
        <span className="text-[9px] font-semibold uppercase tracking-widest mr-1" style={{ color: '#252545' }}>Rank filter</span>
        {([{ id: 'all' as RankFilter, label: 'All ranks', color: '#8B85FF' },
           ...RANK_BUCKETS.slice(0, 4).map(b => ({ id: b.id as RankFilter, label: `Ranks ${b.label}`, color: b.color }))
        ]).map(p => {
          const active = rankFilter === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setRankFilter(p.id)}
              className="text-[10px] px-3 py-1 rounded-full border transition-all flex items-center gap-1.5"
              style={{
                background:   active ? 'rgba(108,99,255,0.12)' : 'transparent',
                borderColor:  active ? p.color                  : '#3A3A5C',
                color:        active ? p.color                  : '#8888B0',
              }}
            >
              {p.id !== 'all' && (
                <span style={{ width: 7, height: 7, borderRadius: 2, background: p.color, display: 'inline-block' }} />
              )}
              {p.label}
            </button>
          );
        })}
        {rankFilter !== 'all' && (
          <span className="ml-auto text-[9px]" style={{ color: '#4A4A70' }}>
            showing only {RANK_BUCKETS[{ p13: 0, p410: 1, p2: 2, p3p: 3 }[rankFilter]].label} within {FILTER_META[filter].label}
          </span>
        )}
        {rankFilter === 'all' && filter === 'competitorGap' && (
          <span className="ml-auto text-[9px]" style={{ color: '#252545' }}>
            from competitor · client not ranking
          </span>
        )}
      </div>

      {/* ── SERP feature coverage strip (v7.81) ── */}
      <div className="flex items-center gap-3 px-5 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: '#111120', background: '#0A0A14' }}>
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#252545' }}>SERP features</span>
        <span className="text-[10px]" style={{ color: '#7070A0', fontVariantNumeric: 'tabular-nums' }}>
          {serpCoverage.scanned.toLocaleString()} of {serpCoverage.total.toLocaleString()} keywords scanned
        </span>
        {/* coverage mini-bar */}
        <div style={{ width: 90, height: 4, borderRadius: 2, background: '#14142A', overflow: 'hidden' }}>
          <div style={{
            width: serpCoverage.total > 0 ? `${(serpCoverage.scanned / serpCoverage.total) * 100}%` : '0%',
            height: '100%', background: '#6C63FF', borderRadius: 2, transition: 'width 0.4s ease',
          }} />
        </div>
        {serpCoverage.remaining > 0 ? (
          <button
            onClick={handleSerpScan}
            disabled={scanLoading}
            className="text-[10px] px-3 py-1 rounded-full border transition-all flex items-center gap-1.5"
            style={{
              borderColor: scanLoading ? '#3A3A5C' : 'rgba(108,99,255,0.5)',
              color:       scanLoading ? '#55557A' : '#9B96FF',
              background:  scanLoading ? 'transparent' : 'rgba(108,99,255,0.08)',
              cursor:      scanLoading ? 'default' : 'pointer',
            }}
            title={`Scans the ${Math.min(75, serpCoverage.remaining)} highest-volume unscanned keywords. Each keyword uses 1 SerpAPI search credit. Already-scanned keywords are never re-scanned.`}
          >
            {scanLoading ? (
              <>
                <svg className="animate-spin" style={{ width: 10, height: 10 }} fill="none" viewBox="0 0 24 24">
                  <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path style={{ opacity: 0.85 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Scanning… (~2–3 min)
              </>
            ) : (
              <>Scan next {Math.min(75, serpCoverage.remaining)} keywords · ~{Math.min(75, serpCoverage.remaining)} credits</>
            )}
          </button>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.08)', color: '#34D399' }}>
            ✓ full coverage
          </span>
        )}
        {scanError && (
          <span className="text-[10px]" style={{ color: '#f87171' }}>{scanError}</span>
        )}
        <span className="ml-auto text-[9px]" style={{ color: '#252545' }}>
          feeds AIO / PAA / Video pills + SERP Features panel
        </span>
      </div>

      {/* ── Scrollable area: category breakdown + keyword table ── */}
      <div className="overflow-auto flex-1 min-h-0">

        {/* Category breakdown — inside scroll so it doesn't eat fixed height above the table */}
        {cb && cb.categories && cb.categories.length > 0 && dbLoaded && (
          <KwCategorySection
            cb={cb}
            rows={segmentRows}
            rankFilter={rankFilter}
            segmentLabel={FILTER_META[filter].label}
            expectedCount={segmentRows.length}
          />
        )}

        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-orbit-border" style={{ background: '#0D0D18' }}>
            <tr>
              <SortHeader label="Keyword"           col="keyword"    activeCol={sortCol} dir={sortDir} align="left"  width="30%" onClick={handleSort} />
              <SortHeader label="Competitor"        col="competitor" activeCol={sortCol} dir={sortDir} align="left"             onClick={handleSort} />
              <SortHeader label="Monthly Search Vol" col="volume"    activeCol={sortCol} dir={sortDir} align="right"            onClick={handleSort} />
              <SortHeader label="Rank"              col="rank"       activeCol={sortCol} dir={sortDir} align="right"            onClick={handleSort} />
              <th className="text-center text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest px-3 py-2.5">AI Overview</th>
              <th className="text-center text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest px-3 py-2.5">PAA</th>
              <th className="text-center text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest px-3 py-2.5">Video</th>
              <th className="w-8 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => (
              <tr
                key={row.key}
                className="border-b border-orbit-border/40 hover:bg-orbit-surface/40 transition-colors group"
                style={{ opacity: row.type === 'gap' && row.source === 'semrush' ? 0.85 : 1 }}
              >
                {/* Keyword + badges */}
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-orbit-primary text-xs">{row.keyword}</span>
                    {row.type === 'gap' && (
                      <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full shrink-0">gap</span>
                    )}
                    {row.branded && (
                      <span className="text-[9px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full shrink-0">branded</span>
                    )}
                    {!row.branded && (
                      <span className="text-[9px] bg-sky-500/10 border border-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full shrink-0">non-branded</span>
                    )}
                    <SourceBadge source={row.source} />
                  </div>
                </td>

                {/* Competitor */}
                <td className="px-3 py-2 text-left">
                  {row.competitor
                    ? <span className="text-[10px] text-orbit-secondary font-mono">{extractBrand(row.competitor)}</span>
                    : <span className="text-orbit-tertiary text-xs">—</span>
                  }
                </td>

                {/* Monthly Volume */}
                <td className="px-3 py-2 text-right">
                  <span className="text-orbit-secondary text-xs">{row.searchVolume.toLocaleString()}</span>
                </td>

                {/* Rank */}
                <td className="px-3 py-2 text-right">
                  {row.position !== null
                    ? <span className={`text-xs font-medium ${row.position <= 10 ? 'text-green-400' : row.position <= 20 ? 'text-amber-400' : 'text-orbit-tertiary'}`}>#{row.position}</span>
                    : <span className="text-orbit-tertiary text-xs">—</span>
                  }
                </td>

                {/* SERP features */}
                <td className="px-3 py-2 text-center"><Pill active={row.hasAIO}   cited={row.clientInAIO}   label="AIO" /></td>
                <td className="px-3 py-2 text-center"><Pill active={row.hasPAA}   cited={row.clientInPAA}   label="PAA" /></td>
                <td className="px-3 py-2 text-center"><Pill active={row.hasVideo} cited={row.clientInVideo} label="Video" /></td>

                {/* Delete */}
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => handleDelete(row)}
                    disabled={deletingKey === row.key}
                    title="Remove keyword"
                    className="opacity-60 hover:opacity-100 transition-opacity text-orbit-secondary hover:text-red-400 disabled:opacity-20"
                  >
                    {deletingKey === row.key
                      ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    }
                  </button>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-orbit-tertiary text-sm">
                  {allRows.length === 0
                    ? 'No keyword data — run an analysis first.'
                    : 'No keywords match this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer legend ── */}
      <div className="px-5 py-2.5 border-t border-orbit-border shrink-0 flex items-center gap-3 flex-wrap" style={{ background: '#0D0D18' }}>
        <span className="text-[10px] text-orbit-tertiary">Semrush ranked + gap · SERP features from SerpAPI · custom rows via Add or CSV upload</span>
        <span className="text-[10px] bg-green-500/10 border border-green-500/30 text-green-400 px-1.5 py-0.5 rounded-full">✓ AIO = client cited</span>
        <span className="text-[10px] bg-orbit-muted border border-orbit-border text-orbit-tertiary px-1.5 py-0.5 rounded-full">AIO = feature exists, not cited</span>
        <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">gap = client not ranking</span>
        <span className="text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">branded = client or competitor name</span>
      </div>
    </div>
  );
}

// ─── Keyword Landscape category section (v7.80) ──────────────────────────────
//
// All aggregation is computed client-side from the canonical segment rows
// (same pool as the summary cards), keyed through cb.keywordCategories.
// Keywords without a stored category fall into "Other" so counts ALWAYS
// balance with the active summary card. Bars are stacked by rank bucket.

function fmtKwAnn(monthly: number): string {
  const a = monthly * 12;
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  return a.toLocaleString();
}

const RANK_SEL_INDEX: Record<Exclude<RankFilter, 'all'>, number> = { p13: 0, p410: 1, p2: 2, p3p: 3 };

interface KwCatAgg {
  name:   string;
  type:   'procedure' | 'brand' | 'location';
  kw:     number[];   // keyword counts per bucket [1–3, 4–10, P2, P3+, unranked]
  vol:    number[];   // monthly volume per bucket
  posSum: number[];   // sum of positions per bucket (ranked buckets only)
  totKw:  number;
  totVol: number;
}

function KwCategorySection({
  cb,
  rows,
  rankFilter,
  segmentLabel,
  expectedCount,
}: {
  cb:            KwCategoryBreakdown;
  rows:          KeywordRow[];
  rankFilter:    RankFilter;
  segmentLabel:  string;
  expectedCount: number;
}) {
  // ── Aggregate segment rows into categories ──
  const typeByName: Record<string, 'procedure' | 'brand' | 'location'> = {};
  for (const c of cb.categories) typeByName[c.name] = c.type;

  const aggMap = new Map<string, KwCatAgg>();
  for (const row of rows) {
    const catName = cb.keywordCategories?.[row.keyword.toLowerCase().trim()] ?? 'Other';
    let agg = aggMap.get(catName);
    if (!agg) {
      agg = { name: catName, type: typeByName[catName] ?? 'procedure', kw: [0,0,0,0,0], vol: [0,0,0,0,0], posSum: [0,0,0,0,0], totKw: 0, totVol: 0 };
      aggMap.set(catName, agg);
    }
    const b = bucketIndexOf(row.position);
    agg.kw[b]++;
    agg.vol[b]  += row.searchVolume;
    if (row.position !== null && b < 4) agg.posSum[b] += row.position;
    agg.totKw++;
    agg.totVol  += row.searchVolume;
  }
  if (aggMap.size === 0) return null;

  const cats = Array.from(aggMap.values());
  const procedureCats = cats.filter(c => c.name !== 'Other' && c.type === 'procedure').sort((a, b) => b.totVol - a.totVol);
  const navCats       = cats.filter(c => c.name !== 'Other' && (c.type === 'brand' || c.type === 'location')).sort((a, b) => b.totVol - a.totVol);
  const otherCats     = cats.filter(c => c.name === 'Other');

  const maxVol = Math.max(...cats.map(c => c.totVol), 1);
  const selIdx = rankFilter === 'all' ? null : RANK_SEL_INDEX[rankFilter];

  // ── Overall rollup (respects rank filter) ──
  let tKw = 0, tVol = 0, tP1 = 0;
  for (const c of cats) {
    tKw  += selIdx === null ? c.totKw  : c.kw[selIdx];
    tVol += selIdx === null ? c.totVol : c.vol[selIdx];
    tP1  += selIdx === null ? c.vol[0] + c.vol[1] : (selIdx <= 1 ? c.vol[selIdx] : 0);
  }
  const overallShare = tVol > 0 ? (tP1 / tVol) * 100 : 0;
  const balanced     = selIdx === null && tKw === expectedCount;

  const renderRows = (list: KwCatAgg[], dimmed: boolean) =>
    list.map(cat => <KwCatRow key={cat.name} cat={cat} selIdx={selIdx} maxVol={maxVol} dimmed={dimmed} />);

  return (
    <div style={{ borderBottom: '1px solid #111120', background: '#07070F' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#9090C0', letterSpacing: '.04em' }}>Category Breakdown</span>
          <span style={{ fontSize: '9px', padding: '1px 7px', borderRadius: 20, background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)', color: '#8080C0' }}>
            {overallShare.toFixed(1)}% page 1 capture · {segmentLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {RANK_BUCKETS.map(b => (
            <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '9px', color: b.id === 'unr' ? '#55557A' : b.color }}>
              <span style={{ width: 6, height: 6, borderRadius: 1, background: b.color, display: 'inline-block' }} />
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 105px 80px 52px 60px 100px', padding: '4px 20px 4px', borderBottom: '1px solid #0E0E1E' }}>
        {[
          { label: 'Category',       align: 'left'   },
          { label: 'Annual Demand',  align: 'right'  },
          { label: 'Page 1',         align: 'right'  },
          { label: 'Share',          align: 'right'  },
          { label: 'Avg Pos',        align: 'right'  },
          { label: 'Keywords',       align: 'center' },
        ].map(h => (
          <span key={h.label} style={{ fontSize: '9px', fontWeight: 500, color: '#404060', textTransform: 'uppercase' as const, letterSpacing: '.06em', textAlign: h.align as any }}>
            {h.label}
          </span>
        ))}
      </div>

      {/* Procedure rows */}
      {procedureCats.length > 0 && (
        <div style={{ padding: '4px 20px 2px' }}>
          <span style={{ fontSize: '8px', fontWeight: 600, color: '#383858', letterSpacing: '.08em', textTransform: 'uppercase' as const }}>Procedure Lines</span>
        </div>
      )}
      {renderRows(procedureCats, false)}

      {/* Brand & navigation rows */}
      {navCats.length > 0 && (
        <div style={{ padding: '6px 20px 2px', borderTop: '1px solid #0E0E1E', marginTop: 2 }}>
          <span style={{ fontSize: '8px', fontWeight: 600, color: '#383858', letterSpacing: '.08em', textTransform: 'uppercase' as const }}>Brand &amp; Navigation</span>
        </div>
      )}
      {renderRows(navCats, true)}

      {/* Other / uncategorized — always last */}
      {renderRows(otherCats, true)}

      {/* Overall rollup */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 105px 80px 52px 60px 100px', alignItems: 'center', padding: '6px 20px 8px', borderTop: '1px solid #111120' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#A0A0C8' }}>
          Overall{selIdx !== null && <span style={{ fontWeight: 400, color: '#55557A' }}> · {RANK_BUCKETS[selIdx].label} only</span>}
        </span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#A0A0C8', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tVol > 0 ? fmtKwAnn(tVol) : '—'}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#8B85FF', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tP1 > 0 ? fmtKwAnn(tP1) : '—'}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#6C63FF', textAlign: 'right' }}>{tVol > 0 ? `${overallShare.toFixed(1)}%` : '—'}</span>
        <span />
        <span style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: balanced ? '#34D399' : '#8080C0', fontVariantNumeric: 'tabular-nums' }}>
            {tKw.toLocaleString()}{balanced ? ' ✓' : ''}
          </span>
        </span>
      </div>
    </div>
  );
}

function KwCatRow({
  cat,
  selIdx,
  maxVol,
  dimmed,
}: {
  cat:    KwCatAgg;
  selIdx: number | null;   // null = all ranks; 0–3 = selected bucket
  maxVol: number;
  dimmed: boolean;
}) {
  const p1Vol   = cat.vol[0] + cat.vol[1];
  const dispKw  = selIdx === null ? cat.totKw  : cat.kw[selIdx];
  const dispVol = selIdx === null ? cat.totVol : cat.vol[selIdx];
  const p1Disp  = selIdx === null ? p1Vol : (selIdx <= 1 ? cat.vol[selIdx] : 0);
  const share   = cat.totVol > 0 && dispVol > 0 ? ((selIdx === null ? p1Vol : dispVol) / cat.totVol) * 100 : 0;

  // Average position — weighted across ranked buckets (or selected bucket only)
  let posSum = 0, posKw = 0;
  if (selIdx === null) {
    for (let i = 0; i < 4; i++) { posSum += cat.posSum[i]; posKw += cat.kw[i]; }
  } else {
    posSum = cat.posSum[selIdx]; posKw = cat.kw[selIdx];
  }
  const avgPos = posKw > 0 ? posSum / posKw : null;

  // Stacked bar: length = category demand vs largest category; segments = rank mix
  const barW = Math.max((cat.totVol / maxVol) * 100, 2);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 105px 80px 52px 60px 100px',
        alignItems: 'center',
        padding: '5px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      {/* Category name + stacked rank-bucket bar */}
      <div style={{ minWidth: 0, paddingRight: 10 }}>
        <span style={{ fontSize: '12px', color: dimmed ? '#9090B8' : '#D0D0F0', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
        <div style={{ marginTop: '4px', height: '5px', width: `${barW}%`, background: '#111120', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
          {cat.vol.map((v, i) => {
            if (cat.totVol === 0 || v === 0) return null;
            const dim = selIdx !== null && i !== selIdx;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  height: '100%',
                  width: `${(v / cat.totVol) * 100}%`,
                  background: RANK_BUCKETS[i].color,
                  opacity: dim ? 0.15 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              />
            );
          })}
        </div>
      </div>
      {/* Annual demand (bucket-aware) */}
      <span style={{ fontSize: '11px', color: '#7070A0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {dispVol > 0 ? fmtKwAnn(dispVol) : '—'}
      </span>
      {/* Page 1 (bucket-aware) */}
      <span style={{ fontSize: '11px', fontWeight: p1Disp > 0 ? 600 : 400, color: p1Disp > 0 ? (dimmed ? '#505070' : '#8B85FF') : '#333350', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {p1Disp > 0 ? fmtKwAnn(p1Disp) : '—'}
      </span>
      {/* Share of category demand */}
      <span style={{ fontSize: '12px', fontWeight: 600, color: share > 0 ? (dimmed ? '#505070' : '#E0E0FF') : '#333350', textAlign: 'right' }}>
        {share > 0 ? `${share.toFixed(1)}%` : '—'}
      </span>
      {/* Avg position */}
      <span style={{ fontSize: '11px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: avgPos === null ? '#333350' : avgPos <= 3 ? '#6C63FF' : avgPos <= 10 ? '#06B6D4' : avgPos <= 20 ? '#F59E0B' : '#EF4444' }}>
        {avgPos !== null ? avgPos.toFixed(1) : '—'}
      </span>
      {/* Keyword count (bucket-aware) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {dispKw > 0 ? (
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#8080C0', background: '#0F0F1E', border: '1px solid #1E1E30', borderRadius: 4, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>
            {dispKw.toLocaleString()}
          </span>
        ) : (
          <span style={{ fontSize: '10px', color: '#282838' }}>—</span>
        )}
      </div>
    </div>
  );
}
