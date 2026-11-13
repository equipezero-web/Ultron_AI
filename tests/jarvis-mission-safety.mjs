import assert from "node:assert/strict";
import { parseMissionControl,assessCompoundMission,createMissionGate } from "../modules/jarvis-mission-safety.js";
import { runActionPlan } from "../modules/jarvis-action-engine.js";

for(const text of ["Jarvis, PARAR", "PARE!", "STOP", "congele", "cancelar tudo", "interrompa a execução"]) {
  assert.deepEqual(parseMissionControl(text), {type:"stop"}, text);
}
for(const text of ["Não pare a TV","Como parar o sistema?","Pare a música na TV","cancelar missão 123456","pare o carro"]) {
  assert.notEqual(parseMissionControl(text)?.type,"stop",text);
}
assert.deepEqual(parseMissionControl("confirmar missão 123456"),{type:"confirm",code:"123456"});
assert.deepEqual(parseMissionControl("cancele a missão 000001"),{type:"cancel",code:"000001"});

const deviceIntent=part => /\btv\b/i.test(part)?{command:"tv.volume.up"}:
  /\bcomputador\b/i.test(part)?{command:"desktop.shutdown"}:null;
assert.equal(assessCompoundMission(["Ligue a TV","depois aumente o volume da TV"],deviceIntent).requiresApproval,true);
assert.equal(assessCompoundMission(["Mostre o mapa 2D","depois amplie o mapa"],deviceIntent).requiresApproval,false);
assert.equal(assessCompoundMission(["Ative câmera","depois mostre status"],()=>null).requiresApproval,true);
assert.equal(assessCompoundMission(["Status da TV","depois status do celular"],part=>({command:"tv.status"})).requiresApproval,false);
assert.equal(assessCompoundMission(["Compre algo","depois transfira pix"],deviceIntent).blocked,true);
assert.equal(assessCompoundMission(["Apague arquivos","depois pesquise"],deviceIntent).blocked,true);

let clock=1_000;
let serial=0;
const gate=createMissionGate({now:()=>clock,makeCode:()=>String(++serial).padStart(6,"0"),ttlMs:120_000});
const first=gate.preview("Ligue a TV e depois aumente volume",["Ligue a TV","aumente o volume"]);
assert.equal(first.code,"000001");
assert.equal(gate.consume("000002"),null,"Wrong code never approves");
assert.equal(gate.consume("000001")?.message,"Ligue a TV e depois aumente volume");
assert.equal(gate.consume("000001"),null,"Approval is one-time");
const second=gate.preview("Outra tarefa",["A","B"]);
assert.equal(gate.cancel(second.code),true);
assert.equal(gate.snapshot(),null);
const third=gate.preview("Tarefa expirada",["A","B"]);
clock+=120_000;
assert.equal(gate.consume(third.code),null,"Approval must expire");
gate.preview("Quarta",["A","B"]);
gate.clear();
assert.equal(gate.snapshot(),null,"P0 revokes pending preview");

let started=0,closeCount=0,resolveFirst;
globalThis.window={
 ULTRON_EARTH:{state:{visible:false},open:async()=>{started++;await new Promise(r=>resolveFirst=r);window.ULTRON_EARTH.state.visible=true;return {ok:true}},close(){this.state.visible=false}},
 JARVIS_COMMAND_CENTER:{setVisualMode(){}},
 ULTRON_NEURAL_ANSWER:{visible:true,clear(){closeCount++;}},
 ULTRON_VOICE_OUTPUT:{speak(){}}
};
const controller=new AbortController();
const run=runActionPlan({steps:[{action:"earth.open"},{action:"answer.close"}]},"Abra o globo e depois feche a resposta",{signal:controller.signal});
await Promise.resolve();
assert.equal(started,1);
controller.abort();
resolveFirst();
const stopped=await run;
assert.equal(stopped.ok,false);
assert.equal(stopped.cancelled,true);
assert.equal(stopped.status,"cancelled");
assert.equal(stopped.steps.length,1,"No step after P0 may run");
assert.equal(closeCount,0);
const already=new AbortController();already.abort();
const result=await runActionPlan({steps:[{action:"answer.close"}]},"Feche a resposta",{signal:already.signal});
assert.equal(result.status,"cancelled");
assert.equal(closeCount,0);
console.log("JARVIS P0 mission approval and interruptible action plan: OK");
