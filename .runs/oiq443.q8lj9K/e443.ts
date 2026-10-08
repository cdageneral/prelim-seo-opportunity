import { snapshotHasFootprint, snapshotFootprintCount } from '@/lib/snapshotFootprint';
const cleared = { domain:'x.com', topKeywords: [], gapKeywords: [], positionDist: null, _categoryBreakdown: null };
console.log(JSON.stringify({
  cleared:   snapshotHasFootprint(cleared),
  nullSnap:  snapshotHasFootprint(null),
  bare:      snapshotHasFootprint({}),
  clientOnly:snapshotHasFootprint({ topKeywords: [{keyword:'k'}], gapKeywords: [] }),
  gapOnly:   snapshotHasFootprint({ topKeywords: [], gapKeywords: [{keyword:'g'}] }),
  count:     snapshotFootprintCount({ topKeywords: [1,2,3], gapKeywords: [1,2] }),
  countBad:  snapshotFootprintCount(null),
}));
