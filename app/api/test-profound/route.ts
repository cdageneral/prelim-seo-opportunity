/**
 * GET /api/test-profound?domain=sonobello.com
 *
 * Diagnostic: fires one Profound API call and returns the raw result or error.
 * Visit this URL in the browser to confirm Profound connectivity without
 * needing to run a full analysis.
 *
 * Remove this file before going to production.
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const domain  = req.nextUrl.searchParams.get('domain') ?? 'example.com';
  const API_KEY = process.env.PROFOUND_API_KEY;
  const BASE_URL = process.env.PROFOUND_BASE_URL ?? 'https://api.profound.io/v1';

  const env = {
    PROFOUND_API_KEY:  !!process.env.PROFOUND_API_KEY,
    SEMRUSH_API_KEY:   !!process.env.SEMRUSH_API_KEY,
    SERP_API_KEY:      !!process.env.SERP_API_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  };

  if (!API_KEY) {
    return NextResponse.json({
      ok:    false,
      error: 'PROFOUND_API_KEY is not set in environment variables',
      env,
    });
  }

  const url = new URL(`${BASE_URL}/visibility/overview`);
  url.searchParams.set('domain', domain);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(20_000),
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type':  'application/json',
      },
    });

    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json({
        ok:         false,
        httpStatus: res.status,
        error:      text,
        url:        url.toString(),
        env,
      });
    }

    const data = JSON.parse(text);

    return NextResponse.json({
      ok:                 true,
      domain,
      overall_score:      data.overall_score ?? null,
      total_prompts:      data.total_prompts ?? null,
      platforms:          (data.platforms ?? []).map((p: any) => ({
        platform:      p.platform,
        score:         p.score,
        citation_rate: p.citation_rate,
      })),
      raw: data,
      env,
    });

  } catch (err: any) {
    return NextResponse.json({
      ok:    false,
      error: err?.message ?? String(err),
      url:   url.toString(),
      env,
    });
  }
}
