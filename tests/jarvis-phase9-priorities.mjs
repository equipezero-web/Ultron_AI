import assert from "node:assert/strict";
import {
  buildContextualPriorities,readPriorityLedger,markPriorityReviewed
} from "../modules/jarvis-contextual-priority.js";
import {buildContinuityStatus} from "../backend/continuity-status.js";

const now=Date.parse("2026-11-13T13:00:00.000Z");
const at=m=>new Date(now-m*60000).toISOString();
const world={
 ok:true,checkedAt:at(15),sourceStatus:["usgs","nasa","gdacs"].map(source=>({
  source,ok:true
 })),events:[
  {id:"us-1",source:"usgs",kind:"earthquake",title:"Sismo catalogado próximo ao Brasil",
   lat:-10,lng:-40,eventAt:at(20),nearBrazil:true,priority:5,
   url:"https://earthquake.usgs.gov/earthquakes/eventpage/us-1"},
  {id:"gd-1",source:"gdacs",kind:"floods",title:"Inundação catalogada fora do Brasil",
   lat:35,lng:120,eventAt:at(10),nearBrazil:false,priority:14,gdacsAlert:"red",
   url:"https://www.gdacs.org/report.aspx?eventid=1"},
  {id:"bad-1",source:"usgs",kind:"earthquake",title:"Site não oficial",
   lat:-9,lng:-39,eventAt:at(12),nearBrazil:true,priority:1000,
   url:"https://evil.example.com/forged"}
 ]};
const weather={ok:true,checkedAt:at(20),regions:[]};
const continuity=buildContinuityStatus({globalReport:world,weatherReport:weather,now});
assert.equal(continuity.world.highlights.some(e=>e.alertLevel==="red"),true);
const archive={
 ok:true,updatedAt:at(5),lastSuccessfulAt:at(5),
 events:[
  {id:"br-1",category:"brasil",title:"Brasil: manchete publicada",
   source:"Agência Brasil",publishedAt:at(20),firstSeenAt:at(10),
   url:"https://agenciabrasil.ebc.com.br/noticias/exemplo"},
  {id:"world-1",category:"mundo",title:"Mundo: manchete publicada",
   source:"Fonte Internacional",publishedAt:at(30),firstSeenAt:at(8),
   url:"https://www.example.org/mundo"},
  {id:"old",category:"brasil",title:"Notícia velha",
   source:"Arquivo",publishedAt:at(30*60),firstSeenAt:at(30*60),
   url:"https://agenciabrasil.ebc.com.br/velha"},
  {id:"unsafe",category:"brasil",title:"Injeção de link",
   source:"Falso",publishedAt:at(12),firstSeenAt:at(10),
   url:"javascript:alert(1)"}
 ],
 latest:{alerts:{
  checked:true,checkedAt:at(6),warnings:[
   {id:"inmet-1",title:"Aviso publicado para PE",severity:"Perigo",
    regions:["PE"],phase:"vigente",endsAt:at(-50),
    url:"https://avisos.inmet.gov.br/"},
   {id:"expired",title:"Aviso expirado",severity:"Perigo",
    endsAt:at(40),url:"https://avisos.inmet.gov.br/"},
   {id:"fake",title:"Falso INMET",severity:"Perigo",
    endsAt:at(-70),url:"https://fake-inmet.example.org/"}
  ]}}
};

const first=buildContextualPriorities({continuity,archive,now});
assert.equal(first.ok,true);
assert.equal(first.hasBaseline,false,"First activation cannot call old records new");
assert.equal(first.newCount,0);
assert.ok(first.items.some(x=>x.type==="official-alert"));
assert.ok(first.items.some(x=>x.type==="cataloged"));
assert.ok(first.items.some(x=>x.type==="news"));
assert.ok(first.items.some(x=>x.region==="Pernambuco informado"));
assert.ok(first.items.some(x=>x.verifiedLabel==="Nível GDACS publicado: RED"));
assert.ok(first.items.some(x=>x.nearBrazil===true));
assert.equal(first.items.some(x=>x.title==="Falso INMET"||x.title==="Aviso expirado"),false);
assert.equal(first.items.some(x=>x.title==="Site não oficial"||x.title==="Injeção de link"),false);
assert.equal(first.items.some(x=>x.title==="Notícia velha"),false);
assert.ok(first.items.every(x=>x.url.startsWith("https://")));
assert.ok(first.items.every(x=>!x.riskScore&&!x.predictedRisk));
assert.match(first.disclaimer,/não uma previsão de impacto/);
assert.ok(first.items.length<=6);
assert.equal(first.archiveState,"verified");

