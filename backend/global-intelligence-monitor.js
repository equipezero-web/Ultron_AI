/**
 * Global Intelligence v1 — verified public event feeds, hourly Cloudflare Cron,
 * safe D1 snapshots, per-source health, explicit uncertainty/provenance.
 * Source queries are bounded and do not scan devices/cameras or user data.
 */
export const GLOBAL_INTEL_SOURCES=Object.freeze({
 usgs:{name:"USGS",url:"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"},
 nasa:{name:"NASA EONET",url:"https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=7&limit=80"},
 gdacs:{name:"GDACS",url:"https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"}
});
const CREATE=[
 "CREATE TABLE IF NOT EXISTS jarvis_global_intelligence (bucket TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, checked_at TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS idx_jarvis_global_intelligence_checked ON jarvis_global_intelligence(checked_at DESC)"
];
const safe=(s,n=160)=>String(s??"").replace(/[<>\r\n]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const validDate=(v,now)=>{
 const d=typeof v==="number"?v:Date.parse(String(v??""));
 return Number.isFinite(d)&&d>now-15*86400000&&d<=now+300000?new Date(d).toISOString():null;
};
const safeLink=(url,hosts)=>{
 try{const x=new URL(String(url||""));return x.protocol==="https:"&&hosts.some(h=>x.hostname===h||x.hostname.endsWith("."+h))?x.href:null;}
 catch{return null;}
};
const point=(geo)=>{
 if(!geo||!["Point","MultiPoint","LineString","Polygon","MultiPolygon"].includes(geo.type))return null;
 let coords=geo.coordinates;
 for(let i=0;i<3&&Array.isArray(coords)&&Array.isArray(coords[0]);i++)coords=coords[0];
 if(!Array.isArray(coords)||coords.length<2)return null;
 const lng=Number(coords[0]),lat=Number(coords[1]);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
 return {lat,lng,representative:geo.type!=="Point"};
};
const priority=(e)=>{
 // Ranking is editorial/display priority, NEVER a predicted risk score.
 let n=e.source==="gdacs"?8:e.source==="usgs"?5:2;
 if(e.gdacsAlert==="red")n+=12;
 else if(e.gdacsAlert==="orange")n+=7;
 if(typeof e.magnitude==="number")n+=Math.max(0,e.magnitude-4)*2;
 if(e.nearBrazil)n+=4;
 return n;
};
const nearBrazil=(lat,lng)=>lat>=-34&&lat<=6&&lng>=-74&&lng<=-34;
const categoryOf=(name)=>{
 const n=safe(name,80).toLowerCase();
 if(/earthquake|sismo|^eq$/.test(n))return "earthquake";
 if(/wildfire|forest.fire|^wf$/.test(n))return "wildfires";
 if(/volcan|^vo$/.test(n))return "volcanoes";
 if(/severestorm|storm|cyclon|typhoon|hurrican|^tc$/.test(n))return "severeStorms";
 if(/flood|^fl$/.test(n))return "floods";
 if(/landslide|^ls$/.test(n))return "landslides";
 return "other";
};
const normEvent=(input)=>{
 const e={...input};
 if(!e.id||!e.title||!e.eventAt||!Number.isFinite(e.lat)||!Number.isFinite(e.lng)||!e.url)return null;
 e.nearBrazil=nearBrazil(e.lat,e.lng);
 e.priority=priority(e);
 return e;
};
export function parseUsgsEvents(payload,{now=Date.now()}={}){
 if(payload?.type!=="FeatureCollection"||!Array.isArray(payload.features))return null;
 const events=[];
 for(const feature of payload.features.slice(0,300)){
  const p=feature?.properties||{},xy=point(feature?.geometry);
  const magnitude=Number(p.mag),eventAt=validDate(p.time,now),id=safe(feature.id,80);
  if(!xy||!id||!eventAt||!Number.isFinite(magnitude)||magnitude<4.5||magnitude>10)continue;
  const url=safeLink(p.url,["earthquake.usgs.gov"]);if(!url)continue;
  const event=normEvent({id:"usgs:"+id,source:"usgs",kind:"earthquake",
   title:safe(p.title||("Sismo M"+magnitude+" · "+safe(p.place,120)),170),
   description:"Magnitude "+magnitude+". Registro sísmico USGS; não indica automaticamente vítimas, intensidade sentida ou alerta.",
   magnitude,lat:xy.lat,lng:xy.lng,eventAt,updatedAt:validDate(p.updated,now)||eventAt,
   url,gdacsAlert:null,location:safe(p.place,140),representative:xy.representative});
  if(event)events.push(event);
 }
 return events;
}
export function parseEonetEvents(payload,{now=Date.now()}={}){
 if(payload?.type!=="FeatureCollection"||!Array.isArray(payload.features))return null;
 const events=[];
 for(const feature of payload.features.slice(0,140)){
  const p=feature?.properties||{},xy=point(feature?.geometry);
  const id=safe(p.id||feature.id,80);
  const eventAt=validDate(p.date||p.geometryDates?.at?.(-1)||feature.properties?.date,now);
  const categories=(Array.isArray(p.categories)?p.categories:[]).map(c=>typeof c==="string"?c:c?.id||c?.title||"");
  const kind=categoryOf(categories.join(" "));
  if(!xy||!id||!eventAt||kind==="other")continue;
  const url=safeLink(p.link,["eonet.gsfc.nasa.gov"])||
      "https://eonet.gsfc.nasa.gov/api/v3/events/"+encodeURIComponent(id);
  const event=normEvent({id:"nasa:"+id,source:"nasa",kind,
   title:safe(p.title||"Evento natural reportado",170),
   description:"Evento catalogado na NASA EONET. Localização pontual ou representativa; a categoria não indica gravidade.",
   lat:xy.lat,lng:xy.lng,eventAt,updatedAt:eventAt,url,gdacsAlert:null,
   location:safe(p.title,140),representative:xy.representative});
  if(event)events.push(event);
 }
 return events;
}
export function parseGdacsEvents(payload,{now=Date.now()}={}){
 if(payload?.type!=="FeatureCollection"||!Array.isArray(payload.features))return null;
 const events=[];
 for(const feature of payload.features.slice(0,150)){
  const p=feature?.properties||{},xy=point(feature?.geometry);
  const id=safe(p.eventid??p.eventId??p.id??feature.id,80);
  const type=safe(p.eventtype??p.eventType??p.type??"",30);
  const kind=categoryOf(type);
  const eventAt=validDate(p.fromdate??p.fromDate??p.date??p.pubDate,now);
  const gdacsAlert=safe(p.alertlevel??p.alertLevel,15).toLowerCase();
  if(!xy||!id||!eventAt||kind==="other")continue;
  const url=safeLink(p.url??p.link,["gdacs.org"])||
    "https://www.gdacs.org/report.aspx?eventid="+encodeURIComponent(id)+
    "&eventtype="+encodeURIComponent(type);
  const title=safe(p.name??p.title??p.eventname??(type+" · "+id),170);
  const event=normEvent({id:"gdacs:"+type+":"+id,source:"gdacs",kind,title,
    description:"Alerta humanitário GDACS. Nível publicado: "+
      (["red","orange","green"].includes(gdacsAlert)?gdacsAlert:"não informado")+
      ". Validade, evolução e população afetada devem ser verificadas na fonte.",
    lat:xy.lat,lng:xy.lng,eventAt,updatedAt:eventAt,url,
    gdacsAlert:["red","orange","green"].includes(gdacsAlert)?gdacsAlert:null,
    location:safe(p.country||p.eventname||"",110),representative:xy.representative});
  if(event)events.push(event);
 }
 return events;
}
export function globalIntelWindow(now=Date.now()){
 const end=new Date(now),start=new Date(now-7*86400000);
 return {fromdate:start.toISOString().slice(0,10),todate:end.toISOString().slice(0,10)};
}
export function globalIntelFetchList(now=Date.now()){
 const gdacs=new URL(GLOBAL_INTEL_SOURCES.gdacs.url),dates=globalIntelWindow(now);
 for(const [k,v] of Object.entries({eventlist:"EQ;TC;FL",...dates,alertlevel:"red;orange;green"}))
  gdacs.searchParams.set(k,v);
 return [
  ["usgs",GLOBAL_INTEL_SOURCES.usgs.url,parseUsgsEvents],
  ["nasa",GLOBAL_INTEL_SOURCES.nasa.url,parseEonetEvents],
  ["gdacs",gdacs.toString(),parseGdacsEvents]
 ];
}
export async function collectGlobalIntelligence({fetchImpl=fetch,now=()=>Date.now()}={}){
 const checkedAt=new Date(now()).toISOString();
 const tasks=globalIntelFetchList(now());
 const output=await Promise.all(tasks.map(async([source,url,parser])=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
  try{
   const res=await fetchImpl(url,{signal:controller.signal,headers:{Accept:"application/geo+json, application/json"},cache:"no-store"});
   if(!res?.ok)throw Error("HTTP "+(res?.status??"indisponível"));
   const events=parser(await res.json(),{now:now()});
   if(!events)throw Error("Formato geográfico inválido");
   return {source,ok:true,events,status:{source,ok:true,count:events.length,url:GLOBAL_INTEL_SOURCES[source].url}};
  }catch(error){return {source,ok:false,events:[],
    status:{source,ok:false,count:0,url:GLOBAL_INTEL_SOURCES[source].url,
      error:safe(error?.message||error,130)}};}
  finally{clearTimeout(timer);}
 }));
 const sourceStatus=output.map(x=>x.status),successful=output.filter(x=>x.ok);
 if(!successful.length)return {ok:false,status:503,checkedAt,sourceStatus,
    error:"Nenhuma fonte mundial forneceu dados válidos. Não há acontecimentos confirmados nesta coleta."};
 const seen=new Set(),events=[];
 for(const e of output.flatMap(o=>o.events)){
  if(seen.has(e.id))continue;seen.add(e.id);events.push(e);
 }
 events.sort((a,b)=>b.priority-a.priority||Date.parse(b.eventAt)-Date.parse(a.eventAt));
 return {ok:true,checkedAt,partial:successful.length!==output.length,
  coverage:"Eventos publicados nas fontes consultadas. Não é vigilância integral do planeta.",
  sourceStatus,eventCount:events.length,events:events.slice(0,110),
  disclaimer:"USGS, NASA EONET e GDACS possuem coberturas e critérios diferentes. Ordenação é de exibição, não uma previsão de risco, número de vítimas ou gravidade calculada."};
}
let schemaReady=false;
const prepare=async(db)=>{
 if(!db?.prepare)return false;
 if(!schemaReady){for(const query of CREATE)await db.prepare(query).run();schemaReady=true;}
 return true;
};
const bucketOf=date=>date.toISOString().slice(0,13)+":00Z";
export async function pollGlobalIntelligence(env,{now=()=>new Date(),fetchImpl=fetch,force=false}={}){
 const date=now();
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return {ok:false,error:"Relógio inválido"};
 // Scheduled by an existing every-minute Worker Cron; only one hourly snapshot.
 if(!force&&date.getUTCMinutes()>6)return {ok:true,skipped:true,reason:"outside-hourly-window"};
 const db=env?.ULTRON_DB;
 try{if(!await prepare(db))return {ok:false,error:"D1 não disponível"};
  const bucket=bucketOf(date);
  if(!force){
   const exists=await db.prepare("SELECT bucket FROM jarvis_global_intelligence WHERE bucket = ? LIMIT 1").bind(bucket).first();
   if(exists)return {ok:true,skipped:true,reason:"bucket-already-collected",bucket};
  }
  const report=await collectGlobalIntelligence({fetchImpl,now:()=>date.getTime()});
  if(!report.ok)return report;
  await db.prepare("INSERT OR IGNORE INTO jarvis_global_intelligence (bucket,snapshot_json,checked_at) VALUES (?,?,?)")
   .bind(bucket,JSON.stringify(report),report.checkedAt).run();
  const cutoff=new Date(date.getTime()-14*86400000).toISOString();
  try{await db.prepare("DELETE FROM jarvis_global_intelligence WHERE checked_at < ?").bind(cutoff).run();}catch{}
  return {ok:true,bucket,checkedAt:report.checkedAt,eventCount:report.eventCount,
     partial:report.partial,sourceStatus:report.sourceStatus};
 }catch(e){return {ok:false,error:"Não foi possível armazenar o monitoramento mundial: "+safe(e?.message,120)};}
}
export async function latestGlobalIntelligence(env,{now=()=>Date.now()}={}){
 const db=env?.ULTRON_DB;
 try{
  if(!await prepare(db))return {ok:false,status:503,error:"Monitor mundial ainda não configurado no D1"};
  const row=await db.prepare("SELECT snapshot_json,checked_at FROM jarvis_global_intelligence ORDER BY checked_at DESC LIMIT 1").first();
  if(!row)return {ok:false,status:503,error:"Ainda não existe coleta mundial armazenada. O próximo ciclo automático tentará coletar."};
  const data=JSON.parse(row.snapshot_json);
  if(!data?.ok||!Array.isArray(data.events)||!Array.isArray(data.sourceStatus))throw Error("Snapshot inválido");
  const ageMs=now()-Date.parse(data.checkedAt);
  if(!Number.isFinite(ageMs)||ageMs< -300000)throw Error("Horário de coleta inválido");
  return {...data,stale:ageMs>2*3600000,ageMinutes:Math.max(0,Math.round(ageMs/60000)),
   persistence:"cloudflare-d1",cadenceHours:1};
 }catch(e){return {ok:false,status:503,error:"Inteligência global indisponível: "+safe(e?.message,100)};}
}
