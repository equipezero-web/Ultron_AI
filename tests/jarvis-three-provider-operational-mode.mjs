import assert from "node:assert/strict";
import {getProviderStatus,generateWithProviders,probeSingleProvider} from "../backend/providers.js";
import {chooseProviderOrder} from "../backend/smart-router.js";
import {handleProviderProbe} from "../backend/provider-active-probe.js";

const forbidden=["gemini","openrouter","mistral","deepseek","cerebras"];
const active=["groq","cloudflare","cohere"];
const env={
 AI_PROVIDER_ORDER:"groq,cloudflare,cohere",
 AI_DISABLED_PROVIDERS:forbidden.join(","),
 GEMINI_API_KEY:"present",OPENROUTER_API_KEY:"present",MISTRAL_API_KEY:"present",
 DEEPSEEK_API_KEY:"present",CEREBRAS_API_KEY:"present",
 GROQ_API_KEY:"present",COHERE_API_KEY:"present",
 AI:{run:async()=>({response:"Cloudflare fallback alive"})}
};
const statuses=getProviderStatus(env,env.AI);
for(const name of forbidden) {
 assert.equal(statuses[name].configured,true);
 assert.equal(statuses[name].enabled,false);
}
for(const name of active)assert.equal(statuses[name].enabled,true);
for(const phrase of ["Olá Jarvis","Pesquise notícias","Analise esta imagem","Ajuste o código","Planeje a missão"]){
 const order=chooseProviderOrder(env,phrase).order;
 assert.deepEqual([...order].sort(),[...active].sort(),phrase);
}
const prevFetch=globalThis.fetch;
const urls=[];
globalThis.fetch=async(url)=>{
 const hostname=new URL(url).hostname;
 urls.push(hostname);
 if(hostname==="api.groq.com")return new Response(JSON.stringify({error:{message:"Temporary"}}),{status:503});
 if(hostname==="api.cohere.com")return new Response(JSON.stringify({message:{content:[{text:"Cohere backup alive"}]}}),{status:200});
 throw new Error("Forbidden upstream called: "+hostname);
};
try {
 const cf=await generateWithProviders(env,"Olá",{}, {aiBinding:env.AI});
 assert.equal(cf.provider,"cloudflare");
 assert.deepEqual(urls,["api.groq.com"]);
 // With Cloudflare unavailable, the third allowed provider must still respond.
 const cohere=await generateWithProviders({...env,AI:null},"Olá",{}, {});
 assert.equal(cohere.provider,"cohere");
 assert.ok(urls.every(host=>["api.groq.com","api.cohere.com"].includes(host)));
 const token="x".repeat(40);
 for(const provider of forbidden){
   await assert.rejects(()=>probeSingleProvider(env,provider),/provider-disabled/);
   const res=await handleProviderProbe(new Request("https://example.invalid/api/provider-probe",{
    method:"POST",headers:{Authorization:"Bearer "+token},body:JSON.stringify({provider})
   }),{...env,JARVIS_PROVIDER_PROBE_TOKEN:token});
   assert.equal(res.body.state,"disabled_by_operator");
   assert.equal(res.status,200);
 }
 assert.deepEqual(urls,["api.groq.com","api.groq.com","api.cohere.com"]);
}finally {globalThis.fetch=prevFetch;}
console.log("THREE PROVIDER MODE PASS: all task classes, fallback, admin probes");
