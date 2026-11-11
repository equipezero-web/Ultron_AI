import assert from "node:assert/strict";
import {validateWatchSample,configureWeatherWatch,listWeatherWatches,pollPersonalWeatherWatches} from "../backend/weather-watchlist.js";

const USER="a".repeat(64),OTHER="b".repeat(64);
const date=new Date("2026-11-11T12:00:00.000Z"),now=()=>date.toISOString();
const raw={
 current:{time:"2026-11-11T09:00",temperature_2m:30,relative_humidity_2m:70,wind_speed_10m:8},
 daily:{precipitation_sum:[7],precipitation_probability_max:[80]}
};
assert.equal(validateWatchSample(raw)?.rainMm,7);
assert.equal(validateWatchSample({...raw,current:{...raw.current,temperature_2m:null}}),null);
assert.equal(validateWatchSample({...raw,daily:{precipitation_sum:[null],precipitation_probability_max:[80]}}),null);
assert.equal(validateWatchSample({...raw,current:{...raw.current,time:"yesterday"}}),null);

const watches=new Map(),samples=new Map(),schemas=[];
function stmt(sql){
 return {bind(...args){
   return {
    async run(){
     if(sql.startsWith("INSERT OR IGNORE INTO jarvis_weather_watches")){
      const [operator,id,name,country,lat,lng,at]=args;
      const key=operator+":"+id;if(!watches.has(key))watches.set(key,{operator_id:operator,location_id:id,name,country,latitude:lat,longitude:lng,created_at:at,last_checked_at:null});
      return {meta:{changes:1}};
     }
     if(sql.startsWith("UPDATE jarvis_weather_watches")){
      const [at,operator,id,cutoff]=args;const w=watches.get(operator+":"+id);
      if(!w||w.last_checked_at&&w.last_checked_at>=cutoff)return {meta:{changes:0}};
      w.last_checked_at=at;return {meta:{changes:1}};
     }
     if(sql.startsWith("INSERT OR IGNORE INTO jarvis_weather_watch_samples")){
      const [operator,id,bucket,at,data]=args;samples.set(operator+":"+id+":"+bucket,
       {operator_id:operator,location_id:id,bucket,fetched_at:at,summary_json:data});
      return {meta:{changes:1}};
     }
     if(sql.startsWith("DELETE FROM jarvis_weather_watches")){
      watches.delete(args[0]+":"+args[1]);return {meta:{changes:1}};
     }
     if(sql.startsWith("DELETE FROM jarvis_weather_watch_samples WHERE operator_id")){
      for(const [k,v] of samples)if(v.operator_id===args[0]&&v.location_id===args[1])samples.delete(k);
      return {meta:{changes:1}};
     }
     if(sql.startsWith("DELETE FROM jarvis_weather_watch_samples WHERE fetched_at")){
      for(const [k,v] of samples)if(v.fetched_at<args[0])samples.delete(k);
      return {meta:{changes:1}};
     }
     throw Error("Unexpected run SQL "+sql);
    },
    async first(){
     if(sql.startsWith("SELECT location_id FROM jarvis_weather_watches"))return watches.get(args[0]+":"+args[1])||null;
     if(sql.startsWith("SELECT COUNT(*)"))return {total:[...watches.values()].filter(w=>w.operator_id===args[0]).length};
     throw Error("Unexpected first SQL "+sql);
    },
    async all(){
     if(sql.startsWith("SELECT location_id,name,country,last_checked_at")){
      return {results:[...watches.values()].filter(w=>w.operator_id===args[0]).slice(0,6)};
     }
     if(sql.startsWith("SELECT location_id,bucket,fetched_at,summary_json")){
      return {results:[...samples.values()].filter(s=>s.operator_id===args[0]).slice(0,130)};
     }
     if(sql.startsWith("SELECT operator_id,location_id,latitude,longitude")){
      return {results:[...watches.values()].filter(w=>!w.last_checked_at||w.last_checked_at<args[0]).slice(0,args[1])};
     }
     throw Error("Unexpected all SQL "+sql);
    }
   };
 }};
}
const db={prepare(sql){
 if(sql.startsWith("CREATE TABLE")||sql.startsWith("CREATE INDEX")){
  schemas.push(sql);return {run:async()=>({})};
 }
 return stmt(sql);
}};
const env={ULTRON_DB:db};
const calls=[];
async function mock(url){
 calls.push(url);
 if(url.includes("/v1/get")){
  const id=Number(new URL(url).searchParams.get("id"));
  return {ok:true,json:async()=>({id,name:"Tóquio",country:"Japão",latitude:35.6895,longitude:139.6917})};
 }
 if(url.includes("/v1/forecast")){
  assert.equal(new URL(url).hostname,"api.open-meteo.com");
  return {ok:true,json:async()=>raw};
 }
 throw Error("Host inesperado "+url);
}
assert.equal((await configureWeatherWatch(env,"invalid",{action:"add",id:123},{fetchImpl:mock,now})).status,401);
assert.equal((await configureWeatherWatch(env,USER,{action:"add",id:"https://evil"},{fetchImpl:mock,now})).status,400);
assert.equal((await configureWeatherWatch(env,USER,{action:"add",id:1850147},{fetchImpl:mock,now})).ok,true);
assert.equal((await configureWeatherWatch(env,USER,{action:"add",id:1850147},{fetchImpl:mock,now})).alreadyTracked,true);
assert.equal((await configureWeatherWatch(env,OTHER,{action:"add",id:1850147},{fetchImpl:mock,now})).ok,true);
assert.equal((await listWeatherWatches(env,USER)).watches.length,1);
assert.equal((await listWeatherWatches(env,OTHER)).watches.length,1);
assert.ok(calls.every(u=>new URL(u).hostname==="geocoding-api.open-meteo.com"));
const offTime=await pollPersonalWeatherWatches(env,{now:()=>new Date("2026-11-11T11:00:00Z"),fetchImpl:mock});
assert.equal(offTime.skipped,true);
const run=await pollPersonalWeatherWatches(env,{now:()=>date,fetchImpl:mock});
assert.equal(run.saved,2);
assert.equal(run.maxWeatherCallsPerDay,192);
assert.equal((await listWeatherWatches(env,USER)).history[0].summary.temperatureC,30);
assert.equal((await listWeatherWatches(env,OTHER)).history[0].summary.temperatureC,30);
const rerun=await pollPersonalWeatherWatches(env,{now:()=>date,fetchImpl:mock});
assert.equal(rerun.saved,0,"Cron window must not call weather provider twice");
assert.equal((await configureWeatherWatch(env,USER,{action:"remove",id:1850147},{fetchImpl:mock,now})).ok,true);
assert.equal((await listWeatherWatches(env,USER)).history.length,0);
assert.equal((await listWeatherWatches(env,OTHER)).history.length,1,"Other operator must remain isolated");
assert.ok(schemas.some(q=>q.includes("jarvis_weather_watches")));
console.log("PERSONAL WEATHER WATCH PASS: opt-in geocoding, private D1 snapshots, budget, deduplication, 3h cron, deletion");
