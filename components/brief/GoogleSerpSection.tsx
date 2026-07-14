'use client';
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { buildKwPool, isBrandedKeyword, buildCompetitorBrandTokens, buildExcludedBrandTokens, textHasCompetitorBrand } from '@/lib/utils/kwVolume';
import { computeSov, PAGE1_CTR_SUM, normSovDomain, type SovRawEntry } from '@/lib/sov/model';   // v7.335: shared SoV model (QC audit B2)
import SegmentDownloadButton from './SegmentDownloadButton';
import { exportRankBucketXLSX } from '@/lib/export/rankBucketExport';
import InsightBanner from './InsightBanner';   // v7.366: insight-sentence layer
import { landGrabInsight } from '@/lib/insights';   // v7.366 (G2)

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
  domain?:      string | null;  // v7.110: competitor domain ('' / null = client) — needed for category summary cards
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
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  projectName?:           string;   // v7.94: client name shown in SOV legend
  domain?:                string;
  competitors?:           string[];
  defaultClientThreshold?: number;  // min monthly vol for ranked keywords — must match KeywordsPanel
  defaultCompetitorThreshold?: number;  // min monthly vol for gap keywords — must match KeywordsPanel
}

// ── Constants ──────────────────────────────────────────────────────────────────

const POSITION_BUCKETS = [
  { key: '1-3',   label: 'Pos 1–3',  hex: 'var(--c-6c63ff)', min: 1,  max: 3    },
  { key: '4-10',  label: 'Pos 4–10', hex: 'var(--c-06b6d4)', min: 4,  max: 10   },
  { key: '11-20', label: 'Page 2',   hex: 'var(--c-f59e0b)', min: 11, max: 20   },
  { key: '21+',   label: 'Page 3+',  hex: 'var(--c-ef4444)', min: 21, max: 9999 },
];

const FEATURE_META: Record<string, { label: string; color: string }> = {
  ai_overview:      { label: 'AIO',      color: 'var(--c-6c63ff)' },
  featured_snippet: { label: 'Snippet',  color: 'var(--c-22c55e)' },
  knowledge_panel:  { label: 'KP',       color: 'var(--c-f59e0b)' },
  local_pack:       { label: 'Local',    color: 'var(--c-ef4444)' },
  shopping:         { label: 'Shop',     color: 'var(--c-f97316)' },
  video_carousel:   { label: 'Video',    color: 'var(--c-06b6d4)' },
  image_pack:       { label: 'Images',   color: 'var(--c-8b5cf6)' },
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
  if (pos <= 3)  return 'var(--c-6c63ff)';
  if (pos <= 10) return 'var(--c-06b6d4)';
  if (pos <= 20) return 'var(--c-f59e0b)';
  return 'var(--c-ef4444)';
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

// ── Category membership (v7.336, QC audit B6) ──────────────────────────────────
// STORED membership only (Const II.8/III.1b): a keyword belongs to a category iff the
// stored `keywordCategories` map (the synthesis taxonomy) says so. The old Tier 2/3
// lexical fallback — shared-word string matching against category names — RECONSTRUCTED
// membership at this read site and fabricated assignments the stored taxonomy never
// made ("Mortgage Rates and Calculators" lexically swallowed every "…calculator" term;
// a keyword sharing one long word with a category name got filed under it). Keywords
// with no stored membership now surface in an honest "Uncategorized" bucket
// (Const I.5) instead — never a string-matched guess.
const UNCATEGORIZED = 'Uncategorized';

function storedCategoryForKw(
  keyword:           string,
  keywordCategories: Record<string, string>,
): string | null {
  const kwLower = keyword.toLowerCase().trim();
  return keywordCategories[kwLower] ?? null;
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, sub2, color }: { label: string; value: string; sub: string; sub2?: string; color?: string }) {
  return (
    <div className="bg-orbit-surface border border-orbit-border rounded-lg p-4 flex flex-col gap-1">
      <p style={{ fontSize: '11px', color: 'var(--c-8888aa)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</p>
      <p style={{ fontSize: '24px', fontWeight: 700, color: color ?? 'var(--c-f0f0ff)', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '11px', color: 'var(--c-555570)' }}>{sub}</p>
      {sub2 && <p style={{ fontSize: '10px', color: 'var(--c-444460)', marginTop: '1px' }}>{sub2}</p>}
    </div>
  );
}

// ── Category Performance Section ──────────────────────────────────────────────

const RANK_BUCKET_META = [
  { key: '1-3',   color: 'var(--c-6c63ff)', label: '1–3'  },
  { key: '4-10',  color: 'var(--c-06b6d4)', label: '4–10' },
  { key: '11-20', color: 'var(--c-f59e0b)', label: 'P2'   },
  { key: '21+',   color: 'var(--c-ef4444)', label: 'P3+'  },
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
  filter,
}: {
  cb:                CategoryBreakdown;
  categoryRankStats: Record<string, CatRankStats>;
  topKws:            SemKw[];
  filter:            BucketKey;
}) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const procedureCats = cb.categories.filter(c => c.type === 'procedure');
  const navCats       = cb.categories.filter(c => c.type === 'brand' || c.type === 'location');

  // v7.336 (QC audit B6, Const I.5/II.8): keywords with NO stored category membership
  // are no longer lexically filed into a category — they surface here as an honest
  // "Uncategorized" group at the END of the table. Its row is a real roll-up of its
  // own keywords (categoryRankStats accumulated under UNCATEGORIZED): demand = the
  // summed monthly volume of those keywords, page 1 = their summed page-1 volume.
  // Nothing is modeled and no stored category row is fabricated for it.
  const uncatStats = categoryRankStats[UNCATEGORIZED];
  const uncatRow: CategoryRow | null = uncatStats
    ? { name: UNCATEGORIZED, type: 'procedure', monthlyDemand: uncatStats.monthlyVol, page1Demand: uncatStats.page1Vol, top3Demand: 0 }
    : null;

  if (procedureCats.length === 0 && navCats.length === 0 && !uncatRow) return null;

  // v7.331: when a rank-bucket card is active, show only categories that have keywords
  // ranking in that bucket, and (when expanded) only that bucket's keywords. Each
  // category's own metrics are unchanged (Wayne's choice) — this filters VISIBILITY
  // only, using the already-stored per-bucket dist (no re-derivation, Const II.8).
  const bucket   = filter === 'all' ? null : (POSITION_BUCKETS.find(b => b.key === filter) ?? null);
  const catInBucket = (name: string) =>
    !bucket || ((categoryRankStats[name]?.dist as Record<string, number> | undefined)?.[filter] ?? 0) > 0;
  const shownProcedure = procedureCats.filter(c => catInBucket(c.name));
  const shownNav       = navCats.filter(c => catInBucket(c.name));
  const showUncat      = uncatRow !== null && catInBucket(UNCATEGORIZED);   // v7.336 (B6): honest bucket honours the rank-bucket filter too

  // Keywords for the currently expanded category, sorted by position — also scoped to
  // the active bucket so an expanded row lists only that bucket's keywords.
  const expandedKws = useMemo(() => {
    if (!expandedCat) return [];
    const b = filter === 'all' ? null : (POSITION_BUCKETS.find(x => x.key === filter) ?? null);
    return topKws
      .filter(kw => (storedCategoryForKw(kw.keyword, cb.keywordCategories) ?? UNCATEGORIZED) === expandedCat)   // v7.336 (B6): stored membership only; null → honest Uncategorized bucket
      .filter(kw => !b || (kw.position !== null && kw.position >= b.min && kw.position <= b.max))
      .sort((a, c) => (a.position ?? 9999) - (c.position ?? 9999));
  }, [expandedCat, topKws, cb, filter]);

  function toggle(name: string) {
    setExpandedCat(prev => (prev === name ? null : name));
  }

  return (
    <div className="orbit-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Category Performance</p>
          <p className="text-orbit-primary text-sm font-semibold mt-0.5">
            Demand &amp; ranking by category · click a row to expand
            {bucket && (
              <span style={{ color: bucket.hex, fontWeight: 600 }}> · filtered to {bucket.label}</span>
            )}
          </p>
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
          <span key={i} style={{ fontSize: '10px', color: 'var(--c-555570)', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '.06em', textAlign: i <= 1 ? 'left' : i === 6 ? 'center' : 'right' as const }}>
            {h}
          </span>
        ))}
      </div>

      {/* Procedure section (v7.331: shown lists are filtered to the active bucket) */}
      {shownProcedure.length > 0 && (
        <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--c-4a4a72)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '6px 0 2px' }}>
          Procedure Lines
        </p>
      )}
      {shownProcedure.map(cat => (
        <CatRow
          key={cat.name} cat={cat} stats={categoryRankStats[cat.name]} dimmed={false}
          isExpanded={expandedCat === cat.name} onToggle={toggle} expandedKws={expandedKws}
        />
      ))}

      {/* Brand & navigation section */}
      {shownNav.length > 0 && (
        <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--c-4a4a72)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 0 2px', borderTop: '1px solid var(--c-111120)', marginTop: '4px' }}>
          Brand &amp; Navigation
        </p>
      )}
      {shownNav.map(cat => (
        <CatRow
          key={cat.name} cat={cat} stats={categoryRankStats[cat.name]} dimmed={true}
          isExpanded={expandedCat === cat.name} onToggle={toggle} expandedKws={expandedKws}
        />
      ))}

      {/* v7.336 (QC audit B6, Const I.5): honest Uncategorized group — keywords with no
          stored category membership, rendered LAST and dimmed, never string-matched into
          a real category. Expands like any other row. */}
      {showUncat && uncatRow && (
        <>
          <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--c-4a4a72)', letterSpacing: '.08em', textTransform: 'uppercase', padding: '8px 0 2px', borderTop: '1px solid var(--c-111120)', marginTop: '4px' }}>
            Uncategorized
          </p>
          <CatRow
            key={UNCATEGORIZED} cat={uncatRow} stats={uncatStats} dimmed={true}
            isExpanded={expandedCat === UNCATEGORIZED} onToggle={toggle} expandedKws={expandedKws}
          />
        </>
      )}

      {/* Honest empty state when a bucket filter matches no categories (I.5) */}
      {bucket && shownProcedure.length === 0 && shownNav.length === 0 && !showUncat && (
        <p style={{ fontSize: '11px', color: 'var(--c-6a6a90)', padding: '10px 0 2px' }}>
          No categories have keywords ranking in {bucket.label}. Clear the rank-bucket filter to see all categories.
        </p>
      )}
    </div>
  );
}

