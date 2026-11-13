// Phase VII: fixed, read-only health endpoints. No device commands, auth
// tokens, repairs, mutating requests or URLs provided by alert payloads.
export const RECOVERY_TARGETS=Object.freeze({
  "memory-degraded":Object.freeze({name:"Memória D1",check:"memory"}),
  "bridge-degraded":Object.freeze({name:"Gateway de dispositivos",check:"bridge"})
});

export async function probeRecoveryHealth(code,{
  baseUrl,fetchImpl=fetch,signal=null,timeoutMs=6000
}={}){
  const target=RECOVERY_TARGETS[code];
  if(!target)return {ready:false,retryable:false,code:"UNSUPPORTED_ALERT"};
  const base=String(baseUrl||"").replace(/\/+$/,"");
  let url;
  try {
    url=new URL(base+"/api/health");
    if(!["https:","http:"].includes(url.protocol) ||
      (url.protocol==="http:"&&!["localhost","127.0.0.1","[::1]"].includes(url.hostname)) ||
      url.pathname!=="/api/health" || url.search || url.hash)throw new Error("invalid");
  } catch {return {ready:false,retryable:false,code:"BACKEND_NOT_CONFIGURED"};}
  if(signal?.aborted)return {ready:false,retryable:false,code:"ABORTED"};
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(abort,Math.max(100,Math.min(10000,timeoutMs)));
  try{
    const response=await fetchImpl(url.toString(),{
      method:"GET",headers:{Accept:"application/json"},
      cache:"no-store",credentials:"omit",signal:controller.signal
    });
    if(!response?.ok)return {
      ready:false,retryable:response?.status===408||response?.status===502||
        response?.status===503||response?.status===504,
      code:response?.status===429?"PROVIDER_RATE_LIMIT":
        response?.status>=500?"BACKEND_HTTP_5XX":"BACKEND_HTTP_4XX"
    };
    let data;
    try{data=await response.json();}catch{return {ready:false,retryable:false,code:"INVALID_HEALTH_RESPONSE"};}
    if(!data||typeof data!=="object")return {ready:false,retryable:false,code:"INVALID_HEALTH_RESPONSE"};
    if(target.check==="memory"){
      if(data.memory?.ready===true)return {ready:true,retryable:false,code:"MEMORY_READY"};
      return {ready:false,retryable:false,code:"MEMORY_DEGRADED"};
    }
    // Gateway availability NEVER means a paired device or LG TV is online.
    if(data.deviceControl?.ready===true&&data.automations?.ready===true)
      return {ready:true,retryable:false,code:"GATEWAY_READY"};
    if(data.bridge?.ready===true)
      return {ready:true,retryable:false,code:"BRIDGE_GATEWAY_READY"};
    return {ready:false,retryable:false,code:"GATEWAY_DEGRADED"};
  }catch{
    return {ready:false,retryable:!signal?.aborted,code:signal?.aborted?"ABORTED":"NETWORK_UNAVAILABLE"};
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener("abort",abort);
  }
}
