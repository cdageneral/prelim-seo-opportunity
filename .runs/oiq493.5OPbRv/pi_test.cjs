const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://x.test/", pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0); global.cancelAnimationFrame = clearTimeout;
dom.window.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
window.matchMedia = dom.window.matchMedia;
global.IS_REACT_ACT_ENVIRONMENT = true;
require("./pi.cjs");
const { ProductInsightsSection } = globalThis.__pi493;
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react-dom/test-utils");
let f = 0; const c = (b, n) => { console.log((b ? "PASS" : "FAIL") + " :: v493-render: " + n); if (!b) f++; };
const topKeywords = [], keywordCategories = {}, keywordPaths = {};
function addKw(kw, vol, pos, cat, path, url) { topKeywords.push({ keyword: kw, searchVolume: vol, position: pos, url }); keywordCategories[kw] = cat; keywordPaths[kw] = path; }
for (let i = 0; i < 2000; i++) { const theme = "CC Theme " + Math.floor(i / 500); const pos = i < 100 ? 8 : null; addKw("credit cards kw " + i, 100, pos, theme, ["Credit Cards", theme], pos !== null ? "https://x.com/cc/" + Math.floor(i / 500) : undefined); }
const categories = []; for (let t = 0; t < 4; t++) categories.push({ name: "CC Theme " + t, type: "procedure", parent: "Credit Cards" });
// SERP scan on 600 kws: 6 occupants at #1-6 so the top 6 is FULL of occupants; chase (tracked, uploaded rows) lands #7; AIO on 300 (client cited 60), PAA 100 (client 10), video 50 (client 0)
const occ = ["a.com","b.com","c.com","d.com","e.com","f.com"];
const serpApiSnapshot = { keywords: Array.from({ length: 600 }, (_, i) => ({ keyword: "credit cards kw " + i,
  organicResults: occ.map((d, j) => ({ position: j + 1, domain: d })),
  hasAIO: i < 300, aioSources: i < 60 ? [{ domain: "x.com" }] : [{ domain: "nerdwallet.com" }],
  paaQuestions: i < 100 ? ["q"] : [], paaClientCited: i < 10, serpFeatures: i < 50 ? ["video_carousel"] : [], videoClientCited: false })) };
const analysis = { llmProbe: null, serpApiSnapshot, semrushSnapshot: { domain: "x.com", gapKeywords: [], topKeywords, _categoryBreakdown: { categories, keywordCategories, keywordPaths }, serpCompetitorPositions: {} } };
const uploaded = Array.from({ length: 200 }, (_, i) => ({ keyword: "credit cards kw " + i, domain: "chase.com", position: 3, source: "csv", type: "gap" }));
const rows = Array.from({ length: 100 }, (_, i) => ({ platform: "chat_gpt", modelName: "gpt-4o", question: "q " + i, answerExcerpt: "a " + i, brandEntities: [], searchResultDomains: [],
  sources: [{ domain: "nerdwallet.com", url: "https://nerdwallet.com/a" + i, title: "t" }].concat(i < 5 ? [{ domain: "x.com", url: "https://x.com/p" + i, title: "p" }] : [{ domain: "bankrate.com", url: "https://bankrate.com/b" + i, title: "b" }]),
  aiSearchVolume: null, webSearchBased: true, lastResponseAt: "2026-08-10 00:00:00 +00:00" }));
const storedScan = { category: "Credit Cards", query: "credit cards", scannedAt: "2026-08-12T00:00:00Z", totalCount: 1234, fetched: 100, costUSD: 0.2, provider: "dataforseo", rows };
global.fetch = dom.window.fetch = async (url) => { const u = String(url);
  if (u.includes("/keywords")) return { ok: true, json: async () => ({ keywords: uploaded }) };
  if (u.includes("/product-insights")) return { ok: true, json: async () => ({ data: { version: 1, provider: "dataforseo", categories: [storedScan] }, updatedAt: "2026-08-12T00:00:00Z", providerConfigured: true }) };
  return { ok: false, json: async () => ({}) }; };
const props = { projectId: "p1", kwVersion: 0, analysis, competitors: ["chase.com", "ghost.com"], domain: "x.com", brandTerms: [], claudeAssigns: {} };
const click = async (el) => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
(async () => {
  for (const theme of ["dark", "light"]) {
    document.documentElement.className = theme === "dark" ? "dark" : ""; document.documentElement.setAttribute("data-theme", theme);
    document.body.innerHTML = "<div id=\"root\"></div>";
    const root = createRoot(document.getElementById("root"));
    await act(async () => { root.render(React.createElement(ProductInsightsSection, props)); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    const pfx = "[" + theme + "] ";
    let t = document.body.textContent || "";
    c(t.includes("GOOGLE SERP FEATURES · YOU CITED"), pfx + "header carries the SERP-feature block");
    c(t.includes("AI Overviews · 60 of 300") && t.includes("20%"), pfx + "AIO cited 60 of 300 = 20%");
    c(t.includes("People also ask · 10 of 100") && t.includes("10%"), pfx + "PAA cited 10 of 100 = 10%");
    c(t.includes("Video · 0 of 50") && t.includes("0%"), pfx + "Video 0 of 50 = 0%");
    c(t.includes("600 of 2,000 kw SERP-scanned"), pfx + "scanned coverage disclosed");
    const rowEl = Array.from(document.querySelectorAll("div")).find(d => d.style && d.style.cursor === "pointer" && (d.textContent || "").startsWith("▶Credit Cards"));
    await click(rowEl);
    t = document.body.textContent || "";
    c(!t.includes("v7.419"), pfx + "no version number anywhere on the panel");
    c(!t.includes("rank data:") && !t.includes("top-6 on"), pfx + "no per-row captions");
    c(!t.includes("LLM PROBE PROMPTS — THIS CATEGORY") && !t.includes("RECORDED AI QUESTIONS"), pfx + "no category-level prompt drawers");
    c(t.includes("PAGE-1 VOLUME SHARE — MEASURED · TOP 6 OF 8 · YOU + TRACKED COMPETITORS"), pfx + "one list header: top 6 of 8, you + tracked");
    const ladCard = Array.from(document.querySelectorAll("div")).find(d => (d.textContent || "").startsWith("PAGE-1 VOLUME SHARE"));
    const lt = (ladCard ? ladCard.textContent : "").replace(/ /g, " ");
    const iA = lt.indexOf("1a.com"), iF = lt.indexOf("6f.com"), iC = lt.indexOf("7chase.com"), iY = lt.indexOf("8x.com (you)"), iG = lt.indexOf("—ghost.com");
    c(iA >= 0 && iF > iA && iC > iF && iY > iC && iG > iY, pfx + "order: occupants 1-6 → chase at #7 → you at #8 → ghost.com (—) at the bottom, same row shape");
    c(/—ghost\.com\s*none/.test(lt), pfx + "unranked tracked brand shows an explicit none");
    const citCard = Array.from(document.querySelectorAll("div")).find(d => (d.textContent || "").startsWith("WHO GETS CITED"));
    const ct = citCard ? citCard.textContent : "";
    c(/3x\.com \(you\)/.test(ct) && ct.indexOf("—chase.com") > ct.indexOf("3x.com (you)") && /—ghost\.com/.test(ct), pfx + "cited list: you at #3, then the two uncited tracked brands at the bottom");
    root.unmount();
  }
  process.exit(f);
})().catch(e => { console.log("FAIL :: v493-render: harness error " + e.message); process.exit(1); });
