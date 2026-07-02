/**
 * OrbitIQ PDF Brief Template
 *
 * Generates a self-contained HTML document from analysis data.
 * Designed to be rendered by Puppeteer with full CSS styling.
 * The dark OrbitIQ brand is preserved in print via CSS variables.
 *
 * v7.335 (QC audit B2, Const I.5a/II.7): the hero capture % and the Share of
 * Voice section now render the CURRENT models — page-1 capture from the live
 * canonical pool (buildKwPool + computeVolumeMetrics, same math as the Exec
 * hero) and the shared page-1 click-capture SoV (lib/sov/model.ts, same math as
 * SovPanel) — computed by the route and passed in as `computed`. The stored
 * analysis fields (marketCaptureRate / totalCategoryVolume / clientOwnedVolume,
 * the pre-v7.245 model) remain ONLY as an honest, explicitly-labeled fallback
 * when the snapshot cannot build a pool (Const I.5). The old competitor
 * organicTraffic "Share of Voice" bars are gone — they showed a structurally
 * different (competitor-relative) model than the app.
 */

import type { SovComputed } from '@/lib/sov/model';

export interface PdfComputed {
  /** Live canonical-pool capture metrics (computeVolumeMetrics on buildKwPool). */
  metrics?: { totalMonthly: number; page1Monthly: number; captureRate: number } | null;
  /** Shared page-1 click-capture SoV (lib/sov/model.ts computeSov). */
  sov?: SovComputed | null;
}

