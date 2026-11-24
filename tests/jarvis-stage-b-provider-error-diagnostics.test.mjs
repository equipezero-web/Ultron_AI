import test from "node:test";
import assert from "node:assert/strict";
import {handleProviderProbe} from "../backend/provider-active-probe.js";

const token="x".repeat(40);
const request=provider=>new Request("https://example.invalid/api/provider-probe",{
  method:"POST",headers:{Authorization:"Bearer "+token},
  body:JSON.stringify({provider})
});
function mockDb(){
 return {prepare(sql){
   return {bind(){return this;},
     async run(){return {meta:{changes:1}}}
   };
 }};
}
async function simulate(provider,status,headers,errorBody,expected){
 const original=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async()=>{
  calls++;
  return new Response(JSON.stringify({error:{message:errorBody}}),{
   status,headers:{"Content-Type":"application/json",...headers}
  });
 };
 try{
  const env={JARVIS_PROVIDER_PROBE_TOKEN:token,
   ULTRON_DB:mockDb(),GEMINI_API_KEY:"mock",OPENROUTER_API_KEY:"mock"};
  const result=await handleProviderProbe(request(provider),env);
  assert.equal(calls,1);
  assert.equal(result.status,200);
  assert.equal(result.body.ok,false);
  assert.equal(result.body.state,"failed_observed");
  assert.equal(result.body.errorCategory,expected.category);
  assert.equal(result.body.upstreamHttpStatus,status);
  assert.equal(result.body.retryAfterSeconds,expected.retry);
  assert.doesNotMatch(JSON.stringify(result.body),/private token|sensitive account|provider private details/i);
 }finally{globalThis.fetch=original;}
}
test("Gemini 503 retains status without leaking upstream payload",async()=>{
 await simulate("gemini",503,{},"private token and sensitive account",{
  category:"upstream",retry:undefined
 });
});
test("Gemini 404 reports model or endpoint mismatch safely",async()=>{
 await simulate("gemini",404,{},"provider private details",{
  category:"model_or_endpoint_not_found",retry:undefined
 });
});
test("OpenRouter 429 returns numeric retry-after seconds",async()=>{
 await simulate("openrouter",429,{"Retry-After":"120"},"private token",{
  category:"rate_limit",retry:120
 });
});
test("OpenRouter 429 without retry-after does not invent a delay",async()=>{
 await simulate("openrouter",429,{},"sensitive account",{
  category:"rate_limit",retry:undefined
 });
});
test("Missing provider key stays disabled and needs no outbound network",async()=>{
 const result=await handleProviderProbe(request("gemini"),{
  JARVIS_PROVIDER_PROBE_TOKEN:token,ULTRON_DB:mockDb()
 });
 assert.equal(result.body.state,"not_configured");
});
