'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type IntentType    = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage  = 'awareness' | 'consideration' | 'decision' | 'retention';
type ClusterTab    = 'clusters' | 'contentMap';

interface IntentCluster {
  intent:             IntentType;
  stage:              JourneyStage;
  contentType:        string;
  contentIcon:        string;
  keywords:           KwItem[];
  totalVolume:        number;
  clientVolume:       number;   // ranked ≤ 10
  competitorVolume:   number;   // gap keywords
}

interface ThemeCluster {
  id:           string;
  name:         string;
  type:         'procedure' | 'brand' | 'location';
  keywords:     KwItem[];
  totalVolume:  number;
  subClusters:  IntentCluster[];
}

interface KwItem {
  keyword:      string;
  searchVolume: number;
  position:     number | null;   // null = client not ranking
  isGap:        boolean;         // competitor ranks, client doesn't
}

interface Props {
  projectId:   string;
  analysis:    any;
  competitors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTENT_META: Record<IntentType, {
  label:       string;
  stage:       JourneyStage;
  contentType: string;
  contentIcon: string;
  badgeClass:  string;
  stageClass:  string;
  stageLabel:  string;
}> = {
  informational: {
    label:       'Informational',
    stage:       'awareness',
    contentType: 'Blog / Educational',
    contentIcon: 'ti-file-text',
    badgeClass:  'badge-info',
    stageClass:  'stage-awareness',
    stageLabel:  'Awareness',
  },
  commercial: {
    label:       'Commercial',
    stage:       'consideration',
    contentType: 'Reviews / Comparison',
    contentIcon: 'ti-star',
    badgeClass:  'badge-commercial',
    stageClass:  'stage-consideration',
    stageLabel:  'Consideration',
  },
  transactional: {
    label:       'Transactional',
    stage:       'decision',
    contentType: 'Service / Landing',
    contentIcon: 'ti-calendar',
    badgeClass:  'badge-transactional',
    stageClass:  'stage-decision',
    stageLabel:  'Decision',
  },
  navigational: {
    label:       'Navigational',
    stage:       'retention',
    contentType: 'Brand Page',
    contentIcon: 'ti-home',
    badgeClass:  'badge-navigational',
    stageClass:  'stage-retention',
    stageLabel:  'Retention',
  },
  unmatched: {
    label:       'General',
    stage:       'awareness',
    contentType: 'General Content',
    contentIcon: 'ti-dots',
    badgeClass:  'badge-info',
    stageClass:  'stage-awareness',
    stageLabel:  'Awareness',
  },
};

const JOURNEY_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];

const JOURNEY_LABELS: Record<JourneyStage, string> = {
  awareness:     'Awareness',
  consideration: 'Consideration',
  decision:      'Decision',
  retention:     'Retention',
};

// ─── Branded / domain helpers (mirrored from KeywordsPanel) ──────────────────

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

  const baseBrands = [clientDomain, ...competitorDomains]
    .map(extractBrand)
    .filter(b => b.length >= 4);
  if (baseBrands.length === 0) return false;

  const tokenSet = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
    const half = Math.floor(brand.length / 2);
    if (half >= 4)                  tokenSet.add(brand.slice(0, half));
    if (brand.length - half >= 4)   tokenSet.add(brand.slice(half));
  }
  const allTokens = Array.from(tokenSet);

  for (const token of allTokens) {
    if (kwNorm.includes(token))                               return true;
    if (token.includes(kwNorm) && kwNorm.length >= 4)        return true;
    if (token.length >= 5 && kwNorm.length >= 4 && token.startsWith(kwNorm)) return true;
  }

  const kwWords = kw
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 4);

  for (const word of kwWords) {
    for (const token of allTokens) {
      const minLen    = Math.min(word.length, token.length);
      const threshold = Math.max(1, Math.floor(minLen / 4));
      if (Math.abs(word.length - token.length) > threshold + 1) continue;
      if (editDistance(word, token) <= threshold) return true;
    }
  }
  return false;
}

// ─── Layer 1: Signal-based intent detection ───────────────────────────────────

