require("./e.cjs");
const { buildRivalRankMap, accumulateLadder, buildProductRows, buildCategoryTree, placeInLadder, fileTopicsDeep, SERP_ENTRY_MAX_POS, LADDER_TOP_N } = globalThis.__v492;
let f = 0; const c = (b, n) => { console.log((b ? "PASS" : "FAIL") + " :: v492-basis: " + n); if (!b) f++; };
c(SERP_ENTRY_MAX_POS === 6 && LADDER_TOP_N === 6, "the two requested limits are 6 (Wayne 2026-09-15 — the one I.6 exception this release)");
// fixture: 200 Mortgages kws @100/mo, client p1 on first 40; chase tracked p1 on 100 (uploaded rows);
// rivalbank Semrush rival p1 on 60; SERP scan on 150 kws: nerdwallet #2 on all 150 (qualifies),
// deep.com #8 on all 150 (page-1 volume but NEVER top-6 → excluded), chase #1 in the SERP on all
// (must NOT change chase — uploaded rows own its positions), x.com (client) #1 (ignored).
const N = 200;
const kws = Array.from({ length: N }, (_, i) => ({ keyword: "mortgage kw " + i, searchVolume: 100, position: i < 40 ? 3 : null, url: i < 40 ? "https://x.com/m/" + i : undefined }));
const uploaded = Array.from({ length: 100 }, (_, i) => ({ keyword: "mortgage kw " + i, domain: "chase.com", position: 2, source: "csv" }));
const serpPositions = { "rivalbank.com": Array.from({ length: 60 }, (_, i) => ({ keyword: "mortgage kw " + i, position: 5 })) };
const serpScan = { keywords: Array.from({ length: 150 }, (_, i) => ({ keyword: "Mortgage KW " + i, organicResults: [
  { position: 1, domain: "www.chase.com" }, { position: 2, domain: "nerdwallet.com" }, { position: 3, domain: "x.com" }, { position: 8, domain: "deep.com" } ] })) };
