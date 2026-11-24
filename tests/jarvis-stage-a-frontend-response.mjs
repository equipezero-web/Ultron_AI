import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyProjectOpinionReply} from "../modules/jarvis-project-opinion-ui.js";
import {JARVIS_PROJECT_OPINION} from "../backend/jarvis-project-opinion.js";
const message="O que você achou do nosso projeto?";
const old={text:"Olá, Lucas! Com base na telemetria disponível, posso ver que você solicitou saber o que eu achei do nosso projeto.",provider:"gemini",model:"generic"};
const repaired=verifyProjectOpinionReply(message,old);
assert.equal(repaired.text,JARVIS_PROJECT_OPINION);
assert.equal(repaired.correctedLegacyReply,true);
const explanation=verifyProjectOpinionReply("Não entendi isso que você falou.",{
 text:"Não há dados suficientes para avaliar o projeto de forma detalhada.",
 provider:"gemini",model:"generic"
});
assert.match(explanation.text,/módulos ainda precisam trabalhar melhor juntos/);
assert.equal(explanation.correctedLegacyReply,true);
assert.doesNotMatch(explanation.text,/Não há dados suficientes/);

assert.equal(repaired.webResearch.used,false);
assert.match(repaired.text,/Neural Ring/);
assert.doesNotMatch(repaired.text,/Olá|Lucas|com base na telemetria disponível|não há informações suficientes/i);
assert.deepEqual(verifyProjectOpinionReply("Qual é a minha preferência de interface?",old),old);
assert.deepEqual(verifyProjectOpinionReply(message,{error:"quota",text:"Falha",ok:false}),{error:"quota",text:"Falha",ok:false});
assert.deepEqual(verifyProjectOpinionReply(message,{error:"quota"}),{error:"quota"});
assert.equal(verifyProjectOpinionReply(message,{text:JARVIS_PROJECT_OPINION,model:"project-evaluation"}).correctedLegacyReply,undefined);
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
for(const path of ["modules/ultron-core-bridge-v4270.js","script.js"]){
 const source=read(path);
 assert.match(source,/verifyProjectOpinionReply\(/,path);
 assert.match(source,/correctedLegacyReply/,path);
}
const html=read("index.html");
assert.match(html,/ultron-core-bridge-v4270\.js\?v=4\.71\.6/);
assert.match(html,/script\.js\?v=5\.65\.1/);
console.log("STAGE A UI ROUTING PASS: malformed old model answers corrected on both front-end paths; other requests untouched; no false success");
