import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {unifiedIdentityAnswer,isUnifiedIdentityQuestion,JARVIS_UNIFIED_IDENTITY} from "../backend/jarvis-unified-identity.js";
import {continuityGuidance} from "../backend/contextual-continuity.js";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
for(const q of [
 "Agora explique o funcionamento das suas três IAs.",
 "J.A.R.V.I.S., quantas inteligências artificiais você tem?",
 "Explique seus três provedores de IA.",
 "Como funciona sua arquitetura de IA?"
]){
 assert.equal(isUnifiedIdentityQuestion(q),true,q);
 const answer=unifiedIdentityAnswer(q);
 assert.match(answer,/uma única inteligência artificial/i);
 assert.match(answer,/Groq, Cloudflare Workers AI e Cohere/);
 assert.match(answer,/Neural Ring é a interface visual/);
 assert.match(answer,/Cloudflare D1/);
 assert.doesNotMatch(answer,/três inteligências separadas|J\.A\.R\.V\.I\.S\., o JARVIS e o Neural Ring são/i);
}
for(const q of ["Quais são as três inteligências artificiais mais usadas no Brasil?","Quero pesquisar os modelos de IA disponíveis na Europa","Como funciona a memória do Jarvis?","Desligue o microfone"]){
 assert.equal(isUnifiedIdentityQuestion(q),false,q);
}
assert.match(file("backend/providers.js"),/UMA única inteligência artificial/);
assert.match(file("backend/providers.js"),/arquivos JSON locais como a fonte oficial/);
assert.match(file("backend/worker.js"),/const identityText=unifiedIdentityAnswer\(message\)/);
assert.match(file("backend/worker.js"),/model:"unified-identity"/);
assert.match(file("backend/worker.js"),/localArchitecture\|\|internalMemory\|\|conversationalFollowup/);
assert.match(file("backend/worker.js"),/!continuity.followup &&/);
const guidance=continuityGuidance("Feito.",{
 lastAssistantMessage:"Procedimento para testar notícias com fontes e datas.",
 lastUserMessage:"Descreva um procedimento para testar notícias"
});
assert.match(guidance.instruction,/Procedimento para testar notícias/);
assert.doesNotMatch(guidance.instruction,/Etapa 3 – Implementar verificação cruzada/);
assert.match(guidance.instruction,/não como verificação técnica/i);
const wrangler=file("backend/wrangler.jsonc");
assert.match(wrangler,/"AI_PROVIDER_ORDER": "groq,cloudflare,cohere"/);
assert.match(wrangler,/"AI_DISABLED_PROVIDERS": "gemini,openrouter,mistral,deepseek,cerebras"/);
assert.match(file("backend/memory.js"),/FROM messages/);
assert.match(file("backend/memory.js"),/FROM memories/);
console.log("JARVIS UNIFIED IDENTITY PASS: one assistant, 3 backends, D1 memory, no stale context");
