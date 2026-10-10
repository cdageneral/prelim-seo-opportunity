# v7.553 — Persona profile renders against Wayne's reference image (2026-10-10)

Follow-on to v7.552, same session. Wayne supplied the reference profile ("The Yield-Chasing Saver", 568×706 PNG) that
his prompt describes as "the reference"; it now travels with every render.

- **Edits endpoint, reference attached.** Every request is `POST /v1/images/edits` with the reference PNG as the input
  image (multipart), the same model plan (gpt-image-2 at 1024×1280 → gpt-image-1 at 1024×1536 on a model refusal only)
  and the same ledger row (meta now also carries `referenceVersion`).
- **Reference bundled, not fetched.** `lib/audience/personaProfileReference.ts` holds the PNG as base64 (byte-identical
  to the supplied file, proven in the suite) so the route's lambda always has it — no file tracing, no Blob dependency.
- **Prompt v2.** Two clauses added to Wayne's text: the GOAL line names the attached image as the reference ("a different
  segment's finished profile; reuse its design system, not its content") and VISUAL SYSTEM reads "Match the attached
  reference image's". Nothing else changed.
- Verified: tsc clean; real `next build` clean; v7552 block updated with a dated note for the multipart request — all
  checks PASS incl. the attached reference decoding as the 568×706 PNG.
- Files: lib/audience/personaProfileReference.ts (new), lib/apis/personaProfileImage.ts, lib/audience/personaProfilePrompt.ts, package.json.
