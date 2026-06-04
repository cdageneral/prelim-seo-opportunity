'use client';
import { useState, useMemo, useEffect } from 'react';
import { buildKwPool } from '@/lib/utils/kwVolume';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SerpKw {
  keyword:          string;
  serpFeatures:     string[];
  hasAIO:           boolean;
  paaQuestions:     string[];
  paaClientCited:   boolean;
  videoClientCited: boolean;
  clientRank:       number | null;
  featuredSnippet?: any;
}

interface SemKw {
  keyword:      string;
  position:     number | null;  // null = ranked but position not yet known (CSV upload without position column)
  searchVolume: number;
  branded?:     boolean;
}

// DB keywords from project_keywords table (CSV uploads, custom, blocked)
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

type BucketKey = 'all' | '1-3' | '4-10' | '11-20' | '21+';

// ── Category breakdown types (mirrors MarketGapSection) ────────────────────────
interface CategoryRow {
  name:          string;
  type:          'procedure' | 'brand' | 'location';
  monthlyDemand: number;
  page1Demand:   number;
  top3Demand:    number;
}

interface CategoryBreakdown {
  categories:            CategoryRow[];
  totalMonthlyDemand:    number;
  totalPage1Demand:      number;
  keywordCategories:     Record<string, string>;  // lowercase kw → category name
}

// Per-category rank statistics computed from the live topKws list
interface CatRankStats {
  count:      number;
  posSum:     number;
  monthlyVol: number;  // sum of searchVolume for all matched ranked keywords
  page1Vol:   number;  // sum of searchVolume for pos ≤ 10 keywords
  dist:       Record<string, number>;  // '1-3' | '4-10' | '11-20' | '21+'
}

interface Props {
  analysis:               any;
  projectId:              string;
  domain?:                string;
  competitors?:           string[];
  defaultClientThreshold?: number;  // min monthly vol for ranked keywords — must match KeywordsPanel
  defaultCompetitorThreshold?: number;  // min monthly vol for gap keywords — must match KeywordsPanel
}

// ── Constants ──────────────────────────────────────────────────────────────────

const POSITION_BUCKETS = [
  { key: '1-3',   label: 'Pos 1–3',  hex: '#6C63FF', min: 1,  max: 3    },
  { key: '4-10',  label: 'Pos 4–10', hex: '#06B6D4', min: 4,  max: 10   },
  { key: '11-20', label: 'Page 2',   hex: '#F59E0B', min: 11, max: 20   },
  { key: '21+',   label: 'Page 3+',  hex: '#EF4444', min: 21, max: 9999 },
];

const FEATURE_META: Record<string, { label: string; color: string }> = {
  ai_overview:      { label: 'AIO',      color: '#6C63FF' },
  featured_snippet: { label: 'Snippet',  color: '#22C55E' },
  knowledge_panel:  { label: 'KP',       color: '#F59E0B' },
  local_pack:       { label: 'Local',    color: '#EF4444' },
  shopping:         { label: 'Shop',     color: '#F97316' },
  video_carousel:   { label: 'Video',    color: '#06B6D4' },
  image_pack:       { label: 'Images',   color: '#8B5CF6' },
  twitter_pack:     { label: 'Twitter',  color: '#1DA1F2' },
};

const CHART_H    = 100;
const CHART_W    = 280;
const BAR_W      = 36;
const Y_AXIS_W   = 30;  // x-offset for y-axis labels; bars are laid out in [Y_AXIS_W, CHART_W]
const COL_STEP   = (CHART_W - Y_AXIS_W) / POSITION_BUCKETS.length;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function fmtAnnual(monthly: number): string {
  return fmtVol(monthly * 12);
}

function bucketHex(pos: number): string {
  if (pos <= 3)  return '#6C63FF';
  if (pos <= 10) return '#06B6D4';
  if (pos <= 20) return '#F59E0B';
  return '#EF4444';
}

function buildPositionDist(kws: SemKw[]): Record<string, number> {
  const dist: Record<string, number> = { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 };
  for (const kw of kws) {
    const pos = kw.position;
    if (pos === null) continue;   // skip keywords without a known position
    if (pos <= 3)       dist['1-3']++;
    else if (pos <= 10) dist['4-10']++;
    else if (pos <= 20) dist['11-20']++;
    else                dist['21+']++;
  }
  return dist;
}

