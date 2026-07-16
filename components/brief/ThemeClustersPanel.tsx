'use client';

import { useMemo, useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { buildKwPool, isBrandedKeyword, extractBrand, buildCompetitorBrandTokens, textHasCompetitorBrand, buildExcludedBrandTokens } from '@/lib/utils/kwVolume';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';   // v7.226: shared competitor-brand category guard (Const III.1a)
import { buildTaxonomyTree, type TaxoTreeNode } from '@/lib/category/taxonomyTree';   // v7.239: ONE shared tree builder — same source as the Keyword panel (Const II.7)
import SegmentDownloadButton from './SegmentDownloadButton';   // v7.328: per-segment XLSX download
import { exportSegmentXLSX, type ExportTopicRow } from '@/lib/export/topicExport';   // v7.328
import { InsightStack } from './InsightBanner';   // v7.366: insight-sentence layer
import { demandInversionInsight, funnelBlindSpotInsight } from '@/lib/insights';   // v7.366 (G1 · G8)

// ── v7.376: the canonical cluster-topic build chain moved VERBATIM to ─────────
// lib/clusters/canonical.ts so the assessment-report route builds the SAME
// canonical topics server-side (Const II.6/II.7). Everything is imported back
// here and the previously-exported names are re-exported, so every existing
// consumer of this module keeps working unchanged.
import {
  INTENT_META, JOURNEY_ORDER, JOURNEY_LABELS, isCoreKey,
  buildThemeClusters, buildPreProductClusters, flattenTopics,
  detectIntentSignal as _detectIntentSignal,
  buildTopicsFromTaxonomy as _buildTopicsFromTaxonomy,
  buildCanonicalClusterTopics as _buildCanonicalClusterTopics,
  type IntentType as _IntentType, type JourneyStage, type KwItem as _KwItem,
  type IntentCluster, type ThemeCluster, type Topic as _Topic,
} from '@/lib/clusters/canonical';
export type IntentType = _IntentType;
export type KwItem = _KwItem;
export type Topic = _Topic;
export const detectIntentSignal = _detectIntentSignal;
export const buildTopicsFromTaxonomy = _buildTopicsFromTaxonomy;
export const buildCanonicalClusterTopics = _buildCanonicalClusterTopics;

// ─── Types ────────────────────────────────────────────────────────────────────


interface Props {
  projectId:                string;
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  analysis:                 any;
  competitors:              string[];
  // v7.336 (QC audit B5, Const I.6): these project-default volume thresholds are NO
  // LONGER applied to this panel's cluster build. The shared canonical-topic basis is
  // UNFLOORED (thresholds 0,0 — completeness by default) everywhere a shared total is
  // computed, and this panel was the one consumer still flooring it, so its topic/keyword
  // counts diverged from the page-level Journey build, Exec, Content Map, Content Plan and
  // Scope (all 0,0) whenever a project set thresholds. Props kept for API stability
  // (page.tsx still passes them); per-panel thresholds remain view-level filters where a
  // panel explicitly offers them.
  defaultClientThreshold?:     number;
  defaultCompetitorThreshold?: number;
  // v7.220: the page-level Claude intent-assignment map (single source of truth, Const
  // II.7). When supplied (non-empty) the panel uses it instead of its own pass, so the
  // Cluster panel, Journey and Content panels all build clusters from the SAME map and
  // their topic counts reconcile. Falls back to the panel's own pass when absent.
  claudeAssigns?:           Record<string, IntentType>;
}

// ─── Competitor colour palette ────────────────────────────────────────────────

const COMP_COLORS = ['var(--c-6c63ff)', 'var(--c-f59e0b)', 'var(--c-22c55e)', 'var(--c-38bdf8)', 'var(--c-f472b6)', 'var(--c-a78bfa)', 'var(--c-fb923c)'];
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
      color: COMP_COLORS[i + 1] ?? 'var(--c-888888)',
    })),
  ];

  const cardStyle: React.CSSProperties = {
    background:   'var(--c-0f0f1e)',
    border:       `1px solid ${isDemand ? 'var(--c-0e3038)' : isLeading ? 'var(--c-1c2c1c)' : 'var(--c-2c1c1c)'}`,
    borderRadius: 12,
    padding:      '16px',
    cursor:       'pointer',
    transition:   'border-color 0.15s',
  };

  return (
    <div
      style={cardStyle}
      onClick={() => setExpanded(v => !v)}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isDemand ? 'var(--c-155e6b)' : isLeading ? 'var(--c-2a4a2a)' : 'var(--c-4a2a2a)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isDemand ? 'var(--c-0e3038)' : isLeading ? 'var(--c-1c2c1c)' : 'var(--c-2c1c1c)'; }}
    >
      {/* ── Header: name + badge ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--c-d8d8f8)', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
        }}>
          {cluster.name}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.06em', flexShrink: 0,
          padding: '3px 8px', borderRadius: 20, textTransform: 'uppercase',
          ...(isDemand
            ? { background: 'var(--c-062a32)', border: '1px solid var(--c-0e4753)', color: 'var(--c-22d3ee)' }
            : isLeading
            ? { background: 'var(--c-0d2010)', border: '1px solid var(--c-1a4020)', color: 'var(--c-4ade80)' }
            : { background: 'var(--c-2a0d18)', border: '1px solid var(--c-4a1a28)', color: 'var(--c-f472b6)' }),
        }}>
          {isDemand ? 'Missing demand' : isLeading ? 'Leading' : 'Trailing'}
        </span>
      </div>

      {/* ── Sub-header stats ── */}
      <div style={{ fontSize: 10, color: 'var(--c-484868)', marginBottom: 14 }}>
        {cluster.keywords.length} kws &nbsp;·&nbsp; {rankedKws.length} ranked
        {avgRank !== null && <> &nbsp;·&nbsp; Avg #{avgRank}</>}
      </div>

      {/* ── v7.168: same-intent deep-journey demand merged into this cluster ── */}
      {!isDemand && (cluster.demandMergedCount ?? 0) > 0 && (
        <div style={{ fontSize: 10, color: 'var(--c-22d3ee)', marginTop: -8, marginBottom: 14 }}>
          + {cluster.demandMergedCount} deep-journey demand kw{(cluster.demandMergedCount ?? 0) === 1 ? '' : 's'}
          &nbsp;·&nbsp; {fmtVol(cluster.demandMergedVol ?? 0)}/mo
        </div>
      )}

      {/* ── Big metric: content coverage ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 42, fontWeight: 700, color: 'var(--c-d8d8f8)', lineHeight: 1, letterSpacing: '-1px' }}>
            {clientCovPct}%
          </span>
          <span style={{ fontSize: 11, color: 'var(--c-505070)', lineHeight: 1.3 }}>
            Content coverage<br />
            <span style={{ color: 'var(--c-6a6a90)' }}>{rankedKws.length} of {cluster.keywords.length} kws</span>
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--c-404060)', marginTop: 6 }}>
          {isDemand ? (
            <>Deep-journey demand · <strong style={{ color: 'var(--c-22d3ee)' }}>not yet owned</strong></>
          ) : (
            <>Leader: <strong style={{ color: isLeading ? 'var(--c-4ade80)' : 'var(--c-f472b6)' }}>{leaderName}</strong>
            <span style={{ color: 'var(--c-484868)' }}> ({leaderPct}%)</span></>
          )}
        </div>
      </div>

      {/* ── Rank stat ── */}
      {avgRank !== null ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '6px 10px', background: 'var(--c-0a0a16)', borderRadius: 6,
          border: '1px solid var(--c-1a1a2c)',
        }}>
          <i className="ti ti-trending-up" style={{ fontSize: 12, color: 'var(--c-6c63ff)', flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: 'var(--c-6a6a90)' }}>Avg Google rank </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-9b96ff)' }}>#{avgRank}</span>
          </div>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 600,
            ...(avgRank <= 10
              ? { background: 'var(--c-0d2010)', border: '1px solid var(--c-1a4020)', color: 'var(--c-4ade80)' }
              : { background: 'var(--c-1c1408)', border: '1px solid var(--c-342507)', color: 'var(--c-f59e0b)' }),
          }}>
            {avgRank <= 3 ? 'Top 3' : avgRank <= 10 ? 'Page 1' : avgRank <= 20 ? 'Page 2' : 'Page 3+'}
          </span>
        </div>
      ) : (
        <div style={{
          fontSize: 10, color: 'var(--c-383858)', marginBottom: 12,
          padding: '6px 10px', background: 'var(--c-0a0a14)', borderRadius: 6,
          border: '1px solid var(--c-141428)',
        }}>
          <i className="ti ti-ban" style={{ fontSize: 11, marginRight: 5 }} aria-hidden="true" />
          Not ranking for any keywords in this cluster
        </div>
      )}

      {/* ── Segmented bar ── */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--c-1a1a30)', marginBottom: 8 }}>
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
            <span style={{ fontSize: 10, color: 'var(--c-484868)' }}>
              {seg.name} <span style={{ color: 'var(--c-6a6a90)' }}>{pct(seg.vol, totalVol)}%</span>
            </span>
          </div>
        ))}
      </div>

      {/* ── Expanded keyword list ── */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--c-1a1a2c)', paddingTop: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-2e2e50)', marginBottom: 6 }}>
            Keywords
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {/* v7.104: cap chips — clusters can hold thousands of keywords on large uploaded footprints */}
            {cluster.keywords.slice(0, 300).map(kw => (
              <span key={kw.keyword} style={{
                fontSize: 9,
                background: kw.isGap ? 'var(--c-1a1008)' : 'var(--c-0f0f22)',
                border: `1px solid ${kw.isGap ? 'var(--c-3a2508)' : 'var(--c-1e1e38)'}`,
                borderRadius: 4, padding: '2px 7px',
                color: kw.isGap ? 'var(--c-c99c4a)' : 'var(--c-555570)',
              }}>
                {kw.keyword}
                {kw.position !== null && (
                  <span style={{ color: 'var(--c-22c55e)', marginLeft: 4 }}>#{kw.position}</span>
                )}
              </span>
            ))}
          {cluster.keywords.length > 300 && (
              <span style={{ fontSize: 9, color: 'var(--c-444468)', padding: '2px 7px' }}>
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

// ─── Topic model (v7.169) ─────────────────────────────────────────────────────
// Wayne's definition: a "cluster" is ONE TOPIC = a small group of similar-intent
// keywords about a single theme. That is exactly a category's intent sub-cluster.
// So we flatten every category into its theme × intent TOPICS and count/filter on
// those — the same unit the Audience Journey uses (theme × funnel-stage node), so
// the two panels finally line up. Categories become section headers; topics are
// the cards inside them.
interface TopicStat {
  topic:             Topic;
  isLeading:         boolean;
  compGapPct:        number;
  stage:             JourneyStage;
  isClientFootprint: boolean;
  isDemand:          boolean;
}

// topic that merely ABSORBED some same-intent demand keeps its footprint ownership.
function classifyTopic(t: Topic): TopicStat {
  const isDemand = t.parentType === 'demand'
    || (t.keywords.length > 0 && t.keywords.every(k => k.origin === 'demand'));

  const footprintKws = t.keywords.filter(k => k.origin !== 'demand');
  const rankedVol = footprintKws
    .filter(k => k.position !== null && k.position <= 20)
    .reduce((s, k) => s + k.searchVolume, 0);

  const compVolByDom: Record<string, number> = {};
  for (const kw of t.keywords.filter(k => k.isGap)) {
    const d = kw.competitor ?? 'Unknown';
    compVolByDom[d] = (compVolByDom[d] ?? 0) + kw.searchVolume;
  }
  const compVals = Object.values(compVolByDom);
  const topComp  = compVals.length > 0 ? Math.max(...compVals) : 0;
  const gapVol   = t.keywords.filter(k => k.isGap).reduce((s, k) => s + k.searchVolume, 0);
  const compGapPct = t.totalVolume > 0 ? gapVol / t.totalVolume : 0;

  const clientKwCount = footprintKws.filter(k => !k.isGap).length;
  const gapKwCount    = footprintKws.filter(k =>  k.isGap).length;

  return {
    topic: t,
    isLeading: !isDemand && rankedVol >= topComp,
    compGapPct,
    stage: t.stage,   // each topic sits in exactly one funnel stage (its intent)
    isClientFootprint: !isDemand && clientKwCount >= gapKwCount,
    isDemand,
  };
}

// ─── Category type badge metadata (v7.169) ────────────────────────────────────
// v7.200: `headBg` = ~20% tint of the category's own type colour, used to band the
// parent-category header row (card-grid CategorySection + grouped TopicTable header).
// Theme-aware (each --ca var remaps in light mode) so the band stays on-brand in both.
const TYPE_META: Record<'procedure' | 'brand' | 'location' | 'demand' | 'problem', { label: string; color: string; bg: string; bdr: string; headBg: string }> = {
  procedure: { label: 'Procedure',     color: 'var(--c-9b96ff)', bg: 'var(--ca-155-150-255-0_10)', bdr: 'var(--ca-155-150-255-0_30)', headBg: 'var(--ca-155-150-255-0_20)' },
  brand:     { label: 'Brand',         color: 'var(--c-f59e0b)', bg: 'var(--ca-245-158-11-0_10)',  bdr: 'var(--ca-245-158-11-0_30)', headBg: 'var(--ca-245-158-11-0_2)'   },
  location:  { label: 'Location',      color: 'var(--c-38bdf8)', bg: 'var(--ca-56-189-248-0_10)',  bdr: 'var(--ca-56-189-248-0_30)', headBg: 'var(--ca-56-189-248-0_20)'  },
  demand:    { label: 'Missing demand',color: 'var(--c-22d3ee)', bg: 'var(--c-062a32)',                bdr: 'var(--c-0e4753)', headBg: 'var(--ca-34-211-238-0_2)'   },
  // v7.203: pre-product life-problem theme (emerald). Awareness-only per the Constitution (Art III.2a).
  problem:   { label: 'Pre-product',   color: 'var(--c-34d399)', bg: 'var(--ca-52-211-153-0_2)',   bdr: 'var(--c-34d399)',           headBg: 'var(--ca-52-211-153-0_2)'  },
};

// ─── Topic card (v7.169) — one card per theme × intent topic ──────────────────
function TopicCard({ topic, stat, clientDomain }: { topic: Topic; stat: TopicStat; clientDomain: string }) {
  const [expanded, setExpanded] = useState(false);
  const isDemand = stat.isDemand;

  const rankedKws    = topic.keywords.filter(k => k.origin !== 'demand' && k.position !== null && k.position <= 20);
  const clientCovVol = rankedKws.reduce((s, k) => s + k.searchVolume, 0);
  const coverage     = pct(clientCovVol, topic.totalVolume);

  const badge = isDemand
    ? { text: 'Missing demand', bg: 'var(--c-062a32)', bdr: 'var(--c-0e4753)', color: 'var(--c-22d3ee)' }
    : stat.isLeading
    ? { text: 'Winning',  bg: 'var(--c-0d2010)', bdr: 'var(--c-1a4020)', color: 'var(--c-4ade80)' }
    : { text: 'Trailing', bg: 'var(--c-2a0d18)', bdr: 'var(--c-4a1a28)', color: 'var(--c-f472b6)' };

  const stage = STAGE_META[topic.stage];
  const topKws = topic.keywords.slice().sort((a, b) => b.searchVolume - a.searchVolume).slice(0, 12);

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        background: isDemand ? 'var(--c-08161a)' : 'var(--c-101019)',
        border: `1px solid ${isDemand ? 'var(--c-0e3038)' : 'var(--c-1e1e32)'}`,
        borderRadius: 10, padding: '12px 13px', cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isDemand ? 'var(--c-155e6b)' : 'var(--c-34345a)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = isDemand ? 'var(--c-0e3038)' : 'var(--c-1e1e32)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-d8d8f8)', lineHeight: 1.3 }}>
          <i className={`ti ${stage.icon}`} style={{ fontSize: 13, color: 'var(--c-6a6a90)', marginRight: 5, verticalAlign: -1 }} aria-hidden="true" />
          {stage.label} · {INTENT_META[topic.intent].label}
        </span>
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: '.06em', flexShrink: 0, textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 20, background: badge.bg, border: `1px solid ${badge.bdr}`, color: badge.color,
        }}>{badge.text}</span>
      </div>

      <div style={{ fontSize: 10, color: 'var(--c-5a5a78)' }}>{topic.contentType}</div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 9 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--c-e8e8ff)', lineHeight: 1, letterSpacing: '-.5px' }}>{topic.keywords.length}</span>
        <span style={{ fontSize: 10, color: 'var(--c-505070)' }}>keywords · {fmtVol(topic.totalVolume)}/mo</span>
      </div>

      <div style={{ fontSize: 10, color: 'var(--c-484868)', marginTop: 6 }}>
        {isDemand
          ? <>Deep-journey demand · <span style={{ color: 'var(--c-22d3ee)' }}>not yet owned</span></>
          : <>{coverage}% content coverage · {rankedKws.length} of {topic.keywords.length} ranked</>}
      </div>

      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--c-1c1c2e)', paddingTop: 9, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {topKws.map((k, i) => (
            <span key={i} style={{
              fontSize: 10, color: k.origin === 'demand' ? 'var(--c-22d3ee)' : k.isGap ? 'var(--c-f59e0b)' : 'var(--c-8ab89a)',
              background: 'var(--c-0c0c16)', border: '1px solid var(--c-1c1c2e)', borderRadius: 5, padding: '2px 6px',
            }}>{k.keyword} · {fmtVol(k.searchVolume)}</span>
          ))}
          {topic.keywords.length > topKws.length && (
            <span style={{ fontSize: 10, color: 'var(--c-404060)', padding: '2px 4px' }}>+{topic.keywords.length - topKws.length} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Category section (v7.169) — header + its topic cards ─────────────────────
function CategorySection({
  cluster, topics, statById, clientDomain,
}: {
  cluster: ThemeCluster; topics: Topic[]; statById: Map<string, TopicStat>; clientDomain: string;
}) {
  const tm = TYPE_META[cluster.type];
  const shownVol = topics.reduce((s, t) => s + t.totalVolume, 0);

  return (
    <div>
      {/* v7.200: parent-category header banded with the category's own type tint (~20%) + left accent */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
        background: tm.headBg, borderLeft: `3px solid ${tm.color}`, borderRadius: 6,
        padding: '9px 12px',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-e2e2f6)' }}>{cluster.name}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 20, background: tm.bg, border: `1px solid ${tm.bdr}`, color: tm.color,
        }}>{tm.label}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--c-8a8ab0)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {topics.length} topic{topics.length === 1 ? '' : 's'} · {fmtVol(shownVol)}/mo
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {topics.map(t => {
          const stat = statById.get(t.id);
          return stat ? <TopicCard key={t.id} topic={t} stat={stat} clientDomain={clientDomain} /> : null;
        })}
      </div>
    </div>
  );
}

