import assert from "node:assert/strict";
import {parseEonetEvents,collectGlobalIntelligence,GLOBAL_INTEL_SOURCES}
 from "../backend/global-intelligence-monitor.js";
import {GEO_PALETTE,validateGeoScenario} from "../modules/jarvis-geospatial-model.js";
import {readFileSync} from "node:fs";

const now=Date.parse("2026-11-23T14:00:00Z");
const at=new Date(now-10*60000).toISOString();
const ice=i=>({
 id:"EONET_ICE_"+i,type:"Feature",
 geometry:{type:"Point",coordinates:[i%2? -60+i/10:15+i/10,60]},
 properties:{id:"EONET_ICE_"+i,title:"Mar ou lago monitorado "+i,
  date:at,categories:[{id:"seaLakeIce"}],
  link:"https://eonet.gsfc.nasa.gov/api/v3/events/EONET_ICE_"+i}
});
const nasa={type:"FeatureCollection",features:[
 ...Array.from({length:200},(_,i)=>ice(i)),
 {id:"EONET_WF",type:"Feature",geometry:{type:"Point",coordinates:[-50,-11]},
  properties:{id:"EONET_WF",title:"Fogo publicado",date:at,
   categories:[{id:"wildfires"}],
   link:"https://eonet.gsfc.nasa.gov/api/v3/events/EONET_WF"}}
]};
const parsed=parseEonetEvents(nasa,{now});
assert.equal(parsed.filter(x=>x.kind==="seaLakeIce").length,32,
 "bounded sampling must include actual documented NASA ice category");
assert.equal(parsed.filter(x=>x.kind==="wildfires").length,1,
 "hundreds of ice records must not hide later wildfire features");
assert.equal(parsed.length,33);
assert.ok(parsed.filter(x=>x.kind==="seaLakeIce").every(x=>
 x.description.includes("não é alerta de desastre")),
 "lake and sea ice must not be misrepresented as hazardous");
assert.ok(Object.hasOwn(GEO_PALETTE,"seaLakeIce"));

const usgs={type:"FeatureCollection",features:Array.from({length:20},(_,i)=>({
 id:"us_"+i,type:"Feature",
 properties:{mag:5.5,title:"USGS "+i,time:now-100000,updated:now-100000,
  url:"https://earthquake.usgs.gov/earthquakes/eventpage/us_"+i},
 geometry:{type:"Point",coordinates:[60+i/10,-5]}}))};
const gdacs={type:"FeatureCollection",features:Array.from({length:100},(_,i)=>({
 type:"Feature",properties:{eventid:i+10,eventtype:"TC",name:"Storm "+i,
  alertlevel:"Orange",fromdate:at,
  url:"https://www.gdacs.org/report.aspx?eventid="+(i+10)+"&eventtype=TC"},
 geometry:{type:"Point",coordinates:[120+i/100,30]}}))};
const report=await collectGlobalIntelligence({now:()=>now,fetchImpl:async url=>({
 ok:true,json:async()=>url.startsWith(GLOBAL_INTEL_SOURCES.usgs.url)?usgs:
  url.startsWith(GLOBAL_INTEL_SOURCES.nasa.url)?nasa:gdacs
})});
assert.equal(report.ok,true);
assert.equal(report.partial,false);
assert.equal(report.sourceStatus.find(x=>x.source==="nasa").receivedCount,201);
assert.equal(report.sourceStatus.find(x=>x.source==="nasa").count,33);
assert.equal(report.sourceStatus.find(x=>x.source==="nasa").discardedCount,168);
assert.equal(report.eventCount,153);
assert.equal(report.events.length,110,"max public world scene remains bounded");
for(const source of ["usgs","nasa","gdacs"]){
 assert.ok(report.events.filter(x=>x.source===source).length>=12,
  "each responding provider must keep a visible share: "+source);
}
const ring=readFileSync(new URL("../modules/jarvis-global-intelligence-ring.js",import.meta.url),"utf8");
assert.match(ring,/seaLakeIce:"seaLakeIce"/,
 "the Ring must preserve NASA ice as its own map type");
assert.match(ring,/seaLakeIce:"Gelo marinho\/lacustre"/,
 "the filter must identify environmental ice correctly");
const icePoints=report.events.filter(e=>e.kind==="seaLakeIce").slice(0,12).map(e=>({
 id:e.id,name:e.title,lat:e.lat,lng:e.lng,kind:e.kind,detail:e.description,
 source:e.url,observedAt:e.eventAt
}));
assert.ok(icePoints.length>=12);
const valid=validateGeoScenario({
 id:"global-ice-test",source:{name:"NASA EONET",
  url:"https://eonet.gsfc.nasa.gov/",disclaimer:"Registro ambiental, não risco previsto."},
 frames:[{id:"ice",name:"Gelo monitorado",type:"registro publicado",
  kind:"observed",description:"Pontos catalogados, não área de risco.",points:icePoints}]
});
assert.ok(valid,"NASA ice points must be accepted by canonical geospatial validation");
assert.ok(valid.frames[0].points.every(p=>p.kind==="seaLakeIce"));
assert.ok(valid.frames[0].points.every(p=>p.source.includes("eonet.gsfc.nasa.gov")));
console.log("WORLD NASA ICE PASS: 461-style source schema, category fairness, 3-provider visibility and non-hazard map labels");
