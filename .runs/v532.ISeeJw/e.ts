import { buildKwPool, isForeignScriptKeyword } from '@/lib/utils/kwVolume';
import { isForeignAddress, isPhoneNumberKeyword, deterministicOther, ownBrandList, buildCategorizePrompt, buildCandidates, FILER_VERSION } from '@/lib/category/pendingCategorization';
const bt=['best buy','macy','aa.com','costco'];
const fa=(k:string)=>isForeignAddress(k,'https://www.citi.com',bt);
const snap:any={domain:'citi.com',competitors:[],topKeywords:[
 {keyword:'citi credit card',searchVolume:1000,position:1},{keyword:'花旗银行',searchVolume:500,position:1},{keyword:'tarjeta de crédito',searchVolume:300,position:4}],
 _categoryBreakdown:{categories:[{name:'Credit Cards',type:'procedure'}],keywordCategories:{'citi credit card':'Credit Cards','花旗银行':'Credit Cards','tarjeta de crédito':'Credit Cards','美國信用卡':'Credit Cards'},keywordPaths:{}}};
const up:any[]=[{keyword:'美國信用卡',search_volume:900,type:'gap',domain:'bankofamerica.com',source:'csv'}];
const pool=buildKwPool({semrushSnapshot:snap,uploadedKeywords:up,clientDomain:'citi.com',competitorDomains:['bankofamerica.com']} as any).map((p:any)=>p.keyword);
const cands=buildCandidates([{name:'Retail Partner Cards',type:'procedure'}],()=>false);
const prompt=buildCategorizePrompt('citi.com',['kohls payment'],cands,ownBrandList('https://www.citi.com',bt));
console.log(JSON.stringify({
 amex:fa('go.amex/confirmcard'), starz:fa('www.starz.com/activate'), walmart:fa('one.walmart.com'), kohls:fa('kohls.compaybill'), bjs:fa('bjs.com'),
 macys:fa('macys.com'), aa:fa('aa.com.'), citiAct:fa('cardactivation.citi.com'), bby:fa('bestbuy.accountonline.com'),
 adv:fa('adv 24/7'), na:fa('credit n/a'), plain:fa('kohls payment'), own:ownBrandList('https://www.citi.com',bt),
 cjk:isForeignScriptKeyword('美國信用卡'), cyr:isForeignScriptKeyword('кредитная карта'), acc:isForeignScriptKeyword('tarjeta de crédito'), en:isForeignScriptKeyword('credit card 0% apr'),
 ph1:isPhoneNumberKeyword('800-950-5114'), ph2:deterministicOther('8773661121','citi.com',bt), ph3:isPhoneNumberKeyword('(800) 347-2683'), ph4:isPhoneNumberKeyword('0% apr 2024'), ph5:isPhoneNumberKeyword('1099 form'), ph6:isPhoneNumberKeyword('2024'),
 pool, prompt, ver:FILER_VERSION }));
