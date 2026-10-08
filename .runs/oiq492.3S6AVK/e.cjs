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

// lib/serp/featurePool.ts
function normDomain(d) {
  return (d ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase().trim();
}
function domainsMatch(a, b) {
  const na = normDomain(a), nb = normDomain(b);
  if (!na || !nb)
    return false;
  return na === nb || na.endsWith("." + nb) || nb.endsWith("." + na);
}
function semrushFeaturesToBuckets(raw) {
  const out = /* @__PURE__ */ new Set();
  const f = raw.toLowerCase();
  if (f.includes("ai overview"))
    out.add("ai_overview");
  if (f.includes("people also ask"))
    out.add("paa");
  if (f.includes("video"))
    out.add("video_carousel");
  if (f.includes("featured snippet"))
    out.add("featured_snippet");
  if (f.includes("knowledge panel"))
    out.add("knowledge_panel");
  if (f.includes("local pack"))
    out.add("local_pack");
  if (f.includes("shopping"))
    out.add("shopping");
  if (f.includes("image"))
    out.add("image_pack");
  return out;
}
function countUploadFeatures(rows, scannedSet) {
  const more = { featured_snippet: 0, knowledge_panel: 0, local_pack: 0, shopping: 0, image_pack: 0 };
  let aio = 0, paa = 0, video = 0, withData = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const r of rows) {
    const kw = (r.keyword ?? "").trim().toLowerCase();
    if (!kw || seen.has(kw))
      continue;
    seen.add(kw);
    if (scannedSet.has(kw))
      continue;
    if (r.source === "blocked")
      continue;
    if (!r.serpFeatures)
      continue;
    const buckets = semrushFeaturesToBuckets(r.serpFeatures);
    if (buckets.size === 0)
      continue;
    withData++;
    if (buckets.has("ai_overview"))
      aio++;
    if (buckets.has("paa"))
      paa++;
    if (buckets.has("video_carousel"))
      video++;
    for (const k of Object.keys(more))
      if (buckets.has(k))
        more[k]++;
  }
  return { rowsWithFeatureData: withData, aio, paa, video, more };
}
function computeSerpFeatureRollup(uploadRows, scannedKws, clientDomain) {
  const scannedSet = /* @__PURE__ */ new Set();
  for (const k of scannedKws) {
    const kw = (k.keyword ?? "").trim().toLowerCase();
    if (kw)
      scannedSet.add(kw);
  }
  const uploadFeat = countUploadFeatures(uploadRows, scannedSet);
  const aioKws = scannedKws.filter((k) => !!k.hasAIO);
  const aioAvail = aioKws.length + uploadFeat.aio;
  const aioAcq = aioKws.filter((kw) => (kw.aioSources ?? []).some((s) => domainsMatch(s.domain, clientDomain))).length;
  const paaAvail = scannedKws.filter((k) => (k.paaQuestions?.length ?? 0) > 0).length + uploadFeat.paa;
  const paaAcq = scannedKws.filter((k) => !!k.paaClientCited).length;
  const videoAvail = scannedKws.filter((k) => !!k.serpFeatures?.includes("video_carousel")).length + uploadFeat.video;
  const videoAcq = scannedKws.filter((k) => !!k.videoClientCited).length;
  return {
    aioAvail,
    aioAcq,
    aioRate: aioAvail > 0 ? Math.round(aioAcq / aioAvail * 100) : 0,
    paaAvail,
    paaAcq,
    paaRate: paaAvail > 0 ? Math.round(paaAcq / paaAvail * 100) : 0,
    videoAvail,
    videoAcq,
    videoRate: videoAvail > 0 ? Math.round(videoAcq / videoAvail * 100) : 0,
    totalAvail: aioAvail + paaAvail + videoAvail,
    totalAcq: aioAcq + paaAcq + videoAcq
  };
}

