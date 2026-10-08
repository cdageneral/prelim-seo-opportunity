"use strict";

// .runs/oiq442.D1SLEP/p.ts
function llmProbeContext(profound) {
  if (profound?.source === "llm_probe_v2") {
    const cats = profound.categories ?? [];
    const invisible = cats.filter((c) => c.mentionRate === 0).map((c) => c.category);
    const visible = cats.filter((c) => c.mentionRate > 0).map((c) => `${c.category} (${Math.round(c.mentionRate * 100)}%)`);
    const s = profound.sentiment ?? {};
    const negExample = (s.examples ?? []).find((e) => e.tone === "negative");
    return `LLM VISIBILITY (live probe of Claude + ChatGPT, ${profound.promptsPerPlatform ?? "?"} prompts/platform):
- Unbranded visibility: ${profound.unbranded?.score ?? 0}/100 \u2014 mentioned in ${profound.unbranded?.mentions ?? 0} of ${profound.unbranded?.total ?? 0} prompts that never named the brand
- Brand recognition: ${profound.branded?.score ?? 0}/100 (${profound.branded?.recognized ?? 0}/${profound.branded?.total ?? 0} branded prompts answered accurately)
- Categories where brand is NEVER recommended by AI: ${invisible.length > 0 ? invisible.join(", ") : "none"}
- Categories with some AI visibility: ${visible.length > 0 ? visible.join(", ") : "none"}
- Sentiment of brand mentions: ${s.positive ?? 0} positive / ${s.neutral ?? 0} neutral / ${s.negative ?? 0} negative${s.assessed === false ? " (not assessed this run)" : ""}
${negExample ? `- Example negative AI excerpt (verbatim): "${negExample.quote}"` : ""}`;
  }
  if (profound?.source === "llm_probe") {
    return `LLM VISIBILITY (live probe of Claude + ChatGPT):
- Overall LLM visibility score: ${profound.overallScore ?? 0}/100 (${profound.overallMentions ?? 0}/${profound.overallTotal ?? 0} prompts mentioned brand)`;
  }
  return `LLM VISIBILITY: not yet assessed (no probe data for this analysis)`;
}
var NO_POSITION_DIST = "not available (this analysis carries no ranking footprint)";
function distJson(d) {
  return d && typeof d === "object" && Object.keys(d).length > 0 ? JSON.stringify(d) : NO_POSITION_DIST;
}
function distBand(d, band) {
  return d && typeof d === "object" ? d[band] ?? 0 : 0;
}
function opportunityPrompt(domain, industry, semrush, serp2, profound) {
  const positionDist = distJson(semrush.positionDist);
  const topComp = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? "unknown competitor";
  const gapKeywords = semrush.gapKeywords.map((k) => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join(", ");
  const aioStats = serp2.aioSummary;
  return `You are a senior SEO and GEO strategist building a CMO-level opportunity brief.

WEBSITE: ${domain}
INDUSTRY: ${industry}

\u2500\u2500 REAL DATA INPUTS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

SEMRUSH DATA (live):
- Total organic keywords: ${semrush.overview.organicKeywords.toLocaleString()}
- Organic traffic: ${semrush.overview.organicTraffic.toLocaleString()} visits/mo
- Position distribution: ${positionDist}
- Top competitor: ${topComp} (${semrush.competitors[0]?.commonKeywords ?? 0} shared keywords)
- Gap keywords (competitor ranks, client doesn't): ${gapKeywords}

SERPAPI DATA (live SERP snapshots):
- AI Overview coverage rate: ${Math.round(aioStats.aioRate * 100)}% of queried keywords show AIO
- Client AIO acquisition rate: ${Math.round(aioStats.clientAIORate * 100)}% of AIOs cite client
- Keywords queried: ${aioStats.total}

${llmProbeContext(profound)}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Identify the TOP 3 highest-impact organic growth opportunities specific to this website.

Each opportunity must:
1. Be grounded in the real data above (cite the specific metric)
2. Be actionable \u2014 a strategy a CMO could greenlight
3. Span SEO, GEO (LLM visibility), Content, or Competitive categories

For each opportunity return a JSON object:
{
  "category": "SEO | GEO | Content | Technical | Competitive",
  "title": "Short, punchy opportunity title (e.g. 'Claim the Unranked Decision Layer')",
  "summary": "2-3 sentences: what the gap is, why it matters, what to do",
  "impactScore": 8.5,   // 0-10 (based on volume + strategic importance)
  "effortScore": 4.0,   // 0-10 (lower = easier to execute)
  "estimatedVisits": 12000,  // estimated incremental visits/mo if captured
  "estimatedLeads": 240,     // estimated leads/mo (use industry conversion benchmarks)
  "evidence": [
    { "metric": "9%", "label": "Current market capture rate", "source": "Semrush Domain Overview" },
    { "metric": "47%", "label": "AIO coverage on target keywords", "source": "SerpAPI AIO scan" },
    { "metric": "2%", "label": "Client AIO acquisition rate", "source": "SerpAPI AIO scan" },
    { "metric": "31/100", "label": "LLM visibility score", "source": "Profound API" }
  ],
  "rank": 1  // 1 = highest priority
}

Return a JSON array of exactly 3 opportunity objects, ranked 1-3. No markdown, pure JSON only.`;
}
function narrativePrompt(domain, clientName, industry, semrush, serp2, profound, personas, opportunities, categoryBreakdown) {
  const captureRate = categoryBreakdown.page1CaptureRate > 0 ? categoryBreakdown.page1CaptureRate : semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic));
  const totalCategory = categoryBreakdown.totalMonthlyDemand > 0 ? categoryBreakdown.totalMonthlyDemand : semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic);
  const topComp = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? "the market leader";
  const aioRate = Math.round(serp2.aioSummary.aioRate * 100);
  const clientAIORate = Math.round(serp2.aioSummary.clientAIORate * 100);
  return `You are a senior growth strategist writing an executive narrative for a CMO at ${clientName}.

This is NOT a data report. This is a strategic story that answers:
"Where is organic demand going in our market, and why aren't we capturing it?"

The tone is: direct, confident, data-backed, CMO-appropriate.
No bullet-point summaries. Write in sharp, declarative paragraphs.

STRICT DATA RULES \u2014 apply to every section without exception:
1. Only cite numbers that appear verbatim in the VERIFIED DATA section below. Do not calculate, derive, or estimate any other numbers.
2. Never mention "visits", "traffic", "sessions", "pageviews", or "monthly visitors" for any party \u2014 client or competitor. This data is not verified.
3. Use "search demand" or "searches" instead of "visits" when referring to volume.
4. The page 1 capture rate is ${Math.round(captureRate * 100)}% \u2014 use only this figure, never a different percentage.

\u2500\u2500 VERIFIED DATA (cite these exact numbers \u2014 do not invent or round differently) \u2500\u2500

Market position:
- Page 1 capture rate: ${Math.round(captureRate * 100)}% (keyword demand analysis \u2014 use THIS number, not any other)
- Total category search demand: ~${totalCategory.toLocaleString()} searches/mo (keyword-level analysis)
- Top competitor: ${topComp} (${semrush.competitors[0]?.commonKeywords ?? 0} keywords overlap with ${clientName})
- ${semrush.competitors.length} competitors identified in this category

Keyword footprint:
- Total organic keywords: ${semrush.overview.organicKeywords.toLocaleString()} (Semrush)
- Keywords ranking page 1 (positions 1\u201310): ${semrush.topKeywords.filter((k) => k.position <= 10).length}
- Keywords ranking page 2+ (positions 11+): ${semrush.topKeywords.filter((k) => k.position > 10).length}
- Position distribution: ${distJson(semrush.positionDist)} (Semrush)

AI search landscape:
- ${aioRate}% of tracked keywords trigger AI Overviews (SerpAPI live data)
- ${clientName} appears in ${clientAIORate}% of those AI Overviews

${llmProbeContext(profound)}

Top opportunities: ${opportunities.map((o) => o.title).join(", ")}

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Write the following narrative sections:

1. MARKET POSITION NARRATIVE (150 words)
   Open with the page 1 capture rate as the story hook. Make it visceral \u2014 the search demand exists, the question is who captures it.

2. THE VISIBILITY GAP (100 words)
   Translate the position distribution into business impact. What does it mean to have ${distBand(semrush.positionDist, "11-20")} keywords on page 2? Revenue language, not SEO metrics.

3. THE AI SEARCH MOMENT (2 sentences, 40 words max)
   Be blunt. State the AIO exposure rate and the client's citation rate, then name the business consequence in one sentence. No fluff.

4. COMPETITIVE REALITY (100 words)
   Frame it as: here's the keyword territory already contested, here's what's still unclaimed. Do NOT mention competitor traffic or visit counts \u2014 use keyword overlap and market capture rate only.

5. THE STRATEGIC CALL (80 words)
   One clear recommendation a CMO can take to the board. No waffling. What's the move?

Return the narrative as a JSON object:
{
  "marketPositionNarrative": "...",
  "visibilityGap": "...",
  "aiSearchMoment": "...",
  "competitiveReality": "...",
  "strategicCall": "..."
}

Pure JSON only. No markdown wrappers.`;
}
function pptPromptGenerator(clientName, domain, industry, narrative, opportunities, semrush, serp2, profound) {
  return `You are creating a structured prompt for the Claude PPTX skill to generate a CMO-level pitch deck.

Generate a detailed PPTX skill prompt for a ${industry} company called "${clientName}" (${domain}).

The prompt should instruct Claude to build a 10-slide deck with:

SLIDE 1 \u2014 Title slide
"${clientName}: Organic Growth Intelligence Brief"
Subtitle: "Where demand is going \u2014 and why we're not capturing it"

SLIDE 2 \u2014 The Market Opportunity
Hero stat: ${Math.round(semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic)) * 100)}% market capture rate
Visual: Large donut chart showing client share vs. total market
Source: Semrush competitive landscape data

SLIDE 3 \u2014 Where Rankings Live Today
Position distribution visualization
Stats: ${distJson(semrush.positionDist)}
Narrative: "${narrative?.visibilityGap?.substring(0, 150) ?? ""}"

SLIDE 4 \u2014 The AI Search Landscape
AI Overview rate: ${Math.round(serp2.aioSummary.aioRate * 100)}%
Client AIO rate: ${Math.round(serp2.aioSummary.clientAIORate * 100)}%
Visual: Bar comparison of client vs. top competitors in AI citations
Source: SerpAPI live SERP data

SLIDE 5 \u2014 LLM Brand Visibility
${llmProbeContext(profound)}
Source: Live AI Probe (Claude + ChatGPT)

SLIDE 6 \u2014 Opportunity #1
Title: ${opportunities[0]?.title ?? "Top Opportunity"}
Impact: ${opportunities[0]?.impactScore ?? 0}/10 | Effort: ${opportunities[0]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[0]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities[0]?.evidence ?? [])}

SLIDE 7 \u2014 Opportunity #2
Title: ${opportunities[1]?.title ?? "Second Opportunity"}
Impact: ${opportunities[1]?.impactScore ?? 0}/10 | Effort: ${opportunities[1]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[1]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities[1]?.evidence ?? [])}

SLIDE 8 \u2014 Opportunity #3
Title: ${opportunities[2]?.title ?? "Third Opportunity"}
Impact: ${opportunities[2]?.impactScore ?? 0}/10 | Effort: ${opportunities[2]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[2]?.estimatedVisits ?? 0).toLocaleString()} visits/mo

SLIDE 9 \u2014 Competitive Landscape
Top competitors by organic presence
SOV comparison vs. ${semrush.competitors.slice(0, 3).map((c) => c.domain).join(", ")}

SLIDE 10 \u2014 The Strategic Call
"${narrative?.strategicCall ?? "Invest in the organic layer that compounds."}"
3 prioritized next steps

DESIGN REQUIREMENTS:
- Color scheme: Dark background (#0A0A0F), electric indigo accents (#6C63FF), white text
- Professional, minimal \u2014 no clip art, no stock icons
- Each slide: one hero number, one supporting visual, one source citation
- Font: Inter or similar clean sans-serif
- Slide dimensions: 16:9 widescreen

Return this as a ready-to-paste prompt for the Claude PPTX skill.`;
}

// .runs/oiq442.D1SLEP/e442.ts
var overview = { organicKeywords: 10, organicTraffic: 100 };
var serp = { aioSummary: { aioRate: 0.5, clientAIORate: 0.1 } };
var cb = { page1CaptureRate: 0.2, totalMonthlyDemand: 1e3, totalPage1Demand: 200 };
var mk = (dist) => ({
  domain: "x.com",
  overview,
  competitors: [],
  gapKeywords: [],
  topKeywords: [],
  positionDist: dist,
  positionVol: null
});
var out = {};
var cleared = mk(null);
out.narrCleared = narrativePrompt("x.com", "X", "banking", cleared, serp, null, [], [], cb);
out.oppCleared = opportunityPrompt("x.com", "banking", cleared, serp, null);
out.pptCleared = pptPromptGenerator("X", "x.com", "banking", {}, [], cleared, serp, null);
var real = mk({ "1-3": 4, "4-10": 9, "11-20": 137, "21+": 22 });
out.narrReal = narrativePrompt("x.com", "X", "banking", real, serp, null, [], [], cb);
out.oppReal = opportunityPrompt("x.com", "banking", real, serp, null);
console.log(JSON.stringify(out));
