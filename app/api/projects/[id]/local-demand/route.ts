/**
 * app/api/projects/[id]/local-demand/route.ts — v7.504
 *
 * PER-LOCATION LOCAL DEMAND. Answers "how much search demand sits in each office's
 * market", on two measured bases and nothing else (Const I.1):
 *
 *   • CITY-NAMED keywords — the searcher named the market, so the Semrush volume on
 *     file already IS that market's demand. Free: no request is made for these.
 *   • PORTABLE keywords ("near me", plain service terms) — one Google Ads Search Volume
 *     task PER MARKET returns Google's own average monthly volume for those keywords as
 *     seen from that market. Coordinates cannot be used for this (Google Ads restriction,
 *     dataforseo.com/help-center/sv-for-city-or-coordinates), so each office is resolved
 *     to a City geo target first; an office that cannot be resolved is REPORTED, never
 *     attached to its state.
 *
 * Cost shape: one billed task per market, up to 1,000 keywords in the same task, so the
 * spend is driven by the number of markets, not the keyword count. dryRun returns the
 * market count, the keyword count and the cost basis BEFORE anything is spent (I.5b).
 *
 * Long-run shape mirrors the v7.410 review fetch: a time-budgeted slice per request,
 * a DB checkpoint every few markets, live progress, and the client auto-continues until
 * nothing is pending — so a killed function never throws away paid-for work. Live mode
 * is capped by DataForSEO at 12 requests/minute, so requests are paced; the panel shows
 * the resulting ETA rather than a spinner (Const IV.2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { setUsageProject } from '@/lib/usage/context';
import { db } from '@/db';
import { analyses, projects, projectKeywords } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getMarket } from '@/lib/utils/markets';
import { buildKwPool } from '@/lib/utils/kwVolume';
import { hydrateSnapshotForPool } from '@/lib/utils/hydrateSnapshot';
import { loadDisplayAnalysisWithSemrush } from '@/lib/analysis/loadDisplayAnalysis';   // II.9
import { checkListingIntegrity } from '@/lib/local/listingIntegrity';
import { classifyLocalKeywords, buildClientRelevance } from '@/lib/local/detect';
import type { LocalListing, LocalScan } from '@/lib/local/build';
import {
  splitLocalKeywords, resolveOfficeLocations, cityNamedByOffice, marketSharers, geoVocabFromOffices,
  officeKey, cityStateFromAddress, type LocalDemand, type DemandLocationRow,
} from '@/lib/local/localDemand';
import { dfsGoogleAdsLocations, dfsGoogleAdsSearchVolume, dataForSeoEnabled } from '@/lib/apis/dataforseo';

export const maxDuration = 300;

const KEYWORD_CAP        = 1000;     // DataForSEO's own per-task maximum
const REQUEST_SPACING_MS = 5_200;    // live mode is capped at 12 requests/minute
const TIME_BUDGET_MS     = 200_000;  // return well inside Vercel's 300s cap
const CHECKPOINT_EVERY   = 5;        // markets per DB write

/** The office rows the demand read runs on: client offices with a usable city. */
function demandOffices(scan: LocalScan | undefined): LocalListing[] {
  const checked = checkListingIntegrity(scan?.locations ?? []).listings;
  return checked.filter(l => l && l.isClient) as LocalListing[];
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = params.id;
  setUsageProject(projectId);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const dryRun = body?.dryRun === true;

  if (!dataForSeoEnabled()) {
    return NextResponse.json({
      error: 'DataForSEO is not configured. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Vercel → Settings → Environment Variables. Per-market search volume comes from Google Ads through DataForSEO; no other configured provider reports it.',
    }, { status: 500 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), with: { competitors: true } });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Const II.9: scalar heads for the pick, then the semrush snapshot alone.
  const loaded = await loadDisplayAnalysisWithSemrush(projectId);
  const analysis: any = loaded ? { id: loaded.head.id, semrushSnapshot: loaded.semrushSnapshot } : null;
  if (!analysis || analysis.semrushSnapshot == null) {
    return NextResponse.json({ error: 'No analysis with keyword data yet. Run an analysis first.' }, { status: 400 });
  }
  const snap: any = analysis.semrushSnapshot;
  const scan: LocalScan | undefined = snap?._localScan;
  const offices = demandOffices(scan);
  if (offices.length === 0) {
    return NextResponse.json({ error: 'No office locations on file. Run the local scan first so OrbitIQ knows which markets to measure.' }, { status: 400 });
  }

  const market = getMarket((project as any).semrushDatabase);
  const countryIso = market.code === 'uk' ? 'GB' : market.code.toUpperCase();

  // ── the keyword basis: the SAME canonical pool every local surface reads ──
  const dbKws = await db.select().from(projectKeywords).where(eq(projectKeywords.projectId, projectId));
  const clientDomain = String((project as any).websiteUrl ?? '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
  const competitorDomains: string[] = ((project as any).competitors ?? []).map((c: { domain: string }) => c.domain).filter(Boolean);
  const hydrated = hydrateSnapshotForPool(project, snap);
  const pool = buildKwPool({
    semrushSnapshot:   hydrated,
    uploadedKeywords:  dbKws,
    clientDomain,
    competitorDomains,
    clientVolMin:      (project as any).kwVolThresholdClient ?? 0,
    competitorVolMin:  (project as any).kwVolThresholdCompetitor ?? 0,
  });
  const relevance = buildClientRelevance(
    (hydrated as any)?._categoryBreakdown?.categories ?? null,
    clientDomain,
    competitorDomains,
    (pool as any[]).slice(0, 400).map(p => String(p.keyword ?? '')),
  );
  const locals = classifyLocalKeywords(pool as any[], {
    geoVocab: geoVocabFromOffices(offices),
    relevanceTokens: relevance,
  });
  const split = splitLocalKeywords(locals, offices);
  const portableKeywords = split.portable.slice(0, KEYWORD_CAP).map(p => p.keyword);

  // ── markets ────────────────────────────────────────────────────────────────
  const dfsLocations = await dfsGoogleAdsLocations(countryIso);
  if (dfsLocations.length === 0) {
    return NextResponse.json({ error: `Could not read Google's market list for ${countryIso}. Nothing was measured and nothing was charged — try again in a moment.` }, { status: 502 });
  }
  const { resolved, unresolved } = resolveOfficeLocations(offices, dfsLocations);

  const prior: LocalDemand | undefined = snap?._localDemand;
  const priorByKey: Record<string, DemandLocationRow> = {};
  const sameList = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
  const sameBasis = !!prior && sameList(prior.portableKeywords ?? [], portableKeywords);
  if (sameBasis) (prior!.rows ?? []).forEach(r => { priorByKey[r.key] = r; });

  // One request per distinct market; offices sharing a market share the answer.
  const marketsToRead: Array<{ code: number; name: string; keys: string[] }> = [];
  const byCode: Record<string, { code: number; name: string; keys: string[] }> = {};
  for (let i = 0; i < offices.length; i++) {
    const key = officeKey(offices[i]);
    const r = resolved[key];
    if (!r) continue;
    const k = String(r.locationCode);
    if (!byCode[k]) { byCode[k] = { code: r.locationCode, name: r.locationName, keys: [] }; marketsToRead.push(byCode[k]); }
    byCode[k].keys.push(key);
  }
  const pending = marketsToRead.filter(m => {
    const done = m.keys.some(k => priorByKey[k] && priorByKey[k].measuredAt);
    return !done;
  });

  if (dryRun) {
    return NextResponse.json({
      plan: {
        offices: offices.length,
        markets: marketsToRead.length,
        marketsPending: pending.length,
        unresolved: unresolved.length,
        unresolvedSample: unresolved.slice(0, 5),
        portableKeywords: portableKeywords.length,
        portableAvailable: split.portable.length,
        cityNamedKeywords: split.cityNamed.length,
        keywordCap: KEYWORD_CAP,
        requests: pending.length,
        listCostPerRequest: 0.09,
        estCostUSD: Math.round(pending.length * 0.09 * 100) / 100,
        costBasis: 'DataForSEO list price $0.09 per live task (one market, up to 1,000 keywords), read 2026-09-17. The ledger records the real per-task cost the API reports.',
        etaMinutes: Math.ceil((pending.length * REQUEST_SPACING_MS) / 60000),
      },
    });
  }

  if (pending.length === 0 && sameBasis) {
    return NextResponse.json({ error: 'Every market already has demand on file for this keyword set. Change the keyword basis or re-run the local scan to measure again.' }, { status: 400 });
  }

  const cityNamed = cityNamedByOffice(offices, split.cityNamed);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      try {
        const rowByKey: Record<string, DemandLocationRow> = {};
        for (let i = 0; i < offices.length; i++) {
          const o = offices[i];
          const key = officeKey(o);
          const r = resolved[key];
          const cn = cityNamed[key] ?? { kw: 0, volume: 0 };
          const carried = sameBasis ? priorByKey[key] : undefined;
          const fromAddr = cityStateFromAddress(o.address ?? '');
          rowByKey[key] = {
            key,
            title: o.title,
            city: o.city || fromAddr.city,
            state: fromAddr.state,
            locationCode: r ? r.locationCode : null,
            locationName: r ? r.locationName : '',
            sharesMarket: [],
            cityNamedKw: cn.kw,
            cityNamedVolume: cn.volume,
            portableKw: carried?.portableKw ?? 0,
            portableVolume: carried?.portableVolume ?? 0,
            belowThreshold: carried?.belowThreshold ?? 0,
            totalVolume: (carried?.portableVolume ?? 0) + cn.volume,
            measuredAt: carried?.measuredAt ?? null,
          };
        }

        let callsUsed = 0, costUSD = 0, done = 0;
        const deadline = Date.now() + TIME_BUDGET_MS;

        const persist = async (): Promise<LocalDemand> => {
          const rows = Object.keys(rowByKey).map(k => rowByKey[k]);
          const sharers = marketSharers(rows);
          rows.forEach(r => { r.sharesMarket = sharers[r.key] ?? []; });
          const demand: LocalDemand = {
            builtAt: new Date().toISOString(),
            languageCode: market.dfsLanguageCode,
            countryIso,
            keywordCap: KEYWORD_CAP,
            portableKeywords,
            rows,
            unresolved,
            callsUsed: (sameBasis ? (prior?.callsUsed ?? 0) : 0) + callsUsed,
            costUSD: Math.round((((sameBasis ? (prior?.costUSD ?? 0) : 0) + costUSD)) * 10000) / 10000,
            source: 'Google Ads average monthly searches, read per market through DataForSEO',
          };
          await db.update(analyses)
            .set({ semrushSnapshot: { ...(analysis.semrushSnapshot as any), _localDemand: demand } as any })
            .where(eq(analyses.id, analysis.id));
          return demand;
        };

        send({ type: 'start', total: pending.length, phase: `Reading demand in ${pending.length} markets…` });

        for (let i = 0; i < pending.length; i++) {
          if (Date.now() > deadline) break;
          const m = pending[i];
          if (i > 0) await new Promise(r => setTimeout(r, REQUEST_SPACING_MS));   // 12 req/min cap
          const { rows, costUSD: c, ok } = await dfsGoogleAdsSearchVolume(portableKeywords, m.code, market);
          callsUsed++; costUSD += c;
          if (ok) {
            let vol = 0, below = 0;
            for (let j = 0; j < rows.length; j++) {
              const v = rows[j].searchVolume;
              if (typeof v === 'number') vol += v; else below++;
            }
            const stamp = new Date().toISOString();
            for (let j = 0; j < m.keys.length; j++) {
              const row = rowByKey[m.keys[j]];
              if (!row) continue;
              row.portableKw = rows.length;
              row.portableVolume = vol;
              row.belowThreshold = below;
              row.totalVolume = vol + row.cityNamedVolume;
              row.measuredAt = stamp;
            }
          }
          done++;
          send({ type: 'progress', done, total: pending.length, seed: m.name });
          if (done % CHECKPOINT_EVERY === 0) {
            try { await persist(); } catch (e) { console.error('[OrbitIQ] local-demand checkpoint failed:', e); }
          }
        }

        const demand = await persist();
        const remaining = Math.max(0, pending.length - done);
        console.log(`[OrbitIQ] Local demand: ${done}/${pending.length} markets this pass, ${callsUsed} tasks, $${costUSD.toFixed(4)} measured, ${remaining} pending`);
        send({ type: 'done', localDemand: demand, completed: done, remaining, callsUsed, costUSD });
        controller.close();
      } catch (err: any) {
        send({ type: 'error', error: String(err?.message ?? err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
