// lib/snapshotFootprint.ts
function snapshotFootprintCount(snap) {
  if (!snap || typeof snap !== "object")
    return 0;
  const top = Array.isArray(snap.topKeywords) ? snap.topKeywords.length : 0;
  const gap = Array.isArray(snap.gapKeywords) ? snap.gapKeywords.length : 0;
  return top + gap;
}
function snapshotHasFootprint(snap) {
  return snapshotFootprintCount(snap) > 0;
}

// .runs/oiq443.q8lj9K/e443.ts
var cleared = { domain: "x.com", topKeywords: [], gapKeywords: [], positionDist: null, _categoryBreakdown: null };
console.log(JSON.stringify({
  cleared: snapshotHasFootprint(cleared),
  nullSnap: snapshotHasFootprint(null),
  bare: snapshotHasFootprint({}),
  clientOnly: snapshotHasFootprint({ topKeywords: [{ keyword: "k" }], gapKeywords: [] }),
  gapOnly: snapshotHasFootprint({ topKeywords: [], gapKeywords: [{ keyword: "g" }] }),
  count: snapshotFootprintCount({ topKeywords: [1, 2, 3], gapKeywords: [1, 2] }),
  countBad: snapshotFootprintCount(null)
}));
