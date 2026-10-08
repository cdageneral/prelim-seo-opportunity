import { parseKeywordCsv, parseKeywordCsvMeta } from '@/lib/keywords/csvParse';
import { buildContentFootprint, clientTopicsCovered, coveredTopicList } from '@/lib/productInsights';
// 1) the parser: Semrush Positions export shape, quoted commas, URL + Position Type
const csv = 'Keyword,Position,Position Type,Search Volume,URL,SERP Features by Keyword\n"cd rates, best",1,Organic,900,https://x.com/cd-rates,"Featured snippet, People also ask"\ncd ladder,4,"People also ask",300,https://x.com/ladder,\n';
const rows = parseKeywordCsv(csv);
const meta = parseKeywordCsvMeta(csv);
// 2) modal-lineage aliases still parse (ph/nq/po)
const alias = parseKeywordCsv('Ph,Po,Nq\nsavings rates,3,500\n');
// 3) coverage: same fixture family as v458 — one URL ranking in two children
const mk = (kw: string, pos: number | null, url?: string) => ({ keyword: kw, searchVolume: 10, position: pos, url });
const childA = { key: 'a', name: 'Rates', kwCount: 3, allKws: [mk('r1', 1, 'https://x.com/multi'), mk('r2', 2, 'https://x.com/multi'), mk('r3', null)] };
const childB = { key: 'b', name: 'Education', kwCount: 2, allKws: [mk('e1', 5, 'https://x.com/multi'), mk('e2', null)] };
const node = { name: 'CDs', children: [childA, childB], allKws: [...childA.allKws, ...childB.allKws, mk('line-kw', 3, 'https://x.com/l')] } as any;
const topics = [
  { product: 'Rates head', keywords: [mk('r1', 1), mk('r2', 2)] },        // childA — covered by client
  { product: 'Edu head',   keywords: [mk('e1', 5), mk('e2', null)] },     // childB — covered by client
  { product: 'Uncovered',  keywords: [mk('r3', null)] },                  // childA — NOT covered
  { product: 'Line topic', keywords: [mk('line-kw', 3)] },                // line level — covered
];
// rival uploaded WITHOUT urls (the etrade case): ranks only
const uploaded = [
  { keyword: 'r1', domain: 'rival.com', position: 2, source: 'csv' },
  { keyword: 'r3', domain: 'rival.com', position: 5, source: 'csv' },
];
const cf = buildContentFootprint({ node, uploadedKeywords: uploaded, serpPositions: {}, clientDomain: 'x.com', topics: topics as any });
const you = cf.brands.find(b => b.kind === 'client')!;
const rival = cf.brands.find(b => b.domain === 'rival.com')!;
const drill = coveredTopicList({ topics: topics as any, children: node.children, childIdx: 0, domain: 'rival.com', clientDomain: 'x.com', node, uploadedKeywords: uploaded });
console.log(JSON.stringify({
  rows, metaFlags: [meta.hasPositionType, meta.hasUrl, meta.hasSerpFeatures], alias,
  youCov: you.covered, rivalCov: rival.covered, chip: clientTopicsCovered(topics as any),
  order0: cf.brands[0].domain, drill,
}));
