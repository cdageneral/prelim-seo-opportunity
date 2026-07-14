'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { buildKwPool, isBrandedKeyword, extractBrand, hasLocalPackData, serpCellHasLocalPack } from '@/lib/utils/kwVolume';
import { buildScopeResolver } from '@/lib/category/scopeModel';   // v7.326: scope gate (adjacent-vertical staging)
import { keywordProvenance } from '@/lib/utils/keywordProvenance';   // v7.252: read-only count provenance
import { buildCategoryGuard } from '@/lib/category/categoryGuard';   // v7.226: shared competitor-brand category guard (Const III.1a) — same enforcement as ThemeClustersPanel
import { buildCategoryModel, type CategoryModel, type KeywordMeta } from '@/lib/category/categoryModel';   // v7.227: one canonical category model (same source as Cluster/Journey/Content)
import { buildCollapsedPathForest, type PathTreeNode } from '@/lib/category/pathTree';   // v7.337 (QC audit B12): ONE shared path-tree builder (also consumed by lib/local/serviceLines)
import { buildJourneyClassifier } from './JourneySection';   // v7.204: single-source product/pre-product split (same classifier as Journey + Cluster panels)
import InsightBanner from './InsightBanner';   // v7.366: insight-sentence layer
import { bigCategoryInsight } from '@/lib/insights';   // v7.366 (G9)

// ─── Types ────────────────────────────────────────────────────────────────────

type KwSource = 'semrush' | 'custom' | 'csv';
type KwFilter = 'all' | 'branded' | 'nonBranded' | 'localIntent' | 'competitorGap';
type SortCol  = 'keyword' | 'competitor' | 'volume' | 'rank' | null;
type SortDir  = 'asc' | 'desc';

// v7.80: rank-bucket filter — replaces the old segment pills (segments now
// live exclusively on the summary cards). 'all' = no rank filtering.
type RankFilter = 'all' | 'p13' | 'p410' | 'p2' | 'p3p';

// Bucket order is fixed: [1–3, 4–10, Page 2, Page 3+, Unranked/gap]
const RANK_BUCKETS = [
  { id: 'p13'  as const, label: '1–3',            color: 'var(--c-6c63ff)' },
  { id: 'p410' as const, label: '4–10',           color: 'var(--c-06b6d4)' },
  { id: 'p2'   as const, label: 'Page 2',         color: 'var(--c-f59e0b)' },
  { id: 'p3p'  as const, label: 'Page 3+',        color: 'var(--c-ef4444)' },
  { id: 'unr'  as const, label: 'Unranked / gap', color: 'var(--c-2e2e48)' },
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
  origin:       'footprint' | 'demand';   // v7.176: demand = deep-journey "missing demand"
  competitor:   string | null;   // domain that ranks for this keyword (gap rows only)
  // SERP features (only on semrush rows)
  hasAIO:        boolean;
  clientInAIO:   boolean;
  hasPAA:        boolean;
  clientInPAA:   boolean;
  hasVideo:      boolean;
  clientInVideo: boolean;
  // v7.287: keyword's Google SERP shows a Local Pack (map pack) — REAL Semrush `Fl`
  // SERP-feature data, from the uploaded "SERP Features by Keyword" cell, a live SerpAPI
  // scan, or the footprint roll-up. True for client-footprint AND competitor-gap rows.
  isLocalIntent: boolean;
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
  domain?:      string | null;   // competitor domain for uploaded gap rows (v7.31+); present at runtime
  serpFeatures?: string | null;  // v7.103: raw "SERP Features by Keyword" cell from a Semrush CSV upload; present at runtime
}

interface Props {
  projectId:   string;
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  onKeywordsChanged?: () => void;   // v7.108: fired after any successful keyword mutation here (CSV upload, add, delete/block, clear) so the parent can bump kwVersion and refresh ALL panels (SOV, clusters, etc.)
  onCleared?: () => void;   // v7.233: fired after a successful FULL RESET (Clear All) so the parent can refetch the (now empty) project and keep the user on the empty Keyword panel.
  analysis:    any;
  competitors: string[];  // competitor domains for branded detection
  brandTerms?: string[];  // v7.206: client brand vocabulary (variants a domain can't yield)
  domain?:     string;    // project websiteUrl — fallback when semrushSnapshot.domain is absent
  defaultClientThreshold?:     number;  // project-level min vol for client ranked keywords
  defaultCompetitorThreshold?: number;  // project-level min vol for competitor gap keywords
  // v7.132: the SERP scan now runs at the page level (survives navigation). When
  // these are supplied the in-panel button delegates to the global runner and
  // reflects its progress; results merge into the table live.
  serpScanResults?:  any[];
  serpScanRunning?:  boolean;
  serpScanProgress?: { done: number; total: number } | null;
  onStartSerpScan?:  () => void;
  // v7.241: the 4-button workflow bar between the summary cards and the journey
  // toggle. Buttons 3 & 4 build the deep journey from HERE (the Journey panel's own
  // build button is removed). onOpenCompetitors opens the global Competitors modal
  // (button 2); onDeepJourneyBuilt tells the page to refetch the analysis so the new
  // demand topics backfill into every panel (Const II.3).
  onOpenCompetitors?:  () => void;
  onDeepJourneyBuilt?: () => void;
  // v7.326: fired after a scope-gate promote/demote persists, so the page refetches the project
  // (new _scopeOverrides) and every panel re-filters the now-promoted/demoted vertical.
  onScopeChanged?:     () => void;
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
  // v7.339 (Const III.1e): taxonomy merges auto-applied at synthesis — rendered as
  // a visible log so every re-label / re-parent is inspectable. Absent pre-v7.339.
  mergeLog?:          Array<{ from: string; to: string; kind: 'label' | 'reparent' }>;
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
  brandTerms: string[] = [],   // v7.206: client brand vocabulary
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

  // v7.287: footprint-level Local Pack roll-up (Semrush `Fl`), keyed lowercase. Covers the
  // live-API client footprint where the flag lives on the snapshot, not on a per-keyword cell.
  const snapLocalSet = new Set<string>(
    (analysis?.semrushSnapshot?.localPackKeywords ?? []).map((k: any) => String(k).toLowerCase()),
  );

  // Core filtering via shared utility — single source of truth.
  // v7.176: includeDemand unions the deep-journey demand keywords (the topics built
  // in the Journey panel) into the pool as origin:'demand', so the new topic
  // keywords appear here too and the Keyword / Cluster / Content panels reconcile.
  const pool = buildKwPool({
    semrushSnapshot:  analysis?.semrushSnapshot,
    uploadedKeywords: dbKeywords,
    clientDomain,
    competitorDomains,
    clientVolMin,
    competitorVolMin,
    brandTerms,
    includeDemand:    true,
  });

