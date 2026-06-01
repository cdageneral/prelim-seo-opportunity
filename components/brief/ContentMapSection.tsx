'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';

interface KwItem {
  keyword:      string;
  searchVolume: number;
  position:     number | null;
  isGap:        boolean;
  competitor:   string | null;
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
  projectId:   string;
  analysis:    any;
  competitors: string[];
}

// ─── Branded detection ────────────────────────────────────────────────────────

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
      curr[j] = a[i-1] === b[j-1]
        ? prev[j-1]
        : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
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
  const baseBrands = [clientDomain, ...competitorDomains].map(extractBrand).filter(b => b.length >= 4);
  if (baseBrands.length === 0) return false;
  const tokenSet = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
    const half = Math.floor(brand.length / 2);
    if (half >= 4)                tokenSet.add(brand.slice(0, half));
    if (brand.length - half >= 4) tokenSet.add(brand.slice(half));
  }
  const allTokens = Array.from(tokenSet);
  for (const token of allTokens) {
    if (kwNorm.includes(token))                               return true;
    if (token.includes(kwNorm) && kwNorm.length >= 4)        return true;
    if (token.length >= 5 && kwNorm.length >= 4 && token.startsWith(kwNorm)) return true;
  }
  const kwWords = kw.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length >= 4);
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

// ─── Intent signals ───────────────────────────────────────────────────────────

const TRANSACTIONAL_SIGNALS = [
  'near me','near ','schedule','book ','booking','appointment','consultation',
  'how much does','how much is','how much','cost','price','pricing',
  'financing','payment plan','afford','discount','coupon','deal','specials',
  'locations','location','find a ','get a ',
];
const COMMERCIAL_SIGNALS = [
  'review','reviews','best ','top ',' vs ','versus','compare','comparison',
  'before after','before and after','results','worth it','pros and cons',
  'alternative','rating','ratings','testimonial','testimonials','complaints',
  'side effects','risks','dangers','safe ','safety',
];
const INFORMATIONAL_SIGNALS = [
  'what is ','what are ','how does','how do','how to','why ','guide',
  ' tips','recovery','benefits','difference between','types of','explained',
  'overview','about ','definition','learn','understanding','causes','symptoms',
];

function detectIntentSignal(keyword: string): IntentType | null {
  const kw = keyword.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (kw.includes(s)) return 'transactional'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (kw.includes(s)) return 'commercial';    }
  for (const s of INFORMATIONAL_SIGNALS) { if (kw.includes(s)) return 'informational'; }
  return null;
}

const INTENT_META: Record<IntentType, { label: string; stage: JourneyStage; contentType: string; contentIcon: string }> = {
  informational: { label: 'Informational', stage: 'awareness',     contentType: 'Blog / Educational', contentIcon: 'ti-file-text'  },
  commercial:    { label: 'Commercial',    stage: 'consideration', contentType: 'Reviews / Comparison', contentIcon: 'ti-star'      },
  transactional: { label: 'Transactional', stage: 'decision',      contentType: 'Service / Landing',  contentIcon: 'ti-calendar'   },
  navigational:  { label: 'Navigational',  stage: 'retention',     contentType: 'Brand Page',         contentIcon: 'ti-home'       },
  unmatched:     { label: 'General',       stage: 'awareness',     contentType: 'General Content',    contentIcon: 'ti-dots'       },
};

const JOURNEY_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
const JOURNEY_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};

// ─── Category assignment ──────────────────────────────────────────────────────

