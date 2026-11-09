import { loadLiveNewsContext } from "./news-context.js";

/**
 * Read-only situation briefing. Live news is only as fresh as the named source:
 * never manufacture current alerts or repeat old stories as breaking news.
 */
const NOW_MAX_AGE = 72 * 60 * 60 * 1000;
const LONG_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_BRIEFING_WAIT_MS = 11200;
const OFFICIAL_INMET = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
const OFFICIAL_ENSO = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.html";
const SC_ALERTS = "https://www.defesacivil.sc.gov.br/alerta/";
const topics = [
  { id:"brasil", label:"Brasil", q:"notícias hoje Brasil principais acontecimentos", count:4, maxAge:NOW_MAX_AGE },
  { id:"santa-catarina", label:"Santa Catarina", q:"notícias hoje Santa Catarina Defesa Civil chuvas temporais ocorrências", count:3, maxAge:LONG_MAX_AGE },
  { id:"clima", label:"Clima e El Niño", q:"notícias recentes El Niño INMET NOAA Brasil previsão clima", count:3, maxAge:LONG_MAX_AGE },
  { id:"mundo", label:"Mundo", q:"notícias hoje mundo internacional acontecimentos", count:3, maxAge:NOW_MAX_AGE }
];
const clean = v=>String(v??"").replace(/\s+/g," ").trim();
const bounded = (v,len)=>clean(v).slice(0,len);
const validUrl = url=>{
  try {
    const u=new URL(url);
    return (u.protocol==="https:"||u.protocol==="http:")?u.href:null;
  } catch {return null;}
};
const withDeadline = async (promise,timeout=MAX_BRIEFING_WAIT_MS)=>{
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Tempo limite")),timeout);})
    ]);
  } finally {clearTimeout(timer);}
};
const shortDate = text=>{
  if(!text)return null;
  const d=new Date(text);
  return Number.isFinite(d.getTime())?d.toISOString():null;
};
const uniqueStories = (articles, now, maxAge, limit)=>{
  const seen=new Set();
  const out=[];
  for(const story of articles||[]){
    const title=bounded(story?.title,180);
    const url=validUrl(story?.url);
    const publishedAt=shortDate(story?.publishedAt);
    if(!title||!url||!publishedAt)continue;
    const age=now-Date.parse(publishedAt);
    if(age>maxAge||age < -30*60*1000)continue;
    const key=title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
    if(seen.has(key))continue;
    seen.add(key);
    out.push({title,url,publishedAt,source:bounded(story?.source||new URL(url).hostname,70)});
  }
  return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,limit);
};
export function normalizeWarnings(data,now=Date.now()){
  if(!data||typeof data!=="object")return [];
  const current=Array.isArray(data.hoje)?data.hoje:[];
  const upcoming=Array.isArray(data.futuro)?data.futuro:[];
  const explicit=Array.isArray(data.alertas)?data.alertas:[];
  const seen=new Set(),results=[];
  for(const [phase,entries] of [["vigente",current],["previsto",upcoming],["informado",explicit]]){
    for(const item of entries){
      const id=bounded(item?.idunico||item?.id||item?.codigo||JSON.stringify([item?.descricao,item?.data_inicio,item?.severidade]),160);
      if(seen.has(id))continue;
      seen.add(id);
      const title=bounded(item?.descricao||item?.evento||item?.tipo||"",120);
      const severity=bounded(item?.severidade||"",40);
      if(!title||!severity)continue;
      // Never label a warning as currently active when its end time has passed.
      const validUntil=shortDate(item?.data_fim||item?.fim);
      if(validUntil&&Date.parse(validUntil)<now)continue;
      const states=Array.isArray(item?.estados)?item.estados.map(String):
        typeof item?.estados==="string"?item.estados.split(/[;,|\s]+/):[];
      const regions=states.map(v=>v.toUpperCase().trim()).filter(v=>/^[A-Z]{2}$/.test(v));
      const statePriority=regions.includes("PE")||regions.includes("SC")?3:0;
      const risk=severity.toLowerCase().includes("grande perigo")?3:severity.toLowerCase()==="perigo"?2:1;
      results.push({
        id,title,severity,phase,regions:regions.slice(0,12),
        startsAt:shortDate(item?.data_inicio||item?.inicio),
        endsAt:validUntil,
        source:"INMET",
        url:"https://avisos.inmet.gov.br/",
        rank:risk+statePriority
      });
    }
  }
  return results.sort((a,b)=>b.rank-a.rank).slice(0,6).map(({rank,...v})=>v);
}
function htmlText(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#39;/g,"'")
    .replace(/\s+/g," ").trim();
}
export function parseEnsoBulletin(html) {
  const cleanText=htmlText(html);
  const status=cleanText.match(/ENSO Alert System Status:\s*(El Niño Advisory|La Niña Advisory|El Niño Watch|La Niña Watch|Not Active)/i)?.[1];
  const issued=cleanText.match(/(?:CLIMATE PREDICTION CENTER\/NCEP\/NWS)\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1]||null;
  const synopsis=cleanText.match(/Synopsis:\s*([\s\S]{15,400}?)(?:\s+El Niño strengthened|\s+Most Niño indices|\s+The equatorial|\s+Enhanced convection|$)/i)?.[1]||null;
  if(!status)return null;
  return {
    status:bounded(status,45),issued:issued?bounded(issued,35):null,
    synopsis:synopsis?bounded(synopsis,250):null,
    source:"NOAA / Climate Prediction Center",url:OFFICIAL_ENSO,
    // This is a periodic climate bulletin, NOT an emergency alert.
    kind:"monthly-climate-bulletin"
  };
}
async function fetchOfficial(url,{asJson=false,timeout=4900}={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeout);
  try {
    const response=await fetch(url,{signal:ctrl.signal,headers:{
      "Accept":asJson?"application/json":"text/html",
      "User-Agent":"UltronAI-NewsBriefing/1.0 (source verification)"
    }});
    if(!response.ok)throw new Error("HTTP "+response.status);
    return asJson?response.json():response.text();
  }finally{clearTimeout(timer);}
}
const topicLoad=async(top,now)=>{
  try {
    const state=await withDeadline(loadLiveNewsContext(top.q,{limit:Math.max(7,top.count*2)}),9200);
    return {
      id:top.id,label:top.label,
      articles:uniqueStories(state?.articles,now,top.maxAge,top.count),
      checked:true,error:state?.error?bounded(state.error,120):null
    };
  } catch(error) {
    return {id:top.id,label:top.label,articles:[],checked:false,error:bounded(error?.message,120)};
  }
};
export async function createWorldBriefing({now=Date.now()}={}) {
  const [topicResults,alertResult,ensoResult]=await Promise.all([
    Promise.all(topics.map(topic=>topicLoad(topic,now))),
    withDeadline(fetchOfficial(OFFICIAL_INMET,{asJson:true}),6000)
      .then(data=>({checked:true,warnings:normalizeWarnings(data,now),error:null}))
      .catch(error=>({checked:false,warnings:[],error:bounded(error?.message,120)})),
    withDeadline(fetchOfficial(OFFICIAL_ENSO),6000)
      .then(html=>({checked:true,bulletin:parseEnsoBulletin(html),error:null}))
      .catch(error=>({checked:false,bulletin:null,error:bounded(error?.message,120)}))
  ]);
  const result={
    ok:true,version:"1.0",fetchedAt:new Date(now).toISOString(),
    priority:["Brasil","Santa Catarina","Clima e El Niño","Mundo"],
    refreshAfterMinutes:10,
    isLive:true,
    topics:topicResults,
    alerts:alertResult,
    enso:ensoResult,
    officialLinks:[
      {label:"Avisos INMET",url:"https://avisos.inmet.gov.br/"},
      {label:"Defesa Civil SC",url:SC_ALERTS},
      {label:"NOAA / ENSO",url:OFFICIAL_ENSO}
    ]
  };
  result.hasNews=topicResults.some(t=>t.articles.length>0);
  result.partial=!result.hasNews || !alertResult.checked || !ensoResult.checked;
  return result;
}
