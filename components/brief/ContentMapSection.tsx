'use client';

import { useMemo, useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';
type JourneyType  = 'pre-product' | 'product';
type GapType      = 'missing' | 'competitor-gap' | 'partial';

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

interface ContentGap {
  id:              string;
  segmentId:       string;
  segmentName:     string;
  stage:           JourneyStage;
  journeyType:     JourneyType;
  clusterName:     string;
  clusterType:     string;
  monthlyVolume:   number;
  annualVolume:    number;
  clientCovPct:    number;
  gapType:         GapType;
  priorityScore:   number;
  topCompetitor:   string | null;
  keywords:        string[];
  contentAngle:    string;
  contentFormat:   string;
}

interface Props {
  projectId:   string;
  analysis:    any;
  competitors: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNEY_STAGE_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
const STAGE_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};
const STAGE_COLORS: Record<JourneyStage, { border: string; text: string; bg: string }> = {
  awareness:     { border: '#22d3ee', text: '#22d3ee', bg: 'rgba(34,211,238,0.08)'  },
  consideration: { border: '#a78bfa', text: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  decision:      { border: '#34d399', text: '#34d399', bg: 'rgba(52,211,153,0.08)'  },
  retention:     { border: '#f59e0b', text: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
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

// ─── Branded detection (mirrors JourneySection / ThemeClustersPanel) ──────────

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
  const baseBrands = [clientDomain, ...competitorDomains].map(extractBrand).filter((b: string) => b.length >= 4);
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

const TRANSACTIONAL_SIGNALS = ['near me','near ','schedule','book ','booking','appointment','consultation','how much does','how much is','how much','cost','price','pricing','financing','payment plan','afford','discount','coupon','deal','specials','locations','location','find a ','get a '];
const COMMERCIAL_SIGNALS    = ['review','reviews','best ','top ',' vs ','versus','compare','comparison','before after','before and after','results','worth it','pros and cons','alternative','rating','ratings','testimonial','testimonials','complaints','side effects','risks','dangers','safe ','safety'];
const INFORMATIONAL_SIGNALS = ['what is ','what are ','how does','how do','how to','why ','guide',' tips','recovery','benefits','difference between','types of','explained','overview','about ','definition','learn','understanding','causes','symptoms'];

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

function classifyJourneyType(cluster: { type: string; subClusters: IntentCluster[] }): JourneyType {
  if (cluster.type === 'brand' || cluster.type === 'location') return 'product';
  const volByIntent: Record<string, number> = {};
  for (const sc of cluster.subClusters) volByIntent[sc.intent] = (volByIntent[sc.intent] ?? 0) + sc.totalVolume;
  const dominant = Object.entries(volByIntent).sort((a, b) => b[1] - a[1])[0]?.[0];
  return dominant === 'informational' ? 'pre-product' : 'product';
}

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
  categories.forEach((c: { name: string }) => catMap.set(c.name, []));
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
        intent, stage: INTENT_META[intent].stage, keywords: items,
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

// ─── Content angle rules (deterministic, no AI) ───────────────────────────────

function deriveContentAngle(
  cluster: ThemeCluster,
  stage: JourneyStage,
  journeyType: JourneyType,
  segmentTrigger: string,
): string {
  if (journeyType === 'pre-product') {
    return `Educational guide targeting "${segmentTrigger}" — intercept before they know the product category exists`;
  }
  switch (stage) {
    case 'awareness':
      return `Category introduction: what is ${cluster.name} and who needs it — broad organic discovery`;
    case 'consideration':
      return `Comparison guide: ${cluster.name} vs alternatives — objection handling for ${segmentTrigger}`;
    case 'decision':
      return `High-intent landing page for ${cluster.name} — direct response for searchers ready to act`;
    case 'retention':
      return `Brand authority content: ${cluster.name} resources for existing and returning customers`;
    default:
      return `Content targeting ${cluster.name} at the ${stage} stage`;
  }
}

function deriveContentFormat(stage: JourneyStage, journeyType: JourneyType): string {
  if (journeyType === 'pre-product') return 'Long-form blog / educational article';
  switch (stage) {
    case 'awareness':     return 'Blog post / guide';
    case 'consideration': return 'Comparison page / review content';
    case 'decision':      return 'Service / landing page';
    case 'retention':     return 'Brand / resource page';
    default:              return 'Content page';
  }
}

// ─── Build content gaps ───────────────────────────────────────────────────────

function buildContentGaps(
  clusters: ThemeCluster[],
  segments: AudienceSegment[],
): ContentGap[] {
  const gaps: ContentGap[] = [];

  // For each cluster × stage × segment, check if there is a gap
  for (const cluster of clusters) {
    const stagesWithData = new Set(cluster.subClusters.map((sc: IntentCluster) => sc.stage));
    // Also include pre-product as a virtual stage for pre-product clusters
    const stagesToCheck: Array<{ stage: JourneyStage; journeyType: JourneyType }> =
      cluster.journeyType === 'pre-product'
        ? [{ stage: 'awareness', journeyType: 'pre-product' }]
        : JOURNEY_STAGE_ORDER.filter((s: JourneyStage) => stagesWithData.has(s)).map((s: JourneyStage) => ({ stage: s, journeyType: 'product' }));

    for (const { stage, journeyType } of stagesToCheck) {
      const stageSubs = cluster.subClusters.filter((sc: IntentCluster) => sc.stage === stage);
      const totalVol   = stageSubs.reduce((s: number, sc: IntentCluster) => s + sc.totalVolume, 0) || cluster.totalVolume;
      const clientVol  = stageSubs.reduce((s: number, sc: IntentCluster) => s + sc.clientVolume, 0);
      const compVol    = stageSubs.reduce((s: number, sc: IntentCluster) => s + sc.competitorVolume, 0);
      const clientPct  = totalVol > 0 ? Math.round((clientVol / totalVol) * 100) : 0;

      // Only flag as a gap if there is opportunity
      let gapType: GapType | null = null;
      if (clientVol === 0 && compVol > 0)          gapType = 'competitor-gap';
      else if (clientVol === 0 && compVol === 0)    gapType = 'missing';
      else if (clientPct < 50 && compVol > 0)       gapType = 'partial';

      if (!gapType) continue;

      // Find top competitor for this stage
      const compMap: Record<string, number> = {};
      for (const sc of stageSubs) {
        for (const kw of sc.keywords.filter((k: KwItem) => k.isGap && k.competitor)) {
          compMap[kw.competitor!] = (compMap[kw.competitor!] ?? 0) + kw.searchVolume;
        }
      }
      const topComp = Object.entries(compMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      // Priority score: higher volume + worse coverage = higher priority
      const gapWeight = gapType === 'competitor-gap' ? 3 : gapType === 'partial' ? 2 : 1;
      const priorityScore = Math.round((totalVol / 1000) * gapWeight * (1 - clientPct / 100));

      // Representative keywords
      const keywords = stageSubs.flatMap((sc: IntentCluster) => sc.keywords.map((k: KwItem) => k.keyword)).slice(0, 5);

      // Generate one gap per segment (they each have slightly different angles)
      const segsToUse = segments.length > 0 ? segments : [{ id: 'all', name: 'All Segments', tagline: '', volumePct: 100, whoTheyAre: { demographics: '', trigger: cluster.name }, preLLMPrompts: [], productPrompts: [] }];

      for (const seg of segsToUse) {
        const contentAngle = deriveContentAngle(cluster, stage, journeyType, seg.whoTheyAre.trigger || cluster.name);
        gaps.push({
          id:            `${cluster.id}-${stage}-${seg.id}`,
          segmentId:     seg.id,
          segmentName:   seg.name,
          stage,
          journeyType,
          clusterName:   cluster.name,
          clusterType:   cluster.type,
          monthlyVolume: totalVol,
          annualVolume:  totalVol * 12,
          clientCovPct:  clientPct,
          gapType,
          priorityScore: Math.round(priorityScore * (seg.volumePct / 100)),
          topCompetitor: topComp,
          keywords,
          contentAngle,
          contentFormat: deriveContentFormat(stage, journeyType),
        });
      }
    }
  }

  // Sort by priority descending
  gaps.sort((a, b) => b.priorityScore - a.priorityScore);
  return gaps;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function gapLabel(g: GapType): { text: string; bg: string; color: string; border: string } {
  switch (g) {
    case 'competitor-gap': return { text: 'COMPETITOR GAP', bg: 'rgba(239,68,68,0.1)',  color: '#f87171', border: 'rgba(239,68,68,0.25)' };
    case 'missing':        return { text: 'MISSING',        bg: 'rgba(249,115,22,0.1)', color: '#fb923c', border: 'rgba(249,115,22,0.25)' };
    case 'partial':        return { text: 'PARTIAL',        bg: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)' };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: '#0D0D1E', border: '1px solid #1A1A30', borderRadius: 10, padding: '16px 20px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#4A4A6A', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: '#DCDCF4', margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#5A5A80', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function ArticleBriefCard({ gap, segIdx }: { gap: ContentGap; segIdx: number }) {
  const stageColors  = STAGE_COLORS[gap.stage];
  const segAccent    = SEGMENT_ACCENTS[segIdx % SEGMENT_ACCENTS.length];
  const gapStyle     = gapLabel(gap.gapType);

  return (
    <div style={{ background: '#0D0D1E', border: '1px solid #1A1A30', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top row: stage + gap type + priority */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: stageColors.bg, color: stageColors.text, border: `1px solid ${stageColors.border}40`, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
          {gap.journeyType === 'pre-product' ? 'Pre-Product' : STAGE_LABELS[gap.stage]}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: gapStyle.bg, color: gapStyle.color, border: `1px solid ${gapStyle.border}`, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          {gapStyle.text}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#8080A0' }}>
          Priority {gap.priorityScore}
        </span>
      </div>

      {/* Cluster / topic */}
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#D0D0F0', margin: 0, lineHeight: 1.3 }}>{gap.clusterName}</p>
        <p style={{ fontSize: 11, color: '#5A5A80', marginTop: 4 }}>{gap.contentFormat}</p>
      </div>

      {/* Segment served */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#4A4A6A' }}>Segment:</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: segAccent.bg, color: segAccent.text, border: `1px solid ${segAccent.border}30`, fontWeight: 600 }}>
          {gap.segmentName}
        </span>
      </div>

      {/* Content angle */}
      <div style={{ background: '#080814', border: '1px solid #151528', borderRadius: 7, padding: '10px 12px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: '#3A3A5A', marginBottom: 5 }}>Content Angle</p>
        <p style={{ fontSize: 11, color: '#8080B0', lineHeight: 1.5, margin: 0 }}>{gap.contentAngle}</p>
      </div>

      {/* Keywords */}
      {gap.keywords.length > 0 && (
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.09em', color: '#3A3A5A', marginBottom: 5 }}>Target Keywords</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {gap.keywords.map((kw: string, i: number) => (
              <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#0A0A18', border: '1px solid #1A1A30', color: '#6060A0', fontFamily: 'monospace' }}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, paddingTop: 8, borderTop: '1px solid #121224' }}>
        <div>
          <p style={{ fontSize: 9, color: '#3A3A5A', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Monthly Vol</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#8080B0' }}>{fmtVol(gap.monthlyVolume)}</p>
        </div>
        <div>
          <p style={{ fontSize: 9, color: '#3A3A5A', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Annual Vol</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#8080B0' }}>{fmtVol(gap.annualVolume)}</p>
        </div>
        {gap.topCompetitor && (
          <div>
            <p style={{ fontSize: 9, color: '#3A3A5A', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Top Competitor</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#f87171' }}>{gap.topCompetitor.replace(/^www\./, '').split('.')[0]}</p>
          </div>
        )}
        <div>
          <p style={{ fontSize: 9, color: '#3A3A5A', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Client Coverage</p>
          <p style={{ fontSize: 13, fontWeight: 700, color: gap.clientCovPct > 50 ? '#34d399' : '#f87171' }}>{gap.clientCovPct}%</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContentMapSection({ projectId, analysis, competitors }: Props) {
  const [claudeAssignments,  setClaudeAssignments]  = useState<Record<string, IntentType>>({});
  const [uploadedKeywords,   setUploadedKeywords]   = useState<any[]>([]);
  const [filterStage,   setFilterStage]   = useState<JourneyStage | 'all'>('all');
  const [filterSegment, setFilterSegment] = useState<string>('all');
  const [filterGap,     setFilterGap]     = useState<GapType | 'all'>('all');
  const [view,          setView]          = useState<'table' | 'briefs'>('briefs');

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

  const allGaps = useMemo(() => buildContentGaps(clusters, segments), [clusters, segments]);

  const filteredGaps = useMemo(() => allGaps.filter((g: ContentGap) => {
    if (filterStage   !== 'all' && g.stage      !== filterStage)   return false;
    if (filterSegment !== 'all' && g.segmentId  !== filterSegment) return false;
    if (filterGap     !== 'all' && g.gapType    !== filterGap)     return false;
    return true;
  }), [allGaps, filterStage, filterSegment, filterGap]);

  // De-dupe for article briefs: one brief per cluster × stage (not per segment)
  const uniqueBriefs = useMemo(() => {
    const seen = new Set<string>();
    return filteredGaps.filter((g: ContentGap) => {
      const key = `${g.clusterName}-${g.stage}-${g.journeyType}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [filteredGaps]);

  const totalVol  = allGaps.reduce((s: number, g: ContentGap) => s + g.monthlyVolume, 0);
  const compGaps  = allGaps.filter((g: ContentGap) => g.gapType === 'competitor-gap').length;
  const missingGaps = allGaps.filter((g: ContentGap) => g.gapType === 'missing').length;

  // Unique article count (de-duped by cluster × stage)
  const uniqueArticleCount = useMemo(() => {
    const seen = new Set<string>();
    for (const g of allGaps) seen.add(`${g.clusterName}-${g.stage}-${g.journeyType}`);
    return seen.size;
  }, [allGaps]);

  const hasData = clusters.length > 0;

  if (!hasData) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>📋</div>
        <p style={{ color: '#4A4A6A', fontSize: 13 }}>
          Run an analysis to populate the Content Plan. Keyword clusters are required.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4A4A6A', marginBottom: 5 }}>
          Foundation · 05
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#DCDCF4', margin: 0 }}>Content Plan</h2>
        <p style={{ fontSize: 12, color: '#5A5A80', marginTop: 5 }}>
          Every content gap identified across segments, journey stages, and keyword clusters &mdash; with prioritised article briefs.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <StatCard label="Articles Needed" value={String(uniqueArticleCount)} sub="Unique cluster × stage gaps" />
        <StatCard label="Competitor Gaps" value={String(compGaps)} sub="Competitor ranks, client doesn't" />
        <StatCard label="Missing Content" value={String(missingGaps)} sub="No ranking by anyone yet" />
        <StatCard label="Monthly Volume at Stake" value={fmtVol(totalVol)} sub={`${fmtVol(totalVol * 12)}/yr uncaptured`} />
      </div>

      {/* Filters + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* View toggle */}
        <div style={{ display: 'flex', background: '#0A0A18', border: '1px solid #1A1A30', borderRadius: 7, overflow: 'hidden', marginRight: 8 }}>
          {(['briefs', 'table'] as const).map((v: 'briefs' | 'table') => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 14px', fontSize: 11, fontWeight: view === v ? 700 : 500,
              color: view === v ? '#DCDCF4' : '#4A4A6A', background: view === v ? '#1A1A30' : 'transparent',
              border: 'none', cursor: 'pointer', textTransform: 'capitalize' as const,
            }}>
              {v === 'briefs' ? '📄 Briefs' : '📊 Table'}
            </button>
          ))}
        </div>

        {/* Stage filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', ...JOURNEY_STAGE_ORDER] as const).map((s: JourneyStage | 'all') => {
            const isActive = filterStage === s;
            const colors = s !== 'all' ? STAGE_COLORS[s] : null;
            return (
              <button key={s} onClick={() => setFilterStage(s)} style={{
                padding: '4px 10px', fontSize: 10, fontWeight: isActive ? 700 : 500, borderRadius: 5,
                background: isActive ? (colors ? colors.bg : '#1A1A30') : 'transparent',
                color: isActive ? (colors ? colors.text : '#D0D0F0') : '#4A4A6A',
                border: `1px solid ${isActive ? (colors ? colors.border + '40' : '#2A2A40') : '#1A1A30'}`,
                cursor: 'pointer',
              }}>
                {s === 'all' ? 'All Stages' : STAGE_LABELS[s]}
              </button>
            );
          })}
        </div>

        {/* Gap type filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'competitor-gap', 'missing', 'partial'] as const).map((g: GapType | 'all') => {
            const isActive = filterGap === g;
            const gStyle = g !== 'all' ? gapLabel(g) : null;
            return (
              <button key={g} onClick={() => setFilterGap(g)} style={{
                padding: '4px 10px', fontSize: 10, fontWeight: isActive ? 700 : 500, borderRadius: 5,
                background: isActive ? (gStyle ? gStyle.bg : '#1A1A30') : 'transparent',
                color: isActive ? (gStyle ? gStyle.color : '#D0D0F0') : '#4A4A6A',
                border: `1px solid ${isActive ? (gStyle ? gStyle.border : '#2A2A40') : '#1A1A30'}`,
                cursor: 'pointer',
              }}>
                {g === 'all' ? 'All Gaps' : gapLabel(g as GapType).text}
              </button>
            );
          })}
        </div>

        {/* Segment filter */}
        {segments.length > 0 && (
          <select
            value={filterSegment}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterSegment(e.target.value)}
            style={{
              padding: '5px 10px', fontSize: 10, background: '#0A0A18', border: '1px solid #1A1A30',
              borderRadius: 5, color: '#8080A0', cursor: 'pointer',
            }}
          >
            <option value="all">All Segments</option>
            {segments.map((s: AudienceSegment) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4A4A6A' }}>
          {filteredGaps.length} gap{filteredGaps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table view */}
      {view === 'table' && (
        <div style={{ background: '#0A0A18', border: '1px solid #1A1A30', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1A1A30' }}>
                {['Segment', 'Stage', 'Cluster', 'Gap Type', 'Monthly Vol', 'Annual Vol', 'Coverage', 'Priority'].map((h: string) => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#4A4A6A', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredGaps.map((gap: ContentGap, i: number) => {
                const segIdx  = segments.findIndex((s: AudienceSegment) => s.id === gap.segmentId);
                const sAccent = SEGMENT_ACCENTS[segIdx >= 0 ? segIdx % SEGMENT_ACCENTS.length : 0];
                const sc      = STAGE_COLORS[gap.stage];
                const gl      = gapLabel(gap.gapType);
                return (
                  <tr key={gap.id} style={{ borderBottom: '1px solid #0D0D1A', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: sAccent.bg, color: sAccent.text, border: `1px solid ${sAccent.border}25`, fontWeight: 600 }}>
                        {gap.segmentName}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: sc.bg, color: sc.text, fontWeight: 600 }}>
                        {gap.journeyType === 'pre-product' ? 'Pre-Product' : STAGE_LABELS[gap.stage]}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#C0C0E0', fontWeight: 500 }}>{gap.clusterName}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: gl.bg, color: gl.color, border: `1px solid ${gl.border}`, fontWeight: 700 }}>
                        {gl.text}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#8080A0', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(gap.monthlyVolume)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#8080A0', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(gap.annualVolume)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: gap.clientCovPct > 50 ? '#34d399' : '#f87171', fontWeight: 700 }}>{gap.clientCovPct}%</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#8080A0', fontWeight: 700 }}>{gap.priorityScore}</td>
                  </tr>
                );
              })}
              {filteredGaps.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: '#3A3A5A', fontStyle: 'italic' }}>No gaps match the current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Briefs view */}
      {view === 'briefs' && (
        <div>
          {uniqueBriefs.length === 0 && (
            <p style={{ fontSize: 12, color: '#3A3A5A', fontStyle: 'italic', textAlign: 'center', padding: 24 }}>No briefs match the current filters</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {uniqueBriefs.map((gap: ContentGap) => {
              const segIdx = segments.findIndex((s: AudienceSegment) => s.id === gap.segmentId);
              return <ArticleBriefCard key={gap.id} gap={gap} segIdx={segIdx >= 0 ? segIdx : 0} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