function matchKeywordToCategory(
  keyword: string,
  categories: Array<{ name: string; type: string }>,
  clientDomain: string,
  competitorDomains: string[],
): string | null {
  const kwLow = keyword.toLowerCase();
  for (const cat of categories) {
    if (cat.type === 'brand' && isBranded(keyword, clientDomain, competitorDomains)) return cat.name;
    if (cat.type === 'location') {
      const locSigs = ['near me','near ',' in ','location','clinic','center'];
      if (isBranded(keyword, clientDomain, competitorDomains) && locSigs.some(s => kwLow.includes(s))) return cat.name;
    }
  }
  for (const cat of categories) {
    if (cat.type !== 'procedure') continue;
    const catWords = cat.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4 && !['with','from','that','this','body','area'].includes(w));
    for (const w of catWords) { if (kwLow.includes(w)) return cat.name; }
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
  const semSnap  = analysis?.semrushSnapshot ?? {};
  const cb       = semSnap._categoryBreakdown ?? null;
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? []).map((c: any) => ({
      name: c.name,
      type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure',
    }));
  if (categories.length === 0) return [];

  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};
  const MVP_LIMIT = 20;

  const pool: KwItem[] = [];
  for (const kw of (semSnap.topKeywords ?? []).slice(0, MVP_LIMIT)) {
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: kw.position ?? null, isGap: false, competitor: null });
  }
  const seen = new Set(pool.map(k => k.keyword.toLowerCase()));
  for (const kw of (semSnap.gapKeywords ?? []).slice(0, MVP_LIMIT)) {
    const kwLow = (kw.keyword ?? '').toLowerCase();
    if (seen.has(kwLow)) continue;
    seen.add(kwLow);
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: null, isGap: true, competitor: (kw as any).competitor ?? null });
  }

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
    (['informational','commercial','transactional','navigational','unmatched'] as IntentType[])
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
        keywords: items,
        totalVolume:      items.reduce((s, k) => s + k.searchVolume, 0),
        clientVolume:     items.filter(k => k.position !== null && k.position <= 10).reduce((s, k) => s + k.searchVolume, 0),
        competitorVolume: items.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0),
      });
    });
    result.push({ id: cat.name, name: cat.name, type: cat.type, keywords: kws, totalVolume, subClusters });
  }
  result.sort((a, b) => {
    const order = { procedure: 0, brand: 1, location: 2 };
    return (order[a.type] - order[b.type]) || b.totalVolume - a.totalVolume;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function TypePill({ type }: { type: 'procedure' | 'brand' | 'location' }) {
  const styles: Record<string, React.CSSProperties> = {
    procedure: { background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)', color: '#9B96FF' },
    brand:     { background: 'rgba(216,130,255,0.10)', border: '1px solid rgba(216,130,255,0.25)', color: '#C882FF' },
    location:  { background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ADE80' },
  };
  const labels = { procedure: 'Procedure', brand: 'Brand', location: 'Location' };
  return (
    <span style={{ ...styles[type], fontSize: '9px', fontWeight: 600, letterSpacing: '.04em', padding: '2px 8px', borderRadius: '20px', flexShrink: 0, textTransform: 'uppercase' as const }}>
      {labels[type]}
    </span>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ContentMapSection({ projectId, analysis, competitors }: Props) {
  const semSnap      = useMemo(() => analysis?.semrushSnapshot ?? {}, [analysis]);
  const clientDomain = useMemo(() => (semSnap.domain as string) ?? '', [semSnap]);
  const industry     = (analysis as any)?._industry ?? 'General';
  const analysisId   = analysis?.id ?? 'unknown';

  const [loadingClaude, setLoadingClaude] = useState(false);
  const [claudeAssigns, setClaudeAssigns] = useState<Record<string, IntentType>>({});

  const clusters = useMemo(
    () => buildThemeClusters(analysis, claudeAssigns, clientDomain, competitors),
    [analysis, claudeAssigns, clientDomain, competitors],
  );

  const runClaudePass = useCallback(async () => {
    const cacheKey = `orbitiq-cluster-assigns-${analysisId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setClaudeAssigns(JSON.parse(cached)); return; }
    } catch { /* unavailable */ }
    const MVP_LIMIT = 20;
    const pool: string[] = [];
    const seen = new Set<string>();
    for (const kw of (semSnap.topKeywords ?? []).slice(0, MVP_LIMIT)) {
      const k = kw.keyword?.toLowerCase();
      if (k && !seen.has(k) && !detectIntentSignal(kw.keyword)) { pool.push(kw.keyword); seen.add(k); }
    }
    for (const kw of (semSnap.gapKeywords ?? []).slice(0, MVP_LIMIT)) {
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

  // ── Journey map data ──────────────────────────────────────────────────────
  const stageMap = useMemo(() => {
    const map = new Map<JourneyStage, Array<{ cluster: ThemeCluster; sc: IntentCluster }>>();
    JOURNEY_ORDER.forEach(s => map.set(s, []));
    for (const cluster of clusters) {
      for (const sc of cluster.subClusters) {
        map.get(sc.stage)!.push({ cluster, sc });
      }
    }
    return map;
  }, [clusters]);

  const allKws    = useMemo(() => clusters.flatMap(c => c.keywords), [clusters]);
  const totalVol  = allKws.reduce((s, k) => s + k.searchVolume, 0);
  const clientVol = allKws.filter(k => k.position !== null && k.position <= 10).reduce((s, k) => s + k.searchVolume, 0);
  const compVol   = allKws.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0);
  const clientPct = pct(clientVol, totalVol);
  const compPct   = pct(compVol, totalVol);
  const gapPct    = Math.max(0, 100 - clientPct - compPct);

  const STAGE_HEADER: Record<JourneyStage, { bg: string; border: string; color: string }> = {
    awareness:     { bg: '#0D1A28', border: '#1A3450', color: '#5B9EC9' },
    consideration: { bg: '#1C1208', border: '#342207', color: '#C99C4A' },
    decision:      { bg: '#0B190B', border: '#142A14', color: '#4ADE80' },
    retention:     { bg: '#160B26', border: '#281444', color: '#C882FF' },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: '1px solid #1C1C30', background: '#0D0D18', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#D8D8F8', margin: 0 }}>Content Map</h2>
          <p style={{ fontSize: 11, color: '#404060', margin: '2px 0 0' }}>
            {allKws.length} keywords mapped across the buyer journey · {clusters.length} theme clusters
            {loadingClaude && <span style={{ color: '#6C63FF', marginLeft: 8 }}>· Classifying intent…</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#383858' }}>
          <span><span style={{ color: '#22C55E' }}>■</span> Client content</span>
          <span><span style={{ color: '#F59E0B' }}>■</span> Competitor gap</span>
          <span><span style={{ color: '#1E1E38' }}>■</span> Uncaptured</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {clusters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#404060', fontSize: 13 }}>
            No cluster data — run an analysis first.
          </div>
        ) : (
          <>
            {/* Overall coverage bar */}
            <div style={{ background: '#0F0F1C', border: '1px solid #1C1C30', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#D8D8F8' }}>Overall keyword coverage</span>
                <span style={{ fontSize: 10, color: '#404060' }}>{allKws.length} keywords · {fmtVol(totalVol)}/mo total demand</span>
              </div>
              <CoverageBar clientPct={clientPct} compPct={compPct} height={6} />
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
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

            {/* 4-column journey grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {JOURNEY_ORDER.map(stage => {
                const stageMeta = STAGE_HEADER[stage];
                const items     = stageMap.get(stage) ?? [];
                const stageVol  = items.reduce((s, { sc }) => s + sc.totalVolume, 0);
                const stageKws  = items.reduce((s, { sc }) => s + sc.keywords.length, 0);
                const stageClV  = items.reduce((s, { sc }) => s + sc.clientVolume, 0);
                const stageCoV  = items.reduce((s, { sc }) => s + sc.competitorVolume, 0);
                const sClP      = pct(stageClV, stageVol);
                const sCoP      = pct(stageCoV, stageVol);

                return (
                  <div key={stage} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Stage header */}
                    <div style={{ background: stageMeta.bg, border: `1px solid ${stageMeta.border}`, borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: stageMeta.color, marginBottom: 2 }}>{JOURNEY_LABELS[stage]}</div>
                      <div style={{ fontSize: 10, color: '#7070A0', marginBottom: 6 }}>{stageKws} kws · {fmtVol(stageVol)}/mo</div>
                      <CoverageBar clientPct={sClP} compPct={sCoP} height={3} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ fontSize: 9, color: '#22C55E' }}>You {sClP}%</span>
                        <span style={{ fontSize: 9, color: '#F59E0B' }}>Comp {sCoP}%</span>
                      </div>
                    </div>

                    {/* Cluster cards */}
                    {items.map(({ cluster, sc }) => {
                      const clPct = pct(sc.clientVolume, sc.totalVolume);
                      const coPct = pct(sc.competitorVolume, sc.totalVolume);
                      const isGap = coPct > clPct;
                      const meta  = INTENT_META[sc.intent];
                      return (
                        <div key={`${cluster.id}-${sc.intent}`} style={{
                          background: '#0F0F1C', border: `1px solid ${isGap ? '#2E1A08' : '#1C1C30'}`, borderRadius: 8, padding: '10px 12px',
                        }}>
                          {isGap && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, fontWeight: 700, background: '#2E1208', border: '1px solid #4A2008', borderRadius: 4, padding: '2px 6px', color: '#F59E0B', marginBottom: 6 }}>
                              <i className="ti ti-alert-triangle" style={{ fontSize: 8 }} aria-hidden="true" /> COMPETITOR GAP
                            </div>
                          )}
                          <div style={{ fontSize: 11, fontWeight: 500, color: '#C8C8E8', marginBottom: 4, lineHeight: 1.3 }}>{cluster.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                            <TypePill type={cluster.type} />
                            <span style={{ fontSize: 9, color: '#5A5A80' }}>{sc.keywords.length} kws · {fmtVol(sc.totalVolume)}/mo</span>
                          </div>
                          <CoverageBar clientPct={clPct} compPct={coPct} height={4} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            <span style={{ fontSize: 9, color: '#22C55E' }}>You {clPct}%</span>
                            <span style={{ fontSize: 9, color: '#F59E0B' }}>Comp {coPct}%</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 9, color: '#5A5A80' }}>
                            <i className={`ti ${meta.contentIcon}`} style={{ fontSize: 10 }} aria-hidden="true" />
                            {meta.contentType}
                          </div>
                        </div>
                      );
                    })}

                    {items.length === 0 && (
                      <div style={{ background: '#0A0A14', border: '1px dashed #1A1A2A', borderRadius: 8, padding: '20px 10px', textAlign: 'center', fontSize: 10, color: '#3A3A58' }}>
                        No clusters
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
