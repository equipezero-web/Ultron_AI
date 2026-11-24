import assert from "node:assert/strict";
import {generateWithProviders} from "../backend/providers.js";
import {createMistral429Gate} from "../backend/mistral-rate-limit.js";
import {handleProviderProbe} from "../backend/provider-active-probe.js";
let now=1000;
const gate=createMistral429Gate({now:()=>now,cooldownMs:15*60*1000});
const original=globalThis.fetch;
const calls=[];
globalThis.fetch=async(url)=>{
 const target=String(url);
 calls.push(target);
 if(target.includes("api.mistral.ai"))return new Response(JSON.stringify({message:"sensitive billing details"}),
  {status:429,headers:{"Content-Type":"application/json"}});
 if(target.includes("api.groq.com"))return new Response(JSON.stringify({
  choices:[{message:{content:"Groq respondeu"}}]}),{status:200});
 throw new Error("Unexpected "+target);
};
try{
 const env={AI_PROVIDER_ORDER:"mistral,groq",MISTRAL_API_KEY:"mock",GROQ_API_KEY:"mock",
  AI_DISABLED_PROVIDERS:"gemini,openrouter"};
 const first=await generateWithProviders(env,"Oi",{},{mistralRateGate:gate});
 assert.equal(first.provider,"groq");
 assert.equal(gate.isCooling(),true);
 assert.equal(calls.length,2);
 assert.equal(first.attempts[0].provider,"mistral");
 assert.equal(first.attempts[0].status,"failed");
 const second=await generateWithProviders(env,"Oi",{},{mistralRateGate:gate});
 assert.equal(second.provider,"groq");
 assert.equal(calls.length,3);
 assert.equal(second.attempts[0].status,"skipped");
 assert.match(second.attempts[0].reason,/429/);
 now+=15*60*1000+1;
 assert.equal(gate.isCooling(),false);
 const third=await generateWithProviders(env,"Oi",{},{mistralRateGate:gate});
 assert.equal(third.provider,"groq");
 assert.equal(calls.filter(url=>url.includes("mistral")).length,2);
 
 const request=new Request("https://invalid.test/api/provider-probe",{
  method:"POST",headers:{Authorization:"Bearer "+"x".repeat(40)},
  body:JSON.stringify({provider:"mistral"})
 });
 const db={prepare(){return {bind(){return this;},async run(){return {meta:{changes:1}};}};}};
 const response=await handleProviderProbe(request,{
  MISTRAL_API_KEY:"mock",ULTRON_DB:db,JARVIS_PROVIDER_PROBE_TOKEN:"x".repeat(40)
 });
 assert.equal(response.body.errorCategory,"rate_limit");
 assert.equal(response.body.upstreamHttpStatus,429);
 assert.deepEqual(response.body.possibleCauses,["workspace_spending_limit","model_rate_limit"]);
 assert.doesNotMatch(JSON.stringify(response.body),/sensitive billing details/);
}finally{globalThis.fetch=original;}
console.log("MISTRAL 429 PASS: bounded pause, protected fallback, no sensitive error leakage");
