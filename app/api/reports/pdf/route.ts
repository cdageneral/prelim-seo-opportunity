import { NextRequest, NextResponse } from 'next/server';
import { z }       from 'zod';
import { put }     from '@vercel/blob';
import { db }      from '@/db';
import { analyses, reports, projectKeywords, competitors } from '@/db/schema';
import { eq }      from 'drizzle-orm';
// v7.374: the header PDF button now generates the client ASSESSMENT REPORT
// (design spec GEO/orbitiq-assessment-report-mockup-v3-2026-07-16.html) instead
// of the legacy brief. Same shared math as the panels (Const II.6/II.7): pool +
// capture from buildKwPool/computeVolumeMetrics, SoV from computeSov, and the
// AI answer-layer sections from the stored Profound panel metrics
// (projects.profound_data — the panel's own aggregate of real CSV rows, v7.318).
import { buildAssessmentHTML, type ProfoundMetrics, type SerpFeatureSnapshot } from '@/lib/pdf/assessmentTemplate';
// v7.405: Part V counts — computed off the SAME pool the capture metrics use, so
// the ladder reconciles with the rest of the report (Const II.6/II.7).
import { buildProgramData } from '@/lib/pdf/programData';
// v7.335 (QC audit B2, Const I.5a/II.7): the PDF computes the SAME page-1
// capture + Share-of-Voice the app renders, instead of the stored pre-v7.245 model.
import { hydrateSnapshotForPool }             from '@/lib/utils/hydrateSnapshot';
// v7.407: buildLocalPackKeywordSet is the SAME local-intent signal the Keyword
// panel badges and the Local panel's picker gates on (Const II.7) — the report
// uses it to tell "this brand has no local component" apart from "this brand
// competes locally but the scan is missing", so the second case can say so.
import { buildKwPool, computeVolumeMetrics, buildLocalPackKeywordSet } from '@/lib/utils/kwVolume';
import { computeSov }                          from '@/lib/sov/model';
// v7.376: the report's audience-segment + journey sections run the SAME canonical
// topic build and attribution the panels do — the chain moved to lib/ this release
// (Const II.6/II.7). The Claude intent-assignment map is read from its new stored
// home (semrushSnapshot._clusterAssigns) and computed+persisted once if absent, so
// the report can never run on a silently-empty map (the v7.220 under-count class).
import { buildCanonicalClusterTopics }         from '@/lib/clusters/canonical';
import { buildProductRows, buildCategoryTree, flattenNodes, type ProductRow, type ProductKpi, type StoredCatScan, buildPlatformMix, PLATFORM_LABEL, buildContentFootprint, type NodeKw } from '@/lib/productInsights';   // v7.427/v7.432/v7.449: the panel's shared basis (Const II.6b)
import { buildIntentPool, classifyIntents, persistClusterAssigns, type AssignMap } from '@/lib/clusters/intentAssign';
import { setUsageProject }                     from '@/lib/usage/context';
import { instrumentAnthropic }                 from '@/lib/usage/record';
import Anthropic                               from '@anthropic-ai/sdk';

