import { narrativePrompt, opportunityPrompt, pptPromptGenerator } from './p';
const overview = { organicKeywords: 10, organicTraffic: 100 } as any;
const serp = { aioSummary: { aioRate: 0.5, clientAIORate: 0.1 } } as any;
const cb = { page1CaptureRate: 0.2, totalMonthlyDemand: 1000, totalPage1Demand: 200 };
const mk = (dist: any) => ({
  domain: 'x.com', overview, competitors: [], gapKeywords: [], topKeywords: [],
  positionDist: dist, positionVol: null,
}) as any;
const out: any = {};
// the exact cleared shape: positionDist null, no footprint
const cleared = mk(null);
out.narrCleared = narrativePrompt('x.com', 'X', 'banking', cleared, serp, null, [], [], cb);
out.oppCleared  = opportunityPrompt('x.com', 'banking', cleared, serp, null);
out.pptCleared  = pptPromptGenerator('X', 'x.com', 'banking', {}, [], cleared, serp, null);
// a real distribution must still be reported verbatim (good path unchanged)
const real = mk({ '1-3': 4, '4-10': 9, '11-20': 137, '21+': 22 });
out.narrReal = narrativePrompt('x.com', 'X', 'banking', real, serp, null, [], [], cb);
out.oppReal  = opportunityPrompt('x.com', 'banking', real, serp, null);
console.log(JSON.stringify(out));
