'use client';

import { useMemo, useState, useEffect, useCallback, Fragment } from 'react';
import { buildKwPool, isBrandedKeyword, extractBrand, buildCompetitorBrandTokens, textHasCompetitorBrand, buildExcludedBrandTokens } from '@/lib/utils/kwVolume';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';   // v7.226: shared competitor-brand category guard (Const III.1a)
import { buildTaxonomyTree, type TaxoTreeNode } from '@/lib/category/taxonomyTree';   // v7.239: ONE shared tree builder — same source as the Keyword panel (Const II.7)
import { buildJourneyClassifier } from './JourneySection';   // v7.203: single-source product/pre-product split

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';

export interface KwItem {
  keyword:      string;
  searchVolume: number;
  position:     number | null;   // null = client not ranking
  isGap:        boolean;         // competitor ranks, client doesn't
  competitor:   string | null;   // domain that ranks for gap keywords
  origin?:      'footprint' | 'demand';  // v7.162: provenance (demand = deep-journey "missing demand")
  demandSeeds?: string[];        // v7.162: seed(s) that surfaced a demand keyword
  url?:         string;          // v7.190: client's ranking page URL (for sub-product page detection)
  subTopic?:    string;          // v7.238: the canonical sub-topic from the STORED taxonomy path
                                 // (the node BELOW the theme, i.e. keywordPaths[kw] level after path[1]).
                                 // Used to label cluster sub-topics from the taxonomy instead of mining
                                 // names from keyword text — so the Cluster panel mirrors the Keyword tree.
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
  type:        'procedure' | 'brand' | 'location' | 'demand' | 'problem';  // v7.162: 'demand' = missing-demand; v7.203: 'problem' = pre-product life-problem theme
  // v7.236: the umbrella (stored taxonomy path[0]) this theme sits under, from
  // `_categoryBreakdown.categories[].parent` — so the Cluster panel nests like the Keyword tree.
  parentLine?: string;
  keywords:    KwItem[];
  totalVolume: number;
  subClusters: IntentCluster[];
  // v7.168: when a footprint cluster ABSORBS same-intent deep-journey demand
  // (merge case), record how much so the card can flag it. Demand surfaced at a
  // NOT-yet-covered intent becomes its own modifier-titled 'demand' cluster instead.
  demandMergedCount?: number;
  demandMergedVol?:   number;
  // v7.199: AI intent groups for this category (from the "Refine with AI" pass /
  // pipeline). When present, buildIntentClusters uses these instead of the heuristic
  // — they merge synonym intents the heuristic can't ("529 account" ≈ "529 college
  // plan") and carry an AI-chosen topical name + funnel stage.
  aiGroups?: Array<{ name: string; stage?: JourneyStage; keywords: string[] }>;
}

