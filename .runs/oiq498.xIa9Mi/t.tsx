import { createCsvFeeder, computeAll, ProfoundReadError, fmtBytes } from '@/components/brief/ProfoundVisibilitySection';
function ref(text: string) { const out: string[][] = []; let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; let field = ''; let row: string[] = []; let inQ = false; const len = text.length;
  while (i < len) { const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; } field += c; i++; continue; }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; out.push(row); row = []; i++; continue; }
    field += c; i++; }
  if (field.length > 0 || row.length > 0) { row.push(field); out.push(row); } return out; }
(async () => {
  const alpha = ['a', 'b', ',', '"', '""', '\n', '\r', '\r\n', ' ', 'é', '👍', '﻿'];
  let seed = 98; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let fuzzFails = 0, cases = 0;
  for (let t = 0; t < 3000; t++) {
    let s = rnd() < 0.3 ? '﻿' : ''; const n = Math.floor(rnd() * 80);
    for (let k = 0; k < n; k++) s += alpha[Math.floor(rnd() * alpha.length)];
    const want = JSON.stringify(ref(s));
    for (let r = 0; r < 5; r++) {
      const got: string[][] = []; const f = createCsvFeeder((row) => got.push(row));
      let i = 0; while (i < s.length) { const step = 1 + Math.floor(rnd() * (r === 0 ? 1 : 9)); f.push(s.slice(i, i + step), false); i += step; }
      f.push('', true); cases++;
      if (JSON.stringify(got) !== want) fuzzFails++;
    }
  }
  // a Responses export in the real header shape, quoted "Sentiment, Visibility" type, embedded newlines
  const hdr = '﻿"run_id","date","platform","topic","type","prompt","mentions","response","mentioned?"\n';
  let body = '';
  const brands = ['Aflac Insurance', 'MetLife', 'Guardian', 'Cigna'];
  for (let k = 0; k < 6000; k++) {
    const ms = brands.filter((_, bi) => (k * (bi + 3)) % 5 < 2);
    const typ = k % 3 === 0 ? 'Sentiment, Visibility' : 'Visibility';
    body += `"r${k}","2026-09-${10 + (k % 5)}","${k % 2 ? 'ChatGPT' : 'Google AI Overviews'}","Topic ${k % 7}","${typ}","Which plan ${k % 40}?","${ms.join(', ')}","line one\nline ""two"", three","${ms.includes('Aflac Insurance') ? 'Yes' : 'No'}"\r\n`;
  }
  const csv = hdr + body;
  const blob = new Blob([csv]);
  let textCalls = 0;
  const streamed: any = { name: 'responses.csv', size: blob.size, stream: () => blob.stream(), text: () => { textCalls++; return blob.text(); } };
  const textOnly: any = { name: 'responses.csv', size: blob.size, text: () => blob.text() };
  const progress: any[] = [];
  const mS: any = await computeAll({ visibility: streamed } as any, 'x', (p) => { if (p) progress.push(p); });
  const mT: any = await computeAll({ visibility: textOnly } as any, 'x', () => {});
  const strip = (m: any) => { const c = { ...m }; delete c.updatedAt; return JSON.stringify(c); };
  const failing: any = { name: 'big.csv', size: 858079417, stream: () => new ReadableStream({ pull(ctl) { ctl.error(new Error('NotReadableError: simulated')); } }), text: () => { throw new Error('text() must not be called'); } };
  let readErr: any = null; try { await computeAll({ visibility: failing } as any, 'x', () => {}); } catch (e) { readErr = e; }
  const last = progress[progress.length - 1] || {};
  console.log(JSON.stringify({ cases, fuzzFails, textCalls, same: strip(mS) === strip(mT), totalRuns: mS.totalRuns, client: mS.client,
    lastBytes: last.bytes, lastTotal: last.totalBytes, blobSize: blob.size, lastPct: last.pct, labels: Array.from(new Set(progress.map((p) => p.label))),
    isReadErr: readErr instanceof ProfoundReadError, readMsg: readErr && readErr.message, gb: fmtBytes(858079417), mb: fmtBytes(156081219) }));
})();
