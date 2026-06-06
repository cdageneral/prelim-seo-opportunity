'use client';
import { useEffect, useMemo, useState } from 'react';

/**
 * SerpFeaturesSection — v7.40
 *
 * Full AIO tracker experience inside OrbitIQ's SERP Features panel.
 * All data computed from serpApiSnapshot + project.competitors — no new API calls needed.
 *
 * AIO Tab now contains:
 *  1. KPI strip  — Available AIOs, AIO Penetration, Citation Rate, Citation Share,
 *                  Avg Citation Position, Top Competitor, Others share
 *  2. Citation Landscape — Tracked Brands table (Brand / Domain / AIOs Acquired /
 *                          Citation Slots / Citation Rate) + Other Domains tab + All tab
 *  3. Keyword Drilldown — filter pills (AIOs / Missing / Won / All), table with
 *                         Keyword / AIO / Citations / Top Winner / Client Position
 *
 * PAA, Video, More Features tabs: unchanged from v7.39.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

interface SerpKw {
  keyword:          string;
  serpFeatures:     string[];
  hasAIO:           boolean;
  aioSources:       Array<{ domain: string; title: string; url: string }>;
  aioText?:         string;   // v7.126: AI Overview answer text (absent on pre-v7.126 scans)
  paaQuestions:     string[];
  paaClientCited:   boolean;
  paaSources?:      Array<{ question: string; title: string; url: string; domain: string }>;   // v7.117 (absent on older scans)
  videoClientCited: boolean;
  videoSources?:    Array<{ title: string; url: string; domain: string; channel?: string }>;   // v7.117 (absent on older scans)
  clientRank:       number | null;
  scannedAt?:       string;   // v7.122: per-keyword scan timestamp (absent on older scans)
}

interface Competitor { id: string; domain: string; name: string | null; }

interface Props {
  analysis:    any;
  competitors?: Competitor[];
  clientName?:  string;
  websiteUrl?:  string;
  projectId?:   string;   // v7.103: enables uploaded SERP-feature availability
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  externalScanned?: SerpKw[];   // v7.132: live results from the page-level background SERP scan — merged into the scanned set, fresh-wins
}

type FeatureTab  = 'aio' | 'paa' | 'video' | 'more';
type LandscapeTab = 'brands' | 'others' | 'all';
type KwFilter    = 'aio' | 'missing' | 'won' | 'all';

// ── Domain helpers ─────────────────────────────────────────────────────────────

function normDomain(d: string): string {
  return (d ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase().trim();
}
function domainsMatch(a: string, b: string): boolean {
  const na = normDomain(a), nb = normDomain(b);
  if (!na || !nb) return false;
  return na === nb || na.endsWith('.' + nb) || nb.endsWith('.' + na);
}

// ── v7.103: uploaded Semrush "SERP Features by Keyword" support ───────────────
// Semrush exports list features as a comma-separated cell, e.g.
// "AI overview, People also ask, Video, Featured snippet". We map those names
// onto the same feature buckets the SerpAPI scan uses. Matching is
// case-insensitive substring so minor Semrush label variations still map.

interface UploadKwRow { keyword: string; serpFeatures: string | null; source: string; }

function semrushFeaturesToBuckets(raw: string): Set<string> {
  const out = new Set<string>();
  const f = raw.toLowerCase();
  if (f.includes('ai overview'))                          out.add('ai_overview');
  if (f.includes('people also ask'))                      out.add('paa');
  if (f.includes('video'))                                out.add('video_carousel'); // covers "Video", "Featured video", "Video carousel"
  if (f.includes('featured snippet'))                     out.add('featured_snippet');
  if (f.includes('knowledge panel'))                      out.add('knowledge_panel');
  if (f.includes('local pack'))                           out.add('local_pack');
  if (f.includes('shopping'))                             out.add('shopping');
  if (f.includes('image'))                                out.add('image_pack');
  return out;
}

interface UploadFeatureCounts {
  rowsWithFeatureData: number;  // uploaded keywords carrying a SERP Features cell (deduped, unscanned only)
  aio:   number;
  paa:   number;
  video: number;
  more:  Record<string, number>; // featured_snippet / knowledge_panel / local_pack / shopping / image_pack
}

function countUploadFeatures(rows: UploadKwRow[], scannedSet: Set<string>): UploadFeatureCounts {
  const more: Record<string, number> = { featured_snippet: 0, knowledge_panel: 0, local_pack: 0, shopping: 0, image_pack: 0 };
  let aio = 0, paa = 0, video = 0, withData = 0;
  // Dedupe by keyword — the same keyword can exist under client + competitor rows.
  const seen = new Set<string>();
  for (const r of rows) {
    const kw = (r.keyword ?? '').trim().toLowerCase();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    if (scannedSet.has(kw)) continue;            // scanned keywords already counted from live SERP data
    if (r.source === 'blocked') continue;
    if (!r.serpFeatures) continue;
    const buckets = semrushFeaturesToBuckets(r.serpFeatures);
    if (buckets.size === 0) continue;
    withData++;
    if (buckets.has('ai_overview'))   aio++;
    if (buckets.has('paa'))           paa++;
    if (buckets.has('video_carousel')) video++;
    for (const k of Object.keys(more)) if (buckets.has(k)) more[k]++;
  }
  return { rowsWithFeatureData: withData, aio, paa, video, more };
}

// ── Data computation ───────────────────────────────────────────────────────────

interface BrandStats {
  name:          string;
  domain:        string;
  isClient:      boolean;
  aiosAcquired:  number;
  citationSlots: number;
  citationRate:  number; // aiosAcquired / totalAios
}

interface EnrichedKw extends SerpKw {
  citationCount:       number;
  clientCitedPosition: number | null; // 1-based; null = not cited
  topWinnerName:       string;
  topWinnerDomain:     string | null;
  topWinnerPosition:   number | null; // position of top tracked brand in source list
  isClientCited:       boolean;
}

function useAIOData(
  scannedKws:  SerpKw[],
  clientDomain: string,
  clientName:   string,
  competitors:  Competitor[],
  aioSummaryClientCited: number,
) {
  return useMemo(() => {
    const aioKws = scannedKws.filter(k => k.hasAIO);
    const totalAios = aioKws.length;
    const totalSlots = aioKws.reduce((n, k) => n + (k.aioSources?.length ?? 0), 0);

    // All tracked brands: client + configured competitors
    const brands: Array<{ name: string; domain: string; isClient: boolean }> = [
      { name: clientName || clientDomain, domain: clientDomain, isClient: true },
      ...(competitors ?? []).map(c => ({
        name: c.name || normDomain(c.domain),
        domain: normDomain(c.domain),
        isClient: false,
      })),
    ].filter(b => b.domain);

    // Per-brand stats computed from raw keyword data
    const brandStats: BrandStats[] = brands.map(b => {
      const aiosAcquired = aioKws.filter(kw =>
        (kw.aioSources ?? []).some(s => domainsMatch(s.domain, b.domain))
      ).length;
      const citationSlots = aioKws.reduce((n, kw) =>
        n + (kw.aioSources ?? []).filter(s => domainsMatch(s.domain, b.domain)).length, 0
      );
      return {
        ...b,
        aiosAcquired,
        citationSlots,
        citationRate: totalAios > 0 ? aiosAcquired / totalAios : 0,
      };
    }).sort((a, b) => b.aiosAcquired - a.aiosAcquired);

    // Client stats
    const clientStats = brandStats.find(b => b.isClient) ?? brandStats[0];

    // KPI: citation share (client slots / total slots)
    const clientSlots = clientStats?.citationSlots ?? 0;
    const citationShare = totalSlots > 0 ? clientSlots / totalSlots : 0;

    // KPI: avg citation position (average 1-based index of client in source lists)
    const citedKws = aioKws.filter(kw =>
      (kw.aioSources ?? []).some(s => domainsMatch(s.domain, clientDomain))
    );
    const avgCitationPosition = citedKws.length > 0
      ? citedKws.reduce((sum, kw) => {
          const idx = (kw.aioSources ?? []).findIndex(s => domainsMatch(s.domain, clientDomain));
          return sum + (idx + 1);
        }, 0) / citedKws.length
      : null;

    // Top competitor (highest-cited non-client brand)
    const topCompetitor = brandStats.find(b => !b.isClient) ?? null;

    // Others share (citation slots NOT from any tracked brand)
    const trackedDomains = new Set(brands.map(b => normDomain(b.domain)));
    const otherSlots = aioKws.reduce((n, kw) =>
      n + (kw.aioSources ?? []).filter(s => !trackedDomains.has(normDomain(s.domain))).length, 0
    );
    const othersShare = totalSlots > 0 ? otherSlots / totalSlots : 0;

    // Other domains (non-tracked) — v7.116: track BOTH distinct AIOs acquired
    // (keywords where the domain is cited at least once) and total citation
    // slots, so the landscape table reports the same metrics for every row.
    const otherDomainMap = new Map<string, { aios: number; slots: number }>();
    aioKws.forEach(kw => {
      const seenThisKw = new Set<string>();
      (kw.aioSources ?? []).forEach(s => {
        const d = normDomain(s.domain);
        if (d && !trackedDomains.has(d)) {
          const e = otherDomainMap.get(d) ?? { aios: 0, slots: 0 };
          e.slots += 1;
          if (!seenThisKw.has(d)) { e.aios += 1; seenThisKw.add(d); }
          otherDomainMap.set(d, e);
        }
      });
    });
    const otherDomains = Array.from(otherDomainMap.entries())
      .map(([domain, v]) => ({
        domain,
        aiosAcquired:  v.aios,
        citationSlots: v.slots,
        citationRate:  totalAios > 0 ? v.aios / totalAios : 0,  // market rate, same basis as brands
      }))
      .sort((a, b) => b.aiosAcquired - a.aiosAcquired || b.citationSlots - a.citationSlots)
      .slice(0, 30);

    // Enriched keyword data for drilldown
    const enrichedKws: EnrichedKw[] = scannedKws.map(kw => {
      if (!kw.hasAIO) {
        return { ...kw, citationCount: 0, clientCitedPosition: null, topWinnerName: '—', topWinnerDomain: null, topWinnerPosition: null, isClientCited: false };
      }
      const sources = kw.aioSources ?? [];
      const clientIdx = sources.findIndex(s => domainsMatch(s.domain, clientDomain));
      // Top winner = first source that matches a tracked brand (or first source overall)
      let topWinnerName = sources[0]?.domain ?? '—';
      let topWinnerDomain = sources[0]?.domain ?? null;
      let topWinnerPosition: number | null = sources.length > 0 ? 1 : null;
      for (let i = 0; i < sources.length; i++) {
        const brand = brands.find(b => domainsMatch(sources[i].domain, b.domain));
        if (brand) {
          topWinnerName = brand.name;
          topWinnerDomain = sources[i].domain;
          topWinnerPosition = i + 1;
          break;
        }
      }
      return {
        ...kw,
        citationCount:       sources.length,
        clientCitedPosition: clientIdx >= 0 ? clientIdx + 1 : null,
        topWinnerName,
        topWinnerDomain,
        topWinnerPosition,
        isClientCited:       clientIdx >= 0,
      };
    });

    return {
      totalAios, totalSlots, brandStats, clientStats,
      citationShare, avgCitationPosition, topCompetitor, othersShare,
      otherDomains, enrichedKws,
    };
  }, [scannedKws, clientDomain, clientName, competitors, aioSummaryClientCited]);
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function FeatureRateCard({ label, color, rate, acquired, available, active, onClick }: {
  label: string; color: string; rate: number; acquired: number; available: number;
  active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col gap-2 text-left" style={{
      flex: 1, padding: '14px', borderRadius: '10px',
      background: active ? `${color}12` : '#0F0F1E',
      border: `1.5px solid ${active ? color : '#1E1E35'}`,
      cursor: 'pointer', transition: 'all .15s',
    }}>
      <div className="flex items-center gap-2">
        <span className="rounded-full shrink-0" style={{ width: '8px', height: '8px', background: color }} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#8888AA', textTransform: 'uppercase', letterSpacing: '.07em', flex: 1 }}>{label}</span>
        <span style={{ fontSize: '18px', fontWeight: 700, color }}>{rate}%</span>
      </div>
      <p style={{ fontSize: '11px', color: '#555570', margin: 0 }}>
        <span style={{ color: '#C0C0E8', fontWeight: 600 }}>{acquired}</span> cited /{' '}
        <span style={{ color: '#C0C0E8', fontWeight: 600 }}>{available}</span> available
      </p>
      <div style={{ background: '#1E1E2E', borderRadius: '3px', height: '3px' }}>
        <div style={{ background: color, borderRadius: '3px', height: '3px', width: `${Math.min(100, rate)}%` }} />
      </div>
    </button>
  );
}

function CitedBadge({ cited }: { cited: boolean }) {
  return cited ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#0A2A0A', border: '1px solid #22C55E44', color: '#22C55E', whiteSpace: 'nowrap' }}>✓ Cited</span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A0A0A', border: '1px solid #EF444433', color: '#EF4444', whiteSpace: 'nowrap' }}>✗ Not cited</span>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <p style={{ fontSize: '10px', fontWeight: 600, color: '#444458', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>{text}</p>;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} role="tab" aria-selected={active} style={{
      padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: active ? 600 : 500,
      color: active ? '#06070b' : '#d6dbe6', background: active ? '#6C63FF' : 'transparent',
      border: 'none', cursor: 'pointer', transition: 'background-color 120ms, color 120ms',
      whiteSpace: 'nowrap',
    }}>{children}</button>
  );
}

function TabBar({ children }: { children: React.ReactNode }) {
  return (
    <div role="tablist" style={{
      display: 'inline-flex', padding: 3, borderRadius: 10,
      background: '#08080F', border: '1px solid rgba(255,255,255,0.06)', gap: 2,
    }}>{children}</div>
  );
}

// ── KPI Cards strip ────────────────────────────────────────────────────────────

// v7.122: cards carry their own targeted actions. v7.123 (Wayne: "the banner
// button got lost — make UI changes intuitive"): ONE visual language, all
// actions INSIDE the card they affect —
//   amber  = fix stale data ("Refresh required")
//   violet = expand coverage (scan more keywords; cost always shown)
// The standalone AIO-scan banner was removed in favor of the in-card button.
interface CardStale {
  reason:   string;            // context line shown above the button
  label:    string;            // button label incl. credit cost
  onClick:  () => void;
  running:  boolean;
  progress: string | null;     // e.g. "12/34" while running
  tone?:    'amber' | 'violet';   // default amber
}

function CardActionButton({ a }: { a: CardStale }) {
  const violet = a.tone === 'violet';
  return (
    <>
      <p style={{ fontSize: '10px', color: violet ? '#8888AA' : '#F59E0B', margin: 0, lineHeight: 1.45, overflowWrap: 'break-word' }}>{a.reason}</p>
      <button
        onClick={a.onClick}
        disabled={a.running}
        style={{
          width: '100%', marginTop: '4px', padding: '7px 10px', borderRadius: '7px',
          fontSize: '11px', fontWeight: 600, border: 'none',
          background: a.running ? '#1A1A2E' : violet ? '#6C63FF' : '#F59E0B',
          color: a.running ? '#8888AA' : violet ? '#FFFFFF' : '#1A1205',
          cursor: a.running ? 'wait' : 'pointer',
        }}
      >
        {a.running ? `${violet ? 'Scanning' : 'Refreshing'}… ${a.progress ?? ''}` : a.label}
      </button>
    </>
  );
}

// v7.124 (Wayne): every scan shows a persistent progress indicator so the user
// always knows work is still happening. Bar pulses while a batch is in flight
// (progress counts only move between batches).
function ScanProgress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#0F0F1E', border: '1px solid #2A2A4A' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <p style={{ fontSize: '11px', color: '#C0C0E8', margin: 0, fontWeight: 600 }}>{label}</p>
        <p style={{ fontSize: '11px', color: '#8888AA', margin: 0 }}>{done} of {total} keywords · {pct}%</p>
      </div>
      <div style={{ background: '#1A1A2E', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
        <div className="animate-pulse" style={{ background: '#6C63FF', height: '6px', borderRadius: '3px', width: `${Math.max(pct, 3)}%`, transition: 'width .4s' }} />
      </div>
      <p style={{ fontSize: '10px', color: '#555570', margin: '6px 0 0' }}>
        Working — each batch of 25 keywords takes roughly 1–2 minutes. Results save after every batch, so nothing is lost if this stops; keep this tab open.
      </p>
    </div>
  );
}

function KpiCard({ label, value, sub, accent, wide, actions }: { label: string; value: string | number; sub?: string; accent?: string; wide?: boolean; actions?: Array<CardStale | null | undefined> }) {
  const acts = (actions ?? []).filter((a): a is CardStale => !!a);
  const hasAmber = acts.some(a => a.tone !== 'violet');
  return (
    <div style={{
      background: accent ? `${accent}10` : '#0A0A18',
      border: `1px solid ${hasAmber ? '#4A3510' : accent ? `${accent}30` : '#1A1A2A'}`,
      borderRadius: '10px', padding: '14px 16px',
      flex: wide ? 2 : 1, minWidth: 0,
      display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <p style={{ fontSize: '9px', fontWeight: 700, color: accent ?? '#555570', textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 700, color: accent ?? '#E0E0F8', lineHeight: 1, margin: 0 }}>{value}</p>
      {/* v7.120: sub-lines WRAP instead of ellipsis-truncating */}
      {sub && <p style={{ fontSize: '10px', color: '#555570', margin: 0, lineHeight: 1.45, overflowWrap: 'break-word' }}>{sub}</p>}
      {acts.map((a, i) => <CardActionButton key={i} a={a} />)}
    </div>
  );
}

