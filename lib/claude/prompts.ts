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

import type { SemrushSnapshot, SemrushKeyword }  from '../apis/semrush';
import type { SerpApiSnapshot }  from '../apis/serp';

// ─── LLM Probe context helper (v7.80) ────────────────────────────────────────
//
// Builds the "LLM visibility" data block for synthesis prompts from whatever
// probe snapshot shape is present: v2 (llm_probe_v2), v1 (llm_probe), or none.
// Every number in the block comes from actual probe results — no estimates.

export function llmProbeContext(profound: any): string {
  if (profound?.source === 'llm_probe_v2') {
    const cats: any[] = profound.categories ?? [];
    const invisible = cats.filter(c => c.mentionRate === 0).map(c => c.category);
    const visible   = cats.filter(c => c.mentionRate > 0)
      .map(c => `${c.category} (${Math.round(c.mentionRate * 100)}%)`);
    const s = profound.sentiment ?? {};
    const negExample = (s.examples ?? []).find((e: any) => e.tone === 'negative');

    return `LLM VISIBILITY (live probe of Claude + ChatGPT, ${profound.promptsPerPlatform ?? '?'} prompts/platform):
- Unbranded visibility: ${profound.unbranded?.score ?? 0}/100 — mentioned in ${profound.unbranded?.mentions ?? 0} of ${profound.unbranded?.total ?? 0} prompts that never named the brand
- Brand recognition: ${profound.branded?.score ?? 0}/100 (${profound.branded?.recognized ?? 0}/${profound.branded?.total ?? 0} branded prompts answered accurately)
- Categories where brand is NEVER recommended by AI: ${invisible.length > 0 ? invisible.join(', ') : 'none'}
- Categories with some AI visibility: ${visible.length > 0 ? visible.join(', ') : 'none'}
- Sentiment of brand mentions: ${s.positive ?? 0} positive / ${s.neutral ?? 0} neutral / ${s.negative ?? 0} negative${s.assessed === false ? ' (not assessed this run)' : ''}
${negExample ? `- Example negative AI excerpt (verbatim): "${negExample.quote}"` : ''}`;
  }

  if (profound?.source === 'llm_probe') {
    return `LLM VISIBILITY (live probe of Claude + ChatGPT):
- Overall LLM visibility score: ${profound.overallScore ?? 0}/100 (${profound.overallMentions ?? 0}/${profound.overallTotal ?? 0} prompts mentioned brand)`;
  }

  return `LLM VISIBILITY: not yet assessed (no probe data for this analysis)`;
}


// ─── Pass 2.5: Category Breakdown ────────────────────────────────────────────
//
// Classifies a MERGED pool of (a) keywords the client ranks for and
// (b) gap keywords from the top competitor that the client doesn't rank for.
// Claude only outputs a keyword-to-index mapping.
// All arithmetic (demand sums) is computed in TypeScript.

export interface MergedKeyword {
  keyword:        string;
  searchVolume:   number;
  clientPosition: number | null; // null = client doesn't rank for this keyword
}