const TRANSACTIONAL_SIGNALS = [
  'near me', 'near ', 'schedule', 'book ', 'booking',
  'appointment', 'consultation', 'how much does', 'how much is', 'how much',
  'cost', 'price', 'pricing', 'financing', 'payment plan', 'afford',
  'discount', 'coupon', 'deal', 'specials', 'offer',
  'locations', 'location', 'find a ', 'find near', 'get a ',
  'clinic', 'clinic near', 'center near',
];

const COMMERCIAL_SIGNALS = [
  'review', 'reviews', 'best ', 'top ', ' vs ', 'versus', 'compare',
  'comparison', 'before after', 'before and after', 'results', 'worth it',
  'pros and cons', 'alternative', 'rating', 'ratings', 'testimonial',
  'testimonials', 'complaints', 'problems', 'side effects',
  'risks', 'dangers', 'safe ', 'safety',
];

const INFORMATIONAL_SIGNALS = [
  'what is ', 'what are ', 'how does', 'how do', 'how to',
  'why ', 'guide', ' tips', 'recovery', 'benefits',
  'difference between', 'types of', 'explained', 'overview',
  'about ', 'definition', 'meaning', 'learn', 'understanding',
  'causes', 'symptoms', 'stages', 'process', 'procedure',
];

function detectIntentSignal(keyword: string): IntentType | null {
  const kw = keyword.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (kw.includes(s)) return 'transactional'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (kw.includes(s)) return 'commercial';    }
  for (const s of INFORMATIONAL_SIGNALS) { if (kw.includes(s)) return 'informational'; }
  return null;
}

// ─── Category → keyword assignment ───────────────────────────────────────────
// Uses stored _keywordCategories map when present (new analyses after v7.34).
// Falls back to name-matching for older analyses.

function matchKeywordToCategory(
  keyword:     string,
  categories:  Array<{ name: string; type: string }>,
  clientDomain:     string,
  competitorDomains: string[],
): string | null {
  const kwLow = keyword.toLowerCase();

  for (const cat of categories) {
    // Brand → use branded detection
    if (cat.type === 'brand') {
      if (isBranded(keyword, clientDomain, competitorDomains)) return cat.name;
    }

    // Location → brand + location signals
    if (cat.type === 'location') {
      const locationSignals = ['near me', 'near ', ' in ', 'location', 'clinic', 'center'];
      const hasBrand = isBranded(keyword, clientDomain, competitorDomains);
      const hasLoc   = locationSignals.some(s => kwLow.includes(s));
      if (hasBrand && hasLoc) return cat.name;
    }
  }

  // Procedure — tokenise category name and look for matches in keyword
  for (const cat of categories) {
    if (cat.type !== 'procedure') continue;

    const catWords = cat.name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['with', 'from', 'that', 'this', 'body', 'area'].includes(w));

    for (const w of catWords) {
      if (kwLow.includes(w)) return cat.name;
    }
  }

  return null;
}

// ─── Build theme clusters ─────────────────────────────────────────────────────

