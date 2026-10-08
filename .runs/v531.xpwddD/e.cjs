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

// lib/category/scopeModel.ts
var norm = (s) => String(s ?? "").toLowerCase().trim();
function buildScopeResolver(snap2, overrides = {}) {
  const cb = snap2?._categoryBreakdown ?? null;
  const autoByNorm = /* @__PURE__ */ new Map();
  const auto = cb?.umbrellaScope ?? {};
  for (const [name, sc] of Object.entries(auto)) {
    if (sc === "core" || sc === "adjacent")
      autoByNorm.set(norm(name), sc);
  }
  const overByNorm = /* @__PURE__ */ new Map();
  const snapOverrides = snap2?._scopeOverrides && typeof snap2._scopeOverrides === "object" ? snap2._scopeOverrides : {};
  for (const [name, sc] of Object.entries(snapOverrides)) {
    if (sc === "core" || sc === "adjacent")
      overByNorm.set(norm(name), sc);
  }
  for (const [name, sc] of Object.entries(overrides ?? {})) {
    if (sc === "core" || sc === "adjacent")
      overByNorm.set(norm(name), sc);
  }
  const scopeOf = (umbrella) => {
    const k = norm(umbrella);
    if (overByNorm.has(k))
      return overByNorm.get(k);
    return autoByNorm.get(k) ?? "core";
  };
  const isAdjacent = (umbrella) => scopeOf(umbrella) === "adjacent";
  const pathByKw = cb?.keywordPaths ?? {};
  const umbrellaOfKeyword = (kwLower) => {
    const p = pathByKw[kwLower];
    return Array.isArray(p) && p.length > 0 ? String(p[0] ?? "").trim() : void 0;
  };
  const isAdjacentKeyword = (kwLower) => {
    const u = umbrellaOfKeyword(kwLower);
    return u ? isAdjacent(u) : false;
  };
  const names = /* @__PURE__ */ new Set();
  for (const name of Object.keys(auto))
    names.add(name);
  for (const name of Object.keys(snapOverrides))
    names.add(name);
  for (const name of Object.keys(overrides ?? {}))
    names.add(name);
  const adjacentUmbrellas = Array.from(names).filter((n) => isAdjacent(n));
  return { scopeOf, isAdjacent, umbrellaOfKeyword, isAdjacentKeyword, adjacentUmbrellas };
}

// lib/keywords/positionBasis.ts
var ORGANIC_TOKENS = ["organic"];
function positionBasisOf(positionType) {
  const raw = String(positionType ?? "").trim();
  if (!raw)
    return "unknown";
  const low = raw.toLowerCase();
  const parts = low.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.some((p) => ORGANIC_TOKENS.includes(p)))
    return "organic";
  return "feature";
}
function featureLabelOf(positionType) {
  const raw = String(positionType ?? "").trim();
  if (!raw)
    return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const feats = parts.filter((p) => !ORGANIC_TOKENS.includes(p.toLowerCase()));
  return feats.length > 0 ? feats.join(", ") : null;
}
function organicPositionOf(position, positionType) {
  const p = position == null ? null : Number(position);
  if (p == null || !Number.isFinite(p) || p < 1)
    return null;
  return positionBasisOf(positionType) === "feature" ? null : p;
}

