import assert from "node:assert/strict";
import {generateWithProviders} from "../backend/providers.js";

// A stalled Cloudflare Workers AI binding must not lock the conversational
// gateway. The timeout limits waiting for results; it cannot revoke inference.
const originalFetch=globalThis.fetch;
const requests=[];
globalThis.fetch=async(url,options)=>{
  requests.push(String(url));
  assert.match(String(url),/api\.groq\.com/);
  const body=JSON.parse(options.body);
  assert.match(body.messages[0].content,/TTS estão DESATIVADOS/);
  return new Response(JSON.stringify({choices:[{message:{content:"Resposta do provedor alternativo."}}]}),
    {status:200,headers:{"Content-Type":"application/json"}});
};
try{
  const stalled={run:()=>new Promise(()=>{})};
  const env={AI_PROVIDER_ORDER:"cloudflare,groq",GROQ_API_KEY:"test-only"};
  const started=Date.now();
  const result=await generateWithProviders(env,"Me responda sem voz.",{},
    {aiBinding:stalled,bindingTimeoutMs:60});
  assert.equal(result.provider,"groq");
  assert.deepEqual(result.attempts.map(x=>[x.provider,x.status]),[
    ["cloudflare","failed"],["groq","success"]
  ]);
  assert.match(result.attempts[0].error,/excedeu o prazo/);
  assert.ok(Date.now()-started<2000,"Timed out binding should not hang the fallback");
  assert.equal(requests.length,1);
  assert.match(result.text,/provedor alternativo/);

  requests.length=0;
  const healthy={run:async()=>({response:"Resposta direta do Cloudflare."})};
  const direct=await generateWithProviders(env,"Olá",{},{
    aiBinding:healthy,bindingTimeoutMs:60
  });
  assert.equal(direct.provider,"cloudflare");
  assert.equal(requests.length,0);
  assert.equal(direct.attempts.length,1);
}finally{
  globalThis.fetch=originalFetch;
}
console.log("GATEWAY BINDING DEADLINE PASS: stalled Cloudflare falls back; healthy binding remains preferred");
