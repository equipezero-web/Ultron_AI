// Explicit, secret-authenticated one-provider live checks.
// Disabled unless JARVIS_PROVIDER_PROBE_TOKEN is set. No prompts/responses stored.
import { getProviderStatus, probeSingleProvider } from "./providers.js";

const PROVIDERS = new Set(["gemini","groq","openrouter","cloudflare","cohere"]);
const FIFTEEN_MINUTES = 15*60*1000;
function authorized(request,env){
 const expected=String(env?.JARVIS_PROVIDER_PROBE_TOKEN||"");
 const supplied=String(request.headers.get("Authorization")||"");
 return expected.length>=32 && supplied===`Bearer ${expected}`;
}
function category(error){
 const status=Number(error?.status||0);
 if(status===401||status===403)return "authentication";
 if(status===429)return "rate_limit";
 if(status>=500)return "upstream";
 if(status>=400)return "request_rejected";
 if(error?.name==="AbortError"||/timeout|excedeu o prazo/i.test(String(error?.message||"")))return "timeout";
 return "network_or_unknown";
}
// D1 atomic slot avoids concurrent checks in different Worker isolates.
async function reserve(env,provider,now=Date.now()){
 const db=env?.ULTRON_DB;
 if(!db?.prepare)return {ok:false,reason:"d1-required"};
 try{
  await db.prepare(`CREATE TABLE IF NOT EXISTS jarvis_provider_probe_slots (
   provider TEXT PRIMARY KEY, last_started_ms INTEGER NOT NULL)`).run();
  const result=await db.prepare(`INSERT INTO jarvis_provider_probe_slots(provider,last_started_ms)
   VALUES(?,?) ON CONFLICT(provider) DO UPDATE SET last_started_ms=excluded.last_started_ms
   WHERE jarvis_provider_probe_slots.last_started_ms <= ?`)
   .bind(provider,now,now-FIFTEEN_MINUTES).run();
  return result?.meta?.changes===1?{ok:true}:{ok:false,reason:"cooldown"};
 }catch{return {ok:false,reason:"d1-unavailable"};}
}
export async function handleProviderProbe(request,env){
 if(!authorized(request,env))return {status:403,body:{ok:false,error:"probe-not-authorized"}};
 let data;
 try{data=await request.json();}catch{return {status:400,body:{ok:false,error:"invalid-json"}};}
 const provider=String(data?.provider||"").toLowerCase();
 if(!PROVIDERS.has(provider))return {status:400,body:{ok:false,error:"invalid-provider"}};
 if(!getProviderStatus(env,env.AI)[provider]?.configured)
  return {status:200,body:{ok:false,provider,state:"not_configured"}};
 const slot=await reserve(env,provider);
 if(!slot.ok)return {status:slot.reason==="cooldown"?429:503,
  body:{ok:false,provider,state:slot.reason}};
 const started=Date.now();
 try{
  await probeSingleProvider(env,provider);
  return {status:200,body:{ok:true,provider,state:"available_observed",durationMs:Date.now()-started,
    observedAt:new Date().toISOString(),scope:"single-check",costNotice:"A sondagem pode consumir créditos do provedor."}};
 }catch(error){
  return {status:200,body:{ok:false,provider,state:"failed_observed",errorCategory:category(error),
    durationMs:Date.now()-started,observedAt:new Date().toISOString(),scope:"single-check"}};
 }
}
