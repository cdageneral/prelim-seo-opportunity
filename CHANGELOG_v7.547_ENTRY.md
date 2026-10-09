# v7.547 — AI Answer Engines prompt data connected to Product Insights pages (2026-10-09)

Wayne: "i want to be able to connect the prompt data from the ai answer panel to the individual pages and have it show
up in the product insight panel." Mockup `GEO/orbitiq-mockup-profound-page-link-2026-10-09.html` approved ("great build
the prompt connection").

- **Join key = the owned URL in Profound's `citation_N` columns.** At upload the AI Answer Engines panel's visibility pass
  now also builds a BOUNDED link store — one row per distinct prompt: answers per engine, Profound's `mentioned?` flag,
  owned citation paths (engine tracking params such as `utm_source=chatgpt.com` stripped), third-party domains cited —
  saved to its own `projects.profound_page_links` column (`/api/projects/[id]/profound-links`; ensured in the list +
  [id] routes; the project GET never loads it). Owned paths use the SAME `normContentUrl` identity the v7.541 clusters
  use. The panel's metrics are byte-identical; existing callers of `computeAll` are untouched.
- **Lane 1 · measured.** A prompt attaches to the topic whose ranking page an answer cited. One home per prompt; a page
  shared by two topics is counted on its owner and the other topic says CITED (on <owner>). Owned URLs no topic owns are
  listed as unmapped, never dropped, and their prompts are never filed as named/absent.
- **Lane 2 · assigned.** `POST /profound-links/assign` files the prompts into the stored taxonomy with the existing
  filer model (lib/profound/promptFiler.ts — product nodes only, hidden/excluded categories dropped by the shared guard,
  never a new node), storing the model's own confidence; under 0.6 → REVIEW. Status GET reads the store only. Every call
  goes through the usage ledger. An export with no `mentioned?` column reports FILED (mention unknown), never ABSENT.
- **Product Insights:** `AI PROMPTS · PROFOUND` column on every topic row (CITED / NAMED / ABSENT / FILED / REVIEW +
  engine dots), a prompt drawer per topic (engines, who was cited instead, assignment + confidence, TSV download), and a
  card under the KPI tiles with the upload state (no upload / re-upload needed / ready), the filing control with live
  progress + ETA (IV.2), and the two gap views: prompts with no page to answer them, pages that rank but are never cited.
  Measured and assigned figures are never added together; every surface carries its basis line.
- **PDF (II.6b):** new page "AI prompts - which pages the answers cite" (by line, distinct pages / distinct prompts; the two
  gap tables; caps and the unfiled state disclosed) off the same joiner (lib/profound/pageLinks.ts).
- Existing projects: the stored metrics carry no prompt → URL rows, so Product Insights says "re-upload to link" until
  the Responses file is dropped again in AI Answer Engines. No silent backfill.
- II.9: new column named everywhere it is read; `?sizes=1` measures it. I.5b: filer calls instrumented. Independent
  review (20 findings) applied: scope inputs for the guard, refile by offset, tracking params, unknown-mention bucket,
  cited-unmapped prompts, shared-page owner, distinct per-line counts, status GET without the snapshot, theme tokens,
  failed-save notice.
- Verified: project tsc + `next build` clean; retained suite 3,015 PASS / 48 FAIL (identical pre-existing set; +126
  v7.547 checks: accumulator, caps, join, gaps, filer prompt/parser, the real computeAll on a fixture CSV, wiring, PDF;
  jsdom render of Product Insights in both themes × 3 states); real-Chromium render both themes at 1100/1300 px.
- Files: lib/profound/pageLinks.ts (new), lib/profound/promptFiler.ts (new), components/brief/ProfoundPromptLinks.tsx
  (new), app/api/projects/[id]/profound-links/route.ts (new), app/api/projects/[id]/profound-links/assign/route.ts (new),
  components/brief/ProductInsightsSection.tsx, components/brief/ProfoundVisibilitySection.tsx, app/projects/[id]/page.tsx,
  app/api/projects/route.ts, app/api/projects/[id]/route.ts, app/api/reports/pdf/route.ts, lib/pdf/assessmentTemplate.ts,
  db/schema.ts, package.json.
