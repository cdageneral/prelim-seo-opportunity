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
function buildCompetitorBrandTokens(snap, clientDomain, configCompetitorDomains = [], uploadedGapDomains = []) {
  const autoCompDomains = Array.isArray(snap?.competitors) ? snap.competitors.map((c) => String(c?.domain ?? "")).filter(Boolean) : [];
  const all = Array.from(new Set(
    [...configCompetitorDomains, ...uploadedGapDomains, ...autoCompDomains].filter(Boolean)
  ));
  const tokens = new Set(all.map(extractBrand).filter((b) => b.length >= 4));
  for (const ct of [clientDomain].map(extractBrand).filter((b) => b.length >= 4))
    tokens.delete(ct);
  return tokens;
}
function textHasCompetitorBrand(text, tokens) {
  const norm = (text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm)
    return false;
  for (const tok of Array.from(tokens))
    if (norm.includes(tok))
      return true;
  return false;
}
function buildExcludedBrandTokens(snap, explicit = []) {
  const list = Array.isArray(explicit) && explicit.length > 0 ? explicit : Array.isArray(snap?._excludedBrands) ? snap._excludedBrands : [];
  const tokens = /* @__PURE__ */ new Set();
  for (const t of list) {
    const norm = String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (norm.length >= 3)
      tokens.add(norm);
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
    const norm = (s) => " " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ") + " ";
    const kwSpaced = norm(kw);
    for (const p of brandPhrases) {
      const np = norm(p);
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
function buildCompetitorBrandGuards(snap, clientDomain, compDomains, brandTerms = [], uploadedGapDomains = []) {
  const effectiveBrandTerms = Array.isArray(brandTerms) && brandTerms.length > 0 ? brandTerms : Array.isArray(snap?._brandTerms) ? snap._brandTerms : [];
  const isClientBrandedStrict = buildClientBrandStrictTest(clientDomain, effectiveBrandTerms);
  const excludedBrandTokens = buildExcludedBrandTokens(snap);
  const isExcludedBrand = (kw) => excludedBrandTokens.size > 0 && textHasCompetitorBrand(kw, excludedBrandTokens) && !isClientBrandedStrict(kw);
  const isCompetitorBranded = (kw) => isBrandedKeyword(kw, "", compDomains) && !isClientBrandedStrict(kw);
  const compBrandTokens = buildCompetitorBrandTokens(snap, clientDomain, compDomains, uploadedGapDomains);
  const isAutoCompetitorBrand = (kw) => textHasCompetitorBrand(kw, compBrandTokens) && !isClientBrandedStrict(kw);
  const cb = snap?._categoryBreakdown ?? null;
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
function buildCompetitorBrandDropTest(snap, clientDomain, competitorDomains = [], brandTerms = []) {
  const compDomains = Array.from(new Set((competitorDomains ?? []).filter(Boolean)));
  const g = buildCompetitorBrandGuards(snap, clientDomain, compDomains, brandTerms);
  return (keyword) => {
    const kwRaw = String(keyword ?? "");
    const kwLow = kwRaw.toLowerCase().trim();
    if (!kwLow)
      return false;
    return g.drop(kwLow, kwRaw);
  };
}

// .runs/oiq439.2N1rLL/t_entry.ts
globalThis.__t9 = { buildCompetitorBrandDropTest, isBrandedKeyword };
