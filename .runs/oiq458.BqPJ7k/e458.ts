import { buildContentFootprint, buildJourneyRequirement, clientPagesForTopics } from '@/lib/productInsights';
const mk = (kw: string, pos: number | null, url?: string) => ({ keyword: kw, searchVolume: 10, position: pos, url });
const childA = { key: 'a', name: 'Rates', kwCount: 3, allKws: [mk('r1', 1, 'https://x.com/r1'), mk('r2', 2, 'https://x.com/r2'), mk('r3', null)] };
const childB = { key: 'b', name: 'Education', kwCount: 2, allKws: [mk('e1', 5, 'https://x.com/e1'), mk('e2', null)] };
const node = { name: 'CDs', children: [childA, childB], allKws: [...childA.allKws, ...childB.allKws, mk('line-kw', 3, 'https://x.com/l')] } as any;
const topics = [
  { keywords: [mk('r1', 1), mk('r2', 2), mk('e1', 5)] },
  { keywords: [mk('e1', 5), mk('e2', null)] },
  { keywords: [mk('line-kw', 3)] },
];
const jr = buildJourneyRequirement(topics as any, node.children);
const cf = buildContentFootprint({ node, uploadedKeywords: [], serpPositions: {}, clientDomain: 'x.com', topics: topics as any });
const cfNo = buildContentFootprint({ node, uploadedKeywords: [], serpPositions: {}, clientDomain: 'x.com' });
const chip = clientPagesForTopics([{ keywords: node.allKws }] as any);
console.log(JSON.stringify({ jr, cfj: cf.journey, cfNoNull: cfNo.journey === null, chip, cfClient: cf.brands.find(b => b.kind === 'client')!.total }));
