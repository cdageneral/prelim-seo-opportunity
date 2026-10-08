import { coveredTopicList } from '@/lib/productInsights';
const mk = (kw: string, pos: number | null, url?: string) => ({ keyword: kw, searchVolume: 10, position: pos, url });
const childA = { key: 'a', name: 'Rates', kwCount: 2, allKws: [mk('r1', 1, 'https://x.com/r1'), mk('r2', null)] };
const node = { name: 'CDs', children: [childA], allKws: [...childA.allKws, mk('line-kw', 3, 'https://x.com/l')] } as any;
const topics = [
  { product: 'Child topic', keywords: [mk('r1', 1)] },
  { product: 'Line topic',  keywords: [mk('line-kw', 3)] },
];
const line = coveredTopicList({ topics: topics as any, children: node.children, childIdx: -2, domain: 'x.com', clientDomain: 'x.com', node, uploadedKeywords: [] });
const whole = coveredTopicList({ topics: topics as any, children: node.children, childIdx: -1, domain: 'x.com', clientDomain: 'x.com', node, uploadedKeywords: [] });
const child = coveredTopicList({ topics: topics as any, children: node.children, childIdx: 0, domain: 'x.com', clientDomain: 'x.com', node, uploadedKeywords: [] });
console.log(JSON.stringify({ line: line.map(r => r.topic), whole: whole.length, child: child.map(r => r.topic) }));
