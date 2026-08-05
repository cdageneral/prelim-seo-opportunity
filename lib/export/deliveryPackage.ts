/**
 * deliveryPackage (v7.378) — the "Send to Delivery" baseline handoff.
 *
 * Assembles ONE downloadable zip that hands the entire analysis to a delivery
 * colleague as an integration baseline: a machine-readable JSON manifest (the
 * integration backbone), human-readable Excel + CSV mirrors, and a data-dictionary
 * README. Every panel's structure (umbrella › theme › topic › keyword), its
 * performance positioning (volumes, real SERP positions, page-1 capture, modeled
 * Share of Voice, journey coverage, segment attribution, authority + AI-visibility
 * aggregates) and its insights ride along, WITH the finalized Content-Plan / scope
 * selections flagged so the colleague sees the full footprint AND what's been
 * prioritized for delivery.
 *
 * DEFENSIBILITY (Const I.1 / II.6 / II.7): this module is a PURE SERIALIZER. It never
 * re-derives taxonomy, membership, volume, or attribution — it is handed the SAME
 * view objects the panels and the assessment report build (`buildCanonicalClusterTopics`
 * → Topic[], `buildContentPlanFromTopics` → ContentPlan, the stored `_audienceSegments`,
 * `computeVolumeMetrics`, `computeSov`, the persisted Profound / authority / local
 * aggregates) and serializes them verbatim. Every number is an exact TypeScript rollup
 * of a real source row; the one modeled metric (Share of Voice) carries its
 * `modeled: true` flag + the named CTR-curve source (Const I.5a). Missing data is an
 * honest gap (`null` / omitted section, Const I.5), never a fabricated value.
 *
 * Segment attribution reuses the panels' exclusive word-overlap partition
 * (lib/journey/segments, the v7.170 rule) so the package agrees with the Journey
 * panel and the report to the topic.
 *
 * Runs under Node (the delivery-package route + the regression harness) — jszip
 * uint8array + a dynamic xlsx import, the same pattern briefExport uses.
 *
 * VENDOR-BLIND (standing report rule, Wayne 2026-07-17): data-vendor names are the
 * secret sauce and never appear in the package — provenance is labeled by lens
 * ("ranking source" / "demand source" / "AI-visibility source"), not by vendor.
 */

import JSZip from 'jszip';
import type { Topic } from '@/lib/clusters/canonical';
import { JOURNEY_ORDER, JOURNEY_LABELS } from '@/lib/clusters/canonical';
import type { ContentPlan, ContentTopic } from '@/lib/journey/contentPlan';
import { PRIORITY_LABEL } from '@/lib/journey/contentPlan';
import {
  buildSegTokens, buildCanonTopicSegmentMap, canonTopicState, isPreProductTopic, SHARED_BUCKET,
} from '@/lib/journey/segments';
import type { Insight } from '@/lib/insights';
// v7.407: the authority snapshot freezes the competitor list at scan time, so the
// package reconciles it against the project's CURRENT competitors before export —
// same reconciler the panel and the PDF use (Const II.6/II.7).
import { reconcileAuthoritySnapshot } from '@/lib/authority/reconcile';

export const DELIVERY_SCHEMA_VERSION = '1.0';

// ─── Inputs — every field is an already-built view object (no re-derivation) ─────
export interface DeliveryInput {
  appVersion:  string;
  client:      { name: string; websiteUrl: string; industry: string | null };
  journeyTopics: Topic[];                 // buildCanonicalClusterTopics(...) — same call as the panels
  plan:        ContentPlan;               // buildContentPlanFromTopics(journeyTopics, {brandTerms, priorityOverrides})
  segments:    any[];                     // stored _audienceSegments (raw)
  problemSeeds: string[];                 // _demandUniverse.problemSeeds
  poolCount:   number;                    // canonical pool size (buildKwPool length)
  metrics:     { totalMonthly: number; totalAnnual: number; page1Monthly: number; page1Annual: number; captureRate: number };
  sov:         any | null;                // computeSov(...) — modeled SoV, labeled
  profound:    any | null;                // ProfoundMetrics (persisted CSV aggregates)
  authority:   any | null;                // projects.authority_snapshot
  // v7.407: the project's CURRENT competitor domains. null = caller has no live
  // list and the frozen snapshot exports unfiltered (pre-v7.407 behaviour).
  competitorDomains?: string[] | null;
  localScan:   any | null;                // _localScan
  umbrellaScope: Record<string, string> | null;   // _categoryBreakdown.umbrellaScope (core|adjacent)
  positionDist:  any | null;              // semrushSnapshot.positionDist
  contentPlanSelections: string[];        // finalized Content Plan (ContentTopic.id set)
  scopeSelections:       string[];        // finalized competitor-gap scope (ids)
  insights:    Insight[];                 // the exact panel insight sentences (lib/insights)
}

