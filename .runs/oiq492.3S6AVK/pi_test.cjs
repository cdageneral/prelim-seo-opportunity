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
const { ProductInsightsSection } = globalThis.__pi492;
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react-dom/test-utils");
let f = 0; const c = (b, n) => { console.log((b ? "PASS" : "FAIL") + " :: v492-render: " + n); if (!b) f++; };
const topKeywords = [], keywordCategories = {}, keywordPaths = {};
function addKw(kw, vol, pos, cat, path, url) { topKeywords.push({ keyword: kw, searchVolume: vol, position: pos, url }); keywordCategories[kw] = cat; keywordPaths[kw] = path; }
for (let i = 0; i < 2000; i++) { const theme = "CC Theme " + Math.floor(i / 500); const pos = i < 800 ? (i % 10) + 1 : null; addKw("credit cards kw " + i, 100, pos, theme, ["Credit Cards", theme], pos !== null ? "https://x.com/cc/" + Math.floor(i / 500) : undefined); }
for (let i = 0; i < 1500; i++) { const theme = "MG Theme " + Math.floor(i / 500); addKw("mortgages kw " + i, 100, i < 300 ? (i % 10) + 1 : null, theme, ["Mortgages", theme]); }
const categories = [];
for (let t = 0; t < 4; t++) categories.push({ name: "CC Theme " + t, type: "procedure", parent: "Credit Cards" });
for (let t = 0; t < 3; t++) categories.push({ name: "MG Theme " + t, type: "procedure", parent: "Mortgages" });
const serpApiSnapshot = { keywords: Array.from({ length: 600 }, (_, i) => ({ keyword: "credit cards kw " + i, organicResults: [
  { position: 1, domain: "chase.com", url: "https://chase.com/a" }, { position: 2, domain: "nerdwallet.com", url: "https://nerdwallet.com/b" }, { position: 9, domain: "deep.com", url: "https://deep.com/c" } ] })) };
const analysis = { llmProbe: null, serpApiSnapshot, semrushSnapshot: { domain: "x.com", gapKeywords: [], topKeywords, _categoryBreakdown: { categories, keywordCategories, keywordPaths },
  serpCompetitorPositions: { "rivalbank.com": Array.from({ length: 300 }, (_, i) => ({ keyword: "credit cards kw " + i, position: 5 })) } } };
const uploaded = Array.from({ length: 500 }, (_, i) => ({ keyword: "credit cards kw " + i, domain: "chase.com", position: 3, source: "csv", type: "gap" }));
const rows = Array.from({ length: 100 }, (_, i) => ({ platform: "chat_gpt", modelName: "gpt-4o", question: "q " + i, answerExcerpt: "a " + i, brandEntities: [], searchResultDomains: [],
  sources: [{ domain: "nerdwallet.com", url: "https://nerdwallet.com/a" + i, title: "t" }].concat(i < 20 ? [{ domain: "x.com", url: "https://x.com/p" + i, title: "p" }] : [{ domain: "bankrate.com", url: "https://bankrate.com/b" + i, title: "b" }]),
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
    const rowEl = Array.from(document.querySelectorAll("div")).find(d => d.style && d.style.cursor === "pointer" && (d.textContent || "").startsWith("▶Credit Cards"));
    c(!!rowEl, pfx + "category row found");
    if (!rowEl) continue;
    await click(rowEl);
    let t = document.body.textContent || "";
    c(t.includes("4 MEASURED") && !t.includes("TOP 6 OF 4"), pfx + "page-1 ladder header states N measured (TOP 6 OF only when more than 6 exist)");
    c(t.includes("nerdwallet.com") && !t.includes("top-6 on 600") && !t.includes("rank data:"), pfx + "SERP occupant nerdwallet.com in the ladder — updated 2026-09-15 v7.493 (Wayne): the per-row top-6/rank-data caption is gone");
    c(t.includes("600 SERPs on file") && t.includes("1 SERP occupant qualified"), pfx + "basis line discloses the scan size and how many occupants qualified");
    c(!/deep\.com/.test(t), pfx + "deep.com (#9 only) never enters the ladder");
    c(t.includes("YOU + TRACKED COMPETITORS") && !t.includes("WHERE YOU AND YOUR TRACKED COMPETITORS SIT"), pfx + "placements folded into the one ladder list — updated 2026-09-15 v7.493 (Wayne)");
    c(t.includes("ghost.com") && t.includes("none"), pfx + "a tracked competitor with no hold is listed with an explicit none");
    c(t.includes("x.com (you)") && t.includes("chase.com"), pfx + "you + chase placed");
    c(t.includes("DOMAINS · YOU + TRACKED COMPETITORS"), pfx + "cited ladder is one list with you + tracked — updated 2026-09-15 v7.493 (Wayne)");
    c(t.includes("SERP top-6 occupant") && t.includes("Semrush organic rival") && t.includes("tracked competitor"), pfx + "legend names every kind");
    // topics view from the header counts
    const btn = Array.from(document.querySelectorAll("button")).find(b => /kws · \d+ topics/.test(b.textContent || ""));
    c(!!btn, pfx + "header counts render as the way in");
    if (btn) {
      await click(btn);
      t = document.body.textContent || "";
      c(t.includes("TOPICS & KEYWORDS — CREDIT CARDS"), pfx + "line-level topics view opens");
      c(t.includes("TOPIC · YOUR PAGE") && t.includes("DEMAND/MO"), pfx + "topic table columns");
      const topicRow = Array.from(document.querySelectorAll("div")).find(d => d.style && d.style.cursor === "pointer" && /^▶CC Theme/.test(d.textContent || "") && /kw · /.test(d.textContent || ""));
      c(!!topicRow, pfx + "a topic row is clickable");
      if (topicRow) { await click(topicRow); t = document.body.textContent || ""; c(t.includes("YOUR RANKING PAGE") && /credit cards kw \d+#\d+100\/cc\/0/.test(t), pfx + "topic expands to its keywords with position + volume + page"); }
    }
    // node-level topics
    const nodeRow = Array.from(document.querySelectorAll("div")).find(d => d.style && d.style.cursor === "pointer" && /^▶CC Theme 0/.test(d.textContent || "") && /best rank/.test(d.textContent || ""));
    c(!!nodeRow, pfx + "sub-category node row found");
    if (nodeRow) {
      await click(nodeRow);
      const nb = Array.from(document.querySelectorAll("button")).find(b => /topic[s]? at this level/.test(b.textContent || ""));
      c(!!nb, pfx + "node carries its topics-at-this-level control");
      if (nb) { await click(nb); t = document.body.textContent || ""; c(t.includes("TOPICS FILED AT CC THEME 0"), pfx + "node-level topics view opens"); }
    }
    root.unmount();
  }
  process.exit(f);
})().catch(e => { console.log("FAIL :: v492-render: harness error " + e.message); process.exit(1); });
