import assert from "node:assert/strict";
import {buildContinuityStatus} from "../backend/continuity-status.js";
import {buildContextualPriorities} from "../modules/jarvis-contextual-priority.js";
import {contextualMapCandidates} from "../modules/jarvis-contextual-geo.js";
import {buildImmersiveSequence,createImmersiveNavigator} from "../modules/jarvis-immersive-sequence.js";

const now=Date.parse("2026-11-13T13:00:00.000Z");
const at=m=>new Date(now-m*60000).toISOString();
const report={
 ok:true,checkedAt:at(11),sourceStatus:["usgs","nasa","gdacs"].map(source=>({source,ok:true})),
 events:[
  {id:"br-1",title:"Evento sísmico catalogado",source:"usgs",kind:"earthquake",
   lat:-8.2,lng:-35.1,nearBrazil:true,eventAt:at(12),priority:20,
   url:"https://earthquake.usgs.gov/earthquakes/eventpage/br-1"},
  {id:"na-1",title:"Incêndio publicado pela NASA",source:"nasa",kind:"wildfires",
   lat:32.2,lng:144.1,nearBrazil:false,eventAt:at(18),priority:19,
   representative:true,url:"https://eonet.gsfc.nasa.gov/api/v3/events/na-1"},
  {id:"gd-1",title:"Inundação catalogada",source:"gdacs",kind:"floods",
   lat:38.1,lng:-20.3,nearBrazil:false,eventAt:at(20),priority:18,
   representative:true,url:"https://www.gdacs.org/report.aspx?eventid=gd-1"},
  {id:"malicious",title:"Evento falso",source:"nasa",kind:"wildfires",
   lat:-4,lng:-38,nearBrazil:true,eventAt:at(3),priority:999,
   url:"https://fake.example.com/nasa"}
 ]
};
const archive={
 ok:true,updatedAt:at(2),lastSuccessfulAt:at(2),
 events:[{id:"news",category:"brasil",title:"Manchete brasileira sem coordenadas",
   source:"Agência Brasil",publishedAt:at(30),firstSeenAt:at(25),
   url:"https://agenciabrasil.ebc.com.br/noticias"}],
 latest:{alerts:{checked:true,checkedAt:at(3),warnings:[
  {id:"inmet",title:"Aviso para Pernambuco",severity:"Perigo",regions:["PE"],
   url:"https://avisos.inmet.gov.br/",endsAt:at(-70)}
 ]}}
};
const continuity=buildContinuityStatus({globalReport:report,weatherReport:null,now});
const digest=buildContextualPriorities({continuity,archive,now});
assert.ok(digest.items.some(x=>x.type==="news"));
assert.ok(digest.items.some(x=>x.type==="official-alert"));
assert.equal(contextualMapCandidates(digest,{now}).length,3,
 "Only source geocoded events can be navigated");

const sequence=buildImmersiveSequence(digest,{now});
assert.equal(sequence.ok,true);
assert.equal(sequence.count,3);
assert.equal(sequence.items.length,3);
assert.equal(sequence.source,"prioridades-georreferenciadas");
assert.ok(sequence.items.every(x=>x.sourceUrl.startsWith("https://")));
assert.ok(sequence.items.every(x=>x.key.startsWith("g:")));
assert.ok(sequence.items.every(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng)));
assert.ok(sequence.items.every(x=>x.explanation.length>45));
assert.ok(sequence.items.every(x=>/não é previsão/i.test(x.disclaimer)));
assert.ok(sequence.items.every(x=>!Object.hasOwn(x,"severity")&&!Object.hasOwn(x,"riskScore")));
assert.ok(sequence.items.every(x=>!x.title.includes("Manchete")&&!x.title.includes("Aviso")));
assert.ok(sequence.items.some(x=>x.representative===true&&
  /não é o contorno da área afetada/i.test(x.locationNote)));
assert.ok(sequence.items.some(x=>x.representative===false&&
  /não representa a extensão/i.test(x.locationNote)));
assert.ok(sequence.items.some(x=>x.category==="Sismo"));
assert.ok(sequence.items.some(x=>x.category==="Incêndio"));
assert.ok(sequence.items.some(x=>x.category==="Inundação"));

const navigator=createImmersiveNavigator(sequence);
assert.equal(navigator.snapshot().view,"2d");
assert.equal(navigator.snapshot().index,0);
assert.equal(navigator.snapshot().count,3);
assert.equal(navigator.snapshot().hasPrevious,false);
assert.equal(navigator.snapshot().hasNext,true);
const first=navigator.snapshot().current.key;
assert.equal(navigator.step(-1).ok,false,"Cannot step beyond first");
assert.equal(navigator.snapshot().index,0);
assert.equal(navigator.step(0).reason,"INVALID_DIRECTION");
assert.equal(navigator.step(5).reason,"INVALID_DIRECTION");
assert.equal(navigator.step(1).ok,true);
assert.equal(navigator.snapshot().index,1);
assert.equal(navigator.step(1).ok,true);
assert.equal(navigator.snapshot().index,2);
assert.equal(navigator.step(1).ok,false);
assert.equal(navigator.snapshot().index,2,"End navigation must not mutate selection");
assert.equal(navigator.choose("g:phantom").ok,false);
assert.equal(navigator.snapshot().index,2,"A forged event key cannot navigate");
assert.equal(navigator.choose(first).ok,true);
assert.equal(navigator.snapshot().index,0);
assert.equal(navigator.setMode("3d").ok,true);
assert.equal(navigator.snapshot().view,"3d");
assert.equal(navigator.setMode("4d").ok,false);
assert.equal(navigator.snapshot().view,"3d");
const current=navigator.snapshot();current.current.title="Manipulated title";
assert.notEqual(navigator.snapshot().current.title,"Manipulated title","State copies must be defensive");
assert.throws(()=>createImmersiveNavigator({ok:true,items:[
 {key:"g:1"},{key:"g:1"}
]}),/Duplicate/);
assert.throws(()=>createImmersiveNavigator({ok:true,items:[]}),/Verified/);

const expired=buildImmersiveSequence({...digest,generatedAt:at(12)},{now});
assert.equal(expired.ok,false,"Stale digest cannot be called current");
assert.equal(buildImmersiveSequence({...digest,worldState:"stale"},{now}).ok,false);
assert.equal(buildImmersiveSequence({...digest,
 items:digest.items.filter(x=>x.type!=="cataloged")},{now}).ok,false,
 "A headline or state-wide alert cannot receive invented coordinates");
const fakeSource=buildImmersiveSequence({...digest,
 items:digest.items.map(x=>x.type==="cataloged"?
 {...x,url:"https://fake.example.com/malicious"}:x)},{now});
assert.equal(fakeSource.ok,false);
assert.equal(buildImmersiveSequence({...digest,generatedAt:at(-8)},{now}).ok,false);
console.log("PHASE XI PASS: source verified narratives, bounded navigation, stale/fake source rejection and map integrity");