  // Map pool items to KeywordRow, adding SERP enrichment
  const rows: KeywordRow[] = pool.map(item => {
    const kwLow = item.keyword.toLowerCase();
    const serp  = serpMap[kwLow];
    const dbRow = dbKeywords.find(d => d.keyword.toLowerCase() === kwLow && d.source !== 'blocked');

    // v7.234: SERP features from a Semrush CSV upload. The "SERP Features by Keyword"
    // cell is stored on the uploaded row (project_keywords.serp_features) but was never
    // rendered — buildRows only read live SerpAPI data (serpMap), so uploaded features
    // showed as "—". Fall back to the uploaded cell when there's no live SerpAPI row.
    // Real data only (Const I.1): these flags come straight from Semrush's own column.
    // The "client cited" flags can't be known from a CSV (they need a live SERP scan),
    // so they stay false — an honest gap (Const I.5).
    const upLow = typeof dbRow?.serpFeatures === 'string' ? dbRow.serpFeatures.toLowerCase() : '';
    const upHasAIO   = /ai overview|\baio\b/.test(upLow);
    const upHasPAA   = upLow.includes('people also ask');
    const upHasVideo = upLow.includes('video');
    // v7.287: Local Pack (map pack) from the uploaded SERP-features cell (value-robust helper).
    const upHasLocal = serpCellHasLocalPack(dbRow?.serpFeatures);

    return {
      key:          dbRow ? `${dbRow.source}-${dbRow.id}` : (item.isGap ? `sem-gap-${kwLow}` : `sem-ranked-${kwLow}`),
      keyword:      item.keyword,
      searchVolume: item.searchVolume,
      position:     item.position,
      type:         item.isGap ? 'gap' : 'ranked',
      branded:      item.isBranded,
      source:       (dbRow?.source ?? 'semrush') as KwSource,
      origin:       (item as any).origin === 'demand' ? 'demand' : 'footprint',
      competitor:   item.competitor,
      // Live SerpAPI data is authoritative when present; otherwise use the uploaded cell.
      hasAIO:       serp ? (serp.hasAIO ?? false) : upHasAIO,
      clientInAIO:  serp
        ? (serp.aioSources ?? []).some(
            (s: any) => clientDomain && s.domain?.includes(extractBrand(clientDomain)),
          )
        : false,
      hasPAA:        serp ? (serp.paaQuestions ?? []).length > 0 : upHasPAA,
      clientInPAA:   serp?.paaClientCited ?? false,
      // v7.81 fix: serp.ts stores 'video_carousel' — the old 'videos' check
      // meant the Video pill never lit up even for scanned keywords.
      hasVideo:      serp ? (serp.serpFeatures ?? []).includes('video_carousel') : upHasVideo,
      clientInVideo: serp?.videoClientCited ?? false,
      // v7.287: OR every REAL local signal (Const I.1) — live SerpAPI, the uploaded `Fl` cell,
      // or the footprint roll-up — so a keyword Semrush flags as map-pack isn't missed when a
      // live scan didn't capture it. Works for client-footprint AND competitor-gap rows.
      isLocalIntent: (serp ? (serp.serpFeatures ?? []).includes('local_pack') : false)
        || upHasLocal
        || snapLocalSet.has(kwLow),
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
    case 'localIntent':   return rows.filter(r => r.isLocalIntent);   // v7.287: triggers a Local Pack
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
  localIntent:   { label: 'Local Intent',  slug: 'local-intent'   },
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

// v7.235: the hierarchical-taxonomy export Wayne specified — one row per keyword with the
// full semantic path split across level_1..5, plus the LLM's separated modifier (appended as
// the trailing level per Const III.1c), search intent, confidence (LLM self-estimate, NOT a
// measured data metric — Const III.7), and reasoning. volume is the real Semrush/upload row
// (Const I.1). Keywords the model is unsure about (confidence < 80) are flagged needs_review.
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadTaxonomyCSV(
  rows: KeywordRow[],
  pathOf: Map<string, string[]>,
  metaOf: Map<string, KeywordMeta>,
  clientName: string,
  filterSlug: string,
) {
  const headers = ['keyword','volume','level_1','level_2','level_3','level_4','level_5','search_intent','confidence','reasoning','needs_review'];
  const lines: string[] = [headers.join(',')];
  for (const r of rows) {
    const k    = r.keyword.toLowerCase().trim();
    const path = pathOf.get(k) ?? [];
    const meta = metaOf.get(k);
    // Trailing modifier/intent level (Const III.1c): the clean topic path, then the modifier.
    const levels = meta?.modifier ? [...path, meta.modifier] : [...path];
    const lv = [0,1,2,3,4].map(i => levels[i] ?? '');   // level_1..5; deeper paths truncate ("first 5 of N")
    lines.push([
      csvCell(r.keyword),
      csvCell(r.searchVolume),
      ...lv.map(csvCell),
      csvCell(meta?.intent ?? ''),
      csvCell(meta?.confidence != null ? meta.confidence : ''),
      csvCell(meta?.reasoning ?? ''),
      csvCell(meta?.needsReview ? 'YES' : ''),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${clientName.replace(/\s+/g, '-')}-taxonomy-${filterSlug}.csv`;
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
        style={{ color: active ? 'var(--c-9b96ff)' : 'var(--c-555575)' }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--c-8080a8)'; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--c-555575)'; }}
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
  projectId, kwVersion, onKeywordsChanged, onCleared, analysis, competitors, brandTerms = [], domain,
  defaultClientThreshold     = 0,
  defaultCompetitorThreshold = 0,
  serpScanResults, serpScanRunning, serpScanProgress, onStartSerpScan,
  onOpenCompetitors, onDeepJourneyBuilt, onScopeChanged,
}: Props) {
  const clientDomain      = (analysis?.semrushSnapshot?.domain as string) || domain || '';
  const competitorDomains = competitors;
  const clientName        = clientDomain || 'keywords';

  const [dbKeywords,  setDbKeywords]  = useState<DbKeyword[]>([]);
  const [dbLoaded,    setDbLoaded]    = useState(false);
  const [filter,      setFilter]      = useState<KwFilter>('all');
  const [rankFilter,  setRankFilter]  = useState<RankFilter>('all');
  // v7.204: journey scope — All / Product / Pre-product. Uses the SAME per-keyword
  // classifier as the Journey & Cluster panels (Art II.7 single source of truth), so
  // the split never disagrees across panels. Scopes the summary cards, rank
  // distribution and table together.
  const [journeyScope, setJourneyScope] = useState<'all' | 'product' | 'pre'>('all');
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

  // ── v7.241: deep-journey build state for the workflow bar (buttons 3 & 4) ──────
  // Two independent passes. Each streams determinate progress (Const IV.2) from the
  // demand-universe endpoint with mode:'product' | 'pre'. No invented data — Semrush
  // fills every volume (Const I.1).
  const [buildMode,     setBuildMode]     = useState<null | 'product' | 'pre'>(null);
  const [buildProgress, setBuildProgress] = useState<{ done: number; total: number; seed: string; startedAt: number } | null>(null);
  const [buildError,    setBuildError]    = useState<string | null>(null);
  // v7.243: per-box "Clear all" (genuinely deletes the box's data, never hides).
  type ClearKind = 'base' | 'competitor' | 'product' | 'pre';
  const [confirmClear, setConfirmClear] = useState<ClearKind | null>(null);
  const [clearingBox,  setClearingBox]  = useState<ClearKind | null>(null);
  // v7.324: per-summary-card trash. Two scopes, both genuine scoped DB deletes
  // (reuse clearBox → /keywords/clear, Const "delete, never hide"):
  //   'client'     → ALL client data at once (branded + non-branded + local are
  //                  the same client footprint, so a trash on any of those three
  //                  cards erases all three together — Wayne's decision).
  //   'competitor' → all competitor-gap data (+ tracked competitor entries).
  // Separate state from the workflow bar's confirmClear so the two don't cross-fire.
  const [cardConfirm, setCardConfirm] = useState<'client' | 'competitor' | null>(null);
  // v7.244: shared minimum-volume floor for the product & pre-product builds (Const I.6
  // opt-in). 0 = no floor. Applied to both "Run expansion" and "Run build".
  const [minVolume, setMinVolume] = useState<number>(0);

  // ── Fetch DB keywords on mount ──
  const fetchDb = useCallback(async () => {
    try {
      const res  = await fetch(`/api/projects/${projectId}/keywords`);
      const data = await res.json();
      setDbKeywords(data.keywords ?? []);
    } catch { /* silent */ } finally {
      setDbLoaded(true);
    }
  }, [projectId, kwVersion]);   // v7.107: kwVersion bump → refetch uploaded keywords

  useEffect(() => { fetchDb(); }, [fetchDb]);

  // v7.132: combine this panel's own freshly-scanned batches (legacy local
  // state, still used as a fallback) with the page-level background scan
  // results. Fresh-wins on keyword overlap.
  const mergedScanned = useMemo(() => {
    const ext = serpScanResults ?? [];
    if (ext.length === 0) return serpExtra;
    const lo = new Set(ext.map(k => (k?.keyword ?? '').toLowerCase()));
    return [...serpExtra.filter(k => !lo.has((k?.keyword ?? '').toLowerCase())), ...ext];
  }, [serpExtra, serpScanResults]);

  // ── Build merged rows (project-level thresholds applied at build time) ──
  const allRows = useMemo(
    () => buildRows(analysis, dbKeywords, clientDomain, competitorDomains, defaultClientThreshold, defaultCompetitorThreshold, mergedScanned, brandTerms),
    [analysis, dbKeywords, clientDomain, competitorDomains, defaultClientThreshold, defaultCompetitorThreshold, mergedScanned, brandTerms],
  );

  // ── Full-footprint pool for the summary cards (v7.139) ─────────────────────
  // Wayne's decision: "All Keywords" = the client's ENTIRE footprint + all
  // competitor-gap keywords, so the headline reconciles with the Rank
  // Distribution client count (which shows the full footprint, not the
  // volume-floored set). Built with NO volume floors (clientVolMin=0,
  // competitorVolMin=0). The table below intentionally stays volume-filtered
  // (allRows), so the cards read higher than the visible table rows — by design.
  const summaryRows = useMemo(
    () => buildRows(analysis, dbKeywords, clientDomain, competitorDomains, 0, 0, mergedScanned, brandTerms),
    [analysis, dbKeywords, clientDomain, competitorDomains, mergedScanned, brandTerms],
  );

  // ── Journey classifier + scope (v7.204) ────────────────────────────────────
  // Reuses buildJourneyClassifier — the SAME function the Journey & Cluster panels
  // use — so a keyword's product/pre-product label is identical everywhere (Art
  // II.7). A keyword is PRE-PRODUCT only when it names no solution (problem /
  // symptom / trigger) yet is topically relevant; everything else (incl. off-topic)
  // stays PRODUCT, matching the Cluster panel which keeps the full footprint in the
  // product lane. No AI, no modeling — pure deterministic classification.
  const journeyClassifier = useMemo(
    () => buildJourneyClassifier(analysis, clientDomain, competitorDomains),
    [analysis, clientDomain, competitorDomains],
  );
  const isPreProductKw = useCallback(
    (kw: string) => journeyClassifier.classify(kw) === 'pre-product',
    [journeyClassifier],
  );
  const inJourneyScope = useCallback((kw: string): boolean => {
    if (journeyScope === 'all') return true;
    const pre = isPreProductKw(kw);
    return journeyScope === 'pre' ? pre : !pre;
  }, [journeyScope, isPreProductKw]);

  // Scoped pools — the cards (scopedSummaryRows) and the table (scopedAllRows)
  // both re-slice to the chosen journey. When scope = 'all' these are identity
  // copies, so default behaviour is unchanged.
  const scopedAllRows = useMemo(
    () => journeyScope === 'all' ? allRows : allRows.filter(r => inJourneyScope(r.keyword)),
    [allRows, journeyScope, inJourneyScope],
  );
  const scopedSummaryRows = useMemo(
    () => journeyScope === 'all' ? summaryRows : summaryRows.filter(r => inJourneyScope(r.keyword)),
    [summaryRows, journeyScope, inJourneyScope],
  );

  // Journey counts for the toggle — computed on the UNSCOPED full footprint, on the
  // SAME population the "All Keywords" card uses (client rows + competitor-gap rows),
  // so "All journeys" equals the All Keywords count and Product + Pre = All.
  const journeyCounts = useMemo(() => {
    let pre = 0, product = 0;
    for (const r of summaryRows) {
      if (r.type === 'gap' && !r.competitor) continue;   // mirror kwSummary's gap basis
      if (isPreProductKw(r.keyword)) pre++; else product++;
    }
    return { all: pre + product, product, pre };
  }, [summaryRows, isPreProductKw]);

  // ── SERP feature coverage (v7.81) — scanned keywords vs canonical pool ──
  const serpCoverage = useMemo(() => {
    const set = new Set<string>();
    for (const k of (analysis?.serpApiSnapshot?.keywords ?? [])) {
      if (k?.keyword) set.add(k.keyword.toLowerCase());
    }
    for (const k of mergedScanned) {
      if (k?.keyword) set.add(k.keyword.toLowerCase());
    }
    const scanned = scopedAllRows.filter(r => set.has(r.keyword.toLowerCase())).length;
    return { scanned, total: scopedAllRows.length, remaining: scopedAllRows.length - scanned };
  }, [analysis, mergedScanned, scopedAllRows]);

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

  // ── v7.241: run a single-lane deep-journey build (button 3 product / button 4 pre) ──
  // Streams NDJSON progress from /demand-universe so the bar shows "seed X of N" + ETA
  // (Const IV.2), never a bare spinner. On done it tells the page to refetch the
  // analysis (onDeepJourneyBuilt) so the new Semrush-backed topics backfill into this
  // panel and the Cluster/Journey/Content panels (Const II.3). No invented data.
  async function runDeepBuild(mode: 'product' | 'pre') {
    if (buildMode) return;   // one pass at a time
    setBuildMode(mode);
    setBuildError(null);
    setBuildProgress({ done: 0, total: 0, seed: '', startedAt: Date.now() });
    try {
      const r = await fetch(`/api/projects/${projectId}/demand-universe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, linesPerSeed: 50, minVolume }),   // v7.244: opt-in volume floor
      });
      if (!r.ok || !r.body) {
        let msg = `Build failed (${r.status})`;
        try { const d = await r.json(); msg = d?.error ?? msg; } catch {}
        setBuildError(msg);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: any;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'start') {
            setBuildProgress(p => ({ done: 0, total: ev.total ?? 0, seed: '', startedAt: p?.startedAt ?? Date.now() }));
          } else if (ev.type === 'progress') {
            setBuildProgress(p => ({ done: ev.done, total: ev.total, seed: ev.seed ?? '', startedAt: p?.startedAt ?? Date.now() }));
          } else if (ev.type === 'error') {
            setBuildError(ev.error ?? 'Build failed');
          } else if (ev.type === 'done') {
            onDeepJourneyBuilt?.();   // page refetches analysis → backfill everywhere
          }
        }
      }
    } catch (e) {
      setBuildError(String((e as any)?.message ?? e));
    } finally {
      setBuildMode(null);
      setBuildProgress(null);
    }
  }

  // ── v7.243 / v7.325: per-box "Clear all" — genuinely DELETES that box's data ─────
  // base       → delete ALL client data: client rows + the snapshot client footprint
  //              (topKeywords/demand/taxonomy) so clusters/journeys/exec empty too.
  // competitor → delete ALL competitor data: competitor rows + tracked competitors +
  //              the snapshot gap/competitor footprint so the Competitor Gap card → 0.
  // product    → DELETE the product lane of the demand universe (+ its funnel paths)
  // pre        → DELETE the pre-product lane of the demand universe
  // v7.325 fix: base/competitor now hit /keywords/clear-scope, which clears BOTH the
  // uploaded rows AND the saved analysis snapshot. The old /keywords/clear only deleted
  // rows, leaving the snapshot-side count populated (the v7.324 bug: Competitor Gap
  // stayed full while Local Intent's gap-local rows were wiped). The new route also
  // removes the tracked competitors, so the separate DELETE /competitors call is gone.
  // After any clear we trigger a FULL refresh so every panel reflects the deletion.
  async function clearBox(kind: ClearKind) {
    if (clearingBox) return;
    setClearingBox(kind);
    setBuildError(null);
    try {
      if (kind === 'base' || kind === 'competitor') {
        const scope = kind === 'base' ? 'client' : 'competitor';
        const res = await fetch(`/api/projects/${projectId}/keywords/clear-scope`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope }),
        });
        if (!res.ok) {
          const msg = await res.json().catch(() => ({}));
          throw new Error((msg as any)?.error || `clear ${scope} failed (${res.status})`);
        }
      } else {
        await fetch(`/api/projects/${projectId}/demand-universe`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: kind }),
        });
      }
      await fetchDb();
      onKeywordsChanged?.();      // refetch keywords across panels
      onDeepJourneyBuilt?.();     // refetch project + analysis (snapshot now cleared)
    } catch (e) {
      setBuildError(`Clear failed: ${String((e as any)?.message ?? e)}`);
    } finally {
      setClearingBox(null);
      setConfirmClear(null);
      setCardConfirm(null);       // v7.325: also close the summary-card confirm
    }
  }
  // Segment rows: summary-card filter only (no rank filter) — the category
  // breakdown needs ALL rank buckets of the active segment for its stacked bars.
  const segmentRows = useMemo(
    () => applyFilter(scopedAllRows, filter, filter === 'competitorGap' ? volThreshold : 0),
    [scopedAllRows, filter, volThreshold],
  );
  const visibleRows = useMemo(
    () => applySort(
      segmentRows.filter(r => matchesRankFilter(r.position, rankFilter)),
      sortCol, sortDir,
    ),
    [segmentRows, rankFilter, sortCol, sortDir],
  );

  // v7.104: PAGINATION — rendering all rows froze the browser once uploaded
  // footprints reached ~30K keywords ("Page Unresponsive"). Only the current
  // page is rendered; filters/sorts/exports still operate on the full set.
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage  = Math.min(page, pageCount - 1);
  const pagedRows = useMemo(
    () => visibleRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [visibleRows, safePage],
  );
  // Reset to page 1 whenever the underlying list changes shape
  useEffect(() => { setPage(0); }, [filter, rankFilter, sortCol, sortDir, journeyScope, visibleRows.length]);

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

  // ── Summary card stats (v7.140) — exact definitions Wayne specified ─────────
  //   Branded      = CLIENT footprint terms that are branded        (gap excluded)
  //   Non-branded  = CLIENT footprint terms that are non-branded    (gap excluded)
  //   Competitor Gap = competitor terms the client does NOT rank for
  //   All Keywords = Branded + Non-branded + Gap   (literally the sum of the three)
  // All on the full-footprint basis (summaryRows = no volume floors). The table
  // below stays volume-filtered, so cards can read higher than the visible rows.
  const kwSummary = useMemo(() => {
    const clientRows   = scopedSummaryRows.filter(r => r.type !== 'gap');               // client footprint
    const gapRows      = scopedSummaryRows.filter(r => r.type === 'gap' && !!r.competitor); // competitor gap
    const brandedRows  = clientRows.filter(r =>  r.branded);                      // client branded only
    const nonBrandRows = clientRows.filter(r => !r.branded);                      // client non-branded only
    const ann          = (rows: KeywordRow[]) => rows.reduce((s, r) => s + r.searchVolume, 0) * 12;
    const brandedCount  = brandedRows.length,  brandedVol  = ann(brandedRows);
    const nonBrandCount = nonBrandRows.length, nonBrandVol = ann(nonBrandRows);
    const gapCount      = gapRows.length,      gapVol      = ann(gapRows);
    // v7.287: Local Intent — keywords whose Google SERP shows a Local Pack (real Semrush `Fl`).
    // Counted on the SAME basis as All Keywords (client footprint + competitor gap), and split
    // into a client-vs-gap breakout for the card sub-line. Branded/non-branded cut across this,
    // so Local Intent is its own lens, not a partition of the others.
    const localClientRows = clientRows.filter(r => r.isLocalIntent);
    const localGapRows    = gapRows.filter(r => r.isLocalIntent);
    const localClientCount = localClientRows.length;
    const localGapCount    = localGapRows.length;
    return {
      allCount:      brandedCount + nonBrandCount + gapCount,  // = client + gap, by construction
      allVol:        brandedVol + nonBrandVol + gapVol,
      brandedCount,  brandedVol,
      nonBrandCount, nonBrandVol,
      gapCount,      gapVol,
      localCount:    localClientCount + localGapCount,         // client local + gap local
      localVol:      ann(localClientRows) + ann(localGapRows),
      localClientCount,
      localGapCount,
      clientCount:   brandedCount + nonBrandCount,             // client footprint — for the "N client + M gap" sub-line
    };
  }, [scopedSummaryRows]);

  // ── v7.326: ADJACENT VERTICALS (scope-gate staging) ────────────────────────
  // Competitor-only umbrellas the client doesn't compete in (e.g. "Car Insurance" for a
  // lender). They are EXCLUDED from every panel + all volume totals by buildKwPool's default
  // scope filter; this is the ONLY place they surface. Built with includeAdjacent:true and
  // grouped by umbrella so the user can PROMOTE a vertical into the gap landscape (the client
  // is expanding into it) — a flag flip, no re-pull (the keywords are already in the snapshot).
  const adjacentVerticals = useMemo(() => {
    const snap = analysis?.semrushSnapshot;
    if (!snap) return [] as Array<{ umbrella: string; count: number; vol: number }>;
    const resolver = buildScopeResolver(snap, {});            // reads _scopeOverrides off the snapshot
    if (resolver.adjacentUmbrellas.length === 0) return [];
    const fullPool = buildKwPool({
      semrushSnapshot: snap, uploadedKeywords: dbKeywords, clientDomain,
      competitorDomains, brandTerms, includeAdjacent: true,
    });
    const byUmb = new Map<string, { count: number; vol: number }>();
    for (const it of fullPool) {
      const u = resolver.umbrellaOfKeyword(it.keyword.toLowerCase().trim());
      if (!u || !resolver.isAdjacent(u)) continue;
      const e = byUmb.get(u) ?? { count: 0, vol: 0 };
      e.count += 1;
      e.vol   += (it.searchVolume ?? 0) * 12;                 // annual, to match the summary cards
      byUmb.set(u, e);
    }
    return Array.from(byUmb.entries())
      .map(([umbrella, v]) => ({ umbrella, ...v }))
      .sort((a, b) => b.vol - a.vol);
  }, [analysis, dbKeywords, clientDomain, competitorDomains, brandTerms]);

  const [adjacentOpen, setAdjacentOpen] = useState(false);
  const [scopeBusy,    setScopeBusy]    = useState<string | null>(null);   // umbrella being promoted

  // Promote an adjacent vertical into the gap landscape (or demote back). Persists the full
  // override map, then asks the page to refetch the project so every panel re-filters.
  async function setVerticalScope(umbrella: string, to: 'core' | 'adjacent') {
    if (!projectId || !umbrella) return;
    setScopeBusy(umbrella);
    try {
      const cur: Record<string, 'core' | 'adjacent'> = {
        ...(((analysis?.semrushSnapshot as any)?._scopeOverrides) ?? {}),
      };
      if (to === 'core') cur[umbrella] = 'core';
      else               delete cur[umbrella];                // demote back to the auto (adjacent) classification
      const res = await fetch(`/api/projects/${projectId}/scope-overrides`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ overrides: cur }),
      });
      if (!res.ok) throw new Error(`scope-overrides ${res.status}`);
      onScopeChanged?.();                                     // page refetches project → all panels re-filter
    } catch (err) {
      console.error('[OrbitIQ] promote vertical failed', err);
    } finally {
      setScopeBusy(null);
    }
  }

  // ── v7.252: READ-ONLY provenance of the All Keywords count ──────────────────
  // Partitions the SAME rows the All Keywords card counts by their REAL source so
  // the headline number is traceable (Const I.2) and we can see exactly where every
  // keyword came from — your uploaded CSV, the Semrush crawl (topKeywords, only
  // populated by "Run Analysis"), the deep-journey "missing demand" universe, or a
  // competitor gap. This reads existing data only; it writes nothing and changes no
  // count. `rawDbRows` vs `distinctDb` surfaces any duplicate keyword rows.
  const provenance = useMemo(
    () => keywordProvenance(scopedSummaryRows as any, dbKeywords as any),
    [scopedSummaryRows, dbKeywords],
  );

  // ── Client rank distribution from the REAL keyword pool (v7.141) ───────────
  // Reconciles the chart with the cards. The client side is now built from the
  // SAME keyword ROWS the summary cards use (crawl topKeywords + CSV uploads),
  // not the stand-alone `positionDist` aggregate — which on legacy analyses can
  // be a stale band COUNT (e.g. 2,329) not backed by stored keyword rows, and so
  // isn't defensible. One client footprint number everywhere; every bar maps to
  // real keywords on file. (A Full re-analysis re-pulls the complete footprint,
  // uncapped, so this number rises and stays real.)
  const clientDist = useMemo(() => {
    const band = (p: number) => p <= 3 ? '1-3' : p <= 10 ? '4-10' : p <= 20 ? '11-20' : '21+';
    const dist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
    const vol:  Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
    for (const r of scopedSummaryRows) {
      if (r.type === 'gap') continue;             // client footprint only
      if (r.position == null || r.position <= 0) continue;  // unranked → no rank band
      const k = band(r.position);
      dist[k]++;
      vol[k] += r.searchVolume;
    }
    return { dist, vol };
  }, [scopedSummaryRows]);

  // ── Competitor rank distribution source (v7.139) ───────────────────────────
  // Prefer the full-footprint dists computed at analysis time. When they're
  // absent (older snapshot, or a refresh mode that doesn't rebuild them — the
  // reason the competitor card stayed empty after Wayne's refresh), bucket the
  // competitor keywords ALREADY on the page instead: uploaded competitor CSV
  // rows (domain + position) and snapshot gapKeywords (competitor +
  // competitorPosition). Zero extra Semrush units, exactly as the card promises.
  const competitorDist = useMemo(() => {
    const snap     = analysis?.semrushSnapshot ?? {};
    const snapDist = (snap.competitorPositionDist ?? null) as Record<string, Record<string, number>> | null;
    const snapVol  = (snap.competitorPositionVol  ?? null) as Record<string, Record<string, number>> | null;
    // v7.204: the precomputed snapshot dists are NOT journey-aware, so when a
    // journey scope is active we bypass them and bucket from the real gap rows
    // on the page (filtered by the same classifier) — keeping the competitor side
    // consistent with the journey-scoped client side. Default ('all') is unchanged.
    const snapHas  = journeyScope === 'all' && !!snapDist && Object.values(snapDist).some(d => distTotal(d) > 0);
    if (snapHas) return { dist: snapDist, vol: snapVol, fromFallback: false };

    const band = (p: number) => p <= 3 ? '1-3' : p <= 10 ? '4-10' : p <= 20 ? '11-20' : '21+';
    const dist: Record<string, Record<string, number>> = {};
    const vol:  Record<string, Record<string, number>> = {};
    const seen  = new Set<string>();
    const add = (domain: string | null | undefined, pos: number | null | undefined, v: number, kw: string) => {
      if (!domain) return;
      if (!inJourneyScope(kw)) return;   // v7.204: respect the active journey scope
      const p = Number(pos);
      if (!p || p <= 0) return;
      const key = `${domain.toLowerCase()}|${kw.toLowerCase().trim()}`;
      if (seen.has(key)) return;        // dedupe across both sources (uploaded rows added first → win)
      seen.add(key);
      const k = band(p);
      (dist[domain] ??= { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 })[k]++;
      (vol[domain]  ??= { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 })[k] += (v || 0);
    };
    // Uploaded competitor CSV rows (gap rows store the competitor's rank in position)
    for (const r of dbKeywords) {
      if ((r.source ?? '') === 'blocked') continue;
      if (r.type !== 'gap') continue;
      add(r.domain, r.position, r.searchVolume ?? 0, r.keyword ?? '');
    }
    // Auto-detected gap keywords already saved in the snapshot
    for (const g of (snap.gapKeywords ?? [])) {
      add(g.competitor, g.competitorPosition, g.searchVolume ?? 0, g.keyword ?? '');
    }
    const any = Object.values(dist).some(d => distTotal(d) > 0);
    return any
      ? { dist, vol, fromFallback: true }
      : { dist: null as Record<string, Record<string, number>> | null,
          vol:  null as Record<string, Record<string, number>> | null,
          fromFallback: false };
  }, [analysis, dbKeywords, journeyScope, inJourneyScope]);

  // ── Category breakdown source ─────────────────────────────────────────────
  // v7.80: cb supplies the category list (names + types) and the complete
  // keyword → category map from synthesis. ALL aggregation (counts, demand,
  // rank buckets, averages) is computed client-side in KwCategorySection from
  // the canonical segmentRows pool, so category totals always balance with
  // the summary cards for the active segment.
  const cb = (analysis?.semrushSnapshot?._categoryBreakdown ?? null) as KwCategoryBreakdown | null;

  // v7.286: REAL Local-Pack keyword set — keywords whose Google SERP shows a map pack
  // (Semrush `Fl` SERP feature). A category/node is badged when ANY of its keywords is in
  // here, so it works in both flat and path-tree modes. Empty until an analysis is re-run
  // on/after v7.286 (honest gap, Const I.5).
  const localPackKw = useMemo(() => {
    const snap = analysis?.semrushSnapshot;
    const set = new Set<string>();
    if (hasLocalPackData(snap)) (snap.localPackKeywords as any[]).forEach(k => set.add(String(k).toLowerCase()));
    // v7.287: also include every row flagged local (uploaded `Fl` cell / live SerpAPI / gap rows),
    // so the node badges agree with the Local Intent card (Const II.7) on the CSV-upload + gap paths.
    for (const r of allRows) if (r.isLocalIntent) set.add(r.keyword.toLowerCase());
    return set;
  }, [analysis, allRows]);

  // v7.288: is ANY real SERP-feature data present to compute Local Intent from? The flag is
  // read only from real data (snapshot `Fl` roll-up, the uploaded "SERP Features" cell, or a
  // live SerpAPI scan). When a project's stored rows carry NONE of these — e.g. keywords
  // uploaded under a build that didn't capture the column — the Local Intent count is a
  // structural zero, not "no local demand". We surface that honestly (Const I.5) on the card
  // instead of letting it read like a near-empty result.
  const localDataPresent = useMemo(() => {
    if (hasLocalPackData(analysis?.semrushSnapshot)) return true;
    if (dbKeywords.some(d => typeof d.serpFeatures === 'string' && d.serpFeatures.trim().length > 0)) return true;
    if ((mergedScanned ?? []).some((s: any) => Array.isArray(s?.serpFeatures) && s.serpFeatures.length > 0)) return true;
    return false;
  }, [analysis, dbKeywords, mergedScanned]);

  // v7.289: read-only coverage of the uploaded SERP-features column on the STORED rows —
  // the diagnostic that tells us whether the data made it into the DB (write OK) or not.
  // Reads dbKeywords only; computes/changes nothing.
  const serpFeatCoverage = useMemo(() => {
    const total   = dbKeywords.length;
    const withFeat = dbKeywords.filter(d => typeof d.serpFeatures === 'string' && d.serpFeatures.trim().length > 0).length;
    const localFromCells = dbKeywords.filter(d => serpCellHasLocalPack(d.serpFeatures)).length;
    return { total, withFeat, localFromCells };
  }, [dbKeywords]);

  // v7.226: competitor-brand category guard (Const III.1a). The raw `_categoryBreakdown`
  // legitimately contains competitor/third-party brand categories (built from competitor
  // gap keywords). ThemeClustersPanel already drops them at render; the Keyword panel did
  // NOT — so a "Wells Fargo Brand Searches"–style category could surface here. Compute the
  // dropped-name set ONCE from the shared guard and hand it to KwCategorySection, which
  // reroutes any row mapped to a dropped category into "Other" (volume preserved, brand
  // label removed) so both panels' category lists agree.
  const dropCategoryNames = useMemo<Set<string>>(
    () => (cb?.categories?.length
      ? buildCategoryGuard(analysis?.semrushSnapshot, clientDomain, competitorDomains).droppedCategoryNames(cb.categories)
      : new Set<string>()),
    [cb, analysis, clientDomain, competitorDomains],
  );

  // v7.227: the ONE canonical category model — same source the Cluster, Journey and
  // Content panels use (buildCanonicalClusterTopics). The Keyword panel now groups its rows
  // by THIS (guarded + near-dup-merged categories, stored membership) instead of the raw
  // _categoryBreakdown, so all four panels show the same category set (Const II.7).
  // claudeAssigns omitted ({}) — it only splits intent sub-topics, not parent categories.
  const categoryModel = useMemo<CategoryModel>(
    () => buildCategoryModel(analysis, clientDomain, competitorDomains, dbKeywords),
    [analysis, clientDomain, competitorDomains, dbKeywords],
  );

  // ── Add keyword ──
  async function handleAdd() {
    const kwTrimmed = newKw.trim();
    if (!kwTrimmed) { setAddError('Keyword is required.'); return; }
    setAddError('');
    setAddLoading(true);
    try {
      const detectedBranded = isBranded(kwTrimmed, clientDomain, competitorDomains, brandTerms);
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
      onKeywordsChanged?.();   // v7.108: refresh dependent panels
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
      onKeywordsChanged?.();   // v7.108: refresh dependent panels
    } finally {
      setDeletingKey(null);
    }
  }

  // v7.271: bulk delete used by the Category Breakdown trash icons (delete a keyword,
  // a sub-category, or a whole category). Destructive per Wayne's decision: deleting a
  // category removes ITS keywords too. Each row is removed exactly as handleDelete does
  // — semrush/demand/gap rows are 'blocked' (hidden, so the tree re-derives without
  // them), custom/csv rows are hard-deleted. The canonical pool stays the source of
  // truth (Const II.7): the tree is a view, so removing members drops the node and
  // re-rolls-up volumes arithmetically; no taxonomy JSONB is edited at a read site.
  // Chunked to avoid flooding the API, then ONE refresh so dependent panels update once.
  async function deleteRows(rowsToDelete: KeywordRow[]) {
    const uniq = Array.from(new Map(rowsToDelete.map(r => [r.key, r])).values());
    const chunk = 20;
    for (let i = 0; i < uniq.length; i += chunk) {
      await Promise.all(uniq.slice(i, i + chunk).map(row =>
        row.source === 'semrush'
          ? fetch(`/api/projects/${projectId}/keywords`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword: row.keyword, searchVolume: row.searchVolume, type: row.type, branded: row.branded, source: 'blocked' }),
            })
          : fetch(`/api/projects/${projectId}/keywords`, {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keyword: row.keyword, source: row.source }),
            }),
      ));
    }
    await fetchDb();
    onKeywordsChanged?.();   // refresh dependent panels (single source of truth, Const II.7)
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
    // v7.103: Semrush "SERP Features by Keyword" column (optional)
    const featCol = headerCols.findIndex((h: string) =>
      h === 'serp features by keyword' || h === 'serp features' || h === 'serp_features');
    // v7.251: ranking/landing URL column (optional). Semrush Positions export = "URL";
    // also accept common variants from Ahrefs / GSC / other exports.
    const urlCol = headerCols.findIndex((h: string) =>
      h === 'url' || h === 'ranking url' || h === 'landing page' || h === 'page' ||
      h === 'page url' || h === 'address' || h === 'current url' || h === 'target url');

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

    const parsed: Array<{ keyword: string; searchVolume: number; position: number | null; type: 'ranked' | 'gap'; branded: boolean; serpFeatures: string | null; url: string | null }> = [];
    for (const line of dataLines) {
      const cols  = splitCsvLine(line);
      const kwText = (cols[kwCol] ?? '').replace(/^"|"$/g, '').trim();
      if (!kwText) continue;
      const vol     = parseInt(cols[volCol] ?? '0') || 0;
      const pos     = posCol >= 0 ? (parseInt(cols[posCol] ?? '') || null) : null;
      const kwType: 'ranked' | 'gap' = typeCol >= 0
        ? ((cols[typeCol] ?? '').toLowerCase().trim() === 'ranked' ? 'ranked' : 'gap')
        : (pos !== null && pos <= 100 ? 'ranked' : 'gap');
      const branded = isBranded(kwText, clientDomain, competitorDomains, brandTerms);
      // v7.103: raw Semrush feature list, e.g. "AI Overview, People also ask, Video"
      const feats   = featCol >= 0 ? ((cols[featCol] ?? '').replace(/^"|"$/g, '').trim() || null) : null;
      // v7.251: real ranking/landing URL for this keyword (real data only, Const I.1)
      const kurl    = urlCol >= 0 ? ((cols[urlCol] ?? '').replace(/^"|"$/g, '').trim() || null) : null;
      parsed.push({ keyword: kwText, searchVolume: vol, position: pos, type: kwType, branded, serpFeatures: feats, url: kurl });
    }

    if (parsed.length === 0) {
      setCsvStatus({ type: 'error', msg: 'No valid rows found. Expected columns: keyword, search_volume, type' });
      if (csvRef.current) csvRef.current.value = '';
      return;
    }

    // Send all keywords to the batch endpoint in chunks of 500
    // This avoids 3000+ individual DB connections and is far more reliable.
    // v7.143: full row accounting so a silent drop is impossible to miss —
    // we report saved vs file rows, plus dup/blank/failed breakdown.
    let added = 0; let skipped = 0; let failed = 0;
    let serpPrepared = 0; let serpStored = 0;   // v7.289: SERP-features write diagnosis
    const fileRows      = dataLines.length;            // data rows in the CSV (excl. header)
    const parsedDropped = fileRows - parsed.length;    // rows with no keyword (couldn't parse)
    // v7.290 SCALE FIX: smaller batches + automatic retry. Big footprints (TD ≈ 5,400 rows)
    // were posted 500 at a time; if any batch timed out server-side it was counted as failed
    // and its rows (incl. serp_features) never saved — leaving the upload silently partial.
    // Now 250-row batches (lighter request, paired with the route's scoped existing-query
    // fix) and each batch retries up to 3× with backoff before it's declared failed, so a
    // transient timeout no longer drops data. Real accounting preserved (Const I.6).
    const CHUNK = 250;
    const MAX_ATTEMPTS = 3;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    setCsvProgress({ current: 0, total: parsed.length });
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      const payload = JSON.stringify({
        domain: '',
        source: 'csv',
        keywords: chunk.map((row: { keyword: string; searchVolume: number; position: number | null; type: 'ranked' | 'gap'; branded: boolean; serpFeatures: string | null; url: string | null }) => ({
          keyword:      row.keyword,
          searchVolume: row.searchVolume,
          position:     row.position,
          type:         row.type,
          serpFeatures: row.serpFeatures,
          url:          row.url,
        })),
      });
      let saved = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !saved; attempt++) {
        try {
          const res = await fetch(`/api/projects/${projectId}/keywords/batch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
          });
          if (res.ok) {
            const d = await res.json();
            added   += (d.inserted ?? 0) + (d.updated ?? 0);   // v7.92: re-uploads update in place
            skipped += d.skipped  ?? 0;                          // duplicate keywords within the file
            serpPrepared += d.serpFeaturesPrepared ?? 0;          // v7.289: rows in payload carrying SERP features
            if (typeof d.serpFeaturesStored === 'number') serpStored = d.serpFeaturesStored;   // running project total
            saved = true;
          } else if (attempt < MAX_ATTEMPTS) {
            await sleep(attempt * 800);                          // server error (e.g. 504 timeout) — back off and retry
          }
        } catch {
          if (attempt < MAX_ATTEMPTS) await sleep(attempt * 800);   // network error — back off and retry
        }
      }
      if (!saved) failed += chunk.length;                        // exhausted retries — these rows did NOT save
      setCsvProgress({ current: Math.min(i + CHUNK, parsed.length), total: parsed.length });
    }
    setCsvProgress(null);

    if (csvRef.current) csvRef.current.value = '';
    await fetchDb();
      onKeywordsChanged?.();   // v7.108: refresh dependent panels

    // v7.143: always report "saved X of N rows" + a breakdown of everything that
    // didn't save, so a partial upload (the cause of the 731→171 footprint gap)
    // shows up immediately instead of looking like a clean success.
    const parts: string[] = [];
    if (skipped > 0)        parts.push(`${skipped.toLocaleString()} duplicate keyword${skipped !== 1 ? 's' : ''} in file`);
    if (parsedDropped > 0)  parts.push(`${parsedDropped.toLocaleString()} blank/unparseable row${parsedDropped !== 1 ? 's' : ''}`);
    if (failed > 0)         parts.push(`${failed.toLocaleString()} failed to save — re-upload to retry`);
    // v7.289: SERP-features write diagnosis. If this file carried SERP features but none
    // persisted, the column write is being dropped server-side (DB/migration) — surface it
    // loudly so it isn't mistaken for "no local demand".
    let serpNote = '';
    if (serpPrepared > 0 && serpStored === 0) {
      serpNote = ` ⚠ SERP features did not save (${serpPrepared.toLocaleString()} sent, 0 stored) — DB column issue, contact support.`;
    } else if (serpPrepared > 0) {
      serpNote = ` SERP features stored on ${serpStored.toLocaleString()} keyword${serpStored !== 1 ? 's' : ''}.`;
    } else if (serpPrepared === 0 && fileRows > 0) {
      serpNote = ` (No SERP-features column detected in this file.)`;
    }
    const detail = parts.length ? ` (${parts.join(' · ')})` : '';
    setCsvStatus({
      type: (failed > 0 || (serpPrepared > 0 && serpStored === 0)) ? 'error' : 'success',
      msg:  `Saved ${added.toLocaleString()} of ${fileRows.toLocaleString()} CSV row${fileRows !== 1 ? 's' : ''}${detail}.${serpNote}`,
    });
    setTimeout(() => setCsvStatus(null), 15000);
  }

  // ── Clear All — FULL RESET (v7.233) ─────────────────────────────────────────
  // Wayne's decision: "delete and clear them out — there should be NO hiding."
  // The old Clear All deleted the uploaded rows but then INSERTED a 'blocked' row
  // for every Semrush keyword to mask them — which (a) was hiding, not deleting,
  // and (b) only covered topKeywords+gapKeywords, leaving the demand-universe and
  // competitor-gap keywords (buildKwPool includeDemand:true) still visible, so it
  // looked like nothing happened. The Semrush footprint isn't in project_keywords
  // at all — it lives in analyses.semrush_snapshot — so a true wipe must delete
  // the analysis record. The /reset endpoint does both in one shot: every keyword
  // row + every analysis (cascades personas/opportunities/reports). The api_usage
  // ledger, competitors and brand vocab are preserved (project config / spend).
  async function handleClearAll() {
    setClearLoading(true);
    setClearStep('Deleting all keywords & analysis…');

    await fetch(`/api/projects/${projectId}/keywords/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);

    setClearStep('Refreshing…');
    await fetchDb();              // local panel rows → empty
    onKeywordsChanged?.();        // v7.108: refresh dependent panels
    onCleared?.();               // v7.233: parent refetches the now-empty project and keeps us on the empty Keyword panel
    setClearLoading(false);
    setClearStep('');
    setShowClearConfirm(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  // v7.139/v7.144 scroll fix: the panel root is the single vertical scroller.
  // v7.144 — root is now a plain BLOCK scroll container (NOT `flex flex-col`).
  // Why: as a flex column, the table wrapper (a scroll container, since
  // `overflow-x-auto` makes overflow-y compute to `auto`) was a flex item with an
  // automatic `min-height: 0`, so flexbox shrank IT to absorb the overflow instead
  // of letting the panel scroll. With tall content (e.g. after a big CSV reload)
  // the wrapper collapsed and nothing scrolled. As a block, children stack in
  // normal flow at their natural height and the root scrolls the whole panel.
  return (
    <div className="flex-1 min-h-0 overflow-y-auto animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-orbit-border shrink-0" style={{ background: 'var(--c-0d0d18)' }}>
          <div>
            <h2 className="text-orbit-primary font-semibold text-sm">Keyword Landscape</h2>
            <p className="text-orbit-tertiary text-[11px] mt-0.5">
              {dbLoaded
                ? <>{visibleRows.length.toLocaleString()} total &nbsp;·&nbsp; {ranked.toLocaleString()} ranked &nbsp;·&nbsp; {gap} gap</>
                : <span style={{ color: 'var(--c-333350)' }}>Loading keywords…</span>
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Upload CSV */}
            <label
              className="text-xs border border-orbit-border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              title="Upload CSV (columns: keyword, search_volume, type)"
              style={{ color: 'var(--c-7070a0)', opacity: csvProgress ? 0.5 : 1, pointerEvents: csvProgress ? 'none' : 'auto' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload CSV
              <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvUpload} />
            </label>

            {/* Clear All — v7.233: full reset. Show whenever there's anything to
                wipe — uploaded rows OR a Semrush footprint (which lives in the
                analysis snapshot, not dbKeywords). The old `dbKeywords.length > 0`
                gate hid the button on pure-Semrush projects, exactly when a reset
                was needed. */}
            {(summaryRows.length > 0 || dbKeywords.length > 0) && !showClearConfirm && !csvProgress && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs border border-orbit-border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                style={{ color: 'var(--c-7070a0)' }}
                title="Delete everything and start over — removes all keywords (uploaded + Semrush footprint) and the saved analysis. No hiding."
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All
              </button>
            )}

            {/* Clear All — inline confirm */}
            {showClearConfirm && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--ca-239-68-68-0_3)', background: 'var(--ca-239-68-68-0_06)' }}>
                {clearLoading ? (
                  <>
                    <svg className="animate-spin shrink-0" style={{ width: 12, height: 12, color: 'var(--c-f87171)' }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path style={{ opacity: 0.85 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    <span className="text-[11px] font-medium" style={{ color: 'var(--c-f87171)' }}>{clearStep}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px]" style={{ color: 'var(--c-f87171)' }}>
                      Delete all keywords + the saved analysis and start over? This can't be undone.
                    </span>
                    <button
                      onClick={handleClearAll}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'var(--ca-239-68-68-0_15)', color: 'var(--c-f87171)' }}
                    >
                      Yes, clear
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{ color: 'var(--c-6060a0)' }}
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
                background:  csvStatus.type === 'success' ? 'var(--ca-52-211-153-0_08)' : 'var(--ca-239-68-68-0_08)',
                color:       csvStatus.type === 'success' ? 'var(--c-34d399)' : 'var(--c-f87171)',
                borderColor: csvStatus.type === 'success' ? 'var(--ca-52-211-153-0_25)' : 'var(--ca-239-68-68-0_25)',
              }}>
                {csvStatus.msg}
              </span>
            )}

          {/* Add keyword */}
          <button
            onClick={() => { setShowAdd(v => !v); setAddError(''); }}
            className="text-xs border px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            style={{
              color: showAdd ? 'var(--c-8b85ff)' : 'var(--c-7070a0)',
              borderColor: showAdd ? 'var(--ca-108-99-255-0_5)' : '',
              background:  showAdd ? 'var(--ca-108-99-255-0_08)' : '',
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

          {/* v7.235: Taxonomy CSV — keyword, volume, level_1..5, search_intent, confidence
              (LLM self-estimate, not a measured metric), reasoning, needs_review. Only when
              the analysis carries the stored hierarchical taxonomy (else nothing to export). */}
          {categoryModel.keywordPaths.size > 0 && (
            <button
              onClick={() => downloadTaxonomyCSV(visibleRows, categoryModel.keywordPaths, categoryModel.keywordMeta, clientName, FILTER_META[filter].slug)}
              title="Download the hierarchical taxonomy (keyword, volume, level_1–5, search_intent, confidence [LLM estimate], reasoning, needs_review) as CSV"
              className="text-xs text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 hover:border-indigo-500/60 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Taxonomy<span className="opacity-50 ml-0.5">CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* ── v7.270: Keyword Landscape Summary intro — orients the panel: what this  */}
      {/* view is and how to read it. Static descriptive copy only, no data values    */}
      {/* (Const I.1). Sits at the very top of the scroll body, above the cards.       */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--c-111120)', background: 'var(--c-0a0a14)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
          <i className="ti ti-map-2" style={{ fontSize: 18, color: 'var(--c-9b96ff)' }} aria-hidden="true" />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-e8e8ff)', margin: 0, letterSpacing: '-0.2px' }}>Keyword Landscape Summary</h3>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--c-9090b8)', margin: 0, maxWidth: 760 }}>
          One view of every keyword in scope — where each sits in the funnel, who you compete with, and which demand is still untapped. Build the workflow below to turn your uploaded list into a full-funnel landscape, then drill in by journey.
        </p>
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
          clearScope?: 'client' | 'competitor';   // v7.324: which trash this card shows
        }> = [
          {
            id: 'all', label: 'All Keywords', count: kwSummary.allCount, vol: kwSummary.allVol,
            accent: 'var(--c-9b96ff)', activeBg: 'var(--ca-108-99-255-0_10)', activeBdr: 'var(--ca-108-99-255-0_45)',
            dimBg: 'var(--ca-108-99-255-0_04)', dimBdr: 'var(--ca-108-99-255-0_15)',
            icon: 'ti-list',
            subtitle: dbLoaded
              ? `${kwSummary.clientCount.toLocaleString()} client + ${(kwSummary.allCount - kwSummary.clientCount).toLocaleString()} gap`
              : 'Total keyword footprint',
          },
          {
            id: 'branded', label: 'Branded', count: kwSummary.brandedCount, vol: kwSummary.brandedVol,
            accent: 'var(--c-c882ff)', activeBg: 'var(--ca-200-130-255-0_10)', activeBdr: 'var(--ca-200-130-255-0_45)',
            dimBg: 'var(--ca-200-130-255-0_04)', dimBdr: 'var(--ca-200-130-255-0_15)',
            icon: 'ti-tag', subtitle: 'Client or competitor brand', clearScope: 'client',
          },
          {
            id: 'nonBranded', label: 'Non-branded', count: kwSummary.nonBrandCount, vol: kwSummary.nonBrandVol,
            accent: 'var(--c-38bdf8)', activeBg: 'var(--ca-56-189-248-0_10)', activeBdr: 'var(--ca-56-189-248-0_45)',
            dimBg: 'var(--ca-56-189-248-0_04)', dimBdr: 'var(--ca-56-189-248-0_15)',
            icon: 'ti-search', subtitle: 'Generic / category terms', clearScope: 'client',
          },
          {
            // v7.287: Local Intent — keywords that trigger a Google Local Pack (map pack). Sub-line
            // breaks the total into client footprint vs competitor gap. REAL Semrush `Fl` data.
            id: 'localIntent', label: 'Local Intent', count: kwSummary.localCount, vol: kwSummary.localVol,
            accent: 'var(--c-46cce0)', activeBg: 'var(--ca-6-182-212-0_10)', activeBdr: 'var(--ca-6-182-212-0_45)',
            dimBg: 'var(--ca-6-182-212-0_04)', dimBdr: 'var(--ca-6-182-212-0_15)',
            icon: 'ti-map-pin',
            // v7.288: honest gap (Const I.5) — if no SERP-feature data is stored, say so instead
            // of showing a near-zero that looks like a bug.
            subtitle: !dbLoaded
              ? 'Triggers a local map pack'
              : (!localDataPresent
                  ? '⚠ No SERP-features in upload — re-upload to populate'
                  : `${kwSummary.localClientCount.toLocaleString()} client + ${kwSummary.localGapCount.toLocaleString()} gap`),
            clearScope: 'client',
          },
          {
            id: 'competitorGap', label: 'Competitor Gap', count: kwSummary.gapCount, vol: kwSummary.gapVol,
            accent: 'var(--c-f59e0b)', activeBg: 'var(--ca-245-158-11-0_10)', activeBdr: 'var(--ca-245-158-11-0_45)',
            dimBg: 'var(--ca-245-158-11-0_04)', dimBdr: 'var(--ca-245-158-11-0_15)',
            icon: 'ti-arrows-diff', subtitle: 'Competitor ranks, client doesn\'t', clearScope: 'competitor',
          },
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--c-111120)', background: 'var(--c-0a0a14)', flexShrink: 0 }}>
            {KW_CARDS.map(card => {
              const active = filter === card.id;
              // v7.324: per-card trash — show only when that scope actually has data
              // to delete (honest: no dangling delete on an empty box).
              const showTrash = dbLoaded && !!card.clearScope && (
                card.clearScope === 'client'
                  ? (kwSummary.clientCount ?? 0) > 0
                  : (kwSummary.gapCount ?? 0) > 0
              );
              const confirming = cardConfirm === card.clearScope && !!card.clearScope;
              const isClearing = card.clearScope === 'client'
                ? clearingBox === 'base'
                : card.clearScope === 'competitor' ? clearingBox === 'competitor' : false;
              return (
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFilter(card.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(card.id); } }}
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
                    if (!active) (e.currentTarget as HTMLDivElement).style.borderColor = card.activeBdr;
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLDivElement).style.borderColor = card.dimBdr;
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
                    {/* v7.324: trash → delete this card's data (client cards delete ALL */}
                    {/* client data together; competitor card deletes competitor data).   */}
                    {showTrash && !confirming && (
                      <span
                        role="button"
                        tabIndex={0}
                        title={card.clearScope === 'client'
                          ? 'Delete all client data (branded + non-branded + local) — permanent'
                          : 'Delete all competitor data — permanent'}
                        aria-label={card.clearScope === 'client' ? 'Delete all client data' : 'Delete all competitor data'}
                        onClick={e => { e.stopPropagation(); setCardConfirm(card.clearScope!); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setCardConfirm(card.clearScope!); } }}
                        style={{ marginLeft: active ? 6 : 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, border: '1px solid var(--c-2a2a40)', background: 'transparent', color: 'var(--c-8a8aa8)', cursor: 'pointer', flexShrink: 0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = 'var(--c-f87171)'; (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--c-f87171)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = 'var(--c-8a8aa8)'; (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--c-2a2a40)'; }}
                      >
                        <i className="ti ti-trash" style={{ fontSize: 11 }} aria-hidden="true" />
                      </span>
                    )}
                  </div>

                  {/* Count */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
                    <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, letterSpacing: '-1px', color: active ? card.accent : 'var(--c-e8e8ff)' }}>
                      {dbLoaded ? card.count.toLocaleString() : '—'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--c-9090b8)' }}>keywords</span>
                  </div>

                  {/* Annual volume */}
                  <div style={{ fontSize: 14, fontWeight: 600, color: card.accent, marginBottom: 3 }}>
                    {dbLoaded ? fmtVol(card.vol) : '—'}
                    <span style={{ fontSize: 11, color: 'var(--c-8080a8)', fontWeight: 400, marginLeft: 4 }}>annual vol</span>
                  </div>

                  {/* Subtitle — or inline two-step delete confirm (v7.324) */}
                  {confirming ? (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}
                    >
                      <span style={{ flexBasis: '100%', fontSize: 10.5, fontWeight: 600, color: 'var(--c-f87171)' }}>
                        {card.clearScope === 'client' ? 'Delete ALL client data?' : 'Delete ALL competitor data?'}
                      </span>
                      <span
                        role="button"
                        tabIndex={isClearing ? -1 : 0}
                        aria-label="Confirm delete"
                        onClick={e => { e.stopPropagation(); if (isClearing) return; setCardConfirm(null); clearBox(card.clearScope === 'client' ? 'base' : 'competitor'); }}
                        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isClearing) { e.preventDefault(); e.stopPropagation(); setCardConfirm(null); clearBox(card.clearScope === 'client' ? 'base' : 'competitor'); } }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: 'var(--c-f87171)', background: 'var(--ca-248-113-113-0_2)', border: '1px solid var(--c-f87171)', borderRadius: 6, padding: '4px 9px', cursor: isClearing ? 'default' : 'pointer' }}
                      >
                        <i className={`ti ${isClearing ? 'ti-loader-2' : 'ti-trash'}`} style={{ fontSize: 11 }} aria-hidden="true" />{isClearing ? 'Deleting…' : 'Delete'}
                      </span>
                      <span
                        role="button"
                        tabIndex={isClearing ? -1 : 0}
                        aria-label="Cancel delete"
                        onClick={e => { e.stopPropagation(); if (!isClearing) setCardConfirm(null); }}
                        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isClearing) { e.preventDefault(); e.stopPropagation(); setCardConfirm(null); } }}
                        style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--c-9090b8)', background: 'transparent', border: '1px solid var(--c-2a2a40)', borderRadius: 6, padding: '4px 9px', cursor: isClearing ? 'default' : 'pointer' }}
                      >
                        Cancel
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--c-7070a0)', marginTop: 2 }}>
                      {card.subtitle}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── v7.252: READ-ONLY provenance strip — where the All Keywords count comes from. */}
      {/* Reads existing data only; adds nothing. Lets you trace the headline to its real  */}
      {/* sources (Const I.2) and spot any unexpected source or duplicate rows.            */}
      {dbLoaded && (() => {
        const p = provenance;
        const chips: Array<{ label: string; n: number; color: string }> = [
          { label: 'your CSV upload', n: p.upload, color: 'var(--c-9b96ff)' },
          { label: 'Semrush crawl',   n: p.crawl,  color: 'var(--c-38bdf8)' },
          { label: 'missing demand',  n: p.demand, color: 'var(--c-22d3ee)' },
          { label: 'competitor gap',  n: p.gap,    color: 'var(--c-f59e0b)' },
        ].filter(c => c.n > 0);
        const dupRows = p.rawDbRows - p.distinctDb;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 14px', borderBottom: '1px solid var(--c-111120)', background: 'var(--c-0a0a14)', flexShrink: 0 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-6a6a90)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-route" /> Source of count
            </span>
            {chips.length ? chips.map(c => (
              <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-c8c8e8)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: 'inline-block' }} />
                <b style={{ fontFamily: 'monospace', color: c.color }}>{c.n.toLocaleString()}</b> {c.label}
              </span>
            )) : <span style={{ fontSize: 11, color: 'var(--c-6a6a90)' }}>No keywords loaded yet.</span>}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-6a6a90)', fontFamily: 'monospace' }}>
              {p.distinctDb.toLocaleString()} distinct of {p.rawDbRows.toLocaleString()} uploaded rows
              {dupRows > 0 && <span style={{ color: 'var(--c-f59e0b)', marginLeft: 6 }}>· {dupRows.toLocaleString()} duplicate rows</span>}
            </span>
            {/* v7.289: SERP-features coverage diagnostic — shows whether the uploaded SERP-features */}
            {/* column actually landed on the stored rows (the input to Local Intent). Real data only. */}
            {serpFeatCoverage.total > 0 && (
              <span style={{ flexBasis: '100%', fontSize: 10.5, fontFamily: 'monospace', color: 'var(--c-8a8aa8)', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <i className="ti ti-map-pin" style={{ color: serpFeatCoverage.withFeat === 0 ? 'var(--c-ef4444)' : 'var(--c-46cce0)' }} />
                SERP-features data on{' '}
                <b style={{ color: serpFeatCoverage.withFeat === 0 ? 'var(--c-ef4444)' : 'var(--c-46cce0)' }}>{serpFeatCoverage.withFeat.toLocaleString()}</b>
                {' '}of {serpFeatCoverage.total.toLocaleString()} stored rows
                {serpFeatCoverage.withFeat > 0 && <>{' · '}<b style={{ color: 'var(--c-46cce0)' }}>{serpFeatCoverage.localFromCells.toLocaleString()}</b> trigger a local pack</>}
                {serpFeatCoverage.withFeat === 0 && <span style={{ color: 'var(--c-ef4444)' }}>{' — '}empty: re-upload on this version with the “SERP Features by Keyword” column to populate</span>}
              </span>
            )}
          </div>
        );
      })()}

      {/* ── v7.326: Adjacent verticals (competitor-only) — scope-gate staging ────── */}
      {/* Competitor gap umbrellas the client doesn't compete in. EXCLUDED from every    */}
      {/* panel + all volume totals (so they never inflate the footprint); surfaced ONLY */}
      {/* here. Promote one into the gap landscape when the client is expanding into it.  */}
      {adjacentVerticals.length > 0 && (
        <div style={{ margin: '14px 0 4px', border: '1px solid var(--c-3a2508)', borderRadius: 10, background: 'var(--c-1a1008)', overflow: 'hidden' }}>
          <button
            onClick={() => setAdjacentOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <i className={`ti ti-chevron-${adjacentOpen ? 'down' : 'right'}`} style={{ color: 'var(--c-c99c4a)', fontSize: 14 }} />
            <i className="ti ti-eye-off" style={{ color: 'var(--c-c99c4a)', fontSize: 14 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-c99c4a)' }}>
              Adjacent verticals — competitor-only
            </span>
            <span style={{ fontSize: 11, color: 'var(--c-8a8aa8)' }}>
              {adjacentVerticals.length} vertical{adjacentVerticals.length === 1 ? '' : 's'} · excluded from totals
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10.5, fontFamily: 'monospace', color: 'var(--c-6a6a90)' }}>
              {adjacentVerticals.reduce((s, v) => s + v.count, 0).toLocaleString()} kw ·{' '}
              {adjacentVerticals.reduce((s, v) => s + v.vol, 0).toLocaleString()}/yr quarantined
            </span>
          </button>
          {adjacentOpen && (
            <div style={{ padding: '4px 12px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--c-8a8aa8)', padding: '2px 2px 10px', lineHeight: 1.5 }}>
                These are competitor gap keywords in verticals your client doesn’t compete in, so they’re kept
                out of the footprint, volume totals and every other panel. If the client is moving into one,
                <b style={{ color: 'var(--c-c99c4a)' }}> Add to landscape</b> to count it as a competitor gap.
              </div>
              {adjacentVerticals.map(v => (
                <div key={v.umbrella} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderTop: '1px solid var(--c-3a2508)' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-c8c8e8)' }}>{v.umbrella}</span>
                  <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: 'var(--c-6a6a90)' }}>
                    {v.count.toLocaleString()} kw · {v.vol.toLocaleString()}/yr
                  </span>
                  <button
                    onClick={() => setVerticalScope(v.umbrella, 'core')}
                    disabled={scopeBusy === v.umbrella}
                    style={{
                      marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 11.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999,
                      color: 'var(--c-46cce0)', background: 'transparent', border: '1px solid var(--c-46cce0)',
                      cursor: scopeBusy === v.umbrella ? 'default' : 'pointer', opacity: scopeBusy === v.umbrella ? 0.5 : 1,
                    }}
                  >
                    <i className={`ti ti-${scopeBusy === v.umbrella ? 'loader-2' : 'plus'}`} style={{ fontSize: 13 }} />
                    {scopeBusy === v.umbrella ? 'Adding…' : 'Add to landscape'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── v7.241: Workflow bar — 4 build stages (Wayne). Sits between the summary */}
      {/* cards and the journey toggle. (1) client base keywords — status only,     */}
      {/* completed once base rows exist; (2) competitor data — opens the Competitors */}
      {/* modal, active until competitor data exists; (3) Expand product data —      */}
      {/* product-lane deep build; (4) Build pre-product journey — pre-product deep   */}
      {/* build. Buttons 3 & 4 replace the Journey panel's old build button. Every    */}
      {/* status is derived from REAL data; volumes come from Semrush (Const I.1).    */}
      {(() => {
        const baseDone = (kwSummary.clientCount ?? 0) > 0;
        // v7.242: "Competitor data" is COMPLETE only when real competitor KEYWORD data
        // exists (competitor-gap rows), NOT merely when competitor domains are listed.
        // Adding a domain without uploading/pulling its keywords leaves this ACTION-NEEDED.
        const compHasDomains = (competitorDomains?.length ?? 0) > 0;
        const compDone       = (kwSummary.gapCount ?? 0) > 0;
        const du       = analysis?.semrushSnapshot?._demandUniverse;
        const duTopics: any[] = Array.isArray(du?.topics) ? du.topics : [];
        const productTopics = duTopics.filter(t => t?.laneHint === 'product').length;
        const preTopics     = duTopics.filter(t => t?.laneHint && t.laneHint !== 'product').length;
        const productDone   = productTopics > 0;
        const preDone       = preTopics > 0;

        const elapsed = buildProgress ? (Date.now() - buildProgress.startedAt) / 1000 : 0;
        const eta = buildProgress && buildProgress.done > 0 && buildProgress.total > buildProgress.done
          ? Math.round((elapsed / buildProgress.done) * (buildProgress.total - buildProgress.done))
          : null;

        // status: 'done' (calm green) | 'building' (cyan, in-progress) | 'action' (bright accent CTA)
        type Stage = {
          n: number; title: string; accent: string; bgAct: string; glow: string; icon: string;
          status: 'done' | 'building' | 'action';
          doneLabel: string; cta: string;
          body: React.ReactNode;
          onClick?: () => void; disabled?: boolean;
          clearKind: ClearKind; canClear: boolean;
        };
        const stages: Stage[] = [
          {
            n: 1, title: 'Client base keywords', accent: 'var(--c-34d399)', bgAct: 'var(--ca-52-211-153-0_1)', glow: 'var(--ca-52-211-153-0_2)', icon: 'ti-file-upload',
            status: baseDone ? 'done' : 'action', doneLabel: 'Completed', cta: 'Upload CSV',
            onClick: baseDone ? undefined : () => csvRef.current?.click(),
            clearKind: 'base', canClear: baseDone,
            body: baseDone
              ? `${(kwSummary.clientCount ?? 0).toLocaleString()} base keywords on file (CSV)`
              : 'Upload your base keyword CSV to begin',
          },
          {
            n: 2, title: 'Competitor data', accent: 'var(--c-f59e0b)', bgAct: 'var(--ca-245-158-11-0_10)', glow: 'var(--ca-245-158-11-0_2)', icon: 'ti-users',
            status: compDone ? 'done' : 'action', doneLabel: 'Completed', cta: compHasDomains ? 'Upload data' : 'Add competitors',
            onClick: () => onOpenCompetitors?.(),
            clearKind: 'competitor', canClear: compHasDomains || compDone,
            body: compDone
              ? `Competitor keyword data loaded — click to manage`
              : compHasDomains
                ? `${competitorDomains.length} competitor${competitorDomains.length === 1 ? '' : 's'} added, no keyword data yet — upload it`
                : 'Add competitor domains & upload their keyword CSVs',
          },
          {
            n: 3, title: 'Expand product data', accent: 'var(--c-9b96ff)', bgAct: 'var(--ca-155-150-255-0_10)', glow: 'var(--ca-155-150-255-0_20)', icon: 'ti-sparkles',
            status: buildMode === 'product' ? 'building' : productDone ? 'done' : 'action', doneLabel: 'Built', cta: productDone ? 'Re-run' : 'Run expansion',
            onClick: () => runDeepBuild('product'), disabled: !!buildMode,
            clearKind: 'product', canClear: productDone,
            body: productDone
              ? `${productTopics.toLocaleString()} volume-backed topics (Semrush)`
              : `Expand each product category into full-funnel demand${minVolume > 0 ? ` · min ${minVolume.toLocaleString()}/mo` : ''}`,
          },
          {
            n: 4, title: 'Build pre-product journey', accent: 'var(--c-22d3ee)', bgAct: 'var(--ca-34-211-238-0_1)', glow: 'var(--ca-34-211-238-0_2)', icon: 'ti-route',
            status: buildMode === 'pre' ? 'building' : preDone ? 'done' : 'action', doneLabel: 'Built', cta: preDone ? 'Re-run' : 'Run build',
            onClick: () => runDeepBuild('pre'), disabled: !!buildMode,
            clearKind: 'pre', canClear: preDone,
            body: preDone
              ? `${preTopics.toLocaleString()} problem / trigger topics (Semrush)`
              : `Surface problem-aware demand before the product is known${minVolume > 0 ? ` · min ${minVolume.toLocaleString()}/mo` : ''}`,
          },
        ];
        const actionCount = stages.filter(s => s.status === 'action').length;

        return (
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-111120)', background: 'var(--c-0a0a14)', flexShrink: 0 }}>
            {/* v7.270: enlarged title + one-line context (left column); the min-volume */}
            {/* control keeps its place on the right via marginLeft:auto.                */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-e8e8ff)', letterSpacing: '-0.2px' }}>
                    Let&rsquo;s build the workflow
                  </span>
                  {actionCount > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-f59e0b)', background: 'var(--ca-245-158-11-0_12)', border: '1px solid var(--c-f59e0b44)', borderRadius: 20, padding: '2px 8px' }}>
                      {actionCount} action{actionCount === 1 ? '' : 's'} needed
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--c-8080a8)', margin: '5px 0 0', maxWidth: 680 }}>
                  Four steps build your landscape from the ground up — <span style={{ color: 'var(--c-9090c0)' }}>base → competitors → product demand → pre-product demand</span>. Each step unlocks the next.
                </p>
              </div>

              {/* v7.244: shared minimum-volume floor for steps 3 & 4 (opt-in, Const I.6). */}
              {(() => {
                const presets = [
                  { label: 'None', v: 0 }, { label: '500', v: 500 }, { label: '1K', v: 1000 },
                  { label: '1.9K', v: 1900 }, { label: '2.4K', v: 2400 }, { label: '3.6K', v: 3600 }, { label: '4.4K', v: 4400 },
                ];
                const disabled = !!buildMode;
                return (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', opacity: disabled ? 0.55 : 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-585878)' }} title="Only pull keywords with at least this monthly search volume (steps 3 & 4)">
                      Min volume · steps 3 &amp; 4
                    </span>
                    {presets.map(p => {
                      const on = minVolume === p.v;
                      return (
                        <button
                          key={p.v}
                          type="button"
                          disabled={disabled}
                          onClick={() => setMinVolume(p.v)}
                          style={{
                            fontSize: 10.5, fontWeight: 700, lineHeight: 1, padding: '4px 8px', borderRadius: 6,
                            cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
                            background: on ? 'var(--c-1e1e38)' : 'transparent',
                            border: `1px solid ${on ? 'var(--c-9b96ff)' : 'var(--c-2a2a45)'}`,
                            color: on ? 'var(--c-c8c8e8)' : 'var(--c-9090b8)',
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                    <input
                      type="number" min={0} step={100} disabled={disabled}
                      value={minVolume > 0 ? minVolume : ''}
                      placeholder="custom"
                      onChange={e => setMinVolume(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      title="Custom minimum monthly volume — keywords below this are not pulled"
                      style={{ width: 78, fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', color: 'var(--c-c8c8e8)', outline: 'none' }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--c-585878)' }}>/mo</span>
                  </div>
                );
              })()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
              {stages.map(s => {
                const confirming = confirmClear === s.clearKind;
                const isClearing = clearingBox === s.clearKind;
                const clickable = !!s.onClick && !s.disabled && !confirming && !clearingBox;
                const emphasize = s.status === 'action' || s.status === 'building';
                const chip = s.status === 'done'
                  ? { fg: 'var(--c-34d399)', bg: 'var(--ca-52-211-153-0_12)', bd: 'var(--c-34d39955)', ic: 'ti-circle-check', label: s.doneLabel }
                  : s.status === 'building'
                  ? { fg: 'var(--c-22d3ee)', bg: 'var(--ca-34-211-238-0_12)', bd: 'var(--c-22d3ee55)', ic: 'ti-loader-2', label: 'Building…' }
                  : { fg: s.accent, bg: 'transparent', bd: s.accent, ic: 'ti-alert-circle', label: 'Action needed' };
                return (
                  <div
                    key={s.n}
                    role="button"
                    tabIndex={clickable ? 0 : -1}
                    onClick={clickable ? s.onClick : undefined}
                    onKeyDown={clickable ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.onClick?.(); } }) : undefined}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'stretch',
                      padding: '13px 14px 14px', borderRadius: 11, textAlign: 'left', width: '100%',
                      background: emphasize ? s.bgAct : 'var(--c-0c0c16)',
                      border: `1px solid ${emphasize ? s.accent : 'var(--c-1e1e34)'}`,
                      boxShadow: s.status === 'action' ? `0 0 0 1px ${s.glow}, 0 10px 24px -10px ${s.glow}` : 'none',
                      cursor: clickable ? 'pointer' : 'default', outline: 'none', transition: 'all 0.15s',
                      opacity: (s.disabled || (!!clearingBox && !isClearing)) ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px ${s.glow}, 0 12px 26px -8px ${s.glow}`; }}
                    onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.boxShadow = s.status === 'action' ? `0 0 0 1px ${s.glow}, 0 10px 24px -10px ${s.glow}` : 'none'; }}
                  >
                    {/* accent stripe on action cards */}
                    {s.status === 'action' && <span style={{ position: 'absolute', left: 0, top: 11, bottom: 11, width: 3, borderRadius: 3, background: s.accent }} aria-hidden="true" />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {/* v7.270: "Step N" label (was a bare number) — makes the four-step sequence explicit */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, borderRadius: 5, padding: '0 7px', background: emphasize ? s.accent : 'var(--c-14142a)', color: emphasize ? 'var(--c-08080f)' : s.accent, fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', flexShrink: 0 }}>Step {s.n}</span>
                      <i className={`ti ${s.icon}`} style={{ fontSize: 14, color: s.accent }} aria-hidden="true" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: emphasize ? 'var(--c-e8e8ff)' : 'var(--c-c8c8e8)' }}>{s.title}</span>
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: chip.fg, background: chip.bg, border: `1px solid ${chip.bd}`, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                        <i className={`ti ${chip.ic}`} style={{ fontSize: 10 }} aria-hidden="true" />{chip.label}
                      </span>
                      {/* Clear-all (deletes) — only when there's data to clear */}
                      {s.canClear && s.status !== 'building' && (
                        <button
                          type="button"
                          title="Clear all — permanently deletes this box's data"
                          aria-label={`Clear ${s.title}`}
                          onClick={e => { e.stopPropagation(); setConfirmClear(confirming ? null : s.clearKind); }}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, border: '1px solid var(--c-2a2a40)', background: 'transparent', color: 'var(--c-8a8aa8)', cursor: 'pointer', flexShrink: 0 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-f87171)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-f87171)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-8a8aa8)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-2a2a40)'; }}
                        >
                          <i className="ti ti-trash" style={{ fontSize: 11 }} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: emphasize ? 'var(--c-a8a8cc)' : 'var(--c-7a7aa0)', lineHeight: 1.45 }}>{s.body}</span>

                    {/* confirm "clear all" — genuinely deletes */}
                    {confirming ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}
                           onClick={e => e.stopPropagation()}>
                        <span style={{ fontSize: 10.5, color: 'var(--c-f87171)', fontWeight: 600 }}>Delete this data permanently?</span>
                        <button type="button" disabled={isClearing}
                          onClick={e => { e.stopPropagation(); clearBox(s.clearKind); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: 'var(--c-f87171)', background: 'var(--ca-248-113-113-0_2)', border: '1px solid var(--c-f87171)', borderRadius: 6, padding: '4px 9px', cursor: isClearing ? 'default' : 'pointer' }}>
                          <i className={`ti ${isClearing ? 'ti-loader-2' : 'ti-trash'}`} style={{ fontSize: 11 }} aria-hidden="true" />{isClearing ? 'Clearing…' : 'Clear all'}
                        </button>
                        <button type="button" disabled={isClearing}
                          onClick={e => { e.stopPropagation(); setConfirmClear(null); }}
                          style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--c-9090b8)', background: 'transparent', border: '1px solid var(--c-2a2a40)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (<>
                      {/* in-progress bar */}
                      {s.status === 'building' && buildProgress && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ height: 5, background: 'var(--c-1a1a2c)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${buildProgress.total > 0 ? Math.round((buildProgress.done / buildProgress.total) * 100) : 0}%`, height: '100%', background: s.accent, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--c-8080a8)', fontVariantNumeric: 'tabular-nums' }}>
                            {buildProgress.total > 0 ? `seed ${buildProgress.done}/${buildProgress.total}` : 'starting…'}
                            {eta !== null ? ` · ~${eta}s left` : ''}
                            {buildProgress.seed ? ` · ${buildProgress.seed}` : ''}
                          </span>
                        </div>
                      )}

                      {/* prominent CTA pill on action cards */}
                      {s.status === 'action' && (
                        <span style={{ marginTop: 2, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--c-08080f)', background: s.accent, borderRadius: 7, padding: '6px 11px' }}>
                          {s.cta} <i className="ti ti-arrow-right" style={{ fontSize: 12 }} aria-hidden="true" />
                        </span>
                      )}
                      {/* re-run affordance on completed builds (3 & 4) */}
                      {s.status === 'done' && (s.n === 3 || s.n === 4) && (
                        <span style={{ marginTop: 2, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: s.accent, border: `1px solid ${s.accent}`, borderRadius: 7, padding: '4px 9px' }}>
                          <i className="ti ti-refresh" style={{ fontSize: 11 }} aria-hidden="true" />{s.cta}
                        </span>
                      )}
                    </>)}
                  </div>
                );
              })}
            </div>
            {buildError && (
              <p style={{ fontSize: 11, color: 'var(--c-f87171)', margin: '8px 0 0' }}>
                <i className="ti ti-alert-triangle" style={{ marginRight: 5 }} aria-hidden="true" />{buildError}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── v7.204: Journey scope — All / Product / Pre-product. Sits directly  */}
      {/* below the summary cards (Wayne's placement). Choosing a scope re-slices  */}
      {/* the cards, the rank distribution and the keyword table together. Pre-    */}
      {/* product = problem / trigger searches (awareness only); product =         */}
      {/* solution-aware demand (full funnel) — the SAME split the Journey, Cluster */}
      {/* and Content Map panels use (single source of truth, Art II.7).           */}
      {(() => {
        const SCOPES: Array<{ key: 'all' | 'product' | 'pre'; label: string; count: number; hint: string; accent: string; dot?: boolean }> = [
          { key: 'all',     label: 'All journeys',        count: journeyCounts.all,     hint: 'Product + pre-product keywords',              accent: 'var(--c-c8c8e8)' },
          { key: 'product', label: 'Product journey',     count: journeyCounts.product, hint: 'Solution-aware demand · full funnel',          accent: 'var(--c-9b96ff)', dot: true },
          { key: 'pre',     label: 'Pre-product journey', count: journeyCounts.pre,     hint: 'Problem / trigger searches · awareness only', accent: 'var(--c-34d399)', dot: true },
        ];
        // v7.270: reframed as a prominent "Explore by journey" selector — the next
        // major area to choose. Title + cue + instruction above the existing toggle.
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 14px', borderBottom: '1px solid var(--c-111120)', background: 'var(--c-0a0a14)', flexShrink: 0 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4, flexWrap: 'wrap' }}>
                <i className="ti ti-route" style={{ fontSize: 16, color: 'var(--c-9b96ff)' }} aria-hidden="true" />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-e8e8ff)', letterSpacing: '-0.2px' }}>Explore by journey</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--c-9b96ff)', background: 'var(--ca-108-99-255-0_10)', border: '1px solid var(--ca-108-99-255-0_45)', borderRadius: 20, padding: '2px 9px' }}>
                  <i className="ti ti-pointer" style={{ fontSize: 10 }} aria-hidden="true" />Select a view
                </span>
              </div>
              <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--c-8080a8)', margin: 0, maxWidth: 680 }}>
                Choose which slice of the landscape to drill into — switching the journey re-scopes the cards, the rank split and the keyword table below.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', borderRadius: 10, padding: 3, gap: 3 }}>
              {SCOPES.map(s => {
                const on = journeyScope === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setJourneyScope(s.key); setFilter('all'); setRankFilter('all'); }}
                    title={s.hint}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      fontSize: 12, fontWeight: 600, lineHeight: 1,
                      padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                      border: 'none', outline: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
                      background: on ? 'var(--c-1e1e38)' : 'transparent',
                      boxShadow:  on ? `inset 0 0 0 1px ${s.accent}` : 'none',
                      color:      on ? s.accent : 'var(--c-9090b8)',
                    }}
                    onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-c8c8e8)'; }}
                    onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-9090b8)'; }}
                  >
                    {s.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.accent, flexShrink: 0 }} />}
                    {s.label}
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? s.accent : 'var(--c-585878)' }}>
                      {dbLoaded ? s.count.toLocaleString() : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 10, color: 'var(--c-484868)' }}>
              {journeyScope === 'pre'     ? 'Problem / trigger searches · awareness only'
             : journeyScope === 'product' ? 'Solution-aware demand · full funnel'
             :                              'Showing both journeys'}
            </span>
            </div>
          </div>
        );
      })()}

      {/* ── Rank distribution split (v7.136; client side reconciled v7.141) ── */}
      {/* Client vs a selectable competitor: keyword count + search volume + volume
          share across the same four rank bands. v7.141: the CLIENT side is built
          from clientDist — the same real keyword pool (summaryRows) that feeds the
          summary cards — so the chart's client count equals the cards' client
          count (one footprint number everywhere), instead of the older stand-alone
          positionDist aggregate which on legacy analyses could be an unbacked
          count. Competitor counts/volume = competitorDist (snapshot full-footprint
          dists, or a 0-unit fallback bucketed from gap keywords / uploaded rows
          already on the page). Bars + % are volume-driven. */}
      <RankDistributionSplit
        clientDomain={clientDomain}
        positionDist={clientDist.dist}
        positionVol={clientDist.vol}
        competitorPositionDist={competitorDist.dist}
        competitorPositionVol={competitorDist.vol}
        competitorFromFallback={competitorDist.fromFallback}
        topCompetitor={(analysis?.topCompetitor ?? null) as string | null}
      />

      {/* ── Add keyword form ── */}

      {showAdd && (
        <div className="px-5 py-3 border-b border-orbit-border shrink-0" style={{ background: 'var(--c-0b0b16)' }}>
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
        <div className="animate-pulse" style={{ height: 3, background: 'var(--ca-239-68-68-0_45)', flexShrink: 0 }} />
      )}

      {csvProgress && (
        <div style={{ background: 'var(--c-0d0d18)', borderBottom: '1px solid var(--c-1a1a30)', padding: '10px 20px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg style={{ width: 13, height: 13, animation: 'spin 1s linear infinite', flexShrink: 0, color: 'var(--c-6c63ff)' }} fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-8888c8)', letterSpacing: '0.01em' }}>
                Uploading keywords
              </span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-6060a0)', fontVariantNumeric: 'tabular-nums' }}>
              {csvProgress.current} <span style={{ opacity: 0.45, fontWeight: 400 }}>/ {csvProgress.total}</span>
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--c-14142a)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, var(--c-5a52e8), var(--c-8b85ff))',
              width: csvProgress.total > 0 ? `${Math.round((csvProgress.current / csvProgress.total) * 100)}%` : '0%',
              transition: 'width 0.25s ease',
              boxShadow: '0 0 10px var(--ca-108-99-255-0_7)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: 10, color: 'var(--c-404060)' }} />
            <span style={{ fontSize: 10, color: 'var(--c-4a4a70)' }}>
              {csvProgress.total > 0 ? Math.round((csvProgress.current / csvProgress.total) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* ── Rank-bucket filter pills (v7.80) ── */}
      {/* Segments live on the summary cards above; these pills filter by rank
          bucket WITHIN the active segment — both the category breakdown and
          the keyword table below respond. */}
      <div className="flex items-center gap-2 px-5 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: 'var(--c-111120)', background: 'var(--c-0a0a14)' }}>
        <span className="text-[9px] font-semibold uppercase tracking-widest mr-1" style={{ color: 'var(--c-252545)' }}>Rank filter</span>
        {([{ id: 'all' as RankFilter, label: 'All ranks', color: 'var(--c-8b85ff)' },
           ...RANK_BUCKETS.slice(0, 4).map(b => ({ id: b.id as RankFilter, label: `Ranks ${b.label}`, color: b.color }))
        ]).map(p => {
          const active = rankFilter === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setRankFilter(p.id)}
              className="text-[10px] px-3 py-1 rounded-full border transition-all flex items-center gap-1.5"
              style={{
                background:   active ? 'var(--ca-108-99-255-0_12)' : 'transparent',
                borderColor:  active ? p.color                  : 'var(--c-3a3a5c)',
                color:        active ? p.color                  : 'var(--c-8888b0)',
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
          <span className="ml-auto text-[9px]" style={{ color: 'var(--c-4a4a70)' }}>
            showing only {RANK_BUCKETS[{ p13: 0, p410: 1, p2: 2, p3p: 3 }[rankFilter]].label} within {FILTER_META[filter].label}
          </span>
        )}
        {rankFilter === 'all' && filter === 'competitorGap' && (
          <span className="ml-auto text-[9px]" style={{ color: 'var(--c-252545)' }}>
            from competitor · client not ranking
          </span>
        )}
      </div>

      {/* ── SERP feature scan moved out (v7.287) ──
          The coverage strip + scan CTA that lived here now lives in the SERP
          Features panel (its header, top-right) — the action lives where the
          data lives (Const IV.4). The scan still feeds this panel's AIO / PAA /
          Video pills via mergedScanned (the global background scan results merge
          in live through serpScanResults), so the columns are unchanged. */}

      {/* ── Category breakdown + keyword table ──
          v7.139: vertical scrolling now lives on the panel root; this wrapper
          only handles horizontal overflow for the wide table. No fixed height,
          so it flows into the root scroller and nothing gets clipped. */}
      <div className="overflow-x-auto">

        {/* Category breakdown — inside scroll so it doesn't eat fixed height above the table */}
        {cb && cb.categories && cb.categories.length > 0 && dbLoaded && (
          <KwCategorySection
            cb={cb}
            rows={segmentRows}
            rankFilter={rankFilter}
            segmentLabel={FILTER_META[filter].label}
            expectedCount={segmentRows.length}
            dropCategoryNames={dropCategoryNames}
            categoryModel={categoryModel}
            localPackKw={localPackKw}
            onDeleteRows={deleteRows}
          />
        )}

        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-orbit-border" style={{ background: 'var(--c-0d0d18)' }}>
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
            {pagedRows.map(row => (
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
                    {row.origin === 'demand' && (
                      <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded-full shrink-0" title="Surfaced by the deep-journey demand build">demand</span>
                    )}
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
        {visibleRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-orbit-border" style={{ background: 'var(--c-0d0d18)' }}>
            <span className="text-[11px] text-orbit-tertiary">
              Showing {(safePage * PAGE_SIZE + 1).toLocaleString()}–{Math.min((safePage + 1) * PAGE_SIZE, visibleRows.length).toLocaleString()} of {visibleRows.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPage(0)} disabled={safePage === 0} className="text-[11px] px-2.5 py-1 rounded border border-orbit-border text-orbit-secondary disabled:opacity-30 hover:border-orbit-accent transition-colors">« First</button>
              <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} className="text-[11px] px-2.5 py-1 rounded border border-orbit-border text-orbit-secondary disabled:opacity-30 hover:border-orbit-accent transition-colors">‹ Prev</button>
              <span className="text-[11px] text-orbit-secondary px-2">Page {(safePage + 1).toLocaleString()} of {pageCount.toLocaleString()}</span>
              <button type="button" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="text-[11px] px-2.5 py-1 rounded border border-orbit-border text-orbit-secondary disabled:opacity-30 hover:border-orbit-accent transition-colors">Next ›</button>
              <button type="button" onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1} className="text-[11px] px-2.5 py-1 rounded border border-orbit-border text-orbit-secondary disabled:opacity-30 hover:border-orbit-accent transition-colors">Last »</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer legend ── */}
      <div className="px-5 py-2.5 border-t border-orbit-border shrink-0 flex items-center gap-3 flex-wrap" style={{ background: 'var(--c-0d0d18)' }}>
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

// ─── Category hierarchy (v7.229 — real taxonomy) ─────────────────────────────
// The parent/child tree is now READ from the stored taxonomy
// (`_categoryBreakdown.categories[].parent`, surfaced as `categoryModel.parentForCategory`),
// NOT fabricated from keyword text at render time. The pre-v7.229 lexical heuristics
// (trailing-noun "families" + recurring-word "sub-categories") were removed: they
// produced semantically wrong edges — e.g. "Mortgage Rates and Calculators" filed
// under "Calculators" (shared last word) and "Credit Card" surfaced inside it — which
// violates Const II.8 (no lexical re-derivation at a read site) and III.1 (real
// parent/child categorization). The tree is now exactly two levels: a real product
// LINE (synthetic parent, ≥2 member categories) over its CATEGORY leaves; categories
// with a unique line stay top-level. When an analysis predates the taxonomy pass the
// `parent` is absent → the panel renders FLAT (honest gap, Const I.5) rather than guessing.
// Brand/location categories stay flat (navigational, not product lines). Every parent's
// metrics remain the exact arithmetic sum of its leaves (aggregateCatNode).

function catTitle(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface CatNode {
  id:       string;
  name:     string;
  type:     'procedure' | 'brand' | 'location';
  depth:    number;
  derived:  boolean;          // true = family/sub we derived; false = real LLM category
  kw:       number[];
  vol:      number[];
  posSum:   number[];
  totKw:    number;
  totVol:   number;
  own:      KeywordRow[];      // keywords held directly here (leaf / remainder)
  children: CatNode[];
}

function emptyCatNode(id: string, name: string, type: CatNode['type'], depth: number, derived: boolean): CatNode {
  return { id, name, type, depth, derived, kw: [0,0,0,0,0], vol: [0,0,0,0,0], posSum: [0,0,0,0,0], totKw: 0, totVol: 0, own: [], children: [] };
}

// Roll a node's metrics up from its OWN keywords + all child aggregates. Because
// every keyword lands in exactly one node, a parent's totals are the exact sum of
// its descendants — the rollup is arithmetic, never modeled.
function aggregateCatNode(node: CatNode): void {
  node.kw = [0,0,0,0,0]; node.vol = [0,0,0,0,0]; node.posSum = [0,0,0,0,0]; node.totKw = 0; node.totVol = 0;
  for (const r of node.own) {
    const b = bucketIndexOf(r.position);
    node.kw[b]++; node.vol[b] += r.searchVolume;
    if (r.position !== null && b < 4) node.posSum[b] += r.position;
    node.totKw++; node.totVol += r.searchVolume;
  }
  for (const c of node.children) {
    for (let i = 0; i < 5; i++) { node.kw[i] += c.kw[i]; node.vol[i] += c.vol[i]; node.posSum[i] += c.posSum[i]; }
    node.totKw += c.totKw; node.totVol += c.totVol;
  }
}

// A category as a LEAF holding its own keywords (used for brand/nav/Other and for
// procedure categories that have no real sub-clusters).
function leafCatNode(id: string, name: string, type: CatNode['type'], kws: KeywordRow[]): CatNode {
  const node = emptyCatNode(id, name, type, 0, false);
  node.own = kws;
  aggregateCatNode(node);
  return node;
}

// v7.230: split a procedure category into its REAL single-intent sub-clusters using the
// canonical topics (`topicByKw`: keyword → { key, label } from categoryModel.topics — the
// same "one cluster = one intent = one page" unit the Cluster/Journey panels use, Const
// II.7/III). NOT a lexical guess (Const II.8): the sub-cluster membership is the stored
// topic assignment. A keyword with no topic, or a topic group with a single keyword, falls
// into a "— general" remainder so every node's totals are the EXACT sum of its leaves.
// When the split would yield <2 real sub-clusters the category stays a single leaf (its
// keywords are still viewable on expand). The keywords live on `own` at the leaf level so
// the UI can reveal them at each level.
function buildCategoryNode(
  id: string,
  name: string,
  type: CatNode['type'],
  kws: KeywordRow[],
  topicByKw: Map<string, { key: string; label: string }>,
): CatNode {
  const node = emptyCatNode(id, name, type, 0, false);
  if (type !== 'procedure') { node.own = kws; aggregateCatNode(node); return node; }

  const groups = new Map<string, { label: string; rows: KeywordRow[] }>();
  const order: string[] = [];
  for (const r of kws) {
    const t = topicByKw.get(r.keyword.toLowerCase().trim());
    const key = t ? t.key : '__general__';
    let g = groups.get(key);
    if (!g) { g = { label: t ? t.label : `${name} — general`, rows: [] }; groups.set(key, g); order.push(key); }
    g.rows.push(r);
  }
  const topicKeys = order.filter(k => k !== '__general__' && (groups.get(k)!.rows.length >= 2));
  const remainder: KeywordRow[] = [];
  for (const k of order) {
    if (topicKeys.includes(k)) continue;
    remainder.push(...groups.get(k)!.rows);
  }
  // A single sub-cluster covering everything is just the category renamed → keep it a leaf.
  if (topicKeys.length === 0 || (topicKeys.length === 1 && remainder.length === 0)) {
    node.own = kws; aggregateCatNode(node); return node;
  }
  for (const k of topicKeys) {
    const g = groups.get(k)!;
    const child = emptyCatNode(id + '::t::' + k, g.label, type, 1, true);
    child.own = g.rows; aggregateCatNode(child);
    node.children.push(child);
  }
  if (remainder.length > 0) {
    const rest = emptyCatNode(id + '::general', `${name} — general`, type, 1, true);
    rest.own = remainder; aggregateCatNode(rest);
    node.children.push(rest);
  }
  node.children.sort((a, b) => b.totVol - a.totVol);
  aggregateCatNode(node);
  return node;
}

function bumpDepth(node: CatNode, delta: number): void {
  node.depth += delta;
  for (const c of node.children) bumpDepth(c, delta);
}

// Group procedure category leaves under their REAL product-line parent, read from the
// stored taxonomy (`parentOf`: lowercased category name → product-line label). A
// synthetic parent ROW is created only when ≥2 categories share a line; a category
// with a unique line — or no stored line at all (pre-v7.229 analysis) — stays top-level
// (honest gap, Const I.5). Parent metrics are the exact arithmetic sum of the leaves
// (aggregateCatNode) — nothing modeled (Const I.1). The parent is semantic, never the
// shared trailing word, so a category never nests under an unrelated sibling (Const III.1).
function buildProductLines(leaves: CatNode[], parentOf: Map<string, string>): CatNode[] {
  const groups = new Map<string, { surface: string; members: CatNode[] }>();
  const order: string[] = [];
  for (const lf of leaves) {
    const raw  = (parentOf.get(lf.name.toLowerCase().trim()) ?? '').trim();
    const line = raw || lf.name;                 // no taxonomy → its own name → top-level
    const key  = line.toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { surface: line, members: [] }; groups.set(key, g); order.push(key); }
    g.members.push(lf);
  }
  const out: CatNode[] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    if (g.members.length < 2) { out.push(...g.members); continue; }   // unique line → top-level leaf
    const parent = emptyCatNode('line:' + key, catTitle(g.surface), 'procedure', 0, true);
    for (const m of g.members) { bumpDepth(m, 1); parent.children.push(m); }
    parent.children.sort((a, b) => b.totVol - a.totVol);
    aggregateCatNode(parent);
    out.push(parent);
  }
  return out;
}

// ─── v7.231: multi-level tree from the STORED taxonomy paths ─────────────────
// Build an N-level page tree directly from each keyword's canonical PATH
// (umbrella → theme → sub → …). Every node is a page: it holds the keywords whose
// MOST-SPECIFIC home is that node (`own`) and rolls up its descendants' volume
// (aggregateCatNode). Single-child, no-own nodes collapse (Wayne: collapse instead of
// a depth cap), so a redundant umbrella with one theme disappears. No lexical guessing —
// the structure is the stored assignment (Const II.8, III.1b).
function aggregateTree(node: CatNode): void {
  for (const c of node.children) aggregateTree(c);
  aggregateCatNode(node);
}
function setTreeDepth(node: CatNode, d: number): void {
  node.depth = d;
  for (const c of node.children) setTreeDepth(c, d + 1);
}
function sortTree(nodes: CatNode[]): void {
  nodes.sort((a, b) => b.totVol - a.totVol);
  for (const n of nodes) sortTree(n.children);
}
// v7.337 (QC audit B12, Const II.7): the tree construction + single-child collapse now
// come from the ONE shared builder in lib/category/pathTree — the same module
// lib/local/serviceLines rolls the Local panel's product lines up with, so the two can
// never drift again (the local module previously re-implemented this logic by hand).
// Node ids keep the exact 'path:' + full-joined-path form (a collapsed survivor keeps
// its own full-path key, as before); metrics/depth/sort are applied here exactly as
// pre-v7.337. Output verified byte-equal old-vs-new at real scale in the v7.337
// harness. Exported for that retained harness check (Const V.6) — no behavior change.
export function buildPathTree(rows: KeywordRow[], pathOf: Map<string, string[]>): CatNode[] {
  const forest = buildCollapsedPathForest<KeywordRow>(rows, (r: KeywordRow) => pathOf.get(r.keyword.toLowerCase().trim()));
  const toCatNode = (n: PathTreeNode<KeywordRow>): CatNode => {
    const node = emptyCatNode('path:' + n.key, n.name, 'procedure', 0, true);
    node.own = n.own;
    node.children = n.children.map(toCatNode);
    return node;
  };
  const collapsed = forest.map(toCatNode);
  for (const n of collapsed) aggregateTree(n);
  collapsed.forEach(n => setTreeDepth(n, 0));
  sortTree(collapsed);
  return collapsed;
}

// Flatten a tree to the rows currently visible given the expanded set (DFS).
function flattenVisible(nodes: CatNode[], expanded: Set<string>, acc: CatNode[]): void {
  for (const n of nodes) {
    acc.push(n);
    if (n.children.length > 0 && expanded.has(n.id)) flattenVisible(n.children, expanded, acc);
  }
}

// ─── Rank distribution split (v7.136) ───────────────────────────────────────
// Two side-by-side cards: client (left) vs a selectable competitor (right).
// Each rank band shows keyword count + search volume + volume share. Bars and
// the share % are volume-driven (volume is the meaningful weight); the footer
// is page-1 share by volume. Everything reads straight from the canonical
// Semrush snapshot — nothing modeled. When a snapshot predates the volume
// fields the cards fall back to count-only. Bars share one scale so the two
// cards are directly comparable. Volume is annualized (fmtKwAnn) to match the
// Category Breakdown's "Annual Demand" convention just below.

const RANK_DIST_BANDS = [
  { key: '1-3',   label: '1–3',     color: 'var(--c-6c63ff)' },
  { key: '4-10',  label: '4–10',    color: 'var(--c-06b6d4)' },
  { key: '11-20', label: 'Page 2',  color: 'var(--c-f59e0b)' },
  { key: '21+',   label: 'Page 3+', color: 'var(--c-ef4444)' },
] as const;

function distTotal(dist: Record<string, number> | null): number {
  if (!dist) return 0;
  return RANK_DIST_BANDS.reduce((s, b) => s + (dist[b.key] ?? 0), 0);
}

function RankDistBars({
  counts, vols, volMode, sharedMax,
}: {
  counts:    Record<string, number>;
  vols:      Record<string, number> | null;
  volMode:   boolean;
  sharedMax: number;
}) {
  const metric = volMode && vols ? vols : counts;
  const total  = distTotal(metric);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {RANK_DIST_BANDS.map(b => {
        const c    = counts[b.key] ?? 0;
        const v    = vols ? (vols[b.key] ?? 0) : 0;
        const m    = metric[b.key] ?? 0;
        const pct  = total > 0 ? (m / total) * 100 : 0;
        const barW = sharedMax > 0 ? (m / sharedMax) * 100 : 0;
        return (
          <div key={b.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 6 }}>
              <span style={{ fontSize: 11, color: b.color, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: b.color, display: 'inline-block' }} />
                {b.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--c-8080b0)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {c.toLocaleString()} kw{volMode && vols ? <> · {v > 0 ? fmtKwAnn(v) : '—'}</> : null} · <span style={{ color: 'var(--c-c8c8f0)' }}>{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--c-111120)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${barW}%`, background: b.color, borderRadius: 3, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankDistributionSplit({
  clientDomain,
  positionDist,
  positionVol,
  competitorPositionDist,
  competitorPositionVol,
  competitorFromFallback = false,
  topCompetitor,
}: {
  clientDomain:           string;
  positionDist:           Record<string, number> | null;
  positionVol:            Record<string, number> | null;
  competitorPositionDist: Record<string, Record<string, number>> | null;
  competitorPositionVol:  Record<string, Record<string, number>> | null;
  competitorFromFallback?: boolean;
  topCompetitor:          string | null;
}) {
  const compDomains   = competitorPositionDist ? Object.keys(competitorPositionDist) : [];
  const defaultDomain = topCompetitor && compDomains.includes(topCompetitor) ? topCompetitor : (compDomains[0] ?? '');
  const [selDomain, setSelDomain] = useState<string>(defaultDomain);

  // Hooks must run before any early return.
  if (!positionDist || distTotal(positionDist) === 0) return null;

  const activeDomain = compDomains.includes(selDomain) ? selDomain : defaultDomain;
  const compDist     = activeDomain ? (competitorPositionDist?.[activeDomain] ?? null) : null;
  const compVol      = activeDomain ? (competitorPositionVol?.[activeDomain]  ?? null) : null;
  const hasComp      = !!compDist && distTotal(compDist) > 0;

  const volMode = !!positionVol && distTotal(positionVol) > 0;

  // Bar/share metric: volume when available, else counts.
  const clientMetric = volMode ? positionVol! : positionDist;
  const compMetric   = volMode ? (compVol ?? compDist) : compDist;

  const sharedMax = Math.max(
    ...RANK_DIST_BANDS.map(b => clientMetric[b.key] ?? 0),
    ...(hasComp && compMetric ? RANK_DIST_BANDS.map(b => compMetric[b.key] ?? 0) : []),
    1,
  );

  const clientCount   = distTotal(positionDist);
  const clientMetTot  = distTotal(clientMetric);
  const clientP1      = (clientMetric['1-3'] ?? 0) + (clientMetric['4-10'] ?? 0);
  const clientP1Pct   = clientMetTot > 0 ? (clientP1 / clientMetTot) * 100 : 0;

  const compCount     = distTotal(compDist);
  const compMetTot    = compMetric ? distTotal(compMetric) : 0;
  const compP1        = compMetric ? (compMetric['1-3'] ?? 0) + (compMetric['4-10'] ?? 0) : 0;
  const compP1Pct     = compMetTot > 0 ? (compP1 / compMetTot) * 100 : 0;

  const cardBase = {
    background: 'var(--c-0a0a14)', border: '1px solid var(--c-1a1a30)', borderRadius: 8, padding: '12px 14px',
  };
  const p1Label = volMode ? 'Page 1 share (vol)' : 'Page 1 share';

  return (
    <div style={{ borderBottom: '1px solid var(--c-111120)', background: 'var(--c-07070f)', padding: '12px 14px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-9090c0)', letterSpacing: '.04em' }}>Rank Distribution</span>
        <span style={{ fontSize: 9, color: 'var(--c-3a3a5c)', letterSpacing: '.04em' }}>
          {volMode ? 'kw · annual vol · % of footprint vol · shared scale' : 'kw · % of footprint · shared scale'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Client card */}
        <div style={cardBase}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <i className="ti ti-user-search" style={{ fontSize: 13, color: 'var(--c-8b85ff)' }} aria-hidden="true" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-c8c8f0)' }}>Client</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-6060a0)', marginBottom: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {extractBrand(clientDomain) || clientDomain || '—'} · {clientCount.toLocaleString()} kw{volMode ? <> · {fmtKwAnn(clientMetTot)} vol</> : null}
          </div>
          <RankDistBars counts={positionDist} vols={positionVol} volMode={volMode} sharedMax={sharedMax} />
          <div style={{ marginTop: 12, paddingTop: 9, borderTop: '1px solid var(--c-14142a)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--c-55557a)' }}>{p1Label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-8b85ff)', fontVariantNumeric: 'tabular-nums' }}>{clientP1Pct.toFixed(1)}%</span>
          </div>
        </div>

        {/* Competitor card */}
        <div style={cardBase}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <i className="ti ti-users-group" style={{ fontSize: 13, color: 'var(--c-f59e0b)' }} aria-hidden="true" />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-c8c8f0)' }}>Competitor</span>
            </div>
            {compDomains.length > 1 && (
              <select
                value={activeDomain}
                onChange={e => setSelDomain(e.target.value)}
                title="Choose competitor"
                style={{
                  fontSize: 10, color: 'var(--c-c8c8f0)', background: 'var(--c-111120)', border: '1px solid var(--c-2a2a45)',
                  borderRadius: 5, padding: '2px 6px', maxWidth: 130, outline: 'none', cursor: 'pointer',
                }}
              >
                {compDomains.map(d => (
                  <option key={d} value={d} style={{ background: 'var(--c-0a0a14)' }}>{extractBrand(d) || d}</option>
                ))}
              </select>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--c-6060a0)', marginBottom: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {hasComp
              ? <>{extractBrand(activeDomain) || activeDomain} · {compCount.toLocaleString()} kw{volMode && compVol ? <> · {fmtKwAnn(compMetTot)} vol</> : null}</>
              : <>competitor footprint</>}
          </div>

          {hasComp ? (
            <>
              <RankDistBars counts={compDist!} vols={compVol} volMode={volMode && !!compVol} sharedMax={sharedMax} />
              <div style={{ marginTop: 12, paddingTop: 9, borderTop: '1px solid var(--c-14142a)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--c-55557a)' }}>{volMode && compVol ? 'Page 1 share (vol)' : 'Page 1 share'}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-f59e0b)', fontVariantNumeric: 'tabular-nums' }}>{compP1Pct.toFixed(1)}%</span>
              </div>
              {competitorFromFallback && (
                <div style={{ marginTop: 7, fontSize: 9, color: 'var(--c-3a3a5c)', lineHeight: 1.4 }}>
                  computed from competitor keywords already on file · 0 Semrush units
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 6, padding: '20px 8px', minHeight: 120 }}>
              <i className="ti ti-refresh" style={{ fontSize: 18, color: 'var(--c-3a3a5c)' }} aria-hidden="true" />
              <span style={{ fontSize: 11, color: 'var(--c-6060a0)', lineHeight: 1.5 }}>
                Re-run the analysis to populate the<br />competitor rank distribution.
              </span>
              <span style={{ fontSize: 9, color: 'var(--c-3a3a5c)' }}>computed from data already pulled · 0 extra Semrush units</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KwCategorySection({
  cb,
  rows,
  rankFilter,
  segmentLabel,
  expectedCount,
  dropCategoryNames,
  categoryModel,
  localPackKw,
  onDeleteRows,
}: {
  cb:            KwCategoryBreakdown;
  rows:          KeywordRow[];
  rankFilter:    RankFilter;
  segmentLabel:  string;
  expectedCount: number;
  dropCategoryNames: Set<string>;   // v7.226: competitor-brand categories to suppress (Const III.1a)
  categoryModel: CategoryModel;     // v7.227: canonical categories + stored membership (shared source)
  localPackKw?:  Set<string>;       // v7.286: lowercased keywords whose SERP shows a Local Pack
  onDeleteRows?: (rows: KeywordRow[]) => Promise<void>;   // v7.271: destructive delete of a node's / a keyword's rows
}) {
  // ── Expand/collapse state — collapsed by default (parents only). Hooks run
  //    unconditionally before any early return (rules of hooks). ──
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // v7.271: delete affordance state — which node is awaiting confirm, and which id is mid-delete.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId,    setBusyId]    = useState<string | null>(null);
  // v7.339: merge-log disclosure (Const III.1e — auto-applied merges stay visible).
  const [showMergeLog, setShowMergeLog] = useState(false);
  const mergeLog = Array.isArray(cb?.mergeLog) ? cb.mergeLog : [];
  const runDelete = async (id: string, rowsToDelete: KeywordRow[]) => {
    if (!onDeleteRows || rowsToDelete.length === 0) { setConfirmId(null); return; }
    setBusyId(id);
    try { await onDeleteRows(rowsToDelete); }
    finally { setBusyId(null); setConfirmId(null); }
  };

  // ── Build the hierarchy: a sub-category tree per LLM category, then nest
  //    procedure categories into derived families. Every metric rolls up
  //    arithmetically (aggregateCatNode) so a parent === the exact sum of its
  //    descendants — defensible, nothing modeled. ──
  const { procedureTop, navTop, otherTop } = useMemo(() => {
    // v7.227: types + membership come from the shared canonical model (same source as the
    // Cluster/Journey/Content panels). demand/problem parent types render as procedure.
    const typeByName: Record<string, 'procedure' | 'brand' | 'location'> = {};
    for (const c of categoryModel.categories) typeByName[c.name] = (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure';

    // v7.230: keyword → its canonical single-intent sub-cluster (topic), first-topic-wins
    // to match categoryForKeyword. Drives the real Category → sub-cluster drill-down.
    const topicByKw = new Map<string, { key: string; label: string }>();
    for (const t of categoryModel.topics) {
      for (const kw of t.keywords) {
        const k = (kw.keyword ?? '').toLowerCase().trim();
        if (!k || topicByKw.has(k)) continue;
        topicByKw.set(k, { key: t.id, label: t.product || t.parentName });
      }
    }

    const catRows = new Map<string, KeywordRow[]>();
    for (const row of rows) {
      // Canonical STORED membership (Const II.8) — never re-derived by string match here.
      const raw = categoryModel.categoryForKeyword.get(row.keyword.toLowerCase().trim()) ?? 'Other';
      // Defensive: a competitor-brand category can never reach here (the model is already
      // guarded), but keep the v7.226 reroute so a stray name still collapses into "Other".
      const catName = dropCategoryNames.has(raw) ? 'Other' : raw;
      let arr = catRows.get(catName); if (!arr) { arr = []; catRows.set(catName, arr); }
      arr.push(row);
    }

    // v7.231: when the analysis carries the stored multi-level taxonomy, build the
    // procedure tree straight from each keyword's PATH (umbrella → theme → sub → …),
    // every node a page. Otherwise fall back to the v7.230 2-level view (honest gap I.5).
    const hasPaths = categoryModel.keywordPaths.size > 0;

    const procLeaves: CatNode[] = [], navLeaves: CatNode[] = [], otherLeaves: CatNode[] = [];
    const procRows: KeywordRow[] = [];
    for (const [name, kws] of Array.from(catRows.entries())) {
      if (name !== 'Other' && dropCategoryNames.has(name)) continue;   // v7.226: defensive — never form a competitor-brand leaf
      const type: CatNode['type'] = name === 'Other' ? 'procedure' : (typeByName[name] ?? 'procedure');
      if (name !== 'Other' && type === 'procedure') {
        if (hasPaths) { procRows.push(...kws); continue; }              // path tree consumes these rows
        procLeaves.push(buildCategoryNode('cat:' + name, name, type, kws, topicByKw));
        continue;
      }
      const node = leafCatNode('cat:' + name, name, type, kws);
      if (name === 'Other') otherLeaves.push(node);
      else navLeaves.push(node);
    }
    const proc = hasPaths
      ? buildPathTree(procRows, categoryModel.keywordPaths)
      : buildProductLines(procLeaves, categoryModel.parentForCategory).sort((a, b) => b.totVol - a.totVol);
    navLeaves.sort((a, b) => b.totVol - a.totVol);
    return { procedureTop: proc, navTop: navLeaves, otherTop: otherLeaves };
  }, [rows, categoryModel, dropCategoryNames]);

  const allTop = procedureTop.concat(navTop, otherTop);
  if (allTop.length === 0) return null;

  // v7.235: how many of the shown keywords the LLM flagged low-confidence (Const III.7).
  let needsReviewCount = 0;
  if (categoryModel.keywordMeta.size > 0) {
    for (const r of rows) if (categoryModel.keywordMeta.get(r.keyword.toLowerCase().trim())?.needsReview) needsReviewCount++;
  }

  const maxVol = Math.max(...allTop.map(n => n.totVol), 1);
  const selIdx = rankFilter === 'all' ? null : RANK_SEL_INDEX[rankFilter];

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── Overall rollup (respects rank filter). Summing the TOP-LEVEL nodes counts
  //    each keyword exactly once (families already sum their members). ──
  let tKw = 0, tVol = 0, tP1 = 0;
  for (const c of allTop) {
    tKw  += selIdx === null ? c.totKw  : c.kw[selIdx];
    tVol += selIdx === null ? c.totVol : c.vol[selIdx];
    tP1  += selIdx === null ? c.vol[0] + c.vol[1] : (selIdx <= 1 ? c.vol[selIdx] : 0);
  }
  const overallShare = tVol > 0 ? (tP1 / tVol) * 100 : 0;
  const balanced     = selIdx === null && tKw === expectedCount;

  // v7.366: G9 insight — big-category underperformance, computed over the SAME
  // guarded top-level category nodes this table renders (Const III.1a via the
  // model; II.6 — no forked math). Uses UNFILTERED totals (rank filter never
  // changes the stated finding) and excludes the "Other" gap bucket so "your
  // biggest categories" means real product categories. page-1 volume = rank
  // bands 1–3 + 4–10, the same tP1 convention as the header chip.
  const catInsight = bigCategoryInsight({
    cats: allTop
      .filter(c => c.name !== 'Other' && c.type === 'procedure')
      .map(c => ({ name: c.name, monthlyDemand: c.totVol, page1Demand: c.vol[0] + c.vol[1] })),
    overallShare: overallShare / 100,
  });

  const renderTree = (nodes: CatNode[], dimmed: boolean) => {
    const flat: CatNode[] = [];
    flattenVisible(nodes, expanded, flat);
    return flat.map(n => (
      <KwCatRow
        key={n.id}
        cat={n}
        depth={n.depth}
        hasChildren={n.children.length > 0}
        canRevealKeywords={n.own.length > 0}
        expanded={expanded.has(n.id)}
        onToggle={() => toggle(n.id)}
        selIdx={selIdx}
        maxVol={maxVol}
        dimmed={dimmed}
        metaOf={categoryModel.keywordMeta}
        localPack={!!localPackKw && localPackKw.size > 0 && n.own.some(r => localPackKw.has(String(r.keyword || '').toLowerCase()))}   // v7.348: node-precise — badge only nodes whose OWN keyword carries the real Semrush Fl local-pack flag, not a subtree roll-up (Wayne 2026-07-04)
        canDelete={!!onDeleteRows}
        confirmId={confirmId}
        busyId={busyId}
        onAskConfirm={(id: string) => setConfirmId(id)}
        onCancelConfirm={() => setConfirmId(null)}
        onConfirmDelete={runDelete}
      />
    ));
  };

  return (
    <div style={{ borderBottom: '1px solid var(--c-111120)', background: 'var(--c-07070f)' }}>
      {/* v7.366: G9 insight sentence above the category table */}
      {catInsight && (
        <div style={{ padding: '10px 20px 0' }}>
          <InsightBanner insight={catInsight} />
        </div>
      )}
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-9090c0)', letterSpacing: '.04em' }}>Category Breakdown</span>
          <span style={{ fontSize: '9px', padding: '1px 7px', borderRadius: 20, background: 'var(--ca-108-99-255-0_1)', border: '1px solid var(--ca-108-99-255-0_25)', color: 'var(--c-8080c0)' }}>
            {overallShare.toFixed(1)}% page 1 capture · {segmentLabel}
          </span>
          {needsReviewCount > 0 && (
            <span
              title="Keywords the AI flagged low-confidence (< 80% self-estimate) for human review — Const III.7"
              style={{ fontSize: '9px', padding: '1px 7px', borderRadius: 20, background: 'var(--ca-245-158-11-0_12, rgba(245,158,11,0.12))', border: '1px solid var(--amber)', color: 'var(--amber)' }}
            >
              {needsReviewCount.toLocaleString()} needs review
            </span>
          )}
          {mergeLog.length > 0 && (
            <button
              onClick={() => setShowMergeLog(v => !v)}
              title="Category merges auto-applied during this build (duplicate labels unified, subsumed categories re-parented) — click to inspect. Const III.1e"
              style={{ fontSize: '9px', padding: '1px 7px', borderRadius: 20, background: 'var(--ca-108-99-255-0_1)', border: '1px solid var(--ca-108-99-255-0_25)', color: 'var(--c-8080c0)', cursor: 'pointer' }}
            >
              {mergeLog.length.toLocaleString()} merged {showMergeLog ? '▾' : '▸'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {RANK_BUCKETS.map(b => (
            <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '9px', color: b.id === 'unr' ? 'var(--c-55557a)' : b.color }}>
              <span style={{ width: 6, height: 6, borderRadius: 1, background: b.color, display: 'inline-block' }} />
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* v7.339: merge log — every auto-applied taxonomy merge, inspectable (Const III.1e) */}
      {showMergeLog && mergeLog.length > 0 && (
        <div style={{ margin: '2px 20px 6px', maxHeight: 170, overflowY: 'auto', border: '1px solid var(--c-111120)', borderRadius: 6, background: 'var(--c-07070f)' }}>
          {mergeLog.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 10px', borderBottom: i < mergeLog.length - 1 ? '1px solid var(--c-0e0e1e)' : 'none' }}>
              <span style={{ fontSize: '8px', fontWeight: 600, flexShrink: 0, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: m.kind === 'reparent' ? 'var(--amber)' : 'var(--c-55557a)' }}>
                {m.kind === 'reparent' ? 'moved' : 'relabeled'}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--c-55557a)', textDecoration: 'line-through' }}>{m.from}</span>
              <span style={{ fontSize: '10px', color: 'var(--c-404060)' }}>→</span>
              <span style={{ fontSize: '10px', color: 'var(--c-a0a0c8)' }}>{m.to}</span>
            </div>
          ))}
        </div>
      )}

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 105px 80px 52px 60px 100px', padding: '4px 20px 4px', borderBottom: '1px solid var(--c-0e0e1e)' }}>
        {[
          { label: 'Category',       align: 'left'   },
          { label: 'Annual Demand',  align: 'right'  },
          { label: 'Page 1',         align: 'right'  },
          { label: 'Share',          align: 'right'  },
          { label: 'Avg Pos',        align: 'right'  },
          { label: 'Keywords',       align: 'center' },
        ].map(h => (
          <span key={h.label} style={{ fontSize: '9px', fontWeight: 500, color: 'var(--c-404060)', textTransform: 'uppercase' as const, letterSpacing: '.06em', textAlign: h.align as any }}>
            {h.label}
          </span>
        ))}
      </div>

      {/* Procedure rows (tree: families → categories → sub-categories) */}
      {procedureTop.length > 0 && (
        <div style={{ padding: '4px 20px 2px' }}>
          <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--c-383858)', letterSpacing: '.08em', textTransform: 'uppercase' as const }}>Procedure Lines</span>
        </div>
      )}
      {renderTree(procedureTop, false)}

      {/* Brand & navigation rows */}
      {navTop.length > 0 && (
        <div style={{ padding: '6px 20px 2px', borderTop: '1px solid var(--c-0e0e1e)', marginTop: 2 }}>
          <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--c-383858)', letterSpacing: '.08em', textTransform: 'uppercase' as const }}>Brand &amp; Navigation</span>
        </div>
      )}
      {renderTree(navTop, true)}

      {/* Other / uncategorized — always last */}
      {renderTree(otherTop, true)}

      {/* Overall rollup */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 105px 80px 52px 60px 100px', alignItems: 'center', padding: '6px 20px 8px', borderTop: '1px solid var(--c-111120)' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-a0a0c8)' }}>
          Overall{selIdx !== null && <span style={{ fontWeight: 400, color: 'var(--c-55557a)' }}> · {RANK_BUCKETS[selIdx].label} only</span>}
        </span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-a0a0c8)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tVol > 0 ? fmtKwAnn(tVol) : '—'}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-8b85ff)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tP1 > 0 ? fmtKwAnn(tP1) : '—'}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--c-6c63ff)', textAlign: 'right' }}>{tVol > 0 ? `${overallShare.toFixed(1)}%` : '—'}</span>
        <span />
        <span style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: balanced ? 'var(--c-34d399)' : 'var(--c-8080c0)', fontVariantNumeric: 'tabular-nums' }}>
            {tKw.toLocaleString()}{balanced ? ' ✓' : ''}
          </span>
        </span>
      </div>
    </div>
  );
}

// v7.271: gather every keyword row held under a node (its own + all descendants),
// de-duped by row key. Used by the destructive category/sub-category delete.
function collectOwnKeywords(node: CatNode): KeywordRow[] {
  const out = new Map<string, KeywordRow>();
  const walk = (n: CatNode) => {
    for (const k of n.own) out.set(k.key, k);
    for (const c of n.children) walk(c);
  };
  walk(node);
  return Array.from(out.values());
}

function KwCatRow({
  cat,
  selIdx,
  maxVol,
  dimmed,
  depth = 0,
  hasChildren = false,
  canRevealKeywords = false,
  expanded = false,
  onToggle,
  metaOf,
  localPack = false,
  canDelete = false,
  confirmId = null,
  busyId = null,
  onAskConfirm,
  onCancelConfirm,
  onConfirmDelete,
}: {
  cat:               CatNode;
  selIdx:            number | null;   // null = all ranks; 0–3 = selected bucket
  maxVol:            number;
  dimmed:            boolean;
  depth?:            number;          // v7.191: tree depth (0 = top-level parent/category)
  hasChildren?:      boolean;
  canRevealKeywords?: boolean;        // v7.230: leaf with own keywords → expand to chips
  expanded?:         boolean;
  onToggle?:         () => void;
  metaOf?:           Map<string, KeywordMeta>;   // v7.235: per-keyword classification metadata (Const III.7)
  localPack?:        boolean;                     // v7.286: ≥1 keyword under this node triggers a Google Local Pack (real Semrush Fl)
  canDelete?:        boolean;                     // v7.271: show delete affordances
  confirmId?:        string | null;              // v7.271: node id awaiting delete-confirm
  busyId?:           string | null;              // v7.271: id currently being deleted
  onAskConfirm?:     (id: string) => void;
  onCancelConfirm?:  () => void;
  onConfirmDelete?:  (id: string, rows: KeywordRow[]) => void;
}) {
  const clickable = hasChildren || canRevealKeywords;
  // v7.271: every keyword held under this node (own + all descendants) — the rows a
  // category/sub-category delete removes (destructive, Wayne's decision). Exact subtree.
  const nodeKeywords = canDelete ? collectOwnKeywords(cat) : [];
  const confirming   = confirmId === cat.id;
  const deleting     = busyId === cat.id;
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

  // v7.191: tree presentation — top-level rows (depth 0) read as parents (bold);
  // deeper derived sub-rows are lighter and indented. A disclosure chevron toggles
  // children; the whole row is the click target when it has any.
  const isParent  = depth === 0;
  const nameWeight = isParent ? 600 : 400;
  const nameColor  = dimmed
    ? 'var(--c-9090b8)'
    : isParent ? 'var(--c-e6e6ff)' : 'var(--c-b0b0d8)';

  // v7.230: the actual keywords held at this leaf, largest demand first — revealed as
  // chips when the row is expanded (Const I.1 — each is a real source row).
  const ownSorted = canRevealKeywords ? cat.own.slice().sort((a, b) => b.searchVolume - a.searchVolume) : [];

  return (
    <>
    <div
      onClick={clickable ? onToggle : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 105px 80px 52px 60px 100px',
        alignItems: 'center',
        padding: '5px 20px',
        borderBottom: '1px solid var(--ca-255-255-255-0_03)',
        opacity: dimmed ? 0.6 : 1,
        cursor: clickable ? 'pointer' : 'default',
        userSelect: clickable ? 'none' : 'auto',
        background: depth > 0 ? 'var(--ca-255-255-255-0_02)' : 'transparent',
      }}
    >
      {/* Disclosure chevron + category name + stacked rank-bucket bar */}
      <div style={{ minWidth: 0, paddingRight: 10, paddingLeft: depth * 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        {clickable ? (
          <i
            className="ti ti-chevron-right"
            style={{ fontSize: 12, color: 'var(--c-6060a0)', flex: '0 0 auto', transition: 'transform .15s ease', transform: expanded ? 'rotate(90deg)' : 'none' }}
            aria-hidden="true"
          />
        ) : (
          <span style={{ width: 12, flex: '0 0 auto' }} aria-hidden="true" />
        )}
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ fontSize: '12px', fontWeight: nameWeight, color: nameColor, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cat.name}
            {localPack && (
              <span
                title="At least one keyword here triggers a Google local map pack (real Semrush SERP-feature data)"
                style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '.04em', color: 'var(--c-46cce0)', background: 'var(--ca-6-182-212-0_13)', border: '1px solid var(--ca-6-182-212-0_25)', borderRadius: 4, padding: '1px 5px', marginLeft: 6, textTransform: 'uppercase', whiteSpace: 'nowrap' }}
              >📍 Local pack</span>
            )}
            {hasChildren
              ? <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--c-55557a)', marginLeft: 6 }}>{cat.children.length}</span>
              : (canRevealKeywords && <span style={{ fontSize: '9px', fontWeight: 500, color: 'var(--c-55557a)', marginLeft: 6 }}>{cat.own.length} kw</span>)}
          </span>
          <div style={{ marginTop: '4px', height: '5px', width: `${barW}%`, background: 'var(--c-111120)', borderRadius: '2px', overflow: 'hidden', display: 'flex' }}>
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
      </div>
      {/* Annual demand (bucket-aware) */}
      <span style={{ fontSize: '11px', color: 'var(--c-7070a0)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {dispVol > 0 ? fmtKwAnn(dispVol) : '—'}
      </span>
      {/* Page 1 (bucket-aware) */}
      <span style={{ fontSize: '11px', fontWeight: p1Disp > 0 ? 600 : 400, color: p1Disp > 0 ? (dimmed ? 'var(--c-505070)' : 'var(--c-8b85ff)') : 'var(--c-333350)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {p1Disp > 0 ? fmtKwAnn(p1Disp) : '—'}
      </span>
      {/* Share of category demand */}
      <span style={{ fontSize: '12px', fontWeight: 600, color: share > 0 ? (dimmed ? 'var(--c-505070)' : 'var(--c-e0e0ff)') : 'var(--c-333350)', textAlign: 'right' }}>
        {share > 0 ? `${share.toFixed(1)}%` : '—'}
      </span>
      {/* Avg position */}
      <span style={{ fontSize: '11px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: avgPos === null ? 'var(--c-333350)' : avgPos <= 3 ? 'var(--c-6c63ff)' : avgPos <= 10 ? 'var(--c-06b6d4)' : avgPos <= 20 ? 'var(--c-f59e0b)' : 'var(--c-ef4444)' }}>
        {avgPos !== null ? avgPos.toFixed(1) : '—'}
      </span>
      {/* Keyword count (bucket-aware) + v7.271 delete affordance */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {dispKw > 0 ? (
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-8080c0)', background: 'var(--c-0f0f1e)', border: '1px solid var(--c-1e1e30)', borderRadius: 4, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>
            {dispKw.toLocaleString()}
          </span>
        ) : (
          <span style={{ fontSize: '10px', color: 'var(--c-282838)' }}>—</span>
        )}
        {canDelete && nodeKeywords.length > 0 && !confirming && (
          <button
            type="button"
            title={`Delete this ${depth === 0 ? 'category' : 'sub-category'} and its ${nodeKeywords.length} keyword${nodeKeywords.length === 1 ? '' : 's'}`}
            aria-label={`Delete ${cat.name} and its ${nodeKeywords.length} keywords`}
            disabled={deleting}
            onClick={e => { e.stopPropagation(); onAskConfirm?.(cat.id); }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 5, border: '1px solid var(--c-2a2a40)', background: 'transparent', color: 'var(--c-8a8aa8)', cursor: deleting ? 'default' : 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-f87171)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-f87171)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-8a8aa8)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-2a2a40)'; }}
          >
            <i className="ti ti-trash" style={{ fontSize: 11 }} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>

    {/* v7.271: destructive-delete confirm strip for this category / sub-category. */}
    {canDelete && confirming && (
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 20px', paddingLeft: depth * 16 + 38, background: 'var(--ca-248-113-113-0_2)', borderBottom: '1px solid var(--ca-255-255-255-0_03)' }}
      >
        <span style={{ fontSize: 11, color: 'var(--c-f87171)', fontWeight: 600 }}>
          Delete &ldquo;{cat.name}&rdquo; and its {nodeKeywords.length} keyword{nodeKeywords.length === 1 ? '' : 's'} permanently?
        </span>
        <button type="button" disabled={deleting}
          onClick={() => onConfirmDelete?.(cat.id, nodeKeywords)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: 'var(--c-f87171)', background: 'transparent', border: '1px solid var(--c-f87171)', borderRadius: 6, padding: '4px 9px', cursor: deleting ? 'default' : 'pointer' }}>
          <i className={`ti ${deleting ? 'ti-loader-2' : 'ti-trash'}`} style={{ fontSize: 11 }} aria-hidden="true" />{deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button type="button" disabled={deleting}
          onClick={() => onCancelConfirm?.()}
          style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--c-9090b8)', background: 'transparent', border: '1px solid var(--c-2a2a40)', borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    )}

    {/* v7.230: expanded leaf → the real keywords for this level, as chips. Each chip is a
        source row (keyword · annual demand); rank-colored dot = client position bucket. */}
    {expanded && canRevealKeywords && (
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          padding: '6px 20px 8px',
          paddingLeft: depth * 16 + 38,
          background: 'var(--ca-255-255-255-0_02)',
          borderBottom: '1px solid var(--ca-255-255-255-0_03)',
          opacity: dimmed ? 0.6 : 1,
        }}
      >
        {ownSorted.map(k => {
          const b = bucketIndexOf(k.position);
          const dotColor = k.position === null ? 'var(--c-55557a)' : RANK_BUCKETS[b].color;
          // v7.235: classification metadata for this keyword (Const III.7). confidence is the
          // LLM's self-estimate — labeled as an estimate in the tooltip, NOT a measured metric.
          const meta = metaOf?.get(k.keyword.toLowerCase().trim());
          const review = meta?.needsReview === true;
          const titleParts = [k.position !== null ? `position ${k.position}` : 'not ranking'];
          if (meta?.modifier)        titleParts.push(`modifier: ${meta.modifier}`);
          if (meta?.intent)          titleParts.push(`intent: ${meta.intent}`);
          if (meta?.confidence != null) titleParts.push(`confidence: ${meta.confidence}% (LLM estimate)`);
          if (meta?.reasoning)       titleParts.push(`why: ${meta.reasoning}`);
          return (
            <span
              key={k.key}
              title={titleParts.join('  ·  ')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '11px', color: 'var(--c-b0b0d8)',
                background: 'var(--c-0f0f1e)',
                border: `1px solid ${review ? 'var(--amber)' : 'var(--c-1e1e30)'}`,
                borderRadius: 4, padding: '2px 8px', maxWidth: '100%',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flex: '0 0 auto' }} aria-hidden="true" />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{k.keyword}</span>
              {meta?.modifier && (
                <span style={{ fontSize: '9px', color: 'var(--c-7070a0)', background: 'var(--ca-108-99-255-0_1)', borderRadius: 3, padding: '0 4px' }}>{meta.modifier}</span>
              )}
              {meta?.confidence != null && (
                <span title="LLM confidence estimate (not a measured metric)" style={{ fontSize: '9px', color: review ? 'var(--amber)' : 'var(--c-55557a)', fontVariantNumeric: 'tabular-nums' }}>
                  {meta.confidence}%{review ? ' ⚠' : ''}
                </span>
              )}
              <span style={{ color: 'var(--c-55557a)', fontVariantNumeric: 'tabular-nums' }}>{fmtKwAnn(k.searchVolume)}</span>
              {canDelete && (() => {
                const chipBusy = busyId === 'kw:' + k.key;
                return (
                  <button
                    type="button"
                    title={`Delete keyword "${k.keyword}"`}
                    aria-label={`Delete keyword ${k.keyword}`}
                    disabled={chipBusy}
                    onClick={e => { e.stopPropagation(); onConfirmDelete?.('kw:' + k.key, [k]); }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, marginLeft: 1, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-55557a)', cursor: chipBusy ? 'default' : 'pointer', flex: '0 0 auto' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-f87171)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-55557a)'; }}
                  >
                    <i className={`ti ${chipBusy ? 'ti-loader-2' : 'ti-x'}`} style={{ fontSize: 11 }} aria-hidden="true" />
                  </button>
                );
              })()}
            </span>
          );
        })}
      </div>
    )}
    </>
  );
}
