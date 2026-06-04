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
  paaQuestions:     string[];
  paaClientCited:   boolean;
  videoClientCited: boolean;
  clientRank:       number | null;
}

interface Competitor { id: string; domain: string; name: string | null; }

interface Props {
  analysis:    any;
  competitors?: Competitor[];
  clientName?:  string;
  websiteUrl?:  string;
  projectId?:   string;   // v7.103: enables uploaded SERP-feature availability
}

type FeatureTab  = 'aio' | 'paa' | 'video' | 'more';
type AIOViewTab  = 'keywords' | 'landscape';
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

    // Other domains (non-tracked) with counts — for the "Other domains" landscape tab
    const otherDomainMap = new Map<string, number>();
    aioKws.forEach(kw => {
      (kw.aioSources ?? []).forEach(s => {
        const d = normDomain(s.domain);
        if (d && !trackedDomains.has(d)) {
          otherDomainMap.set(d, (otherDomainMap.get(d) ?? 0) + 1);
        }
      });
    });
    const otherDomains = Array.from(otherDomainMap.entries())
      .map(([domain, count]) => ({
        domain,
        citationSlots: count,
        citationRate: totalSlots > 0 ? count / totalSlots : 0,
      }))
      .sort((a, b) => b.citationSlots - a.citationSlots)
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

