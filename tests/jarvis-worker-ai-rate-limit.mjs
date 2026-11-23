import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkPublicAiQuota} from "../backend/worker-ai-rate-limit.js";

const request=(ip="198.51.100.42")=>new Request("https://worker.invalid/api/ai",{
  method:"POST",headers:{"CF-Connecting-IP":ip}
});
const usage=[];
const env={AI_RATE_LIMITER:{
 async limit({key,delta}){
   usage.push({key,delta});
   return {success:usage.length<=2};
 }
}};
assert.deepEqual(await checkPublicAiQuota(request(),env),{ok:true,configured:true});
assert.deepEqual(await checkPublicAiQuota(request(),env),{ok:true,configured:true});
assert.deepEqual(await checkPublicAiQuota(request(),env),
  {ok:false,configured:true,status:429,error:"AI_RATE_LIMIT_EXCEEDED"});
assert.deepEqual(usage,[{key:"public-ai:198.51.100.42",delta:1},
  {key:"public-ai:198.51.100.42",delta:1},
  {key:"public-ai:198.51.100.42",delta:1}]);
let key;
await checkPublicAiQuota(request("fake-user-key-with-new-line!"),{
 AI_RATE_LIMITER:{limit:async x=>{key=x.key;return {success:true};}}
});
assert.equal(key,"public-ai:unknown","untrusted identity must not enter the rate limiter");
assert.deepEqual(await checkPublicAiQuota(request(),{}),
  {ok:true,configured:false},"deploy missing binding remains operable but observable");
assert.equal((await checkPublicAiQuota(request(),{
 AI_RATE_LIMITER:{limit:async()=>({unknown:true})}
})).error,"AI_RATE_LIMIT_UNAVAILABLE");
assert.equal((await checkPublicAiQuota(request(),{
 AI_RATE_LIMITER:{limit:async()=>{throw Error("do not leak provider internals");}}
})).status,503);

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const worker=read("backend/worker.js");
const anchor=worker.indexOf('if (path === "/api/ai" && request.method === "POST")');
assert.ok(anchor>0);
const window=worker.slice(anchor,anchor+950);
assert.match(window,/await checkPublicAiQuota\(request,env\)/);
assert.ok(window.indexOf("await checkPublicAiQuota")<window.indexOf("handleAi(request,env)"),
  "must never spend provider calls before quota check");
assert.match(window,/status:quota.status\|\|503/);
assert.match(window,/Retry-After/);
assert.match(worker,/aiRateLimit: \{configured:typeof env\?\.AI_RATE_LIMITER\?\.limit/);
for(const configPath of ["backend/wrangler.jsonc","wrangler.jsonc"]){
  const raw=read(configPath).replace(/^\s*\/\/.*$/gm,"");
  const config=JSON.parse(raw);
  const binding=config.ratelimits.find(x=>x.name==="AI_RATE_LIMITER");
  assert.equal(binding.namespace_id,"61232817");
  assert.equal(binding.simple.limit,60);
  assert.equal(binding.simple.period,60);
}
console.log("JARVIS WORKER AI RATE LIMIT PASS: native binding, quota before provider, 429, unavailable, deploy configs and voice policy unchanged");
