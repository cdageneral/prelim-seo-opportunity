/**
 * POST /api/projects/[id]/clusters
 *
 * Layer 2 of ThemeClusters intent classification.
 * Called only for keywords that signal-matching (Layer 1) could not classify.
 * Uses Claude haiku — fast + cheap. Results are cached client-side in localStorage.
 *
 * Body:  { keywords: string[], industry: string, domain: string }
 * Returns: { assignments: Record<string, 'informational'|'commercial'|'transactional'|'navigational'> }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return new Anthropic({ apiKey });
}

function extractJSON<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const match = cleaned.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error('Non-JSON response');
  }
}

type IntentType = 'informational' | 'commercial' | 'transactional' | 'navigational';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { keywords, industry, domain } = body as {
    keywords: string[];
    industry: string;
    domain:   string;
  };

  if (!keywords?.length) {
    return NextResponse.json({ assignments: {} });
  }

  // Cap at 60 keywords per call — above this, signal matching should handle the rest
  const capped = keywords.slice(0, 60);

  const kwList = capped.map((kw, i) => `${i}. ${kw}`).join('\n');

  const prompt = `You are classifying search keywords by search intent for a ${industry} website (${domain}).

For each keyword assign exactly one intent type:
- "informational"  — learning/research queries (what is, how does, guide, recovery time, risks, types of)
- "commercial"     — evaluation/comparison queries (reviews, best, cost, worth it, compare, before after, results)
- "transactional"  — action-ready queries (near me, schedule, book, appointment, price, financing, locations)
- "navigational"   — direct brand navigation queries (contains the brand name or specific product name with no research intent)

KEYWORDS:
${kwList}

Return JSON only — no markdown, no explanation:
{
  "assignments": {
    "keyword text exactly as given": "informational",
    "another keyword": "transactional"
  }
}`;

  try {
    const response = await getClient().messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages:   [{ role: 'user', content: prompt }],
    }, { timeout: 30_000 });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const parsed = extractJSON<{ assignments: Record<string, string> }>(text);

    // Validate and normalise — only accept known intent values
    const VALID_INTENTS = new Set<string>(['informational', 'commercial', 'transactional', 'navigational']);
    const assignments: Record<string, IntentType> = {};
    for (const [kw, intent] of Object.entries(parsed.assignments ?? {})) {
      if (VALID_INTENTS.has(intent)) {
        assignments[kw.toLowerCase()] = intent as IntentType;
      }
    }

    return NextResponse.json({ assignments });

  } catch (err) {
    console.error('[OrbitIQ] Cluster classification failed:', err);
    // Return empty — the panel will show unmatched keywords under informational as fallback
    return NextResponse.json({ assignments: {} });
  }
}
