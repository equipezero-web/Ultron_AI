import assert from "node:assert/strict";
import {WEATHER_CITIES,weatherCity,normalizeWeatherPayload,weatherGeoScenario,weatherSummary} from "../modules/jarvis-weather-model.js";
import {GEO_PALETTE,validateGeoScenario,geoFrame} from "../modules/jarvis-geospatial-model.js";
import {loadLiveWeather} from "../backend/weather-live.js";
import {validatePlan} from "../backend/action-catalog.js";
import {directPlan} from "../modules/jarvis-action-engine.js";

const now=()=>"2026-11-11T12:00:00.000Z";
const provider=()=>({
 current:{time:"2026-11-11T09:00",temperature_2m:29,relative_humidity_2m:75,precipitation:0},
 daily:{
  time:["2026-11-11","2026-11-12","2026-11-13"],
  temperature_2m_min:[24,23,24],temperature_2m_max:[31,30,32],
  precipitation_sum:[1.1,12,0],precipitation_probability_max:[30,85,10]
 }
});
assert.equal(weatherCity("São Paulo")?.key,"sao-paulo");
assert.equal(weatherCity("Sao Paulo")?.key,"sao-paulo");
assert.equal(weatherCity("Rio de Janeiro")?.name,"Rio de Janeiro");
assert.equal(weatherCity("https://evil.test"),null);
assert.equal(weatherCity("Londres"),null);
assert.ok(WEATHER_CITIES.recife);
const normalized=normalizeWeatherPayload(provider(),"recife",{now});
assert.ok(normalized?.ok,"Provider shape must normalize");
assert.equal(normalized.city.name,"Recife");
assert.equal(normalized.days.length,3);
assert.equal(normalized.days[0].rainMm,1.1);
assert.match(weatherSummary(normalized),/Open-Meteo/);
assert.match(weatherSummary(normalized),/Não é alerta oficial/);
const scene=weatherGeoScenario(normalized);
assert.equal(scene.frames.length,4);
assert.deepEqual(scene.frames.map(f=>f.kind),["current-estimate","short-term-forecast","short-term-forecast","short-term-forecast"]);
assert.equal(scene.frames[1].points[0].kind,"weather");
assert.ok(GEO_PALETTE.weather);
assert.match(scene.source.disclaimer,/não observação/i);
assert.ok(validateGeoScenario(scene),"Weather model must fit native Neural Ring geospatial contract");
assert.equal(geoFrame(scene,3).points.length,1);
assert.equal(geoFrame(scene,1).metrics.rainMm,normalized.days[0].rainMm);
assert.equal(geoFrame(scene,0).metrics.temperatureC,normalized.current.temperatureC);
const metricTamper=JSON.parse(JSON.stringify(scene));metricTamper.frames[1].metrics.rainMm=-99;
assert.equal(validateGeoScenario(metricTamper),null,'Invalid negative rainfall must not reach cards');
assert.equal(geoFrame(scene,1,"dry").points.length,0,"Raw precipitation must NOT be recast as ENSO drought");

const missing=provider();missing.current.temperature_2m=null;
assert.equal(normalizeWeatherPayload(missing,"recife",{now}),null,"No fabricated temperature");
const stale=provider();stale.current.time="2026-10-01T09:00";stale.daily.time=["2026-10-01","2026-10-02","2026-10-03"];
assert.equal(normalizeWeatherPayload(stale,"recife",{now}),null,"Stale readings must be refused");
const impossible=provider();impossible.daily.precipitation_probability_max[1]=120;
assert.equal(normalizeWeatherPayload(impossible,"recife",{now}),null);
assert.equal(normalizeWeatherPayload(provider(),"unknown",{now}),null);

let called="";
const success=await loadLiveWeather("Recife",{now,fetchImpl:async(url,options)=>{
  called=url;
  assert.equal(options.method,"GET");
  assert.ok(options.signal);
  return {ok:true,json:async()=>provider()};
}});
assert.ok(success.ok);
const url=new URL(called);
assert.equal(url.hostname,"api.open-meteo.com","Fixed host only, no SSRF");
assert.equal(url.searchParams.get("latitude"),String(WEATHER_CITIES.recife.lat));
assert.equal(url.searchParams.get("forecast_days"),"3");
assert.equal((await loadLiveWeather("https://malicious.site",{now,fetchImpl:async()=>{throw Error("should not fetch")}})).status,400);
assert.equal((await loadLiveWeather("Recife",{now,fetchImpl:async()=>{throw Error("down")}})).ok,false);
assert.equal((await loadLiveWeather("Recife",{now,fetchImpl:async()=>({ok:true,json:async()=>({})})})).ok,false);

let attempts=0;
const recovered=await loadLiveWeather("Recife",{now,pause:async()=>{},fetchImpl:async()=>{
 attempts++;
 if(attempts===1)throw Error("temporary connection reset");
 return {ok:true,json:async()=>provider()};
}});
assert.equal(recovered.ok,true,"Transient upstream network failure must retry safely");
assert.equal(attempts,2,"Never exceed one retry");
let limited=0;
const rateLimited=await loadLiveWeather("Recife",{now,pause:async()=>{},fetchImpl:async()=>{
 limited++;return {ok:false,status:429};
}});
assert.equal(rateLimited.code,"WEATHER_PROVIDER_RATE_LIMIT");
assert.equal(limited,1,"Never retry provider rate limits");
let invalidResponses=0;
const invalidData=await loadLiveWeather("Recife",{now,pause:async()=>{},fetchImpl:async()=>{
 invalidResponses++;return {ok:true,json:async()=>({})};
}});
assert.equal(invalidData.code,"WEATHER_PROVIDER_INVALID_DATA");
assert.equal(invalidResponses,1,"Do not retry invalid or invented forecasts");

assert.equal(validatePlan({steps:[{action:"weather.show",args:{city:"Recife",view:"3d"}}]}).steps[0].args.city,"recife");
assert.equal(validatePlan({steps:[{action:"weather.show",args:{city:"Unknown",view:"2d"}}]}),null);
assert.equal(validatePlan({steps:[{action:"weather.show",args:{city:"Recife",view:"satellite"}}]}),null);
assert.deepEqual(directPlan("JARVIS, mostre a previsão do tempo em Recife no mapa 2D").steps[0],
 {action:"weather.show",args:{city:"recife",view:"2d"}});
assert.deepEqual(directPlan("JARVIS, mostre a previsão do tempo em São Paulo no globo").steps[0],
 {action:"weather.show",args:{city:"sao-paulo",view:"3d"}});
assert.deepEqual(directPlan("JARVIS, mostre o El Niño no mapa 2D e depois filtre apenas mais chuva").steps.map(x=>x.action),
 ["geo.show","geo.filter"]);
assert.equal(directPlan("Qual a previsão do tempo em Recife?"),null,"Questions are not autonomous commands");
assert.equal(directPlan("JARVIS não mostre o mapa do tempo em Recife"),null,"Negated commands are not executed");
console.log("PHASE 4 PASS: live-data normalization, attribution, freshness, SSRF restrictions, weather routing, sequenced map commands and model labels");