// ─── Sortable topic table (v7.190) ───────────────────────────────────────────
type SortKey = 'group' | 'product' | 'stage' | 'kw' | 'vol' | 'coverage' | 'rank' | 'status';
type RowStatus = 'owned' | 'gap' | 'demand';
const STATUS_RANK: Record<RowStatus, number> = { owned: 0, gap: 1, demand: 2 };
const TBL_STATUS: Record<RowStatus, { label: string; color: string; bg: string; bdr: string }> = {
  owned:  { label: 'Footprint',      color: 'var(--c-4ade80)', bg: 'var(--c-0d2010)', bdr: 'var(--c-1a4020)' },
  gap:    { label: 'Competitor gap', color: 'var(--c-f59e0b)', bg: 'var(--c-1c1408)', bdr: 'var(--c-342507)' },
  demand: { label: 'Missing demand', color: 'var(--c-22d3ee)', bg: 'var(--c-062a32)', bdr: 'var(--c-0e4753)' },
};

interface TopicRow { t: Topic; st: TopicStat; m: { cov: number; best: number | null; status: RowStatus } }

function topicMetrics(t: Topic, st: TopicStat): TopicRow['m'] {
  const fp     = t.keywords.filter(k => k.origin !== 'demand');
  const ranked = fp.filter(k => k.position !== null && (k.position as number) <= 20);
  const cov    = pct(ranked.reduce((s, k) => s + k.searchVolume, 0), t.totalVolume);
  const best   = ranked.length ? Math.min(...ranked.map(k => k.position as number)) : null;
  const status: RowStatus = st.isDemand ? 'demand' : st.isClientFootprint ? 'owned' : 'gap';
  return { cov, best, status };
}

