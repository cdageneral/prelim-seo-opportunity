// lib/keywords/csvParse.ts
function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.replace(/\r$/, "").trim());
  return result;
}
function parseKeywordCsvMeta(text) {
  const rows2 = parseKeywordCsv(text);
  const header = (text.replace(/^﻿/, "").split(/\r\n|\r|\n/)[0] ?? "").toLowerCase();
  const cols = header.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  return {
    rows: rows2,
    hasPositionType: cols.some((h) => ["position type", "position_type", "positiontype", "type of position"].includes(h)),
    hasUrl: cols.some((h) => ["url", "ranking url", "landing page", "page", "page url", "address", "current url", "target url"].includes(h)),
    hasSerpFeatures: cols.some((h) => ["serp features by keyword", "serp features", "serp_features"].includes(h))
  };
}
function parseKeywordCsv(text) {
  const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);
  if (dataLines.length === 0)
    return [];
  const headerCols = (lines[0] ?? "").toLowerCase().split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  const findIdx = (names, fallback) => {
    const i = headerCols.findIndex((h) => names.includes(h));
    return i >= 0 ? i : fallback;
  };
  const kwCol = findIdx(["keyword", "keywords", "ph", "query"], 0);
  const volCol = findIdx(["search volume", "search_volume", "searchvolume", "volume", "monthly volume", "nq"], 1);
  const posCol = findIdx(["position", "rank", "ranking position", "pos", "po"], -1);
  const typeCol = findIdx(["type"], -1);
  const posTypeCol = findIdx(["position type", "position_type", "positiontype", "type of position"], -1);
  const featCol = findIdx(["serp features by keyword", "serp features", "serp_features"], -1);
  const urlCol = findIdx(["url", "ranking url", "landing page", "page", "page url", "address", "current url", "target url"], -1);
  const rows2 = [];
  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    const strip = (s) => (s ?? "").replace(/^"|"$/g, "").trim();
    const keyword = strip(cols[kwCol]);
    if (!keyword)
      continue;
    rows2.push({
      keyword,
      searchVolume: parseInt(cols[volCol] ?? "0") || 0,
      position: posCol >= 0 ? parseInt(cols[posCol] ?? "") || null : null,
      positionType: posTypeCol >= 0 ? strip(cols[posTypeCol]) || null : null,
      serpFeatures: featCol >= 0 ? strip(cols[featCol]) || null : null,
      url: urlCol >= 0 ? strip(cols[urlCol]) || null : null,
      typeRaw: typeCol >= 0 ? strip(cols[typeCol]).toLowerCase() || null : null
    });
  }
  return rows2;
}

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
function clientTopicsCovered(topics2) {
  let n = 0;
  for (const t of topics2) {
    if ((t.keywords ?? []).some((k) => {
      const p = k?.position;
      return p != null && p >= 1;
    }))
      n++;
  }
  return n;
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
  const rows2 = [];
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
    rows2.push({ topic: t.product ?? t.parentName ?? "topic", kwCount, bestPos: best.pos, url: best.url ? normContentUrl(best.url) : null });
  });
  return rows2.sort((a, b) => a.bestPos - b.bestPos || b.kwCount - a.kwCount || a.topic.localeCompare(b.topic));
}

// .runs/oiq459.kzNoHa/e459.ts
var csv = 'Keyword,Position,Position Type,Search Volume,URL,SERP Features by Keyword\n"cd rates, best",1,Organic,900,https://x.com/cd-rates,"Featured snippet, People also ask"\ncd ladder,4,"People also ask",300,https://x.com/ladder,\n';
var rows = parseKeywordCsv(csv);
var meta = parseKeywordCsvMeta(csv);
var alias = parseKeywordCsv("Ph,Po,Nq\nsavings rates,3,500\n");
var mk = (kw, pos, url) => ({ keyword: kw, searchVolume: 10, position: pos, url });
var childA = { key: "a", name: "Rates", kwCount: 3, allKws: [mk("r1", 1, "https://x.com/multi"), mk("r2", 2, "https://x.com/multi"), mk("r3", null)] };
var childB = { key: "b", name: "Education", kwCount: 2, allKws: [mk("e1", 5, "https://x.com/multi"), mk("e2", null)] };
var node = { name: "CDs", children: [childA, childB], allKws: [...childA.allKws, ...childB.allKws, mk("line-kw", 3, "https://x.com/l")] };
var topics = [
  { product: "Rates head", keywords: [mk("r1", 1), mk("r2", 2)] },
  // childA — covered by client
  { product: "Edu head", keywords: [mk("e1", 5), mk("e2", null)] },
  // childB — covered by client
  { product: "Uncovered", keywords: [mk("r3", null)] },
  // childA — NOT covered
  { product: "Line topic", keywords: [mk("line-kw", 3)] }
  // line level — covered
];
var uploaded = [
  { keyword: "r1", domain: "rival.com", position: 2, source: "csv" },
  { keyword: "r3", domain: "rival.com", position: 5, source: "csv" }
];
var cf = buildContentFootprint({ node, uploadedKeywords: uploaded, serpPositions: {}, clientDomain: "x.com", topics });
var you = cf.brands.find((b) => b.kind === "client");
var rival = cf.brands.find((b) => b.domain === "rival.com");
var drill = coveredTopicList({ topics, children: node.children, childIdx: 0, domain: "rival.com", clientDomain: "x.com", node, uploadedKeywords: uploaded });
console.log(JSON.stringify({
  rows,
  metaFlags: [meta.hasPositionType, meta.hasUrl, meta.hasSerpFeatures],
  alias,
  youCov: you.covered,
  rivalCov: rival.covered,
  chip: clientTopicsCovered(topics),
  order0: cf.brands[0].domain,
  drill
}));
