import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyJarvisTurn} from "../backend/jarvis-conversation-router.js";
import {isGeneralNewsIntent} from "../backend/news-context.js";
import {shouldResearchBeforeAnswer} from "../backend/web-research.js";
import {explicitMemoryCandidate} from "../backend/memory.js";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
for(const message of ["Oxente, Jarvis!","Oxe, Jarvis!"]){
 const turn=classifyJarvisTurn(message);
 assert.equal(turn.isSocial,true,message);
 assert.equal(turn.mayExecute,false,message);
 assert.equal(shouldResearchBeforeAnswer(message).needed,false,message);
}
for(const message of ["O que você achou do nosso projeto?","Não entendi isso que você falou."]){
 assert.equal(shouldResearchBeforeAnswer(message).needed,false,message);
}
assert.equal(isGeneralNewsIntent("Quais são as notícias mais recentes do Brasil?"),true);
assert.equal(isGeneralNewsIntent("Quais são as notícias mais recentes do Japão?"),false);
assert.equal(shouldResearchBeforeAnswer("Pesquise informações atuais sobre El Niño e cite as fontes.").needed,true);
assert.ok(explicitMemoryCandidate("Lembre-se de que minha preferência de interface para este teste é azul-marinho."));
assert.equal(explicitMemoryCandidate("Qual é a minha preferência de interface para este teste?"),null);

const orchestrator=source("modules/ultron-orchestrator-v4270.js");
const queue=orchestrator.slice(orchestrator.indexOf("function enqueue("),orchestrator.indexOf("function intercept("));
assert.match(queue,/if\(window\.ULTRON_PRIORITY\?\.state\?\.frozen\)/);
assert.ok(queue.indexOf("if(window.ULTRON_PRIORITY?.state?.frozen)")<queue.indexOf("isRingHomeCommand(message)"));
const exec=orchestrator.slice(orchestrator.indexOf("async function executeMessage("),orchestrator.indexOf("function cancelP0Operations("));
assert.match(exec,/if\(window\.ULTRON_PRIORITY\?\.state\?\.frozen\)/);
assert.ok(exec.indexOf("if(window.ULTRON_PRIORITY?.state?.frozen)")<exec.indexOf("if(isRingHomeCommand(clean))"));
const worker=source("backend/worker.js");
assert.match(worker,/const currentPolicy=shouldResearchBeforeAnswer\(message\)/);
assert.match(worker,/if\(taskContext && !currentPolicy\.needed && isResearchFollowUp\(message\)\)/);
assert.match(worker,/const requestedExplicitMemory=Boolean\(explicitMemoryCandidate\(message\)\)/);
assert.match(worker,/explicitMemorySaved\s*\?\s*"Memória: preferência registrada no D1\."/);
assert.match(worker,/não consegui confirmar o salvamento/);
console.log("JARVIS LIVE STAGE A REGRESSIONS PASS: P0, regional conversation, Brazil news, El Niño, explicit memory");
