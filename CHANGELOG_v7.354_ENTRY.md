# v7.354 — Push to Brief Agent goes live: Word briefs, zipped per audience segment

**2026-07-06 · Content Plan brief bundle (Const I.1, I.3, II.7, IV.2, V.6)**

## What was asked
Wayne: activate the Content Plan's "Push to Brief Agent" button. Clicking it
should download a zip bundle — one zip per audience segment, and inside each,
an individual Word doc per content article. Each doc must carry the segment
it's for, the product category and its architectural structure (parent
category and sub-categories), everything the article drawer shows, the
distance to conversion, the priority bucket, the existing URL when there is
one, the action (optimise existing vs net-new build), the volume, the rank
position, the keywords and whether competitors rank on them, and whether the
topic sits in the product or pre-product journey.

## What shipped

**The button works.** "Push to Brief Agent" now builds the bundle client-side
and downloads `<client>-content-briefs.zip`. Inside: one
`segment-a-<name>.zip` per audience segment; inside each of those, one
numbered `.docx` per article (volume-ordered). Segment membership is the same
v7.353 lens attribution the Journey panel stores (Const II.7), and Shared
articles ride into every segment's zip (Wayne's standing call) — each one
labeled "shared" inside the doc so nothing double-counts silently (I.3). With
no audience segments on the analysis, the docs sit at the bundle root (honest
fallback, I.5).

**What each Word doc carries** — every figure an exact value from the
canonical pool (I.1):

- Audience segment (with the shared note where applicable)
- Where this sits: product category, parent theme, page topic, the full
  category path, journey (product vs pre-product), funnel stage, distance to
  conversion (label + 1–4), priority bucket, quick-win / refresh flags
- Action: optimise existing page vs build net-new (competitor-backed noted),
  the mapped existing URL, your best real rank, topic monthly volume, the
  volume you already capture (+ coverage %), keyword and prompt counts
- Competitive insight (same copy as the drawer)
- The suggested article title, outline H2s and People-Also-Ask questions
  (labeled as suggestions — editorial scaffolding, not data)
- A target-keyword table over the FULL canonical keyword set: keyword, real
  Semrush volume, your real position, and the competitor ranking on it when
  it's a gap
- Internal links and SERP feature targets

**Progress + honesty (IV.2 / I.5).** While building, the button shows real
"Building briefs… X of N"; success shows a green confirmation of what
downloaded; failure shows an honest red error strip. The docx/jszip code is
dynamic-imported so the page's initial bundle doesn't grow.

**Dependencies.** Adds `docx` (^9.7.1) and `jszip` (^3.10.1);
`package-lock.json` updated in the same commit.

## Verification (Const V)
Real-project `tsc --noEmit` clean on the live clone (V.1a). Retained suite
A/B vs pristine v7.353 base: retained delta ZERO; 289 PASS including 19 new
v7.354 checks that build a real bundle in Node, unzip outer → segment zips →
docx → `word/document.xml`, and assert every required field (segment,
architecture, journey/stage, distance, priority, action + URL, rank, volume,
competitor-gap keyword rows, title/outline/PAA/SERP/links, shared labeling),
plus wiring checks (dynamic import, stub removed, X-of-N progress, both-theme
error tokens). The only FAILs remain the 13 known pre-existing esbuild-alias
harness artifacts, identical on base.

## Files
- `lib/export/briefExport.ts` — NEW: docx builder + per-segment zip bundle.
- `components/brief/ContentPlanSection.tsx` — button wired with real progress,
  success and error states.
- `package.json` / `package-lock.json` — 7.354.0 + docx & jszip.
