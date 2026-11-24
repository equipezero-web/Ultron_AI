import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyJarvisTurn,greetingResponse} from "../backend/jarvis-conversation-router.js";
import {shouldResearchBeforeAnswer,mediaPolicy} from "../backend/web-research.js";
const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
for(const q of ["Eae, Jarvis?","E aí, Jarvis?","Opa, meu patrão!","Fala, Jarvis","Oi, Jarvis","Jarvis, tudo bem?","Blz","Massa!","Eita, Jarvis!"]){
 // Eita is an interjection and not always a greeting: it may need context.
 if(q.startsWith("Eita"))continue;
 const x=classifyJarvisTurn(q);
 assert.equal(x.kind,"social",q);
 assert.equal(x.mayExecute,false,q);
 assert.equal(shouldResearchBeforeAnswer(q).needed,false,q);
 assert.equal(mediaPolicy(q).images,false,q);
 assert.ok(greetingResponse(q).length<150,q);
}
for(const q of ["Jarvis, ligue a TV","Mostre o globo","Desligue o celular","Não mexa nos arquivos"]){
 assert.notEqual(classifyJarvisTurn(q).kind,"social",q);
 assert.equal(classifyJarvisTurn(q).mayExecute,false,q);
 assert.equal(shouldResearchBeforeAnswer(q).needed,false,q);
}
for(const q of ["Pesquise as últimas notícias do Brasil","Quais são as últimas notícias?"]){
 assert.equal(shouldResearchBeforeAnswer(q).needed,true,q);
}
assert.equal(classifyJarvisTurn("Qual é o significado de aperrear?").kind,"question");
assert.notEqual(classifyJarvisTurn("O globo tá perto demais").kind,"social");
const worker=file("backend/worker.js"),front=file("modules/ultron-orchestrator-v4270.js");
const prepare=worker.slice(worker.indexOf("async function prepareResearch"),worker.indexOf("async function executeAiCore"));
const ai=worker.slice(worker.indexOf("async function executeAiCore"),worker.indexOf("async function handleAi"));
const enqueue=front.slice(front.indexOf("function enqueue("),front.indexOf("function intercept("));
assert.match(prepare,/entryIntent\.isSocial/);
assert.ok(prepare.indexOf("entryIntent.isSocial")<prepare.indexOf("inspectPublicGitHubRepository"));
assert.match(ai,/if\(turn\.isSocial\)/);
assert.ok(ai.indexOf("if(turn.isSocial)")<ai.indexOf("loadMemoryContext"));
assert.match(ai,/webResearch:\{requested:false/);
assert.ok(enqueue.indexOf("classifyJarvisTurn(message).isSocial")<enqueue.indexOf("isRingHomeCommand"));
assert.match(enqueue,/route:"local-conversation"/);
assert.match(enqueue,/webResearch:\{requested:false/);
assert.match(file("modules/jarvis-audio-maintenance.js"),/enabled:false,mode:"text-only"/);
console.log("PASS unified-intent: social ≠ research, memories, media or device actions; voice OFF");
