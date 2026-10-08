const fs=require('fs');let f=0;
const c=(b,n)=>{console.log((b?"PASS":"FAIL")+" :: v442-gate: "+n);if(!b)f++;};
const src=fs.readFileSync(process.argv[3]+"/app/projects/[id]/page.tsx","utf8");
// updated 2026-08-13 (v7.443): the helper moved to lib/snapshotFootprint.ts so a third
// caller could not re-derive it (Const II.7). The page must now IMPORT it, not define it.
c(/from .@\/lib\/snapshotFootprint./.test(src),"page defines snapshotHasFootprint");
c(/&& snapshotHasFootprint\(latestAnalysis\.semrushSnapshot\)/.test(src),"the resume gate tests the footprint, not the object");
c(!/status !== .completed.\s*\n\s*&& latestAnalysis\.semrushSnapshot;/.test(src),"the old truthy-object test is gone");
const m=fs.readFileSync(process.argv[3]+"/lib/snapshotFootprint.ts","utf8").match(/export function snapshotHasFootprint\(snap: any\): boolean \{[\s\S]*?\n\}/);
c(!!m,"the helper body is extractable");
if(m){
  const fn=new Function("snap", m[0].replace(/export function snapshotHasFootprint\(snap: any\): boolean \{/,"").replace(/snapshotFootprintCount\(snap\)/,"((snap&&typeof snap===\"object\")?((Array.isArray(snap.topKeywords)?snap.topKeywords.length:0)+(Array.isArray(snap.gapKeywords)?snap.gapKeywords.length:0)):0)").replace(/\}\s*$/,"").replace(/: boolean/g,""));
  c(fn({topKeywords:[],gapKeywords:[],positionDist:null})===false,"an EMPTIED snapshot is not resumable (the First Citizens shape)");
  c(fn(null)===false,"a missing snapshot is not resumable");
  c(fn({})===false,"a bare object is not resumable");
  c(fn({topKeywords:[{keyword:"k"}],gapKeywords:[]})===true,"a client footprint IS resumable");
  c(fn({topKeywords:[],gapKeywords:[{keyword:"g"}]})===true,"a competitor-gap footprint IS resumable");
}
process.exit(f);
