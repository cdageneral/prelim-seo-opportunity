# v7.552 — Audience Segments: persona profile image download (2026-10-10)

Each segment card gets a third control, bottom-left beside the CSV download and copy pair: one click renders the
segment as a presentation-ready persona profile (Wayne's 2026-10-10 prompt + the segment's complete stored data)
through the OpenAI image API and downloads it as a JPG. Works for every segment on the card row (A, B, C — and D
when present), each with its own data.

- **One source of truth.** The prompt's "paste the complete segment data below this line" block is the SAME flattened
  row set the CSV and the clipboard copy read (`lib/audience/segmentRows.ts`, moved out of the panel and re-exported),
  plus the project's client name, website and industry so the journey title can name the product. The server reads
  the segment from the stored analysis the page is showing — the client sends only `{ segmentId, analysisId }`.
- **Canvas follows the model.** Primary `gpt-image-2` at a true 4:5 (1024×1280, the prompt as written); if the org is
  not verified for it (403/404), one fallback to `gpt-image-1` at its only portrait size, 1024×1536 (2:3), with the
  prompt's two canvas lines rebuilt to match. Key, quota and server errors are shown as-is — never retried on a second
  model. Quality `high`, JPEG straight from the API. Model/size/duration come back on `X-Orbit-*` headers.
- **Live progress (IV.2/IV.3).** While rendering, the control is a pill with a changing step label and elapsed seconds;
  once at least one render has been measured, "of ~Ns" is the median of the last 20 real renders from the usage ledger,
  with its basis in the tooltip. A failure shows the provider's real reason on the card and is itself the retry.
- **Ledger (I.5b).** Every render is one `openai/images` row under the model that actually rendered it, with measured
  duration, size, quality, the API's token counts (when reported) and the segment on meta. `openai/images` remains a
  DECLARED unpriced unit (re-dated 2026-10-10) — no per-image list price is on file for every size+quality pair.
- Prompt note: two copy artifacts of the source doc were normalised — every LAYOUT section was numbered "1." (now
  1–6) and "High-resolution PNG" reads "High-resolution image" (the download is a JPG). "4:5" is kept verbatim on the
  gpt-image-2 path. No reference image is sent; the VISUAL SYSTEM section describes it.
- II.6b: an export action, not a panel or metric — no PDF section; the retained suite proves no client-deliverable
  module imports the profile modules. II.9: named columns; segments read by jsonb path, no snapshot column loaded.
- Verified: tsc clean under the project tsconfig; real `next build` clean (route listed); retained suite A/B — 50
  pre-existing FAILs byte-identical on the pristine v7.551 base and on the change (zero delta), +79 new v7552 checks
  PASS (prompt/data parity, canvas rules, mocked fallback + ledger, route/registry source invariants, dual-theme
  interactive jsdom render incl. the live pill, ETA, download and error path).
- Files: components/brief/AudienceSegmentsSection.tsx, app/projects/[id]/page.tsx, lib/audience/segmentRows.ts (new),
  lib/audience/personaProfilePrompt.ts (new), lib/apis/personaProfileImage.ts (new),
  app/api/projects/[id]/persona-profile/route.ts (new), lib/usage/record.ts, lib/usage/pricing.ts, package.json.
- Env: uses the existing `OPENAI_API_KEY`. Optional `PERSONA_PROFILE_IMAGE_MODEL` pins the primary model.