export function buildBriefHTML(analysis: any, computed?: PdfComputed): string {
  const project     = analysis.project ?? {};
  const opps        = (analysis.opportunities ?? []).sort((a: any, b: any) => a.rank - b.rank);
  const personas    = analysis.personas ?? [];
  const semrush     = analysis.semrushSnapshot ?? {};
  const profound    = analysis.profoundSnapshot ?? {};
  const serp        = analysis.serpApiSnapshot ?? {};
  const narrative   = semrush._narrative ?? {};

  // v7.335 (QC audit B2): prefer LIVE canonical-pool metrics; stored fields are the
  // labeled fallback for snapshots that can't build a pool (honest fallback, I.5).
  const liveMetrics = computed?.metrics && computed.metrics.totalMonthly > 0 ? computed.metrics : null;
  const captureRate   = liveMetrics ? liveMetrics.captureRate  : (analysis.marketCaptureRate ?? 0);
  const totalVol      = liveMetrics ? liveMetrics.totalMonthly : (analysis.totalCategoryVolume ?? 0);
  const clientVol     = liveMetrics ? liveMetrics.page1Monthly : (analysis.clientOwnedVolume ?? 0);
  const captureLabel  = liveMetrics ? 'page-1 capture rate' : 'market capture rate (stored at analysis time)';
  const captureSource = liveMetrics
    ? 'Semrush keyword footprint · page-1 volume ÷ total volume'
    : 'Source: stored analysis (legacy pre-v7.245 model)';
  const clientVolLabel  = liveMetrics ? 'Page-1 keyword volume/mo' : 'Client organic visits/mo';
  const clientVolSource = liveMetrics ? 'Source: Semrush keyword footprint (canonical pool)' : 'Source: Semrush Domain Overview';
  const totalVolLabel   = liveMetrics ? 'Total footprint volume/mo' : 'Total category traffic/mo';
  const totalVolSource  = liveMetrics ? 'Source: Semrush keyword footprint (canonical pool)' : 'Source: Semrush Competitive Landscape';
  // v7.335 (QC audit B2, Const I.5a): shared page-1 click-capture SoV. Absent /
  // empty-basis SoV renders an honest empty state — NEVER the old competitor bars.
  const sov = computed?.sov && computed.sov.basis === 'capture' && computed.sov.availableClicks > 0 ? computed.sov : null;
  // Mirrors SovPanel/LegendRow: sub-1% shares show one decimal, not a misleading 0%.
  const pct = (p: number) => p > 0 && p < 0.01 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`;
  // Slice rows mirror the donut legend: uploaded competitors (cyan) + top SERP
  // rivals (amber, capped at 3 by the model), ranked by captured clicks. Open =
  // page-1 clicks nobody shown is winning — exact remainder, same denominator.
  const sovSlices = sov
    ? [
        ...sov.compEntries.map(c => ({ ...c, color: '#06B6D4' })),
        ...sov.serpEntries.map(c => ({ ...c, color: '#F59E0B' })),
      ].sort((a, b) => b.capturedClicks - a.capturedClicks)
    : [];
  const sovOpenPct = sov
    ? Math.max(0, (sov.availableClicks - sov.capturedClicks - sovSlices.reduce((t, c) => t + c.capturedClicks, 0)) / sov.availableClicks)
    : 0;
  const aioAvail      = analysis.aioAvailable ?? 0;
  const aioAcq        = analysis.aioAcquired ?? 0;
  const profoundScore = profound.overallScore ?? 0;

  const fmt = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);

  const date = analysis.completedAt
    ? new Date(analysis.completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>OrbitIQ Brief — ${project.clientName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0A0A0F;
    color: #F0F0FF;
    font-family: -apple-system, 'Inter', 'Segoe UI', sans-serif;
    font-size: 11px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 20px; }

  /* Header */
  .header {
    background: linear-gradient(135deg, #111118 0%, #16161F 100%);
    border: 1px solid #1E1E2E;
    border-radius: 12px;
    padding: 24px 28px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .brand { font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #8B85FF, #06B6D4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .client-name { font-size: 18px; font-weight: 700; color: #F0F0FF; margin-top: 4px; }
  .client-meta { font-size: 10px; color: #8888AA; margin-top: 2px; }
  .date-badge { font-size: 9px; color: #555570; text-align: right; }
  .capture-hero { font-size: 42px; font-weight: 900; color: #6C63FF; line-height: 1; }

  /* Section */
  .section {
    background: #16161F;
    border: 1px solid #1E1E2E;
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 12px;
  }
  .section-label { font-size: 8px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #8888AA; margin-bottom: 4px; }
  .section-title { font-size: 14px; font-weight: 700; color: #F0F0FF; margin-bottom: 12px; }

  /* Two-column layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

  /* Stat card */
  .stat-card { background: #111118; border: 1px solid #1E1E2E; border-radius: 8px; padding: 10px 12px; }
  .stat-value { font-size: 20px; font-weight: 800; color: #6C63FF; }
  .stat-label { font-size: 8px; color: #8888AA; margin-top: 2px; }
  .stat-source { font-size: 7px; color: #555570; margin-top: 3px; }

  /* Bar */
  .bar-track { height: 6px; background: #2A2A3D; border-radius: 3px; overflow: hidden; margin: 6px 0; }
  .bar-fill { height: 100%; background: #6C63FF; border-radius: 3px; }
  .bar-fill-cyan { background: #06B6D4; }
  .bar-fill-amber { background: #F59E0B; }
  .bar-fill-red { background: #EF4444; }

  /* Narrative */
  .narrative { background: #111118; border: 1px solid #1E1E2E; border-radius: 8px; padding: 12px 14px; }
  .narrative p { font-size: 10px; color: #8888AA; line-height: 1.7; }

  /* Opportunity card */
  .opp-card { background: #111118; border: 1px solid #1E1E2E; border-radius: 8px; padding: 12px; }
  .opp-category { display: inline-block; font-size: 8px; font-weight: 600; padding: 2px 8px; border-radius: 20px; border: 1px solid rgba(108,99,255,0.3); color: #6C63FF; background: rgba(108,99,255,0.1); margin-bottom: 6px; }
  .opp-title { font-size: 11px; font-weight: 700; color: #F0F0FF; margin-bottom: 5px; }
  .opp-summary { font-size: 9px; color: #8888AA; line-height: 1.6; margin-bottom: 8px; }
  .evidence-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .evidence-card { background: #16161F; border: 1px solid #1E1E2E; border-radius: 5px; padding: 5px 7px; }
  .evidence-metric { font-size: 12px; font-weight: 800; color: #F0F0FF; }
  .evidence-label { font-size: 7px; color: #8888AA; }
  .evidence-source { font-size: 6.5px; color: #555570; }

  /* LLM */
  .platform-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .platform-name { font-size: 9px; color: #8888AA; width: 70px; flex-shrink: 0; }
  .platform-track { flex: 1; height: 4px; background: #2A2A3D; border-radius: 2px; overflow: hidden; }
  .platform-fill { height: 100%; background: rgba(108,99,255,0.6); border-radius: 2px; }
  .platform-score { font-size: 9px; color: #6C63FF; font-weight: 600; width: 28px; text-align: right; }

  /* Brand context callout */
  .brand-context { background: rgba(108,99,255,0.06); border: 1px solid rgba(108,99,255,0.2); border-radius: 8px; padding: 10px 12px; }
  .brand-context p { font-size: 10px; color: #8888AA; font-style: italic; }

  /* Strategic call */
  .strategic { background: rgba(108,99,255,0.08); border: 1px solid rgba(108,99,255,0.25); border-radius: 10px; padding: 14px 16px; }
  .strategic-label { font-size: 8px; font-weight: 600; color: #6C63FF; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 5px; }
  .strategic-text { font-size: 11px; font-weight: 600; color: #F0F0FF; line-height: 1.6; }

  /* Footer */
  .footer { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; }
  .footer-brand { font-size: 9px; color: #555570; }
  .footer-disclaimer { font-size: 7.5px; color: #555570; text-align: right; max-width: 320px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">OrbitIQ</div>
      <div class="client-name">${escapeHtml(project.clientName ?? '')}</div>
      <div class="client-meta">${escapeHtml(project.websiteUrl ?? '')} · ${escapeHtml(project.industry ?? 'General')}</div>
      <div class="client-meta" style="margin-top:6px">Organic Growth Intelligence Brief</div>
    </div>
    <div style="text-align:right">
      <div class="capture-hero">${pct(captureRate)}</div>
      <div style="font-size:9px;color:#8888AA;margin-top:3px">${captureLabel}</div>
      <div style="font-size:7px;color:#555570;margin-top:2px">${escapeHtml(captureSource)}</div>
      <div class="date-badge" style="margin-top:12px">Generated ${date}</div>
    </div>
  </div>

  <!-- Market Gap + Competitor Gap -->
  <div class="two-col">

    <!-- Market Gap -->
    <div class="section">
      <div class="section-label">Market Gap</div>
      <div class="section-title">Category Capture Rate</div>
      <div class="two-col" style="margin-bottom:10px">
        <div class="stat-card">
          <div class="stat-value">${fmt(clientVol)}</div>
          <div class="stat-label">${clientVolLabel}</div>
          <div class="stat-source">${clientVolSource}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${fmt(totalVol)}</div>
          <div class="stat-label">${totalVolLabel}</div>
          <div class="stat-source">${totalVolSource}</div>
        </div>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.min(100, captureRate * 100)}%"></div>
      </div>
      ${narrative.marketPositionNarrative ? `<div class="narrative" style="margin-top:10px"><p>${escapeHtml(narrative.marketPositionNarrative)}</p></div>` : ''}
    </div>

    <!-- Competitor Gap -->
    <div class="section">
      <div class="section-label">Competitor Gap</div>
      <div class="section-title">Share of Voice &mdash; page-1 click capture</div>
      ${sov ? `
      <div style="font-size:8px;color:#8888AA;margin:-6px 0 8px">modeled clicks won &divide; all page-1 clicks available across the footprint</div>
      <div class="platform-row">
        <div class="platform-name" style="color:#F0F0FF;font-weight:600">${escapeHtml(sov.clientDisplay.replace(/^www\./, ''))}</div>
        <div class="platform-track"><div class="platform-fill" style="width:${Math.min(100, sov.sovPct * 100)}%;background:#6C63FF"></div></div>
        <div class="platform-score">${pct(sov.sovPct)}</div>
      </div>
      ${sovSlices.map(c => `<div class="platform-row">
        <div class="platform-name">${escapeHtml(c.domain.replace(/^www\./, ''))}</div>
        <div class="platform-track"><div class="platform-fill" style="width:${Math.min(100, c.pct * 100)}%;background:${c.color}"></div></div>
        <div class="platform-score" style="color:${c.color}">${pct(c.pct)}</div>
      </div>`).join('')}
      <div class="platform-row">
        <div class="platform-name" style="color:#555570">Open / uncaptured</div>
        <div class="platform-track"><div class="platform-fill" style="width:${Math.min(100, sovOpenPct * 100)}%;background:#2A2A3D"></div></div>
        <div class="platform-score" style="color:#8888AA">${pct(sovOpenPct)}</div>
      </div>
      <div style="font-size:8px;color:#8888AA;margin-top:6px">
        Client wins ~${Math.round(sov.capturedClicks).toLocaleString()} of ~${Math.round(sov.availableClicks).toLocaleString()} page-1 clicks/mo available across the footprint${sovSlices.length > 0 ? '; competitor slices are page-1 clicks they take on shared keywords.' : '.'}
      </div>
      <div style="margin-top:6px;font-size:7.5px">
        <span style="display:inline-block;padding:1px 7px;border-radius:20px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);color:#F59E0B">modeled estimate</span>
        <span style="color:#555570;margin-left:5px">CTR curve: ${escapeHtml(sov.ctrSource)}</span>
      </div>
      <div style="font-size:7px;color:#555570;margin-top:4px">
        data: ${sov.totalKwCount.toLocaleString()} footprint kws &middot; ${sov.page1KwCount.toLocaleString()} rank pg 1 &middot; volume &amp; position are measured Semrush rows; only the CTR multiplier is modeled.
      </div>` : `
      <div style="font-size:9px;color:#8888AA">No page-1 keyword data available to compute Share of Voice for this analysis. Re-run the analysis (or upload keyword rankings) to populate this section.</div>`}
      ${narrative.competitiveReality ? `<div class="narrative" style="margin-top:8px"><p>${escapeHtml(narrative.competitiveReality)}</p></div>` : ''}
    </div>
  </div>

  <!-- LLM Visibility -->
  <div class="section">
    <div class="section-label">GEO / LLM Gap</div>
    <div class="section-title">AI Search Visibility</div>
    <div class="two-col">
      <div>
        <div class="stat-card" style="display:inline-block;margin-bottom:10px">
          <div class="stat-value" style="color:${profoundScore >= 60 ? '#22C55E' : profoundScore >= 35 ? '#F59E0B' : '#EF4444'}">${profoundScore}<span style="font-size:14px;color:#8888AA">/100</span></div>
          <div class="stat-label">${profound.source === 'llm_probe_v2' ? 'Unbranded AI Visibility' : 'LLM Visibility Score'}</div>
          <div class="stat-source">Source: Live AI probe (Claude + ChatGPT)</div>
        </div>
        ${profound.source === 'llm_probe_v2' ? `
          <div class="platform-row">
            <div class="platform-name">Brand recognition</div>
            <div class="platform-track"><div class="platform-fill" style="width:${profound.branded?.score ?? 0}%"></div></div>
            <div class="platform-score">${profound.branded?.score ?? 0}</div>
          </div>
          <div style="font-size:8px;color:#8888AA;margin-top:6px">
            Sentiment of brand mentions: ${profound.sentiment?.positive ?? 0} positive ·
            ${profound.sentiment?.neutral ?? 0} neutral · ${profound.sentiment?.negative ?? 0} negative
          </div>
          ${(profound.categories ?? []).slice(0, 6).map((c: any) => `
            <div class="platform-row">
              <div class="platform-name">${escapeHtml(c.category)}</div>
              <div class="platform-track"><div class="platform-fill" style="width:${Math.round((c.mentionRate ?? 0) * 100)}%"></div></div>
              <div class="platform-score">${Math.round((c.mentionRate ?? 0) * 100)}%</div>
            </div>`).join('')}
        ` : (profound.platformScores ?? []).map((p: any) => {
          const label = { chatgpt: 'ChatGPT', perplexity: 'Perplexity', gemini: 'Gemini', claude: 'Claude', bing_copilot: 'Copilot' }[p.platform as string] ?? p.platform;
          return `<div class="platform-row">
            <div class="platform-name">${label}</div>
            <div class="platform-track"><div class="platform-fill" style="width:${p.score}%"></div></div>
            <div class="platform-score">${p.score}</div>
          </div>`;
        }).join('')}
      </div>
      <div>
        ${profound.brandContext?.summary ? `
          <div class="brand-context" style="margin-bottom:8px">
            <div style="font-size:8px;font-weight:600;color:#6C63FF;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">How AI Describes This Brand</div>
            <p>"${escapeHtml(profound.brandContext.summary)}"</p>
            <div style="font-size:7px;color:#555570;margin-top:4px">Source: Profound brand context analysis</div>
          </div>` : ''}
        <div style="font-size:8px;color:#8888AA;margin-bottom:5px;font-weight:600">AIO Coverage</div>
        <div class="two-col">
          <div class="stat-card">
            <div class="stat-value" style="font-size:16px">${aioAvail}</div>
            <div class="stat-label">Keywords trigger AI Overviews</div>
            <div class="stat-source">Source: SerpAPI live scan</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="font-size:16px;color:#22C55E">${aioAcq}</div>
            <div class="stat-label">AIOs cite this site</div>
            <div class="stat-source">Source: SerpAPI live scan</div>
          </div>
        </div>
        ${narrative.aiSearchMoment ? `<div class="narrative" style="margin-top:8px"><p>${escapeHtml(narrative.aiSearchMoment)}</p></div>` : ''}
      </div>
    </div>
  </div>

  <!-- Opportunities -->
  <div style="margin-bottom:12px">
    <div class="section-label" style="margin-bottom:6px">Opportunities</div>
    <div class="section-title">Top 3 Growth Opportunities</div>
    <div class="three-col">
      ${opps.slice(0, 3).map((opp: any) => `
        <div class="opp-card">
          <div class="opp-category">${escapeHtml(opp.category)}</div>
          <div class="opp-title">${escapeHtml(opp.title)}</div>
          <div class="opp-summary">${escapeHtml(opp.summary)}</div>
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <span style="font-size:9px;color:#22C55E">+${fmt(opp.estimatedVisits ?? 0)} visits/mo</span>
            <span style="font-size:9px;color:#6C63FF">+${fmt(opp.estimatedLeads ?? 0)} leads/mo</span>
          </div>
          <div class="evidence-grid">
            ${(opp.evidence ?? []).slice(0, 4).map((ev: any) => `
              <div class="evidence-card">
                <div class="evidence-metric">${escapeHtml(ev.metric)}</div>
                <div class="evidence-label">${escapeHtml(ev.label)}</div>
                <div class="evidence-source">Source: ${escapeHtml(ev.source)}</div>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- Strategic Call -->
  ${narrative.strategicCall ? `
  <div class="strategic" style="margin-bottom:12px">
    <div class="strategic-label">Strategic Call</div>
    <div class="strategic-text">${escapeHtml(narrative.strategicCall)}</div>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand">OrbitIQ · Organic Growth Intelligence · orbitiq.app</div>
    <div class="footer-disclaimer">All data sourced from Semrush API, SerpAPI, and Profound API at time of analysis. AI narrative generated by Anthropic Claude. This document is intended for strategic planning purposes.</div>
  </div>

</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
