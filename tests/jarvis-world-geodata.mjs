import assert from "node:assert/strict";
import {WORLD_GEO_TOPICS,loadWorldGeo,normalizeWorldGeo} from "../modules/jarvis-world-geodata.js";
import {worldGeoIntent} from "../modules/jarvis-world-intent.js";
import {validatePlan} from "../backend/action-catalog.js";
import {validateGeoScenario,geoFrame} from "../modules/jarvis-geospatial-model.js";
import {directPlan} from "../modules/jarvis-action-engine.js";

const now=()=>"2026-11-12T14:00:00.000Z";
assert.deepEqual(worldGeoIntent("Jarvis, mostre os terremotos no mapa mundial 2D"),
 {action:"geo.global",args:{topic:"earthquakes",region:"world",view:"2d"}});
assert.deepEqual(worldGeoIntent("Exiba as queimadas do mundo no globo 3D"),
 {action:"geo.global",args:{topic:"wildfires",region:"world",view:"3d"}});
assert.deepEqual(worldGeoIntent("Mostre a distribuição da população mundial no mapa em 2D"),
 {action:"geo.global",args:{topic:"population",region:"world",view:"2d"}});
assert.deepEqual(worldGeoIntent("Mostre a chuva no mundo em um mapa 2d"),
 {action:"geo.spatial",args:{layer:"rain",region:"world",view:"2d"}});
assert.deepEqual(worldGeoIntent("Mostre o PIB dos países no globo"),
 {action:"geo.global",args:{topic:"gdp",region:"world",view:"3d"}});
assert.deepEqual(worldGeoIntent("Mostre as áreas de enchentes no Brasil no mapa"),
 {action:"geo.global",args:{topic:"floods",region:"brazil",view:"2d"}});
assert.equal(worldGeoIntent("Quais regiões têm terremotos?"),null);
assert.equal(worldGeoIntent("Não mostre terremotos no mapa"),null);
assert.equal(worldGeoIntent("Mostre um mapa mundial de criminalidade"),null,
 "Unsupported topics must not borrow unrelated datasets");
assert.equal(worldGeoIntent("Mostre o El Niño no mapa 2D"),null);
assert.equal(directPlan("Mostre terremotos em um mapa mundial 2d").steps[0].action,"geo.global");
assert.equal(directPlan("Mostre a chuva no mundo em um mapa 2d").steps[0].action,"geo.spatial");
assert.equal(directPlan("Mostre o El Niño no mapa 2D").steps[0].action,"geo.show");
assert.equal(validatePlan({steps:[{action:"geo.global",args:{topic:"earthquakes",region:"world",view:"2d"}}]}).steps.length,1);
assert.equal(validatePlan({steps:[{action:"geo.global",args:{topic:"anything",region:"world",view:"2d"}}]}),null);
assert.equal(validatePlan({steps:[{action:"geo.spatial",args:{layer:"air",region:"world",view:"3d"}}]}).steps.length,1);
assert.equal(validatePlan({steps:[{action:"geo.spatial",args:{layer:"drought",region:"world",view:"3d"}}]}),null);

const earthquakeFeed={type:"FeatureCollection",features:[
 {id:"eq1",geometry:{type:"Point",coordinates:[-76,-12,14]},
  properties:{mag:4.8,place:"Peru",time:Date.parse("2026-11-11T08:00:00Z"),url:"https://earthquake.usgs.gov/earthquakes/eventpage/eq1"}},
 {id:"eq2",geometry:{type:"Point",coordinates:[-40,-18,19]},
  properties:{mag:6.2,place:"Atlântico do Brasil",time:Date.parse("2026-11-11T10:00:00Z")}},
 {id:"eq3",geometry:{type:"Point",coordinates:[139,34,20]},
  properties:{mag:7.1,place:"Japão",time:Date.parse("2026-11-11T12:00:00Z")}},
 {id:"bad",geometry:{type:"Point",coordinates:[500,99]},properties:{mag:99,time:0}}
]};
const eq=normalizeWorldGeo("earthquakes","world",earthquakeFeed,{now});
assert.equal(eq.ok,true);assert.equal(eq.recordCount,3);
assert.equal(eq.dataset.projection,"world");
assert.equal(eq.dataset.theme.coloredBy,"earthquake-magnitude");
assert.notEqual(eq.dataset.frames[0].points[0].color,eq.dataset.frames[0].points[1].color);
assert.equal(validateGeoScenario(eq.dataset).frames[0].points.length,3);
assert.equal(normalizeWorldGeo("earthquakes","brazil",earthquakeFeed,{now}).recordCount,1);
assert.equal(normalizeWorldGeo("earthquakes","world",{features:[]},{now}).status,404);

const eonetFeed={type:"FeatureCollection",features:[
 {type:"Feature",id:"evt1",geometry:{type:"Point",coordinates:[-58,-3]},
  properties:{id:"evt1",title:"Queimada amazônica catalogada",date:"2026-11-10T00:00:00Z",
    link:"https://eonet.gsfc.nasa.gov/api/v3/events/evt1"}},
 {type:"Feature",id:"evt2",geometry:{type:"Polygon",coordinates:[[[115,-18],[116,-18],[116,-19],[115,-18]]]},
  properties:{id:"evt2",title:"Evento no oceano",date:"2026-11-10T00:00:00Z"}},
 {type:"Feature",geometry:{type:"Point",coordinates:[400,-999]},properties:{title:"Invalid"}}
]};
const fire=normalizeWorldGeo("wildfires","world",eonetFeed,{now});
assert.equal(fire.ok,true);assert.equal(fire.recordCount,2);
assert.equal(fire.dataset.theme.legend.length,1);
assert.match(fire.dataset.source.disclaimer,/não/i);
assert.equal(normalizeWorldGeo("wildfires","brazil",eonetFeed,{now}).recordCount,1);
assert.ok(validateGeoScenario(fire.dataset));

