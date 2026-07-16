/**
 * lib/pdf/assessmentTemplate.ts — v7.374: the client ASSESSMENT REPORT.
 *
 * Builds the multi-page "Search & AI Visibility Assessment" the top-header PDF
 * button now generates (design spec: GEO/orbitiq-assessment-report-mockup-v3-
 * 2026-07-16.html, approved by Wayne 2026-07-16). Rendered server-side by the
 * existing /api/reports/pdf puppeteer pipeline into a downloadable PDF.
 *
 * Constitution:
 *  - I.1  Every number interpolated here arrives from a real computed source:
 *         the shared canonical pool (buildKwPool/computeVolumeMetrics), the
 *         shared SoV model (computeSov), and the stored Profound panel metrics
 *         (projects.profound_data — the panel's own aggregate of real CSV rows).
 *         Nothing is modeled except the SoV click estimate, which carries its
 *         named-curve label at every appearance (I.5a).
 *  - I.5  A section whose data source is absent renders an explicit honest-gap
 *         block (or is omitted with a coverage note) — never a placeholder value.
 *  - II.6/II.7 No forked math: pool metrics + SoV come from the same shared
 *         functions the panels call; Profound figures are the panel's OWN stored
 *         aggregates; insight sentences reuse lib/insights.ts verbatim.
 *  - Wayne's report rules (2026-07-16): data-vendor names never appear in the
 *         client-facing report (generic intelligence-layer names only); every
 *         page carries "Provided by the iQuanti & McKinsey Partnership".
 */

import type { SovComputed } from '@/lib/sov/model';
import {
  landGrabInsight, shadowCompetitorInsight, earnedFastPathInsight,
  fmtInsightVol, type Insight,
} from '@/lib/insights';

// ── Profound panel metrics (shape persisted verbatim by /api/projects/[id]/profound;
//    declared locally so this server module never imports from a client component) ──
interface PBrandStat  { brand: string; count: number; pct: number; isClient: boolean }
interface PPlatStat   { platform: string; runs: number; hits: number }
interface PTopicStat  { topic: string; runs: number; hits: number }
interface PPromptGap  { prompt: string; topic: string; rivalMentions: number; leader: string; leaderCount: number }
interface PSentBrand  { brand: string; pos: number; neg: number; isClient: boolean }
interface PMentionSent{ brand: string; pos: number; neutral: number; neg: number; total: number; isClient: boolean }
interface PDomainStat { domain: string; count: number; isClient: boolean; isCompetitor: boolean }
interface PDemandTopic{ topic: string; share: number; prompts: number }
interface PDemandPrompt{ prompt: string; share: number; topic: string }
interface PCiteCat    { category: string; count: number; pct: number }
interface PCiteDomain { hostname: string; count: number }
interface PEngineMix  { platform: string; total: number; earned: number; competition: number; owned: number; other: number }
interface PMentionSrc { hostname: string; count: number; isClient: boolean }

export interface ProfoundMetrics {
  client: string; tracked: string[];
  totalRuns: number; clientHits: number;
  engines: PPlatStat[]; sov: PBrandStat[];
  overallTop: { brand: string; count: number; pct: number }[];
  topics: PTopicStat[]; promptN: number; coverage: PBrandStat[];
  gaps: PPromptGap[];
  sentBrands: PSentBrand[]; mentionSent: PMentionSent[];
  totalCites: number; domains: PDomainStat[];
  demandTopics: PDemandTopic[]; demandPrompts: PDemandPrompt[]; demandPromptTotal: number;
  citeTotal: number; citeOwned: number; citeOwnedShare: number;
  citeCompetition: number; citeCatMix: PCiteCat[];
  earnedTargets: PCiteDomain[]; competitorCites: PCiteDomain[];
  engineSourceMix: PEngineMix[];
  citeMentions: number; citeMentionSources: PMentionSrc[];
  citeMentionByPlatform: { platform: string; count: number }[];
  domainTotalDistinct?: number;
  updatedAt?: string;
}

