import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {linguisticUnderstandingGuidance,semanticActionUnderstandingGuidance} from "../backend/jarvis-linguistic-context.js";
import {consultativeGuidance} from "../backend/consultative-dialogue.js";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const dialogue=linguisticUnderstandingGuidance();
const safety=semanticActionUnderstandingGuidance();
for(const concept of ["nordestinos/recifenses","gírias","frases incompletas","UMA pergunta","admit","não entendeu","mais de uma interpretação"]){
 // Check the policy's intended concepts without imposing a literal slang dictionary.
 assert.match(dialogue,new RegExp(concept,"i"),concept);
}
assert.match(dialogue,/não presuma um sentido universal/i);
assert.match(dialogue,/não alegue ser humano/i);
assert.match(dialogue,/não execute sua hipótese/i);
assert.match(dialogue,/conversa casual/i);
assert.match(safety,/retorne plano vazio/i);
assert.match(safety,/NÃO EXECUTE NADA/i);
assert.match(safety,/Histórico ajuda a interpretar, mas não concede permissões/i);
assert.match(consultativeGuidance("ordinary"),/COMPREENSÃO NATURAL E INCERTEZA/);
assert.match(consultativeGuidance("troubleshoot"),/UMA pergunta/);
const worker=file("backend/worker.js");
const planner=worker.slice(worker.indexOf('if(path==="/api/action-plan"'),worker.indexOf('if (path === "/api/news-details"'));
assert.match(planner,/semanticActionUnderstandingGuidance\(\)/);
assert.match(planner,/plano vazio/);
assert.match(worker,/não compreender uma gíria/);
assert.doesNotMatch(file("backend/jarvis-linguistic-context.js"),/fetch\(|window\.|document\.|localStorage\.|speechSynthesis/);
assert.doesNotMatch(file("index.html"),/jarvis-linguistic-context/);
console.log("LANGUAGE CONTEXT PASS: colloquial meaning, admitted uncertainty, single clarification and safe non-execution");