export function categoryBreakdownPrompt(
  domain: string,
  industry: string,
  keywords: MergedKeyword[]
): string {
  const kwList = keywords
    .map((k, i) => {
      const posLabel = k.clientPosition !== null
        ? `client pos: ${k.clientPosition}`
        : 'client: unranked';
      return `${i}. ${k.keyword} | ${posLabel} | ${k.searchVolume.toLocaleString()}/mo`;
    })
    .join('\n');

  // Extract a clean brand name hint from domain (e.g. "sonobello.com" → "Sono Bello")
  const brandHint = domain.replace(/\.(com|net|org|io|co).*$/, '').replace(/[-_]/g, ' ');

  return `You are analyzing organic search keywords for a website to identify its core service or product categories.

WEBSITE: ${domain}
INDUSTRY: ${industry}
BRAND NAME HINT: "${brandHint}" (use this to identify branded keywords)

KEYWORDS (index. keyword | client ranking | monthly search volume):
${kwList}

Note: "client: unranked" means this keyword has demand but the client does not rank on page 1 for it.

CATEGORIZATION RULES — follow exactly:

1. BRAND category (type: "brand"): keywords that contain the brand name, brand variants, or misspellings. Name this category after the actual brand (e.g. "Sono Bello Brand Searches", not "Brand & Company Name").

2. LOCATION category (type: "location"): keywords combining the brand or service with a city, state, or "near me". Name it after what you find (e.g. "Sono Bello Locations", not "Location Services").

3. PROCEDURE categories (type: "procedure"): group all remaining keywords by the specific SERVICE or PROCEDURE they represent. Name each from the keywords themselves (e.g. "Liposuction", "Tummy Tuck").
   - CRITICAL: pricing, cost, reviews, before/after, testimonials, and how-to keywords MUST be placed inside their parent procedure category. NEVER create a standalone "Reviews", "Pricing", or "Cost" category — these are modifiers, not procedures.
   - If a review or pricing keyword clearly belongs to a procedure (e.g. "liposuction reviews", "tummy tuck cost"), assign it to that procedure.
   - Only create a new procedure category if 2+ keywords share the same core service topic.

Every keyword index must appear in exactly one category. Omit only obvious nonsensical misspellings.

Return JSON ONLY — no markdown, no explanation. Category names must come from the actual keywords, not from these examples:
{
  "categories": [
    { "name": "[Derived from actual keywords — e.g. Liposuction]", "type": "procedure", "keywordIndices": [0, 3, 7, 12] },
    { "name": "[Actual brand name + descriptor — e.g. Sono Bello Brand Searches]", "type": "brand", "keywordIndices": [1, 2] },
    { "name": "[Actual brand/service + location — e.g. Sono Bello Locations]", "type": "location", "keywordIndices": [5, 8] }
  ]
}`;
}

// ─── Pass 2.5b: Category Consolidation ───────────────────────────────────────
//
// v7.80: The full keyword set is discovered in independent parallel batches,
// so the same concept can surface under different names ("Liposuction" vs
// "Lipo Procedures"). This single call merges those aliases into one canonical
// category list. Claude only maps names → names; all demand arithmetic stays
// in TypeScript.

export function categoryConsolidationPrompt(
  domain: string,
  industry: string,
  categories: Array<{ name: string; type: string }>
): string {
  const catList = categories
    .map(c => `- "${c.name}" (${c.type})`)
    .join('\n');

  return `You are consolidating a list of keyword category names for a ${industry} website (${domain}).
The categories below were generated by independent passes over different slices of the same keyword set, so the SAME concept may appear under slightly different names.

PROPOSED CATEGORIES:
${catList}

CONSOLIDATION RULES:
1. Merge names that refer to the SAME service, procedure, brand, or concept (e.g. "Liposuction", "Lipo Procedures", "Liposuction Services" → one category).
2. Do NOT merge genuinely distinct procedures or services (e.g. "Liposuction" and "Tummy Tuck" stay separate).
3. Merge all brand-search variants into ONE brand category, and all brand+location variants into ONE location category.
4. The canonical name should be the clearest, most natural name from the group.
5. Every proposed name must appear in EXACTLY ONE "merges" array — none may be dropped or duplicated.
6. type: "procedure" | "brand" | "location" — keep the most accurate type for the merged group.

Return JSON ONLY — no markdown, no explanation:
{
  "categories": [
    { "name": "Liposuction", "type": "procedure", "merges": ["Liposuction", "Lipo Procedures"] },
    { "name": "Sono Bello Brand Searches", "type": "brand", "merges": ["Sono Bello Brand Searches", "Brand Keywords"] }
  ]
}`;
}

// ─── Pass 1: Audience Segment Generation ─────────────────────────────────────

