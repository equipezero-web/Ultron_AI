import assert from "node:assert/strict";
import {safeLocationQuery,normalizeGlobalLocation,globalDays,normalizeGlobalForecast,globalWeatherSummary,globalWeatherScenario} from "../modules/jarvis-global-weather.js";
import {searchGlobalLocations,loadGlobalWeather} from "../backend/weather-global.js";
import {validateGeoScenario,worldXY,geoJSONPaths} from "../modules/jarvis-geospatial-model.js";
import {validatePlan} from "../backend/action-catalog.js";
import {directPlan} from "../modules/jarvis-action-engine.js";
const now=()=>"2026-11-11T12:00:00.000Z";
const raw={id:1850147,name:"Tokyo",latitude:35.6895,longitude:139.6917,timezone:"Asia/Tokyo",country:"Japan",country_code:"JP",admin1:"Tokyo"};
const p=()=>({
 utc_offset_seconds:32400,
 current:{time:"2026-11-11T21:00",temperature_2m:18.2,relative_humidity_2m:64,precipitation:0,wind_speed_10m:10},
 daily:{
  time:Array.from({length:16},(_,i)=>"2026-11-"+String(11+i).padStart(2,"0")),
  temperature_2m_min:Array(16).fill(12),temperature_2m_max:Array(16).fill(23),
  precipitation_sum:Array(16).fill(2.5),precipitation_probability_max:Array(16).fill(40)
 }
});
assert.equal(safeLocationQuery(" Tokyo, Japan "),"Tokyo, Japan");
assert.equal(safeLocationQuery("https://evil.test"),null);
assert.equal(safeLocationQuery("Paris&redirect=evil"),null);
assert.equal(safeLocationQuery("x"),null);
assert.equal(normalizeGlobalLocation(raw).label,"Tokyo, Tokyo, Japan");
assert.equal(normalizeGlobalLocation({...raw,latitude:190}),null);
assert.equal(normalizeGlobalLocation({...raw,id:"not-a-number"}),null);
assert.equal(globalDays(16),16);
assert.equal(globalDays(100),null);
const loc=normalizeGlobalLocation(raw);
const report=normalizeGlobalForecast(p(),loc,{days:16,now});
assert.equal(report.ok,true);
assert.equal(report.days.length,16);
assert.equal(report.current.temperatureC,18.2);
assert.equal(report.current.windKmh,10);
assert.match(globalWeatherSummary(report),/GeoNames/);
assert.match(globalWeatherSummary(report),/16 dias/);
assert.equal(report.isOfficialAlert,false);
const scene=globalWeatherScenario(report);
assert.equal(scene.projection,"world");
assert.equal(scene.frames.length,17);
assert.equal(scene.frames[0].metrics.temperatureC,18.2);
assert.equal(scene.frames[1].metrics.rainMm,2.5);
assert.equal(validateGeoScenario(scene).frames[1].metrics.rainMm,2.5);
assert.ok(scene.frames.every(f=>f.points[0].lng===139.6917));
assert.ok(validateGeoScenario(scene));
assert.equal(validateGeoScenario(scene).projection,"world");
const position=worldXY(139.6917,35.6895);
assert.ok(position.x>650&&position.x<850&&position.y<300);
const paths=geoJSONPaths({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"Polygon",
 coordinates:[[[130,40],[140,40],[140,30],[130,40]]]}}]},{projection:"world"});
