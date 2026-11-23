/**
 * Native Cloudflare Workers Rate Limiting binding for expensive public AI.
 * Approximate per colo, not a global strict quota; never an auth substitute.
 * Production binding AI_RATE_LIMITER is configured in wrangler.jsonc.
 */
const VALID_CF_IP=/^[0-9a-fA-F:.]{3,64}$/;

export async function checkPublicAiQuota(request,env){
  const limiter=env?.AI_RATE_LIMITER;
  if(typeof limiter?.limit!=="function"){
    // Preserve current service if a manual deployment omitted the binding;
    // production configuration and CI must make this visible as an audit gap.
    return {ok:true,configured:false};
  }
  const rawIp=String(request?.headers?.get?.("CF-Connecting-IP")||"").trim();
  const actor=VALID_CF_IP.test(rawIp)?rawIp:"unknown";
  try{
    const answer=await limiter.limit({key:"public-ai:"+actor,delta:1});
    if(answer?.success===true)return {ok:true,configured:true};
    if(answer?.success===false)
      return {ok:false,configured:true,status:429,error:"AI_RATE_LIMIT_EXCEEDED"};
    return {ok:false,configured:true,status:503,error:"AI_RATE_LIMIT_UNAVAILABLE"};
  }catch{
    return {ok:false,configured:true,status:503,error:"AI_RATE_LIMIT_UNAVAILABLE"};
  }
}
