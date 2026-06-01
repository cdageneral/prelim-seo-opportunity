/**
 * GET /api/test-profound
 *
 * Diagnostic: pings the real Profound API (api.tryprofound.com) to confirm
 * the API key is valid and the account is accessible. Returns the list of
 * configured categories (or a clear error) without needing a full analysis.
 *
 * Remove this file before going to production.
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const REAL_BASE_URL = 'https://api.tryprofound.com/v1';

export async function GET(_req: NextRequest) {
  const API_KEY = process.env.PROFOUND_API_KEY;

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

  // Hit /v1/org/categories — requires no category_id, so it's a clean auth test
  const url = `${REAL_BASE_URL}/org/categories`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'X-API-Key':     API_KEY,
        'Content-Type':  'application/json',
      },
    });

    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json({
        ok:         false,
        httpStatus: res.status,
        error:      text,
        note:       res.status === 401 ? 'API key is invalid or expired' :
                    res.status === 403 ? 'API key has no access — contact Profound support' :
                    'Unexpected error from Profound API',
        url,
        env,
      });
    }

    const data = JSON.parse(text);

    return NextResponse.json({
      ok:         true,
      note:       'API key is valid. Categories below — use category IDs to pull visibility data.',
      categories: data,
      url,
      env,
    });

  } catch (err: any) {
    return NextResponse.json({
      ok:    false,
      error: err?.message ?? String(err),
      note:  'Network error — check that api.tryprofound.com is reachable from Vercel',
      url,
      env,
    });
  }
}
