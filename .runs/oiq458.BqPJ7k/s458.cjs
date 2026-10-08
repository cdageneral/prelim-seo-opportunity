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
var CONTENT_GAP_MIN = 10;
var COVER_GAP_MIN = 2;
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
var newAcc = () => ({ urls: /* @__PURE__ */ new Set(), rankedKw: /* @__PURE__ */ new Set(), urlKw: /* @__PURE__ */ new Set() });
var accToCell = (a) => ({ urls: a.urls.size, rankedKw: a.rankedKw.size, urlKw: a.urlKw.size });
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
function buildJourneyRequirement(topics2, children) {
  const filing = fileTopics(topics2, children);
  const perChild = children.map(() => 0);
  let atLine = 0;
  for (const ci of filing) {
    if (ci < 0)
      atLine++;
    else
      perChild[ci]++;
  }
  return { total: topics2.length, perChild, atLine };
}
function coverageForRankedSet(topics2, filing, childCount, rankedKws) {
  const perChild = Array.from({ length: childCount }, () => 0);
  let total = 0, atLine = 0;
  topics2.forEach((t, i) => {
    const hit = (t.keywords ?? []).some((k) => rankedKws.has(String(k?.keyword ?? "").toLowerCase().trim()));
    if (!hit)
      return;
    total++;
    if (filing[i] < 0)
      atLine++;
    else
      perChild[filing[i]]++;
  });
  return { total, perChild, atLine };
}
function clientPagesForTopics(topics2) {
  const seen = /* @__PURE__ */ new Set();
  const acc = newAcc();
  for (const t of topics2)
    for (const k of t.keywords ?? []) {
      const kw = String(k?.keyword ?? "").toLowerCase().trim();
      if (!kw || seen.has(kw))
        continue;
      seen.add(kw);
      const p = k?.position;
      if (p == null || p < 1)
        continue;
      acc.rankedKw.add(kw);
      if (k?.url) {
        acc.urlKw.add(kw);
        const u = normContentUrl(String(k.url));
        if (u)
          acc.urls.add(u);
      }
    }
  return accToCell(acc);
}
function buildContentFootprint(opts) {
  const { node: node2, uploadedKeywords, serpPositions, clientDomain, topics: topics2 } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const children = (node2.children ?? []).map((c) => ({ key: c.key, name: c.name, kwCount: c.kwCount }));
  const filing = topics2 ? fileTopics(topics2, node2.children ?? []) : null;
  const journey = (() => {
    if (!topics2 || !filing)
      return null;
    const perChild = (node2.children ?? []).map(() => 0);
    let atLine = 0;
    for (const ci of filing) {
      if (ci < 0)
        atLine++;
      else
        perChild[ci]++;
    }
    return { total: topics2.length, perChild, atLine };
  })();
  const kwToChild = /* @__PURE__ */ new Map();
  (node2.children ?? []).forEach((c, i) => {
    for (const k of c.allKws)
      kwToChild.set(k.keyword.toLowerCase().trim(), i);
  });
  const nodeKws = /* @__PURE__ */ new Set();
  for (const k of node2.allKws)
    nodeKws.add(k.keyword.toLowerCase().trim());
  const cTotal = newAcc();
  const cChild = children.map(() => newAcc());
  for (const k of node2.allKws) {
    const kw = k.keyword.toLowerCase().trim();
    const p = k.position;
    if (p == null || p < 1)
      continue;
    const ci = kwToChild.get(kw);
    const tgts = [cTotal, ...ci !== void 0 ? [cChild[ci]] : []];
    for (const t of tgts) {
      t.rankedKw.add(kw);
      if (k.url) {
        t.urlKw.add(kw);
        const u = normContentUrl(k.url);
        if (u)
          t.urls.add(u);
      }
    }
  }
  const comp = /* @__PURE__ */ new Map();
  for (const r of uploadedKeywords ?? []) {
    if (r?.source === "blocked")
      continue;
    const dom = normSovDomain(r?.domain ?? "");
    if (!dom || dom === clientNorm)
      continue;
    const p = r?.position;
    if (p == null || p < 1)
      continue;
    const kw = String(r?.keyword ?? "").toLowerCase().trim();
    if (!kw || !nodeKws.has(kw))
      continue;
    let e = comp.get(dom);
    if (!e) {
      e = { total: newAcc(), child: children.map(() => newAcc()) };
      comp.set(dom, e);
    }
    const ci = kwToChild.get(kw);
    const tgts = [e.total, ...ci !== void 0 ? [e.child[ci]] : []];
    for (const t of tgts) {
      t.rankedKw.add(kw);
      if (r?.url) {
        t.urlKw.add(kw);
        const u = normContentUrl(String(r.url));
        if (u)
          t.urls.add(u);
      }
    }
  }
  const covFor = (rankedKws) => topics2 && filing ? coverageForRankedSet(topics2, filing, children.length, rankedKws) : null;
  const brands = [];
  if (clientNorm)
    brands.push({ domain: clientNorm, kind: "client", total: accToCell(cTotal), perChild: cChild.map(accToCell), covered: covFor(cTotal.rankedKw) });
  comp.forEach((e, dom) => {
    if (e.total.rankedKw.size === 0)
      return;
    brands.push({ domain: dom, kind: "tracked", total: accToCell(e.total), perChild: e.child.map(accToCell), covered: covFor(e.total.rankedKw) });
  });
  brands.sort((a, b) => (b.covered?.total ?? -1) - (a.covered?.total ?? -1) || b.total.urls - a.total.urls || b.total.rankedKw - a.total.rankedKw || a.domain.localeCompare(b.domain));
  const client = brands.find((b) => b.kind === "client") ?? null;
  const gapChildIdx = [];
  children.forEach((_, i) => {
    if (!client)
      return;
    if (journey && client.covered) {
      if (client.covered.perChild[i] !== 0)
        return;
      const req = journey.perChild[i];
      const best2 = Math.max(0, ...brands.filter((b) => b.kind !== "client").map((b) => b.covered?.perChild[i] ?? 0));
      if (req > 0 && best2 >= Math.max(COVER_GAP_MIN, Math.ceil(req / 2)))
        gapChildIdx.push(i);
      return;
    }
    const cc = client.perChild[i];
    const unknown = cc.rankedKw > 0 && cc.urlKw === 0;
    if (cc.urls !== 0 || unknown)
      return;
    const best = Math.max(0, ...brands.filter((b) => b.kind !== "client").map((b) => b.perChild[i].urls));
    if (best >= CONTENT_GAP_MIN)
      gapChildIdx.push(i);
  });
  const unlistedRivals = [];
  for (const [rawDom, positions] of Object.entries(serpPositions ?? {})) {
    const dom = normSovDomain(rawDom);
    if (!dom || dom === clientNorm || comp.has(dom))
      continue;
    if ((positions ?? []).some((pos) => nodeKws.has(String(pos?.keyword ?? "").toLowerCase().trim())))
      unlistedRivals.push(dom);
  }
  unlistedRivals.sort();
  return { children, brands, gapChildIdx, unlistedRivals, journey };
}

