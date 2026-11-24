import assert from "node:assert/strict";
import {generateWithProviders} from "../backend/providers.js";
import {createProviderCircuitBreaker,isTransientProviderFailure} from "../backend/provider-circuit-breaker.js";

let timestamp = 1000;
const breaker = createProviderCircuitBreaker({
  threshold:2,cooldownMs:1000,now:()=>timestamp
});
assert.equal(isTransientProviderFailure({status:503}),true);
assert.equal(isTransientProviderFailure({status:429}),true);
assert.equal(isTransientProviderFailure(new Error("excedeu o prazo")),true);
assert.equal(isTransientProviderFailure({status:401}),false);
assert.equal(isTransientProviderFailure({status:400}),false);

const previousFetch=globalThis.fetch;
let geminiCalls=0,groqCalls=0,geminiHealthy=false;
globalThis.fetch=async(url)=>{
  const target=String(url);
  if(target.includes("generativelanguage.googleapis.com")){
    geminiCalls++;
    if(!geminiHealthy)return new Response(JSON.stringify({message:"temporarily unavailable"}),{status:503});
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:"Gemini recovered"}]}}]}),{status:200});
  }
  if(target.includes("api.groq.com")){
    groqCalls++;
    return new Response(JSON.stringify({choices:[{message:{content:"Groq available"}}]}),{status:200});
  }
  throw new Error("Unexpected upstream");
};
try {
  const env={AI_PROVIDER_ORDER:"gemini,groq",GEMINI_API_KEY:"mock",GROQ_API_KEY:"mock"};
  const ask=()=>generateWithProviders(env,"Oi",{}, {circuitBreaker:breaker});
  for(let i=0;i<2;i++){
    const result=await ask();
    assert.equal(result.provider,"groq");
    assert.equal(result.attempts[0].status,"failed");
  }
  assert.equal(breaker.isCooling("gemini"),true);
  const skipped=await ask();
  assert.equal(skipped.provider,"groq");
  assert.equal(skipped.attempts[0].provider,"gemini");
  assert.equal(skipped.attempts[0].status,"skipped");
  assert.equal(geminiCalls,2);
  timestamp+=1001;
  geminiHealthy=true;
  const restored=await ask();
  assert.equal(restored.provider,"gemini");
  assert.equal(geminiCalls,3);
  assert.equal(breaker.isCooling("gemini"),false);
  assert.equal(restored.attempts.length,1);
  assert.equal(groqCalls,3);

  // Last configured provider is always attempted even while cooling.
  const solo=createProviderCircuitBreaker({threshold:1,cooldownMs:1000,now:()=>timestamp});
  solo.onFailure("gemini",{status:503});
  assert.equal(solo.isCooling("gemini"),true);
  const only=await generateWithProviders(
    {AI_PROVIDER_ORDER:"gemini",GEMINI_API_KEY:"mock"},
    "Oi",{}, {circuitBreaker:solo});
  assert.equal(only.provider,"gemini");

  // A permanent client/auth failure does not trigger a temporary outage.
  breaker.onFailure("groq",{status:401});
  assert.equal(breaker.isCooling("groq"),false);
}finally{globalThis.fetch=previousFetch;}
console.log("STAGE B CIRCUIT BREAKER PASS: transient cooldown, recovery, lone provider, permanent errors");
