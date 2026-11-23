/**
 * NASA FIRMS VIIRS NOAA-20 NRT (Brazil) — read-only, server-only MAP_KEY.
 * These are thermal anomaly detections, NOT confirmed wildfires or risk alerts.
 * No secret-bearing request URL is ever returned, persisted or logged.
 */
const SOURCE="VIIRS_NOAA20_NRT";
const REGION="-74,-34,-34,6"; // approximate Brazil box, includes neighboring territory
const PUBLIC_URL="https://firms.modaps.eosdis.nasa.gov/";
const HALF_HOUR=30*60*1000;
const MAX_BYTES=3_000_000;
const MAX_ROWS=18000;
const MAX_POINTS=150;
const TABLE="jarvis_firms_snapshot";
const scrub=e=>String(e?.message||e||"unavailable").replace(/https?:\/\/\S+/g,"[NASA FIRMS]").replace(/[\r\n<>]/g," ").slice(0,100);

export function parseFirmsCsv(csv,{now=Date.now()}={}){
 if(typeof csv!=="string"||csv.length>MAX_BYTES)throw Error("FIRMS CSV too large");
 const lines=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/);
 if(lines.length<1)throw Error("Empty FIRMS feed");
 const header=lines.shift().split(",").map(x=>x.trim().replace(/^"|"$/g,"").toLowerCase());
 const idx=name=>header.indexOf(name);
 const required=["latitude","longitude","acq_date","acq_time","satellite"];
 if(required.some(c=>idx(c)<0))throw Error("FIRMS CSV schema unavailable");
 const events=[];let accepted=0,discarded=0;
 const rows=lines.slice(0,MAX_ROWS);
 for(const line of rows){
  // Quoted commas can occur in optional metadata; required numeric/date fields
  // and satellite identifiers are parsed from stable FIRMS CSV columns.
  const c=line.split(",");
  const lat=Number(c[idx("latitude")]),lng=Number(c[idx("longitude")]);
  const date=String(c[idx("acq_date")]||"").trim();
  const hhmm=String(c[idx("acq_time")]||"").trim().padStart(4,"0");
  const observedAt=/^\d{4}-\d\d-\d\d$/.test(date)&&/^\d{4}$/.test(hhmm)?
   date+"T"+hhmm.slice(0,2)+":"+hhmm.slice(2)+":00Z":null;
  const ts=observedAt?Date.parse(observedAt):NaN;
  const frp=idx("frp")>=0&&c[idx("frp")]?.trim()!==""?Number(c[idx("frp")]):null;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180||
    !Number.isFinite(ts)||ts>now+300000||ts<now-3*86400000){discarded++;continue;}
  accepted++;
  if(events.length>=MAX_POINTS)continue;
  const satellite=String(c[idx("satellite")]||"").replace(/[^\w -]/g,"").slice(0,35);
  events.push({
   id:"firms:"+date+":"+hhmm+":"+lat.toFixed(4)+":"+lng.toFixed(4),
   source:"firms",kind:"heatDetection",title:"Foco de calor detectado por satélite",
   description:"Anomalia térmica detectada por VIIRS. Não confirma incêndio, dano ou risco local.",
   lat,lng,eventAt:observedAt,updatedAt:observedAt,url:PUBLIC_URL,
   representative:false,nearBrazil:lat>=-34&&lat<=6&&lng>=-74&&lng<=-34,
   satellite,frp:Number.isFinite(frp)&&frp>=0?frp:null
  });
 }
 return {events,receivedCount:lines.length,acceptedCount:accepted,
  discardedCount:discarded,scanTruncated:lines.length>MAX_ROWS,
  displayLimited:accepted>MAX_POINTS};
}

