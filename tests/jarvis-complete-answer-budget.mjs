import assert from "node:assert/strict";
import {jarvisResponseTokenBudget,generateWithProviders} from "../backend/providers.js";
assert.equal(jarvisResponseTokenBudget("Oi"),720);
assert.equal(jarvisResponseTokenBudget("Explique resumidamente"),720);
const analysis="J.A.R.V.I.S., analise a arquitetura da sua inteligência mundial, compare três melhorias possíveis e elabore um plano de integração com prioridades e critérios de validação.";
assert.equal(jarvisResponseTokenBudget(analysis),1400);
assert.equal(jarvisResponseTokenBudget("REVISÃO INTERNA LIMITADA DO J.A.R.V.I.S. — PRODUZA UMA ÚNICA RESPOSTA FINAL."),1400);
const response={choices:[{message:{content:"Resposta concluída."}}]};
const previousFetch=globalThis.fetch;
const bodies={};
globalThis.fetch=async(url,options)=>{
 const host=new URL(url).hostname;
 bodies[host]=JSON.parse(options.body);
 if(host==="api.groq.com")return new Response(JSON.stringify(response),{status:200});
 if(host==="api.cohere.com")return new Response(JSON.stringify({message:{content:[{text:"Resposta concluída."}]}}),{status:200});
 throw new Error("Unexpected network request "+host);
};
try{
 const groq=await generateWithProviders({AI_PROVIDER_ORDER:"groq",AI_DISABLED_PROVIDERS:"cloudflare,cohere,gemini,openrouter,mistral,deepseek,cerebras",GROQ_API_KEY:"mock"},analysis);
 assert.equal(groq.text,"Resposta concluída.");
 assert.equal(bodies["api.groq.com"].max_completion_tokens,1400);
 const cohere=await generateWithProviders({AI_PROVIDER_ORDER:"cohere",AI_DISABLED_PROVIDERS:"cloudflare,groq,gemini,openrouter,mistral,deepseek,cerebras",COHERE_API_KEY:"mock"},analysis);
 assert.equal(cohere.text,"Resposta concluída.");
 assert.equal(bodies["api.cohere.com"].max_tokens,1400);
 let cf;
 const binding={run:async(model,input)=>{cf=input;return {response:"Resposta concluída."};}};
 const cloudflare=await generateWithProviders({AI_PROVIDER_ORDER:"cloudflare",AI_DISABLED_PROVIDERS:"cohere,groq,gemini,openrouter,mistral,deepseek,cerebras"},analysis,{}, {aiBinding:binding});
 assert.equal(cloudflare.text,"Resposta concluída.");
 assert.equal(cf.max_tokens,1400);
}finally{globalThis.fetch=previousFetch;}
console.log("COMPLETE ANSWERS PASS: complex requests 1400 tokens across Groq/Cloudflare/Cohere, short requests 720");
