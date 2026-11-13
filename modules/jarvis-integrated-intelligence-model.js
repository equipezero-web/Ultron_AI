// J.A.R.V.I.S. XV–XIX: bounded offline-capable decision models.
// Source records are data, never instructions; models never invent event predictions.
const clean=(s,n=180)=>String(s??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const normalize=s=>clean(s,240).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/^(?:jarvis|ultron)[, :.-]+/,"").replace(/[.!?]+$/,"").trim();
const stamp=s=>{const t=Date.parse(String(s??""));return Number.isFinite(t)?t:null;};
const origin=s=>{try{const u=new URL(String(s??""));return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
 !/^(?:localhost|\d+\.\d+\.\d+\.\d+|\[)/i.test(u.hostname)?u.href:null;}catch{return null;}};
const DAY=86400000;
export const OPERATIONAL_MEMORY_TTL=30*DAY;
export const ROUTINE_INTERVAL=15*60000;
export function parseAdvancedCommand(raw){
 const s=normalize(raw);
 const commands={
  "sugestoes proativas":{type:"proactive"},
  "sugestões proativas":{type:"proactive"},
  "status proativo":{type:"proactive"},
  "analisar oportunidades":{type:"proactive"},
  "consultar agentes":{type:"agents"},
  "status dos agentes":{type:"agents"},
  "analise dos agentes":{type:"agents"},
  "memoria operacional":{type:"memory"},
  "status da memoria":{type:"memory"},
  "memorizar preferencia noticias primeiro":{type:"set-preference",value:"news"},
  "memorizar preferencia mapas primeiro":{type:"set-preference",value:"map"},
  "memorizar preferencia prioridades primeiro":{type:"set-preference",value:"priorities"},
  "esquecer preferencia visual":{type:"clear-preference"},
  "apagar memoria operacional":{type:"clear-preference"},
  "gostei da sugestao":{type:"feedback",value:"positive"},
  "nao gostei da sugestao":{type:"feedback",value:"negative"},
  "ativar rotina de monitoramento":{type:"routine-start"},
  "desativar rotina de monitoramento":{type:"routine-stop"},
  "verificar rotina agora":{type:"routine-check"},
  "status da rotina":{type:"routine-status"},
  "mostrar dados reais em 2d":{type:"verified-map",mode:"2d"},
  "mostrar dados reais em 3d":{type:"verified-map",mode:"3d"},
  "visualizacao real 2d":{type:"verified-map",mode:"2d"},
  "visualizacao real 3d":{type:"verified-map",mode:"3d"},
  "simulacao 2d":{type:"no-simulation"},
  "simulacao 3d":{type:"no-simulation"},
  "simular cenario ilustrativo":{type:"no-simulation"},
  "fechar simulacao":{type:"no-simulation"},
  "status da inteligencia integrada":{type:"status"}
 };
 return commands[s]||null;
}
export function verifiedDigest(digest,{now=Date.now()}={}){
 const date=stamp(digest?.generatedAt);
 if(digest?.ok!==true||date===null||date>now+300000||now-date>10*60000||
  !["healthy","partial"].includes(digest?.worldState)&&digest?.archiveState!=="verified"||
  !Array.isArray(digest.items))return {ok:false,reason:"STALE_OR_UNVERIFIED_CONTEXT",items:[]};
 const items=digest.items.filter(x=>{
  const t=stamp(x?.publishedAt),url=origin(x?.url);
  return url&&t!==null&&t<=now+300000&&now-t<=7*DAY&&
   /^[gna]:[\w:./-]{1,160}$/.test(String(x.key||""))&&clean(x.title)&&
   ["cataloged","news","official-alert"].includes(x.type);
 }).slice(0,10).map(x=>({
   key:x.key,title:clean(x.title,180),type:x.type,
   source:clean(x.source,80),url:origin(x.url),
   publishedAt:x.publishedAt,region:clean(x.region,70),
   isNew:x.isNew===true,verifiedLabel:clean(x.verifiedLabel,100),
   ...(x.type==="cataloged"&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)&&
   Math.abs(x.lat)<=90&&Math.abs(x.lng)<=180?{lat:x.lat,lng:x.lng}: {})
 }));
 return {ok:items.length>0,reason:items.length?"VERIFIED":"NO_VALID_RECORDS",items};
}
export function makeProactiveSuggestion(digest,{now=Date.now(),preference="priorities",previousKey=null}={}){
 const state=verifiedDigest(digest,{now});
 if(!state.ok)return {ok:false,reason:state.reason};
 // This is editorial triage, never a severity or impact ranking.
 const choices=state.items.filter(x=>x.isNew);
 const ranked=choices.length?choices:state.items;
 const ordered=preference==="news"?
   [...ranked].sort((a,b)=>Number(b.type==="news")-Number(a.type==="news")):
   preference==="map"?
   [...ranked].sort((a,b)=>Number("lat"in b)-Number("lat"in a)):ranked;
 const item=ordered[0];
 if(!item||previousKey===item.key)return {ok:false,reason:"NO_NEW_SUGGESTION"};
 return {ok:true,key:item.key,title:item.title,source:item.source,url:item.url,
  type:item.type,label:item.isNew?"Novo registro no resumo":"Destaque verificado",
  message:"Sugestão de leitura: "+item.title+" ("+item.source+"). Prioridade editorial, sem inferir risco ou impacto.",
  publishedAt:item.publishedAt};
}
export function readOperationalMemory(raw,{now=Date.now()}={}){
 let obj;try{obj=typeof raw==="string"?JSON.parse(raw):raw;}catch{}
 const t=stamp(obj?.savedAt);
 if(obj?.version!==1||t===null||t>now+300000||now-t>OPERATIONAL_MEMORY_TTL)
  return {version:1,preference:"priorities",feedback:{positive:0,negative:0},savedAt:null,consented:false};
 const allowed=["priorities","news","map"];
 const counts=obj?.feedback||{};
 return {version:1,preference:allowed.includes(obj.preference)?obj.preference:"priorities",
  feedback:{positive:Math.max(0,Math.min(20,Math.trunc(counts.positive)||0)),
  negative:Math.max(0,Math.min(20,Math.trunc(counts.negative)||0))},
  savedAt:new Date(t).toISOString(),consented:obj.consented===true};
}
export function updateOperationalMemory(current,{preference=null,feedback=null,now=Date.now()}={}){
 const old=readOperationalMemory(current,{now});
 if(preference!==null&&!["priorities","news","map"].includes(preference))
  return {ok:false,reason:"INVALID_PREFERENCE"};
 if(feedback!==null&&!["positive","negative"].includes(feedback))
  return {ok:false,reason:"INVALID_FEEDBACK"};
 if(feedback&&!old.consented)return {ok:false,reason:"CONSENT_REQUIRED"};
 return {ok:true,value:{version:1,preference:preference||old.preference,consented:true,
   feedback:{...old.feedback,[feedback]:feedback?Math.min(20,old.feedback[feedback]+1):undefined},
   savedAt:new Date(now).toISOString()}};
}
export function analyzeSpecialists(digest,{now=Date.now(),current=null}={}){
 const state=verifiedDigest(digest,{now});
 if(!state.ok)return {ok:false,reason:state.reason,agents:[]};
 const news=state.items.filter(x=>x.type==="news");
 const geo=state.items.filter(x=>x.type==="cataloged"&&"lat"in x);
 const alerts=state.items.filter(x=>x.type==="official-alert");
 const agents=[
  {id:"editorial",label:"Analista de notícias",count:news.length,evidence:news[0]?.url||null},
  {id:"geospatial",label:"Analista geoespacial",count:geo.length,evidence:geo[0]?.url||null},
  {id:"official-alerts",label:"Verificador de avisos oficiais",count:alerts.length,evidence:alerts[0]?.url||null}
 ];
 return {ok:true,agents,selectedVerified:current?.ok===true&&
  state.items.some(x=>x.key===current.eventKey&&x.url===current.url),
  caveat:"Especialistas locais determinísticos: não são três IAs externas. Contagens não indicam gravidade."};
}
// Only geolocated, attributed, currently verified public observations can
// request the existing Phase X map. No interpolation, prediction or fake values.
export function selectVerifiedGeoSource(digest,current,{now=Date.now()}={}){
 const state=verifiedDigest(digest,{now});
 if(!state.ok||current?.ok!==true||!current.eventKey)
  return {ok:false,reason:"NO_VERIFIED_SELECTED_LOCATION"};
 const item=state.items.find(x=>x.key===current.eventKey&&x.url===current.url&&
  x.type==="cataloged"&&"lat"in x&&"lng"in x&&
  /^(USGS|NASA|GDACS)$/.test(x.source));
 if(!item)return {ok:false,reason:"LOCATION_NOT_IN_VERIFIED_SNAPSHOT"};
 // The map's contextualGeoScene performs a second official-source verification.
 return {ok:true,key:item.key,title:item.title,url:item.url,lat:item.lat,lng:item.lng,
  source:item.source,publishedAt:item.publishedAt,verifiedAt:Date.parse(digest.generatedAt)};
}
