// lib/utils/kwVolume.ts
var NON_LATIN_LETTER = new RegExp("(?=\\p{L})\\P{Script=Latin}", "u");

// lib/sov/model.ts
var CTR_BY_POSITION = {
  1: 0.19,
  2: 0.131,
  3: 0.098,
  4: 0.077,
  5: 0.053,
  6: 0.041,
  7: 0.033,
  8: 0.027,
  9: 0.022,
  10: 0.019
};
var PAGE1_CTR_SUM = Object.values(CTR_BY_POSITION).reduce((s, v) => s + v, 0);

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

// lib/productInsights.ts
var normName = (s) => s.toLowerCase().trim();
function flattenNodes(node2) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(node2);
  return out;
}
function scanQueryFor(node2) {
  const umbrella = node2.path && node2.path.length > 0 ? node2.path[0] : "";
  return qualifySeed(node2.name, umbrella) || String(node2.name ?? "").toLowerCase().trim();
}
function buildScanPlan(root2, storedScans = [], opts = {}) {
  const done = new Set((storedScans ?? []).filter((s) => s?.category).map((s) => normName(s.category)));
  const all = [root2, ...flattenNodes(root2)];
  all.sort((a, b) => a.depth - b.depth);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const n of all) {
    if (!n?.key || seen.has(n.key))
      continue;
    seen.add(n.key);
    const scanned = done.has(normName(n.key));
    if (opts.skipScanned !== false && scanned)
      continue;
    out.push({ key: n.key, name: n.name, depth: n.depth, query: scanQueryFor(n), scanned });
  }
  return out;
}
function projectedScanTime(storedScans, nodes) {
  const timed = (storedScans ?? []).filter((s) => typeof s?.durationMs === "number" && s.durationMs > 0);
  if (timed.length === 0 || nodes <= 0)
    return null;
  const avgMs = timed.reduce((n, s) => n + s.durationMs, 0) / timed.length;
  return { seconds: avgMs / 1e3 * nodes, avgSeconds: avgMs / 1e3, basedOn: timed.length };
}
function projectedScanCost(storedScans, nodes) {
  const priced = (storedScans ?? []).filter((s) => typeof s?.costUSD === "number" && s.costUSD > 0);
  if (priced.length === 0 || nodes <= 0)
    return null;
  const avg = priced.reduce((n, s) => n + s.costUSD, 0) / priced.length;
  return { usd: avg * nodes, avgUsd: avg, basedOn: priced.length };
}

// .runs/oiq444.hLHb6t/e444.ts
var node = (name, depth, path, children = []) => ({
  key: path.join(" \u203A "),
  name,
  depth,
  path,
  children,
  kwCount: 0,
  demand: 0,
  bands: [0, 0, 0, 0],
  p1Share: 0,
  ladder: [],
  clientRank: null,
  scan: null,
  dfsShare: null,
  citedTop: [],
  bestPos: null,
  kws: [],
  allKws: []
});
var leafA = node("No Annual Fee", 3, ["Business Credit Cards", "Card Types", "No Annual Fee"]);
var leafB = node("Requirements", 3, ["Business Credit Cards", "Card Types", "Requirements"]);
var theme = node("Card Types", 2, ["Business Credit Cards", "Card Types"], [leafA, leafB]);
var other = node("Rewards", 2, ["Business Credit Cards", "Rewards"]);
var root = node("Business Credit Cards", 1, ["Business Credit Cards"], [theme, other]);
var scans = [
  { category: "Business Credit Cards \u203A Rewards", query: "x", scannedAt: "", totalCount: 1, fetched: 1, costUSD: 0.3, provider: "dataforseo", rows: [], durationMs: 4e3 },
  { category: "Business Credit Cards", query: "x", scannedAt: "", totalCount: 1, fetched: 1, costUSD: 0.4, provider: "dataforseo", rows: [], durationMs: 6e3 }
];
console.log(JSON.stringify({
  full: buildScanPlan(root, [], { skipScanned: false }).map((t) => [t.key, t.depth, t.query]),
  skipping: buildScanPlan(root, scans).map((t) => t.key),
  queries: { leaf: scanQueryFor(leafA), req: scanQueryFor(leafB), root: scanQueryFor(root) },
  cost: projectedScanCost(scans, 10),
  time: projectedScanTime(scans, 10),
  noHistCost: projectedScanCost([], 10),
  noHistTime: projectedScanTime([{ ...scans[0], durationMs: void 0 }], 10)
}));
