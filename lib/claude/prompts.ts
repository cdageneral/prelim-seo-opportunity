/**
 * OrbitIQ Claude Prompt Templates
 *
 * Five-pass synthesis pipeline:
 *  1. Personas         — haiku  (fast classification)
 *  2. Opportunities    — sonnet (analytical scoring)
 *  3. Narrative        — opus   (CMO-level storytelling)
 *  4. PDF copy         — sonnet (structured brief copy)
 *  5. PPT prompt       — sonnet (generate pptx skill prompt)
 */

import type { SemrushSnapshot }  from '../apis/semrush';
import type { SerpApiSnapshot }  from '../apis/serp';
import type { ProfoundSnapshot } from '../apis/profound';

// ─── Pass 1: Persona Generation ───────────────────────────────────────────────

export function personaPrompt(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot
): string {
  const topKws = semrush.topKeywords.slice(0, 20).map(k => k.keyword).join(', ');
  const paa = serp.keywords.flatMap(k => k.paaQuestions).slice(0, 20).join('\n- ');

  return `You are an audience strategist analyzing organic search behavior to uncover buyer personas.

WEBSITE: ${domain}
INDUSTRY: ${industry}

ACTUAL SEARCH DATA (Semrush — top 20 organic keywords):
${topKws}

ACTUAL "PEOPLE ALSO ASK" QUESTIONS (SerpAPI — 20 samples):
- ${paa}

Based only on this real search behavior data, identify 2-3 distinct buyer personas.

For each persona, return a JSON object with:
{
  "segmentName": "short memorable name (e.g. The Scaling Ops Lead)",
  "description": "2-sentence profile: who they are and what problem they're solving",
  "intentStage": "Awareness | Consideration | Decision",
  "primaryQueries": ["array of 3-5 actual queries they use"],
  "painPoints": ["3-4 pain points inferred from their search behavior"],
  "aiDiscoveryBehavior": "1 sentence: how they'd ask an AI assistant about this topic",
  "contentGaps": ["2-3 content types this persona needs but client doesn't have"]
}

Return an array of persona objects. No markdown, no explanation — pure JSON array only.`;
}

// ─── Pass 2: Opportunity Scoring ──────────────────────────────────────────────

export function opportunityPrompt(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: ProfoundSnapshot
): string {
  const positionDist = JSON.stringify(semrush.positionDist);
  const topComp      = semrush.competitors[0]?.domain ?? 'unknown competitor';
  const gapKeywords  = semrush.gapKeywords.slice(0, 15)
    .map(k => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`)
    .join(', ');

  const aioStats = serp.aioSummary;
  const profoundScore = profound.overallScore;
  const brandMisalign = profound.brandContext.misalignments.join('; ');
  const topicGaps     = profound.topicAuthority
    .filter(t => t.competitor && t.score < 50)
    .map(t => `${t.topic} (owned by ${t.competitor})`)
    .join(', ');

  return `You are a senior SEO and GEO strategist building a CMO-level opportunity brief.

WEBSITE: ${domain}
INDUSTRY: ${industry}

── REAL DATA INPUTS ──────────────────────────────────────────────────────────

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

PROFOUND DATA (LLM visibility):
- Overall LLM visibility score: ${profoundScore}/100
- Brand positioning misalignments: ${brandMisalign || 'none identified'}
- Topic authority gaps (competitor-owned): ${topicGaps || 'none identified'}

─────────────────────────────────────────────────────────────────────────────

Identify the TOP 3 highest-impact organic growth opportunities specific to this website.

Each opportunity must:
1. Be grounded in the real data above (cite the specific metric)
2. Be actionable — a strategy a CMO could greenlight
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

// ─── Pass 3: Narrative Generation (Opus) ─────────────────────────────────────

export function narrativePrompt(
  domain: string,
  clientName: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: ProfoundSnapshot,
  personas: any[],
  opportunities: any[]
): string {
  const totalCategory   = semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic);
  const captureRate     = totalCategory > 0 ? semrush.overview.organicTraffic / totalCategory : 0;
  const topComp         = semrush.competitors[0]?.domain ?? 'the market leader';
  const aioRate         = Math.round(serp.aioSummary.aioRate * 100);
  const clientAIORate   = Math.round(serp.aioSummary.clientAIORate * 100);
  const profoundScore   = profound.overallScore;
  const brandDescription = profound.brandContext.summary;

  return `You are a senior growth strategist writing an executive narrative for a CMO at ${clientName}.

This is NOT a data report. This is a strategic story that answers:
"Where is organic demand going in our market, and why aren't we capturing it?"

The tone is: direct, confident, data-backed, CMO-appropriate.
No bullet-point summaries. Write in sharp, declarative paragraphs.

── VERIFIED DATA (cite these exact numbers) ──────────────────────────────────

Market position:
- Estimated market capture rate: ${Math.round(captureRate * 100)}%
- ${clientName} organic traffic: ${semrush.overview.organicTraffic.toLocaleString()} visits/mo (Semrush)
- Total category traffic pool: ~${totalCategory.toLocaleString()} visits/mo (Semrush competitive landscape)
- Top competitor (${topComp}): ${semrush.competitors[0]?.organicTraffic.toLocaleString() ?? 'N/A'} visits/mo

Search visibility:
- Position distribution: ${JSON.stringify(semrush.positionDist)} (Semrush)
- Keywords ranking page 1: ${semrush.topKeywords.filter(k => k.position <= 10).length}
- Keywords ranking page 2+: ${semrush.topKeywords.filter(k => k.position > 10).length}

AI search landscape:
- ${aioRate}% of tracked keywords trigger AI Overviews (SerpAPI live data)
- ${clientName} appears in ${clientAIORate}% of those AI Overviews
- LLM visibility score: ${profoundScore}/100 (Profound)
- How AI currently describes ${clientName}: "${brandDescription}"

Top opportunities: ${opportunities.map(o => o.title).join(', ')}

─────────────────────────────────────────────────────────────────────────────

Write the following narrative sections:

1. MARKET POSITION NARRATIVE (150 words)
   Open with the market capture rate as the story hook. Make it visceral — the organic demand exists, the question is who captures it.

2. THE VISIBILITY GAP (100 words)
   Translate the position distribution into business impact. What does it mean to have ${semrush.positionDist['11-20'] ?? 0} keywords on page 2? Revenue language, not SEO metrics.

3. THE AI SEARCH MOMENT (120 words)
   The most strategic paragraph. ${aioRate}% of searches now trigger AI Overviews. ${clientName} is cited in ${clientAIORate}% of them. What does the brand look like to AI — and what's the cost of that?

4. COMPETITIVE REALITY (100 words)
   Not "here's what competitors do." Frame it as: here's the territory already claimed, here's what's contestable.

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

// ─── Pass 4: PPT Prompt Generator ─────────────────────────────────────────────

export function pptPromptGenerator(
  clientName: string,
  domain: string,
  industry: string,
  narrative: any | null,
  opportunities: any[],
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: ProfoundSnapshot
): string {
  return `You are creating a structured prompt for the Claude PPTX skill to generate a CMO-level pitch deck.

Generate a detailed PPTX skill prompt for a ${industry} company called "${clientName}" (${domain}).

The prompt should instruct Claude to build a 10-slide deck with:

SLIDE 1 — Title slide
"${clientName}: Organic Growth Intelligence Brief"
Subtitle: "Where demand is going — and why we're not capturing it"

SLIDE 2 — The Market Opportunity
Hero stat: ${Math.round((semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic))) * 100)}% market capture rate
Visual: Large donut chart showing client share vs. total market
Source: Semrush competitive landscape data

