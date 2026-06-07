/**
 * Persona image generation — photoreal audience-segment portraits
 *
 * v7.149: For each audience segment produced by Phase-2 synthesis, generate a
 * single representative head-and-shoulders portrait with OpenAI gpt-image-1 and
 * store it in Vercel Blob. The resulting public URL is attached to the segment
 * as `personaImageUrl`; the UI renders it as the Option-A circular portrait.
 *
 * v7.150: the run now also returns a short DIAGNOSTIC `status` string so the
 * panel can show exactly why portraits are (or aren't) present — e.g.
 * "skipped: OPENAI_API_KEY not set", "openai HTTP 403 (org likely not verified
 * for gpt-image-1)", "blob error: ...", or "3/3 generated". This makes the
 * common failure modes visible instead of silently falling back to initials.
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

export interface PersonaImageResult {
  segments: any[];
  /** Human-readable diagnostic shown on the panel + in logs. */
  status: string;
}

/** Returns the list of missing prerequisites (empty list = enabled). */
function missingPrereqs(): string[] {
  const missing: string[] = [];
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL) missing.push('BLOB_READ_WRITE_TOKEN');
  return missing;
}

/** True only when both an image provider key and a Blob write token exist. */
export function personaImagesEnabled(): boolean {
  return missingPrereqs().length === 0;
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

interface OneResult { url: string | null; error: string | null }

/** Generate + store one portrait. Returns { url } or { error } (never throws). */
async function generateOne(
  segment: any,
  index: number,
  opts: GenerateOpts,
): Promise<OneResult> {
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
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      // gpt-image-1 returns 403 when the OpenAI org is not verified for the model.
      const hint = res.status === 403 ? ' (org likely not verified for gpt-image-1)'
                 : res.status === 401 ? ' (bad/blocked OPENAI_API_KEY)'
                 : '';
      const error = `openai HTTP ${res.status}${hint}: ${detail}`;
      console.error(`[OrbitIQ] persona image ${index} failed: ${error}`);
      return { url: null, error };
    }

    const json: any = await res.json();
    const b64: string | undefined = json?.data?.[0]?.b64_json;
    if (!b64) {
      const error = 'openai returned no image data';
      console.error(`[OrbitIQ] persona image ${index}: ${error}`);
      return { url: null, error };
    }

    const buffer = Buffer.from(b64, 'base64');
    const filename = `personas/${opts.idPrefix}-seg${index}-${Date.now()}.png`;
    try {
      const { url } = await put(filename, buffer, {
        access: 'public',
        contentType: 'image/png',
      });
      console.log(`[OrbitIQ] persona image ${index} stored: ${url}`);
      return { url, error: null };
    } catch (blobErr) {
      const error = `blob error: ${(blobErr as any)?.message ?? blobErr}`;
      console.error(`[OrbitIQ] persona image ${index} ${error}`);
      return { url: null, error };
    }
  } catch (err) {
    const error = `network error: ${(err as any)?.message ?? err}`;
    console.error(`[OrbitIQ] persona image ${index} ${error} (non-fatal)`);
    return { url: null, error };
  }
}

/**
 * Attach `personaImageUrl` to each segment and report a diagnostic `status`.
 * Never throws — on any problem the affected segment is returned unchanged.
 * Generation runs in parallel across segments (typically 3-4) to stay inside
 * the synthesis time budget.
 */
export async function generatePersonaImages(
  segments: any[],
  opts: GenerateOpts,
): Promise<PersonaImageResult> {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { segments, status: 'no segments' };
  }

  const missing = missingPrereqs();
  if (missing.length > 0) {
    const status = `skipped: ${missing.join(' + ')} not set`;
    console.log(`[OrbitIQ] persona images ${status}`);
    return { segments, status };
  }

  try {
    let firstError: string | null = null;
    const out = await Promise.all(
      segments.map(async (seg, i) => {
        // Skip if a prior (resumed) run already produced an image.
        if (seg && typeof seg.personaImageUrl === 'string' && seg.personaImageUrl) {
          return seg;
        }
        const { url, error } = await generateOne(seg, i, opts);
        if (!url && error && !firstError) firstError = error;
        return url ? { ...seg, personaImageUrl: url } : seg;
      }),
    );
    const made = out.filter((s: any) => s?.personaImageUrl).length;
    let status = `${made}/${segments.length} generated`;
    if (made < segments.length && firstError) status += ` · first error: ${firstError}`;
    console.log(`[OrbitIQ] persona images: ${status}`);
    return { segments: out, status };
  } catch (err) {
    const status = `failed: ${(err as any)?.message ?? err}`;
    console.error(`[OrbitIQ] generatePersonaImages ${status} (non-fatal)`);
    return { segments, status };
  }
}
