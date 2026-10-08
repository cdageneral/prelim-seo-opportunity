import { runFullSynthesis } from '@/lib/claude/synthesize';
(async () => {
  const empty = { domain: 'x.com', overview: { organicKeywords: 0, organicTraffic: 0 },
    competitors: [], gapKeywords: [], topKeywords: [], positionDist: null } as any;
  let msg = '';
  try { await runFullSynthesis('x.com', 'X', 'banking', empty, { aioSummary: { aioRate: 0, clientAIORate: 0 } } as any, null); }
  catch (e: any) { msg = String(e?.message ?? e); }
  console.log(JSON.stringify({ msg }));
})();
