/**
 * lib/claude/excludedBrandVocab.ts — v7.209
 *
 * The inverse of brandVocab.ts. Proposes the COMPETITOR / THIRD-PARTY brand terms
 * present in a client's keyword footprint that must NOT appear in keywords or
 * clusters (Constitution III.1) — e.g. "schwab", "vanguard", "fidelity" surfacing
 * in a 529-plan client's data. These are brands the deterministic signals (v7.201
 * auto-discovered competitors / configured competitors / v7.199 AI cluster flags)
 * can miss, especially when they aren't tracked competitors.
 *
 * This is a SUGGESTION the user reviews and adds to the editable blocklist (v7.208);
 * it is NEVER auto-applied as data. Failures return [] (the user adds terms
 * manually) — it must never block analysis. The client's OWN brand is never
 * proposed (the model is told the client name + domain to exclude).
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return new Anthropic({ apiKey });
}

export interface ExcludedBrandInput {
  clientName:        string;
  domain:            string;          // e.g. "futurescholar.com"
  competitorDomains?: string[];        // known/tracked competitors (context only)
  sampleKeywords?:   string[];         // the client + gap keywords to scan for foreign brands
}

/**
 * Returns a de-duped, lowercased list of NON-client brand terms found in the
 * sample keywords (competitor + third-party brands). Only brand NAMES — never the
 * client's own brand, never generic/industry terms, never locations.
 */
export async function suggestExcludedBrands({
  clientName,
  domain,
  competitorDomains = [],
  sampleKeywords = [],
}: ExcludedBrandInput): Promise<string[]> {
  const sample = sampleKeywords.slice(0, 200).map(k => `- ${k}`).join('\n');
  if (!sample) return [];

  const comp = competitorDomains.filter(Boolean).slice(0, 30).join(', ');
  const prompt = `You are auditing an SEO keyword list to find COMPETITOR and THIRD-PARTY BRAND names that must be removed (they are not the client's brand).

Client company: ${clientName}
Client domain: ${domain}
${comp ? `Known competitors (context): ${comp}\n` : ''}
Here are real keywords from the client's footprint and competitor gaps. Find every keyword that names a company/brand that is NOT ${clientName}:
${sample}

Return ONLY the distinct NON-client brand NAMES that appear (competitors, financial institutions, retailers, manufacturers, any third-party company). For example, for a 529 college-savings client you might return "schwab", "vanguard", "fidelity".

Do NOT include:
- the client's own brand or any variant of it,
- generic/industry terms (e.g. "529 plan", "college savings", "tax deduction"),
- locations or person names that aren't brands.

Respond with STRICT JSON only, no prose:
{"excludedBrands": ["brand1","brand2", ...]}

Rules:
- Lowercase every term.
- Use the SHORTEST identifying brand token where unambiguous ("schwab", not "charles schwab 529") — but keep a multi-word brand as a phrase when the single word is generic.
- Only include a brand if it actually appears in the keywords above.
- 0–40 terms. Quality over quantity — every term must be a real non-client brand.`;

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
  const raw = (parsed as { excludedBrands?: unknown })?.excludedBrands;
  if (!Array.isArray(raw)) return [];

  return Array.from(new Set(
    raw
      .map(t => String(t ?? '').toLowerCase().trim())
      .filter(Boolean)
      .filter(t => t.length >= 3 && t.length <= 120),
  ));
}
