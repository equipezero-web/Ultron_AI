import assert from "node:assert/strict";
import {GLOBAL_INTEL_SOURCES,parseUsgsEvents,parseEonetEvents,parseGdacsEvents,
 globalIntelFetchList,collectGlobalIntelligence,pollGlobalIntelligence,
 latestGlobalIntelligence} from "../backend/global-intelligence-monitor.js";
import {parseGlobalIntelligenceIntent} from "../modules/jarvis-global-intelligence-intent.js";
import {parseLocalCommand} from "../modules/jarvis-local-commands.js";

const now=Date.parse("2026-11-12T15:00:00.000Z");
const ms=now-30*60000,t=new Date(ms).toISOString();
const usgs={type:"FeatureCollection",features:[
 {id:"us123",geometry:{type:"Point",coordinates:[-36.5,-9.0,20]},
  properties:{mag:6.1,title:"M 6.1 - near Brazil",place:"Brazil region",
    time:ms,updated:ms,url:"https://earthquake.usgs.gov/earthquakes/eventpage/us123"}},
 {id:"us-invalid",geometry:{type:"Point",coordinates:[-36,-9]},properties:{
  mag:4,title:"Too small",time:ms,url:"https://earthquake.usgs.gov/earthquakes/eventpage/bad"}},
 {id:"us-evil",geometry:{type:"Point",coordinates:[-36,-9]},properties:{
  mag:9,title:"Forged source",time:ms,url:"https://evil.example.net/events/100"}}]};
const eonet={type:"FeatureCollection",features:[
 {type:"Feature",id:"EONET_100",properties:{id:"EONET_100",title:"Brazil wildfire report",
   date:t,categories:[{id:"wildfires"}],link:"https://eonet.gsfc.nasa.gov/api/v3/events/EONET_100"},
   geometry:{type:"Point",coordinates:[-38,-8]}},
 {id:"bad-eonet",properties:{id:"bad-eonet",title:"Unknown",date:t,categories:[{id:"alien"}]},
   geometry:{type:"Point",coordinates:[0,0]}}]};
const gdacs={type:"FeatureCollection",features:[
 {type:"Feature",properties:{eventid:100, eventtype:"TC",name:"Cyclone 100",
    alertlevel:"Red",fromdate:t,url:"https://www.gdacs.org/report.aspx?eventid=100&eventtype=TC"},
   geometry:{type:"Point",coordinates:[140,14]}}
]};
assert.equal(parseUsgsEvents(usgs,{now}).length,1);
assert.equal(parseUsgsEvents(usgs,{now})[0].kind,"earthquake");
assert.equal(parseUsgsEvents(usgs,{now})[0].nearBrazil,true);
assert.equal(parseEonetEvents(eonet,{now}).length,1);
assert.equal(parseGdacsEvents(gdacs,{now})[0].gdacsAlert,"red");
assert.equal(parseUsgsEvents({},{now}),null);
assert.equal(parseEonetEvents({},{now}),null);
assert.equal(parseGdacsEvents({},{now}),null);
assert.match(globalIntelFetchList(now)[2][1],/eventlist=EQ%3BTC%3BFL/);
const urlList=[];
const fetchImpl=async url=>{
 urlList.push(url);
 if(url.startsWith(GLOBAL_INTEL_SOURCES.usgs.url))return {ok:true,json:async()=>usgs};
 if(url.startsWith(GLOBAL_INTEL_SOURCES.nasa.url))return {ok:true,json:async()=>eonet};
 if(url.startsWith(GLOBAL_INTEL_SOURCES.gdacs.url))return {ok:true,json:async()=>gdacs};
 throw Error("Unexpected URL "+url);
};
const result=await collectGlobalIntelligence({fetchImpl,now:()=>now});
assert.equal(result.ok,true);
assert.equal(result.partial,false);
assert.equal(result.eventCount,3);
assert.equal(result.events.length,3);
assert.equal(result.events[0].source,"gdacs","Official RED label precedes magnitude display order");
assert.equal(result.sourceStatus.length,3);
assert.equal(urlList.length,3);
assert.match(result.disclaimer,/não é uma previsão de risco/i);
const partial=await collectGlobalIntelligence({now:()=>now,fetchImpl:async url=>{
 if(url.includes("gdacs.org"))throw Error("temporary provider outage");
 return fetchImpl(url);
}});
assert.equal(partial.ok,true);
assert.equal(partial.partial,true);
assert.equal(partial.sourceStatus.filter(s=>!s.ok).length,1);
assert.equal(partial.events.every(x=>x.source!=="gdacs"),true);
const allOutage=await collectGlobalIntelligence({now:()=>now,fetchImpl:async()=>{
 throw Error("service unavailable");
}});
assert.equal(allOutage.ok,false);
assert.equal(allOutage.sourceStatus.length,3);
const store=new Map();
const db={prepare(query){
 return {bind(...args){
   return {async first(){
     if(query.includes("WHERE bucket = ?"))return store.has(args[0])?{bucket:args[0]}:null;
     if(query.includes("ORDER BY checked_at"))return [...store.values()].at(-1)||null;
     return null;
   },async run(){
     if(query.includes("INSERT OR IGNORE"))store.set(args[0],{bucket:args[0],snapshot_json:args[1],checked_at:args[2]});
     return {success:true};
   }};
 },async run(){return {success:true};}};
}};
const env={ULTRON_DB:db};
const checkpoint=new Date(now);
const inserted=await pollGlobalIntelligence(env,{now:()=>checkpoint,fetchImpl});
assert.equal(inserted.ok,true);assert.equal(inserted.eventCount,3);
assert.equal(store.size,1);
const dedup=await pollGlobalIntelligence(env,{now:()=>checkpoint,fetchImpl});
assert.equal(dedup.skipped,true);assert.equal(store.size,1);
const outside=await pollGlobalIntelligence(env,{now:()=>new Date(now+15*60000),fetchImpl});
assert.equal(outside.reason,"outside-hourly-window");
const cached=await latestGlobalIntelligence(env,{now:()=>now+30*60000});
assert.equal(cached.ok,true);assert.equal(cached.stale,false);
assert.equal(cached.cadenceHours,1);assert.equal(cached.events.length,3);
const stale=await latestGlobalIntelligence(env,{now:()=>now+3*3600000});
assert.equal(stale.stale,true,"Past source time must be visible as stale");
assert.equal((await latestGlobalIntelligence({ULTRON_DB:null})).ok,false);
for(const [q,v,region] of [
 ["Jarvis, mostre a inteligência global no globo 3D","3d","world"],
 ["Jarvis, abra o monitoramento mundial no mapa 2D","2d","world"],
 ["Jarvis, mostre os eventos mundiais","3d","world"],
 ["Jarvis, mostre os eventos naturais no Brasil","3d","brazil"],
 ["Jarvis, mostre os terremotos no mundo","3d","world"]
]){
 const parsed=parseLocalCommand(q);
 assert.equal(parsed?.type,"global-intelligence",q);
 assert.equal(parsed.view,v,q);assert.equal(parsed.region,region,q);
}
assert.equal(parseLocalCommand("Jarvis, mostre terremotos no mundo")?.category,"earthquake");
for(const q of ["Como funciona a inteligência global?","Não mostre o monitoramento mundial",
 "E se eu abrir a inteligência global?","Me conte as notícias do mundo", "Limpe tudo"]){
 assert.equal(parseGlobalIntelligenceIntent(q),null,q);
}
console.log("GLOBAL INTEL PASS: strict real-source ingestion, 3 feeds, source outages, hourly D1 dedup, stale timestamps, voice intents and safety");
