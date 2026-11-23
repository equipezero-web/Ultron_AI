/**
 * Read-only observation of the published Worker (never a synthetic CI source).
 * No credentials, cookies, event payloads, identities, or private endpoints.
 * This diagnostic reports degraded official providers without falsely failing
 * the unit test suite due to a temporary third-party outage.
 */
const TARGET="https://ultron-backend.lucaalves17-20.workers.dev/api/intelligence/global";
const IDS=["usgs","nasa","gdacs"];
const clean=s=>String(s||"").replace(/https?:\/\/\S+/g,"[official-source]")
  .replace(/[\r\n<>]/g," ").trim().slice(0,100);
let response;
try{
 response=await fetch(TARGET,{
  method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
  headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error("HTTP "+response.status);
 const raw=await response.text();
 if(raw.length>2_000_000)throw Error("Response too large");
 const payload=JSON.parse(raw);
 if(payload?.ok!==true||!Array.isArray(payload.sourceStatus))
  throw Error("No verifiable sourceStatus in Worker response");
 const sources=IDS.map(source=>{
  const item=payload.sourceStatus.find(x=>x?.source===source);
  return {
   source,status:item?.ok===true?"verified":"not-confirmed",
   count:item?.ok?Number(item.count)||0:0,
   mode:item?.mode||"unknown",
   ...(item?.ok?{}:{reason:clean(item?.error||"No upstream response"),
    ...(item?.fallbackError?{fallbackReason:clean(item.fallbackError)}:{})})
  };
 });
 const verified=sources.filter(x=>x.status==="verified").length;
 console.log("JARVIS_WORLD_PUBLIC_SOURCE_PROBE "+JSON.stringify({
  checkedAt:payload.checkedAt||null,ageMinutes:payload.ageMinutes??null,
  stored:payload.persistence==="cloudflare-d1",
  stale:payload.stale===true,verified,total:3,
  sources,contractValid:true,
  note:"Published, read-only source state; provider failures do not imply hazards or risk"
 }));
}catch(error){
 console.log("JARVIS_WORLD_PUBLIC_SOURCE_PROBE "+JSON.stringify({
  contractValid:false,error:clean(error?.message||error),
  note:"Could not observe production, do not assume all feeds are online."
 }));
 process.exitCode=1;
}


// Also inspect the shape of NASA's CURRENT PUBLIC feed, not event content.
// A live 200 with zero accepted events could mean there are no eligible
// events or that a schema/date/category change filtered all features.
try{
 const source="https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=7&limit=80";
 const response=await fetch(source,{redirect:"error",cache:"no-store",
  headers:{Accept:"application/geo+json, application/json"},
  signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error("HTTP "+response.status);
 const text=await response.text();
 if(text.length>2_000_000)throw Error("NASA GeoJSON exceeds probe limit");
 const json=JSON.parse(text);
 const entries=Array.isArray(json?.features)?json.features:[];
 const categories=new Set(),dated=entries.filter(x=>Boolean(x?.properties?.date)).length;
 for(const event of entries.slice(0,80)){
  for(const category of event?.properties?.categories||[]){
   const id=typeof category==="string"?category:category?.id||"";
   if(typeof id==="string"&&id.length<45)categories.add(id);
  }
 }
 const {parseEonetEvents}=await import("../backend/global-intelligence-monitor.js");
 const accepted=parseEonetEvents(json,{now:Date.now()});
 console.log("JARVIS_EONET_FEED_SHAPE "+JSON.stringify({
  geojson:json?.type==="FeatureCollection",
  receivedCount:entries.length,validDateFieldCount:dated,
  categories:[...categories].slice(0,15).sort(),
  acceptedCount:accepted?.length??null,
  note:"Read-only schema summary; no coordinates, titles, URLs or personal data logged"
 }));
}catch(error){
 console.log("JARVIS_EONET_FEED_SHAPE "+JSON.stringify({
  status:"unavailable",reason:clean(error?.message||error),
  note:"A failed live probe is NOT proof of missing events"
 }));
}
