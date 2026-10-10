/**
 * Persona profile image — one presentation-ready profile card per audience
 * segment, rendered by OpenAI's image API from Wayne's prompt + the segment's
 * own data (v7.552). Sibling of lib/apis/personaImage.ts (the v7.149 circular
 * portrait); same fault-tolerant shape: never throws, returns { bytes } or
 * { error } with the provider's real reason.
 *
 * Model plan (one request, one fallback):
 *   1. PRIMARY  — PERSONA_PROFILE_IMAGE_MODEL (default gpt-image-2) at a TRUE
 *      4:5 canvas (1024x1280): the GPT-image-2 generation accepts custom
 *      WIDTHxHEIGHT sizes, so the prompt's "vertical 4:5" is honoured as written.
 *   2. FALLBACK — gpt-image-1 at 1024x1536 (its only portrait size, 2:3) when
 *      the primary is refused for a MODEL reason (403 org not verified for the
 *      model / 404 model not found / "model" in the error) — the org is already
 *      verified for gpt-image-1 (v7.149 portraits). The prompt's canvas lines
 *      are rebuilt for 2:3 so the model is never told to fill a shape it was
 *      not given. Any other failure (401, 429, 5xx, network) is returned as-is;
 *      a billing or key problem must not be retried on a second model.
 *
 * Every successful call is written to the usage ledger as 1 image under the
 * model that ACTUALLY rendered it, with the measured wall-clock duration and
 * the API's token usage (when it reports one) on meta — real figures, never a
 * guess (Const I.1). openai/images is a DECLARED unpriced unit (I.5b, see
 * lib/usage/pricing.ts), so the row counts without alarming the cost panel.
 *
 * Quality is fixed at "high": the profile is a dense, text-heavy layout and
 * lower tiers render small type illegibly, which the prompt forbids.
 */

import { recordOpenAIImages } from '@/lib/usage/record';
import { type ProfileCanvas } from '@/lib/audience/personaProfilePrompt';

const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';

export const PROFILE_PRIMARY_MODEL_DEFAULT = 'gpt-image-2';
export const PROFILE_FALLBACK_MODEL = 'gpt-image-1';
export const PROFILE_QUALITY = 'high';
export const PROFILE_OUTPUT_FORMAT = 'jpeg';

/** gpt-image-1 only ships fixed sizes; its portrait is 2:3. Newer models take a true 4:5. */
export function canvasForModel(model: string): ProfileCanvas {
  return /^gpt-image-1(-|$)/i.test(model)
    ? { aspect: '2:3', size: '1024x1536' }
    : { aspect: '4:5', size: '1024x1280' };
}

export function primaryProfileModel(): string {
  const m = (process.env.PERSONA_PROFILE_IMAGE_MODEL ?? '').trim();
  return m || PROFILE_PRIMARY_MODEL_DEFAULT;
}

export interface ProfileImageOk {
  bytes: Buffer;
  model: string;
  size: string;
  quality: string;
  durationMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
  /** Set when the primary model was refused and the fallback rendered the image. */
  fallbackFrom: string | null;
  error: null;
}
export interface ProfileImageErr { bytes: null; error: string; status: number }
export type ProfileImageResult = ProfileImageOk | ProfileImageErr;

type AttemptResult =
  | { ok: true; b64: string; usage: any }
  | { ok: false; status: number; error: string; modelRefused: boolean };

/**
 * Decide whether a refusal is about the MODEL (fall back) or about something
 * the fallback would hit too (do not). Exported for the retained suite.
 */
export function isModelRefusal(status: number, detail: string): boolean {
  if (status === 404) return true;                       // unknown model id
  if (status === 403) return true;                       // org not verified for this model
  if (status === 400 && /model/i.test(detail)) return true;  // "invalid model" / "does not support"
  return false;
}

async function attempt(model: string, prompt: string, size: string, key: string): Promise<AttemptResult> {
  const res = await fetch(OPENAI_IMAGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      prompt,
      size,
      quality: PROFILE_QUALITY,
      output_format: PROFILE_OUTPUT_FORMAT,
      n: 1,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 400);
    const hint = res.status === 403 ? ` (org not verified for ${model})`
               : res.status === 401 ? ' (bad/blocked OPENAI_API_KEY)'
               : res.status === 429 ? ' (rate limit or quota)'
               : '';
    return { ok: false, status: res.status, error: `openai ${model} HTTP ${res.status}${hint}: ${detail}`, modelRefused: isModelRefusal(res.status, detail) };
  }
  const json: any = await res.json().catch(() => null);
  const b64: string | undefined = json?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, status: 502, error: `openai ${model} returned no image data`, modelRefused: false };
  return { ok: true, b64, usage: json?.usage ?? null };
}

/**
 * Render one profile. `promptFor(canvas)` is called per attempt so the prompt's
 * canvas lines always match the size actually requested.
 */
export async function generatePersonaProfileImage(
  promptFor: (canvas: ProfileCanvas) => string,
  opts: { ledgerMeta?: Record<string, unknown> } = {},
): Promise<ProfileImageResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { bytes: null, error: 'OPENAI_API_KEY not set — persona profiles need the OpenAI image API', status: 503 };

  const primary = primaryProfileModel();
  const plan: string[] = primary === PROFILE_FALLBACK_MODEL ? [primary] : [primary, PROFILE_FALLBACK_MODEL];
  const t0 = Date.now();
  let lastErr: { status: number; error: string } | null = null;
  let fallbackFrom: string | null = null;

  for (let i = 0; i < plan.length; i++) {
    const model = plan[i];
    const canvas = canvasForModel(model);
    let r: AttemptResult;
    try {
      r = await attempt(model, promptFor(canvas), canvas.size, key);
    } catch (err) {
      lastErr = { status: 502, error: `network error: ${(err as any)?.message ?? err}` };
      break;   // a network failure is not a model refusal — do not try the next model
    }
    if (r.ok) {
      const durationMs = Date.now() - t0;
      const usage = {
        inputTokens:  Number.isFinite(r.usage?.input_tokens)  ? Number(r.usage.input_tokens)  : null,
        outputTokens: Number.isFinite(r.usage?.output_tokens) ? Number(r.usage.output_tokens) : null,
      };
      await recordOpenAIImages(1, model, undefined, {
        feature: 'persona-profile',
        size: canvas.size,
        quality: PROFILE_QUALITY,
        durationMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        fallbackFrom,
        ...(opts.ledgerMeta ?? {}),
      });
      console.log(`[OrbitIQ] persona profile rendered by ${model} (${canvas.size}, ${durationMs} ms${fallbackFrom ? `, fallback from ${fallbackFrom}` : ''})`);
      return { bytes: Buffer.from(r.b64, 'base64'), model, size: canvas.size, quality: PROFILE_QUALITY, durationMs, usage, fallbackFrom, error: null };
    }
    lastErr = { status: r.status, error: r.error };
    console.error(`[OrbitIQ] persona profile ${model} failed: ${r.error}`);
    if (!r.modelRefused || i === plan.length - 1) break;
    fallbackFrom = model;
  }
  return { bytes: null, error: lastErr?.error ?? 'persona profile failed', status: lastErr?.status ?? 502 };
}
