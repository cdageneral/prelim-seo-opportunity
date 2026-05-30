'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type KwSource = 'semrush' | 'custom' | 'csv';
type KwFilter = 'all' | 'branded' | 'nonBranded' | 'competitorGap';

interface KeywordRow {
  key:          string;          // unique key for React
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  type:         'ranked' | 'gap';
  branded:      boolean;
  source:       KwSource;
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
}

// ─── Branded detection ────────────────────────────────────────────────────────
// Strips protocol, www, and TLD — returns lowercase alphanum brand root.
//   "sonobello.com" → "sonobello"
//
// isBranded uses three layers to catch the client's brand (and competitors) in any keyword:
//   1. Exact substring — normalized keyword contains brand token (or vice-versa)
//   2. Sub-token split — compound brand (e.g. "sonobello") → halves ("sono", "bello");
//      keyword containing either half is branded
//   3. Fuzzy per-word — each word in the keyword vs each token, Levenshtein distance ≤
//      max(1, floor(minLen/4)); catches misspellings & phonetic variants:
//        "solobello" (ed=1 vs "sonobello") → branded
//        "sonobella" (ed=1 vs "sonobello") → branded
//        "sona"      (ed=1 vs "sono")      → branded
//        "bella"     (ed=1 vs "bello")     → branded
//        "sonabella" (ed=2 vs "sonobello") → branded

// Compact 2-row Levenshtein (O(m×n) time, O(n) space)
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function extractBrand(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\.(com|net|org|io|co|ca|us|uk|au|gov|edu|biz|info)(\.[a-z]{2})?$/i, '')
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isBranded(keyword: string, clientDomain: string, competitorDomains: string[]): boolean {
  if (!keyword) return false;
  const kw     = keyword.toLowerCase().trim();
  const kwNorm = kw.replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;

  // Base brand tokens from client + competitor domains (min 4 chars)
  const baseBrands = [clientDomain, ...competitorDomains]
    .map(extractBrand)
    .filter(b => b.length >= 4);
  if (baseBrands.length === 0) return false;

  // Expand: for compound brand names, add first-half and last-half as independent tokens
  // e.g. "sonobello" (9) → "sono" (4) + "bello" (5)
  // This lets us catch keywords that contain just one component of the brand name.
  const tokenSet = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
    const half = Math.floor(brand.length / 2);
    if (half >= 4)                  tokenSet.add(brand.slice(0, half));
    if (brand.length - half >= 4)   tokenSet.add(brand.slice(half));
  }
  // Convert to array — Set iteration requires ES2015+ target which this project doesn't use
  const allTokens: string[] = Array.from(tokenSet);

  // ── Pass 1: exact substring checks ──────────────────────────────────────────
  for (const token of allTokens) {
    if (kwNorm.includes(token))                               return true;  // "sonobelloatlanta" ⊇ "sonobello"
    if (token.includes(kwNorm) && kwNorm.length >= 4)        return true;  // keyword IS the brand
    if (token.length >= 5 && kwNorm.length >= 4 &&
        token.startsWith(kwNorm))                            return true;  // "sonobell" → "sonobello" truncated
  }

  // ── Pass 2: fuzzy per-word matching ─────────────────────────────────────────
  // Split keyword into individual words; fuzzy-match each against every brand token.
  // Threshold = max(1, floor(minLen / 4)) — allows 1 edit for short words, 2 for 8–11 chars.
  const kwWords = kw
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 4);

  for (const word of kwWords) {
    for (const token of allTokens) {
      const minLen    = Math.min(word.length, token.length);
      const threshold = Math.max(1, Math.floor(minLen / 4));
      // Quick length guard: if lengths differ by more than threshold+1, skip
      if (Math.abs(word.length - token.length) > threshold + 1) continue;
      if (editDistance(word, token) <= threshold) return true;
    }
  }

  return false;
}

// ─── Merge semrush + DB rows ──────────────────────────────────────────────────

