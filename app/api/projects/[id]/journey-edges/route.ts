/**
 * POST /api/projects/[id]/journey-edges
 *
 * v7.152 — Audience Journey mind map.
 * Infers the natural "next-topic" progression between theme clusters so the
 * Journey panel can draw a mind map of how a searcher moves from one topic
 * cluster to the next. The EDGES are AI-inferred (Claude haiku judgment), not
 * measured SEO data — the panel labels them as such. Node coverage state
 * (existing / missing / competitor) is NOT decided here; it comes from the
 * deterministic buildClusters logic on the client.
 *
 * Body:  { clusters: { name: string; stage: string; lane: 'pre-product'|'product' }[],
 *          industry: string, domain: string }
 * Returns: { edges: { preProduct: [string,string][]; product: [string,string][] } }
 *
 * Mirrors the /clusters intent route: Claude haiku, fault-tolerant, results
 * cached client-side in localStorage. On any failure returns empty edges and
 * the panel falls back to a deterministic funnel-stage ordering.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { setUsageProject } from '@/lib/usage/context';
import { instrumentAnthropic } from '@/lib/usage/record';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
  return instrumentAnthropic(new Anthropic({ apiKey }));   // v7.225: auto-record token usage
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

type Lane = 'pre-product' | 'product';
interface ClusterIn { name: string; stage: string; lane: Lane }
type EdgeList = [string, string][];

const EMPTY = { edges: { preProduct: [] as EdgeList, product: [] as EdgeList } };

function validateEdges(raw: unknown, names: Set<string>): EdgeList {
  if (!Array.isArray(raw)) return [];
  const out: EdgeList = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (!Array.isArray(e) || e.length < 2) continue;
    const a = String(e[0]);
    const b = String(e[1]);
    if (a === b) continue;                 // no self-loops
    if (!names.has(a) || !names.has(b)) continue;  // only known clusters
    const key = `${a}>>${b}`;
    if (seen.has(key)) continue;           // dedup
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

export async function POST(
  req: NextRequest,
  _ctx: { params: { id: string } }
) {
  setUsageProject(_ctx.params.id);   // v7.225: attribute Claude usage to this project
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { clusters, industry, domain } = body as {
    clusters: ClusterIn[];
    industry: string;
    domain:   string;
  };

  if (!clusters?.length) return NextResponse.json(EMPTY);

  const pre  = clusters.filter(c => c.lane === 'pre-product');
  const prod = clusters.filter(c => c.lane === 'product');
  const preNames  = new Set(pre.map(c => c.name));
  const prodNames = new Set(prod.map(c => c.name));

  const fmtList = (arr: ClusterIn[]) =>
    arr.map((c, i) => `${i + 1}. "${c.name}" (funnel stage: ${c.stage})`).join('\n');

  const prompt = `You are mapping the topical customer journey for a ${industry} website (${domain}).

Below are topic clusters in two journeys:
- PRE-PRODUCT: the searcher has a life problem but does NOT yet know the product/service exists.
- PRODUCT: the searcher knows the category and is evaluating options across the funnel (awareness -> consideration -> decision -> retention).

For EACH journey, infer the natural "next topic" progression: directed edges [from, to] where a person researching the "from" topic would naturally move on to the "to" topic next. A topic may branch to several next topics, and several topics may lead into one. Generally move forward through the funnel (awareness -> consideration -> decision -> retention), but same-stage links are allowed when one topic naturally leads to another. Do not invent topics — only use the exact cluster names given.

PRE-PRODUCT CLUSTERS:
${fmtList(pre) || '(none)'}

PRODUCT CLUSTERS:
${fmtList(prod) || '(none)'}

Return JSON only — no markdown, no explanation. Use the cluster names exactly as written:
{
  "preProduct": [["from cluster name","to cluster name"], ["...","..."]],
  "product":    [["from cluster name","to cluster name"], ["...","..."]]
}`;

  try {
    const response = await getClient().messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages:   [{ role: 'user', content: prompt }],
    }, { timeout: 30_000 });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const parsed = extractJSON<{ preProduct?: unknown; product?: unknown }>(text);

    return NextResponse.json({
      edges: {
        preProduct: validateEdges(parsed.preProduct, preNames),
        product:    validateEdges(parsed.product, prodNames),
      },
    });
  } catch (err) {
    console.error('[OrbitIQ] Journey edge inference failed:', err);
    return NextResponse.json(EMPTY);  // panel falls back to stage-order edges
  }
}
