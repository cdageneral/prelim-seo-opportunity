'use client';

import { useMemo, useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';
type JourneyType  = 'pre-product' | 'product';

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
  keywords:         KwItem[];
  totalVolume:      number;
  clientVolume:     number;
  competitorVolume: number;
}

interface ThemeCluster {
  id:          string;
  name:        string;
  type:        'procedure' | 'brand' | 'location';
  journeyType: JourneyType;
  keywords:    KwItem[];
  totalVolume: number;
  subClusters: IntentCluster[];
}

interface AudienceSegment {
  id:             string;
  name:           string;
  tagline:        string;
  volumePct:      number;
  whoTheyAre:     { demographics: string; trigger: string; influencerRole?: string };
  preLLMPrompts:  string[];
  productPrompts: string[];
}

interface Props {
  projectId:   string;
  analysis:    any;
  competitors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNEY_STAGE_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
const JOURNEY_STAGE_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};
const STAGE_COLORS: Record<JourneyStage, { border: string; text: string; bg: string }> = {
  awareness:     { border: '#22d3ee', text: '#22d3ee', bg: 'rgba(34,211,238,0.06)'  },
  consideration: { border: '#a78bfa', text: '#a78bfa', bg: 'rgba(167,139,250,0.06)' },
  decision:      { border: '#34d399', text: '#34d399', bg: 'rgba(52,211,153,0.06)'  },
  retention:     { border: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.06)'  },
};

const SEGMENT_ACCENTS = [
  { border: '#22d3ee', text: '#22d3ee', bg: 'rgba(34,211,238,0.08)'  },
  { border: '#a78bfa', text: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  { border: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
];

const INTENT_META: Record<IntentType, { stage: JourneyStage }> = {
  informational: { stage: 'awareness'     },
  commercial:    { stage: 'consideration' },
  transactional: { stage: 'decision'      },
  navigational:  { stage: 'retention'     },
  unmatched:     { stage: 'awareness'     },
};

// ─── Branded detection helpers ────────────────────────────────────────────────

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_: unknown, j: number) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function extractBrand(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    .replace(/\.(com|net|org|io|co|ca|us|uk|au|gov|edu|biz|info)(\.[a-z]{2})?$/i, '')
    .split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isBranded(keyword: string, clientDomain: string, competitorDomains: string[]): boolean {
  if (!keyword) return false;
  const kw = keyword.toLowerCase().trim();
  const kwNorm = kw.replace(/[^a-z0-9]/g, '');
  if (!kwNorm) return false;
  const baseBrands = [clientDomain, ...competitorDomains].map(extractBrand).filter(b => b.length >= 4);
  if (!baseBrands.length) return false;
  const tokenSet = new Set<string>(baseBrands);
  for (const brand of baseBrands) {
    const half = Math.floor(brand.length / 2);
    if (half >= 4) tokenSet.add(brand.slice(0, half));
    if (brand.length - half >= 4) tokenSet.add(brand.slice(half));
  }
  const allTokens = Array.from(tokenSet);
  for (const token of allTokens) {
    if (kwNorm.includes(token)) return true;
    if (token.includes(kwNorm) && kwNorm.length >= 4) return true;
    if (token.length >= 5 && kwNorm.length >= 4 && token.startsWith(kwNorm)) return true;
  }
  const kwWords = kw.split(/\s+/).map((w: string) => w.replace(/[^a-z0-9]/g, '')).filter((w: string) => w.length >= 4);
  for (const word of kwWords) {
    for (const token of allTokens) {
      const minLen = Math.min(word.length, token.length);
      const threshold = Math.max(1, Math.floor(minLen / 4));
      if (Math.abs(word.length - token.length) > threshold + 1) continue;
      if (editDistance(word, token) <= threshold) return true;
    }
  }
  return false;
}

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

function detectIntent(keyword: string): IntentType {
  const kw = keyword.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (kw.includes(s)) return 'transactional'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (kw.includes(s)) return 'commercial';    }
  for (const s of INFORMATIONAL_SIGNALS) { if (kw.includes(s)) return 'informational'; }
  return 'unmatched';
}

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
      if (isBranded(keyword, clientDomain, competitorDomains) && locSigs.some((s: string) => kwLow.includes(s))) return cat.name;
    }
  }
  for (const cat of categories) {
    if (cat.type !== 'procedure') continue;
    const catWords = cat.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w: string) => w.length >= 4 && !['with','from','that','this','body','area'].includes(w));
    for (const w of catWords) { if (kwLow.includes(w)) return cat.name; }
  }
  return null;
}

