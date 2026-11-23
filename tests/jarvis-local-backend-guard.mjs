import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {allowLocalOrigin,requireSafeLocalBind,tokenMatches,createLocalApiGuard}
  from "../backend/local-api-guard.js";

assert.equal(allowLocalOrigin("https://equipezero-web.github.io"),true);
for(const origin of ["http://localhost:3000","http://127.0.0.1:5173","http://[::1]:8080"])
  assert.equal(allowLocalOrigin(origin),true);
for(const origin of ["https://attacker.github.io","https://fakeequipezero-web.github.io",
  "null","file://","https://attacker.invalid","http://192.168.1.5:3000","*"]){
  assert.equal(allowLocalOrigin(origin),false,origin+" must not be implicitly trusted");
}
assert.equal(allowLocalOrigin("https://example.invalid",{extra:"https://example.invalid"}),true);
assert.equal(allowLocalOrigin("http://attacker.invalid",{extra:"http://attacker.invalid"}),false);
assert.equal(allowLocalOrigin("https://other.invalid",{extra:"https://example.invalid"}),false);
assert.deepEqual(requireSafeLocalBind(undefined,undefined),
  {host:"127.0.0.1",networkExposed:false});
assert.throws(()=>requireSafeLocalBind("0.0.0.0",""),/NETWORK_BIND_REQUIRES_LOCAL_API_TOKEN/);
assert.throws(()=>requireSafeLocalBind("192.168.1.10","a".repeat(20)),
  /NETWORK_BIND_REQUIRES_LOCAL_API_TOKEN/);
const secret="demo-safe-local-token-".repeat(2);
assert.deepEqual(requireSafeLocalBind("0.0.0.0",secret),
  {host:"0.0.0.0",networkExposed:true});
assert.equal(tokenMatches("Bearer "+secret,secret),true);
assert.equal(tokenMatches("Bearer "+secret.slice(1),secret),false);
assert.equal(tokenMatches("Bearer "+secret+"a",secret),false);
assert.equal(tokenMatches("Basic "+secret,secret),false);

let time=500_000;
const guard=createLocalApiGuard({
 now:()=>time,windowMs:60000,limits:{"/api/ai":2,"/api/vision/analyze":1},
 networkExposed:true,networkToken:secret
});
async function check({path="/api/ai",origin="https://equipezero-web.github.io",
  ip="127.0.0.1",method="POST",auth="Bearer "+secret,
  forwarded="10.0.0.9"}={}){
 const out={next:false,status:200,headers:{},body:null};
 const res={
   set(name,value){out.headers[name]=value;return this;},
   status(code){out.status=code;return this;},
   json(body){out.body=body;return this;}
 };
 guard({path,method,headers:{origin,authorization:auth,"x-forwarded-for":forwarded},
   socket:{remoteAddress:ip}},res,()=>{out.next=true;});
 return out;
}
const denied=await check({origin:"https://attacker.invalid"});
assert.equal(denied.status,403);
assert.equal(denied.next,false);
assert.equal((await check({auth:"Bearer wrong"})).status,401);
assert.equal((await check({path:"/api/health",auth:""})).next,true,
  "health remains public even in opt-in LAN mode");
const a1=await check();
const a2=await check({forwarded:"10.0.0.10"});
const a3=await check({forwarded:"1.2.3.4"});
assert.equal(a1.next,true);assert.equal(a2.next,true);
assert.equal(a3.status,429,"X-Forwarded-For must not bypass per-socket quota");
assert.equal(a3.headers["Retry-After"],"60");
assert.equal(a2.headers["X-RateLimit-Remaining"],"0");
assert.equal((await check({path:"/api/vision/analyze"})).next,true);
assert.equal((await check({path:"/api/vision/analyze"})).status,429);
assert.equal((await check({path:"/api/ai",ip:"::1"})).next,true,
  "distinct clients receive separate limits");
time+=60001;
assert.equal((await check()).next,true,"quota resets after bounded window");
assert.equal((await check({method:"OPTIONS",auth:""})).next,true,
  "preflight is not charged against provider rate limit");

const server=readFileSync(new URL("../backend/server.js",import.meta.url),"utf8");
assert.match(server,/import \{allowLocalOrigin,createLocalApiGuard,requireSafeLocalBind\}/);
assert.match(server,/app\.use\(createLocalApiGuard\(/);
assert.doesNotMatch(server,/app\.use\(cors\(\)\)/);
assert.match(server,/app\.listen\(PORT,localBind\.host/);
assert.match(server,/app\.post\("\/api\/voice",\(_req,res\)=>res\.status\(503\)/);
assert.doesNotMatch(server,/text-to-speech|elevenLabsTTS\(/);
assert.match(server,/voiceMaintenance: \{mode:"text-only",inputEnabled:false,outputEnabled:false\}/);
console.log("JARVIS LOCAL BACKEND GUARD PASS: CORS allowlist, rate-limits, loopback default, LAN token and voice OFF");
