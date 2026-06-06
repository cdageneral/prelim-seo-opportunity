'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { buildKwPool, isBrandedKeyword, extractBrand } from '@/lib/utils/kwVolume';

// ─── Types ────────────────────────────────────────────────────────────────────

type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';

interface KwItem {
  keyword:      string;
  searchVolume: number;
  position:     number | null;   // null = client not ranking
  isGap:        boolean;         // competitor ranks, client doesn't
  competitor:   string | null;   // domain that ranks for gap keywords
}

interface IntentCluster {
  intent:           IntentType;
  stage:            JourneyStage;
  contentType:      string;
  contentIcon:      string;
  keywords:         KwItem[];
  totalVolume:      number;
  clientVolume:     number;
  competitorVolume: number;
}

interface ThemeCluster {
  id:          string;
  name:        string;
  type:        'procedure' | 'brand' | 'location';
  keywords:    KwItem[];
  totalVolume: number;
  subClusters: IntentCluster[];
}

interface Props {
  projectId:                string;
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  analysis:                 any;
  competitors:              string[];
  defaultClientThreshold?:     number;
  defaultCompetitorThreshold?: number;
}

// ─── Competitor colour palette ────────────────────────────────────────────────

const COMP_COLORS = ['#6C63FF', '#F59E0B', '#22C55E', '#38BDF8', '#F472B6', '#A78BFA', '#FB923C'];
// index 0 = client (purple), 1–6 = competitors

// ─── Branded / domain helpers ─────────────────────────────────────────────────

// ─── Brand helpers — delegated to shared utility ─────────────────────────────
// DO NOT add local isBranded / extractBrand here — edit lib/utils/kwVolume.ts instead.
const isBranded = isBrandedKeyword;

/** Capitalises first letter and truncates for display in small UI contexts. */
function displayName(domain: string, maxLen = 14): string {
  const brand = extractBrand(domain);
  if (!brand) return domain.slice(0, maxLen);
  const cap = brand.charAt(0).toUpperCase() + brand.slice(1);
  return cap.length > maxLen ? cap.slice(0, maxLen - 1) + '…' : cap;
}

// ─── Intent signal detection (Layer 1) ───────────────────────────────────────

const TRANSACTIONAL_SIGNALS = [
  'near me', 'near ', 'schedule', 'book ', 'booking', 'appointment', 'consultation',
  'how much does', 'how much is', 'how much', 'cost', 'price', 'pricing',
  'financing', 'payment plan', 'afford', 'discount', 'coupon', 'deal', 'specials',
  'locations', 'location', 'find a ', 'get a ',
];
const COMMERCIAL_SIGNALS = [
  'review', 'reviews', 'best ', 'top ', ' vs ', 'versus', 'compare', 'comparison',
  'before after', 'before and after', 'results', 'worth it', 'pros and cons',
  'alternative', 'rating', 'ratings', 'testimonial', 'testimonials', 'complaints',
  'side effects', 'risks', 'dangers', 'safe ', 'safety',
];
const INFORMATIONAL_SIGNALS = [
  'what is ', 'what are ', 'how does', 'how do', 'how to', 'why ', 'guide',
  ' tips', 'recovery', 'benefits', 'difference between', 'types of', 'explained',
  'overview', 'about ', 'definition', 'learn', 'understanding', 'causes', 'symptoms',
];

function detectIntentSignal(keyword: string): IntentType | null {
  const kw = keyword.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (kw.includes(s)) return 'transactional'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (kw.includes(s)) return 'commercial';    }
  for (const s of INFORMATIONAL_SIGNALS) { if (kw.includes(s)) return 'informational'; }
  return null;
}

// ─── Intent constants ─────────────────────────────────────────────────────────

const INTENT_META: Record<IntentType, {
  label: string; stage: JourneyStage; contentType: string; contentIcon: string;
}> = {
  informational: { label: 'Informational', stage: 'awareness',     contentType: 'Blog / Educational', contentIcon: 'ti-file-text'  },
  commercial:    { label: 'Commercial',    stage: 'consideration', contentType: 'Reviews / Comparison', contentIcon: 'ti-star'      },
  transactional: { label: 'Transactional', stage: 'decision',      contentType: 'Service / Landing', contentIcon: 'ti-calendar'    },
  navigational:  { label: 'Navigational',  stage: 'retention',     contentType: 'Brand Page', contentIcon: 'ti-home'               },
  unmatched:     { label: 'General',       stage: 'awareness',     contentType: 'General Content', contentIcon: 'ti-dots'          },
};

