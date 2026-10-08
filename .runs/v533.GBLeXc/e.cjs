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
  const roots2 = Array.from(/* @__PURE__ */ new Set([
    ...[clientDomain, ...competitorDomains].map(extractBrand),
    ...brandWordRoots
  ])).filter((b) => b.length >= 2);
  if (roots2.length === 0)
    return false;
  const longRoots = roots2.filter((b) => b.length >= 4);
  const shortRoots = roots2.filter((b) => b.length >= 2 && b.length <= 3);
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

// lib/journey/classifier.ts
function extractBrand2(domain) {
  return brandRootOf(domain ?? "");
}

// lib/journey/contentPlan.ts
function brandTermsOf(clientDomain, snapshot) {
  const root = brandRootOf(String(clientDomain || ""));
  const stored = Array.isArray(snapshot && snapshot._brandTerms) ? snapshot._brandTerms : [];
  const out = [];
  if (root)
    out.push(root);
  for (let i = 0; i < stored.length; i++) {
    const t = String(stored[i] || "").trim();
    if (t)
      out.push(t);
  }
  return out;
}

// .runs/v533.GBLeXc/e.ts
var roots = ["creditcards.chase.com", "https://www.citi.com/", "business.comcast.com", "https://keybank.con", "https://shop.audionova.com/", "hsbc.co.uk", "td.com", "us.etrade.com", "go.amex"].map(brandRootOf);
var snap = { domain: "citi.com", competitors: [], topKeywords: [{ keyword: "best credit cards", searchVolume: 1e3, position: 3 }, { keyword: "chase sapphire", searchVolume: 500, position: 9 }] };
var up = [{ keyword: "credit cards for fair credit", search_volume: 900, type: "gap", domain: "creditcards.chase.com", source: "csv" }, { keyword: "chase freedom", search_volume: 800, type: "gap", domain: "creditcards.chase.com", source: "csv" }];
var pool = buildKwPool({ semrushSnapshot: snap, uploadedKeywords: up, clientDomain: "citi.com", competitorDomains: ["creditcards.chase.com"] }).map((p) => p.keyword).sort();
console.log(JSON.stringify({ roots, kv: extractBrand("creditcards.chase.com"), jx: extractBrand2("business.comcast.com"), bt: brandTermsOf("https://shop.audionova.com/", {})[0], pool }));
