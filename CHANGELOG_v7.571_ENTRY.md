# v7.571 — Carry forward: keywords waiting to be filed don't vote; the changes are listed (2026-10-20)

Found while previewing the v7.570 carry on live Citi (travel cards). The preview read 51 keywords as in scope before, but the pool had shown 25. The other 26 were keywords the pool held for filing: under a brand node or category (v7.566), or dropped on a parent by the old filer (v7.567). The carry counted them as in, which skewed 30 majority votes.

- `keywordScope` now applies the pool's full hold rule: brand path or category, plus the v7.567 coarse-filed stamp read from `filerVersion`. A held keyword had no category choice, so it doesn't vote; it follows its new category. The "before" count is now what the pool actually showed.
- The preview reports separately the held keywords that land in scope, and only counts real flips as "change side".
- The Step 2 banner lists every keyword whose status changes (keyword, before → after, new category) so you can review before carrying it forward.
- Verified: `tsc` clean, `next build` clean, suite same FAIL set as v7.570, all v7570 checks pass.
