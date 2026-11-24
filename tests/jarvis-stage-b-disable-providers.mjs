import assert from "node:assert/strict";
import {generateWithProviders,getProviderStatus,probeSingleProvider} from "../backend/providers.js";
import {chooseProviderOrder} from "../backend/smart-router.js";
import {handleProviderProbe} from "../backend/provider-active-probe.js";
import {isProviderDisabled} from "../backend/provider-policy.js";

const env={
 AI_PROVIDER_ORDER:"gemini,openrouter,groq,cloudflare,cohere",
 AI_DISABLED_PROVIDERS:"gemini,openrouter",
 GEMINI_API_KEY:"configured", OPENROUTER_API_KEY:"configured", GROQ_API_KEY:"configured",
 COHERE_API_KEY:"configured", AI:{run:async()=>({response:"Cloudflare succeeded"})}
};
assert.equal(isProviderDisabled(env,"gemini"),true);
assert.equal(isProviderDisabled(env,"openrouter"),true);
assert.equal(isProviderDisabled(env,"groq"),false);
const status=getProviderStatus(env,env.AI);
assert.equal(status.gemini.configured,true);
assert.equal(status.gemini.enabled,false);
assert.equal(status.openrouter.enabled,false);
assert.equal(status.groq.enabled,true);

for(const phrase of ["Pesquise as notícias de hoje","Veja esta imagem","Corrija o código agora","Olá, Jarvis"]){
 const order=chooseProviderOrder(env,phrase).order;
 assert.ok(order.every(p=>!["gemini","openrouter"].includes(p)),phrase);
}
const origFetch=globalThis.fetch;
const calls=[];
globalThis.fetch=async(url)=>{
 const host=new URL(url).hostname;calls.push(host);
 if(host==="api.groq.com")return new Response(JSON.stringify({error:{message:"temp unavailable"}}),{status:503});
 if(host==="api.cohere.com")return new Response(JSON.stringify({message:{content:[{text:"Cohere fallback succeeded"}]}}),{status:200});
 throw new Error("Disabled provider was invoked: "+host);
};
try{
 const result=await generateWithProviders(env,"Olá",{}, {aiBinding:env.AI});
 assert.equal(result.provider,"cloudflare");
 assert.deepEqual(calls,["api.groq.com"]);
 assert.ok(result.attempts.every(a=>!["gemini","openrouter"].includes(a.provider)));
 calls.length=0;
 const noCloudflare={...env, AI:null, GROQ_API_KEY:null};
 const fallback=await generateWithProviders(noCloudflare,"Olá",{},{});
 assert.equal(fallback.provider,"cohere");
 assert.deepEqual(calls,["api.cohere.com"]);
 await assert.rejects(()=>probeSingleProvider(env,"gemini"),/provider-disabled/);
 await assert.rejects(()=>probeSingleProvider(env,"openrouter"),/provider-disabled/);

 const token="x".repeat(40);
 const request=name=>new Request("https://invalid.test/api/provider-probe",{
  method:"POST",headers:{Authorization:"Bearer "+token},body:JSON.stringify({provider:name})
 });
 for(const name of ["gemini","openrouter"]){
  const response=await handleProviderProbe(request(name),{...env,JARVIS_PROVIDER_PROBE_TOKEN:token});
  assert.equal(response.body.state,"disabled_by_operator");
  assert.equal(response.status,200);
 }
 assert.deepEqual(calls,["api.cohere.com"]);
}finally{globalThis.fetch=origFetch;}
console.log("PROVIDER DISABLE PASS: Gemini/OpenRouter ignored by router, gateway, probe; Groq/Cloudflare/Cohere usable");
