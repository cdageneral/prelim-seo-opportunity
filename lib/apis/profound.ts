/**
 * Profound API Client
 * Docs: https://docs.profound.io
 *
 * Features used:
 *  - LLM Visibility Score (overall + per platform)
 *  - Brand mention context ("how AI describes your brand")
 *  - Competitor LLM Share of Voice
 *  - Topic Authority — which topics AI associates with the brand
 *  - 6-month visibility trend
 *  - Citation rate per platform (ChatGPT, Perplexity, Gemini, Claude)
 */

const BASE_URL = process.env.PROFOUND_BASE_URL ?? 'https://api.profound.io/v1';;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformScore {
  platform:    'chatgpt' | 'perplexity' | 'gemini' | 'claude' | 'bing_copilot';
  score:       number;   // 0–100
  citationRate: number;  // 0–1
  rank:        number | null;  // Avg position when cited
}

export interface BrandMentionContext {
  summary:        string;    // How LLMs currently describe the brand
  positioning:    string[];  // Adjectives/phrases LLMs associate with the brand
  misalignments:  string[];  // Areas where LLM perception ≠ desired positioning
}

export interface LLMCompetitor {
  domain:     string;
  score:      number;
  shareOfVoice: number;  // % of prompts they appear in vs client
  advantage:  string[];  // Topic areas they dominate
}

export interface TopicAuthority {
  topic:       string;
  score:       number;    // 0–100
  trend:       'rising' | 'stable' | 'declining';
  competitor?: string;    // Who owns this topic in LLMs if not the client
}

export interface VisibilityTrendPoint {
  month: string;   // ISO date (first of month)
  score: number;
}

export interface ProfoundSnapshot {
  domain:            string;
  overallScore:      number;        // 0–100 composite LLM visibility
  platformScores:    PlatformScore[];
  brandContext:      BrandMentionContext;
  competitors:       LLMCompetitor[];
  topicAuthority:    TopicAuthority[];
  visibilityTrend:   VisibilityTrendPoint[];  // Last 6 months
  totalPromptsCovered: number;     // # prompts Profound tracks for this domain
  fetchedAt:         string;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

async function profoundGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const API_KEY = process.env.PROFOUND_API_KEY;
  if (!API_KEY) throw new Error('PROFOUND_API_KEY is not set — skipping Profound');

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type':  'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Profound API error ${res.status} on ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Visibility Overview ──────────────────────────────────────────────────────

export async function getVisibilityOverview(domain: string): Promise<{
  overallScore: number;
  platformScores: PlatformScore[];
  totalPromptsCovered: number;
}> {
  const data = await profoundGet<any>('/visibility/overview', { domain });

  const platformScores: PlatformScore[] = (data.platforms ?? []).map((p: any) => ({
    platform:    p.platform,
    score:       p.score ?? 0,
    citationRate: p.citation_rate ?? 0,
    rank:        p.avg_rank ?? null,
  }));

  return {
    overallScore:       data.overall_score ?? 0,
    platformScores,
    totalPromptsCovered: data.total_prompts ?? 0,
  };
}

// ─── Brand Mention Context ────────────────────────────────────────────────────

export async function getBrandContext(domain: string): Promise<BrandMentionContext> {
  const data = await profoundGet<any>('/brand/context', { domain });

  return {
    summary:       data.summary ?? '',
    positioning:   data.positioning_terms ?? [],
    misalignments: data.misalignments ?? [],
  };
}

// ─── Competitor LLM SOV ───────────────────────────────────────────────────────

export async function getLLMCompetitors(domain: string): Promise<LLMCompetitor[]> {
  const data = await profoundGet<any>('/competitors/llm', { domain, limit: '8' });

  return (data.competitors ?? []).map((c: any) => ({
    domain:       c.domain,
    score:        c.visibility_score ?? 0,
    shareOfVoice: c.share_of_voice ?? 0,
    advantage:    c.dominant_topics ?? [],
  }));
}

// ─── Topic Authority ──────────────────────────────────────────────────────────

export async function getTopicAuthority(domain: string): Promise<TopicAuthority[]> {
  const data = await profoundGet<any>('/topics/authority', { domain, limit: '15' });

  return (data.topics ?? []).map((t: any) => ({
    topic:      t.topic,
    score:      t.authority_score ?? 0,
    trend:      t.trend ?? 'stable',
    competitor: t.dominant_competitor ?? undefined,
  }));
}

// ─── Visibility Trend ─────────────────────────────────────────────────────────

export async function getVisibilityTrend(domain: string): Promise<VisibilityTrendPoint[]> {
  const data = await profoundGet<any>('/visibility/trend', {
    domain,
    period: '6mo',
    interval: 'month',
  });

  return (data.trend ?? []).map((p: any) => ({
    month: p.date,
    score: p.score ?? 0,
  }));
}

// ─── Full Snapshot ────────────────────────────────────────────────────────────

export async function getProfoundSnapshot(domain: string): Promise<ProfoundSnapshot> {
  // Parallel fetch of all endpoints
  const [overview, brandContext, competitors, topicAuthority, visibilityTrend] =
    await Promise.all([
      getVisibilityOverview(domain),
      getBrandContext(domain),
      getLLMCompetitors(domain),
      getTopicAuthority(domain),
      getVisibilityTrend(domain),
    ]);

  return {
    domain,
    overallScore:         overview.overallScore,
    platformScores:       overview.platformScores,
    brandContext,
    competitors,
    topicAuthority,
    visibilityTrend,
    totalPromptsCovered:  overview.totalPromptsCovered,
    fetchedAt:            new Date().toISOString(),
  };
}