// ── Citation Landscape ─────────────────────────────────────────────────────────

interface LandscapeRow {
  name:     string;
  domain:   string;
  isClient: boolean;
  isBrand:  boolean;
  aios:     number;
  slots:    number;
}

// v7.117: generic competitive landscape table — used by the AIO, PAA and
// Video tabs (same layout, different source data + labels).
function CitationLandscape({ title, subtitle, unitLabel, marketDenLabel, brandRows, otherRows, totalFeature, totalSlots, footprintAvail, staleNotice, staleAction }: {
  title: string;
  subtitle: string;
  unitLabel: string;        // 'AIOs' | 'PAAs' | 'Carousels'
  marketDenLabel: string;   // e.g. 'scanned AIO-triggering keywords'
  brandRows: LandscapeRow[];
  otherRows: LandscapeRow[];
  totalFeature: number;     // scanned keywords showing this feature
  totalSlots: number;       // total source slots across those keywords
  footprintAvail: number;   // hybrid availability (scanned + uploads) for the footprint rate
  staleNotice?: string | null;  // set when stored scans predate source capture
  staleAction?: CardStale | null;  // v7.122: in-place targeted refresh for the stale data
}) {
  const [tab, setTab] = useState<LandscapeTab>('brands');

  const allRows: LandscapeRow[] = useMemo(
    () => [...brandRows, ...otherRows].sort((a, b) => b.aios - a.aios || b.slots - a.slots),
    [brandRows, otherRows]
  );

  const rows = tab === 'brands' ? brandRows : tab === 'others' ? otherRows : allRows;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const GRID = 'minmax(140px,1.1fr) minmax(120px,1fr) 110px 110px 150px 160px';

  if (staleNotice) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#E0E0F8', margin: 0 }}>{title}</p>
          <p style={{ fontSize: '11px', color: '#8888AA', margin: '2px 0 0' }}>{subtitle}</p>
        </div>
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#1A1205', border: '1px solid #4A3510', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '11px', color: '#F59E0B', margin: 0, flex: 1, minWidth: '220px' }}>{staleNotice}</p>
          {staleAction && (
            <button
              onClick={staleAction.onClick}
              disabled={staleAction.running}
              style={{
                padding: '7px 13px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, border: 'none',
                background: staleAction.running ? '#1A1A2E' : '#F59E0B',
                color: staleAction.running ? '#8888AA' : '#1A1205',
                cursor: staleAction.running ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {staleAction.running ? `Refreshing… ${staleAction.progress ?? ''}` : staleAction.label}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#E0E0F8', margin: 0 }}>{title}</p>
          <p style={{ fontSize: '11px', color: '#8888AA', margin: '2px 0 0' }}>{subtitle}</p>
        </div>
        <TabBar>
          <TabBtn active={tab === 'brands'} onClick={() => setTab('brands')}>
            Tracked brands <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{brandRows.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'others'} onClick={() => setTab('others')}>
            Other domains <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{otherRows.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>
            All <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{allRows.length}</span>
          </TabBtn>
        </TabBar>
      </div>

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', padding: '6px 12px', borderBottom: '1px solid #1A1A2A' }}>
        {['Brand', 'Domain', `${unitLabel} acquired`, 'Citation slots', 'Citation rate (market)', 'Citation rate (footprint)'].map((h, i) => (
          <span key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#333350', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: i > 1 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>

      {rows.length === 0 && <p style={{ fontSize: '12px', color: '#555570' }}>{tab === 'others' ? 'No other domains detected.' : 'No citation data yet — run a SERP scan.'}</p>}

      {rows.map((r) => (
        <div key={`${r.isBrand ? 'b' : 'o'}-${r.domain}`} style={{
          display: 'grid', gridTemplateColumns: GRID, gap: '0 12px',
          padding: '10px 12px', borderRadius: '7px', alignItems: 'center',
          background: r.isClient ? 'rgba(108,99,255,0.10)' : 'transparent',
          border: `1px solid ${r.isClient ? 'rgba(108,99,255,0.30)' : 'transparent'}`,
          borderBottom: r.isClient ? '1px solid rgba(108,99,255,0.30)' : '1px solid #12121E',
        }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: r.isClient ? 700 : r.isBrand ? 600 : 500, color: r.isClient ? '#E0E0F8' : r.isBrand ? '#D0D0E8' : '#9090B0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            {r.isClient && <span style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(108,99,255,0.25)', color: '#A0A0FF', flexShrink: 0 }}>client</span>}
          </div>
          <span style={{ fontSize: '11px', color: '#666688', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.domain}</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: r.isClient ? '#A0A0FF' : '#C0C0E8', textAlign: 'right' }}>{r.aios}</span>
          <span style={{ fontSize: '13px', color: '#9999B8', textAlign: 'right' }}>{r.slots}</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: r.isClient ? '#A0A0FF' : '#C0C0E8', textAlign: 'right' }}>{totalFeature > 0 ? pct(r.aios / totalFeature) : '—'}</span>
          <span style={{ fontSize: '13px', color: '#9999B8', textAlign: 'right' }}>{footprintAvail > 0 ? pct(r.aios / footprintAvail) : '—'}</span>
        </div>
      ))}

      <p style={{ fontSize: '10px', color: '#444458', marginTop: '2px' }}>
        Market rate = {unitLabel} acquired ÷ {totalFeature} {marketDenLabel} · Footprint rate = same wins ÷ {footprintAvail.toLocaleString()} available across the full footprint (scanned + uploaded — only scanned SERPs reveal sources, so this is a verified floor) · {totalSlots} source slots across all scanned {unitLabel.toLowerCase()}
      </p>
    </div>
  );
}

// ── v7.117: PAA / Video landscape data builder ─────────────────────────────────
// Pure helper: aggregates per-domain (and per-channel, for video) coverage of a
// SERP feature across scanned keywords. Brand matching: domain match, plus
// channel-name match for video (most carousel entries host on youtube.com, so
// the channel name is the meaningful attribution).
function buildFeatureLandscape(
  scannedKws:  SerpKw[],
  clientDomain: string,
  clientName:   string,
  competitors:  Competitor[],
  hasFeature:  (kw: SerpKw) => boolean,
  getSources:  (kw: SerpKw) => Array<{ domain: string; channel?: string }> | undefined,
) {
  const featKws = scannedKws.filter(hasFeature);
  const total   = featKws.length;
  const hasSourceData = featKws.some(kw => Array.isArray(getSources(kw)));

  const brands: Array<{ name: string; domain: string; isClient: boolean }> = [
    { name: clientName || clientDomain, domain: clientDomain, isClient: true },
    ...(competitors ?? []).map(c => ({ name: c.name || normDomain(c.domain), domain: normDomain(c.domain), isClient: false })),
  ].filter(b => b.domain);

  const normName = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const channelMatchesBrand = (channel: string | undefined, brandName: string) => {
    if (!channel) return false;
    const c = normName(channel), b = normName(brandName);
    return b.length >= 3 && (c.includes(b) || b.includes(c));
  };
  const sourceMatchesBrand = (src: { domain: string; channel?: string }, b: { name: string; domain: string }) =>
    domainsMatch(src.domain, b.domain) || channelMatchesBrand(src.channel, b.name);

  let totalSlots = 0;
  const brandAgg = new Map<string, { aios: number; slots: number }>();
  brands.forEach(b => brandAgg.set(b.domain, { aios: 0, slots: 0 }));
  const otherAgg = new Map<string, { name: string; domain: string; aios: number; slots: number }>();

  for (const kw of featKws) {
    const sources = getSources(kw) ?? [];
    totalSlots += sources.length;
    const brandSeen = new Set<string>();
    const otherSeen = new Set<string>();
    for (const src of sources) {
      const brand = brands.find(b => sourceMatchesBrand(src, b));
      if (brand) {
        const e = brandAgg.get(brand.domain)!;
        e.slots += 1;
        if (!brandSeen.has(brand.domain)) { e.aios += 1; brandSeen.add(brand.domain); }
      } else {
        // Group non-tracked video entries by channel when present (youtube.com
        // alone would lump every channel together); PAA entries by domain.
        const key  = normName(src.channel ?? '') || normDomain(src.domain);
        if (!key) continue;
        const e = otherAgg.get(key) ?? { name: src.channel || normDomain(src.domain), domain: normDomain(src.domain), aios: 0, slots: 0 };
        e.slots += 1;
        if (!otherSeen.has(key)) { e.aios += 1; otherSeen.add(key); }
        otherAgg.set(key, e);
      }
    }
  }

  const brandRows: LandscapeRow[] = brands.map(b => ({
    name: b.name, domain: b.domain, isClient: b.isClient, isBrand: true,
    aios: brandAgg.get(b.domain)!.aios, slots: brandAgg.get(b.domain)!.slots,
  })).sort((a, b) => (b.isClient ? 1 : 0) - (a.isClient ? 1 : 0) || b.aios - a.aios);

  const otherRows: LandscapeRow[] = Array.from(otherAgg.values())
    .map(o => ({ name: o.name, domain: o.domain, isClient: false, isBrand: false, aios: o.aios, slots: o.slots }))
    .sort((a, b) => b.aios - a.aios || b.slots - a.slots)
    .slice(0, 30);

  return { total, totalSlots, hasSourceData, brandRows, otherRows };
}

// ── Keyword Drilldown ──────────────────────────────────────────────────────────

function KeywordDrilldown({ keywords, clientDomain, clientName, competitors }: {
  keywords: EnrichedKw[];
  clientDomain: string;
  clientName: string;
  competitors: Competitor[];
}) {
  const [filter, setFilter]     = useState<KwFilter>('aio');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const counts = useMemo(() => ({
    aio:     keywords.filter(k => k.hasAIO).length,
    missing: keywords.filter(k => k.hasAIO && !k.isClientCited).length,
    won:     keywords.filter(k => k.hasAIO && k.isClientCited).length,
    all:     keywords.length,
  }), [keywords]);

  const filtered = useMemo(() => {
    let kws = keywords;
    if (search.trim()) kws = kws.filter(k => k.keyword.toLowerCase().includes(search.toLowerCase()));
    switch (filter) {
      case 'aio':     return kws.filter(k => k.hasAIO);
      case 'missing': return kws.filter(k => k.hasAIO && !k.isClientCited);
      case 'won':     return kws.filter(k => k.hasAIO && k.isClientCited);
      default:        return kws;
    }
  }, [keywords, filter, search]);

  const PILLS: Array<{ key: KwFilter; label: string; color: string }> = [
    { key: 'aio',     label: 'AIOs',    color: '#6C63FF' },
    { key: 'missing', label: 'Missing', color: '#EF4444' },
    { key: 'won',     label: 'Won',     color: '#22C55E' },
    { key: 'all',     label: 'All',     color: '#555570' },
  ];

  function toggleExpand(kw: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(kw) ? s.delete(kw) : s.add(kw); return s; });
  }

  // v7.126: tracked brands (client first) for the Tracked Brand Hits strip
  const trackedBrands = useMemo(() => ([
    { name: clientName || clientDomain, domain: clientDomain, isClient: true },
    ...(competitors ?? []).map(c => ({ name: c.name || normDomain(c.domain), domain: normDomain(c.domain), isClient: false })),
  ].filter(b => b.domain)), [clientName, clientDomain, competitors]);

  // v7.126: citation source classification — deterministic, from tracked set
  function sourceTag(domain: string): 'industry' | 'wikipedia' | 'other' {
    if (trackedBrands.some(b => domainsMatch(domain, b.domain))) return 'industry';
    if (normDomain(domain).endsWith('wikipedia.org')) return 'wikipedia';
    return 'other';
  }

  // v7.126: brand "mentioned" check — whole-word match of the brand name inside
  // the captured AIO answer text. Only runs when text was captured; never inferred.
  function brandMentioned(name: string, text?: string): boolean {
    if (!text || !name || name.length < 2) return false;
    const esc = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { return new RegExp(`\\b${esc}\\b`, 'i').test(text); } catch { return false; }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {PILLS.map(p => (
            <button key={p.key} onClick={() => setFilter(p.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '5px 11px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
              background: filter === p.key ? `${p.color}18` : 'transparent',
              border: `1px solid ${filter === p.key ? p.color : '#1E1E35'}`,
              color: filter === p.key ? p.color : '#555570', cursor: 'pointer',
            }}>
              {p.label}
              <span style={{ fontSize: '9px', padding: '0 4px', borderRadius: '3px', background: filter === p.key ? `${p.color}25` : '#1A1A2A', color: filter === p.key ? p.color : '#444458' }}>
                {counts[p.key]}
              </span>
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search keyword…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: '160px', padding: '5px 10px', borderRadius: '6px', background: '#0A0A18', border: '1px solid #1E1E35', color: '#D0D0F0', fontSize: '11px', outline: 'none' }} />
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 1fr 100px', gap: '0 10px', padding: '5px 12px', borderBottom: '1px solid #1A1A2A' }}>
        {['Keyword', 'AIO', 'Citations', 'Top Winner', clientName || 'Client'].map((h, i) => (
          <span key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#333350', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: i > 1 ? 'center' : 'left' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <p style={{ fontSize: '12px', color: '#555570', textAlign: 'center', padding: '20px 0' }}>No keywords match this filter.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {filtered.map(kw => {
            const isExpanded = expanded.has(kw.keyword);
            // v7.126: expandable when there's ANYTHING verified to show — citations or captured answer text
            const hasSources = kw.hasAIO && ((kw.aioSources?.length ?? 0) > 0 || !!kw.aioText);
            return (
              <div key={kw.keyword} style={{ background: '#08080F', border: '1px solid #12121E', borderRadius: '7px', overflow: 'hidden' }}>
                <button
                  onClick={() => hasSources && toggleExpand(kw.keyword)}
                  style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 60px 70px 1fr 100px', gap: '0 10px', padding: '9px 12px', background: 'transparent', border: 'none', cursor: hasSources ? 'pointer' : 'default', textAlign: 'left', alignItems: 'center' }}
                >
                  {/* Keyword */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    {hasSources && (
                      <span style={{ fontSize: '9px', color: '#333350', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', flexShrink: 0 }}>▶</span>
                    )}
                    <span style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw.keyword}</span>
                  </div>
                  {/* AIO badge */}
                  <div style={{ textAlign: 'center' }}>
                    {kw.hasAIO
                      ? <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: '#1A1040', border: '1px solid #6C63FF44', color: '#8B85FF' }}>Yes</span>
                      : <span style={{ fontSize: '10px', color: '#2A2A40' }}>No</span>}
                  </div>
                  {/* Citations */}
                  <div style={{ textAlign: 'center' }}>
                    {kw.hasAIO
                      ? <span style={{ fontSize: '13px', fontWeight: 600, color: '#C0C0E8' }}>{kw.citationCount}</span>
                      : <span style={{ fontSize: '10px', color: '#2A2A40' }}>—</span>}
                  </div>
                  {/* Top Winner */}
                  <div style={{ minWidth: 0, paddingLeft: '4px' }}>
                    {kw.hasAIO && kw.topWinnerName !== '—' ? (
                      <span style={{ fontSize: '11px', color: '#A0A0C8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {kw.topWinnerName}
                        {kw.topWinnerPosition && <span style={{ marginLeft: '4px', fontSize: '9px', color: '#555570' }}>#{kw.topWinnerPosition}</span>}
                      </span>
                    ) : <span style={{ fontSize: '10px', color: '#2A2A40' }}>—</span>}
                  </div>
                  {/* Client position */}
                  <div style={{ textAlign: 'center' }}>
                    {kw.hasAIO ? (
                      kw.clientCitedPosition !== null
                        ? <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E' }}>#{kw.clientCitedPosition}</span>
                        : <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}>missing</span>
                    ) : <span style={{ fontSize: '10px', color: '#2A2A40' }}>—</span>}
                  </div>
                </button>

                {/* v7.126: Expanded — AIO Coverage Tracker layout: Answer + Brand Hits | Citations */}
                {isExpanded && hasSources && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: '20px', padding: '14px 16px 16px', borderTop: '1px solid #0F0F1E', background: '#060610' }}>

                    {/* LEFT — AI Overview Answer + Tracked Brand Hits */}
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <p style={{ fontSize: '9px', color: '#444466', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em', margin: '0 0 7px' }}>
                          AI Overview Answer
                        </p>
                        {kw.aioText ? (
                          <div style={{ background: '#0A0A18', border: '1px solid #16162A', borderRadius: '9px', padding: '12px 14px', maxHeight: '230px', overflowY: 'auto', fontSize: '12px', lineHeight: 1.65, color: '#C0C0E8', whiteSpace: 'pre-wrap' }}>
                            {kw.aioText}
                          </div>
                        ) : (
                          <div style={{ background: '#0A0A18', border: '1px dashed #1E1E35', borderRadius: '9px', padding: '12px 14px', fontSize: '11px', lineHeight: 1.55, color: '#555570' }}>
                            Answer text not captured for this keyword — scans before v7.126 stored citation links only. Re-scan this keyword to capture the actual AI Overview answer.
                          </div>
                        )}
                      </div>

                      <div>
                        <p style={{ fontSize: '9px', color: '#444466', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em', margin: '0 0 7px' }}>
                          Tracked Brand Hits
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {trackedBrands.map((b, bi) => {
                            const idx = (kw.aioSources ?? []).findIndex(s => domainsMatch(s.domain, b.domain));
                            const cited = idx >= 0;
                            const mentioned = brandMentioned(b.name, kw.aioText);
                            const hit = cited || mentioned;
                            const status = cited
                              ? `cited #${idx + 1}${mentioned ? ' · mentioned' : ''}`
                              : mentioned ? 'mentioned' : 'absent';
                            return (
                              <span key={bi} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                                background: hit ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.05)',
                                border: `1px solid ${hit ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.18)'}`,
                                color: '#D0D0F0',
                              }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: b.isClient ? '#6C63FF' : '#EC4899', flexShrink: 0 }} />
                                {b.name}
                                <span style={{ fontWeight: 700, fontSize: '10px', color: hit ? '#22C55E' : '#EF4444' }}>{status}</span>
                              </span>
                            );
                          })}
                          {trackedBrands.length === 0 && (
                            <span style={{ fontSize: '11px', color: '#555570' }}>No tracked brands configured.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT — Citations */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '9px', color: '#444466', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em', margin: '0 0 4px' }}>
                        Citations ({kw.aioSources?.length ?? 0})
                      </p>
                      {(kw.aioSources?.length ?? 0) > 0 ? (
                        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                          {kw.aioSources.map((src, i) => {
                            const isMe = domainsMatch(src.domain, clientDomain);
                            const tag = sourceTag(src.domain);
                            return (
                              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 2px', borderBottom: '1px solid #10101E' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: '#444466', flexShrink: 0, paddingTop: '2px' }}>#{i + 1}</span>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: isMe ? '#A0A0FF' : '#D0D0F0', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {src.title || src.domain}{isMe && <span style={{ marginLeft: '5px', fontSize: '10px', color: '#6C63FF' }}>★ you</span>}
                                  </a>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px' }}>
                                    <span style={{ fontSize: '10px', color: '#555570', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{normDomain(src.domain)}</span>
                                    <span style={{ flexShrink: 0, padding: '1px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: 600, background: '#12121E', border: '1px solid #1E1E35', color: tag === 'industry' ? '#A0A0C8' : '#666688' }}>
                                      {tag}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ fontSize: '11px', color: '#555570', margin: '6px 0 0' }}>
                          This AIO exposes no citation links (scan-confirmed).
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Additional features config ────────────────────────────────────────────────

const ADD_FEATURES = [
  { key: 'featured_snippet', label: 'Featured Snippet', color: '#22C55E', desc: 'Answer box at top of results' },
  { key: 'knowledge_panel',  label: 'Knowledge Panel',  color: '#F59E0B', desc: 'Entity knowledge card (right rail)' },
  { key: 'local_pack',       label: 'Local Pack',       color: '#EF4444', desc: 'Map + local business results' },
  { key: 'shopping',         label: 'Shopping / PLAs',  color: '#F97316', desc: 'Product listing carousel' },
  { key: 'image_pack',       label: 'Image Pack',       color: '#8B5CF6', desc: 'Google image results row' },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SerpFeaturesSection({ analysis, competitors = [], clientName = '', websiteUrl = '', projectId, kwVersion, externalScanned }: Props) {
  const [activeTab,   setActiveTab]   = useState<FeatureTab>('aio');

  const serpSnap    = analysis.serpApiSnapshot ?? {};
  const featSummary = serpSnap.serpFeatureSummary;
  const aioSummary  = serpSnap.aioSummary;

  // v7.121: AIO-targeted scans merge results live into the panel without a
  // reload — extraScanned holds fresh batches; fresh wins on keyword overlap.
  // v7.132: the page-level background SERP scan feeds the same merge via
  // externalScanned, so this panel updates live as the global scan progresses.
  const [extraScanned, setExtraScanned] = useState<SerpKw[]>([]);
  const scannedKws: SerpKw[] = useMemo(() => {
    const base: SerpKw[] = serpSnap.keywords ?? [];
    const fresh: SerpKw[] = [...extraScanned, ...(externalScanned ?? [])];
    if (fresh.length === 0) return base;
    const freshLow = new Set(fresh.map(k => (k.keyword ?? '').toLowerCase()));
    return [...base.filter(k => !freshLow.has((k.keyword ?? '').toLowerCase())), ...fresh];
  }, [serpSnap.keywords, extraScanned, externalScanned]);
  const scanned  = scannedKws.length;
  const scanDate = serpSnap.fetchedAt ? new Date(serpSnap.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  const clientDomain = normDomain(serpSnap.domain ?? websiteUrl ?? '');
  const displayClientName = clientName || clientDomain;

  // v7.103: uploaded keyword rows — Semrush CSVs carry a "SERP Features by
  // Keyword" column which gives feature AVAILABILITY for the whole footprint
  // (which features exist on each keyword's SERP). It can NOT tell who is
  // cited, so captured metrics remain SerpAPI-scan based.
  const [uploadRows, setUploadRows] = useState<UploadKwRow[] | null>(null);
  useEffect(() => {
    if (!projectId) { setUploadRows([]); return; }
    let alive = true;
    fetch(`/api/projects/${projectId}/keywords`)
      .then(r => r.json())
      .then(d => { if (alive) setUploadRows((d.keywords ?? []) as UploadKwRow[]); })
      .catch(() => { if (alive) setUploadRows([]); });
    return () => { alive = false; };
  }, [projectId, kwVersion]);   // v7.107: kwVersion bump → refetch uploaded keywords

  const scannedSet = useMemo(
    () => new Set(scannedKws.map(k => (k.keyword ?? '').trim().toLowerCase())),
    [scannedKws]
  );
  const uploadFeat = useMemo(
    () => countUploadFeatures(uploadRows ?? [], scannedSet),
    [uploadRows, scannedSet]
  );

  // All computed AIO data — v7.121: computed BEFORE the aggregate metrics so
  // availability/acquired always reflect the LIVE scanned set (in-panel AIO
  // scans update these without a reload; analysis.aioAvailable goes stale).
  const aio = useAIOData(scannedKws, clientDomain, displayClientName, competitors, aioSummary?.clientCited ?? 0);

  // AIO aggregate metrics — scan-side (live)
  const aioAvailScan = aio.totalAios;
  const aioAcq       = aio.clientStats?.aiosAcquired ?? 0;
  // v7.103 hybrid availability: scanned SERPs + uploaded (unscanned) keywords
  const aioAvail  = aioAvailScan + uploadFeat.aio;
  const aioRate   = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  // PAA (live from scanned set — stored summaries go stale after in-panel scans)
  const paaAvailScan = scannedKws.filter(k => (k.paaQuestions?.length ?? 0) > 0).length;
  const paaAcq       = scannedKws.filter(k => k.paaClientCited).length;
  const paaAvail = paaAvailScan + uploadFeat.paa;
  const paaRate  = paaAvail > 0 ? Math.round((paaAcq / paaAvail) * 100) : 0;

  // Video (live)
  const videoAvailScan = scannedKws.filter(k => k.serpFeatures?.includes('video_carousel')).length;
  const videoAcq       = scannedKws.filter(k => k.videoClientCited).length;
  const videoAvail = videoAvailScan + uploadFeat.video;
  const videoRate  = videoAvail > 0 ? Math.round((videoAcq / videoAvail) * 100) : 0;

  // Combined weighted coverage (hybrid availability; captured = scan-verified)
  const totalAvail   = aioAvail + paaAvail + videoAvail;
  const totalAcq     = aioAcq + paaAcq + videoAcq;
  const combinedRate = totalAvail > 0 ? Math.min(100, Math.round((totalAcq / totalAvail) * 100)) : 0;
  const uploadAvailTotal = uploadFeat.aio + uploadFeat.paa + uploadFeat.video;

  // More features (scan + upload availability)
  const addFeatureCounts: Record<string, number> = {};
  ADD_FEATURES.forEach(af => {
    addFeatureCounts[af.key] =
      scannedKws.filter(k => k.serpFeatures?.includes(af.key)).length + (uploadFeat.more[af.key] ?? 0);
  });
  const hasAnyAddFeatures = ADD_FEATURES.some(af => addFeatureCounts[af.key] > 0);

  // v7.124: batches shrunk 75 → 25. AIO-flagged keywords usually need a SECOND
  // SerpAPI request (async AIO token follow-up), so 75 × ~3-5s could exceed
  // Vercel's 300s function limit — the platform then returns a plain-text
  // error page ("An error o…"), which res.json() choked on. 25 × ~5s ≈ 125s
  // worst case, comfortably inside the limit.
  const SCAN_BATCH = 25;
  // Non-JSON response (platform timeout/error page) → null instead of a throw.
  async function safeJson(res: { json: () => Promise<any> }): Promise<any | null> {
    try { return await res.json(); } catch { return null; }
  }
  const SAVED_NOTE = 'All completed batches are already saved — click the button again to continue from where it stopped.';

  // v7.121: targeted scan of uploaded AIO-flagged keywords (batched; merges live)
  const [aioScan, setAioScan] = useState<{ running: boolean; done: number; total: number; error: string | null }>({ running: false, done: 0, total: 0, error: null });
  async function scanAioKeywords() {
    if (!projectId || aioScan.running) return;
    const total = uploadFeat.aio;
    setAioScan({ running: true, done: 0, total, error: null });
    let done = 0;
    try {
      for (;;) {
        const res  = await fetch(`/api/projects/${projectId}/serp-scan`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: SCAN_BATCH, filter: 'aio' }),
        });
        const data = await safeJson(res);
        if (!res.ok || !data) {
          setAioScan(s => ({ ...s, running: false, error: data?.error ?? `The server returned an unexpected ${res.status} response (likely a timeout while scanning). ${SAVED_NOTE}` }));
          return;
        }
        done += data.scanned ?? 0;
        if (data.results?.length) {
          setExtraScanned(prev => {
            const lo = new Set((data.results as SerpKw[]).map(r => (r.keyword ?? '').toLowerCase()));
            return [...prev.filter(k => !lo.has((k.keyword ?? '').toLowerCase())), ...(data.results as SerpKw[])];
          });
        }
        setAioScan(s => ({ ...s, done }));
        if (!data.remaining || !data.scanned) break;
      }
      setAioScan(s => ({ ...s, running: false }));
    } catch (e: any) {
      setAioScan(s => ({ ...s, running: false, error: `${String(e?.message ?? e)} — ${SAVED_NOTE}` }));
    }
  }

  // ── v7.122: per-card staleness detection + targeted rescan ────────────────
  // All rules are detected from real stored data; a card only shows its
  // "Refresh required" button when a rule is genuinely true.
  const STALE_DAYS = 30;
  const staleSets = useMemo(() => {
    const now = Date.now();
    const emptyAio: string[] = [], missingPaa: string[] = [], missingVideo: string[] = [], outdated: string[] = [];
    let confirmedSourceless = 0;
    for (const k of scannedKws) {
      if (!k.keyword) continue;
      // v7.125 FIX (Wayne: "I click these buttons but it flashes and goes
      // back"): an AIO with zero sources is only STALE if it was never fetched
      // by the modern scanner (no per-keyword scannedAt). If a fresh scan
      // confirmed the AIO exposes no citation links, that's a verified fact —
      // re-flagging it created an infinite refresh loop charging credits per
      // click. Confirmed-sourceless AIOs are reported as info instead.
      if (k.hasAIO && (k.aioSources?.length ?? 0) === 0) {
        if (k.scannedAt) confirmedSourceless++;
        else emptyAio.push(k.keyword);
      }
      if ((k.paaQuestions?.length ?? 0) > 0 && !Array.isArray(k.paaSources)) missingPaa.push(k.keyword);
      if (k.serpFeatures?.includes('video_carousel') && !Array.isArray(k.videoSources)) missingVideo.push(k.keyword);
      if (k.scannedAt) {
        const t = Date.parse(k.scannedAt);
        if (Number.isFinite(t) && now - t > STALE_DAYS * 86_400_000) outdated.push(k.keyword);
      }
    }
    return { emptyAio, missingPaa, missingVideo, outdated, confirmedSourceless };
  }, [scannedKws]);

  const [rescan, setRescan] = useState<{ key: string | null; done: number; total: number; error: string | null }>({ key: null, done: 0, total: 0, error: null });
  async function runRescan(key: string, kws: string[]) {
    if (!projectId || rescan.key || kws.length === 0) return;
    setRescan({ key, done: 0, total: kws.length, error: null });
    let done = 0;
    try {
      for (let i = 0; i < kws.length; i += SCAN_BATCH) {
        const slice = kws.slice(i, i + SCAN_BATCH);
        const res = await fetch(`/api/projects/${projectId}/serp-scan`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: 'rescan', keywords: slice, batchSize: SCAN_BATCH }),
        });
        const data = await safeJson(res);
        if (!res.ok || !data) { setRescan({ key: null, done, total: kws.length, error: data?.error ?? `The server returned an unexpected ${res.status} response (likely a timeout while scanning). ${SAVED_NOTE}` }); return; }
        if (data.results?.length) {
          setExtraScanned(prev => {
            const lo = new Set((data.results as SerpKw[]).map(r => (r.keyword ?? '').toLowerCase()));
            return [...prev.filter(k => !lo.has((k.keyword ?? '').toLowerCase())), ...(data.results as SerpKw[])];
          });
        }
        done += data.scanned ?? 0;
        setRescan(s => ({ ...s, done }));
      }
      setRescan({ key: null, done, total: kws.length, error: null });
    } catch (e: any) {
      setRescan({ key: null, done, total: kws.length, error: `${String(e?.message ?? e)} — ${SAVED_NOTE}` });
    }
  }
  const mkStale = (key: string, kws: string[], reason: string, label?: string): CardStale | null => (
    !projectId || kws.length === 0 ? null : {
      reason,
      label: label ?? `Refresh required · ~${kws.length} credit${kws.length !== 1 ? 's' : ''}`,
      onClick: () => runRescan(key, kws),
      running: rescan.key === key,
      progress: rescan.key === key ? `${rescan.done}/${rescan.total}` : null,
    }
  );
  // Citation cards: stale when AIOs lack sources OR scans are outdated
  const citeStaleKws = useMemo(() => Array.from(new Set([...staleSets.emptyAio, ...staleSets.outdated])), [staleSets]);
  const citeStaleReason = [
    staleSets.emptyAio.length > 0 ? `${staleSets.emptyAio.length} scanned AIO${staleSets.emptyAio.length !== 1 ? 's' : ''} returned no citation sources` : null,
    staleSets.outdated.length > 0 ? `${staleSets.outdated.length} scan${staleSets.outdated.length !== 1 ? 's' : ''} older than ${STALE_DAYS} days` : null,
  ].filter(Boolean).join(' · ');
  const citeStale = mkStale('cite', citeStaleKws, citeStaleReason);

  // v7.123: expand-coverage action (violet) — lives inside the Citation Rate
  // card. Replaces the v7.121 standalone banner, which read as disconnected
  // from the card it served.
  const aioExpand: CardStale | null = (!projectId || uploadFeat.aio === 0) ? null : {
    tone:     'violet',
    reason:   `${uploadFeat.aio.toLocaleString()} of your ${aioAvail.toLocaleString()} available AIOs aren't citation-verified yet`,
    label:    `Verify all ${aioAvail.toLocaleString()} AIOs · ~${uploadFeat.aio.toLocaleString()} credits`,
    onClick:  scanAioKeywords,
    running:  aioScan.running,
    progress: aioScan.running ? `${aioScan.done}/${aioScan.total}` : null,
  };

  // v7.117: landscape rows for all three feature tables
  const aioBrandRows: LandscapeRow[] = useMemo(() => aio.brandStats.map(b => ({
    name: b.name, domain: b.domain, isClient: b.isClient, isBrand: true,
    aios: b.aiosAcquired, slots: b.citationSlots,
  })), [aio.brandStats]);
  const aioOtherRows: LandscapeRow[] = useMemo(() => aio.otherDomains.map(o => ({
    name: o.domain, domain: o.domain, isClient: false, isBrand: false,
    aios: o.aiosAcquired, slots: o.citationSlots,
  })), [aio.otherDomains]);
  const paaLand = useMemo(
    () => buildFeatureLandscape(scannedKws, clientDomain, displayClientName, competitors,
      k => (k.paaQuestions?.length ?? 0) > 0, k => k.paaSources),
    [scannedKws, clientDomain, displayClientName, competitors]
  );
  const videoLand = useMemo(
    () => buildFeatureLandscape(scannedKws, clientDomain, displayClientName, competitors,
      k => !!k.serpFeatures?.includes('video_carousel'), k => k.videoSources),
    [scannedKws, clientDomain, displayClientName, competitors]
  );
  const STALE_MSG = (feat: string) => `Your stored scan predates v7.117, which began capturing ${feat} sources — competitive coverage can't be shown for it. Run Refresh → Data-only refresh (0 Semrush units) to re-scan and populate this table.`;

  return (
    <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4 animate-fade-in">

      {/* Section Header */}
      <div className="orbit-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Search · 04</p>
            <h2 className="text-orbit-primary text-xl font-bold mt-1">SERP Features</h2>
            <p className="text-orbit-secondary text-sm mt-1">AI Overviews · People Also Ask · Video Carousel</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {scanDate && <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>Scan: {scanDate}</span>}
            {scanned > 0 && <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>{scanned} kw{scanned !== 1 ? 's' : ''} scanned</span>}
            {uploadFeat.rowsWithFeatureData > 0 && <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>{uploadFeat.rowsWithFeatureData.toLocaleString()} kws w/ features from upload</span>}
          </div>
        </div>
      </div>

      {/* Hero: Combined SERP Coverage */}
      <div className="orbit-card p-5">
        <div className="flex items-center gap-6">
          <div className="relative shrink-0" style={{ width: '110px', height: '110px' }}>
            <svg viewBox="0 0 36 36" width="110" height="110" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E1E2E" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#6C63FF" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${combinedRate} 100`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span style={{ color: '#6C63FF', fontWeight: 700, fontSize: '24px', lineHeight: 1 }}>{combinedRate}%</span>
              <span style={{ color: '#8888AA', fontSize: '9px', marginTop: '3px', textAlign: 'center', lineHeight: 1.3 }}>SERP<br />coverage</span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-3">
            {[
              { label: 'Available', val: totalAvail,            color: '#8888AA', sub: uploadAvailTotal > 0 ? `${(totalAvail - uploadAvailTotal).toLocaleString()} scanned + ${uploadAvailTotal.toLocaleString()} from upload` : 'total feature slots' },
              { label: 'Captured',  val: totalAcq,              color: '#22C55E', sub: uploadAvailTotal > 0 ? 'client cited (scan-verified)' : 'client is cited' },
              { label: 'Gap',       val: totalAvail - totalAcq, color: '#EF4444', sub: 'uncaptured' },
            ].map(s => (
              <div key={s.label} className="bg-orbit-surface border border-orbit-border rounded-lg p-3">
                <p style={{ fontSize: '10px', color: '#8888AA', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 6px' }}>{s.label}</p>
                <p style={{ fontSize: '22px', fontWeight: 700, color: s.color, lineHeight: 1, margin: 0 }}>{s.val}</p>
                <p style={{ fontSize: '10px', color: '#444458', margin: '4px 0 0' }}>{s.sub}</p>
              </div>
            ))}
          </div>
          {totalAvail > 0 && (
            <div style={{ flexShrink: 0, maxWidth: '190px', padding: '12px', borderRadius: '8px', background: '#0F0F1E', border: '1px solid #1E1E35', borderLeft: '3px solid #6C63FF' }}>
              <p style={{ fontSize: '11px', color: '#8888AA', lineHeight: 1.5, margin: 0 }}>
                {combinedRate < 20 ? <><span style={{ color: '#EF4444', fontWeight: 600 }}>{combinedRate}%</span> of available SERP features captured — strong growth opportunity.</> : combinedRate < 60 ? <><span style={{ color: '#F59E0B', fontWeight: 600 }}>{combinedRate}%</span> captured — significant upside remains across AIO, PAA &amp; video.</> : <><span style={{ color: '#22C55E', fontWeight: 600 }}>{combinedRate}%</span> captured — solid SERP feature presence.</>}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* v7.103: uploaded-data status note */}
      {uploadRows !== null && uploadFeat.rowsWithFeatureData === 0 && (uploadRows?.length ?? 0) > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#1A1205', border: '1px solid #4A3510' }}>
          <p style={{ fontSize: '11px', color: '#F59E0B', margin: 0 }}>
            Your uploaded keyword CSVs don&apos;t include a &ldquo;SERP Features by Keyword&rdquo; column, so feature availability here only covers the {scanned} scanned keyword{scanned !== 1 ? 's' : ''}. Re-export from Semrush (Organic Research → Positions) with all columns and re-upload to see feature availability across your full footprint.
          </p>
        </div>
      )}
      {uploadFeat.rowsWithFeatureData > 0 && (
        <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#0F0F1E', border: '1px solid #1E1E35' }}>
          <p style={{ fontSize: '10px', color: '#555570', margin: 0 }}>
            Availability combines {scanned} SerpAPI-scanned keyword{scanned !== 1 ? 's' : ''} with {uploadFeat.rowsWithFeatureData.toLocaleString()} uploaded keywords carrying Semrush SERP-feature data (deduped). Captured/citation metrics require knowing WHO is cited on each SERP — uploads can&apos;t provide that, so those come from scanned keywords only. Scan more keywords to verify capture across the footprint.
          </p>
        </div>
      )}

      {/* Feature Tab Selector */}
      <div className="flex gap-2 flex-wrap">
        <FeatureRateCard label="AI Overviews"    color="#6C63FF" rate={aioRate}   acquired={aioAcq}   available={aioAvail}   active={activeTab === 'aio'}   onClick={() => setActiveTab('aio')} />
        <FeatureRateCard label="People Also Ask" color="#06B6D4" rate={paaRate}   acquired={paaAcq}   available={paaAvail}   active={activeTab === 'paa'}   onClick={() => setActiveTab('paa')} />
        <FeatureRateCard label="Video Carousel"  color="#F59E0B" rate={videoRate} acquired={videoAcq} available={videoAvail} active={activeTab === 'video'} onClick={() => setActiveTab('video')} />
        <button onClick={() => setActiveTab('more')} className="flex flex-col gap-2 text-left" style={{ flex: 1, padding: '14px', borderRadius: '10px', background: activeTab === 'more' ? '#22C55E12' : '#0F0F1E', border: `1.5px solid ${activeTab === 'more' ? '#22C55E' : '#1E1E35'}`, cursor: 'pointer', minWidth: '120px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#8888AA', textTransform: 'uppercase', letterSpacing: '.07em' }}>More Features</span>
          <p style={{ fontSize: '11px', color: '#555570', margin: 0 }}>Snippets · KP · Local · Shopping</p>
        </button>
      </div>

      {/* ═══ AIO TAB ═══ */}
      {activeTab === 'aio' && (
        <div className="orbit-card p-5 flex flex-col gap-5">

          {/* AIO KPI strip */}
          <div>
            <SectionLabel text="AI Overview Coverage" />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <KpiCard label="Available AIOs" value={aio.totalAios + uploadFeat.aio} sub={uploadFeat.aio > 0 ? `${aio.totalAios} scanned + ${uploadFeat.aio.toLocaleString()} from upload` : `across ${scanned} tracked queries`} accent="#00B894" wide />
              <KpiCard label="AIO Penetration" value={`${scanned > 0 ? ((aio.totalAios / scanned) * 100).toFixed(1) : 0}%`} sub={`${aio.totalAios} of ${scanned} scanned queries`} accent="#00B894" wide />
              {/* v7.121 (Wayne): ONE citation rate, his definition — client's
                  citations ÷ citations available. Citations are countable only
                  on scanned AIOs; the scan CTA below extends the denominator to
                  the full footprint with real SerpAPI data, never estimates. */}
              <KpiCard label="Citation Rate" value={`${(aio.citationShare * 100).toFixed(1)}%`} sub={`${aio.clientStats?.citationSlots ?? 0} of ${aio.totalSlots.toLocaleString()} citations available across the ${aio.totalAios} citation-verified AIOs${staleSets.confirmedSourceless > 0 ? ` · ${staleSets.confirmedSourceless} AIO${staleSets.confirmedSourceless !== 1 ? 's' : ''} expose no citation links (scan-confirmed)` : ''}`} accent={aio.clientStats?.citationSlots ? '#6C63FF' : '#EF4444'} wide actions={[citeStale, aioExpand]} />
              <KpiCard label="Avg Citation Position" value={aio.avgCitationPosition !== null ? aio.avgCitationPosition.toFixed(1) : '—'} sub="avg rank in the source list of scanned AIOs citing you" actions={[citeStale]} />
              {aio.topCompetitor && (
                <KpiCard label={`Top Competitor · ${aio.topCompetitor.name}`} value={`${(aio.topCompetitor.citationRate * 100).toFixed(1)}%`} sub={`cited in ${aio.topCompetitor.aiosAcquired} of ${aio.totalAios} scanned AIOs`} accent="#FF6584" />
              )}
              <KpiCard label="Others" value={`${(aio.othersShare * 100).toFixed(1)}%`} sub={`non-tracked domains' share of the ${aio.totalSlots} citation links`} />
            </div>
            {(rescan.error || aioScan.error) && <p style={{ fontSize: '11px', color: '#EF4444', margin: '8px 0 0' }}>{rescan.error ?? aioScan.error}</p>}
          </div>

          {/* v7.124: persistent progress indicators — visible whenever any scan runs */}
          {aioScan.running && <ScanProgress label="Verifying AIO citations via SerpAPI" done={aioScan.done} total={aioScan.total} />}
          {rescan.key !== null && <ScanProgress label="Refreshing stale scan data via SerpAPI" done={rescan.done} total={rescan.total} />}

          {/* v7.123: the standalone AIO-scan banner is GONE — Wayne hit the
              in-card refresh thinking it was this. The expand-coverage action
              now lives INSIDE the Citation Rate card (violet button), one
              consistent in-card pattern. */}

          {/* v7.115: Gap callout removed (scanned-only count read as contradictory
              next to hybrid availability). v7.116 (Wayne): the Citation Landscape
              table now lives HERE — always visible, reference-style layout with
              Tracked brands / Other domains / All tabs — and the old
              Drilldown/Landscape view toggle is gone (drilldown renders below). */}

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <>
              <CitationLandscape
                title="Citation landscape"
                subtitle="Everything cited in AIOs — pivot from your tracked competitive set to the wider web, or see it all in one ranking."
                unitLabel="AIOs"
                marketDenLabel="scanned AIO-triggering keywords"
                brandRows={aioBrandRows}
                otherRows={aioOtherRows}
                totalFeature={aio.totalAios}
                totalSlots={aio.totalSlots}
                footprintAvail={aioAvail}
              />

              <div>
                <SectionLabel text="Keyword Drilldown" />
                <KeywordDrilldown
                  keywords={aio.enrichedKws}
                  clientDomain={clientDomain}
                  clientName={displayClientName}
                  competitors={competitors}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ PAA TAB — unchanged ═══ */}
      {activeTab === 'paa' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="People Also Ask" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>PAA boxes surface related questions users are asking. Client cited = the client&apos;s content answers one of those questions.</p>
            </div>
            {paaAcq < paaAvail && paaAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#001A24', border: '1px solid #005070' }}>
                <p style={{ fontSize: '10px', color: '#06B6D4', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#06B6D4', margin: 0 }}>{paaAvail - paaAcq} uncaptured PAA{paaAvail - paaAcq !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          {/* v7.117: PAA competitive landscape — same position/layout as the AIO table */}
          {scannedKws.length > 0 && paaLand.total > 0 && (
            <CitationLandscape
              title="Citation landscape"
              subtitle="Every source answering a People Also Ask question — your tracked competitive set vs the wider web."
              unitLabel="PAAs"
              marketDenLabel="scanned keywords with a PAA box"
              brandRows={paaLand.brandRows}
              otherRows={paaLand.otherRows}
              totalFeature={paaLand.total}
              totalSlots={paaLand.totalSlots}
              footprintAvail={paaAvail}
              staleNotice={paaLand.hasSourceData ? null : STALE_MSG('PAA answer')}
              staleAction={paaLand.hasSourceData ? null : mkStale('paa', staleSets.missingPaa, '', `Refresh required — re-scan ${staleSets.missingPaa.length} keyword${staleSets.missingPaa.length !== 1 ? 's' : ''} (~${staleSets.missingPaa.length} credits)`)}
            />
          )}

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scannedKws.map((kw: SerpKw) => {
                const hasPAA = (kw.paaQuestions ?? []).length > 0;
                return (
                  <div key={kw.keyword} style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '12px 14px' }}>
                    <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: '0 0 6px' }}>{kw.keyword}</p>
                    {hasPAA ? (
                      <>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#001820', border: '1px solid #06B6D444', color: '#06B6D4' }}>
                            PAA present · {kw.paaQuestions.length} question{kw.paaQuestions.length !== 1 ? 's' : ''}
                          </span>
                          <CitedBadge cited={kw.paaClientCited} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {kw.paaQuestions.slice(0, 3).map((q: string, i: number) => <p key={i} style={{ fontSize: '10px', color: '#555570', margin: 0 }}>· {q}</p>)}
                          {kw.paaQuestions.length > 3 && <p style={{ fontSize: '10px', color: '#333350', margin: 0 }}>+{kw.paaQuestions.length - 3} more questions</p>}
                        </div>
                      </>
                    ) : (
                      <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555570' }}>No PAA box</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ VIDEO TAB — unchanged ═══ */}
      {activeTab === 'video' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="Video Carousel" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>Video carousels appear on queries where YouTube &amp; video content ranks well. Client cited = client&apos;s channel or hosted video appears in the carousel.</p>
            </div>
            {videoAcq < videoAvail && videoAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#1A1000', border: '1px solid #504000' }}>
                <p style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B', margin: 0 }}>{videoAvail - videoAcq} uncaptured</p>
              </div>
            )}
          </div>

          {/* v7.117: Video competitive landscape — same position/layout. Non-tracked
              entries grouped by CHANNEL when present (most carousel videos host on
              youtube.com, so the channel is the meaningful attribution). */}
          {scannedKws.length > 0 && videoLand.total > 0 && (
            <CitationLandscape
              title="Citation landscape"
              subtitle="Every video in the carousels — your tracked competitive set vs the wider web (non-tracked entries grouped by channel)."
              unitLabel="Carousels"
              marketDenLabel="scanned keywords with a video carousel"
              brandRows={videoLand.brandRows}
              otherRows={videoLand.otherRows}
              totalFeature={videoLand.total}
              totalSlots={videoLand.totalSlots}
              footprintAvail={videoAvail}
              staleNotice={videoLand.hasSourceData ? null : STALE_MSG('video carousel')}
              staleAction={videoLand.hasSourceData ? null : mkStale('video', staleSets.missingVideo, '', `Refresh required — re-scan ${staleSets.missingVideo.length} keyword${staleSets.missingVideo.length !== 1 ? 's' : ''} (~${staleSets.missingVideo.length} credits)`)}
            />
          )}

          {scannedKws.length === 0 ? <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {scannedKws.map((kw: SerpKw) => {
                const hasVideo = kw.serpFeatures?.includes('video_carousel');
                return (
                  <div key={kw.keyword} style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw.keyword}</p>
                    {hasVideo ? <div className="flex items-center gap-2 flex-shrink-0"><span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1000', border: '1px solid #F59E0B44', color: '#F59E0B' }}>Video carousel</span><CitedBadge cited={kw.videoClientCited} /></div>
                      : <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555570', flexShrink: 0 }}>No video carousel</span>}
                  </div>
                );
              })}
            </div>
          )}
          {videoAvail === 0 && scannedKws.length > 0 && (
            <div style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#555570' }}>No video carousels detected. Creating a YouTube channel and optimizing video content for key terms could unlock this SERP feature.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ MORE FEATURES TAB — unchanged ═══ */}
      {activeTab === 'more' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div>
            <SectionLabel text="Additional SERP features detected" />
            <p style={{ fontSize: '12px', color: '#8888AA', margin: '0 0 12px' }}>Features detected across {scannedKws.length} scanned keywords.</p>
          </div>
          {scannedKws.length === 0 ? <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available.</p> : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ADD_FEATURES.map(af => {
                  const count = addFeatureCounts[af.key] ?? 0;
                  const pct   = scannedKws.length > 0 ? Math.round((count / scannedKws.length) * 100) : 0;
                  return (
                    <div key={af.key} style={{ background: '#0F0F1E', border: `1px solid ${count > 0 ? `${af.color}30` : '#1E1E35'}`, borderRadius: '8px', padding: '12px 14px', opacity: count > 0 ? 1 : 0.5 }}>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full shrink-0" style={{ width: '8px', height: '8px', background: count > 0 ? af.color : '#2A2A3A' }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: '0 0 2px' }}>{af.label}</p>
                          <p style={{ fontSize: '10px', color: '#555570', margin: 0 }}>{af.desc}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '16px', fontWeight: 700, color: count > 0 ? af.color : '#333350', margin: 0, lineHeight: 1 }}>{count}</p>
                          <p style={{ fontSize: '9px', color: '#444458', margin: '2px 0 0' }}>of {scannedKws.length} kws</p>
                        </div>
                        <div style={{ width: '60px', background: '#1E1E2E', borderRadius: '3px', height: '4px', flexShrink: 0 }}>
                          <div style={{ background: count > 0 ? af.color : '#2A2A2A', borderRadius: '3px', height: '4px', width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!hasAnyAddFeatures && (
                <div style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#555570' }}>No featured snippets, knowledge panels, local packs, or shopping results detected. Expand SERP scanning to more keywords for a broader picture.</p>
                </div>
              )}
              <div>
                <SectionLabel text="Full SERP feature inventory by keyword" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {scannedKws.map((kw: SerpKw) => (
                    <div key={kw.keyword} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: '#080812', borderRadius: '6px', border: '1px solid #12121E' }}>
                      <span style={{ fontSize: '11px', color: '#9090B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw.keyword}</span>
                      <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                        {(kw.serpFeatures ?? []).length > 0 ? kw.serpFeatures.map((f: string) => {
                          const meta = ({ ai_overview: { label: 'AIO', color: '#6C63FF' }, featured_snippet: { label: 'Snippet', color: '#22C55E' }, knowledge_panel: { label: 'KP', color: '#F59E0B' }, local_pack: { label: 'Local', color: '#EF4444' }, shopping: { label: 'Shop', color: '#F97316' }, video_carousel: { label: 'Video', color: '#06B6D4' }, image_pack: { label: 'Images', color: '#8B5CF6' } } as Record<string, { label: string; color: string }>)[f];
                          if (!meta) return null;
                          return <span key={f} style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, background: `${meta.color}1A`, border: `1px solid ${meta.color}33`, color: meta.color }}>{meta.label}</span>;
                        }) : <span style={{ fontSize: '10px', color: '#2A2A40' }}>no features</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
