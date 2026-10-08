// lib/utils/keywordProvenance.ts
var KEYWORD_SOURCE_LABEL = {
  footprint: "original footprint",
  competitor: "competitor",
  expanded: "expanded"
};
function keywordSource(row) {
  if (row.origin === "demand")
    return "expanded";
  if (row.type === "gap")
    return "competitor";
  return "footprint";
}
function keywordProvenance(summaryRows, dbKeywords) {
  const norm = (s) => (s ?? "").toLowerCase().trim();
  const upClient = new Set(
    dbKeywords.filter((k) => k.source !== "blocked" && k.type !== "gap").map((k) => norm(k.keyword)).filter(Boolean)
  );
  let upload = 0, crawl = 0, demand = 0, gap = 0;
  for (const r of summaryRows) {
    const src = keywordSource(r);
    if (src === "expanded") {
      demand++;
      continue;
    }
    if (src === "competitor") {
      if (r.competitor)
        gap++;
      continue;
    }
    if (upClient.has(norm(r.keyword)))
      upload++;
    else
      crawl++;
  }
  const distinctDb = new Set(
    dbKeywords.filter((k) => k.source !== "blocked").map((k) => norm(k.keyword)).filter(Boolean)
  ).size;
  return {
    upload,
    crawl,
    demand,
    gap,
    total: upload + crawl + demand + gap,
    rawDbRows: dbKeywords.length,
    distinctDb
  };
}

// .runs/oiq438.6fECzn/t_entry.ts
globalThis.__t8 = { keywordSource, keywordProvenance, KEYWORD_SOURCE_LABEL };
