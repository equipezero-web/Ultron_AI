import assert from "node:assert/strict";
import {buildContinuityStatus} from "../backend/continuity-status.js";
import {buildContextualPriorities} from "../modules/jarvis-contextual-priority.js";
import {parseMultimodalCommand,resolveMultimodalContext} from "../modules/jarvis-multimodal-context-model.js";

const now=Date.parse("2026-11-13T15:30:00.000Z"),at=m=>new Date(now-m*60000).toISOString();
const events=[
 {id:"usgs1",source:"usgs",kind:"earthquake",title:"Registro de tremor publicado",
  nearBrazil:true,lat:-8.1,lng:-35.2,priority:21,eventAt:at(14),
  url:"https://earthquake.usgs.gov/earthquakes/eventpage/usgs1"},
 {id:"nasa1",source:"nasa",kind:"wildfires",title:"Incêndio com ponto representativo",
  nearBrazil:false,lat:36.1,lng:128.4,priority:17,representative:true,
  eventAt:at(18),url:"https://eonet.gsfc.nasa.gov/api/v3/events/nasa1"}
];
const world={ok:true,checkedAt:at(10),events,sourceStatus:[
 {source:"usgs",ok:true},{source:"nasa",ok:true},{source:"gdacs",ok:true}
]};
const archive={ok:true,updatedAt:at(4),lastSuccessfulAt:at(4),
 events:[
  {id:"brnews1",title:"Notícia publicada sobre o Brasil",source:"Agência Brasil",
   category:"brasil",publishedAt:at(19),firstSeenAt:at(18),
   url:"https://agenciabrasil.ebc.com.br/noticia"}
 ],latest:{alerts:{checked:true,checkedAt:at(5),warnings:[
  {id:"warning1",title:"Aviso oficial meteorológico",severity:"Perigo",
   regions:["PE"],endsAt:at(-45),url:"https://avisos.inmet.gov.br/"}
 ]}}
};
const continuity=buildContinuityStatus({globalReport:world,weatherReport:null,now});
const digest=buildContextualPriorities({continuity,archive,now});
const geo=digest.items.find(x=>x.key==="g:usgs1");
const story=digest.items.find(x=>x.key==="n:brnews1");
const warning=digest.items.find(x=>x.key==="a:warning1");
assert.ok(geo&&story&&warning,"The data fixture must include all three verified record kinds");

