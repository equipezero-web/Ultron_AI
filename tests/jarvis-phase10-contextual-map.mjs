import assert from "node:assert/strict";
import {buildContinuityStatus} from "../backend/continuity-status.js";
import {buildContextualPriorities} from "../modules/jarvis-contextual-priority.js";
import {contextualMapCandidates,contextualGeoScene} from "../modules/jarvis-contextual-geo.js";
import {validateGeoScenario,geoFrame} from "../modules/jarvis-geospatial-model.js";

const now=Date.parse("2026-11-13T16:00:00.000Z");
const time=min=>new Date(now-min*60000).toISOString();
const sources=["usgs","nasa","gdacs"].map(source=>({source,ok:true,count:4}));
const events=[
 {id:"br1",kind:"earthquake",source:"usgs",title:"Evento catalogado próximo ao Brasil",
  lat:-8.12,lng:-35.1,nearBrazil:true,eventAt:time(12),priority:13,
  url:"https://earthquake.usgs.gov/earthquakes/eventpage/br1",representative:false},
 {id:"gd1",kind:"floods",source:"gdacs",title:"Área representativa de inundação",
  lat:33.1,lng:125.2,nearBrazil:false,eventAt:time(8),priority:25,gdacsAlert:"orange",
  url:"https://www.gdacs.org/report.aspx?eventid=1",representative:true},
 {id:"nasa1",kind:"wildfires",source:"nasa",title:"Incêndio listado pela NASA",
  lat:52,lng:20,nearBrazil:false,eventAt:time(21),priority:6,
  url:"https://eonet.gsfc.nasa.gov/api/v3/events/nasa1",representative:true},
 {id:"evil",kind:"floods",source:"gdacs",title:"Endereço de fonte falso",
  lat:-8,lng:-35,eventAt:time(2),priority:1000,
  url:"https://phishing.example.org/event/1",representative:false},
 {id:"invalid",kind:"earthquake",source:"usgs",title:"Latitude impossível",
  lat:290,lng:-35,eventAt:time(5),priority:999,
  url:"https://earthquake.usgs.gov/earthquakes/eventpage/invalid"}
];
const globalReport={ok:true,checkedAt:time(10),events,sourceStatus:sources};
const continuity=buildContinuityStatus({globalReport,weatherReport:null,now});
assert.equal(continuity.world.highlights[0].lat,-8.12);
assert.equal(continuity.world.highlights[0].lng,-35.1);
assert.equal(continuity.world.highlights.some(x=>x.id==="evil"||x.id==="invalid"),false);
assert.equal(continuity.world.highlights.find(x=>x.id==="gd1").representative,true);
const archive={ok:true,updatedAt:time(2),lastSuccessfulAt:time(2),
 events:[{id:"story1",category:"brasil",title:"Notícia sem geolocalização",
   url:"https://agenciabrasil.ebc.com.br/teste",publishedAt:time(11),
   firstSeenAt:time(7),source:"Agência Brasil"}],
 latest:{alerts:{checked:true,checkedAt:time(3),warnings:[
  {id:"warning1",title:"Aviso oficial para PE",severity:"Perigo",
   regions:["PE"],endsAt:time(-40),url:"https://avisos.inmet.gov.br/"}
 ]}}};
const digest=buildContextualPriorities({continuity,archive,now});
assert.equal(digest.worldState,"healthy");
assert.equal(digest.items.some(x=>x.type==="news"),true);
assert.equal(digest.items.some(x=>x.type==="official-alert"),true);
assert.ok(digest.items.some(x=>x.type==="cataloged"&&x.lat===-8.12));
assert.equal(digest.items.find(x=>x.type==="news").lat,undefined);
assert.equal(digest.items.find(x=>x.type==="official-alert").lat,undefined,
 "Never geocode a whole state or a headline to invented center coordinates");

const points=contextualMapCandidates(digest,{now});
assert.equal(points.length,3,"Only three official-source coordinate events should be mapped");
assert.ok(points.every(x=>x.source.startsWith("https://")));
assert.ok(points.some(x=>x.representative));
assert.equal(points.some(x=>x.name.includes("Notícia")||x.name.includes("Aviso")),false);
assert.ok(points.every(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng)));

const primary=contextualGeoScene(digest,{now});
assert.equal(primary.ok,true);
assert.equal(primary.mode,"sourced-observations");
assert.equal(primary.scenario.id,"contextual-priorities-world-v1");
assert.equal(primary.scenario.projection,"world");
assert.equal(primary.scenario.frames.length,1);
assert.equal(primary.scenario.frames[0].kind,"observed");
assert.ok(validateGeoScenario(primary.scenario));
assert.equal(geoFrame(primary.scenario,0).points.length,3);
assert.match(primary.scenario.source.disclaimer,/Não são limites de desastre/);
assert.match(primary.scenario.frames[0].description,/NÃO recebem pinos/);
const preferred=digest.items.find(x=>x.type==="cataloged"&&x.lat===33.1);
assert.ok(preferred);
const focused=contextualGeoScene(digest,{now,focusKey:preferred.key});
assert.equal(focused.ok,true);
assert.equal(focused.scenario.frames[0].points[0].lat,33.1);
assert.equal(focused.representative,true);
assert.equal(focused.focusPointId,focused.scenario.frames[0].points[0].id);
assert.equal(focused.selectedSource,preferred.url);
assert.equal(contextualGeoScene(digest,{now,focusKey:"a:warning1"}).reason,
 "INVALID_EVENT");
assert.equal(contextualGeoScene(digest,{now,focusKey:"g:missing"}).reason,
 "EVENT_NOT_IN_CURRENT_SNAPSHOT");

const stale={...digest,generatedAt:time(8)};
assert.equal(contextualGeoScene(stale,{now}).reason,"NO_VERIFIED_COORDINATES");
assert.equal(contextualMapCandidates({...digest,worldState:"stale"},{now}).length,0);
assert.equal(contextualMapCandidates({...digest,items:digest.items.map(x=>({...x,
  lat:999,lng:999}))},{now}).length,0);
const badLink={...digest,items:digest.items.map(item=>item.type==="cataloged"?
  {...item,url:"https://scam.example.test/map"}:item)};
assert.equal(contextualGeoScene(badLink,{now}).reason,"NO_VERIFIED_COORDINATES");
const badCategory={...digest,items:digest.items.map(item=>item.type==="cataloged"?
  {...item,category:"riskForecast"}:item)};
assert.equal(contextualMapCandidates(badCategory,{now}).length,0);
const fakeCoords={...digest,items:digest.items.map(item=>item.type==="news"?
  {...item,lat:-8,lng:-35}:item)};
assert.equal(contextualMapCandidates(fakeCoords,{now}).length,3,
 "Even with forged coordinates, a news headline must not be plotted");
const one={...digest,items:digest.items.filter(x=>x.type!=="cataloged")};
assert.equal(contextualGeoScene(one,{now}).reason,"NO_VERIFIED_COORDINATES");

console.log("PHASE X PASS: official event coords, safe links, strict geo model, 2D/3D scenario, source focus, no fake news/INMET pins, stale data rejection");