const marked=markPriorityReviewed(null,first,{now});
assert.equal(marked.items.length,first.items.length);
assert.equal(marked.lastReviewedAt,at(0));
const unchanged=buildContextualPriorities({continuity,archive,ledger:marked,now:now+1000});
assert.equal(unchanged.hasBaseline,true);
assert.equal(unchanged.newCount,0,"Reviewed sources must not be announced as novel again");

const nextAt=now+15*60000;
const next=buildContextualPriorities({
 continuity:{...continuity,generatedAt:new Date(nextAt).toISOString()},
 archive:{...archive,updatedAt:new Date(nextAt).toISOString(),
  lastSuccessfulAt:new Date(nextAt).toISOString(),
  events:[{id:"new-br",category:"brasil",title:"Nova notícia confirmada no Brasil",
    source:"Agência Brasil",publishedAt:new Date(nextAt-60000).toISOString(),
    firstSeenAt:new Date(nextAt-60000).toISOString(),
    url:"https://agenciabrasil.ebc.com.br/atualizacao"},...archive.events]},
 ledger:marked,now:nextAt
});
assert.ok(next.items.some(x=>x.isNew&&x.title==="Nova notícia confirmada no Brasil"));
assert.equal(next.items.some(x=>x.isNew&&x.title==="Brasil: manchete publicada"),false);
const markedAgain=markPriorityReviewed(marked,next,{now:nextAt});
assert.equal(buildContextualPriorities({
 continuity:{...continuity,generatedAt:new Date(nextAt).toISOString()},
 archive:{...archive,updatedAt:new Date(nextAt).toISOString(),
  lastSuccessfulAt:new Date(nextAt).toISOString(),
  events:[{id:"new-br",category:"brasil",title:"Nova notícia confirmada no Brasil",
    source:"Agência Brasil",publishedAt:new Date(nextAt-60000).toISOString(),
    firstSeenAt:new Date(nextAt-60000).toISOString(),
    url:"https://agenciabrasil.ebc.com.br/atualizacao"},...archive.events]},
 ledger:markedAgain,now:nextAt+1000
}).newCount,0);
assert.equal(readPriorityLedger(JSON.stringify(markedAgain),{now:nextAt}).items.length,markedAgain.items.length);
assert.equal(readPriorityLedger("{{garbled",{now}).items.length,0);
assert.equal(readPriorityLedger({lastReviewedAt:at(-150),items:[
 {key:"n:bad",at:at(-150)},{key:"fake",at:at(0)},{key:"n:good",at:at(2)}
]},{now}).items.length,1,"Future and malformed seen IDs must not be retained");

const worldOnly=buildContextualPriorities({continuity,archive:{...archive,lastSuccessfulAt:at(350)},now});
assert.equal(worldOnly.archiveState,"stale");
assert.ok(worldOnly.items.every(x=>x.type==="cataloged"));
const newsOnly=buildContextualPriorities({
 continuity:{...continuity,generatedAt:at(180),world:{...continuity.world,state:"stale"}},
 archive,now
});
assert.ok(newsOnly.items.every(x=>x.type!=="cataloged"));
const noSources=buildContextualPriorities({continuity:{
 ...continuity,generatedAt:at(210),world:{...continuity.world,state:"stale"}
 },archive:{...archive,updatedAt:at(210)},now});
assert.equal(noSources.items.length,0);
assert.equal(noSources.newCount,0);
assert.equal(markPriorityReviewed(marked,noSources,{now}).lastReviewedAt,marked.lastReviewedAt);

const partial=buildContextualPriorities({continuity:{
 ...continuity,world:{...continuity.world,state:"partial",
  sources:[{name:"USGS",status:"failed"},{name:"GDACS",status:"ready"},
   {name:"NASA",status:"failed"}]}
 },archive:null,now});
assert.ok(partial.items.every(item=>item.source==="GDACS"),"Failed source cannot generate alerts");
const future=buildContextualPriorities({continuity:{
 ...continuity,generatedAt:at(-90)
 },archive:null,now});
assert.equal(future.items.length,0);
assert.throws(()=>buildContextualPriorities({now:NaN}),/Invalid clock/);
assert.equal(buildContextualPriorities({continuity,archive,now,limit:1}).items.length,1);

console.log("PHASE IX PASS: editorial (not predictive) ranking, Brazilian priority, official alert validity, freshness, source protection and novelty ledger");