const allowed=[
 ["Jarvis, o que estou vendo?",{type:"explain"}],
 ["Ultron, explique este evento",{type:"explain"}],
 ["explique essa notícia",{type:"explain"}],
 ["resuma esta cena",{type:"explain"}],
 ["qual é a fonte deste evento?",{type:"source"}],
 ["mostre a origem disso",{type:"source"}],
 ["de onde veio essa notícia?",{type:"source"}],
 ["mostre a imagem desta notícia",{type:"image"}],
 ["mostre isso no globo 3D",{type:"visualize",view:"3d"}],
 ["passe este evento em 2D",{type:"visualize",view:"2d"}],
 ["volte ao mapa",{type:"visualize",view:"2d"}],
 ["próximo item",{type:"navigate",direction:1}],
 ["destaque anterior",{type:"navigate",direction:-1}],
 ["voltar para notícias",{type:"scene",scene:"news"}],
 ["status do controle contextual",{type:"status"}]
];
for(const [raw,expected] of allowed){
 const parsed=parseMultimodalCommand(raw);
 assert.deepEqual(parsed,expected,"Must parse only recognized operator instruction: "+raw);
}
for(const raw of [
 "pare","ativar","abra a câmera","me mostre os arquivos privados",
 "envie este evento para todos os contatos","apague tudo",
 "faça um pagamento em 3D","notícia de terremoto mundial",
 "últimas notícias do mundo","mova a TV","acenda as luzes",
 "mostre isso em 4D","mostre isso no mapa da minha casa",
 "Jarvis, calcule o risco real de dano ao prédio",
 "pesquise informações confidenciais no sistema"
]){
 assert.equal(parseMultimodalCommand(raw),null,"Non-whitelisted/side effect intent must not be intercepted: "+raw);
}
const news={
 state:{active:true,verified:true,requested:true,index:0,count:1,lastUpdate:at(5)},
 selectedArticle:{id:"n1",title:"Notícia com imagem publicada",source:"Agência Brasil",
  url:"https://agenciabrasil.ebc.com.br/materia",imageUrl:"https://agenciabrasil.ebc.com.br/foto.jpg",
  publishedAt:at(20)}
};
let context=resolveMultimodalContext({digest,news,director:{active:true,scene:"news"},now});
assert.equal(context.ok,true);
assert.equal(context.type,"news");
assert.equal(context.imageUrl,"https://agenciabrasil.ebc.com.br/foto.jpg");
assert.equal(context.hasImage,true);
assert.equal(context.eventKey,null);
assert.match(context.description,/não contém uma simulação geográfica/);
const newsStandalone=resolveMultimodalContext({digest,news,now});
assert.equal(newsStandalone.ok,true,"A deliberately opened news rail has usable context");
const newsHidden=resolveMultimodalContext({digest,news:{...news,requested:false},now});
assert.equal(newsHidden.ok,false,"Hidden news cannot become active referent");
const oldNews=resolveMultimodalContext({digest,news:{
 ...news,state:{...news.state,lastUpdate:at(150)}
},director:{active:true,scene:"news"},now});
assert.equal(oldNews.ok,false);
const unverified=resolveMultimodalContext({digest,news:{
 ...news,state:{...news.state,verified:false}
},director:{active:true,scene:"news"},now});
assert.equal(unverified.ok,false);
const badNewsLink=resolveMultimodalContext({digest,news:{
 ...news,selectedArticle:{...news.selectedArticle,url:"javascript:alert(1)"}
},director:{active:true,scene:"news"},now});
assert.equal(badNewsLink.ok,false);
const noSourceImage=resolveMultimodalContext({digest,news:{
 ...news,selectedArticle:{...news.selectedArticle,imageUrl:"data:image/svg+xml;base64,PHN2Zz4="}
},director:{active:true,scene:"news"},now});
assert.equal(noSourceImage.ok,true);
assert.equal(noSourceImage.hasImage,false);

context=resolveMultimodalContext({digest,director:{
 active:true,scene:"priorities",selectedPriorityKey:geo.key
},now});
assert.equal(context.ok,true);
assert.equal(context.eventKey,geo.key);
assert.equal(context.type,"cataloged");
assert.match(context.description,/atividade sísmica/i);
assert.equal(context.url,geo.url);
assert.match(context.evidence,/coordenada/i);
const inmet=resolveMultimodalContext({digest,director:{
 active:true,scene:"priorities",selectedPriorityKey:warning.key
},now});
assert.equal(inmet.ok,true);
assert.equal(inmet.type,"official-alert");
assert.equal(inmet.eventKey,null);
assert.match(inmet.description,/Confirme horário, vigência e área/);
const priorityNews=resolveMultimodalContext({digest,director:{
 active:true,scene:"priorities",selectedPriorityKey:story.key
},now});
assert.equal(priorityNews.ok,true);
assert.equal(priorityNews.eventKey,null);
assert.equal(priorityNews.hasImage,false);
assert.equal(resolveMultimodalContext({digest,director:{
 active:true,scene:"priorities",selectedPriorityKey:"a:made-up"
},now}).ok,false,"Selected priority must exist in current verified snapshot");
const map=resolveMultimodalContext({digest,director:{
 active:true,scene:"map",focusKey:geo.key
},now});
assert.equal(map.ok,true);assert.equal(map.eventKey,geo.key);
const immersive=resolveMultimodalContext({digest,immersive:{
 active:true,current:{key:"g:nasa1"}
},now});
assert.equal(immersive.ok,true);assert.equal(immersive.scene,"tour");
assert.match(immersive.description,/área queimada/);
assert.equal(resolveMultimodalContext({digest,director:{
 active:true,scene:"map",focusKey:"g:fake"
},now}).ok,false);
assert.equal(resolveMultimodalContext({digest,now}).ok,false);
assert.equal(resolveMultimodalContext({digest:{
 ...digest,generatedAt:at(20)
},director:{active:true,scene:"map",focusKey:geo.key},now}).ok,false);
assert.equal(resolveMultimodalContext({digest,now:NaN}).reason,"INVALID_CLOCK");

console.log("PHASE XIII MODEL PASS: source-backed pronouns, voice/text whitelist, no forged geocoding, news images, INMET and current selected records");
