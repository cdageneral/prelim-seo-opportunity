'use client';

import { useMemo, useState, useEffect, useCallback, Fragment } from 'react';
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
  url?:         string;          // v7.190: client's ranking page URL (for sub-product page detection)
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

// ─── v7.194: near-duplicate parent-category detection ─────────────────────────
// Two upstream categories can describe the same thing under slightly different
// wording ("529 College Savings Plans" vs "529 Education Savings Plans"). We must
// never show both as separate parents. Detection is data-derived from the names'
// own tokens (no hardcoded vocabulary): drop connector words, crude-singularise,
// then treat names as duplicates when their token sets are identical OR they share
// ≥2 tokens and each differs by at most one token. "Credit Cards"/"Debit Cards"
// share only {card} (=1) so they are correctly NOT merged.
const CAT_STOP = new Set(['and', '&', 'the', 'of', 'for', 'a', 'an', 'to', 'in', 'on', 'or', 'with', 'your', 'you']);
function catTokens(name: string): Set<string> {
  return new Set(
    name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w && !CAT_STOP.has(w))
      .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}
function catsAreDup(a: string, b: string): boolean {
  const ta = catTokens(a), tb = catTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const inter = Array.from(ta).filter(t => tb.has(t)).length;
  if (ta.size === tb.size && inter === ta.size) return true;          // identical token sets
  const onlyA = Array.from(ta).filter(t => !tb.has(t)).length;
  const onlyB = Array.from(tb).filter(t => !ta.has(t)).length;
  return inter >= 2 && onlyA <= 1 && onlyB <= 1;
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

  // v7.190: client ranking-page URL by keyword (from the Semrush footprint) — used
  // by the sub-product splitter to detect each product PAGE and name a product
  // from the client's own slug. Real data only; absent for demand/gap keywords.
  const urlByKeyword = new Map<string, string>();
  for (const k of (semSnap.topKeywords ?? [])) {
    const key = (k?.keyword ?? '').toLowerCase();
    if (key && k?.url && !urlByKeyword.has(key)) urlByKeyword.set(key, k.url);
  }

  // Map to KwItem (ThemeClusters internal type), carrying provenance.
  const pool: KwItem[] = rawPool.map(item => ({
    keyword:      item.keyword,
    searchVolume: item.searchVolume,
    position:     item.position,
    isGap:        item.isGap,
    competitor:   item.competitor,
    origin:       item.origin,
    demandSeeds:  item.demandSeeds,
    url:          urlByKeyword.get(item.keyword.toLowerCase()),
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

  // ── v7.194: merge near-duplicate parent categories in-panel ─────────────────
  // After keyword assignment, collapse categories of the SAME type whose names are
  // near-duplicates (catsAreDup) into a single canonical parent. Canonical = the
  // bucket with the highest search volume (tie → more keywords → shortest name);
  // its bucket absorbs the others' keywords. Numbers stay a pure roll-up — no
  // keyword is dropped or double-counted. Also collapses any exact-name duplicates
  // (which would otherwise render two parents sharing one bucket).
  {
    const volOf = (name: string) => (catMap.get(name) ?? []).reduce((s, k) => s + k.searchVolume, 0);
    const parentOf = categories.map((_, i) => i);
    const find = (i: number): number => (parentOf[i] === i ? i : (parentOf[i] = find(parentOf[i])));
    const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parentOf[ra] = rb; };
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        if (categories[i].type === categories[j].type && catsAreDup(categories[i].name, categories[j].name)) union(i, j);
      }
    }
    const groups = new Map<number, number[]>();
    categories.forEach((_, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); });
    const reduced: typeof categories = [];
    for (const idxs of Array.from(groups.values())) {
      if (idxs.length === 1) { reduced.push(categories[idxs[0]]); continue; }
      let canon = idxs[0];
      for (const i of idxs) {
        const vi = volOf(categories[i].name), vc = volOf(categories[canon].name);
        if (vi > vc) { canon = i; continue; }
        if (vi === vc) {
          const ci = (catMap.get(categories[i].name) ?? []).length;
          const cc = (catMap.get(categories[canon].name) ?? []).length;
          if (ci > cc || (ci === cc && categories[i].name.length < categories[canon].name.length)) canon = i;
        }
      }
      const canonName = categories[canon].name;
      const canonBucket = catMap.get(canonName) ?? [];
      catMap.set(canonName, canonBucket);
      for (const i of idxs) {
        if (i === canon) continue;
        const other = categories[i].name;
        if (other === canonName) continue;              // exact same-name dup → shared bucket, nothing to move
        canonBucket.push(...(catMap.get(other) ?? []));
        catMap.delete(other);
      }
      reduced.push(categories[canon]);
    }
    categories.splice(0, categories.length, ...reduced);
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

  // ── v7.169: Surface every deep-journey demand TOPIC (theme × intent) ─────────
  // A "cluster" is now a single TOPIC = a small group of same-intent keywords
  // about one theme (Wayne's definition). Demand feeds back at the topic level:
  //   • Demand kw matches a footprint category at an intent it ALREADY covers →
  //     MERGE into that topic (same theme × intent; volume grows, no new row).
  //   • Demand kw matches a footprint category at an intent it does NOT cover →
  //     add a NEW demand TOPIC (sub-cluster) under that SAME category, so it
  //     appears as a "missing demand" topic inside the category's section.
  //   • Demand kw matches NO category → seed-grouped "missing demand" category,
  //     whose own intent topics surface as cards.
  // Demand keeps origin:'demand', so a topic that is PURELY demand is classed as a
  // third lens (not client rank / not competitor gap) in ClustersTab; a footprint
  // topic that merely absorbed same-intent demand stays footprint-owned.
  if (demandPool.length > 0) {
    const clusterByName = new Map<string, ThemeCluster>();
    for (const c of result) clusterByName.set(c.name.toLowerCase(), c);

    const kwIntent = (kw: KwItem): IntentType => {
      const key = kw.keyword.toLowerCase();
      let intent = detectIntentSignal(kw.keyword);
      if (!intent && claudeAssignments[key]) intent = claudeAssignments[key];
      return intent ?? 'unmatched';
    };

    const touched    = new Set<ThemeCluster>();   // footprint clusters that absorbed demand
    const seedGroups = new Map<string, { name: string; keywords: KwItem[] }>();

    for (const kw of demandPool) {
      const intent  = kwIntent(kw);
      const matched = matchKeywordToCategory(kw.keyword, categories, clientDomain, competitorDomains);
      const fp      = matched ? clusterByName.get(matched.toLowerCase()) : undefined;

      if (fp) {
        // Matched a footprint category → find or create the topic at this intent.
        let sc = fp.subClusters.find(s => s.intent === intent);
        if (!sc) {
          const meta = INTENT_META[intent];
          sc = {
            intent, stage: meta.stage, contentType: meta.contentType, contentIcon: meta.contentIcon,
            keywords: [], totalVolume: 0, clientVolume: 0, competitorVolume: 0,
          };
          fp.subClusters.push(sc);   // a NEW (demand-only) topic under this category
        }
        sc.keywords.push(kw);
        fp.keywords.push(kw);
        touched.add(fp);
      } else {
        // No category match → seed-grouped missing-demand category.
        const seed  = (kw.demandSeeds && kw.demandSeeds[0]) ? kw.demandSeeds[0] : 'General demand';
        const label = seed.replace(/\b\w/g, c => c.toUpperCase());
        const k = label.toLowerCase();
        if (!seedGroups.has(k)) seedGroups.set(k, { name: label, keywords: [] });
        seedGroups.get(k)!.keywords.push(kw);
      }
    }

    // Recompute volumes on footprint clusters that absorbed demand.
    for (const c of Array.from(touched)) {
      for (const sc of c.subClusters) sc.totalVolume = sc.keywords.reduce((s, k) => s + k.searchVolume, 0);
      c.totalVolume = c.keywords.reduce((s, k) => s + k.searchVolume, 0);
    }

    // Seed (no-category-match) demand → its own demand category with intent topics.
    for (const g of Array.from(seedGroups.values())) {
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
interface Topic {
  id:            string;
  parentName:    string;
  parentType:    'procedure' | 'brand' | 'location' | 'demand';
  product:       string;        // v7.190: sub-product name (client page name when matched, else mined modifier, else Core)
  productKey:    string;        // v7.190: stable product grouping key
  pageUrl?:      string;        // v7.190: client product-page URL when this product maps to a real page
  intent:        IntentType;
  stage:         JourneyStage;
  contentType:   string;
  contentIcon:   string;
  keywords:      KwItem[];
  totalVolume:   number;
}

interface TopicStat {
  topic:             Topic;
  isLeading:         boolean;
  compGapPct:        number;
  stage:             JourneyStage;
  isClientFootprint: boolean;
  isDemand:          boolean;
}

// ─── Sub-product splitter (v7.190) — domain-agnostic ──────────────────────────
// Wayne: a broad theme ("Credit Cards") is really many PRODUCTS — balance transfer,
// secured, cash back, and each of the client's actual card pages — every one its
// own topic cluster with its own funnel. We split a procedure theme's keywords into
// products mined FROM THE DATA ONLY (never a hardcoded vertical word list — the
// v7.187 rule):
//   1. CLIENT PAGES first — each client-ranked keyword's real ranking URL slug is a
//      product page; the slug becomes a product named from the client's own slug.
//   2. KEYWORD MODIFIERS — distinctive words / adjacent bigrams left after stripping
//      the theme's own head words + generic question/intent words, kept when they
//      recur (≥2 keywords). Catches products with no matched page yet.
//   3. CORE — keywords with no distinctive modifier stay in a "Core" product so
//      nothing is dropped.
// Deep-journey demand keywords flow through the SAME matcher, so they deepen the
// right product automatically — the hybrid feedback loop Wayne asked for.

const KW_STOP = new Set<string>([
  'the','and','for','with','without','your','you','our','their','this','that','these','those',
  'what','whats','which','who','whom','how','why','when','where','are','was','were','being','been',
  'does','did','can','could','will','would','should','about','near','vs','versus','its','get','getting',
  'got','use','using','need','want','much','many','best','top','online','app','from','into','out',
]);

function headTokenSet(name: string): Set<string> {
  const h = new Set<string>();
  for (const w of name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (w.length >= 3) { h.add(w); h.add(w.endsWith('s') ? w.slice(0, -1) : w + 's'); }
  }
  return h;
}

function prodTokens(s: string, head: Set<string>): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !KW_STOP.has(w) && !head.has(w) && !/^\d+$/.test(w));
}

function titleCaseWords(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function slugOf(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  const segs = path.split('/').filter(Boolean);
  return segs.length ? segs[segs.length - 1] : '';
}

interface ProdSeed { key: string; label: string; tokens: Set<string>; pageUrl?: string; gram: number; }

// Mine product seeds from a theme's keywords: client page slugs first, then
// recurring keyword modifiers (bigrams before unigrams). Sorted most-specific first.
function deriveProductSeeds(kws: KwItem[], head: Set<string>): ProdSeed[] {
  const pageSeeds = new Map<string, ProdSeed>();
  for (const k of kws) {
    if (k.origin === 'demand' || k.position === null || !k.url) continue;  // client-ranked footprint pages only
    const slug = slugOf(k.url);
    if (!slug) continue;
    const toks = prodTokens(slug.replace(/[-_]/g, ' '), head);
    if (toks.length === 0) continue;
    const key = 'page:' + slug;
    if (!pageSeeds.has(key)) {
      pageSeeds.set(key, { key, label: titleCaseWords(slug), tokens: new Set(toks), pageUrl: k.url, gram: toks.length + 2 });
    }
  }

  const uni = new Map<string, number>();
  const bi  = new Map<string, number>();                 // key = the two tokens sorted (order-independent)
  const biLabel = new Map<string, Map<string, number>>(); // sorted key → original-order phrase → count (pick most common for the label)
  for (const k of kws) {
    const toks = prodTokens(k.keyword, head);
    const seen = new Set<string>();
    for (const t of toks) if (!seen.has(t)) { uni.set(t, (uni.get(t) ?? 0) + 1); seen.add(t); }
    for (let i = 0; i < toks.length - 1; i++) {
      const a = toks[i], b2 = toks[i + 1];
      if (a === b2) continue;
      const key  = [a, b2].slice().sort().join(' ');
      const orig = a + ' ' + b2;
      bi.set(key, (bi.get(key) ?? 0) + 1);
      let lm = biLabel.get(key); if (!lm) { lm = new Map(); biLabel.set(key, lm); }
      lm.set(orig, (lm.get(orig) ?? 0) + 1);
    }
  }
  const MIN = 2;
  const mined: ProdSeed[] = [];
  for (const [key, n] of Array.from(bi.entries())) {
    if (n < MIN) continue;
    const [t1, t2] = key.split(' ');
    let label = key, lbest = -1;
    for (const [orig, c] of Array.from((biLabel.get(key) ?? new Map<string, number>()).entries())) if (c > lbest) { lbest = c; label = orig; }
    mined.push({ key: 'kw:' + key, label: titleCaseWords(label), tokens: new Set([t1, t2]), gram: 2 });
  }
  // Keep unigram seeds too (no subsumption): a kw carrying BOTH tokens of a bigram
  // is drawn to the more-specific bigram in bestSeed(); a kw with only the single
  // token still has a home. Empty seeds simply yield no topic.
  for (const [u, n] of Array.from(uni.entries())) {
    if (n < MIN) continue;
    mined.push({ key: 'kw:' + u, label: titleCaseWords(u), tokens: new Set([u]), gram: 1 });
  }

  return Array.from(pageSeeds.values()).concat(mined).sort((a, b) => b.gram - a.gram);
}

// Best product seed for a keyword: multi-token seeds need ALL tokens present
// (precise); unigrams need the token. Most shared tokens wins, then specificity.
function bestSeed(kw: KwItem, head: Set<string>, seeds: ProdSeed[]): ProdSeed | null {
  const toks = new Set<string>(prodTokens(kw.keyword, head));
  if (kw.url) for (const t of prodTokens(slugOf(kw.url).replace(/[-_]/g, ' '), head)) toks.add(t);
  let best: ProdSeed | null = null;
  let bestScore = 0;
  for (const s of seeds) {
    let shared = 0;
    for (const t of Array.from(s.tokens)) if (toks.has(t)) shared++;
    if (shared === 0) continue;
    if (s.tokens.size > 1 && shared < s.tokens.size) continue;
    const score = shared * 10 + s.gram;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// v7.194: shared key for the "Core" (un-split) keyword bucket. A core bucket has
// NO distinct product, so its sub-topics are labelled by INTENT (General /
// Informational / …) — never by the parent theme name (which would make every
// intent row look like a duplicate of the parent). TopicTable keys off this too.
const CORE_KEY = '__core__';

// v7.190: flatten each theme into PRODUCT × intent topics. Broad procedure themes
// are product-split; brand/location/demand themes stay one product (= the theme), so
// they behave exactly as before. Per-keyword intent is read back from the
// subClusters buildThemeClusters already computed — no re-classification.
function flattenTopics(clusters: ThemeCluster[]): Topic[] {
  const topics: Topic[] = [];
  for (const c of clusters) {
    if (c.keywords.length === 0) continue;

    const intentOf = new Map<KwItem, IntentCluster>();
    for (const sc of c.subClusters) for (const kw of sc.keywords) intentOf.set(kw, sc);

    const head = headTokenSet(c.name);
    const split = c.type === 'procedure' && c.keywords.length >= 6;

    const byProduct = new Map<string, { label: string; pageUrl?: string; kws: KwItem[] }>();
    const place = (key: string, label: string, pageUrl: string | undefined, kw: KwItem) => {
      let p = byProduct.get(key);
      if (!p) { p = { label, pageUrl, kws: [] }; byProduct.set(key, p); }
      if (pageUrl && !p.pageUrl) p.pageUrl = pageUrl;
      p.kws.push(kw);
    };

    if (split) {
      const seeds = deriveProductSeeds(c.keywords, head);
      for (const kw of c.keywords) {
        const s = bestSeed(kw, head, seeds);
        if (s) place(s.key, s.label, s.pageUrl, kw);
        else   place(CORE_KEY, '', undefined, kw);   // core leftover: labelled by intent at push time
      }
      // Fold tiny mined products (a single keyword, no page) back into Core so the
      // table doesn't fragment into one-off rows; page products always stand alone.
      for (const [key, p] of Array.from(byProduct.entries())) {
        if (key !== CORE_KEY && !p.pageUrl && key.startsWith('kw:') && p.kws.length < 2) {
          byProduct.delete(key);
          const core = byProduct.get(CORE_KEY) ?? { label: '', pageUrl: undefined, kws: [] };
          core.kws.push(...p.kws);
          byProduct.set(CORE_KEY, core);
        }
      }
    } else {
      // Non-split theme: ALL keywords share the parent. Place them under the core
      // bucket with NO product label so each intent sub-topic is named by its intent
      // (General / Informational / …), not by repeating the parent theme name.
      for (const kw of c.keywords) place(CORE_KEY, '', undefined, kw);
    }

    for (const [pkey, prod] of Array.from(byProduct.entries())) {
      const intentBuckets = new Map<IntentType, KwItem[]>();
      for (const kw of prod.kws) {
        const sc = intentOf.get(kw);
        const intent = sc ? sc.intent : (detectIntentSignal(kw.keyword) ?? 'unmatched');
        if (!intentBuckets.has(intent)) intentBuckets.set(intent, []);
        intentBuckets.get(intent)!.push(kw);
      }
      for (const [intent, items] of Array.from(intentBuckets.entries())) {
        if (items.length === 0) continue;
        const meta = INTENT_META[intent];
        topics.push({
          id:          `${c.id}::${pkey}::${intent}`,
          parentName:  c.name,
          parentType:  c.type,
          // Core bucket has no product → name the sub-topic by its intent so a
          // non-split theme never repeats the parent name on every row (v7.194).
          product:     pkey === CORE_KEY ? meta.label : prod.label,
          productKey:  pkey,
          pageUrl:     prod.pageUrl,
          intent,
          stage:       meta.stage,
          contentType: meta.contentType,
          contentIcon: meta.contentIcon,
          keywords:    items,
          totalVolume: items.reduce((s, k) => s + k.searchVolume, 0),
        });
      }
    }
  }
  return topics;
}

// A topic is "missing demand" (a third lens) when it is a seed demand category OR
// every one of its keywords came from the deep-journey demand universe. A footprint
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
const TYPE_META: Record<'procedure' | 'brand' | 'location' | 'demand', { label: string; color: string; bg: string; bdr: string }> = {
  procedure: { label: 'Procedure',     color: 'var(--c-9b96ff)', bg: 'var(--ca-155-150-255-0_10)', bdr: 'var(--ca-155-150-255-0_30)' },
  brand:     { label: 'Brand',         color: 'var(--c-f59e0b)', bg: 'var(--ca-245-158-11-0_10)',  bdr: 'var(--ca-245-158-11-0_30)' },
  location:  { label: 'Location',      color: 'var(--c-38bdf8)', bg: 'var(--ca-56-189-248-0_10)',  bdr: 'var(--ca-56-189-248-0_30)' },
  demand:    { label: 'Missing demand',color: 'var(--c-22d3ee)', bg: 'var(--c-062a32)',                bdr: 'var(--c-0e4753)' },
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-e2e2f6)' }}>{cluster.name}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 20, background: tm.bg, border: `1px solid ${tm.bdr}`, color: tm.color,
        }}>{tm.label}</span>
        <span style={{ fontSize: 11, color: 'var(--c-5a5a78)' }}>
          {topics.length} topic{topics.length === 1 ? '' : 's'} · {fmtVol(shownVol)}/mo
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--c-181828)' }} />
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

function TopicTable({
  rows, sortKey, sortDir, onSort, expanded, onToggle,
}: {
  rows: TopicRow[]; sortKey: SortKey; sortDir: 1 | -1; onSort: (k: SortKey) => void;
  expanded: Set<string>; onToggle: (id: string) => void;
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
            const agg = new Map<string, { n: number; vol: number }>();
            for (const r of rows) {
              const a = agg.get(r.t.parentName) ?? { n: 0, vol: 0 };
              a.n += 1; a.vol += r.t.totalVolume; agg.set(r.t.parentName, a);
            }
            const out: React.ReactNode[] = [];
            let lastParent: string | null = null;
            rows.forEach(({ t, m }) => {
              if (grouped && t.parentName !== lastParent) {
                lastParent = t.parentName;
                const a = agg.get(t.parentName)!;
                out.push(
                  <tr key={`hdr:${t.parentName}`}>
                    <td colSpan={7} style={{ padding: '9px 12px', background: 'var(--c-0c0c16)', borderTop: '1px solid var(--c-15152a)', borderBottom: '1px solid var(--c-23233a)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-e2e2f6)' }}>{t.parentName}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--c-6a6a90)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {a.n} {a.n === 1 ? 'topic' : 'topics'} · {fmtVol(a.vol)}/mo
                        </span>
                      </div>
                    </td>
                  </tr>,
                );
              }
              const stm    = STAGE_META[t.stage];
              const stt    = TBL_STATUS[m.status];
              const open   = expanded.has(t.id);
              const isCore = t.productKey === CORE_KEY;
              const topKws = t.keywords.slice().sort((a, b) => b.searchVolume - a.searchVolume).slice(0, 24);
              out.push(
                <Fragment key={t.id}>
                  <tr
                    onClick={() => onToggle(t.id)}
                    style={{ cursor: 'pointer', borderLeft: `2px solid ${stt.color}`, background: open ? 'var(--c-101019)' : 'transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--c-101019)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = open ? 'var(--c-101019)' : 'transparent'; }}
                  >
                    <td style={{ padding: '8px 10px', paddingLeft: grouped ? 26 : 10, borderBottom: '1px solid var(--c-15152a)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
}: {
  clusters:      ThemeCluster[];
  clientDomain:  string;
  loadingClaude: boolean;
}) {
  const [filter, setFilter] = useState<ClusterFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('group');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const onSort = (k: SortKey) => {
    if (k === sortKey) { setSortDir(d => (d === 1 ? -1 : 1)); return; }
    setSortKey(k);
    setSortDir(k === 'group' || k === 'product' || k === 'stage' ? 1 : -1);
  };

  // ── Flatten categories → TOPICS (the counted unit) + classify each ──────────
  const topics: Topic[] = flattenTopics(clusters);
  const topicStats: TopicStat[] = topics.map(classifyTopic);
  const catCount = new Set(clusters.map(c => `${c.type}:${c.name}`)).size;

  const leadingStats  = topicStats.filter(s => !s.isDemand &&  s.isLeading);
  const trailingStats = topicStats.filter(s => !s.isDemand && !s.isLeading);
  // Opportunity = competitor gap vol < 25% of topic total AND client not already leading
  // (fully-won topics score compGapPct=0 which would falsely pass < 0.25)
  const oppStats      = topicStats.filter(s => !s.isDemand && s.compGapPct < 0.25 && !s.isLeading);

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
        // Parent first; within a parent, core (intent-only) sub-topics come first in
        // funnel order, then each split product group, each in funnel order.
        r = a.t.parentName.localeCompare(b.t.parentName);
        if (r === 0) r = (a.t.productKey === CORE_KEY ? 0 : 1) - (b.t.productKey === CORE_KEY ? 0 : 1);
        if (r === 0 && a.t.productKey !== CORE_KEY) r = a.t.product.localeCompare(b.t.product);
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

        {/* Right: funnel-stage roll-up as a HALF inverted pyramid (v7.148). */}
        {/* Pyramid is cut vertically with the flat edge on the right so each  */}
        {/* stage's label / count / split sits beside its band. Each band is   */}
        {/* clickable → filter the grid by that dominant stage (toggle to all). */}
        <div style={{
          background: 'var(--c-0f0f1e)', border: '1px solid var(--c-1e1e34)', borderRadius: 12,
          padding: '12px 14px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <i className="ti ti-filter" style={{ fontSize: 12, color: 'var(--c-8b85ff)' }} aria-hidden="true" />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--c-585878)' }}>
              Clusters by funnel stage
            </span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--c-3a3a5a)', marginBottom: 10, lineHeight: 1.4 }}>
            Each cluster counted once · stage = its dominant intent ·&nbsp;
            <span style={{ color: 'var(--c-4ade80)' }}>client</span> ranks for most /&nbsp;
            <span style={{ color: 'var(--c-f59e0b)' }}>gap</span> = competitors own most · click to filter
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, justifyContent: 'center' }}>
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
                  style={{
                    display:    'flex',
                    alignItems: 'stretch',
                    gap:        10,
                    width:      '100%',
                    background: active ? 'var(--ca-155-150-255-0_08)' : 'transparent',
                    border:     'none',
                    borderRadius: 8,
                    padding:    '3px 4px',
                    cursor:     'pointer',
                    textAlign:  'left',
                    outline:    'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--ca-155-150-255-0_04)'; }}
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
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.03em', color: active ? 'var(--c-c8c4ff)' : 'var(--c-c8c8e8)' }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.5px', color: active ? 'var(--c-9b96ff)' : 'var(--c-e8e8ff)' }}>
                        {r.total}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--c-585878)' }}>topics</span>
                      {active && (
                        <span style={{
                          marginLeft: 'auto', fontSize: 8, fontWeight: 700,
                          background: 'var(--ca-155-150-255-0_10)', border: '1px solid var(--ca-155-150-255-0_45)',
                          color: 'var(--c-9b96ff)', borderRadius: 20, padding: '1px 6px',
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--c-6a6a90)', marginTop: 2 }}>
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
      {filtered.length > 0 && (
        <TopicTable
          rows={sortedRows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          expanded={expanded}
          onToggle={toggleRow}
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
  // v7.190: a "topic" is now a PRODUCT × funnel-stage row (broad themes split into
  // their product sub-clusters), so count the flattened table rows.
  const topicCnt   = flattenTopics(baseClusters).length;
  const catCnt     = baseClusters.length;

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
        <ClustersTab clusters={baseClusters} clientDomain={clientDomain} loadingClaude={loadingClaude} />
      )}
    </div>
  );
}
