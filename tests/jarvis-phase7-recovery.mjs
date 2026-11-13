import assert from "node:assert/strict";
import {probeRecoveryHealth,RECOVERY_TARGETS} from "../modules/jarvis-recovery-probes.js";
import {createRecoveryEngine} from "../modules/jarvis-recovery-engine.js";

const baseUrl="https://ultron-backend.example.test";
let requests=[];
const healthy=async (url,opts)=>{
 requests.push({url,opts});
 return {ok:true,status:200,json:async()=>({
   memory:{ready:true},deviceControl:{ready:true},automations:{ready:true}
 })};
};
const m=await probeRecoveryHealth("memory-degraded",{baseUrl,fetchImpl:healthy});
assert.deepEqual(m,{ready:true,retryable:false,code:"MEMORY_READY"});
const b=await probeRecoveryHealth("bridge-degraded",{baseUrl,fetchImpl:healthy});
assert.deepEqual(b,{ready:true,retryable:false,code:"GATEWAY_READY"});
assert.equal(requests.length,2);
assert.equal(requests[0].url,baseUrl+"/api/health");
assert.equal(requests[0].opts.method,"GET");
assert.equal(requests[0].opts.credentials,"omit");
assert.equal(requests[0].opts.body,undefined,"Never submit a device command");
assert.equal(requests[0].opts.headers.Accept,"application/json");
assert.equal((await probeRecoveryHealth("browser-offline",{baseUrl,fetchImpl:healthy})).code,"UNSUPPORTED_ALERT");
assert.equal(requests.length,2,"Unknown alerts cannot trigger network requests");
assert.deepEqual(Object.keys(RECOVERY_TARGETS).sort(),["bridge-degraded","memory-degraded"]);
assert.equal((await probeRecoveryHealth("memory-degraded",{
  baseUrl:"http://arbitrary-host.test",fetchImpl:healthy})).code,"BACKEND_NOT_CONFIGURED");
assert.equal(requests.length,2,"Do not send requests to a non-HTTPS external host");
assert.equal((await probeRecoveryHealth("bridge-degraded",{baseUrl,fetchImpl:async()=>({
  ok:true,status:200,json:async()=>({deviceControl:{ready:true},automations:{ready:false},bridge:{ready:false}})
})})).code,"GATEWAY_DEGRADED","One feature flag alone is not full gateway readiness");
assert.equal((await probeRecoveryHealth("memory-degraded",{baseUrl,fetchImpl:async()=>({
  ok:true,status:200,json:async()=>({memory:{configured:true,ready:false}})
})})).code,"MEMORY_DEGRADED");
assert.equal((await probeRecoveryHealth("memory-degraded",{baseUrl,fetchImpl:async()=>({
  ok:false,status:503
})})).retryable,true);
assert.equal((await probeRecoveryHealth("memory-degraded",{baseUrl,fetchImpl:async()=>({
  ok:false,status:429
})})).retryable,false,"Rate limits must not retry");
assert.equal((await probeRecoveryHealth("memory-degraded",{baseUrl,fetchImpl:async()=>({
  ok:true,status:200,json:async()=>{throw Error("bad json");}
})})).code,"INVALID_HEALTH_RESPONSE");
assert.equal((await probeRecoveryHealth("bridge-degraded",{baseUrl,fetchImpl:async()=>{throw Error("ECONNRESET");}})).code,
  "NETWORK_UNAVAILABLE");
const aborted=new AbortController();aborted.abort();
assert.equal((await probeRecoveryHealth("memory-degraded",{baseUrl,fetchImpl:healthy,signal:aborted.signal})).code,"ABORTED");
assert.equal(requests.length,2);

let clock=10_000,callCount=0;
const engine=createRecoveryEngine({
 now:()=>clock,pause:async()=>{},cooldownMs:1000,circuitMs:9000,openAfter:3,retryDelayMs:0,
 probe:async()=>{callCount++;return callCount===1?
  {ready:false,retryable:true,code:"NETWORK_UNAVAILABLE"}:
  {ready:true,retryable:false,code:"MEMORY_READY"};}
});
const ok=await engine.run("memory-degraded");
assert.equal(ok.status,"healthy");
assert.equal(ok.verified,true);
assert.equal(ok.attempts,2,"Only one retry allowed");
assert.equal(callCount,2);
const cached=await engine.run("memory-degraded");
assert.equal(cached.skipped,"cooldown");
assert.equal(callCount,2);
assert.equal(engine.snapshot().length,2,"Fixed two-service registry");
assert.equal(engine.status("bridge-degraded").status,"not-checked");
const offline=await engine.run("bridge-degraded",{online:false});
assert.equal(offline.status,"offline");
assert.equal(offline.skipped,"offline");
assert.equal(callCount,2,"Offline must not hit network");

clock+=1001;
const failing=createRecoveryEngine({
 now:()=>clock,pause:async()=>{},cooldownMs:1000,circuitMs:9000,openAfter:3,retryDelayMs:0,
 probe:async()=>{callCount++;return {ready:false,retryable:false,code:"MEMORY_DEGRADED"};}
});
const before=callCount;
for(let i=1;i<=3;i++){
  const result=await failing.run("memory-degraded");
  assert.equal(result.failures,i);
  assert.equal(result.attempts,1,"Non-transient errors never retry");
  if(i<3){
    assert.equal(result.status,"degraded");
    clock=result.nextCheckAt+1;
  }else assert.equal(result.status,"circuit-open");
}
assert.equal(callCount-before,3,"Three separate attempts before breaker");
const noRetry=await failing.run("memory-degraded");
assert.equal(noRetry.skipped,"circuit-open");
assert.equal(callCount-before,3);
clock=noRetry.nextCheckAt+1;
const afterCircuit=await failing.run("memory-degraded");
assert.equal(afterCircuit.status,"circuit-open","Open breaker again if service is still degraded");
assert.equal(callCount-before,4);

let resolver;
const never=new Promise(resolve=>resolver=resolve);
let inflight=0;
const concurrent=createRecoveryEngine({probe:async()=>{inflight++;return never;}});
const first=concurrent.run("bridge-degraded");
const second=concurrent.run("bridge-degraded");
assert.strictEqual(first,second,"Concurrent alerts deduplicated");
assert.equal(inflight,1);
assert.equal(concurrent.inFlight,1);
assert.equal(concurrent.cancelAll(),1,"P0 cancels only pending read-only probes");
resolver({ready:true,retryable:false,code:"GATEWAY_READY"});
const stopped=await first;
assert.equal(stopped.status,"cancelled");
assert.equal(stopped.verified,false,"A completed response after P0 must not be reported as recovered");
assert.equal(concurrent.inFlight,0);
assert.equal((await concurrent.run("device.command")).status,"unsupported");
assert.equal(inflight,1,"No arbitrary command can be run as recovery");
const snapshot=concurrent.snapshot();
snapshot[0].status="healthy";
assert.notEqual(concurrent.snapshot()[0].status,"healthy","Snapshots are defensive copies");
console.log("PHASE VII PASS: fixed GET health, bounded retry, backoff, circuit, offline and P0");