const JOURNEY_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
const JOURNEY_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};

// ─── Category assignment (fallback for older analyses) ────────────────────────

function matchKeywordToCategory(
  keyword: string,
  categories: Array<{ name: string; type: string }>,
  clientDomain: string,
  competitorDomains: string[],
): string | null {
  const kwLow = keyword.toLowerCase();

  for (const cat of categories) {
    if (cat.type === 'brand') {
      if (isBranded(keyword, clientDomain, competitorDomains)) return cat.name;
    }
    if (cat.type === 'location') {
      const locSigs = ['near me', 'near ', ' in ', 'location', 'clinic', 'center'];
      const hasBrand = isBranded(keyword, clientDomain, competitorDomains);
      const hasLoc   = locSigs.some(s => kwLow.includes(s));
      if (hasBrand && hasLoc) return cat.name;
    }
  }

  for (const cat of categories) {
    if (cat.type !== 'procedure') continue;
    const catWords = cat.name
      .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !['with', 'from', 'that', 'this', 'body', 'area'].includes(w));
    for (const w of catWords) {
      if (kwLow.includes(w)) return cat.name;
    }
  }
  return null;
}

// ─── Build theme clusters ─────────────────────────────────────────────────────

function buildThemeClusters(
  analysis:            any,
  claudeAssignments:   Record<string, IntentType>,
  clientDomain:        string,
  competitorDomains:   string[],
  uploadedKeywords:    any[] = [],
  clientVolMin:        number = 0,
  competitorVolMin:    number = 0,
): ThemeCluster[] {
  const semSnap  = analysis?.semrushSnapshot ?? {};
  const cb       = semSnap._categoryBreakdown ?? null;
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? []).map((c: any) => ({
      name: c.name,
      type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure',
    }));

  if (categories.length === 0) return [];

  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};

  // ── Build keyword pool via shared utility — identical filtering to Keyword Landscape ──
  const rawPool = buildKwPool({
    semrushSnapshot:  semSnap,
    uploadedKeywords,
    clientDomain,
    competitorDomains,
    clientVolMin,
    competitorVolMin,
  });

  // Map to KwItem (ThemeClusters internal type)
  const pool: KwItem[] = rawPool.map(item => ({
    keyword:      item.keyword,
    searchVolume: item.searchVolume,
    position:     item.position,
    isGap:        item.isGap,
    competitor:   item.competitor,
  }));

  const catMap = new Map<string, KwItem[]>();
  categories.forEach(c => catMap.set(c.name, []));
  const unassigned: KwItem[] = [];

  for (const kw of pool) {
    const key = kw.keyword.toLowerCase();
    const storedCat = storedMap[key];
    if (storedCat && catMap.has(storedCat)) { catMap.get(storedCat)!.push(kw); continue; }
    const matched = matchKeywordToCategory(kw.keyword, categories, clientDomain, competitorDomains);
    if (matched && catMap.has(matched)) { catMap.get(matched)!.push(kw); }
    else { unassigned.push(kw); }
  }

  if (unassigned.length > 0) {
    const firstProc = categories.find(c => c.type === 'procedure')?.name ?? categories[0]?.name;
    if (firstProc) catMap.get(firstProc)!.push(...unassigned);
  }

  const result: ThemeCluster[] = [];

  for (const cat of categories) {
    const kws = catMap.get(cat.name) ?? [];
    if (kws.length === 0) continue;
    const totalVolume = kws.reduce((s, k) => s + k.searchVolume, 0);

    const intentBuckets = new Map<IntentType, KwItem[]>();
    (['informational', 'commercial', 'transactional', 'navigational', 'unmatched'] as IntentType[])
      .forEach(i => intentBuckets.set(i, []));

    for (const kw of kws) {
      const key = kw.keyword.toLowerCase();
      if (isBranded(kw.keyword, clientDomain, competitorDomains) && cat.type === 'brand') {
        intentBuckets.get('navigational')!.push(kw); continue;
      }
      let intent = detectIntentSignal(kw.keyword);
      if (!intent && claudeAssignments[key]) intent = claudeAssignments[key];
      intentBuckets.get(intent ?? 'unmatched')!.push(kw);
    }

    const subClusters: IntentCluster[] = [];
    Array.from(intentBuckets.entries()).forEach(([intent, items]: [IntentType, KwItem[]]) => {
      if (items.length === 0) return;
      const meta = INTENT_META[intent];
      subClusters.push({
        intent, stage: meta.stage, contentType: meta.contentType, contentIcon: meta.contentIcon,
        keywords:         items,
        totalVolume:      items.reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        clientVolume:     items.filter((k: KwItem) => k.position !== null && k.position <= 10).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        competitorVolume: items.filter((k: KwItem) => k.isGap).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
      });
    });

    result.push({ id: cat.name, name: cat.name, type: cat.type, keywords: kws, totalVolume, subClusters });
  }

  result.sort((a, b) => {
    const order = { procedure: 0, brand: 1, location: 2 };
    const d = order[a.type] - order[b.type];
    return d !== 0 ? d : b.totalVolume - a.totalVolume;
  });
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

