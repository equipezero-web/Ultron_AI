import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseJarvisEvolutionCommand,summarizeJarvisEvidence,showJarvisEvolutionProgress}
  from "../modules/jarvis-evidence-progress.js";
const manifest=JSON.parse(readFileSync(new URL("../data/jarvis-100-acceptance-manifest.json",import.meta.url),"utf8"));
assert.deepEqual(parseJarvisEvolutionCommand("Jarvis, progresso das 60 capacidades"),
  {kind:"verified-acceptance-progress"});
assert.deepEqual(parseJarvisEvolutionCommand("Jarvis, relatório de evolução 100%"),
  {kind:"verified-acceptance-progress"});
assert.equal(parseJarvisEvolutionCommand("Jarvis, status do sistema"),null);
assert.equal(parseJarvisEvolutionCommand("Jarvis, abra o globo"),null);
assert.equal(parseJarvisEvolutionCommand("Jarvis, desativar escuta"),null);
const summary=summarizeJarvisEvidence(manifest);
assert.equal(summary.total,60);
const expectedAccepted=manifest.capabilities.filter(x=>x.acceptance==="accepted").length;
const expectedPartials=manifest.capabilities.filter(x=>x.acceptance==="pending"&&
  x.checks?.code?.state==="partial-scope-verified"&&
  x.checks?.ci?.state==="partial-scope-verified").length;
assert.equal(summary.accepted,expectedAccepted,"accepted count must come from valid evidence");
assert.equal(summary.partial,expectedPartials,"partial proof count must be derived from manifest");
assert.equal(summary.pending,60-expectedAccepted);
assert.deepEqual(summary.areas.map(x=>[x.name,x.total]),
 [["Inteligência",20],["Funcionalidades",17],["Comunicação",7],["Integridade",8],["Dispositivos",8]]);
assert.match(summary.text,new RegExp(expectedAccepted+"\\/60 capacidades aceitas integralmente"));
assert.match(summary.text,new RegExp(expectedPartials+" capacidades têm evidência parcial"));
assert.match(summary.text,/Voz, escuta e Voice Match permanecem desligados/);
assert.doesNotMatch(summary.text,/100% concluído|todos os módulos estão prontos/i);
for(const item of manifest.capabilities){
 if(item.checks.code?.state!=="partial-scope-verified")continue;
 for(const category of ["code","ci"]){
   const proof=item.checks[category];
   assert.equal(proof.state,"partial-scope-verified");
   assert.ok(proof.scope.length>30);
   assert.match(proof.url,/^https:\/\/github\.com\/equipezero-web\/Ultron_AI\//);
 }
 assert.equal(item.acceptance,"pending");
 assert.equal(item.checks.production,"not-certified");
 assert.equal(item.checks.physical,"not-certified");
}
const malformed={...manifest,capabilities:manifest.capabilities.slice(1)};
assert.equal(summarizeJarvisEvidence(malformed),null,"never calculate misleading totals");
const duplicated={...manifest,capabilities:[manifest.capabilities[1],...manifest.capabilities.slice(1)]};
assert.equal(summarizeJarvisEvidence(duplicated),null,"no duplicate score inflation");
const fakeAccepted=structuredClone(manifest);
fakeAccepted.capabilities[0].acceptance="accepted";
assert.equal(summarizeJarvisEvidence(fakeAccepted),null,"cannot accept 100% without all four proofs");
let readCount=0,rendered=[];
const result=await showJarvisEvolutionProgress({
 fetchImpl:async()=>{readCount++;return {ok:true,json:async()=>manifest};},
 showAnswer:text=>rendered.push(text)});
assert.equal(result.ok,true);
assert.equal(result.accepted,expectedAccepted);
assert.equal(result.partial,expectedPartials);
assert.equal(result.displayed,true);
assert.equal(result.voiceEnabled,false);
assert.equal(readCount,1);
assert.equal(rendered.length,1);
const noData=await showJarvisEvolutionProgress({
 fetchImpl:async()=>({ok:false,status:503}),
 showAnswer:()=>{throw Error("must not render");}});
assert.equal(noData.ok,false);
assert.match(noData.text,/inventário verificável indisponível/);
const cancelled=await showJarvisEvolutionProgress({
 fetchImpl:async()=>({ok:true,json:async()=>manifest}),
 isCancelled:()=>true,showAnswer:()=>{throw Error("stale update");}});
assert.equal(cancelled.status,"cancelled");
const orchestrator=readFileSync(new URL("../modules/ultron-orchestrator-v4270.js",import.meta.url),"utf8");
assert.match(orchestrator,/parseJarvisEvolutionCommand\(message\)/);
assert.match(orchestrator,/isCancelled:\(\)=>generation!==queueGeneration/);
assert.match(orchestrator,/showJarvisEvolutionProgress/);
console.log("JARVIS EVIDENCE PROGRESS PASS: 60 tracked, dynamic partial CI proofs, no unverified 100%, P0-safe Neural status, voice OFF");