// ─── JourneyType classification ───────────────────────────────────────────────

function classifyJourneyType(cluster: { type: string; subClusters: IntentCluster[] }): JourneyType {
  if (cluster.type === 'brand' || cluster.type === 'location') return 'product';
  const volByIntent: Record<string, number> = {};
  for (const sc of cluster.subClusters) {
    volByIntent[sc.intent] = (volByIntent[sc.intent] ?? 0) + sc.totalVolume;
  }
  const dominant = Object.entries(volByIntent).sort((a, b) => b[1] - a[1])[0]?.[0];
  return dominant === 'informational' ? 'pre-product' : 'product';
}

// ─── Build clusters ───────────────────────────────────────────────────────────

function buildClusters(
  analysis: any,
  claudeAssignments: Record<string, IntentType>,
  clientDomain: string,
  competitorDomains: string[],
  uploadedKeywords: any[] = [],
): ThemeCluster[] {
  const semSnap = analysis?.semrushSnapshot ?? {};
  const cb = semSnap._categoryBreakdown ?? null;
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? []).map((c: any) => ({
      name: c.name,
      type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure' as const,
    }));
  if (!categories.length) return [];

  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};
  const MVP_LIMIT = 20;

  const pool: KwItem[] = [];
  for (const kw of (semSnap.topKeywords ?? []).slice(0, MVP_LIMIT)) {
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: kw.position ?? null, isGap: false, competitor: null });
  }
  const seen = new Set(pool.map((k: KwItem) => k.keyword.toLowerCase()));
  for (const kw of (semSnap.gapKeywords ?? []).slice(0, MVP_LIMIT)) {
    const kwLow = (kw.keyword ?? '').toLowerCase();
    if (seen.has(kwLow)) continue;
    seen.add(kwLow);
    pool.push({ keyword: kw.keyword, searchVolume: kw.searchVolume ?? 0, position: null, isGap: true, competitor: (kw as any).competitor ?? null });
  }
  // Uploaded/CSV keywords from DB — no cap, full set
  for (const kw of uploadedKeywords.filter((k: any) => k.source !== 'blocked')) {
    const kwLow = (kw.keyword ?? '').toLowerCase();
    if (!kwLow || seen.has(kwLow)) continue;
    seen.add(kwLow);
    pool.push({
      keyword:      kw.keyword,
      searchVolume: kw.search_volume ?? kw.searchVolume ?? 0,
      position:     kw.position ?? null,
      isGap:        kw.type === 'gap',
      competitor:   null,
    });
  }

  const catMap = new Map<string, KwItem[]>();
  categories.forEach((c: { name: string; type: string }) => catMap.set(c.name, []));
  const unassigned: KwItem[] = [];

  for (const kw of pool) {
    const key = kw.keyword.toLowerCase();
    const stored = storedMap[key];
    if (stored && catMap.has(stored)) { catMap.get(stored)!.push(kw); continue; }
    const matched = matchKeywordToCategory(kw.keyword, categories, clientDomain, competitorDomains);
    if (matched && catMap.has(matched)) catMap.get(matched)!.push(kw);
    else unassigned.push(kw);
  }

  if (unassigned.length > 0) {
    const firstProc = categories.find((c: { type: string }) => c.type === 'procedure')?.name ?? categories[0]?.name;
    if (firstProc) catMap.get(firstProc)!.push(...unassigned);
  }

  const result: ThemeCluster[] = [];
  for (const cat of categories) {
    const kws = catMap.get(cat.name) ?? [];
    if (!kws.length) continue;
    const totalVolume = kws.reduce((s: number, k: KwItem) => s + k.searchVolume, 0);

    const intentBuckets = new Map<IntentType, KwItem[]>();
    (['informational','commercial','transactional','navigational','unmatched'] as IntentType[]).forEach((i: IntentType) => intentBuckets.set(i, []));

    for (const kw of kws) {
      if (isBranded(kw.keyword, clientDomain, competitorDomains) && cat.type === 'brand') {
        intentBuckets.get('navigational')!.push(kw); continue;
      }
      const sig = detectIntent(kw.keyword);
      const intent: IntentType = sig !== 'unmatched' ? sig : (claudeAssignments[kw.keyword.toLowerCase()] ?? 'unmatched');
      intentBuckets.get(intent)!.push(kw);
    }

    const subClusters: IntentCluster[] = [];
    Array.from(intentBuckets.entries()).forEach(([intent, items]: [IntentType, KwItem[]]) => {
      if (!items.length) return;
      subClusters.push({
        intent,
        stage: INTENT_META[intent].stage,
        keywords: items,
        totalVolume: items.reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        clientVolume: items.filter((k: KwItem) => k.position !== null && k.position <= 10).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
        competitorVolume: items.filter((k: KwItem) => k.isGap).reduce((s: number, k: KwItem) => s + k.searchVolume, 0),
      });
    });

    const journeyType = classifyJourneyType({ type: cat.type, subClusters });
    result.push({ id: cat.name, name: cat.name, type: cat.type, journeyType, keywords: kws, totalVolume, subClusters });
  }

  result.sort((a, b) => {
    const order: Record<string, number> = { procedure: 0, brand: 1, location: 2 };
    return (order[a.type] - order[b.type]) || (b.totalVolume - a.totalVolume);
  });
  return result;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function pctOf(num: number, den: number): number {
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

function inferStageFromPrompt(text: string): JourneyStage {
  const t = text.toLowerCase();
  for (const s of TRANSACTIONAL_SIGNALS) { if (t.includes(s)) return 'decision'; }
  for (const s of COMMERCIAL_SIGNALS)    { if (t.includes(s)) return 'consideration'; }
  for (const s of INFORMATIONAL_SIGNALS) { if (t.includes(s)) return 'awareness'; }
  return 'awareness';
}

// ─── ClusterPill ──────────────────────────────────────────────────────────────

function ClusterPill({ cluster, stage }: { cluster: ThemeCluster; stage: JourneyStage }) {
  const colors = STAGE_COLORS[stage];
  const stageSubs = cluster.subClusters.filter((sc: IntentCluster) => sc.stage === stage);
  const totalVol = stageSubs.reduce((s: number, sc: IntentCluster) => s + sc.totalVolume, 0);
  const clientVol = stageSubs.reduce((s: number, sc: IntentCluster) => s + sc.clientVolume, 0);
  const compVol = stageSubs.reduce((s: number, sc: IntentCluster) => s + sc.competitorVolume, 0);
  const clientPct = pctOf(clientVol, totalVol || cluster.totalVolume);
  const isGap = compVol > 0 && clientVol === 0;
  const isPartial = compVol > 0 && clientVol > 0 && clientPct < 50;
  const kwCount = stageSubs.reduce((s: number, sc: IntentCluster) => s + sc.keywords.length, 0) || cluster.keywords.length;
  const displayVol = totalVol || cluster.totalVolume;

  return (
    <div style={{
      background: '#0D0D1C',
      border: `1px solid ${isGap ? '#3a1c1c' : '#1A1A30'}`,
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#C8C8E8', lineHeight: 1.3 }}>{cluster.name}</span>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {isGap && (
            <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', fontWeight: 700 }}>
              GAP
            </span>
          )}
          {isPartial && !isGap && (
            <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)', fontWeight: 700 }}>
              PARTIAL
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: '#1A1A30', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${clientPct}%`, background: colors.border, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 10, color: '#6060A0', minWidth: 28, textAlign: 'right' }}>{clientPct}%</span>
      </div>
      <div style={{ fontSize: 10, color: '#505070' }}>
        {fmtVol(displayVol)}/mo · {kwCount} kw{kwCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ─── Pre-product lane ─────────────────────────────────────────────────────────

function PreProductLane({ prompts, clusters }: { prompts: string[]; clusters: ThemeCluster[] }) {
  const ppClusters = clusters.filter((c: ThemeCluster) => c.journeyType === 'pre-product');

  return (
    <div style={{
      background: 'rgba(34,211,238,0.02)', border: '1px solid rgba(34,211,238,0.15)',
      borderRadius: 12, padding: '20px 24px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,211,238,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-bulb" style={{ color: '#22d3ee', fontSize: 15 }} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22d3ee' }}>Pre-Product Journey</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(34,211,238,0.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
              Awareness Only
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#4A7A80', marginTop: 2 }}>
            These searchers don&apos;t know your product exists &mdash; they&apos;re solving a life problem
          </p>
        </div>
      </div>

      {prompts.length > 0 && (
        <div style={{ marginBottom: ppClusters.length > 0 ? 18 : 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#3A6A70', marginBottom: 8 }}>
            How They Search Before Knowing You Exist
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {prompts.map((p: string, i: number) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'flex-start', gap: 4,
                fontSize: 11, padding: '5px 10px', borderRadius: 6,
                background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.18)',
                color: '#7AD8E0', fontFamily: 'monospace', lineHeight: 1.4,
              }}>
                <span style={{ opacity: 0.45, flexShrink: 0 }}>&ldquo;</span>
                {p}
                <span style={{ opacity: 0.45, flexShrink: 0 }}>&rdquo;</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {ppClusters.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#3A6A70', marginBottom: 8 }}>
            Keyword Clusters &middot; Client vs Competitor Coverage
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {ppClusters.map((c: ThemeCluster) => (
              <ClusterPill key={c.id} cluster={c} stage="awareness" />
            ))}
          </div>
        </div>
      )}

      {!prompts.length && !ppClusters.length && (
        <p style={{ fontSize: 12, color: '#3A5A60', fontStyle: 'italic' }}>
          No pre-product data yet &mdash; run a full analysis to populate this lane.
        </p>
      )}
    </div>
  );
}

// ─── Product journey lane ─────────────────────────────────────────────────────

function ProductJourneyLane({ prompts, clusters }: { prompts: string[]; clusters: ThemeCluster[] }) {
  const productClusters = clusters.filter((c: ThemeCluster) => c.journeyType === 'product');

  const promptsByStage: Record<JourneyStage, string[]> = { awareness: [], consideration: [], decision: [], retention: [] };
  for (const p of prompts) promptsByStage[inferStageFromPrompt(p)].push(p);

  const clustersByStage: Record<JourneyStage, ThemeCluster[]> = { awareness: [], consideration: [], decision: [], retention: [] };
  for (const cluster of productClusters) {
    const volByStage: Record<JourneyStage, number> = { awareness: 0, consideration: 0, decision: 0, retention: 0 };
    for (const sc of cluster.subClusters) {
      volByStage[sc.stage] = (volByStage[sc.stage] ?? 0) + sc.totalVolume;
    }
    const best = (Object.entries(volByStage) as [JourneyStage, number][]).sort((a, b) => b[1] - a[1])[0];
    const dominantStage: JourneyStage = best ? best[0] : 'awareness';
    clustersByStage[dominantStage].push(cluster);
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #1A1A30' }}>
      <div style={{ background: '#0A0A18', padding: '14px 20px', borderBottom: '1px solid #1A1A30', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(167,139,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-route" style={{ color: '#a78bfa', fontSize: 14 }} />
        </div>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>Product Journey</span>
          <p style={{ fontSize: 11, color: '#5A5A80', marginTop: 1 }}>
            Full funnel &mdash; searchers who are aware of the category and evaluating options
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {JOURNEY_STAGE_ORDER.map((stage: JourneyStage, idx: number) => {
          const colors = STAGE_COLORS[stage];
          const stagePrompts  = promptsByStage[stage];
          const stageClusters = clustersByStage[stage];
          const isLast = idx === 3;

          return (
            <div key={stage} style={{ borderRight: isLast ? 'none' : '1px solid #1A1A30', background: '#0D0D1E', minHeight: 180 }}>
              <div style={{ padding: '11px 13px', borderBottom: '1px solid #1A1A30', borderTop: `3px solid ${colors.border}`, background: colors.bg }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
                  {JOURNEY_STAGE_LABELS[stage]}
                </span>
              </div>
              <div style={{ padding: '13px 11px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stagePrompts.length > 0 && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: '#3A3A5A', marginBottom: 5 }}>
                      Search Queries
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {stagePrompts.map((p: string, i: number) => (
                        <span key={i} style={{
                          fontSize: 10, padding: '4px 8px', borderRadius: 5,
                          background: colors.bg, border: `1px solid ${colors.border}28`,
                          color: colors.text, fontFamily: 'monospace', lineHeight: 1.4, display: 'block',
                        }}>
                          &ldquo;{p}&rdquo;
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {stageClusters.length > 0 && (
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: '#3A3A5A', marginBottom: 5 }}>
                      Keyword Clusters
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {stageClusters.map((c: ThemeCluster) => <ClusterPill key={c.id} cluster={c} stage={stage} />)}
                    </div>
                  </div>
                )}
                {!stagePrompts.length && !stageClusters.length && (
                  <p style={{ fontSize: 10, color: '#2A2A40', fontStyle: 'italic' }}>No data mapped here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JourneySection({ projectId, analysis, competitors }: Props) {
  const [claudeAssignments,  setClaudeAssignments]  = useState<Record<string, IntentType>>({});
  const [uploadedKeywords,   setUploadedKeywords]   = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('combined');

  const clientDomain = (analysis?.semrushSnapshot as any)?.domain ?? '';
  const segments: AudienceSegment[] = useMemo(
    () => (analysis?.semrushSnapshot as any)?._audienceSegments ?? [],
    [analysis],
  );

  useEffect(() => {
    if (!analysis?.id) return;
    const cacheKey = `orbitiq-clusters-${analysis.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { version?: number; assignments?: Record<string, IntentType> };
        if (parsed.version === 2 && parsed.assignments) setClaudeAssignments(parsed.assignments);
      }
    } catch {}
  }, [analysis?.id]);

  // Fetch uploaded/CSV keywords from DB — re-runs when projectId changes
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/keywords`)
      .then((r: Response) => r.ok ? r.json() : { keywords: [] })
      .then((d: any) => setUploadedKeywords(d.keywords ?? []))
      .catch(() => {});
  }, [projectId]);

  const clusters = useMemo(
    () => buildClusters(analysis, claudeAssignments, clientDomain, competitors ?? [], uploadedKeywords),
    [analysis, claudeAssignments, clientDomain, competitors, uploadedKeywords],
  );

  const tabs = useMemo(() => [
    { id: 'combined', label: 'All Segments' },
    ...segments.map((s: AudienceSegment) => ({ id: s.id, label: s.name })),
  ], [segments]);

  const activeSegment = activeTab === 'combined' ? null : segments.find((s: AudienceSegment) => s.id === activeTab) ?? null;
  const segIdx = activeSegment ? segments.indexOf(activeSegment) : -1;
  const segAccent = segIdx >= 0 ? SEGMENT_ACCENTS[segIdx % SEGMENT_ACCENTS.length] : null;

  const preLLMPrompts = activeSegment
    ? (activeSegment.preLLMPrompts ?? [])
    : segments.flatMap((s: AudienceSegment) => s.preLLMPrompts ?? []);

  const productPrompts = activeSegment
    ? (activeSegment.productPrompts ?? [])
    : segments.flatMap((s: AudienceSegment) => s.productPrompts ?? []);

  const hasData = segments.length > 0 || clusters.length > 0;

  if (!hasData) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>🗺️</div>
        <p style={{ color: '#4A4A6A', fontSize: 13 }}>
          Run an analysis to populate the Journey panel. Audience segments and keyword clusters are required.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4A4A6A', marginBottom: 5 }}>
          Foundation · 04
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#DCDCF4', margin: 0 }}>Audience Journeys</h2>
        <p style={{ fontSize: 12, color: '#5A5A80', marginTop: 5 }}>
          How each segment moves from life-problem search to product decision &mdash; mapped against keyword clusters and content gaps.
        </p>
      </div>

      {/* Segment tabs */}
      {tabs.length > 1 && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 22, borderBottom: '1px solid #1A1A30', paddingBottom: 0 }}>
          {tabs.map((tab: { id: string; label: string }, tabIdx: number) => {
            const isActive = activeTab === tab.id;
            const tSeg = tab.id !== 'combined' ? segments.find((s: AudienceSegment) => s.id === tab.id) : null;
            const tAccent = tSeg ? SEGMENT_ACCENTS[(tabIdx - 1) % SEGMENT_ACCENTS.length] : null;
            const activeColor = tAccent ? tAccent.text : '#8080A0';
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '9px 15px', fontSize: 12, fontWeight: isActive ? 700 : 500,
                  color: isActive ? activeColor : '#4A4A6A',
                  background: 'transparent', border: 'none',
                  borderBottom: isActive ? `2px solid ${activeColor}` : '2px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', marginBottom: -1,
                }}
              >
                {tab.label}
                {tSeg && (
                  <span style={{
                    marginLeft: 5, fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: isActive ? tAccent!.bg : 'rgba(50,50,60,0.3)',
                    color: isActive ? tAccent!.text : '#4A4A6A', fontWeight: 600,
                  }}>
                    {tSeg.volumePct}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Segment tagline */}
      {activeSegment && segAccent && (
        <div style={{
          background: 'rgba(60,60,80,0.06)', border: '1px solid #1A1A30',
          borderRadius: 10, padding: '13px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: segAccent.bg, border: `1px solid ${segAccent.border}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="ti ti-user" style={{ color: segAccent.text, fontSize: 15 }} />
          </div>
          <div>
            <p style={{ fontSize: 11, color: '#6A6A88', marginBottom: 4 }}>{activeSegment.whoTheyAre.trigger}</p>
            <p style={{ fontSize: 12, color: '#9090B0', fontStyle: 'italic' }}>&ldquo;{activeSegment.tagline}&rdquo;</p>
          </div>
        </div>
      )}

      {/* Lanes */}
      <PreProductLane prompts={preLLMPrompts} clusters={clusters} />
      <ProductJourneyLane prompts={productPrompts} clusters={clusters} />
    </div>
  );
}
