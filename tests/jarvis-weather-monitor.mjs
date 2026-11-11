import assert from "node:assert/strict";
import {MONITOR_REGIONS,pollWeatherMonitor,latestWeatherMonitor} from "../backend/weather-monitor.js";
import {monitorSummary} from "../modules/jarvis-weather-insight-model.js";
assert.equal(MONITOR_REGIONS.length,6);
assert.deepEqual([...new Set(MONITOR_REGIONS.map(x=>x.country))].sort(),["AU","BR","GB","JP","US"]);
const store=new Map();
const db={
 prepare(query){let args=[];return {
  bind(...values){args=values;return this;},
  async run(){
   if(query.startsWith("INSERT OR IGNORE")){
    const key=args[0]+"/"+args[1];
    if(!store.has(key))store.set(key,{region:args[0],bucket:args[1],data_json:args[2],checked_at:args[3]});
   }
   if(query.startsWith("DELETE"))for(const [key,item] of store){if(item.checked_at<args[0])store.delete(key);}
   return {success:true};
  },
  async first(){return [...store.values()].find(x=>x.bucket===args[0])||null;},
  async all(){return {results:[...store.values()].sort((a,b)=>b.checked_at.localeCompare(a.checked_at)).slice(0,48)};}
 };}};
};
const now=()=>new Date("2026-11-11T12:01:00Z");
const fetchImpl=async(url,options)=>{const u=new URL(url);
 assert.equal(u.hostname,"api.open-meteo.com");
 assert.equal(u.searchParams.get("forecast_days"),"1");
 return {ok:true,json:async()=>({
  current:{time:"2026-11-11T09:00",temperature_2m:28,relative_humidity_2m:69,wind_speed_10m:13},
  daily:{time:["2026-11-11"],precipitation_sum:[4],precipitation_probability_max:[70]}
 })};};
const env={ULTRON_DB:db};
assert.equal((await pollWeatherMonitor(env,{now:()=>new Date("2026-11-11T13:01:00Z"),fetchImpl})).skipped,true);
const first=await pollWeatherMonitor(env,{now,fetchImpl});
assert.equal(first.ok,true);
assert.equal(first.sampled,6);
assert.equal(store.size,6);
const duplicate=await pollWeatherMonitor(env,{now,fetchImpl:async()=>{throw Error("must never fetch duplicate bucket")}});
assert.equal(duplicate.skipped,true);
const latest=await latestWeatherMonitor(env);
assert.equal(latest.ok,true);
assert.equal(latest.regions.length,6);
assert.equal(latest.cadenceHours,3);
assert.match(latest.disclaimer,/Não representa monitoramento integral/);
assert.match(monitorSummary(latest),/Recife/);
assert.equal((await latestWeatherMonitor({})).ok,false);
assert.equal((await pollWeatherMonitor({}, {now,force:true})).ok,false);
assert.equal(MONITOR_REGIONS.every(x=>typeof x.lat==="number"),true);
console.log("WORLD WEATHER MONITOR PASS: 3-hour persistent D1 sampler, duplicate protection, six regions, cache and source labeling");