// ─── Cluster Card ─────────────────────────────────────────────────────────────

interface ClusterCardProps {
  cluster:      ThemeCluster;
  clientDomain: string;
}

function ClusterCard({ cluster, clientDomain }: ClusterCardProps) {
  const [expanded, setExpanded] = useState(false);

  const totalVol   = cluster.totalVolume;

  // Content coverage — % of cluster search volume the client has content for (ranked ≤ 20)
  const rankedKws      = cluster.keywords.filter(k => k.position !== null && k.position <= 20);
  const clientCovVol   = rankedKws.reduce((s, k) => s + k.searchVolume, 0);
  const clientCovPct   = pct(clientCovVol, totalVol);

  // Avg rank across ranked keywords
  const avgRank = rankedKws.length > 0
    ? Math.round(rankedKws.reduce((s, k) => s + (k.position ?? 0), 0) / rankedKws.length * 10) / 10
    : null;

  // Competitor coverage breakdown — aggregate gap keywords by competitor domain
  const compVolMap: Record<string, number> = {};
  for (const kw of cluster.keywords.filter(k => k.isGap)) {
    const dom = kw.competitor ?? 'Unknown';
    compVolMap[dom] = (compVolMap[dom] ?? 0) + kw.searchVolume;
  }

  // Sort competitors by volume descending
  const compEntries = Object.entries(compVolMap).sort((a, b) => b[1] - a[1]);
  const topComp     = compEntries[0];
  const topCompPct  = topComp ? pct(topComp[1], totalVol) : 0;

  // LEADING = client content coverage ≥ top competitor coverage
  const isLeading   = clientCovPct >= topCompPct;
  const leaderName  = isLeading
    ? (displayName(clientDomain) || 'Client')
    : (topComp ? displayName(topComp[0]) : 'Competitor');
  const leaderPct   = isLeading ? clientCovPct : topCompPct;

  // Bar segments: client first, then top 4 competitors
  const barSegments: Array<{ name: string; vol: number; color: string }> = [
    { name: displayName(clientDomain) || 'Client', vol: clientCovVol, color: COMP_COLORS[0] },
    ...compEntries.slice(0, 4).map(([dom, vol], i) => ({
      name:  displayName(dom),
      vol,
      color: COMP_COLORS[i + 1] ?? '#888',
    })),
  ];

  const cardStyle: React.CSSProperties = {
    background:   '#0F0F1E',
    border:       `1px solid ${isLeading ? '#1C2C1C' : '#2C1C1C'}`,
    borderRadius: 12,
    padding:      '16px',
    cursor:       'pointer',
    transition:   'border-color 0.15s',
  };

  return (
    <div
      style={cardStyle}
      onClick={() => setExpanded(v => !v)}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isLeading ? '#2A4A2A' : '#4A2A2A'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isLeading ? '#1C2C1C' : '#2C1C1C'; }}
    >
      {/* ── Header: name + badge ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: '#D8D8F8', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
        }}>
          {cluster.name}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.06em', flexShrink: 0,
          padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase',
          ...(isLeading
            ? { background: '#0D2010', border: '1px solid #1A4020', color: '#4ADE80' }
            : { background: '#2A0D18', border: '1px solid #4A1A28', color: '#F472B6' }),
        }}>
          {isLeading ? 'Leading' : 'Trailing'}
        </span>
      </div>

      {/* ── Sub-header stats ── */}
      <div style={{ fontSize: 10, color: '#484868', marginBottom: 14 }}>
        {cluster.keywords.length} kws &nbsp;·&nbsp; {rankedKws.length} ranked
        {avgRank !== null && <> &nbsp;·&nbsp; Avg #{avgRank}</>}
      </div>

      {/* ── Big metric: content coverage ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 42, fontWeight: 700, color: '#D8D8F8', lineHeight: 1, letterSpacing: '-1px' }}>
            {clientCovPct}%
          </span>
          <span style={{ fontSize: 11, color: '#505070', lineHeight: 1.3 }}>
            Content coverage<br />
            <span style={{ color: '#6A6A90' }}>{rankedKws.length} of {cluster.keywords.length} kws</span>
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#404060', marginTop: 6 }}>
          Leader: <strong style={{ color: isLeading ? '#4ADE80' : '#F472B6' }}>{leaderName}</strong>
          <span style={{ color: '#484868' }}> ({leaderPct}%)</span>
        </div>
      </div>

      {/* ── Rank stat ── */}
      {avgRank !== null ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '6px 10px', background: '#0A0A16', borderRadius: 6,
          border: '1px solid #1A1A2C',
        }}>
          <i className="ti ti-trending-up" style={{ fontSize: 12, color: '#6C63FF', flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: '#6A6A90' }}>Avg Google rank </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#9B96FF' }}>#{avgRank}</span>
          </div>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 600,
            ...(avgRank <= 10
              ? { background: '#0D2010', border: '1px solid #1A4020', color: '#4ADE80' }
              : { background: '#1C1408', border: '1px solid #342507', color: '#F59E0B' }),
          }}>
            {avgRank <= 3 ? 'Top 3' : avgRank <= 10 ? 'Page 1' : avgRank <= 20 ? 'Page 2' : 'Page 3+'}
          </span>
        </div>
      ) : (
        <div style={{
          fontSize: 10, color: '#383858', marginBottom: 12,
          padding: '6px 10px', background: '#0A0A14', borderRadius: 6,
          border: '1px solid #141428',
        }}>
          <i className="ti ti-ban" style={{ fontSize: 11, marginRight: 5 }} aria-hidden="true" />
          Not ranking for any keywords in this cluster
        </div>
      )}

      {/* ── Segmented bar ── */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#1A1A30', marginBottom: 8 }}>
        {barSegments.map(seg => {
          const segPct = pct(seg.vol, totalVol);
          if (segPct === 0) return null;
          return (
            <div
              key={seg.name}
              style={{ width: `${segPct}%`, background: seg.color, transition: 'width 0.3s' }}
              title={`${seg.name}: ${segPct}%`}
            />
          );
        })}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {barSegments.filter(s => pct(s.vol, totalVol) > 0).map(seg => (
          <div key={seg.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#484868' }}>
              {seg.name} <span style={{ color: '#6A6A90' }}>{pct(seg.vol, totalVol)}%</span>
            </span>
          </div>
        ))}
      </div>

      {/* ── Expanded keyword list ── */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid #1A1A2C', paddingTop: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#2E2E50', marginBottom: 6 }}>
            Keywords
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {/* v7.104: cap chips — clusters can hold thousands of keywords on large uploaded footprints */}
            {cluster.keywords.slice(0, 300).map(kw => (
              <span key={kw.keyword} style={{
                fontSize: 9,
                background: kw.isGap ? '#1A1008' : '#0F0F22',
                border: `1px solid ${kw.isGap ? '#3A2508' : '#1E1E38'}`,
                borderRadius: 4, padding: '2px 7px',
                color: kw.isGap ? '#C99C4A' : '#555570',
              }}>
                {kw.keyword}
                {kw.position !== null && (
                  <span style={{ color: '#22C55E', marginLeft: 4 }}>#{kw.position}</span>
                )}
              </span>
            ))}
          {cluster.keywords.length > 300 && (
              <span style={{ fontSize: 9, color: '#444468', padding: '2px 7px' }}>
                +{(cluster.keywords.length - 300).toLocaleString()} more — use the Keyword Landscape panel to browse all
              </span>
            )}
            </div>
        </div>
      )}
    </div>
  );
}

