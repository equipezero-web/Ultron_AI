// A single observed Mistral 429 can represent an exhausted workspace spending
// cap, not just transient per-second traffic. Prevent repeated paid API calls
// from the same Worker isolate while healthy fallbacks remain available.
// No credentials, prompts, or response bodies are retained.
export function createMistral429Gate({now=Date.now,cooldownMs=15*60*1000}={}){
 let until=0;
 const bounded=Math.min(60*60*1000,Math.max(60*1000,cooldownMs));
 return {
  isCooling(){return until>now();},
  observe(error){
   if(Number(error?.status)!==429)return false;
   const retryMs=Number(error?.retryAfterSeconds)*1000;
   const interval=Number.isFinite(retryMs)&&retryMs>0
    ?Math.min(60*60*1000,Math.max(bounded,retryMs)):bounded;
   until=Math.max(until,now()+interval);
   return true;
  },
  clear(){until=0;}
 };
}
export const mistral429Gate=createMistral429Gate();