export async function collectFirms(env,{fetchImpl=fetch,now=()=>Date.now()}={}){
 const key=String(env?.NASA_FIRMS_MAP_KEY||"").trim();
 const checkedAt=new Date(now()).toISOString();
 if(!key)return {ok:false,configured:false,checkedAt,error:"NASA FIRMS MAP_KEY não configurada"};
 // Key only exists in an outbound backend request; never save or log this URL.
 const url="https://firms.modaps.eosdis.nasa.gov/api/area/csv/"+
  encodeURIComponent(key)+"/"+SOURCE+"/"+REGION+"/1";
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const res=await fetchImpl(url,{signal:controller.signal,redirect:"error",cache:"no-store",
   headers:{Accept:"text/csv"}});
  if(!res.ok)throw Error("NASA FIRMS HTTP "+res.status);
  const declared=Number(res.headers?.get?.("content-length")||0);
  if(declared>MAX_BYTES)throw Error("NASA FIRMS payload too large");
  const raw=await res.text();
  const parsed=parseFirmsCsv(raw,{now:now()});
  return {ok:true,configured:true,checkedAt,source:"NASA FIRMS",sensor:SOURCE,
   region:"Brazil approximate bounding box",coverage:"Brazil bbox; not a country border or worldwide coverage",
   disclaimer:"Satélite detecta anomalias térmicas; não confirma incêndio ou perigo para pessoas.",
   ...parsed};
 }catch(error){return {ok:false,configured:true,checkedAt,error:scrub(error)};}
 finally{clearTimeout(timer);}
}
async function prepare(db){
 if(!db?.prepare)return false;
 await db.prepare("CREATE TABLE IF NOT EXISTS "+TABLE+
  " (bucket TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, checked_at TEXT NOT NULL)").run();
 return true;
}
export async function pollFirms(env,{now=()=>Date.now(),fetchImpl=fetch}={}){
 if(!env?.NASA_FIRMS_MAP_KEY)return {ok:false,configured:false,error:"NASA FIRMS MAP_KEY não configurada"};
 const db=env?.ULTRON_DB;
 try{
  if(!await prepare(db))return {ok:false,error:"D1 indisponível"};
  const ts=now(),bucket=new Date(Math.floor(ts/HALF_HOUR)*HALF_HOUR).toISOString();
  const existing=await db.prepare("SELECT snapshot_json FROM "+TABLE+" WHERE bucket = ?").bind(bucket).first();
  if(existing)return {ok:true,skipped:true,bucket};
  // Cron executes each minute: keep FIRMS collection at two calls per hour.
  const report=await collectFirms(env,{fetchImpl,now:()=>ts});
  if(!report.ok)return {ok:false,configured:report.configured,error:report.error,bucket};
  await db.prepare("INSERT OR IGNORE INTO "+TABLE+
   " (bucket,snapshot_json,checked_at) VALUES (?,?,?)")
   .bind(bucket,JSON.stringify(report),report.checkedAt).run();
  return {ok:true,bucket,checkedAt:report.checkedAt,acceptedCount:report.acceptedCount};
 }catch(error){return {ok:false,error:scrub(error)};}
}
export async function latestFirms(env,{now=()=>Date.now()}={}){
 if(!env?.NASA_FIRMS_MAP_KEY)return {ok:false,configured:false,error:"NASA FIRMS MAP_KEY não configurada"};
 try{
  if(!await prepare(env?.ULTRON_DB))return {ok:false,configured:true,error:"D1 indisponível"};
  const row=await env.ULTRON_DB.prepare("SELECT snapshot_json FROM "+TABLE+
   " ORDER BY checked_at DESC LIMIT 1").first();
  if(!row)return {ok:false,configured:true,error:"Aguardando primeira coleta programada"};
  const report=JSON.parse(row.snapshot_json),age=now()-Date.parse(report.checkedAt);
  if(!report?.ok||!Array.isArray(report.events)||!Number.isFinite(age)||age< -300000)
   return {ok:false,configured:true,error:"Snapshot NASA FIRMS inválido"};
  return {...report,stale:age>90*60000,ageMinutes:Math.max(0,Math.round(age/60000)),
   persistence:"cloudflare-d1",cadenceMinutes:30};
 }catch(error){return {ok:false,configured:true,error:scrub(error)};}
}