// ─── small helpers ───────────────────────────────────────────────────────────
function num(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }
function pct1(x: number): number { return Math.round(x * 1000) / 10; }   // one-decimal percentage
function insightSentence(i: Insight): string { return (i.parts ?? []).map(p => p.t).join(''); }
function slug(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'client';
}

// Excel forbids : \ / ? * [ ] in sheet names and caps at 31 chars.
function sheetName(s: string): string {
  return ((s || '').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31);
}

// RFC-4180 CSV cell.
function csvCell(v: any): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: Array<Record<string, any>>): string {
  const head = headers.map(csvCell).join(',');
  const body = rows.map(r => headers.map(h => csvCell(r[h])).join(',')).join('\r\n');
  return rows.length ? `${head}\r\n${body}\r\n` : `${head}\r\n`;
}

// ─── Manifest (the JSON backbone) ───────────────────────────────────────────────
export interface DeliveryManifest {
  schemaVersion: string;
  generator: { app: string; appVersion: string; packageType: string };
  client: { name: string; websiteUrl: string; industry: string | null };
  summary: any;
  taxonomy: any[];          // nested umbrella › theme › topic › keyword
  journeys: any;
  segments: any[];
  scope: any;
  rank: any;
  aiVisibility: any | null;
  llmVisibility: any | null;
  authority: any | null;
  localSearch: any | null;
  insights: any[];
  contentPlan: any;
  provenance: any;
}

