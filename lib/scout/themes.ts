/**
 * lib/scout/themes.ts — keyword → theme assignment (v7.513).
 *
 * Claude only GROUPS. It returns index lists over keywords Scout already holds;
 * it never supplies a keyword, a volume or a count, and every index is validated
 * against the input. Every number on the report is summed by lib/scout/opportunity
 * from Semrush rows (Const I.1). A keyword Claude leaves out, or places in the
 * "not relevant" bucket, is excluded from themes and the exclusion is counted.
 */

import Anthropic from '@anthropic-ai/sdk';
import { instrumentAnthropic } from '@/lib/usage/record';

const MODEL = 'claude-haiku-4-5-20251001';

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set — Scout cannot group keywords into themes.');
  return instrumentAnthropic(new Anthropic({ apiKey }));
}

function firstJson(text: string): any {
  const a = text.indexOf('{'); const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Theme grouping returned no JSON.');
  return JSON.parse(text.slice(a, b + 1));
}

export interface ThemeAssignment { assignment: Map<string, string>; notRelevant: number; themeNames: string[] }

/**
 * Full-domain scope: discover 5–12 product themes and assign every keyword.
 * v7.521 (Wayne 2026-09-23, option 2): one product per theme. The navyfederal.org run had "best cd rates" and
 * "best checking accounts" filed under "Savings accounts" — a banker reads that as wrong. Related products are now
 * separate themes even when small; a theme under MIN_THEME_KEYWORDS is set aside and counted, never merged.
 */
export async function groupIntoThemes(opts: { domain: string; industry: string; keywords: string[] }): Promise<ThemeAssignment> {
  const kws = opts.keywords;
  if (!kws.length) return { assignment: new Map(), notRelevant: 0, themeNames: [] };
  const list = kws.map((k, i) => `${i}\t${k}`).join('\n');
  const prompt =
`You are grouping search keywords for a marketing report about ${opts.domain} (industry: ${opts.industry}).

Group the numbered keywords below into 5 to 12 THEMES. A theme is ONE product line or ONE buyer topic this business could plausibly own a section of its website for (for example "Accident insurance", "Term life insurance", "Claims and how-to"). Rules:
- One product per theme. Related products are SEPARATE themes, never one: savings accounts, certificates of deposit and checking accounts are three themes; term life and whole life are two; auto loans and auto refinance are two. Do not create a family theme like "Deposit accounts" or "Bank accounts".
- The theme name must describe every keyword in it. A reader must never find a keyword in a theme whose name does not cover it.
- Theme names: 2-4 plain words, Title case first word only, no brand names, no "and more", no "Other".
- Every keyword goes in exactly one theme, OR in "skip" if it is navigational, a brand name, a login/app/careers/customer-service query, or not relevant to what this business sells.
- Do not invent keywords. Use only the index numbers given.

Return ONLY JSON: {"themes":[{"name":"...","idx":[0,5,9]}],"skip":[3,4]}

Keywords:
${list}`;
  const resp: any = await client().messages.create({ model: MODEL, max_tokens: 12000, temperature: 0, messages: [{ role: 'user', content: prompt }] });
  const text = (resp?.content ?? []).map((c: any) => c?.text ?? '').join('');
  const json = firstJson(text);
  const assignment = new Map<string, string>();
  const names: string[] = [];
  const used = new Set<number>();
  for (const t of Array.isArray(json?.themes) ? json.themes : []) {
    const name = String(t?.name ?? '').trim().slice(0, 40);
    if (!name || /^(other|misc|skip)/i.test(name)) continue;
    let any = false;
    for (const raw of Array.isArray(t?.idx) ? t.idx : []) {
      const i = Number(raw);
      if (!Number.isInteger(i) || i < 0 || i >= kws.length || used.has(i)) continue;
      used.add(i); assignment.set(kws[i], name); any = true;
    }
    if (any) names.push(name);
  }
  return { assignment, notRelevant: kws.length - used.size, themeNames: names };
}

/** Product scope: propose up to `max` short "contains" terms per product for the Semrush phrase filter. */
export async function proposeProductTerms(opts: { industry: string; products: string[]; max: number }): Promise<Record<string, string[]>> {
  const prompt =
`For each product below, give up to ${opts.max} short search FILTER TERMS (one or two words, lowercase) such that a Google search about that product would almost always CONTAIN one of them. Prefer the most distinctive word(s); avoid words every query in the ${opts.industry} industry contains (like "insurance" alone, "bank" alone, "best", "cost").

Products:
${opts.products.map((p, i) => `${i}\t${p}`).join('\n')}

Return ONLY JSON: {"terms":[{"i":0,"terms":["..."]}]}`;
  const resp: any = await client().messages.create({ model: MODEL, max_tokens: 600, temperature: 0, messages: [{ role: 'user', content: prompt }] });
  const json = firstJson((resp?.content ?? []).map((c: any) => c?.text ?? '').join(''));
  const out: Record<string, string[]> = {};
  for (const row of Array.isArray(json?.terms) ? json.terms : []) {
    const p = opts.products[Number(row?.i)]; if (!p) continue;
    const terms = (Array.isArray(row?.terms) ? row.terms : []).map((t: any) => String(t ?? '').toLowerCase().replace(/[^a-z0-9&' -]/g, '').trim())
      .filter((t: string) => t.length >= 3 && t.length <= 30).slice(0, opts.max);
    if (terms.length) out[p] = Array.from(new Set(terms));
  }
  // A product Claude returned nothing usable for falls back to its own name — a literal, not a guess.
  for (const p of opts.products) if (!out[p]) out[p] = [p.toLowerCase().trim()];
  return out;
}

/** Product scope: keep only keywords that are really about one of the named products. */
export async function assignToProducts(opts: { domain: string; industry: string; products: string[]; keywords: string[] }): Promise<ThemeAssignment> {
  const kws = opts.keywords;
  if (!kws.length) return { assignment: new Map(), notRelevant: 0, themeNames: [] };
  const prompt =
`Keywords below were pulled for ${opts.domain} (industry: ${opts.industry}). Assign each to ONE of these products, or to "skip" when the keyword is not really a search about that product as this business sells it (wrong meaning, a different industry, a brand, navigational).

Products:
${opts.products.map((p, i) => `P${i}\t${p}`).join('\n')}

Return ONLY JSON: {"assign":[{"p":0,"idx":[1,2]}],"skip":[0]}

Keywords:
${kws.map((k, i) => `${i}\t${k}`).join('\n')}`;
  const resp: any = await client().messages.create({ model: MODEL, max_tokens: 12000, temperature: 0, messages: [{ role: 'user', content: prompt }] });
  const json = firstJson((resp?.content ?? []).map((c: any) => c?.text ?? '').join(''));
  const assignment = new Map<string, string>(); const used = new Set<number>(); const names = new Set<string>();
  for (const row of Array.isArray(json?.assign) ? json.assign : []) {
    const p = opts.products[Number(row?.p)]; if (!p) continue;
    for (const raw of Array.isArray(row?.idx) ? row.idx : []) {
      const i = Number(raw);
      if (!Number.isInteger(i) || i < 0 || i >= kws.length || used.has(i)) continue;
      used.add(i); assignment.set(kws[i], p); names.add(p);
    }
  }
  return { assignment, notRelevant: kws.length - used.size, themeNames: Array.from(names) };
}