function KpiCard({ label, value, sub, accent, wide }: { label: string; value: string | number; sub?: string; accent?: string; wide?: boolean }) {
  return (
    <div style={{
      background: accent ? `${accent}10` : '#0A0A18',
      border: `1px solid ${accent ? `${accent}30` : '#1A1A2A'}`,
      borderRadius: '10px', padding: '14px 16px',
      flex: wide ? 2 : 1, minWidth: 0,
    }}>
      <p style={{ fontSize: '9px', fontWeight: 700, color: accent ?? '#555570', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 700, color: accent ?? '#E0E0F8', lineHeight: 1, margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: '10px', color: '#555570', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
    </div>
  );
}

// ── Citation Landscape ─────────────────────────────────────────────────────────

function CitationLandscape({ brandStats, otherDomains, totalAios, totalSlots }: {
  brandStats: BrandStats[];
  otherDomains: Array<{ domain: string; citationSlots: number; citationRate: number }>;
  totalAios: number;
  totalSlots: number;
}) {
  const [tab, setTab] = useState<LandscapeTab>('brands');

  const allRows = useMemo(() => {
    const brands = brandStats.map(b => ({ domain: b.domain, name: b.name, slots: b.citationSlots, rate: b.citationRate, isClient: b.isClient, isBrand: true }));
    const others = otherDomains.map(o => ({ domain: o.domain, name: o.domain, slots: o.citationSlots, rate: o.citationRate, isClient: false, isBrand: false }));
    return [...brands, ...others].sort((a, b) => b.slots - a.slots);
  }, [brandStats, otherDomains]);

  const maxBrandSlots = brandStats[0]?.citationSlots ?? 1;
  const maxOtherSlots = otherDomains[0]?.citationSlots ?? 1;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const TableHeader = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 120px', gap: '0 12px', padding: '6px 12px', borderBottom: '1px solid #1A1A2A', marginBottom: '4px' }}>
      {['Brand / Domain', 'AIOs Cited', 'Slots', 'Citation Rate'].map(h => (
        <span key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#333350', textTransform: 'uppercase', letterSpacing: '.06em', textAlign: h !== 'Brand / Domain' ? 'right' : 'left' }}>{h}</span>
      ))}
    </div>
  );

  const BrandRow = ({ b, maxSlots }: { b: BrandStats; maxSlots: number }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 120px 100px 120px', gap: '0 12px',
      padding: '8px 12px', borderRadius: '7px', alignItems: 'center',
      background: b.isClient ? 'rgba(108,99,255,0.08)' : 'transparent',
      border: `1px solid ${b.isClient ? 'rgba(108,99,255,0.25)' : 'transparent'}`,
      marginBottom: '3px',
    }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '12px', fontWeight: b.isClient ? 600 : 500, color: b.isClient ? '#A0A0FF' : '#D0D0E8', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {b.name}
          {b.isClient && <span style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(108,99,255,0.25)', color: '#8B85FF' }}>client</span>}
        </span>
        <span style={{ fontSize: '10px', color: '#444458' }}>{b.domain}</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
          <div style={{ width: '48px', background: '#1A1A2A', borderRadius: '2px', height: '3px' }}>
            <div style={{ background: b.isClient ? '#6C63FF' : '#334', borderRadius: '2px', height: '3px', width: `${maxSlots > 0 ? Math.min(100, (b.aiosAcquired / maxSlots) * 100) : 0}%` }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: b.isClient ? '#6C63FF' : '#C0C0E8', minWidth: '28px', textAlign: 'right' }}>{b.aiosAcquired}</span>
        </div>
      </div>
      <span style={{ fontSize: '12px', color: '#888899', textAlign: 'right' }}>{b.citationSlots}</span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: b.isClient ? '#6C63FF' : '#888899', textAlign: 'right' }}>{pct(b.citationRate)}</span>
    </div>
  );

  const OtherRow = ({ o, i }: { o: typeof otherDomains[0]; i: number }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 120px', gap: '0 12px', padding: '7px 12px', borderRadius: '6px', alignItems: 'center', background: '#080812', marginBottom: '3px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{ fontSize: '10px', color: '#2A2A40', width: '18px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
        <span style={{ fontSize: '11px', color: '#9090B0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.domain}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
        <div style={{ width: '40px', background: '#1A1A2A', borderRadius: '2px', height: '3px' }}>
          <div style={{ background: '#334', borderRadius: '2px', height: '3px', width: `${maxOtherSlots > 0 ? Math.min(100, (o.citationSlots / maxOtherSlots) * 100) : 0}%` }} />
        </div>
        <span style={{ fontSize: '11px', color: '#7070A0', minWidth: '24px', textAlign: 'right' }}>{o.citationSlots}</span>
      </div>
      <span style={{ fontSize: '11px', color: '#555570', textAlign: 'right' }}>—</span>
      <span style={{ fontSize: '11px', color: '#555570', textAlign: 'right' }}>{pct(o.citationRate)}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <TabBar>
        <TabBtn active={tab === 'brands'} onClick={() => setTab('brands')}>
          Tracked brands <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{brandStats.length}</span>
        </TabBtn>
        <TabBtn active={tab === 'others'} onClick={() => setTab('others')}>
          Other domains <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{otherDomains.length}</span>
        </TabBtn>
        <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>
          All <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{brandStats.length + otherDomains.length}</span>
        </TabBtn>
      </TabBar>

      {tab === 'brands' && (
        <>
          <TableHeader />
          {brandStats.map(b => <BrandRow key={b.domain} b={b} maxSlots={maxBrandSlots} />)}
          {brandStats.length === 0 && <p style={{ fontSize: '12px', color: '#555570' }}>No competitor data configured for this project.</p>}
        </>
      )}

      {tab === 'others' && (
        <>
          <p style={{ fontSize: '11px', color: '#8888AA', margin: '0 0 4px' }}>Non-tracked domains cited in AI Overviews, ranked by citation slots.</p>
          <TableHeader />
          {otherDomains.map((o, i) => <OtherRow key={o.domain} o={o} i={i} />)}
          {otherDomains.length === 0 && <p style={{ fontSize: '12px', color: '#555570' }}>No other domains detected.</p>}
        </>
      )}

      {tab === 'all' && (
        <>
          <TableHeader />
          {allRows.map((row, i) => row.isBrand
            ? <BrandRow key={row.domain} b={brandStats.find(b => b.domain === row.domain)!} maxSlots={Math.max(maxBrandSlots, maxOtherSlots)} />
            : <OtherRow key={row.domain} o={{ domain: row.domain, citationSlots: row.slots, citationRate: row.rate }} i={i} />
          )}
        </>
      )}

      <p style={{ fontSize: '10px', color: '#2A2A40', marginTop: '2px' }}>
        Citation rate = AIOs cited in ÷ {totalAios} AIO-triggering keywords · {totalSlots} total citation slots across all AIOs
      </p>
    </div>
  );
}

// ── Keyword Drilldown ──────────────────────────────────────────────────────────

function KeywordDrilldown({ keywords, clientDomain, clientName }: {
  keywords: EnrichedKw[];
  clientDomain: string;
  clientName: string;
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
            const hasSources = kw.hasAIO && (kw.aioSources?.length ?? 0) > 0;
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

                {/* Expanded: full AIO source list */}
                {isExpanded && hasSources && (
                  <div style={{ padding: '0 12px 10px', borderTop: '1px solid #0F0F1E' }}>
                    <p style={{ fontSize: '9px', color: '#333350', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', margin: '8px 0 5px' }}>
                      All AIO sources ({kw.aioSources.length})
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {kw.aioSources.map((src, i) => {
                        const isMe = domainsMatch(src.domain, clientDomain);
                        return (
                          <span key={i} title={src.title || src.url} style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 500,
                            background: isMe ? 'rgba(108,99,255,0.15)' : '#12121E',
                            border: `1px solid ${isMe ? 'rgba(108,99,255,0.4)' : '#1A1A2A'}`,
                            color: isMe ? '#A0A0FF' : '#7070A0',
                          }}>
                            <span style={{ fontSize: '9px', color: '#444458', marginRight: '3px' }}>#{i + 1}</span>
                            {src.domain}
                            {isMe && <span style={{ marginLeft: '4px', fontSize: '9px', color: '#6C63FF' }}>★</span>}
                          </span>
                        );
                      })}
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

export default function SerpFeaturesSection({ analysis, competitors = [], clientName = '', websiteUrl = '', projectId }: Props) {
  const [activeTab,   setActiveTab]   = useState<FeatureTab>('aio');
  const [aioViewTab,  setAioViewTab]  = useState<AIOViewTab>('keywords');

  const serpSnap    = analysis.serpApiSnapshot ?? {};
  const featSummary = serpSnap.serpFeatureSummary;
  const aioSummary  = serpSnap.aioSummary;

  const scannedKws: SerpKw[] = serpSnap.keywords ?? [];
  const scanned  = featSummary?.scanned ?? scannedKws.length;
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
  }, [projectId]);

  const scannedSet = useMemo(
    () => new Set(scannedKws.map(k => (k.keyword ?? '').trim().toLowerCase())),
    [scannedKws]
  );
  const uploadFeat = useMemo(
    () => countUploadFeatures(uploadRows ?? [], scannedSet),
    [uploadRows, scannedSet]
  );

  // AIO aggregate metrics — scan-side
  const aioAvailScan = analysis.aioAvailable ?? 0;
  const aioAcq       = analysis.aioAcquired  ?? 0;
  // v7.103 hybrid availability: scanned SERPs + uploaded (unscanned) keywords
  const aioAvail  = aioAvailScan + uploadFeat.aio;
  const aioRate   = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;

  // PAA
  const paaAvailScan = featSummary?.withPAA        ?? scannedKws.filter(k => k.paaQuestions?.length > 0).length;
  const paaAcq       = featSummary?.paaClientCited ?? scannedKws.filter(k => k.paaClientCited).length;
  const paaAvail = paaAvailScan + uploadFeat.paa;
  const paaRate  = paaAvail > 0 ? Math.round((paaAcq / paaAvail) * 100) : 0;

  // Video
  const videoAvailScan = featSummary?.withVideo        ?? scannedKws.filter(k => k.serpFeatures?.includes('video_carousel')).length;
  const videoAcq       = featSummary?.videoClientCited ?? scannedKws.filter(k => k.videoClientCited).length;
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

  // All computed AIO data
  const aio = useAIOData(scannedKws, clientDomain, displayClientName, competitors, aioSummary?.clientCited ?? aioAcq);

  // Citation rate for KPI display
  const clientCitationRatePct = aio.totalAios > 0
    ? ((aio.clientStats?.aiosAcquired ?? 0) / aio.totalAios * 100).toFixed(1)
    : '0.0';

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
              <KpiCard label="Your Citation Rate" value={`${clientCitationRatePct}%`} sub={`${aio.clientStats?.aiosAcquired ?? 0} of ${aio.totalAios} scanned AIOs`} accent={aio.clientStats?.aiosAcquired ? '#6C63FF' : '#EF4444'} wide />
              <KpiCard label="Citation Share" value={`${(aio.citationShare * 100).toFixed(1)}%`} sub={`${aio.clientStats?.citationSlots ?? 0} of ${aio.totalSlots} slots`} accent="#6C63FF" />
              <KpiCard label="Avg Citation Position" value={aio.avgCitationPosition !== null ? aio.avgCitationPosition.toFixed(1) : '—'} sub="position in AIO source list" />
              {aio.topCompetitor && (
                <KpiCard label={`Top Competitor · ${aio.topCompetitor.name}`} value={`${(aio.topCompetitor.citationRate * 100).toFixed(1)}%`} sub={`${aio.topCompetitor.aiosAcquired} AIOs`} accent="#FF6584" />
              )}
              <KpiCard label="Others" value={`${(aio.othersShare * 100).toFixed(1)}%`} sub="non-tracked domains" />
            </div>
          </div>

          {/* Gap callout */}
          {(aio.clientStats?.aiosAcquired ?? 0) < aio.totalAios && aio.totalAios > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderRadius: '8px', background: '#150A2A', border: '1px solid #3A1A6A' }}>
              <div>
                <p style={{ fontSize: '10px', color: '#9B6FCA', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '18px', fontWeight: 700, color: '#C08AF0', margin: 0 }}>
                  {aio.totalAios - (aio.clientStats?.aiosAcquired ?? 0)} uncaptured AIO{aio.totalAios - (aio.clientStats?.aiosAcquired ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
              <p style={{ fontSize: '11px', color: '#8888AA', flex: 1, margin: 0 }}>
                {displayClientName} is missing from <strong style={{ color: '#C08AF0' }}>{aio.totalAios - (aio.clientStats?.aiosAcquired ?? 0)}</strong> of <strong style={{ color: '#C08AF0' }}>{aio.totalAios}</strong> AIO-triggering keywords. These are direct citation opportunities.
              </p>
            </div>
          )}

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <>
              {/* View toggle */}
              <TabBar>
                <TabBtn active={aioViewTab === 'keywords'}  onClick={() => setAioViewTab('keywords')}>Keyword Drilldown</TabBtn>
                <TabBtn active={aioViewTab === 'landscape'} onClick={() => setAioViewTab('landscape')}>Citation Landscape</TabBtn>
              </TabBar>

              {aioViewTab === 'keywords' && (
                <KeywordDrilldown
                  keywords={aio.enrichedKws}
                  clientDomain={clientDomain}
                  clientName={displayClientName}
                />
              )}

              {aioViewTab === 'landscape' && (
                <CitationLandscape
                  brandStats={aio.brandStats}
                  otherDomains={aio.otherDomains}
                  totalAios={aio.totalAios}
                  totalSlots={aio.totalSlots}
                />
              )}
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
