import assert from "node:assert/strict";
import {INSIGHT_TYPES,loadWeatherInsight} from "../backend/weather-intelligence.js";
import {insightScenario,insightSummary,WEATHER_INSIGHT_LABELS} from "../modules/jarvis-weather-insight-model.js";
import {validateGeoScenario} from "../modules/jarvis-geospatial-model.js";
import {validatePlan} from "../backend/action-catalog.js";
import {directPlan} from "../modules/jarvis-action-engine.js";

const now=()=>"2026-11-11T12:00:00.000Z";
const place={id:1850147,name:"Tokyo",country:"Japan",country_code:"JP",
 latitude:35.6895,longitude:139.6917,timezone:"Asia/Tokyo",admin1:"Tokyo"};
const day=i=>"2020-01-"+String(i+1).padStart(2,"0");
const answer=url=>{
 const u=new URL(url);
 if(u.hostname==="geocoding-api.open-meteo.com"){
  if(u.pathname==="/v1/get")return place;
  return {results:[place]};
 }
 if(u.hostname==="archive-api.open-meteo.com"){
  assert.equal(u.searchParams.get("models"),"era5");
  return {daily:{time:Array.from({length:31},(_,i)=>day(i)),
    temperature_2m_max:Array(31).fill(28),temperature_2m_min:Array(31).fill(21),
    precipitation_sum:Array(31).fill(1.5)}};
 }
 if(u.hostname==="air-quality-api.open-meteo.com")
  return {current:{time:"2026-11-11T20:00",us_aqi:52,pm2_5:12,pm10:30,ozone:23}};
 if(u.hostname==="marine-api.open-meteo.com")
  return {current:{time:"2026-11-11T20:00",wave_height:1.8,sea_surface_temperature:23.7,ocean_current_velocity:0.9}};
 if(u.hostname==="flood-api.open-meteo.com")
  return {daily:{time:["2026-11-11","2026-11-12"],river_discharge:[100,125],river_discharge_mean:[92,94]}};
 if(u.hostname==="ensemble-api.open-meteo.com")
  return {hourly:{time:["2026-11-11T00:00","2026-11-11T01:00"],
   temperature_2m_member01:[20,21],temperature_2m_member02:[22,24],temperature_2m_member03:[18,19]}};
 if(u.hostname==="api.weather.gov")return {features:[]};
 if(u.hostname==="apiprevmet3.inmet.gov.br")return {hoje:[],futuro:[]};
 throw Error("Unexpected host "+u.hostname);
};
const fetchImpl=async(url,options)=>{
 const u=new URL(url);assert.equal(u.protocol,"https:");
 assert.ok(["geocoding-api.open-meteo.com","archive-api.open-meteo.com","air-quality-api.open-meteo.com",
  "marine-api.open-meteo.com","flood-api.open-meteo.com","ensemble-api.open-meteo.com",
  "api.weather.gov","apiprevmet3.inmet.gov.br"].includes(u.hostname),"No arbitrary URLs");
 assert.equal(options.method,"GET");
 return {ok:true,json:async()=>answer(url)};
};
assert.deepEqual(INSIGHT_TYPES,["history","air","marine","flood","ensemble","alerts"]);
for(const type of INSIGHT_TYPES){
 assert.ok(WEATHER_INSIGHT_LABELS[type]);
 const result=await loadWeatherInsight({type,city:"Tokyo",year:2020,month:1},{fetchImpl,now});
 if(type==="alerts"){
  assert.equal(result.ok,true);assert.equal(result.coverage,"not-integrated");
  assert.match(insightSummary(result),/não significa ausência/i);
  assert.equal(insightScenario(result),null);
  continue;
 }
 assert.equal(result.ok,true,"Data source for "+type+" rejected");
 assert.equal(result.type,type);
 assert.ok(result.metrics.length>=1);
 assert.ok(insightSummary(result).includes("Fonte:"));
 const scene=insightScenario(result);
 assert.ok(scene);
 assert.equal(scene.projection,"world");
 assert.ok(validateGeoScenario(scene),"Native geospatial model should accept "+type);
 assert.ok(scene.frames.length<=17);
 assert.ok(scene.source.disclaimer);
 if(type==="history"){
   assert.equal(result.series.length,31);assert.equal(scene.frames.length,17);
   assert.equal(result.source.kind,"historical-reanalysis");
 }
 if(type==="flood"){
   assert.match(result.source.disclaimer,/NÃO mapa de inundação/);
   assert.equal(result.metrics[0].value,100);
 }
 if(type==="ensemble"){
   assert.equal(result.series[0].members,3);
   assert.equal(result.series[0].minC,18);
   assert.equal(result.series[0].maxC,22);
   assert.match(result.source.disclaimer,/não intervalo estatístico/i);
 }
}
const us={...place,id:5128581,name:"New York",country:"United States",country_code:"US",
 latitude:40.7128,longitude:-74.0060};