export function buildDeliveryManifest(input: DeliveryInput): DeliveryManifest {
  const {
    journeyTopics, plan, segments, problemSeeds, metrics, sov, profound, authority, localScan,
    umbrellaScope, positionDist, contentPlanSelections, scopeSelections, insights,
  } = input;

  // v7.407 — reconcile the frozen authority snapshot against the live competitor
  // list before ANY authority value is exported. Rows are real crawled index rows
  // and are never altered; rivals that have since been removed are simply out of
  // scope, and rivals added since the crawl have no row yet and are reported as an
  // honest gap (Const I.5) rather than exported as blanks.
  const authRec = reconcileAuthoritySnapshot(
    (authority?.domains ?? []) as Array<{ domain: string; role: 'client' | 'competitor' }>,
    input.competitorDomains ?? null,
  );
  const authorityScoped = authority
    ? { ...authority, domains: [...(authRec.client ? [authRec.client] : []), ...authRec.comps],
        ...(authRec.missing.length ? { notCrawledYet: authRec.missing } : {}) }
    : null;

  const planSel  = new Set(contentPlanSelections);
  const scopeSel = new Set(scopeSelections);
  const problemSet = new Set((problemSeeds ?? []).map(s => String(s).toLowerCase().trim()));

  // per-topic ContentPlan enrichment (priority / quickWin / distance / bestPosition / capture)
  const ctById = new Map<string, ContentTopic>();
  for (const t of plan.topics) ctById.set(t.id, t);

  // segment attribution — the panels' exclusive word-overlap partition (v7.170)
  const segs = (segments ?? []).filter((s: any) => s && s.id && s.name);
  const segTok = segs.length ? buildSegTokens(segs) : [];
  const segMap = segs.length ? buildCanonTopicSegmentMap(journeyTopics, segTok) : new Map<string, string>();

  // Per-topic enriched record (shared by the nested tree, the journeys block and the tables).
  const topicRec = (t: Topic) => {
    const ct = ctById.get(t.id);
    const state = canonTopicState(t);
    const lane: 'pre-product' | 'product' = isPreProductTopic(t, problemSet) ? 'pre-product' : 'product';
    return {
      id: t.id,
      topic: t.product,
      theme: t.parentName,
      umbrella: t.umbrella,
      parentType: t.parentType,
      pageUrl: t.pageUrl ?? null,
      lane,
      intentStage: t.stage,
      intentStageLabel: JOURNEY_LABELS[t.stage] ?? t.stage,
      state,                                   // existing | missing | competitor
      action: ct ? ct.action : (state === 'existing' ? 'optimize' : 'build'),
      totalMonthlyVolume: num(t.totalVolume),
      keywordCount: t.keywords.length,
      // performance positioning (real rollups, Const I.1) — from the Content Plan view
      clientMonthlyVolume: ct ? num(ct.clientVol) : null,
      clientCapturePct:    ct ? pct1(num(ct.clientCovPct) / 100) : null,   // ct.clientCovPct already 0..100
      bestPosition:        ct ? ct.bestPosition : null,
      priority:            ct ? ct.priority : null,
      priorityLabel:       ct ? (PRIORITY_LABEL[ct.priority] ?? ct.priority) : null,
      quickWin:            ct ? ct.quickWin : null,
      refresh:             ct ? ct.refresh : null,
      distance:            ct ? ct.distance : null,
      distanceLabel:       ct ? ct.distanceLabel : null,
      competitor:          t.keywords.find(k => k.competitor)?.competitor ?? (ct ? ct.competitor : null),
      segment:             segMap.get(t.id) ?? null,
      // delivery flags (full footprint + prioritized subset, clearly separated)
      inContentPlan:   planSel.has(t.id),
      inDeliveryScope: scopeSel.has(t.id),
      keywords: t.keywords.map(k => ({
        keyword: k.keyword,
        searchVolume: num(k.searchVolume),
        position: k.position,                  // real SERP position, null = client not ranking
        isGap: !!k.isGap,
        competitor: k.competitor ?? null,
        origin: k.origin ?? 'footprint',       // footprint | demand (deep-journey missing demand)
      })),
    };
  };

  const enriched = journeyTopics.map(topicRec);

  // ── nested taxonomy tree: umbrella › theme › topic › keyword (mirrors the Keyword panel) ──
  const uMap = new Map<string, Map<string, any[]>>();
  for (const r of enriched) {
    const u = r.umbrella || '(uncategorized)';
    const th = r.theme || '(uncategorized)';
    if (!uMap.has(u)) uMap.set(u, new Map());
    const tm = uMap.get(u)!;
    if (!tm.has(th)) tm.set(th, []);
    tm.get(th)!.push(r);
  }
  const taxonomy = Array.from(uMap.entries()).map(([umbrella, themes]) => {
    const themeArr = Array.from(themes.entries()).map(([theme, topics]) => ({
      theme,
      parentType: topics[0]?.parentType ?? null,
      topicCount: topics.length,
      totalMonthlyVolume: topics.reduce((s, t) => s + t.totalMonthlyVolume, 0),
      topics,
    }));
    return {
      umbrella,
      scope: umbrellaScope?.[umbrella] ?? 'core',   // core | adjacent (competitor-only vertical)
      themeCount: themeArr.length,
      topicCount: themeArr.reduce((s, t) => s + t.topicCount, 0),
      totalMonthlyVolume: themeArr.reduce((s, t) => s + t.totalMonthlyVolume, 0),
      themes: themeArr,
    };
  }).sort((a, b) => b.totalMonthlyVolume - a.totalMonthlyVolume);

  // ── journeys (product full-funnel + pre-product awareness, Const III.2a) ──
  const stageAgg = JOURNEY_ORDER.map(st => {
    const rows = enriched.filter(r => r.intentStage === st);
    return {
      stage: st,
      label: JOURNEY_LABELS[st] ?? st,
      topics: rows.length,
      monthlyVolume: rows.reduce((s, r) => s + r.totalMonthlyVolume, 0),
      builds: rows.filter(r => r.action === 'build').length,
      optimizes: rows.filter(r => r.action === 'optimize').length,
    };
  });
  const productRows = enriched.filter(r => r.lane === 'product');
  const preRows     = enriched.filter(r => r.lane === 'pre-product');
  const jOpt = enriched.filter(r => r.action === 'optimize').length;
  const journeys = {
    totalTopics: enriched.length,
    coveragePct: enriched.length ? pct1(jOpt / enriched.length) : 0,   // optimize share = existing coverage
    byStage: stageAgg,
    product: {
      topics: productRows.length,
      monthlyVolume: productRows.reduce((s, r) => s + r.totalMonthlyVolume, 0),
      note: 'Solution-aware demand — full funnel (Awareness → Consideration → Decision → Retention).',
    },
    preProduct: {
      topics: preRows.length,
      monthlyVolume: preRows.reduce((s, r) => s + r.totalMonthlyVolume, 0),
      note: 'Problem-aware / trigger-based demand — Awareness only; never names a client product. Populated by the deep-journey build.',
    },
  };

  // ── segments (with attribution + the panels' modeled share label) ──
  const segOut = segs.map((s: any) => {
    const topicsFor = enriched.filter(r => r.segment === s.id);
    const gm = new Map<string, number>();
    for (const r of topicsFor) gm.set(r.theme || '(uncategorized)', (gm.get(r.theme || '(uncategorized)') ?? 0) + r.totalMonthlyVolume);
    const top = Array.from(gm.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    return {
      id: s.id,
      name: s.name,
      tagline: s.tagline ?? null,
      who: s.who ?? null,
      trigger: s.trigger ?? null,
      volumeSharePct: s.volumePct ?? null,      // modeled share (labeled below)
      volumeShareModeled: true,
      prompts: Array.isArray(s.geoPrompts) ? s.geoPrompts : (Array.isArray(s.prompts) ? s.prompts : []),
      attributedTopics: topicsFor.length,
      optimizeTopics: topicsFor.filter(r => r.action === 'optimize').length,
      buildTopics: topicsFor.filter(r => r.action === 'build').length,
      topTheme: top ? { theme: top[0], monthlyVolume: top[1] } : null,
    };
  }).sort((a, b) => num(b.volumeSharePct) - num(a.volumeSharePct));
  const sharedN = enriched.filter(r => r.segment === SHARED_BUCKET).length;

  // ── scope (competitor-gap gate — in-vertical vs adjacent, Const III.1d) ──
  const adjacent = Object.entries(umbrellaScope ?? {}).filter(([, v]) => v === 'adjacent').map(([k]) => k);
  const scope = {
    contentPlanSelectedTopics: contentPlanSelections.length,
    deliveryScopeSelectedTopics: scopeSelections.length,
    coreUmbrellas: taxonomy.filter(u => u.scope !== 'adjacent').map(u => u.umbrella),
    adjacentUmbrellas: adjacent,
    note: 'Adjacent = competitor-only verticals the client does not compete in; excluded from footprint totals and surfaced only in the staging view (Const III.1d).',
  };

  // ── rank & Share of Voice (SoV is modeled + labeled, Const I.5a) ──
  const rank = {
    positionDistribution: positionDist ?? null,
    shareOfVoice: sov && sov.basis === 'capture' ? {
      modeled: true,
      metric: 'Page-1 click-capture Share of Voice (non-branded landscape basis, v7.405)',
      model: sov.ctrSource ?? 'CTR-by-position curve (labeled model estimate)',
      note: 'Modeled estimate: volumes + real SERP positions are real source rows; only the CTR multiplier is modeled (Const I.5a). Never treat as measured data.',
      sovPct: sov.sovPct ?? null,
      capturedClicks: sov.capturedClicks ?? null,
      availableClicks: sov.availableClicks ?? null,
      page1KwCount: sov.page1KwCount ?? null,
      totalKwCount: sov.totalKwCount ?? null,
      competitors: sov.compEntries ?? [],
    } : null,
  };

  // ── summary (headline positioning — all real rollups) ──
  const summary = {
    footprintKeywordCount: input.poolCount,
    totalMonthlyDemand: metrics.totalMonthly,
    totalAnnualDemand: metrics.totalAnnual,
    page1MonthlyDemand: metrics.page1Monthly,
    page1CapturePct: pct1(metrics.captureRate),
    offPage1MonthlyDemand: Math.max(0, metrics.totalMonthly - metrics.page1Monthly),
    taxonomy: {
      umbrellas: taxonomy.length,
      themes: taxonomy.reduce((s, u) => s + u.themeCount, 0),
      topics: enriched.length,
      keywords: enriched.reduce((s, t) => s + t.keywordCount, 0),
    },
    journeys: { productTopics: productRows.length, preProductTopics: preRows.length, coveragePct: journeys.coveragePct },
    segments: { count: segOut.length, attributedTopics: enriched.length - sharedN, sharedTopics: sharedN },
    contentPlan: {
      prioritizedTopics: plan.topics.length,
      selectedForDelivery: contentPlanSelections.length,
      byPriority: { P0: plan.scope.p0, P1: plan.scope.p1, P2: plan.scope.p2, P3: plan.scope.p3 },
      quickWins: plan.scope.quickWins,
    },
    shareOfVoicePct: rank.shareOfVoice ? rank.shareOfVoice.sovPct : null,
    aiVisibility: profound && (profound.totalRuns > 0 || (profound.citeTotal || 0) > 0)
      ? { promptRuns: profound.totalRuns ?? 0, clientHits: profound.clientHits ?? 0, ownedCitationShare: profound.citeOwnedShare ?? null }
      : null,
    authority: (authorityScoped?.domains ?? []).some((d: any) => d?.role === 'client' && d?.overview?.refDomains > 0)
      ? { hasData: true } : null,
  };

  // ── content plan (the finalized delivery-ready subset) ──
  const planEnrichedById = new Map(enriched.map(r => [r.id, r]));
  const contentPlan = {
    selectionCount: contentPlanSelections.length,
    scope: plan.scope,
    selectedTopics: contentPlanSelections
      .map(id => planEnrichedById.get(id))
      .filter(Boolean),
  };

  return {
    schemaVersion: DELIVERY_SCHEMA_VERSION,
    generator: { app: 'OrbitIQ', appVersion: input.appVersion, packageType: 'delivery-baseline' },
    client: input.client,
    summary,
    taxonomy,
    journeys,
    segments: segOut,
    scope,
    rank,
    aiVisibility: summary.aiVisibility ? profound : null,
    llmVisibility: (profound && typeof profound.overallScore === 'number') ? { overallScore: profound.overallScore } : null,
    authority: summary.authority ? authorityScoped : null,
    localSearch: localScan && ((localScan.keywords?.length ?? 0) > 0 || (localScan.locations?.length ?? 0) > 0) ? localScan : null,
    insights: (insights ?? []).map(i => ({ id: i.id, tone: i.tone, kicker: i.kicker, finding: insightSentence(i), evidence: i.evidence })),
    contentPlan,
    provenance: {
      dataIntegrity: 'Every volume and SERP position is an exact TypeScript rollup of a real source row (Const I.1). No value is modeled, simulated, or estimated except where explicitly flagged modeled:true.',
      modeledMetrics: 'Share of Voice is the only modeled metric — a labeled CTR-by-position estimate over real volumes + positions (Const I.5a).',
      lenses: { ranking: 'client ranking footprint (real positions + volumes)', demand: 'deep-journey missing-demand universe', aiVisibility: 'AI answer-engine citation + coverage aggregates' },
      note: 'Data-vendor names are intentionally omitted. Full footprint is included; topics carry inContentPlan / inDeliveryScope flags marking the prioritized delivery subset.',
    },
  };
}

// ─── flat tables (single source for both the workbook and the CSVs) ─────────────
function tables(m: DeliveryManifest) {
  const topicRows: Array<Record<string, any>> = [];
  const kwRows: Array<Record<string, any>> = [];
  for (const u of m.taxonomy) {
    for (const th of u.themes) {
      for (const t of th.topics) {
        topicRows.push({
          Umbrella: u.umbrella, 'Umbrella Scope': u.scope, Theme: t.theme, Topic: t.topic,
          Lane: t.lane, 'Intent / Stage': t.intentStageLabel, State: t.state, Action: t.action,
          Priority: t.priorityLabel ?? '', 'Quick Win': t.quickWin === null ? '' : (t.quickWin ? 'Yes' : ''),
          'Best Position': t.bestPosition ?? '', 'Total Monthly Volume': t.totalMonthlyVolume,
          'Client Monthly Volume': t.clientMonthlyVolume ?? '', 'Capture %': t.clientCapturePct ?? '',
          'Keyword Count': t.keywordCount, Segment: t.segment ?? '', Competitor: t.competitor ?? '',
          'Existing URL': t.pageUrl ?? '', 'In Content Plan': t.inContentPlan ? 'Yes' : '',
          'In Delivery Scope': t.inDeliveryScope ? 'Yes' : '',
        });
        for (const k of t.keywords) {
          kwRows.push({
            Umbrella: u.umbrella, Theme: t.theme, Topic: t.topic, Keyword: k.keyword,
            'Search Volume': k.searchVolume, 'SERP Position': k.position ?? '',
            'Is Gap': k.isGap ? 'Yes' : '', Competitor: k.competitor ?? '', Origin: k.origin,
          });
        }
      }
    }
  }
  const segRows = m.segments.map((s: any) => ({
    Segment: s.name, Tagline: s.tagline ?? '', 'Volume Share % (modeled)': s.volumeSharePct ?? '',
    'Attributed Topics': s.attributedTopics, 'Optimize': s.optimizeTopics, 'Build': s.buildTopics,
    'Top Theme': s.topTheme?.theme ?? '', 'Top Theme Volume': s.topTheme?.monthlyVolume ?? '',
  }));
  const journeyRows = m.journeys.byStage.map((s: any) => ({
    Stage: s.label, Topics: s.topics, 'Monthly Volume': s.monthlyVolume, Optimize: s.optimizes, Build: s.builds,
  }));
  const planRows = (m.contentPlan.selectedTopics as any[]).map(t => ({
    Umbrella: t.umbrella, Theme: t.theme, Topic: t.topic, Priority: t.priorityLabel ?? '',
    State: t.state, Action: t.action, 'Total Monthly Volume': t.totalMonthlyVolume,
    'Best Position': t.bestPosition ?? '', Segment: t.segment ?? '', 'Existing URL': t.pageUrl ?? '',
  }));
  const insightRows = m.insights.map((i: any) => ({ ID: i.id, Tone: i.tone, Finding: i.finding, Evidence: i.evidence }));
  return { topicRows, kwRows, segRows, journeyRows, planRows, insightRows };
}

// key/value sheet rows
function kvRows(pairs: Array<[string, any]>): Array<Record<string, any>> {
  return pairs.map(([Field, Value]) => ({ Field, Value: Value === null || Value === undefined ? '' : Value }));
}

// ─── the zip ─────────────────────────────────────────────────────────────────
export async function assembleDeliveryZip(input: DeliveryInput): Promise<{ bytes: Uint8Array; filename: string; manifest: DeliveryManifest }> {
  const XLSX = await import('xlsx');
  const manifest = buildDeliveryManifest(input);
  const t = tables(manifest);
  const s = manifest.summary;
  const base = `orbitiq-delivery-${slug(input.client.name)}`;

  // ── workbook ──
  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, rows: Array<Record<string, any>>, cols?: number[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '(no data)': '' }]);
    if (cols) ws['!cols'] = cols.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(name));
  };
  addSheet('Overview', kvRows([
    ['Client', input.client.name], ['Website', input.client.websiteUrl], ['Industry', input.client.industry ?? ''],
    ['OrbitIQ Version', input.appVersion], ['Package Schema', DELIVERY_SCHEMA_VERSION],
    ['Footprint Keywords', s.footprintKeywordCount], ['Total Monthly Demand', s.totalMonthlyDemand],
    ['Page-1 Monthly Demand', s.page1MonthlyDemand], ['Page-1 Capture %', s.page1CapturePct],
    ['Off-Page-1 Monthly Demand', s.offPage1MonthlyDemand],
    ['Share of Voice % (modeled)', s.shareOfVoicePct ?? 'n/a'],
    ['Umbrellas', s.taxonomy.umbrellas], ['Themes', s.taxonomy.themes], ['Topics', s.taxonomy.topics], ['Keywords', s.taxonomy.keywords],
    ['Product-journey Topics', s.journeys.productTopics], ['Pre-product Topics', s.journeys.preProductTopics], ['Journey Coverage %', s.journeys.coveragePct],
    ['Audience Segments', s.segments.count],
    ['Prioritized Topics', s.contentPlan.prioritizedTopics], ['Selected for Delivery', s.contentPlan.selectedForDelivery],
    ['P0 / P1 / P2 / P3', `${s.contentPlan.byPriority.P0} / ${s.contentPlan.byPriority.P1} / ${s.contentPlan.byPriority.P2} / ${s.contentPlan.byPriority.P3}`],
    ['Quick Wins', s.contentPlan.quickWins],
  ]), [30, 60]);
  addSheet('Taxonomy', t.topicRows, [22, 14, 26, 30, 12, 16, 12, 12, 10, 10, 12, 18, 20, 10, 12, 16, 16, 40, 14, 16]);
  addSheet('Keywords', t.kwRows, [22, 26, 30, 42, 14, 14, 8, 20, 12]);
  addSheet('Content Plan (Delivery)', t.planRows, [22, 26, 30, 10, 12, 12, 18, 12, 16, 40]);
  addSheet('Segments', t.segRows, [24, 44, 20, 16, 10, 10, 26, 16]);
  addSheet('Journey Stages', t.journeyRows, [16, 10, 16, 12, 10]);
  addSheet('Insights', t.insightRows, [8, 10, 90, 44]);

  // ── files ──
  const zip = new JSZip();
  const wbBytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  zip.file(`${base}.xlsx`, wbBytes);
  zip.file('delivery-manifest.json', JSON.stringify(manifest, null, 2));

  const csvDir = zip.folder('csv')!;
  csvDir.file('taxonomy.csv', toCsv(Object.keys(t.topicRows[0] ?? { Umbrella: '' }), t.topicRows));
  csvDir.file('keywords.csv', toCsv(Object.keys(t.kwRows[0] ?? { Keyword: '' }), t.kwRows));
  csvDir.file('content-plan-delivery.csv', toCsv(Object.keys(t.planRows[0] ?? { Topic: '' }), t.planRows));
  csvDir.file('segments.csv', toCsv(Object.keys(t.segRows[0] ?? { Segment: '' }), t.segRows));
  csvDir.file('journey-stages.csv', toCsv(Object.keys(t.journeyRows[0] ?? { Stage: '' }), t.journeyRows));
  csvDir.file('insights.csv', toCsv(Object.keys(t.insightRows[0] ?? { ID: '' }), t.insightRows));

  zip.file('README.md', buildReadme(manifest));

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, filename: `${base}.zip`, manifest };
}

