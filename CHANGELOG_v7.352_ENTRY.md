# v7.352 — Audience panel: per-segment CSV download + copy to clipboard

**2026-07-06 · Audience Segments export (Const II.7, IV.6, V.5, V.6)**

## What was asked
Wayne: add a CSV download and a copy-to-clipboard icon to each audience
segment card in the Audience Segments panel; the CSV must contain ALL
information for the segment.

## What shipped
Two small icon buttons on the bottom-right of every segment summary card
(Segment A / B / C …):

- **Download (⬇)** — downloads `audience-segment-a-<name>.csv`, a
  `Field,Value` CSV carrying every field the panel renders for that segment:
  label, name, tagline, share of volume, YoY growth, demographics, trigger,
  influencer/gatekeeper role, every pre-product LLM prompt, every
  product-stage search prompt, every touchpoint (stage + description),
  messaging & tone, creative & imagery direction, and channel approach.
  RFC-4180 escaping (quoted commas/quotes/newlines), CRLF line ends, UTF-8
  BOM so Excel opens it cleanly.
- **Copy (⧉)** — puts the same complete profile on the clipboard as labeled
  `Field: value` lines (paste-ready for docs/email). The icon flips to a ✓
  for 1.6s on success; falls back to the legacy execCommand path on browsers
  without the async clipboard API.

Both exports read ONE shared row-builder (`buildSegmentRows`), so the CSV,
the clipboard text, and the on-screen panel can never drift apart (Const
II.7 in miniature). Values are exported exactly as rendered — no
reformatting (Const I.1).

## Implementation notes
- The icons are SIBLINGS of the card `<button>` inside a shared relative
  wrapper — never nested inside it (nested interactive elements are invalid
  HTML and break hydration). Card buttons gained `pb-12` to reserve the
  bottom strip; the v7.216 neck connector still measures the same button
  geometry.
- Styling uses theme tokens only (`border-orbit-border bg-orbit-surface
  text-orbit-secondary`) — legible in both light and dark (Const IV.6),
  asserted by the dual-theme harness render (V.5).

## Verification (Const V)
- Isolated `tsc` mirroring the project tsconfig verbatim (no `target`
  override, V.1a): PASS.
- Retained regression suite: 245 PASS incl. 17 new v7.352 checks (row
  completeness, RFC-4180 escaping, CSV/clipboard/filename, sibling-not-nested
  DOM, theme-token parity, real click → file + clipboard end-to-end in
  jsdom, dark AND light renders). A/B vs pristine v7.351 base: ZERO delta.
- Suite hygiene (V.6): 4 stale checks from v7.347/v7.351 by-design changes
  updated with dated notes (2026-07-06); the remaining known esbuild-alias
  harness artifact (`@/lib/category/scopeModel`) fails identically on base —
  documented, not a regression.

**Files:** components/brief/AudienceSegmentsSection.tsx · package.json · CHANGELOG_v7.352_ENTRY.md
