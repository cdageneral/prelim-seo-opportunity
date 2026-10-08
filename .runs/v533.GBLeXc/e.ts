import { brandRootOf } from '@/lib/utils/brandRoot';
import { extractBrand, buildKwPool } from '@/lib/utils/kwVolume';
import { extractBrand as jx } from '@/lib/journey/classifier';
import { brandTermsOf } from '@/lib/journey/contentPlan';
const roots = ['creditcards.chase.com','https://www.citi.com/','business.comcast.com','https://keybank.con','https://shop.audionova.com/','hsbc.co.uk','td.com','us.etrade.com','go.amex'].map(brandRootOf);
const snap:any={domain:'citi.com',competitors:[],topKeywords:[{keyword:'best credit cards',searchVolume:1000,position:3},{keyword:'chase sapphire',searchVolume:500,position:9}]};
const up:any[]=[{keyword:'credit cards for fair credit',search_volume:900,type:'gap',domain:'creditcards.chase.com',source:'csv'},{keyword:'chase freedom',search_volume:800,type:'gap',domain:'creditcards.chase.com',source:'csv'}];
const pool=buildKwPool({semrushSnapshot:snap,uploadedKeywords:up,clientDomain:'citi.com',competitorDomains:['creditcards.chase.com']} as any).map((p:any)=>p.keyword).sort();
console.log(JSON.stringify({roots, kv:extractBrand('creditcards.chase.com'), jx:jx('business.comcast.com'), bt:brandTermsOf('https://shop.audionova.com/',{})[0], pool}));