export interface AssessmentData {
  clientName: string;
  websiteUrl: string;
  industry?: string | null;
  preparedDate: string;              // e.g. "July 16, 2026"
  scanDate?: string | null;          // last analysis/scan date (real timestamp off the row)
  aiDataDate?: string | null;        // profound_data_updated_at
  poolCount: number;
  metrics: { totalMonthly: number; totalAnnual: number; page1Monthly: number; page1Annual: number; captureRate: number };
  sov: SovComputed | null;
  profound: ProfoundMetrics | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n0  = (v: number) => Math.round(v).toLocaleString('en-US');
const p0  = (v: number) => `${Math.round(v)}%`;
const p1  = (v: number) => `${v.toFixed(1)}%`;
const vol = (v: number) => fmtInsightVol(v);
const clampW = (v: number) => Math.max(1.2, Math.min(100, v));

function insightHTML(ins: Insight | null, title: string): string {
  if (!ins) return '';
  const body = ins.parts.map(s => (s.em ? `<b>${esc(s.t)}</b>` : esc(s.t))).join('');
  return `<div class="callout"><div class="t">${esc(title)}</div><p>${body}</p></div>`;
}

function barRow(label: string, widthPct: number, valText: string, color = 'var(--blue)', labCols = '1.35in', valCols = '1in'): string {
  return `<div class="barrow" style="grid-template-columns:${labCols} 1fr ${valCols};">
    <span class="lab">${esc(label)}</span>
    <div class="track"><div class="fill" style="width:${clampW(widthPct).toFixed(1)}%; background:${color};"></div></div>
    <span class="val">${esc(valText)}</span></div>`;
}

function tile(k: string, v: string, d: string, cls = ''): string {
  return `<div class="tile ${cls}"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`;
}

function gapBlock(what: string, how: string): string {
  return `<div class="gapblock"><div class="t">DATA NOT YET LOADED</div>
    <p><b>${esc(what)}</b> has not been loaded for this project, so this section is omitted rather than estimated. ${esc(how)}</p></div>`;
}

// ── the document ─────────────────────────────────────────────────────────────
export function buildAssessmentHTML(d: AssessmentData): string {
  const name = esc(d.clientName || 'Client');
  const m = d.metrics;
  const sov = d.sov && d.sov.basis === 'capture' ? d.sov : null;
  const pf  = d.profound && (d.profound.totalRuns > 0 || (d.profound.citeTotal || 0) > 0) ? d.profound : null;

  const scanLine = d.scanDate ? `Scan ${esc(d.scanDate)}` : 'Scan date on file';
  const footLeft = `OrbitIQ Assessment · Provided by the iQuanti &amp; McKinsey Partnership · ${name} · ${scanLine}`;

  // ── derived (direct tallies over stored rows — no re-modeling) ─────────────
  const offPage1Monthly = Math.max(0, m.totalMonthly - m.page1Monthly);
  const openPct   = sov ? (sov.availableClicks > 0 ? (sov.availableClicks - sov.capturedClicks - sov.compEntries.concat(sov.serpEntries).reduce((s, e) => s + e.capturedClicks, 0)) / sov.availableClicks : 0) : 0;
  const rivals    = sov ? sov.compEntries.concat(sov.serpEntries).slice().sort((a, b) => b.pct - a.pct) : [];
  const topRival  = rivals[0] ?? null;

  const pfVisPct   = pf && pf.totalRuns > 0 ? (pf.clientHits / pf.totalRuns) * 100 : 0;
  const pfClientCov= pf ? pf.coverage.find(c => c.isClient) ?? null : null;
  const pfRivalCov = pf ? pf.coverage.filter(c => !c.isClient).sort((a, b) => b.count - a.count)[0] ?? null : null;
  const pfEarned   = pf ? pf.citeCatMix.find(c => c.category.toLowerCase().includes('earned')) ?? null : null;
  const pfMentionHosts = pf ? (pf.citeMentionSources || []).filter(h => !h.isClient) : [];
  const pfBridge   = pfMentionHosts.filter(h => h.count >= 10).slice(0, 3);
  const pfBridgeSum= pfBridge.reduce((s, h) => s + h.count, 0);
  const gapsByLeader = new Map<string, number>();
  const gapsByTopic  = new Map<string, { n: number; leaders: Map<string, number> }>();
  if (pf) for (const g of pf.gaps || []) {
    gapsByLeader.set(g.leader, (gapsByLeader.get(g.leader) ?? 0) + 1);
    const t = gapsByTopic.get(g.topic) ?? { n: 0, leaders: new Map<string, number>() };
    t.n += 1; t.leaders.set(g.leader, (t.leaders.get(g.leader) ?? 0) + 1);
    gapsByTopic.set(g.topic, t);
  }
  const leaderRows = Array.from(gapsByLeader.entries()).sort((a, b) => b[1] - a[1]);
  const topicRows  = Array.from(gapsByTopic.entries()).map(([topic, t]) => {
    const lead = Array.from(t.leaders.entries()).sort((a, b) => b[1] - a[1])[0];
    return { topic, n: t.n, leader: lead ? lead[0] : '—', leaderN: lead ? lead[1] : 0 };
  }).sort((a, b) => b.n - a.n);

  const g2 = sov ? landGrabInsight({
    clientPct: sov.sovPct, openPct,
    availableClicks: sov.availableClicks,
    topRival: topRival ? { label: topRival.domain, pct: topRival.pct } : null,
    ctrLabel: sov.ctrSource,
  }) : null;
  const a3 = pf ? shadowCompetitorInsight({
    rival: pfRivalCov ? { brand: pfRivalCov.brand, count: pfRivalCov.count, pct: pfRivalCov.pct } : null,
    client: pfClientCov ? { count: pfClientCov.count, pct: pfClientCov.pct } : null,
    promptN: pf.promptN,
    updatedAt: d.aiDataDate ?? undefined,
  }) : null;
  const a4 = pf ? earnedFastPathInsight({
    citeTotal: pf.citeTotal || 0, citeOwned: pf.citeOwned || 0, citeOwnedShare: pf.citeOwnedShare || 0,
    earnedShare: pfEarned ? pfEarned.pct : 0,
    mentionHosts: pfMentionHosts, citeMentions: pf.citeMentions || 0,
    updatedAt: d.aiDataDate ?? undefined,
  }) : null;

  // ── pages (built conditionally; numbered after assembly) ───────────────────
  const pages: string[] = [];

  // 1 · Cover
  pages.push(`<div class="page cover">
    <div class="cbrand">ORBITIQ&nbsp;&nbsp;·&nbsp;&nbsp;GROWTH INTELLIGENCE</div>
    <div class="cmid">
      <div class="ck">SEARCH &amp; AI VISIBILITY ASSESSMENT</div>
      <div class="cname">${name}</div>
      <div class="csub">Where your customers are searching, what they're finding instead of you, and the fastest verified routes to change it — across Google and the AI answer engines.</div>
    </div>
    <div class="cfoot">
      <div class="cgrid">
        <div><div class="ckk">PROVIDED BY</div><div class="cvv" style="white-space:nowrap;">iQuanti &amp; McKinsey Partnership</div></div>
        <div><div class="ckk">PREPARED</div><div class="cvv" style="white-space:nowrap;">${esc(d.preparedDate)}</div></div>
        <div><div class="ckk">DATA AS OF</div><div class="cvv">${esc(d.scanDate ?? '—')}${d.aiDataDate ? ` · AI dataset ${esc(d.aiDataDate)}` : ''}</div></div>
        <div><div class="ckk">INTELLIGENCE LAYERS</div><div class="cvv">Demand &amp; rankings · Live answer-surface scans · AI visibility tracking</div></div>
      </div>
      <div class="cnote">Every figure in this report traces to a real scanned source row. Nothing is modeled or estimated unless explicitly labeled.</div>
    </div>
  </div>`);

  // 2 · Executive summary
  const execTiles: string[] = [];
  execTiles.push(tile('Page-1 capture', p1(m.captureRate * 100), `Of ${vol(m.totalMonthly)} monthly searches on your footprint, ${vol(m.page1Monthly)} land where you hold a page-1 position.`, 'accent'));
  if (sov) execTiles.push(tile('Unclaimed page-1 clicks', p0(openPct * 100), `Of ~${vol(sov.availableClicks)} modeled page-1 clicks/mo (${esc(sov.ctrSource)}), no tracked competitor captures them either.`, 'accent'));
  if (pf)  execTiles.push(tile('Owned citation share', (pf.citeTotal || 0) > 0 ? p1(pf.citeOwnedShare) : '—', (pf.citeTotal || 0) > 0 ? `${n0(pf.citeOwned)} of ${n0(pf.citeTotal)} sources cited by AI engines are yours${pf.citeCompetition ? ` — competitor-owned domains hold ${n0(pf.citeCompetition)}` : ''}.` : 'Citation landscape not yet loaded.', 'accent bad'));
  if (pf && pfRivalCov) execTiles.push(tile('Your real AI rival', esc(pfRivalCov.brand), `Appears in ${p0(pfRivalCov.pct)} of ${n0(pf.promptN)} tracked AI prompts vs your ${pfClientCov ? p0(pfClientCov.pct) : '0%'}.`));
  if (pf && pfBridgeSum > 0) execTiles.push(tile('The shortcut already exists', `${n0(pfBridgeSum)} <small>of ${n0(pf.citeMentions)}</small>`, `Brand mentions already sitting on ${pfBridge.map(h => h.hostname).join(', ')} — hosts AI engines already cite. Converting mentions to citations is outreach, not content.`));
  if (pf && pf.totalRuns > 0) execTiles.push(tile('Overall AI visibility', p1(pfVisPct), `Named in ${n0(pf.clientHits)} of ${n0(pf.totalRuns)} scanned AI answers across ${pf.engines.length} engines.`, pfVisPct < 5 ? 'bad' : ''));
  pages.push(pageWrap('01 · EXECUTIVE SUMMARY', 'EXECUTIVE SUMMARY', `
    <h1 class="pg">Where the demand is — and who's capturing it.</h1>
    <div class="lede">This assessment maps ${name}'s full search footprint across Google and the AI answer engines, from live scans of real queries, rankings and AI answers. The headline findings below each trace to a scanned source; the sections that follow show the work.</div>
    <div class="tiles c3">${execTiles.slice(0, 6).join('')}</div>
    ${insightHTML(g2, 'WHAT THIS MEANS')}
    ${!pf ? gapBlock('AI visibility data', 'Upload the AI visibility exports on the AI Answer Engines panel and regenerate this report to add the full AI answer-layer assessment.') : ''}`));

  // 3 · Governance
  pages.push(pageWrap('02 · GOVERNANCE &amp; INTELLIGENCE', 'HOW THIS WAS BUILT', `
    <h1 class="pg">Every number traces to a verified source.</h1>
    <div class="lede">This assessment is generated from live intelligence on your actual search footprint — not industry benchmarks, not estimates. The specific data partnerships and processing pipeline behind it are proprietary to the iQuanti &amp; McKinsey partnership. What we publish instead is the governance: how the numbers are sourced, what rules they obey, and why you can defend every one of them in a board meeting.</div>
    <table class="dt" style="margin-bottom:18px;">
      <tr><th style="width:1.7in;">Intelligence layer</th><th>What it tells us</th><th style="width:1.3in;">Data as of</th></tr>
      <tr><td><b>Demand &amp; rankings intelligence</b></td><td>Enterprise-grade search market data: real query volumes, your actual rankings, and the competitive gaps — the demand backbone of the assessment.</td><td class="n">${esc(d.scanDate ?? '—')}</td></tr>
      <tr><td><b>Live answer-surface scans</b></td><td>What actually appears on the results page today: page-1 results, AI Overviews, People-Also-Ask boxes, video shelves, local packs.</td><td class="n">${esc(d.scanDate ?? '—')}</td></tr>
      <tr><td><b>AI visibility tracking</b></td><td>How often AI answer engines (ChatGPT, Perplexity, Gemini, AI Overviews) mention and cite you across tracked buyer prompts — resolved down to every cited source URL.</td><td class="n">${esc(d.aiDataDate ?? 'not yet loaded')}</td></tr>
    </table>
    <div class="two">
      <div class="panelbox"><div class="figtitle">How the analysis is assembled</div>
        <p>Every keyword lives in one canonical pool with its real volume, rank and provenance, organized by searcher intent into a page-level architecture. Demand you already capture and demand you're missing are held to the same standard: real volumes, real positions, deduplicated so nothing is counted twice.</p></div>
      <div class="panelbox"><div class="figtitle">Rules this report will not break</div>
        <p><b>No modeled numbers as fact.</b> The only derived metric — Share of Voice — uses a named, industry-published click-through curve over your real volumes and positions, and is labeled as an estimate wherever it appears. <b>No hidden caps:</b> the full footprint is analyzed. Missing data reads as an honest gap, never a zero.</p></div>
    </div>`));

  // 4 · Demand & capture
  pages.push(pageWrap('03 · DEMAND VS. CAPTURE', 'PART I · THE MARKET', `
    <h1 class="pg">The size of the market — and your share of it.</h1>
    <div class="lede">Your footprint spans <b>${n0(d.poolCount)} tracked keywords</b> carrying <b>${vol(m.totalMonthly)} searches every month</b> (${vol(m.totalAnnual)}/yr). You hold a page-1 position on ${p1(m.captureRate * 100)} of that demand — the rest is being answered by someone else.</div>
    <div class="tiles c3" style="margin-bottom:18px;">
      ${tile('Monthly search demand', vol(m.totalMonthly), `${vol(m.totalAnnual)} searches per year across the scanned footprint.`)}
      ${tile('Demand you capture on page 1', vol(m.page1Monthly), `${p1(m.captureRate * 100)} of the footprint — searches where you hold a top-10 position.`)}
      ${tile('Demand beyond page 1', vol(offPage1Monthly), 'Searches happening every month where your best position is 11 or worse — or absent.', 'bad')}
    </div>
    <div class="figtitle">Captured vs. open demand</div>
    <div class="figsub">Monthly search volume · real query volumes and positions</div>
    ${barRow('Page-1 captured', m.totalMonthly > 0 ? (m.page1Monthly / m.totalMonthly) * 100 : 0, `${vol(m.page1Monthly)}/mo`, 'var(--blue)', '1.6in')}
    ${barRow('Beyond page 1', m.totalMonthly > 0 ? (offPage1Monthly / m.totalMonthly) * 100 : 0, `${vol(offPage1Monthly)}/mo`, 'var(--critical)', '1.6in')}
    <div class="src">Source: demand + ranking scans — per-keyword volumes and positions are real rows; page-1 = position ≤ 10.</div>
    <div class="callout"><div class="t">READ</div><p>Capture rate is the single most honest summary of a search program: it weighs every ranking by the real demand behind it. The pages that follow break the uncaptured share down — who holds it on Google, and who answers it inside AI engines.</p></div>`));

  // 5 · Share of Voice
  if (sov) {
    const rivalBars = rivals.slice(0, 3).map(r =>
      barRow(r.domain, sov.availableClicks > 0 ? (r.capturedClicks / sov.availableClicks) * 100 : 0, p0(r.pct * 100), 'var(--violet)', '1.6in', '.7in')).join('');
    pages.push(pageWrap('04 · SHARE OF VOICE', 'PART I · THE MARKET', `
      <h1 class="pg">${p0(openPct * 100)} of the clicks belong to no one yet.</h1>
      <div class="lede">Of the ~${vol(sov.availableClicks)} page-1 clicks available each month on your footprint, you capture an estimated ${p0(sov.sovPct * 100)}. Your tracked competitors barely capture more — <b>${p0(openPct * 100)} of the clicks are open</b>, held by aggregators, publishers and nobody in particular.</div>
      <div class="figtitle">Estimated page-1 click capture</div>
      <div class="figsub">Share of Voice — modeled from real volumes &amp; positions via ${esc(sov.ctrSource)} (the one labeled estimate in this report)</div>
      ${barRow('Open / unclaimed', openPct * 100, p0(openPct * 100), '#c9c8c1', '1.6in', '.7in')}
      ${barRow(sov.clientDisplay || name, sov.sovPct * 100, p0(sov.sovPct * 100), 'var(--blue)', '1.6in', '.7in')}
      ${rivalBars}
      <div class="src">Volumes and positions are real scanned rows; the click multiplier is the named published curve, labeled per Constitution I.5a.</div>
      ${insightHTML(g2, 'READ')}
      <div class="two" style="margin-top:14px;">
        <div class="panelbox"><div class="figtitle">Why "open" matters</div><p>When a rival owns the clicks, growth means displacing an entrenched incumbent — slow and expensive. When the clicks are open, growth means showing up with a competent page. The economics of those two situations are completely different.</p></div>
        <div class="panelbox"><div class="figtitle">The eviction zone</div><p>Positions 7–10 are rankings you hold today that one competitor push removes from page 1. The app's opportunity queue flags weakly-held keywords alongside every open gap — defend and advance from the same list.</p></div>
      </div>`));
  }

  // 6-10 · AI answer layer
  if (pf) {
    // 6 · market position
    const maxTop = Math.max(1, ...pf.overallTop.map(b => b.pct));
    const topBars = pf.overallTop.slice(0, 10).map(b =>
      barRow(b.brand, (b.pct / maxTop) * 100, `${p1(b.pct)} · ${n0(b.count)}`, '#c9c8c1', '1.6in')).join('');
    const clientBar = pf.totalRuns > 0 ? barRow(pf.client || name, (pfVisPct / maxTop) * 100, `${p1(pfVisPct)} · ${n0(pf.clientHits)}`, 'var(--blue)', '1.6in') : '';
    const sovRank = pf.sov.slice().sort((a, b) => b.count - a.count).findIndex(s => s.isClient) + 1;
    pages.push(pageWrap('05 · AI ANSWER ENGINES — MARKET POSITION', 'PART II · THE AI ANSWER LAYER', `
      <h1 class="pg">Who AI recommends when your customers ask.</h1>
      <div class="lede">We analyzed <b>${n0(pf.totalRuns)} real AI answers</b> — ${n0(pf.promptN)} buyer prompts across ${pf.engines.length} engines — and counted who gets named. ${name} appears in ${p1(pfVisPct)} of answers.</div>
      <div class="tiles c3" style="margin-bottom:16px;">
        ${tile('Overall AI visibility', p1(pfVisPct), `Named in ${n0(pf.clientHits)} of ${n0(pf.totalRuns)} scanned answers.`, pfVisPct < 5 ? 'bad' : '')}
        ${tile('Prompt coverage', pfClientCov ? `${p0(pfClientCov.pct)} <small>${n0(pfClientCov.count)} of ${n0(pf.promptN)}</small>` : '—', pfRivalCov ? `Prompts where you appear at least once — vs ${pfRivalCov.brand} ${n0(pfRivalCov.count)} (${p0(pfRivalCov.pct)}).` : 'Prompts where you appear at least once.', 'bad')}
        ${tile('Tracked-brand rank', sovRank > 0 ? `#${sovRank} <small>of ${pf.sov.length}</small>` : '—', 'Among the brands tracked for this project, by share of answers.')}
      </div>
      <div class="figtitle">Who AI engines actually name — share of all ${n0(pf.totalRuns)} answers</div>
      <div class="figsub">Every brand mentioned in scanned answers, ranked · ${name} highlighted</div>
      ${topBars}${clientBar}
      <div class="src">Source: AI visibility dataset${d.aiDataDate ? `, ${esc(d.aiDataDate)}` : ''} — brand counts are direct mention counts from real answers.</div>
      ${insightHTML(a3, 'READ')}`));

    // 7 · engine by engine
    const maxEng = Math.max(0.1, ...pf.engines.map(e => e.runs > 0 ? (e.hits / e.runs) * 100 : 0));
    const engBars = pf.engines.slice().sort((a, b) => (b.hits / Math.max(1, b.runs)) - (a.hits / Math.max(1, a.runs))).map(e => {
      const pct = e.runs > 0 ? (e.hits / e.runs) * 100 : 0;
      return barRow(e.platform, (pct / maxEng) * 100, `${p1(pct)} · ${n0(e.hits)}`, 'var(--blue)', '1.5in', '.85in');
    }).join('');
    const maxMen = Math.max(1, ...(pf.citeMentionByPlatform || []).map(x => x.count));
    const menBars = (pf.citeMentionByPlatform || []).slice().sort((a, b) => b.count - a.count).map(x =>
      barRow(x.platform, (x.count / maxMen) * 100, n0(x.count), 'var(--aqua)', '1.5in', '.55in')).join('');
    const mixRows = (pf.engineSourceMix || []).slice().sort((a, b) => (b.earned / Math.max(1, b.total)) - (a.earned / Math.max(1, a.total))).map(e => {
      const t = Math.max(1, e.total);
      const w = (x: number) => ((x / t) * 100).toFixed(1);
      return `<div class="barrow" style="grid-template-columns:1.5in 1fr 1.15in;">
        <span class="lab">${esc(e.platform)}</span>
        <div class="track" style="display:flex; gap:1px; background:transparent;">
          <div style="width:${w(e.earned)}%; background:var(--blue); border-radius:3px 0 0 3px;"></div>
          <div style="width:${w(e.competition)}%; background:var(--violet);"></div>
          <div style="width:${w(e.owned)}%; background:var(--good);"></div>
          <div style="width:${w(e.other)}%; background:#e3e2dc; border-radius:0 3px 3px 0;"></div>
        </div>
        <span class="val">${p0((e.earned / t) * 100)} earned · ${n0(e.total)}</span></div>`;
    }).join('');
    pages.push(pageWrap('06 · ENGINE-BY-ENGINE', 'PART II · THE AI ANSWER LAYER', `
      <h1 class="pg">Each engine behaves differently. So should the plan.</h1>
      <div class="lede">Engines differ in two ways that matter: <b>how often they name you</b>, and <b>where they source their answers</b>. Engines leaning on earned media respond to PR; engines leaning on broad authority respond to content depth.</div>
      <div class="two" style="margin-bottom:14px;">
        <div class="panelbox"><div class="figtitle">Your visibility per engine</div><div class="figsub">Answers naming you, per engine scanned</div>${engBars}</div>
        <div class="panelbox"><div class="figtitle">Where you're already known</div><div class="figsub">Third-party cited pages naming you, by engine (${n0(pf.citeMentions)} mentions total)</div>${menBars || '<p class="figsub">No mention-surface data in this dataset.</p>'}</div>
      </div>
      ${mixRows ? `<div class="figtitle">How each engine sources its answers</div>
      <div class="figsub">Citation mix per engine — earned media · competitor-owned · client-owned · other</div>${mixRows}
      <div class="legend"><span><span class="sw" style="background:var(--blue)"></span>Earned media</span><span><span class="sw" style="background:var(--violet)"></span>Competitor-owned</span><span><span class="sw" style="background:var(--good)"></span>Client-owned</span><span><span class="sw" style="background:#e3e2dc"></span>Other</span></div>` : ''}
      <div class="src">Source: AI visibility dataset${d.aiDataDate ? `, ${esc(d.aiDataDate)}` : ''} — per-engine counts are direct tallies.</div>`));

    // 8 · prompt demand & winnable set
    const maxDem = Math.max(0.1, ...pf.demandTopics.map(t => t.share));
    const demBars = pf.demandTopics.slice().sort((a, b) => b.share - a.share).map(t =>
      barRow(t.topic, (t.share / maxDem) * 100, `${p1(t.share)} · ${n0(t.prompts)} pr`, 'var(--blue)', '1.3in', '.95in')).join('');
    const topicVis = pf.topics.slice().sort((a, b) => (b.hits / Math.max(1, b.runs)) - (a.hits / Math.max(1, a.runs)));
    const maxVis = Math.max(0.1, ...topicVis.map(t => t.runs > 0 ? (t.hits / t.runs) * 100 : 0));
    const visBars = topicVis.map(t => {
      const pct = t.runs > 0 ? (t.hits / t.runs) * 100 : 0;
      return barRow(t.topic, (pct / maxVis) * 100, `${p1(pct)} · ${n0(t.hits)}`, pct < 1 ? 'var(--critical)' : 'var(--blue)', '1.3in', '.85in');
    }).join('');
    const battleRows = topicRows.slice(0, 6).map(r =>
      `<tr><td><b>${esc(r.topic)}</b></td><td class="n">${n0(r.n)}</td><td>${esc(r.leader)} leads ${n0(r.leaderN)}</td></tr>`).join('');
    const leaderTiles = leaderRows.slice(0, 3).map(([leader, n]) =>
      tile(`Led by ${leader}`, n0(n), 'Winnable prompts where this rival is the current incumbent.')).join('');
    pages.push(pageWrap('07 · PROMPT DEMAND &amp; THE WINNABLE SET', 'PART II · THE AI ANSWER LAYER', `
      <h1 class="pg">What buyers ask — and the ${n0((pf.gaps || []).length)} prompts you can take.</h1>
      <div class="lede">${n0(pf.demandPromptTotal)} tracked buyer questions carry measured demand, split across ${n0(pf.demandTopics.length)} product topics. Laying demand against your visibility exposes where the biggest questions meet the thinnest presence.</div>
      <div class="two" style="margin-bottom:14px;">
        <div class="panelbox"><div class="figtitle">Demand — share of tracked question volume</div><div class="figsub">By product topic · prompts tracked per topic</div>${demBars}</div>
        <div class="panelbox" style="border-top:3px solid var(--critical);"><div class="figtitle">Visibility — how often AI answers name you</div><div class="figsub">Per scanned topic</div>${visBars}</div>
      </div>
      ${(pf.gaps || []).length > 0 ? `<div class="figtitle">The winnable set — ${n0(pf.gaps.length)} prompts where rivals appear and you do not</div>
      <div class="figsub">Every prompt is itemized in the app with its leading rival · the battle map:</div>
      <table class="dt" style="margin-bottom:12px;"><tr><th>Topic</th><th style="width:1in;">Winnable</th><th>Who leads them</th></tr>${battleRows}</table>
      <div class="tiles c3">${leaderTiles}</div>` : ''}
      <div class="src">Source: AI visibility dataset${d.aiDataDate ? `, ${esc(d.aiDataDate)}` : ''} — winnable counts and leaders are direct tallies of per-prompt mention rows.</div>`));

    // 9 · citation supply chain
    const maxCat = Math.max(1, ...(pf.citeCatMix || []).map(c => c.pct));
    const catBars = (pf.citeCatMix || []).slice().sort((a, b) => b.count - a.count).map(c => {
      const isOwned = c.category.toLowerCase().includes('owned');
      const isComp  = c.category.toLowerCase().includes('compet');
      return barRow(c.category, (c.pct / maxCat) * 100, `${p1(c.pct)} · ${n0(c.count)}`,
        isOwned ? 'var(--critical)' : isComp ? 'var(--violet)' : c.category.toLowerCase().includes('earned') ? 'var(--blue)' : '#c9c8c1', '1.5in', '1in');
    }).join('');
    const domHalf = Math.ceil(Math.min(10, pf.domains.length) / 2);
    const domRows = Array.from({ length: domHalf }, (_, i) => {
      const a = pf.domains[i], b = pf.domains[i + domHalf];
      return `<tr><td${a?.isClient ? ' style="font-weight:700;"' : ''}>${esc(a?.domain ?? '')}</td><td class="n">${a ? n0(a.count) : ''}</td><td${b?.isClient ? ' style="font-weight:700;"' : ''}>${b ? esc(b.domain) : ''}</td><td class="n">${b ? n0(b.count) : ''}</td></tr>`;
    }).join('');
    const mentionByHost = new Map(pfMentionHosts.map(h => [h.hostname, h.count]));
    const bridgeRows = (pf.earnedTargets || []).slice(0, 6).map(t =>
      `<tr><td><b>${esc(t.hostname)}</b></td><td class="n">${n0(t.count)}</td><td class="n">${mentionByHost.has(t.hostname) ? n0(mentionByHost.get(t.hostname)!) : '—'}</td></tr>`).join('');
    pages.push(pageWrap('08 · THE CITATION SUPPLY CHAIN', 'PART II · THE AI ANSWER LAYER', `
      <h1 class="pg">Who feeds the answers.</h1>
      <div class="lede">Every AI answer is assembled from cited sources — <b>${n0(pf.citeTotal)}</b> of them across your tracked prompts, each classified by ownership. Your domain supplies <b>${p1(pf.citeOwnedShare)}</b> of the raw material${pf.citeCompetition ? `; competitor-owned domains supply ${n0(pf.citeCompetition)}` : ''}.</div>
      <div class="figtitle">Ownership of all ${n0(pf.citeTotal)} cited sources</div>
      <div class="figsub">Who owns the pages AI engines build answers from</div>
      ${catBars}
      <div class="two" style="margin-top:14px; margin-bottom:12px;">
        <div class="panelbox"><div class="figtitle">The domains engines cite most</div><div class="figsub">Top of ${n0(pf.domainTotalDistinct ?? pf.domains.length)} cited domains · your domain in bold</div>
          <table class="dt">${domRows}</table></div>
        <div class="panelbox" style="border-top:3px solid var(--blue);"><div class="figtitle">The earned-media bridge</div><div class="figsub">Hosts AI trusts most · pages already naming you</div>
          <table class="dt"><tr><th>Host</th><th style="width:.9in;">Cited (earned)</th><th style="width:.9in;">Your mentions</th></tr>${bridgeRows}</table></div>
      </div>
      ${insightHTML(a4, 'WHY THIS IS THE CHEAPEST WIN IN THE REPORT')}
      <div class="src">Source: citation-level AI dataset${d.aiDataDate ? `, ${esc(d.aiDataDate)}` : ''} — ownership classes, domain counts and mention surface are direct counts.</div>`));

    // 10 · sentiment
    const netPct = (pos: number, neg: number) => { const t = pos + neg; return t > 0 ? Math.round(((pos - neg) / t) * 100) : 0; };
    const sentSorted = (pf.sentBrands || []).slice().sort((a, b) => netPct(b.pos, b.neg) - netPct(a.pos, a.neg));
    const maxNet = Math.max(1, ...sentSorted.map(s => Math.abs(netPct(s.pos, s.neg))));
    const sentBars = sentSorted.map(s => {
      const net = netPct(s.pos, s.neg);
      return barRow(s.brand, (Math.abs(net) / maxNet) * 100, `${net >= 0 ? '+' : ''}${net} · +${n0(s.pos)}/−${n0(s.neg)}`, s.isClient ? 'var(--blue)' : '#c9c8c1', '1.5in', '1.1in');
    }).join('');
    const cms = (pf.mentionSent || []).find(x => x.isClient) ?? null;
    const toneTiles = cms && cms.total > 0 ? [
      tile('Positive', `${p0((cms.pos / cms.total) * 100)} <small>${n0(cms.pos)}</small>`, 'Recommended or praised in the answer.'),
      tile('Neutral', `${p0((cms.neutral / cms.total) * 100)} <small>${n0(cms.neutral)}</small>`, 'Listed factually among options, no judgment attached.'),
      tile('Negative', `${p0((cms.neg / cms.total) * 100)} <small>${n0(cms.neg)}</small>`, `${n0(cms.neg)} negative mention${cms.neg === 1 ? '' : 's'} across all scanned answers.`),
    ].join('') : '';
    pages.push(pageWrap('09 · SENTIMENT', 'PART II · THE AI ANSWER LAYER', `
      <h1 class="pg">Is the problem tone — or frequency?</h1>
      <div class="lede">Two independent reads of tone: the claims AI engines make about each brand, and the tone of each actual mention. Together they answer whether this is a visibility build or a reputation repair.</div>
      <div class="figtitle">Net sentiment by brand — claims made inside AI answers</div>
      <div class="figsub">Positive minus negative share of sentiment claims per brand · you highlighted</div>
      ${sentBars || '<p class="figsub">No sentiment claims in this dataset.</p>'}
      ${toneTiles ? `<div class="figtitle" style="margin-top:16px;">Tone of your actual mentions in answers</div>
      <div class="figsub">All ${n0(cms!.total)} assessed mentions across the engines</div>
      <div class="tiles c3">${toneTiles}</div>` : ''}
      <div class="callout"><div class="t">THE STANDING GUARD</div><p>Sentiment is re-scored on every dataset refresh. If net sentiment turns while visibility grows, the program flags it at the source level — AI answers repeat what the cited source pool says, so a souring theme is caught before it compounds into brand tracking.</p></div>
      <div class="src">Source: AI visibility dataset${d.aiDataDate ? `, ${esc(d.aiDataDate)}` : ''} — sentiment claims and per-mention tone are classified in the dataset; counts are direct.</div>`));
  } else {
    pages.push(pageWrap('05 · THE AI ANSWER LAYER', 'PART II · THE AI ANSWER LAYER', `
      <h1 class="pg">The AI answer layer — not yet measured.</h1>
      <div class="lede">AI answer engines (ChatGPT, Perplexity, Gemini, Google's AI results) now answer a large share of buyer questions before any website is visited. This project does not yet have AI visibility data loaded, so this report makes no claims about it — per the governance rules, a gap is shown honestly rather than estimated.</div>
      ${gapBlock('AI visibility tracking', 'Load the AI visibility exports on the AI Answer Engines panel, then regenerate this report — the assessment expands with five sections: market position, engine-by-engine behavior, prompt demand and the winnable set, the citation supply chain, and sentiment.')}`));
  }

  // Program
  const steps: string[] = [];
  if (pf && pfBridgeSum > 0) steps.push(`<div class="panelbox" style="border-top:4px solid var(--good);"><div class="stepk" style="color:var(--good);">STEP 1</div><div class="figtitle">Convert mentions → citations</div><p>Outreach to the ${n0(pfBridgeSum)} existing brand mentions on ${pfBridge.map(h => esc(h.hostname)).join(', ')} — hosts the engines already cite at scale. No new content required.</p></div>`);
  if (pf && (pf.gaps || []).length > 0) steps.push(`<div class="panelbox" style="border-top:4px solid var(--blue);"><div class="stepk" style="color:var(--blue-550);">STEP 2</div><div class="figtitle">Win the winnable prompts</div><p>The ${n0(pf.gaps.length)} tracked prompts where rivals appear and you do not${leaderRows.length > 0 ? ` — ${leaderRows.slice(0, 2).map(([l, n]) => `${n0(n)} led by ${esc(l)}`).join(', ')}` : ''}. Each is itemized in the app with its incumbent.</p></div>`);
  const worstTopics = pf ? pf.topics.filter(t => t.runs >= 6 && t.hits / t.runs <= 0.02).sort((a, b) => b.runs - a.runs).slice(0, 3) : [];
  if (worstTopics.length > 0) steps.push(`<div class="panelbox" style="border-top:4px solid var(--yellow);"><div class="stepk" style="color:#8a5a00;">STEP 3</div><div class="figtitle">Build into verified whitespace</div><p>Net-new answer-ready content aimed at the proven vacuums: ${worstTopics.map(t => `${esc(t.topic)} (${p1((t.hits / Math.max(1, t.runs)) * 100)})`).join(' · ')}.</p></div>`);
  if (steps.length === 0 && sov) steps.push(`<div class="panelbox" style="border-top:4px solid var(--blue);"><div class="stepk" style="color:var(--blue-550);">STEP 1</div><div class="figtitle">Claim the open clicks</div><p>${p0(openPct * 100)} of modeled page-1 clicks on this footprint are unclaimed by any tracked competitor — the opportunity queue in the app itemizes them by demand.</p></div>`);
  if (steps.length > 0) {
    pages.push(pageWrap(`${pf ? '10' : '06'} · THE RECOMMENDED PROGRAM`, 'PART III · THE OPPORTUNITY', `
      <h1 class="pg">Sequenced by cost of entry, not by habit.</h1>
      <div class="lede">The work is ordered by what each win costs: conversions of existing assets come before optimization, and optimization comes before net-new builds. Every step below is backed by the counts on the preceding pages.</div>
      <div style="display:grid; grid-template-columns:repeat(${Math.min(3, steps.length)},1fr); gap:14px; margin-bottom:16px;">${steps.join('')}</div>
      <div class="callout"><div class="t">WHY THIS ORDER</div><p>Step 1 costs outreach and zero content. Later steps build on the citation trust the earlier ones create, so new content enters AI answers faster. Reversing the order means publishing into a surface that doesn't yet cite you.</p></div>`));
  }

  // Scorecard
  const scoreRows: string[] = [];
  scoreRows.push(`<tr><td><b>Page-1 capture</b> (volume-weighted)</td><td class="n">${p1(m.captureRate * 100)}</td><td>Share of real monthly demand where you hold a top-10 position</td></tr>`);
  if (sov) scoreRows.push(`<tr><td><b>Share of Voice</b> (page-1 click capture, est.)</td><td class="n">${p0(sov.sovPct * 100)}</td><td>Modeled via ${esc(sov.ctrSource)} — the one labeled estimate</td></tr>`);
  if (pf && pf.totalRuns > 0) scoreRows.push(`<tr><td><b>Overall AI visibility</b></td><td class="n">${p1(pfVisPct)} (${n0(pf.clientHits)} of ${n0(pf.totalRuns)})</td><td>Answers naming you, across all engines</td></tr>`);
  if (pf && pfClientCov) scoreRows.push(`<tr><td><b>AI prompt coverage</b></td><td class="n">${p0(pfClientCov.pct)}${pfRivalCov ? ` (vs ${esc(pfRivalCov.brand)} ${p0(pfRivalCov.pct)})` : ''}</td><td>Distinct prompts where you appear at least once</td></tr>`);
  if (pf && (pf.citeTotal || 0) > 0) scoreRows.push(`<tr><td><b>Owned citation share</b></td><td class="n">${p1(pf.citeOwnedShare)} (${n0(pf.citeOwned)} of ${n0(pf.citeTotal)})</td><td>Cited sources on your own domain</td></tr>`);
  if (pf && pfBridgeSum > 0) scoreRows.push(`<tr><td><b>Brand mentions → citations</b></td><td class="n">${n0(pfBridgeSum)} unconverted</td><td>Mentions on top citable hosts, tracked per host</td></tr>`);
  const cms2 = pf ? (pf.mentionSent || []).find(x => x.isClient) : null;
  if (cms2 && cms2.total > 0) scoreRows.push(`<tr><td><b>Mention tone</b></td><td class="n">${n0(cms2.pos)} pos · ${n0(cms2.neutral)} neu · ${n0(cms2.neg)} neg</td><td>Held healthy while visibility scales — the guard metric</td></tr>`);
  pages.push(pageWrap(`${pf ? '11' : '07'} · THE BASELINE SCORECARD`, 'PART III · THE OPPORTUNITY', `
    <h1 class="pg">Today's numbers, on the record.</h1>
    <div class="lede">Every metric below is re-computed on the same methodology at each refresh, so progress is measured against this baseline — not a moving target. This is the page you hold us to.</div>
    <table class="dt"><tr><th>Metric</th><th style="width:1.7in;">Baseline</th><th>What it measures</th></tr>${scoreRows.join('')}</table>
    <div class="two" style="margin-top:16px;">
      <div class="panelbox"><div class="figtitle">Cadence</div><p>Full re-scan on the same intelligence layers at a fixed cadence; every refresh regenerates this scorecard against baseline. No metric definitions change mid-program.</p></div>
      <div class="panelbox"><div class="figtitle">Honesty clause</div><p>If a data source is unavailable at re-scan, the metric shows as a gap — it is never estimated to preserve a trend line. The one modeled figure (Share of Voice) keeps its published-curve citation on every appearance.</p></div>
    </div>`));

  // Appendix
  pages.push(pageWrap(`${pf ? '12' : '08'} · APPENDIX &amp; DEFINITIONS`, 'APPENDIX', `
    <h1 class="pg">The receipts.</h1>
    <div class="lede">Definitions for every metric in this report. The full underlying data — every keyword, prompt, citation and mention — is live in the OrbitIQ workspace this report was generated from.</div>
    <table class="dt" style="margin-bottom:16px;">
      <tr><th style="width:1.8in;">Term</th><th>Definition as used in this report</th></tr>
      <tr><td><b>Page-1 capture</b></td><td>Volume-weighted share of tracked keywords where the client holds a position 1–10 ranking. Direct from scan rows.</td></tr>
      <tr><td><b>Share of Voice (SoV)</b></td><td>Estimated share of available page-1 clicks, computed from real volumes and positions via a named, published click-through curve. The only modeled figure in the report; labeled at every appearance.</td></tr>
      <tr><td><b>AI visibility</b></td><td>Share of scanned AI answers naming the brand. Direct count from the AI visibility dataset.</td></tr>
      <tr><td><b>Prompt coverage</b></td><td>Share of tracked buyer prompts where the brand appears in at least one engine's answer. Direct count.</td></tr>
      <tr><td><b>Owned citation</b></td><td>A cited source URL classified as client-owned in the citation landscape. Direct count from the citation-level dataset.</td></tr>
      <tr><td><b>Winnable prompt</b></td><td>A tracked prompt where at least one rival appears in the answer and the client does not. Direct tally of per-prompt mention rows.</td></tr>
      <tr><td><b>Earned share (per engine)</b></td><td>Share of an engine's citations classified as earned media — the measure of how much PR moves that engine.</td></tr>
    </table>
    <div class="endbrand">
      <div><div style="font-size:12px; font-weight:800;">OrbitIQ</div>
        <div style="font-size:9px; color:var(--muted); margin-top:2px;">An iQuanti &amp; McKinsey Partnership product · every number traces to a scanned source</div></div>
      <div style="font-size:9px; color:var(--muted); text-align:right;">Generated ${esc(d.preparedDate)}${d.scanDate ? `<br>from data as of ${esc(d.scanDate)}` : ''}</div>
    </div>`));

  // ── assemble with page numbers ──────────────────────────────────────────────
  const total = pages.length;
  const numbered = pages.map((p, i) =>
    p.replace('__FOOT__', `<div class="foot"><span>${footLeft}</span><span>Page ${i + 1} of ${total}</span></div>`)
     .replace('__EBL__', `${name.toUpperCase()} — SEARCH &amp; AI VISIBILITY ASSESSMENT`));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${name} — Search &amp; AI Visibility Assessment</title>
<style>
  :root{--ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --baseline:#c3c2b7; --surface:#fcfcfb;
    --blue:#2a78d6; --blue-550:#1c5cab; --green:#008300; --yellow:#eda100; --aqua:#1baf7a; --orange:#eb6834; --violet:#4a3aa7;
    --good:#0ca30c; --critical:#d03b3b;}
  *{box-sizing:border-box; margin:0; padding:0;}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); -webkit-print-color-adjust:exact; print-color-adjust:exact;}
  .page{width:8.5in; height:11in; background:#fff; position:relative; padding:.68in .72in .78in .72in; overflow:hidden; page-break-after:always;}
  @page{size:letter; margin:0;}
  .eyebrow{display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid var(--ink); padding-bottom:8px; margin-bottom:24px;}
  .eyebrow .l{font-size:9.5px; letter-spacing:.14em; font-weight:700;}
  .eyebrow .r{font-size:9.5px; letter-spacing:.10em; color:var(--muted); font-weight:600;}
  .foot{position:absolute; left:.72in; right:.72in; bottom:.42in; display:flex; justify-content:space-between; font-size:8.5px; color:var(--muted); border-top:1px solid var(--grid); padding-top:8px;}
  .secnum{font-size:11px; font-weight:800; color:var(--blue); letter-spacing:.08em; margin-bottom:6px;}
  h1.pg{font-size:26px; line-height:1.12; font-weight:800; letter-spacing:-.01em; margin-bottom:10px;}
  .lede{font-size:12px; line-height:1.55; color:var(--ink2); max-width:6.4in; margin-bottom:20px;}
  .lede b{color:var(--ink);}
  p{font-size:10.5px; line-height:1.55; color:var(--ink2);}
  .src{font-size:8.5px; color:var(--muted); margin-top:8px;}
  .callout{border-left:3px solid var(--blue); background:#f5f8fd; padding:12px 16px; border-radius:0 6px 6px 0; margin-top:14px;}
  .callout .t{font-size:9px; font-weight:800; letter-spacing:.1em; color:var(--blue-550); margin-bottom:4px;}
  .gapblock{border:1.5px dashed #ecd39a; background:#fdf8ec; padding:14px 16px; border-radius:8px; margin-top:14px;}
  .gapblock .t{font-size:9px; font-weight:800; letter-spacing:.1em; color:#8a5a00; margin-bottom:4px;}
  .tiles{display:grid; gap:12px;} .tiles.c3{grid-template-columns:repeat(3,1fr);}
  .tile{border:1px solid var(--grid); border-radius:8px; padding:13px 14px; background:var(--surface);}
  .tile .k{font-size:9px; font-weight:700; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; margin-bottom:7px;}
  .tile .v{font-size:24px; font-weight:800; letter-spacing:-.02em; line-height:1;}
  .tile .v small{font-size:12px; font-weight:700; color:var(--ink2);}
  .tile .d{font-size:9.5px; color:var(--ink2); margin-top:7px; line-height:1.45;}
  .tile.accent{border-top:3px solid var(--blue);} .tile.bad .v{color:var(--critical);}
  .barrow{display:grid; align-items:center; gap:10px; margin-bottom:7px;}
  .barrow .lab{font-size:10px; font-weight:600; text-align:right;}
  .barrow .val{font-size:10px; font-weight:700; font-variant-numeric:tabular-nums;}
  .track{height:12px; background:#f1f0ec; border-radius:4px; position:relative;}
  .fill{height:100%; border-radius:4px; min-width:2px;}
  .figtitle{font-size:11px; font-weight:800; margin-bottom:3px;} .figsub{font-size:9.5px; color:var(--muted); margin-bottom:11px;}
  table.dt{width:100%; border-collapse:collapse; font-size:10px;}
  table.dt th{font-size:8.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); font-weight:700; text-align:left; border-bottom:1.5px solid var(--baseline); padding:6px 8px;}
  table.dt td{padding:6px 8px; border-bottom:1px solid var(--grid); color:var(--ink2); vertical-align:top;}
  table.dt td.n{font-variant-numeric:tabular-nums; text-align:right; color:var(--ink); font-weight:600;}
  table.dt td b{color:var(--ink);}
  .legend{display:flex; gap:16px; font-size:9px; color:var(--ink2); margin-top:10px;}
  .legend .sw{display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:-1px;}
  .two{display:grid; grid-template-columns:1fr 1fr; gap:18px;}
  .panelbox{border:1px solid var(--grid); border-radius:8px; padding:14px 16px; background:var(--surface);}
  .stepk{font-size:9px; font-weight:800; letter-spacing:.1em; margin-bottom:6px;}
  .endbrand{display:flex; justify-content:space-between; align-items:flex-end; border-top:2px solid var(--ink); padding-top:14px;}
  .cover{background:#0e1a2b; color:#fff; display:flex; flex-direction:column;}
  .cbrand{font-size:11px; letter-spacing:.22em; font-weight:700; color:#7fa8dc;}
  .cmid{margin-top:2.1in;}
  .ck{font-size:13px; letter-spacing:.14em; color:#9fb3cc; font-weight:600; margin-bottom:14px;}
  .cname{font-size:44px; font-weight:800; letter-spacing:-.015em; line-height:1.05;}
  .csub{font-size:14px; color:#c4d2e4; margin-top:14px; line-height:1.5; max-width:5.6in;}
  .cfoot{margin-top:auto;}
  .cgrid{display:flex; gap:26px; border-top:1px solid rgba(255,255,255,.18); padding-top:16px;}
  .ckk{font-size:8.5px; letter-spacing:.1em; color:#8296ad; font-weight:700;}
  .cvv{font-size:10.5px; margin-top:3px;}
  .cnote{font-size:8.5px; color:#68809c; margin-top:14px;}
</style></head><body>${numbered.join('\n')}</body></html>`;
}

// content pages share this wrapper; cover manages its own chrome
function pageWrap(secnum: string, right: string, inner: string): string {
  return `<div class="page">
    <div class="eyebrow"><span class="l">__EBL__</span><span class="r">${right}</span></div>
    <div class="secnum">${secnum}</div>
    ${inner}
    __FOOT__
  </div>`;
}
