/**
 * Persona image generation — photoreal audience-segment portraits
 *
 * v7.149: For each audience segment produced by Phase-2 synthesis, generate a
 * single representative head-and-shoulders portrait with OpenAI gpt-image-1 and
 * store it in Vercel Blob. The resulting public URL is attached to the segment
 * as `personaImageUrl`; the UI renders it as the Option-A circular portrait.
 *
 * IMPORTANT — this is an ILLUSTRATIVE representation, not a real customer.
 * The image is derived only from the segment's own `whoTheyAre.demographics`
 * and `creativeDirection` text. The panel labels every portrait
 * "AI-generated" so it is never mistaken for measured/customer data.
 *
 * Fully fault-tolerant by design (matches the app's .catch-returns-data
 * pattern): if OPENAI_API_KEY or a Blob token is absent, or any single image
 * fails, the segments are returned unchanged and the analysis still completes.
 * Segments that already carry a `personaImageUrl` (e.g. from a resumed run)
 * are skipped so retries never re-spend on images.
 */

import { put } from '@vercel/blob';

const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';
const IMAGE_MODEL = 'gpt-image-1';
const IMAGE_SIZE = '1024x1024';

interface GenerateOpts {
  industry: string;
  clientName: string;
  /** Prefix for Blob filenames so a project's images are grouped + unique. */
  idPrefix: string;
}

/** True only when both an image provider key and a Blob write token exist. */
export function personaImagesEnabled(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY &&
    (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL),
  );
}

/**
 * Build a respectful, editorial portrait prompt from the segment's own fields.
 * Deliberately constrains the image to a neutral head-and-shoulders portrait and
 * excludes anything sensitive (no before/after, no medical/clinical or
 * body-exposure framing, no text, no logos) so the output stays defensible for
 * any industry, including health/cosmetic clients.
 */
function buildPrompt(segment: any, opts: GenerateOpts): string {
  const demographics = String(segment?.whoTheyAre?.demographics ?? '').slice(0, 600);
  const creative = String(segment?.creativeDirection ?? '').slice(0, 600);
  const name = String(segment?.name ?? 'audience segment').slice(0, 120);

  return [
    `A natural, photoreal editorial head-and-shoulders portrait of one person who represents this audience segment for a ${opts.industry} brand.`,
    `Segment archetype: "${name}".`,
    `Who they are: ${demographics}`,
    creative ? `Creative direction / mood: ${creative}` : '',
    'Style: authentic candid lifestyle photography, soft natural lighting, shallow depth of field, neutral or softly blurred everyday background, approachable confident expression, looking toward the camera.',
    'Framing: single person, head and shoulders, centered, room around the head.',
    'Avoid: any text, words, captions, watermarks, logos, brand marks; before/after comparisons; clinical, medical, surgical or hospital settings; exposed or partially-clothed bodies; collages or split frames; multiple people.',
  ].filter(Boolean).join(' ');
}

/** Generate + store one portrait. Returns the Blob URL, or null on any failure. */
async function generateOne(
  segment: any,
  index: number,
  opts: GenerateOpts,
): Promise<string | null> {
  try {
    const res = await fetch(OPENAI_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: buildPrompt(segment, opts),
        size: IMAGE_SIZE,
        n: 1,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[OrbitIQ] persona image ${index} failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
      return null;
    }

    const json: any = await res.json();
    const b64: string | undefined = json?.data?.[0]?.b64_json;
    if (!b64) {
      console.error(`[OrbitIQ] persona image ${index}: no image data returned`);
      return null;
    }

    const buffer = Buffer.from(b64, 'base64');
    const filename = `personas/${opts.idPrefix}-seg${index}-${Date.now()}.png`;
    const { url } = await put(filename, buffer, {
      access: 'public',
      contentType: 'image/png',
    });
    console.log(`[OrbitIQ] persona image ${index} stored: ${url}`);
    return url;
  } catch (err) {
    console.error(`[OrbitIQ] persona image ${index} error (non-fatal):`, (err as any)?.message ?? err);
    return null;
  }
}

/**
 * Attach `personaImageUrl` to each segment. Never throws — on any problem the
 * affected segment is returned unchanged. Generation runs in parallel across
 * segments (typically 3-4) to stay inside the synthesis time budget.
 */
export async function generatePersonaImages(
  segments: any[],
  opts: GenerateOpts,
): Promise<any[]> {
  if (!Array.isArray(segments) || segments.length === 0) return segments;

  if (!personaImagesEnabled()) {
    console.log('[OrbitIQ] persona images skipped — OPENAI_API_KEY and/or Blob token not configured.');
    return segments;
  }

  try {
    const results = await Promise.all(
      segments.map(async (seg, i) => {
        // Skip if a prior (resumed) run already produced an image.
        if (seg && typeof seg.personaImageUrl === 'string' && seg.personaImageUrl) {
          return seg;
        }
        const url = await generateOne(seg, i, opts);
        return url ? { ...seg, personaImageUrl: url } : seg;
      }),
    );
    const made = results.filter((s: any) => s?.personaImageUrl).length;
    console.log(`[OrbitIQ] persona images: ${made}/${segments.length} generated.`);
    return results;
  } catch (err) {
    console.error('[OrbitIQ] generatePersonaImages failed (non-fatal):', (err as any)?.message ?? err);
    return segments;
  }
}
