import assert from "node:assert/strict";
import {persistProviderAttempts,loadPersistentProviderDiagnostics} from "../backend/provider-diagnostics-db.js";
import {providerDiagnosticsAnswer,createProviderDiagnostics} from "../backend/provider-diagnostics.js";

const calls=[];
const events=[];
const db={prepare(sql){
 const stmt={bind(...params){this.params=params;return this;},
  async run(){
   calls.push({sql,params:this.params||[]});
   if(sql.startsWith("INSERT INTO"))events.push({
     id:events.length+1,provider:this.params[0],outcome:this.params[1],
     duration_ms:this.params[2],observed_at_ms:this.params[3]});
   if(sql.startsWith("DELETE FROM")){
     const threshold=this.params[0];
     for(let i=events.length-1;i>=0;i--)if(events[i].observed_at_ms<threshold)events.splice(i,1);
   }
   return {success:true};
  },
  async all(){
   const cutoff=this.params[0];
   const visible=events.filter(e=>e.observed_at_ms>=cutoff);
   const providers=[...new Set(visible.map(e=>e.provider))];
   return {results:providers.map(provider=>{
    const subset=visible.filter(e=>e.provider===provider);
    const successful=subset.filter(e=>e.outcome==="success");
    const durations=successful.map(e=>e.duration_ms).filter(Number.isFinite);
    return {provider,successes:successful.length,failures:subset.length-successful.length,
      averageSuccessMs:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null,
      lastObservedMs:Math.max(...subset.map(e=>e.observed_at_ms)),
      lastOutcome:subset.at(-1).outcome};
   })};
  }};
 return stmt;
}};
const first={ULTRON_DB:db},second={ULTRON_DB:db};
let now=1000000;
const observed=[
 {provider:"gemini",status:"failed",durationMs:83,error:"private-error-body",prompt:"very-private"},
 {provider:"groq",status:"success",durationMs:45,model:"private-model",text:"private-answer"},
 {provider:"openrouter",status:"skipped",reason:"not-configured"},
 {provider:"unknown",status:"failed"}
];
const saved=await persistProviderAttempts(first,observed,{now:()=>now});
assert.deepEqual(saved,{ok:true,recorded:2});
assert.equal(events.length,2);
assert.deepEqual(events.map(e=>e.provider),["gemini","groq"]);
assert.equal(JSON.stringify(calls).includes("private-"),false);
assert.equal(JSON.stringify(calls).includes("very-private"),false);
let result=await loadPersistentProviderDiagnostics(second,{now:()=>now});
assert.equal(result.ok,true);
assert.equal(result.rows.length,2);
const status=providerDiagnosticsAnswer(null,createProviderDiagnostics({now:()=>now}),result);
assert.equal(status.providerDiagnostics.scope,"d1-shared");
assert.match(status.text,/registros compartilhados no Cloudflare D1/);
assert.match(status.text,/groq: sucesso observado/);
assert.match(status.text,/gemini: falha observada/);
assert.equal(status.providerDiagnostics.providers.find(r=>r.provider==="groq").averageSuccessMs,45);
now+=15*60*1000+1;
result=await loadPersistentProviderDiagnostics(second,{now:()=>now});
assert.deepEqual(result.rows,[]);
assert.equal((await persistProviderAttempts(first,[{provider:"groq",status:"success",durationMs:60}],{now:()=>now})).recorded,1);
assert.equal(events.length,1);
assert.equal((await loadPersistentProviderDiagnostics({},{})).reason,"d1-unavailable");
const fallback=providerDiagnosticsAnswer(null,createProviderDiagnostics({now:()=>now}),{ok:false,reason:"d1-unavailable"});
assert.equal(fallback.providerDiagnostics.scope,"worker-isolate");
assert.match(fallback.text,/histórico persistente não está disponível/);
console.log("STAGE B D1 DIAGNOSTICS PASS: shared observations, expiration, no sensitive payload, honest fallback");
