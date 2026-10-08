require("./e.cjs");
const { buildProductRows, computeSerpFeatureRollup } = globalThis.__v493;
let f = 0; const c = (b, n) => { console.log((b ? "PASS" : "FAIL") + " :: v493-basis: " + n); if (!b) f++; };
const kws = Array.from({ length: 100 }, (_, i) => ({ keyword: "mortgage kw " + i, searchVolume: 100, position: i < 20 ? 3 : null }));
const other = Array.from({ length: 50 }, (_, i) => ({ keyword: "savings kw " + i, searchVolume: 100, position: null }));
const topics = [
  { id: "t1", parentName: "Rates", umbrella: "Mortgages", parentType: "procedure", product: "Rates", productKey: "r", intent: "commercial", stage: "Decision", contentType: "", contentIcon: "", keywords: kws, totalVolume: 10000 },
  { id: "t2", parentName: "Savings", umbrella: "Savings", parentType: "procedure", product: "Savings", productKey: "s", intent: "commercial", stage: "Decision", contentType: "", contentIcon: "", keywords: other, totalVolume: 5000 },
];
// SERP scan: 40 mortgage kws scanned — 30 with AIO (client cited in 6), 20 with PAA (client 5), 10 video (client 0);
// 50 savings kws scanned all with AIO, client cited in all — must NOT leak into Mortgages
const serpScan = { keywords: [
  ...Array.from({ length: 40 }, (_, i) => ({ keyword: "mortgage kw " + i, organicResults: [{ position: 2, domain: "nerdwallet.com" }],
    hasAIO: i < 30, aioSources: i < 6 ? [{ domain: "www.x.com" }] : [{ domain: "bankrate.com" }],
    paaQuestions: i < 20 ? ["q"] : [], paaClientCited: i < 5, serpFeatures: i < 10 ? ["video_carousel"] : [], videoClientCited: false })),
  ...Array.from({ length: 50 }, (_, i) => ({ keyword: "savings kw " + i, organicResults: [], hasAIO: true, aioSources: [{ domain: "x.com" }], paaQuestions: [], paaClientCited: false, serpFeatures: [], videoClientCited: false })),
] };
// uploaded rows: 5 UNscanned mortgage kws flagged "AI overview" by Semrush → available +5, cited unknown
const uploaded = Array.from({ length: 5 }, (_, i) => ({ keyword: "mortgage kw " + (60 + i), domain: "x.com", position: null, source: "csv", serpFeatures: "AI overview, People also ask" }));
const built = buildProductRows({ topics, uploadedKeywords: uploaded, serpPositions: {}, llmProbe: null, storedScans: [], clientDomain: "x.com", breakdown: null, serpScan, trackedCompetitors: [] });
const m = built.products.find(p => p.name === "Mortgages"); const sv = built.products.find(p => p.name === "Savings");
c(!!m && !!m.serpFeatures, "Mortgages carries serpFeatures");
c(m.serpScanned === 40, "scanned count scoped to the line (40, not 90)");
c(m.serpFeatures.aioAvail === 35 && m.serpFeatures.aioAcq === 6 && m.serpFeatures.aioRate === 17, "AIO: 30 scanned + 5 Semrush-flagged = 35 available, cited in 6 → 17% (shared roll-up math)");
c(m.serpFeatures.paaAvail === 25 && m.serpFeatures.paaAcq === 5 && m.serpFeatures.paaRate === 20, "PAA: 20 + 5 = 25 available, cited 5 → 20%");
c(m.serpFeatures.videoAvail === 10 && m.serpFeatures.videoAcq === 0 && m.serpFeatures.videoRate === 0, "Video: 10 available, cited 0 → 0%");
c(sv.serpFeatures.aioAvail === 50 && sv.serpFeatures.aioAcq === 50 && sv.serpFeatures.aioRate === 100, "Savings reads ITS keywords only (50/50 = 100%) — no cross-line leak");
const direct = computeSerpFeatureRollup(uploaded, serpScan.keywords.filter(k => k.keyword.startsWith("mortgage")), "x.com");
c(JSON.stringify(direct) === JSON.stringify(m.serpFeatures), "row value == a direct call of the shared roll-up on the same inputs (II.7)");
const none = buildProductRows({ topics: [topics[1]], uploadedKeywords: [], serpPositions: {}, llmProbe: null, storedScans: [], clientDomain: "x.com", breakdown: null, serpScan: null, trackedCompetitors: [] });
c(none.products[0].serpFeatures === null && none.products[0].serpScanned === 0, "no scan + no feature cells → null (honest gap, I.5), never a 0%");
process.exit(f);