const locations=[{},{id:"country-list",length:3}];locations[1]=[
 {id:"BRA",iso2Code:"BR",name:"Brasil",latitude:"-15.8",longitude:"-47.8",region:{value:"Latin America & Caribbean"}},
 {id:"USA",iso2Code:"US",name:"Estados Unidos",latitude:"38.9",longitude:"-77",region:{value:"North America"}},
 {id:"WLD",iso2Code:"1W",name:"Agregado mundial",latitude:"0",longitude:"0",region:{value:"Aggregates"}}
];
const observations=[{},[
 {country:{id:"BR"},date:"2025",value:215000000},
 {country:{id:"BR"},date:"2024",value:213000000},
 {country:{id:"US"},date:"2024",value:330000000},
 {country:{id:"1W"},date:"2025",value:8000000000}
]];
const population=normalizeWorldGeo("population","world",{observations,locations},{now});
assert.equal(population.ok,true);
assert.equal(population.recordCount,2);
assert.equal(population.dataset.theme.countryValues.BRA.value,215000000);
assert.equal(population.dataset.theme.countryValues.USA.year,"2024");
assert.equal(population.dataset.theme.countryValues.WLD,undefined);
assert.equal(validateGeoScenario(population.dataset).theme.countryValues.BRA.year,"2025");
assert.equal(normalizeWorldGeo("population","brazil",{observations,locations},{now}).recordCount,1);

const requests=[];
async function mockFetch(url){
 const u=new URL(url);
 requests.push(u);
 assert.ok(["earthquake.usgs.gov","eonet.gsfc.nasa.gov","api.worldbank.org"].includes(u.hostname));
 if(u.hostname==="earthquake.usgs.gov")return {ok:true,json:async()=>earthquakeFeed};
 if(u.hostname==="eonet.gsfc.nasa.gov")return {ok:true,json:async()=>eonetFeed};
 if(u.pathname.includes("/indicator/"))return {ok:true,json:async()=>observations};
 if(u.pathname==="/v2/country")return {ok:true,json:async()=>locations};
 throw Error("Unexpected URL "+url);
}
for(const topic of ["earthquakes","wildfires","population","gdp","co2"]){
 const data=await loadWorldGeo({topic,region:"world"},{fetchImpl:mockFetch,now});
 assert.equal(data.ok,true,topic+" "+data.error);
 assert.ok(data.dataset.theme.legend.every(l=>/^#[a-f0-9]{6}$/i.test(l.color)));
}
assert.equal((await loadWorldGeo({topic:"unbounded",region:"world"},{fetchImpl:mockFetch})).status,400);
assert.equal((await loadWorldGeo({topic:"wildfires",region:"unknown"},{fetchImpl:mockFetch})).status,400);
assert.ok(requests.every(u=>["earthquake.usgs.gov","eonet.gsfc.nasa.gov","api.worldbank.org"].includes(u.hostname)));
assert.ok(Object.keys(WORLD_GEO_TOPICS).length>=9);

const expanded=[
 ["Mostre a expectativa de vida dos países no mapa 2D","lifeExpectancy"],
 ["Mostre o PIB per capita mundial no globo 3D","gdpPerCapita"],
 ["Exiba a alfabetização dos países no mapa 2D","literacy"],
 ["Mostre o acesso à internet mundial no globo 3D","internet"],
 ["Mostre a urbanização mundial no mapa","urban"],
 ["Mostre a cobertura florestal mundial no mapa","forest"],
 ["Mostre o consumo de energia renovável mundial no globo","renewable"],
 ["Mostre o acesso à eletricidade mundial no globo","electricity"],
 ["Mostre o desemprego mundial no globo","unemployment"],
 ["Mostre os gastos com saúde dos países no mapa 2D","healthSpending"]
];
for(const [phrase,topic] of expanded){
 const intent=worldGeoIntent(phrase);
 assert.equal(intent?.args?.topic,topic,phrase);
 assert.equal(intent?.action,"geo.global",phrase);
 assert.ok(validatePlan({steps:[intent]}),phrase);
 assert.ok(WORLD_GEO_TOPICS[topic],topic);
 const value=topic==="gdpPerCapita"?12000:topic==="lifeExpectancy"?75:64;
 const metricRows=[{},[
  {country:{id:"BR"},date:"2024",value},
  {country:{id:"US"},date:"2023",value:value+1}
 ]];
 const report=normalizeWorldGeo(topic,"world",{observations:metricRows,locations},{now});
 // Normalization uses annual, source-observed values appropriate for each indicator.
 assert.equal(report?.ok,true,topic);
 assert.equal(report.dataset.theme.kind,"country-indicator");
 assert.ok(validateGeoScenario(report.dataset));
}
const invalidPercent=normalizeWorldGeo("internet","world",{
 observations:[{},[{country:{id:"BR"},date:"2024",value:150}]],locations
},{now});
assert.equal(invalidPercent?.status,404,"Impossible percentage values must not color countries");
assert.equal(worldGeoIntent("Mostre no mapa mundial as áreas de guerra"),null);
assert.equal(worldGeoIntent("Não mostre o desemprego no mapa mundial"),null);
assert.ok(Object.keys(WORLD_GEO_TOPICS).length>=19);
console.log("WORLDWIDE GEO PASS: 19 vetted global themes, indicators, spatial colors, ranked charts, safe validation and sources");
