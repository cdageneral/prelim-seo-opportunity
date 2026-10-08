const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const css = fs.readFileSync(process.env.SRC + '/app/globals.css','utf8');
  const b = await chromium.launch({ executablePath: process.env.OIQ_CHROME, args:['--no-sandbox'] });
  const page = await b.newPage();
  // every token the v7.444 cascade UI introduces, on the surfaces it sits on
  const roles = [
    ['button label',      '--c-9b96ff', '--c-111120'],
    ['dialog heading',    '--c-e8e8ff', '--c-111120'],
    ['dialog body',       '--c-8a8aa8', '--c-111120'],
    ['projection number', '--c-e8e8ff', '--c-0a0a14'],
    ['projection basis',  '--c-8a8aa8', '--c-0a0a14'],
    ['column label',      '--c-8a8aa8', '--c-0a0a14'],
    ['stop button',       '--c-f87171', '--c-111120'],
  ];
  let f = 0;
  const c=(ok,n)=>{console.log((ok?'PASS':'FAIL')+' :: v444-theme: '+n); if(!ok) f++;};
  for (const theme of ['dark','light']) {
    await page.setContent('<html data-theme="'+theme+'"><head><style>'+css+'</style></head><body>'+
      roles.map(([n,fg,bg],i)=>'<div id="w'+i+'" style="background:var('+bg+')"><span id="s'+i+'" style="color:var('+fg+')">x</span></div>').join('')+
      '</body></html>');
    for (let i=0;i<roles.length;i++){
      const fg = await page.$eval('#s'+i, e=>getComputedStyle(e).color);
      const bg = await page.$eval('#w'+i, e=>getComputedStyle(e).backgroundColor);
      const rgb=s=>s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number);
      const lum=([r,g,bl])=>{const a=[r,g,bl].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];};
      const L1=lum(rgb(fg)),L2=lum(rgb(bg));
      const r=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
      const min = 4.5;  // 9px all-caps micro-labels
      c(r>=min, '['+theme+'] '+roles[i][0]+' '+fg+' on '+bg+' = '+r.toFixed(2)+':1 (min '+min+')');
    }
  }
  await b.close(); process.exit(f);
})();

