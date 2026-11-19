import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runVerifiedReadOnlyIntelligence} from "../backend/jarvis-authenticated-intelligence.js";
import {parseVerifiedIntelligenceCommand,runVerifiedIntelligenceCommand,renderVerifiedWeatherScene}
  from "../modules/jarvis-verified-intelligence-client.js";
import {globalWeatherScenario} from "../modules/jarvis-global-weather.js";
import {validateGeoScenario} from "../modules/jarvis-geospatial-model.js";

const now=Date.parse("2026-11-19T12:00:00.000Z");
const forecast={
  ok:true,kind:"global-short-term-forecast",
  location:{id:3407785,key:"global-3407785",name:"Recife",region:"Pernambuco",
    country:"Brasil",countryCode:"BR",lat:-8.0476,lng:-34.877,
    timezone:"America/Recife",label:"Recife, Pernambuco, Brasil"},
  fetchedAt:new Date(now).toISOString(),
  current:{time:"2026-11-19T09:00",temperatureC:29,humidityPercent:65,
    precipitationMm:0,windKmh:15},
  days:Array.from({length:7},(_,i)=>({
    date:"2026-11-"+String(19+i).padStart(2,"0"),minC:23,maxC:30,rainMm:4.5,
    rainChancePercent:40
  })),
  requestedDays:7,partialForecast:false,
  source:{name:"Open-Meteo (GeoNames)",url:"https://open-meteo.com/en/docs",
    disclaimer:"Estimativa numérica, não medição instantânea nem alerta oficial."},
  isOfficialAlert:false
};
assert.ok(validateGeoScenario(globalWeatherScenario(forecast)),
  "existing scientific global weather scenario must validate");
let calls=0;
const backend=await runVerifiedReadOnlyIntelligence({
  message:"Mostre previsão do tempo em Recife no globo",city:"Recife",days:7
},{weatherLoader:async args=>{
  calls++;assert.equal(args.query,"Recife");assert.equal(args.days,7);
  return forecast;
},newsLoader:async()=>{throw Error("not called");},now:()=>now});
assert.equal(calls,1,"authenticated server reuses one real forecast");
assert.equal(backend.ok,false,"Worker does not claim a browser scene");
assert.equal(backend.partial,true);
assert.deepEqual(backend.steps.map(s=>s.status),["completed","unavailable"]);
const weather=backend.steps[0].result;
assert.equal(weather.type,"forecast-model");
assert.equal(weather.geoScenario?.projection,"world");
assert.equal(weather.geoScenario?.frames?.length,8);
assert.equal(weather.geoScenario.frames[0].points[0].name,weather.location);
assert.equal(weather.geoScenario.source.url,weather.source.url);
assert.equal(weather.isOfficialAlert,false);
assert.equal(backend.rendered,false);
assert.equal(backend.deviceActions,false);
assert.equal(backend.voiceEnabled,false);

const intent=parseVerifiedIntelligenceCommand(
 "Jarvis, inteligência verificada: previsão do tempo em Recife no globo por 7 dias");
assert.equal(intent.city,"Recife");
assert.equal(intent.view,"3d");
assert.equal(intent.days,7);
assert.equal(parseVerifiedIntelligenceCommand(
 "Jarvis, inteligência verificada: previsão do tempo em Recife no mapa 2d").view,"2d");
assert.equal(parseVerifiedIntelligenceCommand(
 "Jarvis, inteligência verificada: previsão do tempo em Recife").view,null);
assert.equal(parseVerifiedIntelligenceCommand(
 "Jarvis, inteligência verificada: previsão do tempo em Recife sem mapa").view,null);
