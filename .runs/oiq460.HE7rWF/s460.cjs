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
function normSovDomain(d) {
  return (d ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();
}

// lib/productInsights.ts
var normContentUrl = (u) => {
  let s = String(u ?? "").trim().toLowerCase();
  if (!s)
    return "";
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("#")[0];
  while (s.endsWith("/"))
    s = s.slice(0, -1);
  return s;
};
function fileTopics(topics2, children) {
  const kwToChild = /* @__PURE__ */ new Map();
  children.forEach((c, i) => {
    for (const k of c.allKws)
      kwToChild.set(k.keyword.toLowerCase().trim(), i);
  });
  return topics2.map((t) => {
    const votes = children.map(() => 0);
    let any = false;
    for (const k of t.keywords ?? []) {
      const ci = kwToChild.get(String(k?.keyword ?? "").toLowerCase().trim());
      if (ci !== void 0) {
        votes[ci]++;
        any = true;
      }
    }
    if (!any)
      return -1;
    let best = 0;
    for (let i = 1; i < votes.length; i++)
      if (votes[i] > votes[best])
        best = i;
    return best;
  });
}
function coveredTopicList(opts) {
  const { topics: topics2, children, childIdx, domain, clientDomain, node: node2, uploadedKeywords } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const domNorm = normSovDomain(domain);
  const ev = /* @__PURE__ */ new Map();
  const add = (kw, pos, url) => {
    const e = ev.get(kw);
    if (!e || pos < e.pos)
      ev.set(kw, { pos, url });
  };
  if (domNorm === clientNorm) {
    for (const k of node2.allKws) {
      if (k.position != null && k.position >= 1)
        add(k.keyword.toLowerCase().trim(), k.position, k.url ?? null);
    }
  } else {
    for (const r of uploadedKeywords ?? []) {
      if (r?.source === "blocked")
        continue;
      if (normSovDomain(r?.domain ?? "") !== domNorm)
        continue;
      const p = r?.position;
      if (p == null || p < 1)
        continue;
      const kw = String(r?.keyword ?? "").toLowerCase().trim();
      if (kw)
        add(kw, p, typeof r?.url === "string" && r.url.trim() ? String(r.url) : null);
    }
  }
  const filing = fileTopics(topics2, children);
  const rows = [];
  topics2.forEach((t, i) => {
    if (childIdx >= 0 && filing[i] !== childIdx)
      return;
    if (childIdx === -2 && filing[i] !== -1)
      return;
    let kwCount = 0;
    let best = null;
    for (const k of t.keywords ?? []) {
      const e = ev.get(String(k?.keyword ?? "").toLowerCase().trim());
      if (!e)
        continue;
      kwCount++;
      if (!best || e.pos < best.pos)
        best = e;
    }
    if (kwCount === 0 || !best)
      return;
    rows.push({ topic: t.product ?? t.parentName ?? "topic", kwCount, bestPos: best.pos, url: best.url ? normContentUrl(best.url) : null });
  });
  return rows.sort((a, b) => a.bestPos - b.bestPos || b.kwCount - a.kwCount || a.topic.localeCompare(b.topic));
}

// .runs/oiq460.HE7rWF/e460.ts
var mk = (kw, pos, url) => ({ keyword: kw, searchVolume: 10, position: pos, url });
var childA = { key: "a", name: "Rates", kwCount: 2, allKws: [mk("r1", 1, "https://x.com/r1"), mk("r2", null)] };
var node = { name: "CDs", children: [childA], allKws: [...childA.allKws, mk("line-kw", 3, "https://x.com/l")] };
var topics = [
  { product: "Child topic", keywords: [mk("r1", 1)] },
  { product: "Line topic", keywords: [mk("line-kw", 3)] }
];
var line = coveredTopicList({ topics, children: node.children, childIdx: -2, domain: "x.com", clientDomain: "x.com", node, uploadedKeywords: [] });
var whole = coveredTopicList({ topics, children: node.children, childIdx: -1, domain: "x.com", clientDomain: "x.com", node, uploadedKeywords: [] });
var child = coveredTopicList({ topics, children: node.children, childIdx: 0, domain: "x.com", clientDomain: "x.com", node, uploadedKeywords: [] });
console.log(JSON.stringify({ line: line.map((r) => r.topic), whole: whole.length, child: child.map((r) => r.topic) }));