function buildThemeClusters(
  analysis:          any,
  claudeAssignments: Record<string, IntentType>,
  clientDomain:      string,
  competitorDomains: string[],
): ThemeCluster[] {
  const semSnap = analysis?.semrushSnapshot ?? {};
  const cb      = semSnap._categoryBreakdown ?? null;
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? []).map((c: any) => ({
      name: c.name,
      type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure',
    }));

  if (categories.length === 0) return [];

  // Stored keyword→category map (available for analyses run after v7.34)
  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};

  // Build KwItem pool
  const MVP_LIMIT = 20;
  const rankedMap = new Map<string, number>();
  for (const kw of (semSnap.topKeywords ?? []).slice(0, MVP_LIMIT)) {
    rankedMap.set((kw.keyword ?? '').toLowerCase(), kw.position ?? 0);
  }

  const pool: KwItem[] = [];
  for (const kw of (semSnap.topKeywords ?? []).slice(0, MVP_LIMIT)) {
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: kw.position ?? null, isGap: false });
  }
  const seen = new Set(pool.map(k => k.keyword.toLowerCase()));
  for (const kw of (semSnap.gapKeywords ?? []).slice(0, MVP_LIMIT)) {
    if (seen.has((kw.keyword ?? '').toLowerCase())) continue;
    seen.add((kw.keyword ?? '').toLowerCase());
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: null, isGap: true });
  }

  // Group keywords by category
  const catMap = new Map<string, KwItem[]>();
  categories.forEach(c => catMap.set(c.name, []));
  const unassigned: KwItem[] = [];

  for (const kw of pool) {
    const key = kw.keyword.toLowerCase();
    // Try stored map first
    const storedCat = storedMap[key];
    if (storedCat && catMap.has(storedCat)) {
      catMap.get(storedCat)!.push(kw);
      continue;
    }
    // Fallback name-matching
    const matched = matchKeywordToCategory(kw.keyword, categories, clientDomain, competitorDomains);
    if (matched && catMap.has(matched)) {
      catMap.get(matched)!.push(kw);
    } else {
      unassigned.push(kw);
    }
  }

  // Distribute unassigned to best-fit category (by volume, assign to largest procedure)
  // or create an "Other" bucket inside the first procedure category
  if (unassigned.length > 0) {
    const firstProc = categories.find(c => c.type === 'procedure')?.name
      ?? categories[0]?.name;
    if (firstProc) {
      catMap.get(firstProc)!.push(...unassigned);
    }
  }

  // Build ThemeCluster with sub-clusters for each category
  const result: ThemeCluster[] = [];

  for (const cat of categories) {
    const kws = catMap.get(cat.name) ?? [];
    if (kws.length === 0) continue;

    const totalVolume = kws.reduce((s, k) => s + k.searchVolume, 0);

    // Sub-cluster by intent
    const intentBuckets = new Map<IntentType, KwItem[]>();
    const ORDER: IntentType[] = ['informational', 'commercial', 'transactional', 'navigational', 'unmatched'];
    ORDER.forEach(i => intentBuckets.set(i, []));

    for (const kw of kws) {
      const key = kw.keyword.toLowerCase();

      // navigational first if branded
      if (isBranded(kw.keyword, clientDomain, competitorDomains) && cat.type === 'brand') {
        intentBuckets.get('navigational')!.push(kw);
        continue;
      }

      // Layer 1: signal matching
      let intent = detectIntentSignal(kw.keyword);

      // Layer 2: Claude haiku result
      if (!intent && claudeAssignments[key]) {
        intent = claudeAssignments[key];
      }

      intentBuckets.get(intent ?? 'unmatched')!.push(kw);
    }

    const subClusters: IntentCluster[] = [];
    // Use Array.from for Map iteration to satisfy TS downlevelIteration requirement
    Array.from(intentBuckets.entries()).forEach(([intent, items]: [IntentType, KwItem[]]) => {
      if (items.length === 0) return;
      const meta = INTENT_META[intent];
      subClusters.push({
        intent,
        stage:            meta.stage,
        contentType:      meta.contentType,
        contentIcon:      meta.contentIcon,
        keywords:         items,
        totalVolume:      items.reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        clientVolume:     items.filter((k: KwItem) => k.position !== null && k.position <= 10).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        competitorVolume: items.filter((k: KwItem) => k.isGap).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
      });
    });

    result.push({
      id:          cat.name,
      name:        cat.name,
      type:        cat.type,
      keywords:    kws,
      totalVolume,
      subClusters,
    });
  }

  // Sort parents: procedure first by volume, then brand, then location
  result.sort((a, b) => {
    const typeOrder = { procedure: 0, brand: 1, location: 2 };
    const td = typeOrder[a.type] - typeOrder[b.type];
    if (td !== 0) return td;
    return b.totalVolume - a.totalVolume;
  });

  return result;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypePill({ type }: { type: 'procedure' | 'brand' | 'location' }) {
  const styles: Record<string, React.CSSProperties> = {
    procedure: { background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)', color: '#9B96FF' },
    brand:     { background: 'rgba(216,130,255,0.10)', border: '1px solid rgba(216,130,255,0.25)', color: '#C882FF' },
    location:  { background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ADE80' },
  };
  const labels = { procedure: 'Procedure', brand: 'Brand', location: 'Location' };
  return (
    <span style={{
      ...styles[type],
      fontSize: '9px', fontWeight: 600, letterSpacing: '.04em',
      padding: '2px 8px', borderRadius: '20px', flexShrink: 0, textTransform: 'uppercase',
    }}>
      {labels[type]}
    </span>
  );
}

const INTENT_BADGE_STYLES: Record<IntentType, React.CSSProperties> = {
  informational: { background: 'rgba(56,189,248,0.08)',  border: '1px solid rgba(56,189,248,0.2)',  color: '#38BDF8' },
  commercial:    { background: 'rgba(251,191,36,0.08)',  border: '1px solid rgba(251,191,36,0.2)',  color: '#FBBF24' },
  transactional: { background: 'rgba(74,222,128,0.08)',  border: '1px solid rgba(74,222,128,0.2)',  color: '#4ADE80' },
  navigational:  { background: 'rgba(200,130,255,0.08)', border: '1px solid rgba(200,130,255,0.2)', color: '#C882FF' },
  unmatched:     { background: 'rgba(56,189,248,0.08)',  border: '1px solid rgba(56,189,248,0.2)',  color: '#38BDF8' },
};

const JOURNEY_STAGE_STYLES: Record<JourneyStage, React.CSSProperties> = {
  awareness:     { background: '#0D1F30', border: '1px solid #1A3A54', color: '#5B9EC9' },
  consideration: { background: '#1C1408', border: '1px solid #342507', color: '#C99C4A' },
  decision:      { background: '#0B1F0B', border: '1px solid #143014', color: '#4ADE80' },
  retention:     { background: '#1A0D28', border: '1px solid #2E154A', color: '#C882FF' },
};

function IntentBadge({ intent }: { intent: IntentType }) {
  const meta = INTENT_META[intent];
  return (
    <span style={{
      ...INTENT_BADGE_STYLES[intent],
      fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '12px', flexShrink: 0,
    }}>
      {meta.label}
    </span>
  );
}

function JourneyTag({ stage }: { stage: JourneyStage }) {
  return (
    <span style={{
      ...JOURNEY_STAGE_STYLES[stage],
      fontSize: '9px', padding: '1px 7px', borderRadius: '10px', flexShrink: 0,
    }}>
      {JOURNEY_LABELS[stage]}
    </span>
  );
}

// Coverage bar: three segments — client (green), competitor (amber), uncovered (dark)
function CoverageBar({ clientPct, compPct, height = 4 }: { clientPct: number; compPct: number; height?: number }) {
  const uncoveredPct = Math.max(0, 100 - clientPct - compPct);
  return (
    <div style={{ display: 'flex', height, borderRadius: 2, overflow: 'hidden', background: '#1A1A30', width: '100%' }}>
      {clientPct > 0 && <div style={{ width: `${clientPct}%`, background: '#22C55E', transition: 'width 0.3s' }} />}
      {compPct   > 0 && <div style={{ width: `${compPct}%`,   background: '#F59E0B', transition: 'width 0.3s' }} />}
      {uncoveredPct > 0 && <div style={{ width: `${uncoveredPct}%`, background: '#1E1E38' }} />}
    </div>
  );
}

// ─── Clusters Tab ─────────────────────────────────────────────────────────────

function ClustersTab({
  clusters,
  loadingClaude,
}: {
  clusters:     ThemeCluster[];
  loadingClaude: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([clusters[0]?.id ?? '']));
  const [selected, setSelected] = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>

      {loadingClaude && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: '#6C63FF',
          padding: '8px 12px', marginBottom: 10,
          background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 8,
        }}>
          <svg style={{ width: 12, height: 12, animation: 'spin 1s linear infinite', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          AI refining cluster classifications…
        </div>
      )}

      {clusters.map(cluster => {
        const isOpen = expanded.has(cluster.id);
        const clientVolTotal  = cluster.keywords.filter(k => k.position !== null && k.position <= 10).reduce((s, k) => s + k.searchVolume, 0);
        const compVolTotal    = cluster.keywords.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0);
        const clientPct       = pct(clientVolTotal, cluster.totalVolume);
        const compPct         = pct(compVolTotal,   cluster.totalVolume);

        return (
          <div key={cluster.id} style={{
            background: '#111120', border: '1px solid #1C1C30',
            borderRadius: 10, marginBottom: 10, overflow: 'hidden',
          }}>
            {/* Parent row */}
            <div
              onClick={() => toggle(cluster.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#14141E')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <i
                className={`ti ti-chevron-right`}
                style={{ fontSize: 12, color: '#404060', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                aria-hidden="true"
              />
              <TypePill type={cluster.type} />
              <span style={{ fontSize: 12, fontWeight: 500, color: '#D8D8F8', flex: 1 }}>{cluster.name}</span>
              <span style={{ fontSize: 10, color: '#484868' }}><span style={{ color: '#9090C0' }}>{cluster.keywords.length}</span> kws</span>
              <span style={{ fontSize: 10, color: '#484868' }}><span style={{ color: '#9090C0' }}>{fmtVol(cluster.totalVolume)}</span>/mo</span>
            </div>

            {/* Coverage mini-bar in parent row */}
            {!isOpen && (
              <div style={{ padding: '0 14px 10px' }}>
                <CoverageBar clientPct={clientPct} compPct={compPct} height={3} />
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: '#22C55E' }}>Client {clientPct}%</span>
                  <span style={{ fontSize: 9, color: '#F59E0B' }}>Competitor {compPct}%</span>
                  <span style={{ fontSize: 9, color: '#383858' }}>Gap {100 - clientPct - compPct}%</span>
                </div>
              </div>
            )}

            {/* Sub-clusters */}
            {isOpen && (
              <>
                <div style={{ height: 1, background: '#1C1C30', margin: '0 14px' }} />
                <div style={{ padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cluster.subClusters.map((sc, si) => {
                    const scKey    = `${cluster.id}-${sc.intent}`;
                    const isSelec  = selected === scKey;
                    const scClient = pct(sc.clientVolume, sc.totalVolume);
                    const scComp   = pct(sc.competitorVolume, sc.totalVolume);
                    const meta     = INTENT_META[sc.intent];

                    return (
                      <div
                        key={scKey}
                        onClick={() => setSelected(isSelec ? null : scKey)}
                        style={{
                          background: isSelec ? '#0F0F1F' : '#0D0D1A',
                          border: `1px solid ${isSelec ? 'rgba(108,99,255,0.4)' : '#1C1C30'}`,
                          borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { if (!isSelec) (e.currentTarget as HTMLDivElement).style.borderColor = '#252540'; }}
                        onMouseLeave={e => { if (!isSelec) (e.currentTarget as HTMLDivElement).style.borderColor = '#1C1C30'; }}
                      >
                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <IntentBadge intent={sc.intent} />
                          <span style={{ fontSize: 11, fontWeight: 500, color: '#D8D8F8', flex: 1 }}>
                            {cluster.name} — {meta.label}
                          </span>
                          <JourneyTag stage={sc.stage} />
                        </div>

                        {/* Meta row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                          <span style={{ fontSize: 10, color: '#484868' }}>
                            <span style={{ color: '#6A6A90' }}>{sc.keywords.length}</span> kws
                          </span>
                          <span style={{ fontSize: 10, color: '#484868' }}>
                            <span style={{ color: '#6A6A90' }}>{fmtVol(sc.totalVolume)}</span>/mo
                          </span>
                          <div style={{ flex: 1 }}>
                            <CoverageBar clientPct={scClient} compPct={scComp} height={3} />
                          </div>
                          <span style={{ fontSize: 9, color: '#383858', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                            <i className={`ti ${meta.contentIcon}`} style={{ fontSize: 9 }} aria-hidden="true" />
                            {meta.contentType}
                          </span>
                        </div>

                        {/* Keyword chips (expanded) */}
                        {isSelec && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                            {sc.keywords.map(kw => (
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
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Journey summary bar */}
                <div style={{
                  display: 'flex', gap: 2,
                  padding: '8px 14px', borderTop: '1px solid #121220',
                  background: '#0A0A12',
                }}>
                  {JOURNEY_ORDER.map(stage => {
                    const stageClusters = cluster.subClusters.filter(sc => sc.stage === stage);
                    const stageVol = stageClusters.reduce((s, sc) => s + sc.totalVolume, 0);
                    const barPct = cluster.totalVolume > 0
                      ? Math.round((stageVol / cluster.totalVolume) * 100)
                      : 0;
                    const stageColors: Record<JourneyStage, string> = {
                      awareness:     '#1A3A5C',
                      consideration: '#3A2808',
                      decision:      '#143014',
                      retention:     '#2E154A',
                    };
                    return (
                      <div key={stage} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#2C2C44' }}>
                          {JOURNEY_LABELS[stage]}
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: stageColors[stage], margin: '3px 0', width: `${barPct}%` }} />
                        <div style={{ fontSize: 9, color: '#303050' }}>
                          {stageClusters.reduce((s, sc) => s + sc.keywords.length, 0)} kws
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}

      {clusters.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#404060', fontSize: 13 }}>
          No cluster data — run an analysis first.
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Content Map Tab ──────────────────────────────────────────────────────────

function ContentMapTab({ clusters }: { clusters: ThemeCluster[] }) {
  // Build a flat list of sub-clusters grouped by journey stage
  const stageMap = new Map<JourneyStage, Array<{ cluster: ThemeCluster; sc: IntentCluster }>>();
  JOURNEY_ORDER.forEach(s => stageMap.set(s, []));

  for (const cluster of clusters) {
    for (const sc of cluster.subClusters) {
      stageMap.get(sc.stage)!.push({ cluster, sc });
    }
  }

  // Overall stats
  const allKws     = clusters.flatMap(c => c.keywords);
  const totalVol   = allKws.reduce((s, k) => s + k.searchVolume, 0);
  const clientVol  = allKws.filter(k => k.position !== null && k.position <= 10).reduce((s, k) => s + k.searchVolume, 0);
  const compVol    = allKws.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0);
  const clientPct  = pct(clientVol, totalVol);
  const compPct    = pct(compVol, totalVol);
  const gapPct     = Math.max(0, 100 - clientPct - compPct);

  const STAGE_HEADER_STYLES: Record<JourneyStage, { bg: string; border: string; color: string; label: string }> = {
    awareness:     { bg: '#0D1A28', border: '#1A3450', color: '#5B9EC9',  label: 'Awareness' },
    consideration: { bg: '#1C1208', border: '#342207', color: '#C99C4A',  label: 'Consideration' },
    decision:      { bg: '#0B190B', border: '#142A14', color: '#4ADE80',  label: 'Decision' },
    retention:     { bg: '#160B26', border: '#281444', color: '#C882FF',  label: 'Retention' },
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>

      {/* Overall coverage summary */}
      <div style={{
        background: '#0F0F1C', border: '1px solid #1C1C30',
        borderRadius: 10, padding: '12px 16px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#D8D8F8' }}>Overall keyword coverage</span>
          <span style={{ fontSize: 10, color: '#404060' }}>{allKws.length} keywords · {fmtVol(totalVol)}/mo total demand</span>
        </div>
        <CoverageBar clientPct={clientPct} compPct={compPct} height={6} />
        <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#22C55E', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#4A7A5A' }}>Client owns <strong style={{ color: '#22C55E' }}>{clientPct}%</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#F59E0B', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#7A6A2A' }}>Competitor gap <strong style={{ color: '#F59E0B' }}>{compPct}%</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#1E1E38', border: '1px solid #2E2E50', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#404060' }}>Uncaptured <strong style={{ color: '#555575' }}>{gapPct}%</strong></span>
          </div>
        </div>
      </div>

      {/* Journey stage columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {JOURNEY_ORDER.map(stage => {
          const stageMeta = STAGE_HEADER_STYLES[stage];
          const items     = stageMap.get(stage) ?? [];
          const stageVol  = items.reduce((s, { sc }) => s + sc.totalVolume, 0);
          const stageKws  = items.reduce((s, { sc }) => s + sc.keywords.length, 0);
          const stageClV  = items.reduce((s, { sc }) => s + sc.clientVolume, 0);
          const stageCoV  = items.reduce((s, { sc }) => s + sc.competitorVolume, 0);
          const sClPct    = pct(stageClV, stageVol);
          const sCoP      = pct(stageCoV, stageVol);

          return (
            <div key={stage} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Stage header */}
              <div style={{
                background: stageMeta.bg, border: `1px solid ${stageMeta.border}`,
                borderRadius: 8, padding: '8px 10px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: stageMeta.color, marginBottom: 2 }}>
                  {stageMeta.label}
                </div>
                <div style={{ fontSize: 9, color: '#404060' }}>
                  {stageKws} kws · {fmtVol(stageVol)}/mo
                </div>
                <CoverageBar clientPct={sClPct} compPct={sCoP} height={3} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span style={{ fontSize: 8, color: '#22C55E' }}>You {sClPct}%</span>
                  <span style={{ fontSize: 8, color: '#F59E0B' }}>Comp {sCoP}%</span>
                </div>
              </div>

              {/* Cluster cards for this stage */}
              {items.map(({ cluster, sc }) => {
                const clPct  = pct(sc.clientVolume, sc.totalVolume);
                const coPct  = pct(sc.competitorVolume, sc.totalVolume);
                const isGap  = coPct > clPct;
                const meta   = INTENT_META[sc.intent];

                return (
                  <div key={`${cluster.id}-${sc.intent}`} style={{
                    background: '#0F0F1C',
                    border: `1px solid ${isGap ? '#2E1A08' : '#1C1C30'}`,
                    borderRadius: 8, padding: '8px 10px',
                  }}>
                    {/* Gap badge */}
                    {isGap && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 8, fontWeight: 700,
                        background: '#2E1208', border: '1px solid #4A2008',
                        borderRadius: 4, padding: '1px 5px', color: '#F59E0B',
                        marginBottom: 5,
                      }}>
                        <i className="ti ti-alert-triangle" style={{ fontSize: 8 }} aria-hidden="true" />
                        COMPETITOR GAP
                      </div>
                    )}
                    <div style={{ fontSize: 10, fontWeight: 500, color: '#C0C0E0', marginBottom: 2, lineHeight: 1.3 }}>
                      {cluster.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <TypePill type={cluster.type} />
                      <span style={{ fontSize: 8, color: '#383858' }}>{sc.keywords.length} kws · {fmtVol(sc.totalVolume)}/mo</span>
                    </div>
                    <CoverageBar clientPct={clPct} compPct={coPct} height={4} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ fontSize: 8, color: '#22C55E' }}>You {clPct}%</span>
                      <span style={{ fontSize: 8, color: '#F59E0B' }}>Comp {coPct}%</span>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      marginTop: 6, fontSize: 8, color: '#3A3A58',
                    }}>
                      <i className={`ti ${meta.contentIcon}`} style={{ fontSize: 8 }} aria-hidden="true" />
                      {meta.contentType}
                    </div>
                  </div>
                );
              })}

              {items.length === 0 && (
                <div style={{
                  background: '#0A0A14', border: '1px dashed #1A1A2A',
                  borderRadius: 8, padding: '16px 10px', textAlign: 'center',
                  fontSize: 9, color: '#2A2A40',
                }}>
                  No clusters
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ThemeClustersPanel({ projectId, analysis, competitors }: Props) {
  // Memoize semSnap so it doesn't produce a new {} object every render
  const semSnap = useMemo(() => analysis?.semrushSnapshot ?? {}, [analysis]);
  const clientDomain     = useMemo(() => (semSnap.domain as string) ?? '', [semSnap]);
  const competitorDomains = competitors;
  const industry         = (analysis as any)?._industry ?? 'General';
  const analysisId       = analysis?.id ?? 'unknown';

  const [tab,            setTab]            = useState<ClusterTab>('clusters');
  const [loadingClaude,  setLoadingClaude]  = useState(false);
  const [claudeAssigns,  setClaudeAssigns]  = useState<Record<string, IntentType>>({});

  // ── Build base clusters with Layer 1 signal matching ──
  const baseClusters = useMemo(
    () => buildThemeClusters(analysis, claudeAssigns, clientDomain, competitorDomains),
    [analysis, claudeAssigns, clientDomain, competitorDomains],
  );

  // ── Layer 2: Claude haiku for unmatched keywords ──
  const runClaudePass = useCallback(async () => {
    const cacheKey = `orbitiq-cluster-assigns-${analysisId}`;

    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setClaudeAssigns(JSON.parse(cached));
        return;
      }
    } catch { /* localStorage unavailable */ }

    // Collect keywords that signal matching didn't classify
    const MVP_LIMIT = 20;
    const pool: string[] = [];
    const seen = new Set<string>();
    for (const kw of (semSnap.topKeywords ?? []).slice(0, MVP_LIMIT)) {
      const k = kw.keyword?.toLowerCase();
      if (k && !seen.has(k) && !detectIntentSignal(kw.keyword)) {
        pool.push(kw.keyword);
        seen.add(k);
      }
    }
    for (const kw of (semSnap.gapKeywords ?? []).slice(0, MVP_LIMIT)) {
      const k = kw.keyword?.toLowerCase();
      if (k && !seen.has(k) && !detectIntentSignal(kw.keyword)) {
        pool.push(kw.keyword);
        seen.add(k);
      }
    }

    if (pool.length === 0) return;

    setLoadingClaude(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/clusters`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ keywords: pool, industry, domain: clientDomain }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const assigns: Record<string, IntentType> = data.assignments ?? {};

      setClaudeAssigns(assigns);

      // Cache in localStorage — valid indefinitely (keyed by analysisId)
      try { localStorage.setItem(cacheKey, JSON.stringify(assigns)); } catch { /* silent */ }

    } catch { /* silent — base clusters still show */ } finally {
      setLoadingClaude(false);
    }
  }, [analysisId, projectId, industry, clientDomain, semSnap]);

  useEffect(() => { runClaudePass(); }, [runClaudePass]);

  const cb         = semSnap._categoryBreakdown;
  const totalKws   = baseClusters.reduce((s, c) => s + c.keywords.length, 0);
  const totalVol   = baseClusters.reduce((s, c) => s + c.totalVolume, 0);
  const clusterCnt = baseClusters.reduce((s, c) => s + c.subClusters.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid #1C1C30',
        background: '#0D0D18', flexShrink: 0,
      }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#D8D8F8', margin: 0 }}>Theme Clusters</h2>
          <p style={{ fontSize: 11, color: '#404060', margin: '2px 0 0' }}>
            {totalKws} keywords · {clusterCnt} intent clusters · {baseClusters.length} categories
          </p>
        </div>
        <div style={{ fontSize: 10, color: '#383858', textAlign: 'right' }}>
          {fmtVol(totalVol)}<span style={{ color: '#2A2A44' }}>/mo total demand</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px', borderBottom: '1px solid #111120',
        background: '#0C0C18', flexShrink: 0,
      }}>
        {(['clusters', 'contentMap'] as ClusterTab[]).map(t => {
          const labels = { clusters: 'Clusters', contentMap: 'Content Map' };
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 10, padding: '3px 12px', borderRadius: 20, border: '1px solid transparent',
                cursor: 'pointer',
                background:  active ? 'rgba(108,99,255,0.12)' : 'transparent',
                borderColor: active ? 'rgba(108,99,255,0.35)' : 'transparent',
                color:       active ? '#9B96FF' : '#484868',
              }}
            >
              {labels[t]}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#252545', letterSpacing: '.05em' }}>
          <span style={{ color: '#22C55E' }}>■</span> client ranked &nbsp;
          <span style={{ color: '#F59E0B' }}>■</span> competitor gap
        </span>
      </div>

      {/* Body */}
      {tab === 'clusters'    && <ClustersTab   clusters={baseClusters} loadingClaude={loadingClaude} />}
      {tab === 'contentMap'  && <ContentMapTab clusters={baseClusters} />}
    </div>
  );
}