const TH_BASE: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: 'var(--c-6a6a90)', borderBottom: '1px solid var(--c-23233a)',
  cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0,
  background: 'var(--c-0b0b15)',
};

// v7.371: Content-Plan "add to cart" for the theme cluster panel. Same shared selection the
// Journey list and Content Map write — a topic (or a whole theme / umbrella) checked here pushes
// its topic id(s) into the ONE content-plan selection the Content Plan sub-nav reads (Const II.7).
// The taxonomy topic id (`Topic.id`, e.g. `tax:<node>` / `<cluster>::<intent>`) IS the
// ContentTopic.id the plan is keyed by, so a check here and a check on the Journey/Content-Map row
// toggle the exact same entry.
//
// v7.372 FIX: the write is a serialized READ-MODIFY-WRITE against fresh server state — not a
// full-set-replace from a local copy. The v7.371 version PUT this panel's own `planIds` as the
// whole selection; if that copy was stale (another panel had added topics, or a rapid earlier
// click raced), the PUT overwrote the real selection and dropped everything it didn't know about,
// and an "uncheck" whose local state was wrong would re-add instead of remove. Now each toggle
// re-reads the current selection, applies ONLY its own add/remove delta, writes, and resyncs local
// from the server's returned set — so cross-panel selections are never clobbered (Const I.1).
function useContentPlanSelection(projectId: string, kwVersion: number) {
  const [planIds,   setPlanIds]   = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const selRef = useRef<Set<string>>(new Set());
  // Serialize writes so overlapping GET→PUT cycles (rapid clicks) can't race the full-replace route.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => { selRef.current = planIds; }, [planIds]);

  // Load / resync the authoritative selection. On mount, on kwVersion change, and on window focus —
  // so the checkboxes reflect selections made in OTHER panels rather than a stale local copy.
  const loadFromServer = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/content-plan`, { cache: 'no-store' });   // always fresh (v7.262)
      const d = r.ok ? await r.json() : { selections: [] };
      const s = new Set<string>(Array.isArray(d.selections) ? d.selections : []);
      selRef.current = s; setPlanIds(s);
    } catch { /* honest gap: leave selection as-is on failure (I.5) */ }
  }, [projectId]);

  useEffect(() => { void loadFromServer(); }, [loadFromServer, kwVersion]);
  useEffect(() => {
    if (!projectId) return;
    const onFocus = () => { void loadFromServer(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [projectId, loadFromServer]);

  // 'none' | 'some' | 'all' over an id list (a topic = [id]; a theme/umbrella = every topic id
  // under it). Drives the checkbox + the indeterminate dash on a partially-added header.
  const planStateForIds = (ids: string[]): 'none' | 'some' | 'all' => {
    if (ids.length === 0) return 'none';
    let inn = 0; for (const k of ids) if (planIds.has(k)) inn++;
    return inn === 0 ? 'none' : inn === ids.length ? 'all' : 'some';
  };
  const savingForIds = (ids: string[]): boolean => ids.some(k => savingIds.has(k));

  // Toggle the given ids. The add-vs-remove decision comes from what the user sees (selRef, updated
  // synchronously so a rapid follow-up click chains correctly); the change is then applied to the
  // CURRENT server set so other panels' selections are preserved. Optimistic; resynced from the
  // PUT response, reverted to true server state on failure.
  const toggleIds = (ids: string[]) => {
    if (!projectId || ids.length === 0) return;
    const inn = ids.reduce((n, id) => n + (selRef.current.has(id) ? 1 : 0), 0);
    const action: 'add' | 'remove' = inn === ids.length ? 'remove' : 'add';

    setSavingIds((s: Set<string>) => { const n = new Set(s); ids.forEach(id => n.add(id)); return n; });
    setPlanIds((prev: Set<string>) => {                                   // optimistic
      const n = new Set(prev);
      if (action === 'remove') ids.forEach(id => n.delete(id));
      else                     ids.forEach(id => n.add(id));
      selRef.current = n; return n;
    });

    chainRef.current = chainRef.current.then(async () => {
      try {
        const gr = await fetch(`/api/projects/${projectId}/content-plan`, { cache: 'no-store' });   // fresh read
        const gd = gr.ok ? await gr.json() : { selections: [] };
        const server = new Set<string>(Array.isArray(gd.selections) ? gd.selections : []);
        if (action === 'remove') ids.forEach(id => server.delete(id));    // apply ONLY this delta
        else                     ids.forEach(id => server.add(id));
        const pr = await fetch(`/api/projects/${projectId}/content-plan`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: Array.from(server) }),
        });
        if (!pr.ok) throw new Error('save failed');
        const pd = await pr.json();
        const saved = new Set<string>(Array.isArray(pd.selections) ? pd.selections : Array.from(server));
        selRef.current = saved; setPlanIds(saved);                        // resync to server truth
      } catch {
        await loadFromServer();                                          // revert optimistic to real state (I.5)
      } finally {
        setSavingIds((s: Set<string>) => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n; });
      }
    }).catch(() => { /* chain never rejects — each op self-heals above */ });
  };
  return { planIds, savingIds, planStateForIds, savingForIds, toggleIds };
}

// v7.371: the "add to cart" box — mirrors the Journey list's PlanCheckbox exactly.
// none → empty, all → green check, some → indeterminate dash. Stops propagation so a row's own
// click (expand / collapse) doesn't also fire. Theme-token colors only (Const IV.6 / V.5).
function PlanCheckbox({ state, saving, onToggle, label, size = 15 }: {
  state: 'none' | 'some' | 'all'; saving: boolean; onToggle: () => void; label: string; size?: number;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={state === 'some' ? 'mixed' : state === 'all'}
      aria-label={label}
      title={state === 'all' ? 'Remove from Content Plan' : 'Add to Content Plan'}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: size, height: size, borderRadius: 4, cursor: 'pointer', boxSizing: 'border-box',
        background: state === 'all' ? 'var(--c-34d399)' : state === 'some' ? 'var(--ca-52-211-153-0_1)' : 'var(--c-0d0d1e)',
        border: `1.4px solid ${state === 'none' ? 'var(--c-4a4a6a)' : 'var(--c-34d399)'}`,
        opacity: saving ? 0.55 : 1, transition: 'all 0.12s',
      }}
    >
      {state === 'all'  && <i className="ti ti-check" style={{ fontSize: size - 5, fontWeight: 700, color: 'var(--c-08080f)' }} aria-hidden="true" />}
      {state === 'some' && <span style={{ width: size - 8, height: 2, borderRadius: 1, background: 'var(--c-34d399)' }} />}
    </span>
  );
}

function TopicTable({
  rows, sortKey, sortDir, onSort, expanded, onToggle, expandedParents, onToggleParent,
  expandedUmbrellas, onToggleUmbrella,
  planEnabled, planStateForIds, savingForIds, toggleIds,
}: {
  rows: TopicRow[]; sortKey: SortKey; sortDir: 1 | -1; onSort: (k: SortKey) => void;
  expanded: Set<string>; onToggle: (id: string) => void;
  // v7.207: parent-collapse — a parent's child rows render only when its name is in
  // expandedParents. Default-collapsed is enforced by the caller (empty set).
  expandedParents: Set<string>; onToggleParent: (name: string) => void;
  // v7.236: umbrella-collapse — the level above theme (mirrors the Keyword tree).
  expandedUmbrellas: Set<string>; onToggleUmbrella: (name: string) => void;
  // v7.371: Content-Plan add-to-cart wiring (from the shared useContentPlanSelection hook).
  planEnabled: boolean;
  planStateForIds: (ids: string[]) => 'none' | 'some' | 'all';
  savingForIds: (ids: string[]) => boolean;
  toggleIds: (ids: string[]) => void;
}) {
  const cols: Array<{ k: SortKey; label: string; align: 'left' | 'right' }> = [
    { k: 'group',    label: 'Theme · product', align: 'left'  },
    { k: 'stage',    label: 'Stage',           align: 'left'  },
    { k: 'kw',       label: 'Keywords',        align: 'right' },
    { k: 'vol',      label: 'Vol/mo',          align: 'right' },
    { k: 'coverage', label: 'Coverage',        align: 'right' },
    { k: 'rank',     label: 'Best rank',       align: 'right' },
    { k: 'status',   label: 'Status',          align: 'left'  },
  ];
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--c-1a1a2c)', borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.k} onClick={() => onSort(c.k)} style={{ ...TH_BASE, textAlign: c.align }}>
                {c.label}
                {sortKey === c.k && (
                  <i className={`ti ti-chevron-${sortDir < 0 ? 'down' : 'up'}`} style={{ fontSize: 12, marginLeft: 4, verticalAlign: -2 }} aria-hidden="true" />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            // v7.194: when sorted by group, render ONE header row per parent theme
            // and indent its child topic rows beneath it — so a parent name shows
            // exactly once (no more repeated "401k & Retirement Planning" rows).
            const grouped = sortKey === 'group';
            // v7.236: theme-level AND umbrella-level aggregates. The umbrella is the stored
            // taxonomy parent (path[0]) — the same top level the Keyword tree shows.
            const agg = new Map<string, { n: number; vol: number }>();
            const umbAgg = new Map<string, { n: number; vol: number }>();
            // v7.371: topic ids under each theme / umbrella, so the header checkbox can toggle
            // the whole group into the Content Plan in one click (keyed exactly like `agg`/`umbAgg`).
            const themeIds = new Map<string, string[]>();
            const umbIds = new Map<string, string[]>();
            for (const r of rows) {
              const a = agg.get(r.t.parentName) ?? { n: 0, vol: 0 };
              a.n += 1; a.vol += r.t.totalVolume; agg.set(r.t.parentName, a);
              const u = umbAgg.get(r.t.umbrella) ?? { n: 0, vol: 0 };
              u.n += 1; u.vol += r.t.totalVolume; umbAgg.set(r.t.umbrella, u);
              (themeIds.get(r.t.parentName) ?? themeIds.set(r.t.parentName, []).get(r.t.parentName)!).push(r.t.id);
              (umbIds.get(r.t.umbrella) ?? umbIds.set(r.t.umbrella, []).get(r.t.umbrella)!).push(r.t.id);
            }
            const out: React.ReactNode[] = [];
            let lastUmbrella: string | null = null;
            let lastParent: string | null = null;
            // v7.207/236: grouped view is a tree — umbrella → theme → topic. A level's children
            // are hidden unless it is expanded (default-collapsed), so the list reads as a
            // navigable index you drill into (mirrors the Keyword panel's Category Breakdown).
            const umbrellaOpen = (name: string) => !grouped || expandedUmbrellas.has(name);
            const parentOpen   = (name: string) => !grouped || expandedParents.has(name);
            rows.forEach(({ t, m }) => {
              // A theme that IS its own umbrella (no stored parent, or brand/location/demand/
              // problem) collapses the two header levels into one — no redundant repeat.
              const selfUmb = t.umbrella === t.parentName;
              if (grouped && t.umbrella !== lastUmbrella) {
                lastUmbrella = t.umbrella; lastParent = null;
                const ua = umbAgg.get(t.umbrella)!;
                const uOpen = expandedUmbrellas.has(t.umbrella);
                out.push(
                  <tr key={`umb:${t.umbrella}`} onClick={() => onToggleUmbrella(t.umbrella)} style={{ cursor: 'pointer' }} aria-expanded={uOpen}>
                    <td colSpan={7} style={{ padding: '10px 12px', background: 'var(--c-0b0b15)', borderLeft: '3px solid var(--c-6c63ff)', borderTop: '1px solid var(--c-1a1a30)', borderBottom: '1px solid var(--c-23233a)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          {planEnabled && (() => { const ids = umbIds.get(t.umbrella) ?? []; return (
                            <PlanCheckbox state={planStateForIds(ids)} saving={savingForIds(ids)} onToggle={() => toggleIds(ids)} label={`Add ${t.umbrella} to Content Plan`} size={16} />
                          ); })()}
                          <i className={`ti ti-chevron-${uOpen ? 'down' : 'right'}`} style={{ fontSize: 13, color: 'var(--c-8b85ff)', flexShrink: 0 }} aria-hidden="true" />
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-ececff)', letterSpacing: '.01em' }}>{t.umbrella}</span>
                          {!selfUmb && <span style={{ fontSize: 9, color: 'var(--c-585878)', textTransform: 'uppercase', letterSpacing: '.06em' }}>umbrella</span>}
                        </span>
                        <span style={{ fontSize: 10.5, color: 'var(--c-8a8ab0)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {ua.n} {ua.n === 1 ? 'topic' : 'topics'} · {fmtVol(ua.vol)}/mo
                        </span>
                      </div>
                    </td>
                  </tr>,
                );
              }
              // Umbrella collapsed → hide every theme + topic beneath it.
              if (!umbrellaOpen(t.umbrella)) return;
              // Theme header — only when the umbrella has DISTINCT child themes (not self-umbrella).
              if (grouped && !selfUmb && t.parentName !== lastParent) {
                lastParent = t.parentName;
                const a = agg.get(t.parentName)!;
                const isOpen = expandedParents.has(t.parentName);
                // v7.200: band the theme header with the category's own type tint + left accent.
                const ptm = TYPE_META[t.parentType];
                out.push(
                  <tr
                    key={`hdr:${t.umbrella}:${t.parentName}`}
                    onClick={() => onToggleParent(t.parentName)}
                    style={{ cursor: 'pointer' }}
                    aria-expanded={isOpen}
                  >
                    <td colSpan={7} style={{ padding: '8px 12px 8px 30px', background: ptm.headBg, borderLeft: `3px solid ${ptm.color}`, borderBottom: '1px solid var(--c-23233a)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          {planEnabled && (() => { const ids = themeIds.get(t.parentName) ?? []; return (
                            <PlanCheckbox state={planStateForIds(ids)} saving={savingForIds(ids)} onToggle={() => toggleIds(ids)} label={`Add ${t.parentName} to Content Plan`} size={15} />
                          ); })()}
                          <i className={`ti ti-chevron-${isOpen ? 'down' : 'right'}`} style={{ fontSize: 13, color: ptm.color, flexShrink: 0 }} aria-hidden="true" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-e2e2f6)' }}>{t.parentName}</span>
                        </span>
                        <span style={{ fontSize: 10.5, color: 'var(--c-8a8ab0)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {a.n} {a.n === 1 ? 'topic' : 'topics'} · {fmtVol(a.vol)}/mo
                        </span>
                      </div>
                    </td>
                  </tr>,
                );
              }
              // Skip topic rows when their theme is collapsed (non-self umbrellas only).
              if (grouped && !selfUmb && !parentOpen(t.parentName)) return;
              const stm    = STAGE_META[t.stage];
              const stt    = TBL_STATUS[m.status];
              const open   = expanded.has(t.id);
              const isCore = isCoreKey(t.productKey);
              // v7.236: indent topic rows by tree depth — one level under a self-umbrella,
              // two levels under a real umbrella → theme.
              const childPad = !grouped ? 10 : (selfUmb ? 28 : 46);
              const topKws = t.keywords.slice().sort((a, b) => b.searchVolume - a.searchVolume).slice(0, 24);
              out.push(
                <Fragment key={t.id}>
                  <tr
                    onClick={() => onToggle(t.id)}
                    style={{ cursor: 'pointer', borderLeft: `2px solid ${stt.color}`, background: open ? 'var(--c-101019)' : 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--c-101019)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = open ? 'var(--c-101019)' : 'transparent'; }}
                  >
                    <td style={{ padding: '8px 10px', paddingLeft: childPad, borderBottom: '1px solid var(--c-15152a)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {planEnabled && (
                          <PlanCheckbox state={planStateForIds([t.id])} saving={savingForIds([t.id])} onToggle={() => toggleIds([t.id])} label={`Add ${t.product} to Content Plan`} size={15} />
                        )}
                        <i className={`ti ti-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 12, color: 'var(--c-4a4a6a)', flexShrink: 0 }} aria-hidden="true" />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-d8d8f8)' }}>{t.product}</span>
                        {t.pageUrl && (
                          <i className="ti ti-link" style={{ fontSize: 11, color: 'var(--c-6c63ff)', flexShrink: 0 }} aria-hidden="true" title={t.pageUrl} />
                        )}
                      </div>
                      {/* Grouped: parent is in the header → sub-label is just the intent
                          for product rows, and nothing for core rows (whose big label
                          IS the intent). Ungrouped: show "parent · intent". */}
                      {(grouped ? !isCore : true) && (
                        <div style={{ fontSize: 10, color: 'var(--c-5a5a78)', marginLeft: 18, marginTop: 1 }}>
                          {grouped ? INTENT_META[t.intent].label : `${t.parentName} · ${INTENT_META[t.intent].label}`}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-15152a)', whiteSpace: 'nowrap' }}>
                      <i className={`ti ${stm.icon}`} style={{ fontSize: 12, color: 'var(--c-6a6a90)', marginRight: 5, verticalAlign: -1 }} aria-hidden="true" />
                      <span style={{ color: 'var(--c-b8b8d8)' }}>{stm.label}</span>
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-15152a)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-c8c8e8)' }}>{t.keywords.length}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-15152a)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-c8c8e8)' }}>{fmtVol(t.totalVolume)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-15152a)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.status === 'demand' ? 'var(--c-3a3a5a)' : 'var(--c-c8c8e8)' }}>{m.status === 'demand' ? '—' : `${m.cov}%`}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-15152a)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.best === null ? 'var(--c-3a3a5a)' : 'var(--c-9b96ff)' }}>{m.best === null ? '—' : `#${m.best}`}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-15152a)' }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 20, background: stt.bg, border: `1px solid ${stt.bdr}`, color: stt.color, whiteSpace: 'nowrap' }}>{stt.label}</span>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} style={{ padding: '4px 12px 12px 30px', borderBottom: '1px solid var(--c-15152a)', background: 'var(--c-0c0c16)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {topKws.map((k, i) => (
                            <span key={i} style={{
                              fontSize: 10, color: k.origin === 'demand' ? 'var(--c-22d3ee)' : k.isGap ? 'var(--c-f59e0b)' : 'var(--c-8ab89a)',
                              background: 'var(--c-0f0f1e)', border: '1px solid var(--c-1c1c2e)', borderRadius: 5, padding: '2px 7px',
                            }}>
                              {k.keyword} · {fmtVol(k.searchVolume)}{k.position !== null && (k.position as number) <= 20 ? ` · #${k.position}` : ''}
                            </span>
                          ))}
                          {t.keywords.length > topKws.length && (
                            <span style={{ fontSize: 10, color: 'var(--c-404060)', padding: '2px 4px' }}>+{t.keywords.length - topKws.length} more</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>,
              );
            });
            return out;
          })()}
        </tbody>
      </table>
    </div>
  );
}

