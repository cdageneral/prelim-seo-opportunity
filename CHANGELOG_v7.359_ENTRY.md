# v7.359 — Inline priority move on the Content Map row (2026-07-07)

## What Wayne asked
Keep the drawer's Move-to-priority control (v7.358) but also surface it inline on each Content Map row, in the open space beside the topic.

## What shipped
- Every content-mode row now renders a compact **Move · P0 P1 P2 P3** control in the topic cell's open space (a flex wrapper puts the topic text on the left and the control on the right).
- Click a tier → reassigns the topic instantly (optimistic), persisted via the same DB-backed override as the drawer (v7.358 `onMovePriority`).
- Clicking the current tier when it's already a **manual** move resets it to auto (`onMovePriority(id, null)`); otherwise it sets the override. The active tier is highlighted in its priority colour; the row keeps the ✎ manual marker.
- Content-Map-only: the control renders only where `onMovePriority` is wired (ContentMapSection). Content Plan / Scope rows are unchanged.
- The drawer control stays for the full topic view — both call the one shared handler (Const II.7).

## Files
`components/brief/ContentPlanSection.tsx` (Row gains the inline control + `onMovePriority` prop, threaded from renderRow) · `package.json` / `package-lock.json` (7.359.0).

## Verification
- **Full-project `npx tsc --noEmit`** on the live-repo clone with real deps → CLEAN.
- **SSR render**: content-mode rows render the inline "Move" control; plan-mode rows render none; the ✎ manual marker is intact.
