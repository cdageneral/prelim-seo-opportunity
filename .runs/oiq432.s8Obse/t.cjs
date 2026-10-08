// lib/utils/brandRoot.ts
var SECOND_LEVEL = /* @__PURE__ */ new Set(["co", "com", "org", "net", "gov", "ac", "edu", "ltd", "plc", "me", "nhs", "police", "sch"]);
var TLDS = /* @__PURE__ */ new Set([
  "com",
  "net",
  "org",
  "io",
  "co",
  "ca",
  "us",
  "uk",
  "au",
  "gov",
  "edu",
  "biz",
  "info",
  "bank",
  "app",
  "ai",
  "mobi",
  "insurance",
  "finance",
  "financial",
  "credit",
  "loans",
  "money",
  "de",
  "fr",
  "es",
  "it",
  "nl",
  "ie",
  "nz",
  "in",
  "mx",
  "br",
  "jp",
  "cn",
  "hk",
  "sg",
  "za"
]);
function hostOf(domain) {
  return String(domain ?? "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\d*\./, "").replace(/\.$/, "");
}
function brandLabelOf(domain) {
  const labels = hostOf(domain).split(".").filter(Boolean);
  if (labels.length === 0)
    return "";
  if (labels.length === 1)
    return labels[0];
  let end = labels.length;
  if (TLDS.has(labels[end - 1]) || /^[a-z]{2,3}$/.test(labels[end - 1])) {
    end--;
    if (end >= 2 && /^[a-z]{2}$/.test(labels[end]) && SECOND_LEVEL.has(labels[end - 1]))
      end--;
  }
  return labels[Math.max(0, end - 1)] ?? "";
}
function brandRootOf(domain) {
  return brandLabelOf(domain).replace(/[^a-z0-9]/g, "");
}

// lib/utils/kwVolume.ts
function extractBrand(domain) {
  return brandRootOf(domain ?? "");
}
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
var SERP_ENTRY_MAX_POS = 6;
function buildRivalRankMap(opts) {
  const { uploadedKeywords, serpPositions, serpScan, clientDomain, trackedCompetitors = [] } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const perKw = /* @__PURE__ */ new Map();
  const kindOf = /* @__PURE__ */ new Map();
  const tracked = /* @__PURE__ */ new Set();
  const put = (k, dom, p) => {
    let m = perKw.get(k);
    if (!m) {
      m = /* @__PURE__ */ new Map();
      perKw.set(k, m);
    }
    const prev = m.get(dom);
    if (prev === void 0 || p < prev)
      m.set(dom, p);
  };
  for (const r of uploadedKeywords ?? []) {
    if (r?.source === "blocked")
      continue;
    const dom = normSovDomain(r?.domain ?? "");
    if (!dom || dom === clientNorm)
      continue;
    const p = r?.position;
    if (p == null || p < 1)
      continue;
    tracked.add(dom);
    kindOf.set(dom, "tracked");
    const k = String(r?.keyword ?? "").toLowerCase().trim();
    if (!k)
      continue;
    put(k, dom, p);
  }
  const rivalDoms = /* @__PURE__ */ new Set();
  for (const [rawDom, positions] of Object.entries(serpPositions ?? {})) {
    const dom = normSovDomain(rawDom);
    if (!dom || dom === clientNorm || tracked.has(dom))
      continue;
    rivalDoms.add(dom);
    for (const pos of positions ?? []) {
      const p = pos?.position;
      if (p == null || p < 1)
        continue;
      const k = String(pos?.keyword ?? "").toLowerCase().trim();
      if (!k)
        continue;
      put(k, dom, p);
    }
  }
  rivalDoms.forEach((d) => {
    if (!kindOf.has(d))
      kindOf.set(d, "rival");
  });
  const serpEntry = /* @__PURE__ */ new Map();
  let scannedKw = 0;
  for (const row of serpScan?.keywords ?? []) {
    const k = String(row?.keyword ?? "").toLowerCase().trim();
    if (!k)
      continue;
    scannedKw++;
    for (const r of row?.organicResults ?? []) {
      const p = r?.position;
      if (p == null || p < 1 || p > 10)
        continue;
      const dom = normSovDomain(r?.domain ?? "");
      if (!dom || dom === clientNorm || tracked.has(dom) || rivalDoms.has(dom))
        continue;
      put(k, dom, p);
      if (!kindOf.has(dom))
        kindOf.set(dom, "serp");
      if (p <= SERP_ENTRY_MAX_POS) {
        let s = serpEntry.get(dom);
        if (!s) {
          s = /* @__PURE__ */ new Set();
          serpEntry.set(dom, s);
        }
        s.add(k);
      }
    }
  }
  const trackedAll = new Set(tracked);
  for (const c of trackedCompetitors) {
    const d = normSovDomain(String(c ?? ""));
    if (d && d !== clientNorm)
      trackedAll.add(d);
  }
  trackedAll.forEach((d) => {
    if (kindOf.has(d))
      kindOf.set(d, "tracked");
  });
  return { perKw, kindOf, trackedAll, serpEntry, scannedKw };
}
function accumulateLadder(kws, rm, clientNorm) {
  const byDom = /* @__PURE__ */ new Map();
  let clientP1Vol = 0, clientP1Kw = 0;
  for (const k of kws) {
    const v = k.searchVolume || 0;
    const p = k.position;
    if (p !== null && p >= 1 && p <= 10) {
      clientP1Vol += v;
      clientP1Kw++;
    }
    const m = rm.perKw.get(k.keyword);
    if (m)
      m.forEach((bp, dom) => {
        let e = byDom.get(dom);
        if (!e) {
          e = { p1Vol: 0, p1Kw: 0, measuredKw: 0, top6Kw: 0 };
          byDom.set(dom, e);
        }
        e.measuredKw++;
        if (bp >= 1 && bp <= 10) {
          e.p1Vol += v;
          e.p1Kw++;
        }
        if (rm.serpEntry.get(dom)?.has(k.keyword))
          e.top6Kw++;
      });
  }
  const ladder = [];
  if (clientP1Vol > 0)
    ladder.push({ domain: clientNorm || "client", kind: "client", p1Vol: clientP1Vol, p1Kw: clientP1Kw, measuredKw: kws.length });
  byDom.forEach((e, dom) => {
    if (e.p1Vol <= 0)
      return;
    const kind = rm.kindOf.get(dom) ?? "rival";
    if (kind === "serp") {
      if (e.top6Kw <= 0)
        return;
      ladder.push({ domain: dom, kind, p1Vol: e.p1Vol, p1Kw: e.p1Kw, measuredKw: e.measuredKw, top6Kw: e.top6Kw });
      return;
    }
    ladder.push({ domain: dom, kind, p1Vol: e.p1Vol, p1Kw: e.p1Kw, measuredKw: e.measuredKw });
  });
  ladder.sort((a, b) => b.p1Vol - a.p1Vol);
  const clientIdx = ladder.findIndex((e) => e.kind === "client");
  return { ladder, clientRank: clientIdx >= 0 ? clientIdx + 1 : null, clientP1Vol, clientP1Kw };
}
var normName = (s) => s.toLowerCase().trim();
function rowNamesClient(row, clientNorm, brandToks) {
  if ((row.sources ?? []).some((s) => normSovDomain(s.domain) === clientNorm))
    return true;
  if ((row.searchResultDomains ?? []).some((d) => normSovDomain(d) === clientNorm))
    return true;
  const hay = squash((row.brandEntities ?? []).join(" ") + " " + (row.answerExcerpt ?? ""));
  return brandToks.some((t) => {
    const q = squash(t);
    return q.length >= 3 && hay.includes(q);
  });
}
function buildBrandTokens(clientDomain, brandTerms = []) {
  const toks = /* @__PURE__ */ new Set();
  const b = extractBrand(clientDomain);
  if (b)
    toks.add(b.toLowerCase());
  for (const t of brandTerms)
    if (t && t.trim())
      toks.add(t.toLowerCase().trim());
  return Array.from(toks);
}
var squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
function rowNamesBrand(row, brandToks) {
  const hay = squash((row.brandEntities ?? []).join(" ") + " " + (row.answerExcerpt ?? ""));
  return brandToks.some((t) => {
    const q = squash(t);
    return q.length >= 3 && hay.includes(q);
  });
}
function rowCitesClient(row, clientNorm) {
  if ((row.sources ?? []).some((s) => normSovDomain(s.domain) === clientNorm))
    return true;
  return (row.searchResultDomains ?? []).some((d) => normSovDomain(d) === clientNorm);
}
function promptBucket(row, clientNorm, brandToks) {
  if (rowCitesClient(row, clientNorm))
    return "cited";
  if (rowNamesBrand(row, brandToks))
    return "named";
  return "absent";
}
function buildPromptBreakdown(scan, clientDomain, brandTerms = []) {
  if (!scan || !Array.isArray(scan.rows) || scan.rows.length === 0)
    return null;
  const clientNorm = normSovDomain(clientDomain);
  const brandToks = buildBrandTokens(clientDomain, brandTerms);
  const urlMap = /* @__PURE__ */ new Map();
  const rows = scan.rows.map((r) => {
    const bucket = promptBucket(r, clientNorm, brandToks);
    const ownedUrls = [];
    for (const s of r.sources ?? []) {
      if (normSovDomain(s.domain) !== clientNorm)
        continue;
      const path = String(s.url ?? "").replace(/^https?:\/\/[^/]*/, "").split("#")[0] || "/";
      if (!ownedUrls.includes(path))
        ownedUrls.push(path);
      const list = urlMap.get(path);
      if (list) {
        if (!list.includes(r.question))
          list.push(r.question);
      } else
        urlMap.set(path, [r.question]);
    }
    return {
      question: r.question,
      platform: r.platform,
      bucket,
      ownedUrls,
      cites: Array.from(new Set((r.sources ?? []).map((s) => normSovDomain(s.domain)).filter(Boolean)))
    };
  });
  const counts = { cited: 0, named: 0, absent: 0, total: rows.length };
  for (const r of rows)
    counts[r.bucket]++;
  const order = { cited: 0, named: 1, absent: 2 };
  rows.sort((a, b) => order[a.bucket] - order[b.bucket] || a.question.localeCompare(b.question));
  const byUrl = Array.from(urlMap.entries()).map(([url, prompts]) => ({ url, prompts })).sort((a, b) => b.prompts.length - a.prompts.length);
  return { rows, counts, byUrl };
}
function buildCategoryTree(rootName, opts) {
  const { breakdown, poolKeywords, uploadedKeywords, serpPositions, storedScans, clientDomain, brandTerms = [], serpScan = null, trackedCompetitors = [] } = opts;
  const rawPaths = breakdown?.keywordPaths ?? {};
  if (!rawPaths || Object.keys(rawPaths).length === 0)
    return null;
  const clientNorm = normSovDomain(clientDomain);
  const brandToks = buildBrandTokens(clientDomain, brandTerms);
  const rootNorm = normName(rootName);
  const kwRow = /* @__PURE__ */ new Map();
  for (const k of poolKeywords) {
    const key = String(k?.keyword ?? "").toLowerCase().trim();
    if (!key || kwRow.has(key))
      continue;
    kwRow.set(key, {
      keyword: key,
      searchVolume: k.searchVolume || 0,
      position: k.position ?? null,
      url: k.url,
      origin: k.origin === "demand" ? "demand" : "footprint",
      isGap: !!k.isGap
    });
  }
  const rm = buildRivalRankMap({ uploadedKeywords, serpPositions, serpScan, clientDomain, trackedCompetitors });
  const scanByKey = /* @__PURE__ */ new Map();
  for (const s of storedScans ?? [])
    if (s?.category)
      scanByKey.set(normName(s.category), s);
  const root = { name: rootName, path: [rootName], kws: [], children: /* @__PURE__ */ new Map() };
  for (const [kwRaw, pathRaw] of Object.entries(rawPaths)) {
    if (!Array.isArray(pathRaw) || pathRaw.length === 0)
      continue;
    const path = pathRaw.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (path.length === 0 || normName(path[0]) !== rootNorm)
      continue;
    const row = kwRow.get(String(kwRaw).toLowerCase().trim());
    if (!row)
      continue;
    let cur = root;
    for (let i = 1; i < path.length; i++) {
      const seg = path[i];
      const kk = normName(seg);
      let next = cur.children.get(kk);
      if (!next) {
        next = { name: seg, path: path.slice(0, i + 1), kws: [], children: /* @__PURE__ */ new Map() };
        cur.children.set(kk, next);
      }
      cur = next;
    }
    cur.kws.push(row);
  }
  const fold = (raw, depth) => {
    const children = Array.from(raw.children.values()).map((c) => fold(c, depth + 1));
    const seen = /* @__PURE__ */ new Set();
    const all = [];
    const collect = (r) => {
      for (const k of r.kws) {
        if (!seen.has(k.keyword)) {
          seen.add(k.keyword);
          all.push(k);
        }
      }
      r.children.forEach(collect);
    };
    collect(raw);
    const bands = [0, 0, 0, 0];
    let demand = 0;
    let bestPos = null;
    let bestUrl;
    for (const k of all) {
      const v = k.searchVolume || 0;
      demand += v;
      const p = k.position;
      if (p !== null && p >= 1 && p <= 3)
        bands[0] += v;
      else if (p !== null && p >= 4 && p <= 10)
        bands[1] += v;
      else if (p !== null && p >= 11 && p <= 20)
        bands[2] += v;
      else
        bands[3] += v;
      if (p !== null && p >= 1 && (bestPos === null || p < bestPos)) {
        bestPos = p;
        bestUrl = k.url;
      }
    }
    const { ladder, clientP1Vol } = accumulateLadder(all, rm, clientNorm);
    ladder.sort((a, b) => b.p1Vol - a.p1Vol);
    const clientIdx = ladder.findIndex((e) => e.kind === "client");
    const key = raw.path.join(" \u203A ");
    const scan = scanByKey.get(normName(key)) ?? (depth === 0 ? scanByKey.get(rootNorm) ?? null : null);
    let dfsShare = null;
    let citedTop = [];
    if (scan && scan.rows.length > 0) {
      const named = scan.rows.filter((r) => rowNamesClient(r, clientNorm, brandToks)).length;
      dfsShare = named / scan.rows.length;
      const counts = /* @__PURE__ */ new Map();
      for (const r of scan.rows)
        for (const sc of r.sources) {
          const dd = normSovDomain(sc.domain);
          if (!dd)
            continue;
          counts.set(dd, (counts.get(dd) ?? 0) + 1);
        }
      citedTop = Array.from(counts.entries()).map(([dd, c]) => ({ domain: dd, count: c, isClient: dd === clientNorm })).sort((a, b) => b.count - a.count);
    }
    children.sort((a, b) => b.demand - a.demand);
    const byVol = (a, b) => b.searchVolume - a.searchVolume;
    return {
      key,
      name: raw.name,
      depth,
      path: raw.path,
      children,
      kwCount: all.length,
      demand,
      bands,
      p1Share: demand > 0 ? (bands[0] + bands[1]) / demand : 0,
      ladder,
      clientRank: clientIdx >= 0 ? clientIdx + 1 : null,
      scan,
      dfsShare,
      citedTop,
      bestPos,
      bestUrl,
      kws: raw.kws.slice().sort(byVol),
      allKws: all.slice().sort(byVol)
    };
  };
  const tree = fold(root, 0);
  return tree.kwCount > 0 ? tree : null;
}
function flattenNodes(node) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

// .runs/oiq432.s8Obse/t_entry.ts
globalThis.__t = { buildCategoryTree, flattenNodes, buildPromptBreakdown, rowNamesClient, rowNamesBrand, rowCitesClient, promptBucket, buildBrandTokens };
