/**
 * pageMeta (v7.364) — server-side page <h1> extraction for the Brief Agent export.
 *
 * The Content-Plan "Push to Brief Agent" Excel export lists, per competitor page,
 * the page's real H1 (Const I.1 — real data only; never fabricated). We fetch the
 * competitor URL server-side (CORS makes this impossible in the browser) and read
 * the FIRST <h1> from the returned HTML. Everything here is fault-tolerant: a fetch
 * that times out, 4xx/5xxs, or returns no <h1> yields an empty string, which the
 * export renders as a blank H1 line — an honest gap (Const I.5), never a guess.
 *
 * No headless browser: a plain fetch + a tag-stripping regex is enough for the H1
 * and keeps the route well under the Vercel function budget. Bounded concurrency +
 * a per-URL timeout keep a large plan from stalling the enrichment call.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 OrbitIQ-BriefAgent/1.0';

const PER_URL_TIMEOUT_MS = 8000;
const MAX_CONCURRENCY     = 6;
const MAX_HTML_BYTES      = 600_000;   // read at most ~600 KB — the <h1> is near the top

// Decode the handful of HTML entities that actually show up in headings, so the
// stored H1 reads as text, not markup. Anything else is left verbatim (real data).
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Pull the inner text of the first <h1> in an HTML string; '' if none. */
export function extractFirstH1(html: string): string {
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m) return '';
  const inner = m[1]
    .replace(/<[^>]+>/g, ' ')   // strip nested tags (spans, <br>, etc.)
    .replace(/\s+/g, ' ')
    .trim();
  return decodeEntities(inner).slice(0, 300);
}

async function fetchOneH1(url: string): Promise<string> {
  if (!url) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_URL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal:   ctrl.signal,
      headers:  { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    });
    if (!res.ok || !res.body) return '';
    const ct = res.headers.get('content-type') ?? '';
    if (ct && !/html/i.test(ct)) return '';   // non-HTML (PDF, image) → no H1
    // Read a bounded prefix — the <h1> is almost always in the first screenful,
    // and this caps memory/time on huge pages.
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf).subarray(0, MAX_HTML_BYTES);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return extractFirstH1(html);
  } catch {
    return '';   // timeout / DNS / TLS / abort → honest blank (Const I.5)
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the first <h1> for each distinct URL, bounded concurrency. Returns a
 * Map url → h1 (missing/failed URLs map to ''). Input order is irrelevant; the
 * caller looks results up by URL.
 */
export async function fetchH1s(urls: string[]): Promise<Map<string, string>> {
  const distinct = Array.from(new Set(urls.filter((u) => typeof u === 'string' && u.trim().length > 0)));
  const out = new Map<string, string>();
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= distinct.length) return;
      const u = distinct[i];
      out.set(u, await fetchOneH1(u));
    }
  }

  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, distinct.length); i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}
