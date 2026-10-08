// lib/category/seedQualify.ts
var singular = (w) => /[^s]s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w;
var words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
function qualifySeed(category, umbrella) {
  const cat = String(category ?? "").trim();
  if (!cat)
    return "";
  const umb = String(umbrella ?? "").trim();
  if (!umb || umb.toLowerCase() === cat.toLowerCase())
    return cat.toLowerCase();
  const catRoots = new Set(words(cat).map(singular));
  const prefix = words(umb).map(singular).filter((w) => !catRoots.has(w));
  return (prefix.length ? prefix.join(" ") + " " + cat.toLowerCase() : cat.toLowerCase()).trim();
}
function rootCategoryOf(cat, byName) {
  let cur = cat;
  const seen = /* @__PURE__ */ new Set();
  while (cur?.parent) {
    const key = String(cur.parent).toLowerCase().trim();
    if (!key || seen.has(key))
      break;
    seen.add(key);
    const next = byName.get(key);
    if (!next)
      return { name: cur.parent, type: void 0 };
    cur = next;
  }
  return cur;
}

// .runs/oiq440.9KzNkv/t_entry.ts
globalThis.__ta = { qualifySeed, rootCategoryOf };
