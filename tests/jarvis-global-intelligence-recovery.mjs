import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {collectGlobalIntelligence,pollGlobalIntelligence,latestGlobalIntelligence}
 from "../backend/global-intelligence-monitor.js";
import {buildContinuityStatus} from "../backend/continuity-status.js";
import {continuityView} from "../modules/jarvis-continuity-model.js";

const base=Date.parse("2026-11-23T09:00:00.000Z");
const eventAt=new Date(base-30*60000).toISOString();
const usgs={type:"FeatureCollection",features:[{
 id:"us-current",type:"Feature",properties:{
 mag:5.6,title:"USGS catalog event",place:"Example",
 time:base-30*60000,updated:base-20*60000,
 url:"https://earthquake.usgs.gov/earthquakes/eventpage/us-current"},
 geometry:{type:"Point",coordinates:[-39,-9]}}]};
const nasa={type:"FeatureCollection",features:[{
 type:"Feature",id:"EONET_11",properties:{
 id:"EONET_11",title:"NASA cataloged wildfire",date:eventAt,
 categories:[{id:"wildfires"}],
 link:"https://eonet.gsfc.nasa.gov/api/v3/events/EONET_11"},
 geometry:{type:"Point",coordinates:[-48,-15]}}]};
const gdacs={type:"FeatureCollection",features:[{
 type:"Feature",properties:{
 eventid:1234,eventtype:"FL",name:"GDACS cataloged flood",
 alertlevel:"Orange",fromdate:eventAt,
 url:"https://www.gdacs.org/report.aspx?eventid=1234&eventtype=FL"},
 geometry:{type:"Point",coordinates:[140,12]}}]};
let fallbackHealthy=false,searchHealthy=false,requestLog=[];
const get=async url=>{
 requestLog.push(url);
 if(url.includes("earthquake.usgs.gov"))return {ok:true,json:async()=>usgs};
 if(url.includes("eonet.gsfc.nasa.gov"))return {ok:true,json:async()=>nasa};
 if(url.includes("/geteventlist/SEARCH")){
  if(!searchHealthy)throw Error("HTTP 503");
  return {ok:true,json:async()=>gdacs};
 }
 if(url.includes("/geteventlist/events4app")){
  if(!fallbackHealthy)throw Error("HTTP 502");
  return {ok:true,json:async()=>gdacs};
 }
 throw Error("Unknown endpoint");
};
const partial=await collectGlobalIntelligence({fetchImpl:get,now:()=>base});
assert.equal(partial.ok,true);
assert.equal(partial.partial,true);
assert.equal(partial.sourceStatus.filter(s=>s.ok).length,2);
assert.equal(partial.events.some(e=>e.source==="gdacs"),false);
const gdacsFailure=partial.sourceStatus.find(s=>s.source==="gdacs");
assert.match(gdacsFailure.error,/HTTP 503/);
assert.match(gdacsFailure.fallbackError,/HTTP 502/);
assert.equal(requestLog.length,4,"only official GDACS fallback is additionally queried");
fallbackHealthy=true;
requestLog=[];
const fallback=await collectGlobalIntelligence({fetchImpl:get,now:()=>base});
assert.equal(fallback.partial,false);
assert.equal(fallback.sourceStatus.filter(s=>s.ok).length,3);
assert.equal(fallback.sourceStatus.find(s=>s.source==="gdacs").mode,"official-recent-fallback");
assert.equal(fallback.events.some(e=>e.source==="gdacs"),true);
assert.equal(requestLog.length,4);
searchHealthy=true;
const primary=await collectGlobalIntelligence({fetchImpl:get,now:()=>base});
assert.equal(primary.sourceStatus.find(s=>s.source==="gdacs").mode,"primary");
assert.equal(primary.partial,false);