// ── Category Position Summary cards (v7.110) ──────────────────────────────────
// Four cards rendered between the SOV row and Category Performance:
//   1. Strongest categories   — highest page-1 volume share
//   2. Weakest categories     — lowest page-1 volume share
//   3. Competitor outperforming — categories where a competitor's page-1 volume
//      (from UPLOADED competitor keyword rows with positions — same source as
//      SovPanel) beats the client's page-1 volume
//   4. Largest opportunity    — most uncaptured demand (demand − client page-1 vol)
// All figures derive from data already computed on this page (_categoryBreakdown
// demand + categoryRankStats + uploaded competitor rows). Nothing is modeled.
// Categories under 2% of total demand are excluded so tiny categories can't top
// the lists (floor relaxed automatically if it leaves fewer than 3 categories).

interface CatSummaryRow {
  name:      string;
  demand:    number;          // monthly demand from _categoryBreakdown
  clientP1:  number;          // monthly page-1 vol — stats first, cb fallback (same rule as CatRow)
  share:     number;          // clientP1 / demand × 100
  avgPos:    number | null;
  ranked:    number;          // ranked kw count in category
  top3:      number;          // kws at pos 1–3
  page2plus: number;          // kws at pos 11+
}

const SUMMARY_ACCENTS = {
  strong: 'var(--c-22c55e)',
  weak:   'var(--c-ef4444)',
  comp:   'var(--c-f59e0b)',
  opp:    'var(--c-6c63ff)',
};

function SummaryCardShell({ accent, label, children }: { accent: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--c-13131f)', border: '1px solid var(--c-1e1e2e)', borderLeft: `3px solid ${accent}`,
      borderRadius: '0 10px 10px 0', padding: '14px 16px', display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <p style={{ fontSize: '10px', color: 'var(--c-8888aa)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 8px' }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function SummaryRunnerUps({ rows, accent }: { rows: Array<{ name: string; stat: string }>; accent: string }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ borderTop: '1px solid var(--c-1a1a2a)', paddingTop: '7px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {rows.map(r => (
        <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--c-a0a0c0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ fontSize: '11px', color: accent, flexShrink: 0 }}>{r.stat}</span>
        </div>
      ))}
    </div>
  );
}

function SummaryHero({ name, stat, sub, accent }: { name: string; stat: string; sub: string; accent: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-f0f0ff)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
      <p style={{ fontSize: '11px', color: accent, margin: '3px 0 0' }}>{stat}</p>
      <p style={{ fontSize: '10px', color: 'var(--c-555570)', margin: '2px 0 0' }}>{sub}</p>
    </div>
  );
}

function SummaryEmpty({ text }: { text: string }) {
  return <p style={{ fontSize: '11px', color: 'var(--c-555570)', lineHeight: 1.5, margin: 0 }}>{text}</p>;
}