interface Props {
  projectId:                string;
  kwVersion?:  number;   // v7.107: parent bumps to force /keywords refetch (e.g. after Competitors modal closes)
  analysis:                 any;
  competitors:              string[];
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

export function detectIntentSignal(keyword: string): IntentType | null {
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

// v7.199: representative funnel intent for a stage (reverse of INTENT_META.stage) —
// used when an AI intent group supplies a stage directly.
const STAGE_INTENT: Record<JourneyStage, IntentType> = {
  awareness: 'informational', consideration: 'commercial', decision: 'transactional', retention: 'navigational',
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
  excludeKeywords?:    Set<string>,   // v7.203: pre-product kws routed to problem themes — drop here so a kw is never counted in both lanes
): ThemeCluster[] {
  const semSnap  = analysis?.semrushSnapshot ?? {};
  const cb       = semSnap._categoryBreakdown ?? null;
  // v7.226: competitor-brand category guard, centralized in lib/category/categoryGuard
  // (Const III.1a). Replaces the prior inline token-set construction (v7.201 auto-discovered
  // + configured competitor brands, v7.208 user blocklist) — identical behavior, now the
  // SAME guard the Keyword panel uses, so both panels drop exactly the same brand categories.
  const categoryGuard = buildCategoryGuard(semSnap, clientDomain, competitorDomains);
  const categories: Array<{ name: string; type: 'procedure' | 'brand' | 'location' }> =
    (cb?.categories ?? []).map((c: any) => ({
      name: c.name,
      type: (c.type === 'brand' || c.type === 'location') ? c.type : 'procedure',
    }));

  if (categories.length === 0) return [];

  const storedMap: Record<string, string> = cb?.keywordCategories ?? {};

  // v7.236: theme → umbrella (stored taxonomy parent, path[0]) from `_categoryBreakdown`,
  // so the Cluster panel can nest umbrella → theme exactly like the Keyword tree (Const III.1b).
  // Read-only; never re-derived from keyword text. Absent on pre-taxonomy analyses → umbrella
  // falls back to the theme name (top-level) in flattenTopics.
  const umbrellaByCat = new Map<string, string>();
  for (const c of (cb?.categories ?? [])) {
    const nm = String(c?.name ?? '').trim();
    const par = String(c?.parent ?? '').trim();
    if (nm && par) umbrellaByCat.set(nm.toLowerCase(), par);
  }

  // ── Build keyword pool via shared utility — identical filtering to Keyword Landscape ──
  // v7.162: includeDemand unions the deep-journey demand universe into the pool
  // as origin:'demand' ("missing demand"). When no deep journey has been built
  // (`_demandUniverse` absent) this returns the identical footprint pool, so this
  // panel is byte-for-byte unchanged for existing analyses.
  let rawPool = buildKwPool({
    semrushSnapshot:  semSnap,
    uploadedKeywords,
    clientDomain,
    competitorDomains,
    clientVolMin,
    competitorVolMin,
    includeDemand:    true,
  });
  // v7.203: drop pre-product keywords (they live in their own awareness-only problem
  // clusters) so the same keyword is never counted in both the product and pre-product
  // lanes. Volumes downstream stay exact real roll-ups of whatever remains.
  if (excludeKeywords && excludeKeywords.size > 0) {
    rawPool = rawPool.filter(k => !excludeKeywords.has(k.keyword.toLowerCase()));
  }

  // v7.190: client ranking-page URL by keyword (from the Semrush footprint) — used
  // by the sub-product splitter to detect each product PAGE and name a product
  // from the client's own slug. Real data only; absent for demand/gap keywords.
  const urlByKeyword = new Map<string, string>();
  for (const k of (semSnap.topKeywords ?? [])) {
    const key = (k?.keyword ?? '').toLowerCase();
    if (key && k?.url && !urlByKeyword.has(key)) urlByKeyword.set(key, k.url);
  }

  // Map to KwItem (ThemeClusters internal type), carrying provenance.
  // v7.238: the STORED canonical taxonomy path per keyword (the SAME source the Keyword tree
  // renders). The sub-topic = the node BELOW the theme (path[2]; path[0]=umbrella, path[1]=theme).
  // We label cluster sub-topics from THIS, never from mined keyword text (Const III.1b/II.8).
  const pathByKw: Record<string, string[]> = (cb?.keywordPaths ?? {}) as Record<string, string[]>;
  const subTopicOf = (kwLower: string): string => {
    const p = pathByKw[kwLower];
    return (Array.isArray(p) && p.length > 2) ? String(p[2] ?? '').trim() : '';
  };
  const pool: KwItem[] = rawPool.map(item => ({
    keyword:      item.keyword,
    searchVolume: item.searchVolume,
    position:     item.position,
    isGap:        item.isGap,
    competitor:   item.competitor,
    origin:       item.origin,
    demandSeeds:  item.demandSeeds,
    url:          urlByKeyword.get(item.keyword.toLowerCase()),
    subTopic:     subTopicOf(item.keyword.toLowerCase()),
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

  // v7.199: AI intent groups (from "Refine with AI" / pipeline), keyed by category.
  const aiGroupsByCat = new Map<string, Array<{ name: string; stage?: JourneyStage; keywords: string[] }>>();
  for (const g of (cb?.intentGroups ?? []) as Array<{ category?: string; name?: string; stage?: JourneyStage; keywords?: string[] }>) {
    const catName = String(g?.category ?? '');
    const name    = String(g?.name ?? '').trim();
    if (!catName || !name || !Array.isArray(g?.keywords)) continue;
    const arr = aiGroupsByCat.get(catName) ?? [];
    arr.push({ name, stage: g.stage, keywords: g.keywords!.map(k => String(k).toLowerCase()) });
    aiGroupsByCat.set(catName, arr);
  }

  const result: ThemeCluster[] = [];

  for (const cat of categories) {
    // v7.196/201/208 → centralized v7.226: never render a COMPETITOR (non-client) brand
    // category as a cluster. buildKwPool already strips its keywords; this is the defensive
    // category-level guard so an "American Express" / "Bank of America" / "529 Schwab" brand
    // category can never appear even if a stray member keyword slips through. The client's
    // own brand category is kept (its name contains the client brand). Same guard the Keyword
    // panel now applies (Const III.1a — the guard, not the synthesis output, is enforcement).
    if (categoryGuard.isCompetitorBrandCategory(cat.name, cat.type)) continue;
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

    result.push({ id: cat.name, name: cat.name, type: cat.type, parentLine: umbrellaByCat.get(cat.name.toLowerCase()), keywords: kws, totalVolume, subClusters, aiGroups: aiGroupsByCat.get(cat.name) });
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
    const order = { procedure: 0, brand: 1, location: 2, demand: 3, problem: 4 };
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
export interface Topic {
  id:            string;
  parentName:    string;
  // v7.236: the umbrella (taxonomy path[0]) the parent theme sits under — the SAME stored
  // hierarchy the Keyword panel renders (`_categoryBreakdown.categories[].parent`). Lets the
  // Cluster panel nest umbrella → theme → topic, mirroring the keyword tree (Const II.7/III.1b).
  // Falls back to parentName (top-level) when the analysis carries no stored umbrella.
  umbrella:      string;
  parentType:    'procedure' | 'brand' | 'location' | 'demand' | 'problem';
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
// A "core" topic (brand/location/demand intent bucket) is labelled by its intent and
// shows no parent sub-label. Procedure intent clusters (cmp|/def|/gen|…) are not core.
const isCoreKey = (k: string): boolean => k === CORE_KEY || k.startsWith(CORE_KEY + '::');

// ─── v7.197: semantic SEARCH-INTENT clustering ───────────────────────────────
// Wayne's rule: a cluster represents a SINGLE search intent (one answerable question)
// mapped to ONE page, and is NAMED after that intent ("What is a 401k", "401k vs
// IRA", "401k Withdrawal") — NOT the bare keyword modifier, and NEVER fragmented by
// funnel type. So within a category we group keywords by the intent BEHIND them and
// merge across funnel types (a comparison may be informational AND commercial → still
// ONE cluster), then give each cluster a topical name. The cluster's single funnel
// stage = the dominant intent by volume.
//
// HYBRID (Wayne's choice): this heuristic runs NOW on existing data. A later LLM
// grouping pass can populate `_categoryBreakdown.keywordIntentClusters` (keyword →
// cluster name) + names; `buildIntentClusters` is the single seam to switch to it.
type IntentKind = 'compare' | 'define' | 'howto' | 'cost' | 'amount' | 'best' | 'general';

// Words stripped to reveal the ENTITIES a keyword is about (intent markers + glue).
const INTENT_SIGNAL_WORDS = new Set<string>([
  'vs','versus','difference','differences','differ','different','compare','compared','comparison',
  'between','advantage','advantages','alternative','alternatives','better','instead','than','over',
  'what','whats','is','are','was','were','how','does','do','did','work','works','working','mean','means',
  'meaning','definition','define','explain','explained','to','guide','step','steps','way','ways','tutorial',
  'cost','costs','price','prices','pricing','fee','fees','much','many','best','top','review','reviews',
  'rated','should','need','needs','have','has','get','a','an','the','of','for','in','on','at','by',
  'my','your','you','i','me','we','it','and','or','with','about','near','can','could','will','would',
]);

function entityTokens(kw: string): string[] {
  return kw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !INTENT_SIGNAL_WORDS.has(w))
    .map(w => (w.length > 3 && w.endsWith('s') && !/\d/.test(w) ? w.slice(0, -1) : w));
}

// Classify the SEMANTIC intent (not the funnel stage). Comparison is tested first so
// "explain the difference between a 401k and an ira" reads as compare, not define.
function intentKindOf(kw: string): IntentKind {
  const s = ' ' + kw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const has = (p: string) => s.includes(p);
  if (has(' vs ') || has(' versus ') || has(' v ') || has('difference') || has('compared to') ||
      has('comparison') || has('advantage over') || has('advantages over') || has('better than') ||
      has('alternative to') || has('alternatives to') || has('instead of')) return 'compare';
  if (has(' what is ') || has(' what are ') || has(' whats ') || has(' what s ') ||
      (has(' how does ') && has('work')) || (has(' how do ') && has('work')) ||
      has('meaning') || has('definition') || has(' explained ') || (has('what does') && has('mean'))) return 'define';
  if (has(' how to ') || has(' how do i ') || has(' how can i ') || has(' how do you ') ||
      has('steps to') || has('step by step') || has('tutorial') || has(' guide ')) return 'howto';
  if (has('cost') || has('price') || has('fee')) return 'cost';
  if (has('how much') || has('how many')) return 'amount';
  if (has(' best ') || has('top ') || has('review') || has('rated')) return 'best';
  return 'general';
}

function smartCaseToken(t: string): string {
  if (/\d/.test(t)) return t;                          // "401k" stays "401k"
  if (t.length <= 3) return t.toUpperCase();           // ira→IRA, apr→APR, roi→ROI
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function sentenceCase(kw: string): string {
  const t = kw.trim().replace(/\s+/g, ' ').replace(/\bi\b/g, 'I');   // standalone "i" → "I"
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

interface IntentGroup { key: string; name: string; kws: KwItem[]; pageUrl?: string; stage?: JourneyStage }

// v7.199: prefer the AI intent groups when this category has them (they merge
// synonym intents the heuristic can't). Any keyword the AI didn't place falls back
// to the heuristic so NO keyword is ever lost. Without AI groups → pure heuristic.
function buildIntentClusters(c: ThemeCluster): IntentGroup[] {
  if (!c.aiGroups || c.aiGroups.length === 0) return buildIntentClustersHeuristic(c);

  const byKw = new Map<string, KwItem>();
  for (const k of c.keywords) byKw.set(k.keyword.toLowerCase().trim(), k);

  const out: IntentGroup[] = [];
  const claimed = new Set<string>();
  for (const g of c.aiGroups) {
    const kws: KwItem[] = [];
    for (const kwLow of g.keywords) {
      const item = byKw.get(kwLow);
      if (item && !claimed.has(kwLow)) { kws.push(item); claimed.add(kwLow); }
    }
    if (kws.length === 0) continue;
    out.push({
      key: 'ai|' + g.name, name: g.name, kws, stage: g.stage,
      pageUrl: kws.find(k => k.position !== null && k.url)?.url,
    });
  }
  // leftovers (kw not claimed by any AI group) → heuristic, so nothing is dropped
  const leftover = c.keywords.filter(k => !claimed.has(k.keyword.toLowerCase().trim()));
  if (leftover.length > 0) {
    out.push(...buildIntentClustersHeuristic({ ...c, keywords: leftover, aiGroups: undefined }));
  }
  return out;
}

// Group ONE category's keywords into single-intent clusters (heuristic — the new "topics").
function buildIntentClustersHeuristic(c: ThemeCluster): IntentGroup[] {
  const head = headTokenSet(c.name);
  // category frequency of each non-head entity token → used to pick the distinctive
  // modifier that anchors a general/howto/etc cluster (e.g. "withdrawal", "rollover").
  const freq = new Map<string, number>();
  for (const k of c.keywords) {
    const seen = new Set<string>();
    for (const t of entityTokens(k.keyword)) {
      if (head.has(t) || seen.has(t)) continue;
      seen.add(t); freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  const bestModifier = (nonHead: string[]): string => {
    let mod = '', best = -1;
    for (const t of nonHead) {
      const f = freq.get(t) ?? 0;
      if (f > best || (f === best && t.length > mod.length)) { best = f; mod = t; }
    }
    return mod;
  };

  const groups = new Map<string, { kind: IntentKind; kws: KwItem[]; pageUrl?: string }>();
  for (const kw of c.keywords) {
    const kind = intentKindOf(kw.keyword);
    const ents = Array.from(new Set(entityTokens(kw.keyword)));
    const nonHead = ents.filter(t => !head.has(t));
    let sig: string;
    if (kind === 'compare')      sig = 'cmp|' + ents.slice().sort().join(',');
    else if (kind === 'define')  sig = 'def|' + (ents.filter(t => head.has(t)).sort().join(',') || ents.slice().sort().join(',') || 'core');
    else if (kind === 'general') sig = 'gen|' + (bestModifier(nonHead) || 'core');
    else                         sig = kind + '|' + (bestModifier(nonHead) || nonHead.slice().sort().join(',') || 'core');
    let g = groups.get(sig);
    if (!g) { g = { kind, kws: [] }; groups.set(sig, g); }
    g.kws.push(kw);
    if (!g.pageUrl && kw.position !== null && kw.url) g.pageUrl = kw.url;
  }

  const out: IntentGroup[] = [];
  for (const [sig, g] of Array.from(groups.entries())) {
    out.push({ key: sig, name: nameIntentCluster(c, g.kind, g.kws, head), kws: g.kws, pageUrl: g.pageUrl });
  }
  return out;
}

// Topical NAME for an intent cluster, by intent kind.
function nameIntentCluster(c: ThemeCluster, kind: IntentKind, kws: KwItem[], head: Set<string>): string {
  const topKw = kws.slice().sort((a, b) => b.searchVolume - a.searchVolume)[0]?.keyword ?? c.name;
  const ef = new Map<string, number>();
  for (const k of kws) for (const t of Array.from(new Set(entityTokens(k.keyword)))) ef.set(t, (ef.get(t) ?? 0) + 1);
  const byFreq = Array.from(ef.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(e => e[0]);

  if (kind === 'compare') {
    const headEnt = byFreq.find(t => head.has(t));
    const others  = byFreq.filter(t => t !== headEnt);
    const pair = [headEnt, others[0]].filter(Boolean) as string[];
    if (pair.length === 2) return `${smartCaseToken(pair[0])} vs ${smartCaseToken(pair[1])}`;
    return sentenceCase(topKw);
  }
  if (kind === 'define') {
    const wi = kws.map(k => k.keyword).find(k => /\bwhat\s+is\b/i.test(k));
    if (wi) return sentenceCase(wi);
    const ent = byFreq.find(t => head.has(t)) ?? byFreq[0];
    return ent ? `What is a ${smartCaseToken(ent)}` : sentenceCase(topKw);
  }
  if (kind === 'howto') {
    const h = kws.map(k => k.keyword).find(k => /\bhow\s+to\b/i.test(k)) ?? topKw;
    return sentenceCase(h);
  }
  if (kind === 'cost') {
    const ent = byFreq.find(t => head.has(t)) ?? byFreq[0];
    return ent ? `${smartCaseToken(ent)} Cost` : sentenceCase(topKw);
  }
  if (kind === 'amount' || kind === 'best') return sentenceCase(topKw);
  // general → "{Head} {Modifier}" (e.g. "401k Withdrawal")
  const headEnt = byFreq.find(t => head.has(t));
  const modEnt  = byFreq.find(t => !head.has(t));
  if (headEnt && modEnt) return `${smartCaseToken(headEnt)} ${smartCaseToken(modEnt)}`;
  if (headEnt) return smartCaseToken(headEnt);
  return sentenceCase(topKw);
}

// v7.190: flatten each theme into PRODUCT × intent topics. Broad procedure themes
// are product-split; brand/location/demand themes stay one product (= the theme), so
// they behave exactly as before. Per-keyword intent is read back from the
// subClusters buildThemeClusters already computed — no re-classification.
// ─── v7.203: pre-product (life-problem) clusters ─────────────────────────────────
// Wayne: view Product journey vs Pre-product journey vs All. The product/pre-product
// split REUSES the Journey panel's definition (single source of truth, Art II.7): a
// keyword is pre-product only when it names NO solution (problem/symptom/trigger) yet
// is still topically relevant to the client — exactly what `buildJourneyClassifier`
// (extracted from JourneySection.buildClusters) decides. We classify the SAME pooled
// keywords this panel already builds (footprint + deep-journey demand), peel the
// pre-product ones into life-problem themes (awareness-only), and return the set of
// peeled keywords so buildThemeClusters can exclude them from the product lane → a
// keyword is never double-counted. Off-topic keywords are left in the product lane
// (this panel shows the full footprint; the Journey panel's relevance gate is its own
// lens). All volumes are exact real roll-ups — nothing modeled.
function buildPreProductClusters(
  analysis:          any,
  clientDomain:      string,
  competitorDomains: string[],
  uploadedKeywords:  any[] = [],
  clientVolMin:      number = 0,
  competitorVolMin:  number = 0,
  problemAssignments: Record<string, string> = {},
): { clusters: ThemeCluster[]; preProductKws: Set<string> } {
  const semSnap = analysis?.semrushSnapshot ?? {};
  const cb      = semSnap._categoryBreakdown ?? null;
  const preProductKws = new Set<string>();
  if (!cb?.categories?.length) return { clusters: [], preProductKws };

  const classifier = buildJourneyClassifier(analysis, clientDomain, competitorDomains, problemAssignments);
  const pool = buildKwPool({
    semrushSnapshot:  semSnap,
    uploadedKeywords,
    clientDomain,
    competitorDomains,
    clientVolMin,
    competitorVolMin,
    includeDemand:    true,
  });

  const byTheme = new Map<string, KwItem[]>();
  for (const kw of pool) {
    if (classifier.classify(kw.keyword) !== 'pre-product') continue;
    preProductKws.add(kw.keyword.toLowerCase());
    const theme = classifier.themeOf(kw.keyword);
    (byTheme.get(theme) ?? byTheme.set(theme, []).get(theme)!).push(kw);
  }

  const clusters: ThemeCluster[] = [];
  for (const [theme, kws] of Array.from(byTheme.entries())) {
    if (kws.length === 0) continue;
    const totalVolume      = kws.reduce((s, k) => s + k.searchVolume, 0);
    const clientVolume     = kws.filter(k => !k.isGap && k.origin !== 'demand').reduce((s, k) => s + k.searchVolume, 0);
    const competitorVolume = kws.filter(k =>  k.isGap).reduce((s, k) => s + k.searchVolume, 0);
    // Pre-product is awareness-only: one informational sub-cluster carrying the theme.
    const sub: IntentCluster = {
      intent:           'informational',
      stage:            'awareness',
      contentType:      INTENT_META.informational.contentType,
      contentIcon:      INTENT_META.informational.contentIcon,
      keywords:         kws,
      totalVolume,
      clientVolume,
      competitorVolume,
    };
    clusters.push({ id: `problem:${theme}`, name: theme, type: 'problem', keywords: kws, totalVolume, subClusters: [sub] });
  }
  clusters.sort((a, b) => b.totalVolume - a.totalVolume);
  return { clusters, preProductKws };
}

// ─── v7.239: cluster topics built from the SHARED taxonomy tree (Const II.7) ────────
// The Cluster panel's topic list is built from the SAME stored `keywordPaths` the Keyword
// panel renders, via the shared `buildTaxonomyTree`. Every node that holds its own keywords
// is one topic; its umbrella/theme/sub labels ARE the canonical taxonomy nodes (never mined
// from keyword text). Keywords without a stored path (deep-journey demand / pre-product
// problem themes) fall back to the intent-based `flattenTopics` so that incremental lens is
// preserved. Result: the Cluster panel mirrors the Keyword tree exactly for the footprint.
export function buildTopicsFromTaxonomy(clusters: ThemeCluster[], pathOf: Map<string, string[]>): Topic[] {
  // intent + type context per keyword from the clusters (so each taxonomy node can show a
  // dominant intent / journey stage / type without re-deriving them).
  const intentByKw = new Map<KwItem, IntentType>();
  const typeByKw   = new Map<KwItem, ThemeCluster['type']>();
  for (const c of clusters) {
    for (const sc of c.subClusters) for (const kw of sc.keywords) intentByKw.set(kw, sc.intent);
    for (const kw of c.keywords) if (!typeByKw.has(kw)) typeByKw.set(kw, c.type);
  }
  const hasPath = (kw: KwItem) => { const p = pathOf.get(kw.keyword.toLowerCase().trim()); return !!(p && p.length); };

  // De-duplicate footprint keywords (first cluster wins) that carry a stored path.
  const seen = new Set<string>();
  const withPath: KwItem[] = [];
  for (const c of clusters) for (const kw of c.keywords) {
    const k = kw.keyword.toLowerCase().trim();
    if (hasPath(kw) && !seen.has(k)) { seen.add(k); withPath.push(kw); }
  }

  const tree = buildTaxonomyTree<KwItem>(withPath, pathOf, {
    keyOf: (r) => r.keyword.toLowerCase().trim(),
    posOf: (r) => r.position,
    volOf: (r) => r.searchVolume,
  });

  const out: Topic[] = [];
  const walk = (n: TaxoTreeNode<KwItem>) => {
    if (n.own.length > 0) {
      const path     = n.path;
      const umbrella = path[0] ?? n.name;
      const theme    = path.length >= 2 ? path[1] : path[0];
      const isHead   = n.name === theme;     // node sits at the theme level (head-term page)
      // dominant intent by volume across this node's own keywords
      const volByIntent = new Map<IntentType, number>();
      for (const kw of n.own) {
        const it = intentByKw.get(kw) ?? detectIntentSignal(kw.keyword) ?? 'unmatched';
        volByIntent.set(it, (volByIntent.get(it) ?? 0) + kw.searchVolume);
      }
      let intent: IntentType = 'unmatched', dv = -1;
      for (const [it, v] of Array.from(volByIntent.entries())) if (v > dv) { dv = v; intent = it; }
      const type  = typeByKw.get(n.own[0]) ?? 'procedure';
      const meta  = INTENT_META[intent];
      const stage: JourneyStage = type === 'problem' ? 'awareness' : meta.stage;
      out.push({
        id:          'tax:' + n.id,
        parentName:  theme,
        umbrella,
        parentType:  type,
        product:     n.name,
        productKey:  isHead ? `${CORE_KEY}::${n.id}` : `tax::${n.id}`,
        pageUrl:     n.own.find(k => k.position !== null && k.url)?.url,
        intent,
        stage,
        contentType: meta.contentType,
        contentIcon: meta.contentIcon,
        keywords:    n.own,
        totalVolume: n.own.reduce((s, k) => s + k.searchVolume, 0),
      });
    }
    for (const c of n.children) walk(c);
  };
  for (const n of tree) walk(n);

  // Fallback (intent-based) topics for keywords with NO stored path — demand / problem lanes.
  const fallbackClusters = clusters
    .map(c => ({
      ...c,
      keywords:    c.keywords.filter(k => !hasPath(k)),
      subClusters: c.subClusters.map(sc => ({ ...sc, keywords: sc.keywords.filter(k => !hasPath(k)) })).filter(sc => sc.keywords.length > 0),
    }))
    .filter(c => c.keywords.length > 0);
  if (fallbackClusters.length > 0) out.push(...flattenTopics(fallbackClusters));

  return out;
}

function flattenTopics(clusters: ThemeCluster[]): Topic[] {
  const topics: Topic[] = [];
  for (const c of clusters) {
    if (c.keywords.length === 0) continue;

    // per-keyword funnel intent (from the subClusters buildThemeClusters computed)
    const intentOf = new Map<KwItem, IntentCluster>();
    for (const sc of c.subClusters) for (const kw of sc.keywords) intentOf.set(kw, sc);

    // v7.238: PROCEDURE topics are grouped by the CANONICAL sub-topic from the stored
    // taxonomy path (kw.subTopic = keywordPaths node below the theme) — the SAME structure
    // the Keyword tree renders — NOT by names mined from keyword text (Const III.1b/II.8).
    // This stops the Cluster panel inventing near-duplicate labels ("Balance Transfer Credit
    // Cards" / "Balance Transfer Cards"). Keywords whose path stops at the theme (no sub-topic)
    // form one "head" topic labelled with the theme itself, mirroring a theme node that holds
    // its own keywords. Brand/location/demand/problem keep intent-labelled children (unchanged).
    const groupsForCat: IntentGroup[] = c.type === 'procedure'
      ? (() => {
          const bySub = new Map<string, KwItem[]>();
          for (const kw of c.keywords) {
            const st = (kw.subTopic && kw.subTopic.trim()) ? kw.subTopic.trim() : '';
            (bySub.get(st) ?? bySub.set(st, []).get(st)!).push(kw);
          }
          return Array.from(bySub.entries()).map(([st, kws]) => ({
            key:     st ? `sub::${st.toLowerCase()}` : `${CORE_KEY}::head`,
            name:    st || c.name,   // canonical sub-topic, or the theme itself for head-term kws
            kws,
            pageUrl: kws.find(k => k.position !== null && k.url)?.url,
          }));
        })()
      : (() => {
          const byIntent = new Map<IntentType, KwItem[]>();
          for (const kw of c.keywords) {
            const it = intentOf.get(kw)?.intent ?? detectIntentSignal(kw.keyword) ?? 'unmatched';
            (byIntent.get(it) ?? byIntent.set(it, []).get(it)!).push(kw);
          }
          return Array.from(byIntent.entries()).map(([it, kws]) => ({
            key: `${CORE_KEY}::${it}`, name: INTENT_META[it].label, kws,
            pageUrl: kws.find(k => k.position !== null && k.url)?.url,
          }));
        })();

    // v7.197: one topic per intent cluster (= one page). Funnel types are merged.
    for (const g of groupsForCat) {
      if (g.kws.length === 0) continue;

      // The cluster's single funnel stage = the dominant funnel intent BY VOLUME
      // (Wayne: "one cluster, dominant stage"). Read each keyword's funnel intent
      // from the subClusters; fall back to a signal scan.
      const volByIntent = new Map<IntentType, number>();
      for (const kw of g.kws) {
        const it = intentOf.get(kw)?.intent ?? detectIntentSignal(kw.keyword) ?? 'unmatched';
        volByIntent.set(it, (volByIntent.get(it) ?? 0) + kw.searchVolume);
      }
      let domIntent: IntentType = 'unmatched';
      let domVol = -1;
      for (const [it, v] of Array.from(volByIntent.entries())) if (v > domVol) { domVol = v; domIntent = it; }
      // v7.199: an AI group may carry an explicit funnel stage → honour it (and pick a
      // representative intent for the content-type label); else dominant intent by volume.
      const intent: IntentType = g.stage ? (STAGE_INTENT[g.stage] ?? domIntent) : domIntent;
      // v7.203: pre-product (life-problem) topics are AWARENESS ONLY per the
      // Constitution (Art III.2a) — the searcher knows only the problem, not the
      // offering, so there is no Consideration/Decision/Retention to evaluate.
      const stage: JourneyStage = c.type === 'problem' ? 'awareness' : (g.stage ?? INTENT_META[domIntent].stage);
      const meta = INTENT_META[intent];

      topics.push({
        id:          `${c.id}::${g.key}`,
        parentName:  c.name,
        // v7.236: nest under the stored umbrella; top-level themes (no stored parent, or
        // brand/location/demand/problem) use their own name as the umbrella.
        umbrella:    c.parentLine && c.parentLine.trim() ? c.parentLine.trim() : c.name,
        parentType:  c.type,
        product:     g.name,        // v7.197: topical intent name (e.g. "401k vs IRA")
        productKey:  g.key,
        pageUrl:     g.pageUrl,
        intent,
        stage,
        contentType: meta.contentType,
        contentIcon: meta.contentIcon,
        keywords:    g.kws,
        totalVolume: g.kws.reduce((s, k) => s + k.searchVolume, 0),
      });
    }
  }
  return topics;
}

// ─── v7.210: canonical cluster source (single source of truth, Const II.7) ──────
// The Cluster panel's flattened topic list IS the canonical "one cluster = one intent
// = one page" unit (flattenTopics already emits one Topic per intent group). This thin
// wrapper exposes it so the Content panel + Content plan build ONE page per cluster
// (Const III.5) instead of forking their own demand-universe topic set — which is what
// made the cluster / journey / content-plan counts diverge (2514 vs 617 vs 323).
// It calls the SAME builders the panel uses (no parallel copy); AI-refined intent
// merges flow in automatically when the snapshot carries `_categoryBreakdown.intentGroups`.
// v7.232: building the canonical topics walks the FULL footprint (14k+ keywords) — pre-product
// clusters + theme clusters + intent flattening. It is called by EVERY panel (Keyword model,
// Cluster, Journey, Content) and on interactions, so recomputing it each time made navigation /
// clicks lag for seconds. Memoize on a signature of the inputs that affect the output, so the
// first panel computes it and the rest reuse it. The result is treated as read-only by callers
// (they project new structures from it; they never mutate the Topic objects).
const _canonTopicsCache = new Map<string, Topic[]>();
function _canonSig(
  analysis: any, clientDomain: string, competitorDomains: string[],
  uploadedKeywords: any[], claudeAssigns: Record<string, IntentType>,
  clientVolMin: number, competitorVolMin: number,
): string {
  const snap = analysis?.semrushSnapshot ?? {};
  const du   = snap?._demandUniverse;
  const cb   = snap?._categoryBreakdown;
  return [
    analysis?.id ?? '?',
    snap?.domain ?? '',
    snap?.topKeywords?.length ?? 0,
    snap?.gapKeywords?.length ?? 0,
    Array.isArray(du?.topics) ? du.topics.length : 0,
    cb?.categories?.length ?? 0,
    Object.keys(cb?.keywordCategories ?? {}).length,
    clientDomain,
    competitorDomains.join(','),
    uploadedKeywords.length,
    Object.keys(claudeAssigns).length,
    clientVolMin,
    competitorVolMin,
  ].join('|');
}

export function buildCanonicalClusterTopics(
  analysis: any,
  clientDomain: string,
  competitorDomains: string[] = [],
  uploadedKeywords: any[] = [],
  // v7.220: the Claude intent-assignment map — MUST be the same map the Cluster panel
  // feeds buildThemeClusters, or the Journey/Content topic count diverges from the
  // Cluster panel's. (v7.211 reconciliation only held when this was non-empty; this arg
  // was previously hard-coded to {}, so every canonical view under-counted vs the panel.)
  // The page lifts the map once and threads it here so all views reconcile (Const II.7).
  claudeAssigns: Record<string, IntentType> = {},
  clientVolMin = 0,
  competitorVolMin = 0,
): Topic[] {
  const sig = _canonSig(analysis, clientDomain, competitorDomains, uploadedKeywords, claudeAssigns, clientVolMin, competitorVolMin);
  const cached = _canonTopicsCache.get(sig);
  if (cached) return cached;

  const jb = buildPreProductClusters(
    analysis, clientDomain, competitorDomains, uploadedKeywords, clientVolMin, competitorVolMin,
  );
  const base = buildThemeClusters(
    analysis, claudeAssigns, clientDomain, competitorDomains, uploadedKeywords, clientVolMin, competitorVolMin, jb.preProductKws,
  );
  // v7.240: build the canonical topics from the SHARED taxonomy tree (the SAME structure the
  // Keyword + Cluster panels render) when the stored taxonomy is present, so the Journey and
  // Content panels share the one base categorization (Const II.7). keywords with no stored path
  // (deep-journey demand / pre-product problem themes) fall back inside buildTopicsFromTaxonomy.
  // Pre-taxonomy analyses keep the intent-based flatten (honest gap, I.5).
  const _kp = new Map<string, string[]>();
  {
    const raw: Record<string, any> = analysis?.semrushSnapshot?._categoryBreakdown?.keywordPaths ?? {};
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) {
        const p = v.map((s: any) => String(s ?? '').trim()).filter(Boolean);
        if (p.length) _kp.set(k.toLowerCase().trim(), p);
      }
    }
  }
  const topics = _kp.size > 0
    ? buildTopicsFromTaxonomy([...base, ...jb.clusters], _kp)
    : flattenTopics([...base, ...jb.clusters]);

  _canonTopicsCache.set(sig, topics);
  if (_canonTopicsCache.size > 4) {              // small LRU — keep a few analyses / threshold variants
    const oldest = _canonTopicsCache.keys().next().value as string | undefined;
    if (oldest !== undefined) _canonTopicsCache.delete(oldest);
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

function TopicTable({
  rows, sortKey, sortDir, onSort, expanded, onToggle, expandedParents, onToggleParent,
  expandedUmbrellas, onToggleUmbrella,
}: {
  rows: TopicRow[]; sortKey: SortKey; sortDir: 1 | -1; onSort: (k: SortKey) => void;
  expanded: Set<string>; onToggle: (id: string) => void;
  // v7.207: parent-collapse — a parent's child rows render only when its name is in
  // expandedParents. Default-collapsed is enforced by the caller (empty set).
  expandedParents: Set<string>; onToggleParent: (name: string) => void;
  // v7.236: umbrella-collapse — the level above theme (mirrors the Keyword tree).
  expandedUmbrellas: Set<string>; onToggleUmbrella: (name: string) => void;
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
            for (const r of rows) {
              const a = agg.get(r.t.parentName) ?? { n: 0, vol: 0 };
              a.n += 1; a.vol += r.t.totalVolume; agg.set(r.t.parentName, a);
              const u = umbAgg.get(r.t.umbrella) ?? { n: 0, vol: 0 };
              u.n += 1; u.vol += r.t.totalVolume; umbAgg.set(r.t.umbrella, u);
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
}) {
  const [filter, setFilter] = useState<ClusterFilter>('all');
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

      {/* v7.241: "Refine clusters with AI" button removed (Wayne). The cluster pane is */}
      {/* display-only; the build/expansion lives on the Keyword panel's workflow bar.   */}

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
        const preTopicsN     = flatten(clusters.filter(c =>  isPreProductCluster(c))).length;
        const productTopicsN = flatten(clusters.filter(c => !isPreProductCluster(c))).length;
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
  const journeyBuild = useMemo(
    () => buildPreProductClusters(
      effectiveAnalysis, clientDomain, competitors, uploadedKeywords ?? [],
      defaultClientThreshold, defaultCompetitorThreshold,
    ),
    [effectiveAnalysis, clientDomain, competitors, uploadedKeywords, defaultClientThreshold, defaultCompetitorThreshold],
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
      defaultClientThreshold, defaultCompetitorThreshold, journeyBuild.preProductKws,
    ),
    [effectiveAnalysis, effectiveAssigns, clientDomain, competitors, uploadedKeywords, defaultClientThreshold, defaultCompetitorThreshold, journeyBuild],
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
  const topicCnt   = flattenTopics(allClusters).length;
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
        />
      )}
    </div>
  );
}