function buildRows(
  analysis: any,
  dbKeywords: DbKeyword[],
  clientDomain: string,
  competitorDomains: string[],
): KeywordRow[] {
  const semSnap  = analysis?.semrushSnapshot ?? {};
  const serpSnap = analysis?.serpApiSnapshot ?? {};

  // Build SERP lookup keyed by lowercase keyword text
  const serpMap: Record<string, any> = {};
  for (const k of (serpSnap.keywords ?? [])) {
    serpMap[k.keyword?.toLowerCase()] = k;
  }

  const blocked = new Set(
    dbKeywords.filter(r => r.source === 'blocked').map(r => r.keyword.toLowerCase()),
  );

  const rows: KeywordRow[] = [];

  // ── Semrush ranked keywords (excluding blocked) ──
  for (const k of (semSnap.topKeywords ?? [])) {
    const kwLower = (k.keyword ?? '').toLowerCase();
    if (blocked.has(kwLower)) continue;
    const serp = serpMap[kwLower];
    rows.push({
      key:          `sem-ranked-${kwLower}`,
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     k.position ?? null,
      type:         'ranked',
      branded:      isBranded(k.keyword, clientDomain, competitorDomains),
      source:       'semrush',
      hasAIO:       serp?.hasAIO ?? false,
      clientInAIO:  serp
        ? (serp.aioSources ?? []).some(
            (s: any) => clientDomain && s.domain?.includes(extractBrand(clientDomain)),
          )
        : false,
      hasPAA:       (serp?.paaQuestions ?? []).length > 0,
      clientInPAA:  serp?.paaClientCited ?? false,
      hasVideo:     (serp?.serpFeatures ?? []).includes('videos'),
      clientInVideo: serp?.videoClientCited ?? false,
    });
  }

  // ── Semrush gap keywords (excluding blocked, deduped) ──
  const existing = new Set(rows.map(r => r.keyword.toLowerCase()));
  for (const k of (semSnap.gapKeywords ?? [])) {
    const kwLower = (k.keyword ?? '').toLowerCase();
    if (blocked.has(kwLower) || existing.has(kwLower)) continue;
    const serp = serpMap[kwLower];
    rows.push({
      key:          `sem-gap-${kwLower}`,
      keyword:      k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position:     null,
      type:         'gap',
      branded:      isBranded(k.keyword, clientDomain, competitorDomains),
      source:       'semrush',
      hasAIO:       serp?.hasAIO ?? false,
      clientInAIO:  false,
      hasPAA:       (serp?.paaQuestions ?? []).length > 0,
      clientInPAA:  false,
      hasVideo:     (serp?.serpFeatures ?? []).includes('videos'),
      clientInVideo: false,
    });
  }

  // ── Custom / CSV keywords ──
  for (const dbKw of dbKeywords) {
    if (dbKw.source === 'blocked') continue;
    const kwLower = dbKw.keyword.toLowerCase();
    if (existing.has(kwLower)) continue; // shouldn't happen if duplicate-check is working
    existing.add(kwLower);
    rows.push({
      key:           `${dbKw.source}-${dbKw.id}`,
      keyword:       dbKw.keyword,
      searchVolume:  dbKw.searchVolume,
      position:      dbKw.position,
      type:          dbKw.type === 'ranked' ? 'ranked' : 'gap',
      branded:       dbKw.branded,
      source:        dbKw.source as KwSource,
      hasAIO:        false,
      clientInAIO:   false,
      hasPAA:        false,
      clientInPAA:   false,
      hasVideo:      false,
      clientInVideo: false,
    });
  }

  // Sort: ranked first (by position asc), then gap (by volume desc)
  return rows.sort((a, b) => {
    if (a.type === 'ranked' && b.type === 'gap') return -1;
    if (a.type === 'gap' && b.type === 'ranked') return 1;
    if (a.position !== null && b.position !== null) return a.position - b.position;
    return b.searchVolume - a.searchVolume;
  });
}

// ─── Filter ───────────────────────────────────────────────────────────────────

function applyFilter(rows: KeywordRow[], filter: KwFilter): KeywordRow[] {
  switch (filter) {
    case 'branded':       return rows.filter(r => r.branded);
    case 'nonBranded':    return rows.filter(r => !r.branded);
    case 'competitorGap': return rows.filter(r => !r.branded && r.type === 'gap');
    default:              return rows;
  }
}

// ─── Downloads ────────────────────────────────────────────────────────────────

// Maps filter id → human label and filename slug
const FILTER_META: Record<KwFilter, { label: string; slug: string }> = {
  all:           { label: 'All',           slug: 'all'            },
  branded:       { label: 'Branded',       slug: 'branded'        },
  nonBranded:    { label: 'Non-branded',   slug: 'non-branded'    },
  competitorGap: { label: 'Competitor Gap', slug: 'competitor-gap' },
};

function downloadCSV(rows: KeywordRow[], clientName: string, filterSlug: string) {
  const headers = ['Keyword','Search Volume','Client Rank','Type','Branded','Source','AI Overview','Client in AIO','PAA','Client in PAA','Video','Client in Video'];
  const lines   = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.keyword}"`,
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
    'Search Volume':    r.searchVolume,
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

// ─── Filter pills ─────────────────────────────────────────────────────────────

