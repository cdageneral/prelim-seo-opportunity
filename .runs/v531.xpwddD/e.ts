import { buildKwPool } from '@/lib/utils/kwVolume';
import { buildCandidates, buildCategorizePrompt, parseAssignments, membershipFor } from '@/lib/category/pendingCategorization';
import { hierarchicalDiscoveryPrompt } from '@/lib/claude/prompts';
const snap:any={domain:'quickenloans.com',competitors:[],topKeywords:[
 {keyword:'quicken loans login',searchVolume:1000,position:1},
 {keyword:'mortgage calculator',searchVolume:5000,position:3},
 {keyword:'loan payoff calculator',searchVolume:4000,position:5}],
 _categoryBreakdown:{categories:[{name:'Mortgages',type:'procedure'},{name:'Mortgage Calculators',type:'procedure',parent:'Mortgages'},{name:'Loan Tools',type:'procedure'},{name:'Brand Searches',type:'brand'},{name:'Other',type:'procedure'}],
  keywordCategories:{'quicken loans login':'Brand Searches','mortgage calculator':'Mortgage Calculators','loan payoff calculator':'Loan Tools'},
  keywordPaths:{'quicken loans login':['Brand Searches'],'mortgage calculator':['Mortgages','Mortgage Calculators'],'loan payoff calculator':['Loan Tools']}}};
const up:any[]=[{keyword:'refinance rates',search_volume:900,type:'gap',domain:'rocketmortgage.com',source:'csv'}];
const args:any={semrushSnapshot:snap,uploadedKeywords:up,clientDomain:'quickenloans.com',competitorDomains:['payoffpro.com']};
const pool=buildKwPool(args), pend=buildKwPool({...args,includePending:true});
const noTree=buildKwPool({...args,semrushSnapshot:{...snap,_categoryBreakdown:undefined}});
const cands=buildCandidates(snap._categoryBreakdown.categories,(n:string,t?:string)=>t==='brand');
const prompt=buildCategorizePrompt('quickenloans.com',['refinance rates','zzz'],cands);
const parsed=parseAssignments('{"a":[[1,1],[2,0],[3,9]]}',3,cands);
const bad=parseAssignments('{"a":[[1,99]]}',1,cands);
const mem=membershipFor(['Refinance Rates','zzz','left'],parsed.picks);
const anch=hierarchicalDiscoveryPrompt('x.com','banking',[{keyword:'k',searchVolume:1,clientPosition:null} as any],'Mortgages > Mortgage Calculators');
console.log(JSON.stringify({
 calcBranded: pool.find((p:any)=>p.keyword==='loan payoff calculator')?.isBranded,
 loginBranded: pool.find((p:any)=>p.keyword==='quicken loans login')?.isBranded,
 poolKw: pool.map((p:any)=>p.keyword).sort(), pendKw: pend.map((p:any)=>p.keyword).sort(), noTreeN: noTree.length,
 cands: cands.map(c=>c.n+':'+c.path.join('>')), prompt, parsed: parsed.picks.map(p=>p===undefined?'U':p===null?'0':p.name), unans: parsed.unanswered,
 bad: bad.unanswered, mem, anch }));
