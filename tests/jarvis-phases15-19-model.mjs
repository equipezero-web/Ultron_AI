import assert from "node:assert/strict";
import {parseAdvancedCommand,verifiedDigest,makeProactiveSuggestion,
 readOperationalMemory,updateOperationalMemory,analyzeSpecialists,selectSimulationSource,
 hypotheticalCurve,ROUTINE_INTERVAL} from "../modules/jarvis-integrated-intelligence-model.js";
const now=Date.parse("2026-11-13T17:00:00Z");
const time=new Date(now-600000).toISOString();
const url="https://earthquake.usgs.gov/earthquakes/eventpage/usgs1";
const digest={ok:true,generatedAt:new Date(now).toISOString(),worldState:"healthy",
 archiveState:"verified",items:[
 {key:"g:usgs1",type:"cataloged",source:"USGS",title:"Registro de sismo",url,
  publishedAt:time,lat:-8.08,lng:-34.9,isNew:true},
 {key:"n:br1",type:"news",source:"Agência Brasil",title:"Notícia confirmada",
  publishedAt:time,url:"https://agenciabrasil.ebc.com.br/materia1",isNew:true},
 {key:"a:inmet1",type:"official-alert",source:"INMET",title:"Aviso oficial",
  publishedAt:time,url:"https://avisos.inmet.gov.br/",isNew:false}
 ]};
const accepted={
 "Jarvis, sugestões proativas":{type:"proactive"},
 "consultar agentes":{type:"agents"},
 "memorizar preferência notícias primeiro":{type:"set-preference",value:"news"},
 "memorizar preferencia mapas primeiro":{type:"set-preference",value:"map"},
 "memória operacional":{type:"memory"},
 "não gostei da sugestão":{type:"feedback",value:"negative"},
 "ativar rotina de monitoramento":{type:"routine-start"},
 "desativar rotina de monitoramento":{type:"routine-stop"},
 "verificar rotina agora":{type:"routine-check"},
 "simulação 2D":{type:"simulation",mode:"2d"},
 "simulação 3D":{type:"simulation",mode:"3d"},
 "fechar simulação":{type:"simulation-close"}
};
for(const [command,result] of Object.entries(accepted))
 assert.deepEqual(parseAdvancedCommand(command),result,command);
for(const command of ["ligue a câmera","apague arquivos","faça um pagamento",
 "inicie uma compra","abra o cofre","envie uma mensagem para todos",
 "simule a intensidade real de um tsunami no Brasil","autorizar plano",
 "Jarvis, pegue dados privados"])assert.equal(parseAdvancedCommand(command),null,command);
const verified=verifiedDigest(digest,{now});
assert.equal(verified.ok,true);assert.equal(verified.items.length,3);
const stale={...digest,generatedAt:new Date(now-720000).toISOString()};
assert.equal(verifiedDigest(stale,{now}).ok,false);
const forged={...digest,items:[{...digest.items[0],url:"javascript:alert(1)"}]};
assert.equal(verifiedDigest(forged,{now}).ok,false);
assert.equal(makeProactiveSuggestion(digest,{now,preference:"news"}).key,"n:br1");
assert.equal(makeProactiveSuggestion(digest,{now,preference:"map"}).key,"g:usgs1");
assert.equal(makeProactiveSuggestion(digest,{now,previousKey:"g:usgs1"}).reason,"NO_NEW_SUGGESTION");
assert.equal(makeProactiveSuggestion(stale,{now}).ok,false);
const emptyMemory=readOperationalMemory(null,{now});
assert.equal(emptyMemory.consented,false);
assert.equal(updateOperationalMemory(emptyMemory,{feedback:"positive",now}).reason,"CONSENT_REQUIRED");
const saving=updateOperationalMemory(emptyMemory,{preference:"news",now});
assert.equal(saving.ok,true);
const loaded=readOperationalMemory(JSON.stringify(saving.value),{now});
assert.equal(loaded.preference,"news");assert.equal(loaded.consented,true);
const feedback=updateOperationalMemory(loaded,{feedback:"positive",now});
assert.equal(feedback.value.feedback.positive,1);
assert.equal(readOperationalMemory(feedback.value,{now:now+31*86400000}).consented,false);
assert.equal(updateOperationalMemory(loaded,{preference:"camera",now}).ok,false);
const agents=analyzeSpecialists(digest,{now,current:{ok:true,eventKey:"g:usgs1",url}});
assert.equal(agents.ok,true);
assert.deepEqual(agents.agents.map(a=>a.count),[1,1,1]);
assert.equal(agents.selectedVerified,true);
const selected={ok:true,eventKey:"g:usgs1",url};
const scenario=selectSimulationSource(digest,selected,{now});
assert.equal(scenario.ok,true);assert.equal(scenario.lat,-8.08);
assert.equal(selectSimulationSource(digest,{...selected,url:"https://false.example/"},{now}).ok,false);
assert.equal(selectSimulationSource(digest,{ok:true,eventKey:"n:br1",url:digest.items[1].url},{now}).ok,false);
const curve=hypotheticalCurve({scale:2,samples:31});
assert.equal(curve.length,31);assert.equal(curve[0].normalized,1);
assert.ok(curve[curve.length-1].normalized<0.1);
assert.ok(hypotheticalCurve({scale:5})[15].normalized>curve[15].normalized);
assert.equal(ROUTINE_INTERVAL,900000);
console.log("PHASES XV–XIX PASS: source freshness, suggestions, opt-in memory, specialist provenance, strict read-only commands and illustrative 2D/3D math.");