let state={visible:false},opened=0,closed=0,shown=0;
const geo={
 async open({data,view}){
   opened++;
   const validated=validateGeoScenario(data);
   assert.ok(validated);
   assert.equal(view,"3d");
   state={visible:true,mode:view,scenario:data.id,source:data.source.url,
     frameCount:data.frames.length};
   return {ok:true};
 },
 get state(){return state;},
 close(){closed++;state={visible:false};return {ok:true};}
};
const fetchImpl=async(url,options)=>{
 assert.ok(url.endsWith("/api/account/intelligence/execute"));
 assert.equal(options.credentials,"include");
 assert.equal(options.method,"POST");
 assert.equal(options.mode,"cors");
 assert.equal(options.redirect,"error");
 const body=JSON.parse(options.body);
 assert.equal(body.city,"Recife");assert.equal(body.days,7);
 assert.ok(!Object.hasOwn(body,"memoryKey"));
 return {ok:true,json:async()=>backend};
};
const result=await runVerifiedIntelligenceCommand(intent,{
 fetchImpl,geoController:geo,showAnswer:()=>()=>{shown++;}
});
assert.equal(result.ok,true);
assert.equal(result.partial,false,"client has completed the missing visual step");
assert.equal(result.renderedInGlobe,true);
assert.equal(result.renderedInMap,true);
assert.equal(result.displayed,true);
assert.equal(result.voiceEnabled,false);
assert.match(result.text,/Visualização 3D confirmada/);
assert.equal(opened,1);
assert.equal(shown,0,"Neural Ring map must not be replaced by overlapping answer overlay");

// Negative cases: do not claim rendered when the scene is missing, tampered,
// sourced from a hostile origin, or unconfirmed by the real Geo panel.
const reject=async (value,view="3d")=>{
 const r=await renderVerifiedWeatherScene(value,view,{geoController:geo});
 assert.equal(r.ok,false);
};
await reject({...weather,geoScenario:null});
await reject({...weather,geoScenario:{...weather.geoScenario,id:"unrelated-map"}});
await reject({...weather,source:{...weather.source,url:"https://evil-open-meteo.com/"}});
await reject({...weather,location:"Wrong location"});
assert.equal(opened,1,"invalid scenes cannot reach renderer");
const lyingGeo={
 async open(){return {ok:true};},
 get state(){return {visible:false,mode:"3d",scenario:weather.geoScenario.id,
   source:weather.source.url,frameCount:8};}
};
assert.equal((await renderVerifiedWeatherScene(weather,"3d",{geoController:lyingGeo})).ok,false);
assert.equal((await renderVerifiedWeatherScene(weather,"2d",{
 geoController:geo,isCancelled:()=>true})).status,"cancelled");
assert.equal(opened,1,"P0 cancellation must block opening");
let didCancel=false;
const lateGeo={
 async open({data,view}){
   didCancel=true;
   state={visible:true,mode:view,scenario:data.id,source:data.source.url,
     frameCount:data.frames.length};
   return {ok:true};
 },
 get state(){return state;},
 close(){closed++;state={visible:false};return {ok:true};}
};
const cancelled=await renderVerifiedWeatherScene(weather,"3d",{
  geoController:lateGeo,isCancelled:()=>didCancel});
assert.equal(cancelled.status,"cancelled");
assert.equal(closed,1,"P0 must close the scene it just opened");

let resultText="";
const broken=await runVerifiedIntelligenceCommand(intent,{
 fetchImpl,geoController:lyingGeo,showAnswer:()=>text=>{resultText=text;}
});
assert.equal(broken.ok,false);
assert.equal(broken.renderedInGlobe,false);
assert.match(resultText,/Mapa não confirmado/);
assert.doesNotMatch(resultText,/Visualização 3D confirmada/);

const sourceCode=readFileSync(new URL("../modules/jarvis-verified-intelligence-client.js",
 import.meta.url),"utf8");
assert.doesNotMatch(sourceCode,/speechSynthesis|getUserMedia|ULTRON_VOICE_OUTPUT/);
assert.match(sourceCode,/validateGeoScenario\(weather.geoScenario\)/);
assert.match(sourceCode,/state\.scenario===scenario\.id/);
assert.match(sourceCode,/state\.source===scenario\.source\.url/);
console.log("JARVIS VERIFIED WEATHER NEURAL PASS: sourced scene from authenticated Worker, real 2D/3D state, P0 cancellation, no fake render, no audio");
