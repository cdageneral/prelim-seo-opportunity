/**
 * lib/clusters/canonical.ts — v7.376
 *
 * The canonical cluster-topic build chain — buildThemeClusters →
 * buildPreProductClusters → buildTopicsFromTaxonomy/flattenTopics →
 * buildCanonicalClusterTopics — MOVED VERBATIM out of
 * components/brief/ThemeClustersPanel.tsx (a 'use client' module) so server code —
 * the assessment-report route — can build the EXACT same canonical topics every
 * panel renders (Const II.6/II.7: one math, no forks). ThemeClustersPanel imports
 * everything back from here and re-exports its public names, so every existing
 * consumer (categoryModel, Content Map/Plan, Scope, Exec Summary, the page) is
 * untouched. NO LOGIC CHANGES — this file is a pure move.
 */

import { buildKwPool, isBrandedKeyword } from '@/lib/utils/kwVolume';
// DO NOT add a local isBranded here — lib/utils/kwVolume.ts is the one source (panel rule, v7.235).
const isBranded = isBrandedKeyword;
import { buildCategoryGuard } from '@/lib/category/categoryGuard';   // v7.226 (Const III.1a)
import { buildTaxonomyTree, type TaxoTreeNode } from '@/lib/category/taxonomyTree';   // v7.239 (Const II.7)
import { buildJourneyClassifier } from '@/lib/journey/classifier';   // v7.203/v7.376: single-source product/pre-product split

export type IntentType   = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'unmatched';
export type JourneyStage = 'awareness' | 'consideration' | 'decision' | 'retention';

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

export interface IntentCluster {
  intent:           IntentType;
  stage:            JourneyStage;
  contentType:      string;
  contentIcon:      string;
  keywords:         KwItem[];
  totalVolume:      number;
  clientVolume:     number;
  competitorVolume: number;
}