const Schema = z.object({ analysisId: z.string().uuid() });
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const analysis = await db.query.analyses.findFirst({
    where: eq(analyses.id, parsed.data.analysisId),
    with: { project: true, opportunities: { orderBy: (o, { asc }) => [asc(o.rank)] }, personas: true },
  });

  if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });

  // ── v7.335 (QC audit B2, Const I.5a/II.7) ──────────────────────────────────
  // Build the SAME canonical pool the app's panels read: snapshot hydrated with
  // the project row's _brandTerms/_excludedBrands/_scopeOverrides (mirroring
  // app/projects/[id]/page.tsx via hydrateSnapshotForPool), uploaded
  // project_keywords rows, tracked competitor domains, and the project-default
  // volume thresholds (same semantics as the Exec hero). Capture comes from
  // computeVolumeMetrics on that pool; Share of Voice from the shared page-1
  // click-capture model (lib/sov/model.ts — the exact math SovPanel renders).
  // The template falls back to the stored legacy fields, clearly labeled, ONLY
  // when this snapshot cannot build a pool (honest fallback, Const I.5).
  const project = (analysis as any).project ?? {};
  const [kwRows, compRows] = await Promise.all([
    db.select().from(projectKeywords).where(eq(projectKeywords.projectId, (analysis as any).projectId)),
    db.select().from(competitors).where(eq(competitors.projectId, (analysis as any).projectId)),
  ]);
  const snap              = hydrateSnapshotForPool(project, (analysis as any).semrushSnapshot ?? {});
  const clientDomain      = (snap?.domain ?? '') as string;
  const competitorDomains = compRows.map(c => c.domain).filter(Boolean);
  const pool = buildKwPool({
    semrushSnapshot:   snap,
    uploadedKeywords:  kwRows,
    clientDomain,
    competitorDomains,
    clientVolMin:      project.kwVolThresholdClient ?? 0,
    competitorVolMin:  project.kwVolThresholdCompetitor ?? 0,
    includeDemand:     true,   // same footprint basis as the Exec hero (v7.305)
  });
  const metrics = computeVolumeMetrics(pool);
  const sov = computeSov({
    analysis:    { ...(analysis as any), semrushSnapshot: snap },
    competitors: competitorDomains,
    dbKeywords:  kwRows,
    clientLabel: project.clientName ?? '',
  });

  // ── v7.374: assemble the assessment-report data (real sources only, I.1) ──
  // v7.375: all dates removed from the report (client feedback), and two new
  // conditional sections wired in — Authority Signals (projects.authority_snapshot,
  // the panel's own persisted aggregate, v7.367) and Local Search (the analysis
  // snapshot's _localScan blob the Local panel reads). Both render ONLY when
  // their source data exists (honest gaps, Const I.5); the shared rollup math
  // lives in lib/local/build.ts and the template (Const II.6/II.7).
  const profound = ((project as any).profoundData ?? null) as ProfoundMetrics | null;

  // ── v7.376: canonical journey topics + audience segments (same build as the panels) ──
  // Intent-assignment map: stored copy first; if absent, run the shared Layer-2 pass
  // once and persist it (never build canonical topics on a silently-empty map).
  setUsageProject((analysis as any).projectId);
  let claudeAssigns: AssignMap = ((snap as any)?._clusterAssigns ?? {}) as AssignMap;
  if (Object.keys(claudeAssigns).length === 0) {
    const intentPool = buildIntentPool(snap);
    if (intentPool.length > 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const client = instrumentAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
        claudeAssigns = await classifyIntents(client, intentPool, (project.industry ?? 'General'), clientDomain);
        await persistClusterAssigns(parsed.data.analysisId, claudeAssigns);
      } catch (err) {
        console.error('[PDF v7.376] intent-assignment pass failed — journey build proceeds with signal-matched intents only:', err);
      }
    }
  }
  // Same call signature the page uses (thresholds default 0 there too). A build
  // failure omits the journey sections honestly (mirrors the page's v7.337 rule).
  let journeyTopics: ReturnType<typeof buildCanonicalClusterTopics> | null = null;
  try {
    journeyTopics = buildCanonicalClusterTopics(
      { ...(analysis as any), semrushSnapshot: snap },
      clientDomain, competitorDomains, kwRows, claudeAssigns,
    );
  } catch (err) {
    console.error('[PDF v7.376] canonical topic build FAILED — journey sections omitted:', err);
  }

  // ── v7.427: Product Insights — the SAME shared basis the panel renders (Const II.6b) ──
  // Inputs are all already loaded above; a build failure omits the section honestly.
  let productInsights: { products: ProductRow[]; kpi: ProductKpi; scannedAt: string | null; subNodes?: any[]; contentByProduct?: any[] } | null = null;
  try {
    if (journeyTopics && journeyTopics.length > 0) {
      const scans = (((project as any).productInsights?.categories ?? []) as StoredCatScan[]);
      const built = buildProductRows({
        topics:           journeyTopics,
        uploadedKeywords: kwRows,
        serpPositions:    ((snap as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
        llmProbe:         (analysis as any).llmProbe ?? null,
        storedScans:      scans,
        clientDomain,
        brandTerms:       (((project as any).brandTerms ?? []) as string[]),
        breakdown:        (snap as any)?._categoryBreakdown,
      });
      if (built.products.length > 0) {
        const ts = (project as any).productInsightsUpdatedAt;
        // v7.432 (Const II.6b): the sub-category level the panel now measures also
        // reaches the report — the deepest measured levels, ranked by demand. Same
        // shared builder; AI is shown only where THAT node carries its own scan.
        const subNodes: Array<{ name: string; path: string; depth: number; demand: number; kwCount: number;
          p1Share: number; leader: string | null; leaderPct: number | null; clientRank: number | null;
          dfsShare: number | null; scanned: boolean;
          platformMix?: Array<{ label: string; rows: number; cited: number }> | null;
          platformsMissing?: string[] }> = [];
        // v7.449: per-product content footprint for the PDF (shared basis, II.6b)
        const contentByProduct: any[] = [];
        for (const prod of built.products) {
          const poolKeywords: Array<{ keyword: string; searchVolume: number; position: number | null; url?: string;
      origin?: 'footprint' | 'demand'; isGap?: boolean }> = [];
          const seenKw = new Set<string>();
          for (const t of prod.topics) for (const k of (t.keywords as any[])) {
            const kk = String(k?.keyword ?? '').toLowerCase().trim();
            if (!kk || seenKw.has(kk)) continue;
            seenKw.add(kk);
            poolKeywords.push({ keyword: kk, searchVolume: k.searchVolume || 0, position: k.position ?? null, url: k.url,
              origin: (k as any)?.origin === 'demand' ? 'demand' : 'footprint', isGap: !!(k as any)?.isGap });
          }
          const tree = buildCategoryTree(prod.name, {
            breakdown:        (snap as any)?._categoryBreakdown,
            poolKeywords,
            uploadedKeywords: kwRows,
            serpPositions:    ((snap as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
            storedScans:      scans,
            clientDomain,
            brandTerms:       (((project as any).brandTerms ?? []) as string[]),
          });
          // v7.449: Content Footprint by Brand — SAME shared builder the panel calls
          // (Const II.6b). Works without a stored taxonomy (flat line-level node).
          try {
            const cfNode = tree ?? { name: prod.name, allKws: poolKeywords as NodeKw[], children: [] as any[] };
            const cf = buildContentFootprint({
              node: cfNode as any,
              uploadedKeywords: kwRows,
              serpPositions: ((snap as any)?.serpCompetitorPositions ?? {}) as Record<string, Array<{ keyword: string; position: number }>>,
              clientDomain,
              // v7.458: the line's canonical topics → journey requirement in the SAME
              // shared builder the panel reads (II.6a/II.6b), never re-derived here.
              topics: prod.topics as any,
            });
            const you = cf.brands.find(b => b.kind === 'client') ?? null;
            const top = cf.brands[0] ?? null;
            const jOn = !!(cf.journey && cf.journey.total > 0);
            contentByProduct.push({
              product: prod.name,
              you: you ? { urls: you.total.urls, rankedKw: you.total.rankedKw, urlKw: you.total.urlKw } : null,
              leader: top ? { domain: top.domain, urls: top.total.urls, isClient: top.kind === 'client' } : null,
              brandCount: cf.brands.length,
              // v7.458: journey pages the full funnel needs (null = unknown, never 0 — I.5)
              journeyTotal: jOn ? cf.journey!.total : null,
              // v7.459 (Wayne): topics COVERED — same unit as the requirement, rank
              // evidence, read from the SAME shared builder the panel renders (II.6a).
              youCovered:    jOn && you?.covered ? you.covered.total : null,
              leaderCovered: jOn && top?.covered ? { domain: top.domain, covered: top.covered.total, isClient: top.kind === 'client' } : null,
              gaps: cf.gapChildIdx.map(i => {
                // v7.459: with a journey the gap is coverage-based; report the rival's
                // covered-topic count. Without one, the v7.449 URL rule and counts.
                if (jOn) {
                  const best = cf.brands.filter(b => b.kind !== 'client')
                    .reduce<{ domain: string; n: number } | null>((acc, b) =>
                      (!acc || (b.covered?.perChild[i] ?? 0) > acc.n) ? { domain: b.domain, n: b.covered?.perChild[i] ?? 0 } : acc, null);
                  return { child: cf.children[i]?.name ?? '', bestDomain: best?.domain ?? '', bestUrls: best?.n ?? 0, basis: 'covered' as const };
                }
                const best = cf.brands.filter(b => b.kind !== 'client')
                  .reduce<{ domain: string; urls: number } | null>((acc, b) =>
                    (!acc || b.perChild[i].urls > acc.urls) ? { domain: b.domain, urls: b.perChild[i].urls } : acc, null);
                return { child: cf.children[i]?.name ?? '', bestDomain: best?.domain ?? '', bestUrls: best?.urls ?? 0, basis: 'urls' as const };
              }),
              rivalsUncounted: cf.unlistedRivals.length,
            });
          } catch { /* section row omitted honestly (I.5) */ }
          if (!tree) continue;
          for (const n of flattenNodes(tree)) {
            const lead = n.ladder[0] ?? null;
            subNodes.push({
              name: n.name, path: n.path.join(' > '), depth: n.depth, demand: n.demand, kwCount: n.kwCount,
              p1Share: n.p1Share,
              leader: lead ? (lead.kind === 'client' ? 'you' : lead.domain) : null,
              leaderPct: lead ? (lead.p1Vol / Math.max(n.demand, 1)) * 100 : null,
              clientRank: n.clientRank, dfsShare: n.dfsShare, scanned: !!n.scan,
              // v7.435: the platform split behind the AI figure (same shared basis as the panel)
              platformMix: n.scan
                ? buildPlatformMix(n.scan, clientDomain, (((project as any).brandTerms ?? []) as string[]))
                    .map(m => ({ label: m.label, rows: m.rows, cited: m.cited }))
                : null,
              platformsMissing: n.scan
                ? ['google', 'chat_gpt']
                    .filter(pf => !buildPlatformMix(n.scan!, clientDomain, (((project as any).brandTerms ?? []) as string[])).some(m => m.platform === pf))
                    .map(pf => PLATFORM_LABEL[pf] ?? pf)
                : [],
            });
          }
        }
        subNodes.sort((a, b) => b.demand - a.demand);
        productInsights = { ...built, scannedAt: ts ? new Date(ts).toISOString() : null, subNodes, contentByProduct };
      }
    }
  } catch (err) {
    console.error('[PDF v7.427] product insights build FAILED — section omitted:', err);
  }

  // ── v7.404: real AI Overview + People Also Ask rows, flattened for the report ──
  // Both are already scanned per keyword (lib/apis/serp.ts) and stored on
  // analyses.serp_api_snapshot, but nothing ever passed them to this report. The
  // client's ranking URL is resolved from the SAME organicResults the scan stored
  // (registrable-domain match), and volume is joined from the shared pool above —
  // no value here is modeled. Absent snapshot => null => the section is omitted
  // entirely rather than rendering a placeholder (Const I.5).
  const serpFeatures: SerpFeatureSnapshot | null = (() => {
    const sp: any = (analysis as any).serpApiSnapshot;
    const rows: any[] = Array.isArray(sp?.keywords) ? sp.keywords : [];
    if (rows.length === 0) return null;

    const reg = (h: string) => h.replace(/^www\./i, '').toLowerCase();
    const hostOf = (u: string) => { try { return reg(new URL(u).hostname); } catch { return ''; } };
    const clientHost = hostOf(clientDomain) || reg(String(clientDomain || '').split('/')[0] || '');
    const isClient = (u: string) => {
      const h = hostOf(u);
      return !!h && !!clientHost && (h === clientHost || h.endsWith(`.${clientHost}`));
    };

    const volByKw = new Map<string, number>();
    for (const k of pool as any[]) {
      const key = String(k?.keyword ?? '').toLowerCase();
      if (key) volByKw.set(key, Number(k?.searchVolume ?? 0));
    }

    const keywords = rows.map(k => {
      const organic: any[] = Array.isArray(k?.organicResults) ? k.organicResults : [];
      const own = organic.find(r => isClient(String(r?.url ?? '')));
      const aioSrc: any[] = Array.isArray(k?.aioSources) ? k.aioSources : [];
      const paaQs: any[] = Array.isArray(k?.paaQuestions) ? k.paaQuestions : [];
      const kw = String(k?.keyword ?? '');
      return {
        keyword:        kw,
        clientRank:     typeof k?.clientRank === 'number' ? k.clientRank : null,
        clientUrl:      own ? String(own.url) : null,
        searchVolume:   volByKw.has(kw.toLowerCase()) ? (volByKw.get(kw.toLowerCase()) as number) : null,
        hasAIO:         !!k?.hasAIO,
        aioClientCited: aioSrc.some(s => isClient(String(s?.link ?? s?.url ?? ''))),
        hasPAA:         paaQs.length > 0,
        paaClientCited: !!k?.paaClientCited,
      };
    });

    return {
      scanned:        keywords.length,
      withAIO:        keywords.filter(k => k.hasAIO).length,
      aioClientCited: keywords.filter(k => k.hasAIO && k.aioClientCited).length,
      withPAA:        keywords.filter(k => k.hasPAA).length,
      paaClientCited: keywords.filter(k => k.hasPAA && k.paaClientCited).length,
      keywords,
    };
  })();

  // ── v7.405: the Recommended Program counts ────────────────────────────────
  // The pool already carries the client's real ranking URL per keyword: §1 takes
  // it from the Semrush footprint and §2 backfills it from the uploaded CSV when
  // the footprint row entered URL-less (buildKwPool v7.254). So this works on
  // upload-sourced projects with no re-scan. Null => the ladder falls back to the
  // legacy step cards rather than printing an empty table (Const I.5).
  const program = buildProgramData(
    pool as any,
    (journeyTopics ?? null) as any,
    (serpFeatures?.keywords ?? null) as any,
  );

  const html = buildAssessmentHTML({
    clientName:   project.clientName ?? 'Client',
    websiteUrl:   project.websiteUrl ?? '',
    industry:     project.industry ?? null,
    poolCount:    pool.length,
    metrics,
    sov,
    profound,
    authority:    ((project as any).authoritySnapshot ?? null),
    // v7.407: the authority snapshot is frozen at scan time; passing the live
    // competitor list lets the template drop rivals that have since been removed
    // and name the ones added since the crawl (Const I.5). Same list the SoV
    // section above already uses, so one report can no longer print two rival sets.
    competitorDomains,
    localScan:    (((snap as any)?._localScan) ?? null),
    hasLocalIntent: buildLocalPackKeywordSet(snap, kwRows).size > 0,
    segments:     (((snap as any)?._audienceSegments) ?? null),
    journeyTopics,
    problemSeeds: (((snap as any)?._demandUniverse?.problemSeeds) ?? []) as string[],
    serpFeatures,
    program,
    productInsights,   // v7.427 (Const II.6b)
  });
  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await renderPDF(html);
  } catch (err) {
    console.error('[PDF] Render error:', err);
    return NextResponse.json({ error: 'PDF rendering failed' }, { status: 500 });
  }

  const filename = `orbitiq-assessment-${(analysis as any).project?.clientName?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  const { url }  = await put(filename, pdfBuffer, { access: 'public', contentType: 'application/pdf' });

  await db.insert(reports).values({ analysisId: parsed.data.analysisId, type: 'PDF', generatedAt: new Date(), fileUrl: url });
  return NextResponse.json({ fileUrl: url });
}

async function renderPDF(html: string): Promise<Buffer> {
  const chromium  = await import('@sparticuz/chromium');
  const puppeteer = await import('puppeteer-core');

  // v7.374: @sparticuz/chromium ^149 (AL2023/node22-compatible — the ^130 build
  // failed on Vercel's current runtime with a missing libnss3) + puppeteer-core
  // ^24. The v149 API dropped the defaultViewport/headless statics.
  const browser = await puppeteer.default.launch({
    args:           chromium.default.args,
    executablePath: await chromium.default.executablePath(),
    headless:       true,
  });

  try {
    const page = await browser.newPage();
    // 'load' (not networkidle0): the assessment HTML is fully self-contained —
    // no external requests — and puppeteer-core 24 narrowed setContent's type.
    await page.setContent(html, { waitUntil: 'load' });
    // v7.374: the assessment template lays out fixed 8.5×11in pages with its own
    // margins/footers, so the PDF prints Letter edge-to-edge (no outer margins).
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