const FILTERS: { id: KwFilter; label: string }[] = [
  { id: 'all',           label: 'All' },
  { id: 'branded',       label: 'Branded' },
  { id: 'nonBranded',    label: 'Non-branded' },
  { id: 'competitorGap', label: 'Competitor Gap' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function KeywordsPanel({ projectId, analysis, competitors }: Props) {
  const clientDomain      = (analysis?.semrushSnapshot?.domain as string) ?? '';
  const competitorDomains = competitors;
  const clientName        = clientDomain || 'keywords';

  const [dbKeywords,  setDbKeywords]  = useState<DbKeyword[]>([]);
  const [filter,      setFilter]      = useState<KwFilter>('all');
  const [showAdd,     setShowAdd]     = useState(false);
  const [newKw,       setNewKw]       = useState('');
  const [newVol,      setNewVol]      = useState('');
  const [newType,     setNewType]     = useState<'ranked' | 'gap'>('gap');
  const [addError,    setAddError]    = useState('');
  const [addLoading,  setAddLoading]  = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  // ── Fetch DB keywords on mount ──
  const fetchDb = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/keywords`);
      const data = await res.json();
      setDbKeywords(data.keywords ?? []);
    } catch { /* silent */ }
  }, [projectId]);

  useEffect(() => { fetchDb(); }, [fetchDb]);

  // ── Build merged rows ──
  const allRows = useMemo(
    () => buildRows(analysis, dbKeywords, clientDomain, competitorDomains),
    [analysis, dbKeywords, clientDomain, competitorDomains],
  );
  const visibleRows = useMemo(() => applyFilter(allRows, filter), [allRows, filter]);

  const ranked = visibleRows.filter(r => r.type === 'ranked').length;
  const gap    = visibleRows.filter(r => r.type === 'gap').length;

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
    const text = await file.text();
    const csvRows = text.split('\n').slice(1);
    let added = 0;
    for (const line of csvRows) {
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const kwText = cols[0];
      if (!kwText) continue;
      const vol     = parseInt(cols[1]) || 0;
      const type    = cols[2] === 'ranked' ? 'ranked' : 'gap';
      const branded = isBranded(kwText, clientDomain, competitorDomains);
      const res = await fetch(`/api/projects/${projectId}/keywords`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ keyword: kwText, searchVolume: vol, type, branded, source: 'csv' }),
      });
      if (res.status === 201) added++;
    }
    if (csvRef.current) csvRef.current.value = '';
    await fetchDb();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-orbit-border shrink-0" style={{ background: '#0D0D18' }}>
        <div>
          <h2 className="text-orbit-primary font-semibold text-sm">Keyword Landscape</h2>
          <p className="text-orbit-tertiary text-[11px] mt-0.5">
            {ranked} ranked &nbsp;·&nbsp; {gap} gap &nbsp;·&nbsp; {visibleRows.length} showing
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* CSV upload */}
          <label
            className="text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border hover:border-orbit-muted px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            title="Upload CSV (columns: keyword, search_volume, type)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload CSV
            <input
              ref={csvRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvUpload}
            />
          </label>

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

      {/* ── Filter pills ── */}
      <div className="flex items-center gap-2 px-5 py-2 border-b shrink-0" style={{ borderColor: '#111120', background: '#0A0A14' }}>
        <span className="text-[9px] font-semibold uppercase tracking-widest mr-1" style={{ color: '#252545' }}>Filter</span>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="text-[10px] px-3 py-1 rounded-full border transition-all"
              style={{
                background:   active ? 'rgba(108,99,255,0.14)' : 'transparent',
                borderColor:  active ? 'rgba(108,99,255,0.6)'  : '#3A3A5C',
                color:        active ? '#9B96FF'                : '#8888B0',
              }}
            >
              {f.label}
            </button>
          );
        })}
        {filter === 'competitorGap' && (
          <span className="ml-auto text-[9px]" style={{ color: '#252545' }}>
            non-branded · client not ranking
          </span>
        )}
      </div>

      {/* ── Table ── */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-orbit-border" style={{ background: '#0D0D18' }}>
            <tr>
              <th className="text-left text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest px-4 py-2.5 w-[37%]">Keyword</th>
              <th className="text-right text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest px-3 py-2.5">Search Vol</th>
              <th className="text-right text-orbit-tertiary text-[9px] font-medium uppercase tracking-widest px-3 py-2.5">Rank</th>
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
                    <SourceBadge source={row.source} />
                  </div>
                </td>

                {/* Volume */}
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
                    className="opacity-30 hover:opacity-100 transition-opacity text-orbit-tertiary hover:text-red-400 disabled:opacity-20"
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
                <td colSpan={7} className="px-4 py-16 text-center text-orbit-tertiary text-sm">
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
