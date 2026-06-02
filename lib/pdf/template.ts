/**
 * OrbitIQ PDF Brief Template
 *
 * Generates a self-contained HTML document from analysis data.
 * Designed to be rendered by Puppeteer with full CSS styling.
 * The dark OrbitIQ brand is preserved in print via CSS variables.
 */

export function buildBriefHTML(analysis: any): string {
  const project     = analysis.project ?? {};
  const opps        = (analysis.opportunities ?? []).sort((a: any, b: any) => a.rank - b.rank);
  const personas    = analysis.personas ?? [];
  const semrush     = analysis.semrushSnapshot ?? {};
  const profound    = analysis.profoundSnapshot ?? {};
  const serp        = analysis.serpApiSnapshot ?? {};
  const narrative   = semrush._narrative ?? {};

  const captureRate   = analysis.marketCaptureRate ?? 0;
  const totalVol      = analysis.totalCategoryVolume ?? 0;
  const clientVol     = analysis.clientOwnedVolume ?? 0;
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
      <div class="capture-hero">${Math.round(captureRate * 100)}%</div>
      <div style="font-size:9px;color:#8888AA;margin-top:3px">market capture rate</div>
      <div style="font-size:7px;color:#555570;margin-top:2px">Source: Semrush</div>
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
          <div class="stat-label">Client organic visits/mo</div>
          <div class="stat-source">Source: Semrush Domain Overview</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${fmt(totalVol)}</div>
          <div class="stat-label">Total category traffic/mo</div>
          <div class="stat-source">Source: Semrush Competitive Landscape</div>
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
      <div class="section-title">Share of Voice</div>
      ${(semrush.competitors ?? []).slice(0, 5).map((c: any) => {
        const maxT = Math.max(clientVol, ...(semrush.competitors ?? []).map((x: any) => x.organicTraffic ?? 0));
        const pct  = maxT > 0 ? (c.organicTraffic / maxT) * 100 : 0;
        return `<div class="platform-row">
          <div class="platform-name">${escapeHtml(c.domain)}</div>
          <div class="platform-track"><div class="platform-fill" style="width:${pct}%"></div></div>
          <div class="platform-score">${fmt(c.organicTraffic ?? 0)}</div>
        </div>`;
      }).join('')}
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
          <div class="stat-label">LLM Visibility Score</div>
          <div class="stat-source">Source: Profound API</div>
        </div>
        ${(profound.platformScores ?? []).map((p: any) => {
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
