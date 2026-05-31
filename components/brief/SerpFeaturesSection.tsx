'use client';
import { useMemo, useState } from 'react';

/**
 * SerpFeaturesSection — v7.39
 *
 * Changes from v7.38:
 *  - AIO tab upgraded with AIO tracker's Citation Landscape + Keyword Explorer patterns
 *    · Citation Landscape: ranked bar chart of all domains cited in AIOs (client + competitors + others)
 *    · Keyword Explorer: filterable keyword list (All / AIO Active / ✓ Cited / ✗ Gaps) with
 *      expandable AIO source chips per keyword
 *  - PAA tab: unchanged
 *  - Video tab: unchanged
 *  - More Features tab: unchanged
 *  - Weighted SERP feature percentages (hero donut + FeatureRateCards): unchanged
 */

// ── Types ──────────────────────────────────────────────────────────────────────

interface SerpKw {
  keyword:          string;
  serpFeatures:     string[];
  hasAIO:           boolean;
  aioSources:       Array<{ domain: string; title: string; url: string }>;
  featuredSnippet?: { domain: string; title: string; url: string } | null;
  paaQuestions:     string[];
  paaClientCited:   boolean;
  videoClientCited: boolean;
  clientRank:       number | null;
}

interface Props { analysis: any; }

type FeatureTab = 'aio' | 'paa' | 'video' | 'more';
type AIOViewTab = 'keywords' | 'landscape';
type KwFilter   = 'all' | 'aio' | 'cited' | 'gaps';

// ── Helpers ────────────────────────────────────────────────────────────────────

function normDomain(d: string): string {
  return (d ?? '').replace(/^www\./, '').toLowerCase();
}

/** Returns true if the client domain appears in this keyword's AIO sources */
function clientCitedInAio(kw: SerpKw, clientDomain: string): boolean {
  if (!kw.hasAIO || !kw.aioSources?.length) return false;
  const nd = normDomain(clientDomain);
  if (!nd) return false;
  return kw.aioSources.some(s => {
    const sd = normDomain(s.domain);
    return sd === nd || sd.endsWith('.' + nd) || nd.endsWith('.' + sd);
  });
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function FeatureRateCard({
  label, color, rate, acquired, available, active, onClick,
}: {
  label: string; color: string;
  rate: number; acquired: number; available: number;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 text-left transition-all"
      style={{
        flex: 1, padding: '14px', borderRadius: '10px',
        background: active ? `${color}12` : '#0F0F1E',
        border: `1.5px solid ${active ? color : '#1E1E35'}`,
        cursor: 'pointer', transition: 'all .15s',
      }}
    >
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

function CitedBadge({ cited, label }: { cited: boolean; label?: string }) {
  return cited ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
      background: '#0A2A0A', border: '1px solid #22C55E44', color: '#22C55E',
    }}>✓ {label ?? 'Cited'}</span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
      background: '#1A0A0A', border: '1px solid #EF444433', color: '#EF4444',
    }}>✗ Not cited</span>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <p style={{ fontSize: '10px', fontWeight: 600, color: '#444458', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>
      {text}
    </p>
  );
}

// ── AIO Citation Landscape ────────────────────────────────────────────────────
// Ported from AIO tracker CitationLandscape — adapted to OrbitIQ's data model.
// Shows a ranked bar chart of every domain cited in AIOs across all keywords.

interface CiteRow {
  domain:     string;
  citedCount: number;
  isClient:   boolean;
  citeRate:   number; // citedCount / total AIO keywords
}

