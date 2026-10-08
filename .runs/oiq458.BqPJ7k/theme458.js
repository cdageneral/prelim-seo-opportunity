const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const css = fs.readFileSync(process.env.SRC + '/app/globals.css','utf8');
  const b = await chromium.launch({ executablePath: process.env.OIQ_CHROME, args:['--no-sandbox'] });
  const page = await b.newPage();
  const roles = [
    ['chip label',        '--c-8a8aa8', 'CHIPBG', true],
    ['chip value',        '--c-9b96ff', 'CHIPBG', true],
    ['chip of-total',     '--c-8a8aa8', 'CHIPBG', true],
    ['chip missing',      '--c-f87171', 'CHIPBG', true],
    ['chip covered text', '--c-8a8aa8', 'CHIPBG', true],
    ['journey row title', '--c-f59e0b', 'AMBERBG', true],
    ['journey row note',  '--c-8a8aa8', 'AMBERBG', true],
    ['pct-of-journey',    '--c-8a8aa8', '--c-111120', true],
    ['group label',       '--c-8a8aa8', '--c-111120', true],
    ['NEG old label tok', '--c-6a6a90', 'CHIPBG', false],
  ];
  const out = {};
  for (const theme of ['dark','light']) {
    await page.setContent(`<style>${css}</style><script>document.documentElement.setAttribute("data-theme","${theme}")</script><body><div id="card" style="background:var(--c-111120)"><div id="chip" style="background:var(--ca-108-99-255-0_12)"></div><div id="amber" style="background:rgba(245,158,11,0.08)"></div></div>`);
    out[theme] = await page.evaluate((roles) => {
      const parse = (s) => { const m = (s.match(/[\d.]+/g) || []).map(Number); return m.length >= 3 ? m.slice(0,4) : null; };
      const resolved = (el) => parse(getComputedStyle(el).backgroundColor);
      const over = (top, bot) => { const a = top.length > 3 ? top[3] : 1; return [0,1,2].map(i => top[i]*a + bot[i]*(1-a)); };
      const lum = (c) => { const f = (v) => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
        return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
      const ratio = (a,b) => { const l1=lum(a), l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
      const card = resolved(document.getElementById('card'));
      const CHIPBG = over(parse(getComputedStyle(document.getElementById('chip')).backgroundColor), card);
      const AMBERBG = over(parse(getComputedStyle(document.getElementById('amber')).backgroundColor), card);
      const probe = document.createElement('div'); document.body.appendChild(probe);
      const res = {};
      for (const [name, fgTok, bgTok] of roles) {
        probe.style.color = `var(${fgTok})`;
        const fg = parse(getComputedStyle(probe).color);
        let bg;
        if (bgTok === 'CHIPBG') bg = CHIPBG; else if (bgTok === 'AMBERBG') bg = AMBERBG;
        else { probe.style.backgroundColor = `var(${bgTok})`; bg = parse(getComputedStyle(probe).backgroundColor); }
        res[name] = Math.round(ratio(fg, bg) * 100) / 100;
      }
      return res;
    }, roles);
  }
  let f = 0;
  const c = (ok, n) => { console.log((ok ? 'PASS' : 'FAIL') + ' :: v458-theme: ' + n); if (!ok) f++; };
  for (const [name,,,mustPass] of roles) {
    for (const theme of ['dark','light']) {
      const r = out[theme][name];
      if (mustPass) c(r >= 4.5, `${name} >= 4.5:1 in ${theme} (${r})`);
    }
  }
  const neg = Math.min(out.dark['NEG old label tok'], out.light['NEG old label tok']);
  c(neg < 4.5, `negative control: the OLD --c-6a6a90 label pairing still measures below 4.5 (${neg}) — the gate can detect the bug it fixed`);
  await b.close();
  process.exit(f > 0 ? 1 : 0);
})().catch(e => { console.error('FAIL :: v458-theme: harness error ' + e.message); process.exit(1); });