// ─── README data dictionary ─────────────────────────────────────────────────────
export function buildReadme(m: DeliveryManifest): string {
  const s = m.summary;
  return `# OrbitIQ Delivery Package — ${m.client.name}

This is a **delivery baseline**: the complete SEO + GEO analysis for **${m.client.name}** (${m.client.websiteUrl || 'no URL'}), packaged so a delivery colleague can integrate it as the starting point for solution work. It carries the full footprint AND flags the finalized delivery subset.

- **OrbitIQ version:** ${m.generator.appVersion}
- **Package schema:** ${m.schemaVersion}
- **Package type:** ${m.generator.packageType}

## What's in the box

| File | What it is |
|---|---|
| \`delivery-manifest.json\` | **The integration backbone.** Full structured data — nested taxonomy, journeys, segments, scope, rank, AI/authority/local, insights, content plan. Integrate against this. |
| \`orbitiq-delivery-*.xlsx\` | Human-readable mirror — one tab per panel (Overview, Taxonomy, Keywords, Content Plan, Segments, Journey Stages, Insights). |
| \`csv/*.csv\` | Row-level CSV mirrors of the same tables, for pipelines that prefer flat files. |
| \`README.md\` | This file. |

## Headline positioning (all real rollups)

- Footprint: **${s.footprintKeywordCount.toLocaleString()}** keywords · **${s.totalMonthlyDemand.toLocaleString()}/mo** total demand
- Page-1 capture: **${s.page1CapturePct}%** (${s.page1MonthlyDemand.toLocaleString()}/mo captured; ${s.offPage1MonthlyDemand.toLocaleString()}/mo off page 1)
- Structure: **${s.taxonomy.umbrellas}** umbrellas › **${s.taxonomy.themes}** themes › **${s.taxonomy.topics}** topics › **${s.taxonomy.keywords.toLocaleString()}** keywords
- Journeys: **${s.journeys.productTopics}** product topics · **${s.journeys.preProductTopics}** pre-product topics · **${s.journeys.coveragePct}%** coverage
- Segments: **${s.segments.count}** (${s.segments.attributedTopics} topics attributed, ${s.segments.sharedTopics} shared)
- Content plan: **${s.contentPlan.prioritizedTopics}** prioritized · **${s.contentPlan.selectedForDelivery}** selected for delivery (P0/P1/P2/P3 = ${s.contentPlan.byPriority.P0}/${s.contentPlan.byPriority.P1}/${s.contentPlan.byPriority.P2}/${s.contentPlan.byPriority.P3})

## The manifest, section by section

- **\`taxonomy[]\`** — the tree, nested **umbrella › theme › topic › keyword**. Every node carries its exact monthly-volume rollup. Each \`umbrella\` has a \`scope\` (\`core\` = the client competes here; \`adjacent\` = competitor-only vertical, excluded from footprint totals).
- **topic fields** — \`state\` (existing / missing / competitor), \`action\` (optimize / build), \`intentStage\` (funnel stage), \`priority\`, \`quickWin\`, \`bestPosition\` (client's best real SERP position — \`null\` if unranked), \`clientCapturePct\`, \`segment\`, and the delivery flags **\`inContentPlan\`** / **\`inDeliveryScope\`**.
- **keyword fields** — \`searchVolume\`, \`position\` (\`null\` = client not ranking), \`isGap\`, \`competitor\`, \`origin\` (\`footprint\` = client already ranks; \`demand\` = deep-journey missing demand).
- **\`journeys\`** — product (full funnel) vs pre-product (awareness-only, problem/trigger-based), with per-stage aggregates.
- **\`segments[]\`** — audience segments with per-topic attribution. \`volumeSharePct\` is a **modeled** share (\`volumeShareModeled: true\`).
- **\`rank.shareOfVoice\`** — **modeled** (\`modeled: true\`): a labeled CTR-by-position estimate over real volumes + positions. Never treat as measured data.
- **\`aiVisibility\` / \`authority\` / \`localSearch\`** — persisted real aggregates; \`null\` when not loaded for this project (honest gap).
- **\`insights[]\`** — the exact panel findings (\`finding\` sentence + \`evidence\` source).
- **\`contentPlan.selectedTopics[]\`** — the finalized delivery-ready subset (same records as the tree, filtered to what was picked).

## Defensibility

${m.provenance.dataIntegrity}

${m.provenance.modeledMetrics}

_Data-vendor names are intentionally omitted; provenance is labeled by lens (ranking / demand / AI-visibility)._
`;
}
