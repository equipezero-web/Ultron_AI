import {RECOVERY_TARGETS} from "./jarvis-recovery-probes.js";

// Phase VII: a bounded read-only verifier. It never replays external actions.
const DEFAULT_COOLDOWN=90_000;
const DEFAULT_CIRCUIT=10*60_000;
const NAMES=Object.keys(RECOVERY_TARGETS);
const MAX_ATTEMPTS=2;
const safeRecord=(r)=>({
  code:r.code,service:r.service,status:r.status,verified:r.verified,
  reason:r.reason,attempts:r.attempts,failures:r.failures,
  checkedAt:r.checkedAt,nextCheckAt:r.nextCheckAt
});
function waitWithAbort(ms,signal){
  if(signal?.aborted)return Promise.resolve();
  return new Promise(resolve=>{
    const finish=()=>{clearTimeout(timer);signal?.removeEventListener("abort",finish);resolve();};
    const timer=setTimeout(finish,ms);
    signal?.addEventListener("abort",finish,{once:true});
  });
}
export function createRecoveryEngine({
  probe,now=()=>Date.now(),pause=waitWithAbort,
  cooldownMs=DEFAULT_COOLDOWN,circuitMs=DEFAULT_CIRCUIT,retryDelayMs=500,
  openAfter=3
}={}){
  if(typeof probe!=="function")throw new TypeError("Recovery requires a read-only health probe.");
  const records=new Map(NAMES.map(code=>[code,{
    code,service:RECOVERY_TARGETS[code].name,status:"not-checked",
    verified:false,reason:"NOT_CHECKED",attempts:0,failures:0,
    checkedAt:null,nextCheckAt:null,circuitUntil:0,cooldownUntil:0
  }]));
  const active=new Map();
  const snapshot=()=>NAMES.map(code=>safeRecord(records.get(code)));
  const status=code=>records.has(code)?safeRecord(records.get(code)):null;
  function cancelAll(){
    for(const item of active.values())item.controller.abort();
    return active.size;
  }
  function run(code,{online=true}={}){
    if(!records.has(code))return Promise.resolve({
      ok:false,verified:false,status:"unsupported",reason:"UNSUPPORTED_ALERT"
    });
    const existing=active.get(code);
    if(existing)return existing.promise;
    const r=records.get(code),timestamp=now();
    if(!online){
      r.status="offline";r.reason="BROWSER_OFFLINE";r.verified=false;
      r.nextCheckAt=null;r.attempts=0;
      return Promise.resolve({ok:false,...safeRecord(r),skipped:"offline"});
    }
    if(r.circuitUntil>timestamp){
      r.status="circuit-open";r.nextCheckAt=r.circuitUntil;
      return Promise.resolve({ok:false,...safeRecord(r),skipped:"circuit-open"});
    }
    if(r.cooldownUntil>timestamp){
      // A recent successful read is not reinterpreted as a fresh recovery.
      return Promise.resolve({ok:r.verified,...safeRecord(r),skipped:"cooldown"});
    }
    const controller=new AbortController();
    const task=(async()=>{
      let observation={ready:false,retryable:false,code:"NOT_CHECKED"},attempts=0;
      r.status="checking";r.verified=false;
      for(let i=0;i<MAX_ATTEMPTS;i+=1){
        if(controller.signal.aborted)break;
        attempts+=1;
        try{
          observation=await probe(code,{signal:controller.signal});
        }catch{
          observation={ready:false,retryable:false,code:"PROBE_ERROR"};
        }
        if(controller.signal.aborted)break;
        if(observation?.ready===true)break;
        if(observation?.retryable!==true || i===MAX_ATTEMPTS-1)break;
        await pause(retryDelayMs,controller.signal);
      }
      r.attempts=attempts;r.checkedAt=now();
      if(controller.signal.aborted){
        r.status="cancelled";r.reason="OPERATOR_STOP";r.verified=false;
        r.nextCheckAt=null;r.cooldownUntil=0;
        return {ok:false,...safeRecord(r)};
      }
      r.reason=String(observation?.code||"HEALTH_NOT_VERIFIED").slice(0,64);
      r.verified=observation?.ready===true;
      if(r.verified){
        r.status="healthy";r.failures=0;r.circuitUntil=0;
        r.cooldownUntil=now()+cooldownMs;r.nextCheckAt=r.cooldownUntil;
      }else{
        r.failures+=1;
        r.cooldownUntil=now()+cooldownMs*Math.min(4,2**(r.failures-1));
        r.circuitUntil=r.failures>=openAfter?now()+circuitMs:0;
        r.nextCheckAt=Math.max(r.cooldownUntil,r.circuitUntil);
        r.status=r.circuitUntil?"circuit-open":"degraded";
      }
      return {ok:r.verified,...safeRecord(r)};
    })();
    active.set(code,{controller,promise:task});
    void task.finally(()=>{if(active.get(code)?.promise===task)active.delete(code);});
    return task;
  }
  async function checkAll({online=true}={}){
    return Promise.all(NAMES.map(code=>run(code,{online})));
  }
  return {run,checkAll,status,snapshot,cancelAll,
    get inFlight(){return active.size;},
    get targetCodes(){return [...NAMES];}
  };
}
