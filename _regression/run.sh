#!/usr/bin/env bash
# OrbitIQ retained regression suite (Const V.6). Re-run BEFORE every package.
# Each entry checks REAL compiled code at real scale. Add a block per release; never delete
# a check to make the gate pass — update it with a dated note when behavior changes by design.
set -uo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_PATH="$SRC/node_modules"
ESB="$SRC/node_modules/.bin/esbuild"
T=$(mktemp -d /tmp/oiqreg.XXXXXX)
fail=0

# ── PROMPTS: hierarchicalDiscoveryPrompt + pathCanonicalizationPrompt invariants ──
cp "$SRC/lib/claude/prompts.ts" "$T/p.ts"
cat > "$T/ep.ts" <<'EOF'
import { hierarchicalDiscoveryPrompt, pathCanonicalizationPrompt } from './p';
const disc = hierarchicalDiscoveryPrompt('x.com','banking',[{keyword:'k',searchVolume:1,clientPosition:null} as any]);
const canon = pathCanonicalizationPrompt('x.com','banking',[['Credit Cards','Cash Back'],['Credit Cards','Cashback']]);
console.log(JSON.stringify({ disc, canon }));
EOF
"$ESB" "$T/ep.ts" --bundle --format=cjs --platform=node --outfile="$T/p.cjs" --log-level=error 2>/dev/null
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/p.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: prompt: "+n);if(!b)f++;};
c(o.disc.includes("SAME page")||o.disc.includes("same page"),"modifier same-page test (v7.237)");
c(o.disc.includes("never collapse an umbrella")||o.disc.includes("flattens the tree"),"anti-flatten guard (v7.237)");
c(o.disc.includes("KEEP")&&o.disc.includes("No Annual Fee"),"product facets kept as sub-topics");
c(o.disc.includes("business construction loan"),"construction-loan routing (v7.235)");
c(o.disc.toLowerCase().includes("nordstrom")&&o.disc.includes("Brand Searches"),"third-party brand typed brand (v7.236)");
c(o.disc.includes("\"confidence\"")&&o.disc.includes("\"reasoning\""),"confidence+reasoning schema (v7.235)");
c(o.canon.includes("AGGRESSIVELY merge near-duplicates"),"synonym-merge rule (v7.238)");
c(o.canon.includes("Cash Back")&&o.canon.includes("Cashback"),"cash back/cashback merge example (v7.238)");
c(o.canon.includes("Do NOT append the parent"),"no parent-name-in-child rule (v7.238)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1

# ── CLUSTER: umbrella nesting + NO-FLATTEN + brand drop + sub-topic FROM keywordPaths (not mined) ──
cat > "$T/ec.tsx" <<'EOF'
import { buildCanonicalClusterTopics } from '@/components/brief/ThemeClustersPanel';
const a={semrushSnapshot:{domain:'x.com',gapKeywords:[],topKeywords:[
 {keyword:'balance transfer credit cards',searchVolume:700,position:4},
 {keyword:'no annual fee balance transfer card',searchVolume:300,position:null},
 {keyword:'mortgage calculator',searchVolume:600,position:null},
 {keyword:'nordstrom card',searchVolume:300,position:null}],
 _categoryBreakdown:{categories:[
  {name:'Balance Transfer',type:'procedure',parent:'Credit Cards'},
  {name:'Mortgage Calculator',type:'procedure',parent:'Mortgages'},
  {name:'Nordstrom Brand Searches',type:'brand',parent:'Nordstrom Brand Searches'}],
  keywordCategories:{'balance transfer credit cards':'Balance Transfer','no annual fee balance transfer card':'Balance Transfer','mortgage calculator':'Mortgage Calculator','nordstrom card':'Nordstrom Brand Searches'},
  keywordPaths:{
   'balance transfer credit cards':['Credit Cards','Balance Transfer'],
   'no annual fee balance transfer card':['Credit Cards','Balance Transfer','No Annual Fee'],
   'mortgage calculator':['Mortgages','Mortgage Calculator'],
   'nordstrom card':['Nordstrom Brand Searches']}}}};
const t=buildCanonicalClusterTopics(a as any,'x.com',[],[],{});
console.log(JSON.stringify(t.map((x:any)=>({p:x.parentName,u:x.umbrella,prod:x.product,ty:x.parentType,st:x.stage}))));
EOF
cat > "$T/tsc.json" <<EOF
{"compilerOptions":{"jsx":"preserve","moduleResolution":"bundler","baseUrl":"$SRC","paths":{"@/*":["./*"]}}}
EOF
"$ESB" "$T/ec.tsx" --bundle --format=cjs --platform=node --jsx=automatic --tsconfig="$T/tsc.json" --outfile="$T/c.cjs" --log-level=error 2>"$T/cerr.txt"
if [ -f "$T/c.cjs" ]; then
node -e '
const t=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/c.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: cluster: "+n);if(!b)f++;};
c(t.every(x=>x.u&&x.u.length>0),"every topic has umbrella");
c(t.some(x=>x.u==="Credit Cards"&&x.p==="Balance Transfer"),"NO-FLATTEN: theme nests under umbrella (v7.236)");
c(!t.some(x=>/nordstrom/i.test(x.p)||/nordstrom/i.test(x.u)),"brand dropped w/ no competitors (v7.236)");
c(t.some(x=>x.p==="Balance Transfer"&&x.prod==="No Annual Fee"),"sub-topic product = canonical keywordPaths node (v7.238)");
c(!t.some(x=>/Balance Transfer Credit Cards|Balance Transfer Cards/i.test(x.prod)),"NO mined near-duplicate product label (v7.238)");
c(t.every(x=>["awareness","consideration","decision","retention"].includes(x.st)),"every canonical topic has a valid journey stage (v7.240 — journey consumes these)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: cluster: build error"; cat "$T/cerr.txt"|head; fail=1; fi

# ── v7.239: shared taxonomy tree builder — the ONE source both panels render from ──
cat > "$T/et.tsx" <<'EOF'
import { buildTaxonomyTree } from '@/lib/category/taxonomyTree';
const rows=[
 {keyword:'balance transfer credit cards',searchVolume:700,position:4},
 {keyword:'no annual fee balance transfer card',searchVolume:300,position:null},
 {keyword:'cash back credit cards',searchVolume:500,position:null}];
const paths=new Map<string,string[]>([
 ['balance transfer credit cards',['Credit Cards','Balance Transfer']],
 ['no annual fee balance transfer card',['Credit Cards','Balance Transfer','No Annual Fee']],
 ['cash back credit cards',['Credit Cards','Cash Back']]]);
const tree=buildTaxonomyTree(rows,paths,{keyOf:(r:any)=>r.keyword.toLowerCase().trim(),posOf:(r:any)=>r.position,volOf:(r:any)=>r.searchVolume});
const simplify=(n:any):any=>({name:n.name,depth:n.depth,own:n.own.length,totVol:n.totVol,children:n.children.map(simplify)});
console.log(JSON.stringify(tree.map(simplify)));
EOF
"$ESB" "$T/et.tsx" --bundle --format=cjs --platform=node --jsx=automatic --tsconfig="$T/tsc.json" --outfile="$T/t.cjs" --log-level=error 2>"$T/terr.txt"
if [ -f "$T/t.cjs" ]; then
node -e '
const tree=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/t.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: taxotree: "+n);if(!b)f++;};
const cc=tree.find(x=>x.name==="Credit Cards");
c(!!cc && cc.depth===0,"single umbrella root Credit Cards");
const themes=(cc?cc.children:[]).map(x=>x.name).sort();
c(JSON.stringify(themes)===JSON.stringify(["Balance Transfer","Cash Back"]),"themes nest under umbrella (Balance Transfer, Cash Back)");
const bt=cc&&cc.children.find(x=>x.name==="Balance Transfer");
c(!!bt && bt.own===1 && bt.children.some(x=>x.name==="No Annual Fee"),"theme holds head kw + canonical sub No Annual Fee");
c(!!cc && cc.totVol===1500,"exact rollup (700+300+500=1500)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: taxotree: build error"; cat "$T/terr.txt"|head; fail=1; fi

# ── v7.241: demand-universe lane merge — a single-lane pass rebuilds ONLY its lane,    ──
# ── preserves the other lane, dedupes by keyword (no double-count, Const I.3), and     ──
# ── on collision keeps the max REAL volume / promotes to the rebuilt lane (Const I.1). ──
cat > "$T/em.ts" <<'EOF'
import { mergeDemandLanes } from '@/lib/apis/demandLaneMerge';
const existing=[
 {keyword:'product alpha',searchVolume:500,seeds:['cat'],reports:['related'],laneHint:'product'},
 {keyword:'problem beta',searchVolume:300,seeds:['trig'],reports:['questions'],laneHint:'problem'},
 {keyword:'shared x',searchVolume:100,seeds:['trig'],reports:['questions'],laneHint:'problem'}];
const newProduct=[
 {keyword:'product gamma',searchVolume:700,seeds:['cat'],reports:['related']},
 {keyword:'shared x',searchVolume:250,seeds:['cat'],reports:['related']}];
const mProd=mergeDemandLanes(existing as any,newProduct as any,'product',new Set(['cat']));
const mPre =mergeDemandLanes(existing as any,[{keyword:'problem delta',searchVolume:400,seeds:['trig'],reports:['questions']}] as any,'pre',new Set(['cat']));
console.log(JSON.stringify({mProd,mPre}));
EOF
"$ESB" "$T/em.ts" --bundle --format=cjs --platform=node --packages=external --tsconfig="$T/tsc.json" --outfile="$T/m.cjs" --log-level=error 2>"$T/merr.txt"
if [ -f "$T/m.cjs" ]; then
node -e '
const {mProd,mPre}=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/m.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: lanemerge: "+n);if(!b)f++;};
const kw=a=>a.map(t=>t.keyword).sort();
c(JSON.stringify(kw(mProd))===JSON.stringify(["problem beta","product gamma","shared x"]),"product pass: rebuilds product lane, keeps problem lane, drops stale product");
c(mProd.filter(t=>t.keyword==="shared x").length===1,"no double-count of a collision keyword (Const I.3)");
const sx=mProd.find(t=>t.keyword==="shared x");
c(!!sx && sx.laneHint==="product" && sx.searchVolume===250,"collision promotes to rebuilt lane + max real volume (Const I.1)");
c(mProd.some(t=>t.keyword==="problem beta"&&t.laneHint==="problem"),"other lane (problem beta) preserved verbatim");
c(!mProd.some(t=>t.keyword==="product alpha"),"stale product topic from prior pass dropped on rebuild");
c(JSON.stringify(kw(mPre))===JSON.stringify(["problem delta","product alpha"]),"pre pass: rebuilds problem lane, preserves product lane");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: lanemerge: build error"; cat "$T/merr.txt"|head; fail=1; fi

# ── v7.243: product expansion stays INSIDE existing categories (no new categories);     ──
# ── funnel stage classified deterministically; pre-lane + already-pathed kws skipped.    ──
cat > "$T/ex.ts" <<'EOF'
import { classifyFunnelStage, assignProductExpansionPaths } from '@/lib/category/productExpansion';
const topics=[
 {keyword:'benefits of rewards credit cards',seeds:['Rewards Credit Cards'],laneHint:'product'},
 {keyword:'best rewards credit cards',seeds:['Rewards Credit Cards'],laneHint:'product'},
 {keyword:'rewards credit card vs travel card',seeds:['Rewards Credit Cards'],laneHint:'product'},
 {keyword:'how to save money on vacations',seeds:['travel budget'],laneHint:'problem'},
 {keyword:'already pathed kw',seeds:['Rewards Credit Cards'],laneHint:'product'},
 {keyword:'unknown seed kw',seeds:['Not A Category'],laneHint:'product'}];
const res=assignProductExpansionPaths(topics as any,['Rewards Credit Cards'],{'rewards credit cards':'Credit Cards'},{'already pathed kw':['X']});
console.log(JSON.stringify({
  benefits:classifyFunnelStage('benefits of rewards credit cards'),
  best:classifyFunnelStage('best rewards credit cards'),
  cmp:classifyFunnelStage('rewards credit card vs travel card'),
  how:classifyFunnelStage('how rewards credit cards work'),
  edu:classifyFunnelStage('what is a rewards credit card'),
  rev:classifyFunnelStage('rewards credit card reviews'),
  res}));
EOF
"$ESB" "$T/ex.ts" --bundle --format=cjs --platform=node --packages=external --tsconfig="$T/tsc.json" --outfile="$T/ex.cjs" --log-level=error 2>"$T/exerr.txt"
if [ -f "$T/ex.cjs" ]; then
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/ex.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: prodexp: "+n);if(!b)f++;};
c(o.benefits==="Benefits"&&o.best==="Best Options"&&o.cmp==="Comparisons"&&o.how==="How It Works"&&o.edu==="Education"&&o.rev==="Reviews","funnel-stage classification maps to Wayne stages");
const P=o.res.paths;
c(JSON.stringify(P["benefits of rewards credit cards"])===JSON.stringify(["Credit Cards","Rewards Credit Cards","Benefits"]),"expanded kw nests under existing category + funnel sub-node");
c(o.res.cats["best rewards credit cards"]==="Rewards Credit Cards","keyword filed in the EXISTING category (no new category)");
c(!P["how to save money on vacations"],"pre-lane topic NOT given a product category");
c(!P["already pathed kw"],"already-pathed (base) kw is never overwritten (Const II.8)");
c(!P["unknown seed kw"],"topic with no matching existing category left unplaced (honest gap)");
c(o.res.assigned===3,"exactly the 3 valid product topics assigned");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: prodexp: build error"; cat "$T/exerr.txt"|head; fail=1; fi


# ── SHARE OF VOICE: page-1 capture metric (v7.245, Wayne 2026-06-19) ──
# SoV = Σ(vol×CTR(client pos≤10)) ÷ Σ(vol×PAGE1_CTR_SUM). Guards the redefinition:
# never the old trivial 100%; reconciles with the Google-Rank header footprint;
# honest-gap empty state for no data; GrowthSRC 2025 curve values locked.
cat > "$T/sov.ts" <<'EOF'
import { computeSov, PAGE1_CTR_SUM, CTR_BY_POSITION } from '@/components/brief/GoogleSerpSection';
const tk:any[]=[];
const push=(n:number,lo:number|null,hi:number,v:number)=>{for(let i=0;i<n;i++)tk.push({keyword:`k_${lo}_${i}`,position:lo===null?null:lo+(i%(hi-lo+1)),searchVolume:v});};
push(231,1,3,8000); push(266,4,10,5000); push(884,11,60,12000);
const a={semrushSnapshot:{domain:'td.com',topKeywords:tk}};
const s=computeSov({analysis:a,competitors:[],dbKeywords:[],clientLabel:'TD'});
const empty=computeSov({analysis:{semrushSnapshot:{domain:'x.com',topKeywords:[]}},competitors:[],dbKeywords:[]});
console.log(JSON.stringify({basis:s.basis,sovPct:s.sovPct,cap:s.capturedClicks,av:s.availableClicks,p1:s.page1KwCount,tot:s.totalKwCount,sum:PAGE1_CTR_SUM,c1:CTR_BY_POSITION[1],eb:empty.basis,esp:empty.sovPct}));
EOF
"$ESB" "$T/sov.ts" --bundle --format=cjs --platform=node --jsx=automatic --packages=external "--alias:@=$SRC" --outfile="$T/sov.cjs" --log-level=error 2>"$T/soverr.txt"
if [ -f "$T/sov.cjs" ]; then
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/sov.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: sov: "+n);if(!b)f++;};
c(o.basis==="capture","capture basis when footprint present");
c(o.sovPct>0&&o.sovPct<1,"SoV strictly 0..100% (never trivial 100%)");
c(Math.abs(o.sovPct-o.cap/o.av)<1e-9,"SoV = capturedClicks / availableClicks");
c(Math.round(o.sovPct*100)<50,"heavy page-2 tail keeps SoV well below 100% (Wayne v7.245)");
c(o.p1===497&&o.tot===1381,"page-1=497 / footprint=1381 reconcile with header");
c(Math.abs(o.sum-0.691)<1e-9,"PAGE1_CTR_SUM = 0.691 (GrowthSRC 2025 curve)");
c(o.c1===0.19,"pos-1 CTR = 0.19 (GrowthSRC 2025)");
c(o.eb==="empty"&&o.esp===0,"empty footprint -> honest-gap empty basis, SoV 0");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: sov: build error"; cat "$T/soverr.txt"|head; fail=1; fi

# ── SHARE OF VOICE: competitor capture (v7.246, Wayne 2026-06-19) ──
# Competitors get a page-1-capture slice on the SAME denominator; client % stays
# STABLE when a competitor is added (denominator unchanged); competitors with rows
# but no page-1 overlap, or no positions, are honest gaps — never a modeled slice.
cat > "$T/csov.ts" <<'EOF'
import { computeSov } from '@/components/brief/GoogleSerpSection';
const tk:any[]=[]; const push=(n:number,lo:number,hi:number,v:number,p:string)=>{for(let i=0;i<n;i++)tk.push({keyword:`${p}_${i}`,position:lo+(i%(hi-lo+1)),searchVolume:v});};
push(231,1,3,8000,'a'); push(266,4,10,5000,'b'); push(884,11,60,12000,'c');
const an={semrushSnapshot:{domain:'td.com',topKeywords:tk}};
const db:any[]=[];
for(let i=0;i<120;i++) db.push({domain:'rival.com',keyword:`a_${i}`,position:1+(i%3),searchVolume:8000,source:'csv',type:'gap'});
for(let i=0;i<30;i++)  db.push({domain:'nooverlap.com',keyword:`zz_${i}`,position:2,searchVolume:9000,source:'csv',type:'gap'});
for(let i=0;i<10;i++)  db.push({domain:'nopos.com',keyword:`a_${i}`,position:null,searchVolume:8000,source:'csv',type:'gap'});
const base=computeSov({analysis:an,competitors:[],dbKeywords:[]});
const s=computeSov({analysis:an,competitors:['rival.com','nooverlap.com','nopos.com'],dbKeywords:db});
const open=s.rawEntries.find((e:any)=>e.type==='open').traffic;
console.log(JSON.stringify({baseP:base.sovPct,sP:s.sovPct,rival:(s.compEntries.find((e:any)=>e.domain==='rival.com')||{}).capturedClicks||0,gaps:s.compGaps.map((g:any)=>g.domain),sum:s.rawEntries.reduce((a:number,e:any)=>a+e.traffic/s.total,0),open,total:s.total}));
EOF
"$ESB" "$T/csov.ts" --bundle --format=cjs --platform=node --jsx=automatic --packages=external "--alias:@=$SRC" --outfile="$T/csov.cjs" --log-level=error 2>"$T/csoverr.txt"
if [ -f "$T/csov.cjs" ]; then
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/csov.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: csov: "+n);if(!b)f++;};
c(Math.abs(o.baseP-o.sP)<1e-9,"client SoV % STABLE when competitors added (denominator unchanged)");
c(o.rival>0,"competitor with page-1 overlap earns a real slice");
c(o.gaps.includes("nooverlap.com"),"competitor w/ positions but no footprint overlap -> honest gap");
c(o.gaps.includes("nopos.com"),"competitor w/ no positions -> honest gap (not a 0 slice)");
c(Math.abs(o.sum-1)<1e-9,"client+competitors+open sum to 100%");
c(o.open>=0,"open/uncaptured never negative");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: csov: build error"; cat "$T/csoverr.txt"|head; fail=1; fi
# ── JOURNEY: per-segment slice partition (v7.247, Wayne 2026-06-19) ──
# The canonical Journey view re-slices by persona again. Each canonical topic is
# attributed to ONE bucket (a segment.id or SHARED) by real audience-language overlap
# (the v7.170 mechanism, factored as bucketForText) — so the per-segment slices PARTITION
# the combined total (segments + Shared = all). No persona match (or a tie) -> Shared.
cat > "$T/jseg.ts" <<'EOF'
import { buildSegTokens, bucketForText } from '@/components/brief/JourneySection';
const segs:any=[
 {id:'a',name:'Climber',whoTheyAre:{trigger:'rejected loan rebuild credit score subprime'},preLLMPrompts:['rebuild credit score'],productPrompts:['secured credit card bad credit']},
 {id:'b',name:'Saver',whoTheyAre:{trigger:'savings interest yield deposit returns apy'},preLLMPrompts:['high yield savings'],productPrompts:['compare savings rates']},
 {id:'c',name:'Investor',whoTheyAre:{trigger:'invest brokerage stocks portfolio etf beginner'},preLLMPrompts:['start investing'],productPrompts:['best brokerage beginners']},
];
const tk=buildSegTokens(segs);
const texts=[
 'Credit Building rebuild credit score subprime secured credit card bad credit',
 'Savings high yield savings account apy savings interest returns',
 'Investing best brokerage beginner etf start investing portfolio stocks',
 'Branch Services branch hours location wire transfer fees',
];
const b=texts.map(t=>bucketForText(t,tk));
const counts:Record<string,number>={}; b.forEach(x=>counts[x]=(counts[x]||0)+1);
console.log(JSON.stringify({b,sum:Object.values(counts).reduce((s:number,n:number)=>s+n,0),n:texts.length,
 emptySeg: bucketForText('Branch hours location wire transfer', buildSegTokens([]))}));
EOF
"$ESB" "$T/jseg.ts" --bundle --format=cjs --platform=node --jsx=automatic --packages=external "--alias:@=$SRC" --outfile="$T/jseg.cjs" --log-level=error 2>"$T/jsegerr.txt"
if [ -f "$T/jseg.cjs" ]; then
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/jseg.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: journey: "+n);if(!b)f++;};
c(o.b.length===o.n,"every canonical topic gets exactly one segment bucket");
c(o.sum===o.n,"per-segment slices PARTITION the total (segments + Shared = all)");
c(o.b[0]==="a"&&o.b[1]==="b"&&o.b[2]==="c","topic attributed to the persona whose language it shares");
c(o.b[3]==="shared","no-persona-match topic falls to Shared (never silently dropped)");
c(o.emptySeg==="shared","no segments -> everything Shared (combined view safe)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: journey: build error"; cat "$T/jsegerr.txt"|head; fail=1; fi

# ── PRE-PRODUCT: deep-journey-only source + product-category guard (v7.248, Wayne 2026-06-19) ──
# Const III.2a: pre-product = need states / life events / pain points / goals, NO client
# product/service. Two rules: (1) a keyword mapping to ANY product/service category (stored
# membership or name match) is PRODUCT, never pre-product — fixes the broad-parent leak that
# put "cashback credit cards" in pre-product; (2) pre-product is the DEEP-JOURNEY BUILD ONLY
# (origin 'demand') — footprint keywords never auto-create pre-product topics.
cat > "$T/pp.ts" <<'EOF'
import { buildJourneyClassifier } from '@/components/brief/JourneySection';
import { buildCanonicalClusterTopics } from '@/components/brief/ThemeClustersPanel';
const segs:any=[{ id:'s1', name:'P', whoTheyAre:{ trigger:'living paycheck to paycheck struggling money stress' },
  preLLMPrompts:['how to stop living paycheck to paycheck','how to budget when broke'], productPrompts:[] }];
const snap:any={
  domain:'examplebank.com',
  topKeywords:[
    { keyword:'cash back bonus offers', searchVolume:700, position:5, url:'https://examplebank.com/rewards' },
    { keyword:'how to stop living paycheck to paycheck', searchVolume:600, position:8 },
  ],
  gapKeywords:[],
  _categoryBreakdown:{
    categories:[{name:'Rewards',type:'procedure',parent:'Credit Cards'},{name:'Credit Reports & Scores',type:'procedure',parent:'Credit Health'}],
    keywordCategories:{ 'cash back bonus offers':'Rewards' },
  },
  _demandUniverse:{ topics:[{ keyword:'how to budget when broke', searchVolume:500, seeds:['budget when broke'] }], problemSeeds:['budget when broke'] },
  _audienceSegments: segs,
};
const analysis:any={ id:'pp', semrushSnapshot:snap };
const cls=buildJourneyClassifier(analysis,'examplebank.com',[]);
const topics=buildCanonicalClusterTopics(analysis,'examplebank.com',[]);
const prob=topics.filter((t:any)=>t.parentType==='problem');
const probKws=prob.flatMap((t:any)=>t.keywords.map((k:any)=>String(k.keyword).toLowerCase()));
const probAllDemand=prob.every((t:any)=>t.keywords.every((k:any)=>k.origin==='demand'));
console.log(JSON.stringify({
  cProduct: cls.classify('cash back bonus offers'),
  cFootprintProblem: cls.classify('how to stop living paycheck to paycheck'),
  cDemandProblem: cls.classify('how to budget when broke'),
  hasProblem: prob.length>0,
  probAllDemand,
  footprintInPP: probKws.includes('how to stop living paycheck to paycheck'),
  productInPP: probKws.includes('cash back bonus offers'),
  demandInPP: probKws.includes('how to budget when broke'),
}));
EOF
"$ESB" "$T/pp.ts" --bundle --format=cjs --platform=node --jsx=automatic --packages=external "--alias:@=$SRC" --outfile="$T/pp.cjs" --log-level=error 2>"$T/pperr.txt"
if [ -f "$T/pp.cjs" ]; then
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/pp.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: preproduct: "+n);if(!b)f++;};
c(o.cProduct==="product","product-category keyword under a broad parent => product (decision 2, no substring leak)");
c(o.cDemandProblem==="pre-product","genuine problem keyword (no product category) => pre-product");
c(o.hasProblem,"deep-journey demand problem keyword DOES create a pre-product topic");
c(o.probAllDemand,"every pre-product topic keyword is origin=demand (deep-journey only, decision 1)");
c(o.footprintInPP===false,"footprint problem keyword is NEVER in pre-product (decision 1)");
c(o.productInPP===false,"product keyword is NEVER in pre-product (Const III.2a)");
c(o.demandInPP===true,"the demand problem keyword is the one in the pre-product lane");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: preproduct: build error"; cat "$T/pperr.txt"|head; fail=1; fi

# ── CONTENT: existing-page URL resolves from the page-map scan (v7.250) ──────────────
# Const I.1: a ranked footprint keyword whose topKeywords row has NO url must still map to
# the REAL client page via _pageMap.pages (url_organic scan). No URL is invented; a keyword
# with no real page stays unmapped (pageUrl undefined → drawer shows honest gap).
cat > "$T/cu.tsx" <<'EOF'
import { buildCanonicalClusterTopics } from '@/components/brief/ThemeClustersPanel';
const a={semrushSnapshot:{domain:'x.com',gapKeywords:[],topKeywords:[
 {keyword:'high yield savings',searchVolume:700,position:14},          // ranked, NO url on the row
 {keyword:'high yield savings rates',searchVolume:300,position:22}],
 _pageMap:{pages:[{url:'https://x.com/savings/high-yield',keywords:['high yield savings','high yield savings rates']}]},
 _categoryBreakdown:{categories:[{name:'High Yield Savings',type:'procedure',parent:'Savings'}],
  keywordCategories:{'high yield savings':'High Yield Savings','high yield savings rates':'High Yield Savings'},
  keywordPaths:{'high yield savings':['Savings','High Yield Savings'],'high yield savings rates':['Savings','High Yield Savings','Rates']}}}};
const t=buildCanonicalClusterTopics(a as any,'x.com',[],[],{});
console.log(JSON.stringify(t.map((x:any)=>({prod:x.product,url:x.pageUrl??null}))));
EOF
"$ESB" "$T/cu.tsx" --bundle --format=cjs --platform=node --jsx=automatic --tsconfig="$T/tsc.json" --outfile="$T/cu.cjs" --log-level=error 2>"$T/cuerr.txt"
if [ -f "$T/cu.cjs" ]; then node -e '
const t=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/cu.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: contenturl: "+n);if(!b)f++;};
const mapped=t.filter(x=>x.url==="https://x.com/savings/high-yield");
c(mapped.length>0,"ranked kw with empty topKeywords url resolves page URL from _pageMap (Const I.1)");
c(t.every(x=>x.url===null||/^https:\/\/x\.com\//.test(x.url)),"no invented URLs — only real page-map URLs appear");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: contenturl: build error"; cat "$T/cuerr.txt"|head; fail=1; fi

# ── CONTENT: uploaded-CSV ranking URL flows to the topic (v7.251) ────────────────────
# Const I.1: when the ONLY data is an uploaded client CSV that carries a real "URL" column
# (no topKeywords, no page-map), the ranked keyword's URL must reach the topic's pageUrl —
# so an existing/ranked page shows its real URL instead of looking net-new. Real data only.
cat > "$T/ccu.tsx" <<'EOF'
import { buildCanonicalClusterTopics } from '@/components/brief/ThemeClustersPanel';
const up=[
 {keyword:'high yield savings',searchVolume:700,position:14,type:'ranked',source:'csv',url:'https://x.com/savings/high-yield',domain:''},
 {keyword:'high yield savings rates',searchVolume:300,position:22,type:'ranked',source:'csv',url:'https://x.com/savings/high-yield',domain:''}];
const a={semrushSnapshot:{domain:'x.com',gapKeywords:[],topKeywords:[],   // NO topKeywords / NO _pageMap — CSV is the only source
 _categoryBreakdown:{categories:[{name:'High Yield Savings',type:'procedure',parent:'Savings'}],
  keywordCategories:{'high yield savings':'High Yield Savings','high yield savings rates':'High Yield Savings'},
  keywordPaths:{'high yield savings':['Savings','High Yield Savings'],'high yield savings rates':['Savings','High Yield Savings','Rates']}}}};
const t=buildCanonicalClusterTopics(a as any,'x.com',[],up as any,{});
console.log(JSON.stringify(t.map((x:any)=>({prod:x.product,url:x.pageUrl??null}))));
EOF
"$ESB" "$T/ccu.tsx" --bundle --format=cjs --platform=node --jsx=automatic --tsconfig="$T/tsc.json" --outfile="$T/ccu.cjs" --log-level=error 2>"$T/ccuerr.txt"
if [ -f "$T/ccu.cjs" ]; then node -e '
const t=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/ccu.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: csvurl: "+n);if(!b)f++;};
c(t.some(x=>x.url==="https://x.com/savings/high-yield"),"uploaded CSV ranking URL reaches topic.pageUrl (CSV-only project, Const I.1)");
c(t.every(x=>x.url===null||/^https:\/\/x\.com\//.test(x.url)),"no invented URLs — only the real uploaded URL appears");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: csvurl: build error"; cat "$T/ccuerr.txt"|head; fail=1; fi

# ── CONTENT: bestPosition is the client's best REAL footprint SERP position (v7.249) ──
# Const I.1: bestPosition is an exact rollup of real Semrush positions (min over the
# client-ranked footprint), never modeled; demand-origin keywords are excluded; topics
# the client doesn't rank for are null. Page buckets map 1-10/11-20/21-30/31+ to P1-P4+.
cat > "$T/cp.ts" <<'EOF'
import { buildContentPlanFromTopics } from '@/lib/journey/contentPlan';
const T:any[] = [
  { id:'A', parentName:'X', parentType:'procedure', product:'A', stage:'decision', totalVolume:100,
    keywords:[{keyword:'a1',searchVolume:50,position:5,isGap:false},{keyword:'a2',searchVolume:30,position:30,isGap:false},{keyword:'a3',searchVolume:20,position:null,isGap:true,competitor:'c.com'}] },
  { id:'B', parentName:'X', parentType:'procedure', product:'B', stage:'decision', totalVolume:40,
    keywords:[{keyword:'b1',searchVolume:40,position:null,isGap:true,competitor:'c.com'}] },
  { id:'C', parentName:'X', parentType:'procedure', product:'C', stage:'decision', totalVolume:30,
    keywords:[{keyword:'c1',searchVolume:30,position:11,isGap:false}] },
  { id:'D', parentName:'X', parentType:'procedure', product:'D', stage:'decision', totalVolume:30,
    keywords:[{keyword:'d1',searchVolume:30,position:25,isGap:false}] },
  { id:'E', parentName:'X', parentType:'procedure', product:'E', stage:'decision', totalVolume:30,
    keywords:[{keyword:'e1',searchVolume:30,position:45,isGap:false}] },
  { id:'F', parentName:'X', parentType:'procedure', product:'F', stage:'decision', totalVolume:60,
    keywords:[{keyword:'f1',searchVolume:30,position:8,isGap:false,origin:'footprint'},{keyword:'f2',searchVolume:30,position:1,isGap:false,origin:'demand'}] },
];
const plan = buildContentPlanFromTopics(T as any);
const by:Record<string,number|null> = {};
for (const t of plan.topics) by[t.id] = t.bestPosition;
console.log(JSON.stringify(by));
EOF
"$ESB" "$T/cp.ts" --bundle --format=cjs --platform=node --packages=external "--alias:@=$SRC" --outfile="$T/cp.cjs" --log-level=error 2>"$T/cperr.txt"
if [ -f "$T/cp.cjs" ]; then node -e '
const by=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/cp.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: content: "+n);if(!b)f++;};
const bucket=(p)=>p==null?"unranked":p<=10?"p1":p<=20?"p2":p<=30?"p3":"p4";
c(by.A===5,"bestPosition = MIN real footprint position (Const I.1)");
c(by.B===null,"no client rank => bestPosition null (honest gap)");
c(bucket(by.A)==="p1"&&bucket(by.C)==="p2"&&bucket(by.D)==="p3"&&bucket(by.E)==="p4","page buckets map 1-10/11-20/21-30/31+");
c(by.F===8,"demand-origin keyword excluded from bestPosition (footprint only)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: content: build error"; cat "$T/cperr.txt"|head; fail=1; fi

# ── CONTENT: read-only keyword-count provenance partitions by real source (v7.252) ───
# The All Keywords count must be fully traceable (Const I.2): every pool row lands in
# exactly ONE source bucket (no double counting, I.3), the buckets sum to the total, and
# duplicate uploaded rows are surfaced (rawDbRows vs distinctDb). Reads only; adds nothing.
cat > "$T/prov.ts" <<'EOF'
import { keywordProvenance } from '@/lib/utils/keywordProvenance';
const rows:any[] = [
  { keyword:'a', type:'ranked', origin:'footprint', competitor:null },   // upload
  { keyword:'b', type:'ranked', origin:'footprint', competitor:null },   // upload
  { keyword:'c', type:'ranked', origin:'footprint', competitor:null },   // crawl-only (not in db)
  { keyword:'d', type:'ranked', origin:'demand',    competitor:null },   // demand
  { keyword:'e', type:'gap',    origin:'footprint', competitor:'x.com'},// competitor gap
  { keyword:'f', type:'gap',    origin:'footprint', competitor:null },   // client gap w/o competitor → excluded (mirrors card)
];
const db:any[] = [
  { keyword:'a', source:'csv', type:'ranked' },
  { keyword:'A', source:'csv', type:'ranked' },   // duplicate of 'a' (case) → raw>distinct
  { keyword:'b', source:'csv', type:'ranked' },
  { keyword:'z', source:'blocked', type:'ranked' },// blocked → excluded from distinct + upClient
];
console.log(JSON.stringify(keywordProvenance(rows, db)));
EOF
"$ESB" "$T/prov.ts" --bundle --format=cjs --platform=node --packages=external "--alias:@=$SRC" --outfile="$T/prov.cjs" --log-level=error 2>"$T/proverr.txt"
if [ -f "$T/prov.cjs" ]; then node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/prov.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: provenance: "+n);if(!b)f++;};
c(o.upload===2,"upload = rows present in uploaded CSV (a,b)");
c(o.crawl===1,"crawl = client footprint row NOT in upload (c)");
c(o.demand===1,"demand = origin:demand row (d)");
c(o.gap===1,"gap = competitor gap row only (e); client gap w/o competitor excluded");
c(o.total===o.upload+o.crawl+o.demand+o.gap,"buckets sum to total (no double count, Const I.3)");
c(o.total===5,"total = 5 (a,b,c,d,e); f excluded mirrors card basis");
c(o.rawDbRows===4 && o.distinctDb===2,"rawDbRows=4 vs distinctDb=2 surfaces duplicate + blocked excluded");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: provenance: build error"; cat "$T/proverr.txt"|head; fail=1; fi


# ── CONTENT TITLE: suggested title carries the highest-volume keyword (v7.255, Const III.8) ──
# Wayne: a Content Plan card titled "Stock Investing" whose top target keyword was
# "how to invest in stocks" (673K) dropped the head term. III.8: the suggested title
# MUST contain the highest real-volume target keyword (Const I.1), natural title case;
# ties break to the more specific term (III.6); product-noun fallback only when no kws.
cat > "$T/tt.ts" <<'EOF'
import { buildContentPlanFromTopics, briefTitleFromKeywords } from '@/lib/journey/contentPlan';
const T:any[] = [
  { id:'A', parentName:'Investing', parentType:'procedure', product:'Stock Investing', stage:'decision', totalVolume:719000,
    keywords:[
      {keyword:'how to invest in stocks',searchVolume:673000,position:7,isGap:false},
      {keyword:'how to start investing in stocks',searchVolume:27000,position:null,isGap:true,competitor:'c.com'},
      {keyword:'good stocks to invest in',searchVolume:10000,position:null,isGap:true,competitor:'c.com'},
      {keyword:'how do i begin investing in stocks',searchVolume:4000,position:null,isGap:true,competitor:'c.com'}],
  },
  { id:'B', parentName:'Cards', parentType:'procedure', product:'Credit Cards', stage:'decision', totalVolume:200,
    keywords:[
      {keyword:'best card',searchVolume:100,position:null,isGap:true,competitor:'c.com'},
      {keyword:'best rewards credit card',searchVolume:100,position:null,isGap:true,competitor:'c.com'}],   // tie → longer/more specific
  },
  { id:'C', parentName:'Empty', parentType:'procedure', product:'Savings Accounts', stage:'decision', totalVolume:0,
    keywords:[] },   // no keywords → product-noun fallback
];
const plan = buildContentPlanFromTopics(T as any);
const titleById:Record<string,string> = {};
for (const t of plan.topics) titleById[t.id] = t.brief.title;
console.log(JSON.stringify({
  titleById,
  helperVerbatim: briefTitleFromKeywords('Whatever', [{keyword:'auto loan rates',searchVolume:500},{keyword:'best auto loan',searchVolume:900}]),
}));
EOF
"$ESB" "$T/tt.ts" --bundle --format=cjs --platform=node --packages=external "--alias:@=$SRC" --outfile="$T/tt.cjs" --log-level=error 2>"$T/tterr.txt"
if [ -f "$T/tt.cjs" ]; then node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/tt.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: title: "+n);if(!b)f++;};
const A=o.titleById.A, B=o.titleById.B, C=o.titleById.C;
c(/how to invest in stocks/i.test(A),"title contains the highest-volume keyword (how to invest in stocks 673K)");
c(A==="How to Invest in Stocks","title is the top keyword in natural title case");
c(!/^stock investing$/i.test(A),"title is NOT the generic cluster-name paraphrase (Stock Investing)");
c(B==="Best Rewards Credit Card","volume tie breaks to the more specific/longer term (Const III.6)");
c(C==="Savings Accounts","no-keyword topic falls back to product noun (honest gap, Const I.5)");
c(o.helperVerbatim==="Best Auto Loan","helper anchors on the single highest-volume keyword");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: title: build error"; cat "$T/tterr.txt"|head; fail=1; fi

# ── JOURNEY↔PLAN RECONCILE: mind-map node id == ContentTopic id (v7.265, Const II.7) ──
# The JourneyMindMap checkbox pushes a topic into the plan by writing r.t.id into
# content_plan_selections — the SAME id-space the Content Map / Content Plan render
# (ContentTopic.id). buildContentPlanFromTopics MUST preserve t.id verbatim so a topic
# checked on the journey IS the same row the plan shows (ONE source of truth, no parallel
# copy), and filterPlanByIds (the Content Plan filter) surfaces exactly that id. Guards the
# cross-panel selection added in v7.265 (Journey ⇄ Content Map ⇄ Content Plan).
cat > "$T/rec.ts" <<'EOF'
import { buildContentPlanFromTopics, filterPlanByIds } from '@/lib/journey/contentPlan';
const T:any[]=[
 {id:'topic-a',parentName:'Cat',parentType:'procedure',product:'A',stage:'decision',totalVolume:100,keywords:[{keyword:'a',searchVolume:100,position:5,isGap:false}]},
 {id:'topic-b',parentName:'Cat',parentType:'procedure',product:'B',stage:'decision',totalVolume:50,keywords:[{keyword:'b',searchVolume:50,position:null,isGap:true,competitor:'c.com'}]},
];
const plan=buildContentPlanFromTopics(T as any);
const planIds=plan.topics.map((t:any)=>t.id).sort();
const filtered=filterPlanByIds(plan,['topic-a']);
console.log(JSON.stringify({planIds,inputIds:T.map(t=>t.id).sort(),filteredIds:filtered.topics.map((t:any)=>t.id)}));
EOF
"$ESB" "$T/rec.ts" --bundle --format=cjs --platform=node --packages=external "--alias:@=$SRC" --outfile="$T/rec.cjs" --log-level=error 2>"$T/recerr.txt"
if [ -f "$T/rec.cjs" ]; then node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/rec.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: reconcile: "+n);if(!b)f++;};
c(JSON.stringify(o.planIds)===JSON.stringify(o.inputIds),"ContentTopic.id == canonical topic id (the journey node id) verbatim (Const II.7)");
c(JSON.stringify(o.filteredIds)===JSON.stringify(["topic-a"]),"filterPlanByIds surfaces exactly the journey-selected id (Journey->Plan reconcile, v7.265)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: reconcile: build error"; cat "$T/recerr.txt"|head; fail=1; fi

# ── JOURNEY LIST VIEW: plan checkboxes on lane + category, push to the shared plan (v7.266) ──
# The Journey LIST view (CanonicalJourneyView) now carries Content-Plan checkboxes at lane,
# category, and topic level — the SAME persisted set the mind-map / Content Map write (Const
# II.7). SSR render (no effects, empty plan) must show a checkbox on every lane and category
# with the right aria-label, the "N topics in Content Plan" summary, and theme-token colors only
# (no hex literals — Const IV.6 / V.5). Topic-level + PUT-on-click are render-verified in the
# jsdom client harness each release.
cat > "$T/lv.tsx" <<'EOF'
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CanonicalJourneyView } from '@/components/brief/JourneySection';
const topics:any[]=[
 {id:'t1',parentName:'Credit Cards',parentType:'procedure',product:'Balance Transfer',stage:'decision',totalVolume:100,keywords:[{keyword:'a',searchVolume:100,position:5,isGap:false}]},
 {id:'t2',parentName:'Credit Cards',parentType:'procedure',product:'Cash Back',stage:'consideration',totalVolume:80,keywords:[{keyword:'b',searchVolume:80,position:null,isGap:true,competitor:'c.com'}]},
 {id:'t3',parentName:'Budgeting Problems',parentType:'problem',product:'Living Paycheck to Paycheck',stage:'awareness',totalVolume:60,keywords:[{keyword:'c',searchVolume:60,position:null,isGap:false,origin:'demand'}]}];
const html=renderToStaticMarkup(React.createElement(CanonicalJourneyView,{topics,projectId:'p1',kwVersion:0} as any));
const cb=(html.match(/role="checkbox"/g)||[]).length;
const lane=(html.match(/Add lane to Content Plan/g)||[]).length;
const cat=(html.match(/Add category to Content Plan/g)||[]).length;
const summary=html.includes('in Content Plan');
const hex=/#[0-9a-fA-F]{3,8}\b/.test(html);
console.log(JSON.stringify({cb,lane,cat,summary,hex}));
EOF
"$ESB" "$T/lv.tsx" --bundle --format=cjs --platform=node --jsx=automatic --packages=external "--alias:@=$SRC" --outfile="$T/lv.cjs" --log-level=error 2>"$T/lverr.txt"
if [ -f "$T/lv.cjs" ]; then node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/lv.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: listview: "+n);if(!b)f++;};
c(o.lane===2,"a Content-Plan checkbox on every journey lane (product + pre-product)");
c(o.cat===2,"a Content-Plan checkbox on every category");
c(o.cb>=4,"lane + category checkboxes rendered (>=4)");
c(o.summary,"\"N topics in Content Plan\" selection summary present");
c(o.hex===false,"theme-token colors only — no hex literals (Const IV.6 / V.5)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: listview: build error"; cat "$T/lverr.txt"|head; fail=1; fi

# ── v7.267: Scope ("Add to Scope" cart / View Scope panel) invariants ──
# 1. Scope route persists IDS ONLY (Const II.7) — never a copy of the topic/brief data.
# 2. View Scope re-derives every brief from the canonical builder (a view, not a fork).
# 3. New CTAs + ScopeSection use theme tokens only (no hex) — Const IV.6 / V.5.
SCOPE_ROUTE="$SRC/app/api/projects/[id]/scope/route.ts"
SCOPE_SEC="$SRC/components/brief/ScopeSection.tsx"
CPLAN_SEC="$SRC/components/brief/ContentPlanSection.tsx"
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: scope: "+n);if(!b)f++;};
const route=fs.readFileSync(process.argv[1],"utf8");
const sec=fs.readFileSync(process.argv[2],"utf8");
const cplan=fs.readFileSync(process.argv[3],"utf8");
c(/scopeSelections:\s*selections/.test(route),"route persists ids only (scopeSelections = selections array, Const II.7)");
c(/ADD COLUMN IF NOT EXISTS scope_selections/.test(route),"route auto-migrates scope_selections column");
c(/seen\.has/.test(route),"route de-dupes ids (no double count, Const I.3)");
c(/buildCanonicalClusterTopics/.test(sec)&&/filterPlanByIds/.test(sec),"View Scope re-derives from canonical builder + filters by ids (Const II.7)");
c(/flex:\s*1[^}]*minHeight:\s*0[^}]*overflowY:\s*.auto/.test(sec),"View Scope root is one scroll container (Const IV.1)");
c(/background:\s*.var\(--c-6c63ff\).[\s\S]{0,160}color:\s*.var\(--c-08080f\)/.test(cplan),"Add to Scope CTA = filled indigo bg + theme-flipping text token (>=4.5:1 both themes, Const IV.6)");
c(/background:\s*COL\.purple[\s\S]{0,160}color:\s*.var\(--c-08080f\)/.test(cplan),"Push to Brief Agent CTA = filled purple bg + theme-flipping text token (Const IV.6)");
c(/Push to Brief Agent/.test(cplan),"Push to Brief Agent CTA present (wired later)");
c(/#[0-9a-fA-F]{3,8}\b/.test(sec)===false,"ScopeSection uses theme tokens only — no hex literals (Const IV.6/V.5)");
process.exit(f);
' "$SCOPE_ROUTE" "$SCOPE_SEC" "$CPLAN_SEC"; [ $? -ne 0 ] && fail=1

# ── v7.268: projects-list endpoint must create EVERY schema-optional column ──
# Regression for the v7.267 break: db.select().from(projects) selects all schema columns,
# so a column added to the schema but absent from the list route's ensureColumns 500s the
# dashboard (blank project list). Guard: the list route ensures scope + content_plan cols.
PROJ_ROUTE="$SRC/app/api/projects/route.ts"
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: projlist: "+n);if(!b)f++;};
const r=fs.readFileSync(process.argv[1],"utf8");
const ens=(r.split("async function ensureColumns")[1]||"").split("export async function")[0];
c(/ADD COLUMN IF NOT EXISTS scope_selections\b/.test(ens),"list route ensures scope_selections (v7.267 regression guard)");
c(/ADD COLUMN IF NOT EXISTS scope_selections_updated_at/.test(ens),"list route ensures scope_selections_updated_at");
c(/ADD COLUMN IF NOT EXISTS content_plan_selections\b/.test(ens),"list route ensures content_plan_selections");
c(/await ensureColumns\(\)/.test(r.split("export async function GET")[1]||""),"GET calls ensureColumns before selecting projects");
process.exit(f);
' "$PROJ_ROUTE"; [ $? -ne 0 ] && fail=1

# ── v7.269: scope ⊆ plan two-way sync (deselect in Scope unchecks everywhere) ──
# Scope is a curated SUBSET of content_plan_selections. Removing from scope must cascade
# OUT of the plan (so Map/Plan/Journey uncheck); shrinking the plan must prune scope. Both
# rules are enforced server-side so every client view inherits them.
CPLAN_ROUTE="$SRC/app/api/projects/[id]/content-plan/route.ts"
SCOPE_ROUTE2="$SRC/app/api/projects/[id]/scope/route.ts"
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: sync: "+n);if(!b)f++;};
const scope=fs.readFileSync(process.argv[1],"utf8");
const cplan=fs.readFileSync(process.argv[2],"utf8");
const sPut=(scope.split("export async function PUT")[1]||"");
const cPut=(cplan.split("export async function PUT")[1]||"");
c(/removed\b/.test(sPut)&&/contentPlanSelections/.test(sPut),"scope PUT cascades removed-from-scope ids out of contentPlanSelections");
c(/newScope\.has/.test(sPut),"scope PUT computes removed = old scope not in new scope");
c(/scopeSelections/.test(cPut)&&/(planSet\.has|prunedScope)/.test(cPut),"content-plan PUT prunes scopeSelections to the plan subset (scope subset of plan)");
const cascadeScopeRemoval=(oldScope,newScope,plan)=>{const ns=new Set(newScope);const rem=new Set(oldScope.filter(i=>!ns.has(i)));return plan.filter(i=>!rem.has(i));};
const prunePlanShrink=(plan,scope)=>{const ps=new Set(plan);return scope.filter(i=>ps.has(i));};
c(JSON.stringify(cascadeScopeRemoval(["a","b","c"],["a","c"],["a","b","c","d"]))===JSON.stringify(["a","c","d"]),"removing b from scope removes b from plan (cascade)");
c(JSON.stringify(prunePlanShrink(["a","c"],["a","b","c"]))===JSON.stringify(["a","c"]),"shrinking plan to {a,c} prunes scope b");
c(JSON.stringify(cascadeScopeRemoval(["a"],["a","b"],["a"]))===JSON.stringify(["a"]),"ADDING to scope does not change the plan");
process.exit(f);
' "$SCOPE_ROUTE2" "$CPLAN_ROUTE"; [ $? -ne 0 ] && fail=1

# ── v7.270: KeywordsPanel header redesign — summary intro + enlarged workflow title ──
# ── + per-card "Step N" labels + "Explore by journey" selector. Static presentational ──
# ── copy only (no data, Const I.1); theme tokens only, no hex (Const IV.6 / V.5).      ──
KW_PANEL="$SRC/components/brief/KeywordsPanel.tsx"
GLOBALS="$SRC/app/globals.css"
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: kwheader: "+n);if(!b)f++;};
const s=fs.readFileSync(process.argv[1],"utf8");
const css=fs.readFileSync(process.argv[2],"utf8");
c(/Keyword Landscape Summary/.test(s),"summary intro heading present (v7.270)");
c(/Let&rsquo;s build the workflow/.test(s),"enlarged \"Let’s build the workflow\" title present");
c(/Step \{s\.n\}/.test(s),"per-card Step N label present");
c(/Explore by journey/.test(s) && /Select a view/.test(s),"journey selector reframed with Select-a-view cue");
// theme parity: the four new copy blocks must use theme tokens, never hex.
// scope the check to the three new header regions by their marker strings.
const region=s.split("Keyword Landscape Summary")[1]?.slice(0,600)||"";
c(!/#[0-9a-fA-F]{3,8}\b/.test(region),"summary intro uses theme tokens only (no hex, Const IV.6)");
// every token referenced in the summary intro region is defined in BOTH themes (>=2 defs)
const toks=[...new Set([...region.matchAll(/var\((--c[a-z]?-[0-9a-zA-Z_-]+)\)/g)].map(m=>m[1]))];
const miss=toks.filter(t=>(css.match(new RegExp("\\"+t+":","g"))||[]).length<2);
c(miss.length===0,"summary-intro tokens defined in both themes"+(miss.length?" -> "+miss.join(","):""));
process.exit(f);
' "$KW_PANEL" "$GLOBALS"; [ $? -ne 0 ] && fail=1

# ── v7.271: Category Breakdown delete affordances — trash a keyword, sub-category, or  ──
# ── category. Destructive (category delete removes its keywords). Removes via the pool  ──
# ── (block semrush/demand/gap; hard-delete custom/csv) so the tree re-derives — no      ──
# ── taxonomy JSONB edited at a read site (Const II.7). Theme tokens only (Const IV.6).  ──
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: kwdelete: "+n);if(!b)f++;};
const s=fs.readFileSync(process.argv[1],"utf8");
const css=fs.readFileSync(process.argv[2],"utf8");
// bulk delete helper: block semrush rows, hard-delete custom/csv, then ONE refresh
const dr=(s.split("async function deleteRows")[1]||"").split("// ── CSV upload")[0].slice(0,1400);
c(/async function deleteRows/.test(s),"deleteRows bulk helper present");
c(/source === .semrush./.test(dr) && /source: .blocked./.test(dr),"semrush/demand/gap rows are blocked (hidden), not orphaned");
c(/method: .DELETE./.test(dr),"custom/csv rows hard-deleted");
c(/onKeywordsChanged\?\.\(\)/.test(dr),"one refresh after bulk delete (dependent panels update, Const II.7)");
c(/function collectOwnKeywords/.test(s) && /walk\(c\)/.test(s),"collectOwnKeywords gathers the full subtree (category delete = its keywords)");
c(/onDeleteRows=\{deleteRows\}/.test(s),"KwCategorySection wired to deleteRows");
c(/ti-trash/.test(s) && /permanently\?/.test(s),"category/sub-category trash + destructive confirm present");
c(/onConfirmDelete\?\.\('"'"'kw:'"'"' \+ k\.key, \[k\]\)/.test(s),"per-keyword chip delete present");
// theme parity: the delete UI uses tokens, never hex. Check the confirm strip region.
const region=(s.split("Delete &ldquo;")[1]||"").slice(0,900);
c(!/#[0-9a-fA-F]{3,8}\b/.test(region.replace(/var\([^)]*\)/g,"")),"delete confirm strip uses theme tokens only (no hex, Const IV.6)");
const toks=[...new Set([...region.matchAll(/var\((--c[a-z]?-[0-9a-zA-Z_-]+)/g)].map(m=>m[1]))];
const miss=toks.filter(t=>(css.match(new RegExp("\\"+t+":","g"))||[]).length<2);
c(miss.length===0,"delete-UI tokens defined in both themes"+(miss.length?" -> "+miss.join(","):""));
process.exit(f);
' "$KW_PANEL" "$GLOBALS"; [ $? -ne 0 ] && fail=1

# ── v7.278: LLM-Visibility "Sentiment of mentions" card redesign — three labeled    ──
# ── rows (positive / neutral / negative), each a horizontal bar + tone icon          ──
# ── (thumbs-up / circle-minus / thumbs-down). Presentational over REAL sentiment      ──
# ── counts (Const I.1 — no modeled data). Icon shades chosen ≥3:1 on BOTH the light   ──
# ── and dark orbit-surface; OS-based `dark:` variants forbidden (theme toggles via    ──
# ── [data-theme], Const IV.6 / V.5).                                                  ──
LLMV="$SRC/components/brief/LLMVisibilitySection.tsx"
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: llmsent: "+n);if(!b)f++;};
const s=fs.readFileSync(process.argv[1],"utf8");
c(/function SentimentBar\(\{ tone/.test(s),"SentimentBar row component present (v7.278)");
c((s.match(/<SentimentBar tone="(positive|neutral|negative)"/g)||[]).length===3,"three bar rows rendered (positive/neutral/negative)");
c(/tone="positive"[^>]*pct=\{pctPos\}/.test(s) && /tone="neutral"[^>]*pct=\{pctNeu\}/.test(s) && /tone="negative"[^>]*pct=\{pctNeg\}/.test(s),"each row bound to real sentiment pct (Const I.1)");
c(/style=\{\{ width: `\$\{pct\}%` \}\}/.test(s),"bar fill width is the data-driven pct");
c(/function ThumbsUpIcon/.test(s) && /function ThumbsDownIcon/.test(s) && /function NeutralIcon/.test(s),"three tone icons defined (thumbs up/down + neutral)");
// theme parity: no OS-based dark: variant anywhere in the file (app toggles via [data-theme])
const codeOnly=s.replace(/\/\/[^\n]*/g,"").replace(/\/\*[\s\S]*?\*\//g,"");
c(!/\bdark:/.test(codeOnly),"no OS-based dark: variants in code (Const IV.6 — theme is [data-theme]-driven)");
// icon shades are the both-theme-safe set (>=3:1 on white AND dark surface)
c(/text-green-600/.test(s) && /text-red-600/.test(s) && /text-slate-500/.test(s),"icon shades green-600/red-600/slate-500 (>=3:1 both themes)");
c(!/sentiment\.(positive|neutral|negative)\s*=\s*[0-9]/.test(s),"sentiment counts not hard-coded (real data only)");
process.exit(f);
' "$LLMV"; [ $? -ne 0 ] && fail=1


# ── v7.284/v7.285 — LOCAL services: catalog/explicit-term builders rank by REAL category ──
# ── demand (v7.285) + brand pinned + cap 10 + read-site brand guard + editable picker      ──
cat > "$T/eseed.ts" <<'EOF'
import { buildServiceCatalog, buildSeedsFromServiceTerms, DEFAULT_SERVICE_CAP } from '@/lib/local/seeds';
const pool=[{keyword:'northpeak',searchVolume:5000}];
// categories carry REAL monthlyDemand (the Market-Gap field) — catalog must rank by it (v7.285)
const cats=[{name:'Estate Planning',type:'procedure',monthlyDemand:308000},{name:'Retirement Planning',type:'procedure',monthlyDemand:1750000},{name:'Tax Planning',type:'procedure',monthlyDemand:458000},{name:'Investing',type:'procedure',monthlyDemand:108000},{name:'Northpeak',type:'brand',monthlyDemand:5000}];
const cat=buildServiceCatalog({categories:cats as any,brand:'Northpeak',clientDomain:'northpeak.com',pool:pool as any});
const ft=buildSeedsFromServiceTerms({serviceTerms:['tax planning','retirement planning','tax planning'],brand:'Northpeak',clientDomain:'northpeak.com',pool:pool as any,categories:cats as any,maxSeeds:DEFAULT_SERVICE_CAP});
const cap=buildSeedsFromServiceTerms({serviceTerms:Array.from({length:20},(_,i)=>'svc number '+i),brand:'Northpeak',clientDomain:'northpeak.com',pool:pool as any,maxSeeds:DEFAULT_SERVICE_CAP});
console.log(JSON.stringify({cap10:DEFAULT_SERVICE_CAP,catLen:cat.length,top:cat[0]&&cat[0].term,topVol:cat[0]&&cat[0].volume,last:cat[cat.length-1]&&cat[cat.length-1].term,ftVol:ft[1]&&ft[1].volume,ft:ft.map(x=>x.kind+':'+x.term),capLen:cap.length}));
EOF
"$ESB" "$T/eseed.ts" --bundle --format=cjs --platform=node --tsconfig="$T/tsc.json" --outfile="$T/seed.cjs" --log-level=error 2>"$T/seederr.txt"
if [ -s "$T/seederr.txt" ]; then echo "FAIL :: local: seeds.ts failed to bundle"; cat "$T/seederr.txt"|head; fail=1; else
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/seed.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: local: "+n);if(!b)f++;};
c(o.cap10===10,"DEFAULT_SERVICE_CAP is 10");
c(o.catLen===4,"catalog excludes client brand-name category");
c(o.top==="retirement planning"&&o.topVol===1750000,"catalog ranks by REAL category demand desc (v7.285, Const I.1/II.7)");
c(o.last==="investing","lowest-demand service last");
c(o.ft[0]==="brand:northpeak","brand pinned first in explicit-term build");
c(o.ftVol===458000,"curated term carries its real category demand (v7.285)");
c(o.ft.length===3,"explicit terms deduped (brand + 2)");
c(o.ft[1]==="service:tax planning","user order preserved");
c(o.capLen===10,"explicit list capped at 10 total");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1; fi

LS="$SRC/components/brief/LocalSearchSection.tsx"
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: local-ui: "+n);if(!b)f++;};
const s=fs.readFileSync(process.argv[1],"utf8");
c(/buildCompetitorBrandTokens/.test(s)&&/textHasCompetitorBrand/.test(s)&&/buildExcludedBrandTokens/.test(s),"imports competitor-brand guard helpers (Const III.1a)");
c(/const guardedCategories\s*=\s*useMemo/.test(s),"category read site builds guardedCategories");
c(/buildServiceCatalog\(\{ categories: guardedCategories/.test(s),"catalog reads the GUARDED categories, not raw breakdown");
c(/svc-del/.test(s)&&/removeService\(/.test(s),"per-service trash control wired to removeService");
c(/s\.kind === .service./.test(s)&&/Brand is always tracked/.test(s),"brand row pinned (no trash; services deletable)");
c(/svc-add-sel/.test(s)&&/addService\(/.test(s),"+Add service picker wired to addService");
c(/writeCuratedServices\(/.test(s)&&/orbitiq-local-services-/.test(s),"curated list persists per-project (localStorage)");
c(/services: effectiveServiceTerms/.test(s),"curated services passed to BOTH dryRun and scan");
c(/maxServices\s*=\s*Math\.max\(1, SERVICE_CAP - 1\)/.test(s),"cap = 10 total (brand + up to 9 services)");
c(/Demand \/ mo/.test(s)&&/SERVICE DEMAND \/ MO/.test(s),"services list labeled by category DEMAND (v7.285)");
c(/disabled=\{addable\.length === 0\}/.test(s)&&!/select[^>]*disabled=\{atCap/.test(s),"+Add dropdown stays browsable at cap — only disabled when nothing remains (v7.285 cap-unlock)");
process.exit(f);
' "$LS"; [ $? -ne 0 ] && fail=1

RT="$SRC/app/api/projects/[id]/local-scan/route.ts"
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: local-route: "+n);if(!b)f++;};
const s=fs.readFileSync(process.argv[1],"utf8");
c(/const curatedServices/.test(s)&&/body\?\.services/.test(s),"route reads curated body.services");
c(/buildSeedsFromServiceTerms\(\{/.test(s),"route builds seeds from curated terms when provided");
c(/guardedCategories/.test(s)&&/buildCompetitorBrandTokens/.test(s),"fallback category read applies brand guard (Const III.1a)");
c(/DEFAULT_MAX_SEEDS = 10/.test(s)&&/MAX_MAX_SEEDS\s*=\s*10/.test(s),"server default + cap = 10");
c(/buildSeedsFromServiceTerms\(\{[^}]*categories:\s*guardedCategories/.test(s.replace(/\n/g," ")),"route passes guarded categories so curated terms get real demand (v7.285)");
process.exit(f);
' "$RT"; [ $? -ne 0 ] && fail=1



# ── v7.286 — LOCAL PACK signal: Semrush Fl detection + category rollup + Keyword badge + gate ──
cat > "$T/elp.ts" <<'EOF'
import { serpFeaturesHasLocalPack } from '@/lib/apis/semrush';
import { buildLocalPackCategorySet, hasLocalPackData } from '@/lib/utils/kwVolume';
const snap={localPackDataAvailable:true,localPackKeywords:['estate planning near me','wealth management near me'],_categoryBreakdown:{keywordCategories:{'retirement planning':'Retirement Planning','estate planning near me':'Estate Planning','wealth management near me':'Wealth Management'}}};
const lp=buildLocalPackCategorySet(snap as any);
console.log(JSON.stringify({d3:serpFeaturesHasLocalPack('0,3,18'),geo:serpFeaturesHasLocalPack('geo'),name:serpFeaturesHasLocalPack('Local pack'),none:serpFeaturesHasLocalPack('0,18,21'),empty:serpFeaturesHasLocalPack(''),avail:hasLocalPackData(snap as any),hasEstate:lp.has('Estate Planning'),hasWealth:lp.has('Wealth Management'),noRetire:!lp.has('Retirement Planning'),availFalse:hasLocalPackData({localPackDataAvailable:false} as any)}));
EOF
"$ESB" "$T/elp.ts" --bundle --format=cjs --platform=node --tsconfig="$T/tsc.json" --alias:@/db="$T/lpstub.ts" --alias:@/db/schema="$T/lpstub.ts" --external:drizzle-orm --external:@neondatabase/serverless --outfile="$T/lp.cjs" --log-level=error 2>"$T/lperr.txt"
echo "export const db:any=new Proxy({},{get:()=>()=>{}}); export const apiUsage:any={};" > "$T/lpstub.ts"
"$ESB" "$T/elp.ts" --bundle --format=cjs --platform=node --tsconfig="$T/tsc.json" --alias:@/db="$T/lpstub.ts" --alias:@/db/schema="$T/lpstub.ts" --external:drizzle-orm --external:@neondatabase/serverless --outfile="$T/lp.cjs" --log-level=error 2>"$T/lperr.txt"
if [ -s "$T/lperr.txt" ]; then echo "FAIL :: localpack: bundle failed"; cat "$T/lperr.txt"|head; fail=1; else
node -e '
const o=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/lp.cjs").toString());
let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: localpack: "+n);if(!b)f++;};
c(o.d3===true,"detect Local Pack numeric id 3 in Fl list");
c(o.geo===true,"detect Projects label geo");
c(o.name===true,"detect name \"Local pack\"");
c(o.none===false&&o.empty===false,"no false positive on unrelated/empty");
c(o.avail===true&&o.availFalse===false,"hasLocalPackData reflects dataAvailable flag");
c(o.hasEstate&&o.hasWealth&&o.noRetire,"category rollup from STORED keywordCategories (real data; non-LP excluded)");
process.exit(f);
' "$T"; [ $? -ne 0 ] && fail=1; fi

# Source wiring: semrush Fl column + Keyword badge + Local gate
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: localpack: "+n);if(!b)f++;};
const sem=fs.readFileSync(process.argv[1],"utf8");
c(/export_columns: .Ph,Po,Nq,Ur,Cp,Co,Fl./.test(sem),"footprint pull requests the Fl SERP-features column");
c(/localPackKeywords/.test(sem)&&/localPackDataAvailable/.test(sem),"snapshot carries localPackKeywords + dataAvailable");
c(/SERP-features\(Fl\) colPresent/.test(sem),"first-run self-verify log of raw Fl sample present");
const kw=fs.readFileSync(process.argv[2],"utf8");
c(/localPack && \(/.test(kw)&&/Local pack/.test(kw),"Keyword panel renders a Local-pack badge");
c(/collectOwnKeywords\(n\)\.some\(r => localPackKw\.has/.test(kw),"badge computed from real per-keyword flag over the subtree");
const ls=fs.readFileSync(process.argv[3],"utf8");
c(/lpAvailable && !lpCats\.has\(name\)/.test(ls),"Local picker gates to local-pack categories when data present");
c(/needs a fresh analysis run/.test(ls),"graceful fallback notice when LP data absent (Const I.5)");
process.exit(f);
' "$SRC/lib/apis/semrush.ts" "$SRC/components/brief/KeywordsPanel.tsx" "$SRC/components/brief/LocalSearchSection.tsx"; [ $? -ne 0 ] && fail=1


# ── v7.287 — LOCAL INTENT card + row-level local detection (serpCellHasLocalPack) ──
cp "$SRC/lib/utils/kwVolume.ts" "$T/kwv.ts"
cat > "$T/elc.ts" <<'EOF'
import { serpCellHasLocalPack } from './kwv';
console.log(JSON.stringify({
  id3:   serpCellHasLocalPack('Pa, Fl, 3'),
  geo:   serpCellHasLocalPack('organic|geo|reviews'),
  name:  serpCellHasLocalPack('AI Overview, Local pack'),
  under: serpCellHasLocalPack('local_pack'),
  neg:   serpCellHasLocalPack('AI Overview, People Also Ask, Video'),
  empty: serpCellHasLocalPack(''),
  nullv: serpCellHasLocalPack(null),
}));
EOF
"$ESB" "$T/elc.ts" --bundle --format=cjs --platform=node --outfile="$T/lc.cjs" --log-level=error 2>"$T/lcerr.txt"
if [ -f "$T/lc.cjs" ]; then
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: localcard: "+n);if(!b)f++;};
const t=JSON.parse(require("child_process").execSync("node "+process.argv[1]+"/lc.cjs").toString());
c(t.id3&&t.geo&&t.name&&t.under,"serpCellHasLocalPack detects id 3 / geo / Local pack / local_pack");
c(!t.neg&&!t.empty&&!t.nullv,"serpCellHasLocalPack: no false positive on non-local / empty / null");
const kw=fs.readFileSync(process.argv[2],"utf8");
c(/id: .localIntent., label: .Local Intent./.test(kw),"Local Intent summary card present");
c(/case .localIntent.:\s*return rows\.filter\(r => r\.isLocalIntent\)/.test(kw),"applyFilter segments categories below by isLocalIntent (card click)");
c(/localClientCount/.test(kw)&&/localGapCount/.test(kw)&&/client \+ /.test(kw),"card sub-line = client footprint vs competitor gap breakout");
c(/gridTemplateColumns: .repeat\(5, 1fr\)./.test(kw),"summary grid is 5 columns (Local Intent after Non-branded)");
c(/isLocalIntent:\s*\(serp/.test(kw),"isLocalIntent ORs real signals (live SerpAPI || uploaded Fl cell || footprint roll-up)");
const css=fs.readFileSync(process.argv[3],"utf8");
const both=(v)=>(css.match(new RegExp(v.replace(/-/g,"\\-"),"g"))||[]).length>=2;
c(both("--ca-6-182-212-0_10")&&both("--ca-6-182-212-0_45")&&both("--ca-6-182-212-0_04"),"cyan card alpha tokens defined in BOTH themes (Const IV.6 parity)");
process.exit(f);
' "$T" "$SRC/components/brief/KeywordsPanel.tsx" "$SRC/app/globals.css"; [ $? -ne 0 ] && fail=1
else echo "FAIL :: localcard: build error"; cat "$T/lcerr.txt"|head; fail=1; fi


# ── v7.287 — SERP feature scan CTA moved Keyword panel → SERP Features panel ──
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: serpscan: "+n);if(!b)f++;};
const sf=fs.readFileSync(process.argv[1],"utf8");
c(/onStartSerpScan\?:\s*\(\) => void/.test(sf),"SERP panel accepts onStartSerpScan prop");
c(/serpScanRunning\?:\s*boolean/.test(sf)&&/serpScanProgress\?:/.test(sf),"SERP panel accepts running + progress props");
c(/const serpCoverage = useMemo/.test(sf)&&/remaining: Math\.max\(0, total - scannedN\)/.test(sf),"SERP panel computes coverage (remaining = total - scanned)");
c(/Scan all \{serpCoverage\.remaining/.test(sf)&&/remaining · ~/.test(sf),"prominent CTA shows remaining count + credits");
c(/onClick=\{onStartSerpScan\}/.test(sf),"CTA delegates to the page auto-batch loop (onStartSerpScan)");
c(/const lastScanLabel = lastScanTs/.test(sf)&&/Never scanned/.test(sf)&&/Last scanned/.test(sf),"last-scan timestamp / Never scanned label (Const IV.5)");
c(/Full SERP coverage/.test(sf),"full-coverage state when remaining 0");
const kw=fs.readFileSync(process.argv[2],"utf8");
c(!/keywords scanned/.test(kw)&&!/feeds AIO \/ PAA \/ Video pills/.test(kw),"old SERP coverage strip removed from Keyword panel");
c(/const mergedScanned = useMemo/.test(kw),"Keyword panel keeps mergedScanned feeding the table pills");
const pg=fs.readFileSync(process.argv[3],"utf8");
c(/<SerpFeaturesSection[\s\S]*?onStartSerpScan=\{requestSerpScan\}[\s\S]*?\/>/.test(pg),"page wires onStartSerpScan into SerpFeaturesSection");
process.exit(f);
' "$SRC/components/brief/SerpFeaturesSection.tsx" "$SRC/components/brief/KeywordsPanel.tsx" "$SRC/app/projects/[id]/page.tsx"; [ $? -ne 0 ] && fail=1


# ── v7.288 — SERP-features UNION on upload (no last-wins drop) + Local Intent honest-gap ──
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: localfix: "+n);if(!b)f++;};
const route=fs.readFileSync(process.argv[1],"utf8");
// runtime-test the REAL mergeSerpFeatures (pure fn, extracted from the shipped route)
const m=route.match(/function mergeSerpFeatures[\s\S]*?\n}/);
c(!!m,"mergeSerpFeatures present in batch route");
if(m){
  const fn=eval("("+m[0].replace(/: *string *\| *null/g,"").replace(/: *string\[\]/g,"").replace(/: *string/g,"").replace(/new Set<string>/,"new Set")+")");
  c(/local pack/i.test(fn("Video, Local pack","Related searches, Video")),"union keeps a Local pack from an earlier row (last-wins would drop it)");
  c(fn("AI overview","ai overview")==="AI overview","case-insensitive de-dupe, original casing kept");
  c(fn(null,null)===null,"null + null = null");
}
c(/serpFeatures:\s*projectKeywords\.serpFeatures/.test(route),"existing-row select pulls serp_features (cross-chunk union)");
c(/mergeSerpFeatures\(priorFeats, rowFeats\)/.test(route),"upload unions prior + new instead of last-wins");
const kw=fs.readFileSync(process.argv[2],"utf8");
c(/const localDataPresent = useMemo/.test(kw),"Keyword panel computes localDataPresent (real-signal presence)");
c(/No SERP-features in upload — re-upload to populate/.test(kw),"Local Intent card shows honest-gap notice when no SERP data (Const I.5)");
process.exit(f);
' "$SRC/app/api/projects/[id]/keywords/batch/route.ts" "$SRC/components/brief/KeywordsPanel.tsx"; [ $? -ne 0 ] && fail=1


# ── v7.289 — SERP-features write self-diagnosis (upload reports + panel coverage readout) ──
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: serpdiag: "+n);if(!b)f++;};
const route=fs.readFileSync(process.argv[1],"utf8");
c(/serpFeaturesPrepared/.test(route)&&/serpFeaturesStored/.test(route),"batch response reports prepared + stored SERP-feature counts");
c(/SELECT COUNT\(\*\)::int AS n[\s\S]*serp_features IS NOT NULL/.test(route),"batch verifies stored serp_features with a post-insert COUNT (real read-back)");
const kw=fs.readFileSync(process.argv[2],"utf8");
c(/const serpFeatCoverage = useMemo/.test(kw),"panel computes serpFeatCoverage from stored rows");
c(/SERP-features data on/.test(kw)&&/of \{serpFeatCoverage\.total/.test(kw),"panel shows coverage readout (X of N stored rows)");
c(/SERP features did not save/.test(kw),"upload result warns when sent>0 but stored===0 (write dropped)");
c(/serpPrepared \+= d\.serpFeaturesPrepared/.test(kw),"panel accumulates the upload diagnostic counts");
process.exit(f);
' "$SRC/app/api/projects/[id]/keywords/batch/route.ts" "$SRC/components/brief/KeywordsPanel.tsx"; [ $? -ne 0 ] && fail=1


# ── v7.290 — large-upload hardening (scoped existing-query + smaller batches + retry) ──
node -e '
const fs=require("fs");let f=0;const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: scale: "+n);if(!b)f++;};
const route=fs.readFileSync(process.argv[1],"utf8");
c(/const payloadKws = Array\.from\(new Set\(/.test(route),"batch builds the payload keyword set");
c(/inArray\(projectKeywords\.keyword, payloadKws\)/.test(route),"existing-rows read is SCOPED to payload keywords (no full-table re-read per batch)");
const kw=fs.readFileSync(process.argv[2],"utf8");
c(/const CHUNK = 250;/.test(kw),"upload batch size reduced to 250");
c(/MAX_ATTEMPTS = 3/.test(kw)&&/attempt <= MAX_ATTEMPTS/.test(kw),"failed batch retries up to 3x");
c(/await sleep\(attempt \* 800\)/.test(kw),"retry backs off between attempts");
c(/if \(!saved\) failed \+= chunk\.length/.test(kw),"only counts a batch failed after retries exhausted (real accounting)");
process.exit(f);
' "$SRC/app/api/projects/[id]/keywords/batch/route.ts" "$SRC/components/brief/KeywordsPanel.tsx"; [ $? -ne 0 ] && fail=1


rm -rf "$T" 2>/dev/null
if [ $fail -ne 0 ]; then echo "=== REGRESSION SUITE: FAIL ==="; exit 1; fi
echo "=== REGRESSION SUITE: PASS ==="