function ClustersTab({
  clusters,
  clientDomain,
  loadingClaude,
  onRefine,
  refining = false,
  refineProgress = null,
  refineError = null,
  aiRefined = false,
  keywordPaths,
  projectId,
  kwVersion = 0,
}: {
  clusters:      ThemeCluster[];
  clientDomain:  string;
  loadingClaude: boolean;
  keywordPaths?: Map<string, string[]>;   // v7.239: the SHARED stored taxonomy (same as Keyword panel)
  onRefine?:        (force?: boolean) => void;
  refining?:        boolean;
  refineProgress?:  { done: number; total: number; label: string; startedAt: number } | null;
  refineError?:     string | null;
  aiRefined?:       boolean;
  projectId?:       string;   // v7.371: needed for the Content-Plan add-to-cart wiring
  kwVersion?:       number;   // v7.371: refetch the plan selection when keywords change
}) {
  const [filter, setFilter] = useState<ClusterFilter>('all');
  // v7.371: shared Content-Plan selection — checking a topic / theme / umbrella here pushes it
  // into the SAME plan set the Journey list, Content Map and Content Plan sub-nav read (Const II.7).
  const { planStateForIds, savingForIds, toggleIds } = useContentPlanSelection(projectId ?? '', kwVersion);
  const planEnabled = !!projectId;
  // v7.203: journey scope — All / Product / Pre-product. Slices `clusters` BEFORE the
  // cards/funnel/pills/grid are computed, so the whole panel adjusts to the selection.
  const [journeyScope, setJourneyScope] = useState<'all' | 'product' | 'pre'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('group');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // v7.207: parent-category collapse. Tracks which parent headers are EXPANDED.
  // Default = empty set ⇒ every parent starts COLLAPSED until the user expands it,
  // so the grouped cluster list opens as a tidy index of parent topics you drill into.
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const toggleParent = (name: string) => setExpandedParents(prev => {
    const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n;
  });
  // v7.236: umbrella collapse — the level ABOVE theme (mirrors the Keyword tree's top rows).
  // Default empty ⇒ every umbrella starts collapsed, so the list opens as a tidy index of
  // umbrellas you drill into → themes → topics.
  const [expandedUmbrellas, setExpandedUmbrellas] = useState<Set<string>>(new Set());
  const toggleUmbrella = (name: string) => setExpandedUmbrellas(prev => {
    const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n;
  });

  // Pre-product = the life-problem themes (type 'problem'); product = everything else.
  const isPreProductCluster = (c: ThemeCluster) => c.type === 'problem';
  const productClusterCount = clusters.filter(c => !isPreProductCluster(c)).length;
  const preClusterCount     = clusters.filter(c =>  isPreProductCluster(c)).length;
  const scopedClusters: ThemeCluster[] =
    journeyScope === 'product' ? clusters.filter(c => !isPreProductCluster(c)) :
    journeyScope === 'pre'     ? clusters.filter(c =>  isPreProductCluster(c)) :
    clusters;
  const toggleRow = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const onSort = (k: SortKey) => {
    if (k === sortKey) { setSortDir(d => (d === 1 ? -1 : 1)); return; }
    setSortKey(k);
    setSortDir(k === 'group' || k === 'product' || k === 'stage' ? 1 : -1);
  };

  // ── Flatten categories → TOPICS (the counted unit) + classify each ──────────
  // v7.239: build topics from the SHARED taxonomy tree (keywordPaths) when available, so the
  // Cluster panel's structure is identical to the Keyword panel's by construction (Const II.7);
  // fall back to the intent-based flatten only on pre-taxonomy analyses (honest gap, I.5).
  const flatten = (cl: ThemeCluster[]): Topic[] =>
    (keywordPaths && keywordPaths.size > 0) ? buildTopicsFromTaxonomy(cl, keywordPaths) : flattenTopics(cl);
  const topics: Topic[] = flatten(scopedClusters);
  const topicStats: TopicStat[] = topics.map(classifyTopic);
  const catCount = new Set(scopedClusters.map(c => `${c.type}:${c.name}`)).size;

  const leadingStats  = topicStats.filter(s => !s.isDemand &&  s.isLeading);
  const trailingStats = topicStats.filter(s => !s.isDemand && !s.isLeading);
  // Opportunity = competitor gap vol < 25% of topic total AND client not already leading
  // (fully-won topics score compGapPct=0 which would falsely pass < 0.25)
  const oppStats      = topicStats.filter(s => !s.isDemand && s.compGapPct < 0.25 && !s.isLeading);

  // v7.328: TopicStat → export row (one row per topic). Real data only; blank when absent.
  const cn = clientDomain || 'client';
  const statRow = (st: TopicStat): ExportTopicRow => ({
    topic: st.topic.product || st.topic.parentName,
    keywords: st.topic.keywords.map((k) => k.keyword),
    totalVolume: st.topic.totalVolume,
    url: st.topic.pageUrl ?? '',
    priority: '',
    stage: st.stage,
    label: st.isClientFootprint ? 'Existing' : 'Net-new',
  });
  // Bare Topic (scope tabs are derived from flatten(), not stats) → same mapping; the
  // Existing/Net-new label comes from whether the client ranks (footprint) here.
  const topicRow = (t: Topic): ExportTopicRow => ({
    topic: t.product || t.parentName,
    keywords: t.keywords.map((k) => k.keyword),
    totalVolume: t.totalVolume,
    url: t.pageUrl ?? '',
    priority: '',
    stage: t.stage,
    label: t.keywords.some((k) => k.position !== null) ? 'Existing' : 'Net-new',
  });
  const dlStats = (arr: TopicStat[], segment: string) => exportSegmentXLSX(arr.map(statRow), { clientName: cn, segment });
  const dlTopics = (arr: Topic[], segment: string) => exportSegmentXLSX(arr.map(topicRow), { clientName: cn, segment });

  // ── Funnel-stage roll-up (v7.169) ──────────────────────────────────────────
  // Each TOPIC sits in exactly one stage (its intent), split into client-footprint
  // vs competitor-gap vs demand. Annual vol = topic monthly × 12.
  const stageRollups = JOURNEY_ORDER.map(stage => {
    const inStage = topicStats.filter(s => s.stage === stage);
    return {
      stage,
      total:          inStage.length,
      clientClusters: inStage.filter(s =>  s.isClientFootprint).length,
      gapClusters:    inStage.filter(s => !s.isClientFootprint && !s.isDemand).length,
      demandClusters: inStage.filter(s =>  s.isDemand).length,
      annualVol:      inStage.reduce((sum, s) => sum + s.topic.totalVolume, 0) * 12,
    };
  });
  const STAGE_KEYS = JOURNEY_ORDER as JourneyStage[];
  const isStageFilter = (f: ClusterFilter): f is JourneyStage =>
    (STAGE_KEYS as string[]).includes(f);

  // ── Ownership counts — client footprint vs competitor gap vs demand ─────────
  const clientOwnedCount = topicStats.filter(s =>  s.isClientFootprint).length;
  const gapOwnedCount    = topicStats.filter(s => !s.isClientFootprint && !s.isDemand).length;
  const demandOwnedCount = topicStats.filter(s =>  s.isDemand).length;

  // ── Filter nav model: ownership group + performance + funnel-stage group ─────
  const navOwnership: Array<{ key: ClusterFilter; label: string; count: number; cColor: string }> = [
    { key: 'all',        label: 'All topics',      count: topics.length,     cColor: 'var(--c-8080a8)' },
    { key: 'client',     label: 'Client only',     count: clientOwnedCount,  cColor: 'var(--c-4ade80)' },
    { key: 'competitor', label: 'Competitor only', count: gapOwnedCount,     cColor: 'var(--c-f59e0b)' },
  ];
  // Only show the missing-demand pill once a deep journey has surfaced any.
  if (demandOwnedCount > 0) {
    navOwnership.push({ key: 'demand', label: 'Missing demand', count: demandOwnedCount, cColor: 'var(--c-22d3ee)' });
  }
  const navPerformance: Array<{ key: ClusterFilter; label: string; count: number; cColor: string }> = [
    { key: 'leading',     label: 'Winning',         count: leadingStats.length,  cColor: 'var(--c-4ade80)' },
    { key: 'trailing',    label: 'Trailing',        count: trailingStats.length, cColor: 'var(--c-f472b6)' },
    { key: 'opportunity', label: 'Low Competition', count: oppStats.length,      cColor: 'var(--c-38bdf8)' },
  ];
  const navStages: Array<{ key: ClusterFilter; label: string; count: number; cColor: string }> =
    stageRollups.map(r => ({ key: r.stage, label: STAGE_META[r.stage].label, count: r.total, cColor: 'var(--c-585878)' }));

  // Annualise monthly volume × 12
  const ann = (stats: TopicStat[]) =>
    stats.reduce((s, cs) => s + cs.topic.totalVolume, 0) * 12;

  const totalAnnualVol  = topicStats.reduce((s, cs) => s + cs.topic.totalVolume, 0) * 12;
  const totalMonthlyVol = totalAnnualVol / 12;

  function fmtHero(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  }

  // Filtered TOPICS (the counted unit), then grouped under their category below.
  const filteredStats: TopicStat[] =
    filter === 'leading'     ? leadingStats :
    filter === 'trailing'    ? trailingStats :
    filter === 'opportunity' ? oppStats :
    filter === 'client'      ? topicStats.filter(s =>  s.isClientFootprint) :
    filter === 'competitor'  ? topicStats.filter(s => !s.isClientFootprint && !s.isDemand) :
    filter === 'demand'      ? topicStats.filter(s =>  s.isDemand) :
    isStageFilter(filter)    ? topicStats.filter(s => s.stage === filter) :
    topicStats;

  const filtered: Topic[] = filteredStats.map(s => s.topic);

  // v7.190: build sortable table rows from the filtered topics, then sort.
  const rows: TopicRow[] = filteredStats.map(st => ({ t: st.topic, st, m: topicMetrics(st.topic, st) }));
  const sIdx = (s: JourneyStage) => JOURNEY_ORDER.indexOf(s);
  const sortedRows = rows.slice().sort((a, b) => {
    let r = 0;
    switch (sortKey) {
      case 'group': {
        // v7.236: umbrella first (mirrors the Keyword tree's top level), then theme;
        // within a theme, core (intent-only) sub-topics come first in funnel order, then
        // each split product group, each in funnel order.
        r = a.t.umbrella.localeCompare(b.t.umbrella);
        if (r === 0) r = a.t.parentName.localeCompare(b.t.parentName);
        if (r === 0) r = (isCoreKey(a.t.productKey) ? 0 : 1) - (isCoreKey(b.t.productKey) ? 0 : 1);
        if (r === 0 && !isCoreKey(a.t.productKey)) r = a.t.product.localeCompare(b.t.product);
        if (r === 0) r = sIdx(a.t.stage) - sIdx(b.t.stage);
        break;
      }
      case 'product':  r = a.t.product.localeCompare(b.t.product); break;
      case 'stage':    r = sIdx(a.t.stage) - sIdx(b.t.stage); break;
      case 'kw':       r = a.t.keywords.length - b.t.keywords.length; break;
      case 'vol':      r = a.t.totalVolume - b.t.totalVolume; break;
      case 'coverage': r = a.m.cov - b.m.cov; break;
      case 'rank':     r = (a.m.best ?? 9999) - (b.m.best ?? 9999); break;
      case 'status':   r = STATUS_RANK[a.m.status] - STATUS_RANK[b.m.status]; break;
    }
    if (r !== 0) return r * sortDir;
    return b.t.totalVolume - a.t.totalVolume;   // stable tiebreak: volume desc
  });

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
    data:     TopicStat[];   // v7.328: rows this card exports
  }> = [
    {
      key:      'leading',
      label:    'Leading',
      count:    leadingStats.length,
      vol:      ann(leadingStats),
      subtitle: 'Clusters you are winning',
      accent:   'var(--c-4ade80)',
      activeBg: 'var(--ca-74-222-128-0_10)',
      activeBdr:'var(--ca-74-222-128-0_45)',
      dimBg:    'var(--ca-74-222-128-0_04)',
      dimBdr:   'var(--ca-74-222-128-0_15)',
      icon:     'ti-trophy',
      data:     leadingStats,
    },
    {
      key:      'trailing',
      label:    'Trailing',
      count:    trailingStats.length,
      vol:      ann(trailingStats),
      subtitle: 'Clusters competitors lead',
      accent:   'var(--c-f472b6)',
      activeBg: 'var(--ca-244-114-182-0_10)',
      activeBdr:'var(--ca-244-114-182-0_45)',
      dimBg:    'var(--ca-244-114-182-0_04)',
      dimBdr:   'var(--ca-244-114-182-0_15)',
      icon:     'ti-trending-down',
      data:     trailingStats,
    },
    {
      key:      'opportunity',
      label:    'Low Competition',
      count:    oppStats.length,
      vol:      ann(oppStats),
      subtitle: 'Competitors least present',
      accent:   'var(--c-38bdf8)',
      activeBg: 'var(--ca-56-189-248-0_10)',
      activeBdr:'var(--ca-56-189-248-0_45)',
      dimBg:    'var(--ca-56-189-248-0_04)',
      dimBdr:   'var(--ca-56-189-248-0_15)',
      icon:     'ti-target',
      data:     oppStats,
    },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

      {/* v7.241: "Refine clusters with AI" button removed (Wayne). The cluster pane is */}
      {/* display-only; the build/expansion lives on the Keyword panel's workflow bar.   */}

      {/* v7.366: insight sentences (G1 demand inversion · G8 funnel blind spot) — pure
          rules over the SAME leading/trailing + stage rollups the cards below render
          (Const II.6); render nothing when a rule doesn't fire (Const I.5). */}
      <InsightStack style={{ marginBottom: 12 }} insights={[
        demandInversionInsight({
          leadingCount: leadingStats.length,  leadingAnnualVol: ann(leadingStats),
          trailingCount: trailingStats.length, trailingAnnualVol: ann(trailingStats),
        }),
        funnelBlindSpotInsight({
          stages: stageRollups.map(r => ({ label: STAGE_META[r.stage].label, topics: r.total, annualVol: r.annualVol })),
        }),
      ]} />

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
                position:     'relative',
                display: 'flex', alignItems: 'center', gap: 28,
                padding: '20px 24px',
                background:   allActive ? 'var(--ca-155-150-255-0_10)' : 'var(--ca-155-150-255-0_04)',
                border:       `1px solid ${allActive ? 'var(--ca-155-150-255-0_45)' : 'var(--ca-155-150-255-0_18)'}`,
                borderRadius: 12,
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'all 0.15s',
                outline:      'none',
                boxShadow:    allActive ? '0 0 0 1px var(--ca-155-150-255-0_45)' : 'none',
              }}
              onMouseEnter={e => { if (!allActive) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ca-155-150-255-0_40)'; }}
              onMouseLeave={e => { if (!allActive) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ca-155-150-255-0_18)'; }}
            >
              <SegmentDownloadButton onDownload={() => dlStats(topicStats, 'All clusters')} title="Download as Excel" size={14} style={{ position: 'absolute', top: 12, right: 14 }} />
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--c-585878)', marginBottom: 4 }}>
                  Total clusters
                </div>
                <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1, letterSpacing: -3, color: 'var(--c-e8e8ff)' }}>
                  {topics.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-484868)', marginTop: 4 }}>topics across {catCount} categories</div>
              </div>
              <div style={{ width: 1, height: 64, background: 'var(--c-1e1e34)', flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-585878)', marginBottom: 3 }}>
                    Total annual search volume
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: -1, color: 'var(--c-9b96ff)' }}>
                      {fmtHero(totalAnnualVol)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--c-484868)' }}>searches / yr</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c-585878)', marginBottom: 3 }}>
                    Total monthly volume
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 19, fontWeight: 600, lineHeight: 1, letterSpacing: -.5, color: 'var(--c-6a6a90)' }}>
                      {fmtHero(totalMonthlyVol)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--c-383858)' }}>searches / mo</span>
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
                    <SegmentDownloadButton onDownload={() => dlStats(card.data, card.label)} title="Download as Excel" style={{ marginLeft: 'auto' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-7070a0)' }}>
                    {card.subtitle}
                  </div>
                </div>

                {/* Count + annual vol (right) */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end' }}>
                    <span style={{
                      fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-1.5px',
                      color: active ? card.accent : 'var(--c-e8e8ff)',
                    }}>
                      {card.count}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--c-9090b8)' }}>clusters</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: card.accent, marginTop: 3 }}>
                    {fmtVol(card.vol)}
                    <span style={{ fontSize: 11, color: 'var(--c-8080a8)', fontWeight: 400, marginLeft: 4 }}>annual vol</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: funnel-stage roll-up as a HALF inverted pyramid. v7.202: the   */}
        {/* header + description were removed so the funnel fills the full box     */}
        {/* height and reads larger; a compact client/gap[/demand] legend sits in  */}
        {/* the upper-right corner instead. Each band is clickable → filter the    */}
        {/* grid by that dominant stage (toggle back to all); hover shows a ring +  */}
        {/* filter icon to signal the band is clickable.                           */}
        <div style={{
          position: 'relative',
          background: 'var(--c-0f0f1e)', border: '1px solid var(--c-1e1e34)', borderRadius: 12,
          padding: '14px 16px', display: 'flex', flexDirection: 'column',
        }}>
          {/* Legend — small colour dots, upper-right corner */}
          <div style={{
            position: 'absolute', top: 11, right: 13, display: 'flex', alignItems: 'center',
            gap: 11, fontSize: 9, fontWeight: 600, letterSpacing: '.02em', zIndex: 1,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-6a6a90)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-4ade80)', flexShrink: 0 }} />
              client
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-6a6a90)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-f59e0b)', flexShrink: 0 }} />
              gap
            </span>
            {stageRollups.some(r => r.demandClusters > 0) && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-6a6a90)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-22d3ee)', flexShrink: 0 }} />
                demand
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, paddingTop: 14 }}>
            {stageRollups.map((r, i) => {
              const meta      = STAGE_META[r.stage];
              const active    = filter === r.stage;
              // Half-pyramid geometry: flat right edge (100%), left edge steps in
              // 18% per stage so the four bands form one continuous funnel.
              const topInset    = 18 * i;
              const botInset    = 18 * (i + 1);
              const BAND_COLORS = ['var(--c-8b85ff)', 'var(--c-6c63ff)', 'var(--c-574dd6)', 'var(--c-443aa8)'];
              const bandColor   = active ? 'var(--c-b7b1ff)' : BAND_COLORS[i];
              return (
                <button
                  key={r.stage}
                  onClick={() => setFilter(f => (f === r.stage ? 'all' : r.stage))}
                  title={`Click to filter by ${meta.label}`}
                  style={{
                    display:    'flex',
                    alignItems: 'stretch',
                    gap:        12,
                    width:      '100%',
                    flex:       1,          // v7.202: bands stretch to fill the full box height
                    minHeight:  44,
                    background: active ? 'var(--ca-155-150-255-0_08)' : 'transparent',
                    border:     `1px solid ${active ? 'var(--ca-155-150-255-0_30)' : 'transparent'}`,
                    borderRadius: 9,
                    padding:    '4px 8px 4px 4px',
                    cursor:     'pointer',
                    textAlign:  'left',
                    outline:    'none',
                    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    if (!active) { b.style.background = 'var(--ca-155-150-255-0_04)'; b.style.borderColor = 'var(--ca-155-150-255-0_30)'; }
                    b.style.boxShadow = '0 0 0 1px var(--ca-155-150-255-0_30)';
                    const fic = b.querySelector('[data-fic]') as HTMLElement | null; if (fic) fic.style.opacity = '1';
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    if (!active) { b.style.background = 'transparent'; b.style.borderColor = 'transparent'; }
                    b.style.boxShadow = 'none';
                    const fic = b.querySelector('[data-fic]') as HTMLElement | null; if (fic) fic.style.opacity = active ? '1' : '0';
                  }}
                >
                  {/* Funnel band — flat edge on the right (clip-path trapezoid) */}
                  <div style={{
                    width:      110,
                    flexShrink: 0,
                    alignSelf:  'stretch',
                    background: bandColor,
                    clipPath:   `polygon(${topInset}% 0, 100% 0, 100% 100%, ${botInset}% 100%)`,
                    transition: 'background 0.15s',
                  }} />

                  {/* Stage info — sits beside the pyramid's flat edge */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.02em', color: active ? 'var(--c-c8c4ff)' : 'var(--c-c8c8e8)' }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.5px', color: active ? 'var(--c-9b96ff)' : 'var(--c-e8e8ff)' }}>
                        {r.total}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--c-585878)' }}>topics</span>
                      {active && (
                        <span style={{
                          marginLeft: 8, fontSize: 8, fontWeight: 700,
                          background: 'var(--ca-155-150-255-0_10)', border: '1px solid var(--ca-155-150-255-0_45)',
                          color: 'var(--c-9b96ff)', borderRadius: 20, padding: '1px 6px',
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--c-6a6a90)', marginTop: 3 }}>
                      <span style={{ color: 'var(--c-4ade80)', fontWeight: 600 }}>{r.clientClusters}</span> client
                      &nbsp;·&nbsp;
                      <span style={{ color: 'var(--c-f59e0b)', fontWeight: 600 }}>{r.gapClusters}</span> gap
                      {r.demandClusters > 0 && (
                        <>
                          &nbsp;·&nbsp;
                          <span style={{ color: 'var(--c-22d3ee)', fontWeight: 600 }}>{r.demandClusters}</span> demand
                        </>
                      )}
                      &nbsp;·&nbsp;
                      <span style={{ color: 'var(--c-8b85ff)', fontWeight: 600 }}>{fmtVol(r.annualVol)}</span>
                    </div>
                  </div>

                  {/* v7.328: download this stage's topics as Excel (span role=button —
                      stopPropagation keeps the band's filter click from firing). */}
                  <SegmentDownloadButton
                    onDownload={() => dlStats(topicStats.filter(s => s.stage === r.stage), `${meta.label} stage`)}
                    title="Download as Excel"
                    style={{ alignSelf: 'center' }}
                  />
                  {/* Clickable affordance — filter icon, fades in on hover */}
                  <i
                    className="ti ti-filter"
                    data-fic
                    aria-hidden="true"
                    style={{
                      alignSelf: 'center', flexShrink: 0, fontSize: 13,
                      color: active ? 'var(--c-9b96ff)' : 'var(--c-8b85ff)',
                      opacity: active ? 1 : 0, transition: 'opacity 0.15s',
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── v7.203: Journey scope — All / Product / Pre-product. Sits directly  */}
      {/* below the summary cards; choosing a scope re-slices the clusters so the */}
      {/* cards, funnel-stage box, filter pills and grid all recompute. Pre-      */}
      {/* product = life-problem / trigger themes (awareness-only); product =     */}
      {/* solution-aware, full funnel — the SAME split the Journey & Content Map  */}
      {/* panels use (single source of truth).                                    */}
      {(() => {
        // v7.328: keep the topic arrays (not just counts) so each scope tab can export the
        // EXACT rows its count reflects (Const I.3 — export count == displayed count).
        const preTopics     = flatten(clusters.filter(c =>  isPreProductCluster(c)));
        const productTopics = flatten(clusters.filter(c => !isPreProductCluster(c)));
        const preTopicsN     = preTopics.length;
        const productTopicsN = productTopics.length;
        const scopeDownload: Record<'all' | 'product' | 'pre', () => void> = {
          all:     () => dlTopics(productTopics.concat(preTopics), 'All journeys'),
          product: () => dlTopics(productTopics, 'Product journey'),
          pre:     () => dlTopics(preTopics, 'Pre-product journey'),
        };
        const SCOPES: Array<{ key: 'all' | 'product' | 'pre'; label: string; count: number; hint: string; accent: string; dot?: boolean }> = [
          { key: 'all',     label: 'All journeys',        count: productTopicsN + preTopicsN, hint: 'Product + pre-product topics',           accent: 'var(--c-c8c8e8)' },
          { key: 'product', label: 'Product journey',     count: productTopicsN,              hint: 'Solution-aware demand · full funnel',    accent: 'var(--c-9b96ff)', dot: true },
          { key: 'pre',     label: 'Pre-product journey', count: preTopicsN,                  hint: 'Problem / trigger searches · awareness only', accent: 'var(--c-34d399)', dot: true },
        ];
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '11px 16px', borderTop: '1px solid var(--c-14142a)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--c-585878)' }}>
              Journey
            </span>
            <div style={{ display: 'inline-flex', background: 'var(--c-14142a)', border: '1px solid var(--c-2a2a45)', borderRadius: 10, padding: 3, gap: 3 }}>
              {SCOPES.map(s => {
                const on = journeyScope === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setJourneyScope(s.key); setFilter('all'); }}
                    title={s.hint}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      fontSize: 12, fontWeight: 600, lineHeight: 1,
                      padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                      border: 'none', outline: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
                      background: on ? 'var(--c-1e1e38)' : 'transparent',
                      boxShadow:  on ? `inset 0 0 0 1px ${s.accent}` : 'none',
                      color:      on ? s.accent : 'var(--c-9090b8)',
                    }}
                    onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-c8c8e8)'; }}
                    onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-9090b8)'; }}
                  >
                    {s.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.accent, flexShrink: 0 }} />}
                    {s.label}
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? s.accent : 'var(--c-585878)' }}>{s.count}</span>
                    <SegmentDownloadButton onDownload={scopeDownload[s.key]} title="Download as Excel" />
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 10, color: 'var(--c-484868)' }}>
              {journeyScope === 'pre'     ? 'Problem / trigger searches · awareness only'
             : journeyScope === 'product' ? 'Solution-aware demand · full funnel'
             :                              'Showing both journeys'}
            </span>
          </div>
        );
      })()}

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
                background: on ? 'var(--c-6c63ff)' : 'var(--c-13131f)',
                border:     `1px solid ${on ? 'var(--c-6c63ff)' : 'var(--c-23233a)'}`,
                color:      on ? 'var(--c-0a0a14)' : 'var(--c-9090b8)',
              }}
              onMouseEnter={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-34345a)'; }}
              onMouseLeave={e => { if (!on) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-23233a)'; }}
            >
              {item.label}
              <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--ca-10-10-20-0_65)' : item.cColor }}>
                {item.count}
              </span>
            </button>
          );
        };
        const GlowLine = () => (
          <div style={{
            height: 1,
            background: 'linear-gradient(to right, var(--ca-108-99-255-0) 0%, var(--ca-108-99-255-0_55) 50%, var(--ca-108-99-255-0) 100%)',
            boxShadow: '0 0 6px var(--ca-108-99-255-0_45)',
          }} />
        );
        const GroupDivider = () => (
          <span style={{ width: 1, height: 18, background: 'var(--c-23233a)', margin: '0 4px' }} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--c-6c63ff)', marginLeft: 6 }}>
                  <svg style={{ width: 11, height: 11, animation: 'spin 1s linear infinite', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refining…
                </div>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--c-3a3a5a)', whiteSpace: 'nowrap' }}>
                {filter === 'all'
                  ? `${topics.length} topics · click a card to expand`
                  : `Showing ${filtered.length} of ${topics.length}`}
              </span>
            </div>
            <GlowLine />
          </div>
        );
      })()}

      {/* ── v7.190: one sortable table — Theme · product × funnel stage ──────── */}
      {/* v7.207: when grouped, expose Expand all / Collapse all for the parent rows. */}
      {filtered.length > 0 && sortKey === 'group' && (() => {
        // v7.236: count + expand/collapse operate on UMBRELLAS (the top level). Expand-all
        // opens every umbrella AND its themes so one click reveals the full tree.
        const allUmbrellas = Array.from(new Set(sortedRows.map(r => r.t.umbrella)));
        const allParents   = Array.from(new Set(sortedRows.map(r => r.t.parentName)));
        const openCount    = allUmbrellas.filter(u => expandedUmbrellas.has(u)).length;
        const allOpen      = openCount === allUmbrellas.length && allUmbrellas.length > 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '0 2px 8px' }}>
            <span style={{ fontSize: 11, color: 'var(--c-585878)' }}>
              {allUmbrellas.length} umbrella{allUmbrellas.length === 1 ? '' : 's'} · {openCount} expanded
            </span>
            <button
              onClick={() => {
                if (allOpen) { setExpandedUmbrellas(new Set()); setExpandedParents(new Set()); }
                else { setExpandedUmbrellas(new Set(allUmbrellas)); setExpandedParents(new Set(allParents)); }
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 7,
                border: '1px solid var(--c-23233a)', background: 'var(--c-0d0d1a)', color: 'var(--c-9090b8)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <i className={`ti ti-${allOpen ? 'fold' : 'fold-down'}`} style={{ fontSize: 13 }} aria-hidden="true" />
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        );
      })()}
      {filtered.length > 0 && (
        <TopicTable
          rows={sortedRows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          expanded={expanded}
          onToggle={toggleRow}
          expandedParents={expandedParents}
          onToggleParent={toggleParent}
          expandedUmbrellas={expandedUmbrellas}
          onToggleUmbrella={toggleUmbrella}
          planEnabled={planEnabled}
          planStateForIds={planStateForIds}
          savingForIds={savingForIds}
          toggleIds={toggleIds}
        />
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--c-404060)', fontSize: 13 }}>
          {clusters.length === 0
            ? 'No cluster data — run an analysis first.'
            : filter === 'opportunity'
            ? 'No topics with competitor coverage below 25% — competition is active across all topics.'
            : 'No topics match this filter.'}
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
  claudeAssigns: propClaudeAssigns,   // v7.220: page-supplied map (single source of truth)
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

  // v7.199: AI intent-grouping ("Refine with AI"). Result is merged into the analysis
  // used to build clusters + the keyword pool, so the panel updates live (no reload).
  const [aiRefined, setAiRefined] = useState<{ intentGroups: any[]; brandKeywords: string[] } | null>(null);
  const [refining,      setRefining]      = useState(false);
  const [refineProgress, setRefineProgress] = useState<{ done: number; total: number; label: string; startedAt: number } | null>(null);
  const [refineError,   setRefineError]   = useState<string | null>(null);

  // True once the first keywords fetch has resolved (even if empty)
  const kwLoaded = uploadedKeywords !== null;

  // Analysis used for building — overlaid with any AI refine result for a live update.
  const effectiveAnalysis = useMemo(() => {
    if (!aiRefined) return analysis;
    const snap = analysis?.semrushSnapshot ?? {};
    const cb   = snap._categoryBreakdown ?? {};
    return {
      ...analysis,
      semrushSnapshot: {
        ...snap,
        _categoryBreakdown: { ...cb, intentGroups: aiRefined.intentGroups, brandKeywords: aiRefined.brandKeywords, intentEngine: 'intent-ai-v1' },
      },
    };
  }, [analysis, aiRefined]);

  // v7.203: pre-product (life-problem) clusters + the set of keywords they claim,
  // using the Journey panel's solution-awareness definition (single source of truth).
  // v7.336 (QC audit B5, Const I.6/II.7): built on the UNFLOORED canonical basis
  // (thresholds 0,0) — the SAME basis every buildCanonicalClusterTopics consumer
  // (page-level Journey build, Exec, Content Map, Content Plan, Scope) and computeSov
  // use — instead of the project volume thresholds. Flooring only this panel's build
  // made its header/cards disagree with every canonical count on threshold-set projects.
  const journeyBuild = useMemo(
    () => buildPreProductClusters(
      effectiveAnalysis, clientDomain, competitors, uploadedKeywords ?? [],
      0, 0,
    ),
    [effectiveAnalysis, clientDomain, competitors, uploadedKeywords],
  );

  // Product-lane clusters — built EXCLUDING the pre-product keywords so a keyword is
  // never counted in both lanes (Art I.3, no double counting).
  // v7.220: prefer the page-supplied map (single source of truth) when present, so this
  // panel builds from the SAME intent assignments the Journey/Content canonical builds
  // use — making "Total clusters" reconcile to "Topics in journey". Falls back to the
  // panel's own pass (propClaudeAssigns absent/empty) so the panel still works standalone.
  const effectiveAssigns = useMemo(
    () => (propClaudeAssigns && Object.keys(propClaudeAssigns).length > 0) ? propClaudeAssigns : claudeAssigns,
    [propClaudeAssigns, claudeAssigns],
  );
  const baseClusters = useMemo(
    () => buildThemeClusters(
      effectiveAnalysis, effectiveAssigns, clientDomain, competitors, uploadedKeywords ?? [],
      0, 0, journeyBuild.preProductKws,   // v7.336 (QC audit B5): unfloored canonical basis (Const I.6)
    ),
    [effectiveAnalysis, effectiveAssigns, clientDomain, competitors, uploadedKeywords, journeyBuild],
  );

  // Full tagged cluster list (product lane + pre-product problem themes). The journey
  // scope toggle in ClustersTab slices THIS, and the cards/funnel/pills/grid recompute.
  const allClusters = useMemo(() => [...baseClusters, ...journeyBuild.clusters], [baseClusters, journeyBuild]);

  // v7.239: the STORED canonical taxonomy (same source the Keyword panel renders). Read once
  // here and handed to ClustersTab so the cluster topic tree IS the keyword tree (Const II.7).
  const keywordPathsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    const kp: Record<string, any> = effectiveAnalysis?.semrushSnapshot?._categoryBreakdown?.keywordPaths ?? {};
    for (const [k, v] of Object.entries(kp)) {
      if (Array.isArray(v)) {
        const path = v.map((s: any) => String(s ?? '').trim()).filter(Boolean);
        if (path.length) m.set(k.toLowerCase().trim(), path);
      }
    }
    return m;
  }, [effectiveAnalysis]);

  const runRefine = useCallback(async (force = false) => {
    setRefining(true); setRefineError(null);
    setRefineProgress({ done: 0, total: 0, label: '', startedAt: Date.now() });
    try {
      const resp = await fetch(`/api/projects/${projectId}/refine-clusters`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      });
      if (!resp.ok || !resp.body) {
        let msg = `Refine failed (HTTP ${resp.status})`;
        try { const j = await resp.json(); if (j?.error) msg = j.error; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: any; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === 'start')         setRefineProgress(p => ({ done: 0, total: ev.total ?? 0, label: 'starting…', startedAt: p?.startedAt ?? Date.now() }));
          else if (ev.type === 'progress') setRefineProgress(p => ({ done: ev.done ?? 0, total: ev.total ?? (p?.total ?? 0), label: ev.label ?? '', startedAt: p?.startedAt ?? Date.now() }));
          else if (ev.type === 'error')    setRefineError(String(ev.error ?? 'AI refine failed'));
          else if (ev.type === 'done')     setAiRefined({ intentGroups: ev.intentGroups ?? [], brandKeywords: ev.brandKeywords ?? [] });
        }
      }
    } catch (err) {
      setRefineError(String((err as any)?.message ?? err));
    } finally {
      setRefining(false);
      setRefineProgress(null);
    }
  }, [projectId]);

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

  const totalKws   = allClusters.reduce((s, c) => s + c.keywords.length, 0);
  // v7.190: a "topic" is now a PRODUCT × funnel-stage row (broad themes split into
  // their product sub-clusters), so count the flattened table rows.
  // v7.203: count across both lanes (product + pre-product).
  // v7.334: count with the SAME flatten ClustersTab renders — the stored-taxonomy build
  // when keywordPaths exist, the intent flatten only as the pre-taxonomy fallback — so
  // the header reconciles with the "Total clusters" card by construction (Const II.7;
  // QC audit A1: header said 360 while the cards/funnel/chips/Exec all said 531).
  const topicCnt   = useMemo(
    () => (keywordPathsMap.size > 0
      ? buildTopicsFromTaxonomy(allClusters, keywordPathsMap)
      : flattenTopics(allClusters)).length,
    [allClusters, keywordPathsMap],
  );
  const catCnt     = allClusters.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: '1px solid var(--c-1c1c30)', background: 'var(--c-0d0d18)', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-d8d8f8)', margin: 0 }}>Theme Clusters</h2>
          <p style={{ fontSize: 11, color: 'var(--c-404060)', margin: '2px 0 0' }}>
            {kwLoaded
              ? `${totalKws} keywords · ${topicCnt} topic clusters across ${catCnt} categories · click any card to see keywords`
              : 'Loading clusters…'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--c-383858)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span><span style={{ color: 'var(--c-4ade80)' }}>■</span> Client ranked</span>
            <span><span style={{ color: 'var(--c-f59e0b)' }}>■</span> Competitor gap</span>
          </div>
          <button
            onClick={() => refreshUploadedKeywords(true)}
            disabled={refreshingKws}
            title="Refresh clusters with latest uploaded keywords"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              background: refreshingKws ? 'var(--ca-108-99-255-0_15)' : 'var(--ca-108-99-255-0_08)',
              border: '1px solid var(--ca-108-99-255-0_3)', color: 'var(--c-8b85ff)',
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
        <div className="animate-pulse" style={{ height: 3, background: 'var(--ca-108-99-255-0_35)', flexShrink: 0 }} />
      )}

      {!kwLoaded ? (
        /* ── Skeleton: shown until DB keyword fetch resolves ── */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--c-404060)', fontSize: 13 }}>
            <svg style={{ width: 18, height: 18, animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }}
              fill="none" viewBox="0 0 24 24" stroke="var(--ca-108-99-255-0_6)">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Building clusters…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <ClustersTab
          clusters={allClusters}
          clientDomain={clientDomain}
          loadingClaude={loadingClaude}
          onRefine={runRefine}
          refining={refining}
          refineProgress={refineProgress}
          refineError={refineError}
          aiRefined={!!aiRefined}
          keywordPaths={keywordPathsMap}
          projectId={projectId}
          kwVersion={kwVersion}
        />
      )}
    </div>
  );
}
