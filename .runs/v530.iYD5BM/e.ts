import { buildKwPool } from '@/lib/utils/kwVolume';
import { buildCategoryGuard } from '@/lib/category/categoryGuard';
const mk=(bt:string[])=>({domain:'citi.com',competitors:[],_brandTerms:bt,topKeywords:[
 {keyword:'citi double cash card',searchVolume:49500,position:3},
 {keyword:'citi travel',searchVolume:9900,position:2},
 {keyword:'best buy credit card',searchVolume:550000,position:4},
 {keyword:'chase amazon login',searchVolume:33100,position:40},
 {keyword:'nordstrom card',searchVolume:300,position:null},
 {keyword:'balance transfer cards',searchVolume:40000,position:8}],
 _categoryBreakdown:{categories:[
  {name:'Brand Searches',type:'brand'},{name:'Co-Branded & Retail Cards',type:'brand'},
  {name:'Nordstrom Brand Searches',type:'brand'},{name:'Balance Transfer',type:'procedure'}],
  keywordCategories:{'citi double cash card':'Brand Searches','chase amazon login':'Brand Searches',
   'best buy credit card':'Co-Branded & Retail Cards','nordstrom card':'Nordstrom Brand Searches',
   'citi travel':'Brand Searches','balance transfer cards':'Balance Transfer'},
  brandKeywords:['citi travel','best buy credit card','chase amazon login']}});
const run=(bt:string[])=>buildKwPool({semrushSnapshot:mk(bt),uploadedKeywords:[],clientDomain:'citi.com',competitorDomains:[],brandTerms:bt}).map(p=>p.keyword).sort();
const g=(bt:string[])=>{const s=mk(bt);return Array.from(buildCategoryGuard(s,'citi.com',[]).droppedCategoryNames(s._categoryBreakdown.categories)).sort();};
console.log(JSON.stringify({none:run([]),partner:run(['best buy']),gNone:g([]),gPartner:g(['best buy'])}));
