import assert from "node:assert/strict";
import {SPATIAL_LAYERS,spatialSampling,spatialClass,normalizeSpatialResponse,loadSpatialIntensity,spatialSummary}
 from "../modules/jarvis-spatial-intensity.js";
assert.equal(spatialSampling("rain","brazil").length,35);
assert.equal(spatialSampling("temp","world").length,40);
assert.equal(spatialSampling("marine","brazil").length,16);
assert.equal(spatialSampling("river","world").length,15);
assert.equal(spatialSampling("drought","brazil").length,0);
assert.equal(spatialSampling("arbitrary","brazil"),null);
assert.equal(spatialClass("rain",0).index,0);
assert.equal(spatialClass("rain",50).index,4);
assert.equal(spatialClass("rain",60).index,5);
assert.equal(spatialClass("soil",0.1).index,0);
const now=()=>"2026-11-11T19:00:00.000Z";
const day=["2026-11-11","2026-11-12","2026-11-13"];
const requests=[];
async function mock(url,options){
 const u=new URL(url);requests.push(u);
 assert.equal(options.method,"GET");assert.ok(options.signal);
 assert.ok(["api.open-meteo.com","air-quality-api.open-meteo.com",
   "marine-api.open-meteo.com","flood-api.open-meteo.com"].includes(u.hostname));
 const lat=u.searchParams.get("latitude").split(","),
  lon=u.searchParams.get("longitude").split(",");
 assert.equal(lat.length,lon.length);
 assert.ok(lat.length<=40,"Never use unbounded arbitrary coordinates");
 const d=u.searchParams.get("daily"),cur=u.searchParams.get("current"),hr=u.searchParams.get("hourly");
 return {ok:true,json:async()=>lat.map((x,i)=>({
   latitude:Number(x),longitude:Number(lon[i]),
   daily:{time:day,[d||"dummy"]:[i*2,i*2+10,i*2+20]},
   current:{time:"2026-11-11T18:00",[cur||"dummy"]:i*3+5},
   hourly:{time:["2026-11-11T19:00"],[hr||"dummy"]:[.1+i*.002]}
 }))};
}
for(const layer of ["rain","temp","soil","air","marine","river"]){
 const region=layer==="marine"?"world":"brazil";
 const r=await loadSpatialIntensity({layer,region,day:1},{fetchImpl:mock,now});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.ok(r.sampledCount>=15);
 assert.equal(r.cells.length,r.sampledCount);
 assert.ok(r.cells.every(c=>/#[a-f0-9]{6}/i.test(c.color)&&c.label&&c.time));
 assert.ok(r.legend.length>=6);
 assert.ok(spatialSummary(r).includes(r.source.name));
 assert.ok(r.disclaimer);
 if(layer==="rain"){
  assert.equal(r.cells[0].value,10);
  assert.equal(r.cells[0].time,"2026-11-12");
  assert.equal(r.cells[1].value,12);
  assert.ok(r.cells[0].bounds.length===4);
 }
 if(layer==="river")assert.ok(r.cells.every(c=>c.bounds===null),"River discharge must be point-only, not pretend flood polygons");
 if(layer==="soil")assert.ok(r.disclaimer.includes("não é diagnóstico S0–S4"));
}
assert.equal((await loadSpatialIntensity({layer:"drought",region:"brazil"},{fetchImpl:mock,now})).status,409);
assert.equal((await loadSpatialIntensity({layer:"alerts",region:"brazil"},{fetchImpl:mock,now})).status,409);
assert.equal((await loadSpatialIntensity({layer:"rain",region:"Mars"},{fetchImpl:mock,now})).status,400);
assert.equal((await loadSpatialIntensity({layer:"rain",region:"brazil",day:5},{fetchImpl:mock,now})).status,400);
assert.equal(requests.length,6,"Official-link layers and invalid requests must not invoke providers");
const missing=Array.from({length:35},()=>({daily:{time:day,precipitation_sum:[null,null,null]}}));
assert.equal(normalizeSpatialResponse("rain","brazil",1,missing,{now}),null,"No fabricated cells");
const untrusted=Array.from({length:35},()=>({daily:{time:day,precipitation_sum:[10,Infinity,20]}}));
assert.equal(normalizeSpatialResponse("rain","brazil",1,untrusted,{now}),null);
const onlyPart=Array.from({length:35},(_,i)=>({daily:{time:day,precipitation_sum:[1,i===0?null:22,1]}}));
const r=normalizeSpatialResponse("rain","brazil",1,onlyPart,{now});
assert.equal(r.sampledCount,34,"Missing sample must remain blank, not interpolated");
console.log("SPATIAL WEATHER PASS: 6 real model layers, 35/40-point bounded grids, physical units, 3 days, missing-value safety, official-drought guard");