// lib/utils/kwVolume.ts
function editDistance(a, b) {
  if (a === b)
    return 0;
  const m = a.length, n = b.length;
  if (m === 0)
    return n;
  if (n === 0)
    return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
function extractBrand(domain) {
  return brandRootOf(domain ?? "");
}
function buildCompetitorBrandTokens(snap2, clientDomain, configCompetitorDomains = [], uploadedGapDomains = []) {
  const autoCompDomains = Array.isArray(snap2?.competitors) ? snap2.competitors.map((c) => String(c?.domain ?? "")).filter(Boolean) : [];
  const all = Array.from(new Set(
    [...configCompetitorDomains, ...uploadedGapDomains, ...autoCompDomains].filter(Boolean)
  ));
  const tokens = new Set(all.map(extractBrand).filter((b) => b.length >= 4));
  for (const ct of [clientDomain].map(extractBrand).filter((b) => b.length >= 4))
    tokens.delete(ct);
  return tokens;
}
function textHasCompetitorBrand(text, tokens) {
  const norm2 = (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm2)
    return false;
  for (const tok of Array.from(tokens))
    if (norm2.includes(tok))
      return true;
  return false;
}
function buildExcludedBrandTokens(snap2, explicit = []) {
  const list = Array.isArray(explicit) && explicit.length > 0 ? explicit : Array.isArray(snap2?._excludedBrands) ? snap2._excludedBrands : [];
  const tokens = /* @__PURE__ */ new Set();
  for (const t of list) {
    const norm2 = String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (norm2.length >= 3)
      tokens.add(norm2);
  }
  return tokens;
}
function isBrandedKeyword(keyword, clientDomain, competitorDomains = [], brandTerms = []) {
  if (!keyword)
    return false;
  const kw = keyword.toLowerCase().trim();
  const kwNorm = kw.replace(/[^a-z0-9]/g, "");
  if (!kwNorm)
    return false;
  const cleanTerms = brandTerms.map((t) => (t ?? "").toLowerCase().trim()).filter(Boolean);
  const brandPhrases = cleanTerms.filter((t) => /[\s-]/.test(t));
  const brandWordRoots = cleanTerms.filter((t) => !/[\s-]/.test(t)).map((t) => t.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  if (brandPhrases.length > 0) {
    const norm2 = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ") + " ";
    const kwSpaced = norm2(kw);
    for (const p of brandPhrases) {
      const np = norm2(p);
      if (np !== "  " && kwSpaced.includes(np))
        return true;
    }
  }
  const roots = Array.from(/* @__PURE__ */ new Set([
    ...[clientDomain, ...competitorDomains].map(extractBrand),
    ...brandWordRoots
  ])).filter((b) => b.length >= 2);
  if (roots.length === 0)
    return false;
  const longRoots = roots.filter((b) => b.length >= 4);
  const shortRoots = roots.filter((b) => b.length >= 2 && b.length <= 3);
  if (shortRoots.length > 0) {
    const words = kw.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
    for (const token of shortRoots) {
      for (const w of words) {
        const i = w.indexOf(token);
        if (i < 0)
          continue;
        if (i === 0)
          return true;
        if (i >= 2 && w.length - (i + token.length) >= 2)
          return true;
      }
      const spaced = token.split("").join("\\s+");
      if (new RegExp(`\\b${spaced}\\b`).test(kw))
        return true;
    }
  }
  if (longRoots.length > 0) {
    const tokenSet = new Set(longRoots);
    for (const brand of longRoots) {
      const half = Math.floor(brand.length / 2);
      if (half >= 4)
        tokenSet.add(brand.slice(0, half));
      if (brand.length - half >= 4)
        tokenSet.add(brand.slice(half));
    }
    const allTokens = Array.from(tokenSet);
    for (const token of allTokens) {
      if (kwNorm.includes(token))
        return true;
      if (token.includes(kwNorm) && kwNorm.length >= 4)
        return true;
      if (token.length >= 5 && kwNorm.length >= 4 && token.startsWith(kwNorm))
        return true;
    }
    const kwWords = kw.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 4);
    for (const word of kwWords) {
      for (const token of allTokens) {
        const minLen = Math.min(word.length, token.length);
        const threshold = Math.max(1, Math.floor(minLen / 4));
        if (Math.abs(word.length - token.length) > threshold + 1)
          continue;
        if (editDistance(word, token) <= threshold)
          return true;
      }
    }
  }
  return false;
}
var NON_LATIN_LETTER = new RegExp("(?=\\p{L})\\P{Script=Latin}", "u");
function isForeignScriptKeyword(keyword) {
  return NON_LATIN_LETTER.test(String(keyword ?? ""));
}
function hasStoredCategoryTree(snap2) {
  const cb = snap2?._categoryBreakdown;
  return !!cb && Array.isArray(cb.categories) && cb.categories.length > 0 && !!cb.keywordCategories && Object.keys(cb.keywordCategories).length > 0;
}
function buildClientBrandStrictTest(clientDomain, brandTerms = []) {
  const clientRoot = extractBrand(clientDomain ?? "");
  const strictTerms = (brandTerms ?? []).map((t) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")).filter((tn) => tn.length >= 3);
  return (kw) => {
    const kwNorm = String(kw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!kwNorm)
      return false;
    if (clientRoot.length >= 4 && kwNorm.includes(clientRoot))
      return true;
    for (const tn of strictTerms)
      if (kwNorm.includes(tn))
        return true;
    return false;
  };
}
function buildCompetitorBrandGuards(snap2, clientDomain, compDomains, brandTerms = [], uploadedGapDomains = []) {
  const effectiveBrandTerms = Array.isArray(brandTerms) && brandTerms.length > 0 ? brandTerms : Array.isArray(snap2?._brandTerms) ? snap2._brandTerms : [];
  const isClientBrandedStrict = buildClientBrandStrictTest(clientDomain, effectiveBrandTerms);
  const excludedBrandTokens = buildExcludedBrandTokens(snap2);
  const isExcludedBrand = (kw) => excludedBrandTokens.size > 0 && textHasCompetitorBrand(kw, excludedBrandTokens) && !isClientBrandedStrict(kw);
  const isCompetitorBranded = (kw) => isBrandedKeyword(kw, "", compDomains) && !isClientBrandedStrict(kw);
  const compBrandTokens = buildCompetitorBrandTokens(snap2, clientDomain, compDomains, uploadedGapDomains);
  const isAutoCompetitorBrand = (kw) => textHasCompetitorBrand(kw, compBrandTokens) && !isClientBrandedStrict(kw);
  const cb = snap2?._categoryBreakdown ?? null;
  const cbCats = cb?.categories ?? [];
  const kwCatMap = cb?.keywordCategories ?? {};
  const competitorBrandCats = new Set(
    cbCats.filter((c) => {
      if (!c?.name)
        return false;
      if (isBrandedKeyword(c.name, clientDomain, [], effectiveBrandTerms))
        return false;
      const isBrandType = c.type === "brand";
      const namedLikeCompetitor = compDomains.length > 0 && isBrandedKeyword(c.name, "", compDomains);
      return isBrandType || namedLikeCompetitor;
    }).map((c) => c.name)
  );
  const brandCatExcludedKw = /* @__PURE__ */ new Set();
  if (competitorBrandCats.size > 0) {
    for (const [kwLow, catName] of Object.entries(kwCatMap)) {
      if (competitorBrandCats.has(catName) && !isClientBrandedStrict(kwLow))
        brandCatExcludedKw.add(kwLow);
    }
  }
  for (const k of cb?.brandKeywords ?? []) {
    const kl = String(k ?? "").toLowerCase().trim();
    if (kl && !isClientBrandedStrict(kl))
      brandCatExcludedKw.add(kl);
  }
  const drop = (kwLow, kwRaw) => brandCatExcludedKw.has(kwLow) || isCompetitorBranded(kwRaw) || isAutoCompetitorBrand(kwRaw) || isExcludedBrand(kwRaw);
  return { effectiveBrandTerms, isExcludedBrand, isCompetitorBranded, isAutoCompetitorBrand, brandCatExcludedKw, drop };
}
function buildKwPool({
  semrushSnapshot: snap2,
  uploadedKeywords: uploaded = [],
  clientDomain,
  competitorDomains = [],
  clientVolMin = 0,
  competitorVolMin = 0,
  brandTerms = [],
  includeDemand = false,
  scopeOverrides = {},
  includeAdjacent = false,
  includePending = false
}) {
  const blockedSet = new Set(
    uploaded.filter((k) => k.source === "blocked").map((k) => (k.keyword ?? "").toLowerCase())
  );
  const uploadedGapDomains = uploaded.filter((k) => (k.source ?? "") !== "blocked" && k.type === "gap" && k.domain).map((k) => String(k.domain));
  const compDomains = Array.from(
    new Set([...competitorDomains, ...uploadedGapDomains].filter(Boolean))
  );
  const guards = buildCompetitorBrandGuards(snap2, clientDomain, compDomains, brandTerms, uploadedGapDomains);
  const effectiveBrandTerms = guards.effectiveBrandTerms;
  const isExcludedBrand = guards.isExcludedBrand;
  const isAutoCompetitorBrand = guards.isAutoCompetitorBrand;
  const brandCatExcludedKw = guards.brandCatExcludedKw;
  const dropCompetitorBrand = guards.drop;
  const pool2 = [];
  const seen = /* @__PURE__ */ new Set();
  const uploadedClientByKw = /* @__PURE__ */ new Map();
  for (const k of uploaded) {
    if ((k?.source ?? "") === "blocked" || k?.type === "gap")
      continue;
    const kk = (k?.keyword ?? "").toLowerCase().trim();
    if (kk && !uploadedClientByKw.has(kk))
      uploadedClientByKw.set(kk, k);
  }
  for (const k of snap2?.topKeywords ?? []) {
    const kwLow = (k.keyword ?? "").toLowerCase().trim();
    if (!kwLow || blockedSet.has(kwLow) || seen.has(kwLow))
      continue;
    if (brandCatExcludedKw.has(kwLow))
      continue;
    if (isAutoCompetitorBrand(k.keyword))
      continue;
    if (isExcludedBrand(k.keyword))
      continue;
    if (clientVolMin > 0 && (k.searchVolume ?? 0) < clientVolMin)
      continue;
    seen.add(kwLow);
    const upTwin = uploadedClientByKw.get(kwLow);
    const twinType = upTwin?.positionType ?? upTwin?.position_type ?? null;
    const twinVerified = !!twinType;
    pool2.push({
      keyword: k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position: twinVerified ? organicPositionOf(upTwin.position ?? null, twinType) : k.position ?? null,
      featurePlacement: twinVerified ? featureLabelOf(twinType) ?? void 0 : void 0,
      positionBasisRaw: twinVerified ? String(twinType) : void 0,
      isGap: false,
      isBranded: isBrandedKeyword(k.keyword, clientDomain, [], effectiveBrandTerms),
      // v7.531: client brand only (III.1)
      competitor: null,
      origin: "footprint",
      url: typeof k.url === "string" && k.url.trim() ? k.url.trim() : void 0
      // v7.251: real ranking URL
    });
  }
  const clientByKw = /* @__PURE__ */ new Map();
  for (const p of pool2)
    clientByKw.set(p.keyword.toLowerCase().trim(), p);
  for (const k of uploaded) {
    if ((k.source ?? "") === "blocked")
      continue;
    if (k.type === "gap")
      continue;
    const kwLow = (k.keyword ?? "").toLowerCase().trim();
    if (!kwLow)
      continue;
    if (seen.has(kwLow)) {
      if (typeof k.url === "string" && k.url.trim()) {
        const existing = clientByKw.get(kwLow);
        if (existing && !existing.url)
          existing.url = k.url.trim();
      }
      continue;
    }
    if (brandCatExcludedKw.has(kwLow))
      continue;
    if (isAutoCompetitorBrand(k.keyword))
      continue;
    if (isExcludedBrand(k.keyword))
      continue;
    seen.add(kwLow);
    pool2.push({
      keyword: k.keyword,
      searchVolume: k.search_volume ?? k.searchVolume ?? 0,
      // v7.451: a SERP-feature placement (People also ask, Things to know, …) exports
      // from Semrush with Position = 1. It is presence, not a ranking — so it enters
      // the pool with NO position and its feature label beside it. A row whose basis
      // was never captured (pre-v7.451 upload) keeps its stored position and is
      // reported as unverified rather than silently re-scored (Const I.5).
      position: organicPositionOf(k.position ?? null, k.positionType ?? k.position_type ?? null),
      featurePlacement: featureLabelOf(k.positionType ?? k.position_type ?? null) ?? void 0,
      positionBasisRaw: (k.positionType ?? k.position_type ?? null) || void 0,
      isGap: false,
      isBranded: isBrandedKeyword(k.keyword, clientDomain, [], effectiveBrandTerms),
      // v7.531: client brand only (III.1)
      competitor: null,
      origin: "footprint",
      url: typeof k.url === "string" && k.url.trim() ? k.url.trim() : void 0
      // v7.251: real ranking URL from the uploaded CSV
    });
  }
  for (const k of snap2?.gapKeywords ?? []) {
    const kwLow = (k.keyword ?? "").toLowerCase().trim();
    if (!kwLow || blockedSet.has(kwLow) || seen.has(kwLow))
      continue;
    if (brandCatExcludedKw.has(kwLow) || isBrandedKeyword(k.keyword, clientDomain, compDomains, effectiveBrandTerms) || isAutoCompetitorBrand(k.keyword) || isExcludedBrand(k.keyword))
      continue;
    if (competitorVolMin > 0 && (k.searchVolume ?? 0) < competitorVolMin)
      continue;
    seen.add(kwLow);
    pool2.push({
      keyword: k.keyword,
      searchVolume: k.searchVolume ?? 0,
      position: null,
      isGap: true,
      isBranded: false,
      // guaranteed by the check above
      competitor: k.competitor ?? null,
      origin: "footprint"
    });
  }
  for (const k of uploaded) {
    if ((k.source ?? "") === "blocked")
      continue;
    if (k.type !== "gap")
      continue;
    const kwLow = (k.keyword ?? "").toLowerCase().trim();
    if (!kwLow || seen.has(kwLow))
      continue;
    if (brandCatExcludedKw.has(kwLow) || isBrandedKeyword(k.keyword, clientDomain, compDomains, effectiveBrandTerms) || isAutoCompetitorBrand(k.keyword) || isExcludedBrand(k.keyword))
      continue;
    seen.add(kwLow);
    pool2.push({
      keyword: k.keyword,
      searchVolume: k.search_volume ?? k.searchVolume ?? 0,
      // v7.100: gap rows (competitor uploads) store the COMPETITOR's rank in
      // position — kept in the DB for Share of Voice — so it must not leak into
      // the pool as a client ranking.
      position: null,
      isGap: true,
      isBranded: false,
      // guaranteed by the competitor-brand skip above
      competitor: k.domain ?? null,
      origin: "footprint"
    });
  }
  if (includeDemand) {
    const byKw = new Map(
      pool2.map((p) => [p.keyword.toLowerCase().trim(), p])
    );
    const demandTopics = snap2?._demandUniverse?.topics ?? [];
    for (const t of demandTopics) {
      const kwLow = (t.keyword ?? "").toLowerCase().trim();
      if (!kwLow || blockedSet.has(kwLow))
        continue;
      if (dropCompetitorBrand(kwLow, t.keyword))
        continue;
      const seeds = Array.isArray(t.seeds) ? t.seeds : [];
      const existing = byKw.get(kwLow);
      if (existing) {
        existing.inDemand = true;
        existing.searchVolume = Math.max(existing.searchVolume, t.searchVolume ?? 0);
        existing.demandSeeds = Array.from(/* @__PURE__ */ new Set([...existing.demandSeeds ?? [], ...seeds]));
        continue;
      }
      const item = {
        keyword: t.keyword,
        searchVolume: t.searchVolume ?? 0,
        position: null,
        isGap: false,
        // NOT a competitor gap — it is "missing demand"
        isBranded: isBrandedKeyword(t.keyword, clientDomain, [], effectiveBrandTerms),
        // v7.531: client brand only (III.1)
        competitor: null,
        origin: "demand",
        inDemand: true,
        demandSeeds: seeds
      };
      pool2.push(item);
      byKw.set(kwLow, item);
    }
  }
  let out = pool2;
  if (!includeAdjacent) {
    const scope = buildScopeResolver(snap2, scopeOverrides);
    if (scope.adjacentUmbrellas.length > 0) {
      out = out.filter((p) => !scope.isAdjacentKeyword(p.keyword.toLowerCase().trim()));
    }
  }
  const hiddenRaw = Array.isArray(snap2?._hiddenCategories) ? snap2._hiddenCategories : [];
  if (hiddenRaw.length > 0) {
    const hiddenKeys = [];
    const hiddenNames = /* @__PURE__ */ new Set();
    for (const h of hiddenRaw) {
      if (typeof h === "string") {
        const n2 = h.toLowerCase().trim();
        if (n2)
          hiddenNames.add(n2);
        continue;
      }
      const k = String(h?.key ?? "").toLowerCase().trim();
      if (k) {
        hiddenKeys.push(k);
        continue;
      }
      const n = String(h?.name ?? "").toLowerCase().trim();
      if (n)
        hiddenNames.add(n);
    }
    if (hiddenKeys.length > 0 || hiddenNames.size > 0) {
      const kp = snap2?._categoryBreakdown?.keywordPaths ?? {};
      const kc = snap2?._categoryBreakdown?.keywordCategories ?? {};
      out = out.filter((p) => {
        const kwLow = p.keyword.toLowerCase().trim();
        const path = kp[kwLow];
        if (Array.isArray(path) && path.length > 0) {
          if (hiddenNames.has(String(path[0] ?? "").toLowerCase().trim()))
            return false;
          if (hiddenKeys.length > 0) {
            const joined = path.map((s) => String(s ?? "").trim()).join(" \u203A ").toLowerCase();
            for (const hk of hiddenKeys) {
              if (joined === hk || joined.startsWith(hk + " \u203A "))
                return false;
            }
          }
        }
        const cat = kc[kwLow];
        if (typeof cat === "string" && hiddenNames.has(cat.toLowerCase().trim()))
          return false;
        return true;
      });
    }
  }
  out = out.filter((p) => !isForeignScriptKeyword(p.keyword));
  if (!includePending && hasStoredCategoryTree(snap2)) {
    const kp = snap2?._categoryBreakdown?.keywordPaths ?? {};
    const kc = snap2?._categoryBreakdown?.keywordCategories ?? {};
    out = out.filter((p) => {
      if (p.origin === "demand")
        return true;
      const k = p.keyword.toLowerCase().trim();
      return Array.isArray(kp[k]) && kp[k].length > 0 || typeof kc[k] === "string" && kc[k] !== "";
    });
  }
  return out;
}

// lib/category/pendingCategorization.ts
var OTHER_CATEGORY = "Other";
function domainRoot(domain) {
  const host = String(domain ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const parts = host.split(".").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? "";
}
function buildCandidates(categories, isDropped) {
  const parentOf = /* @__PURE__ */ new Map();
  for (const c of categories ?? []) {
    const nm = String(c?.name ?? "").trim();
    const par = String(c?.parent ?? "").trim();
    if (nm && par && par.toLowerCase() !== nm.toLowerCase())
      parentOf.set(nm.toLowerCase(), par);
  }
  const chainOf = (name) => {
    const chain = [name];
    const seen = /* @__PURE__ */ new Set([name.toLowerCase()]);
    let cur = name;
    for (; ; ) {
      const par = parentOf.get(cur.toLowerCase());
      if (!par || seen.has(par.toLowerCase()))
        break;
      chain.unshift(par);
      seen.add(par.toLowerCase());
      cur = par;
    }
    return chain;
  };
  const out = [];
  const seenNames = /* @__PURE__ */ new Set();
  for (const c of categories ?? []) {
    const name = String(c?.name ?? "").trim();
    if (!name || seenNames.has(name.toLowerCase()))
      continue;
    if (name.toLowerCase() === OTHER_CATEGORY.toLowerCase())
      continue;
    if (isDropped(name, c?.type))
      continue;
    seenNames.add(name.toLowerCase());
    out.push({ n: out.length + 1, name, path: chainOf(name) });
  }
  return out;
}
function buildCategorizePrompt(domain, keywords, candidates, ownBrands = []) {
  const own = ownBrands.length ? ownBrands.join(", ") : domainRoot(domain);
  const cats = candidates.map((c) => `${c.n}. ${c.path.join(" > ")}`).join("\n");
  const kws = keywords.map((k, i) => `${i + 1}. ${k}`).join("\n");
  return `You are filing search keywords into an EXISTING website taxonomy for ${domain}.

CATEGORIES (the only allowed answers):
${cats}

KEYWORDS:
${kws}

Rules:
- For each keyword choose the ONE category whose search intent the keyword matches \u2014 what the searcher is trying to find or do, not a shared word.
- You may ONLY answer with a category number from the list above. Never invent, rename or combine categories.
- If no category matches the keyword's intent closely, answer 0.
- The ONLY brands that belong in these categories are ${domain}'s own brand and its partner brands: ${own}.
  If a keyword names any OTHER company, bank, card issuer, retailer, store, airline, service or website (e.g. "kohls payment", "walmart credit account", "credit one platinum visa", "starz activate"), answer 0 \u2014 even when it is about a credit card or a product in the list.
- Navigation searches for another company's site \u2014 a web address, login, sign-in, activation, bill pay or account page that is not ${domain}'s or a listed partner's \u2014 answer 0.
- Answer every keyword exactly once.

Respond with STRICT JSON only, no prose:
{"a":[[keywordNumber,categoryNumber],...]}`;
}
function parseAssignments(text, keywordCount, candidates) {
  const picks = new Array(keywordCount).fill(void 0);
  const byN = /* @__PURE__ */ new Map();
  for (const c of candidates)
    byN.set(c.n, c);
  let pairs = [];
  const cleaned = String(text ?? "").replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
  try {
    const j = JSON.parse(cleaned);
    pairs = Array.isArray(j?.a) ? j.a : [];
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        pairs = Array.isArray(j?.a) ? j.a : [];
      } catch {
        pairs = [];
      }
    }
  }
  for (const p of pairs) {
    if (!Array.isArray(p) || p.length < 2)
      continue;
    const ki = Number(p[0]) - 1, ci = Number(p[1]);
    if (!Number.isInteger(ki) || ki < 0 || ki >= keywordCount)
      continue;
    if (picks[ki] !== void 0)
      continue;
    if (ci === 0) {
      picks[ki] = null;
      continue;
    }
    const hit = byN.get(ci);
    if (hit)
      picks[ki] = hit;
  }
  let unanswered = 0;
  for (let i = 0; i < picks.length; i++)
    if (picks[i] === void 0)
      unanswered++;
  return { picks, unanswered };
}
function membershipFor(keywords, picks) {
  const paths = {};
  const cats = {};
  let filed = 0, other = 0;
  for (let i = 0; i < keywords.length; i++) {
    const p = picks[i];
    if (p === void 0)
      continue;
    const k = String(keywords[i] ?? "").toLowerCase().trim();
    if (!k)
      continue;
    if (p === null) {
      paths[k] = [OTHER_CATEGORY];
      cats[k] = OTHER_CATEGORY;
      other++;
    } else {
      paths[k] = p.path.slice();
      cats[k] = p.name;
      filed++;
    }
  }
  return { paths, cats, filed, other };
}

// lib/claude/prompts.ts
function hierarchicalDiscoveryPrompt(domain, industry, keywords, anchorTree) {
  const kwList = keywords.map((k, i) => {
    const posLabel = k.clientPosition !== null ? `client pos: ${k.clientPosition}` : "client: unranked";
    return `${i}. ${k.keyword} | ${posLabel} | ${k.searchVolume.toLocaleString()}/mo`;
  }).join("\n");
  const brandHint = domain.replace(/\.(com|net|org|io|co).*$/, "").replace(/[-_]/g, " ");
  const anchorBlock = anchorTree && anchorTree.trim().length > 0 ? `
CANONICAL TAXONOMY \u2014 the tree already established for this website. You MUST file every keyword INTO this tree, reusing these labels EXACTLY as spelled (umbrella and theme levels):
${anchorTree.trim()}

NEVER introduce a new umbrella or a new theme (the top two levels) \u2014 every keyword MUST be filed under one of the umbrella > theme pairs above whose search intent it matches (v7.531, Const III.1e v0.31: the established categories are the boundary). If a keyword's intent matches none of them, use the path ["Other"] \u2014 never a new top-level or theme node, and never a node that means the same as an existing one ("Wills" goes inside the existing "Estate Planning > Wills & Trusts").

CRITICAL \u2014 THE ANCHOR FIXES ONLY THE TOP TWO LEVELS. You MUST still go DEEPER: place every keyword in its MOST-SPECIFIC sub-topic BENEATH the anchored theme (rule 3 applies in full), creating sub-topic nodes as the keywords warrant. "mortgage calculator" \u2192 [..., "Mortgages & Refinancing", "Mortgage Calculators"]; "fha loan" \u2192 [..., "Mortgages & Refinancing", "FHA Loans"]; "refinance rates" \u2192 [..., "Mortgages & Refinancing", "Refinancing", "Refinance Rates"]. A path that STOPS at the theme is correct ONLY when the keyword IS the theme's own generic head term (e.g. "mortgage", "mortgages") \u2014 parking specific keywords at the theme level flattens the tree and is a failure (v7.341).
` : "";
  return `You are organizing a website's organic search keywords into a clean, multi-level SEO content taxonomy \u2014 a tree of pages.

WEBSITE: ${domain}
INDUSTRY: ${industry}
BRAND NAME HINT: "${brandHint}" (use to detect branded keywords)
${anchorBlock}
KEYWORDS (index. keyword | client ranking | monthly search volume):
${kwList}

For EACH keyword, return the full INTENT-FIRST topic PATH it belongs to, the INTENT FAMILY (the user's task), the MODIFIER pulled out of it, its search INTENT, a CONFIDENCE score, and a one-line REASONING. Each path node is a page.

THE PATH IS INTENT-FIRST \u2014 [PRODUCT FAMILY, INTENT GROUP, LEAF] (Const III.9\u2013III.11):
   \u2022 Level 1 = PRODUCT FAMILY (WHAT it's about): "Credit Cards", "Mortgages", \u2026
   \u2022 Level 2 = INTENT GROUP (WHY \u2014 the user's TASK / page cluster): "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card", "Support". This is decided by INTENT, never by a shared product word.
   \u2022 Level 3+ = LEAF (the specific same-page group): "Application", "Requirements", "Rewards", "APR", "Interest Calculator".

RULES \u2014 follow exactly:
1. INTENT decides architecture, never shared words. "apply for a credit card" and "credit card application" are the SAME page \u2192 same leaf under "Getting a Credit Card". "compare credit cards" is a DIFFERENT page \u2192 "Choosing a Credit Card". "what is apr" is a DIFFERENT page \u2192 "Education". They all share the word "credit card" but sit in different intent groups because Google ranks different pages for each task.
2. A QUALIFIER THAT CHANGES THE USER'S TASK IS A NODE, NOT A MODIFIER (Const III.1c, revised). THE TEST: does this term change the page Google would rank? If YES it is a node (an intent group or leaf), NOT a modifier.
   \u2022 KEEP as nodes (task-changing \u2014 each is its own page): apply / application, requirements, eligibility, pre-approval, compare, reviews, vs, alternatives, benefits, how it works, calculator, rates, redeem, cash advance, annual fee, and product-defining facets "no annual fee", "0 APR" / "intro APR", "balance transfer", "cash back", "rewards", "travel", "secured", "student", "business", "for bad credit", "30-year", "15-year", "VA".
   \u2022 Strip as modifiers ONLY purely linguistic adjectives that do NOT change the page: best, top, cheap, good, easy, near me, online, a year like "2025". Even these stay in "modifier" (never dropped from the record) and never become a node.
   CRITICAL \u2014 two-sided failure: over-stripping a task-changing qualifier flattens the tree (FAIL); minting a look-alike leaf for the SAME page over-splits it (FAIL, fixed by rule 2b). "apply for a credit card" \u2192 path ["Credit Cards","Getting a Credit Card","Application"], modifier "". "best travel credit cards" \u2192 path ["Credit Cards","Credit Card Types","Travel"], modifier "best". "credit card interest calculator" \u2192 path ["Credit Cards","Using a Credit Card","Interest Calculator"], modifier "". If there is no linguistic adjective, modifier is "".
2b. THE LEAF IS A SAME-MEANING GROUP \u2014 SAME NEED = SAME LEAF, DIFFERENT NEED = SIBLING LEAF. Keywords one page would satisfy identically share ONE leaf: "apr", "what is an apr", "meaning of apr", "how do aprs work" all express the SAME definitional need \u2192 one leaf ["Credit Cards","Education","APR"]. "apr rates" and "best apr rates" express a DIFFERENT (rate-shopping) need \u2192 a SIBLING leaf ["Credit Cards","Education","APR Rates"] (with "best" as a modifier inside it). A definitional/educational need and a commercial/comparison/rate need are DIFFERENT pages even when they share the head term \u2014 NEVER mix them in one leaf, and never scatter same-meaning phrasings ("what is X" / "X meaning" / "X definition" / bare "X") across different nodes.
3. Path shape: [product family, INTENT GROUP, leaf, \u2026]. Go only as deep as the keyword's specificity warrants (a head term like "credit card application" stops at ["Credit Cards","Getting a Credit Card","Application"]; a bare product head like "credit cards" sits at ["Credit Cards"]). Unlimited depth allowed; do NOT pad with filler levels. NEVER PARK a specific keyword at a broad node: if the keyword names a specific task/variant/definition/rate/calculator, it belongs in a leaf under its intent group \u2014 create that leaf. A keyword sits AT a node only when it IS that node's own generic head term.
4. Level 1 is the broad product/service family (e.g. "Mortgages", "Credit Cards", "Investing"). DISTINCT PRODUCTS ARE DISTINCT LEVEL-1 FAMILIES \u2014 never merge two separate products into one umbrella: "Checking Accounts" and "Savings Accounts" are SEPARATE families, NOT "Checking & Savings Accounts". Level 2 sibling INTENT GROUPS share the family (e.g. "Getting a Credit Card", "Choosing a Credit Card", "Credit Card Types", "Education", "Using a Credit Card" all under "Credit Cards"). A product variant is a LEAF under an intent group ("Rewards" under "Credit Card Types"), never a level-2 sibling of the intent groups.
5. MOST-SPECIFIC, COMMERCIALLY-USEFUL placement. If a keyword could fit more than one place, pick the most specific page-useful node. Parent/child is decided by MEANING, never overlap \u2014 a specific product is never nested under a different specific product. Routing: generic "construction loan" is NOT defaulted under Personal Loans; "home construction loan" \u2192 home/mortgage lending; "business construction loan" \u2192 business lending.
6. type: "procedure" (a real service/product topic), "brand" (the keyword names a company/retailer/store/issuer brand), or "location" (brand/service + a place). ANY third-party brand \u2014 including a co-branded product like "nordstrom card", "amazon store card", "costco visa" \u2014 MUST be type "brand", NEVER "procedure", with path ["<Brand> Brand Searches"]. The client's OWN brand also uses "<Client> Brand Searches". Never put a third-party brand inside a product/procedure umbrella, and never name a procedure path after a non-client brand.
7. intent: one of "informational", "commercial", "transactional", "navigational" \u2014 the searcher's intent.
7b. intentFamily: the user's dominant TASK \u2014 EXACTLY ONE of: learn, definition, education, how-it-works, benefits, faqs, comparison, selection, reviews, alternatives, use-cases, qualification, application, purchase, requirements, eligibility, rates, calculator, management, optimization, support, troubleshooting, maintenance, redemption, merchant-acceptance. This sets the funnel stage (assigned deterministically in code \u2014 do NOT return a stage). It must be consistent with the level-2 intent group (e.g. "Getting a Credit Card" \u2192 application/requirements/eligibility; "Education" \u2192 definition/how-it-works; "Using a Credit Card" \u2192 management/redemption/support). For a brand/location keyword use "learn".
8. confidence: an integer 0\u2013100 = how sure you are of THIS placement. Be honest; a vague or cross-cutting keyword scores low. Below 80 means "needs human review" (still give your best path).
9. reasoning: one short clause explaining the placement (\u2264 12 words).
10. Reuse identical label spellings across keywords so the same node merges. Every index appears exactly once.

Return JSON ONLY \u2014 no markdown, no prose:
{
  "assignments": [
    { "index": 0, "path": ["Credit Cards","Getting a Credit Card","Application"], "modifier": "", "type": "procedure", "intent": "transactional", "intentFamily": "application", "confidence": 95, "reasoning": "'apply' names the getting task" },
    { "index": 1, "path": ["Credit Cards","Credit Card Types","Travel"], "modifier": "best", "type": "procedure", "intent": "commercial", "intentFamily": "selection", "confidence": 92, "reasoning": "travel card type, 'best' is a modifier" },
    { "index": 2, "path": ["Credit Cards","Education","APR"], "modifier": "", "type": "procedure", "intent": "informational", "intentFamily": "definition", "confidence": 90, "reasoning": "definitional APR query" },
    { "index": 3, "path": ["${brandHint} Brand Searches"], "modifier": "", "type": "brand", "intent": "navigational", "intentFamily": "learn", "confidence": 98, "reasoning": "client brand term" }
  ]
}`;
}

// .runs/v531.xpwddD/e.ts
var snap = {
  domain: "quickenloans.com",
  competitors: [],
  topKeywords: [
    { keyword: "quicken loans login", searchVolume: 1e3, position: 1 },
    { keyword: "mortgage calculator", searchVolume: 5e3, position: 3 },
    { keyword: "loan payoff calculator", searchVolume: 4e3, position: 5 }
  ],
  _categoryBreakdown: {
    categories: [{ name: "Mortgages", type: "procedure" }, { name: "Mortgage Calculators", type: "procedure", parent: "Mortgages" }, { name: "Loan Tools", type: "procedure" }, { name: "Brand Searches", type: "brand" }, { name: "Other", type: "procedure" }],
    keywordCategories: { "quicken loans login": "Brand Searches", "mortgage calculator": "Mortgage Calculators", "loan payoff calculator": "Loan Tools" },
    keywordPaths: { "quicken loans login": ["Brand Searches"], "mortgage calculator": ["Mortgages", "Mortgage Calculators"], "loan payoff calculator": ["Loan Tools"] }
  }
};
var up = [{ keyword: "refinance rates", search_volume: 900, type: "gap", domain: "rocketmortgage.com", source: "csv" }];
var args = { semrushSnapshot: snap, uploadedKeywords: up, clientDomain: "quickenloans.com", competitorDomains: ["payoffpro.com"] };
var pool = buildKwPool(args);
var pend = buildKwPool({ ...args, includePending: true });
var noTree = buildKwPool({ ...args, semrushSnapshot: { ...snap, _categoryBreakdown: void 0 } });
var cands = buildCandidates(snap._categoryBreakdown.categories, (n, t) => t === "brand");
var prompt = buildCategorizePrompt("quickenloans.com", ["refinance rates", "zzz"], cands);
var parsed = parseAssignments('{"a":[[1,1],[2,0],[3,9]]}', 3, cands);
var bad = parseAssignments('{"a":[[1,99]]}', 1, cands);
var mem = membershipFor(["Refinance Rates", "zzz", "left"], parsed.picks);
var anch = hierarchicalDiscoveryPrompt("x.com", "banking", [{ keyword: "k", searchVolume: 1, clientPosition: null }], "Mortgages > Mortgage Calculators");
console.log(JSON.stringify({
  calcBranded: pool.find((p) => p.keyword === "loan payoff calculator")?.isBranded,
  loginBranded: pool.find((p) => p.keyword === "quicken loans login")?.isBranded,
  poolKw: pool.map((p) => p.keyword).sort(),
  pendKw: pend.map((p) => p.keyword).sort(),
  noTreeN: noTree.length,
  cands: cands.map((c) => c.n + ":" + c.path.join(">")),
  prompt,
  parsed: parsed.picks.map((p) => p === void 0 ? "U" : p === null ? "0" : p.name),
  unans: parsed.unanswered,
  bad: bad.unanswered,
  mem,
  anch
}));
