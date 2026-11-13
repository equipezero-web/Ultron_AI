import assert from "node:assert/strict";
import {buildContinuityStatus} from "../backend/continuity-status.js";
import {buildContextualPriorities} from "../modules/jarvis-contextual-priority.js";
import {buildVisualStoryboard,createVisualSceneNavigator} from "../modules/jarvis-visual-orchestration-model.js";

const now=Date.parse("2026-11-13T13:00:00.000Z");
const at=m=>new Date(now-m*60000).toISOString();
const world={ok:true,checkedAt:at(15),
 sourceStatus:["usgs","nasa","gdacs"].map(source=>({source,ok:true})),
 events:[
  {id:"br-1",kind:"earthquake",title:"Sismo catalogado perto do Brasil",
   source:"usgs",lat:-8.3,lng:-34.9,nearBrazil:true,priority:15,
   eventAt:at(20),url:"https://earthquake.usgs.gov/earthquakes/eventpage/br-1"},
  {id:"na-1",kind:"wildfires",title:"Evento de incêndio catalogado",
   source:"nasa",lat:20.2,lng:110.9,nearBrazil:false,priority:5,
   eventAt:at(25),url:"https://eonet.gsfc.nasa.gov/api/v3/events/na-1"}
 ]};
const archive={
 ok:true,updatedAt:at(3),lastSuccessfulAt:at(3),
 events:[{id:"news-1",title:"Brasil: notícia publicada",source:"Agência Brasil",
  category:"brasil",publishedAt:at(45),firstSeenAt:at(40),
  url:"https://agenciabrasil.ebc.com.br/brasil/teste"}],
 latest:{alerts:{checked:true,checkedAt:at(3),warnings:[
  {id:"alert-1",title:"Aviso INMET PE",severity:"Perigo",
   regions:["PE"],endsAt:at(-45),url:"https://avisos.inmet.gov.br/"}
 ]}}
};
const continuity=buildContinuityStatus({globalReport:world,weatherReport:null,now});
const digest=buildContextualPriorities({continuity,archive,now});
const news={count:3,lastUpdate:at(4),hasImage:true};
const plan=buildVisualStoryboard({digest,news,now});
assert.equal(plan.ok,true);
assert.deepEqual(plan.available,["news","priorities","map","tour"]);
assert.equal(plan.counts.news,3);
assert.equal(plan.counts.geocoded,2);
assert.ok(plan.scenes.every(x=>Number.isFinite(Date.parse(x.checkedAt))));
assert.ok(plan.scenes.every(x=>x.description.length>40));
const priority=plan.scenes.find(x=>x.id==="priorities");
assert.ok(priority.entries.some(x=>x.type==="news"));
assert.ok(priority.entries.some(x=>x.type==="official-alert"));
assert.ok(priority.entries.every(x=>x.url.startsWith("https://")));
assert.equal(plan.scenes.find(x=>x.id==="map").focusKey,"g:br-1");
assert.equal(plan.scenes.find(x=>x.id==="tour").records,2);
assert.ok(/não são criados/i.test(plan.disclaimer));
assert.ok(!plan.scenes.some(x=>x.sourceUrl?.includes("example.com")));

const nav=createVisualSceneNavigator(plan);
assert.equal(nav.snapshot().index,0);
assert.equal(nav.snapshot().count,4);
assert.equal(nav.snapshot().previous,false);
assert.equal(nav.snapshot().next,true);
assert.equal(nav.step(-1).ok,false);
assert.equal(nav.step(0).reason,"INVALID_DIRECTION");
assert.equal(nav.step(1).ok,true);
assert.equal(nav.snapshot().current.id,"priorities");
assert.equal(nav.choose("tour").ok,true);
assert.equal(nav.snapshot().index,3);
assert.equal(nav.step(1).reason,"END_OF_SEQUENCE");
assert.equal(nav.snapshot().index,3);
assert.equal(nav.choose("fake-scene").reason,"SCENE_NOT_AVAILABLE");
assert.equal(nav.snapshot().index,3);
assert.equal(nav.choose("news").ok,true);
const copy=nav.snapshot();
copy.current.title="FALSO";
copy.current.entries=undefined;
assert.notEqual(nav.snapshot().current.title,"FALSO");
assert.throws(()=>createVisualSceneNavigator({ok:true,
 scenes:[{id:"news"},{id:"news"}]}),/duplicadas/);
assert.throws(()=>createVisualSceneNavigator({ok:true,scenes:[]}),/visualizações/);

const noNews=buildVisualStoryboard({digest,news:{count:3,lastUpdate:at(190)},now});
assert.deepEqual(noNews.available,["priorities","map","tour"]);
const empty=buildVisualStoryboard({digest:null,news:null,now});
assert.equal(empty.ok,false);
assert.equal(empty.reason,"NO_CURRENT_VERIFIED_VISUALS");
assert.equal(empty.scenes.length,0);
const newsOnly=buildVisualStoryboard({digest:null,news,now});
assert.deepEqual(newsOnly.available,["news"]);
const stale=buildVisualStoryboard({digest:{...digest,generatedAt:at(15)},news:null,now});
assert.equal(stale.ok,false);
const noGeo=buildVisualStoryboard({digest:{...digest,
 items:digest.items.filter(item=>item.type!=="cataloged")},news:null,now});
assert.deepEqual(noGeo.available,["priorities"]);
const worldUnavailable=buildVisualStoryboard({digest:{...digest,worldState:"stale"},news:null,now});
assert.deepEqual(worldUnavailable.available,["priorities"]);
const badUrls=buildVisualStoryboard({digest:{...digest,
 items:digest.items.map(item=>({...item,url:"javascript:alert(1)"}))},news:null,now});
assert.equal(badUrls.ok,false);
const future=buildVisualStoryboard({digest:{...digest,generatedAt:at(-20)},news:null,now});
assert.equal(future.ok,false);
assert.throws(()=>buildVisualStoryboard({now:NaN}),/inválido/);
console.log("PHASE XII PASS: verified four-scene plan, news/images evidence, no invented geo/media, stale checks, safe scene nav and source links");
