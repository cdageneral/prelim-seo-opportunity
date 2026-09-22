/**
 * lib/scout/input.ts — one validator for a Scout setup (v7.515).
 *
 * Used by POST /api/scout/runs (new run or saved draft) and PATCH /api/scout/runs/[id]
 * (editing a saved draft), so the two can never disagree about what a valid setup is.
 * Up to MAX_COMPETITORS (4, Wayne 2026-09-21); duplicates and the prospect itself are
 * dropped, and every domain must parse.
 */

import { z } from 'zod';
import { MAX_COMPETITORS, MAX_PRODUCTS, normDomain, isValidDomain, getIndustry } from './config';
import { getMarket } from '@/lib/utils/markets';
import type { RunInput } from './store';

export const RunBody = z.object({
  domain:      z.string().min(3).max(200),
  market:      z.string().max(4).optional(),
  industry:    z.string().max(40).optional(),
  scope:       z.enum(['domain', 'products']),
  products:    z.array(z.string().min(2).max(60)).max(MAX_PRODUCTS).optional().default([]),
  competitors: z.array(z.object({ domain: z.string().min(3).max(200), manual: z.boolean().optional().default(false) })).min(1).max(MAX_COMPETITORS, `Up to ${MAX_COMPETITORS} competitors per run.`),
  draft:       z.boolean().optional().default(false),
});

export type ParsedInput = { ok: true; input: RunInput; draft: boolean } | { ok: false; error: string };

export function parseRunInput(json: unknown): ParsedInput {
  const p = RunBody.safeParse(json);
  if (!p.success) {
    const issue = p.error.issues[0];
    if (issue?.path[0] === 'competitors' && issue.code === 'too_small') return { ok: false, error: 'Pick at least one competitor.' };
    return { ok: false, error: issue?.message ?? 'Invalid input' };
  }
  const domain = normDomain(p.data.domain);
  if (!isValidDomain(domain)) return { ok: false, error: `"${p.data.domain}" is not a domain.` };
  const seen = new Set<string>([domain]);
  const competitors: Array<{ domain: string; manual: boolean }> = [];
  for (const c of p.data.competitors) {
    const d = normDomain(c.domain);
    if (!isValidDomain(d)) return { ok: false, error: `"${c.domain}" is not a domain.` };
    if (seen.has(d)) continue;
    seen.add(d); competitors.push({ domain: d, manual: !!c.manual });
  }
  if (!competitors.length) return { ok: false, error: 'Pick at least one competitor.' };
  const products = p.data.scope === 'products' ? Array.from(new Set(p.data.products.map(s => s.trim()).filter(Boolean))) : [];
  if (p.data.scope === 'products' && !products.length) return { ok: false, error: 'Add at least one product, or switch to Full domain.' };
  return {
    ok: true, draft: p.data.draft,
    input: { domain, market: getMarket(p.data.market).code, industry: getIndustry(p.data.industry).key, scope: p.data.scope, products, competitors },
  };
}