const rm = buildRivalRankMap({ uploadedKeywords: uploaded, serpPositions, serpScan, clientDomain: "x.com", trackedCompetitors: ["chase.com", "ghost.com"] });
c(rm.scannedKw === 150, "SERP rows read = 150 (disclosure count)");
c(rm.kindOf.get("chase.com") === "tracked" && rm.kindOf.get("rivalbank.com") === "rival" && rm.kindOf.get("nerdwallet.com") === "serp" && rm.kindOf.get("deep.com") === "serp", "kinds: uploaded=tracked, Semrush=rival, SERP-only=serp");
c(rm.perKw.get("mortgage kw 0").get("chase.com") === 2, "precedence: uploaded rows own chase (#2 kept, SERP #1 ignored)");
c(!rm.perKw.get("mortgage kw 0").has("x.com"), "client never enters the rival map");
c(rm.serpEntry.get("nerdwallet.com").size === 150 && !rm.serpEntry.has("deep.com"), "top-6 ticket: nerdwallet on 150 kws, deep.com (#8) holds none");
c(rm.trackedAll.has("ghost.com") && rm.trackedAll.has("chase.com"), "tracked set = uploaded-row domains ∪ project competitor list");
const acc = accumulateLadder(kws.map(k => ({ keyword: k.keyword, searchVolume: k.searchVolume, position: k.position })), rm, "x.com");
const by = Object.fromEntries(acc.ladder.map(e => [e.domain, e]));
c(by["chase.com"] && by["chase.com"].p1Vol === 10000 && by["chase.com"].kind === "tracked", "chase = 100 kw × 100 = 10,000 page-1 volume, tracked");
c(by["nerdwallet.com"] && by["nerdwallet.com"].p1Vol === 15000 && by["nerdwallet.com"].kind === "serp" && by["nerdwallet.com"].top6Kw === 150, "nerdwallet enters as a SERP occupant: 15,000 held, top-6 on 150");
c(!by["deep.com"], "deep.com (page-1 at #8, never top-6) is NOT in the ladder");
c(by["rivalbank.com"] && by["rivalbank.com"].p1Vol === 6000 && by["rivalbank.com"].kind === "rival", "rivalbank 6,000 held, Semrush rival");
c(by["x.com"] && by["x.com"].kind === "client" && by["x.com"].p1Vol === 4000 && acc.clientRank === 4, "client 4,000 held → #4 of 4 (client hold read from the pool, never the SERP)");
c(acc.ladder.map(e => e.domain).join(",") === "nerdwallet.com,chase.com,rivalbank.com,x.com", "ladder sorted by held volume desc");
// zero-regression: without a SERP scan the ladder is byte-identical to the v7.419 basis
const rm0 = buildRivalRankMap({ uploadedKeywords: uploaded, serpPositions, serpScan: null, clientDomain: "x.com" });
const acc0 = accumulateLadder(kws.map(k => ({ keyword: k.keyword, searchVolume: k.searchVolume, position: k.position })), rm0, "x.com");
const strip = l => l.filter(e => e.kind !== "serp").map(e => ({ ...e, top6Kw: undefined }));
c(JSON.stringify(strip(acc.ladder)) === JSON.stringify(acc0.ladder), "every pre-v7.492 entry is byte-identical with or without the SERP scan (the scan only ADDS)");
// placements
const pl = placeInLadder(acc.ladder, "x.com", ["chase.com", "ghost.com"], e => e.kind === "client", 2);
c(pl.top.length === 2 && pl.total === 4, "top slice honours N; total = full list");
c(pl.placements[0].kind === "client" && pl.placements[0].rank === 4 && pl.placements[0].inTop === false, "client placement: #4, not in the top");
c(pl.placements[1].domain === "chase.com" && pl.placements[1].rank === 2 && pl.placements[1].inTop === true, "tracked in the top: chase #2, inTop");
c(pl.placements[2].domain === "ghost.com" && pl.placements[2].rank === null && pl.placements[2].entry === null, "tracked with no hold: ghost.com rank null (stated, never hidden)");
// buildProductRows carries `tracked` and threads the scan through (II.7)
const topics = [
  { id: "t1", parentName: "Rates", umbrella: "Mortgages", parentType: "procedure", product: "Rates", productKey: "rates", intent: "commercial", stage: "Decision", contentType: "", contentIcon: "", keywords: kws.slice(0, 100), totalVolume: 10000 },
  { id: "t2", parentName: "Calculators", umbrella: "Mortgages", parentType: "procedure", product: "Calc", productKey: "calc", intent: "commercial", stage: "Decision", contentType: "", contentIcon: "", keywords: kws.slice(100, 200), totalVolume: 10000 },
];
const keywordPaths = {}; kws.forEach((k, i) => { keywordPaths[k.keyword] = i < 100 ? ["Mortgages", "Rates"] : ["Mortgages", "Calculators"]; });
const breakdown = { categories: [{ name: "Rates", type: "procedure", parent: "Mortgages" }, { name: "Calculators", type: "procedure", parent: "Mortgages" }], keywordPaths };
const built = buildProductRows({ topics, uploadedKeywords: uploaded, serpPositions, llmProbe: null, storedScans: [], clientDomain: "x.com", breakdown, serpScan, trackedCompetitors: ["chase.com", "ghost.com"] });
const p = built.products[0];
c(p && p.ladder.some(e => e.domain === "nerdwallet.com" && e.kind === "serp") && p.tracked.join(",") === "chase.com,ghost.com" && built.serpScannedKw === 150, "buildProductRows: SERP occupant in the line ladder, tracked list + scanned count exposed");
const tree = buildCategoryTree("Mortgages", { breakdown, poolKeywords: kws, uploadedKeywords: uploaded, serpPositions, storedScans: [], clientDomain: "x.com", serpScan, trackedCompetitors: ["chase.com"] });
const rates = tree.children.find(n => n.name === "Rates");
c(rates && rates.ladder.some(e => e.domain === "nerdwallet.com" && e.kind === "serp" && e.p1Vol === 10000), "sub-category node ladder reads the SAME map: nerdwallet 100 kw × 100 under Rates (II.7)");
c(JSON.stringify(tree.ladder.map(e => [e.domain, e.p1Vol])) === JSON.stringify(acc.ladder.map(e => [e.domain, e.p1Vol])), "root node ladder == product-line ladder (one accumulation)");
// deep filing partitions the topic list
const filed = fileTopicsDeep(topics, tree);
let total = 0; filed.forEach(v => { total += v.length; });
c(total === topics.length, "fileTopicsDeep: every topic lands in exactly one node (partition)");
c((filed.get(rates.key) || []).length === 1 && (filed.get(rates.key) || [])[0].id === "t1", "Rates holds t1 (its 100 keywords all sit there)");
c((filed.get(tree.key) || []).length === 0, "nothing stays at the line level when every topic files into a child");
process.exit(f);
