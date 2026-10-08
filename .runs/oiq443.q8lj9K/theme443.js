const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const css = fs.readFileSync(process.env.SRC + '/app/globals.css', 'utf8');
  const b = await chromium.launch({ executablePath: process.env.OIQ_CHROME, args: ['--no-sandbox'] });
  const page = await b.newPage();
  let f = 0;
  const c = (ok, n) => { console.log((ok ? 'PASS' : 'FAIL') + ' :: v443-theme: ' + n); if (!ok) f++; };
  // the four banner text roles, exactly as the component now sets them
  const roles = [
    ['error title',   '--c-f87171'], ['error body',    '--c-ef4444'],
    ['warning title', '--c-fbbf24'], ['warning body',  '--c-f59e0b'],
  ];
  for (const theme of ['dark', 'light']) {
    await page.setContent('<html data-theme="' + theme + '"><head><style>' + css +
      '</style></head><body><div id="surface" style="background:rgb(var(--orbit-bg))">' +
      roles.map(([n, t], i) => '<span id="r' + i + '" style="color:var(' + t + ')">x</span>').join('') +
      '</div></body></html>');
    const surf = await page.$eval('#surface', e => getComputedStyle(e).backgroundColor);
    for (let i = 0; i < roles.length; i++) {
      const fg = await page.$eval('#r' + i, e => getComputedStyle(e).color);
      const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = ([r, g, bl]) => { const a = [r, g, bl].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
      const L1 = lum(rgb(fg)), L2 = lum(rgb(surf));
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      c(ratio >= 4.5, '[' + theme + '] ' + roles[i][0] + ' ' + fg + ' on ' + surf + ' = ' + ratio.toFixed(2) + ':1');
    }
  }
  // the exact regression: Tailwind red-300 at 80% on the LIGHT surface must FAIL this bar,
  // proving the gate would have caught what Wayne reported.
  await page.setContent('<html data-theme="light"><head><style>' + css +
    '</style></head><body><div id="s" style="background:rgb(var(--orbit-bg))"><span id="old" style="color:rgba(252,165,165,0.8)">x</span></div></body></html>');
  const s2 = await page.$eval('#s', e => getComputedStyle(e).backgroundColor);
  const o = await page.$eval('#old', e => getComputedStyle(e).color);
  const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const lum = ([r, g, bl]) => { const a = [r, g, bl].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
  const L1 = lum(rgb(o)), L2 = lum(rgb(s2));
  const bad = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  c(bad < 4.5, 'the OLD text-red-300/80 measures ' + bad.toFixed(2) + ':1 on light — the gate reproduces the reported bug');
  await b.close();
  process.exit(f);
} )();