function CategoryPositionSummary({
  cb, categoryRankStats, dbKeywords, clientDomain,
}: {
  cb:                CategoryBreakdown;
  categoryRankStats: Record<string, CatRankStats>;
  dbKeywords:        DbKeyword[];
  clientDomain:      string;
}) {
  const data = useMemo(() => {
    const totalDemand = cb.totalMonthlyDemand > 0
      ? cb.totalMonthlyDemand
      : cb.categories.reduce((s, c) => s + c.monthlyDemand, 0);
    const floor = totalDemand * 0.02;

    const rows: CatSummaryRow[] = cb.categories
      .filter(c => c.monthlyDemand > 0)
      .map(cat => {
        const stats    = categoryRankStats[cat.name];
        const clientP1 = (stats?.page1Vol ?? 0) > 0 ? (stats?.page1Vol ?? 0) : cat.page1Demand;
        return {
          name:      cat.name,
          demand:    cat.monthlyDemand,
          clientP1,
          share:     (clientP1 / cat.monthlyDemand) * 100,
          avgPos:    stats && stats.count > 0 ? stats.posSum / stats.count : null,
          ranked:    stats?.count ?? 0,
          top3:      stats?.dist['1-3'] ?? 0,
          page2plus: (stats?.dist['11-20'] ?? 0) + (stats?.dist['21+'] ?? 0),
        };
      });

    const floored = rows.filter(r => r.demand >= floor);
    const pool    = floored.length >= 3 ? floored : rows;

    const strongest = pool
      .filter(r => r.clientP1 > 0)
      .sort((a, b) => b.share - a.share || (a.avgPos ?? 999) - (b.avgPos ?? 999))
      .slice(0, 3);

    const weakest = [...pool]
      .sort((a, b) => a.share - b.share || b.demand - a.demand)
      .slice(0, 3);

    const opportunity = pool
      .map(r => ({ ...r, uncaptured: Math.max(0, r.demand - r.clientP1) }))
      .filter(r => r.uncaptured > 0)
      .sort((a, b) => b.uncaptured - a.uncaptured)
      .slice(0, 3);

    // Competitor page-1 volume per category from uploaded competitor rows WITH positions
    const clientNorm      = normSovDomain(clientDomain);
    const compRows        = (dbKeywords ?? []).filter(r =>
      r.domain && r.source !== 'blocked' && normSovDomain(r.domain) !== clientNorm
    );
    const compRowsWithPos = compRows.filter(r => r.position != null);
    const byCat = new Map<string, Map<string, number>>();
    for (const r of compRowsWithPos) {
      if ((r.position as number) > 10) continue;
      // v7.336 (QC audit B6, Const II.8): stored membership only — an uploaded
      // competitor row with no stored category is skipped here (it cannot be
      // lexically filed under a client category), an honest omission (Const I.5).
      const cat = storedCategoryForKw(r.keyword, cb.keywordCategories);
      if (!cat) continue;
      const d = normSovDomain(r.domain as string);
      let m = byCat.get(cat);
      if (!m) { m = new Map(); byCat.set(cat, m); }
      m.set(d, (m.get(d) ?? 0) + (r.searchVolume ?? 0));
    }
    const outperform: Array<CatSummaryRow & { comp: string; compP1: number; compShare: number }> = [];
    for (const row of pool) {
      const m = byCat.get(row.name);
      if (!m) continue;
      let topD = ''; let topV = 0;
      m.forEach((v, d) => { if (v > topV) { topV = v; topD = d; } });
      if (topV > row.clientP1) {
        outperform.push({
          ...row, comp: topD, compP1: topV,
          compShare: (topV / row.demand) * 100,
        });
      }
    }
    outperform.sort((a, b) => (b.compP1 - b.clientP1) - (a.compP1 - a.clientP1));

    // v7.111: per-domain position diagnostics — surfaced when no competitor
    // outperforms so a domain whose rows never reach page 1 (Wayne's AirSculpt
    // case) is visible instead of silently absent.
    const diag = new Map<string, { rows: number; p1: number; minPos: number }>();
    for (const r of compRowsWithPos) {
      const d = normSovDomain(r.domain as string);
      let e = diag.get(d);
      if (!e) { e = { rows: 0, p1: 0, minPos: Infinity }; diag.set(d, e); }
      e.rows++;
      if ((r.position as number) <= 10) e.p1++;
      if ((r.position as number) < e.minPos) e.minPos = r.position as number;
    }
    const compDiag = Array.from(diag.entries()).map(([d, e]) => ({ domain: d, ...e }));

    return {
      strongest, weakest, opportunity,
      outperform:  outperform.slice(0, 3),
      hasCompPos:  compRowsWithPos.length > 0,
      hasCompRows: compRows.length > 0,
      compDiag,
    };
  }, [cb, categoryRankStats, dbKeywords, clientDomain]);

  const { strongest, weakest, opportunity, outperform, hasCompPos, hasCompRows, compDiag } = data;
  const posTxt = (p: number | null) => p != null ? ` · avg pos ${p.toFixed(1)}` : '';

  return (
    <div>
      <div className="grid grid-cols-4 gap-3">

        <SummaryCardShell accent={SUMMARY_ACCENTS.strong} label="Strongest Categories">
          {strongest.length === 0 && <SummaryEmpty text="No page-1 rankings in any major category yet." />}
          {strongest.length > 0 && (
            <>
              <SummaryHero
                name={strongest[0].name}
                stat={`${Math.round(strongest[0].share)}% page-1 share${posTxt(strongest[0].avgPos)}`}
                sub={`${fmtAnnual(strongest[0].demand)} annual demand · ${strongest[0].top3} of ${strongest[0].ranked} kws top 3`}
                accent={SUMMARY_ACCENTS.strong}
              />
              <SummaryRunnerUps
                accent={SUMMARY_ACCENTS.strong}
                rows={strongest.slice(1).map(r => ({ name: r.name, stat: `${Math.round(r.share)}% share${r.avgPos != null ? ` · pos ${r.avgPos.toFixed(1)}` : ''}` }))}
              />
            </>
          )}
        </SummaryCardShell>

        <SummaryCardShell accent={SUMMARY_ACCENTS.weak} label="Weakest Categories">
          {weakest.length === 0 && <SummaryEmpty text="No category demand data — run analysis to populate." />}
          {weakest.length > 0 && (
            <>
              <SummaryHero
                name={weakest[0].name}
                stat={`${Math.round(weakest[0].share)}% page-1 share${posTxt(weakest[0].avgPos)}`}
                sub={`${fmtAnnual(weakest[0].demand)} annual demand · ${weakest[0].page2plus} of ${weakest[0].ranked} kws page 2+`}
                accent={SUMMARY_ACCENTS.weak}
              />
              <SummaryRunnerUps
                accent={SUMMARY_ACCENTS.weak}
                rows={weakest.slice(1).map(r => ({ name: r.name, stat: `${Math.round(r.share)}% share${r.avgPos != null ? ` · pos ${r.avgPos.toFixed(1)}` : ''}` }))}
              />
            </>
          )}
        </SummaryCardShell>

        <SummaryCardShell accent={SUMMARY_ACCENTS.comp} label="Competitor Outperforming">
          {!hasCompRows && <SummaryEmpty text="No competitor keywords uploaded — add competitor CSVs (Competitors button) to enable this comparison." />}
          {hasCompRows && !hasCompPos && <SummaryEmpty text="Competitor CSVs have no rank positions — re-upload with a Position column to enable this comparison." />}
          {hasCompPos && outperform.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <SummaryEmpty text="No major category where a competitor's page-1 volume beats yours." />
              <div style={{ borderTop: '1px solid var(--c-1a1a2a)', paddingTop: '7px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {compDiag.map(c => (
                  <p key={c.domain} style={{ fontSize: '10px', lineHeight: 1.5, margin: 0, color: c.p1 === 0 ? 'var(--c-d9a23f)' : 'var(--c-555570)' }}>
                    {c.domain}: {c.rows.toLocaleString()} kws · {c.p1.toLocaleString()} page-1
                    {c.p1 === 0 && ` (best pos ${isFinite(c.minPos) ? c.minPos : '—'}) — verify CSV Position column if unexpected`}
                  </p>
                ))}
              </div>
            </div>
          )}
          {outperform.length > 0 && (
            <>
              <SummaryHero
                name={outperform[0].name}
                stat={`${outperform[0].comp} leads · ${Math.round(outperform[0].compShare)}% vs your ${Math.round(outperform[0].share)}%`}
                sub={`page-1 volume share · ${fmtAnnual(outperform[0].demand)} annual demand`}
                accent={SUMMARY_ACCENTS.comp}
              />
              <SummaryRunnerUps
                accent={SUMMARY_ACCENTS.comp}
                rows={outperform.slice(1).map(r => ({ name: r.name, stat: `${r.comp} ${Math.round(r.compShare)}% vs ${Math.round(r.share)}%` }))}
              />
            </>
          )}
        </SummaryCardShell>

        <SummaryCardShell accent={SUMMARY_ACCENTS.opp} label="Largest Opportunity">
          {opportunity.length === 0 && <SummaryEmpty text="Your page 1 already captures effectively all major category demand." />}
          {opportunity.length > 0 && (
            <>
              <SummaryHero
                name={opportunity[0].name}
                stat={`${fmtAnnual(opportunity[0].uncaptured)} annual searches uncaptured`}
                sub={`${Math.min(100, Math.round((opportunity[0].uncaptured / opportunity[0].demand) * 100))}% of category demand not on your page 1`}
                accent={SUMMARY_ACCENTS.opp}
              />
              <SummaryRunnerUps
                accent={SUMMARY_ACCENTS.opp}
                rows={opportunity.slice(1).map(r => ({ name: r.name, stat: `${fmtAnnual(r.uncaptured)} uncaptured` }))}
              />
            </>
          )}
        </SummaryCardShell>

      </div>
      <p style={{ fontSize: '9px', color: 'var(--c-3a3a55)', margin: '6px 2px 0' }}>
        Share = client page-1 volume vs category demand · competitor comparison from uploaded competitor keyword positions · categories under 2% of total demand excluded
      </p>
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
          background: isExpanded ? 'var(--ca-108-99-255-0_06)' : 'transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--ca-255-255-255-0_02)'; }}
        onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Chevron */}
        <span style={{ fontSize: '10px', color: isExpanded ? 'var(--c-8b85ff)' : 'var(--c-444458)', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
          ▶
        </span>

        {/* Category name + mini share bar */}
        <div>
          <span style={{ fontSize: '13px', color: dimmed ? 'var(--c-666680)' : (isExpanded ? 'var(--c-c0b8ff)' : 'var(--c-f0f0ff)') }}>{cat.name}</span>
          <div style={{ marginTop: '5px', height: '3px', width: '85%', background: 'var(--c-1e1e2e)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${barW}%`, height: '100%', background: dimmed ? 'var(--c-555570)' : 'var(--c-6c63ff)', borderRadius: '2px', transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {/* Annual demand (total market demand from synthesis) */}
        <span style={{ fontSize: '12px', color: 'var(--c-8888aa)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fmtAnn(annualDemand)}
        </span>

        {/* Page 1 (from full keyword footprint via stored category membership — v7.336 B6) */}
        <span style={{ fontSize: '12px', fontWeight: hasPage1 ? 600 : 400, color: hasPage1 ? (dimmed ? 'var(--c-555570)' : 'var(--c-8b85ff)') : 'var(--c-444458)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {hasPage1 ? fmtAnn(page1Monthly) : '—'}
        </span>

        {/* Share */}
        <span style={{ fontSize: '13px', fontWeight: 600, color: hasPage1 ? (dimmed ? 'var(--c-555570)' : 'var(--c-f0f0ff)') : 'var(--c-444458)', textAlign: 'right' }}>
          {hasPage1 ? `${share.toFixed(1)}%` : '—'}
        </span>

        {/* Avg position */}
        <span style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: avgPos === null ? 'var(--c-444458)' : avgPos <= 3 ? 'var(--c-6c63ff)' : avgPos <= 10 ? 'var(--c-06b6d4)' : avgPos <= 20 ? 'var(--c-f59e0b)' : 'var(--c-ef4444)' }}>
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
              <span style={{ fontSize: '9px', color: 'var(--c-555570)', flexShrink: 0 }}>{totalInCat}</span>
            </>
          ) : (
            <span style={{ fontSize: '10px', color: 'var(--c-333350)' }}>—</span>
          )}
        </div>
      </div>

      {/* Expanded keyword sub-table */}
      {isExpanded && (
        <div style={{ background: 'var(--c-070710)', borderBottom: '1px solid var(--c-1a1a30)', padding: '0 12px 12px 36px' }}>
          {expandedKws.length === 0 ? (
            <p style={{ fontSize: '11px', color: 'var(--c-444458)', padding: '12px 0' }}>No ranked keywords found for this category in your current footprint.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px', padding: '8px 0 4px', borderBottom: '1px solid var(--c-111120)' }}>
                {['Pos', 'Keyword', 'Vol / mo', 'Annual Vol'].map((h, i) => (
                  <span key={h} style={{ fontSize: '9px', color: 'var(--c-404060)', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '.06em', textAlign: i > 1 ? 'right' : 'left' as const }}>{h}</span>
                ))}
              </div>
              {expandedKws.slice(0, 25).map((kw, idx) => (
                <div key={kw.keyword} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 90px 90px', padding: '5px 0', borderBottom: '1px solid var(--ca-255-255-255-0_03)', background: idx % 2 === 0 ? 'transparent' : 'var(--ca-255-255-255-0_01)' }}>
                  <PosBadge pos={kw.position} />
                  <span style={{ fontSize: '12px', color: 'var(--c-c0c0e0)', alignSelf: 'center', paddingLeft: '4px' }}>{kw.keyword}</span>
                  <span style={{ fontSize: '11px', color: 'var(--c-666688)', textAlign: 'right', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{kw.searchVolume.toLocaleString()}</span>
                  <span style={{ fontSize: '11px', color: 'var(--c-505070)', textAlign: 'right', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{fmtAnn(kw.searchVolume)}</span>
                </div>
              ))}
              {expandedKws.length > 25 && (
                <p style={{ fontSize: '10px', color: 'var(--c-444458)', paddingTop: '8px', textAlign: 'center' }}>
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
        background: 'var(--ca-255-255-255-0_04)', border: '1px solid var(--ca-255-255-255-0_08)',
        color: 'var(--c-444458)', fontSize: '11px', flexShrink: 0,
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

// v7.335 (QC audit B2, Const I.5a/II.7): the CTR-by-position model (GrowthSRC 2025),
// normSovDomain() and computeSov() moved VERBATIM to the shared server-safe module
// lib/sov/model.ts, so the PDF export route (app/api/reports/pdf) renders the SAME
// page-1 click-capture Share of Voice + capture math as this panel and the Exec —
// one model, no fork. Re-exported here byte-compatibly so existing importers
// (ExecutiveSummarySection imports { SovPanel, computeSov, ctrAt } from this file)
// compile unchanged.
export { CTR_BY_POSITION, PAGE1_CTR_SUM, CTR_SOURCE_LABEL, ctrAt, computeSov, normSovDomain } from '@/lib/sov/model';
export type { SovComputed, SovRawEntry } from '@/lib/sov/model';

interface SovArc extends SovRawEntry {
  pct:        number;
  dash:       number;
  dashOffset: number;
}

function LegendRow({ arc }: { arc: SovArc }) {
  // v7.94: client rows carry the actual client name/domain in arc.domain
  const label    = arc.domain.replace(/^www\./, '');
  const isClient = arc.type === 'client';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
      <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: arc.color, flexShrink: 0 }} />
      <span style={{
        fontSize: isClient ? '12px' : '11px',
        color: isClient ? 'var(--c-c0c0e8)' : 'var(--c-888899)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
        flex: 1, fontWeight: isClient ? 600 : 400,
      }}>
        {label}
      </span>
      <span style={{ fontSize: '10px', color: arc.color, fontWeight: isClient ? 700 : 400, flexShrink: 0, marginLeft: '4px', fontVariantNumeric: 'tabular-nums' }}>
        {/* v7.91: sub-1% shares show one decimal instead of rounding to a misleading 0% */}
        {arc.pct > 0 && arc.pct < 0.01 ? `${(arc.pct * 100).toFixed(1)}%` : `${Math.round(arc.pct * 100)}%`}
      </span>
    </div>
  );
}


export function SovPanel({ analysis, competitors, dbKeywords, clientLabel, title, footer }: { analysis: any; competitors?: string[]; dbKeywords?: any[]; clientLabel?: string; title?: string; footer?: ReactNode }) {
  const {
    basis, rawEntries, total, sovPct, capturedClicks, availableClicks,
    totalVolMonthly, page1VolMonthly, page1KwCount, totalKwCount, clientDisplay, ctrSource,
    compEntries, compGaps,
  } = computeSov({ analysis, competitors, dbKeywords, clientLabel });

  // Honest-gap empty state (Const I.5) — no footprint volume to compute over.
  if (basis === 'empty' || availableClicks <= 0) {
    return (
      <div className="orbit-card p-5 flex flex-col gap-3">
        <p className="text-orbit-secondary text-xs font-medium">{title ?? 'Share of Voice'}</p>
        <p style={{ fontSize: '12px', color: 'var(--c-555570)' }}>
          No page-1 keyword data available yet. Run an analysis to populate.
        </p>
        {footer}
      </div>
    );
  }

  // Donut = two slices: client captured clicks (the SoV %) + open / uncaptured
  // page-1 clicks. Rotated -90° so the arc starts at 12 o'clock.
  const R = 55; const C = 2 * Math.PI * R; const GAP = 1.5;
  let cumPct = 0;
  const arcs: SovArc[] = rawEntries.map(e => {
    const pct        = total > 0 ? e.traffic / total : 0;
    const dash       = Math.max(0, pct * C - GAP);
    const dashOffset = cumPct * C;
    cumPct += pct;
    return { ...e, pct, dash, dashOffset };
  });
  const clientArc = arcs.find(a => a.type === 'client');
  const compArcs  = arcs.filter(a => a.type === 'competitor');
  const serpArcs  = arcs.filter(a => a.type === 'serp');   // v7.322: top SERP rivals
  const openArc   = arcs.find(a => a.type === 'open');
  const anyCompArcs = compArcs.length > 0 || serpArcs.length > 0;
  const sovDisplay = sovPct > 0 && sovPct < 0.01 ? (sovPct * 100).toFixed(1) : String(Math.round(sovPct * 100));

  return (
    <div className="orbit-card p-5 flex flex-col gap-3">
      <div>
        <p className="text-orbit-secondary text-xs font-medium">{title ?? 'Share of Voice'}</p>
        <p style={{ fontSize: '9px', color: 'var(--c-4a4a70)', marginTop: 2 }}>
          page-1 click capture — modeled clicks won &divide; all page-1 clicks available across the footprint
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        {/* Donut SVG — group rotated -90° so the arc path starts at 12 o'clock */}
        <div style={{ flexShrink: 0 }}>
          <svg width="144" height="144" viewBox="0 0 144 144" role="img"
            aria-label={`Page-1 Share of Voice. Client captures an estimated ${sovDisplay}% of the page-1 clicks available across its footprint.`}>
            <title>Page-1 Share of Voice (modeled)</title>
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
            {/* Inner fill OUTSIDE the rotated group so text renders upright */}
            <circle cx="72" cy="72" r="45" style={{fill:'var(--c-0f0f1c)'}} />
            <text x="72" y="66" textAnchor="middle" fontSize="17" fontWeight="700" style={{fill:'var(--c-f0f0ff)'}}>
              {sovDisplay}%
            </text>
            <text x="72" y="80" textAnchor="middle" fontSize="7.5" style={{fill:'var(--c-7878a0)'}} letterSpacing=".06em">
              PAGE-1 SOV
            </text>
            <text x="72" y="90" textAnchor="middle" fontSize="6.5" style={{fill:'var(--c-55557a)'}} letterSpacing=".04em">
              est.
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {clientArc && <LegendRow arc={clientArc} />}

          {compArcs.length > 0 && (
            <>
              <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--c-3a3a5c)', letterSpacing: '.08em', textTransform: 'uppercase' as const, margin: '7px 0 3px' }}>
                {serpArcs.length > 0 ? 'Tracked competitors (page-1 capture)' : 'Competitors (page-1 capture)'}
              </p>
              {compArcs.map(a => <LegendRow key={a.domain} arc={a} />)}
            </>
          )}

          {/* v7.322: top SERP rivals — Semrush auto-discovered organic competitors,
              scored on the SAME page-1-capture basis + denominator from real positions. */}
          {serpArcs.length > 0 && (
            <>
              <p style={{ fontSize: '9px', fontWeight: 600, color: 'var(--c-d9a23f)', letterSpacing: '.08em', textTransform: 'uppercase' as const, margin: '8px 0 3px' }}>
                Top SERP rivals (page-1 capture)
              </p>
              {serpArcs.map(a => <LegendRow key={a.domain} arc={a} />)}
              <p style={{ fontSize: '9px', color: 'var(--c-55557a)', lineHeight: 1.5, margin: '3px 0 0' }}>
                largest organic rivals on your footprint &middot; real page-1 positions, same denominator
              </p>
            </>
          )}

          {openArc && (
            <div style={{ marginTop: anyCompArcs ? '7px' : '0', paddingTop: anyCompArcs ? '5px' : '0', borderTop: anyCompArcs ? '1px solid var(--c-1a1a2e)' : 'none' }}>
              <LegendRow arc={openArc} />
            </div>
          )}

          <p style={{ fontSize: '10px', color: 'var(--c-6a6a90)', lineHeight: 1.5, margin: '6px 0 0' }}>
            Client wins <span style={{ color: 'var(--c-9b96ff)', fontWeight: 600 }}>~{Math.round(capturedClicks).toLocaleString()}</span> of
            {' '}~{Math.round(availableClicks).toLocaleString()} page-1 clicks/mo available across the footprint
            {anyCompArcs ? '; competitor slices are page-1 clicks they take on shared keywords.' : '.'}
          </p>
        </div>
      </div>

      {/* v7.366: G2 land-grab insight — the SAME computeSov() numbers the donut
          above renders (Const II.6); click figures stay labeled with the curve
          source (Const I.5a via ctrSource). One implementation — this panel is
          rendered on Google Ranks AND the Executive Summary. */}
      {(() => {
        const openEntry  = rawEntries.find(e => e.type === 'open');
        const rivals     = rawEntries.filter(e => e.type === 'competitor' || e.type === 'serp')
          .slice().sort((a, b) => b.traffic - a.traffic);
        return (
          <InsightBanner insight={landGrabInsight({
            clientPct: sovPct,
            openPct: total > 0 && openEntry ? openEntry.traffic / total : 0,
            availableClicks,
            topRival: rivals.length > 0 && total > 0
              ? { label: rivals[0].domain.replace(/^www\./, ''), pct: rivals[0].traffic / total }
              : null,
            ctrLabel: ctrSource,
          })} />
        );
      })()}

      {/* v7.246: competitors on file with no usable page-1 ranking on shared
          keywords — shown as an honest gap (Const I.5), never a modeled/zero slice. */}
      {compGaps.length > 0 && (
        <div style={{
          background: 'var(--ca-245-158-11-0_06)', border: '1px solid var(--ca-245-158-11-0_25)',
          borderRadius: '8px', padding: '8px 10px',
        }}>
          {compGaps.map(g => (
            <p key={g.domain} style={{ fontSize: '10px', color: 'var(--c-d9a23f)', lineHeight: 1.5, margin: 0 }}>
              <span style={{ fontWeight: 600 }}>{g.domain.replace(/^www\./, '')}</span>: {g.rows.toLocaleString()} keyword{g.rows === 1 ? '' : 's'} on file
              {g.hasPositions
                ? ` — none rank page 1 on your footprint (best position ${g.minPos ?? '—'}), so no Share-of-Voice slice yet.`
                : ' — no ranking positions uploaded, so its Share-of-Voice cannot be computed. Re-upload its CSV including a Position column.'}
            </p>
          ))}
        </div>
      )}

      {/* Modeled-estimate disclosure (Const I.1 / Art. IX labeled CTR exception) */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '9px', background: 'var(--ca-245-158-11-0_08)', border: '1px solid var(--ca-245-158-11-0_2)', color: 'var(--c-f59e0b)' }}>
          <span style={{ width: '5px', height: '5px', background: 'var(--c-f59e0b)', borderRadius: '50%' }} />
          modeled estimate
        </span>
        <span style={{ fontSize: '9px', color: 'var(--c-55557a)' }}>CTR curve: {ctrSource}</span>
      </div>

      {/* Underlying REAL inputs (Const I.1 verifiability) — volume & position are
          measured Semrush rows; only the CTR multiplier is modeled. */}
      <p style={{ fontSize: '9px', color: 'var(--c-383858)', margin: 0, lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' }}>
        data: {clientDisplay.replace(/^www\./, '')} · {totalKwCount.toLocaleString()} footprint kws · {page1KwCount.toLocaleString()} rank pg 1 · {fmtAnnual(page1VolMonthly)} pg-1 vol / {fmtAnnual(totalVolMonthly)} total vol·yr
      </p>
      <p style={{ fontSize: '9px', color: 'var(--c-44446a)', margin: 0, lineHeight: 1.5 }}>
        SoV = &Sigma;(volume &times; CTR at client position, pos 1&ndash;10) &divide; &Sigma;(volume &times; {PAGE1_CTR_SUM.toFixed(3)} page-1 CTR sum). Volume &amp; position are measured; CTR is the labeled model curve.
      </p>
      {footer}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function GoogleSerpSection({ analysis, projectId, kwVersion, projectName, domain, competitors, defaultClientThreshold = 0, defaultCompetitorThreshold = 0 }: Props) {
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
  }, [projectId, kwVersion]);   // v7.107: kwVersion bump → refetch uploaded keywords

  // ── v7.323: opt-in "Top SERP rivals" enrichment ────────────────────────────
  // Upload-footprint projects never pull Semrush competitor footprints, so the v7.322
  // SoV SERP-rival slices have no data. This deliberate, cost-shown action pulls only
  // the auto-discovered competitor footprints and patches the snapshot; the result is
  // injected into the donut without a full reload.
  type SerpPos = Record<string, Array<{ keyword: string; position: number }>>;
  const [serpOverride, setSerpOverride] = useState<SerpPos | null>(null);
  const [serpState,    setSerpState]    = useState<'idle' | 'estimating' | 'confirm' | 'running' | 'done' | 'error'>('idle');
  const [serpEstimate, setSerpEstimate] = useState<{ totalUnits: number; competitors: Array<{ domain: string; keywords: number }>; isCeiling?: boolean } | null>(null);
  const [serpMsg,      setSerpMsg]      = useState('');
  const [serpElapsed,  setSerpElapsed]  = useState(0);

  // Live elapsed-seconds indicator while the pull runs — shows the wait is alive (Art IV.2).
  useEffect(() => {
    if (serpState !== 'running') return;
    setSerpElapsed(0);
    const t = setInterval(() => setSerpElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [serpState]);

  async function fetchSerpEstimate() {
    setSerpState('estimating'); setSerpMsg('');
    try {
      const r = await fetch(`/api/projects/${projectId}/serp-rivals`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not estimate the pull.');
      setSerpEstimate(d); setSerpState('confirm');
    } catch (e: any) { setSerpMsg(String(e?.message ?? e)); setSerpState('error'); }
  }

  async function runSerpPull() {
    setSerpState('running'); setSerpMsg('');
    try {
      const r = await fetch(`/api/projects/${projectId}/serp-rivals`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'The pull failed.');
      setSerpOverride((d.serpCompetitorPositions ?? {}) as SerpPos);
      const n = d.rivalsFound ?? 0;
      setSerpMsg(n > 0
        ? `Added ${n} SERP rival${n === 1 ? '' : 's'}.`
        : ((d.warnings && d.warnings[0]) || 'Competitors pulled, but none rank page 1 on your footprint yet.'));
      setSerpState('done');
    } catch (e: any) { setSerpMsg(String(e?.message ?? e)); setSerpState('error'); }
  }

  // Inject the freshly-pulled positions into the analysis the SoV donut reads, so the
  // slices appear immediately without a page reload. Real positions only — never modeled.
  const sovAnalysis = serpOverride
    ? { ...analysis, semrushSnapshot: { ...(analysis?.semrushSnapshot ?? {}), serpCompetitorPositions: serpOverride } }
    : analysis;
  const sovHasSerp = !!(
    (analysis?.semrushSnapshot?.serpCompetitorPositions &&
      Object.keys(analysis.semrushSnapshot.serpCompetitorPositions).length) ||
    (serpOverride && Object.keys(serpOverride).length)
  );

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
  const { topKws, gapKwCount, gapVolMonthly, demandKwCount, demandVolMonthly } = useMemo(() => {
    const clientDomain = analysis?.semrushSnapshot?.domain ?? domain ?? '';
    const pool = buildKwPool({
      semrushSnapshot:  analysis?.semrushSnapshot,
      uploadedKeywords: dbKeywords,
      clientDomain,
      competitorDomains: competitors ?? [],
      clientVolMin:     defaultClientThreshold,
      competitorVolMin: defaultCompetitorThreshold,
      includeDemand:    true,   // v7.305: union the "missing demand" universe so Total reconciles to the Keyword Landscape
    });
    const gaps   = pool.filter(item => item.isGap);
    // v7.305: "missing demand" = real Semrush demand the footprint never ranked for
    // (origin:'demand', isGap:false, no client position). Counted in Total + the share
    // denominator, but kept OUT of the ranked footprint (topKws) so "Ranked Keywords"
    // and the rankings table stay honest — they list only real client rankings (Const I.1).
    const demand = pool.filter(item => !item.isGap && item.origin === 'demand');
    return {
      topKws: pool
        .filter(item => !item.isGap && item.origin !== 'demand')
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
      demandKwCount:    demand.length,
      demandVolMonthly: demand.reduce((s, k) => s + (k.searchVolume ?? 0), 0),
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

  // v7.320: RANKED-FOOTPRINT basis (Wayne 2026-06-29). The Volume Opportunity card — its
  // headline "% outside top 3" / "pos 4+" figure, the "out of … total" label, AND the
  // Positions 1–3 / 4–10 / Page 2+ bars — must all share ONE denominator: the ranked
  // footprint volume (totalVol). v7.305 had divided the headline and the Pg-1/Top-3 share
  // metrics by `totalVol + demandVolMonthly` (ranked + "missing demand"). Because the
  // missing-demand pool dwarfs the ranked footprint, that made "% outside top 3" round to
  // 100% even with real top-3 volume on file, printed an impossible "832.9M out of 20.6M
  // total", and labeled ~814M of UNRANKED demand as "pos 4+". Missing-demand keywords have
  // no SERP position, so they cannot be "outside top 3"; the full-market / uncaptured-demand
  // story lives in the Share-of-Voice panel instead (Const I.5a). This restores internal
  // consistency with the bars and reconciles with the Executive Summary's Volume Opportunity,
  // which now uses the same ranked basis (Const II.6/II.7).
  const volOutsideTop3 = totalVol - top3Vol;
  const pctOutsideTop3 = totalVol > 0 ? Math.round((volOutsideTop3 / totalVol) * 100) : 0;
  const top3VolPct     = totalVol > 0 ? Math.round((top3Vol / totalVol) * 100) : 0;
  // Volume-based page-1 share: % of the RANKED footprint volume captured at positions 1–10.
  // Count-based (page1Kws / posKws.length) is surfaced as sub-text only.
  const page1Pct       = totalVol > 0 ? Math.round((page1Vol / totalVol) * 100) : 0;

  // ── Bar chart ─────────────────────────────────────────────────────────────
  // (bar chart helpers removed — bar chart replaced with SovPanel)

  // ── Category Performance ──────────────────────────────────────────────────
  // Read category breakdown stored by the synthesis pipeline
  const rawCb = (analysis.semrushSnapshot?._categoryBreakdown ?? null) as CategoryBreakdown | null;

  // v7.224: enforce Constitution III.1 on the category breakdown feeding this panel.
  // The Keyword / Cluster / Journey / Content panels already strip COMPETITOR and
  // third-party brands (buildKwPool + the v7.196/v7.201/v7.208 guards in
  // ThemeClustersPanel), but the Google-Rank summary cards (Weakest / Competitor
  // Outperforming) and Category Performance read `_categoryBreakdown` directly and
  // had NO such guard — so a competitor-brand category (e.g. "Wells Fargo Brand
  // Searches" on a TD Bank project) leaked through. Mirror the ThemeClustersPanel
  // rule exactly: drop any brand-type category that is not the client's own brand,
  // plus any category whose NAME carries an auto-discovered / configured / blocklisted
  // competitor brand. The client's OWN brand category is always kept (its name
  // contains the client brand). This only REMOVES rows — never fabricates — and the
  // recomputed totals stay exact roll-ups of the surviving real categories (Art I),
  // working on already-stored analyses with no re-run.
  const cb = useMemo<CategoryBreakdown | null>(() => {
    if (!rawCb || !Array.isArray(rawCb.categories)) return rawCb;
    const snap         = analysis?.semrushSnapshot ?? {};
    const clientDomain = (snap?.domain ?? domain ?? '') as string;
    const compTokens   = buildCompetitorBrandTokens(snap, clientDomain, competitors ?? []);
    const exclTokens   = buildExcludedBrandTokens(snap);

    // v7.335 (QC audit B7, Const III.1a): include the client brand vocabulary
    // (snap._brandTerms — the same source buildKwPool reads) so a client brand
    // category recognizable ONLY via brandTerms (e.g. "Toronto Dominion Brand
    // Searches" for td.com) is KEPT as the client's own brand instead of being
    // dropped as a competitor brand. Mirrors lib/category/categoryGuard.ts.
    const brandTerms: string[] = Array.isArray((snap as any)?._brandTerms) ? (snap as any)._brandTerms : [];
    const isClientBrand = (name: string) => isBrandedKeyword(name, clientDomain, [], brandTerms);
    const isForbidden   = (name: string, type: string) =>
      (type === 'brand'                                && !isClientBrand(name)) ||
      (textHasCompetitorBrand(name, compTokens)        && !isClientBrand(name)) ||
      (textHasCompetitorBrand(name, exclTokens)        && !isClientBrand(name));

    const keptCats = rawCb.categories.filter(c => !isForbidden(c.name, c.type));
    if (keptCats.length === rawCb.categories.length) return rawCb;   // nothing forbidden — pass through

    const keptNames = new Set(keptCats.map(c => c.name));
    const keptKwCats: Record<string, string> = {};
    for (const [kw, cat] of Object.entries(rawCb.keywordCategories ?? {})) {
      if (keptNames.has(cat)) keptKwCats[kw] = cat;
    }
    return {
      ...rawCb,
      categories:         keptCats,
      keywordCategories:  keptKwCats,
      totalMonthlyDemand: keptCats.reduce((s, c) => s + (c.monthlyDemand ?? 0), 0),
      totalPage1Demand:   keptCats.reduce((s, c) => s + (c.page1Demand   ?? 0), 0),
    };
  }, [rawCb, analysis, domain, competitors]);

  // Compute per-category rank stats from the FULL merged topKws list.
  // v7.336 (QC audit B6, Const II.8/III.1b): STORED membership only. Keywords not in
  // the stored keywordCategories map accumulate under the honest UNCATEGORIZED bucket
  // (rendered as its own group at the end of Category Performance) instead of being
  // string-matched into a category the taxonomy never assigned. Nothing is dropped
  // from the stats (Const I.6) and nothing is fabricated (Const I.5).
  const categoryRankStats = useMemo<Record<string, CatRankStats>>(() => {
    if (!cb?.keywordCategories || !cb?.categories) return {};
    const stats: Record<string, CatRankStats> = {};
    const empty = (): CatRankStats => ({
      count: 0, posSum: 0, monthlyVol: 0, page1Vol: 0,
      dist: { '1-3': 0, '4-10': 0, '11-20': 0, '21+': 0 },
    });
    for (const kw of topKws) {
      const cat = storedCategoryForKw(kw.keyword, cb.keywordCategories) ?? UNCATEGORIZED;
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

  // ── v7.330: Rank-bucket summary cards ───────────────────────────────────────
  // Per-bucket keyword count + monthly volume, computed from the SAME posKws the
  // Volume Opportunity card + keyword table use (Const II.7 — one source). Share % is
  // bucket volume ÷ ranked-footprint volume (totalVol), so it reconciles with the
  // Volume Opportunity bars (v7.320 ranked basis). Real rows only (Const I.1).
  const bucketStats = useMemo(() => {
    const m: Record<string, { count: number; vol: number }> = {};
    for (const b of POSITION_BUCKETS) m[b.key] = { count: 0, vol: 0 };
    for (const k of posKws) {
      const b = POSITION_BUCKETS.find(bb => k.position >= bb.min && k.position <= bb.max);
      if (!b) continue;
      m[b.key].count++;
      m[b.key].vol += k.searchVolume ?? 0;
    }
    return m;
  }, [posKws]);

  // Download ONE bucket as XLSX — one row per keyword: rank bucket, stored topic
  // category ("Uncategorized" when the keyword has no stored membership — honest
  // bucket, I.5; v7.336 QC audit B6: never string-matched), keyword, monthly search
  // volume. Highest-volume first.
  function downloadRankBucket(b: typeof POSITION_BUCKETS[number]) {
    const rows = posKws
      .filter(k => k.position >= b.min && k.position <= b.max)
      .sort((a, c) => (c.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .map(k => ({
        bucket:   b.label,
        category: (cb ? (storedCategoryForKw(k.keyword, cb.keywordCategories) ?? UNCATEGORIZED) : ''),
        keyword:  k.keyword,
        volume:   k.searchVolume ?? 0,
      }));
    void exportRankBucketXLSX(rows, { clientName: projectName ?? domain ?? 'client', segment: b.label });
  }

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

  // v7.104: PAGINATION — rendering the full footprint (30K+ uploaded keywords)
  // in one table froze the browser ("Page Unresponsive"). Only the current page
  // renders; filters/sorts/stats still operate on the full set.
  const KW_PAGE_SIZE = 100;
  const [kwPage, setKwPage] = useState(0);
  const kwPageCount = Math.max(1, Math.ceil(filteredKws.length / KW_PAGE_SIZE));
  const kwSafePage  = Math.min(kwPage, kwPageCount - 1);
  const pagedKws = useMemo(
    () => filteredKws.slice(kwSafePage * KW_PAGE_SIZE, (kwSafePage + 1) * KW_PAGE_SIZE),
    [filteredKws, kwSafePage],
  );
  useEffect(() => { setKwPage(0); }, [filter, sortCol, sortAsc, filteredKws.length]);

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
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: 'var(--c-0f0f1e)', border: '1px solid var(--c-1e1e35)', color: 'var(--c-505070)' }}>
                Last scan: {scanDate}
              </span>
            )}
            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: 'var(--ca-66-133-244-0_1)', border: '1px solid var(--ca-66-133-244-0_2)', color: 'var(--c-6baaf8)' }}>
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
      {/* v7.109: leading "Total Keywords" card = full footprint (ranked + gap),
          identical to the Keyword Landscape totals, so the ranked-only scope of
          the next card is obvious: Total − Gap = Ranked. */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard
          label="Total Keywords"
          value={dbLoaded ? (totalKws + gapKwCount + demandKwCount).toLocaleString() : '—'}
          sub={dbLoaded
            ? `${fmtAnnual(totalVol + gapVolMonthly + demandVolMonthly)} annual vol — full footprint`
            : 'Loading…'}
          sub2={dbLoaded
            ? `matches Keyword Landscape · ${totalKws.toLocaleString()} ranked + ${demandKwCount.toLocaleString()} missing demand + ${gapKwCount.toLocaleString()} gap`
            : undefined}
        />
        <StatCard
          label="Ranked Keywords"
          value={dbLoaded ? totalKws.toLocaleString() : '—'}
          sub={dbLoaded
            ? `${top3Kws} in top 3 · ${fmtAnnual(totalVol)} annual vol`
            : 'Loading…'}
          sub2={dbLoaded && (gapKwCount + demandKwCount) > 0
            ? `${(gapKwCount + demandKwCount).toLocaleString()} kws (${fmtAnnual(gapVolMonthly + demandVolMonthly)}/yr) excluded — no client rankings · ${gapKwCount.toLocaleString()} gap + ${demandKwCount.toLocaleString()} missing demand`
            : undefined}
        />
        <StatCard
          label="PG 1 Vol. Share"
          value={dbLoaded ? `${page1Pct}%` : '—'}
          sub={dbLoaded ? `${page1Kws} of ${posKws.length} kws rank pg 1` : 'Loading…'}
          sub2={dbLoaded && page1Vol > 0 ? `${fmtAnnual(page1Vol)} annual vol at pg 1` : undefined}
          color="var(--c-6c63ff)"
        />
        <StatCard
          label="Wtd. Avg Position"
          value={dbLoaded ? (weightedPos > 0 ? weightedPos.toFixed(1) : '—') : '—'}
          sub="weighted by search volume"
          color={weightedPos > 0 && weightedPos <= 5 ? 'var(--c-22c55e)' : weightedPos <= 10 ? 'var(--c-f59e0b)' : 'var(--c-ef4444)'}
        />
        <StatCard
          label="Top-3 Volume Share"
          value={dbLoaded ? `${top3VolPct}%` : '—'}
          sub={dbLoaded ? `${fmtAnnual(top3Vol)} / yr in positions 1–3` : 'Loading…'}
          color="var(--c-22c55e)"
        />
      </div>

      {/* ── Rank-bucket filter cards (v7.330) ──
          Click a card to filter the keyword table to that bucket (click the active card
          again to clear back to All); the green icon downloads that bucket's keywords as
          Excel (rank bucket · topic category · keyword · monthly volume, one row per kw).
          Replaces the old filter-pill row that used to sit above the keyword table. */}
      <div className="grid grid-cols-4 gap-3">
        {POSITION_BUCKETS.map(b => {
          const st       = bucketStats[b.key] ?? { count: 0, vol: 0 };
          const active   = filter === b.key;
          const sharePct = totalVol > 0 ? (st.vol / totalVol) * 100 : 0;
          return (
            <div
              key={b.key}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`Filter keyword table to ${b.label}`}
              onClick={() => setFilter(active ? 'all' : (b.key as BucketKey))}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(active ? 'all' : (b.key as BucketKey)); } }}
              className="orbit-card"
              style={{
                position: 'relative', cursor: 'pointer', overflow: 'hidden',
                padding: active ? '13px' : '14px',
                border: active ? `2px solid ${b.hex}` : '1px solid var(--orbit-border)',
                transition: 'border-color .12s',
              }}
            >
              {active && (
                <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: b.hex, opacity: 0.08, pointerEvents: 'none' }} />
              )}
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--c-8888aa)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{b.label}</span>
                <SegmentDownloadButton title={`Download ${b.label} keywords (Excel)`} onDownload={() => downloadRankBucket(b)} />
              </div>
              <p style={{ position: 'relative', fontSize: '26px', fontWeight: 700, color: 'var(--c-f0f0ff)', margin: '8px 0 0', lineHeight: 1 }}>
                {dbLoaded ? st.count.toLocaleString() : '—'}
              </p>
              <p style={{ position: 'relative', fontSize: '11px', color: 'var(--c-6a6a90)', margin: '5px 0 0' }}>
                {fmtAnnual(st.vol)} / yr &middot; {sharePct.toFixed(1)}% of vol
              </p>
              <div style={{ position: 'relative', background: 'var(--c-1e1e2e)', borderRadius: '3px', height: '4px', marginTop: '9px' }}>
                <div style={{ background: b.hex, borderRadius: '3px', height: '4px', width: `${Math.min(100, sharePct)}%`, transition: 'width .6s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Two-col: Chart + Opportunity ── */}
      <div className="grid grid-cols-2 gap-3">

        {/* Share of Voice — v7.329: the opt-in "Add top SERP rivals" control now lives
            INSIDE this card (passed as `footer`), not as its own grid cell, so Volume
            Opportunity sits directly to its right again. */}
        <SovPanel
          analysis={sovAnalysis}
          competitors={competitors}
          dbKeywords={dbKeywords}
          clientLabel={projectName ?? domain}
          footer={!sovHasSerp ? (
            /* v7.323: opt-in pull of the top SERP rivals for projects whose snapshot has none
               (upload-footprint projects, or pre-v7.322 auto snapshots). Costs Semrush units,
               shown before running; pulls ONLY competitor footprints — uploaded data untouched. */
            <div style={{ marginTop: '2px', padding: '10px 12px', background: 'var(--c-131325)', border: '1px solid var(--c-2a2a4a)', borderRadius: '8px' }}>
              <p style={{ fontSize: '11px', color: 'var(--c-8a8ab0)', margin: '0 0 8px', lineHeight: 1.55 }}>
                <span style={{ color: 'var(--c-d9a23f)', fontWeight: 600 }}>Top SERP rivals</span> aren&rsquo;t loaded for this project. Pull the largest organic competitors from Semrush to add them to the donut as page-1-capture slices. Re-pulls only competitor footprints &mdash; your uploaded data is untouched &mdash; and costs Semrush units.
              </p>

              {serpState === 'idle' && (
                <button onClick={fetchSerpEstimate}
                  style={{ fontSize: '11px', fontWeight: 500, padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', background: 'var(--c-1a1a38)', color: 'var(--c-c0c0e8)', border: '1px solid var(--c-3a3a5c)' }}>
                  Add top SERP rivals&hellip;
                </button>
              )}
              {serpState === 'estimating' && <span style={{ fontSize: '11px', color: 'var(--c-7070a0)' }}>Estimating cost&hellip;</span>}
              {serpState === 'confirm' && serpEstimate && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '7px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--c-9a9ac0)', lineHeight: 1.5 }}>
                    ~<span style={{ color: 'var(--c-d9a23f)', fontWeight: 600 }}>{serpEstimate.totalUnits.toLocaleString()}</span>{serpEstimate.isCeiling ? ' (max)' : ''} Semrush units &middot; {serpEstimate.competitors.length} competitor{serpEstimate.competitors.length === 1 ? '' : 's'}{serpEstimate.competitors.length > 0 ? `: ${serpEstimate.competitors.map(c => c.domain).join(', ')}` : ''}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={runSerpPull}
                      style={{ fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', background: 'var(--c-6c63ff)', color: 'var(--c-f0f0ff)', border: '1px solid var(--c-6c63ff)' }}>
                      Pull now (~{serpEstimate.totalUnits.toLocaleString()} units)
                    </button>
                    <button onClick={() => setSerpState('idle')}
                      style={{ fontSize: '11px', fontWeight: 500, padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', color: 'var(--c-7070a0)', border: '1px solid var(--c-3a3a5c)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {serpState === 'running' && (
                <span style={{ fontSize: '11px', color: 'var(--c-9a9ac0)' }}>
                  Pulling {serpEstimate?.competitors.length ?? ''} competitor footprint{(serpEstimate?.competitors.length ?? 0) === 1 ? '' : 's'} from Semrush&hellip; {serpElapsed}s
                </span>
              )}
              {serpState === 'done'  && <span style={{ fontSize: '11px', color: 'var(--c-4ade80)' }}>{serpMsg}</span>}
              {serpState === 'error' && <span style={{ fontSize: '11px', color: 'var(--c-f87171)' }}>{serpMsg}</span>}
            </div>
          ) : null}
        />

        {/* Volume Opportunity */}
        <div className="orbit-card p-5 flex flex-col gap-4">
          <p className="text-orbit-secondary text-xs font-medium">Volume Opportunity Analysis</p>

          {/* Big metric */}
          {totalVol > 0 && (
            <>
              <div className="flex items-center gap-4 py-2">
                <div>
                  <p style={{ color: 'var(--c-ef4444)', fontSize: '40px', fontWeight: 700, lineHeight: 1, margin: 0 }}>
                    {pctOutsideTop3}%
                  </p>
                  <p style={{ color: 'var(--c-8888aa)', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', marginTop: '5px' }}>
                    of volume outside top 3
                  </p>
                </div>
                <div style={{ width: '1px', height: '56px', background: 'var(--c-1e1e2e)', flexShrink: 0 }} />
                <div>
                  <p style={{ color: 'var(--c-f0f0ff)', fontSize: '15px', fontWeight: 600, margin: 0 }}>
                    {fmtAnnual(volOutsideTop3)}
                    <span style={{ color: 'var(--c-444458)', fontWeight: 400, fontSize: '13px' }}> / yr</span>
                  </p>
                  <p style={{ color: 'var(--c-8888aa)', fontSize: '11px', margin: '4px 0 0' }}>
                    annual searches pos 4+
                  </p>
                  <p style={{ color: 'var(--c-555570)', fontSize: '10px', margin: '2px 0 0' }}>
                    out of {fmtAnnual(totalVol)} total
                  </p>
                </div>
              </div>

              {/* Volume breakdown bars */}
              <div className="flex flex-col gap-2.5">
                {[
                  { label: 'Positions 1–3', vol: top3Vol, color: 'var(--c-6c63ff)' },
                  { label: 'Positions 4–10', vol: page1Vol - top3Vol, color: 'var(--c-06b6d4)' },
                  { label: 'Page 2+ (11+)', vol: totalVol - page1Vol, color: 'var(--c-ef4444)' },
                ].map(row => {
                  const pct = totalVol > 0 ? (row.vol / totalVol) * 100 : 0;
                  return (
                    <div key={row.label}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: '11px', color: 'var(--c-8888aa)' }}>{row.label}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: row.color }}>
                          {fmtAnnual(row.vol)}<span style={{ color: 'var(--c-444458)', fontWeight: 400 }}> ({pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div style={{ background: 'var(--c-1e1e2e)', borderRadius: '3px', height: '5px' }}>
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
                background: 'var(--c-0f0f1e)', border: '1px solid var(--c-1e1e35)', borderLeft: '3px solid var(--c-6c63ff)',
                borderRadius: '0 8px 8px 0', padding: '10px 12px', marginTop: '4px',
              }}>
                <p style={{ fontSize: '11px', color: 'var(--c-8888aa)', lineHeight: 1.5, margin: 0 }}>
                  <span style={{ color: 'var(--c-c0c0e8)', fontWeight: 500 }}>Opportunity: </span>
                  Moving {Math.min(5, POSITION_BUCKETS[1] ? (posDist['4-10'] ?? 0) : 0)} of your Pos 4–10 keywords
                  into top 3 could unlock{' '}
                  <span style={{ color: 'var(--c-6c63ff)', fontWeight: 600 }}>
                    ~{fmtAnnual(Math.round((page1Vol - top3Vol) * 0.3))}
                  </span>{' '}
                  additional annual searches.
                </p>
              </div>
            </>
          )}

          {totalVol === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--c-555570)' }}>No keyword volume data available. Run analysis to see results.</p>
          )}
        </div>
      </div>

      {/* ── Category Position Summary (v7.110) ── */}
      {cb && cb.categories && cb.categories.length > 0 && (
        <CategoryPositionSummary
          cb={cb}
          categoryRankStats={categoryRankStats}
          dbKeywords={dbKeywords}
          clientDomain={analysis?.semrushSnapshot?.domain ?? domain ?? ''}
        />
      )}

      {/* ── Category Performance ── */}
      {cb && cb.categories && cb.categories.length > 0 && (
        <CategoryPerformanceSection
          cb={cb}
          categoryRankStats={categoryRankStats}
          topKws={topKws}
          filter={filter}
        />
      )}

      {/* ── Keyword Table ── */}
      <div className="orbit-card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-orbit-secondary text-xs font-medium">Keyword Rankings</p>
            <p style={{ fontSize: '10px', color: 'var(--c-444458)', marginTop: '2px' }}>
              {filteredKws.length} keyword{filteredKws.length !== 1 ? 's' : ''}
              {filter !== 'all' ? ` · filtered to ${POSITION_BUCKETS.find(b => b.key === filter)?.label}` : ''}
              {serpScannedCount > 0 && (
                <span style={{ color: 'var(--c-555570)' }}> · SERP features shown for {serpScannedCount} scanned keywords</span>
              )}
            </p>
          </div>

          {/* v7.330: the rank-bucket summary cards above are now the filter control
              (Option A — the old filter-pill row was removed). Keep just a small "Clear"
              affordance here when a bucket filter is active, so the table has an escape
              hatch without scrolling back up to the cards. */}
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '10px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--c-2a2a44)',
                color: 'var(--c-8888aa)', fontWeight: 500, transition: 'all .12s',
              }}
            >
              Clear filter ✕
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--c-1e1e2e)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', color: 'var(--c-555570)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '44px' }}>
                  <button onClick={() => toggleSort('position')} style={{ cursor: 'pointer', color: sortCol === 'position' ? 'var(--c-8b85ff)' : 'var(--c-555570)', display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', padding: 0 }}>
                    Pos {sortCol === 'position' && (sortAsc ? '↑' : '↓')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', color: 'var(--c-555570)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em' }}>Keyword</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: '10px', color: 'var(--c-555570)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '90px' }}>
                  <button onClick={() => toggleSort('volume')} style={{ cursor: 'pointer', color: sortCol === 'volume' ? 'var(--c-8b85ff)' : 'var(--c-555570)', display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', padding: 0, marginLeft: 'auto' }}>
                    Vol / mo {sortCol === 'volume' && (sortAsc ? '↓' : '↑')}
                  </button>
                </th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: '10px', color: 'var(--c-555570)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '90px' }}>Annual Vol</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', color: 'var(--c-555570)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', width: '140px' }}>SERP Features</th>
              </tr>
            </thead>
            <tbody>
              {pagedKws.map((kw, idx) => {
                const serpKw = serpKwMap[kw.keyword.toLowerCase().trim()];
                const isBranded = kw.branded === true;
                const rowBg = idx % 2 === 0 ? 'transparent' : 'var(--ca-255-255-255-0_012)';

                return (
                  <tr
                    key={kw.keyword}
                    style={{ borderBottom: '1px solid var(--ca-255-255-255-0_04)', background: rowBg }}
                  >
                    {/* Position */}
                    <td style={{ padding: '7px 8px' }}>
                      <PosBadge pos={kw.position} />
                    </td>

                    {/* Keyword */}
                    <td style={{ padding: '7px 8px' }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '12px', color: 'var(--c-d0d0f0)' }}>{kw.keyword}</span>
                        {isBranded && (
                          <span style={{
                            fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
                            background: 'var(--c-1a1a40)', border: '1px solid var(--c-3a3a80)',
                            color: 'var(--c-7070c0)', flexShrink: 0,
                          }}>brand</span>
                        )}
                      </div>
                    </td>

                    {/* Monthly vol */}
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: 'var(--c-8888aa)', fontVariantNumeric: 'tabular-nums' }}>
                      {(kw.searchVolume ?? 0).toLocaleString()}
                    </td>

                    {/* Annual vol */}
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: '12px', color: 'var(--c-6060a0)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtAnnual(kw.searchVolume ?? 0)}
                    </td>

                    {/* SERP Features */}
                    <td style={{ padding: '7px 8px' }}>
                      {serpKw ? (
                        <div className="flex flex-wrap gap-1">
                          {serpKw.serpFeatures.map(f => <FeaturePill key={f} feature={f} />)}
                          {serpKw.serpFeatures.length === 0 && (
                            <span style={{ fontSize: '10px', color: 'var(--c-333350)' }}>no features</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '10px', color: 'var(--c-2a2a40)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredKws.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--c-444458)', fontSize: '13px' }}>
              No keywords in this position range.
            </div>
          )}
          {filteredKws.length > KW_PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px', borderTop: '1px solid var(--c-1e1e2e)' }}>
              <span style={{ fontSize: '11px', color: 'var(--c-555570)' }}>
                Showing {(kwSafePage * KW_PAGE_SIZE + 1).toLocaleString()}–{Math.min((kwSafePage + 1) * KW_PAGE_SIZE, filteredKws.length).toLocaleString()} of {filteredKws.length.toLocaleString()}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button type="button" onClick={() => setKwPage(0)} disabled={kwSafePage === 0} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: 'transparent', border: '1px solid var(--c-2a2a44)', color: 'var(--c-8888b0)', cursor: 'pointer', opacity: kwSafePage === 0 ? 0.3 : 1 }}>« First</button>
                <button type="button" onClick={() => setKwPage(p => Math.max(0, p - 1))} disabled={kwSafePage === 0} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: 'transparent', border: '1px solid var(--c-2a2a44)', color: 'var(--c-8888b0)', cursor: 'pointer', opacity: kwSafePage === 0 ? 0.3 : 1 }}>‹ Prev</button>
                <span style={{ fontSize: '11px', color: 'var(--c-8888b0)', padding: '0 6px' }}>Page {(kwSafePage + 1).toLocaleString()} of {kwPageCount.toLocaleString()}</span>
                <button type="button" onClick={() => setKwPage(p => Math.min(kwPageCount - 1, p + 1))} disabled={kwSafePage >= kwPageCount - 1} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: 'transparent', border: '1px solid var(--c-2a2a44)', color: 'var(--c-8888b0)', cursor: 'pointer', opacity: kwSafePage >= kwPageCount - 1 ? 0.3 : 1 }}>Next ›</button>
                <button type="button" onClick={() => setKwPage(kwPageCount - 1)} disabled={kwSafePage >= kwPageCount - 1} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: 'transparent', border: '1px solid var(--c-2a2a44)', color: 'var(--c-8888b0)', cursor: 'pointer', opacity: kwSafePage >= kwPageCount - 1 ? 0.3 : 1 }}>Last »</button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