// ─── Clusters Tab ─────────────────────────────────────────────────────────────

type ClusterFilter = 'all' | 'leading' | 'trailing' | 'opportunity';

interface ClusterStat {
  cluster:     ThemeCluster;
  isLeading:   boolean;
  compGapPct:  number; // fraction of cluster total vol owned by gap keywords
}

function ClustersTab({
  clusters,
  clientDomain,
  loadingClaude,
}: {
  clusters:      ThemeCluster[];
  clientDomain:  string;
  loadingClaude: boolean;
}) {
  const [filter, setFilter] = useState<ClusterFilter>('all');

  // ── Per-cluster classification ─────────────────────────────────────────────
  const clusterStats: ClusterStat[] = clusters.map(c => {
    const rankedVol = c.keywords
      .filter(k => k.position !== null && k.position <= 20)
      .reduce((s, k) => s + k.searchVolume, 0);

    const compVolByDom: Record<string, number> = {};
    for (const kw of c.keywords.filter(k => k.isGap)) {
      const d = kw.competitor ?? 'Unknown';
      compVolByDom[d] = (compVolByDom[d] ?? 0) + kw.searchVolume;
    }
    const compVals = Object.values(compVolByDom);
    const topComp  = compVals.length > 0 ? Math.max(...compVals) : 0;
    const gapVol   = c.keywords.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0);
    const compGapPct = c.totalVolume > 0 ? gapVol / c.totalVolume : 0;

    return { cluster: c, isLeading: rankedVol >= topComp, compGapPct };
  });

  const leadingStats  = clusterStats.filter(s =>  s.isLeading);
  const trailingStats = clusterStats.filter(s => !s.isLeading);
  // Opportunity = competitor gap vol < 25% of cluster total AND client not already leading
  // (fully-won clusters score compGapPct=0 which would falsely pass < 0.25)
  const oppStats      = clusterStats.filter(s => s.compGapPct < 0.25 && !s.isLeading);

  // Annualise monthly volume × 12
  const ann = (stats: ClusterStat[]) =>
    stats.reduce((s, cs) => s + cs.cluster.totalVolume, 0) * 12;

  const totalAnnualVol  = clusterStats.reduce((s, cs) => s + cs.cluster.totalVolume, 0) * 12;
  const totalMonthlyVol = totalAnnualVol / 12;

  function fmtHero(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  }

  // Filtered grid clusters
  const filtered: ThemeCluster[] =
    filter === 'leading'     ? leadingStats.map(s  => s.cluster) :
    filter === 'trailing'    ? trailingStats.map(s => s.cluster) :
    filter === 'opportunity' ? oppStats.map(s      => s.cluster) :
    clusters;

  // ── Summary card definitions ───────────────────────────────────────────────
  const SUMMARY_CARDS: Array<{
    key:      Exclude<ClusterFilter, 'all'>;
    label:    string;
    count:    number;
    vol:      number;
    subtitle: string;
    accent:   string;
    activeBg: string;
    activeBdr:string;
    dimBg:    string;
    dimBdr:   string;
    icon:     string;
  }> = [
    {
      key:      'leading',
      label:    'Leading',
      count:    leadingStats.length,
      vol:      ann(leadingStats),
      subtitle: 'Clusters you are winning',
      accent:   '#4ADE80',
      activeBg: 'rgba(74,222,128,0.10)',
      activeBdr:'rgba(74,222,128,0.45)',
      dimBg:    'rgba(74,222,128,0.04)',
      dimBdr:   'rgba(74,222,128,0.15)',
      icon:     'ti-trophy',
    },
    {
      key:      'trailing',
      label:    'Trailing',
      count:    trailingStats.length,
      vol:      ann(trailingStats),
      subtitle: 'Clusters competitors lead',
      accent:   '#F472B6',
      activeBg: 'rgba(244,114,182,0.10)',
      activeBdr:'rgba(244,114,182,0.45)',
      dimBg:    'rgba(244,114,182,0.04)',
      dimBdr:   'rgba(244,114,182,0.15)',
      icon:     'ti-trending-down',
    },
    {
      key:      'opportunity',
      label:    'Low Competition',
      count:    oppStats.length,
      vol:      ann(oppStats),
      subtitle: 'Competitors least present',
      accent:   '#38BDF8',
      activeBg: 'rgba(56,189,248,0.10)',
      activeBdr:'rgba(56,189,248,0.45)',
      dimBg:    'rgba(56,189,248,0.04)',
      dimBdr:   'rgba(56,189,248,0.15)',
      icon:     'ti-target',
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

      {/* ── Top cards: total hero (left) + group cards stacked (right) ────── */}
      {/* v7.135: 2-col layout — clickable total hero filters to 'all'; the */}
      {/* three group cards stack on the right, each filtering its grouping.  */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)', gap: 12, marginBottom: 14 }}>

        {/* Left: Total clusters + search volumes (clickable → all) */}
        {(() => {
          const allActive = filter === 'all';
          return (
            <button
              onClick={() => setFilter('all')}
              style={{
                display: 'flex', alignItems: 'center', gap: 28,
                padding: '20px 24px',
                background:   allActive ? 'rgba(155,150,255,0.10)' : 'rgba(155,150,255,0.04)',
                border:       `1px solid ${allActive ? 'rgba(155,150,255,0.45)' : 'rgba(155,150,255,0.18)'}`,
                borderRadius: 12,
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'all 0.15s',
                outline:      'none',
                boxShadow:    allActive ? '0 0 0 1px rgba(155,150,255,0.45)' : 'none',
              }}
              onMouseEnter={e => { if (!allActive) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(155,150,255,0.40)'; }}
              onMouseLeave={e => { if (!allActive) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(155,150,255,0.18)'; }}
            >
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#585878', marginBottom: 4 }}>
                  Total clusters
                </div>
                <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1, letterSpacing: -3, color: '#E8E8FF' }}>
                  {clusters.length}
                </div>
                <div style={{ fontSize: 11, color: '#484868', marginTop: 4 }}>categories identified</div>
              </div>
              <div style={{ width: 1, height: 64, background: '#1E1E34', flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#585878', marginBottom: 3 }}>
                    Total annual search volume
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: -1, color: '#9B96FF' }}>
                      {fmtHero(totalAnnualVol)}
                    </span>
                    <span style={{ fontSize: 11, color: '#484868' }}>searches / yr</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#585878', marginBottom: 3 }}>
                    Total monthly volume
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 19, fontWeight: 600, lineHeight: 1, letterSpacing: -.5, color: '#6A6A90' }}>
                      {fmtHero(totalMonthlyVol)}
                    </span>
                    <span style={{ fontSize: 11, color: '#383858' }}>searches / mo</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })()}

        {/* Right: Leading / Trailing / Low Competition stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SUMMARY_CARDS.map(card => {
            const active = filter === card.key;
            return (
              <button
                key={card.key}
                onClick={() => setFilter(f => (f === card.key ? 'all' : card.key))}
                style={{
                  flex:         1,
                  background:   active ? card.activeBg : card.dimBg,
                  border:       `1px solid ${active ? card.activeBdr : card.dimBdr}`,
                  borderRadius: 10,
                  padding:      '11px 16px',
                  cursor:       'pointer',
                  textAlign:    'left',
                  transition:   'all 0.15s',
                  outline:      'none',
                  boxShadow:    active ? `0 0 0 1px ${card.activeBdr}` : 'none',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          16,
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = card.activeBdr;
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = card.dimBdr;
                }}
              >
                {/* Label + subtitle (left) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <i className={`ti ${card.icon}`} style={{ fontSize: 13, color: card.accent }} aria-hidden="true" />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: card.accent }}>
                      {card.label}
                    </span>
                    {active && (
                      <span style={{
                        marginLeft: 6, fontSize: 8, fontWeight: 700,
                        background: card.activeBg, border: `1px solid ${card.activeBdr}`,
                        color: card.accent, borderRadius: 20, padding: '2px 7px',
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#7070A0' }}>
                    {card.subtitle}
                  </div>
                </div>

                {/* Count + annual vol (right) */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end' }}>
                    <span style={{
                      fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-1.5px',
                      color: active ? card.accent : '#E8E8FF',
                    }}>
                      {card.count}
                    </span>
                    <span style={{ fontSize: 12, color: '#9090B8' }}>clusters</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: card.accent, marginTop: 3 }}>
                    {fmtVol(card.vol)}
                    <span style={{ fontSize: 11, color: '#8080A8', fontWeight: 400, marginLeft: 4 }}>annual vol</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: '#181828', marginBottom: 14 }} />

      {/* ── Status / filter bar ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            style={{
              fontSize: 10, color: '#6C63FF', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 10 }} aria-hidden="true" />
            Clear filter
          </button>
        )}
        <span style={{ fontSize: 10, color: '#484868' }}>
          {filter === 'all'
            ? `${clusters.length} clusters`
            : `Showing ${filtered.length} of ${clusters.length} clusters`}
        </span>
        {loadingClaude && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#6C63FF' }}>
            <svg style={{ width: 11, height: 11, animation: 'spin 1s linear infinite', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refining intent classification…
          </div>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#2E2E50' }}>Click any card to expand keywords</span>
      </div>

      {/* ── 4-column cluster grid ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {filtered.map(cluster => (
          <ClusterCard key={cluster.id} cluster={cluster} clientDomain={clientDomain} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#404060', fontSize: 13 }}>
          {filter === 'opportunity' && clusters.length > 0
            ? 'No clusters with competitor coverage below 25% — competition is active across all clusters.'
            : 'No cluster data — run an analysis first.'}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ThemeClustersPanel({
  projectId, kwVersion, analysis, competitors,
  defaultClientThreshold = 0, defaultCompetitorThreshold = 0,
}: Props) {
  const semSnap       = useMemo(() => analysis?.semrushSnapshot ?? {}, [analysis]);
  const clientDomain  = useMemo(() => (semSnap.domain as string) ?? '', [semSnap]);
  const industry      = (analysis as any)?._industry ?? 'General';
  const analysisId    = analysis?.id ?? 'unknown';

  const [loadingClaude, setLoadingClaude] = useState(false);
  const [claudeAssigns,    setClaudeAssigns]    = useState<Record<string, IntentType>>({});
  // null = not yet fetched from DB (prevents stale count flash before blocked keywords are applied)
  const [uploadedKeywords,  setUploadedKeywords]  = useState<any[] | null>(null);
  const [refreshingKws,     setRefreshingKws]     = useState(false);

  // True once the first keywords fetch has resolved (even if empty)
  const kwLoaded = uploadedKeywords !== null;

  const baseClusters = useMemo(
    () => buildThemeClusters(
      analysis, claudeAssigns, clientDomain, competitors, uploadedKeywords ?? [],
      defaultClientThreshold, defaultCompetitorThreshold,
    ),
    [analysis, claudeAssigns, clientDomain, competitors, uploadedKeywords, defaultClientThreshold, defaultCompetitorThreshold],
  );

  const runClaudePass = useCallback(async () => {
    const cacheKey = `orbitiq-cluster-assigns-${analysisId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setClaudeAssigns(JSON.parse(cached)); return; }
    } catch { /* unavailable */ }

    const pool: string[] = [];
    const seen = new Set<string>();
    for (const kw of (semSnap.topKeywords ?? [])) {
      const k = kw.keyword?.toLowerCase();
      if (k && !seen.has(k) && !detectIntentSignal(kw.keyword)) { pool.push(kw.keyword); seen.add(k); }
    }
    for (const kw of (semSnap.gapKeywords ?? [])) {
      const k = kw.keyword?.toLowerCase();
      if (k && !seen.has(k) && !detectIntentSignal(kw.keyword)) { pool.push(kw.keyword); seen.add(k); }
    }
    if (pool.length === 0) return;

    setLoadingClaude(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/clusters`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: pool, industry, domain: clientDomain }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const assigns: Record<string, IntentType> = data.assignments ?? {};
      setClaudeAssigns(assigns);
      try { localStorage.setItem(cacheKey, JSON.stringify(assigns)); } catch { /* silent */ }
    } catch { /* silent */ } finally { setLoadingClaude(false); }
  }, [analysisId, projectId, industry, clientDomain, semSnap]);

  useEffect(() => { runClaudePass(); }, [runClaudePass]);

  // Fetch uploaded/CSV keywords from DB (merged into clusters with no cap)
  const refreshUploadedKeywords = useCallback(async (showSpinner = false) => {
    if (!projectId) return;
    if (showSpinner) setRefreshingKws(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/keywords`);
      const d   = res.ok ? await res.json() : { keywords: [] };
      setUploadedKeywords(d.keywords ?? []);
    } catch {
      // On error: unblock UI with empty list (avoids infinite "Loading clusters…" state)
      setUploadedKeywords(prev => prev ?? []);
    } finally {
      if (showSpinner) setRefreshingKws(false);
    }
  }, [projectId, kwVersion]);   // v7.107: kwVersion bump → refetch uploaded keywords

  useEffect(() => { refreshUploadedKeywords(); }, [refreshUploadedKeywords]);

  const totalKws   = baseClusters.reduce((s, c) => s + c.keywords.length, 0);
  const clusterCnt = baseClusters.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: '1px solid #1C1C30', background: '#0D0D18', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#D8D8F8', margin: 0 }}>Theme Clusters</h2>
          <p style={{ fontSize: 11, color: '#404060', margin: '2px 0 0' }}>
            {kwLoaded
              ? `${totalKws} keywords grouped by category · ${clusterCnt} clusters · click any card to see keywords`
              : 'Loading clusters…'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 10, color: '#383858', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span><span style={{ color: '#4ADE80' }}>■</span> Client ranked</span>
            <span><span style={{ color: '#F59E0B' }}>■</span> Competitor gap</span>
          </div>
          <button
            onClick={() => refreshUploadedKeywords(true)}
            disabled={refreshingKws}
            title="Refresh clusters with latest uploaded keywords"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              background: refreshingKws ? 'rgba(108,99,255,0.15)' : 'rgba(108,99,255,0.08)',
              border: '1px solid rgba(108,99,255,0.3)', color: '#8B85FF',
              cursor: refreshingKws ? 'default' : 'pointer', transition: 'all 0.15s',
            }}
          >
            {refreshingKws ? (
              <svg className="animate-spin" style={{ width: 11, height: 11, flexShrink: 0 }} fill='none' viewBox='0 0 24 24'>
                <circle style={{ opacity: 0.25 }} cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'/>
                <path style={{ opacity: 0.85 }} fill='currentColor' d='M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z'/>
              </svg>
            ) : (
              <svg style={{ width: 11, height: 11, flexShrink: 0 }} fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
              </svg>
            )}
            {refreshingKws ? 'Refreshing…' : 'Refresh Clusters'}
          </button>
        </div>
      </div>

      {(refreshingKws || !kwLoaded) && (
        <div className="animate-pulse" style={{ height: 3, background: 'rgba(108,99,255,0.35)', flexShrink: 0 }} />
      )}

      {!kwLoaded ? (
        /* ── Skeleton: shown until DB keyword fetch resolves ── */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#404060', fontSize: 13 }}>
            <svg style={{ width: 18, height: 18, animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }}
              fill="none" viewBox="0 0 24 24" stroke="rgba(108,99,255,0.6)">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Building clusters…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <ClustersTab clusters={baseClusters} clientDomain={clientDomain} loadingClaude={loadingClaude} />
      )}
    </div>
  );
}
