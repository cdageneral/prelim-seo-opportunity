/**
 * GET /api/test-serp?keyword=seo
 *
 * Quick diagnostic: fires one SerpAPI call and returns the raw result or error.
 * Visit this URL in the browser to confirm SerpAPI connectivity without
 * needing to run a full analysis.
 *
 * Remove this file before going to production.
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword') ?? 'seo agency';
  const API_KEY = process.env.SERP_API_KEY;

  if (!API_KEY) {
    return NextResponse.json({
      ok:    false,
      error: 'SERP_API_KEY is not set in environment variables',
      env:   {
        SERP_API_KEY:    !!process.env.SERP_API_KEY,
        SEMRUSH_API_KEY: !!process.env.SEMRUSH_API_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      },
    });
  }

  const params = new URLSearchParams({
    api_key: API_KEY,
    engine:  'google',
    q:       keyword,
    hl:      'en',
    gl:      'us',
    num:     '3',
  });

  try {
    const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
      signal: AbortSignal.timeout(20_000),
    });

    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json({
        ok:     false,
        status: res.status,
        error:  text,
        env:    {
          SERP_API_KEY:      !!process.env.SERP_API_KEY,
          SEMRUSH_API_KEY:   !!process.env.SEMRUSH_API_KEY,
          ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        },
      });
    }

    const data = JSON.parse(text);

    return NextResponse.json({
      ok:              true,
      keyword,
      hasAIO:          !!(data.ai_overview ?? data.answer_box_with_ai_overview),
      hasPAA:          (data.related_questions ?? []).length > 0,
      hasVideo:        !!(data.videos),
      organicResults:  (data.organic_results ?? []).length,
      serpFeatures:    Object.keys(data).filter(k =>
        ['ai_overview','answer_box','knowledge_graph','local_results',
         'shopping_results','videos','images_results'].includes(k)
      ),
      env: {
        SERP_API_KEY:      !!process.env.SERP_API_KEY,
        SEMRUSH_API_KEY:   !!process.env.SEMRUSH_API_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      },
    });

  } catch (err: any) {
    return NextResponse.json({
      ok:    false,
      error: err?.message ?? String(err),
      env:   {
        SERP_API_KEY:      !!process.env.SERP_API_KEY,
        SEMRUSH_API_KEY:   !!process.env.SEMRUSH_API_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      },
    });
  }
}
