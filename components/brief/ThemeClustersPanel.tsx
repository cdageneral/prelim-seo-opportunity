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
  origin?:      'footprint' | 'demand';  // v7.162: provenance (demand = deep-journey "missing demand")
  demandSeeds?: string[];        // v7.162: seed(s) that surfaced a demand keyword
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
  type:        'procedure' | 'brand' | 'location' | 'demand';  // v7.162: 'demand' = missing-demand cluster
  keywords:    KwItem[];
  totalVolume: number;
  subClusters: IntentCluster[];
  // v7.168: when a footprint cluster ABSORBS same-intent deep-journey demand
  // (merge case), record how much so the card can flag it. Demand surfaced at a
  // NOT-yet-covered intent becomes its own modifier-titled 'demand' cluster instead.
  demandMergedCount?: number;
  demandMergedVol?:   number;
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
  // v7.162: includeDemand unions the deep-journey demand universe into the pool
  // as origin:'demand' ("missing demand"). When no deep journey has been built
  // (`_demandUniverse` absent) this returns the identical footprint pool, so this
  // panel is byte-for-byte unchanged for existing analyses.
  const rawPool = buildKwPool({
    semrushSnapshot:  semSnap,
    uploadedKeywords,
    clientDomain,
    competitorDomains,
    clientVolMin,
    competitorVolMin,
    includeDemand:    true,
  });

  // Map to KwItem (ThemeClusters internal type), carrying provenance.
  const pool: KwItem[] = rawPool.map(item => ({
    keyword:      item.keyword,
    searchVolume: item.searchVolume,
    position:     item.position,
    isGap:        item.isGap,
    competitor:   item.competitor,
    origin:       item.origin,
    demandSeeds:  item.demandSeeds,
  }));

  // The RANKING footprint flows through the existing category logic UNCHANGED.
  // The deep-journey demand keywords are peeled off and grouped into their own
  // "missing demand" clusters (by seed) below — they never inflate or alter the
  // footprint cluster numbers.
  const footprintPool = pool.filter(k => k.origin !== 'demand');
  const demandPool    = pool.filter(k => k.origin === 'demand');

  const catMap = new Map<string, KwItem[]>();
  categories.forEach(c => catMap.set(c.name, []));
  const unassigned: KwItem[] = [];

  for (const kw of footprintPool) {
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

  // ── v7.168: Surface every deep-journey demand theme as a cluster ────────────
  // Wayne's rule (deep journey feeds back into the cluster data):
  //   • A demand keyword whose THEME matches an existing footprint cluster and
  //     whose SEARCH INTENT the footprint already covers → MERGE into that
  //     cluster's matching sub-cluster (same lens at that stage; no duplicate row).
  //   • A demand keyword matching a footprint cluster but at an intent the
  //     footprint does NOT cover → surface as its OWN cluster with an intent
  //     MODIFIER in the title ("{Category} — {Intent}") so the unmet-intent
  //     demand is visible and distinct.
  //   • A demand keyword matching NO footprint category → seed-grouped
  //     "missing demand" cluster (the v7.162 behaviour).
  // Merged demand keeps origin:'demand' so the ownership math in ClustersTab never
  // counts it as client rank or competitor gap — demand stays a third lens, it
  // only adds to overall MARKET DEMAND (totalVolume).
  if (demandPool.length > 0) {
    const clusterByName = new Map<string, ThemeCluster>();
    const intentsByName = new Map<string, Set<IntentType>>();
    for (const c of result) {
      clusterByName.set(c.name.toLowerCase(), c);
      intentsByName.set(c.name.toLowerCase(), new Set(c.subClusters.map(s => s.intent)));
    }

    const kwIntent = (kw: KwItem): IntentType => {
      const key = kw.keyword.toLowerCase();
      let intent = detectIntentSignal(kw.keyword);
      if (!intent && claudeAssignments[key]) intent = claudeAssignments[key];
      return intent ?? 'unmatched';
    };

    // New demand clusters (modifier + seed cases) accumulated by display name.
    const demandGroups = new Map<string, { name: string; keywords: KwItem[] }>();
    const pushDemand = (name: string, kw: KwItem) => {
      const k = name.toLowerCase();
      if (!demandGroups.has(k)) demandGroups.set(k, { name, keywords: [] });
      demandGroups.get(k)!.keywords.push(kw);
    };

    const mergedInto = new Set<ThemeCluster>();   // footprint clusters that absorbed demand

    for (const kw of demandPool) {
      const intent  = kwIntent(kw);
      const matched = matchKeywordToCategory(kw.keyword, categories, clientDomain, competitorDomains);
      const fp      = matched ? clusterByName.get(matched.toLowerCase()) : undefined;

      if (fp && matched) {
        const covered = intentsByName.get(matched.toLowerCase())!;
        if (covered.has(intent)) {
          // SAME INTENT → merge into the footprint cluster's matching sub-cluster.
          const sc = fp.subClusters.find(s => s.intent === intent);
          if (sc) sc.keywords.push(kw);
          fp.keywords.push(kw);
          mergedInto.add(fp);
        } else {
          // DIFFERENT INTENT → surface with an intent modifier in the title.
          pushDemand(`${matched} — ${INTENT_META[intent].label}`, kw);
        }
      } else {
        // No footprint theme match → seed-grouped missing-demand cluster.
        const seed  = (kw.demandSeeds && kw.demandSeeds[0]) ? kw.demandSeeds[0] : 'General demand';
        const label = seed.replace(/\b\w/g, c => c.toUpperCase());
        pushDemand(label, kw);
      }
    }

    // Recompute volumes on footprint clusters that absorbed demand + flag counts.
    for (const c of Array.from(mergedInto)) {
      c.totalVolume = c.keywords.reduce((s, k) => s + k.searchVolume, 0);
      for (const sc of c.subClusters) {
        sc.totalVolume = sc.keywords.reduce((s, k) => s + k.searchVolume, 0);
      }
      const dk = c.keywords.filter(k => k.origin === 'demand');
      c.demandMergedCount = dk.length;
      c.demandMergedVol   = dk.reduce((s, k) => s + k.searchVolume, 0);
    }

    // Materialise the new demand clusters (modifier + seed) as type 'demand'.
    for (const g of Array.from(demandGroups.values())) {
      const kws = g.keywords;
      const totalVolume = kws.reduce((s, k) => s + k.searchVolume, 0);
      const intentBuckets = new Map<IntentType, KwItem[]>();
      (['informational', 'commercial', 'transactional', 'navigational', 'unmatched'] as IntentType[])
        .forEach(i => intentBuckets.set(i, []));
      for (const kw of kws) intentBuckets.get(kwIntent(kw))!.push(kw);
      const subClusters: IntentCluster[] = [];
      Array.from(intentBuckets.entries()).forEach(([intent, items]: [IntentType, KwItem[]]) => {
        if (items.length === 0) return;
        const meta = INTENT_META[intent];
        subClusters.push({
          intent, stage: meta.stage, contentType: meta.contentType, contentIcon: meta.contentIcon,
          keywords:         items,
          totalVolume:      items.reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
          clientVolume:     0,   // demand = not yet ranked / not yet owned
          competitorVolume: 0,   // demand ≠ competitor gap (different lens)
        });
      });
      result.push({ id: `demand:${g.name}`, name: g.name, type: 'demand', keywords: kws, totalVolume, subClusters });
    }
  }

  result.sort((a, b) => {
    const order = { procedure: 0, brand: 1, location: 2, demand: 3 };
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

  // v7.162: missing-demand cluster (deep-journey) — a different lens. It is not
  // "leading" or "trailing" (no rank data); render it as demand the client does
  // not yet own rather than mislabelling it as a won/lost ranking cluster.
  const isDemand   = cluster.type === 'demand';

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
    border:       `1px solid ${isDemand ? '#0E3038' : isLeading ? '#1C2C1C' : '#2C1C1C'}`,
    borderRadius: 12,
    padding:      '16px',
    cursor:       'pointer',
    transition:   'border-color 0.15s',
  };

  return (
    <div
      style={cardStyle}
      onClick={() => setExpanded(v => !v)}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isDemand ? '#155E6B' : isLeading ? '#2A4A2A' : '#4A2A2A'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isDemand ? '#0E3038' : isLeading ? '#1C2C1C' : '#2C1C1C'; }}
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
          ...(isDemand
            ? { background: '#062A32', border: '1px solid #0E4753', color: '#22D3EE' }
            : isLeading
            ? { background: '#0D2010', border: '1px solid #1A4020', color: '#4ADE80' }
            : { background: '#2A0D18', border: '1px solid #4A1A28', color: '#F472B6' }),
        }}>
          {isDemand ? 'Missing demand' : isLeading ? 'Leading' : 'Trailing'}
        </span>
      </div>

      {/* ── Sub-header stats ── */}
      <div style={{ fontSize: 10, color: '#484868', marginBottom: 14 }}>
        {cluster.keywords.length} kws &nbsp;·&nbsp; {rankedKws.length} ranked
        {avgRank !== null && <> &nbsp;·&nbsp; Avg #{avgRank}</>}
      </div>

      {/* ── v7.168: same-intent deep-journey demand merged into this cluster ── */}
      {!isDemand && (cluster.demandMergedCount ?? 0) > 0 && (
        <div style={{ fontSize: 10, color: '#22D3EE', marginTop: -8, marginBottom: 14 }}>
          + {cluster.demandMergedCount} deep-journey demand kw{(cluster.demandMergedCount ?? 0) === 1 ? '' : 's'}
          &nbsp;·&nbsp; {fmtVol(cluster.demandMergedVol ?? 0)}/mo
        </div>
      )}

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
          {isDemand ? (
            <>Deep-journey demand · <strong style={{ color: '#22D3EE' }}>not yet owned</strong></>
          ) : (
            <>Leader: <strong style={{ color: isLeading ? '#4ADE80' : '#F472B6' }}>{leaderName}</strong>
            <span style={{ color: '#484868' }}> ({leaderPct}%)</span></>
          )}
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

type ClusterFilter =
  | 'all' | 'leading' | 'trailing' | 'opportunity'
  | 'client' | 'competitor'   // v7.146: filter by cluster ownership (majority keyword)
  | 'demand'   // v7.162: filter to missing-demand (deep-journey) clusters
  | JourneyStage;  // v7.145: filter the grid by dominant funnel stage

interface ClusterStat {
  cluster:     ThemeCluster;
  isLeading:   boolean;
  compGapPct:  number; // fraction of cluster total vol owned by gap keywords
  stage:       JourneyStage; // v7.145: cluster's dominant funnel stage (most keywords)
  isClientFootprint: boolean; // v7.145: client ranks for ≥ half the cluster's keywords
  isDemand:    boolean; // v7.162: missing-demand cluster (deep-journey) — neither client nor competitor gap
}

// ─── Funnel-stage display metadata (v7.145) ───────────────────────────────────
const STAGE_META: Record<JourneyStage, { label: string; icon: string }> = {
  awareness:     { label: 'Awareness',     icon: 'ti-eye'    },
  consideration: { label: 'Consideration', icon: 'ti-scale'  },
  decision:      { label: 'Decision',      icon: 'ti-target' },
  retention:     { label: 'Retention',     icon: 'ti-refresh' },
};

/**
 * v7.145: assign a cluster to exactly ONE funnel stage = the stage holding the
 * most of its keywords (keywords → intent → INTENT_META.stage). Ties resolve to
 * the earliest stage in JOURNEY_ORDER for determinism. Each cluster is counted
 * once, so the four stage buckets sum to the total cluster count.
 */
function dominantStage(c: ThemeCluster): JourneyStage {
  const counts: Record<JourneyStage, number> = {
    awareness: 0, consideration: 0, decision: 0, retention: 0,
  };
  for (const sc of c.subClusters) counts[sc.stage] += sc.keywords.length;
  let best: JourneyStage = 'awareness';
  let bestN = -1;
  for (const st of JOURNEY_ORDER) {       // earliest stage wins on a tie
    if (counts[st] > bestN) { bestN = counts[st]; best = st; }
  }
  return best;
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

    // v7.145: dominant funnel stage + client-footprint vs competitor-gap ownership.
    // Ownership is decided by majority keyword count (each keyword is cleanly
    // client-ranked [!isGap] or a competitor gap [isGap]); a tie counts as client.
    // v7.168: merged deep-journey demand (origin:'demand') is a THIRD lens — it
    // must not count as client rank or competitor gap when classifying a
    // footprint cluster's ownership. Exclude it from both sides.
    const footprintKws  = c.keywords.filter(k => k.origin !== 'demand');
    const clientKwCount = footprintKws.filter(k => !k.isGap).length;
    const gapKwCount    = footprintKws.filter(k =>  k.isGap).length;

    // v7.162: a missing-demand cluster is a THIRD class — not client footprint,
    // not competitor gap. Exclude it from ownership/performance so it never
    // inflates the client or competitor counts.
    const isDemand = c.type === 'demand';

    return {
      cluster: c,
      isLeading: !isDemand && rankedVol >= topComp,
      compGapPct,
      stage: dominantStage(c),
      isClientFootprint: !isDemand && clientKwCount >= gapKwCount,
      isDemand,
    };
  });

  const leadingStats  = clusterStats.filter(s => !s.isDemand &&  s.isLeading);
  const trailingStats = clusterStats.filter(s => !s.isDemand && !s.isLeading);
  // Opportunity = competitor gap vol < 25% of cluster total AND client not already leading
  // (fully-won clusters score compGapPct=0 which would falsely pass < 0.25)
  const oppStats      = clusterStats.filter(s => !s.isDemand && s.compGapPct < 0.25 && !s.isLeading);

  // ── Funnel-stage roll-up (v7.145) ──────────────────────────────────────────
  // Each cluster sits in exactly one stage (its dominant intent), split into
  // client-footprint vs competitor-gap clusters. Annual vol = cluster monthly × 12.
  const stageRollups = JOURNEY_ORDER.map(stage => {
    const inStage = clusterStats.filter(s => s.stage === stage);
    return {
      stage,
      total:          inStage.length,
      clientClusters: inStage.filter(s =>  s.isClientFootprint).length,
      // v7.162: gap excludes demand; demand counted separately so the band reads
      // client · gap · demand and reflects overall market demand by stage.
      gapClusters:    inStage.filter(s => !s.isClientFootprint && !s.isDemand).length,
      demandClusters: inStage.filter(s =>  s.isDemand).length,
      annualVol:      inStage.reduce((sum, s) => sum + s.cluster.totalVolume, 0) * 12,
    };
  });
  const STAGE_KEYS = JOURNEY_ORDER as JourneyStage[];
  const isStageFilter = (f: ClusterFilter): f is JourneyStage =>
    (STAGE_KEYS as string[]).includes(f);

  // ── Ownership counts (v7.146) — client footprint vs competitor gap ──────────
  // v7.162: demand is a third class — excluded from both client and competitor.
  const clientOwnedCount = clusterStats.filter(s =>  s.isClientFootprint).length;
  const gapOwnedCount    = clusterStats.filter(s => !s.isClientFootprint && !s.isDemand).length;
  const demandOwnedCount = clusterStats.filter(s =>  s.isDemand).length;

  // ── Filter nav model (v7.146): ownership group + funnel-stage group ─────────
  const navOwnership: Array<{ key: ClusterFilter; label: string; count: number; cColor: string }> = [
    { key: 'all',        label: 'All clusters',    count: clusters.length,   cColor: '#8080A8' },
    { key: 'client',     label: 'Client only',     count: clientOwnedCount,  cColor: '#4ADE80' },
    { key: 'competitor', label: 'Competitor only', count: gapOwnedCount,     cColor: '#F59E0B' },
  ];
  // v7.162: only show the missing-demand pill once a deep journey has surfaced any.
  if (demandOwnedCount > 0) {
    navOwnership.push({ key: 'demand', label: 'Missing demand', count: demandOwnedCount, cColor: '#22D3EE' });
  }
  const navPerformance: Array<{ key: ClusterFilter; label: string; count: number; cColor: string }> = [
    { key: 'leading',     label: 'Winning',         count: leadingStats.length,  cColor: '#4ADE80' },
    { key: 'trailing',    label: 'Trailing',        count: trailingStats.length, cColor: '#F472B6' },
    { key: 'opportunity', label: 'Low Competition', count: oppStats.length,      cColor: '#38BDF8' },
  ];
  const navStages: Array<{ key: ClusterFilter; label: string; count: number; cColor: string }> =
    stageRollups.map(r => ({ key: r.stage, label: STAGE_META[r.stage].label, count: r.total, cColor: '#585878' }));

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
    filter === 'client'      ? clusterStats.filter(s =>  s.isClientFootprint).map(s => s.cluster) :
    filter === 'competitor'  ? clusterStats.filter(s => !s.isClientFootprint && !s.isDemand).map(s => s.cluster) :
    filter === 'demand'      ? clusterStats.filter(s =>  s.isDemand).map(s => s.cluster) :
    isStageFilter(filter)    ? clusterStats.filter(s => s.stage === filter).map(s => s.cluster) :
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

      {/* ── Top cards: total hero (left) · group cards (middle) · funnel (right) ── */}
      {/* v7.148: 3-col layout — clickable total hero filters to 'all'; the three  */}
      {/* group cards stack in the middle; the funnel-stage roll-up moves into the  */}
      {/* right column as a half inverted-pyramid (flat edge right) with stage info  */}
      {/* beside each band. Each band stays clickable → filter by dominant stage.    */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1.2fr)', gap: 12, marginBottom: 14, alignItems: 'stretch' }}>

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

        {/* Right: funnel-stage roll-up as a HALF inverted pyramid (v7.148). */}
        {/* Pyramid is cut vertically with the flat edge on the right so each  */}
        {/* stage's label / count / split sits beside its band. Each band is   */}
        {/* clickable → filter the grid by that dominant stage (toggle to all). */}
        <div style={{
          background: '#0F0F1E', border: '1px solid #1E1E34', borderRadius: 12,
          padding: '12px 14px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <i className="ti ti-filter" style={{ fontSize: 12, color: '#8B85FF' }} aria-hidden="true" />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#585878' }}>
              Clusters by funnel stage
            </span>
          </div>
          <div style={{ fontSize: 9, color: '#3A3A5A', marginBottom: 10, lineHeight: 1.4 }}>
            Each cluster counted once · stage = its dominant intent ·&nbsp;
            <span style={{ color: '#4ADE80' }}>client</span> ranks for most /&nbsp;
            <span style={{ color: '#F59E0B' }}>gap</span> = competitors own most · click to filter
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, justifyContent: 'center' }}>
            {stageRollups.map((r, i) => {
              const meta      = STAGE_META[r.stage];
              const active    = filter === r.stage;
              // Half-pyramid geometry: flat right edge (100%), left edge steps in
              // 18% per stage so the four bands form one continuous funnel.
              const topInset    = 18 * i;
              const botInset    = 18 * (i + 1);
              const BAND_COLORS = ['#8B85FF', '#6C63FF', '#574DD6', '#443AA8'];
              const bandColor   = active ? '#B7B1FF' : BAND_COLORS[i];
              return (
                <button
                  key={r.stage}
                  onClick={() => setFilter(f => (f === r.stage ? 'all' : r.stage))}
                  style={{
                    display:    'flex',
                    alignItems: 'stretch',
                    gap:        10,
                    width:      '100%',
                    background: active ? 'rgba(155,150,255,0.08)' : 'transparent',
                    border:     'none',
                    borderRadius: 8,
                    padding:    '3px 4px',
                    cursor:     'pointer',
                    textAlign:  'left',
                    outline:    'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(155,150,255,0.04)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  {/* Funnel band — flat edge on the right (clip-path trapezoid) */}
                  <div style={{
                    width:      86,
                    flexShrink: 0,
                    minHeight:  30,
                    alignSelf:  'stretch',
                    background: bandColor,
                    clipPath:   `polygon(${topInset}% 0, 100% 0, 100% 100%, ${botInset}% 100%)`,
                    transition: 'background 0.15s',
                  }} />

                  {/* Stage info — sits beside the pyramid's flat edge */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.03em', color: active ? '#C8C4FF' : '#C8C8E8' }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.5px', color: active ? '#9B96FF' : '#E8E8FF' }}>
                        {r.total}
                      </span>
                      <span style={{ fontSize: 9, color: '#585878' }}>clusters</span>
                      {active && (
                        <span style={{
                          marginLeft: 'auto', fontSize: 8, fontWeight: 700,
                          background: 'rgba(155,150,255,0.10)', border: '1px solid rgba(155,150,255,0.45)',
                          color: '#9B96FF', borderRadius: 20, padding: '1px 6px',
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: '#6A6A90', marginTop: 2 }}>
                      <span style={{ color: '#4ADE80', fontWeight: 600 }}>{r.clientClusters}</span> client
                      &nbsp;·&nbsp;
                      <span style={{ color: '#F59E0B', fontWeight: 600 }}>{r.gapClusters}</span> gap
                      {r.demandClusters > 0 && (
                        <>
                          &nbsp;·&nbsp;
                          <span style={{ color: '#22D3EE', fontWeight: 600 }}>{r.demandClusters}</span> demand
                        </>
                      )}
                      &nbsp;·&nbsp;
                      <span style={{ color: '#8B85FF', fontWeight: 600 }}>{fmtVol(r.annualVol)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Filter nav (v7.146) — sits between the summary cards and the grid, */}
      {/* doubling as the section separator. Two groups: ownership · funnel     */}
      {/* stage. Shares filter state with the summary + funnel-stage cards.     */}
      {(() => {
        const Pill = ({ item }: { item: { key: ClusterFilter; label: string; count: number; cColor: string } }) => {
          const on = filter === item.key;
          return (
            <button
              onClick={() => setFilter(f => (f === item.key && item.key !== 'all' ? 'all' : item.key))}
              style={{
                fontSize: 12, fontWeight: 600, lineHeight: 1,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
                transition: 'all 0.15s', outline: 'none', whiteSpace: 'nowrap',
                background: on ? '#6C63FF' : '#13131F',
                border:     `1px solid ${on ? '#6C63FF' : '#23233A'}`,
                color:      on ? '#0A0A14' : '#9090B8',
              }}
              onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.borderColor = '#34345A'; }}
              onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.borderColor = '#23233A'; }}
            >
              {item.label}
              <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'rgba(10,10,20,0.65)' : item.cColor }}>
                {item.count}
              </span>
            </button>
          );
        };
        const GlowLine = () => (
          <div style={{
            height: 1,
            background: 'linear-gradient(to right, rgba(108,99,255,0) 0%, rgba(108,99,255,0.55) 50%, rgba(108,99,255,0) 100%)',
            boxShadow: '0 0 6px rgba(108,99,255,0.45)',
          }} />
        );
        const GroupDivider = () => (
          <span style={{ width: 1, height: 18, background: '#23233A', margin: '0 4px' }} />
        );
        return (
          <div style={{ margin: '22px 0 20px' }}>
            <GlowLine />
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px 6px', flexWrap: 'wrap',
              padding: '16px 14px',
            }}>
              {navOwnership.map(item => <Pill key={item.key} item={item} />)}
              <GroupDivider />
              {navPerformance.map(item => <Pill key={item.key} item={item} />)}
              <GroupDivider />
              {navStages.map(item => <Pill key={item.key} item={item} />)}
              {loadingClaude && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#6C63FF', marginLeft: 6 }}>
                  <svg style={{ width: 11, height: 11, animation: 'spin 1s linear infinite', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refining…
                </div>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3A3A5A', whiteSpace: 'nowrap' }}>
                {filter === 'all'
                  ? `${clusters.length} clusters · click a card to expand`
                  : `Showing ${filtered.length} of ${clusters.length}`}
              </span>
            </div>
            <GlowLine />
          </div>
        );
      })()}

      {/* ── 4-column cluster grid ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {filtered.map(cluster => (
          <ClusterCard key={cluster.id} cluster={cluster} clientDomain={clientDomain} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#404060', fontSize: 13 }}>
          {clusters.length === 0
            ? 'No cluster data — run an analysis first.'
            : filter === 'opportunity'
            ? 'No clusters with competitor coverage below 25% — competition is active across all clusters.'
            : 'No clusters match this filter.'}
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
