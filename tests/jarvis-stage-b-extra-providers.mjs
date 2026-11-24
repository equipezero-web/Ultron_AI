import assert from "node:assert/strict";
import {getProviderStatus,generateWithProviders,probeSingleProvider} from "../backend/providers.js";
import {chooseProviderOrder} from "../backend/smart-router.js";
import {handleProviderProbe} from "../backend/provider-active-probe.js";

const token="x".repeat(40);
const examples={
  mistral:"api.mistral.ai",
  deepseek:"api.deepseek.com",
  cerebras:"api.cerebras.ai"
};
const env={
 AI_PROVIDER_ORDER:"groq,cloudflare,cohere,mistral,deepseek,cerebras",
 AI_DISABLED_PROVIDERS:"gemini,openrouter",
 GEMINI_API_KEY:"unused",OPENROUTER_API_KEY:"unused",
 MISTRAL_API_KEY:"mock",DEEPSEEK_API_KEY:"mock",CEREBRAS_API_KEY:"mock"
};
const status=getProviderStatus(env);
for(const name of Object.keys(examples)){
 assert.equal(status[name].configured,true);
 assert.equal(status[name].enabled,true);
}
assert.equal(status.gemini.enabled,false);
assert.equal(status.openrouter.enabled,false);
for(const message of ["Pesquise algo","Explique o código","Planeje o trabalho"]){
 const order=chooseProviderOrder(env,message).order;
 assert.ok(order.includes("mistral") && order.includes("deepseek") && order.includes("cerebras"));
 assert.ok(!order.includes("gemini") && !order.includes("openrouter"));
}
const originalFetch=globalThis.fetch;
const hits=[];
globalThis.fetch=async(url,options)=>{
 const host=new URL(url).hostname;
 hits.push(host);
 const body=JSON.parse(options.body);
 assert.equal(body.stream,false);
 assert.ok(body.messages.some(m=>m.role==="system"));
 const expected=Object.entries(examples).find(([,hostname])=>hostname===host)?.[0];
 assert.ok(expected,"Unexpected provider "+host);
 assert.equal(options.headers.Authorization,"Bearer mock");
 return new Response(JSON.stringify({choices:[{message:{content:expected+" responded"}}]}),{status:200});
};
try{
 for(const name of Object.keys(examples)){
   const isolated={...env,AI_PROVIDER_ORDER:name,
    MISTRAL_API_KEY:name==="mistral"?"mock":null,
    DEEPSEEK_API_KEY:name==="deepseek"?"mock":null,
    CEREBRAS_API_KEY:name==="cerebras"?"mock":null};
   const response=await generateWithProviders(isolated,"Olá",{},{});
   assert.equal(response.provider,name);
   assert.match(response.text,/responded/);
   const probe=await probeSingleProvider(isolated,name);
   assert.equal(probe.ok,true);
 }
 assert.equal(hits.length,6);
 assert.equal(getProviderStatus({}).mistral.configured,false);
 const inactive=await handleProviderProbe(new Request("https://invalid.test/api/provider-probe",{
   method:"POST",headers:{Authorization:"Bearer "+token},body:JSON.stringify({provider:"mistral"})
 }),{JARVIS_PROVIDER_PROBE_TOKEN:token});
 assert.equal(inactive.body.state,"not_configured");
 assert.equal(hits.length,6,"No provider called without a key");
}finally{globalThis.fetch=originalFetch;}
console.log("NEW PROVIDERS PASS: opt-in Mistral, DeepSeek, Cerebras; old disabled; no calls without keys");
