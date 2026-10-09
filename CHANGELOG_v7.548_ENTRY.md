# v7.548 — AI prompts on every page in the category structure (2026-10-09)

Wayne, on the live v7.547: "its not of great value. I need the prompts mapped to an individual page below in the category
structure." Two causes on Citi (Cards): the link store took only Profound's strict 'Visibility' type (82 prompts of 1,066),
and 15 of the cited prompts cite Citi pages that hold no keyword rank, so no topic owned them.

- **Full prompt set.** The store now takes every visibility-typed answer (the broad set the panel's prompt count uses) —
  1,066 prompts on Citi (Cards), labelled "visibility-typed answers". Re-upload the Responses file once more.
- **Un-pooled pages.** A prompt whose answers cite an owned page that is no topic's ranking page lands on its FILED topic as
  CITED, with that page named "(page not in ranking pool)" — the answer did cite the client. Unfiled ones stay disclosed.
- **Sub-category drill:** every level row carries an AI PROMPTS · PROFOUND cell (one count per prompt, rolled up from the
  topics at and beneath it — `summarizeTopics`, cited wins, pages unioned) and opening the row shows the prompt drawer
  above its keywords. Topic rows unchanged.
- Copilot's `msockid` and other engine tracking keys (ef_id, _ga, s_cid, ncid, mkwid…) stripped on the citation side.
- Verified: tsc + `next build` clean; suite 3,024 PASS / 48 FAIL (identical set; v7547 checks extended: msockid, un-pooled
  filing, node summary dedupe, node cells + node drawer in jsdom both themes); Chromium render both themes 1100/1300.
- Files: lib/profound/pageLinks.ts, components/brief/ProfoundPromptLinks.tsx, components/brief/ProductInsightsSection.tsx,
  components/brief/ProfoundVisibilitySection.tsx, package.json.