export function personaPrompt(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot
): string {
  const topKws = semrush.topKeywords.map(k => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join('\n- ');
  const gapKws = semrush.gapKeywords.map(k => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`).join('\n- ');
  const paa    = serp.keywords.flatMap(k => k.paaQuestions).slice(0, 25).join('\n- ');

  return `You are a senior audience strategist building deep-dive segment profiles from real organic search data.

WEBSITE: ${domain}
INDUSTRY: ${industry}

── REAL SEARCH DATA ──────────────────────────────────────────────────────────

TOP ORGANIC KEYWORDS (client currently ranks for these):
- ${topKws}

GAP KEYWORDS (competitors rank, client does not):
- ${gapKws}

PEOPLE ALSO ASK QUESTIONS (live SERP data):
- ${paa}

── YOUR TASK ─────────────────────────────────────────────────────────────────

From this real search behavior, identify 2-3 distinct audience segments. Each segment represents a meaningfully different type of person with a different motivation, timeline, and decision journey.

For each segment, generate a full deep-dive profile. Return a JSON array of objects with EXACTLY this structure:

[
  {
    "id": "segment-a",
    "name": "The [Memorable Archetype Name]",
    "tagline": "A first-person quote that captures this segment's core mindset and urgency — 1-2 sentences as if the person is speaking",
    "volumePct": 40,
    "whoTheyAre": {
      "demographics": "Age range, life stage, financial/professional situation, how they make decisions, typical purchase timeline",
      "trigger": "The specific life event or situation that triggers their search journey — be precise",
      "influencerRole": "Who else influences or gates their decision (partner, advisor, adult child, colleague) — omit if not applicable"
    },
    "preLLMPrompts": [
      "life-problem prompt they use BEFORE they think of the product (5-6 prompts that signal intent upstream)"
    ],
    "productPrompts": [
      "direct product or solution search they use once they know what they want (4-5 prompts)"
    ],
    "touchpoints": [
      { "stage": "Stage 1 — AI / LLM", "description": "How and why they start in an AI chat tool, what they ask, what content must be there to intercept them" },
      { "stage": "Stage 2 — Google Search", "description": "What they search on Google after LLM, which query types, what they need to find" },
      { "stage": "Stage 3 — Website", "description": "What they do on the client website — which pages, tools, CTAs matter most" },
      { "stage": "Stage 4 — Conversion", "description": "How they convert — call, form, chat, walk-in — and what triggers the final decision" }
    ],
    "messagingAndTone": "3-4 specific messaging directions for this segment: what to lead with, what tone to use, what to avoid, which objections to address first",
    "creativeDirection": "3-4 specific creative and imagery directions: what scenes/moments to show, what to avoid, any specific ad formats or content types that will resonate",
    "channelApproach": "3-4 specific channel recommendations: which paid/organic/social channels, why, and what content type works on each for this segment"
  }
]

RULES:
- volumePct values must sum to 100 across all segments
- All prompts must feel like real search queries or LLM inputs, not descriptions
- Messaging, creative, and channel sections must be specific and actionable — not generic
- Base everything on the actual keyword and PAA data provided — no generic industry assumptions
- CONCISENESS: demographics 2 sentences max · trigger 1 sentence · influencerRole 1 sentence · touchpoint descriptions 2 sentences max · messagingAndTone/creativeDirection/channelApproach 3-4 bullet-style points as a single string separated by newlines
- No markdown, no explanation — pure JSON array only`;
}

// ─── Pass 2: Opportunity Scoring ──────────────────────────────────────────────

export function opportunityPrompt(
  domain: string,
  industry: string,
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: any
): string {
  const positionDist = JSON.stringify(semrush.positionDist);
  // Sort by organicTraffic so manually-added competitors (traffic=0) don't steal top spot
  const topComp      = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? 'unknown competitor';
  const gapKeywords  = semrush.gapKeywords
    .map(k => `${k.keyword} (${k.searchVolume.toLocaleString()}/mo)`)
    .join(', ');

  const aioStats = serp.aioSummary;

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

${llmProbeContext(profound)}

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
  profound: any,
  personas: any[],
  opportunities: any[],
  categoryBreakdown: { page1CaptureRate: number; totalMonthlyDemand: number; totalPage1Demand: number }
): string {
  // Use keyword-level capture rate from category breakdown — this is the same
  // number displayed as the hero metric in the UI (page1Demand / totalMonthlyDemand).
  const captureRate     = categoryBreakdown.page1CaptureRate > 0
    ? categoryBreakdown.page1CaptureRate
    : (semrush.overview.organicTraffic / Math.max(1, semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic)));
  const totalCategory   = categoryBreakdown.totalMonthlyDemand > 0
    ? categoryBreakdown.totalMonthlyDemand
    : semrush.competitors.reduce((s, c) => s + c.organicTraffic, semrush.overview.organicTraffic);
  // Sort by organicTraffic so manually-added competitors (traffic=0) don't steal top spot
  const topComp         = [...semrush.competitors].sort((a, b) => b.organicTraffic - a.organicTraffic)[0]?.domain ?? 'the market leader';
  const aioRate         = Math.round(serp.aioSummary.aioRate * 100);
  const clientAIORate   = Math.round(serp.aioSummary.clientAIORate * 100);

  return `You are a senior growth strategist writing an executive narrative for a CMO at ${clientName}.

This is NOT a data report. This is a strategic story that answers:
"Where is organic demand going in our market, and why aren't we capturing it?"

The tone is: direct, confident, data-backed, CMO-appropriate.
No bullet-point summaries. Write in sharp, declarative paragraphs.

STRICT DATA RULES — apply to every section without exception:
1. Only cite numbers that appear verbatim in the VERIFIED DATA section below. Do not calculate, derive, or estimate any other numbers.
2. Never mention "visits", "traffic", "sessions", "pageviews", or "monthly visitors" for any party — client or competitor. This data is not verified.
3. Use "search demand" or "searches" instead of "visits" when referring to volume.
4. The page 1 capture rate is ${Math.round(captureRate * 100)}% — use only this figure, never a different percentage.

── VERIFIED DATA (cite these exact numbers — do not invent or round differently) ──

Market position:
- Page 1 capture rate: ${Math.round(captureRate * 100)}% (keyword demand analysis — use THIS number, not any other)
- Total category search demand: ~${totalCategory.toLocaleString()} searches/mo (keyword-level analysis)
- Top competitor: ${topComp} (${semrush.competitors[0]?.commonKeywords ?? 0} keywords overlap with ${clientName})
- ${semrush.competitors.length} competitors identified in this category

Keyword footprint:
- Total organic keywords: ${semrush.overview.organicKeywords.toLocaleString()} (Semrush)
- Keywords ranking page 1 (positions 1–10): ${semrush.topKeywords.filter(k => k.position <= 10).length}
- Keywords ranking page 2+ (positions 11+): ${semrush.topKeywords.filter(k => k.position > 10).length}
- Position distribution: ${JSON.stringify(semrush.positionDist)} (Semrush)

AI search landscape:
- ${aioRate}% of tracked keywords trigger AI Overviews (SerpAPI live data)
- ${clientName} appears in ${clientAIORate}% of those AI Overviews

${llmProbeContext(profound)}

Top opportunities: ${opportunities.map(o => o.title).join(', ')}

─────────────────────────────────────────────────────────────────────────────

Write the following narrative sections:

1. MARKET POSITION NARRATIVE (150 words)
   Open with the page 1 capture rate as the story hook. Make it visceral — the search demand exists, the question is who captures it.

2. THE VISIBILITY GAP (100 words)
   Translate the position distribution into business impact. What does it mean to have ${semrush.positionDist['11-20'] ?? 0} keywords on page 2? Revenue language, not SEO metrics.

3. THE AI SEARCH MOMENT (2 sentences, 40 words max)
   Be blunt. State the AIO exposure rate and the client's citation rate, then name the business consequence in one sentence. No fluff.

4. COMPETITIVE REALITY (100 words)
   Frame it as: here's the keyword territory already contested, here's what's still unclaimed. Do NOT mention competitor traffic or visit counts — use keyword overlap and market capture rate only.

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
  narrative: any,
  opportunities: any[],
  semrush: SemrushSnapshot,
  serp: SerpApiSnapshot,
  profound: any
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
${llmProbeContext(profound)}
Source: Live AI Probe (Claude + ChatGPT)

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
