import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isJarvisProjectOpinion,JARVIS_PROJECT_OPINION} from "../backend/jarvis-project-opinion.js";
import {shouldResearchBeforeAnswer} from "../backend/web-research.js";
for(const phrase of [
 "O que você achou do nosso projeto?",
 "Jarvis, o que você achou do nosso projeto?",
 "O que você acha do nosso projeto?",
 "Qual sua opinião sobre o nosso projeto?"
]){
 assert.equal(isJarvisProjectOpinion(phrase),true,phrase);
 assert.equal(shouldResearchBeforeAnswer(phrase).needed,false,phrase);
}
for(const phrase of [
 "O que você achou do nosso projeto de barbearia?",
 "O que você acha do projeto da loja?",
 "Quais são as notícias do Brasil?",
 "Qual é a minha preferência de interface?",
 "O que você achou do nosso projeto de CRM?"
])
 assert.equal(isJarvisProjectOpinion(phrase),false,phrase);
assert.match(JARVIS_PROJECT_OPINION,/Neural Ring/);
assert.match(JARVIS_PROJECT_OPINION,/memória D1/);
assert.match(JARVIS_PROJECT_OPINION,/integração entre os módulos/);
assert.doesNotMatch(JARVIS_PROJECT_OPINION,/(?:olá|lucas|telemetria disponível|não tenho informações|com base na telemetria)/i);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
const start=worker.indexOf("if(isJarvisProjectOpinion(message))");
const memory=worker.indexOf("const preferenceIntent=interfacePreferenceIntent(message)");
assert.ok(start>=0 && memory>start);
assert.match(worker.slice(start,memory),/await saveExchange\(env/);
assert.match(worker.slice(start,memory),/webResearch:\{requested:false,used:false/);
console.log("STAGE A PROJECT OPINION PASS: natural grounded answer, no telemetry or web, preserves other projects");
