/**
 * lib/claude/brandVocab.ts — v7.206
 *
 * Proposes a CLIENT brand vocabulary: the brand names, sub-brands, products and
 * common variants/abbreviations that should count as BRANDED for a client
 * (Constitution III.1). A domain string alone can't yield these — e.g. td.com →
 * "td" only, missing "toronto-dominion", "easyweb", "ameritrade".
 *
 * This is a SUGGESTION the user reviews and edits in the brand-terms manager; it
 * is never silently applied as data. Failures return [] (the user adds terms
 * manually) — it must never block analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import { instrumentAnthropic } from '@/lib/usage/record';

const MODEL = 'claude-haiku-4-5-20251001';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return instrumentAnthropic(new Anthropic({ apiKey }));   // v7.225: auto-record token usage
}

export interface BrandVocabInput {
  clientName:   string;
  domain:       string;          // e.g. "td.com"
  sampleKeywords?: string[];      // client's own top keywords — grounds the variants in real searches
}

/**
 * Returns a de-duped, lowercased list of client brand terms/variants. Only the
 * CLIENT's own brand (never competitors). Multi-word names ("toronto dominion")
 * are kept as phrases; abbreviations ("td", "tdbank") as single tokens.
 */
export async function suggestBrandVocabulary({ clientName, domain, sampleKeywords = [] }: BrandVocabInput): Promise<string[]> {
  const sample = sampleKeywords.slice(0, 120).map(k => `- ${k}`).join('\n');
  const prompt = `You are building the BRAND VOCABULARY for a single company so an SEO tool can label which keywords are "branded" (contain the client's own brand).

Company name: ${clientName}
Primary domain: ${domain}

${sample ? `Here are real keywords this company ranks for (use them to spot brand variants, sub-brands, products, and common misspellings the company is actually searched by):\n${sample}\n` : ''}
Return ONLY the CLIENT's own brand terms — full name, short name, domain root, sub-brands, owned product names, and common abbreviations or misspellings. Do NOT include competitor brands, generic/industry terms (e.g. "checking account", "0 apr credit card", "direct deposit"), or locations.

Respond with STRICT JSON only, no prose:
{"brandTerms": ["term1","term2", ...]}

Rules:
- Lowercase every term.
- Multi-word brand names stay as phrases ("toronto dominion", "td bank").
- Include the domain root and obvious abbreviations.
- 3–25 terms. Quality over quantity — every term must unambiguously identify THIS company.`;

  const res = await getClient().messages.create({
    model:      MODEL,
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(match[0]); } catch { return []; }
  const raw = (parsed as { brandTerms?: unknown })?.brandTerms;
  if (!Array.isArray(raw)) return [];

  return Array.from(new Set(
    raw
      .map(t => String(t ?? '').toLowerCase().trim())
      .filter(Boolean)
      .filter(t => t.length <= 120),
  ));
}