function makeDb(){
 const raw=new DatabaseSync(":memory:");
 const prepare=(sql,args=[])=>({
  bind(...next){return prepare(sql,next);},
  async first(){return raw.prepare(sql).get(...args)||null;},
  async run(){const result=raw.prepare(sql).run(...args);
   return {success:true,meta:{changes:Number(result.changes)}};}
 });
 return {raw,env:{ULTRON_DB:{prepare}}};
}
const one=makeDb();
let current=base;
searchHealthy=false;fallbackHealthy=false;
let first=await pollGlobalIntelligence(one.env,{now:()=>new Date(current),fetchImpl:get});
assert.equal(first.ok,true);assert.equal(first.partial,true);
let row=one.raw.prepare("SELECT * FROM jarvis_global_intelligence").get();
assert.ok(row);assert.equal(JSON.parse(row.snapshot_json).sourceStatus.filter(s=>s.ok).length,2);
const originalCheckedAt=row.checked_at;
current+=5*60000;
let cooldown=await pollGlobalIntelligence(one.env,{now:()=>new Date(current),fetchImpl:get});
assert.equal(cooldown.reason,"partial-retry-cooldown");
current=base+16*60000;
let notImproved=await pollGlobalIntelligence(one.env,{now:()=>new Date(current),fetchImpl:get});
assert.equal(notImproved.reason,"retry-without-improved-coverage");
assert.equal(notImproved.coverageImproved,false);
row=one.raw.prepare("SELECT * FROM jarvis_global_intelligence").get();
assert.equal(row.checked_at,originalCheckedAt,"failed retry cannot reset freshness");
assert.equal(JSON.parse(row.snapshot_json).retryCheckedAt,new Date(current).toISOString());
current+=60000;
cooldown=await pollGlobalIntelligence(one.env,{now:()=>new Date(current),fetchImpl:get});
assert.equal(cooldown.reason,"partial-retry-cooldown");
current=base+32*60000;fallbackHealthy=true;
let improved=await pollGlobalIntelligence(one.env,{now:()=>new Date(current),fetchImpl:get});
assert.equal(improved.ok,true);assert.equal(improved.partial,false);
assert.equal(improved.reason,"partial-coverage-improved");
const newRow=one.raw.prepare("SELECT * FROM jarvis_global_intelligence").get();
assert.equal(JSON.parse(newRow.snapshot_json).sourceStatus.filter(s=>s.ok).length,3);
assert.notEqual(newRow.checked_at,originalCheckedAt,
 "freshness is reset only after a genuinely improved full source consultation");
current+=60000;
const complete=await pollGlobalIntelligence(one.env,{now:()=>new Date(current),fetchImpl:get});
assert.equal(complete.reason,"bucket-already-collected");
const latest=await latestGlobalIntelligence(one.env,{now:()=>current});
assert.equal(latest.ok,true);assert.equal(latest.sourceStatus.filter(s=>s.ok).length,3);
assert.equal(latest.stale,false);

// The public continuity digest must reveal exactly which provider was
// unavailable, without claiming a predicted natural-disaster impact.
const degraded=buildContinuityStatus({globalReport:partial,now:base+60000});
assert.equal(degraded.world.state,"partial");
assert.equal(degraded.world.sourceCount,2);
assert.equal(degraded.world.sources.find(s=>s.name==="GDACS").status,"failed");
assert.equal(degraded.world.sources.find(s=>s.name==="GDACS").reason,"HTTP 503");
const view=continuityView(degraded);
assert.match(view.text,/GDACS/);
assert.match(view.text,/2\/3/);
assert.deepEqual(view.status.failedSources,["GDACS"]);
assert.doesNotMatch(view.text,/risco calculado|desastre iminente/);

// Creating a second D1 binding within the same isolate must initialize the
// schema again rather than using stale module-global schemaReady state.
const two=makeDb();
const second=await pollGlobalIntelligence(two.env,{now:()=>new Date(base),fetchImpl:get});
assert.equal(second.ok,true);
assert.ok(two.raw.prepare(
 "SELECT name FROM sqlite_master WHERE type='table' AND name='jarvis_global_intelligence'"
).get());
one.raw.close();two.raw.close();
console.log("GLOBAL INTELLIGENCE RECOVERY PASS: official GDACS fallback, 2/3 truthfulness, D1 partial retry cooldown, no false freshness, source diagnostics, separate bindings");