assert.equal(paths.length,1);
assert.ok(paths[0].startsWith("M"));
const incompleteLast=p();
incompleteLast.daily.temperature_2m_max[15]=null;
incompleteLast.daily.temperature_2m_min[15]=null;
incompleteLast.daily.precipitation_sum[15]=null;
const partial=normalizeGlobalForecast(incompleteLast,loc,{days:16,now});
assert.equal(partial?.ok,true);
assert.equal(partial.days.length,15);
assert.equal(partial.requestedDays,16);
assert.equal(partial.partialForecast,true);
assert.match(globalWeatherSummary(partial),/15 de 16 dias/);
assert.equal(globalWeatherScenario(partial).frames.length,16);
const invalid=p();invalid.daily.temperature_2m_max[3]=null;
assert.equal(normalizeGlobalForecast(invalid,loc,{days:16,now}),null,"Null numeric values must not be interpolated");
const stale=p();stale.current.time="2026-11-10T01:00";
assert.equal(normalizeGlobalForecast(stale,loc,{days:16,now}),null);
const badTimezone=p();badTimezone.utc_offset_seconds="not-numeric";
assert.equal(normalizeGlobalForecast(badTimezone,loc,{days:16,now}),null);

const requests=[];
async function mockedFetch(url,options){
 requests.push(String(url));assert.equal(options.method,"GET");assert.ok(options.signal);
 const u=new URL(url);
 assert.ok(["api.open-meteo.com","geocoding-api.open-meteo.com"].includes(u.hostname));
 if(u.pathname==="/v1/search")return {ok:true,json:async()=>({results:[raw]})};
 if(u.pathname==="/v1/get")return {ok:true,json:async()=>raw};
 if(u.pathname==="/v1/forecast")return {ok:true,json:async()=>p()};
 throw Error("unexpected upstream "+u.pathname);
}
const matches=await searchGlobalLocations("Tokyo, Japan",{fetchImpl:mockedFetch});
assert.equal(matches.locations[0].countryCode,"JP");
assert.equal(matches.locations[0].name,"Tokyo");
const live=await loadGlobalWeather({query:"Tokyo",days:16},{fetchImpl:mockedFetch,now});
assert.equal(live.days.length,16);
assert.equal(live.location.countryCode,"JP");
assert.equal(new URL(requests.at(-1)).searchParams.get("forecast_days"),"16");
const byId=await loadGlobalWeather({id:1850147,days:7},{fetchImpl:mockedFetch,now});
assert.equal(byId.days.length,7);
assert.ok(requests.some(u=>u.includes("/v1/get?id=1850147")));
assert.equal((await loadGlobalWeather({query:"http://bad.example"},{fetchImpl:mockedFetch,now})).status,400);
assert.equal((await loadGlobalWeather({query:"Tokyo",days:500},{fetchImpl:mockedFetch,now})).status,400);
assert.equal((await loadGlobalWeather({id:"not-an-id"},{fetchImpl:mockedFetch,now})).status,400);
const missing=await searchGlobalLocations("Atlantis",{fetchImpl:async()=>({ok:true,json:async()=>({results:[]})})});
assert.equal(missing.locations.length,0);
assert.equal((await loadGlobalWeather({query:"Atlantis"},{fetchImpl:async()=>({ok:true,json:async()=>({results:[]})}),now})).status,404);
assert.equal((await searchGlobalLocations("Tokyo",{fetchImpl:async()=>{throw Error("down")}})).status,503);

assert.deepEqual(validatePlan({steps:[{action:"weather.global",args:{city:"Tokyo, Japan",view:"3d",days:16}}]}).steps[0],
 {action:"weather.global",args:{city:"Tokyo, Japan",view:"3d",days:16}});
assert.equal(validatePlan({steps:[{action:"weather.global",args:{city:"https://evil.com",view:"3d"}}]}),null);
assert.equal(validatePlan({steps:[{action:"weather.global",args:{city:"Tokyo",view:"3d",days:22}}]}),null);
assert.deepEqual(directPlan("Jarvis, mostre a previsão do tempo em Tokyo no globo 3D por 16 dias").steps[0],
 {action:"weather.global",args:{city:"tokyo",view:"3d",days:16}});
assert.deepEqual(directPlan("Jarvis, mostre o clima em Londres no mapa 2D").steps[0],
 {action:"weather.global",args:{city:"londres",view:"2d",days:7}});
assert.equal(directPlan("Qual é o clima em Tóquio?"),null);
console.log("GLOBAL WEATHER PASS: worldwide safe geocoding, 16 days, timezones, projection and voice/text action routing");