// lib/productInsights.ts
var SERP_ENTRY_MAX_POS = 6;
var LADDER_TOP_N = 6;
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
function placeInLadder(entries, clientNorm, tracked, isClient, topN = LADDER_TOP_N) {
  const top = entries.slice(0, topN);
  const placements = [];
  const ci = entries.findIndex(isClient);
  placements.push({ domain: clientNorm || "client", kind: "client", rank: ci >= 0 ? ci + 1 : null, entry: ci >= 0 ? entries[ci] : null, inTop: ci >= 0 && ci < topN });
  const seen = /* @__PURE__ */ new Set();
  for (const t of tracked) {
    const d = normSovDomain(t);
    if (!d || d === clientNorm || seen.has(d))
      continue;
    seen.add(d);
    const i = entries.findIndex((e) => !isClient(e) && normSovDomain(e.domain) === d);
    placements.push({ domain: d, kind: "tracked", rank: i >= 0 ? i + 1 : null, entry: i >= 0 ? entries[i] : null, inTop: i >= 0 && i < topN });
  }
  const tr = placements.slice(1).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.domain.localeCompare(b.domain));
  return { top, placements: [placements[0], ...tr], total: entries.length };
}
var AI_WEAK_BELOW = 0.3;
var AI_STRONG_FROM = 0.5;
function topicVerdict(bestPos, aiRate, dfsShare) {
  const rates = [aiRate, dfsShare].filter((x) => x !== null);
  if (rates.length === 0)
    return "noAiData";
  const weak = rates.every((r) => r < AI_WEAK_BELOW);
  const strong = rates.some((r) => r >= AI_STRONG_FROM);
  const onP1 = bestPos !== null && bestPos <= 10;
  if (onP1 && weak)
    return "arb";
  if (onP1)
    return "dual";
  if (strong)
    return "aiOnly";
  return "none";
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
function buildCategoryToUmbrella(breakdown) {
  const cats = Array.isArray(breakdown?.categories) ? breakdown.categories : [];
  const parentOf = /* @__PURE__ */ new Map();
  const canonical = /* @__PURE__ */ new Map();
  for (const c of cats) {
    const name = String(c?.name ?? "").trim();
    if (!name)
      continue;
    canonical.set(normName(name), name);
    const parent = String(c?.parent ?? "").trim();
    if (parent && normName(parent) !== normName(name))
      parentOf.set(normName(name), normName(parent));
  }
  const out = /* @__PURE__ */ new Map();
  canonical.forEach((disp, key) => {
    let cur = key;
    const seen = /* @__PURE__ */ new Set([cur]);
    while (parentOf.has(cur)) {
      const next = parentOf.get(cur);
      if (seen.has(next))
        break;
      seen.add(next);
      cur = next;
    }
    out.set(key, canonical.get(cur) ?? disp);
  });
  return out;
}
function brandTypedCategoryNames(breakdown) {
  const out = /* @__PURE__ */ new Set();
  for (const c of Array.isArray(breakdown?.categories) ? breakdown.categories : []) {
    if (String(c?.type ?? "") === "brand" && c?.name)
      out.add(normName(String(c.name)));
  }
  return out;
}
function brandOnlyUmbrellaNames(breakdown) {
  const cats = Array.isArray(breakdown?.categories) ? breakdown.categories : [];
  const brand = brandTypedCategoryNames(breakdown);
  for (const c of cats) {
    const parent = normName(String(c?.parent ?? ""));
    const name = normName(String(c?.name ?? ""));
    if (parent && brand.has(parent) && String(c?.type ?? "") !== "brand" && name !== parent)
      brand.delete(parent);
  }
  return brand;
}
function buildProductRows(opts) {
  const { topics, uploadedKeywords, serpPositions, llmProbe, storedScans, clientDomain, brandTerms = [], breakdown, serpScan = null, trackedCompetitors = [] } = opts;
  const clientNorm = normSovDomain(clientDomain);
  const brandToks = buildBrandTokens(clientDomain, brandTerms);
  const catToUmb = buildCategoryToUmbrella(breakdown);
  const brandCats = brandOnlyUmbrellaNames(breakdown);
  const rm = buildRivalRankMap({ uploadedKeywords, serpPositions, serpScan, clientDomain, trackedCompetitors });
  const trackedList = Array.from(rm.trackedAll).sort();
  const probeByUmb = /* @__PURE__ */ new Map();
  for (const c of llmProbe?.categories ?? []) {
    const cat = normName(String(c?.category ?? ""));
    if (!cat)
      continue;
    const umb = normName(catToUmb.get(cat) ?? String(c?.category ?? ""));
    let e = probeByUmb.get(umb);
    if (!e) {
      e = { cm: 0, ct: 0, gm: 0, gt: 0 };
      probeByUmb.set(umb, e);
    }
    e.cm += c?.claudeMentions ?? 0;
    e.ct += c?.claudeTotal ?? 0;
    e.gm += c?.chatgptMentions ?? 0;
    e.gt += c?.chatgptTotal ?? 0;
  }
  const scanByCat = /* @__PURE__ */ new Map();
  for (const s of storedScans ?? [])
    if (s?.category)
      scanByCat.set(normName(s.category), s);
  const byUmbrella = /* @__PURE__ */ new Map();
  for (const t of topics) {
    if (t.parentType === "brand" || t.parentType === "location")
      continue;
    const u = (t.umbrella || t.parentName || "").trim();
    if (!u || normName(u) === "other")
      continue;
    if (brandCats.has(normName(u)))
      continue;
    const arr = byUmbrella.get(u);
    if (arr)
      arr.push(t);
    else
      byUmbrella.set(u, [t]);
  }
  const products = [];
  byUmbrella.forEach((uts, name) => {
    const bands = [0, 0, 0, 0];
    let demand = 0, kwCount = 0;
    const seen = /* @__PURE__ */ new Set();
    const dedup = [];
    for (const t of uts)
      for (const k of t.keywords) {
        const kwLow = k.keyword.toLowerCase().trim();
        if (seen.has(kwLow))
          continue;
        seen.add(kwLow);
        kwCount++;
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
        dedup.push({ keyword: kwLow, searchVolume: v, position: p });
      }
    const { ladder, clientRank: clientRankV } = accumulateLadder(dedup, rm, clientNorm);
    const clientIdx = clientRankV !== null ? clientRankV - 1 : -1;
    const lineScanned = (serpScan?.keywords ?? []).filter((k) => seen.has(String(k?.keyword ?? "").toLowerCase().trim()));
    const lineUploads = (uploadedKeywords ?? []).filter((r) => seen.has(String(r?.keyword ?? "").toLowerCase().trim()));
    const sfr = computeSerpFeatureRollup(lineUploads, lineScanned, clientDomain);
    const serpFeatures = lineScanned.length > 0 || sfr.totalAvail > 0 ? sfr : null;
    const pe = probeByUmb.get(normName(name)) ?? null;
    const probe = pe && pe.ct + pe.gt > 0 ? { mentions: pe.cm + pe.gm, total: pe.ct + pe.gt, claude: `${pe.cm}/${pe.ct}`, gpt: `${pe.gm}/${pe.gt}` } : null;
    const scan = scanByCat.get(normName(name)) ?? null;
    const aiRate = probe && probe.total > 0 ? probe.mentions / probe.total : null;
    let dfsShare = null;
    let citedTop = [];
    if (scan && scan.rows.length > 0) {
      const named = scan.rows.filter((r) => rowNamesClient(r, clientNorm, brandToks)).length;
      dfsShare = named / scan.rows.length;
      const counts = /* @__PURE__ */ new Map();
      for (const r of scan.rows)
        for (const s of r.sources) {
          const d = normSovDomain(s.domain);
          if (!d)
            continue;
          counts.set(d, (counts.get(d) ?? 0) + 1);
        }
      citedTop = Array.from(counts.entries()).map(([d, c]) => ({ domain: d, count: c, isClient: d === clientNorm })).sort((a, b) => b.count - a.count);
    }
    const verdicts = { arb: 0, dual: 0, aiOnly: 0, none: 0 };
    for (const t of uts) {
      const best = t.keywords.reduce((acc, k) => k.position !== null && k.position >= 1 && (acc === null || k.position < acc) ? k.position : acc, null);
      const v = topicVerdict(best, aiRate, dfsShare);
      if (v !== "noAiData")
        verdicts[v]++;
    }
    products.push({
      name,
      topics: uts,
      kwCount,
      demand,
      bands,
      p1Share: demand > 0 ? (bands[0] + bands[1]) / demand : 0,
      ladder,
      clientRank: clientIdx >= 0 ? clientIdx + 1 : null,
      probe,
      scan,
      aiRate,
      dfsShare,
      citedTop,
      arbTopics: verdicts.arb,
      verdicts,
      tracked: trackedList,
      serpFeatures,
      serpScanned: lineScanned.length
    });
  });
  products.sort((a, b) => b.demand - a.demand);
  const kpi = { arb: 0, dual: 0, aiOnly: 0, none: 0, citesClient: 0, citesTotal: 0 };
  for (const p of products) {
    kpi.arb += p.verdicts.arb;
    kpi.dual += p.verdicts.dual;
    kpi.aiOnly += p.verdicts.aiOnly;
    kpi.none += p.verdicts.none;
    for (const c of p.citedTop) {
      kpi.citesTotal += c.count;
      if (c.isClient)
        kpi.citesClient += c.count;
    }
  }
  return { products, kpi, tracked: trackedList, serpScannedKw: rm.scannedKw };
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
function fileTopics(topics, children) {
  const kwToChild = /* @__PURE__ */ new Map();
  children.forEach((c, i) => {
    for (const k of c.allKws)
      kwToChild.set(k.keyword.toLowerCase().trim(), i);
  });
  return topics.map((t) => {
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
function fileTopicsDeep(topics, root) {
  const out = /* @__PURE__ */ new Map();
  const walk = (node, ts) => {
    const kids = node.children ?? [];
    if (kids.length === 0) {
      out.set(node.key, ts);
      return;
    }
    const filed = fileTopics(ts, kids);
    const here = [];
    const perKid = kids.map(() => []);
    ts.forEach((t, i) => {
      const ci = filed[i];
      if (ci < 0)
        here.push(t);
      else
        perKid[ci].push(t);
    });
    out.set(node.key, here);
    kids.forEach((k, i) => walk(k, perKid[i]));
  };
  walk(root, topics);
  return out;
}

// .runs/oiq492.3S6AVK/e.ts
globalThis.__v492 = { buildRivalRankMap, accumulateLadder, buildProductRows, buildCategoryTree, placeInLadder, fileTopicsDeep, SERP_ENTRY_MAX_POS, LADDER_TOP_N };
