// Phase VIII: an observable read-only continuity digest from existing D1 snapshots.
// This code never starts collectors, issues device commands, or predicts risk.
const HOUR=3600000;
const SAFE_SOURCE_HOSTS=Object.freeze({
  usgs:["earthquake.usgs.gov"],
  nasa:["eonet.gsfc.nasa.gov"],
  gdacs:["gdacs.org","www.gdacs.org"]
});
const safe=(v,n=170)=>String(v??"").replace(/[\r\n<>]/g," ").replace(/\s+/g," ").trim().slice(0,n);
function ageInMinutes(value,now){
  const t=Date.parse(String(value??""));
  if(!Number.isFinite(t)||t>now+5*60_000)return null;
  return Math.max(0,Math.round((now-t)/60000));
}
function safeSourceLink(raw,source){
  try {
    const u=new URL(raw);
    return u.protocol==="https:"&&SAFE_SOURCE_HOSTS[source]?.includes(u.hostname)?u.toString():null;
  } catch{return null;}
}
const SOURCE_KEYS=["usgs","nasa","gdacs"];
export function buildContinuityStatus({
  globalReport=null,weatherReport=null,now=Date.now()
}={}){
  if(!Number.isFinite(now))throw new Error("Horário inválido");
  const globalAge=ageInMinutes(globalReport?.checkedAt,now);
  const globalAvailable=globalReport?.ok===true&&Array.isArray(globalReport.events)&&
    Array.isArray(globalReport.sourceStatus)&&globalAge!==null;
  const globalFresh=globalAvailable&&globalAge<=120;
  const sources=SOURCE_KEYS.map(source=>{
    const item=globalAvailable?globalReport.sourceStatus.find(s=>s?.source===source):null;
    return {name:source.toUpperCase(),available:globalFresh&&item?.ok===true,
      reported:globalAvailable&&item?.ok===true,
      status:!globalAvailable?"unavailable":!globalFresh?"stale":item?.ok===true?"ready":"failed"};
  });
  const valid=globalAvailable?globalReport.events.filter(event=>
    event&&SOURCE_KEYS.includes(event.source)&&
    globalReport.sourceStatus.some(s=>s?.source===event.source&&s.ok===true)&&
    typeof event.id==="string"&&typeof event.title==="string"&&
    typeof event.kind==="string"&&safeSourceLink(event.url,event.source)&&
    Number.isFinite(event.lat)&&Number.isFinite(event.lng)&&
    Math.abs(event.lat)<=90&&Math.abs(event.lng)<=180&&
    ageInMinutes(event.eventAt,now)!==null&&ageInMinutes(event.eventAt,now)<=7*24*60
  ):[];
  const distinct=new Set();
  const events=valid.sort((a,b)=>
    Number(Boolean(b.nearBrazil))-Number(Boolean(a.nearBrazil))||
    (Number(b.priority)||0)-(Number(a.priority)||0)||
    Date.parse(b.eventAt)-Date.parse(a.eventAt)
  ).filter(e=>{if(distinct.has(e.id))return false;distinct.add(e.id);return true;})
   .slice(0,6).map(e=>({
     id:safe(e.id,90),kind:safe(e.kind,35),title:safe(e.title,170),
     source:e.source.toUpperCase(),eventAt:e.eventAt,
     url:safeSourceLink(e.url,e.source),nearBrazil:e.nearBrazil===true,
     alertLevel:e.source==="gdacs"&&["red","orange","green"].includes(e.gdacsAlert)
       ?e.gdacsAlert:null
   }));
  const weatherAge=ageInMinutes(weatherReport?.checkedAt,now);
  const weatherAvailable=weatherReport?.ok===true&&Array.isArray(weatherReport.regions)&&weatherAge!==null;
  const weatherFresh=weatherAvailable&&weatherAge<=240;
  const sample=weatherAvailable?weatherReport.regions.filter(r=>
    typeof r?.region==="string"&&
    typeof r?.name==="string"&&typeof r?.temperatureC==="number"&&
    Number.isFinite(r.temperatureC)&&r.temperatureC>=-100&&r.temperatureC<=65&&
    Number.isFinite(r.rainChancePercent)&&r.rainChancePercent>=0&&r.rainChancePercent<=100&&
    r.source==="Open-Meteo.com"&&ageInMinutes(r.checkedAt,now)!==null&&
    ageInMinutes(r.checkedAt,now)<=240
  ):[];
  const weatherItems=sample.sort((a,b)=>Number(b.country==="BR")-Number(a.country==="BR")||
    a.name.localeCompare(b.name)).slice(0,6).map(r=>({
      region:safe(r.region,48),name:safe(r.name,72),country:safe(r.country,3),
      temperatureC:r.temperatureC,rainChancePercent:r.rainChancePercent,checkedAt:r.checkedAt
    }));
  const worldState=!globalAvailable?"unavailable":!globalFresh?"stale":
    sources.every(x=>x.status==="ready")?"healthy":"partial";
  const weatherState=!weatherAvailable?"unavailable":!weatherFresh?"stale":
    weatherItems.length>=6?"healthy":"partial";
  return {
    ok:true,version:"1.0",generatedAt:new Date(now).toISOString(),
    collection:"read-only-persisted",coverage:"Amostras e eventos catalogados; não é vigilância integral do planeta.",
    world:{
      state:worldState,checkedAt:globalAvailable?globalReport.checkedAt:null,
      ageMinutes:globalAge,cadenceHours:1,
      sources,sourceCount:sources.filter(s=>s.available).length,
      eventCount:valid.length,highlights:events,
      brazilProximityCount:valid.filter(e=>e.nearBrazil===true).length,
      note:"Próximo ao Brasil significa caixa geográfica aproximada; não afirma impacto em território brasileiro. A ordem dos destaques não é previsão de risco."
    },
    weather:{
      state:weatherState,checkedAt:weatherAvailable?weatherReport.checkedAt:null,
      ageMinutes:weatherAge,cadenceHours:3,
      expectedRegions:6,sampledRegions:weatherItems.length,highlights:weatherItems,
      note:"Previsões numéricas amostrais da Open-Meteo. Não são sensores em tempo real ou alertas oficiais."
    },
    healthy:worldState==="healthy"&&weatherState==="healthy",
    degraded:["stale","unavailable"].includes(worldState)||
      ["stale","unavailable"].includes(weatherState)||
      worldState==="partial"||weatherState==="partial",
    disclaimer:"A última coleta confirma apenas a disponibilidade daquela amostra. Não substitui INMET, Defesa Civil ou outras fontes oficiais."
  };
}
