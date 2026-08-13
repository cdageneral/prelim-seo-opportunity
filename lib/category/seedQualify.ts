/**
 * v7.440 — Step 3 seed qualification.
 *
 * Wayne: *"how do we fix step 3 to tighten that so it does not wander this far off"*
 *
 * Step 3 ("Expand product data") sent Semrush the **bare taxonomy category name**. A name
 * like "Card Types" is unambiguous only INSIDE the taxonomy; Semrush was never told the
 * vertical, so it answered the question it was actually asked. Verified live against the
 * real `phrase_related` report:
 *
 *   Card Types          -> playing cards 40,500 · deck of cards 33,100 · cards magic gathering
 *   Education           -> ohio 450,000 · mcgraw hill 368,000 · school 246,000
 *   Tools               -> tool and equipment retailer 673,000 · acme tools 90,500
 *   Offers & Promotions -> capital one 9,140,000 · groupon 1,500,000 · black friday deals
 *
 * The umbrella was in the stored taxonomy the whole time — it just was not passed. With it:
 *
 *   credit card types     -> credit cards 1,000,000 · apply for credit card · credit card offers
 *   credit card education -> how do credit cards work · credit card definition · credit card meaning
 *
 * Pure string functions so the retained suite can drive them directly, and so the App
 * Router route file keeps exporting only its handlers (the v7.401 lesson).
 */

const singular = (w: string) => (/[^s]s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);

const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);

/**
 * Prefix a category name with its umbrella's words, minus any word the category already
 * carries (compared on a singularised stem), so:
 *   ("Card Types", "Credit Cards")   -> "credit card types"   (not "credit cards card types")
 *   ("Education",  "Credit Cards")   -> "credit card education"
 *   ("Credit Cards", "Credit Cards") -> "credit cards"        (no self-prefix)
 * Nothing is invented — every word comes from the stored taxonomy (Const I.1 / II.8).
 */
export function qualifySeed(category: string, umbrella: string | null | undefined): string {
  const cat = String(category ?? '').trim();
  if (!cat) return '';
  const umb = String(umbrella ?? '').trim();
  if (!umb || umb.toLowerCase() === cat.toLowerCase()) return cat.toLowerCase();
  const catRoots = new Set(words(cat).map(singular));
  const prefix = words(umb).map(singular).filter(w => !catRoots.has(w));
  return (prefix.length ? prefix.join(' ') + ' ' + cat.toLowerCase() : cat.toLowerCase()).trim();
}

/**
 * Walk a stored category up its `parent` chain to the top-level node. Returns the category
 * itself when it is already top-level. Guarded against a cycle in stored data.
 */
export function rootCategoryOf(
  cat: { name?: string; parent?: string | null; type?: string },
  byName: Map<string, { name?: string; parent?: string | null; type?: string }>,
): { name?: string; parent?: string | null; type?: string } {
  let cur = cat;
  const seen = new Set<string>();
  while (cur?.parent) {
    const key = String(cur.parent).toLowerCase().trim();
    if (!key || seen.has(key)) break;
    seen.add(key);
    const next = byName.get(key);
    if (!next) return { name: cur.parent as string, type: undefined };
    cur = next;
  }
  return cur;
}