const forUS=async(url,opts)=>({ok:true,json:async()=>url.includes("/v1/search")?{results:[us]}:
 url.includes("weather.gov")?{features:[{properties:{event:"Flood Warning",severity:"Severe",
   sent:"2026-11-11T09:00:00Z",expires:"2026-11-11T15:00:00Z",areaDesc:"New York",
   "@id":"https://api.weather.gov/alerts/urn:oid:sample"}}]}:answer(url)});
const usAlerts=await loadWeatherInsight({type:"alerts",city:"New York"},{fetchImpl:forUS,now});
assert.equal(usAlerts.ok,true);
assert.equal(usAlerts.coverage,"integrated");
assert.equal(usAlerts.scope,"official-point");
assert.equal(usAlerts.bulletins[0].source,"US National Weather Service");
assert.equal(usAlerts.bulletins[0].official,true);
assert.ok(!insightSummary(usAlerts).includes("não significa ausência"));
const brasil={...place,id:3390760,name:"Recife",country:"Brazil",country_code:"BR",
 latitude:-8.0476,longitude:-34.8770};
const forBR=async(url,opts)=>({ok:true,json:async()=>url.includes("/v1/search")?{results:[brasil]}:
 url.includes("inmet.gov.br")?{hoje:[{descricao:"Chuvas intensas",severidade:"Perigo",
 data_inicio:"2026-11-11T09:00:00Z",data_fim:"2026-11-12T09:00:00Z",estados:["PE","SC"]}]}:answer(url)});
const brAlerts=await loadWeatherInsight({type:"alerts",city:"Recife"},{fetchImpl:forBR,now});
assert.equal(brAlerts.scope,"official-countrywide");
assert.deepEqual(brAlerts.bulletins[0].areas,["PE","SC"]);
assert.match(brAlerts.source.disclaimer,/NÃO filtrados/);

assert.equal((await loadWeatherInsight({type:"not-real",city:"Tokyo"},{fetchImpl,now})).status,400);
assert.equal((await loadWeatherInsight({type:"history",city:"Tokyo",year:1800},{fetchImpl,now})).status,400);
assert.equal((await loadWeatherInsight({type:"air",city:"https://evil.test"},{fetchImpl,now})).status,400);
assert.equal((await loadWeatherInsight({type:"marine",city:"Tokyo"},{fetchImpl:async()=>{throw Error("network")},now})).ok,false);
assert.equal((await loadWeatherInsight({type:"air",city:"Tokyo"},{fetchImpl:async(url)=>({
 ok:true,json:async()=>url.includes("/v1/search")?{results:[place]}:{current:{pm2_5:null,pm10:null,us_aqi:null,ozone:null}}
}),now})).ok,false,"Null metrics must not be converted to zero");

for(const [command,type] of [
 ["Jarvis, mostre a qualidade do ar em Tóquio no mapa 2D","air"],
 ["Jarvis, mostre os oceanos em Sydney no globo 3D","marine"],
 ["Jarvis, mostre a vazão dos rios em Recife","flood"],
 ["Jarvis, mostre a incerteza dos modelos em Londres","ensemble"],
 ["Jarvis, mostre alertas oficiais em Miami","alerts"],
 ["Jarvis, mostre o histórico climático em Recife no mapa 2D","history"]
]){
 const p=directPlan(command);
 assert.equal(p?.steps?.[0]?.action,"weather.insight",command+" => "+JSON.stringify(p));
 assert.equal(p.steps[0].args.type,type);
 assert.ok(validatePlan(p),command);
}
assert.equal(directPlan("Jarvis, mostre o monitoramento mundial").steps[0].action,"weather.monitor");
assert.equal(validatePlan({steps:[{action:"weather.insight",args:{type:"alerts",city:"example.com/evil",view:"3d"}}]}),null);
assert.equal(directPlan("Qual é a qualidade do ar em Tóquio?"),null,"Question must not turn into map action");
console.log("WORLD WEATHER INSIGHT PASS: six sources, reanalysis, oceans, air, flood, ensembles, NWS/INMET scope and intents");
