import assert from "node:assert/strict";
import {generateWithProviders} from "../backend/providers.js";
const oldFetch=globalThis.fetch;
const calls=[];
globalThis.fetch=async(url,options)=>{
 const target=String(url);calls.push(target);
 if(target.includes("generativelanguage.googleapis.com"))
  return new Response(JSON.stringify({error:{message:"temporary provider unavailable"}}),
   {status:503,headers:{"Content-Type":"application/json"}});
 if(target.includes("api.groq.com")){
  const request=JSON.parse(options.body);
  const content=request.messages.find(x=>x.role==="user")?.content||"";
  // Ordinary chat must not receive raw telemetry; voice-off is system policy.
  assert.doesNotMatch(content,/"tts":(?:true|false)/);
  const policy=request.messages.find(x=>x.role==="system")?.content||"";
  assert.match(policy,/TTS estão DESATIVADOS/);
  assert.ok(!content.includes("confidential-real-token"));
  return new Response(JSON.stringify({choices:[{message:{content:"Entendi a solicitação, posso ajudar."}}]}),
   {status:200,headers:{"Content-Type":"application/json"}});
 }
 throw Error("Unexpected provider requested: "+target);
};
try{
 const env={AI_PROVIDER_ORDER:"gemini,groq",GEMINI_API_KEY:"test-only",
  GROQ_API_KEY:"test-only",ELEVENLABS_API_KEY:"test-only",ELEVENLABS_VOICE_ID:"test-only"};
 const r=await generateWithProviders(env,"Preciso de ajuda",{}, {});
 assert.equal(r.provider,"groq");
 assert.equal(r.attempts.length,2);
 assert.equal(r.attempts[0].status,"failed");
 assert.equal(r.attempts[1].status,"success");
 assert.equal(calls.length,2);
 assert.match(r.text,/Entendi/);
}finally{globalThis.fetch=oldFetch;}
console.log("GATEWAY PASS: failed upstream -> working fallback; no false TTS claim");
