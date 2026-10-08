import { buildScanPlan, scanQueryFor, projectedScanCost, projectedScanTime, type CatNode, type StoredCatScan } from '@/lib/productInsights';
const node = (name: string, depth: number, path: string[], children: CatNode[] = []): CatNode => ({
  key: path.join(' › '), name, depth, path, children,
  kwCount: 0, demand: 0, bands: [0,0,0,0], p1Share: 0, ladder: [], clientRank: null,
  scan: null, dfsShare: null, citedTop: [], bestPos: null, kws: [], allKws: [],
} as any);
// a real shape: product -> theme -> leaf named for its POSITION, not for the world
const leafA = node('No Annual Fee', 3, ['Business Credit Cards','Card Types','No Annual Fee']);
const leafB = node('Requirements',  3, ['Business Credit Cards','Card Types','Requirements']);
const theme = node('Card Types',    2, ['Business Credit Cards','Card Types'], [leafA, leafB]);
const other = node('Rewards',       2, ['Business Credit Cards','Rewards']);
const root  = node('Business Credit Cards', 1, ['Business Credit Cards'], [theme, other]);
const scans: StoredCatScan[] = [
  { category: 'Business Credit Cards › Rewards', query: 'x', scannedAt: '', totalCount: 1, fetched: 1, costUSD: 0.30, provider: 'dataforseo', rows: [], durationMs: 4000 } as any,
  { category: 'Business Credit Cards', query: 'x', scannedAt: '', totalCount: 1, fetched: 1, costUSD: 0.40, provider: 'dataforseo', rows: [], durationMs: 6000 } as any,
];
console.log(JSON.stringify({
  full:     buildScanPlan(root, [], { skipScanned: false }).map(t => [t.key, t.depth, t.query]),
  skipping: buildScanPlan(root, scans).map(t => t.key),
  queries:  { leaf: scanQueryFor(leafA), req: scanQueryFor(leafB), root: scanQueryFor(root) },
  cost:     projectedScanCost(scans, 10),
  time:     projectedScanTime(scans, 10),
  noHistCost: projectedScanCost([], 10),
  noHistTime: projectedScanTime([{ ...(scans[0] as any), durationMs: undefined }] as any, 10),
}));