// .runs/oiq458.BqPJ7k/e458.ts
var mk = (kw, pos, url) => ({ keyword: kw, searchVolume: 10, position: pos, url });
var childA = { key: "a", name: "Rates", kwCount: 3, allKws: [mk("r1", 1, "https://x.com/r1"), mk("r2", 2, "https://x.com/r2"), mk("r3", null)] };
var childB = { key: "b", name: "Education", kwCount: 2, allKws: [mk("e1", 5, "https://x.com/e1"), mk("e2", null)] };
var node = { name: "CDs", children: [childA, childB], allKws: [...childA.allKws, ...childB.allKws, mk("line-kw", 3, "https://x.com/l")] };
var topics = [
  { keywords: [mk("r1", 1), mk("r2", 2), mk("e1", 5)] },
  { keywords: [mk("e1", 5), mk("e2", null)] },
  { keywords: [mk("line-kw", 3)] }
];
var jr = buildJourneyRequirement(topics, node.children);
var cf = buildContentFootprint({ node, uploadedKeywords: [], serpPositions: {}, clientDomain: "x.com", topics });
var cfNo = buildContentFootprint({ node, uploadedKeywords: [], serpPositions: {}, clientDomain: "x.com" });
var chip = clientPagesForTopics([{ keywords: node.allKws }]);
console.log(JSON.stringify({ jr, cfj: cf.journey, cfNoNull: cfNo.journey === null, chip, cfClient: cf.brands.find((b) => b.kind === "client").total }));
