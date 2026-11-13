// Phase IX: source-first editorial prioritization, NOT hazard prediction.
// Inputs: existing D1 continuity and 24-hour news snapshots only.
const DAY=86400000,HOUR=3600000,MAX_ITEMS=6,MAX_LEDGER=120;
const clean=(v,n=170)=>String(v??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const epoch=v=>{const n=Date.parse(String(v??""));return Number.isFinite(n)?n:null;};
function recent(value,now,maxAge){
 const t=epoch(value);
 return t!==null&&now-t>=-300000&&now-t<=maxAge;
}
function link(raw,{host=null}={}){
 try{
  const u=new URL(String(raw??""));
  if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
  if(/^(?:localhost|\d+\.\d+\.\d+\.\d+|\[.+\])$/i.test(u.hostname))return null;
  if(host&&u.hostname!==host)return null;
  return u.href;
 }catch{return null;}
}
function trustedEventLink(item){
 const u=link(item?.url);if(!u)return null;
 const host=new URL(u).hostname;
 const expected={USGS:"earthquake.usgs.gov",NASA:"eonet.gsfc.nasa.gov",GDACS:"www.gdacs.org"};
 return host===expected[item?.source]||(item?.source==="GDACS"&&host==="gdacs.org")?u:null;
}
const keyId=s=>clean(s,150).replace(/[^\w:./-]/g,"_");
export function readPriorityLedger(text,{now=Date.now()}={}){
 let raw;
 try{raw=typeof text==="string"?JSON.parse(text):text;}catch{}
 const previous=epoch(raw?.lastReviewedAt);
 const lastReviewedAt=previous!==null&&previous<=now&&now-previous<=7*DAY?
  new Date(previous).toISOString():null;
 const items=[],seen=new Set();
 for(const item of Array.isArray(raw?.items)?raw.items.slice(-300):[]){
  if(typeof item?.key!=="string"||item.key.length>160||!/^[gna]:[\w:./-]+$/.test(item.key))continue;
  const timestamp=epoch(item.at);
  if(timestamp===null||timestamp>now||now-timestamp>7*DAY||seen.has(item.key))continue;
  seen.add(item.key);items.push({key:item.key,at:new Date(timestamp).toISOString()});
 }
 return {version:1,lastReviewedAt,items:items.slice(-MAX_LEDGER)};
}
export function markPriorityReviewed(ledger,digest,{now=Date.now()}={}){
 const cleanLedger=readPriorityLedger(ledger,{now});
 if(digest?.ok!==true||!Array.isArray(digest.items) || !digest.items.length){
  return cleanLedger;
 }
 const known=new Map(cleanLedger.items.map(item=>[item.key,item]));
 for(const item of digest.items)if(/^[gna]:[\w:./-]+$/.test(String(item?.key||""))){
  known.delete(item.key);
  known.set(item.key,{key:item.key,at:new Date(now).toISOString()});
 }
 return {version:1,lastReviewedAt:new Date(now).toISOString(),
  items:[...known.values()].slice(-MAX_LEDGER)};
}
export function buildContextualPriorities({
 continuity=null,archive=null,ledger=null,now=Date.now(),limit=MAX_ITEMS
}={}){
 if(!Number.isFinite(now))throw new Error("Invalid clock");
 const previous=readPriorityLedger(ledger,{now});
 const seen=new Set(previous.items.map(x=>x.key));
 const hasBaseline=Boolean(previous.lastReviewedAt);
 const world=continuity?.collection==="read-only-persisted"&&
  recent(continuity?.generatedAt,now,15*60000)&&
  ["healthy","partial"].includes(continuity?.world?.state)&&
  recent(continuity?.world?.checkedAt,now,2*HOUR)&&
  Array.isArray(continuity?.world?.highlights)?
  continuity.world:null;
 const archiveReady=archive?.ok===true&&
  recent(archive?.updatedAt,now,2*HOUR)&&
  recent(archive?.lastSuccessfulAt,now,2*HOUR)&&
  Array.isArray(archive?.events);
 const items=[];
 if(world){
  const allowed=new Set((world.sources||[]).filter(s=>s?.status==="ready").map(s=>s.name));
  for(const event of world.highlights.slice(0,20)){
   const url=trustedEventLink(event);
   if(!url||!allowed.has(event.source)||!recent(event.eventAt,now,7*DAY)||
      !clean(event.title)||!clean(event.id))continue;
   const key="g:"+keyId(event.id),brazil=event.nearBrazil===true;
   const level=event.source==="GDACS"&&["red","orange","green"].includes(event.alertLevel)?
     event.alertLevel:null;
   const isNew=hasBaseline&&!seen.has(key);
   items.push({key,type:"cataloged",title:clean(event.title),source:clean(event.source,20),
    url,publishedAt:event.eventAt,category:clean(event.kind,40),
    region:brazil?"proximidade do Brasil":"mundo",nearBrazil:brazil,
    verifiedLabel:level?"Nível GDACS publicado: "+level.toUpperCase():"Evento catalogado",
    isNew,
    // Editorial order only: never estimate severity, casualties or risk.
    order:20+(brazil?14:0)+(level==="red"?6:level==="orange"?3:0)+(isNew?8:0)});
  }
 }
 if(archiveReady){
  const alerts=archive.latest?.alerts;
  if(alerts?.checked===true&&recent(alerts.checkedAt,now,2*HOUR)){
   for(const alert of (Array.isArray(alerts.warnings)?alerts.warnings:[]).slice(0,8)){
    const url=link(alert?.url,{host:"avisos.inmet.gov.br"});
    if(!url||!clean(alert.title)||!clean(alert.severity,40)||
      (alert.endsAt&&!recentOrFuture(alert.endsAt,now))||
      (alert.startsAt&&epoch(alert.startsAt)===null))continue;
    const key="a:"+keyId(alert.id||String(alert.title)+":"+String(alert.endsAt||""));
    const regions=Array.isArray(alert.regions)?alert.regions.filter(x=>/^[A-Z]{2}$/.test(x)).slice(0,12):[];
    const pe=regions.includes("PE"),isNew=hasBaseline&&!seen.has(key);
    items.push({key,type:"official-alert",title:clean(alert.title),source:"INMET",url,
     publishedAt:alerts.checkedAt,category:"meteorologia",
     region:pe?"Pernambuco informado":regions.length?regions.join(", "):"área não informada",
     nearBrazil:false,isNew,verifiedLabel:"Aviso oficial INMET · "+clean(alert.severity,40)+
      (alert.phase==="previsto"?" · previsto":" · confira vigência e área"),
     order:35+(pe?15:0)+(isNew?8:0)});
   }
  }
  for(const event of archive.events.slice(0,180)){
   const url=link(event?.url);
   if(!url||!recent(event.publishedAt,now,DAY)||!clean(event.title)||!clean(event.id))continue;
   if(event.firstSeenAt&&!recent(event.firstSeenAt,now,DAY))continue;
   const key="n:"+keyId(event.id),category=clean(event.category,40);
   const brazil=["brasil","santa-catarina"].includes(category),climate=category==="clima";
   const isNew=hasBaseline&&!seen.has(key)&&
     (!previous.lastReviewedAt||epoch(event.firstSeenAt)>epoch(previous.lastReviewedAt));
   items.push({key,type:"news",title:clean(event.title),source:clean(event.source,70),
     url,publishedAt:event.publishedAt,category,region:brazil?"Brasil":climate?"Clima":"Mundo",
     nearBrazil:false,isNew,verifiedLabel:"Manchete publicada · "+clean(event.source,70),
     order:14+(brazil?14:climate?8:0)+(isNew?8:0)});
  }
 }
 const max=Math.max(1,Math.min(10,Math.trunc(limit)||MAX_ITEMS));
 const kindOrder={"official-alert":0,"cataloged":1,"news":2};
 const dedup=new Set();
 const ordered=items.filter(x=>{if(dedup.has(x.key))return false;dedup.add(x.key);return true;})
  .sort((a,b)=>b.order-a.order||
    (kindOrder[a.type]??9)-(kindOrder[b.type]??9)||
    (epoch(b.publishedAt)??0)-(epoch(a.publishedAt)??0));
 const chosen=[];
 for(const type of ["official-alert","cataloged","news"]){
  const item=ordered.find(x=>x.type===type&&!chosen.includes(x));
  if(item&&chosen.length<max)chosen.push(item);
 }
 for(const item of ordered){
  if(chosen.length>=max)break;
  if(!chosen.includes(item))chosen.push(item);
 }
 chosen.sort((a,b)=>b.order-a.order||(epoch(b.publishedAt)??0)-(epoch(a.publishedAt)??0));
 return {
  ok:true,version:"1.0",generatedAt:new Date(now).toISOString(),
  archiveState:archiveReady?"verified":archive?.ok===true?"stale":"unavailable",
  worldState:world?.state||continuity?.world?.state||"unavailable",
  hasBaseline,items:chosen.map(({order,...item})=>item),
  newCount:chosen.filter(x=>x.isNew).length,verifiedCount:chosen.length,
  label:"PRIORIDADES EDITORIAIS · NÃO INDICA GRAVIDADE OU RISCO",
  disclaimer:"A prioridade é contextual (novidade, Brasil, vigência e fonte), não uma previsão de impacto. Avisos INMET só indicam áreas publicadas. Eventos próximos ao Brasil não significam impacto no território."
 };
}
function recentOrFuture(value,now){
 const time=epoch(value);return time!==null&&time>=now-300000;
}
