import test from "node:test";
import assert from "node:assert/strict";
import {handleProviderProbe} from "../backend/provider-active-probe.js";
const token="x".repeat(40);
const request=(provider,auth)=>new Request("https://example.invalid/api/provider-probe",{
 method:"POST",headers:auth?{Authorization:"Bearer "+auth}:{},
 body:JSON.stringify({provider})
});
test("probe is disabled without explicit strong secret",async()=>{
 const result=await handleProviderProbe(request("groq",token),{GROQ_API_KEY:"configured"});
 assert.equal(result.status,403);
});
test("probe rejects incorrect tokens before provider calls",async()=>{
 const result=await handleProviderProbe(request("groq","wrong"),{
  JARVIS_PROVIDER_PROBE_TOKEN:token,GROQ_API_KEY:"configured"
 });
 assert.equal(result.status,403);
});
test("probe rejects unknown providers",async()=>{
 const result=await handleProviderProbe(request("unknown",token),{
  JARVIS_PROVIDER_PROBE_TOKEN:token
 });
 assert.equal(result.status,400);
});
test("probe will not spend credits if D1 is unavailable",async()=>{
 const result=await handleProviderProbe(request("groq",token),{
  JARVIS_PROVIDER_PROBE_TOKEN:token,GROQ_API_KEY:"configured"
 });
 assert.equal(result.status,503);
 assert.equal(result.body.state,"d1-required");
});
test("not configured is reported without testing",async()=>{
 const result=await handleProviderProbe(request("cohere",token),{
  JARVIS_PROVIDER_PROBE_TOKEN:token
 });
 assert.equal(result.status,200);
 assert.equal(result.body.state,"not_configured");
});
