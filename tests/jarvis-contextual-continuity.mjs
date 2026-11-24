import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {continuityGuidance} from "../backend/contextual-continuity.js";
const history={
 lastAssistantMessage:"A próxima etapa é configurar a memória D1 e verificar o retorno no endpoint.",
 lastUserMessage:"Vamos integrar a memória do projeto."
};
for(const [message,kind] of [
 ["não entendi","clarify"],["Pode explicar melhor?","clarify"],
 ["sim","confirm"],["Não.","confirm"],["Isso mesmo","confirm"],
 ["continue","continue"],["Vamos dar continuidade","continue"],
 ["prossiga","continue"],["pode seguir","continue"],["vamos lá","continue"],
 ["feito","reported-progress"],["consegui","reported-progress"],["já fiz","reported-progress"]
]){
 const result=continuityGuidance(message,history);
 assert.equal(result.kind,kind,message);
 assert.equal(result.followup,true,message);
 assert.match(result.instruction,/memória D1/);
 assert.match(result.instruction,/não|Nao|nunca|sem|never|Não/i);
 assert.match(result.instruction,/autorização|permissões|permissao/i);
}
for(const message of [
 "continue a pesquisar as notícias de hoje",
 "faça uma transferência de dinheiro",
 "não continue", "pare tudo", "abra meu celular",
 "O que podemos melhorar na loja?",
 "Você já fez o deploy?",
 "vamos continuar amanhã na escola",
 "reinicie o banco de dados"
]){
 const result=continuityGuidance(message,history);
 assert.equal(result.kind,"new-turn",message);
 assert.equal(result.instruction,"",message);
}
for(const msg of ["continue","feito","não entendi","sim"]){
 const result=continuityGuidance(msg);
 assert.match(result.instruction,/CONTEXTO AUSENTE/);
 assert.doesNotMatch(result.instruction,/memória D1/);
 assert.equal(result.followup,true);
}
assert.equal(continuityGuidance("continue",{
 lastAssistantMessage:"A".repeat(10000),
 lastUserMessage:"B".repeat(10000)
}).instruction.length<3000,true);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(worker,/import \{continuityGuidance\} from "\.\/contextual-continuity\.js"/);
assert.match(worker,/continuityGuidance\(message,/);
assert.match(worker,/continuity\.followup\|\|dialogueMode\.followup/);
assert.match(worker,/loadMemoryContext\(env, \{ operatorId, conversationId, query: message, recentLimit: 16 \}\)/);
console.log("CONTEXT CONTINUITY PASS: follow-ups, no-context and safety limits");