SLIDE 3 — Where Rankings Live Today
Position distribution visualization
Stats: ${JSON.stringify(semrush.positionDist)}
Narrative: "${narrative?.visibilityGap?.substring(0, 150) ?? ''}"

SLIDE 4 — The AI Search Landscape
AI Overview rate: ${Math.round(serp.aioSummary.aioRate * 100)}%
Client AIO rate: ${Math.round(serp.aioSummary.clientAIORate * 100)}%
Visual: Bar comparison of client vs. top competitors in AI citations
Source: SerpAPI live SERP data

SLIDE 5 — LLM Brand Visibility
Score: ${profound.overallScore}/100
How AI describes us: "${profound.brandContext.summary}"
Platform breakdown: ${profound.platformScores.map(p => `${p.platform}: ${p.score}`).join(', ')}
Source: Profound API

SLIDE 6 — Opportunity #1
Title: ${opportunities[0]?.title ?? 'Top Opportunity'}
Impact: ${opportunities[0]?.impactScore ?? 0}/10 | Effort: ${opportunities[0]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[0]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities[0]?.evidence ?? [])}

SLIDE 7 — Opportunity #2
Title: ${opportunities[1]?.title ?? 'Second Opportunity'}
Impact: ${opportunities[1]?.impactScore ?? 0}/10 | Effort: ${opportunities[1]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[1]?.estimatedVisits ?? 0).toLocaleString()} visits/mo
Evidence grid: ${JSON.stringify(opportunities[1]?.evidence ?? [])}

SLIDE 8 — Opportunity #3
Title: ${opportunities[2]?.title ?? 'Third Opportunity'}
Impact: ${opportunities[2]?.impactScore ?? 0}/10 | Effort: ${opportunities[2]?.effortScore ?? 0}/10
Est. upside: +${(opportunities[2]?.estimatedVisits ?? 0).toLocaleString()} visits/mo

SLIDE 9 — Competitive Landscape
Top competitors by organic presence
SOV comparison vs. ${semrush.competitors.slice(0, 3).map(c => c.domain).join(', ')}

SLIDE 10 — The Strategic Call
"${narrative?.strategicCall ?? 'Invest in the organic layer that compounds.'}"
3 prioritized next steps

DESIGN REQUIREMENTS:
- Color scheme: Dark background (#0A0A0F), electric indigo accents (#6C63FF), white text
- Professional, minimal — no clip art, no stock icons
- Each slide: one hero number, one supporting visual, one source citation
- Font: Inter or similar clean sans-serif
- Slide dimensions: 16:9 widescreen

Return this as a ready-to-paste prompt for the Claude PPTX skill.`;
}