function AIOCitationLandscape({
  clientDomain,
  clientCited,
  topCompetitors,
  totalAios,
  allKeywords,
}: {
  clientDomain:   string;
  clientCited:    number;
  topCompetitors: Array<{ domain: string; citedCount: number }>;
  totalAios:      number;
  allKeywords:    SerpKw[];
}) {
  const rows: CiteRow[] = useMemo(() => {
    const map = new Map<string, number>();
    // Seed from topAIOCompetitors
    for (const c of topCompetitors) {
      const d = normDomain(c.domain);
      if (d) map.set(d, c.citedCount);
    }
    // Add / update client row
    const nd = normDomain(clientDomain);
    if (nd) {
      const existing = map.get(nd) ?? 0;
      map.set(nd, Math.max(existing, clientCited));
    }
    // Tally any extra domains from per-keyword sources not already in map
    for (const kw of allKeywords) {
      if (!kw.hasAIO) continue;
      for (const src of (kw.aioSources ?? [])) {
        const d = normDomain(src.domain);
        if (d && !map.has(d)) map.set(d, 1);
      }
    }
    const arr: CiteRow[] = [];
    map.forEach((count, domain) => {
      arr.push({
        domain,
        citedCount: count,
        isClient:   domain === normDomain(clientDomain),
        citeRate:   totalAios > 0 ? count / totalAios : 0,
      });
    });
    return arr.sort((a, b) => b.citedCount - a.citedCount).slice(0, 20);
  }, [topCompetitors, clientDomain, clientCited, allKeywords, totalAios]);

  const maxCount = rows[0]?.citedCount ?? 1;

  if (rows.length === 0) {
    return <p style={{ fontSize: '12px', color: '#555570' }}>No citation data available. Run analysis to populate.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {rows.map((row, i) => (
        <div
          key={row.domain}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px', borderRadius: '8px',
            background: row.isClient ? 'rgba(108,99,255,0.08)' : '#0A0A18',
            border: `1px solid ${row.isClient ? 'rgba(108,99,255,0.35)' : '#12121E'}`,
          }}
        >
          <span style={{ fontSize: '10px', color: '#333350', width: '18px', flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '12px', color: row.isClient ? '#A0A0FF' : '#C0C0D8', fontWeight: row.isClient ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {row.domain}
            </span>
            {row.isClient && (
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(108,99,255,0.2)', color: '#8B85FF', fontWeight: 600, marginTop: '2px', display: 'inline-block' }}>
                client
              </span>
            )}
          </div>
          <div style={{ width: '80px', background: '#1E1E2E', borderRadius: '3px', height: '4px', flexShrink: 0 }}>
            <div style={{
              background: row.isClient ? '#6C63FF' : '#2A2A3A',
              borderRadius: '3px', height: '4px',
              width: `${Math.min(100, (row.citedCount / maxCount) * 100)}%`,
            }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: row.isClient ? '#6C63FF' : '#8888AA', flexShrink: 0, width: '28px', textAlign: 'right' }}>
            {row.citedCount}
          </span>
          <span style={{ fontSize: '10px', color: '#444458', flexShrink: 0, width: '40px', textAlign: 'right' }}>
            {totalAios > 0 ? `${(row.citeRate * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
      ))}
      <p style={{ fontSize: '10px', color: '#333350', marginTop: '4px' }}>
        Citation rate = AIOs cited in ÷ {totalAios} AIO-triggering keyword{totalAios !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ── AIO Keyword Explorer ──────────────────────────────────────────────────────
// Ported from AIO tracker KeywordExplorer — adapted to OrbitIQ's per-keyword data.

function AIOKeywordExplorer({
  keywords,
  clientDomain,
}: {
  keywords:     SerpKw[];
  clientDomain: string;
}) {
  const [filter, setFilter]     = useState<KwFilter>('aio');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch]     = useState('');

  const counts = useMemo(() => ({
    all:   keywords.length,
    aio:   keywords.filter(k => k.hasAIO).length,
    cited: keywords.filter(k => clientCitedInAio(k, clientDomain)).length,
    gaps:  keywords.filter(k => k.hasAIO && !clientCitedInAio(k, clientDomain)).length,
  }), [keywords, clientDomain]);

  const filtered = useMemo(() => {
    let kws = keywords;
    if (search.trim()) {
      const q = search.toLowerCase();
      kws = kws.filter(k => k.keyword.toLowerCase().includes(q));
    }
    switch (filter) {
      case 'aio':   return kws.filter(k => k.hasAIO);
      case 'cited': return kws.filter(k => clientCitedInAio(k, clientDomain));
      case 'gaps':  return kws.filter(k => k.hasAIO && !clientCitedInAio(k, clientDomain));
      default:      return kws;
    }
  }, [keywords, filter, search, clientDomain]);

  const FILTERS: Array<{ key: KwFilter; label: string; color: string }> = [
    { key: 'all',   label: 'All',        color: '#555570' },
    { key: 'aio',   label: 'AIO Active', color: '#6C63FF' },
    { key: 'cited', label: '✓ Cited',    color: '#22C55E' },
    { key: 'gaps',  label: '✗ Gaps',     color: '#EF4444' },
  ];

  function toggleExpand(kw: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(kw) ? next.delete(kw) : next.add(kw);
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                background: filter === f.key ? `${f.color}18` : 'transparent',
                border: `1px solid ${filter === f.key ? f.color : '#1E1E35'}`,
                color: filter === f.key ? f.color : '#555570',
                cursor: 'pointer',
              }}
            >
              {f.label}
              <span style={{
                fontSize: '9px', padding: '0 4px', borderRadius: '3px',
                background: filter === f.key ? `${f.color}25` : '#1A1A2A',
                color: filter === f.key ? f.color : '#444458',
              }}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search keywords…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: '160px', padding: '5px 10px', borderRadius: '6px',
            background: '#0A0A18', border: '1px solid #1E1E35',
            color: '#D0D0F0', fontSize: '11px', outline: 'none',
          }}
        />
      </div>

      {/* Keyword rows */}
      {filtered.length === 0 ? (
        <p style={{ fontSize: '12px', color: '#555570', textAlign: 'center', padding: '20px 0' }}>
          No keywords match this filter.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filtered.map(kw => {
            const isCited   = clientCitedInAio(kw, clientDomain);
            const isExpanded = expanded.has(kw.keyword);
            const hasSources = kw.hasAIO && kw.aioSources?.length > 0;
            return (
              <div
                key={kw.keyword}
                style={{
                  background: '#0A0A18', border: '1px solid #12121E', borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => hasSources && toggleExpand(kw.keyword)}
                  style={{
                    width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center',
                    gap: '10px', background: 'transparent', border: 'none',
                    cursor: hasSources ? 'pointer' : 'default', textAlign: 'left',
                  }}
                >
                  <span style={{ flex: 1, fontSize: '12px', color: '#D0D0F0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kw.keyword}
                  </span>
                  {kw.clientRank !== null && (
                    <span style={{ fontSize: '10px', color: '#555570', flexShrink: 0 }}>#{kw.clientRank}</span>
                  )}
                  {kw.hasAIO ? (
                    <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1040', border: '1px solid #6C63FF44', color: '#8B85FF', flexShrink: 0 }}>
                      AIO
                    </span>
                  ) : (
                    <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#333350', flexShrink: 0 }}>
                      No AIO
                    </span>
                  )}
                  {kw.hasAIO && <CitedBadge cited={isCited} />}
                  {hasSources && (
                    <span style={{ fontSize: '10px', color: '#333350', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▼</span>
                  )}
                </button>

                {/* Expanded: AIO source chips */}
                {isExpanded && hasSources && (
                  <div style={{ padding: '0 12px 10px', borderTop: '1px solid #0F0F1E' }}>
                    <p style={{ fontSize: '9px', color: '#333350', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', margin: '8px 0 5px' }}>
                      AIO Sources ({kw.aioSources.length})
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {kw.aioSources.map((src, idx) => {
                        const nd   = normDomain(clientDomain);
                        const sd   = normDomain(src.domain);
                        const isMe = nd && (sd === nd || sd.endsWith('.' + nd) || nd.endsWith('.' + sd));
                        return (
                          <span
                            key={idx}
                            title={src.title || src.url}
                            style={{
                              padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 500,
                              background: isMe ? 'rgba(108,99,255,0.15)' : '#12121E',
                              border: `1px solid ${isMe ? 'rgba(108,99,255,0.4)' : '#1A1A2A'}`,
                              color: isMe ? '#A0A0FF' : '#7070A0',
                            }}
                          >
                            {src.domain}{isMe && <span style={{ marginLeft: '4px', fontSize: '9px', color: '#6C63FF' }}>★</span>}
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

const ADD_FEATURES: Array<{ key: string; label: string; color: string; desc: string }> = [
  { key: 'featured_snippet', label: 'Featured Snippet', color: '#22C55E', desc: 'Answer box at top of results' },
  { key: 'knowledge_panel',  label: 'Knowledge Panel',  color: '#F59E0B', desc: 'Entity knowledge card (right rail)' },
  { key: 'local_pack',       label: 'Local Pack',       color: '#EF4444', desc: 'Map + local business results' },
  { key: 'shopping',         label: 'Shopping / PLAs',  color: '#F97316', desc: 'Product listing carousel' },
  { key: 'image_pack',       label: 'Image Pack',       color: '#8B5CF6', desc: 'Google image results row' },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SerpFeaturesSection({ analysis }: Props) {
  const [activeTab, setActiveTab]   = useState<FeatureTab>('aio');
  const [aioViewTab, setAioViewTab] = useState<AIOViewTab>('keywords');

  // ── Data ──────────────────────────────────────────────────────────────────
  const serpSnap    = analysis.serpApiSnapshot ?? {};
  const featSummary = serpSnap.serpFeatureSummary;
  const aioSummary  = serpSnap.aioSummary;

  const scannedKws: SerpKw[] = serpSnap.keywords ?? [];
  const scanned = featSummary?.scanned ?? scannedKws.length ?? 0;

  const clientDomain: string = normDomain(serpSnap.domain ?? analysis.websiteUrl ?? '');

  // AIO
  const aioAvail    = analysis.aioAvailable ?? 0;
  const aioAcq      = analysis.aioAcquired  ?? 0;
  const aioRate     = aioAvail > 0 ? Math.round((aioAcq / aioAvail) * 100) : 0;
  const totalAioKws = aioSummary?.withAIO ?? scannedKws.filter((k: SerpKw) => k.hasAIO).length;
  const clientCited = aioSummary?.clientCited ?? aioAcq;

  // PAA
  const paaAvail = featSummary?.withPAA        ?? scannedKws.filter((k: SerpKw) => k.paaQuestions?.length > 0).length;
  const paaAcq   = featSummary?.paaClientCited ?? scannedKws.filter((k: SerpKw) => k.paaClientCited).length;
  const paaRate  = paaAvail > 0 ? Math.round((paaAcq / paaAvail) * 100) : 0;

  // Video
  const videoAvail = featSummary?.withVideo         ?? scannedKws.filter((k: SerpKw) => k.serpFeatures?.includes('video_carousel')).length;
  const videoAcq   = featSummary?.videoClientCited  ?? scannedKws.filter((k: SerpKw) => k.videoClientCited).length;
  const videoRate  = videoAvail > 0 ? Math.round((videoAcq / videoAvail) * 100) : 0;

  // Combined weighted SERP coverage
  const totalAvail   = aioAvail + paaAvail + videoAvail;
  const totalAcq     = aioAcq  + paaAcq  + videoAcq;
  const combinedRate = totalAvail > 0 ? Math.min(100, Math.round((totalAcq / totalAvail) * 100)) : 0;

  // Top AIO competitors
  const topAIOCompetitors: Array<{ domain: string; citedCount: number }> =
    (serpSnap.topAIOCompetitors ?? []).slice(0, 15);

  // Scan date
  const scanDate = serpSnap.fetchedAt
    ? new Date(serpSnap.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Additional features inventory
  const addFeatureCounts: Record<string, number> = {};
  ADD_FEATURES.forEach(af => {
    addFeatureCounts[af.key] = scannedKws.filter((k: SerpKw) => k.serpFeatures?.includes(af.key)).length;
  });
  const hasAnyAddFeatures = ADD_FEATURES.some(af => addFeatureCounts[af.key] > 0);

  return (
    <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-4 animate-fade-in">

      {/* ── Section Header ── */}
      <div className="orbit-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Search · 04</p>
            <h2 className="text-orbit-primary text-xl font-bold mt-1">SERP Features</h2>
            <p className="text-orbit-secondary text-sm mt-1">AI Overviews · People Also Ask · Video Carousel</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {scanDate && (
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>
                Scan: {scanDate}
              </span>
            )}
            {scanned > 0 && (
              <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: '#0F0F1E', border: '1px solid #1E1E35', color: '#505070' }}>
                {scanned} kw{scanned !== 1 ? 's' : ''} scanned
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero: Combined SERP Coverage (weighted) ── */}
      <div className="orbit-card p-5">
        <div className="flex items-center gap-6">
          <div className="relative shrink-0" style={{ width: '120px', height: '120px' }}>
            <svg viewBox="0 0 36 36" width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1E1E2E" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#6C63FF" strokeWidth="3"
                strokeLinecap="round" strokeDasharray={`${combinedRate} 100`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span style={{ color: '#6C63FF', fontWeight: 700, fontSize: '26px', lineHeight: 1 }}>{combinedRate}%</span>
              <span style={{ color: '#8888AA', fontSize: '10px', marginTop: '3px', textAlign: 'center', lineHeight: 1.3 }}>SERP<br />coverage</span>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-3">
            {[
              { label: 'Available', val: totalAvail,            color: '#8888AA', sub: 'total feature slots' },
              { label: 'Captured',  val: totalAcq,              color: '#22C55E', sub: 'client is cited' },
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
            <div style={{ flexShrink: 0, maxWidth: '200px', padding: '12px', borderRadius: '8px', background: '#0F0F1E', border: '1px solid #1E1E35', borderLeft: '3px solid #6C63FF' }}>
              <p style={{ fontSize: '11px', color: '#8888AA', lineHeight: 1.5, margin: 0 }}>
                {combinedRate < 20
                  ? <>Strong opportunity — client appears in only <span style={{ color: '#EF4444', fontWeight: 600 }}>{combinedRate}%</span> of available SERP features.</>
                  : combinedRate < 60
                  ? <>Growing presence — capturing <span style={{ color: '#F59E0B', fontWeight: 600 }}>{combinedRate}%</span> of available SERP features. Significant upside remains.</>
                  : <>Solid feature presence — capturing <span style={{ color: '#22C55E', fontWeight: 600 }}>{combinedRate}%</span> of available SERP features across AIO, PAA &amp; video.</>
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Feature Tab Selector ── */}
      <div className="flex gap-2 flex-wrap">
        <FeatureRateCard label="AI Overviews"    color="#6C63FF"
          rate={aioRate}   acquired={aioAcq}   available={aioAvail}
          active={activeTab === 'aio'}   onClick={() => setActiveTab('aio')} />
        <FeatureRateCard label="People Also Ask" color="#06B6D4"
          rate={paaRate}   acquired={paaAcq}   available={paaAvail}
          active={activeTab === 'paa'}   onClick={() => setActiveTab('paa')} />
        <FeatureRateCard label="Video Carousel"  color="#F59E0B"
          rate={videoRate} acquired={videoAcq} available={videoAvail}
          active={activeTab === 'video'} onClick={() => setActiveTab('video')} />
        <button
          onClick={() => setActiveTab('more')}
          className="flex flex-col gap-2 text-left transition-all"
          style={{
            flex: 1, padding: '14px', borderRadius: '10px',
            background: activeTab === 'more' ? '#22C55E12' : '#0F0F1E',
            border: `1.5px solid ${activeTab === 'more' ? '#22C55E' : '#1E1E35'}`,
            cursor: 'pointer', minWidth: '120px',
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#8888AA', textTransform: 'uppercase', letterSpacing: '.07em' }}>More Features</span>
          </div>
          <p style={{ fontSize: '11px', color: '#555570', margin: 0 }}>Snippets · KP · Local · Shopping</p>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          AIO TAB — upgraded with Citation Landscape + Keyword Explorer
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'aio' && (
        <div className="orbit-card p-5 flex flex-col gap-4">

          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="AI Overviews" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>
                Google surfaces an AI-generated answer for qualifying keywords.
                Client must be cited as a source to gain AIO visibility.
              </p>
            </div>
            {aioAcq < aioAvail && aioAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#150A2A', border: '1px solid #3A1A6A' }}>
                <p style={{ fontSize: '10px', color: '#9B6FCA', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#C08AF0', margin: 0 }}>
                  {aioAvail - aioAcq} uncaptured AIO{aioAvail - aioAcq !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <>
              {/* View toggle */}
              <div
                role="tablist"
                style={{
                  display: 'inline-flex', padding: 3, borderRadius: 10,
                  background: '#08080F', border: '1px solid rgba(255,255,255,0.06)',
                  gap: 2, alignSelf: 'flex-start',
                }}
              >
                {([
                  { key: 'keywords'  as const, label: 'Keyword Explorer' },
                  { key: 'landscape' as const, label: 'Citation Landscape' },
                ]).map(({ key, label }) => {
                  const active = aioViewTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setAioViewTab(key)}
                      role="tab"
                      aria-selected={active}
                      style={{
                        padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: active ? 600 : 500,
                        color:      active ? '#06070b' : '#d6dbe6',
                        background: active ? '#6C63FF' : 'transparent',
                        border: 'none', cursor: 'pointer',
                        transition: 'background-color 120ms ease, color 120ms ease',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Keyword Explorer */}
              {aioViewTab === 'keywords' && (
                <AIOKeywordExplorer keywords={scannedKws} clientDomain={clientDomain} />
              )}

              {/* Citation Landscape */}
              {aioViewTab === 'landscape' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>
                      Every domain cited in AI Overviews, ranked by citation count. Client row highlighted.
                    </p>
                    <span style={{ fontSize: '10px', color: '#444458', flexShrink: 0 }}>
                      {totalAioKws} AIO-triggering kw{totalAioKws !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* Column headers */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 12px' }}>
                    <span style={{ fontSize: '9px', color: '#2A2A40', width: '18px', textAlign: 'right', flexShrink: 0 }}>#</span>
                    <span style={{ fontSize: '9px', color: '#2A2A40', flex: 1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Domain</span>
                    <span style={{ fontSize: '9px', color: '#2A2A40', width: '80px', flexShrink: 0 }}></span>
                    <span style={{ fontSize: '9px', color: '#2A2A40', width: '28px', textAlign: 'right', flexShrink: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>AIOs</span>
                    <span style={{ fontSize: '9px', color: '#2A2A40', width: '40px', textAlign: 'right', flexShrink: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Rate</span>
                  </div>
                  <AIOCitationLandscape
                    clientDomain={clientDomain}
                    clientCited={clientCited}
                    topCompetitors={topAIOCompetitors}
                    totalAios={totalAioKws}
                    allKeywords={scannedKws}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PAA TAB — unchanged
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'paa' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="People Also Ask" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>
                PAA boxes surface related questions users are asking.
                Client cited = the client&apos;s content answers one of those questions.
              </p>
            </div>
            {paaAcq < paaAvail && paaAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#001A24', border: '1px solid #005070' }}>
                <p style={{ fontSize: '10px', color: '#06B6D4', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#06B6D4', margin: 0 }}>
                  {paaAvail - paaAcq} uncaptured PAA{paaAvail - paaAcq !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scannedKws.map((kw: SerpKw) => {
                const hasPAA = (kw.paaQuestions ?? []).length > 0;
                return (
                  <div key={kw.keyword} style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '12px 14px' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                              {kw.paaQuestions.slice(0, 3).map((q: string, i: number) => (
                                <p key={i} style={{ fontSize: '10px', color: '#555570', margin: 0 }}>· {q}</p>
                              ))}
                              {kw.paaQuestions.length > 3 && (
                                <p style={{ fontSize: '10px', color: '#333350', margin: 0 }}>+{kw.paaQuestions.length - 3} more questions</p>
                              )}
                            </div>
                          </>
                        ) : (
                          <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555570' }}>
                            No PAA box
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VIDEO TAB — unchanged
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'video' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel text="Video Carousel" />
              <p style={{ fontSize: '12px', color: '#8888AA', margin: 0 }}>
                Video carousels appear on queries where YouTube &amp; video content ranks well.
                Client cited = the client&apos;s YouTube channel or hosted video appears in the carousel.
              </p>
            </div>
            {videoAcq < videoAvail && videoAvail > 0 && (
              <div style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: '#1A1000', border: '1px solid #504000' }}>
                <p style={{ fontSize: '10px', color: '#F59E0B', fontWeight: 600, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gap</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B', margin: 0 }}>{videoAvail - videoAcq} uncaptured</p>
              </div>
            )}
          </div>
          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {scannedKws.map((kw: SerpKw) => {
                const hasVideo = kw.serpFeatures?.includes('video_carousel');
                return (
                  <div key={kw.keyword} style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '12px', color: '#D0D0F0', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {kw.keyword}
                      </p>
                    </div>
                    {hasVideo ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1000', border: '1px solid #F59E0B44', color: '#F59E0B' }}>
                          Video carousel
                        </span>
                        <CitedBadge cited={kw.videoClientCited} />
                      </div>
                    ) : (
                      <span style={{ padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#555570', flexShrink: 0 }}>
                        No video carousel
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {videoAvail === 0 && scannedKws.length > 0 && (
            <div style={{ background: '#0F0F1E', border: '1px solid #1E1E35', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#555570' }}>
                No video carousels detected on scanned keywords. Creating a YouTube channel and optimizing video content for key terms could unlock this SERP feature.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MORE FEATURES TAB — unchanged
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'more' && (
        <div className="orbit-card p-5 flex flex-col gap-4">
          <div>
            <SectionLabel text="Additional SERP features detected" />
            <p style={{ fontSize: '12px', color: '#8888AA', margin: '0 0 12px' }}>
              Features detected across {scannedKws.length} scanned keywords.
            </p>
          </div>
          {scannedKws.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#555570' }}>No SERP scan data available. Run analysis to populate.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ADD_FEATURES.map(af => {
                  const count = addFeatureCounts[af.key] ?? 0;
                  const pct   = scannedKws.length > 0 ? Math.round((count / scannedKws.length) * 100) : 0;
                  return (
                    <div key={af.key} style={{
                      background: '#0F0F1E', border: `1px solid ${count > 0 ? `${af.color}30` : '#1E1E35'}`,
                      borderRadius: '8px', padding: '12px 14px', opacity: count > 0 ? 1 : 0.5,
                    }}>
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
                  <p style={{ fontSize: '12px', color: '#555570' }}>
                    No featured snippets, knowledge panels, local packs, or shopping results detected. Expand SERP scanning to more keywords for a broader picture.
                  </p>
                </div>
              )}
              {/* Per-keyword full feature inventory */}
              <div>
                <SectionLabel text="Full SERP feature inventory by keyword" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {scannedKws.map((kw: SerpKw) => (
                    <div key={kw.keyword} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: '#080812', borderRadius: '6px', border: '1px solid #12121E' }}>
                      <span style={{ fontSize: '11px', color: '#9090B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw.keyword}</span>
                      <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
                        {(kw.serpFeatures ?? []).length > 0 ? (
                          kw.serpFeatures.map((f: string) => {
                            const meta = ({
                              ai_overview:      { label: 'AIO',     color: '#6C63FF' },
                              featured_snippet: { label: 'Snippet', color: '#22C55E' },
                              knowledge_panel:  { label: 'KP',      color: '#F59E0B' },
                              local_pack:       { label: 'Local',   color: '#EF4444' },
                              shopping:         { label: 'Shop',    color: '#F97316' },
                              video_carousel:   { label: 'Video',   color: '#06B6D4' },
                              image_pack:       { label: 'Images',  color: '#8B5CF6' },
                              twitter_pack:     { label: 'Twitter', color: '#1DA1F2' },
                            } as Record<string, { label: string; color: string }>)[f];
                            if (!meta) return null;
                            return (
                              <span key={f} style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, background: `${meta.color}1A`, border: `1px solid ${meta.color}33`, color: meta.color }}>
                                {meta.label}
                              </span>
                            );
                          })
                        ) : (
                          <span style={{ fontSize: '10px', color: '#2A2A40' }}>no features</span>
                        )}
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