// ── Category inference ─────────────────────────────────────────────────────────
// Maps a keyword to a category name using three tiers:
//   1. Exact lookup in keywordCategories (the 40-keyword MVP map from synthesis)
//   2. ALL significant words (4+ chars) of the category appear in the keyword
//      → sorted longest-name-first so "Fat Transfer Breast Augmentation" beats "Liposuction"
//   3. ANY long word (5+ chars) from the category appears in the keyword
// This extends coverage to the full CSV keyword list without needing re-synthesis.
function inferCategoryForKw(
  keyword:          string,
  keywordCategories: Record<string, string>,
  categories:        CategoryRow[],
): string | null {
  const kwLower = keyword.toLowerCase().trim();

  // Tier 1 — exact map
  if (keywordCategories[kwLower]) return keywordCategories[kwLower];

  // Sort categories longest-name-first so specific multi-word categories win over short ones
  const byLen = [...categories].sort((a, b) => b.name.length - a.name.length);

  // Tier 2 — ALL words of category name (4+ chars) present in keyword
  for (const cat of byLen) {
    const words = cat.name.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    if (words.length > 0 && words.every(w => kwLower.includes(w))) return cat.name;
  }

  // Tier 3 — ANY long word (5+ chars) from category name present in keyword
  for (const cat of byLen) {
    const words = cat.name.toLowerCase().split(/\s+/).filter(w => w.length >= 5);
    if (words.some(w => kwLower.includes(w))) return cat.name;
  }

  return null;
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, sub2, color }: { label: string; value: string; sub: string; sub2?: string; color?: string }) {
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-1">
      <p style={{ fontSize: '11px', color: '#8888AA', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</p>
      <p style={{ fontSize: '24px', fontWeight: 700, color: color ?? '#F0F0FF', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '11px', color: '#555570' }}>{sub}</p>
      {sub2 && <p style={{ fontSize: '10px', color: '#444460', marginTop: '1px' }}>{sub2}</p>}
    </div>
  );
}

// ── Category Performance Section ──────────────────────────────────────────────

const RANK_BUCKET_META = [
  { key: '1-3',   color: '#6C63FF', label: '1–3'  },
  { key: '4-10',  color: '#06B6D4', label: '4–10' },
  { key: '11-20', color: '#F59E0B', label: 'P2'   },
  { key: '21+',   color: '#EF4444', label: 'P3+'  },
];

function fmtAnn(monthly: number): string {
  const a = monthly * 12;
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  return a.toLocaleString();
}

function CategoryPerformanceSection({
  cb,
  categoryRankStats,
  topKws,
}: {
  cb:                CategoryBreakdown;
  categoryRankStats: Record<string, CatRankStats>;
  topKws:            SemKw[];
}) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const procedureCats = cb.categories.filter(c => c.type === 'procedure');
  const navCats       = cb.categories.filter(c => c.type === 'brand' || c.type === 'location');
  if (procedureCats.length === 0 && navCats.length === 0) return null;

  // Keywords for the currently expanded category, sorted by position
  const expandedKws = useMemo(() => {
    if (!expandedCat) return [];
    return topKws
      .filter(kw => inferCategoryForKw(kw.keyword, cb.keywordCategories, cb.categories) === expandedCat)
      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
  }, [expandedCat, topKws, cb]);

  function toggle(name: string) {
    setExpandedCat(prev => (prev === name ? null : name));
  }

  return (
    <div className="orbit-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Category Performance</p>
          <p className="text-orbit-primary text-sm font-semibold mt-0.5">Demand &amp; ranking by category · click a row to expand</p>
        </div>
        <div className="flex items-center gap-3">
          {RANK_BUCKET_META.map(b => (
            <span key={b.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: b.color }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, display: 'inline-block', flexShrink: 0 }} />
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div className="grid pb-2 border-b border-orbit-border" style={{ gridTemplateColumns: '24px 1fr 110px 90px 58px 70px 120px' }}>
        {['', 'Category', 'Annual Demand', 'Page 1', 'Share', 'Avg Pos', 'Rank Split'].map((h, i) => (
          <span key={i} style={{ fontSize: '10px', color: '#555570', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '.06em', textAlign: i <= 1 ? 'left' : i === 6 ? 'center' : 'right' as const }}>
            {h}
          </span>
        ))}
      </div>

      {/* Procedure section */}
      {procedureCats.length > 0 && (
        <p style={{ fontSize: '9px', fontWeight: 600, color: '#4A4A72', letterSpacing: '.08em', textTransform: 'uppercase', padding: '6px 0 2px' }}>
          Procedure Lines
        </p>
      )}
      {procedureCats.map(cat => (
        <CatRow
          key={cat.name} cat={cat} stats={categoryRankStats[cat.name]} dimmed={false}
          isExpanded={expandedCat === cat.name} onToggle={toggle} expandedKws={expandedKws}
        />
      ))}

      {/* Brand & navigation section */}
      {navCats.length > 0 && (
        <p style={{ fontSize: '9px', fontWeight: 600, color: '#4A4A72', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 0 2px', borderTop: '1px solid #111120', marginTop: '4px' }}>
          Brand &amp; Navigation
        </p>
      )}
      {navCats.map(cat => (
        <CatRow
          key={cat.name} cat={cat} stats={categoryRankStats[cat.name]} dimmed={true}
          isExpanded={expandedCat === cat.name} onToggle={toggle} expandedKws={expandedKws}
        />
      ))}
    </div>
  );
}

// ── Category row (with expand) ─────────────────────────────────────────────────

function CatRow({
  cat, stats, dimmed, isExpanded, onToggle, expandedKws,
}: {
  cat:         CategoryRow;
  stats?:      CatRankStats;
  dimmed:      boolean;
  isExpanded:  boolean;
  onToggle:    (name: string) => void;
  expandedKws: SemKw[];
}) {
  // Use stats-derived vol data (full keyword list) for Page 1 / Share.
  // Fall back to _categoryBreakdown values if stats have no coverage.
  const page1Monthly = (stats?.page1Vol ?? 0) > 0 ? (stats?.page1Vol ?? 0) : cat.page1Demand;
  const annualDemand = cat.monthlyDemand;
  const share        = annualDemand > 0 ? (page1Monthly / annualDemand) * 100 : 0;
  const barW         = Math.max(page1Monthly > 0 ? 1 : 0, Math.min(100, share));
  const hasPage1     = page1Monthly > 0;
  const avgPos       = stats && stats.count > 0 ? stats.posSum / stats.count : null;
  const totalInCat   = stats ? Object.values(stats.dist).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      {/* Main row */}
      <div
        onClick={() => onToggle(cat.name)}
        className="grid items-center border-b border-orbit-border/40 py-2.5 cursor-pointer"
        style={{
          gridTemplateColumns: '24px 1fr 110px 90px 58px 70px 120px',
          opacity:    dimmed ? 0.55 : 1,
          background: isExpanded ? 'rgba(108,99,255,0.06)' : 'transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
        onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Chevron */}
        <span style={{ fontSize: '10px', color: isExpanded ? '#8B85FF' : '#444458', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
          ▶
        </span>

        {/* Category name + mini share bar */}
        <div>
          <span style={{ fontSize: '13px', color: dimmed ? '#666680' : (isExpanded ? '#C0B8FF' : '#F0F0FF') }}>{cat.name}</span>
          <div style={{ marginTop: '5px', height: '3px', width: '85%', background: '#1E1E2E', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${barW}%`, height: '100%', background: dimmed ? '#555570' : '#6C63FF', borderRadius: '2px', transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {/* Annual demand (total market demand from synthesis) */}
        <span style={{ fontSize: '12px', color: '#8888AA', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fmtAnn(annualDemand)}
        </span>

        {/* Page 1 (from full keyword footprint via inferCategoryForKw) */}
        <span style={{ fontSize: '12px', fontWeight: hasPage1 ? 600 : 400, color: hasPage1 ? (dimmed ? '#555570' : '#8B85FF') : '#444458', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {hasPage1 ? fmtAnn(page1Monthly) : '—'}
        </span>

        {/* Share */}
        <span style={{ fontSize: '13px', fontWeight: 600, color: hasPage1 ? (dimmed ? '#555570' : '#F0F0FF') : '#444458', textAlign: 'right' }}>
          {hasPage1 ? `${share.toFixed(1)}%` : '—'}
        </span>

        {/* Avg position */}
        <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: avgPos === null ? '#444458' : avgPos <= 3 ? '#6C63FF' : avgPos <= 10 ? '#06B6D4' : avgPos <= 20 ? '#F59E0B' : '#EF4444' }}>
          {avgPos !== null ? avgPos.toFixed(1) : '—'}
        </span>

        {/* Rank split stacked bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '8px' }}>
          {totalInCat > 0 ? (
            <>
              <div style={{ flex: 1, height: '8px', display: 'flex', borderRadius: '4px', overflow: 'hidden', gap: '1px' }}>
                {RANK_BUCKET_META.map(b => {
                  const count = stats?.dist[b.key] ?? 0;
                  const pct   = (count / totalInCat) * 100;
                  if (pct === 0) return null;
                  return (
                    <div key={b.key} title={`${b.label}: ${count} kw${count !== 1 ? 's' : ''}`}
                      style={{ width: `${pct}%`, height: '100%', background: b.color, minWidth: '3px' }} />
                  );
                })}
              </div>
              <span style={{ fontSize: '9px', color: '#555570', flexShrink: 0 }}>{totalInCat}</span>
            </>
          ) : (
            <span style={{ fontSize: '10px', color: '#333350' }}>—</span>
          )}
        </div>
      </div>

      {/* Expanded keyword sub-table */}
      {isExpanded && (
        <div style={{ background: '#070710', borderBottom: '1px solid #1A1A30', padding: '0 12px 12px 36px' }}>
          {expandedKws.length === 0 ? (
            <p style={{ fontSize: '11px', color: '#444458', padding: '12px 0' }}>No ranked keywords found for this category in your current footprint.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px', padding: '8px 0 4px', borderBottom: '1px solid #111120' }}>
                {['Pos', 'Keyword', 'Vol / mo', 'Annual Vol'].map((h, i) => (
                  <span key={h} style={{ fontSize: '9px', color: '#404060', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '.06em', textAlign: i > 1 ? 'right' : 'left' as const }}>{h}</span>
                ))}
              </div>
              {expandedKws.slice(0, 25).map((kw, idx) => (
                <div key={kw.keyword} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <PosBadge pos={kw.position} />
                  <span style={{ fontSize: '12px', color: '#C0C0E0', alignSelf: 'center', paddingLeft: '4px' }}>{kw.keyword}</span>
                  <span style={{ fontSize: '11px', color: '#666688', textAlign: 'right', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{kw.searchVolume.toLocaleString()}</span>
                  <span style={{ fontSize: '11px', color: '#505070', textAlign: 'right', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtAnn(kw.searchVolume)}</span>
                </div>
              ))}
              {expandedKws.length > 25 && (
                <p style={{ fontSize: '10px', color: '#444458', paddingTop: '8px', textAlign: 'center' }}>
                  Showing 25 of {expandedKws.length} keywords · use the keyword table below to see all
                </p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

// ── Position Badge ─────────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: number | null }) {
  if (pos === null) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '32px', height: '22px', borderRadius: '5px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        color: '#444458', fontSize: '11px', flexShrink: 0,
      }}>—</span>
    );
  }
  const color = bucketHex(pos);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '32px', height: '22px', borderRadius: '5px',
        background: `${color}22`, border: `1px solid ${color}44`,
        color, fontSize: '11px', fontWeight: 700, flexShrink: 0,
      }}
    >
      {pos}
    </span>
  );
}

// ── Feature Pill ───────────────────────────────────────────────────────────────

function FeaturePill({ feature }: { feature: string }) {
  const meta = FEATURE_META[feature];
  if (!meta) return null;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '1px 6px', borderRadius: '4px',
        background: `${meta.color}1A`, border: `1px solid ${meta.color}33`,
        color: meta.color, fontSize: '9px', fontWeight: 600,
        letterSpacing: '.04em', whiteSpace: 'nowrap' as const,
      }}
    >
      {meta.label}
    </span>
  );
}

// ── Share of Voice ─────────────────────────────────────────────────────────────

const SOV_SERP_COLORS  = ['#06B6D4', '#0891B2', '#0E7490'];
const SOV_BRAND_COLORS = ['#F59E0B', '#D97706', '#B45309'];

interface SovRawEntry {
  domain:  string;
  traffic: number;
  type:    'client' | 'serp' | 'brand';
  color:   string;
}

interface SovArc extends SovRawEntry {
  pct:        number;
  dash:       number;
  dashOffset: number;
}

function LegendRow({ arc }: { arc: SovArc }) {
  const label    = arc.type === 'client' ? 'Client' : arc.domain.replace(/^www\./, '');
  const isClient = arc.type === 'client';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
      <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: arc.color, flexShrink: 0 }} />
      <span style={{
        fontSize: isClient ? '12px' : '11px',
        color: isClient ? '#C0C0E8' : '#888899',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
        flex: 1, fontWeight: isClient ? 600 : 400,
      }}>
        {label}
      </span>
      <span style={{ fontSize: '10px', color: arc.color, fontWeight: isClient ? 700 : 400, flexShrink: 0, marginLeft: '4px', fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(arc.pct * 100)}%
      </span>
    </div>
  );
}

function normSovDomain(d: string): string {
  return (d ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim();
}

export function SovPanel({ analysis, competitors, dbKeywords }: { analysis: any; competitors?: string[]; dbKeywords?: any[] }) {
  const manualDomains = new Set((competitors ?? []).map(d => normSovDomain(d)));
  const clientTraffic = (analysis.semrushSnapshot?.overview?.organicTraffic ?? 0) as number;
  const semComps      = (analysis.semrushSnapshot?.competitors ?? []) as Array<{ domain: string; organicTraffic: number }>;

  // ── v7.88/v7.89: voice basis ────────────────────────────────────────────────
  // 1. Semrush auto-discovery snapshots carry organicTraffic per domain → use it.
  // 2. CSV-upload snapshots have NO traffic data. Voice = page-1 monthly search
  //    volume per domain. Client side: snapshot topKeywords pos ≤ 10.
  //    Competitor side (v7.89 fix): the UPLOADED competitor keyword rows
  //    (project_keywords.domain = competitor) — these carry each competitor's
  //    FULL rankings, INCLUDING keywords the client also ranks for. The v7.88
  //    version wrongly used gapKeywords, which exclude every client-overlap
  //    keyword and so understated competitors to ~0%.
  // 3. Last resort (no uploaded competitor rows): gap keywords — labeled as
  //    gap-only so the limitation is visible.
  // All bases are actual fetched data, never modeled.
  const trafficTotal = clientTraffic + semComps.reduce((s, c) => s + (c.organicTraffic ?? 0), 0);

  let basis: 'traffic' | 'volume' | 'tracked' | 'gapOnly';
  let clientVoice: number;
  let compEntries: Array<{ domain: string; voice: number }>;

  const snap       = analysis.semrushSnapshot ?? {};
  const clientNorm = normSovDomain(snap.domain ?? '');
  const topKws     = (snap.topKeywords ?? []) as any[];
  const compRows   = (dbKeywords ?? []).filter(r =>
    r?.domain && r.source !== 'blocked' && normSovDomain(r.domain) !== clientNorm
  );
  const compRowsWithPos = compRows.filter(r => r.position != null);

  if (trafficTotal > 0) {
    basis       = 'traffic';
    clientVoice = clientTraffic;
    compEntries = semComps.map(c => ({ domain: c.domain, voice: c.organicTraffic ?? 0 }));
  } else {
    const byComp = new Map<string, number>();
    if (compRowsWithPos.length > 0) {
      // Page-1 share: both sides restricted to positions ≤ 10
      basis = 'volume';
      clientVoice = topKws
        .filter(k => k?.position != null && k.position <= 10)
        .reduce((s, k) => s + (k.searchVolume ?? 0), 0);
      for (const r of compRowsWithPos) {
        if (r.position > 10) continue;
        const d = normSovDomain(r.domain);
        byComp.set(d, (byComp.get(d) ?? 0) + (r.searchVolume ?? 0));
      }
    } else if (compRows.length > 0) {
      // v7.90: uploaded competitor CSVs carry NO rank positions (the uploader
      // previously only ingested keyword+volume), so page-1 share cannot be
      // computed. Honest fallback: each domain's TOTAL tracked keyword volume
      // — same measure on both sides, explicitly labeled. Re-uploading
      // competitor CSVs with a position column upgrades this to page-1 share.
      basis = 'tracked';
      clientVoice = topKws.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
      for (const r of compRows) {
        const d = normSovDomain(r.domain);
        byComp.set(d, (byComp.get(d) ?? 0) + (r.searchVolume ?? 0));
      }
    } else {
      basis = 'gapOnly';
      clientVoice = topKws
        .filter(k => k?.position != null && k.position <= 10)
        .reduce((s, k) => s + (k.searchVolume ?? 0), 0);
      for (const g of ((snap.gapKeywords ?? []) as any[])) {
        if (!g?.competitor) continue;
        if ((g.competitorPosition ?? 99) > 10) continue;
        const d = normSovDomain(g.competitor);
        byComp.set(d, (byComp.get(d) ?? 0) + (g.searchVolume ?? 0));
      }
    }
    compEntries = Array.from(byComp.entries()).map(([domain, voice]) => ({ domain, voice }));
  }

  // Build entries: client first, then competitors sorted by voice descending
  const rawEntries: SovRawEntry[] = [
    { domain: 'Client', traffic: clientVoice, type: 'client', color: '#6C63FF' },
  ];
  let serpIdx = 0;
  let brandIdx = 0;
  for (const c of [...compEntries].sort((a, b) => b.voice - a.voice)) {
    const isBrand = manualDomains.has(normSovDomain(c.domain));
    rawEntries.push({
      domain:  c.domain,
      traffic: c.voice,
      type:    isBrand ? 'brand' : 'serp',
      color:   isBrand
        ? SOV_BRAND_COLORS[brandIdx++ % SOV_BRAND_COLORS.length]
        : SOV_SERP_COLORS[serpIdx++  % SOV_SERP_COLORS.length],
    });
  }

  const total    = rawEntries.reduce((s, e) => s + e.traffic, 0);
  const TOP_N    = 6;
  const topRaw   = rawEntries.slice(0, TOP_N);
  const otherT   = rawEntries.slice(TOP_N).reduce((s, e) => s + e.traffic, 0);

  // Compute SVG donut arcs.
  // Use a <g transform="rotate(-90, cx, cy)"> wrapper so the path starts at 12 o'clock.
  // With that rotation, dashOffset = cumPct * C (skip forward along path to correct start).
  const R   = 55;
  const C   = 2 * Math.PI * R;  // ≈ 345.58
  const GAP = 1.5;
  let cumPct = 0;

  const arcs: SovArc[] = topRaw.map(e => {
    const pct        = total > 0 ? e.traffic / total : 0;
    const dash       = Math.max(0, pct * C - GAP);
    const dashOffset = cumPct * C;  // skip forward to correct start position
    cumPct += pct;
    return { ...e, pct, dash, dashOffset };
  });

  // Add "Other" slice for remaining competitors
  const otherPct = total > 0 ? otherT / total : 0;
  if (otherPct > 0.005) {
    arcs.push({
      domain: 'Other', traffic: otherT, type: 'serp', color: '#2A2A44',
      pct: otherPct,
      dash: Math.max(0, otherPct * C - GAP),
      dashOffset: cumPct * C,
    });
  }

  const clientArc   = arcs.find(a => a.type === 'client');
  const serpArcs    = arcs.filter(a => a.type === 'serp'  && a.domain !== 'Other');
  const brandArcs   = arcs.filter(a => a.type === 'brand');
  const otherArc    = arcs.find(a => a.domain === 'Other');

  if (total === 0) {
    return (
      <div className="orbit-card p-5 flex flex-col gap-3">
        <p className="text-orbit-secondary text-xs font-medium">Share of Voice</p>
        <p style={{ fontSize: '12px', color: '#555570' }}>
          No traffic or page-1 keyword data available yet. Run an analysis to populate.
        </p>
      </div>
    );
  }

  return (
    <div className="orbit-card p-5 flex flex-col gap-3">
      <div>
        <p className="text-orbit-secondary text-xs font-medium">Share of Voice</p>
        <p style={{ fontSize: '9px', color: '#4A4A70', marginTop: 2 }}>
          {basis === 'traffic' && 'by organic traffic (Semrush)'}
          {basis === 'volume'  && 'by page-1 keyword search volume — monthly, per domain (uploaded rankings)'}
          {basis === 'tracked' && 'by total tracked keyword volume — uploaded competitor CSVs have no rank positions; re-upload with a position column for page-1 share'}
          {basis === 'gapOnly' && 'by page-1 gap-keyword volume only — competitor rankings on shared keywords not available'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>

        {/* Donut SVG — group is rotated -90° so arc path starts at 12 o'clock */}
        <div style={{ flexShrink: 0 }}>
          <svg width="144" height="144" viewBox="0 0 144 144" role="img"
            aria-label={`Share of Voice donut. Client holds ${Math.round((clientArc?.pct ?? 0) * 100)}% of organic search visibility.`}>
            <title>Share of Voice</title>
            <g transform="rotate(-90, 72, 72)">
              {arcs.map(arc => arc.dash > 0 ? (
                <circle key={arc.domain}
                  cx="72" cy="72" r={R}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth="20"
                  strokeDasharray={`${arc.dash.toFixed(2)} ${(C - arc.dash).toFixed(2)}`}
                  strokeDashoffset={arc.dashOffset.toFixed(2)}
                />
              ) : null)}
            </g>
            {/* Inner fill — must be OUTSIDE the rotated group so text renders upright */}
            <circle cx="72" cy="72" r="45" fill="#0F0F1C" />
            <text x="72" y="68" textAnchor="middle" fontSize="17" fontWeight="700" fill="#F0F0FF">
              {Math.round((clientArc?.pct ?? 0) * 100)}%
            </text>
            <text x="72" y="82" textAnchor="middle" fontSize="8.5" fill="#555578" letterSpacing=".07em">
              CLIENT SOV
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {clientArc && <LegendRow arc={clientArc} />}

          {serpArcs.length > 0 && (
            <>
              <p style={{ fontSize: '9px', fontWeight: 600, color: '#3A3A5C', letterSpacing: '.08em', textTransform: 'uppercase' as const, margin: '7px 0 3px' }}>
                SERP Discovered
              </p>
              {serpArcs.map(a => <LegendRow key={a.domain} arc={a} />)}
            </>
          )}

          {brandArcs.length > 0 && (
            <>
              <p style={{ fontSize: '9px', fontWeight: 600, color: '#3A3A5C', letterSpacing: '.08em', textTransform: 'uppercase' as const, margin: '7px 0 3px' }}>
                Brand Competitors
              </p>
              {brandArcs.map(a => <LegendRow key={a.domain} arc={a} />)}
            </>
          )}

          {otherArc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #1A1A2E' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#2A2A44', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#555570', flex: 1 }}>Other</span>
              <span style={{ fontSize: '10px', color: '#444460' }}>{Math.round(otherArc.pct * 100)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Type legend pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '9px', background: 'rgba(6,182,212,.08)', border: '1px solid rgba(6,182,212,.2)', color: '#06B6D4' }}>
          <span style={{ width: '5px', height: '5px', background: '#06B6D4', borderRadius: '50%' }} />
          SERP discovered
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '9px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', color: '#F59E0B' }}>
          <span style={{ width: '5px', height: '5px', background: '#F59E0B', borderRadius: '50%' }} />
          Brand / manual
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GoogleSerpSection({ analysis, projectId, domain, competitors, defaultClientThreshold = 0, defaultCompetitorThreshold = 0 }: Props) {
  const [filter,     setFilter]     = useState<BucketKey>('all');
  const [sortCol,    setSortCol]    = useState<'position' | 'volume'>('position');
  const [sortAsc,    setSortAsc]    = useState(true);
  const [dbKeywords, setDbKeywords] = useState<DbKeyword[]>([]);
  const [dbLoaded,   setDbLoaded]   = useState(false);

  // Fetch DB keywords (CSV uploads + custom) on mount — same source as KeywordsPanel
  useEffect(() => {
    fetch(`/api/projects/${projectId}/keywords`)
      .then(r => r.json())
      .then(d => setDbKeywords(d.keywords ?? []))
      .catch(() => {})
      .finally(() => setDbLoaded(true));
  }, [projectId]);

  // ── Data ──────────────────────────────────────────────────────────────────

  // Merge semrush topKeywords + ranked DB keywords so this panel reflects
  // the full keyword footprint shown in the Keyword Landscape panel.
  // Mirror KeywordsPanel.buildRows exactly:
  //   - Semrush topKeywords always have positions
  //   - DB keywords: include ALL type='ranked' regardless of position or volume
  //     (KeywordsPanel shows type='ranked' DB keywords even without positions;
  //      volume threshold is only applied to Semrush keywords in KeywordsPanel, not DB keywords)
  // Build ranked keyword list via shared utility — guarantees identical count to KeywordsPanel.
  // Filter to !isGap: this section is about client rankings only (gap kws have no client position).
  // Pool options identical to KeywordsPanel, so ranked + excluded gaps always
  // sum to exactly the Keyword Landscape total.
  const { topKws, gapKwCount, gapVolMonthly } = useMemo(() => {
    const clientDomain = analysis?.semrushSnapshot?.domain ?? domain ?? '';
    const pool = buildKwPool({
      semrushSnapshot:  analysis?.semrushSnapshot,
      uploadedKeywords: dbKeywords,
      clientDomain,
      competitorDomains: competitors ?? [],
      clientVolMin:     defaultClientThreshold,
      competitorVolMin: defaultCompetitorThreshold,
    });
    const gaps = pool.filter(item => item.isGap);
    return {
      topKws: pool
        .filter(item => !item.isGap)
        .map(item => ({
          keyword:      item.keyword,
          position:     item.position != null && item.position > 0 && isFinite(item.position)
                          ? item.position
                          : null,
          searchVolume: item.searchVolume,
          branded:      item.isBranded,
        })) as SemKw[],
      gapKwCount:    gaps.length,
      gapVolMonthly: gaps.reduce((s, k) => s + k.searchVolume, 0),
    };
  }, [analysis, dbKeywords, domain, competitors, defaultClientThreshold, defaultCompetitorThreshold]);

  // Recompute positionDist from the FULL merged keyword set.
  // The stored semrushSnapshot.positionDist was built from only the 40 Semrush keywords.
  const posDist: Record<string, number> = useMemo(
    () => buildPositionDist(topKws),
    [topKws],
  );

  // Build a lookup map from serp scan keywords (keyed by lowercase keyword text)
  const serpKwMap = useMemo(() => {
    const map: Record<string, SerpKw> = {};
    const kws: SerpKw[] = (analysis.serpApiSnapshot?.keywords ?? []) as SerpKw[];
    kws.forEach(k => { map[k.keyword.toLowerCase().trim()] = k; });
    return map;
  }, [analysis]);

  const serpScannedCount = ((analysis.serpApiSnapshot?.keywords ?? []) as SerpKw[]).length;

  // ── Computed Stats ────────────────────────────────────────────────────────
  // posKws = subset with real numeric positions, used for distribution/coverage stats.
  // totalKws uses the full topKws so it matches the Keyword Landscape count.
  const posKws   = topKws.filter((k): k is SemKw & { position: number } => k.position !== null);
  const totalKws = topKws.length;                               // all ranked (matches Keyword Landscape)
  const page1Kws = posKws.filter(k => k.position <= 10).length;
  const top3Kws  = posKws.filter(k => k.position <= 3).length;
  const totalVol = topKws.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
  const top3Vol  = posKws.filter(k => k.position <= 3) .reduce((s, k) => s + k.searchVolume, 0);
  const page1Vol = posKws.filter(k => k.position <= 10).reduce((s, k) => s + k.searchVolume, 0);
  const posVol   = posKws.reduce((s, k) => s + k.searchVolume, 0);

  const weightedPos = posVol > 0
    ? posKws.reduce((s, k) => s + k.position * k.searchVolume, 0) / posVol
    : 0;

  const volOutsideTop3 = totalVol - top3Vol;
  const pctOutsideTop3 = totalVol > 0 ? Math.round((volOutsideTop3 / totalVol) * 100) : 0;
  const top3VolPct     = totalVol > 0 ? Math.round((top3Vol / totalVol) * 100) : 0;
  // Volume-based page 1 share: what % of total search demand is captured at positions 1–10.
  // Matches the metric users expect when they say "page 1 coverage."
  // Count-based (page1Kws / posKws.length) is surfaced as sub-text only.
  const page1Pct       = totalVol > 0 ? Math.round((page1Vol / totalVol) * 100) : 0;

  // ── Bar chart ─────────────────────────────────────────────────────────────
  // (bar chart helpers removed — bar chart replaced with SovPanel)

  // ── Category Performance ──────────────────────────────────────────────────
  // Read category breakdown stored by the synthesis pipeline
  const cb = (analysis.semrushSnapshot?._categoryBreakdown ?? null) as CategoryBreakdown | null;

  // Compute per-category rank stats from the FULL merged topKws list.
  // Uses inferCategoryForKw so CSV keywords that weren't in the 40-keyword
  // MVP synthesis map still get assigned to the right category via text matching.
  const categoryRankStats = useMemo<Record<string, CatRankStats>>(() => {
    if (!cb?.keywordCategories || !cb?.categories) return {};
    const stats: Record<string, CatRankStats> = {};
    const empty = (): CatRankStats => ({
      count: 0, posSum: 0, monthlyVol: 0, page1Vol: 0,
      dist: { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 },
    });
    for (const kw of topKws) {
      const cat = inferCategoryForKw(kw.keyword, cb.keywordCategories, cb.categories);
      if (!cat) continue;
      if (!stats[cat]) stats[cat] = empty();
      stats[cat].monthlyVol += kw.searchVolume;
      if (kw.position === null) continue;  // no position — count vol only
      stats[cat].count++;
      stats[cat].posSum     += kw.position;
      if (kw.position <= 10) stats[cat].page1Vol += kw.searchVolume;
      const p = kw.position;
      if (p <= 3)       stats[cat].dist['1-3']++;
      else if (p <= 10) stats[cat].dist['4-10']++;
      else if (p <= 20) stats[cat].dist['11-20']++;
      else              stats[cat].dist['21+']++;
    }
    return stats;
  }, [topKws, cb]);

  // ── Keyword Table ─────────────────────────────────────────────────────────
  const filteredKws = useMemo(() => {
    let kws = [...topKws];

    if (filter !== 'all') {
      // Position bucket filters only match keywords with a known position
      const b = POSITION_BUCKETS.find(b => b.key === filter);
      if (b) kws = kws.filter(k => k.position !== null && k.position >= b.min && k.position <= b.max);
    }

    kws.sort((a, b) => {
      if (sortCol === 'position') {
        // null positions always sort to the end (below all ranked positions)
        const pa = a.position ?? 9999;
        const pb = b.position ?? 9999;
        const diff = pa - pb;
        return sortAsc ? diff : -diff;
      } else {
        const diff = (b.searchVolume ?? 0) - (a.searchVolume ?? 0);
        return sortAsc ? -diff : diff;
      }
    });

    return kws;
  }, [topKws, filter, sortCol, sortAsc]);

  function toggleSort(col: 'position' | 'volume') {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(col === 'position'); }
  }

  // ── Scan date ─────────────────────────────────────────────────────────────
  const fetchedAt = analysis.serpApiSnapshot?.fetchedAt;
  const scanDate  = fetchedAt
    ? new Date(fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4 animate-fade-in">

      {/* ── Section Header ── */}
      <div className="orbit-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Search · 06</p>
            <h2 className="text-orbit-primary text-xl font-bold mt-1">Google Ranks</h2>
            <p className="text-orbit-secondary text-sm mt-1">Ranking distribution, keyword performance &amp; position analysis</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {scanDate && (
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>
                Last scan: {scanDate}
              </span>
            )}
            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: 'rgba(66,133,244,0.1)', border: '1px solid rgba(66,133,244,0.2)', color: '#6BAAF8' }}>
              <svg style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google SERP
            </span>
          </div>
        </div>
      </div>

      {/* ── Stat Strip ── */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Ranked Keywords"
          value={dbLoaded ? totalKws.toLocaleString() : '—'}
          sub={dbLoaded
            ? `${top3Kws} in top 3 · ${fmtAnnual(totalVol)} annual vol`
            : 'Loading…'}
          sub2={dbLoaded && gapKwCount > 0
            ? `+${gapKwCount} gap kws (${fmtAnnual(gapVolMonthly)}/yr) excluded — no rankings · Landscape total ${(totalKws + gapKwCount).toLocaleString()}`
            : undefined}
        />
        <StatCard
          label="PG 1 Vol. Share"
          value={dbLoaded ? `${page1Pct}%` : '—'}
          sub={dbLoaded ? `${page1Kws} of ${posKws.length} kws rank pg 1` : 'Loading…'}
          sub2={dbLoaded && page1Vol > 0 ? `${fmtAnnual(page1Vol)} annual vol at pg 1` : undefined}
          color="#6C63FF"
        />
        <StatCard
          label="Wtd. Avg Position"
          value={dbLoaded ? (weightedPos > 0 ? weightedPos.toFixed(1) : '—') : '—'}
          sub="weighted by search volume"
          color={weightedPos > 0 && weightedPos <= 5 ? '#22C55E' : weightedPos <= 10 ? '#F59E0B' : '#EF4444'}
        />
        <StatCard
          label="Top-3 Volume Share"
          value={dbLoaded ? `${top3VolPct}%` : '—'}
          sub={dbLoaded ? `${fmtAnnual(top3Vol)} / yr in positions 1–3` : 'Loading…'}
          color="#22C55E"
        />
      </div>

      {/* ── Two-col: Chart + Opportunity ── */}
      <div className="grid grid-cols-2 gap-3">

        {/* Share of Voice */}
        <SovPanel analysis={analysis} competitors={competitors} dbKeywords={dbKeywords} />

        {/* Volume Opportunity */}
        <div className="orbit-card p-5 flex flex-col gap-4">
          <p className="text-orbit-secondary text-xs font-medium">Volume Opportunity Analysis</p>

          {/* Big metric */}
          {totalVol > 0 && (
            <>
              <div className="flex items-center gap-4 py-2">
                <div>
                  <p style={{ color: '#EF4444', fontSize: '40px', fontWeight: 700, lineHeight: 1, margin: 0 }}>
                    {pctOutsideTop3}%
                  </p>
                  <p style={{ color: '#8888AA', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', marginTop: '5px' }}>
                    of volume outside top 3
                  </p>
                </div>
                <div style={{ width: '1px', height: '56px', background: '#1E1E2E', flexShrink: 0 }} />
                <div>
                  <p style={{ color: '#F0F0FF', fontSize: '15px', fontWeight: 600, margin: 0 }}>
                    {fmtAnnual(volOutsideTop3)}
                    <span style={{ color: '#444458', fontWeight: 400, fontSize: '13px' }}> / yr</span>
                  </p>
                  <p style={{ color: '#8888AA', fontSize: '11px', margin: '4px 0 0' }}>
                    annual searches pos 4+
                  </p>
                  <p style={{ color: '#555570', fontSize: '10px', margin: '2px 0 0' }}>
                    out of {fmtAnnual(totalVol)} total
                  </p>
                </div>
              </div>

              {/* Volume breakdown bars */}
              <div className="flex flex-col gap-2.5">
                {[
                  { label: 'Positions 1–3', vol: top3Vol, color: '#6C63FF' },
                  { label: 'Positions 4–10', vol: page1Vol - top3Vol, color: '#06B6D4' },
                  { label: 'Page 2+ (11+)', vol: totalVol - page1Vol, color: '#EF4444' },
                ].map(row => {
                  const pct = totalVol > 0 ? (row.vol / totalVol) * 100 : 0;
                  return (
                    <div key={row.label}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: '11px', color: '#8888AA' }}>{row.label}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: row.color }}>
                          {fmtAnnual(row.vol)}<span style={{ color: '#444458', fontWeight: 400 }}> ({pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div style={{ background: '#1E1E2E', borderRadius: '3px', height: '5px' }}>
                        <div style={{
                          background: row.color, borderRadius: '3px', height: '5px',
                          width: `${Math.min(100, pct)}%`, transition: 'width 0.6s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Insight callout */}
              <div style={{
                background: '#0F0F1E', border: '1px solid #1E1E35', borderLeft: '3px solid #6C63FF',
                borderRadius: '0 8px 8px 0', padding: '10px 12px', marginTop: '4px',
              }}>
                <p style={{ fontSize: '11px', color: '#8888AA', lineHeight: 1.5, margin: 0 }}>
                  <span style={{ color: '#C0C0E8', fontWeight: 500 }}>Opportunity: </span>
                  Moving {Math.min(5, POSITION_BUCKETS[1] ? (posDist['4-10'] ?? 0) : 0)} of your Pos 4–10 keywords
                  into top 3 could unlock{' '}
                  <span style={{ color: '#6C63FF', fontWeight: 600 }}>
                    ~{fmtAnnual(Math.round((page1Vol - top3Vol) * 0.3))}
                  </span>{' '}
                  additional annual searches.
                </p>
              </div>
            </>
          )}

          {totalVol === 0 && (
            <p style={{ fontSize: '12px', color: '#555570' }}>No keyword volume data available. Run analysis to see results.</p>
          )}
        </div>
      </div>

      {/* ── Category Performance ── */}
      {cb && cb.categories && cb.categories.length > 0 && (
        <CategoryPerformanceSection
          cb={cb}
          categoryRankStats={categoryRankStats}
          topKws={topKws}
        />
      )}

      {/* ── Keyword Table ── */}
      <div className="orbit-card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-orbit-secondary text-xs font-medium">Keyword Rankings</p>
            <p style={{ fontSize: '10px', color: '#444458', marginTop: '2px' }}>
              {filteredKws.length} keyword{filteredKws.length !== 1 ? 's' : ''}
              {filter !== 'all' ? ` · filtered to ${POSITION_BUCKETS.find(b => b.key === filter)?.label}` : ''}
              {serpScannedCount > 0 && (
                <span style={{ color: '#555570' }}> · SERP features shown for {serpScannedCount} scanned keywords</span>
              )}
            </p>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {([{ key: 'all', label: 'All', hex: '#8888B0' }, ...POSITION_BUCKETS] as const).map(b => {
              const active = filter === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => setFilter(b.key as BucketKey)}
                  style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '10px', cursor: 'pointer',
                    background: active ? `${b.hex}22` : 'transparent',
                    border: `1px solid ${active ? b.hex : '#2A2A44'}`,
                    color: active ? b.hex : '#505070',
                    fontWeight: active ? 600 : 400,
                    transition: 'all .12s',
                  }}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1E1E2E' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', color: '#555570', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '44px' }}>
                  <button onClick={() => toggleSort('position')} style={{ cursor: 'pointer', color: sortCol === 'position' ? '#8B85FF' : '#555570', display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', padding: 0 }}>
                    Pos {sortCol === 'position' && (sortAsc ? '↑' : '↓')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', color: '#555570', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Keyword</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: '10px', color: '#555570', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '90px' }}>
                  <button onClick={() => toggleSort('volume')} style={{ cursor: 'pointer', color: sortCol === 'volume' ? '#8B85FF' : '#555570', display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', padding: 0, marginLeft: 'auto' }}>
                    Vol / mo {sortCol === 'volume' && (sortAsc ? '↓' : '↑')}
                  </button>
                </th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: '10px', color: '#555570', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '90px' }}>Annual Vol</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', color: '#555570', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '140px' }}>SERP Features</th>
              </tr>
            </thead>
            <tbody>
              {filteredKws.map((kw, idx) => {
                const serpKw = serpKwMap[kw.keyword.toLowerCase().trim()];
                const isBranded = kw.branded === true;
                const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)';

                return (
                  <tr
                    key={kw.keyword}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg }}
                  >
                    {/* Position */}
                    <td style={{ padding: '7px 8px' }}>
                      <PosBadge pos={kw.position} />
                    </td>

                    {/* Keyword */}
                    <td style={{ padding: '7px 8px' }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '12px', color: '#D0D0F0' }}>{kw.keyword}</span>
                        {isBranded && (
                          <span style={{
                            fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
                            background: '#1A1A40', border: '1px solid #3A3A80',
                            color: '#7070C0', flexShrink: 0,
                          }}>brand</span>
                        )}
                      </div>
                    </td>

                    {/* Monthly vol */}
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: '#8888AA', fontVariantNumeric: 'tabular-nums' }}>
                      {(kw.searchVolume ?? 0).toLocaleString()}
                    </td>

                    {/* Annual vol */}
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: '#6060A0', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtAnnual(kw.searchVolume ?? 0)}
                    </td>

                    {/* SERP Features */}
                    <td style={{ padding: '7px 8px' }}>
                      {serpKw ? (
                        <div className="flex flex-wrap gap-1">
                          {serpKw.serpFeatures.map(f => <FeaturePill key={f} feature={f} />)}
                          {serpKw.serpFeatures.length === 0 && (
                            <span style={{ fontSize: '10px', color: '#333350' }}>no features</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#2A2A40' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredKws.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: '#444458', fontSize: '13px' }}>
              No keywords in this position range.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

