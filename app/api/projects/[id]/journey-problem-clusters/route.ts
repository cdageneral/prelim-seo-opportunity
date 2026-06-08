/**
 * POST /api/projects/[id]/journey-problem-clusters
 *
 * v7.154 — Audience Journey, pre-product lane.
 * Names and groups the PRE-PRODUCT keywords — searches that describe a life
 * problem / symptom / desire but name NO specific procedure or product — into a
 * small set of life-problem THEMES (e.g. "Loose Skin After Weight Loss",
 * "Stubborn Belly Fat"). Solution-named keywords are never sent here; the client
 * has already separated them into the product lane by solution awareness.
 *
 * Body:    { keywords: string[], industry: string, domain: string }
 * Returns: { themes: string[], assignments: { [keyword: string]: theme } }
 *
 * Mirrors the /journey-edges route: Claude haiku, fault-tolerant, results cached
 * client-side in localStorage. The naming is AI judgment, NOT measured data — all
 * volume math stays in TypeScript on the client. On any failure (no API key,
 * timeout, bad JSON) it returns empty assignments and the panel falls back to the
 * deterministic anchor-based theme names, so the lane always renders.
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

const EMPTY = { themes: [] as string[], assignments: {} as Record<string, string> };

// Cap the keyword list sent to the model to keep tokens/latency bounded; any
// keyword not covered by the returned map falls back to the client's
// deterministic theme, so nothing is dropped from the lane.
const MAX_KW = 140;

export async function POST(
  req: NextRequest,
  _ctx: { params: { id: string } }
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

  if (!Array.isArray(keywords) || keywords.length === 0) return NextResponse.json(EMPTY);

  // De-dupe (case-insensitive) and cap.
  const seen = new Set<string>();
  const kws: string[] = [];
  for (const k of keywords) {
    const s = String(k ?? '').trim();
    const low = s.toLowerCase();
    if (!s || seen.has(low)) continue;
    seen.add(low);
    kws.push(s);
    if (kws.length >= MAX_KW) break;
  }
  if (!kws.length) return NextResponse.json(EMPTY);

  const kwList = kws.map((k, i) => `${i + 1}. ${k}`).join('\n');

  const prompt = `You are organizing PRE-PRODUCT search queries for a ${industry} website (${domain}).

These searches all share one trait: the person has a LIFE PROBLEM, symptom, or desire, but does NOT name any specific procedure, product, or brand. They do not yet know the solution exists. (Solution-named searches like "breast lift cost" have already been removed — do not expect them here.)

Group these queries into 3-7 THEMES named after the LIFE PROBLEM in the searcher's own words — e.g. "Loose Skin After Weight Loss", "Stubborn Belly Fat", "Sagging After Pregnancy". NEVER name a theme after a procedure, product, or brand (no "Liposuction", no "Tummy Tuck"). Keep theme names short (2-5 words) and human.

Assign EVERY query to exactly one theme.

QUERIES:
${kwList}

Return JSON only — no markdown, no explanation:
{
  "themes": ["Theme A", "Theme B"],
  "assignments": { "exact query text": "Theme A", "...": "Theme B" }
}`;

  try {
    const response = await getClient().messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: prompt }],
    }, { timeout: 30_000 });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const parsed = extractJSON<{ themes?: unknown; assignments?: unknown }>(text);

    // Validate: assignments must map a KNOWN query (case-insensitive) to a
    // non-empty string theme. Re-key to the original keyword casing the client
    // sent so client-side lookups (which lowercase) line up.
    const byLower = new Map<string, string>();
    kws.forEach(k => byLower.set(k.toLowerCase(), k));

    const assignments: Record<string, string> = {};
    const themeSet = new Set<string>();
    const rawAssign = (parsed.assignments && typeof parsed.assignments === 'object')
      ? parsed.assignments as Record<string, unknown>
      : {};
    for (const [q, t] of Object.entries(rawAssign)) {
      const orig = byLower.get(String(q).toLowerCase());
      const theme = String(t ?? '').trim();
      if (!orig || !theme) continue;
      assignments[orig] = theme;
      themeSet.add(theme);
    }

    if (Object.keys(assignments).length === 0) return NextResponse.json(EMPTY);

    return NextResponse.json({ themes: Array.from(themeSet), assignments });
  } catch (err) {
    console.error('[OrbitIQ] Journey problem-cluster naming failed:', err);
    return NextResponse.json(EMPTY);  // panel falls back to deterministic theme names
  }
}
