import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateUnifiedResponse,shouldUseCollaborativeReasoning} from "../backend/unified-cognition.js";
const env={
 AI_PROVIDER_ORDER:"groq,cloudflare,cohere",
 AI_DISABLED_PROVIDERS:"gemini,openrouter,mistral,deepseek,cerebras",
 GROQ_API_KEY:"configured",COHERE_API_KEY:"configured",
 AI:{run:async()=>({response:"ok"})}
};
const question="Analise a arquitetura de pesquisa mundial, compare alternativas, planeje testes de integração e descreva melhorias prioritárias.";
assert.equal(shouldUseCollaborativeReasoning({message:question,taskClass:"planning"}),true);
for(const [message,taskClass] of [
 ["Olá, J.A.R.V.I.S.","fast"],
 ["Apague o banco de dados e revise a arquitetura imediatamente","planning"],
 [question,"realtime"]
])assert.equal(shouldUseCollaborativeReasoning({message,taskClass}),false);
assert.equal(shouldUseCollaborativeReasoning({message:question,taskClass:"planning",privateContext:true}),false);
const order=[];
const generate=async(e,p)=>{
 const enabled=String(e.AI_PROVIDER_ORDER).split(",").filter(n=>!String(e.AI_DISABLED_PROVIDERS).split(",").includes(n));
 order.push({provider:enabled[0],prompt:p});
 return {text:enabled[0]==="groq"?"Rascunho inicial":"Resposta única revisada",provider:enabled[0],providerLabel:enabled[0],model:"mock",attempts:[{provider:enabled[0],status:"success"}]};
};
const out=await generateUnifiedResponse({env,prompt:question,userMessage:question,taskClass:"planning",generate,aiBinding:env.AI});
assert.equal(out.providerLabel,"J.A.R.V.I.S.");
assert.equal(out.text,"Resposta única revisada");
assert.deepEqual(out.unifiedCognition.providersUsed,["groq","cloudflare"]);
assert.equal(out.unifiedCognition.collaborated,true);
assert.equal(order.length,2);
assert.ok(order[1].prompt.includes("Rascunho inicial"));
assert.ok(order[1].prompt.includes("rascunho não confiável"));
order.length=0;
const noReview=await generateUnifiedResponse({env,prompt:question,userMessage:question,taskClass:"planning",privateContext:true,generate});
assert.equal(noReview.text,"Rascunho inicial");
assert.equal(noReview.unifiedCognition.collaborated,false);
assert.equal(order.length,1);
order.length=0;
const primaryOnly=await generateUnifiedResponse({env:{...env,AI_DISABLED_PROVIDERS:"gemini,openrouter,mistral,deepseek,cerebras,cloudflare,cohere"},prompt:question,userMessage:question,taskClass:"planning",generate});
assert.equal(primaryOnly.unifiedCognition.collaborated,false);
assert.equal(order.length,1);
const broken=async(e,p)=>{
 if(p.includes("REVISÃO INTERNA"))throw Error("second provider unavailable");
 return {text:"Primeira resposta útil",provider:"groq",attempts:[]};
};
const fallback=await generateUnifiedResponse({env,prompt:question,userMessage:question,taskClass:"planning",generate:broken});
assert.equal(fallback.text,"Primeira resposta útil");
assert.equal(fallback.unifiedCognition.collaborated,false);
const worker=readFileSync(new URL("../backend/worker.js",import.meta.url),"utf8");
assert.match(worker,/generateUnifiedResponse/);
assert.match(worker,/privateContext:Boolean\(memoryState\.context/);
assert.match(worker,/generate:generateWithProviders/);
const config=readFileSync(new URL("../backend/wrangler.jsonc",import.meta.url),"utf8");
assert.match(config,/"AI_PROVIDER_ORDER": "groq,cloudflare,cohere"/);
console.log("UNIFIED COGNITION PASS: single Jarvis, selective review, privacy, no disabled providers, fallback");