export interface ThemeCluster {
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

export const TRANSACTIONAL_SIGNALS = [
  'near me', 'near ', 'schedule', 'book ', 'booking', 'appointment', 'consultation',
  'how much does', 'how much is', 'how much', 'cost', 'price', 'pricing',
  'financing', 'payment plan', 'afford', 'discount', 'coupon', 'deal', 'specials',
  'locations', 'location', 'find a ', 'get a ',
];
export const COMMERCIAL_SIGNALS = [
  'review', 'reviews', 'best ', 'top ', ' vs ', 'versus', 'compare', 'comparison',
  'before after', 'before and after', 'results', 'worth it', 'pros and cons',
  'alternative', 'rating', 'ratings', 'testimonial', 'testimonials', 'complaints',
  'side effects', 'risks', 'dangers', 'safe ', 'safety',
];
export const INFORMATIONAL_SIGNALS = [
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

export const INTENT_META: Record<IntentType, {
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
export const STAGE_INTENT: Record<JourneyStage, IntentType> = {
  awareness: 'informational', consideration: 'commercial', decision: 'transactional', retention: 'navigational',
};

export const JOURNEY_ORDER: JourneyStage[] = ['awareness', 'consideration', 'decision', 'retention'];
export const JOURNEY_LABELS: Record<JourneyStage, string> = {
  awareness: 'Awareness', consideration: 'Consideration', decision: 'Decision', retention: 'Retention',
};

// ─── Category assignment (fallback for older analyses) ────────────────────────

export function matchKeywordToCategory(
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
export const CAT_STOP = new Set(['and', '&', 'the', 'of', 'for', 'a', 'an', 'to', 'in', 'on', 'or', 'with', 'your', 'you']);
export function catTokens(name: string): Set<string> {
  return new Set(
    name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w && !CAT_STOP.has(w))
      .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}
export function catsAreDup(a: string, b: string): boolean {
  const ta = catTokens(a), tb = catTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const inter = Array.from(ta).filter(t => tb.has(t)).length;
  if (ta.size === tb.size && inter === ta.size) return true;          // identical token sets
  const onlyA = Array.from(ta).filter(t => !tb.has(t)).length;
  const onlyB = Array.from(tb).filter(t => !ta.has(t)).length;
  return inter >= 2 && onlyA <= 1 && onlyB <= 1;
}

// ─── Build theme clusters ─────────────────────────────────────────────────────

export function buildThemeClusters(
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
  // v7.250: also resolve the client ranking-page URL from the page-map scan
  // (`_pageMap.pages[] = { url, keywords[] }`, real Semrush `url_organic` data). Many
  // `topKeywords` rows arrive with an empty URL, so a ranked keyword would otherwise map
  // to no page and an existing page would look net-new. The page-map is the authoritative
  // page→keyword source; we only fill gaps (topKeywords URL wins when present). I.1: real
  // data only — no URL is invented; keywords with no real page stay unmapped (honest gap).
  for (const pg of (semSnap?._pageMap?.pages ?? [])) {
    const purl = pg?.url ? String(pg.url) : '';
    if (!purl) continue;
    for (const kw of (pg?.keywords ?? [])) {
      const key = String(kw ?? '').toLowerCase().trim();
      if (key && !urlByKeyword.has(key)) urlByKeyword.set(key, purl);
    }
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
    // v7.251: prefer the URL carried on the pool item itself (uploaded CSV "URL" column,
    // now persisted) and fall back to the snapshot lookup (topKeywords + page-map, v7.250).
    url:          item.url ?? urlByKeyword.get(item.keyword.toLowerCase()),
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

export const KW_STOP = new Set<string>([
  'the','and','for','with','without','your','you','our','their','this','that','these','those',
  'what','whats','which','who','whom','how','why','when','where','are','was','were','being','been',
  'does','did','can','could','will','would','should','about','near','vs','versus','its','get','getting',
  'got','use','using','need','want','much','many','best','top','online','app','from','into','out',
]);

export function headTokenSet(name: string): Set<string> {
  const h = new Set<string>();
  for (const w of name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (w.length >= 3) { h.add(w); h.add(w.endsWith('s') ? w.slice(0, -1) : w + 's'); }
  }
  return h;
}

export function prodTokens(s: string, head: Set<string>): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !KW_STOP.has(w) && !head.has(w) && !/^\d+$/.test(w));
}

export function titleCaseWords(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function slugOf(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  const segs = path.split('/').filter(Boolean);
  return segs.length ? segs[segs.length - 1] : '';
}

export interface ProdSeed { key: string; label: string; tokens: Set<string>; pageUrl?: string; gram: number; }

// Mine product seeds from a theme's keywords: client page slugs first, then
// recurring keyword modifiers (bigrams before unigrams). Sorted most-specific first.
export function deriveProductSeeds(kws: KwItem[], head: Set<string>): ProdSeed[] {
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
export function bestSeed(kw: KwItem, head: Set<string>, seeds: ProdSeed[]): ProdSeed | null {
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
export const CORE_KEY = '__core__';
// A "core" topic (brand/location/demand intent bucket) is labelled by its intent and
// shows no parent sub-label. Procedure intent clusters (cmp|/def|/gen|…) are not core.
export const isCoreKey = (k: string): boolean => k === CORE_KEY || k.startsWith(CORE_KEY + '::');

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
export type IntentKind = 'compare' | 'define' | 'howto' | 'cost' | 'amount' | 'best' | 'general';

// Words stripped to reveal the ENTITIES a keyword is about (intent markers + glue).
export const INTENT_SIGNAL_WORDS = new Set<string>([
  'vs','versus','difference','differences','differ','different','compare','compared','comparison',
  'between','advantage','advantages','alternative','alternatives','better','instead','than','over',
  'what','whats','is','are','was','were','how','does','do','did','work','works','working','mean','means',
  'meaning','definition','define','explain','explained','to','guide','step','steps','way','ways','tutorial',
  'cost','costs','price','prices','pricing','fee','fees','much','many','best','top','review','reviews',
  'rated','should','need','needs','have','has','get','a','an','the','of','for','in','on','at','by',
  'my','your','you','i','me','we','it','and','or','with','about','near','can','could','will','would',
]);

export function entityTokens(kw: string): string[] {
  return kw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !INTENT_SIGNAL_WORDS.has(w))
    .map(w => (w.length > 3 && w.endsWith('s') && !/\d/.test(w) ? w.slice(0, -1) : w));
}

// Classify the SEMANTIC intent (not the funnel stage). Comparison is tested first so
// "explain the difference between a 401k and an ira" reads as compare, not define.
export function intentKindOf(kw: string): IntentKind {
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

export function smartCaseToken(t: string): string {
  if (/\d/.test(t)) return t;                          // "401k" stays "401k"
  if (t.length <= 3) return t.toUpperCase();           // ira→IRA, apr→APR, roi→ROI
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function sentenceCase(kw: string): string {
  const t = kw.trim().replace(/\s+/g, ' ').replace(/\bi\b/g, 'I');   // standalone "i" → "I"
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export interface IntentGroup { key: string; name: string; kws: KwItem[]; pageUrl?: string; stage?: JourneyStage }

// v7.199: prefer the AI intent groups when this category has them (they merge
// synonym intents the heuristic can't). Any keyword the AI didn't place falls back
// to the heuristic so NO keyword is ever lost. Without AI groups → pure heuristic.
export function buildIntentClusters(c: ThemeCluster): IntentGroup[] {
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
export function buildIntentClustersHeuristic(c: ThemeCluster): IntentGroup[] {
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
export function nameIntentCluster(c: ThemeCluster, kind: IntentKind, kws: KwItem[], head: Set<string>): string {
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
export function buildPreProductClusters(
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
    // v7.248 (Wayne): the pre-product journey is the DEEP-JOURNEY BUILD ONLY (Const II.2) —
    // it is the missing upper-funnel demand you deliberately build, never auto-peeled from
    // the existing footprint. So only deep-journey demand keywords (origin 'demand') are
    // eligible; until the deep journey is built the lane is empty (honest gap, I.5).
    if (kw.origin !== 'demand') continue;
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

export function flattenTopics(clusters: ThemeCluster[]): Topic[] {
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
export const _canonTopicsCache = new Map<string, Topic[]>();
export function _canonSig(
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
    // v7.477: the Step-3 selection and the umbrella scope CHANGE the output but left the
    // signature unchanged — after saving a selection the cache served pre-selection topics
    // (the second half of the Synchrony leak). Fingerprint both stores by content.
    (Array.isArray(snap?._hiddenCategories) ? snap._hiddenCategories.map((h: any) => String(h?.key ?? h?.name ?? '')).sort().join('~') : ''),
    JSON.stringify(snap?._scopeOverrides ?? {}),
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
